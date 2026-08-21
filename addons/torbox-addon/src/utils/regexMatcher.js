/**
 * Clean & Simple Title Matching Utility for TbCRS.
 * Simple, fast keyword & token matching without complex regex traps.
 */

/**
 * Normalizes any text into a lowercase, alphanumeric token array
 */
function cleanTokens(text) {
  if (!text) return [];
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/**
 * Checks if target text contains the main title
 */
function isTitleMatching(searchTitle, targetText) {
  if (!searchTitle || !targetText) return false;

  const searchTokens = cleanTokens(searchTitle);
  if (searchTokens.length === 0) return false;

  const targetCleanStr = cleanTokens(targetText).join(' ');
  const searchCleanStr = searchTokens.join(' ');

  // 1. Direct clean substring match
  if (targetCleanStr.includes(searchCleanStr)) {
    return true;
  }

  // 2. Keyword match: filter minor words if title is long
  const stopWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and']);
  const keyTokens = searchTokens.length > 2
    ? searchTokens.filter(t => !stopWords.has(t))
    : searchTokens;

  const targetTokens = new Set(cleanTokens(targetText));

  return keyTokens.every(k => {
    if (targetTokens.has(k)) return true;
    if (k === '2' && (targetTokens.has('ii') || targetCleanStr.includes('ii'))) return true;
    if (k === '3' && (targetTokens.has('iii') || targetCleanStr.includes('iii'))) return true;
    if (k === '4' && (targetTokens.has('iv') || targetCleanStr.includes('iv'))) return true;
    if (k === '5' && (targetTokens.has('v') || targetCleanStr.includes('v'))) return true;
    return false;
  });
}

/**
 * Checks if episode matches for Series
 */
function isEpisodeMatching(fileName, torrentName, season, episode) {
  if (season === undefined || episode === undefined) return true;

  const s = parseInt(season, 10);
  const e = parseInt(episode, 10);
  const sStr = s < 10 ? `0?${s}` : `${s}`;
  const eStr = e < 10 ? `0?${e}` : `${e}`;

  const text = `${torrentName} ${fileName}`;

  // Check common episode patterns (S01E01, 1x01, E01, Ep 01, Episode 01, Tap 01, 01.mkv)
  const epRegexes = [
    new RegExp(`s${sStr}[.\\s_-]*e${eStr}\\b`, 'i'),
    new RegExp(`\\b${s}x${eStr}\\b`, 'i'),
    new RegExp(`\\b(?:e|ep|episode|tap|tập)[.\\s_-]*${eStr}\\b`, 'i'),
    new RegExp(`(?:^|[.\\s_#\\[\\(-])${eStr}(?:[.\\s_#\\]\\)-]|$)`, 'i')
  ];

  return epRegexes.some(r => r.test(text));
}

/**
 * Creates Title Matcher Object supporting multiple candidate titles
 */
function createTitleMatcher({
  title,
  titles = [],
  year,
  season,
  episode,
  type = 'movie',
  customIncludeRegex = '',
  customExcludeRegex = ''
}) {
  const candidateTitles = Array.from(new Set([title, ...(Array.isArray(titles) ? titles : [])].filter(Boolean)));

  let includeRegex = null;
  if (customIncludeRegex && customIncludeRegex.trim()) {
    try {
      includeRegex = new RegExp(customIncludeRegex.trim(), 'i');
    } catch (e) {}
  }

  let excludeRegex = null;
  if (customExcludeRegex && customExcludeRegex.trim()) {
    try {
      excludeRegex = new RegExp(customExcludeRegex.trim(), 'i');
    } catch (e) {}
  }

  const validateFileInTorrent = (fileName, torrentName) => {
    const file = fileName || '';
    const torrent = torrentName || '';
    const combined = `${torrent} ${file}`;

    // Custom regex filters if configured
    if (includeRegex && !includeRegex.test(combined)) return false;
    if (excludeRegex && excludeRegex.test(combined)) return false;

    // 1. Check title match against any candidate title
    const matchesTitle = candidateTitles.some(t => isTitleMatching(t, torrent) || isTitleMatching(t, file));
    if (!matchesTitle) return false;

    // 2. For Series: check episode number
    if (type === 'series' && season !== undefined && episode !== undefined) {
      return isEpisodeMatching(file, torrent, season, episode);
    }

    return true;
  };

  return {
    validateFileInTorrent
  };
}

/**
 * Helper to parse resolution / quality from file or torrent name
 */
function parseQuality(name) {
  if (!name) return 'HD';
  if (/2160p|4k|uhd/i.test(name)) return '4K 2160p';
  if (/1080p|fhd/i.test(name)) return '1080p';
  if (/720p|hd/i.test(name)) return '720p';
  if (/480p|sd/i.test(name)) return '480p';
  return 'HD';
}

/**
 * Format bytes to readable size
 */
function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

module.exports = {
  createTitleMatcher,
  isTitleMatching,
  isEpisodeMatching,
  parseQuality,
  formatSize,
  cleanTokens
};
