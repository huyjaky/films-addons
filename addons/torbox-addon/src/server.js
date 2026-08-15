const express = require('express');
const cors = require('cors');
const path = require('path');
const { createHash, timingSafeEqual } = require('crypto');
require('dotenv').config();

const { getMediaMetadata } = require('./services/cinemeta');
const {
  getUserTorrents,
  buildStreamPermalink,
  isVideoFile
} = require('./services/torbox');
const {
  createTitleMatcher,
  parseQuality,
  formatSize
} = require('./utils/regexMatcher');

const app = express();
const PORT = process.env.PORT || 7000;
const accessHash = process.env.TBCRS_ACCESS_HASH || '';

if (!/^[a-f0-9]{64}$/i.test(accessHash)) {
  throw new Error('TBCRS_ACCESS_HASH must be a SHA-256 hex digest');
}

const expectedAccessHash = Buffer.from(accessHash, 'hex');

function hasAccess(config) {
  const suppliedHash = createHash('sha256').update(config?.accessToken || '').digest();
  return timingSafeEqual(expectedAccessHash, suppliedHash);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Generates the Stremio Addon Manifest
 */
function getManifest(config = null, req = null) {
  const isConfigured = Boolean(config && config.apiKey);
  let logoUrl = '/icon.png';
  if (req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    if (host) {
      logoUrl = `${protocol}://${host}/icon.png`;
    }
  }

  return {
    id: 'com.torbox.cached.regex',
    version: '1.0.0',
    name: 'TbCRS',
    description: 'Regex search cached torrents in your Torbox cloud for Stremio & Nuvio.',
    logo: logoUrl,
    icon: logoUrl,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb'],
    catalogs: [],
    behaviorHints: {
      configurable: true,
      configurationRequired: !isConfigured
    }
  };
}

/**
 * Decodes base64 configuration string from URL path
 */
function parseConfig(rawConfig) {
  if (!rawConfig) return null;
  try {
    const decoded = Buffer.from(rawConfig, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (e) {
    // If not base64, check if it's plain json or API key string
    if (typeof rawConfig === 'string' && rawConfig.length > 10) {
      return { apiKey: rawConfig };
    }
    return null;
  }
}

// Manifest endpoints
app.get('/manifest.json', (req, res) => {
  res.json(getManifest(null, req));
});

app.get('/:config/manifest.json', (req, res) => {
  const config = parseConfig(req.params.config);
  if (!hasAccess(config)) return res.status(401).json({ error: 'Unauthorized' });
  res.json(getManifest(config, req));
});


// Configure Web UI endpoints
app.get(['/configure', '/:config/configure'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'configure.html'));
});

// Stream endpoints (Stremio & Nuvio v3 format)
app.get(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], async (req, res) => {
  const { type, id } = req.params;
  const rawConfig = req.params.config;
  const config = parseConfig(rawConfig);

  if (!hasAccess(config)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // If no API key configured, prompt user to configure
  if (!config || !config.apiKey) {
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol || 'http';
    return res.json({
      streams: [
        {
          name: 'TbCRS Addon',
          title: '⚠️ Please configure your Torbox API Key in Addon Settings',
          externalUrl: `${protocol}://${host}/configure`
        }
      ]
    });
  }

  const apiKey = config.apiKey;
  const includeRegex = config.includeRegex || '';
  const excludeRegex = config.excludeRegex || '';
  try {
    // 1. Fetch metadata (Title, Year, Season, Episode) from Cinemeta
    const meta = await getMediaMetadata(type, id);
    if (!meta.title) {
      console.warn(`[Stream] Could not resolve title for ${type}/${id}`);
      return res.json({ streams: [] });
    }

    console.log(`[Stream] Searching Torbox for: "${meta.title}" (${meta.year || 'N/A'}) - Type: ${type}`);

    // 2. Create Title & Regex matcher
    const matcher = createTitleMatcher({
      title: meta.title,
      year: meta.year,
      season: meta.season,
      episode: meta.episode,
      type: meta.type,
      customIncludeRegex: includeRegex,
      customExcludeRegex: excludeRegex
    });

    const streams = [];

    // 3. Fetch the user's TorBox cloud
    const cloudRes = await getUserTorrents(apiKey);

    if (cloudRes.authError) {
      const host = req.get('host') || `localhost:${PORT}`;
      const protocol = req.protocol || 'http';
      return res.json({
        streams: [
          {
            name: '[TbCRS Addon]',
            title: '⚠️ TorBox API Token Error: Invalid or Expired API Key!\nPlease update API Key in Addon Settings.',
            externalUrl: `${protocol}://${host}/configure`
          }
        ]
      });
    }

    const userTorrents = cloudRes.torrents || [];

    // Process User Cloud results
    for (const torrent of userTorrents) {
      const torrentName = torrent.name || '';
      const files = torrent.files || [];

      for (const file of files) {
        const fileName = file.name || torrentName;
        
        if (isVideoFile(fileName) && (matcher.validate(fileName) || matcher.validate(torrentName))) {
          const streamUrl = buildStreamPermalink(apiKey, torrent.id, file.id);
          const quality = parseQuality(fileName);
          const sizeStr = formatSize(file.size);

          streams.push({
            name: `[TbCRS Cloud]`,
            title: `${fileName}\n⚡ Cached | ${quality} | ${sizeStr}`,
            url: streamUrl,
            quality: quality,
            behaviorHints: {
              filename: fileName,
              videoSize: Number(file.size) || undefined
            }
          });
        }
      }
    }

    // Sort streams by quality (4K > 1080p > 720p > others)
    streams.sort((a, b) => {
      const qMap = { '4K 2160p': 4, '1080p': 3, '720p': 2, '480p': 1, 'HD': 1, 'Unknown': 0 };
      return (qMap[b.quality] || 0) - (qMap[a.quality] || 0);
    });

    return res.json({ streams });
  } catch (error) {
    console.error(`[Stream Error] ${type}/${id}:`, error);
    return res.json({ streams: [] });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'torbox-cached-regex-addon' });
});

app.listen(PORT, () => {
  console.log(`🚀 Torbox Cached Regex Addon running on port ${PORT}`);
  console.log(`👉 Configure page: http://localhost:${PORT}/configure`);
  console.log(`👉 Manifest URL:  http://localhost:${PORT}/manifest.json`);
});
