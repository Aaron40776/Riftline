// 3.23.0: the gamepad. A controller works everywhere in the game without a setting: the left stick moves, the right stick
// aims (and fires, like the aim stick on a touch screen), A or the left bumper dashes, X the Nova, Y the Singularity, the
// right trigger fires where the drone faces, Start pauses; in the menus the D-pad and the left stick move a ring of focus
// from button to button (the nearest one in that direction), A presses it, B goes back. Controllers with the standard layout
// (Xbox, PlayStation, Switch Pro and most others in a browser) are read; the rumble of a controller and the vibration of a
// phone are in rumble() at the end. Nothing here runs while no controller is connected.

const DEAD = 0.2, // radial dead zone of a stick
  AIM_FIRE = 0.3, // the right stick fires from this far out
  TRIGGER = 0.4,
  REPEAT_FIRST = 0.4, // seconds until a held direction in a menu repeats, then every REPEAT_NEXT
  REPEAT_NEXT = 0.13;

// the buttons of the standard mapping
const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
};

/* a stick with its dead zone cut out of the middle: 0 inside it, then growing from 0 to 1 (not jumping to 0.2) */
function stick(x, y) {
  const len = Math.hypot(x, y);
  if (len < DEAD) return { x: 0, y: 0, len: 0 };
  const k = Math.min(1, (len - DEAD) / (1 - DEAD)) / len;
  return { x: x * k, y: y * k, len: Math.min(1, (len - DEAD) / (1 - DEAD)) };
}

class GamepadReader {
  constructor() {
    this.prev = {};
    this.held = {}; // direction -> seconds it has been held
    this.id = null;
  }
  /* the first connected controller (or null) */
  pad() {
    let pads = [];
    try {
      pads = (typeof navigator !== "undefined" && navigator.getGamepads && navigator.getGamepads()) || [];
    } catch {}
    for (const p of pads) if (p && p.connected !== false && p.buttons && p.axes) return p;
    return null;
  }
  /* one reading: the sticks, what is held, and the buttons that went down since the last reading (edges); `dt` is the
     time since the last reading (for the repeat of a direction held in a menu) */
  read(dt = 1 / 60) {
    const p = this.pad();
    if (!p) {
      if (this.id) this.prev = {};
      this.id = null;
      return null;
    }
    this.id = p.id || "gamepad";
    const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.6)),
      trig = (i) => !!p.buttons[i] && (p.buttons[i].value > TRIGGER || p.buttons[i].pressed),
      left = stick(p.axes[0] || 0, p.axes[1] || 0),
      right = stick(p.axes[2] || 0, p.axes[3] || 0),
      now = {
        a: b(BTN.A),
        b: b(BTN.B),
        x: b(BTN.X),
        y: b(BTN.Y),
        lb: b(BTN.LB),
        rb: b(BTN.RB),
        start: b(BTN.START),
        select: b(BTN.SELECT),
        up: b(BTN.UP) || left.y < -0.6,
        down: b(BTN.DOWN) || left.y > 0.6,
        left: b(BTN.LEFT) || left.x < -0.6,
        right: b(BTN.RIGHT) || left.x > 0.6,
      },
      edge = {};
    for (const k of Object.keys(now)) edge[k] = now[k] && !this.prev[k];
    // a direction held in a menu repeats
    const repeat = {};
    for (const k of ["up", "down", "left", "right"]) {
      if (now[k]) {
        const t = (this.held[k] || 0) + dt;
        if (edge[k]) this.held[k] = 0;
        else {
          this.held[k] = t;
          if (t >= REPEAT_FIRST) {
            this.held[k] = REPEAT_FIRST - REPEAT_NEXT;
            repeat[k] = true;
          }
        }
      } else this.held[k] = 0;
    }
    this.prev = now;
    return {
      id: this.id,
      move: left,
      aim: right,
      fire: right.len > AIM_FIRE || trig(BTN.RT) || b(BTN.RB),
      now,
      edge,
      repeat,
    };
  }
}

/* ---- the menus: a ring of focus that moves to the nearest button in a direction ---- */
const FOCUSABLE = "button, [data-go], [data-pick], .card, input[type=checkbox], select, a[href]";

