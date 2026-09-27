// Biome tables, palettes and the per-run biome route.

/* ---- biome palettes (2.3.1). The 2.0–2.2 biome packs shipped scrambled
 colours (neon-green floors, bright fog, clashing grids), so a wave looked
 like several biomes mixed together. Every biome now follows one rule set:
 dark floor/fog/ground in the biome hue, a bright grid, a contrasting accent,
 a mid-bright sky and a dark wall tone. rlPaletteIssues() enforces it. ---- */
/* 2.3.3: grid colours re-spread so every biome is recognisable at a glance —
 in 2.3.1 Tempest/Aurora looked like Neon Yard (ΔE 6–20) and Catacombs like Requiem.
 Minimum grid distance between any two of the 19 biomes is now ΔE ≥ 30 (checked by
 rlBiomeDistinct in the deep test). Floor/fog/walls/light take the grid's hue. */
var RL_PALETTES = {
  vault: {
    floor: 0x0e1718,
    grid: 0xbfdfe3,
    accent: 0x5cc8ff,
    fog: 0x080e0f,
    sky: 0x476c70,
    ground: 0x0a1112,
    wall: 0x1c2a2c,
  },
};
function rlApplyBiomeFixes() {
  for (const [id, p] of Object.entries(RL_PALETTES)) biomesById[id] && Object.assign(biomesById[id], p);
}

/* ---- one hazard theme per biome (2.3.1). The wave director used to drop a
 rotating vent/ice/acid pool into EVERY biome, so lava vents appeared in the
 Cryo Vault and ice in Ember Works. Each biome now owns one hazard type. ---- */
var RL_BIOME_HAZARD = {
  yard: "",
  works: "vents",
  vault: "ice",
  void: "portals",
  marsh: "acid",
};
var biomeList = [
  {
    id: "yard",
    name: "Neon Yard",
    W: 18,
    H: 18,
    floor: 659746,
    grid: 2017535,
    accent: 16727423,
    fog: 395798,
    sky: 2771594,
    ground: 657944,
    wall: 1385016,
    obstacles: [
      { t: "c", x: -7, y: -7, r: 1.3 },
      { t: "c", x: 7, y: -7, r: 1.3 },
      { t: "c", x: -7, y: 7, r: 1.3 },
      { t: "c", x: 7, y: 7, r: 1.3 },
    ],
  },
  {
    id: "works",
    name: "Ember Works",
    W: 19,
    H: 17,
    floor: 1510153,
    grid: 16742958,
    accent: 16760906,
    fog: 1049860,
    sky: 9058848,
    ground: 1181702,
    wall: 2757648,
    obstacles: [
      { t: "b", x: 0, y: -7, w: 4, h: 0.8 },
      { t: "b", x: 0, y: 7, w: 4, h: 0.8 },
      { t: "c", x: -11, y: 0, r: 1.5 },
      { t: "c", x: 11, y: 0, r: 1.5 },
    ],
  },
  {
    id: "vault",
    name: "Cryo Vault",
    W: 18,
    H: 18,
    floor: 398361,
    grid: 9431295,
    accent: 15268863,
    fog: 266266,
    sky: 4885160,
    ground: 397336,
    wall: 993846,
    obstacles: [
      { t: "b", x: -9, y: 0, w: 0.8, h: 3 },
      { t: "b", x: 9, y: 0, w: 0.8, h: 3 },
      { t: "c", x: 0, y: -9.5, r: 1.4 },
      { t: "c", x: 0, y: 9.5, r: 1.4 },
    ],
  },
  {
    id: "void",
    name: "Void Core",
    W: 17,
    H: 17,
    floor: 854040,
    grid: 10771711,
    accent: 16732120,
    fog: 459791,
    sky: 4860554,
    ground: 525583,
    wall: 1970742,
    obstacles: [
      { t: "c", x: -10, y: -10, r: 1.2 },
      { t: "c", x: 10, y: -10, r: 1.2 },
      { t: "c", x: -10, y: 10, r: 1.2 },
      { t: "c", x: 10, y: 10, r: 1.2 },
    ],
  },
  {
    id: "marsh",
    name: "Toxin Marsh",
    W: 18,
    H: 17,
    floor: 529420,
    grid: 8257370,
    accent: 13958973,
    fog: 265222,
    sky: 3828266,
    ground: 397320,
    wall: 1320474,
    obstacles: [
      { t: "c", x: -8, y: -6, r: 1.4 },
      { t: "c", x: 8, y: 6, r: 1.4 },
      { t: "b", x: 8, y: -7, w: 1.6, h: 0.8 },
      { t: "b", x: -8, y: 7, w: 1.6, h: 0.8 },
    ],
  },
];
var biomesById = Object.fromEntries(biomeList.map((i) => [i.id, i]));
function planBiomeRoute(i) {
  let t = biomeList.slice(1).map((e) => e.id);
  for (let e = t.length - 1; e > 0; e--) {
    let n = Math.floor(i.next() * (e + 1));
    [t[e], t[n]] = [t[n], t[e]];
  }
  return ["yard", ...t];
}

/* 2.4.0: 19 biomes → 5, and the biome changes after every boss again (it changed every wave
 since 2.1). Waves 1–5 are always Neon Yard; the other four follow in a seeded order, one per
 boss cycle, so a 20-wave run shows four biomes and Endless reaches the fifth at wave 21.
 Each biome plays differently, not only in colour:
   Neon Yard    open ground, no hazard, the standard enemy mix
   Ember Works  lava vents; heavy and explosive enemies (brute, bomber, charger, minebot …)
   Cryo Vault   the whole floor is slick (you drift), ice sheets are slicker; shielded and
                ranged enemies (bulwark, sniper, turret, sentinel …)
   Toxin Marsh  acid pools, thick fog; swarms (splitter, hive, swarmer, sapper …)
   Void Core    portal pairs; fast and teleporting enemies (striker, phantom, weaver …)
 The look of each biome (floor, props, border, particles, light) is in the renderer part of
 2.4.0 further down. */
var RL_BIOME_INFO = {
  yard: { tag: "Open ground" },
  works: {
    tag: "Lava vents",
    mix: { brute: 2.2, bomber: 2.2, charger: 2, mortar: 1.6, minebot: 1.8, driller: 1.6, swarmer: 0.6 },
  },
  vault: {
    tag: "Slick floor",
    grip: 6.5,
    mix: { bulwark: 2.2, sniper: 2, gunner: 1.8, turret: 2, sentinel: 1.8, swarmer: 0.6, splitter: 0.6 },
  },
  marsh: {
    tag: "Acid pools",
    mix: { swarmer: 1.6, splitter: 2.4, hive: 2.2, mender: 1.8, sapper: 1.8, carrier: 1.5, gunner: 0.6 },
  },
  void: {
    tag: "Portals",
    mix: { striker: 2.2, phantom: 2.4, weaver: 2.2, leaper: 1.8, drone: 1.8, sniper: 0.6 },
  },
};
for (const [id, info] of Object.entries(RL_BIOME_INFO))
  biomesById[id] && ((biomesById[id].tag = info.tag), info.grip && (biomesById[id].grip = info.grip));

export { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, planBiomeRoute, biomeList, rlApplyBiomeFixes };
