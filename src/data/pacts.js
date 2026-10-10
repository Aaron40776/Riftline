// 3.27.0: pacts. Before a run the pilot may sign up to two pacts: each makes the run harder in one way and pays more
// shards at the end (the bonuses add up). They are optional, work with every weapon and threat level, and are not part of
// the Daily Rift (the same drone for everyone). The drone's side of a pact is read in computeStats (the ws key
// pact_<id>, set by the World), the enemies' side in applyPactsToThreat, the payout in pactBonus.
import { own } from "../core/util.js";

const PACT_MAX = 2;
const PACTS = [
  {
    id: "glass",
    name: "Glass Cannon",
    icon: "burst",
    desc: "Hull -40%, damage +30%",
    shards: 0.2,
  },
  {
    id: "swarm",
    name: "Swarm Pact",
    icon: "skull",
    desc: "35% more enemies in every wave",
    shards: 0.2,
  },
  {
    id: "ironhide",
    name: "Iron Hide",
    icon: "shield",
    desc: "Enemies have 30% more health (bosses keep theirs)",
    shards: 0.2,
  },
  {
    id: "hunt",
    name: "Elite Hunt",
    icon: "star",
    desc: "Many more elite enemies (+12% chance)",
    shards: 0.25,
  },
  {
    id: "sluggish",
    name: "Heavy Drive",
    icon: "clock",
    desc: "Move speed -10%, dash cooldown +40%",
    shards: 0.15,
  },
];
const pactsById = Object.fromEntries(PACTS.map((pact) => [pact.id, pact]));

/* a list of pact ids reduced to the known ones, each once, at most PACT_MAX (anything else is dropped) */
function cleanPacts(raw) {
  const out = [];
  for (const id of Array.isArray(raw) ? raw : [])
    if (own(pactsById, id) && !out.includes(id) && out.length < PACT_MAX) out.push(id);
  return out;
}
/* the extra share of the payout */
const pactBonus = (ids) => cleanPacts(ids).reduce((sum, id) => sum + pactsById[id].shards, 0);
/* the enemies' side: more of them, tougher, more elites (a changed copy of the threat numbers) */
function applyPactsToThreat(tm, ids) {
  const out = { ...tm };
  for (const id of cleanPacts(ids)) {
    if (id === "swarm") out.budget *= 1.35;
    if (id === "ironhide") out.hp *= 1.3;
    if (id === "hunt") out.elite += 0.12;
  }
  return out;
}

export { PACTS, PACT_MAX, pactsById, cleanPacts, pactBonus, applyPactsToThreat };
