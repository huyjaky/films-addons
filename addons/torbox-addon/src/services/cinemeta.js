const axios = require('axios');

const CINEMETA_URL = 'https://v3-cinemeta.strem.io';

/**
 * Parses Stremio content ID (e.g., "tt0111161", "tt0944947:1:5", "tmdb:12345")
 * 
 * @param {string} id 
 * @returns {{ mainId: string, season?: number, episode?: number }}
 */
function parseStremioId(id) {
  const parts = id.split(':');
  const mainId = parts[0];
  const season = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
  const episode = parts[2] !== undefined ? parseInt(parts[2], 10) : undefined;

  return { mainId, season, episode };
}

/**
 * Fetches movie/series metadata from Cinemeta
 * 
 * @param {string} type - "movie" or "series"
 * @param {string} rawId - Stremio content ID (e.g. "tt0111161" or "tt0944947:1:5")
 * @returns {Promise<{ title: string, year?: number, season?: number, episode?: number, type: string }>}
 */
async function getMediaMetadata(type, rawId) {
  const { mainId, season, episode } = parseStremioId(rawId);

  // Default fallback if Cinemeta fails
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
        // year can be a string like "2011-2019" for series or 2010 for movie
        const parsedYear = parseInt(String(meta.year).split('-')[0], 10);
        if (!isNaN(parsedYear)) {
          result.year = parsedYear;
        }
      }
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
