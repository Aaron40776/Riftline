// Arena layouts: obstacles, hazards (vents, ice, acid, portals), wave obstacles, flow field and
// spatial hash.

import { clamp, TAU, hashString, angleDiff, makeRng } from "./util.js";
import { RL_BIOME_HAZARD } from "../data/biomes.js";

var Arena = class {
  constructor(t, e) {
    this.biome = t;
    let n = e || { key: t.id + ":classic", W: t.W, H: t.H, obstacles: t.obstacles, deco: 0 };
    ((this.key = n.key),
      (this.director = n.director || null),
      (this.deco = n.deco || 0),
      (this.template = n.template || "classic"),
      (this.W = n.W),
      (this.H = n.H),
      (this.obs = n.obstacles.map((r) => ({ ...r }))));
    let s = n.features || {};
    ((this.vents = (s.vents || []).map((r) => ({ ...r }))),
      (this.ice = (s.ice || []).map((r) => ({ ...r }))),
      (this.portals = (s.portals || []).map((r) => ({ ...r }))),
      (this.acid = (s.acid || []).map((r) => ({ ...r }))),
      (this.flow = new FlowField(this)));
  }
  ventState(t, e) {
    let n = (e + t.phase) % t.period,
      s = t.period - 1.5,
      r = s - 1.2;
    return n >= s ? "erupt" : n >= r ? "warn" : "idle";
  }
  inAcid(t, e) {
    for (let n of this.acid) {
      let s = t - n.x,
        r = e - n.y;
      if (s * s + r * r < n.r * n.r) return !0;
    }
    return !1;
  }
  onIce(t, e) {
    for (let n of this.ice) {
      let s = t - n.x,
        r = e - n.y;
      if (s * s + r * r < n.r * n.r) return !0;
    }
    return !1;
  }
  blocked(t, e, n = 0) {
    for (let s of this.obs)
      if (s.t === "c") {
        let r = t - s.x,
          a = e - s.y,
          o = s.r + n;
        if (r * r + a * a < o * o) return !0;
      } else if (Math.abs(t - s.x) < s.w + n && Math.abs(e - s.y) < s.h + n) return !0;
    return !1;
  }
  outside(t, e, n = 0) {
    return t < -this.W + n || t > this.W - n || e < -this.H + n || e > this.H - n;
  }
  resolve(t, e) {
    let n = !1;
    for (let a of this.obs)
      if (a.t === "c") {
        let o = t.x - a.x,
          c = t.y - a.y,
          h = a.r + e,
          l = o * o + c * c;
        if (l < h * h) {
          if (l < 1e-10) {
            ((t.x = a.x + h), (n = !0));
            continue;
          }
          let u = Math.sqrt(l);
          ((t.x = a.x + (o / u) * h), (t.y = a.y + (c / u) * h), (n = !0));
        }
      } else {
        let o = clamp(t.x, a.x - a.w, a.x + a.w),
          c = clamp(t.y, a.y - a.h, a.y + a.h),
          h = t.x - o,
          l = t.y - c,
          u = h * h + l * l;
        if (u < e * e) {
          if (u > 1e-8) {
            let d = Math.sqrt(u);
            ((t.x = o + (h / d) * e), (t.y = c + (l / d) * e));
          } else {
            let d = a.w + e - Math.abs(t.x - a.x),
              f = a.h + e - Math.abs(t.y - a.y);
            d < f
              ? (t.x = a.x + Math.sign(t.x - a.x || 1) * (a.w + e))
              : (t.y = a.y + Math.sign(t.y - a.y || 1) * (a.h + e));
          }
          n = !0;
        }
      }
    let s = this.W - e,
      r = this.H - e;
    return (
      t.x < -s ? ((t.x = -s), (n = !0)) : t.x > s && ((t.x = s), (n = !0)),
      t.y < -r ? ((t.y = -r), (n = !0)) : t.y > r && ((t.y = r), (n = !0)),
      n
    );
  }
  los(t, e, n, s, r = 0) {
    for (let a of this.obs)
      if (a.t === "c") {
        let o = a.r + r,
          c = n - t,
          h = s - e,
          l = c * c + h * h,
          u = l > 0 ? ((a.x - t) * c + (a.y - e) * h) / l : 0;
        u = clamp(u, 0, 1);
        let d = t + c * u - a.x,
          f = e + h * u - a.y;
        if (d * d + f * f < o * o) return !1;
      } else if (segmentHitsBox(t, e, n, s, a.x - a.w - r, a.y - a.h - r, a.x + a.w + r, a.y + a.h + r)) return !1;
    return !0;
  }
  rayLen(t, e, n, s) {
    let r = Math.cos(n),
      a = Math.sin(n);
    for (let o = 0.8; o < s; o += 0.35) {
      let c = t + r * o,
        h = e + a * o;
      if (this.outside(c, h) || this.blocked(c, h, 0)) return o;
    }
    return s;
  }
  featureBlocked(t, e, n = 0.35) {
    let s = (r, a, o, c = 0.55) => {
      let h = t - r,
        l = e - a,
        u = o + c + n;
      return h * h + l * l < u * u;
    };
    for (let r of this.vents) if (s(r.x, r.y, r.r, 0.7)) return !0;
    for (let r of this.ice) if (s(r.x, r.y, r.r, 0.45)) return !0;
    for (let r of this.acid) if (s(r.x, r.y, r.r, 0.55)) return !0;
    for (let r of this.portals) if (s(r.ax, r.ay, 1, 0.45) || s(r.bx, r.by, 1, 0.45)) return !0;
    return !1;
  }
  freePoint(t, e, n, s, r = 1) {
    let a = null,
      o = -1e9,
      f = null,
      p = -1;
    for (let c = 0; c < 72; c++) {
      let h = t.range(-this.W + 1.5, this.W - 1.5),
        l = t.range(-this.H + 1.5, this.H - 1.5);
      if (this.blocked(h, l, r + 0.4) || this.featureBlocked(h, l, r * 0.3)) continue;
      let u = h - e,
        d = l - n,
        g = u * u + d * d,
        x = Math.sqrt(g);
      x > p && ((p = x), (f = { x: h, y: l }));
      if (g < s * s) continue;
      let m = Math.min(this.W - Math.abs(h), this.H - Math.abs(l)),
        v = x + Math.min(5, m) * 0.35 + t.next() * 0.7;
      v > o && ((o = v), (a = { x: h, y: l }));
    }
    if (a) return a;
    for (let c of [
      [0, -this.H + 2],
      [0, this.H - 2],
      [-this.W + 2, 0],
      [this.W - 2, 0],
      [-this.W + 2, -this.H + 2],
      [this.W - 2, -this.H + 2],
      [-this.W + 2, this.H - 2],
      [this.W - 2, this.H - 2],
    ]) {
      if (this.blocked(c[0], c[1], r + 0.4) || this.featureBlocked(c[0], c[1], r * 0.3)) continue;
      let h = Math.hypot(c[0] - e, c[1] - n);
      if (h >= s) return { x: c[0], y: c[1] };
      h > p && ((p = h), (f = { x: c[0], y: c[1] }));
    }
    if (f) return f;
    const h = e > 0 ? -this.W + 2 : this.W - 2,
      l = n > 0 ? -this.H + 2 : this.H - 2;
    return this.blocked(h, l, r + 0.1) || this.featureBlocked(h, l, r * 0.1) ? { x: 0, y: 0 } : { x: h, y: l };
  }
};
function segmentHitsBox(i, t, e, n, s, r, a, o) {
  let c = 0,
    h = 1,
    l = e - i,
    u = n - t,
    d = [-l, l, -u, u],
    f = [i - s, a - i, t - r, o - t];
  for (let p = 0; p < 4; p++) {
    if (d[p] === 0) {
      if (f[p] < 0) return !1;
      continue;
    }
    let x = f[p] / d[p];
    if (d[p] < 0) {
      if (x > h) return !1;
      x > c && (c = x);
    } else {
      if (x < c) return !1;
      x < h && (h = x);
    }
  }
  return !0;
}
var SpatialHash = class {
    constructor(t, e, n = 2.5) {
      ((this.cell = n),
        (this.ox = -t - 2),
        (this.oy = -e - 2),
        (this.cols = Math.ceil((2 * t + 4) / n)),
        (this.rows = Math.ceil((2 * e + 4) / n)));
      let s = this.cols * this.rows;
      ((this.start = new Int32Array(s + 1)),
        (this.count = new Int32Array(s)),
        (this.items = []),
        (this.cellOf = new Int32Array(0)),
        (this.list = null),
        (this.maxR = 1));
    }
    _cell(t, e) {
      let n = clamp(Math.floor((t - this.ox) / this.cell), 0, this.cols - 1);
      return clamp(Math.floor((e - this.oy) / this.cell), 0, this.rows - 1) * this.cols + n;
    }
    build(t) {
      this.list = t;
      let e = t.length;
      (this.cellOf.length < e && (this.cellOf = new Int32Array(Math.max(e, this.cellOf.length * 2, 64))),
        this.count.fill(0));
      let n = 0.5;
      for (let a = 0; a < e; a++) {
        let o = t[a],
          c = this._cell(o.x, o.y);
        ((this.cellOf[a] = c), this.count[c]++, o.r > n && (n = o.r));
      }
      this.maxR = n;
      let s = 0;
      for (let a = 0; a < this.count.length; a++) ((this.start[a] = s), (s += this.count[a]));
      this.start[this.count.length] = s;
      let r = this.count;
      (r.fill(0), (this.items.length = e));
      for (let a = 0; a < e; a++) {
        let o = this.cellOf[a];
        this.items[this.start[o] + r[o]++] = t[a];
      }
    }
    query(t, e, n, s) {
      let r = n + this.maxR,
        a = clamp(Math.floor((t - r - this.ox) / this.cell), 0, this.cols - 1),
        o = clamp(Math.floor((t + r - this.ox) / this.cell), 0, this.cols - 1),
        c = clamp(Math.floor((e - r - this.oy) / this.cell), 0, this.rows - 1),
        h = clamp(Math.floor((e + r - this.oy) / this.cell), 0, this.rows - 1);
      for (let l = c; l <= h; l++)
        for (let u = a; u <= o; u++) {
          let d = l * this.cols + u;
          for (let f = this.start[d], p = this.start[d + 1]; f < p; f++) if (s(this.items[f])) return;
        }
    }
  },
  FlowField = class {
    constructor(t) {
      ((this.a = t), (this.cs = 1), (this.cols = Math.ceil(t.W * 2)), (this.rows = Math.ceil(t.H * 2)));
      let e = this.cols * this.rows;
      ((this.block = new Uint8Array(e)),
        (this.dist = new Int32Array(e)),
        (this.dx = new Float32Array(e)),
        (this.dy = new Float32Array(e)),
        (this.queue = new Int32Array(e)),
        (this.target = -1));
      for (let n = 0; n < this.rows; n++)
        for (let s = 0; s < this.cols; s++) {
          let r = -t.W + (s + 0.5) * this.cs,
            a = -t.H + (n + 0.5) * this.cs;
          this.block[n * this.cols + s] = t.blocked(r, a, 0.55) ? 1 : 0;
        }
    }
    idx(t, e) {
      let n = clamp(Math.floor((t + this.a.W) / this.cs), 0, this.cols - 1);
      return clamp(Math.floor((e + this.a.H) / this.cs), 0, this.rows - 1) * this.cols + n;
    }
    update(t, e) {
      let n = this.idx(t, e);
      if (n === this.target) return;
      this.target = n;
      let { cols: s, rows: r, dist: a, block: o, queue: c } = this;
      a.fill(1 << 30);
      let h = 0,
        l = 0;
      for (a[n] = 0, c[l++] = n; h < l; ) {
        let u = c[h++],
          d = u % s,
          f = (u / s) | 0,
          p = a[u] + 1,
          x;
        (d > 0 && !o[(x = u - 1)] && a[x] > p && ((a[x] = p), (c[l++] = x)),
          d < s - 1 && !o[(x = u + 1)] && a[x] > p && ((a[x] = p), (c[l++] = x)),
          f > 0 && !o[(x = u - s)] && a[x] > p && ((a[x] = p), (c[l++] = x)),
          f < r - 1 && !o[(x = u + s)] && a[x] > p && ((a[x] = p), (c[l++] = x)));
      }
      for (let u = 0; u < r; u++)
        for (let d = 0; d < s; d++) {
          let f = u * s + d,
            p = a[f],
            x = 0,
            m = 0;
          for (let M = -1; M <= 1; M++)
            for (let b = -1; b <= 1; b++) {
              if (!b && !M) continue;
              let v = d + b,
                S = u + M;
              if (v < 0 || S < 0 || v >= s || S >= r) continue;
              let T = S * s + v;
              (b && M && (o[u * s + v] || o[S * s + d])) || (a[T] < p && ((p = a[T]), (x = b), (m = M)));
            }
          let g = Math.hypot(x, m) || 1;
          ((this.dx[f] = x / g), (this.dy[f] = m / g));
        }
    }
  };
