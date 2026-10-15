// Seed-pinned biome screenshots for look A/B comparisons (like biome-shots.mjs, but the run seed is
// pinned, so the wave events (Blackout, Whiteout, ...), the spawns and the arena layout are identical
// between two builds — a plain biome-shots pair also differs in what the run rolled). Look at the
// pictures and measure them with the visual-art skill's image_report.py; both arms must use the same
// waves. Usage: node tools/qa.js look-shots <tag>  -> tests/shots/look-<tag>/
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const URL = /^https?:/.test(process.argv[2] || "") ? process.argv[2] : "http://localhost:8124/index.html";
const TAG = (/^https?:/.test(process.argv[2] || "") ? process.argv[3] : process.argv[2]) || "x";
const OUT = `tests/shots/look-${TAG}`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 300)));
await p.goto(URL);
await p.waitForFunction(() => window.__riftTest && window.__riftTest.ui, null, { timeout: 90000 });
const ev = (f, a) => p.evaluate(f, a);
await ev(() => {
  const T = window.__riftTest;
  for (const k of Object.keys(T.store.data.seen)) T.store.data.seen[k] = true;
  T.store.data.settings.quality = "battery";
  T.game.settingsChanged(true);
});
// the seed: startRun draws it from Math.random, so one pinned value stands in for the whole run
await ev(() => {
  const random = Math.random;
  Math.random = () => 0.42;
  try {
    window.__riftTest.game.startRun({});
  } finally {
    Math.random = random;
  }
});
await p.waitForTimeout(800);
const ids = await ev(() => window.__riftTest.game.world.route.slice());
for (const id of ids) {
  for (const boss of process.env.SHOT_BOSS === "0" ? [false] : [false, true]) {
    const wave = await ev(
      ([id, boss]) => {
        const g = window.__riftTest.game,
          w = g.world,
          i = w.route.indexOf(id),
          n = boss ? 5 + 5 * i : 2 + 5 * i;
        w.god = true;
        w.startWave(n);
        g.intro = null;
        window.__riftTest.renderer.focusOn(null);
        // a ring of different enemies around the drone, so the biome skin shows in the shot
        if (boss && w.bossPending) {
          w.spawnBoss(w.bossPending);
          w.bossPending = null;
        }
        if (!boss)
          ["grunt", "brute", "gunner", "bulwark", "striker", "splitter", "sniper", "bomber"].forEach((t, k) => {
            const a = (k / 8) * Math.PI * 2;
            w.spawnEnemy(t, Math.cos(a) * 4.5, 2 + Math.sin(a) * 3.5, {});
          });
        return n;
      },
      [id, boss],
    );
    await p.waitForTimeout(boss ? 4200 : 3200);
    const info = await ev(() => {
      const w = window.__riftTest.game.world;
      return { biome: w.arena.biome.id, wave: w.wave, event: w.event || "", enemies: w.enemies.length };
    });
    console.log(id, boss ? "boss" : "wave", wave, JSON.stringify(info));
    await p.screenshot({
      path: path.join(OUT, `${String(ids.indexOf(id) + 1).padStart(2, "0")}-${id}${boss ? "-boss" : ""}.png`),
    });
  }
}
await b.close();
console.log(`${TAG} errors: ${errs.length ? errs.join(" | ") : "none"}`);
