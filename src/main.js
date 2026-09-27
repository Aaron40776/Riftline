// Entry point: boot and wiring. Creates the save store, sound, renderer, input, overlay and UI,
// holds the game controller (ft) and the main loop, and connects everything (page visibility,
// service worker, wake lock, save export/import). Imports every other module, so their code runs
// in the original order.

import {
  RL_EVENT_KINDS,
  RL_HEALTH,
  RL_LAST_RUN_AUDIT,
  RL_MON,
  RL_RT,
  Xn,
  Zl,
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
  tr,
  ze,
} from "./core/diagnostics.js";
import { Gl, Ln, RL_TOUCH_CLICK_GUARD, k, rlBiomeTitle, rlRenderHistory, sp, we } from "./ui/ui.js";
import { Ol, RL_INPUT } from "./ui/input.js";
import { Qf, rlShotSfx, tp, zl } from "./audio/sound.js";
import { Oh, RL_RETIRE_NOTE, Vl, rlRecordRun, rlSanitizeHistory, set_RL_RETIRE_NOTE, sr, zh } from "./core/save.js";
import { RL_MESH_TYPES } from "./render/models.js";
import { Ae, Kl, RL_ENEMY_TIPS, cu, en, lu, uu } from "./data/enemies.js";
import { Hh, _a, qn, va } from "./core/util.js";
import { RL_KITERS, mu, rlInstallHunt } from "./core/ai.js";
import { RL_BIOME_HAZARD, du, ii, rlApplyBiomeFixes } from "./data/biomes.js";
import { En, ue } from "./data/weapons.js";
import { $i, Ip, ec } from "./core/waves.js";
import { Aa, rlStep } from "./core/world.js";
import { Ma, _i, ai, si } from "./data/progression.js";
import { Zi, ri } from "./data/upgrades.js";
import { Dp, Eu, Mu, Su, kp } from "./core/arena.js";
import { nr, tc } from "./core/stats.js";
import { Bl } from "./render/renderer.js";
import "./render/biome-visuals.js";
import { kl } from "./render/overlay.js";

var RL_INTRO = { queue: [], last: 0 };
function rlIntroEvents(w) {
  if (ft.tut) return; // the tutorial coach owns the screen on the first run
  for (const ev of w.fx) {
    if (
      (ev.k === "spawn" || ev.k === "champion") &&
      RL_ENEMY_TIPS[ev.type] &&
      !ee.data.seen["enemy_" + ev.type] &&
      !RL_INTRO.queue.includes(ev.type)
    )
      RL_INTRO.queue.push(ev.type);
  }
  const now = performance.now();
  if (RL_INTRO.queue.length && now - RL_INTRO.last > 6500 && w.state === "fight") {
    const t = RL_INTRO.queue.shift(),
      seen = ee.data.seen;
    seen["enemy_" + t] = !0;
    t === "mender" && (seen.tip_mender = !0);
    ee.save("intro");
    RL_INTRO.last = now;
    Ft.toast(`NEW · ${Ae[t].name.toUpperCase()} — ${RL_ENEMY_TIPS[t]}`, "intro", 6200);
  }
}

/* ---- content data fixes found by the data audit (2.3.2). Runs once, after all
 content packs are merged and before the save store and renderer are built. ---- */
function rlApplyDataFixes() {
  // Distinct silhouettes need distinct colours: Sentinel shared Bomber's yellow,
  // Repair Beacon shared Mender's green.
  Ae.sentinel.color = 0xe8e8ff;
  Ae.beacon.color = 0x00ffa2;
  // The weapon carousel follows unlock price (it jumped 2400 → 1450 → … before).
  En.sort((a, b) => ue[a].cost - ue[b].cost);
  // 2.3.2: workshop texts must say what the module really does (full QA "workshop" section).
  // Drone Bay only works together with the Wingman upgrade. (Field Supply and Route Scanner
  // had the same effect until 2.3.5; their texts now live with their data.)
  const mod = (id) => ai.find((a) => a.id === id);
  mod("nova").desc = "Every wave starts with at least 25% Nova charge per level"; // floor, not additive
  mod("droneBay").desc = "+1 Wingman slot per level (needs the Wingman upgrade)";
  // 2.3.4: both add their charge once per level (10 / 5 per level); the text sounded like a flat bonus.
  mod("riftBattery").desc = "Start each wave with +10% Nova charge per level";
  mod("reactorCore").desc = "Start each wave with +5% Nova charge per level";
  // Route Scanner referenced a "map" icon that did not exist (fell back to "info").
  sp.map = '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>';
  rlApplyBiomeFixes();
}
var ua = !0;
var lp =
  typeof navigator < "u" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
var _S =
  typeof window < "u" &&
  ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === !0);
function hp(i) {
  !ua ||
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
      .catch((t) => ze("sw", t)),
    navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}));
}
var Gi = null,
  up = !1;
async function Vi(i) {
  up = i;
  try {
    i && !Gi && navigator.wakeLock && document.visibilityState === "visible"
      ? ((Gi = await navigator.wakeLock.request("screen")),
        Gi.addEventListener("release", () => {
          Gi = null;
        }))
      : !i && Gi && (await Gi.release(), (Gi = null));
  } catch {
    Gi = null;
  }
}
typeof document < "u" &&
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "visible" && up && Vi(!0);
  });
