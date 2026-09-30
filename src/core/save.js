// Save store (localStorage key riftline.save.v1): defaults, loading and sanitizing, migrations,
// settings, run history and backups.

import { logError } from "./diagnostics.js";
import { bossOrder } from "../data/enemies.js";
import { store } from "../main.js";
import { weaponDefs } from "../data/weapons.js";
import { RL_RETIRED_WEAPONS, RL_RETIRED_MODULES, milestones, workshopModules, rlRetired } from "../data/progression.js";
import { upgradeList, upgradesById, rlRetiredUpgrade } from "../data/upgrades.js";

/* Save loading must never brick the game (2.2.2 crashed on every start once a
 save existed). Retry without the unfinished run, then fall back to a fresh
 profile while keeping the raw save in a backup key. */
function rlLoadSave(raw) {
  try {
    return cleanSave(raw);
  } catch (err) {
    logError("load", err);
  }
  try {
    const data = cleanSave({ ...raw, run: null });
    logError("load", "unfinished run discarded: it could not be restored");
    return data;
  } catch (err) {
    logError("load", err);
  }
  rlBackupSave(JSON.stringify(raw));
  return newSave();
}
/* 2.3.2: a save that cannot be used at all (broken JSON, oversized, not an
 object) is copied to a backup key before the fresh profile's first autosave
 overwrites it — progress can then still be recovered by hand. */
function rlBackupSave(text) {
  try {
    // 2.8.1: keep only the three newest backups, so they cannot fill the storage quota
    const prefix = "riftline.save.v1.backup-",
      old = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) old.push(key);
    }
    old.sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
    for (const key of old.slice(0, Math.max(0, old.length - 2))) localStorage.removeItem(key);
    localStorage.setItem(prefix + Date.now(), String(text));
  } catch (err) {
    logError("backup", err);
  }
}
/* 2.3.2: numeric settings get the range of their control (volume 0–1, zoom
 snaps to Near/Normal/Far) instead of a blanket 0–2 clamp. */
const RL_ZOOM_STEPS = [0.85, 1, 1.18];
function rlSettingNum(key, value, def) {
  const num = cleanNumber(value, def, 0, key === "sfx" || key === "music" ? 1 : 2);
  return key === "zoom"
    ? RL_ZOOM_STEPS.reduce((best, step) => (Math.abs(step - num) < Math.abs(best - num) ? step : best))
    : num;
}

