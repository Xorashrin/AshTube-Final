// Nuvio plugin repositories (manifest.json + provider scripts on raw.githubusercontent.com).
// Verified live on 2026-10-21. Repos that were taken down (nvmindl, realbestia1, Gowaru) are not listed.
export interface NuvioRepo {
  id: string;
  name: string;
  base: string;
  /** Lower runs first. */
  priority: number;
  /** Language tag of the repo's catalog. */
  lang: 'multi' | 'tr' | 'ar' | 'es' | 'ta' | 'bn' | 'pt';
}

const RAW = 'https://raw.githubusercontent.com';

export const NUVIO_REPOS: NuvioRepo[] = [
  { id: 'd3', name: 'All-in-One', base: `${RAW}/D3adlyRocket/All-in-One-Nuvio/refs/heads/main`, priority: 0, lang: 'multi' },
  { id: 'ph', name: 'Phisher', base: `${RAW}/phisher98/phisher-nuvio-providers/refs/heads/main`, priority: 1, lang: 'multi' },
  { id: 'yo', name: 'Yoru', base: `${RAW}/yoruix/nuvio-providers/refs/heads/main`, priority: 2, lang: 'multi' },
  { id: 'mi', name: 'Michat88', base: `${RAW}/michat88/nuvio-providers/refs/heads/main`, priority: 3, lang: 'multi' },
  { id: 'bd', name: 'BDIX streams', base: `${RAW}/ahnaf0014/bdix-nuvio-providers/main`, priority: 4, lang: 'bn' },
  { id: 'sp', name: 'Spidey (Tamil)', base: `${RAW}/Abinanthankv/NuvioRepo/refs/heads/master`, priority: 5, lang: 'ta' },
  { id: 'r7', name: 'Range7 (Arabic)', base: `${RAW}/Range7/Nuvio-Plugin/main`, priority: 6, lang: 'ar' },
  { id: 'ke', name: 'KennethJYS (Latino)', base: `${RAW}/KennethJYS/Nuvio-Providers-Latino/refs/heads/main`, priority: 7, lang: 'es' },
  { id: 'mc', name: 'MoonCrown (Turkish)', base: `${RAW}/mooncrown04/nuviotr/refs/heads/main`, priority: 8, lang: 'tr' },
  { id: 'sa', name: 'Saimuelbr (PT-BR)', base: `${RAW}/saimuelbr/saimuel-nuvio-repo/refs/heads/main`, priority: 9, lang: 'pt' },
  { id: 'ar', name: 'ArabibZ', base: `${RAW}/ArabibZ/nuvio-providers/master`, priority: 10, lang: 'ar' },
];
