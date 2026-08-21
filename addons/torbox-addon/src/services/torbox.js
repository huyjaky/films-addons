const axios = require('axios');
const https = require('https');

const TORBOX_API_BASE = 'https://api.torbox.app/v1/api';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

// Re-use HTTPS agent with Keep-Alive for low-latency connections
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000
});

const httpPool = axios.create({
  httpsAgent,
  timeout: 10000,
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/plain, */*'
  }
});

// In-memory cache for user's torrent list (30s TTL for success, 10s TTL for real auth error)
const mylistCache = new Map();
const MYLIST_TTL_MS = 30 * 1000;
const AUTH_ERROR_TTL_MS = 10 * 1000;

// Ongoing fetch promises map to coalesce concurrent requests per API key
const pendingRequests = new Map();

/**
 * Helper to fetch mylist from Torbox with 1 automatic retry on transient failure
 */
async function fetchMylistFromApi(apiKey, retryCount = 1) {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const response = await httpPool.get(`${TORBOX_API_BASE}/torrents/mylist`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      const data = response.data;
      if (data) {
        if (data.error === 'AUTH_ERROR' || data.error === 'BAD_TOKEN') {
          return { torrents: [], authError: true };
        }
        if (data.success && Array.isArray(data.data)) {
          return { torrents: data.data, authError: false };
        }
      }
    } catch (error) {
      const status = error.response?.status;
      const errData = error.response?.data;

      // Definite auth error (401 Unauthorized with auth message)
      if (status === 401 && (errData?.error === 'AUTH_ERROR' || errData?.error === 'BAD_TOKEN')) {
        return { torrents: [], authError: true };
      }

      console.warn(`[Torbox] Attempt ${attempt + 1} failed for mylist:`, error.message);
      if (attempt < retryCount) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  return { torrents: [], authError: false };
}

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
      const result = await fetchMylistFromApi(apiKey, 1);
      if (result.torrents && result.torrents.length > 0) {
        mylistCache.set(apiKey, { data: result, timestamp: Date.now() });
      } else if (result.authError) {
        mylistCache.set(apiKey, { data: result, timestamp: Date.now() });
      }
      return result;
    } finally {
      pendingRequests.delete(apiKey);
    }
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