/* ---- run history: the last 12 runs, shown under Records ---- */
function rlSanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  // 2.5.0 A: a retired upgrade in a build is shown as the upgrade that took it over.
  history = history.map((entry) =>
    entry && typeof entry === "object" && Array.isArray(entry.build) && entry.build.some((id) => rlRetiredUpgrade(id))
      ? { ...entry, build: [...new Set(entry.build.map((id) => rlRetiredUpgrade(id)?.to || id))] }
      : entry,
  );
  const out = [],
    ni2 = (value, lo, hi, def = 0) =>
      typeof value === "number" && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : def;
  for (const entry of history.slice(0, 12)) {
    // 2.4.0: runs with a retired weapon stay in the list (shown with the weapon's old name)
    if (!entry || typeof entry !== "object" || !(weaponDefs[entry.weapon] || rlRetired(entry.weapon))) continue;
    out.push({
      t: ni2(entry.t, 0, 9e15),
      weapon: entry.weapon,
      threat: Math.floor(ni2(entry.threat, 0, 5)),
      wave: Math.floor(ni2(entry.wave, 1, 999, 1)),
      outcome: ["win", "dead", "quit"].includes(entry.outcome) ? entry.outcome : "dead",
      endless: !!entry.endless,
      time: Math.round(ni2(entry.time, 0, 1e7)),
      kills: Math.floor(ni2(entry.kills, 0, 1e9)),
      shards: Math.floor(ni2(entry.shards, 0, 1e9)),
      killer: typeof entry.killer === "string" && /^[a-z]{1,18}$/.test(entry.killer) ? entry.killer : "",
      build: Array.isArray(entry.build)
        ? entry.build.filter((id) => typeof id === "string" && upgradesById[id]).slice(0, 6)
        : [],
    });
  }
  return out;
}
function rlRecordRun(world, pre, win, abandoned) {
  const data = store.data,
    up = Object.entries(world.up || {})
      .filter(([id]) => upgradesById[id] && !upgradesById[id].repeat)
      .sort((a, b) => upgradesById[b[0]].rarity - upgradesById[a[0]].rarity || b[1] - a[1]);
  const entry = {
    t: Date.now(),
    weapon: world.weapon,
    threat: world.threat,
    wave: win && !world.endless ? 20 : world.wave,
    outcome: win ? "win" : abandoned ? "quit" : "dead",
    endless: !!world.endless,
    time: Math.round(world.time),
    kills: world.kills,
    shards: Math.max(0, data.shards - pre.bank),
    killer: (!win && !abandoned && world.lastHit) || "",
    build: up.slice(0, 6).map(([id]) => id),
  };
  data.history = rlSanitizeHistory([entry, ...(data.history || [])]);
  store.save("history");
}
// What the last load converted (shown once as a toast after start-up).
let RL_RETIRE_NOTE = null;
// assigned from other modules (an imported binding cannot be assigned)
function set_RL_RETIRE_NOTE(note) {
  return (RL_RETIRE_NOTE = note);
}
/* Runs on the raw save before it is sanitised (cleanSave), so it covers loading and importing. Returns
 the input untouched when there is nothing to convert; never mutates it (rlLoadSave may still
 back up the raw object). Running it again on its own output changes nothing. */
function rlMigrateRetired(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : null),
    own = obj(raw.weapons),
    run = obj(raw.run),
    owned = own ? Object.keys(RL_RETIRED_WEAPONS).filter((id) => own[id] === true) : [],
    sel = rlRetired(raw.weapon),
    runW = run && rlRetired(run.weapon);
  if (!owned.length && !sel && !runW) return raw;
  const out = { ...raw },
    weapons = { ...(own || {}) };
  let refund = 0;
  for (const id of owned) {
    const retired = RL_RETIRED_WEAPONS[id];
    delete weapons[id];
    if (weapons[retired.to] === true) refund += retired.cost;
    else {
      weapons[retired.to] = true;
      refund += Math.max(0, retired.cost - weaponDefs[retired.to].cost);
    }
  }
  out.weapons = weapons;
  if (sel) out.weapon = sel.to;
  if (runW) out.run = { ...run, weapon: runW.to };
  if (refund > 0) out.shards = (Number.isFinite(raw.shards) ? Math.max(0, raw.shards) : 0) + refund;
  RL_RETIRE_NOTE = { refund, names: owned.map((id) => RL_RETIRED_WEAPONS[id].name) };
  return out;
}
const SAVE_KEY = "riftline.save.v1",
  defaultSettings = {
    sfx: 0.8,
    music: 0.45,
    autoFire: true,
    assist: true,
    shake: true,
    numbers: true,
    quality: "auto",
    swap: false,
    zoom: 1,
    contrast: false,
    calm: false,
    // 2.4.2: optional HUD readouts
    timer: false,
    fps: false,
  };
