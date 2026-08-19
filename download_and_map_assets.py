import os
import re
import json
import csv
import ssl
import time
import shutil
import hashlib
import mimetypes
import unicodedata
import random
from urllib.parse import urlparse, unquote
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

def slugify(text):
    if not text:
        return "untitled"
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ascii', 'ignore').decode('utf-8')
    text = text.replace('&', ' and ')
    text = text.replace('+', ' plus ')
    text = text.replace('/', ' ')
    text = re.sub(r'[^a-zA-Z0-9]+', '-', text)
    text = text.strip('-').lower()
    return text or "untitled"

def fix_and_clean_url(url):
    url = url.strip()
    
    # 1. GitHub blob -> raw.githubusercontent.com
    match = re.match(r'https?://github\.com/([^/]+)/([^/]+)/blob/(.+)', url)
    if match:
        user, repo, rest = match.groups()
        rest = rest.split('?')[0]
        url = f"https://raw.githubusercontent.com/{user}/{repo}/{rest}"
        
    # 2. TMDB media.themoviedb.org -> image.tmdb.org
    if 'media.themoviedb.org' in url:
        # Extract filename like 8bH86UPmMP8hlITzXV3XgV9eaAc.png
        filename = url.split('/')[-1]
        url = f"https://image.tmdb.org/t/p/original/{filename}"
        
    # 3. TLC 404 backdrop fix (84-discovery -> 4353-discovery)
    if '84-discovery/backdrops/t2_flat_1080p.jpg' in url:
        url = 'https://raw.githubusercontent.com/bramst0ne/prism-wallpapers/main/collections/networks/4353-discovery/backdrops/t2_flat_1080p.jpg'
        
    # 4. Strip cache-busting query strings on wikimedia
    if 'upload.wikimedia.org' in url and '?' in url:
        url = url.split('?')[0]
        
    return url

def detect_extension(content, original_url, content_type=None):
    if not content:
        return ".png"
    
    # 1. Magic bytes check
    if content.startswith(b'\x89PNG\r\n\x1a\n'):
        return ".png"
    elif content.startswith(b'\xff\xd8\xff'):
        return ".jpg"
    elif content.startswith(b'GIF87a') or content.startswith(b'GIF89a'):
        return ".gif"
    elif content.startswith(b'RIFF') and b'WEBP' in content[8:16]:
        return ".webp"
    elif content.startswith(b'BM'):
        return ".bmp"
    elif b'<svg' in content[:500].lower() or b'<?xml' in content[:100].lower():
        return ".svg"
    elif content[4:8] == b'ftyp':
        return ".mp4"
        
    # 2. Content-Type check
    if content_type:
        ct = content_type.split(';')[0].strip().lower()
        ct_map = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/svg+xml': '.svg',
            'video/mp4': '.mp4',
            'video/webm': '.webm'
        }
        if ct in ct_map:
            return ct_map[ct]
            
    # 3. URL path extension check
    path = urlparse(original_url).path
    ext = os.path.splitext(path)[1].lower()
    if ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp4']:
        return '.jpg' if ext == '.jpeg' else ext
    if ext == '.gifv':
        return '.gif'
        
    return ".png"

def get_role_name(field_name):
    role_map = {
        'coverImageUrl': 'cover',
        'titleLogoUrl': 'logo',
        'focusGifUrl': 'hover',
        'heroBackdropUrl': 'backdrop',
        'backdropImageUrl': 'backdrop',
        'heroVideoUrl': 'hero-video'
    }
    return role_map.get(field_name, field_name)

def download_file(url, ssl_context, default_headers, max_retries=5):
    target_url = fix_and_clean_url(url)
    err = None
    
    headers = dict(default_headers)
    if 'wikimedia.org' in target_url:
        headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 NuvioAssetDownloader/1.0 (contact: admin@nuvio.app)'
        
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(target_url, headers=headers)
            with urllib.request.urlopen(req, context=ssl_context, timeout=25) as resp:
                if resp.status == 200:
                    content = resp.read()
                    content_type = resp.headers.get('Content-Type')
                    return True, content, content_type, None
                else:
                    err = f"HTTP status {resp.status}"
        except urllib.error.HTTPError as e:
            err = f"HTTP {e.code}: {e.reason}"
            if e.code == 429:
                sleep_time = 2.0 * attempt + random.uniform(0.5, 1.5)
                time.sleep(sleep_time)
                continue
            elif e.code in [500, 502, 503, 504]:
                time.sleep(1.0 * attempt)
                continue
            else:
                break
        except Exception as e:
            err = str(e)
            time.sleep(1.0 * attempt + random.uniform(0.2, 0.8))
            
    return False, None, None, err

