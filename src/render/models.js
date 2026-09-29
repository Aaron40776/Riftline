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
  TetrahedronGeometry,
  TorusGeometry,
  Vector3,
} from "three";

/* ==========================================================================
 Riftline 2.3.0 content
 - rlEnemyMesh: dedicated models for the 12 enemies added in 2.0–2.2
   (they used to fall back to the Grunt box). +x is the facing direction;
   body parts take the enemy colour (mid = 55 %, dark = 30 %), "glow" parts are
   white and get tinted per instance by the renderer.
 ========================================================================== */
function rlEnemyMesh(type, mid, dark, metal) {
  const white = 16777215,
    PI = Math.PI;
  switch (type) {
    case "leaper": {
      // crouched hopper: squat body, big folded hind legs, eye pair
      const legs = [];
      for (const z of [-0.34, 0.34])
        legs.push(
          meshPart(new BoxGeometry(0.62, 0.14, 0.16), dark, { x: -0.22, y: 0.3, z, rz: 0.75 }),
          meshPart(new BoxGeometry(0.5, 0.12, 0.14), metal, { x: -0.05, y: 0.14, z: z * 1.15, rz: -0.35 }),
        );
      return {
        body: mergeParts([
          meshPart(new SphereGeometry(0.46, 12, 8), mid, { y: 0.46, sx: 1.25, sy: 0.7 }),
          meshPart(new BoxGeometry(0.3, 0.14, 0.5), metal, { x: 0.36, y: 0.3 }),
          ...legs,
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.09, 8, 6), white, { x: 0.42, y: 0.62, z: 0.16 }),
          meshPart(new SphereGeometry(0.09, 8, 6), white, { x: 0.42, y: 0.62, z: -0.16 }),
          meshPart(new BoxGeometry(0.5, 0.04, 0.06), white, { x: -0.05, y: 0.78 }),
        ]),
      };
    }
    case "turret": {
      // hex base, column, gun head with long barrel
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.55, 0.7, 0.3, 6), dark, { y: 0.15 }),
          meshPart(new CylinderGeometry(0.17, 0.22, 0.5, 8), metal, { y: 0.52 }),
          meshPart(new BoxGeometry(0.56, 0.34, 0.48), mid, { y: 0.9 }),
          meshPart(new BoxGeometry(0.9, 0.11, 0.11), metal, { x: 0.62, y: 0.92 }),
          meshPart(new BoxGeometry(0.2, 0.2, 0.52), metal, { x: -0.3, y: 0.94 }),
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.1, 8, 6), white, { x: 1.08, y: 0.92 }),
          meshPart(new TorusGeometry(0.64, 0.035, 4, 24), white, { y: 0.06, rx: PI / 2 }),
          meshPart(new BoxGeometry(0.06, 0.08, 0.3), white, { x: 0.29, y: 1.02 }),
        ]),
      };
    }
    case "charger": {
      // armoured wedge with a ram horn
      return {
        body: mergeParts([
          meshPart(new BoxGeometry(1.05, 0.58, 0.78), mid, { y: 0.46 }),
          meshPart(new BoxGeometry(0.62, 0.34, 0.66), dark, { x: -0.12, y: 0.86 }),
          meshPart(new ConeGeometry(0.28, 0.7, 6), metal, { x: 0.82, y: 0.5, rz: -PI / 2 }),
          meshPart(new ConeGeometry(0.1, 0.36, 5), metal, { x: 0.4, y: 0.86, z: 0.3, rz: -0.9 }),
          meshPart(new ConeGeometry(0.1, 0.36, 5), metal, { x: 0.4, y: 0.86, z: -0.3, rz: -0.9 }),
        ]),
        glow: mergeParts([
          meshPart(new BoxGeometry(0.07, 0.08, 0.52), white, { x: 0.54, y: 0.66 }),
          meshPart(new BoxGeometry(0.7, 0.05, 0.06), white, { x: -0.15, y: 1.05 }),
        ]),
      };
    }
    case "minebot": {
      // low crab dome carrying three mines
      const legs = [],
        mines = [];
      for (const angle of [0.6, 2.5, 3.8, 5.7])
        legs.push(
          meshPart(new BoxGeometry(0.5, 0.1, 0.1), metal, {
            x: Math.cos(angle) * 0.55,
            y: 0.14,
            z: Math.sin(angle) * 0.55,
            ry: -angle,
          }),
        );
      for (let k = 0; k < 3; k++) {
        const angle = PI * 0.6 + k * 0.45;
        mines.push(
          meshPart(new SphereGeometry(0.13, 8, 6), white, {
            x: Math.cos(angle) * 0.34,
            y: 0.78,
            z: Math.sin(angle) * 0.34 - 0.02,
          }),
        );
      }
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.62, 0.7, 0.28, 8), dark, { y: 0.26 }),
          meshPart(new SphereGeometry(0.52, 14, 8, 0, PI * 2, 0, PI / 2), mid, { y: 0.38 }),
          ...legs,
        ]),
        glow: mergeParts([...mines, meshPart(new BoxGeometry(0.1, 0.1, 0.34), white, { x: 0.52, y: 0.44 })]),
      };
    }
    case "sapper": {
      // upright engineer with a charge pack on its back
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.32, 0.4, 0.78, 8), mid, { y: 0.42 }),
          meshPart(new SphereGeometry(0.26, 10, 8), dark, { y: 0.95 }),
          meshPart(new BoxGeometry(0.34, 0.5, 0.5), metal, { x: -0.38, y: 0.56 }),
          meshPart(new CylinderGeometry(0.05, 0.05, 0.35, 6), metal, { x: -0.38, y: 0.98 }),
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.09, 8, 6), white, { x: -0.38, y: 1.18 }),
          meshPart(new TorusGeometry(0.2, 0.035, 4, 16), white, { x: -0.38, y: 0.56, ry: PI / 2 }),
          meshPart(new BoxGeometry(0.08, 0.06, 0.3), white, { x: 0.24, y: 0.98 }),
        ]),
      };
    }
    case "phantom": {
      // hooded wraith fading into a point
      return {
        body: mergeParts([
          meshPart(new ConeGeometry(0.46, 1.05, 8), mid, { y: 0.62, rx: PI }),
          meshPart(new SphereGeometry(0.32, 12, 8), dark, { y: 1.18 }),
          meshPart(new ConeGeometry(0.34, 0.4, 8), metal, { x: -0.05, y: 1.36 }),
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.08, 8, 6), white, { x: 0.27, y: 1.2, z: 0.12 }),
          meshPart(new SphereGeometry(0.08, 8, 6), white, { x: 0.27, y: 1.2, z: -0.12 }),
          meshPart(new TorusGeometry(0.42, 0.035, 4, 20), white, { y: 0.34, rx: PI / 2 }),
          meshPart(new TorusGeometry(0.3, 0.03, 4, 18), white, { y: 0.8, rx: PI / 2 }),
          meshPart(new TorusGeometry(0.34, 0.03, 4, 18), white, { y: 1.18, rz: PI / 2 }),
        ]),
      };
    }
    case "sentinel": {
      // floating eye on a pylon, framed by a vertical ring
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.18, 0.46, 0.55, 6), dark, { y: 0.28 }),
          meshPart(new SphereGeometry(0.48, 14, 10), mid, { y: 1.05 }),
          meshPart(new TorusGeometry(0.64, 0.07, 5, 28), metal, { y: 1.05 }),
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.2, 10, 8), white, { x: 0.4, y: 1.05 }),
          meshPart(new TorusGeometry(0.26, 0.03, 4, 18), white, { x: 0.34, y: 1.05, ry: PI / 2 }),
          meshPart(new TorusGeometry(0.46, 0.03, 4, 20), white, { y: 0.05, rx: PI / 2 }),
        ]),
      };
    }
    case "carrier": {
      // hovering saucer with launch bays
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.86, 0.62, 0.28, 12), mid, { y: 0.62 }),
          meshPart(new SphereGeometry(0.4, 12, 8, 0, PI * 2, 0, PI / 2), dark, { y: 0.76 }),
          meshPart(new BoxGeometry(0.34, 0.2, 0.3), metal, { y: 0.6, z: 0.78 }),
          meshPart(new BoxGeometry(0.34, 0.2, 0.3), metal, { y: 0.6, z: -0.78 }),
          meshPart(new BoxGeometry(0.3, 0.2, 0.34), metal, { x: -0.8, y: 0.6 }),
        ]),
        glow: mergeParts([
          meshPart(new TorusGeometry(0.7, 0.045, 4, 28), white, { y: 0.46, rx: PI / 2 }),
          meshPart(new BoxGeometry(0.08, 0.06, 0.24), white, { x: 0.84, y: 0.64 }),
          meshPart(new SphereGeometry(0.1, 8, 6), white, { y: 1.14 }),
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
        arms.push(
          meshPart(new BoxGeometry(0.5, 0.06, 0.08), metal, { x: x / 2, y: 0.82, z: z / 2, ry: Math.atan2(-z, x) }),
        );
        rotors.push(meshPart(new TorusGeometry(0.17, 0.028, 4, 16), white, { x, y: 0.9, z, rx: PI / 2 }));
      }
      return {
        body: mergeParts([
          meshPart(new BoxGeometry(0.4, 0.16, 0.36), mid, { y: 0.82 }),
          meshPart(new BoxGeometry(0.34, 0.08, 0.08), dark, { x: 0.3, y: 0.76 }),
          ...arms,
        ]),
        glow: mergeParts([...rotors, meshPart(new SphereGeometry(0.07, 8, 6), white, { x: 0.48, y: 0.76 })]),
      };
    }
    case "driller": {
      // tracked body with a spinning drill
      return {
        body: mergeParts([
          meshPart(new BoxGeometry(0.95, 0.5, 0.76), mid, { y: 0.42 }),
          meshPart(new BoxGeometry(1.1, 0.22, 0.2), metal, { y: 0.14, z: 0.44 }),
          meshPart(new BoxGeometry(1.1, 0.22, 0.2), metal, { y: 0.14, z: -0.44 }),
          meshPart(new ConeGeometry(0.34, 0.9, 8), dark, { x: 0.88, y: 0.46, rz: -PI / 2 }),
          meshPart(new CylinderGeometry(0.1, 0.14, 0.4, 6), metal, { x: -0.32, y: 0.84 }),
        ]),
        glow: mergeParts([
          meshPart(new TorusGeometry(0.36, 0.04, 4, 20), white, { x: 0.46, y: 0.46, ry: PI / 2 }),
          meshPart(new SphereGeometry(0.08, 8, 6), white, { x: -0.32, y: 1.08 }),
          meshPart(new BoxGeometry(0.07, 0.06, 0.5), white, { x: 0.2, y: 0.68 }),
        ]),
      };
    }
    case "beacon": {
      // repair spire with stacked halo rings
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.46, 0.58, 0.26, 6), dark, { y: 0.13 }),
          meshPart(new CylinderGeometry(0.16, 0.3, 1.15, 6), mid, { y: 0.82 }),
          meshPart(new BoxGeometry(0.62, 0.1, 0.1), metal, { y: 1.22 }),
          meshPart(new BoxGeometry(0.1, 0.1, 0.62), metal, { y: 1.22 }),
        ]),
        glow: mergeParts([
          meshPart(new OctahedronGeometry(0.24), white, { y: 1.6 }),
          meshPart(new TorusGeometry(0.4, 0.035, 4, 22), white, { y: 0.55, rx: PI / 2 }),
          meshPart(new TorusGeometry(0.3, 0.03, 4, 20), white, { y: 0.95, rx: PI / 2 }),
        ]),
      };
    }
    case "weaver": {
      // angular rift spider
      const legs = [];
      for (let k = 0; k < 6; k++) {
        const angle = (k < 3 ? -1 : 1) * (0.6 + (k % 3) * 0.55);
        legs.push(
          meshPart(new BoxGeometry(0.62, 0.06, 0.08), metal, {
            x: Math.cos(angle) * 0.34,
            y: 0.46,
            z: Math.sin(angle) * 0.34,
            ry: -angle,
            rz: 0.45,
          }),
        );
      }
      return {
        body: mergeParts([
          meshPart(new OctahedronGeometry(0.38), mid, { y: 0.66, sx: 1.35, sy: 0.8 }),
          meshPart(new OctahedronGeometry(0.2), dark, { x: 0.46, y: 0.7 }),
          ...legs,
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.1, 8, 6), white, { y: 0.72 }),
          meshPart(new TorusGeometry(0.5, 0.03, 4, 22), white, { y: 0.66, rx: PI / 2 }),
          meshPart(new BoxGeometry(0.06, 0.06, 0.2), white, { x: 0.62, y: 0.72 }),
        ]),
      };
    }
  }
  return null;
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
function meshPart(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  let part = geo.index ? geo.toNonIndexed() : geo;
  partEuler.set(rx, ry, rz);
  partQuat.setFromEuler(partEuler);
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
function enemyGeometry(type, color) {
  let mid = darken(color, 0.55),
    dark = darken(color, 0.3),
    metal = 3818070;
  switch (type) {
    case "swarmer":
      return {
        body: mergeParts([
          meshPart(new ConeGeometry(0.4, 1, 4), mid, { x: 0.05, y: 0.45, rz: -Math.PI / 2, rx: Math.PI / 4 }),
          meshPart(new BoxGeometry(0.45, 0.06, 0.95), dark, { x: -0.2, y: 0.45 }),
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.13, 8, 6), 16777215, { x: -0.38, y: 0.45 }),
          meshPart(new BoxGeometry(0.1, 0.07, 0.95), 16777215, { x: -0.44, y: 0.45 }),
        ]),
      };
    case "mite":
      return {
        body: mergeParts([meshPart(new TetrahedronGeometry(0.34), mid, { y: 0.32, ry: 0.4 })]),
        glow: mergeParts([meshPart(new SphereGeometry(0.1, 6, 4), 16777215, { x: 0.15, y: 0.42 })]),
      };
    case "grunt":
      return {
        body: mergeParts([
          meshPart(new BoxGeometry(0.9, 0.75, 0.9), mid, { y: 0.5 }),
          meshPart(new BoxGeometry(0.5, 0.5, 1.25), dark, { x: -0.1, y: 0.55 }),
          meshPart(new BoxGeometry(0.7, 0.2, 0.7), metal, { y: 0.98 }),
        ]),
        glow: mergeParts([meshPart(new BoxGeometry(0.1, 0.14, 0.62), 16777215, { x: 0.46, y: 0.62 })]),
      };
    case "gunner":
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.42, 0.52, 0.75, 8), mid, { y: 0.42 }),
          meshPart(new BoxGeometry(0.8, 0.15, 0.15), metal, { x: 0.52, y: 0.62 }),
          meshPart(new SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark, { y: 0.8 }),
        ]),
        glow: mergeParts([
          meshPart(new TorusGeometry(0.47, 0.05, 5, 18), 16777215, { y: 0.78, rx: Math.PI / 2 }),
          meshPart(new BoxGeometry(0.1, 0.18, 0.18), 16777215, { x: 0.95, y: 0.62 }),
        ]),
      };
    case "bomber":
      return {
        body: mergeParts([
          meshPart(new SphereGeometry(0.5, 12, 8), mid, { y: 0.52 }),
          meshPart(new CylinderGeometry(0.1, 0.12, 0.25, 6), metal, { y: 1.05 }),
        ]),
        glow: mergeParts([
          meshPart(new TorusGeometry(0.5, 0.06, 5, 20), 16777215, { y: 0.52, rx: Math.PI / 2 }),
          meshPart(new SphereGeometry(0.12, 8, 6), 16777215, { y: 1.22 }),
        ]),
      };
    case "splitter":
      return {
        body: mergeParts([meshPart(new DodecahedronGeometry(0.78), mid, { y: 0.8 })]),
        glow: mergeParts([
          meshPart(new TorusGeometry(0.8, 0.06, 5, 24), 16777215, { y: 0.8, rx: Math.PI / 2 }),
          meshPart(new OctahedronGeometry(0.2), 16777215, { y: 1.62 }),
        ]),
      };
    case "brute":
      return {
        body: mergeParts([
          meshPart(new BoxGeometry(1.5, 1.1, 1.6), mid, { y: 0.66 }),
          meshPart(new BoxGeometry(0.9, 0.7, 2.2), dark, { x: -0.15, y: 1 }),
          meshPart(new BoxGeometry(0.5, 0.35, 0.9), metal, { x: 0.65, y: 0.35 }),
        ]),
        glow: mergeParts([
          meshPart(new BoxGeometry(0.1, 0.16, 0.24), 16777215, { x: 0.76, y: 0.95, z: 0.35 }),
          meshPart(new BoxGeometry(0.1, 0.16, 0.24), 16777215, { x: 0.76, y: 0.95, z: -0.35 }),
          meshPart(new BoxGeometry(0.14, 0.1, 1.6), 16777215, { x: -0.76, y: 0.8 }),
        ]),
      };
    case "sniper":
      return {
        body: mergeParts([
          meshPart(new OctahedronGeometry(0.5), mid, { y: 0.95, sy: 1.7 }),
          meshPart(new BoxGeometry(1.4, 0.09, 0.09), metal, { x: 0.7, y: 0.95 }),
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.12, 8, 6), 16777215, { x: 1.42, y: 0.95 }),
          meshPart(new OctahedronGeometry(0.16), 16777215, { y: 1.95 }),
        ]),
      };
    case "hive": {
      let glows = [];
      for (let i = 0; i < 6; i++) {
        let angle = (i / 6) * Math.PI * 2;
        glows.push(
          meshPart(new SphereGeometry(0.2, 8, 6), 16777215, {
            x: Math.cos(angle) * 1.02,
            y: 1.05 + (i % 2) * 0.35,
            z: Math.sin(angle) * 1.02,
          }),
        );
      }
      glows.push(meshPart(new OctahedronGeometry(0.28), 16777215, { y: 2.2 }));
      return {
        body: mergeParts([
          meshPart(new IcosahedronGeometry(1.05, 0), mid, { y: 1.15 }),
          meshPart(new CylinderGeometry(0.7, 1, 0.35, 8), dark, { y: 0.18 }),
        ]),
        glow: mergeParts(glows),
      };
    }
    case "bulwark":
      return {
        body: mergeParts([
          meshPart(new BoxGeometry(1.1, 1, 1.2), mid, { x: -0.15, y: 0.6 }),
          meshPart(new BoxGeometry(0.6, 0.35, 0.9), metal, { x: -0.2, y: 1.25 }),
          meshPart(new CylinderGeometry(0.22, 0.26, 0.5, 6), dark, { x: -0.1, y: 0.2, z: 0.45 }),
          meshPart(new CylinderGeometry(0.22, 0.26, 0.5, 6), dark, { x: -0.1, y: 0.2, z: -0.45 }),
        ]),
        glow: mergeParts([
          meshPart(new BoxGeometry(0.08, 0.12, 0.5), 16777215, { x: 0.43, y: 0.95 }),
          meshPart(new BoxGeometry(0.5, 0.06, 0.06), 16777215, { x: -0.2, y: 1.45 }),
        ]),
      };
    case "striker":
      return {
        body: mergeParts([
          meshPart(new OctahedronGeometry(0.42), mid, { y: 0.7, sx: 1.5, sy: 0.9, sz: 0.8 }),
          meshPart(new BoxGeometry(0.9, 0.05, 0.14), metal, { x: 0.35, y: 0.62, z: 0.34, ry: -0.35 }),
          meshPart(new BoxGeometry(0.9, 0.05, 0.14), metal, { x: 0.35, y: 0.62, z: -0.34, ry: 0.35 }),
        ]),
        glow: mergeParts([
          meshPart(new SphereGeometry(0.12, 8, 6), 16777215, { x: 0.45, y: 0.78 }),
          meshPart(new BoxGeometry(0.5, 0.03, 0.05), 16777215, { x: 0.78, y: 0.64, z: 0.5, ry: -0.35 }),
          meshPart(new BoxGeometry(0.5, 0.03, 0.05), 16777215, { x: 0.78, y: 0.64, z: -0.5, ry: 0.35 }),
        ]),
      };
    case "mender":
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.35, 0.55, 0.7, 6), mid, { y: 0.4 }),
          meshPart(new OctahedronGeometry(0.32), dark, { y: 1.05 }),
        ]),
        glow: mergeParts([
          meshPart(new BoxGeometry(0.5, 0.12, 0.12), 16777215, { y: 1.05 }),
          meshPart(new BoxGeometry(0.12, 0.12, 0.5), 16777215, { y: 1.05 }),
          meshPart(new TorusGeometry(0.55, 0.04, 5, 18), 16777215, { y: 0.1, rx: Math.PI / 2 }),
        ]),
      };
    case "mortar":
      return {
        body: mergeParts([
          meshPart(new CylinderGeometry(0.75, 0.85, 0.5, 8), dark, { y: 0.25 }),
          meshPart(new SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mid, { y: 0.5 }),
          meshPart(new CylinderGeometry(0.2, 0.26, 0.95, 10), metal, { x: 0.25, y: 1.05, rz: -0.55 }),
        ]),
        glow: mergeParts([
          meshPart(new TorusGeometry(0.2, 0.05, 5, 14), 16777215, { x: 0.52, y: 1.45, rz: -0.55, ry: Math.PI / 2 }),
          meshPart(new TorusGeometry(0.78, 0.04, 5, 24), 16777215, { y: 0.52, rx: Math.PI / 2 }),
        ]),
      };
  }
  const rlM = rlEnemyMesh(type, mid, dark, metal);
  return rlM || enemyGeometry("grunt", color);
}
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
  let group = new Group(),
    hullMat = new MeshLambertMaterial({ color: 2898514, emissive: 0 }),
    trimMat = new MeshLambertMaterial({ color: 9348036, emissive: 0 }),
    glowMat = new MeshBasicMaterial({ color, toneMapped: false }),
    base = new Group(),
    body = new Mesh(new CylinderGeometry(0.5, 0.62, 0.34, 6), hullMat);
  body.position.y = 0.52;
  let skirt = new Mesh(new CylinderGeometry(0.64, 0.5, 0.14, 6), trimMat);
  skirt.position.y = 0.3;
  let ring = new Mesh(new TorusGeometry(0.6, 0.045, 5, 24), glowMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.52;
  let fin = new Mesh(new BoxGeometry(0.16, 0.12, 0.5), glowMat);
  fin.position.set(-0.55, 0.42, 0);
  base.add(body, skirt, ring, fin);
  group.add(base);
  let turret = new Group();
  turret.position.y = 0.78;
  let dome = new Mesh(new SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), trimMat);
  turret.add(dome);
  let sight = new Mesh(new BoxGeometry(0.08, 0.08, 0.3), glowMat);
  sight.position.set(0.24, 0.12, 0);
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
  shield.position.y = 0.6;
  group.add(shield);
  return { group, base, turret, shield, mats: [hullMat, trimMat], glowMat };
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
