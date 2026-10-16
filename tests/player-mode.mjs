// 3.45.1: the player-mode regression. Every other browser test runs with navigator.webdriver = true
// (puppeteer/playwright), so the test-only run monitor is enabled there. 3.43.1 gated rlMonEnable behind
// webdriver but left rlMonStart binding the world for every player, whose World.step then called the null
// runHooks.step and - through its own catch - the null runHooks.issue: every run died three frames in and
// no test saw it, because the tests ARE test sessions. This suite patches webdriver to false before any
// page script runs and plays like a player: boot, run, health, resume after a reload, and the crash path.
// If the frame loop dies, the frame counter flatlines and the suite fails.
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
const vis = (id) =>
  page.evaluate((i) => {
    const e = document.getElementById(i);
    return !!e && !e.hidden && getComputedStyle(e).display !== "none";
  }, id);
const tap = async (sel) => {
  const el = await page.$(sel);
  if (!el) throw new Error("missing " + sel);
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox();
  if (!b) throw new Error("invisible " + sel);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
};
const skipTutorial = () =>
  page.evaluate(() => {
    const g = window.__riftTest?.game;
    if (g && g.tut) g.tut.step = 4;
  });
const measureLoop = async (ms) => {
  const f1 = await page.evaluate(() => window.__rlFrames);
  const t1 = await page.evaluate(() => window.__riftTest?.game?.world?.time ?? -1);
  await page.waitForTimeout(ms);
  const f2 = await page.evaluate(() => window.__rlFrames);
  const t2 = await page.evaluate(() => window.__riftTest?.game?.world?.time ?? -1);
  return { f1, f2, t1, t2 };
};

// --- boot parity
await page.goto(URL);
await page.waitForSelector("#playBtn", { state: "visible", timeout: 90000 });
await page.waitForFunction(() => !!window.__riftTest?.game, null, { timeout: 30000 }).catch(() => {});
ok(
  "webdriver is patched off",
  (await page.evaluate(() => navigator.webdriver)) === false,
  String(await page.evaluate(() => navigator.webdriver)),
);
// the game's own health suite, exactly as a player's boot runs it (the dom check caught 3.45.0's removals)
const health = await page.evaluate(() => window.__riftTest.health({ context: "player-mode" }));
const healthFails = (health || []).filter((c) => c.status === "FAIL");
ok(
  "health checks pass as a player",
  healthFails.length === 0,
  `${health.length} checks · fails: ${healthFails.map((c) => c.id + ": " + c.detail).join(" | ") || "none"}`,
);

// --- fresh run: the original crash killed the loop within three frames
await tap("#playBtn");
await page.waitForTimeout(900);
ok("run starts (HUD visible)", await vis("hud"), String(await page.evaluate(() => window.__riftTest?.game?.mode)));
await skipTutorial();
await page.waitForTimeout(800);
const run1 = await measureLoop(2000);
ok("frame loop runs", run1.f1 > 3, `${run1.f1} frames in the first window`);
ok("frame loop keeps running", run1.f2 > run1.f1 + 10, `${run1.f1} -> ${run1.f2} frames`);
ok("simulation advances", run1.t2 > run1.t1, `world time ${run1.t1.toFixed(2)} -> ${run1.t2.toFixed(2)}`);
const wave1 = await page.evaluate(() => window.__riftTest?.game?.world?.wave);
ok("wave 1 is playing", wave1 === 1, "wave " + wave1);

// --- resume edge: reload mid-run, continue from the stored snapshot (the second rlMonStart path)
await page.reload();
await page.waitForSelector("#playBtn", { state: "visible", timeout: 90000 });
await page.waitForFunction(() => !!window.__riftTest?.game, null, { timeout: 30000 }).catch(() => {});
ok("continue button offered after reload", await vis("continueBtn"));
await tap("#continueBtn");
await page.waitForTimeout(900);
ok("run resumed (HUD visible)", await vis("hud"), String(await page.evaluate(() => window.__riftTest?.game?.mode)));
const run2 = await measureLoop(2000);
ok("resumed frame loop keeps running", run2.f2 > run2.f1 + 10, `${run2.f1} -> ${run2.f2} frames`);
ok("resumed simulation advances", run2.t2 > run2.t1, `world time ${run2.t1.toFixed(2)} -> ${run2.t2.toFixed(2)}`);

// --- normal run end: the audit a player builds at death (rlMonFinish runs without the monitor)
await page.evaluate(() => {
  const w = window.__riftTest.game.world;
  w.god = false;
  w.player.iT = 0;
  w.player.dashT = 0;
  w.player.shield = false;
  w.hurtPlayer(99999, null, null, "grunt", true);
});
await page.waitForSelector("#over:not([hidden])", { timeout: 20000 });
ok("run ends on the over screen", await vis("over"));
const endAudit = await page.evaluate(() => window.__riftTest.lastRunAudit);
ok(
  "end-of-run audit exists for a player",
  !!(endAudit && endAudit.checks && endAudit.checks.length >= 4),
  `${endAudit ? endAudit.checks.length : 0} checks`,
);
const monitorWarn = (endAudit?.checks || []).find((c) => c.id === "monitor");
ok(
  "end-of-run audit has no monitor warn for a player",
  !monitorWarn,
  monitorWarn ? `[${monitorWarn.st}] ${monitorWarn.msg}` : "monitor stayed test-only",
);
const payoutFail = (endAudit?.checks || []).find((c) => c.id === "payout" && c.st === "FAIL");
ok("payout check passed", !payoutFail, payoutFail ? payoutFail.msg : "shards credited correctly");

// --- crash path: force frame errors like the 3.43.1 bug did, then read the player's crash report
await tap("#homeBtn");
await tap("#playBtn");
await page.waitForTimeout(900);
ok("new run starts after death", await vis("hud"));
await skipTutorial();
await page.waitForTimeout(500);
await page.evaluate(() => {
  const w = window.__riftTest.game.world;
  w.step = () => {
    throw new Error("player-mode crash probe");
  };
});
await page.waitForSelector("#crash:not([hidden])", { timeout: 15000 });
ok("crash screen shows", await vis("crash"));
const report = await page.evaluate(() => document.getElementById("crashLog").value);
ok(
  "crash report has health",
  report.includes("Health:"),
  report.split("\n").find((l) => l.startsWith("Health:")) || "",
);
ok("crash report carries the frame errors", report.includes("player-mode crash probe"));
ok(
  "crash report has no post-run audit section",
  !report.includes("Post-run audit"),
  report.includes("Post-run audit") ? "audit leaked into a player crash report" : "monitor stayed test-only",
);
ok(
  "crash report has no misleading monitor warn",
  !report.includes("run monitor was not attached"),
  report.includes("run monitor was not attached") ? "the monitor warn fired for a player" : "clean",
);
const domLine = (health || []).find((c) => c.id === "dom");
ok("dom health check is OK", domLine && domLine.status === "OK", domLine ? domLine.detail : "missing");

console.log("=== player-mode ===");
for (const r of results) console.log(`[${r[0]}] ${r[1]}${r[2] ? " — " + r[2] : ""}`);
await browser.close();
console.log(`\nTOTAL FAIL: ${totalFail}`);
process.exit(totalFail ? 1 : 0);
