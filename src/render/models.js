// Mesh builders for the player drone, enemies, bosses and props.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";

/* ==========================================================================
 Enemy models (2.7.0 redesign). One merged BufferGeometry per type and layer: "body" takes the
 enemy colour (mid / dark / lite / pale shades, vertex colours, flat shading), "glow" is white and
 gets tinted per instance by the renderer. +x is the facing direction, y is up, the ground is y = 0.
 Every type has its own silhouette and one feature to remember it by. Biological types are round
 and asymmetric, machines keep hard forms with panels, vents and lights. Budget: about 400
 triangles per type (body + glow), the footprint stays in the size class of enemyDefs[type].r.
 ========================================================================== */
const PI = Math.PI,
  TAU_M = Math.PI * 2,
  RL_PALE_WHITE = new Color(16777215),
  limbUp = new Vector3(0, 1, 0),
  limbDir = new Vector3(),
  limbZ = new Vector3(),
  limbU = new Vector3(),
  limbC = new Vector3(),
  limbRoll = new Quaternion();
/* a part that runs from point a to point b; make(len) returns a geometry of that length along y.
   flat = true rolls it so that its local z (the thin side) points up, for blades and wings */
function limb(color, make, a, b, flat = false) {
  limbDir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = limbDir.length() || 1e-3;
  limbDir.divideScalar(len);
  const geo = make(len);
  geo.translate(0, len / 2, 0);
  const q = new Quaternion().setFromUnitVectors(limbUp, limbDir);
  if (flat) {
    limbZ.set(0, 0, 1).applyQuaternion(q);
    limbU.copy(limbUp).addScaledVector(limbDir, -limbUp.dot(limbDir));
    if (limbU.lengthSq() > 1e-6) {
      limbU.normalize();
      limbC.crossVectors(limbZ, limbU);
      q.premultiply(limbRoll.setFromAxisAngle(limbDir, Math.atan2(limbC.dot(limbDir), limbZ.dot(limbU))));
    }
  }
  return meshPart(geo, color, { x: a[0], y: a[1], z: a[2], q });
}
const spike = (color, r, seg, a, b) => limb(color, (len) => new ConeGeometry(r, len, seg), a, b),
  bar = (color, w, a, b, t = w) => limb(color, (len) => new BoxGeometry(w, len, t), a, b, t !== w),
  pipe = (color, r0, r1, seg, a, b) => limb(color, (len) => new CylinderGeometry(r1, r0, len, seg), a, b),
  ball = (color, r, w, h, p = {}) => meshPart(new SphereGeometry(r, w, h), color, p),
  box = (color, w, h, d, p = {}) => meshPart(new BoxGeometry(w, h, d), color, p),
  both = (make) => [].concat(make(1), make(-1));
