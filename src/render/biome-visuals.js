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
import { addBiomeDetail } from "./biome-props.js";

const floorVertexShader = `
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
  col *= 1.0 - 0.72 * uDark;
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
    constructor(scene) {
      this.scene = scene;
      this.group = new Group();
      scene.add(this.group);
      this.uniforms = UniformsUtils.merge([
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
          // 3.4.0: how dark the Blackout makes the floor (0..1); the lights of blasts and arcs still light it
          uDark: { value: 0 },
          // 3.29.0: the colour of the floor: how saturated (1 = as the palette says) and how bright it is, per biome
          uVivid: { value: 1 },
          uGain: { value: 1 },
          uL: { value: Array.from({ length: 6 }, () => new Vector4()) },
          uLC: { value: Array.from({ length: 6 }, () => new Color()) },
        },
      ]);
      this.floorMat = new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: floorVertexShader,
        fragmentShader: floorFragmentShader,
        fog: true,
      });
      this.biomeId = null;
    }
    // 2.4.0: the arena is rebuilt from scratch for every layout (as before); build() asks the biome
    // for its border and props and switches the floor shader's style
    build(biome, layout, animate = false) {
      layout = layout || { key: biome.id + ":classic", W: biome.W, H: biome.H, obs: biome.obstacles, deco: 0 };
      if (this.layKey === layout.key) return;
      const first = this.layKey == null;
      if (!this.rlFloor) {
        // same uniforms, new fragment shader with one branch per biome style
        this.uniforms.uStyle = { value: 0 };
        this.floorMat.dispose();
        this.floorMat = new ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: floorVertexShader,
          fragmentShader: RL_FLOOR_FRAG,
          fog: true,
        });
        this.rlFloor = true;
      }
      this.layKey = layout.key;
      this.biomeId = biome.id;
      this.group.traverse((obj) => {
        // 2.9.1: instanced props also own GPU buffers (matrices, colours) that the geometry does not free
        if (obj.isInstancedMesh) {
          obj.dispose();
        }
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material && obj.material !== this.floorMat) {
          obj.material.dispose();
        }
      });
      this.group.clear();
      const look = RL_BIOME_LOOK[biome.id] || RL_BIOME_LOOK.yard,
        uniforms = this.uniforms;
      uniforms.uBase.value.setHex(biome.floor);
      uniforms.uGrid.value.setHex(biome.grid);
      uniforms.uAccent.value.setHex(biome.accent);
      uniforms.uHalf.value.set(layout.W, layout.H);
      uniforms.uDeco.value = look.style === 0 ? layout.deco || 0 : 0;
      uniforms.uStyle.value = look.style;
      uniforms.uVivid.value = look.vivid || 1;
      uniforms.uGain.value = look.gain || 1;
      const floor = new Mesh(new PlaneGeometry(100, 100), this.floorMat);
      floor.rotation.x = -Math.PI / 2;
      this.group.add(floor);
      const props = new Group();
      this.group.add(props);
      this.obsGroup = props;
      this.rlAnim = [];
      this.rlEmit = [];
      (RL_BIOME_BUILD[biome.id] || RL_BIOME_BUILD.yard)(
        this,
        biome,
        layout.W,
        layout.H,
        layout.obs,
        makeRng(hashString(layout.key + ":look")),
      );
      // 2.9.0: clutter, backdrop and ground decals (its own rng, so the props above keep their layout)
      addBiomeDetail(this, biome, layout.W, layout.H, layout.obs, makeRng(hashString(layout.key + ":detail")));
      this.rise = animate && !first ? 0 : 1;
      props.position.y = this.rise < 1 ? -2.6 : 0;
    }
    update(dt, px, pz, pulse) {
      if (this.obsGroup && this.rise < 1) {
        this.rise = Math.min(1, this.rise + dt / 0.7);
        let ease = 1 - Math.pow(1 - this.rise, 3);
        this.obsGroup.position.y = -2.6 * (1 - ease);
      }
      this.uniforms.uTime.value += dt;
      this.uniforms.uPlayer.value.set(px, pz);
      this.uniforms.uPulse.value = pulse;
      // 2.4.0: animated props (spinning and bobbing)
      const time = this.uniforms.uTime.value;
      for (const anim of this.rlAnim || []) {
        const obj = anim.o;
        if (anim.k === "spin" || anim.k === "spinbob") obj.rotation.y += dt * anim.s;
        if (anim.k === "bob" || anim.k === "spinbob")
          obj.position.y = anim.b + Math.sin(time * (anim.s || 1) + anim.ph) * (anim.a || 0.1);
      }
    }
  };

/* ---- 2.4.0: every biome gets its own look, not just its own colours. Before, all 19 biomes
 shared one neon grid floor, the same boxes and pillars and the same wall; only the palette
 changed. Now each of the five has its own
   floor    Blackout City (3.4.0): wet asphalt and road markings · Ember Works: basalt plates split by glowing lava seams ·
            Cryo Vault: frozen sheet with cracks, frost and glints · Toxin Marsh: mud, murky
            water with ripples and moss · Void Core: hex tiles floating over a starfield
   props    (same collision shapes) pylons and crates · chimneys and machines · crystal
            clusters and ice blocks · mushrooms, dead trees and logs · floating obelisks and
            hovering monoliths
   border   jersey barriers (3.4.0, was a fence) · steel wall with hazard stripes · ice wall with crystals · reeds and rocks
            on a mud bank · energy barrier over the abyss
   air      neon dust · rising embers and chimney sparks · snowfall · spores and marsh haze ·
            rising void motes
   light    sun colour, sky and fog density (the marsh is foggy, the void dark)
 ---- */
const RL_BIOME_LOOK = {
  // 3.4.0: Blackout City: a cold moon, little ambient light, some fog over the street
  // 3.29.0: key light and fill light from opposite sides in complementary colours (a strong sun and a weaker, flat sky light give
  // the faceted models their form), a richer floor (vivid: saturation, gain: brightness)
  yard: {
    style: 5,
    hemi: 0.95,
    sun: 0xb4c4ff,
    sunI: 2.0,
    fill: [0xff7a3a, 0.95],
    vivid: 1.45,
    gain: 1.12,
    fog: [1.5, 3.8],
  },
  works: {
    style: 1,
    hemi: 1.0,
    sun: 0xffb27a,
    sunI: 2.3,
    fill: [0x3a8cff, 0.7],
    vivid: 1.1,
    gain: 1.02,
    fog: [1.35, 3.3],
  },
  vault: {
    style: 2,
    hemi: 1.5,
    sun: 0xe4f4ff,
    sunI: 2.2,
    fill: [0xff8ad0, 0.75],
    vivid: 1.5,
    gain: 1.0,
    fog: [1.3, 3.2],
  },
  marsh: {
    style: 3,
    hemi: 1.0,
    sun: 0xe8ffa8,
    sunI: 1.7,
    fill: [0xa05cff, 0.75],
    vivid: 1.1,
    gain: 1.0,
    fog: [0.95, 2.5],
  },
  void: {
    style: 4,
    hemi: 0.9,
    sun: 0xd8c4ff,
    sunI: 1.6,
    fill: [0x20e0ff, 1.0],
    vivid: 1.1,
    gain: 1.0,
    fog: [1.7, 4.4],
  },
};
const RL_FLOOR_FRAG = `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uBase; uniform vec3 uGrid; uniform vec3 uAccent;
uniform vec2 uHalf; uniform vec2 uPlayer; uniform float uTime; uniform float uPulse; uniform float uDeco;
uniform float uStyle; uniform float uDark; uniform float uVivid; uniform float uGain;
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
  } else if (st == 5) {
    // Blackout City (3.4.0): wet black asphalt with grain and glossy tar seams, puddles that mirror the lights with
    // rain rings in them, worn lane markings (dashed lines every 9 m, a crosswalk near each side) and cracks
    float grain = vnoise(p * 2.2) * 0.6 + h21(floor(p * 18.0)) * 0.4;
    col = uBase * (0.8 + 0.7 * grain) * (0.85 + 0.5 * pl);
    vec3 v = voro(p * 0.18 + 7.0);
    col *= 1.0 - smoothstep(0.05, 0.0, v.y) * 0.4;
    float puddle = smoothstep(0.56, 0.6, fbm(p * 0.16 + 2.0));
    vec2 rc = floor(p * 1.3), rf = fract(p * 1.3) - 0.5;
    float rt = fract(uTime * 0.9 + h21(rc) * 7.0);
    float ripple = smoothstep(0.025, 0.0, abs(length(rf) - rt * 0.28)) * (1.0 - rt) * step(0.6, h21(rc + 4.0));
    vec3 mirror = vec3(0.035, 0.045, 0.065) + uAccent * 0.012 * (0.5 + 0.5 * sin(uTime * 0.7 + p.x * 0.2));
    col = mix(col, uBase * 0.35 + mirror, puddle * 0.85) + vec3(0.55, 0.65, 0.8) * ripple * puddle * 0.14;
    float ly = abs(mod(p.y + 4.5, 9.0) - 4.5);
    float lane = smoothstep(0.13, 0.07, ly) * step(0.45, fract(p.x / 3.0));
    float cw = step(abs(abs(p.x) - (uHalf.x - 4.0)), 1.3) * step(0.5, fract(p.y / 1.1)) * step(abs(p.y), 4.2);
    lane = max(lane, cw);
    float wear = smoothstep(0.22, 0.6, vnoise(p * 1.7 + 9.0));
    col = mix(col, uGrid * 0.4, lane * wear * inside * (1.0 - puddle * 0.6));
    lit = 0.4 + 0.75 * puddle + lane * 0.3;
  } else {
    // Neon Yard (until 3.4.0, the style is kept): the neon grid with a slow scan wave and layout markings
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
  // 3.29.0: richer colour: the floor is most of the picture, and its palette was muted
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, uVivid) * uGain;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

