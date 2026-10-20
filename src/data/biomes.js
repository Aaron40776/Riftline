// Biome tables, palettes and the per-run biome route.

/* ---- one hazard theme per biome (2.3.1). The wave director used to drop a
 rotating vent/ice/acid pool into EVERY biome, so lava vents appeared in the
 Cryo Vault and ice in Ember Works. Each biome now owns one hazard type. ---- */
const RL_BIOME_HAZARD = {
  // 3.4.0: Blackout City's live manholes are vents with an electric skin (they arc instead of erupting)
  yard: "vents",
  vault: "ice",
  void: "portals",
  marsh: "acid",
  // 3.49.0: the Ashfall Caldera: fumaroles - vents with a molten skin (they jet white-hot rock
  // between the spires). The id stays "club" for saves and records, like the Yard in 3.4.0.
  club: "vents",
};
const biomeList = [
  {
    // 3.4.0: Blackout City replaces the Neon Yard (the id stays "yard" for saves and records): a city street at
    // night in a power cut. Wet black asphalt, worn yellow road markings, emergency red, a cold moonlit sky.
    id: "yard",
    name: "Blackout City",
    W: 18,
    H: 18,
    floor: 0x0c0d10,
    grid: 0xe6cf7a,
    accent: 0xff3346,
    fog: 0x07080b,
    sky: 0x3a404e,
    ground: 0x0a0b0e,
    wall: 0x1d1f25,
    obstacles: [
      { t: "c", x: -7, y: -7, r: 1.3 },
      { t: "c", x: 7, y: -7, r: 1.3 },
      { t: "c", x: -7, y: 7, r: 1.3 },
      { t: "c", x: 7, y: 7, r: 1.3 },
    ],
  },
  {
    id: "vault",
    name: "Cryo Vault",
    W: 18,
    H: 18,
    // 2.3.3: the palette that keeps every biome recognisable at a glance (grid ΔE ≥ 30 to any other biome, checked
    // by rlBiomeDistinct in the deep test); until 3.32.0 main.js patched it in at start-up
    floor: 0x0e1718,
    grid: 0xbfdfe3,
    accent: 0x5cc8ff,
    fog: 0x080e0f,
    sky: 0x476c70,
    ground: 0x0a1112,
    wall: 0x1c2a2c,
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
    // 3.49.0: the Ashfall Caldera takes the Ember Works' place as the one fire biome (it inherited the
    // sixth slot from the unreleased Onyx Club; the id stays "club" for saves and records, like the Yard
    // in 3.4.0): the floor of a volcano - charred basalt plates split by molten seams, obsidian spires,
    // falling ash and a sky the colour of a banked fire. The palette keeps the rule: the molten amber
    // grid reads against every other grid (min CIE76 dE 37 to the City's yellow).
    id: "club",
    name: "Ashfall Caldera",
    W: 18,
    H: 18,
    // the base is neutral charcoal so the only warm thing on the field is the molten light itself
    floor: 0x121112,
    grid: 0xffb520,
    accent: 0xffe19a,
    fog: 0x0c0a0b,
    sky: 0x4c1f14,
    ground: 0x0e0c0d,
    wall: 0x241a18,
    obstacles: [
      { t: "b", x: 0, y: -7.6, w: 2.6, h: 0.8 },
      { t: "c", x: -6.5, y: 6.5, r: 1.2 },
      { t: "c", x: 6.5, y: 6.5, r: 1.2 },
      { t: "c", x: -6.5, y: -3, r: 1.1 },
      { t: "c", x: 6.5, y: -3, r: 1.1 },
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
const biomesById = Object.fromEntries(biomeList.map((biome) => [biome.id, biome]));
// 2.4.6: Void Core is always the fourth biome (waves 16–20), so the Rift Core stays the final
// boss. Cryo Vault, Toxin Marsh and the Ashfall Caldera are shuffled: two of them in waves 6–15,
// the third from wave 21 in Endless.
function planBiomeRoute(rng) {
  let ids = biomeList
    .slice(1)
    .map((biome) => biome.id)
    .filter((id) => id !== "void");
  for (let i = ids.length - 1; i > 0; i--) {
    let j = Math.floor(rng.next() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ["yard", ids[0], ids[1], "void", ...ids.slice(2)];
}

/* 2.4.0: 19 biomes → 5 (3.47.0: 6, 3.49.0: 5 again - the Ember Works retires, the Ashfall Caldera
 is the one fire place), and the biome changes after every boss again (it changed every wave
 since 2.1). Waves 1–5 are always Blackout City (the Neon Yard until 3.4.0); the others follow in a seeded order, one per
 boss cycle, so a 20-wave run shows four biomes and Endless reaches the fifth at wave 21.
 Each biome plays differently, not only in colour:
   Blackout City live manholes that arc (3.4.0, was the Neon Yard: open ground); armed gangs (gunner)
   Ashfall Caldera  fumaroles that jet molten rock (3.49.0, takes the Ember Works' fire place; the
                foundry's heavy crews joined it); the burning dead in armour (gunner, brute, bomber, mortar …)
   Cryo Vault   the whole floor is slick (you drift), ice sheets are slicker; shielded and
                ranged enemies (bulwark, sniper, turret, sentinel …)
   Toxin Marsh  acid pools, thick fog; swarms (splitter, hive, swarmer, sapper …)
   Void Core    portal pairs; fast and teleporting enemies (striker, phantom, weaver …)
 The look of each biome (floor, props, border, particles, light) is in the renderer part of
 2.4.0 further down. */
const RL_BIOME_INFO = {
  yard: { tag: "Live manholes", mix: { gunner: 2.2, bomber: 1.8, grunt: 1.5, swarmer: 0.6 } },
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
  // 3.49.0: the Caldera: ash-shrouded burners (gunner), slag brutes (brute), ember carriers (bomber),
  // scorched runners (charger), the powder boys (sapper) - and the foundry's heavy crews that came
  // over with the Ember Works' retirement, so the mortar, minebot and driller keep a home
  club: {
    tag: "Magma vents",
    mix: {
      gunner: 2.2,
      brute: 2,
      bomber: 1.8,
      charger: 1.4,
      mortar: 1.6,
      minebot: 1.4,
      driller: 1.2,
      sapper: 1.2,
      swarmer: 0.6,
    },
  },
};
for (const [id, info] of Object.entries(RL_BIOME_INFO)) {
  if (biomesById[id]) {
    biomesById[id].tag = info.tag;
    if (info.grip) {
      biomesById[id].grip = info.grip;
    }
  }
}

export { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, planBiomeRoute, biomeList };
