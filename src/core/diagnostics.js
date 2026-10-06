// Error log, runtime counters, health checks, the live run monitor and the post-run audit
// (Settings → Diagnostics). The deep self-test lives in selftest.js.

import { GameUI, RL_TOUCH_CLICK_GUARD } from "../ui/ui.js";
import { musicChords, RL_SFX_VOICES, rlShotSfx, musicVoices } from "../audio/sound.js";
import { SAVE_KEY, cleanRun } from "./save.js";
import { RL_MESH_TYPES } from "../render/models.js";
import { enemyDefs, RL_ENEMY_TIPS, bossDefs } from "../data/enemies.js";
import { ui, store, game, safeAreaInsets, input, renderer } from "../main.js";
import { BUILD_ID, GAME_VERSION, formatTime } from "./util.js";
import { biomesById, biomeList } from "../data/biomes.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { waveEvents } from "./waves.js";
import { World } from "./world.js";
import { threatMods, workshopModules } from "../data/progression.js";
import { upgradeList, upgradesById } from "../data/upgrades.js";
import { hitsObstacle } from "./arena.js";

const RL_LOG_VERSION = __RL_VERSION__,
  LOG_KEY = "riftline.log.v4";
let errorLog = [],
  logListeners = new Set(),
  logContext = {},
  RL_RT = {
    pointerdown: 0,
    pointermove: 0,
    pointerup: 0,
    pointercancel: 0,
    keydown: 0,
    keyup: 0,
    reset: 0,
    runStartMs: 0,
    runErrorSnapshot: null,
    orientationChanges: 0,
    buttonActivations: 0,
    lastButton: null,
    uiGuardDrops: 0,
  };
