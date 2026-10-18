// Mix-balance probe: measures what the game actually sounds like at the saved default
// volumes (sfx 0.8 / music 0.45 / ambience 0.8), bus by bus, so the music / effects /
// ambience balance is decided from numbers rather than taste.
//
// Usage: node scripts/rl-mix-probe.mjs [out.json]
// Serves the build itself (tools/serve.js) and renders offline in headless Chromium.
// Sections: fight + boss music tracks, the five biome ambiences, a realistic combat
// sfx stream, and the full yard mix (music + place + combat together).
// Metrics per render: overall RMS, peak, and the p95 of 400 ms short-term windows
// (the honest loudness for bursty material like shots).

import { chromium } from "playwright";
import { serve } from "../tools/serve.js";
import { writeFileSync } from "node:fs";

const PORT = 8131;
const { server } = await serve(process.argv[3] || "dist", PORT, { quiet: true });
const BASE = `http://localhost:${PORT}/index.html`;

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
await page.goto(BASE, { timeout: 90000 });
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });

const SECS = 20;
const result = await page.evaluate(async (secs) => {
  const T = window.__riftTest,
    E = T.game.sound.constructor,
    SR = 44100,
    out = { fail: [] },
    VOL = { sfx: 0.8, mus: 0.45, amb: 0.8 };

  const stats = (x, skip = 0.25) => {
    // overall RMS + peak over the part after the 0.25 s settle, and the p95 of 400 ms windows
    const i0 = Math.floor(skip * SR),
      win = Math.floor(0.4 * SR),
      hop = Math.floor(0.1 * SR),
      wins = [];
    let sum = 0,
      peak = 0;
    for (let i = i0; i < x.length; i++) {
      const v = x[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    for (let w = i0; w + win < x.length; w += hop) {
      let s = 0;
      for (let i = w; i < w + win; i++) s += x[i] * x[i];
      wins.push(Math.sqrt(s / win));
    }
    wins.sort((a, b) => a - b);
    return {
      rms: Math.sqrt(sum / (x.length - i0)),
      peak,
      p95: wins[Math.floor(wins.length * 0.95)] || 0,
    };
  };

  const render = async (label, make) => {
    try {
      const ctx = new OfflineAudioContext(1, Math.ceil(SR * (secs + 0.35)), SR),
        engine = new E();
      engine.attach(ctx, { room: false });
      engine.setVolumes(VOL.sfx, VOL.mus, VOL.amb);
      await make(ctx, engine);
      engine.simT = null;
      out[label] = stats((await ctx.startRendering()).getChannelData(0));
    } catch (err) {
      out.fail.push(`${label}: ${err.message}`);
    }
  };

  // --- music: the renderOffline scheduling (seeded), at the real volumes ---
  for (const [label, spec] of [
    ["music-fight-yard-09", { music: "fight", biome: "yard", intensity: 0.9 }],
    ["music-fight-yard-05", { music: "fight", biome: "yard", intensity: 0.5 }],
    ["music-fight-void-09", { music: "fight", biome: "void", intensity: 0.9 }],
    ["music-fight-works-09", { music: "fight", biome: "works", intensity: 0.9 }],
    ["music-fight-vault-09", { music: "fight", biome: "vault", intensity: 0.9 }],
    ["music-fight-marsh-09", { music: "fight", biome: "marsh", intensity: 0.9 }],
    ["music-boss-yard", { music: "boss", biome: "yard", heat: 0.5 }],
    ["music-boss-void", { music: "boss", biome: "void", heat: 0.5 }],
  ]) {
    const r = await E.renderOffline({ ...spec, wav: true, room: false, seed: 5, vol: VOL }, secs);
    out[label] = { rms: r.rms, peak: r.peak };
    // the static render reports the whole file (incl. the settle); recompute p95 from wav
    if (r.samples) {
      const st = stats(r.samples);
      out[label].p95 = st.p95;
    }
  }

  // --- the realistic combat stream (grid-aligned, deterministic cadence) ---
  // pulse shot every 0.2 s, hit every 1 s, crit 4 s, boom 6 s, kill 7 s, rocket 10 s
  const combat = (engine, t) => {
    const s = Math.round(t * 10);
    if (s % 2 === 0) engine.play("pulse");
    if (s % 10 === 0) engine.play("hit");
    if (s % 40 === 0) engine.play("crit");
    if (s % 60 === 0) engine.play("boom");
    if (s % 70 === 0) engine.play("kill", 1.8);
    if (s % 100 === 0) engine.play("rocket");
  };

  // --- sfx stream alone ---
  await render("sfx-stream", async (ctx, engine) => {
    for (let t = 0.3; t < secs; t += 0.1)
      ctx.suspend(t).then(() => {
        combat(engine, t);
        ctx.resume();
      });
  });

  // --- the five biome ambiences (a real mid-game wave drives engine.place; the room tone of the
  // biome is on, like in the game; three takes averaged - the far sounds and hazards are random) ---
  for (const biome of ["yard", "works", "vault", "marsh", "void", "club"]) {
    const acc = { rms: 0, peak: 0, p95: 0 };
    let takes = 0;
    for (let take = 0; take < 3; take++) {
      await render("amb-tmp", async (ctx, engine) => {
        engine.biome = biome;
        engine.live = () => true;
        engine.startTone(biome);
        engine.stopTone(biome, secs);
        const world = new T.World({ seed: 0x3160 + take * 7919, weapon: "pulse", threat: 0, ws: {} });
        world.startWave(12 + 5 * Math.max(0, world.route.indexOf(biome)));
        world.state = "fight";
        for (let t = 0.1; t < secs; t += 0.1)
          ctx.suspend(t).then(() => {
            world.waveT += 0.1;
            engine.place(world, 0.1);
            ctx.resume();
          });
      });
      if (out["amb-tmp"]) {
        for (const k in acc) acc[k] += out["amb-tmp"][k];
        takes++;
        delete out["amb-tmp"];
      }
    }
    if (takes) {
      out["amb-" + biome] = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v / takes]));
    }
  }

  // --- the full yard mix: fight music + its bed + the place + the combat stream ---
  await render("mix-fight-yard", async (ctx, engine) => {
    const info = E.trackInfo("fight", "yard"),
      len = 60 / info.bpm / 4;
    engine.mode = "fight";
    engine.biome = "yard";
    engine.playKind = "fight";
    engine.playBiome = "yard";
    engine.intensity = 0.9;
    engine.heat = 0;
    // yard fight track gain = 1 (MUSIC_TRACKS.yard.fight.gain)
    engine.fade.gain.value = 1;
    engine.mixFor("fight");
    engine.live = () => true;
    engine.startTone("yard");
    engine.stopTone("yard", secs);
    const world = new T.World({ seed: 0x3160, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(12);
    world.state = "fight";
    let n = 0;
    for (let t = 0.1; t < secs; t += 0.1)
      ctx.suspend(t).then(() => {
        world.waveT += 0.1;
        engine.place(world, 0.1);
        combat(engine, t);
        engine.simT = 0.25 + t;
        while (n * len <= t) {
          engine.cycle = Math.floor(n / info.steps);
          engine.note(n % info.steps, 0.25 + n * len);
          n++;
        }
        ctx.resume();
      });
  });

  return out;
}, SECS);

await browser.close();
server.close();

// --- the verdict table (node side) ---
const db = (a, b) => (a > 0 && b > 0 ? (20 * Math.log10(a / b)).toFixed(1) : "n/a");
const g = (k) => result[k] || {};
const rows = [];
for (const k of Object.keys(result)) {
  if (k === "fail") continue;
  const r = result[k];
  rows.push(
    `${k.padEnd(22)} rms ${(+r.rms).toFixed(4)}  p95 ${r.p95 ? (+r.p95).toFixed(4) : "-"}  peak ${(+r.peak).toFixed(3)}`,
  );
}
console.log(rows.join("\n"));
const m = g("music-fight-yard-09"),
  mBoss = g("music-boss-yard"),
  s = g("sfx-stream"),
  a = g("amb-yard"),
  mix = g("mix-fight-yard");
console.log("\n--- relations (dB, positive = the first is louder) ---");
if (m.p95 && s.p95)
  console.log(`music p95 vs combat-sfx p95 : ${db(m.p95, s.p95)} dB   (want clearly negative: shots must cut through)`);
if (m.rms && a.rms)
  console.log(
    `music rms vs ambience rms   : ${db(m.rms, a.rms)} dB   (want near 0 to slightly positive: ambience stays audible under the music)`,
  );
if (mBoss.p95 && s.p95) console.log(`boss-music p95 vs sfx p95   : ${db(mBoss.p95, s.p95)} dB`);
if (mix.p95)
  console.log(`full-mix p95                : ${(+mix.p95).toFixed(4)}  (headroom check, limiter holds 0.93)`);
if (result.fail.length) console.log("\nFAILS:\n" + result.fail.join("\n"));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 1));
console.log(result.fail.length ? "\nPROBE: FAIL" : "\nPROBE: ok");
process.exit(result.fail.length ? 1 : 0);