var dp = document.getElementById("nojs");
dp && dp.remove();
Zl({ version: _a, build: Hh, mode: ua ? "standalone" : "artifact" });
var Wh = {
    high: { dpr: 2, particles: 1400, fps: 0 },
    battery: { dpr: 1, particles: 500, fps: 30 },
    auto: { dpr: 1.5, particles: 1400, fps: 0 },
  },
  ee = (rlApplyDataFixes(), new Vl()),
  Be = new zl(),
  hs = (i) => document.getElementById(i),
  oe = null;
try {
  oe = new Bl(hs("gl"), { dpr: 1.5 });
  let i = oe.renderer.getContext(),
    t = i.getExtension("WEBGL_debug_renderer_info");
  Zl({ gpu: t ? i.getParameter(t.UNMASKED_RENDERER_WEBGL) : "n/a" });
} catch (i) {
  ze("webgl", i);
}
hs("gl").addEventListener("webglcontextlost", () => ze("webgl", "context lost"));
hs("gl").addEventListener("webglcontextrestored", () => ze("webgl", "context restored"));
let _resizeRaf = 0,
  _resizeWhy = "resize",
  _resizeFollowTimer = 0;
function _resetInputForViewportChange() {
  try {
    ln && (ln.move.active || ln.aim.active) && ln.reset();
  } catch (t) {
    ze("input-reset", t);
  }
}
function _scheduleResize(i) {
  ((_resizeWhy = i),
    _resizeRaf ||
      (_resizeRaf = requestAnimationFrame(() => {
        _resizeRaf = 0;
        try {
          oe && oe.resize(!0);
        } catch (t) {
          ze(_resizeWhy, t);
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
var Qs = new kl(hs("ov")),
  ln = new Ol(hs("touch"), oe),
  ft = {
    store: ee,
    sound: Be,
    input: ln,
    renderer: oe,
    mode: "menu",
    world: null,
    paused: !1,
    previewW: ee.data.weapon,
    buildId: Hh,
    chooseShown: !1,
    overShown: !1,
    slowMo: 0,
    pendingUpdate: null,
    cloud: null,
    startRun({ resume: i }) {
      let t = ee.data,
        e = i ? t.run : null;
      i || t.stats.runs++;
      try {
        this.world = new Aa({
          seed: (Math.random() * 4294967296) >>> 0,
          weapon: t.weapon,
          threat: t.threat,
          ws: t.workshop,
          snap: e,
        });
      } catch (n) {
        (ze("start", n),
          (t.run = null),
          ee.save("bad-run"),
          Ft.alert("Could not start", "The saved run could not be restored and was discarded."));
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
        (RL_RT.runErrorSnapshot = Xn.map((e) => `${e.where}|${e.msg}|${e.n}`)),
        oe && oe.focusOn(null),
        (this.hintT = 0),
        Ft.hideMenus(),
        Ft.hideOver(),
        Ft.hideChoose(),
        Ft.hidePause(),
        Ft.hideCrash(),
        Ft.showHud(!0),
        ln.reset(),
        (ln.enabled = !0),
        (ft.freeze = 0),
        (ft.tut =
          !ee.data.seen.tutorial && !i && this.world.wave === 1
            ? { step: 0, t: 0, moved: 0, kills: 0, dashed: !1 }
            : null),
        ft.tut && (this.world.hold = !0),
        Ft.coach(null),
        oe && oe.resetCamera(),
        Be.setMusic("fight", this.world.biomeFor(this.world.wave).id),
        Vi(!0));
    },
    choose(i) {
      let t = this.world;
      !t || !t.choose(i) || ((this.chooseShown = !1), Ft.hideChoose(), ln.reset());
    },
    reroll() {
      let i = this.world;
      i && i.reroll() && (Ft.renderCards(i), Be.play("pick"), (ee.data.run = i.snapshot()), ee.save("reroll"));
    },
    pause() {
      let i = this.world;
      this.mode !== "game" ||
        !i ||
        this.paused ||
        this.overShown ||
        (i.state !== "fight" && i.state !== "cleared") ||
        ((this.paused = !0), ln.reset(), Ft.showPause(i), Be.setMusic("menu"), ee.save("pause"), Vi(!1));
    },
    resume() {
      this.paused &&
        ((this.paused = !1),
        Ft.hidePause(),
        ln.reset(),
        (this.last = performance.now()),
        Vi(!0),
        this.world && Be.setMusic(this.world.boss ? "boss" : "fight", this.world.biomeFor(this.world.wave).id));
    },
    restart() {
      (Ft.hidePause(), (this.paused = !1), this.endRun(!1, !0, !0), this.startRun({}));
    },
    abandon() {
      (Ft.hidePause(), (this.paused = !1), this.endRun(!1, !0));
    },
    endless() {
      let i = this.world;
      !i ||
        i.state !== "victory" ||
        (Ft.hideOver(),
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
        Ft.showHud(!0),
        (this.chooseShown = !1));
    },
    goHome() {
      ((this.mode = "menu"),
        (this.world = null),
        (this.paused = !1),
        Ft.hideOver(),
        Ft.hideChoose(),
        Ft.hidePause(),
        Ft.showHud(!1),
        (Ft.homeInit = !1),
        Ft.show("home"),
        Be.setMusic("menu"),
        Vi(!1),
        this.pendingUpdate && Ft.setUpdate(!0));
    },
    discardRun() {
      ((ee.data.run = null), ee.save("discard"));
    },
    recover() {
      (Ft.hideCrash(), (this.crashed = !1), this.goHome(), xp());
    },
    endRun(i, t = !1, e = !1) {
      let n = this.world,
        s = ee.data,
        r = s.stats;
      if (!n || this.overShown) return;
      this.overShown = !0;
      rlRunAudit(n, i, t);
      let a = Ma(n.threat),
        o = 1 + 0.1 * (s.workshop.salvage || 0),
        c = n.shards,
        h = i ? Math.round(c * 0.25) : 0,
        l = Math.round((c + h) * a.shards * o),
        u = [["Collected", c]];
      (h && u.push(["Clear bonus +25%", "+" + h]),
        n.threat > 0 && u.push([`${si[n.threat].name} \xD7${a.shards.toFixed(2)}`, "\xD7"]),
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
            ((s.threatMax = n.threat + 1), f.push(`${si[s.threatMax].name} unlocked`)))
        : (r.deaths += t ? 0 : 1),
        (s.shards += l),
        (s.run = null),
        ee.save("run-end"));
      let m = this.claimable()
        .filter((g) => !d.has(g))
        .map((g) => _i.find((M) => M.id === g).name);
      if ((ft.tut && ((ee.data.seen.tutorial = !0), (ft.tut = null), Ft.coach(null), ee.save("tutorial")), e)) {
        this.overShown = !1;
        return;
      }
      (Ft.showHud(!1),
        Ft.hideChoose(),
        Ft.showOver({
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
          weaponName: ue[n.weapon].name,
          fastest: y,
        }),
        Be.setMusic("menu"),
        Vi(!1));
    },
    settingsChanged(i) {
      (Xh(), i || ee.save("settings"));
    },
    resetProgress() {
      (ee.reset(), gp("Progress reset"));
    },
    claimable() {
      let i = ee.data;
      return _i.filter((t) => !i.milestones[t.id] && t.test(i)).map((t) => t.id);
    },
    previewWeapon(i) {
      this.previewW = i;
    },
    applyUpdate() {
      (ee.save("update"), this.pendingUpdate && this.pendingUpdate());
    },
  };
ft.qualityNote = () => {
  let i = ee.data.settings,
    t = oe ? oe.dpr.toFixed(2).replace(/0$/, "") : "-";
  return i.quality === "auto"
    ? `Adapts to your device (now ${t}\xD7)`
    : i.quality === "battery"
      ? "Lower resolution, 30 fps"
      : `Sharpest (${t}\xD7)`;
};
function gp(i) {
  ((Ft.homeInit = !1), Xh(), Ft.screen === "settings" && Ft.renderSettings(), Ft.toast(i));
}
var Ft = new Gl(ft);
ft.ui = Ft;
ln.onBlur = () => {
  ft.mode === "game" && ft.pause();
};
ln.isPlaying = () => ft.mode === "game" && !ft.paused && !ft.chooseShown && !ft.overShown;
ln.onPause = () => {
  if (!document.getElementById("dialog").hidden) {
    Ft.closeDialog(null);
    return;
  }
  ft.mode === "game" && (ft.paused ? ft.resume() : ft.pause());
};
var pa = Wh.auto,
  js = 1.5;
function Xh() {
  let i = ee.data.settings;
  if (
    (Be.setVolumes(i.sfx, i.music),
    (ln.swap = i.swap),
    Ft.setSwap(i.swap),
    (pa = Wh[i.quality] || Wh.auto),
    (Qs.contrast = i.contrast),
    (Ft.calm = i.calm),
    oe)
  ) {
    (oe.setAccess(i.contrast, i.calm), (oe.zoom = i.zoom || 1));
    let t = i.quality === "auto" ? js : pa.dpr;
    oe.setQuality(t, pa.particles);
  }
}
var ma = 0,
  Gh = 0,
  da = 0,
  Wl = 0,
  Vh = 0,
  fp = 0,
  menuFrame = 0;
function xp() {
  ma || ((ft.last = performance.now()), (ma = requestAnimationFrame(yp)));
}
function yp(i) {
  ma = requestAnimationFrame(yp);
  let t = (i - (ft.last || i)) / 1e3;
  if (!(pa.fps && t < 1 / pa.fps - 0.004)) {
    ((ft.last = i), (t = Math.min(0.1, Math.max(0, t))));
    try {
      const w0 = performance.now();
      (i_(t), (Gh = 0));
      if (RL_MON)
        try {
          rlMonFrame(performance.now() - w0);
        } catch {}
    } catch (e) {
      (Gh++,
        ze("frame", e),
        Gh >= 3 && (cancelAnimationFrame(ma), (ma = 0), (ft.crashed = !0), Vi(!1), rlMonCrashed(), Ft.showCrash(tr())));
    }
  }
}
function i_(i) {
  let t = ee.data.settings,
    e = ft.world;
  if (ft.mode === "game" && e) {
    if (!ft.paused && document.visibilityState !== "hidden") {
      let n = ft.slowMo > 0 ? 0.35 : 1;
      ft.slowMo = Math.max(0, ft.slowMo - i);
      let s = ft.speed || 1;
      ft.intro ? a_(i, e) : ft.freeze > 0 ? (ft.freeze -= i) : (ft.acc += i * n * s);
      let r = 0,
        a = 5 * s;
      for (; ft.acc >= rlStep && r < a; ) (e.step(rlStep, ln.sample(e, t)), (ft.acc -= rlStep), r++);
      (r >= a && (ft.acc = 0),
        r_(e),
        rlIntroEvents(e),
        l_(i, e),
        o_(i, e),
        Be.setIntensity(
          e.state === "fight"
            ? e.enemies.length / 34 +
                e.eb.length / 90 +
                (e.boss ? 0.4 : 0) +
                (e.player.hp / e.stats.maxHp < 0.3 ? 0.2 : 0)
            : 0,
        ),
        c_(i, t));
    }
    if (ft.paused) return;
    if (oe) {
      (oe.consume(e.fx, e, t), oe.mapChanged && ((oe.mapChanged = !1), Be.play("rumble")));
      let n = ft.chooseShown || ft.overShown;
      (!n || (fp = (fp + 1) % 3) === 0) && oe.frame(n ? i * 3 : i, e);
    }
    if ((Be.consume(e.fx), (e.fx.length = 0), oe && !(ft.chooseShown || ft.overShown))) {
      // 2.3.6: the "DRAG HERE TO MOVE" hints follow the input in use (like the coach texts since
      // 2.3.4); on a laptop with a touch screen they showed while playing with keys and mouse.
      let n = !!ft.tut && ft.tut.step <= 1 && RL_INPUT.touch;
      Qs.draw(oe, e, ln, { hints: n, dt: i, safe: h_() });
    } else Qs.clear();
    (Ft.hud(e),
      e.state === "choose" && !ft.chooseShown && !ft.overShown && ((ft.chooseShown = !0), ln.reset(), Ft.showChoose(e)),
      e.state === "dead" && e.stateT > 1.5 && !ft.overShown && ft.endRun(!1),
      e.state === "victory" && e.stateT > 0.8 && !ft.overShown && ft.endRun(!0));
  } else
    (oe &&
      (menuFrame = (menuFrame + 1) & 1) === 0 &&
      oe.frame(i, null, { menu: !0, weapon: ft.previewW, biome: ii[s_()] }),
      Qs.clear());
}
function s_() {
  let i = ee.data.stats.bestWave;
  return Math.min(ii.length - 1, Math.floor(Math.max(0, i - 1) / 5));
}
function r_(i) {
  for (let t of i.fx)
    switch (t.k) {
      case "wave": {
        ((ee.data.run = i.snapshot()), ee.save("wave"));
        let e = i.biomeFor(t.n);
        oe && oe.resetCamera();
        let n = t.n === 1 || i.biomeFor(t.n - 1).id !== e.id;
        if (t.event) {
          let s = $i[t.event];
          (Ft.banner(s.name, `Wave ${t.n} \xB7 ${s.desc}`, "good", 2600), Be.play("event"));
        } else
          Ft.banner(
            t.boss ? "WARNING" : `WAVE ${t.n}`,
            t.boss ? "Boss signature detected" : n ? rlBiomeTitle(e) : i.endless ? "Endless" : "",
            t.boss ? "boss" : "",
            2e3,
          );
        (!t.boss &&
          i.arena.vents.length &&
          Gn("lava", "Lava vents glow before they erupt. Lure enemies onto them \u2014 they burn too."),
          !t.boss &&
            i.arena.ice.length &&
            Gn(
              "ice",
              "Cryo Vault: the whole floor is slick, the ice sheets even more \u2014 enemies slide on them too.",
            ),
          !t.boss &&
            i.arena.acid.length &&
            Gn("acid", "Acid pools eat at your hull \u2014 but enemies standing in them take 25% more damage."),
          !t.boss &&
            i.arena.portals.length &&
            Gn("portal", "Portals move you across the arena. Shots fly through them too."),
          Be.setMusic(t.boss ? "boss" : "fight", e.id),
          t.n === 2 &&
            Gn(
              "dash",
              rlKeys()
                ? "Tip: SPACE dashes \u2014 it makes you untouchable for a moment."
                : "Tip: DASH makes you untouchable for a moment.",
            ),
          t.n === 3 &&
            Gn(
              "aim",
              rlKeys()
                ? "Tip: hold the left mouse button to aim and fire at the cursor."
                : `Tip: drag the ${ql().aim} side to aim yourself. Holding it fires at the nearest enemy.`,
            ));
        break;
      }
      case "boss":
        (Ft.banner(t.name, t.title, "boss", 2600),
          Gn("boss", "Bosses telegraph every attack. Marked zones and lines hit hard \u2014 move out."),
          i.boss && oe && ((ft.intro = { t: 0 }), oe.focusOn(i.boss.x, i.boss.y), ln.settle()));
        break;
      case "novaReady":
        Gn(
          "nova",
          rlKeys()
            ? "NOVA is charged \u2014 press E to blast everything around you."
            : "NOVA is charged \u2014 tap it to blast everything around you.",
        );
        break;
      case "cleared":
        (Ft.banner(t.boss ? "BOSS DOWN" : "CLEARED", t.flawless ? "Flawless" : `Wave ${t.n}`, "good", 1500),
          t.boss || (ft.slowMo = Math.max(ft.slowMo, 0.45)));
        break;
      case "hurt":
        t.chip || (Ft.hurtFlash(), Qs.addHurt(i, t.sx, t.sy), fa(0.06));
        break;
      case "champion":
        (Ft.banner("CHAMPION", `A ${Ae[t.type].name} leads the pack \u2014 its allies move faster`, "warn", 2200),
          Gn("champion", "Champions rally nearby enemies. Take one down and the pack is stunned."));
        break;
      case "championDown":
        (Ft.banner("CHAMPION DOWN", "The pack is stunned", "good", 1400),
          (ft.slowMo = Math.max(ft.slowMo, 0.5)),
          fa(0.08));
        break;
      case "mend":
        Gn("mender", "Menders heal other enemies. Kill them first.");
        break;
      case "kill":
        (t.elite || t.r >= 0.8) && fa(t.elite ? 0.05 : 0.025);
        break;
      case "nova":
        fa(0.08);
        break;
      case "guardBreak":
        fa(0.03);
        break;
      case "bossAtk":
        Qs.callout(t.atk);
        break;
      case "offer":
        ((ee.data.run = i.snapshot()), ee.save("offer"));
        break;
      case "combo":
        Ft.comboPop(t.n, t.bonus);
        break;
      case "salvagePulse":
        Ft.toast(`SALVAGE PULSE · +${t.amount} shards`, "good", 1800);
        break;
      case "bountyPulse":
        Ft.toast(`BOUNTY · +${t.amount} shards`, "good", 1500);
        break;
      case "pick":
        t.evo && Ft.banner("EVOLVED", ri[t.id].name, "good", 1800);
        break;
      case "dash":
        ft.tut && (ft.tut.dashed = !0);
        break;
      case "enrage":
        Ft.banner("ENRAGED", "", "warn", 1400);
        break;
      case "phase":
        Ft.banner(`PHASE ${t.n}`, "The core adapts", "warn", 1600);
        break;
      case "bossDown":
        ft.slowMo = 1.1;
        break;
      case "revive":
        Ft.banner("SECOND LIFE", "Hull restored", "good", 1600);
        break;
      case "die":
        Be.setMusic("off");
        break;
      case "victory":
        Be.setMusic("menu");
        break;
    }
}
var pp = 1.5;
function a_(i, t) {
  let e = ft.intro;
  ((e.t += i),
    oe && (oe.focusK = e.t / pp),
    (e.t >= pp || !t.boss) &&
      ((ft.intro = null),
      oe && oe.focusOn(null),
      t.boss && (t.boss.spawnT = Math.min(t.boss.spawnT, 0.1)),
      ln.settle(),
      (ft.acc = 0)));
}
function fa(i) {
  let t = performance.now();
  t - (ft.lastStop || 0) < 180 || ((ft.lastStop = t), (ft.freeze = Math.max(ft.freeze || 0, i)));
}
var Xl = 0;
function o_(i, t) {
  let e = t.player;
  if (t.state !== "fight" || !e.alive || e.hp / t.stats.maxHp >= 0.25) {
    Xl = 0;
    return;
  }
  ((Xl -= i), Xl <= 0 && ((Xl = 0.95), Be.play("heart")));
}
var ql = () => (ee.data.settings.swap ? { move: "right", aim: "left" } : { move: "left", aim: "right" }),
  // 2.3.4: keyboard/mouse players got the touch texts ("drag the left side"), which do nothing
  // with a mouse, and the keys were explained nowhere. Every step now has both wordings and
  // follows the input in use (the coach re-reads the text every frame).
  rlKeys = () => !RL_INPUT.touch,
  mp = [
    () => (rlKeys() ? "Move with W A S D or the arrow keys." : `Drag anywhere on the ${ql().move} side to move.`),
    () =>
      rlKeys()
        ? "Enemies! Your drone fires on its own \u2014 hold the left mouse button to aim yourself."
        : `Enemies! Your drone fires on its own \u2014 drag the ${ql().aim} side to aim yourself.`,
    () => (rlKeys() ? "Press SPACE to dash through danger." : "Tap DASH to dodge through danger."),
    () => "Grab the shards \u2014 they buy permanent upgrades in the Workshop.",
  ];
function l_(i, t) {
  let e = ft.tut;
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
      ((ft.tut = null), (t.hold = !1), Ft.coach(null));
      let n = ee.data.seen;
      ((n.tutorial = !0), (n.tip_dash = !0), (n.tip_aim = !0), ee.save("tutorial"));
      return;
    }
    Ft.coach(e.step, mp.length, mp[e.step]());
  }
}
function Gn(i, t) {
  let e = ee.data.seen;
  e["tip_" + i] || ((e["tip_" + i] = !0), ee.save("tip"), Ft.toast(t, "", 5200));
}
// 2.4.2: Auto quality also steps back up. Before, two slow windows (a stutter at the start of
// a run is enough) lowered the resolution until the next reload. It now rises again one step
// after 20 s at 57+ fps. A level it had to leave twice becomes the ceiling for the session, so
// a device at its limit does not flip between two levels.
let rlQUp = 0,
  rlQCeil = 1.5;
const rlQLeft = {},
  rlQParticles = (d) => (d >= 1.5 ? pa.particles : d <= 1 ? 800 : 1100);
function c_(i, t) {
  if (t.quality !== "auto" || !oe || ((Wl += i), Vh++, Wl < 2.5)) return;
  let e = Vh / Wl;
  ((Wl = 0), (Vh = 0), e < 48 ? da++ : (da = Math.max(0, da - 1)), (rlQUp = e >= 57 ? rlQUp + 1 : 0));
  if (da >= 2 && js > 1) {
    (rlQLeft[js] && (rlQCeil = Math.min(rlQCeil, js - 0.25)), (rlQLeft[js] = !0));
    ((js = Math.max(1, js - 0.25)), (da = 0), (rlQUp = 0), oe.setQuality(js, rlQParticles(js)));
  } else if (rlQUp >= 8 && js + 0.25 <= rlQCeil) {
    ((js += 0.25), (rlQUp = 0), (da = 0), oe.setQuality(js, rlQParticles(js)));
  }
}
function h_() {
  let i = getComputedStyle(document.documentElement),
    t = (e) => parseFloat(i.getPropertyValue(e)) || 0;
  return { t: t("--st"), b: t("--sb"), l: t("--sl"), r: t("--sr") };
}
document.addEventListener("visibilitychange", () => {
  document.visibilityState === "hidden"
    ? (ft.mode === "game" && ft.pause(), ee.save("hidden"), Be.suspend())
    : (Be.resume(), (ft.last = performance.now()));
});
window.addEventListener("pagehide", () => {
  (ln.reset(!0), ee.save("pagehide"));
});
window.addEventListener("pageshow", () => {
  (ln.reset(!0), _scheduleResize("pageshow"));
});
var u_ = () => {
  (Be.unlock(), Be.mode === "off" && ft.mode === "menu" && Be.setMusic("menu"));
};
for (let i of ["pointerdown", "keydown", "click"]) document.addEventListener(i, u_, { capture: !0, passive: !0 });
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
  var __showOver = Ft.showOver.bind(Ft);
  Ft.showOver = function (t) {
    __showOver(t);
    var e = k("overExtra"),
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
        ["Damage dealt", qn(Math.round(r.dmgDealt || 0))],
        ["Damage taken", qn(Math.round(r.dmgTaken || 0))],
        ["Crits", qn(r.critHits || 0)],
        ["Dashes", qn(r.dashes || 0)],
        ["Best combo", "×" + qn(r.bestCombo || 0)],
      ]
        .map(function (x) {
          return (
            '<div class="xcell"><div class="xk">' + we(x[0]) + '</div><div class="xv num">' + we(x[1]) + "</div></div>"
          );
        })
        .join("") +
      "</div>";
  };
  var __endRun = ft.endRun;
  ft.endRun = function (win, abandoned, silent) {
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
    return JSON.stringify(ee.data, null, 2);
  };
  var exportSave = async function () {
    var value = makeBackup();
    var result = await Ft.dialog({
      title: "Export save",
      body: '<p>Copy this text and keep it somewhere safe. It contains your Riftline progress and settings.</p><textarea id="saveExport" class="log" spellcheck="false" readonly></textarea>',
      buttons: [
        { label: "Copy", value: "copy", cls: "ghost" },
        { label: "Close", value: null, cls: "primary" },
      ],
      onOpen: function () {
        k("saveExport").value = value;
      },
      read: function () {
        return k("saveExport").value;
      },
    });
    if (result && result.value === "copy") Ft.copy(result.text || value);
  };
  var importSave = async function () {
    var result = await Ft.dialog({
      title: "Import save",
      body: '<p>Paste a Riftline save export below. Importing replaces the current progress on this device.</p><textarea id="saveImport" class="log" spellcheck="false" placeholder="Paste save JSON here"></textarea>',
      buttons: [
        { label: "Cancel", value: null, cls: "ghost" },
        { label: "Restore", value: "restore", cls: "primary" },
      ],
      read: function () {
        return k("saveImport").value;
      },
    });
    if (!result || result.value !== "restore") return;
    var parsed = ee.parse(result.text);
    if (!parsed.ok) {
      Ft.alert("Invalid save", "That text is not a valid Riftline save export.");
      return;
    }
    if (
      !(await Ft.confirm(
        "Restore save?",
        "Your current local progress will be replaced by the imported save.",
        "Restore",
        true,
      ))
    )
      return;
    ee.data = parsed.data;
    ee.save("import");
    // 2.4.2: apply the imported settings (volume, left-handed, graphics, camera) right away;
    // they used to wait for the next reload or settings change.
    Xh();
    ft.previewW = ee.data.weapon;
    ft._runExtra = null;
    ft.world = null;
    ft.mode = "menu";
    ft.paused = false;
    Ft.hideOver();
    Ft.hideChoose();
    Ft.hidePause();
    Ft.showHud(false);
    Ft.homeInit = false;
    Ft.show("home");
    Be.setMusic("menu");
    Vi(false);
    Ft.toast("Save restored", "gold", 2400);
  };
  var backupBtn = k("backupBtn");
  var shareBtn = k("shareBtn");
  var restoreBtn = k("restoreBtn");
  var replayTutBtn = k("replayTutBtn");
  backupBtn && backupBtn.addEventListener("click", exportSave);
  if (shareBtn && !navigator.share) shareBtn.hidden = true;
  shareBtn &&
    shareBtn.addEventListener("click", async function () {
      var value = makeBackup();
      try {
        await navigator.share({ title: "Riftline save", text: value });
        Ft.toast("Save shared", "good", 2200);
      } catch (e) {
        if (e && e.name !== "AbortError") Ft.toast("Share failed — use Export instead");
      }
    });
  restoreBtn && restoreBtn.addEventListener("click", importSave);
  replayTutBtn &&
    replayTutBtn.addEventListener("click", async function () {
      var ok = await Ft.confirm(
        "Replay tutorial?",
        "The onboarding will show again on your next fresh run. Your current run and progress stay untouched.",
        "Enable",
      );
      if (!ok) return;
      ee.data.seen.tutorial = false;
      ee.save("tutorial-replay");
      Ft.toast("Tutorial queued for your next fresh run", "good", 2800);
    });
})();
// 2.4.0: say once that the retired weapons of an old save were converted.
function rlRetireToast() {
  const q = RL_RETIRE_NOTE;
  if (!q || !q.names.length) return;
  set_RL_RETIRE_NOTE(null);
  Ft.toast(
    `The arsenal is down to 7 weapons: ${q.names.join(", ")} became the weapon ${q.names.length > 1 ? "they were variants" : "it was a variant"} of${q.refund ? `, +${qn(q.refund)} shards refunded` : ""}.`,
    "good",
    9000,
  );
  ee.save("retire");
}

