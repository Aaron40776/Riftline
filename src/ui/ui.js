// DOM UI (GameUI): screens, HUD, dialogs, workshop, records and settings, plus DOM helpers and icons.

import {
  RL_RT,
  clearErrorLog,
  rlRunHealth,
  onLogChange,
  set_RL_LAST_RUN_AUDIT,
  getErrorLog,
  buildReport,
  logError,
} from "../core/diagnostics.js";
import { enemyDefs, bossDefs, enemyOrder, bossByBiome, RL_ENEMY_TIPS } from "../data/enemies.js";
import { biomeList, biomesById } from "../data/biomes.js";
import { store } from "../main.js";
import { clamp, GAME_VERSION, formatCount, rlAgo, formatTime } from "../core/util.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { waveEvents } from "../core/waves.js";
import { milestones, workshopModules, rlRetired, threatLevels } from "../data/progression.js";
import { upgradeList, rarityNames, upgradesById } from "../data/upgrades.js";
import { computeStats, weaponRange } from "../core/stats.js";
import { RL_INPUT } from "./input.js";
import { WHATS_NEW } from "../data/whatsnew.js";
import { markHomeViewDirty } from "../render/renderer.js";

const RL_TOUCH_CLICK_GUARD = { until: 0, x: 0, y: 0, key: "" };
function rlUiClickKey(el) {
  if (!el) return "";
  if (el.id) return "id:" + el.id;
  const data = el.dataset || {};
  return data.buy
    ? "buy:" + data.buy
    : data.claim
      ? "claim:" + data.claim
      : data.go
        ? "go:" + data.go
        : el.hasAttribute && el.hasAttribute("data-back")
          ? "back"
          : "";
}
function rlRenderHistory() {
  const el = document.getElementById("runHist");
  if (!el) return;
  const history = store.data.history || [];
  if (!history.length) {
    el.innerHTML = '<p class="note">No runs yet — your last 12 runs appear here.</p>';
    return;
  }
  const killerName = (id) =>
    id === "lava"
      ? "a lava vent"
      : id === "acid"
        ? "acid"
        : id === "trap"
          ? "a trap"
          : enemyDefs[id]
            ? "a " + enemyDefs[id].name
            : bossDefs[id]
              ? bossDefs[id].name
              : "";
  el.innerHTML = history
    .map((run) => {
      const icon = run.outcome === "win" ? "trophy" : run.outcome === "quit" ? "close" : "skull",
        killer = run.outcome === "dead" ? killerName(run.killer) : "";
      const meta = [
        threatLevels[run.threat].name,
        formatTime(run.time),
        formatCount(run.kills) + " kills",
        "+" + formatCount(run.shards) + " shards",
        killer && "by " + killer,
        run.outcome === "quit" && "abandoned",
      ]
        .filter(Boolean)
        .join(" · ");
      const build = run.build.map((id) => upgradesById[id].name).join(" · ");
      return `<div class="row panel hist ${run.outcome}"><div class="rico">${iconSvg(icon)}</div><div><b>${run.outcome === "win" ? "Rift sealed" : "Wave " + run.wave}${run.endless ? " · Endless" : ""} · ${escapeHtml((weaponDefs[run.weapon] || rlRetired(run.weapon)).name)}</b><small>${escapeHtml(meta)}</small>${build ? `<small class="hist-build">${escapeHtml(build)}</small>` : ""}</div><span class="chip">${rlAgo(run.t)}</span></div>`;
    })
    .join("");
}
function rlBiomeTitle(biome) {
  return biome.tag ? `${biome.name} \xB7 ${biome.tag}` : biome.name;
}
const iconPaths = {
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  shard: '<path d="M12 2.5l5 7-5 12-5-12z"/><path d="M7 9.5h10"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
  dash: '<path d="M3 12h10M6 7h8M6 17h8"/><path d="M14 6l6 6-6 6"/>',
  star: '<path d="M12 2.5l2.6 6.2 6.7.5-5.1 4.4 1.6 6.5L12 16.6l-5.8 3.5 1.6-6.5-5.1-4.4 6.7-.5z"/>',
  burst:
    '<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.3 5.3l3.5 3.5M15.2 15.2l3.5 3.5M5.3 18.7l3.5-3.5M15.2 8.8l3.5-3.5"/><circle cx="12" cy="12" r="2"/>',
  rate: '<path d="M4 7l5 5-5 5M11 7l5 5-5 5M18 7v10"/>',
  shield: '<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z"/>',
  wing: '<path d="M3 16c4-1 7-4 9-10 1 5 4 8 9 9-4 2-10 3-18 1z"/>',
  arrow: '<path d="M3 12h16M14 6l6 6-6 6"/>',
  magnet: '<path d="M6 3v8a6 6 0 0012 0V3"/><path d="M6 7h4M14 7h4"/>',
  crosshair: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  heart: '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 9c0 6.2-8 11-8 11z"/>',
  fan: '<path d="M12 21V11M12 11L5 4M12 11l7-7M12 11V3"/>',
  pierce: '<path d="M2 12h20M17 7l5 5-5 5"/><circle cx="8" cy="12" r="3"/>',
  bounce: '<path d="M3 18l6-12 6 12 6-12"/>',
  orbit:
    '<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5"/><circle cx="20.5" cy="10.5" r="1.3"/>',
  snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  flame: '<path d="M12 22c-4 0-7-3-7-7 0-4 3-6 4-10 2 2 3 4 3 6 1-1 2-2 2-4 3 3 5 5 5 8 0 4-3 7-7 7z"/>',
  drone: '<rect x="8" y="9" width="8" height="6" rx="1.5"/><path d="M8 12H3M16 12h5M5 9v6M19 9v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  reroll: '<path d="M20 11a8 8 0 00-14.5-4.5M4 13a8 8 0 0014.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 01-10 0z"/><path d="M7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4M12 14v4M8 21h8"/>',
  wrench: '<path d="M14.5 5.5a4 4 0 00-5.2 5.2L3 17l4 4 6.3-6.3a4 4 0 005.2-5.2l-2.7 2.7-2.8-.5-.5-2.8z"/>',
  check: '<path d="M4 12.5l5 5 11-11"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  load: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v4h16v-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  skull:
    '<path d="M12 3a8 8 0 00-5 14.2V21h10v-3.8A8 8 0 0012 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
function iconSvg(name, cls = "") {
  let paths = iconPaths[name] || iconPaths.info;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
const getById = (id) => document.getElementById(id),
  menuScreens = ["home", "workshop", "records", "news", "settings"],
  formatTenths = (value) => (Math.round(value * 10 + 1e-6) / 10).toString(),
  formatPercent = (value) => Math.round(value * 100) + "%",
  formatCooldown = (value) => (value > 0 ? formatTenths(value) + " s" : "off"),
  statRows = [
    ["Damage", (stats) => stats.weapon.dmg * stats.dmgMul, formatTenths],
    ["Fire rate", (stats) => stats.weapon.rate * stats.rateMul, (value) => formatTenths(value) + "/s"],
    ["Projectiles", (stats) => stats.weapon.count + (stats.weapon.cone ? stats.extra * 2 : stats.extra), String],
    ["Pierce", (stats) => (stats.pierce > 99 ? 0 : stats.pierce), String],
    ["Bounces", (stats) => stats.bounce, String],
    ["Crit", (stats) => stats.crit, formatPercent],
    ["Max HP", (stats) => stats.maxHp, String],
    ["Speed", (stats) => stats.speed, (value) => formatTenths(value) + " m/s"],
    ["Range", (stats) => stats.range, (value) => Math.round(value) + " m"],
    ["Pickup radius", (stats) => stats.magnet, (value) => formatTenths(value) + " m"],
    ["Dash cooldown", (stats) => stats.dashCd, formatCooldown],
    ["Aegis every", (stats) => stats.shieldCd, formatCooldown],
    ["Regen", (stats) => stats.regen, (value) => formatTenths(value) + " HP/s"],
    ["Blades", (stats) => stats.orbit, String],
    ["Blade damage", (stats) => (stats.orbit ? stats.orbitDmg * stats.dmgMul : 0), formatTenths],
    ["Slow chance", (stats) => stats.cryo, formatPercent],
    ["Chain chance", (stats) => stats.arc, formatPercent],
    ["Bolt jumps", (stats) => stats.chain, String],
    [
      "Flame burn",
      (stats) => (stats.burn ? stats.burn * stats.burnMul * stats.dmgMul : 0),
      (value) => formatTenths(value) + "/s",
    ],
    ["Chain jumps", (stats) => (stats.arc ? stats.arcJumps : 0), String],
    ["Blast", (stats) => stats.payloadF, formatPercent],
    ["Grenades", (stats) => stats.gadgetMax, String], // 3.0.0
    ["Grenade recharge", (stats) => stats.gadgetCd, formatCooldown],
    ["Grenade blast", (stats) => stats.gadgetDmg, (value) => "\u00d7" + formatTenths(value)],
    ["Burn", (stats) => stats.thermite, formatPercent],
    ["Repair chance", (stats) => stats.siphonCh, formatPercent],
    ["Nova radius", (stats) => stats.novaR, (value) => formatTenths(value) + " m"],
    ["Drones", (stats) => stats.wingmen, String],
    ["Bloodrush cap", (stats) => (stats.bloodrush ? 0.4 : 0), formatPercent], // 2.6.0
  ],
  damageSources = {
    arc: ["Arc Relay", "#c58bff"],
    burn: ["Burning", "#ff8a2a"],
    payload: ["Payload", "#ffa13d"],
    orbit: ["Orbital Blades", "#9ff8ff"],
    wingman: ["Wingman", "#49f2ff"],
    dash: ["Shock Dash", "#7ff6ff"],
    trail: ["Phantom trail", "#7ff6ff"],
    nova: ["Nova", "#7ff6ff"],
    pop: ["Bomber blasts", "#ffe14a"],
    lava: ["Lava", "#ff6a2a"],
    inferno: ["Inferno", "#ff5a3a"],
    grenade: ["Grenades", "#ffb347"],
    trap: ["Arena traps", "#aeb9cf"], // 3.0.0: enemies caught by a trap
    other: ["Other", "#93a2bf"],
  },
  escapeHtml = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
    ),
  GameUI = class {
    constructor(game) {
      this.g = game;
      this.screen = "home";
      this.stack = [];
      this.viewWeapon = 0;
      this.viewThreat = 0;
      this.hudCache = {};
      this.dlgResolve = null;
      this.fillIcons(document);
      getById("pauseBtn").innerHTML = iconSvg("pause");
      this.bind();
    }
    fillIcons(root) {
      for (let el of root.querySelectorAll("[data-icon]")) {
        if (!el.dataset.filled) {
          el.dataset.filled = "1";
          el.insertAdjacentHTML("afterbegin", iconSvg(el.dataset.icon));
        }
      }
    }
    get save() {
      return this.g.store.data;
    }
    click(el, action) {
      if (!el) return;
      let touchDown = 0,
        startX = 0,
        startY = 0,
        pointerId = 0,
        activate = () => {
          if (el.disabled || el.hidden) return false;
          this.g.sound.play("click");
          action();
          return true;
        };
      el.addEventListener(
        "pointerdown",
        (ev) => {
          if ((ev.pointerType === "touch" || ev.pointerType === "pen") && ev.isPrimary !== false) {
            startX = ev.clientX;
            startY = ev.clientY;
            pointerId = ev.pointerId;
            touchDown = 1;
          }
        },
        { passive: false },
      );
      el.addEventListener(
        "pointerup",
        (ev) => {
          if (!(ev.pointerType === "touch" || ev.pointerType === "pen") || !touchDown || ev.pointerId !== pointerId)
            return;
          let dx = ev.clientX - startX,
            dy = ev.clientY - startY;
          touchDown = 0;
          if (Math.hypot(dx, dy) > 14 || !activate()) return;
          ev.preventDefault();
          ev.stopPropagation();
          const now = performance.now();
          RL_TOUCH_CLICK_GUARD.until = now + 800;
          RL_TOUCH_CLICK_GUARD.x = ev.clientX;
          RL_TOUCH_CLICK_GUARD.y = ev.clientY;
          RL_TOUCH_CLICK_GUARD.key = rlUiClickKey(el);
        },
        { passive: false },
      );
      el.addEventListener(
        "pointercancel",
        (ev) => {
          if (ev.pointerId === pointerId) {
            touchDown = 0;
          }
        },
        { passive: true },
      );
      el.addEventListener("click", (ev) => {
        const now = performance.now(),
          guard = RL_TOUCH_CLICK_GUARD,
          dx = Number(ev.clientX) - guard.x,
          dy = Number(ev.clientY) - guard.y,
          near = Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= 36,
          key = rlUiClickKey(el),
          same = !!(guard.key && key && guard.key === key) || near;
        if (now < guard.until && same) {
          guard.until = 0;
          guard.key = "";
          RL_RT.uiGuardDrops++;
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        guard.until = 0;
        guard.key = "";
        activate();
      });
    }
    bind() {
      for (let el of document.querySelectorAll("[data-go]")) this.click(el, () => this.show(el.dataset.go));
      for (let el of document.querySelectorAll("[data-back]")) this.click(el, () => this.back());
      this.click(getById("wPrev"), () => this.stepWeapon(-1));
      this.click(getById("wNext"), () => this.stepWeapon(1));
      this.click(getById("tPrev"), () => this.stepThreat(-1));
      this.click(getById("tNext"), () => this.stepThreat(1));
      this.click(getById("wBuy"), () => this.buyWeapon());
      this.click(getById("playBtn"), () => this.play());
      this.click(getById("continueBtn"), () => this.g.startRun({ resume: true }));
      let onPress = (el, action) =>
        el.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          action();
        });
      onPress(getById("dashBtn"), () => {
        this.g.input.press("dash");
        let world = this.g.world,
          btn = getById("dashBtn");
        if (world && world.player.dashCdT > 0.08) {
          btn.classList.remove("deny");
          btn.offsetWidth;
          btn.classList.add("deny");
          this.g.sound.play("deny");
        }
      });
      onPress(getById("novaBtn"), () => {
        this.g.input.press("nova");
        let world = this.g.world,
          btn = getById("novaBtn");
        if (world && world.player.nova < 100) {
          btn.classList.remove("deny");
          btn.offsetWidth;
          btn.classList.add("deny");
          this.g.sound.play("deny");
        }
      });
      onPress(getById("gadgetBtn"), () => {
        // the deny flash comes from the simulation's gadgetDeny event (no charge, or outside a fight)
        this.g.input.press("gadget");
      });
      this.click(getById("pauseBtn"), () => this.g.pause());
      this.click(getById("resumeBtn"), () => this.g.resume());
      this.click(getById("abandonBtn"), async () => {
        if (
          await this.confirm("Abandon run?", "You keep the shards collected so far, but the run ends here.", "Abandon")
        ) {
          this.g.abandon();
        }
      });
      this.click(getById("rerollBtn"), () => this.g.reroll());
      this.click(getById("restartBtn"), async () => {
        if (
          await this.confirm(
            "Restart run?",
            "Shards collected so far are kept. A fresh run starts with the same weapon and threat.",
            "Restart",
          )
        ) {
          this.g.restart();
        }
      });
      this.click(getById("retryBtn"), () => this.g.retry());
      this.click(getById("homeBtn"), () => this.g.goHome());
      this.click(getById("endlessBtn"), () => this.g.endless());
      this.click(getById("crashHome"), () => this.g.recover());
      this.click(getById("crashCopy"), () => this.copy(getById("crashLog").value));
      let settings = () => this.save.settings,
        bindToggle = (id, key) => {
          let input = getById(id);
          input.addEventListener("change", () => {
            settings()[key] = input.checked;
            this.g.settingsChanged();
          });
        };
      bindToggle("setAuto", "autoFire");
      bindToggle("setAssist", "assist");
      bindToggle("setSwap", "swap");
      bindToggle("setShake", "shake");
      bindToggle("setNumbers", "numbers");
      bindToggle("setContrast", "contrast");
      bindToggle("setCalm", "calm");
      for (let [id, key] of [
        ["setSfx", "sfx"],
        ["setMusic", "music"],
      ]) {
        let input = getById(id);
        input.addEventListener("input", () => {
          settings()[key] = +input.value;
          this.g.settingsChanged(true);
        });
        input.addEventListener("change", () => {
          this.g.settingsChanged();
          if (key === "sfx") {
            this.g.sound.play("pick");
          }
        });
      }
      for (let [id, key, numeric] of [
        ["setQuality", "quality", false],
        ["setZoom", "zoom", true],
      ])
        for (let btn of getById(id).querySelectorAll("button"))
          this.click(btn, () => {
            settings()[key] = numeric ? +btn.dataset.v : btn.dataset.v;
            this.renderSettings();
            this.g.settingsChanged();
          });
      // 3.1.0: listen to the calm theme and the boss track of every biome (loops until stopped)
      for (let seg of document.querySelectorAll("#musicPreview .seg"))
        for (let btn of seg.querySelectorAll("button"))
          this.click(btn, () => this.togglePreview(seg.dataset.biome, btn.dataset.music));
      this.click(getById("resetBtn"), async () => {
        if (
          (await this.confirm(
            "Reset all progress?",
            "Shards, workshop, weapons, records and milestones are wiped. Settings stay.",
            "Continue",
          )) &&
          (await this.confirm("Really reset?", "This cannot be undone.", "Reset everything", true))
        ) {
          this.g.resetProgress();
        }
      });
      this.click(getById("logBtn"), () => this.showLog());
      onLogChange(() => {
        if (this.screen === "settings") {
          this.renderLog();
        }
      });
      getById("dialog").addEventListener("click", (ev) => {
        if (ev.target === getById("dialog")) {
          this.closeDialog(null);
        }
      });
    }
    show(screen) {
      if (menuScreens.includes(this.screen) && this.screen !== screen) {
        this.stack.push(this.screen);
      }
      this._show(screen);
    }
    _show(screen) {
      // 2.3.6: the renderer re-measures the free space of the home screen for the drone preview
      markHomeViewDirty();
      // 2.5.0 D: Records opened from another screen start on the stats
      if (screen === "records" && this.screen !== "records") {
        this.recTab = "stats";
      }
      for (let id of menuScreens) getById(id).hidden = id !== screen;
      this.screen = screen;
      // the music preview plays only while the settings screen is open
      if (screen !== "settings") {
        this.g.sound.stopPreview();
        this.renderPreview();
      }
      if (screen === "home") {
        this.stack = [];
        this.renderHome();
      }
      if (screen === "workshop") {
        this.renderWorkshop();
      }
      if (screen === "records") {
        this.renderRecords();
      }
      if (screen === "news") {
        this.renderNews();
      }
      if (screen === "settings") {
        this.renderSettings();
      }
      requestAnimationFrame(() => window.__riftLayoutAudit?.());
    }
    back() {
      // 2.4.2: from settings opened in the pause menu back to the pause menu
      if (this.rlFromPause) {
        closePauseSettings(this);
        getById("pause").hidden = false;
        this.screen = "pause";
        return;
      }
      this._show(this.stack.pop() || "home");
    }
    hideMenus() {
      this.g.sound.stopPreview();
      this.renderPreview();
      for (let id of menuScreens) getById(id).hidden = true;
      this.screen = "game";
    }
    renderHome() {
      let save = this.save;
      getById("bank").textContent = formatCount(save.shards);
      for (let el of document.querySelectorAll(".bankMirror")) el.textContent = formatCount(save.shards);
      if (this.viewWeapon == null || !weaponOrder[this.viewWeapon]) {
        this.viewWeapon = 0;
      }
      if (!this.homeInit) {
        this.viewWeapon = weaponOrder.indexOf(save.weapon);
        this.viewThreat = save.threat;
        this.homeInit = true;
      }
      this.renderWeapon();
      this.renderThreat();
      let run = save.run,
        btn = getById("continueBtn");
      if (run) {
        btn.hidden = false;
        btn.innerHTML = `${iconSvg("play")}CONTINUE \xB7 WAVE ${run.wave + (run.offer ? 1 : 0)} \xB7 ${escapeHtml(weaponDefs[run.weapon].name)}`;
        getById("playBtn").classList.remove("primary");
      } else {
        btn.hidden = true;
        getById("playBtn").classList.add("primary");
      }
      this.updatePlayState();
      getById("recBadge").hidden = !this.g.claimable().length;
      getById("newsBadge").hidden = !!save.seen["news_" + GAME_VERSION];
      let stats = save.stats;
      getById("bestLine").hidden = !stats.runs;
      if (stats.runs) {
        getById("bestLine").textContent =
          `Best wave ${stats.bestWave}` +
          (stats.clears ? ` \xB7 ${stats.clears} clear${stats.clears > 1 ? "s" : ""}` : "");
      }
    }
    renderWeapon() {
      let save = this.save,
        id = weaponOrder[this.viewWeapon],
        weapon = weaponDefs[id],
        owned = !!save.weapons[id],
        card = document.querySelector(".weapon-card");
      card.classList.toggle("locked", !owned);
      card.style.setProperty("--wc", "#" + weapon.color.toString(16).padStart(6, "0"));
      getById("wIndex").textContent = `${this.viewWeapon + 1}/${weaponOrder.length}`;
      getById("wName").innerHTML = (owned ? "" : iconSvg("lock", "inline")) + escapeHtml(weapon.name);
      if (getById("wName").querySelector(".ico")) {
        getById("wName").querySelector(".ico").style.cssText =
          "display:inline-block;vertical-align:-3px;margin-right:6px;width:18px;height:18px";
      }
      getById("wBlurb").textContent = weapon.blurb;
      let burst = weapon.dmg * weapon.count + (weapon.explodeDmg || 0),
        range = weaponRange(weapon),
        segs = (value) => {
          let lit = clamp(Math.round(value), 1, 8);
          return (
            '<div class="segs">' +
            Array.from({ length: 8 }, (_, i) => `<i class="${i < lit ? "on" : ""}"></i>`).join("") +
            "</div>"
          );
        },
        dmgText =
          weapon.count > 1
            ? `${weapon.dmg}\xD7${weapon.count}`
            : weapon.explodeDmg
              ? `${weapon.dmg}+${weapon.explodeDmg}`
              : String(weapon.dmg);
      getById("wStats").innerHTML = `
    <div class="stat"><span class="k">DAMAGE</span><span class="v">${dmgText}</span>${segs((burst / 55) * 8)}</div>
    <div class="stat"><span class="k">RATE</span><span class="v">${weapon.rate.toFixed(1)}/s</span>${segs((weapon.rate / 6.5) * 8)}</div>
    <div class="stat"><span class="k">RANGE</span><span class="v">${Math.round(range)} m</span>${segs((range / 28) * 8)}</div>`;
      let buyBtn = getById("wBuy");
      buyBtn.hidden = owned;
      if (!owned) {
        buyBtn.innerHTML = `UNLOCK \xB7 <span class="shard-ico"></span>${weapon.cost}`;
        buyBtn.disabled = save.shards < weapon.cost;
      }
      getById("wPrev").disabled = this.viewWeapon <= 0;
      getById("wNext").disabled = this.viewWeapon >= weaponOrder.length - 1;
      this.updatePlayState();
      this.g.previewWeapon(owned ? id : save.weapon);
    }
    renderThreat() {
      let save = this.save,
        threat = threatLevels[this.viewThreat],
        locked = this.viewThreat > save.threatMax;
      getById("tName").textContent = threat.name;
      getById("tName").classList.toggle("hot", this.viewThreat > 0);
      getById("tDesc").textContent = locked
        ? `Clear all ${20} waves on ${threatLevels[this.viewThreat - 1].name} to unlock`
        : this.viewThreat > 0
          ? `${threat.desc} Shards \xD7${(1 + 0.25 * this.viewThreat).toFixed(2)}`
          : threat.desc;
      getById("tPrev").disabled = this.viewThreat <= 0;
      getById("tNext").disabled = this.viewThreat >= Math.min(5, save.threatMax + 1);
      this.updatePlayState();
    }
    updatePlayState() {
      let save = this.save,
        id = weaponOrder[this.viewWeapon],
        playable = !!save.weapons[id] && this.viewThreat <= save.threatMax,
        btn = getById("playBtn");
      btn.disabled = !playable;
      btn.textContent = playable
        ? save.run
          ? "NEW RUN"
          : "START RUN"
        : save.weapons[id]
          ? "THREAT LOCKED"
          : "WEAPON LOCKED";
    }
    stepWeapon(dir) {
      this.viewWeapon = clamp(this.viewWeapon + dir, 0, weaponOrder.length - 1);
      let id = weaponOrder[this.viewWeapon];
      if (this.save.weapons[id]) {
        this.save.weapon = id;
        this.g.store.save("weapon");
      }
      this.renderWeapon();
    }
    stepThreat(dir) {
      this.viewThreat = clamp(this.viewThreat + dir, 0, Math.min(5, this.save.threatMax + 1));
      if (this.viewThreat <= this.save.threatMax) {
        this.save.threat = this.viewThreat;
        this.g.store.save("threat");
      }
      this.renderThreat();
    }
    buyWeapon() {
      let save = this.save,
        id = weaponOrder[this.viewWeapon],
        weapon = weaponDefs[id];
      if (save.weapons[id] || save.shards < weapon.cost) {
        this.g.sound.play("deny");
        return;
      }
      save.shards -= weapon.cost;
      save.weapons[id] = true;
      save.weapon = id;
      this.g.store.save("buy");
      this.g.sound.play("buy");
      this.toast(`${weapon.name} unlocked`, "gold");
      this.renderHome();
    }
    async play() {
      let save = this.save;
      if (
        !(
          save.run &&
          !(await this.confirm(
            "Start a new run?",
            `Your run at wave ${save.run.wave} ends here. You keep the shards collected in it.`,
            "New run",
          ))
        )
      ) {
        if (save.run) {
          this.g.discardRun();
        }
        this.g.startRun({});
      }
    }
    renderWorkshop() {
      let save = this.save;
      for (let el of document.querySelectorAll(".bankMirror")) el.textContent = formatCount(save.shards);
      let list = getById("wsList");
      list.innerHTML = workshopModules
        .map((mod) => {
          let level = save.workshop[mod.id] || 0,
            maxLevel = mod.costs.length,
            cost = mod.costs[level],
            pips = Array.from({ length: maxLevel }, (_, i) => `<i class="${i < level ? "on" : ""}"></i>`).join(""),
            btn =
              level >= maxLevel
                ? '<button class="btn" disabled>MAX</button>'
                : `<button class="btn" data-buy="${mod.id}" ${save.shards < cost ? "disabled" : ""}><span class="shard-ico"></span>${cost}</button>`;
          return `<div class="row panel"><div class="rico">${iconSvg(mod.icon)}</div><div><b>${escapeHtml(mod.name)}</b><small>${escapeHtml(mod.desc)}</small><div class="pips">${pips}</div></div>${btn}</div>`;
        })
        .join("");
      for (let btn of list.querySelectorAll("[data-buy]")) this.click(btn, () => this.buyModule(btn.dataset.buy));
    }
    buyModule(id) {
      let save = this.save,
        mod = workshopModules.find((mod) => mod.id === id),
        level = save.workshop[id] || 0,
        cost = mod.costs[level];
      if (cost == null || save.shards < cost) {
        this.g.sound.play("deny");
        return;
      }
      save.shards -= cost;
      save.workshop[id] = level + 1;
      this.g.store.save("workshop");
      this.g.sound.play("buy");
      this.renderWorkshop();
    }
    renderRecords() {
      let save = this.save,
        stats = save.stats;
      for (let el of document.querySelectorAll(".bankMirror")) el.textContent = formatCount(save.shards);
      let bossKills = Object.values(stats.bosses).reduce((sum, count) => sum + count, 0),
        cells = [
          ["Runs", stats.runs],
          ["Best wave", stats.bestWave || "\u2014"],
          ["Full clears", stats.clears],
          ["Enemies destroyed", formatCount(stats.kills)],
          ["Bosses defeated", bossKills],
          ["Best threat cleared", stats.bestClearThreat >= 0 ? threatLevels[stats.bestClearThreat].name : "\u2014"],
          ["Time in the rift", formatTime(stats.playTime)],
          ["Fastest clear", stats.bestTime > 0 ? formatTime(stats.bestTime) : "—"],
          ["Shards earned", formatCount(stats.shardsEarned)],
        ];
      getById("statGrid").innerHTML = cells
        .map(
          ([label, value]) =>
            `<div class="cell"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div></div>`,
        )
        .join("");
      let list = getById("msList");
      list.innerHTML = milestones
        .map((ms) => {
          let done = !!save.milestones[ms.id],
            ready = !done && ms.test(save),
            action = done
              ? `<span class="chip">${iconSvg("check")}DONE</span>`
              : ready
                ? `<button class="btn" data-claim="${ms.id}"><span class="shard-ico"></span>${ms.reward}</button>`
                : `<span class="chip"><span class="shard-ico"></span>${ms.reward}</span>`;
          return `<div class="row panel ${done ? "done" : ready ? "claim" : ""}"><div class="rico">${iconSvg(done ? "check" : "trophy")}</div><div><b>${escapeHtml(ms.name)}</b><small>${escapeHtml(ms.desc)}</small></div>${action}</div>`;
        })
        .join("");
      for (let btn of list.querySelectorAll("[data-claim]")) this.click(btn, () => this.claim(btn.dataset.claim));
      // 2.5.0 D: Stats / Codex tabs
      try {
        this.recordsTab(this.recTab || "stats");
      } catch (err) {
        console.warn("codex", err);
      }
      // recent runs list under the lifetime stats
      try {
        rlRenderHistory();
      } catch (err) {
        logError("history", err);
      }
    }
    claim(id) {
      let save = this.save,
        ms = milestones.find((milestone) => milestone.id === id);
      if (!(!ms || save.milestones[id] || !ms.test(save))) {
        save.milestones[id] = true;
        save.shards += ms.reward;
        this.g.store.save("claim");
        this.g.sound.play("buy");
        this.toast(`${ms.name}: +${ms.reward} shards`, "gold");
        this.renderRecords();
      }
    }
    // the What's new tab: opening it marks this version's notes as read (the badge on the home screen goes away)
    renderNews() {
      getById("newsList").innerHTML = WHATS_NEW.map(
        (entry, i) =>
          `<h3 class="section-h">${escapeHtml(entry.version)} · ${escapeHtml(entry.title)}${i === 0 ? " · current" : ""}</h3>` +
          `<div class="set-group">${entry.items.map((t) => `<div class="set-row"><span>${escapeHtml(t)}</span></div>`).join("")}</div>`,
      ).join("");
      this.markSeen(["news_" + GAME_VERSION]);
    }
    renderSettings() {
      let settings = this.save.settings;
      getById("setAuto").checked = settings.autoFire;
      getById("setAssist").checked = settings.assist;
      getById("setSwap").checked = settings.swap;
      getById("setShake").checked = settings.shake;
      getById("setNumbers").checked = settings.numbers;
      getById("setContrast").checked = settings.contrast;
      getById("setCalm").checked = settings.calm;
      getById("setSfx").value = settings.sfx;
      getById("setMusic").value = settings.music;
      this.renderPreview();
      for (let btn of getById("setQuality").querySelectorAll("button"))
        btn.classList.toggle("on", btn.dataset.v === settings.quality);
      for (let btn of getById("setZoom").querySelectorAll("button"))
        btn.classList.toggle("on", Math.abs(+btn.dataset.v - settings.zoom) < 0.01);
      getById("qualityNote").textContent = this.g.qualityNote();
      getById("storageWarn").hidden = this.g.store.storageOk;
      getById("verText").textContent = `v${GAME_VERSION}`;
      this.renderLog();
      // 2.4.2: run timer and FPS counter
      getById("setTimer").checked = !!settings.timer;
      getById("setFps").checked = !!settings.fps;
    }
    /* a button of the music block toggles the loop of its track; only one plays at a time */
    togglePreview(biome, mode) {
      let sound = this.g.sound,
        now = sound.previewing();
      if (now && now.biome === biome && now.mode === mode) {
        sound.stopPreview();
      } else {
        sound.preview(mode, biome);
        if (this.save.settings.music <= 0) this.toast("Music volume is off \u2014 raise it to listen", "hint", 2600);
      }
      this.renderPreview();
    }
    renderPreview() {
      let now = this.g.sound.previewing();
      for (let seg of document.querySelectorAll("#musicPreview .seg"))
        for (let btn of seg.querySelectorAll("button"))
          btn.classList.toggle("on", !!now && now.biome === seg.dataset.biome && now.mode === btn.dataset.music);
    }
    renderLog() {
      let count = getErrorLog().length;
      getById("logCount").textContent = count ? String(count) : "0";
    }
    async showLog(skipHealth) {
      if (!skipHealth) {
        await rlRunHealth({ context: "diagnostics" });
      }
      let choice = await this.dialog({
        title: "Diagnostics",
        body: `<p>Build ${escapeHtml(this.g.buildId)}. “Deep test” runs the full simulation self-test (a few seconds). Copy this text when reporting a problem.</p><textarea readonly spellcheck="false">${escapeHtml(buildReport())}</textarea>`,
        buttons: [
          { label: "Deep test", value: "deep", cls: "ghost" },
          { label: "Copy", value: "copy", cls: "ghost" },
          { label: "Clear", value: "clear", cls: "ghost" },
          { label: "Close", value: null, cls: "primary" },
        ],
      });
      if (choice === "copy") {
        this.copy(buildReport());
      }
      if (choice === "clear") {
        clearErrorLog();
        set_RL_LAST_RUN_AUDIT(null);
        this.renderLog();
        this.toast("Log cleared");
      }
      if (choice === "deep") {
        this.toast("Running deep self-test…", "", 2600);
        setTimeout(async () => {
          await rlRunHealth({ context: "diagnostics", deep: true });
          this.showLog(true);
        }, 80);
      }
    }
    async copy(text) {
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch {}
      if (!ok) {
        let area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, text.length);
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        area.remove();
      }
      this.toast(ok ? "Copied" : "Copy failed \u2014 select the text and copy it by hand");
      return ok;
    }
    dialog({ title, body, buttons, onOpen, read }) {
      if (this.dlgResolve) {
        this.closeDialog(null);
      }
      getById("dlgTitle").textContent = title;
      getById("dlgBody").innerHTML = body;
      let row = getById("dlgBtns");
      row.innerHTML = "";
      return new Promise((resolve) => {
        this.dlgResolve = resolve;
        this.dlgRead = read || null;
        for (let spec of buttons) {
          let btn = document.createElement("button");
          btn.className = "btn " + (spec.cls || "");
          btn.textContent = spec.label;
          this.click(btn, () => this.closeDialog(spec.value));
          row.appendChild(btn);
        }
        getById("dialog").hidden = false;
        // 2.8.1: focus moves into the dialog and back to where it was on close. It lands on the main
        // button, or on the first (Cancel) one when the main action is destructive, so Enter is safe
        this.dlgFocusBack = document.activeElement;
        const main = row.querySelector(".primary") || row.firstElementChild;
        if (main) main.focus({ preventScroll: true });
        if (onOpen) {
          onOpen();
        }
      });
    }
    closeDialog(value) {
      let resolve = this.dlgResolve,
        text = this.dlgRead ? this.dlgRead() : undefined;
      this.dlgResolve = null;
      getById("dialog").hidden = true;
      const back = this.dlgFocusBack;
      this.dlgFocusBack = null;
      if (back && back.isConnected && typeof back.focus === "function") back.focus({ preventScroll: true });
      if (resolve) {
        resolve(this.dlgRead ? { value, text } : value);
      }
      this.dlgRead = null;
    }
    async confirm(title, text, okLabel, danger) {
      return (
        (await this.dialog({
          title,
          body: `<p>${escapeHtml(text)}</p>`,
          buttons: [
            { label: "Cancel", value: false, cls: "ghost" },
            { label: okLabel, value: true, cls: danger ? "danger" : "primary" },
          ],
        })) === true
      );
    }
    alert(title, text) {
      return this.dialog({
        title,
        body: `<p>${escapeHtml(text)}</p>`,
        buttons: [{ label: "OK", value: true, cls: "primary" }],
      });
    }
    toast(text, cls = "", ms = 2900) {
      let box = getById("toasts"),
        el = document.createElement("div");
      for (
        el.className = "toast " + cls,
          el.style.animationDuration = ms + "ms",
          el.textContent = text,
          box.appendChild(el);
        box.children.length > 3;
      )
        box.firstChild.remove();
      setTimeout(() => el.remove(), ms + 50);
    }
    banner(big, small, cls = "", ms = 2200) {
      let el = getById("banner");
      el.innerHTML = `<div class="bn ${cls}" style="animation-duration:${ms}ms"><div class="small">${escapeHtml(small || "")}</div><div class="big">${escapeHtml(big)}</div></div>`;
      clearTimeout(this.bannerT);
      this.bannerT = setTimeout(() => {
        el.innerHTML = "";
      }, ms + 50);
    }
    comboPop(combo, bonus) {
      let el = document.createElement("div");
      el.className = "combo-pop";
      el.textContent = `\xD7${combo} COMBO  +${bonus}`;
      getById("hud").appendChild(el);
      setTimeout(() => el.remove(), 1250);
    }
    coach(step, steps, text) {
      let box = getById("coach");
      if (step == null) {
        box.hidden = true;
        this.coachKey = null;
        return;
      }
      let key = step + text;
      if (this.coachKey !== key) {
        this.coachKey = key;
        getById("coachDots").innerHTML = Array.from(
          { length: steps },
          (_, i) => `<i class="${i <= step ? "on" : ""}"></i>`,
        ).join("");
        getById("coachText").textContent = text;
        box.hidden = false;
      }
    }
    setSwap(on) {
      getById("hud").classList.toggle("swap", !!on);
    }
    showHud(on) {
      getById("hud").hidden = !on;
      getById("hud").style.visibility = "";
      getById("vignette").classList.remove("low");
      getById("touch").hidden = !on;
      if (!on) {
        getById("bossBar").hidden = true;
      }
      this.hudCache = {};
      // 2.5.0 D: the end of a run hides the title cards like the banner
      this.clearTitleCard();
    }
    hud(world) {
      let cache = this.hudCache,
        player = world.player,
        stats = world.stats,
        update = (key, value, apply) => {
          if (cache[key] !== value) {
            cache[key] = value;
            apply(value);
          }
        },
        hp = Math.max(0, Math.ceil(player.hp));
      update("hp", hp + "/" + stats.maxHp, (text) => {
        getById("hpNum").textContent = text;
      });
      let hpFrac = clamp(player.hp / stats.maxHp, 0, 1);
      update("hpf", Math.round(hpFrac * 200), () => {
        getById("hpFill").style.transform = `scaleX(${hpFrac})`;
        getById("hpLag").style.transform = `scaleX(${hpFrac})`;
        getById("hpFill").parentElement.classList.toggle("low", hpFrac < 0.3);
      });
      update("shieldOn", stats.shieldCd > 0, (on) => {
        getById("shieldPip").hidden = !on;
      });
      if (stats.shieldCd > 0) {
        update("shield", player.shield ? 100 : Math.round((player.shieldT / stats.shieldCd) * 20) * 5, (pct) => {
          getById("shieldPip").style.setProperty("--p", pct + "%");
          getById("shieldPip").classList.toggle("ready", pct >= 100);
        });
      }
      if (cache.hpVal != null && player.hp > cache.hpVal + 0.5) {
        let bar = getById("hpFill").parentElement;
        bar.classList.remove("heal");
        bar.offsetWidth;
        bar.classList.add("heal");
      }
      cache.hpVal = player.hp;
      this.buffs(world);
      update("low", player.alive && hpFrac < 0.25, (low) => {
        getById("vignette").classList.toggle("low", low);
      });
      update("shards", world.shards, (shards) => {
        getById("runShards").textContent = formatCount(shards);
        let chip = getById("shardChip");
        if (cache.shardsSeen) {
          chip.classList.remove("bump");
          chip.offsetWidth;
          chip.classList.add("bump");
        }
        cache.shardsSeen = true;
      });
      let waveMax = world.endless ? "" : "/" + 20;
      update("wave", world.wave + waveMax, () => {
        getById("waveLabel").textContent = `WAVE ${world.wave}${waveMax}`;
      });
      let sub;
      if (world.state === "fight")
        if (world.boss || world.bossPending) sub = "BOSS";
        else {
          let left = world.enemies.length + world.markers.length;
          for (let i = world.planIdx; i < world.plan.length; i++) left += world.plan[i].members.length;
          sub = left + " LEFT";
        }
      else {
        if (world.state === "cleared") {
          sub = "CLEARED";
        } else {
          sub = "\xA0";
        }
      }
      update("sub", sub, (text) => {
        getById("waveSub").textContent = text;
      });
      let showProg = world.state === "fight" && !world.boss && !world.bossPending && world.planTotal > 0;
      update("progOn", showProg, (on) => {
        getById("waveProg").hidden = !on;
      });
      if (showProg) {
        let left = world.enemies.length + world.markers.length;
        for (let i = world.planIdx; i < world.plan.length; i++) left += world.plan[i].members.length;
        let progress = clamp(1 - left / Math.max(world.planTotal, left), 0, 1);
        update("prog", Math.round(progress * 50), () => {
          getById("waveProgFill").style.transform = `scaleX(${progress})`;
        });
      }
      let boss = world.boss || (world.champion && !world.champion.dead ? world.champion : null);
      update("bossOn", !!boss, (on) => {
        getById("bossBar").hidden = !on;
      });
      if (boss) {
        update("bossName", boss.type + (boss.enraged ? "!" : "") + (boss.champion ? "c" : ""), () => {
          getById("bossName").textContent = boss.champion
            ? `${enemyDefs[boss.type].name.toUpperCase()} CHAMPION`
            : bossDefs[boss.type].name;
          getById("bossPhase").textContent = boss.enraged ? "ENRAGED" : boss.champion ? "RALLYING" : "";
        });
        update("bossF", Math.round((boss.hp / boss.maxHp) * 300), (value) => {
          getById("bossFill").style.transform = `scaleX(${clamp(value / 300, 0, 1)})`;
          getById("bossLag").style.transform = `scaleX(${clamp(value / 300, 0, 1)})`;
        });
        update("bossTicks", boss.type, (type) => {
          getById("bossTicks").innerHTML = type === "core" ? '<s style="left:66%"></s><s style="left:33%"></s>' : "";
        });
      }
      let combo = world.combo >= 5 ? world.combo : 0;
      update("combo", combo, (combo) => {
        getById("combo").hidden = !combo;
        if (combo) {
          getById("comboN").textContent = "\xD7" + combo;
          getById("combo").classList.toggle("hot", combo >= 25);
        }
      });
      if (combo) {
        update("comboT", Math.round(world.comboT * 20), (value) => {
          getById("comboBar").style.transform = `scaleX(${clamp(value / 44, 0, 1)})`;
        });
      }
      let dashPct = stats.dashCd > 0 ? Math.round((player.dashCdT / stats.dashCd) * 100) : 0;
      update("dash", dashPct, (pct) => {
        let btn = getById("dashBtn");
        btn.style.setProperty("--p", pct + "%");
        btn.style.setProperty("--q", 100 - pct + "%");
        let cooling = pct > 0;
        if (btn.classList.contains("cooling") && !cooling) {
          btn.classList.remove("pop");
          btn.offsetWidth;
          btn.classList.add("pop");
          if (world.state === "fight") {
            this.g.sound.play("ready");
          }
        }
        btn.classList.toggle("cooling", cooling);
      });
      update("dashSec", player.dashCdT > 0.25 ? player.dashCdT.toFixed(1) : "", (text) => {
        getById("dashSec").textContent = text;
      });
      let nova = Math.floor(player.nova);
      update("nova", nova, (pct) => {
        getById("novaBtn").style.setProperty("--p", pct + "%");
        getById("novaBtn").classList.toggle("ready", pct >= 100);
      });
      // 3.0.0: grenade charges as pips, recharge ring from gadgetT/gadgetCd
      const gadgetN = player.gadgetN | 0,
        gadgetMax = stats.gadgetMax | 0;
      update("gadgetPips", gadgetN + "/" + gadgetMax, () => {
        const pips = getById("gadgetPips");
        while (pips.children.length < gadgetMax) {
          pips.appendChild(document.createElement("i"));
        }
        while (pips.children.length > gadgetMax) {
          pips.lastChild.remove();
        }
        for (let i = 0; i < pips.children.length; i++) {
          pips.children[i].classList.toggle("on", i < gadgetN);
        }
        const btn = getById("gadgetBtn");
        btn.classList.toggle("empty", gadgetN <= 0);
        btn.setAttribute("aria-label", `Throw grenade, ${gadgetN} of ${gadgetMax} ready`);
      });
      const gadgetPct =
        gadgetN >= gadgetMax || !(stats.gadgetCd > 0)
          ? 100
          : Math.round(clamp(1 - player.gadgetT / stats.gadgetCd, 0, 1) * 100);
      update("gadgetRing", gadgetPct, (pct) => {
        getById("gadgetBtn").style.setProperty("--q", pct + "%");
      });
      // 2.4.2: run timer and FPS counter
      const settings = store.data.settings,
        now = performance.now(),
        meter = hudFpsMeter;
      // a gap (pause, upgrade choice, hidden tab) starts a new measurement
      if (now - meter.last > 1e3) {
        meter.since = now;
        meter.frames = 0;
      }
      meter.last = now;
      meter.frames++;
      if (now - meter.since >= 500) {
        meter.fps = meter.since ? Math.round((meter.frames * 1e3) / (now - meter.since)) : 0;
        meter.frames = 0;
        meter.since = now;
      }
      const parts = [];
      if (settings.timer) {
        parts.push(formatTime(world.time));
      }
      if (settings.fps && meter.fps) {
        parts.push(meter.fps + " FPS");
      }
      const txt = parts.join(" \xB7 ");
      if (txt !== meter.shown) {
        meter.shown = txt;
        getById("hudInfo").textContent = txt;
        getById("hudInfo").hidden = !txt;
      }
    }
    buffs(world) {
      let player = world.player,
        stats = world.stats,
        chips = [];
      if (stats.bloodrush && player.rushN > 0) {
        chips.push(["rush", `RUSH \xD7${player.rushN}`, "#ff5a7a", player.rushT / 4]);
      }
      if (world.chronoT > 0) {
        chips.push(["chrono", "SLOW-MO", "#8fe8ff", world.chronoT / 1.5]);
      }
      if ((world.ws.revive || 0) > 0 && !world.revived) {
        chips.push(["life", "2ND LIFE", "#6dff8a", -1]);
      }
      if (world.barrierT > 0) {
        chips.push(["barrier", "BARRIER", "#7fd8ff", world.barrierT / Math.max(1, stats.barrierT || 1)]);
      }
      if (world.attuned && world.state === "fight") {
        chips.push(["attune", "ATTUNED", "#ffb86b", -1]);
      }
      if (world.event && world.state === "fight") {
        chips.unshift(["event", waveEvents[world.event].name, world.event === "elite" ? "#ffc84a" : "#7ff6ff", -1]);
      }
      if (player.onIce && world.state === "fight") {
        chips.push(["ice", "ICE", "#bff4ff", -1]);
      }
      if (player.inAcid && world.state === "fight") {
        chips.push(["acid", "ACID", "#b4ff3d", -1]);
      }
      if (player.slowT > 0) {
        chips.push(["chill", "CHILLED", "#aee8ff", player.slowT / 1.6]);
      }
      let key = chips.map((chip) => chip[0] + chip[1]).join("|"),
        buffRow = getById("buffs");
      if (this.hudCache.buffKey !== key) {
        this.hudCache.buffKey = key;
        buffRow.innerHTML = chips
          .map(
            ([id, text, color, left]) =>
              `<span class="buff" data-b="${id}" style="--bc:${color}">${text}${left >= 0 ? "<i></i>" : ""}</span>`,
          )
          .join("");
      }
      for (let [id, , , left] of chips) {
        if (left < 0) continue;
        let bar = buffRow.querySelector(`[data-b="${id}"] i`);
        if (bar) {
          bar.style.transform = `scaleX(${clamp(left, 0, 1).toFixed(2)})`;
        }
      }
      // 2.5.0 A: chips for the timed upgrades (Heat Sink, Slipstream) and active Cryo Skates.
      // They are added next to the chips above, which may rebuild the row at any frame.
      const on = world.state === "fight" && player.alive,
        want = [];
      if (on && stats.heatSink && player.heatT > 0) {
        want.push(["heat", "HEAT", "#ff8a3d", player.heatT / 3]);
      }
      if (on && stats.slip && player.slipT > 0) {
        want.push(["slip", "SLIPSTREAM", "#7ff6ff", player.slipT / 1.37]);
      }
      if (on && stats.skates && player.skating) {
        want.push(["skate", "SKATES", "#bff4ff", -1]);
      }
      const row = getById("buffs");
      if (!row) return;
      for (const id of timedBuffChips)
        if (!want.some((chip) => chip[0] === id)) row.querySelector(`[data-b="${id}"]`)?.remove();
      for (const [id, text, color, left] of want) {
        let el = row.querySelector(`[data-b="${id}"]`);
        if (!el) {
          el = document.createElement("span");
          el.className = "buff";
          el.dataset.b = id;
          el.style.setProperty("--bc", color);
          el.innerHTML = escapeHtml(text) + (left >= 0 ? "<i></i>" : "");
          row.appendChild(el);
        }
        const bar = el.querySelector("i");
        if (bar) {
          bar.style.transform = `scaleX(${clamp(left, 0, 1).toFixed(2)})`;
        }
      }
    }
    showChoose(world) {
      let bossReward = world.offerBoss;
      getById("chooseEyebrow").textContent = bossReward
        ? `${bossDefs[world.bossKills[world.bossKills.length - 1]] ? bossDefs[world.bossKills[world.bossKills.length - 1]].name : "BOSS"} DEFEATED`
        : `WAVE ${world.wave} CLEARED`;
      getById("chooseTitle").textContent = bossReward ? "Claim a rare reward" : "Choose an upgrade";
      let hpFrac = clamp(world.player.hp / world.stats.maxHp, 0, 1);
      getById("chooseHp").style.transform = `scaleX(${hpFrac})`;
      getById("chooseHpNum").textContent = `${Math.ceil(world.player.hp)}/${world.stats.maxHp}`;
      this.renderCards(world);
      this.coverHud(true);
      getById("choose").hidden = false;
    }
    renderCards(world) {
      // 2.4.2: the reroll label survives a re-render (reroll), so drop its old key hint first
      getById("rerollBtn")
        .querySelectorAll(".card-key")
        .forEach((el) => el.remove());
      let cards = getById("cards");
      cards.innerHTML = world.offer
        .map((id, i) => {
          let up = upgradesById[id],
            level = world.up[id] || 0,
            tag = up.evo
              ? "EVOLUTION"
              : up.repeat
                ? rarityNames[up.rarity].toUpperCase()
                : level
                  ? `LV ${level} \u2192 ${level + 1}`
                  : `NEW \xB7 ${rarityNames[up.rarity].toUpperCase()}`,
            evo = this.evoHint(up, world),
            delta = this.statDelta(id, world);
          return `<button class="card r${up.rarity}" data-pick="${id}" style="animation-delay:${i * 70}ms"><span class="cico">${iconSvg(up.icon)}</span><span><span class="ctop"><b>${escapeHtml(up.name)}</b><span class="lv">${tag}</span></span><p>${escapeHtml(up.desc(level))}</p>${delta}${evo}</span></button>`;
        })
        .join("");
      cards.classList.add("locked");
      clearTimeout(this.armT);
      this.armT = setTimeout(() => cards.classList.remove("locked"), 650);
      for (let card of cards.querySelectorAll("[data-pick]")) {
        card.addEventListener("click", () => {
          if (!cards.classList.contains("locked")) {
            this.g.choose(card.dataset.pick);
          }
        });
        // 2.7.0: a soft tick when the mouse moves over a card (touch has no hover)
        card.addEventListener("pointerenter", (ev) => {
          if (ev.pointerType === "mouse" && !cards.classList.contains("locked")) this.g.sound.play("hover");
        });
      }
      getById("rerollTxt").textContent = `Reroll (${world.rerolls})`;
      getById("rerollBtn").disabled = world.rerolls <= 0;
      getById("buildStrip").innerHTML = this.buildHtml(world);
      // 2.5.0 D: every upgrade that is offered counts as seen (also after a reroll and in a resumed run)
      try {
        this.markSeen((world.offer || []).filter((id) => upgradesById[id]).map((id) => "up_" + id));
      } catch (err) {
        console.warn("codex", err);
      }
      // 2.4.2: keys 1–4 pick a card, R rerolls (keyboard players only)
      if (!RL_INPUT.touch) {
        getById("cards")
          .querySelectorAll("[data-pick]")
          .forEach((card, i) => {
            card.classList.add("has-key");
            card.insertAdjacentHTML("beforeend", `<kbd class="card-key" aria-hidden="true">${i + 1}</kbd>`);
          });
        getById("rerollTxt").insertAdjacentHTML("afterend", '<kbd class="card-key inline" aria-hidden="true">R</kbd>');
      }
    }
    statDelta(id, world) {
      let player = world.player,
        stats = world.stats;
      if (id === "heal") {
        let healed = Math.min(stats.maxHp, player.hp + stats.maxHp * 0.45);
        return `<small class="delta">Hull ${Math.ceil(player.hp)} \u2192 ${Math.ceil(healed)}</small>`;
      }
      let next = computeStats(world.weapon, { ...world.up, [id]: (world.up[id] || 0) + 1 }, world.ws),
        lines = [];
      for (let [label, get, format] of statRows) {
        let before = get(stats),
          after = get(next);
        if (Math.abs(before - after) < 1e-6) continue;
        lines.push(`${label} ${format(before)} \u2192 ${format(after)}`);
        if (lines.length >= 2) break;
      }
      return lines.length ? `<small class="delta">${escapeHtml(lines.join(" \xB7 "))}</small>` : "";
    }
    evoHint(up, world) {
      if (up.evo)
        return `<small class="evo-hint">Merges ${Object.keys(up.evo)
          .map((id) => escapeHtml(upgradesById[id].name))
          .join(" + ")}</small>`;
      let evos = upgradeList.filter(
          (evo) => evo.evo && evo.evo[up.id] && !world.up[evo.id] && (!evo.weapon || evo.weapon === world.weapon),
        ),
        evo = evos.find((evo) => evo.weapon) || evos[0];
      if (!evo) return "";
      let others = Object.keys(evo.evo)
          .filter((id) => id !== up.id)
          .map((id) => `${upgradesById[id].name} ${Math.min(world.up[id] || 0, evo.evo[id])}/${evo.evo[id]}`),
        mine = `${Math.min((world.up[up.id] || 0) + 1, evo.evo[up.id])}/${evo.evo[up.id]}`;
      return `<small class="evo-hint">\u2192 ${escapeHtml(evo.name)}: this ${mine} \xB7 ${escapeHtml(others.join(", "))}</small>`;
    }
    hideChoose() {
      getById("choose").hidden = true;
      this.coverHud(false);
    }
    coverHud(on) {
      getById("hud").style.visibility = on ? "hidden" : "";
      if (on) {
        getById("banner").innerHTML = "";
        clearTimeout(this.bannerT);
      }
      // 2.5.0 D: the upgrade choice and the pause menu hide the title cards like the banner
      if (on) {
        this.clearTitleCard();
      }
    }
    buildHtml(world) {
      let own = upgradeList.filter((upgrade) => world.up[upgrade.id] && !upgrade.repeat);
      return own.length
        ? own
            .map(
              (upgrade) =>
                `<span class="bi r${upgrade.rarity}" title="${escapeHtml(upgrade.name)}">${iconSvg(upgrade.icon)}${escapeHtml(upgrade.name)}${world.up[upgrade.id] > 1 ? " \xD7" + world.up[upgrade.id] : ""}</span>`,
            )
            .join("")
        : '<span class="note">No upgrades yet.</span>';
    }
    showPause(world) {
      getById("pauseTitle").textContent = `Wave ${world.wave}${world.endless ? " \xB7 Endless" : ""}`;
      getById("pauseStats").innerHTML =
        `<span>${formatTime(world.time)}</span><span>${formatCount(world.kills)} KILLS</span><span>${formatCount(world.shards)} SHARDS</span>`;
      getById("pauseBuild").innerHTML = this.buildHtml(world);
      this.coverHud(true);
      getById("pause").hidden = false;
      this.screen = "pause";
      // 2.4.2: the build in the pause menu explains each upgrade on tap or click
      const own = upgradeList.filter((upgrade) => world.up[upgrade.id] && !upgrade.repeat),
        info = getById("pauseUpInfo");
      if (own.length) {
        getById("pauseBuild").innerHTML = own
          .map(
            (upgrade) =>
              `<button type="button" class="bi r${upgrade.rarity}" data-up="${upgrade.id}" aria-label="${escapeHtml(upgrade.name)}">${iconSvg(upgrade.icon)}${escapeHtml(upgrade.name)}${world.up[upgrade.id] > 1 ? " \xD7" + world.up[upgrade.id] : ""}</button>`,
          )
          .join("");
      }
      info.hidden = !own.length;
      info.innerHTML = '<p class="note">Select an upgrade to see what it does.</p>';
    }
    hidePause() {
      // 2.4.2: also closes settings opened from the pause menu
      closePauseSettings(this);
      getById("pause").hidden = true;
      getById("settings").hidden = true;
      this.coverHud(false);
    }
    // 2.4.2: settings from the pause menu (without backup and reset)
    openPauseSettings() {
      if (!this.g.paused || getById("pause").hidden) return;
      this.rlFromPause = true;
      getById("pause").hidden = true;
      getById("settings").classList.add("in-run");
      this._show("settings");
    }
    showOver(result) {
      getById("overEyebrow").textContent = result.win
        ? `${threatLevels[result.threat].name.toUpperCase()} \xB7 ALL ${20} WAVES`
        : `${weaponDefs[result.weapon].name.toUpperCase()} \xB7 ${threatLevels[result.threat].name.toUpperCase()}`;
      let title = getById("overTitle");
      title.textContent = result.win ? "RIFT SEALED" : result.abandoned ? "RUN ENDED" : "SIGNAL LOST";
      title.className = "over-title " + (result.win ? "win" : "lose");
      getById("overBest").hidden = !(result.best || result.fastest);
      getById("overBest").textContent = result.fastest && !result.best ? "NEW FASTEST" : "NEW BEST";
      let killer = result.killer ? enemyDefs[result.killer] || bossDefs[result.killer] : null;
      getById("overCause").hidden =
        !killer && result.killer !== "lava" && result.killer !== "acid" && result.killer !== "trap";
      if (killer) {
        getById("overCause").textContent = `Destroyed by ${bossDefs[result.killer] ? killer.name : "a " + killer.name}`;
      } else {
        if (result.killer === "lava") {
          getById("overCause").textContent = "Burned by a lava vent";
        } else {
          if (result.killer === "acid") {
            getById("overCause").textContent = "Dissolved in acid";
          } else if (result.killer === "trap") {
            getById("overCause").textContent = "Crushed by a trap";
          }
        }
      }
      getById("overStats").innerHTML = [
        ["Wave", result.wave],
        ["Time", formatTime(result.time)],
        ["Kills", result.kills],
        ["Bosses", result.bosses],
      ]
        .map(([label, value]) => `<div class="cell"><div class="k">${label}</div><div class="v">${value}</div></div>`)
        .join("");
      getById("payRows").innerHTML = result.rows
        .map(
          ([label, value]) =>
            `<div class="pay-row"><span>${escapeHtml(label)}</span><span class="num">${escapeHtml(value)}</span></div>`,
        )
        .join("");
      getById("overMs").innerHTML =
        (result.unlocks || [])
          .map((text) => `<span class="chip">${iconSvg("star")} ${escapeHtml(text)}</span>`)
          .join("") +
        result.milestones
          .map((text) => `<span class="chip">${iconSvg("trophy")} Milestone ready: ${escapeHtml(text)}</span>`)
          .join("");
      this.renderDamage(result);
      getById("endlessBtn").hidden = !result.canEndless;
      getById("retryBtn").hidden = result.canEndless;
      getById("over").hidden = false;
      this.countUp(getById("payTotal"), result.total);
      this.renderRunExtra();
    }
    // 1.6.0: run metrics for the game-over screen (game._runExtra, set in game.endRun)
    renderRunExtra() {
      const box = getById("overExtra"),
        extra = this.g && this.g._runExtra;
      if (!box) return;
      if (!extra) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      box.innerHTML =
        '<div class="dh">Run performance</div><div class="run-extra-grid">' +
        [
          ["Damage dealt", formatCount(Math.round(extra.dmgDealt || 0))],
          ["Damage taken", formatCount(Math.round(extra.dmgTaken || 0))],
          ["Crits", formatCount(extra.critHits || 0)],
          ["Dashes", formatCount(extra.dashes || 0)],
          ["Best combo", "×" + formatCount(extra.bestCombo || 0)],
        ]
          .map(
            ([label, value]) =>
              `<div class="xcell"><div class="xk">${escapeHtml(label)}</div><div class="xv num">${escapeHtml(value)}</div></div>`,
          )
          .join("") +
        "</div>";
    }
    renderDamage(result) {
      let box = getById("overDmg"),
        bySource = result.dmgSrc || {},
        sources = Object.entries(bySource)
          .filter(([, dmg]) => dmg >= 1)
          .sort((a, b) => b[1] - a[1]),
        total = sources.reduce((sum, [, dmg]) => sum + dmg, 0);
      box.hidden = !sources.length || total < 50;
      if (box.hidden) return;
      let shown = sources.slice(0, 4),
        rest = sources.slice(4).reduce((sum, [, dmg]) => sum + dmg, 0);
      if (rest > 0) {
        shown.push(["other", rest]);
      }
      let top = shown[0][1];
      box.innerHTML =
        '<div class="dh">Damage dealt</div>' +
        shown
          .map(([src, dmg]) => {
            let label = src === "weapon" ? result.weaponName : damageSources[src] ? damageSources[src][0] : "Other",
              color =
                src === "weapon"
                  ? "#" + weaponDefs[result.weapon].color.toString(16).padStart(6, "0")
                  : damageSources[src]
                    ? damageSources[src][1]
                    : "#93a2bf",
              pct = Math.round((dmg / total) * 100);
            return `<div class="dmg-row" style="--dc:${color}"><span>${escapeHtml(label)}</span><span class="num">${formatCount(dmg)} \xB7 ${pct}%</span><span class="db"><i style="transform:scaleX(${(dmg / top).toFixed(3)})"></i></span></div>`;
          })
          .join("");
    }
    hideOver() {
      getById("over").hidden = true;
    }
    countUp(el, total) {
      let start = performance.now(),
        duration = 900,
        step = (now) => {
          let k = clamp((now - start) / duration, 0, 1);
          el.textContent = formatCount(Math.round(total * (1 - Math.pow(1 - k, 3))));
          if (k < 1) {
            requestAnimationFrame(step);
          }
        };
      requestAnimationFrame(step);
    }
    showCrash(log) {
      for (let id of ["choose", "pause", "over"]) getById(id).hidden = true;
      this.showHud(false);
      getById("crashLog").value = log;
      getById("crash").hidden = false;
    }
    hideCrash() {
      getById("crash").hidden = true;
    }
    // 3.0.0: the GADGET button reacts to the simulation: "ready" pops it, "deny" shakes it
    gadgetFlash(kind) {
      const btn = getById("gadgetBtn");
      btn.classList.remove(kind);
      btn.offsetWidth;
      btn.classList.add(kind);
    }
    hurtFlash() {
      if (this.calm) return;
      let el = getById("flash");
      el.classList.add("on");
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("on")));
    }
    // ---- 2.5.0 D: title cards (see the note above RL_BIOME_CARD)
    clearTitleCard() {
      this.titleCardN = (this.titleCardN || 0) + 1;
      this.cardHold = null;
      clearTimeout(this.titleCardT);
      const el = getById("titleCard");
      if (el) {
        el.innerHTML = "";
      }
    }
    // biome title card; it replaces the wave banner of its wave
    biomeCard(biome, wave, ms = 9000) {
      const info = rlBiomeCardInfo(biome);
      holdTitleCard(
        this,
        "biome",
        `<div class="tcard biome hold" data-biome="${escapeHtml(info.id)}" style="--bc:${info.color}"><div class="tc-band"><div class="tc-eye">${wave ? `Wave ${escapeHtml(wave)} \xB7 ` : ""}Entering</div><div class="tc-name">${escapeHtml(info.name)}</div>${info.hazard ? `<div class="tc-haz">${escapeHtml(info.hazard)}</div>` : ""}${info.boss ? `<div class="tc-boss"><span>Boss</span>${escapeHtml(info.boss)}</div>` : ""}</div></div>`,
        2500,
        ms,
      );
      return info;
    }
    // boss intro card, shown during the camera pan to a new boss
    bossCard(id, biome, ms = 9000) {
      const boss = bossDefs[id];
      if (!boss) return null;
      holdTitleCard(
        this,
        "boss",
        `<div class="tcard boss hold" data-boss="${escapeHtml(id)}" style="--bc:${rlHex(boss.color)}"><div class="tc-panel"><i class="tc-accent"></i><div class="tc-eye">Boss${biome ? " \xB7 " + escapeHtml(biome.name) : ""}</div><div class="tc-name">${escapeHtml(boss.name)}</div><i class="tc-line"></i><div class="tc-title">${escapeHtml(boss.title)}</div></div></div>`,
        2800,
        ms,
      );
      return boss;
    }
    // fades the held card out in 0.5 s, after it has been on screen for its minimum time
    releaseTitleCard() {
      const hold = this.cardHold;
      if (!hold) return;
      this.cardHold = null;
      if (this.titleCardN !== hold.token) return; // another card replaced it
      clearTimeout(this.titleCardT);
      this.titleCardT = setTimeout(
        () => {
          if (this.titleCardN !== hold.token) return;
          const card = document.querySelector("#titleCard .tcard");
          if (card) {
            card.classList.add("out");
          }
          this.titleCardT = setTimeout(
            () => this.titleCardN === hold.token && (getById("titleCard").innerHTML = ""),
            520,
          );
        },
        Math.max(0, hold.min - (performance.now() - hold.at)),
      );
    }
    // ---- 2.5.0 D: Codex "seen" keys; saves only when something is new
    markSeen(keys) {
      const seen = this.save && this.save.seen;
      if (!seen) return 0;
      let added = 0;
      for (const key of keys) {
        if (seen[key] !== true) {
          seen[key] = true;
          added++;
        }
      }
      if (added) {
        this.g.store.save("codex");
      }
      return added;
    }
    // ---- 2.5.0 D: Records: Stats / Codex tabs (built on first use, the page markup stays as it was)
    recordsTab(tab) {
      ensureRecordTabs(this);
      this.recTab = tab === "codex" ? "codex" : "stats";
      for (const btn of getById("recTabs").querySelectorAll("[data-rtab]")) {
        const on = btn.dataset.rtab === this.recTab;
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      }
      getById("records").querySelector(".scroll").hidden = this.recTab !== "stats";
      getById("codexList").hidden = this.recTab !== "codex";
      if (this.recTab === "codex") {
        this.renderCodex();
      }
      requestAnimationFrame(() => window.__riftLayoutAudit?.());
    }
    renderCodex() {
      const codex = rlCodexEntries(this.save),
        all = [...codex.enemies, ...codex.bosses, ...codex.upgrades],
        found = all.filter((entry) => entry.seen).length,
        rows = (list, hint) =>
          list
            .map((entry) => {
              const cls = `row panel cx${entry.seen ? "" : " unseen"}${entry.rarity ? " r" + entry.rarity : ""}`;
              if (!entry.seen)
                return `<div class="${cls}" data-cx="${escapeHtml(entry.key)}"><div class="rico">${iconSvg("lock")}</div><div><b>???</b><small>${escapeHtml(hint)}</small></div></div>`;
              return `<div class="${cls}" data-cx="${escapeHtml(entry.key)}"${entry.color ? ` style="--cc:${entry.color}"` : ""}><div class="rico">${iconSvg(entry.icon)}</div><div><b>${escapeHtml(entry.name)}</b><small>${escapeHtml(entry.desc)}</small>${entry.extra ? `<small class="cx-extra">${escapeHtml(entry.extra)}</small>` : ""}</div>${entry.tag ? `<span class="chip">${escapeHtml(entry.tag)}</span>` : ""}</div>`;
            })
            .join(""),
        part = (title, list, hint) =>
          `<h3 class="section-h">${title} <span class="cx-count">${list.filter((entry) => entry.seen).length}/${list.length}</span></h3><div class="codex-grid">${rows(list, hint)}</div>`;
      getById("codexList").innerHTML =
        `<p class="page-intro cx-intro"><b class="num">${found}/${all.length}</b> discovered. Enemies and bosses unlock when you meet them, upgrades when a run offers them.</p>` +
        part("Enemies", codex.enemies, "Not encountered yet") +
        part("Bosses", codex.bosses, "Not encountered yet") +
        part("Upgrades", codex.upgrades, "Not offered yet");
    }
  };
