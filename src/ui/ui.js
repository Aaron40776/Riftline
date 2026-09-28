// DOM UI (GameUI): screens, HUD, dialogs, workshop, records and settings, plus DOM helpers and icons.

import {
  RL_RT,
  clearErrorLog,
  rlRunHealth,
  onLogChange,
  set_RL_LAST_RUN_AUDIT,
  getErrorLog,
  buildReport,
} from "../core/diagnostics.js";
import { enemyDefs, bossDefs } from "../data/enemies.js";
import { store } from "../main.js";
import { clamp, GAME_VERSION, formatCount, rlAgo, formatTime } from "../core/util.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { waveEvents } from "../core/waves.js";
import { milestones, workshopModules, rlRetired, threatLevels } from "../data/progression.js";
import { upgradeList, rarityNames, upgradesById } from "../data/upgrades.js";
import { computeStats, weaponRange } from "../core/stats.js";

var RL_TOUCH_CLICK_GUARD = { until: 0, x: 0, y: 0, key: "" };
function rlUiClickKey(t) {
  if (!t) return "";
  if (t.id) return "id:" + t.id;
  const e = t.dataset || {};
  return e.buy
    ? "buy:" + e.buy
    : e.claim
      ? "claim:" + e.claim
      : e.go
        ? "go:" + e.go
        : t.hasAttribute && t.hasAttribute("data-back")
          ? "back"
          : "";
}
function rlRenderHistory() {
  const el = document.getElementById("runHist");
  if (!el) return;
  const h = store.data.history || [];
  if (!h.length) {
    el.innerHTML = '<p class="note">No runs yet — your last 12 runs appear here.</p>';
    return;
  }
  const killerName = (id) =>
    id === "lava"
      ? "a lava vent"
      : id === "acid"
        ? "acid"
        : enemyDefs[id]
          ? "a " + enemyDefs[id].name
          : bossDefs[id]
            ? bossDefs[id].name
            : "";
  el.innerHTML = h
    .map((q) => {
      const icon = q.outcome === "win" ? "trophy" : q.outcome === "quit" ? "close" : "skull",
        kn = q.outcome === "dead" ? killerName(q.killer) : "";
      const meta = [
        threatLevels[q.threat].name,
        formatTime(q.time),
        formatCount(q.kills) + " kills",
        "+" + formatCount(q.shards) + " shards",
        kn && "by " + kn,
        q.outcome === "quit" && "abandoned",
      ]
        .filter(Boolean)
        .join(" · ");
      const build = q.build.map((id) => upgradesById[id].name).join(" · ");
      return `<div class="row panel hist ${q.outcome}"><div class="rico">${iconSvg(icon)}</div><div><b>${q.outcome === "win" ? "Rift sealed" : "Wave " + q.wave}${q.endless ? " · Endless" : ""} · ${escapeHtml((weaponDefs[q.weapon] || rlRetired(q.weapon)).name)}</b><small>${escapeHtml(meta)}</small>${build ? `<small class="hist-build">${escapeHtml(build)}</small>` : ""}</div><span class="chip">${rlAgo(q.t)}</span></div>`;
    })
    .join("");
}
function rlBiomeTitle(b) {
  return b.tag ? `${b.name} \xB7 ${b.tag}` : b.name;
}
var iconPaths = {
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
function iconSvg(i, t = "") {
  let e = iconPaths[i] || iconPaths.info;
  return `<svg class="ico ${t}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${e}</svg>`;
}
var getById = (i) => document.getElementById(i),
  menuScreens = ["home", "workshop", "records", "settings"],
  formatTenths = (i) => (Math.round(i * 10 + 1e-6) / 10).toString(),
  formatPercent = (i) => Math.round(i * 100) + "%",
  formatCooldown = (i) => (i > 0 ? formatTenths(i) + " s" : "off"),
  statRows = [
    ["Damage", (i) => i.weapon.dmg * i.dmgMul, formatTenths],
    ["Fire rate", (i) => i.weapon.rate * i.rateMul, (i) => formatTenths(i) + "/s"],
    ["Projectiles", (i) => i.weapon.count + (i.weapon.cone ? i.extra * 2 : i.extra), String],
    ["Pierce", (i) => (i.pierce > 99 ? 0 : i.pierce), String],
    ["Bounces", (i) => i.bounce, String],
    ["Crit", (i) => i.crit, formatPercent],
    ["Max HP", (i) => i.maxHp, String],
    ["Speed", (i) => i.speed, (i) => formatTenths(i) + " m/s"],
    ["Range", (i) => i.range, (i) => Math.round(i) + " m"],
    ["Pickup radius", (i) => i.magnet, (i) => formatTenths(i) + " m"],
    ["Dash cooldown", (i) => i.dashCd, formatCooldown],
    ["Aegis every", (i) => i.shieldCd, formatCooldown],
    ["Regen", (i) => i.regen, (i) => formatTenths(i) + " HP/s"],
    ["Blades", (i) => i.orbit, String],
    ["Blade damage", (i) => (i.orbit ? i.orbitDmg * i.dmgMul : 0), formatTenths],
    ["Slow chance", (i) => i.cryo, formatPercent],
    ["Chain chance", (i) => i.arc, formatPercent],
    ["Bolt jumps", (i) => i.chain, String],
    ["Flame burn", (i) => (i.burn ? i.burn * i.burnMul * i.dmgMul : 0), (i) => formatTenths(i) + "/s"],
    ["Chain jumps", (i) => (i.arc ? i.arcJumps : 0), String],
    ["Blast", (i) => i.payloadF, formatPercent],
    ["Burn", (i) => i.thermite, formatPercent],
    ["Repair chance", (i) => i.siphonCh, formatPercent],
    ["Nova radius", (i) => i.novaR, (i) => formatTenths(i) + " m"],
    ["Drones", (i) => i.wingmen, String],
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
    other: ["Other", "#93a2bf"],
  },
  escapeHtml = (i) =>
    String(i).replace(/[&<>"']/g, (t) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[t]),
  GameUI = class {
    constructor(t) {
      ((this.g = t),
        (this.screen = "home"),
        (this.stack = []),
        (this.viewWeapon = 0),
        (this.viewThreat = 0),
        (this.hudCache = {}),
        (this.dlgResolve = null),
        this.fillIcons(document),
        (getById("pauseBtn").innerHTML = iconSvg("pause")),
        this.bind());
    }
    fillIcons(t) {
      for (let e of t.querySelectorAll("[data-icon]"))
        e.dataset.filled || ((e.dataset.filled = "1"), e.insertAdjacentHTML("afterbegin", iconSvg(e.dataset.icon)));
    }
    get save() {
      return this.g.store.data;
    }
    click(t, e) {
      if (!t) return;
      let n = 0,
        s = 0,
        r = 0,
        o = 0,
        h = () => {
          if (t.disabled || t.hidden) return !1;
          (this.g.sound.play("click"), e());
          return !0;
        };
      t.addEventListener(
        "pointerdown",
        (l) => {
          if ((l.pointerType === "touch" || l.pointerType === "pen") && l.isPrimary !== !1) {
            ((s = l.clientX), (r = l.clientY), (o = l.pointerId), (n = 1));
          }
        },
        { passive: !1 },
      );
      t.addEventListener(
        "pointerup",
        (l) => {
          if (!(l.pointerType === "touch" || l.pointerType === "pen") || !n || l.pointerId !== o) return;
          let u = l.clientX - s,
            d = l.clientY - r;
          if (((n = 0), Math.hypot(u, d) > 14 || !h())) return;
          (l.preventDefault(), l.stopPropagation());
          const c = performance.now();
          ((RL_TOUCH_CLICK_GUARD.until = c + 800),
            (RL_TOUCH_CLICK_GUARD.x = l.clientX),
            (RL_TOUCH_CLICK_GUARD.y = l.clientY),
            (RL_TOUCH_CLICK_GUARD.key = rlUiClickKey(t)));
        },
        { passive: !1 },
      );
      t.addEventListener(
        "pointercancel",
        (l) => {
          l.pointerId === o && (n = 0);
        },
        { passive: !0 },
      );
      t.addEventListener("click", (l) => {
        const u = performance.now(),
          g = RL_TOUCH_CLICK_GUARD,
          dx = Number(l.clientX) - g.x,
          dy = Number(l.clientY) - g.y,
          near = Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= 36,
          key = rlUiClickKey(t),
          same = !!(g.key && key && g.key === key) || near;
        if (u < g.until && same) {
          ((g.until = 0), (g.key = ""), RL_RT.uiGuardDrops++, l.preventDefault(), l.stopPropagation());
          return;
        }
        ((g.until = 0), (g.key = ""), h());
      });
    }
    bind() {
      for (let s of document.querySelectorAll("[data-go]")) this.click(s, () => this.show(s.dataset.go));
      for (let s of document.querySelectorAll("[data-back]")) this.click(s, () => this.back());
      (this.click(getById("wPrev"), () => this.stepWeapon(-1)),
        this.click(getById("wNext"), () => this.stepWeapon(1)),
        this.click(getById("tPrev"), () => this.stepThreat(-1)),
        this.click(getById("tNext"), () => this.stepThreat(1)),
        this.click(getById("wBuy"), () => this.buyWeapon()),
        this.click(getById("playBtn"), () => this.play()),
        this.click(getById("continueBtn"), () => this.g.startRun({ resume: !0 })));
      let t = (s, r) =>
        s.addEventListener("pointerdown", (a) => {
          (a.preventDefault(), a.stopPropagation(), r());
        });
      (t(getById("dashBtn"), () => {
        this.g.input.press("dash");
        let s = this.g.world,
          r = getById("dashBtn");
        s &&
          s.player.dashCdT > 0.08 &&
          (r.classList.remove("deny"), r.offsetWidth, r.classList.add("deny"), this.g.sound.play("deny"));
      }),
        t(getById("novaBtn"), () => {
          this.g.input.press("nova");
          let s = this.g.world,
            r = getById("novaBtn");
          s &&
            s.player.nova < 100 &&
            (r.classList.remove("deny"), r.offsetWidth, r.classList.add("deny"), this.g.sound.play("deny"));
        }),
        this.click(getById("pauseBtn"), () => this.g.pause()),
        this.click(getById("resumeBtn"), () => this.g.resume()),
        this.click(getById("abandonBtn"), async () => {
          (await this.confirm(
            "Abandon run?",
            "You keep the shards collected so far, but the run ends here.",
            "Abandon",
          )) && this.g.abandon();
        }),
        this.click(getById("rerollBtn"), () => this.g.reroll()),
        this.click(getById("restartBtn"), async () => {
          (await this.confirm(
            "Restart run?",
            "Shards collected so far are kept. A fresh run starts with the same weapon and threat.",
            "Restart",
          )) && this.g.restart();
        }),
        this.click(getById("retryBtn"), () => this.g.startRun({})),
        this.click(getById("homeBtn"), () => this.g.goHome()),
        this.click(getById("endlessBtn"), () => this.g.endless()),
        this.click(getById("crashHome"), () => this.g.recover()),
        this.click(getById("crashCopy"), () => this.copy(getById("crashLog").value)));
      let e = () => this.save.settings,
        n = (s, r) => {
          let a = getById(s);
          a.addEventListener("change", () => {
            ((e()[r] = a.checked), this.g.settingsChanged());
          });
        };
      (n("setAuto", "autoFire"),
        n("setAssist", "assist"),
        n("setSwap", "swap"),
        n("setShake", "shake"),
        n("setNumbers", "numbers"),
        n("setContrast", "contrast"),
        n("setCalm", "calm"));
      for (let [s, r] of [
        ["setSfx", "sfx"],
        ["setMusic", "music"],
      ]) {
        let a = getById(s);
        (a.addEventListener("input", () => {
          ((e()[r] = +a.value), this.g.settingsChanged(!0));
        }),
          a.addEventListener("change", () => {
            (this.g.settingsChanged(), r === "sfx" && this.g.sound.play("pick"));
          }));
      }
      for (let [s, r, a] of [
        ["setQuality", "quality", !1],
        ["setZoom", "zoom", !0],
      ])
        for (let o of getById(s).querySelectorAll("button"))
          this.click(o, () => {
            ((e()[r] = a ? +o.dataset.v : o.dataset.v), this.renderSettings(), this.g.settingsChanged());
          });
      (this.click(getById("resetBtn"), async () => {
        (await this.confirm(
          "Reset all progress?",
          "Shards, workshop, weapons, records and milestones are wiped. Settings stay.",
          "Continue",
        )) &&
          (await this.confirm("Really reset?", "This cannot be undone.", "Reset everything", !0)) &&
          this.g.resetProgress();
      }),
        this.click(getById("logBtn"), () => this.showLog()),
        onLogChange(() => {
          this.screen === "settings" && this.renderLog();
        }),
        getById("dialog").addEventListener("click", (s) => {
          s.target === getById("dialog") && this.closeDialog(null);
        }));
    }
    show(t) {
      (menuScreens.includes(this.screen) && this.screen !== t && this.stack.push(this.screen), this._show(t));
    }
    _show(t) {
      for (let e of menuScreens) getById(e).hidden = e !== t;
      ((this.screen = t),
        t === "home" && ((this.stack = []), this.renderHome()),
        t === "workshop" && this.renderWorkshop(),
        t === "records" && this.renderRecords(),
        t === "settings" && this.renderSettings());
    }
    back() {
      this._show(this.stack.pop() || "home");
    }
    hideMenus() {
      for (let t of menuScreens) getById(t).hidden = !0;
      this.screen = "game";
    }
    renderHome() {
      let t = this.save;
      getById("bank").textContent = formatCount(t.shards);
      for (let r of document.querySelectorAll(".bankMirror")) r.textContent = formatCount(t.shards);
      ((this.viewWeapon == null || !weaponOrder[this.viewWeapon]) && (this.viewWeapon = 0),
        this.homeInit ||
          ((this.viewWeapon = weaponOrder.indexOf(t.weapon)), (this.viewThreat = t.threat), (this.homeInit = !0)),
        this.renderWeapon(),
        this.renderThreat());
      let e = t.run,
        n = getById("continueBtn");
      (e
        ? ((n.hidden = !1),
          (n.innerHTML = `${iconSvg("play")}CONTINUE \xB7 WAVE ${e.wave + (e.offer ? 1 : 0)} \xB7 ${escapeHtml(weaponDefs[e.weapon].name)}`),
          getById("playBtn").classList.remove("primary"))
        : ((n.hidden = !0), getById("playBtn").classList.add("primary")),
        this.updatePlayState(),
        (getById("recBadge").hidden = !this.g.claimable().length));
      let s = t.stats;
      ((getById("bestLine").hidden = !s.runs),
        s.runs &&
          (getById("bestLine").textContent =
            `Best wave ${s.bestWave}` + (s.clears ? ` \xB7 ${s.clears} clear${s.clears > 1 ? "s" : ""}` : "")));
    }
    renderWeapon() {
      let t = this.save,
        e = weaponOrder[this.viewWeapon],
        n = weaponDefs[e],
        s = !!t.weapons[e],
        r = document.querySelector(".weapon-card");
      (r.classList.toggle("locked", !s),
        r.style.setProperty("--wc", "#" + n.color.toString(16).padStart(6, "0")),
        (getById("wIndex").textContent = `${this.viewWeapon + 1}/${weaponOrder.length}`),
        (getById("wName").innerHTML = (s ? "" : iconSvg("lock", "inline")) + escapeHtml(n.name)),
        getById("wName").querySelector(".ico") &&
          (getById("wName").querySelector(".ico").style.cssText =
            "display:inline-block;vertical-align:-3px;margin-right:6px;width:18px;height:18px"),
        (getById("wBlurb").textContent = n.blurb));
      let a = n.dmg * n.count + (n.explodeDmg || 0),
        o = weaponRange(n),
        c = (u) => {
          let d = clamp(Math.round(u), 1, 8);
          return (
            '<div class="segs">' +
            Array.from({ length: 8 }, (f, p) => `<i class="${p < d ? "on" : ""}"></i>`).join("") +
            "</div>"
          );
        },
        h = n.count > 1 ? `${n.dmg}\xD7${n.count}` : n.explodeDmg ? `${n.dmg}+${n.explodeDmg}` : String(n.dmg);
      getById("wStats").innerHTML = `
    <div class="stat"><span class="k">DAMAGE</span><span class="v">${h}</span>${c((a / 55) * 8)}</div>
    <div class="stat"><span class="k">RATE</span><span class="v">${n.rate.toFixed(1)}/s</span>${c((n.rate / 6.5) * 8)}</div>
    <div class="stat"><span class="k">RANGE</span><span class="v">${Math.round(o)} m</span>${c((o / 28) * 8)}</div>`;
      let l = getById("wBuy");
      ((l.hidden = s),
        s || ((l.innerHTML = `UNLOCK \xB7 <span class="shard-ico"></span>${n.cost}`), (l.disabled = t.shards < n.cost)),
        (getById("wPrev").disabled = this.viewWeapon <= 0),
        (getById("wNext").disabled = this.viewWeapon >= weaponOrder.length - 1),
        this.updatePlayState(),
        this.g.previewWeapon(s ? e : t.weapon));
    }
    renderThreat() {
      let t = this.save,
        e = threatLevels[this.viewThreat],
        n = this.viewThreat > t.threatMax;
      ((getById("tName").textContent = e.name),
        getById("tName").classList.toggle("hot", this.viewThreat > 0),
        (getById("tDesc").textContent = n
          ? `Clear all ${20} waves on ${threatLevels[this.viewThreat - 1].name} to unlock`
          : this.viewThreat > 0
            ? `${e.desc} Shards \xD7${(1 + 0.25 * this.viewThreat).toFixed(2)}`
            : e.desc),
        (getById("tPrev").disabled = this.viewThreat <= 0),
        (getById("tNext").disabled = this.viewThreat >= Math.min(5, t.threatMax + 1)),
        this.updatePlayState());
    }
    updatePlayState() {
      let t = this.save,
        e = weaponOrder[this.viewWeapon],
        n = !!t.weapons[e] && this.viewThreat <= t.threatMax,
        s = getById("playBtn");
      ((s.disabled = !n),
        (s.textContent = n ? (t.run ? "NEW RUN" : "START RUN") : t.weapons[e] ? "THREAT LOCKED" : "WEAPON LOCKED"));
    }
    stepWeapon(t) {
      this.viewWeapon = clamp(this.viewWeapon + t, 0, weaponOrder.length - 1);
      let e = weaponOrder[this.viewWeapon];
      (this.save.weapons[e] && ((this.save.weapon = e), this.g.store.save("weapon")), this.renderWeapon());
    }
    stepThreat(t) {
      ((this.viewThreat = clamp(this.viewThreat + t, 0, Math.min(5, this.save.threatMax + 1))),
        this.viewThreat <= this.save.threatMax && ((this.save.threat = this.viewThreat), this.g.store.save("threat")),
        this.renderThreat());
    }
    buyWeapon() {
      let t = this.save,
        e = weaponOrder[this.viewWeapon],
        n = weaponDefs[e];
      if (t.weapons[e] || t.shards < n.cost) {
        this.g.sound.play("deny");
        return;
      }
      ((t.shards -= n.cost),
        (t.weapons[e] = !0),
        (t.weapon = e),
        this.g.store.save("buy"),
        this.g.sound.play("buy"),
        this.toast(`${n.name} unlocked`, "gold"),
        this.renderHome());
    }
    async play() {
      let t = this.save;
      (t.run &&
        !(await this.confirm("Start a new run?", `Your run at wave ${t.run.wave} will be abandoned.`, "New run"))) ||
        (t.run && this.g.discardRun(), this.g.startRun({}));
    }
    renderWorkshop() {
      let t = this.save;
      for (let n of document.querySelectorAll(".bankMirror")) n.textContent = formatCount(t.shards);
      let e = getById("wsList");
      e.innerHTML = workshopModules
        .map((n) => {
          let s = t.workshop[n.id] || 0,
            r = n.costs.length,
            a = n.costs[s],
            o = Array.from({ length: r }, (h, l) => `<i class="${l < s ? "on" : ""}"></i>`).join(""),
            c =
              s >= r
                ? '<button class="btn" disabled>MAX</button>'
                : `<button class="btn" data-buy="${n.id}" ${t.shards < a ? "disabled" : ""}><span class="shard-ico"></span>${a}</button>`;
          return `<div class="row panel"><div class="rico">${iconSvg(n.icon)}</div><div><b>${escapeHtml(n.name)}</b><small>${escapeHtml(n.desc)}</small><div class="pips">${o}</div></div>${c}</div>`;
        })
        .join("");
      for (let n of e.querySelectorAll("[data-buy]")) this.click(n, () => this.buyModule(n.dataset.buy));
    }
    buyModule(t) {
      let e = this.save,
        n = workshopModules.find((a) => a.id === t),
        s = e.workshop[t] || 0,
        r = n.costs[s];
      if (r == null || e.shards < r) {
        this.g.sound.play("deny");
        return;
      }
      ((e.shards -= r),
        (e.workshop[t] = s + 1),
        this.g.store.save("workshop"),
        this.g.sound.play("buy"),
        this.renderWorkshop());
    }
    renderRecords() {
      let t = this.save,
        e = t.stats;
      for (let a of document.querySelectorAll(".bankMirror")) a.textContent = formatCount(t.shards);
      let n = Object.values(e.bosses).reduce((a, o) => a + o, 0),
        s = [
          ["Runs", e.runs],
          ["Best wave", e.bestWave || "\u2014"],
          ["Full clears", e.clears],
          ["Enemies destroyed", formatCount(e.kills)],
          ["Bosses defeated", n],
          ["Best threat cleared", e.bestClearThreat >= 0 ? threatLevels[e.bestClearThreat].name : "\u2014"],
          ["Time in the rift", formatTime(e.playTime)],
          ["Fastest clear", e.bestTime > 0 ? formatTime(e.bestTime) : "—"],
          ["Shards earned", formatCount(e.shardsEarned)],
        ];
      getById("statGrid").innerHTML = s
        .map(
          ([a, o]) =>
            `<div class="cell"><div class="k">${escapeHtml(a)}</div><div class="v">${escapeHtml(o)}</div></div>`,
        )
        .join("");
      let r = getById("msList");
      r.innerHTML = milestones
        .map((a) => {
          let o = !!t.milestones[a.id],
            c = !o && a.test(t),
            h = o
              ? `<span class="chip">${iconSvg("check")}DONE</span>`
              : c
                ? `<button class="btn" data-claim="${a.id}"><span class="shard-ico"></span>${a.reward}</button>`
                : `<span class="chip"><span class="shard-ico"></span>${a.reward}</span>`;
          return `<div class="row panel ${o ? "done" : c ? "claim" : ""}"><div class="rico">${iconSvg(o ? "check" : "trophy")}</div><div><b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.desc)}</small></div>${h}</div>`;
        })
        .join("");
      for (let a of r.querySelectorAll("[data-claim]")) this.click(a, () => this.claim(a.dataset.claim));
    }
    claim(t) {
      let e = this.save,
        n = milestones.find((s) => s.id === t);
      !n ||
        e.milestones[t] ||
        !n.test(e) ||
        ((e.milestones[t] = !0),
        (e.shards += n.reward),
        this.g.store.save("claim"),
        this.g.sound.play("buy"),
        this.toast(`${n.name}: +${n.reward} shards`, "gold"),
        this.renderRecords());
    }
    renderSettings() {
      let t = this.save.settings;
      ((getById("setAuto").checked = t.autoFire),
        (getById("setAssist").checked = t.assist),
        (getById("setSwap").checked = t.swap),
        (getById("setShake").checked = t.shake),
        (getById("setNumbers").checked = t.numbers),
        (getById("setContrast").checked = t.contrast),
        (getById("setCalm").checked = t.calm),
        (getById("setSfx").value = t.sfx),
        (getById("setMusic").value = t.music));
      for (let e of getById("setQuality").querySelectorAll("button"))
        e.classList.toggle("on", e.dataset.v === t.quality);
      for (let e of getById("setZoom").querySelectorAll("button"))
        e.classList.toggle("on", Math.abs(+e.dataset.v - t.zoom) < 0.01);
      ((getById("qualityNote").textContent = this.g.qualityNote()),
        (getById("storageWarn").hidden = this.g.store.storageOk),
        (getById("verText").textContent = `v${GAME_VERSION}`),
        this.renderLog());
    }
    renderLog() {
      let t = getErrorLog().length;
      getById("logCount").textContent = t ? String(t) : "0";
    }
    async showLog(q) {
      q || (await rlRunHealth({ context: "diagnostics" }));
      let t = await this.dialog({
        title: "Diagnostics",
        body: `<p>Build ${escapeHtml(this.g.buildId)}. “Deep test” runs the full simulation self-test (a few seconds). Copy this text when reporting a problem.</p><textarea readonly spellcheck="false">${escapeHtml(buildReport())}</textarea>`,
        buttons: [
          { label: "Deep test", value: "deep", cls: "ghost" },
          { label: "Copy", value: "copy", cls: "ghost" },
          { label: "Clear", value: "clear", cls: "ghost" },
          { label: "Close", value: null, cls: "primary" },
        ],
      });
      (t === "copy" && this.copy(buildReport()),
        t === "clear" && (clearErrorLog(), set_RL_LAST_RUN_AUDIT(null), this.renderLog(), this.toast("Log cleared")),
        t === "deep" &&
          (this.toast("Running deep self-test…", "", 2600),
          setTimeout(async () => {
            await rlRunHealth({ context: "diagnostics", deep: !0 });
            this.showLog(!0);
          }, 80)));
    }
    async copy(t) {
      let e = !1;
      try {
        navigator.clipboard && window.isSecureContext && (await navigator.clipboard.writeText(t), (e = !0));
      } catch {}
      if (!e) {
        let n = document.createElement("textarea");
        ((n.value = t),
          n.setAttribute("readonly", ""),
          (n.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0"),
          document.body.appendChild(n),
          n.select(),
          n.setSelectionRange(0, t.length));
        try {
          e = document.execCommand("copy");
        } catch {
          e = !1;
        }
        n.remove();
      }
      return (this.toast(e ? "Copied" : "Copy failed \u2014 select the text and copy it by hand"), e);
    }
    dialog({ title: t, body: e, buttons: n, onOpen: s, read: r }) {
      (this.dlgResolve && this.closeDialog(null),
        (getById("dlgTitle").textContent = t),
        (getById("dlgBody").innerHTML = e));
      let a = getById("dlgBtns");
      return (
        (a.innerHTML = ""),
        new Promise((o) => {
          ((this.dlgResolve = o), (this.dlgRead = r || null));
          for (let c of n) {
            let h = document.createElement("button");
            ((h.className = "btn " + (c.cls || "")),
              (h.textContent = c.label),
              this.click(h, () => this.closeDialog(c.value)),
              a.appendChild(h));
          }
          ((getById("dialog").hidden = !1), s && s());
        })
      );
    }
    closeDialog(t) {
      let e = this.dlgResolve,
        n = this.dlgRead ? this.dlgRead() : void 0;
      ((this.dlgResolve = null),
        (getById("dialog").hidden = !0),
        e && e(this.dlgRead ? { value: t, text: n } : t),
        (this.dlgRead = null));
    }
    async confirm(t, e, n, s) {
      return (
        (await this.dialog({
          title: t,
          body: `<p>${escapeHtml(e)}</p>`,
          buttons: [
            { label: "Cancel", value: !1, cls: "ghost" },
            { label: n, value: !0, cls: s ? "danger" : "primary" },
          ],
        })) === !0
      );
    }
    alert(t, e) {
      return this.dialog({
        title: t,
        body: `<p>${escapeHtml(e)}</p>`,
        buttons: [{ label: "OK", value: !0, cls: "primary" }],
      });
    }
    toast(t, e = "", n = 2900) {
      let s = getById("toasts"),
        r = document.createElement("div");
      for (
        r.className = "toast " + e, r.style.animationDuration = n + "ms", r.textContent = t, s.appendChild(r);
        s.children.length > 3;
      )
        s.firstChild.remove();
      setTimeout(() => r.remove(), n + 50);
    }
    banner(t, e, n = "", s = 2200) {
      let r = getById("banner");
      ((r.innerHTML = `<div class="bn ${n}" style="animation-duration:${s}ms"><div class="small">${escapeHtml(e || "")}</div><div class="big">${escapeHtml(t)}</div></div>`),
        clearTimeout(this.bannerT),
        (this.bannerT = setTimeout(() => {
          r.innerHTML = "";
        }, s + 50)));
    }
    comboPop(t, e) {
      let n = document.createElement("div");
      ((n.className = "combo-pop"),
        (n.textContent = `\xD7${t} COMBO  +${e}`),
        getById("hud").appendChild(n),
        setTimeout(() => n.remove(), 1250));
    }
    coach(t, e, n) {
      let s = getById("coach");
      if (t == null) {
        ((s.hidden = !0), (this.coachKey = null));
        return;
      }
      let r = t + n;
      this.coachKey !== r &&
        ((this.coachKey = r),
        (getById("coachDots").innerHTML = Array.from(
          { length: e },
          (a, o) => `<i class="${o <= t ? "on" : ""}"></i>`,
        ).join("")),
        (getById("coachText").textContent = n),
        (s.hidden = !1));
    }
    setSwap(t) {
      getById("hud").classList.toggle("swap", !!t);
    }
    showHud(t) {
      ((getById("hud").hidden = !t),
        (getById("hud").style.visibility = ""),
        getById("vignette").classList.remove("low"),
        (getById("touch").hidden = !t),
        t || (getById("bossBar").hidden = !0),
        (this.hudCache = {}));
    }
    hud(t) {
      let e = this.hudCache,
        n = t.player,
        s = t.stats,
        r = (x, m, g) => {
          e[x] !== m && ((e[x] = m), g(m));
        },
        a = Math.max(0, Math.ceil(n.hp));
      r("hp", a + "/" + s.maxHp, (x) => {
        getById("hpNum").textContent = x;
      });
      let o = clamp(n.hp / s.maxHp, 0, 1);
      if (
        (r("hpf", Math.round(o * 200), () => {
          ((getById("hpFill").style.transform = `scaleX(${o})`),
            (getById("hpLag").style.transform = `scaleX(${o})`),
            getById("hpFill").parentElement.classList.toggle("low", o < 0.3));
        }),
        r("shieldOn", s.shieldCd > 0, (x) => {
          getById("shieldPip").hidden = !x;
        }),
        s.shieldCd > 0 &&
          r("shield", n.shield ? 100 : Math.round((n.shieldT / s.shieldCd) * 20) * 5, (x) => {
            (getById("shieldPip").style.setProperty("--p", x + "%"),
              getById("shieldPip").classList.toggle("ready", x >= 100));
          }),
        e.hpVal != null && n.hp > e.hpVal + 0.5)
      ) {
        let x = getById("hpFill").parentElement;
        (x.classList.remove("heal"), x.offsetWidth, x.classList.add("heal"));
      }
      ((e.hpVal = n.hp),
        this.buffs(t),
        r("low", n.alive && o < 0.25, (x) => {
          getById("vignette").classList.toggle("low", x);
        }),
        r("shards", t.shards, (x) => {
          getById("runShards").textContent = formatCount(x);
          let m = getById("shardChip");
          (e.shardsSeen && (m.classList.remove("bump"), m.offsetWidth, m.classList.add("bump")), (e.shardsSeen = !0));
        }));
      let c = t.endless ? "" : "/" + 20;
      r("wave", t.wave + c, () => {
        getById("waveLabel").textContent = `WAVE ${t.wave}${c}`;
      });
      let h;
      if (t.state === "fight")
        if (t.boss || t.bossPending) h = "BOSS";
        else {
          let x = t.enemies.length + t.markers.length;
          for (let m = t.planIdx; m < t.plan.length; m++) x += t.plan[m].members.length;
          h = x + " LEFT";
        }
      else t.state === "cleared" ? (h = "CLEARED") : (h = "\xA0");
      r("sub", h, (x) => {
        getById("waveSub").textContent = x;
      });
      let l = t.state === "fight" && !t.boss && !t.bossPending && t.planTotal > 0;
      if (
        (r("progOn", l, (x) => {
          getById("waveProg").hidden = !x;
        }),
        l)
      ) {
        let x = t.enemies.length + t.markers.length;
        for (let g = t.planIdx; g < t.plan.length; g++) x += t.plan[g].members.length;
        let m = clamp(1 - x / Math.max(t.planTotal, x), 0, 1);
        r("prog", Math.round(m * 50), () => {
          getById("waveProgFill").style.transform = `scaleX(${m})`;
        });
      }
      let u = t.boss || (t.champion && !t.champion.dead ? t.champion : null);
      (r("bossOn", !!u, (x) => {
        getById("bossBar").hidden = !x;
      }),
        u &&
          (r("bossName", u.type + (u.enraged ? "!" : "") + (u.champion ? "c" : ""), () => {
            ((getById("bossName").textContent = u.champion
              ? `${enemyDefs[u.type].name.toUpperCase()} CHAMPION`
              : bossDefs[u.type].name),
              (getById("bossPhase").textContent = u.enraged ? "ENRAGED" : u.champion ? "RALLYING" : ""));
          }),
          r("bossF", Math.round((u.hp / u.maxHp) * 300), (x) => {
            ((getById("bossFill").style.transform = `scaleX(${clamp(x / 300, 0, 1)})`),
              (getById("bossLag").style.transform = `scaleX(${clamp(x / 300, 0, 1)})`));
          }),
          r("bossTicks", u.type, (x) => {
            getById("bossTicks").innerHTML = x === "core" ? '<s style="left:66%"></s><s style="left:33%"></s>' : "";
          })));
      let d = t.combo >= 5 ? t.combo : 0;
      (r("combo", d, (x) => {
        ((getById("combo").hidden = !x),
          x && ((getById("comboN").textContent = "\xD7" + x), getById("combo").classList.toggle("hot", x >= 25)));
      }),
        d &&
          r("comboT", Math.round(t.comboT * 20), (x) => {
            getById("comboBar").style.transform = `scaleX(${clamp(x / 44, 0, 1)})`;
          }));
      let f = s.dashCd > 0 ? Math.round((n.dashCdT / s.dashCd) * 100) : 0;
      (r("dash", f, (x) => {
        let m = getById("dashBtn");
        (m.style.setProperty("--p", x + "%"), m.style.setProperty("--q", 100 - x + "%"));
        let g = x > 0;
        (m.classList.contains("cooling") &&
          !g &&
          (m.classList.remove("pop"),
          m.offsetWidth,
          m.classList.add("pop"),
          t.state === "fight" && this.g.sound.play("ready")),
          m.classList.toggle("cooling", g));
      }),
        r("dashSec", n.dashCdT > 0.25 ? n.dashCdT.toFixed(1) : "", (x) => {
          getById("dashSec").textContent = x;
        }));
      let p = Math.floor(n.nova);
      r("nova", p, (x) => {
        (getById("novaBtn").style.setProperty("--p", x + "%"), getById("novaBtn").classList.toggle("ready", x >= 100));
      });
    }
    buffs(t) {
      let e = t.player,
        n = t.stats,
        s = [];
      (n.bloodrush && e.rushN > 0 && s.push(["rush", `RUSH \xD7${e.rushN}`, "#ff5a7a", e.rushT / 4]),
        t.chronoT > 0 && s.push(["chrono", "SLOW-MO", "#8fe8ff", t.chronoT / 2]),
        (t.ws.revive || 0) > 0 && !t.revived && s.push(["life", "2ND LIFE", "#6dff8a", -1]),
        // 2.5.0 B: Emergency Shield barrier and Hazard Attunement
        t.barrierT > 0 && s.push(["barrier", "BARRIER", "#7fd8ff", t.barrierT / Math.max(1, n.barrierT || 1)]),
        t.attuned && t.state === "fight" && s.push(["attune", "ATTUNED", "#ffb86b", -1]),
        t.event &&
          t.state === "fight" &&
          s.unshift(["event", waveEvents[t.event].name, t.event === "elite" ? "#ffc84a" : "#7ff6ff", -1]),
        e.onIce && t.state === "fight" && s.push(["ice", "ICE", "#bff4ff", -1]),
        e.inAcid && t.state === "fight" && s.push(["acid", "ACID", "#b4ff3d", -1]),
        e.slowT > 0 && s.push(["chill", "CHILLED", "#aee8ff", e.slowT / 1.6]));
      let r = s.map((o) => o[0] + o[1]).join("|"),
        a = getById("buffs");
      this.hudCache.buffKey !== r &&
        ((this.hudCache.buffKey = r),
        (a.innerHTML = s
          .map(
            ([o, c, h, l]) =>
              `<span class="buff" data-b="${o}" style="--bc:${h}">${c}${l >= 0 ? "<i></i>" : ""}</span>`,
          )
          .join("")));
      for (let [o, , , c] of s) {
        if (c < 0) continue;
        let h = a.querySelector(`[data-b="${o}"] i`);
        h && (h.style.transform = `scaleX(${clamp(c, 0, 1).toFixed(2)})`);
      }
    }
    showChoose(t) {
      let e = t.offerBoss;
      ((getById("chooseEyebrow").textContent = e
        ? `${bossDefs[t.bossKills[t.bossKills.length - 1]] ? bossDefs[t.bossKills[t.bossKills.length - 1]].name : "BOSS"} DEFEATED`
        : `WAVE ${t.wave} CLEARED`),
        (getById("chooseTitle").textContent = e ? "Claim a rare reward" : "Choose an upgrade"));
      let n = clamp(t.player.hp / t.stats.maxHp, 0, 1);
      ((getById("chooseHp").style.transform = `scaleX(${n})`),
        (getById("chooseHpNum").textContent = `${Math.ceil(t.player.hp)}/${t.stats.maxHp}`),
        this.renderCards(t),
        this.coverHud(!0),
        (getById("choose").hidden = !1));
    }
    renderCards(t) {
      let e = getById("cards");
      ((e.innerHTML = t.offer
        .map((n, s) => {
          let r = upgradesById[n],
            a = t.up[n] || 0,
            o = r.evo
              ? "EVOLUTION"
              : r.repeat
                ? rarityNames[r.rarity].toUpperCase()
                : a
                  ? `LV ${a} \u2192 ${a + 1}`
                  : `NEW \xB7 ${rarityNames[r.rarity].toUpperCase()}`,
            c = this.evoHint(r, t),
            h = this.statDelta(n, t);
          return `<button class="card r${r.rarity}" data-pick="${n}" style="animation-delay:${s * 70}ms"><span class="cico">${iconSvg(r.icon)}</span><span><span class="ctop"><b>${escapeHtml(r.name)}</b><span class="lv">${o}</span></span><p>${escapeHtml(r.desc(a))}</p>${h}${c}</span></button>`;
        })
        .join("")),
        e.classList.add("locked"),
        clearTimeout(this.armT),
        (this.armT = setTimeout(() => e.classList.remove("locked"), 650)));
      for (let n of e.querySelectorAll("[data-pick]"))
        n.addEventListener("click", () => {
          e.classList.contains("locked") || this.g.choose(n.dataset.pick);
        });
      ((getById("rerollTxt").textContent = `Reroll (${t.rerolls})`),
        (getById("rerollBtn").disabled = t.rerolls <= 0),
        (getById("buildStrip").innerHTML = this.buildHtml(t)));
    }
    statDelta(t, e) {
      let n = e.player,
        s = e.stats;
      if (t === "heal") {
        let o = Math.min(s.maxHp, n.hp + s.maxHp * 0.45);
        return `<small class="delta">Hull ${Math.ceil(n.hp)} \u2192 ${Math.ceil(o)}</small>`;
      }
      let r = computeStats(e.weapon, { ...e.up, [t]: (e.up[t] || 0) + 1 }, e.ws),
        a = [];
      for (let [o, c, h] of statRows) {
        let l = c(s),
          u = c(r);
        if (!(Math.abs(l - u) < 1e-6) && (a.push(`${o} ${h(l)} \u2192 ${h(u)}`), a.length >= 2)) break;
      }
      return a.length ? `<small class="delta">${escapeHtml(a.join(" \xB7 "))}</small>` : "";
    }
    evoHint(t, e) {
      if (t.evo)
        return `<small class="evo-hint">Merges ${Object.keys(t.evo)
          .map((o) => escapeHtml(upgradesById[o].name))
          .join(" + ")}</small>`;
      let n = upgradeList.filter((o) => o.evo && o.evo[t.id] && !e.up[o.id] && (!o.weapon || o.weapon === e.weapon)),
        s = n.find((o) => o.weapon) || n[0];
      if (!s) return "";
      let r = Object.keys(s.evo)
          .filter((o) => o !== t.id)
          .map((o) => `${upgradesById[o].name} ${Math.min(e.up[o] || 0, s.evo[o])}/${s.evo[o]}`),
        a = `${Math.min((e.up[t.id] || 0) + 1, s.evo[t.id])}/${s.evo[t.id]}`;
      return `<small class="evo-hint">\u2192 ${escapeHtml(s.name)}: this ${a} \xB7 ${escapeHtml(r.join(", "))}</small>`;
    }
    hideChoose() {
      ((getById("choose").hidden = !0), this.coverHud(!1));
    }
    coverHud(t) {
      ((getById("hud").style.visibility = t ? "hidden" : ""),
        t && ((getById("banner").innerHTML = ""), clearTimeout(this.bannerT)));
    }
    buildHtml(t) {
      let e = upgradeList.filter((n) => t.up[n.id] && !n.repeat);
      return e.length
        ? e
            .map(
              (n) =>
                `<span class="bi r${n.rarity}" title="${escapeHtml(n.name)}">${iconSvg(n.icon)}${escapeHtml(n.name)}${t.up[n.id] > 1 ? " \xD7" + t.up[n.id] : ""}</span>`,
            )
            .join("")
        : '<span class="note">No upgrades yet.</span>';
    }
    showPause(t) {
      ((getById("pauseTitle").textContent = `Wave ${t.wave}${t.endless ? " \xB7 Endless" : ""}`),
        (getById("pauseStats").innerHTML =
          `<span>${formatTime(t.time)}</span><span>${t.kills} KILLS</span><span>${t.shards} SHARDS</span>`),
        (getById("pauseBuild").innerHTML = this.buildHtml(t)),
        this.coverHud(!0),
        (getById("pause").hidden = !1),
        (this.screen = "pause"));
    }
    hidePause() {
      ((getById("pause").hidden = !0), (getById("settings").hidden = !0), this.coverHud(!1));
    }
    showOver(t) {
      getById("overEyebrow").textContent = t.win
        ? `${threatLevels[t.threat].name.toUpperCase()} \xB7 ALL ${20} WAVES`
        : `${weaponDefs[t.weapon].name.toUpperCase()} \xB7 ${threatLevels[t.threat].name.toUpperCase()}`;
      let e = getById("overTitle");
      ((e.textContent = t.win ? "RIFT SEALED" : t.abandoned ? "RUN ENDED" : "SIGNAL LOST"),
        (e.className = "over-title " + (t.win ? "win" : "lose")),
        (getById("overBest").hidden = !(t.best || t.fastest)),
        (getById("overBest").textContent = t.fastest && !t.best ? "NEW FASTEST" : "NEW BEST"));
      let n = t.killer ? enemyDefs[t.killer] || bossDefs[t.killer] : null;
      ((getById("overCause").hidden = !n && t.killer !== "lava" && t.killer !== "acid"),
        n
          ? (getById("overCause").textContent = `Destroyed by ${bossDefs[t.killer] ? n.name : "a " + n.name}`)
          : t.killer === "lava"
            ? (getById("overCause").textContent = "Burned by a lava vent")
            : t.killer === "acid" && (getById("overCause").textContent = "Dissolved in acid"),
        (getById("overStats").innerHTML = [
          ["Wave", t.wave],
          ["Time", formatTime(t.time)],
          ["Kills", t.kills],
          ["Bosses", t.bosses],
        ]
          .map(([s, r]) => `<div class="cell"><div class="k">${s}</div><div class="v">${r}</div></div>`)
          .join("")),
        (getById("payRows").innerHTML = t.rows
          .map(
            ([s, r]) =>
              `<div class="pay-row"><span>${escapeHtml(s)}</span><span class="num">${escapeHtml(r)}</span></div>`,
          )
          .join("")),
        (getById("overMs").innerHTML =
          (t.unlocks || []).map((s) => `<span class="chip">${iconSvg("star")} ${escapeHtml(s)}</span>`).join("") +
          t.milestones
            .map((s) => `<span class="chip">${iconSvg("trophy")} Milestone ready: ${escapeHtml(s)}</span>`)
            .join("")),
        this.renderDamage(t),
        (getById("endlessBtn").hidden = !t.canEndless),
        (getById("retryBtn").hidden = t.canEndless),
        (getById("over").hidden = !1),
        this.countUp(getById("payTotal"), t.total));
    }
    renderDamage(t) {
      let e = getById("overDmg"),
        n = t.dmgSrc || {},
        s = Object.entries(n)
          .filter(([, h]) => h >= 1)
          .sort((h, l) => l[1] - h[1]),
        r = s.reduce((h, [, l]) => h + l, 0);
      if (((e.hidden = !s.length || r < 50), e.hidden)) return;
      let a = s.slice(0, 4),
        o = s.slice(4).reduce((h, [, l]) => h + l, 0);
      o > 0 && a.push(["other", o]);
      let c = a[0][1];
      e.innerHTML =
        '<div class="dh">Damage dealt</div>' +
        a
          .map(([h, l]) => {
            let u = h === "weapon" ? t.weaponName : damageSources[h] ? damageSources[h][0] : "Other",
              d =
                h === "weapon"
                  ? "#" + weaponDefs[t.weapon].color.toString(16).padStart(6, "0")
                  : damageSources[h]
                    ? damageSources[h][1]
                    : "#93a2bf",
              f = Math.round((l / r) * 100);
            return `<div class="dmg-row" style="--dc:${d}"><span>${escapeHtml(u)}</span><span class="num">${formatCount(l)} \xB7 ${f}%</span><span class="db"><i style="transform:scaleX(${(l / c).toFixed(3)})"></i></span></div>`;
          })
          .join("");
    }
    hideOver() {
      getById("over").hidden = !0;
    }
    countUp(t, e) {
      let n = performance.now(),
        s = 900,
        r = (a) => {
          let o = clamp((a - n) / s, 0, 1);
          ((t.textContent = formatCount(Math.round(e * (1 - Math.pow(1 - o, 3))))), o < 1 && requestAnimationFrame(r));
        };
      requestAnimationFrame(r);
    }
    showCrash(t) {
      for (let e of ["choose", "pause", "over"]) getById(e).hidden = !0;
      (this.showHud(!1), (getById("crashLog").value = t), (getById("crash").hidden = !1));
    }
    hideCrash() {
      getById("crash").hidden = !0;
    }
    hurtFlash() {
      if (this.calm) return;
      let t = getById("flash");
      (t.classList.add("on"), requestAnimationFrame(() => requestAnimationFrame(() => t.classList.remove("on"))));
    }
  };
(() => {
  const _show = GameUI.prototype._show;
  GameUI.prototype._show = function (screen) {
    const r = _show.call(this, screen);
    requestAnimationFrame(() => window.__riftLayoutAudit?.());
    return r;
  };
})();

export { GameUI, iconSvg, RL_TOUCH_CLICK_GUARD, getById, rlBiomeTitle, rlRenderHistory, iconPaths, escapeHtml };
