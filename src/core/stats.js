// Player stats from weapon, run upgrades and workshop modules (computeStats).

import { weaponDefs } from "../data/weapons.js";

function computeStatsCore(i, t, e) {
  let n = weaponDefs[i] || weaponDefs.pulse,
    s = (u) => t[u] || 0,
    r = (u) => e[u] || 0,
    a = s("colossus") > 0,
    o = (u, d, f) => (s(u) ? d + f * (s(u) - 1) : 0),
    c = (u) => s(u) > 0,
    h = s("shield") ? [12, 8, 5][Math.min(s("shield"), 3) - 1] * (c("halo") ? 0.7 : 1) : 0,
    l = o("arc", 0.2, 0.1);
  return {
    weapon: n,
    maxHp: 100 + 10 * r("hull") + 20 * s("hp"),
    speed: 6.2 * (1 + 0.04 * r("thrust")) * (1 + 0.08 * s("speed")),
    dmgMul: (1 + 0.05 * r("power")) * (1 + 0.15 * s("dmg")) * (a ? 1.45 : 1) * (c("twinsaw") ? 1.35 : 1),
    rateMul: (1 + 0.12 * s("rate")) * (1 + 0.08 * s("overclock")) * (a ? 0.88 : 1),
    velMul: (1 + 0.2 * s("velocity")) * (1 + 0.05 * s("overclock")) * (c("dragon") ? 1.3 : 1),
    sizeMul: (a ? 1.6 : 1) * (c("twinsaw") ? 1.4 : 1),
    extra: s("multishot") + (c("shredder") ? 1 : 0),
    pierce: (n.pierce || 0) + s("pierce"),
    bounce: s("ricochet") + (c("shredder") ? 1 : 0),
    crit: 0.05 + 0.08 * s("crit"),
    critMul: 2,
    magnet: 2.4 * (1 + 0.2 * r("magnet")) * (1 + 0.45 * s("magnet")),
    dashCd: 1.9 * (1 - 0.08 * r("dash")) * (1 - 0.08 * s("vector")) * (c("phantom") ? 0.6 : 1),
    momentum: 0.09 * s("momentum"),
    laststand: 0.18 * s("laststand"),
    scavenger: s("scavenger"),
    regen: 0.8 * s("regen"),
    shieldCd: h,
    orbit: s("orbit"),
    orbitDmg: 14 * (c("halo") ? 2 : 1),
    orbitR: c("halo") ? 2.7 : 2.1,
    bladeScale: c("halo") ? 1.5 : 1,
    cryo: 0.15 * s("cryo"),
    shockDash: s("shockdash") ? (s("shockdash") > 1 ? 48 : 30) : 0,
    payloadR: o("payload", 1.6, 0.35),
    payloadF: o("payload", 0.4, 0.15),
    arc: c("storm") ? Math.min(0.9, l + 0.3) : l,
    arcJumps: c("storm") ? 4 : 2,
    chain: (n.chain || 0) + (c("tempest") ? 2 : 0),
    chainF: c("tempest") ? 0.85 : 0.7,
    homing: (n.homing || 0) + 2.2 * s("seeker") + (c("twinsaw") ? 2.5 : 0),
    thermite: o("thermite", 0.3, 0.15),
    siphonCh: o("siphon", 0.12, 0.06),
    rear: s("rearguard"),
    novaMul: 1 + 0.4 * s("overcharge"),
    novaR: 6.5 * (1 + 0.25 * s("overcharge")),
    wingman: s("wingman"),
    wingmen: s("wingman") ? 1 + (c("gunship") ? 1 : 0) : 0,
    wingSpread: c("gunship") ? 3 : 1,
    bloodrush: s("bloodrush"),
    chrono: s("chrono"),
    cluster: c("cluster"),
    inferno: c("inferno"),
    trail: c("phantom"),
    boomerang: !!n.boomerang,
    bounty: s("bounty"),
    capacitor: s("capacitor"),
    burn: n.burn || 0,
    burnMul: c("dragon") ? 1.6 : 1,
    overdrive: c("overdrive"),
    lance: c("lance"),
    hellfire: c("hellfire"),
    range: weaponRange(n) * (1 + 0.2 * s("velocity")) * (c("dragon") ? 1.3 : 1),
  };
}
function computeStats(i, t, e) {
  const s = computeStatsCore(i, t, e),
    u = (id) => t[id] || 0,
    w = (id) => e[id] || 0;
  s.dmgMul *= 1 + 0.1 * u("caliber");
  s.velMul *= 1 + 0.12 * u("stabilizer");
  s.range *= 1 + 0.12 * u("stabilizer");
  s.maxHp = Math.max(25, s.maxHp * (1 - 0.05 * u("glasscore")));
  s.dmgMul *= 1 + 0.08 * u("glasscore");
  s.crit += 0.04 * u("glasscore");
  s.novaMul *= 1 + 0.15 * u("aether");
  s.eliteMul = 1 + 0.1 * u("hunter");
  s.dashCd *= Math.max(0.45, 1 - 0.12 * u("coolant"));
  s.shieldCd *= Math.max(0.45, 1 - 0.12 * u("coolant"));
  s.supply = u("supply");
  s.armor = 0.04 * w("armorCore"); // 2.3.5: share of enemy damage absorbed (was +8 max HP)
  s.novaStart = Math.min(100, 10 * w("riftBattery"));
  s.wingmen += s.wingman ? Math.min(2, w("droneBay")) : 0;
  // v2.1 meta/run stats
  s.rateMul *= 1 + 0.06 * w("arsenalLab"); // 2.3.5: fire rate (was +5% damage like Power Core)
  s.hazardResist = Math.min(0.88, 0.15 * w("hazardSeal") + 0.25 * u("hazmat"));
  // 2.3.5: the cache modules split into quantity and value. cacheBonus (run upgrades Scavenger
  // Net and Salvager) still adds both a cache and +2 shards per cache; Field Supply only adds
  // caches (cacheCount), Route Scanner only multiplies the shards in caches (cacheValue).
  s.cacheBonus = u("scavengerNet");
  s.cacheCount = w("fieldSupply");
  s.overload = u("overload");
  s.range *= 1 + 0.1 * u("focus");
  s.crit = Math.min(0.95, s.crit + 0.04 * u("focus"));
  s.chain += u("resonance");
  s.arc = Math.min(0.95, s.arc + 0.08 * u("resonance"));
  s.maxHp += 15 * u("fortify");
  s.leech = u("leech");
  s.echo = u("echo");
  return s;
}
function weaponRange(i) {
  return i.boomerang
    ? i.speed * i.life * 0.5
    : i.drag
      ? (i.speed * (1 - Math.exp(-i.drag * i.life))) / i.drag
      : i.speed * i.life;
}

