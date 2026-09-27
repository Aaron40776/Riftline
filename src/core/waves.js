// Wave planning: spawn plans, wave events and upgrade offers.

import { enemyDefs, enemyOrder } from "../data/enemies.js";
import { clamp, weightedPick } from "./util.js";
import { rarityWeights, bossRarityWeights, upgradeList } from "../data/upgrades.js";

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
}
// Enemy mix: startWave builds the wave plan with _u; the biome's weights multiply the spawn
// weights of the plan (events keep theirs on top).
var RL_BIOME_MIX_CUR = null;
// assigned from other modules (an imported binding cannot be assigned)
function set_RL_BIOME_MIX_CUR(v) {
  return (RL_BIOME_MIX_CUR = v);
}
const _rlPlan240 = planWave;
planWave = function (rng, wave, tm, boss, plan = {}) {
  const mix = RL_BIOME_MIX_CUR;
  if (!mix) return _rlPlan240(rng, wave, tm, boss, plan);
  const weights = { ...(plan.weights || {}) };
  for (const [id, m] of Object.entries(mix)) weights[id] = (weights[id] || 1) * m;
  return _rlPlan240(rng, wave, tm, boss, { ...plan, weights });
};

export { waveEvents, spawnWeights, EVENT_CHANCE, planWave, heavyEnemies, rollUpgradeOffer, set_RL_BIOME_MIX_CUR };
