// 3.10.0: how the attacks of enemies and bosses look. Until 3.9.0 every zone of `world.hazards` (the Warden's stomp, the
// Crucible's hammer, slag rings and eruptions, the Frost Prism's nova and glaciers, the Hive Queen's plague, the Rift
// Core's bombardments, mortar shells, minebot mines, sapper charges, burning and volatile ground) was the same red ring
// around a flat red disc, every blast left the same black blob in every biome, and every enemy shot was a glowing ball.
// Now each attack shows what it is:
//   crack      the ground breaks: plates and seams that run out from the middle and glow (stomp, drill)
//   lava crack the same with seams of lava (the Crucible's hammer)
//   molten     a pool of lava wells up and grows (slag rings, eruptions, the Crucible's slag lobs)
//   frost      frost creeps in from the rim, ice spikes burst up and shatter (frost nova, glacier)
//   acid       acid wells up and bubbles (the Hive Queen's plague)
//   rift       a violet tear that winds tighter and strikes as a bolt of light (the Rift Core's bombardments)
//   target     a marker that turns, a sweep that counts down (mortar shells, mines and charges, which have models)
//   burn       the ground smoulders and flickers (burning and volatile enemies)
// The warning keeps the language of the game: the red ring at the edge of the danger (yellow with Clear warnings) and a
// ring that fills it; the red tint of the old disc is part of every surface. What is left on the floor belongs to the
// place: a blast leaves burnt wet asphalt in Blackout City, glowing cracks in Ember Works, a melted star of frost in the
// Cryo Vault, a splash of mud in the Toxin Marsh and a violet scar in the Void Core; slag cools to a crust, frost melts
// away. All of it is a few instance pools, made when first needed: one shader draws every zone; the marks are painted
// once per biome into an atlas and drawn as texture lookups (they are many and stay for seconds).

import {
  CircleGeometry,
  Color,
  LinearFilter,
  NoBlending,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
  ConeGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  UniformsLib,
  UniformsUtils,
} from "three";
import { meshPart, mergeParts, box } from "./models.js";
import { SURF_VERT, SURF_LIB } from "./hazards-view.js";
import { clamp, TAU } from "../core/util.js";

const WHITE = new Color(0xffffff),
  LAVA = new Color(0xff6a1f),
  LAVA_HOT = new Color(0xffd27a),
  ICE = new Color(0xbff0ff),
  ACID = new Color(0x9be03a),
  ACID_LITE = new Color(0xd8ff7a),
  RIFT = new Color(0xb070ff),
  RIFT_PINK = new Color(0xff4dd8),
  FIRE = new Color(0xff8a2a),
  FIRE_HOT = new Color(0xffd27a),
  SMOKE = new Color(0x4a4440),
  // the enemy shots: the hot core and the halo of each kind (the danger stays red to pink, the Prism's ice and the
  // Crucible's slag keep their own colours)
  SHOT = {
    orb: new Color(0xff3f7f),
    fast: new Color(0xff2e2a),
    shard: new Color(0x8fe8ff),
    slag: new Color(0xff7a2a),
    turret: new Color(0xff3a5a),
    drone: new Color(0xff4f9a),
    weaver: new Color(0xd04dff),
    carrier: new Color(0xff5a6a),
    // 3.16.0: the bosses' own shots: the Warden's siren slugs flash red and blue, the Hive Queen's spores are toxic
    // green, the Rift Core's rings violet
    siren: new Color(0xff3346),
    spore: new Color(0xb8f03a),
    riftorb: new Color(0xb070ff),
  },
  SIREN_BLUE = new Color(0x3d7bff),
  RIFT_RIM_SHOT = new Color(0x7ae8ff);

// the dust of each biome (stomps and cracks throw it), the index of its marks in the shader
const DUST = {
    yard: new Color(0x6a7280),
    works: new Color(0x4a3a30),
    vault: new Color(0xdff6ff),
    marsh: new Color(0x4a4426),
    void: new Color(0x5a3a90),
  },
  BIOME_INDEX = { yard: 0, works: 1, vault: 2, marsh: 3, void: 4 };

/* the look of a zone (index into the zone shader) */
const Z = { crack: 0, lavaCrack: 1, molten: 2, frost: 3, acid: 4, rift: 5, target: 6, burn: 7 };
/* the marks on the floor (index into the mark shader) and how long each stays */
const M = { burn: 0, crack: 1, slag: 2, frost: 3, slime: 4, rift: 5 },
  MARK_LIFE = [7, 6, 8, 5, 6, 5];

/* which look a zone has: by its kind, and where the kind is shared (rain, mortar, stomp) by who made it, else by the
   biome */
function lookOf(kind, src, biome) {
  switch (kind) {
    case "stomp":
      return src === "forge" ? Z.lavaCrack : Z.crack;
    case "drill":
      return Z.crack;
    case "slag":
      return Z.molten;
    case "frost":
    case "glacier":
      return Z.frost;
    case "fire":
    case "volatile":
      return Z.burn;
    case "mortar":
      return src === "forge" ? Z.molten : Z.target;
    case "rain":
      if (src === "forge") return Z.molten;
      if (src === "queen") return Z.acid;
      if (src === "core") return Z.rift;
      return biome === "works" ? Z.molten : biome === "marsh" ? Z.acid : biome === "void" ? Z.rift : Z.target;
    default:
      return Z.target;
  }
}

/* ---------- shaders: a disc of radius 1; instance colour r the level (zone: how far the warning is, mark: how much
   is left), g a seed, b the look (index / 8) ---------- */
