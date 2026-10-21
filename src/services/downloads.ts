// Offline downloads. A download picks a server (the user's choice, otherwise the best verified one),
// then streams it with the multi-threaded engine into app storage or a folder chosen by the user.
// If a server dies mid-way the next verified server continues, resuming from the blocks already on disk.
import * as FileSystem from 'expo-file-system/legacy';

import type { Episode, Title } from '../data/types';
import { cancelDownloadJob, forgetDownload, GigaError, pauseDownload, runDownload, type GigaProgress } from './giga';
import { getSearch, type Resolved, type Server } from './playback';

const DEFAULT_DIR = `${FileSystem.documentDirectory ?? ''}downloads/`;

export interface DownloadDir {
  /** SAF tree URI from the system folder picker. */
  uri: string;
  name: string;
}

export function downloadKey(titleId: string, episodeId?: string): string {
  return episodeId ?? titleId;
}

export interface DownloadResult {
  localUri: string;
  sizeMB: number;
  server: string;
}

export interface DownloadRequest {
  key: string;
  title: Title;
  episode?: Episode;
  /** Server the user picked in the sheet; undefined = automatic. */
  serverId?: string;
  threads: number;
  dir: DownloadDir | null;
  /** Destination from an earlier interrupted attempt, so partial data is reused. */
  resumeDest?: string;
  onProgress: (p: GigaProgress) => void;
  onServer: (name: string) => void;
  onDest: (uri: string) => void;
}

const active = new Set<string>();

export function isActive(key: string): boolean {
  return active.has(key);
}

// ---------------------------------------------------------------- folders

/** Opens the system folder picker. Returns null when the user cancels. */
export async function pickDownloadFolder(): Promise<DownloadDir | null> {
  const res = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!res.granted) return null;
  const tail = decodeURIComponent(res.directoryUri.split('/').pop() ?? 'Selected folder');
  return { uri: res.directoryUri, name: tail.replace(/^primary:/, 'Internal storage/').replace(/^[A-F0-9-]+:/i, 'SD card/') };
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'video';
}

function extensionOf(r: Resolved): string {
  const m = /\.(mkv|mp4|webm|avi|mov|m4v)(?:$|[?#])/i.exec(r.playable.fileName ?? r.playable.url);
  return (m?.[1] ?? 'mp4').toLowerCase();
}

async function makeDest(req: DownloadRequest, ext: string): Promise<string> {
  const base = req.episode
    ? `${safeName(req.title.name)} S${String(req.episode.season).padStart(2, '0')}E${String(req.episode.number).padStart(2, '0')}`
    : `${safeName(req.title.name)}${req.title.year ? ` (${req.title.year})` : ''}`;
  if (req.dir) {
    const mime = ext === 'mkv' ? 'video/x-matroska' : ext === 'webm' ? 'video/webm' : 'video/mp4';
    return FileSystem.StorageAccessFramework.createFileAsync(req.dir.uri, base, mime);
  }
  await FileSystem.makeDirectoryAsync(DEFAULT_DIR, { intermediates: true }).catch(() => undefined);
  return `${DEFAULT_DIR}${req.key.replace(/[^a-z0-9-_]/gi, '_')}.${ext}`;
}

// ---------------------------------------------------------------- server choice

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The preferred server first, then the best untried verified one; waits for slower sources until the search ends. */
async function nextCandidate(req: DownloadRequest, tried: Set<string>): Promise<Resolved | null> {
  const engine = getSearch(req.title, req.episode);
  if (req.serverId && !tried.has(req.serverId)) {
    const server: Server | undefined = engine.servers.find((s) => s.id === req.serverId);
    if (server?.resolve) {
      tried.add(server.id);
      const t0 = Date.now();
      try {
        const playable = await server.resolve();
        return { server, playable, ms: Date.now() - t0, score: 0 };
      } catch {
        // chosen server is dead: fall through to automatic selection
      }
    }
  }
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const next = engine.ranked(true).find((r) => !tried.has(r.server.id));
    if (next) {
      tried.add(next.server.id);
      return next;
    }
    if (engine.done) return null;
    await sleep(400);
  }
  return null;
}

// ---------------------------------------------------------------- main entry

export async function downloadTitle(req: DownloadRequest): Promise<DownloadResult> {
  if (active.has(req.key)) throw new GigaError('E_BUSY', 'Already downloading');
  active.add(req.key);
  const tried = new Set<string>();
  let dest = req.resumeDest;
  if (dest) req.onDest(dest);
  let last: unknown = new Error('No downloadable source');
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = await nextCandidate(req, tried);
      if (!candidate) break;
      if (candidate.playable.hls) continue;
      try {
        req.onServer(candidate.server.name);
        if (!dest) {
          dest = await makeDest(req, extensionOf(candidate));
          req.onDest(dest);
        }
        const bytes = await runDownload({
          id: req.key,
          url: candidate.playable.url,
          headers: candidate.playable.headers,
          dest,
          threads: candidate.playable.seekable ? req.threads : 1,
          onProgress: req.onProgress,
        });
        forgetDownload(req.key);
        return { localUri: dest, sizeMB: Math.round((bytes / (1024 * 1024)) * 10) / 10, server: candidate.server.name };
      } catch (e) {
        last = e;
        if (e instanceof GigaError && e.code === 'E_CANCELLED') throw e;
      }
    }
    throw last;
  } finally {
    active.delete(req.key);
  }
}

export function pauseKey(key: string) {
  pauseDownload(key);
}

export function cancelKey(key: string) {
  cancelDownloadJob(key);
}

export async function deleteLocalFile(uri?: string): Promise<void> {
  if (!uri) return;
  try {
    if (uri.startsWith('content://')) await FileSystem.StorageAccessFramework.deleteAsync(uri);
    else await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // already gone, or the folder permission was revoked
  }
}

export async function freeSpaceMB(): Promise<number> {
  try {
    return (await FileSystem.getFreeDiskStorageAsync()) / (1024 * 1024);
  } catch {
    return 0;
  }
}
