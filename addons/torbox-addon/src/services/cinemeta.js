const axios = require('axios');
const https = require('https');

const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '2b32258264e41ebe29670d9c2e13c722';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

// Re-use HTTPS agent with Keep-Alive
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000
});

const httpPool = axios.create({
  httpsAgent,
  timeout: 7000,
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/plain, */*'
  }
});

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
 * Live, Zero-Cache movie/series metadata fetching from TMDB and Cinemeta
 */
async function getMediaMetadata(type, rawId) {
  const parsed = parseStremioId(rawId);
  const titlesSet = new Set();
  let primaryTitle = '';
  let year = undefined;

  const result = {
    title: '',
    titles: [],
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
        const data = res.data;
        if (data.title) titlesSet.add(data.title);
        if (data.name) titlesSet.add(data.name);
        if (data.original_title) titlesSet.add(data.original_title);
        if (data.original_name) titlesSet.add(data.original_name);
        primaryTitle = data.title || data.name || data.original_title || '';

        const dateStr = data.release_date || data.first_air_date || '';
        if (dateStr) {
          const y = parseInt(dateStr.split('-')[0], 10);
          if (!isNaN(y)) year = y;
        }
      }
    }
    // CASE B: Kitsu ID (Anime)
    else if (parsed.provider === 'kitsu') {
      const res = await httpPool.get(`https://kitsu.io/api/edge/anime/${parsed.mainId}`);
      if (res.data?.data?.attributes) {
        const attrs = res.data.data.attributes;
        if (attrs.canonicalTitle) titlesSet.add(attrs.canonicalTitle);
        if (attrs.titles?.en) titlesSet.add(attrs.titles.en);
        if (attrs.titles?.en_jp) titlesSet.add(attrs.titles.en_jp);
        primaryTitle = attrs.canonicalTitle || attrs.titles?.en || '';
        if (attrs.startDate) {
          const y = parseInt(attrs.startDate.split('-')[0], 10);
          if (!isNaN(y)) year = y;
        }
      }
    }
    // CASE C: Standard IMDb ID (tt1234567)
    else {
      // Query TMDB Find API and Cinemeta in parallel for maximum accuracy & aliases
      const [tmdbFindRes, cinemetaRes] = await Promise.allSettled([
        httpPool.get(`${TMDB_API_BASE}/find/${parsed.mainId}`, {
          params: { api_key: TMDB_API_KEY, external_source: 'imdb_id' }
        }),
        httpPool.get(`${CINEMETA_URL}/meta/${type === 'series' ? 'series' : 'movie'}/${parsed.mainId}.json`)
      ]);

      if (tmdbFindRes.status === 'fulfilled' && tmdbFindRes.value.data) {
        const findData = tmdbFindRes.value.data;
        const match = findData.movie_results?.[0] || findData.tv_results?.[0];
        if (match) {
          if (match.title) titlesSet.add(match.title);
          if (match.name) titlesSet.add(match.name);
          if (match.original_title) titlesSet.add(match.original_title);
          if (match.original_name) titlesSet.add(match.original_name);
          primaryTitle = match.title || match.name || '';
          const dateStr = match.release_date || match.first_air_date || '';
          if (dateStr) {
            const y = parseInt(dateStr.split('-')[0], 10);
            if (!isNaN(y)) year = y;
          }
        }
      }

      if (cinemetaRes.status === 'fulfilled' && cinemetaRes.value.data?.meta) {
        const meta = cinemetaRes.value.data.meta;
        if (meta.name) {
          titlesSet.add(meta.name);
          if (!primaryTitle) primaryTitle = meta.name;
        }
        if (year === undefined && meta.year) {
          const parsedYear = parseInt(String(meta.year).split('-')[0], 10);
          if (!isNaN(parsedYear)) year = parsedYear;
        }
      }
    }

    result.title = primaryTitle;
    result.titles = Array.from(titlesSet);
    result.year = year;
  } catch (error) {
    console.error(`[Metadata] Failed to fetch metadata for ${type}/${rawId}:`, error.message);
  }

  return result;
}

module.exports = {
  parseStremioId,
  getMediaMetadata
};
