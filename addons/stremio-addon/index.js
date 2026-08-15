require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const manifest = require('./manifest');
const api = require('./api');

const app = express();
const PORT = process.env.PORT || 7000;
const SEARCH_LIMIT = parseInt(process.env.SEARCH_LIMIT) || 1000;
const CINEMETA_URL = 'https://v3-cinemeta.strem.io';

// In-memory cache for Cinemeta lookups (TTL 12h)
const cinemetaCache = new Map();
const CINEMETA_CACHE_TTL = 12 * 60 * 60 * 1000;

async function getCinemetaMeta(type, id) {
  const parts = id.split(':');
  const mainId = parts[0];
  const cacheKey = `${type}:${mainId}`;

  if (cinemetaCache.has(cacheKey)) {
    const cached = cinemetaCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CINEMETA_CACHE_TTL) {
      return cached.data;
    }
  }

  try {
    const metaType = type === 'series' ? 'series' : 'movie';
    const res = await fetch(`${CINEMETA_URL}/meta/${metaType}/${mainId}.json`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.meta) {
        const result = {
          name: data.meta.name,
          year: data.meta.year ? parseInt(String(data.meta.year).split('-')[0], 10) : undefined
        };
        cinemetaCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  } catch (err) {
    console.warn(`[Cinemeta] Lookup failed for ${id}:`, err.message);
  }

  return { name: '', year: undefined };
}

// Enable CORS for Stremio client
app.use(cors());

// Serve static landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

// Serve manifest.json
app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

// Helper to determine if an API item is a series
const isSeriesType = (itemType) => {
  return itemType === 'series' || itemType === 'tvshows';
};

// Handle catalog routing
const handleCatalog = async (req, res) => {
  const { type, id, extra } = req.params;

  console.log(`[Catalog] Request - Type: ${type}, ID: ${id}, Extra: ${extra || 'none'}`);

  // Validate catalog ID
  const validIds = ['kkphim-movies', 'kkphim-series'];
  if (!validIds.includes(id)) {
    return res.status(404).json({ err: 'Invalid catalog ID' });
  }

  // Parse extra arguments
  let search = null;
  let skip = 0;
  if (extra) {
    const cleanExtra = extra.replace(/\.json$/, '');
    const params = new URLSearchParams(cleanExtra);
    search = params.get('search');
    const skipVal = parseInt(params.get('skip'));
    if (!isNaN(skipVal)) {
      skip = skipVal;
    }
  }

  try {
    let items = [];
    let cdnDomain = 'https://phimimg.com';

    if (search) {
      // User is searching KKPhim
      const searchRes = await api.searchMovies(search, 1, SEARCH_LIMIT);

      if (searchRes && searchRes.status === 'success' && searchRes.data) {
        cdnDomain = searchRes.data.APP_DOMAIN_CDN_IMAGE || cdnDomain;
        const rawItems = searchRes.data.items || [];
        items = rawItems.filter(item => {
          const isSeries = isSeriesType(item.type);
          return type === 'series' ? isSeries : !isSeries;
        });
      }
    } else {
      // Browsing standard catalog lists
      const limit = 20;
      const page = Math.floor(skip / limit) + 1;
      const listRes = await api.getMoviesList(type, page, limit);

      if (listRes && listRes.status === true && listRes.data) {
        cdnDomain = listRes.data.APP_DOMAIN_CDN_IMAGE || cdnDomain;
        items = listRes.data.items || [];
      }
    }

    // Map to Stremio Meta preview format (converting to IMDb ID whenever available)
    const metas = items.map(item => {
      const isSeries = isSeriesType(item.type);
      
      // Clean and use IMDb ID if present so Stremio links with Cinemeta & Torrent sources
      let metaId = `kkphim:${item.slug}`;
      if (item.imdb?.id && typeof item.imdb.id === 'string') {
        const cleanImdb = item.imdb.id.trim();
        if (cleanImdb.startsWith('tt') || /^\d+$/.test(cleanImdb)) {
          metaId = cleanImdb.startsWith('tt') ? cleanImdb : `tt${cleanImdb}`;
        }
      }

      return {
        id: metaId,
        type: isSeries ? 'series' : 'movie',
        name: item.name,
        poster: api.getAbsoluteUrl(item.poster_url, cdnDomain),
        background: api.getAbsoluteUrl(item.thumb_url, cdnDomain),
        releaseInfo: item.year ? String(item.year) : undefined,
        description: item.origin_name ? `(${item.origin_name})` : undefined
      };
    });

    res.json({ metas });
  } catch (err) {
    console.error('Error handling catalog:', err);
    res.status(500).json({ err: 'Internal Server Error' });
  }
};