function saveErrorLog() {
  try {
    if (globalThis.localStorage) {
      localStorage.setItem(LOG_KEY, JSON.stringify(errorLog));
    }
  } catch {}
}
try {
  let saved = globalThis.localStorage && localStorage.getItem(LOG_KEY);
  if (saved) {
    let entries = JSON.parse(saved);
    if (Array.isArray(entries)) {
      entries.slice(-30).forEach((entry) => {
        if (entry && entry.v === RL_LOG_VERSION) {
          errorLog.push(entry);
        }
      });
    }
  }
} catch {}
try {
  if (globalThis.localStorage)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      let key = localStorage.key(i);
      if (key && (key.startsWith("riftline.log.v2.") || key === "riftline.log.v3")) {
        localStorage.removeItem(key);
      }
    }
} catch {}
function setLogContext(context) {
  logContext = { ...logContext, ...context };
}
function logError(where, error) {
  let errorObj = error && typeof error === "object" ? error : null,
    cause = errorObj && errorObj.error ? errorObj.error : errorObj && errorObj.reason ? errorObj.reason : error,
    msg = String((cause && cause.message) || (errorObj && errorObj.message) || cause || "unknown").slice(0, 300),
    file = String((errorObj && (errorObj.filename || errorObj.fileName || "")) || "").slice(0, 500),
    line = Number(errorObj && (errorObj.lineno || errorObj.line || 0)) || 0,
    col = Number(errorObj && (errorObj.colno || errorObj.column || 0)) || 0,
    stack = String((cause && cause.stack) || "")
      .split(
        `
`,
      )
      .slice(0, 6)
      .join(
        `
`,
      )
      .slice(0, 1000),
    location = file ? `${file}:${line}:${col}` : "";
  if (location && msg.endsWith("Script error.")) msg += ` @ ${location}`;
  let now = new Date().toISOString(),
    existing = errorLog.find(
      (item) =>
        item.msg === msg && item.where === where && item.file === file && item.line === line && item.col === col,
    );
  if (existing) {
    existing.n++;
    existing.last = now;
  } else {
    for (
      errorLog.push({
        where: where,
        msg: msg,
        stack: stack,
        n: 1,
        first: now,
        last: now,
        v: logContext.version || RL_LOG_VERSION,
        file: file,
        line: line,
        col: col,
      });
      errorLog.length > 30;
    )
      errorLog.shift();
    if (typeof console < "u") {
      console.error("[riftline]", where, error);
    }
  }
  saveErrorLog();
  for (let listener of logListeners)
    try {
      listener();
    } catch {}
}
function getErrorLog() {
  return errorLog;
}
function onLogChange(listener) {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}
function clearErrorLog() {
  errorLog.length = 0;
  saveErrorLog();
  for (let listener of logListeners) listener();
}
function buildReport() {
  let lines = [
    "Riftline " + (logContext.version || RL_LOG_VERSION) + " " + (logContext.build || ""),
    "Mode: " + (logContext.mode || "?"),
    "UA: " + (typeof navigator < "u" ? navigator.userAgent : "node"),
    "Screen: " + (typeof window < "u" ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}` : "-"),
    "GPU: " + (logContext.gpu || "?"),
    "Time: " + new Date().toISOString(),
    "",
    rlHealthSummary(),
    "Health checks:",
  ];
  for (let check of RL_HEALTH) lines.push(`[${check.status}] ${check.id}: ${check.detail}`);
  rlAuditReportLines(lines);
  lines.push(
    "",
    "Runtime: pointer " +
      RL_RT.pointerdown +
      "/" +
      RL_RT.pointermove +
      "/" +
      RL_RT.pointerup +
      "/" +
      RL_RT.pointercancel +
      " · keys " +
      RL_RT.keydown +
      "/" +
      RL_RT.keyup +
      " · buttons " +
      RL_RT.buttonActivations +
      " · rotates " +
      RL_RT.orientationChanges +
      (RL_RT.lastButton ? " · last " + RL_RT.lastButton : "") +
      " · ui-dedupes " +
      RL_RT.uiGuardDrops,
  );
  if (!errorLog.length) {
    lines.push("", "Errors: none recorded.");
  }
  for (let item of errorLog) {
    let location = item.file ? ` @ ${item.file}:${item.line || 0}:${item.col || 0}` : "";
    lines.push(
      `[${item.where}] ${item.msg}  (x${item.n}, v${item.v}${location}, first ${item.first}, last ${item.last})`,
    );
    if (item.stack) {
      lines.push(
        item.stack
          .split(
            `
`,
          )
          .map((line) => "    " + line.trim()).join(`
`),
      );
    }
  }
  return lines.join(`
`);
}
let RL_REQUIRED_DOM = [
    "abandonBtn",
    "backupBtn",
    "bank",
    "banner",
    "bestLine",
    "bossBar",
    "gadgetBtn",
    "bossFill",
    "bossLag",
    "bossName",
    "bossPhase",
    "bossTicks",
    "buffs",
    "buildStrip",
    "cards",
    "choose",
    "chooseEyebrow",
    "chooseHp",
    "chooseHpNum",
    "chooseTitle",
    "coach",
    "coachDots",
    "coachText",
    "combo",
    "comboBar",
    "comboN",
    "continueBtn",
    "crash",
    "crashCopy",
    "crashHome",
    "crashLog",
    "dashBtn",
    "dashSec",
    "dialog",
    "dlgBody",
    "dlgBtns",
    "dlgTitle",
    "endlessBtn",
    "flash",
    "homeBtn",
    "hpFill",
    "hpLag",
    "hpNum",
    "hud",
    "logBtn",
    "logCount",
    "msList",
    "novaBtn",
    "over",
    "overBest",
    "overCause",
    "overDmg",
    "overExtra",
    "overEyebrow",
    "overMs",
    "overStats",
    "overTitle",
    "pause",
    "pauseBtn",
    "pauseBuild",
    "pauseStats",
    "pauseTitle",
    "payRows",
    "payTotal",
    "playBtn",
    "qualityNote",
    "recBadge",
    "replayTutBtn",
    "rerollBtn",
    "rerollTxt",
    "resetBtn",
    "restartBtn",
    "restoreBtn",
    "resumeBtn",
    "retryBtn",
    "pauseSetBtn",
    "pauseUpInfo",
    "hudInfo",
    "setTimer",
    "setFps",
    "runShards",
    "setAssist",
    "setAuto",
    "setContrast",
    "setMusic",
    "setNumbers",
    "setQuality",
    "setSfx",
    "setShake",
    "setZoom",
    "settings",
    "shardChip",
    "shareBtn",
    "shieldPip",
    "statGrid",
    "storageWarn",
    "tDesc",
    "tName",
    "tNext",
    "tPrev",
    "toasts",
    "touch",
    "verText",
    "vignette",
    "wBlurb",
    "wBuy",
    "wIndex",
    "wName",
    "wNext",
    "wPrev",
    "wStats",
    "waveLabel",
    "waveProg",
    "waveProgFill",
    "waveSub",
    "wsList",
  ],
  RL_HEALTH = [];
function rlHealthAdd(id, status, detail) {
  RL_HEALTH.push({ id: id, status: status, detail: String(detail || "") });
}
let RL_LAST_RUN_AUDIT = null;
// assigned from other modules (an imported binding cannot be assigned)
function set_RL_LAST_RUN_AUDIT(value) {
  return (RL_LAST_RUN_AUDIT = value);
}
/* ==========================================================================
 Riftline 2.2.3 diagnostics
 --------------------------------------------------------------------------
 rlRunAudit      final-state sanity of the world when a run ends (2.2.x checks)
 RL_MON          live run monitor: invariants, waves, events, snapshots, perf
 rlMonFinish     post-run audit = final state + monitor + save/economy checks
 rlRunHealth     fast health checks; the heavy simulation self-test only runs
                 on demand ({deep:true}) so startup and run end never block
                 the UI thread.
 ========================================================================== */
function rlRunAudit(world, outcome, abandoned) {
  const fail = [],
    warn = [],
    finite = (value) => Number.isFinite(value),
    add = (id, msg) => fail.push(`${id}: ${msg}`),
    addWarn = (id, msg) => warn.push(`${id}: ${msg}`);
  try {
    if (!world) {
      add("world", "world missing");
      return (RL_LAST_RUN_AUDIT = { ok: false, fail, warn, checks: [], outcome: "missing" });
    }
    const arena = world.arena;
    if (!arena || !finite(arena.W) || !finite(arena.H) || !Array.isArray(arena.obs))
      add("arena", "invalid arena geometry");
    if (arena) {
      if (!arena.biome || !biomesById[arena.biome.id]) add("biome", "unknown live biome");
      for (const enemy of world.enemies || [])
        if (!enemy?.type || !(enemyDefs[enemy.type] || (enemy.boss && bossDefs[enemy.type])))
          add("enemy", "unknown live enemy type");
      const checkObj = (arr, id) => {
        if (!Array.isArray(arr)) return;
        for (const item of arr) {
          for (const key of ["x", "y"]) {
            if (key in item && !finite(item[key])) {
              add(id, `non-finite ${key}`);
              break;
            }
          }
          if ("r" in item && !finite(item.r)) add(id, "non-finite radius");
        }
      };
      checkObj(arena.obs, "obstacle");
      checkObj(arena.vents, "vent");
      checkObj(arena.ice, "ice");
      checkObj(arena.acid, "acid");
      const pts = [];
      for (const portal of arena.portals || []) {
        if (![portal.ax, portal.ay, portal.bx, portal.by].every(finite)) {
          add("portal", "non-finite endpoint");
          continue;
        }
        const dist = Math.hypot(portal.ax - portal.bx, portal.ay - portal.by);
        if (dist < 7) add("portal", `pair distance ${dist.toFixed(2)} < 7.00`);
        for (const end of [
          { x: portal.ax, y: portal.ay },
          { x: portal.bx, y: portal.by },
        ]) {
          if (Math.abs(end.x) > arena.W - 3.6 || Math.abs(end.y) > arena.H - 3.6)
            add("portal", "endpoint outside safe bounds");
          if (hitsObstacle(arena.obs, end.x, end.y, 1.5)) add("portal", "endpoint overlaps obstacle");
          for (const old of pts) {
            const gap = Math.hypot(end.x - old.x, end.y - old.y);
            if (gap < 4) add("portal", `endpoint spacing ${gap.toFixed(2)} < 4.00`);
          }
          pts.push(end);
        }
      }
    }
    const finiteState = (obj, id) => {
      if (!obj || typeof obj !== "object") return;
      for (const key of ["x", "y", "vx", "vy", "hp", "life", "t"]) {
        if (key in obj && !finite(obj[key])) {
          add(id, `non-finite ${key}`);
          break;
        }
      }
    };
    for (const enemy of world.enemies || []) finiteState(enemy, "enemy");
    for (const shot of world.pb || []) finiteState(shot, "projectile");
    for (const shot of world.eb || []) finiteState(shot, "enemy-shot");
    for (const hazard of world.hazards || []) finiteState(hazard, "hazard");
    for (const marker of world.markers || []) finiteState(marker, "marker");
    for (const pickup of world.pickups || []) finiteState(pickup, "pickup");
    if (world.boss) finiteState(world.boss, "boss");
    const player = world.player;
    if (!player || ![player.x, player.y, player.vx, player.vy, player.hp].every(finite))
      add("player", "non-finite final player state");
    if (!finite(world.time) || !finite(world.shards) || !finite(world.kills)) add("run-state", "non-finite run totals");
    if (!["dead", "victory"].includes(world.state) && !abandoned) addWarn("state", `run ended in state ${world.state}`);
    if (world.event && (!waveEvents[world.event] || world.event === "dark"))
      add("event", "removed/invalid event reached at runtime");
  } catch (err) {
    add("audit-exception", (err && err.message) || String(err));
  }
  const audit = {
    ok: fail.length === 0,
    fail,
    warn,
    checks: [],
    outcome: abandoned ? "abandoned" : outcome ? "victory" : "defeat",
    wave: world?.wave || 0,
    time: world?.time || 0,
    kills: world?.kills || 0,
    shards: world?.shards || 0,
  };
  RL_LAST_RUN_AUDIT = audit;
  return audit;
}

/* ---- event contract: every event the simulation emits must have a consumer
 (renderer, sound or UI) or be explicitly internal. Boss events must only be
 emitted while a boss is alive — enemy code once reused "phase"/"dash". ---- */
const RL_EVENT_KINDS = new Set([
  "mutator",
  // 3.17.0: the walker: a foot comes down, the landing after a dash
  "step",
  "land",
  // 3.15.0: the boss cards
  "lockdown",
  "lockOn",
  "hammerReady",
  "shatter",
  "splinterHit",
  "broodHatch",
  "implode",
  "aim",
  "beamWarn",
  "blink",
  "blinkWarn",
  "block",
  "boom",
  "boss",
  "bossAtk",
  "bossDown",
  "bounce",
  "bountyPulse",
  "chain",
  "champion",
  "championDown",
  "charge",
  "chill",
  // 3.7.1: an electric trap (plate, rift burst) stuns the drone
  "stun",
  "cleared",
  "combo",
  "comboEnd",
  "surge",
  "dash",
  "dmg",
  "edash",
  "die",
  "enrage",
  "erupt",
  "eshot",
  "freeze",
  "fuse",
  "guardBreak",
  "guardUp",
  "hatch",
  "heal",
  "hurt",
  "kill",
  "lob",
  "maxed",
  "mend",
  "mine",
  "nova",
  "novaReady",
  "offer",
  "phase",
  "pick",
  "ping",
  "pop",
  "portal",
  "reroll",
  "revive",
  "shard",
  "shieldBreak",
  "shieldPop",
  "shieldUp",
  "shot",
  "spark",
  "spawn",
  "supplyDrop",
  "thud",
  "victory",
  "warp",
  "wave",
  "wingShot",
  "zap",
]);
const RL_BOSS_EVENTS = new Set(["phase", "enrage", "bossAtk"]);
/* positional payload the renderer reads for each event (missing -> NaN geometry) */
const RL_EVENT_FIELDS = {
  warp: ["x", "y", "tx", "ty"],
  kill: ["x", "y"],
  spawn: ["x", "y"],
  boom: ["x", "y", "r"],
  surge: ["x", "y", "r", "n"],
  erupt: ["x", "y", "r"],
  stun: ["x", "y"],
  edash: ["x", "y"],
  blink: ["x", "y"],
  heal: ["x", "y"],
  hurt: ["x", "y"],
  portal: ["x", "y"],
  dmg: ["x", "y"],
  chain: ["pts"],
};
function rlEventPayloadError(event) {
  const finite = Number.isFinite,
    need = RL_EVENT_FIELDS[event.k];
  if (need)
    for (const field of need)
      if (field === "pts" ? !Array.isArray(event.pts) || !event.pts.every(finite) : !finite(event[field]))
        return `"${event.k}" is missing ${field}`;
  if (
    event.k === "mend" &&
    !(finite(event.x) && finite(event.y) && ((finite(event.tx) && finite(event.ty)) || finite(event.r)))
  )
    return `"mend" needs a target (tx/ty) or a radius`;
  if ("x" in event && !(finite(event.x) && finite(event.y))) return `"${event.k}" has a non-finite position`;
  return "";
}
let RL_MON = null;
function rlMonErrKey(entry) {
  return `${entry.where}|${entry.msg}|${entry.file}|${entry.line}`;
}
function rlMonStart(world, resume) {
  RL_MON = {
    w: world,
    resume: !!resume,
    t0: Date.now(),
    startWave: world.wave,
    weapon: world.weapon,
    threat: world.threat,
    errBase: new Map(errorLog.map((entry) => [rlMonErrKey(entry), entry.n])),
    inputBase: RL_RT.pointerdown + RL_RT.keydown,
    frames: 0,
    dtSum: 0,
    slow: 0,
    worst: 0,
    workSum: 0,
    lastT: 0,
    steps: 0,
    samples: 0,
    idleT: 0,
    issues: new Map(),
    waves: [],
    cur: null,
    events: 0,
    kinds: {},
    types: new Set(),
    peak: { enemies: 0, pb: 0, eb: 0, pickups: 0 },
    snaps: { checked: 0, ok: 0 },
    pendingSnap: 0,
    pendingSnapFrames: 0,
    shards: world.shards,
    kills: world.kills,
  };
  rlMonBeginWave(world);
  // Resumed at the upgrade choice (or continuing into endless): that wave is already won.
  if (world.state === "choose" || world.state === "victory") RL_MON.cur.cleared = true;
}
function rlMonIssue(sev, id, msg) {
  const mon = RL_MON;
  if (!mon) return;
  const key = sev + "|" + id + "|" + msg,
    issue = mon.issues.get(key);
  if (issue) issue.n++;
  else if (mon.issues.size < 80) mon.issues.set(key, { sev, id, msg, n: 1, wave: mon.w?.wave || 0 });
}
function rlMonBeginWave(world) {
  const mon = RL_MON;
  if (!mon) return;
  if (mon.cur && !mon.cur.cleared && mon.cur.wave !== world.wave)
    rlMonIssue("WARN", "waves", `wave ${mon.cur.wave} was left without a clear`);
  mon.cur = {
    wave: world.wave,
    biome: world.arena?.biome?.id || "?",
    mode: world.waveMode || "-",
    boss: !!(world.bossPending || world.boss),
    t0: world.time,
    cleared: false,
    secs: 0,
    planned: world.planTotal || 0,
  };
  mon.waves.push(mon.cur);
  // Spawn plan contract: every member must be {type, elite} with a known enemy type.
  for (const group of world.plan || []) {
    if (!group || !Array.isArray(group.members) || !Number.isFinite(group.gap)) {
      rlMonIssue("FAIL", "spawn-plan", `wave ${world.wave}: malformed spawn group`);
      continue;
    }
    for (const member of group.members)
      if (!member || typeof member !== "object" || !enemyDefs[member.type])
        rlMonIssue("FAIL", "spawn-plan", `wave ${world.wave}: invalid plan member ${JSON.stringify(member)}`);
  }
  if (world.bossPending && !bossDefs[world.bossPending])
    rlMonIssue("FAIL", "spawn-plan", `wave ${world.wave}: unknown boss ${world.bossPending}`);
  if (world.championPending && !enemyDefs[world.championPending])
    rlMonIssue("FAIL", "spawn-plan", `wave ${world.wave}: unknown champion ${world.championPending}`);
  for (const [key, value] of Object.entries(world.stats || {}))
    if (typeof value === "number" && !Number.isFinite(value))
      rlMonIssue("FAIL", "stats", `wave ${world.wave}: stat ${key} is not finite`);
  mon.pendingSnap = world.wave;
  mon.pendingSnapFrames = 0;
}
function rlMonStep(world, fxStart, dash0, sh0, killsStart, dt) {
  const mon = RL_MON;
  mon.steps++;
  const fx = world.fx;
  for (let i = fxStart; i < fx.length; i++) {
    const event = fx[i],
      kind = event && event.k;
    mon.events++;
    mon.kinds[kind] = (mon.kinds[kind] || 0) + 1;
    if (!RL_EVENT_KINDS.has(kind)) rlMonIssue("WARN", "events", `"${kind}" has no consumer`);
    {
      const payloadError = rlEventPayloadError(event);
      if (payloadError) {
        rlMonIssue("FAIL", "events", payloadError);
      }
    }
    if (RL_BOSS_EVENTS.has(kind) && !world.boss)
      rlMonIssue("FAIL", "events", `boss event "${kind}" emitted without an active boss`);
    if (kind === "phase" && world.boss && world.boss.type !== "core")
      rlMonIssue("FAIL", "events", `"phase" emitted by ${world.boss.type}`);
    if (kind === "dash" && world.player.dashId === dash0)
      rlMonIssue("FAIL", "events", `"dash" emitted although the player did not dash`);
    if (kind === "spawn" || kind === "boss") {
      const type = kind === "boss" ? event.id : event.type,
        known = kind === "boss" ? !!bossDefs[type] : !!enemyDefs[type];
      if (!known) rlMonIssue("FAIL", "spawns", `unknown ${kind} type ${type}`);
      else {
        mon.types.add(type);
        if (kind === "spawn" && renderer && !renderer.enemyPools[type])
          rlMonIssue("FAIL", "render", `no mesh pool for enemy ${type}`);
      }
    }
    if (kind === "shot" && !weaponDefs[event.w]) rlMonIssue("FAIL", "weapons", `shot from unknown weapon ${event.w}`);
    if (kind === "cleared" && mon.cur) {
      mon.cur.cleared = true;
      mon.cur.secs = world.time - mon.cur.t0;
      if (world.enemies.length || world.markers.length || world.planIdx < world.plan.length)
        rlMonIssue(
          "FAIL",
          "wave-end",
          `wave ${world.wave} cleared with ${world.enemies.length} enemies / ${world.markers.length} markers / ${world.plan.length - world.planIdx} groups left`,
        );
    }
  }
  if (world.shards < sh0) rlMonIssue("FAIL", "economy", "run shards decreased during a step");
  if (world.kills < killsStart) rlMonIssue("FAIL", "economy", "kill counter decreased during a step");
  // Soft-lock: nothing left to fight, but the wave does not end.
  const empty =
    world.state === "fight" &&
    world.planIdx >= world.plan.length &&
    !world.bossPending &&
    !world.championPending &&
    !world.enemies.length &&
    !world.markers.length;
  mon.idleT = empty ? mon.idleT + dt : 0;
  if (mon.idleT > 4) rlMonIssue("FAIL", "wave-end", `wave ${world.wave} did not end although no enemies remain`);
  if (world.state === "fight" && mon.cur && world.time - mon.cur.t0 > 480)
    rlMonIssue("WARN", "waves", `wave ${world.wave} has lasted over 8 minutes`);
  if (mon.steps % 20 === 0) rlMonSample(world);
}
function rlMonSample(world) {
  const mon = RL_MON,
    finite = Number.isFinite,
    player = world.player,
    arena = world.arena;
  mon.samples++;
  if (![player.x, player.y, player.vx, player.vy, player.hp, player.nova].every(finite))
    rlMonIssue("FAIL", "invariants", "player state became non-finite");
  else {
    if (Math.abs(player.x) > arena.W + 0.05 || Math.abs(player.y) > arena.H + 0.05)
      rlMonIssue("FAIL", "invariants", "player left the arena bounds");
    if (player.hp > world.stats.maxHp + 0.5) rlMonIssue("FAIL", "invariants", "player HP above max HP");
    if (player.nova < 0 || player.nova > 100.01) rlMonIssue("FAIL", "invariants", "nova charge outside 0–100");
  }
  for (const enemy of world.enemies) {
    if (!(enemyDefs[enemy.type] || (enemy.boss && bossDefs[enemy.type]))) {
      rlMonIssue("FAIL", "invariants", `live enemy with unknown type ${enemy.type}`);
      continue;
    }
    if (![enemy.x, enemy.y, enemy.hp, enemy.vx, enemy.vy].every(finite)) {
      rlMonIssue("FAIL", "invariants", `${enemy.type} state became non-finite`);
      continue;
    }
    if (Math.abs(enemy.x) > arena.W + 1.5 || Math.abs(enemy.y) > arena.H + 1.5)
      rlMonIssue("WARN", "invariants", `${enemy.type} outside the arena`);
    if (!enemy.boss && !enemy.ghost && arena.blocked(enemy.x, enemy.y, -Math.min(0.3, enemy.r * 0.5)))
      rlMonIssue("WARN", "invariants", `${enemy.type} inside a wall`);
  }
  for (const shot of world.pb)
    if (!finite(shot.x) || !finite(shot.y)) {
      rlMonIssue("FAIL", "invariants", `projectile (${shot.w}) became non-finite`);
      break;
    }
  for (const shot of world.eb)
    if (!finite(shot.x) || !finite(shot.y)) {
      rlMonIssue("FAIL", "invariants", "enemy shot became non-finite");
      break;
    }
  if (![world.shards, world.kills, world.time].every(finite))
    rlMonIssue("FAIL", "invariants", "run totals became non-finite");
  const peak = mon.peak;
  peak.enemies = Math.max(peak.enemies, world.enemies.length);
  peak.pb = Math.max(peak.pb, world.pb.length);
  peak.eb = Math.max(peak.eb, world.eb.length);
  peak.pickups = Math.max(peak.pickups, world.pickups.length);
  if (world.pb.length > 420 || world.eb.length > 360) rlMonIssue("FAIL", "invariants", "projectile pool cap exceeded");
  if (world.enemies.length > 140) rlMonIssue("WARN", "invariants", `${world.enemies.length} enemies alive at once`);
  if (world.pickups.length > 320) rlMonIssue("WARN", "invariants", `${world.pickups.length} pickups alive at once`);
}
/* Called once per rendered frame while a run is active and visible. */
function rlMonFrame(workMs) {
  const mon = RL_MON;
  if (
    !mon ||
    game.world !== mon.w ||
    game.mode !== "game" ||
    game.paused ||
    game.chooseShown ||
    game.overShown ||
    document.visibilityState === "hidden"
  ) {
    if (mon) mon.lastT = 0;
  } else {
    const now = performance.now();
    if (mon.lastT) {
      const dt = now - mon.lastT;
      if (dt < 1000) {
        mon.frames++;
        mon.dtSum += dt;
        if (dt > 50) {
          mon.slow++;
        }
        if (dt > mon.worst) {
          mon.worst = dt;
        }
        mon.workSum += workMs;
      }
    }
    mon.lastT = now;
  }
  // What is drawn must be the wave's own biome and layout (no mixed palettes / stale walls).
  if (mon && renderer && game.world === mon.w && game.mode === "game" && renderer.biome && (mon.frames & 15) === 0) {
    const arena = mon.w.arena;
    if (renderer.biome.id !== arena.biome.id) {
      rlMonIssue("FAIL", "render", `renderer shows biome ${renderer.biome.id} during a ${arena.biome.id} wave`);
    }
    if (renderer.arena.layKey !== arena.key) {
      rlMonIssue(
        "FAIL",
        "render",
        `renderer walls (${renderer.arena.layKey}) differ from the wave layout (${arena.key})`,
      );
    }
    if (renderer.arena.biomeId !== arena.biome.id) {
      rlMonIssue("FAIL", "render", `floor palette from ${renderer.arena.biomeId} during a ${arena.biome.id} wave`);
    }
  }
  // 2.3.2: while the run is being played the HUD (HP, pause, touch buttons) must be
  // on screen — Endless used to leave it hidden. 1.5 s of grace for transitions.
  if (
    mon &&
    game.world === mon.w &&
    game.mode === "game" &&
    !game.paused &&
    !game.chooseShown &&
    !game.overShown &&
    !["choose", "victory", "dead"].includes(mon.w.state)
  ) {
    const hud = document.getElementById("hud");
    if (hud && (hud.hidden || hud.style.visibility === "hidden")) {
      const now = performance.now();
      if (!mon.hudOff) {
        mon.hudOff = now;
      }
      if (now - mon.hudOff > 1500) {
        rlMonIssue("FAIL", "hud", `HUD hidden during wave ${mon.w.wave}${mon.w.endless ? " (endless)" : ""}`);
      }
    } else mon.hudOff = 0;
  }
  // Every wave start writes a resumable snapshot; verify it with the real loader
  // (cheap cleanRun() per wave; the full world restore runs once at the end of the run).
  if (mon && mon.pendingSnap && game.world === mon.w) {
    const run = store.data.run;
    if (run && run.wave === mon.pendingSnap) {
      mon.snaps.checked++;
      const wave = mon.pendingSnap;
      mon.pendingSnap = 0;
      try {
        const snap = cleanRun(run);
        if (snap) {
          mon.snaps.ok++;
          mon.lastSnap = snap;
        } else {
          rlMonIssue("FAIL", "save", `wave ${wave} snapshot is rejected by the loader`);
        }
      } catch (err) {
        rlMonIssue("FAIL", "save", `wave ${wave} snapshot check threw: ${err.message}`);
      }
    } else if (++mon.pendingSnapFrames > 90) {
      rlMonIssue("FAIL", "save", `wave ${mon.pendingSnap} snapshot was not written`);
      mon.pendingSnap = 0;
    }
  }
}
function rlMonPreEnd(world) {
  const data = store.data,
    stats = data.stats;
  return {
    bank: data.shards,
    kills: stats.kills,
    runs: stats.runs,
    deaths: stats.deaths,
    clears: stats.clears,
    bestWave: stats.bestWave,
    shards: world.shards,
    runKills: world.kills,
    threat: world.threat,
    salvage: data.workshop.salvage || 0,
    pactBonus: world.pactBonus ? world.pactBonus() : 0,
    endless: !!world.endless,
    wave: world.wave,
  };
}
/* Builds the post-run audit: final state (rlRunAudit) + monitor + save/economy. */
function rlMonFinish(world, pre, win, abandoned, silent, crashed) {
  const mon = RL_MON && RL_MON.w === world ? RL_MON : null,
    fresh0 = !crashed && RL_LAST_RUN_AUDIT && RL_LAST_RUN_AUDIT.wave === world.wave && !RL_LAST_RUN_AUDIT.checks.length,
    base = fresh0 ? RL_LAST_RUN_AUDIT : rlRunAudit(world, win, abandoned);
  const checks = [],
    addCheck = (status, id, msg) => checks.push({ st: status, id, msg });
  const issues = mon ? [...mon.issues.values()] : [],
    byId = (id) => issues.filter((issue) => issue.id === id);
  const fmt = (issue) => `${issue.msg}${issue.n > 1 ? ` (×${issue.n})` : ""}`;
  const group = (id, okMsg, ids = [id]) => {
    const matching = issues.filter((issue) => ids.includes(issue.id)),
      fails = matching.filter((issue) => issue.sev === "FAIL"),
      warns = matching.filter((issue) => issue.sev === "WARN");
    addCheck(
      fails.length ? "FAIL" : warns.length ? "WARN" : "OK",
      id,
      fails.length || warns.length
        ? [...fails, ...warns].slice(0, 4).map(fmt).join(" | ") +
            (fails.length + warns.length > 4 ? ` … +${fails.length + warns.length - 4}` : "")
        : okMsg,
    );
  };
  if (crashed) addCheck("FAIL", "crash", "the game loop crashed (3 consecutive frame errors)");
  // 1. runtime errors logged since the run started
  const fresh = mon ? errorLog.filter((entry) => (mon.errBase.get(rlMonErrKey(entry)) || 0) < entry.n) : [];
  addCheck(
    fresh.length ? "FAIL" : "OK",
    "runtime-errors",
    fresh.length
      ? fresh
          .slice(0, 3)
          .map((entry) => `[${entry.where}] ${entry.msg}`)
          .join(" | ")
      : "none during this run",
  );
  // 2. final world state
  addCheck(
    base.fail.length ? "FAIL" : base.warn.length ? "WARN" : "OK",
    "final-state",
    base.fail.length || base.warn.length
      ? [...base.fail, ...base.warn].slice(0, 4).join(" | ")
      : "arena, entities and totals are finite and consistent",
  );
  if (mon) {
    group(
      "invariants",
      `${mon.samples} samples over ${mon.steps} steps · peak ${mon.peak.enemies} enemies / ${mon.peak.pb}+${mon.peak.eb} shots / ${mon.peak.pickups} pickups`,
    );
    group("spawn-plan", `${mon.waves.length} wave plan(s) valid`, ["spawn-plan", "stats"]);
    const done = mon.waves.filter((wave) => wave.cleared),
      longest = done.reduce((best, wave) => (wave.secs > best.secs ? wave : best), { secs: 0, wave: 0 });
    group(
      "waves",
      `${done.length}/${mon.waves.length} cleared${done.length ? ` · avg ${Math.round(done.reduce((sum, wave) => sum + wave.secs, 0) / done.length)} s · longest ${Math.round(longest.secs)} s (wave ${longest.wave})` : ""}`,
      ["waves", "wave-end"],
    );
    group("spawns", `${mon.types.size} enemy/boss types seen · all with meshes`, ["spawns", "render"]);
    group("events", `${mon.events} events · ${Object.keys(mon.kinds).length} kinds · all consumed`, [
      "events",
      "weapons",
    ]);
    group("economy", "shards and kills only increased", ["economy"]);
    group("hud", "HUD visible whenever a wave was being played");
    if (mon.lastSnap)
      try {
        const snap = mon.lastSnap,
          restored = new World({ snap: snap, ws: store.data.workshop });
        if (
          restored.wave !== snap.wave ||
          restored.weapon !== snap.weapon ||
          JSON.stringify(restored.up) !== JSON.stringify(snap.up)
        ) {
          rlMonIssue("FAIL", "save", `wave ${snap.wave} snapshot restores a different run`);
        }
      } catch (err) {
        rlMonIssue("FAIL", "save", `wave ${mon.lastSnap.wave} snapshot restore threw: ${err.message}`);
      }
    const saveIssues = [...mon.issues.values()].filter((issue) => issue.id === "save");
    addCheck(
      saveIssues.some((issue) => issue.sev === "FAIL") ? "FAIL" : mon.snaps.checked ? "OK" : "WARN",
      "snapshots",
      saveIssues.length
        ? saveIssues.slice(0, 3).map(fmt).join(" | ")
        : mon.snaps.checked
          ? `${mon.snaps.ok}/${mon.snaps.checked} wave snapshot(s) accepted by the loader · last one restored into a live world`
          : "no wave snapshot was verified",
    );
    const fps = mon.dtSum > 0 ? mon.frames / (mon.dtSum / 1000) : 0,
      slowPct = mon.frames ? (mon.slow / mon.frames) * 100 : 0;
    addCheck(
      mon.frames < 120 ? "INFO" : fps < 40 || slowPct > 5 ? "WARN" : "OK",
      "performance",
      mon.frames
        ? `${fps.toFixed(0)} fps avg · ${mon.slow} slow frame(s) >50 ms (${slowPct.toFixed(1)}%) · worst ${Math.round(mon.worst)} ms · JS ${(mon.workSum / mon.frames).toFixed(1)} ms/frame`
        : "no frames measured",
    );
    const inp = RL_RT.pointerdown + RL_RT.keydown - mon.inputBase;
    addCheck(
      inp > 0 ? "OK" : "WARN",
      "input",
      inp > 0 ? `${inp} input event(s) during the run` : "no input events observed during this run",
    );
  } else addCheck("WARN", "monitor", "run monitor was not attached (run started before diagnostics were ready)");
  if (!crashed) {
    // 3. payout, records and persistence after endRun() ran
    const data = store.data,
      runShards = pre.shards,
      bonus = win ? Math.round(runShards * 0.25) : 0,
      expect = Math.round(
        (runShards + bonus) * threatMods(pre.threat).shards * (1 + 0.1 * pre.salvage) * (1 + pre.pactBonus),
      ),
      got = data.shards - pre.bank;
    addCheck(
      got === expect ? "OK" : "FAIL",
      "payout",
      got === expect ? `+${expect} shards credited` : `bank changed by ${got}, expected +${expect}`,
    );
    const stats = data.stats,
      rec = [];
    if (stats.kills - pre.kills !== pre.runKills) {
      rec.push(`kills +${stats.kills - pre.kills} (run had ${pre.runKills})`);
    }
    if (stats.bestWave < (win ? 20 : pre.wave)) {
      rec.push(`best wave ${stats.bestWave} < reached ${win ? 20 : pre.wave}`);
    }
    if (win && !pre.endless && stats.clears !== pre.clears + 1) {
      rec.push("clear not counted");
    }
    if (!win && !abandoned && stats.deaths !== pre.deaths + 1) {
      rec.push("death not counted");
    }
    addCheck(
      rec.length ? "FAIL" : "OK",
      "records",
      rec.length ? rec.join(" | ") : `kills +${pre.runKills} · best wave ${stats.bestWave}`,
    );
    const per = [];
    if (data.run !== null) {
      per.push("finished run is still stored as resumable");
    }
    try {
      const parsed = store.parse(JSON.stringify(data));
      if (!parsed.ok) {
        per.push("save does not round-trip");
      }
    } catch (err) {
      per.push("save round-trip threw: " + err.message);
    }
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    } catch {}
    if (!store.storageOk) addCheck("WARN", "persistence", "storage is blocked — progress only lives in memory");
    else {
      if (!(stored && stored.savedAt === data.savedAt && stored.shards === data.shards)) {
        per.push("localStorage does not match the in-memory save");
      }
      addCheck(
        per.length ? "FAIL" : "OK",
        "persistence",
        per.length ? per.join(" | ") : "run cleared · save round-trips · localStorage in sync",
      );
    }
  }
  const fail = checks.filter((check) => check.st === "FAIL").map((check) => `${check.id}: ${check.msg}`),
    warn = checks.filter((check) => check.st === "WARN").map((check) => `${check.id}: ${check.msg}`);
  const audit = {
    ...base,
    ok: !fail.length,
    fail,
    warn,
    checks,
    outcome: crashed ? "crashed" : base.outcome,
    wave: world.wave,
    time: world.time,
    kills: world.kills,
    shards: world.shards,
    weapon: world.weapon,
    threat: world.threat,
    endScreen: null,
  };
  RL_LAST_RUN_AUDIT = audit;
  RL_MON = null;
  if (!silent && !crashed) {
    // 4. end screen: visible, HUD hidden, every control reachable (checked two frames later)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          const over = document.getElementById("over"),
            hud = document.getElementById("hud"),
            layout = window.__riftLayoutAudit?.(),
            probs = [];
          if (over.hidden) {
            probs.push("run summary not shown");
          }
          if (!hud.hidden) {
            probs.push("HUD still visible");
          }
          if (layout && !layout.ok) {
            probs.push(...layout.findings.slice(0, 3));
          }
          const status = probs.length ? "FAIL" : "OK";
          audit.checks.push({
            st: status,
            id: "end-screen",
            msg: probs.length ? probs.join(" | ") : `${layout ? layout.checked : 0} controls reachable`,
          });
          if (probs.length) {
            audit.ok = false;
            audit.fail.push("end-screen: " + probs.join(" | "));
          }
        } catch (err) {
          audit.checks.push({ st: "WARN", id: "end-screen", msg: err.message });
        }
        if (audit.fail.length) {
          ui.toast(
            `Diagnostics: ${audit.fail.length} problem${audit.fail.length === 1 ? "" : "s"} in this run — Settings › Diagnostics`,
            "warn",
            6000,
          );
        }
        rlRunHealth({ context: "post-run" }).catch((err) => logError("health", err));
      }),
    );
  } else rlRunHealth({ context: "post-run" }).catch((err) => logError("health", err));
  return audit;
}
function rlMonCrashed() {
  try {
    const world = RL_MON && RL_MON.w;
    if (world) {
      rlMonFinish(world, rlMonPreEnd(world), false, false, true, true);
    }
  } catch {}
}
function rlAuditReportLines(out) {
  const audit = RL_LAST_RUN_AUDIT;
  if (!audit) return;
  const fails = audit.checks.filter((check) => check.st === "FAIL").length,
    warns = audit.checks.filter((check) => check.st === "WARN").length;
  out.push(
    "",
    `Post-run audit: ${String(audit.outcome).toUpperCase()} · ${audit.weapon ? weaponDefs[audit.weapon]?.name + " · " : ""}wave ${audit.wave} · ${formatTime(audit.time || 0)} · ${audit.checks.length} checks · ${fails} FAIL · ${warns} WARN`,
  );
  for (const check of audit.checks)
    out.push(`  [${check.st}]${" ".repeat(Math.max(1, 5 - check.st.length))}${check.id}: ${check.msg}`);
}
function rlUiButtonGuardSelfTest() {
  // Runs on a detached host: no document-level listeners fire, so the test
  // cannot unlock audio or pollute the runtime counters shown in the log.
  const host = document.createElement("div");
  host.setAttribute("data-rift-ui-test", "1");
  const fake = { sound: { play: () => {} }, store: { data: {} }, input: {} },
    testUi = { g: fake };
  testUi.click = GameUI.prototype.click;
  let count = 0,
    steps = 0,
    pass = true;
  const drops = RL_RT.uiGuardDrops;
  const make = (key = "") => {
    const button = document.createElement("button");
    button.type = "button";
    if (key) {
      button.dataset.buy = key;
    }
    host.appendChild(button);
    testUi.click.call(testUi, button, () => count++);
    return button;
  };
  const touch = (el, id, x, y, type = "touch") => {
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: id,
        pointerType: type,
        isPrimary: true,
        clientX: x,
        clientY: y,
      }),
    );
    el.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: id,
        pointerType: type,
        isPrimary: true,
        clientX: x,
        clientY: y,
      }),
    );
  };
  const click = (el, x, y) =>
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1, clientX: x, clientY: y }));
  try {
    RL_TOUCH_CLICK_GUARD.until = 0;
    RL_TOUCH_CLICK_GUARD.key = "";
    // 1. DOM replacement after a touch must not create a second activation.
    let button = make("touch-test");
    touch(button, 41, 12, 12);
    host.replaceChildren();
    button = make("touch-test");
    click(button, 12, 12);
    if (count !== 1) pass = false;
    steps++;
    // 2. A later deliberate click remains available.
    click(button, 12, 12);
    if (count !== 2) pass = false;
    steps++;
    // 3. Pointer-id mismatch must not activate; the matching pointer does, and its ghost click is dropped.
    button = make();
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 50,
        pointerType: "pen",
        isPrimary: true,
        clientX: 4,
        clientY: 4,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 51,
        pointerType: "pen",
        isPrimary: false,
        clientX: 4,
        clientY: 4,
      }),
    );
    if (count !== 2) pass = false;
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 50,
        pointerType: "pen",
        isPrimary: true,
        clientX: 4,
        clientY: 4,
      }),
    );
    click(button, 4, 4);
    if (count !== 3) pass = false;
    steps++;
    // 4. Pointer cancellation must not suppress the following ordinary click.
    button = make();
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 60,
        pointerType: "touch",
        isPrimary: true,
        clientX: 8,
        clientY: 8,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 60,
        pointerType: "touch",
        isPrimary: true,
        clientX: 8,
        clientY: 8,
      }),
    );
    button.dispatchEvent(new PointerEvent("click", { bubbles: true, detail: 1, clientX: 8, clientY: 8 }));
    if (count !== 4) pass = false;
    steps++;
    // 5. Secondary pointers cannot hijack the primary activation.
    button = make();
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 70,
        pointerType: "touch",
        isPrimary: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 71,
        pointerType: "touch",
        isPrimary: false,
        clientX: 10,
        clientY: 10,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 70,
        pointerType: "touch",
        isPrimary: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 71,
        pointerType: "touch",
        isPrimary: false,
        clientX: 10,
        clientY: 10,
      }),
    );
    click(button, 10, 10);
    if (count !== 5) pass = false;
    steps++;
    // 6. A button disabled between press and release must not arm a stale guard.
    button = make();
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 75,
        pointerType: "touch",
        isPrimary: true,
        clientX: 90,
        clientY: 90,
      }),
    );
    button.disabled = true;
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 75,
        pointerType: "touch",
        isPrimary: true,
        clientX: 90,
        clientY: 90,
      }),
    );
    button.disabled = false;
    click(button, 90, 90);
    if (count !== 6 || RL_TOUCH_CLICK_GUARD.until !== 0) pass = false;
    steps++;
    // 7. Ghost click after a screen change: a DIFFERENT button now under the finger must not fire
    //    (2.2.2 bug: tapping Home on the run summary started a new run via START RUN).
    const first = make("a");
    touch(first, 80, 100, 100);
    button = make("b");
    click(button, 100, 100);
    if (count !== 7) pass = false;
    steps++;
    // 8. A click far away from the last tap is a new, deliberate action.
    touch(first, 81, 100, 100);
    button = make("c");
    click(button, 300, 300);
    if (count !== 9) pass = false;
    steps++;
  } catch (err) {
    pass = false;
  }
  RL_TOUCH_CLICK_GUARD.until = 0;
  RL_TOUCH_CLICK_GUARD.key = "";
  RL_RT.uiGuardDrops = drops;
  host.remove();
  return { ok: pass, count, steps };
}

/* Health checks. Cheap by default; {deep:true} adds the simulation self-test.
 Concurrent calls share one run so the report never contains duplicates. */
let RL_HEALTH_BUSY = null;
function rlRunHealth(opts) {
  const options = typeof opts === "object" && opts ? opts : { context: opts || "startup" };
  if (RL_HEALTH_BUSY) {
    if (!options.deep) return RL_HEALTH_BUSY;
    return RL_HEALTH_BUSY.then(() => rlRunHealth(options));
  }
  RL_HEALTH_BUSY = rlRunHealthNow(options).finally(() => {
    RL_HEALTH_BUSY = null;
  });
  return RL_HEALTH_BUSY;
}
async function rlRunHealthNow({ context = "startup", deep = false } = {}) {
  RL_HEALTH = [];
  let ok = (id, pass, detail) => rlHealthAdd(id, pass ? "OK" : "FAIL", detail),
    warn = (id, detail) => rlHealthAdd(id, "WARN", detail),
    info = (id, detail) => rlHealthAdd(id, "INFO", detail);
  info("context", `${context}${deep ? " · deep" : ""} · ${new Date().toISOString()}`);
  try {
    ok(
      "version-bundle",
      GAME_VERSION === RL_LOG_VERSION && logContext.version === RL_LOG_VERSION,
      `JS ${GAME_VERSION} · logger ${RL_LOG_VERSION} · runtime ${logContext.version || "?"}`,
    );
  } catch (err) {
    rlHealthAdd("version-bundle", "FAIL", err.message);
  }
  try {
    let meta = document.querySelector('meta[name="riftline-version"]')?.content || "?",
      buildMeta = document.querySelector('meta[name="riftline-build"]')?.content || "?",
      scripts = [...document.scripts].map((script) => script.src || script.getAttribute("src") || "").filter(Boolean),
      gameSrc = scripts.find((src) => /game-v/i.test(src)) || "",
      file = gameSrc.split("/").pop() || "";
    ok(
      "version-contract",
      meta === GAME_VERSION && file === `game-v${GAME_VERSION}-final.js` && buildMeta === BUILD_ID,
      `HTML ${meta} · JS ${GAME_VERSION} · script ${file || "?"} · build ${buildMeta}${buildMeta === BUILD_ID ? "" : " ≠ " + BUILD_ID}`,
    );
  } catch (err) {
    rlHealthAdd("version-contract", "FAIL", err.message);
  }
  try {
    let missing = RL_REQUIRED_DOM.filter((id) => !document.getElementById(id));
    ok(
      "dom",
      missing.length === 0,
      missing.length
        ? `${missing.length} missing: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`
        : `${RL_REQUIRED_DOM.length} required nodes present`,
    );
  } catch (err) {
    rlHealthAdd("dom", "FAIL", err.message);
  }
  try {
    let ids = [...document.querySelectorAll("[id]")].map((el) => el.id),
      dup = ids.filter((id, index) => ids.indexOf(id) !== index);
    ok(
      "dom-unique",
      dup.length === 0,
      dup.length ? `duplicate ids: ${[...new Set(dup)].join(", ")}` : `${ids.length} ids unique`,
    );
  } catch (err) {
    rlHealthAdd("dom-unique", "FAIL", err.message);
  }
  try {
    let canvas = document.getElementById("gl"),
      gl = canvas && canvas.getContext && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
    if (!!renderer && !!gl) rlHealthAdd("webgl", "OK", "renderer/context ready");
    else rlHealthAdd("webgl", "WARN", "WebGL unavailable; gameplay start is disabled but the menu remains interactive");
  } catch (err) {
    rlHealthAdd("webgl", "WARN", err.message || "WebGL check unavailable");
  }
  try {
    ok(
      "game-data",
      Object.keys(weaponDefs).length === weaponOrder.length &&
        biomeList.length === 5 &&
        Object.keys(bossDefs).length === 5 &&
        Object.keys(enemyDefs).length >= 25,
      `${Object.keys(weaponDefs).length} weapons (${weaponOrder.length} selectable) · ${Object.keys(enemyDefs).length} enemies · ${biomeList.length} biomes · ${Object.keys(bossDefs).length} bosses · ${upgradeList.length} upgrades · ${workshopModules.length} modules`,
    );
  } catch (err) {
    rlHealthAdd("game-data", "FAIL", err.message);
  }
  try {
    const reqE = ["leaper", "turret", "charger", "minebot", "drone", "driller", "beacon", "weaver"],
      reqB = ["works", "vault", "void", "marsh"],
      // 2.5.0/2.6.0: Overclock Matrix, Overbore Caliber, Vector Stabilizer, Salvage Pulse, Capacitor Bank and Bounty Protocol were retired
      reqU = ["overcharge", "hunter", "supply", "laststand", "skates", "heatsink"],
      badE = Object.keys(enemyDefs).filter((id) => !enemyDefs[id] || (!(enemyDefs[id].from >= 1) && id !== "mite")),
      badEvo = upgradeList
        .filter((upgrade) => upgrade.evo && Object.keys(upgrade.evo).some((key) => !upgradesById[key]))
        .map((upgrade) => upgrade.id),
      badWpn = upgradeList
        .filter((upgrade) => upgrade.weapon && !weaponDefs[upgrade.weapon])
        .map((upgrade) => upgrade.id),
      miss = [
        ...reqE.filter((id) => !enemyDefs[id]),
        ...reqB.filter((id) => !biomesById[id]),
        ...reqU.filter((id) => !upgradesById[id]),
        ...badE,
        ...badEvo,
        ...badWpn,
      ];
    ok(
      "content-contract",
      !miss.length,
      miss.length
        ? `problems: ${miss.join(", ")}`
        : "required content present · evolutions reference valid upgrades and weapons",
    );
  } catch (err) {
    rlHealthAdd("content-contract", "FAIL", err.message);
  }
  try {
    const noPool = renderer ? Object.keys(enemyDefs).filter((type) => !renderer.enemyPools[type]) : [],
      noModel = Object.keys(enemyDefs).filter((type) => !RL_MESH_TYPES.includes(type)),
      noSfx = Object.keys(weaponDefs).filter((weapon) => !RL_SFX_VOICES.includes(rlShotSfx(weapon))),
      noMusic = biomeList.filter((biome) => !musicChords[biome.id] || !musicVoices[biome.id]).map((biome) => biome.id),
      noTip = Object.keys(enemyDefs).filter((type) => type !== "mite" && !RL_ENEMY_TIPS[type]),
      miss = [
        ...noPool.map((type) => "mesh pool " + type),
        ...noModel.map((type) => "model " + type),
        ...noSfx.map((weapon) => "sound " + weapon),
        ...noMusic.map((biome) => "music " + biome),
        ...noTip.map((type) => "intro " + type),
      ];
    ok(
      "content-coverage",
      !miss.length,
      miss.length
        ? `missing: ${miss.slice(0, 8).join(", ")}`
        : `${Object.keys(weaponDefs).length} weapons voiced · ${Object.keys(enemyDefs).length} enemies with own model + intro · ${biomeList.length}/${biomeList.length} biomes with own music theme`,
    );
  } catch (err) {
    rlHealthAdd("content-coverage", "FAIL", err.message);
  }
  try {
    let types = [typeof game?.startRun, typeof game?.pause, typeof game?.resume, typeof game?.restart];
    ok(
      "game-state",
      types.every((type) => type === "function"),
      types.join(" | "),
    );
  } catch (err) {
    rlHealthAdd("game-state", "FAIL", err.message);
  }
  try {
    if (typeof PointerEvent !== "undefined" && typeof MouseEvent !== "undefined") {
      let guard = rlUiButtonGuardSelfTest();
      ok(
        "ui-input-dedupe",
        guard.ok,
        `${guard.steps}/8 pointer-gesture cases · ${guard.count}/9 expected activations · ghost clicks after screen changes are dropped`,
      );
    } else {
      rlHealthAdd("ui-input-dedupe", "WARN", "PointerEvent or MouseEvent unavailable in this browser");
    }
  } catch (err) {
    rlHealthAdd("ui-input-dedupe", "FAIL", err.message);
  }
  try {
    if (deep) {
      if (!RL_DEEP_SELFTEST) throw new Error("self-test module not loaded");
      const result = RL_DEEP_SELFTEST(),
        expansionFails = [
          ...(result.expansion21?.fail || []),
          ...(result.expansion22?.fail || []),
          ...(result.expansion23?.fail || []),
        ],
        all = [...result.fail, ...expansionFails];
      RL_SELFTEST_LAST = { r: result, at: Date.now() };
      rlHealthAdd(
        "self-test",
        result.ok ? "OK" : "FAIL",
        `${result.worlds} arena cases · ${result.expansion23?.planWaves || 0} wave plans / ${result.expansion23?.spawned || 0} spawns · ${result.expansion23?.eventKinds || 0} event kinds · ${result.weapons} weapons · ${result.bosses} bosses · ${result.enemyTypes} enemy probes · ${result.biomeCases} biome cases · ${result.threatCases} threat cases · ${result.upgradeChecks} upgrade checks · ${result.frames} sim frames · ${result.ms} ms` +
          (all.length ? ` · ${all.slice(0, 4).join(" | ")}` : " · deterministic + runtime checks passed"),
      );
    } else if (RL_SELFTEST_LAST) {
      const result = RL_SELFTEST_LAST.r;
      rlHealthAdd(
        "self-test",
        result.ok ? "OK" : "FAIL",
        `last deep run ${new Date(RL_SELFTEST_LAST.at).toLocaleTimeString()} · ${result.ok ? "passed" : "failed: " + [...result.fail, ...(result.expansion21?.fail || []), ...(result.expansion22?.fail || []), ...(result.expansion23?.fail || [])].slice(0, 3).join(" | ")} · ${result.expansion23?.planWaves || 0} wave plans · ${result.expansion23?.spawned || 0} spawns · ${result.frames} sim frames (tap “Deep test” to re-run)`,
      );
    } else info("self-test", "not run in quick checks — tap “Deep test” in this dialog (takes a few seconds)");
  } catch (err) {
    rlHealthAdd("self-test", "FAIL", err.message);
  }
  try {
    if (RL_LAST_RUN_AUDIT) {
      let audit = RL_LAST_RUN_AUDIT,
        fails = audit.checks.filter((check) => check.st === "FAIL"),
        warns = audit.checks.filter((check) => check.st === "WARN");
      rlHealthAdd(
        "post-run-audit",
        fails.length ? "FAIL" : warns.length ? "WARN" : "OK",
        `${audit.outcome} · wave ${audit.wave} · ${audit.checks.length} checks · ${fails.length} fail · ${warns.length} warn` +
          (fails.length
            ? ` · ${fails
                .slice(0, 2)
                .map((check) => check.id)
                .join(", ")}`
            : warns.length
              ? ` · ${warns
                  .slice(0, 2)
                  .map((check) => check.id)
                  .join(", ")}`
              : " · run verified"),
      );
    }
  } catch (err) {
    rlHealthAdd("post-run-audit", "FAIL", err.message);
  }
  try {
    let ready =
      typeof input?.sample === "function" &&
      typeof input?.reset === "function" &&
      typeof input?.press === "function" &&
      typeof input?.onBlur === "function";
    ok("input-api", ready, ready ? "pointer + keyboard pipeline ready" : "missing input methods");
    info(
      "input-runtime",
      `down ${RL_RT.pointerdown} · move ${RL_RT.pointermove} · up ${RL_RT.pointerup} · cancel ${RL_RT.pointercancel} · keys ${RL_RT.keydown}/${RL_RT.keyup} · resets ${RL_RT.reset}`,
    );
  } catch (err) {
    rlHealthAdd("input-api", "FAIL", err.message);
  }
  try {
    const rejected = cleanRun({ v: 1, seed: "oops", weapon: "pulse", wave: 12, hp: "oops", up: {} }),
      bad = {
        v: 1,
        seed: "oops",
        weapon: "pulse",
        wave: 12,
        hp: 999999,
        up: { dmg: 999999, wat: 7 },
        time: "nan",
        shards: "bad",
        rerolls: 999999,
        bossKills: ["warden", "wat", "warden"],
        runStats: { dmgTaken: "bad", dashes: "bad", critHits: "bad" },
        dmgSrc: { turret: "bad" },
        offer: ["wat", "dmg", "dmg"],
      },
      cleaned = cleanRun(bad);
    ok(
      "save-sanitize",
      !rejected &&
        !!cleaned &&
        cleaned.wave === 12 &&
        cleaned.weapon === "pulse" &&
        cleaned.hp === 999999 &&
        // 2.5.1: the level is capped at the upgrade's max (12 since 2.5.0, the check still said 8)
        cleaned.up.dmg === upgradesById.dmg.max &&
        cleaned.bossKills.length === 1 &&
        Number.isFinite(cleaned.time) &&
        Number.isFinite(cleaned.shards) &&
        cleaned.offer.length === 1,
      "invalid run rejected; bounded run snapshot sanitized",
    );
  } catch (err) {
    rlHealthAdd("save-sanitize", "FAIL", err.message);
  }
  try {
    ok(
      "save-envelope",
      store.parse(JSON.stringify({ game: "riftline" })).ok === false &&
        store.parse(JSON.stringify({ game: "riftline", v: 1 })).ok === true,
      "import requires the v1 save envelope",
    );
  } catch (err) {
    rlHealthAdd("save-envelope", "FAIL", err.message);
  }
  try {
    let parsed = store.parse(JSON.stringify(store.data));
    ok("save-roundtrip", !!parsed && parsed.ok, "current save serializes + parses successfully");
  } catch (err) {
    rlHealthAdd("save-roundtrip", "FAIL", err.message);
  }
  try {
    const run = store.data.run;
    if (run) {
      const snap = cleanRun(run),
        world = snap && new World({ snap: snap, ws: store.data.workshop });
      ok(
        "save-resume",
        !!world && world.wave === snap.wave,
        world
          ? `stored run (wave ${snap.wave}, ${weaponDefs[snap.weapon].name}) restores`
          : "stored run is rejected by the loader",
      );
    } else info("save-resume", "no unfinished run stored");
  } catch (err) {
    rlHealthAdd("save-resume", "FAIL", err.message);
  }
  try {
    // 2.8.1: the probe key is inside the riftline.* namespace
    let key = "riftline.health-probe",
      old = localStorage.getItem(key);
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    ok("storage", true, "write/remove test passed");
    if (old !== null) {
      localStorage.setItem(key, old);
    }
  } catch (err) {
    warn("storage", "localStorage unavailable or restricted");
  }
  try {
    let width = window.innerWidth,
      height = window.innerHeight,
      dpr = window.devicePixelRatio || 0,
      ins = safeAreaInsets();
    ok(
      "viewport",
      width > 0 && height > 0 && dpr > 0 && [ins.t, ins.b, ins.l, ins.r].every(Number.isFinite),
      `${width}×${height} @${dpr}; insets ${ins.t}/${ins.b}/${ins.l}/${ins.r} · ${document.body.dataset.device || "?"}/${document.body.dataset.orientation || "?"}`,
    );
  } catch (err) {
    rlHealthAdd("viewport", "FAIL", err.message);
  }
  try {
    let root = document.documentElement,
      overflowX = root.scrollWidth > window.innerWidth + 1,
      overflowY = root.scrollHeight > window.innerHeight + 1;
    rlHealthAdd(
      "layout-overflow",
      overflowX || overflowY ? "WARN" : "OK",
      `scroll ${root.scrollWidth}×${root.scrollHeight} vs viewport ${window.innerWidth}×${window.innerHeight}`,
    );
  } catch (err) {
    rlHealthAdd("layout-overflow", "FAIL", err.message);
  }
  try {
    if (document.fonts && typeof document.fonts.check === "function") {
      let chakra = document.fonts.check('16px "Chakra Petch"'),
        barlow = document.fonts.check('16px "Barlow Semi Condensed"');
      if (chakra && barlow) {
        ok("fonts", true, "declared game fonts available");
      } else {
        warn("fonts", `font check: Chakra ${chakra ? "OK" : "WARN"}, Barlow ${barlow ? "OK" : "WARN"}`);
      }
    } else warn("fonts", "FontFaceSet API unavailable");
  } catch (err) {
    warn("fonts", err.message);
  }
  try {
    let audit = window.__riftLayoutAudit?.() || null;
    rlHealthAdd(
      "layout-hit-test",
      audit?.ok ? "OK" : "FAIL",
      audit
        ? `${audit.checked} visible controls checked on “${ui?.screen || "?"}” · ${audit.bad || 0} covered/misaligned${audit.bad ? ": " + audit.findings.slice(0, 3).join("; ") : ""}`
        : `layout audit unavailable`,
    );
  } catch (err) {
    rlHealthAdd("layout-hit-test", "FAIL", err.message);
  }
  try {
    let hasPointer = typeof PointerEvent !== "undefined";
    ok(
      "device-input",
      hasPointer,
      `PointerEvent ${hasPointer ? "OK" : "missing"} · touch points ${navigator.maxTouchPoints || 0} · touch API ${"ontouchstart" in window ? "OK" : "n/a"}`,
    );
  } catch (err) {
    rlHealthAdd("device-input", "FAIL", err.message);
  }
  try {
    if (typeof caches !== "undefined") {
      const prefix = `riftline-v${GAME_VERSION.replace(/\./g, "-")}-`;
      let keys = await caches.keys(),
        current = keys.find((key) => key.startsWith(prefix)),
        stale = keys.filter((key) => key.startsWith("riftline-") && !key.startsWith(prefix));
      rlHealthAdd(
        "cache-version",
        current ? "OK" : "WARN",
        current
          ? `current cache ${current}${stale.length ? ` · stale caches visible: ${stale.join(", ")}` : ""}`
          : `current ${GAME_VERSION} cache not found yet (normal on the very first visit)${stale.length ? ` · stale: ${stale.join(", ")}` : ""}`,
      );
    } else warn("cache-version", "CacheStorage API unavailable");
  } catch (err) {
    warn("cache-version", err.message);
  }
  try {
    if ("serviceWorker" in navigator) {
      let registration = await navigator.serviceWorker.getRegistration(),
        active = !!registration?.active,
        controlled = !!navigator.serviceWorker.controller;
      rlHealthAdd(
        "service-worker",
        active ? "OK" : "WARN",
        `${active ? "active" : "no active"} registration · page ${controlled ? "controlled" : "not controlled"}${registration?.waiting ? " · update waiting" : ""}`,
      );
    } else warn("service-worker", "Service Worker API unavailable");
  } catch (err) {
    warn("service-worker", err.message);
  }
  try {
    let res = await fetch(`./build-info.json?health=${Date.now()}`, { cache: "no-store" }),
      info = res.ok ? await res.json() : null,
      okBuild = !!info && info.version === GAME_VERSION && info.build_id === BUILD_ID;
    rlHealthAdd(
      "build-info-network",
      okBuild ? "OK" : "WARN",
      info
        ? `network build ${info.version} · ${info.build_id || "?"}${okBuild ? "" : ` (this page runs ${GAME_VERSION} · ${BUILD_ID})`}`
        : `HTTP ${res.status}`,
    );
  } catch (err) {
    warn("build-info-network", "offline or build-info fetch blocked");
  }
  try {
    let oks = RL_HEALTH.filter((check) => check.status === "OK").length,
      warns = RL_HEALTH.filter((check) => check.status === "WARN").length,
      fails = RL_HEALTH.filter((check) => check.status === "FAIL").length;
    logContext.health = `${oks} OK / ${warns} WARN / ${fails} FAIL`;
  } catch {}
  return RL_HEALTH;
}
let RL_SELFTEST_LAST = null;
/* The deep self-test (rlSelfTest) lives in selftest.js, which registers it here when it loads, so
 this module does not import the self-test (2.5.0 refactor). */
let RL_DEEP_SELFTEST = null;
function setDeepSelfTest(fn) {
  RL_DEEP_SELFTEST = fn;
}
function rlHealthSummary() {
  let oks = RL_HEALTH.filter((check) => check.status === "OK").length,
    warns = RL_HEALTH.filter((check) => check.status === "WARN").length,
    fails = RL_HEALTH.filter((check) => check.status === "FAIL").length;
  return `Health: ${oks} OK · ${warns} WARN · ${fails} FAIL`;
}

window.addEventListener("error", (event) => logError("window", event));
window.addEventListener("unhandledrejection", (event) => logError("promise", event.reason || event));
(() => {
  addEventListener(
    "orientationchange",
    () => {
      RL_RT.orientationChanges++;
    },
    { passive: true },
  );
  document.addEventListener(
    "pointerup",
    (event) => {
      const button = event.target?.closest?.("button,[role=button],a");
      if (button && !button.disabled) {
        RL_RT.buttonActivations++;
        RL_RT.lastButton = (button.id || button.dataset.go || button.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 80);
      }
    },
    true,
  );
})();
export {
  RL_EVENT_KINDS,
  RL_HEALTH,
  RL_LAST_RUN_AUDIT,
  RL_MON,
  RL_RT,
  errorLog,
  setLogContext,
  clearErrorLog,
  rlMonBeginWave,
  rlMonCrashed,
  rlMonFinish,
  rlMonFrame,
  rlMonIssue,
  rlMonPreEnd,
  rlMonStart,
  rlMonStep,
  rlRunAudit,
  rlRunHealth,
  rlUiButtonGuardSelfTest,
  RL_BOSS_EVENTS,
  rlEventPayloadError,
  setDeepSelfTest,
  onLogChange,
  set_RL_LAST_RUN_AUDIT,
  getErrorLog,
  buildReport,
  logError,
};

/* ==========================================================================
   2.5.0 B: event kinds of the workshop modules (self-test in selftest.js)
   ========================================================================== */
RL_EVENT_KINDS.add("kit");
for (const kind of ["singularity", "singOpen", "gadgetReady", "gadgetDeny", "maxed", "trapWarn", "trapFire", "trapArm"])
  RL_EVENT_KINDS.add(kind);
RL_EVENT_KINDS.add("barrier");
