// The custom touch layout: where DASH, NOVA, GADGET and the pause button sit and how big they are, the opacity of the
// buttons, the size of the sticks and an optional fixed move stick, and the editor that sets them (Settings > Button
// layout). The settings are hudLayout, hudAlpha, stickSize and stickFixed; core/save.js cleans them with the limits of
// data/hud.js. A layout keeps every control as a point of the safe area (x and y from 0 to 1) and a size (times its
// size in the default layout), one layout per orientation; null is the default layout of index.html. Positions are
// kept for the right hand: left-handed play mirrors the action buttons and the stick (not the pause button, which
// belongs to the top bar).

import { clamp } from "../core/util.js";
import { HUD_CONTROL_IDS, HUD_LIMITS } from "../data/hud.js";
import { safeAreaInsets } from "../main.js";
import { getById } from "./ui.js";

/* the movable controls: element, name in the editor, smallest size on screen (px), mirrored for the left hand */
const CONTROL_INFO = {
    dash: { el: "dashBtn", name: "DASH", min: 40, mirror: true },
    nova: { el: "novaBtn", name: "NOVA", min: 40, mirror: true },
    gadget: { el: "gadgetBtn", name: "GADGET", min: 40, mirror: true },
    pause: { el: "pauseBtn", name: "PAUSE", min: 36, mirror: false },
  },
  HUD_CONTROLS = HUD_CONTROL_IDS.map((id) => ({ id, ...CONTROL_INFO[id] })),
  /* the space a control keeps to the others (px) and to the readouts of the HUD; the readouts grow in a run (a row of
     buff chips under the hull bar, the combo and the wave progress under the wave), so their room reaches lower */
  GAP = 6,
  KEEP_GAP = 3,
  KEEP_CLEAR = [
    ["#hud .hp-block", 22],
    ["#hud .wave-block", 26],
    ["#shardChip", 0],
    ["#bossBar", 0],
    ["#hudInfo", 0],
  ],
  /* where a fixed move stick sits until it is moved */
  DEFAULT_STICK = { portrait: { x: 0.2, y: 0.74 }, landscape: { x: 0.16, y: 0.66 } };

const round4 = (v) => Math.round(v * 1e4) / 1e4;
/* the orientation as the device profile of index.html sees it (the visual viewport) */
function hudOrientation() {
  const vv = window.visualViewport,
    w = vv?.width || window.innerWidth,
    h = vv?.height || window.innerHeight;
  return w >= h ? "landscape" : "portrait";
}
/* the safe area in px */
function hudBox() {
  const inset = safeAreaInsets(),
    W = window.innerWidth,
    H = window.innerHeight;
  return { l: inset.l, t: inset.t, w: Math.max(1, W - inset.l - inset.r), h: Math.max(1, H - inset.t - inset.b), W, H };
}
/* layouts that did not fit this screen in a run (see fitHudLayout): the default layout stands in for them */
const unfit = new Set();
const fitKey = (settings, orient) =>
  [orient, !!settings.swap, settings.stickFixed, settings.stickSize, JSON.stringify(settings.hudLayout)].join("|");
function layoutOf(settings, orient = hudOrientation()) {
  const layout = (settings.hudLayout && settings.hudLayout[orient]) || null;
  return layout && !unfit.has(fitKey(settings, orient)) ? layout : null;
}
const mirrored = (x, swap, mirror = true) => (swap && mirror ? 1 - x : x);
/* the spot of the fixed stick in a layout (a saved layout may have none) */
const stickOf = (layout, orient = hudOrientation()) => layout.stick || (layout.stick = { ...DEFAULT_STICK[orient] });

/* puts the controls where the layout says (layout: null for the default layout); applySettings and every resize call it */
function applyHudLayout(settings, layout = layoutOf(settings)) {
  const hud = getById("hud"),
    swap = !!settings.swap;
  hud.classList.toggle("custom", !!layout);
  for (const control of HUD_CONTROLS) {
    const el = getById(control.el),
      spot = layout && layout[control.id];
    if (spot) {
      el.style.setProperty("--hx", mirrored(spot.x, swap, control.mirror).toFixed(4));
      el.style.setProperty("--hy", spot.y.toFixed(4));
      el.style.setProperty("--hk", spot.s.toFixed(3));
    } else for (const name of ["--hx", "--hy", "--hk"]) el.style.removeProperty(name);
  }
  hud.style.setProperty("--hud-alpha", String(settings.hudAlpha ?? 1));
}

