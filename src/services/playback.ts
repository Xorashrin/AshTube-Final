// Source engine: finds every way to play a title, verifies them in parallel and auto-picks the best.
//
//   gatherers (own source, same title on other sources, BDIX servers, Nuvio plugins, Stremio addons)
//     └ servers (quality known from labels or probes)
//         └ resolve (mirror hops + Range probe, bounded by timeouts)
//             └ ranked list: highest quality first, seekable and fast preferred
//
// The player starts the top entry immediately and falls through the rest on failure, so a dead
// mirror never reaches the user. The same engine feeds the Download sheet.
import { useEffect, useMemo, useState } from 'react';

import type { Episode, Title } from '../data/types';
import { identify } from './identify';
import { getText, probe, withTimeout } from './http';
import type { NuvioRepo } from './nuvio/repos';
import { loadProviders, rankProviders, runProvider, type NuvioStream } from './nuvio/runtime';
import { expandLink, hostLabel, resolveMirror, type Playable } from './resolvers';
import * as amaderftp from './sources/amaderftp';
import * as bdix from './sources/bdix';
import { findAddon, STREMIFY, streams as addonStreams } from './sources/stremio';
import { getVariants, listPosts, siteFor, SOUTHFREAK, type Variant } from './sources/wordpress';

export type QualityPref = 'auto' | '1080p' | '720p' | '480p';

/** Settings language → plugin repo language tag (used to rank Nuvio providers). */
export const LANGUAGES: { label: string; lang: NuvioRepo['lang'] | null }[] = [
  { label: 'English', lang: null },
  { label: 'Hindi', lang: null },
  { label: 'Bengali', lang: 'bn' },
  { label: 'Tamil', lang: 'ta' },
  { label: 'Arabic', lang: 'ar' },
  { label: 'Turkish', lang: 'tr' },
  { label: 'Spanish', lang: 'es' },
  { label: 'Portuguese', lang: 'pt' },
];

let preferredLangs: NuvioRepo['lang'][] = ['bn'];

export function setPreferredLanguage(label: string) {
  const hit = LANGUAGES.find((l) => l.label === label)?.lang;
  preferredLangs = hit ? [hit, 'bn'] : ['bn'];
}
export type Origin = 'local' | 'ftp' | 'bdix' | 'wp' | 'nuvio' | 'stremio' | 'embed';

export interface Server {
  id: string;
  name: string;
  detail: string;
  quality: string;
  /** 0–5: 360p=1 … 1080p=4, 4K=5. Unknown HD labels count as 3. */
  rank: number;
  origin: Origin;
  kind: 'native' | 'embed';
  resolve?: () => Promise<Playable>;
  embedUrl?: string;
  downloadable: boolean;
  size?: string;
}

export interface Resolved {
  server: Server;
  playable: Playable;
  ms: number;
  score: number;
}

// ---------------------------------------------------------------- helpers

export function qualityRank(label: string | number | undefined): number {
  const q = String(label ?? '').toLowerCase();
  if (/2160|4k|uhd/.test(q)) return 5;
  if (/1440/.test(q)) return 4.5;
  if (/1080|fhd|full ?hd/.test(q)) return 4;
  if (/720|\bhd\b/.test(q)) return 3;
  if (/480|\bsd\b/.test(q)) return 2;
  if (/360|240|cam|ts\b/.test(q)) return 1;
  if (/auto|adaptive|master|m3u8/.test(q)) return 3.5;
  return 2.5;
}

function rankFromHeight(h: number): number {
  return h >= 2000 ? 5 : h >= 1300 ? 4.5 : h >= 1000 ? 4 : h >= 700 ? 3 : h >= 450 ? 2 : 1;
}

const ORIGIN_BONUS: Record<Origin, number> = { local: 200, ftp: 30, bdix: 25, wp: 10, nuvio: 0, stremio: 0, embed: -40 };
const ORIGIN_TIER: Record<Origin, number> = { local: 0, ftp: 1, bdix: 1, wp: 2, nuvio: 3, stremio: 3, embed: 9 };

function score(server: Server, p: Playable, ms: number, downloadOnly: boolean): number {
  const rank = p.height ? rankFromHeight(p.height) : server.rank;
  const seek = p.seekable ? (downloadOnly ? 80 : 35) : 0;
  return rank * 100 + seek + ORIGIN_BONUS[server.origin] - Math.min(ms / 60, 40) - (p.hls ? 5 : 0);
}

