// 2.4.0: one screenshot of every biome in a running wave (and its boss arena), for looking at
// them side by side. Usage: node tools/qa.js biome-shots [pc|phone|land]  -> tests/shots/biomes-<profile>/
import { chromium } from 'playwright';
import fs from 'fs';
const URL = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://localhost:8124/index.html';
const NAME = (/^https?:/.test(process.argv[2] || '') ? process.argv[3] : process.argv[2]) || 'pc';
const prof = { pc: { viewport: { width: 1440, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, land: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }[NAME];
if (!prof) { console.error('usage: node biome-shots.mjs [url] pc|phone|land'); process.exit(2); }
const OUT = `tests/shots/biomes-${NAME}`; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(prof); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL); await p.waitForFunction(() => window.__riftTest && window.__riftTest.ui, null, { timeout: 90000 });
const ev = (f, a) => p.evaluate(f, a);
await ev(() => { const T = window.__riftTest; T.store.data.seen.tutorial = true; for (const k of Object.keys(T.store.data.seen)) T.store.data.seen[k] = true; T.store.data.settings.quality = 'high'; });
await ev(() => window.__riftTest.game.startRun({}));
await p.waitForTimeout(800);
const ids = await ev(() => window.__riftTest.game.world.route.slice());
for (const id of ids) {
  for (const boss of [false, true]) {
    const wave = await ev(([id, boss]) => {
      const g = window.__riftTest.game, w = g.world, i = w.route.indexOf(id), n = boss ? 5 + 5 * i : 2 + 5 * i;
      w.god = true; w.startWave(n); g.intro = null; window.__riftTest.renderer.focusOn(null); return n;
    }, [id, boss]);
    await p.waitForTimeout(boss ? 4200 : 3200);
    const info = await ev(() => { const w = window.__riftTest.game.world; return { biome: w.arena.biome.id, wave: w.wave, enemies: w.enemies.length, feats: ['vents', 'ice', 'acid', 'portals'].map((k) => k + ':' + w.arena[k].length).join(' ') }; });
    console.log(id, boss ? 'boss' : 'wave', wave, JSON.stringify(info));
    await p.screenshot({ path: `${OUT}/${String(ids.indexOf(id) + 1).padStart(2, '0')}-${id}${boss ? '-boss' : ''}.png` });
  }
}
console.log(NAME, 'errors:', errs.length ? errs : 'none');
await b.close();
process.exitCode = errs.length ? 1 : 0;
