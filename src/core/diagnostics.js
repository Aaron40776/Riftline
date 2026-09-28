// Error log, runtime counters, health checks, the deep self-test, the live run monitor and the
// post-run audit (Settings → Diagnostics).

import { GameUI, RL_TOUCH_CLICK_GUARD } from "../ui/ui.js";
import { musicChords, RL_SFX_VOICES, rlShotSfx, musicVoices, SoundEngine } from "../audio/sound.js";
import { RL_RETIRE_NOTE, SAVE_KEY, rlMigrateRetired, set_RL_RETIRE_NOTE, cleanRun } from "./save.js";
import { RL_MESH_TYPES } from "../render/models.js";
import { enemyDefs, bossOrder, RL_ENEMY_TIPS, biomeVariants, bossDefs, bossByWave, bossByBiome } from "../data/enemies.js";
import { ui, store, game, safeAreaInsets, input, renderer } from "../main.js";
import { BUILD_ID, hashString, GAME_VERSION, makeRng, formatTime } from "./util.js";
import { updateEnemy, findOpenSpot } from "./ai.js";
import { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, biomeList } from "../data/biomes.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { waveEvents, planWave, set_RL_BIOME_MIX_CUR } from "./waves.js";
import { World } from "./world.js";
import { threatMods, workshopModules, modulesById } from "../data/progression.js";
import { upgradeList, upgradesById } from "../data/upgrades.js";
import { hitsObstacle, buildLayout, isConnected } from "./arena.js";
import { computeStats } from "./stats.js";

const RL_LOG_VERSION = __RL_VERSION__,
  LOG_KEY = "riftline.log.v4";
