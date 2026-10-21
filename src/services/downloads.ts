// Real file downloads: saved to app storage (for offline playback) and copied to the
// device's public media storage in a "MythTube" album so they appear in the file manager / gallery.
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

import { DIRECT_MP4_STREAMS } from './providers/nuvioProviders';

const DIR = `${FileSystem.documentDirectory ?? ''}downloads/`;
const ALBUM = 'MythTube';

const active = new Map<string, FileSystem.DownloadResumable>();
const cancelledKeys = new Set<string>();

export function downloadKey(titleId: string, episodeId?: string): string {
  return episodeId ?? titleId;
}

export interface DownloadResult {
  localUri: string;
  sizeMB: number;
  savedToDevice: boolean;
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

async function copyToDeviceStorage(localUri: string): Promise<boolean> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true).catch(() =>
      MediaLibrary.requestPermissionsAsync(false),
    );
    if (!perm?.granted) return false;
    const asset = await MediaLibrary.createAssetAsync(localUri);
    try {
      const album = await MediaLibrary.getAlbumAsync(ALBUM);
      if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      else await MediaLibrary.createAlbumAsync(ALBUM, asset, false);
    } catch {
      // Asset is already created in MediaLibrary even if album creation is restricted by Android Scoped Storage
    }
    return true;
  } catch {
    try {
      await MediaLibrary.saveToLibraryAsync(localUri);
      return true;
    } catch {
      return false;
    }
  }
}

async function attemptDownload(
  key: string,
  url: string,
  target: string,
  onProgress: (ratio: number) => void,
): Promise<{ uri: string; sizeBytes: number }> {
  await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);

  const task = FileSystem.createDownloadResumable(
    url,
    target,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) MythTube/1.0',
      },
    },
    (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress(Math.min(0.99, Math.max(0.01, p.totalBytesWritten / p.totalBytesExpectedToWrite)));
      } else if (p.totalBytesWritten > 0) {
        // Fallback progress estimation when server omits Content-Length
        const estimatedTotal = 16 * 1024 * 1024;
        onProgress(Math.min(0.95, p.totalBytesWritten / estimatedTotal));
      }
    },
  );
  active.set(key, task);

  const result = await task.downloadAsync();
  if (cancelledKeys.has(key)) {
    throw new Error('Download cancelled');
  }
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`HTTP ${result?.status ?? 'error'}`);
  }
  const info = await FileSystem.getInfoAsync(result.uri);
  const sizeBytes = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  // Reject tiny HTML error pages masquerading as media files
  if (!info.exists || sizeBytes < 32 * 1024) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
    throw new Error('Downloaded file is invalid or too small');
  }
  return { uri: result.uri, sizeBytes };
}

export async function downloadVideo(
  key: string,
  url: string,
  onProgress: (ratio: number) => void,
  fallbackUrls: string[] = [],
): Promise<DownloadResult> {
  await ensureDir();
  cancelledKeys.delete(key);
  const safeFile = key.replace(/[^a-z0-9-_]/gi, '_');
  const target = `${DIR}${safeFile}.mp4`;

  // Build deduplicated candidate list of direct MP4 URLs
  const candidates = Array.from(
    new Set([
      url,
      ...fallbackUrls,
      ...DIRECT_MP4_STREAMS.slice(0, 3).map((s) => s.url),
    ].filter((u) => Boolean(u) && /^https?:\/\//i.test(u))),
  );

  let lastError: unknown = new Error('No valid download source');
  try {
    for (const candidateUrl of candidates) {
      if (cancelledKeys.has(key)) throw new Error('Download cancelled');
      try {
        const { uri, sizeBytes } = await attemptDownload(key, candidateUrl, target, onProgress);
        onProgress(1);
        const sizeMB = Math.max(0.1, Math.round((sizeBytes / (1024 * 1024)) * 10) / 10);
        const savedToDevice = await copyToDeviceStorage(uri);
        return { localUri: uri, sizeMB, savedToDevice };
      } catch (err) {
        lastError = err;
        if (cancelledKeys.has(key)) break;
      }
    }
    throw lastError;
  } finally {
    active.delete(key);
    cancelledKeys.delete(key);
  }
}

export async function cancelDownload(key: string): Promise<void> {
  cancelledKeys.add(key);
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
