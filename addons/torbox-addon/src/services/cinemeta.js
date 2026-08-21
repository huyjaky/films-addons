const axios = require('axios');
const https = require('https');

const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '2b32258264e41ebe29670d9c2e13c722';

// Re-use HTTPS agent with Keep-Alive
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000
});

const httpPool = axios.create({
  httpsAgent,
  timeout: 5000
});

// In-memory TTL cache for metadata (TTL: 24 hours)
const metaCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Ongoing fetch promises map to coalesce concurrent requests
const pendingMetaRequests = new Map();

/**
 * Parses Stremio content ID (e.g., "tt0111161", "tt0944947:1:5", "tmdb:12345", "tmdb:12345:1:5", "kitsu:1234:5")
 */
function parseStremioId(id) {
  if (!id) return { mainId: '', season: undefined, episode: undefined, provider: 'unknown' };

  if (id.startsWith('tmdb:')) {
    const parts = id.slice(5).split(':');
    const tmdbId = parts[0];
    const season = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
    const episode = parts[2] !== undefined ? parseInt(parts[2], 10) : undefined;
    return { mainId: tmdbId, season, episode, provider: 'tmdb' };
  }

  if (id.startsWith('kitsu:')) {
    const parts = id.slice(6).split(':');
    const kitsuId = parts[0];
    const episode = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
    return { mainId: kitsuId, season: 1, episode, provider: 'kitsu' };
  }

  // Standard IMDb id: tt1234567 or tt1234567:1:5
  const parts = id.split(':');
  const mainId = parts[0];
  const season = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
  const episode = parts[2] !== undefined ? parseInt(parts[2], 10) : undefined;

  return { mainId, season, episode, provider: 'imdb' };
}

/**
 * Fetches movie/series metadata from Cinemeta, TMDB, or Kitsu with caching & request coalescing
 */
async function getMediaMetadata(type, rawId) {
  const parsed = parseStremioId(rawId);
  const cacheKey = `${type}:${rawId}`;

  // 1. Check in-memory cache
  if (metaCache.has(cacheKey)) {
    const cached = metaCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    metaCache.delete(cacheKey);
  }

  // 2. Coalesce concurrent requests for the same media ID
  if (pendingMetaRequests.has(cacheKey)) {
    return pendingMetaRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    const result = {
      title: '',
      year: undefined,
      season: parsed.season,
      episode: parsed.episode,
      type: type || 'movie'
    };

    try {
      // CASE A: TMDB ID (e.g. tmdb:12345)
      if (parsed.provider === 'tmdb') {
        const tmdbType = type === 'series' ? 'tv' : 'movie';
        const res = await httpPool.get(`${TMDB_API_BASE}/${tmdbType}/${parsed.mainId}`, {
          params: { api_key: TMDB_API_KEY, language: 'en-US' }
        });

        if (res.data) {
          result.title = res.data.title || res.data.name || res.data.original_title || res.data.original_name || '';
          const dateStr = res.data.release_date || res.data.first_air_date || '';
          if (dateStr) {
            const y = parseInt(dateStr.split('-')[0], 10);
            if (!isNaN(y)) result.year = y;
          }
        }
      }
      // CASE B: Kitsu ID (Anime)
      else if (parsed.provider === 'kitsu') {
        const res = await httpPool.get(`https://kitsu.io/api/edge/anime/${parsed.mainId}`);
        if (res.data?.data?.attributes) {
          const attrs = res.data.data.attributes;
          result.title = attrs.canonicalTitle || attrs.titles?.en || attrs.titles?.en_jp || '';
          if (attrs.startDate) {
            const y = parseInt(attrs.startDate.split('-')[0], 10);
            if (!isNaN(y)) result.year = y;
          }
        }
      }
      // CASE C: Standard IMDb ID (tt1234567)
      else {
        const metaType = type === 'series' ? 'series' : 'movie';
        try {
          const response = await httpPool.get(`${CINEMETA_URL}/meta/${metaType}/${parsed.mainId}.json`);
          if (response.data?.meta) {
            const meta = response.data.meta;
            result.title = meta.name || '';
            if (meta.year) {
              const parsedYear = parseInt(String(meta.year).split('-')[0], 10);
              if (!isNaN(parsedYear)) result.year = parsedYear;
            }
          }
        } catch (cinemetaErr) {
          // Fallback to TMDB Find API if Cinemeta is down or fails
          const findRes = await httpPool.get(`${TMDB_API_BASE}/find/${parsed.mainId}`, {
            params: { api_key: TMDB_API_KEY, external_source: 'imdb_id' }
          });
          const match = findRes.data?.movie_results?.[0] || findRes.data?.tv_results?.[0];
          if (match) {
            result.title = match.title || match.name || '';
            const dateStr = match.release_date || match.first_air_date || '';
            if (dateStr) {
              const y = parseInt(dateStr.split('-')[0], 10);
              if (!isNaN(y)) result.year = y;
            }
          }
        }
      }

      if (result.title) {
        metaCache.set(cacheKey, { data: result, timestamp: Date.now() });
      }
    } catch (error) {
      console.error(`[Metadata] Failed to fetch metadata for ${type}/${rawId}:`, error.message);
    } finally {
      pendingMetaRequests.delete(cacheKey);
    }

    return result;
  })();

  pendingMetaRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

module.exports = {
  parseStremioId,
  getMediaMetadata
};