function newSave() {
  return {
    v: 1,
    game: "riftline",
    created: Date.now(),
    savedAt: 0,
    shards: 0,
    weapon: "pulse",
    weapons: { pulse: true },
    threat: 0,
    threatMax: 0,
    workshop: {},
    milestones: {},
    stats: {
      runs: 0,
      kills: 0,
      bestWave: 0,
      clears: 0,
      deaths: 0,
      bosses: {},
      clearsBy: {},
      bestBy: {},
      legendaries: 0,
      flawless: 0,
      bestClearThreat: -1,
      shardsEarned: 0,
      playTime: 0,
      bestTime: 0,
      evolved: 0,
      bestCombo: 0,
    },
    settings: { ...defaultSettings },
    run: null,
    history: [],
    seen: {},
  };
}
const cleanNumber = (value, fallback, min = -1 / 0, max = 1 / 0) =>
    typeof value == "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback,
  cleanBool = (value, fallback) => (typeof value == "boolean" ? value : fallback),
  asObject = (value) => (value && typeof value == "object" && !Array.isArray(value) ? value : {});
function cleanRun(raw) {
  raw = rlMigrateUpgrades(raw); // 2.5.0 A: retired upgrades of a saved run
  if (
    !raw ||
    typeof raw !== "object" ||
    raw.v !== 1 ||
    !weaponDefs[raw.weapon] ||
    !Number.isFinite(raw.wave) ||
    raw.wave < 1 ||
    raw.wave > 999 ||
    !Number.isFinite(raw.hp) ||
    raw.hp <= 0
  )
    return null;
  const run = {
    v: 1,
    seed: Number.isFinite(raw.seed) ? raw.seed >>> 0 : 0,
    weapon: raw.weapon,
    threat: Math.floor(cleanNumber(raw.threat, 0, 0, 5)),
    wave: Math.floor(cleanNumber(raw.wave, 1, 1, 999)),
    endless: !!raw.endless,
    up: {},
    hp: Math.max(1, Math.round(cleanNumber(raw.hp, 1, 1, 1e6))),
    shards: Math.floor(cleanNumber(raw.shards, 0, 0, 1e9)),
    kills: Math.floor(cleanNumber(raw.kills, 0, 0, 1e9)),
    time: cleanNumber(raw.time, 0, 0, 1e8),
    rerolls: Math.floor(cleanNumber(raw.rerolls, 0, 0, 99)),
    revived: !!raw.revived,
    nova: Math.floor(cleanNumber(raw.nova, 0, 0, 100)),
    bossKills: [],
    flawless: Math.floor(cleanNumber(raw.flawless, 0, 0, 1e6)),
    legendaries: Math.floor(cleanNumber(raw.legendaries, 0, 0, 1e6)),
    dmgDealt: Math.floor(cleanNumber(raw.dmgDealt, 0, 0, 1e12)),
    bestCombo: Math.floor(cleanNumber(raw.bestCombo, 0, 0, 1e6)),
    evolved: Math.floor(cleanNumber(raw.evolved, 0, 0, 1e6)),
    runStats: { dmgTaken: 0, dashes: 0, critHits: 0 },
    dmgSrc: {},
  };
  const rawUp = asObject(raw.up);
  for (const upgrade of upgradeList) {
    const level = Math.floor(cleanNumber(rawUp[upgrade.id], 0, 0, upgrade.max));
    if (level) run.up[upgrade.id] = level;
  }
  const rawBoss = Array.isArray(raw.bossKills) ? raw.bossKills : [];
  run.bossKills = [...new Set(rawBoss.filter((id) => typeof id === "string" && bossOrder.includes(id)))];
  const rawStats = asObject(raw.runStats);
  run.runStats.dmgTaken = Math.floor(cleanNumber(rawStats.dmgTaken, 0, 0, 1e12));
  run.runStats.dashes = Math.floor(cleanNumber(rawStats.dashes, 0, 0, 1e7));
  run.runStats.critHits = Math.floor(cleanNumber(rawStats.critHits, 0, 0, 1e9));
  const src = asObject(raw.dmgSrc);
  for (const key in src)
    if (/^[A-Za-z0-9_-]{1,18}$/.test(key)) run.dmgSrc[key] = Math.floor(cleanNumber(src[key], 0, 0, 1e12));
  if (Array.isArray(raw.offer)) {
    const offer = [...new Set(raw.offer.filter((id) => typeof id === "string" && !!upgradesById[id]))].slice(0, 4);
    if (offer.length) {
      run.offer = offer;
      run.offerBoss = !!raw.offerBoss;
    }
  }
  return run;
}
function cleanSave(input) {
  // 2.5.0 B: refund merged workshop modules, then 2.4.0: convert retired weapons (both on the raw save)
  input = rlMigrateRetired(rlMigrateModules(input));
  let fresh = newSave(),
    raw = asObject(input),
    save = fresh;
  save.created = cleanNumber(raw.created, fresh.created);
  save.savedAt = cleanNumber(raw.savedAt, 0);
  save.shards = Math.floor(cleanNumber(raw.shards, 0, 0, 1e9));
  for (let id in weaponDefs) {
    if (asObject(raw.weapons)[id] === true) {
      save.weapons[id] = true;
    }
  }
  save.weapons.pulse = true;
  save.weapon = weaponDefs[raw.weapon] && save.weapons[raw.weapon] ? raw.weapon : "pulse";
  save.threatMax = Math.floor(cleanNumber(raw.threatMax, 0, 0, 5));
  save.threat = Math.floor(cleanNumber(raw.threat, 0, 0, save.threatMax));
  for (let mod of workshopModules) {
    let level = Math.floor(cleanNumber(asObject(raw.workshop)[mod.id], 0, 0, mod.costs.length));
    if (level) {
      save.workshop[mod.id] = level;
    }
  }
  for (let milestone of milestones) {
    if (asObject(raw.milestones)[milestone.id] === true) {
      save.milestones[milestone.id] = true;
    }
  }
  let rawStats = asObject(raw.stats),
    stats = fresh.stats;
  for (let key of [
    "runs",
    "kills",
    "bestWave",
    "clears",
    "deaths",
    "legendaries",
    "flawless",
    "shardsEarned",
    "playTime",
    "bestTime",
    "evolved",
    "bestCombo",
  ])
    stats[key] = cleanNumber(rawStats[key], 0, 0, 1e12);
  stats.bestClearThreat = Math.floor(cleanNumber(rawStats.bestClearThreat, -1, -1, 5));
  for (let key of ["bosses", "clearsBy", "bestBy"]) {
    let rawMap = asObject(rawStats[key]);
    for (let id in rawMap) {
      if (/^[a-z]{2,12}$/.test(id)) {
        stats[key][id] = cleanNumber(rawMap[id], 0, 0, 1e9);
      }
    }
  }
  // 2.8.1: per-weapon records of retired weapons count for the weapon that took them over (clears are
  // added, the best wave is the higher one), so "clear with every weapon" sees an old Ion Repeater clear
  for (const id in RL_RETIRED_WEAPONS) {
    const to = RL_RETIRED_WEAPONS[id].to;
    if (id in stats.clearsBy) {
      stats.clearsBy[to] = (stats.clearsBy[to] || 0) + stats.clearsBy[id];
      delete stats.clearsBy[id];
    }
    if (id in stats.bestBy) {
      stats.bestBy[to] = Math.max(stats.bestBy[to] || 0, stats.bestBy[id]);
      delete stats.bestBy[id];
    }
  }
  let rawSettings = asObject(raw.settings);
  for (let key in defaultSettings) {
    let def = defaultSettings[key];
    if (typeof def == "boolean") {
      save.settings[key] = cleanBool(rawSettings[key], def);
    } else {
      if (typeof def == "number") {
        save.settings[key] = rlSettingNum(key, rawSettings[key], def);
      } else {
        save.settings[key] = ["auto", "high", "battery"].includes(rawSettings[key]) ? rawSettings[key] : def;
      }
    }
  }
  save.run = cleanRun(raw.run);
  save.history = rlSanitizeHistory(raw.history);
  let rawSeen = asObject(raw.seen);
  for (let id in rawSeen) {
    if (rawSeen[id] === true) {
      save.seen[id] = true;
    }
  }
  return save;
}
const safeStorage = {
    ok: null,
    get(key) {
      try {
        return globalThis.localStorage ? localStorage.getItem(key) : null;
      } catch {
        this.ok = false;
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        this.ok = true;
        return true;
      } catch (err) {
        if (this.ok !== false) {
          logError("storage", err);
        }
        this.ok = false;
        return false;
      }
    },
    del(key) {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  },
  SaveStore = class {
    constructor() {
      this.listeners = new Set();
      let data = null,
        text = safeStorage.get(SAVE_KEY);
      if (text && text.length <= 262144)
        try {
          data = JSON.parse(text);
        } catch (err) {
          logError("load", err);
        }
      if (text && (!data || typeof data != "object")) {
        rlBackupSave(text);
      }
      this.data = data && typeof data == "object" ? rlLoadSave(data) : newSave();
      this.persistent = safeStorage.get(SAVE_KEY) !== null || safeStorage.set("riftline.probe", "1");
      safeStorage.del("riftline.probe");
    }
    get storageOk() {
      return safeStorage.ok !== false;
    }
    onChange(listener) {
      this.listeners.add(listener);
    }
    // 2.8.1: another tab or window wrote the save. `foreign` is set while this tab is in a run; the next
    // save first takes over the other tab's progress and keeps only this tab's run, settings and seen flags,
    // so neither tab rolls back the other.
    syncForeign(keepMine = true) {
      if (!this.foreign) return false;
      this.foreign = false;
      let data = null;
      try {
        data = JSON.parse(safeStorage.get(SAVE_KEY) || "null");
      } catch {}
      if (!data || typeof data != "object") return false;
      const mine = this.data,
        fresh = rlLoadSave(data);
      if (!fresh || typeof fresh != "object") return false;
      if (keepMine) {
        fresh.run = mine.run;
        fresh.settings = mine.settings;
        fresh.seen = { ...fresh.seen, ...mine.seen };
      }
      this.data = fresh;
      return true;
    }
    save(reason) {
      this.syncForeign();
      this.data.savedAt = Date.now();
      let text = JSON.stringify(this.data);
      safeStorage.set(SAVE_KEY, text);
      for (let listener of this.listeners)
        try {
          listener(text, reason);
        } catch (err) {
          logError("save-listener", err);
        }
    }
    parse(text) {
      let data,
        str = String(text ?? "").trim();
      if (!str || str.length > 262144) return { ok: false };
      try {
        data = JSON.parse(str);
      } catch {
        return { ok: false };
      }
      return !data || data.game !== "riftline" || data.v !== 1 ? { ok: false } : { ok: true, data: cleanSave(data) };
    }
    reset() {
      let settings = this.data.settings;
      this.data = newSave();
      this.data.settings = settings;
      this.save("reset");
    }
  };

// 2.5.0 A: a run saved with retired upgrades (RL_RETIRED_UPGRADES in data/upgrades.js) keeps their
// value: the levels become levels of the upgrade that took them over (rounded up, capped at its
// max), and a retired id in a pending offer becomes that upgrade, or another one of its rarity
// when it is already offered or maxed. Returns the input untouched when there is nothing to
// convert; never mutates it.
function rlMigrateUpgrades(run) {
  if (!run || typeof run !== "object" || Array.isArray(run)) return run;
  const up = run.up && typeof run.up === "object" && !Array.isArray(run.up) ? run.up : {},
    offer = Array.isArray(run.offer) ? run.offer : [],
    oldUp = Object.keys(up).filter((id) => rlRetiredUpgrade(id)),
    oldOffer = offer.filter((id) => typeof id === "string" && rlRetiredUpgrade(id));
  if (!oldUp.length && !oldOffer.length) return run;
  const out = { ...run },
    next = { ...up },
    add = {};
  for (const id of oldUp) {
    const retired = rlRetiredUpgrade(id),
      lv = Number.isFinite(up[id]) ? Math.max(0, Math.floor(up[id])) : 0;
    delete next[id];
    if (lv) add[retired.to] = (add[retired.to] || 0) + lv * retired.k;
  }
  for (const [id, level] of Object.entries(add)) {
    const cur = Number.isFinite(next[id]) ? Math.max(0, Math.floor(next[id])) : 0;
    next[id] = Math.min(upgradesById[id].max, cur + Math.ceil(level - 1e-9));
  }
  if (oldUp.length) out.up = next;
  if (oldOffer.length) {
    const kept = offer.filter((id) => typeof id === "string" && upgradesById[id]),
      picked = [],
      free = (upgrade) =>
        upgrade &&
        !upgrade.evo &&
        !upgrade.repeat &&
        (next[upgrade.id] || 0) < upgrade.max &&
        !kept.includes(upgrade.id) &&
        !picked.includes(upgrade.id);
    for (const id of offer) {
      if (!rlRetiredUpgrade(id)) {
        if (typeof id === "string" && upgradesById[id]) {
          picked.push(id);
        }
        continue;
      }
      const to = upgradesById[rlRetiredUpgrade(id).to],
        rarity = run.offerBoss ? Math.max(2, to.rarity) : to.rarity,
        upgrade =
          to.rarity === rarity && free(to) ? to : upgradeList.find((other) => other.rarity === rarity && free(other));
      if (upgrade) {
        picked.push(upgrade.id);
      }
    }
    out.offer = picked;
  }
  return out;
}
export {
  rlMigrateUpgrades,
  defaultSettings,
  RL_RETIRE_NOTE,
  SaveStore,
  SAVE_KEY,
  rlMigrateRetired,
  rlRecordRun,
  rlSanitizeHistory,
  set_RL_RETIRE_NOTE,
  cleanRun,
  newSave,
};

/* ==========================================================================
   2.5.0 B: merged workshop modules are refunded
   ========================================================================== */
/* Rift Battery, Reactor Core (→ Nova Cell) and Route Scanner (→ Field Supply) are gone. Every level
 a save bought of them is paid back at its full price; the levels of the kept modules stay as they
 are. Like rlMigrateRetired it runs on the raw save before cleanSave, never mutates its input,
 returns it untouched when there is nothing to convert and changes nothing when run twice. A saved
 run needs no change: it does not store workshop levels (World reads them from the save). */
let RL_MODULE_NOTE = null;
function set_RL_MODULE_NOTE(note) {
  return (RL_MODULE_NOTE = note);
}
function rlMigrateModules(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const ws = raw.workshop && typeof raw.workshop === "object" && !Array.isArray(raw.workshop) ? raw.workshop : null;
  if (!ws) return raw;
  const found = Object.keys(RL_RETIRED_MODULES).filter((id) => Object.prototype.hasOwnProperty.call(ws, id));
  if (!found.length) return raw;
  const workshop = { ...ws },
    names = [],
    into = [];
  let refund = 0;
  for (const id of found) {
    const retired = RL_RETIRED_MODULES[id],
      lv = Math.floor(cleanNumber(ws[id], 0, 0, retired.costs.length)),
      to = workshopModules.find((mod) => mod.id === retired.to)?.name || retired.to;
    delete workshop[id];
    if (lv > 0) {
      names.push(retired.name);
      if (!into.includes(to)) {
        into.push(to);
      }
      refund += retired.costs.slice(0, lv).reduce((sum, cost) => sum + cost, 0);
    }
  }
  const out = { ...raw, workshop };
  if (refund > 0) {
    out.shards = (Number.isFinite(raw.shards) ? Math.max(0, raw.shards) : 0) + refund;
    RL_MODULE_NOTE = { refund, names, into };
  }
  return out;
}

export { RL_MODULE_NOTE, rlMigrateModules, set_RL_MODULE_NOTE };
