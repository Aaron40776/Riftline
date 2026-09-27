// Mesh builders for the player drone, enemies, bosses and props.

import {
  AdditiveBlending as rs,
  BoxGeometry as Ct,
  BufferAttribute as Ke,
  BufferGeometry as Ge,
  Color as Ot,
  ConeGeometry as Ir,
  CylinderGeometry as ye,
  DodecahedronGeometry as Lr,
  Euler as Mn,
  ExtrudeGeometry as Hr,
  Group as rn,
  IcosahedronGeometry as ks,
  Matrix4 as de,
  Mesh as Gt,
  MeshBasicMaterial as Ie,
  MeshLambertMaterial as $e,
  OctahedronGeometry as Qe,
  Quaternion as mn,
  Shape as Fs,
  SphereGeometry as De,
  TetrahedronGeometry as Vr,
  TorusGeometry as Ve,
  Vector3 as I,
} from "three";

/* ==========================================================================
 Riftline 2.3.0 content
 - rlEnemyMesh: dedicated models for the 12 enemies added in 2.0–2.2
   (they used to fall back to the Grunt box). +x is the facing direction;
   body parts take the enemy colour (e = 55 %, n = 30 %), "glow" parts are
   white and get tinted per instance by the renderer.
 ========================================================================== */
function rlEnemyMesh(type, e, n, s) {
  const W = 16777215,
    P = Math.PI;
  switch (type) {
    case "leaper": {
      // crouched hopper: squat body, big folded hind legs, eye pair
      const legs = [];
      for (const z of [-0.34, 0.34])
        legs.push(
          At(new Ct(0.62, 0.14, 0.16), n, { x: -0.22, y: 0.3, z, rz: 0.75 }),
          At(new Ct(0.5, 0.12, 0.14), s, { x: -0.05, y: 0.14, z: z * 1.15, rz: -0.35 }),
        );
      return {
        body: _e([
          At(new De(0.46, 12, 8), e, { y: 0.46, sx: 1.25, sy: 0.7 }),
          At(new Ct(0.3, 0.14, 0.5), s, { x: 0.36, y: 0.3 }),
          ...legs,
        ]),
        glow: _e([
          At(new De(0.09, 8, 6), W, { x: 0.42, y: 0.62, z: 0.16 }),
          At(new De(0.09, 8, 6), W, { x: 0.42, y: 0.62, z: -0.16 }),
          At(new Ct(0.5, 0.04, 0.06), W, { x: -0.05, y: 0.78 }),
        ]),
      };
    }
    case "turret": {
      // hex base, column, gun head with long barrel
      return {
        body: _e([
          At(new ye(0.55, 0.7, 0.3, 6), n, { y: 0.15 }),
          At(new ye(0.17, 0.22, 0.5, 8), s, { y: 0.52 }),
          At(new Ct(0.56, 0.34, 0.48), e, { y: 0.9 }),
          At(new Ct(0.9, 0.11, 0.11), s, { x: 0.62, y: 0.92 }),
          At(new Ct(0.2, 0.2, 0.52), s, { x: -0.3, y: 0.94 }),
        ]),
        glow: _e([
          At(new De(0.1, 8, 6), W, { x: 1.08, y: 0.92 }),
          At(new Ve(0.64, 0.035, 4, 24), W, { y: 0.06, rx: P / 2 }),
          At(new Ct(0.06, 0.08, 0.3), W, { x: 0.29, y: 1.02 }),
        ]),
      };
    }
    case "charger": {
      // armoured wedge with a ram horn
      return {
        body: _e([
          At(new Ct(1.05, 0.58, 0.78), e, { y: 0.46 }),
          At(new Ct(0.62, 0.34, 0.66), n, { x: -0.12, y: 0.86 }),
          At(new Ir(0.28, 0.7, 6), s, { x: 0.82, y: 0.5, rz: -P / 2 }),
          At(new Ir(0.1, 0.36, 5), s, { x: 0.4, y: 0.86, z: 0.3, rz: -0.9 }),
          At(new Ir(0.1, 0.36, 5), s, { x: 0.4, y: 0.86, z: -0.3, rz: -0.9 }),
        ]),
        glow: _e([
          At(new Ct(0.07, 0.08, 0.52), W, { x: 0.54, y: 0.66 }),
          At(new Ct(0.7, 0.05, 0.06), W, { x: -0.15, y: 1.05 }),
        ]),
      };
    }
    case "minebot": {
      // low crab dome carrying three mines
      const legs = [],
        mines = [];
      for (const a of [0.6, 2.5, 3.8, 5.7])
        legs.push(At(new Ct(0.5, 0.1, 0.1), s, { x: Math.cos(a) * 0.55, y: 0.14, z: Math.sin(a) * 0.55, ry: -a }));
      for (let k = 0; k < 3; k++) {
        const a = P * 0.6 + k * 0.45;
        mines.push(At(new De(0.13, 8, 6), W, { x: Math.cos(a) * 0.34, y: 0.78, z: Math.sin(a) * 0.34 - 0.02 }));
      }
      return {
        body: _e([
          At(new ye(0.62, 0.7, 0.28, 8), n, { y: 0.26 }),
          At(new De(0.52, 14, 8, 0, P * 2, 0, P / 2), e, { y: 0.38 }),
          ...legs,
        ]),
        glow: _e([...mines, At(new Ct(0.1, 0.1, 0.34), W, { x: 0.52, y: 0.44 })]),
      };
    }
    case "sapper": {
      // upright engineer with a charge pack on its back
      return {
        body: _e([
          At(new ye(0.32, 0.4, 0.78, 8), e, { y: 0.42 }),
          At(new De(0.26, 10, 8), n, { y: 0.95 }),
          At(new Ct(0.34, 0.5, 0.5), s, { x: -0.38, y: 0.56 }),
          At(new ye(0.05, 0.05, 0.35, 6), s, { x: -0.38, y: 0.98 }),
        ]),
        glow: _e([
          At(new De(0.09, 8, 6), W, { x: -0.38, y: 1.18 }),
          At(new Ve(0.2, 0.035, 4, 16), W, { x: -0.38, y: 0.56, ry: P / 2 }),
          At(new Ct(0.08, 0.06, 0.3), W, { x: 0.24, y: 0.98 }),
        ]),
      };
    }
    case "phantom": {
      // hooded wraith fading into a point
      return {
        body: _e([
          At(new Ir(0.46, 1.05, 8), e, { y: 0.62, rx: P }),
          At(new De(0.32, 12, 8), n, { y: 1.18 }),
          At(new Ir(0.34, 0.4, 8), s, { x: -0.05, y: 1.36 }),
        ]),
        glow: _e([
          At(new De(0.08, 8, 6), W, { x: 0.27, y: 1.2, z: 0.12 }),
          At(new De(0.08, 8, 6), W, { x: 0.27, y: 1.2, z: -0.12 }),
          At(new Ve(0.42, 0.035, 4, 20), W, { y: 0.34, rx: P / 2 }),
          At(new Ve(0.3, 0.03, 4, 18), W, { y: 0.8, rx: P / 2 }),
          At(new Ve(0.34, 0.03, 4, 18), W, { y: 1.18, rz: P / 2 }),
        ]),
      };
    }
    case "sentinel": {
      // floating eye on a pylon, framed by a vertical ring
      return {
        body: _e([
          At(new ye(0.18, 0.46, 0.55, 6), n, { y: 0.28 }),
          At(new De(0.48, 14, 10), e, { y: 1.05 }),
          At(new Ve(0.64, 0.07, 5, 28), s, { y: 1.05 }),
        ]),
        glow: _e([
          At(new De(0.2, 10, 8), W, { x: 0.4, y: 1.05 }),
          At(new Ve(0.26, 0.03, 4, 18), W, { x: 0.34, y: 1.05, ry: P / 2 }),
          At(new Ve(0.46, 0.03, 4, 20), W, { y: 0.05, rx: P / 2 }),
        ]),
      };
    }
    case "carrier": {
      // hovering saucer with launch bays
      return {
        body: _e([
          At(new ye(0.86, 0.62, 0.28, 12), e, { y: 0.62 }),
          At(new De(0.4, 12, 8, 0, P * 2, 0, P / 2), n, { y: 0.76 }),
          At(new Ct(0.34, 0.2, 0.3), s, { y: 0.6, z: 0.78 }),
          At(new Ct(0.34, 0.2, 0.3), s, { y: 0.6, z: -0.78 }),
          At(new Ct(0.3, 0.2, 0.34), s, { x: -0.8, y: 0.6 }),
        ]),
        glow: _e([
          At(new Ve(0.7, 0.045, 4, 28), W, { y: 0.46, rx: P / 2 }),
          At(new Ct(0.08, 0.06, 0.24), W, { x: 0.84, y: 0.64 }),
          At(new De(0.1, 8, 6), W, { y: 1.14 }),
        ]),
      };
    }
    case "drone": {
      // quad-rotor needler
      const arms = [],
        rotors = [];
      for (const [x, z] of [
        [0.34, 0.34],
        [0.34, -0.34],
        [-0.34, 0.34],
        [-0.34, -0.34],
      ]) {
        arms.push(At(new Ct(0.5, 0.06, 0.08), s, { x: x / 2, y: 0.82, z: z / 2, ry: Math.atan2(-z, x) }));
        rotors.push(At(new Ve(0.17, 0.028, 4, 16), W, { x, y: 0.9, z, rx: P / 2 }));
      }
      return {
        body: _e([
          At(new Ct(0.4, 0.16, 0.36), e, { y: 0.82 }),
          At(new Ct(0.34, 0.08, 0.08), n, { x: 0.3, y: 0.76 }),
          ...arms,
        ]),
        glow: _e([...rotors, At(new De(0.07, 8, 6), W, { x: 0.48, y: 0.76 })]),
      };
    }
    case "driller": {
      // tracked body with a spinning drill
      return {
        body: _e([
          At(new Ct(0.95, 0.5, 0.76), e, { y: 0.42 }),
          At(new Ct(1.1, 0.22, 0.2), s, { y: 0.14, z: 0.44 }),
          At(new Ct(1.1, 0.22, 0.2), s, { y: 0.14, z: -0.44 }),
          At(new Ir(0.34, 0.9, 8), n, { x: 0.88, y: 0.46, rz: -P / 2 }),
          At(new ye(0.1, 0.14, 0.4, 6), s, { x: -0.32, y: 0.84 }),
        ]),
        glow: _e([
          At(new Ve(0.36, 0.04, 4, 20), W, { x: 0.46, y: 0.46, ry: P / 2 }),
          At(new De(0.08, 8, 6), W, { x: -0.32, y: 1.08 }),
          At(new Ct(0.07, 0.06, 0.5), W, { x: 0.2, y: 0.68 }),
        ]),
      };
    }
    case "beacon": {
      // repair spire with stacked halo rings
      return {
        body: _e([
          At(new ye(0.46, 0.58, 0.26, 6), n, { y: 0.13 }),
          At(new ye(0.16, 0.3, 1.15, 6), e, { y: 0.82 }),
          At(new Ct(0.62, 0.1, 0.1), s, { y: 1.22 }),
          At(new Ct(0.1, 0.1, 0.62), s, { y: 1.22 }),
        ]),
        glow: _e([
          At(new Qe(0.24), W, { y: 1.6 }),
          At(new Ve(0.4, 0.035, 4, 22), W, { y: 0.55, rx: P / 2 }),
          At(new Ve(0.3, 0.03, 4, 20), W, { y: 0.95, rx: P / 2 }),
        ]),
      };
    }
    case "weaver": {
      // angular rift spider
      const legs = [];
      for (let k = 0; k < 6; k++) {
        const a = (k < 3 ? -1 : 1) * (0.6 + (k % 3) * 0.55);
        legs.push(
          At(new Ct(0.62, 0.06, 0.08), s, {
            x: Math.cos(a) * 0.34,
            y: 0.46,
            z: Math.sin(a) * 0.34,
            ry: -a,
            rz: 0.45,
          }),
        );
      }
      return {
        body: _e([
          At(new Qe(0.38), e, { y: 0.66, sx: 1.35, sy: 0.8 }),
          At(new Qe(0.2), n, { x: 0.46, y: 0.7 }),
          ...legs,
        ]),
        glow: _e([
          At(new De(0.1, 8, 6), W, { y: 0.72 }),
          At(new Ve(0.5, 0.03, 4, 22), W, { y: 0.66, rx: P / 2 }),
          At(new Ct(0.06, 0.06, 0.2), W, { x: 0.62, y: 0.72 }),
        ]),
      };
    }
  }
  return null;
}