/* shared by both shaders: layers painted over each other (premultiplied), and cracks that run out from the middle */
const LAYERS = `
vec4 acc;
void lay(vec3 c, float a) { a = clamp(a, 0.0, 1.0); acc = acc * (1.0 - a) + vec4(c * a, a); }
// cracks that run out from the middle: a few long ones along wobbling rays, the middle shattered
float cracks(float r, float a, float seed, float reach) {
  float c = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i), ai = fi * 0.8976 + h21(vec2(seed, fi)) * 0.7 + 0.16 * sin(r * 11.0 + fi * 3.0 + seed)
      + 0.07 * sin(r * 37.0 + fi * 7.0) + 0.12 * (vnoise(vec2(r * 6.0, fi + seed)) - 0.5);
    float d = abs(sin(a - ai)) * r;
    c = max(c, smoothstep(0.06 * (1.25 - r), 0.01, d) * step(r, reach * (0.8 + 0.2 * h21(vec2(fi, seed)))));
  }
  // the ground between them breaks into plates
  vec3 v = voro(vec2(cos(a), sin(a)) * r * 2.6 + seed);
  c = max(c, smoothstep(0.09, 0.02, v.y) * smoothstep(0.9, 0.2, r) * step(r, reach) * 0.85);
  return c;
}
`;
const ZONE_FRAG = `
uniform vec3 uWarn;
${LAYERS}void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float a = atan(vP.y, vP.x), k = vI.r, seed = vI.g * 37.0;
  int look = int(vI.b * 8.0 + 0.5);
  vec2 q = vP * 2.6 + seed;
  // the danger tint over the whole zone (the old flat disc), stronger as the warning runs out
  acc = vec4(uWarn * 0.75, 0.16 + 0.16 * k);
  float soft = smoothstep(1.0, 0.94, r);
  if (look <= 1) {
    // crack: the plates darken, the seams glow and reach the rim when it strikes
    float reach = 0.2 + k * 0.9;
    lay(vec3(0.02, 0.012, 0.01), 0.45 * smoothstep(reach, reach - 0.15, r) * (0.6 + 0.4 * fbm(q * 2.0)));
    float c = cracks(r, a, seed, reach);
    vec3 seam = look == 1 ? mix(vec3(1.0, 0.3, 0.03), vec3(1.0, 0.75, 0.3), k * k) * 1.8
                          : mix(uWarn * 1.5, vec3(1.0, 0.9, 0.85), k * k * 0.5);
    lay(vec3(0.0), c * 0.7);
    lay(seam, smoothstep(0.35, 1.0, c) * (0.55 + 0.45 * k) * (0.85 + 0.15 * sin(uTime * 20.0 + r * 12.0)));
  } else if (look == 2) {
    // molten: a pool of lava wells up from the middle, the ground around it glows with the heat
    float pr = (0.18 + 0.8 * k) * (0.9 + 0.12 * vnoise(vec2(a * 2.0 + seed, uTime * 0.5)));
    lay(vec3(1.0, 0.25, 0.03), 0.35 * smoothstep(pr + 0.35, pr, r) * k);
    vec3 v = voro(q * 1.3 + vec2(fbm(q + uTime * 0.3), fbm(q - uTime * 0.25)) * 1.2);
    vec3 hot = mix(vec3(0.9, 0.16, 0.01), vec3(1.0, 0.62, 0.12), fbm(q * 1.7 + vec2(0.0, uTime * 0.8)));
    float crust = smoothstep(0.05, 0.16, v.y) * smoothstep(0.3, 0.9, r / max(pr, 0.01)) * (1.0 - k * 0.6);
    vec3 col = mix(hot * (1.1 + 0.4 * k), vec3(0.05, 0.015, 0.008), crust * 0.85);
    lay(col, smoothstep(pr, pr - 0.05, r));
  } else if (look == 3) {
    // frost: it creeps in from the rim in a jagged front; facets, white cracks, glints
    float front = 1.0 - k * 1.08 + 0.1 * vnoise(vec2(a * 5.0 + seed, seed));
    float m = smoothstep(front - 0.04, front + 0.04, r);
    vec3 v = voro(q * 2.0);
    vec3 col = mix(vec3(0.45, 0.72, 0.9), vec3(0.85, 0.95, 1.0), 0.5 * v.z + 0.5 * fbm(vec2(r * 6.0, a * 3.0 + seed)));
    col += vec3(0.6) * smoothstep(0.04, 0.0, v.y);
    // feathers of frost that point inwards from the front
    col += vec3(0.4) * smoothstep(0.7, 1.0, sin(a * 40.0 + r * 8.0)) * smoothstep(front + 0.2, front, r) * m;
    vec2 gc = floor(vP * 9.0 + seed), gf = fract(vP * 9.0 + seed) - 0.5;
    col += vec3(1.0) * step(0.9, h21(gc)) * smoothstep(0.12, 0.0, length(gf)) * (0.5 + 0.5 * sin(uTime * 4.0 + h21(gc) * 20.0));
    lay(col, m * (0.55 + 0.3 * k));
    lay(vec3(1.0), smoothstep(0.03, 0.0, abs(r - front)) * 0.7);
  } else if (look == 4) {
    // acid: it wells up and spreads, bubbles come faster
    float pr = (0.15 + 0.85 * k) * (0.88 + 0.14 * vnoise(vec2(a * 3.0 + seed, uTime * 0.3)));
    float murk = fbm(q * 1.2 + uTime * 0.1);
    vec3 col = mix(vec3(0.06, 0.16, 0.02), vec3(0.4, 0.75, 0.12), murk * 0.7);
    vec2 bc = floor(q * 2.0), bf = fract(q * 2.0) - 0.5;
    float bt = fract(uTime * (0.6 + 1.6 * k) + h21(bc) * 5.0);
    col += vec3(0.75, 1.0, 0.4) * step(0.45, h21(bc + 2.0)) * smoothstep(0.04, 0.0, abs(length(bf) - bt * 0.32)) * (1.0 - bt);
    col = mix(col, vec3(0.75, 0.95, 0.4), smoothstep(pr - 0.12, pr - 0.02, r) * 0.6);
    lay(col, smoothstep(pr, pr - 0.03, r) * 0.9);
  } else if (look == 5) {
    // rift: arms of light wind in tighter and faster, a dark core opens
    float turn = uTime * (2.0 + 7.0 * k);
    float arms = 0.5 + 0.5 * sin(a * 3.0 + r * (6.0 + 10.0 * k) - turn);
    arms = smoothstep(0.45, 1.0, arms) * smoothstep(1.0, 0.2, r);
    vec3 hue = mix(vec3(0.55, 0.25, 1.0), vec3(1.0, 0.3, 0.85), 0.5 + 0.5 * sin(a + uTime));
    lay(hue * (0.8 + 0.8 * k), arms * (0.4 + 0.5 * k));
    float core = smoothstep(0.1 + 0.3 * k, 0.0, r);
    lay(vec3(0.02, 0.0, 0.05), core * 0.9);
    lay(vec3(1.0, 0.85, 1.0), smoothstep(0.02, 0.0, abs(r - (0.1 + 0.3 * k))) * k);
    vec2 gc = floor(vP * 12.0 + seed), gf = fract(vP * 12.0 + seed) - 0.5;
    lay(vec3(1.0), step(0.92, h21(gc)) * smoothstep(0.1, 0.0, length(gf)) * 0.8);
  } else if (look == 6) {
    // target: two thin rings and four ticks that turn, a sweep that counts down to the strike
    float spin = a + uTime * 0.9;
    float rings = smoothstep(0.02, 0.0, abs(r - 0.36)) + smoothstep(0.02, 0.0, abs(r - 0.68));
    float ticks = smoothstep(0.06, 0.0, abs(sin(spin * 2.0)) * r) * step(0.42, r) * step(r, 0.92);
    float sweep = step(fract((a + 3.14159) / 6.28318 - 0.25), k);
    lay(uWarn * 0.8, sweep * 0.22);
    lay(mix(uWarn, vec3(1.0), 0.35) * 1.3, clamp(rings + ticks, 0.0, 1.0) * (0.55 + 0.4 * k));
    lay(vec3(1.0, 0.9, 0.85), smoothstep(0.07, 0.03, r) * (0.5 + 0.5 * k));
  } else {
    // burn: the ground smoulders; flames lick over it, more as it nears
    float n = fbm(vec2(vP.x * 3.0 + seed, vP.y * 3.0 - uTime * 1.6));
    float flame = smoothstep(0.45 - 0.2 * k, 0.9, n) * smoothstep(1.0, 0.3, r);
    lay(vec3(0.02, 0.01, 0.0), 0.4 * smoothstep(1.0, 0.4, r));
    lay(mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.7, 0.2), n) * 1.4, flame * (0.5 + 0.5 * k));
  }
  gl_FragColor = vec4(acc.rgb / max(acc.a, 0.0001), acc.a * soft);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const MARK_FRAG = `
