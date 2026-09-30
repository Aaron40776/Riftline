// Biome detail layer (2.9.0): clutter, backdrop and ground decals for the five biomes.
// Everything a biome adds here is baked into ONE lit mesh and ONE unlit (glow) mesh, so a biome costs
// two draw calls however many props it has. Placement comes from the arena seed (rng), never from
// Math.random. Inside the arena only flat or low things are placed (the drone flies over them, nothing
// blocks a hazard or a telegraph) and never on the start area; tall props stand outside the border.

import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { meshPart, mergeParts, box, ball, bar, pipe, spike } from "./models.js";

const PI = Math.PI,
  TAU = Math.PI * 2,
  START = { x: 0, z: 2, r: 5.8 }, // the start area (World spawn zone plus a margin) stays free
  tmpM = new Matrix4(),
  tmpQ = new Quaternion(),
  tmpP = new Vector3(),
  tmpS = new Vector3(),
  UP = new Vector3(0, 1, 0);

const dim = (hex, k) => new Color(hex).multiplyScalar(k).getHex();
// primitives that stand on y (base height) instead of being centred
const cyl = (c, r0, r1, h, seg, x, y, z, ex = {}) =>
    meshPart(new CylinderGeometry(r1, r0, h, seg), c, { x, y: y + h / 2, z, ...ex }),
  cone = (c, r, h, seg, x, y, z, ex = {}) => meshPart(new ConeGeometry(r, h, seg), c, { x, y: y + h / 2, z, ...ex }),
  disc = (c, r, x, y, z, seg = 12, ex = {}) => meshPart(new CylinderGeometry(r, r, 0.02, seg), c, { x, y, z, ...ex }),
  rock = (c, r, x, y, z, ex = {}) => meshPart(new DodecahedronGeometry(r, 0), c, { x, y, z, ...ex }),
  gem = (c, r, x, y, z, ex = {}) => meshPart(new OctahedronGeometry(r), c, { x, y, z, ...ex }),
  ring = (c, r, tube, x, y, z, ex = {}) =>
    meshPart(new TorusGeometry(r, tube, 3, 14), c, { x, y, z, rx: PI / 2, ...ex });

const list = () => ({ body: [], glow: [] });
// moves the parts of a prop to (x, y, z), turned by ry and scaled by s, and adds them to `into`
function put(into, prop, x, y, z, ry = 0, s = 1) {
  tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromAxisAngle(UP, ry), tmpS.set(s, s, s));
  for (const k of ["body", "glow"])
    for (const g of prop[k]) {
      g.applyMatrix4(tmpM);
      into[k].push(g);
    }
}
const faceIn = (nx, nz) => Math.atan2(-nx, -nz);

// A point outside the border, d metres beyond it (side 0..3), with the outward normal.
function outside(rng, W, H, dmin, dmax) {
  const side = rng.int(0, 3),
    d = rng.range(dmin, dmax),
    t = rng.range(-1, 1);
  if (side === 0) return { x: t * (W + d * 0.5), z: -(H + d), nx: 0, nz: -1, d };
  if (side === 1) return { x: t * (W + d * 0.5), z: H + d, nx: 0, nz: 1, d };
  if (side === 2) return { x: -(W + d), z: t * (H + d * 0.5), nx: -1, nz: 0, d };
  return { x: W + d, z: t * (H + d * 0.5), nx: 1, nz: 0, d };
}
// n spaced points outside the border
function outsideSpots(rng, W, H, n, dmin, dmax, gap) {
  const out = [];
  for (let tries = 0; tries < n * 14 && out.length < n; tries++) {
    const p = outside(rng, W, H, dmin, dmax);
    if (out.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= gap)) out.push(p);
  }
  return out;
}
const hitsObstacle = (obs, x, z, pad) =>
  obs.some((o) =>
    o.t === "c"
      ? Math.hypot(x - o.x, z - o.y) < o.r + pad
      : Math.abs(x - o.x) < o.w + pad && Math.abs(z - o.y) < o.h + pad,
  );
// n spaced points inside the arena: off the start area, off the props, `margin` from the border
function scatter(rng, W, H, obs, n, { margin = 1.2, gap = 1.3, pad = 0.5, near = 0 } = {}) {
  const out = [];
  for (let tries = 0; tries < n * 16 && out.length < n; tries++) {
    const x = rng.range(-W + margin, W - margin),
      z = rng.range(-H + margin, H - margin);
    if (Math.hypot(x - START.x, z - START.z) < START.r) continue;
    // near > 0: only within `near` metres of the border (cables and pipes along the walls)
    if (near && Math.min(W - Math.abs(x), H - Math.abs(z)) > near) continue;
    if (hitsObstacle(obs, x, z, pad)) continue;
    if (out.some((q) => Math.hypot(q.x - x, q.z - z) < gap)) continue;
    out.push({ x, z });
  }
  return out;
}
// A straight run along a wall, `off` metres inside it: [ax, az, bx, bz]
function wallRun(rng, W, H, off, lenMin, lenMax) {
  const side = rng.int(0, 3),
    len = rng.range(lenMin, lenMax);
  if (side < 2) {
    const z = (side ? 1 : -1) * (H - off),
      x0 = rng.range(-W + 1, W - 1 - len);
    return [x0, z, x0 + len, z];
  }
  const x = (side === 2 ? -1 : 1) * (W - off),
    z0 = rng.range(-H + 1, H - 1 - len);
  return [x, z0, x, z0 + len];
}
// a zigzag crack of thin flat bars
function crack(into, color, x, z, rng, segs, step, w = 0.05) {
  let a = rng.range(0, TAU),
    px = x,
    pz = z;
  for (let i = 0; i < segs; i++) {
    a += rng.range(-0.9, 0.9);
    const nx = px + Math.cos(a) * step * rng.range(0.6, 1.2),
      nz = pz + Math.sin(a) * step * rng.range(0.6, 1.2);
    into.glow.push(bar(color, w, [px, 0.022, pz], [nx, 0.022, nz], 0.012));
    if (i % 3 === 1) {
      const b = a + rng.pick([-1, 1]) * rng.range(0.6, 1.1);
      into.glow.push(
        bar(
          color,
          w * 0.8,
          [nx, 0.022, nz],
          [nx + Math.cos(b) * step * 0.6, 0.022, nz + Math.sin(b) * step * 0.6],
          0.012,
        ),
      );
    }
    px = nx;
    pz = nz;
  }
}

/* ---- Neon Yard: a night-time industrial yard behind a fence. Backdrop of lit towers, containers,
   server racks and floodlights outside; cables, grates, chevrons and manholes on the ground. ---- */
