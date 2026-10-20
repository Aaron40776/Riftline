// Music probe: the deep-test music rules, rendered locally against dist/ so a music change can be
// measured without the multi-minute catalog (the CI deep-test stays the authority).
// Runs per-biome chunks (each musicBudget call builds an engine with thousands of AudioNodes that
// only the garbage collector can free - five biomes in one evaluate peaked past the box's memory).
// Checks (tests/deep-test.mjs "music" + "bloom" sections, same specs and seeds):
//   budget  - musicBudget over 4 loops at all heats/intensities: no skipped/shed notes, peak <= 36,
//             the 4 calm and the 4 boss sections differ note by note, heat and intensity add notes
//   tracks  - 6-bar offline renders (seed 7): peak < 0.95, flatness < 0.15, rms > 0.004, then
//   pairs   - calm themes pairwise: tempo >= 5 % apart AND one of rhythm/colour/busyness differs;
//             boss tracks pairwise: one of rhythm/colour/busyness differs
//   versus  - every boss track >= 1.5x the rms of its calm theme and >= 0.9x its note density
//   bloom   - 8-70 bloom notes in 8 bars, share 0.08-0.9, the bloom widens the stereo
// Known box offset: the room convolver renders a little differently here than on CI (the deep-test
// comment: its tail is "not quite the same every time"), so marsh:fight and void:boss can sit at
// 0.154-0.157 flatness on this box while the same build passes CI. The probe's job is the DELTA
// against a run of main (git stash, rebuild, run, unstash) - a delta over +0.004 is a real change.
// Usage: node scripts/rl-music-probe.mjs [out.json]   (STAGE=budget|tracks|bloom runs one stage)

import { chromium } from "playwright";
import { serve } from "../tools/serve.js";
import { writeFileSync } from "node:fs";

const PORT = 8132;
const { server } = await serve("dist", PORT, { quiet: true });
// A fresh browser per chunk: the offline-audio engines are megabytes of native audio-graph memory in
// the browser process, the collector frees them late, and five biomes of budget went past the box's
// memory (the OOM killer took chrome while the JS heap still showed 15 MB). One boot is about 10 s.
const withPage = async (fn) => {
  const browser = await chromium.launch({
    executablePath: "/home/z/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--js-flags=--expose-gc",
    ],
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  await page.goto(`http://localhost:${PORT}/index.html`, { timeout: 90000 });
  await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });
  // the probe only needs the audio engine: stop the game's render loop (it schedules a new frame at
  // the top of every tick, so a one-shot cancel cannot stop it - patch rAF to a no-op and spray-cancel
  // the pending frame)
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    for (let i = 0; i < 1e5; i++) window.cancelAnimationFrame(i);
  });
  const r = await page.evaluate(fn.fn, fn.arg);
  await page.evaluate(() => window.gc && window.gc());
  await browser.close();
  return r;
};
const chunk = async (name, fn, arg) => {
  const r = await withPage({ fn, arg });
  process.stdout.write(`  ${name}: ${r.fail.length ? "FAIL" : "ok"}\n`);
  return r;
};

const BIOMES = ["yard", "vault", "marsh", "void", "club", "flats"];
const fail = [];
const budgetRows = [],
  trackRows = {},
  bloomRows = {};

