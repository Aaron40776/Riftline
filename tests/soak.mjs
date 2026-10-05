// 3.18.2: a long Endless run with a bot (the live game loop and renderer, a god-mode bot stepping the world), sampled at
// every wave: the JS heap after a garbage collection, what the renderer holds on the GPU (geometries, textures, programs),
// the objects in the scene and the lists of the world. A run that is healthy settles: after the first waves nothing keeps
// growing with the number of waves. Usage: node tools/qa.js soak [weapon] [target wave] (default pulse, 90).
import { chromium } from "playwright";
const URL = process.argv[2] || "http://localhost:8124/index.html";
const WEAPON = process.argv[3] || "pulse",
  TARGET = +(process.argv[4] || 90);
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-precise-memory-info",
    "--js-flags=--expose-gc",
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const cdp = await page.context().newCDPSession(page);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let crashed = false;
page.on("crash", () => {
  crashed = true;
  console.log("PAGE CRASHED at", new Date().toISOString());
});
// a step that does not answer in two minutes is a hang of the page (an endless loop in the game), not a slow machine
// when the page hangs, the debugger stops it and the stack is printed (build with RL_NO_MINIFY=1 for readable names)
let hangStack = "";
const stopAndTell = async () => {
  try {
    await cdp.send("Debugger.enable");
    const paused = new Promise((resolve) => cdp.once("Debugger.paused", resolve));
    await cdp.send("Debugger.pause");
    const ev = await Promise.race([paused, new Promise((r) => setTimeout(() => r(null), 8000))]);
    if (ev)
      hangStack = ev.callFrames
        .slice(0, 14)
        .map((f) => `${f.functionName || "(anonymous)"}:${f.location.lineNumber + 1}`)
        .join(" < ");
  } catch (err) {
    hangStack = `no stack (${err.message})`;
  }
};
const within = (promise, ms, what) =>
  Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(async () => {
        await stopAndTell();
        rej(new Error(`${what} did not answer in ${ms / 1000} s`));
      }, ms),
    ),
  ]);
await page.goto(URL);
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 60000 });
await page.evaluate((w) => {
  const T = window.__riftTest;
  T.store.data.weapons[w] = true;
  T.store.data.weapon = w;
  T.store.data.seen.tutorial = true;
}, WEAPON);
await page.click("#playBtn");
await page.waitForTimeout(500);

// the page's own counter (precise memory info is on); a forced collection through the debugger protocol crashed the
// browser now and then, and the trend over many waves is what matters
const heap = () => page.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
const sample = () =>
  page.evaluate(() => {
    const T = window.__riftTest,
      g = T.game,
      w = g.world,
      r = T.renderer,
      info = r.renderer.info;
    let nodes = 0;
    r.scene.traverse(() => nodes++);
    const lists = {};
    for (const k of [
      "enemies",
      "pb",
      "eb",
      "pickups",
      "beams",
      "hazards",
      "markers",
      "trails",
      "fx",
      "singularities",
      "traps",
    ])
      lists[k] = w[k] ? w[k].length : 0;
    const s = g.sound;
    return {
      wave: w.wave,
      state: w.state,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      nodes,
      lists,
      voices: s && s.voices ? s.voices.length : 0,
      musicVoices: s && s.musicVoiceList ? s.musicVoiceList.length : 0,
      toasts: document.querySelectorAll("#toasts .toast").length,
      domNodes: document.getElementsByTagName("*").length,
    };
  });

const rows = [];
let wave = 1,
  lastState = "",
  last = 0,
  guard = 0;
