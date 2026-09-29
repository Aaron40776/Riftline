// Wave planning: spawn plans, wave events and upgrade offers.

import { enemyDefs, enemyOrder } from "../data/enemies.js";
import { clamp, weightedPick } from "./util.js";
import { rarityWeights, bossRarityWeights, upgradeList } from "../data/upgrades.js";
import { RL_BIOME_INFO } from "../data/biomes.js";

var waveEvents = {
  elite: {
    id: "elite",
    name: "ELITE SURGE",
    desc: "Fewer enemies, most of them elite · shards +50%",
    shardMul: 1.5,
    plan: { budget: 0.6, elite: 0.5 },
  },
  rain: {
    id: "rain",
    name: "SHARD RAIN",
    desc: "Shards fall from the sky — and so does the swarm",
    shardMul: 1,
    plan: { weights: { swarmer: 3, bomber: 1.6 } },
  },
};
var EVENT_CHANCE = 0.2;
function rollUpgradeOffer(i, t, e, n, s, r, a = [], o = null) {
  let c = upgradeList.filter(
      (f) => !(f.evo || (t[f.id] || 0) >= f.max || (f.id === "heal" && n > 0.7) || (r && f.rarity < 2)),
    ),
    h = (f) => {
      let x = (r ? bossRarityWeights : rarityWeights)[f.rarity];
      return (
        r || (f.rarity === 3 && (x += e * 0.35), f.rarity === 4 && (x += e * 0.15)),
        f.id === "heal" && (x *= n < 0.35 ? 3 : 1.2),
        a.includes(f.id) && (x *= 0.05),
        x / Math.max(1, countRarity(c, f.rarity))
      );
    },
    l = [],
    u = upgradeList.filter(
      (f) =>
        f.evo && !t[f.id] && (!f.weapon || f.weapon === o) && Object.entries(f.evo).every(([p, x]) => (t[p] || 0) >= x),
    );
  u.length && l.push(u[Math.floor(i.next() * u.length)].id);
  let d = c.slice();
  for (; l.length < s && d.length; ) {
    let f = 0;
    for (let m of d) f += h(m);
    let p = i.next() * f,
      x = d[d.length - 1];
    for (let m of d)
      if (((p -= h(m)), p <= 0)) {
        x = m;
        break;
      }
    (l.push(x.id), d.splice(d.indexOf(x), 1));
  }
  return l;
}
function countRarity(i, t) {
  let e = 0;
  for (let n of i) n.rarity === t && e++;
  return e;
}
var spawnWeights = {
    swarmer: 5,
    grunt: 4,
    gunner: 3,
    bomber: 2.4,
    splitter: 2,
    brute: 1.3,
    sniper: 1.5,
    hive: 0.6,
    bulwark: 1.3,
    striker: 1.6,
    mortar: 1.1,
    mender: 1,
    leaper: 1.5,
    turret: 0.9,
  },
  heavyEnemies = { brute: 1, hive: 1, sniper: 1, bulwark: 1, mortar: 1, mender: 1, turret: 1 };