// Register catalog endpoints
app.get('/catalog/:type/:id.json', handleCatalog);
app.get('/catalog/:type/:id/:extra', handleCatalog);

// Handle meta details routing
app.get('/meta/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  console.log(`[Meta] Request - Type: ${type}, ID: ${id}`);

  try {
    let detailsRes = null;

    if (id.startsWith('tt')) {
      // Lookup by IMDb ID
      const parts = id.split(':');
      const imdbId = parts[0];
      const cinemeta = await getCinemetaMeta(type, imdbId);
      detailsRes = await api.findMovieByImdbOrTitle({
        imdbId,
        title: cinemeta.name,
        year: cinemeta.year
      });
    } else {
      // Lookup by slug (kkphim:slug or phimapi:slug)
      const parts = id.split(':');
      const slug = parts[1] || parts[0];
      detailsRes = await api.getMovieDetails(slug);
    }

    if (!detailsRes || detailsRes.status !== 'success' || !detailsRes.data || !detailsRes.data.item) {
      return res.status(404).json({ err: 'Movie not found' });
    }

    const item = detailsRes.data.item;
    const cdnDomain = detailsRes.data.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';

    // Preferred Meta ID: IMDb ID if available, otherwise kkphim:${slug}
    let metaId = id;
    if (!metaId.startsWith('tt') && item.imdb?.id) {
      metaId = item.imdb.id.startsWith('tt') ? item.imdb.id : `tt${item.imdb.id}`;
    }

    const meta = {
      id: metaId,
      type: type,
      name: item.name,
      description: item.content ? item.content.replace(/<[^>]*>/g, '').trim() : '',
      poster: api.getAbsoluteUrl(item.poster_url, cdnDomain),
      background: api.getAbsoluteUrl(item.thumb_url, cdnDomain),
      releaseInfo: item.year ? String(item.year) : undefined,
      genres: item.category ? item.category.map(c => c.name) : [],
      cast: item.actor || [],
      director: item.director || []
    };

    // If series, populate episodes list (videos)
    if (type === 'series' && item.episodes && item.episodes.length > 0) {
      meta.videos = [];
      let bestServer = item.episodes[0];
      for (const server of item.episodes) {
        if (server.server_data && server.server_data.length > bestServer.server_data.length) {
          bestServer = server;
        }
      }

      if (bestServer && bestServer.server_data) {
        bestServer.server_data.forEach((ep, index) => {
          meta.videos.push({
            id: metaId.startsWith('tt') ? `${metaId}:1:${index + 1}` : `kkphim:${item.slug}:1:${index + 1}`,
            title: ep.name || `Tập ${index + 1}`,
            season: 1,
            episode: index + 1,
            released: new Date(item.modified?.time || Date.now()).toISOString()
          });
        });
      }
    }

    res.json({ meta });
  } catch (err) {
    console.error('Error handling meta:', err);
    res.status(500).json({ err: 'Internal Server Error' });
  }
});

