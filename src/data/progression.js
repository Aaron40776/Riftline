// Workshop modules, milestones, threat levels and the retired-weapon table.

import { biomeList } from "./biomes.js";
import { weaponOrder } from "./weapons.js";

var threatLevels = [
  { lvl: 0, name: "Standard", desc: "The rift as it is." },
  { lvl: 1, name: "Threat I", desc: "Enemies +25% health, +12% damage." },
  { lvl: 2, name: "Threat II", desc: "More elites, denser waves." },
  { lvl: 3, name: "Threat III", desc: "Bosses hit harder and faster." },
  { lvl: 4, name: "Threat IV", desc: "Only for tuned builds." },
  { lvl: 5, name: "Threat V", desc: "The breach at full strength." },
];
var threatMods = (i) => ({
  hp: 1 + 0.25 * i,
  dmg: 1 + 0.12 * i,
  budget: 1 + 0.1 * i,
  elite: 0.05 * i,
  shards: 1 + 0.25 * i,
  boss: 1 + 0.3 * i,
});
var workshopModules = [
  {
    id: "hull",
    name: "Hull Plating",
    icon: "shield",
    desc: "+10 max HP per level",
    costs: [60, 120, 200, 320, 480],
  },
  { id: "power", name: "Power Core", icon: "burst", desc: "+5% damage per level", costs: [80, 160, 260, 400, 600] },
  { id: "thrust", name: "Thrusters", icon: "wing", desc: "+4% move speed per level", costs: [60, 130, 220, 340] },
  {
    id: "dash",
    name: "Dash Capacitor",
    icon: "clock",
    desc: "-8% dash cooldown per level",
    costs: [50, 110, 190, 300],
  },
  { id: "magnet", name: "Magnet Coil", icon: "magnet", desc: "+20% pickup radius per level", costs: [40, 90, 160] },
  {
    id: "salvage",
    name: "Salvager",
    icon: "shard",
    desc: "+10% shards per level",
    costs: [100, 200, 320, 480, 700],
  },
  { id: "reroll", name: "Reroll Chip", icon: "reroll", desc: "+1 upgrade reroll per run", costs: [150, 300, 500] },
  { id: "nova", name: "Nova Cell", icon: "star", desc: "Start each wave with +25% Nova charge", costs: [120, 260] },
  {
    id: "insight",
    name: "Insight Module",
    icon: "eye",
    desc: "Choose from 4 upgrades instead of 3",
    costs: [1200],
  },
  { id: "revive", name: "Second Life", icon: "heart", desc: "Revive once per run at 50% HP", costs: [900] },
];
var modulesById = Object.fromEntries(workshopModules.map((i) => [i.id, i]));
var milestones = [
  {
    id: "kills100",
    name: "First Contact",
    desc: "Destroy 100 enemies",
    reward: 50,
    test: (i) => i.stats.kills >= 100,
  },
  { id: "wave5", name: "Holding the Line", desc: "Reach wave 5", reward: 40, test: (i) => i.stats.bestWave >= 5 },
  {
    id: "warden",
    name: "Gate Crasher",
    desc: "Defeat the Warden",
    reward: 100,
    test: (i) => (i.stats.bosses.warden || 0) > 0,
  },
  {
    id: "queen",
    name: "Regicide",
    desc: "Defeat the Hive Queen",
    reward: 150,
    test: (i) => (i.stats.bosses.queen || 0) > 0,
  },
  {
    id: "prism",
    name: "Icebreaker", // 2.4.6: was "Shattered Light" / "Defeat Prism"
    desc: "Defeat the Frost Prism",
    reward: 200,
    test: (i) => (i.stats.bosses.prism || 0) > 0,
  },
  // 2.4.6: the Crucible, boss of Ember Works
  {
    id: "forge",
    name: "Quenched",
    desc: "Defeat the Crucible",
    reward: 175,
    test: (i) => (i.stats.bosses.forge || 0) > 0,
  },
  { id: "clear", name: "Rift Sealed", desc: "Clear all 20 waves", reward: 400, test: (i) => i.stats.clears > 0 },
  {
    id: "legend",
    name: "Lucky Find",
    desc: "Pick a Legendary upgrade",
    reward: 80,
    test: (i) => i.stats.legendaries > 0,
  },
  {
    id: "flawless",
    name: "Untouchable",
    desc: "Clear wave 8 or later without taking damage",
    reward: 150,
    test: (i) => i.stats.flawless > 0,
  },
  {
    id: "kills2500",
    name: "Exterminator",
    desc: "Destroy 2,500 enemies",
    reward: 200,
    test: (i) => i.stats.kills >= 2500,
  },
  {
    id: "arsenal",
    name: "Full Arsenal",
    desc: "Unlock every weapon",
    reward: 200,
    test: (i) => weaponOrder.every((t) => i.weapons[t]),
  },
  {
    id: "maxed",
    name: "Fine Tuned",
    desc: "Max out one workshop module",
    reward: 100,
    test: (i) => workshopModules.some((t) => (i.workshop[t.id] || 0) >= t.costs.length),
  },
  {
    id: "threat2",
    name: "Heat Seeker",
    desc: "Clear a run on Threat II",
    reward: 400,
    test: (i) => i.stats.bestClearThreat >= 2,
  },
  { id: "wave30", name: "Endless Echo", desc: "Reach wave 30", reward: 500, test: (i) => i.stats.bestWave >= 30 },
  {
    id: "allweapons",
    name: "Master of Arms",
    desc: "Clear a run with every weapon",
    reward: 800,
    test: (i) => weaponOrder.every((t) => (i.stats.clearsBy[t] || 0) > 0),
  },
  {
    id: "threat5",
    name: "Breach Breaker",
    desc: "Clear a run on Threat V",
    reward: 1500,
    test: (i) => i.stats.bestClearThreat >= 5,
  },
  {
    id: "evolve",
    name: "Evolution",
    desc: "Evolve two upgrades into one",
    reward: 150,
    test: (i) => i.stats.evolved > 0,
  },
  {
    id: "combo50",
    name: "Chain Reaction",
    desc: "Reach a \xD750 kill combo",
    reward: 150,
    test: (i) => i.stats.bestCombo >= 50,
  },
  {
    id: "combo150",
    name: "Unstoppable",
    desc: "Reach a \xD7150 kill combo",
    reward: 400,
    test: (i) => i.stats.bestCombo >= 150,
  },
  {
    id: "kills5000",
    name: "Rift Sweeper",
    desc: "Destroy 5,000 enemies",
    reward: 350,
    test: (i) => i.stats.kills >= 5000,
  },
  { id: "wave50", name: "Deep Breach", desc: "Reach wave 50", reward: 700, test: (i) => i.stats.bestWave >= 50 },
  {
    id: "bosses10",
    name: "Boss Hunter",
    desc: "Defeat 10 bosses total",
    reward: 500,
    test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 10,
  },
  {
    id: "combo300",
    name: "Cascade",
    desc: "Reach a \xD7300 kill combo",
    reward: 650,
    test: (i) => i.stats.bestCombo >= 300,
  },
  { id: "clears5", name: "Veteran", desc: "Seal the Rift 5 times", reward: 450, test: (i) => i.stats.clears >= 5 },
  {
    id: "evolve3",
    name: "Master Crafter",
    desc: "Evolve upgrades 3 times",
    reward: 450,
    test: (i) => i.stats.evolved >= 3,
  },
  {
    id: "kills10000",
    name: "World Eater",
    desc: "Destroy 10,000 enemies",
    reward: 900,
    test: (i) => i.stats.kills >= 10000,
  },
  { id: "wave75", name: "Abyss Walker", desc: "Reach wave 75", reward: 1000, test: (i) => i.stats.bestWave >= 75 },
  {
    id: "combo500",
    name: "Riftstorm",
    desc: "Reach a ×500 kill combo",
    reward: 1000,
    test: (i) => i.stats.bestCombo >= 500,
  },
  {
    id: "bosses25",
    name: "Apex Hunter",
    desc: "Defeat 25 bosses total",
    reward: 1200,
    test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 25,
  },
];
workshopModules.push(
  // 2.3.5: Armor Core reduces enemy damage (it gave +8 max HP, next to Hull Plating's +10)
  {
    id: "armorCore",
    name: "Armor Core",
    icon: "shield",
    desc: "-4% damage from enemies per level",
    costs: [220, 420, 760, 1180],
  },
  {
    id: "riftBattery",
    name: "Rift Battery",
    icon: "star",
    desc: "Start each wave with +10% Nova charge",
    costs: [260, 540, 980],
  },
  { id: "droneBay", name: "Drone Bay", icon: "drone", desc: "+1 Wingman slot per level", costs: [950, 1800] },
);
modulesById = Object.fromEntries(workshopModules.map((i) => [i.id, i]));
milestones.push(
  {
    id: "wave100",
    name: "Endless Horizon",
    desc: "Reach wave 100",
    reward: 1600,
    test: (i) => i.stats.bestWave >= 100,
  },
  {
    id: "kills25000",
    name: "Planet Breaker",
    desc: "Destroy 25,000 enemies",
    reward: 1800,
    test: (i) => i.stats.kills >= 25000,
  },
  {
    id: "bosses50",
    name: "Apex Protocol",
    desc: "Defeat 50 bosses total",
    reward: 1800,
    test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 50,
  },
  {
    id: "allbiomes",
    name: "World Walker",
    // 2.4.0: the biome changes after every boss, so wave 21 is the first wave of the fifth biome
    desc: "Reach wave 21 \u2014 every biome of the rift in one run",
    reward: 1100,
    test: (i) => i.stats.bestWave >= 5 * (biomeList.length - 1) + 1,
  },
  {
    id: "weaponClear10",
    name: "Full Spectrum",
    // 2.4.0: 7 weapons left (was 10 of 21)
    desc: "Clear runs with at least 4 different weapons",
    reward: 600,
    test: (i) => Object.values(i.stats.clearsBy).filter((v) => v > 0).length >= 4,
  },
  {
    id: "combo750",
    name: "Event Horizon",
    desc: "Reach a ×750 kill combo",
    reward: 1600,
    test: (i) => i.stats.bestCombo >= 750,
  },
);
workshopModules.push(
  // 2.3.5: Arsenal Lab raises the fire rate (it gave +5% damage, the same as Power Core)
  { id: "arsenalLab", name: "Arsenal Lab", icon: "burst", desc: "+6% fire rate per level", costs: [1800, 3600, 6500] },
  {
    id: "fieldSupply",
    name: "Field Supply",
    icon: "shard",
    desc: "+1 supply cache per wave per level (from wave 2, not in boss waves)",
    costs: [1400, 3000, 5200],
  },
  {
    id: "hazardSeal",
    name: "Hazard Seal",
    icon: "shield",
    desc: "-15% map hazard damage per level",
    costs: [1200, 2500, 4500],
  },
);
modulesById = Object.fromEntries(workshopModules.map((i) => [i.id, i]));
milestones.push(
  { id: "wave125", name: "Deep Horizon", desc: "Reach wave 125", reward: 1200, test: (i) => i.stats.bestWave >= 125 },
  { id: "wave150", name: "Far Breach", desc: "Reach wave 150", reward: 1600, test: (i) => i.stats.bestWave >= 150 },
  {
    id: "bosses100",
    name: "Apex Archive",
    desc: "Defeat 100 bosses total",
    reward: 2200,
    test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 100,
  },
  {
    id: "shards100k",
    name: "Shard Tycoon",
    desc: "Earn 100,000 total shards",
    reward: 2500,
    test: (i) => i.stats.shardsEarned >= 100000,
  },
  {
    id: "evolve10",
    name: "Evolution Engine",
    desc: "Evolve 10 times",
    reward: 1200,
    test: (i) => i.stats.evolved >= 10,
  },
);
workshopModules.push(
  {
    id: "routeScanner",
    name: "Route Scanner",
    icon: "map",
    desc: "+50% shards from supply caches per level",
    costs: [1800, 3800, 6800],
  },
  {
    id: "reactorCore",
    name: "Reactor Core",
    icon: "star",
    desc: "Start each wave with +5% Nova charge",
    costs: [1600, 3400, 6200],
  },
);
modulesById = Object.fromEntries(workshopModules.map((i) => [i.id, i]));
milestones.push(
  { id: "wave175", name: "Deep End", desc: "Reach wave 175", reward: 2200, test: (i) => i.stats.bestWave >= 175 },
  {
    id: "wave200",
    name: "Beyond the Rim",
    desc: "Reach wave 200",
    reward: 2800,
    test: (i) => i.stats.bestWave >= 200,
  },
  {
    id: "kills50000",
    name: "Graveyard Shift",
    desc: "Destroy 50,000 enemies",
    reward: 2600,
    test: (i) => i.stats.kills >= 50000,
  },
  {
    id: "bosses150",
    name: "Boss Archive",
    desc: "Defeat 150 bosses total",
    reward: 3200,
    test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 150,
  },
  {
    id: "shards250k",
    name: "Shard Industry",
    desc: "Earn 250,000 total shards",
    reward: 3500,
    test: (i) => i.stats.shardsEarned >= 250000,
  },
  {
    id: "evolve20",
    name: "Evolution Master",
    desc: "Evolve 20 times",
    reward: 2200,
    test: (i) => i.stats.evolved >= 20,
  },
  {
    id: "combo1000",
    name: "Singularity",
    desc: "Reach a ×1000 kill combo",
    reward: 2400,
    test: (i) => i.stats.bestCombo >= 1000,
  },
);

