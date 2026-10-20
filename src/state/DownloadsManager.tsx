import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext } from 'react';

import type { IptvChannel } from '../data/iptv';

/**
 * DownloadsManager — requirement 5: download files DIRECTLY to storage device.
 *
 * Uses:
 *  - expo-file-system to write a small .m3u "shortcut" file (and optionally
 *    a snapshot / metadata JSON) to a persistent documents directory.
 *  - expo-media-library to also copy the saved file into the device's public
 *    Media Library (Downloads collection on Android / Camera Roll on iOS),
 *    so it shows up in the OS Files / Gallery app.
 *
 * For HLS streams we cannot download the whole video without a transcoder
 * (and that's not feasible on-device for arbitrary live HLS). So we persist
 * a "channel shortcut" — a small JSON+M3U file that contains the channel's
 * URL, name, logo, country and category. The user can later open this file
 * in VLC or any IPTV player to resume the live stream.
 *
 * For VOD titles (mp4 / finite video) the same manager downloads the actual
 * media file to the device's storage.
 */

export interface SavedItem {
  id: string;
  name: string;
  url: string;          // source URL
  logo: string;
  localPath: string;    // path in FileSystem.documentDirectory
  mediaUri?: string;     // uri in MediaLibrary (if saved to public storage)
  size: number;          // bytes
  createdAt: number;
  kind: 'live' | 'vod';
}

interface DownloadsManagerValue {
  saved: SavedItem[];
  refresh: () => Promise<void>;
  saveChannel: (ch: IptvChannel) => Promise<SavedItem>;
  saveVod: (name: string, url: string, logo?: string) => Promise<SavedItem>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const SAVED_KEY = 'mythtube:saved-channels';

const Ctx = createContext<DownloadsManagerValue | null>(null);

export function DownloadsManagerProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = React.useState<SavedItem[]>([]);

  const refresh = React.useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SAVED_KEY);
      const list: SavedItem[] = raw ? JSON.parse(raw) : [];
      // Filter out items whose local file no longer exists.
      const valid = (
        await Promise.all(
          list.map(async (it) => {
            try {
              const info = await FileSystem.getInfoAsync(it.localPath);
              return info.exists ? it : null;
            } catch {
              return null;
            }
          }),
        )
      ).filter(Boolean) as SavedItem[];
      if (valid.length !== list.length) {
        await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(valid));
      }
      setSaved(valid);
    } catch (e) {
      console.warn('DownloadsManager.refresh failed', e);
      setSaved([]);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = async (next: SavedItem[]) => {
    setSaved(next);
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };

  const saveChannel = async (ch: IptvChannel): Promise<SavedItem> => {
    // request media-library permission (silently ignore if denied — we still
    // save the shortcut to the app's documents directory)
    let mediaUri: string | undefined;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.granted) {
        // Build the .m3u shortcut file in the cache dir, then move into the
        // MediaLibrary "Downloads" album so the OS Files app exposes it.
        const cachePath = `${FileSystem.cacheDirectory}${ch.id}.m3u`;
        const m3u = `#EXTM3U\n#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${ch.name}" tvg-logo="${ch.logo}" group-title="${ch.country} | ${ch.category}",${ch.name}\n${ch.url}\n`;
        await FileSystem.writeAsStringAsync(cachePath, m3u, { encoding: FileSystem.EncodingType.UTF8 });
        const asset = await MediaLibrary.createAssetAsync(cachePath);
        const album = await MediaLibrary.getAlbumAsync('MythTube');
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync('MythTube', asset, false);
        }
        mediaUri = asset.uri;
      }
    } catch (e) {
      console.warn('MediaLibrary save failed, falling back to documents dir', e);
    }

    // Always also save a copy in app documents dir (persistent across launches)
    const docPath = `${FileSystem.documentDirectory}mythtube/saved/${ch.id}.m3u`;
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}mythtube/saved/`, { intermediates: true });
    const m3uDoc = `#EXTM3U\n#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${ch.name}" tvg-logo="${ch.logo}" group-title="${ch.country} | ${ch.category}",${ch.name}\n${ch.url}\n`;
    await FileSystem.writeAsStringAsync(docPath, m3uDoc, { encoding: FileSystem.EncodingType.UTF8 });
    const finfo = await FileSystem.getInfoAsync(docPath, { size: true });
    const sizeBytes: number =
      finfo.exists && typeof (finfo as { size?: number }).size === 'number'
        ? (finfo as { size: number }).size
        : m3uDoc.length;

    const item: SavedItem = {
      id: ch.id,
      name: ch.name,
      url: ch.url,
      logo: ch.logo,
      localPath: docPath,
      mediaUri,
      size: sizeBytes,
      createdAt: Date.now(),
      kind: 'live',
    };
    const next = [item, ...saved.filter((s) => s.id !== ch.id)];
    await persist(next);
    return item;
  };

  const saveVod = async (name: string, url: string, logo = ''): Promise<SavedItem> => {
    // Download the actual video file to documents directory
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const dir = `${FileSystem.documentDirectory}mythtube/saved/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const ext = url.split('.').pop()?.split('?')[0] || 'mp4';
    const docPath = `${dir}${safeName}.${ext}`;

    const downloadRes = await FileSystem.downloadAsync(url, docPath);
    if (!downloadRes || downloadRes.status < 200 || downloadRes.status >= 300) {
      throw new Error(`Download failed: HTTP ${downloadRes?.status ?? 'unknown'}`);
    }

    // also push into MediaLibrary Downloads album if permitted
    let mediaUri: string | undefined;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.granted) {
        const asset = await MediaLibrary.createAssetAsync(downloadRes.uri);
        const album = await MediaLibrary.getAlbumAsync('MythTube');
        if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        else await MediaLibrary.createAlbumAsync('MythTube', asset, false);
        mediaUri = asset.uri;
      }
    } catch (e) {
      console.warn('MediaLibrary VOD save failed', e);
    }

    const finalInfo = await FileSystem.getInfoAsync(downloadRes.uri, { size: true });
    const finalSize: number =
      finalInfo.exists && typeof (finalInfo as { size?: number }).size === 'number'
        ? (finalInfo as { size: number }).size
        : 0;

    const item: SavedItem = {
      id: `${safeName}-${Date.now()}`,
      name,
      url,
      logo,
      localPath: downloadRes.uri,
      mediaUri,
      size: finalSize,
      createdAt: Date.now(),
      kind: 'vod',
    };
    const next = [item, ...saved];
    await persist(next);
    return item;
  };

  const remove = async (id: string) => {
    const target = saved.find((s) => s.id === id);
    if (target) {
      try {
        await FileSystem.deleteAsync(target.localPath, { idempotent: true });
      } catch (e) {
        console.warn('delete failed', e);
      }
    }
    const next = saved.filter((s) => s.id !== id);
    await persist(next);
  };

  const clearAll = async () => {
    for (const it of saved) {
      try {
        await FileSystem.deleteAsync(it.localPath, { idempotent: true });
      } catch (e) {
        console.warn('delete failed', e);
      }
    }
    await persist([]);
  };

  return (
    <Ctx.Provider value={{ saved, refresh, saveChannel, saveVod, remove, clearAll }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDownloadManager() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDownloadManager must be used inside DownloadsManagerProvider');
  return v;
}
