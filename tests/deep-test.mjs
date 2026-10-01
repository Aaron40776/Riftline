import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.goto(process.argv[2] || "http://localhost:8124/index.html");
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 60000 });
const res = await page.evaluate(() => {
  const r = window.__riftTest.selftest();
  return {
    ok: r.ok,
    ms: r.ms,
    fail: r.fail,
    x21: r.expansion21?.fail,
    x22: r.expansion22?.fail,
    x23: r.expansion23,
    v240: r.v240?.fail,
    v246: r.v246?.fail,
    v250A: r.v250A?.fail,
    v250B: r.v250B?.fail,
    v250C: r.v250C?.fail,
    v250D: r.v250D?.fail,
    v260: r.v260?.fail,
    v270Sound: r.v270Sound?.fail,
    v280: r.v280?.fail,
    v291: r.v291?.fail,
    v300: r.v300?.fail,
  };
});
// 2.7.0: render every sound offline (mono, 44.1 kHz, at most 2 s): no exception, finite samples, not silent,
// below full scale, and every voice has ended when the render does (nothing stays alive)
const sound = await page.evaluate(async (FLAME_CV_MAX) => {
  const engine = window.__riftTest.game.sound.constructor,
    fail = [],
    catalog = engine.catalog();
  let maxPeak = 0,
    longest = 0;
  for (const { name, spec } of catalog) {
    try {
      const r = await engine.renderOffline(spec);
      maxPeak = Math.max(maxPeak, r.peak);
      longest = Math.max(longest, r.lastAudible);
      if (!r.finite) fail.push(name + ": non-finite samples");
      else if (!(r.peak > 0.001 && r.rms > 1e-5)) fail.push(`${name}: silent (peak ${r.peak})`);
      if (r.peak >= 0.95) fail.push(`${name}: clipping (peak ${r.peak})`);
      if (r.maxEnd > 2.05) fail.push(`${name}: a voice ends after ${r.maxEnd.toFixed(2)} s`);
      if (r.failed) fail.push(name + ": engine error");
    } catch (err) {
      fail.push(`${name}: ${err && err.message}`);
    }
  }
  // 2.9.1: a 1.9 s noise burst (longer than the 1 s noise buffer) must still be audible until its envelope
  // has faded: with the old one-shot buffer it was cut after 0.5-1 s
  for (const rate of [1, 0.5]) {
    const r = await engine.renderOffline({ noise: { dur: 1.9, vol: 0.2, opts: { type: "lowpass", f: 4000, rate } } });
    if (!(r.lastAudible > 1.2)) fail.push(`long noise (rate ${rate}) cut off at ${r.lastAudible.toFixed(2)} s`);
  }
  // 2.9.2: continuous fire must sound continuous. Ember Jet fires 15 times a second; rendered offline for
  // 2 s, the loudness in 40 ms windows between 0.5 s and 1.5 s must not pulse (a ticking sound has a high
  // spread of the window levels relative to their mean; a steady roar a low one)
  const flame = await engine.renderOffline({ burst: { id: "flame", n: 26, interval: 1 / 15 }, wav: true });
  const win = 1764,
    levels = [];
  for (let t = Math.round(0.5 * 44100); t + win <= Math.round(1.5 * 44100); t += win) {
    let sum = 0;
    for (let i = 0; i < win; i++) sum += flame.samples[t + i] ** 2;
    levels.push(Math.sqrt(sum / win));
  }
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length,
    flameCv = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length) / (mean || 1);
  if (!(mean > 0.003)) fail.push(`flame fire is silent (mean level ${mean})`);
  if (!(flameCv < FLAME_CV_MAX))
    fail.push(`flame fire pulses: loudness spread ${flameCv.toFixed(2)} (max ${FLAME_CV_MAX})`);
  return { count: catalog.length, maxPeak, longest, flameCv, fail };
}, 0.3);
res.soundRender = sound;
// 2.9.0: the sounds must differ from each other. Every weapon shot (strict), every death family and every boss
// intro (softer) is rendered and described by four numbers (spectral centroid, duration, zero-crossing rate,
// share of energy below 300 Hz); the distance between every two sounds of a group has to stay above a minimum.
// Also: the music schedules exactly the same notes with and without a flood of sounds (none dropped, none
// skipped), the flood stays below full scale and the voice list of the sounds really was full.
const distinct = await page.evaluate(async () => {
  const engine = window.__riftTest.game.sound.constructor,
    SR = 44100,
    N = 16384;
  const fft = (re, im) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len)
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k),
            wi = Math.sin(ang * k),
            a = i + k,
            b = i + k + len / 2,
            xr = re[b] * wr - im[b] * wi,
            xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
    }
  };
  const features = (x) => {
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    // duration: the last 5 ms window whose rms is above 3 % of the loudest window (the tail counts);
    // attack: the start of the loudest window
    const win = 220,
      rms = [];
    for (let i = 0; i + win <= x.length; i += win) {
      let e = 0;
      for (let k = 0; k < win; k++) e += x[i + k] * x[i + k];
      rms.push(Math.sqrt(e / win));
    }
    const top = Math.max(...rms);
    let last = 0;
    rms.forEach((v, i) => {
      if (v > 0.03 * top) last = i + 1;
    });
    const attack = (rms.indexOf(top) * win) / SR;
    const dur = (last * win) / SR,
      active = Math.min(x.length, Math.max(win, last * win));
    let zc = 0;
    for (let i = 1; i < active; i++) if (x[i - 1] < 0 !== x[i] < 0) zc++;
    const re = new Float64Array(N),
      im = new Float64Array(N);
    for (let i = 0; i < Math.min(N, x.length); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    let sum = 0,
      weighted = 0,
      low = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = (k * SR) / N,
        p = re[k] * re[k] + im[k] * im[k];
      sum += p;
      weighted += p * f;
      if (f < 300) low += p;
    }
    return { centroid: weighted / sum, dur, zcr: zc / active, low: low / sum, peak, attack };
  };
  const vec = (f) => [
    Math.log2(f.attack + 0.01) * 0.4,
    Math.log2(f.centroid) * 0.9,
    Math.log2(f.dur + 0.03) * 0.8,
    Math.log2(f.zcr + 0.01) * 0.5,
    f.low * 3,
  ];
  const group = async (list) => {
    const feats = [];
    for (const { name, spec } of list) {
      const r = await engine.renderOffline({ ...spec, wav: true });
      feats.push({ name, f: features(r.samples) });
    }
    let min = 1e9,
      pair = "";
    for (let i = 0; i < feats.length; i++)
      for (let j = i + 1; j < feats.length; j++) {
        const a = vec(feats[i].f),
          b = vec(feats[j].f),
          d = Math.hypot(...a.map((v, k) => v - b[k]));
        if (d < min) {
          min = d;
          pair = feats[i].name + " / " + feats[j].name;
        }
      }
    return { min, pair, feats: feats.map((e) => ({ name: e.name, ...e.f })) };
  };
  const catalog = engine.catalog(),
    byName = (names) => names.map((n) => catalog.find((e) => e.name === n));
  const out = { fail: [] };
  out.weapons = await group(byName(["pulse", "scatter", "tesla", "rail", "rocket", "disc", "flame"]));
  out.deaths = await group(
    byName(
      ["dPop", "dSquelch", "dCrunch", "dArmor", "dZap", "dGhost", "dClang", "dRattle", "dShatter"].map(
        (n) => n + ":1.6",
      ),
    ),
  );
  out.bosses = await group(byName(["warden", "forge", "prism", "queen", "core"].map((n) => "bossIntro:" + n)));
  out.weapons.min < 0.6 &&
    out.fail.push(`weapon shots too similar: ${out.weapons.pair} (${out.weapons.min.toFixed(2)})`);
  out.deaths.min < 0.5 &&
    out.fail.push(`death families too similar: ${out.deaths.pair} (${out.deaths.min.toFixed(2)})`);
  out.bosses.min < 0.35 && out.fail.push(`boss intros too similar: ${out.bosses.pair} (${out.bosses.min.toFixed(2)})`);
  out.music = [];
  for (const biome of ["yard", "works", "vault", "void", "marsh"])
    for (const music of ["fight", "boss"]) {
      const calm = await engine.renderOffline({ music, biome }, 4),
        busy = await engine.renderOffline({ music, biome, flood: true }, 4);
      out.music.push({ biome, music, notes: calm.musicScheduled, skipped: busy.musicSkipped, floodPeak: busy.peak });
      if (!calm.musicScheduled) out.fail.push(`${biome}:${music}: no music notes`);
      if (busy.musicScheduled !== calm.musicScheduled || busy.musicSkipped || calm.musicSkipped)
        out.fail.push(
          `${biome}:${music}: music notes dropped in a flood (${calm.musicScheduled} vs ${busy.musicScheduled}, skipped ${busy.musicSkipped})`,
        );
      if (!busy.dropped) out.fail.push(`${biome}:${music}: the flood never filled the voice list`);
      if (!busy.finite || busy.peak >= 0.95) out.fail.push(`${biome}:${music}: flood peak ${busy.peak}`);
    }
  return out;
});
res.soundDistinct = {
  weapons: { min: distinct.weapons.min, pair: distinct.weapons.pair },
  deaths: { min: distinct.deaths.min, pair: distinct.deaths.pair },
  bosses: { min: distinct.bosses.min, pair: distinct.bosses.pair },
  musicFlood: distinct.music.length,
  fail: distinct.fail,
};
if (process.env.SOUND_DETAIL) console.error(JSON.stringify(distinct, null, 1));
if (distinct.fail.length) res.ok = false;
if (sound.fail.length) res.ok = false;
console.log(JSON.stringify(res, null, 1));
console.log(res.ok ? "DEEP TEST: ok" : "DEEP TEST: FAIL");
await browser.close();
process.exitCode = res.ok ? 0 : 1;