const RESOLVE_TTL = 4 * 60 * 1000;
const resolved = new Map<string, { at: number; value: Playable }>();

async function resolveOnce(key: string, run: () => Promise<Playable>): Promise<Playable> {
  const hit = resolved.get(key);
  if (hit && Date.now() - hit.at < RESOLVE_TTL) return hit.value;
  const value = await run();
  resolved.set(key, { at: Date.now(), value });
  return value;
}

/** Reads an HLS playlist: confirms it is real and extracts the best picture height from a master list. */
async function probeHls(url: string, headers?: Record<string, string>): Promise<{ height: number }> {
  const text = await getText(url, { headers, timeout: 9000, retries: 0 });
  if (!text.includes('#EXTM3U')) throw new Error('Not an HLS playlist');
  let height = 0;
  for (const m of text.matchAll(/RESOLUTION=\d+x(\d+)/g)) height = Math.max(height, Number(m[1]));
  return { height };
}

// ---------------------------------------------------------------- server builders

async function resolveVariant(v: Variant): Promise<Playable> {
  return resolveOnce(v.url, async () => {
    const mirrors = await withTimeout(expandLink(v.url), 15000, 'Link page');
    if (mirrors.length === 0) throw new Error('No mirrors');
    let last: unknown = new Error('No mirrors');
    for (const m of mirrors.slice(0, 5)) {
      try {
        return await withTimeout(resolveMirror(m), 30000, hostLabel(m));
      } catch (e) {
        last = e;
      }
    }
    throw last;
  });
}

function wpServers(title: Title, variants: Variant[], prefix = ''): Server[] {
  return variants.map((v, i) => ({
    id: `${prefix}wp:${title.id}:${i}`,
    name: `Southfreak • ${v.quality}`,
    detail: v.size ? `${v.size} • multi-mirror` : 'multi-mirror',
    quality: v.quality,
    rank: qualityRank(v.quality),
    origin: 'wp' as const,
    kind: 'native' as const,
    resolve: () => resolveVariant(v),
    downloadable: true,
    size: v.size,
  }));
}

function fileServer(id: string, name: string, url: string, urls: string[], label: string, origin: 'ftp' | 'bdix'): Server {
  const quality = /(2160p|1080p|720p|480p|4k)/i.exec(label)?.[1].toUpperCase() ?? (label || 'HD');
  return {
    id,
    name: `${name} • ${quality}`,
    detail: 'direct file • seek & resume',
    quality,
    rank: qualityRank(quality),
    origin,
    kind: 'native',
    downloadable: true,
    resolve: () =>
      resolveOnce(url, async () => {
        for (const candidate of urls) {
          const p = await probe(candidate);
          if (p.ok) return { url: p.url, seekable: p.seekable, size: p.size, host: name, fileName: p.fileName, hls: false };
        }
        throw new Error(`${name} file unreachable`);
      }),
  };
}

function ftpServers(files: amaderftp.FtpFile[], prefix = ''): Server[] {
  return files.map((f) => fileServer(`${prefix}ft:${f.url}`, 'BDIX Fast', f.url, f.mirrors, f.quality, 'ftp'));
}

function nuvioServers(streams: NuvioStream[]): Server[] {
  return streams.map((s) => {
    const label = `${s.quality ?? ''} ${s.title ?? ''} ${s.name ?? ''}`;
    const hls = /\.m3u8(\?|$)/i.test(s.url) || /m3u8|hls/i.test(s.quality ?? '');
    const quality = /(2160p|4k|1080p|720p|480p|360p)/i.exec(label)?.[1].toUpperCase() ?? (hls ? 'Auto' : 'HD');
    return {
      id: `nv:${s.url}`,
      name: `${s.provider} • ${quality}`,
      detail: hls ? 'adaptive stream' : 'direct file',
      quality,
      rank: qualityRank(quality),
      origin: 'nuvio' as const,
      kind: 'native' as const,
      downloadable: !hls,
      size: s.size,
      resolve: () =>
        resolveOnce(s.url + JSON.stringify(s.headers ?? {}), async () => {
          if (hls) {
            const { height } = await probeHls(s.url, s.headers);
            return { url: s.url, headers: s.headers, seekable: true, size: 0, host: s.provider, hls: true, height: height || undefined };
          }
          const p = await probe(s.url, s.headers);
          if (!p.ok) throw new Error('Stream unreachable');
          return { url: p.url, headers: s.headers, seekable: p.seekable, size: p.size, host: s.provider, fileName: p.fileName, hls: false };
        }),
    };
  });
}

