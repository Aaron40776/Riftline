// Biome looks: floors, props, borders, ambient particles and the enemy skins (shaders).

import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector4,
} from "three";
import { clamp, TAU, hashString, makeRng } from "../core/util.js";
import { hexColor, additiveMaterial } from "./renderer.js";

var floorVertexShader = `
#include <common>
#include <fog_pars_vertex>
varying vec2 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
  floorFragmentShader = `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uBase; uniform vec3 uGrid; uniform vec3 uAccent;
uniform vec2 uHalf; uniform vec2 uPlayer; uniform float uTime; uniform float uPulse; uniform float uDeco;
uniform vec4 uL[6]; uniform vec3 uLC[6];
varying vec2 vW;
float gridLine(vec2 p, float w) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / (fwidth(p) * w);
  return 1.0 - min(min(g.x, g.y), 1.0);
}
void main() {
  vec2 p = vW;
  float minor = gridLine(p, 1.2);
  float major = gridLine(p / 4.0, 1.6);
  vec2 d = uHalf - abs(p);
  float edge = min(d.x, d.y);
  float inside = step(0.0, edge);
  float edgeGlow = exp(-max(edge, 0.0) * 1.1);
  vec2 dp = p - uPlayer;
  float pl = exp(-dot(dp, dp) * 0.018);
  // slow scanning wave across the floor
  float scan = smoothstep(0.0, 1.0, 1.0 - abs(fract(length(p) * 0.05 - uTime * 0.08) - 0.5) * 2.0);
  vec3 col = uBase * (0.75 + 0.7 * pl);
  col += uGrid * (minor * 0.07 + major * (0.22 + 0.12 * scan)) * (0.6 + 0.6 * pl) * inside;
  col += uAccent * edgeGlow * 0.28 * inside;
  col += uGrid * uPulse * 0.12 * inside;
  // floor markings that change with the layout: 1 rings, 2 hazard stripes along the edge, 3 cross lanes, 4 hex dots
  if (uDeco > 0.5) {
    float m = 0.0;
    if (uDeco < 1.5) { float rr = length(p); m = smoothstep(0.455, 0.49, abs(fract(rr / 5.5) - 0.5)) * step(4.0, rr); }
    else if (uDeco < 2.5) { float band = step(edge, 2.2) * step(0.5, edge); m = band * step(0.5, fract((p.x + p.y) * 0.35)); }
    else if (uDeco < 3.5) { vec2 a = abs(p); m = (smoothstep(1.7, 1.5, a.x) + smoothstep(1.7, 1.5, a.y)) * 0.45 * step(4.5, length(p)); }
    else { vec2 g = vec2(p.x * 0.5774 + p.y, p.x * 1.1547) / 3.0; vec2 f = fract(g) - 0.5; m = smoothstep(0.1, 0.06, length(f)) * 0.8; }
    col += uGrid * m * 0.05 * inside; // subtle: markings, not paint
  }
  // transient light pools: muzzle flashes and explosions light up the grid
  for (int i = 0; i < 6; i++) {
    if (uL[i].w <= 0.0) continue;
    vec2 d2 = p - uL[i].xy;
    float fall = exp(-dot(d2, d2) / max(0.01, uL[i].z * uL[i].z));
    col += uLC[i] * uL[i].w * fall * (0.35 + minor * 0.5 + major * 0.9);
  }
  col *= mix(0.3, 1.0, inside);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`,
  ArenaView = class {
    constructor(t) {
      ((this.scene = t),
        (this.group = new Group()),
        t.add(this.group),
        (this.uniforms = UniformsUtils.merge([
          UniformsLib.fog,
          {
            uBase: { value: new Color() },
            uGrid: { value: new Color() },
            uAccent: { value: new Color() },
            uHalf: { value: new Vector2(18, 18) },
            uPlayer: { value: new Vector2() },
            uTime: { value: 0 },
            uPulse: { value: 0 },
            uDeco: { value: 0 },
            uL: { value: Array.from({ length: 6 }, () => new Vector4()) },
            uLC: { value: Array.from({ length: 6 }, () => new Color()) },
          },
        ])),
        (this.floorMat = new ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: floorVertexShader,
          fragmentShader: floorFragmentShader,
          fog: !0,
        })),
        (this.biomeId = null));
    }
    // 2.4.0: the arena is rebuilt from scratch for every layout (as before); build() asks the biome
    // for its border and props and switches the floor shader's style
    build(t, e, n = !1) {
      if (((e = e || { key: t.id + ":classic", W: t.W, H: t.H, obs: t.obstacles, deco: 0 }), this.layKey === e.key))
        return;
      const first = this.layKey == null;
      if (!this.rlFloor) {
        // same uniforms, new fragment shader with one branch per biome style
        this.uniforms.uStyle = { value: 0 };
        this.floorMat.dispose();
        this.floorMat = new ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: floorVertexShader,
          fragmentShader: RL_FLOOR_FRAG,
          fog: !0,
        });
        this.rlFloor = !0;
      }
      ((this.layKey = e.key), (this.biomeId = t.id));
      this.group.traverse((b) => {
        (b.geometry && b.geometry.dispose(), b.material && b.material !== this.floorMat && b.material.dispose());
      });
      this.group.clear();
      const look = RL_BIOME_LOOK[t.id] || RL_BIOME_LOOK.yard,
        r = this.uniforms;
      (r.uBase.value.setHex(t.floor),
        r.uGrid.value.setHex(t.grid),
        r.uAccent.value.setHex(t.accent),
        r.uHalf.value.set(e.W, e.H),
        (r.uDeco.value = look.style === 0 ? e.deco || 0 : 0),
        (r.uStyle.value = look.style));
      const floor = new Mesh(new PlaneGeometry(100, 100), this.floorMat);
      ((floor.rotation.x = -Math.PI / 2), this.group.add(floor));
      const x = new Group();
      (this.group.add(x), (this.obsGroup = x));
      this.rlAnim = [];
      this.rlEmit = [];
      (RL_BIOME_BUILD[t.id] || RL_BIOME_BUILD.yard)(this, t, e.W, e.H, e.obs, makeRng(hashString(e.key + ":look")));
      ((this.rise = n && !first ? 0 : 1), (x.position.y = this.rise < 1 ? -2.6 : 0));
    }
    update(t, e, n, s) {
      if (this.obsGroup && this.rise < 1) {
        this.rise = Math.min(1, this.rise + t / 0.7);
        let r = 1 - Math.pow(1 - this.rise, 3);
        this.obsGroup.position.y = -2.6 * (1 - r);
      }
      ((this.uniforms.uTime.value += t), this.uniforms.uPlayer.value.set(e, n), (this.uniforms.uPulse.value = s));
      // 2.4.0: animated props (spinning and bobbing)
      const T = this.uniforms.uTime.value;
      for (const a of this.rlAnim || []) {
        const o = a.o;
        if (a.k === "spin" || a.k === "spinbob") o.rotation.y += t * a.s;
        if (a.k === "bob" || a.k === "spinbob") o.position.y = a.b + Math.sin(T * (a.s || 1) + a.ph) * (a.a || 0.1);
      }
    }
  };

/* ---- 2.4.0: every biome gets its own look, not just its own colours. Before, all 19 biomes
 shared one neon grid floor, the same boxes and pillars and the same wall; only the palette
 changed. Now each of the five has its own
   floor    Neon Yard: neon grid · Ember Works: basalt plates split by glowing lava seams ·
            Cryo Vault: frozen sheet with cracks, frost and glints · Toxin Marsh: mud, murky
            water with ripples and moss · Void Core: hex tiles floating over a starfield
   props    (same collision shapes) pylons and crates · chimneys and machines · crystal
            clusters and ice blocks · mushrooms, dead trees and logs · floating obelisks and
            hovering monoliths
   border   fence · steel wall with hazard stripes · ice wall with crystals · reeds and rocks
            on a mud bank · energy barrier over the abyss
   air      neon dust · rising embers and chimney sparks · snowfall · spores and marsh haze ·
            rising void motes
   light    sun colour, sky and fog density (the marsh is foggy, the void dark)
 ---- */
var RL_BIOME_LOOK = {
  yard: { style: 0, hemi: 1.9, sun: 0xffffff, sunI: 1.5, fog: null },
  works: { style: 1, hemi: 1.6, sun: 0xffb27a, sunI: 1.75, fog: [1.35, 3.3] },
  vault: { style: 2, hemi: 2.2, sun: 0xd6ecff, sunI: 1.8, fog: [1.3, 3.2] },
  marsh: { style: 3, hemi: 1.6, sun: 0xdcffb8, sunI: 1.15, fog: [0.95, 2.5] },
  void: { style: 4, hemi: 1.35, sun: 0xd8c4ff, sunI: 1.05, fog: [1.7, 4.4] },
};
var RL_FLOOR_FRAG = `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uBase; uniform vec3 uGrid; uniform vec3 uAccent;
uniform vec2 uHalf; uniform vec2 uPlayer; uniform float uTime; uniform float uPulse; uniform float uDeco;
uniform float uStyle;
uniform vec4 uL[6]; uniform vec3 uLC[6];
varying vec2 vW;
float gridLine(vec2 p, float w) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / (fwidth(p) * w);
  return 1.0 - min(min(g.x, g.y), 1.0);
}
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.875;
}
// x: distance to the nearest cell centre, y: distance to the cell border (F2 - F1), z: cell id
vec3 voro(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), r = g + h22(n + g) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = h21(n + g); } else if (d < d2) { d2 = d; }
    }
  d1 = sqrt(d1);
  return vec3(d1, sqrt(d2) - d1, id);
}
vec3 starfield(vec2 p) {
  vec2 s = p * 1.4 + vec2(uTime * 0.04, 0.0), c = floor(s);
  float tw = 0.55 + 0.45 * sin(uTime * 2.0 + h21(c + 3.0) * 40.0);
  float star = step(0.965, h21(c)) * smoothstep(0.22, 0.0, length(fract(s) - 0.5)) * tw;
  float neb = fbm(p * 0.09 + vec2(uTime * 0.008, 0.0));
  return uAccent * neb * neb * 0.32 + uGrid * 0.07 * fbm(p * 0.25 - uTime * 0.015) + vec3(star * 0.9);
}
void main() {
  vec2 p = vW;
  float minor = gridLine(p, 1.2);
  float major = gridLine(p / 4.0, 1.6);
  vec2 d = uHalf - abs(p);
  float edge = min(d.x, d.y);
  float inside = step(0.0, edge);
  float edgeGlow = exp(-max(edge, 0.0) * 1.1);
  vec2 dp = p - uPlayer;
  float pl = exp(-dot(dp, dp) * 0.018);
  int st = int(uStyle + 0.5);
  vec3 col;
  float lit = 0.35 + minor * 0.5 + major * 0.9; // how strongly muzzle flashes / blasts light it
  float outside = 0.3; // brightness of the floor beyond the border
  if (st == 1) {
    // Ember Works: basalt plates, lava in the seams, each plate breathing heat at its own pace
    vec3 v = voro(p * 0.42);
    float heat = 0.55 + 0.45 * sin(uTime * 1.3 + v.z * 6.283);
    float seam = smoothstep(0.06, 0.0, v.y);
    col = uBase * (0.55 + 1.0 * fbm(p * 1.3)) * (0.8 + 0.5 * pl);
    col += uGrid * seam * (0.14 + 0.26 * heat) * inside;
    col += uAccent * smoothstep(0.02, 0.0, v.y) * heat * 0.2 * inside;
    col += uGrid * 0.04 * smoothstep(0.6, 0.95, v.z) * (1.0 - v.x) * heat * inside;
    lit = 0.45 + seam;
  } else if (st == 2) {
    // Cryo Vault: a lighter frozen sheet, cracks, frost drifts and glints
    float fr = fbm(p * 0.35 + 3.0);
    col = mix(uBase * 1.7, uGrid * 0.2, fr * 0.8) * (0.8 + 0.6 * pl) + uAccent * 0.035;
    vec3 v = voro(p * 0.3 + 11.0);
    col += uGrid * smoothstep(0.03, 0.0, v.y) * 0.2 * inside;
    float frost = smoothstep(0.55, 0.8, fbm(p * 1.1));
    col = mix(col, uGrid * 0.32, frost * 0.45);
    vec2 gc = floor(p * 2.0), gf = fract(p * 2.0) - 0.5 - (h22(gc) - 0.5) * 0.6;
    float glint = step(0.97, h21(gc)) * smoothstep(0.1, 0.0, length(gf)) * (0.5 + 0.5 * sin(uTime * 3.0 + h21(gc + 7.0) * 30.0));
    col += vec3(0.9) * glint * 0.45 * inside;
    col += uAccent * pl * 0.06;
    lit = 0.6 + 0.4 * frost;
  } else if (st == 3) {
    // Toxin Marsh: mud with murky pools that ripple, moss clumps and glowing specks
    float m = fbm(p * 0.28 + vec2(0.0, uTime * 0.01));
    float water = smoothstep(0.5, 0.58, m);
    vec3 mud = uBase * (0.7 + 1.0 * fbm(p * 1.7)) + vec3(0.012, 0.008, 0.0);
    vec3 pool = uBase * 0.55 + vec3(0.0, 0.012, 0.018);
    float sh = sin(dot(p, vec2(1.3, 0.7)) * 2.0 + fbm(p * 0.7 + uTime * 0.12) * 9.0 + uTime * 1.1);
    pool += uGrid * 0.025 * max(sh, 0.0);
    col = mix(mud, pool, water) * (0.8 + 0.5 * pl);
    float moss = smoothstep(0.6, 0.74, fbm(p * 0.9 + 5.0)) * (1.0 - water);
    col = mix(col, uBase * 1.5 + uGrid * 0.04, moss * 0.7);
    vec2 sc = floor(p * 1.5), sf = fract(p * 1.5) - 0.5;
    col += uAccent * step(0.985, h21(sc)) * smoothstep(0.14, 0.0, length(sf)) * (1.0 - water) * 0.3 * inside;
    lit = 0.4 + 0.6 * water;
  } else if (st == 4) {
    // Void Core: hex tiles with glowing rims floating over a starfield; beyond the border only the abyss
    vec2 q = p / 2.3, r = vec2(1.0, 1.7320508), hh = r * 0.5;
    vec2 a = mod(q, r) - hh, b = mod(q - hh, r) - hh;
    vec2 g = dot(a, a) < dot(b, b) ? a : b, cid = floor((q - g) * 2.0 + 0.5);
    vec2 ag = abs(g);
    float hd = max(dot(ag, normalize(r)), ag.x);
    float gap = smoothstep(0.465, 0.48, hd), rim = smoothstep(0.4, 0.46, hd) * (1.0 - gap);
    float pulse = step(0.94, h21(cid)) * (0.5 + 0.5 * sin(uTime * 2.2 + h21(cid + 1.0) * 20.0));
    vec3 tile = uBase * (0.75 + 0.35 * h21(cid + 5.0)) * (0.8 + 0.6 * pl) + uGrid * rim * 0.2 + uAccent * pulse * 0.06;
    col = mix(tile, starfield(p), max(gap, 1.0 - inside));
    lit = (0.3 + rim) * (1.0 - gap);
    outside = 1.0;
  } else {
    // Neon Yard: the neon grid with a slow scan wave and layout markings (unchanged)
    float scan = smoothstep(0.0, 1.0, 1.0 - abs(fract(length(p) * 0.05 - uTime * 0.08) - 0.5) * 2.0);
    col = uBase * (0.75 + 0.7 * pl);
    col += uGrid * (minor * 0.07 + major * (0.22 + 0.12 * scan)) * (0.6 + 0.6 * pl) * inside;
    if (uDeco > 0.5) {
      float mk = 0.0;
      if (uDeco < 1.5) { float rr = length(p); mk = smoothstep(0.455, 0.49, abs(fract(rr / 5.5) - 0.5)) * step(4.0, rr); }
      else if (uDeco < 2.5) { float band = step(edge, 2.2) * step(0.5, edge); mk = band * step(0.5, fract((p.x + p.y) * 0.35)); }
      else if (uDeco < 3.5) { vec2 aa = abs(p); mk = (smoothstep(1.7, 1.5, aa.x) + smoothstep(1.7, 1.5, aa.y)) * 0.45 * step(4.5, length(p)); }
      else { vec2 gg = vec2(p.x * 0.5774 + p.y, p.x * 1.1547) / 3.0; vec2 ff = fract(gg) - 0.5; mk = smoothstep(0.1, 0.06, length(ff)) * 0.8; }
      col += uGrid * mk * 0.05 * inside;
    }
  }
  col += uAccent * edgeGlow * 0.28 * inside;
  col += uGrid * uPulse * 0.12 * inside;
  for (int i = 0; i < 6; i++) {
    if (uL[i].w <= 0.0) continue;
    vec2 d2 = p - uL[i].xy;
    float fall = exp(-dot(d2, d2) / max(0.01, uL[i].z * uL[i].z));
    col += uLC[i] * uL[i].w * fall * lit;
  }
  col *= mix(outside, 1.0, inside);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

// Instanced props (reeds, crystals, stripes, rocks): one draw call per kind.
function rlInst(group, geo, mat, list) {
  if (!list.length) return null;
  const m = new InstancedMesh(geo, mat, list.length),
    o = new Object3D();
  list.forEach((q, k) => {
    o.position.set(q.x, q.y, q.z);
    o.rotation.set(q.rx || 0, q.ry || 0, q.rz || 0);
    o.scale.set(q.sx ?? 1, q.sy ?? 1, q.sz ?? 1);
    o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
    q.c != null && m.setColorAt(k, hexColor(q.c));
  });
  m.frustumCulled = !1;
  group.add(m);
  return m;
}
// Points along the border, `off` outside it, every `step` metres: fn(x, z, nx, nz)
function rlAlongBorder(W, H, off, step, fn) {
  const a = W + off,
    b = H + off;
  for (const [x0, z0, x1, z1, nx, nz] of [
    [-a, -b, a, -b, 0, -1],
    [a, -b, a, b, 1, 0],
    [a, b, -a, b, 0, 1],
    [-a, b, -a, -b, -1, 0],
  ]) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      fn(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, nx, nz);
    }
  }
}
const rlMesh = (group, geo, mat, x, y, z, ry = 0) => {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  group.add(m);
  return m;
};
const rlGlow = (c, opacity = 1) =>
  new MeshBasicMaterial({ color: c, toneMapped: !1, transparent: opacity < 1, opacity });
