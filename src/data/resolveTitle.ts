// Title resolver — bridges VOD titles (from Cinemeta) + Adult VOD titles
// (from xvideos scrape) + mock titles (legacy demo). Returns a Title-compatible
// object that TitleScreen, PlayerScreen, and other screens can consume.
import { getTitle, type Title, type Episode, type Season } from './mock';
import { VOD_TITLES, getVodTitle, type VodTitle } from './vod';
import { ADULT_VOD_TITLES } from './adult_vod';
import { buildNuvioStreams } from '../services/providers/nuvioProviders';

// Cache for live-searched titles so any title in the world can be resolved seamlessly.
export const DYNAMIC_TITLES = new Map<string, Title>();

export function registerDynamicTitle(title: Title) {
  DYNAMIC_TITLES.set(title.id, title);
}

/**
 * Convert a VodTitle (real Cinemeta metadata OR real xvideos adult scrape)
 * into the Title shape that the rest of the app expects. Automatically attaches
 * Nuvio provider multi-source streams for resilient playback.
 */
function vodToTitle(v: VodTitle): Title {
  const nuvioStreams = buildNuvioStreams(
    { id: v.id, tmdbId: v.tmdb_id, kind: v.kind },
    v.streams
  );
  const primaryVideo = (nuvioStreams.length > 0 ? nuvioStreams[0].url : '') || v.video;
  const episode: Episode = {
    id: `${v.id}-e1`,
    number: 1,
    name: v.name,
    runtime: v.runtime || 120,
    synopsis: v.synopsis,
    seed: v.id,
    video: primaryVideo,
  };
  const seasons: Season[] = v.kind === 'series' ? [{ number: 1, episodes: [episode] }] : [];
  return {
    id: v.id,
    name: v.name,
    kind: v.kind,
    year: v.year,
    maturity: v.maturity,
    runtime: v.runtime,
    seasons,
    genres: v.genres,
    moods: v.moods,
    synopsis: v.synopsis,
    cast: v.cast,
    creators: v.creators,
    original: v.original,
    seed: v.seed,
    tint: v.tint,
    video: primaryVideo,
    quality: v.quality as unknown as Title['quality'],
    poster: v.poster,
    background: v.background,
    imdbRating: v.imdbRating,
    // Full Nuvio & Master multi-source stream list
    streams: nuvioStreams as unknown as { name: string; url: string; kind: string }[],
  } as Title;
}

/** Lookup a VodTitle (Cinemeta OR adult). */
function lookupVod(id: string): VodTitle | undefined {
  const v = getVodTitle(id);
  if (v) return v;
  return ADULT_VOD_TITLES.find((t) => t.id === id);
}

/**
 * Resolve any id to a Title.
 * 1. Check dynamic search cache
 * 2. Check pre-bundled VOD (Cinemeta)
 * 3. Check pre-bundled Adult VOD (xvideos)
 * 4. If IMDb id (`tt...`), dynamically generate full Nuvio multi-server streams
 * 5. Fallback to mock title
 */
export function resolveTitle(id: string): Title {
  if (DYNAMIC_TITLES.has(id)) {
    return DYNAMIC_TITLES.get(id)!;
  }
  const vod = lookupVod(id);
  if (vod) return vodToTitle(vod);

  if (id && id.startsWith('tt')) {
    const streams = buildNuvioStreams({ id, kind: 'movie' });
    const primaryVideo = streams.length > 0 ? streams[0].url : '';
    const dyn: Title = {
      id,
      name: id,
      kind: 'movie',
      year: 2024,
      maturity: '16+',
      runtime: 120,
      seasons: [],
      genres: ['Featured', 'Cinema'],
      moods: ['Full Movie', 'Streaming'],
      synopsis: 'Streaming ready across high-speed international servers.',
      cast: [],
      creators: [],
      original: false,
      seed: id,
      tint: '#1A2A3A',
      video: primaryVideo,
      quality: ['HD', '4K'] as any,
      poster: `https://images.metahub.space/poster/medium/${id}/img`,
      background: `https://images.metahub.space/background/medium/${id}/img`,
      streams: streams as any,
    };
    DYNAMIC_TITLES.set(id, dyn);
    return dyn;
  }

  return getTitle(id);
}

/**
 * Live search via Cinemeta public catalog API.
 * Enables searching ANY movie or series in the world.
 */
export async function fetchCinemetaLiveSearch(query: string): Promise<Title[]> {
  const q = encodeURIComponent(query.trim().toLowerCase());
  if (!q) return [];
  try {
    const [moviesRes, seriesRes] = await Promise.all([
      fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${q}.json`)
        .then((r) => r.json())
        .catch(() => ({ metas: [] })),
      fetch(`https://v3-cinemeta.strem.io/catalog/series/top/search=${q}.json`)
        .then((r) => r.json())
        .catch(() => ({ metas: [] })),
    ]);

    const allMetas: any[] = [...(moviesRes?.metas || []), ...(seriesRes?.metas || [])];
    const results: Title[] = [];

    for (const m of allMetas) {
      if (!m.id || !m.name) continue;
      const isSeries = m.type === 'series';
      const streams = buildNuvioStreams({ id: m.id, kind: isSeries ? 'series' : 'movie' });
      const primaryVideo = streams.length > 0 ? streams[0].url : '';
      const year = parseInt(m.releaseInfo || m.year || '2024', 10) || 2024;
      const title: Title = {
        id: m.id,
        name: m.name,
        kind: isSeries ? 'series' : 'movie',
        year,
        maturity: m.type === 'series' ? '16+' : '13+',
        runtime: isSeries ? 45 : 120,
        seasons: isSeries ? [{ number: 1, episodes: [{ id: `${m.id}-e1`, number: 1, name: m.name, runtime: 45, synopsis: m.description || m.name, seed: m.id, video: primaryVideo }] }] : [],
        genres: m.genres || (isSeries ? ['TV Series', 'Drama'] : ['Movie', 'Action']),
        moods: ['Full Content', 'Verified Stream'],
        synopsis: m.description || `Watch ${m.name} (${year}) in Full HD with multi-language audio tracks.`,
        cast: m.cast || [],
        creators: m.director ? [m.director] : [],
        original: false,
        seed: m.id,
        tint: '#1A2A3A',
        video: primaryVideo,
        quality: ['HD', '4K'] as any,
        poster: m.poster || `https://images.metahub.space/poster/medium/${m.id}/img`,
        background: m.background || `https://images.metahub.space/background/medium/${m.id}/img`,
        imdbRating: m.imdbRating || '',
        streams: streams as any,
      };
      DYNAMIC_TITLES.set(title.id, title);
      results.push(title);
    }
    return results;
  } catch {
    return [];
  }
}

/** True when the id is a real VOD title (Cinemeta or adult). */
export function isVodId(id: string): boolean {
  return VOD_TITLES.some((t) => t.id === id) || ADULT_VOD_TITLES.some((t) => t.id === id) || (typeof id === 'string' && id.startsWith('tt'));
}

/** Real-titles-first search index for the Search screen. */
export const RESOLVED_TITLES: Title[] = [
  ...VOD_TITLES.map(vodToTitle),
  ...ADULT_VOD_TITLES.map(vodToTitle),
];

export { VOD_TITLES, getVodTitle, vodToTitle, ADULT_VOD_TITLES };
export type { VodTitle };
