// 3.3.0: Endless mutators. From wave 21 on, every tenth wave (21, 31, 41 …) the rift gains a mutator that stays for
// the rest of the run; the order is shuffled per run (seed). Once all six are in play, every further tenth wave
// raises one of them a level (up to level 3). Each mutator works through things the player already knows (the elite
// affixes, traps, enemy shots), so it is seen and heard: a volatile enemy glows and bursts with a telegraph, a
// shielded one carries the shield bubble.

import { makeRng, hashString } from "./util.js";

const MUTATORS = {
    volatile: { name: "Volatile", desc: "Enemies may burst when they die", color: "#ff6a3a" },
    shielded: { name: "Shielded", desc: "Enemies may carry an energy shield", color: "#7fd8ff" },
    hasted: { name: "Hasted", desc: "Enemies move faster", color: "#ffd84a" },
    armored: { name: "Armored", desc: "Enemies have more hull", color: "#c9c2b8" },
    barrage: { name: "Barrage", desc: "Enemy shots fly faster and hit harder", color: "#ff5ab4" },
    trapstorm: { name: "Trap Storm", desc: "More traps, and they strike sooner", color: "#b4ff3d" },
  },
  MUTATOR_IDS = Object.keys(MUTATORS),
  MUTATOR_FROM = 21,
  MUTATOR_EVERY = 10,
  MUTATOR_MAX_LEVEL = 3;

/* the mutators in play at `wave` ({ id: level }) and the one gained or raised at exactly this wave (or null) */
function rlMutatorsFor(seed, wave) {
  const mods = {};
  if (wave < MUTATOR_FROM) return { mods, gained: null };
  const order = MUTATOR_IDS.slice(),
    rng = makeRng(hashString(seed + ":mutators"));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const steps = Math.floor((wave - MUTATOR_FROM) / MUTATOR_EVERY) + 1;
  let gained = null;
  for (let n = 0; n < steps; n++) {
    let id;
    if (n < order.length) id = order[n];
    else {
      const open = order.filter((m) => mods[m] < MUTATOR_MAX_LEVEL);
      if (!open.length) break;
      id = open[Math.floor(makeRng(hashString(seed + ":mutator-level:" + n)).next() * open.length)];
    }
    mods[id] = (mods[id] || 0) + 1;
    if (n === steps - 1 && (wave - MUTATOR_FROM) % MUTATOR_EVERY === 0) gained = id;
  }
  return { mods, gained };
}

export { MUTATORS, MUTATOR_IDS, MUTATOR_FROM, MUTATOR_EVERY, MUTATOR_MAX_LEVEL, rlMutatorsFor };