function waveBudget(i, t) {
  return (16 + 8 * i + 0.3 * i * i) * t.budget;
}
function planWave(i, t, e, n, s = {}) {
  // 2.4.0: the biome's enemy mix (set by World.startWave) multiplies the spawn weights (events keep
  // theirs on top). 2.5.0 C: signature enemies, the ones the mix favours (weight >= 1), can spawn
  // from the biome's first wave at half their weight until their own wave (see rlEnemyFrom).
  const mix = RL_BIOME_MIX_CUR;
  let early = [],
    saved = [];
  if (mix) {
    early = Object.keys(mix).filter((id) => mix[id] >= 1 && enemyDefs[id] && enemyDefs[id].from > t);
    const weights = { ...(s.weights || {}) };
    if (early.length) {
      saved = early.map((id) => enemyDefs[id].from);
      for (const id of early) weights[id] = (weights[id] || 1) * RL_EARLY_WEIGHT_250;
    }
    for (const [id, m] of Object.entries(mix)) weights[id] = (weights[id] || 1) * m;
    s = { ...s, weights };
  }
  try {
    const start = rlBiomeStart(t);
    for (const id of early) enemyDefs[id].from = start;
    let r = waveBudget(t, e) * (n ? 0.22 : 1) * (s.budget || 1),
      a = enemyOrder.filter((S) => enemyDefs[S].from <= t && (!n || !heavyEnemies[S])),
      o = {
        hive: 1 + Math.floor(t / 8),
        brute: 2 + Math.floor(t / 4),
        sniper: 2 + Math.floor(t / 4),
        splitter: 3 + Math.floor(t / 3),
        bulwark: 1 + Math.floor(t / 6),
        mortar: 1 + Math.floor(t / 6),
        striker: 2 + Math.floor(t / 5),
        mender: 1 + Math.floor(t / 10),
        leaper: 2 + Math.floor(t / 5),
        turret: 1 + Math.floor(t / 8),
        charger: 2 + Math.floor(t / 6),
        minebot: 2 + Math.floor(t / 8),
        sapper: 1 + Math.floor(t / 7),
        phantom: 1 + Math.floor(t / 8),
        sentinel: 1 + Math.floor(t / 9),
        carrier: 1 + Math.floor(t / 10),
        drone: 2 + Math.floor(t / 6),
        driller: 1 + Math.floor(t / 8),
        beacon: 1 + Math.floor(t / 14),
        weaver: 1 + Math.floor(t / 8),
      },
      c = {},
      h = [],
      l = s.elite != null ? s.elite : t >= 6 ? 0.035 + 0.006 * t + e.elite : 0,
      u = 0;
    for (; r >= 1 && u++ < 500; ) {
      let S = a.filter((R) => enemyDefs[R].cost <= r && (c[R] || 0) < (o[R] ?? 999));
      if (!S.length) break;
      let T = weightedPick(
        i,
        S,
        S.map((R) => spawnWeights[R] * ((s.weights && s.weights[R]) || 1)),
      );
      ((c[T] = (c[T] || 0) + 1), (r -= enemyDefs[T].cost), h.push({ type: T, elite: T !== "swarmer" && i.chance(l) }));
    }
    for (let S = h.length - 1; S > 0; S--) {
      let T = Math.floor(i.next() * (S + 1));
      [h[S], h[T]] = [h[T], h[S]];
    }
    let d = Math.floor(h.length / 4),
      f = h.slice(0, d),
      p = h.slice(d),
      x = f.filter((S) => heavyEnemies[S.type] || S.elite),
      m = f.filter((S) => !(heavyEnemies[S.type] || S.elite)).concat(p, x),
      g = [],
      M = clamp(4 + Math.floor(t / 2.5), 4, 12),
      b = n ? 7 : Math.max(1.6, 3.2 - t * 0.06),
      v = 0;
    for (; v < m.length; ) {
      let S = M + i.int(-1, 1),
        T = [],
        R = 0;
      for (; v < m.length && R < S; ) {
        let _ = m[v++];
        (T.push(_), (R += _.type === "swarmer" ? 0.5 : 1));
      }
      g.push({ gap: b * i.range(0.85, 1.15), members: T });
    }
    return g;
  } finally {
    early.forEach((id, k) => (enemyDefs[id].from = saved[k]));
  }
}
// Enemy mix: World.startWave sets the biome's mix while it builds the wave plan with planWave; the
// biome's weights multiply the spawn weights of the plan (events keep theirs on top).
var RL_BIOME_MIX_CUR = null;
// assigned from other modules (an imported binding cannot be assigned)
function set_RL_BIOME_MIX_CUR(v) {
  return (RL_BIOME_MIX_CUR = v);
}
export { waveEvents, spawnWeights, EVENT_CHANCE, planWave, heavyEnemies, rollUpgradeOffer, set_RL_BIOME_MIX_CUR };

// ---- 2.5.0 C: biome events and signature enemies ----
// One event per hazard biome, on top of Elite Surge and Shard Rain. World.eventFor gives every
// visit of a hazard biome one of them (wave 2–4 of the visit, never a boss wave); `biome` says
// where it may happen. What they do is in world.js (and the renderer for the Whiteout fog).
Object.assign(waveEvents, {
  meltdown: {
    id: "meltdown",
    name: "MELTDOWN",
    desc: "More vents, all erupting at once · shards +25%",
    shardMul: 1.25,
    biome: "works",
    plan: {},
  },
  whiteout: {
    id: "whiteout",
    name: "WHITEOUT",
    desc: "Snow storm: low sight, more ice · shards +25%",
    shardMul: 1.25,
    biome: "vault",
    plan: {},
  },
  bloom: {
    id: "bloom",
    name: "SPORE BLOOM",
    desc: "Acid pools grow and spread · shards +25%",
    shardMul: 1.25,
    biome: "marsh",
    plan: {},
  },
  riftstorm: {
    id: "riftstorm",
    name: "RIFT STORM",
    desc: "Portals jump every few seconds · shards +25%",
    shardMul: 1.25,
    biome: "void",
    plan: {},
  },
});
var RL_BIOME_EVENT = { works: "meltdown", vault: "whiteout", marsh: "bloom", void: "riftstorm" };
// Signature enemies: the enemies a biome's mix favours (weight >= 1) can spawn in that biome from
// its first wave (before, Void Core's phantom came from wave 20 and weaver from 28 although Void
// Core is waves 16–20). Enemies pulled forward this way spawn at half their weight until their
// own wave, so they show up without flooding the wave. Neon Yard has no mix and is unchanged.
const RL_EARLY_WEIGHT_250 = 0.5;
function rlBiomeStart(wave) {
  return Math.floor((Math.max(1, wave) - 1) / 5) * 5 + 1;
}
// the wave from which `type` can spawn in `biome` (id) at `wave`
function rlEnemyFrom(type, biome, wave) {
  const def = enemyDefs[type];
  if (!def) return 99;
  const mix = RL_BIOME_INFO[biome]?.mix;
  return mix && mix[type] >= 1 ? Math.min(def.from, rlBiomeStart(wave)) : def.from;
}
export { RL_BIOME_EVENT, rlEnemyFrom, rlBiomeStart };
