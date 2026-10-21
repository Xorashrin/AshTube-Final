#!/usr/bin/env python3
"""
Scrape Stremio Cinemeta catalog (real TMDB metadata) + build multi-source
stream URLs (2embed, multiembed, vidsrc fallbacks) for full-movie playback.

For each title:
  id (imdb), tmdb_id, name, kind, year, maturity, runtime, synopsis,
  poster, background, genres[], cast[], directors[], imdbRating,
  streams[] (multiple embed URLs — PlayerScreen rotates through them)

We pull from:
  - top movies          → Movies
  - top series          → Series
  - Animation movies    → Cartoon (movies)
  - Animation series    → Cartoon (series)
  - search "anime"      → Anime
  - Family movies       → Kids (movies)
  - Family series       → Kids (series)
  - Documentary movies  → Documentary

For each title with a TMDB id, we build stream URLs:
  - https://www.2embed.cc/embed/{tmdb_id}                            (movies)
  - https://www.2embed.cc/embedtv/{tmdb_id}&s=1&e=1                  (series)
  - https://multiembed.mov/?video_id={tmdb_id}&tmdb=1                (movies)
  - https://vidsrc.to/embed/movie/{imdb_id}                          (movies, fallback)
  - https://vidsrc.to/embed/tv/{imdb_id}/{s}/{e}                     (series, fallback)
  (the legacy /v2/ vidsrc.to path is dead — HTTP 404 — and must never be used)

These are iframe-embeddable players — open in a WebView on device.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) MythTube/1.0"}

BASE = "https://v3-cinemeta.strem.io"

ENDPOINTS = [
    # url suffix                                         category  limit
    ("/catalog/movie/top.json",                          "Movies",    100),
    ("/catalog/series/top.json",                         "Series",    100),
    ("/catalog/movie/top/genre=Animation.json",          "Cartoon",    50),
    ("/catalog/series/top/genre=Animation.json",         "Cartoon",    50),
    ("/catalog/movie/top/genre=Family.json",             "Kids",       40),
    ("/catalog/series/top/genre=Family.json",            "Kids",       40),
    ("/catalog/movie/top/genre=Sci-Fi.json",             "Sci-Fi",     30),
    ("/catalog/series/top/genre=Sci-Fi.json",            "Sci-Fi",     30),
    ("/catalog/movie/top/genre=Documentary.json",        "Documentary",30),
    ("/catalog/series/top/search=anime.json",            "Anime",      20),
    ("/catalog/movie/top/search=anime.json",             "Anime",      15),
]

def http_get_json(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None

def tint_for(name):
    h = sum(ord(c) for c in name) % 12
    return ["#6B2A1A","#103C5A","#2E1F4F","#0D4D4A","#1E3320","#5A4A1F",
            "#4A1030","#1B2F6B","#3A1B4A","#1F3A5A","#13405A","#4A0F12"][h]

def maturity_for(meta, category):
    g = " ".join(meta.get("genres") or meta.get("genre") or []).lower()
    n = (meta.get("name","") or "").lower()
    if category == "Adult":
        return "18+"
    if any(k in g for k in ["horror","adult"]):
        return "16+"
    if any(k in g for k in ["crime","thriller","war","mystery"]):
        return "13+"
    if any(k in n for k in ["sex","nude","erotic"]):
        return "18+"
    if any(k in g for k in ["family","animation","kids"]):
        return "ALL"
    return "13+"

def genres_for(meta, category):
    g = meta.get("genres") or meta.get("genre") or []
    if isinstance(g, str):
        g = [g]
    if not g:
        if category == "Anime":
            return ["Anime"]
        if category == "Cartoon":
            return ["Animation", "Comedy"]
        if category == "Kids":
            return ["Family"]
        return ["Drama"]
    return g[:4]

def build_streams(meta, category):
    """Build multi-source stream URLs from TMDB id + IMDb id."""
    tmdb_id = meta.get("moviedb_id") or meta.get("tmdb_id")
    imdb_id = meta.get("imdb_id") or meta.get("id") or ""
    if not tmdb_id and not imdb_id:
        return []
    is_series = meta.get("type") == "series"
    primary = tmdb_id or imdb_id
    streams = []
    # Primary source — 2embed.cc (reachable, no API key, accepts tmdb or imdb id)
    if is_series:
        streams.append({
            "name": "2embed",
            "url": f"https://www.2embed.cc/embedtv/{primary}&s=1&e=1",
            "kind": "embed",
        })
    else:
        streams.append({
            "name": "2embed",
            "url": f"https://www.2embed.cc/embed/{primary}",
            "kind": "embed",
        })
    # Secondary — multiembed.mov (tmdb_id required for the tmdb=1 flag)
    if tmdb_id:
        streams.append({
            "name": "multiembed",
            "url": f"https://multiembed.mov/?video_id={tmdb_id}&tmdb=1" + ("&s=1&e=1" if is_series else ""),
            "kind": "embed",
        })
    # Tertiary — vidsrc.to current embed API (verified 2026-10-21; the old /v2/
    # path returns 404 and must not be used). Prefers IMDb id, falls back to TMDB id.
    vidsrc_id = imdb_id or tmdb_id
    if is_series:
        streams.append({
            "name": "vidsrc",
            "url": f"https://vidsrc.to/embed/tv/{vidsrc_id}/1/1",
            "kind": "embed",
        })
    else:
        streams.append({
            "name": "vidsrc",
            "url": f"https://vidsrc.to/embed/movie/{vidsrc_id}",
            "kind": "embed",
        })
    return streams

def build_title(meta, category):
    imdb_id = meta.get("imdb_id") or meta.get("id") or ""
    name = meta.get("name","") or "Untitled"
    kind = "series" if meta.get("type") == "series" else "movie"
    year_raw = meta.get("year") or meta.get("releaseInfo") or ""
    year = 0
    m = re.search(r"\d{4}", str(year_raw))
    if m:
        year = int(m.group(0))
    runtime = 0
    rt = meta.get("runtime") or ""
    m = re.search(r"(\d+)", str(rt))
    if m:
        runtime = int(m.group(1))
    poster = meta.get("poster") or ""
    background = meta.get("background") or meta.get("logo") or ""
    trailer_streams = meta.get("trailerStreams") or []
    trailers = meta.get("trailers") or []
    yt_id = ""
    if trailer_streams and isinstance(trailer_streams, list):
        yt_id = (trailer_streams[0] or {}).get("ytId","") if isinstance(trailer_streams[0], dict) else ""
    if not yt_id and trailers:
        yt_id = (trailers[0] or {}).get("source","") if isinstance(trailers[0], dict) else ""
    yt_url = f"https://www.youtube.com/embed/{yt_id}?autoplay=1" if yt_id else ""
    synopsis = meta.get("description") or f"{name} ({year})."
    synopsis = re.sub(r"\s+", " ", synopsis).strip()[:500]
    streams = build_streams(meta, category)
    # Always include the YouTube trailer as a fallback stream
    if yt_url:
        streams.append({"name": "trailer", "url": yt_url, "kind": "embed"})
    return {
        "id":           imdb_id,
        "tmdb_id":      meta.get("moviedb_id") or 0,
        "name":         name,
        "kind":         kind,
        "year":         year or 2024,
        "maturity":     maturity_for(meta, category),
        "runtime":      runtime or 90,
        "seasons":      [],
        "genres":       genres_for(meta, category),
        "moods":        ["Streaming","Full Movie"],
        "synopsis":     synopsis,
        "cast":         (meta.get("cast") or [])[:5],
        "creators":     (meta.get("director") or [])[:2],
        "original":     False,
        "seed":         imdb_id,
        "tint":         tint_for(name),
        "video":        streams[0]["url"] if streams else yt_url,  # primary stream
        "streams":      streams,
        "quality":      ["HD", "CC"],
        "category":     category,
        "poster":       poster,
        "background":   background,
        "imdbRating":   meta.get("imdbRating") or "",
    }

def main():
    print("[P] Cinemeta VOD scraper (multi-source) starting", flush=True)
    titles = []
    seen = set()
    for suffix, cat, limit in ENDPOINTS:
        url = BASE + suffix
        print(f"  + {cat:12s} ← {suffix}", flush=True)
        data = http_get_json(url)
        if not data:
            print(f"    ! failed: {suffix}", flush=True)
            continue
        metas = data.get("metas") or []
        count = 0
        for m in metas:
            if count >= limit: break
            if not m.get("imdb_id") and not m.get("id"): continue
            id_ = m.get("imdb_id") or m.get("id")
            if id_ in seen: continue
            seen.add(id_)
            titles.append(build_title(m, cat))
            count += 1
        time.sleep(0.2)
    print(f"  = built {len(titles)} titles", flush=True)

    out = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/workspace/MythTube-main/src/data/vod.ts"
    with open(out, "w", encoding="utf-8") as f:
        f.write("// AUTO-GENERATED by tools/build_vod_backend.py from Stremio Cinemeta public catalog.\n")
        f.write("// Real TMDB metadata. Multi-source stream URLs (2embed + multiembed + vidsrc + trailer).\n\n")
        f.write("export type VodKind = 'movie' | 'series';\n\n")
        f.write("export interface VodStream {\n  name: string;\n  url: string;\n  kind: 'embed' | 'hls';\n}\n\n")
        f.write("export interface VodTitle {\n")
        f.write("  id: string;\n  tmdb_id: number;\n  name: string;\n  kind: VodKind;\n  year: number;\n")
        f.write("  maturity: 'ALL' | '7+' | '13+' | '16+' | '18+';\n  runtime: number;\n")
        f.write("  seasons: never[];\n  genres: string[];\n  moods: string[];\n")
        f.write("  synopsis: string;\n  cast: string[];\n  creators: string[];\n")
        f.write("  original: boolean;\n  seed: string;\n  tint: string;\n")
        f.write("  video: string;            // primary stream URL\n")
        f.write("  streams: VodStream[];    // multi-source fallback list\n")
        f.write("  quality: string[];\n  category: string;\n  poster: string;\n")
        f.write("  background: string;\n  imdbRating: string;\n}\n\n")
        f.write("export const VOD_TITLES: VodTitle[] = ")
        f.write(json.dumps(titles, indent=2, ensure_ascii=False))
        f.write(";\n\n")
        f.write("export const VOD_AVAILABLE = VOD_TITLES;\n")
        f.write("export function getVodTitle(id: string): VodTitle | undefined {\n")
        f.write("  return VOD_TITLES.find((t) => t.id === id);\n}\n")
        f.write("export function vodByCategory(category: string, limit = 30): VodTitle[] {\n")
        f.write("  return VOD_TITLES.filter((t) => t.category === category).slice(0, limit);\n}\n")
        f.write("export const VOD_GENRES = Array.from(new Set(VOD_TITLES.flatMap((t) => t.genres))).sort();\n")

    from collections import Counter
    by_cat = Counter(t["category"] for t in titles)
    by_stream = sum(1 for t in titles if t.get("streams"))
    print(f"wrote {out}", flush=True)
    print(f"by category: {dict(by_cat)}", flush=True)
    print(f"with streams: {by_stream}/{len(titles)}", flush=True)

if __name__ == "__main__":
    main()
