# MythTube

A Netflix-style streaming app for Android (React Native + Expo SDK 58). Every row, title, poster and stream is loaded **live** from public sources, so new content shows up without an app update.

## What it does

| Feature | How it works |
|---|---|
| **Home / New & Hot** | Live rows from the sources below, cached for an instant open and refreshed on foreground / pull-to-refresh. Titles from the last 72 h get a **New** badge. |
| **Search** | Fans out to every source in parallel. Opened from a genre, Movies or TV Shows it searches only there; opened from Home it never shows live TV. Keeps your history, completes full titles while you type, and understands `bachelor point season 1 ep 10` (play that episode or open the season). Bangladeshi titles win ties. |
| **Automatic best server** | Opening a title (or the Home hero, or the top search result) starts looking for servers in the background. Playback starts on the highest-quality, seekable, fastest verified server; no picking needed. A manual override stays in the Servers panel. |
| **Playback** | ExoPlayer with seek, double-tap seek, smooth swipe brightness / volume / scrub, speed, fit modes, lock, real audio and subtitle tracks, next episode, resume. |
| **Downloads** | Pick *Automatic* or a specific server, choose the target folder (any folder or SD card via the system picker) and the number of parallel connections. The Download button is disabled when no direct file exists. |
| **Fallbacks** | Every level falls through to the next without an error screen (see below). |
| **Live TV** | 4,400+ free-to-air channels (bundled list) with per-channel fallback URLs. |

## Sources

| Source | Used for |
|---|---|
| southfreak.club / southfreak.in | Movies, metadata, links → TechZed → HubCloud / GDFlix / MultiCloud / Direct-DL / GDXShare |
| amaderftp.net | Direct MP4/MKV with HTTP Range, looked up by TMDB id |
| BDIX / FTP servers (CircleFTP API + 20 index servers) | Direct files, searched by name. Most answer only from Bangladeshi ISPs; unreachable ones fail fast and are paused by a circuit breaker |
| **Nuvio plugins** (11 repos, 229 scrapers) | Streams for movies, series and anime. Provider scripts are downloaded on demand and run in the app (Hermes) with cheerio and crypto-js |
| Stremio addons (Stremify, OnlyPorn) | Direct HTTP streams and the 18+ catalogs |
| Cinemeta | Trending, search, cast, real season/episode lists |
| AniList | Anime trending, airing schedule, search |

Web embed players (VidSrc, 2Embed, MultiEmbed, GDPlayer, GDShare) are not used: they show ads and have no native stream. Not used because they are dead or need your own server / debrid: `api.consumet.org` (451), Torrentio / Comet / MediaFusion (debrid), Jikan (timeouts), AniSpace (empty), AdultColony and Lustpress (self-host only), NodeBrid (down). Details in [`docs/BACKEND.md`](docs/BACKEND.md).

## Fallback chain

```
provider    own source → same title on other sources (TMDB id, every name spelling) → BDIX → Nuvio plugins / Stremio (widening to all plugins if nothing is found)
  └ server   verified in parallel (5 at a time), ranked: quality × 100 + seekable + origin − latency
      └ mirror   hosts ranked by live success rate, 30 s cap per attempt
          └ probe    Range request must return media (206 = seek, resume and multi-thread work)
```

Every candidate is validated before it can be picked, and again while it plays: promo clips (for example MovieBox ads, under 1 MB), files named after another title, the wrong season/episode, truncated files and streams with no valid running time are rejected, and the plugin that produced them is pushed down the order. If the stream stalls for 25 s the next server takes over at the same position.

Plugin sources only start when no seekable 1080p stream was found within five seconds, so the common case costs one or two requests. If the chosen stream fails or stalls for 25 s the next verified server takes over at the same position.

## Download engine

`modules/myth-giga` is a native Kotlin module. Its design follows NewPipe's GiGaGet engine: the file is probed, split into 1 MiB blocks, N worker threads claim blocks and write them at their offsets, finished blocks are persisted so an interrupted download resumes where it stopped, and servers without Range support use a single-stream fallback. It is an independent implementation, not a copy of NewPipe's GPL code.

## Build

Nothing builds locally. Push to `main` and GitHub Actions does everything (**Actions → Android APK**, or **Run workflow**). Download the **MythTube-apk** artifact or the APK attached to the latest **Release**.

The workflow runs `npm install`, `expo install --fix`, `tsc --noEmit`, `expo prebuild`, then Gradle `assembleRelease` for arm64-v8a with R8 full mode, resource shrinking, English-only resources and compressed JS bundle. The APK is signed with the stable Expo template keystore, so new builds install over old ones.

## Project layout

```
App.tsx                      fonts, splash, providers
modules/myth-giga/           native multi-thread download engine (Kotlin)
plugins/withSlimApk.js       config plugin: R8 full mode, English-only resources
shims/                       Node core stubs for the plugin runtime's HTML parser
src/data/types.ts            Title / Episode / Profile types
src/data/channels.*          bundled live-TV channel list
src/services/http.ts         fetch wrapper: timeouts, retry+jitter, circuit breaker, per-host limits, Range probe
src/services/cache.ts        memory + AsyncStorage cache
src/services/sources/        wordpress, amaderftp, bdix, stremio, cinemeta, anilist adapters
src/services/nuvio/          plugin repos + runtime
src/services/resolvers.ts    mirror pages → verified media URL
src/services/playback.ts     source engine: gather, verify, rank, auto-pick
src/services/downloads.ts    server choice + folder + engine call
src/services/giga.ts         JS bridge to the native engine
src/services/catalog.ts      feeds, search, title registry, hooks
src/state/AppState.tsx       profile data, progress, downloads (persisted)
src/screens, src/components  UI
tools/                       build_channels.py (live-TV list), make_icons.py
```

## Notes

- Which files exist on each host changes constantly; the app never ships a fixed catalog.
- Stream links from file hosts expire, so they are resolved on demand and cached for four minutes only.
- Premium or captcha lockers (1fichier, Rapidgator, …) are skipped.
- Nuvio provider scripts are third-party code from the repositories listed in `src/services/nuvio/repos.ts`; only those repositories are used.
- Sign-in uses Firebase Authentication through its REST API (`src/services/firebase.ts`), which keeps the Firebase SDK out of the bundle.

