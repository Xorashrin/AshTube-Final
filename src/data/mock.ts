// Mock catalog. Every title, person and synopsis here is invented for MythTube.

export type Kind = 'series' | 'movie';
export type Maturity = 'ALL' | '7+' | '13+' | '16+' | '18+';
export type Quality = 'HD' | '4K' | 'HDR' | '5.1' | 'AD' | 'CC';
export type Badge = 'new-episode' | 'new-season' | 'recently-added' | 'leaving-soon';

export interface Episode {
  id: string;
  number: number;
  name: string;
  runtime: number;
  synopsis: string;
  seed: string;
  video: string;
}

export interface Season {
  number: number;
  episodes: Episode[];
}

export interface ComingSoon {
  month: string;
  day: string;
  label: string;
}

export interface Title {
  id: string;
  name: string;
  kind: Kind;
  year: number;
  maturity: Maturity;
  runtime: number;
  seasons: Season[];
  genres: string[];
  moods: string[];
  synopsis: string;
  cast: string[];
  creators: string[];
  original: boolean;
  seed: string;
  tint: string;
  video: string;
  quality: Quality[];
  badge?: Badge;
  comingSoon?: ComingSoon;
  poster?: string;
  background?: string;
  imdbRating?: string;
  streams?: { name: string; url: string; kind: string }[];
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  kids?: boolean;
}

export interface AppNotification {
  id: string;
  titleId: string;
  kicker: string;
  text: string;
  date: string;
}

export const SAMPLE_VIDEOS = [
  'https://download.blender.org/durian/trailer/sintel_trailer-1080p.mp4',
  'https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4',
  'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4',
  'https://media.w3.org/2010/05/bunny/movie.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'https://media.w3.org/2010/05/bunny/trailer.mp4',
  'https://media.w3.org/2010/05/video/movie_300.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)];
}

function pickMany<T>(r: () => number, list: readonly T[], count: number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  }
  return out;
}

const PEOPLE = [
  'Arif Rahman', 'Nadia Karim', 'Leo Marsh', 'Ira Sen', 'Tomas Reyes', 'Maya Okafor',
  'Rafi Chowdhury', 'Elena Voss', 'Kenji Mori', 'Sara Lind', 'Omar Haddad', 'Priya Nair',
  'Jonah Pike', 'Lina Haque', 'Dev Malhotra', 'Zara Quinn', 'Hugo Brandt', 'Amara Diallo',
];

const EPISODE_NAMES = [
  'The Quiet Before', 'Salt and Ash', 'A Door in the River', 'Paper Crowns', 'What the Tide Took',
  'Nine Lanterns', 'The Long Night', 'Static', 'Old Debts', 'The Mapmaker', 'Glass Teeth',
  'Homecoming', 'The Last Ferry', 'Red Thread', 'Signal Fire', 'Low Clouds', 'Witness',
  'Smoke Season', 'The Bargain', 'Undertow',
];

const EPISODE_SYNOPSES = [
  'A routine night turns dangerous when an old enemy resurfaces with a proposal no one can refuse.',
  'Secrets spill into the open as alliances fracture and a desperate plan is set in motion.',
  'With time running out, an unlikely team forms to chase a lead across the flooded city.',
  'A betrayal changes everything, and the cost of loyalty is finally counted.',
  'Memories of a lost summer return just as a stranger arrives with answers — and threats.',
  'The stakes rise when a hidden ledger points to someone close to home.',
  'An impossible choice divides the group while the storm closes in.',
];

interface SeedTitle {
  id: string;
  name: string;
  kind: Kind;
  year: number;
  maturity: Maturity;
  genres: string[];
  moods: string[];
  synopsis: string;
  tint: string;
  original?: boolean;
  seasons?: number;
  runtime?: number;
  badge?: Badge;
  comingSoon?: ComingSoon;
}

