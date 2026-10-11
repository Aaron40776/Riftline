#!/usr/bin/env python3
"""Inspect and budget-check a .glb / .gltf file. Python standard library only.

Usage:
  glb_inspect.py model.glb [more.glb ...] [--json]
      [--max-tris N] [--max-verts N] [--max-bytes N] [--max-texture PX]
      [--max-materials N] [--max-draws N] [--expect-height MIN:MAX]
      [--require normals,uvs,tangents,skin,animations]

Exit code 0 = no errors, 1 = at least one ERROR (spec problem or budget exceeded), 2 = unreadable file.
WARN lines are advisory (non-power-of-two textures, missing normals, huge scale ...).
This is a structural check, not the Khronos glTF-Validator; run that too when it is available.
"""
import argparse
import base64
import json
import math
import os
import struct
import sys

COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
MODES = {0: "POINTS", 1: "LINES", 2: "LINE_LOOP", 3: "LINE_STRIP", 4: "TRIANGLES", 5: "TRIANGLE_STRIP", 6: "TRIANGLE_FAN"}


def load(path):
    with open(path, "rb") as f:
        data = f.read()
    bin_chunk = None
    if data[:4] == b"glTF":
        version, length = struct.unpack_from("<II", data, 4)
        if version != 2:
            raise ValueError(f"glTF container version {version}, expected 2")
        off, doc = 12, None
        while off < min(length, len(data)):
            clen, ctype = struct.unpack_from("<II", data, off)
            chunk = data[off + 8 : off + 8 + clen]
            if ctype == 0x4E4F534A:
                doc = json.loads(chunk.decode("utf-8"))
            elif ctype == 0x004E4942:
                bin_chunk = chunk
            off += 8 + clen
        if doc is None:
            raise ValueError("GLB has no JSON chunk")
    else:
        doc = json.loads(data.decode("utf-8"))
    buffers = []
    for i, b in enumerate(doc.get("buffers", [])):
        uri = b.get("uri")
        if uri is None:
            buffers.append(bin_chunk or b"")
        elif uri.startswith("data:"):
            buffers.append(base64.b64decode(uri.split(",", 1)[1]))
        else:
            p = os.path.join(os.path.dirname(path), uri)
            buffers.append(open(p, "rb").read() if os.path.exists(p) else None)
    return doc, buffers, len(data)


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def node_matrix(n):
    if "matrix" in n:
        m = n["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = n.get("translation", [0, 0, 0])
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = n.get("scale", [1, 1, 1])
    r = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    return [
        [r[0][0] * sx, r[0][1] * sy, r[0][2] * sz, tx],
        [r[1][0] * sx, r[1][1] * sy, r[1][2] * sz, ty],
        [r[2][0] * sx, r[2][1] * sy, r[2][2] * sz, tz],
        [0, 0, 0, 1],
    ]


def image_size(blob):
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", blob[16:24])
    if blob[:2] == b"\xff\xd8":
        i = 2
        while i < len(blob) - 9:
            if blob[i] != 0xFF:
                i += 1
                continue
            marker = blob[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", blob[i + 5 : i + 9])
                return w, h
            i += 2 + struct.unpack(">H", blob[i + 2 : i + 4])[0]
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP" and blob[12:16] == b"VP8X":
        w = 1 + int.from_bytes(blob[24:27], "little")
        h = 1 + int.from_bytes(blob[27:30], "little")
        return w, h
    return None


def read_accessor(doc, buffers, idx):
    acc = doc["accessors"][idx]
    if "bufferView" not in acc:
        return [0] * acc["count"] * NCOMP[acc["type"]]
    bv = doc["bufferViews"][acc["bufferView"]]
    buf = buffers[bv["buffer"]]
    if buf is None:
        return None
    fmt, size = COMPONENT[acc["componentType"]]
    n = NCOMP[acc["type"]]
    stride = bv.get("byteStride") or size * n
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    out = []
    for i in range(acc["count"]):
        out.extend(struct.unpack_from("<" + fmt * n, buf, base + i * stride))
    return out


def inspect(path, args):
    errors, warns = [], []
    doc, buffers, file_bytes = load(path)
    ext_used = doc.get("extensionsUsed", [])
    ext_req = doc.get("extensionsRequired", [])
    compressed = any(e in ext_used for e in ("KHR_draco_mesh_compression", "EXT_meshopt_compression"))

    # buffer / view / accessor bounds
    for i, b in enumerate(buffers):
        if b is None:
            errors.append(f"buffer {i}: external file missing")
        elif len(b) < doc["buffers"][i].get("byteLength", 0):
            errors.append(f"buffer {i}: {len(b)} bytes < declared byteLength {doc['buffers'][i]['byteLength']}")
    for i, bv in enumerate(doc.get("bufferViews", [])):
        b = buffers[bv["buffer"]] if bv["buffer"] < len(buffers) else None
        if b is not None and bv.get("byteOffset", 0) + bv["byteLength"] > len(b):
            errors.append(f"bufferView {i} runs past end of buffer {bv['buffer']}")
    for i, acc in enumerate(doc.get("accessors", [])):
        if "bufferView" not in acc:
            continue
        bv = doc["bufferViews"][acc["bufferView"]]
        fmt, size = COMPONENT[acc["componentType"]]
        n = NCOMP[acc["type"]]
        stride = bv.get("byteStride") or size * n
        need = acc.get("byteOffset", 0) + stride * (acc["count"] - 1) + size * n
        if acc["count"] and need > bv["byteLength"]:
            errors.append(f"accessor {i} needs {need} bytes, bufferView {acc['bufferView']} has {bv['byteLength']}")

    # meshes
    tris = verts = draws = 0
    mesh_info, attrs_seen = [], set()
    for mi, mesh in enumerate(doc.get("meshes", [])):
        mt = mv = 0
        for pi, prim in enumerate(mesh.get("primitives", [])):
            draws += 1
            a = prim.get("attributes", {})
            attrs_seen.update(a.keys())
            mode = prim.get("mode", 4)
            if "POSITION" not in a:
                errors.append(f"mesh {mi}/{pi}: no POSITION")
                continue
            pacc = doc["accessors"][a["POSITION"]]
            if "min" not in pacc or "max" not in pacc:
                errors.append(f"mesh {mi}/{pi}: POSITION accessor lacks min/max (required by spec)")
            vcount = pacc["count"]
            icount = doc["accessors"][prim["indices"]]["count"] if "indices" in prim else vcount
            t = icount // 3 if mode == 4 else max(icount - 2, 0) if mode in (5, 6) else 0
            mt += t
            mv += vcount
            if mode != 4:
                warns.append(f"mesh {mi}/{pi}: primitive mode {MODES.get(mode, mode)}")
            if "NORMAL" not in a:
                warns.append(f"mesh {mi}/{pi}: no NORMAL (engine will flat/auto shade)")
            if "indices" in prim and not compressed and vcount:
                idx = read_accessor(doc, buffers, prim["indices"])
                if idx is not None and idx and max(idx) >= vcount:
                    errors.append(f"mesh {mi}/{pi}: index {max(idx)} >= vertex count {vcount}")
            for k in ("TEXCOORD_0",):
                if k not in a and "material" in prim:
                    mat = doc.get("materials", [])[prim["material"]]
                    if any(tk in json.dumps(mat) for tk in ("baseColorTexture", "normalTexture", "metallicRoughnessTexture")):
                        errors.append(f"mesh {mi}/{pi}: textured material but no TEXCOORD_0")
        tris += mt
        verts += mv
        mesh_info.append({"name": mesh.get("name", f"mesh{mi}"), "tris": mt, "verts": mv, "prims": len(mesh.get("primitives", []))})

    # instancing: count meshes referenced by several nodes
    nodes = doc.get("nodes", [])
    refs = {}
    for n in nodes:
        if "mesh" in n:
            refs[n["mesh"]] = refs.get(n["mesh"], 0) + 1
    draws_scene = sum(len(doc["meshes"][m].get("primitives", [])) * c for m, c in refs.items())
    tris_scene = sum(mesh_info[m]["tris"] * c for m, c in refs.items())

    # world-space bounds
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    scene_idx = doc.get("scene", 0)
    roots = doc.get("scenes", [{}])[scene_idx].get("nodes", []) if doc.get("scenes") else list(range(len(nodes)))

    def walk(ni, parent):
        m = mat_mul(parent, node_matrix(nodes[ni]))
        n = nodes[ni]
        if "mesh" in n:
            for prim in doc["meshes"][n["mesh"]].get("primitives", []):
                acc = doc["accessors"][prim["attributes"]["POSITION"]] if "POSITION" in prim.get("attributes", {}) else None
                if not acc or "min" not in acc:
                    continue
                for cx in (acc["min"][0], acc["max"][0]):
                    for cy in (acc["min"][1], acc["max"][1]):
                        for cz in (acc["min"][2], acc["max"][2]):
                            p = [m[r][0] * cx + m[r][1] * cy + m[r][2] * cz + m[r][3] for r in range(3)]
                            for k in range(3):
                                lo[k], hi[k] = min(lo[k], p[k]), max(hi[k], p[k])
        for c in n.get("children", []):
            walk(c, m)

    ident = [[1 if r == c else 0 for c in range(4)] for r in range(4)]
    for r in roots:
        walk(r, ident)
    size = [hi[k] - lo[k] for k in range(3)] if lo[0] != math.inf else [0, 0, 0]

    # materials / textures
    mats = []
    for i, m in enumerate(doc.get("materials", [])):
        pbr = m.get("pbrMetallicRoughness", {})
        mats.append(
            {
                "name": m.get("name", f"mat{i}"),
                "baseColor": pbr.get("baseColorFactor", [1, 1, 1, 1]),
                "metallic": pbr.get("metallicFactor", 1),
                "roughness": pbr.get("roughnessFactor", 1),
                "alphaMode": m.get("alphaMode", "OPAQUE"),
                "doubleSided": m.get("doubleSided", False),
                "textures": sorted(k for k in json.dumps(m).split('"') if k.endswith("Texture")),
            }
        )
        if "pbrMetallicRoughness" not in m and "KHR_materials_unlit" not in m.get("extensions", {}):
            warns.append(f"material {i}: no pbrMetallicRoughness block -> metallic=1 roughness=1 defaults (looks like dull metal)")
        elif pbr.get("metallicFactor", 1) == 1 and "metallicRoughnessTexture" not in pbr:
            warns.append(f"material {i} '{m.get('name', '')}': metallicFactor 1 with no texture (fully metallic: intended?)")
    images, tex_bytes = [], 0
    for i, im in enumerate(doc.get("images", [])):
        blob = None
        if "bufferView" in im:
            bv = doc["bufferViews"][im["bufferView"]]
            b = buffers[bv["buffer"]]
            blob = b[bv.get("byteOffset", 0) : bv.get("byteOffset", 0) + bv["byteLength"]] if b else None
        elif im.get("uri", "").startswith("data:"):
            blob = base64.b64decode(im["uri"].split(",", 1)[1])
        elif "uri" in im:
            p = os.path.join(os.path.dirname(path), im["uri"])
            blob = open(p, "rb").read() if os.path.exists(p) else None
            if blob is None:
                errors.append(f"image {i}: external file {im['uri']} missing")
        dims = image_size(blob) if blob else None
        nbytes = len(blob) if blob else 0
        tex_bytes += nbytes
        images.append({"name": im.get("name", f"img{i}"), "mime": im.get("mimeType", "?"), "bytes": nbytes, "size": dims})
        if dims:
            w, h = dims
            gpu = w * h * 4 * 4 // 3
            if (w & (w - 1)) or (h & (h - 1)):
                warns.append(f"image {i}: {w}x{h} not power of two (mipmaps/compression on older GPUs)")
            if args.max_texture and max(w, h) > args.max_texture:
                errors.append(f"image {i}: {w}x{h} exceeds --max-texture {args.max_texture}")
            images[-1]["gpu_bytes_rgba_mips"] = gpu

    skins = [{"name": s.get("name", f"skin{i}"), "joints": len(s.get("joints", []))} for i, s in enumerate(doc.get("skins", []))]
    anims = []
    for i, an in enumerate(doc.get("animations", [])):
        dur = 0.0
        for s in an.get("samplers", []):
            acc = doc["accessors"][s["input"]]
            if "max" in acc:
                dur = max(dur, acc["max"][0])
        paths = sorted({c["target"].get("path") for c in an.get("channels", [])})
        anims.append({"name": an.get("name", f"anim{i}"), "channels": len(an.get("channels", [])), "duration_s": round(dur, 3), "paths": paths})
    for s in skins:
        if s["joints"] > 64:
            warns.append(f"skin {s['name']}: {s['joints']} joints (mobile GPUs: keep <= ~64 per skinned mesh)")
    if skins and not ({"JOINTS_0", "WEIGHTS_0"} <= attrs_seen):
        errors.append("skins present but no mesh has JOINTS_0/WEIGHTS_0")

    for need in (args.require or "").split(","):
        need = need.strip()
        if not need:
            continue
        ok = {
            "normals": "NORMAL" in attrs_seen,
            "uvs": "TEXCOORD_0" in attrs_seen,
            "tangents": "TANGENT" in attrs_seen,
            "skin": bool(skins),
            "animations": bool(anims),
        }.get(need)
        if ok is None:
            errors.append(f"--require: unknown item '{need}'")
        elif not ok:
            errors.append(f"required '{need}' not present")

    if max(size) > 1000:
        warns.append(f"bounds {max(size):.1f} units: centimetre/millimetre export? glTF is metres")
    elif 0 < max(size) < 0.01:
        warns.append(f"bounds {max(size):.4f} units: tiny, wrong unit scale?")
    if args.expect_height:
        a, b = (float(x) for x in args.expect_height.split(":"))
        if not (a <= size[1] <= b):
            errors.append(f"height (Y) {size[1]:.3f} outside expected {a}..{b} (Y-up metres)")
    for unsupported in ext_req:
        if unsupported in ("KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"):
            warns.append(f"requires {unsupported}: loader must register the matching decoder")

    budget = [
        ("max_tris", tris_scene or tris, "triangles"),
        ("max_verts", verts, "vertices"),
        ("max_bytes", file_bytes, "file bytes"),
        ("max_materials", len(mats), "materials"),
        ("max_draws", draws_scene or draws, "draw calls (primitives x instances)"),
    ]
    for key, val, label in budget:
        lim = getattr(args, key)
        if lim is not None and val > lim:
            errors.append(f"{label} {val} > budget {lim}")

    return {
        "file": path,
        "bytes": file_bytes,
        "generator": doc.get("asset", {}).get("generator"),
        "extensionsUsed": ext_used,
        "nodes": len(nodes),
        "meshes": mesh_info,
        "triangles": tris,
        "triangles_in_scene": tris_scene,
        "vertices": verts,
        "draw_calls_estimate": draws_scene,
        "attributes": sorted(attrs_seen),
        "bounds_min": [round(v, 4) for v in lo] if lo[0] != math.inf else None,
        "bounds_size": [round(v, 4) for v in size],
        "materials": mats,
        "images": images,
        "texture_bytes": tex_bytes,
        "skins": skins,
        "animations": anims,
        "errors": errors,
        "warnings": warns,
    }


def human(r):
    print(f"== {r['file']}  ({r['bytes'] / 1024:.1f} KiB, generator: {r['generator']})")
    print(f"   tris {r['triangles']} (in scene {r['triangles_in_scene']}), verts {r['vertices']}, draws~{r['draw_calls_estimate']}, nodes {r['nodes']}")
    print(f"   size xyz {r['bounds_size']} min {r['bounds_min']}  attrs {','.join(r['attributes'])}")
    if r["extensionsUsed"]:
        print(f"   extensions {', '.join(r['extensionsUsed'])}")
    for m in r["materials"]:
        print(f"   material {m['name']}: base {[round(c, 3) for c in m['baseColor']]} metal {m['metallic']} rough {m['roughness']} {m['alphaMode']}{' 2-sided' if m['doubleSided'] else ''} {m['textures']}")
    for im in r["images"]:
        print(f"   image {im['name']}: {im['mime']} {im['size']} {im['bytes'] / 1024:.1f} KiB")
    for s in r["skins"]:
        print(f"   skin {s['name']}: {s['joints']} joints")
    for a in r["animations"]:
        print(f"   animation {a['name']}: {a['duration_s']} s, {a['channels']} channels {a['paths']}")
    for w in r["warnings"]:
        print(f"   WARN  {w}")
    for e in r["errors"]:
        print(f"   ERROR {e}")
    print(f"   result: {'FAIL' if r['errors'] else 'PASS'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--json", action="store_true")
    for k in ("max-tris", "max-verts", "max-bytes", "max-texture", "max-materials", "max-draws"):
        ap.add_argument("--" + k, type=int)
    ap.add_argument("--expect-height")
    ap.add_argument("--require")
    args = ap.parse_args()
    results, rc = [], 0
    for f in args.files:
        try:
            r = inspect(f, args)
        except Exception as e:  # unreadable / malformed
            r = {"file": f, "fatal": f"{type(e).__name__}: {e}"}
            rc = 2
        results.append(r)
        if "fatal" not in r and r["errors"]:
            rc = max(rc, 1)
    if args.json:
        print(json.dumps(results if len(results) > 1 else results[0], indent=2))
    else:
        for r in results:
            if "fatal" in r:
                print(f"== {r['file']}\n   FATAL {r['fatal']}")
            else:
                human(r)
    sys.exit(rc)


if __name__ == "__main__":
    main()
