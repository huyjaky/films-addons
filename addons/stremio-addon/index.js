require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const manifest = require('./manifest');
const api = require('./api');

const app = express();
const PORT = process.env.PORT || 7000;
const OPHIM_URL = process.env.OPHIM_URL || 'https://ophim1.com/v1/api';
const SEARCH_LIMIT = parseInt(process.env.SEARCH_LIMIT) || 1000;

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
  if (id !== 'phimapi-movies' && id !== 'phimapi-series') {
    return res.status(404).json({ err: 'Invalid catalog ID' });
  }

  // Parse extra arguments
  let search = null;
  let skip = 0;
  if (extra) {
    // Strip trailing .json if present in the extra parameter
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
      // User is searching both PhimAPI and OPhim in parallel
      const [phimapiSearchRes, ophimSearchRes] = await Promise.all([
        api.searchMovies(search, 1, SEARCH_LIMIT),
        api.searchOPhim(search, 1, SEARCH_LIMIT)
      ]);

      const searchMetas = [];

      // Process PhimAPI results
      if (phimapiSearchRes && phimapiSearchRes.status === 'success' && phimapiSearchRes.data) {
        const cdnDomain = phimapiSearchRes.data.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';
        const rawItems = phimapiSearchRes.data.items || [];
        rawItems.forEach(item => {
          const isSeries = isSeriesType(item.type);
          const matchesType = type === 'series' ? isSeries : !isSeries;
          if (matchesType) {
            searchMetas.push({
              id: `phimapi:${item.slug}`,
              type: isSeries ? 'series' : 'movie',
              name: item.name,
              poster: api.getAbsoluteUrl(item.poster_url, cdnDomain),
              background: api.getAbsoluteUrl(item.thumb_url, cdnDomain),
              releaseInfo: item.year ? String(item.year) : undefined
            });
          }
        });
      }

      // Process OPhim results
      if (ophimSearchRes && ophimSearchRes.status === 'success' && ophimSearchRes.data) {
        const cdnDomain = ophimSearchRes.data.APP_DOMAIN_CDN_IMAGE || 'https://img.ophim.live';
        const rawItems = ophimSearchRes.data.items || [];
        rawItems.forEach(item => {
          const isSeries = isSeriesType(item.type);
          const matchesType = type === 'series' ? isSeries : !isSeries;
          if (matchesType) {
            searchMetas.push({
              id: `ophim:${item.slug}`,
              type: isSeries ? 'series' : 'movie',
              name: item.name,
              poster: api.getAbsoluteUrl(item.poster_url, cdnDomain),
              background: api.getAbsoluteUrl(item.thumb_url, cdnDomain),
              releaseInfo: item.year ? String(item.year) : undefined
            });
          }
        });
      }

      // Deduplicate results by title + year to prevent double cards
      const seenKeys = new Set();
      const uniqueMetas = [];
      searchMetas.forEach(meta => {
        const titleKey = (meta.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const yearKey = meta.releaseInfo || '';
        const dedupeKey = `${titleKey}_${yearKey}`;
        
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          uniqueMetas.push(meta);
        }
      });

      // Apply pagination slice if skip is requested
      let finalMetas = uniqueMetas;
      if (skip > 0) {
        finalMetas = finalMetas.slice(skip);
      }
      
      return res.json({ metas: finalMetas });
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

    // Map to Stremio Meta preview format
    const metas = items.map(item => {
      const isSeries = isSeriesType(item.type);
      return {
        id: `phimapi:${item.slug}`,
        type: isSeries ? 'series' : 'movie',
        name: item.name,
        poster: api.getAbsoluteUrl(item.poster_url, cdnDomain),
        background: api.getAbsoluteUrl(item.thumb_url, cdnDomain),
        releaseInfo: item.year ? String(item.year) : undefined
      };
    });

    res.json({ metas });
  } catch (err) {
    console.error('Error handling catalog:', err);
    res.status(500).json({ err: 'Internal Server Error' });
  }
};

// Register catalog endpoints (supporting optional extra param with/without suffix)
app.get('/catalog/:type/:id.json', handleCatalog);
app.get('/catalog/:type/:id/:extra', handleCatalog);

