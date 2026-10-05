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
// 3.13.0: soundscapes. Every biome also has a soft steady layer (rain drops and gutters, the roar of the furnaces, wind,
// crickets, the heartbeat of the core) and more far sounds in variants, each with its own rate (thunder every 25 to 50 s,
// a siren every 60 to 120 s …): two big ones never at once, none twice in a row, fewer in a boss fight. Thunder and
// sirens come with their light (renderer.scapeLight through engine.onScape).
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
  // ---- 3.13.0: the steady layers (soft grains, many of them) ----
  // Blackout City: light rain as single drops (no hiss), sometimes a gutter, sometimes rain on metal
  rainDrop(e, a) {
    for (let i = 0; i < 3; i++) {
      const f = rand(1800, 4200);
      T(e, a, f, 0.05, "sine", 0.012, { to: f * 0.6, at: rand(0, 0.25), dp: rand(-0.6, 0.6), rev: 0.35 });
    }
  },
  gutter(e, a) {
    const f = rand(520, 820);
    T(e, a, f, 0.16, "sine", 0.03, { to: f * 1.5, attack: 0.005, rev: 0.45 });
    T(e, a, f * 0.5, 0.12, "sine", 0.02, { to: f * 0.8, at: 0.02 });
  },
  rainMetal(e, a) {
    for (let i = 0; i < 5; i++)
      T(e, a, rand(2600, 5200), 0.04, "triangle", 0.01, { at: rand(0, 0.4), dp: rand(-0.4, 0.4), rev: 0.3 });
  },
  // Ember Works: the furnaces roar low (brown noise, nothing above 400 Hz) and the machines tick
  furnace(e, a) {
    N(e, a, 1.8, 0.016, { f: 160, to: 260, color: "brown", attack: 0.6, hold: 0.6, rev: 0.4 });
    T(e, a, 48, 1.8, "sine", 0.007, { attack: 0.6, hold: 0.6 });
  },
  // Cryo Vault: wind that rises and falls through a narrow band (a whistle more than a hiss)
  wind(e, a) {
    const f = rand(380, 620);
    N(e, a, 1.8, 0.035, {
      type: "bandpass",
      f,
      to: f * rand(0.8, 1.3),
      q: 6,
      attack: 0.8,
      rev: 0.4,
      dp: rand(-0.5, 0.5),
    });
  },
  // Toxin Marsh: crickets (short trains of high chirps)
  cricket(e, a) {
    const f = rand(4200, 5200),
      n = 3 + Math.floor(Math.random() * 3),
      dp = rand(-0.7, 0.7);
    for (let i = 0; i < n; i++) T(e, a, f, 0.03, "sine", 0.012, { at: i * 0.06, dp });
  },
  // Void Core: the heartbeat of the core, two low beats
  heartbeat(e, a) {
    T(e, a, 52, 0.18, "sine", 0.03, { to: 40 });
    T(e, a, 48, 0.22, "sine", 0.022, { to: 36, at: 0.28 });
  },
  // ---- 3.13.0: more far sounds ----
  // Blackout City: a siren passes (two tones, falling a little as it goes), a helicopter, a horn, a dog
  siren(e, a) {
    for (let i = 0; i < 4; i++) {
      const fall = 1 - i * 0.02;
      T(e, a, 588 * fall, 0.22, "square", 0.012, {
        lp: 1600,
        at: i * 0.45,
        attack: 0.02,
        rev: 0.6,
        dp: -0.2 + i * 0.12,
      });
      T(e, a, 440 * fall, 0.22, "square", 0.012, {
        lp: 1600,
        at: i * 0.45 + 0.22,
        attack: 0.02,
        rev: 0.6,
        dp: -0.15 + i * 0.12,
      });
    }
  },
  helicopter(e, a) {
    for (let i = 0; i < 22; i++)
      N(e, a, 0.05, 0.05 * Math.sin((Math.PI * (i + 1)) / 23), {
        f: 420,
        color: "brown",
        at: i * 0.08,
        rev: 0.3,
        dp: -0.4 + i * 0.035,
      });
    T(e, a, 95, 1.8, "sawtooth", 0.01, { lp: 400, attack: 0.6, hold: 0.6, dp: 0.2 });
  },
  horn(e, a) {
    const twice = Math.random() < 0.5;
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      T(e, a, 415, 0.34, "square", 0.012, { lp: 1400, at: i * 0.45, attack: 0.01, rev: 0.6 });
      T(e, a, 523, 0.34, "square", 0.01, { lp: 1400, at: i * 0.45, attack: 0.01, rev: 0.6 });
    }
  },
  dog(e, a) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const at = i * rand(0.28, 0.4);
      T(e, a, rand(380, 480), 0.11, "sawtooth", 0.018, { to: 260, lp: 1300, at, attack: 0.005, rev: 0.6 });
      N(e, a, 0.08, 0.03, { type: "bandpass", f: 900, q: 2, at, rev: 0.6 });
    }
  },
  // Ember Works: a series of anvil strikes, a drop hammer, a conveyor, a steam whistle, a chain hoist, a molten pour
  anvilSeries(e, a) {
    const n = 3 + Math.floor(Math.random() * 2),
      f = rand(300, 380);
    for (let i = 0; i < n; i++) {
      T(e, a, f, 0.7, "sine", 0.035, { at: i * 0.42, rev: 0.7 });
      T(e, a, f * 2.68, 0.45, "sine", 0.016, { at: i * 0.42, rev: 0.7 });
      N(e, a, 0.02, 0.04, { type: "bandpass", f: 2400, q: 2, at: i * 0.42 });
    }
  },
  dropHammer(e, a) {
    T(e, a, 58, 0.6, "sine", 0.1, { to: 34 });
    N(e, a, 0.3, 0.07, { f: 500, to: 120, color: "brown", attack: 0.002 });
    T(e, a, 640, 0.5, "sine", 0.018, { at: 0.01, rev: 0.7 });
  },
  conveyor(e, a) {
    for (let i = 0; i < 14; i++) N(e, a, 0.03, 0.03, { type: "bandpass", f: rand(900, 1400), q: 4, at: i * 0.11 });
    T(e, a, 72, 1.6, "sawtooth", 0.01, { lp: 260, attack: 0.3, hold: 0.9 });
  },
  whistle(e, a) {
    T(e, a, 880, 1.2, "sine", 0.02, { to: 860, attack: 0.08, rev: 0.6 });
    T(e, a, 1320, 1.2, "sine", 0.012, { to: 1290, attack: 0.08, rev: 0.6 });
    N(e, a, 1.2, 0.03, { type: "bandpass", f: 1100, q: 4, attack: 0.08, rev: 0.6 });
  },
  hoist(e, a) {
    for (let i = 0; i < 10; i++) T(e, a, rand(1500, 2600), 0.06, "triangle", 0.014, { at: i * 0.09, rev: 0.4 });
    T(e, a, 140, 1.0, "sawtooth", 0.012, { to: 180, lp: 500, attack: 0.1 });
  },
  pour(e, a) {
    N(e, a, 1.6, 0.06, { f: 260, to: 420, color: "brown", attack: 0.3, rev: 0.5 });
    for (let i = 0; i < 4; i++) T(e, a, rand(80, 140), 0.2, "sine", 0.04, { to: 240, at: 0.3 + i * rand(0.2, 0.3) });
  },
  // Cryo Vault: a howling gust, a far avalanche, ringing crystals
  howl(e, a) {
    N(e, a, 1.8, 0.05, { type: "bandpass", f: 520, to: 980, q: 9, attack: 0.7, rev: 0.5 });
    T(e, a, 520, 1.8, "sine", 0.008, { to: 900, attack: 0.8, rev: 0.5 });
  },
  avalanche(e, a) {
    N(e, a, 1.9, 0.11, { f: 140, to: 60, color: "brown", attack: 0.5, rev: 0.7 });
    for (let i = 0; i < 6; i++) N(e, a, 0.06, 0.03, { f: 600, color: "brown", at: 0.3 + i * 0.2 });
  },
  crystals(e, a) {
    const base = rand(880, 1180);
    for (const [k, v] of [
      [1, 0.016],
      [2.76, 0.009],
      [5.4, 0.005],
    ])
      T(e, a, base * k, 1.4, "sine", v, { rev: 0.8, dp: rand(-0.2, 0.2) });
  },
  // Toxin Marsh: a chorus of frogs, cicadas, an insect flying past, a splash, a heron
  frogChorus(e, a) {
    for (let i = 0; i < 9; i++) {
      const f = rand(90, 150);
      T(e, a, f, 0.12, "square", 0.016, {
        to: f * 1.3,
        lp: 650,
        q: 6,
        at: rand(0, 1.5),
        dp: rand(-0.5, 0.5),
        rev: 0.3,
      });
    }
  },
  cicada(e, a) {
    for (let i = 0; i < 24; i++) T(e, a, 6200, 0.04, "sawtooth", 0.006, { lp: 7000, at: i * 0.06, rev: 0.3 });
  },
  insect(e, a) {
    const side = Math.random() < 0.5 ? -1 : 1;
    T(e, a, 230, 1.0, "sawtooth", 0.012, { to: 205, lp: 900, attack: 0.4, dp: -0.8 * side, rev: 0.2 });
    T(e, a, 232, 1.0, "sawtooth", 0.012, { to: 207, lp: 900, attack: 0.4, at: 0.25, dp: 0.8 * side, rev: 0.2 });
  },
  splash(e, a) {
    N(e, a, 0.25, 0.07, { f: 1200, to: 400, color: "pink", attack: 0.005, rev: 0.4 });
    for (let i = 0; i < 3; i++) T(e, a, rand(300, 600), 0.06, "sine", 0.025, { to: 900, at: 0.1 + i * 0.08 });
  },
  heron(e, a) {
    T(e, a, 320, 0.35, "sawtooth", 0.02, { to: 230, lp: 1200, q: 4, attack: 0.01, rev: 0.6 });
  },
  // Void Core: a reversed swell, a metallic resonance, chirps
  reversed(e, a) {
    N(e, a, 1.2, 0.07, { type: "bandpass", f: 400, to: 1800, q: 3, attack: 1.15, rev: 0.2 });
    T(e, a, 220, 1.2, "triangle", 0.025, { to: 330, attack: 1.15, lp: 1200 });
  },
  metal(e, a) {
    for (const [f, v] of [
      [311, 0.02],
      [742, 0.012],
      [1189, 0.008],
      [1871, 0.005],
    ])
      T(e, a, f, 1.6, "sine", v, { rev: 0.8 });
  },
  chirp(e, a) {
    for (let i = 0; i < 3; i++) {
      const f = rand(900, 1500);
      T(e, a, f, 0.07, "sine", 0.018, { to: f * 2.4, at: i * 0.11, dp: rand(-0.3, 0.3), rev: 0.5 });
    }
  },
};
/* 3.13.0: the soundscape of each biome.
   bed: the steady layer, one grain every lo..hi s, at level g
   far: the far sounds, each on its own timer of lo..hi s; big ones never sound at the same time (one waits a few
        seconds); light: the renderer shows it ("lightning", "siren") */
