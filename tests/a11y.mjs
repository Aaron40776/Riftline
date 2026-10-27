// Accessibility: the OS-level motion preference must actually still the camera.
// The CSS animations already honour prefers-reduced-motion (src/index.html); the 3D screen shake
// and the weapon kick did not, so a player who asked the OS for less motion still got a shaking
// camera. This suite drives the real renderer in both states, plus the live toggle.
// Usage: node tools/qa.js a11y
import { chromium } from "playwright";
import { launchArgs } from "./lib/renderer.mjs";
const URL = process.argv[2] || "http://localhost:8124/index.html";
const browser = await chromium.launch({ args: launchArgs() });
const fails = [];
const ok = (name, cond, detail = "") => {
  if (!cond) fails.push(name);
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${!cond && detail ? " — " + detail : ""}`);
};
const ready = (page) =>
  page.waitForFunction(() => window.__riftTest && window.__riftTest.renderer && window.__riftTest.game, null, {
    timeout: 60000,
  });

// 1) the preference is on: the renderer reads it and refuses to shake
const ctxReduced = await browser.newContext({ reducedMotion: "reduce" });
const pReduced = await ctxReduced.newPage();
await pReduced.goto(URL);
await ready(pReduced);
const reduced = await pReduced.evaluate(() => {
  const r = window.__riftTest.renderer;
  const motionOK = r.motionOK;
  r.addShake(1);
  return { motionOK, shake: r.shake };
});
ok("prefers-reduced-motion is read (motionOK false)", reduced.motionOK === false, JSON.stringify(reduced));
ok("addShake is a no-op under reduced motion", reduced.shake === 0, `shake=${reduced.shake}`);
await ctxReduced.close();

// 2) no preference: the shake lands, and turning the preference on mid-run stops the camera live
const ctxNormal = await browser.newContext();
const pNormal = await ctxNormal.newPage();
await pNormal.goto(URL);
await ready(pNormal);
const normal = await pNormal.evaluate(() => {
  const r = window.__riftTest.renderer;
  const motionOK = r.motionOK;
  r.addShake(0.5);
  return { motionOK, shake: r.shake };
});
ok("motion is honoured by default (motionOK true)", normal.motionOK === true, JSON.stringify(normal));
ok("addShake accumulates without the preference", normal.shake > 0, `shake=${normal.shake}`);

await pNormal.emulateMedia({ reducedMotion: "reduce" });
const live = await pNormal.evaluate(() => {
  const r = window.__riftTest.renderer;
  const motionOK = r.motionOK,
    before = r.shake;
  r.addShake(1);
  return { motionOK, before, after: r.shake };
});
ok("the preference is followed live (matchMedia change)", live.motionOK === false, JSON.stringify(live));
ok("no further shake after the live change", live.after === live.before, `before=${live.before} after=${live.after}`);
await ctxNormal.close();

await browser.close();
console.log(fails.length ? `A11Y: ${fails.length} failed` : "A11Y: all ok");
process.exitCode = fails.length ? 1 : 0;
