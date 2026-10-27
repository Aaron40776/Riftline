// Peak audit for the place sounds against the deep-test catalog caps:
//   beds      < 60 % of a Pulse shot peak   (bedLimit)
//   far sounds < a Scattergun shot peak     (farLimit)
// The catalog renders every sound at sfxVol = 1 with the ambience bus at its constructor
// value (ambVol 0.8 x AMB_LIFT). This script renders the place:* entries plus the two
// reference shots and reports each margin, so an ambience lift can be sized without
// running the multi-hour catalog.

import { chromium } from "playwright";
import { serve } from "../tools/serve.js";
import { launchArgs } from "../tests/lib/renderer.mjs";

const PORT = 8133;
const { server } = await serve("dist", PORT, { quiet: true });
const browser = await chromium.launch({ args: launchArgs() });
const page = await browser.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
await page.goto(`http://localhost:${PORT}/index.html`, { timeout: 90000 });
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });

const res = await page.evaluate(async () => {
  const E = window.__riftTest.game.sound.constructor,
    catalog = E.catalog(),
    want = catalog.filter((c) => c.name.startsWith("place:") || c.name === "pulse" || c.name === "scatter"),
    peaks = {},
    fail = [];
  for (const { name, spec } of want) {
    try {
      const r = await E.renderOffline(spec);
      peaks[name] = r.peak;
    } catch (err) {
      fail.push(`${name}: ${err && err.message}`);
    }
  }
  return { peaks, fail, ambLiftBus: new E().ambVol };
});

await browser.close();
server.close();

const p = res.peaks,
  pulse = p.pulse,
  scatter = p.scatter,
  bedLimit = pulse * 0.6,
  farLimit = scatter;
const rows = Object.keys(p)
  .filter((k) => k.startsWith("place:"))
  .map((k) => {
    const bed = res.bedSet ? res.bedSet.includes(k.slice(6)) : null,
      limit = bed ? bedLimit : farLimit,
      over = p[k] >= limit;
    return `${over ? "OVER " : "ok   "} ${k.padEnd(28)} peak ${p[k].toFixed(4)}  (limit ${limit.toFixed(4)})`;
  })
  .sort();
console.log(`pulse peak   ${pulse.toFixed(4)}  -> bedLimit  ${(bedLimit).toFixed(4)}`);
console.log(`scatter peak ${scatter.toFixed(4)}  -> farLimit  ${farLimit.toFixed(4)}`);
console.log(`amb bus at catalog = ambVol ${res.ambLiftBus} (x AMB_LIFT as built)\n`);
console.log(rows.join("\n"));
if (res.fail.length) console.log("\nFAILS:\n" + res.fail.join("\n"));
const placeKeys = Object.keys(p).filter((k) => k.startsWith("place:"));
const maxBedRatio = Math.max(...placeKeys.map((k) => p[k] / bedLimit));
const maxFarRatio = Math.max(...placeKeys.map((k) => p[k] / farLimit));
console.log(`\nmax bed ratio vs its limit : ${maxBedRatio.toFixed(2)}  (must stay under 1)`);
console.log(`max far ratio vs its limit : ${maxFarRatio.toFixed(2)}`);
console.log(`these peaks already carry the built-in bus lift (ambVol 0.8 x AMB_LIFT); old-bus peaks were ${res.ambLiftBus ? "" : ""}this / (built lift)`);
process.exit(res.fail.length ? 1 : 0);
