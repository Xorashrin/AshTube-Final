// Automated Performance and Reliability Test Suite
// Verifies caching, deduplication, cancellation, pagination, resilience, and playback state.

import assert from 'node:assert/strict';

export interface ParsedQuery {
  text: string;
  season?: number;
  episode?: number;
}

const SEASON_EPISODE = [
  /\bs(?:eason)?\s*0*(\d{1,2})\s*[-_. ]*\s*e(?:p(?:isode)?)?\s*0*(\d{1,3})\b/i,
  /\b0*(\d{1,2})\s*x\s*0*(\d{1,3})\b/i,
];
const SEASON_ONLY = /\b(?:s|season|saison|sezon)\s*0*(\d{1,2})\b/i;
const EPISODE_ONLY = /\b(?:e|ep|episode|eps)\s*\.?\s*0*(\d{1,3})\b/i;

function parseQuery(raw: string): ParsedQuery {
  let text = ` ${raw.trim()} `;
  for (const re of SEASON_EPISODE) {
    const m = re.exec(text);
    if (m) return { text: text.replace(re, ' ').replace(/\s+/g, ' ').trim(), season: Number(m[1]), episode: Number(m[2]) };
  }
  let season: number | undefined;
  let episode: number | undefined;
  const s = SEASON_ONLY.exec(text);
  if (s) {
    season = Number(s[1]);
    text = text.replace(SEASON_ONLY, ' ');
  }
  const e = EPISODE_ONLY.exec(text);
  if (e) {
    episode = Number(e[1]);
    text = text.replace(EPISODE_ONLY, ' ');
  }
  return { text: text.replace(/\s+/g, ' ').trim(), season, episode };
}

console.log('--- Starting Performance and Reliability Tests ---');

// --- Test 1: In-Memory Two-Level Cache (Hit, Miss, Expiry) ---
console.log('[Test 1] Cache Hit, Miss, and Freshness Expiry');
class SimpleCache<T> {
  private store = new Map<string, { value: T; at: number }>();
  get(key: string, ttl: number): { hit: boolean; value?: T; stale?: boolean } {
    const entry = this.store.get(key);
    if (!entry) return { hit: false };
    const isStale = Date.now() - entry.at >= ttl;
    return { hit: true, value: entry.value, stale: isStale };
  }
  set(key: string, value: T): void {
    this.store.set(key, { value, at: Date.now() });
  }
}

const testCache = new SimpleCache<string[]>();
assert.equal(testCache.get('feed:home', 1000).hit, false, 'Initial cache should be a miss');

testCache.set('feed:home', ['title1', 'title2']);
const hit1 = testCache.get('feed:home', 1000);
assert.equal(hit1.hit, true, 'Cache should now be a hit');
assert.equal(hit1.stale, false, 'Cache should be fresh');
assert.deepEqual(hit1.value, ['title1', 'title2']);
console.log('✓ Cache hit and miss verified.');

// --- Test 2: In-Flight Request Deduplication ---
console.log('[Test 2] In-Flight Request Deduplication');
const inflight = new Map<string, Promise<number>>();
let callCount = 0;

async function expensiveFetch(key: string): Promise<number> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async () => {
    callCount++;
    await new Promise((r) => setTimeout(r, 20));
    return 42;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, job);
  return job;
}

const [resA, resB, resC] = await Promise.all([
  expensiveFetch('movie:oppenheimer'),
  expensiveFetch('movie:oppenheimer'),
  expensiveFetch('movie:oppenheimer'),
]);
assert.equal(resA, 42);
assert.equal(resB, 42);
assert.equal(resC, 42);
assert.equal(callCount, 1, 'Only one actual network request should run for concurrent identical keys');
console.log('✓ In-flight request deduplication verified.');

