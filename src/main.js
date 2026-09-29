// Entry point: boot and wiring. Creates the save store, sound, renderer, input, overlay and UI,
// holds the game controller (game) and the main loop, and connects everything (page visibility,
// service worker, wake lock, save export/import). Imports every other module, so their code runs
// in the original order.

import {
  RL_EVENT_KINDS,
  RL_HEALTH,
  RL_LAST_RUN_AUDIT,
  RL_MON,
  RL_RT,
  errorLog,
  setLogContext,
  rlMonCrashed,
  rlMonFinish,
  rlMonFrame,
  rlMonPreEnd,
  rlMonStart,
  rlRunAudit,
  rlRunHealth,
  rlUiButtonGuardSelfTest,
  buildReport,
  logError,
} from "./core/diagnostics.js";
import { rlSelfTest, rlPaletteIssues, rlBiomeDistinct } from "./core/selftest.js";
import { GameUI, RL_TOUCH_CLICK_GUARD, getById, rlBiomeTitle, iconPaths, escapeHtml } from "./ui/ui.js";
import { Input, RL_INPUT } from "./ui/input.js";
import { musicChords, rlShotSfx, musicVoices, SoundEngine } from "./audio/sound.js";
import {
  defaultSettings,
  RL_RETIRE_NOTE,
  SaveStore,
  rlRecordRun,
  rlSanitizeHistory,
  set_RL_RETIRE_NOTE,
  cleanRun,
  newSave,
  RL_MODULE_NOTE,
  set_RL_MODULE_NOTE,
  rlMigrateModules,
} from "./core/save.js";
import { RL_MESH_TYPES } from "./render/models.js";
import {
  enemyDefs,
  bossOrder,
  RL_ENEMY_TIPS,
  biomeVariants,
  bossDefs,
  enemyOrder,
  bossByWave,
} from "./data/enemies.js";
import { BUILD_ID, GAME_VERSION, formatCount } from "./core/util.js";
import { RL_KITERS, updateEnemy } from "./core/ai.js";
import { RL_BIOME_HAZARD, biomesById, biomeList, rlApplyBiomeFixes } from "./data/biomes.js";
import { weaponOrder, weaponDefs } from "./data/weapons.js";
import { waveEvents, spawnWeights, heavyEnemies } from "./core/waves.js";
import { World, rlStep } from "./core/world.js";
import { threatMods, milestones, workshopModules, threatLevels } from "./data/progression.js";
import { upgradeList, upgradesById } from "./data/upgrades.js";
import { mapTemplates, hitsObstacle, obstacleShapes, buildLayout, isConnected } from "./core/arena.js";
import { computeStats, weaponRange } from "./core/stats.js";
import { Renderer } from "./render/renderer.js";
import "./render/biome-visuals.js";
import { Overlay } from "./render/overlay.js";

var RL_INTRO = { queue: [], last: 0 };
function rlIntroEvents(world) {
  if (game.tut) return; // the tutorial coach owns the screen on the first run
  for (const ev of world.fx) {
    if (
      (ev.k === "spawn" || ev.k === "champion") &&
      RL_ENEMY_TIPS[ev.type] &&
      !store.data.seen["enemy_" + ev.type] &&
      !RL_INTRO.queue.includes(ev.type)
    )
      RL_INTRO.queue.push(ev.type);
  }
  const now = performance.now();
  if (RL_INTRO.queue.length && now - RL_INTRO.last > 6500 && world.state === "fight") {
    const type = RL_INTRO.queue.shift(),
      seen = store.data.seen;
    seen["enemy_" + type] = true;
    if (type === "mender") {
      seen.tip_mender = true;
    }
    store.save("intro");
    RL_INTRO.last = now;
    ui.toast(`NEW · ${enemyDefs[type].name.toUpperCase()} — ${RL_ENEMY_TIPS[type]}`, "intro", 6200);
  }
}

/* ---- content data fixes found by the data audit (2.3.2). Runs once, after all
 content packs are merged and before the save store and renderer are built. ---- */
function rlApplyDataFixes() {
  // Distinct silhouettes need distinct colours: Sentinel shared Bomber's yellow,
  // Repair Beacon shared Mender's green.
  enemyDefs.sentinel.color = 0xe8e8ff;
  enemyDefs.beacon.color = 0x00ffa2;
  // The weapon carousel follows unlock price (it jumped 2400 → 1450 → … before).
  weaponOrder.sort((a, b) => weaponDefs[a].cost - weaponDefs[b].cost);
  // 2.3.2: workshop texts must say what the module really does (full QA "workshop" section).
  // Drone Bay only works together with the Wingman upgrade. (Field Supply and Route Scanner
  // had the same effect until 2.3.5; their texts now live with their data.)
  const mod = (id) => workshopModules.find((entry) => entry.id === id);
  mod("droneBay").desc = "+1 Wingman slot per level (needs the Wingman upgrade)";
  // 2.5.0 B: Nova Cell's text lives with its data; Rift Battery and Reactor Core were merged into it.
  // Route Scanner referenced a "map" icon that did not exist (fell back to "info"); Field Supply uses it now.
  iconPaths.map = '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>';
  rlApplyBiomeFixes();
}
var isStandaloneBuild = true;
var isIOSDevice =
  typeof navigator < "u" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
var isInstalledPwa =
  typeof window < "u" &&
  ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true);
function registerServiceWorker(onUpdate) {
  if (
    !(
      !isStandaloneBuild ||
      !("serviceWorker" in navigator) ||
      (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1")
    )
  ) {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./", updateViaCache: "none" })
      .then((registration) => {
        let hadController = !!navigator.serviceWorker.controller,
          offer = (worker) => {
            if (!(!worker || !navigator.serviceWorker.controller)) {
              onUpdate(() => {
                let reloaded = false,
                  reload = () => {
                    if (!reloaded) {
                      reloaded = true;
                      location.reload();
                    }
                  };
                navigator.serviceWorker.addEventListener("controllerchange", reload);
                worker.postMessage("skipWaiting");
                setTimeout(reload, 4e3);
              });
            }
          };
        if (registration.waiting && hadController) {
          offer(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          let worker = registration.installing;
          if (worker) {
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed") {
                offer(worker);
              }
            });
          }
        });
        let checkForUpdate = () => registration.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            checkForUpdate();
          }
        });
        window.addEventListener("online", checkForUpdate);
        setInterval(checkForUpdate, 900 * 1e3);
      })
      .catch((err) => logError("sw", err));
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }
}
var wakeLockSentinel = null,
  wakeLockWanted = false;