var errorLog = [],
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
    globalThis.localStorage && localStorage.setItem(LOG_KEY, JSON.stringify(errorLog));
  } catch {}
}
try {
  let i = globalThis.localStorage && localStorage.getItem(LOG_KEY);
  if (i) {
    let t = JSON.parse(i);
    Array.isArray(t) &&
      t.slice(-30).forEach((e) => {
        e && e.v === RL_LOG_VERSION && errorLog.push(e);
      });
  }
} catch {}
try {
  if (globalThis.localStorage)
    for (let j = localStorage.length - 1; j >= 0; j--) {
      let q = localStorage.key(j);
      q && (q.startsWith("riftline.log.v2.") || q === "riftline.log.v3") && localStorage.removeItem(q);
    }
} catch {}
function setLogContext(i) {
  logContext = { ...logContext, ...i };
}
function logError(i, t) {
  let e = t && typeof t === "object" ? t : null,
    n = e && e.error ? e.error : e && e.reason ? e.reason : t,
    s = String((n && n.message) || (e && e.message) || n || "unknown").slice(0, 300),
    r = String((e && (e.filename || e.fileName || "")) || "").slice(0, 500),
    a = Number(e && (e.lineno || e.line || 0)) || 0,
    o = Number(e && (e.colno || e.column || 0)) || 0,
    c = String((n && n.stack) || "")
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
    h = r ? `${r}:${a}:${o}` : "";
  if (h && s.endsWith("Script error.")) s += ` @ ${h}`;
  let l = new Date().toISOString(),
    u = errorLog.find((d) => d.msg === s && d.where === i && d.file === r && d.line === a && d.col === o);
  if (u) (u.n++, (u.last = l));
  else {
    for (
      errorLog.push({
        where: i,
        msg: s,
        stack: c,
        n: 1,
        first: l,
        last: l,
        v: logContext.version || RL_LOG_VERSION,
        file: r,
        line: a,
        col: o,
      });
      errorLog.length > 30;
    )
      errorLog.shift();
    typeof console < "u" && console.error("[riftline]", i, t);
  }
  saveErrorLog();
  for (let d of logListeners)
    try {
      d();
    } catch {}
}
function getErrorLog() {
  return errorLog;
}
function onLogChange(i) {
  return (logListeners.add(i), () => logListeners.delete(i));
}
function clearErrorLog() {
  ((errorLog.length = 0), saveErrorLog());
  for (let i of logListeners) i();
}
function buildReport() {
  let i = [
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
  for (let h of RL_HEALTH) i.push(`[${h.status}] ${h.id}: ${h.detail}`);
  rlAuditReportLines(i);
  i.push(
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
  errorLog.length || i.push("", "Errors: none recorded.");
  for (let t of errorLog) {
    let e = t.file ? ` @ ${t.file}:${t.line || 0}:${t.col || 0}` : "";
    (i.push(`[${t.where}] ${t.msg}  (x${t.n}, v${t.v}${e}, first ${t.first}, last ${t.last})`),
      t.stack &&
        i.push(
          t.stack
            .split(
              `
`,
            )
            .map((n) => "    " + n.trim()).join(`
`),
        ));
  }
  return i.join(`
`);
}
var RL_REQUIRED_DOM = [
    "abandonBtn",
    "backupBtn",
    "bank",
    "banner",
    "bestLine",
    "bossBar",
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
    "setCalm",
    "setContrast",
    "setMusic",
    "setNumbers",
    "setQuality",
    "setSfx",
    "setShake",
    "setSwap",
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
function rlHealthAdd(i, t, e) {
  RL_HEALTH.push({ id: i, status: t, detail: String(e || "") });
}
var RL_SELFTEST = null;
function rlSelfTest() {
  if (RL_SELFTEST && RL_SELFTEST.version === GAME_VERSION) return RL_SELFTEST;
  const selftestStarted = performance.now?.() || 0;
  let fail = [],
    warn = [],
    worlds = 0,
    waves = 0,
    weapons = 0,
    bosses = 0,
    det = 0,
    frames = 0,
    enemyTypes = 0,
    biomeCases = 0,
    threatCases = 0,
    upgradeChecks = 0,
    snapshotCases = 0,
    safePointCases = 0;
  const bad = (id, msg) => fail.push(`${id}: ${msg}`);
  const finite = (v) => Number.isFinite(v);
  try {
    const seeds = [0x13579bdf, 0x2468ace0, 0x10203040, 0x55667788, 0xa5a5a5a5];
    for (const seed of seeds) {
      const a = new World({ seed, weapon: "pulse", threat: 0, ws: {} }),
        b = new World({ seed, weapon: "pulse", threat: 0, ws: {} });
      for (let wave = 1; wave <= 20; wave++) {
        a.startWave(wave);
        b.startWave(wave);
        worlds++;
        waves++;
        if (a.arena.key !== b.arena.key || a.arena.W !== b.arena.W || a.arena.H !== b.arena.H)
          bad("determinism", `seed ${seed} wave ${wave} arena mismatch`);
        else det++;
        const currentBiome = a.biomeFor(wave)?.id,
          previousBiome = wave > 1 ? a.biomeFor(wave - 1)?.id : null;
        // 2.4.0: one biome per boss cycle — it changes right after each boss wave (5, 10, 15 …)
        if (wave > 1 && (currentBiome === previousBiome) !== ((wave - 1) % 5 !== 0))
          bad("biome-route", `biome must change exactly after boss waves (seed ${seed}, wave ${wave - 1}/${wave})`);
        if (a.event && (!waveEvents[a.event] || a.event === "dark"))
          bad("events", `invalid/removed event ${a.event} at seed ${seed} wave ${wave}`);
        if (a.boss && a.event) bad("events", `boss wave received event ${a.event} at seed ${seed} wave ${wave}`);
        if (!Array.isArray(a.arena.obs)) bad("arena", `missing obstacle array at seed ${seed} wave ${wave}`);
        if (
          wave >= 2 &&
          !a.boss &&
          (!a.arena.director || !Number.isFinite(a.arena.director.obstacles) || a.arena.director.obstacles < 0)
        )
          bad("director", `missing dynamic wave director at seed ${seed} wave ${wave}`);
        const featureSets = { vents: a.arena.vents || [], ice: a.arena.ice || [], acid: a.arena.acid || [] };
        for (const [featureType, items] of Object.entries(featureSets))
          for (const q of items) {
            if (![q.x, q.y, q.r].every(finite)) bad("features", `non-finite ${featureType} seed ${seed} wave ${wave}`);
            if (hitsObstacle(a.arena.obs, q.x, q.y, (q.r || 0) + 0.8))
              bad("features", `${featureType} overlaps obstacle at seed ${seed} wave ${wave}`);
          }
        const portals = a.arena.portals || [],
          portalPts = [];
        for (let pi = 0; pi < portals.length; pi++) {
          const q = portals[pi],
            pair = [
              { x: q.ax, y: q.ay },
              { x: q.bx, y: q.by },
            ];
          if (![q.ax, q.ay, q.bx, q.by].every(finite))
            bad("portal", `non-finite portal pair at seed ${seed} wave ${wave}`);
          const pairDist = Math.hypot(q.ax - q.bx, q.ay - q.by);
          if (finite(pairDist) && pairDist < 7.0)
            bad("portal", `portal pair too close (${pairDist.toFixed(2)}) at seed ${seed} wave ${wave}`);
          for (const p of pair) {
            if (![p.x, p.y].every(finite) || hitsObstacle(a.arena.obs, p.x, p.y, 1.5))
              bad("portal", `invalid portal endpoint at seed ${seed} wave ${wave}`);
            if (Math.abs(p.x) > a.arena.W - 3.6 || Math.abs(p.y) > a.arena.H - 3.6)
              bad("portal", `portal endpoint out of safe bounds at seed ${seed} wave ${wave}`);
            for (const prev of portalPts) {
              const d = Math.hypot(p.x - prev.x, p.y - prev.y);
              if (d < 4.0)
                bad("portal", `portal endpoints overlap/cluster (${d.toFixed(2)}) at seed ${seed} wave ${wave}`);
            }
            portalPts.push(p);
          }
        }
        const spawnProbeRng = makeRng(hashString(seed + ":spawn-probe:" + wave));
        for (const [clearance, dist] of [
          [7, 1],
          [9, 1.6],
          [3, 0.4],
        ]) {
          const p = a.arena.freePoint(spawnProbeRng, a.player.x, a.player.y, clearance, dist);
          if (
            !p ||
            !finite(p.x) ||
            !finite(p.y) ||
            a.arena.blocked(p.x, p.y, dist + 0.4) ||
            a.arena.featureBlocked(p.x, p.y, dist * 0.3)
          )
            bad("spawn-safe", `freePoint failed at seed ${seed} wave ${wave}`);
        }
        const helperRng = makeRng(hashString(seed + ":safe-point-probe:" + wave));
        for (const [minD, maxD] of [
          [2, 6],
          [4, 10],
          [1.5, 5],
        ]) {
          const p = findOpenSpot({ rng: helperRng, arena: a.arena }, a.player.x, a.player.y, minD, maxD);
          if (
            p &&
            (!finite(p.x) ||
              !finite(p.y) ||
              a.arena.outside(p.x, p.y, 2) ||
              a.arena.blocked(p.x, p.y, 2) ||
              a.arena.featureBlocked(p.x, p.y, 0.6))
          )
            bad("safe-point", `unsafe helper point seed ${seed} wave ${wave}`);
          else if (p) safePointCases++;
        }
      }
    }
    for (const b of biomeList)
      for (const seed of seeds) {
        const a = new World({ seed, weapon: "pulse", threat: 0, ws: {} });
        if (!a.route?.includes(b.id)) bad("biome-route", `seed ${seed} route is missing biome ${b.id}`);
      }
    for (const id of Object.keys(weaponDefs)) {
      const w = new World({ seed: 0x7f4a7c15, weapon: id, threat: 0, ws: {} });
      for (let f = 0; f < 12; f++) {
        w.step(1 / 60, {
          mx: 1,
          my: 0.15,
          aim: true,
          ax: 1,
          ay: 0.15,
          fire: true,
          assist: false,
          dash: f === 1,
          nova: f === 5,
        });
        frames++;
        if (![w.player.x, w.player.y, w.player.vx, w.player.vy, w.player.hp].every(finite))
          bad("weapon-runtime", `${id} produced non-finite player state`);
        for (const q of w.pb || [])
          if (![q.x, q.y, q.vx, q.vy, q.life].every(finite))
            bad("weapon-runtime", `${id} produced non-finite projectile state`);
      }
      weapons++;
    }
    for (const id of bossOrder) {
      const w = new World({ seed: 0x31415926, weapon: "pulse", threat: 0, ws: {} });
      w.startWave(bossByWave[5] === id ? 5 : bossByWave[10] === id ? 10 : bossByWave[15] === id ? 15 : 20);
      const boss = w.spawnBoss(id);
      bosses++;
      if (!boss || !finite(boss.hp) || !finite(boss.x) || !finite(boss.y)) bad("boss-runtime", `${id} failed spawn`);
      for (let f = 0; f < 4; f++) {
        w.step(1 / 60, { mx: 0, my: 0, aim: true, ax: 1, ay: 0, fire: true, assist: false });
        frames++;
        if (!w.boss || !finite(w.boss.hp)) bad("boss-runtime", `${id} failed during step`);
      }
    }
    for (const id of Object.keys(enemyDefs)) {
      const def = enemyDefs[id],
        w = new World({
          seed: hashString("enemy-probe:" + id),
          weapon: "pulse",
          threat: Math.min(5, Math.floor((def.from || 1) / 5)),
          ws: {},
        });
      w.startWave(Math.max(1, Math.min(50, def.from || 1)));
      const p = w.arena.freePoint(makeRng(hashString("enemy-spawn:" + id)), w.player.x, w.player.y, 6, 0.45);
      if (!p || !finite(p.x) || !finite(p.y)) bad("enemy-spawn", `${id} has no safe spawn point`);
      else {
        const q = w.spawnEnemy(id, p.x, p.y);
        if (!q || q.type !== id) bad("enemy-spawn", `${id} failed direct spawn`);
        else {
          q.t = 0;
          for (let f = 0; f < 60; f++) {
            w.step(1 / 60, { mx: 0.15, my: 0.05, aim: true, ax: 1, ay: 0.05, fire: true, assist: false });
            frames++;
            if (![q.x, q.y, q.vx, q.vy, q.hp, q.t, q.t2].every(finite))
              bad("enemy-runtime", `${id} produced non-finite state at frame ${f}`);
          }
          enemyTypes++;
        }
      }
    }
    for (const b of biomeList) {
      for (const seed of [0x10101, 0x20202, 0x30303]) {
        const a = new World({ seed, weapon: "pulse", threat: 2, ws: {} }),
          idx = a.route.indexOf(b.id),
          w = 1 + 5 * idx; // 2.4.0: first wave of that biome's boss cycle
        a.startWave(w);
        if (a.arena.biome?.id !== b.id)
          bad("biome-runtime", `route for seed ${seed} did not resolve ${b.id} at wave ${w}`);
        const p = a.arena.freePoint(makeRng(hashString(seed + ":" + b.id)), a.player.x, a.player.y, 4, 0.45);
        if (!p || a.arena.blocked(p.x, p.y, 0.85)) bad("biome-runtime", `unsafe spawn space in ${b.id} seed ${seed}`);
        biomeCases++;
      }
    }
    for (let threat = 0; threat <= 5; threat++)
      for (const seed of [0x4141, 0x5151]) {
        const w = new World({ seed, weapon: "pulse", threat, ws: {} });
        for (let wave = 1; wave <= 12; wave++) {
          w.startWave(wave);
          for (let f = 0; f < 8; f++) {
            w.step(1 / 60, {
              mx: f % 2 ? 0.4 : 0,
              my: f % 3 ? 0.2 : 0,
              aim: true,
              ax: 1,
              ay: 0,
              fire: true,
              assist: false,
              dash: f === 3,
              nova: f === 6,
            });
            frames++;
            if (![w.player.x, w.player.y, w.player.hp, w.time, w.kills, w.shards].every(finite))
              bad("threat-runtime", `Threat ${threat} wave ${wave} became non-finite`);
          }
        }
        threatCases++;
      }
    {
      const base = computeStats("pulse", {}, {}),
        boost = computeStats("pulse", { overclock: 3 }, {});
      if (!(boost.rateMul > base.rateMul && boost.velMul > base.velMul))
        bad("upgrade-runtime", "Overclock Matrix does not alter rate and velocity");
      else upgradeChecks++;
      for (const def of upgradeList) {
        const testUp = {};
        testUp[def.id] = 1;
        const stats = computeStats(def.weapon || "pulse", testUp, {
          hull: 1,
          power: 1,
          thrust: 1,
          dash: 1,
          magnet: 1,
          salvage: 1,
          reroll: 1,
          nova: 1,
          insight: 1,
          revive: 1,
        });
        const finiteNumbers = Object.entries(stats)
          .filter(([k]) => k !== "weapon")
          .every(([, v]) => typeof v !== "number" || Number.isFinite(v));
        if (!finiteNumbers) bad("upgrade-runtime", `${def.id} produced non-finite stat`);
        else upgradeChecks++;
      }
      const w = new World({ seed: 0x1ce55eed, weapon: "pulse", threat: 0, ws: {} });
      w.startWave(13);
      w.stats = computeStats("pulse", { bounty: 2, capacitor: 2 }, {});
      const p = w.arena.freePoint(makeRng(hashString("upgrade-kill-probe")), w.player.x, w.player.y, 6, 0.45),
        enemy = p && w.spawnEnemy("turret", p.x, p.y, { elite: !0 });
      if (!enemy) bad("upgrade-runtime", "could not spawn elite turret probe");
      else {
        const shardBefore = w.pickups.filter((q) => q.kind === "shard").reduce((n, q) => n + (q.v || 0), 0),
          novaBefore = w.player.nova;
        w.killEnemy(enemy);
        const shardAfter = w.pickups.filter((q) => q.kind === "shard").reduce((n, q) => n + (q.v || 0), 0),
          novaAfter = w.player.nova;
        if (shardAfter - shardBefore < 4) bad("upgrade-runtime", "Bounty Protocol did not add its bonus shards");
        else upgradeChecks++;
        if (novaAfter - novaBefore < 43.4) bad("upgrade-runtime", "Capacitor Bank did not add its bonus Nova charge");
        else upgradeChecks++;
      }
    }
    {
      const director = new World({ seed: 0x5a17c0de, weapon: "rocket", threat: 2, ws: {} });
      let dynamic = 0,
        caches = 0;
      for (let wave = 2; wave <= 28; wave++) {
        director.startWave(wave);
        dynamic += Math.max(0, director.arena.obs.length - (director.arena.biome.obstacles?.length || 0));
        caches += director.pickups.filter((q) => q.cache).length;
        for (const q of director.arena.obs)
          if (![q.x, q.y].every(finite)) bad("director-runtime", `non-finite dynamic obstacle at wave ${wave}`);
        for (const k of ["vents", "ice", "acid", "portals"])
          for (const q of director.arena[k] || [])
            for (const v of Object.values(q))
              if (typeof v === "number" && !finite(v)) bad("director-runtime", `non-finite ${k} value at wave ${wave}`);
      }
      if (dynamic < 8) bad("director-runtime", `too few dynamic obstacle cases (${dynamic})`);
      else det++;
      if (caches < 12) bad("director-runtime", `too few wave caches (${caches})`);
      else det++;
    }
    {
      const a = new World({ seed: 0xdecafbad, weapon: "pulse", threat: 3, ws: {} });
      a.startWave(7);
      for (let f = 0; f < 20; f++) {
        a.step(1 / 60, { mx: 0.3, my: 0.1, aim: true, ax: 1, ay: 0, fire: true, assist: false, dash: f === 4 });
        frames++;
      }
      const snap = a.snapshot(),
        b = new World({ snap, ws: {} });
      if (
        b.wave !== a.wave ||
        b.seed !== a.seed ||
        b.weapon !== a.weapon ||
        b.hp !== a.hp ||
        JSON.stringify(b.up) !== JSON.stringify(a.up)
      )
        bad("snapshot", "extended snapshot roundtrip mismatch");
      else snapshotCases++;
    }
    const offerWorld = new World({ seed: 0xabcdef01, weapon: "pulse", threat: 0, ws: {} }),
      offer = offerWorld.makeOffer();
    if (!Array.isArray(offer) || offer.length < 1 || offer.some((id) => !upgradesById[id]))
      bad("upgrade-offer", "invalid generated offer");
    else det++;
  } catch (e) {
    bad("selftest-exception", (e && e.message) || String(e));
  }
  RL_SELFTEST = {
    version: GAME_VERSION,
    ok: fail.length === 0,
    fail,
    warn,
    worlds,
    waves,
    weapons,
    bosses,
    det,
    frames,
    enemyTypes,
    biomeCases,
    threatCases,
    upgradeChecks,
    snapshotCases,
    safePointCases,
    ms: Math.max(0, Math.round((performance.now?.() || selftestStarted) - selftestStarted)),
  };
  return RL_SELFTEST;
}
var RL_LAST_RUN_AUDIT = null;
// assigned from other modules (an imported binding cannot be assigned)
function set_RL_LAST_RUN_AUDIT(v) {
  return (RL_LAST_RUN_AUDIT = v);
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
function rlRunAudit(w, outcome, abandoned) {
  const fail = [],
    warn = [],
    finite = (v) => Number.isFinite(v),
    add = (id, msg) => fail.push(`${id}: ${msg}`),
    aw = (id, msg) => warn.push(`${id}: ${msg}`);
  try {
    if (!w) {
      add("world", "world missing");
      return (RL_LAST_RUN_AUDIT = { ok: false, fail, warn, checks: [], outcome: "missing" });
    }
    const arena = w.arena;
    if (!arena || !finite(arena.W) || !finite(arena.H) || !Array.isArray(arena.obs))
      add("arena", "invalid arena geometry");
    if (arena) {
      if (!arena.biome || !biomesById[arena.biome.id]) add("biome", "unknown live biome");
      for (const enemy of w.enemies || [])
        if (!enemy?.type || !(enemyDefs[enemy.type] || (enemy.boss && bossDefs[enemy.type])))
          add("enemy", "unknown live enemy type");
      const checkObj = (arr, id) => {
        if (!Array.isArray(arr)) return;
        for (const q of arr) {
          for (const k of ["x", "y"]) {
            if (k in q && !finite(q[k])) {
              add(id, `non-finite ${k}`);
              break;
            }
          }
          if ("r" in q && !finite(q.r)) add(id, "non-finite radius");
        }
      };
      checkObj(arena.obs, "obstacle");
      checkObj(arena.vents, "vent");
      checkObj(arena.ice, "ice");
      checkObj(arena.acid, "acid");
      const pts = [];
      for (const q of arena.portals || []) {
        if (![q.ax, q.ay, q.bx, q.by].every(finite)) {
          add("portal", "non-finite endpoint");
          continue;
        }
        const d = Math.hypot(q.ax - q.bx, q.ay - q.by);
        if (d < 7) add("portal", `pair distance ${d.toFixed(2)} < 7.00`);
        for (const p of [
          { x: q.ax, y: q.ay },
          { x: q.bx, y: q.by },
        ]) {
          if (Math.abs(p.x) > arena.W - 3.6 || Math.abs(p.y) > arena.H - 3.6)
            add("portal", "endpoint outside safe bounds");
          if (hitsObstacle(arena.obs, p.x, p.y, 1.5)) add("portal", "endpoint overlaps obstacle");
          for (const old of pts) {
            const dd = Math.hypot(p.x - old.x, p.y - old.y);
            if (dd < 4) add("portal", `endpoint spacing ${dd.toFixed(2)} < 4.00`);
          }
          pts.push(p);
        }
      }
    }
    const finiteState = (q, id) => {
      if (!q || typeof q !== "object") return;
      for (const k of ["x", "y", "vx", "vy", "hp", "life", "t"]) {
        if (k in q && !finite(q[k])) {
          add(id, `non-finite ${k}`);
          break;
        }
      }
    };
    for (const q of w.enemies || []) finiteState(q, "enemy");
    for (const q of w.pb || []) finiteState(q, "projectile");
    for (const q of w.eb || []) finiteState(q, "enemy-shot");
    for (const q of w.hazards || []) finiteState(q, "hazard");
    for (const q of w.markers || []) finiteState(q, "marker");
    for (const q of w.pickups || []) finiteState(q, "pickup");
    if (w.boss) finiteState(w.boss, "boss");
    const p = w.player;
    if (!p || ![p.x, p.y, p.vx, p.vy, p.hp].every(finite)) add("player", "non-finite final player state");
    if (!finite(w.time) || !finite(w.shards) || !finite(w.kills)) add("run-state", "non-finite run totals");
    if (!["dead", "victory"].includes(w.state) && !abandoned) aw("state", `run ended in state ${w.state}`);
    if (w.event && (!waveEvents[w.event] || w.event === "dark"))
      add("event", "removed/invalid event reached at runtime");
  } catch (e) {
    add("audit-exception", (e && e.message) || String(e));
  }
  const a = {
    ok: fail.length === 0,
    fail,
    warn,
    checks: [],
    outcome: abandoned ? "abandoned" : outcome ? "victory" : "defeat",
    wave: w?.wave || 0,
    time: w?.time || 0,
    kills: w?.kills || 0,
    shards: w?.shards || 0,
  };
  RL_LAST_RUN_AUDIT = a;
  return a;
}

/* ---- event contract: every event the simulation emits must have a consumer
 (renderer, sound or UI) or be explicitly internal. Boss events must only be
 emitted while a boss is alive — enemy code once reused "phase"/"dash". ---- */
var RL_EVENT_KINDS = new Set([
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
  "cleared",
  "combo",
  "comboEnd",
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
  "salvagePulse",
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
var RL_BOSS_EVENTS = new Set(["phase", "enrage", "bossAtk"]);
/* positional payload the renderer reads for each event (missing -> NaN geometry) */
var RL_EVENT_FIELDS = {
  warp: ["x", "y", "tx", "ty"],
  kill: ["x", "y"],
  spawn: ["x", "y"],
  boom: ["x", "y", "r"],
  erupt: ["x", "y", "r"],
  edash: ["x", "y"],
  blink: ["x", "y"],
  heal: ["x", "y"],
  hurt: ["x", "y"],
  portal: ["x", "y"],
  dmg: ["x", "y"],
  chain: ["pts"],
};
function rlEventPayloadError(ev) {
  const f = Number.isFinite,
    need = RL_EVENT_FIELDS[ev.k];
  if (need)
    for (const q of need)
      if (q === "pts" ? !Array.isArray(ev.pts) || !ev.pts.every(f) : !f(ev[q])) return `"${ev.k}" is missing ${q}`;
  if (ev.k === "mend" && !(f(ev.x) && f(ev.y) && ((f(ev.tx) && f(ev.ty)) || f(ev.r))))
    return `"mend" needs a target (tx/ty) or a radius`;
  if ("x" in ev && !(f(ev.x) && f(ev.y))) return `"${ev.k}" has a non-finite position`;
  return "";
}
var RL_MON = null;
function rlMonErrKey(e) {
  return `${e.where}|${e.msg}|${e.file}|${e.line}`;
}
function rlMonStart(w, resume) {
  RL_MON = {
    w,
    resume: !!resume,
    t0: Date.now(),
    startWave: w.wave,
    weapon: w.weapon,
    threat: w.threat,
    errBase: new Map(errorLog.map((e) => [rlMonErrKey(e), e.n])),
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
    shards: w.shards,
    kills: w.kills,
  };
  rlMonBeginWave(w);
  // Resumed at the upgrade choice (or continuing into endless): that wave is already won.
  if (w.state === "choose" || w.state === "victory") RL_MON.cur.cleared = true;
}
function rlMonIssue(sev, id, msg) {
  const m = RL_MON;
  if (!m) return;
  const k = sev + "|" + id + "|" + msg,
    q = m.issues.get(k);
  if (q) q.n++;
  else if (m.issues.size < 80) m.issues.set(k, { sev, id, msg, n: 1, wave: m.w?.wave || 0 });
}
function rlMonBeginWave(w) {
  const m = RL_MON;
  if (!m) return;
  if (m.cur && !m.cur.cleared && m.cur.wave !== w.wave)
    rlMonIssue("WARN", "waves", `wave ${m.cur.wave} was left without a clear`);
  m.cur = {
    wave: w.wave,
    biome: w.arena?.biome?.id || "?",
    mode: w.waveMode || "-",
    boss: !!(w.bossPending || w.boss),
    t0: w.time,
    cleared: false,
    secs: 0,
    planned: w.planTotal || 0,
  };
  m.waves.push(m.cur);
  // Spawn plan contract: every member must be {type, elite} with a known enemy type.
  for (const g of w.plan || []) {
    if (!g || !Array.isArray(g.members) || !Number.isFinite(g.gap)) {
      rlMonIssue("FAIL", "spawn-plan", `wave ${w.wave}: malformed spawn group`);
      continue;
    }
    for (const q of g.members)
      if (!q || typeof q !== "object" || !enemyDefs[q.type])
        rlMonIssue("FAIL", "spawn-plan", `wave ${w.wave}: invalid plan member ${JSON.stringify(q)}`);
  }
  if (w.bossPending && !bossDefs[w.bossPending])
    rlMonIssue("FAIL", "spawn-plan", `wave ${w.wave}: unknown boss ${w.bossPending}`);
  if (w.championPending && !enemyDefs[w.championPending])
    rlMonIssue("FAIL", "spawn-plan", `wave ${w.wave}: unknown champion ${w.championPending}`);
  for (const [k, v] of Object.entries(w.stats || {}))
    if (typeof v === "number" && !Number.isFinite(v))
      rlMonIssue("FAIL", "stats", `wave ${w.wave}: stat ${k} is not finite`);
  m.pendingSnap = w.wave;
  m.pendingSnapFrames = 0;
}
function rlMonStep(w, n0, dash0, sh0, k0, dt) {
  const m = RL_MON;
  m.steps++;
  const fx = w.fx;
  for (let i = n0; i < fx.length; i++) {
    const ev = fx[i],
      k = ev && ev.k;
    m.events++;
    m.kinds[k] = (m.kinds[k] || 0) + 1;
    if (!RL_EVENT_KINDS.has(k)) rlMonIssue("WARN", "events", `"${k}" has no consumer`);
    {
      const pe = rlEventPayloadError(ev);
      pe && rlMonIssue("FAIL", "events", pe);
    }
    if (RL_BOSS_EVENTS.has(k) && !w.boss)
      rlMonIssue("FAIL", "events", `boss event "${k}" emitted without an active boss`);
    if (k === "phase" && w.boss && w.boss.type !== "core")
      rlMonIssue("FAIL", "events", `"phase" emitted by ${w.boss.type}`);
    if (k === "dash" && w.player.dashId === dash0)
      rlMonIssue("FAIL", "events", `"dash" emitted although the player did not dash`);
    if (k === "spawn" || k === "boss") {
      const type = k === "boss" ? ev.id : ev.type,
        known = k === "boss" ? !!bossDefs[type] : !!enemyDefs[type];
      if (!known) rlMonIssue("FAIL", "spawns", `unknown ${k} type ${type}`);
      else {
        m.types.add(type);
        if (k === "spawn" && renderer && !renderer.enemyPools[type])
          rlMonIssue("FAIL", "render", `no mesh pool for enemy ${type}`);
      }
    }
    if (k === "shot" && !weaponDefs[ev.w]) rlMonIssue("FAIL", "weapons", `shot from unknown weapon ${ev.w}`);
    if (k === "cleared" && m.cur) {
      m.cur.cleared = true;
      m.cur.secs = w.time - m.cur.t0;
      if (w.enemies.length || w.markers.length || w.planIdx < w.plan.length)
        rlMonIssue(
          "FAIL",
          "wave-end",
          `wave ${w.wave} cleared with ${w.enemies.length} enemies / ${w.markers.length} markers / ${w.plan.length - w.planIdx} groups left`,
        );
    }
  }
  if (w.shards < sh0) rlMonIssue("FAIL", "economy", "run shards decreased during a step");
  if (w.kills < k0) rlMonIssue("FAIL", "economy", "kill counter decreased during a step");
  // Soft-lock: nothing left to fight, but the wave does not end.
  const empty =
    w.state === "fight" &&
    w.planIdx >= w.plan.length &&
    !w.bossPending &&
    !w.championPending &&
    !w.enemies.length &&
    !w.markers.length;
  m.idleT = empty ? m.idleT + dt : 0;
  if (m.idleT > 4) rlMonIssue("FAIL", "wave-end", `wave ${w.wave} did not end although no enemies remain`);
  if (w.state === "fight" && m.cur && w.time - m.cur.t0 > 480)
    rlMonIssue("WARN", "waves", `wave ${w.wave} has lasted over 8 minutes`);
  if (m.steps % 20 === 0) rlMonSample(w);
}
function rlMonSample(w) {
  const m = RL_MON,
    f = Number.isFinite,
    p = w.player,
    A = w.arena;
  m.samples++;
  if (![p.x, p.y, p.vx, p.vy, p.hp, p.nova].every(f))
    rlMonIssue("FAIL", "invariants", "player state became non-finite");
  else {
    if (Math.abs(p.x) > A.W + 0.05 || Math.abs(p.y) > A.H + 0.05)
      rlMonIssue("FAIL", "invariants", "player left the arena bounds");
    if (p.hp > w.stats.maxHp + 0.5) rlMonIssue("FAIL", "invariants", "player HP above max HP");
    if (p.nova < 0 || p.nova > 100.01) rlMonIssue("FAIL", "invariants", "nova charge outside 0–100");
  }
  for (const e of w.enemies) {
    if (!(enemyDefs[e.type] || (e.boss && bossDefs[e.type]))) {
      rlMonIssue("FAIL", "invariants", `live enemy with unknown type ${e.type}`);
      continue;
    }
    if (![e.x, e.y, e.hp, e.vx, e.vy].every(f)) {
      rlMonIssue("FAIL", "invariants", `${e.type} state became non-finite`);
      continue;
    }
    if (Math.abs(e.x) > A.W + 1.5 || Math.abs(e.y) > A.H + 1.5)
      rlMonIssue("WARN", "invariants", `${e.type} outside the arena`);
    if (!e.boss && !e.ghost && A.blocked(e.x, e.y, -Math.min(0.3, e.r * 0.5)))
      rlMonIssue("WARN", "invariants", `${e.type} inside a wall`);
  }
  for (const q of w.pb)
    if (!f(q.x) || !f(q.y)) {
      rlMonIssue("FAIL", "invariants", `projectile (${q.w}) became non-finite`);
      break;
    }
  for (const q of w.eb)
    if (!f(q.x) || !f(q.y)) {
      rlMonIssue("FAIL", "invariants", "enemy shot became non-finite");
      break;
    }
  if (![w.shards, w.kills, w.time].every(f)) rlMonIssue("FAIL", "invariants", "run totals became non-finite");
  const P = m.peak;
  P.enemies = Math.max(P.enemies, w.enemies.length);
  P.pb = Math.max(P.pb, w.pb.length);
  P.eb = Math.max(P.eb, w.eb.length);
  P.pickups = Math.max(P.pickups, w.pickups.length);
  if (w.pb.length > 420 || w.eb.length > 360) rlMonIssue("FAIL", "invariants", "projectile pool cap exceeded");
  if (w.enemies.length > 140) rlMonIssue("WARN", "invariants", `${w.enemies.length} enemies alive at once`);
  if (w.pickups.length > 320) rlMonIssue("WARN", "invariants", `${w.pickups.length} pickups alive at once`);
}
/* Called once per rendered frame while a run is active and visible. */
function rlMonFrame(workMs) {
  const m = RL_MON;
  if (
    !m ||
    game.world !== m.w ||
    game.mode !== "game" ||
    game.paused ||
    game.chooseShown ||
    game.overShown ||
    document.visibilityState === "hidden"
  ) {
    if (m) m.lastT = 0;
  } else {
    const now = performance.now();
    if (m.lastT) {
      const dt = now - m.lastT;
      if (dt < 1000) {
        m.frames++;
        m.dtSum += dt;
        dt > 50 && m.slow++;
        dt > m.worst && (m.worst = dt);
        m.workSum += workMs;
      }
    }
    m.lastT = now;
  }
  // What is drawn must be the wave's own biome and layout (no mixed palettes / stale walls).
  if (m && renderer && game.world === m.w && game.mode === "game" && renderer.biome && (m.frames & 15) === 0) {
    const A = m.w.arena;
    renderer.biome.id !== A.biome.id &&
      rlMonIssue("FAIL", "render", `renderer shows biome ${renderer.biome.id} during a ${A.biome.id} wave`);
    renderer.arena.layKey !== A.key &&
      rlMonIssue("FAIL", "render", `renderer walls (${renderer.arena.layKey}) differ from the wave layout (${A.key})`);
    renderer.arena.biomeId !== A.biome.id &&
      rlMonIssue("FAIL", "render", `floor palette from ${renderer.arena.biomeId} during a ${A.biome.id} wave`);
  }
  // 2.3.2: while the run is being played the HUD (HP, pause, touch buttons) must be
  // on screen — Endless used to leave it hidden. 1.5 s of grace for transitions.
  if (
    m &&
    game.world === m.w &&
    game.mode === "game" &&
    !game.paused &&
    !game.chooseShown &&
    !game.overShown &&
    !["choose", "victory", "dead"].includes(m.w.state)
  ) {
    const hud = document.getElementById("hud");
    if (hud && (hud.hidden || hud.style.visibility === "hidden")) {
      const t = performance.now();
      m.hudOff || (m.hudOff = t);
      t - m.hudOff > 1500 &&
        rlMonIssue("FAIL", "hud", `HUD hidden during wave ${m.w.wave}${m.w.endless ? " (endless)" : ""}`);
    } else m.hudOff = 0;
  }
  // Every wave start writes a resumable snapshot; verify it with the real loader
  // (cheap cleanRun() per wave; the full world restore runs once at the end of the run).
  if (m && m.pendingSnap && game.world === m.w) {
    const run = store.data.run;
    if (run && run.wave === m.pendingSnap) {
      m.snaps.checked++;
      const wave = m.pendingSnap;
      m.pendingSnap = 0;
      try {
        const s = cleanRun(run);
        s
          ? (m.snaps.ok++, (m.lastSnap = s))
          : rlMonIssue("FAIL", "save", `wave ${wave} snapshot is rejected by the loader`);
      } catch (e) {
        rlMonIssue("FAIL", "save", `wave ${wave} snapshot check threw: ${e.message}`);
      }
    } else if (++m.pendingSnapFrames > 90) {
      rlMonIssue("FAIL", "save", `wave ${m.pendingSnap} snapshot was not written`);
      m.pendingSnap = 0;
    }
  }
}
function rlMonPreEnd(w) {
  const d = store.data,
    s = d.stats;
  return {
    bank: d.shards,
    kills: s.kills,
    runs: s.runs,
    deaths: s.deaths,
    clears: s.clears,
    bestWave: s.bestWave,
    shards: w.shards,
    runKills: w.kills,
    threat: w.threat,
    salvage: d.workshop.salvage || 0,
    endless: !!w.endless,
    wave: w.wave,
  };
}
/* Builds the post-run audit: final state (rlRunAudit) + monitor + save/economy. */
function rlMonFinish(w, pre, win, abandoned, silent, crashed) {
  const m = RL_MON && RL_MON.w === w ? RL_MON : null,
    fresh0 = !crashed && RL_LAST_RUN_AUDIT && RL_LAST_RUN_AUDIT.wave === w.wave && !RL_LAST_RUN_AUDIT.checks.length,
    base = fresh0 ? RL_LAST_RUN_AUDIT : rlRunAudit(w, win, abandoned);
  const checks = [],
    C = (st, id, msg) => checks.push({ st, id, msg });
  const issues = m ? [...m.issues.values()] : [],
    byId = (id) => issues.filter((q) => q.id === id);
  const fmt = (q) => `${q.msg}${q.n > 1 ? ` (×${q.n})` : ""}`;
  const group = (id, okMsg, ids = [id]) => {
    const qs = issues.filter((q) => ids.includes(q.id)),
      f = qs.filter((q) => q.sev === "FAIL"),
      wn = qs.filter((q) => q.sev === "WARN");
    C(
      f.length ? "FAIL" : wn.length ? "WARN" : "OK",
      id,
      f.length || wn.length
        ? [...f, ...wn].slice(0, 4).map(fmt).join(" | ") +
            (f.length + wn.length > 4 ? ` … +${f.length + wn.length - 4}` : "")
        : okMsg,
    );
  };
  if (crashed) C("FAIL", "crash", "the game loop crashed (3 consecutive frame errors)");
  // 1. runtime errors logged since the run started
  const fresh = m ? errorLog.filter((e) => (m.errBase.get(rlMonErrKey(e)) || 0) < e.n) : [];
  C(
    fresh.length ? "FAIL" : "OK",
    "runtime-errors",
    fresh.length
      ? fresh
          .slice(0, 3)
          .map((e) => `[${e.where}] ${e.msg}`)
          .join(" | ")
      : "none during this run",
  );
  // 2. final world state
  C(
    base.fail.length ? "FAIL" : base.warn.length ? "WARN" : "OK",
    "final-state",
    base.fail.length || base.warn.length
      ? [...base.fail, ...base.warn].slice(0, 4).join(" | ")
      : "arena, entities and totals are finite and consistent",
  );
  if (m) {
    group(
      "invariants",
      `${m.samples} samples over ${m.steps} steps · peak ${m.peak.enemies} enemies / ${m.peak.pb}+${m.peak.eb} shots / ${m.peak.pickups} pickups`,
    );
    group("spawn-plan", `${m.waves.length} wave plan(s) valid`, ["spawn-plan", "stats"]);
    const done = m.waves.filter((q) => q.cleared),
      longest = done.reduce((a, q) => (q.secs > a.secs ? q : a), { secs: 0, wave: 0 });
    group(
      "waves",
      `${done.length}/${m.waves.length} cleared${done.length ? ` · avg ${Math.round(done.reduce((a, q) => a + q.secs, 0) / done.length)} s · longest ${Math.round(longest.secs)} s (wave ${longest.wave})` : ""}`,
      ["waves", "wave-end"],
    );
    group("spawns", `${m.types.size} enemy/boss types seen · all with meshes`, ["spawns", "render"]);
    group("events", `${m.events} events · ${Object.keys(m.kinds).length} kinds · all consumed`, ["events", "weapons"]);
    group("economy", "shards and kills only increased", ["economy"]);
    group("hud", "HUD visible whenever a wave was being played");
    if (m.lastSnap)
      try {
        const s = m.lastSnap,
          t = new World({ snap: s, ws: store.data.workshop });
        (t.wave !== s.wave || t.weapon !== s.weapon || JSON.stringify(t.up) !== JSON.stringify(s.up)) &&
          rlMonIssue("FAIL", "save", `wave ${s.wave} snapshot restores a different run`);
      } catch (e) {
        rlMonIssue("FAIL", "save", `wave ${m.lastSnap.wave} snapshot restore threw: ${e.message}`);
      }
    const sq = [...m.issues.values()].filter((q) => q.id === "save");
    C(
      sq.some((q) => q.sev === "FAIL") ? "FAIL" : m.snaps.checked ? "OK" : "WARN",
      "snapshots",
      sq.length
        ? sq.slice(0, 3).map(fmt).join(" | ")
        : m.snaps.checked
          ? `${m.snaps.ok}/${m.snaps.checked} wave snapshot(s) accepted by the loader · last one restored into a live world`
          : "no wave snapshot was verified",
    );
    const fps = m.dtSum > 0 ? m.frames / (m.dtSum / 1000) : 0,
      slowPct = m.frames ? (m.slow / m.frames) * 100 : 0;
    C(
      m.frames < 120 ? "INFO" : fps < 40 || slowPct > 5 ? "WARN" : "OK",
      "performance",
      m.frames
        ? `${fps.toFixed(0)} fps avg · ${m.slow} slow frame(s) >50 ms (${slowPct.toFixed(1)}%) · worst ${Math.round(m.worst)} ms · JS ${(m.workSum / m.frames).toFixed(1)} ms/frame`
        : "no frames measured",
    );
    const inp = RL_RT.pointerdown + RL_RT.keydown - m.inputBase;
    C(
      inp > 0 ? "OK" : "WARN",
      "input",
      inp > 0 ? `${inp} input event(s) during the run` : "no input events observed during this run",
    );
  } else C("WARN", "monitor", "run monitor was not attached (run started before diagnostics were ready)");
  if (!crashed) {
    // 3. payout, records and persistence after endRun() ran
    const d = store.data,
      c = pre.shards,
      bonus = win ? Math.round(c * 0.25) : 0,
      expect = Math.round((c + bonus) * threatMods(pre.threat).shards * (1 + 0.1 * pre.salvage)),
      got = d.shards - pre.bank;
    C(
      got === expect ? "OK" : "FAIL",
      "payout",
      got === expect ? `+${expect} shards credited` : `bank changed by ${got}, expected +${expect}`,
    );
    const s = d.stats,
      rec = [];
    s.kills - pre.kills !== pre.runKills && rec.push(`kills +${s.kills - pre.kills} (run had ${pre.runKills})`);
    s.bestWave < (win ? 20 : pre.wave) && rec.push(`best wave ${s.bestWave} < reached ${win ? 20 : pre.wave}`);
    win && !pre.endless && s.clears !== pre.clears + 1 && rec.push("clear not counted");
    !win && !abandoned && s.deaths !== pre.deaths + 1 && rec.push("death not counted");
    C(
      rec.length ? "FAIL" : "OK",
      "records",
      rec.length ? rec.join(" | ") : `kills +${pre.runKills} · best wave ${s.bestWave}`,
    );
    const per = [];
    d.run !== null && per.push("finished run is still stored as resumable");
    try {
      const r = store.parse(JSON.stringify(d));
      r.ok || per.push("save does not round-trip");
    } catch (e) {
      per.push("save round-trip threw: " + e.message);
    }
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    } catch {}
    if (!store.storageOk) C("WARN", "persistence", "storage is blocked — progress only lives in memory");
    else {
      (stored && stored.savedAt === d.savedAt && stored.shards === d.shards) ||
        per.push("localStorage does not match the in-memory save");
      C(
        per.length ? "FAIL" : "OK",
        "persistence",
        per.length ? per.join(" | ") : "run cleared · save round-trips · localStorage in sync",
      );
    }
  }
  const fail = checks.filter((q) => q.st === "FAIL").map((q) => `${q.id}: ${q.msg}`),
    warn = checks.filter((q) => q.st === "WARN").map((q) => `${q.id}: ${q.msg}`);
  const a = {
    ...base,
    ok: !fail.length,
    fail,
    warn,
    checks,
    outcome: crashed ? "crashed" : base.outcome,
    wave: w.wave,
    time: w.time,
    kills: w.kills,
    shards: w.shards,
    weapon: w.weapon,
    threat: w.threat,
    endScreen: null,
  };
  RL_LAST_RUN_AUDIT = a;
  RL_MON = null;
  if (!silent && !crashed) {
    // 4. end screen: visible, HUD hidden, every control reachable (checked two frames later)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          const over = document.getElementById("over"),
            hud = document.getElementById("hud"),
            la = window.__riftLayoutAudit?.(),
            probs = [];
          over.hidden && probs.push("run summary not shown");
          hud.hidden || probs.push("HUD still visible");
          la && !la.ok && probs.push(...la.findings.slice(0, 3));
          const st = probs.length ? "FAIL" : "OK";
          a.checks.push({
            st,
            id: "end-screen",
            msg: probs.length ? probs.join(" | ") : `${la ? la.checked : 0} controls reachable`,
          });
          if (probs.length) {
            a.ok = !1;
            a.fail.push("end-screen: " + probs.join(" | "));
          }
        } catch (e) {
          a.checks.push({ st: "WARN", id: "end-screen", msg: e.message });
        }
        a.fail.length &&
          ui.toast(
            `Diagnostics: ${a.fail.length} problem${a.fail.length === 1 ? "" : "s"} in this run — Settings › Diagnostics`,
            "warn",
            6000,
          );
        rlRunHealth({ context: "post-run" }).catch((e) => logError("health", e));
      }),
    );
  } else rlRunHealth({ context: "post-run" }).catch((e) => logError("health", e));
  return a;
}
function rlMonCrashed() {
  try {
    const w = RL_MON && RL_MON.w;
    w && rlMonFinish(w, rlMonPreEnd(w), !1, !1, !0, !0);
  } catch {}
}
function rlAuditReportLines(out) {
  const a = RL_LAST_RUN_AUDIT;
  if (!a) return;
  const f = a.checks.filter((q) => q.st === "FAIL").length,
    w = a.checks.filter((q) => q.st === "WARN").length;
  out.push(
    "",
    `Post-run audit: ${String(a.outcome).toUpperCase()} · ${a.weapon ? weaponDefs[a.weapon]?.name + " · " : ""}wave ${a.wave} · ${formatTime(a.time || 0)} · ${a.checks.length} checks · ${f} FAIL · ${w} WARN`,
  );
  for (const q of a.checks) out.push(`  [${q.st}]${" ".repeat(Math.max(1, 5 - q.st.length))}${q.id}: ${q.msg}`);
}
function rlUiButtonGuardSelfTest() {
  // Runs on a detached host: no document-level listeners fire, so the test
  // cannot unlock audio or pollute the runtime counters shown in the log.
  const host = document.createElement("div");
  host.setAttribute("data-rift-ui-test", "1");
  const fake = { sound: { play: () => {} }, store: { data: {} }, input: {} },
    ui = { g: fake };
  ui.click = GameUI.prototype.click;
  let count = 0,
    steps = 0,
    pass = true;
  const drops = RL_RT.uiGuardDrops;
  const make = (key = "") => {
    const b = document.createElement("button");
    b.type = "button";
    key && (b.dataset.buy = key);
    host.appendChild(b);
    ui.click.call(ui, b, () => count++);
    return b;
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
    let b = make("touch-test");
    touch(b, 41, 12, 12);
    host.replaceChildren();
    b = make("touch-test");
    click(b, 12, 12);
    if (count !== 1) pass = false;
    steps++;
    // 2. A later deliberate click remains available.
    click(b, 12, 12);
    if (count !== 2) pass = false;
    steps++;
    // 3. Pointer-id mismatch must not activate; the matching pointer does, and its ghost click is dropped.
    b = make();
    b.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 50,
        pointerType: "pen",
        isPrimary: true,
        clientX: 4,
        clientY: 4,
      }),
    );
    b.dispatchEvent(
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
    b.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 50,
        pointerType: "pen",
        isPrimary: true,
        clientX: 4,
        clientY: 4,
      }),
    );
    click(b, 4, 4);
    if (count !== 3) pass = false;
    steps++;
    // 4. Pointer cancellation must not suppress the following ordinary click.
    b = make();
    b.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 60,
        pointerType: "touch",
        isPrimary: true,
        clientX: 8,
        clientY: 8,
      }),
    );
    b.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 60,
        pointerType: "touch",
        isPrimary: true,
        clientX: 8,
        clientY: 8,
      }),
    );
    b.dispatchEvent(new PointerEvent("click", { bubbles: true, detail: 1, clientX: 8, clientY: 8 }));
    if (count !== 4) pass = false;
    steps++;
    // 5. Secondary pointers cannot hijack the primary activation.
    b = make();
    b.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 70,
        pointerType: "touch",
        isPrimary: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    b.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 71,
        pointerType: "touch",
        isPrimary: false,
        clientX: 10,
        clientY: 10,
      }),
    );
    b.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 70,
        pointerType: "touch",
        isPrimary: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    b.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 71,
        pointerType: "touch",
        isPrimary: false,
        clientX: 10,
        clientY: 10,
      }),
    );
    click(b, 10, 10);
    if (count !== 5) pass = false;
    steps++;
    // 6. A button disabled between press and release must not arm a stale guard.
    b = make();
    b.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 75,
        pointerType: "touch",
        isPrimary: true,
        clientX: 90,
        clientY: 90,
      }),
    );
    b.disabled = true;
    b.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 75,
        pointerType: "touch",
        isPrimary: true,
        clientX: 90,
        clientY: 90,
      }),
    );
    b.disabled = false;
    click(b, 90, 90);
    if (count !== 6 || RL_TOUCH_CLICK_GUARD.until !== 0) pass = false;
    steps++;
    // 7. Ghost click after a screen change: a DIFFERENT button now under the finger must not fire
    //    (2.2.2 bug: tapping Home on the run summary started a new run via START RUN).
    const a = make("a");
    touch(a, 80, 100, 100);
    b = make("b");
    click(b, 100, 100);
    if (count !== 7) pass = false;
    steps++;
    // 8. A click far away from the last tap is a new, deliberate action.
    touch(a, 81, 100, 100);
    b = make("c");
    click(b, 300, 300);
    if (count !== 9) pass = false;
    steps++;
  } catch (e) {
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
var RL_HEALTH_BUSY = null;
function rlRunHealth(opts) {
  const o = typeof opts === "object" && opts ? opts : { context: opts || "startup" };
  if (RL_HEALTH_BUSY) {
    if (!o.deep) return RL_HEALTH_BUSY;
    return RL_HEALTH_BUSY.then(() => rlRunHealth(o));
  }
  RL_HEALTH_BUSY = rlRunHealthNow(o).finally(() => {
    RL_HEALTH_BUSY = null;
  });
  return RL_HEALTH_BUSY;
}
async function rlRunHealthNow({ context = "startup", deep = false } = {}) {
  RL_HEALTH = [];
  let ok = (i, e, n) => rlHealthAdd(i, e ? "OK" : "FAIL", n),
    warn = (i, n) => rlHealthAdd(i, "WARN", n),
    info = (i, n) => rlHealthAdd(i, "INFO", n);
  info("context", `${context}${deep ? " · deep" : ""} · ${new Date().toISOString()}`);
  try {
    ok(
      "version-bundle",
      GAME_VERSION === RL_LOG_VERSION && logContext.version === RL_LOG_VERSION,
      `JS ${GAME_VERSION} · logger ${RL_LOG_VERSION} · runtime ${logContext.version || "?"}`,
    );
  } catch (e) {
    rlHealthAdd("version-bundle", "FAIL", e.message);
  }
  try {
    let meta = document.querySelector('meta[name="riftline-version"]')?.content || "?",
      buildMeta = document.querySelector('meta[name="riftline-build"]')?.content || "?",
      scripts = [...document.scripts].map((e) => e.src || e.getAttribute("src") || "").filter(Boolean),
      gameSrc = scripts.find((e) => /game-v/i.test(e)) || "",
      file = gameSrc.split("/").pop() || "";
    ok(
      "version-contract",
      meta === GAME_VERSION && file === `game-v${GAME_VERSION}-final.js` && buildMeta === BUILD_ID,
      `HTML ${meta} · JS ${GAME_VERSION} · script ${file || "?"} · build ${buildMeta}${buildMeta === BUILD_ID ? "" : " ≠ " + BUILD_ID}`,
    );
  } catch (e) {
    rlHealthAdd("version-contract", "FAIL", e.message);
  }
  try {
    let m = RL_REQUIRED_DOM.filter((e) => !document.getElementById(e));
    ok(
      "dom",
      m.length === 0,
      m.length
        ? `${m.length} missing: ${m.slice(0, 8).join(", ")}${m.length > 8 ? "…" : ""}`
        : `${RL_REQUIRED_DOM.length} required nodes present`,
    );
  } catch (e) {
    rlHealthAdd("dom", "FAIL", e.message);
  }
  try {
    let ids = [...document.querySelectorAll("[id]")].map((e) => e.id),
      dup = ids.filter((v, i) => ids.indexOf(v) !== i);
    ok(
      "dom-unique",
      dup.length === 0,
      dup.length ? `duplicate ids: ${[...new Set(dup)].join(", ")}` : `${ids.length} ids unique`,
    );
  } catch (e) {
    rlHealthAdd("dom-unique", "FAIL", e.message);
  }
  try {
    let c = document.getElementById("gl"),
      g = c && c.getContext && (c.getContext("webgl2") || c.getContext("webgl"));
    if (!!renderer && !!g) rlHealthAdd("webgl", "OK", "renderer/context ready");
    else rlHealthAdd("webgl", "WARN", "WebGL unavailable; gameplay start is disabled but the menu remains interactive");
  } catch (e) {
    rlHealthAdd("webgl", "WARN", e.message || "WebGL check unavailable");
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
  } catch (e) {
    rlHealthAdd("game-data", "FAIL", e.message);
  }
  try {
    const reqE = ["leaper", "turret", "charger", "minebot", "drone", "driller", "beacon", "weaver"],
      reqB = ["works", "vault", "void", "marsh"],
      reqU = [
        "overclock",
        "bounty",
        "capacitor",
        "caliber",
        "stabilizer",
        "hunter",
        "supply",
        "momentum",
        "laststand",
        "scavenger",
        "vector",
      ],
      badE = Object.keys(enemyDefs).filter((id) => !enemyDefs[id] || (!(enemyDefs[id].from >= 1) && id !== "mite")),
      badEvo = upgradeList.filter((u) => u.evo && Object.keys(u.evo).some((k) => !upgradesById[k])).map((u) => u.id),
      badWpn = upgradeList.filter((u) => u.weapon && !weaponDefs[u.weapon]).map((u) => u.id),
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
  } catch (e) {
    rlHealthAdd("content-contract", "FAIL", e.message);
  }
  try {
    const noPool = renderer ? Object.keys(enemyDefs).filter((t) => !renderer.enemyPools[t]) : [],
      noModel = Object.keys(enemyDefs).filter((t) => !RL_MESH_TYPES.includes(t)),
      noSfx = Object.keys(weaponDefs).filter((w) => !RL_SFX_VOICES.includes(rlShotSfx(w))),
      noMusic = biomeList.filter((b) => !musicChords[b.id] || !musicVoices[b.id]).map((b) => b.id),
      noTip = Object.keys(enemyDefs).filter((t) => t !== "mite" && !RL_ENEMY_TIPS[t]),
      miss = [
        ...noPool.map((t) => "mesh pool " + t),
        ...noModel.map((t) => "model " + t),
        ...noSfx.map((t) => "sound " + t),
        ...noMusic.map((t) => "music " + t),
        ...noTip.map((t) => "intro " + t),
      ];
    ok(
      "content-coverage",
      !miss.length,
      miss.length
        ? `missing: ${miss.slice(0, 8).join(", ")}`
        : `${Object.keys(weaponDefs).length} weapons voiced · ${Object.keys(enemyDefs).length} enemies with own model + intro · ${biomeList.length}/${biomeList.length} biomes with own music theme`,
    );
  } catch (e) {
    rlHealthAdd("content-coverage", "FAIL", e.message);
  }
  try {
    let v = [typeof game?.startRun, typeof game?.pause, typeof game?.resume, typeof game?.restart];
    ok(
      "game-state",
      v.every((e) => e === "function"),
      v.join(" | "),
    );
  } catch (e) {
    rlHealthAdd("game-state", "FAIL", e.message);
  }
  try {
    if (typeof PointerEvent !== "undefined" && typeof MouseEvent !== "undefined") {
      let r = rlUiButtonGuardSelfTest();
      ok(
        "ui-input-dedupe",
        r.ok,
        `${r.steps}/8 pointer-gesture cases · ${r.count}/9 expected activations · ghost clicks after screen changes are dropped`,
      );
    } else {
      rlHealthAdd("ui-input-dedupe", "WARN", "PointerEvent or MouseEvent unavailable in this browser");
    }
  } catch (e) {
    rlHealthAdd("ui-input-dedupe", "FAIL", e.message);
  }
  try {
    if (deep) {
      const r = rlSelfTest(),
        xf = [...(r.expansion21?.fail || []), ...(r.expansion22?.fail || []), ...(r.expansion23?.fail || [])],
        all = [...r.fail, ...xf];
      RL_SELFTEST_LAST = { r, at: Date.now() };
      rlHealthAdd(
        "self-test",
        r.ok ? "OK" : "FAIL",
        `${r.worlds} arena cases · ${r.expansion23?.planWaves || 0} wave plans / ${r.expansion23?.spawned || 0} spawns · ${r.expansion23?.eventKinds || 0} event kinds · ${r.weapons} weapons · ${r.bosses} bosses · ${r.enemyTypes} enemy probes · ${r.biomeCases} biome cases · ${r.threatCases} threat cases · ${r.upgradeChecks} upgrade checks · ${r.frames} sim frames · ${r.ms} ms` +
          (all.length ? ` · ${all.slice(0, 4).join(" | ")}` : " · deterministic + runtime checks passed"),
      );
    } else if (RL_SELFTEST_LAST) {
      const r = RL_SELFTEST_LAST.r;
      rlHealthAdd(
        "self-test",
        r.ok ? "OK" : "FAIL",
        `last deep run ${new Date(RL_SELFTEST_LAST.at).toLocaleTimeString()} · ${r.ok ? "passed" : "failed: " + [...r.fail, ...(r.expansion21?.fail || []), ...(r.expansion22?.fail || []), ...(r.expansion23?.fail || [])].slice(0, 3).join(" | ")} · ${r.expansion23?.planWaves || 0} wave plans · ${r.expansion23?.spawned || 0} spawns · ${r.frames} sim frames (tap “Deep test” to re-run)`,
      );
    } else info("self-test", "not run in quick checks — tap “Deep test” in this dialog (takes a few seconds)");
  } catch (e) {
    rlHealthAdd("self-test", "FAIL", e.message);
  }
  try {
    if (RL_LAST_RUN_AUDIT) {
      let a = RL_LAST_RUN_AUDIT,
        f = a.checks.filter((q) => q.st === "FAIL"),
        w = a.checks.filter((q) => q.st === "WARN");
      rlHealthAdd(
        "post-run-audit",
        f.length ? "FAIL" : w.length ? "WARN" : "OK",
        `${a.outcome} · wave ${a.wave} · ${a.checks.length} checks · ${f.length} fail · ${w.length} warn` +
          (f.length
            ? ` · ${f
                .slice(0, 2)
                .map((q) => q.id)
                .join(", ")}`
            : w.length
              ? ` · ${w
                  .slice(0, 2)
                  .map((q) => q.id)
                  .join(", ")}`
              : " · run verified"),
      );
    }
  } catch (e) {
    rlHealthAdd("post-run-audit", "FAIL", e.message);
  }
  try {
    let v =
      typeof input?.sample === "function" &&
      typeof input?.reset === "function" &&
      typeof input?.press === "function" &&
      typeof input?.onBlur === "function";
    ok("input-api", v, v ? "pointer + keyboard pipeline ready" : "missing input methods");
    info(
      "input-runtime",
      `down ${RL_RT.pointerdown} · move ${RL_RT.pointermove} · up ${RL_RT.pointerup} · cancel ${RL_RT.pointercancel} · keys ${RL_RT.keydown}/${RL_RT.keyup} · resets ${RL_RT.reset}`,
    );
  } catch (e) {
    rlHealthAdd("input-api", "FAIL", e.message);
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
      s = cleanRun(bad);
    ok(
      "save-sanitize",
      !rejected &&
        !!s &&
        s.wave === 12 &&
        s.weapon === "pulse" &&
        s.hp === 999999 &&
        s.up.dmg === 8 &&
        s.bossKills.length === 1 &&
        Number.isFinite(s.time) &&
        Number.isFinite(s.shards) &&
        s.offer.length === 1,
      "invalid run rejected; bounded run snapshot sanitized",
    );
  } catch (e) {
    rlHealthAdd("save-sanitize", "FAIL", e.message);
  }
  try {
    ok(
      "save-envelope",
      store.parse(JSON.stringify({ game: "riftline" })).ok === false &&
        store.parse(JSON.stringify({ game: "riftline", v: 1 })).ok === true,
      "import requires the v1 save envelope",
    );
  } catch (e) {
    rlHealthAdd("save-envelope", "FAIL", e.message);
  }
  try {
    let r = store.parse(JSON.stringify(store.data));
    ok("save-roundtrip", !!r && r.ok, "current save serializes + parses successfully");
  } catch (e) {
    rlHealthAdd("save-roundtrip", "FAIL", e.message);
  }
  try {
    const run = store.data.run;
    if (run) {
      const s = cleanRun(run),
        t = s && new World({ snap: s, ws: store.data.workshop });
      ok(
        "save-resume",
        !!t && t.wave === s.wave,
        t
          ? `stored run (wave ${s.wave}, ${weaponDefs[s.weapon].name}) restores`
          : "stored run is rejected by the loader",
      );
    } else info("save-resume", "no unfinished run stored");
  } catch (e) {
    rlHealthAdd("save-resume", "FAIL", e.message);
  }
  try {
    let key = "__rift_health_" + GAME_VERSION,
      old = localStorage.getItem(key);
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    ok("storage", true, "write/remove test passed");
    old !== null && localStorage.setItem(key, old);
  } catch (e) {
    warn("storage", "localStorage unavailable or restricted");
  }
  try {
    let w = window.innerWidth,
      h = window.innerHeight,
      d = window.devicePixelRatio || 0,
      ins = safeAreaInsets();
    ok(
      "viewport",
      w > 0 && h > 0 && d > 0 && [ins.t, ins.b, ins.l, ins.r].every(Number.isFinite),
      `${w}×${h} @${d}; insets ${ins.t}/${ins.b}/${ins.l}/${ins.r} · ${document.body.dataset.device || "?"}/${document.body.dataset.orientation || "?"}`,
    );
  } catch (e) {
    rlHealthAdd("viewport", "FAIL", e.message);
  }
  try {
    let de = document.documentElement,
      overflowX = de.scrollWidth > window.innerWidth + 1,
      overflowY = de.scrollHeight > window.innerHeight + 1;
    rlHealthAdd(
      "layout-overflow",
      overflowX || overflowY ? "WARN" : "OK",
      `scroll ${de.scrollWidth}×${de.scrollHeight} vs viewport ${window.innerWidth}×${window.innerHeight}`,
    );
  } catch (e) {
    rlHealthAdd("layout-overflow", "FAIL", e.message);
  }
  try {
    if (document.fonts && typeof document.fonts.check === "function") {
      let a = document.fonts.check('16px "Chakra Petch"'),
        b = document.fonts.check('16px "Barlow Semi Condensed"');
      a && b
        ? ok("fonts", true, "declared game fonts available")
        : warn("fonts", `font check: Chakra ${a ? "OK" : "WARN"}, Barlow ${b ? "OK" : "WARN"}`);
    } else warn("fonts", "FontFaceSet API unavailable");
  } catch (e) {
    warn("fonts", e.message);
  }
  try {
    let a = window.__riftLayoutAudit?.() || null;
    rlHealthAdd(
      "layout-hit-test",
      a?.ok ? "OK" : "FAIL",
      a
        ? `${a.checked} visible controls checked on “${ui?.screen || "?"}” · ${a.bad || 0} covered/misaligned${a.bad ? ": " + a.findings.slice(0, 3).join("; ") : ""}`
        : `layout audit unavailable`,
    );
  } catch (e) {
    rlHealthAdd("layout-hit-test", "FAIL", e.message);
  }
  try {
    let p = typeof PointerEvent !== "undefined";
    ok(
      "device-input",
      p,
      `PointerEvent ${p ? "OK" : "missing"} · touch points ${navigator.maxTouchPoints || 0} · touch API ${"ontouchstart" in window ? "OK" : "n/a"}`,
    );
  } catch (e) {
    rlHealthAdd("device-input", "FAIL", e.message);
  }
  try {
    if (typeof caches !== "undefined") {
      const prefix = `riftline-v${GAME_VERSION.replace(/\./g, "-")}-`;
      let keys = await caches.keys(),
        current = keys.find((e) => e.startsWith(prefix)),
        stale = keys.filter((e) => e.startsWith("riftline-") && !e.startsWith(prefix));
      rlHealthAdd(
        "cache-version",
        current ? "OK" : "WARN",
        current
          ? `current cache ${current}${stale.length ? ` · stale caches visible: ${stale.join(", ")}` : ""}`
          : `current ${GAME_VERSION} cache not found yet (normal on the very first visit)${stale.length ? ` · stale: ${stale.join(", ")}` : ""}`,
      );
    } else warn("cache-version", "CacheStorage API unavailable");
  } catch (e) {
    warn("cache-version", e.message);
  }
  try {
    if ("serviceWorker" in navigator) {
      let r = await navigator.serviceWorker.getRegistration(),
        active = !!r?.active,
        controlled = !!navigator.serviceWorker.controller;
      rlHealthAdd(
        "service-worker",
        active ? "OK" : "WARN",
        `${active ? "active" : "no active"} registration · page ${controlled ? "controlled" : "not controlled"}${r?.waiting ? " · update waiting" : ""}`,
      );
    } else warn("service-worker", "Service Worker API unavailable");
  } catch (e) {
    warn("service-worker", e.message);
  }
  try {
    let res = await fetch(`./build-info.json?health=${Date.now()}`, { cache: "no-store" }),
      b = res.ok ? await res.json() : null,
      okBuild = !!b && b.version === GAME_VERSION && b.build_id === BUILD_ID;
    rlHealthAdd(
      "build-info-network",
      okBuild ? "OK" : "WARN",
      b
        ? `network build ${b.version} · ${b.build_id || "?"}${okBuild ? "" : ` (this page runs ${GAME_VERSION} · ${BUILD_ID})`}`
        : `HTTP ${res.status}`,
    );
  } catch (e) {
    warn("build-info-network", "offline or build-info fetch blocked");
  }
  try {
    let a = RL_HEALTH.filter((e) => e.status === "OK").length,
      w = RL_HEALTH.filter((e) => e.status === "WARN").length,
      f = RL_HEALTH.filter((e) => e.status === "FAIL").length;
    logContext.health = `${a} OK / ${w} WARN / ${f} FAIL`;
  } catch {}
  return RL_HEALTH;
}
var RL_SELFTEST_LAST = null;
function rlHealthSummary() {
  let a = RL_HEALTH.filter((e) => e.status === "OK").length,
    w = RL_HEALTH.filter((e) => e.status === "WARN").length,
    f = RL_HEALTH.filter((e) => e.status === "FAIL").length;
  return `Health: ${a} OK · ${w} WARN · ${f} FAIL`;
}

/* ---- 2.2.3 deep self-test additions: each case reproduces a bug class that
 slipped through 2.2.2 (plan members, event names, save loader, texts, arena features).
 Every section runs in its own try so one failure cannot hide the others. ---- */
const _rlSelfTestCore = rlSelfTest;
rlSelfTest = function () {
  const r = _rlSelfTestCore(),
    t0 = performance.now(),
    f = Number.isFinite,
    cats = new Map();
  const bad = (cat, ex) => {
    const q = cats.get(cat);
    q ? (q.n++, q.all.length < 8 && q.all.push(ex)) : cats.set(cat, { n: 1, ex, all: [ex] });
  };
  const section = (cat, fn) => {
    try {
      fn();
    } catch (e) {
      bad(cat + "-exception", String((e && e.message) || e));
    }
  };
  let planWaves = 0,
    spawned = 0,
    eventKinds = new Set(),
    featureLayouts = 0,
    features = 0,
    snaps = 0;
  // 1. every wave's spawn plan (incl. director bonus groups) must be valid and spawn, waves 2–60
  section("plan", () => {
    for (const threat of [0, 5]) {
      const w = new World({ seed: 0x51, weapon: "pulse", threat, ws: { fieldSupply: 3 } });
      for (let wave = 2; wave <= 60; wave++) {
        w.startWave(wave);
        planWaves++;
        for (const g of w.plan)
          for (let gi = 0; gi < g.members.length; gi++) {
            const q = g.members[gi];
            if (!q || typeof q !== "object" || !enemyDefs[q.type]) {
              bad("plan-member", `wave ${wave}: ${JSON.stringify(q)}`);
              continue;
            }
            if (gi) continue; // every member is type-checked; one per group is spawned for real
            const p = w.arena.freePoint(w.rng, w.player.x, w.player.y, 4, 0.5),
              e = w.spawnEnemy(q.type, p.x, p.y, { elite: q.elite });
            spawned++;
            if (!e || ![e.x, e.y, e.hp].every(f)) bad("plan-spawn", `${q.type} @ wave ${wave}`);
          }
        if (w.bossPending && !bossDefs[w.bossPending]) bad("plan-boss", `${w.bossPending} @ wave ${wave}`);
        w.enemies.length = 0;
      }
    }
  });
  // 2. event contract: every enemy type fights for 7 s near a stationary player, no boss present
  section("events", () => {
    for (const id of Object.keys(enemyDefs)) {
      const w = new World({ seed: hashString("ev:" + id), weapon: "pulse", threat: 0, ws: {} });
      w.startWave(41);
      w.god = !0;
      w.hold = !0;
      w.plan = [];
      w.bossPending = null;
      w.championPending = null;
      w.fx.length = 0;
      let p = null;
      for (let a = 0; a < 12 && !p; a++) {
        const x = w.player.x + Math.cos(a * 0.52) * 7,
          y = w.player.y + Math.sin(a * 0.52) * 7;
        w.arena.blocked(x, y, 1) || w.arena.outside(x, y, 1) || (p = { x, y });
      }
      p = p || w.arena.freePoint(w.rng, w.player.x, w.player.y, 5, 0.6);
      w.spawnEnemy(id, p.x, p.y, {}).spawnT = 0;
      for (let k = 0; k < 420; k++) {
        const d0 = w.player.dashId,
          n0 = w.fx.length;
        w.step(1 / 60, { mx: 0, my: 0, aim: !1, fire: !1, auto: !1 });
        for (let i = n0; i < w.fx.length; i++) {
          const q = w.fx[i].k;
          eventKinds.add(q);
          RL_EVENT_KINDS.has(q) || bad("event-unconsumed", `"${q}" from ${id}`);
          {
            const pe = rlEventPayloadError(w.fx[i]);
            pe && bad("event-payload", `${pe} (${id})`);
          }
          RL_BOSS_EVENTS.has(q) && !w.boss && bad("event-boss-only", `"${q}" from ${id}`);
          q === "dash" && w.player.dashId === d0 && bad("event-player-dash", `"dash" from ${id}`);
        }
        w.fx.length = 0;
      }
    }
  });
  // 2b. the sound engine gives every weapon a voice (exercises the real consumer)
  section("sfx", () => {
    const s = new SoundEngine(),
      heard = [];
    s.ctx = { state: "running" };
    s.play = (n) => heard.push(n);
    for (const id of Object.keys(weaponDefs)) {
      heard.length = 0;
      s.consume([{ k: "shot", w: id }]);
      RL_SFX_VOICES.includes(heard[0]) || bad("sfx-silent-weapon", id);
    }
  });
  // 2e. every biome has one coherent palette and valid champion variants
  section("palette", () => {
    for (const b of biomeList) {
      const p = rlPaletteIssues(b);
      p.length && bad("biome-palette", `${b.id}: ${p.join(", ")}`);
    }
    for (const q of rlBiomeDistinct()) bad("biome-lookalike", q);
    for (const [id, v] of Object.entries(biomeVariants))
      ["scorch", "frost", "phase", "toxic"].includes(v.id) || bad("variant-dead", `${id} → ${v.id}`);
    for (const [id, v] of Object.entries(biomeVariants))
      for (const t of v.types) enemyDefs[t] || bad("variant-type", `${id}: ${t}`);
  });
  // 2c. music: every biome has its own theme and every step of fight/boss/menu music schedules cleanly
  section("music", () => {
    const O = typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : null;
    for (const b of biomeList) {
      if (!musicChords[b.id] || !musicVoices[b.id]) {
        bad("music-missing", b.id);
        continue;
      }
      if (!O) continue;
      const s = new SoundEngine(),
        c = new O(1, 2205, 22050);
      s.ctx = c;
      s.mus = c.createGain();
      s.delay = c.createDelay(1);
      s.sfx = c.createGain();
      s.mus.connect(c.destination);
      s.delay.connect(s.mus);
      s.sfx.connect(c.destination);
      s.noiseBuf = c.createBuffer(1, 2205, 22050);
      s.biome = b.id;
      for (const [mode, n] of [
        ["fight", 64],
        ["menu", 16],
      ]) {
        s.mode = mode;
        s.intensity = 0.9;
        s.cycle = 0;
        for (let t = 0; t < n; t++) s.note(t, 0);
      }
    }
  });
  // 2d. stragglers: a hunting enemy of every type closes in on a stationary player
  section("hunt", () => {
    for (const id of Object.keys(enemyDefs)) {
      if (id === "mite" || id === "hive") continue;
      const w = new World({ seed: hashString("hunt:" + id), weapon: "pulse", threat: 0, ws: {} });
      w.startWave(41);
      w.god = !0;
      w.hold = !0;
      w.plan = [];
      w.bossPending = null;
      w.championPending = null;
      let p = null;
      for (let a = 0; a < 24 && !p; a++) {
        const x = w.player.x + Math.cos(a * 0.26) * 12,
          y = w.player.y + Math.sin(a * 0.26) * 12;
        w.arena.blocked(x, y, 1.2) || w.arena.outside(x, y, 1.2) || (p = { x, y });
      }
      p = p || w.arena.freePoint(w.rng, w.player.x, w.player.y, 9, 0.6);
      const e = w.spawnEnemy(id, p.x, p.y, {});
      e.spawnT = 0;
      e.hunt = !0;
      e.hp = e.maxHp = 1e9;
      const d0 = Math.hypot(e.x - w.player.x, e.y - w.player.y);
      let dmin = d0;
      for (let k = 0; k < 480; k++) {
        w.step(1 / 60, { mx: 0, my: 0, fire: !1, auto: !1 });
        e.hunt = !0;
        dmin = Math.min(dmin, Math.hypot(e.x - w.player.x, e.y - w.player.y));
      }
      dmin > 6 &&
        bad("straggler-kites", `${id} stayed ${dmin.toFixed(1)} m away (start ${d0.toFixed(1)}) while hunting`);
    }
  });
  // 3. save loader: live snapshots must pass cleanRun() and restore the same run
  section("snapshot", () => {
    for (const wave of [1, 7, 19, 33]) {
      const w = new World({ seed: 0x77 + wave, weapon: "tesla", threat: 1, ws: { hull: 2 } });
      w.startWave(wave);
      w.up = { dmg: 2, orbit: 1 };
      w.stats = computeStats(w.weapon, w.up, w.ws);
      const s = cleanRun(JSON.parse(JSON.stringify(w.snapshot()))),
        b = s && new World({ snap: s, ws: { hull: 2 } });
      if (!b || b.wave !== wave || b.weapon !== "tesla" || b.up.dmg !== 2)
        bad("snapshot", `wave ${wave} does not restore`);
      else snaps++;
    }
  });
  // 4. upgrade texts describe the level you are about to take (no "+0 %")
  section("desc", () => {
    for (const u of upgradeList) {
      const t = u.desc(0);
      /(^|[^\d.])[+\-]?0(%|\s|\))/.test(t) && bad("desc-zero", `${u.id}: “${t}”`);
    }
  });
  // 5. every weapon has a firing voice; every enemy has a mesh pool
  section("coverage", () => {
    if (renderer) for (const id of Object.keys(enemyDefs)) renderer.enemyPools[id] || bad("mesh", id);
  });
  // 6. arena features (vents, ice, acid, portals) of every biome, waves 21–60: no overlap with obstacles, portals valid
  section("features", () => {
    for (const b of biomeList)
      for (const wave of [21, 33, 47, 58]) {
        const lay = buildLayout(b, 0x33 + wave, wave, !1),
          F = lay.features || {};
        featureLayouts++;
        for (const k of ["vents", "ice", "acid"])
          for (const q of F[k] || []) {
            features++;
            if (![q.x, q.y, q.r].every(f) || hitsObstacle(lay.obstacles, q.x, q.y, (q.r || 0) + 0.8))
              bad("feature-overlap", `${k} in ${b.id} wave ${wave}`);
          }
        for (const q of F.portals || []) {
          features++;
          for (const [x, y] of [
            [q.ax, q.ay],
            [q.bx, q.by],
          ])
            if (
              !f(x) ||
              !f(y) ||
              hitsObstacle(lay.obstacles, x, y, 1.5) ||
              Math.abs(x) > lay.W - 3.6 ||
              Math.abs(y) > lay.H - 3.6
            )
              bad("portal", `${b.id} wave ${wave}`);
        }
        if ("pads" in F) bad("pads-removed", `${b.id} still generates jump pads`);
        const theme = RL_BIOME_HAZARD[b.id] ?? "";
        for (const k of ["vents", "ice", "acid", "portals"])
          (F[k] || []).length && k !== theme && bad("hazard-theme", `${k} in ${b.id} (theme: ${theme || "none"})`);
      }
  });
  const fail = [...cats].map(([c, q]) => `${c}${q.n > 1 ? ` ×${q.n}` : ""} (${q.all.join("; ")})`);
  return {
    ...r,
    ok: r.ok && !fail.length,
    expansion23: {
      ok: !fail.length,
      fail,
      planWaves,
      spawned,
      eventKinds: eventKinds.size,
      snapshots: snaps,
      featureLayouts,
      features,
      ms: Math.round(performance.now() - t0),
    },
  };
};
function rlLum(c) {
  return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
}
function rlPaletteIssues(b) {
  const L = rlLum,
    out = [];
  L(b.floor) > 0.1 && out.push(`floor too bright (${L(b.floor).toFixed(2)})`);
  L(b.fog) > 0.08 && out.push(`fog too bright (${L(b.fog).toFixed(2)})`);
  L(b.ground) > 0.1 && out.push(`ground light too bright (${L(b.ground).toFixed(2)})`);
  L(b.wall) > 0.2 && out.push(`walls too bright (${L(b.wall).toFixed(2)})`);
  L(b.grid) < 0.4 && out.push(`grid too dark (${L(b.grid).toFixed(2)})`);
  L(b.accent) < 0.35 && out.push(`accent too dark (${L(b.accent).toFixed(2)})`);
  (L(b.sky) < 0.12 || L(b.sky) > 0.55) && out.push(`sky light out of range (${L(b.sky).toFixed(2)})`);
  return out;
}
/* 2.3.3: biomes must be told apart at a glance. The floor is near-black in every
 biome, so identity rests on the grid colour: CIE76 ΔE between the grids of any
 two biomes must be >= 30 (≈ clearly different hue or lightness). */