const RL_ENEMY_BUILDERS = {
  swarmer: (P) => ({
    // dart bug: teardrop body, swept membrane wings, two big eyes, mandibles, tail sting
    body: [
      ball(P.mid, 0.24, 8, 6, { x: 0.02, y: 0.46, sx: 1.55, sy: 0.85 }),
      ball(P.lite, 0.15, 6, 4, { x: 0.3, y: 0.5 }),
      ...both((s) => [
        bar(P.dark, 0.3, [0.06, 0.55, s * 0.12], [-0.3, 0.6, s * 0.66], 0.025),
        bar(P.lite, 0.2, [0.16, 0.53, s * 0.1], [0.04, 0.56, s * 0.42], 0.025),
        spike(P.pale, 0.035, 3, [0.4, 0.42, s * 0.08], [0.64, 0.34, s * 0.22]),
      ]),
      spike(P.dark, 0.08, 4, [-0.3, 0.44, 0], [-0.66, 0.38, 0]),
    ],
    glow: [
      ...both((s) => [
        ball(P.white, 0.075, 6, 4, { x: 0.38, y: 0.58, z: s * 0.1 }),
        bar(P.white, 0.025, [-0.05, 0.575, s * 0.2], [-0.29, 0.6, s * 0.6], 0.02),
      ]),
    ],
  }),
  mite: (P) => ({
    // tick: a small crystal shell on six legs with one big eye
    body: [
      meshPart(new OctahedronGeometry(0.24), P.mid, { y: 0.3, sx: 1.3, sy: 0.7 }),
      ball(P.lite, 0.1, 6, 4, { x: 0.26, y: 0.28 }),
      spike(P.dark, 0.05, 4, [-0.05, 0.42, 0.08], [-0.18, 0.62, 0.1]),
      spike(P.dark, 0.05, 4, [-0.1, 0.4, -0.08], [-0.26, 0.56, -0.12]),
      ...both((s) => [
        bar(P.dark, 0.035, [0.12, 0.27, s * 0.12], [0.2, 0.02, s * 0.32]),
        bar(P.dark, 0.035, [0, 0.27, s * 0.14], [0.02, 0.02, s * 0.36]),
        bar(P.dark, 0.035, [-0.12, 0.27, s * 0.12], [-0.2, 0.02, s * 0.3]),
      ]),
    ],
    glow: [ball(P.white, 0.075, 6, 4, { x: 0.33, y: 0.34 }), box(P.white, 0.2, 0.03, 0.05, { x: -0.02, y: 0.44 })],
  }),
  splitter: (P) => ({
    // trefoil cell: three fused lobes of different size, each with a nucleus
    body: [
      ball(P.mid, 0.34, 7, 5, { x: 0.02, y: 0.62 }),
      ball(P.mid, 0.46, 7, 5, { x: 0.3, y: 0.7, z: 0.08, sy: 0.92 }),
      ball(P.lite, 0.4, 7, 5, { x: -0.27, y: 0.66, z: 0.38 }),
      ball(P.dark, 0.42, 7, 5, { x: -0.22, y: 0.64, z: -0.4, sy: 1.05 }),
      spike(P.pale, 0.05, 4, [0.1, 1.0, -0.05], [0.06, 1.28, -0.02]),
    ],
    glow: [
      meshPart(new IcosahedronGeometry(0.17, 0), P.white, { x: 0.42, y: 1.02, z: 0.08 }),
      meshPart(new IcosahedronGeometry(0.14, 0), P.white, { x: -0.3, y: 0.94, z: 0.4 }),
      meshPart(new IcosahedronGeometry(0.15, 0), P.white, { x: -0.24, y: 0.98, z: -0.42 }),
      meshPart(new OctahedronGeometry(0.1), P.white, { x: 0.04, y: 1.34, z: -0.02 }),
    ],
  }),
  leaper: (P) => ({
    // frog: crouched body, folded hind legs, bulging eyes (one bigger), wide mouth
    body: [
      ball(P.mid, 0.4, 9, 6, { x: -0.04, y: 0.46, sx: 1.25, sy: 0.75 }),
      ball(P.lite, 0.26, 7, 5, { x: 0.34, y: 0.42, sx: 1.2, sy: 0.7 }),
      ...both((s) => [
        bar(P.dark, 0.15, [-0.28, 0.5, s * 0.36], [-0.5, 0.4, s * 0.6], 0.14),
        bar(P.mid, 0.12, [-0.5, 0.4, s * 0.6], [-0.08, 0.06, s * 0.6], 0.11),
        box(P.pale, 0.3, 0.06, 0.14, { x: 0.06, y: 0.04, z: s * 0.6 }),
        bar(P.dark, 0.1, [0.3, 0.42, s * 0.28], [0.52, 0.06, s * 0.36], 0.1),
      ]),
    ],
    glow: [
      ball(P.white, 0.11, 6, 4, { x: 0.36, y: 0.7, z: 0.2 }),
      ball(P.white, 0.075, 6, 4, { x: 0.38, y: 0.66, z: -0.18 }),
      box(P.white, 0.06, 0.03, 0.34, { x: 0.55, y: 0.36 }),
    ],
  }),
  hive: (P) => ({
    // brood mound: a fat lumpy body with two smaller segments on top, hatch pods around the base
    body: [
      ball(P.mid, 0.95, 8, 6, { y: 0.85, sy: 0.85 }),
      ball(P.lite, 0.6, 7, 5, { x: -0.1, y: 1.6, z: 0.08 }),
      ball(P.dark, 0.38, 6, 4, { x: -0.12, y: 2.0, z: 0.14 }),
      ...[0.2, 2.3, 4.3].map((a, i) =>
        ball(i === 1 ? P.lite : P.dark, 0.3 + i * 0.03, 6, 4, {
          x: Math.cos(a) * 0.95,
          y: 0.48 + i * 0.12,
          z: Math.sin(a) * 0.95,
        }),
      ),
      spike(P.pale, 0.06, 4, [-0.1, 2.25, 0.1], [0.05, 2.75, 0.3]),
      spike(P.pale, 0.05, 4, [-0.2, 2.2, 0.2], [-0.5, 2.6, 0.5]),
    ],
    glow: [
      ...[0.2, 2.3, 4.3].map((a, i) =>
        meshPart(new IcosahedronGeometry(0.15, 0), P.white, {
          x: Math.cos(a) * 1.16,
          y: 0.5 + i * 0.12,
          z: Math.sin(a) * 1.16,
        }),
      ),
      meshPart(new OctahedronGeometry(0.16), P.white, { x: 0.05, y: 2.82, z: 0.3 }),
      ball(P.white, 0.12, 6, 4, { x: 0.62, y: 1.05, z: -0.4 }),
    ],
  }),
  carrier: (P) => ({
    // manta: flat body, swept wing tips, tail, three launch bays underneath
    body: [
      ball(P.mid, 0.6, 9, 5, { y: 0.62, sx: 1.15, sy: 0.3, sz: 1.05 }),
      ball(P.lite, 0.3, 7, 5, { x: 0.28, y: 0.72, sy: 0.7 }),
      ...both((s) => [
        bar(P.dark, 0.55, [0.05, 0.62, s * 0.45], [-0.45, 0.58, s * 1.1], 0.06),
        spike(P.pale, 0.08, 4, [-0.42, 0.58, s * 1.05], [-0.7, 0.55, s * 1.3]),
        box(P.metal, 0.3, 0.16, 0.26, { x: -0.05, y: 0.46, z: s * 0.66 }),
      ]),
      spike(P.dark, 0.11, 4, [-0.55, 0.6, 0], [-1.2, 0.5, 0]),
      box(P.metal, 0.28, 0.16, 0.3, { x: 0.4, y: 0.46 }),
    ],
    glow: [
      ...both((s) => [
        ball(P.white, 0.07, 6, 4, { x: 0.52, y: 0.8, z: s * 0.14 }),
        box(P.white, 0.14, 0.05, 0.06, { x: 0.02, y: 0.4, z: s * 0.66 }),
      ]),
      box(P.white, 0.12, 0.05, 0.06, { x: 0.5, y: 0.4 }),
      meshPart(new OctahedronGeometry(0.11), P.white, { x: -0.1, y: 0.98 }),
    ],
  }),
  mender: (P) => ({
    // healing bloom: round bulb in five uneven petals, a glowing cross floating above
    body: [
      ball(P.mid, 0.4, 8, 6, { y: 0.52, sy: 1.15 }),
      pipe(P.dark, 0.34, 0.16, 6, [0, 0.02, 0], [0, 0.3, 0]),
      ...[0, 1, 2, 3, 4].map((i) => {
        const a = 0.4 + (i / 5) * TAU_M,
          reach = 0.62 + (i % 2) * 0.16,
          top = 1.05 + (i % 3) * 0.14;
        return spike(
          i % 2 ? P.lite : P.dark,
          0.2,
          4,
          [Math.cos(a) * 0.22, 0.55, Math.sin(a) * 0.22],
          [Math.cos(a) * reach, top, Math.sin(a) * reach],
        );
      }),
    ],
    glow: [
      box(P.white, 0.46, 0.11, 0.11, { y: 1.05, x: 0.03 }),
      box(P.white, 0.11, 0.11, 0.46, { y: 1.05, x: 0.03 }),
      meshPart(new OctahedronGeometry(0.06), P.white, { x: 0.3, y: 0.85, z: 0.3 }),
      meshPart(new OctahedronGeometry(0.05), P.white, { x: -0.32, y: 0.95, z: -0.2 }),
      ball(P.white, 0.09, 6, 4, { x: 0.36, y: 0.52, z: 0.12 }),
    ],
  }),
  grunt: (P) => ({
    // bruiser: block torso, chest plate, big shoulders and fists, visor head
    body: [
      ...both((s) => [
        box(P.dark, 0.28, 0.4, 0.28, { y: 0.2, z: s * 0.28 }),
        box(P.lite, 0.34, 0.34, 0.34, { x: -0.04, y: 1.0, z: s * 0.6 }),
        bar(P.dark, 0.16, [0.02, 0.95, s * 0.62], [0.48, 0.6, s * 0.66]),
        box(P.metal, 0.26, 0.26, 0.26, { x: 0.56, y: 0.55, z: s * 0.68 }),
      ]),
      box(P.mid, 0.78, 0.6, 0.86, { y: 0.7 }),
      box(P.lite, 0.14, 0.44, 0.7, { x: 0.44, y: 0.68 }),
      box(P.metal, 0.4, 0.3, 0.46, { x: 0.24, y: 1.14 }),
      box(P.dark, 0.16, 0.5, 0.5, { x: -0.5, y: 0.78 }),
    ],
    glow: [
      box(P.white, 0.06, 0.09, 0.34, { x: 0.46, y: 1.16 }),
      ...[-0.2, 0, 0.2].map((z) => box(P.white, 0.04, 0.22, 0.05, { x: -0.59, y: 0.8, z })),
    ],
  }),
  gunner: (P) => ({
    // trooper: cylinder body, dome helmet with a visor, long rifle on the right arm, backpack
    body: [
      pipe(P.dark, 0.3, 0.34, 8, [0, 0.02, 0], [0, 0.3, 0]),
      pipe(P.mid, 0.36, 0.28, 8, [0, 0.3, 0], [0, 0.85, 0]),
      meshPart(new SphereGeometry(0.26, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), P.lite, { y: 0.85 }),
      pipe(P.metal, 0.06, 0.05, 6, [0.1, 0.62, 0.3], [0.95, 0.62, 0.3]),
      box(P.dark, 0.34, 0.14, 0.14, { x: 0.28, y: 0.62, z: 0.3 }),
      box(P.lite, 0.26, 0.26, 0.26, { x: -0.02, y: 0.86, z: 0.4 }),
      box(P.lite, 0.26, 0.26, 0.26, { x: -0.02, y: 0.86, z: -0.4 }),
      bar(P.dark, 0.12, [0.05, 0.6, -0.34], [0.26, 0.5, -0.4]),
      box(P.metal, 0.22, 0.46, 0.4, { x: -0.36, y: 0.6 }),
      spike(P.metal, 0.03, 3, [-0.4, 0.82, -0.1], [-0.5, 1.28, -0.12]),
    ],
    glow: [
      box(P.white, 0.05, 0.08, 0.3, { x: 0.24, y: 0.92 }),
      ball(P.white, 0.055, 5, 3, { x: 0.99, y: 0.62, z: 0.3 }),
      box(P.white, 0.04, 0.2, 0.03, { x: 0.36, y: 0.6, z: 0.15 }),
      ball(P.white, 0.04, 5, 3, { x: -0.5, y: 1.3, z: -0.12 }),
    ],
  }),
  bomber: (P) => ({
    // living bomb: round shell with a riveted band, scowling eyes and a burning fuse
    body: [
      ball(P.mid, 0.46, 10, 7, { y: 0.52, sy: 0.95 }),
      pipe(P.dark, 0.49, 0.49, 10, [0, 0.42, 0], [0, 0.6, 0]),
      ...both((s) => [
        box(P.metal, 0.16, 0.14, 0.2, { x: 0.1, y: 0.06, z: s * 0.26 }),
        box(P.dark, 0.2, 0.05, 0.16, { x: 0.42, y: 0.82, z: s * 0.14, rx: s * 0.4 }),
      ]),
      pipe(P.metal, 0.1, 0.07, 6, [0, 0.95, 0], [-0.08, 1.2, 0.04]),
      spike(P.metal, 0.04, 3, [-0.08, 1.18, 0.04], [-0.2, 1.36, 0.08]),
    ],
    glow: [
      ...both((s) => [box(P.white, 0.05, 0.11, 0.15, { x: 0.43, y: 0.66, z: s * 0.16, rx: s * -0.35 })]),
      ball(P.white, 0.1, 6, 4, { x: -0.22, y: 1.4, z: 0.1 }),
      ...[0, 2.1, 4.2].map((a) =>
        box(P.white, 0.06, 0.06, 0.06, { x: Math.cos(a) * 0.49, y: 0.52, z: Math.sin(a) * 0.49, ry: -a }),
      ),
    ],
  }),
  brute: (P) => ({
    // heavy walker: huge shoulders, two fists forward, sunken head between horns, exhaust stacks
    body: [
      ...both((s) => [
        box(P.dark, 0.5, 0.6, 0.5, { y: 0.3, z: s * 0.5, x: -0.05 }),
        box(P.lite, 0.66, 0.6, 0.6, { x: -0.05, y: 1.25, z: s * 0.98 }),
        bar(P.dark, 0.34, [0.1, 1.0, s * 0.98], [0.66, 0.66, s * 0.9]),
        box(P.metal, 0.5, 0.5, 0.5, { x: 0.82, y: 0.6, z: s * 0.9 }),
        spike(P.pale, 0.09, 4, [0.4, 1.5, s * 0.2], [0.78, 2.0, s * 0.42]),
        pipe(P.metal, 0.11, 0.09, 6, [-0.6, 1.4, s * 0.35], [-0.66, 2.0, s * 0.35]),
      ]),
      box(P.mid, 1.15, 0.8, 1.3, { x: -0.05, y: 0.95 }),
      box(P.dark, 0.5, 0.42, 0.56, { x: 0.52, y: 1.28 }),
      box(P.lite, 0.2, 0.5, 0.9, { x: 0.58, y: 0.86 }),
    ],
    glow: [
      ...both((s) => [
        box(P.white, 0.05, 0.1, 0.16, { x: 0.8, y: 1.3, z: s * 0.16 }),
        box(P.white, 0.06, 0.04, 0.3, { x: 1.08, y: 0.6, z: s * 0.9 }),
        ball(P.white, 0.07, 5, 3, { x: -0.66, y: 2.05, z: s * 0.35 }),
      ]),
      box(P.white, 0.04, 0.5, 0.06, { x: -0.64, y: 0.95, z: 0.4 }),
      box(P.white, 0.04, 0.5, 0.06, { x: -0.64, y: 0.95, z: -0.4 }),
    ],
  }),
  sniper: (P) => ({
    // tall tripod: narrow body, hood, a very long rifle and one big lens eye
    body: [
      ...[
        [0.3, 0.42],
        [-0.36, 0.26],
        [-0.28, -0.42],
      ].map(([x, z]) => bar(P.dark, 0.055, [0, 0.9, 0], [x, 0.02, z])),
      meshPart(new OctahedronGeometry(0.34), P.mid, { y: 1.0, sy: 1.6 }),
      spike(P.dark, 0.36, 5, [-0.08, 1.35, 0], [-0.3, 1.02, 0]),
      pipe(P.metal, 0.06, 0.045, 6, [-0.1, 1.05, 0.2], [1.5, 1.05, 0.2]),
      box(P.dark, 0.36, 0.13, 0.13, { x: 0.3, y: 1.05, z: 0.2 }),
      pipe(P.lite, 0.075, 0.075, 6, [0.5, 1.15, 0.2], [0.8, 1.15, 0.2]),
      spike(P.metal, 0.025, 3, [-0.2, 1.6, -0.1], [-0.36, 2.15, -0.1]),
    ],
    glow: [
      ball(P.white, 0.14, 7, 5, { x: 0.28, y: 1.28 }),
      ball(P.white, 0.05, 5, 3, { x: 1.54, y: 1.05, z: 0.2 }),
      meshPart(new OctahedronGeometry(0.06), P.white, { x: -0.36, y: 2.2, z: -0.1 }),
    ],
  }),
  bulwark: (P) => ({
    // riot walker: a big curved shield plate in front, helmet peeking over it
    body: [
      ...both((s) => [
        box(P.dark, 0.3, 0.42, 0.3, { x: -0.15, y: 0.21, z: s * 0.36 }),
        box(P.lite, 0.18, 0.95, 0.5, { x: 0.58, y: 0.72, z: s * 0.48, ry: s * -0.5 }),
        box(P.metal, 0.3, 0.3, 0.3, { x: -0.15, y: 1.0, z: s * 0.55 }),
      ]),
      box(P.mid, 0.8, 0.7, 0.9, { x: -0.2, y: 0.75 }),
      box(P.lite, 0.2, 1.0, 0.62, { x: 0.68, y: 0.74 }),
      box(P.metal, 0.4, 0.3, 0.48, { x: -0.15, y: 1.28 }),
      box(P.dark, 0.5, 0.3, 0.6, { x: -0.62, y: 0.86 }),
    ],
    glow: [
      box(P.white, 0.06, 0.08, 0.3, { x: 0.05, y: 1.32 }),
      box(P.white, 0.05, 0.05, 1.3, { x: 0.68, y: 1.26 }),
      ...both((s) => [box(P.white, 0.05, 0.05, 0.5, { x: 0.65, y: 1.0, z: s * 0.6, ry: s * -0.5 })]),
    ],
  }),
  striker: (P) => ({
    // blink blade: slim kite body, two forward katana, tail fins, a jet flame underneath
    body: [
      meshPart(new OctahedronGeometry(0.4), P.mid, { y: 0.72, sx: 1.5, sy: 0.7, sz: 0.8 }),
      meshPart(new OctahedronGeometry(0.16), P.lite, { x: 0.42, y: 0.76 }),
      ...both((s) => [
        bar(P.metal, 0.14, [0.1, 0.66, s * 0.22], [1.0, 0.6, s * 0.5], 0.025),
        bar(P.dark, 0.34, [-0.2, 0.74, s * 0.1], [-0.72, 0.96, s * 0.46], 0.03),
      ]),
      spike(P.dark, 0.14, 4, [0, 0.55, 0], [0, 0.1, 0]),
    ],
    glow: [
      box(P.white, 0.08, 0.05, 0.14, { x: 0.52, y: 0.82 }),
      ...both((s) => [bar(P.white, 0.03, [0.3, 0.64, s * 0.28], [1.0, 0.6, s * 0.5], 0.02)]),
      spike(P.white, 0.07, 4, [0, 0.42, 0], [0, 0.06, 0]),
    ],
  }),
  mortar: (P) => ({
    // artillery crawler: low armoured base with four feet, a steep tube, shells racked at the back
    body: [
      pipe(P.dark, 0.7, 0.62, 8, [0, 0.1, 0], [0, 0.42, 0]),
      ...[0.8, 2.35, 3.95, 5.5].map((a) =>
        box(P.metal, 0.36, 0.2, 0.28, { x: Math.cos(a) * 0.68, y: 0.1, z: Math.sin(a) * 0.68, ry: -a }),
      ),
      meshPart(new SphereGeometry(0.46, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), P.mid, { y: 0.42, sy: 0.9 }),
      pipe(P.metal, 0.19, 0.15, 8, [-0.05, 0.6, 0], [0.5, 1.4, 0]),
      pipe(P.lite, 0.23, 0.23, 8, [0.44, 1.28, 0], [0.54, 1.44, 0]),
      box(P.dark, 0.3, 0.3, 0.5, { x: -0.36, y: 0.8, rz: 0.2 }),
      ...[-0.16, 0, 0.16].map((z) => pipe(P.pale, 0.06, 0.06, 5, [-0.5, 0.35, z * 2.2], [-0.02, 0.35, z * 2.2])),
    ],
    glow: [
      pipe(P.white, 0.25, 0.25, 8, [0.51, 1.37, 0], [0.55, 1.43, 0]),
      ...[-0.16, 0, 0.16].map((z) => spike(P.white, 0.06, 5, [0.0, 0.35, z * 2.2], [0.14, 0.35, z * 2.2])),
      ...both((s) => [box(P.white, 0.06, 0.03, 0.2, { x: 0.3, y: 0.5, z: s * 0.5 })]),
    ],
  }),
  turret: (P) => ({
    // rift turret: hex base, column, a head with twin barrels and a roving sensor lens
    body: [
      pipe(P.dark, 0.7, 0.55, 6, [0, 0.02, 0], [0, 0.3, 0]),
      pipe(P.metal, 0.24, 0.17, 8, [0, 0.3, 0], [0, 0.66, 0]),
      box(P.mid, 0.6, 0.34, 0.52, { y: 0.9 }),
      box(P.lite, 0.4, 0.14, 0.44, { x: -0.02, y: 1.1 }),
      ...both((s) => [
        pipe(P.metal, 0.06, 0.06, 6, [0.25, 0.92, s * 0.14], [1.1, 0.92, s * 0.14]),
        box(P.dark, 0.36, 0.14, 0.12, { x: 0.36, y: 0.92, z: s * 0.14 }),
        box(P.dark, 0.22, 0.4, 0.14, { x: -0.1, y: 0.9, z: s * 0.36 }),
      ]),
      spike(P.metal, 0.03, 3, [-0.3, 1.0, 0.1], [-0.4, 1.5, 0.1]),
    ],
    glow: [
      ball(P.white, 0.11, 7, 5, { x: 0.16, y: 1.2 }),
      ...both((s) => [ball(P.white, 0.05, 5, 3, { x: 1.14, y: 0.92, z: s * 0.14 })]),
      pipe(P.white, 0.64, 0.64, 12, [0, 0.03, 0], [0, 0.06, 0]),
    ],
  }),
  charger: (P) => ({
    // rhino: low wedge with a single huge ram horn, small brow horns, stacked back armour
    body: [
      box(P.mid, 0.95, 0.5, 0.75, { x: -0.05, y: 0.52 }),
      box(P.dark, 0.5, 0.3, 0.6, { x: 0.4, y: 0.42, rz: -0.2 }),
      ...[0, 1, 2].map((i) => box(P.lite, 0.26, 0.14, 0.7 - i * 0.08, { x: -0.36 + i * 0.26, y: 0.84 + i * 0.03 })),
      ...both((s) => [
        box(P.dark, 0.3, 0.32, 0.22, { x: 0.28, y: 0.16, z: s * 0.3 }),
        box(P.dark, 0.3, 0.32, 0.22, { x: -0.38, y: 0.16, z: s * 0.3 }),
        spike(P.pale, 0.08, 4, [0.3, 0.8, s * 0.3], [0.62, 1.05, s * 0.44]),
      ]),
      spike(P.pale, 0.2, 6, [0.42, 0.55, 0], [1.2, 0.5, 0]),
    ],
    glow: [
      ...both((s) => [box(P.white, 0.06, 0.05, 0.16, { x: 0.46, y: 0.74, z: s * 0.24 })]),
      box(P.white, 0.4, 0.04, 0.05, { x: -0.3, y: 0.93, z: 0.15 }),
      box(P.white, 0.4, 0.04, 0.05, { x: -0.3, y: 0.93, z: -0.15 }),
      spike(P.white, 0.05, 4, [1.0, 0.51, 0], [1.24, 0.5, 0]),
    ],
  }),
  minebot: (P) => ({
    // crab: dome body, eye stalks, two pincers, and three glowing mines on its back
    body: [
      pipe(P.dark, 0.62, 0.56, 8, [0, 0.16, 0], [0, 0.34, 0]),
      meshPart(new SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), P.mid, { y: 0.34, sy: 0.9 }),
      ...both((s) => [
        bar(P.metal, 0.06, [0.2, 0.34, s * 0.4], [0.52, 0.05, s * 0.62]),
        bar(P.metal, 0.06, [-0.2, 0.34, s * 0.4], [-0.5, 0.05, s * 0.6]),
        bar(P.metal, 0.06, [0, 0.34, s * 0.5], [0.02, 0.05, s * 0.78]),
        bar(P.dark, 0.13, [0.3, 0.38, s * 0.36], [0.74, 0.32, s * 0.5]),
        spike(P.pale, 0.09, 4, [0.72, 0.32, s * 0.38], [1.02, 0.3, s * 0.3]),
        spike(P.pale, 0.09, 4, [0.72, 0.32, s * 0.62], [1.02, 0.3, s * 0.7]),
        bar(P.metal, 0.03, [0.4, 0.62, s * 0.14], [0.5, 0.86, s * 0.16]),
      ]),
    ],
    glow: [
      ...[0, 1, 2].map((k) => {
        const a = PI * 0.65 + k * 0.42;
        return ball(P.white, 0.11, 6, 4, { x: Math.cos(a) * 0.3 - 0.05, y: 0.8, z: Math.sin(a) * 0.3 - 0.08 });
      }),
      ...both((s) => [ball(P.white, 0.055, 5, 3, { x: 0.5, y: 0.88, z: s * 0.16 })]),
    ],
  }),
  sapper: (P) => ({
    // engineer: round body, welding mask with goggles, a backpack of dynamite, a big wrench
    body: [
      ...both((s) => [bar(P.dark, 0.14, [0, 0.4, s * 0.16], [0.02, 0.02, s * 0.2])]),
      pipe(P.mid, 0.34, 0.26, 8, [0, 0.36, 0], [0, 0.78, 0]),
      ball(P.dark, 0.24, 8, 5, { y: 0.98 }),
      box(P.metal, 0.16, 0.24, 0.34, { x: 0.18, y: 0.98 }),
      box(P.lite, 0.32, 0.5, 0.5, { x: -0.36, y: 0.55 }),
      ...[-0.13, 0, 0.13].map((z) => pipe(P.pale, 0.05, 0.05, 6, [-0.42, 0.82, z], [-0.42, 1.05, z])),
      bar(P.dark, 0.11, [0.06, 0.7, -0.3], [0.4, 0.56, -0.36]),
      bar(P.dark, 0.11, [0.06, 0.7, 0.3], [0.3, 0.6, 0.36]),
      bar(P.metal, 0.06, [0.3, 0.6, 0.36], [0.62, 0.66, 0.5]),
      box(P.metal, 0.12, 0.05, 0.22, { x: 0.66, y: 0.66, z: 0.52 }),
    ],
    glow: [
      ball(P.white, 0.065, 6, 4, { x: 0.28, y: 1.02, z: 0.09 }),
      ball(P.white, 0.065, 6, 4, { x: 0.28, y: 1.02, z: -0.09 }),
      ...[-0.13, 0, 0.13].map((z) => ball(P.white, 0.045, 5, 3, { x: -0.42, y: 1.1, z })),
      box(P.white, 0.05, 0.05, 0.4, { x: -0.54, y: 0.66 }),
    ],
  }),
  phantom: (P) => ({
    // wraith: flared cloak with torn hem, a pointed hood, long clawed arms, eyes and drifting wisps
    body: [
      spike(P.mid, 0.5, 7, [0, 0.16, 0], [0, 1.1, 0]),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const a = (i / 7) * TAU_M;
        return spike(
          i % 2 ? P.dark : P.mid,
          0.1,
          4,
          [Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4],
          [Math.cos(a) * 0.46, 0.02 + (i % 3) * 0.06, Math.sin(a) * 0.46],
        );
      }),
      ball(P.dark, 0.26, 7, 5, { x: 0.02, y: 1.18 }),
      spike(P.dark, 0.2, 6, [-0.06, 1.3, 0], [-0.42, 1.52, 0]),
      ...both((s) => [
        spike(P.dark, 0.09, 5, [0.14, 0.92, s * 0.3], [0.78, 0.78, s * 0.5]),
        spike(P.pale, 0.03, 3, [0.74, 0.78, s * 0.5], [0.98, 0.7, s * 0.6]),
      ]),
    ],
    glow: [
      ...both((s) => [meshPart(new OctahedronGeometry(0.075), P.white, { x: 0.24, y: 1.2, z: s * 0.1, sx: 1.6 })]),
      meshPart(new OctahedronGeometry(0.09), P.white, { x: -0.5, y: 0.7, z: 0.35 }),
      meshPart(new OctahedronGeometry(0.07), P.white, { x: -0.3, y: 1.05, z: -0.5 }),
      meshPart(new OctahedronGeometry(0.06), P.white, { x: 0.3, y: 0.5, z: -0.5 }),
    ],
  }),
  sentinel: (P) => ({
    // watcher: a pylon carrying a big eye inside a tilted, spiked ring
    body: [
      pipe(P.dark, 0.44, 0.16, 6, [0, 0.02, 0], [0, 0.6, 0]),
      ball(P.mid, 0.46, 8, 5, { y: 1.05 }),
      meshPart(new TorusGeometry(0.64, 0.065, 4, 14), P.metal, { y: 1.05, rx: 0.35 }),
      ...[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * TAU_M;
        return spike(
          P.lite,
          0.07,
          4,
          [Math.cos(a) * 0.66, 1.05 + Math.sin(a) * 0.2, Math.sin(a) * 0.66],
          [Math.cos(a) * 0.9, 1.05 + Math.sin(a) * 0.3, Math.sin(a) * 0.9],
        );
      }),
    ],
    glow: [
      ball(P.white, 0.2, 7, 5, { x: 0.36, y: 1.07 }),
      ball(P.dark, 0.09, 5, 3, { x: 0.53, y: 1.07 }),
      pipe(P.white, 0.48, 0.48, 12, [0, 0.03, 0], [0, 0.06, 0]),
    ],
  }),
  drone: (P) => ({
    // needler: small quad-rotor with a long needle nose and belly pods
    body: [
      box(P.mid, 0.4, 0.14, 0.3, { y: 0.82 }),
      ball(P.dark, 0.13, 6, 4, { x: 0.1, y: 0.9 }),
      spike(P.metal, 0.045, 4, [0.18, 0.8, 0], [0.78, 0.78, 0]),
      box(P.dark, 0.08, 0.18, 0.04, { x: -0.22, y: 0.94 }),
      ...both((s) => [
        bar(P.metal, 0.05, [0.08, 0.82, s * 0.14], [0.36, 0.86, s * 0.36], 0.04),
        bar(P.metal, 0.05, [-0.08, 0.82, s * 0.14], [-0.34, 0.86, s * 0.34], 0.04),
        box(P.dark, 0.2, 0.09, 0.09, { x: 0.12, y: 0.7, z: s * 0.12 }),
      ]),
    ],
    glow: [
      ...[
        [0.38, 0.38],
        [0.38, -0.38],
        [-0.36, 0.36],
        [-0.36, -0.36],
      ].map(([x, z]) => pipe(P.white, 0.17, 0.17, 8, [x, 0.87, z], [x, 0.9, z])),
      ball(P.white, 0.05, 5, 3, { x: 0.3, y: 0.93 }),
      box(P.white, 0.14, 0.03, 0.05, { x: -0.08, y: 0.9 }),
    ],
  }),
  driller: (P) => ({
    // digger: tracked body, cab with a lit window, a stepped drill and two exhaust stacks
    body: [
      ...both((s) => [
        box(P.dark, 1.0, 0.26, 0.24, { y: 0.13, z: s * 0.44 }),
        box(P.metal, 0.3, 0.18, 0.06, { x: 0.34, y: 0.13, z: s * 0.58 }),
        box(P.lite, 0.4, 0.16, 0.5, { x: 0.02, y: 0.62, z: s * 0.05 }),
        pipe(P.metal, 0.09, 0.08, 6, [-0.38, 0.74, s * 0.22], [-0.38, 1.2, s * 0.22]),
      ]),
      box(P.mid, 0.86, 0.46, 0.66, { y: 0.48 }),
      box(P.metal, 0.44, 0.34, 0.5, { x: -0.16, y: 0.9 }),
      pipe(P.dark, 0.3, 0.3, 8, [0.42, 0.48, 0], [0.62, 0.48, 0]),
      spike(P.pale, 0.34, 6, [0.6, 0.48, 0], [1.0, 0.48, 0]),
      spike(P.metal, 0.22, 6, [0.95, 0.48, 0], [1.28, 0.48, 0]),
      spike(P.pale, 0.12, 6, [1.22, 0.48, 0], [1.52, 0.48, 0]),
    ],
    glow: [
      box(P.white, 0.06, 0.13, 0.36, { x: 0.08, y: 0.94 }),
      ...both((s) => [ball(P.white, 0.06, 5, 3, { x: -0.38, y: 1.22, z: s * 0.22 })]),
      ...[0.7, 0.96].map((x) =>
        pipe(P.white, 0.36 - (x - 0.7) * 0.4, 0.36 - (x - 0.7) * 0.4, 8, [x, 0.48, 0], [x + 0.03, 0.48, 0]),
      ),
    ],
  }),
  beacon: (P) => ({
    // repair spire: a hex plinth and a tall mast, three arms holding orbiting gems around a crystal
    body: [
      pipe(P.dark, 0.58, 0.44, 6, [0, 0.02, 0], [0, 0.24, 0]),
      pipe(P.mid, 0.28, 0.13, 6, [0, 0.24, 0], [0, 1.2, 0]),
      ...[0, 1, 2].map((i) => {
        const a = 0.5 + (i / 3) * TAU_M;
        return bar(P.metal, 0.06, [0, 0.95, 0], [Math.cos(a) * 0.55, 1.15 + (i % 2) * 0.2, Math.sin(a) * 0.55]);
      }),
      ...[0, 1, 2].map((i) => {
        const a = 0.5 + (i / 3) * TAU_M + 0.6;
        return spike(
          P.lite,
          0.11,
          4,
          [Math.cos(a) * 0.4, 0.26, Math.sin(a) * 0.4],
          [Math.cos(a) * 0.62, 0.7, Math.sin(a) * 0.62],
        );
      }),
    ],
    glow: [
      meshPart(new OctahedronGeometry(0.22), P.white, { y: 1.55, sy: 1.6 }),
      ...[0, 1, 2].map((i) => {
        const a = 0.5 + (i / 3) * TAU_M;
        return meshPart(new OctahedronGeometry(0.11), P.white, {
          x: Math.cos(a) * 0.55,
          y: 1.15 + (i % 2) * 0.2,
          z: Math.sin(a) * 0.55,
          sy: 1.5,
        });
      }),
      meshPart(new TorusGeometry(0.34, 0.03, 3, 12), P.white, { y: 0.55, rx: PI / 2 }),
    ],
  }),
  weaver: (P) => ({
    // rift spider: small head and body, a big round abdomen, six jointed legs, fangs and eye cluster
    body: [
      meshPart(new OctahedronGeometry(0.28), P.mid, { x: 0.12, y: 0.62, sx: 1.2, sy: 0.85 }),
      ball(P.dark, 0.3, 7, 5, { x: -0.3, y: 0.66, sx: 1.2, sy: 0.9 }),
      meshPart(new OctahedronGeometry(0.16), P.lite, { x: 0.42, y: 0.64 }),
      ...[0, 1, 2]
        .map((k) =>
          both((s) => {
            const x = 0.22 - k * 0.22,
              out = 0.5 + (k === 1 ? 0.12 : 0);
            return [
              bar(P.metal, 0.06, [x, 0.6, s * 0.16], [x + 0.14 - k * 0.1, 0.8, s * out]),
              bar(P.metal, 0.05, [x + 0.14 - k * 0.1, 0.8, s * out], [x + 0.3 - k * 0.25, 0.02, s * (out + 0.42)]),
            ];
          }),
        )
        .flat(),
      ...both((s) => [spike(P.pale, 0.045, 3, [0.54, 0.6, s * 0.08], [0.72, 0.36, s * 0.06])]),
    ],
    glow: [
      meshPart(new OctahedronGeometry(0.07), P.white, { x: 0.5, y: 0.7, z: 0.07 }),
      meshPart(new OctahedronGeometry(0.07), P.white, { x: 0.5, y: 0.7, z: -0.07 }),
      meshPart(new OctahedronGeometry(0.05), P.white, { x: 0.46, y: 0.78 }),
      box(P.white, 0.36, 0.04, 0.07, { x: -0.3, y: 0.94 }),
      ball(P.white, 0.07, 6, 4, { x: -0.62, y: 0.6 }),
    ],
  }),
};
/* 2.9.0: a second pass over the 25 models: panels, vents, rivets, lamps, pupils, teeth, claws, tails and
   glowing cores. Every entry adds parts to the body and glow geometry of its type (same footprint, same
   two draw calls; +40..+150 triangles, every type stays under ~450). Biologicals get organs and spikes,
   machines get hard detail. */