async function setWakeLock(on) {
  wakeLockWanted = on;
  try {
    if (on && !wakeLockSentinel && navigator.wakeLock && document.visibilityState === "visible") {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      wakeLockSentinel.addEventListener("release", () => {
        wakeLockSentinel = null;
      });
    } else {
      if (!on && wakeLockSentinel) {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
      }
    }
  } catch {
    wakeLockSentinel = null;
  }
}
if (typeof document < "u") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wakeLockWanted) {
      setWakeLock(true);
    }
  });
}
var noJsNotice = document.getElementById("nojs");
if (noJsNotice) {
  noJsNotice.remove();
}
setLogContext({ version: GAME_VERSION, build: BUILD_ID, mode: isStandaloneBuild ? "standalone" : "artifact" });
var qualityPresets = {
    high: { dpr: 2, particles: 1400, fps: 0 },
    battery: { dpr: 1, particles: 500, fps: 30 },
    auto: { dpr: 1.5, particles: 1400, fps: 0 },
  },
  store = (rlApplyDataFixes(), new SaveStore()),
  sound = new SoundEngine(),
  elementById = (id) => document.getElementById(id),
  renderer = null;
try {
  renderer = new Renderer(elementById("gl"), { dpr: 1.5 });
  let gl = renderer.renderer.getContext(),
    debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  setLogContext({ gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "n/a" });
} catch (err) {
  logError("webgl", err);
}
elementById("gl").addEventListener("webglcontextlost", () => logError("webgl", "context lost"));
elementById("gl").addEventListener("webglcontextrestored", () => logError("webgl", "context restored"));
let _resizeRaf = 0,
  _resizeWhy = "resize",
  _resizeFollowTimer = 0;