// Handle meta details routing
app.get('/meta/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  console.log(`[Meta] Request - Type: ${type}, ID: ${id}`);

  // Extract slug from format phimapi:{slug} or ophim:{slug}
  const parts = id.split(':');
  if ((parts[0] !== 'phimapi' && parts[0] !== 'ophim') || !parts[1]) {
    return res.status(404).json({ err: 'Invalid meta ID' });
  }
  const source = parts[0];
  const slug = parts[1];

  try {
    let detailsRes = null;
    if (source === 'ophim') {
      detailsRes = await api.getOPhimMovieDetails(slug);
    } else {
      detailsRes = await api.getMovieDetails(slug);
    }

    if (!detailsRes || detailsRes.status !== 'success' || !detailsRes.data) {
      return res.status(404).json({ err: 'Movie not found' });
    }

    const item = detailsRes.data.item;
    const defaultCdn = source === 'ophim' ? 'https://img.ophim.live' : 'https://phimimg.com';
    const cdnDomain = detailsRes.data.APP_DOMAIN_CDN_IMAGE || defaultCdn;

    // Build the Meta detail object
    const meta = {
      id: `${source}:${item.slug}`,
      type: type, // 'movie' or 'series'
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
      
      // Find the server with the most episodes to construct the listing
      let bestServer = item.episodes[0];
      for (const server of item.episodes) {
        if (server.server_data && server.server_data.length > bestServer.server_data.length) {
          bestServer = server;
        }
      }

      if (bestServer && bestServer.server_data) {
        bestServer.server_data.forEach((ep, index) => {
          meta.videos.push({
            id: `${source}:${item.slug}:1:${index + 1}`, // format: source:{slug}:{season}:{episode}
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

  const parts = id.split(':');
  if ((parts[0] !== 'phimapi' && parts[0] !== 'ophim') || !parts[1]) {
    return res.status(404).json({ err: 'Invalid stream ID' });
  }

  const source = parts[0]; // 'phimapi' or 'ophim'
  const slug = parts[1];
  const season = parts[2] ? parseInt(parts[2]) : null;
  const episode = parts[3] ? parseInt(parts[3]) : null;

  try {
    let detailsRes = null;
    if (source === 'ophim') {
      detailsRes = await api.getOPhimMovieDetails(slug);
    } else {
      detailsRes = await api.getMovieDetails(slug);
    }

    if (!detailsRes || detailsRes.status !== 'success' || !detailsRes.data) {
      return res.status(404).json({ err: 'Movie details not found' });
    }

    const item = detailsRes.data.item;
    const streams = [];

    // 1. Extract stream links from the local primary source for this episode
    if (item.episodes && item.episodes.length > 0) {
      const targetIndex = type === 'series' && episode ? episode - 1 : 0;

      item.episodes.forEach(server => {
        if (server.server_data && server.server_data[targetIndex]) {
          const epData = server.server_data[targetIndex];
          if (epData.link_m3u8) {
            const serverName = server.server_name || 'Mặc định';
            const epName = epData.name || (type === 'series' ? `Tập ${targetIndex + 1}` : 'Full');
            const sourceLabel = source === 'ophim' ? 'OPhim' : 'PhimAPI';
            
            streams.push({
              name: `${sourceLabel} - ${serverName}`,
              title: `${item.name} - ${epName}\nServer: ${serverName}\nChất lượng: ${item.quality || 'HD'}\nNgôn ngữ: ${item.lang || 'Vietsub'}`,
              url: epData.link_m3u8
            });
          }
        }
      });
    }

    // 2. Fetch external streams from cross source in parallel (timeout 3.5s)
    const targetIndex = type === 'series' && episode ? episode - 1 : 0;
    
    // Clean and validate IMDb ID
    let imdbId = item.imdb?.id;
    if (imdbId && typeof imdbId === 'string') {
      imdbId = imdbId.trim();
      if (!imdbId.startsWith('tt') && /^\d+$/.test(imdbId)) {
        imdbId = 'tt' + imdbId;
      }
    } else {
      imdbId = null;
    }

    const tmdbId = item.tmdb?.id;
    const crossSource = source === 'ophim' ? 'phimapi' : 'ophim';

    // Helper to cross-query search and fetch streams
    const getCrossStreams = async () => {
      try {
        const query = item.origin_name || item.name;
        if (!query) return [];
        
        let searchData;
        if (crossSource === 'ophim') {
          const searchUrl = `${OPHIM_URL}/tim-kiem?keyword=${encodeURIComponent(query)}&limit=10`;
          const response = await fetch(searchUrl);
          if (!response.ok) return [];
          searchData = await response.json();
        } else {
          searchData = await api.searchMovies(query, 1, 10);
        }
        
        if (!searchData || !searchData.data || !searchData.data.items || searchData.data.items.length === 0) {
          return [];
        }
        
        const targetImdb = imdbId;
        const targetTmdb = tmdbId;
        const targetOriginName = (item.origin_name || '').toLowerCase().trim();
        const targetName = (item.name || '').toLowerCase().trim();
        
        let matchedItem = null;
        for (const sItem of searchData.data.items) {
          const sImdb = sItem.imdb?.id;
          const sTmdb = sItem.tmdb?.id;
          
          const sCleanImdb = sImdb && typeof sImdb === 'string' 
            ? (sImdb.startsWith('tt') ? sImdb : 'tt' + sImdb) 
            : null;
            
          if (targetTmdb && sTmdb && String(targetTmdb) === String(sTmdb)) {
            matchedItem = sItem;
            break;
          }
          if (targetImdb && sCleanImdb && String(targetImdb) === String(sCleanImdb)) {
            matchedItem = sItem;
            break;
          }
          if (targetOriginName && sItem.origin_name && targetOriginName === sItem.origin_name.toLowerCase().trim()) {
            matchedItem = sItem;
            break;
          }
          if (targetName && sItem.name && targetName === sItem.name.toLowerCase().trim()) {
            matchedItem = sItem;
            break;
          }
        }
        
        if (!matchedItem) return [];
        
        let detailData;
        if (crossSource === 'ophim') {
          detailData = await api.getOPhimMovieDetails(matchedItem.slug);
        } else {
          detailData = await api.getMovieDetails(matchedItem.slug);
        }
        
        if (!detailData || detailData.status !== 'success' || !detailData.data || !detailData.data.item) {
          return [];
        }
        
        const movie = detailData.data.item;
        const resultStreams = [];
        
        if (movie.episodes && movie.episodes.length > 0) {
          movie.episodes.forEach(server => {
            if (server.server_data && server.server_data[targetIndex]) {
              const epData = server.server_data[targetIndex];
              if (epData.link_m3u8) {
                const serverName = server.server_name || 'Mặc định';
                const epName = epData.name || (type === 'series' ? `Tập ${targetIndex + 1}` : 'Full');
                const label = crossSource === 'ophim' ? 'OPhim' : 'PhimAPI';
                
                resultStreams.push({
                  name: `${label} - ${serverName}`,
                  title: `${movie.name} - ${epName}\nServer: ${serverName}\nChất lượng: ${movie.quality || 'HD'}\nNguồn: ${label} (M3U8)`,
                  url: epData.link_m3u8
                });
              }
            }
          });
        }
        
        return resultStreams;
      } catch (err) {
        console.error(`Error fetching cross streams for ${crossSource}:`, err);
        return [];
      }
    };

    const crossPromise = getCrossStreams();
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([]), 3500)); // 3.5 seconds timeout
    
    try {
      const crossStreams = await Promise.race([crossPromise, timeoutPromise]);
      const seenUrls = new Set(streams.map(s => s.url));
      
      crossStreams.forEach(s => {
        if (s.url && !seenUrls.has(s.url)) {
          seenUrls.add(s.url);
          streams.push(s);
        }
      });
    } catch (err) {
      console.error('Error matching cross streams:', err);
    }

    res.json({ streams });
  } catch (err) {
    console.error('Error handling stream:', err);
    res.status(500).json({ err: 'Internal Server Error' });
  }
});

// Start Addon Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`PhimAPI Stremio Addon is running!`);
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`Manifest URL: http://localhost:${PORT}/manifest.json`);
  console.log(`=========================================`);
});