/* enemy types with a dedicated model (original 13 + the 12 above) */
var RL_MESH_TYPES = [
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
function If(i, t = !1) {
  let e = i[0].index !== null,
    n = new Set(Object.keys(i[0].attributes)),
    s = new Set(Object.keys(i[0].morphAttributes)),
    r = {},
    a = {},
    o = i[0].morphTargetsRelative,
    c = new Ge(),
    h = 0;
  for (let l = 0; l < i.length; ++l) {
    let u = i[l],
      d = 0;
    if (e !== (u.index !== null))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            l +
            ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.",
        ),
        null
      );
    for (let f in u.attributes) {
      if (!n.has(f))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              l +
              '. All geometries must have compatible attributes; make sure "' +
              f +
              '" attribute exists among all geometries, or in none of them.',
          ),
          null
        );
      (r[f] === void 0 && (r[f] = []), r[f].push(u.attributes[f]), d++);
    }
    if (d !== n.size)
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            l +
            ". Make sure all geometries have the same number of attributes.",
        ),
        null
      );
    if (o !== u.morphTargetsRelative)
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            l +
            ". .morphTargetsRelative must be consistent throughout all geometries.",
        ),
        null
      );
    for (let f in u.morphAttributes) {
      if (!s.has(f))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              l +
              ".  .morphAttributes must be consistent throughout all geometries.",
          ),
          null
        );
      (a[f] === void 0 && (a[f] = []), a[f].push(u.morphAttributes[f]));
    }
    if (t) {
      let f;
      if (e) f = u.index.count;
      else if (u.attributes.position !== void 0) f = u.attributes.position.count;
      else
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              l +
              ". The geometry must have either an index or a position attribute",
          ),
          null
        );
      (c.addGroup(h, f, l), (h += f));
    }
  }
  if (e) {
    let l = 0,
      u = [];
    for (let d = 0; d < i.length; ++d) {
      let f = i[d].index;
      for (let p = 0; p < f.count; ++p) u.push(f.getX(p) + l);
      l += i[d].attributes.position.count;
    }
    c.setIndex(u);
  }
  for (let l in r) {
    let u = Pf(r[l]);
    if (!u)
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + l + " attribute.",
        ),
        null
      );
    c.setAttribute(l, u);
  }
  for (let l in a) {
    let u = a[l][0].length;
    if (u !== 0) {
      ((c.morphAttributes = c.morphAttributes || {}), (c.morphAttributes[l] = []));
      for (let d = 0; d < u; ++d) {
        let f = [];
        for (let x = 0; x < a[l].length; ++x) f.push(a[l][x][d]);
        let p = Pf(f);
        if (!p)
          return (
            console.error(
              "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " +
                l +
                " morphAttribute.",
            ),
            null
          );
        c.morphAttributes[l].push(p);
      }
    }
  }
  return c;
}
function Pf(i) {
  let t,
    e,
    n,
    s = -1,
    r = 0;
  for (let h = 0; h < i.length; ++h) {
    let l = i[h];
    if ((t === void 0 && (t = l.array.constructor), t !== l.array.constructor))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.",
        ),
        null
      );
    if ((e === void 0 && (e = l.itemSize), e !== l.itemSize))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.",
        ),
        null
      );
    if ((n === void 0 && (n = l.normalized), n !== l.normalized))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.",
        ),
        null
      );
    if ((s === -1 && (s = l.gpuType), s !== l.gpuType))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.",
        ),
        null
      );
    r += l.count * e;
  }
  let a = new t(r),
    o = new Ke(a, e, n),
    c = 0;
  for (let h = 0; h < i.length; ++h) {
    let l = i[h];
    if (l.isInterleavedBufferAttribute) {
      let u = c / e;
      for (let d = 0, f = l.count; d < f; d++)
        for (let p = 0; p < e; p++) {
          let x = l.getComponent(d, p);
          o.setComponent(d + u, p, x);
        }
    } else a.set(l.array, c);
    c += l.count * e;
  }
  return (s !== void 0 && (o.gpuType = s), o);
}
var Lf = new de(),
  Df = new mn(),
  Nf = new Mn(),
  qv = new I(),
  Yv = new I();