// 2.4.2: state of the FPS counter in the HUD
const hudFpsMeter = { frames: 0, since: 0, last: 0, fps: 0, shown: "" };
// 2.5.0 A: HUD chips of the timed upgrades, managed next to the chips of GameUI.buffs
const timedBuffChips = ["heat", "slip", "skate"];
// 2.4.2: closes settings that were opened from the pause menu
function closePauseSettings(ui) {
  ui.g.sound.stopPreview();
  ui.rlFromPause = false;
  getById("settings").hidden = true;
  getById("settings").classList.remove("in-run");
}

/* ==========================================================================
 2.5.0 D: design — biome title card, boss intro card, Codex in Records
 - a new biome (wave 1 and every biome change) gets a full-width title card instead of the plain
   wave banner: biome name, its hazard in a few words and the boss that waits at its end
 - while the camera pans to a new boss (game.intro), a bigger name card shows the boss name and
   title with a short accent in the boss colour
 - Records get a second tab, the Codex: enemies, bosses and upgrades. Seen entries show their name
   and a short description, unseen ones "???". "Seen" lives in store.data.seen: enemy_<type> (set
   by the first-encounter tips), boss_<id> (set when a boss spawns) and up_<id> (set when an
   upgrade is offered). Old saves without these keys fall back to what the save already proves:
   defeated bosses (stats.bosses) and upgrades in recent builds or the saved run.
 Both cards take no input (pointer-events: none). They hold while the game needs them (first 1.6 s
 of the wave, the boss camera pan; see main.js) and then fade out.
 ========================================================================== */