const t0 = Date.now();
let stuck = null;
while (wave < TARGET && guard++ < 4000 && !crashed && !stuck) {
  if (process.env.SOAK_TRACE) console.log("step", guard, "wave", wave, "state", lastState);
  const r = await within(
    page.evaluate(() => {
      const g = window.__riftTest.game,
        w = g.world;
      if (!w) return { wave: -1 };
      w.god = true;
      for (let i = 0; i < 900; i++) {
        if (w.state === "choose") {
          g.choose(w.offer[0]);
          break;
        }
        if (w.state === "victory") break;
        const p = w.player;
        let t = null,
          b = 1e9;
        for (const e of w.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < b) {
            b = d;
            t = e;
          }
        }
        const inp = { mx: 0, my: 0, fire: true, auto: true, assist: true, dash: i % 200 === 0, nova: p.nova >= 100 };
        if (t) {
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          inp.aim = true;
          inp.ax = Math.cos(a);
          inp.ay = Math.sin(a);
          const k = b < 5 ? -1 : b > 9 ? 1 : 0.3;
          inp.mx = Math.cos(a) * k + Math.cos(a + 1.57) * 0.5;
          inp.my = Math.sin(a) * k + Math.sin(a + 1.57) * 0.5;
        }
        w.step(1 / 60, inp);
        // a wave that drags on is cleared (the bot is not here to test its aim)
        if (w.state === "fight" && w.time - (w._t0 ?? (w._t0 = w.time)) > 150) {
          for (const e of [...w.enemies]) w.killEnemy(e);
          w.planIdx = w.plan.length;
          w.markers = [];
        }
      }
      if (w.state !== "fight") w._t0 = undefined;
      return { wave: w.wave, state: w.state };
    }),
    60000,
    "the bot step",
  ).catch((err) => ({ wave, state: lastState, err: err.message }));
  if (r.err) {
    stuck = `${r.err} (wave ${wave}, state ${lastState || "start"})`;
    break;
  }
  if (r.state === "victory") {
    await page.waitForTimeout(3000);
    const shown = await page.isVisible("#endlessBtn").catch(() => false);
    if (shown) {
      await page.click("#endlessBtn");
      await page.waitForTimeout(300);
    }
  }
  if (r.wave > last && r.wave % 3 === 0) {
    const s = await sample();
    s.heapMB = +(await heap()).toFixed(1);
    s.secs = Math.round((Date.now() - t0) / 1000);
    rows.push(s);
    console.log(
      `wave ${s.wave}: heap ${s.heapMB} MB, geometries ${s.geometries}, textures ${s.textures}, programs ${s.programs}, scene ${s.nodes}, dom ${s.domNodes}, music voices ${s.musicVoices}, enemies ${s.lists.enemies}, fx ${s.lists.fx} (${s.secs} s)`,
    );
  }
  if (r.wave > last) last = r.wave;
  wave = r.wave;
  lastState = r.state;
  await page.waitForTimeout(40);
}

// the verdict: the first third is the warm-up (every biome, enemy and boss is built the first time it is seen); from the
// middle third to the last nothing may keep growing
const fail = [];
const third = Math.max(1, Math.floor(rows.length / 3)),
  early = rows.slice(third, 2 * third),
  late = rows.slice(-third);
const avg = (list, f) => list.reduce((p, r) => p + f(r), 0) / list.length;
const grow = (name, f, limit) => {
  const a = avg(early, f),
    b = avg(late, f);
  if (b - a > limit) fail.push(`${name} grows: ${a.toFixed(1)} -> ${b.toFixed(1)} (limit +${limit})`);
};
// what the scene holds depends on the biome and the boss of the moment (it is built and thrown away with them), so for
// these the floor of each third is compared: a leak lifts the floor, a different biome only moves the peaks
const growFloor = (name, f, limit) => {
  const a = Math.min(...early.map(f)),
    b = Math.min(...late.map(f));
  if (b - a > limit) fail.push(`${name} floor rises: ${a} -> ${b} (limit +${limit})`);
};
if (rows.length >= 6) {
  grow("JS heap (MB)", (r) => r.heapMB, 40);
  growFloor("geometries", (r) => r.geometries, 40);
  grow("textures", (r) => r.textures, 5);
  growFloor("programs", (r) => r.programs, 4);
  growFloor("scene objects", (r) => r.nodes, 150);
  grow("DOM nodes", (r) => r.domNodes, 300);
  grow("music voices", (r) => r.musicVoices, 20);
  for (const k of ["pb", "eb", "pickups", "beams", "hazards", "markers", "singularities", "traps"])
    grow(`world.${k}`, (r) => r.lists[k], 120);
  // effects and trails come and go with the fight: what matters is that they stay below a ceiling
  for (const k of ["fx", "trails"]) {
    const top = Math.max(...late.map((r) => r.lists[k]));
    if (top > 4000) fail.push(`world.${k} reaches ${top} in the last third`);
  }
} else fail.push(`too few samples (${rows.length}): the run stopped at wave ${wave}`);
if (crashed) fail.push(`the page crashed at wave ${wave} (${lastState || "start"})`);
if (stuck) fail.push(`the game hangs: ${stuck}${hangStack ? ` | stack: ${hangStack}` : ""}`);
if (errors.length) fail.push(`page errors: ${errors.slice(0, 3).join(" | ")}`);
console.log(JSON.stringify({ weapon: WEAPON, reached: wave, samples: rows.length, fail }, null, 1));
await browser.close();
process.exitCode = fail.length ? 1 : 0;