const SEEDS: SeedTitle[] = [
  { id: 'ashen-crown', name: 'Ashen Crown', kind: 'series', year: 2025, maturity: '16+', genres: ['Fantasy', 'Drama'], moods: ['Epic', 'Dark', 'Suspenseful'], synopsis: 'When the last queen of a burned kingdom wakes with no memory, three rival houses race to claim her — or bury her for good.', tint: '#6B2A1A', original: true, seasons: 3, badge: 'new-season' },
  { id: 'kingdom-of-tides', name: 'Kingdom of Tides', kind: 'series', year: 2024, maturity: '13+', genres: ['Adventure', 'Fantasy'], moods: ['Exciting', 'Imaginative'], synopsis: 'A fisherman’s daughter discovers the sea is ruled by a drowned court — and they want her family’s debt repaid.', tint: '#103C5A', original: true, seasons: 2 },
  { id: 'ninth-oracle', name: 'The Ninth Oracle', kind: 'series', year: 2025, maturity: '16+', genres: ['Sci-Fi', 'Thriller'], moods: ['Mind-Bending', 'Ominous'], synopsis: 'Eight prophecies came true. The ninth predicts the end of the city — and a detective who refuses to believe it.', tint: '#2E1F4F', original: true, seasons: 1, badge: 'new-episode' },
  { id: 'neon-monsoon', name: 'Neon Monsoon', kind: 'series', year: 2023, maturity: '18+', genres: ['Crime', 'Thriller'], moods: ['Gritty', 'Stylish'], synopsis: 'In a rain-soaked megacity, a rideshare driver becomes the getaway car for a heist she never agreed to.', tint: '#0D4D4A', original: true, seasons: 2 },
  { id: 'hollow-pines', name: 'Hollow Pines', kind: 'series', year: 2024, maturity: '16+', genres: ['Horror', 'Mystery'], moods: ['Scary', 'Atmospheric'], synopsis: 'A summer camp reopens thirty years after a disappearance — and the forest remembers every camper.', tint: '#1E3320', original: true, seasons: 2 },
  { id: 'saltwater-saints', name: 'Saltwater Saints', kind: 'series', year: 2022, maturity: '13+', genres: ['Drama', 'Comedy'], moods: ['Heartfelt', 'Witty'], synopsis: 'Four estranged siblings return to their seaside hometown to save the family restaurant from a ruthless developer.', tint: '#5A4A1F', seasons: 3 },
  { id: 'velvet-syndicate', name: 'Velvet Syndicate', kind: 'series', year: 2025, maturity: '18+', genres: ['Crime', 'Drama'], moods: ['Slick', 'Suspenseful'], synopsis: 'A jazz club in 1960s Dhaka hides the city’s most dangerous smuggling ring behind its velvet curtains.', tint: '#4A1030', original: true, seasons: 1, badge: 'recently-added' },
  { id: 'starfall-academy', name: 'Starfall Academy', kind: 'series', year: 2024, maturity: '7+', genres: ['Anime', 'Sci-Fi'], moods: ['Exciting', 'Feel-Good'], synopsis: 'Cadets at a floating academy train to pilot living starships — but one cadet’s ship has chosen her for a reason.', tint: '#1B2F6B', original: true, seasons: 2 },
  { id: 'quiet-ward', name: 'The Quiet Ward', kind: 'series', year: 2023, maturity: '16+', genres: ['Drama', 'Mystery'], moods: ['Emotional', 'Tense'], synopsis: 'A night-shift nurse begins to suspect the patients in Ward 9 are not as unconscious as they seem.', tint: '#2A3A3F', seasons: 2 },
  { id: 'ironvale', name: 'Ironvale', kind: 'series', year: 2021, maturity: '16+', genres: ['Action', 'Drama'], moods: ['Gritty', 'Rousing'], synopsis: 'Miners in a dying company town stage an uprising when the mine’s owner sells their homes out from under them.', tint: '#3D2B1F', seasons: 3 },
  { id: 'echoes-of-rahu', name: 'Echoes of Rahu', kind: 'series', year: 2025, maturity: '13+', genres: ['Fantasy', 'Mystery'], moods: ['Mythic', 'Imaginative'], synopsis: 'During a total eclipse, a museum guard hears an ancient god asking for help — and only she can answer.', tint: '#3A1B4A', original: true, seasons: 1, badge: 'new-episode' },
  { id: 'paper-tigers', name: 'Paper Tigers', kind: 'series', year: 2022, maturity: '13+', genres: ['Comedy'], moods: ['Witty', 'Irreverent'], synopsis: 'Three washed-up martial-arts stars open a dojo for retirees. Their students are tougher than expected.', tint: '#6B4A12', seasons: 2 },

  { id: 'last-lantern', name: 'The Last Lantern', kind: 'movie', year: 2025, maturity: '13+', genres: ['Adventure', 'Fantasy'], moods: ['Heartfelt', 'Epic'], synopsis: 'On the darkest night of the year, a lamplighter’s apprentice must carry the city’s last flame across the river of ghosts.', tint: '#6B3A10', original: true, runtime: 118, badge: 'recently-added' },
  { id: 'ember-road', name: 'Ember Road', kind: 'movie', year: 2024, maturity: '16+', genres: ['Action', 'Thriller'], moods: ['Exciting', 'Explosive'], synopsis: 'A retired stunt driver gets one last job: get a witness across the desert before sunrise.', tint: '#5A1F10', original: true, runtime: 104 },
  { id: 'midnight-bazaar', name: 'Midnight Bazaar', kind: 'movie', year: 2023, maturity: '13+', genres: ['Fantasy', 'Comedy'], moods: ['Quirky', 'Feel-Good'], synopsis: 'Two friends stumble into a market that only opens at midnight, where everything is for sale — including time.', tint: '#3C1A5A', runtime: 97 },
  { id: 'glass-horizon', name: 'Glass Horizon', kind: 'movie', year: 2025, maturity: '13+', genres: ['Sci-Fi', 'Drama'], moods: ['Mind-Bending', 'Thoughtful'], synopsis: 'An astronaut returns from a six-month mission to find Earth has lived through six years without her.', tint: '#13405A', original: true, runtime: 126 },
  { id: 'wolves-sundarban', name: 'Wolves of Sundarban', kind: 'movie', year: 2024, maturity: '16+', genres: ['Thriller', 'Adventure'], moods: ['Tense', 'Atmospheric'], synopsis: 'A wildlife ranger and a poacher must work together when a storm traps them deep in the mangrove forest.', tint: '#1D3A22', original: true, runtime: 112 },
  { id: 'afterlight', name: 'Afterlight', kind: 'movie', year: 2022, maturity: '13+', genres: ['Romance', 'Drama'], moods: ['Romantic', 'Bittersweet'], synopsis: 'Two strangers keep meeting on the last train of the night — but only one of them remembers the last time.', tint: '#5A2A3A', runtime: 101 },
  { id: 'crimson-ledger', name: 'Crimson Ledger', kind: 'movie', year: 2025, maturity: '18+', genres: ['Crime', 'Thriller'], moods: ['Gritty', 'Suspenseful'], synopsis: 'An accountant for the mob discovers a single line in the books that could bring down the entire city council.', tint: '#4A0F12', original: true, runtime: 109, badge: 'leaving-soon' },
  { id: 'northbound', name: 'Northbound', kind: 'movie', year: 2021, maturity: '7+', genres: ['Kids', 'Adventure'], moods: ['Feel-Good', 'Heartwarming'], synopsis: 'A boy and his grandmother’s stubborn goat set out on a road trip to reach the northern lights.', tint: '#1F3A5A', runtime: 92 },
  { id: 'clockmakers-daughter', name: 'The Clockmaker’s Daughter', kind: 'movie', year: 2023, maturity: '13+', genres: ['Mystery', 'Drama'], moods: ['Intriguing', 'Atmospheric'], synopsis: 'Every clock in town stops at 3:17. The clockmaker’s daughter is the only one who knows why.', tint: '#4A3A1F', runtime: 115 },
  { id: 'monsoon-heist', name: 'Monsoon Heist', kind: 'movie', year: 2024, maturity: '16+', genres: ['Action', 'Comedy'], moods: ['Exciting', 'Witty'], synopsis: 'A crew of amateurs plans to rob a bank during the worst flood in a century. What could go wrong?', tint: '#0F4A4A', original: true, runtime: 107 },
  { id: 'silent-orbit', name: 'Silent Orbit', kind: 'movie', year: 2025, maturity: '13+', genres: ['Sci-Fi', 'Thriller'], moods: ['Tense', 'Mind-Bending'], synopsis: 'The crew of a space station goes silent. The only survivor insists she has been alone for years.', tint: '#101F3A', original: true, runtime: 99 },
  { id: 'kites-karnaphuli', name: 'Kites Over Karnaphuli', kind: 'movie', year: 2022, maturity: 'ALL', genres: ['Drama', 'Kids'], moods: ['Heartfelt', 'Uplifting'], synopsis: 'In a riverside town, a girl builds the biggest kite anyone has ever seen to win back her brother’s smile.', tint: '#2A4A5A', runtime: 95 },
  { id: 'seven-bells', name: 'Seven Bells', kind: 'movie', year: 2023, maturity: '16+', genres: ['Horror'], moods: ['Scary', 'Ominous'], synopsis: 'Each time the chapel bell rings, someone in the village vanishes. The seventh bell rings tonight.', tint: '#2A1A1A', runtime: 94 },
  { id: 'nightjar', name: 'Nightjar', kind: 'movie', year: 2024, maturity: '16+', genres: ['Thriller', 'Crime'], moods: ['Dark', 'Slick'], synopsis: 'A night-radio host realizes a caller is confessing to crimes that have not happened yet.', tint: '#1A1F2A', runtime: 103 },

  { id: 'final-over', name: 'Final Over', kind: 'series', year: 2025, maturity: 'ALL', genres: ['Sports', 'Documentary'], moods: ['Rousing', 'Inspiring'], synopsis: 'Cameras follow a small-town cricket club through one impossible season, from dusty nets to a national final.', tint: '#1F4A2A', original: true, seasons: 1, badge: 'new-episode' },
  { id: 'hat-trick', name: 'Hat-Trick', kind: 'movie', year: 2024, maturity: '7+', genres: ['Sports', 'Drama'], moods: ['Feel-Good', 'Rousing'], synopsis: 'A goalkeeper who never scores gets one chance to save her team — by playing up front.', tint: '#103A4A', runtime: 106 },
  { id: 'ring-of-rain', name: 'Ring of Rain', kind: 'movie', year: 2023, maturity: '13+', genres: ['Sports', 'Action'], moods: ['Gritty', 'Exciting'], synopsis: 'An aging boxer trains a street kid for the fight that could save the gym they both call home.', tint: '#3A1A10', runtime: 112 },
  { id: 'tidebreaker', name: 'Tidebreaker', kind: 'series', year: 2026, maturity: '16+', genres: ['Fantasy', 'Action'], moods: ['Epic', 'Exciting'], synopsis: 'A pirate captain who can split the sea is hunted by the empire that made her.', tint: '#0F3A5A', original: true, seasons: 1, comingSoon: { month: 'NOV', day: '07', label: 'Coming Friday' } },
  { id: 'house-of-brass', name: 'House of Brass', kind: 'series', year: 2026, maturity: '13+', genres: ['Drama', 'Mystery'], moods: ['Intriguing', 'Stylish'], synopsis: 'A family of inventors in an alternate 1900s Kolkata hides a machine that can rewrite a single day.', tint: '#5A3A10', original: true, seasons: 1, comingSoon: { month: 'NOV', day: '14', label: 'Coming November 14' } },
  { id: 'vanishing-ghat', name: 'The Vanishing Ghat', kind: 'movie', year: 2026, maturity: '16+', genres: ['Thriller', 'Mystery'], moods: ['Tense', 'Atmospheric'], synopsis: 'A river steps disappear every full moon, and with them, whoever is standing on them.', tint: '#1F2A3A', original: true, runtime: 111, comingSoon: { month: 'NOV', day: '21', label: 'Coming November 21' } },
  { id: 'orbit-seven', name: 'Orbit Seven', kind: 'movie', year: 2026, maturity: '13+', genres: ['Sci-Fi', 'Adventure'], moods: ['Exciting', 'Imaginative'], synopsis: 'Seven teenagers win a lottery to visit space. Only six are supposed to come back.', tint: '#1A1A4A', original: true, runtime: 102, comingSoon: { month: 'DEC', day: '05', label: 'Coming December 5' } },
  { id: 'moth-and-flame', name: 'Moth & Flame', kind: 'series', year: 2026, maturity: '18+', genres: ['Romance', 'Crime'], moods: ['Romantic', 'Dark'], synopsis: 'A safecracker falls for the detective assigned to catch her. Neither is who they claim to be.', tint: '#4A1A10', original: true, seasons: 1, comingSoon: { month: 'DEC', day: '12', label: 'Coming December 12' } },
];

