const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const BASE_URL = process.env.KKPHIM_URL || process.env.PHIMAPI_URL || 'https://phimapi.com/v1/api';
const WARP_PROXY_URL = process.env.WARP_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';

// Create Proxy Agent for WARP if configured
let proxyAgent = null;
if (WARP_PROXY_URL) {
  try {
    if (WARP_PROXY_URL.startsWith('socks')) {
      proxyAgent = new SocksProxyAgent(WARP_PROXY_URL);
      console.log(`[Proxy] Using SOCKS Proxy for KKPhim: ${WARP_PROXY_URL}`);
    } else {
      proxyAgent = new HttpsProxyAgent(WARP_PROXY_URL);
      console.log(`[Proxy] Using HTTP/HTTPS Proxy for KKPhim: ${WARP_PROXY_URL}`);
    }
  } catch (err) {
    console.error('[Proxy] Failed to initialize WARP proxy agent:', err.message);
  }
}

/**
 * Custom fetch with Cloudflare WARP proxy and timeout
 */
async function fetchWithWarp(url, options = {}) {
  const fetchOptions = {
    ...options,
    headers: {
      'accept': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(10000)
  };

  if (proxyAgent) {
    fetchOptions.agent = proxyAgent;
  }

  return fetch(url, fetchOptions);
}

/**
 * Clean and combine image URLs with CDN Domain
 */
function getAbsoluteUrl(url, cdnDomain = 'https://phimimg.com') {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
  const cleanDomain = cdnDomain.endsWith('/') ? cdnDomain : cdnDomain + '/';
  return cleanDomain + cleanUrl;
}

/**
 * Searches movies by keyword using KKPhim API
 * @param {string} keyword
 * @param {number} page
 * @param {number} limit
 */
async function searchMovies(keyword, page = 1, limit = 100) {
  if (!keyword || !keyword.trim()) return null;
  try {
    const url = `${BASE_URL}/tim-kiem?keyword=${encodeURIComponent(keyword.trim())}&page=${page}&limit=${limit}`;
    const res = await fetchWithWarp(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error searching KKPhim with keyword "${keyword}":`, err.message);
    return null;
  }
}

/**
 * Gets movie/series lists from KKPhim
 * @param {string} type - 'movie' or 'series'
 * @param {number} page
 * @param {number} limit
 */
async function getMoviesList(type, page = 1, limit = 20) {
  try {
    const endpoint = type === 'series' ? 'phim-bo' : 'phim-le';
    const url = `${BASE_URL}/danh-sach/${endpoint}?page=${page}&limit=${limit}`;
    const res = await fetchWithWarp(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error getting KKPhim list for type "${type}":`, err.message);
    return null;
  }
}

/**
 * Gets movie/series details by slug from KKPhim
 * @param {string} slug
 */
async function getMovieDetails(slug) {
  if (!slug) return null;
  try {
    const url = `${BASE_URL}/phim/${encodeURIComponent(slug)}`;
    const res = await fetchWithWarp(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error getting KKPhim movie details for slug "${slug}":`, err.message);
    return null;
  }
}

/**
 * Finds a KKPhim movie by IMDb ID or Title/Year
 * @param {Object} options
 * @param {string} options.imdbId - e.g. "tt0800268"
 * @param {string} [options.title] - e.g. "Deadpool"
 * @param {number} [options.year]
 */
async function findMovieByImdbOrTitle({ imdbId, title, year }) {
  const cleanImdb = imdbId && typeof imdbId === 'string'
    ? (imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`)
    : null;

  const searchKeyword = title || cleanImdb;
  if (!searchKeyword) return null;

  const searchData = await searchMovies(searchKeyword, 1, 20);
  if (!searchData || !searchData.data || !searchData.data.items || searchData.data.items.length === 0) {
    return null;
  }

  const items = searchData.data.items;

  // 1. Exact match on IMDb ID
  if (cleanImdb) {
    const exactImdb = items.find(it => {
      const itImdb = it.imdb?.id;
      if (!itImdb) return false;
      const cleanItImdb = itImdb.startsWith('tt') ? itImdb : `tt${itImdb}`;
      return cleanItImdb.toLowerCase() === cleanImdb.toLowerCase();
    });
    if (exactImdb) {
      return getMovieDetails(exactImdb.slug);
    }
  }

  // 2. Match on Title + Year
  if (title) {
    const targetTitle = title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    for (const it of items) {
      const itName = (it.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const itOrigin = (it.origin_name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

      if (itName === targetTitle || itOrigin === targetTitle || itName.includes(targetTitle) || targetTitle.includes(itName)) {
        if (!year || !it.year || Math.abs(parseInt(it.year) - parseInt(year)) <= 1) {
          return getMovieDetails(it.slug);
        }
      }
    }
  }

  return null;
}

module.exports = {
  fetchWithWarp,
  searchMovies,
  getMoviesList,
  getMovieDetails,
  findMovieByImdbOrTitle,
  getAbsoluteUrl
};