function yardDetail(biome, W, H, obs, rng) {
  const out = list(),
    cyan = biome.grid,
    mag = biome.accent,
    slate = [0x22384a, 0x2b4458, 0x1a2c3a, 0x33364f],
    lamp = [cyan, cyan, mag, 0x9fd8ff, 0xffe0a0];
  // skyline of lit towers
  for (const p of outsideSpots(rng, W, H, 28, 3.2, 15, 3.4)) {
    const t = list(),
      w = rng.range(1.6, 3.4),
      dp = rng.range(1.6, 3.2),
      h = rng.range(3, 11) * (p.d > 9 ? 1.25 : 1),
      base = rng.pick(slate);
    t.body.push(box(base, w, h, dp, { y: h / 2 }), box(dim(base, 0.6), w * 0.82, 0.3, dp * 0.82, { y: h + 0.15 }));
    if (rng.chance(0.5)) t.body.push(spike(0x55606a, 0.03, 3, [0, h + 0.3, 0], [0, h + rng.range(1, 2.4), 0]));
    if (rng.chance(0.6))
      t.glow.push(box(rng.pick([cyan, mag]), w + 0.08, 0.1, dp + 0.08, { y: rng.range(h * 0.3, h * 0.9) }));
    const rows = Math.min(5, Math.floor(h / 1.4));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < 2; c++)
        if (rng.chance(0.55)) {
          const col = dim(rng.pick(lamp), rng.range(0.5, 0.9));
          t.glow.push(
            box(col, w * rng.range(0.25, 0.42), 0.22, 0.04, {
              x: (c ? 1 : -1) * w * 0.24,
              y: 1 + r * 1.3,
              z: dp / 2 + 0.02,
            }),
          );
        }
    put(out, t, p.x, 0, p.z, faceIn(p.nx, p.nz) + rng.range(-0.2, 0.2));
  }
  // shipping containers, sometimes stacked
  for (const p of outsideSpots(rng, W, H, 14, 1.8, 4.6, 3.6)) {
    const t = list(),
      col = rng.pick([0x3a4a66, 0x5a3a4a, 0x2e5a5a, 0x5a4a2e]),
      stack = rng.chance(0.4) ? 2 : 1;
    for (let k = 0; k < stack; k++) {
      t.body.push(box(k ? dim(col, 1.25) : col, 2.6, 1.2, 1.2, { y: 0.6 + k * 1.22, ry: k * 0.12 }));
      for (let r = -4; r <= 4; r++)
        t.body.push(box(dim(col, 0.7), 0.06, 1.24, 1.24, { x: r * 0.29, y: 0.6 + k * 1.22, ry: k * 0.12 }));
    }
    t.glow.push(box(rng.pick([cyan, mag]), 2.4, 0.05, 0.04, { y: 1.22 * stack, z: 0.62 }));
    put(out, t, p.x, 0, p.z, faceIn(p.nx, p.nz) + (rng.chance(0.5) ? 0 : PI / 2));
  }
  // server racks with blinking LEDs
  for (const p of outsideSpots(rng, W, H, 10, 1.3, 3.2, 2.4)) {
    const t = list();
    t.body.push(box(0x161f2a, 0.9, 1.7, 0.6, { y: 0.85 }), box(0x0e151d, 0.94, 0.08, 0.64, { y: 1.72 }));
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 4; c++)
        if (rng.chance(0.7))
          t.glow.push(
            box(dim(rng.pick([cyan, 0x40ff90, mag]), 0.8), 0.07, 0.05, 0.03, {
              x: -0.3 + c * 0.2,
              y: 0.25 + r * 0.26,
              z: 0.31,
            }),
          );
    put(out, t, p.x, 0, p.z, faceIn(p.nx, p.nz));
  }
  // fence posts with neon caps, floodlights on tall poles
  const postWalls = [
    [0, -H - 0.25, 1, 0],
    [0, H + 0.25, 1, 0],
    [-W - 0.25, 0, 0, 1],
    [W + 0.25, 0, 0, 1],
  ];
  postWalls.forEach(([cx, cz, ax, az]) => {
    const len = ax ? W : H,
      n = Math.round((len * 2) / 2.2);
    for (let i = 0; i <= n; i++) {
      const s = -len + (i / n) * len * 2,
        x = cx + ax * s,
        z = cz + az * s;
      out.body.push(
        box(0x2b4458, 0.16, 0.6, 0.16, { x, y: 1.0, z }),
        box(0x16232e, 0.22, 0.1, 0.22, { x, y: 0.72, z }),
      );
      out.glow.push(box(i % 3 ? cyan : mag, 0.2, 0.06, 0.2, { x, y: 1.33, z }));
    }
    for (let k = 0; k < 2; k++) {
      const s = rng.range(-len * 0.8, len * 0.8),
        x = cx + ax * s + (az ? (cx < 0 ? -0.6 : 0.6) : 0),
        z = cz + az * s + (ax ? (cz < 0 ? -0.6 : 0.6) : 0),
        ix = az ? (cx < 0 ? 1 : -1) : 0,
        iz = ax ? (cz < 0 ? 1 : -1) : 0;
      out.body.push(
        pipe(0x33475a, 0.07, 0.05, 6, [x, 0, z], [x, 3.2, z]),
        bar(0x33475a, 0.05, [x, 3.15, z], [x + ix * 0.6, 3.3, z + iz * 0.6]),
      );
      out.body.push(box(0x1a2530, az ? 0.3 : 0.5, 0.1, az ? 0.5 : 0.3, { x: x + ix * 0.7, y: 3.32, z: z + iz * 0.7 }));
      out.glow.push(
        box(0xdff4ff, az ? 0.22 : 0.42, 0.04, az ? 0.42 : 0.22, { x: x + ix * 0.7, y: 3.26, z: z + iz * 0.7 }),
      );
    }
  });
  // ground: chevrons pointing at the centre
  for (const p of scatter(rng, W, H, obs, 12, { margin: 2, gap: 3 })) {
    const d = Math.hypot(p.x, p.z) || 1,
      ux = -p.x / d,
      uz = -p.z / d,
      vx = -uz,
      vz = ux,
      col = dim(cyan, 0.5),
      tip = [p.x + ux * 0.45, 0.02, p.z + uz * 0.45];
    out.glow.push(
      bar(col, 0.12, tip, [tip[0] - ux * 0.45 + vx * 0.5, 0.02, tip[2] - uz * 0.45 + vz * 0.5], 0.012),
      bar(col, 0.12, tip, [tip[0] - ux * 0.45 - vx * 0.5, 0.02, tip[2] - uz * 0.45 - vz * 0.5], 0.012),
    );
  }
  // vent grates and manholes
  for (const p of scatter(rng, W, H, obs, 9, { gap: 3 })) {
    const t = list();
    t.body.push(box(0x0d151c, 0.95, 0.03, 0.62, { y: 0.015 }));
    for (let i = -2; i <= 2; i++) t.glow.push(box(dim(mag, 0.45), 0.72, 0.012, 0.03, { y: 0.034, z: i * 0.11 }));
    put(out, t, p.x, 0, p.z, rng.pick([0, PI / 2]));
  }
  for (const p of scatter(rng, W, H, obs, 7, { gap: 3 })) {
    out.body.push(disc(0x162330, 0.36, p.x, 0.015, p.z, 14));
    out.glow.push(ring(dim(cyan, 0.6), 0.36, 0.014, p.x, 0.035, p.z), ring(dim(mag, 0.5), 0.2, 0.012, p.x, 0.035, p.z));
  }
  // cable runs along the walls, clamped every metre, a pulse of light on them
  for (let k = 0; k < 7; k++) {
    const [ax, az, bx, bz] = wallRun(rng, W, H, rng.range(0.7, 1.6), 4, 11),
      len = Math.hypot(bx - ax, bz - az),
      n = Math.max(2, Math.round(len)),
      jitter = rng.range(-0.25, 0.25);
    out.body.push(bar(0x0a1016, 0.07, [ax, 0.045, az + jitter], [bx, 0.045, bz + jitter], 0.07));
    for (let i = 0; i <= n; i++) {
      const f = i / n,
        x = ax + (bx - ax) * f,
        z = az + (bz - az) * f + jitter;
      out.body.push(box(0x2b4458, 0.14, 0.1, 0.14, { x, y: 0.05, z }));
      if (i % 2) out.glow.push(box(dim(i % 4 === 1 ? cyan : mag, 0.7), 0.16, 0.03, 0.05, { x, y: 0.1, z }));
    }
  }
  // litter: small crates and plates
  for (const p of scatter(rng, W, H, obs, 18, { gap: 1.2 })) {
    const s = rng.range(0.14, 0.26);
    out.body.push(
      box(rng.pick(slate), s, s * rng.range(0.7, 1.2), s, { x: p.x, y: s / 2, z: p.z, ry: rng.range(0, PI) }),
    );
    if (rng.chance(0.3)) out.glow.push(box(dim(cyan, 0.6), s * 0.8, 0.02, 0.03, { x: p.x, y: s + 0.012, z: p.z }));
  }
  return out;
}

