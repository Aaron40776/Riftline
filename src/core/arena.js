// Arena layouts: obstacles, hazards (vents, ice, acid, portals), wave obstacles, flow field and
// spatial hash.

import { clamp, TAU, hashString, angleDiff, makeRng } from "./util.js";
import { RL_BIOME_HAZARD } from "../data/biomes.js";

const Arena = class {
  constructor(biome, layout) {
    this.biome = biome;
    let lay = layout || { key: biome.id + ":classic", W: biome.W, H: biome.H, obstacles: biome.obstacles, deco: 0 };
    this.key = lay.key;
    this.director = lay.director || null;
    this.deco = lay.deco || 0;
    this.template = lay.template || "classic";
    this.W = lay.W;
    this.H = lay.H;
    this.obs = lay.obstacles.map((ob) => ({ ...ob }));
    let features = lay.features || {};
    this.vents = (features.vents || []).map((vent) => ({ ...vent }));
    this.ice = (features.ice || []).map((patch) => ({ ...patch }));
    this.portals = (features.portals || []).map((portal) => ({ ...portal }));
    this.acid = (features.acid || []).map((puddle) => ({ ...puddle }));
    this.flow = new FlowField(this);
  }
  ventState(vent, time) {
    let cycle = (time + vent.phase) % vent.period,
      eruptAt = vent.period - 1.5,
      warnAt = eruptAt - 1.2;
    return cycle >= eruptAt ? "erupt" : cycle >= warnAt ? "warn" : "idle";
  }
  inAcid(x, y) {
    for (let puddle of this.acid) {
      let dx = x - puddle.x,
        dy = y - puddle.y;
      if (dx * dx + dy * dy < puddle.r * puddle.r) return true;
    }
    return false;
  }
  onIce(x, y) {
    for (let patch of this.ice) {
      let dx = x - patch.x,
        dy = y - patch.y;
      if (dx * dx + dy * dy < patch.r * patch.r) return true;
    }
    return false;
  }
  blocked(x, y, pad = 0) {
    for (let ob of this.obs)
      if (ob.t === "c") {
        let dx = x - ob.x,
          dy = y - ob.y,
          rad = ob.r + pad;
        if (dx * dx + dy * dy < rad * rad) return true;
      } else if (Math.abs(x - ob.x) < ob.w + pad && Math.abs(y - ob.y) < ob.h + pad) return true;
    return false;
  }
  outside(x, y, pad = 0) {
    return x < -this.W + pad || x > this.W - pad || y < -this.H + pad || y > this.H - pad;
  }
  resolve(ent, rad) {
    let moved = false;
    for (let ob of this.obs)
      if (ob.t === "c") {
        let dx = ent.x - ob.x,
          dy = ent.y - ob.y,
          minDist = ob.r + rad,
          d2 = dx * dx + dy * dy;
        if (d2 < minDist * minDist) {
          if (d2 < 1e-10) {
            ent.x = ob.x + minDist;
            moved = true;
            continue;
          }
          let dist = Math.sqrt(d2);
          ent.x = ob.x + (dx / dist) * minDist;
          ent.y = ob.y + (dy / dist) * minDist;
          moved = true;
        }
      } else {
        let nearX = clamp(ent.x, ob.x - ob.w, ob.x + ob.w),
          nearY = clamp(ent.y, ob.y - ob.h, ob.y + ob.h),
          dx = ent.x - nearX,
          dy = ent.y - nearY,
          d2 = dx * dx + dy * dy;
        if (d2 < rad * rad) {
          if (d2 > 1e-8) {
            let dist = Math.sqrt(d2);
            ent.x = nearX + (dx / dist) * rad;
            ent.y = nearY + (dy / dist) * rad;
          } else {
            let overX = ob.w + rad - Math.abs(ent.x - ob.x),
              overY = ob.h + rad - Math.abs(ent.y - ob.y);
            if (overX < overY) {
              ent.x = ob.x + Math.sign(ent.x - ob.x || 1) * (ob.w + rad);
            } else {
              ent.y = ob.y + Math.sign(ent.y - ob.y || 1) * (ob.h + rad);
            }
          }
          moved = true;
        }
      }
    let maxX = this.W - rad,
      maxY = this.H - rad;
    if (ent.x < -maxX) {
      ent.x = -maxX;
      moved = true;
    } else {
      if (ent.x > maxX) {
        ent.x = maxX;
        moved = true;
      }
    }
    if (ent.y < -maxY) {
      ent.y = -maxY;
      moved = true;
    } else {
      if (ent.y > maxY) {
        ent.y = maxY;
        moved = true;
      }
    }
    return moved;
  }
  los(x0, y0, x1, y1, pad = 0) {
    for (let ob of this.obs)
      if (ob.t === "c") {
        let rad = ob.r + pad,
          dx = x1 - x0,
          dy = y1 - y0,
          len2 = dx * dx + dy * dy,
          along = len2 > 0 ? ((ob.x - x0) * dx + (ob.y - y0) * dy) / len2 : 0;
        along = clamp(along, 0, 1);
        let offX = x0 + dx * along - ob.x,
          offY = y0 + dy * along - ob.y;
        if (offX * offX + offY * offY < rad * rad) return false;
      } else if (
        segmentHitsBox(x0, y0, x1, y1, ob.x - ob.w - pad, ob.y - ob.h - pad, ob.x + ob.w + pad, ob.y + ob.h + pad)
      )
        return false;
    return true;
  }
  rayLen(x, y, angle, maxLen) {
    let dirX = Math.cos(angle),
      dirY = Math.sin(angle);
    for (let dist = 0.8; dist < maxLen; dist += 0.35) {
      let px = x + dirX * dist,
        py = y + dirY * dist;
      if (this.outside(px, py) || this.blocked(px, py, 0)) return dist;
    }
    return maxLen;
  }
  featureBlocked(x, y, pad = 0.35) {
    let near = (fx, fy, fr, margin = 0.55) => {
      let dx = x - fx,
        dy = y - fy,
        lim = fr + margin + pad;
      return dx * dx + dy * dy < lim * lim;
    };
    for (let vent of this.vents) if (near(vent.x, vent.y, vent.r, 0.7)) return true;
    for (let patch of this.ice) if (near(patch.x, patch.y, patch.r, 0.45)) return true;
    for (let puddle of this.acid) if (near(puddle.x, puddle.y, puddle.r, 0.55)) return true;
    for (let portal of this.portals)
      if (near(portal.ax, portal.ay, 1, 0.45) || near(portal.bx, portal.by, 1, 0.45)) return true;
    return false;
  }
  freePoint(rng, x, y, minDist, rad = 1) {
    let best = null,
      bestScore = -1e9,
      far = null,
      farDist = -1;
    for (let k = 0; k < 72; k++) {
      let px = rng.range(-this.W + 1.5, this.W - 1.5),
        py = rng.range(-this.H + 1.5, this.H - 1.5);
      if (this.blocked(px, py, rad + 0.4) || this.featureBlocked(px, py, rad * 0.3)) continue;
      let dx = px - x,
        dy = py - y,
        d2 = dx * dx + dy * dy,
        dist = Math.sqrt(d2);
      if (dist > farDist) {
        farDist = dist;
        far = { x: px, y: py };
      }
      if (d2 < minDist * minDist) continue;
      let wallRoom = Math.min(this.W - Math.abs(px), this.H - Math.abs(py)),
        score = dist + Math.min(5, wallRoom) * 0.35 + rng.next() * 0.7;
      if (score > bestScore) {
        bestScore = score;
        best = { x: px, y: py };
      }
    }
    if (best) return best;
    for (let corner of [
      [0, -this.H + 2],
      [0, this.H - 2],
      [-this.W + 2, 0],
      [this.W - 2, 0],
      [-this.W + 2, -this.H + 2],
      [this.W - 2, -this.H + 2],
      [-this.W + 2, this.H - 2],
      [this.W - 2, this.H - 2],
    ]) {
      if (this.blocked(corner[0], corner[1], rad + 0.4) || this.featureBlocked(corner[0], corner[1], rad * 0.3))
        continue;
      let dist = Math.hypot(corner[0] - x, corner[1] - y);
      if (dist >= minDist) return { x: corner[0], y: corner[1] };
      if (dist > farDist) {
        farDist = dist;
        far = { x: corner[0], y: corner[1] };
      }
    }
    if (far) return far;
    const px = x > 0 ? -this.W + 2 : this.W - 2,
      py = y > 0 ? -this.H + 2 : this.H - 2;
    return this.blocked(px, py, rad + 0.1) || this.featureBlocked(px, py, rad * 0.1)
      ? { x: 0, y: 0 }
      : { x: px, y: py };
  }
};
function segmentHitsBox(x0, y0, x1, y1, minX, minY, maxX, maxY) {
  let tMin = 0,
    tMax = 1,
    dx = x1 - x0,
    dy = y1 - y0,
    dirs = [-dx, dx, -dy, dy],
    dists = [x0 - minX, maxX - x0, y0 - minY, maxY - y0];
  for (let k = 0; k < 4; k++) {
    if (dirs[k] === 0) {
      if (dists[k] < 0) return false;
      continue;
    }
    let ratio = dists[k] / dirs[k];
    if (dirs[k] < 0) {
      if (ratio > tMax) return false;
      if (ratio > tMin) {
        tMin = ratio;
      }
    } else {
      if (ratio < tMin) return false;
      if (ratio < tMax) {
        tMax = ratio;
      }
    }
  }
  return true;
}
const SpatialHash = class {
    constructor(halfW, halfH, cellSize = 2.5) {
      this.cell = cellSize;
      this.ox = -halfW - 2;
      this.oy = -halfH - 2;
      this.cols = Math.ceil((2 * halfW + 4) / cellSize);
      this.rows = Math.ceil((2 * halfH + 4) / cellSize);
      let cells = this.cols * this.rows;
      this.start = new Int32Array(cells + 1);
      this.count = new Int32Array(cells);
      this.items = [];
      this.cellOf = new Int32Array(0);
      this.list = null;
      this.maxR = 1;
    }
    _cell(x, y) {
      let col = clamp(Math.floor((x - this.ox) / this.cell), 0, this.cols - 1);
      return clamp(Math.floor((y - this.oy) / this.cell), 0, this.rows - 1) * this.cols + col;
    }
    build(list) {
      this.list = list;
      let len = list.length;
      if (this.cellOf.length < len) {
        this.cellOf = new Int32Array(Math.max(len, this.cellOf.length * 2, 64));
      }
      this.count.fill(0);
      let maxR = 0.5;
      for (let k = 0; k < len; k++) {
        let item = list[k],
          cell = this._cell(item.x, item.y);
        this.cellOf[k] = cell;
        this.count[cell]++;
        if (item.r > maxR) {
          maxR = item.r;
        }
      }
      this.maxR = maxR;
      let offset = 0;
      for (let k = 0; k < this.count.length; k++) {
        this.start[k] = offset;
        offset += this.count[k];
      }
      this.start[this.count.length] = offset;
      let fill = this.count;
      fill.fill(0);
      this.items.length = len;
      for (let k = 0; k < len; k++) {
        let cell = this.cellOf[k];
        this.items[this.start[cell] + fill[cell]++] = list[k];
      }
    }
    query(x, y, rad, visit) {
      let reach = rad + this.maxR,
        col0 = clamp(Math.floor((x - reach - this.ox) / this.cell), 0, this.cols - 1),
        col1 = clamp(Math.floor((x + reach - this.ox) / this.cell), 0, this.cols - 1),
        row0 = clamp(Math.floor((y - reach - this.oy) / this.cell), 0, this.rows - 1),
        row1 = clamp(Math.floor((y + reach - this.oy) / this.cell), 0, this.rows - 1);
      for (let row = row0; row <= row1; row++)
        for (let col = col0; col <= col1; col++) {
          let cell = row * this.cols + col;
          for (let k = this.start[cell], end = this.start[cell + 1]; k < end; k++) if (visit(this.items[k])) return;
        }
    }
  },
  FlowField = class {
    constructor(arena) {
      this.a = arena;
      this.cs = 1;
      this.cols = Math.ceil(arena.W * 2);
      this.rows = Math.ceil(arena.H * 2);
      let cells = this.cols * this.rows;
      this.block = new Uint8Array(cells);
      this.dist = new Int32Array(cells);
      this.dx = new Float32Array(cells);
      this.dy = new Float32Array(cells);
      this.queue = new Int32Array(cells);
      this.target = -1;
      for (let row = 0; row < this.rows; row++)
        for (let col = 0; col < this.cols; col++) {
          let x = -arena.W + (col + 0.5) * this.cs,
            y = -arena.H + (row + 0.5) * this.cs;
          this.block[row * this.cols + col] = arena.blocked(x, y, 0.55) ? 1 : 0;
        }
    }
    idx(x, y) {
      let col = clamp(Math.floor((x + this.a.W) / this.cs), 0, this.cols - 1);
      return clamp(Math.floor((y + this.a.H) / this.cs), 0, this.rows - 1) * this.cols + col;
    }
    update(x, y) {
      let goal = this.idx(x, y);
      if (goal === this.target) return;
      this.target = goal;
      let { cols, rows, dist, block, queue } = this;
      dist.fill(1 << 30);
      let head = 0,
        tail = 0;
      for (dist[goal] = 0, queue[tail++] = goal; head < tail; ) {
        let cell = queue[head++],
          col = cell % cols,
          row = (cell / cols) | 0,
          nd = dist[cell] + 1,
          nb;
        if (col > 0 && !block[(nb = cell - 1)] && dist[nb] > nd) {
          dist[nb] = nd;
          queue[tail++] = nb;
        }
        if (col < cols - 1 && !block[(nb = cell + 1)] && dist[nb] > nd) {
          dist[nb] = nd;
          queue[tail++] = nb;
        }
        if (row > 0 && !block[(nb = cell - cols)] && dist[nb] > nd) {
          dist[nb] = nd;
          queue[tail++] = nb;
        }
        if (row < rows - 1 && !block[(nb = cell + cols)] && dist[nb] > nd) {
          dist[nb] = nd;
          queue[tail++] = nb;
        }
      }
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          let cell = row * cols + col,
            best = dist[cell],
            bestX = 0,
            bestY = 0;
          for (let oy = -1; oy <= 1; oy++)
            for (let ox = -1; ox <= 1; ox++) {
              if (!ox && !oy) continue;
              let nc = col + ox,
                nr = row + oy;
              if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
              let ncell = nr * cols + nc;
              if (!(ox && oy && (block[row * cols + nc] || block[nr * cols + col]))) {
                if (dist[ncell] < best) {
                  best = dist[ncell];
                  bestX = ox;
                  bestY = oy;
                }
              }
            }
          let len = Math.hypot(bestX, bestY) || 1;
          this.dx[cell] = bestX / len;
          this.dy[cell] = bestY / len;
        }
    }
  };
