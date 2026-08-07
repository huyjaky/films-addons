const axios = require('axios');

const CINEMETA_URL = 'https://v3-cinemeta.strem.io';

// In-memory LRU-style TTL cache for metadata (TTL: 12 hours)
const metaCache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Parses Stremio content ID (e.g., "tt0111161", "tt0944947:1:5", "tmdb:12345")
 */
function parseStremioId(id) {
  const parts = id.split(':');
  const mainId = parts[0];
  const season = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
  const episode = parts[2] !== undefined ? parseInt(parts[2], 10) : undefined;

  return { mainId, season, episode };
}

/**
 * Fetches movie/series metadata from Cinemeta with 12h in-memory cache
 */
async function getMediaMetadata(type, rawId) {
  const { mainId, season, episode } = parseStremioId(rawId);
  const cacheKey = `${type}:${rawId}`;

  // Check in-memory cache
  if (metaCache.has(cacheKey)) {
    const cached = metaCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    metaCache.delete(cacheKey);
  }

  const result = {
    title: '',
    year: undefined,
    season,
    episode,
    type: type || 'movie'
  };

  try {
    const metaType = type === 'series' ? 'series' : 'movie';
    const response = await axios.get(`${CINEMETA_URL}/meta/${metaType}/${mainId}.json`, {
      timeout: 8000
    });

    if (response.data && response.data.meta) {
      const meta = response.data.meta;
      result.title = meta.name || '';
      if (meta.year) {
        const parsedYear = parseInt(String(meta.year).split('-')[0], 10);
        if (!isNaN(parsedYear)) {
          result.year = parsedYear;
        }
      }
    }

    if (result.title) {
      metaCache.set(cacheKey, { data: result, timestamp: Date.now() });
    }
  } catch (error) {
    console.error(`[Cinemeta] Failed to fetch metadata for ${type}/${rawId}:`, error.message);
  }

  return result;
}

module.exports = {
  parseStremioId,
  getMediaMetadata
};
