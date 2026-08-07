/**
 * Utility functions to generate and test regex patterns against torrent names / filenames.
 */

/**
 * Escapes regex special characters in a string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates a flexible regex pattern from title, year, season, episode.
 * 
 * @param {Object} options
 * @param {string} options.title - Movie or Series title (e.g. "Deadpool & Wolverine")
 * @param {number|string} [options.year] - Release year (e.g. 2024)
 * @param {number|string} [options.season] - Season number (e.g. 1)
 * @param {number|string} [options.episode] - Episode number (e.g. 5)
 * @param {string} [options.type] - "movie" or "series"
 * @param {string} [options.customIncludeRegex] - Extra regex pattern that MUST match if provided
 * @param {string} [options.customExcludeRegex] - Extra regex pattern that MUST NOT match if provided
 * @returns {{ pattern: RegExp, validate: (name: string) => boolean }}
 */
function createTitleMatcher({
  title,
  year,
  season,
  episode,
  type = 'movie',
  customIncludeRegex = '',
  customExcludeRegex = ''
}) {
  if (!title) {
    return {
      pattern: /.*/i,
      validate: () => false
    };
  }

  // Handle '&' vs 'and' flexibly
  const normalizedTitle = title
    .trim()
    .replace(/['":!?]/g, '');

  // Split into words, treating '&' or 'and' specially
  const words = normalizedTitle.split(/\s+/).filter(Boolean);
  const titleRegexPart = words.map(w => {
    if (w.toLowerCase() === '&' || w.toLowerCase() === 'and') {
      return '(?:&|and)';
    }
    return escapeRegex(w);
  }).join('[.\\s_#-]*');

  let fullPatternStr = titleRegexPart;

  if (type === 'series' && season !== undefined && episode !== undefined) {
    const sNum = parseInt(season, 10);
    const eNum = parseInt(episode, 10);
    const sStr = sNum < 10 ? `0?${sNum}` : `${sNum}`;
    const eStr = eNum < 10 ? `0?${eNum}` : `${eNum}`;

    // Match patterns like S01E05, S1E5, 1x05, 1x5, Season 1 Episode 5
    const sePattern = `(S${sStr}[.\\s_-]*E${eStr}|${sNum}x${eStr}|Season[.\\s_-]*${sNum}[.\\s_-]*Episode[.\\s_-]*${eNum})`;
    fullPatternStr = `${titleRegexPart}.*${sePattern}`;
  }

  const titleRegex = new RegExp(fullPatternStr, 'i');

  let includeRegex = null;
  if (customIncludeRegex && customIncludeRegex.trim()) {
    try {
      includeRegex = new RegExp(customIncludeRegex.trim(), 'i');
    } catch (e) {
      console.warn('Invalid custom include regex:', customIncludeRegex);
    }
  }

  let excludeRegex = null;
  if (customExcludeRegex && customExcludeRegex.trim()) {
    try {
      excludeRegex = new RegExp(customExcludeRegex.trim(), 'i');
    } catch (e) {
      console.warn('Invalid custom exclude regex:', customExcludeRegex);
    }
  }

  const validate = (name) => {
    if (!name) return false;

    // Check title pattern
    if (!titleRegex.test(name)) return false;

    // Check year if provided for movies (optional match or non-conflicting)
    if (type === 'movie' && year) {
      // If a 4-digit year is in the filename, ensure it matches or isn't a completely different year
      const yearMatches = name.match(/\b(19\d\d|20\d\d)\b/g);
      if (yearMatches && yearMatches.length > 0) {
        const expectedYear = parseInt(year, 10);
        // Allow +/- 1 year for edge cases in release dates
        const hasMatchingYear = yearMatches.some(y => {
          const parsed = parseInt(y, 10);
          return Math.abs(parsed - expectedYear) <= 1;
        });
        if (!hasMatchingYear) {
          return false;
        }
      }
    }

    // Check custom include regex if configured
    if (includeRegex && !includeRegex.test(name)) {
      return false;
    }

    // Check custom exclude regex if configured
    if (excludeRegex && excludeRegex.test(name)) {
      return false;
    }

    return true;
  };

  return {
    pattern: titleRegex,
    validate
  };
}

/**
 * Helper to parse resolution / quality from file or torrent name
 */
function parseQuality(name) {
  if (!name) return 'Unknown';
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
  parseQuality,
  formatSize,
  escapeRegex
};
