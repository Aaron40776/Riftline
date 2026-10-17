// Runs ONLY the in-page selftest() portion of tests/deep-test.mjs (the ~230 gameplay/sim checks),
// skipping the multi-hour offline sound-catalog render (covered by CI's build workflow).
// Usage: node scripts/rl-selftest-only.mjs [url]
import { chromium } from "playwright";
import { serve } from "../tools/serve.js";

const { server, url } = await serve(new URL("../dist", import.meta.url).pathname, 0);
const base = process.argv[2] || url;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[console.error]", m.text().slice(0, 200));
  });
  page.on("requestfailed", (r) => console.error("[reqfail]", r.url(), r.failure()?.errorText));
  const pageUrl = new URL("index.html", base.endsWith("/") ? base : base + "/").href;
  await page.goto(pageUrl, { timeout: 90000 });
  console.error("[selftest-only] page loaded:", pageUrl);
  await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 180000 });
  const res = await page.evaluate(async () => {
    const r = await window.__riftTest.selftest();
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
      v330: r.v330?.fail,
      v360: r.v360?.fail,
      v371: r.v371?.fail,
      v380: r.v380?.fail,
      v390: r.v390?.fail,
      v3100: r.v3100?.fail,
      v3130: r.v3130?.fail,
      v3140: r.v3140?.fail,
      v3150: r.v3150?.fail,
      v3160: r.v3160?.fail,
      v3170: r.v3170?.fail,
      v3210: r.v3210?.fail,
      v3220: r.v3220?.fail,
      v3240: r.v3240?.fail,
      v3250: r.v3250?.fail,
      v3260: r.v3260?.fail,
      v3270: r.v3270?.fail,
      v3280: r.v3280?.fail,
    };
  });
  const bad = [];
  const walk = (name, v) => {
    if (v == null) return;
    if (Array.isArray(v) ? v.length : true) bad.push([name, v]);
  };
  walk("fail", res.fail);
  for (const k of Object.keys(res).filter((k) => !["ok", "ms"].includes(k))) walk(k, res[k]);
  console.error(`[selftest-only] ok=${res.ok} in ${(res.ms / 1000).toFixed(1)} s, failing sections: ${bad.length}`);
  for (const [name, v] of bad) console.error(`  FAIL ${name}: ${JSON.stringify(v).slice(0, 400)}`);
  process.exitCode = bad.length || !res.ok ? 1 : 0;
} finally {
  await browser.close();
  server.close();
}