/* v2.2 stat integration is additive and centralized. */
const _rlComputeStats22 = computeStats;
computeStats = function (weapon, run, workshop) {
  const s = _rlComputeStats22(weapon, run, workshop),
    u = (id) => run[id] || 0,
    w = (id) => workshop[id] || 0;
  s.dmgMul *= 1 + 0.08 * u("kinetic");
  s.crit = Math.min(0.95, s.crit + 0.03 * u("deadeye"));
  s.range *= 1 + 0.05 * u("deadeye");
  s.speed *= 1 + 0.05 * u("thruster");
  s.regen += 0.55 * u("nanorepair");
  s.cacheBonus += u("salvager");
  s.cacheValue = 1 + 0.5 * w("routeScanner");
  s.hazardResist = Math.min(0.92, (s.hazardResist || 0) + 0.08 * u("phasecoat"));
  s.novaMul *= 1 + 0.08 * u("flux");
  s.payloadR += 0.35 * u("payloadMatrix");
  s.payloadF += 0.12 * u("payloadMatrix");
  s.chain += u("chainlink");
  s.dashCd *= Math.max(0.45, 1 - 0.06 * u("afterburner"));
  s.shieldCd *= Math.max(0.45, 1 - 0.06 * u("afterburner"));
  s.novaStart = Math.min(100, (s.novaStart || 0) + 5 * w("reactorCore"));
  return s;
};

// 2.5.0 B: workshop merge and the new modules
const _rlComputeStats250B = computeStats;
computeStats = function (weapon, run, workshop) {
  const s = _rlComputeStats250B(weapon, run, workshop),
    w = (id) => workshop[id] || 0;
  // Rift Battery / Reactor Core are merged into Nova Cell (its floor is applied in startWave);
  // no module adds charge on top any more, even if an unsanitised ws object still names them.
  s.novaStart = 0;
  // Field Supply took over Route Scanner: +50% shards per cache and level
  s.cacheValue = 1 + 0.5 * w("fieldSupply");
  // Hazard Attunement: damage and repair while close to a map hazard (world.js decides "close")
  s.attuneDmg = 0.1 * w("hazardAttune");
  s.attuneRegen = 0.5 * w("hazardAttune");
  // Emergency Shield: barrier seconds and repair share once per wave below 30% hull
  s.barrierT = 1 * w("emergencyShield");
  s.barrierHeal = 0.08 * w("emergencyShield");
  return s;
};

export { computeStats, weaponRange };