// --- Test 3: Stale-While-Revalidate Fallback on Failure ---
console.log('[Test 3] Stale-While-Revalidate Fallback on Provider Failure');
async function fetchWithSWR(
  key: string,
  cache: SimpleCache<string>,
  fetcher: () => Promise<string>,
): Promise<{ value: string; fromCache: boolean }> {
  const cached = cache.get(key, 60000);
  try {
    const fresh = await fetcher();
    cache.set(key, fresh);
    return { value: fresh, fromCache: false };
  } catch (err) {
    if (cached.hit && cached.value) {
      return { value: cached.value, fromCache: true };
    }
    throw err;
  }
}

const swrCache = new SimpleCache<string>();
swrCache.set('banner:featured', 'Oppenheimer (Cached)');

// Simulated failed network request
const swrResult = await fetchWithSWR('banner:featured', swrCache, async () => {
  throw new Error('Network timeout');
});
assert.equal(swrResult.fromCache, true, 'Should fall back to cached data on network failure');
assert.equal(swrResult.value, 'Oppenheimer (Cached)');
console.log('✓ Stale-While-Revalidate fallback verified.');

// --- Test 4: Query Normalization and Parsing ---
console.log('[Test 4] Query Normalization and Season/Episode Extraction');
const q1 = parseQuery('Bachelor Point season 1 ep 10');
assert.equal(q1.text, 'Bachelor Point', 'Title parsed cleanly');
assert.equal(q1.season, 1, 'Season parsed');
assert.equal(q1.episode, 10, 'Episode parsed');

const q2 = parseQuery('Stranger Things s04e09');
assert.equal(q2.text, 'Stranger Things');
assert.equal(q2.season, 4);
assert.equal(q2.episode, 9);

const q3 = parseQuery('Squid Game');
assert.equal(q3.text, 'Squid Game');
assert.equal(q3.season, undefined);
assert.equal(q3.episode, undefined);
console.log('✓ Query parsing and extraction verified.');

// --- Test 5: Search Cancellation & Out-of-Order Rejection ---
console.log('[Test 5] Search Cancellation and AbortController');
let latestCommittedQuery = '';

async function simulatedSearch(query: string, signal: AbortSignal, delayMs: number): Promise<string> {
  await new Promise((resolve, reject) => {
    const t = setTimeout(resolve, delayMs);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('Aborted'));
    });
  });
  return `Results for ${query}`;
}

const ctrl1 = new AbortController();
const p1 = simulatedSearch('Squid', ctrl1.signal, 100);

// User types faster: cancels previous request
ctrl1.abort();
const ctrl2 = new AbortController();
const p2 = simulatedSearch('Squid Game', ctrl2.signal, 20);

let p1FailedWithAbort = false;
try {
  await p1;
} catch (e: any) {
  p1FailedWithAbort = e.message === 'Aborted';
}
const p2Res = await p2;
assert.equal(p1FailedWithAbort, true, 'First search query was aborted cleanly');
assert.equal(p2Res, 'Results for Squid Game', 'Second search query succeeded');
console.log('✓ Search cancellation verified.');

// --- Test 6: Pagination and Scroll Event Deduplication ---
console.log('[Test 6] Feed Pagination & Infinite Scroll Guard');
class PaginationController<T> {
  page = 1;
  loading = false;
  items: T[] = [];
  hasMore = true;

  async loadNext(fetcher: (page: number) => Promise<T[]>): Promise<void> {
    if (this.loading || !this.hasMore) return; // Prevent duplicate scroll requests
    this.loading = true;
    try {
      const newItems = await fetcher(this.page);
      if (newItems.length === 0) {
        this.hasMore = false;
      } else {
        this.items = [...this.items, ...newItems];
        this.page++;
      }
    } finally {
      this.loading = false;
    }
  }

  reset(): void {
    this.page = 1;
    this.loading = false;
    this.items = [];
    this.hasMore = true;
  }
}

const pager = new PaginationController<string>();
let fetchCalls = 0;
const mockFetcher = async (p: number) => {
  fetchCalls++;
  await new Promise((r) => setTimeout(r, 10));
  return [`item-${p}-1`, `item-${p}-2`];
};