// the hazard of each biome in a few words (the RL_BIOME_INFO tag is the fallback for new biomes)
const RL_BIOME_CARD = {
  yard: "Open ground — no hazards",
  works: "Lava vents erupt — lure enemies onto them",
  vault: "Slick floor and ice sheets — mind your drift",
  marsh: "Acid pools eat your hull — and weaken enemies",
  void: "Portal pairs fold the arena — shots pass through",
};
// Codex texts for enemies without a first-encounter tip. Mites only come out of splitters (no
// spawn event, no tip), so they are known together with the Splitter.
const RL_CODEX_EXTRA = {
  mite: "Mites burst out of destroyed Splitters. Small and fast, but one shot each.",
};
const RL_CODEX_WITH = { mite: "splitter" };
const rlHex = (color) => "#" + ((Number(color) >>> 0) & 0xffffff).toString(16).padStart(6, "0");
function rlBiomeCardInfo(biome) {
  biome = biome || biomeList[0];
  const bossId = bossByBiome[biome.id],
    boss = bossId && bossDefs[bossId];
  return {
    id: biome.id,
    name: biome.name,
    hazard: RL_BIOME_CARD[biome.id] || biome.tag || "",
    boss: boss ? boss.name : "",
    color: rlHex(biome.grid != null ? biome.grid : 0x49f2ff),
  };
}
// Codex entries of a save. Names and texts come from the data tables at run time, so added or
// removed enemies, bosses and upgrades show up without changes here.
function rlCodexEntries(save) {
  const data = save || {},
    seen = data.seen || {},
    beaten = (data.stats && data.stats.bosses) || {},
    offered = new Set();
  // saves from before the Codex never stored up_<id>; builds in the run history and the saved run
  // show which upgrades the player has been offered already
  for (const run of Array.isArray(data.history) ? data.history : [])
    for (const id of (run && Array.isArray(run.build) && run.build) || []) offered.add(id);
  if (data.run && typeof data.run === "object") {
    for (const id of Object.keys(data.run.up || {})) offered.add(id);
    for (const id of Array.isArray(data.run.offer) ? data.run.offer : []) offered.add(id);
  }
  const enemyIds = [
      ...enemyOrder.filter((id) => enemyDefs[id]),
      ...Object.keys(enemyDefs).filter((id) => !enemyOrder.includes(id)),
    ],
    bossBiome = Object.fromEntries(Object.entries(bossByBiome).map(([biomeId, id]) => [id, biomesById[biomeId]])),
    // the usual route: Neon Yard first, Void Core last
    rank = (id) => (id === "warden" ? 0 : id === "core" ? 9 : 1),
    bossIds = [
      ...new Set([
        ...biomeList.map((biome) => bossByBiome[biome.id]).filter((id) => bossDefs[id]),
        ...Object.keys(bossDefs),
      ]),
    ].sort((idA, idB) => rank(idA) - rank(idB));
  const enemies = enemyIds.map((id) => ({
      key: "enemy_" + id,
      id,
      seen: seen["enemy_" + id] === true || (!!RL_CODEX_WITH[id] && seen["enemy_" + RL_CODEX_WITH[id]] === true),
      name: enemyDefs[id].name,
      desc: RL_ENEMY_TIPS[id] || RL_CODEX_EXTRA[id] || "A creature of the rift.",
      color: rlHex(enemyDefs[id].color),
      icon: "skull",
    })),
    bosses = bossIds.map((id) => {
      const boss = bossDefs[id],
        kills = +beaten[id] || 0,
        bio = bossBiome[id];
      return {
        key: "boss_" + id,
        id,
        seen: seen["boss_" + id] === true || kills > 0,
        name: boss.name,
        desc: boss.title + (bio ? ` \xB7 ${bio.name}` : ""),
        extra: kills > 0 ? `Defeated \xD7${kills}` : "",
        color: rlHex(boss.color),
        icon: "target",
      };
    }),
    upgrades = upgradeList.map((up) => {
      let desc = "";
      try {
        desc = typeof up.desc === "function" ? up.desc(0) : String(up.desc || "");
      } catch {}
      const weapon = up.weapon && weaponDefs[up.weapon];
      return {
        key: "up_" + up.id,
        id: up.id,
        seen: seen["up_" + up.id] === true || offered.has(up.id),
        name: up.name,
        desc,
        extra: weapon ? weapon.name + " only" : "",
        rarity: up.evo ? 5 : up.rarity,
        tag: up.evo ? "Evolution" : rarityNames[up.rarity] || "",
        icon: up.icon,
      };
    });
  return { enemies, bosses, upgrades };
}
// ---- 2.5.0 D: title card helpers
function titleCardLayer() {
  let el = getById("titleCard");
  if (!el) {
    el = document.createElement("div");
    el.id = "titleCard";
    el.setAttribute("aria-live", "polite");
    const banner = getById("banner");
    if (banner) {
      banner.after(el);
    } else {
      getById("app").appendChild(el);
    }
  }
  return el;
}
// The card starts after the next frame is on screen: the first frame of a new arena or boss can
// take long on slow devices (shader compiles), and the card must not run out during that stall.
function showTitleCard(ui, html, ms) {
  const el = titleCardLayer(),
    token = (ui.titleCardN = (ui.titleCardN || 0) + 1);
  clearTimeout(ui.titleCardT);
  el.innerHTML = "";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (ui.titleCardN !== token) return;
      el.innerHTML = html;
      ui.titleCardT = setTimeout(() => ui.titleCardN === token && (el.innerHTML = ""), ms + 60);
    }),
  );
  return token;
}
// Both cards hold until the game releases them (releaseTitleCard), because they follow game time:
// the biome card the first 1.6 s of its wave, the boss card the camera pan. Game time runs slower
// than the clock on a slow device and stalls while a new arena or boss is first drawn, so a card
// on a clock timer could be gone before the player saw it. `ms` is only a safety limit.
function holdTitleCard(ui, kind, html, min, ms) {
  getById("banner").innerHTML = "";
  clearTimeout(ui.bannerT);
  ui.cardHold = { token: showTitleCard(ui, html, ms), kind, at: performance.now(), min };
}
// ---- 2.5.0 D: the Stats / Codex tabs of Records, built on first use
function ensureRecordTabs(ui) {
  if (getById("recTabs")) return;
  const rec = getById("records"),
    main = rec.querySelector(".scroll");
  if (!main.id) {
    main.id = "recStats";
  }
  rec
    .querySelector(".topbar")
    .insertAdjacentHTML(
      "afterend",
      '<div id="recTabs" class="seg rec-tabs" role="tablist"><button type="button" role="tab" data-rtab="stats" class="on" aria-selected="true">Stats</button><button type="button" role="tab" data-rtab="codex" aria-selected="false">Codex</button></div>',
    );
  main.insertAdjacentHTML("afterend", '<div id="codexList" class="scroll codex" hidden></div>');
  for (const btn of getById("recTabs").querySelectorAll("[data-rtab]"))
    ui.click(btn, () => ui.recordsTab(btn.dataset.rtab));
}

export {
  GameUI,
  iconSvg,
  RL_TOUCH_CLICK_GUARD,
  getById,
  rlBiomeTitle,
  rlRenderHistory,
  iconPaths,
  escapeHtml,
  RL_BIOME_CARD,
  rlBiomeCardInfo,
  rlCodexEntries,
};
