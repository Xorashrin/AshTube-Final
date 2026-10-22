// AniList GraphQL: comprehensive anime metadata, rich feeds, and identity mappings.
// Requires Content-Type: application/json (form posts return 400).
import { tintFor, type Episode, type Title } from '../../data/types';
import { cached } from '../cache';
import { getJson, postJson } from '../http';

const URL = 'https://graphql.anilist.co';

interface Media {
  id: number;
  idMal?: number;
  title: { romaji?: string; english?: string; native?: string; userPreferred?: string };
  synonyms?: string[];
  countryOfOrigin?: string;
  coverImage?: { extraLarge?: string; large?: string; color?: string };
  bannerImage?: string;
  description?: string;
  genres?: string[];
  averageScore?: number;
  episodes?: number;
  duration?: number;
  status?: string;
  seasonYear?: number;
  format?: string;
  studios?: { nodes?: { name: string }[] };
  nextAiringEpisode?: { airingAt: number; episode: number } | null;
  startDate?: { year?: number };
}

const FIELDS = `id idMal title { romaji english native userPreferred } synonyms countryOfOrigin coverImage { extraLarge large color } bannerImage description(asHtml: false)
  genres averageScore episodes duration status seasonYear format studios(isMain: true) { nodes { name } }
  nextAiringEpisode { airingAt episode }`;

function toTitle(m: Media): Title {
  const name = m.title.english || m.title.romaji || m.title.userPreferred || `Anime ${m.id}`;
  const synopsis = (m.description ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const movie = m.format === 'MOVIE';
  const year = m.seasonYear ?? m.startDate?.year ?? new Date().getFullYear();
  const airing = m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt * 1000 } : undefined;

  const aliases: string[] = [];
  if (m.title.romaji && m.title.romaji !== name) aliases.push(m.title.romaji);
  if (m.title.english && m.title.english !== name) aliases.push(m.title.english);
  if (m.title.native) aliases.push(m.title.native);
  if (m.synonyms) aliases.push(...m.synonyms);

  const genres = [...(m.genres ?? [])];
  if (m.countryOfOrigin === 'CN' && !genres.includes('Donghua')) {
    genres.push('Donghua');
  }

  return {
    id: `al:${m.id}`,
    source: 'anilist',
    ref: String(m.id),
    name,
    kind: movie ? 'movie' : 'series',
    year,
    maturity: '13+',
    runtime: m.duration ?? 0,
    seasons: [],
    genres,
    synopsis,
    cast: [],
    creators: (m.studios?.nodes ?? []).map((s) => s.name),
    tint: m.coverImage?.color ?? tintFor(String(m.id)),
    quality: m.countryOfOrigin === 'CN' ? ['Anime', 'Donghua'] : ['Anime'],
    poster: m.coverImage?.extraLarge ?? m.coverImage?.large,
    background: m.bannerImage ?? m.coverImage?.extraLarge,
    imdbRating: m.averageScore ? (m.averageScore / 10).toFixed(1) : undefined,
    airing,
    badge: airing ? 'airing' : undefined,
    status: m.status,
    format: m.format,
    aliases: aliases.length ? [...new Set(aliases)] : undefined,
  };
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const res = await postJson<{ data: T }>(URL, { query, variables }, { timeout: 14000, retries: 2, signal });
  return res.data;
}

export interface AnimePageResult {
  items: Title[];
  hasNextPage: boolean;
  currentPage: number;
  total?: number;
}

export type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface BrowseOptions {
  sort: string;
  status?: 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'CANCELLED';
  format?: string[];
  genre?: string;
  season?: AnimeSeason;
  seasonYear?: number;
  countryOfOrigin?: string;
  startDate_lesser?: number;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
}