// Instanced props (reeds, crystals, stripes, rocks): one draw call per kind.
function rlInst(group, geo, mat, list) {
  if (!list.length) return null;
  const mesh = new InstancedMesh(geo, mat, list.length),
    dummy = new Object3D();
  list.forEach((item, i) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
    dummy.scale.set(item.sx ?? 1, item.sy ?? 1, item.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (item.c != null) {
      mesh.setColorAt(i, hexColor(item.c));
    }
  });
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}
// Points along the border, `off` outside it, every `step` metres: fn(x, z, nx, nz)
function rlAlongBorder(W, H, off, step, fn) {
  const outW = W + off,
    outH = H + off;
  for (const [x0, z0, x1, z1, nx, nz] of [
    [-outW, -outH, outW, -outH, 0, -1],
    [outW, -outH, outW, outH, 1, 0],
    [outW, outH, -outW, outH, 0, 1],
    [-outW, outH, -outW, -outH, -1, 0],
  ]) {
    const count = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let i = 0; i < count; i++) {
      const frac = (i + 0.5) / count;
      fn(x0 + (x1 - x0) * frac, z0 + (z1 - z0) * frac, nx, nz);
    }
  }
}
const rlMesh = (group, geo, mat, x, y, z, ry = 0) => {
  const mesh = new Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  group.add(mesh);
  return mesh;
};
const rlGlow = (color, opacity = 1) =>
  new MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity });
// A thin ring on the floor at the collision radius, so the footprint reads in every biome.
const rlFootRing = (group, x, z, radius, mat) => {
  const ring = rlMesh(group, new TorusGeometry(radius, 0.04, 4, 32), mat, x, 0.05, z);
  ring.rotation.x = Math.PI / 2;
  return ring;
};
// Outline slab under a box obstacle.
const rlFootSlab = (group, box, mat, pad = 0.3) =>
  rlMesh(group, new BoxGeometry(box.w * 2 + pad, 0.05, box.h * 2 + pad), mat, box.x, 0.03, box.y);