const OBSTACLE_GAP = 2.7,
  spawnZone = { x: 0, y: 2, r: 4.6 },
  obstacleShapes = {
    yard: [
      [5, (rng) => ({ t: "c", r: rng.range(1, 1.5) })],
      [
        3,
        (rng) => {
          let size = rng.range(0.7, 1.1);
          return { t: "b", w: size, h: size };
        },
      ],
    ],
    works: [
      [
        4,
        (rng) =>
          rng.chance(0.5)
            ? { t: "b", w: rng.range(2.4, 4.2), h: rng.range(0.6, 0.85) }
            : { t: "b", w: rng.range(0.6, 0.85), h: rng.range(2.4, 4.2) },
      ],
      [3, (rng) => ({ t: "c", r: rng.range(1.1, 1.6) })],
      [
        2,
        (rng) => {
          let size = rng.range(0.8, 1.2);
          return { t: "b", w: size, h: size };
        },
      ],
    ],
    vault: [
      [4, (rng) => ({ t: "c", r: rng.range(0.7, 1.1) })],
      [
        3,
        (rng) =>
          rng.chance(0.5)
            ? { t: "b", w: rng.range(1.4, 2.6), h: rng.range(0.7, 1) }
            : { t: "b", w: rng.range(0.7, 1), h: rng.range(1.4, 2.6) },
      ],
    ],
    marsh: [
      [4, (rng) => ({ t: "c", r: rng.range(0.9, 1.5) })],
      [
        3,
        (rng) =>
          rng.chance(0.5)
            ? { t: "b", w: rng.range(1.4, 2.4), h: rng.range(0.7, 1) }
            : { t: "b", w: rng.range(0.7, 1), h: rng.range(1.4, 2.4) },
      ],
    ],
    void: [
      [
        4,
        (rng) =>
          rng.chance(0.5)
            ? { t: "b", w: rng.range(0.5, 0.7), h: rng.range(1.3, 2.2) }
            : { t: "b", w: rng.range(1.3, 2.2), h: rng.range(0.5, 0.7) },
      ],
      [3, (rng) => ({ t: "c", r: rng.range(0.9, 1.3) })],
    ],
  },
  mapTemplates = {
    yard: ["scatter", "ring", "rot4", "mirror2"],
    works: ["scatter", "lanes", "mirror2", "rot2"],
    vault: ["scatter", "rot2", "ring", "rot4"],
    void: ["scatter", "ring", "rot2", "mirror4"],
    marsh: ["scatter", "mirror2", "ring", "rot2"],
  };
