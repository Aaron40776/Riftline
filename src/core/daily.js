// 3.26.0: the Daily Rift. One run per day that is the same for everyone: the seed (the waves, the offers, the hazards), the
// weapon and the threat come from the date, the workshop does not count (so every pilot has the same drone), and the best
// result of the day and the streak of days played are kept in the save. The day changes at midnight UTC (01:00 or 02:00
// German time). Nothing here is random: the same date always gives the same Rift.
import { weaponOrder } from "../data/weapons.js";

const KEY = /^\d{4}-\d{2}-\d{2}$/;

/* the day as 2026-10-06 (UTC) */
function dailyKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
/* the day before a key (for the streak) */
function dayBefore(key) {
  return dailyKey(Date.parse(key + "T00:00:00Z") - 864e5);
}
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}
/* what the Rift of a day is: { key, seed, weapon, threat } (a third of the days are Threat I) */
function dailySpec(key = dailyKey()) {
  if (!KEY.test(key)) key = dailyKey();
  const h = hash("riftline-daily-" + key);
  return { key, seed: h, weapon: weaponOrder[h % weaponOrder.length], threat: hash(key + "-threat") % 3 === 0 ? 1 : 0 };
}
/* the record of a day's run goes into stats.daily: the day, the best wave and kills of that day, the streak and the days played */
function recordDaily(daily, key, wave, kills) {
  if (daily.key !== key) {
    daily.streak = daily.key && daily.key === dayBefore(key) ? daily.streak + 1 : 1;
    daily.days++;
    daily.key = key;
    daily.wave = 0;
    daily.kills = 0;
  }
  const better = wave > daily.wave || (wave === daily.wave && kills > daily.kills);
  if (better) {
    daily.wave = wave;
    daily.kills = kills;
  }
  daily.bestWave = Math.max(daily.bestWave, wave);
  return better;
}
/* the streak as shown today: it has run out when the last day played is neither today nor yesterday */
function liveStreak(daily, key = dailyKey()) {
  return daily.key === key || daily.key === dayBefore(key) ? daily.streak : 0;
}

export { dailyKey, dayBefore, dailySpec, recordDaily, liveStreak, KEY as DAILY_KEY };
