# MythTube — Phase 5 Build (Multi-Source Full-Movie Backend)

Streaming app (Expo / React Native) with **Firebase auth** + **real
multi-source full-movie backend** (2embed.cc + multiembed.mov + vidsrc.to
+ YouTube trailers) for 369 Cinemeta VOD titles + **200 real adult VOD
titles** scraped from public xvideos listings + **4,452 live IPTV channels**
parsed from iptv-org.

## What's actually real now

### VOD (individual movies / series / anime / cartoons)

Each Cinemeta title now carries a **multi-source `streams[]` array** —
PlayerScreen rotates through them in fallback order:

| Source | URL pattern | Reachable from server | Plays on device |
|---|---|---|---|
| 2embed.cc | `https://www.2embed.cc/embed/{tmdb_id}` (movies) / `embedtv/{tmdb_id}&s=1&e=1` (series) | ✅ | ✅ WebView |
| multiembed.mov | `https://multiembed.mov/?video_id={tmdb_id}&tmdb=1` | ✅ (302) | ✅ WebView |
| vidsrc.to | `https://vidsrc.to/embed/movie/{imdb_id}` / `embed/tv/{imdb_id}/1/1` | ✅ (fixed 2026-10-21 — the old `/v2/` path 404s and is no longer used) | ✅ WebView |
| vidsrc.pm / vidsrc.sh | `https://vidsrc.pm/embed/movie/{imdb_id}` / `https://vidsrc.sh/embed/movie?imdb={imdb_id}` | ✅ | ✅ WebView |
| videasy | `https://player.videasy.to/movie/{tmdb_or_imdb_id}` | ✅ | ✅ WebView |
| trailer (fallback) | `https://www.youtube.com/embed/{ytId}` | ✅ | ✅ WebView |

`src/services/providers/nuvioProviders.ts` builds the first 6 rows of every
title's server list (vidsrc.to → vidsrc.pm → vidsrc.sh → 2embed → multiembed →
videasy, all IMDb-id based); the per-title `streams[]` baked into `vod.ts` by
`tools/build_vod_backend.py` (TMDB-id based 2embed/multiembed/vidsrc) are
appended after as extra fallbacks. All of the above were re-verified live
(HTTP 200, real player HTML) on 2026-10-21.

PlayerScreen detects the source kind:
- HLS / mp4 → `expo-video` `VideoView` (native player)
- embed URL → `react-native-webview` `WebView` (iframe-style player)

If a source errors out, it auto-rotates to the next in the list. If all
fail, an error toast is shown.

### Adult content (VOD + Live) — richer section (2026-10-21)

200 real adult videos scraped from public xvideos listing pages using
15 search terms (Bangladeshi, Indian, desi, hindi, bhabhi, aunty,
tamil, mallu, bengali, pakistani, south+indian, amateur, hardcore,
teen, asian, college). Each entry has:
- real title (from the listing page)
- real thumbnail (`data-src` from CDN)
- real embed URL `https://www.xvideos.com/embedframe/{id}` (WebView-playable)

`AdultContentScreen` now mirrors the Home screen's Netflix-style layout
instead of one flat grid: **Live Category Feeds**, **Premium Live Channels**,
**Trending Adult VOD**, then keyword-derived rows (**Desi & Indian**,
**Bangladeshi**, **Hardcore**, **Teen & College**, **Amateur & Homemade**),
with the full 200-title grid still underneath for exhaustive browsing.

Live adult channels grew from 2 → **21**, re-probed live on 2026-10-21:
- 13 category feeds from `cdn.adultiptv.net` (MILF, Hardcore, Anal, Lesbian,
  Asian, Big Tits, Big Ass, POV, Interracial, Latina, Blowjob, Fetish,
  Pornstar) — real HLS, confirmed `#EXTM3U` content.
- 6 named premium channels (Brazzers, Desire, Dorcel, Erox HD, Eroxxx,
  Extasy) pulled from public GitHub adult `.m3u` lists and re-probed.