// Handle stream routing
app.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  console.log(`[Stream] Request - Type: ${type}, ID: ${id}`);

  let detailsRes = null;
  let episode = 1;

  try {
    if (id.startsWith('tt')) {
      // IMDb ID request format: tt1234567 or tt1234567:1:5
      const parts = id.split(':');
      const imdbId = parts[0];
      episode = parts[2] ? parseInt(parts[2], 10) : 1;

      const cinemeta = await getCinemetaMeta(type, imdbId);
      detailsRes = await api.findMovieByImdbOrTitle({
        imdbId,
        title: cinemeta.name,
        year: cinemeta.year
      });
    } else {
      // Custom format: kkphim:{slug} or phimapi:{slug}:{season}:{episode}
      const parts = id.split(':');
      const slug = parts[1] || parts[0];
      episode = parts[3] ? parseInt(parts[3], 10) : 1;
      detailsRes = await api.getMovieDetails(slug);
    }

    if (!detailsRes || detailsRes.status !== 'success' || !detailsRes.data || !detailsRes.data.item) {
      return res.json({ streams: [] });
    }

    const item = detailsRes.data.item;
    const streams = [];

    if (item.episodes && item.episodes.length > 0) {
      const targetIndex = type === 'series' && episode ? episode - 1 : 0;
      const host = req.get('x-forwarded-host') || req.get('host');
      const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
      const baseUrl = `${proto}://${host}`;
      const seenUrls = new Set();

      item.episodes.forEach(server => {
        if (server.server_data && server.server_data[targetIndex]) {
          const epData = server.server_data[targetIndex];
          if (epData.link_m3u8 && !seenUrls.has(epData.link_m3u8)) {
            seenUrls.add(epData.link_m3u8);
            const serverName = server.server_name || 'VIP';
            const epName = epData.name || (type === 'series' ? `Tập ${targetIndex + 1}` : 'Full');
            const quality = item.quality || 'FHD';
            const proxyStreamUrl = `${baseUrl}/hls/manifest?url=${encodeURIComponent(epData.link_m3u8)}`;

            // 1. Proxied Stream (Bypasses all client-side ISP geo-blocks via server WARP)
            streams.push({
              name: `[KKPhim] ${serverName} (Proxy WARP)`,
              title: `${item.name} - ${epName} [${serverName}] [Proxy WARP] [${quality}]\n⚡ Nguồn: KKPhim (${serverName}) | Proxy WARP | ${quality}`,
              url: proxyStreamUrl,
              behaviorHints: {
                notWebReady: false,
                proxyHeaders: {
                  request: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
                    "Referer": "https://phimapi.com/"
                  }
                }
              }
            });

            // 2. Direct Stream
            streams.push({
              name: `[KKPhim] ${serverName} (Direct)`,
              title: `${item.name} - ${epName} [${serverName}] [Direct CDN] [${quality}]\n⚡ Nguồn: KKPhim (${serverName}) | Direct CDN | ${quality}`,
              url: epData.link_m3u8,
              behaviorHints: {
                notWebReady: false,
                proxyHeaders: {
                  request: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
                    "Referer": "https://phimapi.com/"
                  }
                }
              }
            });
          }
        }
      });
    }

    res.json({ streams });
  } catch (err) {
    console.error('Error handling stream:', err);
    res.json({ streams: [] });
  }
});

// HLS Manifest Proxy
app.get('/hls/manifest', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const upstreamRes = await api.fetchWithWarp(targetUrl);
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Failed to fetch upstream manifest');
    }

    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const baseUrl = `${proto}://${host}`;

    const body = await upstreamRes.text();
    const urlObj = new URL(targetUrl);
    const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

    const lines = body.split('\n');
    const rewritten = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      let absoluteUrl = trimmed;
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        if (trimmed.startsWith('/')) {
          absoluteUrl = `${urlObj.origin}${trimmed}`;
        } else {
          absoluteUrl = `${basePath}${trimmed}`;
        }
      }

      if (trimmed.endsWith('.m3u8') || trimmed.includes('.m3u8?')) {
        return `${baseUrl}/hls/manifest?url=${encodeURIComponent(absoluteUrl)}`;
      } else {
        return `${baseUrl}/hls/segment?url=${encodeURIComponent(absoluteUrl)}`;
      }
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(rewritten.join('\n'));
  } catch (err) {
    console.error('[HLS Manifest Proxy Error]:', err.message);
    res.status(500).send('Proxy error');
  }
});

// HLS Video Segment Proxy (.ts, .m4s)
app.get('/hls/segment', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const upstreamRes = await api.fetchWithWarp(targetUrl);
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Failed to fetch upstream segment');
    }

    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'video/mp2t');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Accept-Ranges', 'bytes');
    if (upstreamRes.headers.get('content-length')) {
      res.setHeader('Content-Length', upstreamRes.headers.get('content-length'));
    }

    const { Readable } = require('stream');
    Readable.fromWeb(upstreamRes.body).pipe(res);
  } catch (err) {
    console.error('[HLS Segment Proxy Error]:', err.message);
    res.status(500).send('Proxy error');
  }
});

// Image CDN Proxy for Nuvio Collections & Assets
app.get('/img', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Failed to fetch image');
    }

    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    const { Readable } = require('stream');
    Readable.fromWeb(upstreamRes.body).pipe(res);
  } catch (err) {
    console.error('[Image Proxy Error]:', err.message);
    res.status(500).send('Error proxying image');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kkphim-stremio-addon' });
});

// Start Addon Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 KKPhim Stremio Addon is running!`);
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`Manifest URL: http://localhost:${PORT}/manifest.json`);
  console.log(`=========================================`);
});