const pupil = (P, r, x, y, z) => ball(P.dark, r, 5, 3, { x, y, z }),
  ringAround = (color, r, tube, y, p = {}) =>
    meshPart(new TorusGeometry(r, tube, 3, 12), color, { y, rx: PI / 2, ...p });
const RL_ENEMY_DETAIL = {
  swarmer: (P) => ({
    body: [
      spike(P.dark, 0.04, 3, [0.16, 0.66, 0], [0.12, 0.8, 0]),
      spike(P.dark, 0.04, 3, [0.0, 0.66, 0], [-0.06, 0.82, 0]),
      spike(P.dark, 0.035, 3, [-0.16, 0.62, 0], [-0.24, 0.74, 0]),
      ...both((s) => [
        bar(P.dark, 0.03, [0.12, 0.42, s * 0.14], [0.24, 0.22, s * 0.28]),
        bar(P.pale, 0.02, [0.42, 0.62, s * 0.06], [0.72, 0.88, s * 0.2]),
        spike(P.pale, 0.03, 3, [-0.46, 0.4, s * 0.03], [-0.56, 0.46, s * 0.14]),
        pupil(P, 0.04, 0.44, 0.58, s * 0.1),
      ]),
    ],
    glow: [
      box(P.white, 0.03, 0.03, 0.24, { x: 0.04, y: 0.655 }),
      box(P.white, 0.03, 0.03, 0.2, { x: -0.1, y: 0.64 }),
      box(P.white, 0.03, 0.03, 0.16, { x: -0.22, y: 0.6 }),
    ],
  }),
  mite: (P) => ({
    body: [
      box(P.lite, 0.3, 0.05, 0.07, { x: 0.0, y: 0.44 }),
      spike(P.pale, 0.05, 3, [-0.12, 0.4, 0.0], [-0.3, 0.46, 0.0]),
      bar(P.dark, 0.04, [0.26, 0.27, 0.04], [0.42, 0.2, 0.08]),
      bar(P.dark, 0.04, [0.26, 0.27, -0.04], [0.42, 0.2, -0.08]),
      box(P.lite, 0.08, 0.06, 0.18, { x: 0.1, y: 0.46 }),
      box(P.lite, 0.08, 0.06, 0.16, { x: -0.1, y: 0.44 }),
      ...both((s) => [
        spike(P.pale, 0.035, 3, [0.3, 0.3, s * 0.07], [0.52, 0.22, s * 0.11]),
        spike(P.pale, 0.04, 3, [0.05, 0.4, s * 0.12], [0.1, 0.56, s * 0.2]),
        bar(P.dark, 0.03, [0.2, 0.02, s * 0.32], [0.26, 0.0, s * 0.42]),
        bar(P.dark, 0.03, [-0.2, 0.02, s * 0.3], [-0.26, 0.0, s * 0.4]),
      ]),
    ],
    glow: [
      ...both((s) => [ball(P.white, 0.035, 5, 3, { x: 0.27, y: 0.33, z: s * 0.14 })]),
      meshPart(new OctahedronGeometry(0.06), P.white, { x: -0.14, y: 0.52, sy: 1.5 }),
    ],
  }),
  splitter: (P) => ({
    body: [
      ball(P.pale, 0.06, 5, 3, { x: 0.3, y: 1.12, z: 0.32 }),
      ball(P.pale, 0.05, 5, 3, { x: 0.52, y: 0.98, z: -0.12 }),
      ...[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * TAU_M + 0.2;
        return spike(
          P.dark,
          0.035,
          3,
          [Math.cos(a) * 0.62, 0.3, Math.sin(a) * 0.62],
          [Math.cos(a) * 0.82, 0.22, Math.sin(a) * 0.82],
        );
      }),
    ],
    glow: [
      ball(P.white, 0.045, 5, 3, { x: 0.68, y: 0.6, z: 0.18 }),
      ball(P.white, 0.04, 5, 3, { x: -0.48, y: 0.5, z: 0.6 }),
      ball(P.white, 0.04, 5, 3, { x: -0.5, y: 0.52, z: -0.6 }),
    ],
  }),
  leaper: (P) => ({
    body: [
      pupil(P, 0.06, 0.45, 0.72, 0.2),
      pupil(P, 0.045, 0.45, 0.68, -0.18),
      ...both((s) => [spike(P.pale, 0.03, 3, [0.52, 0.06, s * 0.36], [0.68, 0.04, s * 0.44])]),
    ],
    glow: [
      ball(P.white, 0.03, 4, 3, { x: 0.56, y: 0.52, z: 0.08 }),
      ball(P.white, 0.03, 4, 3, { x: 0.56, y: 0.52, z: -0.08 }),
    ],
  }),
  hive: (P) => ({
    body: [...both((s) => [spike(P.pale, 0.05, 3, [0.4, 1.55, s * 0.35], [0.6, 1.85, s * 0.5])])],
    glow: [
      ball(P.white, 0.07, 5, 3, { x: 0.66, y: 1.25, z: 0.47 }),
      ball(P.white, 0.06, 5, 3, { x: -0.5, y: 1.32, z: -0.6 }),
    ],
  }),
  carrier: (P) => ({
    body: [...both((s) => [pipe(P.metal, 0.1, 0.08, 6, [-0.3, 0.6, s * 0.16], [-0.6, 0.6, s * 0.16])])],
    glow: [...both((s) => [ball(P.white, 0.04, 5, 3, { x: -0.72, y: 0.55, z: s * 1.3 })])],
  }),
  mender: (P) => ({
    body: [
      ...[0, 1, 2].map((i) => {
        const a = 0.3 + (i / 3) * TAU_M;
        return spike(
          P.dark,
          0.05,
          3,
          [Math.cos(a) * 0.2, 0.15, Math.sin(a) * 0.2],
          [Math.cos(a) * 0.5, 0.0, Math.sin(a) * 0.5],
        );
      }),
      ball(P.pale, 0.05, 5, 3, { x: 0.3, y: 1.12, z: 0.22 }),
      ball(P.pale, 0.05, 5, 3, { x: -0.3, y: 1.2, z: 0.1 }),
    ],
    glow: [
      ringAround(P.white, 0.3, 0.018, 0.62),
      ball(P.white, 0.04, 5, 3, { x: 0.02, y: 0.78, z: 0.3 }),
      ball(P.white, 0.035, 5, 3, { x: -0.1, y: 0.9, z: -0.3 }),
    ],
  }),
  grunt: (P) => ({
    body: [
      ...[0, 1, 2].map((i) => box(P.dark, 0.03, 0.04, 0.3, { x: 0.52, y: 0.56 + i * 0.12 })),
      ...both((s) => [
        box(P.metal, 0.14, 0.08, 0.3, { x: 0.12, y: 0.06, z: s * 0.28 }),
        pipe(P.metal, 0.05, 0.05, 5, [-0.52, 0.5, s * 0.26], [-0.52, 1.2, s * 0.26]),
        box(P.metal, 0.06, 0.05, 0.06, { x: -0.04, y: 1.2, z: s * 0.75 }),
        box(P.metal, 0.06, 0.05, 0.06, { x: -0.04, y: 1.2, z: s * 0.45 }),
        box(P.lite, 0.16, 0.14, 0.18, { x: 0.3, y: 0.52, z: s * 0.68 }),
      ]),
      spike(P.metal, 0.025, 3, [-0.3, 1.05, 0.2], [-0.4, 1.6, 0.2]),
    ],
    glow: [
      ...both((s) => [ball(P.white, 0.045, 5, 3, { x: -0.04, y: 1.2, z: s * 0.6 })]),
      ball(P.white, 0.03, 4, 3, { x: -0.4, y: 1.62, z: 0.2 }),
    ],
  }),
  gunner: (P) => ({
    body: [
      box(P.dark, 0.36, 0.04, 0.05, { y: 1.12 }),
      box(P.dark, 0.22, 0.07, 0.07, { x: 0.5, y: 0.72, z: 0.3 }),
      box(P.metal, 0.08, 0.2, 0.06, { x: 0.3, y: 0.46, z: 0.3 }),
      bar(P.dark, 0.03, [-0.36, 0.65, 0.12], [0.0, 0.6, 0.26]),
      pipe(P.dark, 0.37, 0.37, 8, [0, 0.52, 0], [0, 0.58, 0]),
      box(P.metal, 0.06, 0.05, 0.06, { x: 0.3, y: 0.86, z: 0.3 }),
    ],
    glow: [
      ball(P.white, 0.03, 4, 3, { x: -0.48, y: 0.76, z: 0.06 }),
      ball(P.white, 0.03, 4, 3, { x: -0.48, y: 0.66, z: 0.06 }),
      box(P.white, 0.05, 0.03, 0.03, { x: 0.5, y: 0.78, z: 0.3 }),
    ],
  }),
  bomber: (P) => ({
    body: [
      box(P.dark, 0.14, 0.03, 0.08, { x: 0.05, y: 0.98 }),
      ...both((s) => [pipe(P.metal, 0.05, 0.05, 5, [-0.3, 0.7, s * 0.36], [-0.3, 0.86, s * 0.42])]),
    ],
    glow: [
      box(P.white, 0.12, 0.03, 0.06, { x: 0.05, y: 1.0 }),
      ball(P.white, 0.04, 5, 3, { x: -0.3, y: 0.9, z: 0.43 }),
    ],
  }),
  brute: (P) => ({
    body: [
      ...both((s) => [
        spike(P.pale, 0.05, 3, [1.06, 0.78, s * 0.76], [1.22, 0.76, s * 0.76]),
        spike(P.pale, 0.05, 3, [1.06, 0.6, s * 0.9], [1.22, 0.58, s * 0.9]),
      ]),
      ...[-0.15, -0.05, 0.05, 0.15].map((z) => box(P.pale, 0.05, 0.07, 0.04, { x: 0.78, y: 1.12, z })),
      ...[0, 1, 2].map((i) => box(P.dark, 0.06, 0.05, 0.5, { x: -0.66, y: 1.28 + i * 0.1 })),
    ],
    glow: [...both((s) => [ball(P.white, 0.04, 4, 3, { x: 0.86, y: 1.12, z: s * 0.15 })])],
  }),
  sniper: (P) => ({
    body: [
      box(P.dark, 0.6, 0.04, 0.05, { x: 0.7, y: 1.13, z: 0.2 }),
      box(P.metal, 0.1, 0.18, 0.08, { x: 0.12, y: 0.9, z: 0.2 }),
      pipe(P.metal, 0.075, 0.075, 6, [1.38, 1.05, 0.2], [1.52, 1.05, 0.2]),
      box(P.metal, 0.12, 0.03, 0.12, { x: 0.3, y: 0.02, z: 0.42 }),
      box(P.metal, 0.12, 0.03, 0.12, { x: -0.36, y: 0.02, z: 0.26 }),
      box(P.metal, 0.12, 0.03, 0.12, { x: -0.28, y: 0.02, z: -0.42 }),
      ball(P.lite, 0.06, 5, 3, { x: 0.0, y: 0.9 }),
      bar(P.metal, 0.03, [0.9, 1.05, 0.2], [1.0, 0.75, 0.3]),
      bar(P.metal, 0.03, [0.9, 1.05, 0.2], [1.0, 0.75, 0.1]),
      box(P.dark, 0.14, 0.14, 0.14, { x: 0.12, y: 1.25, z: 0.2 }),
    ],
    glow: [
      ball(P.white, 0.03, 4, 3, { x: -0.14, y: 1.28, z: 0.22 }),
      ball(P.white, 0.03, 4, 3, { x: -0.14, y: 1.36, z: 0.18 }),
      box(P.white, 0.05, 0.03, 0.03, { x: 0.7, y: 1.17, z: 0.2 }),
      ball(P.white, 0.045, 5, 3, { x: 0.2, y: 1.25, z: 0.29 }),
    ],
  }),
  bulwark: (P) => ({
    body: [
      ...[-0.4, -0.2, 0, 0.2, 0.4].flatMap((z) => [
        box(P.pale, 0.04, 0.05, 0.05, { x: 0.79, y: 0.38, z }),
        box(P.pale, 0.04, 0.05, 0.05, { x: 0.79, y: 1.14, z }),
      ]),
      box(P.dark, 0.36, 0.1, 0.06, { x: -0.15, y: 1.48 }),
      spike(P.metal, 0.025, 3, [-0.5, 1.3, 0.3], [-0.55, 1.75, 0.3]),
      box(P.dark, 0.1, 0.4, 0.06, { x: 0.76, y: 0.74 }),
      bar(P.dark, 0.09, [0.8, 0.24, -0.3], [0.8, 0.54, 0.0], 0.03),
      bar(P.dark, 0.09, [0.8, 0.54, 0.0], [0.8, 0.24, 0.3], 0.03),
      box(P.dark, 0.16, 0.08, 0.5, { x: -0.62, y: 1.08 }),
    ],
    glow: [
      ...both((s) => [ball(P.white, 0.05, 5, 3, { x: -0.15, y: 1.18, z: s * 0.6 })]),
      ball(P.white, 0.03, 4, 3, { x: -0.55, y: 1.78, z: 0.3 }),
    ],
  }),
  striker: (P) => ({
    body: [
      meshPart(new OctahedronGeometry(0.1), P.pale, { x: 0.15, y: 0.88, sx: 1.4 }),
      spike(P.dark, 0.06, 3, [-0.1, 0.85, 0], [-0.5, 1.06, 0]),
      ...both((s) => [
        pipe(P.metal, 0.06, 0.09, 6, [-0.35, 0.66, s * 0.12], [-0.62, 0.66, s * 0.12]),
        box(P.dark, 0.04, 0.12, 0.06, { x: 0.18, y: 0.66, z: s * 0.23 }),
        bar(P.lite, 0.04, [-0.3, 0.7, s * 0.22], [-0.58, 0.84, s * 0.36], 0.02),
        bar(P.lite, 0.1, [-0.05, 0.68, s * 0.14], [-0.4, 0.72, s * 0.44], 0.02),
        bar(P.dark, 0.08, [0.05, 0.64, s * 0.18], [-0.22, 0.68, s * 0.5], 0.02),
        spike(P.pale, 0.03, 3, [0.98, 0.6, s * 0.5], [1.12, 0.58, s * 0.52]),
      ]),
    ],
    glow: [
      ...both((s) => [
        spike(P.white, 0.05, 4, [-0.62, 0.66, s * 0.12], [-0.85, 0.66, s * 0.12]),
        bar(P.white, 0.025, [-0.1, 0.705, s * 0.16], [-0.38, 0.735, s * 0.42], 0.02),
      ]),
    ],
  }),
  mortar: (P) => ({
    body: [
      pipe(P.metal, 0.14, 0.14, 6, [-0.05, 0.82, 0], [-0.05, 0.9, 0]),
      ...both((s) => [bar(P.metal, 0.05, [0.1, 0.5, s * 0.22], [0.3, 1.0, s * 0.22])]),
    ],
    glow: [
      ...both((s) => [ball(P.white, 0.035, 4, 3, { x: 0.4, y: 0.16, z: s * 0.55 })]),
      ball(P.white, 0.04, 4, 3, { x: -0.05, y: 0.93 }),
    ],
  }),
  turret: (P) => ({
    body: [
      ...[0, 1, 2].map((i) => box(P.dark, 0.04, 0.03, 0.3, { x: -0.12 + i * 0.1, y: 1.09 })),
      ...both((s) => [bar(P.pale, 0.05, [0.05, 0.9, s * 0.36], [0.3, 0.93, s * 0.16], 0.04)]),
    ],
    glow: [...both((s) => [ball(P.white, 0.035, 4, 3, { x: 0.05, y: 0.98, z: s * 0.28 })])],
  }),
  charger: (P) => ({
    body: [
      pipe(P.dark, 0.22, 0.19, 6, [0.62, 0.54, 0], [0.7, 0.54, 0]),
      bar(P.dark, 0.08, [-0.5, 0.55, 0], [-0.86, 0.38, 0.08]),
      spike(P.pale, 0.05, 3, [-0.85, 0.38, 0.08], [-1.05, 0.3, 0.12]),
      ...[-0.24, 0, 0.24].map((z) => spike(P.pale, 0.04, 3, [-0.38, 0.9, z], [-0.46, 1.06, z])),
      ...both((s) => [
        box(P.dark, 0.12, 0.05, 0.1, { x: 0.5, y: 0.6, z: s * 0.18 }),
        box(P.lite, 0.5, 0.26, 0.05, { x: -0.06, y: 0.56, z: s * 0.4 }),
        box(P.metal, 0.06, 0.06, 0.06, { x: 0.12, y: 0.6, z: s * 0.44 }),
        box(P.metal, 0.06, 0.06, 0.06, { x: -0.24, y: 0.6, z: s * 0.44 }),
      ]),
    ],
    glow: [
      ...both((s) => [
        ball(P.white, 0.03, 4, 3, { x: 0.68, y: 0.5, z: s * 0.17 }),
        box(P.white, 0.3, 0.03, 0.03, { x: -0.06, y: 0.56, z: s * 0.43 }),
      ]),
    ],
  }),
  minebot: (P) => ({
    body: [pipe(P.dark, 0.54, 0.54, 8, [0, 0.33, 0], [0, 0.37, 0])],
    glow: [],
  }),
  sapper: (P) => ({
    body: [pipe(P.dark, 0.36, 0.36, 8, [0, 0.42, 0], [0, 0.48, 0])],
    glow: [],
  }),
  phantom: (P) => ({
    body: [
      spike(P.mid, 0.07, 4, [-0.3, 0.55, 0.05], [-0.9, 0.3, 0.15]),
      spike(P.mid, 0.06, 4, [-0.28, 0.45, -0.1], [-0.8, 0.14, -0.3]),
      spike(P.dark, 0.05, 4, [-0.2, 0.7, 0], [-0.7, 0.62, -0.2]),
      ...both((s) => [
        spike(P.pale, 0.025, 3, [0.78, 0.78, s * 0.5], [0.96, 0.68, s * 0.36]),
        spike(P.pale, 0.022, 3, [0.76, 0.78, s * 0.56], [0.98, 0.72, s * 0.7]),
        spike(P.pale, 0.022, 3, [0.74, 0.78, s * 0.44], [0.92, 0.62, s * 0.3]),
      ]),
      spike(P.dark, 0.06, 4, [-0.36, 1.42, 0], [-0.62, 1.7, 0.05]),
    ],
    glow: [
      meshPart(new OctahedronGeometry(0.05), P.white, { x: 0.3, y: 0.38, z: 0.4 }),
      meshPart(new OctahedronGeometry(0.045), P.white, { x: -0.9, y: 0.32, z: 0.16 }),
      box(P.white, 0.03, 0.22, 0.04, { x: 0.34, y: 0.6 }),
      box(P.white, 0.03, 0.14, 0.04, { x: 0.3, y: 0.78, z: 0.16 }),
      box(P.white, 0.03, 0.14, 0.04, { x: 0.3, y: 0.78, z: -0.16 }),
      box(P.white, 0.03, 0.12, 0.04, { x: 0.38, y: 0.42, z: -0.12 }),
    ],
  }),
  sentinel: (P) => ({
    body: [
      ...[0, 1, 2].map((i) => {
        const a = (i / 3) * TAU_M + 0.4;
        return spike(
          P.lite,
          0.09,
          4,
          [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3],
          [Math.cos(a) * 0.45, 0.5, Math.sin(a) * 0.45],
        );
      }),
    ],
    glow: [pipe(P.white, 0.33, 0.33, 10, [0, 0.35, 0], [0, 0.39, 0])],
  }),
  drone: (P) => ({
    body: [
      box(P.dark, 0.14, 0.08, 0.2, { x: -0.12, y: 0.74 }),
      ...[
        [0.38, 0.38],
        [0.38, -0.38],
        [-0.36, 0.36],
        [-0.36, -0.36],
      ].map(([x, z]) => pipe(P.metal, 0.03, 0.03, 4, [x, 0.83, z], [x, 0.9, z])),
      ...both((s) => [bar(P.metal, 0.025, [0.05, 0.74, s * 0.1], [0.14, 0.62, s * 0.3], 0.025)]),
    ],
    glow: [ball(P.white, 0.03, 4, 3, { x: 0.44, y: 0.78 }), box(P.white, 0.05, 0.03, 0.05, { x: -0.12, y: 0.79 })],
  }),
  driller: (P) => ({
    body: [
      ...both((s) => [box(P.pale, 0.05, 0.08, 0.1, { x: 0.44, y: 0.56, z: s * 0.22 })]),
      box(P.lite, 0.3, 0.03, 0.4, { x: -0.16, y: 1.08 }),
    ],
    glow: [...both((s) => [box(P.white, 0.03, 0.06, 0.08, { x: 0.46, y: 0.56, z: s * 0.22 })])],
  }),
  beacon: (P) => ({
    body: [
      pipe(P.metal, 0.3, 0.3, 6, [0, 0.5, 0], [0, 0.56, 0]),
      pipe(P.metal, 0.22, 0.22, 6, [0, 0.9, 0], [0, 0.95, 0]),
    ],
    glow: [ringAround(P.white, 0.23, 0.022, 0.75), ringAround(P.white, 0.19, 0.018, 1.05)],
  }),
  weaver: (P) => ({
    body: [
      spike(P.pale, 0.05, 3, [-0.6, 0.6, 0], [-0.85, 0.5, 0]),
      spike(P.dark, 0.03, 3, [0.3, 0.75, 0.12], [0.38, 0.92, 0.14]),
      spike(P.dark, 0.03, 3, [0.3, 0.75, -0.12], [0.38, 0.92, -0.14]),
      ...both((s) => [
        bar(P.dark, 0.04, [0.32, 0.6, s * 0.1], [0.5, 0.4, s * 0.18]),
        spike(P.dark, 0.03, 3, [-0.4, 0.88, s * 0.14], [-0.44, 1.04, s * 0.18]),
        spike(P.dark, 0.03, 3, [-0.18, 0.84, s * 0.12], [-0.2, 0.98, s * 0.16]),
      ]),
    ],
    glow: [
      box(P.white, 0.18, 0.02, 0.05, { x: -0.28, y: 0.935 }),
      box(P.white, 0.05, 0.02, 0.14, { x: -0.28, y: 0.94 }),
      ball(P.white, 0.03, 4, 3, { x: 0.52, y: 0.66, z: 0.05 }),
      ball(P.white, 0.03, 4, 3, { x: 0.52, y: 0.66, z: -0.05 }),
    ],
  }),
};
function enemyGeometry(type, color) {
  const base = new Color(color),
    palette = {
      mid: darken(color, 0.55),
      dark: darken(color, 0.3),
      lite: darken(color, 0.8),
      pale: base.clone().lerp(RL_PALE_WHITE, 0.6).multiplyScalar(0.8).getHex(),
      metal: 3818070,
      white: 16777215,
    },
    parts = (RL_ENEMY_BUILDERS[type] || RL_ENEMY_BUILDERS.grunt)(palette),
    extra = RL_ENEMY_DETAIL[type] ? RL_ENEMY_DETAIL[type](palette) : { body: [], glow: [] };
  return { body: mergeParts(parts.body.concat(extra.body)), glow: mergeParts(parts.glow.concat(extra.glow)) };
}