const SCAPE = {
  yard: {
    bed: [
      ["rainDrop", 0.12, 0.3, 0.8],
      ["gutter", 1.6, 4, 0.7],
      ["rainMetal", 2.5, 6, 0.6],
    ],
    far: [
      { id: "thunder", every: [25, 50], big: true, light: "lightning" },
      { id: "siren", every: [60, 120], big: true, light: "siren" },
      { id: "helicopter", every: [70, 140], big: true },
      { id: "horn", every: [30, 70] },
      { id: "dog", every: [30, 60] },
      { id: "carAlarm", every: [50, 100] },
      { id: "carPass", every: [20, 45] },
      { id: "radio", every: [35, 80] },
      { id: "sparks", every: [25, 55] },
    ],
  },
  works: {
    bed: [["furnace", 1.4, 1.8, 0.8]],
    far: [
      { id: "anvilSeries", every: [20, 40] },
      { id: "dropHammer", every: [15, 35], big: true },
      { id: "conveyor", every: [25, 50] },
      { id: "whistle", every: [50, 100], big: true },
      { id: "hoist", every: [30, 60] },
      { id: "pour", every: [40, 80], big: true },
      { id: "steam", every: [20, 45] },
      { id: "chains", every: [25, 50] },
      { id: "anvil", every: [18, 40] },
    ],
  },
  vault: {
    bed: [["wind", 1.5, 2.6, 0.7]],
    far: [
      { id: "howl", every: [25, 50] },
      { id: "groan", every: [30, 60] },
      { id: "icicles", every: [20, 45] },
      { id: "avalanche", every: [80, 160], big: true },
      { id: "crystals", every: [25, 50] },
      { id: "bigCrack", every: [35, 70], big: true },
      { id: "gust", every: [20, 40] },
    ],
  },
  marsh: {
    bed: [["cricket", 0.4, 1.1, 0.8]],
    far: [
      { id: "frogChorus", every: [20, 40] },
      { id: "cicada", every: [25, 50] },
      { id: "insect", every: [20, 45] },
      { id: "splash", every: [25, 50] },
      { id: "owl", every: [40, 80] },
      { id: "heron", every: [45, 90], big: true },
      { id: "frogs", every: [15, 35] },
      { id: "bird", every: [25, 50] },
      { id: "mud", every: [20, 40] },
    ],
  },
  void: {
    bed: [["heartbeat", 1.1, 1.3, 0.7]],
    far: [
      { id: "reversed", every: [25, 50] },
      { id: "metal", every: [30, 60] },
      { id: "chirp", every: [20, 40] },
      { id: "swell", every: [30, 60], big: true },
      { id: "shimmer", every: [25, 50] },
      { id: "breath", every: [30, 55] },
      { id: "glitch", every: [20, 45] },
    ],
  },
};
// the far sounds of each biome (3.9.0; since 3.13.0 taken from SCAPE)
const BIOME_PLACE = Object.fromEntries(Object.entries(SCAPE).map(([biome, sc]) => [biome, sc.far.map((f) => f.id)]));
const PLACE_IDS = Object.keys(PLACE);

