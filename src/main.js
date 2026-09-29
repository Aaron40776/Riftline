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
  buildReport,
  logError,
} from "./core/diagnostics.js";
import {
  GameUI,
  RL_TOUCH_CLICK_GUARD,
  getById,
  rlBiomeTitle,
  iconPaths,
  escapeHtml,
} from "./ui/ui.js";
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
import { RL_KITERS, updateEnemy, rlInstallHunt } from "./core/ai.js";
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
function rlIntroEvents(w) {
  if (game.tut) return; // the tutorial coach owns the screen on the first run
  for (const ev of w.fx) {
    if (
      (ev.k === "spawn" || ev.k === "champion") &&
      RL_ENEMY_TIPS[ev.type] &&
      !store.data.seen["enemy_" + ev.type] &&
      !RL_INTRO.queue.includes(ev.type)
    )
      RL_INTRO.queue.push(ev.type);
  }
  const now = performance.now();
  if (RL_INTRO.queue.length && now - RL_INTRO.last > 6500 && w.state === "fight") {
    const t = RL_INTRO.queue.shift(),
      seen = store.data.seen;
    seen["enemy_" + t] = !0;
    t === "mender" && (seen.tip_mender = !0);
    store.save("intro");
    RL_INTRO.last = now;
    ui.toast(`NEW · ${enemyDefs[t].name.toUpperCase()} — ${RL_ENEMY_TIPS[t]}`, "intro", 6200);
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
  const mod = (id) => workshopModules.find((a) => a.id === id);
  mod("droneBay").desc = "+1 Wingman slot per level (needs the Wingman upgrade)";
  // 2.5.0 B: Nova Cell's text lives with its data; Rift Battery and Reactor Core were merged into it.
  // Route Scanner referenced a "map" icon that did not exist (fell back to "info"); Field Supply uses it now.
  iconPaths.map = '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>';
  rlApplyBiomeFixes();
}
var isStandaloneBuild = !0;
var isIOSDevice =
  typeof navigator < "u" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
var isInstalledPwa =
  typeof window < "u" &&
  ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === !0);
function registerServiceWorker(i) {
  !isStandaloneBuild ||
    !("serviceWorker" in navigator) ||
    (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") ||
    (navigator.serviceWorker
      .register("./sw.js", { scope: "./", updateViaCache: "none" })
      .then((t) => {
        let e = !!navigator.serviceWorker.controller,
          n = (r) => {
            !r ||
              !navigator.serviceWorker.controller ||
              i(() => {
                let a = !1,
                  o = () => {
                    a || ((a = !0), location.reload());
                  };
                (navigator.serviceWorker.addEventListener("controllerchange", o),
                  r.postMessage("skipWaiting"),
                  setTimeout(o, 4e3));
              });
          };
        (t.waiting && e && n(t.waiting),
          t.addEventListener("updatefound", () => {
            let r = t.installing;
            r &&
              r.addEventListener("statechange", () => {
                r.state === "installed" && n(r);
              });
          }));
        let s = () => t.update().catch(() => {});
        (document.addEventListener("visibilitychange", () => {
          document.visibilityState === "visible" && s();
        }),
          window.addEventListener("online", s),
          setInterval(s, 900 * 1e3));
      })
      .catch((t) => logError("sw", t)),
    navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}));
}
var wakeLockSentinel = null,
  wakeLockWanted = !1;
async function setWakeLock(i) {
  wakeLockWanted = i;
  try {
    i && !wakeLockSentinel && navigator.wakeLock && document.visibilityState === "visible"
      ? ((wakeLockSentinel = await navigator.wakeLock.request("screen")),
        wakeLockSentinel.addEventListener("release", () => {
          wakeLockSentinel = null;
        }))
      : !i && wakeLockSentinel && (await wakeLockSentinel.release(), (wakeLockSentinel = null));
  } catch {
    wakeLockSentinel = null;
  }
}
typeof document < "u" &&
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "visible" && wakeLockWanted && setWakeLock(!0);
  });
var noJsNotice = document.getElementById("nojs");
noJsNotice && noJsNotice.remove();
setLogContext({ version: GAME_VERSION, build: BUILD_ID, mode: isStandaloneBuild ? "standalone" : "artifact" });
var qualityPresets = {
    high: { dpr: 2, particles: 1400, fps: 0 },
    battery: { dpr: 1, particles: 500, fps: 30 },
    auto: { dpr: 1.5, particles: 1400, fps: 0 },
  },
  store = (rlApplyDataFixes(), new SaveStore()),
  sound = new SoundEngine(),
  elementById = (i) => document.getElementById(i),
  renderer = null;
try {
  renderer = new Renderer(elementById("gl"), { dpr: 1.5 });
  let i = renderer.renderer.getContext(),
    t = i.getExtension("WEBGL_debug_renderer_info");
  setLogContext({ gpu: t ? i.getParameter(t.UNMASKED_RENDERER_WEBGL) : "n/a" });
} catch (i) {
  logError("webgl", i);
}
elementById("gl").addEventListener("webglcontextlost", () => logError("webgl", "context lost"));
elementById("gl").addEventListener("webglcontextrestored", () => logError("webgl", "context restored"));
let _resizeRaf = 0,
  _resizeWhy = "resize",
  _resizeFollowTimer = 0;
