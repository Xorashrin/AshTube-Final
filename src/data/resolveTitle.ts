// Title resolver — bridges VOD titles (from Cinemeta) + Adult VOD titles
// (from xvideos scrape) + mock titles (legacy demo). Returns a Title-compatible
// object that TitleScreen, PlayerScreen, and other screens can consume.
import { getTitle, type Title, type Episode, type Season } from './mock';
import { VOD_TITLES, getVodTitle, type VodTitle } from './vod';
import { ADULT_VOD_TITLES } from './adult_vod';
import { buildNuvioStreams } from '../services/providers/nuvioProviders';

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
 * Resolve any id to a Title. Try VOD (Cinemeta) → Adult VOD (xvideos) → mock.
 */
export function resolveTitle(id: string): Title {
  const vod = lookupVod(id);
  if (vod) return vodToTitle(vod);
  return getTitle(id);
}

/** True when the id is a real VOD title (Cinemeta or adult). */
export function isVodId(id: string): boolean {
  return VOD_TITLES.some((t) => t.id === id) || ADULT_VOD_TITLES.some((t) => t.id === id);
}

/** Real-titles-first search index for the Search screen. */
export const RESOLVED_TITLES: Title[] = [
  ...VOD_TITLES.map(vodToTitle),
  ...ADULT_VOD_TITLES.map(vodToTitle),
];

export { VOD_TITLES, getVodTitle, vodToTitle, ADULT_VOD_TITLES };
export type { VodTitle };
