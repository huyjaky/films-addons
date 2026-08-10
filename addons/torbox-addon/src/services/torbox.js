const axios = require('axios');

const TORBOX_API_BASE = 'https://api.torbox.app/v1/api';

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
  buildStreamPermalink,
  isVideoFile
};