// ---- (1) the voice budget + the sections, one biome at a time ----
const budgetFn = (biome) =>
  function (biome) {
    const E = window.__riftTest.game.sound.constructor,
      fail = [],
      rows = [];
    const signature = (log, info, bar0, bars) => {
      const barSec = 240 / info.bpm,
        parts = [];
      for (const v of log) {
        const bar = Math.floor(v.t / barSec + 1e-6);
        if (bar >= bar0 && bar < bar0 + bars) parts.push(`${bar - bar0}:${v.kind}${Math.round(v.pitch)}${v.bus}`);
      }
      return parts.join(",");
    };
    for (const [kind, heat, intensity] of [
      ["fight", 0, 1],
      ["fight", 0, 0.5],
      ["fight", 0, 0.1],
      ["boss", 0, 1],
      ["boss", 1, 1],
      ["boss", 2, 1],
    ]) {
      const name = `${biome}:${kind}:heat${heat}:L${intensity}`,
        a = E.musicBudget({ music: kind, biome, loops: 4, heat, intensity });
      rows.push({ name, peak: a.peak, perSec: +(a.scheduled / a.seconds).toFixed(1) });
      if (a.failed) fail.push(`${name}: engine error`);
      if (a.skipped || a.shed) fail.push(`${name}: the budget refused notes (${a.skipped}/${a.shed})`);
      if (a.peak > 36) fail.push(`${name}: ${a.peak} voices alive at once (36 cap)`);
    }
    const info = E.trackInfo("fight", biome),
      calm = E.musicBudget({ music: "fight", biome, loops: 1, intensity: 0.9 }),
      sigs = [0, 4, 8, 12].map((bar) => signature(calm.log, info, bar, 4));
    if (new Set(sigs).size !== 4) fail.push(`${biome}: calm sections repeat each other`);
    const boss = E.musicBudget({ music: "boss", biome, loops: 1 }),
      binfo = E.trackInfo("boss", biome),
      bsigs = [0, 8, 16, 20].map((bar, i) => signature(boss.log, binfo, bar, i < 2 ? 4 : 2));
    if (new Set(bsigs).size !== 4) fail.push(`${biome}: boss sections repeat each other`);
    if (boss.steps !== 22 * 16 || calm.steps !== 16 * 16) fail.push(`${biome}: wrong track length`);
    const h0 = E.musicBudget({ music: "boss", biome, loops: 1, heat: 0 }).scheduled,
      h1 = E.musicBudget({ music: "boss", biome, loops: 1, heat: 1 }).scheduled,
      h2 = E.musicBudget({ music: "boss", biome, loops: 1, heat: 2 }).scheduled;
    if (!(h0 < h1 && h1 < h2)) fail.push(`${biome}: boss heat does not add notes (${h0}, ${h1}, ${h2})`);
    const l0 = E.musicBudget({ music: "fight", biome, loops: 1, intensity: 0 }).scheduled,
      l1 = E.musicBudget({ music: "fight", biome, loops: 1, intensity: 1 }).scheduled;
    if (!(l0 > 100 && l1 > l0)) fail.push(`${biome}: calm intensity (${l0} -> ${l1} notes)`);
    return { rows, fail };
  };
console.log("[probe] budget");
if (process.env.STAGE !== "tracks" && process.env.STAGE !== "bloom")
  for (const biome of BIOMES) {
    const r = await chunk(biome, budgetFn(biome), biome);
    budgetRows.push(...r.rows);
    fail.push(...r.fail);
  }

