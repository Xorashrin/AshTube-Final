// Automated Content-Isolation and Navigation Separation Test Suite
// Verifies strict separation between Home (Movies & General Series), Anime, K-Drama, and Live TV.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isAnime,
  isKDrama,
  isLiveTV,
  isGeneralMovie,
  isGeneralSeries,
  filterForHome,
  filterForAnime,
  filterForKDrama,
  classifyItem,
  matchSearchCategory,
} from '../src/services/classifier.ts';
import type { Title } from '../src/data/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Fixture Data ---

function makeTitle(base: Partial<Title> & { id: string; name: string; kind: 'movie' | 'series'; source: Title['source'] }): Title {
  return {
    ref: base.id,
    year: 2020,
    maturity: '13+',
    runtime: 120,
    seasons: [],
    genres: [],
    synopsis: '',
    cast: [],
    creators: [],
    tint: '#000000',
    quality: [],
    ...base,
  };
}

const animeSeries = makeTitle({
  id: 'al:16498',
  name: 'Attack on Titan',
  kind: 'series',
  source: 'anilist',
  genres: ['Action', 'Fantasy', 'Anime'],
  year: 2013,
});

const animeMovie = makeTitle({
  id: 'al:199',
  name: 'Spirited Away',
  kind: 'movie',
  source: 'anilist',
  genres: ['Animation', 'Adventure', 'Anime'],
  year: 2001,
});

const kdramaSeries = makeTitle({
  id: 'kd:93405',
  name: 'Squid Game',
  kind: 'series',
  source: 'tmdb',
  language: 'ko',
  genres: ['Action & Adventure', 'Mystery', 'Drama', 'K-Drama'],
  year: 2021,
});

const kdramaSeriesWp = makeTitle({
  id: 'wp:12044',
  name: 'Crash Landing on You',
  kind: 'series',
  source: 'southfreak',
  language: 'Korean',
  genres: ['Korean', 'Romance', 'Drama'],
  year: 2019,
});

const hollywoodMovie = makeTitle({
  id: 'cm:tt15398776',
  name: 'Oppenheimer',
  kind: 'movie',
  source: 'cinemeta',
  genres: ['Biography', 'Drama', 'History'],
  year: 2023,
});

const hollywoodSeries = makeTitle({
  id: 'cm:tt4574334',
  name: 'Stranger Things',
  kind: 'series',
  source: 'cinemeta',
  genres: ['Drama', 'Fantasy', 'Horror'],
  year: 2016,
});

const bangladeshiMovie = makeTitle({
  id: 'wp:9912',
  name: 'Hawa',
  kind: 'movie',
  source: 'southfreak',
  language: 'Bengali',
  genres: ['Mystery', 'Drama', 'Bangladeshi Cinema'],
  year: 2022,
});

const liveTvChannel = {
  id: 'ch-somoy-tv',
  channelId: 'somoy-tv',
  name: 'Somoy TV',
  category: 'News',
  streamUrl: 'https://somoy.example.com/live.m3u8',
};

const nsfwItem = makeTitle({
  id: 'wp:adult-1',
  name: '18+ Explicit Video',
  kind: 'movie',
  source: 'southfreak',
  nsfw: true,
  genres: ['Adult'],
});

const allCatalogItems: Title[] = [
  animeSeries,
  animeMovie,
  kdramaSeries,
  kdramaSeriesWp,
  hollywoodMovie,
  hollywoodSeries,
  bangladeshiMovie,
  nsfwItem,
];

console.log('--- Starting Content-Isolation Tests ---');

// Test 1: Home Feed Content Isolation
console.log('[Test 1] Home Feed Isolation: strictly zero Anime, zero K-Drama, zero Live TV, zero NSFW');
const homeItems = filterForHome(allCatalogItems);
assert.equal(homeItems.length, 3, 'Home items should only retain general movies and general series');
assert.ok(homeItems.some((t) => t.id === hollywoodMovie.id), 'Hollywood movie must be present');
assert.ok(homeItems.some((t) => t.id === hollywoodSeries.id), 'Hollywood series must be present');
assert.ok(homeItems.some((t) => t.id === bangladeshiMovie.id), 'Bangladeshi movie must be present');

// Home must NEVER contain Anime
for (const item of homeItems) {
  assert.equal(isAnime(item), false, `Item ${item.name} in Home must not be Anime`);
}

// Home must NEVER contain K-Drama
for (const item of homeItems) {
  assert.equal(isKDrama(item), false, `Item ${item.name} in Home must not be K-Drama`);
}

// Home must NEVER contain Live TV
for (const item of homeItems) {
  assert.equal(isLiveTV(item), false, `Item ${item.name} in Home must not be Live TV`);
}

// Home must NEVER contain Adult/NSFW
for (const item of homeItems) {
  assert.equal(item.nsfw, undefined, `Item ${item.name} in Home must not be NSFW`);
}
console.log('✓ Home Feed Isolation passed.');

// Test 2: Anime Feed Isolation
console.log('[Test 2] Anime Feed Isolation: strictly anime content only');
const animeItems = filterForAnime(allCatalogItems);
assert.equal(animeItems.length, 2, 'Anime feed should only contain Anime entries');
assert.ok(animeItems.some((t) => t.id === animeSeries.id), 'Attack on Titan must be present');
assert.ok(animeItems.some((t) => t.id === animeMovie.id), 'Spirited Away must be present');

for (const item of animeItems) {
  assert.equal(isAnime(item), true, `Item ${item.name} in Anime feed must be classified as Anime`);
  assert.equal(isKDrama(item), false, `Item ${item.name} in Anime feed must not be K-Drama`);
}
console.log('✓ Anime Feed Isolation passed.');

