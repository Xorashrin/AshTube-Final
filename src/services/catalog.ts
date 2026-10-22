// Catalog: every row on every screen is loaded here, live, from the source adapters.
// Feeds are cached (stale-while-revalidate) so the app opens instantly and still shows
// the last good content when a source is down.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { isListed, useAvailabilityVersion } from './availabilityStore';
import { verifyLater } from './availability';

import { tintFor, type Title } from '../data/types';
import { cached } from './cache';
import * as amaderftp from './sources/amaderftp';
import * as anilist from './sources/anilist';
import * as bdix from './sources/bdix';
import * as cinemeta from './sources/cinemeta';
import * as kdrama from './sources/kdrama';
import * as stremio from './sources/stremio';
import { CATEGORY, listPosts, SOUTHFREAK, SOUTHFREAK_18 } from './sources/wordpress';
import { filterForHome } from './classifier';

const NEW_WINDOW = 72 * 3600 * 1000;
const FEED_TTL = 12 * 60 * 1000;
const SAVED_KEY = 'mythtube:titles:v1';

// ---------------------------------------------------------------- title registry

const registry = new Map<string, Title>();

export function register(titles: Title[]): Title[] {
  const now = Date.now();
  return titles.map((t) => {
    const prev = registry.get(t.id);
    const merged = prev?.detailed && !t.detailed ? { ...t, ...prev, badge: undefined } : t;
    const fresh = merged.addedAt !== undefined && now - merged.addedAt < NEW_WINDOW;
    const final: Title = { ...merged, badge: merged.airing ? 'airing' : fresh ? 'new' : undefined };
    registry.set(t.id, final);
    return final;
  });
}

function stub(id: string): Title {
  const isKd = id.startsWith('kd:');
  const isAl = id.startsWith('al:');
  const isFtp = id.startsWith('ft:');
  return {
    id,
    source: isKd ? 'kdrama' : isAl ? 'anilist' : isFtp ? 'amaderftp' : 'cinemeta',
    ref: id.replace(/^(kd:|al:|cm:|ft:)/, ''),
    name: 'Loading…',
    kind: isKd || isAl ? 'series' : 'movie',
    year: new Date().getFullYear(),
    maturity: '13+',
    runtime: 0,
    seasons: [],
    genres: [],
    synopsis: '',
    cast: [],
    creators: [],
    tint: tintFor(id),
    quality: [],
    detailed: false,
  };
}

/** Synchronous lookup. Titles that were never loaded this session (or restored from storage) resolve to a stub. */
export function resolveTitle(id: string): Title {
  return registry.get(id) ?? stub(id);
}

/** Titles seen this session or restored from storage: feeds the search suggestions. */
export function registeredNames(): string[] {
  return [...new Set([...registry.values()].map((t) => t.name))];
}

export function hasTitle(id: string): boolean {
  return registry.has(id);
}

/** Restore titles saved for My List, progress and downloads so they survive restarts and offline. */
export async function loadSavedTitles(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    if (raw) for (const t of JSON.parse(raw) as Title[]) if (!registry.has(t.id)) registry.set(t.id, t);
  } catch {
    // first run
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function saveTitles(ids: string[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const list = [...new Set(ids)].map((id) => registry.get(id)).filter((t): t is Title => !!t).map((t) => ({ ...t, seasons: t.seasons.length > 40 ? [] : t.seasons }));
    AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list)).catch(() => undefined);
  }, 800);
}

// ---------------------------------------------------------------- detail

const detailJobs = new Map<string, Promise<Title>>();

