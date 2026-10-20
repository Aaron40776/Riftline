// Biome detail layer (2.9.0): clutter, backdrop and ground decals for the biomes.
// Everything a biome adds here is baked into ONE lit mesh and ONE unlit (glow) mesh, so a biome costs
// two draw calls however many props it has. Placement comes from the arena seed (rng), never from
// Math.random. Inside the arena only flat or low things are placed (the drone flies over them, nothing
// blocks a hazard or a telegraph) and never on the start area; tall props stand outside the border.

import {
  BoxGeometry,
  CircleGeometry,
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

/* ---- Blackout City (3.4.0, was the Neon Yard): a city street at night in a power cut. Outside: a skyline of dark
   towers with only a few lit windows and red aircraft lights, water tanks and antennas on the roofs, street lamps
   (most still burning), traffic lights at the corners, parked and burned-out cars, a bus shelter; on the street:
   manhole covers, storm drains along the kerb, litter and cracks. ---- */
function yardDetail(biome, W, H, obs, rng) {
  const out = list(),
    red = biome.accent,
    pale = biome.grid,
    tower = [0x16181d, 0x1c1f26, 0x22252d, 0x191b20, 0x262a33],
    windows = [0xffd9a0, 0xffe7c0, 0x9fc2ff, 0xffc070];
  // skyline: dark towers, few lit windows (the power is out), red aircraft lights, tanks and antennas
  for (const p of outsideSpots(rng, W, H, 30, 3.4, 16, 3.3)) {
    const t = list(),
      w = rng.range(1.8, 3.6),
      dp = rng.range(1.8, 3.4),
      h = rng.range(4, 13) * (p.d > 9 ? 1.3 : 1),
      base = rng.pick(tower);
    t.body.push(box(base, w, h, dp, { y: h / 2 }), box(dim(base, 0.7), w * 0.9, 0.25, dp * 0.9, { y: h + 0.12 }));
    // window frames: a faint grid of dark panes, a few of them lit
    const rows = Math.min(8, Math.floor(h / 1.2));
    for (let r = 0; r < rows; r++)
      for (let c = -1; c <= 1; c++)
        if (rng.chance(0.13))
          t.glow.push(
            box(dim(rng.pick(windows), rng.range(0.35, 0.8)), w * 0.18, 0.32, 0.04, {
              x: c * w * 0.28,
              y: 0.9 + r * 1.2,
              z: dp / 2 + 0.02,
            }),
          );
    if (h > 8) t.glow.push(box(red, 0.18, 0.18, 0.18, { y: h + 0.4 }));
    if (rng.chance(0.35)) {
      t.body.push(cyl(0x2c2f36, 0.45, 0.45, 0.9, 10, w * 0.2, h + 0.25, 0));
      for (const lx of [-0.3, 0.3])
        t.body.push(spike(0x2c2f36, 0.04, 3, [w * 0.2 + lx, h + 0.25, 0], [w * 0.2 + lx, h, 0]));
    }
    if (rng.chance(0.4))
      t.body.push(spike(0x4a4f5a, 0.03, 3, [-w * 0.25, h + 0.25, 0], [-w * 0.25, h + rng.range(1.2, 2.6), 0]));
    put(out, t, p.x, 0, p.z, faceIn(p.nx, p.nz) + rng.range(-0.15, 0.15));
  }
  // parked and burned-out cars along the street outside
  for (const p of outsideSpots(rng, W, H, 12, 1.6, 4.2, 3.6)) {
    const t = list(),
      burned = rng.chance(0.4),
      col = burned ? 0x1a1a1c : rng.pick([0x2b3a4a, 0x4a2b2b, 0x3d3d44, 0x2e3b2e]);
    t.body.push(box(col, 2.3, 0.5, 1.05, { y: 0.45 }), box(dim(col, 0.8), 1.1, 0.42, 0.95, { x: -0.1, y: 0.9 }));
    for (const wx of [-0.75, 0.75])
      for (const wz of [-0.5, 0.5])
        t.body.push(cyl(0x111214, 0.26, 0.26, 0.2, 8, wx, 0.04, wz, { rx: PI / 2, y: 0.26 }));
    if (!burned && rng.chance(0.5)) t.glow.push(box(red, 0.03, 0.08, 0.22, { x: -1.16, y: 0.55, z: 0.32 }));
    put(out, t, p.x, 0, p.z, faceIn(p.nx, p.nz) + PI / 2 + rng.range(-0.2, 0.2));
  }
  // street lamps along the street (most still burn: their own circuit) and traffic lights at the corners
  rlStreet(out, W, H, rng, pale, red);
  // a bus shelter with a dead billboard
  for (const p of outsideSpots(rng, W, H, 2, 1.4, 2.4, 10)) {
    const t = list();
    t.body.push(box(0x2a2d33, 2.4, 0.08, 1, { y: 2.2 }), box(0x2a2d33, 0.08, 2.2, 1, { x: -1.15, y: 1.1 }));
    t.body.push(box(0x15171b, 1.1, 1.6, 0.06, { x: 0.4, y: 1.3, z: -0.45 }));
    t.glow.push(box(dim(pale, 0.35), 1.0, 0.03, 0.03, { x: 0.4, y: 2.12, z: -0.42 }));
    put(out, t, p.x, 0, p.z, faceIn(p.nx, p.nz));
  }
  // on the street: manhole covers, storm drains at the kerb, litter
  for (const p of scatter(rng, W, H, obs, 6, { gap: 4 })) {
    out.body.push(disc(0x1a1c20, 0.42, p.x, 0.015, p.z, 16));
    out.body.push(ring(0x2c2f36, 0.42, 0.03, p.x, 0.03, p.z), ring(0x2c2f36, 0.24, 0.02, p.x, 0.03, p.z));
  }
  for (const p of scatter(rng, W, H, obs, 8, { gap: 3, near: 1.6 })) {
    const t = list();
    t.body.push(box(0x101114, 0.9, 0.03, 0.5, { y: 0.015 }));
    for (let i = -3; i <= 3; i++) t.body.push(box(0x2a2c31, 0.04, 0.012, 0.44, { x: i * 0.12, y: 0.034 }));
    put(out, t, p.x, 0, p.z, Math.abs(p.x) > W - 2 ? PI / 2 : 0);
  }
  // 3.44.0: the micro clutter thins everywhere (was 22) - sparse ground, the props carry the place
  for (const p of scatter(rng, W, H, obs, 14, { gap: 1.2 })) {
    const s = rng.range(0.1, 0.22);
    out.body.push(
      box(rng.pick([0x3a3c42, 0x50463a, 0x2c3a46, 0x4a4a4a]), s, 0.02, s * rng.range(0.6, 1.4), {
        x: p.x,
        y: 0.012,
        z: p.z,
        ry: rng.range(0, PI),
      }),
    );
  }
  for (const p of scatter(rng, W, H, obs, 5, { gap: 5 })) crack(out, 0x050608, p.x, p.z, rng, 7, 0.55, 0.04);
  return out;
}
// street lamps every few metres outside the barriers (a warm head, 80 % burning) and a traffic light at each corner
function rlStreet(out, W, H, rng, pale, red) {
  const sides = [
    [0, -H - 1.6, 1, 0, 0, 1],
    [0, H + 1.6, 1, 0, 0, -1],
    [-W - 1.6, 0, 0, 1, 1, 0],
    [W + 1.6, 0, 0, 1, -1, 0],
  ];
  for (const [cx, cz, ax, az, ix, iz] of sides) {
    const len = ax ? W : H,
      n = Math.round((len * 2) / 7);
    for (let i = 0; i <= n; i++) {
      const s = -len + (i / n) * len * 2,
        x = cx + ax * s,
        z = cz + az * s;
      out.body.push(
        pipe(0x30333a, 0.07, 0.05, 6, [x, 0, z], [x, 4, z]),
        bar(0x30333a, 0.05, [x, 3.95, z], [x + ix * 0.9, 4.1, z + iz * 0.9]),
        box(0x1c1e22, ix ? 0.5 : 0.3, 0.12, ix ? 0.3 : 0.5, { x: x + ix * 1.0, y: 4.1, z: z + iz * 1.0 }),
      );
      if (rng.chance(0.8))
        out.glow.push(
          box(0xffd8a0, ix ? 0.4 : 0.22, 0.04, ix ? 0.22 : 0.4, { x: x + ix * 1.0, y: 4.03, z: z + iz * 1.0 }),
        );
    }
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (W + 1.4),
        z = sz * (H + 1.4);
      out.body.push(
        pipe(0x2a2c31, 0.06, 0.05, 6, [x, 0, z], [x, 2.8, z]),
        box(0x15161a, 0.32, 0.9, 0.3, { x, y: 3.2, z }),
      );
      out.glow.push(box(0xffb347, 0.16, 0.16, 0.04, { x, y: 3.2, z: z - sz * 0.16 }));
      out.glow.push(box(dim(red, 0.35), 0.16, 0.16, 0.04, { x, y: 3.48, z: z - sz * 0.16 }));
    }
}

const pick3 = (rng, items) => items[Math.floor(rng.next() * items.length)];

/* ---- The Aurora Shelf (3.54.0): blue ice ridges and great seracs beyond the wall, ice cliffs on
   the horizon, snow drifts and half-buried arks around the arena; frost, shards, cracks and snow
   on the floor. The crest of a tall ridge carries a faint aurora-green rim light. ---- */
function vaultDetail(biome, W, H, obs, rng) {
  const out = list(),
    cyan = biome.grid,
    ice = [0x8fc4ec, 0xaadcf4, 0x6ea6d4, 0xc8e8ff, 0x5a92c4],
    snow = 0xe8f4ff;
  // the great seracs: three towers of ice on the horizon, their crests rim-lit by the aurora
  const great = [
    { x: -11, z: -H - 7.5, h: 13.5, r: 2.1 },
    { x: 3.5, z: -H - 10.5, h: 15, r: 2.5 },
    { x: 14.5, z: -H - 5.5, h: 12, r: 1.9 },
  ];
  for (const g of great) {
    const t = list();
    t.body.push(cone(rng.pick(ice), g.r, g.h, 6, 0, 0, 0, { ry: rng.range(0, 3) }));
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, TAU),
        hh = g.h * rng.range(0.3, 0.55),
        rr = g.r * rng.range(0.35, 0.6),
        lean = rng.range(0.12, 0.3);
      t.body.push(
        cone(rng.pick(ice), rr, hh, 6, Math.cos(a) * g.r * 0.75, 0, Math.sin(a) * g.r * 0.75, {
          rx: Math.sin(a) * lean,
          rz: -Math.cos(a) * lean,
        }),
      );
    }
    // the crest rim: a faint green light where the aurora catches the ridge
    t.glow.push(
      box(dim(cyan, 0.55), 0.16, g.h * 0.5, 0.16, { x: g.r * 0.42, y: g.h * 0.55, z: 0 }),
      gem(dim(cyan, 0.85), g.r * 0.24, -g.r * 0.3, g.h * 0.62, g.r * 0.2, { sy: 1.7 }),
    );
    put(out, t, g.x, 0, g.z, rng.range(0, TAU));
  }
  // ice cliffs: stacked tilted slabs standing on the horizon, snow on their tops
  for (const p of [
    { x: -5.5, z: -H - 4.5 },
    { x: 9.5, z: -H - 3 },
    { x: -W - 5, z: -H - 1.5 },
    { x: W + 6, z: -H - 2 },
  ]) {
    const t = list(),
      n = 4 + rng.int(0, 2);
    for (let i = 0; i < n; i++)
      t.body.push(
        box(rng.pick(ice), rng.range(2.2, 4.2), rng.range(0.9, 1.6), rng.range(1, 1.8), {
          x: rng.range(-0.5, 0.5),
          y: 0.45 + i * rng.range(1.05, 1.35),
          z: rng.range(-0.4, 0.4),
          rz: rng.range(-0.14, 0.14),
          rx: rng.range(-0.1, 0.1),
          ry: rng.range(0, 3),
        }),
      );
    t.body.push(meshPart(new SphereGeometry(rng.range(1.4, 2), 8, 5), snow, { x: 0, y: n * 1.2, sy: 0.3, sz: 0.7 }));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // tall ridges: a main spire, leaning satellites, a few glowing gems in the ice
  for (const p of outsideSpots(rng, W, H, 16, 2.2, 13, 3.6)) {
    const t = list(),
      h = rng.range(3.5, 10),
      r = rng.range(0.5, 1.4);
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
    if (h > 6.5) t.glow.push(box(dim(cyan, 0.45), 0.12, h * 0.45, 0.12, { x: r * 0.4, y: h * 0.52, z: 0 }));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // snow drifts with dark blue rocks
  for (const p of outsideSpots(rng, W, H, 16, 0.9, 6, 2.4)) {
    const t = list(),
      r = rng.range(0.8, 2);
    t.body.push(meshPart(new SphereGeometry(r, 8, 5), snow, { sy: rng.range(0.22, 0.42), sz: rng.range(0.7, 1.2) }));
    if (rng.chance(0.5)) {
      t.body.push(
        rock(0x22345c, r * 0.35, r * 0.3, r * 0.22, 0, { rx: 1, ry: 2 }),
        meshPart(new SphereGeometry(r * 0.3, 6, 3, 0, TAU, 0, PI / 2), snow, { x: r * 0.3, y: r * 0.28, sy: 0.5 }),
      );
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // the arks: expedition hulls half-sunk in the shelf, ribs along the keel, snow over the decks,
  // icicles off the stern, one dead lamp still lit by the aurora
  for (const p of outsideSpots(rng, W, H, 6, 1.6, 6, 5)) {
    const t = list(),
      L = rng.range(2.6, 4),
      hullC = rng.pick([0x22345c, 0x1d2c4c, 0x28406a]);
    t.body.push(meshPart(new SphereGeometry(1, 9, 6), hullC, { x: 0, y: 0.1, sx: L * 0.5, sy: 0.85, sz: 0.62 }));
    t.body.push(box(hullC, L * 0.8, 0.5, 0.16, { y: 0.72, rz: 0.05 }));
    for (let i = 0; i < 4; i++)
      t.body.push(box(0x33475a, 0.1, rng.range(0.5, 0.8), 0.9, { x: -L * 0.3 + i * L * 0.2, y: 0.85 }));
    t.body.push(meshPart(new SphereGeometry(1.1, 8, 4), snow, { x: 0.2, y: 0.78, sy: 0.3, sx: L * 0.42, sz: 0.5 }));
    for (let i = 0; i < 5; i++)
      t.body.push(
        spike(
          rng.pick(ice),
          0.07,
          4,
          [L * 0.36, 0.55, -0.4 + i * 0.2],
          [L * 0.36, rng.range(0.1, 0.35), -0.4 + i * 0.2],
        ),
      );
    t.glow.push(box(dim(cyan, 0.5), 0.3, 0.06, 0.05, { x: L * 0.3, y: 0.95, z: 0.34 }));
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
  // 3.44.0: everything rests a step - fewer decals and dimmer glow, so enemies read on the white
  for (const p of scatter(rng, W, H, obs, 10, { gap: 2.6 }))
    out.body.push(
      disc(rng.pick([0xa8c4d8, 0xb8d0e0, 0x98b4c8]), rng.range(0.8, 2), p.x, 0.012, p.z, 12, {
        sz: rng.range(0.55, 1),
        ry: rng.range(0, 3),
      }),
    );
  for (const p of scatter(rng, W, H, obs, 9, { gap: 2.6 })) {
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
  for (const p of scatter(rng, W, H, obs, 6, { gap: 3.4 }))
    crack(out, dim(cyan, 0.5), p.x, p.z, rng, rng.int(4, 7), 0.7);
  for (const p of scatter(rng, W, H, obs, 10, { gap: 1.4 })) {
    const r = rng.range(0.07, 0.17);
    out.body.push(meshPart(new SphereGeometry(r, 6, 4), snow, { x: p.x, y: r * 0.3, z: p.z, sy: 0.6 }));
  }
  for (const p of scatter(rng, W, H, obs, 7, { gap: 2.6 })) {
    const h = rng.range(0.15, 0.32);
    out.glow.push(gem(dim(cyan, rng.range(0.35, 0.6)), 0.06, p.x, h * 0.5 + 0.02, p.z, { sy: h / 0.06 / 1.7 }));
  }
  return out;
}

/* ---- The Glowmarsh (3.50.0): dead trees, glowcap mushrooms, reeds, bone piles and egg pods outside;
   puddles, lily pads, small glowcaps, grass, bones and spore pods on the ground. The glow colours
   follow the biome (lime = grid, yellow = accent), so the wisps and veins shift with the palette. ---- */
function marshDetail(biome, W, H, obs, rng) {
  const out = list(),
    lime = biome.grid,
    yellow = biome.accent,
    bark = [0x2a2519, 0x221e15, 0x302a1b],
    moss = [0x1e4a3a, 0x245844, 0x19402f],
    bone = 0xcfc8a8,
    caps = [0x2a8a68, 0x1e7a5c, 0x359a74, 0x2a6a80];
  // dead trees with forked branches and hanging glow-moss
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
  // giant glowcaps with glowing spots
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
      t.body.push(ball(rng.pick([0x3a5a4c, 0x466a56, 0x2f4a3e]), r, 8, 5, { x, y: r * 0.85, z, sy: 1.15 }));
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
  // mud mounds and will-o'-the-wisp stakes (the marsh's own lanterns)
  for (const p of outsideSpots(rng, W, H, 10, 0.8, 5, 2.4))
    out.body.push(
      meshPart(new SphereGeometry(rng.range(0.9, 1.9), 7, 4), 0x1c1a12, {
        x: p.x,
        y: 0,
        z: p.z,
        sy: rng.range(0.22, 0.4),
      }),
    );
  for (const p of outsideSpots(rng, W, H, 10, 0.8, 3, 3.6)) {
    out.body.push(pipe(0x2a2519, 0.04, 0.03, 4, [p.x, 0, p.z], [p.x, 1.5, p.z]));
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
  for (const p of scatter(rng, W, H, obs, 10, { gap: 2 })) {
    // 3.44.0: the moss clumps rest (was 14) - the fireflies now carry the marsh floor
    const t = list(),
      r = rng.range(0.22, 0.45);
    t.body.push(disc(pick3(rng, [0x2a5a44, 0x1e4a3a, 0x336a50]), r, 0, 0.022, 0, 10));
    t.body.push(meshPart(new ConeGeometry(r * 0.32, 0.03, 3), 0x0b2a2c, { x: r * 0.7, y: 0.024, ry: 0.5, rx: PI / 2 }));
    if (rng.chance(0.3)) t.glow.push(cone(dim(yellow, 0.85), 0.07, 0.12, 5, 0, 0.02, 0));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  for (const p of scatter(rng, W, H, obs, 9, { gap: 2 })) {
    // 3.44.0: the small mushrooms rest (was 12)
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
  for (const p of scatter(rng, W, H, obs, 10, { gap: 1.3 })) {
    // 3.44.0: was 14
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
  for (const p of scatter(rng, W, H, obs, 6, { gap: 2.8 })) {
    // 3.44.0: bone piles rest (was 9)
    const a = rng.range(0, TAU),
      dx = Math.cos(a) * 0.3,
      dz = Math.sin(a) * 0.3;
    out.body.push(
      bar(bone, 0.05, [p.x - dx, 0.04, p.z - dz], [p.x + dx, 0.04, p.z + dz], 0.05),
      ball(bone, 0.05, 5, 3, { x: p.x + dx, y: 0.05, z: p.z + dz }),
      ball(bone, 0.05, 5, 3, { x: p.x - dx, y: 0.05, z: p.z - dz }),
    );
  }
  for (const p of scatter(rng, W, H, obs, 11, { gap: 1.5 })) {
    // 3.44.0: stones rest (was 16)
    const r = rng.range(0.06, 0.16);
    out.body.push(
      rock(pick3(rng, [0x343c2c, 0x3a4232, 0x2a3222]), r, p.x, r * 0.4, p.z, { rx: rng.range(0, 3), sy: 0.7 }),
    );
  }
  for (const p of scatter(rng, W, H, obs, 8, { gap: 2.2 })) {
    // 3.44.0: sprout stems rest (was 12)
    const h = rng.range(0.14, 0.3);
    out.body.push(pipe(0x3a6a2a, 0.012, 0.012, 3, [p.x, 0, p.z], [p.x + 0.03, h, p.z]));
    out.glow.push(ball(dim(yellow, 0.9), 0.04, 4, 3, { x: p.x + 0.03, y: h + 0.03, z: p.z }));
  }
  return out;
}

/* ---- The Shattered Core: floating islands with crystals, spires, broken pillars, pylons and far rings outside
   the barrier; rune circles, cracks, crystal tufts and drifting shards on the tiles. ---- */
/* ---- The Glass Flats (3.53.0): dunes, glass ridges and dry shrubs outside; glare patches, shard
   tufts and cracked plates on the ground. ---- */
function flatsDetail(biome, W, H, obs, rng) {
  const out = list(),
    gold = biome.grid,
    hot = biome.accent,
    sand = [0x6a5632, 0x76623a, 0x5c4a2c],
    glass = [0xd8ccb0, 0xe2d8c0, 0xc0b088],
    dry = 0x2e2416;
  // dunes: pale mounds with a wind-blown crest
  for (const p of outsideSpots(rng, W, H, 12, 1.2, 10, 3.2)) {
    const t = list(),
      r = rng.range(1.1, 2.6);
    t.body.push(
      meshPart(new SphereGeometry(r, 8, 5), pick3(rng, sand), { sy: rng.range(0.24, 0.4), sz: rng.range(0.8, 1.3) }),
    );
    if (rng.chance(0.5))
      t.body.push(meshPart(new SphereGeometry(r * 0.4, 6, 4), pick3(rng, glass), { x: r * 0.4, y: r * 0.16, sy: 0.5 }));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // glass ridges: tilted sheets that catch the noon light, a few with a hot edge
  for (const p of outsideSpots(rng, W, H, 9, 1.6, 8, 4)) {
    const t = list(),
      w = rng.range(1.2, 2.6),
      h = rng.range(0.5, 1.3);
    t.body.push(
      meshPart(new BoxGeometry(w, h, 0.14), pick3(rng, glass), {
        y: h * 0.3,
        rz: rng.range(-0.2, 0.2),
        ry: rng.range(0, TAU),
      }),
    );
    if (rng.chance(0.6)) t.glow.push(box(dim(hot, 0.85), w * 0.7, 0.05, 0.03, { y: h * 0.55, z: 0.06 }));
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // dry shrubs: dark twig bundles the heat could not take
  for (const p of outsideSpots(rng, W, H, 10, 0.8, 5, 2.6)) {
    const t = list();
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, TAU);
      t.body.push(pipe(dry, 0.025, 0.015, 4, [0, 0, 0], [Math.cos(a) * 0.3, rng.range(0.3, 0.7), Math.sin(a) * 0.3]));
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // ground: glare patches, shard tufts, cracked plates, sand ripples
  for (const p of scatter(rng, W, H, obs, 10, { gap: 2.6 }))
    out.body.push(
      meshPart(new CircleGeometry(rng.range(0.3, 0.8), 8), pick3(rng, glass), {
        x: p.x,
        y: 0.012,
        rx: -PI / 2,
        rz: rng.range(0, TAU),
      }),
    );
  for (const p of scatter(rng, W, H, obs, 8, { gap: 2.2 })) {
    const t = list();
    for (let i = 0; i < 3; i++)
      t.body.push(
        spike(
          pick3(rng, glass),
          0.05,
          4,
          [Math.cos(i * 2.1) * 0.12, 0.05, Math.sin(i * 2.1) * 0.12],
          [Math.cos(i * 2.1) * 0.2, rng.range(0.18, 0.4), Math.sin(i * 2.1) * 0.2],
        ),
      );
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  return out;
}

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
  for (const p of scatter(rng, W, H, obs, 7, { gap: 3.4 }))
    crack(out, dim(violet, 0.6), p.x, p.z, rng, rng.int(4, 7), 0.7); // 3.44.0: was 10
  for (const p of scatter(rng, W, H, obs, 9, { gap: 2.4 })) {
    // 3.44.0: crystal tufts rest (was 14)
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
  for (const p of scatter(rng, W, H, obs, 11, { gap: 1.8 }))
    // 3.44.0: the drifting shards rest (was 18)
    out.glow.push(
      gem(dim(rng.pick(glows), 0.75), rng.range(0.03, 0.08), p.x, rng.range(0.25, 0.7), p.z, {
        sy: 1.6,
        rx: rng.range(0, 3),
        ry: rng.range(0, 3),
      }),
    );
  return out;
}

/* ---- Ashfall Caldera (3.54.0): the floor of a volcano. Beyond the far wall the volcano itself
   stands - dark truncated cones with glowing crater rims, lava veins down their flanks and ash
   plumes leaning off their mouths - with basalt organ pipes, charred stumps and standing stones
   around the arena; inside: the lava channel runs from the caldera mouth to the dyke, ember scars
   dot the plates, a scatter of settling embers, clusters of obsidian shards. ---- */
function calderaDetail(biome, W, H, obs, rng) {
  const out = list(),
    hot = biome.accent,
    lava = 0xff7a1e, // the interior molten glow - the accent is cream, too pale for lava
    crust = 0x1c0f08,
    basalt = [0x241a16, 0x2a1e18, 0x1e1512],
    slope = [0x3a2a20, 0x40301f, 0x342318];
  // the volcano and its two shoulder cones, out past the far wall: truncated dark slopes with a
  // molten crater rim, veins of lava wandering down the flank, an ash plume leaning off the mouth
  // (the camera looks at the -z far field, so the cone row is hand-placed there and on the back
  // corners of the side walls - the near side is never in frame)
  const cones = [
    { x: -9, z: -H - 5.5, r: 8.2, h: 12.5 },
    { x: 6.5, z: -H - 9.5, r: 10.5, h: 15.5 },
    { x: -W - 8, z: -H - 2.5, r: 6.6, h: 10 },
    { x: W + 9, z: -H - 3.5, r: 7.2, h: 11 },
  ];
  for (const c of cones) {
    const t = list(),
      col = rng.pick(slope);
    // the slope (wide base, narrow flat top), a stepped skirt at its foot and the crater throat
    t.body.push(
      cyl(col, c.r, c.r * 0.42, c.h, 9, 0, 0, 0),
      cyl(dim(col, 0.8), c.r * 1.12, c.r * 1.04, 1.4, 9, 0, 0, 0),
    );
    // the crater: a molten mouth flush with the flat top, a bright rim around it
    t.glow.push(
      meshPart(new TorusGeometry(c.r * 0.44, 0.16, 3, 22), dim(hot, 0.95), { x: 0, y: c.h + 0.08, z: 0, rx: PI / 2 }),
      disc(dim(hot, 0.6), c.r * 0.36, 0, c.h + 0.06, 0, 12),
    );
    // lava veins wandering down the flank (they end on the slope: radius 0.88 r at 20 % height),
    // a couple of branch stubs so the network reads from the wall
    for (let v = 0; v < 8; v++) {
      const a = (v / 8) * TAU + rng.range(-0.25, 0.25),
        r0 = c.r * 0.4,
        r1 = c.r * 0.88;
      t.glow.push(
        bar(
          dim(hot, rng.range(0.55, 0.9)),
          0.12,
          [Math.cos(a) * r0, c.h + 0.2, Math.sin(a) * r0],
          [Math.cos(a + rng.range(-0.15, 0.15)) * r1, c.h * 0.2, Math.sin(a + rng.range(-0.15, 0.15)) * r1],
          0.05,
        ),
      );
      if (rng.chance(0.5)) {
        const b = a + rng.pick([-1, 1]) * rng.range(0.3, 0.6),
          rm = c.r * rng.range(0.5, 0.7);
        t.glow.push(
          bar(
            dim(hot, rng.range(0.45, 0.7)),
            0.08,
            [Math.cos(a) * rm, c.h * 0.62, Math.sin(a) * rm],
            [Math.cos(b) * c.r * 0.82, c.h * 0.34, Math.sin(b) * c.r * 0.82],
            0.04,
          ),
        );
      }
    }
    // the ash plume: a leaning stack of puffs drifting off the mouth
    let px = 0,
      pz = 0,
      py = c.h + 0.5,
      pr = c.r * 0.22;
    for (let s = 0; s < 4; s++) {
      px += pr * rng.range(0.5, 0.9);
      py += pr * rng.range(0.9, 1.2);
      pr *= rng.range(1.12, 1.26);
      t.body.push(
        meshPart(new DodecahedronGeometry(pr, 0), s % 2 ? 0x3a322e : 0x322a26, {
          x: px,
          y: py,
          z: pz,
          ry: rng.range(0, TAU),
        }),
      );
      pz += rng.range(-0.3, 0.3);
    }
    put(out, t, c.x, 0, c.z, rng.range(0, TAU));
  }
  // broad lava rivers in the backdrop, running from the cones toward the arena's flanks
  for (let i = 0; i < 5; i++) {
    const p = outside(rng, W, H, 1.2, 6.5);
    if (p.nz > 0.5) continue; // the near side is never in frame
    const a = rng.range(0, TAU),
      L = rng.range(3, 6.5);
    out.glow.push(
      bar(
        dim(hot, rng.range(0.4, 0.7)),
        rng.range(0.5, 1),
        [p.x, 0.02, p.z],
        [p.x + Math.cos(a) * L, 0.02, p.z + Math.sin(a) * L],
        0.02,
      ),
    );
    out.body.push(
      box(crust, Math.hypot(Math.cos(a) * L, Math.sin(a) * L) + 0.5, 0.014, rng.range(1.4, 2), {
        x: p.x + Math.cos(a) * L * 0.5,
        y: 0.008,
        z: p.z + Math.sin(a) * L * 0.5,
        ry: -a,
      }),
    );
  }
  // basalt organ pipes: clusters of hexagonal columns, a couple tipped with ember glow
  for (const p of outsideSpots(rng, W, H, 12, 1.6, 8, 3)) {
    const t = list(),
      n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.3, 0.3),
        d = rng.range(0.1, 0.7),
        h = rng.range(1.6, 4.4) * (i === 0 ? 1.25 : 1);
      t.body.push(
        cyl(rng.pick(basalt), 0.34, 0.28, h, 6, Math.cos(a) * d, 0, Math.sin(a) * d, {
          rx: rng.range(-0.06, 0.06),
          rz: rng.range(-0.06, 0.06),
        }),
      );
      if (rng.chance(0.3))
        t.glow.push(box(dim(hot, 0.6), 0.16, 0.1, 0.16, { x: Math.cos(a) * d, y: h + 0.04, z: Math.sin(a) * d }));
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // vent mounds out in the crater (the fumarole mounds, not the hazards): stacked cones with a
  // glowing throat ring, a side vent on some
  for (const p of outsideSpots(rng, W, H, 14, 2.6, 7, 3.4)) {
    const t = list(),
      mound = 0x211712;
    if (rng.chance(0.45)) {
      t.body.push(box(rng.pick(basalt), 1.1, 5.5, 1.1, { y: 2.75 }), box(dim(hot, 0.22), 1.14, 0.06, 1.14, { y: 0.5 }));
    } else {
      for (let k = 0; k < 2; k++) t.body.push(cyl(mound, 0.55 - 0.12 * k, 0.5 - 0.12 * k, 0.9, 9, 0, 0.95 * k, 0));
      if (rng.chance(0.5)) t.body.push(cyl(mound, 0.45, 0.4, 0.7, 9, 0.78, 0, 0.12));
      t.glow.push(ring(dim(hot, 0.5), 0.34, 0.04, 0, 1.86, 0), ring(dim(hot, 0.32), 0.24, 0.03, 0, 1.88, 0));
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // charred stumps and ash banks against the walls, most still glowing from inside
  for (const p of outsideSpots(rng, W, H, 10, 1.4, 3.2, 2.8)) {
    const t = list(),
      s = rng.range(0.5, 0.8);
    t.body.push(rock(0x1a120e, s, 0, s * 0.7, 0, { ry: rng.range(0, PI) }));
    if (rng.chance(0.5)) t.body.push(rock(0x181009, s * 0.75, s * 0.8, s * 0.4, s * 0.3, { ry: rng.range(0, PI) }));
    if (rng.chance(0.6))
      t.glow.push(
        box(dim(hot, 0.6), 0.06, 0.1, 0.02, { y: s * 0.5, z: s / 2 + 0.01 }),
        disc(dim(hot, 0.22), s * 0.9, 0, 0.012, 0, 10),
      );
    put(out, t, p.x, 0, p.z, faceIn(p.nx, p.nz));
  }
  // standing stones: thin basalt stacks, a warm glow at the tip of a few
  for (const p of outsideSpots(rng, W, H, 8, 2.2, 6, 3)) {
    out.body.push(cone(0x1c1512, 0.5, rng.range(4, 6.5), 6, p.x, 0, p.z));
    if (rng.chance(0.5)) out.glow.push(box(0xffb45a, 0.1, 0.14, 0.1, { x: p.x, y: rng.range(3.4, 5.2), z: p.z }));
  }
  // the old lava channel runs from the caldera mouth to the dyke, glowing where its crust broke
  out.body.push(box(crust, 2.4, 0.02, 10.6, { y: 0.012, z: -2.2 }));
  out.body.push(
    box(dim(hot, 0.55), 2.3, 0.014, 0.08, { y: 0.022, z: 3.1 }),
    box(dim(hot, 0.55), 2.3, 0.014, 0.08, { y: 0.022, z: -7.4 }),
  );
  // interior: molten ponds in the crust (a glow under a dark float of rock), ash drifts, glowing
  // fissure cracks, charred rubble and basalt pipe stubs - the floor of a volcano, not a car park
  for (const p of scatter(rng, W, H, obs, 7, { gap: 2.8 })) {
    const r = rng.range(0.55, 1.15);
    out.body.push(
      ring(crust, r, 0.12, p.x, 0.02, p.z),
      disc(0x140d0a, r, p.x, 0.012, p.z, 12),
      rock(0x1a120e, r * 0.32, r * 0.55, r * 0.18, r * 0.3, { ry: rng.range(0, PI), sy: 0.55 }),
    );
    out.glow.push(
      disc(dim(lava, 0.4), r * 0.62, p.x, 0.017, p.z, 12),
      disc(dim(lava, rng.range(0.65, 0.85)), r * rng.range(0.16, 0.28), p.x + r * 0.18, 0.021, p.z - r * 0.12, 8),
    );
  }
  for (const p of scatter(rng, W, H, obs, 9, { gap: 2.6 }))
    out.body.push(
      disc(rng.pick([0x2e2a28, 0x262220, 0x332e2a]), rng.range(0.7, 1.5), p.x, 0.012, p.z, 12, {
        sz: rng.range(0.5, 0.9),
        ry: rng.range(0, 3),
      }),
    );
  for (const p of scatter(rng, W, H, obs, 9, { gap: 2.6 }))
    crack(out, dim(lava, rng.range(0.45, 0.7)), p.x, p.z, rng, rng.int(4, 7), 0.7, 0.045);
  for (const p of scatter(rng, W, H, obs, 14, { gap: 1.6 })) {
    const s = rng.range(0.08, 0.2);
    out.body.push(
      rock(rng.pick([0x1c1512, 0x221a16, 0x181210]), s, p.x, s * 0.4, p.z, {
        ry: rng.range(0, PI),
        sy: 0.6,
      }),
    );
  }
  for (const p of scatter(rng, W, H, obs, 6, { gap: 3 })) {
    const t = list(),
      n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.4, 0.4),
        d = rng.range(0.05, 0.3),
        h = rng.range(0.14, 0.4);
      t.body.push(cyl(rng.pick(basalt), 0.09, 0.075, h, 6, Math.cos(a) * d, 0, Math.sin(a) * d));
      if (rng.chance(0.3))
        t.glow.push(box(dim(lava, 0.6), 0.05, 0.04, 0.05, { x: Math.cos(a) * d, y: h + 0.02, z: Math.sin(a) * d }));
    }
    put(out, t, p.x, 0, p.z, rng.range(0, TAU));
  }
  // ember scars on the plates and a scatter of settling embers
  for (const p of scatter(rng, W, H, obs, 12, { gap: 2.4 })) {
    out.body.push(disc(0x160e0a, 0.16, p.x, 0.014, p.z, 10), ring(dim(lava, 0.55), 0.16, 0.015, p.x, 0.026, p.z));
  }
  const embers = [hot, 0xff9c3a, 0x8a7f74, 0xffe19a];
  for (const p of scatter(rng, W, H, obs, 38, { gap: 0.7 })) {
    const c = rng.pick(embers),
      chip = box(c, rng.range(0.04, 0.09), 0.008, rng.range(0.03, 0.05), {
        x: p.x,
        y: 0.01,
        z: p.z,
        ry: rng.range(0, PI),
      });
    (c === 0x8a7f74 ? out.body : out.glow).push(chip);
  }
  // a cluster of obsidian shards near a spire
  for (const p of scatter(rng, W, H, obs, 2, { gap: 6 })) {
    out.body.push(cone(0x141018, 0.2, 0.5, 5, p.x, 0, p.z));
    out.body.push(cone(0x141018, 0.13, 0.34, 5, p.x + 0.18, 0, p.z + 0.1));
    out.glow.push(box(dim(hot, 0.5), 0.05, 0.08, 0.02, { x: p.x - 0.05, y: 0.14, z: p.z + 0.16 }));
  }
  return out;
}

const RL_DETAIL = {
  yard: yardDetail,
  vault: vaultDetail,
  marsh: marshDetail,
  void: voidDetail,
  club: calderaDetail,
  flats: flatsDetail,
};

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
