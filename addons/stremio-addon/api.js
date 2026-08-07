const BASE_URL = process.env.PHIMAPI_URL || 'https://phimapi.com/v1/api';
const OPHIM_URL = process.env.OPHIM_URL || 'https://ophim1.com/v1/api';

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
 * Searches movies by keyword using PhimAPI
 * @param {string} keyword
 * @param {number} page
 * @param {number} limit
 */
async function searchMovies(keyword, page = 1, limit = 100) {
  try {
    const url = `${BASE_URL}/tim-kiem?keyword=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`;
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error searching movies with keyword "${keyword}":`, err);
    return null;
  }
}

/**
 * Gets movie/series lists
 * @param {string} type - 'movie' or 'series'
 * @param {number} page
 * @param {number} limit
 */
async function getMoviesList(type, page = 1, limit = 20) {
  try {
    const endpoint = type === 'series' ? 'phim-bo' : 'phim-le';
    const url = `${BASE_URL}/danh-sach/${endpoint}?page=${page}&limit=${limit}`;
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error getting movie list for type "${type}":`, err);
    return null;
  }
}

/**
 * Gets movie/series details by slug
 * @param {string} slug
 */
async function getMovieDetails(slug) {
  try {
    const url = `${BASE_URL}/phim/${slug}`;
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error getting movie details for slug "${slug}":`, err);
    return null;
  }
}

/**
 * Searches movies by keyword using OPhim
 * @param {string} keyword
 * @param {number} page
 * @param {number} limit
 */
async function searchOPhim(keyword, page = 1, limit = 100) {
  try {
    const url = `${OPHIM_URL}/tim-kiem?keyword=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`;
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error searching OPhim with keyword "${keyword}":`, err);
    return null;
  }
}

/**
 * Gets OPhim movie/series details by slug
 * @param {string} slug
 */
async function getOPhimMovieDetails(slug) {
  try {
    const url = `${OPHIM_URL}/phim/${slug}`;
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error getting OPhim movie details for slug "${slug}":`, err);
    return null;
  }
}

module.exports = {
  searchMovies,
  getMoviesList,
  getMovieDetails,
  getAbsoluteUrl,
  searchOPhim,
  getOPhimMovieDetails
};