/** Fills in cast, runtime and real episode lists. Safe to call repeatedly. */
export function loadDetail(id: string): Promise<Title> {
  const base = registry.get(id);
  if (base?.detailed) return Promise.resolve(base);
  const running = detailJobs.get(id);
  if (running) return running;
  const job = (async () => {
    try {
      let fresh: Title;
      if (id.startsWith('kd:')) {
        const tmdbId = parseInt(id.replace(/^kd:/, ''), 10);
        fresh = base ? await kdrama.detailKDrama(base) : await kdrama.detailKDramaById(tmdbId);
      } else if (id.startsWith('al:') || base?.source === 'anilist') {
        const alId = parseInt((base?.ref ?? id).replace(/^al:/, ''), 10);
        fresh = base ? await anilist.detail(base) : await anilist.detailAnimeById(alId);
      } else if (base?.source === 'cinemeta' || id.startsWith('cm:') || id.startsWith('tt')) {
        const ref = base?.ref ?? id.replace(/^cm:/, '');
        const titleToDetail = base ?? {
          id, source: 'cinemeta' as const, ref, name: 'Loading…', kind: 'movie' as const, year: new Date().getFullYear(),
          maturity: '13+', runtime: 0, seasons: [], genres: [], synopsis: '', cast: [], creators: [], tint: tintFor(id), quality: []
        };
        fresh = await cinemeta.detail(titleToDetail);
      } else if (base?.source === 'amaderftp') {
        fresh = await amaderftp.detail(base);
      } else if (base) {
        fresh = { ...base, detailed: true };
      } else {
        return stub(id);
      }
      return register([fresh])[0];
    } catch {
      return base ?? stub(id);
    } finally {
      detailJobs.delete(id);
    }
  })();
  detailJobs.set(id, job);
  return job;
}

// ---------------------------------------------------------------- feeds

export interface RowDef {
  key: string;
  title: string;
  load: (force?: boolean) => Promise<Title[]>;
  nsfw?: boolean;
}

const feed = (key: string, load: () => Promise<Title[]>, ttl = FEED_TTL) => async (force?: boolean) =>
  register(await cached(`feed:${key}`, { ttl, force }, load));

function wp(key: string, category: number | undefined, perPage = 20): RowDef['load'] {
  return feed(`sf:${key}`, () => listPosts(SOUTHFREAK, { category, perPage }));
}

const byDateDesc = (a: Title, b: Title) => (b.addedAt ?? 0) - (a.addedAt ?? 0);

/** Strictly movies and series only (no anime, no kdrama, no adult, no live TV) for Home Feed */
export function filterHomeMedia(items: Title[]): Title[] {
  return filterForHome(items);
}

export const HOME_ROWS: RowDef[] = [
  { key: 'cm-movies-trending', title: 'Trending Movies', load: feed('cm:movie:trending', async () => filterHomeMedia(await cinemeta.catalog('movie'))) },
  { key: 'cm-series-trending', title: 'Trending Series', load: feed('cm:series:trending', async () => filterHomeMedia(await cinemeta.catalog('series'))) },
  { key: 'sf-latest', title: 'Recently Added', load: feed('sf:latest', async () => filterHomeMedia(await listPosts(SOUTHFREAK, { perPage: 24 }))) },
  { key: 'cm-movies-popular', title: 'Popular Movies', load: feed('cm:movie:popular', async () => filterHomeMedia(await cinemeta.catalog('movie', { skip: 50 }))) },
  { key: 'cm-series-popular', title: 'Popular Series', load: feed('cm:series:popular', async () => filterHomeMedia(await cinemeta.catalog('series', { skip: 50 }))) },
  { key: 'ft-latest', title: 'Top Rated Fast Streams', load: feed('ft:latest', async () => filterHomeMedia(await amaderftp.latest())) },
  { key: 'sf-hollywood', title: 'Hollywood', load: feed('sf:hollywood', async () => filterHomeMedia(await listPosts(SOUTHFREAK, { category: CATEGORY.hollywood }))) },
  { key: 'sf-hindi', title: 'Bollywood & Hindi', load: feed('sf:hindi', async () => filterHomeMedia(await listPosts(SOUTHFREAK, { category: CATEGORY.hindiDubbed }))) },
  { key: 'sf-south', title: 'South Indian Cinema', load: feed('sf:south', async () => filterHomeMedia((await Promise.all([CATEGORY.telugu, CATEGORY.tamil, CATEGORY.malayalam].map((c) => listPosts(SOUTHFREAK, { category: c, perPage: 10 }).catch(() => [])))).flat().sort(byDateDesc))) },
  { key: 'sf-dual', title: 'International Cinema', load: feed('sf:dual', async () => filterHomeMedia(await listPosts(SOUTHFREAK, { category: CATEGORY.dualAudio }))) },
  { key: 'sf-bangla', title: 'Bangladeshi & Natok', load: feed('sf:bangla', async () => filterHomeMedia(await listPosts(SOUTHFREAK, { category: CATEGORY.bengali }))) },
  { key: 'sf-scifi', title: 'Sci-Fi & Thriller', load: feed('sf:scifi', async () => filterHomeMedia(await listPosts(SOUTHFREAK, { category: CATEGORY.scifi }))) },
  { key: 'sf-horror', title: 'Horror', load: feed('sf:horror', async () => filterHomeMedia(await listPosts(SOUTHFREAK, { category: CATEGORY.horror }))) },
];