/* the centre of the fixed move stick in px (radius: the stick radius, which keeps the whole stick on screen) */
function fixedStickCenter(settings, radius, layout = layoutOf(settings)) {
  const orient = hudOrientation(),
    spot = (layout && layout.stick) || DEFAULT_STICK[orient],
    box = hudBox(),
    fx = mirrored(spot.x, settings.swap);
  return {
    x: clamp(box.l + box.w * fx, box.l + radius, Math.max(box.l + radius, box.l + box.w - radius)),
    y: clamp(box.t + box.h * spot.y, box.t + radius, Math.max(box.t + radius, box.t + box.h - radius)),
  };
}

/* the circle a control covers on screen */
function circleOf(el) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: Math.max(rect.width, rect.height) / 2 };
}
function hitsRect(circle, rect, gap) {
  const nx = clamp(circle.x, rect.left - gap, rect.right + gap),
    ny = clamp(circle.y, rect.top - gap, rect.bottom + gap);
  return Math.hypot(circle.x - nx, circle.y - ny) < circle.r;
}
/* The controls that sit where they may not, for the hand in use (now) and for the other hand (other: the layout
   mirrored, as left-handed play would show it), as sets of ids ("stick" for the fixed move stick). A control must stay
   in the safe area, off the readouts of the HUD and off the other controls; the fixed stick lies wholly on the move
   side. stick: the circle of the fixed stick, or null. */
function layoutProblems(swap, stick) {
  const box = hudBox(),
    mid = box.l + box.w / 2,
    keep = [];
  for (const [selector, below] of KEEP_CLEAR) {
    const el = document.querySelector(selector),
      rect = el && !el.hidden && el.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0)
      keep.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom + below });
  }
  const now = HUD_CONTROLS.map((control) => ({
    id: control.id,
    mirror: control.mirror,
    ...circleOf(getById(control.el)),
  }));
  if (stick) now.push({ id: "stick", mirror: true, ...stick });
  const check = (circles, left) => {
    const bad = new Set();
    for (const c of circles) {
      if (
        c.x - c.r < box.l - 1 ||
        c.x + c.r > box.l + box.w + 1 ||
        c.y - c.r < box.t - 1 ||
        c.y + c.r > box.t + box.h + 1 ||
        keep.some((rect) => hitsRect(c, rect, KEEP_GAP))
      )
        bad.add(c.id);
      if (c.id === "stick" && (left ? c.x - c.r < box.W / 2 : c.x + c.r > box.W / 2)) bad.add(c.id);
    }
    for (let i = 0; i < circles.length; i++)
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i],
          b = circles[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + GAP) {
          bad.add(a.id);
          bad.add(b.id);
        }
      }
    return bad;
  };
  return {
    now: check(now, !!swap),
    other: check(
      now.map((c) => (c.mirror ? { ...c, x: 2 * mid - c.x } : c)),
      !swap,
    ),
  };
}

/* A safety net for the run: a layout made on another screen (an imported save, the other orientation with a stick
   size changed in this one) may not fit here. Called when the HUD is on screen; if the layout in use covers a readout
   or overlaps itself, the default layout stands in for it until the settings change. Returns true when it stepped in. */
function fitHudLayout(settings, radius) {
  const orient = hudOrientation(),
    layout = layoutOf(settings, orient),
    hud = getById("hud");
  if (!layout || hud.hidden || hud.classList.contains("editing")) return false;
  applyHudLayout(settings, layout);
  const stick = settings.stickFixed ? { ...fixedStickCenter(settings, radius, layout), r: radius } : null;
  if (!layoutProblems(settings.swap, stick).now.size) return false;
  unfit.add(fitKey(settings, orient));
  applyHudLayout(settings);
  return true;
}

/* The editor: the real HUD is shown with the layout being edited (what you see is what you play), a layer above it
   takes the touches. Drag a control to move it, tap it to pick it for the size slider; the panel holds the sliders and
   can be dragged out of the way by its title or folded. A control can not leave the safe area, and a place where it
   covers another control or the hull, wave, shard or boss readouts (with either hand) is refused (it jumps back). The
   fixed move stick stays on the move side. Rotating the phone switches to the layout of the other orientation. */
