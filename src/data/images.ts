// Mock artwork from picsum.photos, deterministic per seed. Swap for real art later.
const base = 'https://picsum.photos/seed';

export const img = {
  poster: (seed: string) => `${base}/${seed}-p/342/513`,
  backdrop: (seed: string) => `${base}/${seed}-b/780/439`,
  hero: (seed: string) => `${base}/${seed}-h/720/1000`,
  still: (seed: string) => `${base}/${seed}/400/225`,
  square: (seed: string) => `${base}/${seed}/300/300`,
};