/* One step of the sounds of the place (main.js calls it every frame of a running fight). st keeps the timers of each
   hazard; they start anew in a new arena. At most three sounds start in one frame. */
function placeTick(e, world, dt) {
  const arena = world.arena,
    player = world.player;
  let st = e.placeSt;
  if (!st || st.arena !== arena) st = e.placeSt = { arena, timers: new Map(), vents: new Map(), far: null };
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
  // 3.13.0: the soundscape of the biome; a boss fight thins it out (its timers run at half speed, the bed is softer)
  const scape = SCAPE[arena.biome.id];
  if (!scape) return;
  const thin = world.boss ? 0.5 : 1,
    t = (st.t = (st.t || 0) + dt);
  for (const [id, lo, hi, g] of scape.bed)
    if (due("bed:" + id, lo / thin, hi / thin)) play(id, { g: g * (world.boss ? 0.6 : 1), pan: rand(-0.5, 0.5) });
  if (!st.far || st.far.biome !== arena.biome.id) {
    // the first far sounds come soon (2 s up to the shortest rate), then each keeps its own rate
    st.far = { biome: arena.biome.id, next: new Map(), last: null, lastAt: -99, bigUntil: -99 };
    for (const f of scape.far) st.far.next.set(f.id, t + rand(2, f.every[0]));
  }
  const far = st.far;
  for (const f of scape.far) {
    const next = far.next.get(f.id);
    if (t < next) continue;
    // never two far sounds within 2.5 s, never the same twice in a row, never two big ones at once: try again soon
    if (t - far.lastAt < 2.5 || far.last === f.id || (f.big && t < far.bigUntil)) {
      far.next.set(f.id, t + rand(2, 6));
      continue;
    }
    far.next.set(f.id, t + rand(f.every[0], f.every[1]) / thin);
    far.last = f.id;
    far.lastAt = t;
    if (f.big) far.bigUntil = t + 4;
    const pan = (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.9);
    play(f.id, { g: rand(0.55, 1), pan });
    if (f.light && e.onScape) e.onScape(f.light, pan);
    break;
  }
}

export { PLACE, PLACE_IDS, BIOME_PLACE, SCAPE, placeTick, near as placeNear };