const anime = (key: string, title: string, o: anilist.BrowseOptions, ttl = FEED_TTL): RowDef => ({
  key,
  title,
  load: feed(`al:${key}`, () => anilist.browse(o), ttl),
});

const THIS_SEASON = anilist.currentSeason();
const NEXT_SEASON = anilist.nextSeason();

export const ANIME_GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

/** Rows of the Anime tab: AniList discovery (new episodes, seasons, rankings, genres). */
export const ANIME_ROWS: RowDef[] = [
  { key: 'an-schedule', title: 'Airing This Week', load: feed('al:schedule', () => anilist.upcoming(7), 30 * 60 * 1000) },
  anime('an-trending', 'Trending Now', { sort: 'TRENDING_DESC' }),
  anime('an-season', 'This Season', { sort: 'POPULARITY_DESC', season: THIS_SEASON.season, seasonYear: THIS_SEASON.year }),
  anime('an-airing', 'Currently Airing', { sort: 'POPULARITY_DESC', status: 'RELEASING' }),
  anime('an-popular', 'All-Time Popular', { sort: 'POPULARITY_DESC' }, 6 * 3600 * 1000),
  anime('an-top', 'Top Rated', { sort: 'SCORE_DESC' }, 6 * 3600 * 1000),
  anime('an-movies', 'Anime Movies', { sort: 'POPULARITY_DESC', format: ['MOVIE'] }, 6 * 3600 * 1000),
  anime('an-next', 'Coming Next Season', { sort: 'POPULARITY_DESC', season: NEXT_SEASON.season, seasonYear: NEXT_SEASON.year }, 6 * 3600 * 1000),
  anime('an-action', 'Action', { sort: 'POPULARITY_DESC', genre: 'Action' }, 6 * 3600 * 1000),
  anime('an-romance', 'Romance', { sort: 'POPULARITY_DESC', genre: 'Romance' }, 6 * 3600 * 1000),
  anime('an-fantasy', 'Fantasy', { sort: 'POPULARITY_DESC', genre: 'Fantasy' }, 6 * 3600 * 1000),
  anime('an-comedy', 'Comedy', { sort: 'POPULARITY_DESC', genre: 'Comedy' }, 6 * 3600 * 1000),
  anime('an-scifi', 'Sci-Fi', { sort: 'POPULARITY_DESC', genre: 'Sci-Fi' }, 6 * 3600 * 1000),
];

export async function loadAnimeGenre(genre: string, page: number): Promise<Title[]> {
  return register(await anilist.browse({ sort: 'POPULARITY_DESC', genre, page, perPage: 30 }));
}

export interface AnimeBatchQuery {
  page: number;
  category?: string;
  genre?: string | null;
  sort?: string;
  signal?: AbortSignal;
  force?: boolean;
}

export interface AnimeBatchResult {
  items: Title[];
  hasNextPage: boolean;
}