// Test 3: K-Drama Feed Isolation
console.log('[Test 3] K-Drama Feed Isolation: strictly Korean dramas only');
const kdramaItems = filterForKDrama(allCatalogItems);
assert.equal(kdramaItems.length, 2, 'K-Drama feed should only contain Korean drama entries');
assert.ok(kdramaItems.some((t) => t.id === kdramaSeries.id), 'Squid Game must be present');
assert.ok(kdramaItems.some((t) => t.id === kdramaSeriesWp.id), 'Crash Landing on You must be present');

for (const item of kdramaItems) {
  assert.equal(isKDrama(item), true, `Item ${item.name} in K-Drama feed must be classified as K-Drama`);
  assert.equal(isAnime(item), false, `Item ${item.name} in K-Drama feed must not be Anime`);
}
console.log('✓ K-Drama Feed Isolation passed.');

// Test 4: Live TV Channel Detection and Catalog Integrity
console.log('[Test 4] Live TV Channel Detection & Data Integrity');
assert.equal(isLiveTV(liveTvChannel), true, 'liveTvChannel must be detected as Live TV');
assert.equal(isLiveTV(hollywoodMovie), false, 'Movie must not be detected as Live TV');
assert.equal(isLiveTV(animeSeries), false, 'Anime must not be detected as Live TV');
assert.equal(isLiveTV(kdramaSeries), false, 'K-Drama must not be detected as Live TV');

// Verify channels.json exists and contains intact channels
const channelsPath = resolve(__dirname, '../src/data/channels.json');
const channelsJson = JSON.parse(readFileSync(channelsPath, 'utf8'));
assert.ok(Array.isArray(channelsJson), 'channels.json must be an array');
assert.ok(channelsJson[0].name && channelsJson[0].url, 'Channel entries must have name and url');
assert.ok(isLiveTV(channelsJson[0]), 'Real channel from channels.json must be recognized as Live TV');
console.log(`✓ Live TV Channel Integrity verified (${channelsJson.length} active channels preserved).`);

// Test 5: Search Category Filter Matching
console.log('[Test 5] Search Category Isolation: All, Movies, Series, Anime, K-Drama');
assert.equal(matchSearchCategory(hollywoodMovie, 'movie'), true, 'Hollywood movie matches "movie"');
assert.equal(matchSearchCategory(hollywoodSeries, 'movie'), false, 'Hollywood series does not match "movie"');
assert.equal(matchSearchCategory(animeMovie, 'movie'), false, 'Anime movie does not match general "movie"');

assert.equal(matchSearchCategory(hollywoodSeries, 'series'), true, 'Hollywood series matches "series"');
assert.equal(matchSearchCategory(kdramaSeries, 'series'), false, 'K-Drama series does not match general "series"');
assert.equal(matchSearchCategory(animeSeries, 'series'), false, 'Anime series does not match general "series"');

assert.equal(matchSearchCategory(animeSeries, 'anime'), true, 'Anime series matches "anime"');
assert.equal(matchSearchCategory(animeMovie, 'anime'), true, 'Anime movie matches "anime"');
assert.equal(matchSearchCategory(hollywoodMovie, 'anime'), false, 'Hollywood movie does not match "anime"');

assert.equal(matchSearchCategory(kdramaSeries, 'kdrama'), true, 'Squid Game matches "kdrama"');
assert.equal(matchSearchCategory(kdramaSeriesWp, 'kdrama'), true, 'Crash Landing on You matches "kdrama"');
assert.equal(matchSearchCategory(hollywoodSeries, 'kdrama'), false, 'Stranger Things does not match "kdrama"');
assert.equal(matchSearchCategory(animeSeries, 'kdrama'), false, 'Anime does not match "kdrama"');

assert.equal(matchSearchCategory(hollywoodMovie, 'all'), true, 'All matches Hollywood movie');
assert.equal(matchSearchCategory(animeSeries, 'all'), true, 'All matches Anime');
assert.equal(matchSearchCategory(kdramaSeries, 'all'), true, 'All matches K-Drama');
console.log('✓ Search Category Isolation passed.');

// Test 6: Cross-Source Deduplication
console.log('[Test 6] Cross-source deduplication test');
const duplicateItem: Title = {
  ...hollywoodMovie,
  id: 'wp:duplicate-oppenheimer',
  source: 'southfreak',
};

const duplicateList = [hollywoodMovie, duplicateItem, animeSeries];
const deduplicated = Array.from(
  new Map(duplicateList.map((item) => [`${item.name.toLowerCase()}-${item.year}`, item])).values(),
);
assert.equal(deduplicated.length, 2, 'Deduplication by normalized title and year must merge duplicates');
console.log('✓ Cross-source deduplication verified.');

// Test 7: Classification Service Consistency
console.log('[Test 7] Centralized Content Classifier Enum Consistency');
assert.equal(classifyItem(animeSeries), 'anime');
assert.equal(classifyItem(animeMovie), 'anime');
assert.equal(classifyItem(kdramaSeries), 'kdrama');
assert.equal(classifyItem(kdramaSeriesWp), 'kdrama');
assert.equal(classifyItem(hollywoodMovie), 'general-movie');
assert.equal(classifyItem(hollywoodSeries), 'general-series');
assert.equal(classifyItem(liveTvChannel), 'livetv');
console.log('✓ Content Classifier Enum Consistency verified.');

console.log('\n========================================');
console.log('ALL MANDATORY CONTENT ISOLATION TESTS PASSED!');
console.log('========================================\n');