function buildTitle(seed: SeedTitle, index: number): Title {
  const r = rng(seed.id);
  const video = SAMPLE_VIDEOS[index % SAMPLE_VIDEOS.length];
  const seasons: Season[] = [];
  if (seed.kind === 'series') {
    for (let s = 1; s <= (seed.seasons ?? 1); s++) {
      const count = 6 + Math.floor(r() * 3);
      const names = pickMany(r, EPISODE_NAMES, count);
      seasons.push({
        number: s,
        episodes: names.map((name, i) => ({
          id: `${seed.id}-s${s}e${i + 1}`,
          number: i + 1,
          name,
          runtime: 38 + Math.floor(r() * 22),
          synopsis: pick(r, EPISODE_SYNOPSES),
          seed: `${seed.id}-s${s}e${i + 1}`,
          video: SAMPLE_VIDEOS[(index + s + i) % SAMPLE_VIDEOS.length],
        })),
      });
    }
  }
  const quality: Quality[] = ['HD'];
  if (r() > 0.5) quality.push('5.1');
  if (seed.original) quality.push('AD');
  quality.push('CC');
  return {
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    year: seed.year,
    maturity: seed.maturity,
    runtime: seed.runtime ?? 0,
    seasons,
    genres: seed.genres,
    moods: seed.moods,
    synopsis: seed.synopsis,
    cast: pickMany(r, PEOPLE, 4),
    creators: pickMany(r, PEOPLE, seed.kind === 'series' ? 2 : 1),
    original: seed.original ?? false,
    seed: seed.id,
    tint: seed.tint,
    video,
    quality,
    badge: seed.badge,
    comingSoon: seed.comingSoon,
  };
}

