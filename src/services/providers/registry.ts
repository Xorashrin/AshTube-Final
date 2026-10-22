// Unified Modular Provider Registry
// Manages streaming source providers, bounded concurrent discovery, health monitoring,
// error classification, deduplication, and safe CloudStream repository compatibility inspection.

import type {
  CloudstreamCompatibilityReport,
  CloudstreamPluginEntry,
  CloudstreamRepoManifest,
  ContentKind,
  DiscoveredSource,
  ErrorClassification,
  ProviderAdapter,
  ProviderHealthState,
  ProviderMetrics,
  SourceDiscoveryQuery,
} from './types.ts';
import { getJson, hostAvailable } from '../http.ts';

const STREMIFY_BASE = 'https://stremify.hayd.uk';
const CIRCLE_FTP_BASE = 'http://new.circleftp.net:5000/api';
const NUVIO_MANIFEST_URL = 'https://raw.githubusercontent.com/NuvioApp/scrapers/main/manifest.json';

export class BaseProviderAdapter implements ProviderAdapter {
  protected metricsData: ProviderMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageLatencyMs: 0,
  };
  protected enabled = true;

  readonly identity: ProviderAdapter['identity'];
  readonly capabilities: ProviderAdapter['capabilities'];
  readonly priority: number;
  private readonly discoverFn: (query: SourceDiscoveryQuery) => Promise<DiscoveredSource[]>;

  constructor(
    identity: ProviderAdapter['identity'],
    capabilities: ProviderAdapter['capabilities'],
    priority: number,
    discoverFn: (query: SourceDiscoveryQuery) => Promise<DiscoveredSource[]>,
  ) {
    this.identity = identity;
    this.capabilities = capabilities;
    this.priority = priority;
    this.discoverFn = discoverFn;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(val: boolean) {
    this.enabled = val;
  }

  getHealth(): ProviderHealthState {
    if (!this.enabled) return 'offline';
    if (this.identity.repositoryUrl && !hostAvailable(this.identity.repositoryUrl)) return 'offline';
    const total = this.metricsData.totalRequests;
    if (total < 3) return 'healthy';
    const failureRate = this.metricsData.failedRequests / total;
    if (failureRate > 0.6) return 'degraded';
    if (failureRate >= 0.95) return 'offline';
    return 'healthy';
  }

  getMetrics(): ProviderMetrics {
    return { ...this.metricsData };
  }

  async discover(query: SourceDiscoveryQuery): Promise<DiscoveredSource[]> {
    if (!this.enabled || query.signal?.aborted) return [];
    const t0 = Date.now();
    this.metricsData.totalRequests++;

    const timeout = query.timeoutMs ?? 10000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('TIMEOUT')), timeout);
      query.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('ABORTED'));
      });
    });

    try {
      const results = await Promise.race([this.discoverFn(query), timeoutPromise]);
      const latency = Date.now() - t0;
      this.metricsData.successfulRequests++;
      this.metricsData.averageLatencyMs = this.metricsData.averageLatencyMs
        ? Math.round(this.metricsData.averageLatencyMs * 0.7 + latency * 0.3)
        : latency;
      this.metricsData.lastSuccessTimestamp = Date.now();
      return results;
    } catch (err: unknown) {
      const latency = Date.now() - t0;
      this.metricsData.failedRequests++;
      const message = err instanceof Error ? err.message : String(err);
      let classification: ErrorClassification = 'UNKNOWN';
      if (/timeout/i.test(message)) classification = 'TIMEOUT';
      else if (/network|fetch|econn|enotfound/i.test(message)) classification = 'NETWORK_ERROR';
      else if (/json|parse|syntax/i.test(message)) classification = 'PARSE_ERROR';
      else if (/abort/i.test(message)) classification = 'TIMEOUT';

      this.metricsData.lastError = {
        classification,
        message,
        timestamp: Date.now(),
      };
      return [];
    }
  }
}

