#!/usr/bin/env python3
"""Objective image checks for textures, sprites, icons, UI and screenshots (Pillow + numpy).

  image_report.py IMAGES... [--json] [--palette 6] [--tile] [--sheet out.png] [--diff A B [--diff-out d.png] [--max-diff 0.5]]

Per image: size, mode, power-of-two, alpha use, luminance mean/contrast, saturation, dominant palette,
blank/near-uniform detection, clipped blacks/whites, and with --tile the seam error when tiled (texture
must be seamless). --sheet writes a labelled contact sheet of all inputs. --diff compares two images
(same size): RMSE, % of pixels changed by more than 8/255, and a heat-map. Exit 1 on blank images or a
--diff above --max-diff percent. These numbers support, not replace, looking at the image.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw


def load(p):
    im = Image.open(p)
    im.load()
    return im


def report(path, ncol, tile):
    im = load(path)
    rgba = np.asarray(im.convert("RGBA"), np.float32) / 255
    rgb, a = rgba[..., :3], rgba[..., 3]
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    w, h = im.size
    r = {"file": path, "size": [w, h], "mode": im.mode, "pow2": not (w & (w - 1)) and not (h & (h - 1)),
         "alpha_used": bool((a < 0.999).any()), "alpha_coverage": round(float((a > 0.01).mean()), 3),
         "lum_mean": round(float(lum.mean()), 3), "lum_std": round(float(lum.std()), 3), "sat_mean": round(float(sat.mean()), 3),
         "clipped_black_pct": round(float((lum < 0.01).mean() * 100), 2), "clipped_white_pct": round(float((lum > 0.99).mean() * 100), 2)}
    q = im.convert("RGB").resize((min(w, 256), min(h, 256))).quantize(ncol, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: ncol * 3]
    counts = sorted(q.getcolors(), reverse=True)
    r["palette"] = [{"hex": "#%02x%02x%02x" % tuple(pal[i * 3 : i * 3 + 3]), "share": round(c / (q.width * q.height), 3)} for c, i in counts]
    r["blank"] = bool(lum.std() < 0.01 and (rgba.std(axis=(0, 1)) < 0.01).all())
    flags = []
    if r["blank"]:
        flags.append("BLANK: near-uniform image (failed render? empty canvas?)")
    if r["lum_std"] < 0.05 and not r["blank"]:
        flags.append("very low contrast: values crushed, readability at risk")
    if r["clipped_white_pct"] > 5:
        flags.append(f"{r['clipped_white_pct']}% clipped whites: overexposed / bloom too strong?")
    if r["clipped_black_pct"] > 25:
        flags.append(f"{r['clipped_black_pct']}% crushed blacks: underexposed?")
    if tile:
        x = rgb
        seam_h = float(np.abs(x[:, 0] - x[:, -1]).mean())
        seam_v = float(np.abs(x[0] - x[-1]).mean())
        inner = float((np.abs(np.diff(x, axis=1)).mean() + np.abs(np.diff(x, axis=0)).mean()) / 2) + 1e-6
        r["tile_seam_ratio"] = round(max(seam_h, seam_v) / inner, 2)
        if r["tile_seam_ratio"] > 2.0:
            flags.append(f"not seamless: edge mismatch {r['tile_seam_ratio']}x typical neighbour difference")
    r["flags"] = flags
    return r


def sheet(paths, out, cell=256):
    cols = min(4, len(paths))
    rows = (len(paths) + cols - 1) // cols
    S = Image.new("RGB", (cols * cell, rows * (cell + 18)), (24, 24, 28))
    d = ImageDraw.Draw(S)
    for i, p in enumerate(paths):
        im = load(p).convert("RGBA")
        im.thumbnail((cell, cell))
        x, y = (i % cols) * cell, (i // cols) * (cell + 18)
        bg = Image.new("RGBA", im.size, (40, 40, 46, 255))
        S.paste(Image.alpha_composite(bg, im).convert("RGB"), (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        d.text((x + 4, y + cell + 3), p.split("/")[-1][:38], fill=(220, 220, 220))
    S.save(out)
    return out


def diff(a, b, out=None):
    A = np.asarray(load(a).convert("RGB"), np.float32)
    B = np.asarray(load(b).convert("RGB"), np.float32)
    if A.shape != B.shape:
        return {"error": f"size mismatch {A.shape} vs {B.shape}"}
    D = np.abs(A - B).max(-1)
    res = {"a": a, "b": b, "rmse": round(float(np.sqrt(((A - B) ** 2).mean())), 3), "changed_pct": round(float((D > 8).mean() * 100), 3)}
    if out:
        heat = np.clip(D * 4, 0, 255).astype(np.uint8)
        Image.fromarray(np.stack([heat, heat // 3, 255 - heat], -1)).save(out)
        res["heatmap"] = out
    return res


def main():
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    rc = 0
    out = []
    if "--diff" in a:
        i = a.index("--diff")
        res = diff(a[i + 1], a[i + 2], opt("--diff-out"))
        if "error" in res or res["changed_pct"] > float(opt("--max-diff", 0.5)):
            rc = 1
        out.append(res)
        used = {a[i + 1], a[i + 2]}
    else:
        used = set()
    vals = {opt(k) for k in ("--palette", "--sheet", "--diff-out", "--max-diff")}
    files = [f for f in a if not f.startswith("--") and f not in vals and f not in used]
    for f in files:
        r = report(f, int(opt("--palette", 6)), "--tile" in a)
        rc = max(rc, 1 if r["blank"] else 0)
        out.append(r)
    if opt("--sheet") and files:
        out.append({"sheet": sheet(files, opt("--sheet"))})
    if "--json" in a:
        print(json.dumps(out, indent=2))
    else:
        for r in out:
            if "sheet" in r:
                print("contact sheet:", r["sheet"])
            elif "rmse" in r or "error" in r:
                print("diff:", r)
            else:
                print(f"== {r['file']} {r['size'][0]}x{r['size'][1]} {r['mode']}{' pow2' if r['pow2'] else ''}{' alpha' if r['alpha_used'] else ''}"
                      f"  lum {r['lum_mean']}+-{r['lum_std']} sat {r['sat_mean']}  palette {' '.join(p['hex'] + ':' + str(p['share']) for p in r['palette'])}"
                      + (f"  tile-seam {r['tile_seam_ratio']}" if "tile_seam_ratio" in r else ""))
                for fl in r["flags"]:
                    print("   FLAG", fl)
    sys.exit(rc)


if __name__ == "__main__":
    main()
