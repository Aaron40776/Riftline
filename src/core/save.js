// Save store (localStorage key riftline.save.v1): defaults, loading and sanitizing, migrations,
// settings, run history and backups.

import { logError } from "./diagnostics.js";
import { bossOrder } from "../data/enemies.js";
import { store } from "../main.js";
import { weaponDefs } from "../data/weapons.js";
import { RL_RETIRED_WEAPONS, milestones, workshopModules, rlRetired } from "../data/progression.js";
import { upgradeList, upgradesById } from "../data/upgrades.js";

/* Save loading must never brick the game (2.2.2 crashed on every start once a
 save existed). Retry without the unfinished run, then fall back to a fresh
 profile while keeping the raw save in a backup key. */
function rlLoadSave(raw) {
  try {
    return cleanSave(raw);
  } catch (e) {
    logError("load", e);
  }
  try {
    const d = cleanSave({ ...raw, run: null });
    logError("load", "unfinished run discarded: it could not be restored");
    return d;
  } catch (e) {
    logError("load", e);
  }
  rlBackupSave(JSON.stringify(raw));
  return newSave();
}
/* 2.3.2: a save that cannot be used at all (broken JSON, oversized, not an
 object) is copied to a backup key before the fresh profile's first autosave
 overwrites it — progress can then still be recovered by hand. */
function rlBackupSave(text) {
  try {
    localStorage.setItem("riftline.save.v1.backup-" + Date.now(), String(text));
  } catch (e) {
    logError("backup", e);
  }
}
/* 2.3.2: numeric settings get the range of their control (volume 0–1, zoom
 snaps to Near/Normal/Far) instead of a blanket 0–2 clamp. */
const RL_ZOOM_STEPS = [0.85, 1, 1.18];
function rlSettingNum(key, v, def) {
  const x = cleanNumber(v, def, 0, key === "sfx" || key === "music" ? 1 : 2);
  return key === "zoom" ? RL_ZOOM_STEPS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a)) : x;
}

/* ---- run history: the last 12 runs, shown under Records ---- */
function rlSanitizeHistory(h) {
  if (!Array.isArray(h)) return [];
  const out = [],
    ni2 = (v, lo, hi, d = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  for (const q of h.slice(0, 12)) {
    // 2.4.0: runs with a retired weapon stay in the list (shown with the weapon's old name)
    if (!q || typeof q !== "object" || !(weaponDefs[q.weapon] || rlRetired(q.weapon))) continue;
    out.push({
      t: ni2(q.t, 0, 9e15),
      weapon: q.weapon,
      threat: Math.floor(ni2(q.threat, 0, 5)),
      wave: Math.floor(ni2(q.wave, 1, 999, 1)),
      outcome: ["win", "dead", "quit"].includes(q.outcome) ? q.outcome : "dead",
      endless: !!q.endless,
      time: Math.round(ni2(q.time, 0, 1e7)),
      kills: Math.floor(ni2(q.kills, 0, 1e9)),
      shards: Math.floor(ni2(q.shards, 0, 1e9)),
      killer: typeof q.killer === "string" && /^[a-z]{1,18}$/.test(q.killer) ? q.killer : "",
      build: Array.isArray(q.build)
        ? q.build.filter((id) => typeof id === "string" && upgradesById[id]).slice(0, 6)
        : [],
    });
  }
  return out;
}
function rlRecordRun(w, pre, win, abandoned) {
  const d = store.data,
    up = Object.entries(w.up || {})
      .filter(([id]) => upgradesById[id] && !upgradesById[id].repeat)
      .sort((a, b) => upgradesById[b[0]].rarity - upgradesById[a[0]].rarity || b[1] - a[1]);
  const entry = {
    t: Date.now(),
    weapon: w.weapon,
    threat: w.threat,
    wave: win && !w.endless ? 20 : w.wave,
    outcome: win ? "win" : abandoned ? "quit" : "dead",
    endless: !!w.endless,
    time: Math.round(w.time),
    kills: w.kills,
    shards: Math.max(0, d.shards - pre.bank),
    killer: (!win && !abandoned && w.lastHit) || "",
    build: up.slice(0, 6).map(([id]) => id),
  };
  d.history = rlSanitizeHistory([entry, ...(d.history || [])]);
  store.save("history");
}
// What the last load converted (shown once as a toast after start-up).
var RL_RETIRE_NOTE = null;
// assigned from other modules (an imported binding cannot be assigned)
function set_RL_RETIRE_NOTE(v) {
  return (RL_RETIRE_NOTE = v);
}
/* Runs on the raw save before it is sanitised (cleanSave), so it covers loading and importing. Returns
 the input untouched when there is nothing to convert; never mutates it (rlLoadSave may still
 back up the raw object). Running it again on its own output changes nothing. */
function rlMigrateRetired(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null),
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
    const r = RL_RETIRED_WEAPONS[id];
    delete weapons[id];
    if (weapons[r.to] === true) refund += r.cost;
    else ((weapons[r.to] = true), (refund += Math.max(0, r.cost - weaponDefs[r.to].cost)));
  }
  out.weapons = weapons;
  if (sel) out.weapon = sel.to;
  if (runW) out.run = { ...run, weapon: runW.to };
  if (refund > 0) out.shards = (Number.isFinite(raw.shards) ? Math.max(0, raw.shards) : 0) + refund;
  RL_RETIRE_NOTE = { refund, names: owned.map((id) => RL_RETIRED_WEAPONS[id].name) };
  return out;
}
const _rlCleanSaveBase = cleanSave;
cleanSave = function (raw) {
  return _rlCleanSaveBase(rlMigrateRetired(raw));
};
var SAVE_KEY = "riftline.save.v1",
  defaultSettings = {
    sfx: 0.8,
    music: 0.45,
    autoFire: !0,
    assist: !0,
    shake: !0,
    numbers: !0,
    quality: "auto",
    swap: !1,
    zoom: 1,
    contrast: !1,
    calm: !1,
    // 2.4.2: optional HUD readouts
    timer: !1,
    fps: !1,
  };
