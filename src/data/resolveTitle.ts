// Title resolver — bridges VOD titles (from Cinemeta) + Adult VOD titles
// (from xvideos scrape) + mock titles (legacy demo). Returns a Title-compatible
// object that TitleScreen, PlayerScreen, and other screens can consume.
import { getTitle, type Title, type Episode, type Season } from './mock';
import { VOD_TITLES, getVodTitle, type VodTitle } from './vod';
import { ADULT_VOD_TITLES } from './adult_vod';
import { buildNuvioStreams, pickDirectMp4Url } from '../services/providers/nuvioProviders';

// Cache for live-searched titles so any title in the world can be resolved seamlessly.
export const DYNAMIC_TITLES = new Map<string, Title>();

export function registerDynamicTitle(title: Title) {
  DYNAMIC_TITLES.set(title.id, title);
}

const EPISODE_SUBTITLES = [
  'The Awakening',
  'Shadows in the Mist',
  'Crossroads',
  'Into the Storm',
  'The Reckoning',
  'Beyond the Horizon',
];

function buildSeriesSeasons(id: string, name: string, baseRuntime: number, synopsis: string): Season[] {
  const epRuntime = baseRuntime > 15 && baseRuntime <= 90 ? baseRuntime : 46;
  return [1, 2].map((seasonNum) => ({
    number: seasonNum,
    episodes: EPISODE_SUBTITLES.map((sub, idx) => {
      const epNum = idx + 1;
      const epId = `${id}-s${seasonNum}e${epNum}`;
      return {
        id: epId,
        number: epNum,
        name: `Episode ${epNum}: ${sub}`,
        runtime: epRuntime + ((seasonNum + idx) % 7) - 3,
        synopsis:
          idx === 0 && seasonNum === 1
            ? synopsis
            : `${name} — Season ${seasonNum}, Episode ${epNum} (“${sub}”). Tensions rise as unexpected alliances are tested.`,
        seed: epId,
        video: pickDirectMp4Url(epId, idx),
      };
    }),
  }));
}

/**
 * Convert a VodTitle (real Cinemeta metadata OR real xvideos adult scrape)
 * into the Title shape that the rest of the app expects. Automatically attaches
 * Nuvio provider multi-source streams (Direct MP4/HLS + Embed servers) for resilient playback.
 */
function vodToTitle(v: VodTitle): Title {
  const nuvioStreams = buildNuvioStreams(
    { id: v.id, tmdbId: v.tmdb_id, kind: v.kind },
    v.streams,
  );
  const directMp4 = pickDirectMp4Url(v.id, 0);
  const primaryVideo = directMp4 || (nuvioStreams.length > 0 ? nuvioStreams[0].url : '') || v.video;
  const seasons: Season[] =
    v.kind === 'series' ? buildSeriesSeasons(v.id, v.name, v.runtime || 45, v.synopsis) : [];

  return {
    id: v.id,
    name: v.name,
    kind: v.kind,
    year: v.year,
    maturity: v.maturity,
    runtime: v.runtime || (v.kind === 'series' ? 45 : 120),
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
    const primaryVideo = pickDirectMp4Url(id, 0) || (streams.length > 0 ? streams[0].url : '');
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
      quality: ['HD', '4K'] as Title['quality'],
      poster: `https://images.metahub.space/poster/medium/${id}/img`,
      background: `https://images.metahub.space/background/medium/${id}/img`,
      streams: streams as unknown as Title['streams'],
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

    const allMetas: Record<string, unknown>[] = [...(moviesRes?.metas || []), ...(seriesRes?.metas || [])];
    const results: Title[] = [];

    for (const m of allMetas) {
      const mId = typeof m.id === 'string' ? m.id : '';
      const mName = typeof m.name === 'string' ? m.name : '';
      if (!mId || !mName) continue;
      const isSeries = m.type === 'series';
      const streams = buildNuvioStreams({ id: mId, kind: isSeries ? 'series' : 'movie' });
      const primaryVideo = pickDirectMp4Url(mId, 0) || (streams.length > 0 ? streams[0].url : '');
      const yearStr = typeof m.releaseInfo === 'string' ? m.releaseInfo : typeof m.year === 'string' ? m.year : '2024';
      const year = parseInt(yearStr, 10) || 2024;
      const desc = typeof m.description === 'string' && m.description ? m.description : `Watch ${mName} (${year}) in Full HD with multi-language audio tracks.`;
      const title: Title = {
        id: mId,
        name: mName,
        kind: isSeries ? 'series' : 'movie',
        year,
        maturity: isSeries ? '16+' : '13+',
        runtime: isSeries ? 45 : 120,
        seasons: isSeries ? buildSeriesSeasons(mId, mName, 45, desc) : [],
        genres: Array.isArray(m.genres) ? (m.genres as string[]) : isSeries ? ['TV Series', 'Drama'] : ['Movie', 'Action'],
        moods: ['Full Content', 'Verified Stream'],
        synopsis: desc,
        cast: Array.isArray(m.cast) ? (m.cast as string[]) : [],
        creators: typeof m.director === 'string' ? [m.director] : Array.isArray(m.director) ? (m.director as string[]) : [],
        original: false,
        seed: mId,
        tint: '#1A2A3A',
        video: primaryVideo,
        quality: ['HD', '4K'] as Title['quality'],
        poster: typeof m.poster === 'string' && m.poster ? m.poster : `https://images.metahub.space/poster/medium/${mId}/img`,
        background: typeof m.background === 'string' && m.background ? m.background : `https://images.metahub.space/background/medium/${mId}/img`,
        imdbRating: typeof m.imdbRating === 'string' ? m.imdbRating : '',
        streams: streams as unknown as Title['streams'],
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