const RL_BIOME_BUILD = {
  // Blackout City (3.4.0, was the Neon Yard): jersey barriers with red and white reflectors around the street,
  // advertising columns (round obstacles) and wrecked cars or dumpsters (box obstacles), steam from some manholes
  yard(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      concrete = new MeshLambertMaterial({ color: 0x3a3c42, flatShading: true }),
      darkConcrete = new MeshLambertMaterial({ color: 0x24262b, flatShading: true }),
      red = rlGlow(biome.accent),
      white = rlGlow(0xd8d4c8),
      amber = rlGlow(0xffb347),
      accentMat = new MeshBasicMaterial({ color: biome.accent, toneMapped: false });
    // jersey barriers: a wide foot and a narrower top, a reflector on the inner face of every second one
    rlAlongBorder(W, H, 0.45, 2.3, (x, z, nx, nz) => {
      const along = nx === 0,
        ry = along ? 0 : Math.PI / 2;
      rlMesh(group, new BoxGeometry(2.15, 0.35, 0.7), concrete, x, 0.175, z, ry);
      rlMesh(group, new BoxGeometry(2.15, 0.45, 0.32), concrete, x, 0.57, z, ry);
      const k = Math.round((along ? x : z) / 2.3);
      rlMesh(group, new BoxGeometry(0.5, 0.12, 0.02), k % 2 ? red : white, x - nx * 0.17, 0.6, z - nz * 0.17, ry);
    });
    // corner posts with a blinking-amber lamp (static glow) and a red reflector
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        rlMesh(group, new BoxGeometry(0.8, 1.1, 0.8), darkConcrete, sx * (W + 0.45), 0.55, sz * (H + 0.45));
        rlMesh(group, new BoxGeometry(0.3, 0.18, 0.3), amber, sx * (W + 0.45), 1.2, sz * (H + 0.45));
      }
    const paint = [0x2b3a4a, 0x4a2b2b, 0x2e3b2e, 0x3d3d44, 0x4a4030];
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // an advertising column: concrete drum, a band of torn posters, a cap
        const r = obstacle.r,
          height = 2.2;
        rlMesh(props, new CylinderGeometry(r * 0.92, r, height, 18), darkConcrete, obstacle.x, height / 2, obstacle.y);
        const posters = new MeshLambertMaterial({ color: rng.pick(paint), flatShading: true });
        rlMesh(props, new CylinderGeometry(r * 0.97, r * 0.99, 1.2, 18), posters, obstacle.x, 1.15, obstacle.y);
        rlMesh(
          props,
          new CylinderGeometry(r * 1.08, r * 1.0, 0.14, 18),
          concrete,
          obstacle.x,
          height + 0.07,
          obstacle.y,
        );
        rlMesh(props, new CylinderGeometry(r * 0.5, r * 0.7, 0.3, 12), concrete, obstacle.x, height + 0.29, obstacle.y);
        rlMesh(props, new CylinderGeometry(r * 1.0, r * 1.0, 0.05, 18, 1, true), white, obstacle.x, 1.8, obstacle.y);
        rlFootRing(props, obstacle.x, obstacle.y, r * 1.1, accentMat);
      } else if (obstacle.w < 1.3 && obstacle.h < 1.3) {
        // a dumpster with its lid half open
        const height = 1.1,
          body = new MeshLambertMaterial({ color: rng.pick([0x2f4a3a, 0x3a3f4a, 0x4a3a2a]), flatShading: true });
        rlMesh(
          props,
          new BoxGeometry(obstacle.w * 2, height, obstacle.h * 2),
          body,
          obstacle.x,
          height / 2,
          obstacle.y,
        );
        const lid = rlMesh(
          props,
          new BoxGeometry(obstacle.w * 2 + 0.06, 0.06, obstacle.h * 2 + 0.06),
          darkConcrete,
          obstacle.x,
          height + 0.12,
          obstacle.y,
        );
        lid.rotation.z = 0.18;
        rlFootSlab(props, obstacle, accentMat);
      } else {
        // a wrecked car: body, cabin, wheels, dead headlights and one red tail light still on
        const long = obstacle.w >= obstacle.h,
          L = (long ? obstacle.w : obstacle.h) * 2,
          D = (long ? obstacle.h : obstacle.w) * 2,
          ry = long ? 0 : Math.PI / 2,
          car = new Group(),
          body = new MeshLambertMaterial({ color: rng.pick(paint), flatShading: true });
        car.position.set(obstacle.x, 0, obstacle.y);
        car.rotation.y = ry;
        props.add(car);
        rlMesh(car, new BoxGeometry(L, 0.55, D), body, 0, 0.5, 0);
        rlMesh(car, new BoxGeometry(L * 0.5, 0.45, D * 0.86), body, -L * 0.06, 0.99, 0);
        rlMesh(car, new BoxGeometry(L * 0.48, 0.3, D * 0.88), darkConcrete, -L * 0.06, 1.0, 0);
        for (const wx of [-1, 1])
          for (const wz of [-1, 1]) {
            const wheel = rlMesh(
              car,
              new CylinderGeometry(0.3, 0.3, 0.22, 10),
              darkConcrete,
              wx * L * 0.33,
              0.3,
              wz * D * 0.48,
            );
            wheel.rotation.x = Math.PI / 2;
          }
        rlMesh(car, new BoxGeometry(0.04, 0.12, 0.3), red, -L / 2 - 0.01, 0.62, D * 0.32);
        rlMesh(car, new BoxGeometry(0.04, 0.1, 0.28), white, L / 2 + 0.01, 0.6, -D * 0.3).visible = rng.chance(0.3);
        rlFootSlab(props, obstacle, accentMat);
      }
    // steam out of a few manholes (decor; the live ones are the vents)
    if (!view.rlEmit) view.rlEmit = [];
    for (let k = 0; k < 4; k++) {
      const x = rng.range(-W + 2, W - 2),
        z = rng.range(-H + 2, H - 2);
      if (Math.hypot(x, z - 2) < 6 || obs.some((o) => Math.hypot(o.x - x, o.y - z) < 2.5)) continue;
      rlMesh(group, new CylinderGeometry(0.42, 0.42, 0.03, 16), darkConcrete, x, 0.015, z);
      view.rlEmit.push({ k: "steam", x, y: 0.1, z });
    }
  },
  // Ember Works: steel wall with hazard stripes, furnaces in the corners, chimneys and machines
  works(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      steel = new MeshLambertMaterial({ color: 0x2b2420, flatShading: true }),
      dark = new MeshLambertMaterial({ color: biome.wall, flatShading: true }),
      pipe = new MeshLambertMaterial({ color: 0x3d3129, flatShading: true }),
      glow = rlGlow(biome.grid),
      hot = rlGlow(biome.accent),
      wallW = 0.6,
      wallH = 1.25;
    for (const [bx, bz, sx, sz] of [
      [0, -H - wallW / 2, W * 2 + wallW * 2, wallW],
      [0, H + wallW / 2, W * 2 + wallW * 2, wallW],
      [-W - wallW / 2, 0, wallW, H * 2],
      [W + wallW / 2, 0, wallW, H * 2],
    ]) {
      rlMesh(group, new BoxGeometry(sx, wallH, sz), steel, bx, wallH / 2, bz);
      // a pipe along the inner face of every wall
      const along = sx > sz,
        pipeMesh = rlMesh(
          group,
          new CylinderGeometry(0.12, 0.12, along ? sx : sz, 8),
          pipe,
          bx + (along ? 0 : -Math.sign(bx) * 0.38),
          0.45,
          bz + (along ? -Math.sign(bz) * 0.38 : 0),
        );
      if (along) {
        pipeMesh.rotation.z = Math.PI / 2;
      } else {
        pipeMesh.rotation.x = Math.PI / 2;
      }
    }
    // hazard stripes on top of the wall: one instanced mesh, orange and black
    const stripes = [];
    let stripe = 0;
    rlAlongBorder(W, H, wallW / 2, 0.55, (px, pz, nx) =>
      stripes.push({
        x: px,
        y: wallH + 0.05,
        z: pz,
        ry: nx ? Math.PI / 2 : 0,
        sx: 0.5,
        sy: 0.1,
        sz: wallW + 0.02,
        c: stripe++ % 2 ? 0x141210 : biome.grid,
      }),
    );
    rlInst(group, new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ toneMapped: false }), stripes);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const cx = sx * (W + 0.55),
          cz = sz * (H + 0.55);
        rlMesh(group, new BoxGeometry(1.6, 1.9, 1.6), dark, cx, 0.95, cz);
        rlMesh(group, new BoxGeometry(1.64, 0.14, 0.5), hot, cx, 1.2, cz);
        view.rlEmit.push({ x: cx, z: cz, y: 2.0, k: "spark" });
      }
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // chimney: steel stack, glowing band, fire in the mouth, sparks rising
        const height = 2.4;
        rlMesh(
          props,
          new CylinderGeometry(obstacle.r * 0.78, obstacle.r, height, 14),
          steel,
          obstacle.x,
          height / 2,
          obstacle.y,
        );
        rlMesh(
          props,
          new CylinderGeometry(obstacle.r * 0.84, obstacle.r * 0.86, 0.18, 14),
          glow,
          obstacle.x,
          height * 0.68,
          obstacle.y,
        );
        const rim = rlMesh(
          props,
          new TorusGeometry(obstacle.r * 0.72, 0.09, 6, 20),
          dark,
          obstacle.x,
          height,
          obstacle.y,
        );
        rim.rotation.x = Math.PI / 2;
        const mouth = rlMesh(
          props,
          new CircleGeometry(obstacle.r * 0.66, 18),
          hot,
          obstacle.x,
          height - 0.02,
          obstacle.y,
        );
        mouth.rotation.x = -Math.PI / 2;
        rlFootRing(props, obstacle.x, obstacle.y, obstacle.r * 1.08, glow);
        view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: height + 0.1, k: "spark" });
      } else {
        // machine block: dark top plate, glowing seams, hot vents
        const height = 1.1,
          longX = obstacle.w >= obstacle.h;
        rlMesh(
          props,
          new BoxGeometry(obstacle.w * 2, height, obstacle.h * 2),
          steel,
          obstacle.x,
          height / 2,
          obstacle.y,
        );
        rlMesh(
          props,
          new BoxGeometry(Math.max(0.1, obstacle.w * 2 - 0.2), 0.08, Math.max(0.1, obstacle.h * 2 - 0.2)),
          dark,
          obstacle.x,
          height + 0.04,
          obstacle.y,
        );
        for (const side of [-1, 1]) {
          if (longX) {
            rlMesh(
              props,
              new BoxGeometry(obstacle.w * 2 + 0.02, 0.08, 0.04),
              glow,
              obstacle.x,
              height * 0.55,
              obstacle.y + side * obstacle.h,
            );
          } else {
            rlMesh(
              props,
              new BoxGeometry(0.04, 0.08, obstacle.h * 2 + 0.02),
              glow,
              obstacle.x + side * obstacle.w,
              height * 0.55,
              obstacle.y,
            );
          }
        }
        const vents = Math.max(1, Math.min(4, Math.floor(Math.max(obstacle.w, obstacle.h) / 0.6)));
        for (let j = 0; j < vents; j++) {
          const pos = (j + 0.5) / vents - 0.5;
          rlMesh(
            props,
            new BoxGeometry(0.28, 0.06, 0.28),
            hot,
            obstacle.x + (longX ? pos * obstacle.w * 1.6 : 0),
            height + 0.1,
            obstacle.y + (longX ? 0 : pos * obstacle.h * 1.6),
          );
        }
        rlFootSlab(props, obstacle, glow, 0.25);
        // 3.17.0: a gear turns on top of the machine (audio/place.js lets it be heard near the drone)
        const gear = new Group(),
          gr = Math.min(0.42, Math.min(obstacle.w, obstacle.h) * 0.55);
        gear.add(new Mesh(new CylinderGeometry(gr, gr, 0.1, 12), pipe));
        gear.add(new Mesh(new CylinderGeometry(gr * 0.3, gr * 0.3, 0.14, 8), hot));
        for (let k = 0; k < 8; k++) {
          const tooth = new Mesh(new BoxGeometry(gr * 0.32, 0.1, gr * 0.28), pipe),
            ang = (k / 8) * TAU;
          tooth.position.set(Math.cos(ang) * gr * 1.08, 0, Math.sin(ang) * gr * 1.08);
          tooth.rotation.y = -ang;
          gear.add(tooth);
        }
        gear.position.set(
          obstacle.x + (longX ? obstacle.w * 0.55 : 0),
          height + 0.16,
          obstacle.y + (longX ? 0 : obstacle.h * 0.55),
        );
        props.add(gear);
        view.rlAnim.push({
          o: gear,
          k: "spin",
          s: 1.6 + (Math.abs(obstacle.x * 7 + obstacle.y) % 1),
          b: height + 0.16,
          ph: 0,
          a: 0,
        });
      }
  },
  // Cryo Vault: ice wall crowned with crystals, crystal clusters and ice blocks with snow caps
  vault(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      ice = new MeshLambertMaterial({
        color: 0x9fd8f0,
        emissive: 0x0c2a44,
        transparent: true,
        opacity: 0.84,
        flatShading: true,
      }),
      core = new MeshLambertMaterial({ color: 0x2a5a78, emissive: 0x061624, flatShading: true }),
      snow = new MeshLambertMaterial({ color: 0xe8f4ff, emissive: 0x1a2a38, flatShading: true }),
      glow = rlGlow(biome.grid, 0.8),
      wallW = 0.6,
      wallH = 0.45;
    for (const [bx, bz, sx, sz] of [
      [0, -H - wallW / 2, W * 2 + wallW * 2, wallW],
      [0, H + wallW / 2, W * 2 + wallW * 2, wallW],
      [-W - wallW / 2, 0, wallW, H * 2],
      [W + wallW / 2, 0, wallW, H * 2],
    ])
      rlMesh(group, new BoxGeometry(sx, wallH, sz), core, bx, wallH / 2, bz);
    const spikes = [],
      tint = [0xbfe8ff, 0x9fd8f0, 0xdff4ff, 0x86c4e8];
    for (const off of [0.25, 0.85])
      rlAlongBorder(W, H, off, 0.75, (px, pz, nx, nz) => {
        const len = rng.range(0.7, off < 0.5 ? 1.5 : 2.4),
          tilt = rng.range(0.1, 0.35);
        spikes.push({
          x: px + rng.range(-0.2, 0.2) * (nz ? 1 : 0),
          y: wallH + len / 2 - 0.1,
          z: pz + rng.range(-0.2, 0.2) * (nx ? 1 : 0),
          rx: nz * tilt,
          rz: -nx * tilt,
          ry: rng.range(0, 6),
          sx: rng.range(0.7, 1.2),
          sy: len,
          sz: rng.range(0.7, 1.2),
          c: rng.pick(tint),
        });
      });
    rlInst(
      group,
      new ConeGeometry(0.28, 1, 6),
      new MeshLambertMaterial({ emissive: 0x0c2a44, transparent: true, opacity: 0.88, flatShading: true }),
      spikes,
    );
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // crystal cluster: a tall hexagonal prism and four smaller ones leaning outwards
        const main = rlMesh(
          props,
          new CylinderGeometry(obstacle.r * 0.3, obstacle.r * 0.5, 2.1, 6),
          ice,
          obstacle.x,
          1.05,
          obstacle.y,
          rng.range(0, 6),
        );
        main.rotation.z = rng.range(-0.08, 0.08);
        for (let j = 0; j < 4; j++) {
          const angle = (j / 4) * Math.PI * 2 + rng.range(-0.4, 0.4),
            len = rng.range(0.8, 1.4),
            shard = rlMesh(
              props,
              new CylinderGeometry(obstacle.r * 0.14, obstacle.r * 0.24, len, 6),
              ice,
              obstacle.x + Math.cos(angle) * obstacle.r * 0.55,
              len / 2 - 0.05,
              obstacle.y + Math.sin(angle) * obstacle.r * 0.55,
            );
          shard.rotation.set(Math.sin(angle) * 0.35, 0, -Math.cos(angle) * 0.35);
        }
        const frost = rlMesh(props, new CircleGeometry(obstacle.r, 20), snow, obstacle.x, 0.02, obstacle.y);
        frost.rotation.x = -Math.PI / 2;
        rlFootRing(props, obstacle.x, obstacle.y, obstacle.r * 1.08, glow);
        view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 2.0, k: "glint" });
      } else {
        // ice block: clear shell, dark core, snow cap
        const height = 1.05;
        rlMesh(
          props,
          new BoxGeometry(obstacle.w * 2 * 0.72, height * 0.8, obstacle.h * 2 * 0.72),
          core,
          obstacle.x,
          height * 0.42,
          obstacle.y,
        );
        rlMesh(props, new BoxGeometry(obstacle.w * 2, height, obstacle.h * 2), ice, obstacle.x, height / 2, obstacle.y);
        rlMesh(
          props,
          new BoxGeometry(obstacle.w * 2 + 0.1, 0.14, obstacle.h * 2 + 0.1),
          snow,
          obstacle.x,
          height + 0.05,
          obstacle.y,
        );
        rlFootSlab(props, obstacle, glow, 0.25);
      }
  },
  // Toxin Marsh: a mud bank with reeds and rocks, mushrooms, dead trees and mossy logs
  marsh(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      bark = new MeshLambertMaterial({ color: 0x2e2a1c, flatShading: true }),
      moss = new MeshLambertMaterial({ color: 0x2f5a22, emissive: 0x0a1a06, flatShading: true }),
      stem = new MeshLambertMaterial({ color: 0xcfc8a8, flatShading: true }),
      cap = new MeshLambertMaterial({ color: 0x6a3a8a, emissive: 0x1a0826, flatShading: true }),
      gill = new MeshLambertMaterial({ color: 0x1c1024 }),
      spot = rlGlow(biome.accent),
      ring = rlGlow(biome.grid, 0.55),
      wood = new MeshLambertMaterial({ color: 0x6a5a3a, flatShading: true }),
      wallW = 1.2;
    for (const [bx, bz, sx, sz] of [
      [0, -H - wallW / 2, W * 2 + wallW * 2, wallW],
      [0, H + wallW / 2, W * 2 + wallW * 2, wallW],
      [-W - wallW / 2, 0, wallW, H * 2],
      [W + wallW / 2, 0, wallW, H * 2],
    ])
      rlMesh(
        group,
        new BoxGeometry(sx, 0.22, sz),
        new MeshLambertMaterial({ color: 0x1a2414, flatShading: true }),
        bx,
        0.11,
        bz,
      );
    const reeds = [],
      rocks = [],
      green = [0x5a7a2a, 0x4a6a24, 0x6f8a34, 0x3e5a20];
    rlAlongBorder(W, H, 0.55, 0.4, (px, pz, nx, nz) => {
      for (let j = 0; j < 2; j++) {
        const len = rng.range(0.9, 2.3),
          off = rng.range(-0.45, 0.6);
        reeds.push({
          x: px + nx * off + rng.range(-0.2, 0.2) * (nz ? 1 : 0),
          y: len / 2,
          z: pz + nz * off + rng.range(-0.2, 0.2) * (nx ? 1 : 0),
          rx: rng.range(-0.15, 0.15),
          rz: rng.range(-0.15, 0.15),
          sy: len,
          c: rng.pick(green),
        });
      }
    });
    rlAlongBorder(W, H, 1.3, 2.6, (px, pz) => {
      const size = rng.range(0.5, 1.2);
      rocks.push({
        x: px + rng.range(-0.4, 0.4),
        y: size * 0.25,
        z: pz + rng.range(-0.4, 0.4),
        ry: rng.range(0, 6),
        rx: rng.range(0, 1),
        sx: size,
        sy: size * 0.6,
        sz: size * rng.range(0.8, 1.2),
        c: rng.pick([0x2a3328, 0x333a2c, 0x262e24]),
      });
    });
    rlInst(group, new CylinderGeometry(0.03, 0.05, 1, 4), new MeshLambertMaterial({ flatShading: true }), reeds);
    rlInst(group, new DodecahedronGeometry(0.6), new MeshLambertMaterial({ flatShading: true }), rocks);
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        if (rng.chance(0.55)) {
          // giant mushroom: pale stem, purple cap with glowing spots, spores drifting up
          rlMesh(
            props,
            new CylinderGeometry(obstacle.r * 0.22, obstacle.r * 0.32, 1.25, 8),
            stem,
            obstacle.x,
            0.62,
            obstacle.y,
          );
          const capMesh = rlMesh(
            props,
            new SphereGeometry(obstacle.r * 1.02, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            cap,
            obstacle.x,
            1.18,
            obstacle.y,
          );
          capMesh.scale.y = 0.6;
          const under = rlMesh(props, new CircleGeometry(obstacle.r * 1.0, 18), gill, obstacle.x, 1.18, obstacle.y);
          under.rotation.x = Math.PI / 2;
          for (let j = 0; j < 6; j++) {
            const angle = rng.range(0, Math.PI * 2),
              el = rng.range(0.25, 1.2);
            rlMesh(
              props,
              new SphereGeometry(rng.range(0.06, 0.12), 6, 4),
              spot,
              obstacle.x + Math.cos(angle) * Math.sin(el) * obstacle.r,
              1.18 + Math.cos(el) * obstacle.r * 0.6,
              obstacle.y + Math.sin(angle) * Math.sin(el) * obstacle.r,
            );
          }
          view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 1.2 + obstacle.r * 0.6, k: "spore" });
        } else {
          // dead tree: bare trunk, crooked branches, roots and a collar of moss
          rlMesh(
            props,
            new CylinderGeometry(obstacle.r * 0.26, obstacle.r * 0.55, 2.2, 7),
            bark,
            obstacle.x,
            1.1,
            obstacle.y,
            rng.range(0, 6),
          );
          for (let j = 0; j < 3; j++) {
            const angle = rng.range(0, Math.PI * 2),
              branch = rlMesh(
                props,
                new CylinderGeometry(0.04, 0.1, 1.0, 5),
                bark,
                obstacle.x + Math.cos(angle) * 0.3,
                rng.range(1.5, 2.1),
                obstacle.y + Math.sin(angle) * 0.3,
              );
            branch.rotation.set(Math.sin(angle) * 0.9, 0, -Math.cos(angle) * 0.9);
          }
          for (let j = 0; j < 4; j++) {
            const angle = (j / 4) * Math.PI * 2 + rng.range(-0.3, 0.3),
              root = rlMesh(
                props,
                new CylinderGeometry(0.05, obstacle.r * 0.18, obstacle.r * 0.9, 5),
                bark,
                obstacle.x + Math.cos(angle) * obstacle.r * 0.55,
                0.16,
                obstacle.y + Math.sin(angle) * obstacle.r * 0.55,
              );
            root.rotation.set(Math.sin(angle) * 1.2, 0, -Math.cos(angle) * 1.2);
          }
          const col = rlMesh(
            props,
            new TorusGeometry(obstacle.r * 0.5, 0.14, 5, 14),
            moss,
            obstacle.x,
            0.14,
            obstacle.y,
          );
          col.rotation.x = Math.PI / 2;
        }
        rlFootRing(props, obstacle.x, obstacle.y, obstacle.r * 1.08, ring);
      } else {
        // fallen log along the long side, moss on top, two small glowing mushrooms
        const longX = obstacle.w >= obstacle.h,
          len = Math.max(obstacle.w, obstacle.h) * 2,
          rad = Math.max(0.3, Math.min(obstacle.w, obstacle.h) * 0.9),
          log = rlMesh(props, new CylinderGeometry(rad, rad * 1.05, len, 10), bark, obstacle.x, rad, obstacle.y);
        if (longX) {
          log.rotation.z = Math.PI / 2;
        } else {
          log.rotation.x = Math.PI / 2;
        }
        rlMesh(
          props,
          new BoxGeometry(longX ? len * 0.8 : rad * 1.1, 0.1, longX ? rad * 1.1 : len * 0.8),
          moss,
          obstacle.x,
          rad * 1.95,
          obstacle.y,
        );
        for (const side of [-1, 1]) {
          const endCap = rlMesh(
            props,
            new CircleGeometry(rad * 0.92, 12),
            wood,
            obstacle.x + (longX ? (side * len) / 2 + side * 0.02 : 0),
            rad,
            obstacle.y + (longX ? 0 : (side * len) / 2 + side * 0.02),
          );
          if (longX) {
            endCap.rotation.y = (side * Math.PI) / 2;
          } else {
            endCap.rotation.y = side > 0 ? 0 : Math.PI;
          }
        }
        for (let j = 0; j < 2; j++) {
          const pos = rng.range(-0.3, 0.3) * len,
            mx = obstacle.x + (longX ? pos : 0),
            mz = obstacle.y + (longX ? 0 : pos);
          rlMesh(props, new CylinderGeometry(0.04, 0.05, 0.25, 5), stem, mx, rad * 2 + 0.12, mz);
          rlMesh(props, new SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), spot, mx, rad * 2 + 0.24, mz);
        }
        rlFootSlab(props, obstacle, ring, 0.2);
      }
  },
  // Void Core: an energy barrier over the abyss, floating obelisks and hovering monoliths
  void(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      obsid = new MeshLambertMaterial({ color: 0x2a1a4a, emissive: 0x12072a, flatShading: true }),
      rim = rlGlow(biome.grid),
      hot = rlGlow(biome.accent),
      wall = additiveMaterial(null, { color: biome.grid, opacity: 0.13, side: DoubleSide }),
      wallH = 1.8;
    for (const [bx, bz, len, rot] of [
      [0, -H, W * 2, 0],
      [0, H, W * 2, 0],
      [-W, 0, H * 2, Math.PI / 2],
      [W, 0, H * 2, Math.PI / 2],
    ]) {
      rlMesh(group, new PlaneGeometry(len, wallH), wall, bx, wallH / 2, bz, rot);
      rlMesh(group, new BoxGeometry(rot ? 0.06 : len, 0.05, rot ? len : 0.06), rim, bx, 0.03, bz);
      rlMesh(group, new BoxGeometry(rot ? 0.04 : len, 0.03, rot ? len : 0.04), rim, bx, wallH, bz);
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const crystal = rlMesh(group, new OctahedronGeometry(0.45), hot, sx * W, 1.3, sz * H);
        crystal.scale.y = 1.8;
        view.rlAnim.push({ o: crystal, k: "spin", s: 1.2, b: 1.3, ph: sx + sz * 2 });
      }
    // rocks drifting in the abyss around the arena
    const rocks = [];
    for (let j = 0; j < 46; j++) {
      const side = rng.int(0, 3),
        along = rng.range(-1, 1),
        out = rng.range(1.6, 9),
        px = side < 2 ? along * (W + 6) : (side === 2 ? -1 : 1) * (W + out),
        pz = side < 2 ? (side === 0 ? -1 : 1) * (H + out) : along * (H + 6),
        size = rng.range(0.3, 1.3);
      rocks.push({
        x: px,
        y: rng.range(-3, 0.4),
        z: pz,
        rx: rng.range(0, 6),
        ry: rng.range(0, 6),
        sx: size,
        sy: size * rng.range(0.6, 1.2),
        sz: size,
        c: rng.pick([0x2a1c44, 0x1e1434, 0x352654]),
      });
    }
    const drift = new Group();
    group.add(drift);
    rlInst(
      drift,
      new DodecahedronGeometry(0.8),
      new MeshLambertMaterial({ emissive: 0x0a0418, flatShading: true }),
      rocks,
    );
    view.rlAnim.push({ o: drift, k: "bob", b: 0, ph: 0, a: 0.25, s: 0.35 });
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // floating obelisk with an orbiting ring over a rune circle
        const obelisk = rlMesh(props, new OctahedronGeometry(obstacle.r * 0.72), obsid, obstacle.x, 1.6, obstacle.y);
        obelisk.scale.y = 2.3;
        view.rlAnim.push({ o: obelisk, k: "spinbob", s: 0.6, b: 1.6, ph: obstacle.x * 1.7 + obstacle.y, a: 0.12 });
        const orb = rlMesh(props, new TorusGeometry(obstacle.r * 0.95, 0.04, 4, 32), hot, obstacle.x, 1.6, obstacle.y);
        orb.rotation.x = 1.2;
        view.rlAnim.push({ o: orb, k: "spin", s: 1.4, b: 1.6, ph: obstacle.y });
        rlFootRing(props, obstacle.x, obstacle.y, obstacle.r * 1.08, rim);
        const pad = rlMesh(
          props,
          new CircleGeometry(obstacle.r * 0.95, 24),
          additiveMaterial(null, { color: biome.accent, opacity: 0.16 }),
          obstacle.x,
          0.04,
          obstacle.y,
        );
        pad.rotation.x = -Math.PI / 2;
        view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 0.6, k: "mote" });
      } else {
        // monolith hovering above its outline, glowing seams on the edges
        const height = 2.0,
          mono = new Group();
        mono.position.set(obstacle.x, 0.3 + height / 2, obstacle.y);
        props.add(mono);
        rlMesh(mono, new BoxGeometry(obstacle.w * 2 * 0.92, height, obstacle.h * 2 * 0.92), obsid, 0, 0, 0);
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            rlMesh(
              mono,
              new BoxGeometry(0.05, height + 0.02, 0.05),
              rim,
              sx * obstacle.w * 0.92,
              0,
              sz * obstacle.h * 0.92,
            );
        for (const side of [-1, 1]) {
          rlMesh(
            mono,
            new BoxGeometry(obstacle.w * 2 * 0.92 + 0.04, 0.05, 0.05),
            hot,
            0,
            height / 2,
            side * obstacle.h * 0.92,
          );
          rlMesh(
            mono,
            new BoxGeometry(0.05, 0.05, obstacle.h * 2 * 0.92 + 0.04),
            hot,
            side * obstacle.w * 0.92,
            height / 2,
            0,
          );
        }
        view.rlAnim.push({ o: mono, k: "bob", b: 0.3 + height / 2, ph: obstacle.x + obstacle.y * 0.7, a: 0.1, s: 1.1 });
        rlFootSlab(props, obstacle, rim, 0.2);
      }
  },
};

