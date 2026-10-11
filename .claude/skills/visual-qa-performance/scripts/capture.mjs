#!/usr/bin/env node
// Capture a running web app/game on several device profiles: screenshots, console/page errors, failed
// requests, frame-time statistics, WebGL renderer, JS heap, load timing. Read-only toward the app.
//
//   node capture.mjs URL [--profiles desktop,phone-landscape,tablet] [--out-dir qa-shots] [--wait 3000]
//        [--sample 5000] [--wait-for "#canvas"] [--click "#play"] [--keys "Space,KeyW"] [--json]
//
// Profiles: desktop 1920x1080, laptop 1366x768, phone-portrait 390x844 @3x touch, phone-landscape 844x390 @3x touch,
//           tablet 1180x820 @2x touch, low-end-phone 360x740 @2 touch with 4x CPU throttle (Chromium CDP).
// Emulation is NOT a real device: no real GPU, thermals or touch latency. A SwiftShader/llvmpipe renderer
// means software GL: frame times are then far worse than real hardware and only useful relatively.
// Exit 1 on page errors / console errors / failed requests / blank (single-colour) screenshots.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const url = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
if (!url) { console.error("usage: capture.mjs URL [--profiles a,b] [--out-dir DIR] [--wait MS] [--sample MS] [--wait-for SEL] [--click SEL] [--keys K1,K2] [--json]"); process.exit(2); }
const PROFILES = {
  desktop: { viewport: { width: 1920, height: 1080 } },
  laptop: { viewport: { width: 1366, height: 768 } },
  "phone-portrait": { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  "phone-landscape": { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "low-end-phone": { viewport: { width: 740, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, throttle: 4 },
};
function resolvePlaywright() {
  const bases = [process.cwd()];
  try { bases.push(path.dirname(execSync("npm root -g", { encoding: "utf8" }).trim())); } catch {}
  for (const b of bases) { try { return createRequire(path.join(b, "noop.js")).resolve("playwright"); } catch {} }
  try { return path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.js"); } catch { return "playwright"; }
}
const { chromium } = createRequire(import.meta.url)(resolvePlaywright());
const outDir = opt("--out-dir", "qa-shots");
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const results = [];
let failed = 0;
for (const name of opt("--profiles", "desktop,phone-landscape,tablet").split(",")) {
  const prof = PROFILES[name];
  if (!prof) { console.error("unknown profile", name); process.exit(2); }
  const { throttle, ...ctxOpts } = prof;
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const r = { profile: name, consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (m) => m.type() === "error" && r.consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => r.pageErrors.push(String(e).slice(0, 300)));
  page.on("requestfailed", (q) => r.failedRequests.push(`${q.url()} ${q.failure()?.errorText}`));
  page.on("response", (q) => q.status() >= 400 && r.failedRequests.push(`${q.url()} HTTP ${q.status()}`));
  if (throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle }); }
  const t0 = Date.now();
  try { await page.goto(url, { waitUntil: "load", timeout: 60000 }); } catch (e) { r.pageErrors.push("navigation: " + e.message); }
  r.loadMs = Date.now() - t0;
  if (opt("--wait-for")) await page.waitForSelector(opt("--wait-for"), { timeout: 30000 }).catch((e) => r.pageErrors.push("wait-for: " + e.message));
  if (opt("--click")) await page.click(opt("--click"), { timeout: 10000 }).catch((e) => r.pageErrors.push("click: " + e.message));
  for (const k of (opt("--keys", "") || "").split(",").filter(Boolean)) await page.keyboard.press(k);
  await page.waitForTimeout(+opt("--wait", 3000));
  const sampleMs = +opt("--sample", 5000);
  Object.assign(r, await page.evaluate(async (ms) => {
    const times = []; let last = performance.now();
    await new Promise((done) => { const end = last + ms; const f = (t) => { times.push(t - last); last = t; t < end ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
    times.shift(); times.sort((a, b) => a - b);
    const q = (p) => +times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(2);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    let gl = "none";
    const c = document.querySelector("canvas");
    if (c) { const ctx = c.getContext("webgl2") || c.getContext("webgl"); const d = ctx && ctx.getExtension("WEBGL_debug_renderer_info"); gl = ctx ? (d ? ctx.getParameter(d.UNMASKED_RENDERER_WEBGL) : "webgl (renderer hidden)") : "canvas is not WebGL (or context already 2d)"; }
    return { frames: times.length, fps: +(1000 / mean).toFixed(1), frameMs: { mean: +mean.toFixed(2), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) },
      longFrames33: times.filter((t) => t > 33.4).length, glRenderer: gl, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      canvas: c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null, dpr: devicePixelRatio,
      resources: performance.getEntriesByType("resource").length, transferKB: Math.round(performance.getEntriesByType("resource").reduce((a, e) => a + (e.transferSize || 0), 0) / 1024) };
  }, sampleMs));
  r.softwareGL = /swiftshader|llvmpipe|software/i.test(r.glRenderer);
  r.screenshot = path.join(outDir, `${name}.png`);
  const buf = await page.screenshot({ path: r.screenshot });
  // blank-frame heuristic on the PNG: compare a few decoded pixels via the canvas API in-page
  r.blank = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const cv = new OffscreenCanvas(64, 64); const x = cv.getContext("2d"); x.drawImage(img, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data; let mn = 255, mx = 0;
    for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; mn = Math.min(mn, l); mx = Math.max(mx, l); }
    return mx - mn < 6;
  }, buf.toString("base64"));
  const bad = r.pageErrors.length + r.consoleErrors.length + r.failedRequests.length + (r.blank ? 1 : 0);
  r.result = bad ? "FAIL" : "PASS";
  if (bad) failed++;
  results.push(r);
  await ctx.close();
}
await browser.close();
if (args.includes("--json")) console.log(JSON.stringify(results, null, 2));
else for (const r of results) {
  console.log(`== ${r.profile}: ${r.result}  load ${r.loadMs} ms, ${r.resources} resources ${r.transferKB} KB, heap ${r.heapMB} MB, dpr ${r.dpr}`);
  console.log(`   fps ${r.fps}  frame ms p50 ${r.frameMs.p50} p95 ${r.frameMs.p95} p99 ${r.frameMs.p99} max ${r.frameMs.max}  long(>33ms) ${r.longFrames33}/${r.frames}`);
  console.log(`   GL ${r.glRenderer}${r.softwareGL ? "  [SOFTWARE GL: timings not representative of real devices]" : ""}  canvas ${JSON.stringify(r.canvas)}`);
  for (const k of ["pageErrors", "consoleErrors", "failedRequests"]) for (const e of r[k]) console.log(`   ${k}: ${e}`);
  if (r.blank) console.log("   BLANK: screenshot is (nearly) a single colour");
  console.log(`   screenshot ${r.screenshot}`);
}
process.exit(failed ? 1 : 0);
