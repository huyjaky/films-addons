const manifest = {
  id: 'community.phimapi.addon',
  version: '1.0.0',
  name: 'PhimAPI - Phim Việt',
  description: 'Addon tìm kiếm và xem phim Vietsub, thuyết minh trực tiếp từ nguồn PhimAPI.com tiếng Việt.',
  // A beautiful cinematic icon
  logo: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=256&auto=format&fit=crop',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      id: 'phimapi-movies',
      type: 'movie',
      name: 'Phim lẻ PhimAPI',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      id: 'phimapi-series',
      type: 'series',
      name: 'Phim bộ PhimAPI',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    }
  ]
};

module.exports = manifest;