/** Paginated anime feed loader with server-backed pageInfo.hasNextPage */
export async function loadAnimeFeed(q: AnimeBatchQuery): Promise<AnimeBatchResult> {
  const options: anilist.BrowseOptions = {
    sort: q.sort ?? 'POPULARITY_DESC',
    page: q.page,
    perPage: 30,
    genre: q.genre || undefined,
    signal: q.signal,
  };

  const cat = (q.category ?? '').toLowerCase();
  if (cat.includes('trend')) {
    options.sort = 'TRENDING_DESC';
  } else if (cat.includes('top')) {
    options.sort = 'SCORE_DESC';
  } else if (cat.includes('ongoing') || cat.includes('airing') || cat.includes('releasing')) {
    options.status = 'RELEASING';
    options.sort = 'POPULARITY_DESC';
  } else if (cat.includes('recently released') || cat.includes('recent')) {
    options.sort = 'START_DATE_DESC';
  } else if (cat.includes('upcoming')) {
    options.status = 'NOT_YET_RELEASED';
    options.sort = 'POPULARITY_DESC';
  } else if (cat.includes('this season') || cat === 'season') {
    options.season = THIS_SEASON.season;
    options.seasonYear = THIS_SEASON.year;
    options.sort = 'POPULARITY_DESC';
  } else if (cat.includes('next season')) {
    options.season = NEXT_SEASON.season;
    options.seasonYear = NEXT_SEASON.year;
    options.sort = 'POPULARITY_DESC';
  } else if (cat.includes('updated')) {
    options.sort = 'UPDATED_AT_DESC';
  } else if (cat.includes('completed') || cat.includes('finished')) {
    options.status = 'FINISHED';
    options.sort = 'END_DATE_DESC';
  } else if (cat.includes('classic')) {
    options.startDate_lesser = 20050000;
    options.sort = 'SCORE_DESC';
  } else if (cat.includes('movie')) {
    options.format = ['MOVIE'];
  } else if (cat === 'tv anime' || cat === 'tv' || cat.includes('series')) {
    options.format = ['TV'];
  } else if (cat.includes('ova')) {
    options.format = ['OVA', 'ONA'];
  } else if (cat.includes('special')) {
    options.format = ['SPECIAL', 'TV_SHORT'];
  } else if (cat.includes('donghua')) {
    options.countryOfOrigin = 'CN';
  }

  const cacheKey = `anime:feed:${cat || 'all'}:${q.genre ?? 'all'}:${q.page}`;
  return cached<AnimeBatchResult>(cacheKey, { ttl: FEED_TTL, force: q.force }, async () => {
    const res = await anilist.browsePage(options);
    const items = register(res.items);
    return { items, hasNextPage: res.hasNextPage };
  });
}

/** Paginated anime loader for continuous infinite scrolling */
export async function loadAnimeBatch(
  queryOrPage: number | AnimeBatchQuery,
  genre?: string | null,
  sort = 'POPULARITY_DESC',
  signal?: AbortSignal,
): Promise<Title[]> {
  if (typeof queryOrPage === 'object') {
    const res = await loadAnimeFeed(queryOrPage);
    return res.items;
  }
  const titles = await anilist.browse({
    sort,
    genre: genre || undefined,
    page: queryOrPage,
    perPage: 30,
    signal,
  });
  return register(titles);
}

export const ADULT_ROWS: RowDef[] = stremio.ONLYPORN_CATALOGS.map((c) => ({
  key: `sx-${c.id}`,
  title: c.name,
  load: feed(`sx:${c.id}`, () => stremio.catalog(stremio.ONLYPORN, c.id)),
  nsfw: true,
}));

export async function loadAdultPage(page: number): Promise<Title[]> {
  return register(await listPosts(SOUTHFREAK_18, { page, perPage: 30 }));
}

// ---------------------------------------------------------------- search

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function score(t: Title, q: string): number {
  const n = norm(t.name);
  // Bangladeshi content wins ties.
  const bonus = /beng|bangla|bangladesh/i.test(`${t.language ?? ''} ${t.genres.join(' ')}`) ? 12 : 0;
  if (n === q) return 100 + bonus;
  if (n.startsWith(q)) return 80 + bonus;
  if (n.includes(q)) return 60 + bonus;
  return (q.split(' ').every((w) => n.includes(w)) ? 40 : 10) + bonus;
}