/* enemy types with a dedicated model (original 13 + the 12 above) */
const RL_MESH_TYPES = [
  "swarmer",
  "mite",
  "grunt",
  "gunner",
  "bomber",
  "splitter",
  "brute",
  "sniper",
  "hive",
  "bulwark",
  "striker",
  "mender",
  "mortar",
  "leaper",
  "turret",
  "charger",
  "minebot",
  "sapper",
  "phantom",
  "sentinel",
  "carrier",
  "drone",
  "driller",
  "beacon",
  "weaver",
];
function mergeGeometries(geometries, useGroups = false) {
  let isIndexed = geometries[0].index !== null,
    attributesUsed = new Set(Object.keys(geometries[0].attributes)),
    morphAttributesUsed = new Set(Object.keys(geometries[0].morphAttributes)),
    attributes = {},
    morphAttributes = {},
    morphTargetsRelative = geometries[0].morphTargetsRelative,
    merged = new BufferGeometry(),
    offset = 0;
  for (let i = 0; i < geometries.length; ++i) {
    let geometry = geometries[i],
      attributesCount = 0;
    if (isIndexed !== (geometry.index !== null)) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
          i +
          ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.",
      );
      return null;
    }
    for (let name in geometry.attributes) {
      if (!attributesUsed.has(name)) {
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            i +
            '. All geometries must have compatible attributes; make sure "' +
            name +
            '" attribute exists among all geometries, or in none of them.',
        );
        return null;
      }
      if (attributes[name] === undefined) {
        attributes[name] = [];
      }
      attributes[name].push(geometry.attributes[name]);
      attributesCount++;
    }
    if (attributesCount !== attributesUsed.size) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
          i +
          ". Make sure all geometries have the same number of attributes.",
      );
      return null;
    }
    if (morphTargetsRelative !== geometry.morphTargetsRelative) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
          i +
          ". .morphTargetsRelative must be consistent throughout all geometries.",
      );
      return null;
    }
    for (let name in geometry.morphAttributes) {
      if (!morphAttributesUsed.has(name)) {
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            i +
            ".  .morphAttributes must be consistent throughout all geometries.",
        );
        return null;
      }
      if (morphAttributes[name] === undefined) {
        morphAttributes[name] = [];
      }
      morphAttributes[name].push(geometry.morphAttributes[name]);
    }
    if (useGroups) {
      let count;
      if (isIndexed) count = geometry.index.count;
      else if (geometry.attributes.position !== undefined) count = geometry.attributes.position.count;
      else {
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            i +
            ". The geometry must have either an index or a position attribute",
        );
        return null;
      }
      merged.addGroup(offset, count, i);
      offset += count;
    }
  }
  if (isIndexed) {
    let indexOffset = 0,
      mergedIndex = [];
    for (let i = 0; i < geometries.length; ++i) {
      let index = geometries[i].index;
      for (let j = 0; j < index.count; ++j) mergedIndex.push(index.getX(j) + indexOffset);
      indexOffset += geometries[i].attributes.position.count;
    }
    merged.setIndex(mergedIndex);
  }
  for (let name in attributes) {
    let mergedAttribute = mergeAttributes(attributes[name]);
    if (!mergedAttribute) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " attribute.",
      );
      return null;
    }
    merged.setAttribute(name, mergedAttribute);
  }
  for (let name in morphAttributes) {
    let numMorphTargets = morphAttributes[name][0].length;
    if (numMorphTargets !== 0) {
      merged.morphAttributes = merged.morphAttributes || {};
      merged.morphAttributes[name] = [];
      for (let i = 0; i < numMorphTargets; ++i) {
        let toMerge = [];
        for (let j = 0; j < morphAttributes[name].length; ++j) toMerge.push(morphAttributes[name][j][i]);
        let mergedMorph = mergeAttributes(toMerge);
        if (!mergedMorph) {
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " +
              name +
              " morphAttribute.",
          );
          return null;
        }
        merged.morphAttributes[name].push(mergedMorph);
      }
    }
  }
  return merged;
}
function mergeAttributes(attributes) {
  let TypedArray,
    itemSize,
    normalized,
    gpuType = -1,
    arrayLength = 0;
  for (let i = 0; i < attributes.length; ++i) {
    let attribute = attributes[i];
    if (TypedArray === undefined) {
      TypedArray = attribute.array.constructor;
    }
    if (TypedArray !== attribute.array.constructor) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.",
      );
      return null;
    }
    if (itemSize === undefined) {
      itemSize = attribute.itemSize;
    }
    if (itemSize !== attribute.itemSize) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.",
      );
      return null;
    }
    if (normalized === undefined) {
      normalized = attribute.normalized;
    }
    if (normalized !== attribute.normalized) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.",
      );
      return null;
    }
    if (gpuType === -1) {
      gpuType = attribute.gpuType;
    }
    if (gpuType !== attribute.gpuType) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.",
      );
      return null;
    }
    arrayLength += attribute.count * itemSize;
  }
  let array = new TypedArray(arrayLength),
    result = new BufferAttribute(array, itemSize, normalized),
    offset = 0;
  for (let i = 0; i < attributes.length; ++i) {
    let attribute = attributes[i];
    if (attribute.isInterleavedBufferAttribute) {
      let tupleOffset = offset / itemSize;
      for (let j = 0, count = attribute.count; j < count; j++)
        for (let k = 0; k < itemSize; k++) {
          let value = attribute.getComponent(j, k);
          result.setComponent(j + tupleOffset, k, value);
        }
    } else array.set(attribute.array, offset);
    offset += attribute.count * itemSize;
  }
  if (gpuType !== undefined) {
    result.gpuType = gpuType;
  }
  return result;
}
const partMatrix = new Matrix4(),
  partQuat = new Quaternion(),
  partEuler = new Euler(),
  partScale = new Vector3(),
  partPos = new Vector3();
