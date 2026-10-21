// Nuvio plugin runtime. A provider is a bundled CommonJS script exporting
// `getStreams(tmdbId, mediaType, season, episode)`. Scripts are downloaded from the repos in
// ./repos, evaluated with a minimal `require` (cheerio, crypto-js, buffer) and called on demand.
// Provider scripts come from third-party GitHub repositories; only the repos listed in ./repos are used.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import cheerio from 'cheerio-without-node-native';
import CryptoJS from 'crypto-js';
import * as FileSystem from 'expo-file-system/legacy';

import { cached } from '../cache';
import { getJson, getText, withTimeout } from '../http';
import { NUVIO_REPOS, type NuvioRepo } from './repos';

export interface Scraper {
  id: string;
  name: string;
  filename: string;
  version?: string;
  supportedTypes?: string[];
  enabled?: boolean;
  contentLanguage?: string[];
}

export interface Provider {
  key: string;
  repo: NuvioRepo;
  scraper: Scraper;
}

export interface NuvioStream {
  name?: string;
  title?: string;
  url: string;
  quality?: string;
  size?: string;
  headers?: Record<string, string>;
  provider: string;
}

type GetStreams = (tmdbId: string, mediaType: string, season?: number, episode?: number) => Promise<unknown>;

const DIR = `${FileSystem.cacheDirectory ?? ''}nuvio/`;
const MANIFEST_TTL = 24 * 3600 * 1000;
const RUN_TIMEOUT = 18000;
const HEALTH_KEY = 'mythtube:nuvio:health:v1';

// ---------------------------------------------------------------- manifests

export async function loadProviders(kind: 'movie' | 'tv'): Promise<Provider[]> {
  const lists = await Promise.all(
    NUVIO_REPOS.map(async (repo) => {
      try {
        const man = await cached(`nuvio:manifest:${repo.id}`, { ttl: MANIFEST_TTL }, () =>
          getJson<{ scrapers?: Scraper[] }>(`${repo.base}/manifest.json`, { timeout: 12000, retries: 1 }),
        );
        return (man.scrapers ?? [])
          .filter((s) => s.enabled !== false && s.filename && (!s.supportedTypes || s.supportedTypes.includes(kind) || (kind === 'tv' && s.supportedTypes.includes('anime'))))
          .map<Provider>((scraper) => ({ key: `${repo.id}:${scraper.id}`, repo, scraper }));
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

// ---------------------------------------------------------------- health (learned ordering)

interface Health {
  ok: number;
  fail: number;
  ms: number;
}

let health: Record<string, Health> | null = null;

async function readHealth(): Promise<Record<string, Health>> {
  if (health) return health;
  try {
    health = JSON.parse((await AsyncStorage.getItem(HEALTH_KEY)) ?? '{}') as Record<string, Health>;
  } catch {
    health = {};
  }
  return health;
}

async function recordRun(key: string, ok: boolean, ms: number) {
  const h = await readHealth();
  const cur = h[key] ?? { ok: 0, fail: 0, ms: 0 };
  if (ok) {
    cur.ok += 1;
    cur.ms = cur.ms ? Math.round(cur.ms * 0.7 + ms * 0.3) : ms;
  } else {
    cur.fail += 1;
  }
  h[key] = cur;
  AsyncStorage.setItem(HEALTH_KEY, JSON.stringify(h)).catch(() => undefined);
}

/** Providers sorted by repo priority, then by observed success rate and speed. */
export async function rankProviders(providers: Provider[], preferLang: NuvioRepo['lang'][] = []): Promise<Provider[]> {
  const h = await readHealth();
  const score = (p: Provider) => {
    const st = h[p.key];
    const runs = st ? st.ok + st.fail : 0;
    const rate = runs >= 2 ? st!.ok / runs : 0.5;
    const speed = st?.ms ? Math.min(st.ms / 1000, 15) : 6;
    const langBonus = p.repo.lang === 'multi' || preferLang.includes(p.repo.lang) ? 0 : 8;
    return p.repo.priority * 0.8 + langBonus + (1 - rate) * 12 + speed * 0.4;
  };
  return [...providers].sort((a, b) => score(a) - score(b));
}

// ---------------------------------------------------------------- script loading

const compiled = new Map<string, Promise<GetStreams>>();

function requireShim(name: string): unknown {
  switch (name) {
    case 'cheerio-without-node-native':
    case 'cheerio':
      return cheerio;
    case 'crypto-js':
      return CryptoJS;
    case 'buffer':
      return { Buffer };
    default:
      throw new Error(`Module "${name}" is not available in the plugin runtime`);
  }
}

async function readScript(p: Provider): Promise<string> {
  const file = `${DIR}${p.key.replace(/[^\w-]/g, '_')}_${(p.scraper.version ?? '0').replace(/[^\w.-]/g, '_')}.js`;
  try {
    const info = await FileSystem.getInfoAsync(file);
    if (info.exists) return await FileSystem.readAsStringAsync(file);
  } catch {
    // fall through to the network
  }
  const code = await getText(`${p.repo.base}/${p.scraper.filename}`, { timeout: 20000, retries: 1 });
  FileSystem.makeDirectoryAsync(DIR, { intermediates: true })
    .then(() => FileSystem.writeAsStringAsync(file, code))
    .catch(() => undefined);
  return code;
}

function compile(p: Provider): Promise<GetStreams> {
  const hit = compiled.get(p.key);
  if (hit) return hit;
  const job = (async () => {
    const code = await readScript(p);
    const module: { exports: { getStreams?: GetStreams } } = { exports: {} };
    const g = globalThis as { Buffer?: unknown; SCRAPER_SETTINGS?: unknown };
    if (!g.Buffer) g.Buffer = Buffer;
    if (!g.SCRAPER_SETTINGS) g.SCRAPER_SETTINGS = {};
    // eslint-disable-next-line no-new-func
    const run = new Function('module', 'exports', 'require', `${code}\n//# sourceURL=nuvio/${p.key}.js`);
    run(module, module.exports, requireShim);
    const fn = module.exports.getStreams ?? (globalThis as { getStreams?: GetStreams }).getStreams;
    if (typeof fn !== 'function') throw new Error('Provider does not export getStreams');
    return fn;
  })();
  compiled.set(p.key, job);
  job.catch(() => compiled.delete(p.key));
  return job;
}

// ---------------------------------------------------------------- running

function normalize(raw: unknown, provider: string): NuvioStream[] {
  if (!Array.isArray(raw)) return [];
  const out: NuvioStream[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const url = typeof s.url === 'string' ? s.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      url,
      provider,
      name: typeof s.name === 'string' ? s.name : undefined,
      title: typeof s.title === 'string' ? s.title : undefined,
      quality: typeof s.quality === 'string' || typeof s.quality === 'number' ? String(s.quality) : undefined,
      size: typeof s.size === 'string' ? s.size : undefined,
      headers: s.headers && typeof s.headers === 'object' ? (s.headers as Record<string, string>) : undefined,
    });
  }
  return out;
}

export async function runProvider(p: Provider, tmdbId: string, mediaType: 'movie' | 'tv', season?: number, episode?: number): Promise<NuvioStream[]> {
  const started = Date.now();
  try {
    const getStreams = await compile(p);
    const raw = await withTimeout(Promise.resolve(getStreams(tmdbId, mediaType, season, episode)), RUN_TIMEOUT, p.scraper.name);
    const streams = normalize(raw, p.scraper.name);
    recordRun(p.key, streams.length > 0, Date.now() - started);
    return streams;
  } catch (e) {
    recordRun(p.key, false, Date.now() - started);
    throw e;
  }
}
