// Playback resolver with layered fallback:
//   provider (own source → cross-source match → embeds)
//     └ variant (preferred quality first)
//         └ mirror (ranked by host + live success rate)
//             └ verified Range probe
// Every level falls through to its next sibling without surfacing an error.
import type { Episode, Title } from '../data/types';
import { probe, withTimeout } from './http';
import { expandLink, hostLabel, resolveMirror, type Playable } from './resolvers';
import * as amaderftp from './sources/amaderftp';
import { getVariants, listPosts, siteFor, SOUTHFREAK, type Variant } from './sources/wordpress';

export type QualityPref = 'auto' | '1080p' | '720p' | '480p';

export interface Server {
  id: string;
  name: string;
  detail: string;
  quality: string;
  kind: 'native' | 'embed';
  /** Native: resolves a verified media URL on demand (links expire, never cached for long). */
  resolve?: () => Promise<Playable>;
  embedUrl?: string;
  /** Can be saved for offline playback. */
  downloadable: boolean;
  size?: string;
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

function qualityRank(q: string, pref: QualityPref): number {
  const order = pref === 'auto' ? ['720P', '1080P', '480P', '2160P', '4K', '360P'] : [pref.toUpperCase(), '720P', '1080P', '480P'];
  const i = order.indexOf(q.toUpperCase());
  return i < 0 ? 9 : i;
}

function wpServers(title: Title, variants: Variant[], pref: QualityPref, prefix = ''): Server[] {
  return [...variants]
    .sort((a, b) => qualityRank(a.quality, pref) - qualityRank(b.quality, pref))
    .map((v, i) => ({
      id: `${prefix}wp:${title.id}:${i}`,
      name: `${prefix ? 'Southfreak' : 'Server'} • ${v.quality}`,
      detail: v.size ? `${v.size} • multi-mirror` : 'multi-mirror',
      quality: v.quality,
      kind: 'native' as const,
      resolve: () => resolveVariant(v),
      downloadable: true,
      size: v.size,
    }));
}

function ftpServers(files: amaderftp.FtpFile[], pref: QualityPref, prefix = ''): Server[] {
  return [...files]
    .sort((a, b) => qualityRank(a.quality, pref) - qualityRank(b.quality, pref))
    .map((f, i) => ({
      id: `${prefix}ft:${f.url}`,
      name: `BDIX Fast • ${f.quality}`,
      detail: i === 0 ? 'direct file • seek & resume' : 'direct file',
      quality: f.quality,
      kind: 'native' as const,
      resolve: () =>
        resolveOnce(f.url, async () => {
          for (const url of f.mirrors) {
            const p = await probe(url);
            if (p.ok) return { url: p.url, seekable: p.seekable, size: p.size, host: 'BDIX', fileName: p.fileName, hls: false };
          }
          throw new Error('BDIX file unreachable');
        }),
      downloadable: true,
    }));
}

function embedServers(title: Title, episode?: Episode): Server[] {
  const imdb = title.imdbId;
  const tmdb = title.tmdbId;
  if (!imdb && !tmdb) return [];
  const series = title.kind === 'series';
  const s = episode?.season ?? 1;
  const e = episode?.number ?? 1;
  const list: { name: string; url: string }[] = [];
  if (imdb) list.push({ name: 'VidSrc', url: series ? `https://vidsrc.to/embed/tv/${imdb}/${s}/${e}` : `https://vidsrc.to/embed/movie/${imdb}` });
  if (tmdb) list.push({ name: '2Embed', url: series ? `https://www.2embed.cc/embedtv/${tmdb}&s=${s}&e=${e}` : `https://www.2embed.cc/embed/${tmdb}` });
  if (tmdb) list.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${tmdb}&tmdb=1${series ? `&s=${s}&e=${e}` : ''}` });
  return list.map((l, i) => ({
    id: `embed:${i}`,
    name: `${l.name} (web player)`,
    detail: 'embedded web player',
    quality: 'HD',
    kind: 'embed' as const,
    embedUrl: l.url,
    downloadable: false,
  }));
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Same film on another source: normalized name equal and release year within one. */
function sameTitle(a: Title, b: Title): boolean {
  return norm(a.name) === norm(b.name) && (!a.year || !b.year || Math.abs(a.year - b.year) <= 1);
}

/** Direct sources for the same movie on the other providers. Movies only: series files are not reliably indexed. */
async function crossServers(title: Title, pref: QualityPref): Promise<Server[]> {
  if (title.kind !== 'movie' || title.nsfw) return [];
  const jobs: Promise<Server[]>[] = [];
  if (title.source !== 'amaderftp') {
    jobs.push(
      (async () => {
        if (title.tmdbId) return ftpServers(await amaderftp.filesByTmdb(title.tmdbId), pref, 'x:');
        const hits = (await amaderftp.search(title.name)).filter((t) => sameTitle(title, t));
        return hits.length ? ftpServers(await amaderftp.getFiles(hits[0]), pref, 'x:') : [];
      })(),
    );
  }
  if (title.source !== 'southfreak') {
    jobs.push(
      (async () => {
        const hits = (await listPosts(SOUTHFREAK, { search: title.name, perPage: 8 })).filter((t) => sameTitle(title, t));
        const out: Server[] = [];
        for (const h of hits.slice(0, 2)) out.push(...wpServers(h, await getVariants(SOUTHFREAK, h.ref), pref, 'x:'));
        return out;
      })(),
    );
  }
  const settled = await Promise.allSettled(jobs.map((j) => withTimeout(j, 14000, 'Source lookup')));
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function ownServers(title: Title, pref: QualityPref): Promise<Server[]> {
  if (title.source === 'southfreak' || title.source === 'sfadult') {
    return wpServers(title, await getVariants(siteFor(title.source), title.ref), pref);
  }
  if (title.source === 'amaderftp') return ftpServers(await amaderftp.getFiles(title), pref);
  return [];
}

/** Direct (downloadable) servers only — what the Download button depends on. */
export async function directServers(title: Title, pref: QualityPref = 'auto'): Promise<Server[]> {
  if (title.kind === 'series' && title.source !== 'southfreak' && title.source !== 'sfadult') return [];
  const [own, cross] = await Promise.all([ownServers(title, pref).catch(() => []), crossServers(title, pref).catch(() => [])]);
  return dedupe([...own, ...cross]);
}

function dedupe(list: Server[]): Server[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = s.id.replace(/^x:/, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** All servers for playback, best first: seekable direct files, then WP mirrors, then embeds. */
export async function loadServers(title: Title, episode: Episode | undefined, pref: QualityPref): Promise<Server[]> {
  const direct = await directServers(title, pref);
  const rank = (s: Server) => (s.id.includes('ft:') ? 0 : 1);
  direct.sort((a, b) => rank(a) - rank(b));
  return [...direct, ...embedServers(title, episode)];
}

export async function hasDirectSource(title: Title): Promise<boolean> {
  return (await directServers(title)).length > 0;
}
