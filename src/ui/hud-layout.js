// The custom touch layout (3.6.0): where DASH, NOVA, GADGET and the pause button sit and how big they are, the
// opacity of the buttons, the size of the sticks and an optional fixed move stick, and the editor that sets them
// (Settings > Button layout). The settings are hudLayout, hudAlpha, stickSize and stickFixed; core/save.js cleans
// them. A layout keeps every control as a point of the safe area (x and y from 0 to 1) and a size (times its size in
// the default layout), one layout per orientation; null is the default layout of index.html. Positions are kept for
// the right hand: left-handed play mirrors them.

import { clamp } from "../core/util.js";
import { safeAreaInsets } from "../main.js";
import { getById } from "./ui.js";

/* the movable controls: id in the layout, element, name in the editor, smallest size on screen (px) */
const HUD_CONTROLS = [
    { id: "dash", el: "dashBtn", name: "DASH", min: 40 },
    { id: "nova", el: "novaBtn", name: "NOVA", min: 40 },
    { id: "gadget", el: "gadgetBtn", name: "GADGET", min: 40 },
    { id: "pause", el: "pauseBtn", name: "PAUSE", min: 36 },
  ],
  SIZE_MIN = 0.6,
  SIZE_MAX = 1.6,
  /* the space a control keeps to the others (px) and to the readouts of the HUD (KEEP_CLEAR) */
  GAP = 6,
  KEEP_GAP = 3,
  KEEP_CLEAR = ["#hud .hp-block", "#hud .wave-block", "#shardChip", "#bossBar"],
  /* where a fixed move stick sits until it is moved */
  DEFAULT_STICK = { portrait: { x: 0.2, y: 0.74 }, landscape: { x: 0.16, y: 0.66 } };

const round4 = (v) => Math.round(v * 1e4) / 1e4;
const hudOrientation = () => (window.innerWidth >= window.innerHeight ? "landscape" : "portrait");
/* the safe area in px */
function hudBox() {
  const inset = safeAreaInsets(),
    W = window.innerWidth,
    H = window.innerHeight;
  return { l: inset.l, t: inset.t, w: Math.max(1, W - inset.l - inset.r), h: Math.max(1, H - inset.t - inset.b), W, H };
}
const layoutOf = (settings, orient = hudOrientation()) => (settings.hudLayout && settings.hudLayout[orient]) || null;