function _resetInputForViewportChange() {
  try {
    if (input && (input.move.active || input.aim.active)) {
      input.reset();
    }
  } catch (err) {
    logError("input-reset", err);
  }
}
function _scheduleResize(why) {
  _resizeWhy = why;
  if (!_resizeRaf) {
    _resizeRaf = requestAnimationFrame(() => {
      _resizeRaf = 0;
      try {
        if (renderer) {
          renderer.resize(true);
        }
      } catch (err) {
        logError(_resizeWhy, err);
      }
    });
  }
}
window.addEventListener(
  "resize",
  () => {
    _resetInputForViewportChange();
    _scheduleResize("resize");
  },
  { passive: true },
);
window.addEventListener(
  "orientationchange",
  () => {
    _resetInputForViewportChange();
    _scheduleResize("orientation");
    clearTimeout(_resizeFollowTimer);
    _resizeFollowTimer = setTimeout(() => {
      _resizeFollowTimer = 0;
      _scheduleResize("orientation-follow");
    }, 120);
  },
  { passive: true },
);
if (window.visualViewport) {
  window.visualViewport.addEventListener(
    "resize",
    () => {
      _resetInputForViewportChange();
      _scheduleResize("viewport");
    },
    { passive: true },
  );
}
var overlay = new Overlay(elementById("ov")),
  input = new Input(elementById("touch"), renderer),
  game = {
    store: store,
    sound: sound,
    input: input,
    renderer: renderer,
    mode: "menu",
    world: null,
    paused: false,
    previewW: store.data.weapon,
    buildId: BUILD_ID,
    chooseShown: false,
    overShown: false,
    slowMo: 0,
    pendingUpdate: null,
    cloud: null,
    startRun(options) {
      const { resume } = options;
      let save = store.data,
        snap = resume ? save.run : null;
      if (!resume) {
        save.stats.runs++;
      }
      let started = true;
      try {
        this.world = new World({
          seed: (Math.random() * 4294967296) >>> 0,
          weapon: save.weapon,
          threat: save.threat,
          ws: save.workshop,
          snap: snap,
        });
      } catch (err) {
        logError("start", err);
        save.run = null;
        store.save("bad-run");
        ui.alert("Could not start", "The saved run could not be restored and was discarded.");
        started = false;
      }
      if (started) {
        this.mode = "game";
        this.paused = false;
        this.chooseShown = false;
        this.overShown = false;
        this.acc = 0;
        this.slowMo = 0;
        this.intro = null;
        RL_RT.runStartMs = Date.now();
        RL_RT.runErrorSnapshot = errorLog.map((entry) => `${entry.where}|${entry.msg}|${entry.n}`);
        if (renderer) {
          renderer.focusOn(null);
        }
        this.hintT = 0;
        ui.hideMenus();
        ui.hideOver();
        ui.hideChoose();
        ui.hidePause();
        ui.hideCrash();
        ui.showHud(true);
        input.reset();
        input.enabled = true;
        game.freeze = 0;
        game.tut =
          !store.data.seen.tutorial && !resume && this.world.wave === 1
            ? { step: 0, t: 0, moved: 0, kills: 0, dashed: false }
            : null;
        if (game.tut) {
          this.world.hold = true;
        }
        ui.coach(null);
        if (renderer) {
          renderer.resetCamera();
        }
        sound.setMusic("fight", this.world.biomeFor(this.world.wave).id);
        setWakeLock(true);
      }
      // 2.2.3: run monitor (only the live run's world is observed; self-test and snapshot-check
      // worlds are ignored by identity). Also runs when the world could not be built.
      try {
        if (this.world && this.mode === "game") {
          rlMonStart(this.world, !!(options && options.resume));
        }
      } catch (err) {
        logError("monitor", err);
      }
    },
    choose(index) {
      let world = this.world;
      if (!(!world || !world.choose(index))) {
        this.chooseShown = false;
        ui.hideChoose();
        input.reset();
      }
    },
    reroll() {
      let world = this.world;
      if (world && world.reroll()) {
        ui.renderCards(world);
        sound.play("pick");
        store.data.run = world.snapshot();
        store.save("reroll");
      }
    },
    pause() {
      let world = this.world;
      if (
        !(
          this.mode !== "game" ||
          !world ||
          this.paused ||
          this.overShown ||
          (world.state !== "fight" && world.state !== "cleared")
        )
      ) {
        this.paused = true;
        input.reset();
        ui.showPause(world);
        sound.setMusic("menu");
        store.save("pause");
        setWakeLock(false);
      }
    },
    resume() {
      if (this.paused) {
        this.paused = false;
        ui.hidePause();
        input.reset();
        this.last = performance.now();
        setWakeLock(true);
        if (this.world) {
          sound.setMusic(this.world.boss ? "boss" : "fight", this.world.biomeFor(this.world.wave).id);
        }
      }
    },
    restart() {
      ui.hidePause();
      this.paused = false;
      this.endRun(false, true, true);
      this.startRun({});
    },
    abandon() {
      ui.hidePause();
      this.paused = false;
      this.endRun(false, true);
    },
    endless() {
      let world = this.world;
      if (!(!world || world.state !== "victory")) {
        ui.hideOver();
        this.overShown = false;
        world.shards = 0;
        world.kills = 0;
        world.bossKills = [];
        world.legendaries = 0;
        world.flawless = 0;
        world.time = 0;
        world.evolved = 0;
        world.dmgSrc = {};
        world.continueEndless();
        ui.showHud(true);
        this.chooseShown = false;
      }
      // 2.2.3: the endless part is monitored as a new run
      try {
        if (this.world && this.world.endless) {
          rlMonStart(this.world, true);
        }
      } catch (err) {
        logError("monitor", err);
      }
    },
    goHome() {
      this.mode = "menu";
      this.world = null;
      this.paused = false;
      ui.hideOver();
      ui.hideChoose();
      ui.hidePause();
      ui.showHud(false);
      ui.homeInit = false;
      ui.show("home");
      sound.setMusic("menu");
      setWakeLock(false);
      rlApplyUpdateWhenIdle("home");
    },
    discardRun() {
      store.data.run = null;
      store.save("discard");
    },
    recover() {
      ui.hideCrash();
      this.crashed = false;
      this.goHome();
      startLoop();
    },
    endRun(win, abandoned = false, silent = false) {
      // 2.2.3: run monitor, read before the run is settled
      const world = this.world,
        pre = world && !this.overShown ? rlMonPreEnd(world) : null;
      // 1.6.0: run metrics for the game-over screen (ui.showOver reads game._runExtra)
      this._runExtra = world
        ? {
            dmgDealt: world.dmgDealt,
            dmgTaken: world.runStats && world.runStats.dmgTaken,
            critHits: world.runStats && world.runStats.critHits,
            dashes: world.runStats && world.runStats.dashes,
            bestCombo: world.bestCombo,
          }
        : null;
      let save = store.data,
        stats = save.stats;
      if (!world || this.overShown) return;
      this.overShown = true;
      rlRunAudit(world, win, abandoned);
      let mods = threatMods(world.threat),
        salvage = 1 + 0.1 * (save.workshop.salvage || 0),
        collected = world.shards,
        bonus = win ? Math.round(collected * 0.25) : 0,
        total = Math.round((collected + bonus) * mods.shards * salvage),
        rows = [["Collected", collected]];
      if (bonus) {
        rows.push(["Clear bonus +25%", "+" + bonus]);
      }
      if (world.threat > 0) {
        rows.push([`${threatLevels[world.threat].name} \xD7${mods.shards.toFixed(2)}`, "\xD7"]);
      }
      if (salvage > 1) {
        rows.push([`Salvager \xD7${salvage.toFixed(1)}`, "\xD7"]);
      }
      let claimedBefore = new Set(this.claimable()),
        unlocks = [],
        wave = win ? 20 : world.wave,
        best = wave > stats.bestWave,
        fastest = win && !world.endless && world.time > 0 && (stats.bestTime <= 0 || world.time < stats.bestTime);
      stats.bestWave = Math.max(stats.bestWave, wave);
      if (fastest) {
        stats.bestTime = world.time;
      }
      stats.bestBy[world.weapon] = Math.max(stats.bestBy[world.weapon] || 0, wave);
      stats.kills += world.kills;
      stats.playTime += world.time;
      stats.shardsEarned += total;
      stats.legendaries += world.legendaries;
      stats.flawless += world.flawless;
      stats.evolved += world.evolved;
      stats.bestCombo = Math.max(stats.bestCombo, world.bestCombo);
      for (let bossId of world.bossKills) stats.bosses[bossId] = (stats.bosses[bossId] || 0) + 1;
      if (win && !world.endless) {
        stats.clears++;
        stats.clearsBy[world.weapon] = (stats.clearsBy[world.weapon] || 0) + 1;
        stats.bestClearThreat = Math.max(stats.bestClearThreat, world.threat);
        if (world.threat >= save.threatMax && save.threatMax < 5) {
          save.threatMax = world.threat + 1;
          unlocks.push(`${threatLevels[save.threatMax].name} unlocked`);
        }
      } else {
        stats.deaths += abandoned ? 0 : 1;
      }
      save.shards += total;
      save.run = null;
      store.save("run-end");
      let newMilestones = this.claimable()
        .filter((id) => !claimedBefore.has(id))
        .map((id) => milestones.find((milestone) => milestone.id === id).name);
      if (game.tut) {
        store.data.seen.tutorial = true;
        game.tut = null;
        ui.coach(null);
        store.save("tutorial");
      }
      if (silent) this.overShown = false;
      else {
        ui.showHud(false);
        ui.hideChoose();
        ui.showOver({
          win: win,
          abandoned: abandoned,
          wave: wave,
          time: world.time,
          kills: world.kills,
          bosses: world.bossKills.length,
          weapon: world.weapon,
          threat: world.threat,
          rows: rows,
          total: total,
          best: best,
          milestones: newMilestones,
          unlocks: unlocks,
          canEndless: win && !world.endless,
          killer: win || abandoned ? null : world.lastHit,
          dmgSrc: world.dmgSrc,
          weaponName: weaponDefs[world.weapon].name,
          fastest: fastest,
        });
        sound.setMusic("menu");
        setWakeLock(false);
      }
      // 2.2.3: run audit and run history (a silent end is recorded too)
      if (pre)
        try {
          rlMonFinish(world, pre, !!win, !!abandoned, !!silent, false);
        } catch (err) {
          logError("audit", err);
        }
      if (pre)
        try {
          rlRecordRun(world, pre, !!win, !!abandoned);
        } catch (err) {
          logError("history", err);
        }
    },
    settingsChanged(quiet) {
      applySettings();
      if (!quiet) {
        store.save("settings");
      }
    },
    resetProgress() {
      store.reset();
      afterProgressReset("Progress reset");
    },
    claimable() {
      let save = store.data;
      return milestones
        .filter((milestone) => !save.milestones[milestone.id] && milestone.test(save))
        .map((milestone) => milestone.id);
    },
    previewWeapon(weapon) {
      this.previewW = weapon;
    },
  };
