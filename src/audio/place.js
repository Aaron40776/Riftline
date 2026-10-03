// 3.9.0: the sounds of the place. Until 3.8.0 the biomes sounded alike apart from their music: the sounds of a place were
// soft notes of the calm themes, and the hazards were silent until a vent erupted. Now the hazards sound where they are
// (panned left or right of the drone, softer with the distance) and every biome has rare sounds of its own far away:
//   Ember Works   lava bubbles in the vents; a vent draws breath (a rising rumble and roar) before it erupts
//   Blackout City the live manholes hum when you are close and crackle faster and faster while they charge
//   Cryo Vault    the ice cracks and creaks under the drone while it moves on a sheet, sheets tinkle now and then
//   Toxin Marsh   bubbles pop in the acid pools; the drone sizzles while it stands in acid
//   Void Core     the portals hum (two tones that beat) and whisper
//   far away      thunder, a car alarm, a passing car, police radio, sparks of a broken lamp (Blackout City); an anvil,
//                 chains, a steam valve, a conveyor (Ember Works); an ice crack with a boom, falling icicles, a gust, the
//                 groan of the glacier (Cryo Vault); frogs, a bird, an owl, mud (Toxin Marsh); a deep swell, a glass
//                 shimmer, a breath, a glitch (Void Core)
// They go to the ambience bus of the engine (its own volume in Settings) as voices of low priority: every effect of the
// fight takes their place when the voices run out. The noise is pink or brown (no white hiss), most of it is tonal.
// Nothing here touches the simulation: the timers use Math.random, like the rest of the sound effects.

const HEAR = 16; // metres: how far a hazard is heard
// the level of a hazard at distance d (1 on top of it, 0 at HEAR)
const near = (d) => Math.pow(Math.max(0, 1 - d / HEAR), 1.6);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/* a tone and a burst of noise on the ambience bus at the level (a.g) and pan (a.pan) of the sound; o.dp moves the pan */
const T = (e, a, f, dur, wave, vol, o = {}) =>
  e.tone(f, dur, wave, vol * a.g, {
    ...o,
    dest: e.ambBus,
    pri: 0.5,
    pan: Math.max(-1, Math.min(1, a.pan + (o.dp || 0))),
    rev: o.rev ?? 0.25,
  });
const N = (e, a, dur, vol, o = {}) =>
  e.noise(dur, vol * a.g, {
    color: "pink",
    ...o,
    dest: e.ambBus,
    pri: 0.5,
    pan: Math.max(-1, Math.min(1, a.pan + (o.dp || 0))),
    rev: o.rev ?? 0.25,
  });

