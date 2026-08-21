/**
 * Clean & High-Performance Title Matching Utility for TbCRS.
 * Simple, robust keyword & token matching without complex regex traps.
 */

/**
 * Normalizes any text into a lowercase, alphanumeric token array.
 * Handles apostrophes (There's -> theres, Don't -> dont), unicode diacritics, and symbols.
 */
function cleanTokens(text) {
  if (!text) return [];
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase()
    .replace(/[''´`’]s\b/g, 's') // There's -> theres, Snoopy's -> snoopys
    .replace(/[''´`’]/g, '') // Don't -> dont, '99 -> 99
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

  // 2. Keyword match: filter minor words if title has more than 2 words
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
 * Checks if episode matches for Series (checks both season & episode)
 */
function isEpisodeMatching(fileName, torrentName, season, episode) {
  if (season === undefined || episode === undefined) return true;

  const s = parseInt(season, 10);
  const e = parseInt(episode, 10);
  const sStr = s < 10 ? `0?${s}` : `${s}`;
  const eStr = e < 10 ? `0?${e}` : `${e}`;

  const combined = `${torrentName}/${fileName}`;

  // Check strict S01E01, 1x01, S1E1 pattern in combined path
  const strictPattern = new RegExp(`s${sStr}[.\\s_-]*e${eStr}([^0-9]|$)`, 'i');
  const xPattern = new RegExp(`(?:^|[^0-9])${s}x${eStr}([^0-9]|$)`, 'i');
  if (strictPattern.test(combined) || xPattern.test(combined)) {
    return true;
  }

  // Check if Season matches in path/torrent AND Episode matches in filename
  const seasonPattern = new RegExp(`(?:season|s)[.\\s_-]*${sStr}([^0-9]|$)`, 'i');
  const epPattern = new RegExp(`(?:^|[.\\s_#\\[\\(-])(?:e|ep|episode|tap|tập)?[.\\s_-]*${eStr}(?:[.\\s_#\\]\\)-]|$)`, 'i');

  const fileOnly = fileName.split('/').pop() || fileName;
  const isFileMatchingEp = epPattern.test(fileOnly);

  // If inside season pack (Season 1 folder) and file has episode 1
  if (seasonPattern.test(combined) && isFileMatchingEp) {
    // Ensure file does not belong to another season (e.g. S02E01)
    const otherSeasonPattern = new RegExp(`s(?:0?[^${s}0]|${s + 1})e`, 'i');
    if (!otherSeasonPattern.test(fileOnly)) {
      return true;
    }
  }

  return false;
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
 * Format bytes to readable size (1024-based binary size)
 */
function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  const num = Number(bytes);
  const gb = num / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = num / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

module.exports = {
  createTitleMatcher,
  isTitleMatching,
  isEpisodeMatching,
  parseQuality,
  formatSize,
  cleanTokens
};