/* the part of the page that takes the input now: an open dialog, else the last screen that is shown */
function topLayer() {
  const dialog = document.getElementById("dialog");
  if (dialog && !dialog.hidden) return dialog;
  const screens = [...document.querySelectorAll(".screen:not([hidden])")];
  return screens.length ? screens[screens.length - 1] : document.body;
}
function visible(el) {
  if (el.disabled || el.hidden) return false;
  const r = el.getBoundingClientRect(),
    st = getComputedStyle(el);
  if (r.width < 4 || r.height < 4 || st.visibility === "hidden" || st.display === "none" || +st.opacity < 0.05)
    return false;
  return r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight;
}
function candidates() {
  return [...topLayer().querySelectorAll(FOCUSABLE)].filter(visible);
}
/* moves the ring: `dir` is up, down, left or right; returns the element now in focus (or null) */
function moveFocus(dir) {
  const list = candidates();
  if (!list.length) return null;
  let cur = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) cur = list.find((el) => el.classList.contains("pad-focus")) || null;
  if (!cur) return setFocus(list[0]);
  const c = cur.getBoundingClientRect(),
    cx = c.left + c.width / 2,
    cy = c.top + c.height / 2,
    vx = dir === "left" ? -1 : dir === "right" ? 1 : 0,
    vy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
  let best = null,
    bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(),
      dx = r.left + r.width / 2 - cx,
      dy = r.top + r.height / 2 - cy,
      along = dx * vx + dy * vy,
      across = Math.abs(dx * vy) + Math.abs(dy * vx);
    // only what lies in that direction; the nearest, and what lies straight ahead before what lies to the side
    if (along <= 2) continue;
    const score = along + across * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best ? setFocus(best) : cur;
}
function setFocus(el) {
  for (const old of document.querySelectorAll(".pad-focus")) old.classList.remove("pad-focus");
  el.classList.add("pad-focus");
  try {
    el.focus({ preventScroll: false });
  } catch {}
  if (el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  return el;
}
function clearFocus() {
  for (const old of document.querySelectorAll(".pad-focus")) old.classList.remove("pad-focus");
}
/* A: presses the button in focus (a checkbox toggles). 3.28.1: the ring can be left on a button of a screen that is gone
   or under a dialog (opening a dialog moves the browser's focus, not the ring), so the element that really has the focus
   is tried too, and only what is in the top layer counts */
function pressFocus() {
  const list = candidates();
  for (const el of [document.querySelector(".pad-focus"), document.activeElement])
    if (el && el !== document.body && list.includes(el)) {
      el.click();
      return true;
    }
  return false;
}
/* the main button of the top layer, for A when nothing is in focus (never a toggle such as a pact) */
function mainButton() {
  return [...topLayer().querySelectorAll(".btn.primary")].find(
    (b) => !b.disabled && b.offsetWidth && !b.hasAttribute("aria-pressed"),
  );
}

/* ---- rumble: the controller's motors, or the vibration of a phone ---- */
const RUMBLE = {
  hurt: { ms: 160, strong: 0.55, weak: 0.7, phone: [30] },
  dash: { ms: 70, strong: 0.2, weak: 0.5, phone: [14] },
  slam: { ms: 260, strong: 0.9, weak: 0.5, phone: [60] },
  die: { ms: 600, strong: 1, weak: 0.8, phone: [120] },
};
function rumble(kind, enabled = true) {
  const r = RUMBLE[kind];
  if (!r || !enabled) return false;
  let done = false;
  try {
    const pads = (typeof navigator !== "undefined" && navigator.getGamepads && navigator.getGamepads()) || [];
    for (const p of pads) {
      const act = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]));
      if (act && act.playEffect) {
        act.playEffect("dual-rumble", {
          startDelay: 0,
          duration: r.ms,
          strongMagnitude: r.strong,
          weakMagnitude: r.weak,
        });
        done = true;
      } else if (act && act.pulse) {
        act.pulse(r.strong, r.ms);
        done = true;
      }
    }
  } catch {}
  // a phone (Android Chrome): only where the screen is touched, never on a desktop that happens to have the call
  try {
    if (!done && navigator.vibrate && matchMedia("(pointer: coarse)").matches) {
      navigator.vibrate(r.phone);
      done = true;
    }
  } catch {}
  return done;
}

export { GamepadReader, stick, moveFocus, setFocus, clearFocus, pressFocus, mainButton, rumble, candidates, DEAD, BTN };
