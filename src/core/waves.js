// Wave planning: spawn plans, wave events and upgrade offers.

import { enemyDefs, enemyOrder } from "../data/enemies.js";
import { clamp, weightedPick } from "./util.js";
import { rarityWeights, bossRarityWeights, upgradeList } from "../data/upgrades.js";
import { RL_BIOME_INFO } from "../data/biomes.js";

const waveEvents = {
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
const EVENT_CHANCE = 0.2;
// 2.8.1: cards that do nothing for the weapon are not offered: the Disc Launcher never bounces (Rebound)
// and already pierces everything (Tungsten Core); with Lance the Railgun pierces everything too
function deadForWeapon(id, weapon, owned) {
  if (weapon === "disc") return id === "ricochet" || id === "pierce";
  if (weapon === "rail") return id === "pierce" && (owned.lance || 0) > 0;
  return false;
}
function rollUpgradeOffer(rng, owned, wave, hpFrac, count, boss, exclude = [], weapon = null) {
  let pool = upgradeList.filter(
      (upgrade) =>
        !(
          upgrade.evo ||
          deadForWeapon(upgrade.id, weapon, owned) ||
          (owned[upgrade.id] || 0) >= upgrade.max ||
          (upgrade.id === "heal" && hpFrac > 0.7) ||
          (boss && upgrade.rarity < 2)
        ),
    ),
    weightOf = (upgrade) => {
      let weight = (boss ? bossRarityWeights : rarityWeights)[upgrade.rarity];
      if (!boss) {
        if (upgrade.rarity === 3) {
          weight += wave * 0.35;
        }
        if (upgrade.rarity === 4) {
          weight += wave * 0.15;
        }
      }
      if (upgrade.id === "heal") {
        weight *= hpFrac < 0.35 ? 3 : 1.2;
      }
      if (exclude.includes(upgrade.id)) {
        weight *= 0.05;
      }
      return weight / Math.max(1, countRarity(pool, upgrade.rarity));
    },
    picks = [],
    evos = upgradeList.filter(
      (upgrade) =>
        upgrade.evo &&
        !owned[upgrade.id] &&
        (!upgrade.weapon || upgrade.weapon === weapon) &&
        Object.entries(upgrade.evo).every(([id, need]) => (owned[id] || 0) >= need),
    );
  if (evos.length) {
    picks.push(evos[Math.floor(rng.next() * evos.length)].id);
  }
  let left = pool.slice();
  for (; picks.length < count && left.length; ) {
    let total = 0;
    for (let upgrade of left) total += weightOf(upgrade);
    let roll = rng.next() * total,
      pick = left[left.length - 1];
    for (let upgrade of left) {
      roll -= weightOf(upgrade);
      if (roll <= 0) {
        pick = upgrade;
        break;
      }
    }
    picks.push(pick.id);
    left.splice(left.indexOf(pick), 1);
  }
  // 2.8.0: never an offer of only common cards: the last card becomes a rare or better one
  if (!boss && picks.length > 1 && picks.every((id) => upgradeList.find((upgrade) => upgrade.id === id).rarity < 2)) {
    let better = left.filter((upgrade) => upgrade.rarity >= 2),
      total = 0;
    for (let upgrade of better) total += weightOf(upgrade);
    if (better.length) {
      let roll = rng.next() * total,
        pick = better[better.length - 1];
      for (let upgrade of better) {
        roll -= weightOf(upgrade);
        if (roll <= 0) {
          pick = upgrade;
          break;
        }
      }
      picks[picks.length - 1] = pick.id;
    }
  }
  return picks;
}
function countRarity(list, rarity) {
  let count = 0;
  for (let upgrade of list) {
    if (upgrade.rarity === rarity) {
      count++;
    }
  }
  return count;
}
const spawnWeights = {
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
function waveBudget(wave, tm) {
  return (16 + 8 * wave + 0.3 * wave * wave) * tm.budget;
}
function planWave(rng, wave, tm, boss, plan = {}) {
  // 2.4.0: the biome's enemy mix (set by World.startWave) multiplies the spawn weights (events keep
  // theirs on top). 2.5.0 C: signature enemies, the ones the mix favours (weight >= 1), can spawn
  // from the biome's first wave at half their weight until their own wave (see rlEnemyFrom).
  const mix = RL_BIOME_MIX_CUR;
  let early = [],
    saved = [];
  if (mix) {
    early = Object.keys(mix).filter((id) => mix[id] >= 1 && enemyDefs[id] && enemyDefs[id].from > wave);
    const weights = { ...(plan.weights || {}) };
    if (early.length) {
      saved = early.map((id) => enemyDefs[id].from);
      for (const id of early) weights[id] = (weights[id] || 1) * RL_EARLY_WEIGHT_250;
    }
    for (const [id, mul] of Object.entries(mix)) weights[id] = (weights[id] || 1) * mul;
    plan = { ...plan, weights };
  }
  try {
    const start = rlBiomeStart(wave);
    for (const id of early) enemyDefs[id].from = start;
    let budget = waveBudget(wave, tm) * (boss ? 0.22 : 1) * (plan.budget || 1),
      types = enemyOrder.filter((type) => enemyDefs[type].from <= wave && (!boss || !heavyEnemies[type])),
      caps = {
        hive: 1 + Math.floor(wave / 8),
        brute: 2 + Math.floor(wave / 4),
        sniper: 2 + Math.floor(wave / 4),
        splitter: 3 + Math.floor(wave / 3),
        bulwark: 1 + Math.floor(wave / 6),
        mortar: 1 + Math.floor(wave / 6),
        striker: 2 + Math.floor(wave / 5),
        mender: 1 + Math.floor(wave / 10),
        leaper: 2 + Math.floor(wave / 5),
        turret: 1 + Math.floor(wave / 8),
        charger: 2 + Math.floor(wave / 6),
        minebot: 2 + Math.floor(wave / 8),
        sapper: 1 + Math.floor(wave / 7),
        phantom: 1 + Math.floor(wave / 8),
        sentinel: 1 + Math.floor(wave / 9),
        carrier: 1 + Math.floor(wave / 10),
        drone: 2 + Math.floor(wave / 6),
        driller: 1 + Math.floor(wave / 8),
        beacon: 1 + Math.floor(wave / 14),
        weaver: 1 + Math.floor(wave / 8),
      },
      counts = {},
      spawns = [],
      eliteChance = plan.elite != null ? plan.elite : wave >= 6 ? 0.035 + 0.006 * wave + tm.elite : 0,
      tries = 0;
    for (; budget >= 1 && tries++ < 500; ) {
      let fits = types.filter((type) => enemyDefs[type].cost <= budget && (counts[type] || 0) < (caps[type] ?? 999));
      if (!fits.length) break;
      let type = weightedPick(
        rng,
        fits,
        fits.map((type) => spawnWeights[type] * ((plan.weights && plan.weights[type]) || 1)),
      );
      counts[type] = (counts[type] || 0) + 1;
      budget -= enemyDefs[type].cost;
      spawns.push({ type: type, elite: type !== "swarmer" && rng.chance(eliteChance) });
    }
    for (let i = spawns.length - 1; i > 0; i--) {
      let j = Math.floor(rng.next() * (i + 1));
      [spawns[i], spawns[j]] = [spawns[j], spawns[i]];
    }
    let quarter = Math.floor(spawns.length / 4),
      head = spawns.slice(0, quarter),
      tail = spawns.slice(quarter),
      heavyHead = head.filter((spawn) => heavyEnemies[spawn.type] || spawn.elite),
      order = head.filter((spawn) => !(heavyEnemies[spawn.type] || spawn.elite)).concat(tail, heavyHead),
      groups = [],
      groupSize = clamp(4 + Math.floor(wave / 2.5), 4, 12),
      gap = boss ? 7 : Math.max(1.6, 3.2 - wave * 0.06),
      next = 0;
    for (; next < order.length; ) {
      let size = groupSize + rng.int(-1, 1),
        members = [],
        weight = 0;
      for (; next < order.length && weight < size; ) {
        let spawn = order[next++];
        members.push(spawn);
        weight += spawn.type === "swarmer" ? 0.5 : 1;
      }
      groups.push({ gap: gap * rng.range(0.85, 1.15), members: members });
    }
    return groups;
  } finally {
    early.forEach((id, k) => (enemyDefs[id].from = saved[k]));
  }
}
// Enemy mix: World.startWave sets the biome's mix while it builds the wave plan with planWave; the
// biome's weights multiply the spawn weights of the plan (events keep theirs on top).
let RL_BIOME_MIX_CUR = null;
// assigned from other modules (an imported binding cannot be assigned)
function set_RL_BIOME_MIX_CUR(mix) {
  return (RL_BIOME_MIX_CUR = mix);
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
const RL_BIOME_EVENT = { works: "meltdown", vault: "whiteout", marsh: "bloom", void: "riftstorm" };
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
