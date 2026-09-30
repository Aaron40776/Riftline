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
  };
});
// 2.7.0: render every sound offline (mono, 44.1 kHz, at most 2 s): no exception, finite samples, not silent,
// below full scale, and every voice has ended when the render does (nothing stays alive)
const sound = await page.evaluate(async () => {
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
  return { count: catalog.length, maxPeak, longest, fail };
});
res.soundRender = sound;
if (sound.fail.length) res.ok = false;
console.log(JSON.stringify(res, null, 1));
console.log(res.ok ? "DEEP TEST: ok" : "DEEP TEST: FAIL");
await browser.close();
process.exitCode = res.ok ? 0 : 1;