function _resetInputForViewportChange() {
  try {
    input && (input.move.active || input.aim.active) && input.reset();
  } catch (t) {
    logError("input-reset", t);
  }
}
function _scheduleResize(i) {
  ((_resizeWhy = i),
    _resizeRaf ||
      (_resizeRaf = requestAnimationFrame(() => {
        _resizeRaf = 0;
        try {
          renderer && renderer.resize(!0);
        } catch (t) {
          logError(_resizeWhy, t);
        }
      })));
}
window.addEventListener(
  "resize",
  () => {
    (_resetInputForViewportChange(), _scheduleResize("resize"));
  },
  { passive: !0 },
);
window.addEventListener(
  "orientationchange",
  () => {
    (_resetInputForViewportChange(),
      _scheduleResize("orientation"),
      clearTimeout(_resizeFollowTimer),
      (_resizeFollowTimer = setTimeout(() => {
        ((_resizeFollowTimer = 0), _scheduleResize("orientation-follow"));
      }, 120)));
  },
  { passive: !0 },
);
window.visualViewport &&
  window.visualViewport.addEventListener(
    "resize",
    () => {
      (_resetInputForViewportChange(), _scheduleResize("viewport"));
    },
    { passive: !0 },
  );
var overlay = new Overlay(elementById("ov")),
  input = new Input(elementById("touch"), renderer),
  game = {
    store: store,
    sound: sound,
    input: input,
    renderer: renderer,
    mode: "menu",
    world: null,
    paused: !1,
    previewW: store.data.weapon,
    buildId: BUILD_ID,
    chooseShown: !1,
    overShown: !1,
    slowMo: 0,
    pendingUpdate: null,
    cloud: null,
    startRun({ resume: i }) {
      let t = store.data,
        e = i ? t.run : null;
      i || t.stats.runs++;
      try {
        this.world = new World({
          seed: (Math.random() * 4294967296) >>> 0,
          weapon: t.weapon,
          threat: t.threat,
          ws: t.workshop,
          snap: e,
        });
      } catch (n) {
        (logError("start", n),
          (t.run = null),
          store.save("bad-run"),
          ui.alert("Could not start", "The saved run could not be restored and was discarded."));
        return;
      }
      ((this.mode = "game"),
        (this.paused = !1),
        (this.chooseShown = !1),
        (this.overShown = !1),
        (this.acc = 0),
        (this.slowMo = 0),
        (this.intro = null),
        (RL_RT.runStartMs = Date.now()),
        (RL_RT.runErrorSnapshot = errorLog.map((e) => `${e.where}|${e.msg}|${e.n}`)),
        renderer && renderer.focusOn(null),
        (this.hintT = 0),
        ui.hideMenus(),
        ui.hideOver(),
        ui.hideChoose(),
        ui.hidePause(),
        ui.hideCrash(),
        ui.showHud(!0),
        input.reset(),
        (input.enabled = !0),
        (game.freeze = 0),
        (game.tut =
          !store.data.seen.tutorial && !i && this.world.wave === 1
            ? { step: 0, t: 0, moved: 0, kills: 0, dashed: !1 }
            : null),
        game.tut && (this.world.hold = !0),
        ui.coach(null),
        renderer && renderer.resetCamera(),
        sound.setMusic("fight", this.world.biomeFor(this.world.wave).id),
        setWakeLock(!0));
    },
    choose(i) {
      let t = this.world;
      !t || !t.choose(i) || ((this.chooseShown = !1), ui.hideChoose(), input.reset());
    },
    reroll() {
      let i = this.world;
      i && i.reroll() && (ui.renderCards(i), sound.play("pick"), (store.data.run = i.snapshot()), store.save("reroll"));
    },
    pause() {
      let i = this.world;
      this.mode !== "game" ||
        !i ||
        this.paused ||
        this.overShown ||
        (i.state !== "fight" && i.state !== "cleared") ||
        ((this.paused = !0),
        input.reset(),
        ui.showPause(i),
        sound.setMusic("menu"),
        store.save("pause"),
        setWakeLock(!1));
    },
    resume() {
      this.paused &&
        ((this.paused = !1),
        ui.hidePause(),
        input.reset(),
        (this.last = performance.now()),
        setWakeLock(!0),
        this.world && sound.setMusic(this.world.boss ? "boss" : "fight", this.world.biomeFor(this.world.wave).id));
    },
    restart() {
      (ui.hidePause(), (this.paused = !1), this.endRun(!1, !0, !0), this.startRun({}));
    },
    abandon() {
      (ui.hidePause(), (this.paused = !1), this.endRun(!1, !0));
    },
    endless() {
      let i = this.world;
      !i ||
        i.state !== "victory" ||
        (ui.hideOver(),
        (this.overShown = !1),
        (i.shards = 0),
        (i.kills = 0),
        (i.bossKills = []),
        (i.legendaries = 0),
        (i.flawless = 0),
        (i.time = 0),
        (i.evolved = 0),
        (i.dmgSrc = {}),
        i.continueEndless(),
        ui.showHud(!0),
        (this.chooseShown = !1));
    },
    goHome() {
      ((this.mode = "menu"),
        (this.world = null),
        (this.paused = !1),
        ui.hideOver(),
        ui.hideChoose(),
        ui.hidePause(),
        ui.showHud(!1),
        (ui.homeInit = !1),
        ui.show("home"),
        sound.setMusic("menu"),
        setWakeLock(!1),
        rlApplyUpdateWhenIdle("home"));
    },
    discardRun() {
      ((store.data.run = null), store.save("discard"));
    },
    recover() {
      (ui.hideCrash(), (this.crashed = !1), this.goHome(), startLoop());
    },
    endRun(i, t = !1, e = !1) {
      let n = this.world,
        s = store.data,
        r = s.stats;
      if (!n || this.overShown) return;
      this.overShown = !0;
      rlRunAudit(n, i, t);
      let a = threatMods(n.threat),
        o = 1 + 0.1 * (s.workshop.salvage || 0),
        c = n.shards,
        h = i ? Math.round(c * 0.25) : 0,
        l = Math.round((c + h) * a.shards * o),
        u = [["Collected", c]];
      (h && u.push(["Clear bonus +25%", "+" + h]),
        n.threat > 0 && u.push([`${threatLevels[n.threat].name} \xD7${a.shards.toFixed(2)}`, "\xD7"]),
        o > 1 && u.push([`Salvager \xD7${o.toFixed(1)}`, "\xD7"]));
      let d = new Set(this.claimable()),
        f = [],
        p = i ? 20 : n.wave,
        x = p > r.bestWave,
        y = i && !n.endless && n.time > 0 && (r.bestTime <= 0 || n.time < r.bestTime);
      ((r.bestWave = Math.max(r.bestWave, p)),
        y && (r.bestTime = n.time),
        (r.bestBy[n.weapon] = Math.max(r.bestBy[n.weapon] || 0, p)),
        (r.kills += n.kills),
        (r.playTime += n.time),
        (r.shardsEarned += l),
        (r.legendaries += n.legendaries),
        (r.flawless += n.flawless),
        (r.evolved += n.evolved),
        (r.bestCombo = Math.max(r.bestCombo, n.bestCombo)));
      for (let g of n.bossKills) r.bosses[g] = (r.bosses[g] || 0) + 1;
      (i && !n.endless
        ? (r.clears++,
          (r.clearsBy[n.weapon] = (r.clearsBy[n.weapon] || 0) + 1),
          (r.bestClearThreat = Math.max(r.bestClearThreat, n.threat)),
          n.threat >= s.threatMax &&
            s.threatMax < 5 &&
            ((s.threatMax = n.threat + 1), f.push(`${threatLevels[s.threatMax].name} unlocked`)))
        : (r.deaths += t ? 0 : 1),
        (s.shards += l),
        (s.run = null),
        store.save("run-end"));
      let m = this.claimable()
        .filter((g) => !d.has(g))
        .map((g) => milestones.find((M) => M.id === g).name);
      if (
        (game.tut && ((store.data.seen.tutorial = !0), (game.tut = null), ui.coach(null), store.save("tutorial")), e)
      ) {
        this.overShown = !1;
        return;
      }
      (ui.showHud(!1),
        ui.hideChoose(),
        ui.showOver({
          win: i,
          abandoned: t,
          wave: p,
          time: n.time,
          kills: n.kills,
          bosses: n.bossKills.length,
          weapon: n.weapon,
          threat: n.threat,
          rows: u,
          total: l,
          best: x,
          milestones: m,
          unlocks: f,
          canEndless: i && !n.endless,
          killer: i || t ? null : n.lastHit,
          dmgSrc: n.dmgSrc,
          weaponName: weaponDefs[n.weapon].name,
          fastest: y,
        }),
        sound.setMusic("menu"),
        setWakeLock(!1));
    },
    settingsChanged(i) {
      (applySettings(), i || store.save("settings"));
    },
    resetProgress() {
      (store.reset(), afterProgressReset("Progress reset"));
    },
    claimable() {
      let i = store.data;
      return milestones.filter((t) => !i.milestones[t.id] && t.test(i)).map((t) => t.id);
    },
    previewWeapon(i) {
      this.previewW = i;
    },
  };
