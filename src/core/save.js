// Save store (localStorage key riftline.save.v1): defaults, loading and sanitizing, migrations,
// settings, run history and backups.

import { ze } from "./diagnostics.js";
import { Kl } from "../data/enemies.js";
import { ee } from "../main.js";
import { ue } from "../data/weapons.js";
import { RL_RETIRED_WEAPONS, _i, ai, rlRetired } from "../data/progression.js";
import { Zi, ri } from "../data/upgrades.js";

/* Save loading must never brick the game (2.2.2 crashed on every start once a
 save existed). Retry without the unfinished run, then fall back to a fresh
 profile while keeping the raw save in a backup key. */
function rlLoadSave(raw) {
  try {
    return ap(raw);
  } catch (e) {
    ze("load", e);
  }
  try {
    const d = ap({ ...raw, run: null });
    ze("load", "unfinished run discarded: it could not be restored");
    return d;
  } catch (e) {
    ze("load", e);
  }
  rlBackupSave(JSON.stringify(raw));
  return zh();
}
/* 2.3.2: a save that cannot be used at all (broken JSON, oversized, not an
 object) is copied to a backup key before the fresh profile's first autosave
 overwrites it — progress can then still be recovered by hand. */
function rlBackupSave(text) {
  try {
    localStorage.setItem("riftline.save.v1.backup-" + Date.now(), String(text));
  } catch (e) {
    ze("backup", e);
  }
}
/* 2.3.2: numeric settings get the range of their control (volume 0–1, zoom
 snaps to Near/Normal/Far) instead of a blanket 0–2 clamp. */
const RL_ZOOM_STEPS = [0.85, 1, 1.18];
function rlSettingNum(key, v, def) {
  const x = ni(v, def, 0, key === "sfx" || key === "music" ? 1 : 2);
  return key === "zoom" ? RL_ZOOM_STEPS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a)) : x;
}

