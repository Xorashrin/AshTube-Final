"""Minimal read-only resources.arsc parser: dumps typed resource values as JSON lines."""
import json
import struct
import sys
import zipfile


def read_pool(buf, off):
    _, hsz, size = struct.unpack_from("<HHI", buf, off)
    count, _styles, flags, sstart, _ = struct.unpack_from("<IIIII", buf, off + 8)
    utf8 = bool(flags & 0x100)
    offs = struct.unpack_from("<%dI" % count, buf, off + hsz)
    base = off + sstart
    out = []
    for o in offs:
        p = base + o
        if utf8:
            n = buf[p]; p += 2 if n & 0x80 else 1
            n = buf[p]
            if n & 0x80:
                n = ((n & 0x7F) << 8) | buf[p + 1]; p += 2
            else:
                p += 1
            out.append(buf[p:p + n].decode("utf-8", "replace"))
        else:
            n = struct.unpack_from("<H", buf, p)[0]; p += 2
            if n & 0x8000:
                n = ((n & 0x7FFF) << 16) | struct.unpack_from("<H", buf, p)[0]; p += 2
            out.append(buf[p:p + 2 * n].decode("utf-16le", "replace"))
    return out, off + size


DIM_UNITS = ["px", "dp", "sp", "pt", "in", "mm"]


def fmt_value(dtype, data, gpool):
    if dtype == 0x03:
        return gpool[data] if data < len(gpool) else None
    if dtype == 0x01:
        return "@0x%08x" % data
    if dtype == 0x02:
        return "?0x%08x" % data
    if dtype == 0x05:
        mant = (data >> 8) / (1 << [0, 7, 15, 23][(data >> 4) & 3])
        return "%g%s" % (mant if data & 0x80000000 == 0 else mant - (1 << 24) / (1 << [0, 7, 15, 23][(data >> 4) & 3]), DIM_UNITS[data & 0xF] if (data & 0xF) < 6 else "?")
    if dtype == 0x04:
        return struct.unpack("<f", struct.pack("<I", data))[0]
    if 0x1C <= dtype <= 0x1F:
        return "#%08X" % data
    if dtype == 0x12:
        return bool(data)
    if dtype in (0x10, 0x11):
        return data if data < 0x80000000 else data - (1 << 32)
    return "type%d:%d" % (dtype, data)


def config_label(buf, off):
    lang = buf[off + 8:off + 10].rstrip(b"\0").decode("latin1")
    country = buf[off + 10:off + 12].rstrip(b"\0").decode("latin1")
    density = struct.unpack_from("<H", buf, off + 14)[0]
    size = struct.unpack_from("<I", buf, off)[0]
    sdk = struct.unpack_from("<H", buf, off + 24)[0] if size >= 28 else 0
    ui = buf[off + 29] if size >= 30 else 0
    sw = struct.unpack_from("<H", buf, off + 30)[0] if size >= 32 else 0
    wdp = struct.unpack_from("<H", buf, off + 32)[0] if size >= 34 else 0
    parts = []
    if lang: parts.append(lang + ("-r" + country if country else ""))
    if sw: parts.append("sw%ddp" % sw)
    if wdp: parts.append("w%ddp" % wdp)
    if ui & 0x30 == 0x20: parts.append("night")
    if ui & 0x30 == 0x10: parts.append("notnight")
    if density: parts.append("d%d" % density)
    if sdk: parts.append("v%d" % sdk)
    return "-".join(parts) or "default"


def main(apk, out):
    buf = zipfile.ZipFile(apk).read("resources.arsc")
    _, hsz, _ = struct.unpack_from("<HHI", buf, 0)
    off = hsz
    gpool, off = read_pool(buf, off)
    w = open(out, "w")
    while off < len(buf):
        ctype, chsz, csize = struct.unpack_from("<HHI", buf, off)
        if ctype != 0x0200:
            off += csize; continue
        pkg_end = off + csize
        pid = struct.unpack_from("<I", buf, off + 8)[0]
        type_off, _, key_off = struct.unpack_from("<III", buf, off + 268)
        types, _ = read_pool(buf, off + type_off)
        keys, _ = read_pool(buf, off + key_off)
        p = off + chsz
        while p < pkg_end:
            t, thsz, tsize = struct.unpack_from("<HHI", buf, p)
            if t == 0x0201:
                tid, tflags = buf[p + 8], buf[p + 9]
                count, estart = struct.unpack_from("<II", buf, p + 12)
                cfg = config_label(buf, p + 20)
                tname = types[tid - 1]
                idx_base = p + thsz
                entries = []
                if tflags & 0x01:
                    for i in range(count):
                        ei, eo = struct.unpack_from("<HH", buf, idx_base + 4 * i)
                        entries.append((ei, eo * 4))
                elif tflags & 0x02:
                    for i in range(count):
                        eo = struct.unpack_from("<H", buf, idx_base + 2 * i)[0]
                        if eo != 0xFFFF: entries.append((i, eo * 4))
                else:
                    for i in range(count):
                        eo = struct.unpack_from("<I", buf, idx_base + 4 * i)[0]
                        if eo != 0xFFFFFFFF: entries.append((i, eo))
                for ei, eo in entries:
                    e = p + estart + eo
                    esz, eflags = struct.unpack_from("<HH", buf, e)
                    rid = "0x%02x%02x%04x" % (pid, tid, ei)
                    if eflags & 0x08:
                        key = esz; dtype = eflags >> 8; data = struct.unpack_from("<I", buf, e + 4)[0]
                        rec = {"id": rid, "type": tname, "name": keys[key], "config": cfg, "value": fmt_value(dtype, data, gpool)}
                    else:
                        key = struct.unpack_from("<I", buf, e + 4)[0]
                        rec = {"id": rid, "type": tname, "name": keys[key], "config": cfg}
                        if eflags & 0x01:
                            parent, n = struct.unpack_from("<II", buf, e + 8)
                            items = []
                            for j in range(n):
                                mname, _, _, dtype, data = struct.unpack_from("<IHBBI", buf, e + esz + 12 * j)
                                items.append(["0x%08x" % mname, fmt_value(dtype, data, gpool)])
                            rec["parent"] = "0x%08x" % parent
                            rec["items"] = items
                        else:
                            _, _, dtype, data = struct.unpack_from("<HBBI", buf, e + esz)
                            rec["value"] = fmt_value(dtype, data, gpool)
                    w.write(json.dumps(rec, ensure_ascii=False) + "\n")
            p += tsize
        off = pkg_end
    w.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