/* ---- 2.2.3: run monitor hooks (only the live run's world is observed;
 self-test and snapshot-check worlds are ignored by identity) ---- */
(() => {
  rlInstallHunt();
  const baseStep = Aa.prototype.step;
  Aa.prototype.step = function (dt, input) {
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
  const baseWave = Aa.prototype.startWave;
  Aa.prototype.startWave = function (wave, nova) {
    const r = baseWave.call(this, wave, nova);
    if (RL_MON && RL_MON.w === this)
      try {
        rlMonBeginWave(this);
      } catch (e) {
        rlMonIssue("WARN", "monitor", "monitor exception: " + e.message);
      }
    return r;
  };
  const baseStart = ft.startRun;
  ft.startRun = function (o) {
    const r = baseStart.call(this, o);
    try {
      this.world && this.mode === "game" && rlMonStart(this.world, !!(o && o.resume));
    } catch (e) {
      ze("monitor", e);
    }
    return r;
  };
  const baseEnd = ft.endRun;
  ft.endRun = function (win, abandoned, silent) {
    const w = this.world,
      pre = w && !this.overShown ? rlMonPreEnd(w) : null;
    const r = baseEnd.call(this, win, abandoned, silent);
    if (pre)
      try {
        rlMonFinish(w, pre, !!win, !!abandoned, !!silent, !1);
      } catch (e) {
        ze("audit", e);
      }
    if (pre)
      try {
        rlRecordRun(w, pre, !!win, !!abandoned);
      } catch (e) {
        ze("history", e);
      }
    return r;
  };
  const baseEndless = ft.endless;
  ft.endless = function () {
    const r = baseEndless.call(this);
    try {
      this.world && this.world.endless && rlMonStart(this.world, !0);
    } catch (e) {
      ze("monitor", e);
    }
    return r;
  };
  // Records: recent runs list under the lifetime stats
  const baseRec = Gl.prototype.renderRecords;
  Gl.prototype.renderRecords = function () {
    const r = baseRec.call(this);
    try {
      rlRenderHistory();
    } catch (e) {
      ze("history", e);
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
    const w = ft.world;
    ft.mode !== "game" ||
      !w ||
      ft.overShown ||
      (w.state !== "dead" && w.state !== "victory") ||
      ft.endRun(w.state === "victory");
  };
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "hidden" && settle();
  });
  window.addEventListener("pagehide", settle);

  // ---- keys by position; upgrade choice keys
  const baseKey = Ol.prototype.key;
  Ol.prototype.key = function (t, down) {
    const code = String(t.code || "");
    let key = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : String(t.key || "");
    this._rlKey = key.toLowerCase();
    const tag = t.target && t.target.tagName;
    if (down && !t.repeat && tag !== "INPUT" && tag !== "TEXTAREA" && rlChooseKey(code, this._rlKey))
      t.preventDefault();
    // Esc also works while a settings toggle or slider has focus (only text fields keep it)
    if (
      down &&
      !t.repeat &&
      this._rlKey === "escape" &&
      tag === "INPUT" &&
      /^(checkbox|range|radio)$/.test(t.target.type)
    ) {
      (t.target.blur(), this.onPause && this.onPause());
      return;
    }
    return baseKey.call(
      this,
      key === t.key ? t : { key, repeat: t.repeat, target: t.target, preventDefault: () => t.preventDefault() },
      down,
    );
  };
  function rlChooseKey(code, key) {
    if (!ft.chooseShown || ft.overShown || !k("dialog").hidden || k("choose").hidden) return !1;
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(code) || /^([1-4])$/.exec(key);
    if (m) {
      const card = k("cards").querySelectorAll("[data-pick]")[+m[1] - 1];
      card && !k("cards").classList.contains("locked") && ft.choose(card.dataset.pick);
      return !0;
    }
    if (key === "r") {
      k("rerollBtn").disabled || ft.reroll();
      return !0;
    }
    return !1;
  }
  const baseCards = Gl.prototype.renderCards;
  Gl.prototype.renderCards = function (t) {
    // the reroll label survives a re-render (reroll), so drop its old key hint first
    k("rerollBtn")
      .querySelectorAll(".card-key")
      .forEach((e) => e.remove());
    const r = baseCards.call(this, t);
    if (rlKeys()) {
      k("cards")
        .querySelectorAll("[data-pick]")
        .forEach(
          (c, i) => (
            c.classList.add("has-key"),
            c.insertAdjacentHTML("beforeend", `<kbd class="card-key" aria-hidden="true">${i + 1}</kbd>`)
          ),
        );
      k("rerollTxt").insertAdjacentHTML("afterend", '<kbd class="card-key inline" aria-hidden="true">R</kbd>');
    }
    return r;
  };

  // ---- Esc: back in menu pages; from settings opened in the pause menu back to the pause menu
  const basePause = ln.onPause;
  ln.onPause = () => {
    if (!k("dialog").hidden) return basePause();
    if (Ft.rlFromPause) return Ft.back();
    if (ft.mode === "menu") {
      ln._rlKey === "escape" && ["workshop", "records", "settings"].includes(Ft.screen) && Ft.back();
      return;
    }
    basePause();
  };

  // ---- settings from the pause menu
  const closePauseSettings = () => {
    ((Ft.rlFromPause = !1), (k("settings").hidden = !0), k("settings").classList.remove("in-run"));
  };
  Gl.prototype.openPauseSettings = function () {
    if (!ft.paused || k("pause").hidden) return;
    ((this.rlFromPause = !0), (k("pause").hidden = !0), k("settings").classList.add("in-run"), this._show("settings"));
  };
  const baseBack = Gl.prototype.back;
  Gl.prototype.back = function () {
    if (!this.rlFromPause) return baseBack.call(this);
    (closePauseSettings(), (k("pause").hidden = !1), (this.screen = "pause"));
  };
  const baseHidePause = Gl.prototype.hidePause;
  Gl.prototype.hidePause = function () {
    (closePauseSettings(), baseHidePause.call(this));
  };
  Ft.click(k("pauseSetBtn"), () => Ft.openPauseSettings());

  // ---- what each upgrade of the build does (pause menu)
  const info = k("pauseUpInfo"),
    upInfo = (id, lv) => {
      const u = ri[id];
      if (!u) return "";
      const tag = u.evo ? "EVOLUTION" : u.repeat ? `\xD7${lv}` : `LV ${lv}/${u.max}`;
      return `<b>${we(u.name)}</b> <span class="lv">${tag}</span><p>${we(u.desc(Math.max(0, lv - 1)))}</p>`;
    };
  const baseShowPause = Gl.prototype.showPause;
  Gl.prototype.showPause = function (t) {
    const r = baseShowPause.call(this, t),
      own = Zi.filter((n) => t.up[n.id] && !n.repeat);
    own.length &&
      (k("pauseBuild").innerHTML = own
        .map(
          (n) =>
            `<button type="button" class="bi r${n.rarity}" data-up="${n.id}" aria-label="${we(n.name)}">${Ln(n.icon)}${we(n.name)}${t.up[n.id] > 1 ? " \xD7" + t.up[n.id] : ""}</button>`,
        )
        .join(""));
    ((info.hidden = !own.length), (info.innerHTML = '<p class="note">Select an upgrade to see what it does.</p>'));
    return r;
  };
  k("pauseBuild").addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-up]"),
      w = ft.world;
    if (!b || !w) return;
    for (const o of k("pauseBuild").querySelectorAll("[data-up]")) o.classList.toggle("sel", o === b);
    info.innerHTML = upInfo(b.dataset.up, w.up[b.dataset.up] || 0);
  });

  // ---- run timer and FPS counter
  for (const [id, key] of [
    ["setTimer", "timer"],
    ["setFps", "fps"],
  ])
    k(id).addEventListener("change", () => {
      ((ee.data.settings[key] = k(id).checked), ft.settingsChanged());
    });
  const baseRenderSettings = Gl.prototype.renderSettings;
  Gl.prototype.renderSettings = function () {
    const r = baseRenderSettings.call(this),
      s = this.save.settings;
    ((k("setTimer").checked = !!s.timer), (k("setFps").checked = !!s.fps));
    return r;
  };
  let frames = 0,
    since = 0,
    last = 0,
    fps = 0,
    shown = "";
  const baseHud = Gl.prototype.hud;
  Gl.prototype.hud = function (t) {
    const r = baseHud.call(this, t),
      s = ee.data.settings,
      now = performance.now();
    // a gap (pause, upgrade choice, hidden tab) starts a new measurement
    (now - last > 1e3 && ((since = now), (frames = 0)), (last = now));
    (frames++,
      now - since >= 500 &&
        ((fps = since ? Math.round((frames * 1e3) / (now - since)) : 0), (frames = 0), (since = now)));
    const parts = [];
    (s.timer && parts.push(va(t.time)), s.fps && fps && parts.push(fps + " FPS"));
    const txt = parts.join(" \xB7 ");
    txt !== shown && ((shown = txt), (k("hudInfo").textContent = txt), (k("hudInfo").hidden = !txt));
    return r;
  };
})();
Xh();
Ft.show("home");
setTimeout(rlRetireToast, 700);
setTimeout(() => rlRunHealth({ context: "startup" }).catch((e) => ze("health", e)), 900);
oe
  ? xp()
  : ((hs("playBtn").disabled = !0),
    (hs("continueBtn").disabled = !0),
    (hs("playBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play."),
    (hs("continueBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play."),
    Ft.toast(
      "3D graphics unavailable. The menu remains usable; enable hardware acceleration and reload to play.",
      "warn",
      9000,
    ));
hp((i) => {
  ((ft.pendingUpdate = i), ft.mode === "menu" && Ft.setUpdate(!0));
});
window.__riftTest = {
  selftest: rlSelfTest,
  health: rlRunHealth,
  Aa,
  nr,
  Su,
  mu,
  Eu,
  kp,
  rlUiButtonGuardSelfTest,
  Gl,
  RL_TOUCH_CLICK_GUARD,
  ue,
  Ae,
  ii,
  du,
  ri,
  ai,
  get RL_HEALTH() {
    return RL_HEALTH;
  },
  get game() {
    return ft;
  },
  get ui() {
    return Ft;
  },
  get store() {
    return ee;
  },
  get renderer() {
    return oe;
  },
  get lastRunAudit() {
    return RL_LAST_RUN_AUDIT;
  },
  get monitor() {
    return RL_MON;
  },
  get data() {
    return {
      Zi,
      En,
      lu,
      Ip,
      ec,
      Mu,
      Dp,
      cu,
      sp,
      _i,
      si,
      en,
      Kl,
      uu,
      $i,
      ai,
      Qf,
      tp,
      tc,
      Ma,
      Oh,
      zh,
      sr,
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

export { Ft, ee, ft, h_, ln, oe };