/* ==========================================================================
   RIFTLINE 2.4.0 — fewer biomes and weapons, each clearly different
   ========================================================================== */
/* 2.4.0: 21 weapons → the 7 originals. The 14 weapons of the 2.0–2.2 packs were parameter
 variants of those (Void Lance, Sunlance and Ember Rail were Railguns, Razor Loop and Cyclone
 Blades Disc Launchers …). A save that owned one gets the weapon it was a variant of, plus the
 price difference in shards — or the full price when it owns that weapon already. */
var RL_RETIRED_WEAPONS = {
  ion: { name: "Ion Repeater", cost: 1250, to: "tesla" },
  gravity: { name: "Graviton Core", cost: 1550, to: "rocket" },
  voidlance: { name: "Void Lance", cost: 1950, to: "rail" },
  bloom: { name: "Nova Bloom", cost: 2400, to: "rocket" },
  volley: { name: "Volley", cost: 1450, to: "scatter" },
  prismcannon: { name: "Prism Cannon", cost: 1750, to: "tesla" },
  sunlance: { name: "Sunlance", cost: 2200, to: "rail" },
  vortex: { name: "Vortex", cost: 2450, to: "rocket" },
  razorloop: { name: "Razor Loop", cost: 2050, to: "disc" },
  needle: { name: "Needle Array", cost: 1200, to: "pulse" },
  lattice: { name: "Lattice Array", cost: 2850, to: "tesla" },
  quasar: { name: "Quasar Driver", cost: 3300, to: "rocket" },
  cyclone: { name: "Cyclone Blades", cost: 3050, to: "disc" },
  emberrail: { name: "Ember Rail", cost: 3900, to: "rail" },
};
const rlRetired = (id) =>
  typeof id === "string" && Object.prototype.hasOwnProperty.call(RL_RETIRED_WEAPONS, id)
    ? RL_RETIRED_WEAPONS[id]
    : null;

export { threatMods, RL_RETIRED_WEAPONS, milestones, workshopModules, modulesById, rlRetired, threatLevels };
