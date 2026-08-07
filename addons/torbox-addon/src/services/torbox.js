const axios = require('axios');

const TORBOX_API_BASE = 'https://api.torbox.app/v1/api';
const TORBOX_SEARCH_BASE = 'https://search-api.torbox.app';

/**
 * Fetches user's torrent list from Torbox Cloud (/mylist)
 */
async function getUserTorrents(apiKey) {
  if (!apiKey) return { torrents: [], authError: false };

  try {
    const response = await axios.get(`${TORBOX_API_BASE}/torrents/mylist?bypass_cache=true`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 10000
    });

    if (response.data && response.data.error === 'AUTH_ERROR') {
      console.error('[Torbox] API Token Auth Error:', response.data.detail);
      return { torrents: [], authError: true };
    }

    if (response.data && response.data.success && Array.isArray(response.data.data)) {
      return { torrents: response.data.data, authError: false };
    }
  } catch (error) {
    if (error.response?.data?.error === 'AUTH_ERROR' || error.response?.status === 401) {
      return { torrents: [], authError: true };
    }
    console.error('[Torbox] Error fetching mylist:', error.response?.data || error.message);
  }

  return { torrents: [], authError: false };
}

/**
 * Checks cache status of array of torrent hashes
 */
async function checkCachedHashes(apiKey, hashes) {
  if (!apiKey || !hashes || hashes.length === 0) return {};

  try {
    const response = await axios.post(`${TORBOX_API_BASE}/torrents/checkcached`, {
      hashes: hashes,
      format: 'object'
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 10000
    });

    if (response.data && response.data.data) {
      return response.data.data;
    }
  } catch (error) {
    console.error('[Torbox] Error checking cache:', error.response?.data || error.message);
  }

  return {};
}

/**
 * Searches Torbox Cached Search API
 */
async function searchCachedTorrents(apiKey, query) {
  if (!apiKey || !query) return [];

  try {
    const response = await axios.get(`${TORBOX_SEARCH_BASE}/torrents/search`, {
      params: {
        query: query,
        check_cache: 'true'
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 10000
    });

    const items = Array.isArray(response.data) 
      ? response.data 
      : (Array.isArray(response.data?.data) ? response.data.data : []);

    if (items.length > 0) {
      return items.filter(item => item.cached === true || item.is_cached === true || item.cached === 'true');
    }
  } catch (error) {
    console.warn('[Torbox] Search API warning:', error.response?.status || error.message);
  }

  return [];
}

/**
 * Adds a cached torrent (by magnet/hash) to user account instantly
 * 
 * @param {string} apiKey 
 * @param {string} magnetOrHash 
 * @returns {Promise<Object|null>} Created torrent data containing torrent_id
 */
async function addCachedTorrent(apiKey, magnetOrHash) {
  if (!apiKey || !magnetOrHash) return null;

  try {
    const payload = magnetOrHash.startsWith('magnet:')
      ? { magnet: magnetOrHash }
      : { hash: magnetOrHash };

    const response = await axios.post(`${TORBOX_API_BASE}/torrents/createtorrent`, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 10000
    });

    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
  } catch (error) {
    console.error('[Torbox] Error adding cached torrent:', error.response?.data || error.message);
  }

  return null;
}

/**
 * Generates Torbox permalink URL for direct video streaming
 * 
 * @param {string} apiKey 
 * @param {number|string} torrentId 
 * @param {number|string} fileId 
 * @returns {string} Stream URL with redirect=true
 */
function buildStreamPermalink(apiKey, torrentId, fileId) {
  return `${TORBOX_API_BASE}/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torrentId}&file_id=${fileId}&redirect=true`;
}

/**
 * Helper to check if a file extension is a streamable video format
 */
function isVideoFile(filename) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ts', 'flv'].includes(ext);
}

module.exports = {
  getUserTorrents,
  checkCachedHashes,
  searchCachedTorrents,
  addCachedTorrent,
  buildStreamPermalink,
  isVideoFile
};
