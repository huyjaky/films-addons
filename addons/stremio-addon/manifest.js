const manifest = {
  id: 'community.phimapi.addon',
  version: '1.1.0',
  name: 'KKPhim - Phim Việt (WARP)',
  description: 'Addon xem phim Vietsub, thuyết minh trực tiếp từ nguồn KKPhim / PhimAPI, hỗ trợ liên kết IMDb cho Stremio và Nuvio.',
  logo: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=256&auto=format&fit=crop',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'kkphim', 'phimapi'],
  catalogs: [
    {
      id: 'kkphim-movies',
      type: 'movie',
      name: 'Phim lẻ KKPhim',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      id: 'kkphim-series',
      type: 'series',
      name: 'Phim bộ KKPhim',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      id: 'phimapi-movies',
      type: 'movie',
      name: 'Phim lẻ KKPhim',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      id: 'phimapi-series',
      type: 'series',
      name: 'Phim bộ KKPhim',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    }
  ]
};

module.exports = manifest;