game.qualityNote = () => {
  let settings = store.data.settings,
    dpr = renderer ? renderer.dpr.toFixed(2).replace(/0$/, "") : "-";
  return settings.quality === "auto"
    ? `Adapts to your device (now ${dpr}\xD7)`
    : settings.quality === "battery"
      ? "Lower resolution, 30 fps"
      : `Sharpest (${dpr}\xD7)`;
};
function afterProgressReset(message) {
  ui.homeInit = false;
  applySettings();
  if (ui.screen === "settings") {
    ui.renderSettings();
  }
  ui.toast(message);
}
var ui = new GameUI(game);
game.ui = ui;
input.onBlur = () => {
  if (game.mode === "game") {
    game.pause();
  }
};
input.isPlaying = () => game.mode === "game" && !game.paused && !game.chooseShown && !game.overShown;
input.onPause = () => {
  if (!document.getElementById("dialog").hidden) {
    ui.closeDialog(null);
    return;
  }
  // 2.4.2 Esc: back in menu pages; from settings opened in the pause menu back to the pause menu
  if (ui.rlFromPause) return ui.back();
  if (game.mode === "menu") {
    if (input._rlKey === "escape" && ["workshop", "records", "settings"].includes(ui.screen)) {
      ui.back();
    }
    return;
  }
  if (game.mode === "game") {
    if (game.paused) {
      game.resume();
    } else {
      game.pause();
    }
  }
};
var qualityPreset = qualityPresets.auto,
  autoDpr = 1.5;
function applySettings() {
  let settings = store.data.settings;
  sound.setVolumes(settings.sfx, settings.music);
  input.swap = settings.swap;
  ui.setSwap(settings.swap);
  qualityPreset = qualityPresets[settings.quality] || qualityPresets.auto;
  overlay.contrast = settings.contrast;
  ui.calm = settings.calm;
  if (renderer) {
    renderer.setAccess(settings.contrast, settings.calm);
    renderer.zoom = settings.zoom || 1;
    let dpr = settings.quality === "auto" ? autoDpr : qualityPreset.dpr;
    renderer.setQuality(dpr, qualityPreset.particles);
  }
}
var loopFrameId = 0,
  frameErrorCount = 0,
  slowWindowCount = 0,
  fpsWindowTime = 0,
  fpsWindowFrames = 0,
  dimFrameCounter = 0,
  menuFrame = 0;
function startLoop() {
  if (!loopFrameId) {
    game.last = performance.now();
    loopFrameId = requestAnimationFrame(loopTick);
  }
}
function loopTick(now) {
  loopFrameId = requestAnimationFrame(loopTick);
  let dt = (now - (game.last || now)) / 1e3;
  if (!(qualityPreset.fps && dt < 1 / qualityPreset.fps - 0.004)) {
    game.last = now;
    dt = Math.min(0.1, Math.max(0, dt));
    try {
      const frameStart = performance.now();
      runFrame(dt);
      frameErrorCount = 0;
      if (RL_MON)
        try {
          rlMonFrame(performance.now() - frameStart);
        } catch {}
    } catch (err) {
      frameErrorCount++;
      logError("frame", err);
      if (frameErrorCount >= 3) {
        cancelAnimationFrame(loopFrameId);
        loopFrameId = 0;
        game.crashed = true;
        setWakeLock(false);
        rlMonCrashed();
        ui.showCrash(buildReport());
      }
    }
  }
}
function runFrame(dt) {
  let settings = store.data.settings,
    world = game.world;
  if (game.mode === "game" && world) {
    if (!game.paused && document.visibilityState !== "hidden") {
      let slow = game.slowMo > 0 ? 0.35 : 1;
      game.slowMo = Math.max(0, game.slowMo - dt);
      let speed = game.speed || 1;
      if (game.intro) {
        updateBossIntro(dt, world);
      } else {
        if (game.freeze > 0) {
          game.freeze -= dt;
        } else {
          game.acc += dt * slow * speed;
        }
      }
      let steps = 0,
        maxSteps = 5 * speed;
      for (; game.acc >= rlStep && steps < maxSteps; ) {
        world.step(rlStep, input.sample(world, settings));
        game.acc -= rlStep;
        steps++;
      }
      if (steps >= maxSteps) {
        game.acc = 0;
      }
      handleWorldEvents(world);
      rlIntroEvents(world);
      updateTutorial(dt, world);
      updateHeartbeat(dt, world);
      sound.setIntensity(
        world.state === "fight"
          ? world.enemies.length / 34 +
              world.eb.length / 90 +
              (world.boss ? 0.4 : 0) +
              (world.player.hp / world.stats.maxHp < 0.3 ? 0.2 : 0)
          : 0,
      );
      updateAutoQuality(dt, settings);
    }
    if (game.paused) return;
    if (renderer) {
      renderer.consume(world.fx, world, settings);
      if (renderer.mapChanged) {
        renderer.mapChanged = false;
        sound.play("rumble");
      }
      let dimmed = game.chooseShown || game.overShown;
      if (!dimmed || (dimFrameCounter = (dimFrameCounter + 1) % 3) === 0) {
        renderer.frame(dimmed ? dt * 3 : dt, world);
      }
    }
    sound.consume(world.fx);
    world.fx.length = 0;
    if (renderer && !(game.chooseShown || game.overShown)) {
      // 2.3.6: the "DRAG HERE TO MOVE" hints follow the input in use (like the coach texts since
      // 2.3.4); on a laptop with a touch screen they showed while playing with keys and mouse.
      let hints = !!game.tut && game.tut.step <= 1 && RL_INPUT.touch;
      overlay.draw(renderer, world, input, { hints: hints, dt: dt, safe: safeAreaInsets() });
    } else overlay.clear();
    ui.hud(world);
    if (world.state === "choose" && !game.chooseShown && !game.overShown) {
      game.chooseShown = true;
      input.reset();
      ui.showChoose(world);
    }
    if (world.state === "dead" && world.stateT > 1.5 && !game.overShown) {
      game.endRun(false);
    }
    if (world.state === "victory" && world.stateT > 0.8 && !game.overShown) {
      game.endRun(true);
    }
  } else {
    if (renderer && (menuFrame = (menuFrame + 1) & 1) === 0) {
      renderer.frame(dt, null, { menu: true, weapon: game.previewW, biome: biomeList[menuBiomeIndex()] });
    }
    overlay.clear();
  }
}
function menuBiomeIndex() {
  let bestWave = store.data.stats.bestWave;
  return Math.min(biomeList.length - 1, Math.floor(Math.max(0, bestWave - 1) / 5));
}
/* 2.5.0 D: biome title card and boss intro card (the cards themselves are in the 2.5.0 D section
 of ui/ui.js). The first wave of a biome (wave 1 and every biome change) shows the biome card in
 place of its wave banner; an event on such a wave is announced right after the card. A new boss
 shows its name card during the camera pan (game.intro) in place of the plain name banner and
 counts as seen for the Codex (boss_<id>). */
