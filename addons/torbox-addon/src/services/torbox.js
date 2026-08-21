const axios = require('axios');
const https = require('https');

const TORBOX_API_BASE = 'https://api.torbox.app/v1/api';

// Re-use HTTPS agent with Keep-Alive for low-latency connections
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000
});

const httpPool = axios.create({
  httpsAgent,
  timeout: 6000
});

// In-memory cache for user's torrent list (45s TTL for success, 15s TTL for auth error)
const mylistCache = new Map();
const MYLIST_TTL_MS = 45 * 1000;
const AUTH_ERROR_TTL_MS = 15 * 1000;

// Ongoing fetch promises map to coalesce concurrent requests per API key
const pendingRequests = new Map();

/**
 * Fetches user's torrent list from Torbox Cloud (/mylist) with in-memory TTL caching & request coalescing
 * 
 * @param {string} apiKey 
 * @returns {Promise<{ torrents: Array, authError: boolean }>}
 */
async function getUserTorrents(apiKey) {
  if (!apiKey) return { torrents: [], authError: false };

  // 1. Check in-memory TTL cache
  const cached = mylistCache.get(apiKey);
  if (cached) {
    const ttl = cached.data.authError ? AUTH_ERROR_TTL_MS : MYLIST_TTL_MS;
    if (Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    mylistCache.delete(apiKey);
  }

  // 2. Coalesce concurrent requests for the same API key
  if (pendingRequests.has(apiKey)) {
    return pendingRequests.get(apiKey);
  }

  const fetchPromise = (async () => {
    try {
      // Fast cached response from Torbox
      const response = await httpPool.get(`${TORBOX_API_BASE}/torrents/mylist`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      const errType = response.data?.error;
      if (errType === 'AUTH_ERROR' || errType === 'BAD_TOKEN' || response.data?.success === false) {
        if (errType === 'AUTH_ERROR' || errType === 'BAD_TOKEN') {
          const errResult = { torrents: [], authError: true };
          mylistCache.set(apiKey, { data: errResult, timestamp: Date.now() });
          return errResult;
        }
      }

      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        const result = { torrents: response.data.data, authError: false };
        mylistCache.set(apiKey, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (error) {
      const errType = error.response?.data?.error;
      const status = error.response?.status;

      if (errType === 'AUTH_ERROR' || errType === 'BAD_TOKEN' || status === 401 || status === 403) {
        const errResult = { torrents: [], authError: true };
        mylistCache.set(apiKey, { data: errResult, timestamp: Date.now() });
        return errResult;
      }
      console.error('[Torbox] Error fetching mylist:', error.response?.data || error.message);
    } finally {
      pendingRequests.delete(apiKey);
    }

    return { torrents: [], authError: false };
  })();

  pendingRequests.set(apiKey, fetchPromise);
  return fetchPromise;
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

// Fast video extension set for O(1) lookups
const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ts', 'flv', 'vob', 'ogv', 'mpg', 'mpeg']);

/**
 * Helper to check if a file extension is a streamable video format
 */
function isVideoFile(filename) {
  if (!filename) return false;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = filename.slice(lastDot + 1).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

module.exports = {
  getUserTorrents,
  buildStreamPermalink,
  isVideoFile
};
