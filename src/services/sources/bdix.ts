// BDIX / FTP movie servers (Bangladesh). Most answer only from Bangladeshi ISPs, so every request
// uses a short timeout and the per-host circuit breaker keeps unreachable servers from slowing anything.
import { tintFor, type Title } from '../../data/types';
import { cached } from '../cache';
import { decodeEntities, getJson, getText, hostAvailable, hostOf, mapLimit, withTimeout } from '../http';

export interface FtpServer {
  id: string;
  name: string;
  type: 'index' | 'circle';
  base: string;
  /** Sub-paths to search first (movie folders). */
  paths?: string[];
}

/** Public servers from docs/BACKEND.md (doc 06). Private-range hosts stay in the list: they work on that ISP's LAN. */
export const BDIX_SERVERS: FtpServer[] = [
  { id: 'circle', name: 'CircleFTP', type: 'circle', base: 'http://new.circleftp.net:5000' },
  { id: 'ftpbd', name: 'FTPBD', type: 'index', base: 'http://media.ftpbd.net' },
  { id: 'samftp', name: 'SamFTP', type: 'index', base: 'https://samftp.com' },
  { id: 'discovery', name: 'Discovery FTP', type: 'index', base: 'http://movies.discoveryftp.net' },
  { id: 'khulnaflix', name: 'Khulnaflix', type: 'index', base: 'http://khulnaflix.net' },
  { id: 'naturalbd', name: 'NaturalBD', type: 'index', base: 'http://www.naturalbd.com' },
  { id: 'ctgmovies', name: 'CTG Movies', type: 'index', base: 'http://ctgmovies.com' },
  { id: 'showtime', name: 'Showtime BD', type: 'index', base: 'http://showtimebd.com' },
  { id: 'dflix', name: 'Dflix', type: 'index', base: 'http://fs1.dflix.live' },
  { id: 'timepass', name: 'TimepassBD', type: 'index', base: 'http://www.timepassbd.live' },
  { id: 'ihub', name: 'iHub', type: 'index', base: 'http://ihub.live' },
  { id: 'moviehaat', name: 'MovieHaat', type: 'index', base: 'http://moviehaat.net' },
  { id: 'ebox', name: 'E-Box', type: 'index', base: 'http://fileserver.ebox.live', paths: ['/movies/'] },
  { id: 'dnet', name: 'D-Net', type: 'index', base: 'https://dnetdrive.com' },
  { id: 'c1', name: 'Cloudone', type: 'index', base: 'http://www.c1movies.com' },
  { id: 'bdmovies', name: 'BDMovies', type: 'index', base: 'http://bdmovies.net' },
  { id: 'moviemela', name: 'Moviemela', type: 'index', base: 'http://www.moviemela.live' },
  { id: 'pollyflix', name: 'Pollyflix', type: 'index', base: 'http://pollyflix.com' },
  { id: 'amrbd', name: 'AmrBD', type: 'index', base: 'http://fs.amrbd.com' },
  { id: 'khulnaflix2', name: 'Khulnaflix Files', type: 'index', base: 'https://file.khulnaflix.net' },
  { id: 'bdflix', name: 'BDFlix Live', type: 'index', base: 'https://bdflixlive.com' },
  { id: 'mojar', name: 'MojarFTP', type: 'index', base: 'https://www.mojarftp.com' },
  { id: 'bolmovies', name: 'BolMovies', type: 'index', base: 'https://www.bolmovies.com' },
  { id: 'timepass2', name: 'TimepassBD (com)', type: 'index', base: 'https://timepassbd.com' },
  { id: 'moviebazar', name: 'MyMovieBazar', type: 'index', base: 'https://mymoviebazar.com' },
  { id: 'pandaclub', name: 'PandaClub', type: 'index', base: 'https://pandaclubbd.com' },
  { id: 'dhakaftp', name: 'DhakaFTP', type: 'index', base: 'https://dhakaftp.com' },
  { id: 'cinemacity', name: 'CinemaCity', type: 'index', base: 'https://cinemacity.live' },
  { id: 'ftpcombd', name: 'FTP.com.bd', type: 'index', base: 'https://ftp.com.bd' },
  { id: 'abcmovies', name: 'ABC Movies', type: 'index', base: 'https://abcmoviesbd.com' },
  { id: 'ctgoz', name: 'CTGOZ', type: 'index', base: 'https://ctgoz.com' },
  { id: 'roar', name: 'RoarMediaZone', type: 'index', base: 'https://roarmediazone.com' },
  { id: 'movieboxbd', name: 'MovieBoxBD', type: 'index', base: 'https://movieboxbd.com' },
  { id: 'sunplex', name: 'SunPlex', type: 'index', base: 'http://sunplex.net' },
  { id: 'dhaka14', name: 'DhakaFlix 14', type: 'index', base: 'http://172.16.50.14', paths: ['/DHAKA-FLIX-14/English%20Movies%20(1080p)/', '/DHAKA-FLIX-14/Hindi%20Movies/', '/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/Hindi%20Dubbed/', '/DHAKA-FLIX-14/Animation%20Movies%20(1080p)/'] },
  { id: 'dhaka12', name: 'DhakaFlix 12', type: 'index', base: 'http://172.16.50.12', paths: ['/DHAKA-FLIX-12/TV-WEB-Series/'] },
];