function classicLayout(biome) {
  return {
    key: biome.id + ":classic",
    W: biome.W,
    H: biome.H,
    obstacles: biome.obstacles.map((ob) => ({ ...ob })),
    deco: 0,
    template: "classic",
  };
}
function mapScore(obs, W, H, template) {
  let area = 0,
    cover = 0,
    unused = 0,
    sectors = new Array(8).fill(0),
    radii = [];
  for (let ob of obs) {
    let obArea = ob.t === "c" ? Math.PI * ob.r * ob.r : 4 * ob.w * ob.h;
    area += obArea;
    let ang = Math.atan2(ob.y, ob.x);
    if (ang < 0) {
      ang += TAU;
    }
    sectors[Math.min(7, Math.floor((ang / TAU) * 8))]++;
    radii.push(Math.hypot(ob.x, ob.y));
  }
  cover = area / (4 * W * H);
  let filled = sectors.filter((count) => count > 0).length,
    gaps = 0;
  if (radii.length > 1) {
    radii.sort((a, b) => a - b);
    for (let i = 1; i < radii.length; i++) gaps += Math.abs(radii[i] - radii[i - 1]);
    gaps += Math.abs(radii[0] + Math.min(W, H) - radii[radii.length - 1]);
  }
  let balance = Math.max(0, 0.13 - Math.min(0.13, Math.max(...sectors) - Math.min(...sectors))),
    density = Math.max(0, 1 - Math.abs(cover - 0.035) / 0.035),
    spread = Math.min(1, filled / 6),
    gapScore = Math.min(1, gaps / ((radii.length + 1) * Math.max(1, Math.min(W, H))));
  return (
    density * 3.5 +
    spread * 3 +
    gapScore * 1.5 +
    (obs.length >= 5 && obs.length <= 9 ? 1 : 0) +
    balance * 1.2 +
    (template === "scatter" ? 3 : 0) -
    0.2
  );
}
// The obstacle map of a wave before the director adds its wave obstacles (see buildLayout).
function mapLayout(biome, seed, wave, boss) {
  if (boss || !obstacleShapes[biome.id]) return classicLayout(biome);
  let rng = makeRng(hashString(seed + ":map:" + wave)),
    best = null,
    bestScore = -1e9;
  for (let tries = 0; tries < 24; tries++) {
    let w = clamp(biome.W + rng.int(-1, 1), 15, 20),
      h = clamp(biome.H + rng.int(-1, 1), 15, 20),
      template = rng.chance(0.55) ? "scatter" : rng.pick(mapTemplates[biome.id].filter((name) => name !== "scatter")),
      obs = placeObstacles(rng, biome.id, template, w, h);
    if (obs.length < 4 || !isConnected(obs, w, h)) continue;
    let score = mapScore(obs, w, h, template);
    if (score > bestScore) {
      bestScore = score;
      best = { W: w, H: h, obstacles: obs, template };
    }
  }
  if (!best) return classicLayout(biome);
  return {
    key: `${biome.id}:${seed}:${wave}`,
    W: best.W,
    H: best.H,
    obstacles: best.obstacles,
    deco: 1 + rng.int(0, 3),
    template: best.template,
    features: placeFeatures(rng, biome.id, best.obstacles, best.W, best.H),
  };
}
function buildLayout(biome, seed, wave, boss) {
  // 2.1: the wave director adds wave obstacles and hazards to the map
  const layout = rlAddWaveObstacles(mapLayout(biome, seed, wave, boss), biome, seed, wave, boss);
  // 2.4.6: the Crucible's arena in Ember Works keeps three lava vents (boss arenas are open and had
  // no hazard at all). Its Eruption and Stoke attacks make nearby vents burst; the vents themselves
  // keep their normal cycle. Other biomes' boss arenas stay as they are.
  if (!boss || biome.id !== "works") return layout;
  const rng = makeRng(hashString(seed + ":crucible-vents:" + wave)),
    features = { vents: [], ice: [], portals: [], acid: [] };
  for (let k = 0; k < 12 && features.vents.length < 3; k++) {
    const spot = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 1.2, RL_HAZARD_SIZE.vents);
    if (spot) {
      features.vents.push({ ...spot, phase: rng.next() * 6, period: 3.2 + rng.next() * 1.2, st: "idle" });
    }
  }
  return { ...layout, key: `${layout.key}:crucible:${seed}:${wave}`, features };
}
// 2.4.6: `size` sets the radius range; hazards are bigger than portals (see RL_HAZARD_SIZE)
// 2.4.6: bigger hazards so they shape the fight (they were 0.7–1.0 wide per extra wave hazard):
// radius ranges of the hazards a wave adds; the fixed layout hazards grew by the same share.
// Since 2.5.0 the waves use RL_HAZARD_SIZE_250; only the Crucible's vents still use these.
const RL_HAZARD_SIZE = { vents: [1.3, 1.7], ice: [2.1, 2.9], acid: [1.7, 2.3] };
function rlFeaturePoint(rng, obs, W, H, features, extraR = 0.75, size = [0.72, 1]) {
  const taken = [];
  for (const kind of ["vents", "ice", "acid"])
    for (const hz of features[kind] || []) taken.push({ x: hz.x, y: hz.y, r: (hz.r || 0.8) + extraR });
  for (const portal of features.portals || []) {
    taken.push({ x: portal.ax, y: portal.ay, r: 1 + extraR });
    taken.push({ x: portal.bx, y: portal.by, r: 1 + extraR });
  }
  for (let tries = 0; tries < 80; tries++) {
    const angle = rng.next() * TAU,
      dist = rng.range(6.5, 9.6),
      x = spawnZone.x + Math.cos(angle) * dist,
      y = spawnZone.y + Math.sin(angle) * dist,
      rad = size[0] + rng.next() * (size[1] - size[0]);
    if (
      Math.abs(x) > W - 2.7 - rad ||
      Math.abs(y) > H - 2.7 - rad ||
      Math.hypot(x - spawnZone.x, y - spawnZone.y) < 6.2
    )
      continue;
    if (hitsObstacle(obs, x, y, rad + 0.9)) continue;
    if (taken.some((spot) => Math.hypot(x - spot.x, y - spot.y) < rad + spot.r + 1)) continue;
    return { x, y, r: rad };
  }
  return null;
}
function rlAddDynamicFeatures(layout, biome, seed, wave, boss, mode = "standard") {
  const theme = RL_BIOME_HAZARD[biome.id] ?? "";
  const features = {
    vents: [...(layout.features?.vents || [])],
    ice: [...(layout.features?.ice || [])],
    portals: [...(layout.features?.portals || [])],
    acid: [...(layout.features?.acid || [])],
  };
  if (boss) return features;
  // 2.5.0 C: a biome with a vents/ice/acid theme gets about five hazards per wave (one more in the
  // heavy wave modes) placed by rlAddHazard250. This replaced the 2.1–2.4 rules (two per wave, 2.4.0,
  // plus the extra hazards of some wave modes), which only ever applied to these themes.
  if (theme === "vents" || theme === "ice" || theme === "acid") {
    const rng = makeRng(hashString(seed + ":director-features-v250:" + wave + ":" + mode));
    const target = Math.min(
      RL_HAZARD_CAP_250,
      features[theme].length + RL_HAZARD_COUNT_250 + (RL_HAZARD_HEAVY_MODES_250.has(mode) ? 1 : 0),
    );
    for (let k = 0; k < target * 2 && features[theme].length < target; k++)
      rlAddHazard250(features, theme, rng, layout.obstacles, layout.W, layout.H);
    return features;
  }
  if (theme === "portals") {
    // 2.1: a portal biome without portals gets one pair
    const rng = makeRng(hashString(seed + ":director-features-v21:" + wave + ":" + mode));
    for (let k = 0; k < 6 && !features.portals.length; k++) {
      const pa = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 0.1),
        pb = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 0.1);
      if (pa && pb && Math.hypot(pa.x - pb.x, pa.y - pb.y) >= 7.2)
        features.portals.push({ ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y });
    }
    // 2.5.0 C: and most waves a second pair
    const rng250 = makeRng(hashString(seed + ":director-features-v250:" + wave + ":" + mode));
    if (features.portals.length < 2 && rng250.chance(0.8)) {
      const pair = rlPortalPair250(rng250, layout.obstacles, layout.W, layout.H, features);
      if (pair) {
        features.portals.push(pair);
      }
    }
  }
  return features;
}
function rlAddWaveObstacles(layout, biome, seed, wave, boss) {
  const modePool = [
    "barricade",
    "crossfire",
    "cache-run",
    "riftwalk",
    "gauntlet",
    "shatter",
    "deadzone",
    "minefield",
    "zigzag",
    "salvage",
    "turbulence",
    "fortress",
  ];
  if (boss) {
    layout.director = {
      mode: "boss",
      intensity: Math.min(8, 2 + Math.floor(wave / 25)),
      obstacles: 0,
      features: Object.fromEntries(Object.entries(layout.features || {}).map(([k, v]) => [k, v.length])),
    };
    return layout;
  }
  const mode = modePool[(wave + hashString(seed + ":" + biome.id + ":director-mode")) % modePool.length];
  const rng = makeRng(hashString(seed + ":director-obstacles-v21:" + wave + ":" + mode)),
    obs = layout.obstacles.map((ob) => ({ ...ob })),
    baseCount = obs.length;
  const protectedPoints = [];
  for (const kind of ["vents", "ice", "acid"]) {
    for (const hz of layout.features?.[kind] || []) protectedPoints.push({ x: hz.x, y: hz.y, r: (hz.r || 0.8) + 0.9 });
  }

  for (const portal of layout.features?.portals || []) {
    protectedPoints.push({ x: portal.ax, y: portal.ay, r: 2.3 });
    protectedPoints.push({ x: portal.bx, y: portal.by, r: 2.3 });
  }
  const featureOverlap = (cand) =>
    protectedPoints.some(
      (spot) =>
        Math.hypot(cand.x - spot.x, cand.y - spot.y) < (cand.t === "c" ? cand.r : Math.hypot(cand.w, cand.h)) + spot.r,
    );
  const target = Math.min(
    10,
    1 +
      Math.floor(wave / 3) +
      (mode === "gauntlet" ? 2 : 0) +
      (mode === "shatter" ? 1 : 0) +
      (mode === "fortress" ? 1 : 0),
  );
  for (let k = 0; k < target; k++) {
    let placed = null;
    for (let tries = 0; tries < 70 && !placed; tries++) {
      const angle = rng.next() * TAU,
        dist = rng.range(6.2, Math.min(10.8, Math.min(layout.W, layout.H) - 4.2)),
        x = spawnZone.x + Math.cos(angle) * dist,
        y = spawnZone.y + Math.sin(angle) * dist;
      let cand;
      if (mode === "barricade" || mode === "gauntlet")
        cand = { t: "b", x, y, w: rng.range(0.65, 1.45), h: rng.range(2.0, 4.0) };
      else if (mode === "crossfire")
        cand = rng.chance(0.5)
          ? { t: "b", x, y, w: rng.range(0.7, 1.1), h: rng.range(1.7, 2.8) }
          : { t: "b", x, y, w: rng.range(1.7, 2.8), h: rng.range(0.7, 1.1) };
      else if (mode === "shatter" || mode === "minefield")
        cand = { t: "c", x, y, r: rng.range(mode === "minefield" ? 0.42 : 0.48, mode === "minefield" ? 0.82 : 0.95) };
      else if (mode === "deadzone") cand = { t: "c", x, y, r: rng.range(0.7, 1.15) };
      else if (mode === "zigzag" || mode === "turbulence")
        cand =
          k % 2 === 0
            ? { t: "b", x, y, w: rng.range(0.58, 0.9), h: rng.range(1.8, 3.0) }
            : { t: "b", x, y, w: rng.range(1.8, 3.0), h: rng.range(0.58, 0.9) };
      else if (mode === "fortress") cand = { t: "b", x, y, w: rng.range(1.0, 1.65), h: rng.range(0.55, 0.8) };
      else
        cand = rng.chance(0.45)
          ? { t: "c", x, y, r: rng.range(0.58, 1.0) }
          : { t: "b", x, y, w: rng.range(0.6, 1.25), h: rng.range(0.6, 1.25) };
      if (
        !canPlaceObstacle(cand, obs, layout.W, layout.H) ||
        obs.some((ob) => obstacleDistance(cand, ob) < OBSTACLE_GAP) ||
        featureOverlap(cand)
      )
        continue;
      const next = obs.concat(cand);
      if (!isConnected(next, layout.W, layout.H)) continue;
      placed = cand;
      obs.push(cand);
    }
  }
  layout.obstacles = obs.slice(0, 19);
  layout.features = rlAddDynamicFeatures(layout, biome, seed, wave, boss, mode);
  layout.key = `${layout.key}:director3:${mode}`;
  layout.deco = (layout.deco || 0) + 1;
  layout.director = {
    mode,
    intensity: clamp(1 + Math.floor(wave / 12) + (obs.length - baseCount > 3 ? 1 : 0), 1, 8),
    obstacles: Math.max(0, obs.length - baseCount),
    features: Object.fromEntries(Object.entries(layout.features).map(([k, v]) => [k, v.length])),
  };
  return layout;
}
function randomObstacle(rng, biomeId) {
  let shapes = obstacleShapes[biomeId],
    total = 0;
  for (let [weight] of shapes) total += weight;
  let roll = rng.next() * total;
  for (let [weight, make] of shapes) {
    roll -= weight;
    if (roll <= 0) return make(rng);
  }
  return shapes[0][1](rng);
}
function mirrorObstacle(sym, ob) {
  let copy = (px, py, swap) => ({ ...ob, x: px, y: py, ...(swap && ob.t === "b" ? { w: ob.h, h: ob.w } : {}) }),
    { x, y } = ob;
  switch (sym) {
    case "mirror4":
      return [copy(x, y), copy(-x, y), copy(x, -y), copy(-x, -y)];
    case "mirror2":
      return [copy(x, y), copy(-x, y)];
    case "rot2":
      return [copy(x, y), copy(-x, -y)];
    case "rot4":
      return [copy(x, y), copy(-y, x, true), copy(-x, -y), copy(y, -x, true)];
    default:
      return [copy(x, y)];
  }
}
function placeObstacles(rng, biomeId, template, W, H) {
  let placed = [],
    tryAdd = (group) => {
      if (placed.length + group.length > 12) return false;
      for (let ob of group) if (!canPlaceObstacle(ob, placed, W, H)) return false;
      for (let j = 0; j < group.length; j++)
        for (let k = j + 1; k < group.length; k++)
          if (obstacleDistance(group[j], group[k]) < OBSTACLE_GAP) return false;
      placed.push(...group);
      return true;
    },
    unused;
  if (template === "scatter") {
    let count = rng.int(5, 8),
      turn = rng.next() * TAU,
      size = Math.min(W, H);
    for (let k = 0; k < count; k++) {
      let angle = turn + (k / count) * TAU + rng.range(-0.42, 0.42),
        dist = rng.range(size * 0.43, size * 0.72),
        ob = randomObstacle(rng, biomeId);
      ob.x = Math.cos(angle) * dist;
      ob.y = Math.sin(angle) * dist;
      tryAdd([ob]);
    }
    for (let tries = 0; tries < 18 && placed.length < 4; tries++) {
      let angle = rng.next() * TAU,
        dist = rng.range(Math.min(W, H) * 0.4, Math.min(W, H) * 0.76),
        ob = randomObstacle(rng, biomeId);
      ob.x = Math.cos(angle) * dist;
      ob.y = Math.sin(angle) * dist;
      tryAdd([ob]);
    }
  } else if (template === "ring") {
    let count = rng.pick([4, 6, 8]),
      radius = Math.min(W, H) * rng.range(0.42, 0.58),
      turn = rng.next() * Math.PI,
      ob = randomObstacle(rng, biomeId);
    for (let k = 0; k < count; k++) {
      let angle = turn + (k / count) * Math.PI * 2;
      tryAdd([{ ...ob, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }]);
    }
    placeSymmetric(rng, biomeId, "mirror4", W, H, tryAdd, 2);
  } else if (template === "lanes") {
    let laneY = rng.range(6, Math.min(9.5, H - 5)),
      laneW = rng.range(3, 5.5),
      laneX = rng.range(3.2, 5.5);
    for (let sy of [-1, 1])
      for (let sx of [-1, 1]) tryAdd([{ t: "b", w: laneW / 2, h: 0.7, x: sx * (laneX + laneW / 2), y: sy * laneY }]);
    placeSymmetric(rng, biomeId, "mirror2", W, H, tryAdd, 3);
  } else placeSymmetric(rng, biomeId, template, W, H, tryAdd, rng.int(2, 4));
  return placed;
}
function placeSymmetric(rng, biomeId, sym, W, H, tryAdd, count) {
  for (let k = 0; k < count; k++)
    for (let tries = 0; tries < 14; tries++) {
      let ob = randomObstacle(rng, biomeId);
      ob.x = rng.range(sym === "rot2" ? -W + 2 : 1.5, W - 2);
      ob.y = rng.range(sym === "mirror4" ? 1.5 : -H + 2, H - 2);
      if (tryAdd(mirrorObstacle(sym, ob))) break;
    }
}
function halfSize(ob) {
  return ob.t === "c" ? { hx: ob.r, hy: ob.r } : { hx: ob.w, hy: ob.h };
}
function obstacleDistance(a, b) {
  if (a.t === "c" && b.t === "c") return Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
  if (a.t === "c" || b.t === "c") {
    let circle = a.t === "c" ? a : b,
      box = a.t === "c" ? b : a,
      gapX = Math.max(0, Math.abs(circle.x - box.x) - box.w),
      gapY = Math.max(0, Math.abs(circle.y - box.y) - box.h);
    return Math.max(0, Math.hypot(gapX, gapY) - circle.r);
  }
  let gapX = Math.max(0, Math.abs(a.x - b.x) - a.w - b.w),
    gapY = Math.max(0, Math.abs(a.y - b.y) - a.h - b.h);
  return Math.hypot(gapX, gapY);
}
function canPlaceObstacle(ob, obs, W, H) {
  let { hx, hy } = halfSize(ob);
  if (Math.abs(ob.x) + hx > W - OBSTACLE_GAP || Math.abs(ob.y) + hy > H - OBSTACLE_GAP) return false;
  let gapX = Math.max(0, Math.abs(ob.x - spawnZone.x) - hx),
    gapY = Math.max(0, Math.abs(ob.y - spawnZone.y) - hy),
    minGap = Math.max(5.4, spawnZone.r + Math.max(hx, hy) + 3.8);
  if (Math.hypot(gapX, gapY) < minGap) return false;
  for (let other of obs) if (obstacleDistance(ob, other) < OBSTACLE_GAP) return false;
  return true;
}
function hitsObstacle(obs, x, y, pad) {
  for (let ob of obs)
    if (ob.t === "c") {
      if (Math.hypot(x - ob.x, y - ob.y) < ob.r + pad) return true;
    } else if (Math.abs(x - ob.x) < ob.w + pad && Math.abs(y - ob.y) < ob.h + pad) return true;
  return false;
}
function isConnected(obs, W, H) {
  let area = 0;
  for (let ob of obs) area += ob.t === "c" ? Math.PI * ob.r * ob.r : 4 * ob.w * ob.h;
  if (area > 4 * W * H * 0.13) return false;
  let cell = 0.5,
    cols = Math.ceil((2 * W) / cell),
    rows = Math.ceil((2 * H) / cell),
    pad = 1.1,
    open = new Uint8Array(cols * rows),
    openCount = 0;
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      let px = -W + (col + 0.5) * cell,
        py = -H + (row + 0.5) * cell;
      if (!(Math.abs(px) > W - pad || Math.abs(py) > H - pad || hitsObstacle(obs, px, py, pad))) {
        open[row * cols + col] = 1;
        openCount++;
      }
    }
  let start = Math.floor((spawnZone.y + H) / cell) * cols + Math.floor((spawnZone.x + W) / cell);
  if (!open[start]) return false;
  let seen = new Uint8Array(cols * rows),
    stack = [start];
  seen[start] = 1;
  let reached = 0;
  for (; stack.length; ) {
    let idx = stack.pop();
    reached++;
    let col = idx % cols,
      row = (idx / cols) | 0;
    for (let [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let nc = col + dc,
        nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      let next = nr * cols + nc;
      if (open[next] && !seen[next]) {
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return reached >= openCount * 0.995;
}
function placeFeatures(rng, biomeId, obs, W, H) {
  let features = { vents: [], ice: [], portals: [], acid: [] },
    path = (x0, y0, x1, y1, minClear = 0.5) => {
      let clear = Math.max(minClear, spawnZone.r + 0.12),
        dx = x1 - x0,
        dy = y1 - y0,
        len2 = dx * dx + dy * dy;
      if (Math.abs(x0) > W - 2.7 || Math.abs(y0) > H - 2.7 || Math.abs(x1) > W - 2.7 || Math.abs(y1) > H - 2.7)
        return false;
      for (let ob of obs)
        if (ob.t === "c") {
          let along = len2 ? clamp(((ob.x - x0) * dx + (ob.y - y0) * dy) / len2, 0, 1) : 0,
            px = x0 + dx * along,
            py = y0 + dy * along;
          if ((px - ob.x) * (px - ob.x) + (py - ob.y) * (py - ob.y) < (ob.r + clear) * (ob.r + clear)) return false;
        } else {
          let minX = ob.x - ob.w - clear,
            maxX = ob.x + ob.w + clear,
            minY = ob.y - ob.h - clear,
            maxY = ob.y + ob.h + clear,
            t0 = 0,
            t1 = 1;
          if (Math.abs(dx) < 1e-9) {
            if (x0 < minX || x0 > maxX) continue;
          } else {
            let ta = (minX - x0) / dx,
              tb = (maxX - x0) / dx;
            if (ta > tb) {
              [ta, tb] = [tb, ta];
            }
            t0 = Math.max(t0, ta);
            t1 = Math.min(t1, tb);
            if (t0 > t1) continue;
          }
          if (Math.abs(dy) < 1e-9) {
            if (y0 < minY || y0 > maxY) continue;
          } else {
            let ta = (minY - y0) / dy,
              tb = (maxY - y0) / dy;
            if (ta > tb) {
              [ta, tb] = [tb, ta];
            }
            t0 = Math.max(t0, ta);
            t1 = Math.min(t1, tb);
            if (t0 > t1) continue;
          }
          if (t0 <= t1 && t1 >= 0 && t0 <= 1) return false;
        }
      return true;
    },
    findSpot = (rad, obsPad, list, gap, opt = {}) => {
      let best = null,
        bestScore = -1e9,
        wallPad = Math.max(3.6, rad + 2.7),
        spawnPad = Math.max(5.6, spawnZone.r + rad + 4.1),
        room = Math.max(0.1, Math.min(W, H) - wallPad),
        reach = Math.min(10.5, Math.hypot(Math.max(0, W - wallPad), Math.max(0, H - wallPad))),
        maxR = Math.min(opt.maxRadius ?? 9.2, Math.max(spawnPad + 1, reach * 0.72)),
        minR = Math.min(opt.minRadius ?? 7.1, maxR - 1);
      for (let tries = 0; tries < 96; tries++) {
        let px, py;
        if (opt.anchor) {
          let angle = rng.next() * TAU,
            dist = rng.range(opt.minDist ?? 6, opt.maxDist ?? 9);
          px = opt.anchor.x + Math.cos(angle) * dist;
          py = opt.anchor.y + Math.sin(angle) * dist;
        } else {
          let angle =
              opt.angleCenter != null
                ? opt.angleCenter + rng.range(-(opt.angleSpan ?? 0.5), opt.angleSpan ?? 0.5)
                : rng.next() * TAU,
            dist = rng.range(opt.minRadius ?? minR, opt.maxRadius ?? maxR);
          px = spawnZone.x + Math.cos(angle) * dist;
          py = spawnZone.y + Math.sin(angle) * dist;
        }
        if (
          Math.abs(px) > W - wallPad ||
          Math.abs(py) > H - wallPad ||
          Math.hypot(px - spawnZone.x, py - spawnZone.y) < spawnPad ||
          !path(opt.pathFrom?.x ?? px, opt.pathFrom?.y ?? py, px, py, opt.pathFrom?.x != null ? 0.45 : 0.5) ||
          hitsObstacle(obs, px, py, rad + obsPad)
        )
          continue;
        let free = true,
          nearest = 999;
        for (let other of list) {
          let dist = Math.hypot(other.x - px, other.y - py),
            clearance = dist - (other.r || 0) - rad;
          nearest = Math.min(nearest, clearance);
          if (dist < (other.r || 0) + rad + gap) {
            free = false;
            break;
          }
        }
        if (!free || (opt.farFrom && Math.hypot(px - opt.farFrom.x, py - opt.farFrom.y) < (opt.farMin || 0))) continue;
        let wallRoom = Math.min(W - Math.abs(px), H - Math.abs(py)),
          spawnDist = Math.hypot(px - spawnZone.x, py - spawnZone.y),
          clearance = Math.min(nearest, 8),
          radiusOff =
            opt.preferRadius != null
              ? Math.abs(spawnDist - opt.preferRadius)
              : Math.abs(spawnDist - (minR + maxR) * 0.5),
          minAngle = 999;
        for (let other of list) {
          let angA = Math.atan2(other.y - spawnZone.y, other.x - spawnZone.x),
            angB = Math.atan2(py - spawnZone.y, px - spawnZone.x);
          minAngle = Math.min(minAngle, Math.abs(angleDiff(angA, angB)));
        }
        let score = wallRoom * 1.35 + clearance * 0.75 - minAngle * 0.85 - radiusOff * 1.15 + rng.next() * 1.1;
        if (score > bestScore) {
          bestScore = score;
          best = { x: px, y: py };
        }
      }
      return best;
    };
  if (biomeId === "works") {
    let count = rng.int(3, 5),
      period = rng.range(6.5, 8);
    for (let k = 0; k < count; k++) {
      let rad = rng.range(1.5, 2), // 2.4.6: was 1.1–1.5
        spot = findSpot(rad, 0.6, features.vents, 3, { minRadius: 6.5, maxRadius: 9.2, preferRadius: 7.8 });
      if (spot) {
        features.vents.push({ x: spot.x, y: spot.y, r: rad, period, phase: (k / count) * period + rng.range(0, 0.8) });
      }
    }
  } else if (biomeId === "vault") {
    let count = rng.int(3, 5);
    for (let k = 0; k < count; k++) {
      let rad = rng.range(3, 4.4), // 2.4.6: was 2.2–3.4
        spot = findSpot(rad, 0.45, features.ice, 1.5, { minRadius: 6, maxRadius: 8.8, preferRadius: 7.2 });
      if (spot) {
        features.ice.push({ x: spot.x, y: spot.y, r: rad });
      }
    }
  } else if (biomeId === "marsh") {
    let count = rng.int(3, 4);
    for (let k = 0; k < count; k++) {
      let rad = rng.range(2.4, 3.5), // 2.4.6: was 1.8–2.8
        spot = findSpot(rad, 0.55, features.acid, 1.8, { minRadius: 5.8, maxRadius: 8.8, preferRadius: 7 });
      if (spot) {
        features.acid.push({ x: spot.x, y: spot.y, r: rad });
      }
    }
  } else if (biomeId === "void") {
    let pairs = rng.chance(0.4) ? 2 : 1,
      used = [];
    const portalGap = 4.2,
      clearPoint = (pt) =>
        Math.abs(pt.x) <= W - 3.6 &&
        Math.abs(pt.y) <= H - 3.6 &&
        !hitsObstacle(obs, pt.x, pt.y, 2.3) &&
        Math.hypot(pt.x - spawnZone.x, pt.y - spawnZone.y) > 7.1 &&
        used.every((other) => Math.hypot(pt.x - other.x, pt.y - other.y) >= portalGap);
    for (let pair = 0; pair < pairs; pair++) {
      let endA = null;
      for (let tries = 0; tries < 96 && !endA; tries++) {
        let dist = rng.range(7.8, 9.8),
          angle = rng.next() * TAU,
          cand = { x: spawnZone.x + Math.cos(angle) * dist, y: spawnZone.y + Math.sin(angle) * dist };
        if (clearPoint(cand)) {
          endA = cand;
        }
      }
      if (!endA) continue;
      let endB = null,
        back = Math.atan2(endA.y - spawnZone.y, endA.x - spawnZone.x) + Math.PI;
      for (let tries = 0; tries < 96 && !endB; tries++) {
        let dist = rng.range(7.8, 9.8),
          angle = back + rng.range(-0.55, 0.55),
          cand = { x: spawnZone.x + Math.cos(angle) * dist, y: spawnZone.y + Math.sin(angle) * dist };
        if (clearPoint(cand) && Math.hypot(cand.x - endA.x, cand.y - endA.y) > Math.max(W, H) * 0.78) {
          endB = cand;
        }
      }
      if (!endB) continue;
      features.portals.push({ ax: endA.x, ay: endA.y, bx: endB.x, by: endB.y, hue: pair });
      used.push(endA, endB);
    }
  }
  return features;
}

export { mapTemplates, hitsObstacle, obstacleShapes, Arena, buildLayout, isConnected, SpatialHash };

// ---- 2.5.0 C: stronger biomes. A hazard wave now has about five hazards (was ~3.3), each about
// 25–30% bigger than the 2.4.6 sizes, and Void Core has two portal pairs in most waves (was 40%).
// Hazards keep a clear ring around the spawn (their edge stays 5.2 from it, before it could come
// within ~3.3), stay 0.95 off every obstacle and leave a lane of 1.3 between each other.
// The same helpers place the extra hazards of the biome events (see World in world.js).
// 3.6.0: acid pools a little smaller (2.2–3.0 before): several of them covered most of the Toxin Marsh floor
const RL_HAZARD_SIZE_250 = { vents: [1.7, 2.2], ice: [2.7, 3.7], acid: [1.9, 2.6] },
  RL_HAZARD_COUNT_250 = 5,
  RL_HAZARD_CAP_250 = 9,
  // wave modes that used to add extra hazards keep one more
  RL_HAZARD_HEAVY_MODES_250 = new Set(["crossfire", "turbulence", "minefield", "deadzone", "shatter"]);
// Obstacle clearance and lane width between hazards
const RL_HAZARD_OBS_GAP_250 = 0.95,
  RL_HAZARD_LANE_250 = 1.3,
  RL_HAZARD_SPAWN_GAP_250 = 0.6;
function rlHazardTaken250(features) {
  const taken = [];
  for (const k of ["vents", "ice", "acid"])
    for (const hz of features[k] || []) taken.push({ x: hz.x, y: hz.y, r: hz.r || 0.8 });
  for (const portal of features.portals || []) {
    taken.push({ x: portal.ax, y: portal.ay, r: 1.4 });
    taken.push({ x: portal.bx, y: portal.by, r: 1.4 });
  }
  return taken;
}
// A free spot for a hazard of radius size[0]..size[1] (or opt.r): clear of the spawn ring, the
// walls, every obstacle and the other hazards; opt.avoid adds circles to keep off (the player,
// spawn markers …). Returns {x, y, r} or null.
function rlHazardPoint250(rng, obs, W, H, features, size, opt = {}) {
  const taken = rlHazardTaken250(features),
    avoid = opt.avoid || [];
  for (let tries = 0; tries < (opt.tries || 140); tries++) {
    const rad = opt.r || size[0] + rng.next() * (size[1] - size[0]),
      angle = rng.next() * TAU,
      lo = spawnZone.r + rad + RL_HAZARD_SPAWN_GAP_250,
      dist = rng.range(lo, lo + 7.5),
      x = spawnZone.x + Math.cos(angle) * dist,
      y = spawnZone.y + Math.sin(angle) * dist;
    if (Math.abs(x) > W - 2.6 - rad || Math.abs(y) > H - 2.6 - rad) continue;
    if (hitsObstacle(obs, x, y, rad + RL_HAZARD_OBS_GAP_250)) continue;
    if (taken.some((spot) => Math.hypot(x - spot.x, y - spot.y) < rad + spot.r + RL_HAZARD_LANE_250)) continue;
    if (avoid.some((spot) => Math.hypot(x - spot.x, y - spot.y) < rad + spot.r)) continue;
    return { x, y, r: rad };
  }
  return null;
}
// Adds one hazard of `kind` to `features` (a feature set or an Arena, both have vents/ice/acid/
// portals); `obs`, `W`, `H` describe the arena. Returns the new hazard or null.
function rlAddHazard250(features, kind, rng, obs, W, H, opt = {}) {
  if (!features[kind] || features[kind].length >= (opt.cap || RL_HAZARD_CAP_250)) return null;
  const spot = rlHazardPoint250(rng, obs, W, H, features, opt.size || RL_HAZARD_SIZE_250[kind], opt);
  if (!spot) return null;
  const hazard =
    kind === "vents"
      ? { ...spot, phase: rng.next() * 6, period: 2.8 + rng.next() * 1.6, st: "idle" }
      : kind === "acid"
        ? { ...spot, life: null }
        : { ...spot };
  features[kind].push(hazard);
  return hazard;
}
// One more portal pair: both ends 7.1+ from the spawn, 2.3 off obstacles, inside the safe bounds,
// 4.4 from every other portal end and 7.4 apart (the diagnostics ask for 7.0 and 4.0).
function rlPortalPair250(rng, obs, W, H, features, opt = {}) {
  const used = [];
  for (const portal of features.portals || [])
    used.push({ x: portal.ax, y: portal.ay }, { x: portal.bx, y: portal.by });
  const avoid = opt.avoid || [],
    ok = (pt) =>
      Math.abs(pt.x) <= W - 3.6 &&
      Math.abs(pt.y) <= H - 3.6 &&
      !hitsObstacle(obs, pt.x, pt.y, 2.3) &&
      Math.hypot(pt.x - spawnZone.x, pt.y - spawnZone.y) > 7.1 &&
      used.every((spot) => Math.hypot(pt.x - spot.x, pt.y - spot.y) >= 4.4) &&
      avoid.every((spot) => Math.hypot(pt.x - spot.x, pt.y - spot.y) >= spot.r);
  let endA = null;
  for (let k = 0; k < 96 && !endA; k++) {
    const dist = rng.range(7.4, 10.5),
      angle = rng.next() * TAU,
      cand = { x: spawnZone.x + Math.cos(angle) * dist, y: spawnZone.y + Math.sin(angle) * dist };
    if (ok(cand)) {
      endA = cand;
    }
  }
  if (!endA) return null;
  const back = Math.atan2(endA.y - spawnZone.y, endA.x - spawnZone.x) + Math.PI;
  for (let k = 0; k < 96; k++) {
    const dist = rng.range(7.4, 10.5),
      angle = back + rng.range(-0.9, 0.9),
      endB = { x: spawnZone.x + Math.cos(angle) * dist, y: spawnZone.y + Math.sin(angle) * dist };
    if (ok(endB) && Math.hypot(endB.x - endA.x, endB.y - endA.y) >= Math.max(7.4, Math.max(W, H) * 0.6))
      return { ax: endA.x, ay: endA.y, bx: endB.x, by: endB.y, hue: (features.portals || []).length };
  }
  return null;
}
// The largest radius a hazard at (hazard.x, hazard.y) can grow to: 0.8 off obstacles (the diagnostics
// rule), off the walls and clear of the spawn ring. Used by Spore Bloom.
function rlHazardRoom250(arena, hazard, want) {
  let rad = Math.min(
    want,
    arena.W - 1.6 - Math.abs(hazard.x),
    arena.H - 1.6 - Math.abs(hazard.y),
    Math.hypot(hazard.x - spawnZone.x, hazard.y - spawnZone.y) - spawnZone.r,
  );
  while (rad > hazard.r && hitsObstacle(arena.obs, hazard.x, hazard.y, rad + 0.85)) rad -= 0.05;
  return Math.max(hazard.r, rad);
}
export { rlAddHazard250, rlPortalPair250, rlHazardRoom250, RL_HAZARD_SIZE_250, spawnZone as rlSpawnZone };
