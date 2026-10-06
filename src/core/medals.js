// 3.24.0: boss medals ("ohne Treffer und auf Zeit": proposal 11 of 03.10.2026). Every boss kill earns a medal for how it was
// done, kept as the best per boss in the save and shown in the Codex:
//   Bronze: the boss is down.
//   Silver: no damage taken in the fight, or in under 1.5 times the par time with at most a quarter of the hull lost.
//   Gold:   no damage taken in the fight and in under the par time.
// The par time is the time of a good run at Standard threat; a higher threat gives the boss more hull, so the par grows with it.
// The fight counts from the moment the boss appears to the moment it dies.

const MEDAL_NAMES = ["", "Bronze", "Silver", "Gold"],
  PAR = { warden: 60, forge: 70, prism: 70, queen: 75, core: 85 };

/* 0 for no medal (an unknown time), else 1 to 3. `damage` is what the drone lost in the fight, `maxHp` its hull, `hpMul` the
   hull factor of the threat level (1 at Standard) */
function bossMedal(id, secs, damage, maxHp = 100, hpMul = 1) {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return 0;
  const par = (PAR[id] || 70) * Math.max(0.5, hpMul || 1),
    hits = Math.max(0, damage || 0);
  if (hits <= 0 && secs <= par) return 3;
  if (hits <= 0 || (secs <= par * 1.5 && hits <= 0.25 * maxHp)) return 2;
  return 1;
}

export { bossMedal, MEDAL_NAMES, PAR };