function At(
  i,
  t,
  { x: e = 0, y: n = 0, z: s = 0, rx: r = 0, ry: a = 0, rz: o = 0, sx: c = 1, sy: h = 1, sz: l = 1 } = {},
) {
  let u = i.index ? i.toNonIndexed() : i;
  (Nf.set(r, a, o),
    Df.setFromEuler(Nf),
    Lf.compose(Yv.set(e, n, s), Df, qv.set(c, h, l)),
    u.applyMatrix4(Lf),
    u.deleteAttribute("uv"));
  let d = new Ot(t),
    f = u.attributes.position.count,
    p = new Float32Array(f * 3);
  for (let x = 0; x < f; x++) ((p[x * 3] = d.r), (p[x * 3 + 1] = d.g), (p[x * 3 + 2] = d.b));
  return (u.setAttribute("color", new Ke(p, 3)), u);
}
function _e(i) {
  let t = If(i, !1);
  return (t.computeBoundingSphere(), t);
}
var Uh = (i, t = 0.5) => new Ot(i).multiplyScalar(t).getHex();
function Fh(i, t) {
  let e = Uh(t, 0.55),
    n = Uh(t, 0.3),
    s = 3818070;
  switch (i) {
    case "swarmer":
      return {
        body: _e([
          At(new Ir(0.4, 1, 4), e, { x: 0.05, y: 0.45, rz: -Math.PI / 2, rx: Math.PI / 4 }),
          At(new Ct(0.45, 0.06, 0.95), n, { x: -0.2, y: 0.45 }),
        ]),
        glow: _e([
          At(new De(0.13, 8, 6), 16777215, { x: -0.38, y: 0.45 }),
          At(new Ct(0.1, 0.07, 0.95), 16777215, { x: -0.44, y: 0.45 }),
        ]),
      };
    case "mite":
      return {
        body: _e([At(new Vr(0.34), e, { y: 0.32, ry: 0.4 })]),
        glow: _e([At(new De(0.1, 6, 4), 16777215, { x: 0.15, y: 0.42 })]),
      };
    case "grunt":
      return {
        body: _e([
          At(new Ct(0.9, 0.75, 0.9), e, { y: 0.5 }),
          At(new Ct(0.5, 0.5, 1.25), n, { x: -0.1, y: 0.55 }),
          At(new Ct(0.7, 0.2, 0.7), s, { y: 0.98 }),
        ]),
        glow: _e([At(new Ct(0.1, 0.14, 0.62), 16777215, { x: 0.46, y: 0.62 })]),
      };
    case "gunner":
      return {
        body: _e([
          At(new ye(0.42, 0.52, 0.75, 8), e, { y: 0.42 }),
          At(new Ct(0.8, 0.15, 0.15), s, { x: 0.52, y: 0.62 }),
          At(new De(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), n, { y: 0.8 }),
        ]),
        glow: _e([
          At(new Ve(0.47, 0.05, 5, 18), 16777215, { y: 0.78, rx: Math.PI / 2 }),
          At(new Ct(0.1, 0.18, 0.18), 16777215, { x: 0.95, y: 0.62 }),
        ]),
      };
    case "bomber":
      return {
        body: _e([At(new De(0.5, 12, 8), e, { y: 0.52 }), At(new ye(0.1, 0.12, 0.25, 6), s, { y: 1.05 })]),
        glow: _e([
          At(new Ve(0.5, 0.06, 5, 20), 16777215, { y: 0.52, rx: Math.PI / 2 }),
          At(new De(0.12, 8, 6), 16777215, { y: 1.22 }),
        ]),
      };
    case "splitter":
      return {
        body: _e([At(new Lr(0.78), e, { y: 0.8 })]),
        glow: _e([
          At(new Ve(0.8, 0.06, 5, 24), 16777215, { y: 0.8, rx: Math.PI / 2 }),
          At(new Qe(0.2), 16777215, { y: 1.62 }),
        ]),
      };
    case "brute":
      return {
        body: _e([
          At(new Ct(1.5, 1.1, 1.6), e, { y: 0.66 }),
          At(new Ct(0.9, 0.7, 2.2), n, { x: -0.15, y: 1 }),
          At(new Ct(0.5, 0.35, 0.9), s, { x: 0.65, y: 0.35 }),
        ]),
        glow: _e([
          At(new Ct(0.1, 0.16, 0.24), 16777215, { x: 0.76, y: 0.95, z: 0.35 }),
          At(new Ct(0.1, 0.16, 0.24), 16777215, { x: 0.76, y: 0.95, z: -0.35 }),
          At(new Ct(0.14, 0.1, 1.6), 16777215, { x: -0.76, y: 0.8 }),
        ]),
      };
    case "sniper":
      return {
        body: _e([At(new Qe(0.5), e, { y: 0.95, sy: 1.7 }), At(new Ct(1.4, 0.09, 0.09), s, { x: 0.7, y: 0.95 })]),
        glow: _e([At(new De(0.12, 8, 6), 16777215, { x: 1.42, y: 0.95 }), At(new Qe(0.16), 16777215, { y: 1.95 })]),
      };
    case "hive": {
      let r = [];
      for (let a = 0; a < 6; a++) {
        let o = (a / 6) * Math.PI * 2;
        r.push(
          At(new De(0.2, 8, 6), 16777215, { x: Math.cos(o) * 1.02, y: 1.05 + (a % 2) * 0.35, z: Math.sin(o) * 1.02 }),
        );
      }
      return (
        r.push(At(new Qe(0.28), 16777215, { y: 2.2 })),
        { body: _e([At(new ks(1.05, 0), e, { y: 1.15 }), At(new ye(0.7, 1, 0.35, 8), n, { y: 0.18 })]), glow: _e(r) }
      );
    }
    case "bulwark":
      return {
        body: _e([
          At(new Ct(1.1, 1, 1.2), e, { x: -0.15, y: 0.6 }),
          At(new Ct(0.6, 0.35, 0.9), s, { x: -0.2, y: 1.25 }),
          At(new ye(0.22, 0.26, 0.5, 6), n, { x: -0.1, y: 0.2, z: 0.45 }),
          At(new ye(0.22, 0.26, 0.5, 6), n, { x: -0.1, y: 0.2, z: -0.45 }),
        ]),
        glow: _e([
          At(new Ct(0.08, 0.12, 0.5), 16777215, { x: 0.43, y: 0.95 }),
          At(new Ct(0.5, 0.06, 0.06), 16777215, { x: -0.2, y: 1.45 }),
        ]),
      };
    case "striker":
      return {
        body: _e([
          At(new Qe(0.42), e, { y: 0.7, sx: 1.5, sy: 0.9, sz: 0.8 }),
          At(new Ct(0.9, 0.05, 0.14), s, { x: 0.35, y: 0.62, z: 0.34, ry: -0.35 }),
          At(new Ct(0.9, 0.05, 0.14), s, { x: 0.35, y: 0.62, z: -0.34, ry: 0.35 }),
        ]),
        glow: _e([
          At(new De(0.12, 8, 6), 16777215, { x: 0.45, y: 0.78 }),
          At(new Ct(0.5, 0.03, 0.05), 16777215, { x: 0.78, y: 0.64, z: 0.5, ry: -0.35 }),
          At(new Ct(0.5, 0.03, 0.05), 16777215, { x: 0.78, y: 0.64, z: -0.5, ry: 0.35 }),
        ]),
      };
    case "mender":
      return {
        body: _e([At(new ye(0.35, 0.55, 0.7, 6), e, { y: 0.4 }), At(new Qe(0.32), n, { y: 1.05 })]),
        glow: _e([
          At(new Ct(0.5, 0.12, 0.12), 16777215, { y: 1.05 }),
          At(new Ct(0.12, 0.12, 0.5), 16777215, { y: 1.05 }),
          At(new Ve(0.55, 0.04, 5, 18), 16777215, { y: 0.1, rx: Math.PI / 2 }),
        ]),
      };
    case "mortar":
      return {
        body: _e([
          At(new ye(0.75, 0.85, 0.5, 8), n, { y: 0.25 }),
          At(new De(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), e, { y: 0.5 }),
          At(new ye(0.2, 0.26, 0.95, 10), s, { x: 0.25, y: 1.05, rz: -0.55 }),
        ]),
        glow: _e([
          At(new Ve(0.2, 0.05, 5, 14), 16777215, { x: 0.52, y: 1.45, rz: -0.55, ry: Math.PI / 2 }),
          At(new Ve(0.78, 0.04, 5, 24), 16777215, { y: 0.52, rx: Math.PI / 2 }),
        ]),
      };
  }
  const rlM = rlEnemyMesh(i, e, n, s);
  return rlM || Fh("grunt", t);
}
function Uf() {
  let i = new ye(1.35, 1.35, 1.5, 20, 1, !0, -Math.PI / 2.9, (Math.PI * 2) / 2.9);
  return (i.rotateY(Math.PI / 2), i.translate(0, 0.8, 0), i);
}
function Ff() {
  return _e([
    At(new ye(1, 1, 0.12, 20), 16777215),
    At(new ye(0.45, 0.45, 0.2, 12), 10474239),
    At(new Ct(2.1, 0.14, 0.18), 13625599),
  ]);
}
function Bf() {
  return new Ct(1, 1, 1);
}
function kf(i, t) {
  let e = new rn(),
    n = new $e({ color: 2898514, emissive: 0 }),
    s = new $e({ color: 9348036, emissive: 0 }),
    r = new Ie({ color: t, toneMapped: !1 }),
    a = new rn(),
    o = new Gt(new ye(0.5, 0.62, 0.34, 6), n);
  o.position.y = 0.52;
  let c = new Gt(new ye(0.64, 0.5, 0.14, 6), s);
  c.position.y = 0.3;
  let h = new Gt(new Ve(0.6, 0.045, 5, 24), r);
  ((h.rotation.x = Math.PI / 2), (h.position.y = 0.52));
  let l = new Gt(new Ct(0.16, 0.12, 0.5), r);
  (l.position.set(-0.55, 0.42, 0), a.add(o, c, h, l), e.add(a));
  let u = new rn();
  u.position.y = 0.78;
  let d = new Gt(new De(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), s);
  u.add(d);
  let f = new Gt(new Ct(0.08, 0.08, 0.3), r);
  (f.position.set(0.24, 0.12, 0), u.add(f));
  let p = (m, g, M = 0, b = 0.02) => {
    let v = new Gt(new Ct(m, g, g), n);
    v.position.set(m / 2 + 0.12, b, M);
    let S = new Gt(new Ct(0.08, g * 1.2, g * 1.2), r);
    (S.position.set(m + 0.14, b, M), u.add(v, S));
  };
  if (i === "scatter") (p(0.5, 0.13, 0.1), p(0.5, 0.13, -0.1));
  else if (i === "rail") {
    p(0.95, 0.1);
    let m = new Gt(new Ct(0.8, 0.04, 0.26), s);
    (m.position.set(0.55, 0.02, 0), u.add(m));
  } else if (i === "rocket") {
    let m = new Gt(new Ct(0.46, 0.26, 0.36), n);
    (m.position.set(0.3, 0.05, 0), u.add(m));
    for (let g of [-0.09, 0.09])
      for (let M of [-0.03, 0.12]) {
        let b = new Gt(new Ct(0.05, 0.08, 0.08), r);
        (b.position.set(0.55, M, g), u.add(b));
      }
  } else if (i === "tesla") {
    p(0.55, 0.12);
    let m = new Gt(new Ve(0.12, 0.03, 5, 14), r);
    ((m.rotation.y = Math.PI / 2), m.position.set(0.45, 0.02, 0));
    let g = m.clone();
    ((g.position.x = 0.3), u.add(m, g));
  } else if (i === "disc") {
    let m = new Gt(new Ct(0.62, 0.08, 0.34), n);
    m.position.set(0.35, 0, 0);
    let g = new Gt(new ye(0.2, 0.2, 0.05, 16), r);
    (g.position.set(0.42, 0.08, 0), u.add(m, g));
  } else if (i === "flame") {
    let m = new Gt(new ye(0.12, 0.12, 0.5, 10), s);
    ((m.rotation.x = Math.PI / 2), m.position.set(-0.05, 0.1, 0));
    let g = new Gt(new ye(0.07, 0.12, 0.55, 10), n);
    ((g.rotation.z = -Math.PI / 2), g.position.set(0.42, 0.02, 0));
    let M = new Gt(new De(0.06, 8, 6), r);
    (M.position.set(0.72, 0.02, 0), u.add(m, g, M));
  } else p(0.62, 0.13);
  e.add(u);
  let x = new Gt(
    new ks(1, 2),
    new Ie({ color: t, transparent: !0, opacity: 0.16, blending: rs, depthWrite: !1, toneMapped: !1 }),
  );
  return ((x.position.y = 0.6), e.add(x), { group: e, base: a, turret: u, shield: x, mats: [n, s], glowMat: r });
}
function Of(i, t) {
  let e = new rn(),
    n = new $e({ color: Uh(t, 0.35), emissive: 0, flatShading: !0 }),
    s = new $e({ color: 2435898, emissive: 0, flatShading: !0 }),
    r = new Ie({ color: t, toneMapped: !1, transparent: !0 }),
    a = [],
    o = (c, h, l, u, d, f = e) => {
      let p = new Gt(c, h);
      return (p.position.set(l, u, d), f.add(p), p);
    };
  if (i === "warden") {
    (o(new ye(1.8, 2.05, 1.5, 6), n, 0, 0.9, 0),
      o(new Ct(1.8, 0.9, 1.6), s, -0.2, 2, 0),
      o(new Ct(0.9, 1.1, 0.9), s, 0, 1.2, 1.9),
      o(new Ct(0.9, 1.1, 0.9), s, 0, 1.2, -1.9),
      o(new Ct(0.12, 0.28, 1.3), r, 0.72, 2.05, 0),
      o(new Ct(0.2, 0.2, 0.2), r, 0.46, 1.25, 1.9),
      o(new Ct(0.2, 0.2, 0.2), r, 0.46, 1.25, -1.9));
    let c = o(new Ve(1.95, 0.07, 5, 36), r, 0, 0.35, 0);
    c.rotation.x = Math.PI / 2;
  } else if (i === "queen") {
    (o(new De(1.35, 16, 10), n, 0.3, 1.9, 0).scale.set(1.1, 0.8, 1),
      o(new De(1.1, 14, 9), s, -1.3, 1.6, 0).scale.set(1.3, 0.85, 0.9),
      o(new De(0.2, 8, 6), r, 1.5, 2.1, 0.45),
      o(new De(0.2, 8, 6), r, 1.5, 2.1, -0.45),
      o(new De(0.34, 10, 8), r, -2.4, 1.6, 0));
    let l = o(new Ve(2.1, 0.09, 5, 40), r, 0, 2.2, 0);
    ((l.rotation.x = Math.PI / 2 - 0.25), a.push({ m: l, ax: "z", v: 0.8 }));
    for (let u = 0; u < 6; u++) {
      let d = (u / 6) * Math.PI * 2;
      o(new Ct(0.18, 1.3, 0.18), s, Math.cos(d) * 1.2, 0.6, Math.sin(d) * 1.2).rotation.set(
        Math.sin(d) * 0.5,
        0,
        -Math.cos(d) * 0.5,
      );
    }
  } else if (i === "prism") {
    let c = new $e({ color: 8370392, emissive: 666170, flatShading: !0, transparent: !0, opacity: 1 }),
      h = o(new Qe(1.35, 0), c, 0, 2.3, 0);
    (h.scale.set(1, 1.5, 1), a.push({ m: h, ax: "y", v: 0.7 }), o(new Qe(0.55, 0), r, 0, 2.3, 0));
    let l = new rn();
    l.position.y = 2.3;
    for (let u = 0; u < 3; u++) {
      let d = (u / 3) * Math.PI * 2,
        f = o(new Qe(0.32, 0), r, Math.cos(d) * 2.1, 0, Math.sin(d) * 2.1, l);
      f.scale.y = 1.6;
    }
    (e.add(l), a.push({ m: l, ax: "y", v: -1.6 }), (n.transparent = !0), (e.userData.fadeMats = [c, r]));
  } else {
    o(new De(1.15, 18, 12), r, 0, 2.4, 0);
    for (let l = 0; l < 3; l++) {
      let u = o(new Ve(1.75 + l * 0.35, 0.16, 6, 36), l === 1 ? s : n, 0, 2.4, 0);
      (u.rotation.set(l * 1.1, l * 0.6, 0),
        a.push({ m: u, ax: l === 0 ? "x" : l === 1 ? "y" : "z", v: 0.6 + l * 0.35 }));
    }
    let c = o(new ye(1.2, 1.8, 0.5, 8), s, 0, 0.25, 0);
    c.rotation.y = 0.3;
    let h = o(new Ve(2.4, 0.08, 5, 44), r, 0, 0.1, 0);
    h.rotation.x = Math.PI / 2;
  }
  return { group: e, mats: [n, s], glowMat: r, spin: a };
}
function zf() {
  return _e([At(new Qe(0.28), 9348036, { y: 0.9, sy: 0.6 }), At(new Ct(0.5, 0.06, 0.12), 2898514, { x: 0.2, y: 0.9 })]);
}
function Hf() {
  let i = new Fs();
  (i.moveTo(0.42, 0), i.lineTo(-0.1, 0.16), i.lineTo(-0.22, 0), i.lineTo(-0.1, -0.16), i.closePath());
  let t = new Hr(i, { depth: 0.06, bevelEnabled: !1 });
  return (t.rotateX(Math.PI / 2), t.translate(0, 0.62, 0), t);
}
function Gf() {
  let i = new Qe(0.2, 0);
  return (i.scale(1, 1.5, 1), i);
}
function Vf() {
  return _e([At(new Ct(0.5, 0.16, 0.16), 16777215), At(new Ct(0.16, 0.5, 0.16), 16777215)]);
}

export { Bf, Ff, Fh, Gf, Hf, Of, RL_MESH_TYPES, Uf, Vf, kf, zf };
