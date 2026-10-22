"""Generate AshTube app icons (original "A" ribbon mark) as PNGs with no dependencies.

Usage: python3 -I tools/make_icons.py assets
"""
import os
import struct
import sys
import zlib

# Geometry on a 1024 canvas for AshTube ("A" ribbon mark).
BARS = [
    [(456, 200), (568, 200), (372, 824), (260, 824)],
]
DIAGONALS = [
    [(456, 200), (568, 200), (764, 824), (652, 824)],
    [(350, 560), (674, 560), (674, 644), (350, 644)],
]
BAR_RGB = (0xB1, 0x06, 0x0F)
DIAG_RGB = (0xE5, 0x09, 0x14)


def fill_polygon(mask, size, poly, scale, offset):
    pts = [(x * scale + offset, y * scale + offset) for x, y in poly]
    ys = [p[1] for p in pts]
    for row in range(max(0, int(min(ys))), min(size, int(max(ys)) + 1)):
        y = row + 0.5
        xs = []
        for i in range(len(pts)):
            (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
            if (y1 <= y < y2) or (y2 <= y < y1):
                xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            start, end = max(0, int(a + 0.5)), min(size, int(b + 0.5))
            if end > start:
                mask[row * size + start:row * size + end] = b"\x01" * (end - start)


def render(size, mark_fraction, bg, mono=False):
    ss = 2
    big = size * ss
    scale = big * mark_fraction / 1024.0
    offset = (big - 1024 * scale) / 2.0
    layers = []
    for polys, rgb in ((BARS, BAR_RGB), (DIAGONALS, DIAG_RGB)):
        mask = bytearray(big * big)
        for poly in polys:
            fill_polygon(mask, big, poly, scale, offset)
        layers.append((mask, (255, 255, 255) if mono else rgb))
    out = bytearray()
    for y in range(size):
        out.append(0)
        for x in range(size):
            r, g, b = bg[:3]
            a = bg[3] if len(bg) == 4 else 255
            for mask, rgb in layers:
                cov = 0
                for dy in range(ss):
                    base = (y * ss + dy) * big + x * ss
                    cov += mask[base] + mask[base + 1]
                if cov:
                    t = cov / (ss * ss)
                    r = round(r * (1 - t) + rgb[0] * t)
                    g = round(g * (1 - t) + rgb[1] * t)
                    b = round(b * (1 - t) + rgb[2] * t)
                    a = round(a * (1 - t) + 255 * t)
            out += bytes((r, g, b, a))
    return bytes(out)


def write_png(path, size, rgba):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(rgba, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main(out_dir):
    black = (0, 0, 0, 255)
    clear = (0, 0, 0, 0)
    jobs = [
        ("icon.png", 1024, 0.78, black, False),
        ("splash-icon.png", 512, 0.9, clear, False),
        ("android-icon-foreground.png", 512, 0.52, clear, False),
        ("android-icon-background.png", 512, 0.0, black, False),
        ("android-icon-monochrome.png", 432, 0.6, clear, True),
        ("favicon.png", 48, 0.85, black, False),
    ]
    for name, size, frac, bg, mono in jobs:
        write_png(os.path.join(out_dir, name), size, render(size, frac, bg, mono))
        print("wrote", name)


if __name__ == "__main__":
    main(sys.argv[1])