// ---- (2) the offline renders, one biome at a time (the deep-test describe()) ----
const trackFn = (biome) =>
  async function (biome) {
    const E = window.__riftTest.game.sound.constructor,
      SR = 44100,
      N = 4096,
      fail = [],
      out = {};
    const fft = (re, im) => {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) [re[i], re[j]] = [re[j], re[i]];
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
            im[b] = im[a] + xi;
            re[a] += xr;
            im[a] -= xi;
          }
      }
    };
    const describe = (x, bpm, voices) => {
      const len = 60 / bpm / 4,
        w = 220,
        n = Math.floor(x.length / w),
        db = new Float64Array(n);
      let sum = 0,
        peak = 0;
      for (let i = 0; i < x.length; i++) {
        sum += x[i] * x[i];
        peak = Math.max(peak, Math.abs(x[i]));
      }
      for (let i = 0; i < n; i++) {
        let e = 0;
        for (let k = 0; k < w; k++) e += x[i * w + k] ** 2;
        db[i] = 10 * Math.log10(e / w + 1e-12);
      }
      const onsets = [];
      let last = -99;
      for (let i = 1; i < n; i++)
        if (db[i] - db[i - 1] > 6 && db[i] > -62 && i - last > 6) {
          onsets.push((i * w) / SR);
          last = i;
        }
      const grid = new Array(16).fill(0);
      for (const t of onsets) grid[((Math.round(t / len) % 16) + 16) % 16]++;
      const total = grid.reduce((p, q) => p + q, 0) || 1;
      let cs = 0,
        cn = 0,
        lowSum = 0,
        allSum = 0,
        flatSum = 0,
        flatN = 0;
      for (let at = 0; at + N <= x.length; at += N * 2) {
        const re = new Float64Array(N),
          im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = x[at + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
        fft(re, im);
        let p = 0,
          pw = 0,
          logSum = 0,
          bandSum = 0,
          bandN = 0;
        for (let k = 1; k < N / 2; k++) {
          const e = re[k] * re[k] + im[k] * im[k],
            f = (k * SR) / N;
          p += e;
          pw += e * f;
          if (f < 200) lowSum += e;
          allSum += e;
          if (f >= 2000 && f <= 12000) {
            logSum += Math.log(e + 1e-20);
            bandSum += e;
            bandN++;
          }
        }
        if (p > 1e-9) {
          cs += pw / p;
          cn++;
        }
        if (bandSum > 1e-12) {
          flatSum += Math.exp(logSum / bandN) / (bandSum / bandN);
          flatN++;
        }
      }
      return {
        rms: Math.sqrt(sum / x.length),
        peak,
        onsetsPerSec: onsets.length / (x.length / SR),
        centroid: cs / Math.max(1, cn),
        low: lowSum / (allSum || 1),
        flat: flatSum / Math.max(1, flatN),
        grid: grid.map((v) => v / total),
        voicesPerSec: voices / (x.length / SR),
        bpm,
      };
    };
    for (const kind of ["fight", "boss"]) {
      const info = E.trackInfo(kind, biome),
        seconds = (6 * 240) / info.bpm,
        r = await E.renderOffline(
          { music: kind, biome, fromBar: kind === "fight" ? 4 : 0, intensity: 0.9, wav: true, log: true, seed: 7 },
          seconds,
        ),
        d = describe(r.samples, info.bpm, r.musicLog.length),
        name = `${biome}:${kind}`;
      out[name] = d;
      if (!r.finite) fail.push(`${name}: non-finite samples`);
      if (r.peak >= 0.95) fail.push(`${name}: clipping (peak ${r.peak})`);
      if (!(d.rms > 0.004)) fail.push(`${name}: silent (rms ${d.rms})`);
      if (r.musicSkipped || r.musicShed) fail.push(`${name}: notes refused while rendering`);
      if (d.flat > 0.15) fail.push(`${name}: noisy (flatness ${d.flat.toFixed(3)})`);
    }
    return { out, fail };
  };
console.log("[probe] tracks");
if (process.env.STAGE !== "budget" && process.env.STAGE !== "bloom")
  for (const biome of BIOMES) {
    const r = await chunk(biome, trackFn(biome), biome);
    Object.assign(trackRows, r.out);
    fail.push(...r.fail);
  }

// ---- (3) the bloom, one biome at a time (8-bar stereo renders at intensity 0.2, seed 11) ----
const bloomFn = (biome) =>
  async function (biome) {
    const E = window.__riftTest.game.sound.constructor,
      fail = [];
    const rms = (x) => {
        let s = 0;
        for (let i = 0; i < x.length; i++) s += x[i] * x[i];
        return Math.sqrt(s / x.length);
      },
      width = (l, r) => {
        let side = 0,
          mid = 0;
        for (let i = 0; i < l.length; i++) {
          side += (l[i] - r[i]) ** 2;
          mid += (l[i] + r[i]) ** 2;
        }
        return Math.sqrt(side / (mid || 1));
      };
    const info = E.trackInfo("fight", biome),
      seconds = (8 * 240) / info.bpm,
      spec = { music: "fight", biome, intensity: 0.2, wav: true, log: true, seed: 11, stereo: true, noBed: true },
      withB = await E.renderOffline(spec, seconds),
      without = await E.renderOffline({ ...spec, bloom: false }, seconds),
      notes = withB.musicLog.filter((n) => n.bus === "b"),
      rw = rms(withB.samples),
      ro = rms(without.samples),
      share = Math.sqrt(Math.max(0, rw * rw - ro * ro)) / ro,
      wW = width(withB.samples, withB.samplesR),
      wO = width(without.samples, without.samplesR);
    if (notes.length < 8 || notes.length > 70) fail.push(`${biome}: bloom notes ${notes.length}`);
    if (share < 0.08 || share > 0.9) fail.push(`${biome}: bloom share ${share.toFixed(2)}`);
    if (!(wW > wO)) fail.push(`${biome}: bloom does not widen (${wO.toFixed(2)} -> ${wW.toFixed(2)})`);
    return { row: { notes: notes.length, share: +share.toFixed(2) }, fail };
  };