let cardWave = 0,
  cardEvent = null;
function handleWorldEvents(world) {
  // 2.5.0 D: find the title cards of this frame before the banners are shown
  let card = null,
    boss = null;
  for (const ev of world.fx) {
    if (ev.k === "wave" && !ev.boss && (ev.n === 1 || world.biomeFor(ev.n - 1).id !== world.biomeFor(ev.n).id)) {
      card = ev;
    } else {
      if (ev.k === "boss" && bossDefs[ev.id]) {
        boss = ev;
      }
    }
  }
  // 2.5.0 B: the events of the new modules
  for (const ev of world.fx) {
    if (ev.k === "kit") {
      ui.toast(`STARTER KIT · ${ev.ids.map((id) => upgradesById[id]?.name || id).join(", ")}`, "good", 3200);
    } else {
      if (ev.k === "barrier") {
        ui.banner("EMERGENCY SHIELD", "Hull critical — barrier up", "good", 1400);
      }
    }
  }
  for (let ev of world.fx)
    switch (ev.k) {
      case "wave": {
        store.data.run = world.snapshot();
        store.save("wave");
        let biome = world.biomeFor(ev.n);
        if (renderer) {
          renderer.resetCamera();
        }
        let newBiome = ev.n === 1 || world.biomeFor(ev.n - 1).id !== biome.id;
        if (ev.event) {
          let event = waveEvents[ev.event];
          ui.banner(event.name, `Wave ${ev.n} \xB7 ${event.desc}`, "good", 2600);
          sound.play("event");
        } else
          ui.banner(
            ev.boss ? "WARNING" : `WAVE ${ev.n}`,
            ev.boss ? "Boss signature detected" : newBiome ? rlBiomeTitle(biome) : world.endless ? "Endless" : "",
            ev.boss ? "boss" : "",
            2e3,
          );
        if (!ev.boss && world.arena.vents.length) {
          showTipOnce("lava", "Lava vents glow before they erupt. Lure enemies onto them \u2014 they burn too.");
        }
        if (!ev.boss && world.arena.ice.length) {
          showTipOnce(
            "ice",
            "Cryo Vault: the whole floor is slick, the ice sheets even more \u2014 enemies slide on them too.",
          );
        }
        if (!ev.boss && world.arena.acid.length) {
          showTipOnce("acid", "Acid pools eat at your hull \u2014 but enemies standing in them take 25% more damage.");
        }
        if (!ev.boss && world.arena.portals.length) {
          showTipOnce("portal", "Portals move you across the arena. Shots fly through them too.");
        }
        sound.setMusic(ev.boss ? "boss" : "fight", biome.id);
        if (ev.n === 2) {
          showTipOnce(
            "dash",
            rlKeys()
              ? "Tip: SPACE dashes \u2014 it makes you untouchable for a moment."
              : "Tip: DASH makes you untouchable for a moment.",
          );
        }
        if (ev.n === 3) {
          showTipOnce(
            "aim",
            rlKeys()
              ? "Tip: hold the left mouse button to aim and fire at the cursor."
              : `Tip: drag the ${touchSides().aim} side to aim yourself. Holding it fires at the nearest enemy.`,
          );
        }
        break;
      }
      case "boss":
        ui.banner(ev.name, ev.title, "boss", 2600);
        showTipOnce("boss", "Bosses telegraph every attack. Marked zones and lines hit hard \u2014 move out.");
        if (world.boss && renderer) {
          game.intro = { t: 0 };
          renderer.focusOn(world.boss.x, world.boss.y);
          input.settle();
        }
        break;
      case "novaReady":
        showTipOnce(
          "nova",
          rlKeys()
            ? "NOVA is charged \u2014 press E to blast everything around you."
            : "NOVA is charged \u2014 tap it to blast everything around you.",
        );
        break;
      case "cleared":
        ui.banner(ev.boss ? "BOSS DOWN" : "CLEARED", ev.flawless ? "Flawless" : `Wave ${ev.n}`, "good", 1500);
        if (!ev.boss) {
          game.slowMo = Math.max(game.slowMo, 0.45);
        }
        break;
      case "hurt":
        if (!ev.chip) {
          ui.hurtFlash();
          overlay.addHurt(world, ev.sx, ev.sy);
          hitStop(0.06);
        }
        break;
      case "champion":
        ui.banner(
          "CHAMPION",
          `A ${enemyDefs[ev.type].name} leads the pack \u2014 its allies move faster`,
          "warn",
          2200,
        );
        showTipOnce("champion", "Champions rally nearby enemies. Take one down and the pack is stunned.");
        break;
      case "championDown":
        ui.banner("CHAMPION DOWN", "The pack is stunned", "good", 1400);
        game.slowMo = Math.max(game.slowMo, 0.5);
        hitStop(0.08);
        break;
      case "mend":
        showTipOnce("mender", "Menders heal other enemies. Kill them first.");
        break;
      case "kill":
        if (ev.elite || ev.r >= 0.8) {
          hitStop(ev.elite ? 0.05 : 0.025);
        }
        break;
      case "nova":
        hitStop(0.08);
        break;
      case "guardBreak":
        hitStop(0.03);
        break;
      case "bossAtk":
        overlay.callout(ev.atk);
        break;
      case "offer":
        store.data.run = world.snapshot();
        store.save("offer");
        break;
      case "combo":
        ui.comboPop(ev.n, ev.bonus);
        break;
      case "bountyPulse":
        ui.toast(`BOUNTY · +${ev.amount} shards`, "good", 1500);
        break;
      case "pick":
        if (ev.evo) {
          ui.banner("EVOLVED", upgradesById[ev.id].name, "good", 1800);
        }
        break;
      case "dash":
        if (game.tut) {
          game.tut.dashed = true;
        }
        break;
      case "enrage":
        ui.banner("ENRAGED", "", "warn", 1400);
        break;
      case "phase":
        ui.banner(`PHASE ${ev.n}`, "The core adapts", "warn", 1600);
        break;
      case "bossDown":
        game.slowMo = 1.1;
        break;
      case "revive":
        ui.banner("SECOND LIFE", "Hull restored", "good", 1600);
        break;
      case "die":
        sound.setMusic("off");
        break;
      case "victory":
        sound.setMusic("menu");
        break;
    }
  // 2.5.0 D: show the title cards
  try {
    if (card) {
      ui.biomeCard(world.biomeFor(card.n), card.n);
      cardWave = card.n;
      cardEvent = (card.event && waveEvents[card.event]) || null;
    }
    if (boss) {
      ui.markSeen(["boss_" + boss.id]);
      ui.bossCard(boss.id, world.biomeFor(world.wave));
    }
    // the biome card stays for the first 1.6 s of its wave (game time), the boss card for the
    // camera pan; then they fade. An event of the biome's first wave is announced after the card.
    const hold = ui.cardHold;
    if (
      hold &&
      (hold.kind === "boss" ? !game.intro : world.wave !== cardWave || world.state !== "fight" || world.waveT >= 1.6)
    ) {
      ui.releaseTitleCard();
      const ev = hold.kind === "biome" && world.wave === cardWave && world.state === "fight" && cardEvent;
      const wave = cardWave;
      if (ev) {
        setTimeout(
          () =>
            game.world === world &&
            !game.paused &&
            world.state === "fight" &&
            world.wave === wave &&
            ui.banner(ev.name, `Wave ${wave} \xB7 ${ev.desc}`, "good", 2600),
          450,
        );
      }
      if (hold.kind === "biome") {
        cardEvent = null;
      }
    }
  } catch (err) {
    logError("titlecard", err);
  }
}
var BOSS_INTRO_TIME = 1.5;
function updateBossIntro(dt, world) {
  let intro = game.intro;
  intro.t += dt;
  if (renderer) {
    renderer.focusK = intro.t / BOSS_INTRO_TIME;
  }
  if (intro.t >= BOSS_INTRO_TIME || !world.boss) {
    game.intro = null;
    if (renderer) {
      renderer.focusOn(null);
    }
    if (world.boss) {
      world.boss.spawnT = Math.min(world.boss.spawnT, 0.1);
    }
    input.settle();
    game.acc = 0;
  }
}
function hitStop(duration) {
  let now = performance.now();
  if (!(now - (game.lastStop || 0) < 180)) {
    game.lastStop = now;
    game.freeze = Math.max(game.freeze || 0, duration);
  }
}
var heartbeatTimer = 0;
function updateHeartbeat(dt, world) {
  let player = world.player;
  if (world.state !== "fight" || !player.alive || player.hp / world.stats.maxHp >= 0.25) {
    heartbeatTimer = 0;
    return;
  }
  heartbeatTimer -= dt;
  if (heartbeatTimer <= 0) {
    heartbeatTimer = 0.95;
    sound.play("heart");
  }
}
var touchSides = () => (store.data.settings.swap ? { move: "right", aim: "left" } : { move: "left", aim: "right" }),
  // 2.3.4: keyboard/mouse players got the touch texts ("drag the left side"), which do nothing
  // with a mouse, and the keys were explained nowhere. Every step now has both wordings and
  // follows the input in use (the coach re-reads the text every frame).
  rlKeys = () => !RL_INPUT.touch,
  tutorialTexts = [
    () =>
      rlKeys() ? "Move with W A S D or the arrow keys." : `Drag anywhere on the ${touchSides().move} side to move.`,
    () =>
      rlKeys()
        ? "Enemies! Your drone fires on its own \u2014 hold the left mouse button to aim yourself."
        : `Enemies! Your drone fires on its own \u2014 drag the ${touchSides().aim} side to aim yourself.`,
    () => (rlKeys() ? "Press SPACE to dash through danger." : "Tap DASH to dodge through danger."),
    () => "Grab the shards \u2014 they buy permanent upgrades in the Workshop.",
  ];
