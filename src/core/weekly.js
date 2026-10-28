// 3.58.0: the Weekly Rift. The Daily Rift gives everyone the same day; this gives everyone the same week, with a
// twist: two mutators are pinned for the whole week and are in play from wave 1 (the Daily has none, and Endless
// only grows them from wave 21). The seed, weapon, threat and both mutators come from the ISO week, so every pilot
// faces the same run; the week turns over Monday 00:00 UTC. Nothing here is random.
import { weaponOrder } from "../data/weapons.js";
import { MUTATOR_IDS } from "./mutators.js";
import { hashString } from "./util.js";

const KEY = /^\d{4}-W\d{2}$/;

/* the ISO-8601 week of a moment as 2026-W44 (UTC, Monday-based) */
function weekKey(now = Date.now()) {
  const d = new Date(now),
    thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // the Thursday of this week
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3); // the Thursday of week 1
  const week = 1 + Math.round((thursday - jan4) / (7 * 864e5));
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* what the Rift of a week is: { key, seed, weapon, threat, mutators } (two distinct mutators, fixed all week) */
function weeklySpec(key = weekKey()) {
  if (!KEY.test(key)) key = weekKey();
  const first = hashString(key + "-mut-a") % MUTATOR_IDS.length;
  let second = hashString(key + "-mut-b") % MUTATOR_IDS.length;
  if (second === first) second = (second + 1) % MUTATOR_IDS.length;
  return {
    key,
    seed: hashString("riftline-weekly-" + key),
    weapon: weaponOrder[hashString(key + "-weapon") % weaponOrder.length],
    threat: hashString(key + "-threat") % 4 === 0 ? 1 : 0,
    mutators: [MUTATOR_IDS[first], MUTATOR_IDS[second]],
  };
}

/* the record of a week's run goes into stats.weekly: the week, its best wave and kills, the best wave ever, the weeks played */
function recordWeekly(weekly, key, wave, kills) {
  if (weekly.key !== key) {
    weekly.weeks++;
    weekly.key = key;
    weekly.wave = 0;
    weekly.kills = 0;
  }
  const better = wave > weekly.wave || (wave === weekly.wave && kills > weekly.kills);
  if (better) {
    weekly.wave = wave;
    weekly.kills = kills;
  }
  weekly.bestWave = Math.max(weekly.bestWave, wave);
  return better;
}

export { weekKey, weeklySpec, recordWeekly, KEY as WEEKLY_KEY };
