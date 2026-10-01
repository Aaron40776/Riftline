// Player stats from weapon, run upgrades and workshop modules (computeStats).

import { weaponDefs } from "../data/weapons.js";

function computeStats(weaponId, run, workshop) {
  let weapon = weaponDefs[weaponId] || weaponDefs.pulse,
    level = (id) => run[id] || 0,
    moduleLevel = (id) => workshop[id] || 0,
    colossus = level("colossus") > 0,
    scaled = (id, base, step) => (level(id) ? base + step * (level(id) - 1) : 0),
    has = (id) => level(id) > 0,
    shieldCd = level("shield") ? [12, 8, 5][Math.min(level("shield"), 3) - 1] * (has("halo") ? 0.7 : 1) : 0,
    arc = scaled("arc", 0.2, 0.1);
  const stats = {
    weapon: weapon,
    maxHp: 100 + 10 * moduleLevel("hull") + 25 * level("hp"),
    speed: 6.2 * (1 + 0.04 * moduleLevel("thrust")) * (1 + 0.1 * level("speed")),
    dmgMul:
      (1 + 0.05 * moduleLevel("power")) *
      (1 + 0.18 * level("dmg")) *
      (colossus ? 1.45 : 1) *
      (has("twinsaw") ? 1.35 : 1),
    rateMul: (1 + 0.15 * level("rate")) * (colossus ? 0.88 : 1),
    velMul: (1 + 0.06 * level("crit")) * (has("dragon") ? 1.3 : 1),
    sizeMul: (colossus ? 1.6 : 1) * (has("twinsaw") ? 1.4 : 1),
    extra: level("multishot") + (has("shredder") ? 1 : 0),
    pierce: (weapon.pierce || 0) + level("pierce"),
    bounce: level("ricochet") + (has("shredder") ? 1 : 0),
    crit: 0.05 + 0.1 * level("crit"),
    critMul: 2 + 0.06 * level("crit"),
    magnet: 2.4 * (1 + 0.2 * moduleLevel("magnet")),
    dashCd: 1.9 * (1 - 0.08 * moduleLevel("dash")) * (1 - 0.08 * level("speed")) * (has("phantom") ? 0.5 : 1),
    laststand: 0.22 * level("laststand"),
    regen: 0.8 * level("regen"),
    shieldCd: shieldCd,
    orbit: level("orbit"),
    orbitDmg: 18 * (has("halo") ? 2 : 1),
    orbitR: has("halo") ? 2.7 : 2.1,
    bladeScale: has("halo") ? 1.5 : 1,
    cryo: 0.25 * level("cryo"),
    shockDash: level("shockdash") ? (level("shockdash") > 1 ? 90 : 60) : 0,
    payloadR: scaled("payload", 1.6, 0.35),
    payloadF: scaled("payload", 0.3, 0.1),
    arc: has("storm") ? Math.min(0.9, arc + 0.3) : arc,
    arcJumps: has("storm") ? 4 : 2,
    chain: (weapon.chain || 0) + (has("tempest") ? 2 : 0),
    chainF: has("tempest") ? 0.8 : 0.7,
    homing: (weapon.homing || 0) + 2.2 * level("seeker") + (has("twinsaw") ? 2.5 : 0),
    thermite: scaled("thermite", 0.3, 0.15),
    siphonCh: scaled("siphon", 0.12, 0.06),
    rear: level("rearguard"),
    novaMul: 1 + 0.3 * level("overcharge"),
    novaR: 6.5 * (1 + 0.25 * level("overcharge")),
    wingman: level("wingman"),
    wingmen: level("wingman") ? 1 + (has("gunship") ? 1 : 0) : 0,
    wingSpread: has("gunship") ? 3 : 1,
    bloodrush: level("bloodrush"),
    chrono: level("chrono"),
    cluster: has("cluster"),
    inferno: has("inferno"),
    trail: has("phantom"),
    boomerang: !!weapon.boomerang,
    bounty: level("supply"), // 2.6.0: Bounty Protocol is part of Supply Loop
    capacitor: level("overcharge"), // 2.6.0: Capacitor Bank is part of Overcharge
    burn: weapon.burn || 0,
    burnMul: has("dragon") ? 2 : 1,
    overdrive: has("overdrive"),
    lance: has("lance"),
    hellfire: has("hellfire"),
    range: weaponRange(weapon) * (has("dragon") ? 1.3 : 1),
  };
  stats.maxHp = Math.max(25, stats.maxHp);
  stats.eliteMul = 1 + 0.15 * level("hunter");
  stats.supply = level("supply");
  stats.armor = 0.04 * moduleLevel("armorCore"); // 2.3.5: share of enemy damage absorbed (was +8 max HP)
  stats.wingmen += stats.wingman ? Math.min(2, moduleLevel("droneBay")) : 0;
  // v2.1 meta/run stats
  stats.rateMul *= 1 + 0.06 * moduleLevel("arsenalLab"); // 2.3.5: fire rate (was +5% damage like Power Core)
  stats.hazardResist = Math.min(0.88, 0.15 * moduleLevel("hazardSeal") + 0.25 * level("hazmat"));
  // 2.3.5: the cache modules split into quantity and value. cacheBonus (run upgrade Salvager
  // Core) adds both a cache and +2 shards per cache; Field Supply adds caches (cacheCount) and,
  // since 2.5.0, multiplies the shards in caches (cacheValue, set in the 2.5.0 B section).
  stats.cacheBonus = level("salvager");
  stats.cacheCount = moduleLevel("fieldSupply");
  stats.overload = level("overload");
  stats.crit = Math.min(0.95, stats.crit);
  // 2.6.0: Resonance gives +1 chain jump every second level (was every level) and +6% chain chance.
  // 2.8.1: the jump goes to the weapon's own chain only for chaining weapons (Tesla); for the others it
  // extends the chance-based arc chain, as the card says (it used to add a chain on every single hit)
  if (stats.chain) stats.chain += Math.ceil(level("resonance") / 2);
  else stats.arcJumps += Math.ceil(level("resonance") / 2);
  stats.arc = Math.min(0.95, stats.arc + 0.06 * level("resonance"));
  stats.echo = level("echo");
  // 2.5.0 A: the retired copies are folded into the upgrade they copied (their lines above now
  // read 0), and the six new upgrades expose their level for the World hooks in core/world.js.
  const overcharge = level("overcharge");
  // Targeting Chip took over Dead Focus and Deadeye Lens: +5% range per level
  stats.range *= 1 + 0.08 * level("crit");
  // Overcharge (max 4): +25% Nova radius for each of the first two levels, +10% for the next two
  stats.novaR *= (1 + 0.25 * Math.min(2, overcharge) + 0.1 * Math.max(0, overcharge - 2)) / (1 + 0.25 * overcharge);
  // Vector Capacitor took over Cryo Coolant and Afterburner: the Aegis recharges faster too
  stats.shieldCd *= Math.max(0.45, 1 - 0.08 * level("speed"));
  stats.skates = level("skates");
  stats.speed *= 1 + 0.04 * stats.skates;
  stats.acidCoat = level("acidcoat");
  stats.heatSink = level("heatsink");
  stats.slip = level("slipstream");
  stats.surge = level("surge");
  stats.reactive = level("reactive");
  // 2.5.0 B: workshop merge and the new modules
  // Rift Battery / Reactor Core are merged into Nova Cell (its floor is applied in startWave);
  // no module adds charge on top any more, even if an unsanitised ws object still names them.
  stats.novaStart = 0;
  // Field Supply took over Route Scanner: +50% shards per cache and level
  stats.cacheValue = 1 + 0.5 * moduleLevel("fieldSupply");
  // Hazard Attunement: damage and repair while close to a map hazard (world.js decides "close")
  stats.attuneDmg = 0.1 * moduleLevel("hazardAttune");
  stats.attuneRegen = 0.5 * moduleLevel("hazardAttune");
  // Emergency Shield: barrier seconds and repair share once per wave below 30% hull
  stats.barrierT = 1 * moduleLevel("emergencyShield");
  stats.barrierHeal = 0.08 * moduleLevel("emergencyShield");
  // 3.0.0: the Grenade gadget: charges, recharge time per charge, damage and radius, incendiary mix
  stats.gadgetMax = 2 + level("gcells");
  stats.gadgetCd = 6 * Math.max(0.5, 1 - 0.12 * level("gcells"));
  stats.gadgetDmg = 1 + 0.3 * level("gblast");
  stats.gadgetR = 3.4 * (1 + 0.15 * level("gblast"));
  stats.gadgetFire = level("gfire");
  return stats;
}
function weaponRange(weapon) {
  return weapon.boomerang
    ? weapon.speed * weapon.life * 0.5
    : weapon.drag
      ? (weapon.speed * (1 - Math.exp(-weapon.drag * weapon.life))) / weapon.drag
      : weapon.speed * weapon.life;
}

/* v2.2 stat integration: its upgrades and modules were copies and are retired since 2.5.0 (Salvager
 Core moved into computeStats above). */

export { computeStats, weaponRange };