var OBSTACLE_GAP = 2.7,
  spawnZone = { x: 0, y: 2, r: 4.6 },
  obstacleShapes = {
    yard: [
      [5, (i) => ({ t: "c", r: i.range(1, 1.5) })],
      [
        3,
        (i) => {
          let t = i.range(0.7, 1.1);
          return { t: "b", w: t, h: t };
        },
      ],
    ],
    works: [
      [
        4,
        (i) =>
          i.chance(0.5)
            ? { t: "b", w: i.range(2.4, 4.2), h: i.range(0.6, 0.85) }
            : { t: "b", w: i.range(0.6, 0.85), h: i.range(2.4, 4.2) },
      ],
      [3, (i) => ({ t: "c", r: i.range(1.1, 1.6) })],
      [
        2,
        (i) => {
          let t = i.range(0.8, 1.2);
          return { t: "b", w: t, h: t };
        },
      ],
    ],
    vault: [
      [4, (i) => ({ t: "c", r: i.range(0.7, 1.1) })],
      [
        3,
        (i) =>
          i.chance(0.5)
            ? { t: "b", w: i.range(1.4, 2.6), h: i.range(0.7, 1) }
            : { t: "b", w: i.range(0.7, 1), h: i.range(1.4, 2.6) },
      ],
    ],
    marsh: [
      [4, (i) => ({ t: "c", r: i.range(0.9, 1.5) })],
      [
        3,
        (i) =>
          i.chance(0.5)
            ? { t: "b", w: i.range(1.4, 2.4), h: i.range(0.7, 1) }
            : { t: "b", w: i.range(0.7, 1), h: i.range(1.4, 2.4) },
      ],
    ],
    void: [
      [
        4,
        (i) =>
          i.chance(0.5)
            ? { t: "b", w: i.range(0.5, 0.7), h: i.range(1.3, 2.2) }
            : { t: "b", w: i.range(1.3, 2.2), h: i.range(0.5, 0.7) },
      ],
      [3, (i) => ({ t: "c", r: i.range(0.9, 1.3) })],
    ],
  },
  mapTemplates = {
    yard: ["scatter", "ring", "rot4", "mirror2"],
    works: ["scatter", "lanes", "mirror2", "rot2"],
    vault: ["scatter", "rot2", "ring", "rot4"],
    void: ["scatter", "ring", "rot2", "mirror4"],
    marsh: ["scatter", "mirror2", "ring", "rot2"],
  };