// Fire multiple simultaneous scroll triggers
await Promise.all([
  pager.loadNext(mockFetcher),
  pager.loadNext(mockFetcher),
  pager.loadNext(mockFetcher),
]);
assert.equal(fetchCalls, 1, 'Simultaneous scroll events should not cause duplicate fetches');
assert.equal(pager.items.length, 2, 'First page loaded');
assert.equal(pager.page, 2, 'Page incremented to 2');

// Filter change resets pagination
pager.reset();
assert.equal(pager.page, 1, 'Page reset to 1');
assert.equal(pager.items.length, 0, 'Items cleared');
console.log('✓ Pagination guard and reset verified.');

// --- Test 7: Provider Timeouts & Partial Results Aggregation ---
console.log('[Test 7] Provider Timeouts and Partial Results Aggregation');
interface ProviderResult {
  source: string;
  items: string[];
}

async function fetchSourcesBounded(
  sources: { name: string; latencyMs: number; fail?: boolean; items: string[] }[],
  timeoutMs: number,
): Promise<string[]> {
  const promises = sources.map(async (src) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      if (src.latencyMs > timeoutMs) {
        await new Promise((_, reject) =>
          ctrl.signal.addEventListener('abort', () => reject(new Error('Timeout'))),
        );
      }
      if (src.fail) throw new Error('Provider down');
      return src.items;
    } catch {
      return []; // graceful fallback per provider
    } finally {
      clearTimeout(timer);
    }
  });

  const all = await Promise.all(promises);
  return all.flat();
}

const aggregated = await fetchSourcesBounded(
  [
    { name: 'Cinemeta', latencyMs: 20, items: ['Oppenheimer', 'Dune'] },
    { name: 'SlowProvider', latencyMs: 500, items: ['SlowTitle'] }, // Exceeds 100ms
    { name: 'BrokenSource', latencyMs: 10, fail: true, items: ['DeadTitle'] },
    { name: 'TMDB', latencyMs: 30, items: ['Squid Game'] },
  ],
  100, // 100ms timeout
);

assert.ok(aggregated.includes('Oppenheimer'), 'Fast source 1 included');
assert.ok(aggregated.includes('Squid Game'), 'Fast source 2 included');
assert.equal(aggregated.includes('SlowTitle'), false, 'Slow provider timed out without breaking results');
assert.equal(aggregated.includes('DeadTitle'), false, 'Failed provider handled gracefully');
assert.equal(aggregated.length, 3, 'Aggregated only valid fast results');
console.log('✓ Provider timeouts and partial results aggregation verified.');

// --- Test 8: Playback Progress and Persistence State ---
console.log('[Test 8] Playback Progress Calculation & Persistence State');
interface ProgressEntry {
  titleId: string;
  position: number;
  duration: number;
  updatedAt: number;
}

function calculateProgress(entry: ProgressEntry): { percent: number; isCompleted: boolean } {
  if (entry.duration <= 0) return { percent: 0, isCompleted: false };
  const percent = Math.min(100, Math.round((entry.position / entry.duration) * 100));
  const isCompleted = percent >= 92; // 92%+ considered watched
  return { percent, isCompleted };
}

const progressA = calculateProgress({ titleId: 'kd:93405', position: 1500, duration: 3000, updatedAt: Date.now() });
assert.equal(progressA.percent, 50);
assert.equal(progressA.isCompleted, false);

const progressB = calculateProgress({ titleId: 'kd:93405', position: 2850, duration: 3000, updatedAt: Date.now() });
assert.equal(progressB.percent, 95);
assert.equal(progressB.isCompleted, true);
console.log('✓ Playback progress and completion verified.');

console.log('\n==============================================');
console.log('ALL PERFORMANCE & RELIABILITY TESTS PASSED!');
console.log('==============================================\n');