console.log("[probe] bloom");
if (process.env.STAGE !== "budget" && process.env.STAGE !== "tracks")
  for (const biome of BIOMES) {
    const r = await chunk(biome, bloomFn(biome), biome);
    bloomRows[biome] = r.row;
    fail.push(...r.fail);
  }

server.close();

// ---- (4) the pairwise and versus rules (node side, from the rendered numbers) ----
const gridDist = (a, b) => a.grid.reduce((p, v, i) => p + Math.abs(v - b.grid[i]), 0) / 2;
for (const kind of ["fight", "boss"])
  for (let i = 0; i < BIOMES.length; i++)
    for (let j = i + 1; j < BIOMES.length; j++) {
      const a = trackRows[`${BIOMES[i]}:${kind}`],
        b = trackRows[`${BIOMES[j]}:${kind}`],
        tempo = +Math.abs(Math.log2(a.bpm / b.bpm)).toFixed(3),
        rhythm = +gridDist(a, b).toFixed(3),
        centroid = +Math.abs(Math.log2(a.centroid / b.centroid)).toFixed(3),
        density = +Math.abs(Math.log2(a.onsetsPerSec / b.onsetsPerSec)).toFixed(3);
      if (kind === "fight" && tempo < 0.05) fail.push(`calm ${BIOMES[i]}/${BIOMES[j]}: tempos too close`);
      if (!(rhythm >= 0.1 || centroid >= 0.2 || density >= 0.25))
        fail.push(`${kind} ${BIOMES[i]}/${BIOMES[j]}: too similar (r${rhythm} c${centroid} d${density})`);
    }
const versus = [];
for (const biome of BIOMES) {
  const c = trackRows[`${biome}:fight`],
    b = trackRows[`${biome}:boss`],
    loudness = +(b.rms / c.rms).toFixed(2),
    voices = +(b.voicesPerSec / c.voicesPerSec).toFixed(2);
  versus.push({ biome, loudness, voices });
  if (loudness < 1.5) fail.push(`${biome}: boss only ${loudness}x the calm theme`);
  if (voices < 0.9) fail.push(`${biome}: boss thinner than the calm theme (${voices}x)`);
}

const r = (k) => trackRows[k];
console.log("\ntrack                rms     peak   flat   onset/s  bpm");
for (const b of BIOMES)
  for (const k of ["fight", "boss"]) {
    const d = r(`${b}:${k}`);
    console.log(
      `${(b + ":" + k).padEnd(20)} ${d.rms.toFixed(4)}  ${d.peak.toFixed(3)}  ${d.flat.toFixed(3)}  ${d.onsetsPerSec.toFixed(1).padStart(6)}   ${d.bpm}`,
    );
  }
console.log("\nversus (boss/calm): " + versus.map((v) => `${v.biome} ${v.loudness}x/${v.voices}x`).join("  "));
for (const [biome, b] of Object.entries(bloomRows)) console.log(`bloom ${biome}: notes ${b.notes} share ${b.share}`);
if (fail.length) console.log("\nFAILS:\n" + fail.join("\n"));
if (process.argv[2])
  writeFileSync(
    process.argv[2],
    JSON.stringify({ budgetRows, tracks: trackRows, versus, bloom: bloomRows, fail }, null, 1),
  );
console.log(fail.length ? "\nMUSIC PROBE: FAIL" : "\nMUSIC PROBE: ok");
process.exit(fail.length ? 1 : 0);
