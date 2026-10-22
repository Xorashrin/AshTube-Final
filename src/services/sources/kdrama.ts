// Korean Drama (K-Drama) Dedicated Source & Discovery Service.
// Fetches curated Korean drama feeds, metadata, airing schedules, seasons, and episodes.
import { tintFor, type Episode, type Title } from '../../data/types';
import { cached } from '../cache';
import { getJson } from '../http';
import { TMDB_KEY } from '../nuvio/runtime';

const TMDB_BASE = 'https://api.themoviedb.org/3';

export const KDRAMA_GENRES = [
  'Romance',
  'Thriller',
  'Crime & Action',
  'Historical (Sageuk)',
  'Fantasy',
  'Comedy',
  'Mystery',
  'Drama',
] as const;

export type KDramaGenre = (typeof KDRAMA_GENRES)[number];

const GENRE_MAP: Record<string, string> = {
  Romance: '10749',
  Thriller: '9648',
  'Crime & Action': '80,10759',
  'Historical (Sageuk)': '18',
  Fantasy: '10765',
  Comedy: '35',
  Mystery: '9648',
  Drama: '18',
};

interface TmdbTvShow {
  id: number;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  vote_average?: number;
  origin_country?: string[];
  original_language?: string;
  genre_ids?: number[];
}

interface TmdbPageResult {
  page: number;
  results: TmdbTvShow[];
  total_pages: number;
  total_results: number;
}

function toKDramaTitle(show: TmdbTvShow, isMovie = false): Title {
  const name = show.name || show.original_name || `K-Drama ${show.id}`;
  const yearStr = show.first_air_date || '';
  const year = parseInt(yearStr.slice(0, 4), 10) || new Date().getFullYear();
  const poster = show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined;
  const background = show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : poster;

  return {
    id: `kd:${show.id}`,
    source: 'cinemeta',
    ref: String(show.id),
    name,
    kind: isMovie ? 'movie' : 'series',
    year,
    maturity: '16+',
    runtime: 60,
    seasons: [],
    genres: ['K-Drama', 'Korean'],
    synopsis: (show.overview ?? '').trim(),
    cast: [],
    creators: [],
    tint: tintFor(String(show.id)),
    quality: ['HD', 'K-Drama'],
    language: 'Korean',
    poster,
    background,
    imdbRating: show.vote_average ? show.vote_average.toFixed(1) : undefined,
    tmdbId: show.id,
    detailed: false,
  };
}

export interface KDramaBrowseOptions {
  category?: string;
  genre?: string;
  page?: number;
  signal?: AbortSignal;
}

export interface KDramaPageResult {
  items: Title[];
  hasNextPage: boolean;
  currentPage: number;
  total?: number;
}

/** Fetches Korean dramas with true server-backed pagination from TMDB Korean television discovery */
export async function browseKDramaPage(o: KDramaBrowseOptions = {}): Promise<KDramaPageResult> {
  const page = o.page ?? 1;
  const cat = (o.category ?? '').toLowerCase();
  const genreId = o.genre ? GENRE_MAP[o.genre] : undefined;

  let url = `${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&with_origin_country=KR&with_original_language=ko&without_genres=16,10764,10767,10763&page=${page}`;

  if (genreId) {
    url += `&with_genres=${genreId}`;
  }

  if (cat.includes('top')) {
    url += '&sort_by=vote_average.desc&vote_count.gte=30';
  } else if (cat.includes('airing')) {
    url = `${TMDB_BASE}/tv/on_the_air?api_key=${TMDB_KEY}&page=${page}`;
  } else if (cat.includes('movie')) {
    url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&with_origin_country=KR&with_original_language=ko&without_genres=16&sort_by=popularity.desc&page=${page}`;
  } else {
    // Trending / Popular
    url += '&sort_by=popularity.desc';
  }

  const cacheKey = `kdrama:browse:${cat}:${o.genre ?? 'all'}:${page}`;
  return cached<KDramaPageResult>(cacheKey, { ttl: 2 * 3600 * 1000 }, async () => {
    try {
      const data = await getJson<TmdbPageResult>(url, { timeout: 12000, signal: o.signal, retries: 1 });
      const isMovie = cat.includes('movie');
      const filtered = (data.results ?? []).filter((r) => {
        if (cat.includes('airing')) {
          return r.origin_country?.includes('KR') || r.original_language === 'ko';
        }
        return true;
      });

      return {
        items: filtered.map((show) => toKDramaTitle(show, isMovie)),
        hasNextPage: data.page < (data.total_pages ?? 1),
        currentPage: data.page,
        total: data.total_results,
      };
    } catch {
      return { items: [], hasNextPage: false, currentPage: page };
    }
  });
}

/** Dedicated K-Drama search matching Korean title, original title, and English title */
export async function searchKDrama(query: string, signal?: AbortSignal): Promise<Title[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = `${TMDB_BASE}/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1`;
  try {
    const data = await getJson<TmdbPageResult>(url, { timeout: 9000, signal, retries: 1 });
    const koreanOnly = (data.results ?? []).filter(
      (r) => r.origin_country?.includes('KR') || r.original_language === 'ko',
    );
    return koreanOnly.map((show) => toKDramaTitle(show));
  } catch {
    return [];
  }
}

interface TmdbTvDetail {
  id: number;
  name: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  vote_average?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: {
    id: number;
    season_number: number;
    episode_count: number;
    name: string;
    poster_path?: string;
  }[];
  external_ids?: {
    imdb_id?: string;
  };
  credits?: {
    cast?: { name: string; character?: string }[];
    crew?: { name: string; job?: string }[];
  };
}

/** Fetches full detail, seasons, episodes, and IMDb ID for a K-Drama */
export async function detailKDrama(title: Title): Promise<Title> {
  const tmdbId = title.tmdbId ?? parseInt(title.ref.replace(/^kd:/, ''), 10);
  if (!tmdbId || isNaN(tmdbId)) return { ...title, detailed: true };

  const url = `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids,credits`;
  try {
    const d = await getJson<TmdbTvDetail>(url, { timeout: 10000, retries: 1 });
    const imdbId = d.external_ids?.imdb_id ?? title.imdbId;
    const cast = (d.credits?.cast ?? []).slice(0, 10).map((c) => c.name);
    const creators = (d.credits?.crew ?? [])
      .filter((c) => c.job === 'Director' || c.job === 'Writer' || c.job === 'Creator')
      .map((c) => c.name);

    const seasons = (d.seasons ?? [])
      .filter((s) => s.season_number > 0)
      .map((s) => {
        const episodes: Episode[] = Array.from({ length: s.episode_count }, (_, i) => ({
          id: `kd:${tmdbId}:${s.season_number}:${i + 1}`,
          season: s.season_number,
          number: i + 1,
          name: `Episode ${i + 1}`,
          runtime: 60,
          synopsis: '',
          still: title.background,
        }));
        return {
          number: s.season_number,
          episodes,
        };
      });

    return {
      ...title,
      tmdbId,
      imdbId,
      cast,
      creators,
      seasons,
      detailed: true,
    };
  } catch {
    return { ...title, detailed: true };
  }
}