export function currentSeason(date = new Date()): { season: AnimeSeason; year: number } {
  const m = date.getMonth();
  return { season: m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL', year: date.getFullYear() };
}

export function nextSeason(date = new Date()): { season: AnimeSeason; year: number } {
  const cur = currentSeason(date);
  const order: AnimeSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  const i = order.indexOf(cur.season);
  return i === 3 ? { season: 'WINTER', year: cur.year + 1 } : { season: order[i + 1], year: cur.year };
}

/** Any AniList listing with genuine server-backed pagination via pageInfo.hasNextPage */
export async function browsePage(o: BrowseOptions): Promise<AnimePageResult> {
  const varDefs: string[] = ['$p:Int', '$n:Int', '$sort:[MediaSort]'];
  const args: string[] = ['type:ANIME', 'sort:$sort', 'isAdult:false'];
  const vars: Record<string, unknown> = {
    p: o.page ?? 1,
    n: o.perPage ?? 24,
    sort: [o.sort || 'POPULARITY_DESC'],
  };

  if (o.status) {
    varDefs.push('$status:MediaStatus');
    args.push('status:$status');
    vars.status = o.status;
  }
  if (o.format && o.format.length > 0) {
    varDefs.push('$format:[MediaFormat]');
    args.push('format_in:$format');
    vars.format = o.format;
  }
  if (o.genre) {
    varDefs.push('$genre:String');
    args.push('genre:$genre');
    vars.genre = o.genre;
  }
  if (o.season) {
    varDefs.push('$season:MediaSeason');
    args.push('season:$season');
    vars.season = o.season;
  }
  if (o.seasonYear) {
    varDefs.push('$year:Int');
    args.push('seasonYear:$year');
    vars.year = o.seasonYear;
  }
  if (o.countryOfOrigin) {
    varDefs.push('$country:CountryCode');
    args.push('countryOfOrigin:$country');
    vars.country = o.countryOfOrigin;
  }
  if (o.startDate_lesser) {
    varDefs.push('$beforeYear:FuzzyDateInt');
    args.push('startDate_lesser:$beforeYear');
    vars.beforeYear = o.startDate_lesser;
  }

  const query = `query(${varDefs.join(',')}){
    Page(page:$p, perPage:$n){
      pageInfo { hasNextPage currentPage total }
      media(${args.join(', ')}){
        ${FIELDS}
      }
    }
  }`;

  const d = await gql<{ Page: { pageInfo: { hasNextPage: boolean; currentPage: number; total?: number }; media: Media[] } }>(
    query,
    vars,
    o.signal,
  );
  return {
    items: (d.Page?.media ?? []).map(toTitle),
    hasNextPage: Boolean(d.Page?.pageInfo?.hasNextPage),
    currentPage: d.Page?.pageInfo?.currentPage ?? o.page ?? 1,
    total: d.Page?.pageInfo?.total,
  };
}

export async function browse(o: BrowseOptions): Promise<Title[]> {
  const res = await browsePage(o);
  return res.items;
}

export async function trending(page = 1, perPage = 24, signal?: AbortSignal): Promise<Title[]> {
  const res = await browsePage({ sort: 'TRENDING_DESC', page, perPage, signal });
  return res.items;
}

export async function popularAiring(perPage = 24): Promise<Title[]> {
  const res = await browsePage({ sort: 'POPULARITY_DESC', status: 'RELEASING', perPage });
  return res.items;
}

/** Episodes airing in the next `days` days, soonest first. */
export async function upcoming(days = 7, perPage = 40): Promise<Title[]> {
  const now = Math.floor(Date.now() / 1000);
  const d = await gql<{ Page: { airingSchedules: { airingAt: number; episode: number; media: Media }[] } }>(
    `query($from:Int,$to:Int,$n:Int){ Page(page:1, perPage:$n){ airingSchedules(airingAt_greater:$from, airingAt_lesser:$to, sort:TIME){ airingAt episode media { ${FIELDS} } } } }`,
    { from: now, to: now + days * 86400, n: perPage },
  );
  const seen = new Set<number>();
  const out: Title[] = [];
  for (const s of d.Page.airingSchedules) {
    if (seen.has(s.media.id)) continue;
    seen.add(s.media.id);
    out.push(toTitle({ ...s.media, nextAiringEpisode: { airingAt: s.airingAt, episode: s.episode } }));
  }
  return out;
}

export async function searchPage(query: string, page = 1, perPage = 20, signal?: AbortSignal): Promise<AnimePageResult> {
  try {
    const d = await gql<{ Page: { pageInfo: { hasNextPage: boolean; currentPage: number; total?: number }; media: Media[] } }>(
      `query($q:String,$p:Int,$n:Int){
        Page(page:$p, perPage:$n){
          pageInfo { hasNextPage currentPage total }
          media(type:ANIME, search:$q, sort:POPULARITY_DESC, isAdult:false){
            ${FIELDS}
          }
        }
      }`,
      { q: query, p: page, n: perPage },
      signal,
    );
    return {
      items: (d.Page?.media ?? []).map(toTitle),
      hasNextPage: Boolean(d.Page?.pageInfo?.hasNextPage),
      currentPage: d.Page?.pageInfo?.currentPage ?? page,
      total: d.Page?.pageInfo?.total,
    };
  } catch {
    return { items: [], hasNextPage: false, currentPage: page };
  }
}

export async function search(query: string, signal?: AbortSignal): Promise<Title[]> {
  const res = await searchPage(query, 1, 15, signal);
  return res.items;
}

interface ZipMappings {
  anilist_id?: number;
  mal_id?: number;
  anidb_id?: number;
  kitsu_id?: number;
  thetvdb_id?: number;
  themoviedb_id?: number;
  imdb_id?: string;
  thetvdb_season?: number;
}

interface ArmIds {
  themoviedb?: number | null;
  'themoviedb-season'?: number | null;
  imdb?: string | null;
  myanimelist?: number | null;
  media?: string | null;
}

/** AniList entry → TMDB/IMDb ids and the TMDB season it corresponds to (needed by stream plugins). */
export async function mapIds(title: Title): Promise<{
  tmdbId?: number;
  imdbId?: string;
  season?: number;
  malId?: number;
  tvdbId?: number;
}> {
  const anilistId = title.ref;
  const cacheKey = `anime:map-ids:${anilistId}`;
  return cached(cacheKey, { ttl: 7 * 24 * 3600 * 1000 }, async () => {
    // 1. Try Ani.zip mapping first (rich cross-mappings + correct TVDB/TMDB seasons for sequels)
    try {
      const zip = await getJson<{ mappings?: ZipMappings }>(
        `https://api.ani.zip/mappings?anilist_id=${anilistId}`,
        { timeout: 8000, retries: 1 },
      );
      const m = zip?.mappings;
      if (m && (m.themoviedb_id || m.imdb_id)) {
        return {
          tmdbId: m.themoviedb_id ? Number(m.themoviedb_id) : undefined,
          imdbId: m.imdb_id,
          season: m.thetvdb_season ? Number(m.thetvdb_season) : undefined,
          malId: m.mal_id ? Number(m.mal_id) : undefined,
          tvdbId: m.thetvdb_id ? Number(m.thetvdb_id) : undefined,
        };
      }
    } catch {}

    // 2. Fall back to ARM Haglund mapping
    try {
      const arm = await getJson<ArmIds>(
        `https://arm.haglund.dev/api/v2/ids?source=anilist&id=${anilistId}`,
        { timeout: 8000, retries: 1 },
      );
      if (arm && (arm.themoviedb || arm.imdb)) {
        return {
          tmdbId: arm.themoviedb ? Number(arm.themoviedb) : undefined,
          imdbId: arm.imdb ?? undefined,
          season: arm['themoviedb-season'] ? Number(arm['themoviedb-season']) : undefined,
          malId: arm.myanimelist ? Number(arm.myanimelist) : undefined,
        };
      }
    } catch {}

    return {};
  });
}

interface ZipEpisode {
  episode?: string;
  title?: { en?: string; 'x-jat'?: string };
  image?: string;
  overview?: string;
  runtime?: number;
  airdate?: string;
}

export async function detailAnimeById(id: number): Promise<Title> {
  const d = await gql<{ Media: Media }>(`query($id:Int){ Media(id:$id){ ${FIELDS} } }`, { id });
  if (!d?.Media) throw new Error(`AniList anime ${id} not found`);
  const base = toTitle(d.Media);
  return detail(base);
}

export async function detail(title: Title): Promise<Title> {
  const anilistId = Number(title.ref);
  const [d, zip, ids] = await Promise.all([
    gql<{ Media: Media }>(`query($id:Int){ Media(id:$id){ ${FIELDS} } }`, { id: anilistId }).catch(() => null),
    getJson<{ mappings?: ZipMappings; episodes?: Record<string, ZipEpisode> }>(
      `https://api.ani.zip/mappings?anilist_id=${title.ref}`,
      { timeout: 9000, retries: 1 },
    ).catch(() => ({ mappings: undefined, episodes: {} as Record<string, ZipEpisode> })),
    mapIds(title),
  ]);
  const fresh = d?.Media ? toTitle(d.Media) : title;
  const zipEpisodes = zip.episodes ?? {};
  const numbered = Object.keys(zipEpisodes).filter((k) => /^\d+$/.test(k)).map(Number);
  const aired = d?.Media?.nextAiringEpisode ? d.Media.nextAiringEpisode.episode - 1 : (d?.Media?.episodes ?? (numbered.length ? Math.max(...numbered) : 0));
  const count = fresh.kind === 'movie' ? 0 : Math.max(0, aired);
  const episodes: Episode[] = Array.from({ length: count }, (_, i) => {
    const z = zipEpisodes[String(i + 1)];
    return {
      id: `al:${title.ref}:1:${i + 1}`,
      season: 1,
      number: i + 1,
      name: z?.title?.en || z?.title?.['x-jat'] || `Episode ${i + 1}`,
      runtime: z?.runtime ?? fresh.runtime,
      synopsis: (z?.overview ?? '').replace(/<[^>]+>/g, ''),
      still: z?.image ?? fresh.background,
      airDate: z?.airdate,
    };
  });

  const tmdbId = ids.tmdbId ?? (zip?.mappings?.themoviedb_id ? Number(zip.mappings.themoviedb_id) : undefined);
  const tmdbSeason = ids.season ?? (zip?.mappings?.thetvdb_season ? Number(zip.mappings.thetvdb_season) : undefined);
  const imdbId = ids.imdbId ?? zip?.mappings?.imdb_id;

  return {
    ...title,
    ...fresh,
    tmdbId,
    tmdbSeason,
    imdbId,
    seasons: episodes.length ? [{ number: 1, episodes }] : [],
    detailed: true,
  };
}
