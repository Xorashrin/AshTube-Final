"""Build src/data/channels.json from an iptv-org based m3u playlist.

- drops adult content, geo-blocked / not-24/7 entries and non-HTTP(S) streams
- de-duplicates channels (same channel from several sources) and keeps the best one
  (highest resolution, HTTPS preferred); other working sources become hidden fallbacks
- re-probes every candidate stream and logo, keeping only ones that respond now

Usage: python3 -I tools/build_channels.py <playlist.m3u> <out.json>
"""
import concurrent.futures as cf
import json
import re
import sys
import urllib.request

ATTR = re.compile(r'([a-z-]+)="([^"]*)"')
ADULT = re.compile(r"\b(adult|xxx|porn|erotic|sex|playboy|hustler|brazzers|redlight|babes|nude|18\+|hot ?club|venus|private tv|dorcel|vivid)\b", re.I)
RES = re.compile(r"\((\d{3,4})p\)")
TAGS = re.compile(r"\[(geo-blocked|not 24/7)\]", re.I)

CATEGORY_MAP = {
    "football": "Sports", "cricket": "Sports", "sports": "Sports",
    "cartoon": "Kids", "animation": "Kids", "kids": "Kids", "anime": "Kids",
    "news": "News", "music": "Music", "movies": "Movies", "series": "Series",
    "entertainment": "Entertainment", "documentary": "Documentary", "education": "Education",
    "adult": "Adult", "xxx": "Adult", "porn": "Adult", "erotic": "Adult",
    "general": "General", "undefined": "General",
}
# Keyword detection for Adult-category channels that don't carry the group label.
ADULT_KW = re.compile(r"\b(adult|xxx|porn|erotic|sex|playboy|hustler|brazzers|redlight|babes|nude|18\+|hot ?club|venus|private tv|dorcel|vivid|music box sexy|pink tv|blue hustler|extreme|babes tv|jasmin tv)\b", re.I)
UA = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) MythTube/1.0"}


def parse(path):
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    out, meta = [], None
    for line in lines:
        if line.startswith("#EXTINF"):
            attrs = dict(ATTR.findall(line))
            name = line.rsplit(",", 1)[-1].strip()
            meta = {"attrs": attrs, "name": name}
        elif meta and line.strip() and not line.startswith("#"):
            out.append({**meta, "url": line.strip()})
            meta = None
    return out


def classify(group, name=""):
    parts = [p.strip() for p in group.split("|")]
    country = parts[0] if len(parts) > 1 and parts[0] in ("Bangladesh", "India", "International") else "International"
    raw = parts[-1].split(";")[0].strip().lower()
    # Adult category is detected from group label OR from name keywords
    if raw == "adult" or (ADULT_KW.search(name or "") and raw in ("general", "undefined", "")):
        return country, "Adult"
    return country, CATEGORY_MAP.get(raw, "General")


def clean_name(name):
    n = TAGS.sub("", name)
    n = RES.sub("", n)
    return re.sub(r"\s+", " ", n).strip()


def channel_key(entry):
    tvg = entry["attrs"].get("tvg-id", "")
    if tvg:
        return tvg.split("@")[0].lower()
    base = re.sub(r"\b(hd|sd|fhd|uhd|4k)\b", "", clean_name(entry["name"]).lower())
    return re.sub(r"[^a-z0-9]", "", base)


def score(entry):
    m = RES.search(entry["name"])
    res = int(m.group(1)) if m else 480
    return (res, entry["url"].startswith("https"), " HD" in entry["name"])


def probe_stream(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=8) as r:
            if r.status != 200:
                return False
            head = r.read(2048)
            ctype = r.headers.get("Content-Type", "")
            return b"#EXTM3U" in head or "mpegurl" in ctype.lower() or "dash" in ctype.lower() or b"<MPD" in head
    except Exception:
        return False


def probe_logo(url):
    if not url.startswith("http"):
        return False
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=6) as r:
            return r.status == 200 and r.headers.get("Content-Type", "").startswith("image")
    except Exception:
        return False


def quality_rank(c):
    return (int(c["quality"][:-1]) if c["quality"] else 480, c["url"].startswith("https"), bool(c["logo"]))


def merge_by_name(channels):
    """The same channel can arrive under different ids; keep one entry per display name."""
    best = {}
    for c in channels:
        key = re.sub(r"[^a-z0-9]", "", c["name"].lower()) or c["id"]
        cur = best.get(key)
        if cur is None:
            best[key] = c
            continue
        keep, other = (c, cur) if quality_rank(c) > quality_rank(cur) else (cur, c)
        extra = [u for u in [other["url"], *other["fallbacks"]] if u != keep["url"] and u not in keep["fallbacks"]]
        keep["fallbacks"] = (keep["fallbacks"] + extra)[:3]
        keep["logo"] = keep["logo"] or other["logo"]
        best[key] = keep
    return sorted(best.values(), key=lambda c: (c["country"] != "Bangladesh", c["country"] != "India", c["name"].lower()))


def main(src, dst):
    entries = parse(src)
    kept = []
    for e in entries:
        group = e["attrs"].get("group-title", "")
        # Requirement: include Adult content category, so don't filter adult out anymore.
        if TAGS.search(e["name"]) or not e["url"].startswith(("http://", "https://")):
            continue
        kept.append(e)

    groups = {}
    for e in kept:
        groups.setdefault(channel_key(e), []).append(e)
    print(f"parsed={len(entries)} after-filter={len(kept)} unique-channels={len(groups)}", flush=True)

    candidates = [sorted(v, key=score, reverse=True)[:4] for v in groups.values()]
    urls = sorted({e["url"] for c in candidates for e in c})
    logos = sorted({c[0]["attrs"].get("tvg-logo", "") for c in candidates} - {""})
    with cf.ThreadPoolExecutor(max_workers=24) as pool:
        stream_ok = dict(zip(urls, pool.map(probe_stream, urls)))
        print(f"streams probed={len(urls)} ok={sum(stream_ok.values())}", flush=True)
        logo_ok = dict(zip(logos, pool.map(probe_logo, logos)))
        print(f"logos probed={len(logos)} ok={sum(logo_ok.values())}", flush=True)

    channels = []
    for cand in candidates:
        working = [e for e in cand if stream_ok.get(e["url"])]
        if not working:
            continue
        best = working[0]
        country, category = classify(best["attrs"].get("group-title", ""), best["name"])
        m = RES.search(best["name"])
        logo = best["attrs"].get("tvg-logo", "")
        if not logo_ok.get(logo):
            logo = next((e["attrs"].get("tvg-logo", "") for e in cand if logo_ok.get(e["attrs"].get("tvg-logo", ""))), "")
        channels.append({
            "id": channel_key(best),
            "name": clean_name(best["name"]),
            "logo": logo,
            "url": best["url"],
            "fallbacks": [e["url"] for e in working[1:3]],
            "country": country,
            "category": category,
            "quality": f"{m.group(1)}p" if m else "",
        })

    unique = merge_by_name(channels)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(unique, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {len(unique)} channels to {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