// Ambient particles: the air of the biome, around the camera, plus sparks/spores/glints from props.
const RL_C = {
  ember: new Color(0xffa040),
  ember2: new Color(0xffd070),
  snow: new Color(0xdceeff),
  white: new Color(0xffffff),
  rain: new Color(0x9fb4cc),
  steam: new Color(0x5a6270),
};
function rlAmbient(renderer, dt, world, opt) {
  const biome = renderer.biome,
    arena = renderer.arena;
  if (!biome || !(dt > 0) || dt > 0.25) return;
  const density = Math.min(1, renderer.maxParticles / 1400) * (opt.menu || !world ? 0.6 : 1),
    W = arena.uniforms.uHalf.value.x,
    H = arena.uniforms.uHalf.value.y,
    cx = opt.menu || !world ? 0 : renderer.camX,
    cz = opt.menu || !world ? 0 : renderer.camZ,
    count = (rate) => {
      const want = rate * dt * density,
        whole = Math.floor(want);
      return whole + (Math.random() < want - whole ? 1 : 0);
    },
    rx = (spread = 15) => clamp(cx + (Math.random() * 2 - 1) * spread, -W, W),
    rz = (spread = 12) => clamp(cz + (Math.random() * 2 - 1) * spread - 2, -H, H),
    grid = hexColor(biome.grid),
    acc = hexColor(biome.accent);
  switch (biome.id) {
    case "works":
      for (let j = count(24); j--; )
        renderer.emit(
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
        renderer.emit(
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
        renderer.emit(
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
        renderer.emit(
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
    case "yard":
      // 3.4.0: Blackout City: rain streaks and a few splashes on the asphalt
      for (let j = count(65); j--; )
        renderer.emit(rx(16), 6 + Math.random() * 3, rz(13), -0.6, -15 - Math.random() * 4, 0.3, 0.5, 0.05, RL_C.rain, {
          spark: true,
          drag: 0,
        });
      for (let j = count(14); j--; ) renderer.emit(rx(14), 0.05, rz(11), 0, 0.9, 0, 0.18, 0.08, RL_C.rain, { drag: 2 });
      break;
    case "void":
      for (let j = count(20); j--; )
        renderer.emit(
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
        renderer.emit(rx(), 0.2 + Math.random() * 0.8, rz(), 0, 0.3, 0, 3, 0.12, grid, { drag: 0 });
  }
  if (!(arena.rise >= 1) || !arena.rlEmit) return;
  for (const src of arena.rlEmit) {
    if (Math.abs(src.x - cx) > 22 || Math.abs(src.z - cz) > 18) continue;
    if (src.k === "spark") {
      if (count(5)) {
        renderer.emit(
          src.x + (Math.random() - 0.5) * 0.4,
          src.y,
          src.z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.6,
          1.6 + Math.random() * 1.4,
          (Math.random() - 0.5) * 0.6,
          1.3,
          0.22,
          RL_C.ember,
          { drag: 0.6, grow: 1.2 },
        );
      }
    } else if (src.k === "steam") {
      // 3.4.0: steam rising from the manholes of Blackout City
      if (count(3)) {
        renderer.emit(
          src.x + (Math.random() - 0.5) * 0.5,
          src.y,
          src.z + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.3,
          0.7 + Math.random() * 0.5,
          (Math.random() - 0.5) * 0.3,
          2.2,
          0.35,
          RL_C.steam,
          { drag: 0.3, grow: 2.2 },
        );
      }
    } else if (src.k === "glint") {
      if (count(1.5)) {
        renderer.emit(
          src.x + (Math.random() - 0.5),
          src.y * Math.random(),
          src.z + (Math.random() - 0.5),
          0,
          0.2,
          0,
          0.6,
          0.2,
          RL_C.white,
          { spark: true, drag: 0 },
        );
      }
    } else if (src.k === "spore") {
      if (count(2.5)) {
        renderer.emit(
          src.x + (Math.random() - 0.5),
          src.y,
          src.z + (Math.random() - 0.5),
          (Math.random() - 0.5) * 0.3,
          0.4 + Math.random() * 0.3,
          (Math.random() - 0.5) * 0.3,
          3,
          0.14,
          acc,
          { drag: 0.1 },
        );
      }
    } else if (src.k === "mote") {
      if (count(3)) {
        const angle = Math.random() * TAU;
        renderer.emit(
          src.x + Math.cos(angle) * 1.1,
          src.y,
          src.z + Math.sin(angle) * 1.1,
          -Math.cos(angle) * 0.5,
          0.9,
          -Math.sin(angle) * 0.5,
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
   Blackout City rain-wet with a cold sheen, drops running down, red and blue emergency light on the rims (3.4.0)
   Ember Works  charred shell with pulsing lava veins, embers rising off them
   Cryo Vault   frost on the upper surfaces with glints, a cold tint, frost flakes
   Toxin Marsh  slime running down with glowing toxic spots, green drops
   Void Core    violet rim glow and star specks, motes rising
 The skin is only visual; how an enemy fights does not change. ---- */
const RL_SKIN = { uSkin: { value: 0 }, uSkinT: { value: 0 } };
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
  float vein = smoothstep(0.12, 0.0, abs(n - 0.5));
  float pulse = 0.65 + 0.35 * sin(uSkinT * 3.5 + q.y * 2.0 + q.x);
  float under = smoothstep(0.55, 0.0, vRlP.y);
  outgoingLight = outgoingLight * vec3(0.5, 0.42, 0.38) + vec3(1.0, 0.42, 0.08) * (vein * 1.3 + under * 0.4) * pulse;
} else if (rlS == 2) {
  // frost on everything facing up, glints, a cold tint
  float fr = smoothstep(-0.05, 0.6, vRlN.y + (rlN3(vRlP * 6.0) - 0.5) * 0.9);
  outgoingLight = outgoingLight * vec3(0.72, 0.9, 1.15);
  outgoingLight = mix(outgoingLight, vec3(0.72, 0.9, 1.0) * (0.6 + 0.35 * max(vRlN.y, 0.0)), fr * 0.6);
  float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
  outgoingLight += vec3(0.55, 0.85, 1.0) * rim * 0.5;
  float gl = step(0.86, rlN3(vRlP * 16.0)) * (0.5 + 0.5 * sin(uSkinT * 5.0 + vRlP.x * 30.0));
  outgoingLight += vec3(0.9, 0.97, 1.0) * gl * (0.25 + fr) * 0.7;
} else if (rlS == 3) {
  // slime running down, glowing toxic spots
  float s = smoothstep(0.56, 0.66, rlN3(vec3(vRlP.x * 5.0, vRlP.y * 1.8 + uSkinT * 0.35, vRlP.z * 5.0)));
  s = max(s, smoothstep(0.42, 0.0, vRlP.y) * 0.8);
  outgoingLight = mix(outgoingLight * vec3(0.75, 1.0, 0.6), vec3(0.1, 0.24, 0.04) + vec3(0.2, 0.34, 0.07) * max(vRlN.y, 0.0), s * 0.75);
  float spot = smoothstep(0.82, 0.9, rlN3(vRlP * 9.0 + 3.0));
  outgoingLight += vec3(0.5, 1.0, 0.15) * spot * (0.55 + 0.3 * sin(uSkinT * 2.5 + vRlP.y * 9.0));
} else if (rlS == 5) {
  // 3.4.0: Blackout City: rain-wet, a cold sheen on the upper faces, drops running down, and the red and blue of
  // emergency lights sweeping over the rims
  float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
  float wet = smoothstep(0.1, 0.9, vRlN.y);
  outgoingLight = outgoingLight * vec3(0.72, 0.75, 0.85) + vec3(0.55, 0.62, 0.75) * wet * 0.18;
  float drop = smoothstep(0.8, 0.95, rlN3(vec3(vRlP.x * 9.0, vRlP.y * 2.5 + uSkinT * 1.6, vRlP.z * 9.0)));
  outgoingLight += vec3(0.7, 0.8, 0.95) * drop * 0.35;
  float sweep = 0.5 + 0.5 * sin(uSkinT * 5.0 + vRlP.x * 1.5);
  outgoingLight += mix(vec3(1.0, 0.12, 0.18), vec3(0.15, 0.35, 1.0), step(0.5, sweep)) * fres * 0.55;
} else if (rlS == 4) {
  // void: violet rim and drifting star specks
  float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
  float crack = smoothstep(0.07, 0.0, abs(rlN3(vRlP * 3.5 + vec3(0.0, uSkinT * 0.25, 0.0)) - 0.5));
  outgoingLight = outgoingLight * vec3(0.62, 0.5, 0.85) + vec3(0.72, 0.28, 1.0) * (fres * 1.5 + crack * (0.6 + 0.4 * sin(uSkinT * 3.0 + vRlP.y * 5.0)));
  vec3 sc = vRlP * 10.0 + vec3(0.0, uSkinT * 0.6, 0.0);
  float st = step(0.94, rlH3(floor(sc))) * smoothstep(0.32, 0.12, length(fract(sc) - 0.5));
  outgoingLight += vec3(0.9, 0.8, 1.0) * st * 0.6;
}
}`;
// Adds the skin (and, for enemy bodies, the hit flash they already had) to a Lambert material.
function rlSkinMaterial(mat, flash) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSkin = RL_SKIN.uSkin;
    shader.uniforms.uSkinT = RL_SKIN.uSkinT;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>${RL_SKIN_VERT_HEAD}${flash ? "\nattribute float aFlash;\nvarying float vFlash;" : ""}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>${RL_SKIN_VERT_BODY}${flash ? "\nvFlash = aFlash;" : ""}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${RL_SKIN_FRAG_HEAD}${flash ? "\nvarying float vFlash;" : ""}`)
      .replace(
        "#include <opaque_fragment>",
        `${RL_SKIN_FRAG_BODY}${flash ? "\noutgoingLight = mix(outgoingLight, vec3(1.0), vFlash);" : ""}\n#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (flash ? "flashLambertSkin" : "lambertSkin");
  mat.needsUpdate = true;
  mat.rlSkin = true;
}
const RL_SKIN_FX = {
  1: { c: new Color(0xff8a30), vy: 1.4, grav: 0, life: 0.7, size: 0.15, spark: false },
  2: { c: new Color(0xdcf0ff), vy: -0.35, grav: 0, life: 0.9, size: 0.18, spark: true },
  3: { c: new Color(0x8cff3a), vy: -0.2, grav: 7, life: 0.6, size: 0.13, spark: false },
  4: { c: new Color(0xc070ff), vy: 0.9, grav: 0, life: 0.9, size: 0.12, spark: false },
  // 3.4.0: Blackout City: water dripping off
  5: { c: new Color(0xa8c4e0), vy: -0.4, grav: 9, life: 0.5, size: 0.08, spark: true },
};
function rlSkinParticles(renderer, dt, world) {
  const fx = RL_SKIN_FX[RL_SKIN.uSkin.value];
  if (!fx || !world || !(dt > 0) || dt > 0.25) return;
  const count = world.enemies.length,
    density = Math.min(1, renderer.maxParticles / 1400),
    rate = Math.min(3.2, 100 / Math.max(1, count)) * density;
  for (const enemy of world.enemies) {
    if (enemy.dead || enemy.ghost || enemy.spawnT > 0) continue;
    const big = enemy.boss ? 6 : 1;
    if (Math.random() >= rate * big * dt) continue;
    const angle = Math.random() * TAU,
      dist = Math.random() * enemy.r * 0.8;
    renderer.emit(
      enemy.x + Math.cos(angle) * dist,
      0.3 + enemy.r * (enemy.boss ? 1.4 : 0.9),
      enemy.y + Math.sin(angle) * dist,
      (Math.random() - 0.5) * 0.4,
      fx.vy * (0.7 + Math.random() * 0.6),
      (Math.random() - 0.5) * 0.4,
      fx.life,
      fx.size * (enemy.boss ? 1.6 : 1),
      fx.c,
      { drag: 0.4, grav: fx.grav, spark: fx.spark },
    );
  }
}

export { RL_BIOME_LOOK, RL_SKIN, ArenaView, rlAmbient, rlSkinMaterial, rlSkinParticles };
