const assert = require('assert');
const {
  createTitleMatcher,
  isTitleMatching,
  isEpisodeMatching,
  cleanTokens,
  parseQuality,
  formatSize
} = require('../src/utils/regexMatcher');

console.log('🧪 Running TbCRS Unit Test Suite...\n');

// --- Test 1: Clean Tokens ---
{
  const tokens = cleanTokens('Spider-Man: Into the Spider-Verse (2018)');
  assert.deepStrictEqual(tokens, ['spider', 'man', 'into', 'the', 'spider', 'verse', '2018']);
  console.log('✅ Test 1 Passed: cleanTokens');
}

// --- Test 2: Movie Title Matching ---
{
  assert.strictEqual(
    isTitleMatching('The Last House', 'The.Last.House.2026.1080p.WEBRip.10Bit.DDP5.1.x265-NeoNoir'),
    true
  );
  assert.strictEqual(
    isTitleMatching('Spider-Man: Into the Spider-Verse', 'Spider-Man Into the Spider-Verse 2018 UHD 4K Hybrid BluRay 2160p ReMux HDR TrueHD Atmos 7.1-MgB.mkv'),
    true
  );
  assert.strictEqual(
    isTitleMatching('Captain America: Civil War', 'Captain.America.Civil.War.2016.2160p.BluRay.REMUX.HEVC.DTS-HD.MA.TrueHD.7.1.Atmos-FGT'),
    true
  );
  assert.strictEqual(
    isTitleMatching('Avatar: Fire and Ash', 'Avatar.Fire.And.Ash.2025.2160p.UHD.BluRay.REMUX.DV.P7.HDR.MULTi.TrueHD.Atmos-BTM'),
    true
  );
  assert.strictEqual(
    isTitleMatching('Fight Club', 'Fight.Club.1999.1080p.BluRay.x264.DTS-WiKi'),
    true
  );
  assert.strictEqual(
    isTitleMatching('The Matrix', 'Spider-Man.No.Way.Home.2021.mkv'),
    false
  );
  console.log('✅ Test 2 Passed: isTitleMatching (Movies)');
}

// --- Test 3: Multi-Title Candidates (TMDB + Cinemeta aliases) ---
{
  const matcher = createTitleMatcher({
    title: 'The Last House',
    titles: ['The Last House', '11817'],
    type: 'movie'
  });

  // Matches either the commercial release or working title release
  assert.strictEqual(
    matcher.validateFileInTorrent(
      'The.Last.House.2026.1080p.WEBRip.10Bit.DDP5.1.x265-NeoNoir.mkv',
      'The.Last.House.2026.1080p.WEBRip.10Bit.DDP5.1.x265-NeoNoir'
    ),
    true
  );
  assert.strictEqual(
    matcher.validateFileInTorrent(
      '11817.2026.1080p.mkv',
      '11817.2026.1080p-GROUP'
    ),
    true
  );
  console.log('✅ Test 3 Passed: Multi-title candidates');
}

// --- Test 4: Series Season & Episode Matching ---
{
  const matcher = createTitleMatcher({
    title: 'Game of Thrones',
    titles: ['Game of Thrones'],
    season: 1,
    episode: 1,
    type: 'series'
  });

  // Standard S01E01 file
  assert.strictEqual(
    matcher.validateFileInTorrent(
      'Game.of.Thrones.Season.1-8.COMPLETE.1080p.BluRay/Season 1/Game.of.Thrones.S01E01.1080p.BluRay.mkv',
      'Game.of.Thrones.Season.1-8.COMPLETE.1080p.BluRay'
    ),
    true
  );

  // S01E02 should NOT match S01E01 query
  assert.strictEqual(
    matcher.validateFileInTorrent(
      'Game.of.Thrones.Season.1-8.COMPLETE.1080p.BluRay/Season 1/Game.of.Thrones.S01E02.1080p.BluRay.mkv',
      'Game.of.Thrones.Season.1-8.COMPLETE.1080p.BluRay'
    ),
    false
  );

  // Season 2 Episode 1 should NOT match Season 1 Episode 1
  assert.strictEqual(
    matcher.validateFileInTorrent(
      'Game.of.Thrones.Season.1-8.COMPLETE.1080p.BluRay/Season 2/Game.of.Thrones.S02E01.1080p.BluRay.mkv',
      'Game.of.Thrones.Season.1-8.COMPLETE.1080p.BluRay'
    ),
    false
  );

  console.log('✅ Test 4 Passed: Series SxxExx matching');
}

// --- Test 5: Quality Parsing ---
{
  assert.strictEqual(parseQuality('Movie.2024.2160p.UHD.Remux.mkv'), '4K 2160p');
  assert.strictEqual(parseQuality('Movie.2024.1080p.BluRay.mkv'), '1080p');
  assert.strictEqual(parseQuality('Movie.2024.720p.HDTV.mkv'), '720p');
  console.log('✅ Test 5 Passed: parseQuality');
}

// --- Test 6: Size Formatting ---
{
  assert.strictEqual(formatSize(45721575866), '42.58 GB');
  assert.strictEqual(formatSize(1073741824), '1.00 GB');
  assert.strictEqual(formatSize(524288000), '500.00 MB');
  console.log('✅ Test 6 Passed: formatSize');
}

console.log('\n🎉 ALL UNIT TESTS PASSED SUCCESSFULLY!\n');