function embedServers(title: Title, ids: { tmdbId?: number; imdbId?: string }, episode?: Episode): Server[] {
  const { imdbId, tmdbId } = ids;
  if (!imdbId && !tmdbId) return [];
  const series = title.kind === 'series';
  const s = episode?.season ?? 1;
  const e = episode?.number ?? 1;
  const list: { name: string; url: string }[] = [];
  if (imdbId) list.push({ name: 'VidSrc', url: series ? `https://vidsrc.to/embed/tv/${imdbId}/${s}/${e}` : `https://vidsrc.to/embed/movie/${imdbId}` });
  if (tmdbId) list.push({ name: '2Embed', url: series ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}` : `https://www.2embed.cc/embed/${tmdbId}` });
  if (tmdbId) list.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1${series ? `&s=${s}&e=${e}` : ''}` });
  return list.map((l, i) => ({
    id: `embed:${i}`,
    name: `${l.name} (web player)`,
    detail: 'embedded web player',
    quality: 'HD',
    rank: 3,
    origin: 'embed' as const,
    kind: 'embed' as const,
    embedUrl: l.url,
    downloadable: false,
  }));
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sameTitle(a: Title, b: Title): boolean {
  return norm(a.name) === norm(b.name) && (!a.year || !b.year || Math.abs(a.year - b.year) <= 1);
}

// ---------------------------------------------------------------- engine

type Gatherer = (add: (servers: Server[]) => void, engine: SourceSearch) => Promise<void>;

const PARALLEL_RESOLVES = 5;
const GRACE_MS = 2500;
const HARD_CAP_MS = 60000;

export class SourceSearch {
  readonly servers: Server[] = [];
  readonly results: Resolved[] = [];
  readonly startedAt = Date.now();
  done = false;
  private seen = new Set<string>();
  private queue: Server[] = [];
  private active = 0;
  private gatherersLeft = 0;
  private listeners = new Set<() => void>();
  private failures = 0;

  constructor(
    readonly title: Title,
    readonly episode: Episode | undefined,
  ) {
    this.start();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private add = (servers: Server[]) => {
    const fresh = servers.filter((s) => !this.seen.has(s.id));
    if (fresh.length === 0) return;
    fresh.forEach((s) => this.seen.add(s.id));
    this.servers.push(...fresh);
    for (const s of fresh) if (s.kind === 'native' && s.resolve) this.queue.push(s);
    this.queue.sort((a, b) => ORIGIN_TIER[a.origin] - ORIGIN_TIER[b.origin] || b.rank - a.rank);
    this.pump();
    this.emit();
  };

  private pump() {
    while (this.active < PARALLEL_RESOLVES && this.queue.length > 0) {
      const server = this.queue.shift()!;
      this.active++;
      const t0 = Date.now();
      withTimeout(server.resolve!(), 40000, server.name)
        .then((playable) => {
          const ms = Date.now() - t0;
          this.results.push({ server, playable, ms, score: score(server, playable, ms, false) });
          this.results.sort((a, b) => b.score - a.score);
        })
        .catch(() => {
          this.failures++;
        })
        .finally(() => {
          this.active--;
          this.pump();
          this.checkDone();
          this.emit();
        });
    }
  }

  private checkDone() {
    if (!this.done && this.gatherersLeft === 0 && this.active === 0 && this.queue.length === 0) {
      this.done = true;
    }
  }

  private start() {
    const gatherers = buildGatherers(this.title, this.episode);
    this.gatherersLeft = gatherers.length;
    for (const g of gatherers) {
      g(this.add, this)
        .catch(() => undefined)
        .finally(() => {
          this.gatherersLeft--;
          this.checkDone();
          this.emit();
        });
    }
    setTimeout(() => {
      if (!this.done) {
        this.done = true;
        this.emit();
      }
    }, HARD_CAP_MS);
  }

  /** Verified results ranked for the given purpose. */
  ranked(downloadOnly = false): Resolved[] {
    const pool = downloadOnly ? this.results.filter((r) => r.server.downloadable && !r.playable.hls && !r.playable.embed) : this.results;
    return downloadOnly ? [...pool].map((r) => ({ ...r, score: score(r.server, r.playable, r.ms, true) })).sort((a, b) => b.score - a.score) : pool;
  }

  /** Any server (verified or not) that can be downloaded — used to enable/disable the Download button. */
  get downloadable(): Server[] {
    return this.servers.filter((s) => s.downloadable);
  }

  /** Embed fallbacks, available when no native stream could be verified. */
  embeds(): Server[] {
    return this.servers.filter((s) => s.kind === 'embed');
  }

  /**
   * Resolves with the best verified server. Waits for a short grace window after the first success so a
   * faster/higher-quality sibling can win, but returns instantly for a seekable 1080p+ stream.
   */
  best(downloadOnly = false): Promise<Resolved | null> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let firstSeen = 0;
      let finished = false;
      const finish = (r: Resolved | null) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        unsubscribe();
        resolve(r);
      };
      const check = () => {
        if (finished) return;
        const pool = this.ranked(downloadOnly);
        if (pool.length > 0) {
          if (!firstSeen) firstSeen = Date.now();
          const top = pool[0];
          const instant = top.server.rank >= 4 && top.playable.seekable;
          if (instant || this.done || Date.now() - firstSeen >= GRACE_MS) return finish(top);
          if (!timer) timer = setTimeout(() => { timer = null; check(); }, GRACE_MS - (Date.now() - firstSeen) + 20);
        } else if (this.done) {
          if (!downloadOnly) {
            const embed = this.embeds()[0];
            if (embed) return finish({ server: embed, playable: { url: embed.embedUrl!, seekable: false, size: 0, host: embed.name, hls: false, embed: true }, ms: 0, score: -1 });
          }
          finish(null);
        }
      };
      const unsubscribe = this.subscribe(check);
      check();
    });
  }
}

// ---------------------------------------------------------------- gatherers

function buildGatherers(title: Title, episode: Episode | undefined): Gatherer[] {
  const list: Gatherer[] = [];

  // 1. The title's own source.
  list.push(async (add) => {
    if (title.source === 'southfreak' || title.source === 'sfadult') {
      add(wpServers(title, await getVariants(siteFor(title.source), title.ref)));
    } else if (title.source === 'amaderftp') {
      add(ftpServers(await amaderftp.getFiles(title)));
    } else if (title.source === 'bdix' && title.files) {
      add(title.files.map((f, i) => fileServer(`bx:${title.id}:${i}`, 'BDIX', f.url, [f.url], f.label, 'bdix')));
    } else if (title.source === 'stremio') {
      const addon = findAddon(title.addon);
      if (!addon) return;
      const streams = await addonStreams(addon, 'movie', title.ref);
      add(addonServers(streams.map((s) => ({ url: s.url!, quality: s.name ?? s.title, provider: addon.name })), 'stremio'));
    }
  });

  const mainstream = !title.nsfw && title.source !== 'stremio';

  // 2. The same movie on other direct sources.
  if (mainstream && title.kind === 'movie') {
    if (title.source !== 'amaderftp') {
      list.push(async (add) => {
        if (title.tmdbId) return add(ftpServers(await amaderftp.filesByTmdb(title.tmdbId), 'x:'));
        const hits = (await amaderftp.search(title.name)).filter((t) => sameTitle(title, t));
        if (hits.length) add(ftpServers(await amaderftp.getFiles(hits[0]), 'x:'));
      });
    }
    if (title.source !== 'southfreak') {
      list.push(async (add) => {
        const hits = (await listPosts(SOUTHFREAK, { search: title.name, perPage: 8 })).filter((t) => sameTitle(title, t));
        for (const h of hits.slice(0, 2)) add(wpServers(h, await getVariants(SOUTHFREAK, h.ref), 'x:'));
      });
    }
    if (title.source !== 'bdix') {
      list.push(async (add) => {
        const found = await bdix.search(`${title.name} ${title.year}`.trim(), 8000);
        found.forEach((f) => add(f.files.slice(0, 6).map((file, i) => fileServer(`bx:${f.server.id}:${file.url}:${i}`, f.server.name, file.url, [file.url], file.label, 'bdix'))));
      });
    }
  }

  // 3. Nuvio plugins and Stremio streams need TMDB/IMDb ids.
  if (mainstream) {
    list.push(async (add, engine) => {
      const ids = await identify(title);
      if (!ids.tmdbId && !ids.imdbId) return;
      const kind = title.kind === 'series' ? 'tv' : 'movie';
      const season = episode?.season ?? (kind === 'tv' ? 1 : undefined);
      const number = episode?.number ?? (kind === 'tv' ? 1 : undefined);

      const tasks: Promise<void>[] = [];
      if (ids.imdbId) {
        const sid = kind === 'tv' ? `${ids.imdbId}:${season}:${number}` : ids.imdbId;
        tasks.push(
          addonStreams(STREMIFY, kind === 'tv' ? 'series' : 'movie', sid)
            .then((streams) => add(addonServers(streams.map((s) => ({ url: s.url!, quality: s.name ?? s.title, provider: STREMIFY.name, headers: s.behaviorHints?.proxyHeaders?.request })), 'stremio')))
            .catch(() => undefined),
        );
      }
      if (ids.tmdbId) {
        const providers = await rankProviders(await loadProviders(kind), preferredLangs);
        const runBatch = async (batch: typeof providers) => {
          let next = 0;
          const worker = async () => {
            while (next < batch.length && !engine.done) {
              const p = batch[next++];
              try {
                add(nuvioServers(await runProvider(p, String(ids.tmdbId), kind, season, number)));
              } catch {
                // provider failed or timed out: the next one takes over
              }
            }
          };
          await Promise.all(Array.from({ length: 5 }, worker));
        };
        tasks.push(
          (async () => {
            await runBatch(providers.slice(0, 15));
            if (engine.results.length === 0) await runBatch(providers.slice(15, 60));
          })(),
        );
      }
      await Promise.all(tasks);
    });
  }

  // 4. Web players: kept for the very end, never probed.
  if (mainstream) {
    list.push(async (add) => {
      const ids = await identify(title);
      add(embedServers(title, { tmdbId: title.tmdbId ?? ids.tmdbId, imdbId: title.imdbId ?? ids.imdbId }, episode));
    });
  }
  return list;
}

function addonServers(items: { url: string; quality?: string; provider: string; headers?: Record<string, string> }[], origin: 'stremio'): Server[] {
  return items.map((s) => {
    const hls = /\.m3u8(\?|$)/i.test(s.url);
    const quality = /(2160p|4k|1080p|720p|480p|360p)/i.exec(s.quality ?? '')?.[1].toUpperCase() ?? (hls ? 'Auto' : 'HD');
    return {
      id: `sx:${s.url}`,
      name: `${s.provider} • ${quality}`,
      detail: hls ? 'adaptive stream' : 'direct file',
      quality,
      rank: qualityRank(quality),
      origin,
      kind: 'native' as const,
      downloadable: !hls,
      resolve: () =>
        resolveOnce(s.url, async () => {
          if (hls) {
            const { height } = await probeHls(s.url, s.headers);
            return { url: s.url, headers: s.headers, seekable: true, size: 0, host: s.provider, hls: true, height: height || undefined };
          }
          const p = await probe(s.url, s.headers);
          if (!p.ok) throw new Error('Stream unreachable');
          return { url: p.url, headers: s.headers, seekable: p.seekable, size: p.size, host: s.provider, fileName: p.fileName, hls: false };
        }),
    };
  });
}

// ---------------------------------------------------------------- shared instances + hooks

const ENGINE_TTL = 5 * 60 * 1000;
const engines = new Map<string, SourceSearch>();

/** One engine per title/episode, shared by Title screen, Player and Download sheet. */
export function getSearch(title: Title, episode?: Episode): SourceSearch {
  const key = `${title.id}|${episode?.id ?? ''}`;
  const hit = engines.get(key);
  if (hit && Date.now() - hit.startedAt < ENGINE_TTL && !(hit.done && hit.results.length === 0 && Date.now() - hit.startedAt > 20000)) return hit;
  const engine = new SourceSearch(title, episode);
  engines.set(key, engine);
  if (engines.size > 12) engines.delete(engines.keys().next().value as string);
  return engine;
}

/** Start looking for sources before the user presses Play (Title screen, hero, search results). */
export function warmUp(title: Title, episode?: Episode) {
  try {
    getSearch(title, episode);
  } catch {
    // warming is best-effort
  }
}

/** Re-renders when the engine finds or verifies servers. */
export function useSourceSearch(title: Title, episode?: Episode): { engine: SourceSearch; version: number } {
  const engine = useMemo(() => getSearch(title, episode), [title.id, episode?.id]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setVersion((v) => v + 1);
    return engine.subscribe(() => setVersion((v) => v + 1));
  }, [engine]);
  return { engine, version };
}