function updateTutorial(dt, world) {
  let tut = game.tut;
  if (tut) {
    tut.t += dt;
    if (tut.step === 0) {
      if (Math.hypot(world.player.vx, world.player.vy) > 2) {
        tut.moved += dt;
      }
      if (tut.moved > 1.1 || tut.t > 12) {
        tut.step = 1;
        tut.t = 0;
        world.hold = false;
        tut.k0 = world.kills;
      }
    } else {
      if (tut.step === 1) {
        if (world.kills - tut.k0 >= 4 || tut.t > 20) {
          tut.step = 2;
          tut.t = 0;
          tut.dashed = false;
        }
      } else {
        if (tut.step === 2) {
          if (tut.dashed || tut.t > 14) {
            tut.step = 3;
            tut.t = 0;
          }
        } else {
          if (tut.step === 3 && tut.t > 5) {
            tut.step = 4;
          }
        }
      }
    }
    if (tut.step >= 4 || world.state !== "fight") {
      game.tut = null;
      world.hold = false;
      ui.coach(null);
      let seen = store.data.seen;
      seen.tutorial = true;
      seen.tip_dash = true;
      seen.tip_aim = true;
      store.save("tutorial");
      return;
    }
    ui.coach(tut.step, tutorialTexts.length, tutorialTexts[tut.step]());
  }
}
function showTipOnce(key, text) {
  let seen = store.data.seen;
  if (!seen["tip_" + key]) {
    seen["tip_" + key] = true;
    store.save("tip");
    ui.toast(text, "", 5200);
  }
}
// 2.4.2: Auto quality also steps back up. Before, two slow windows (a stutter at the start of
// a run is enough) lowered the resolution until the next reload. It now rises again one step
// after 20 s at 57+ fps. A level it had to leave twice becomes the ceiling for the session, so
// a device at its limit does not flip between two levels.
let rlQUp = 0,
  rlQCeil = 1.5;
const rlQLeft = {},
  rlQParticles = (dpr) => (dpr >= 1.5 ? qualityPreset.particles : dpr <= 1 ? 800 : 1100);
function updateAutoQuality(dt, settings) {
  if (settings.quality !== "auto" || !renderer || ((fpsWindowTime += dt), fpsWindowFrames++, fpsWindowTime < 2.5))
    return;
  let fps = fpsWindowFrames / fpsWindowTime;
  fpsWindowTime = 0;
  fpsWindowFrames = 0;
  if (fps < 48) {
    slowWindowCount++;
  } else {
    slowWindowCount = Math.max(0, slowWindowCount - 1);
  }
  rlQUp = fps >= 57 ? rlQUp + 1 : 0;
  if (slowWindowCount >= 2 && autoDpr > 1) {
    if (rlQLeft[autoDpr]) {
      rlQCeil = Math.min(rlQCeil, autoDpr - 0.25);
    }
    rlQLeft[autoDpr] = true;
    autoDpr = Math.max(1, autoDpr - 0.25);
    slowWindowCount = 0;
    rlQUp = 0;
    renderer.setQuality(autoDpr, rlQParticles(autoDpr));
  } else if (rlQUp >= 8 && autoDpr + 0.25 <= rlQCeil) {
    autoDpr += 0.25;
    rlQUp = 0;
    slowWindowCount = 0;
    renderer.setQuality(autoDpr, rlQParticles(autoDpr));
  }
}
function safeAreaInsets() {
  let style = getComputedStyle(document.documentElement),
    read = (name) => parseFloat(style.getPropertyValue(name)) || 0;
  return { t: read("--st"), b: read("--sb"), l: read("--sl"), r: read("--sr") };
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (game.mode === "game") {
      game.pause();
    }
    store.save("hidden");
    sound.suspend();
  } else {
    sound.resume();
    game.last = performance.now();
  }
});
window.addEventListener("pagehide", () => {
  input.reset(true);
  store.save("pagehide");
});
window.addEventListener("pageshow", () => {
  input.reset(true);
  _scheduleResize("pageshow");
});
var unlockAudio = () => {
  sound.unlock();
  if (sound.mode === "off" && game.mode === "menu") {
    sound.setMusic("menu");
  }
};
for (let type of ["pointerdown", "keydown", "click"])
  document.addEventListener(type, unlockAudio, { capture: true, passive: true });