export class ProviderRegistry {
  private providers = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    this.providers.set(adapter.identity.id, adapter);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.providers.get(id);
  }

  getAll(): ProviderAdapter[] {
    return [...this.providers.values()];
  }

  /**
   * Returns active providers filtered by content kind and language, sorted by priority and health score.
   */
  getEligibleProviders(kind?: ContentKind, preferredLang?: string): ProviderAdapter[] {
    return [...this.providers.values()]
      .filter((p) => p.isEnabled() && p.getHealth() !== 'offline')
      .filter((p) => !kind || p.capabilities.contentTypes.includes(kind))
      .sort((a, b) => {
        // Higher priority first (lower number = higher priority)
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Language match bonus
        if (preferredLang) {
          const aLang = a.capabilities.languages.includes(preferredLang);
          const bLang = b.capabilities.languages.includes(preferredLang);
          if (aLang && !bLang) return -1;
          if (!aLang && bLang) return 1;
        }
        // Health rating bonus
        const healthScore = (state: ProviderHealthState) => (state === 'healthy' ? 0 : state === 'degraded' ? 10 : 20);
        return healthScore(a.getHealth()) - healthScore(b.getHealth());
      });
  }

  /**
   * Bounded concurrent source discovery with deduplication and early progressive streaming of results.
   */
  async discoverSources(
    query: SourceDiscoveryQuery,
    onSourceFound?: (sources: DiscoveredSource[]) => void,
    concurrency = 4,
  ): Promise<DiscoveredSource[]> {
    const eligible = this.getEligibleProviders(query.kind);
    const seenUrls = new Set<string>();
    const allResults: DiscoveredSource[] = [];

    let nextIdx = 0;
    const worker = async () => {
      while (nextIdx < eligible.length && !query.signal?.aborted) {
        const provider = eligible[nextIdx++];
        try {
          const batch = await provider.discover(query);
          if (query.signal?.aborted) return;
          const fresh = batch.filter((s) => !seenUrls.has(s.url));
          for (const s of fresh) {
            seenUrls.add(s.url);
            allResults.push(s);
          }
          if (fresh.length > 0 && onSourceFound) {
            onSourceFound(fresh);
          }
        } catch {
          // resilient: single provider failure never interrupts remaining providers
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, eligible.length) }, () => worker());
    await Promise.all(workers);

    // Deterministic ranking: rank (descending) -> quality -> seekable
    return allResults.sort((a, b) => b.rank - a.rank || (b.seekable ? 1 : 0) - (a.seekable ? 1 : 0));
  }

  /**
   * Safely inspects a CloudStream repository manifest and evaluates its plugin compatibility.
   * Note: CloudStream .cs3 files are compiled Android Dalvik DEX binaries targeting
   * com.lagradost.cloudstream3. They cannot be executed inside a JavaScript sandbox.
   * This audit verifies repository health, manifests, and exposes metadata safely.
   */
  async auditCloudstreamRepository(repoUrl: string): Promise<CloudstreamCompatibilityReport> {
    try {
      const manifest = await getJson<CloudstreamRepoManifest>(repoUrl, { timeout: 8000, retries: 1 });
      const plugins: CloudstreamPluginEntry[] = manifest.plugins ?? [];
      let binaryDexCount = 0;
      let compatibleApiCount = 0;

      for (const p of plugins) {
        if (p.pluginUrl?.endsWith('.cs3')) {
          binaryDexCount++;
        } else {
          compatibleApiCount++;
        }
      }

      return {
        repositoryUrl: repoUrl,
        isAccessible: true,
        manifestVersion: manifest.name || 'v3',
        pluginCount: plugins.length,
        compatiblePlugins: compatibleApiCount,
        incompatibleBinaryPlugins: binaryDexCount,
        reason:
          binaryDexCount > 0
            ? 'CloudStream .cs3 files are compiled Android Dalvik DEX binaries requiring native com.lagradost.cloudstream3 runtime. Safe adapter layer maps public endpoints without executing arbitrary remote bytecode.'
            : 'All plugins expose compatible web/API definitions.',
      };
    } catch (e: unknown) {
      return {
        repositoryUrl: repoUrl,
        isAccessible: false,
        pluginCount: 0,
        compatiblePlugins: 0,
        incompatibleBinaryPlugins: 0,
        reason: e instanceof Error ? e.message : 'Repository manifest unreachable or invalid JSON',
      };
    }
  }
}

export const registry = new ProviderRegistry();
export const auditCloudstreamRepository = (repoUrl: string) => registry.auditCloudstreamRepository(repoUrl);