// A thin ring on the floor at the collision radius, so the footprint reads in every biome.
const rlFootRing = (g, x, z, r, mat) => {
  const q = rlMesh(g, new TorusGeometry(r, 0.04, 4, 32), mat, x, 0.05, z);
  q.rotation.x = Math.PI / 2;
  return q;
};
// Outline slab under a box obstacle.
const rlFootSlab = (g, b, mat, pad = 0.3) =>
  rlMesh(g, new BoxGeometry(b.w * 2 + pad, 0.05, b.h * 2 + pad), mat, b.x, 0.03, b.y);
var RL_BIOME_BUILD = {
  // Neon Yard: the original arena (fence with neon trim, pylons and crates)
  yard(A, t, W, H, obs) {
    const g = A.group,
      x = A.obsGroup,
      o = new MeshLambertMaterial({ color: t.wall }),
      c = new MeshBasicMaterial({ color: t.grid, toneMapped: !1 }),
      h = new MeshBasicMaterial({ color: t.accent, toneMapped: !1 }),
      d = 0.5,
      f = 0.7;
    for (const [bx, bz, sx, sz] of [
      [0, -H - d / 2, W * 2 + d * 2, d],
      [0, H + d / 2, W * 2 + d * 2, d],
      [-W - d / 2, 0, d, H * 2],
      [W + d / 2, 0, d, H * 2],
    ]) {
      rlMesh(g, new BoxGeometry(sx, f, sz), o, bx, f / 2, bz);
      rlMesh(
        g,
        new BoxGeometry(sx === d ? 0.08 : sx, 0.06, sz === d ? 0.08 : sz),
        c,
        bx + (sx === d ? (bx < 0 ? d / 2 - 0.04 : -d / 2 + 0.04) : 0),
        f + 0.03,
        bz + (sz === d ? (bz < 0 ? d / 2 - 0.04 : -d / 2 + 0.04) : 0),
      );
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        rlMesh(g, new BoxGeometry(0.9, 1.4, 0.9), o, sx * (W + 0.25), 0.7, sz * (H + 0.25));
        rlMesh(g, new BoxGeometry(0.95, 0.08, 0.95), h, sx * (W + 0.25), 1.42, sz * (H + 0.25));
      }
    const m = new MeshLambertMaterial({ color: new Color(t.wall).multiplyScalar(1.4) });
    for (const b of obs)
      if (b.t === "c") {
        const v = 1.8;
        rlMesh(x, new CylinderGeometry(b.r, b.r * 1.08, v, 20), m, b.x, v / 2, b.y);
        rlMesh(x, new CylinderGeometry(b.r * 1.02, b.r * 1.02, 0.08, 20, 1, !0), c, b.x, v * 0.75, b.y);
        rlFootRing(x, b.x, b.y, b.r * 1.1, h);
        rlMesh(x, new CylinderGeometry(b.r * 0.6, b.r * 0.6, 0.06, 16), c, b.x, v + 0.03, b.y);
      } else {
        const v = b.w < 1.3 && b.h < 1.3 ? 1.1 : 1.3;
        rlMesh(x, new BoxGeometry(b.w * 2, v, b.h * 2), m, b.x, v / 2, b.y);
        for (const e of [-b.h, b.h]) rlMesh(x, new BoxGeometry(b.w * 2 + 0.04, 0.07, 0.07), c, b.x, v, b.y + e);
        for (const e of [-b.w, b.w]) rlMesh(x, new BoxGeometry(0.07, 0.07, b.h * 2 + 0.04), c, b.x + e, v, b.y);
        rlFootSlab(x, b, h);
      }
  },
  // Ember Works: steel wall with hazard stripes, furnaces in the corners, chimneys and machines
  works(A, t, W, H, obs, R) {
    const g = A.group,
      x = A.obsGroup,
      steel = new MeshLambertMaterial({ color: 0x2b2420, flatShading: !0 }),
      dark = new MeshLambertMaterial({ color: t.wall, flatShading: !0 }),
      pipe = new MeshLambertMaterial({ color: 0x3d3129, flatShading: !0 }),
      glow = rlGlow(t.grid),
      hot = rlGlow(t.accent),
      d = 0.6,
      f = 1.25;
    for (const [bx, bz, sx, sz] of [
      [0, -H - d / 2, W * 2 + d * 2, d],
      [0, H + d / 2, W * 2 + d * 2, d],
      [-W - d / 2, 0, d, H * 2],
      [W + d / 2, 0, d, H * 2],
    ]) {
      rlMesh(g, new BoxGeometry(sx, f, sz), steel, bx, f / 2, bz);
      // a pipe along the inner face of every wall
      const along = sx > sz,
        p = rlMesh(
          g,
          new CylinderGeometry(0.12, 0.12, along ? sx : sz, 8),
          pipe,
          bx + (along ? 0 : -Math.sign(bx) * 0.38),
          0.45,
          bz + (along ? -Math.sign(bz) * 0.38 : 0),
        );
      along ? (p.rotation.z = Math.PI / 2) : (p.rotation.x = Math.PI / 2);
    }
    // hazard stripes on top of the wall: one instanced mesh, orange and black
    const stripes = [];
    let k = 0;
    rlAlongBorder(W, H, d / 2, 0.55, (px, pz, nx) =>
      stripes.push({
        x: px,
        y: f + 0.05,
        z: pz,
        ry: nx ? Math.PI / 2 : 0,
        sx: 0.5,
        sy: 0.1,
        sz: d + 0.02,
        c: k++ % 2 ? 0x141210 : t.grid,
      }),
    );
    rlInst(g, new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ toneMapped: !1 }), stripes);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const cx = sx * (W + 0.55),
          cz = sz * (H + 0.55);
        rlMesh(g, new BoxGeometry(1.6, 1.9, 1.6), dark, cx, 0.95, cz);
        rlMesh(g, new BoxGeometry(1.64, 0.14, 0.5), hot, cx, 1.2, cz);
        A.rlEmit.push({ x: cx, z: cz, y: 2.0, k: "spark" });
      }
    for (const b of obs)
      if (b.t === "c") {
        // chimney: steel stack, glowing band, fire in the mouth, sparks rising
        const v = 2.4;
        rlMesh(x, new CylinderGeometry(b.r * 0.78, b.r, v, 14), steel, b.x, v / 2, b.y);
        rlMesh(x, new CylinderGeometry(b.r * 0.84, b.r * 0.86, 0.18, 14), glow, b.x, v * 0.68, b.y);
        const rim = rlMesh(x, new TorusGeometry(b.r * 0.72, 0.09, 6, 20), dark, b.x, v, b.y);
        rim.rotation.x = Math.PI / 2;
        const mouth = rlMesh(x, new CircleGeometry(b.r * 0.66, 18), hot, b.x, v - 0.02, b.y);
        mouth.rotation.x = -Math.PI / 2;
        rlFootRing(x, b.x, b.y, b.r * 1.08, glow);
        A.rlEmit.push({ x: b.x, z: b.y, y: v + 0.1, k: "spark" });
      } else {
        // machine block: dark top plate, glowing seams, hot vents
        const v = 1.1,
          longX = b.w >= b.h;
        rlMesh(x, new BoxGeometry(b.w * 2, v, b.h * 2), steel, b.x, v / 2, b.y);
        rlMesh(
          x,
          new BoxGeometry(Math.max(0.1, b.w * 2 - 0.2), 0.08, Math.max(0.1, b.h * 2 - 0.2)),
          dark,
          b.x,
          v + 0.04,
          b.y,
        );
        for (const s of [-1, 1])
          longX
            ? rlMesh(x, new BoxGeometry(b.w * 2 + 0.02, 0.08, 0.04), glow, b.x, v * 0.55, b.y + s * b.h)
            : rlMesh(x, new BoxGeometry(0.04, 0.08, b.h * 2 + 0.02), glow, b.x + s * b.w, v * 0.55, b.y);
        const n = Math.max(1, Math.min(4, Math.floor(Math.max(b.w, b.h) / 0.6)));
        for (let j = 0; j < n; j++) {
          const f2 = (j + 0.5) / n - 0.5;
          rlMesh(
            x,
            new BoxGeometry(0.28, 0.06, 0.28),
            hot,
            b.x + (longX ? f2 * b.w * 1.6 : 0),
            v + 0.1,
            b.y + (longX ? 0 : f2 * b.h * 1.6),
          );
        }
        rlFootSlab(x, b, glow, 0.25);
      }
  },
  // Cryo Vault: ice wall crowned with crystals, crystal clusters and ice blocks with snow caps
  vault(A, t, W, H, obs, R) {
    const g = A.group,
      x = A.obsGroup,
      ice = new MeshLambertMaterial({
        color: 0x9fd8f0,
        emissive: 0x0c2a44,
        transparent: !0,
        opacity: 0.84,
        flatShading: !0,
      }),
      core = new MeshLambertMaterial({ color: 0x2a5a78, emissive: 0x061624, flatShading: !0 }),
      snow = new MeshLambertMaterial({ color: 0xe8f4ff, emissive: 0x1a2a38, flatShading: !0 }),
      glow = rlGlow(t.grid, 0.8),
      d = 0.6,
      f = 0.45;
    for (const [bx, bz, sx, sz] of [
      [0, -H - d / 2, W * 2 + d * 2, d],
      [0, H + d / 2, W * 2 + d * 2, d],
      [-W - d / 2, 0, d, H * 2],
      [W + d / 2, 0, d, H * 2],
    ])
      rlMesh(g, new BoxGeometry(sx, f, sz), core, bx, f / 2, bz);
    const spikes = [],
      tint = [0xbfe8ff, 0x9fd8f0, 0xdff4ff, 0x86c4e8];
    for (const off of [0.25, 0.85])
      rlAlongBorder(W, H, off, 0.75, (px, pz, nx, nz) => {
        const h = R.range(0.7, off < 0.5 ? 1.5 : 2.4),
          tilt = R.range(0.1, 0.35);
        spikes.push({
          x: px + R.range(-0.2, 0.2) * (nz ? 1 : 0),
          y: f + h / 2 - 0.1,
          z: pz + R.range(-0.2, 0.2) * (nx ? 1 : 0),
          rx: nz * tilt,
          rz: -nx * tilt,
          ry: R.range(0, 6),
          sx: R.range(0.7, 1.2),
          sy: h,
          sz: R.range(0.7, 1.2),
          c: R.pick(tint),
        });
      });
    rlInst(
      g,
      new ConeGeometry(0.28, 1, 6),
      new MeshLambertMaterial({ emissive: 0x0c2a44, transparent: !0, opacity: 0.88, flatShading: !0 }),
      spikes,
    );
    for (const b of obs)
      if (b.t === "c") {
        // crystal cluster: a tall hexagonal prism and four smaller ones leaning outwards
        const main = rlMesh(x, new CylinderGeometry(b.r * 0.3, b.r * 0.5, 2.1, 6), ice, b.x, 1.05, b.y, R.range(0, 6));
        main.rotation.z = R.range(-0.08, 0.08);
        for (let j = 0; j < 4; j++) {
          const a = (j / 4) * Math.PI * 2 + R.range(-0.4, 0.4),
            h = R.range(0.8, 1.4),
            q = rlMesh(
              x,
              new CylinderGeometry(b.r * 0.14, b.r * 0.24, h, 6),
              ice,
              b.x + Math.cos(a) * b.r * 0.55,
              h / 2 - 0.05,
              b.y + Math.sin(a) * b.r * 0.55,
            );
          q.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
        }
        const frost = rlMesh(x, new CircleGeometry(b.r, 20), snow, b.x, 0.02, b.y);
        frost.rotation.x = -Math.PI / 2;
        rlFootRing(x, b.x, b.y, b.r * 1.08, glow);
        A.rlEmit.push({ x: b.x, z: b.y, y: 2.0, k: "glint" });
      } else {
        // ice block: clear shell, dark core, snow cap
        const v = 1.05;
        rlMesh(x, new BoxGeometry(b.w * 2 * 0.72, v * 0.8, b.h * 2 * 0.72), core, b.x, v * 0.42, b.y);
        rlMesh(x, new BoxGeometry(b.w * 2, v, b.h * 2), ice, b.x, v / 2, b.y);
        rlMesh(x, new BoxGeometry(b.w * 2 + 0.1, 0.14, b.h * 2 + 0.1), snow, b.x, v + 0.05, b.y);
        rlFootSlab(x, b, glow, 0.25);
      }
  },
  // Toxin Marsh: a mud bank with reeds and rocks, mushrooms, dead trees and mossy logs
  marsh(A, t, W, H, obs, R) {
    const g = A.group,
      x = A.obsGroup,
      bark = new MeshLambertMaterial({ color: 0x2e2a1c, flatShading: !0 }),
      moss = new MeshLambertMaterial({ color: 0x2f5a22, emissive: 0x0a1a06, flatShading: !0 }),
      stem = new MeshLambertMaterial({ color: 0xcfc8a8, flatShading: !0 }),
      cap = new MeshLambertMaterial({ color: 0x6a3a8a, emissive: 0x1a0826, flatShading: !0 }),
      gill = new MeshLambertMaterial({ color: 0x1c1024 }),
      spot = rlGlow(t.accent),
      ring = rlGlow(t.grid, 0.55),
      wood = new MeshLambertMaterial({ color: 0x6a5a3a, flatShading: !0 }),
      d = 1.2;
    for (const [bx, bz, sx, sz] of [
      [0, -H - d / 2, W * 2 + d * 2, d],
      [0, H + d / 2, W * 2 + d * 2, d],
      [-W - d / 2, 0, d, H * 2],
      [W + d / 2, 0, d, H * 2],
    ])
      rlMesh(
        g,
        new BoxGeometry(sx, 0.22, sz),
        new MeshLambertMaterial({ color: 0x1a2414, flatShading: !0 }),
        bx,
        0.11,
        bz,
      );
    const reeds = [],
      rocks = [],
      green = [0x5a7a2a, 0x4a6a24, 0x6f8a34, 0x3e5a20];
    rlAlongBorder(W, H, 0.55, 0.4, (px, pz, nx, nz) => {
      for (let j = 0; j < 2; j++) {
        const h = R.range(0.9, 2.3),
          o = R.range(-0.45, 0.6);
        reeds.push({
          x: px + nx * o + R.range(-0.2, 0.2) * (nz ? 1 : 0),
          y: h / 2,
          z: pz + nz * o + R.range(-0.2, 0.2) * (nx ? 1 : 0),
          rx: R.range(-0.15, 0.15),
          rz: R.range(-0.15, 0.15),
          sy: h,
          c: R.pick(green),
        });
      }
    });
    rlAlongBorder(W, H, 1.3, 2.6, (px, pz) => {
      const s = R.range(0.5, 1.2);
      rocks.push({
        x: px + R.range(-0.4, 0.4),
        y: s * 0.25,
        z: pz + R.range(-0.4, 0.4),
        ry: R.range(0, 6),
        rx: R.range(0, 1),
        sx: s,
        sy: s * 0.6,
        sz: s * R.range(0.8, 1.2),
        c: R.pick([0x2a3328, 0x333a2c, 0x262e24]),
      });
    });
    rlInst(g, new CylinderGeometry(0.03, 0.05, 1, 4), new MeshLambertMaterial({ flatShading: !0 }), reeds);
    rlInst(g, new DodecahedronGeometry(0.6), new MeshLambertMaterial({ flatShading: !0 }), rocks);
    for (const b of obs)
      if (b.t === "c") {
        if (R.chance(0.55)) {
          // giant mushroom: pale stem, purple cap with glowing spots, spores drifting up
          rlMesh(x, new CylinderGeometry(b.r * 0.22, b.r * 0.32, 1.25, 8), stem, b.x, 0.62, b.y);
          const c2 = rlMesh(
            x,
            new SphereGeometry(b.r * 1.02, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            cap,
            b.x,
            1.18,
            b.y,
          );
          c2.scale.y = 0.6;
          const under = rlMesh(x, new CircleGeometry(b.r * 1.0, 18), gill, b.x, 1.18, b.y);
          under.rotation.x = Math.PI / 2;
          for (let j = 0; j < 6; j++) {
            const a = R.range(0, Math.PI * 2),
              el = R.range(0.25, 1.2);
            rlMesh(
              x,
              new SphereGeometry(R.range(0.06, 0.12), 6, 4),
              spot,
              b.x + Math.cos(a) * Math.sin(el) * b.r,
              1.18 + Math.cos(el) * b.r * 0.6,
              b.y + Math.sin(a) * Math.sin(el) * b.r,
            );
          }
          A.rlEmit.push({ x: b.x, z: b.y, y: 1.2 + b.r * 0.6, k: "spore" });
        } else {
          // dead tree: bare trunk, crooked branches, roots and a collar of moss
          rlMesh(x, new CylinderGeometry(b.r * 0.26, b.r * 0.55, 2.2, 7), bark, b.x, 1.1, b.y, R.range(0, 6));
          for (let j = 0; j < 3; j++) {
            const a = R.range(0, Math.PI * 2),
              q = rlMesh(
                x,
                new CylinderGeometry(0.04, 0.1, 1.0, 5),
                bark,
                b.x + Math.cos(a) * 0.3,
                R.range(1.5, 2.1),
                b.y + Math.sin(a) * 0.3,
              );
            q.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
          }
          for (let j = 0; j < 4; j++) {
            const a = (j / 4) * Math.PI * 2 + R.range(-0.3, 0.3),
              q = rlMesh(
                x,
                new CylinderGeometry(0.05, b.r * 0.18, b.r * 0.9, 5),
                bark,
                b.x + Math.cos(a) * b.r * 0.55,
                0.16,
                b.y + Math.sin(a) * b.r * 0.55,
              );
            q.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
          }
          const col = rlMesh(x, new TorusGeometry(b.r * 0.5, 0.14, 5, 14), moss, b.x, 0.14, b.y);
          col.rotation.x = Math.PI / 2;
        }
        rlFootRing(x, b.x, b.y, b.r * 1.08, ring);
      } else {
        // fallen log along the long side, moss on top, two small glowing mushrooms
        const longX = b.w >= b.h,
          L = Math.max(b.w, b.h) * 2,
          rad = Math.max(0.3, Math.min(b.w, b.h) * 0.9),
          log = rlMesh(x, new CylinderGeometry(rad, rad * 1.05, L, 10), bark, b.x, rad, b.y);
        longX ? (log.rotation.z = Math.PI / 2) : (log.rotation.x = Math.PI / 2);
        rlMesh(
          x,
          new BoxGeometry(longX ? L * 0.8 : rad * 1.1, 0.1, longX ? rad * 1.1 : L * 0.8),
          moss,
          b.x,
          rad * 1.95,
          b.y,
        );
        for (const s of [-1, 1]) {
          const e = rlMesh(
            x,
            new CircleGeometry(rad * 0.92, 12),
            wood,
            b.x + (longX ? (s * L) / 2 + s * 0.02 : 0),
            rad,
            b.y + (longX ? 0 : (s * L) / 2 + s * 0.02),
          );
          longX ? (e.rotation.y = (s * Math.PI) / 2) : (e.rotation.y = s > 0 ? 0 : Math.PI);
        }
        for (let j = 0; j < 2; j++) {
          const f2 = R.range(-0.3, 0.3) * L,
            mx = b.x + (longX ? f2 : 0),
            mz = b.y + (longX ? 0 : f2);
          rlMesh(x, new CylinderGeometry(0.04, 0.05, 0.25, 5), stem, mx, rad * 2 + 0.12, mz);
          rlMesh(x, new SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), spot, mx, rad * 2 + 0.24, mz);
        }
        rlFootSlab(x, b, ring, 0.2);
      }
  },
  // Void Core: an energy barrier over the abyss, floating obelisks and hovering monoliths
  void(A, t, W, H, obs, R) {
    const g = A.group,
      x = A.obsGroup,
      obsid = new MeshLambertMaterial({ color: 0x2a1a4a, emissive: 0x12072a, flatShading: !0 }),
      rim = rlGlow(t.grid),
      hot = rlGlow(t.accent),
      wall = additiveMaterial(null, { color: t.grid, opacity: 0.13, side: DoubleSide }),
      f = 1.8;
    for (const [bx, bz, len, rot] of [
      [0, -H, W * 2, 0],
      [0, H, W * 2, 0],
      [-W, 0, H * 2, Math.PI / 2],
      [W, 0, H * 2, Math.PI / 2],
    ]) {
      rlMesh(g, new PlaneGeometry(len, f), wall, bx, f / 2, bz, rot);
      rlMesh(g, new BoxGeometry(rot ? 0.06 : len, 0.05, rot ? len : 0.06), rim, bx, 0.03, bz);
      rlMesh(g, new BoxGeometry(rot ? 0.04 : len, 0.03, rot ? len : 0.04), rim, bx, f, bz);
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const q = rlMesh(g, new OctahedronGeometry(0.45), hot, sx * W, 1.3, sz * H);
        q.scale.y = 1.8;
        A.rlAnim.push({ o: q, k: "spin", s: 1.2, b: 1.3, ph: sx + sz * 2 });
      }
    // rocks drifting in the abyss around the arena
    const rocks = [];
    for (let j = 0; j < 46; j++) {
      const side = R.int(0, 3),
        along = R.range(-1, 1),
        out = R.range(1.6, 9),
        px = side < 2 ? along * (W + 6) : (side === 2 ? -1 : 1) * (W + out),
        pz = side < 2 ? (side === 0 ? -1 : 1) * (H + out) : along * (H + 6),
        s = R.range(0.3, 1.3);
      rocks.push({
        x: px,
        y: R.range(-3, 0.4),
        z: pz,
        rx: R.range(0, 6),
        ry: R.range(0, 6),
        sx: s,
        sy: s * R.range(0.6, 1.2),
        sz: s,
        c: R.pick([0x2a1c44, 0x1e1434, 0x352654]),
      });
    }
    const drift = new Group();
    g.add(drift);
    rlInst(
      drift,
      new DodecahedronGeometry(0.8),
      new MeshLambertMaterial({ emissive: 0x0a0418, flatShading: !0 }),
      rocks,
    );
    A.rlAnim.push({ o: drift, k: "bob", b: 0, ph: 0, a: 0.25, s: 0.35 });
    for (const b of obs)
      if (b.t === "c") {
        // floating obelisk with an orbiting ring over a rune circle
        const ob = rlMesh(x, new OctahedronGeometry(b.r * 0.72), obsid, b.x, 1.6, b.y);
        ob.scale.y = 2.3;
        A.rlAnim.push({ o: ob, k: "spinbob", s: 0.6, b: 1.6, ph: b.x * 1.7 + b.y, a: 0.12 });
        const orb = rlMesh(x, new TorusGeometry(b.r * 0.95, 0.04, 4, 32), hot, b.x, 1.6, b.y);
        orb.rotation.x = 1.2;
        A.rlAnim.push({ o: orb, k: "spin", s: 1.4, b: 1.6, ph: b.y });
        rlFootRing(x, b.x, b.y, b.r * 1.08, rim);
        const pad = rlMesh(
          x,
          new CircleGeometry(b.r * 0.95, 24),
          additiveMaterial(null, { color: t.accent, opacity: 0.16 }),
          b.x,
          0.04,
          b.y,
        );
        pad.rotation.x = -Math.PI / 2;
        A.rlEmit.push({ x: b.x, z: b.y, y: 0.6, k: "mote" });
      } else {
        // monolith hovering above its outline, glowing seams on the edges
        const v = 2.0,
          mono = new Group();
        mono.position.set(b.x, 0.3 + v / 2, b.y);
        x.add(mono);
        rlMesh(mono, new BoxGeometry(b.w * 2 * 0.92, v, b.h * 2 * 0.92), obsid, 0, 0, 0);
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            rlMesh(mono, new BoxGeometry(0.05, v + 0.02, 0.05), rim, sx * b.w * 0.92, 0, sz * b.h * 0.92);
        for (const s of [-1, 1]) {
          rlMesh(mono, new BoxGeometry(b.w * 2 * 0.92 + 0.04, 0.05, 0.05), hot, 0, v / 2, s * b.h * 0.92);
          rlMesh(mono, new BoxGeometry(0.05, 0.05, b.h * 2 * 0.92 + 0.04), hot, s * b.w * 0.92, v / 2, 0);
        }
        A.rlAnim.push({ o: mono, k: "bob", b: 0.3 + v / 2, ph: b.x + b.y * 0.7, a: 0.1, s: 1.1 });
        rlFootSlab(x, b, rim, 0.2);
      }
  },
};