/* puts the controls where the layout says (layout: null for the default layout); applySettings and every resize call it */
function applyHudLayout(settings, layout = layoutOf(settings)) {
  const hud = getById("hud"),
    swap = !!settings.swap;
  hud.classList.toggle("custom", !!layout);
  for (const control of HUD_CONTROLS) {
    const el = getById(control.el),
      spot = layout && layout[control.id];
    if (spot) {
      el.style.setProperty("--hx", (swap ? 1 - spot.x : spot.x).toFixed(4));
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
    fx = settings.swap ? 1 - spot.x : spot.x;
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

/* The editor: the real HUD is shown with the layout being edited (what you see is what you play), a layer above it
   takes the touches. Drag a control to move it, tap it to pick it for the size slider; the panel holds the sliders and
   can be dragged out of the way by its title. A control can not leave the safe area, and a place where it covers
   another control or the hull, wave, shard or boss readouts is refused (it jumps back). The fixed move stick stays on
   the move side. Rotating the phone switches to the layout of the other orientation. */
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
    getById("heSize").addEventListener("input", () => this.setSize(+getById("heSize").value));
    getById("heAlpha").addEventListener("input", () => {
      this.draft.alpha = clamp(+getById("heAlpha").value, 0.3, 1);
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
    // the panel folds to its title and buttons, to see what lies under it
    this.ui.click(getById("heFold"), () => {
      const folded = panel.classList.toggle("folded");
      getById("heFold").textContent = folded ? "+" : "\u2013";
      getById("heFold").setAttribute("aria-label", folded ? "Unfold the panel" : "Fold the panel");
      this.placePanel();
    });
    this.ui.click(getById("heCancel"), () => this.close(false));
    this.ui.click(getById("heSave"), () => this.close(true));
    let raf = 0;
    const onResize = () => {
      if (!this.isOpen || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        this.drag = null;
        this.render();
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });
  }
  open() {
    if (this.isOpen) return;
    const settings = this.store.data.settings,
      hud = getById("hud"),
      bossBar = getById("bossBar");
    this.prev = { hidden: hud.hidden, visibility: hud.style.visibility, bossHidden: bossBar.hidden };
    this.draft = {
      layouts: {
        portrait: structuredClone(layoutOf(settings, "portrait")),
        landscape: structuredClone(layoutOf(settings, "landscape")),
      },
      alpha: settings.hudAlpha ?? 1,
      stickSize: settings.stickSize || 1,
      stickFixed: !!settings.stickFixed,
    };
    this.sel = "dash";
    this.note = "";
    this.panelAt = null;
    this.isOpen = true;
    getById("settings").hidden = true;
    hud.hidden = false;
    hud.style.visibility = "";
    // the boss bar shows the room it takes in a boss fight
    bossBar.hidden = false;
    hud.classList.add("editing");
    getById("hudEdit").hidden = false;
    this.placePanel();
    this.render();
    requestAnimationFrame(() => window.__riftLayoutAudit?.());
  }
  close(save) {
    if (!this.isOpen) return;
    const settings = this.store.data.settings;
    if (save && this.problems().size) {
      this.note = "Move the red buttons first: they cover another button or the hull and wave display.";
      this.render();
      return;
    }
    if (save) {
      const { portrait, landscape } = this.draft.layouts;
      settings.hudLayout = portrait || landscape ? { portrait, landscape } : null;
      settings.hudAlpha = this.draft.alpha;
      settings.stickSize = this.draft.stickSize;
      settings.stickFixed = this.draft.stickFixed;
    }
    this.isOpen = false;
    this.drag = null;
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
        const circle = circleOf(getById(control.el)),
          fx = (circle.x - box.l) / box.w;
        layout[control.id] = { x: round4(swap ? 1 - fx : fx), y: round4((circle.y - box.t) / box.h), s: 1 };
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
  /* the controls that sit where they may not (ids, "stick" for the fixed move stick) */
  problems() {
    const box = hudBox(),
      bad = new Set(),
      circles = HUD_CONTROLS.map((control) => ({ id: control.id, ...circleOf(getById(control.el)) })),
      keep = [];
    if (this.draft.stickFixed) circles.push({ id: "stick", ...this.stickCircle() });
    for (const selector of KEEP_CLEAR) {
      const el = document.querySelector(selector),
        rect = el && !el.hidden && el.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) keep.push(rect);
    }
    for (const c of circles) {
      if (
        c.x - c.r < box.l - 1 ||
        c.x + c.r > box.l + box.w + 1 ||
        c.y - c.r < box.t - 1 ||
        c.y + c.r > box.t + box.h + 1 ||
        keep.some((rect) => hitsRect(c, rect, KEEP_GAP))
      )
        bad.add(c.id);
      // the fixed move stick lies wholly on the move side
      if (c.id === "stick" && (this.store.data.settings.swap ? c.x - c.r < box.W / 2 : c.x + c.r > box.W / 2))
        bad.add(c.id);
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
  }
  /* applies the draft and tells whether control `id` now sits where it may not */
  refused(id) {
    applyHudLayout(this.view(), this.draft.layouts[hudOrientation()]);
    return this.problems().has(id);
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
  down(ev) {
    ev.preventDefault();
    if (this.drag) return;
    const hit = this.pick(ev.clientX, ev.clientY);
    if (!hit) return;
    this.sel = hit.id;
    const layout = this.ensure(),
      spot = hit.id === "stick" ? layout.stick : layout[hit.id];
    this.drag = {
      id: hit.id,
      pointer: ev.pointerId,
      dx: hit.circle.x - ev.clientX,
      dy: hit.circle.y - ev.clientY,
      r: hit.circle.r,
      from: { x: spot.x, y: spot.y },
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
      fx = (x - box.l) / box.w,
      spot = drag.id === "stick" ? layout.stick : layout[drag.id];
    spot.x = round4(swap ? 1 - fx : fx);
    spot.y = round4((y - box.t) / box.h);
    drag.moved = true;
    this.render();
  }
  up(ev, cancelled) {
    const drag = this.drag;
    if (!drag || ev.pointerId !== drag.pointer) return;
    this.drag = null;
    getById("hePanel").classList.remove("faded");
    const layout = this.ensure(),
      spot = drag.id === "stick" ? layout.stick : layout[drag.id];
    if (cancelled || (drag.moved && this.refused(drag.id))) {
      spot.x = drag.from.x;
      spot.y = drag.from.y;
      if (!cancelled) this.note = "Not there: it would cover another button or the hull and wave display.";
    }
    this.render();
  }
  /* the size slider: the picked control grows or shrinks around its centre (never below its smallest size on screen) */
  setSize(value) {
    if (this.sel === "stick") return this.setStickSize(value);
    const layout = this.ensure(),
      spot = layout[this.sel],
      control = HUD_CONTROLS.find((c) => c.id === this.sel),
      base = getById(control.el).offsetWidth || 60,
      old = spot.s;
    spot.s = round4(clamp(value, Math.max(SIZE_MIN, control.min / base), SIZE_MAX));
    if (spot.s > old && this.refused(this.sel)) {
      spot.s = old;
      this.note = "No room to grow there: move it first.";
    } else this.note = "";
    this.render();
  }
  /* the stick size slider (and the size slider while the fixed stick is picked) */
  setStickSize(value) {
    const old = this.draft.stickSize;
    this.draft.stickSize = round4(clamp(value, 0.7, 1.5));
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
    // the rings around the controls: picked (cyan) and refused (red)
    const rings = getById("heRings");
    rings.innerHTML = HUD_CONTROLS.map((control) => {
      const c = circleOf(getById(control.el)),
        cls = (control.id === this.sel ? " sel" : "") + (bad.has(control.id) ? " bad" : "");
      return `<i class="he-ring${cls}" style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px;width:${(c.r * 2 + 14).toFixed(1)}px;height:${(c.r * 2 + 14).toFixed(1)}px"></i>`;
    }).join("");
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
    stick.classList.toggle("bad", bad.has("stick"));
    getById("heLeft").textContent = settings.swap ? "AIM + FIRE" : "MOVE";
    getById("heRight").textContent = settings.swap ? "MOVE" : "AIM + FIRE";
    // the panel
    const picked = HUD_CONTROLS.find((c) => c.id === this.sel),
      onStick = this.sel === "stick",
      size = onStick ? this.draft.stickSize : layout ? layout[this.sel].s : 1,
      sizeInput = getById("heSize");
    getById("heWhat").textContent = picked ? picked.name : "STICK";
    sizeInput.min = String(onStick ? 0.7 : SIZE_MIN);
    sizeInput.max = String(onStick ? 1.5 : SIZE_MAX);
    sizeInput.value = String(size);
    getById("heSizeV").textContent = Math.round(size * 100) + "%";
    getById("heAlpha").value = String(this.draft.alpha);
    getById("heAlphaV").textContent = Math.round(this.draft.alpha * 100) + "%";
    getById("heStickSize").value = String(this.draft.stickSize);
    getById("heStickV").textContent = Math.round(this.draft.stickSize * 100) + "%";
    getById("heFixed").checked = this.draft.stickFixed;
    getById("heOrient").textContent = orient === "landscape" ? "Landscape" : "Portrait";
    const note = getById("heNote");
    note.textContent =
      this.note ||
      (bad.size
        ? "Red buttons cover another button or the hull and wave display: move them."
        : this.draft.stickFixed
          ? "Drag a button or the stick to move it, tap a button to resize it. Each orientation keeps its own layout."
          : "Drag a button to move it, tap it to resize it. The move stick starts where your thumb lands.");
    note.classList.toggle("bad", !!this.note || bad.size > 0);
    getById("heSave").disabled = bad.size > 0;
    this.placePanel();
  }
}
export { HUD_CONTROLS, HudEditor, applyHudLayout, fixedStickCenter, hudOrientation };