/* ---- Ember Works: a foundry. Smokestacks, furnaces, pipe racks, cranes, scrap and barrels outside;
   soot, plates, gears, gratings, pipes and debris on the floor (dim: the lava seams stay the light). ---- */
function worksDetail(biome, W, H, obs, rng) {
  const out = list(),
    hot = biome.grid,
    yellow = biome.accent,
    steel = [0x5e4d40, 0x6b5a4c, 0x4d3f35, 0x7a685a],
    rust = [0x8a4a2a, 0x9a5a34, 0x703f24];
  // smokestacks with glowing bands
  for (const p of outsideSpots(rng, W, H, 8, 3, 13, 4.4)) {
    const t = list(),
      r = rng.range(0.6, 1.1),
      h = rng.range(6, 14);
    t.body.push(
      cyl(pick3(rng, steel), r, r * 0.65, h, 10, 0, 0, 0),
      cyl(0x1c1612, r * 0.78, r * 0.78, 0.35, 10, 0, h, 0),
    );
    t.body.push(cyl(0x241d18, r * 1.25, r * 1.1, 0.8, 10, 0, 0, 0));
    for (const f of [0.45, 0.62, 0.78])
      t.glow.push(
        cyl(
          dim(hot, rng.range(0.55, 0.9)),
          r * (1 - 0.35 * f) + 0.03,
          r * (1 - 0.35 * f) + 0.03,
          0.14,
          10,
          0,
          h * f,
          0,
        ),
      );
    t.glow.push(disc(yellow, r * 0.58, 0, h + 0.3, 0, 10));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // furnace blocks with a glowing mouth and a small chimney
  for (const p of outsideSpots(rng, W, H, 9, 2, 6, 4.4)) {
    const t = list(),
      w = rng.range(2.4, 4),
      h = rng.range(1.6, 3.4),
      dp = rng.range(1.8, 3);
    t.body.push(
      box(pick3(rng, steel), w, h, dp, { y: h / 2 }),
      box(0x1c1612, w + 0.2, 0.18, dp + 0.2, { y: h + 0.09 }),
    );
    t.body.push(cyl(0x2b2420, 0.3, 0.24, rng.range(1, 2), 8, rng.range(-0.6, 0.6) * w * 0.5, h + 0.18, 0));
    t.glow.push(
      box(hot, w * 0.34, 0.34, 0.05, { x: -w * 0.18, y: h * 0.32, z: dp / 2 + 0.03 }),
      box(yellow, w * 0.2, 0.12, 0.05, { x: -w * 0.18, y: h * 0.32, z: dp / 2 + 0.04 }),
    );
    for (let i = 0; i < 3; i++)
      t.glow.push(box(dim(hot, 0.7), 0.06, h * 0.5, 0.04, { x: w * 0.22 + i * 0.22, y: h * 0.55, z: dp / 2 + 0.03 }));
    t.body.push(pipe(0x55453a, 0.12, 0.12, 8, [w / 2, h * 0.7, 0], [w / 2 + 1.4, h * 0.7, 0.4]));
    put(out, t, p.x, 0, p.z, faceIn(p.nx, p.nz) + rng.range(-0.15, 0.15));
  }
  // pipe racks along the walls: horizontal pipes on posts
  for (let side = 0; side < 4; side++)
    for (let k = 0; k < 2; k++) {
      const len = rng.range(6, 12),
        half = side < 2 ? W : H,
        s0 = rng.range(-half, half - len),
        d = 1.0 + k * 0.9,
        y = 1.4 + k * 0.5,
        pt = (s, yy) => (side < 2 ? [s, yy, (side ? 1 : -1) * (H + d)] : [(side === 2 ? -1 : 1) * (W + d), yy, s]);
      for (const off of [0, 0.3]) {
        const a = pt(s0, y + off),
          b = pt(s0 + len, y + off);
        out.body.push(pipe(pick3(rng, [0x4a3a2e, 0x5a4636, 0x3d3129]), 0.13, 0.13, 8, a, b));
        for (let f = 0.25; f < 1; f += 0.45) {
          const c = pt(s0 + len * f, y + off);
          out.glow.push(
            meshPart(new CylinderGeometry(0.16, 0.16, 0.05, 8), dim(hot, 0.7), {
              x: c[0],
              y: c[1],
              z: c[2],
              rz: side < 2 ? PI / 2 : 0,
              rx: side < 2 ? 0 : PI / 2,
            }),
          );
        }
      }
      for (let f = 0; f <= 1; f += 0.25) {
        const c = pt(s0 + len * f, 0);
        out.body.push(box(0x2b2420, 0.2, y + 0.3, 0.2, { x: c[0], y: (y + 0.3) / 2, z: c[2] }));
      }
    }
  // gantry lamps
  for (const p of outsideSpots(rng, W, H, 12, 0.7, 1.2, 5)) {
    const x = p.x,
      z = p.z;
    out.body.push(
      pipe(0x2b2420, 0.07, 0.05, 6, [x, 0, z], [x, 2.6, z]),
      box(0x1c1612, 0.46, 0.4, 0.46, { x, y: 2.75, z }),
    );
    out.glow.push(box(yellow, 0.3, 0.26, 0.3, { x, y: 2.75, z }));
  }
  // scrap heaps with a few embers in them, barrels with a hot band
  for (const p of outsideSpots(rng, W, H, 8, 1.4, 6, 2.6)) {
    const t = list();
    for (let i = 0; i < 4; i++)
      t.body.push(
        rock(
          pick3(rng, rust.concat(steel)),
          rng.range(0.3, 0.8),
          rng.range(-0.9, 0.9),
          rng.range(0.1, 0.5),
          rng.range(-0.9, 0.9),
          { rx: rng.range(0, 3), ry: rng.range(0, 3), sy: rng.range(0.55, 1) },
        ),
      );
    if (rng.chance(0.6))
      t.body.push(bar(0x55453a, 0.08, [0, 0.3, 0], [rng.range(-1, 1), rng.range(1, 1.8), rng.range(-1, 1)]));
    for (let i = 0; i < 2; i++)
      t.glow.push(
        ball(dim(hot, 0.85), 0.09, 5, 3, { x: rng.range(-0.7, 0.7), y: rng.range(0.2, 0.6), z: rng.range(-0.7, 0.7) }),
      );
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  for (const p of outsideSpots(rng, W, H, 6, 1.3, 4, 2.4)) {
    const t = list();
    for (let i = 0; i < rng.int(2, 4); i++) {
      const x = rng.range(-0.5, 0.5),
        z = rng.range(-0.5, 0.5),
        col = rng.pick([0x5a3a22, 0x3a4a4a, 0x6a2a1e]);
      t.body.push(
        cyl(col, 0.3, 0.3, 0.85, 9, x, 0, z),
        cyl(dim(col, 0.6), 0.32, 0.32, 0.06, 9, x, 0.25, z),
        cyl(dim(col, 0.6), 0.32, 0.32, 0.06, 9, x, 0.6, z),
      );
      t.glow.push(cyl(dim(hot, 0.8), 0.31, 0.31, 0.05, 9, x, 0.42, z));
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // cranes: a leaning mast, a boom and a hanging cable with a lamp
  for (const p of outsideSpots(rng, W, H, 3, 4, 8, 12)) {
    const ix = -p.nx,
      iz = -p.nz;
    out.body.push(bar(0x52443a, 0.3, [p.x, 0, p.z], [p.x, 8, p.z], 0.3));
    out.body.push(bar(0x463a30, 0.22, [p.x, 7.8, p.z], [p.x + ix * 4.5, 8.8, p.z + iz * 4.5], 0.22));
    out.body.push(
      bar(0x2b2420, 0.04, [p.x + ix * 4.3, 8.7, p.z + iz * 4.3], [p.x + ix * 4.3, 5.4, p.z + iz * 4.3], 0.04),
    );
    out.body.push(box(0x1c1612, 0.5, 0.3, 0.5, { x: p.x + ix * 4.3, y: 5.3, z: p.z + iz * 4.3 }));
    out.glow.push(
      box(yellow, 0.3, 0.08, 0.3, { x: p.x + ix * 4.3, y: 5.12, z: p.z + iz * 4.3 }),
      ball(hot, 0.14, 5, 3, { x: p.x, y: 8.25, z: p.z }),
    );
  }
  // ground: soot patches, riveted plates, gears, gratings, lying pipes, debris, cracks
  for (const p of scatter(rng, W, H, obs, 14, { gap: 2.2 }))
    out.body.push(disc(0x0b0806, rng.range(0.5, 1.4), p.x, 0.012, p.z, 10, { sz: rng.range(0.6, 1) }));
  for (const p of scatter(rng, W, H, obs, 11, { gap: 2.6 })) {
    const t = list(),
      s = rng.range(0.7, 1.1);
    t.body.push(box(0x4a3c32, s, 0.035, s, { y: 0.018 }));
    for (const [rx, rz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      t.body.push(box(0x6a5a4c, 0.07, 0.05, 0.07, { x: rx * s * 0.4, y: 0.05, z: rz * s * 0.4 }));
    put(out, t, p.x, 0, p.z, rng.range(0, PI));
  }
  for (const p of scatter(rng, W, H, obs, 4, { gap: 4, margin: 2 })) {
    const t = list(),
      r = rng.range(0.32, 0.5),
      col = pick3(rng, [0x52443a, 0x463a30, 0x5a4636]);
    t.body.push(cyl(col, r, r, 0.05, 12, 0, 0, 0), cyl(dim(col, 0.6), r * 0.35, r * 0.35, 0.08, 8, 0, 0, 0));
    for (let i = 0; i < 9; i++)
      t.body.push(
        box(col, r * 0.34, 0.05, r * 0.3, {
          x: Math.cos((i / 9) * TAU) * (r + 0.05),
          y: 0.027,
          z: Math.sin((i / 9) * TAU) * (r + 0.05),
          ry: -(i / 9) * TAU,
        }),
      );
    put(out, t, p.x, 0, p.z, rng.range(0, PI));
  }
  for (const p of scatter(rng, W, H, obs, 9, { gap: 3, near: 3.5 })) {
    const a = rng.range(0, PI),
      len = rng.range(1.6, 4),
      dx = Math.cos(a) * len * 0.5,
      dz = Math.sin(a) * len * 0.5;
    out.body.push(pipe(0x4a3a2e, 0.085, 0.085, 7, [p.x - dx, 0.085, p.z - dz], [p.x + dx, 0.085, p.z + dz]));
    for (const f of [-0.85, 0, 0.85])
      out.body.push(
        pipe(
          0x2b2420,
          0.12,
          0.12,
          7,
          [p.x + dx * f - Math.cos(a) * 0.04, 0.085, p.z + dz * f - Math.sin(a) * 0.04],
          [p.x + dx * f + Math.cos(a) * 0.04, 0.085, p.z + dz * f + Math.sin(a) * 0.04],
        ),
      );
  }
  for (const p of scatter(rng, W, H, obs, 6, { gap: 3 })) {
    const t = list();
    t.body.push(box(0x120e0b, 1.2, 0.03, 0.8, { y: 0.015 }));
    for (let i = -3; i <= 3; i++) t.glow.push(box(dim(hot, 0.5), 0.05, 0.012, 0.66, { x: i * 0.15, y: 0.034 }));
    put(out, t, p.x, 0, p.z, rng.pick([0, PI / 2]));
  }
  for (const p of scatter(rng, W, H, obs, 22, { gap: 0.8 })) {
    const r = rng.range(0.06, 0.17);
    out.body.push(
      rock(pick3(rng, rust.concat(steel)), r, p.x, r * 0.5, p.z, { rx: rng.range(0, 3), ry: rng.range(0, 3), sy: 0.7 }),
    );
    if (rng.chance(0.18)) out.glow.push(ball(dim(hot, 0.8), 0.045, 4, 3, { x: p.x + r, y: 0.05, z: p.z }));
  }
  for (const p of scatter(rng, W, H, obs, 7, { gap: 3.5 }))
    crack(out, dim(hot, 0.55), p.x, p.z, rng, rng.int(4, 7), 0.6);
  return out;
}
const pick3 = (rng, items) => items[Math.floor(rng.next() * items.length)];

/* ---- Cryo Vault: ice spires, drifts and frozen wrecks outside; frost, shards, cracks and snow on
   the floor. ---- */
function vaultDetail(biome, W, H, obs, rng) {
  const out = list(),
    cyan = biome.grid,
    ice = [0x9fd8f0, 0xbfe8ff, 0x86c4e8, 0xdff4ff, 0x6ab0d8],
    snow = 0xe8f4ff;
  // tall spires: a main prism, leaning satellites, a few glowing gems in the ice
  for (const p of outsideSpots(rng, W, H, 15, 2.2, 14, 3.6)) {
    const t = list(),
      h = rng.range(3, 9),
      r = rng.range(0.5, 1.3);
    t.body.push(cone(rng.pick(ice), r, h, 6, 0, 0, 0, { ry: rng.range(0, 3) }));
    for (let i = 0; i < rng.int(2, 4); i++) {
      const a = rng.range(0, TAU),
        hh = h * rng.range(0.3, 0.7),
        rr = r * rng.range(0.4, 0.7),
        lean = rng.range(0.15, 0.45);
      t.body.push(
        cone(rng.pick(ice), rr, hh, 6, Math.cos(a) * r * 0.8, 0, Math.sin(a) * r * 0.8, {
          rx: Math.sin(a) * lean,
          rz: -Math.cos(a) * lean,
        }),
      );
    }
    for (let i = 0; i < 2; i++)
      t.glow.push(
        gem(dim(cyan, 0.75), r * 0.22, rng.range(-0.3, 0.3) * r, h * rng.range(0.2, 0.45), r * 0.42, { sy: 1.7 }),
      );
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // snow drifts with dark rocks
  for (const p of outsideSpots(rng, W, H, 16, 0.9, 6, 2.4)) {
    const t = list(),
      r = rng.range(0.8, 2);
    t.body.push(meshPart(new SphereGeometry(r, 8, 5), snow, { sy: rng.range(0.22, 0.42), sz: rng.range(0.7, 1.2) }));
    if (rng.chance(0.5)) {
      t.body.push(
        rock(0x2a4a60, r * 0.35, r * 0.3, r * 0.22, 0, { rx: 1, ry: 2 }),
        meshPart(new SphereGeometry(r * 0.3, 6, 3, 0, TAU, 0, PI / 2), snow, { x: r * 0.3, y: r * 0.28, sy: 0.5 }),
      );
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // frozen wrecks: tilted hull plates, icicles, a dead lamp
  for (const p of outsideSpots(rng, W, H, 6, 1.6, 6, 5)) {
    const t = list();
    t.body.push(
      box(0x2a3a4a, 2.2, 0.8, 1.2, { y: 0.4, rz: 0.12, ry: 0.2 }),
      box(0x22303e, 1.2, 0.6, 1, { x: 0.9, y: 0.95, rz: -0.2 }),
      bar(0x33475a, 0.12, [-0.6, 0.6, 0.4], [-1.4, 1.8, 0.8]),
    );
    t.body.push(meshPart(new SphereGeometry(0.7, 7, 4), snow, { x: -0.2, y: 0.85, sy: 0.25, sx: 1.5 }));
    for (let i = 0; i < 5; i++)
      t.body.push(
        spike(rng.pick(ice), 0.06, 4, [-0.9 + i * 0.45, 0.78, 0.62], [-0.9 + i * 0.45, rng.range(0.35, 0.6), 0.62]),
      );
    t.glow.push(box(dim(cyan, 0.5), 0.3, 0.06, 0.05, { x: 1.2, y: 0.95, z: 0.52 }));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // ice shelves: stacked tilted slabs near the wall
  for (const p of outsideSpots(rng, W, H, 10, 0.8, 2.6, 3)) {
    const t = list();
    for (let i = 0; i < 3; i++)
      t.body.push(
        box(rng.pick(ice), rng.range(1, 2), 0.25, rng.range(0.7, 1.3), {
          x: rng.range(-0.3, 0.3),
          y: 0.15 + i * 0.26,
          rz: rng.range(-0.2, 0.2),
          rx: rng.range(-0.15, 0.15),
          ry: rng.range(0, 3),
        }),
      );
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // ground: frost patches, shard tufts, cracks, snow lumps, small crystals
  for (const p of scatter(rng, W, H, obs, 16, { gap: 2.2 }))
    out.body.push(
      disc(rng.pick([0xc4dcea, 0xd2e6f2, 0xb4d0e2]), rng.range(0.8, 2), p.x, 0.012, p.z, 12, {
        sz: rng.range(0.55, 1),
        ry: rng.range(0, 3),
      }),
    );
  for (const p of scatter(rng, W, H, obs, 14, { gap: 2.2 })) {
    const t = list();
    for (let i = 0; i < rng.int(2, 4); i++) {
      const a = rng.range(0, TAU),
        d = rng.range(0, 0.22);
      t.body.push(
        cone(rng.pick(ice), rng.range(0.03, 0.07), rng.range(0.15, 0.4), 5, Math.cos(a) * d, 0, Math.sin(a) * d, {
          rx: rng.range(-0.3, 0.3),
          rz: rng.range(-0.3, 0.3),
        }),
      );
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  for (const p of scatter(rng, W, H, obs, 9, { gap: 3 }))
    crack(out, dim(cyan, 0.55), p.x, p.z, rng, rng.int(4, 7), 0.7);
  for (const p of scatter(rng, W, H, obs, 16, { gap: 1.1 })) {
    const r = rng.range(0.07, 0.17);
    out.body.push(meshPart(new SphereGeometry(r, 6, 4), snow, { x: p.x, y: r * 0.3, z: p.z, sy: 0.6 }));
  }
  for (const p of scatter(rng, W, H, obs, 11, { gap: 2 })) {
    const h = rng.range(0.15, 0.32);
    out.glow.push(gem(dim(cyan, rng.range(0.6, 0.95)), 0.06, p.x, h * 0.5 + 0.02, p.z, { sy: h / 0.06 / 1.7 }));
  }
  return out;
}

/* ---- Toxin Marsh: dead trees, giant mushrooms, reeds, bone piles and egg pods outside; puddles, lily
   pads, small mushrooms, grass, bones and spore pods on the ground. ---- */
function marshDetail(biome, W, H, obs, rng) {
  const out = list(),
    lime = biome.grid,
    yellow = biome.accent,
    bark = [0x3a3222, 0x2e2a1c, 0x40361f],
    moss = [0x2f5a22, 0x3a6a26, 0x274a1c],
    bone = 0xcfc8a8,
    caps = [0x6a3a8a, 0x3a7a6a, 0x8a4a3a, 0x5a4a9a];
  // dead trees with forked branches and hanging moss
  for (const p of outsideSpots(rng, W, H, 10, 2, 12, 3.6)) {
    const t = list(),
      h = rng.range(3, 7),
      r = rng.range(0.15, 0.4),
      col = pick3(rng, bark),
      lean = rng.range(-0.12, 0.12);
    t.body.push(pipe(col, r, r * 0.3, 6, [0, 0, 0], [lean * h, h, lean * h * 0.5]));
    for (let i = 0; i < rng.int(2, 4); i++) {
      const f = rng.range(0.4, 0.92),
        a = rng.range(0, TAU),
        len = rng.range(0.8, 1.9),
        sx = lean * h * f,
        sz = lean * h * 0.5 * f,
        ex = sx + Math.cos(a) * len,
        ey = h * f + len * 0.55,
        ez = sz + Math.sin(a) * len;
      t.body.push(pipe(col, r * 0.4, r * 0.12, 5, [sx, h * f, sz], [ex, ey, ez]));
      t.body.push(
        pipe(
          col,
          r * 0.14,
          r * 0.04,
          4,
          [ex, ey, ez],
          [ex + Math.cos(a + 0.6) * 0.6, ey + 0.4, ez + Math.sin(a + 0.6) * 0.6],
        ),
      );
      for (let m = 0; m < 1; m++)
        t.body.push(
          spike(
            pick3(rng, moss),
            0.05,
            4,
            [ex * (0.6 + m * 0.3), ey * (0.8 + m * 0.1) - 0.05, ez * (0.6 + m * 0.3)],
            [ex * (0.6 + m * 0.3), ey * (0.8 + m * 0.1) - rng.range(0.5, 1.1), ez * (0.6 + m * 0.3)],
          ),
        );
    }
    for (let i = 0; i < 3; i++)
      t.body.push(
        spike(
          col,
          r * 0.55,
          4,
          [Math.cos(i * 2.1) * r * 0.5, 0.3, Math.sin(i * 2.1) * r * 0.5],
          [Math.cos(i * 2.1) * r * 2.2, 0, Math.sin(i * 2.1) * r * 2.2],
        ),
      );
    if (rng.chance(0.4))
      t.glow.push(
        box(dim(lime, 0.8), 0.04, 0.1, 0.22, { x: r * 0.9, y: h * 0.25, z: 0 }),
        box(dim(lime, 0.8), 0.04, 0.08, 0.16, { x: r * 0.8, y: h * 0.35, z: 0.05 }),
      );
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // giant mushrooms with glowing spots
  for (const p of outsideSpots(rng, W, H, 6, 2, 8, 4.4)) {
    const t = list(),
      h = rng.range(1.4, 3.2),
      r = h * rng.range(0.5, 0.8),
      cap = rng.pick(caps);
    t.body.push(
      cyl(0xcfc8a8, r * 0.16, r * 0.11, h, 8, 0, 0, 0),
      meshPart(new SphereGeometry(r, 10, 5, 0, TAU, 0, PI / 2), cap, { y: h, sy: 0.6 }),
      disc(0x1c1024, r * 0.95, 0, h + 0.01, 0, 10),
    );
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, TAU),
        el = rng.range(0.3, 1.2);
      t.glow.push(
        ball(dim(rng.pick([lime, yellow]), 0.85), rng.range(0.05, 0.11), 5, 3, {
          x: Math.cos(a) * Math.sin(el) * r * 0.95,
          y: h + Math.cos(el) * r * 0.58,
          z: Math.sin(a) * Math.sin(el) * r * 0.95,
        }),
      );
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // dense reed clumps with cattails
  for (const p of outsideSpots(rng, W, H, 14, 0.6, 7, 1.6)) {
    const t = list();
    for (let i = 0; i < rng.int(4, 7); i++) {
      const x = rng.range(-0.4, 0.4),
        z = rng.range(-0.4, 0.4),
        len = rng.range(1.4, 3.4),
        lx = rng.range(-0.25, 0.25),
        lz = rng.range(-0.25, 0.25);
      t.body.push(pipe(pick3(rng, moss), 0.03, 0.012, 4, [x, 0, z], [x + lx * len * 0.5, len, z + lz * len * 0.5]));
      if (i % 3 === 0)
        t.body.push(
          pipe(
            0x4a3422,
            0.05,
            0.04,
            5,
            [x + lx * len * 0.5 * 0.82, len * 0.82, z + lz * len * 0.5 * 0.82],
            [x + lx * len * 0.5 * 0.96, len * 0.96, z + lz * len * 0.5 * 0.96],
          ),
        );
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // bone piles: half-buried ribcage, spine and a skull
  for (const p of outsideSpots(rng, W, H, 4, 1.8, 7, 5)) {
    const t = list(),
      n = rng.int(3, 4);
    for (let i = 0; i < n; i++)
      t.body.push(
        meshPart(new TorusGeometry(0.75 - Math.abs(i - n / 2) * 0.07, 0.05, 3, 8, PI), bone, {
          x: i * 0.3 - n * 0.15,
          y: 0.05,
          ry: PI / 2,
        }),
      );
    t.body.push(
      bar(bone, 0.07, [-n * 0.15 - 0.2, 0.75, 0], [n * 0.15 + 0.2, 0.68, 0]),
      ball(bone, 0.3, 7, 5, { x: n * 0.15 + 0.6, y: 0.3, sx: 1.2 }),
      box(0x8a8468, 0.3, 0.12, 0.26, { x: n * 0.15 + 0.85, y: 0.18 }),
    );
    t.body.push(
      ball(0x2a2618, 0.07, 5, 3, { x: n * 0.15 + 0.7, y: 0.36, z: 0.14 }),
      ball(0x2a2618, 0.07, 5, 3, { x: n * 0.15 + 0.7, y: 0.36, z: -0.14 }),
    );
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // egg pods with glowing veins
  for (const p of outsideSpots(rng, W, H, 7, 1.4, 6, 3)) {
    const t = list();
    for (let i = 0; i < rng.int(2, 4); i++) {
      const x = rng.range(-0.5, 0.5),
        z = rng.range(-0.5, 0.5),
        r = rng.range(0.28, 0.55);
      t.body.push(ball(rng.pick([0x5a7a4a, 0x6a8a52, 0x4a6a3a]), r, 8, 5, { x, y: r * 0.85, z, sy: 1.15 }));
      for (let v = 0; v < 3; v++) {
        const a = rng.range(0, TAU);
        t.glow.push(
          ball(dim(lime, 0.8), 0.05, 4, 3, {
            x: x + Math.cos(a) * r * 0.9,
            y: r * rng.range(0.6, 1.4),
            z: z + Math.sin(a) * r * 0.9,
          }),
        );
      }
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // mud mounds and will-o'-the-wisp stakes
  for (const p of outsideSpots(rng, W, H, 10, 0.8, 5, 2.4))
    out.body.push(
      meshPart(new SphereGeometry(rng.range(0.9, 1.9), 7, 4), 0x2a2216, {
        x: p.x,
        y: 0,
        z: p.z,
        sy: rng.range(0.22, 0.4),
      }),
    );
  for (const p of outsideSpots(rng, W, H, 10, 0.8, 3, 3.6)) {
    out.body.push(pipe(0x3a3222, 0.04, 0.03, 4, [p.x, 0, p.z], [p.x, 1.5, p.z]));
    out.glow.push(
      ball(dim(lime, 0.9), 0.14, 6, 4, { x: p.x, y: 1.62, z: p.z }),
      ball(dim(lime, 0.35), 0.26, 6, 4, { x: p.x, y: 1.62, z: p.z }),
    );
  }
  // ground: puddles, lily pads, small mushrooms, grass, bones, stones, spore pods
  for (const p of scatter(rng, W, H, obs, 12, { gap: 2.4 })) {
    const r = rng.range(0.5, 1.3);
    out.body.push(
      disc(0x0b2a2c, r, p.x, 0.014, p.z, 12, { sz: rng.range(0.6, 1), ry: rng.range(0, 3) }),
      disc(0x12403c, r * 0.6, p.x, 0.02, p.z, 10, { sz: 0.7 }),
    );
  }
  for (const p of scatter(rng, W, H, obs, 14, { gap: 1.8 })) {
    const t = list(),
      r = rng.range(0.22, 0.45);
    t.body.push(disc(pick3(rng, [0x3a6a2a, 0x2f5a22, 0x4a7a30]), r, 0, 0.022, 0, 10));
    t.body.push(meshPart(new ConeGeometry(r * 0.32, 0.03, 3), 0x0b2a2c, { x: r * 0.7, y: 0.024, ry: 0.5, rx: PI / 2 }));
    if (rng.chance(0.3)) t.glow.push(cone(dim(yellow, 0.85), 0.07, 0.12, 5, 0, 0.02, 0));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  for (const p of scatter(rng, W, H, obs, 12, { gap: 1.6 })) {
    const t = list(),
      cap = rng.pick(caps);
    for (let i = 0; i < rng.int(2, 4); i++) {
      const x = rng.range(-0.22, 0.22),
        z = rng.range(-0.22, 0.22),
        h = rng.range(0.08, 0.22);
      t.body.push(
        cyl(0xcfc8a8, 0.02, 0.017, h, 5, x, 0, z),
        meshPart(new SphereGeometry(h * 0.6 + 0.03, 6, 3, 0, TAU, 0, PI / 2), cap, { x, y: h, z, sy: 0.7 }),
      );
      if (rng.chance(0.6)) t.glow.push(ball(dim(lime, 0.85), 0.018, 4, 3, { x: x + 0.02, y: h + h * 0.4, z }));
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  for (const p of scatter(rng, W, H, obs, 14, { gap: 1.1 })) {
    const t = list();
    for (let i = 0; i < 4; i++)
      t.body.push(
        cone(pick3(rng, moss), 0.022, rng.range(0.18, 0.36), 3, rng.range(-0.1, 0.1), 0, rng.range(-0.1, 0.1), {
          rx: rng.range(-0.3, 0.3),
          rz: rng.range(-0.3, 0.3),
        }),
      );
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  for (const p of scatter(rng, W, H, obs, 9, { gap: 2.4 })) {
    const a = rng.range(0, TAU),
      dx = Math.cos(a) * 0.3,
      dz = Math.sin(a) * 0.3;
    out.body.push(
      bar(bone, 0.05, [p.x - dx, 0.04, p.z - dz], [p.x + dx, 0.04, p.z + dz], 0.05),
      ball(bone, 0.05, 5, 3, { x: p.x + dx, y: 0.05, z: p.z + dz }),
      ball(bone, 0.05, 5, 3, { x: p.x - dx, y: 0.05, z: p.z - dz }),
    );
  }
  for (const p of scatter(rng, W, H, obs, 16, { gap: 1.2 })) {
    const r = rng.range(0.06, 0.16);
    out.body.push(
      rock(pick3(rng, [0x343c2c, 0x3a4232, 0x2a3222]), r, p.x, r * 0.4, p.z, { rx: rng.range(0, 3), sy: 0.7 }),
    );
  }
  for (const p of scatter(rng, W, H, obs, 12, { gap: 1.8 })) {
    const h = rng.range(0.14, 0.3);
    out.body.push(pipe(0x3a6a2a, 0.012, 0.012, 3, [p.x, 0, p.z], [p.x + 0.03, h, p.z]));
    out.glow.push(ball(dim(yellow, 0.9), 0.04, 4, 3, { x: p.x + 0.03, y: h + 0.03, z: p.z }));
  }
  return out;
}

/* ---- Void Core: floating islands with crystals, spires, broken pillars, pylons and far rings outside
   the barrier; rune circles, cracks, crystal tufts and drifting shards on the tiles. ---- */
function voidDetail(biome, W, H, obs, rng) {
  const out = list(),
    violet = biome.grid,
    red = biome.accent,
    rockCol = [0x2a1a4a, 0x3a2660, 0x22143c, 0x33205a],
    glows = [violet, violet, red, 0x60d0ff];
  // floating islands: an inverted cone of rock with a flat top, crystals and spires on it
  for (const p of outsideSpots(rng, W, H, 9, 4, 17, 6.5)) {
    const t = list(),
      r = rng.range(1.4, 3.4),
      h = rng.range(2, 5);
    t.body.push(
      meshPart(new ConeGeometry(r, h, 7), pick3(rng, rockCol), { y: -h / 2, rx: PI }),
      cyl(0x3a2a52, r, r * 0.96, 0.22, 7, 0, -0.1, 0),
    );
    for (let i = 0; i < rng.int(2, 4); i++) {
      const a = rng.range(0, TAU),
        d = rng.range(0, r * 0.65),
        s = rng.range(0.25, 0.6),
        c = rng.pick(glows);
      t.glow.push(
        gem(dim(c, rng.range(0.7, 1)), s, Math.cos(a) * d, 0.12 + s * 1.2, Math.sin(a) * d, {
          sy: rng.range(2, 3.4),
          rz: rng.range(-0.2, 0.2),
        }),
      );
      t.body.push(cone(pick3(rng, rockCol), s * 0.9, s * 1.6, 5, Math.cos(a) * d, 0.1, Math.sin(a) * d));
    }
    for (let i = 0; i < 3; i++)
      t.body.push(
        rock(
          pick3(rng, rockCol),
          rng.range(0.12, 0.3),
          rng.range(-r, r) * 0.7,
          rng.range(-h * 0.5, -h * 0.9),
          rng.range(-r, r) * 0.7,
        ),
      );
    put(out, t, p.x, rng.range(-1.2, 0.2), p.z, rng.range(0, TAU));
  }
  // crystal spires rising out of the abyss
  for (const p of outsideSpots(rng, W, H, 16, 1.6, 13, 3.2)) {
    const t = list();
    for (let i = 0; i < rng.int(2, 4); i++) {
      const s = rng.range(0.22, 0.6),
        c = rng.pick(glows);
      t.glow.push(
        gem(dim(c, rng.range(0.6, 0.95)), s, rng.range(-0.5, 0.5), s * 1.5 + i * 0.2, rng.range(-0.5, 0.5), {
          sy: rng.range(2.2, 4),
          rz: rng.range(-0.25, 0.25),
          rx: rng.range(-0.25, 0.25),
        }),
      );
    }
    t.body.push(cone(pick3(rng, rockCol), rng.range(0.5, 0.9), rng.range(0.4, 0.9), 6, 0, -0.3, 0));
    put(out, t, p.x, rng.range(-2.4, -0.3), p.z, rng.range(0, TAU));
  }
  // broken pillars with glowing cracks
  for (const p of outsideSpots(rng, W, H, 8, 2, 10, 4.4)) {
    const t = list(),
      r = rng.range(0.3, 0.6),
      h = rng.range(1.4, 3.2);
    t.body.push(
      cyl(pick3(rng, rockCol), r, r * 0.9, h, 6, 0, 0, 0, { rz: rng.range(-0.25, 0.25) }),
      cyl(0x3a2a52, r * 1.3, r * 1.3, 0.2, 6, 0, -0.1, 0),
    );
    t.glow.push(
      bar(dim(violet, 0.85), 0.05, [r * 0.92, 0.2, 0], [r * 0.85, h * 0.8, 0.1], 0.03),
      bar(dim(red, 0.7), 0.04, [-r * 0.5, h * 0.3, r * 0.8], [-r * 0.3, h * 0.9, r * 0.6], 0.03),
    );
    put(out, t, p.x, rng.range(-1.6, 0), p.z, rng.range(0, TAU));
  }
  // pylons along the barrier
  const pylonAt = (x, z, hue) => {
    out.body.push(
      cone(0x2a1a4a, 0.22, 2.2, 4, x, 0, z, { ry: PI / 4 }),
      box(0x1c1034, 0.4, 0.3, 0.4, { x, y: 0.15, z }),
    );
    out.glow.push(
      gem(dim(hue, 0.95), 0.16, x, 2.45, z, { sy: 1.7 }),
      bar(dim(hue, 0.7), 0.04, [x, 0.3, z], [x, 2.2, z], 0.04),
    );
  };
  for (let i = 0; i <= 8; i++) {
    const s = -1 + i / 4,
      hue = i % 2 ? violet : red;
    pylonAt(s * W, -H - 0.5, hue);
    pylonAt(s * W, H + 0.5, hue);
    if (i > 0 && i < 8) {
      pylonAt(-W - 0.5, s * H, hue);
      pylonAt(W + 0.5, s * H, hue);
    }
  }
  // far rings and rifts
  for (let i = 0; i < 4; i++) {
    const p = outside(rng, W, H, 12, 20),
      r = rng.range(4, 8);
    out.glow.push(
      meshPart(new TorusGeometry(r, 0.07, 3, 34), dim(rng.pick([violet, red]), 0.7), {
        x: p.x,
        y: rng.range(2, 6),
        z: p.z,
        rx: rng.range(0.2, 1.4),
        ry: rng.range(0, 3),
      }),
    );
  }
  for (let i = 0; i < 5; i++) {
    const p = outside(rng, W, H, 6, 16);
    out.glow.push(
      gem(dim(red, 0.8), 0.6, p.x, rng.range(1, 3), p.z, { sy: rng.range(3, 6), sz: 0.12, ry: rng.range(0, 3) }),
    );
  }
  // ground: rune circles, cracks, crystal tufts, drifting shards
  for (const p of scatter(rng, W, H, obs, 5, { gap: 5, margin: 2.5 })) {
    const r = rng.range(1, 1.6),
      col = dim(rng.pick([violet, red]), 0.62);
    out.glow.push(ring(col, r, 0.018, p.x, 0.025, p.z), ring(col, r * 0.72, 0.012, p.x, 0.025, p.z));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + p.x;
      out.glow.push(
        bar(
          col,
          0.05,
          [p.x + Math.cos(a) * r * 0.74, 0.026, p.z + Math.sin(a) * r * 0.74],
          [p.x + Math.cos(a) * r * 1.0, 0.026, p.z + Math.sin(a) * r * 1.0],
          0.012,
        ),
      );
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + p.z,
        b = ((i + 1) / 3) * TAU + p.z;
      out.glow.push(
        bar(
          col,
          0.04,
          [p.x + Math.cos(a) * r * 0.72, 0.026, p.z + Math.sin(a) * r * 0.72],
          [p.x + Math.cos(b) * r * 0.72, 0.026, p.z + Math.sin(b) * r * 0.72],
          0.012,
        ),
      );
    }
  }
  for (const p of scatter(rng, W, H, obs, 10, { gap: 3 }))
    crack(out, dim(violet, 0.6), p.x, p.z, rng, rng.int(4, 7), 0.7);
  for (const p of scatter(rng, W, H, obs, 14, { gap: 2 })) {
    const t = list();
    for (let i = 0; i < rng.int(2, 4); i++) {
      const h = rng.range(0.14, 0.34),
        x = rng.range(-0.2, 0.2),
        z = rng.range(-0.2, 0.2);
      t.glow.push(
        cone(dim(rng.pick(glows), rng.range(0.6, 0.95)), rng.range(0.03, 0.06), h, 4, x, 0, z, {
          rx: rng.range(-0.25, 0.25),
          rz: rng.range(-0.25, 0.25),
        }),
      );
    }
    t.body.push(disc(0x1c1034, 0.22, 0, 0.01, 0, 6));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  for (const p of scatter(rng, W, H, obs, 18, { gap: 1.4 }))
    out.glow.push(
      gem(dim(rng.pick(glows), 0.75), rng.range(0.03, 0.08), p.x, rng.range(0.25, 0.7), p.z, {
        sy: 1.6,
        rx: rng.range(0, 3),
        ry: rng.range(0, 3),
      }),
    );
  return out;
}

const RL_DETAIL = { yard: yardDetail, works: worksDetail, vault: vaultDetail, marsh: marshDetail, void: voidDetail };

// Adds the detail layer of a biome to an ArenaView: two meshes (lit body and unlit glow).
function addBiomeDetail(view, biome, W, H, obs, rng) {
  const build = RL_DETAIL[biome.id];
  if (!build) return;
  const parts = build(biome, W, H, obs, rng);
  if (parts.body.length) {
    const mesh = new Mesh(mergeParts(parts.body), new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.frustumCulled = false;
    view.group.add(mesh);
  }
  if (parts.glow.length) {
    const mesh = new Mesh(mergeParts(parts.glow), new MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    mesh.frustumCulled = false;
    view.group.add(mesh);
  }
}

export { addBiomeDetail };
