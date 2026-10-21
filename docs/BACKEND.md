# Backend notes

Verified live on 2026-10-21 from a datacenter IP.

## Chain: southfreak → TechZed → mirror → bytes

1. `GET {site}/wp-json/wp/v2/posts?_fields=id,date,link,title,excerpt,content,categories` — list/search. Metadata (IMDb, genres, language, stars, storyline) is parsed from `excerpt`; the poster is the first image in `content`.
2. `GET {site}/wp-json/wp/v2/posts?slug=…&_fields=content` — contains `<a class="emd_dl_*">Download in 720p – 1.07GB</a>` buttons (HTML page is the fallback).
3. `GET https://techzed.info/view/{id}` — plain-text list of mirror URLs, no JS needed.
4. Mirror → media:

| Host | Result | Range (seek/resume) |
|---|---|---|
| hubcloud.* → gamerxyt.com/hubcloud.php | worker link | yes (206) |
| gdflix.* | r2.dev link in page | yes (206) |
| multicloudlinks.com | multidownload.lol link | yes (206) |
| direct-dl.lol | lh3.googleusercontent link | plays, ignores Range |
| gdxshare.com | server-side copy, must poll `/status` | bounded wait (25 s), then next mirror |
| 1fichier, rapidgator, ddownload, … | not supported (captcha / premium) | skipped |

## amaderftp.net

No JSON API. `movies.php?id={TMDB_ID}&type=movie` lists files (`playVideo('…')`) when the movie is hosted and nothing when it is not. Files answer `206 Partial Content`. Series pages reference unrelated files, so series are not indexed. `172.200.200.2` URLs are rewritten to the public host.

## Metadata

- Cinemeta: `catalog/{movie|series}/top.json`, `catalog/…/top/search={q}.json`, `meta/{type}/{imdb}.json` (real episodes).
- AniList: JSON POST (form posts fail with 400). Airing schedule via `airingSchedules`.

## Known-dead (do not use)

`api.consumet.org` (451), Torrentio from servers (403), `api.hubcloud.foo` (NXDOMAIN), `player.videasy.to` (502 at last check).

## Nuvio plugins

`manifest.json` has a `scrapers` array (not `providers`). Each scraper is a bundled CommonJS script that exports `getStreams(tmdbId, mediaType, season, episode)` and returns `[{ name, title, url, quality, headers }]`. The runtime (`src/services/nuvio/runtime.ts`) evaluates the script with `new Function`, a `require` that serves `cheerio-without-node-native`, `crypto-js` and `buffer`, and the global `fetch`. Scripts carry their own TMDB key. 229 of 240 listed scrapers download; the rest 404.

Providers are ranked by repo priority plus learned success rate and speed (stored on the device), at most 15 run first, five at a time, each capped at 18 s.

## Stremio addons

`GET {base}/catalog/movie/{id}.json`, `/stream/{type}/{id}.json`. Used: OnlyPorn (`baby-beamup.club`, six 18+ catalogs, HLS streams) and Stremify (stream lookup by IMDb id). Debrid-only addons are not usable without an account.

## BDIX / FTP

`src/services/sources/bdix.ts` holds the server list from doc 06. Index servers are crawled (Apache/nginx autoindex) with a time budget; CircleFTP uses its JSON API. Servers that are unreachable outside Bangladesh time out in 6 s and are paused after four failures.

## Download engine

Probe with `Range: bytes=0-0` → `206` + `Content-Range: bytes 0-0/TOTAL` means segmented download with N workers over 1 MiB blocks; `200` means single stream. A 403/404/410 after two attempts raises `E_EXPIRED` and the next verified server continues into the same file.