function classicLayout(i) {
  return {
    key: i.id + ":classic",
    W: i.W,
    H: i.H,
    obstacles: i.obstacles.map((t) => ({ ...t })),
    deco: 0,
    template: "classic",
  };
}
function mapScore(i, t, e, n) {
  let s = 0,
    r = 0,
    a = 0,
    o = new Array(8).fill(0),
    c = [];
  for (let h of i) {
    let l = h.t === "c" ? Math.PI * h.r * h.r : 4 * h.w * h.h;
    s += l;
    let u = Math.atan2(h.y, h.x);
    (u < 0 && (u += TAU), o[Math.min(7, Math.floor((u / TAU) * 8))]++, c.push(Math.hypot(h.x, h.y)));
  }
  r = s / (4 * t * e);
  let h = o.filter((u) => u > 0).length,
    l = 0;
  if (c.length > 1) {
    c.sort((u, d) => u - d);
    for (let u = 1; u < c.length; u++) l += Math.abs(c[u] - c[u - 1]);
    l += Math.abs(c[0] + Math.min(t, e) - c[c.length - 1]);
  }
  let u = Math.max(0, 0.13 - Math.min(0.13, Math.max(...o) - Math.min(...o))),
    d = Math.max(0, 1 - Math.abs(r - 0.035) / 0.035),
    f = Math.min(1, h / 6),
    p = Math.min(1, l / ((c.length + 1) * Math.max(1, Math.min(t, e))));
  return (
    d * 3.5 + f * 3 + p * 1.5 + (i.length >= 5 && i.length <= 9 ? 1 : 0) + u * 1.2 + (n === "scatter" ? 3 : 0) - 0.2
  );
}
function buildLayout(i, t, e, n) {
  if (n || !obstacleShapes[i.id]) return classicLayout(i);
  let s = makeRng(hashString(t + ":map:" + e)),
    r = null,
    a = -1e9;
  for (let o = 0; o < 24; o++) {
    let c = clamp(i.W + s.int(-1, 1), 15, 20),
      h = clamp(i.H + s.int(-1, 1), 15, 20),
      l = s.chance(0.55) ? "scatter" : s.pick(mapTemplates[i.id].filter((u) => u !== "scatter")),
      u = placeObstacles(s, i.id, l, c, h);
    if (u.length < 4 || !isConnected(u, c, h)) continue;
    let d = mapScore(u, c, h, l);
    d > a && ((a = d), (r = { W: c, H: h, obstacles: u, template: l }));
  }
  if (!r) return classicLayout(i);
  return {
    key: `${i.id}:${t}:${e}`,
    W: r.W,
    H: r.H,
    obstacles: r.obstacles,
    deco: 1 + s.int(0, 3),
    template: r.template,
    features: placeFeatures(s, i.id, r.obstacles, r.W, r.H),
  };
}
const _rlBuildLayoutBase = buildLayout;
function rlBuildLayoutV21(i, t, e, n) {
  const base = _rlBuildLayoutBase(i, t, e, n),
    layout = rlAddWaveObstacles(base, i, t, e, n);
  return layout;
}
buildLayout = rlBuildLayoutV21;
// 2.4.6: the Crucible's arena in Ember Works keeps three lava vents (boss arenas are open and had
// no hazard at all). Its Eruption and Stoke attacks make nearby vents burst; the vents themselves
// keep their normal cycle. Other biomes' boss arenas stay as they are.
const _rlBuildLayout246 = buildLayout;
buildLayout = function (biome, seed, wave, boss) {
  const layout = _rlBuildLayout246(biome, seed, wave, boss);
  if (!boss || biome.id !== "works") return layout;
  const rng = makeRng(hashString(seed + ":crucible-vents:" + wave)),
    features = { vents: [], ice: [], portals: [], acid: [] };
  for (let k = 0; k < 12 && features.vents.length < 3; k++) {
    const p = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 1.2);
    p && features.vents.push({ ...p, phase: rng.next() * 6, period: 3.2 + rng.next() * 1.2, st: "idle" });
  }
  return { ...layout, key: `${layout.key}:crucible:${seed}:${wave}`, features };
};
function rlFeaturePoint(rng, obs, W, H, features, extraR = 0.75) {
  const taken = [];
  for (const k of ["vents", "ice", "acid"])
    for (const q of features[k] || []) taken.push({ x: q.x, y: q.y, r: (q.r || 0.8) + extraR });
  for (const q of features.portals || []) {
    taken.push({ x: q.ax, y: q.ay, r: 1 + extraR });
    taken.push({ x: q.bx, y: q.by, r: 1 + extraR });
  }
  for (let tries = 0; tries < 80; tries++) {
    const a = rng.next() * TAU,
      d = rng.range(6.5, 9.6),
      x = spawnZone.x + Math.cos(a) * d,
      y = spawnZone.y + Math.sin(a) * d,
      r = 0.72 + rng.next() * 0.28;
    if (Math.abs(x) > W - 3.7 || Math.abs(y) > H - 3.7 || Math.hypot(x - spawnZone.x, y - spawnZone.y) < 6.2) continue;
    if (hitsObstacle(obs, x, y, r + 0.9)) continue;
    if (taken.some((q) => Math.hypot(x - q.x, y - q.y) < r + q.r + 1)) continue;
    return { x, y, r };
  }
  return null;
}
function rlAddDynamicFeatures(layout, biome, seed, wave, boss, mode = "standard") {
  const features = {
    vents: [...(layout.features?.vents || [])],
    ice: [...(layout.features?.ice || [])],
    portals: [...(layout.features?.portals || [])],
    acid: [...(layout.features?.acid || [])],
  };
  const rng = makeRng(hashString(seed + ":director-features-v21:" + wave + ":" + mode));
  const theme = RL_BIOME_HAZARD[biome.id] ?? "",
    own = theme === "vents" || theme === "ice" || theme === "acid" ? theme : "";
  // Every biome keeps ONE hazard theme: whatever the wave mode asks for becomes the biome's own hazard.
  const add = (kind, count = 1) => {
    kind = own;
    if (!kind) return;
    for (let j = 0; j < count; j++) {
      if (features[kind].length >= 6) return;
      const p = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 0.1);
      if (!p) continue;
      if (kind === "vents")
        features.vents.push({ ...p, phase: rng.next() * 6, period: 2.8 + rng.next() * 1.6, st: "idle" });
      else if (kind === "ice") features.ice.push({ x: p.x, y: p.y, r: p.r });
      else if (kind === "acid") features.acid.push({ x: p.x, y: p.y, r: p.r, life: null });
    }
  };
  if (!boss) {
    add(own, 2); // 2.4.0: two per wave (was one) — the hazard is what the biome plays around
    if (theme === "portals" && !features.portals.length) {
      for (let k = 0; k < 6 && !features.portals.length; k++) {
        const a = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 0.1),
          b = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 0.1);
        if (a && b && Math.hypot(a.x - b.x, a.y - b.y) >= 7.2)
          features.portals.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
    }
    switch (mode) {
      case "crossfire":
        add("vents", 2);
        break;
      case "riftwalk":
        add("ice", 1);
        break;
      case "shatter":
        add("acid", 1);
        add("ice", 1);
        break;
      case "deadzone":
        add("acid", 2);
        break;
      case "barricade":
        add("ice", 1);
        break;
      case "minefield":
        add("acid", 3);
        break;
      case "turbulence":
        add("vents", 2);
        add("ice", 1);
        break;
      case "fortress":
        add("vents", 1);
        break;
      case "salvage":
        add("ice", 1);
        break;
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
    obs = layout.obstacles.map((q) => ({ ...q })),
    baseCount = obs.length;
  const protectedPoints = [];
  for (const kind of ["vents", "ice", "acid"]) {
    for (const q of layout.features?.[kind] || []) protectedPoints.push({ x: q.x, y: q.y, r: (q.r || 0.8) + 0.9 });
  }

  for (const q of layout.features?.portals || []) {
    protectedPoints.push({ x: q.ax, y: q.ay, r: 2.3 });
    protectedPoints.push({ x: q.bx, y: q.by, r: 2.3 });
  }
  const featureOverlap = (cand) =>
    protectedPoints.some(
      (q) => Math.hypot(cand.x - q.x, cand.y - q.y) < (cand.t === "c" ? cand.r : Math.hypot(cand.w, cand.h)) + q.r,
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
      const a = rng.next() * TAU,
        d = rng.range(6.2, Math.min(10.8, Math.min(layout.W, layout.H) - 4.2)),
        x = spawnZone.x + Math.cos(a) * d,
        y = spawnZone.y + Math.sin(a) * d;
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
        obs.some((q) => obstacleDistance(cand, q) < OBSTACLE_GAP) ||
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
function randomObstacle(i, t) {
  let e = obstacleShapes[t],
    n = 0;
  for (let [r] of e) n += r;
  let s = i.next() * n;
  for (let [r, a] of e) if (((s -= r), s <= 0)) return a(i);
  return e[0][1](i);
}
function mirrorObstacle(i, t) {
  let e = (r, a, o) => ({ ...t, x: r, y: a, ...(o && t.t === "b" ? { w: t.h, h: t.w } : {}) }),
    { x: n, y: s } = t;
  switch (i) {
    case "mirror4":
      return [e(n, s), e(-n, s), e(n, -s), e(-n, -s)];
    case "mirror2":
      return [e(n, s), e(-n, s)];
    case "rot2":
      return [e(n, s), e(-n, -s)];
    case "rot4":
      return [e(n, s), e(-s, n, !0), e(-n, -s), e(s, -n, !0)];
    default:
      return [e(n, s)];
  }
}
function placeObstacles(i, t, e, n, s) {
  let r = [],
    a = (o) => {
      if (r.length + o.length > 12) return !1;
      for (let c of o) if (!canPlaceObstacle(c, r, n, s)) return !1;
      for (let c = 0; c < o.length; c++)
        for (let h = c + 1; h < o.length; h++) if (obstacleDistance(o[c], o[h]) < OBSTACLE_GAP) return !1;
      return (r.push(...o), !0);
    },
    o;
  if (e === "scatter") {
    let c = i.int(5, 8),
      h = i.next() * TAU,
      l = Math.min(n, s);
    for (let u = 0; u < c; u++) {
      let d = h + (u / c) * TAU + i.range(-0.42, 0.42),
        f = i.range(l * 0.43, l * 0.72),
        p = randomObstacle(i, t);
      p.x = Math.cos(d) * f;
      p.y = Math.sin(d) * f;
      a([p]);
    }
    for (let c = 0; c < 18 && r.length < 4; c++) {
      let h = i.next() * TAU,
        l = i.range(Math.min(n, s) * 0.4, Math.min(n, s) * 0.76),
        u = randomObstacle(i, t);
      u.x = Math.cos(h) * l;
      u.y = Math.sin(h) * l;
      a([u]);
    }
  } else if (e === "ring") {
    let o = i.pick([4, 6, 8]),
      c = Math.min(n, s) * i.range(0.42, 0.58),
      h = i.next() * Math.PI,
      l = randomObstacle(i, t);
    for (let u = 0; u < o; u++) {
      let d = h + (u / o) * Math.PI * 2;
      a([{ ...l, x: Math.cos(d) * c, y: Math.sin(d) * c }]);
    }
    placeSymmetric(i, t, "mirror4", n, s, a, 2);
  } else if (e === "lanes") {
    let o = i.range(6, Math.min(9.5, s - 5)),
      c = i.range(3, 5.5),
      h = i.range(3.2, 5.5);
    for (let l of [-1, 1]) for (let u of [-1, 1]) a([{ t: "b", w: c / 2, h: 0.7, x: u * (h + c / 2), y: l * o }]);
    placeSymmetric(i, t, "mirror2", n, s, a, 3);
  } else placeSymmetric(i, t, e, n, s, a, i.int(2, 4));
  return r;
}
function placeSymmetric(i, t, e, n, s, r, a) {
  for (let o = 0; o < a; o++)
    for (let c = 0; c < 14; c++) {
      let h = randomObstacle(i, t);
      if (
        ((h.x = i.range(e === "rot2" ? -n + 2 : 1.5, n - 2)),
        (h.y = i.range(e === "mirror4" ? 1.5 : -s + 2, s - 2)),
        r(mirrorObstacle(e, h)))
      )
        break;
    }
}
function halfSize(i) {
  return i.t === "c" ? { hx: i.r, hy: i.r } : { hx: i.w, hy: i.h };
}
function obstacleDistance(i, t) {
  if (i.t === "c" && t.t === "c") return Math.max(0, Math.hypot(i.x - t.x, i.y - t.y) - i.r - t.r);
  if (i.t === "c" || t.t === "c") {
    let s = i.t === "c" ? i : t,
      r = i.t === "c" ? t : i,
      a = Math.max(0, Math.abs(s.x - r.x) - r.w),
      o = Math.max(0, Math.abs(s.y - r.y) - r.h);
    return Math.max(0, Math.hypot(a, o) - s.r);
  }
  let e = Math.max(0, Math.abs(i.x - t.x) - i.w - t.w),
    n = Math.max(0, Math.abs(i.y - t.y) - i.h - t.h);
  return Math.hypot(e, n);
}
function canPlaceObstacle(i, t, e, n) {
  let { hx: s, hy: r } = halfSize(i);
  if (Math.abs(i.x) + s > e - OBSTACLE_GAP || Math.abs(i.y) + r > n - OBSTACLE_GAP) return !1;
  let a = Math.max(0, Math.abs(i.x - spawnZone.x) - s),
    o = Math.max(0, Math.abs(i.y - spawnZone.y) - r),
    c = Math.max(5.4, spawnZone.r + Math.max(s, r) + 3.8);
  if (Math.hypot(a, o) < c) return !1;
  for (let h of t) if (obstacleDistance(i, h) < OBSTACLE_GAP) return !1;
  return !0;
}
function hitsObstacle(i, t, e, n) {
  for (let s of i)
    if (s.t === "c") {
      if (Math.hypot(t - s.x, e - s.y) < s.r + n) return !0;
    } else if (Math.abs(t - s.x) < s.w + n && Math.abs(e - s.y) < s.h + n) return !0;
  return !1;
}
function isConnected(i, t, e) {
  let n = 0;
  for (let p of i) n += p.t === "c" ? Math.PI * p.r * p.r : 4 * p.w * p.h;
  if (n > 4 * t * e * 0.13) return !1;
  let s = 0.5,
    r = Math.ceil((2 * t) / s),
    a = Math.ceil((2 * e) / s),
    o = 1.1,
    c = new Uint8Array(r * a),
    h = 0;
  for (let p = 0; p < a; p++)
    for (let x = 0; x < r; x++) {
      let m = -t + (x + 0.5) * s,
        g = -e + (p + 0.5) * s;
      Math.abs(m) > t - o || Math.abs(g) > e - o || hitsObstacle(i, m, g, o) || ((c[p * r + x] = 1), h++);
    }
  let l = Math.floor((spawnZone.y + e) / s) * r + Math.floor((spawnZone.x + t) / s);
  if (!c[l]) return !1;
  let u = new Uint8Array(r * a),
    d = [l];
  u[l] = 1;
  let f = 0;
  for (; d.length; ) {
    let p = d.pop();
    f++;
    let x = p % r,
      m = (p / r) | 0;
    for (let [g, M] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let b = x + g,
        v = m + M;
      if (b < 0 || v < 0 || b >= r || v >= a) continue;
      let S = v * r + b;
      c[S] && !u[S] && ((u[S] = 1), d.push(S));
    }
  }
  return f >= h * 0.995;
}
function placeFeatures(i, t, e, n, s) {
  let r = { vents: [], ice: [], portals: [], acid: [] },
    path = (c, h, l, u, d = 0.5) => {
      let f = Math.max(d, spawnZone.r + 0.12),
        p = l - c,
        x = u - h,
        m = p * p + x * x;
      if (Math.abs(c) > n - 2.7 || Math.abs(h) > s - 2.7 || Math.abs(l) > n - 2.7 || Math.abs(u) > s - 2.7) return !1;
      for (let M of e)
        if (M.t === "c") {
          let b = m ? clamp(((M.x - c) * p + (M.y - h) * x) / m, 0, 1) : 0,
            v = c + p * b,
            S = h + x * b;
          if ((v - M.x) * (v - M.x) + (S - M.y) * (S - M.y) < (M.r + f) * (M.r + f)) return !1;
        } else {
          let b = M.x - M.w - f,
            v = M.x + M.w + f,
            S = M.y - M.h - f,
            A = M.y + M.h + f,
            C = 0,
            E = 1;
          if (Math.abs(p) < 1e-9) {
            if (c < b || c > v) continue;
          } else {
            let T = (b - c) / p,
              R = (v - c) / p;
            T > R && ([T, R] = [R, T]);
            ((C = Math.max(C, T)), (E = Math.min(E, R)));
            if (C > E) continue;
          }
          if (Math.abs(x) < 1e-9) {
            if (h < S || h > A) continue;
          } else {
            let T = (S - h) / x,
              R = (A - h) / x;
            T > R && ([T, R] = [R, T]);
            ((C = Math.max(C, T)), (E = Math.min(E, R)));
            if (C > E) continue;
          }
          if (C <= E && E >= 0 && C <= 1) return !1;
        }
      return !0;
    },
    o = (c, h, l, u, d = {}) => {
      let f = null,
        p = -1e9,
        x = Math.max(3.6, c + 2.7),
        m = Math.max(5.6, spawnZone.r + c + 4.1),
        g = Math.max(0.1, Math.min(n, s) - x),
        M = Math.min(10.5, Math.hypot(Math.max(0, n - x), Math.max(0, s - x))),
        b = Math.min(d.maxRadius ?? 9.2, Math.max(m + 1, M * 0.72)),
        v = Math.min(d.minRadius ?? 7.1, b - 1);
      for (let S = 0; S < 96; S++) {
        let A, C;
        if (d.anchor) {
          let T = i.next() * TAU,
            R = i.range(d.minDist ?? 6, d.maxDist ?? 9);
          ((A = d.anchor.x + Math.cos(T) * R), (C = d.anchor.y + Math.sin(T) * R));
        } else {
          let T =
              d.angleCenter != null
                ? d.angleCenter + i.range(-(d.angleSpan ?? 0.5), d.angleSpan ?? 0.5)
                : i.next() * TAU,
            R = i.range(d.minRadius ?? v, d.maxRadius ?? b);
          ((A = spawnZone.x + Math.cos(T) * R), (C = spawnZone.y + Math.sin(T) * R));
        }
        if (
          Math.abs(A) > n - x ||
          Math.abs(C) > s - x ||
          Math.hypot(A - spawnZone.x, C - spawnZone.y) < m ||
          !path(d.pathFrom?.x ?? A, d.pathFrom?.y ?? C, A, C, d.pathFrom?.x != null ? 0.45 : 0.5) ||
          hitsObstacle(e, A, C, c + h)
        )
          continue;
        let E = !0,
          _ = 999;
        for (let T of l) {
          let R = Math.hypot(T.x - A, T.y - C),
            V = R - (T.r || 0) - c;
          _ = Math.min(_, V);
          if (R < (T.r || 0) + c + u) {
            E = !1;
            break;
          }
        }
        if (!E || (d.farFrom && Math.hypot(A - d.farFrom.x, C - d.farFrom.y) < (d.farMin || 0))) continue;
        let T = Math.min(n - Math.abs(A), s - Math.abs(C)),
          R = Math.hypot(A - spawnZone.x, C - spawnZone.y),
          V = Math.min(_, 8),
          D = d.preferRadius != null ? Math.abs(R - d.preferRadius) : Math.abs(R - (v + b) * 0.5),
          P = 999;
        for (let L of l) {
          let I = Math.atan2(L.y - spawnZone.y, L.x - spawnZone.x),
            z = Math.atan2(C - spawnZone.y, A - spawnZone.x);
          P = Math.min(P, Math.abs(angleDiff(I, z)));
        }
        let O = T * 1.35 + V * 0.75 - P * 0.85 - D * 1.15 + i.next() * 1.1;
        O > p && ((p = O), (f = { x: A, y: C }));
      }
      return f;
    };
  if (t === "works") {
    let c = i.int(3, 5),
      h = i.range(6.5, 8);
    for (let l = 0; l < c; l++) {
      let u = i.range(1.1, 1.5),
        d = o(u, 0.6, r.vents, 3, { minRadius: 6.5, maxRadius: 9.2, preferRadius: 7.8 });
      d && r.vents.push({ x: d.x, y: d.y, r: u, period: h, phase: (l / c) * h + i.range(0, 0.8) });
    }
  } else if (t === "vault") {
    let c = i.int(3, 5);
    for (let h = 0; h < c; h++) {
      let l = i.range(2.2, 3.4),
        u = o(l, 0.45, r.ice, 1.5, { minRadius: 6, maxRadius: 8.8, preferRadius: 7.2 });
      u && r.ice.push({ x: u.x, y: u.y, r: l });
    }
  } else if (t === "marsh") {
    let c = i.int(3, 4);
    for (let h = 0; h < c; h++) {
      let l = i.range(1.8, 2.8),
        u = o(l, 0.55, r.acid, 1.8, { minRadius: 5.8, maxRadius: 8.8, preferRadius: 7 });
      u && r.acid.push({ x: u.x, y: u.y, r: l });
    }
  } else if (t === "void") {
    let c = i.chance(0.4) ? 2 : 1,
      used = [];
    const portalGap = 4.2,
      clearPoint = (p) =>
        Math.abs(p.x) <= n - 3.6 &&
        Math.abs(p.y) <= s - 3.6 &&
        !hitsObstacle(e, p.x, p.y, 2.3) &&
        Math.hypot(p.x - spawnZone.x, p.y - spawnZone.y) > 7.1 &&
        used.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= portalGap);
    for (let h = 0; h < c; h++) {
      let l = null;
      for (let u = 0; u < 96 && !l; u++) {
        let d = i.range(7.8, 9.8),
          f = i.next() * TAU,
          g = { x: spawnZone.x + Math.cos(f) * d, y: spawnZone.y + Math.sin(f) * d };
        clearPoint(g) && (l = g);
      }
      if (!l) continue;
      let u = null,
        d = Math.atan2(l.y - spawnZone.y, l.x - spawnZone.x) + Math.PI;
      for (let f = 0; f < 96 && !u; f++) {
        let g = i.range(7.8, 9.8),
          M = d + i.range(-0.55, 0.55),
          b = { x: spawnZone.x + Math.cos(M) * g, y: spawnZone.y + Math.sin(M) * g };
        clearPoint(b) && Math.hypot(b.x - l.x, b.y - l.y) > Math.max(n, s) * 0.78 && (u = b);
      }
      if (!u) continue;
      (r.portals.push({ ax: l.x, ay: l.y, bx: u.x, by: u.y, hue: h }), used.push(l, u));
    }
  }
  return r;
}

export { mapTemplates, hitsObstacle, obstacleShapes, Arena, buildLayout, isConnected, SpatialHash };