document.addEventListener("gesturestart", (ev) => ev.preventDefault());
document.addEventListener("dblclick", (ev) => ev.preventDefault(), { passive: false });
document.addEventListener(
  "touchmove",
  (ev) => {
    let target = ev.target;
    if (!(target && target.closest && target.closest(".scroll, .cards, .center-col, textarea, input, .log"))) {
      ev.preventDefault();
    }
  },
  { passive: false },
);

/* v1.6.0 merged polish: save backup + tutorial replay (the run metrics are in GameUI.renderRunExtra) */
(function () {
  var makeBackup = function () {
    return JSON.stringify(store.data, null, 2);
  };
  var exportSave = async function () {
    var value = makeBackup();
    var result = await ui.dialog({
      title: "Export save",
      body: '<p>Copy this text and keep it somewhere safe. It contains your Riftline progress and settings.</p><textarea id="saveExport" class="log" spellcheck="false" readonly></textarea>',
      buttons: [
        { label: "Copy", value: "copy", cls: "ghost" },
        { label: "Close", value: null, cls: "primary" },
      ],
      onOpen: function () {
        getById("saveExport").value = value;
      },
      read: function () {
        return getById("saveExport").value;
      },
    });
    if (result && result.value === "copy") ui.copy(result.text || value);
  };
  var importSave = async function () {
    var result = await ui.dialog({
      title: "Import save",
      body: '<p>Paste a Riftline save export below. Importing replaces the current progress on this device.</p><textarea id="saveImport" class="log" spellcheck="false" placeholder="Paste save JSON here"></textarea>',
      buttons: [
        { label: "Cancel", value: null, cls: "ghost" },
        { label: "Restore", value: "restore", cls: "primary" },
      ],
      read: function () {
        return getById("saveImport").value;
      },
    });
    if (!result || result.value !== "restore") return;
    var parsed = store.parse(result.text);
    if (!parsed.ok) {
      ui.alert("Invalid save", "That text is not a valid Riftline save export.");
      return;
    }
    if (
      !(await ui.confirm(
        "Restore save?",
        "Your current local progress will be replaced by the imported save.",
        "Restore",
        true,
      ))
    )
      return;
    store.data = parsed.data;
    store.save("import");
    // 2.4.2: apply the imported settings (volume, left-handed, graphics, camera) right away;
    // they used to wait for the next reload or settings change.
    applySettings();
    game.previewW = store.data.weapon;
    game._runExtra = null;
    game.world = null;
    game.mode = "menu";
    game.paused = false;
    ui.hideOver();
    ui.hideChoose();
    ui.hidePause();
    ui.showHud(false);
    ui.homeInit = false;
    ui.show("home");
    sound.setMusic("menu");
    setWakeLock(false);
    ui.toast("Save restored", "gold", 2400);
  };
  var backupBtn = getById("backupBtn");
  var shareBtn = getById("shareBtn");
  var restoreBtn = getById("restoreBtn");
  var replayTutBtn = getById("replayTutBtn");
  if (backupBtn) {
    backupBtn.addEventListener("click", exportSave);
  }
  if (shareBtn && !navigator.share) shareBtn.hidden = true;
  if (shareBtn) {
    shareBtn.addEventListener("click", async function () {
      var value = makeBackup();
      try {
        await navigator.share({ title: "Riftline save", text: value });
        ui.toast("Save shared", "good", 2200);
      } catch (err) {
        if (err && err.name !== "AbortError") ui.toast("Share failed — use Export instead");
      }
    });
  }
  if (restoreBtn) {
    restoreBtn.addEventListener("click", importSave);
  }
  if (replayTutBtn) {
    replayTutBtn.addEventListener("click", async function () {
      var ok = await ui.confirm(
        "Replay tutorial?",
        "The onboarding will show again on your next fresh run. Your current run and progress stay untouched.",
        "Enable",
      );
      if (!ok) return;
      store.data.seen.tutorial = false;
      store.save("tutorial-replay");
      ui.toast("Tutorial queued for your next fresh run", "good", 2800);
    });
  }
})();
// 2.4.0: say once that the retired weapons of an old save were converted.
function rlRetireToast() {
  const note = RL_RETIRE_NOTE;
  if (!note || !note.names.length) return;
  set_RL_RETIRE_NOTE(null);
  ui.toast(
    `The arsenal is down to 7 weapons: ${note.names.join(", ")} became the weapon ${note.names.length > 1 ? "they were variants" : "it was a variant"} of${note.refund ? `, +${formatCount(note.refund)} shards refunded` : ""}.`,
    "good",
    9000,
  );
  store.save("retire");
}

/* ---- 2.2.3 (the run monitor hooks are in game.startRun, game.endRun and game.endless) ---- */
(() => {
  // Touch ghost-click shield: after a touch activation the browser still sends a
  // compatibility click to whatever is under the finger NOW — often a button on
  // the next screen, a settings toggle or a workshop "buy". Drop that one click
  // in the capture phase, before any handler (guarded or plain) can see it.
  document.addEventListener(
    "click",
    (ev) => {
      const guard = RL_TOUCH_CLICK_GUARD;
      if (!guard.until) return;
      if (performance.now() > guard.until) {
        guard.until = 0;
        guard.key = "";
        return;
      }
      const dx = ev.clientX - guard.x,
        dy = ev.clientY - guard.y;
      if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= 36) {
        guard.until = 0;
        guard.key = "";
        RL_RT.uiGuardDrops++;
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    },
    true,
  );
})();
/* ==========================================================================
 Riftline 2.4.2: bug fixes and quality of life
 - a run that is already lost (or won) is settled when the page is hidden, so a reload in
   the 1.5 s before the game-over screen no longer brings the run back
 - letters are read by their position on the keyboard (e.code), so W A S D, E, Q and F sit in
   the same place on every layout (on AZERTY, Q moved left and fired the Nova as well)
 - upgrade choice: keys 1–4 pick a card, R rerolls
 - Esc goes back in Workshop, Records and Settings
 - Settings can be opened from the pause menu (without backup and reset)
 - the build in the pause menu explains each upgrade on tap or click
 - optional run timer and FPS counter in the HUD
 ========================================================================== */
