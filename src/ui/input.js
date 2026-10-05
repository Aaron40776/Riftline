// Keyboard, mouse and touch input (Input).

import { RL_RT } from "../core/diagnostics.js";
import { clamp } from "../core/util.js";
import { game } from "../main.js";
import { getById } from "./ui.js";

// 2.3.4: the input the player is using right now, so hints can say "W A S D" or "drag".
// Starts from the primary pointer (coarse = touch screen) and follows the last real input.
const RL_INPUT = { touch: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches };
const Input = class {
  constructor(layer, renderer) {
    this.layer = layer;
    this.r = renderer;
    this.move = newStick();
    this.aim = newStick();
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, active: false, t: 0 };
    this.pending = { dash: false, nova: false, gadget: false };
    this.R = 56;
    // the stick size of the player (times the default radius) and, with a fixed move stick, where it sits
    // (a function that returns its centre in px, see ui/hud-layout.js; null: the stick starts where the thumb does)
    this.stickScale = 1;
    this.fixedMove = null;
    this.enabled = true;
    this.onPause = null;
    this.isPlaying = null;
    this.usedMove = false;
    this.usedAim = false;
    this.bind();
  }
  bind() {
    let layer = this.layer;
    layer.addEventListener("pointerdown", (ev) => this.down(ev));
    // 3.18.0: in the frame of the landscape shell the raw updates come without the turn of the frame (the stick would move
    // the wrong way); pointermove carries the newest sample too and the game reads it once a frame anyway
    layer.addEventListener(
      "onpointerrawupdate" in window && window.top === window ? "pointerrawupdate" : "pointermove",
      (ev) => this.moveEv(ev),
    );
    layer.addEventListener("pointerup", (ev) => this.up(ev));
    layer.addEventListener("pointercancel", (ev) => this.cancel(ev));
    layer.addEventListener("lostpointercapture", (ev) => this.cancel(ev));
    layer.addEventListener("contextmenu", (ev) => ev.preventDefault());
    window.addEventListener("keydown", (ev) => this.key(ev, true));
    window.addEventListener("keyup", (ev) => this.key(ev, false));
    window.addEventListener("blur", () => {
      this.reset(true);
      if (this.onBlur) {
        this.onBlur();
      }
    });
    window.addEventListener("mousemove", (ev) => {
      if (Number.isFinite(ev.clientX)) {
        this.mouse.x = ev.clientX;
      }
      if (Number.isFinite(ev.clientY)) {
        this.mouse.y = ev.clientY;
      }
      this.mouse.t = performance.now();
    });
    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });
  }
  zoneIsMove(x) {
    let rect = this.layer.getBoundingClientRect(),
      middle = rect.left + (rect.width || this.layer.clientWidth || window.innerWidth) * 0.5;
    return x < middle;
  }
  down(ev) {
    RL_RT.pointerdown++;
    RL_INPUT.touch = ev.pointerType !== "mouse";
    if (!this.enabled) return;
    ev.preventDefault();
    if (ev.pointerType === "mouse") {
      if (ev.button === 0) {
        this.mouse.down = true;
        this.mouse.active = true;
      }
      this.mouse.x = ev.clientX;
      this.mouse.y = ev.clientY;
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
    stick.active = true;
    stick.id = ev.pointerId;
    stick.moved = 0;
    stick.lastEv = now;
    stick.ox = stick.x = ev.clientX;
    stick.oy = stick.y = ev.clientY;
    // a fixed move stick keeps its place; a touch anywhere on the move side steers from its centre
    if (isMove && this.fixedMove) {
      const center = this.fixedMove(this.radius());
      stick.ox = center.x;
      stick.oy = center.y;
    }
    stick.t = performance.now();
    try {
      this.layer.setPointerCapture(ev.pointerId);
    } catch {}
  }
  moveEv(ev) {
    RL_RT.pointermove++;
    if (ev.pointerType === "mouse") {
      if (Number.isFinite(ev.clientX)) {
        this.mouse.x = ev.clientX;
      }
      if (Number.isFinite(ev.clientY)) {
        this.mouse.y = ev.clientY;
      }
      this.mouse.active = true;
      this.mouse.t = performance.now();
      RL_INPUT.touch = false;
      return;
    }
    // 3.18.0: the position of the event itself (the newest sample, the same as the last coalesced one). The coalesced events
    // of a frame the landscape shell has turned come without the turn, so the stick moved the wrong way there.
    let x = ev.clientX,
      y = ev.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    for (let stick of [this.move, this.aim]) {
      if (!stick.active || stick.id !== ev.pointerId) continue;
      stick.lastEv = performance.now();
      stick.x = x;
      stick.y = y;
      stick.moved = Math.max(stick.moved || 0, Math.hypot(stick.x - stick.ox, stick.y - stick.oy));
      // 2.6.0: the stick stays where the finger touched down. Before, its centre followed the
      // finger once it was dragged further than 1.25 radii; the knob is clamped when drawn and
      // sample() caps the strength at 1.
    }
  }
  up(ev) {
    RL_RT.pointerup++;
    if (ev.pointerType === "mouse") {
      this.mouse.down = false;
      return;
    }
    for (let stick of [this.move, this.aim]) {
      if (!(!stick.active || stick.id !== ev.pointerId)) {
        stick.active = false;
      }
    }
  }
  cancel(ev) {
    RL_RT.pointercancel++;
    if (ev.pointerType === "mouse") {
      this.mouse.down = false;
      this.mouse.active = false;
      return;
    }
    for (let stick of [this.move, this.aim]) {
      if (!(!stick.active || stick.id !== ev.pointerId)) {
        stick.active = false;
      }
    }
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
    // Esc also works while a settings toggle or slider has focus (only text fields keep it);
    // 2.8.1: and it closes an open dialog even while its text field (Import) has focus
    const dialogOpen = typeof document !== "undefined" && document.getElementById("dialog")?.hidden === false;
    if (
      down &&
      !ev.repeat &&
      this._rlKey === "escape" &&
      ((tag === "INPUT" && /^(checkbox|range|radio)$/.test(ev.target.type)) ||
        (dialogOpen && (tag === "INPUT" || tag === "TEXTAREA")))
    ) {
      ev.target.blur();
      if (this.onPause) {
        this.onPause();
      }
      return;
    }
    if (down) {
      RL_RT.keydown++;
    } else {
      RL_RT.keyup++;
    }
    const name = this._rlKey;
    if (!name) return;
    // 2.3.6: a released key always counts as released, even when a text field has focus.
    if (!down) {
      this.keys.delete(name);
    }
    if (!(tag === "INPUT" || tag === "TEXTAREA")) {
      if (down) {
        RL_INPUT.touch = false;
      }
      if (down && (name === "escape" || name === "p")) {
        if (!ev.repeat && this.onPause) {
          this.onPause();
        }
        return;
      }
      if (name === " " && this.isPlaying && this.isPlaying()) {
        ev.preventDefault();
      }
      if (down && !ev.repeat && (name === " " || name === "shift")) {
        this.pending.dash = true;
      }
      if (down && !ev.repeat && (name === "e" || name === "q" || name === "f")) {
        this.pending.nova = true;
        ev.preventDefault();
      }
      // 3.0.0: G throws the gadget (3.12.0: the Singularity)
      if (down && !ev.repeat && name === "g") {
        this.pending.gadget = true;
        ev.preventDefault();
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(name)) {
        if (down) {
          this.keys.add(name);
        } else {
          this.keys.delete(name);
        }
        if (down) {
          ev.preventDefault();
        }
      }
    }
  }
  press(action) {
    if (this.enabled) {
      this.pending[action] = true;
    }
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
    this.move.active = false;
    this.aim.active = false;
    if (all) {
      this.keys.clear();
    }
    this.mouse.down = false;
    this.mouse.active = false;
    this.pending.dash = false;
    this.pending.nova = false;
    this.pending.gadget = false;
  }
  // 2.3.6: for the camera pan to a new boss. It dropped every input, so a finger held on the
  // move side did nothing after the pan until it was lifted, and held keys stopped. Now only
  // one-shot presses made during the pan (dash, nova) are dropped.
  settle() {
    this.pending.dash = false;
    this.pending.nova = false;
    this.pending.gadget = false;
  }
  /* the radius of the sticks in px: a share of the screen, times the stick size of the player (scale: another size) */
  radius(scale = this.stickScale) {
    return clamp(Math.min(window.innerWidth, window.innerHeight) * 0.14, 44, 72) * (scale || 1);
  }
  sample(world, settings) {
    let radius = (this.R = this.radius()),
      mx = 0,
      my = 0;
    if (this.move.active) {
      let dx = this.move.x - this.move.ox,
        dy = this.move.y - this.move.oy,
        dist = Math.hypot(dx, dy),
        dead = radius * 0.12;
      if (dist > dead) {
        let k = clamp((dist - dead) / (radius - dead), 0, 1);
        mx = (dx / dist) * k;
        my = (dy / dist) * k;
        this.usedMove = true;
      }
    }
    let keys = this.keys;
    if (keys.has("a") || keys.has("arrowleft")) {
      mx -= 1;
    }
    if (keys.has("d") || keys.has("arrowright")) {
      mx += 1;
    }
    if (keys.has("w") || keys.has("arrowup")) {
      my -= 1;
    }
    if (keys.has("s") || keys.has("arrowdown")) {
      my += 1;
    }
    let ax = 0,
      ay = 0,
      aim = false,
      fire = false;
    if (this.aim.active) {
      let dx = this.aim.x - this.aim.ox,
        dy = this.aim.y - this.aim.oy,
        dist = Math.hypot(dx, dy);
      fire = true;
      if (dist > radius * 0.22) {
        ax = dx / dist;
        ay = dy / dist;
        aim = true;
        this.usedAim = true;
      }
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
        if (dist > 0.3) {
          ax = dx / dist;
          ay = dy / dist;
          aim = true;
        }
      }
      fire = this.mouse.down;
      if (!fire) {
        aim = false;
      }
    }
    let out = {
      mx,
      my,
      ax,
      ay,
      aim,
      fire,
      auto: settings.autoFire !== false,
      assist: settings.assist !== false,
      dash: this.pending.dash,
      nova: this.pending.nova,
      gadget: this.pending.gadget,
    };
    this.pending.dash = false;
    this.pending.nova = false;
    this.pending.gadget = false;
    return out;
  }
};
// 2.4.2: keys 1–4 pick an upgrade card and R rerolls while the upgrade choice is open
function chooseKey(code, key) {
  if (!game.chooseShown || game.overShown || !getById("dialog").hidden || getById("choose").hidden) return false;
  const match = /^(?:Digit|Numpad)([1-4])$/.exec(code) || /^([1-4])$/.exec(key);
  if (match) {
    const card = getById("cards").querySelectorAll("[data-pick]")[+match[1] - 1];
    if (card && !getById("cards").classList.contains("locked")) {
      game.choose(card.dataset.pick);
    }
    return true;
  }
  if (key === "r") {
    if (!getById("rerollBtn").disabled) {
      game.reroll();
    }
    return true;
  }
  return false;
}
function newStick() {
  return { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0 };
}

export { Input, RL_INPUT };