/* every sound of the place: (engine, a) with a = { g: level 0..1, pan: -1..1 } */
const PLACE = {
  // ---- hazards ----
  // a bubble of lava bursts: a round low blob that rises, then a soft pop
  lavaBlub(e, a) {
    const f = rand(65, 110);
    T(e, a, f, 0.24, "sine", 0.11, { to: f * 1.9, attack: 0.03 });
    N(e, a, 0.07, 0.06, { f: 600, to: 220, color: "brown", at: 0.18 });
  },
  // the vent draws breath before it erupts (the warning lasts 1.2 s): a rumble and a roar that rise together
  lavaWarn(e, a) {
    T(e, a, 42, 1.25, "sawtooth", 0.07, { to: 72, lp: 240, attack: 0.95, hold: 0.2 });
    N(e, a, 1.25, 0.12, { f: 180, to: 950, color: "brown", attack: 1.0, q: 0.9 });
    // the lava boils faster under it
    for (let i = 0; i < 3; i++) {
      const f = rand(70, 120);
      T(e, a, f, 0.2, "sine", 0.07, { to: f * 1.9, attack: 0.03, at: 0.25 + i * 0.3 });
    }
  },
  // a live manhole hums when you are close: mains at 50 and 100 Hz, behind a low-pass
  hum(e, a) {
    T(e, a, 100, 0.95, "sawtooth", 0.025, { lp: 320, attack: 0.3, hold: 0.35 });
    T(e, a, 50, 0.95, "sine", 0.04, { attack: 0.3, hold: 0.35 });
  },
  // it charges: crackles that come faster and faster over the 1.2 s of the warning, and a thin whine that rises
  charge(e, a) {
    for (let i = 0; i < 10; i++) {
      const at = 1.15 * (1 - Math.pow(1 - i / 10, 1.7));
      N(e, a, 0.014, 0.09 + 0.08 * (i / 10), { type: "bandpass", f: rand(2400, 6000), q: 5, at, dp: rand(-0.1, 0.1) });
    }
    T(e, a, 600, 1.2, "sawtooth", 0.02, { to: 2400, lp: 3000, attack: 0.9 });
  },
  // the ice cracks under the drone: a click, a ping that falls, a low boom
  iceCrack(e, a) {
    N(e, a, 0.018, 0.09, { type: "highpass", f: 3200, attack: 0.001 });
    T(e, a, rand(2400, 3400), 0.28, "sine", 0.045, { to: 800 });
    T(e, a, 130, 0.45, "sine", 0.06, { to: 55, at: 0.01 });
  },
  // and creaks: a low saw through a narrow band
  iceCreak(e, a) {
    const f = rand(80, 105);
    T(e, a, f, 0.55, "sawtooth", 0.045, { to: f * 0.72, lp: 420, q: 6, attack: 0.1 });
  },
  // a sheet tinkles: a few high bells, one after another
  iceTink(e, a) {
    for (let i = 0; i < 3; i++)
      T(e, a, rand(3000, 5200), 0.35, "sine", 0.026, { at: i * rand(0.05, 0.12), dp: rand(-0.15, 0.15), rev: 0.5 });
  },
  // a bubble in the acid pops: a quick upward chirp, sometimes two
  acidBubble(e, a) {
    const f = rand(280, 650);
    T(e, a, f, 0.07, "sine", 0.055, { to: f * 2.3 });
    if (Math.random() < 0.35) T(e, a, f * 1.3, 0.06, "sine", 0.04, { to: f * 2.8, at: rand(0.08, 0.16) });
  },
  // the drone stands in acid: a short sizzle (a band of pink noise) with tiny pops in it
  acidSizzle(e, a) {
    N(e, a, 0.3, 0.05, { type: "bandpass", f: 3400, q: 1.6, attack: 0.03 });
    for (let i = 0; i < 3; i++) T(e, a, rand(900, 1600), 0.03, "sine", 0.02, { to: 2600, at: rand(0, 0.25) });
  },
  // a portal hums: two low tones that beat, an octave and a fifth above, swelling (the grains overlap)
  portalHum(e, a) {
    T(e, a, 110, 1.6, "sine", 0.03, { attack: 0.6, hold: 0.4 });
    T(e, a, 112.7, 1.6, "sine", 0.03, { attack: 0.6, hold: 0.4 });
    T(e, a, 330, 1.6, "triangle", 0.012, { lp: 900, attack: 0.7, hold: 0.3 });
  },
  // and whispers: a breath through a vowel that shifts
  portalWhisper(e, a) {
    N(e, a, 0.9, 0.08, { type: "bandpass", f: 700, to: 1300, q: 7, attack: 0.4, rev: 0.6 });
    N(e, a, 0.9, 0.05, { type: "bandpass", f: 2100, to: 1700, q: 8, attack: 0.4, rev: 0.6 });
  },
  // ---- Blackout City, far away ----
  thunder(e, a) {
    N(e, a, 1.9, 0.16, { f: 260, to: 70, color: "brown", attack: 0.25, rev: 0.6 });
    N(e, a, 0.2, 0.06, { f: 900, to: 300, color: "brown", attack: 0.02 });
  },
  carAlarm(e, a) {
    for (let i = 0; i < 4; i++)
      T(e, a, 900, 0.32, "square", 0.018, { to: 1500, lp: 1800, at: i * 0.38, attack: 0.02, rev: 0.6 });
  },
  carPass(e, a) {
    N(e, a, 1.6, 0.07, { f: 300, to: 900, color: "brown", attack: 0.8, dp: -0.3, rev: 0.4 });
    T(e, a, 92, 1.6, "sawtooth", 0.02, { to: 70, lp: 300, attack: 0.8, dp: 0.3 });
  },
  radio(e, a) {
    T(e, a, 1800, 0.06, "square", 0.02, { lp: 2500 });
    for (let i = 0; i < 4; i++)
      N(e, a, 0.09, 0.04, { type: "bandpass", f: rand(700, 1600), q: 6, at: 0.1 + i * 0.12, rev: 0.4 });
    T(e, a, 1200, 0.06, "square", 0.018, { lp: 2500, at: 0.62 });
  },
  sparks(e, a) {
    for (let i = 0; i < 6; i++)
      N(e, a, 0.012, 0.08, { type: "bandpass", f: rand(3000, 6500), q: 6, at: rand(0, 0.35) });
    T(e, a, 120, 0.3, "sawtooth", 0.015, { lp: 600, attack: 0.01 });
  },
  // ---- Ember Works ----
  anvil(e, a) {
    for (const [f, v, d] of [
      [340, 0.04, 0.9],
      [912, 0.02, 0.6],
      [1530, 0.012, 0.4],
    ])
      T(e, a, f, d, "sine", v, { rev: 0.7 });
    N(e, a, 0.02, 0.05, { type: "bandpass", f: 2400, q: 2 });
  },
  chains(e, a) {
    for (let i = 0; i < 7; i++)
      T(e, a, rand(1800, 3200), 0.08, "triangle", 0.018, { at: i * rand(0.05, 0.09), rev: 0.4 });
  },
  steam(e, a) {
    N(e, a, 1.1, 0.06, { type: "bandpass", f: 1500, to: 1100, q: 1.2, attack: 0.05, rev: 0.4 });
  },
  clunk(e, a) {
    for (let i = 0; i < 2; i++) {
      T(e, a, 75, 0.22, "sine", 0.08, { to: 45, at: i * 0.42 });
      N(e, a, 0.05, 0.04, { f: 700, color: "brown", at: i * 0.42 });
    }
  },
  // ---- Cryo Vault ----
  bigCrack(e, a) {
    PLACE.iceCrack(e, a);
    N(e, a, 1.2, 0.08, { f: 180, to: 60, color: "brown", attack: 0.02, rev: 0.7, at: 0.03 });
  },
  icicles(e, a) {
    for (let i = 0; i < 5; i++)
      T(e, a, rand(2600, 4800), 0.5, "sine", 0.02, { at: i * rand(0.06, 0.14), dp: rand(-0.2, 0.2), rev: 0.6 });
  },
  gust(e, a) {
    N(e, a, 1.8, 0.06, { type: "bandpass", f: 450, to: 1100, q: 2.5, attack: 0.8, rev: 0.3 });
  },
  groan(e, a) {
    T(e, a, 62, 1.5, "sawtooth", 0.04, { to: 44, lp: 260, q: 5, attack: 0.5, rev: 0.5 });
  },
  // ---- Toxin Marsh ----
  frogs(e, a) {
    const n = 2 + Math.floor(Math.random() * 3),
      f = rand(95, 130);
    for (let i = 0; i < n; i++)
      T(e, a, f, 0.12, "square", 0.025, { to: f * 1.3, lp: 650, q: 6, at: i * 0.22, rev: 0.3 });
  },
  bird(e, a) {
    const f = rand(2200, 3200);
    for (let i = 0; i < 3; i++)
      T(e, a, f, 0.1, "sine", 0.025, { to: f * (i === 2 ? 0.75 : 1.3), at: i * 0.13, rev: 0.4 });
  },
  owl(e, a) {
    T(e, a, 400, 0.35, "sine", 0.03, { to: 360, attack: 0.05, rev: 0.6 });
    T(e, a, 380, 0.5, "sine", 0.03, { to: 330, attack: 0.05, at: 0.45, rev: 0.6 });
  },
  mud(e, a) {
    for (let i = 0; i < 4; i++) T(e, a, rand(70, 140), 0.12, "sine", 0.05, { to: 220, at: i * rand(0.1, 0.2) });
  },
  // ---- Void Core ----
  swell(e, a) {
    T(e, a, 38, 1.8, "sine", 0.09, { to: 55, attack: 1.2 });
    T(e, a, 76, 1.8, "triangle", 0.02, { to: 110, attack: 1.2, lp: 500 });
  },
  shimmer(e, a) {
    for (let i = 0; i < 4; i++)
      T(e, a, rand(1400, 3000), 1.2, "sine", 0.012, { at: i * 0.1, dp: rand(-0.3, 0.3), rev: 0.8, attack: 0.05 });
  },
  breath(e, a) {
    N(e, a, 1.4, 0.08, { type: "bandpass", f: 500, to: 900, q: 5, attack: 0.7, rev: 0.7 });
  },
  glitch(e, a) {
    for (let i = 0; i < 5; i++) T(e, a, rand(200, 2200), 0.03, "square", 0.02, { at: i * 0.045, lp: 3000 });
  },
};
// the far sounds of each biome
const BIOME_PLACE = {
  yard: ["thunder", "carAlarm", "carPass", "radio", "sparks"],
  works: ["anvil", "chains", "steam", "clunk"],
  vault: ["bigCrack", "icicles", "gust", "groan"],
  marsh: ["frogs", "bird", "owl", "mud"],
  void: ["swell", "shimmer", "breath", "glitch"],
};
const PLACE_IDS = Object.keys(PLACE);