function rlLab(c) {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4),
    r = lin((c >> 16) & 255),
    g = lin((c >> 8) & 255),
    b = lin(c & 255);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047),
    y = f(r * 0.2126 + g * 0.7152 + b * 0.0722),
    z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function rlBiomeDistinct(min = 30) {
  const out = [];
  for (let i = 0; i < biomeList.length; i++)
    for (let j = i + 1; j < biomeList.length; j++) {
      const a = rlLab(biomeList[i].grid),
        b = rlLab(biomeList[j].grid),
        d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      d < min && out.push(`${biomeList[i].id}/${biomeList[j].id} ΔE ${d.toFixed(0)}`);
    }
  return out;
}
const _rlSelfTest22 = rlSelfTest;
rlSelfTest = function () {
  const r = _rlSelfTest22(),
    fail = [];
  const weapons = Object.keys(weaponDefs),
    enemies = Object.keys(enemyDefs),
    biomes = Object.keys(biomesById),
    upgrades = Object.keys(upgradesById),
    modules = Object.keys(modulesById);
  if (!["drone", "driller", "beacon", "weaver"].every((k) => enemies.includes(k))) fail.push("missing-v22-enemy");
  if (
    ![
      "kinetic",
      "deadeye",
      "thruster",
      "nanorepair",
      "salvager",
      "phasecoat",
      "flux",
      "payloadMatrix",
      "chainlink",
      "afterburner",
    ].every((k) => upgrades.includes(k))
  )
    fail.push("missing-v22-upgrade");
  if (!["routeScanner", "reactorCore"].every((k) => modules.includes(k))) fail.push("missing-v22-workshop");
  // 2.4.0: every selectable weapon (the 2.2 weapons are gone)
  for (const id of weaponOrder) {
    const w = new World({ seed: 0x2200 + id.length, weapon: id, threat: 0, ws: {} });
    w.startWave(2);
    w.fire(0);
    if (!w.pb.length) fail.push("weapon-fire:" + id);
    for (const q of w.pb)
      if (![q.x, q.y, q.vx, q.vy, q.r, q.dmg, q.life].every(Number.isFinite)) fail.push("weapon-finite:" + id);
  }
  for (const id of ["drone", "driller", "beacon", "weaver"]) {
    const w = new World({ seed: 0x3300 + id.length, weapon: "pulse", threat: 0, ws: {} });
    w.startWave(28);
    const e = w.spawnEnemy(id, 8, 0, {});
    for (let k = 0; k < 90; k++) {
      updateEnemy(w, e, 0.05);
      e.x += e.vx * 0.05;
      e.y += e.vy * 0.05;
      if (![e.x, e.y, e.vx, e.vy, e.hp].every(Number.isFinite)) fail.push("enemy-finite:" + id);
    }
  }
  const modes = new Set();
  // 2.4.0: every hazard biome for every wave (picking one biome by (seed + wave) % count only
  // reached 9 of the 12 modes once there were four biomes)
  for (let seed = 1; seed <= 4; seed++)
    for (let wave = 2; wave <= 38; wave++)
      for (const b of biomeList.slice(1)) {
        const lay = buildLayout(b, seed, wave, false);
        if (!lay.director?.mode) fail.push("director-missing");
        else modes.add(lay.director.mode);
        if (!isConnected(lay.obstacles, lay.W, lay.H)) fail.push("director-connectivity");
        for (const key of ["vents", "ice", "acid"]) {
          for (const q of lay.features?.[key] || [])
            if (hitsObstacle(lay.obstacles, q.x, q.y, (q.r || 0) + 0.8)) fail.push("feature-overlap:" + key);
        }
        for (const q of lay.features?.portals || []) {
          for (const [x, y] of [
            [q.ax, q.ay],
            [q.bx, q.by],
          ])
            if (hitsObstacle(lay.obstacles, x, y, 1.5) || Math.abs(x) > lay.W - 3.6 || Math.abs(y) > lay.H - 3.6)
              fail.push("portal-overlap");
        }
      }
  if (modes.size < 10) fail.push("director-variety");
  let minCache = Infinity,
    maxCache = 0;
  for (let wave = 2; wave <= 30; wave++) {
    const w = new World({ seed: 0x4400 + wave, weapon: "pulse", threat: 0, ws: { fieldSupply: 1 } });
    w.startWave(wave);
    const c = w.pickups.filter((p) => p.cache).length;
    if (w.bossPending) {
      c && fail.push("cache-in-boss-wave:" + wave);
      continue;
    }
    minCache = Math.min(minCache, c);
    maxCache = Math.max(maxCache, c);
    if (c < 1) fail.push("cache-missing:" + wave);
  }
  const haz = new World({ seed: 0x5500, weapon: "pulse", threat: 0, ws: { hazardSeal: 3 } });
  if (!(haz.stats.hazardResist > 0.4)) fail.push("hazard-resist");
  const guard = rlUiButtonGuardSelfTest();
  if (!guard.ok || guard.count !== 9 || guard.steps !== 8) fail.push("ui-guard");
  const counts = {
    weaponCount: weapons.length,
    enemyCount: enemies.length,
    biomeCount: biomes.length,
    upgradeCount: upgrades.length,
    workshopCount: modules.length,
    directorModes: [...modes],
    cacheRange: [minCache, maxCache],
  };
  return { ...r, ok: r.ok && fail.length === 0, expansion22: { ok: fail.length === 0, fail, ...counts } };
};
const _rlSelfTest21 = rlSelfTest;
rlSelfTest = function () {
  const r = _rlSelfTest21(),
    fail = [];
  const weapons = Object.keys(weaponDefs),
    enemies = Object.keys(enemyDefs),
    biomes = Object.keys(biomesById),
    upgrades = Object.keys(upgradesById);
  if (!["sapper", "phantom", "sentinel", "carrier"].every((k) => enemies.includes(k))) fail.push("missing-v21-enemy");
  if (
    !["overload", "focus", "resonance", "fortify", "leech", "hazmat", "echo", "scavengerNet"].every((k) =>
      upgrades.includes(k),
    )
  )
    fail.push("missing-v21-upgrade");
  // 2.4.0: every weapon with a blast (was Graviton Core, Nova Bloom and Vortex)
  for (const k of weaponOrder.filter((id) => weaponDefs[id].explode)) {
    const w = new World({ seed: 0x21 + k.length, weapon: k, threat: 0, ws: {} });
    w.startWave(2);
    w.bulletBurst({ x: 0, y: 0, w: k, dmg: 10, hits: [], bomblet: false, wing: false }, null);
    if (!w.fx.some((q) => q.k === "boom")) fail.push("burst:" + k);
  }
  const modes = new Set();
  for (let seed = 1; seed <= 4; seed++)
    for (let wave = 2; wave <= 28; wave++) {
      const b = biomeList[1 + ((seed + wave) % (biomeList.length - 1))],
        lay = buildLayout(b, seed, wave, false);
      if (!lay.director?.mode) fail.push("director-missing");
      else modes.add(lay.director.mode);
      if (!isConnected(lay.obstacles, lay.W, lay.H)) fail.push("director-connectivity");
    }
  if (modes.size < 6) fail.push("director-variety");
  return {
    ...r,
    ok: r.ok && fail.length === 0,
    expansion21: {
      ok: fail.length === 0,
      fail,
      weaponCount: weapons.length,
      enemyCount: enemies.length,
      biomeCount: biomes.length,
      upgradeCount: upgrades.length,
      directorModes: [...modes],
    },
  };
};
const _rlSelfTest240 = rlSelfTest;
rlSelfTest = function () {
  const r = _rlSelfTest240(),
    fail = [];
  if (weaponOrder.length !== 7 || Object.keys(weaponDefs).length !== 7) fail.push("weapon-count:" + weaponOrder.length);
  if (biomeList.length !== 5) fail.push("biome-count:" + biomeList.length);
  for (const u of upgradeList) if (u.weapon && !weaponDefs[u.weapon]) fail.push("evo-weapon:" + u.id);
  // route: Neon Yard first, then one biome per boss cycle, all five by wave 21
  for (const seed of [11, 222, 3333, 44444]) {
    const w = new World({ seed, weapon: "pulse", threat: 0, ws: {} }),
      seen = new Set();
    for (let wave = 1; wave <= 30; wave++) {
      const b = w.biomeFor(wave).id;
      wave <= 21 && seen.add(b);
      wave <= 5 && b !== "yard" && fail.push(`route-start:${seed}:${wave}`);
      if (wave > 1 && (b === w.biomeFor(wave - 1).id) !== ((wave - 1) % 5 !== 0))
        fail.push(`route-cycle:${seed}:${wave}`);
    }
    seen.size !== 5 && fail.push(`route-coverage:${seed}:${seen.size}`);
  }
  // every hazard biome has its hazard in a normal wave, and only that one
  const want = { works: "vents", vault: "ice", marsh: "acid", void: "portals" };
  for (const [id, kind] of Object.entries(want)) {
    const w = new World({ seed: 0x240 + id.length, weapon: "pulse", threat: 0, ws: {} }),
      wave = 2 + 5 * w.route.indexOf(id);
    w.startWave(wave);
    if (w.arena.biome.id !== id) fail.push("hazard-biome:" + id);
    if (!w.arena[kind].length) fail.push("hazard-missing:" + id);
    for (const k of ["vents", "ice", "acid", "portals"])
      k !== kind && w.arena[k].length && fail.push(`hazard-foreign:${id}:${k}`);
  }
  // Cryo Vault: the drone drifts (lower grip than anywhere else)
  const drift = (id) => {
    const w = new World({ seed: 0x2401, weapon: "pulse", threat: 0, ws: {} });
    w.startWave(1 + 5 * w.route.indexOf(id));
    w.arena.ice.length = 0;
    w.enemies.length = 0;
    w.plan = [];
    w.step(1 / 60, { mx: 1, my: 0 });
    return w.player.vx;
  };
  if (!(drift("vault") < drift("yard") * 0.6)) fail.push("vault-grip");
  // enemy mix: each biome spawns more of its own enemies than Neon Yard does
  for (const [id, info] of Object.entries(RL_BIOME_INFO)) {
    if (!info.mix) continue;
    const own = Object.keys(info.mix).filter((k) => info.mix[k] > 1),
      count = (mix) => {
        let n = 0;
        set_RL_BIOME_MIX_CUR(mix);
        try {
          for (let s = 1; s <= 12; s++)
            for (const g of planWave(makeRng(hashString("mix:" + s)), 30, threatMods(0), !1, {}))
              n += g.members.filter((m) => own.includes(m.type)).length;
        } finally {
          set_RL_BIOME_MIX_CUR(null);
        }
        return n;
      };
    if (!(count(info.mix) > count(null) * 1.3)) fail.push("enemy-mix:" + id);
  }
  // old saves: retired weapons become their original + refund, run and selection follow
  const note = RL_RETIRE_NOTE,
    m = rlMigrateRetired({
      shards: 100,
      weapon: "ion",
      weapons: { pulse: true, ion: true, voidlance: true, rail: true },
      run: { weapon: "cyclone", wave: 4 },
    });
  set_RL_RETIRE_NOTE(note);
  if (
    m.weapon !== "tesla" ||
    m.run.weapon !== "disc" ||
    !m.weapons.tesla ||
    m.weapons.ion ||
    m.weapons.voidlance ||
    m.shards !== 100 + (1250 - weaponDefs.tesla.cost) + 1950
  )
    fail.push("migrate:" + JSON.stringify(m));
  if (rlMigrateRetired(m) !== m) fail.push("migrate-twice");
  return { ...r, ok: r.ok && fail.length === 0, v240: { ok: fail.length === 0, fail } };
};
// 2.4.6: one boss per biome, Void Core always waves 16–20 with the Rift Core as the final boss.
const _rlSelfTest246 = rlSelfTest;
rlSelfTest = function () {
  const r = _rlSelfTest246(),
    fail = [];
  for (const [biome, id] of Object.entries(bossByBiome)) {
    if (!biomesById[biome]) fail.push("boss-biome:" + biome);
    if (!bossDefs[id]) fail.push("boss-def:" + id);
  }
  if (Object.keys(bossByBiome).length !== biomeList.length) fail.push("boss-per-biome");
  for (const seed of [11, 222, 3333, 44444, 0x246]) {
    const w = new World({ seed, weapon: "pulse", threat: 0, ws: {} }),
      mid = new Set([w.biomeFor(6).id, w.biomeFor(11).id]);
    if (w.biomeFor(16).id !== "void" || w.biomeFor(20).id !== "void") fail.push(`void-last:${seed}`);
    if (w.bossFor(20) !== "core") fail.push(`final-boss:${seed}`);
    if (w.bossFor(5) !== "warden") fail.push(`first-boss:${seed}`);
    if (mid.size !== 2 || mid.has("void") || mid.has("yard")) fail.push(`mid-biomes:${seed}`);
    if (w.biomeFor(21).id === "void" || w.biomeFor(21).id === "yard" || mid.has(w.biomeFor(21).id))
      fail.push(`endless-biome:${seed}`);
    for (let wave = 5; wave <= 60; wave += 5)
      if (w.bossFor(wave) !== bossByBiome[w.biomeFor(wave).id]) fail.push(`boss-mismatch:${seed}:${wave}`);
  }
  // the hull of a boss in waves 5–20 follows its slot, whichever boss it is
  const hull = (id, wave) => {
    const w = new World({ seed: 0x2460, weapon: "pulse", threat: 0, ws: {} });
    w.startWave(wave);
    return w.spawnBoss(id).maxHp;
  };
  for (const wave of [10, 15])
    for (const id of ["prism", "forge"])
      if (!(Math.abs(hull(id, wave) - hull("queen", wave)) < 1e-6)) fail.push(`slot-hull:${id}:${wave}`);
  if (!(hull("queen", 15) > hull("queen", 10))) fail.push("slot-hull-order");
  return { ...r, ok: r.ok && fail.length === 0, v246: { ok: fail.length === 0, fail } };
};
window.addEventListener("error", (i) => logError("window", i));
window.addEventListener("unhandledrejection", (i) => logError("promise", i.reason || i));
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
    (e) => {
      const b = e.target?.closest?.("button,[role=button],a");
      if (b && !b.disabled) {
        RL_RT.buttonActivations++;
        RL_RT.lastButton = (b.id || b.dataset.go || b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
      }
    },
    true,
  );
})();

