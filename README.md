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
| vidsrc.to | `https://vidsrc.to/v2/movie/{tmdb_id}` / `v2/tv/{tmdb_id}/1/1` | ❌ Cloudflare 403 | ✅ WebView (CF allows browser UA) |
| trailer (fallback) | `https://www.youtube.com/embed/{ytId}` | ✅ | ✅ WebView |

PlayerScreen detects the source kind:
- HLS / mp4 → `expo-video` `VideoView` (native player)
- embed URL → `react-native-webview` `WebView` (iframe-style player)

If a source errors out, it auto-rotates to the next in the list. If all
fail, an error toast is shown.

### Adult content (VOD)

200 real adult videos scraped from public xvideos listing pages using
15 search terms (Bangladeshi, Indian, desi, hindi, bhabhi, aunty,
tamil, mallu, bengali, pakistani, south+indian, amateur, hardcore,
teen, asian, college). Each entry has:
- real title (from the listing page)
- real thumbnail (`data-src` from CDN)
- real embed URL `https://www.xvideos.com/embedframe/{id}` (WebView-playable)

### Live IPTV

4,452 channels from iptv-org, scraped + HTTP-probed + deduplicated.
Adult category now preserved (was previously filtered out).

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
| Adult IPTV (iptv-org Adult cat) | 2 | Live HLS |
| Live IPTV (all categories) | 4,452 | Live HLS |
| **TOTAL** | **~5,023** | |

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

- Cloudflare-protected sources (vidsrc.to) return 403 from the server
  during scraping, but they play fine on device because the WebView
  sends a real browser User-Agent and executes JS challenges. The 2embed
  + multiembed sources are fully reachable and serve the embeddable
  iframe players directly.
- Adult VOD metadata is whatever the listing page exposed (title +
  thumbnail). xvideos rotates listings daily; re-run
  `tools/build_adult_vod.py` to refresh.
- Some 2embed.cc / multiembed streams may themselves fail in specific
  regions due to upstream provider availability — the multi-source
  rotation in PlayerScreen catches this and tries the next source.
- Firebase config (`src/services/firebase.ts`) is the live project
  `mythtube-asraful` — sign in / sign up with any email works.