// Ambient particles: the air of the biome, around the camera, plus sparks/spores/glints from props.
const RL_C = {
  ember: new Color(0xffa040),
  ember2: new Color(0xffd070),
  snow: new Color(0xdceeff),
  white: new Color(0xffffff),
};
function rlAmbient(R, dt, w, opt) {
  const b = R.biome,
    A = R.arena;
  if (!b || !(dt > 0) || dt > 0.25) return;
  const k = Math.min(1, R.maxParticles / 1400) * (opt.menu || !w ? 0.6 : 1),
    W = A.uniforms.uHalf.value.x,
    H = A.uniforms.uHalf.value.y,
    cx = opt.menu || !w ? 0 : R.camX,
    cz = opt.menu || !w ? 0 : R.camZ,
    count = (rate) => {
      const c = rate * dt * k,
        m = Math.floor(c);
      return m + (Math.random() < c - m ? 1 : 0);
    },
    rx = (s = 15) => clamp(cx + (Math.random() * 2 - 1) * s, -W, W),
    rz = (s = 12) => clamp(cz + (Math.random() * 2 - 1) * s - 2, -H, H),
    grid = hexColor(b.grid),
    acc = hexColor(b.accent);
  switch (b.id) {
    case "works":
      for (let j = count(24); j--; )
        R.emit(
          rx(),
          0.1,
          rz(),
          (Math.random() - 0.5) * 0.8,
          1 + Math.random() * 1.6,
          (Math.random() - 0.5) * 0.8,
          1.6 + Math.random(),
          0.1 + Math.random() * 0.1,
          Math.random() < 0.5 ? RL_C.ember : RL_C.ember2,
          { drag: 0.3 },
        );
      break;
    case "vault":
      for (let j = count(42); j--; )
        R.emit(
          rx(17),
          2.5 + Math.random() * 6,
          rz(14),
          0.5 + Math.random() * 0.3,
          -1.3 - Math.random() * 0.6,
          0.15,
          4,
          0.13,
          RL_C.snow,
          { drag: 0 },
        );
      break;
    case "marsh":
      for (let j = count(14); j--; )
        R.emit(
          rx(),
          0.3 + Math.random() * 1.3,
          rz(),
          (Math.random() - 0.5) * 0.4,
          0.15 + Math.random() * 0.2,
          (Math.random() - 0.5) * 0.4,
          3.5,
          0.15,
          Math.random() < 0.6 ? acc : grid,
          { drag: 0.2 },
        );
      for (let j = count(4); j--; )
        R.emit(
          rx(),
          0.25,
          rz(),
          (Math.random() - 0.5) * 0.3,
          0.02,
          (Math.random() - 0.5) * 0.3,
          5,
          2.6,
          hexColor(0x0a1a08),
          {
            drag: 0,
            grow: 0.6,
          },
        );
      break;
    case "void":
      for (let j = count(20); j--; )
        R.emit(
          rx(18),
          0.05,
          rz(15),
          0,
          0.6 + Math.random() * 0.8,
          0,
          3.5,
          0.1,
          Math.random() < 0.5 ? acc : Math.random() < 0.5 ? grid : RL_C.white,
          { drag: 0 },
        );
      break;
    default:
      for (let j = count(6); j--; )
        R.emit(rx(), 0.2 + Math.random() * 0.8, rz(), 0, 0.3, 0, 3, 0.12, grid, { drag: 0 });
  }
  if (!(A.rise >= 1) || !A.rlEmit) return;
  for (const q of A.rlEmit) {
    if (Math.abs(q.x - cx) > 22 || Math.abs(q.z - cz) > 18) continue;
    if (q.k === "spark")
      count(5) &&
        R.emit(
          q.x + (Math.random() - 0.5) * 0.4,
          q.y,
          q.z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.6,
          1.6 + Math.random() * 1.4,
          (Math.random() - 0.5) * 0.6,
          1.3,
          0.22,
          RL_C.ember,
          { drag: 0.6, grow: 1.2 },
        );
    else if (q.k === "glint")
      count(1.5) &&
        R.emit(
          q.x + (Math.random() - 0.5),
          q.y * Math.random(),
          q.z + (Math.random() - 0.5),
          0,
          0.2,
          0,
          0.6,
          0.2,
          RL_C.white,
          { spark: !0, drag: 0 },
        );
    else if (q.k === "spore")
      count(2.5) &&
        R.emit(
          q.x + (Math.random() - 0.5),
          q.y,
          q.z + (Math.random() - 0.5),
          (Math.random() - 0.5) * 0.3,
          0.4 + Math.random() * 0.3,
          (Math.random() - 0.5) * 0.3,
          3,
          0.14,
          acc,
          { drag: 0.1 },
        );
    else if (q.k === "mote") {
      if (count(3)) {
        const a = Math.random() * TAU;
        R.emit(
          q.x + Math.cos(a) * 1.1,
          q.y,
          q.z + Math.sin(a) * 1.1,
          -Math.cos(a) * 0.5,
          0.9,
          -Math.sin(a) * 0.5,
          1.4,
          0.12,
          grid,
          { drag: 0 },
        );
      }
    }
  }
}