// ---- 2.5.0 C: stronger biomes — hazard count, size and fairness, one biome event per visit of a
// hazard biome and what it does, signature enemies from the biome's first wave, old saved runs.
import { RL_BIOME_EVENT, rlEnemyFrom } from "./waves.js";
import { RL_HAZARD_SIZE_250, rlSpawnZone } from "./arena.js";
const _rlSelfTest250C = rlSelfTest;
rlSelfTest = function () {
  const r = _rlSelfTest250C(),
    fail = [],
    bad = (k) => fail.length < 40 && fail.push(k),
    theme = { works: "vents", vault: "ice", marsh: "acid" },
    // fairness of one arena: hazards off obstacles and walls, the spawn ring clear, portals valid
    fair = (A, tag) => {
      for (const k of ["vents", "ice", "acid"])
        for (const q of A[k]) {
          if (q.life != null) continue;
          if (hitsObstacle(A.obs, q.x, q.y, q.r + 0.8)) bad("hazard-on-obstacle:" + tag);
          if (Math.hypot(q.x - rlSpawnZone.x, q.y - rlSpawnZone.y) < q.r + rlSpawnZone.r) bad("hazard-in-spawn:" + tag);
          if (Math.abs(q.x) + q.r > A.W - 1.4 || Math.abs(q.y) + q.r > A.H - 1.4) bad("hazard-at-wall:" + tag);
        }
      const ends = [];
      for (const q of A.portals) {
        if (Math.hypot(q.ax - q.bx, q.ay - q.by) < 7) bad("portal-pair-close:" + tag);
        for (const [x, y] of [
          [q.ax, q.ay],
          [q.bx, q.by],
        ]) {
          if (hitsObstacle(A.obs, x, y, 1.5) || Math.abs(x) > A.W - 3.6 || Math.abs(y) > A.H - 3.6)
            bad("portal-bad:" + tag);
          ends.some((e) => Math.hypot(e[0] - x, e[1] - y) < 4) && bad("portal-cluster:" + tag);
          ends.push([x, y]);
        }
      }
    };
  // 1. hazards: about five per wave, 25–30% bigger than 2.4.6, fair; Void Core mostly two portal pairs
  const count = { vents: [0, 0], ice: [0, 0], acid: [0, 0] },
    pairs = [0, 0];
  for (let seed = 1; seed <= 24; seed++) {
    const w = new World({ seed: 0x2500 + seed, weapon: "pulse", threat: 0, ws: {} });
    for (let wave = 6; wave <= 24; wave++) {
      if (w.bossFor(wave)) continue;
      w.startWave(wave);
      const A = w.arena,
        id = A.biome.id,
        k = theme[id];
      fair(A, `${seed}:${wave}`);
      if (w.event && waveEvents[w.event].biome) continue; // the event adds its own
      if (k) {
        count[k][0] += A[k].length;
        count[k][1]++;
        for (const q of A[k])
          (q.r < RL_HAZARD_SIZE_250[k][0] - 1e-9 || q.r > RL_HAZARD_SIZE_250[k][1] + 1e-9) && bad("hazard-size:" + k);
      } else if (id === "void") (pairs[0] += A.portals.length >= 2 ? 1 : 0), pairs[1]++;
    }
  }
  for (const [k, [n, waves]] of Object.entries(count)) waves && n / waves < 4.3 && bad(`hazard-count:${k}:${(n / waves).toFixed(2)}`);
  pairs[1] && pairs[0] / pairs[1] < 0.7 && bad("portal-pairs:" + (pairs[0] / pairs[1]).toFixed(2));
  // 2. biome events: one per visit of a hazard biome, in wave 2–4 of the visit, only there, never
  // next to another event
  for (let seed = 1; seed <= 30; seed++) {
    const w = new World({ seed: 0x25c0 + seed, weapon: "pulse", threat: 0, ws: {} }),
      evs = [];
    for (let wave = 1; wave <= 40; wave++) evs[wave] = w.eventFor(wave);
    for (let start = 1; start <= 36; start += 5) {
      const id = w.biomeFor(start).id,
        want = RL_BIOME_EVENT[id],
        got = [1, 2, 3, 4, 5].map((k) => evs[start + k - 1]).filter((e) => e && waveEvents[e].biome);
      if (want ? got.length !== 1 || got[0] !== want : got.length) bad(`biome-event:${seed}:${start}:${got}`);
      if (evs[start] || evs[start + 4]) bad(`event-first-or-boss:${seed}:${start}`);
    }
    for (let wave = 2; wave <= 40; wave++) evs[wave] && evs[wave - 1] && bad(`event-adjacent:${seed}:${wave}`);
  }
  for (const [id, e] of Object.entries(RL_BIOME_EVENT))
    (!waveEvents[e] || waveEvents[e].biome !== id || !waveEvents[e].name || !waveEvents[e].desc) && bad("event-def:" + e);
  // 3. what the events do (run in the world with a god-mode player standing still)
  const eventWorld = (biome, seed = 0x25e0) => {
    for (let s = seed; s < seed + 40; s++) {
      const w = new World({ seed: s, weapon: "pulse", threat: 0, ws: {} }),
        i = w.route.indexOf(biome);
      if (i < 0 || i > 3) continue;
      const at = w.biomeEventWave(1 + 5 * i);
      if (!at) continue;
      w.god = !0;
      w.startWave(at);
      return w;
    }
    return null;
  };
  const run = (w, sec) => {
    for (let t = 0; t < sec; t += 1 / 30) w.step(1 / 30, { mx: 0, my: 0 });
  };
  const melt = eventWorld("works");
  if (!melt || melt.event !== "meltdown") bad("meltdown-missing");
  else {
    const V = melt.arena.vents;
    V.length < 6 && bad("meltdown-vents:" + V.length);
    V.some((q) => q.period !== V[0].period || q.phase !== V[0].phase) && bad("meltdown-sync");
    fair(melt.arena, "meltdown");
    run(melt, 2.5);
    V.every((q) => melt.arena.ventState(q, melt.waveT) === "erupt") || bad("meltdown-erupt-together");
  }
  const white = eventWorld("vault");
  if (!white || white.event !== "whiteout") bad("whiteout-missing");
  else {
    const lay = buildLayout(white.arena.biome, white.seed, white.wave, !1);
    white.arena.ice.length > (lay.features?.ice || []).length || bad("whiteout-ice");
    fair(white.arena, "whiteout");
  }
  const bloom = eventWorld("marsh");
  if (!bloom || bloom.event !== "bloom") bad("bloom-missing");
  else {
    const n0 = bloom.arena.acid.filter((q) => q.life == null).length,
      r0 = bloom.arena.acid.reduce((a, q) => a + q.r, 0);
    run(bloom, 20);
    const own = bloom.arena.acid.filter((q) => q.life == null);
    own.length > n0 || bad("bloom-no-sprout");
    own.slice(0, n0).reduce((a, q) => a + q.r, 0) > r0 + 0.5 || bad("bloom-no-growth");
    fair(bloom.arena, "bloom");
    // a pool never sprouts under the player
    own.some((q) => Math.hypot(q.x - bloom.player.x, q.y - bloom.player.y) < q.r) && bad("bloom-on-player");
  }
  const storm = eventWorld("void");
  if (!storm || storm.event !== "riftstorm") bad("riftstorm-missing");
  else {
    const at0 = storm.arena.portals.map((q) => [q.ax, q.ay]);
    run(storm, 5);
    storm.arena.portals.every((q) => q.next) || bad("riftstorm-no-telegraph");
    run(storm, 1.2);
    storm.arena.portals.some((q, k) => q.ax !== at0[k][0] || q.ay !== at0[k][1]) || bad("riftstorm-no-move");
    fair(storm.arena, "riftstorm");
  }
  // 4. signature enemies: every mix enemy of a biome can spawn from the biome's first wave; the
  // enemy table itself is not changed, and Neon Yard keeps the global unlock waves
  const before = JSON.stringify(Object.values(enemyDefs).map((d) => d.from)),
    seen = {};
  for (let seed = 1; seed <= 40; seed++) {
    const w = new World({ seed: 0x25f0 + seed, weapon: "pulse", threat: 0, ws: {} });
    for (let wave = 1; wave <= 19; wave++) {
      if (w.bossFor(wave)) continue;
      w.startWave(wave);
      const id = w.arena.biome.id;
      for (const g of w.plan)
        for (const m of g.members) {
          (seen[id] || (seen[id] = new Set())).add(m.type);
          id === "yard" && enemyDefs[m.type].from > wave && bad(`yard-early:${m.type}:${wave}`);
          w.enemyFrom(m.type, wave) > wave && bad(`too-early:${m.type}:${wave}`);
        }
    }
  }
  JSON.stringify(Object.values(enemyDefs).map((d) => d.from)) !== before && bad("enemy-from-mutated");
  for (const [id, info] of Object.entries(RL_BIOME_INFO))
    for (const [type, m] of Object.entries(info.mix || {})) {
      if (!(m >= 1)) continue;
      rlEnemyFrom(type, id, 6) > 6 && bad(`from:${id}:${type}`);
      seen[id] && !seen[id].has(type) && bad(`never-seen:${id}:${type}`);
    }
  // 5. an old saved run (2.4.6 snapshot, no event fields) in an event wave loads and plays it
  const probe = eventWorld("void");
  if (probe) {
    const old = cleanRun({
      v: 1,
      seed: probe.seed,
      weapon: "pulse",
      threat: 0,
      wave: probe.wave,
      endless: !1,
      up: { dmg: 2 },
      hp: 80,
      shards: 30,
      kills: 50,
      time: 300,
      rerolls: 1,
      revived: !1,
      nova: 20,
      bossKills: ["warden"],
    });
    const w = old && new World({ snap: old, ws: {} });
    if (!w || w.event !== "riftstorm" || !w.bioEv) bad("old-save-event");
    else {
      run(w, 7);
      w.state === "fight" || w.state === "choose" || bad("old-save-state:" + w.state);
      const snap = w.snapshot(),
        w2 = new World({ snap, ws: {} });
      w2.event !== "riftstorm" && bad("resave-event");
    }
  }
  return { ...r, ok: r.ok && fail.length === 0, v250C: { ok: fail.length === 0, fail } };
};

export {
  RL_EVENT_KINDS,
  RL_HEALTH,
  RL_LAST_RUN_AUDIT,
  RL_MON,
  RL_RT,
  errorLog,
  setLogContext,
  clearErrorLog,
  rlBiomeDistinct,
  rlMonBeginWave,
  rlMonCrashed,
  rlMonFinish,
  rlMonFrame,
  rlMonIssue,
  rlMonPreEnd,
  rlMonStart,
  rlMonStep,
  rlPaletteIssues,
  rlRunAudit,
  rlRunHealth,
  rlSelfTest,
  rlUiButtonGuardSelfTest,
  onLogChange,
  set_RL_LAST_RUN_AUDIT,
  getErrorLog,
  buildReport,
  logError,
};