function meshPart(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, q = null } = {}) {
  let part = geo.index ? geo.toNonIndexed() : geo;
  if (q) partQuat.copy(q);
  else partQuat.setFromEuler(partEuler.set(rx, ry, rz));
  partMatrix.compose(partPos.set(x, y, z), partQuat, partScale.set(sx, sy, sz));
  part.applyMatrix4(partMatrix);
  part.deleteAttribute("uv");
  let col = new Color(color),
    count = part.attributes.position.count,
    colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  part.setAttribute("color", new BufferAttribute(colors, 3));
  return part;
}
function mergeParts(parts) {
  let merged = mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  return merged;
}
const darken = (color, factor = 0.5) => new Color(color).multiplyScalar(factor).getHex();
function shieldArcGeometry() {
  let geo = new CylinderGeometry(1.35, 1.35, 1.5, 20, 1, true, -Math.PI / 2.9, (Math.PI * 2) / 2.9);
  geo.rotateY(Math.PI / 2);
  geo.translate(0, 0.8, 0);
  return geo;
}
function discGeometry() {
  return mergeParts([
    meshPart(new CylinderGeometry(1, 1, 0.12, 20), 16777215),
    meshPart(new CylinderGeometry(0.45, 0.45, 0.2, 12), 10474239),
    meshPart(new BoxGeometry(2.1, 0.14, 0.18), 13625599),
  ]);
}
function debrisGeometry() {
  return new BoxGeometry(1, 1, 1);
}
function buildPlayerModel(weapon, color) {
  // 3.17.0: a walker instead of a gunship: a two-legged robot. A squat torso with a glowing visor and a back pack on a
  // pelvis, two legs (a thigh, a shin, a flat foot) that swing, bend and plant as the drone walks (setWalk), and the
  // weapon mount on top. The footprint (about 0.65 around the centre), the hull colours and the weapon colour on the
  // glowing parts are the same as before; `base` is still the part that turns with the drone, `turret` aims.
  const hullMat = new MeshLambertMaterial({ color: 2898514, emissive: 0, flatShading: true }),
    trimMat = new MeshLambertMaterial({ color: 9348036, emissive: 0, flatShading: true }),
    glowMat = new MeshBasicMaterial({ color, toneMapped: false }),
    visorMat = new MeshLambertMaterial({ color: 7454463, emissive: 1058362, flatShading: true }),
    group = new Group(),
    base = new Group(),
    torso = new Group(),
    HIP = 0.6,
    THIGH = 0.28,
    SHIN = 0.28,
    addPart = (parts, material, parent) => {
      const mesh = new Mesh(mergeParts(parts), material);
      parent.add(mesh);
      return mesh;
    },
    // the torso: a pelvis box, a chest that is wider at the shoulders, a back pack with a glowing vent, a visor
    hull = [
      box(2898514, 0.34, 0.14, 0.5, { x: 0, y: HIP + 0.02 }),
      ball(2898514, 0.4, 8, 5, { x: -0.02, y: HIP + 0.3, sx: 1.05, sy: 0.7, sz: 0.95 }),
      ...both((s) => [
        // shoulders and upper arms, short and blocky (the weapon is on the back, the arms hold the sides)
        box(2898514, 0.2, 0.26, 0.16, { x: 0, y: HIP + 0.34, z: s * 0.44 }),
        bar(2898514, 0.1, [0.02, HIP + 0.26, s * 0.5], [0.16, HIP + 0.04, s * 0.5], 0.1),
      ]),
      box(2898514, 0.3, 0.32, 0.42, { x: -0.3, y: HIP + 0.36 }),
    ],
    trim = [
      box(9348036, 0.38, 0.05, 0.54, { x: 0, y: HIP + 0.1 }),
      ...both((s) => [
        pipe(9348036, 0.07, 0.07, 6, [-0.42, HIP + 0.5, s * 0.14], [-0.5, HIP + 0.14, s * 0.14]),
        box(9348036, 0.12, 0.1, 0.14, { x: 0.18, y: HIP + 0.02, z: s * 0.2 }),
      ]),
      box(9348036, 0.16, 0.05, 0.3, { x: 0.3, y: HIP + 0.52 }),
    ],
    glowParts = [
      box(color, 0.04, 0.05, 0.36, { x: 0.38, y: HIP + 0.34 }),
      ...both((s) => [
        box(color, 0.2, 0.03, 0.04, { x: -0.3, y: HIP + 0.46, z: s * 0.12 }),
        ball(color, 0.04, 5, 3, { x: 0.12, y: HIP + 0.04, z: s * 0.5 }),
      ]),
    ];
  addPart(hull, hullMat, torso);
  addPart(trim, trimMat, torso);
  addPart(glowParts, glowMat, torso);
  const visor = new Mesh(new BoxGeometry(0.1, 0.14, 0.34), visorMat);
  visor.position.set(0.34, HIP + 0.36, 0);
  torso.add(visor);
  base.add(torso);
  // the legs: a group at the hip (pitch about z: positive swings the foot forward), a knee group below it
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new Group(),
      knee = new Group(),
      ankle = new Group();
    hip.position.set(0, HIP, side * 0.2);
    hip.add(
      new Mesh(
        mergeParts([bar(2898514, 0.12, [0, 0, 0], [0.02, -THIGH, 0], 0.14), ball(9348036, 0.09, 6, 4)]),
        hullMat,
      ),
    );
    knee.position.set(0.02, -THIGH, 0);
    knee.add(
      new Mesh(
        mergeParts([bar(9348036, 0.1, [0, 0, 0], [-0.02, -SHIN, 0], 0.12), ball(2898514, 0.075, 6, 4)]),
        trimMat,
      ),
    );
    ankle.position.set(-0.02, -SHIN, 0);
    ankle.add(new Mesh(mergeParts([box(2898514, 0.3, 0.07, 0.17, { x: 0.07, y: 0.0 })]), hullMat));
    ankle.add(new Mesh(mergeParts([box(color, 0.04, 0.03, 0.14, { x: 0.22, y: 0.0 })]), glowMat));
    // the glow of the weapon colour on the knee and the outer side of the shin (the dark legs read against the floor)
    knee.add(
      new Mesh(
        mergeParts([
          ball(color, 0.055, 5, 3, { x: 0.03, z: side * 0.03 }),
          bar(color, 0.035, [0.02, -0.05, side * 0.075], [-0.01, -SHIN + 0.06, side * 0.075], 0.03),
        ]),
        glowMat,
      ),
    );
    knee.add(ankle);
    hip.add(knee);
    base.add(hip);
    legs.push({ hip, knee, ankle, side });
  }
  base.rotation.order = "YZX";
  group.add(base);
  /* the walk cycle: `phase` (radians, one cycle is two steps; core/walk.js: a foot comes down every metre), `amount`
     how much the drone walks (0 standing, 1 at full speed), `air` 0..1 how far a dash has it up (the legs tuck).
     The thigh swings, the knee bends while the leg swings forward, the torso turns against the hips and the body
     bobs; standing still the body breathes. Returns the height of the body above the ground. */
  const setWalk = (phase, amount, air, time) => {
    let bob = 0;
    for (const leg of legs) {
      const p = phase + (leg.side > 0 ? 0 : Math.PI),
        swing = Math.sin(p) * 0.85 * amount,
        bend = Math.max(0, Math.cos(p)) * 1.0 * amount;
      // in the air both legs tuck: knees up, feet under the body
      leg.hip.rotation.z = swing * (1 - air) + 0.55 * air;
      leg.knee.rotation.z = -bend * (1 - air) - 1.1 * air;
      leg.ankle.rotation.z = (bend * 0.5 - swing * 0.3) * (1 - air) + 0.5 * air;
    }
    torso.rotation.y = Math.sin(phase) * 0.12 * amount;
    torso.rotation.z = Math.sin(phase * 2) * 0.02 * amount;
    bob = -Math.abs(Math.sin(phase)) * 0.07 * amount;
    // breathing while it stands
    bob += Math.sin(time * 2.2) * 0.012 * (1 - amount);
    return bob;
  };
  let turret = new Group();
  turret.position.y = HIP + 0.62;
  turret.position.x = -0.05;
  let dome = new Mesh(new SphereGeometry(0.21, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), trimMat);
  turret.add(dome);
  let sight = new Mesh(new BoxGeometry(0.08, 0.08, 0.3), glowMat);
  sight.position.set(0.22, 0.12, 0);
  turret.add(sight);
  let addBarrel = (len, thick, z = 0, y = 0.02) => {
    let tube = new Mesh(new BoxGeometry(len, thick, thick), hullMat);
    tube.position.set(len / 2 + 0.12, y, z);
    let tip = new Mesh(new BoxGeometry(0.08, thick * 1.2, thick * 1.2), glowMat);
    tip.position.set(len + 0.14, y, z);
    turret.add(tube, tip);
  };
  if (weapon === "scatter") {
    addBarrel(0.5, 0.13, 0.1);
    addBarrel(0.5, 0.13, -0.1);
  } else if (weapon === "rail") {
    addBarrel(0.95, 0.1);
    let rail = new Mesh(new BoxGeometry(0.8, 0.04, 0.26), trimMat);
    rail.position.set(0.55, 0.02, 0);
    turret.add(rail);
  } else if (weapon === "rocket") {
    let pod = new Mesh(new BoxGeometry(0.46, 0.26, 0.36), hullMat);
    pod.position.set(0.3, 0.05, 0);
    turret.add(pod);
    for (let z of [-0.09, 0.09])
      for (let y of [-0.03, 0.12]) {
        let tube = new Mesh(new BoxGeometry(0.05, 0.08, 0.08), glowMat);
        tube.position.set(0.55, y, z);
        turret.add(tube);
      }
  } else if (weapon === "tesla") {
    addBarrel(0.55, 0.12);
    let coil = new Mesh(new TorusGeometry(0.12, 0.03, 5, 14), glowMat);
    coil.rotation.y = Math.PI / 2;
    coil.position.set(0.45, 0.02, 0);
    let coil2 = coil.clone();
    coil2.position.x = 0.3;
    turret.add(coil, coil2);
  } else if (weapon === "disc") {
    let mount = new Mesh(new BoxGeometry(0.62, 0.08, 0.34), hullMat);
    mount.position.set(0.35, 0, 0);
    let disc = new Mesh(new CylinderGeometry(0.2, 0.2, 0.05, 16), glowMat);
    disc.position.set(0.42, 0.08, 0);
    turret.add(mount, disc);
  } else if (weapon === "flame") {
    let tank = new Mesh(new CylinderGeometry(0.12, 0.12, 0.5, 10), trimMat);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(-0.05, 0.1, 0);
    let nozzle = new Mesh(new CylinderGeometry(0.07, 0.12, 0.55, 10), hullMat);
    nozzle.rotation.z = -Math.PI / 2;
    nozzle.position.set(0.42, 0.02, 0);
    let pilot = new Mesh(new SphereGeometry(0.06, 8, 6), glowMat);
    pilot.position.set(0.72, 0.02, 0);
    turret.add(tank, nozzle, pilot);
  } else addBarrel(0.62, 0.13);
  group.add(turret);
  let shield = new Mesh(
    new IcosahedronGeometry(1, 2),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  shield.position.y = 0.8;
  shield.scale.setScalar(1.1);
  group.add(shield);
  return { group, base, turret, shield, mats: [hullMat, trimMat], glowMat, setWalk, legs, lean: 0, bank: 0 };
}
function buildBossModel(type, color) {
  let group = new Group(),
    hullMat = new MeshLambertMaterial({ color: darken(color, 0.35), emissive: 0, flatShading: true }),
    darkMat = new MeshLambertMaterial({ color: 2435898, emissive: 0, flatShading: true }),
    glowMat = new MeshBasicMaterial({ color, toneMapped: false, transparent: true }),
    spin = [],
    addMesh = (geo, mat, x, y, z, parent = group) => {
      let mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
  if (type === "warden") {
    addMesh(new CylinderGeometry(1.8, 2.05, 1.5, 6), hullMat, 0, 0.9, 0);
    addMesh(new BoxGeometry(1.8, 0.9, 1.6), darkMat, -0.2, 2, 0);
    addMesh(new BoxGeometry(0.9, 1.1, 0.9), darkMat, 0, 1.2, 1.9);
    addMesh(new BoxGeometry(0.9, 1.1, 0.9), darkMat, 0, 1.2, -1.9);
    addMesh(new BoxGeometry(0.12, 0.28, 1.3), glowMat, 0.72, 2.05, 0);
    addMesh(new BoxGeometry(0.2, 0.2, 0.2), glowMat, 0.46, 1.25, 1.9);
    addMesh(new BoxGeometry(0.2, 0.2, 0.2), glowMat, 0.46, 1.25, -1.9);
    let ring = addMesh(new TorusGeometry(1.95, 0.07, 5, 36), glowMat, 0, 0.35, 0);
    ring.rotation.x = Math.PI / 2;
    // 2.7.0: pauldrons, a horned head with a visor, twin cannons and a chest emblem
    for (const side of [1, -1]) {
      addMesh(new BoxGeometry(1.1, 0.55, 1.05), hullMat, 0, 2.75, side * 1.15);
      addMesh(new BoxGeometry(0.5, 0.2, 0.9), glowMat, 0.35, 3.05, side * 1.15);
      addMesh(new CylinderGeometry(0.2, 0.24, 1.7, 8), darkMat, 1.05, 2.15, side * 0.85).rotation.z = Math.PI / 2;
      addMesh(new CylinderGeometry(0.26, 0.26, 0.12, 8), glowMat, 1.95, 2.15, side * 0.85).rotation.z = Math.PI / 2;
      const horn = addMesh(new ConeGeometry(0.17, 0.95, 5), hullMat, 0.35, 3.75, side * 0.42);
      horn.rotation.set(side * 0.35, 0, 0.25);
      addMesh(new BoxGeometry(0.1, 0.1, 0.34), glowMat, 1.03, 2.98, side * 0.28);
    }
    addMesh(new BoxGeometry(1, 0.75, 1.1), darkMat, 0.55, 3.0, 0);
    addMesh(new OctahedronGeometry(0.34, 0), glowMat, 1.0, 1.55, 0).scale.set(0.4, 1.3, 1);
    for (let i = -1; i <= 1; i++) addMesh(new BoxGeometry(0.06, 0.6, 0.12), glowMat, -1.02, 2.2, i * 0.4);
    // 3.4.0: the Enforcer of the Blackout carries a police light bar that turns, red and blue
    const bar = new Group();
    bar.position.set(0.5, 3.48, 0);
    group.add(bar);
    addMesh(new BoxGeometry(0.5, 0.12, 0.5), darkMat, 0, -0.08, 0, bar);
    addMesh(
      new BoxGeometry(0.22, 0.16, 0.42),
      new MeshBasicMaterial({ color: 0xff2030, toneMapped: false }),
      0.13,
      0.06,
      0,
      bar,
    );
    addMesh(
      new BoxGeometry(0.22, 0.16, 0.42),
      new MeshBasicMaterial({ color: 0x2050ff, toneMapped: false }),
      -0.13,
      0.06,
      0,
      bar,
    );
    spin.push({ m: bar, ax: "y", v: 7 });
  } else if (type === "queen") {
    addMesh(new SphereGeometry(1.35, 16, 10), hullMat, 0.3, 1.9, 0).scale.set(1.1, 0.8, 1);
    addMesh(new SphereGeometry(1.1, 14, 9), darkMat, -1.3, 1.6, 0).scale.set(1.3, 0.85, 0.9);
    addMesh(new SphereGeometry(0.2, 8, 6), glowMat, 1.5, 2.1, 0.45);
    addMesh(new SphereGeometry(0.2, 8, 6), glowMat, 1.5, 2.1, -0.45);
    addMesh(new SphereGeometry(0.34, 10, 8), glowMat, -2.4, 1.6, 0);
    let halo = addMesh(new TorusGeometry(2.1, 0.09, 5, 40), glowMat, 0, 2.2, 0);
    halo.rotation.x = Math.PI / 2 - 0.25;
    spin.push({ m: halo, ax: "z", v: 0.8 });
    for (let i = 0; i < 6; i++) {
      let angle = (i / 6) * Math.PI * 2;
      addMesh(
        new BoxGeometry(0.18, 1.3, 0.18),
        darkMat,
        Math.cos(angle) * 1.2,
        0.6,
        Math.sin(angle) * 1.2,
      ).rotation.set(Math.sin(angle) * 0.5, 0, -Math.cos(angle) * 0.5);
    }
    // 2.7.0: a real head with mandibles and antennae, spines along the back, glowing egg sacs on the abdomen
    addMesh(new SphereGeometry(0.72, 12, 8), hullMat, 1.55, 1.75, 0).scale.set(1.15, 0.85, 1);
    for (const side of [1, -1]) {
      const jaw = addMesh(new ConeGeometry(0.16, 1.1, 5), darkMat, 2.25, 1.35, side * 0.42);
      jaw.rotation.set(side * 0.1, side * -0.45, -Math.PI / 2 - 0.35);
      const feeler = addMesh(new BoxGeometry(0.06, 1.1, 0.06), darkMat, 1.8, 2.7, side * 0.35);
      feeler.rotation.set(side * 0.5, 0, -0.5);
      addMesh(new SphereGeometry(0.1, 6, 4), glowMat, 2.2, 3.2, side * 0.72);
    }
    for (let i = 0; i < 5; i++) {
      const spine = addMesh(new ConeGeometry(0.13, 0.75 - i * 0.05, 5), darkMat, 0.9 - i * 0.7, 2.75 - i * 0.14, 0);
      spine.rotation.z = 0.2;
    }
    for (let i = 0; i < 4; i++) {
      const angle = i * 1.6;
      addMesh(
        new SphereGeometry(0.2 + (i % 2) * 0.06, 8, 6),
        glowMat,
        -1.3 + Math.cos(angle) * 0.55,
        2.15 + Math.sin(angle) * 0.25,
        Math.sin(angle * 1.7) * 0.75,
      );
    }
  } else if (type === "prism") {
    // 2.4.6: Frost Prism, a floating ice golem: a tall translucent crystal body with a cold glow
    // core and visor, crystal shoulders and crown (hullMat: frosted ice, flashes on hits), dark-blue
    // rock chunks (darkMat), orbiting frost shards and a frozen ring below. Everything fades out while
    // it blinks (fadeMats); the ice keeps its own translucency (userData.opacity).
    const ice = (color, emissive, opacity) => {
      const mat = new MeshLambertMaterial({
        color,
        emissive,
        flatShading: true,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      mat.userData.opacity = opacity;
      return mat;
    };
    let iceMat = ice(13431295, 1716822, 0.8),
      paleIceMat = ice(14745599, 2771583, 0.5);
    hullMat.color.setHex(10934000);
    hullMat.transparent = true;
    darkMat.color.setHex(2837350);
    darkMat.transparent = true;
    let body = addMesh(new OctahedronGeometry(1.35, 0), iceMat, 0, 2.3, 0);
    body.scale.set(1, 1.5, 1);
    spin.push({ m: body, ax: "y", v: 0.35 });
    // glow core seen through the ice, and a visor slit on the facing side (+x)
    addMesh(new OctahedronGeometry(0.55, 0), glowMat, 0, 2.3, 0).scale.set(1, 1.35, 1);
    addMesh(new BoxGeometry(0.1, 0.12, 0.72), glowMat, 0.98, 2.62, 0);
    // shoulders: crystal clusters leaning outwards on dark rock
    for (const z of [-1, 1]) {
      addMesh(new DodecahedronGeometry(0.42, 0), darkMat, -0.05, 2.35, z * 1.2);
      addMesh(new OctahedronGeometry(0.34, 0), hullMat, 0.05, 2.95, z * 1.35).rotation.set(z * 0.5, 0, 0.1);
      const big = addMesh(new ConeGeometry(0.3, 1.5, 5), hullMat, -0.1, 3.0, z * 1.25);
      big.rotation.set(z * 0.55, 0, -0.12);
      addMesh(new ConeGeometry(0.2, 0.95, 5), hullMat, 0.25, 2.6, z * 1.55).rotation.set(z * 1.0, 0, 0.3);
    }
    // crown of small spikes above the head
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3,
        spike = addMesh(new ConeGeometry(0.13, 0.75, 4), hullMat, Math.cos(angle) * 0.34, 4.35, Math.sin(angle) * 0.34);
      spike.rotation.set(Math.sin(angle) * 0.45, 0, -Math.cos(angle) * 0.45);
    }
    // icicles hanging below the body
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.8;
      addMesh(
        new ConeGeometry(0.14, 0.8, 4),
        paleIceMat,
        Math.cos(angle) * 0.45,
        0.62,
        Math.sin(angle) * 0.45,
      ).rotation.x = Math.PI;
    }
    // orbiting frost shards: three glowing, three of plain ice, at two heights
    let orbit = new Group();
    orbit.position.y = 2.3;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2,
        shard = addMesh(
          new OctahedronGeometry(i % 2 ? 0.26 : 0.32, 0),
          i % 2 ? paleIceMat : glowMat,
          Math.cos(angle) * 2.15,
          i % 2 ? 0.55 : -0.2,
          Math.sin(angle) * 2.15,
          orbit,
        );
      shard.scale.y = 1.7;
      shard.rotation.z = i % 2 ? 0.35 : -0.2;
    }
    group.add(orbit);
    spin.push({ m: orbit, ax: "y", v: -1.4 });
    // frozen ring on the ground
    const ring = addMesh(new TorusGeometry(1.9, 0.07, 4, 40), glowMat, 0, 0.12, 0);
    ring.rotation.x = Math.PI / 2;
    // 2.9.0: detail pass (Prism and Crucible were still plain 2.4.6 builds): a ring of standing crystals, frozen
    // runes in the chest, a halo and a tilted ring around the core, brow and cheek crystals, back spikes, snow
    // caps, more icicles and floating rock. Merged per material: four draw calls.
    {
      const WH = 0xffffff,
        hull = [],
        dark = [],
        pale = [],
        glow = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.2,
          r = 2.55 + Math.sin(i * 3) * 0.15,
          h = 0.6 + (i % 3) * 0.25;
        hull.push(
          spike(
            WH,
            0.12 + (i % 2) * 0.04,
            5,
            [Math.cos(a) * r, 0, Math.sin(a) * r],
            [Math.cos(a) * (r + 0.2), h, Math.sin(a) * (r + 0.2)],
          ),
        );
        glow.push(
          spike(
            WH,
            0.06,
            4,
            [Math.cos(a + 0.3) * 2.1, 0, Math.sin(a + 0.3) * 2.1],
            [Math.cos(a + 0.3) * 2.15, 0.3 + (i % 2) * 0.15, Math.sin(a + 0.3) * 2.15],
          ),
        );
      }
      dark.push(box(WH, 0.14, 0.12, 0.95, { x: 0.96, y: 2.9 }));
      glow.push(
        box(WH, 0.05, 0.6, 0.05, { x: 1.0, y: 1.9 }),
        bar(WH, 0.05, [1.0, 2.05, -0.3], [1.0, 1.75, 0], 0.03),
        bar(WH, 0.05, [1.0, 2.05, 0.3], [1.0, 1.75, 0], 0.03),
        bar(WH, 0.05, [1.0, 1.55, -0.2], [1.0, 1.55, 0.2], 0.03),
      );
      glow.push(
        meshPart(new TorusGeometry(1.75, 0.03, 3, 36), WH, { y: 2.3, rx: Math.PI / 2 + 0.12 }),
        meshPart(new TorusGeometry(0.85, 0.03, 3, 24), WH, { y: 2.3, rx: 1.2, ry: 0.5 }),
      );
      for (const z of [-1, 1]) {
        hull.push(
          spike(WH, 0.1, 5, [0.85, 2.4, z * 0.5], [1.3, 2.3, z * 0.75]),
          spike(WH, 0.08, 5, [0.8, 2.15, z * 0.4], [1.2, 1.95, z * 0.6]),
        );
        hull.push(meshPart(new DodecahedronGeometry(0.3, 0), WH, { x: -0.05, y: 2.68, z: z * 1.2, sy: 0.45 }));
        hull.push(spike(WH, 0.11, 5, [-0.9, 2.1, z * 0.3], [-1.45, 2.6, z * 0.45]));
        dark.push(meshPart(new DodecahedronGeometry(0.22, 0), WH, { x: 1.5 * z, y: 1.1 + z * 0.3, z: 1.2 }));
      }
      hull.push(
        spike(WH, 0.16, 5, [-0.95, 2.6, 0], [-1.6, 3.4, 0]),
        spike(WH, 0.13, 5, [-0.9, 2.9, 0], [-1.3, 3.9, 0]),
      );
      dark.push(
        meshPart(new DodecahedronGeometry(0.26, 0), WH, { x: -1.6, y: 1.5, z: 0.4 }),
        meshPart(new DodecahedronGeometry(0.2, 0), WH, { x: 0.3, y: 1.0, z: -1.7 }),
      );
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3,
          x = Math.cos(a) * 0.75,
          z = Math.sin(a) * 0.75;
        pale.push(spike(WH, 0.07, 4, [x, 0.95, z], [x, 0.4 + (i % 3) * 0.12, z]));
      }
      const addMerged = (parts, mat) => parts.length && addMesh(mergeParts(parts), mat, 0, 0, 0);
      addMerged(hull, hullMat);
      addMerged(dark, darkMat);
      addMerged(pale, paleIceMat);
      addMerged(glow, glowMat);
    }
    group.userData.fadeMats = [iceMat, paleIceMat, hullMat, darkMat, glowMat];
  } else if (type === "forge") {
    // 2.4.6: THE CRUCIBLE, a furnace golem: an iron crucible on stubby legs with molten metal inside
    // a heavy rim, a head with a glowing visor and a furnace mouth at the front (+x), hammer fists,
    // two chimneys and a flywheel on its back. The renderer lets the chimneys throw embers
    // (userData.chimneys).
    let ironMat = new MeshLambertMaterial({ color: 2366244, emissive: 0, flatShading: true });
    addMesh(new BoxGeometry(1, 1, 0.9), darkMat, -0.1, 0.5, 0.95);
    addMesh(new BoxGeometry(1, 1, 0.9), darkMat, -0.1, 0.5, -0.95);
    addMesh(new CylinderGeometry(1.55, 1.15, 2, 8), ironMat, 0, 2, 0);
    addMesh(new CylinderGeometry(0.95, 0.95, 0.1, 12), glowMat, -0.25, 3.02, 0);
    addMesh(new BoxGeometry(0.75, 0.6, 1.05), darkMat, 1.05, 3.1, 0);
    addMesh(new BoxGeometry(0.1, 0.14, 0.75), glowMat, 1.44, 3.14, 0);
    addMesh(new BoxGeometry(0.3, 0.55, 1.1), glowMat, 1.3, 1.85, 0).rotation.set(0, 0, 0.2);
    let rim = addMesh(new TorusGeometry(1.3, 0.26, 5, 16), hullMat, 0, 3, 0);
    rim.rotation.x = Math.PI / 2;
    for (let side of [1, -1]) {
      addMesh(new BoxGeometry(0.85, 0.85, 0.85), hullMat, 0, 2.35, side * 1.75);
      addMesh(new BoxGeometry(1.2, 0.95, 0.95), darkMat, 0.55, 1.35, side * 1.95);
      addMesh(new CylinderGeometry(0.26, 0.34, 1.7, 6), darkMat, -1.05, 3.1, side * 0.55);
      addMesh(new CylinderGeometry(0.2, 0.2, 0.08, 6), glowMat, -1.05, 3.97, side * 0.55);
    }
    let wheel = addMesh(new TorusGeometry(0.6, 0.14, 4, 8), hullMat, -1.62, 1.9, 0);
    wheel.rotation.y = Math.PI / 2;
    spin.push({ m: wheel, ax: "z", v: 1.4 });
    // 2.9.0: detail pass (Prism and Crucible were still plain 2.4.6 builds): rim rivets, cauldron bands, molten
    // cracks, pipes, brow, eyes, furnace teeth, knuckles and toe plates. Merged per material: three draw calls.
    {
      const WH = 0xffffff,
        hull = [],
        dark = [],
        glow = [],
        // a point on the 8-sided cauldron wall (faces are at 0.92 of the vertex radius)
        wall = (theta, y, lateral = 0) => {
          const r = 0.92 * (1.15 + 0.2 * (y - 1)) + 0.03;
          return [r * Math.sin(theta) + Math.cos(theta) * lateral, y, r * Math.cos(theta) - Math.sin(theta) * lateral];
        };
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        dark.push(box(WH, 0.14, 0.1, 0.14, { x: Math.cos(a) * 1.3, y: 3.29, z: Math.sin(a) * 1.3, ry: -a }));
      }
      for (const y of [1.55, 2.5]) {
        const r = 0.93 * (1.15 + 0.2 * (y - 1)) + 0.05;
        hull.push(meshPart(new TorusGeometry(r, 0.07, 4, 16), WH, { y, rx: Math.PI / 2 }));
      }
      // molten cracks running down the faces
      for (const theta of [0.5, 1.5, 2.5, 5.5, 4.5]) {
        let prev = wall(theta, 1.15);
        for (const [y, lat] of [
          [1.6, 0.1],
          [2.05, -0.08],
          [2.5, 0.06],
          [2.9, -0.04],
        ]) {
          const next = wall(theta, y, lat);
          glow.push(bar(WH, 0.05, prev, next, 0.03));
          prev = next;
        }
      }
      // pipes from the chimneys down the back, with elbows
      for (const s of [1, -1]) {
        hull.push(
          pipe(WH, 0.09, 0.09, 6, [-1.05, 3.0, s * 0.55], [-1.42, 2.3, s * 0.72]),
          pipe(WH, 0.09, 0.09, 6, [-1.42, 2.3, s * 0.72], [-1.45, 1.2, s * 0.72]),
          ball(WH, 0.12, 6, 4, { x: -1.42, y: 2.3, z: s * 0.72 }),
        );
        glow.push(ball(WH, 0.06, 5, 3, { x: -1.44, y: 1.7, z: s * 0.72 }));
        // toe plates and hazard marks on the legs
        dark.push(box(WH, 0.42, 0.3, 0.95, { x: 0.46, y: 0.15, z: s * 0.95 }));
        for (let i = 0; i < 3; i++) glow.push(box(WH, 0.03, 0.1, 0.62, { x: 0.41, y: 0.42 + i * 0.22, z: s * 0.95 }));
        // hammer fist: knuckles and a hydraulic forearm
        for (let c = -1; c <= 1; c++)
          for (let r = 0; r < 2; r++)
            dark.push(box(WH, 0.14, 0.16, 0.18, { x: 1.2, y: 1.05 + r * 0.42, z: s * 1.95 + c * 0.3 }));
        hull.push(pipe(WH, 0.1, 0.1, 6, [0, 2.7, s * 1.85], [0.45, 1.75, s * 1.95]));
        glow.push(box(WH, 0.05, 0.08, 0.5, { x: 1.17, y: 1.35, z: s * 1.95 }));
        // head: eyes
        glow.push(box(WH, 0.08, 0.12, 0.16, { x: 1.43, y: 3.22, z: s * 0.3 }));
      }
      // head: brow ridge and cheek plates, furnace mouth with teeth, slag drips, a pressure dial on the back
      dark.push(
        box(WH, 0.14, 0.1, 1.1, { x: 1.4, y: 3.46 }),
        box(WH, 0.3, 0.3, 0.12, { x: 1.1, y: 2.85, z: 0.56 }),
        box(WH, 0.3, 0.3, 0.12, { x: 1.1, y: 2.85, z: -0.56 }),
      );
      for (let i = -2; i <= 2; i++)
        dark.push(
          box(WH, 0.14, 0.14, 0.1, { x: 1.43, y: 2.12, z: i * 0.2 }),
          box(WH, 0.14, 0.14, 0.1, { x: 1.43, y: 1.6, z: i * 0.2 + 0.1 }),
        );
      for (const z of [-0.3, 0.05, 0.4]) glow.push(spike(WH, 0.06, 4, [1.47, 1.6, z], [1.47, 1.2 - z * 0.2, z]));
      glow.push(pipe(WH, 0.14, 0.14, 8, [-1.4, 2.6, 0.3], [-1.5, 2.6, 0.3]));
      hull.push(pipe(WH, 0.19, 0.19, 8, [-1.36, 2.6, 0.3], [-1.42, 2.6, 0.3]));
      const addMerged = (parts, mat) => parts.length && addMesh(mergeParts(parts), mat, 0, 0, 0);
      addMerged(hull, hullMat);
      addMerged(dark, darkMat);
      addMerged(glow, glowMat);
    }
    group.userData.chimneys = [
      [-1.05, 4.05, 0.55],
      [-1.05, 4.05, -0.55],
    ];
    group.userData.mats = [ironMat];
  } else {
    addMesh(new SphereGeometry(1.15, 18, 12), glowMat, 0, 2.4, 0);
    for (let i = 0; i < 3; i++) {
      let band = addMesh(new TorusGeometry(1.75 + i * 0.35, 0.16, 6, 36), i === 1 ? darkMat : hullMat, 0, 2.4, 0);
      band.rotation.set(i * 1.1, i * 0.6, 0);
      spin.push({ m: band, ax: i === 0 ? "x" : i === 1 ? "y" : "z", v: 0.6 + i * 0.35 });
    }
    // 2.7.0: a crown of crystal spikes that turns around the core, four shards orbiting the other way
    const crown = new Group();
    crown.position.y = 2.4;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2,
        tilt = i % 2 ? 0.5 : 0.15,
        spike = addMesh(new ConeGeometry(0.2, 1.3 + (i % 2) * 0.5, 5), i % 2 ? hullMat : darkMat, 0, 0, 0, crown);
      spike.position.set(
        Math.cos(angle) * 1.05,
        (i % 2 ? 0.35 : -0.1) + Math.sin(angle * 2) * 0.1,
        Math.sin(angle) * 1.05,
      );
      spike.rotation.set(Math.sin(angle) * (Math.PI / 2 - tilt), 0, -Math.cos(angle) * (Math.PI / 2 - tilt));
    }
    group.add(crown);
    spin.push({ m: crown, ax: "y", v: 0.5 });
    const shards = new Group();
    shards.position.y = 2.4;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2,
        shard = addMesh(
          new OctahedronGeometry(0.3, 0),
          glowMat,
          Math.cos(angle) * 2.9,
          Math.sin(i * 2) * 0.5,
          Math.sin(angle) * 2.9,
          shards,
        );
      shard.scale.y = 1.6;
    }
    group.add(shards);
    spin.push({ m: shards, ax: "y", v: -0.9 });
    let base = addMesh(new CylinderGeometry(1.2, 1.8, 0.5, 8), darkMat, 0, 0.25, 0);
    base.rotation.y = 0.3;
    let groundRing = addMesh(new TorusGeometry(2.4, 0.08, 5, 44), glowMat, 0, 0.1, 0);
    groundRing.rotation.x = Math.PI / 2;
  }
  return { group, mats: [hullMat, darkMat, ...(group.userData.mats || [])], glowMat, spin };
}
function wingDroneGeometry() {
  return mergeParts([
    meshPart(new OctahedronGeometry(0.28), 9348036, { y: 0.9, sy: 0.6 }),
    meshPart(new BoxGeometry(0.5, 0.06, 0.12), 2898514, { x: 0.2, y: 0.9 }),
  ]);
}
function orbitBladeGeometry() {
  let shape = new Shape();
  shape.moveTo(0.42, 0);
  shape.lineTo(-0.1, 0.16);
  shape.lineTo(-0.22, 0);
  shape.lineTo(-0.1, -0.16);
  shape.closePath();
  let geo = new ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.62, 0);
  return geo;
}
function shardGeometry() {
  let geo = new OctahedronGeometry(0.2, 0);
  geo.scale(1, 1.5, 1);
  return geo;
}
function healCrossGeometry() {
  return mergeParts([
    meshPart(new BoxGeometry(0.5, 0.16, 0.16), 16777215),
    meshPart(new BoxGeometry(0.16, 0.5, 0.16), 16777215),
  ]);
}

export {
  meshPart,
  mergeParts,
  box,
  ball,
  bar,
  pipe,
  spike,
  debrisGeometry,
  discGeometry,
  enemyGeometry,
  shardGeometry,
  orbitBladeGeometry,
  buildBossModel,
  RL_MESH_TYPES,
  shieldArcGeometry,
  healCrossGeometry,
  buildPlayerModel,
  wingDroneGeometry,
};