/* ---- run history: the last 12 runs, shown under Records ---- */
function rlSanitizeHistory(h) {
  if (!Array.isArray(h)) return [];
  const out = [],
    ni2 = (v, lo, hi, d = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  for (const q of h.slice(0, 12)) {
    // 2.4.0: runs with a retired weapon stay in the list (shown with the weapon's old name)
    if (!q || typeof q !== "object" || !(ue[q.weapon] || rlRetired(q.weapon))) continue;
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
      build: Array.isArray(q.build) ? q.build.filter((id) => typeof id === "string" && ri[id]).slice(0, 6) : [],
    });
  }
  return out;
}
function rlRecordRun(w, pre, win, abandoned) {
  const d = ee.data,
    up = Object.entries(w.up || {})
      .filter(([id]) => ri[id] && !ri[id].repeat)
      .sort((a, b) => ri[b[0]].rarity - ri[a[0]].rarity || b[1] - a[1]);
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
  ee.save("history");
}
// What the last load converted (shown once as a toast after start-up).
var RL_RETIRE_NOTE = null;
// assigned from other modules (an imported binding cannot be assigned)
function set_RL_RETIRE_NOTE(v) {
  return (RL_RETIRE_NOTE = v);
}
/* Runs on the raw save before it is sanitised (ap), so it covers loading and importing. Returns
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
    else ((weapons[r.to] = true), (refund += Math.max(0, r.cost - ue[r.to].cost)));
  }
  out.weapons = weapons;
  if (sel) out.weapon = sel.to;
  if (runW) out.run = { ...run, weapon: runW.to };
  if (refund > 0) out.shards = (Number.isFinite(raw.shards) ? Math.max(0, raw.shards) : 0) + refund;
  RL_RETIRE_NOTE = { refund, names: owned.map((id) => RL_RETIRED_WEAPONS[id].name) };
  return out;
}
const _rlApBase = ap;
ap = function (raw) {
  return _rlApBase(rlMigrateRetired(raw));
};
var kh = "riftline.save.v1",
  Oh = {
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
function zh() {
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
    settings: { ...Oh },
    run: null,
    history: [],
    seen: {},
  };
}
var ni = (i, t, e = -1 / 0, n = 1 / 0) =>
    typeof i == "number" && Number.isFinite(i) ? Math.min(n, Math.max(e, i)) : t,
  e_ = (i, t) => (typeof i == "boolean" ? i : t),
  Hi = (i) => (i && typeof i == "object" && !Array.isArray(i) ? i : {});
function sr(i) {
  if (
    !i ||
    typeof i !== "object" ||
    i.v !== 1 ||
    !ue[i.weapon] ||
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
    threat: Math.floor(ni(i.threat, 0, 0, 5)),
    wave: Math.floor(ni(i.wave, 1, 1, 999)),
    endless: !!i.endless,
    up: {},
    hp: Math.max(1, Math.round(ni(i.hp, 1, 1, 1e6))),
    shards: Math.floor(ni(i.shards, 0, 0, 1e9)),
    kills: Math.floor(ni(i.kills, 0, 0, 1e9)),
    time: ni(i.time, 0, 0, 1e8),
    rerolls: Math.floor(ni(i.rerolls, 0, 0, 99)),
    revived: !!i.revived,
    nova: Math.floor(ni(i.nova, 0, 0, 100)),
    bossKills: [],
    flawless: Math.floor(ni(i.flawless, 0, 0, 1e6)),
    legendaries: Math.floor(ni(i.legendaries, 0, 0, 1e6)),
    dmgDealt: Math.floor(ni(i.dmgDealt, 0, 0, 1e12)),
    bestCombo: Math.floor(ni(i.bestCombo, 0, 0, 1e6)),
    evolved: Math.floor(ni(i.evolved, 0, 0, 1e6)),
    runStats: { dmgTaken: 0, dashes: 0, critHits: 0 },
    dmgSrc: {},
  };
  const rawUp = Hi(i.up);
  for (const d of Zi) {
    const v = Math.floor(ni(rawUp[d.id], 0, 0, d.max));
    if (v) o.up[d.id] = v;
  }
  const rawBoss = Array.isArray(i.bossKills) ? i.bossKills : [];
  o.bossKills = [...new Set(rawBoss.filter((v) => typeof v === "string" && Kl.includes(v)))];
  const rs = Hi(i.runStats);
  ((o.runStats.dmgTaken = Math.floor(ni(rs.dmgTaken, 0, 0, 1e12))),
    (o.runStats.dashes = Math.floor(ni(rs.dashes, 0, 0, 1e7))),
    (o.runStats.critHits = Math.floor(ni(rs.critHits, 0, 0, 1e9))));
  const src = Hi(i.dmgSrc);
  for (const k in src) if (/^[A-Za-z0-9_-]{1,18}$/.test(k)) o.dmgSrc[k] = Math.floor(ni(src[k], 0, 0, 1e12));
  if (Array.isArray(i.offer)) {
    const offer = [...new Set(i.offer.filter((v) => typeof v === "string" && !!ri[v]))].slice(0, 4);
    if (offer.length) ((o.offer = offer), (o.offerBoss = !!i.offerBoss));
  }
  return o;
}
function ap(i) {
  let t = zh(),
    e = Hi(i),
    n = t;
  ((n.created = ni(e.created, t.created)),
    (n.savedAt = ni(e.savedAt, 0)),
    (n.shards = Math.floor(ni(e.shards, 0, 0, 1e9))));
  for (let c in ue) Hi(e.weapons)[c] === !0 && (n.weapons[c] = !0);
  ((n.weapons.pulse = !0),
    (n.weapon = ue[e.weapon] && n.weapons[e.weapon] ? e.weapon : "pulse"),
    (n.threatMax = Math.floor(ni(e.threatMax, 0, 0, 5))),
    (n.threat = Math.floor(ni(e.threat, 0, 0, n.threatMax))));
  for (let c of ai) {
    let h = Math.floor(ni(Hi(e.workshop)[c.id], 0, 0, c.costs.length));
    h && (n.workshop[c.id] = h);
  }
  for (let c of _i) Hi(e.milestones)[c.id] === !0 && (n.milestones[c.id] = !0);
  let s = Hi(e.stats),
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
    r[c] = ni(s[c], 0, 0, 1e12);
  r.bestClearThreat = Math.floor(ni(s.bestClearThreat, -1, -1, 5));
  for (let c of ["bosses", "clearsBy", "bestBy"]) {
    let h = Hi(s[c]);
    for (let l in h) /^[a-z]{2,12}$/.test(l) && (r[c][l] = ni(h[l], 0, 0, 1e9));
  }
  let a = Hi(e.settings);
  for (let c in Oh) {
    let h = Oh[c];
    typeof h == "boolean"
      ? (n.settings[c] = e_(a[c], h))
      : typeof h == "number"
        ? (n.settings[c] = rlSettingNum(c, a[c], h))
        : (n.settings[c] = ["auto", "high", "battery"].includes(a[c]) ? a[c] : h);
  }
  n.run = sr(e.run);
  n.history = rlSanitizeHistory(e.history);
  let o = Hi(e.seen);
  for (let c in o) o[c] === !0 && (n.seen[c] = !0);
  return n;
}
var Ks = {
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
        return (this.ok !== !1 && ze("storage", e), (this.ok = !1), !1);
      }
    },
    del(i) {
      try {
        localStorage.removeItem(i);
      } catch {}
    },
  },
  Vl = class {
    constructor() {
      this.listeners = new Set();
      let t = null,
        e = Ks.get(kh);
      if (e && e.length <= 262144)
        try {
          t = JSON.parse(e);
        } catch (n) {
          ze("load", n);
        }
      e && (!t || typeof t != "object") && rlBackupSave(e);
      ((this.data = t && typeof t == "object" ? rlLoadSave(t) : zh()),
        (this.persistent = Ks.get(kh) !== null || Ks.set("riftline.probe", "1")),
        Ks.del("riftline.probe"));
    }
    get storageOk() {
      return Ks.ok !== !1;
    }
    onChange(t) {
      this.listeners.add(t);
    }
    save(t) {
      this.data.savedAt = Date.now();
      let e = JSON.stringify(this.data);
      Ks.set(kh, e);
      for (let n of this.listeners)
        try {
          n(e, t);
        } catch (s) {
          ze("save-listener", s);
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
      return !e || e.game !== "riftline" || e.v !== 1 ? { ok: !1 } : { ok: !0, data: ap(e) };
    }
    reset() {
      let t = this.data.settings;
      ((this.data = zh()), (this.data.settings = t), this.save("reset"));
    }
  };

export { Oh, RL_RETIRE_NOTE, Vl, kh, rlMigrateRetired, rlRecordRun, rlSanitizeHistory, set_RL_RETIRE_NOTE, sr, zh };
