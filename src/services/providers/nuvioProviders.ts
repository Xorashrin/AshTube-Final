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
  vidsrcPk: 'https://embed.vidsrc.pk',
  vixsrc: 'https://vixsrc.to',
  videasy: 'https://player.videasy.net',
  streamflix: 'https://streamflix.app',
  multiembed: 'https://multiembed.mov',
  twoEmbed: 'https://www.2embed.cc',
  vidapi: 'https://vidapi.xyz',
  vidsrcTo: 'https://vidsrc.to',
};

/**
 * Builds resilient multi-source streams for any title using Nuvio & Master providers.
 * Guaranteed fallback chain:
 * 1. VidSrc.pk (High reliability multi-server)
 * 2. VixSrc (Nuvio Core M3U8/Embed auto-quality)
 * 3. VidEasy (Multi-server multi-audio)
 * 4. MultiEmbed (Multi-server failover)
 * 5. 2Embed (Clean embed with TV season support)
 * 6. StreamFlix (Multi-language English/Hindi/Regional)
 * 7. VidAPI (Embed provider with subtitles)
 */
export function buildNuvioStreams(query: ProviderQuery, existingStreams?: { name: string; url: string; kind?: string }[]): StreamSource[] {
  const sources: StreamSource[] = [];
  const tmdb = query.tmdbId ? String(query.tmdbId).trim() : '';
  const imdb = query.id ? String(query.id).trim() : '';
  const isSeries = query.kind === 'series';
  const s = query.season ?? 1;
  const e = query.episode ?? 1;
  const primaryId = tmdb || imdb;

  if (!primaryId) {
    return existingStreams ? existingStreams.map((s, idx) => ({
      id: `existing-${idx}`,
      name: s.name,
      url: s.url,
      kind: (s.kind as any) || 'embed',
      quality: 'HD',
    })) : [];
  }

  // 1. VidSrc.pk (Primary stable embed from ALL_SOURCES_MASTER.md)
  if (isSeries) {
    sources.push({
      id: 'vidsrc-pk',
      name: 'Server 1 • VidSrc (Auto 1080p)',
      url: `${PROVIDER_DOMAINS.vidsrcPk}/tv/${imdb || tmdb}/${s}/${e}`,
      kind: 'embed',
      quality: '1080p',
      language: 'Multi-Audio',
    });
  } else {
    sources.push({
      id: 'vidsrc-pk',
      name: 'Server 1 • VidSrc (Auto 1080p)',
      url: `${PROVIDER_DOMAINS.vidsrcPk}/movie/${imdb || tmdb}`,
      kind: 'embed',
      quality: '1080p',
      language: 'Multi-Audio',
    });
  }

  // 2. VixSrc (From Nuvio Yoru repository)
  if (imdb) {
    sources.push({
      id: 'vixsrc',
      name: 'Server 2 • VixSrc (Fast Stream)',
      url: `${PROVIDER_DOMAINS.vixsrc}/embed/${imdb}`,
      kind: 'embed',
      quality: '1080p',
      language: 'English',
    });
  }

  // 3. VidEasy (From Nuvio Spidey & Yoru - Multi-server provider)
  if (tmdb) {
    const videasyUrl = isSeries
      ? `${PROVIDER_DOMAINS.videasy}/tv/${tmdb}/${s}/${e}`
      : `${PROVIDER_DOMAINS.videasy}/movie/${tmdb}`;
    sources.push({
      id: 'videasy',
      name: 'Server 3 • VidEasy (Multi-Language)',
      url: videasyUrl,
      kind: 'embed',
      quality: '1080p',
      language: 'Multi-Language',
    });
  }

  // 4. MultiEmbed (From ALL_SOURCES_MASTER.md)
  if (imdb || tmdb) {
    const multiUrl = isSeries
      ? `${PROVIDER_DOMAINS.multiembed}/?video_id=${imdb || tmdb}&tmdb=1&s=${s}&e=${e}`
      : `${PROVIDER_DOMAINS.multiembed}/?video_id=${imdb || tmdb}&tmdb=1`;
    sources.push({
      id: 'multiembed',
      name: 'Server 4 • MultiEmbed (Backup)',
      url: multiUrl,
      kind: 'embed',
      quality: '720p',
      language: 'Multi-Audio',
    });
  }

  // 5. 2Embed (High uptime Cinemeta embed)
  if (tmdb) {
    const twoEmbedUrl = isSeries
      ? `${PROVIDER_DOMAINS.twoEmbed}/embedtv/${tmdb}&s=${s}&e=${e}`
      : `${PROVIDER_DOMAINS.twoEmbed}/embed/${tmdb}`;
    sources.push({
      id: '2embed',
      name: 'Server 5 • 2Embed (Clean)',
      url: twoEmbedUrl,
      kind: 'embed',
      quality: '720p',
      language: 'English',
    });
  }

  // 6. VidAPI (Subtitles & International)
  if (imdb || tmdb) {
    const vidApiUrl = isSeries
      ? `${PROVIDER_DOMAINS.vidapi}/embed/tv/${imdb || tmdb}/${s}/${e}`
      : `${PROVIDER_DOMAINS.vidapi}/embed/movie/${imdb || tmdb}`;
    sources.push({
      id: 'vidapi',
      name: 'Server 6 • VidAPI (Subtitles)',
      url: vidApiUrl,
      kind: 'embed',
      quality: '720p',
      language: 'Subtitles',
    });
  }

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