/** BDIX folders → one title per distinct movie name, with every matching file attached. */
async function bdixTitles(query: string): Promise<Title[]> {
  const hits = await bdix.search(query, 8000);
  const byName = new Map<string, { name: string; year: number; files: { url: string; label: string }[]; server: string }>();
  for (const { server, files } of hits) {
    for (const f of files) {
      const base = f.label.replace(/\.[a-z0-9]{2,4}$/i, '');
      const cut = /^(.*?)[\s._(\[]+((?:19|20)\d{2})\b/.exec(base);
      const name = (cut ? cut[1] : base.split(/[\s._]+(?:\d{3,4}p|WEB|BluRay|HDRip)/i)[0]).replace(/[._]+/g, ' ').trim();
      if (!name) continue;
      const year = cut ? Number(cut[2]) : new Date().getFullYear();
      const key = `${norm(name)}-${year}`;
      const entry = byName.get(key) ?? { name, year, files: [], server: server.name };
      entry.files.push(f);
      byName.set(key, entry);
    }
  }
  return [...byName.values()].map((e) => bdix.filesToTitle(e.name, e.year, e.files, e.server));
}

// ---------------------------------------------------------------- endless feed
// After the fixed rows, Home keeps producing new rows as you scroll: genres and categories for Movies and Series.
// (Strictly NO anime on the Home feed - anime discovery is entirely in the Anime tab).

const CM_MOVIE_GENRES = ['Action', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Sci-Fi', 'Romance', 'Crime', 'Adventure', 'Fantasy', 'Mystery', 'Family', 'Documentary', 'War', 'History'];
const CM_SERIES_GENRES = ['Drama', 'Comedy', 'Crime', 'Action', 'Sci-Fi', 'Mystery', 'Fantasy', 'Documentary', 'Romance', 'Horror', 'Adventure', 'Family', 'History'];
const SF_CATEGORIES: [string, number][] = [
  ['Hindi Dubbed', CATEGORY.hindiDubbed], ['Hollywood', CATEGORY.hollywood], ['Bollywood', CATEGORY.bollywood], ['Dual Audio', CATEGORY.dualAudio],
  ['Telugu', CATEGORY.telugu], ['Tamil', CATEGORY.tamil], ['Malayalam', CATEGORY.malayalam], ['Bangla', CATEGORY.bengali],
  ['Thriller', 8], ['Comedy', 9], ['Action', 3], ['Drama', 10], ['Romance', 6], ['Crime', 7], ['Adventure', 33],
];

/** Row number `i` of the endless feed (strictly Movies & Series). */
export function feedRow(i: number): RowDef {
  const lane = i % 3;
  const n = Math.floor(i / 3);
  const more = (page: number) => (page > 1 ? 'More ' : '');
  if (lane === 0) {
    const genre = CM_MOVIE_GENRES[n % CM_MOVIE_GENRES.length];
    const page = Math.floor(n / CM_MOVIE_GENRES.length);
    return {
      key: `feed-${i}`,
      title: `${more(page + 1)}${genre} Movies`,
      load: feed(`feed:cm:m:${genre}:${page}`, async () => filterHomeMedia(await cinemeta.catalog('movie', { genre, skip: page * 50 })), 6 * 3600 * 1000),
    };
  }
  if (lane === 1) {
    const [name, id] = SF_CATEGORIES[n % SF_CATEGORIES.length];
    const page = Math.floor(n / SF_CATEGORIES.length) + 1;
    return {
      key: `feed-${i}`,
      title: `${more(page)}${name}`,
      load: feed(`feed:sf:${id}:${page}`, async () => filterHomeMedia(await listPosts(SOUTHFREAK, { category: id, perPage: 20, page })), 6 * 3600 * 1000),
    };
  }
  const genre = CM_SERIES_GENRES[n % CM_SERIES_GENRES.length];
  const page = Math.floor(n / CM_SERIES_GENRES.length);
  return {
    key: `feed-${i}`,
    title: `${more(page + 1)}${genre} Series`,
    load: feed(`feed:cm:s:${genre}:${page}`, async () => filterHomeMedia(await cinemeta.catalog('series', { genre, skip: page * 50 })), 6 * 3600 * 1000),
  };
}

/** Grows by a few rows every time the user nears the end of the list. */
export function useFeedRows() {
  const [rows, setRows] = useState<RowState[]>([]);
  const requested = useRef(0);
  const loading = useRef(0);
  const availability = useAvailabilityVersion();
  const stable = useRef(new Map<string, { src: Title[]; out: Title[]; v: number }>()).current;

  const loadRow = useCallback(async (i: number) => {
    const def = feedRow(i);
    loading.current++;
    setRows((prev) => [...prev, { def, items: [], loading: true, error: false }]);
    try {
      const items = await def.load();
      setRows((prev) => prev.map((r) => (r.def.key === def.key ? { ...r, items, loading: false } : r)));
    } catch {
      setRows((prev) => prev.map((r) => (r.def.key === def.key ? { ...r, loading: false, error: true } : r)));
    } finally {
      loading.current--;
    }
  }, []);

  const more = useCallback(
    (count = 3) => {
      if (loading.current >= 4) return; // never queue faster than rows arrive
      for (let k = 0; k < count; k++) loadRow(requested.current++);
    },
    [loadRow],
  );

  useEffect(() => {
    const pending = rows.flatMap((r) => r.items.slice(0, 6)).filter((t) => t.source === 'cinemeta' || t.source === 'anilist');
    if (pending.length > 0) verifyLater(pending);
  }, [rows]);

  const visible = useMemo(
    () =>
      rows
        .map((r) => {
          const hit = stable.get(r.def.key);
          if (hit && hit.src === r.items && hit.v === availability) return { ...r, items: hit.out };
          const out = r.items.filter(isListed);
          stable.set(r.def.key, { src: r.items, out, v: availability });
          return { ...r, items: out };
        })
        .filter((r) => r.loading || r.items.length > 0),
    [rows, availability, stable],
  );

  return { rows: visible, more };
}

/** Rows by key, in the order requested (keeps screens independent of the Home row order). */
export function rowsByKey(...keys: string[]): RowDef[] {
  return keys.map((k) => HOME_ROWS.find((r) => r.key === k)).filter((r): r is RowDef => !!r);
}

/** "Arcane: League of Legends" finds nothing on catalogs that index "Arcane", so weaker spellings are tried too. */
function queryVariants(query: string): string[] {
  const full = query.trim();
  const beforeColon = full.split(/\s*[:–—]\s*|\s+-\s+/)[0].trim();
  const words = full.split(/\s+/);
  const noArticle = full.replace(/^(the|a|an)\s+/i, '');
  const shorter = words.length > 2 ? words.slice(0, -1).join(' ') : '';
  return [...new Set([full, beforeColon, noArticle, shorter].filter((v) => v.length >= 2))].slice(0, 3);
}

async function searchOnce(query: string, includeAdult: boolean, signal?: AbortSignal): Promise<Title[]> {
  if (signal?.aborted) return [];
  const jobs: Promise<Title[]>[] = [
    cinemeta.search(query, signal),
    listPosts(SOUTHFREAK, { search: query, perPage: 15, signal }),
    anilist.search(query, signal),
    kdrama.searchKDrama(query, signal),
    amaderftp.search(query, signal),
    bdixTitles(query),
  ];
  if (includeAdult) {
    jobs.push(listPosts(SOUTHFREAK_18, { search: query, perPage: 15, signal }));
    jobs.push(stremio.catalog(stremio.ONLYPORN, 'eporner', { search: query }));
  }
  const settled = await Promise.allSettled(
    jobs.map((j) => Promise.race([j, new Promise<Title[]>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]))
  );
  if (signal?.aborted) return [];
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

/** Synchronous/instant lookup of previously cached search results for instant UI feedback */
export async function getCachedSearch(query: string, includeAdult = false): Promise<Title[]> {
  const q = norm(query);
  if (q.length < 2) return [];
  const key = `search:${q}:${includeAdult ? 1 : 0}`;
  const hit = await cached<Title[] | null>(key, { ttl: 24 * 3600 * 1000 }, async () => null).catch(() => null);
  if (!hit || !hit.length) return [];
  return hit.map((t) => registry.get(t.id) ?? t);
}

/** Fans out to every source in parallel; cancels obsolete queries when a new character is typed. */
export async function searchAll(query: string, includeAdult = false, signal?: AbortSignal): Promise<Title[]> {
  const q = norm(query);
  if (q.length < 2 || signal?.aborted) return [];
  const key = `search:${q}:${includeAdult ? 1 : 0}`;
  let results: Title[] = [];
  for (const variant of queryVariants(query)) {
    if (signal?.aborted) return [];
    results = await searchOnce(variant, includeAdult, signal);
    if (results.length > 0) break;
  }
  if (signal?.aborted) return [];
  if (results.length === 0) {
    // every source failed: serve the last good result for this query
    return (await cached<Title[]>(key, { ttl: Infinity }, async () => [])).map((t) => registry.get(t.id) ?? t);
  }
  const unique = new Map<string, Title>();
  for (const t of register(results)) unique.set(t.id, t);
  const sorted = [...unique.values()].filter(isListed).sort((a, b) => score(b, q) - score(a, q));
  verifyLater(sorted.slice(0, 8));
  await cached<Title[]>(key, { ttl: 0, force: true }, async () => sorted.slice(0, 40));
  return sorted;
}

// ---------------------------------------------------------------- hooks

export interface RowState {
  def: RowDef;
  items: Title[];
  loading: boolean;
  error: boolean;
}

/**
 * Loads rows independently (each shows as soon as it arrives) and refreshes them when the app
 * returns to the foreground after a while, so new uploads appear without a restart.
 */
export function useRows(defs: RowDef[], enabled = true) {
  const [rows, setRows] = useState<RowState[]>(() => defs.map((def) => ({ def, items: [], loading: true, error: false })));
  const [refreshing, setRefreshing] = useState(false);
  const lastLoad = useRef(0);
  const availability = useAvailabilityVersion();
  const stable = useRef(new Map<string, { src: Title[]; out: Title[]; v: number }>()).current;

  // Staggered loading: three feeds at a time keeps the first screen fast and the data use low.
  const load = useCallback(
    async (force: boolean) => {
      lastLoad.current = Date.now();
      let next = 0;
      const worker = async () => {
        while (next < defs.length) {
          const def = defs[next++];
          try {
            const items = await def.load(force);
            setRows((prev) => prev.map((r) => (r.def.key === def.key ? { ...r, items: items.length ? items : r.items, loading: false, error: false } : r)));
          } catch {
            setRows((prev) => prev.map((r) => (r.def.key === def.key ? { ...r, loading: false, error: r.items.length === 0 } : r)));
          }
        }
      };
      await Promise.all(Array.from({ length: 3 }, worker));
    },
    [defs],
  );

  useEffect(() => {
    if (!enabled) return;
    load(false);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastLoad.current > FEED_TTL) load(true);
    });
    return () => sub.remove();
  }, [enabled, load]);

  // Titles with no playable source are hidden; unchecked ones are verified quietly in the background.
  useEffect(() => {
    if (!enabled) return;
    const pending = rows.flatMap((r) => r.items.slice(0, 8)).filter((t) => t.source === 'cinemeta' || t.source === 'anilist');
    if (pending.length > 0) verifyLater(pending);
  }, [rows, enabled]);

  const visible = useMemo(
    () =>
      rows.map((r) => {
        const hit = stable.get(r.def.key);
        if (hit && hit.src === r.items && hit.v === availability) return r.items === hit.out ? r : { ...r, items: hit.out };
        const out = r.items.filter(isListed);
        const reuse = hit && hit.out.length === out.length && hit.out.every((t, i) => t === out[i]) ? hit.out : out;
        stable.set(r.def.key, { src: r.items, out: reuse, v: availability });
        return { ...r, items: reuse };
      }),
    [rows, availability, stable],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return { rows: visible, refresh, refreshing };
}

export function titleById(rows: RowState[], key: string): Title[] {
  return rows.find((r) => r.def.key === key)?.items ?? [];
}