- The original 2 (Music Box Sexy, Stingray Pop Adult) are unchanged.
- `livecams.m3u8` and most of the xprime.one / ukminlt.fun candidates were
  dropped — they returned non-200 / dead on probe, so they were not added
  (same "only ship what currently responds" rule as `build_channels.py`).

### Live IPTV

4,471 channels from iptv-org + the adult augmentation above, scraped +
HTTP-probed + deduplicated. Adult category now preserved (was previously
filtered out).

## Total real content

| Surface | Count | Playback |
|---|---|---|
| Movies (Cinemeta) | 49 | WebView embed (multi-source) |
| Series (Cinemeta) | 50 | WebView embed |
| Cartoons (Cinemeta Animation) | 93 | WebView embed |
| Kids (Cinemeta Family) | 61 | WebView embed |
| Sci-Fi (Cinemeta) | 60 | WebView embed |
| Documentary (Cinemeta) | 30 | WebView embed |
| Anime (Cinemeta search=anime) | 26 | WebView embed |
| Adult VOD (xvideos scrape) | 200 | WebView embed |
| Adult IPTV (category + premium + legacy) | 21 | Live HLS |
| Live IPTV (all categories) | 4,471 | Live HLS |
| **TOTAL** | **~5,042** | |

## File layout (Phase 5 additions / changes)

```
src/data/vod.ts                  # regenerated — now includes tmdb_id + streams[]
src/data/adult_vod.ts            # NEW — 200 xvideos VOD titles
src/data/channels.ts             # + adultVodTitles() helper
src/data/resolveTitle.ts        # bridges Adult VOD titles into Title shape
src/screens/PlayerScreen.tsx     # + WebView for embed URLs + source rotation
src/screens/AdultContentScreen.tsx # + Adult VOD grid (above live IPTV)
package.json                     # + react-native-webview
tools/build_vod_backend.py       # updated — captures TMDB id, builds streams[]
tools/build_adult_vod.py         # NEW — xvideos listing scraper
```

## Regenerate any time

```bash
# 1. Live IPTV catalog (requires the original scraper)
python3 /home/z/my-project/scripts/iptv_scraper.py
python3 tools/build_channels.py \
  /home/z/my-project/download/iptv_working.m3u \
  src/data/channels.json

# 2. Cinemeta VOD catalog (movies/series/anime — multi-source)
python3 tools/build_vod_backend.py

# 3. Adult VOD catalog (xvideos scrape)
python3 tools/build_adult_vod.py
```

## Run

```bash
npm install
npm start               # Metro dev server
# or
npm run prebuild:android # → android/, then assembleRelease
```

## Honest notes

- 2026-10-21 verification pass: every provider domain in
  `nuvioProviders.ts` (vidsrc.to, vidsrc.pm, vidsrc.sh, 2embed.cc,
  multiembed.mov, videasy) was curled live and returned a real player
  page (HTTP 200, no frame-ancestors block). The one confirmed-dead
  link was the legacy `vidsrc.to/v2/...` format baked into 369 entries
  of `vod.ts` by an older run of `build_vod_backend.py` (404 — the API
  was retired) — it has been rewritten in place to the current
  `vidsrc.to/embed/...` format, and the generator script now emits the
  correct format going forward.
- multiembed.mov redirects through a one-tap "click to play" gate
  (`streamingnow.mov`) before the video starts — this is normal for
  that provider and works fine inside the WebView; it is simply not an
  instant-start source like the others.
- Adult VOD metadata is whatever the listing page exposed (title +
  thumbnail). xvideos rotates listings daily; re-run
  `tools/build_adult_vod.py` to refresh.
- Some 2embed.cc / multiembed streams may themselves fail in specific
  regions due to upstream provider availability — the multi-source
  rotation in PlayerScreen catches this and tries the next source.
- Firebase config (`src/services/firebase.ts`) is the live project
  `mythtube-asraful` — sign in / sign up with any email works.