(() => {
  // ---- settle a lost or won run before the page goes away
  const settle = () => {
    const world = game.world;
    if (!(game.mode !== "game" || !world || game.overShown || (world.state !== "dead" && world.state !== "victory"))) {
      game.endRun(world.state === "victory");
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      settle();
    }
  });
  window.addEventListener("pagehide", settle);

  // ---- Esc (the key handling itself is in input.onPause)

  // ---- settings from the pause menu
  ui.click(getById("pauseSetBtn"), () => ui.openPauseSettings());

  // ---- what each upgrade of the build does (pause menu)
  const info = getById("pauseUpInfo"),
    upInfo = (id, lv) => {
      const upgrade = upgradesById[id];
      if (!upgrade) return "";
      const tag = upgrade.evo ? "EVOLUTION" : upgrade.repeat ? `\xD7${lv}` : `LV ${lv}/${upgrade.max}`;
      return `<b>${escapeHtml(upgrade.name)}</b> <span class="lv">${tag}</span><p>${escapeHtml(upgrade.desc(Math.max(0, lv - 1)))}</p>`;
    };
  getById("pauseBuild").addEventListener("click", (ev) => {
    const button = ev.target.closest && ev.target.closest("[data-up]"),
      world = game.world;
    if (!button || !world) return;
    for (const el of getById("pauseBuild").querySelectorAll("[data-up]")) el.classList.toggle("sel", el === button);
    info.innerHTML = upInfo(button.dataset.up, world.up[button.dataset.up] || 0);
  });

  // ---- run timer and FPS counter
  for (const [id, key] of [
    ["setTimer", "timer"],
    ["setFps", "fps"],
  ])
    getById(id).addEventListener("change", () => {
      store.data.settings[key] = getById(id).checked;
      game.settingsChanged();
    });
})();
applySettings();
ui.show("home");
setTimeout(rlRetireToast, 700);
setTimeout(() => rlRunHealth({ context: "startup" }).catch((err) => logError("health", err)), 900);
if (renderer) {
  startLoop();
} else {
  elementById("playBtn").disabled = true;
  elementById("continueBtn").disabled = true;
  elementById("playBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play.";
  elementById("continueBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play.";
  ui.toast(
    "3D graphics unavailable. The menu remains usable; enable hardware acceleration and reload to play.",
    "warn",
    9000,
  );
}
// 2.4.6: no "New version ready" bar any more. A downloaded update is applied on its own when no run
// is going on: right away while the game is still starting (that is the next opening), otherwise
// as soon as the player is back in the menu after a run or hides the page while in the menu. A
// run is never interrupted; the page only reloads when the player is not playing.
const rlBootAt = performance.now();
function rlApplyUpdateWhenIdle(why) {
  if (!game.pendingUpdate || game.mode !== "menu" || game.world) return;
  if (why === "found" && performance.now() - rlBootAt > 10e3) return; // not while someone is looking
  const apply = game.pendingUpdate;
  game.pendingUpdate = null;
  store.save("update");
  apply();
}
registerServiceWorker((apply) => {
  game.pendingUpdate = apply;
  rlApplyUpdateWhenIdle("found");
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    rlApplyUpdateWhenIdle("hidden");
  }
});
// Test interface for the scripts in tests/. The keys are the readable names of the values (they
// were the short names of the old minified bundle until the test-interface refactor).
window.__riftTest = {
  selftest: rlSelfTest,
  health: rlRunHealth,
  World,
  computeStats,
  buildLayout,
  updateEnemy,
  hitsObstacle,
  isConnected,
  rlUiButtonGuardSelfTest,
  GameUI,
  RL_TOUCH_CLICK_GUARD,
  weaponDefs,
  enemyDefs,
  biomeList,
  biomesById,
  upgradesById,
  workshopModules,
  get RL_HEALTH() {
    return RL_HEALTH;
  },
  get game() {
    return game;
  },
  get ui() {
    return ui;
  },
  get store() {
    return store;
  },
  get renderer() {
    return renderer;
  },
  get lastRunAudit() {
    return RL_LAST_RUN_AUDIT;
  },
  get monitor() {
    return RL_MON;
  },
  get data() {
    return {
      upgradeList,
      weaponOrder,
      enemyOrder,
      spawnWeights,
      heavyEnemies,
      obstacleShapes,
      mapTemplates,
      biomeVariants,
      iconPaths,
      milestones,
      threatLevels,
      bossDefs,
      bossOrder,
      bossByWave,
      waveEvents,
      workshopModules,
      musicChords,
      musicVoices,
      weaponRange,
      threatMods,
      defaultSettings,
      newSave,
      cleanRun,
      rlShotSfx,
      RL_ENEMY_TIPS,
      RL_MESH_TYPES,
      RL_BIOME_HAZARD,
      RL_KITERS,
      rlPaletteIssues,
      rlBiomeDistinct,
      rlSanitizeHistory,
      RL_EVENT_KINDS,
    };
  },
};

/* ==========================================================================
   2.5.0 B: workshop merge notice and the events of the new modules
   ========================================================================== */
// Say once that merged workshop modules were refunded (after start-up, or after importing an old
// save). Saving right away stores the converted save, so the notice does not come back.
function rlModuleToast() {
  const note = RL_MODULE_NOTE;
  if (!note || !note.names.length) return;
  set_RL_MODULE_NOTE(null);
  ui.toast(
    `Workshop update: ${note.names.join(", ")} ${note.names.length > 1 ? "were" : "was"} merged into ${note.into.join(" and ")}. All ${note.names.length > 1 ? "their" : "its"} levels refunded: +${formatCount(note.refund)} shards.`,
    "good",
    9000,
  );
  store.save("modules");
}
setTimeout(rlModuleToast, 1100);
store.onChange((json, why) => {
  if (why === "import" && RL_MODULE_NOTE) {
    setTimeout(rlModuleToast, 300);
  }
});
window.__riftTest.v250B = { migrateModules: rlMigrateModules };

export { ui, store, game, safeAreaInsets, input, renderer };
