// 3.18.2: a monkey for the interface. It clicks any visible button, presses keys, starts runs, pauses, picks upgrades,
// changes the size of the window, and after every step looks for what must never happen: a page error, a dead screen (nothing
// to press), a broken save, a layout that does not fit. A seed makes a failure repeatable.
// Usage: node tools/qa.js fuzz [seed] [steps per size] (default seed 1, 220 steps).
import { chromium } from "playwright";
const URL = process.argv[2] || "http://localhost:8124/index.html";
const SEED = +(process.argv[3] || 1),
  STEPS = +(process.argv[4] || 220);
const SIZES = [
  { name: "phone-land", width: 844, height: 390, touch: true, mobile: true },
  { name: "phone-small", width: 667, height: 375, touch: true, mobile: true },
  { name: "tablet", width: 1024, height: 768, touch: true, mobile: true },
  { name: "desktop", width: 1280, height: 720, touch: false, mobile: false },
  { name: "desktop-small", width: 1024, height: 600, touch: false, mobile: false },
];
// a small seeded generator (the same one every run of a seed)
let state = SEED >>> 0 || 1;
const rnd = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
};
const pick = (list) => list[Math.floor(rnd() * list.length)];

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const fail = [];
let total = 0;
for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: size.touch,
    isMobile: size.mobile,
  });
  // the game can ask to confirm (reset, delete): the monkey agrees or not
  const page = await ctx.newPage();
  const errors = [],
    log = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(URL + (size.mobile ? "?shell=0" : ""));
  await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__riftTest.store.data.seen.tutorial = true;
  });
  for (let n = 0; n < STEPS; n++) {
    total++;
    // what can be pressed right now: visible, enabled, on the screen
    const targets = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll(
        "button, [role=button], [data-go], .card, .tab, input[type=checkbox], select",
      )) {
        if (el.disabled || seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect(),
          st = getComputedStyle(el);
        if (r.width < 4 || r.height < 4 || st.visibility === "hidden" || st.display === "none" || +st.opacity < 0.05)
          continue;
        if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
        const x = r.left + r.width / 2,
          y = r.top + r.height / 2;
        const top = document.elementFromPoint(x, y);
        if (!top || !(el === top || el.contains(top) || top.contains(el))) continue; // covered by something else
        out.push({ x, y, id: el.id || el.className || el.tagName, text: (el.textContent || "").trim().slice(0, 20) });
      }
      return out;
    });
    const roll = rnd();
    let what;
    try {
      if (roll < 0.62 && targets.length) {
        const t = pick(targets);
        what = `click ${t.id} "${t.text}"`;
        await page.mouse.click(t.x, t.y);
      } else if (roll < 0.8) {
        const key = pick([
          "Escape",
          "Enter",
          "Space",
          "Tab",
          "ArrowLeft",
          "ArrowRight",
          "p",
          "1",
          "2",
          "3",
          "4",
          "r",
          "e",
          "g",
        ]);
        what = `key ${key}`;
        await page.keyboard.press(key);
      } else if (roll < 0.88) {
        // some play: the stick and a few moves, dash and nova
        what = "play";
        await page.evaluate(() => {
          const g = window.__riftTest.game,
            w = g.world;
          if (w && w.state === "fight" && !g.paused) {
            w.god = true;
            for (let i = 0; i < 120; i++)
              w.step(1 / 60, {
                mx: Math.cos(i / 9),
                my: Math.sin(i / 7),
                fire: true,
                auto: true,
                assist: true,
                dash: i === 40,
                nova: i === 80,
              });
          }
        });
        await page.waitForTimeout(150);
      } else if (roll < 0.94) {
        // sizes a device can have: no landscape phone is smaller than 568 x 320
        const w = 568 + Math.floor(rnd() * 1000),
          h = 320 + Math.floor(rnd() * 600);
        what = `resize ${w}x${h}`;
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(250);
      } else {
        what = "wait";
        await page.waitForTimeout(300);
      }
    } catch (err) {
      what = `${what || "step"} (error: ${err.message.split("\n")[0]})`;
    }
    log.push(what);
    if (log.length > 12) log.shift();
    // after the step: nothing broken
    const problems = [];
    if (errors.length) problems.push(`page error: ${errors[0]}`);
    const health = await page.evaluate(() => {
      const T = window.__riftTest;
      let saveOk = true;
      try {
        const raw = localStorage.getItem("riftline.save");
        if (raw) {
          const d = JSON.parse(raw);
          saveOk = !!d && typeof d === "object";
        }
      } catch {
        saveOk = false;
      }
      const live = [...document.querySelectorAll("button, [role=button], [data-go]")].some((el) => {
        const r = el.getBoundingClientRect(),
          st = getComputedStyle(el);
        return !el.disabled && r.width > 4 && r.height > 4 && st.visibility !== "hidden" && st.display !== "none";
      });
      const audit = (n) => (n % 20 === 0 && window.__riftLayoutAudit ? window.__riftLayoutAudit() : null);
      return {
        saveOk,
        live,
        audit: audit((window.__fuzzN = (window.__fuzzN || 0) + 1)),
        state: T.game.world ? T.game.world.state : "menu",
      };
    });
    if (!health.saveOk) problems.push("the save in localStorage is not valid JSON");
    if (!health.live) problems.push("a dead screen: nothing can be pressed");
    if (health.audit && !health.audit.ok) problems.push(`layout: ${health.audit.findings.slice(0, 2).join("; ")}`);
    if (problems.length) {
      fail.push(`[${size.name}, seed ${SEED}, step ${n}] ${problems.join(" | ")} <- ${log.slice(-6).join(" > ")}`);
      break;
    }
  }
  await ctx.close();
}
console.log(JSON.stringify({ seed: SEED, steps: total, fail }, null, 1));
await browser.close();
process.exitCode = fail.length ? 1 : 0;
