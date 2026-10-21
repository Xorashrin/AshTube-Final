// Offline downloads: resolve a verified, Range-capable URL (with mirror fallback), then stream it
// to app storage. Interrupted downloads resume from the bytes already on disk.
import * as FileSystem from 'expo-file-system/legacy';

import { UA } from './http';
import type { Playable } from './resolvers';
import type { Server } from './playback';

const DIR = `${FileSystem.documentDirectory ?? ''}downloads/`;

const active = new Map<string, FileSystem.DownloadResumable>();
const cancelled = new Set<string>();

export function downloadKey(titleId: string, episodeId?: string): string {
  return episodeId ?? titleId;
}

export interface DownloadResult {
  localUri: string;
  sizeMB: number;
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

function extensionOf(p: Playable): string {
  const m = /\.(mkv|mp4|webm|avi|mov)(?:$|[?#])/i.exec(p.fileName ?? p.url);
  return (m?.[1] ?? 'mp4').toLowerCase();
}

async function fetchTo(key: string, p: Playable, target: string, onProgress: (ratio: number) => void): Promise<void> {
  const headers = { 'User-Agent': UA, ...p.headers };
  const partial = await FileSystem.getInfoAsync(target);
  const have = partial.exists && 'size' in partial && typeof partial.size === 'number' ? partial.size : 0;
  // Resume only when the server proved it honors Range; otherwise start clean.
  const resume = p.seekable && have > 0 && (p.size === 0 || have < p.size);
  if (!resume) await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
  const task = FileSystem.createDownloadResumable(
    p.url,
    target,
    { headers },
    (e) => {
      if (e.totalBytesExpectedToWrite > 0) onProgress(Math.min(0.99, Math.max(0.01, e.totalBytesWritten / e.totalBytesExpectedToWrite)));
    },
    resume ? String(have) : undefined,
  );
  active.set(key, task);
  const result = await task.downloadAsync();
  if (cancelled.has(key)) throw new Error('Download cancelled');
  if (!result || (result.status !== 200 && result.status !== 206)) throw new Error(`HTTP ${result?.status ?? 'error'}`);
}

/** Tries each server in order until one completes. Returns the saved file. */
export async function downloadFrom(
  key: string,
  servers: Server[],
  onProgress: (ratio: number) => void,
  onServer?: (name: string) => void,
): Promise<DownloadResult> {
  await ensureDir();
  cancelled.delete(key);
  const safe = key.replace(/[^a-z0-9-_]/gi, '_');
  let last: unknown = new Error('No downloadable source');
  try {
    for (const server of servers) {
      if (cancelled.has(key)) throw new Error('Download cancelled');
      if (!server.resolve) continue;
      try {
        onServer?.(server.name);
        const playable = await server.resolve();
        if (playable.hls) continue;
        const target = `${DIR}${safe}.${extensionOf(playable)}`;
        await fetchTo(key, playable, target, onProgress);
        const info = await FileSystem.getInfoAsync(target);
        const bytes = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
        if (bytes < 256 * 1024) {
          await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
          throw new Error('Downloaded file is too small to be a video');
        }
        onProgress(1);
        return { localUri: target, sizeMB: Math.round((bytes / (1024 * 1024)) * 10) / 10 };
      } catch (e) {
        last = e;
        if (cancelled.has(key)) break;
      }
    }
    throw last;
  } finally {
    active.delete(key);
    cancelled.delete(key);
  }
}

export async function cancelDownload(key: string): Promise<void> {
  cancelled.add(key);
  const task = active.get(key);
  active.delete(key);
  if (task) await task.cancelAsync().catch(() => undefined);
}

export async function deleteLocalFile(uri?: string): Promise<void> {
  if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

export function isActive(key: string): boolean {
  return active.has(key);
}

export async function freeSpaceMB(): Promise<number> {
  try {
    return (await FileSystem.getFreeDiskStorageAsync()) / (1024 * 1024);
  } catch {
    return 0;
  }
}
