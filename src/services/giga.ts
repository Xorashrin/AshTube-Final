// JS side of the native multi-threaded download engine (modules/myth-giga). When the native module is
// missing (Expo Go, web) downloads fall back to a single-stream transfer with expo-file-system.
import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';

import { UA } from './http';

interface Snapshot {
  downloaded: number;
  total: number;
  state: string;
  speed: number;
}

interface NativeGiga {
  download(id: string, url: string, headers: Record<string, string>, dest: string, threads: number): Promise<{ bytes: number }>;
  progress(id: string): Snapshot | null;
  cancel(id: string, keepProgress: boolean): void;
  forget(id: string): void;
}

const native = requireOptionalNativeModule<NativeGiga>('MythGiga');

export const gigaAvailable = native !== null;

export type GigaErrorCode = 'E_CANCELLED' | 'E_EXPIRED' | 'E_NETWORK' | 'E_IO' | 'E_BUSY';

export class GigaError extends Error {
  constructor(
    readonly code: GigaErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface GigaProgress {
  ratio: number;
  bytes: number;
  total: number;
  speed: number;
}

export interface GigaJob {
  id: string;
  url: string;
  headers?: Record<string, string>;
  /** file:// path or content:// document URI. */
  dest: string;
  threads: number;
  onProgress: (p: GigaProgress) => void;
}

const fallbackTasks = new Map<string, FileSystem.DownloadResumable>();

function mapCode(e: unknown): GigaError {
  const code = (typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '') as GigaErrorCode;
  const message = e instanceof Error ? e.message : 'Download failed';
  return new GigaError(['E_CANCELLED', 'E_EXPIRED', 'E_NETWORK', 'E_IO', 'E_BUSY'].includes(code) ? code : 'E_IO', message);
}

/** Runs one download to completion. Resumes automatically when partial data from an earlier run exists. */
export async function runDownload(job: GigaJob): Promise<number> {
  const headers: Record<string, string> = { 'User-Agent': UA };
  for (const [k, v] of Object.entries(job.headers ?? {})) if (typeof v === 'string') headers[k] = v;
  if (!native) return fallbackDownload(job, headers);
  const timer = setInterval(() => {
    const s = native.progress(job.id);
    if (s && s.total > 0) job.onProgress({ ratio: Math.min(0.995, s.downloaded / s.total), bytes: s.downloaded, total: s.total, speed: s.speed });
  }, 500);
  try {
    const res = await native.download(job.id, job.url, headers, job.dest, job.threads);
    job.onProgress({ ratio: 1, bytes: res.bytes, total: res.bytes, speed: 0 });
    return res.bytes;
  } catch (e) {
    throw mapCode(e);
  } finally {
    clearInterval(timer);
  }
}

export function pauseDownload(id: string) {
  native?.cancel(id, true);
  fallbackTasks.get(id)?.pauseAsync().catch(() => undefined);
}

/** Cancels and forgets partial progress. */
export function cancelDownloadJob(id: string) {
  native?.cancel(id, false);
  const task = fallbackTasks.get(id);
  fallbackTasks.delete(id);
  task?.cancelAsync().catch(() => undefined);
}

export function forgetDownload(id: string) {
  native?.forget(id);
}

async function fallbackDownload(job: GigaJob, headers: Record<string, string>): Promise<number> {
  if (job.dest.startsWith('content://')) throw new GigaError('E_IO', 'Choosing a custom folder needs the native download engine');
  const task = FileSystem.createDownloadResumable(job.url, job.dest, { headers }, (e) => {
    if (e.totalBytesExpectedToWrite > 0) {
      job.onProgress({ ratio: Math.min(0.995, e.totalBytesWritten / e.totalBytesExpectedToWrite), bytes: e.totalBytesWritten, total: e.totalBytesExpectedToWrite, speed: 0 });
    }
  });
  fallbackTasks.set(job.id, task);
  try {
    const res = await task.downloadAsync();
    if (!res || (res.status !== 200 && res.status !== 206)) throw new GigaError(res && [401, 403, 404, 410].includes(res.status) ? 'E_EXPIRED' : 'E_NETWORK', `HTTP ${res?.status ?? 'error'}`);
    const info = await FileSystem.getInfoAsync(job.dest);
    return info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  } catch (e) {
    if (e instanceof GigaError) throw e;
    throw new GigaError('E_NETWORK', e instanceof Error ? e.message : 'Download failed');
  } finally {
    fallbackTasks.delete(job.id);
  }
}