game.qualityNote = () => {
  let i = store.data.settings,
    t = renderer ? renderer.dpr.toFixed(2).replace(/0$/, "") : "-";
  return i.quality === "auto"
    ? `Adapts to your device (now ${t}\xD7)`
    : i.quality === "battery"
      ? "Lower resolution, 30 fps"
      : `Sharpest (${t}\xD7)`;
};
function afterProgressReset(i) {
  ((ui.homeInit = !1), applySettings(), ui.screen === "settings" && ui.renderSettings(), ui.toast(i));
}
var ui = new GameUI(game);
game.ui = ui;
input.onBlur = () => {
  game.mode === "game" && game.pause();
};
input.isPlaying = () => game.mode === "game" && !game.paused && !game.chooseShown && !game.overShown;
input.onPause = () => {
  if (!document.getElementById("dialog").hidden) {
    ui.closeDialog(null);
    return;
  }
  game.mode === "game" && (game.paused ? game.resume() : game.pause());
};
var qualityPreset = qualityPresets.auto,
  autoDpr = 1.5;
function applySettings() {
  let i = store.data.settings;
  if (
    (sound.setVolumes(i.sfx, i.music),
    (input.swap = i.swap),
    ui.setSwap(i.swap),
    (qualityPreset = qualityPresets[i.quality] || qualityPresets.auto),
    (overlay.contrast = i.contrast),
    (ui.calm = i.calm),
    renderer)
  ) {
    (renderer.setAccess(i.contrast, i.calm), (renderer.zoom = i.zoom || 1));
    let t = i.quality === "auto" ? autoDpr : qualityPreset.dpr;
    renderer.setQuality(t, qualityPreset.particles);
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
  loopFrameId || ((game.last = performance.now()), (loopFrameId = requestAnimationFrame(loopTick)));
}
function loopTick(i) {
  loopFrameId = requestAnimationFrame(loopTick);
  let t = (i - (game.last || i)) / 1e3;
  if (!(qualityPreset.fps && t < 1 / qualityPreset.fps - 0.004)) {
    ((game.last = i), (t = Math.min(0.1, Math.max(0, t))));
    try {
      const w0 = performance.now();
      (runFrame(t), (frameErrorCount = 0));
      if (RL_MON)
        try {
          rlMonFrame(performance.now() - w0);
        } catch {}
    } catch (e) {
      (frameErrorCount++,
        logError("frame", e),
        frameErrorCount >= 3 &&
          (cancelAnimationFrame(loopFrameId),
          (loopFrameId = 0),
          (game.crashed = !0),
          setWakeLock(!1),
          rlMonCrashed(),
          ui.showCrash(buildReport())));
    }
  }
}
function runFrame(i) {
  let t = store.data.settings,
    e = game.world;
  if (game.mode === "game" && e) {
    if (!game.paused && document.visibilityState !== "hidden") {
      let n = game.slowMo > 0 ? 0.35 : 1;
      game.slowMo = Math.max(0, game.slowMo - i);
      let s = game.speed || 1;
      game.intro ? updateBossIntro(i, e) : game.freeze > 0 ? (game.freeze -= i) : (game.acc += i * n * s);
      let r = 0,
        a = 5 * s;
      for (; game.acc >= rlStep && r < a; ) (e.step(rlStep, input.sample(e, t)), (game.acc -= rlStep), r++);
      (r >= a && (game.acc = 0),
        handleWorldEvents(e),
        rlIntroEvents(e),
        updateTutorial(i, e),
        updateHeartbeat(i, e),
        sound.setIntensity(
          e.state === "fight"
            ? e.enemies.length / 34 +
                e.eb.length / 90 +
                (e.boss ? 0.4 : 0) +
                (e.player.hp / e.stats.maxHp < 0.3 ? 0.2 : 0)
            : 0,
        ),
        updateAutoQuality(i, t));
    }
    if (game.paused) return;
    if (renderer) {
      (renderer.consume(e.fx, e, t), renderer.mapChanged && ((renderer.mapChanged = !1), sound.play("rumble")));
      let n = game.chooseShown || game.overShown;
      (!n || (dimFrameCounter = (dimFrameCounter + 1) % 3) === 0) && renderer.frame(n ? i * 3 : i, e);
    }
    if ((sound.consume(e.fx), (e.fx.length = 0), renderer && !(game.chooseShown || game.overShown))) {
      // 2.3.6: the "DRAG HERE TO MOVE" hints follow the input in use (like the coach texts since
      // 2.3.4); on a laptop with a touch screen they showed while playing with keys and mouse.
      let n = !!game.tut && game.tut.step <= 1 && RL_INPUT.touch;
      overlay.draw(renderer, e, input, { hints: n, dt: i, safe: safeAreaInsets() });
    } else overlay.clear();
    (ui.hud(e),
      e.state === "choose" &&
        !game.chooseShown &&
        !game.overShown &&
        ((game.chooseShown = !0), input.reset(), ui.showChoose(e)),
      e.state === "dead" && e.stateT > 1.5 && !game.overShown && game.endRun(!1),
      e.state === "victory" && e.stateT > 0.8 && !game.overShown && game.endRun(!0));
  } else
    (renderer &&
      (menuFrame = (menuFrame + 1) & 1) === 0 &&
      renderer.frame(i, null, { menu: !0, weapon: game.previewW, biome: biomeList[menuBiomeIndex()] }),
      overlay.clear());
}
function menuBiomeIndex() {
  let i = store.data.stats.bestWave;
  return Math.min(biomeList.length - 1, Math.floor(Math.max(0, i - 1) / 5));
}
function handleWorldEvents(i) {
  for (let t of i.fx)
    switch (t.k) {
      case "wave": {
        ((store.data.run = i.snapshot()), store.save("wave"));
        let e = i.biomeFor(t.n);
        renderer && renderer.resetCamera();
        let n = t.n === 1 || i.biomeFor(t.n - 1).id !== e.id;
        if (t.event) {
          let s = waveEvents[t.event];
          (ui.banner(s.name, `Wave ${t.n} \xB7 ${s.desc}`, "good", 2600), sound.play("event"));
        } else
          ui.banner(
            t.boss ? "WARNING" : `WAVE ${t.n}`,
            t.boss ? "Boss signature detected" : n ? rlBiomeTitle(e) : i.endless ? "Endless" : "",
            t.boss ? "boss" : "",
            2e3,
          );
        (!t.boss &&
          i.arena.vents.length &&
          showTipOnce("lava", "Lava vents glow before they erupt. Lure enemies onto them \u2014 they burn too."),
          !t.boss &&
            i.arena.ice.length &&
            showTipOnce(
              "ice",
              "Cryo Vault: the whole floor is slick, the ice sheets even more \u2014 enemies slide on them too.",
            ),
          !t.boss &&
            i.arena.acid.length &&
            showTipOnce(
              "acid",
              "Acid pools eat at your hull \u2014 but enemies standing in them take 25% more damage.",
            ),
          !t.boss &&
            i.arena.portals.length &&
            showTipOnce("portal", "Portals move you across the arena. Shots fly through them too."),
          sound.setMusic(t.boss ? "boss" : "fight", e.id),
          t.n === 2 &&
            showTipOnce(
              "dash",
              rlKeys()
                ? "Tip: SPACE dashes \u2014 it makes you untouchable for a moment."
                : "Tip: DASH makes you untouchable for a moment.",
            ),
          t.n === 3 &&
            showTipOnce(
              "aim",
              rlKeys()
                ? "Tip: hold the left mouse button to aim and fire at the cursor."
                : `Tip: drag the ${touchSides().aim} side to aim yourself. Holding it fires at the nearest enemy.`,
            ));
        break;
      }
      case "boss":
        (ui.banner(t.name, t.title, "boss", 2600),
          showTipOnce("boss", "Bosses telegraph every attack. Marked zones and lines hit hard \u2014 move out."),
          i.boss && renderer && ((game.intro = { t: 0 }), renderer.focusOn(i.boss.x, i.boss.y), input.settle()));
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
        (ui.banner(t.boss ? "BOSS DOWN" : "CLEARED", t.flawless ? "Flawless" : `Wave ${t.n}`, "good", 1500),
          t.boss || (game.slowMo = Math.max(game.slowMo, 0.45)));
        break;
      case "hurt":
        t.chip || (ui.hurtFlash(), overlay.addHurt(i, t.sx, t.sy), hitStop(0.06));
        break;
      case "champion":
        (ui.banner(
          "CHAMPION",
          `A ${enemyDefs[t.type].name} leads the pack \u2014 its allies move faster`,
          "warn",
          2200,
        ),
          showTipOnce("champion", "Champions rally nearby enemies. Take one down and the pack is stunned."));
        break;
      case "championDown":
        (ui.banner("CHAMPION DOWN", "The pack is stunned", "good", 1400),
          (game.slowMo = Math.max(game.slowMo, 0.5)),
          hitStop(0.08));
        break;
      case "mend":
        showTipOnce("mender", "Menders heal other enemies. Kill them first.");
        break;
      case "kill":
        (t.elite || t.r >= 0.8) && hitStop(t.elite ? 0.05 : 0.025);
        break;
      case "nova":
        hitStop(0.08);
        break;
      case "guardBreak":
        hitStop(0.03);
        break;
      case "bossAtk":
        overlay.callout(t.atk);
        break;
      case "offer":
        ((store.data.run = i.snapshot()), store.save("offer"));
        break;
      case "combo":
        ui.comboPop(t.n, t.bonus);
        break;
      case "bountyPulse":
        ui.toast(`BOUNTY · +${t.amount} shards`, "good", 1500);
        break;
      case "pick":
        t.evo && ui.banner("EVOLVED", upgradesById[t.id].name, "good", 1800);
        break;
      case "dash":
        game.tut && (game.tut.dashed = !0);
        break;
      case "enrage":
        ui.banner("ENRAGED", "", "warn", 1400);
        break;
      case "phase":
        ui.banner(`PHASE ${t.n}`, "The core adapts", "warn", 1600);
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
}
var BOSS_INTRO_TIME = 1.5;
function updateBossIntro(i, t) {
  let e = game.intro;
  ((e.t += i),
    renderer && (renderer.focusK = e.t / BOSS_INTRO_TIME),
    (e.t >= BOSS_INTRO_TIME || !t.boss) &&
      ((game.intro = null),
      renderer && renderer.focusOn(null),
      t.boss && (t.boss.spawnT = Math.min(t.boss.spawnT, 0.1)),
      input.settle(),
      (game.acc = 0)));
}
function hitStop(i) {
  let t = performance.now();
  t - (game.lastStop || 0) < 180 || ((game.lastStop = t), (game.freeze = Math.max(game.freeze || 0, i)));
}
var heartbeatTimer = 0;
function updateHeartbeat(i, t) {
  let e = t.player;
  if (t.state !== "fight" || !e.alive || e.hp / t.stats.maxHp >= 0.25) {
    heartbeatTimer = 0;
    return;
  }
  ((heartbeatTimer -= i), heartbeatTimer <= 0 && ((heartbeatTimer = 0.95), sound.play("heart")));
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
function updateTutorial(i, t) {
  let e = game.tut;
  if (e) {
    if (
      ((e.t += i),
      e.step === 0
        ? (Math.hypot(t.player.vx, t.player.vy) > 2 && (e.moved += i),
          (e.moved > 1.1 || e.t > 12) && ((e.step = 1), (e.t = 0), (t.hold = !1), (e.k0 = t.kills)))
        : e.step === 1
          ? (t.kills - e.k0 >= 4 || e.t > 20) && ((e.step = 2), (e.t = 0), (e.dashed = !1))
          : e.step === 2
            ? (e.dashed || e.t > 14) && ((e.step = 3), (e.t = 0))
            : e.step === 3 && e.t > 5 && (e.step = 4),
      e.step >= 4 || t.state !== "fight")
    ) {
      ((game.tut = null), (t.hold = !1), ui.coach(null));
      let n = store.data.seen;
      ((n.tutorial = !0), (n.tip_dash = !0), (n.tip_aim = !0), store.save("tutorial"));
      return;
    }
    ui.coach(e.step, tutorialTexts.length, tutorialTexts[e.step]());
  }
}
function showTipOnce(i, t) {
  let e = store.data.seen;
  e["tip_" + i] || ((e["tip_" + i] = !0), store.save("tip"), ui.toast(t, "", 5200));
}
// 2.4.2: Auto quality also steps back up. Before, two slow windows (a stutter at the start of
// a run is enough) lowered the resolution until the next reload. It now rises again one step
// after 20 s at 57+ fps. A level it had to leave twice becomes the ceiling for the session, so
// a device at its limit does not flip between two levels.
let rlQUp = 0,
  rlQCeil = 1.5;
const rlQLeft = {},
  rlQParticles = (d) => (d >= 1.5 ? qualityPreset.particles : d <= 1 ? 800 : 1100);
function updateAutoQuality(i, t) {
  if (t.quality !== "auto" || !renderer || ((fpsWindowTime += i), fpsWindowFrames++, fpsWindowTime < 2.5)) return;
  let e = fpsWindowFrames / fpsWindowTime;
  ((fpsWindowTime = 0),
    (fpsWindowFrames = 0),
    e < 48 ? slowWindowCount++ : (slowWindowCount = Math.max(0, slowWindowCount - 1)),
    (rlQUp = e >= 57 ? rlQUp + 1 : 0));
  if (slowWindowCount >= 2 && autoDpr > 1) {
    (rlQLeft[autoDpr] && (rlQCeil = Math.min(rlQCeil, autoDpr - 0.25)), (rlQLeft[autoDpr] = !0));
    ((autoDpr = Math.max(1, autoDpr - 0.25)),
      (slowWindowCount = 0),
      (rlQUp = 0),
      renderer.setQuality(autoDpr, rlQParticles(autoDpr)));
  } else if (rlQUp >= 8 && autoDpr + 0.25 <= rlQCeil) {
    ((autoDpr += 0.25), (rlQUp = 0), (slowWindowCount = 0), renderer.setQuality(autoDpr, rlQParticles(autoDpr)));
  }
}
function safeAreaInsets() {
  let i = getComputedStyle(document.documentElement),
    t = (e) => parseFloat(i.getPropertyValue(e)) || 0;
  return { t: t("--st"), b: t("--sb"), l: t("--sl"), r: t("--sr") };
}
document.addEventListener("visibilitychange", () => {
  document.visibilityState === "hidden"
    ? (game.mode === "game" && game.pause(), store.save("hidden"), sound.suspend())
    : (sound.resume(), (game.last = performance.now()));
});
window.addEventListener("pagehide", () => {
  (input.reset(!0), store.save("pagehide"));
});
window.addEventListener("pageshow", () => {
  (input.reset(!0), _scheduleResize("pageshow"));
});
var unlockAudio = () => {
  (sound.unlock(), sound.mode === "off" && game.mode === "menu" && sound.setMusic("menu"));
};
for (let i of ["pointerdown", "keydown", "click"])
  document.addEventListener(i, unlockAudio, { capture: !0, passive: !0 });
document.addEventListener("gesturestart", (i) => i.preventDefault());
document.addEventListener("dblclick", (i) => i.preventDefault(), { passive: !1 });
document.addEventListener(
  "touchmove",
  (i) => {
    let t = i.target;
    (t && t.closest && t.closest(".scroll, .cards, .center-col, textarea, input, .log")) || i.preventDefault();
  },
  { passive: !1 },
);

/* v1.6.0 merged polish: persistent run metrics + save backup + tutorial replay */
(function () {
  var __showOver = ui.showOver.bind(ui);
  ui.showOver = function (t) {
    __showOver(t);
    var e = getById("overExtra"),
      r = this.g && this.g._runExtra;
    if (!e) return;
    if (!r) {
      e.hidden = true;
      return;
    }
    e.hidden = false;
    e.innerHTML =
      '<div class="dh">Run performance</div><div class="run-extra-grid">' +
      [
        ["Damage dealt", formatCount(Math.round(r.dmgDealt || 0))],
        ["Damage taken", formatCount(Math.round(r.dmgTaken || 0))],
        ["Crits", formatCount(r.critHits || 0)],
        ["Dashes", formatCount(r.dashes || 0)],
        ["Best combo", "×" + formatCount(r.bestCombo || 0)],
      ]
        .map(function (x) {
          return (
            '<div class="xcell"><div class="xk">' +
            escapeHtml(x[0]) +
            '</div><div class="xv num">' +
            escapeHtml(x[1]) +
            "</div></div>"
          );
        })
        .join("") +
      "</div>";
  };
  var __endRun = game.endRun;
  game.endRun = function (win, abandoned, silent) {
    var w = this.world;
    this._runExtra = w
      ? {
          dmgDealt: w.dmgDealt,
          dmgTaken: w.runStats && w.runStats.dmgTaken,
          critHits: w.runStats && w.runStats.critHits,
          dashes: w.runStats && w.runStats.dashes,
          bestCombo: w.bestCombo,
        }
      : null;
    return __endRun.call(this, win, abandoned, silent);
  };
})();
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
  backupBtn && backupBtn.addEventListener("click", exportSave);
  if (shareBtn && !navigator.share) shareBtn.hidden = true;
  shareBtn &&
    shareBtn.addEventListener("click", async function () {
      var value = makeBackup();
      try {
        await navigator.share({ title: "Riftline save", text: value });
        ui.toast("Save shared", "good", 2200);
      } catch (e) {
        if (e && e.name !== "AbortError") ui.toast("Share failed — use Export instead");
      }
    });
  restoreBtn && restoreBtn.addEventListener("click", importSave);
  replayTutBtn &&
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
})();
// 2.4.0: say once that the retired weapons of an old save were converted.
function rlRetireToast() {
  const q = RL_RETIRE_NOTE;
  if (!q || !q.names.length) return;
  set_RL_RETIRE_NOTE(null);
  ui.toast(
    `The arsenal is down to 7 weapons: ${q.names.join(", ")} became the weapon ${q.names.length > 1 ? "they were variants" : "it was a variant"} of${q.refund ? `, +${formatCount(q.refund)} shards refunded` : ""}.`,
    "good",
    9000,
  );
  store.save("retire");
}

/* ---- 2.2.3: run monitor hooks (only the live run's world is observed;
 self-test and snapshot-check worlds are ignored by identity) ---- */
(() => {
  rlInstallHunt();
  const baseStep = World.prototype.step;
  World.prototype.step = function (dt, input) {
    if (!RL_MON || RL_MON.w !== this) return baseStep.call(this, dt, input);
    const n0 = this.fx.length,
      d0 = this.player.dashId,
      s0 = this.shards,
      k0 = this.kills;
    const r = baseStep.call(this, dt, input);
    try {
      rlMonStep(this, n0, d0, s0, k0, dt);
    } catch (e) {
      rlMonIssue("WARN", "monitor", "monitor exception: " + e.message);
    }
    return r;
  };
  const baseWave = World.prototype.startWave;
  World.prototype.startWave = function (wave, nova) {
    const r = baseWave.call(this, wave, nova);
    if (RL_MON && RL_MON.w === this)
      try {
        rlMonBeginWave(this);
      } catch (e) {
        rlMonIssue("WARN", "monitor", "monitor exception: " + e.message);
      }
    return r;
  };
  const baseStart = game.startRun;
  game.startRun = function (o) {
    const r = baseStart.call(this, o);
    try {
      this.world && this.mode === "game" && rlMonStart(this.world, !!(o && o.resume));
    } catch (e) {
      logError("monitor", e);
    }
    return r;
  };
  const baseEnd = game.endRun;
  game.endRun = function (win, abandoned, silent) {
    const w = this.world,
      pre = w && !this.overShown ? rlMonPreEnd(w) : null;
    const r = baseEnd.call(this, win, abandoned, silent);
    if (pre)
      try {
        rlMonFinish(w, pre, !!win, !!abandoned, !!silent, !1);
      } catch (e) {
        logError("audit", e);
      }
    if (pre)
      try {
        rlRecordRun(w, pre, !!win, !!abandoned);
      } catch (e) {
        logError("history", e);
      }
    return r;
  };
  const baseEndless = game.endless;
  game.endless = function () {
    const r = baseEndless.call(this);
    try {
      this.world && this.world.endless && rlMonStart(this.world, !0);
    } catch (e) {
      logError("monitor", e);
    }
    return r;
  };
  // Touch ghost-click shield: after a touch activation the browser still sends a
  // compatibility click to whatever is under the finger NOW — often a button on
  // the next screen, a settings toggle or a workshop "buy". Drop that one click
  // in the capture phase, before any handler (guarded or plain) can see it.
  document.addEventListener(
    "click",
    (e) => {
      const g = RL_TOUCH_CLICK_GUARD;
      if (!g.until) return;
      if (performance.now() > g.until) {
        g.until = 0;
        g.key = "";
        return;
      }
      const dx = e.clientX - g.x,
        dy = e.clientY - g.y;
      if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= 36) {
        g.until = 0;
        g.key = "";
        RL_RT.uiGuardDrops++;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    !0,
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
    const w = game.world;
    game.mode !== "game" ||
      !w ||
      game.overShown ||
      (w.state !== "dead" && w.state !== "victory") ||
      game.endRun(w.state === "victory");
  };
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "hidden" && settle();
  });
  window.addEventListener("pagehide", settle);

  // ---- Esc: back in menu pages; from settings opened in the pause menu back to the pause menu
  const basePause = input.onPause;
  input.onPause = () => {
    if (!getById("dialog").hidden) return basePause();
    if (ui.rlFromPause) return ui.back();
    if (game.mode === "menu") {
      input._rlKey === "escape" && ["workshop", "records", "settings"].includes(ui.screen) && ui.back();
      return;
    }
    basePause();
  };

  // ---- settings from the pause menu
  ui.click(getById("pauseSetBtn"), () => ui.openPauseSettings());

  // ---- what each upgrade of the build does (pause menu)
  const info = getById("pauseUpInfo"),
    upInfo = (id, lv) => {
      const u = upgradesById[id];
      if (!u) return "";
      const tag = u.evo ? "EVOLUTION" : u.repeat ? `\xD7${lv}` : `LV ${lv}/${u.max}`;
      return `<b>${escapeHtml(u.name)}</b> <span class="lv">${tag}</span><p>${escapeHtml(u.desc(Math.max(0, lv - 1)))}</p>`;
    };
  getById("pauseBuild").addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-up]"),
      w = game.world;
    if (!b || !w) return;
    for (const o of getById("pauseBuild").querySelectorAll("[data-up]")) o.classList.toggle("sel", o === b);
    info.innerHTML = upInfo(b.dataset.up, w.up[b.dataset.up] || 0);
  });

  // ---- run timer and FPS counter
  for (const [id, key] of [
    ["setTimer", "timer"],
    ["setFps", "fps"],
  ])
    getById(id).addEventListener("change", () => {
      ((store.data.settings[key] = getById(id).checked), game.settingsChanged());
    });
})();
applySettings();
ui.show("home");
setTimeout(rlRetireToast, 700);
setTimeout(() => rlRunHealth({ context: "startup" }).catch((e) => logError("health", e)), 900);
renderer
  ? startLoop()
  : ((elementById("playBtn").disabled = !0),
    (elementById("continueBtn").disabled = !0),
    (elementById("playBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play."),
    (elementById("continueBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play."),
    ui.toast(
      "3D graphics unavailable. The menu remains usable; enable hardware acceleration and reload to play.",
      "warn",
      9000,
    ));
// 2.4.6: no "New version ready" bar any more. A downloaded update is applied on its own when no run
// is going on: right away while the game is still starting (that is the next opening), otherwise
// as soon as the player is back in the menu after a run or hides the page while in the menu. A
// run is never interrupted; the page only reloads when the player is not playing.
const rlBootAt = performance.now();
function rlApplyUpdateWhenIdle(why) {
  if (!game.pendingUpdate || game.mode !== "menu" || game.world) return;
  if (why === "found" && performance.now() - rlBootAt > 10e3) return; // not while someone is looking
  const apply = game.pendingUpdate;
  ((game.pendingUpdate = null), store.save("update"), apply());
}
registerServiceWorker((apply) => {
  ((game.pendingUpdate = apply), rlApplyUpdateWhenIdle("found"));
});
document.addEventListener("visibilitychange", () => {
  document.visibilityState === "hidden" && rlApplyUpdateWhenIdle("hidden");
});
// The keys keep the short names of the original bundle (Aa, nr, ue, data.Zi …) because the test
// scripts in tests/ read them; the values are the renamed bindings (2.4.5).
window.__riftTest = {
  selftest: rlSelfTest,
  health: rlRunHealth,
  Aa: World,
  nr: computeStats,
  Su: buildLayout,
  mu: updateEnemy,
  Eu: hitsObstacle,
  kp: isConnected,
  rlUiButtonGuardSelfTest,
  Gl: GameUI,
  RL_TOUCH_CLICK_GUARD,
  ue: weaponDefs,
  Ae: enemyDefs,
  ii: biomeList,
  du: biomesById,
  ri: upgradesById,
  ai: workshopModules,
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
      Zi: upgradeList,
      En: weaponOrder,
      lu: enemyOrder,
      Ip: spawnWeights,
      ec: heavyEnemies,
      Mu: obstacleShapes,
      Dp: mapTemplates,
      cu: biomeVariants,
      sp: iconPaths,
      _i: milestones,
      si: threatLevels,
      en: bossDefs,
      Kl: bossOrder,
      uu: bossByWave,
      $i: waveEvents,
      ai: workshopModules,
      Qf: musicChords,
      tp: musicVoices,
      tc: weaponRange,
      Ma: threatMods,
      Oh: defaultSettings,
      zh: newSave,
      sr: cleanRun,
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
  const q = RL_MODULE_NOTE;
  if (!q || !q.names.length) return;
  set_RL_MODULE_NOTE(null);
  ui.toast(
    `Workshop update: ${q.names.join(", ")} ${q.names.length > 1 ? "were" : "was"} merged into ${q.into.join(" and ")}. All ${q.names.length > 1 ? "their" : "its"} levels refunded: +${formatCount(q.refund)} shards.`,
    "good",
    9000,
  );
  store.save("modules");
}
setTimeout(rlModuleToast, 1100);
store.onChange((json, why) => {
  why === "import" && RL_MODULE_NOTE && setTimeout(rlModuleToast, 300);
});
{
  const baseEvents = handleWorldEvents;
  handleWorldEvents = function (w) {
    for (const t of w.fx)
      t.k === "kit"
        ? ui.toast(`STARTER KIT · ${t.ids.map((id) => upgradesById[id]?.name || id).join(", ")}`, "good", 3200)
        : t.k === "barrier" && ui.banner("EMERGENCY SHIELD", "Hull critical — barrier up", "good", 1400);
    return baseEvents(w);
  };
}
window.__riftTest.v250B = { migrateModules: rlMigrateModules };

/* ==========================================================================
 2.5.0 D: biome title card and boss intro card (the cards themselves are in the 2.5.0 D section
 of ui/ui.js). The first wave of a biome (wave 1 and every biome change) shows the biome card in
 place of its wave banner; an event on such a wave is announced right after the card. A new boss
 shows its name card during the camera pan (game.intro) in place of the plain name banner and
 counts as seen for the Codex (boss_<id>).
 ========================================================================== */
(() => {
  const baseEvents = handleWorldEvents;
  let cardWave = 0,
    cardEvent = null;
  handleWorldEvents = function (w) {
    let card = null,
      boss = null;
    for (const t of w.fx)
      t.k === "wave" && !t.boss && (t.n === 1 || w.biomeFor(t.n - 1).id !== w.biomeFor(t.n).id)
        ? (card = t)
        : t.k === "boss" && bossDefs[t.id] && (boss = t);
    const r = baseEvents(w);
    try {
      if (card) {
        ui.biomeCard(w.biomeFor(card.n), card.n);
        ((cardWave = card.n), (cardEvent = (card.event && waveEvents[card.event]) || null));
      }
      boss && (ui.markSeen(["boss_" + boss.id]), ui.bossCard(boss.id, w.biomeFor(w.wave)));
      // the biome card stays for the first 1.6 s of its wave (game time), the boss card for the
      // camera pan; then they fade. An event of the biome's first wave is announced after the card.
      const h = ui.cardHold;
      if (h && (h.kind === "boss" ? !game.intro : w.wave !== cardWave || w.state !== "fight" || w.waveT >= 1.6)) {
        ui.releaseTitleCard();
        const ev = h.kind === "biome" && w.wave === cardWave && w.state === "fight" && cardEvent;
        const n = cardWave;
        ev &&
          setTimeout(
            () =>
              game.world === w &&
              !game.paused &&
              w.state === "fight" &&
              w.wave === n &&
              ui.banner(ev.name, `Wave ${n} \xB7 ${ev.desc}`, "good", 2600),
            450,
          );
        h.kind === "biome" && (cardEvent = null);
      }
    } catch (e) {
      logError("titlecard", e);
    }
    return r;
  };
})();

export { ui, store, game, safeAreaInsets, input, renderer };
