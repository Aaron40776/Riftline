// 3.45.1: the player-mode regression. Every other browser test runs with navigator.webdriver = true
// (puppeteer/playwright), so the test-only run monitor is enabled there. 3.43.1 gated rlMonEnable behind
// webdriver but left rlMonStart binding the world for every player, whose World.step then called the null
// runHooks.step and - through its own catch - the null runHooks.issue: every run died three frames in and
// no test saw it, because the tests ARE test sessions. This suite patches webdriver to false before any
// page script runs and plays a run like a player would. If the frame loop dies, the frame counter flatlines
// and the suite fails.
import { chromium } from "playwright";
const URL = process.argv[2] || "http://localhost:8124/index.html";
const results = [];
let totalFail = 0;
const ok = (name, cond, detail = "") => {
  results.push([cond ? "PASS" : "FAIL", name, detail]);
  if (!cond) totalFail++;
};

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => {
  // the player's browser: no webdriver flag, so main.js never calls rlMonEnable
  Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
  // count every requested frame; the game loop dies -> no more callbacks -> the counter flatlines
  window.__rlFrames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      window.__rlFrames++;
      cb(t);
    });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(URL);
await page.waitForSelector("#playBtn", { state: "visible", timeout: 90000 });
await page.waitForFunction(() => !!window.__riftTest?.game, null, { timeout: 30000 }).catch(() => {});
ok("page loads as a player", true, "playBtn visible");
ok(
  "webdriver is patched off",
  (await page.evaluate(() => navigator.webdriver)) === false,
  String(await page.evaluate(() => navigator.webdriver)),
);
await page.click("#playBtn");
await page.waitForTimeout(900);
ok(
  "run starts (HUD visible)",
  await page.evaluate(() => {
    const e = document.getElementById("hud");
    return !!e && !e.hidden && getComputedStyle(e).display !== "none";
  }),
  String(await page.evaluate(() => window.__riftTest?.game?.mode)),
);
// skip the tutorial hold the same way e2e does, then let the world run
await page.evaluate(() => {
  const g = window.__riftTest?.game;
  if (g && g.tut) g.tut.step = 4;
});
await page.waitForTimeout(800);
const f1 = await page.evaluate(() => window.__rlFrames);
const t1 = await page.evaluate(() => window.__riftTest?.game?.world?.time ?? -1);
await page.waitForTimeout(2000);
const f2 = await page.evaluate(() => window.__rlFrames);
const t2 = await page.evaluate(() => window.__riftTest?.game?.world?.time ?? -1);
ok("frame loop runs", f1 > 3, `${f1} frames in the first window`);
ok("frame loop keeps running", f2 > f1 + 10, `${f1} -> ${f2} frames`);
ok("simulation advances", t2 > t1, `world time ${t1.toFixed(2)} -> ${t2.toFixed(2)}`);
ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log("=== player-mode ===");
for (const r of results) console.log(`[${r[0]}] ${r[1]}${r[2] ? " — " + r[2] : ""}`);
await browser.close();
console.log(`\nTOTAL FAIL: ${totalFail}`);
process.exit(totalFail ? 1 : 0);