/* One step of the sounds of the place (main.js calls it every frame of a running fight). st keeps the timers of each
   hazard; they start anew in a new arena. At most three sounds start in one frame. */
function placeTick(e, world, dt) {
  const arena = world.arena,
    player = world.player;
  let st = e.placeSt;
  if (!st || st.arena !== arena) st = e.placeSt = { arena, timers: new Map(), vents: new Map(), far: rand(3, 7) };
  const fight = world.state === "fight",
    budget = { n: 3 },
    play = (id, a) => {
      if (budget.n <= 0 || a.g <= 0.02) return;
      budget.n--;
      e.placePlay(id, a);
    },
    at = (x, y, g = 1) => {
      const d = Math.hypot(x - player.x, y - player.y);
      return { g: near(d) * g, pan: Math.max(-0.85, Math.min(0.85, (x - player.x) / 14)), d };
    },
    // true when the timer `key` runs out (and it starts again with lo..hi seconds)
    due = (key, lo, hi) => {
      let t = st.timers.get(key);
      if (t == null) t = rand(0, hi);
      t -= dt;
      const out = t <= 0;
      st.timers.set(key, out ? rand(lo, hi) : t);
      return out;
    };
  // vents: lava bubbles or the hum of a live manhole; the warning of each vent once when it starts
  const city = arena.biome.id === "yard";
  for (const vent of arena.vents) {
    const state = fight ? arena.ventState(vent, world.waveT) : "idle",
      last = st.vents.get(vent);
    st.vents.set(vent, state);
    const a = at(vent.x, vent.y);
    if (state === "warn" && last !== "warn") play(city ? "charge" : "lavaWarn", a);
    else if (state === "idle" && (city ? a.d < 6 : true) && due(vent, city ? 0.85 : 0.7, city ? 1.0 : 2.2))
      play(city ? "hum" : "lavaBlub", a);
  }
  // ice: cracks and creaks under the moving drone, a sheet tinkles now and then
  if (arena.ice.length) {
    const speed = Math.hypot(player.vx, player.vy);
    if (player.onIce && player.alive && speed > 2.5 && due("skate", 0.35, 1.1))
      play(Math.random() < 0.55 ? "iceCrack" : "iceCreak", { g: 0.7, pan: 0 });
    for (const patch of arena.ice) if (due(patch, 3, 8)) play("iceTink", at(patch.x, patch.y));
  }
  // acid: bubbles in the pools near the drone, a sizzle while it stands in one
  if (arena.acid.length) {
    for (const pool of arena.acid) if (!pool.mine && due(pool, 0.5, 1.6)) play("acidBubble", at(pool.x, pool.y, 0.8));
    if (player.inAcid && fight && due("sizzle", 0.45, 0.6)) play("acidSizzle", { g: 0.8, pan: 0 });
  }
  // portals: both ends hum, sometimes one whispers
  arena.portals.forEach((portal, i) => {
    if (due("pa" + i, 1.05, 1.3)) play("portalHum", at(portal.ax, portal.ay, 0.8));
    if (due("pb" + i, 1.05, 1.3)) play("portalHum", at(portal.bx, portal.by, 0.8));
  });
  if (arena.portals.length && due("whisper", 6, 14)) {
    const portal = arena.portals[Math.floor(Math.random() * arena.portals.length)];
    play("portalWhisper", at(portal.ax, portal.ay));
  }
  // far away: a sound of the biome every 5 to 11 s (less often in a boss fight), on one side
  st.far -= dt;
  if (st.far <= 0) {
    st.far = (world.boss ? 10 : 5) + rand(0, 6);
    const list = BIOME_PLACE[arena.biome.id];
    if (list) {
      const side = Math.random() < 0.5 ? -1 : 1;
      play(list[Math.floor(Math.random() * list.length)], { g: rand(0.55, 1), pan: side * rand(0.35, 0.9) });
    }
  }
}

export { PLACE, PLACE_IDS, BIOME_PLACE, placeTick, near as placeNear };
