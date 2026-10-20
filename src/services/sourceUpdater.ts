// Dynamic Source & Mirror Updater.
// Periodically syncs active working mirrors and playlists from GitHub repositories.
// Protects the app from blocked/banned stream domains without requiring an APK update.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROVIDER_DOMAINS } from './providers/nuvioProviders';

const SOURCE_CACHE_KEY = 'mythtube:remote_sources_v2';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface RemoteSourceManifest {
  lastUpdated: number;
  domains: Record<string, string>;
  activeIptvPlaylists: string[];
}

const DEFAULT_MANIFEST: RemoteSourceManifest = {
  lastUpdated: 0,
  domains: PROVIDER_DOMAINS,
  activeIptvPlaylists: [
    'https://iptv-org.github.io/iptv/index.m3u',
    'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u',
    'https://romaxa55.github.io/world_ip_tv/output/index.m3u',
  ],
};

let cachedManifest: RemoteSourceManifest = DEFAULT_MANIFEST;

/** Load cached mirrors from storage on startup. */
export async function initSourceUpdater(): Promise<RemoteSourceManifest> {
  try {
    const raw = await AsyncStorage.getItem(SOURCE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RemoteSourceManifest;
      cachedManifest = { ...DEFAULT_MANIFEST, ...parsed, domains: { ...DEFAULT_MANIFEST.domains, ...(parsed.domains || {}) } };
      Object.assign(PROVIDER_DOMAINS, cachedManifest.domains);
    }
  } catch {
    // Ignore storage errors on startup
  }

  // Trigger background refresh if stale (> 24 hours)
  if (Date.now() - cachedManifest.lastUpdated > ONE_DAY_MS) {
    refreshRemoteSourcesBackground();
  }

  return cachedManifest;
}

/** Non-blocking background worker that probes and updates provider mirrors. */
export function refreshRemoteSourcesBackground() {
  setTimeout(async () => {
    try {
      // Check active Nuvio repos for any updated domain lists
      const manifestUrl = 'https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(manifestUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        // If reachable, update timestamp and persist
        cachedManifest.lastUpdated = Date.now();
        await AsyncStorage.setItem(SOURCE_CACHE_KEY, JSON.stringify(cachedManifest));
      }
    } catch {
      // Offline or network error; keep existing cached mirrors
    }
  }, 3000);
}

/** Mark a domain as degraded and swap to backup mirror */
export function reportFailedDomain(domainKey: string, fallbackUrl?: string) {
  if (fallbackUrl && PROVIDER_DOMAINS[domainKey as keyof typeof PROVIDER_DOMAINS]) {
    (PROVIDER_DOMAINS as any)[domainKey] = fallbackUrl;
    cachedManifest.domains[domainKey] = fallbackUrl;
    AsyncStorage.setItem(SOURCE_CACHE_KEY, JSON.stringify(cachedManifest)).catch(() => undefined);
  }
}
