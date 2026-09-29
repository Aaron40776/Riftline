// Player stats from weapon, run upgrades and workshop modules (computeStats).

import { weaponDefs } from "../data/weapons.js";

function computeStats(i, t, e) {
  let n = weaponDefs[i] || weaponDefs.pulse,
    s = (u) => t[u] || 0,
    r = (u) => e[u] || 0,
    a = s("colossus") > 0,
    o = (u, d, f) => (s(u) ? d + f * (s(u) - 1) : 0),
    c = (u) => s(u) > 0,
    h = s("shield") ? [12, 8, 5][Math.min(s("shield"), 3) - 1] * (c("halo") ? 0.7 : 1) : 0,
    l = o("arc", 0.2, 0.1);
  const st = {
    weapon: n,
    maxHp: 100 + 10 * r("hull") + 20 * s("hp"),
    speed: 6.2 * (1 + 0.04 * r("thrust")) * (1 + 0.08 * s("speed")),
    dmgMul: (1 + 0.05 * r("power")) * (1 + 0.15 * s("dmg")) * (a ? 1.45 : 1) * (c("twinsaw") ? 1.35 : 1),
    rateMul: (1 + 0.12 * s("rate")) * (a ? 0.88 : 1),
    velMul: (1 + 0.2 * s("velocity")) * (c("dragon") ? 1.3 : 1),
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
  st.maxHp = Math.max(25, st.maxHp * (1 - 0.05 * s("glasscore")));
  st.dmgMul *= 1 + 0.08 * s("glasscore");
  st.crit += 0.04 * s("glasscore");
  st.eliteMul = 1 + 0.1 * s("hunter");
  st.supply = s("supply");
  st.armor = 0.04 * r("armorCore"); // 2.3.5: share of enemy damage absorbed (was +8 max HP)
  st.wingmen += st.wingman ? Math.min(2, r("droneBay")) : 0;
  // v2.1 meta/run stats
  st.rateMul *= 1 + 0.06 * r("arsenalLab"); // 2.3.5: fire rate (was +5% damage like Power Core)
  st.hazardResist = Math.min(0.88, 0.15 * r("hazardSeal") + 0.25 * s("hazmat"));
  // 2.3.5: the cache modules split into quantity and value. cacheBonus (run upgrade Salvager
  // Core) adds both a cache and +2 shards per cache; Field Supply adds caches (cacheCount) and,
  // since 2.5.0, multiplies the shards in caches (cacheValue, set in the 2.5.0 B section).
  st.cacheBonus = s("salvager");
  st.cacheCount = r("fieldSupply");
  st.overload = s("overload");
  st.crit = Math.min(0.95, st.crit);
  st.chain += s("resonance");
  st.arc = Math.min(0.95, st.arc + 0.08 * s("resonance"));
  st.echo = s("echo");
  // 2.5.0 A: the retired copies are folded into the upgrade they copied (their lines above now
  // read 0), and the six new upgrades expose their level for the World hooks in core/world.js.
  const oc = s("overcharge");
  // Targeting Chip took over Dead Focus and Deadeye Lens: +5% range per level
  st.range *= 1 + 0.05 * s("crit");
  // Overcharge (max 4): +25% Nova radius for each of the first two levels, +10% for the next two
  st.novaR *= (1 + 0.25 * Math.min(2, oc) + 0.1 * Math.max(0, oc - 2)) / (1 + 0.25 * oc);
  // Vector Capacitor took over Cryo Coolant and Afterburner: the Aegis recharges faster too
  st.shieldCd *= Math.max(0.45, 1 - 0.08 * s("vector"));
  st.skates = s("skates");
  st.speed *= 1 + 0.04 * st.skates;
  st.acidCoat = s("acidcoat");
  st.heatSink = s("heatsink");
  st.slip = s("slipstream");
  st.surge = s("surge");
  st.reactive = s("reactive");
  st.rateMul *= 1 - 0.08 * st.reactive;
  // 2.5.0 B: workshop merge and the new modules
  // Rift Battery / Reactor Core are merged into Nova Cell (its floor is applied in startWave);
  // no module adds charge on top any more, even if an unsanitised ws object still names them.
  st.novaStart = 0;
  // Field Supply took over Route Scanner: +50% shards per cache and level
  st.cacheValue = 1 + 0.5 * r("fieldSupply");
  // Hazard Attunement: damage and repair while close to a map hazard (world.js decides "close")
  st.attuneDmg = 0.1 * r("hazardAttune");
  st.attuneRegen = 0.5 * r("hazardAttune");
  // Emergency Shield: barrier seconds and repair share once per wave below 30% hull
  st.barrierT = 1 * r("emergencyShield");
  st.barrierHeal = 0.08 * r("emergencyShield");
  return st;
}
function weaponRange(i) {
  return i.boomerang
    ? i.speed * i.life * 0.5
    : i.drag
      ? (i.speed * (1 - Math.exp(-i.drag * i.life))) / i.drag
      : i.speed * i.life;
}

/* v2.2 stat integration: its upgrades and modules were copies and are retired since 2.5.0 (Salvager
 Core moved into computeStats above). */

export { computeStats, weaponRange };