class HudEditor {
  constructor({ store, ui, input, onSave }) {
    this.store = store;
    this.ui = ui;
    this.input = input;
    this.onSave = onSave;
    this.isOpen = false;
    this.draft = null;
    this.sel = "dash";
    this.drag = null;
    this.panelAt = null;
    this.prev = null;
    this.raf = 0;
    this.bind();
  }
  bind() {
    const zone = getById("heZone");
    zone.addEventListener("pointerdown", (ev) => this.down(ev));
    zone.addEventListener("pointermove", (ev) => this.moveEv(ev));
    zone.addEventListener("pointerup", (ev) => this.up(ev, false));
    zone.addEventListener("pointercancel", (ev) => this.up(ev, true));
    zone.addEventListener("contextmenu", (ev) => ev.preventDefault());
    // the panel follows its title bar
    const grab = getById("heGrab"),
      panel = getById("hePanel");
    let pan = null;
    grab.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("#heFold")) return;
      const rect = panel.getBoundingClientRect();
      pan = { id: ev.pointerId, dx: ev.clientX - rect.left, dy: ev.clientY - rect.top };
      try {
        grab.setPointerCapture(ev.pointerId);
      } catch {}
      ev.preventDefault();
    });
    grab.addEventListener("pointermove", (ev) => {
      if (!pan || ev.pointerId !== pan.id) return;
      this.panelAt = { x: ev.clientX - pan.dx, y: ev.clientY - pan.dy };
      this.placePanel();
    });
    const endPan = () => (pan = null);
    grab.addEventListener("pointerup", endPan);
    grab.addEventListener("pointercancel", endPan);
    for (const [id, [lo, hi]] of [
      ["heAlpha", HUD_LIMITS.alpha],
      ["heStickSize", HUD_LIMITS.stick],
    ]) {
      getById(id).min = String(lo);
      getById(id).max = String(hi);
    }
    getById("heSize").addEventListener("input", () => this.setSize(+getById("heSize").value));
    getById("heAlpha").addEventListener("input", () => {
      this.draft.alpha = clamp(+getById("heAlpha").value, ...HUD_LIMITS.alpha);
      this.render();
    });
    getById("heStickSize").addEventListener("input", () => this.setStickSize(+getById("heStickSize").value));
    getById("heFixed").addEventListener("change", () => {
      this.draft.stickFixed = getById("heFixed").checked;
      if (this.draft.stickFixed) this.sel = "stick";
      else if (this.sel === "stick") this.sel = "dash";
      this.render();
    });
    this.ui.click(getById("heReset"), () => {
      this.draft.layouts[hudOrientation()] = null;
      this.note = "";
      this.render();
    });
    this.ui.click(getById("heFold"), () => this.fold(!panel.classList.contains("folded")));
    this.ui.click(getById("heCancel"), () => this.close(false));
    this.ui.click(getById("heSave"), () => this.close(true));
    // the rings around the controls: picked (cyan) and refused (red)
    this.rings = HUD_CONTROLS.map(() => getById("heRings").appendChild(document.createElement("i")));
  }
  /* the panel folds to its title and buttons, to see what lies under it */
  fold(on) {
    getById("hePanel").classList.toggle("folded", on);
    getById("heFold").textContent = on ? "+" : "–";
    getById("heFold").setAttribute("aria-label", on ? "Unfold the panel" : "Fold the panel");
    this.placePanel();
  }
  open() {
    if (this.isOpen) return;
    const settings = this.store.data.settings,
      hud = getById("hud"),
      bossBar = getById("bossBar");
    this.prev = { hidden: hud.hidden, visibility: hud.style.visibility, bossHidden: bossBar.hidden };
    this.draft = {
      layouts: {
        portrait: structuredClone((settings.hudLayout && settings.hudLayout.portrait) || null),
        landscape: structuredClone((settings.hudLayout && settings.hudLayout.landscape) || null),
      },
      alpha: settings.hudAlpha ?? 1,
      stickSize: settings.stickSize || 1,
      stickFixed: !!settings.stickFixed,
    };
    this.sel = "dash";
    this.note = "";
    this.panelAt = null;
    this.drag = null;
    this.isOpen = true;
    getById("settings").hidden = true;
    hud.hidden = false;
    hud.style.visibility = "";
    // the boss bar shows the room it takes in a boss fight
    bossBar.hidden = false;
    hud.classList.add("editing");
    getById("hudEdit").hidden = false;
    getById("hePanel").classList.remove("faded");
    this.fold(false);
    this.render();
    requestAnimationFrame(() => window.__riftLayoutAudit?.());
  }
  close(save) {
    if (!this.isOpen) return;
    const settings = this.store.data.settings;
    if (save) {
      this.render();
      if (getById("heSave").disabled) return;
      const { portrait, landscape } = this.draft.layouts;
      settings.hudLayout = portrait || landscape ? { portrait, landscape } : null;
      settings.hudAlpha = this.draft.alpha;
      settings.stickSize = this.draft.stickSize;
      settings.stickFixed = this.draft.stickFixed;
    }
    this.isOpen = false;
    this.drag = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    getById("hePanel").classList.remove("faded");
    const hud = getById("hud");
    hud.classList.remove("editing");
    hud.hidden = this.prev.hidden;
    hud.style.visibility = this.prev.visibility;
    getById("bossBar").hidden = this.prev.bossHidden;
    getById("hudEdit").hidden = true;
    getById("settings").hidden = false;
    applyHudLayout(settings);
    if (save) this.onSave();
    this.ui.renderSettings();
    requestAnimationFrame(() => window.__riftLayoutAudit?.());
  }
  /* the window changed (a turn of the phone): a drag in progress goes back where it started */
  onResize() {
    if (!this.isOpen) return;
    if (this.drag) this.endDrag(true);
    this.render();
  }
  /* the settings as they would be with the draft */
  view() {
    const settings = this.store.data.settings;
    return {
      swap: settings.swap,
      hudAlpha: this.draft.alpha,
      stickSize: this.draft.stickSize,
      stickFixed: this.draft.stickFixed,
      hudLayout: this.draft.layouts,
    };
  }
  /* the layout of this orientation; the default layout is measured into one the first time something changes */
  ensure() {
    const orient = hudOrientation();
    if (!this.draft.layouts[orient]) {
      applyHudLayout(this.view(), null);
      const box = hudBox(),
        swap = !!this.store.data.settings.swap,
        layout = {};
      for (const control of HUD_CONTROLS) {
        const circle = circleOf(getById(control.el));
        layout[control.id] = {
          x: round4(mirrored((circle.x - box.l) / box.w, swap, control.mirror)),
          y: round4((circle.y - box.t) / box.h),
          s: 1,
        };
      }
      layout.stick = { ...DEFAULT_STICK[orient] };
      this.draft.layouts[orient] = layout;
    }
    return this.draft.layouts[orient];
  }
  stickRadius() {
    return this.input.radius(this.draft.stickSize);
  }
  stickCircle() {
    const radius = this.stickRadius(),
      center = fixedStickCenter(this.view(), radius, this.draft.layouts[hudOrientation()]);
    return { ...center, r: radius };
  }
  /* the controls that sit where they may not, with either hand (see layoutProblems) */
  problems() {
    const found = layoutProblems(this.store.data.settings.swap, this.draft.stickFixed ? this.stickCircle() : null);
    return { ...found, all: new Set([...found.now, ...found.other]) };
  }
  /* applies the draft and tells whether control `id` now sits where it may not */
  refused(id) {
    applyHudLayout(this.view(), this.draft.layouts[hudOrientation()]);
    return this.problems().all.has(id);
  }
  /* the control under a touch: the nearest one whose circle (plus a margin for the finger) holds the point */
  pick(x, y) {
    let best = null,
      bestD = Infinity;
    const consider = (id, circle, margin) => {
      const d = Math.hypot(x - circle.x, y - circle.y);
      if (d <= circle.r + margin && d < bestD) {
        best = { id, circle };
        bestD = d;
      }
    };
    for (const control of HUD_CONTROLS) consider(control.id, circleOf(getById(control.el)), 14);
    if (this.draft.stickFixed) consider("stick", this.stickCircle(), 0);
    return best;
  }
  /* the spot of a control in a layout */
  spotOf(layout, id) {
    return id === "stick" ? stickOf(layout) : layout[id];
  }
  down(ev) {
    ev.preventDefault();
    if (this.drag) return;
    const hit = this.pick(ev.clientX, ev.clientY);
    if (!hit) return;
    // a tap only picks the control; the layout becomes one of its own when something moves (see moveEv)
    this.sel = hit.id;
    const orient = hudOrientation(),
      layout = this.draft.layouts[orient],
      spot = layout && this.spotOf(layout, hit.id);
    this.drag = {
      id: hit.id,
      orient,
      pointer: ev.pointerId,
      dx: hit.circle.x - ev.clientX,
      dy: hit.circle.y - ev.clientY,
      r: hit.circle.r,
      from: spot ? { x: spot.x, y: spot.y } : null,
      moved: false,
    };
    this.note = "";
    try {
      getById("heZone").setPointerCapture(ev.pointerId);
    } catch {}
    getById("hePanel").classList.add("faded");
    this.render();
  }
  moveEv(ev) {
    const drag = this.drag;
    if (!drag || ev.pointerId !== drag.pointer) return;
    const box = hudBox(),
      swap = !!this.store.data.settings.swap,
      layout = this.ensure(),
      mirror = drag.id !== "pause",
      r = drag.r;
    let lo = box.l + r,
      hi = box.l + box.w - r;
    // the fixed move stick stays on the move side
    if (drag.id === "stick") {
      if (swap) lo = Math.max(lo, box.W / 2 + r);
      else hi = Math.min(hi, box.W / 2 - r);
    }
    const x = clamp(ev.clientX + drag.dx, lo, Math.max(lo, hi)),
      y = clamp(ev.clientY + drag.dy, box.t + r, Math.max(box.t + r, box.t + box.h - r)),
      spot = this.spotOf(layout, drag.id);
    spot.x = round4(mirrored((x - box.l) / box.w, swap, mirror));
    spot.y = round4((y - box.t) / box.h);
    drag.moved = true;
    // the drawing follows at most once a frame (every move would measure the whole HUD several times)
    if (!this.raf)
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.render();
      });
  }
  up(ev, cancelled) {
    const drag = this.drag;
    if (!drag || ev.pointerId !== drag.pointer) return;
    this.endDrag(cancelled);
    this.render();
  }
  /* ends a drag: back to where it started when it was cancelled or the place is refused */
  endDrag(cancelled) {
    const drag = this.drag;
    this.drag = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    getById("hePanel").classList.remove("faded");
    if (!drag.moved) return;
    const back = cancelled || drag.orient !== hudOrientation() || this.refused(drag.id);
    if (!back) return;
    if (!drag.from) this.draft.layouts[drag.orient] = null;
    else Object.assign(this.spotOf(this.draft.layouts[drag.orient], drag.id), drag.from);
    if (!cancelled) this.note = "Not there: it would cover another button or the hull and wave display.";
  }
  /* the size slider: the picked control grows or shrinks around its centre (never below its smallest size on screen) */
  setSize(value) {
    if (this.sel === "stick") return this.setStickSize(value);
    const layout = this.ensure(),
      spot = layout[this.sel],
      control = HUD_CONTROLS.find((c) => c.id === this.sel),
      base = getById(control.el).offsetWidth || 60,
      [lo, hi] = HUD_LIMITS.size,
      old = spot.s;
    spot.s = round4(clamp(value, Math.max(lo, control.min / base), hi));
    if (spot.s > old && this.refused(this.sel)) {
      spot.s = old;
      this.note = "No room to grow there: move it first.";
    } else this.note = "";
    this.render();
  }
  /* the stick size slider (and the size slider while the fixed stick is picked) */
  setStickSize(value) {
    const old = this.draft.stickSize;
    this.draft.stickSize = round4(clamp(value, ...HUD_LIMITS.stick));
    if (this.draft.stickSize > old && this.draft.stickFixed && this.refused("stick")) {
      this.draft.stickSize = old;
      this.note = "No room for a bigger stick there: move it first.";
    } else this.note = "";
    this.render();
  }
  placePanel() {
    const panel = getById("hePanel");
    if (!this.panelAt) {
      panel.style.left = panel.style.top = panel.style.translate = "";
      return;
    }
    const rect = panel.getBoundingClientRect(),
      x = clamp(this.panelAt.x, 0, Math.max(0, window.innerWidth - rect.width)),
      y = clamp(this.panelAt.y, 0, Math.max(0, window.innerHeight - rect.height));
    panel.style.left = x + "px";
    panel.style.top = y + "px";
    panel.style.translate = "none";
  }
  render() {
    if (!this.isOpen) return;
    const orient = hudOrientation(),
      layout = this.draft.layouts[orient],
      settings = this.store.data.settings,
      view = this.view();
    applyHudLayout(view, layout);
    if (this.sel === "stick" && !this.draft.stickFixed) this.sel = "dash";
    const bad = this.problems();
    HUD_CONTROLS.forEach((control, i) => {
      const c = circleOf(getById(control.el)),
        ring = this.rings[i],
        size = (c.r * 2 + 14).toFixed(1) + "px";
      ring.className = "he-ring" + (control.id === this.sel ? " sel" : "") + (bad.all.has(control.id) ? " bad" : "");
      ring.style.left = c.x.toFixed(1) + "px";
      ring.style.top = c.y.toFixed(1) + "px";
      ring.style.width = ring.style.height = size;
    });
    // the move stick: fixed (it can be dragged) or floating (it shows its size where a thumb would start)
    const stick = getById("heStick"),
      radius = this.stickRadius(),
      box = hudBox(),
      at = this.draft.stickFixed
        ? fixedStickCenter(view, radius, layout)
        : {
            x: box.l + box.w * (settings.swap ? 0.78 : 0.22),
            y: box.t + box.h * (orient === "landscape" ? 0.62 : 0.72),
          };
    stick.style.left = at.x.toFixed(1) + "px";
    stick.style.top = at.y.toFixed(1) + "px";
    stick.style.width = stick.style.height = (radius * 2).toFixed(1) + "px";
    stick.classList.toggle("fixed", this.draft.stickFixed);
    stick.classList.toggle("sel", this.sel === "stick");
    stick.classList.toggle("bad", bad.all.has("stick"));
    getById("heLeft").textContent = settings.swap ? "AIM + FIRE" : "MOVE";
    getById("heRight").textContent = settings.swap ? "MOVE" : "AIM + FIRE";
    // the panel
    const picked = HUD_CONTROLS.find((c) => c.id === this.sel),
      onStick = this.sel === "stick",
      size = onStick ? this.draft.stickSize : layout ? layout[this.sel].s : 1,
      [lo, hi] = onStick ? HUD_LIMITS.stick : HUD_LIMITS.size,
      sizeInput = getById("heSize");
    getById("heWhat").textContent = picked ? picked.name : "STICK";
    sizeInput.min = String(lo);
    sizeInput.max = String(hi);
    sizeInput.value = String(size);
    getById("heSizeV").textContent = Math.round(size * 100) + "%";
    getById("heAlpha").value = String(this.draft.alpha);
    getById("heAlphaV").textContent = Math.round(this.draft.alpha * 100) + "%";
    getById("heStickSize").value = String(this.draft.stickSize);
    getById("heStickV").textContent = Math.round(this.draft.stickSize * 100) + "%";
    getById("heFixed").checked = this.draft.stickFixed;
    getById("heOrient").textContent = orient === "landscape" ? "Landscape" : "Portrait";
    const note = getById("heNote"),
      hand = settings.swap ? "right-handed" : "left-handed";
    note.textContent =
      this.note ||
      (bad.now.size
        ? "Red buttons cover another button or the hull and wave display: move them."
        : bad.other.size
          ? `Red buttons would cover the HUD in ${hand} mode (the layout is mirrored there): move them.`
          : this.draft.stickFixed
            ? "Drag a button or the stick to move it, tap a button to resize it. Each orientation keeps its own layout."
            : "Drag a button to move it, tap it to resize it. The move stick starts where your thumb lands.");
    note.classList.toggle("bad", !!this.note || bad.all.size > 0);
    getById("heSave").disabled = bad.all.size > 0;
    this.placePanel();
  }
}
export { HUD_CONTROLS, HudEditor, applyHudLayout, fitHudLayout, fixedStickCenter, hudOrientation };
