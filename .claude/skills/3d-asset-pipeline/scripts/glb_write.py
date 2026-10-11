#!/usr/bin/env python3
"""Minimal, dependency-light glTF 2.0 binary (.glb) writer (needs numpy; Pillow only for textures).

Use it when Blender is unavailable, or for procedural props generated in code. Import it:

    sys.path.insert(0, "<skill dir>/scripts"); from glb_write import Glb, flat_shade
    g = Glb()
    mat = g.material("stone", base=(0.42, 0.40, 0.38, 1), metallic=0.0, roughness=0.85)
    g.mesh("rock", positions, indices, normals=None, uvs=None, colors=None, material=mat)  # normals computed if None
    g.node("rock", mesh="rock", translation=(0, 0, 0))
    g.save("rock.glb")

or run a built-in procedural demo:   glb_write.py demo {crystal|rock|crate} out.glb [--seed N]

Conventions: Y up, metres, counter-clockwise front faces, linear-space base colour factors
(sRGB textures are fine: glTF declares baseColorTexture as sRGB).
"""
import io
import json
import struct
import sys

import numpy as np


def vertex_normals(pos, idx):
    tri = idx.reshape(-1, 3)
    fn = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
    n = np.zeros_like(pos)
    for k in range(3):
        np.add.at(n, tri[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return (n / np.where(ln == 0, 1, ln)).astype(np.float32)


def flat_shade(pos, idx, *extra):
    """Un-share vertices so every triangle gets its own facet normal (low-poly look). Returns pos, idx, *extra."""
    tri = idx.reshape(-1)
    out = [pos[tri]] + [None if e is None else e[tri] for e in extra]
    return (out[0], np.arange(len(tri), dtype=np.uint32), *out[1:])


class Glb:
    def __init__(self, generator="glb_write.py"):
        self.doc = {"asset": {"version": "2.0", "generator": generator}, "scenes": [{"nodes": []}], "scene": 0,
                    "nodes": [], "meshes": [], "materials": [], "accessors": [], "bufferViews": [], "buffers": []}
        self.bin = bytearray()
        self._mesh_ids, self._mat_ids = {}, {}

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin += b"\0"
        view = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.bin += data
        self.doc["bufferViews"].append(view)
        return len(self.doc["bufferViews"]) - 1

    def _accessor(self, arr, kind, target, minmax=False):
        ctype = {np.float32: 5126, np.uint32: 5125, np.uint16: 5123}[arr.dtype.type]
        acc = {"bufferView": self._view(arr.tobytes(), target), "componentType": ctype, "count": len(arr), "type": kind}
        if minmax:
            acc["min"] = arr.min(axis=0).tolist()
            acc["max"] = arr.max(axis=0).tolist()
        self.doc["accessors"].append(acc)
        return len(self.doc["accessors"]) - 1

    def texture(self, png_bytes, name="tex"):
        d = self.doc
        d.setdefault("images", []).append({"name": name, "mimeType": "image/png", "bufferView": self._view(png_bytes)})
        d.setdefault("samplers", [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}])
        d.setdefault("textures", []).append({"sampler": 0, "source": len(d["images"]) - 1})
        return len(d["textures"]) - 1

    def material(self, name, base=(0.8, 0.8, 0.8, 1), metallic=0.0, roughness=0.6, emissive=(0, 0, 0),
                 base_tex=None, normal_tex=None, double_sided=False, alpha_mode="OPAQUE"):
        m = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": list(base), "metallicFactor": metallic,
             "roughnessFactor": roughness}, "doubleSided": double_sided, "alphaMode": alpha_mode}
        if any(emissive):
            m["emissiveFactor"] = list(emissive)
        if base_tex is not None:
            m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": base_tex}
        if normal_tex is not None:
            m["normalTexture"] = {"index": normal_tex}
        self.doc["materials"].append(m)
        self._mat_ids[name] = len(self.doc["materials"]) - 1
        return name

    def mesh(self, name, positions, indices, normals=None, uvs=None, colors=None, material=None):
        pos = np.asarray(positions, np.float32).reshape(-1, 3)
        idx = np.asarray(indices).reshape(-1)
        if normals is None:
            normals = vertex_normals(pos, idx)
        idx = idx.astype(np.uint16 if len(pos) < 65536 else np.uint32)
        attrs = {"POSITION": self._accessor(pos, "VEC3", 34962, True),
                 "NORMAL": self._accessor(np.asarray(normals, np.float32).reshape(-1, 3), "VEC3", 34962)}
        if uvs is not None:
            attrs["TEXCOORD_0"] = self._accessor(np.asarray(uvs, np.float32).reshape(-1, 2), "VEC2", 34962)
        if colors is not None:
            c = np.asarray(colors, np.float32)
            c = c.reshape(-1, c.shape[-1])
            attrs["COLOR_0"] = self._accessor(c, "VEC4" if c.shape[1] == 4 else "VEC3", 34962)
        prim = {"attributes": attrs, "indices": self._accessor(idx, "SCALAR", 34963), "mode": 4}
        if material is not None:
            prim["material"] = self._mat_ids[material]
        self.doc["meshes"].append({"name": name, "primitives": [prim]})
        self._mesh_ids[name] = len(self.doc["meshes"]) - 1
        return name

    def node(self, name, mesh=None, translation=None, rotation=None, scale=None, parent=None):
        n = {"name": name}
        if mesh is not None:
            n["mesh"] = self._mesh_ids[mesh]
        for k, v in (("translation", translation), ("rotation", rotation), ("scale", scale)):
            if v is not None:
                n[k] = [float(x) for x in v]
        self.doc["nodes"].append(n)
        i = len(self.doc["nodes"]) - 1
        if parent is None:
            self.doc["scenes"][0]["nodes"].append(i)
        else:
            self.doc["nodes"][parent].setdefault("children", []).append(i)
        return i

    def save(self, path):
        for k in ("materials", "meshes"):
            if not self.doc[k]:
                del self.doc[k]
        while len(self.bin) % 4:
            self.bin += b"\0"
        self.doc["buffers"] = [{"byteLength": len(self.bin)}]
        js = json.dumps(self.doc, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
            f.write(struct.pack("<II", len(self.bin), 0x004E4942) + bytes(self.bin))
        return total


# ---------- procedural demos (also serve as examples of the API) ----------

def _icosphere(sub=1):
    t = (1 + 5 ** 0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    v = [np.array(p, float) / np.linalg.norm(p) for p in v]
    for _ in range(sub):
        cache, nf = {}, []
        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                m = v[a] + v[b]
                v.append(m / np.linalg.norm(m))
                cache[k] = len(v) - 1
            return cache[k]
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    return np.array(v, np.float32), np.array(f, np.uint32)


def demo_rock(rng):
    pos, idx = _icosphere(2)
    # low-frequency lumps + flattened base, then facet shading
    lumps = sum(np.sin(pos @ rng.normal(size=3) * f + rng.uniform(0, 6.28)) * a for f, a in ((1.7, .18), (3.9, .07), (7.3, .03)))
    pos = pos * (1 + lumps)[:, None] * np.array([0.6, 0.42, 0.5])
    pos[:, 1] = np.maximum(pos[:, 1], -0.25)
    pos[:, 1] -= pos[:, 1].min()
    shade = 0.75 + 0.25 * (pos[:, 1] / pos[:, 1].max())
    col = np.c_[shade * 0.46, shade * 0.43, shade * 0.40, np.ones(len(pos))]
    pos, idx, col = flat_shade(pos, idx, col)
    g = Glb()
    g.material("rock", base=(1, 1, 1, 1), roughness=0.9)
    g.mesh("rock", pos, idx, colors=col, material="rock")
    g.node("rock", mesh="rock")
    return g


def demo_crystal(rng):
    g = Glb()
    g.material("crystal", base=(0.35, 0.75, 1.0, 1), metallic=0.0, roughness=0.15, emissive=(0.05, 0.25, 0.45))
    g.material("base", base=(0.2, 0.19, 0.22, 1), roughness=0.95)
    sides = 6
    allp, alli = [], []
    for k in range(int(rng.integers(4, 7))):
        h, r = rng.uniform(0.5, 1.3), rng.uniform(0.08, 0.16)
        ring = np.array([[np.cos(a) * r, 0, np.sin(a) * r] for a in np.linspace(0, 2 * np.pi, sides, endpoint=False)])
        p = np.vstack([ring, ring + [0, h * 0.8, 0], [[0, h, 0]]])
        i = []
        for s in range(sides):
            a, b = s, (s + 1) % sides
            i += [(a, b + sides, b), (a, a + sides, b + sides), (a + sides, 2 * sides, b + sides)]
        tilt = rng.normal(scale=0.35, size=2)
        rx, rz = np.array([[1, 0, 0], [0, np.cos(tilt[0]), -np.sin(tilt[0])], [0, np.sin(tilt[0]), np.cos(tilt[0])]]), \
            np.array([[np.cos(tilt[1]), -np.sin(tilt[1]), 0], [np.sin(tilt[1]), np.cos(tilt[1]), 0], [0, 0, 1]])
        p = p @ (rx @ rz).T + [rng.uniform(-.15, .15), 0, rng.uniform(-.15, .15)]
        alli.append(np.array(i) + sum(len(q) for q in allp))
        allp.append(p)
    pos, idx = flat_shade(np.vstack(allp).astype(np.float32), np.vstack(alli).astype(np.uint32))
    g.mesh("shards", pos, idx, material="crystal")
    bp, bi = _icosphere(1)
    bp = bp * [0.38, 0.12, 0.38]
    bp, bi = flat_shade(bp, bi)
    g.mesh("base", bp, bi, material="base")
    root = g.node("crystal_cluster")
    g.node("shards", mesh="shards", parent=root)
    g.node("base", mesh="base", parent=root)
    return g


def demo_crate(rng):
    """UV-mapped box with a generated plank texture (needs Pillow)."""
    from PIL import Image, ImageDraw
    s, img = 256, None
    img = Image.new("RGB", (s, s), (122, 84, 50))
    d = ImageDraw.Draw(img)
    for y in range(0, s, 32):
        tone = int(rng.integers(-14, 14))
        d.rectangle([0, y, s, y + 30], fill=(122 + tone, 84 + tone, 50 + tone // 2))
        d.line([0, y + 31, s, y + 31], fill=(60, 40, 24), width=2)
    d.rectangle([0, 0, s - 1, s - 1], outline=(70, 48, 28), width=14)
    d.line([0, 0, s, s], fill=(96, 66, 38), width=16)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    g = Glb()
    tex = g.texture(buf.getvalue(), "planks")
    g.material("crate", base=(1, 1, 1, 1), roughness=0.8, base_tex=tex)
    h = 0.5
    faces = [((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (1, 0, 0), (0, 0, -1)),
             ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))]
    P, N, U, I = [], [], [], []
    for n, u, v in faces:
        n, u, v = map(np.array, (n, u, v))
        base = len(P)
        for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            P.append((n + a * u + b * v) * h)
            N.append(n)
            U.append(((a + 1) / 2, 1 - (b + 1) / 2))
        I += [base, base + 1, base + 2, base, base + 2, base + 3]
    P = np.array(P, np.float32) + [0, h, 0]
    g.mesh("crate", P, np.array(I, np.uint32), normals=np.array(N, np.float32), uvs=np.array(U, np.float32), material="crate")
    g.node("crate", mesh="crate")
    return g


if __name__ == "__main__":
    if len(sys.argv) < 4 or sys.argv[1] != "demo" or sys.argv[2] not in ("rock", "crystal", "crate"):
        print(__doc__)
        sys.exit(2)
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 1
    g = {"rock": demo_rock, "crystal": demo_crystal, "crate": demo_crate}[sys.argv[2]](np.random.default_rng(seed))
    n = g.save(sys.argv[3])
    print(f"wrote {sys.argv[3]} ({n} bytes)")
