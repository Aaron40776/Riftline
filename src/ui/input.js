// Keyboard, mouse and touch input (Input).

import { RL_RT } from "../core/diagnostics.js";
import { clamp } from "../core/util.js";

// 2.3.4: the input the player is using right now, so hints can say "W A S D" or "drag".
// Starts from the primary pointer (coarse = touch screen) and follows the last real input.
var RL_INPUT = { touch: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches };
var Input = class {
  constructor(t, e) {
    ((this.layer = t),
      (this.r = e),
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
    let t = this.layer;
    (t.addEventListener("pointerdown", (e) => this.down(e)),
      t.addEventListener("onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove", (e) => this.moveEv(e)),
      t.addEventListener("pointerup", (e) => this.up(e)),
      t.addEventListener("pointercancel", (e) => this.cancel(e)),
      t.addEventListener("lostpointercapture", (e) => this.cancel(e)),
      t.addEventListener("contextmenu", (e) => e.preventDefault()),
      window.addEventListener("keydown", (e) => this.key(e, !0)),
      window.addEventListener("keyup", (e) => this.key(e, !1)),
      window.addEventListener("blur", () => {
        (this.reset(!0), this.onBlur && this.onBlur());
      }),
      window.addEventListener("mousemove", (e) => {
        (Number.isFinite(e.clientX) && (this.mouse.x = e.clientX),
          Number.isFinite(e.clientY) && (this.mouse.y = e.clientY),
          (this.mouse.t = performance.now()));
      }),
      window.addEventListener("mouseup", () => {
        this.mouse.down = !1;
      }));
  }
  zoneIsMove(t) {
    let e = this.layer.getBoundingClientRect(),
      n = e.left + (e.width || this.layer.clientWidth || window.innerWidth) * 0.5,
      s = t < n;
    return this.swap ? !s : s;
  }
  down(t) {
    RL_RT.pointerdown++;
    RL_INPUT.touch = t.pointerType !== "mouse";
    if (!this.enabled) return;
    if ((t.preventDefault(), t.pointerType === "mouse")) {
      (t.button === 0 && ((this.mouse.down = !0), (this.mouse.active = !0)),
        (this.mouse.x = t.clientX),
        (this.mouse.y = t.clientY));
      return;
    }
    let e = this.zoneIsMove(t.clientX),
      n = e ? this.move : this.aim;
    if (n.active && n.id !== t.pointerId) {
      if (performance.now() - (n.lastEv || 0) < 2500) return;
      try {
        this.layer.releasePointerCapture(n.id);
      } catch {}
    }
    // 2.4.0: a double tap on the move side no longer dashes; the DASH button (and Space or
    // Shift on a keyboard) does.
    let s = performance.now();
    ((n.active = !0),
      (n.id = t.pointerId),
      (n.moved = 0),
      (n.lastEv = s),
      (n.ox = n.x = t.clientX),
      (n.oy = n.y = t.clientY),
      (n.t = performance.now()));
    try {
      this.layer.setPointerCapture(t.pointerId);
    } catch {}
  }
  moveEv(t) {
    RL_RT.pointermove++;
    if (t.pointerType === "mouse") {
      (Number.isFinite(t.clientX) && (this.mouse.x = t.clientX),
        Number.isFinite(t.clientY) && (this.mouse.y = t.clientY),
        (this.mouse.active = !0),
        (this.mouse.t = performance.now()),
        (RL_INPUT.touch = !1));
      return;
    }
    let n = t.getCoalescedEvents ? t.getCoalescedEvents() : null,
      s = n && n.length ? n[n.length - 1] : t,
      r = Number.isFinite(s.clientX) ? s.clientX : t.clientX,
      a = Number.isFinite(s.clientY) ? s.clientY : t.clientY;
    if (!Number.isFinite(r) || !Number.isFinite(a)) return;
    for (let e of [this.move, this.aim]) {
      if (!e.active || e.id !== s.pointerId) continue;
      ((e.lastEv = performance.now()),
        (e.x = r),
        (e.y = a),
        (e.moved = Math.max(e.moved || 0, Math.hypot(e.x - e.ox, e.y - e.oy))));
      let o = e.x - e.ox,
        c = e.y - e.oy,
        h = Math.hypot(o, c),
        l = this.R * 1.25;
      h > l && ((e.ox = e.x - (o / h) * l), (e.oy = e.y - (c / h) * l));
    }
  }
  up(t) {
    RL_RT.pointerup++;
    if (t.pointerType === "mouse") {
      this.mouse.down = !1;
      return;
    }
    for (let e of [this.move, this.aim]) !e.active || e.id !== t.pointerId || (e.active = !1);
  }
  cancel(t) {
    RL_RT.pointercancel++;
    if (t.pointerType === "mouse") {
      ((this.mouse.down = !1), (this.mouse.active = !1));
      return;
    }
    for (let e of [this.move, this.aim]) !e.active || e.id !== t.pointerId || (e.active = !1);
  }
  key(t, e) {
    e ? RL_RT.keydown++ : RL_RT.keyup++;
    let n = String(t.key || "").toLowerCase();
    if (!n) return;
    let s = t.target && t.target.tagName;
    // 2.3.6: a released key always counts as released, even when a text field has focus.
    e || this.keys.delete(n);
    if (!(s === "INPUT" || s === "TEXTAREA")) {
      e && (RL_INPUT.touch = !1);
      if (e && (n === "escape" || n === "p")) {
        !t.repeat && this.onPause && this.onPause();
        return;
      }
      (n === " " && this.isPlaying && this.isPlaying() && t.preventDefault(),
        e && !t.repeat && (n === " " || n === "shift") && (this.pending.dash = !0),
        e && !t.repeat && (n === "e" || n === "q" || n === "f") && ((this.pending.nova = !0), t.preventDefault()),
        ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(n) &&
          (e ? this.keys.add(n) : this.keys.delete(n), e && t.preventDefault()));
    }
  }
  press(t) {
    this.enabled && (this.pending[t] = !0);
  }
  // 2.3.6: held keys survive a reset (pause, upgrade pick, resize): keyup events keep arriving,
  // so W A S D stay correct. Before, holding W+D through a reset left only the key that
  // auto-repeats (D) working. reset(true) also forgets the keys, for when keyups can get lost
  // (window blur, page hide).
  reset(all) {
    RL_RT.reset++;
    for (let t of [this.move, this.aim])
      if (t.active && t.id >= 0)
        try {
          this.layer.releasePointerCapture(t.id);
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
  sample(t, e) {
    let n = (this.R = clamp(Math.min(window.innerWidth, window.innerHeight) * 0.14, 44, 72)),
      s = 0,
      r = 0;
    if (this.move.active) {
      let f = this.move.x - this.move.ox,
        p = this.move.y - this.move.oy,
        x = Math.hypot(f, p),
        m = n * 0.12;
      if (x > m) {
        let g = clamp((x - m) / (n - m), 0, 1);
        ((s = (f / x) * g), (r = (p / x) * g), (this.usedMove = !0));
      }
    }
    let a = this.keys;
    ((a.has("a") || a.has("arrowleft")) && (s -= 1),
      (a.has("d") || a.has("arrowright")) && (s += 1),
      (a.has("w") || a.has("arrowup")) && (r -= 1),
      (a.has("s") || a.has("arrowdown")) && (r += 1));
    let o = 0,
      c = 0,
      h = !1,
      l = !1;
    if (this.aim.active) {
      let f = this.aim.x - this.aim.ox,
        p = this.aim.y - this.aim.oy,
        x = Math.hypot(f, p);
      ((l = !0), x > n * 0.22 && ((o = f / x), (c = p / x), (h = !0), (this.usedAim = !0)));
    }
    let u = performance.now() - this.mouse.t < 2500;
    if (
      !h &&
      t &&
      (this.mouse.down || (u && this.mouse.active && !this.move.active && !this.aim.active && !e.autoFire))
    ) {
      let f = this.r.groundAt(this.mouse.x, this.mouse.y);
      if (f) {
        let p = f.x - t.player.x,
          x = f.y - t.player.y,
          m = Math.hypot(p, x);
        m > 0.3 && ((o = p / m), (c = x / m), (h = !0));
      }
      ((l = this.mouse.down), l || (h = !1));
    }
    let d = {
      mx: s,
      my: r,
      ax: o,
      ay: c,
      aim: h,
      fire: l,
      auto: e.autoFire !== !1,
      assist: e.assist !== !1,
      dash: this.pending.dash,
      nova: this.pending.nova,
    };
    return ((this.pending.dash = !1), (this.pending.nova = !1), d);
  }
};
function newStick() {
  return { active: !1, id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0 };
}

export { Input, RL_INPUT };
