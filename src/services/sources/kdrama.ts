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

interface TmdbMovieDetail {
  id: number;
  title: string;
  original_title?: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  runtime?: number;
  external_ids?: {
    imdb_id?: string;
  };
  credits?: {
    cast?: { name: string; character?: string }[];
    crew?: { name: string; job?: string }[];
  };
}

function toKDramaTitle(show: TmdbTvShow & { title?: string; original_title?: string; release_date?: string }, isMovie = false): Title {
  const name = isMovie
    ? show.title || show.original_title || show.name || `Korean Movie ${show.id}`
    : show.name || show.original_name || `K-Drama ${show.id}`;
  const yearStr = (isMovie ? show.release_date : show.first_air_date) || show.first_air_date || show.release_date || '';
  const year = parseInt(yearStr.slice(0, 4), 10) || new Date().getFullYear();
  const poster = show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined;
  const background = show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : poster;

  const aliases: string[] = [];
  if (show.original_name && show.original_name !== name) aliases.push(show.original_name);
  if (show.original_title && show.original_title !== name) aliases.push(show.original_title);
  if (show.title && show.title !== name) aliases.push(show.title);
  if (show.name && show.name !== name) aliases.push(show.name);

  return {
    id: `kd:${show.id}`,
    source: 'kdrama',
    ref: String(show.id),
    name,
    kind: isMovie ? 'movie' : 'series',
    year,
    maturity: '16+',
    runtime: isMovie ? 120 : 60,
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
    aliases: aliases.length ? [...new Set(aliases)] : undefined,
  };
}

export interface KDramaBrowseOptions {
  category?: string;
  genre?: string;
  page?: number;
  signal?: AbortSignal;
  force?: boolean;
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
  const isMovie = cat.includes('movie');
  const genreId = o.genre ? GENRE_MAP[o.genre] : undefined;

  let url = isMovie
    ? `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&with_origin_country=KR&with_original_language=ko&without_genres=16&sort_by=popularity.desc&page=${page}`
    : `${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&with_origin_country=KR&with_original_language=ko&without_genres=16,10764,10767,10763&page=${page}`;

  if (genreId && !isMovie) {
    url += `&with_genres=${genreId}`;
  }

  if (cat.includes('top')) {
    url += '&sort_by=vote_average.desc&vote_count.gte=30';
  } else if (cat.includes('airing') && !isMovie) {
    url = `${TMDB_BASE}/tv/on_the_air?api_key=${TMDB_KEY}&page=${page}`;
  } else if (!isMovie) {
    // Trending / Popular
    url += '&sort_by=popularity.desc';
  }

