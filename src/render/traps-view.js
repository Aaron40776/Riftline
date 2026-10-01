// 3.0.0: how traps and the grenade look. TrapView draws `world.traps` (the simulation decides everything, this only
// shows it) and `world.grenades`. Every trap skin belongs to its biome: the same three families (floor, beam, mine)
// in a different skin of colours, shapes and materials. Per skin there are at most three instance pools (static
// body, glowing parts, moving part), created the first time the skin appears, so a wave with a dozen traps costs
// a handful of draw calls and no per-frame allocations. Telegraphs keep the language of the boss hazards: a red
// ring that fills up, never used for decoration. The look of the idle trap stays dark and quiet.

import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { meshPart, mergeParts, box, ball, bar, spike } from "./models.js";
import { clamp, TAU, angleDiff } from "../core/util.js";

const WHITE = new Color(16777215),
  WARN = new Color(16728160),
  tint = new Color(),
  hex = (value) => new Color(value);

// skin colours: main (glow, particles), second (accent), debris
const LOOK = {
  plate: { main: hex(0x4de8ff), alt: hex(0xff4de0), dust: hex(0x9fb4c8) },
  crusher: { main: hex(0xff6a1f), alt: hex(0xffb347), dust: hex(0x9a8f80) },
  icespike: { main: hex(0x9ae6ff), alt: hex(0xffffff), dust: hex(0xdff6ff) },
  geyser: { main: hex(0xa8f03a), alt: hex(0xe6ff8a), dust: hex(0x4a7a1a) },
  riftburst: { main: hex(0xa56bff), alt: hex(0xff4de0), dust: hex(0x2a1650) },
  laser: { main: hex(0x2fe6ff), alt: hex(0xff4de0), dust: hex(0x9fb4c8) },
  flame: { main: hex(0xff7a1f), alt: hex(0xffd27a), dust: hex(0x9a8f80) },
  rift: { main: hex(0x9a5bff), alt: hex(0xff4de0), dust: hex(0x2a1650) },
  mine: { main: hex(0xff8a3a), alt: hex(0xffe0a0), dust: hex(0x6a6a72), led: hex(0xff3b2f) },
  frost: { main: hex(0x9ae6ff), alt: hex(0xffffff), dust: hex(0xdff6ff), led: hex(0xc8f6ff) },
  spore: { main: hex(0xa8f03a), alt: hex(0xe6ff8a), dust: hex(0x4a7a1a), led: hex(0xd7ff4a) },
  riftmine: { main: hex(0xa56bff), alt: hex(0xff4de0), dust: hex(0x2a1650), led: hex(0xff4de0) },
};
const NADE = hex(0xffb347),
  NADE_WHITE = hex(0xffeccc),
  ARMING = hex(0x6fa0ff),
  TRIGGER = hex(0xcfd8e6),
  MARK = hex(0xe6f2ff);

let seed = 7;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const cyl = (color, rt, rb, h, seg, p = {}) =>
    meshPart(new CylinderGeometry(rt, rb, h, seg), color, { ...p, y: (p.y || 0) + h / 2 }),
  cone = (color, r, h, seg, p = {}) => meshPart(new ConeGeometry(r, h, seg), color, { ...p, y: (p.y || 0) + h / 2 }),
  // a flat bar that runs radially at angle a from radius r0 to r1 (centre height y)
  rbar = (color, a, r0, r1, w, h, y) =>
    box(color, r1 - r0, h, w, { x: Math.cos(a) * (r0 + r1) * 0.5, y, z: Math.sin(a) * (r0 + r1) * 0.5, ry: -a }),
  ring = (n, fn) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(fn((i / n) * TAU, i));
    return out.flat();
  },
  easeOut = (k) => 1 - (1 - k) * (1 - k);

/* ==========================================================================
 Models. Floor traps are built for radius 1 (scaled to the trap's radius), mines and emitters in world units.
 body: Lambert with vertex colours; glow: unlit, vertex colour = hue, instance colour = brightness (mines: white
 vertices, the hue comes from the instance); mover: Lambert, animated by the instance matrix (head, crystals, ...).
 ========================================================================== */