/* ---- 2.4.1: enemies and bosses wear the biome. A skin is laid over every enemy model by the
 shader (same shapes, same type colours and glow, so types stay recognisable):
   Neon Yard    none
   Ember Works  charred shell with pulsing lava veins, embers rising off them
   Cryo Vault   frost on the upper surfaces with glints, a cold tint, frost flakes
   Toxin Marsh  slime running down with glowing toxic spots, green drops
   Void Core    violet rim glow and star specks, motes rising
 The skin is only visual; how an enemy fights does not change. ---- */
var RL_SKIN = { uSkin: { value: 0 }, uSkinT: { value: 0 } };
const RL_SKIN_VERT_HEAD = `
varying vec3 vRlP;
varying vec3 vRlN;`;
const RL_SKIN_VERT_BODY = `
vRlP = position;
#ifdef USE_INSTANCING
vRlN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
vRlN = normalize(mat3(modelMatrix) * objectNormal);
#endif`;
const RL_SKIN_FRAG_HEAD = `
uniform float uSkin;
uniform float uSkinT;
varying vec3 vRlP;
varying vec3 vRlN;
float rlH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rlN3(vec3 x) {
vec3 i = floor(x), f = fract(x);
f = f * f * (3.0 - 2.0 * f);
return mix(mix(mix(rlH3(i), rlH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rlH3(i + vec3(0.0, 1.0, 0.0)), rlH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
  mix(mix(rlH3(i + vec3(0.0, 0.0, 1.0)), rlH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rlH3(i + vec3(0.0, 1.0, 1.0)), rlH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`;
