// Error log, runtime counters, health checks, the deep self-test, the live run monitor and the
// post-run audit (Settings → Diagnostics).

import { GameUI, RL_TOUCH_CLICK_GUARD } from "../ui/ui.js";
import { musicChords, RL_SFX_VOICES, rlShotSfx, musicVoices, SoundEngine } from "../audio/sound.js";
import {
  RL_RETIRE_NOTE,
  SAVE_KEY,
  rlMigrateRetired,
  set_RL_RETIRE_NOTE,
  cleanRun,
  RL_MODULE_NOTE,
  rlMigrateModules,
  set_RL_MODULE_NOTE,
} from "./save.js";
import { RL_MESH_TYPES } from "../render/models.js";
import { enemyDefs, bossOrder, RL_ENEMY_TIPS, biomeVariants, bossDefs, bossByWave, bossByBiome } from "../data/enemies.js";
import { ui, store, game, safeAreaInsets, input, renderer } from "../main.js";
import { BUILD_ID, hashString, GAME_VERSION, makeRng, formatTime } from "./util.js";
import { updateEnemy, findOpenSpot } from "./ai.js";
import { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, biomeList } from "../data/biomes.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { waveEvents, planWave, set_RL_BIOME_MIX_CUR } from "./waves.js";
import { World } from "./world.js";
import { threatMods, workshopModules, modulesById, RL_RETIRED_MODULES } from "../data/progression.js";
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
  let saved = globalThis.localStorage && localStorage.getItem(LOG_KEY);
  if (saved) {
    let entries = JSON.parse(saved);
    Array.isArray(entries) &&
      entries.slice(-30).forEach((entry) => {
        entry && entry.v === RL_LOG_VERSION && errorLog.push(entry);
      });
  }
} catch {}
try {
  if (globalThis.localStorage)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      let key = localStorage.key(i);
      key && (key.startsWith("riftline.log.v2.") || key === "riftline.log.v3") && localStorage.removeItem(key);
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
    existing = errorLog.find((item) => item.msg === msg && item.where === where && item.file === file && item.line === line && item.col === col);
  if (existing) (existing.n++, (existing.last = now));
  else {
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
    typeof console < "u" && console.error("[riftline]", where, error);
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
  return (logListeners.add(listener), () => logListeners.delete(listener));
}
function clearErrorLog() {
  ((errorLog.length = 0), saveErrorLog());
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
  errorLog.length || lines.push("", "Errors: none recorded.");
  for (let item of errorLog) {
    let location = item.file ? ` @ ${item.file}:${item.line || 0}:${item.col || 0}` : "";
    (lines.push(`[${item.where}] ${item.msg}  (x${item.n}, v${item.v}${location}, first ${item.first}, last ${item.last})`),
      item.stack &&
        lines.push(
          item.stack
            .split(
              `
`,
            )
            .map((line) => "    " + line.trim()).join(`
`),
        ));
  }
  return lines.join(`
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
function rlHealthAdd(id, status, detail) {
  RL_HEALTH.push({ id: id, status: status, detail: String(detail || "") });
}
var RL_SELFTEST = null;
function selfTestBase() {
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
  const finite = (value) => Number.isFinite(value);
  try {
    const seeds = [0x13579bdf, 0x2468ace0, 0x10203040, 0x55667788, 0xa5a5a5a5];
    for (const seed of seeds) {
      const world = new World({ seed, weapon: "pulse", threat: 0, ws: {} }),
        twin = new World({ seed, weapon: "pulse", threat: 0, ws: {} });
      for (let wave = 1; wave <= 20; wave++) {
        world.startWave(wave);
        twin.startWave(wave);
        worlds++;
        waves++;
        if (world.arena.key !== twin.arena.key || world.arena.W !== twin.arena.W || world.arena.H !== twin.arena.H)
          bad("determinism", `seed ${seed} wave ${wave} arena mismatch`);
        else det++;
        const currentBiome = world.biomeFor(wave)?.id,
          previousBiome = wave > 1 ? world.biomeFor(wave - 1)?.id : null;
        // 2.4.0: one biome per boss cycle — it changes right after each boss wave (5, 10, 15 …)
        if (wave > 1 && (currentBiome === previousBiome) !== ((wave - 1) % 5 !== 0))
          bad("biome-route", `biome must change exactly after boss waves (seed ${seed}, wave ${wave - 1}/${wave})`);
        if (world.event && (!waveEvents[world.event] || world.event === "dark"))
          bad("events", `invalid/removed event ${world.event} at seed ${seed} wave ${wave}`);
        if (world.boss && world.event) bad("events", `boss wave received event ${world.event} at seed ${seed} wave ${wave}`);
        if (!Array.isArray(world.arena.obs)) bad("arena", `missing obstacle array at seed ${seed} wave ${wave}`);
        if (
          wave >= 2 &&
          !world.boss &&
          (!world.arena.director || !Number.isFinite(world.arena.director.obstacles) || world.arena.director.obstacles < 0)
        )
          bad("director", `missing dynamic wave director at seed ${seed} wave ${wave}`);
        const featureSets = { vents: world.arena.vents || [], ice: world.arena.ice || [], acid: world.arena.acid || [] };
        for (const [featureType, items] of Object.entries(featureSets))
          for (const feature of items) {
            if (![feature.x, feature.y, feature.r].every(finite)) bad("features", `non-finite ${featureType} seed ${seed} wave ${wave}`);
            if (hitsObstacle(world.arena.obs, feature.x, feature.y, (feature.r || 0) + 0.8))
              bad("features", `${featureType} overlaps obstacle at seed ${seed} wave ${wave}`);
          }
        const portals = world.arena.portals || [],
          portalPts = [];
        for (let i = 0; i < portals.length; i++) {
          const portal = portals[i],
            pair = [
              { x: portal.ax, y: portal.ay },
              { x: portal.bx, y: portal.by },
            ];
          if (![portal.ax, portal.ay, portal.bx, portal.by].every(finite))
            bad("portal", `non-finite portal pair at seed ${seed} wave ${wave}`);
          const pairDist = Math.hypot(portal.ax - portal.bx, portal.ay - portal.by);
          if (finite(pairDist) && pairDist < 7.0)
            bad("portal", `portal pair too close (${pairDist.toFixed(2)}) at seed ${seed} wave ${wave}`);
          for (const end of pair) {
            if (![end.x, end.y].every(finite) || hitsObstacle(world.arena.obs, end.x, end.y, 1.5))
              bad("portal", `invalid portal endpoint at seed ${seed} wave ${wave}`);
            if (Math.abs(end.x) > world.arena.W - 3.6 || Math.abs(end.y) > world.arena.H - 3.6)
              bad("portal", `portal endpoint out of safe bounds at seed ${seed} wave ${wave}`);
            for (const prev of portalPts) {
              const dist = Math.hypot(end.x - prev.x, end.y - prev.y);
              if (dist < 4.0)
                bad("portal", `portal endpoints overlap/cluster (${dist.toFixed(2)}) at seed ${seed} wave ${wave}`);
            }
            portalPts.push(end);
          }
        }
        const spawnProbeRng = makeRng(hashString(seed + ":spawn-probe:" + wave));
        for (const [clearance, dist] of [
          [7, 1],
          [9, 1.6],
          [3, 0.4],
        ]) {
          const point = world.arena.freePoint(spawnProbeRng, world.player.x, world.player.y, clearance, dist);
          if (
            !point ||
            !finite(point.x) ||
            !finite(point.y) ||
            world.arena.blocked(point.x, point.y, dist + 0.4) ||
            world.arena.featureBlocked(point.x, point.y, dist * 0.3)
          )
            bad("spawn-safe", `freePoint failed at seed ${seed} wave ${wave}`);
        }
        const helperRng = makeRng(hashString(seed + ":safe-point-probe:" + wave));
        for (const [minD, maxD] of [
          [2, 6],
          [4, 10],
          [1.5, 5],
        ]) {
          const point = findOpenSpot({ rng: helperRng, arena: world.arena }, world.player.x, world.player.y, minD, maxD);
          if (
            point &&
            (!finite(point.x) ||
              !finite(point.y) ||
              world.arena.outside(point.x, point.y, 2) ||
              world.arena.blocked(point.x, point.y, 2) ||
              world.arena.featureBlocked(point.x, point.y, 0.6))
          )
            bad("safe-point", `unsafe helper point seed ${seed} wave ${wave}`);
          else if (point) safePointCases++;
        }
      }
    }
    for (const biome of biomeList)
      for (const seed of seeds) {
        const world = new World({ seed, weapon: "pulse", threat: 0, ws: {} });
        if (!world.route?.includes(biome.id)) bad("biome-route", `seed ${seed} route is missing biome ${biome.id}`);
      }
    for (const id of Object.keys(weaponDefs)) {
      const world = new World({ seed: 0x7f4a7c15, weapon: id, threat: 0, ws: {} });
      for (let frame = 0; frame < 12; frame++) {
        world.step(1 / 60, {
          mx: 1,
          my: 0.15,
          aim: true,
          ax: 1,
          ay: 0.15,
          fire: true,
          assist: false,
          dash: frame === 1,
          nova: frame === 5,
        });
        frames++;
        if (![world.player.x, world.player.y, world.player.vx, world.player.vy, world.player.hp].every(finite))
          bad("weapon-runtime", `${id} produced non-finite player state`);
        for (const shot of world.pb || [])
          if (![shot.x, shot.y, shot.vx, shot.vy, shot.life].every(finite))
            bad("weapon-runtime", `${id} produced non-finite projectile state`);
      }
      weapons++;
    }
    for (const id of bossOrder) {
      const world = new World({ seed: 0x31415926, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(bossByWave[5] === id ? 5 : bossByWave[10] === id ? 10 : bossByWave[15] === id ? 15 : 20);
      const boss = world.spawnBoss(id);
      bosses++;
      if (!boss || !finite(boss.hp) || !finite(boss.x) || !finite(boss.y)) bad("boss-runtime", `${id} failed spawn`);
      for (let frame = 0; frame < 4; frame++) {
        world.step(1 / 60, { mx: 0, my: 0, aim: true, ax: 1, ay: 0, fire: true, assist: false });
        frames++;
        if (!world.boss || !finite(world.boss.hp)) bad("boss-runtime", `${id} failed during step`);
      }
    }
    for (const id of Object.keys(enemyDefs)) {
      const def = enemyDefs[id],
        world = new World({
          seed: hashString("enemy-probe:" + id),
          weapon: "pulse",
          threat: Math.min(5, Math.floor((def.from || 1) / 5)),
          ws: {},
        });
      world.startWave(Math.max(1, Math.min(50, def.from || 1)));
      const point = world.arena.freePoint(makeRng(hashString("enemy-spawn:" + id)), world.player.x, world.player.y, 6, 0.45);
      if (!point || !finite(point.x) || !finite(point.y)) bad("enemy-spawn", `${id} has no safe spawn point`);
      else {
        const enemy = world.spawnEnemy(id, point.x, point.y);
        if (!enemy || enemy.type !== id) bad("enemy-spawn", `${id} failed direct spawn`);
        else {
          enemy.t = 0;
          for (let frame = 0; frame < 60; frame++) {
            world.step(1 / 60, { mx: 0.15, my: 0.05, aim: true, ax: 1, ay: 0.05, fire: true, assist: false });
            frames++;
            if (![enemy.x, enemy.y, enemy.vx, enemy.vy, enemy.hp, enemy.t, enemy.t2].every(finite))
              bad("enemy-runtime", `${id} produced non-finite state at frame ${frame}`);
          }
          enemyTypes++;
        }
      }
    }
    for (const biome of biomeList) {
      for (const seed of [0x10101, 0x20202, 0x30303]) {
        const world = new World({ seed, weapon: "pulse", threat: 2, ws: {} }),
          idx = world.route.indexOf(biome.id),
          firstWave = 1 + 5 * idx; // 2.4.0: first wave of that biome's boss cycle
        world.startWave(firstWave);
        if (world.arena.biome?.id !== biome.id)
          bad("biome-runtime", `route for seed ${seed} did not resolve ${biome.id} at wave ${firstWave}`);
        const point = world.arena.freePoint(makeRng(hashString(seed + ":" + biome.id)), world.player.x, world.player.y, 4, 0.45);
        if (!point || world.arena.blocked(point.x, point.y, 0.85)) bad("biome-runtime", `unsafe spawn space in ${biome.id} seed ${seed}`);
        biomeCases++;
      }
    }
    for (let threat = 0; threat <= 5; threat++)
      for (const seed of [0x4141, 0x5151]) {
        const world = new World({ seed, weapon: "pulse", threat, ws: {} });
        for (let wave = 1; wave <= 12; wave++) {
          world.startWave(wave);
          for (let frame = 0; frame < 8; frame++) {
            world.step(1 / 60, {
              mx: frame % 2 ? 0.4 : 0,
              my: frame % 3 ? 0.2 : 0,
              aim: true,
              ax: 1,
              ay: 0,
              fire: true,
              assist: false,
              dash: frame === 3,
              nova: frame === 6,
            });
            frames++;
            if (![world.player.x, world.player.y, world.player.hp, world.time, world.kills, world.shards].every(finite))
              bad("threat-runtime", `Threat ${threat} wave ${wave} became non-finite`);
          }
        }
        threatCases++;
      }
    {
      const base = computeStats("pulse", {}, {}),
        boost = computeStats("pulse", { rate: 3, velocity: 2 }, {}); // 2.5.0: was Overclock Matrix
      if (!(boost.rateMul > base.rateMul && boost.velMul > base.velMul))
        bad("upgrade-runtime", "Rapid Cycler and Long Barrel do not alter rate and velocity");
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
          .filter(([key]) => key !== "weapon")
          .every(([, value]) => typeof value !== "number" || Number.isFinite(value));
        if (!finiteNumbers) bad("upgrade-runtime", `${def.id} produced non-finite stat`);
        else upgradeChecks++;
      }
      const world = new World({ seed: 0x1ce55eed, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(13);
      world.stats = computeStats("pulse", { bounty: 2, capacitor: 2 }, {});
      const point = world.arena.freePoint(makeRng(hashString("upgrade-kill-probe")), world.player.x, world.player.y, 6, 0.45),
        enemy = point && world.spawnEnemy("turret", point.x, point.y, { elite: !0 });
      if (!enemy) bad("upgrade-runtime", "could not spawn elite turret probe");
      else {
        const shardBefore = world.pickups.filter((pickup) => pickup.kind === "shard").reduce((sum, pickup) => sum + (pickup.v || 0), 0),
          novaBefore = world.player.nova;
        world.killEnemy(enemy);
        const shardAfter = world.pickups.filter((pickup) => pickup.kind === "shard").reduce((sum, pickup) => sum + (pickup.v || 0), 0),
          novaAfter = world.player.nova;
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
        caches += director.pickups.filter((pickup) => pickup.cache).length;
        for (const obstacle of director.arena.obs)
          if (![obstacle.x, obstacle.y].every(finite)) bad("director-runtime", `non-finite dynamic obstacle at wave ${wave}`);
        for (const kind of ["vents", "ice", "acid", "portals"])
          for (const feature of director.arena[kind] || [])
            for (const value of Object.values(feature))
              if (typeof value === "number" && !finite(value)) bad("director-runtime", `non-finite ${kind} value at wave ${wave}`);
      }
      if (dynamic < 8) bad("director-runtime", `too few dynamic obstacle cases (${dynamic})`);
      else det++;
      if (caches < 12) bad("director-runtime", `too few wave caches (${caches})`);
      else det++;
    }
    {
      const world = new World({ seed: 0xdecafbad, weapon: "pulse", threat: 3, ws: {} });
      world.startWave(7);
      for (let frame = 0; frame < 20; frame++) {
        world.step(1 / 60, { mx: 0.3, my: 0.1, aim: true, ax: 1, ay: 0, fire: true, assist: false, dash: frame === 4 });
        frames++;
      }
      const snap = world.snapshot(),
        restored = new World({ snap, ws: {} });
      if (
        restored.wave !== world.wave ||
        restored.seed !== world.seed ||
        restored.weapon !== world.weapon ||
        restored.hp !== world.hp ||
        JSON.stringify(restored.up) !== JSON.stringify(world.up)
      )
        bad("snapshot", "extended snapshot roundtrip mismatch");
      else snapshotCases++;
    }
    const offerWorld = new World({ seed: 0xabcdef01, weapon: "pulse", threat: 0, ws: {} }),
      offer = offerWorld.makeOffer();
    if (!Array.isArray(offer) || offer.length < 1 || offer.some((id) => !upgradesById[id]))
      bad("upgrade-offer", "invalid generated offer");
    else det++;
  } catch (err) {
    bad("selftest-exception", (err && err.message) || String(err));
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
/* The deep self-test: the base test, then one part per release. Each part takes the result so far
 and returns it with its own key added and `ok` combined. Until 2.5.0 the parts wrapped
 rlSelfTest one after another; they run in the order of that wrapper chain (innermost first). */
function rlSelfTest() {
  let result = selfTestBase();
  result = selfTestExpansion23(result); // 2.2.3
  result = selfTestExpansion22(result); // 2.2
  result = selfTestExpansion21(result); // 2.1
  result = selfTestV240(result);
  result = selfTestV246(result);
  result = selfTestV250A(result);
  result = selfTestV250C(result);
  result = selfTestV250D(result);
  result = selfTestV250B(result);
  return result;
}
var RL_LAST_RUN_AUDIT = null;
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
          for (const k of ["x", "y"]) {
            if (k in item && !finite(item[k])) {
              add(id, `non-finite ${k}`);
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
      for (const k of ["x", "y", "vx", "vy", "hp", "life", "t"]) {
        if (k in obj && !finite(obj[k])) {
          add(id, `non-finite ${k}`);
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
    if (!player || ![player.x, player.y, player.vx, player.vy, player.hp].every(finite)) add("player", "non-finite final player state");
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
  const finite = Number.isFinite,
    need = RL_EVENT_FIELDS[ev.k];
  if (need)
    for (const field of need)
      if (field === "pts" ? !Array.isArray(ev.pts) || !ev.pts.every(finite) : !finite(ev[field])) return `"${ev.k}" is missing ${field}`;
  if (ev.k === "mend" && !(finite(ev.x) && finite(ev.y) && ((finite(ev.tx) && finite(ev.ty)) || finite(ev.r))))
    return `"mend" needs a target (tx/ty) or a radius`;
  if ("x" in ev && !(finite(ev.x) && finite(ev.y))) return `"${ev.k}" has a non-finite position`;
  return "";
}
var RL_MON = null;
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
      payloadError && rlMonIssue("FAIL", "events", payloadError);
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
  if (![world.shards, world.kills, world.time].every(finite)) rlMonIssue("FAIL", "invariants", "run totals became non-finite");
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
        dt > 50 && mon.slow++;
        dt > mon.worst && (mon.worst = dt);
        mon.workSum += workMs;
      }
    }
    mon.lastT = now;
  }
  // What is drawn must be the wave's own biome and layout (no mixed palettes / stale walls).
  if (mon && renderer && game.world === mon.w && game.mode === "game" && renderer.biome && (mon.frames & 15) === 0) {
    const arena = mon.w.arena;
    renderer.biome.id !== arena.biome.id &&
      rlMonIssue("FAIL", "render", `renderer shows biome ${renderer.biome.id} during a ${arena.biome.id} wave`);
    renderer.arena.layKey !== arena.key &&
      rlMonIssue("FAIL", "render", `renderer walls (${renderer.arena.layKey}) differ from the wave layout (${arena.key})`);
    renderer.arena.biomeId !== arena.biome.id &&
      rlMonIssue("FAIL", "render", `floor palette from ${renderer.arena.biomeId} during a ${arena.biome.id} wave`);
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
      mon.hudOff || (mon.hudOff = now);
      now - mon.hudOff > 1500 &&
        rlMonIssue("FAIL", "hud", `HUD hidden during wave ${mon.w.wave}${mon.w.endless ? " (endless)" : ""}`);
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
        snap
          ? (mon.snaps.ok++, (mon.lastSnap = snap))
          : rlMonIssue("FAIL", "save", `wave ${wave} snapshot is rejected by the loader`);
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
    group("events", `${mon.events} events · ${Object.keys(mon.kinds).length} kinds · all consumed`, ["events", "weapons"]);
    group("economy", "shards and kills only increased", ["economy"]);
    group("hud", "HUD visible whenever a wave was being played");
    if (mon.lastSnap)
      try {
        const snap = mon.lastSnap,
          restored = new World({ snap: snap, ws: store.data.workshop });
        (restored.wave !== snap.wave || restored.weapon !== snap.weapon || JSON.stringify(restored.up) !== JSON.stringify(snap.up)) &&
          rlMonIssue("FAIL", "save", `wave ${snap.wave} snapshot restores a different run`);
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
      expect = Math.round((runShards + bonus) * threatMods(pre.threat).shards * (1 + 0.1 * pre.salvage)),
      got = data.shards - pre.bank;
    addCheck(
      got === expect ? "OK" : "FAIL",
      "payout",
      got === expect ? `+${expect} shards credited` : `bank changed by ${got}, expected +${expect}`,
    );
    const stats = data.stats,
      rec = [];
    stats.kills - pre.kills !== pre.runKills && rec.push(`kills +${stats.kills - pre.kills} (run had ${pre.runKills})`);
    stats.bestWave < (win ? 20 : pre.wave) && rec.push(`best wave ${stats.bestWave} < reached ${win ? 20 : pre.wave}`);
    win && !pre.endless && stats.clears !== pre.clears + 1 && rec.push("clear not counted");
    !win && !abandoned && stats.deaths !== pre.deaths + 1 && rec.push("death not counted");
    addCheck(
      rec.length ? "FAIL" : "OK",
      "records",
      rec.length ? rec.join(" | ") : `kills +${pre.runKills} · best wave ${stats.bestWave}`,
    );
    const per = [];
    data.run !== null && per.push("finished run is still stored as resumable");
    try {
      const parsed = store.parse(JSON.stringify(data));
      parsed.ok || per.push("save does not round-trip");
    } catch (err) {
      per.push("save round-trip threw: " + err.message);
    }
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    } catch {}
    if (!store.storageOk) addCheck("WARN", "persistence", "storage is blocked — progress only lives in memory");
    else {
      (stored && stored.savedAt === data.savedAt && stored.shards === data.shards) ||
        per.push("localStorage does not match the in-memory save");
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
          over.hidden && probs.push("run summary not shown");
          hud.hidden || probs.push("HUD still visible");
          layout && !layout.ok && probs.push(...layout.findings.slice(0, 3));
          const status = probs.length ? "FAIL" : "OK";
          audit.checks.push({
            st: status,
            id: "end-screen",
            msg: probs.length ? probs.join(" | ") : `${layout ? layout.checked : 0} controls reachable`,
          });
          if (probs.length) {
            audit.ok = !1;
            audit.fail.push("end-screen: " + probs.join(" | "));
          }
        } catch (err) {
          audit.checks.push({ st: "WARN", id: "end-screen", msg: err.message });
        }
        audit.fail.length &&
          ui.toast(
            `Diagnostics: ${audit.fail.length} problem${audit.fail.length === 1 ? "" : "s"} in this run — Settings › Diagnostics`,
            "warn",
            6000,
          );
        rlRunHealth({ context: "post-run" }).catch((err) => logError("health", err));
      }),
    );
  } else rlRunHealth({ context: "post-run" }).catch((err) => logError("health", err));
  return audit;
}
function rlMonCrashed() {
  try {
    const world = RL_MON && RL_MON.w;
    world && rlMonFinish(world, rlMonPreEnd(world), !1, !1, !0, !0);
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
  for (const check of audit.checks) out.push(`  [${check.st}]${" ".repeat(Math.max(1, 5 - check.st.length))}${check.id}: ${check.msg}`);
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
    key && (button.dataset.buy = key);
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
var RL_HEALTH_BUSY = null;
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
      // 2.5.0: Overclock Matrix, Overbore Caliber, Vector Stabilizer and Salvage Pulse were retired
      reqU = ["bounty", "capacitor", "hunter", "supply", "momentum", "laststand", "vector", "skates", "heatsink"],
      badE = Object.keys(enemyDefs).filter((id) => !enemyDefs[id] || (!(enemyDefs[id].from >= 1) && id !== "mite")),
      badEvo = upgradeList.filter((upgrade) => upgrade.evo && Object.keys(upgrade.evo).some((key) => !upgradesById[key])).map((upgrade) => upgrade.id),
      badWpn = upgradeList.filter((upgrade) => upgrade.weapon && !weaponDefs[upgrade.weapon]).map((upgrade) => upgrade.id),
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
      const result = rlSelfTest(),
        expansionFails = [...(result.expansion21?.fail || []), ...(result.expansion22?.fail || []), ...(result.expansion23?.fail || [])],
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
        cleaned.up.dmg === 8 &&
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
    let key = "__rift_health_" + GAME_VERSION,
      old = localStorage.getItem(key);
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    ok("storage", true, "write/remove test passed");
    old !== null && localStorage.setItem(key, old);
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
      chakra && barlow
        ? ok("fonts", true, "declared game fonts available")
        : warn("fonts", `font check: Chakra ${chakra ? "OK" : "WARN"}, Barlow ${barlow ? "OK" : "WARN"}`);
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
var RL_SELFTEST_LAST = null;
function rlHealthSummary() {
  let oks = RL_HEALTH.filter((check) => check.status === "OK").length,
    warns = RL_HEALTH.filter((check) => check.status === "WARN").length,
    fails = RL_HEALTH.filter((check) => check.status === "FAIL").length;
  return `Health: ${oks} OK · ${warns} WARN · ${fails} FAIL`;
}

/* ---- 2.2.3 deep self-test additions: each case reproduces a bug class that
 slipped through 2.2.2 (plan members, event names, save loader, texts, arena features).
 Every section runs in its own try so one failure cannot hide the others. ---- */
function selfTestExpansion23(r) {
  const t0 = performance.now(),
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
}
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
function selfTestExpansion22(r) {
  const fail = [];
  const weapons = Object.keys(weaponDefs),
    enemies = Object.keys(enemyDefs),
    biomes = Object.keys(biomesById),
    upgrades = Object.keys(upgradesById),
    modules = Object.keys(modulesById);
  if (!["drone", "driller", "beacon", "weaver"].every((k) => enemies.includes(k))) fail.push("missing-v22-enemy");
  // 2.5.0: of the 2.2 upgrades only Salvager Core is left; the others were copies (retired)
  if (!upgrades.includes("salvager")) fail.push("missing-v22-upgrade");
  // 2.5.0 B: Route Scanner and Reactor Core were merged into Field Supply and Nova Cell
  if (!["fieldSupply", "nova"].every((k) => modules.includes(k))) fail.push("missing-v22-workshop");
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
}
function selfTestExpansion21(r) {
  const fail = [];
  const weapons = Object.keys(weaponDefs),
    enemies = Object.keys(enemyDefs),
    biomes = Object.keys(biomesById),
    upgrades = Object.keys(upgradesById);
  if (!["sapper", "phantom", "sentinel", "carrier"].every((k) => enemies.includes(k))) fail.push("missing-v21-enemy");
  if (
    // 2.5.0: Dead Focus, Fortify, Nanite Leech and Scavenger Net were retired
    !["overload", "resonance", "hazmat", "echo"].every((k) => upgrades.includes(k))
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
}
function selfTestV240(r) {
  const fail = [];
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
}
// 2.4.6: one boss per biome, Void Core always waves 16–20 with the Rift Core as the final boss.
function selfTestV246(r) {
  const fail = [];
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
}
// 2.5.0 A: retired upgrades are gone and migrate, the six new upgrades do what their card says.
import { RL_RETIRED_UPGRADES } from "../data/upgrades.js";
import { rlMigrateUpgrades, rlSanitizeHistory } from "./save.js";
function selfTestV250A(r) {
  const fail = [],
    NEW = ["skates", "acidcoat", "heatsink", "slipstream", "surge", "reactive"];
  if (upgradeList.length !== 59) fail.push("count:" + upgradeList.length);
  for (const [id, q] of Object.entries(RL_RETIRED_UPGRADES)) {
    if (upgradesById[id]) fail.push("still-offered:" + id);
    const to = upgradesById[q.to];
    if (!to || to.evo || to.repeat || !(q.k > 0 && q.k <= 1.5)) fail.push("retired-target:" + id);
  }
  for (const id of NEW) if (!upgradesById[id] || upgradesById[id].evo) fail.push("new-missing:" + id);
  // a run saved mid-way with retired upgrades and a pending offer of retired ids
  const old = {
      v: 1,
      seed: 2500,
      weapon: "pulse",
      threat: 1,
      wave: 7,
      up: { caliber: 3, kinetic: 2, dmg: 2, fortify: 5, hp: 6, coolant: 3, afterburner: 3, scavenger: 2, focus: 1 },
      hp: 60,
      offer: ["fortify", "flux", "crit"],
      offerBoss: false,
    },
    run = cleanRun(old),
    want = { dmg: 6, hp: 10, vector: 6, supply: 2, crit: 1 };
  if (!run || Object.keys(run.up).length !== 5 || Object.entries(want).some(([k, v]) => run.up[k] !== v))
    fail.push("migrate-up:" + JSON.stringify(run && run.up));
  // Fortify → Reinforced Hull is maxed, so a common takes its place; Flux Capacitor → Overcharge
  if (!run || JSON.stringify(run.offer) !== JSON.stringify(["dmg", "overcharge", "crit"]))
    fail.push("migrate-offer:" + JSON.stringify(run && run.offer));
  if (old.up.caliber !== 3 || old.offer[0] !== "fortify") fail.push("migrate-mutates");
  if (run && rlMigrateUpgrades(run) !== run) fail.push("migrate-twice");
  const boss = cleanRun({ ...old, up: { rate: 10 }, offer: ["overclock", "leech", "arc"], offerBoss: true });
  if (!boss || boss.offer.length !== 3 || boss.offer.some((id) => upgradesById[id].rarity < 2))
    fail.push("migrate-boss-offer:" + JSON.stringify(boss && boss.offer));
  if (run) {
    const w = new World({ snap: run, ws: {} });
    if (w.state !== "choose" || w.offer.length !== 3 || w.stats.maxHp !== 300) fail.push("resume:" + w.state);
    w.choose(w.offer[0]);
    for (let f = 0; f < 120; f++) w.step(1 / 60, { mx: 0.4, my: 0.2, fire: true, auto: true, dash: f === 30 });
    if (w.wave !== 8 || ![w.player.hp, w.player.x, w.player.nova].every(Number.isFinite)) fail.push("resume-play");
  }
  const hist = rlSanitizeHistory([
    { t: 1, weapon: "pulse", threat: 0, wave: 9, outcome: "dead", build: ["caliber", "dmg", "fortify", "flux"] },
  ]);
  if (JSON.stringify(hist[0]?.build) !== JSON.stringify(["dmg", "hp", "overcharge"])) fail.push("history-build");
  // the new mechanics
  const mk = (up, wave = 2) => {
    const w = new World({ seed: 0x250a, weapon: "pulse", threat: 0, ws: {} });
    w.up = { ...up };
    w.stats = computeStats("pulse", w.up, {});
    w.startWave(wave);
    w.plan = [];
    w.enemies = [];
    w.player.iT = 0;
    w.player.shield = false;
    return w;
  };
  const foe = (w, x, y) => {
    const e = w.spawnEnemy("brute", x, y, {});
    e.spawnT = 0;
    w.enemies.includes(e) || w.enemies.push(e);
    w.hash.build(w.enemies);
    return e;
  };
  // Cryo Skates: dash recharges 35%/level faster on ice
  {
    const w = mk({ skates: 2 }),
      p = w.player;
    p.dashCdT = 1;
    p.onIce = true;
    w.step(0.1, {});
    if (!(Math.abs(p.dashCdT - (1 - 0.1 - 0.07)) < 1e-6)) fail.push("skates-dash:" + p.dashCdT.toFixed(3));
    if (!(computeStats("pulse", { skates: 1 }, {}).speed > computeStats("pulse", {}, {}).speed))
      fail.push("skates-speed");
  }
  // Acid Coating: hits leave acid that marks enemies but never hurts the player
  {
    const w = mk({ acidcoat: 2 }),
      p = w.player,
      e = foe(w, 4, 2);
    e.hp = e.maxHp = 1e6;
    for (let k = 0; k < 60 && !w.arena.acid.some((q) => q.mine); k++) {
      w.time += 2;
      w.bulletHit({ x: e.x, y: e.y, vx: 1, vy: 0, dmg: 1, hits: [], w: "pulse", pierce: 0, bounce: 0, life: 1 }, e);
    }
    const q = w.arena.acid.find((a) => a.mine);
    if (!q) fail.push("acid-none");
    else {
      p.x = q.x;
      p.y = q.y;
      e.x = q.x + 0.3;
      e.y = q.y;
      const hp = p.hp;
      for (let f = 0; f < 60; f++) w.updateFeatures(1 / 60);
      if (p.hp !== hp || p.inAcid) fail.push("acid-hurts-player");
      if (!e.corrode) fail.push("acid-no-corrode");
      for (let f = 0; f < 300; f++) w.updateFeatures(1 / 60);
      if (w.arena.acid.some((a) => a.mine) || e.corrode) fail.push("acid-stays");
    }
  }
  // Heat Sink: hazard damage heats up (fire rate) and charges Nova
  {
    const w = mk({ heatsink: 1 }),
      p = w.player;
    p.nova = 0;
    w.hurtPlayer(4, null, null, "lava", true);
    if (!(p.heatT === 3 && p.nova > 0)) fail.push("heat-hazard");
    const cold = mk({}),
      shots = (x) => {
        x.player.fireT = 0;
        let n = 0;
        for (let f = 0; f < 60; f++) {
          const before = x.player.shotN || 0;
          x.player.heatT = x === cold ? 0 : 3;
          x.step(1 / 60, { aim: true, ax: 1, ay: 0 });
          n += (x.player.shotN || 0) - before;
        }
        return n;
      };
    if (!(shots(w) > shots(cold))) fail.push("heat-rate");
  }
  // Slipstream: shots right after a dash hit harder
  {
    const w = mk({ slipstream: 2 }),
      p = w.player;
    w.step(1 / 60, { dash: true });
    if (!(p.slipT > 1)) fail.push("slip-timer");
    w.pb.length = 0;
    w.fire(0);
    const hot = w.pb[0]?.dmg;
    p.slipT = 0;
    w.pb.length = 0;
    w.fire(0);
    const cold = w.pb[0]?.dmg;
    if (!(Math.abs(hot / cold - 1.5) < 1e-6)) fail.push("slip-dmg:" + hot + "/" + cold);
  }
  // Combo Surge: the 15th combo kill releases a shockwave
  {
    const w = mk({ surge: 1 }),
      e = foe(w, 2, 2);
    e.hp = e.maxHp = 1e6;
    w.combo = 14;
    w.fx.length = 0;
    w.addCombo();
    if (!w.fx.some((q) => q.k === "boom" && q.kind === "surge") || !(e.hp < 1e6)) fail.push("surge");
    if (!(w.comboT > 2.2)) fail.push("surge-combo-time");
  }
  // Reactive Plating: a hit pushes enemies away and clears enemy shots; costs fire rate
  {
    const w = mk({ reactive: 1 }),
      p = w.player,
      e = foe(w, p.x + 1.5, p.y);
    e.hp = e.maxHp = 1e6;
    w.eb.push({ x: p.x + 1, y: p.y, vx: 0, vy: 0, r: 0.2, dmg: 5, life: 2 });
    w.hurtPlayer(5, e.x, e.y, "brute");
    if (!(e.hp < 1e6) || w.eb[0].life > 0) fail.push("reactive");
    if (!(w.stats.rateMul < computeStats("pulse", {}, {}).rateMul)) fail.push("reactive-cost");
  }
  return { ...r, ok: r.ok && fail.length === 0, v250A: { ok: fail.length === 0, fail } };
}
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
function selfTestV250C(r) {
  const fail = [],
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
}

// 2.5.0 D: biome title card, boss intro card and Codex data. Every biome card names its hazard and
// its boss; the Codex has one entry per enemy, boss and upgrade, hides unseen ones, reads old saves
// without Codex keys (defeated bosses, builds in the history and the saved run count as seen) and
// never throws on broken save data.
import { rlCodexEntries, rlBiomeCardInfo } from "../ui/ui.js";
function selfTestV250D(r) {
  const fail = [];
  try {
    for (const b of biomeList) {
      const c = rlBiomeCardInfo(b);
      if (c.name !== b.name) fail.push("card-name:" + b.id);
      if (!c.hazard) fail.push("card-hazard:" + b.id);
      if (!c.boss || c.boss !== (bossDefs[bossByBiome[b.id]] || {}).name) fail.push("card-boss:" + b.id);
      if (!/^#[0-9a-f]{6}$/.test(c.color)) fail.push("card-color:" + b.id);
    }
    const count = (c) => [c.enemies.length, c.bosses.length, c.upgrades.length].join("/"),
      want = [Object.keys(enemyDefs).length, Object.keys(bossDefs).length, upgradeList.length].join("/"),
      flat = (c) => [...c.enemies, ...c.bosses, ...c.upgrades];
    const none = rlCodexEntries({ seen: {} });
    if (count(none) !== want) fail.push(`codex-count:${count(none)}!=${want}`);
    if (flat(none).some((e) => e.seen)) fail.push("codex-unseen");
    const keys = flat(none).map((e) => e.key);
    if (new Set(keys).size !== keys.length) fail.push("codex-keys");
    const all = rlCodexEntries({ seen: Object.fromEntries(keys.map((k) => [k, !0])) });
    for (const e of flat(all)) if (!e.seen || !e.name || !e.desc) fail.push("codex-entry:" + e.key);
    // an old save: no Codex keys, but a defeated boss, a build in the history and a saved run
    const old = rlCodexEntries({
        seen: { tutorial: !0 },
        stats: { bosses: { warden: 1 } },
        history: [{ build: [upgradeList[0].id] }],
        run: { up: { [upgradeList[1].id]: 1 }, offer: [upgradeList[2].id] },
      }),
      seenKeys = flat(old)
        .filter((e) => e.seen)
        .map((e) => e.key)
        .sort()
        .join(),
      wantKeys = ["boss_warden", ...upgradeList.slice(0, 3).map((u) => "up_" + u.id)].sort().join();
    if (seenKeys !== wantKeys) fail.push(`codex-old-save:${seenKeys}`);
    for (const bad of [null, undefined, {}, { seen: null, history: "x", run: 5, stats: { bosses: null } }])
      rlCodexEntries(bad);
    for (const m of ["biomeCard", "bossCard", "releaseTitleCard", "clearTitleCard", "renderCodex", "recordsTab", "markSeen"])
      typeof GameUI.prototype[m] !== "function" && fail.push("ui:" + m);
  } catch (e) {
    fail.push("exception:" + (e && e.message));
  }
  return { ...r, ok: r.ok && fail.length === 0, v250D: { ok: fail.length === 0, fail } };
}

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

/* ==========================================================================
   2.5.0 B: workshop merge (refund migration) and the three new modules
   ========================================================================== */
RL_EVENT_KINDS.add("kit");
RL_EVENT_KINDS.add("barrier");
function selfTestV250B(r) {
  const fail = [],
    ids = workshopModules.map((m) => m.id);
  for (const id of Object.keys(RL_RETIRED_MODULES)) {
    if (ids.includes(id) || modulesById[id]) fail.push("retired-listed:" + id);
    if (!modulesById[RL_RETIRED_MODULES[id].to]) fail.push("retired-target:" + id);
  }
  for (const id of ["nova", "fieldSupply", "starterKit", "hazardAttune", "emergencyShield"])
    modulesById[id] || fail.push("module-missing:" + id);
  // old save: every bought level of a removed module is refunded at full price, kept modules keep
  // their levels, over-range levels are capped, the run is left alone; a second pass changes nothing
  const note = RL_MODULE_NOTE,
    run = { v: 1, weapon: "pulse", wave: 7, hp: 50 },
    raw = {
      shards: 50,
      workshop: { nova: 2, fieldSupply: 1, hull: 3, riftBattery: 2, reactorCore: 9, routeScanner: 1 },
      run,
    },
    m = rlMigrateModules(raw);
  const want = 50 + 260 + 540 + (1600 + 3400 + 6200) + 1800;
  if (
    m.shards !== want ||
    m.workshop.nova !== 2 ||
    m.workshop.fieldSupply !== 1 ||
    m.workshop.hull !== 3 ||
    "riftBattery" in m.workshop ||
    "reactorCore" in m.workshop ||
    "routeScanner" in m.workshop ||
    m.run !== run ||
    raw.workshop.riftBattery !== 2 ||
    !RL_MODULE_NOTE ||
    RL_MODULE_NOTE.refund !== want - 50 ||
    RL_MODULE_NOTE.names.length !== 3
  )
    fail.push("migrate:" + JSON.stringify({ m, note: RL_MODULE_NOTE }));
  set_RL_MODULE_NOTE(null);
  if (rlMigrateModules(m) !== m || RL_MODULE_NOTE) fail.push("migrate-twice");
  const zero = rlMigrateModules({ shards: 5, workshop: { routeScanner: 0 } });
  if (zero.shards !== 5 || "routeScanner" in zero.workshop || RL_MODULE_NOTE) fail.push("migrate-zero");
  set_RL_MODULE_NOTE(note);
  // a saved run with the kept Nova Cell level resumes (no kit on resume)
  const snap = cleanRun({ v: 1, seed: 9, weapon: "pulse", wave: 7, hp: 60, nova: 10, up: { dmg: 1 } }),
    resumed = snap && new World({ snap, ws: { nova: 2, starterKit: 3 } });
  if (!resumed || resumed.wave !== 7 || resumed.up.dmg !== 1 || Object.keys(resumed.up).length !== 1)
    fail.push("resume");
  // Starter Kit: one distinct common upgrade per level on a new run
  const kit = new World({ seed: 0x250b, weapon: "pulse", threat: 0, ws: { starterKit: 3 } }),
    kitIds = Object.keys(kit.up);
  if (kitIds.length !== 3 || !kitIds.every((id) => upgradesById[id].rarity === 1 && kit.up[id] === 1))
    fail.push("kit:" + kitIds.join(","));
  if (Math.round(kit.player.hp) !== Math.round(kit.stats.maxHp)) fail.push("kit-hp");
  if (Object.keys(new World({ seed: 0x250b, weapon: "pulse", threat: 0, ws: {} }).up).length) fail.push("kit-free");
  // Hazard Attunement: close to a pool (edge within 2 m) raises damage and repair only while there
  const at = new World({ seed: 0x250c, weapon: "pulse", threat: 0, ws: { hazardAttune: 2 } });
  at.startWave(2);
  at.hold = !0;
  const d0 = at.stats.dmgMul;
  at.arena.acid.push({ x: at.player.x + 3.2, y: at.player.y, r: 1.5 });
  at.step(1 / 60, {});
  const on = at.attuned;
  at.arena.acid.pop();
  at.step(1 / 60, {});
  if (!on || at.attuned || at.stats.dmgMul !== d0) fail.push("attune");
  // Emergency Shield: once per wave below 30% hull, blocks damage while up, ready again next wave
  const es = new World({ seed: 0x250d, weapon: "pulse", threat: 0, ws: { emergencyShield: 1 } }),
    p = es.player;
  es.state = "fight";
  p.iT = 0;
  p.shield = !1;
  es.hurtPlayer(p.hp - 20, null, null, "grunt", !0);
  const healed = p.hp,
    blocked = es.hurtPlayer(5, null, null, "grunt", !0) === !1;
  es.barrierT = 0;
  const hpNow = p.hp;
  es.hurtPlayer(2, null, null, "grunt", !0);
  if (healed !== 20 + Math.round(es.stats.maxHp * 0.08) || !blocked || p.hp !== hpNow - 2 || !es.barrierUsed)
    fail.push("barrier:" + [healed, blocked, hpNow, p.hp]);
  es.startWave(2);
  if (es.barrierUsed) fail.push("barrier-wave");
  return { ...r, ok: r.ok && fail.length === 0, v250B: { ok: fail.length === 0, fail } };
}