function newSave() {
  return {
    v: 1,
    game: "riftline",
    created: Date.now(),
    savedAt: 0,
    shards: 0,
    weapon: "pulse",
    weapons: { pulse: !0 },
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
var cleanNumber = (i, t, e = -1 / 0, n = 1 / 0) =>
    typeof i == "number" && Number.isFinite(i) ? Math.min(n, Math.max(e, i)) : t,
  cleanBool = (i, t) => (typeof i == "boolean" ? i : t),
  asObject = (i) => (i && typeof i == "object" && !Array.isArray(i) ? i : {});
function cleanRun(i) {
  if (
    !i ||
    typeof i !== "object" ||
    i.v !== 1 ||
    !weaponDefs[i.weapon] ||
    !Number.isFinite(i.wave) ||
    i.wave < 1 ||
    i.wave > 999 ||
    !Number.isFinite(i.hp) ||
    i.hp <= 0
  )
    return null;
  const o = {
    v: 1,
    seed: Number.isFinite(i.seed) ? i.seed >>> 0 : 0,
    weapon: i.weapon,
    threat: Math.floor(cleanNumber(i.threat, 0, 0, 5)),
    wave: Math.floor(cleanNumber(i.wave, 1, 1, 999)),
    endless: !!i.endless,
    up: {},
    hp: Math.max(1, Math.round(cleanNumber(i.hp, 1, 1, 1e6))),
    shards: Math.floor(cleanNumber(i.shards, 0, 0, 1e9)),
    kills: Math.floor(cleanNumber(i.kills, 0, 0, 1e9)),
    time: cleanNumber(i.time, 0, 0, 1e8),
    rerolls: Math.floor(cleanNumber(i.rerolls, 0, 0, 99)),
    revived: !!i.revived,
    nova: Math.floor(cleanNumber(i.nova, 0, 0, 100)),
    bossKills: [],
    flawless: Math.floor(cleanNumber(i.flawless, 0, 0, 1e6)),
    legendaries: Math.floor(cleanNumber(i.legendaries, 0, 0, 1e6)),
    dmgDealt: Math.floor(cleanNumber(i.dmgDealt, 0, 0, 1e12)),
    bestCombo: Math.floor(cleanNumber(i.bestCombo, 0, 0, 1e6)),
    evolved: Math.floor(cleanNumber(i.evolved, 0, 0, 1e6)),
    runStats: { dmgTaken: 0, dashes: 0, critHits: 0 },
    dmgSrc: {},
  };
  const rawUp = asObject(i.up);
  for (const d of upgradeList) {
    const v = Math.floor(cleanNumber(rawUp[d.id], 0, 0, d.max));
    if (v) o.up[d.id] = v;
  }
  const rawBoss = Array.isArray(i.bossKills) ? i.bossKills : [];
  o.bossKills = [...new Set(rawBoss.filter((v) => typeof v === "string" && bossOrder.includes(v)))];
  const rs = asObject(i.runStats);
  ((o.runStats.dmgTaken = Math.floor(cleanNumber(rs.dmgTaken, 0, 0, 1e12))),
    (o.runStats.dashes = Math.floor(cleanNumber(rs.dashes, 0, 0, 1e7))),
    (o.runStats.critHits = Math.floor(cleanNumber(rs.critHits, 0, 0, 1e9))));
  const src = asObject(i.dmgSrc);
  for (const k in src) if (/^[A-Za-z0-9_-]{1,18}$/.test(k)) o.dmgSrc[k] = Math.floor(cleanNumber(src[k], 0, 0, 1e12));
  if (Array.isArray(i.offer)) {
    const offer = [...new Set(i.offer.filter((v) => typeof v === "string" && !!upgradesById[v]))].slice(0, 4);
    if (offer.length) ((o.offer = offer), (o.offerBoss = !!i.offerBoss));
  }
  return o;
}
function cleanSave(i) {
  let t = newSave(),
    e = asObject(i),
    n = t;
  ((n.created = cleanNumber(e.created, t.created)),
    (n.savedAt = cleanNumber(e.savedAt, 0)),
    (n.shards = Math.floor(cleanNumber(e.shards, 0, 0, 1e9))));
  for (let c in weaponDefs) asObject(e.weapons)[c] === !0 && (n.weapons[c] = !0);
  ((n.weapons.pulse = !0),
    (n.weapon = weaponDefs[e.weapon] && n.weapons[e.weapon] ? e.weapon : "pulse"),
    (n.threatMax = Math.floor(cleanNumber(e.threatMax, 0, 0, 5))),
    (n.threat = Math.floor(cleanNumber(e.threat, 0, 0, n.threatMax))));
  for (let c of workshopModules) {
    let h = Math.floor(cleanNumber(asObject(e.workshop)[c.id], 0, 0, c.costs.length));
    h && (n.workshop[c.id] = h);
  }
  for (let c of milestones) asObject(e.milestones)[c.id] === !0 && (n.milestones[c.id] = !0);
  let s = asObject(e.stats),
    r = t.stats;
  for (let c of [
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
    r[c] = cleanNumber(s[c], 0, 0, 1e12);
  r.bestClearThreat = Math.floor(cleanNumber(s.bestClearThreat, -1, -1, 5));
  for (let c of ["bosses", "clearsBy", "bestBy"]) {
    let h = asObject(s[c]);
    for (let l in h) /^[a-z]{2,12}$/.test(l) && (r[c][l] = cleanNumber(h[l], 0, 0, 1e9));
  }
  let a = asObject(e.settings);
  for (let c in defaultSettings) {
    let h = defaultSettings[c];
    typeof h == "boolean"
      ? (n.settings[c] = cleanBool(a[c], h))
      : typeof h == "number"
        ? (n.settings[c] = rlSettingNum(c, a[c], h))
        : (n.settings[c] = ["auto", "high", "battery"].includes(a[c]) ? a[c] : h);
  }
  n.run = cleanRun(e.run);
  n.history = rlSanitizeHistory(e.history);
  let o = asObject(e.seen);
  for (let c in o) o[c] === !0 && (n.seen[c] = !0);
  return n;
}
var safeStorage = {
    ok: null,
    get(i) {
      try {
        return globalThis.localStorage ? localStorage.getItem(i) : null;
      } catch {
        return ((this.ok = !1), null);
      }
    },
    set(i, t) {
      try {
        return (localStorage.setItem(i, t), (this.ok = !0), !0);
      } catch (e) {
        return (this.ok !== !1 && logError("storage", e), (this.ok = !1), !1);
      }
    },
    del(i) {
      try {
        localStorage.removeItem(i);
      } catch {}
    },
  },
  SaveStore = class {
    constructor() {
      this.listeners = new Set();
      let t = null,
        e = safeStorage.get(SAVE_KEY);
      if (e && e.length <= 262144)
        try {
          t = JSON.parse(e);
        } catch (n) {
          logError("load", n);
        }
      e && (!t || typeof t != "object") && rlBackupSave(e);
      ((this.data = t && typeof t == "object" ? rlLoadSave(t) : newSave()),
        (this.persistent = safeStorage.get(SAVE_KEY) !== null || safeStorage.set("riftline.probe", "1")),
        safeStorage.del("riftline.probe"));
    }
    get storageOk() {
      return safeStorage.ok !== !1;
    }
    onChange(t) {
      this.listeners.add(t);
    }
    save(t) {
      this.data.savedAt = Date.now();
      let e = JSON.stringify(this.data);
      safeStorage.set(SAVE_KEY, e);
      for (let n of this.listeners)
        try {
          n(e, t);
        } catch (s) {
          logError("save-listener", s);
        }
    }
    parse(t) {
      let e,
        r = String(t ?? "").trim();
      if (!r || r.length > 262144) return { ok: !1 };
      try {
        e = JSON.parse(r);
      } catch {
        return { ok: !1 };
      }
      return !e || e.game !== "riftline" || e.v !== 1 ? { ok: !1 } : { ok: !0, data: cleanSave(e) };
    }
    reset() {
      let t = this.data.settings;
      ((this.data = newSave()), (this.data.settings = t), this.save("reset"));
    }
  };

export {
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