  const cacheKey = `kdrama:browse:${cat}:${o.genre ?? 'all'}:${page}`;
  return cached<KDramaPageResult>(cacheKey, { ttl: 2 * 3600 * 1000, force: o.force }, async () => {
    try {
      const data = await getJson<TmdbPageResult>(url, { timeout: 12000, signal: o.signal, retries: 1 });
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

  const tvUrl = `${TMDB_BASE}/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1`;
  const movieUrl = `${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1`;
  try {
    const [tvData, movieData] = await Promise.all([
      getJson<TmdbPageResult>(tvUrl, { timeout: 9000, signal, retries: 1 }).catch(() => ({ results: [] })),
      getJson<TmdbPageResult>(movieUrl, { timeout: 9000, signal, retries: 1 }).catch(() => ({ results: [] })),
    ]);

    const koreanTv = (tvData.results ?? []).filter(
      (r) => r.origin_country?.includes('KR') || r.original_language === 'ko',
    );
    const koreanMovies = (movieData.results ?? []).filter(
      (r) => r.origin_country?.includes('KR') || r.original_language === 'ko',
    );

    return [
      ...koreanTv.map((show) => toKDramaTitle(show, false)),
      ...koreanMovies.map((show) => toKDramaTitle(show, true)),
    ];
  } catch {
    return [];
  }
}

interface TmdbTvDetail {
  id: number;
  name: string;
  original_name?: string;
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

export async function detailKDramaById(tmdbId: number, isMovie = false): Promise<Title> {
  const stubTitle: Title = {
    id: `kd:${tmdbId}`,
    source: 'kdrama',
    ref: String(tmdbId),
    name: 'Loading K-Drama…',
    kind: isMovie ? 'movie' : 'series',
    year: new Date().getFullYear(),
    maturity: '16+',
    runtime: isMovie ? 120 : 60,
    seasons: [],
    genres: ['K-Drama', 'Korean'],
    synopsis: '',
    cast: [],
    creators: [],
    tint: tintFor(String(tmdbId)),
    quality: ['HD', 'K-Drama'],
    language: 'Korean',
    tmdbId,
    detailed: false,
  };
  return detailKDrama(stubTitle);
}

/** Fetches full detail, seasons, episodes, and IMDb ID for a K-Drama with automatic TV/Movie endpoint recovery */
export async function detailKDrama(title: Title): Promise<Title> {
  const tmdbId = title.tmdbId ?? parseInt(title.ref.replace(/^kd:/, ''), 10);
  if (!tmdbId || isNaN(tmdbId)) return { ...title, detailed: true };

  // If title is marked as a movie, or if TV query fails, try movie endpoint
  if (title.kind === 'movie') {
    try {
      const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids,credits`;
      const d = await getJson<TmdbMovieDetail>(url, { timeout: 10000, retries: 1 });
      const imdbId = d.external_ids?.imdb_id ?? title.imdbId;
      const cast = (d.credits?.cast ?? []).slice(0, 10).map((c) => c.name);
      const creators = (d.credits?.crew ?? [])
        .filter((c) => c.job === 'Director' || c.job === 'Writer')
        .map((c) => c.name);
      const year = d.release_date ? parseInt(d.release_date.slice(0, 4), 10) || title.year : title.year;
      return {
        ...title,
        name: d.title || title.name,
        year,
        runtime: d.runtime || title.runtime,
        synopsis: (d.overview ?? title.synopsis).trim(),
        poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : title.poster,
        background: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : title.background,
        imdbRating: d.vote_average ? d.vote_average.toFixed(1) : title.imdbRating,
        tmdbId,
        imdbId,
        cast,
        creators,
        seasons: [],
        detailed: true,
      };
    } catch {
      // Fall through to TV endpoint if movie failed
    }
  }

  // Television Series endpoint
  const tvUrl = `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids,credits`;
  try {
    const d = await getJson<TmdbTvDetail>(tvUrl, { timeout: 10000, retries: 1 });
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
      name: d.name || title.name,
      synopsis: (d.overview ?? title.synopsis).trim(),
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : title.poster,
      background: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : title.background,
      imdbRating: d.vote_average ? d.vote_average.toFixed(1) : title.imdbRating,
      tmdbId,
      imdbId,
      cast,
      creators,
      seasons,
      detailed: true,
    };
  } catch {
    // If TV endpoint failed and kind wasn't movie, try movie endpoint as fallback
    if (title.kind !== 'movie') {
      try {
        const movieUrl = `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids,credits`;
        const d = await getJson<TmdbMovieDetail>(movieUrl, { timeout: 10000, retries: 1 });
        const imdbId = d.external_ids?.imdb_id ?? title.imdbId;
        const cast = (d.credits?.cast ?? []).slice(0, 10).map((c) => c.name);
        const creators = (d.credits?.crew ?? [])
          .filter((c) => c.job === 'Director' || c.job === 'Writer')
          .map((c) => c.name);
        return {
          ...title,
          name: d.title || title.name,
          kind: 'movie',
          runtime: d.runtime || title.runtime,
          synopsis: (d.overview ?? title.synopsis).trim(),
          poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : title.poster,
          background: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : title.background,
          imdbRating: d.vote_average ? d.vote_average.toFixed(1) : title.imdbRating,
          tmdbId,
          imdbId,
          cast,
          creators,
          seasons: [],
          detailed: true,
        };
      } catch {}
    }
    return { ...title, detailed: true };
  }
}