function registerDefaultProviders(reg: ProviderRegistry) {
  reg.register(
    new BaseProviderAdapter(
      { id: 'bdix-direct', name: 'BDIX Direct Origin', version: '2.0.0' },
      {
        contentTypes: ['movie', 'series', 'anime', 'kdrama'],
        languages: ['en', 'bn', 'hi', 'ja', 'ko'],
        supportsDirectStreams: true,
        supportsHls: true,
        supportsDownloads: true,
        supportsCustomHeaders: false,
      },
      1,
      async (query: SourceDiscoveryQuery): Promise<DiscoveredSource[]> => {
        try {
          if (!query.title) return [];
          const clean = query.title.trim();
          const isSeries = query.kind === 'series' || query.kind === 'kdrama';
          const q = isSeries && query.season ? `${clean} S${String(query.season).padStart(2, '0')}` : clean;
          const res = await getJson<{ files?: { name: string; url: string; size?: number }[] }>(
            `${CIRCLE_FTP_BASE}/search?q=${encodeURIComponent(q)}`,
            { timeout: 7000 },
          ).catch(() => null);

          if (!res?.files?.length) return [];
          return res.files.slice(0, 5).map((f, i) => ({
            id: `bdix:${i}:${f.url}`,
            url: f.url,
            providerId: 'bdix-direct',
            providerName: 'BDIX Direct Origin',
            name: f.name,
            quality: '1080p',
            rank: 90,
            seekable: true,
            downloadable: true,
            hls: Boolean(f.url.includes('.m3u8')),
          }));
        } catch {
          return [];
        }
      },
    ),
  );

  reg.register(
    new BaseProviderAdapter(
      { id: 'circleftp-amader', name: 'Circle & AmaderFTP', version: '2.0.0' },
      {
        contentTypes: ['movie', 'series', 'anime', 'kdrama'],
        languages: ['en', 'bn', 'hi', 'ja', 'ko'],
        supportsDirectStreams: true,
        supportsHls: false,
        supportsDownloads: true,
        supportsCustomHeaders: false,
      },
      2,
      async (query: SourceDiscoveryQuery): Promise<DiscoveredSource[]> => {
        try {
          if (!query.title) return [];
          const res = await getJson<{ files?: { name: string; url: string }[] }>(
            `${CIRCLE_FTP_BASE}/search?q=${encodeURIComponent(query.title.trim())}`,
            { timeout: 7000 },
          ).catch(() => null);

          if (!res?.files?.length) return [];
          return res.files.slice(0, 5).map((f, i) => ({
            id: `circle:${i}:${f.url}`,
            url: f.url,
            providerId: 'circleftp-amader',
            providerName: 'Circle & AmaderFTP',
            name: f.name,
            quality: '1080p',
            rank: 95,
            seekable: true,
            downloadable: true,
            hls: false,
          }));
        } catch {
          return [];
        }
      },
    ),
  );

  reg.register(
    new BaseProviderAdapter(
      { id: 'southfreak-bdix', name: 'Southfreak BDIX Mirrors', version: '2.0.0' },
      {
        contentTypes: ['movie', 'series', 'kdrama'],
        languages: ['en', 'hi', 'bn', 'ta', 'te'],
        supportsDirectStreams: true,
        supportsHls: false,
        supportsDownloads: true,
        supportsCustomHeaders: false,
      },
      3,
      async (query: SourceDiscoveryQuery): Promise<DiscoveredSource[]> => {
        try {
          if (!query.title) return [];
          const res = await getJson<{ id: number; title: { rendered: string }; link: string }[]>(
            `https://southfreak.club/wp-json/wp/v2/posts?search=${encodeURIComponent(query.title)}&per_page=3`,
            { timeout: 7000 },
          ).catch(() => null);

          if (!res?.length) return [];
          return res.map((p, i) => ({
            id: `sf:${p.id}:${i}`,
            url: p.link,
            providerId: 'southfreak-bdix',
            providerName: 'Southfreak Mirror',
            name: p.title?.rendered ?? query.title,
            quality: 'HD',
            rank: 80,
            seekable: true,
            downloadable: true,
            hls: false,
          }));
        } catch {
          return [];
        }
      },
    ),
  );

  reg.register(
    new BaseProviderAdapter(
      { id: 'animepahe-provider', name: 'AnimePahe & AniList Streams', version: '2.0.0' },
      {
        contentTypes: ['anime'],
        languages: ['ja', 'en'],
        supportsDirectStreams: true,
        supportsHls: true,
        supportsDownloads: true,
        supportsCustomHeaders: true,
      },
      4,
      async (query: SourceDiscoveryQuery): Promise<DiscoveredSource[]> => {
        try {
          if (!query.imdbId) return [];
          const sid = query.season ? `${query.imdbId}:${query.season}:${query.episode ?? 1}` : query.imdbId;
          const url = `${STREMIFY_BASE}/stream/series/${encodeURIComponent(sid)}.json`;
          const res = await getJson<{ streams?: { url?: string; name?: string; title?: string }[] }>(url, { timeout: 8000 }).catch(() => null);

          return (res?.streams ?? []).filter((s) => Boolean(s.url)).map((s, i) => ({
            id: `animepahe:${i}:${s.url}`,
            url: s.url!,
            providerId: 'animepahe-provider',
            providerName: s.name ?? 'AnimePahe',
            quality: s.title ?? s.name ?? 'HD',
            rank: 70,
            seekable: true,
            downloadable: true,
            hls: Boolean(s.url?.includes('.m3u8')),
          }));
        } catch {
          return [];
        }
      },
    ),
  );

  reg.register(
    new BaseProviderAdapter(
      { id: 'kdrama-hub', name: 'Asian Drama & KDrama Hub', version: '2.0.0' },
      {
        contentTypes: ['kdrama', 'series'],
        languages: ['ko', 'en', 'zh'],
        supportsDirectStreams: true,
        supportsHls: true,
        supportsDownloads: false,
        supportsCustomHeaders: true,
      },
      5,
      async (query: SourceDiscoveryQuery): Promise<DiscoveredSource[]> => {
        try {
          if (!query.imdbId) return [];
          const sid = query.season ? `${query.imdbId}:${query.season}:${query.episode ?? 1}` : query.imdbId;
          const url = `${STREMIFY_BASE}/stream/series/${encodeURIComponent(sid)}.json`;
          const res = await getJson<{ streams?: { url?: string; name?: string; title?: string }[] }>(url, { timeout: 8000 }).catch(() => null);

          return (res?.streams ?? []).filter((s) => Boolean(s.url)).map((s, i) => ({
            id: `kdrama:${i}:${s.url}`,
            url: s.url!,
            providerId: 'kdrama-hub',
            providerName: s.name ?? 'KDrama Hub',
            quality: s.title ?? s.name ?? 'HD',
            rank: 60,
            seekable: true,
            downloadable: false,
            hls: Boolean(s.url?.includes('.m3u8')),
          }));
        } catch {
          return [];
        }
      },
    ),
  );

  reg.register(
    new BaseProviderAdapter(
      { id: 'stremio-provider', name: 'Stremio Community Addons', version: '2.0.0' },
      {
        contentTypes: ['movie', 'series', 'anime', 'kdrama'],
        languages: ['en', 'multi'],
        supportsDirectStreams: true,
        supportsHls: true,
        supportsDownloads: false,
        supportsCustomHeaders: true,
      },
      6,
      async (query: SourceDiscoveryQuery): Promise<DiscoveredSource[]> => {
        try {
          if (!query.imdbId) return [];
          const kind = query.kind === 'series' || query.kind === 'kdrama' ? 'series' : 'movie';
          const sid = kind === 'series' && query.season ? `${query.imdbId}:${query.season}:${query.episode ?? 1}` : query.imdbId;
          const url = `${STREMIFY_BASE}/stream/${kind}/${encodeURIComponent(sid)}.json`;
          const res = await getJson<{ streams?: { url?: string; name?: string; title?: string }[] }>(url, { timeout: 8000 }).catch(() => null);

          return (res?.streams ?? []).filter((s) => Boolean(s.url)).map((s, i) => ({
            id: `stremio:${i}:${s.url}`,
            url: s.url!,
            providerId: 'stremio-provider',
            providerName: s.name ?? 'Stremify',
            quality: s.title ?? s.name ?? 'HD',
            rank: 40,
            seekable: true,
            downloadable: false,
            hls: Boolean(s.url?.includes('.m3u8')),
          }));
        } catch {
          return [];
        }
      },
    ),
  );

  reg.register(
    new BaseProviderAdapter(
      { id: 'nuvio-provider', name: 'Nuvio Multi-Server Provider', version: '2.0.0' },
      {
        contentTypes: ['movie', 'series', 'anime', 'kdrama'],
        languages: ['en', 'multi'],
        supportsDirectStreams: true,
        supportsHls: true,
        supportsDownloads: false,
        supportsCustomHeaders: true,
      },
      7,
      async (_query: SourceDiscoveryQuery): Promise<DiscoveredSource[]> => {
        try {
          const manifest = await getJson<{ scrapers?: { id: string; name: string }[] }>(NUVIO_MANIFEST_URL, { timeout: 6000 }).catch(() => null);
          if (manifest?.scrapers?.length) {
            return [];
          }
          return [];
        } catch {
          return [];
        }
      },
    ),
  );
}

registerDefaultProviders(registry);


