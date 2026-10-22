// Modular Provider Registry Types and Interfaces
// Architecture for safe, extensible streaming source integration across Movies, TV, Anime, and K-Drama.

export type ContentKind = 'movie' | 'series' | 'anime' | 'kdrama';

export type ErrorClassification =
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'EMPTY_RESULT'
  | 'UNSUPPORTED_MEDIA'
  | 'SECURITY_BLOCKED'
  | 'UNKNOWN';

export type ProviderHealthState = 'healthy' | 'degraded' | 'offline' | 'unsupported';

export interface ProviderIdentity {
  id: string;
  name: string;
  version: string;
  author?: string;
  homepage?: string;
  repositoryUrl?: string;
}

export interface ProviderCapability {
  contentTypes: ContentKind[];
  languages: string[];
  supportsDirectStreams: boolean;
  supportsHls: boolean;
  supportsDownloads: boolean;
  supportsCustomHeaders: boolean;
  requiresNativeRuntime?: boolean;
}

export interface ProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  lastSuccessTimestamp?: number;
  lastError?: {
    classification: ErrorClassification;
    message: string;
    timestamp: number;
  };
}

export interface DiscoveredSource {
  id: string;
  url: string;
  providerId: string;
  providerName: string;
  name?: string;
  quality: string;
  rank: number;
  seekable: boolean;
  downloadable: boolean;
  hls: boolean;
  sizeBytes?: number;
  fileName?: string;
  headers?: Record<string, string>;
}

export interface SourceDiscoveryQuery {
  title: string;
  kind: ContentKind;
  year?: number;
  season?: number;
  episode?: number;
  tmdbId?: number;
  imdbId?: string;
  aliases?: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ProviderAdapter {
  readonly identity: ProviderIdentity;
  readonly capabilities: ProviderCapability;
  readonly priority: number;
  isEnabled(): boolean;
  getHealth(): ProviderHealthState;
  getMetrics(): ProviderMetrics;
  discover(query: SourceDiscoveryQuery): Promise<DiscoveredSource[]>;
}

/**
 * CloudStream Extension Repository Manifest Schema
 * Documents the actual remote format published by CloudStream repositories.
 */
export interface CloudstreamRepoManifest {
  name?: string;
  pluginLists?: string[];
  plugins?: CloudstreamPluginEntry[];
}

export interface CloudstreamPluginEntry {
  name: string;
  pluginUrl: string;
  version: number;
  apiVersion?: number;
  authors?: string[];
  description?: string;
  status?: number;
  tvTypes?: string[];
  language?: string;
}

export interface CloudstreamCompatibilityReport {
  repositoryUrl: string;
  isAccessible: boolean;
  manifestVersion?: string;
  pluginCount: number;
  compatiblePlugins: number;
  incompatibleBinaryPlugins: number;
  reason: string;
}