const RL_SKIN_FRAG_BODY = `
{
int rlS = int(uSkin + 0.5);
if (rlS == 1) {
  // molten: charred shell, lava veins that pulse
  vec3 q = vRlP * 4.5;
  float n = rlN3(q) * 0.65 + rlN3(q * 2.1) * 0.35;
  float vein = smoothstep(0.07, 0.0, abs(n - 0.5));
  float pulse = 0.65 + 0.35 * sin(uSkinT * 3.5 + q.y * 2.0 + q.x);
  outgoingLight = outgoingLight * vec3(0.6, 0.5, 0.45) + vec3(1.0, 0.42, 0.08) * vein * pulse * 0.9;
} else if (rlS == 2) {
  // frost on everything facing up, glints, a cold tint
  float fr = smoothstep(0.05, 0.75, vRlN.y + (rlN3(vRlP * 6.0) - 0.5) * 0.9);
  outgoingLight = outgoingLight * vec3(0.82, 0.93, 1.08);
  outgoingLight = mix(outgoingLight, vec3(0.72, 0.88, 1.0) * (0.55 + 0.35 * max(vRlN.y, 0.0)), fr * 0.7);
  float gl = step(0.9, rlN3(vRlP * 16.0)) * (0.5 + 0.5 * sin(uSkinT * 5.0 + vRlP.x * 30.0));
  outgoingLight += vec3(0.9, 0.97, 1.0) * gl * fr * 0.55;
} else if (rlS == 3) {
  // slime running down, glowing toxic spots
  float s = smoothstep(0.56, 0.66, rlN3(vec3(vRlP.x * 5.0, vRlP.y * 1.8 + uSkinT * 0.35, vRlP.z * 5.0)));
  outgoingLight = mix(outgoingLight * vec3(0.85, 0.95, 0.75), vec3(0.08, 0.18, 0.04) + vec3(0.14, 0.24, 0.05) * max(vRlN.y, 0.0), s * 0.55);
  float spot = smoothstep(0.87, 0.93, rlN3(vRlP * 9.0 + 3.0));
  outgoingLight += vec3(0.45, 1.0, 0.15) * spot * (0.35 + 0.25 * sin(uSkinT * 2.5 + vRlP.y * 9.0));
} else if (rlS == 4) {
  // void: violet rim and drifting star specks
  float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
  outgoingLight = outgoingLight * vec3(0.72, 0.62, 0.9) + vec3(0.72, 0.28, 1.0) * fres * 0.95;
  vec3 sc = vRlP * 10.0 + vec3(0.0, uSkinT * 0.6, 0.0);
  float st = step(0.94, rlH3(floor(sc))) * smoothstep(0.32, 0.12, length(fract(sc) - 0.5));
  outgoingLight += vec3(0.9, 0.8, 1.0) * st * 0.6;
}
}`;
// Adds the skin (and, for enemy bodies, the hit flash they already had) to a Lambert material.
function rlSkinMaterial(mat, flash) {
  mat.onBeforeCompile = (e) => {
    e.uniforms.uSkin = RL_SKIN.uSkin;
    e.uniforms.uSkinT = RL_SKIN.uSkinT;
    e.vertexShader = e.vertexShader
      .replace(
        "#include <common>",
        `#include <common>${RL_SKIN_VERT_HEAD}${flash ? "\nattribute float aFlash;\nvarying float vFlash;" : ""}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>${RL_SKIN_VERT_BODY}${flash ? "\nvFlash = aFlash;" : ""}`,
      );
    e.fragmentShader = e.fragmentShader
      .replace("#include <common>", `#include <common>${RL_SKIN_FRAG_HEAD}${flash ? "\nvarying float vFlash;" : ""}`)
      .replace(
        "#include <opaque_fragment>",
        `${RL_SKIN_FRAG_BODY}${flash ? "\noutgoingLight = mix(outgoingLight, vec3(1.0), vFlash);" : ""}\n#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (flash ? "flashLambertSkin" : "lambertSkin");
  mat.needsUpdate = !0;
  mat.rlSkin = !0;
}
const RL_SKIN_FX = {
  1: { c: new Color(0xff8a30), vy: 1.4, grav: 0, life: 0.7, size: 0.15, spark: !1 },
  2: { c: new Color(0xdcf0ff), vy: -0.35, grav: 0, life: 0.9, size: 0.18, spark: !0 },
  3: { c: new Color(0x8cff3a), vy: -0.2, grav: 7, life: 0.6, size: 0.13, spark: !1 },
  4: { c: new Color(0xc070ff), vy: 0.9, grav: 0, life: 0.9, size: 0.12, spark: !1 },
};
function rlSkinParticles(R, dt, w) {
  const fx = RL_SKIN_FX[RL_SKIN.uSkin.value];
  if (!fx || !w || !(dt > 0) || dt > 0.25) return;
  const n = w.enemies.length,
    k = Math.min(1, R.maxParticles / 1400),
    rate = Math.min(2.2, 70 / Math.max(1, n)) * k;
  for (const e of w.enemies) {
    if (e.dead || e.ghost || e.spawnT > 0) continue;
    const big = e.boss ? 6 : 1;
    if (Math.random() >= rate * big * dt) continue;
    const a = Math.random() * TAU,
      d = Math.random() * e.r * 0.8;
    R.emit(
      e.x + Math.cos(a) * d,
      0.3 + e.r * (e.boss ? 1.4 : 0.9),
      e.y + Math.sin(a) * d,
      (Math.random() - 0.5) * 0.4,
      fx.vy * (0.7 + Math.random() * 0.6),
      (Math.random() - 0.5) * 0.4,
      fx.life,
      fx.size * (e.boss ? 1.6 : 1),
      fx.c,
      { drag: 0.4, grav: fx.grav, spark: fx.spark },
    );
  }
}

export { RL_BIOME_LOOK, RL_SKIN, ArenaView, rlAmbient, rlSkinMaterial, rlSkinParticles };