uniform float uBiome;
${LAYERS}void main() {
  float r = length(vP), a = atan(vP.y, vP.x), f = vI.r, seed = vI.g * 31.0;
  int look = int(vI.b * 8.0 + 0.5);
  // a splash with a ragged edge
  float edge = 0.74 + 0.18 * vnoise(vec2(a * 2.5 + seed, seed)) + 0.08 * vnoise(vec2(a * 9.0 + seed, seed * 2.0));
  if (r > edge) discard;
  float t = r / edge;
  vec2 q = vP * 3.0 + seed;
  acc = vec4(0.0);
  if (look == 0) {
    int b = int(uBiome + 0.5);
    float ch = smoothstep(1.0, 0.25, t) * (0.6 + 0.4 * fbm(q * 1.5));
    if (b == 0) {
      // burnt wet asphalt: char, a cold sheen where the rain pools in it, embers that die quickly
      lay(vec3(0.01, 0.011, 0.014), ch * 0.85);
      lay(vec3(0.16, 0.2, 0.27), smoothstep(0.6, 0.8, fbm(vec2(q.x * 0.8, q.y * 3.0))) * smoothstep(1.0, 0.5, t) * 0.25);
      vec2 ec = floor(q * 5.0), ef = fract(q * 5.0) - 0.5;
      float ember = step(0.9, h21(ec)) * smoothstep(0.22, 0.05, length(ef));
      lay(vec3(1.0, 0.4, 0.08) * 1.5, ember * smoothstep(0.7, 0.0, t) * f * f * f);
    } else if (b == 1) {
      // Ember Works: char with cracks that glow and cool
      lay(vec3(0.015, 0.008, 0.005), ch * 0.9);
      vec3 v = voro(q * 1.6);
      float seam = smoothstep(0.06, 0.0, v.y) * smoothstep(1.0, 0.2, t);
      lay(mix(vec3(0.6, 0.06, 0.0), vec3(1.0, 0.55, 0.12), f) * 1.4, seam * f * f);
    } else if (b == 2) {
      // Cryo Vault: the blast melted the frost (a dark wet middle), a star of new frost on the rim
      lay(vec3(0.05, 0.1, 0.16), ch * 0.7);
      float star = pow(abs(cos(a * 7.0 + seed)), 14.0) * smoothstep(0.35, 0.95, t);
      lay(vec3(0.85, 0.95, 1.0), (star + smoothstep(0.8, 1.0, t) * 0.5) * 0.8);
    } else if (b == 3) {
      // Toxin Marsh: a splash of mud, specks of slime that glow
      lay(vec3(0.03, 0.035, 0.012), ch * 0.85);
      vec2 sc = floor(q * 4.0), sf = fract(q * 4.0) - 0.5;
      float speck = step(0.85, h21(sc)) * smoothstep(0.3, 0.1, length(sf));
      lay(vec3(0.5, 0.85, 0.15), speck * smoothstep(0.9, 0.2, t) * (0.4 + 0.6 * f));
    } else {
      // Void Core: a violet scar, veins of light and specks like stars
      lay(vec3(0.02, 0.0, 0.04), ch * 0.85);
      vec3 v = voro(q * 1.4);
      lay(vec3(0.6, 0.3, 1.0) * 1.3, smoothstep(0.05, 0.0, v.y) * smoothstep(1.0, 0.3, t) * f);
      vec2 gc = floor(q * 6.0), gf = fract(q * 6.0) - 0.5;
      lay(vec3(1.0, 0.9, 1.0), step(0.93, h21(gc)) * smoothstep(0.18, 0.04, length(gf)) * f);
    }
  } else if (look == 1) {
    // a crack: darker plates and black seams where the ground broke, pale dust along them (the glow was the blast)
    lay(vec3(0.02), 0.35 * smoothstep(1.0, 0.4, t));
    float c = cracks(r / edge, a, seed, 1.0);
    lay(vec3(0.4, 0.38, 0.36), smoothstep(0.05, 0.4, c) * 0.25 * smoothstep(1.0, 0.5, t));
    lay(vec3(0.0), smoothstep(0.3, 0.8, c) * 0.9);
  } else if (look == 2) {
    // slag: the lava cools from orange to a black crust
    vec3 v = voro(q * 1.3);
    vec3 hot = mix(vec3(0.7, 0.08, 0.0), vec3(1.0, 0.5, 0.1), fbm(q * 2.0)) * (0.3 + 1.2 * f * f);
    float crust = smoothstep(0.04, 0.12, v.y) * (1.0 - 0.6 * f * f);
    lay(mix(hot, vec3(0.03, 0.015, 0.01), crust), 0.95 * smoothstep(1.0, 0.85, t));
  } else if (look == 3) {
    // frost: a white patch with facets that melts away
    vec3 v = voro(q * 2.0);
    vec3 col = mix(vec3(0.6, 0.8, 0.95), vec3(0.92, 0.98, 1.0), v.z) + vec3(0.3) * smoothstep(0.04, 0.0, v.y);
    lay(col, 0.75 * smoothstep(1.0, 0.7, t));
  } else if (look == 4) {
    // slime: a glossy green splash
    float n = fbm(q * 1.5);
    lay(mix(vec3(0.1, 0.25, 0.03), vec3(0.45, 0.8, 0.15), n), 0.8 * smoothstep(1.0, 0.75, t));
    lay(vec3(0.85, 1.0, 0.6), smoothstep(0.7, 0.85, n) * 0.5);
  } else {
    // rift: a scar of the tear, its swirl fading
    float arms = smoothstep(0.6, 1.0, 0.5 + 0.5 * sin(a * 3.0 + r * 10.0));
    lay(vec3(0.03, 0.0, 0.06), 0.8 * smoothstep(1.0, 0.4, t));
    lay(vec3(0.7, 0.35, 1.0) * 1.3, arms * smoothstep(1.0, 0.2, t) * f);
  }
  // the mark fades at the end of its life
  gl_FragColor = vec4(acc.rgb / max(acc.a, 0.0001), acc.a * smoothstep(0.0, 0.25, f));
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

/* 3.10.0: the marks are many and stay for seconds, so they are not drawn with MARK_FRAG on every pixel: each look (and
   the burnt mark of the biome) is painted once into an atlas, fresh and cooled, in two variants (bakeMarks), and a mark
   is two lookups that blend from fresh to cooled as it ages. Cells: (look * 2 + variant) * 2 + cooled, 6 x 4 of them,
   each a disc of radius 0.98 around (col * 2 - 5, row * 2 - 3) in the bake scene. */
const ATLAS = { cols: 6, rows: 4, cell: 128 };
const MARK_DRAW_FRAG = `
uniform sampler2D uAtlas;
vec2 cellUV(float cell, vec2 p) {
  float col = mod(cell, 6.0), row = floor(cell / 6.0);
  vec2 w = vec2(col * 2.0 - 5.0, row * 2.0 - 3.0) + p * 0.98;
  return vec2((w.x + 6.0) / 12.0, (4.0 - w.y) / 8.0);
}
void main() {
  if (length(vP) > 1.0) discard;
  float f = vI.r, look = floor(vI.b * 8.0 + 0.5), base = (look * 2.0 + step(0.5, vI.g)) * 2.0;
  vec4 c = mix(texture2D(uAtlas, cellUV(base + 1.0, vP)), texture2D(uAtlas, cellUV(base, vP)), smoothstep(0.3, 1.0, f));
  if (c.a < 0.004) discard;
  gl_FragColor = vec4(c.rgb, c.a * smoothstep(0.0, 0.25, f));
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;
function shaderMaterial(frag, uniforms) {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }, uniforms]),
    vertexShader: SURF_VERT,
    fragmentShader: SURF_LIB + frag,
    fog: true,
    transparent: true,
    depthWrite: false,
  });
}
const disc = () => {
  const geo = new CircleGeometry(1, 48);
  geo.rotateX(-Math.PI / 2);
  return geo;
};

/* ---------- models (world units) ---------- */
const MODELS = {
  // a minebot's mine: a dark puck with a dome, four studs, a ring of light that blinks
  mine: () => ({
    body: [
      meshPart(new CylinderGeometry(0.3, 0.34, 0.1, 12), 0x2a2c30, { y: 0.05 }),
      meshPart(new SphereGeometry(0.18, 10, 5, 0, TAU, 0, Math.PI / 2), 0x3a3d44, { y: 0.1 }),
      ...[0, 1, 2, 3].map((i) =>
        meshPart(new ConeGeometry(0.05, 0.12, 5), 0x5a5e66, {
          x: Math.cos(i * 1.5708 + 0.78) * 0.28,
          z: Math.sin(i * 1.5708 + 0.78) * 0.28,
          y: 0.14,
        }),
      ),
    ],
    glow: [
      meshPart(new TorusGeometry(0.26, 0.022, 4, 20), 0xffffff, { rx: Math.PI / 2, y: 0.105 }),
      meshPart(new SphereGeometry(0.06, 8, 5), 0xffffff, { y: 0.27 }),
    ],
  }),
  // a sapper's charge: three sticks bound together, a box with a light on top
  charge: () => ({
    body: [
      ...[-0.11, 0, 0.11].map((z) =>
        meshPart(new CylinderGeometry(0.06, 0.06, 0.46, 8), 0xa8452a, { z, y: 0.07, rz: Math.PI / 2 }),
      ),
      box(0x22242a, 0.08, 0.15, 0.36, { x: -0.12, y: 0.07 }),
      box(0x22242a, 0.08, 0.15, 0.36, { x: 0.12, y: 0.07 }),
      box(0x30333a, 0.16, 0.08, 0.14, { y: 0.17 }),
    ],
    glow: [box(0xffffff, 0.06, 0.04, 0.06, { y: 0.23 })],
  }),
  // a mortar shell (along +x): body, nose, fins, a glowing band
  shell: () => ({
    body: [
      meshPart(new CylinderGeometry(0.13, 0.13, 0.42, 8), 0x3a3e36, { rz: Math.PI / 2 }),
      meshPart(new ConeGeometry(0.13, 0.22, 8), 0x2a2c28, { x: 0.32, rz: -Math.PI / 2 }),
      box(0x24261f, 0.16, 0.02, 0.4, { x: -0.2 }),
      box(0x24261f, 0.16, 0.4, 0.02, { x: -0.2 }),
    ],
    glow: [meshPart(new CylinderGeometry(0.135, 0.135, 0.05, 8), 0xffffff, { x: 0.12, rz: Math.PI / 2 })],
  }),
  // an ice spike (a five-sided cone, height 1)
  spike: () => {
    const geo = new ConeGeometry(1, 1, 5);
    geo.translate(0, 0.5, 0);
    return { body: [meshPart(geo, 0xd8f4ff)] };
  },
  // enemy shots: a crystal (the Prism's shards, the weaver's), a dart (needles and homing pods), both along +x
  crystal: () => ({ glow: [meshPart(new OctahedronGeometry(1), 0xffffff, { sx: 1.9, sy: 0.7, sz: 0.7 })] }),
  dart: () => ({
    glow: [
      meshPart(new ConeGeometry(0.5, 1.6, 6), 0xffffff, { rz: -Math.PI / 2 }),
      box(0xffffff, 0.5, 0.05, 1.0, { x: -0.5 }),
    ],
  }),
  // 3.16.0: the Warden's slug (a capsule along +x with a dark band, its light from the instance), the Hive Queen's
  // spore (a ball with short thorns), the Rift Core's ring (a torus standing upright, spinning)
  slug: () => ({
    body: [meshPart(new CylinderGeometry(0.5, 0.5, 0.3, 8), 0x1a1d24, { rz: Math.PI / 2 })],
    glow: [
      meshPart(new CylinderGeometry(0.42, 0.42, 1.5, 8), 0xffffff, { rz: Math.PI / 2 }),
      meshPart(new SphereGeometry(0.42, 8, 5), 0xffffff, { x: 0.75 }),
      meshPart(new SphereGeometry(0.42, 8, 5), 0xffffff, { x: -0.75 }),
    ],
  }),
  spore: () => ({
    glow: [
      meshPart(new SphereGeometry(0.62, 8, 6), 0xffffff),
      ...[0, 1, 2, 3, 4, 5].map((i) =>
        meshPart(new ConeGeometry(0.16, 0.5, 4), 0xffffff, {
          x: Math.cos(i * 1.047) * 0.66,
          y: (i % 2 ? 0.25 : -0.25) * 0.8,
          z: Math.sin(i * 1.047) * 0.66,
          rz: -Math.cos(i * 1.047) * 1.3,
          rx: Math.sin(i * 1.047) * 1.3,
        }),
      ),
    ],
  }),
  ringshot: () => ({
    glow: [meshPart(new TorusGeometry(0.85, 0.2, 6, 16), 0xffffff), meshPart(new SphereGeometry(0.3, 6, 4), 0xffffff)],
  }),
};
const MAX = {
  zone: 64,
  mark: 90,
  mine: 24,
  charge: 16,
  shell: 24,
  spike: 160,
  crystal: 160,
  dart: 120,
  slug: 120,
  spore: 120,
  ringshot: 120,
};

class AttackView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
    this.mats = [];
    this.marks = [];
    this.spikes = [];
    this.pillars = [];
    this.zoneMat = null;
    this.markMat = null;
    // a stable seed per zone, so its cracks and its frost keep their shape while it warns
    this.seeds = new WeakMap();
  }
  add(pool, order) {
    pool.mesh.renderOrder = order;
    this.r.scene.add(pool.mesh);
    this.list.push(pool);
    return pool;
  }
  // the pools of a model (body: Lambert with vertex colours, glow: unlit, its colour from the instance)
  get(name) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name](),
      max = MAX[name],
      mk = (parts, glow) =>
        this.add(
          new this.Pool(
            mergeParts(parts.flat()),
            glow
              ? new MeshBasicMaterial({ toneMapped: false, vertexColors: true })
              : new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
            max,
          ),
          glow ? 5 : 3,
        );
    set = this.pl[name] = { body: m.body ? mk(m.body, false) : null, glow: m.glow ? mk(m.glow, true) : null };
    return set;
  }
  zones() {
    if (!this.pl.zone) {
      this.zoneMat = shaderMaterial(ZONE_FRAG, { uWarn: { value: new Color() } });
      this.mats.push(this.zoneMat);
      this.pl.zone = this.add(new this.Pool(disc(), this.zoneMat, MAX.zone), 2);
    }
    return this.pl.zone;
  }
  markPool() {
    if (!this.pl.mark) {
      this.atlas = new WebGLRenderTarget(ATLAS.cols * ATLAS.cell, ATLAS.rows * ATLAS.cell, { depthBuffer: false });
      this.atlas.texture.colorSpace = SRGBColorSpace;
      this.atlas.texture.generateMipmaps = false;
      this.atlas.texture.minFilter = LinearFilter;
      // (a render target's texture cannot go through the merge of the uniforms: it is set afterwards)
      this.markMat = shaderMaterial(MARK_DRAW_FRAG, { uAtlas: { value: null } });
      this.markMat.uniforms.uAtlas.value = this.atlas.texture;
      this.mats.push(this.markMat);
      this.pl.mark = this.add(new this.Pool(disc(), this.markMat, MAX.mark), 0);
    }
    return this.pl.mark;
  }
  /* paint every look of a mark into the atlas, with the burnt mark of the biome (index into BIOME_INDEX) */
  bakeMarks(biome) {
    const gl = this.r.renderer;
    if (!gl || !this.atlas) return;
    // 3.31.1: the painting scene is built once and kept: only the biome uniform changes, so a new biome compiles no
    // shader (the material was built and disposed for every bake, a compile at the first blast in a new biome)
    if (!this.bake) {
      const mat = shaderMaterial(MARK_FRAG, { uBiome: { value: 0 } }),
        pool = new this.Pool(disc(), mat, ATLAS.cols * ATLAS.rows),
        scene = new Scene(),
        cam = new OrthographicCamera(-6, 6, 4, -4, 0.1, 20);
      mat.blending = NoBlending;
      mat.transparent = false;
      mat.fog = false;
      scene.add(pool.mesh);
      pool.begin();
      for (let cell = 0; cell < ATLAS.cols * ATLAS.rows; cell++) {
        const look = cell >> 2,
          variant = (cell >> 1) & 1,
          cooled = cell & 1,
          col = cell % ATLAS.cols,
          row = Math.floor(cell / ATLAS.cols);
        if (look > M.rift) break;
        const idx = pool.y(col * 2 - 5, 0, row * 2 - 3, 0, 0.98);
        pool.col(idx, cooled ? 0.3 : 1, variant ? 0.75 : 0.25, look / 8);
      }
      pool.end();
      cam.position.set(0, 10, 0);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
      this.bake = { mat, scene, cam };
    }
    const { mat, scene, cam } = this.bake,
      clear = new Color(),
      alpha = gl.getClearAlpha(),
      target = gl.getRenderTarget();
    mat.uniforms.uBiome.value = biome;
    gl.getClearColor(clear);
    try {
      gl.setRenderTarget(this.atlas);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.render(scene, cam);
    } finally {
      gl.setRenderTarget(target);
      gl.setClearColor(clear, alpha);
    }
    this.baked = biome;
  }
  /* a mark on the floor (M.burn and so on); the oldest goes when there are too many */
  mark(x, z, radius, look = M.burn) {
    if (this.marks.length >= MAX.mark - 4) this.marks.shift();
    const life = MARK_LIFE[look] || 6;
    this.marks.push({ x, z, r: radius, look, life, max: life, a: Math.random() * TAU, seed: Math.random() });
  }
  biomeId() {
    return (this.r.biome && this.r.biome.id) || "yard";
  }
  update(dt, world) {
    const r = this.r,
      time = r.time;
    // a new biome starts clean: the marks of the last one stay behind
    const biome = this.biomeId();
    if (biome !== this.lastBiome) {
      this.lastBiome = biome;
      this.marks.length = 0;
      this.spikes.length = 0;
      this.pillars.length = 0;
      // 3.31.1: the marks of the new biome are painted now (behind the biome card), not at its first blast
      if (world) {
        this.markPool();
        const index = BIOME_INDEX[biome] ?? 0;
        if (this.baked !== index) this.bakeMarks(index);
      }
    }
    for (const mat of this.mats) mat.uniforms.uTime.value = time;
    this.quality = Math.min(1, r.maxParticles / 1400);
    this.drawMarks(dt);
    this.drawZones(dt, world);
    this.drawSpikes(dt);
    this.drawPillars(dt);
  }
  drawMarks(dt) {
    if (!this.marks.length) return;
    const pool = this.markPool(),
      biome = BIOME_INDEX[this.biomeId()] ?? 0;
    if (this.baked !== biome) this.bakeMarks(biome);
    let keep = 0;
    for (const mk of this.marks) {
      mk.life -= dt;
      if (mk.life <= 0) continue;
      this.marks[keep++] = mk;
      const idx = pool.y(mk.x, 0.016 + (keep % 4) * 0.001, mk.z, mk.a, mk.r);
      if (idx >= 0) pool.col(idx, mk.life / mk.max, mk.seed, mk.look / 8);
    }
    this.marks.length = keep;
  }
  /* the zones of world.hazards while they warn: the ring at the edge, the ring that fills, the surface of the look,
     the models of mines and charges, the shell or the slag in flight */
  drawZones(dt, world) {
    const r = this.r,
      time = r.time,
      warn = r.warnColor,
      biome = world.arena ? world.arena.biome.id : this.biomeId();
    if (!world.hazards.length) return;
    const pool = this.zones();
    this.zoneMat.uniforms.uWarn.value.copy(warn);
    for (const hazard of world.hazards) {
      if (hazard.done) continue;
      const k = clamp(hazard.t / hazard.delay, 0, 1),
        x = hazard.x,
        z = hazard.y,
        rr = hazard.r,
        look = lookOf(hazard.kind, hazard.src, biome);
      let seed = this.seeds.get(hazard);
      if (seed == null) this.seeds.set(hazard, (seed = Math.random()));
      // a soft dark pool under it keeps the warning readable on a pale floor (Cryo Vault)
      r.shadows.y(x, 0.03, z, 0, rr * 2.4);
      const idx = pool.y(x, 0.045, z, 0, rr);
      if (idx >= 0) pool.col(idx, k, seed, look / 8);
      const ring = r.ringPool.y(x, 0.05, z, 0, rr);
      r.ringPool.colC(ring, warn, 0.55 + Math.sin(time * 25) * 0.25 * k);
      const fill = r.ringPool.y(x, 0.048, z, 0, Math.max(0.05, rr * k));
      r.ringPool.colC(fill, warn, 0.3);
      if (r.contrast) {
        const inner = r.ringPool.y(x, 0.05, z, 0, rr * 0.55);
        r.ringPool.colC(inner, warn, 0.7);
      }
      this.zoneDetail(hazard, look, k, seed, dt, time, biome);
    }
  }
  zoneDetail(hazard, look, k, seed, dt, time, biome) {
    const r = this.r,
      x = hazard.x,
      z = hazard.y,
      rr = hazard.r,
      q = this.quality,
      chance = (rate) => Math.random() < dt * rate * q;
    // models: the mine and the charge pop out and blink faster and faster
    if (hazard.kind === "mine" || hazard.kind === "sapper") {
      const P = this.get(hazard.kind === "mine" ? "mine" : "charge"),
        pop = clamp(hazard.t / 0.12, 0, 1),
        s = 0.4 + 0.6 * pop + (k > 0.85 ? Math.sin(time * 60) * 0.04 : 0),
        yaw = seed * TAU;
      P.body.y(x, 0, z, yaw, s);
      const led = P.glow.y(x, 0, z, yaw, s),
        blink = Math.sin(time * (8 + 50 * k * k)) > 0 ? 1.4 : 0.25;
      P.glow.colC(led, r.warnColor, blink);
    }
    // in flight: a mortar shell turning along its arc, or a lump of slag (the Crucible) with a trail of embers
    if (hazard.sx != null) {
      const hx = hazard.sx + (x - hazard.sx) * k,
        hz = hazard.sy + (z - hazard.sy) * k,
        hy = 0.8 + Math.sin(Math.PI * k) * 7,
        dist = Math.hypot(x - hazard.sx, z - hazard.sy) || 1,
        pitch = Math.atan2(7 * Math.PI * Math.cos(Math.PI * k), dist),
        yaw = Math.atan2(z - hazard.sy, x - hazard.sx);
      r.shadows.y(hx, 0.025, hz, 0, 0.9 * (0.4 + 0.6 * k));
      if (look === Z.molten) {
        const flick = 0.9 + Math.sin(time * 30 + seed * 9) * 0.1,
          core = r.ebCore.y(hx, hy, hz, 0, 0.32 * flick);
        r.ebCore.col(core, 1, 0.6, 0.25);
        r.sprites.colC(r.sprites.bb(hx, hy, hz, 2, r.B), LAVA, 0.9);
        if (Math.random() < 0.6)
          r.emit(hx, hy, hz, (Math.random() - 0.5) * 1.5, -0.5, (Math.random() - 0.5) * 1.5, 0.5, 0.22, FIRE_HOT, {
            drag: 1,
            grav: 4,
            spark: true,
          });
      } else {
        const P = this.get("shell");
        P.body.yr(hx, hy, hz, yaw, 1.2, 1.2, 1.2, pitch, time * 8);
        P.glow.colC(P.glow.yr(hx, hy, hz, yaw, 1.2, 1.2, 1.2, pitch, time * 8), FIRE, 1);
        if (Math.random() < 0.5) r.emit(hx, hy, hz, 0, 0.3, 0, 0.45, 0.4, SMOKE, { drag: 1, grow: 1.4 });
      }
    }
    switch (look) {
      case Z.lavaCrack:
      case Z.molten:
        if (chance(6 + 30 * k))
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.1,
            z + (Math.random() - 0.5) * rr,
            0,
            1 + 2.5 * k,
            0,
            0.6,
            0.16,
            Math.random() < 0.5 ? LAVA : FIRE_HOT,
            { drag: 1, spark: true },
          );
        break;
      case Z.crack:
        // dust trembles out of the cracks near the end
        if (k > 0.5 && chance(20 * k)) {
          const a = Math.random() * TAU,
            d = Math.random() * rr * k;
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 0.8, 0, 0.5, 0.25, DUST[biome] || DUST.yard, {
            drag: 2,
            grow: 1,
          });
        }
        break;
      case Z.frost:
        if (chance(12 + 20 * k)) {
          const a = Math.random() * TAU,
            d = rr * (1 - k * Math.random());
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 0.4, 0, 0.7, 0.14, WHITE, {
            spark: true,
            drag: 0,
          });
        }
        break;
      case Z.acid:
        if (chance(8 + 20 * k)) {
          const a = Math.random() * TAU,
            d = Math.random() * rr * (0.2 + 0.8 * k);
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 1 + k, 0, 0.5, 0.16, ACID_LITE, { drag: 2 });
        }
        break;
      case Z.rift:
        // motes fall into the tear
        if (chance(18 * k + 4)) {
          const a = Math.random() * TAU,
            d = rr * (0.8 + Math.random() * 0.3),
            life = 0.5;
          r.emit(
            x + Math.cos(a) * d,
            0.2 + Math.random() * 0.6,
            z + Math.sin(a) * d,
            (-Math.cos(a) * d) / life,
            0,
            (-Math.sin(a) * d) / life,
            life,
            0.18,
            Math.random() < 0.3 ? RIFT_PINK : RIFT,
            { drag: 0 },
          );
        }
        break;
      case Z.burn:
        if (chance(8 + 14 * k))
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.15,
            z + (Math.random() - 0.5) * rr,
            0,
            1.4,
            0,
            0.45,
            0.25,
            Math.random() < 0.5 ? FIRE : FIRE_HOT,
            { drag: 1, grow: 0.6 },
          );
        break;
    }
  }
  /* ice spikes that burst out of the floor and shatter */
  spikeBurst(x, z, radius) {
    const n = Math.round(clamp(radius * 4, 6, 18)),
      list = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.4,
        d = radius * (i % 3 === 0 ? 0.25 + Math.random() * 0.3 : 0.6 + Math.random() * 0.35);
      list.push({
        dx: Math.cos(a) * d,
        dz: Math.sin(a) * d,
        a,
        h: (0.8 + Math.random() * 0.9) * Math.min(1.6, 0.55 + radius * 0.3),
        w: 0.12 + Math.random() * 0.1,
        lean: 0.15 + Math.random() * 0.35,
        delay: Math.random() * 0.06,
      });
    }
    if (this.spikes.length > 12) this.spikes.shift();
    this.spikes.push({ x, z, t: 0, list, shat: false });
  }
  drawSpikes(dt) {
    if (!this.spikes.length) return;
    const P = this.get("spike");
    let keep = 0;
    for (const burst of this.spikes) {
      burst.t += dt;
      if (burst.t > 1.1) continue;
      this.spikes[keep++] = burst;
      if (!burst.shat && burst.t > 0.5) {
        burst.shat = true;
        this.r.debrisBurst(burst.x, burst.z, 0.6, 10, ICE, 0.12, 5);
        this.r.burst(burst.x, burst.z, 0.6, 12, 5, WHITE, 0.45, 0.18, { spark: true, drag: 3 });
      }
      for (const s of burst.list) {
        const t = burst.t - s.delay;
        let h = 0;
        if (t < 0) continue;
        if (t < 0.08) h = t / 0.08;
        else if (t < 0.5) h = 1 - 0.1 * ((t - 0.08) / 0.42);
        else h = Math.max(0, 0.9 * (1 - (t - 0.5) / 0.4));
        if (h <= 0.01) continue;
        P.body.yr(burst.x + s.dx, 0, burst.z + s.dz, s.a, s.w, s.h * h, s.w, -s.lean, 0);
      }
    }
    this.spikes.length = keep;
  }
  /* a short pillar of fire or a bolt of light */
  pillar(x, z, w, h, color, life) {
    if (this.pillars.length > 40) this.pillars.shift();
    this.pillars.push({ x, z, w, h, col: color, t: 0, life });
  }
  drawPillars(dt) {
    let keep = 0;
    const r = this.r;
    for (const p of this.pillars) {
      p.t += dt;
      if (p.t >= p.life) continue;
      this.pillars[keep++] = p;
      const f = p.t / p.life,
        h = p.h * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.4 + 0.1)), 0.6);
      r.columns.colC(
        r.columns.y(p.x, 0, p.z, 0, p.w * (1 - f * 0.5), Math.max(0.05, h), p.w * (1 - f * 0.5)),
        p.col,
        1 - f,
      );
    }
    this.pillars.length = keep;
  }
  /* the blast of an attack zone (the "boom" event of its kind); false: not an attack of enemies or bosses */
  impact(ev, world, shakeK) {
    const r = this.r,
      x = ev.x,
      z = ev.y,
      rr = ev.r,
      biome = world && world.arena ? world.arena.biome.id : this.biomeId(),
      dust = DUST[biome] || DUST.yard,
      kind = ev.kind,
      look = kind === "bomber" ? Z.target : lookOf(kind, ev.src, biome);
    if (
      ![
        "stomp",
        "drill",
        "slag",
        "rain",
        "mortar",
        "frost",
        "glacier",
        "mine",
        "sapper",
        "fire",
        "volatile",
        "bomber",
      ].includes(kind)
    )
      return false;
    const shake = (amount) => r.addShake(amount * shakeK);
    switch (look) {
      case Z.crack:
      case Z.lavaCrack: {
        // the ground breaks: a white shockwave, dust thrown along the floor, lumps of it in the air
        r.ring(x, z, rr * 0.3, rr * 1.1, WHITE, 0.3);
        r.ring(x, z, rr * 0.2, rr * 1.4, dust, 0.5, 0.1);
        const n = Math.round(clamp(rr * 7, 8, 28));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + Math.random() * 0.3,
            s = 3 + rr * 2.2;
          r.emit(
            x + Math.cos(a) * rr * 0.4,
            0.25,
            z + Math.sin(a) * rr * 0.4,
            Math.cos(a) * s,
            0.6,
            Math.sin(a) * s,
            0.6,
            0.45,
            dust,
            {
              drag: 3,
              grow: 1.6,
            },
          );
        }
        r.debrisBurst(x, z, 0.3, Math.round(clamp(rr * 3, 4, 14)), dust.clone().multiplyScalar(0.6), 0.16, 4 + rr);
        if (look === Z.lavaCrack) {
          r.burst(x, z, 0.3, Math.round(8 + rr * 4), 4 + rr, LAVA_HOT, 0.6, 0.2, {
            up: 6,
            grav: 9,
            spark: true,
            drag: 1,
          });
          r.flash(x, z, rr * 2, 1.1, LAVA, 4);
        } else r.flash(x, z, rr * 1.4, 0.6, r.warnColor, 6);
        this.mark(x, z, rr * 1.1, M.crack);
        shake(kind === "drill" ? 0.1 : 0.25);
        break;
      }
      case Z.molten: {
        // a pillar of fire, lava thrown up, a puddle of slag that cools
        this.pillar(x, z, rr * 0.45, 2.5 + rr * 1.6, LAVA, 0.5);
        r.burst(x, z, 0.3, Math.round(10 + rr * 6), 3 + rr * 1.5, LAVA, 0.8, 0.45, { up: 7, grav: 9, drag: 1.5 });
        r.burst(x, z, 0.3, 8, 3, LAVA_HOT, 0.5, 0.3, { up: 9, spark: true });
        r.ring(x, z, rr * 0.3, rr * 1.2, LAVA, 0.35);
        r.flash(x, z, rr * 2.6, 1.2, LAVA, 3.5);
        this.mark(x, z, rr * 0.95, M.slag);
        shake(kind === "mortar" ? 0.2 : 0.12);
        break;
      }
      case Z.frost: {
        // ice spikes burst up and shatter; frost stays for a moment
        this.spikeBurst(x, z, rr);
        r.ring(x, z, rr * 0.3, rr * 1.15, ICE, 0.4);
        r.burst(x, z, 0.3, Math.round(10 + rr * 4), rr * 2, WHITE, 0.6, 0.22, { spark: true, up: 3 });
        r.flash(x, z, rr * 1.8, 0.9, ICE, 4);
        this.mark(x, z, rr * 1.05, M.frost);
        shake(0.1);
        break;
      }
      case Z.acid: {
        // a splash of acid: drops thrown up that fall back, the pool of the plague stays (world.arena.acid)
        r.burst(x, z, 0.3, Math.round(14 + rr * 6), 2.5 + rr, ACID, 0.8, 0.35, { up: 6, grav: 12, drag: 1 });
        r.burst(x, z, 0.3, 8, 2, ACID_LITE, 0.5, 0.2, { up: 4, spark: true, grav: 8 });
        r.ring(x, z, rr * 0.3, rr * 1.15, ACID, 0.35);
        r.flash(x, z, rr * 1.8, 0.8, ACID, 4);
        this.mark(x, z, rr * 0.9, M.slime);
        shake(0.12);
        break;
      }
      case Z.rift: {
        // a bolt of light out of the sky into the tear
        this.pillar(x, z, rr * 0.22, 11, RIFT, 0.35);
        this.pillar(x, z, rr * 0.1, 12, WHITE, 0.2);
        r.burst(x, z, 0.4, Math.round(12 + rr * 5), 4 + rr * 2, RIFT, 0.5, 0.35, { spark: true });
        r.burst(x, z, 0.4, 6, 3, RIFT_PINK, 0.5, 0.3, { up: 5 });
        r.ring(x, z, rr * 0.2, rr * 1.2, RIFT, 0.35);
        r.flash(x, z, rr * 2.4, 1.3, RIFT, 3.5);
        this.mark(x, z, rr * 0.9, M.rift);
        shake(0.2);
        break;
      }
      case Z.burn: {
        const vol = kind === "volatile";
        r.burst(x, z, 0.3, vol ? 22 : 8, vol ? rr * 3 : 2.5, vol ? FIRE : FIRE_HOT, 0.5, vol ? 0.5 : 0.35, {
          up: 3,
          grow: 0.8,
        });
        if (vol) {
          r.ring(x, z, rr * 0.3, rr * 1.1, FIRE, 0.3);
          r.burst(x, z, 0.4, 10, 7, WHITE, 0.3, 0.2, { spark: true, drag: 4 });
        }
        r.flash(x, z, rr * 1.8, vol ? 1.1 : 0.6, FIRE, 5);
        this.mark(x, z, rr * (vol ? 0.8 : 0.6), M.burn);
        shake(vol ? 0.12 : 0.04);
        break;
      }
      default: {
        // an explosion: a fireball, sparks, smoke that rises, lumps, a burnt mark of the place
        r.burst(x, z, 0.5, Math.round(8 + rr * 5), rr * 4, FIRE, 0.45, 0.5 + rr * 0.12);
        r.burst(x, z, 0.5, 8, rr * 5, FIRE_HOT, 0.3, 0.2, { spark: true, drag: 4 });
        r.emit(x, 0.6, z, 0, 0, 0, 0.15, rr * 2.2, FIRE_HOT, { drag: 0 });
        for (let i = 0; i < 4; i++)
          r.emit(x + (Math.random() - 0.5) * rr, 0.6, z + (Math.random() - 0.5) * rr, 0, 1.2, 0, 1, rr * 0.6, SMOKE, {
            drag: 1,
            grow: 1.5,
          });
        r.debrisBurst(x, z, 0.3, 5, dust.clone().multiplyScalar(0.5), 0.12, 5);
        r.ring(x, z, rr * 0.3, rr, FIRE, 0.3);
        r.flash(x, z, rr * 1.6, 1.1, FIRE, 4.5);
        this.mark(x, z, rr * 0.75, M.burn);
        shake(kind === "mortar" ? 0.25 : 0.1);
      }
    }
    return true;
  }
  /* the shots of enemies and bosses, each kind with a shape of its own */
  shots(world) {
    const r = this.r,
      time = r.time,
      basis = r.B;
    for (const shot of world.eb) {
      const kind = shot.kind,
        color = SHOT[kind] || SHOT.orb,
        angle = Math.atan2(shot.vy, shot.vx);
      switch (kind) {
        case "fast":
        case "turret": {
          // a tracer; the turret's is heavier and throws sparks
          const heavy = kind === "turret",
            core = r.ebCore.y(
              shot.x,
              0.75,
              shot.y,
              angle,
              shot.r * (heavy ? 4 : 5),
              shot.r * (heavy ? 1.1 : 0.8),
              shot.r * (heavy ? 1.1 : 0.8),
            );
          r.ebCore.col(core, 1, 0.75, 0.75);
          if (heavy && Math.random() < 0.3)
            r.emit(shot.x, 0.75, shot.y, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2, 0.2, 0.2, color, {
              spark: true,
            });
          break;
        }
        case "shard":
        case "weaver": {
          // a crystal that spins along its path (the Prism's ice, the weaver's rift shards)
          const P = this.get("crystal"),
            s = shot.r * (kind === "shard" ? 1.5 : 1.2),
            idx = P.glow.yr(shot.x, 0.75, shot.y, angle, s, s, s, 0, time * 9 + shot.x);
          P.glow.col(idx, 0.6 + color.r * 0.5, 0.6 + color.g * 0.5, 0.6 + color.b * 0.5);
          break;
        }
        case "drone":
        case "carrier": {
          // a needle or a homing pod: a dart along its path with a short trail
          const P = this.get("dart"),
            s = shot.r * (kind === "carrier" ? 1.6 : 1.2),
            idx = P.glow.y(shot.x, 0.75, shot.y, angle, s);
          P.glow.col(idx, 0.6 + color.r * 0.5, 0.6 + color.g * 0.5, 0.6 + color.b * 0.5);
          if (Math.random() < 0.5)
            r.emit(shot.x - shot.vx * 0.02, 0.75, shot.y - shot.vy * 0.02, 0, 0, 0, 0.18, shot.r * 2.2, color, {
              drag: 0,
            });
          break;
        }
        case "slag": {
          // a lump of molten slag that flickers and drips embers
          const flick = 1 + Math.sin(time * 26 + shot.x * 3) * 0.1,
            core = r.ebCore.y(shot.x, 0.75, shot.y, angle, shot.r * 1.05 * flick, shot.r * 0.9, shot.r * 0.9);
          r.ebCore.col(core, 1, 0.62, 0.3);
          if (Math.random() < 0.4)
            r.emit(
              shot.x,
              0.7,
              shot.y,
              (Math.random() - 0.5) * 1.2,
              0.2,
              (Math.random() - 0.5) * 1.2,
              0.4,
              0.18,
              FIRE_HOT,
              {
                grav: 5,
                spark: true,
              },
            );
          break;
        }
        case "siren": {
          // the Warden's slug: it flashes red and blue like the lights of a patrol car (each slug on its own beat)
          const P = this.get("slug"),
            blue = Math.sin(time * 18 + (shot.x + shot.y) * 0.7) > 0,
            light = blue ? SIREN_BLUE : color,
            s = shot.r * 0.9;
          P.body.y(shot.x, 0.75, shot.y, angle, s);
          P.glow.col(
            P.glow.y(shot.x, 0.75, shot.y, angle, s),
            0.55 + light.r * 0.6,
            0.55 + light.g * 0.6,
            0.55 + light.b * 0.6,
          );
          r.sprites.colC(r.sprites.bb(shot.x, 0.75, shot.y, shot.r * 7, basis), light, 0.95);
          continue;
        }
        case "spore": {
          // the Hive Queen's spore: a thorny ball that wobbles and drips toxic motes
          const P = this.get("spore"),
            wob = 1 + Math.sin(time * 16 + shot.x * 2) * 0.12,
            s = shot.r * 1.1;
          P.glow.col(
            P.glow.yr(shot.x, 0.75, shot.y, time * 3 + shot.y, s * wob, s / wob, s * wob, time * 2, 0),
            0.55 + color.r * 0.5,
            0.6 + color.g * 0.45,
            0.4 + color.b * 0.4,
          );
          if (Math.random() < 0.25) r.emit(shot.x, 0.7, shot.y, 0, -0.4, 0, 0.5, 0.14, ACID_LITE, { grav: 3, drag: 1 });
          break;
        }
        case "riftorb": {
          // the Rift Core's ring: an upright violet ring that spins around a bright core, a cyan rim of light
          const P = this.get("ringshot"),
            s = shot.r * 0.95;
          P.glow.col(
            P.glow.yr(shot.x, 0.8, shot.y, angle + Math.PI / 2, s, s, s, 0, time * 7 + shot.x),
            0.6 + color.r * 0.5,
            0.55 + color.g * 0.5,
            0.7 + color.b * 0.3,
          );
          r.sprites.colC(r.sprites.bb(shot.x, 0.8, shot.y, shot.r * 4, basis), RIFT_RIM_SHOT, 0.5);
          break;
        }
        default: {
          const pulse = 1 + Math.sin(time * 14 + shot.x) * 0.08,
            core = r.ebCore.y(shot.x, 0.75, shot.y, 0, shot.r * 0.85 * pulse);
          r.ebCore.col(core, 1, 0.82 + color.g * 0.2, 0.9 + color.b * 0.1);
        }
      }
      const halo = r.sprites.bb(shot.x, 0.75, shot.y, shot.r * 7.5, basis);
      r.sprites.colC(halo, color, 0.95);
    }
  }
}

export { AttackView, lookOf, Z as ATTACK_LOOK, M as MARK_LOOK };