export const TITLES: Title[] = SEEDS.map(buildTitle);
const TITLE_MAP = new Map(TITLES.map((t) => [t.id, t]));

export function getTitle(id: string): Title {
  return TITLE_MAP.get(id) ?? TITLES[0];
}

export function findEpisode(title: Title, episodeId?: string): { season: Season; episode: Episode } | null {
  for (const season of title.seasons) {
    for (const episode of season.episodes) {
      if (!episodeId || episode.id === episodeId) return { season, episode };
    }
  }
  return null;
}

export function nextEpisode(title: Title, episodeId: string): Episode | null {
  const all = title.seasons.flatMap((s) => s.episodes);
  const i = all.findIndex((e) => e.id === episodeId);
  return i >= 0 && i + 1 < all.length ? all[i + 1] : null;
}

export const AVAILABLE = TITLES.filter((t) => !t.comingSoon);
export const COMING_SOON = TITLES.filter((t) => t.comingSoon);
export const SERIES = AVAILABLE.filter((t) => t.kind === 'series');
export const MOVIES = AVAILABLE.filter((t) => t.kind === 'movie');

export const TOP10_TV = ['ninth-oracle', 'ashen-crown', 'velvet-syndicate', 'neon-monsoon', 'echoes-of-rahu', 'hollow-pines', 'kingdom-of-tides', 'quiet-ward', 'starfall-academy', 'saltwater-saints'].map(getTitle);
export const TOP10_MOVIES = ['last-lantern', 'crimson-ledger', 'glass-horizon', 'ember-road', 'wolves-sundarban', 'silent-orbit', 'monsoon-heist', 'nightjar', 'afterlight', 'seven-bells'].map(getTitle);

