// Nuvio & Master Sources Provider Engine.
// Extracted and harmonized from Nuvio Plugin Library (https://nuvioplugin.com/)
// and /home/ASHRIN/Downloads/ALL_SOURCES_MASTER.md.
// Provides resilient, multi-source resolution across international & regional servers.

export interface StreamSource {
  id: string;
  name: string;
  url: string;
  kind: 'embed' | 'hls' | 'mp4';
  quality: string;
  language?: string;
  isDirect?: boolean;
}

export interface ProviderQuery {
  id?: string;          // IMDb id e.g. tt1381078
  tmdbId?: number | string; // TMDB numeric id
  kind?: 'movie' | 'series';
  season?: number;
  episode?: number;
}

// Active mirror domains with fallback resilience
export const PROVIDER_DOMAINS = {
  vidsrcTo: 'https://vidsrc.to',
  vidsrcPm: 'https://vidsrc.pm',
  vidsrcSh: 'https://vidsrc.sh',
  twoEmbed: 'https://www.2embed.cc',
  multiembed: 'https://multiembed.mov',
  videasy: 'https://player.videasy.to',
  vidapi: 'https://vidapi.xyz',
};

/**
 * Builds resilient multi-source streams for any title using Nuvio & Master providers.
 * Guaranteed fallback chain:
 * 1. VidSrc.to (High reliability auto-1080p)
 * 2. VidSrc.pm (Primary mirror with high CDN speed)
 * 3. VidSrc.sh (Alternative mirror with multi-audio)
 * 4. 2Embed (Clean Cinemeta embed provider)
 * 5. MultiEmbed (Multi-server failover)
 * 6. VidEasy (Multi-server multi-audio)
 */
export function buildNuvioStreams(query: ProviderQuery, existingStreams?: { name: string; url: string; kind?: string }[]): StreamSource[] {
  const sources: StreamSource[] = [];
  const tmdb = query.tmdbId ? String(query.tmdbId).trim() : '';
  const imdb = query.id ? String(query.id).trim() : '';
  const isSeries = query.kind === 'series';
  const s = query.season ?? 1;
  const e = query.episode ?? 1;

  // Check if target is an adult video (e.g., xv-...) or custom direct stream
  const isImdb = imdb.startsWith('tt');
  const isTmdb = /^\d+$/.test(tmdb) || /^\d+$/.test(imdb);

  if (!isImdb && !isTmdb) {
    // Adult VOD content and custom streams should directly use their verified video embed sources
    if (existingStreams && existingStreams.length > 0) {
      return existingStreams.map((item, idx) => ({
        id: `direct-${idx}`,
        name: item.name || `Server ${idx + 1} • High Speed`,
        url: item.url,
        kind: (item.kind as any) || 'embed',
        quality: '1080p',
      }));
    }
    return [];
  }

  const primaryId = isImdb ? imdb : (tmdb || imdb);

  // 1. VidSrc.to (Primary clean embed)
  if (isSeries) {
    sources.push({
      id: 'vidsrc-to',
      name: 'Server 1 • VidSrc (Auto 1080p)',
      url: `${PROVIDER_DOMAINS.vidsrcTo}/embed/tv/${primaryId}/${s}/${e}`,
      kind: 'embed',
      quality: '1080p',
      language: 'Multi-Audio',
    });
  } else {
    sources.push({
      id: 'vidsrc-to',
      name: 'Server 1 • VidSrc (Auto 1080p)',
      url: `${PROVIDER_DOMAINS.vidsrcTo}/embed/movie/${primaryId}`,
      kind: 'embed',
      quality: '1080p',
      language: 'Multi-Audio',
    });
  }

  // 2. VidSrc.pm (Mirror with fast CDN)
  if (isSeries) {
    sources.push({
      id: 'vidsrc-pm',
      name: 'Server 2 • VidSrc PM (Fast CDN)',
      url: `${PROVIDER_DOMAINS.vidsrcPm}/embed/tv/${primaryId}/${s}/${e}`,
      kind: 'embed',
      quality: '1080p',
      language: 'English',
    });
  } else {
    sources.push({
      id: 'vidsrc-pm',
      name: 'Server 2 • VidSrc PM (Fast CDN)',
      url: `${PROVIDER_DOMAINS.vidsrcPm}/embed/movie/${primaryId}`,
      kind: 'embed',
      quality: '1080p',
      language: 'English',
    });
  }

  // 3. VidSrc.sh (Alternative multi-server mirror)
  if (isSeries) {
    sources.push({
      id: 'vidsrc-sh',
      name: 'Server 3 • VidSrc SH (Multi-Server)',
      url: `${PROVIDER_DOMAINS.vidsrcSh}/embed/tv?imdb=${primaryId}&season=${s}&episode=${e}`,
      kind: 'embed',
      quality: '1080p',
      language: 'Multi-Audio',
    });
  } else {
    sources.push({
      id: 'vidsrc-sh',
      name: 'Server 3 • VidSrc SH (Multi-Server)',
      url: `${PROVIDER_DOMAINS.vidsrcSh}/embed/movie?imdb=${primaryId}`,
      kind: 'embed',
      quality: '1080p',
      language: 'Multi-Audio',
    });
  }

  // 4. 2Embed (High uptime Cinemeta embed)
  const twoEmbedUrl = isSeries
    ? `${PROVIDER_DOMAINS.twoEmbed}/embedtv/${primaryId}&s=${s}&e=${e}`
    : `${PROVIDER_DOMAINS.twoEmbed}/embed/${primaryId}`;
  sources.push({
    id: '2embed',
    name: 'Server 4 • 2Embed (Clean)',
    url: twoEmbedUrl,
    kind: 'embed',
    quality: '720p',
    language: 'English',
  });

  // 5. MultiEmbed (Failover)
  const multiUrl = isSeries
    ? `${PROVIDER_DOMAINS.multiembed}/?video_id=${primaryId}&tmdb=1&s=${s}&e=${e}`
    : `${PROVIDER_DOMAINS.multiembed}/?video_id=${primaryId}&tmdb=1`;
  sources.push({
    id: 'multiembed',
    name: 'Server 5 • MultiEmbed (Backup)',
    url: multiUrl,
    kind: 'embed',
    quality: '720p',
    language: 'Multi-Audio',
  });

  // 6. VidEasy (Multi-Language)
  const videasyUrl = isSeries
    ? `${PROVIDER_DOMAINS.videasy}/tv/${tmdb || primaryId}/${s}/${e}`
    : `${PROVIDER_DOMAINS.videasy}/movie/${tmdb || primaryId}`;
  sources.push({
    id: 'videasy',
    name: 'Server 6 • VidEasy (Multi-Language)',
    url: videasyUrl,
    kind: 'embed',
    quality: '1080p',
    language: 'Multi-Language',
  });

  // Merge any existing verified streams (e.g. trailers or direct files)
  if (existingStreams && existingStreams.length > 0) {
    existingStreams.forEach((ex, idx) => {
      // Don't add duplicate URLs
      if (!sources.some((s) => s.url === ex.url)) {
        sources.push({
          id: `custom-${idx}`,
          name: ex.name.toUpperCase(),
          url: ex.url,
          kind: (ex.kind as any) || 'embed',
          quality: 'HD',
        });
      }
    });
  }

  return sources;
}