def main():
    base_dir = "/home/duckq1u/Documents/docker-volumes/films"
    input_file = os.path.join(base_dir, "collections_input_full.json")
    output_assets_dir = os.path.join(base_dir, "cloudflare_assets")
    output_flat_dir = os.path.join(base_dir, "cloudflare_assets_flat")
    os.makedirs(output_assets_dir, exist_ok=True)
    os.makedirs(output_flat_dir, exist_ok=True)
    
    with open(input_file, 'r', encoding='utf-8') as f:
        collections = json.load(f)
        
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }
    
    tasks = []
    image_fields = ['coverImageUrl', 'titleLogoUrl', 'focusGifUrl', 'heroBackdropUrl', 'backdropImageUrl', 'heroVideoUrl']
    
    for c_idx, collection in enumerate(collections):
        c_id = collection.get('id', f'col-{c_idx}')
        c_title = collection.get('title', f'Collection {c_idx}')
        c_slug = slugify(c_title)
        
        for field in ['backdropImageUrl']:
            val = collection.get(field)
            if val and isinstance(val, str) and val.strip().startswith(('http://', 'https://')):
                role = get_role_name(field)
                tasks.append({
                    'type': 'collection',
                    'collection_id': c_id,
                    'collection_title': c_title,
                    'collection_slug': c_slug,
                    'folder_id': None,
                    'folder_title': None,
                    'folder_slug': None,
                    'field': field,
                    'role': role,
                    'url': val.strip(),
                    'c_idx': c_idx,
                    'f_idx': None
                })
        
        for f_idx, folder in enumerate(collection.get('folders', [])):
            f_id = folder.get('id', f'folder-{f_idx}')
            f_title = folder.get('title', f'Folder {f_idx}')
            f_slug = slugify(f_title)
            
            for field in image_fields:
                val = folder.get(field)
                if val and isinstance(val, str) and val.strip().startswith(('http://', 'https://')):
                    role = get_role_name(field)
                    tasks.append({
                        'type': 'folder',
                        'collection_id': c_id,
                        'collection_title': c_title,
                        'collection_slug': c_slug,
                        'folder_id': f_id,
                        'folder_title': f_title,
                        'folder_slug': f_slug,
                        'field': field,
                        'role': role,
                        'url': val.strip(),
                        'c_idx': c_idx,
                        'f_idx': f_idx
                    })
                    
    print(f"Found {len(tasks)} image references across {len(collections)} collections.")
    
    unique_urls = {}
    for t in tasks:
        u = t['url']
        if u not in unique_urls:
            unique_urls[u] = []
        unique_urls[u].append(t)
        
    print(f"Total unique URLs to download: {len(unique_urls)}")
    
    download_results = {}
    print("Starting controlled concurrent download (max 8 workers)...")
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        future_to_url = {
            executor.submit(download_file, url, ctx, headers): url 
            for url in unique_urls.keys()
        }
        
        completed_count = 0
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            completed_count += 1
            success, content, ct, err = future.result()
            download_results[url] = {
                'success': success,
                'content': content,
                'content_type': ct,
                'error': err
            }
            if completed_count % 20 == 0 or completed_count == len(unique_urls):
                print(f"Progress: {completed_count}/{len(unique_urls)} downloaded.")
                
    mapping_records = []
    failed_items = []
    
    updated_collections = json.loads(json.dumps(collections))
    
    for task in tasks:
        url = task['url']
        res = download_results.get(url, {})
        
        if res.get('success') and res.get('content'):
            content = res['content']
            ext = detect_extension(content, url, res.get('content_type'))
            
            if task['type'] == 'collection':
                rel_dir = task['collection_slug']
                filename = f"{task['role']}{ext}"
                flat_filename = f"{task['collection_slug']}__{task['role']}{ext}"
            else:
                rel_dir = os.path.join(task['collection_slug'], task['folder_slug'])
                filename = f"{task['role']}{ext}"
                flat_filename = f"{task['collection_slug']}__{task['folder_slug']}__{task['role']}{ext}"
                
            # 1. Structured hierarchy
            dest_dir = os.path.join(output_assets_dir, rel_dir)
            os.makedirs(dest_dir, exist_ok=True)
            dest_path = os.path.join(dest_dir, filename)
            rel_file_path = os.path.join(rel_dir, filename).replace('\\', '/')
            
            with open(dest_path, 'wb') as img_f:
                img_f.write(content)
                
            # 2. Flat format copy
            flat_dest_path = os.path.join(output_flat_dir, flat_filename)
            with open(flat_dest_path, 'wb') as flat_f:
                flat_f.write(content)
                
            file_size = len(content)
            sha256 = hashlib.sha256(content).hexdigest()
            
            cf_url = f"https://<YOUR_CLOUDFLARE_DOMAIN>/{rel_file_path}"
            
            c_idx = task['c_idx']
            f_idx = task['f_idx']
            field = task['field']
            
            if task['type'] == 'collection':
                updated_collections[c_idx][field] = cf_url
            else:
                updated_collections[c_idx]['folders'][f_idx][field] = cf_url
                
            mapping_records.append({
                'collection_id': task['collection_id'],
                'collection_title': task['collection_title'],
                'folder_id': task['folder_id'] or '',
                'folder_title': task['folder_title'] or '',
                'field': task['field'],
                'role': task['role'],
                'original_url': url,
                'relative_path': rel_file_path,
                'flat_filename': flat_filename,
                'cloudflare_url_template': cf_url,
                'file_size_bytes': file_size,
                'file_size_kb': round(file_size / 1024, 2),
                'sha256': sha256,
                'status': 'SUCCESS'
            })
        else:
            err = res.get('error', 'Unknown error')
            failed_items.append({
                'task': task,
                'error': err
            })
            mapping_records.append({
                'collection_id': task['collection_id'],
                'collection_title': task['collection_title'],
                'folder_id': task['folder_id'] or '',
                'folder_title': task['folder_title'] or '',
                'field': task['field'],
                'role': task['role'],
                'original_url': url,
                'relative_path': '',
                'flat_filename': '',
                'cloudflare_url_template': '',
                'file_size_bytes': 0,
                'file_size_kb': 0,
                'sha256': '',
                'status': f'FAILED: {err}'
            })

    mapping_json_path = os.path.join(base_dir, "assets_mapping.json")
    with open(mapping_json_path, 'w', encoding='utf-8') as f:
        json.dump(mapping_records, f, ensure_ascii=False, indent=2)
        
    mapping_csv_path = os.path.join(base_dir, "assets_mapping.csv")
    with open(mapping_csv_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = [
            'collection_title', 'folder_title', 'field', 'role', 
            'relative_path', 'flat_filename', 'file_size_kb', 'original_url', 
            'cloudflare_url_template', 'status'
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for rec in mapping_records:
            writer.writerow(rec)
            
    updated_json_path = os.path.join(base_dir, "collections_cloudflare_ready.json")
    with open(updated_json_path, 'w', encoding='utf-8') as f:
        json.dump(updated_collections, f, ensure_ascii=False, indent=2)
        
    rel_collections = json.loads(json.dumps(updated_collections))
    for c in rel_collections:
        if c.get('backdropImageUrl') and '<YOUR_CLOUDFLARE_DOMAIN>' in c.get('backdropImageUrl'):
            c['backdropImageUrl'] = c['backdropImageUrl'].replace('https://<YOUR_CLOUDFLARE_DOMAIN>/', '/')
        for f in c.get('folders', []):
            for field in image_fields:
                v = f.get(field)
                if v and '<YOUR_CLOUDFLARE_DOMAIN>' in v:
                    f[field] = v.replace('https://<YOUR_CLOUDFLARE_DOMAIN>/', '/')
                    
    rel_json_path = os.path.join(base_dir, "collections_relative_paths.json")
    with open(rel_json_path, 'w', encoding='utf-8') as f:
        json.dump(rel_collections, f, ensure_ascii=False, indent=2)
        
    print(f"\n==========================================")
    print(f"DOWNLOAD & MAPPING SUMMARY")
    print(f"==========================================")
    print(f"Total references: {len(tasks)}")
    print(f"Total unique URLs: {len(unique_urls)}")
    print(f"Success: {len(tasks) - len(failed_items)} ({100 * (len(tasks) - len(failed_items)) / len(tasks):.1f}%)")
    print(f"Failed: {len(failed_items)}")
    if failed_items:
        print("Failed details:")
        for fi in failed_items:
            print(f"- {fi['task']['collection_title']} > {fi['task']['folder_title']} > {fi['task']['field']}: {fi['task']['url']} ({fi['error']})")
    print(f"Assets directory (Structured): {output_assets_dir}")
    print(f"Assets directory (Flat): {output_flat_dir}")
    print(f"Mapping JSON: {mapping_json_path}")
    print(f"Mapping CSV: {mapping_csv_path}")
    print(f"Updated Collection JSON (Cloudflare): {updated_json_path}")
    print(f"Updated Collection JSON (Relative): {rel_json_path}")

if __name__ == "__main__":
    main()
