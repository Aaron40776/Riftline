// Biome tables, palettes and the per-run biome route.

/* ---- one hazard theme per biome (2.3.1). The wave director used to drop a
 rotating vent/ice/acid pool into EVERY biome, so lava vents appeared in the
 Cryo Vault and ice in Ember Works. Each biome now owns one hazard type. ---- */
const RL_BIOME_HAZARD = {
  // 3.4.0: Blackout City's live manholes are vents with an electric skin (they arc instead of erupting)
  yard: "vents",
  works: "vents",
  vault: "ice",
  void: "portals",
  marsh: "acid",
  // 3.47.0: the Onyx Club's stage pyro: vents with a golden skin (they jet flame between the tables)
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
    // 3.47.0: the Onyx Club: a speakeasy under the city. A checkerboard dance floor, brass and velvet,
    // round cocktail tables, the stage at the head of the room - and the stage pyro that jets gold
    // between the tables. The palette keeps the rule: the rose checker reads against every other grid.
    id: "club",
    name: "Onyx Club",
    W: 18,
    H: 18,
    floor: 0x151014,
    grid: 0xc4586e,
    accent: 0xffd166,
    fog: 0x0a0607,
    sky: 0x3d1a26,
    ground: 0x0f0a0c,
    wall: 0x2b1721,
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
// boss. Ember Works, Cryo Vault and Toxin Marsh are shuffled: two of them in waves 6–15, the third
// from wave 21 in Endless.
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

/* 2.4.0: 19 biomes → 5 (3.47.0: 6), and the biome changes after every boss again (it changed every wave
 since 2.1). Waves 1–5 are always Blackout City (the Neon Yard until 3.4.0); the others follow in a seeded order, one per
 boss cycle, so a 20-wave run shows four biomes and Endless reaches the fifth at wave 21 and the sixth at wave 26.
 Each biome plays differently, not only in colour:
   Blackout City live manholes that arc (3.4.0, was the Neon Yard: open ground); armed gangs (gunner)
   Ember Works  lava vents; heavy and explosive enemies (brute, bomber, charger, minebot …)
   Cryo Vault   the whole floor is slick (you drift), ice sheets are slicker; shielded and
                ranged enemies (bulwark, sniper, turret, sentinel …)
   Toxin Marsh  acid pools, thick fog; swarms (splitter, hive, swarmer, sapper …)
   Void Core    portal pairs; fast and teleporting enemies (striker, phantom, weaver …)
   Onyx Club    stage pyro that jets gold (3.47.0); the mob in tailored suits (gunner, brute, bomber …)
 The look of each biome (floor, props, border, particles, light) is in the renderer part of
 2.4.0 further down. */
const RL_BIOME_INFO = {
  yard: { tag: "Live manholes", mix: { gunner: 2.2, bomber: 1.8, grunt: 1.5, swarmer: 0.6 } },
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
  // 3.47.0: the Club: armed gangs in tailored suits (gunner), the doormen (brute), molotovs (bomber),
  // getaway drivers (charger) and the dynamite boys (sapper)
  club: {
    tag: "Stage pyro",
    mix: { gunner: 2.2, brute: 2, bomber: 1.8, charger: 1.4, sapper: 1.2, swarmer: 0.6 },
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
