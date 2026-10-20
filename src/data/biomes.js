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
    // 3.51.0: The Aurora Shelf replaces the Cryo Vault (the id stays "vault" for saves and records,
    // like the Yard in 3.4.0): the arctic shelf at night - indigo snowfields under the aurora, blue
    // ice ridges, half-buried arks. The blizzard breathes (~20 s): the storm thickens and thins and
    // the thin ice freezes and thaws with it, so traction comes and goes. The palette keeps the rule:
    // the glacial ice grid reads against every other grid (min CIE76 dE 57 to the marsh's mint), and
    // the night sits indigo, not black - the snow has to read bright against it.
    id: "vault",
    name: "The Aurora Shelf",
    W: 18,
    H: 18,
    // 2.3.3: the palette that keeps every biome recognisable at a glance (grid ΔE ≥ 30 to any other biome, checked
    // by rlBiomeDistinct in the deep test); until 3.32.0 main.js patched it in at start-up
    floor: 0x0d1530,
    grid: 0xaee2ff,
    accent: 0x5cc8ff,
    fog: 0x070d1c,
    sky: 0x1a2c52,
    ground: 0x0a1220,
    wall: 0x16233f,
    obstacles: [
      { t: "b", x: -9, y: 0, w: 0.8, h: 3 },
      { t: "b", x: 9, y: 0, w: 0.8, h: 3 },
      { t: "c", x: 0, y: -9.5, r: 1.4 },
      { t: "c", x: 0, y: 9.5, r: 1.4 },
    ],
  },
  {
    // 3.52.0: The Shattered Core (a light polish, not a re-theme: the id stays "void" for saves and
    // records, like the Yard in 3.4.0): the broken heart of the rift - debris of the other places
    // drifts past the hex tiles and the fissures flash on the Core's own 60 BPM heartbeat
    id: "void",
    name: "The Shattered Core",
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
    // 3.50.0: The Glowmarsh replaces the Toxin Marsh (the id stays "marsh" for saves and records,
    // like the Yard in 3.4.0): the swamp after dark - black water over dark peat, veins of glowing
    // algae, glowcap mushrooms and drifting spores. The same acid, now it glows: the light IS the
    // warning. The palette keeps the rule: the bioluminescent teal grid reads against every other
    // grid (min CIE76 dE 54 to the Vault's pale ice), and a nocturnal biome keeps the floor,
    // fog, ground and walls almost black so the glow carries the scene.
    id: "marsh",
    name: "The Glowmarsh",
    W: 18,
    H: 17,
    floor: 0x071310,
    grid: 0x35e8a8,
    accent: 0xb2ffdc,
    fog: 0x04090a,
    sky: 0x11313a,
    ground: 0x050b0c,
    wall: 0x12211f,
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
// boss. The Aurora Shelf, the Glowmarsh and the Ashfall Caldera are shuffled: two of them in waves
// 6–15, the third from wave 21 in Endless.
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
   The Aurora Shelf the whole floor is slick (you drift) and the blizzard breathes - traction
                freezes in and thaws out (~20 s), ice sheets are slicker; shielded and ranged
                enemies (bulwark, sniper, turret, sentinel …)
   The Glowmarsh the mud clings (quick to stop, slow to sprint), acid pools, thick night fog;
                swarms (splitter, hive, swarmer, sapper …)
   The Shattered Core
                portal pairs; fast and teleporting enemies (striker, phantom, weaver …)
 The look of each biome (floor, props, border, particles, light) is in the renderer part of
 2.4.0 further down. */
const RL_BIOME_INFO = {
  yard: { tag: "Live manholes", mix: { gunner: 2.2, bomber: 1.8, grunt: 1.5, swarmer: 0.6 } },
  // 3.51.0: the Shelf: the blizzard breathes - the thin ice freezes and thaws on a ~20 s cycle, so
  // the slick floor (grip 6.5) swings toward 9.1 at freeze peak and back (world.js step)
  vault: {
    tag: "Blizzard breath",
    grip: 6.5,
    mix: { bulwark: 2.2, sniper: 2, gunner: 1.8, turret: 2, sentinel: 1.8, swarmer: 0.6, splitter: 0.6 },
  },
  // 3.50.0: the Glowmarsh: grip 24 - the mud clings (the Vault's slick floor is 6.5, plain ground
  // is 16: here velocity dies fast, so you stop hard and sprint heavy) and mud drags a little speed
  marsh: {
    tag: "Bloom tide",
    grip: 24,
    mud: 0.92,
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
    // 3.50.0: the Glowmarsh's mud drags (a speed multiplier, see World.step)
    if (info.mud) {
      biomesById[id].mud = info.mud;
    }
  }
}

export { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, planBiomeRoute, biomeList };