const MODELS = {
  // Neon Yard: a steel floor plate with glowing conduits
  plate: () => ({
    body: [
      cyl(0x1a2230, 0.98, 1, 0.07, 8),
      cyl(0x252e40, 0.78, 0.8, 0.035, 8, { y: 0.07 }),
      ...ring(8, (a) => cyl(0x3b465c, 0.05, 0.06, 0.05, 6, { x: Math.cos(a) * 0.9, z: Math.sin(a) * 0.9, y: 0.07 })),
      ...ring(4, (a) => rbar(0x0d121b, a, 0.14, 0.8, 0.1, 0.02, 0.115)),
      ...ring(4, (a) => rbar(0x2f394d, a + Math.PI / 4, 0.55, 0.9, 0.05, 0.03, 0.09)),
    ],
    glow: [
      ...ring(4, (a) => rbar(0x4de8ff, a, 0.2, 0.76, 0.035, 0.012, 0.128)),
      box(0x4de8ff, 0.2, 0.014, 0.2, { y: 0.13, ry: Math.PI / 4 }),
      ...ring(8, (a, i) =>
        box(i % 2 ? 0xff4de0 : 0x4de8ff, 0.07, 0.02, 0.04, {
          x: Math.cos(a) * 0.93,
          y: 0.075,
          z: Math.sin(a) * 0.93,
          ry: -a,
        }),
      ),
      ...ring(4, (a) => box(0xff4de0, 0.05, 0.016, 0.05, { x: Math.cos(a) * 0.78, y: 0.12, z: Math.sin(a) * 0.78 })),
    ],
  }),
  // Ember Works: stamping press with hazard stripes and slag in the cracks
  crusher: () => {
    const stripes = [];
    for (let e = 0; e < 4; e++)
      for (let i = 0; i < 7; i++) {
        const u = (i - 3) * 0.2,
          vx = e % 2 ? (e === 1 ? 0.68 : -0.68) : u,
          vz = e % 2 ? u : e === 0 ? -0.68 : 0.68;
        stripes.push(
          box(i % 2 ? 0x1b1812 : 0x7a5d16, e % 2 ? 0.12 : 0.2, 0.08, e % 2 ? 0.2 : 0.12, { x: vx, y: 0.12, z: vz }),
        );
      }
    return {
      body: [
        box(0x2a2622, 1.55, 0.08, 1.55, { y: 0.04 }),
        box(0x120f0d, 1.1, 0.02, 1.1, { y: 0.09 }),
        ...stripes,
        ...ring(4, (a) =>
          cyl(0x3a3631, 0.09, 0.11, 1.15, 6, {
            x: Math.cos(a + Math.PI / 4) * 1.1,
            z: Math.sin(a + Math.PI / 4) * 1.1,
          }),
        ),
        ...ring(4, (a) =>
          cyl(0x55504a, 0.14, 0.14, 0.1, 6, {
            x: Math.cos(a + Math.PI / 4) * 1.1,
            z: Math.sin(a + Math.PI / 4) * 1.1,
            y: 1.15,
          }),
        ),
      ],
      glow: [
        ...ring(6, (a, i) =>
          rbar(0xff6a1f, a + i * 0.3, 0.1 + (i % 2) * 0.1, 0.5 + (i % 3) * 0.04, 0.04, 0.012, 0.105),
        ),
        ...ring(6, (a, i) => rbar(0xffb347, a + 0.5 + i * 0.2, 0.45, 0.6, 0.025, 0.012, 0.108)),
        box(0xffb347, 0.1, 0.014, 0.1, { y: 0.108, ry: 0.4 }),
      ],
      // the stamp: block with striped flanks and a piston rod; its underside is y = 0
      mover: [
        box(0x4a4540, 1, 0.32, 1, { y: 0.16 }),
        box(0x35312c, 0.72, 0.12, 0.72, { y: 0.38 }),
        cyl(0x6a655c, 0.12, 0.12, 0.9, 8, { y: 0.44 }),
        ...ring(4, (a) =>
          box(0x7a5d16, 0.06, 0.1, 0.5, {
            x: Math.cos(a) * 0.505,
            y: 0.22,
            z: Math.sin(a) * 0.505,
            ry: -a + Math.PI / 2,
          }),
        ),
        ...ring(4, (a) =>
          box(0x1b1812, 0.06, 0.1, 0.2, {
            x: Math.cos(a) * 0.505,
            y: 0.22,
            z: Math.sin(a) * 0.505,
            ry: -a + Math.PI / 2,
          }),
        ),
      ],
    };
  },
  // Cryo Vault: a frozen patch with cracks; crystals erupt from its middle
  icespike: () => {
    seed = 11;
    return {
      body: [
        cyl(0x2a4a63, 0.95, 1, 0.04, 14),
        cyl(0x3d6f90, 0.58, 0.62, 0.05, 12),
        ...ring(9, (a, i) => {
          const h = 0.28 + rnd() * 0.22;
          return spike(
            i % 2 ? 0xbfe6f7 : 0x7fb8d8,
            0.07 + rnd() * 0.03,
            5,
            [Math.cos(a) * 0.86, 0.02, Math.sin(a) * 0.86],
            [Math.cos(a) * 0.93, h, Math.sin(a) * 0.93],
          );
        }),
        ...ring(10, (a) =>
          box(0xa8d8ee, 0.12, 0.012, 0.07, {
            x: Math.cos(a + 0.2) * (0.3 + rnd() * 0.5),
            y: 0.062,
            z: Math.sin(a + 0.2) * (0.3 + rnd() * 0.5),
            ry: rnd() * 3,
          }),
        ),
      ],
      glow: [
        ...ring(6, (a, i) => rbar(0x9ae6ff, a + 0.2, 0.12, 0.55 + (i % 2) * 0.3, 0.03, 0.012, 0.075)),
        ...ring(6, (a) => rbar(0xffffff, a + 0.6, 0.62, 0.84, 0.02, 0.012, 0.077)),
      ],
      mover: [
        spike(0xcdeeff, 0.16, 6, [0, 0, 0], [0.02, 1, 0.01]),
        spike(0x8cc9ea, 0.12, 6, [0.14, 0, 0.04], [0.3, 0.72, 0.08]),
        spike(0xeaf8ff, 0.12, 6, [-0.1, 0, 0.12], [-0.22, 0.78, 0.2]),
        spike(0x8cc9ea, 0.11, 6, [-0.05, 0, -0.14], [-0.14, 0.62, -0.3]),
        spike(0xcdeeff, 0.1, 6, [0.1, 0, -0.12], [0.26, 0.5, -0.24]),
        spike(0xeaf8ff, 0.07, 5, [0.2, 0, 0.2], [0.4, 0.34, 0.34]),
        spike(0x8cc9ea, 0.07, 5, [-0.22, 0, -0.04], [-0.42, 0.3, -0.06]),
      ],
    };
  },
  // Toxin Marsh: a mud vent with a bubbling acid pool
  geyser: () => {
    seed = 5;
    return {
      body: [
        cyl(0x2c3a1c, 0.95, 1, 0.05, 12),
        cyl(0x34451f, 0.55, 0.9, 0.16, 12, { y: 0.03 }),
        meshPart(new TorusGeometry(0.5, 0.1, 6, 14), 0x3b4a25, { y: 0.18, rx: Math.PI / 2 }),
        cyl(0x07100a, 0.42, 0.42, 0.02, 12, { y: 0.19 }),
        ...ring(7, (a) =>
          ball(0x33401f, 0.1 + rnd() * 0.07, 6, 4, {
            x: Math.cos(a + rnd() * 0.4) * (0.78 + rnd() * 0.15),
            y: 0.05,
            z: Math.sin(a + rnd() * 0.4) * (0.78 + rnd() * 0.15),
            sy: 0.6,
          }),
        ),
        ...ring(5, (a) =>
          spike(
            0x56702a,
            0.04,
            4,
            [Math.cos(a) * 0.72, 0.1, Math.sin(a) * 0.72],
            [Math.cos(a) * 0.78, 0.36, Math.sin(a) * 0.78],
          ),
        ),
      ],
      glow: [
        cyl(0xa8f03a, 0.38, 0.38, 0.02, 12, { y: 0.2 }),
        ...ring(5, (a) => ball(0xe6ff8a, 0.045, 5, 3, { x: Math.cos(a) * 0.5, y: 0.2, z: Math.sin(a) * 0.5 })),
        ...ring(5, (a) =>
          ball(0xa8f03a, 0.04, 5, 3, { x: Math.cos(a + 0.3) * 0.85, y: 0.1, z: Math.sin(a + 0.3) * 0.85 }),
        ),
      ],
      mover: [meshPart(new SphereGeometry(0.4, 10, 6, 0, TAU, 0, Math.PI / 2), 0x6faa2a, { y: 0.2 })],
    };
  },
  // Void Core: an obsidian disc with a rotating sigil and a hovering shard
  riftburst: () => {
    seed = 3;
    return {
      body: [
        cyl(0x0c0a16, 0.96, 1, 0.05, 10),
        cyl(0x171028, 0.7, 0.72, 0.03, 10, { y: 0.05 }),
        ...ring(8, (a) => {
          const h = 0.35 + rnd() * 0.25;
          return spike(
            0x1a1230,
            0.06,
            4,
            [Math.cos(a) * 0.98, 0, Math.sin(a) * 0.98],
            [Math.cos(a) * 1.04, h, Math.sin(a) * 1.04],
          );
        }),
      ],
      glow: [
        ...ring(12, (a, i) =>
          i % 3 === 2
            ? []
            : box(0xa56bff, 0.2, 0.02, 0.06, {
                x: Math.cos(a) * 0.84,
                y: 0.09,
                z: Math.sin(a) * 0.84,
                ry: -a - Math.PI / 2,
              }),
        ),
        ...ring(3, (a) => rbar(0xff4de0, a, 0, 0.5, 0.035, 0.018, 0.1)),
        ...ring(3, (a) =>
          bar(
            0xa56bff,
            0.04,
            [Math.cos(a) * 0.5, 0.095, Math.sin(a) * 0.5],
            [Math.cos(a + 2.094) * 0.5, 0.095, Math.sin(a + 2.094) * 0.5],
            0.02,
          ),
        ),
        ball(0xffffff, 0.06, 5, 3, { y: 0.1 }),
      ],
      mover: [
        meshPart(new OctahedronGeometry(0.22), 0x5d3bb0, { sy: 1.5 }),
        meshPart(new OctahedronGeometry(0.12), 0x2a1650, { y: 0.34 }),
      ],
    };
  },
  // Neon Yard: laser turret
  laser: () => ({
    body: [
      cyl(0x20293a, 0.65, 0.7, 0.2, 6),
      cyl(0x2e384c, 0.26, 0.34, 0.5, 6, { y: 0.2 }),
      ...ring(3, (a) => cone(0x3b465c, 0.08, 0.45, 4, { x: Math.cos(a) * 0.55, z: Math.sin(a) * 0.55 })),
    ],
    glow: [
      ...ring(6, (a) =>
        box(0x4de8ff, 0.06, 0.02, 0.04, { x: Math.cos(a) * 0.66, y: 0.14, z: Math.sin(a) * 0.66, ry: -a }),
      ),
    ],
    mover: [
      box(0x39455c, 0.8, 0.28, 0.34, { x: 0.1 }),
      box(0x2a3345, 0.4, 0.1, 0.2, { x: -0.1, y: 0.19 }),
      meshPart(new CylinderGeometry(0.1, 0.12, 0.5, 8), 0x1a2230, { x: 0.65, rz: Math.PI / 2 }),
      box(0x4a566e, 0.08, 0.34, 0.5, { x: 0.3 }),
    ],
    moverGlow: [
      ball(0x2fe6ff, 0.13, 8, 6, { x: 0.93 }),
      box(0xff4de0, 0.6, 0.03, 0.05, { x: 0.1, y: 0.15 }),
      box(0x2fe6ff, 0.12, 0.05, 0.05, { x: 0.3, y: 0, z: 0.2 }),
      box(0x2fe6ff, 0.12, 0.05, 0.05, { x: 0.3, y: 0, z: -0.2 }),
    ],
  }),
  // Ember Works: flame thrower on a striped base
  flame: () => ({
    body: [
      box(0x2a2522, 0.95, 0.2, 0.95, { y: 0.1 }),
      ...ring(4, (a) =>
        box(0x7a5d16, 0.2, 0.06, 0.1, {
          x: Math.cos(a + Math.PI / 4) * 0.42,
          y: 0.23,
          z: Math.sin(a + Math.PI / 4) * 0.42,
          ry: -a,
        }),
      ),
      cyl(0x3a342f, 0.28, 0.34, 0.5, 8, { y: 0.2 }),
    ],
    glow: [
      ...ring(4, (a) =>
        box(0xff7a1f, 0.1, 0.02, 0.06, { x: Math.cos(a) * 0.4, y: 0.21, z: Math.sin(a) * 0.4, ry: -a }),
      ),
    ],
    mover: [
      box(0x4a4038, 0.7, 0.32, 0.4, { x: 0 }),
      meshPart(new CylinderGeometry(0.36, 0.17, 0.62, 10), 0x2a2522, { x: 0.62, rz: Math.PI / 2 }),
      meshPart(new CylinderGeometry(0.21, 0.21, 0.6, 8), 0x5a2a1a, { x: -0.05, y: 0.34, rz: Math.PI / 2 }),
      bar(0x6a655c, 0.05, [0.25, 0.34, 0.12], [0.45, 0.12, 0.1]),
    ],
    moverGlow: [
      ball(0xff7a1f, 0.12, 8, 6, { x: 0.92 }),
      ball(0xffd27a, 0.06, 6, 4, { x: 0.96 }),
      box(0xff7a1f, 0.1, 0.03, 0.4, { x: 0.3, y: 0.17 }),
    ],
  }),
  // Void Core: two prongs around a hovering violet core
  rift: () => {
    seed = 9;
    return {
      body: [
        cyl(0x0c0a16, 0.55, 0.62, 0.12, 8),
        ...ring(5, (a) =>
          spike(
            0x1a1230,
            0.1,
            4,
            [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45],
            [Math.cos(a) * 0.3, 0.55 + rnd() * 0.5, Math.sin(a) * 0.3],
          ),
        ),
      ],
      glow: [...ring(5, (a) => ball(0xa56bff, 0.04, 4, 3, { x: Math.cos(a) * 0.5, y: 0.14, z: Math.sin(a) * 0.5 }))],
      mover: [
        spike(0x2a1650, 0.1, 5, [0, 0.05, 0.2], [0.8, 0.05, 0.06]),
        spike(0x2a1650, 0.1, 5, [0, 0.05, -0.2], [0.8, 0.05, -0.06]),
        meshPart(new OctahedronGeometry(0.2), 0x3a1f70, { x: -0.1, sx: 1.4 }),
      ],
      moverGlow: [
        ball(0xa56bff, 0.17, 8, 6, { x: 0.45 }),
        ball(0xffffff, 0.08, 6, 4, { x: 0.45 }),
        meshPart(new TorusGeometry(0.34, 0.025, 4, 14), 0xff4de0, { x: 0.45, ry: Math.PI / 2 }),
      ],
    };
  },
  // mines: glow vertices are white, the hue comes from the instance
  mine: () => ({
    body: [
      cyl(0x232a38, 0.5, 0.58, 0.14, 10),
      meshPart(new SphereGeometry(0.34, 10, 5, 0, TAU, 0, Math.PI / 2), 0x2f394d, { y: 0.14, sy: 0.6 }),
      ...ring(4, (a) =>
        spike(
          0x4a566e,
          0.06,
          4,
          [Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5],
          [Math.cos(a) * 0.74, 0.1, Math.sin(a) * 0.74],
        ),
      ),
      ...ring(6, (a) =>
        cyl(0x4a566e, 0.04, 0.04, 0.05, 5, { x: Math.cos(a + 0.5) * 0.44, y: 0.14, z: Math.sin(a + 0.5) * 0.44 }),
      ),
    ],
    glow: [ball(0xffffff, 0.1, 8, 6, { y: 0.3 })],
  }),
  frost: () => {
    seed = 21;
    return {
      body: [
        cyl(0x3d6f90, 0.5, 0.56, 0.1, 6),
        ...ring(6, (a, i) =>
          spike(
            i % 2 ? 0xcdeeff : 0x8cc9ea,
            0.09,
            5,
            [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3],
            [Math.cos(a) * 0.38, 0.4 + rnd() * 0.25, Math.sin(a) * 0.38],
          ),
        ),
      ],
      glow: [ball(0xffffff, 0.13, 8, 6, { y: 0.3 })],
    };
  },
  spore: () => ({
    body: [
      meshPart(new SphereGeometry(0.4, 10, 7), 0x4b6a2a, { y: 0.3, sy: 0.8 }),
      cyl(0x2d4018, 0.3, 0.45, 0.08, 8),
      ...ring(4, (a) =>
        spike(
          0x2d4018,
          0.06,
          4,
          [Math.cos(a) * 0.4, 0.2, Math.sin(a) * 0.4],
          [Math.cos(a) * 0.68, 0.05, Math.sin(a) * 0.68],
        ),
      ),
      spike(0x56702a, 0.07, 5, [0, 0.52, 0], [0.04, 0.72, 0.02]),
    ],
    glow: [
      ...ring(5, (a) =>
        ball(0xffffff, 0.09, 5, 3, { x: Math.cos(a) * 0.34, y: 0.3 + (a > 3 ? 0.08 : 0), z: Math.sin(a) * 0.34 }),
      ),
      ball(0xffffff, 0.1, 5, 3, { y: 0.68 }),
    ],
  }),
  riftmine: () => ({
    body: [cyl(0x120d22, 0.3, 0.38, 0.05, 8)],
    glow: [
      meshPart(new TorusGeometry(0.46, 0.028, 4, 16), 0xffffff, { y: 0.75, rx: Math.PI / 2 }),
      ball(0xffffff, 0.06, 5, 3, { x: 0.46, y: 0.75 }),
      ball(0xffffff, 0.06, 5, 3, { x: -0.23, y: 0.75, z: 0.4 }),
      ball(0xffffff, 0.06, 5, 3, { x: -0.23, y: 0.75, z: -0.4 }),
    ],
    mover: [
      meshPart(new OctahedronGeometry(0.34), 0x2a1650, { y: 0.75, sy: 1.25 }),
      ...ring(3, (a) =>
        spike(
          0x1a1230,
          0.06,
          4,
          [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3],
          [Math.cos(a) * 0.2, 0.35, Math.sin(a) * 0.2],
        ),
      ),
    ],
  }),
  // the grenade itself: a squat canister with a lever and a hot ring
  nade: () => ({
    body: [
      meshPart(new SphereGeometry(0.17, 8, 6), 0x3b4132, { sy: 1.1 }),
      cyl(0x6a655c, 0.07, 0.08, 0.1, 6, { y: 0.15 }),
      box(0x6a655c, 0.2, 0.025, 0.05, { x: 0.08, y: 0.27 }),
      box(0x4a5040, 0.36, 0.04, 0.04, { y: 0 }),
    ],
    glow: [
      meshPart(new TorusGeometry(0.17, 0.022, 4, 12), 0xffb347, { rx: Math.PI / 2 }),
      ball(0xffe9b0, 0.05, 5, 3, { y: 0.27 }),
    ],
  }),
};
const FLAME_PARTS = [0, 0.2, 0.42, 0.66, 0.85, 1];
const MAX = { floor: 12, beam: 8, mine: 16 };

