// Single, reusable identity-resolution service.
// Resolves titles from any source to TMDB, IMDb, MAL, and TVDB identifiers with confidence-scored matching.
import type { Title } from '../data/types';
import { cached } from './cache';
import { getJson } from './http';
import { TMDB_KEY } from './nuvio/runtime';
import * as anilist from './sources/anilist';
import * as cinemeta from './sources/cinemeta';

export type MappingConfidence = 'exact' | 'high' | 'medium' | 'fallback';

export interface Ids {
  tmdbId?: number;
  imdbId?: string;
  /** TMDB season (anime sequels & split cours). */
  season?: number;
  malId?: number;
  tvdbId?: number;
  confidence?: MappingConfidence;
}

const inMemory = new Map<string, Promise<Ids>>();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** TMDB find lookup by IMDb id: IMDb id → TMDB id */
async function tmdbFindByImdb(imdbId: string, series: boolean): Promise<number | undefined> {
  if (!imdbId || !/^tt\d+/i.test(imdbId)) return undefined;
  try {
    const r = await getJson<{ movie_results?: { id: number }[]; tv_results?: { id: number }[] }>(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`,
      { timeout: 9000, retries: 1 },
    );
    return (series ? r.tv_results?.[0]?.id : r.movie_results?.[0]?.id) ?? r.tv_results?.[0]?.id ?? r.movie_results?.[0]?.id;
  } catch {
    return undefined;
  }
}

/** Conservative TMDB search by title and release year */
async function tmdbSearch(title: Title): Promise<number | undefined> {
  try {
    const kind = title.kind === 'series' ? 'tv' : 'movie';
    const yearParam = title.kind === 'series' ? 'first_air_date_year' : 'year';
    const cleanName = title.name.replace(/\s*\([^)]*\)/g, '').trim();
    const r = await getJson<{ results?: { id: number; name?: string; title?: string; release_date?: string; first_air_date?: string }[] }>(
      `https://api.themoviedb.org/3/search/${kind}?api_key=${TMDB_KEY}&query=${encodeURIComponent(cleanName)}&${yearParam}=${title.year}`,
      { timeout: 9000, retries: 1 },
    );
    const targetNorm = norm(cleanName);
    const hit = r.results?.find((x) => norm(x.name ?? x.title ?? '') === targetNorm) ?? r.results?.[0];
    return hit?.id;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a title's identity with prioritized source mapping:
 * 1. Pre-existing Title IDs (exact)
 * 2. Ani.zip mappings (exact cross-catalog mappings with sequel season offsets)
 * 3. ARM Haglund mappings (high confidence)
 * 4. Cinemeta metadata (high confidence)
 * 5. TMDB search with normalized title and year (conservative fallback)
 */
export function identify(title: Title): Promise<Ids> {
  // If the title already carries verified TMDB and IMDb IDs, return immediately.
  if (title.tmdbId && title.imdbId) {
    return Promise.resolve({
      tmdbId: title.tmdbId,
      imdbId: title.imdbId,
      season: title.tmdbSeason,
      confidence: 'exact',
    });
  }

  const memHit = inMemory.get(title.id);
  if (memHit) return memHit;

  const job = (async (): Promise<Ids> => {
    const cacheKey = `identify:v2:${title.id}`;
    return cached<Ids>(cacheKey, { ttl: 7 * 24 * 3600 * 1000 }, async () => {
      // ---- A. Anime titles (AniList source)
      if (title.source === 'anilist') {
        const mapped = await anilist.mapIds(title);
        if (mapped.tmdbId || mapped.imdbId) {
          return {
            tmdbId: mapped.tmdbId,
            imdbId: mapped.imdbId,
            season: mapped.season,
            malId: mapped.malId,
            tvdbId: mapped.tvdbId,
            confidence: mapped.tmdbId && mapped.imdbId ? 'exact' : 'high',
          };
        }
        // Fallback: search TMDB with title name
        const tmdbId = await tmdbSearch(title);
        return {
          tmdbId,
          season: title.tmdbSeason,
          confidence: tmdbId ? 'fallback' : undefined,
        };
      }

      // ---- B. Cinemeta titles
      if (title.source === 'cinemeta') {
        const detailed = await cinemeta.detail(title).catch(() => title);
        const imdbId = title.imdbId ?? title.ref;
        const tmdbId = detailed.tmdbId ?? title.tmdbId ?? (await tmdbFindByImdb(imdbId, title.kind === 'series'));
        return {
          tmdbId,
          imdbId,
          confidence: tmdbId && imdbId ? 'exact' : 'high',
        };
      }

      // Adult streams or unmapped stremio titles
      if (title.nsfw || title.source === 'stremio') return {};

      // ---- C. Regional / WordPress / BDIX titles
      const wantSeries = title.kind === 'series';
      const results = await cinemeta.search(title.name).catch(() => [] as Title[]);
      const match = results.find(
        (r) => norm(r.name) === norm(title.name) && Math.abs(r.year - title.year) <= 1 && (r.kind === 'series') === wantSeries,
      ) ?? results.find(
        (r) => norm(r.name) === norm(title.name) && (r.kind === 'series') === wantSeries,
      );

      if (match) {
        const full = match.tmdbId ? match : await cinemeta.detail(match).catch(() => match);
        const imdbId = match.imdbId ?? match.ref;
        const tmdbId = full.tmdbId ?? (await tmdbFindByImdb(imdbId ?? '', wantSeries));
        return {
          tmdbId,
          imdbId,
          confidence: 'high',
        };
      }

      // Conservative TMDB search fallback
      const fallbackTmdb = await tmdbSearch(title);
      return {
        tmdbId: fallbackTmdb,
        confidence: fallbackTmdb ? 'fallback' : undefined,
      };
    });
  })();

  inMemory.set(title.id, job);
  return job;
}
