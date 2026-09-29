// Keyboard, mouse and touch input (Input).

import { RL_RT } from "../core/diagnostics.js";
import { clamp } from "../core/util.js";
import { game } from "../main.js";
import { getById } from "./ui.js";

// 2.3.4: the input the player is using right now, so hints can say "W A S D" or "drag".
// Starts from the primary pointer (coarse = touch screen) and follows the last real input.
var RL_INPUT = { touch: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches };
var Input = class {
  constructor(layer, renderer) {
    ((this.layer = layer),
      (this.r = renderer),
      (this.move = newStick()),
      (this.aim = newStick()),
      (this.keys = new Set()),
      (this.mouse = { x: 0, y: 0, down: !1, active: !1, t: 0 }),
      (this.pending = { dash: !1, nova: !1 }),
      (this.swap = !1),
      (this.R = 56),
      (this.enabled = !0),
      (this.onPause = null),
      (this.isPlaying = null),
      (this.usedMove = !1),
      (this.usedAim = !1),
      this.bind());
  }
  bind() {
    let layer = this.layer;
    (layer.addEventListener("pointerdown", (ev) => this.down(ev)),
      layer.addEventListener("onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove", (ev) =>
        this.moveEv(ev),
      ),
      layer.addEventListener("pointerup", (ev) => this.up(ev)),
      layer.addEventListener("pointercancel", (ev) => this.cancel(ev)),
      layer.addEventListener("lostpointercapture", (ev) => this.cancel(ev)),
      layer.addEventListener("contextmenu", (ev) => ev.preventDefault()),
      window.addEventListener("keydown", (ev) => this.key(ev, !0)),
      window.addEventListener("keyup", (ev) => this.key(ev, !1)),
      window.addEventListener("blur", () => {
        (this.reset(!0), this.onBlur && this.onBlur());
      }),
      window.addEventListener("mousemove", (ev) => {
        (Number.isFinite(ev.clientX) && (this.mouse.x = ev.clientX),
          Number.isFinite(ev.clientY) && (this.mouse.y = ev.clientY),
          (this.mouse.t = performance.now()));
      }),
      window.addEventListener("mouseup", () => {
        this.mouse.down = !1;
      }));
  }
  zoneIsMove(x) {
    let rect = this.layer.getBoundingClientRect(),
      middle = rect.left + (rect.width || this.layer.clientWidth || window.innerWidth) * 0.5,
      left = x < middle;
    return this.swap ? !left : left;
  }
  down(ev) {
    RL_RT.pointerdown++;
    RL_INPUT.touch = ev.pointerType !== "mouse";
    if (!this.enabled) return;
    if ((ev.preventDefault(), ev.pointerType === "mouse")) {
      (ev.button === 0 && ((this.mouse.down = !0), (this.mouse.active = !0)),
        (this.mouse.x = ev.clientX),
        (this.mouse.y = ev.clientY));
      return;
    }
    let isMove = this.zoneIsMove(ev.clientX),
      stick = isMove ? this.move : this.aim;
    if (stick.active && stick.id !== ev.pointerId) {
      if (performance.now() - (stick.lastEv || 0) < 2500) return;
      try {
        this.layer.releasePointerCapture(stick.id);
      } catch {}
    }
    // 2.4.0: a double tap on the move side no longer dashes; the DASH button (and Space or
    // Shift on a keyboard) does.
    let now = performance.now();
    ((stick.active = !0),
      (stick.id = ev.pointerId),
      (stick.moved = 0),
      (stick.lastEv = now),
      (stick.ox = stick.x = ev.clientX),
      (stick.oy = stick.y = ev.clientY),
      (stick.t = performance.now()));
    try {
      this.layer.setPointerCapture(ev.pointerId);
    } catch {}
  }
  moveEv(ev) {
    RL_RT.pointermove++;
    if (ev.pointerType === "mouse") {
      (Number.isFinite(ev.clientX) && (this.mouse.x = ev.clientX),
        Number.isFinite(ev.clientY) && (this.mouse.y = ev.clientY),
        (this.mouse.active = !0),
        (this.mouse.t = performance.now()),
        (RL_INPUT.touch = !1));
      return;
    }
    let coalesced = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null,
      last = coalesced && coalesced.length ? coalesced[coalesced.length - 1] : ev,
      x = Number.isFinite(last.clientX) ? last.clientX : ev.clientX,
      y = Number.isFinite(last.clientY) ? last.clientY : ev.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    for (let stick of [this.move, this.aim]) {
      if (!stick.active || stick.id !== last.pointerId) continue;
      ((stick.lastEv = performance.now()),
        (stick.x = x),
        (stick.y = y),
        (stick.moved = Math.max(stick.moved || 0, Math.hypot(stick.x - stick.ox, stick.y - stick.oy))));
      let dx = stick.x - stick.ox,
        dy = stick.y - stick.oy,
        dist = Math.hypot(dx, dy),
        maxDist = this.R * 1.25;
      dist > maxDist && ((stick.ox = stick.x - (dx / dist) * maxDist), (stick.oy = stick.y - (dy / dist) * maxDist));
    }
  }
  up(ev) {
    RL_RT.pointerup++;
    if (ev.pointerType === "mouse") {
      this.mouse.down = !1;
      return;
    }
    for (let stick of [this.move, this.aim]) !stick.active || stick.id !== ev.pointerId || (stick.active = !1);
  }
  cancel(ev) {
    RL_RT.pointercancel++;
    if (ev.pointerType === "mouse") {
      ((this.mouse.down = !1), (this.mouse.active = !1));
      return;
    }
    for (let stick of [this.move, this.aim]) !stick.active || stick.id !== ev.pointerId || (stick.active = !1);
  }
  key(ev, down) {
    // 2.4.2: letters are read by their position on the keyboard (ev.code), so W A S D, E, Q and F
    // sit in the same place on every layout; upgrade choice keys 1–4 and R
    const code = String(ev.code || ""),
      key = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : String(ev.key || "");
    this._rlKey = key.toLowerCase();
    const tag = ev.target && ev.target.tagName;
    if (down && !ev.repeat && tag !== "INPUT" && tag !== "TEXTAREA" && chooseKey(code, this._rlKey))
      ev.preventDefault();
    // Esc also works while a settings toggle or slider has focus (only text fields keep it)
    if (
      down &&
      !ev.repeat &&
      this._rlKey === "escape" &&
      tag === "INPUT" &&
      /^(checkbox|range|radio)$/.test(ev.target.type)
    ) {
      (ev.target.blur(), this.onPause && this.onPause());
      return;
    }
    down ? RL_RT.keydown++ : RL_RT.keyup++;
    const name = this._rlKey;
    if (!name) return;
    // 2.3.6: a released key always counts as released, even when a text field has focus.
    down || this.keys.delete(name);
    if (!(tag === "INPUT" || tag === "TEXTAREA")) {
      down && (RL_INPUT.touch = !1);
      if (down && (name === "escape" || name === "p")) {
        !ev.repeat && this.onPause && this.onPause();
        return;
      }
      (name === " " && this.isPlaying && this.isPlaying() && ev.preventDefault(),
        down && !ev.repeat && (name === " " || name === "shift") && (this.pending.dash = !0),
        down &&
          !ev.repeat &&
          (name === "e" || name === "q" || name === "f") &&
          ((this.pending.nova = !0), ev.preventDefault()),
        ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(name) &&
          (down ? this.keys.add(name) : this.keys.delete(name), down && ev.preventDefault()));
    }
  }
  press(action) {
    this.enabled && (this.pending[action] = !0);
  }
  // 2.3.6: held keys survive a reset (pause, upgrade pick, resize): keyup events keep arriving,
  // so W A S D stay correct. Before, holding W+D through a reset left only the key that
  // auto-repeats (D) working. reset(true) also forgets the keys, for when keyups can get lost
  // (window blur, page hide).
  reset(all) {
    RL_RT.reset++;
    for (let stick of [this.move, this.aim])
      if (stick.active && stick.id >= 0)
        try {
          this.layer.releasePointerCapture(stick.id);
        } catch {}
    ((this.move.active = !1),
      (this.aim.active = !1),
      all && this.keys.clear(),
      (this.mouse.down = !1),
      (this.mouse.active = !1),
      (this.pending.dash = !1),
      (this.pending.nova = !1));
  }
  // 2.3.6: for the camera pan to a new boss. It dropped every input, so a finger held on the
  // move side did nothing after the pan until it was lifted, and held keys stopped. Now only
  // one-shot presses made during the pan (dash, nova) are dropped.
  settle() {
    ((this.pending.dash = !1), (this.pending.nova = !1));
  }
  sample(world, settings) {
    let radius = (this.R = clamp(Math.min(window.innerWidth, window.innerHeight) * 0.14, 44, 72)),
      mx = 0,
      my = 0;
    if (this.move.active) {
      let dx = this.move.x - this.move.ox,
        dy = this.move.y - this.move.oy,
        dist = Math.hypot(dx, dy),
        dead = radius * 0.12;
      if (dist > dead) {
        let k = clamp((dist - dead) / (radius - dead), 0, 1);
        ((mx = (dx / dist) * k), (my = (dy / dist) * k), (this.usedMove = !0));
      }
    }
    let keys = this.keys;
    ((keys.has("a") || keys.has("arrowleft")) && (mx -= 1),
      (keys.has("d") || keys.has("arrowright")) && (mx += 1),
      (keys.has("w") || keys.has("arrowup")) && (my -= 1),
      (keys.has("s") || keys.has("arrowdown")) && (my += 1));
    let ax = 0,
      ay = 0,
      aim = !1,
      fire = !1;
    if (this.aim.active) {
      let dx = this.aim.x - this.aim.ox,
        dy = this.aim.y - this.aim.oy,
        dist = Math.hypot(dx, dy);
      ((fire = !0), dist > radius * 0.22 && ((ax = dx / dist), (ay = dy / dist), (aim = !0), (this.usedAim = !0)));
    }
    let mouseRecent = performance.now() - this.mouse.t < 2500;
    if (
      !aim &&
      world &&
      (this.mouse.down ||
        (mouseRecent && this.mouse.active && !this.move.active && !this.aim.active && !settings.autoFire))
    ) {
      let ground = this.r.groundAt(this.mouse.x, this.mouse.y);
      if (ground) {
        let dx = ground.x - world.player.x,
          dy = ground.y - world.player.y,
          dist = Math.hypot(dx, dy);
        dist > 0.3 && ((ax = dx / dist), (ay = dy / dist), (aim = !0));
      }
      ((fire = this.mouse.down), fire || (aim = !1));
    }
    let out = {
      mx,
      my,
      ax,
      ay,
      aim,
      fire,
      auto: settings.autoFire !== !1,
      assist: settings.assist !== !1,
      dash: this.pending.dash,
      nova: this.pending.nova,
    };
    return ((this.pending.dash = !1), (this.pending.nova = !1), out);
  }
};
// 2.4.2: keys 1–4 pick an upgrade card and R rerolls while the upgrade choice is open
function chooseKey(code, key) {
  if (!game.chooseShown || game.overShown || !getById("dialog").hidden || getById("choose").hidden) return !1;
  const match = /^(?:Digit|Numpad)([1-4])$/.exec(code) || /^([1-4])$/.exec(key);
  if (match) {
    const card = getById("cards").querySelectorAll("[data-pick]")[+match[1] - 1];
    card && !getById("cards").classList.contains("locked") && game.choose(card.dataset.pick);
    return !0;
  }
  if (key === "r") {
    getById("rerollBtn").disabled || game.reroll();
    return !0;
  }
  return !1;
}
function newStick() {
  return { active: !1, id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0 };
}

export { Input, RL_INPUT };