class TrapView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
    this.st = new Map();
    this.arr = null;
  }
  // the pools of a skin, built when first needed
  get(name, max = 16) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name](),
      mk = (parts, glow) => {
        const pool = new this.Pool(
          mergeParts(parts.flat()),
          glow
            ? new MeshBasicMaterial({ toneMapped: false, vertexColors: true })
            : new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
          max,
        );
        this.r.scene.add(pool.mesh);
        this.list.push(pool);
        pool.mesh.renderOrder = glow ? 2 : 1;
        return pool;
      };
    set = this.pl[name] = {
      body: mk(m.body, false),
      glow: m.glow ? mk(m.glow, true) : null,
      mover: m.mover ? mk(m.mover, false) : null,
      moverGlow: m.moverGlow ? mk(m.moverGlow, true) : null,
    };
    return set;
  }
  state(trap) {
    let s = this.st.get(trap.id);
    if (!s) {
      s = { fire: 9, last: trap.st, x: trap.x, z: trap.y, yaw: trap.a, pop: 9, shat: false };
      this.st.set(trap.id, s);
    }
    return s;
  }
  update(dt, world) {
    const traps = world.traps,
      r = this.r;
    if (this.arr !== traps) {
      this.arr = traps;
      this.st.clear();
    }
    const quality = Math.min(1, r.maxParticles / 1400);
    for (const trap of traps) {
      const s = this.state(trap),
        look = LOOK[trap.skin];
      if (!look) continue;
      s.fire += dt;
      s.pop += dt;
      if (trap.st !== s.last) {
        // a mine that comes back somewhere else pops out of the floor
        if (trap.st === "unarmed" && s.last === "gone") {
          s.pop = 0;
          s.x = trap.x;
          s.z = trap.y;
          r.ring(trap.x, trap.y, 0.2, 1.3, look.main, 0.4);
          r.burst(trap.x, trap.y, 0.15, 6, 2.5, look.main, 0.5, 0.25, { up: 2, drag: 2 });
        }
        s.last = trap.st;
      }
      if (trap.hunt) {
        const k = Math.min(1, dt * 12);
        s.x += (trap.x - s.x) * k;
        s.z += (trap.y - s.z) * k;
      } else {
        s.x = trap.x;
        s.z = trap.y;
      }
      this[trap.fam](trap, s, look, dt, quality, world);
    }
    this.grenades(dt, world, quality);
  }
  // the red ring that fills up: the same language as every other warning of the game
  warnRing(x, z, radius, k, fast) {
    // above the trap's own plate (y 0.2), or its body would hide the ring
    const r = this.r,
      ring = r.ringPool.y(x, 0.2, z, 0, radius);
    // a soft dark pool under the ring: red light on a pale floor (Cryo Vault) would wash out to pink-white
    r.shadows.y(x, 0.03, z, 0, radius * 2.6);
    r.ringPool.colC(ring, WARN, 0.6 + Math.sin(r.time * (fast ? 50 : 25)) * 0.25 * k);
    const disc = r.discs.y(x, 0.19, z, 0, radius * k);
    r.discs.colC(disc, WARN, 0.18 + k * 0.14);
    const edge = r.ringPool.y(x, 0.195, z, 0, radius * k);
    r.ringPool.colC(edge, WARN, 0.35);
    if (r.contrast) {
      const inner = r.ringPool.y(x, 0.2, z, 0, radius * 0.55);
      r.ringPool.colC(inner, WARN, 0.7);
    }
  }
  floor(trap, s, look, dt, quality) {
    const r = this.r,
      time = r.time,
      x = s.x,
      z = s.z,
      rr = trap.r,
      P = this.get(trap.skin, MAX.floor),
      warn = trap.st === "warn",
      k = warn ? clamp(trap.t / trap.delay, 0, 1) : 0,
      hit = s.fire < 0.3 ? 1 - s.fire / 0.3 : 0;
    P.body.y(x, 0, z, 0, rr, 1, rr);
    let glow = 0.4 + Math.sin(time * 2 + trap.id) * 0.1 + k * 0.7 + hit * 1.2;
    if (warn) glow += Math.sin(time * 36) * 0.18 * k;
    const emit = Math.random() < dt * (3 + k * 22) * quality;
    switch (trap.skin) {
      case "plate": {
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, glow);
        if (emit) {
          const a = Math.floor(Math.random() * 4) * 1.5708,
            d = (0.2 + Math.random() * 0.6) * rr;
          r.emit(x + Math.cos(a) * d, 0.15, z + Math.sin(a) * d, 0, 1 + k * 2, 0, 0.35, 0.16, look.main, {
            spark: true,
            drag: 1,
          });
        }
        break;
      }
      case "crusher": {
        P.glow.colC(
          P.glow.y(x, 0, z, 0, rr, 1, rr),
          WHITE,
          0.45 + Math.sin(time * 3 + trap.id) * 0.15 + k * 0.5 + hit * 1.5,
        );
        // the stamp winds up, hangs, and drops on the strike
        let h = 0.8;
        if (warn) h = k < 0.7 ? 0.8 + 0.5 * easeOut(k / 0.7) : 1.3 - 1.18 * Math.pow((k - 0.7) / 0.3, 2.2);
        else if (s.fire < 0.3) h = 0.12;
        else if (s.fire < 0.9) h = 0.12 + 0.68 * easeOut((s.fire - 0.3) / 0.6);
        const shake = warn && k > 0.4 && k < 0.7 ? Math.sin(time * 70) * 0.03 : 0;
        P.mover.y(x + shake, h, z, 0, rr * 1.05, 1, rr * 1.05);
        if (emit)
          r.emit(x + (Math.random() - 0.5) * rr, 0.2, z + (Math.random() - 0.5) * rr, 0, 1.5, 0, 0.5, 0.2, look.main, {
            spark: true,
          });
        break;
      }
      case "icespike": {
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, 0.35 + k * 0.9 + hit);
        let h = 0.2;
        if (warn) h = 0.2 + 0.55 * k * k;
        else if (s.fire < 0.07) h = 0.2 + 2.1 * (s.fire / 0.07);
        else if (s.fire < 0.35) h = 2.3 - 0.4 * ((s.fire - 0.07) / 0.28);
        else if (s.fire < 0.5) h = 1.9 * (1 - (s.fire - 0.35) / 0.15);
        else if (s.fire < 1.3) h = 0.2 * easeOut((s.fire - 0.5) / 0.8);
        if (!s.shat && s.fire > 0.35 && s.fire < 0.6) {
          s.shat = true;
          r.debrisBurst(x, z, 0.8, 8, look.dust, 0.14, 6);
          r.burst(x, z, 0.8, 10, 6, WHITE, 0.5, 0.2, { spark: true, drag: 3 });
        }
        if (h > 0.01)
          P.mover.y(x + (warn && k > 0.6 ? Math.sin(time * 60) * 0.02 : 0), 0, z, time * 0.2, rr * 0.9, h, rr * 0.9);
        if (emit)
          r.emit(
            x + (Math.random() - 0.5) * rr * 1.6,
            0.1,
            z + (Math.random() - 0.5) * rr * 1.6,
            0,
            0.5,
            0,
            0.8,
            0.14,
            WHITE,
            { spark: true, drag: 0 },
          );
        break;
      }
      case "geyser": {
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, 0.55 + Math.sin(time * 4 + trap.id) * 0.15 + k * 0.6 + hit);
        const dome = warn
          ? (0.15 + 0.85 * k) * (1 + Math.sin(time * 20) * 0.08 * k)
          : s.fire > 0.5
            ? easeOut(clamp((s.fire - 0.5) / 0.8, 0, 1)) * 0.15
            : 0;
        if (dome > 0.01) P.mover.y(x, 0, z, 0, rr * 0.55 * dome + rr * 0.1, dome * 1.1, rr * 0.55 * dome + rr * 0.1);
        if (s.fire < 0.55) {
          const f = s.fire / 0.55,
            h = 6 * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.1)), 0.7);
          r.columns.colC(r.columns.y(x, 0, z, 0, rr * 0.4, h, rr * 0.4), look.main, 0.95 * (1 - f * 0.5));
        }
        if (Math.random() < dt * (1.6 + k * 24) * quality) {
          const a = Math.random() * TAU;
          r.emit(
            x + Math.cos(a) * rr * 0.3,
            0.25,
            z + Math.sin(a) * rr * 0.3,
            0,
            1.2 + k * 2.5,
            0,
            0.6,
            0.2 + k * 0.1,
            Math.random() < 0.5 ? look.main : look.alt,
            { drag: 1, grow: 0.6 },
          );
        }
        break;
      }
      default: {
        // riftburst: the sigil turns faster as it charges, the shard rises and pulls things in
        P.glow.colC(
          P.glow.y(x, 0, z, time * (0.5 + k * 3), rr, 1, rr),
          WHITE,
          0.5 + Math.sin(time * 3) * 0.1 + k * 0.9 + hit * 1.4,
        );
        let h = 0.55 + Math.sin(time * 2 + trap.id) * 0.1,
          sc = 1;
        if (warn) {
          h += k * 0.8;
          sc = 1 + k * 0.5;
        } else if (s.fire < 0.5) {
          h = 0.4;
          sc = s.fire < 0.08 ? 1.8 : 0.3;
        }
        P.mover.y(x, h, z, time * (1.2 + k * 8), rr * 0.7 * sc, rr * 0.7 * sc, rr * 0.7 * sc);
        if (s.fire < 0.45) {
          const f = s.fire / 0.45;
          r.columns.colC(
            r.columns.y(x, 0, z, 0, rr * 0.3 * (1 - f * 0.4), 5.5 * (1 - f), rr * 0.3 * (1 - f * 0.4)),
            look.main,
            1 - f * 0.4,
          );
        }
        if (warn && Math.random() < dt * 30 * k * quality) {
          // dark motes fall into the sigil
          const a = Math.random() * TAU,
            d = rr * (0.8 + Math.random() * 0.25),
            life = 0.45;
          r.emit(
            x + Math.cos(a) * d,
            0.2 + Math.random() * 0.5,
            z + Math.sin(a) * d,
            (-Math.cos(a) * d) / life,
            0,
            (-Math.sin(a) * d) / life,
            life,
            0.2,
            Math.random() < 0.3 ? look.alt : look.main,
            { drag: 0 },
          );
        }
      }
    }
    if (warn) this.warnRing(x, z, rr, k, false);
  }
  beam(trap, s, look, dt, quality, world) {
    const r = this.r,
      time = r.time,
      x = trap.x,
      z = trap.y,
      P = this.get(trap.skin, MAX.beam);
    // the head follows the beam it fires (a second one crosses the first in Endless)
    let a1 = null,
      a2 = null,
      bt = 0;
    for (const beam of world.beams) {
      if (beam.skin !== trap.skin || beam.x !== trap.x || beam.y !== trap.y) continue;
      if (a1 === null) {
        a1 = beam.a;
        bt = beam.live ? 1 + beam.t : clamp(beam.t / beam.warn, 0, 1);
      } else a2 = beam.a;
    }
    const target = a1 === null ? trap.a : a1;
    s.yaw += angleDiff(s.yaw, target) * (a1 === null ? Math.min(1, dt * 4) : 1);
    const charge = a1 !== null && bt < 1 ? bt : 0,
      live = bt >= 1 ? 1 : 0,
      hover = trap.skin === "rift" ? 1.3 + Math.sin(time * 2.4 + trap.id) * 0.1 : trap.skin === "flame" ? 1.05 : 1.3;
    P.body.y(x, 0, z, 0, 1.35, 1.35, 1.35);
    P.glow.colC(
      P.glow.y(x, 0, z, 0, 1.35, 1.35, 1.35),
      WHITE,
      0.4 + charge * 0.8 + live * 1.1 + Math.sin(time * 4 + trap.id) * 0.1,
    );
    const heads = a2 === null ? 1 : 2;
    for (let i = 0; i < heads; i++) {
      const yaw = i ? a2 : s.yaw,
        recoil = live && trap.skin !== "flame" ? Math.sin(time * 60) * 0.015 : 0;
      P.mover.y(x, hover, z, yaw, 1.35 + recoil, 1.35, 1.35);
      P.moverGlow.colC(
        P.moverGlow.y(x, hover, z, yaw, 1.35 + recoil, 1.35, 1.35),
        WHITE,
        0.55 + charge * 0.9 + live * 1.2 + Math.sin(time * 9) * 0.08,
      );
    }
    const cy = Math.cos(s.yaw),
      sy = Math.sin(s.yaw);
    if (charge > 0) {
      // the head gathers its light: motes fly into the muzzle, and a glow swells (never yellow or red)
      const tx = x + cy * 1.25,
        tz = z + sy * 1.25;
      if (Math.random() < dt * (14 + charge * 40) * quality) {
        const ang = Math.random() * TAU,
          d = 0.8,
          life = 0.3;
        r.emit(
          tx + Math.cos(ang) * d,
          hover + Math.sin(ang) * d * 0.6,
          tz + Math.sin(ang * 1.7) * d * 0.4,
          (-Math.cos(ang) * d) / life,
          (-Math.sin(ang) * d * 0.6) / life,
          0,
          life,
          0.14,
          look.main,
          { drag: 0, spark: true },
        );
      }
      r.sprites.colC(r.sprites.bb(tx, hover, tz, 0.5 + charge * 1.3, r.B), look.main, 0.35 + charge * 0.5);
    }
    if (live) {
      const tx = x + cy * 1.3,
        tz = z + sy * 1.3;
      r.sprites.colC(r.sprites.bb(tx, hover, tz, 2.2 + Math.random() * 0.5, r.B), look.main, 0.8);
      if (trap.skin === "flame" && Math.random() < dt * 40 * quality)
        r.emit(tx, hover, tz, cy * 5, 1, sy * 5, 0.4, 0.3, look.alt, { drag: 2, grow: 1 });
    }
    // a faint line shows where the head points between bursts, so the next beam is not a surprise
    if (!charge && !live) {
      const dl = r.beams.seg(x + cy * 1.1, z + sy * 1.1, x + cy * 4, z + sy * 4, 0.05, 0.03, 0.02);
      r.beams.colC(dl, look.main, 0.1);
    }
  }
  // the beam of a trap, in the colours of its skin (the warning phase stays the red line of every beam)
  drawBeam(beam, ex, ez, len, time, dt) {
    const r = this.r,
      look = LOOK[beam.skin],
      ca = Math.cos(beam.a),
      sa = Math.sin(beam.a),
      b = r.beams;
    if (!beam.live) return false;
    const flick = 0.85 + Math.random() * 0.3;
    if (beam.skin === "flame") {
      // a cone that flares towards the end, with a hot white-yellow core
      const parts = FLAME_PARTS;
      for (let i = 0; i < 5; i++) {
        const w = beam.w * (0.5 + i * 0.28) * flick * (0.9 + Math.random() * 0.2),
          x0 = beam.x + ca * len * parts[i],
          z0 = beam.y + sa * len * parts[i],
          x1 = beam.x + ca * len * parts[i + 1],
          z1 = beam.y + sa * len * parts[i + 1];
        b.colC(b.seg(x0, z0, x1, z1, 1, w, w * 0.6), look.main, 0.5 - i * 0.04);
        b.colC(b.seg(x0, z0, x1, z1, 1, w * 0.5, w * 0.4), look.alt, 0.7 - i * 0.1);
      }
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.2, beam.w * 0.2), WHITE, 1);
      if (Math.random() < 0.6) {
        const d = Math.random() * len;
        r.emit(
          beam.x + ca * d,
          1 + Math.random() * 0.4,
          beam.y + sa * d,
          (Math.random() - 0.5) * 3,
          2 + Math.random() * 2,
          (Math.random() - 0.5) * 3,
          0.5,
          0.35,
          Math.random() < 0.5 ? look.main : look.alt,
          { drag: 1, grow: 1, grav: -2 },
        );
      }
    } else if (beam.skin === "rift") {
      // a writhing ribbon of violet with a thin bright core
      let px = beam.x,
        pz = beam.y;
      for (let i = 1; i <= 8; i++) {
        const along = (len * i) / 8,
          off = Math.sin(time * 9 + i * 1.3) * beam.w * 0.45 * (i < 8 ? 1 : 0),
          qx = beam.x + ca * along - sa * off,
          qz = beam.y + sa * along + ca * off;
        b.colC(b.seg(px, pz, qx, qz, 1, beam.w * flick, beam.w * 0.6), look.main, 0.75);
        px = qx;
        pz = qz;
      }
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.3, beam.w * 0.3), WHITE, 1);
      if (Math.random() < 0.6) {
        const d = Math.random() * len;
        r.emit(
          beam.x + ca * d - sa * beam.w,
          1,
          beam.y + sa * d + ca * beam.w,
          sa * 2.5,
          0,
          -ca * 2.5,
          0.35,
          0.22,
          Math.random() < 0.3 ? look.alt : look.main,
          { drag: 1 },
        );
      }
    } else {
      // laser: cyan body, white core and two thin magenta edges
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * flick, beam.w * 0.6), look.main, 0.7);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.3, beam.w * 0.3), WHITE, 1);
      for (const side of [-1, 1]) {
        const o = side * beam.w * 0.62;
        b.colC(b.seg(beam.x - sa * o, beam.y + ca * o, ex - sa * o, ez + ca * o, 1, 0.07, 0.07), look.alt, 0.85);
      }
      if (Math.random() < 0.5) {
        const d = Math.random() * len;
        r.emit(
          beam.x + ca * d,
          1,
          beam.y + sa * d,
          (Math.random() - 0.5) * 3,
          1.5,
          (Math.random() - 0.5) * 3,
          0.3,
          0.3,
          look.main,
          { spark: true },
        );
      }
    }
    // where it ends: a bright point and sparks
    r.sprites.colC(r.sprites.bb(ex, 1, ez, 1.6 + Math.random() * 0.4, r.B), look.main, 0.7);
    if (Math.random() < dt * 30)
      r.emit(
        ex,
        0.8,
        ez,
        (Math.random() - 0.5) * 6,
        2 + Math.random() * 3,
        (Math.random() - 0.5) * 6,
        0.35,
        0.2,
        look.alt,
        { spark: true, drag: 2, grav: 8 },
      );
    return true;
  }
  mine(trap, s, look, dt, quality) {
    if (trap.st === "gone") return;
    const r = this.r,
      time = r.time,
      x = s.x,
      z = s.z,
      P = this.get(trap.skin, MAX.mine),
      fuse = trap.st === "fuse",
      armed = trap.st === "armed",
      rise = trap.st === "unarmed" ? easeOut(clamp(s.pop / 0.6, 0, 1)) : 1,
      k = fuse ? clamp(trap.t / 0.45, 0, 1) : 0,
      y0 = -0.4 * (1 - rise),
      sc = (0.7 + 0.3 * rise) * 1.3;
    // the light: slow and dim while arming, a blink when armed, a frantic red blink on the fuse
    let col = ARMING,
      lum = 0.15 + clamp(trap.t / 1.5, 0, 1) * 0.35;
    if (armed) {
      col = look.led;
      lum = (time * 1.8 + trap.id * 0.37) % 1 < 0.28 ? 1.5 : 0.18;
    } else if (fuse) {
      col = WARN;
      lum = Math.floor(time * 18) % 2 ? 1.8 : 0.2;
    }
    let breathe = 1;
    if (trap.skin === "spore") breathe = (armed ? 1 + Math.sin(time * 5) * 0.05 : 1) * (fuse ? 1 + k * 0.55 : 1);
    P.body.y(x, y0, z, trap.id, sc * breathe, sc * breathe, sc * breathe);
    tint.copy(col).multiplyScalar(lum);
    const gy = trap.skin === "riftmine" ? y0 + Math.sin(time * 2.4 + trap.id) * 0.08 : y0;
    P.glow.colC(
      P.glow.y(
        x,
        gy,
        z,
        trap.skin === "riftmine" ? time * (fuse ? 6 : 1.4) : trap.id,
        sc * breathe,
        sc * breathe,
        sc * breathe,
      ),
      tint,
      1,
    );
    if (P.mover) P.mover.y(x, gy, z, time * (fuse ? 6 : 1.4), sc, sc, sc);
    if (armed || fuse) {
      const glowSprite = r.sprites.bb(x, 0.3, z, 1.2 + (fuse ? k * 0.6 : 0), r.B);
      r.sprites.colC(glowSprite, col, lum > 1 ? 0.5 : 0.1);
      // the area it will cover is only drawn faintly until something steps close
      if (armed) {
        const ringIdx = r.ringPool.y(x, 0.04, z, 0, 1.5);
        r.ringPool.colC(ringIdx, TRIGGER, 0.1 + Math.sin(time * 3 + trap.id) * 0.03);
      }
    }
    if (fuse) this.warnRing(x, z, trap.r, k, true);
    if (!fuse && !armed && Math.random() < dt * 2 * quality)
      r.emit(x, 0.3, z, 0, 0.6, 0, 0.5, 0.1, ARMING, { spark: true, drag: 1 });
  }
  /* trap events: strike effects per skin (the simulation already hurt whoever stood there) */
  event(ev, world, shakeK) {
    const r = this.r,
      look = LOOK[ev.skin];
    if (!look) return;
    if (ev.k === "trapArm") {
      r.ring(ev.x, ev.y, 0.2, 1.1, look.led || look.main, 0.3);
      r.burst(ev.x, ev.y, 0.3, 4, 3, look.led || look.main, 0.3, 0.2, { spark: true });
      return;
    }
    // trapFire
    const s = this.st.get(ev.id),
      x = ev.x,
      z = ev.y,
      rad = ev.r;
    if (s) {
      s.fire = 0;
      s.shat = false;
    }
    switch (ev.skin) {
      case "plate":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.35);
        r.ring(x, z, rad * 0.1, rad * 0.7, WHITE, 0.2);
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * TAU,
            d = rad * (0.6 + Math.random() * 0.5);
          r.line(x, z, x + Math.cos(a) * d, z + Math.sin(a) * d, i % 3 ? look.main : WHITE, 0.22, 0.1, 0.4, 0.35);
        }
        r.burst(x, z, 0.3, 18, 9, look.main, 0.4, 0.2, { spark: true, drag: 3 });
        r.debrisBurst(x, z, 0.2, 5, look.dust, 0.1, 4);
        r.flash(x, z, rad * 1.8, 1.4, look.main, 5);
        r.addScorch(x, z, rad * 0.45);
        r.addShake(0.12 * shakeK);
        break;
      case "crusher":
        r.ring(x, z, rad * 0.3, rad * 1.15, look.dust, 0.5);
        r.ring(x, z, rad * 0.1, rad * 0.8, look.main, 0.3);
        r.burst(x, z, 0.2, 18, rad * 3, look.dust, 0.7, 0.55, { drag: 4, grow: 1.5 });
        r.burst(x, z, 0.3, 14, 8, look.main, 0.5, 0.2, { spark: true, drag: 2, grav: 10 });
        r.debrisBurst(x, z, 0.3, 9, hex(0x4a4038), 0.2, 7);
        r.debrisBurst(x, z, 0.3, 4, look.main, 0.12, 6);
        r.flash(x, z, rad * 1.8, 1.2, look.main, 5);
        r.addScorch(x, z, rad * 0.6);
        r.addShake(0.4 * shakeK);
        break;
      case "icespike":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.4);
        r.burst(x, z, 0.3, 14, rad * 3, WHITE, 0.5, 0.2, { spark: true, drag: 3 });
        r.burst(x, z, 0.3, 8, rad * 2, look.main, 0.6, 0.3, { drag: 3, up: 4 });
        r.debrisBurst(x, z, 0.4, 10, hex(0xbfe6f7), 0.14, 7);
        r.flash(x, z, rad * 1.8, 1.1, look.main, 5);
        r.addShake(0.2 * shakeK);
        break;
      case "geyser":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.4);
        r.burst(x, z, 0.3, 24, 6, look.main, 0.8, 0.3, { drag: 1, up: 7, grav: 10 });
        r.burst(x, z, 0.3, 10, 4, look.alt, 0.9, 0.2, { drag: 1, up: 9, grav: 12, spark: true });
        r.debrisBurst(x, z, 0.3, 4, hex(0x33401f), 0.14, 4);
        r.flash(x, z, rad * 1.6, 1, look.main, 5);
        r.addShake(0.2 * shakeK);
        break;
      case "riftburst":
        r.ring(x, z, rad * 1.3, rad * 0.1, look.alt, 0.25);
        r.ring(x, z, rad * 0.2, rad * 1.2, look.main, 0.45);
        r.burst(x, z, 0.4, 20, rad * 4, look.main, 0.6, 0.3, { drag: 3 });
        r.burst(x, z, 0.4, 10, rad * 4, look.alt, 0.5, 0.2, { spark: true, drag: 3 });
        r.debrisBurst(x, z, 0.3, 6, hex(0x1a1230), 0.14, 5);
        r.flash(x, z, rad * 2, 1.4, look.main, 4);
        r.addShake(0.28 * shakeK);
        break;
      case "mine":
        r.ring(x, z, rad * 0.3, rad * 1.1, look.main, 0.4);
        r.ring(x, z, rad * 0.1, rad * 0.7, WHITE, 0.2);
        r.burst(x, z, 0.4, 24, rad * 3, look.main, 0.55, 0.45);
        r.burst(x, z, 0.4, 14, 10, look.alt, 0.4, 0.2, { spark: true, drag: 3 });
        r.debrisBurst(x, z, 0.3, 8, hex(0x4a566e), 0.15, 7);
        r.flash(x, z, rad * 2.2, 1.6, look.main, 4);
        r.addScorch(x, z, rad * 0.55);
        r.addShake(0.32 * shakeK);
        break;
      case "frost":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.45);
        r.burst(x, z, 0.4, 16, rad * 3.5, WHITE, 0.6, 0.2, { spark: true, drag: 3 });
        r.burst(x, z, 0.4, 10, rad * 3, look.main, 0.6, 0.35, { drag: 3 });
        r.debrisBurst(x, z, 0.4, 12, hex(0xbfe6f7), 0.14, 8);
        r.flash(x, z, rad * 2, 1.2, look.main, 4);
        r.addShake(0.25 * shakeK);
        break;
      case "spore":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.45);
        r.burst(x, z, 0.4, 22, rad * 2.2, look.main, 1.1, 0.5, { drag: 2, grow: 1.2 });
        r.burst(x, z, 0.4, 14, rad * 2.5, look.alt, 0.9, 0.18, { spark: true, drag: 1.5, up: 2 });
        r.debrisBurst(x, z, 0.3, 4, hex(0x4b6a2a), 0.14, 5);
        r.flash(x, z, rad * 1.8, 1.1, look.main, 4);
        r.addShake(0.2 * shakeK);
        break;
      default:
        // riftmine
        r.ring(x, z, rad * 1.3, rad * 0.1, look.alt, 0.25);
        r.ring(x, z, rad * 0.2, rad * 1.2, look.main, 0.45);
        r.burst(x, z, 0.4, 22, rad * 3.5, look.main, 0.6, 0.3, { drag: 3 });
        r.burst(x, z, 0.4, 10, rad * 3.5, look.alt, 0.5, 0.2, { spark: true, drag: 3 });
        r.debrisBurst(x, z, 0.3, 6, hex(0x1a1230), 0.14, 6);
        r.flash(x, z, rad * 2.2, 1.5, look.main, 4);
        r.addShake(0.3 * shakeK);
    }
  }
  /* the grenade: a tumbling canister on an arc with a trail, a shadow on the ground and a dashed gold marker
     where it lands (gold and white: never the red of a warning) */
  grenades(dt, world, quality) {
    const list = world.grenades;
    if (!list || !list.length) return;
    const r = this.r,
      time = r.time,
      P = this.get("nade", 12),
      radius = (world.stats && world.stats.gadgetR) || 3.4;
    for (const g of list) {
      const k = clamp(g.t / g.dur, 0, 1),
        dist = Math.hypot(g.tx - g.fx, g.ty - g.fy),
        arc = clamp(1.6 + dist * 0.14, 1.8, 4.6),
        x = g.fx + (g.tx - g.fx) * k,
        z = g.fy + (g.ty - g.fy) * k,
        h = 0.8 + Math.sin(Math.PI * k) * arc;
      P.body.yr(x, h, z, time * 6, 1.2, 1.2, 1.2, time * 11, time * 7);
      P.glow.colC(
        P.glow.yr(x, h, z, time * 6, 1.2, 1.2, 1.2, time * 11, time * 7),
        WHITE,
        1.1 + Math.sin(time * 30) * 0.3,
      );
      r.sprites.colC(r.sprites.bb(x, h, z, 0.9, r.B), NADE, 0.55);
      if (Math.random() < dt * 90 * quality)
        r.emit(
          x + (Math.random() - 0.5) * 0.1,
          h,
          z + (Math.random() - 0.5) * 0.1,
          0,
          0.3,
          0,
          0.35,
          0.2,
          Math.random() < 0.4 ? NADE_WHITE : NADE,
          { drag: 3, spark: Math.random() < 0.4 },
        );
      // shadow, smaller the higher the grenade is
      r.shadows.y(x, 0.02, z, 0, 0.9 - Math.min(0.5, h * 0.1));
      // landing marker: white ticks that turn and a ring that closes in (white, never the red of a warning)
      const spin = time * 1.4;
      for (let i = 0; i < 12; i++) {
        const a = spin + (i / 12) * TAU,
          x0 = g.tx + Math.cos(a) * radius,
          z0 = g.ty + Math.sin(a) * radius,
          x1 = g.tx + Math.cos(a + 0.2) * radius,
          z1 = g.ty + Math.sin(a + 0.2) * radius;
        r.beams.colC(r.beams.seg(x0, z0, x1, z1, 0.06, 0.08, 0.03), MARK, 0.35 + k * 0.45);
      }
      r.ringPool.colC(r.ringPool.y(g.tx, 0.05, g.ty, 0, radius * (1 - 0.45 * k)), MARK, 0.1 + k * 0.2);
      r.ringPool.colC(r.ringPool.y(g.tx, 0.05, g.ty, 0, 0.3 + 0.25 * k), MARK, 0.6);
    }
  }
  /* the blast of a grenade (a `boom` of kind "grenade"): a hot core, gold shock rings, debris and, with
     Napalm Cells, embers that glow on after the blast */
  blast(ev, world, shakeK) {
    const r = this.r,
      x = ev.x,
      z = ev.y,
      rad = ev.r,
      fire = world.stats && world.stats.gadgetFire;
    r.ring(x, z, rad * 0.25, rad * 1.05, NADE, 0.34);
    r.ring(x, z, rad * 0.1, rad * 0.65, NADE_WHITE, 0.2);
    r.ring(x, z, rad * 0.5, rad * 1.2, NADE, 0.6, 0.04);
    r.burst(x, z, 0.5, Math.round(10 + rad * 5), rad * 4, NADE, 0.5, 0.5, { drag: 3, grav: 6 });
    r.burst(x, z, 0.5, 14, rad * 5, NADE_WHITE, 0.35, 0.2, { spark: true, drag: 3, grav: 8 });
    r.emit(x, 0.7, z, 0, 0, 0, 0.16, rad * 2.2, NADE_WHITE, { drag: 0 });
    r.emit(x, 0.7, z, 0, 0.5, 0, 0.3, rad * 1.7, NADE, { drag: 0 });
    r.debrisBurst(x, z, 0.4, 9, hex(0x3b4132), 0.16, 8);
    r.flash(x, z, rad * 1.9, 1.5, NADE, 4);
    r.addScorch(x, z, rad * 0.6);
    r.addShake(0.3 * shakeK);
    const embers = fire ? 22 : 6;
    for (let i = 0; i < embers; i++) {
      const a = Math.random() * TAU,
        d = Math.random() * rad * 0.9;
      r.emit(
        x + Math.cos(a) * d,
        0.2,
        z + Math.sin(a) * d,
        (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 1.4,
        (Math.random() - 0.5) * 1.5,
        1.1 + Math.random() * (fire ? 1.4 : 0.6),
        0.1 + Math.random() * 0.06,
        Math.random() < 0.5 ? NADE : NADE_WHITE,
        { drag: 1.2, grav: -0.6, spark: true },
      );
    }
  }
}

export { TrapView };