export function top10Rank(id: string): { rank: number; list: 'TV Shows' | 'Movies' } | null {
  const tv = TOP10_TV.findIndex((t) => t.id === id);
  if (tv >= 0) return { rank: tv + 1, list: 'TV Shows' };
  const mv = TOP10_MOVIES.findIndex((t) => t.id === id);
  return mv >= 0 ? { rank: mv + 1, list: 'Movies' } : null;
}

export const GENRES = [
  'Action', 'Adventure', 'Anime', 'Comedy', 'Crime', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Sports', 'Kids',
];

export const MAIN_PROFILE_ID = 'main';
export const PROFILE_COLOR = '#2D6CDF';

export const NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', titleId: 'tt22084616', kicker: 'New Arrival', text: 'Spider-Man: Brand New Day', date: 'Today' },
  { id: 'n2', titleId: 'tt34384900', kicker: 'Trending Now', text: 'Love of Your Life', date: 'Yesterday' },
  { id: 'n3', titleId: 'tt6262770', kicker: 'New Arrival', text: 'Tenzing', date: 'Oct 17' },
  { id: 'n4', titleId: 'tt27369017', kicker: 'Recently Added', text: 'Hope', date: 'Oct 15' },
  { id: 'n5', titleId: 'tt15047880', kicker: 'New Release', text: 'Disclosure Day', date: 'Oct 12' },
];
