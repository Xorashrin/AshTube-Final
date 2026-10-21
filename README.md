# MythTube

A Netflix-style streaming app for Android (React Native + Expo SDK 58). Every row, title, poster and stream is loaded **live** from public sources, so new content shows up without an app update.

## What it does

| Feature | How it works |
|---|---|
| **Home / New & Hot** | Live rows from the sources below. Cached for instant open (stale-while-revalidate); refreshes when the app returns to the foreground or on pull-to-refresh. Titles from the last 72 h get a **New** badge. |
| **Search** | Fans out to every source in parallel (12 s ceiling per source). One dead source never blocks the rest; if all fail, the last good result for that query is served. |
| **Playback** | Native player (ExoPlayer) with seek, double-tap seek, swipe volume/brightness/scrub, speed, fit modes, lock, real audio/subtitle tracks, next episode. |
| **Resume** | Position is saved per title/episode and restored on open; survives server switches. |
| **Downloads** | Resumable offline downloads. The **Download button is disabled** when no direct file source exists for a title (embed-only titles, series). |
| **Fallbacks** | See below. |
| **Live TV** | 4,400+ free-to-air channels (bundled list) with per-channel fallback URLs. |

## Sources

| Source | Used for | Notes |
|---|---|---|
| southfreak.club (WordPress REST) | Movies; metadata from post excerpts; download links | `emd_dl` buttons → TechZed → mirrors |
| southfreak.in | 18+ section (age-gated) | Same adapter |
| amaderftp.net (BDIX) | Fast direct MP4/MKV with HTTP Range | Looked up by TMDB id; public host used, private BDIX IPs ignored |
| Cinemeta (Stremio) | Trending, search, cast, real season/episode lists | Metadata only |
| AniList GraphQL | Anime trending, airing schedule, search | Metadata only |
| VidSrc / 2Embed / MultiEmbed | Last-resort web players for Cinemeta titles | Needs IMDb/TMDB id |

Adapters live in `src/services/sources/`; details in [`docs/BACKEND.md`](docs/BACKEND.md).

## Fallback chain

```
provider        own source → same movie on other sources (matched by TMDB id, or name + year) → web embeds
  └ variant     preferred quality first (Settings → Default Video Quality)
      └ mirror  ranked by host + live success rate; each attempt capped at 30 s
          └ probe   Range request must return media (206 = seek + resume works)
```

Any failure falls through to the next sibling automatically. The player also skips a stream that does not become ready within 25 s. Hosts that fail four times in a row are paused for three minutes (circuit breaker), and requests are capped per host so WordPress is not hammered.

## Build

Nothing builds locally. Push to `main` and GitHub Actions does everything:

1. **Actions → Android APK** (runs on every push, or **Run workflow**).
2. Download the **MythTube-apk** artifact, or the APK attached to the latest **Release**.

The workflow runs `npm install`, `expo install --fix`, `tsc --noEmit`, `expo prebuild`, then Gradle `assembleRelease` for arm64-v8a with R8 minification and resource shrinking. The APK is signed with the Expo template keystore, which is stable, so new builds install over old ones.

## Project layout

```
App.tsx                      fonts, splash, providers
src/data/types.ts            Title / Episode / Profile types
src/data/channels.*          bundled live-TV channel list
src/services/http.ts         fetch wrapper: timeouts, retry+jitter, circuit breaker, per-host limits, Range probe
src/services/cache.ts        memory + AsyncStorage cache
src/services/sources/        wordpress, amaderftp, cinemeta, anilist adapters
src/services/resolvers.ts    mirror pages → verified media URL
src/services/playback.ts     fallback chain, server list
src/services/downloads.ts    resumable downloads
src/services/catalog.ts      feeds, search, title registry, hooks
src/state/AppState.tsx       profile data, progress, downloads (persisted)
src/screens, src/components  UI
tools/                       build_channels.py (live-TV list), make_icons.py
```

## Notes

- Which files exist on each host changes constantly; the app never ships a fixed catalog.
- Stream links from file hosts expire, so they are resolved on demand and cached for four minutes only.
- Premium or captcha lockers (1fichier, Rapidgator, …) are skipped.
- Sign-in uses Firebase Authentication through its REST API (`src/services/firebase.ts`), which keeps the Firebase SDK out of the bundle.