const MEDIA = /\.(mkv|mp4|avi|webm|m4v)$/i;
const SKIP_NAME = /sample|trailer|\bextras?\b|behind the scenes|subs?$/i;
const STEP_TIMEOUT = 6000;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const norm = (s: string) => safeDecode(s).toLowerCase().replace(/[._\-()[\]]+/g, ' ').replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

function matches(name: string, tokens: string[]): boolean {
  const n = norm(name);
  return tokens.every((t) => n.includes(t));
}

interface Entry {
  href: string;
  name: string;
  dir: boolean;
}

function parseIndex(html: string, pageUrl: string): Entry[] {
  const out: Entry[] = [];
  const dirUrl = pageUrl.endsWith('/') ? pageUrl : pageUrl.replace(/[^/]*$/, '');
  for (const m of html.matchAll(/<a\s[^>]*href="([^"?#]+)"[^>]*>([^<]*)</gi)) {
    const href = decodeEntities(m[1]);
    if (href.startsWith('.') || /^(mailto|javascript):/i.test(href) || /parent directory/i.test(m[2])) continue;
    let abs: string;
    try {
      abs = new URL(href, pageUrl).href;
    } catch {
      continue;
    }
    // Only children of this folder: skips the parent link, sort links and external ads.
    if (!abs.startsWith(dirUrl) || abs === pageUrl || abs === dirUrl) continue;
    const name = decodeEntities(m[2]).trim() || safeDecode(href.replace(/\/$/, '').split('/').pop() ?? '');
    if (!name) continue;
    out.push({ href: abs, name, dir: abs.endsWith('/') });
  }
  return out;
}

async function crawl(server: FtpServer, tokens: string[], deadline: number): Promise<{ url: string; label: string }[]> {
  const found: { url: string; label: string }[] = [];
  const roots = (server.paths ?? ['/']).map((p) => server.base.replace(/\/$/, '') + p);
  const queue: { url: string; depth: number; matched: boolean }[] = roots.map((url) => ({ url, depth: 0, matched: false }));
  while (queue.length > 0 && Date.now() < deadline && found.length < 12) {
    const { url, depth, matched } = queue.shift()!;
    let html: string;
    try {
      html = await withTimeout(getText(url, { timeout: STEP_TIMEOUT, retries: 0 }), STEP_TIMEOUT + 500, 'index');
    } catch {
      continue;
    }
    for (const e of parseIndex(html, url)) {
      if (SKIP_NAME.test(e.name)) continue;
      if (e.dir) {
        const hit = matches(e.name, tokens);
        // Follow folders that match the title; browse one level of un-matched folders from the root (A-Z / year / category layouts).
        if (hit && depth < 3) queue.unshift({ url: e.href, depth: depth + 1, matched: true });
        else if (!matched && depth < 1) queue.push({ url: e.href, depth: depth + 1, matched: false });
      } else if (MEDIA.test(e.name) && (matched || matches(e.name, tokens))) {
        found.push({ url: e.href, label: safeDecode(e.name) });
      }
    }
  }
  return found;
}

const DIRECTORY_URL = 'https://bdix.app/servers';

/** Movie servers listed on bdix.app (names, IPs and domains), refreshed daily. */
async function directoryServers(): Promise<FtpServer[]> {
  try {
    return await cached('bdix:directory', { ttl: 24 * 3600 * 1000 }, async () => {
      const html = await getText(DIRECTORY_URL, { timeout: 12000, retries: 1 });
      const out: FtpServer[] = [];
      for (const row of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
        const cell = (label: string) => {
          const m = new RegExp(`data-label="${label}"[^>]*>([\\s\\S]*?)</td>`).exec(row);
          return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
        };
        const name = (/<a[^>]*>([^<]+)<\/a>/.exec(row)?.[1] ?? '').trim();
        const addr = cell('IP / Domain').split(' ')[0];
        const content = cell('Content');
        if (!name || !addr || !/movie|mixed|media|tv/i.test(content)) continue;
        out.push({ id: `dir:${addr}`, name, type: 'index', base: /^https?:/.test(addr) ? addr : `http://${addr}` });
      }
      return out;
    });
  } catch {
    return [];
  }
}

async function allServers(): Promise<FtpServer[]> {
  const known = new Set(BDIX_SERVERS.map((s) => hostOf(s.base)));
  const extra = (await directoryServers()).filter((s) => !known.has(hostOf(s.base)));
  return [...BDIX_SERVERS, ...extra];
}

/** Search every server (12 at a time); each is capped by the shared time budget. */
export async function search(query: string, budgetMs = 9000): Promise<{ server: FtpServer; files: { url: string; label: string }[] }[]> {
  const tokens = norm(query).split(' ').filter((t) => t.length > 1);
  if (tokens.length === 0) return [];
  const deadline = Date.now() + budgetMs;
  const servers = (await allServers()).filter((s) => hostAvailable(s.base));
  const hits = await mapLimit(servers, 12, async (server) => {
    try {
      if (Date.now() > deadline) return null;
      const files = server.type === 'circle' ? await searchCircle(server, query) : await crawl(server, tokens, deadline);
      return files.length > 0 ? { server, files } : null;
    } catch {
      return null;
    }
  });
  return hits.filter((h): h is { server: FtpServer; files: { url: string; label: string }[] } => h !== null);
}

/** CircleFTP JSON API: posts → details → episode links ("ttp://" is sometimes written for "http://"). */
async function searchCircle(server: FtpServer, query: string): Promise<{ url: string; label: string }[]> {
  const list = await getJson<{ posts?: { id: number; title?: string; name?: string }[] } | { id: number; title?: string; name?: string }[]>(
    `${server.base}/api/posts?searchTerm=${encodeURIComponent(query)}&order=desc`,
    { timeout: STEP_TIMEOUT, retries: 0 },
  );
  const posts = Array.isArray(list) ? list : (list.posts ?? []);
  const tokens = norm(query).split(' ');
  const out: { url: string; label: string }[] = [];
  for (const post of posts.slice(0, 4)) {
    if (!matches(post.title ?? post.name ?? '', tokens)) continue;
    const detail = await getJson<unknown>(`${server.base}/api/posts/${post.id}`, { timeout: STEP_TIMEOUT, retries: 0 }).catch(() => null);
    walk(detail, (s) => {
      const fixed = s.startsWith('ttp') ? `h${s}` : s;
      if (/^https?:\/\//i.test(fixed) && MEDIA.test(fixed.split('?')[0])) out.push({ url: fixed, label: safeDecode(fixed.split('/').pop() ?? post.title ?? 'file') });
    });
  }
  return out;
}

function walk(node: unknown, visit: (s: string) => void) {
  if (typeof node === 'string') visit(node);
  else if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => walk(n, visit));
}

export function filesToTitle(name: string, year: number, files: { url: string; label: string }[], serverName: string): Title {
  const id = `bx:${norm(name).replace(/ /g, '-')}-${year}`;
  return {
    id, source: 'bdix', ref: id, name, kind: 'movie', year, maturity: '13+', runtime: 0, seasons: [], genres: [], synopsis: `Direct files on ${serverName}.`,
    cast: [], creators: [], tint: tintFor(id), quality: [...new Set(files.map((f) => /(2160p|1080p|720p|480p)/i.exec(f.label)?.[1].toUpperCase() ?? 'HD'))], files, detailed: true,
  };
}
