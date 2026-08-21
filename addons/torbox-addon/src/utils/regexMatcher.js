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
 * Normalizes title for flexible matching (removes accents, punctuation, handles '&' vs 'and', Roman numerals)
 */
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/['":!?,.\-_/]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Generates a flexible regex pattern from title, year, season, episode.
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
      validate: () => false,
      validateFileInTorrent: () => false
    };
  }

  const normalized = normalizeTitle(title);
  const words = normalized.split(/\s+/).filter(Boolean);

  // Generate word-separated pattern matching spaces, dots, underscores, dashes
  const titleRegexPart = words.map(w => {
    const lower = w.toLowerCase();
    if (lower === '&' || lower === 'and') return '(?:&|and)';
    if (lower === '2' || lower === 'ii') return '(?:2|ii)';
    if (lower === '3' || lower === 'iii') return '(?:3|iii)';
    if (lower === '4' || lower === 'iv') return '(?:4|iv)';
    if (lower === '5' || lower === 'v') return '(?:5|v)';
    return escapeRegex(w);
  }).join('[.\\s_#-]+');

  const titleRegex = new RegExp(`(^|[^a-zA-Z0-9])${titleRegexPart}($|[^a-zA-Z0-9])`, 'i');
  const simpleTitleRegex = new RegExp(titleRegexPart, 'i');

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

  /**
   * Checks episode pattern in a file name
   */
  const matchEpisodeInString = (str, sNum, eNum) => {
    if (!str) return false;
    const sStr = sNum < 10 ? `0?${sNum}` : `${sNum}`;
    const eStr = eNum < 10 ? `0?${eNum}` : `${eNum}`;

    // Standard patterns: S01E05, S1E5, 1x05, 1x5, Season 1 Episode 5, Ep 5, Episode 5, E05, [05], - 05
    const patterns = [
      new RegExp(`S${sStr}[.\\s_-]*E${eStr}([^0-9]|$)`, 'i'),
      new RegExp(`${sNum}x${eStr}([^0-9]|$)`, 'i'),
      new RegExp(`(?:Season|Series)[.\\s_-]*${sStr}[.\\s_-]*(?:Episode|Ep|Part|Tap|Tập)[.\\s_-]*${eStr}([^0-9]|$)`, 'i'),
      new RegExp(`(?:^|[.\\s_#\\[\\(-])(?:E|Ep|Episode|Tap|Tập)[.\\s_-]*${eStr}(?:[.\\s_#\\]\\)-]|$)`, 'i'),
      new RegExp(`(?:^|[.\\s_#\\[\\(-])${eStr}(?:[.\\s_#\\]\\)-]|$)`, 'i')
    ];

    return patterns.some(p => p.test(str));
  };

  /**
   * Checks season pattern in a torrent or folder name
   */
  const matchSeasonInString = (str, sNum) => {
    if (!str) return false;
    const sStr = sNum < 10 ? `0?${sNum}` : `${sNum}`;
    const patterns = [
      new RegExp(`S${sStr}([^0-9]|$)`, 'i'),
      new RegExp(`(?:Season|Series)[.\\s_-]*${sStr}([^0-9]|$)`, 'i'),
      new RegExp(`Season[.\\s_-]*${sNum}`, 'i')
    ];
    return patterns.some(p => p.test(str));
  };

  /**
   * Validates a standalone name (file or torrent)
   */
  const validate = (name) => {
    if (!name) return false;
    if (!simpleTitleRegex.test(name)) return false;

    if (includeRegex && !includeRegex.test(name)) return false;
    if (excludeRegex && excludeRegex.test(name)) return false;

    if (type === 'movie' && year) {
      const yearMatches = name.match(/\b(19\d\d|20\d\d)\b/g);
      if (yearMatches && yearMatches.length > 0) {
        const expectedYear = parseInt(year, 10);
        const hasMatchingYear = yearMatches.some(y => Math.abs(parseInt(y, 10) - expectedYear) <= 1);
        if (!hasMatchingYear) return false;
      }
    }

    if (type === 'series' && season !== undefined && episode !== undefined) {
      return matchEpisodeInString(name, parseInt(season, 10), parseInt(episode, 10));
    }

    return true;
  };

  /**
   * Validates a file in context of its containing torrent (crucial for Season Packs!)
   */
  const validateFileInTorrent = (fileName, torrentName) => {
    const file = fileName || '';
    const torrent = torrentName || '';

    if (includeRegex && !(includeRegex.test(file) || includeRegex.test(torrent))) return false;
    if (excludeRegex && (excludeRegex.test(file) || excludeRegex.test(torrent))) return false;

    // 1. Direct match on file name alone
    if (validate(file)) return true;

    // 2. For Movies: Torrent name matches title and file is video
    if (type === 'movie') {
      if (simpleTitleRegex.test(torrent) || simpleTitleRegex.test(file)) {
        if (year) {
          const combined = `${torrent} ${file}`;
          const yearMatches = combined.match(/\b(19\d\d|20\d\d)\b/g);
          if (yearMatches && yearMatches.length > 0) {
            const expectedYear = parseInt(year, 10);
            const hasMatchingYear = yearMatches.some(y => Math.abs(parseInt(y, 10) - expectedYear) <= 1);
            if (!hasMatchingYear) return false;
          }
        }
        return true;
      }
      return false;
    }

    // 3. For Series Season Packs:
    // Torrent matches title & season, and file matches episode number!
    if (type === 'series' && season !== undefined && episode !== undefined) {
      const sNum = parseInt(season, 10);
      const eNum = parseInt(episode, 10);

      const titleMatchesTorrent = simpleTitleRegex.test(torrent);
      const seasonMatchesTorrent = matchSeasonInString(torrent, sNum);
      const episodeMatchesFile = matchEpisodeInString(file, sNum, eNum);

      if (titleMatchesTorrent && (seasonMatchesTorrent || matchSeasonInString(file, sNum)) && episodeMatchesFile) {
        return true;
      }

      // If torrent name has title, and file has S01E05
      if (titleMatchesTorrent && matchEpisodeInString(file, sNum, eNum)) {
        return true;
      }
    }

    return false;
  };

  return {
    pattern: simpleTitleRegex,
    validate,
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
  parseQuality,
  formatSize,
  escapeRegex,
  normalizeTitle
};
