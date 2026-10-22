// Centralized Content Classification and Isolation Layer.
// Guarantees strict separation between Home (General Movies & Series), Anime, K-Drama, and Live TV.
import type { Title } from '../data/types';

export type ContentClassification = 'anime' | 'kdrama' | 'general-movie' | 'general-series' | 'livetv' | 'unclassified';

/** Detects if a title is an Anime entry (movies, TV anime, OVAs, ONAs, specials). */
export function isAnime(item: Partial<Title> | null | undefined): boolean {
  if (!item) return false;
  if (item.source === 'anilist') return true;
  if (item.quality?.some((q) => /anime/i.test(q))) return true;
  if (item.genres?.some((g) => /anime/i.test(g))) return true;
  return false;
}

/** Detects if a title is a Korean Drama (K-Drama series or web drama). */
export function isKDrama(item: Partial<Title> | null | undefined): boolean {
  if (!item) return false;
  // Anime must never be classified as K-Drama
  if (isAnime(item)) return false;

  const lang = (item.language ?? '').toLowerCase();
  const isKoreanLang = lang === 'korean' || lang === 'ko';

  const genres = item.genres ?? [];
  const hasKDramaGenre = genres.some((g) => /k[- ]?drama|korean drama/i.test(g));
  const hasKoreanTag = genres.some((g) => /korean/i.test(g));

  // Southfreak Korean category id is 4006 or ref contains 'korean'
  const isWpKorean = (item.genres?.includes('Korean') || item.quality?.includes('Korean')) && item.kind === 'series';

  // Explicit K-Drama ID prefix or language match on series
  if (item.id?.startsWith('kd:')) return true;
  if (hasKDramaGenre) return true;
  if (item.kind === 'series' && (isKoreanLang || (hasKoreanTag && isWpKorean))) return true;

  // Name or synopsis heuristic for titles with Korean Series explicitly labeled
  if (item.kind === 'series' && /\b(k-drama|korean drama|kdrama)\b/i.test(item.name ?? '')) return true;

  return false;
}

/** Detects if an entity represents a Live TV channel. */
export function isLiveTV(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return (
    'channelId' in obj ||
    ('category' in obj && ('streamUrl' in obj || 'url' in obj)) ||
    ('id' in obj && typeof obj.id === 'string' && (obj.id.startsWith('ch-') || obj.id.includes('.bd') || obj.id.includes('.in')))
  );
}

/** Detects if a title is a General (non-anime, non-adult) Movie. */
export function isGeneralMovie(item: Partial<Title> | null | undefined): boolean {
  if (!item) return false;
  if (item.nsfw) return false;
  if (isAnime(item) || isLiveTV(item)) return false;
  return item.kind === 'movie';
}

/** Detects if a title is a General (non-anime, non-kdrama, non-adult) TV Series. */
export function isGeneralSeries(item: Partial<Title> | null | undefined): boolean {
  if (!item) return false;
  if (item.nsfw) return false;
  if (isAnime(item) || isKDrama(item) || isLiveTV(item)) return false;
  return item.kind === 'series';
}

/**
 * Strict Home Feed filter:
 * Only General Movies and General TV Series are permitted.
 * Strictly rejects: Anime, K-Drama, Live TV, and NSFW content.
 */
export function filterForHome(items: Title[]): Title[] {
  return items.filter((item) => {
    if (!item || item.nsfw) return false;
    if (isLiveTV(item)) return false;
    if (isAnime(item)) return false;
    if (isKDrama(item)) return false;
    return item.kind === 'movie' || item.kind === 'series';
  });
}

/**
 * Strict Anime Feed filter:
 * Only Anime content is permitted.
 * Strictly rejects: General Movies, General Series, K-Dramas, and Live TV.
 */
export function filterForAnime(items: Title[]): Title[] {
  return items.filter((item) => {
    if (!item || item.nsfw) return false;
    if (isLiveTV(item)) return false;
    return isAnime(item);
  });
}

/**
 * Strict K-Drama Feed filter:
 * Only Korean dramas are permitted.
 * Strictly rejects: Anime, General Western/South Asian series, and Live TV.
 */
export function filterForKDrama(items: Title[]): Title[] {
  return items.filter((item) => {
    if (!item || item.nsfw) return false;
    if (isLiveTV(item)) return false;
    if (isAnime(item)) return false;
    return isKDrama(item);
  });
}

/** Classifies an item into its canonical content category. */
export function classifyItem(item: Partial<Title> | null | undefined): ContentClassification {
  if (!item) return 'unclassified';
  if (isLiveTV(item)) return 'livetv';
  if (isAnime(item)) return 'anime';
  if (isKDrama(item)) return 'kdrama';
  if (isGeneralMovie(item)) return 'general-movie';
  if (isGeneralSeries(item)) return 'general-series';
  return 'unclassified';
}

export type SearchCategory = 'all' | 'movie' | 'series' | 'anime' | 'kdrama';

/** Evaluates if a title matches the selected search category filter. */
export function matchSearchCategory(t: Title, category: SearchCategory): boolean {
  if (category === 'all') return true;
  if (category === 'anime') return isAnime(t);
  if (category === 'kdrama') return isKDrama(t);
  if (category === 'movie') return isGeneralMovie(t);
  if (category === 'series') return isGeneralSeries(t);
  return true;
}
