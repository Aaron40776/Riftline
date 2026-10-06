// Riftline full QA runner — criteria-based, step by step.
// Usage: node full-qa.mjs [baseUrl] [sectionFilter]
//   sections: files, saves, ui, run, buttons
// Every check states its criterion; the run fails if any check fails.
import { chromium } from "playwright";
import fs from "fs";
import { waitScreenGame } from "./lib/wait.mjs";
const BASE = (process.argv[2] || "http://localhost:8124/").replace(/index\.html$/, "");
const ONLY = process.argv[3] || "";
const FIX = new URL("./fixtures/", import.meta.url).pathname;
fs.mkdirSync(new URL("./shots/", import.meta.url).pathname, { recursive: true });
const KEY = "riftline.save.v1";
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, touch: false },
  // 3.11.0: phones play in landscape only; the touch sections run on a phone held sideways
  phone: { viewport: { width: 844, height: 390 }, touch: true, mobile: true },
};
let fails = 0;
const out = [];
// 3.10.0: QA_TIMES=1 adds the seconds since the previous check to every line (to find the slow steps)
let lastCheckAt = Date.now();
const log = (sec, st, name, detail = "") => {
  const took = process.env.QA_TIMES ? ` (+${((Date.now() - lastCheckAt) / 1000).toFixed(1)} s)` : "";
  lastCheckAt = Date.now();
  out.push(`[${st}] ${sec} · ${name}${detail ? " — " + detail : ""}${took}`);
  if (st === "FAIL") fails++;
};

/* ---------- helpers ---------- */
// Fresh browser context; `save` is written to localStorage once, before the game boots
// (string = raw text, null = no save). `block` makes localStorage throw.
// 3.10.0: every context a section opens; the section closes what is left when it ends or throws. A section that
// threw used to leave its page running (software GL at ~300 % CPU) and every later section timed out on page.goto.
const liveContexts = new Set();
// 3.17.1: most of the time of the QA is the browser drawing the 3D scene in software at a few frames a second. The QA
// looks at state and the DOM, not at pixels, so the GPU draw calls (drawElements, drawArrays and their instanced forms)
// are no-ops: everything else runs as before (the simulation, the renderer's own code that builds the scene each frame,
// the shaders, the DOM). P.shot draws for real around a screenshot, the E2E, the screenshots, the biome and attack
// pictures and the audits of the release check draw all the time. QA_DRAW=1 draws everywhere.
const DRAW_ALWAYS = process.env.QA_DRAW === "1";
async function open(profName, { save = null, block = false, draw = DRAW_ALWAYS } = {}) {
  const prof = PROFILES[profName];
  const ctx = await browser.newContext({
    viewport: prof.viewport,
    hasTouch: !!prof.touch,
    isMobile: !!prof.mobile,
    deviceScaleFactor: prof.mobile ? 2 : 1,
    ...(prof.screen ? { screen: prof.screen } : {}),
  });
  await ctx.addInitScript(
    ([k, v, block]) => {
      if (block) {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("denied", "SecurityError");
          },
        });
        return;
      }
      // a second tab of the same context (window.name set before it loads the game) must not reseed
      if (window.name === "qa-tab2" || sessionStorage.getItem("__qaSeeded")) return;
      sessionStorage.setItem("__qaSeeded", "1");
      localStorage.clear();
      if (v != null) localStorage.setItem(k, v);
    },
    [KEY, save, block],
  );
  await ctx.addInitScript((noDraw) => {
    window.__qaNoDraw = noDraw;
    for (const proto of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype])
      if (proto)
        for (const fn of [
          "drawElements",
          "drawArrays",
          "drawElementsInstanced",
          "drawArraysInstanced",
          "drawRangeElements",
        ])
          if (proto[fn]) {
            const real = proto[fn];
            proto[fn] = function (...args) {
              return window.__qaNoDraw ? undefined : real.apply(this, args);
            };
          }
  }, !draw);
  liveContexts.add(ctx);
  ctx.on("close", () => liveContexts.delete(ctx));
  const page = await ctx.newPage();
  const errors = [],
    bad = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160));
  });
  page.on("response", (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => bad.push(`failed ${r.url()}`));
  const P = { ctx, page, errors, bad, prof };
  P.boot = async () => {
    await page.goto(BASE + "index.html");
    await page.waitForFunction(
      () =>
        window.__riftTest && window.__riftTest.game && window.__riftTest.ui && window.__riftTest.RL_HEALTH.length > 5,
      null,
      { timeout: 90000 },
    );
    await page.waitForTimeout(800);
  };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.vis = (id) =>
    page.evaluate((i) => {
      const e = document.getElementById(i);
      if (!e || e.hidden) return false;
      let n = e;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden" || n.hidden) return false;
        n = n.parentElement;
      }
      return true;
    }, id);
  // settle: wait out the touch ghost-click guard (900 ms) or a desktop repaint (300 ms) after the tap; a caller that
  // waits for the tap's effect itself passes { settle: false }
  P.tap = async (sel, { settle = true } = {}) => {
    const el = typeof sel === "string" ? await page.$(sel) : sel;
    if (!el) throw new Error("missing " + sel);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox();
    if (!b) throw new Error("invisible " + sel);
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    if (prof.touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    if (settle) await page.waitForTimeout(prof.touch ? 900 : 300); // > touch ghost-click guard window
  };
  // click a dialog button by its label
  P.dlg = async (label) => {
    await page.waitForFunction(() => !document.getElementById("dialog").hidden, null, { timeout: 5000 });
    const btns = await page.$$("#dlgBtns button");
    for (const b of btns) if ((await b.textContent()).trim().toLowerCase() === label.toLowerCase()) return P.tap(b);
    throw new Error(
      `dialog has no "${label}" button (has: ${(await Promise.all(btns.map((b) => b.textContent()))).join(", ")})`,
    );
  };
  P.dlgTitle = () =>
    page.evaluate(() =>
      document.getElementById("dialog").hidden ? null : document.getElementById("dlgTitle").textContent,
    );
  P.nav = async (screen) => {
    await P.tap(`[data-go="${screen}"]`);
  };
  P.back = async (screen) => {
    await P.tap(`#${screen} [data-back]`);
  };
  P.stored = () =>
    page.evaluate((k) => {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return "unparsable";
      }
    }, KEY);
  // a screenshot of what the game draws now: the draw calls are on for two frames around it
  P.shot = async (opts) => {
    if (!draw) {
      await page.evaluate(() => {
        window.__qaNoDraw = false;
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    try {
      return await page.screenshot(opts);
    } finally {
      if (!draw)
        await page.evaluate(() => {
          window.__qaNoDraw = true;
        });
    }
  };
  P.close = () => ctx.close();
  return P;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let sectionsRun = 0;
async function section(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  sectionsRun++;
  const t0 = Date.now();
  try {
    await fn((st, n, d) => log(name, st, n, d));
  } catch (e) {
    log(name, "FAIL", "section exception", String(e.message).split("\n")[0]);
  }
  for (const ctx of [...liveContexts]) await ctx.close().catch(() => {});
  out.push(`        (${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const check = (L, name, cond, detail = "") => L(cond ? "PASS" : "FAIL", name, detail);
// what the input layer reports right now for horizontal movement (-1 … 1)
const SAMPLE_MX = () => {
  const g = window.__riftTest.game;
  return g.input.sample(g.world, window.__riftTest.store.data.settings).mx;
};
// holds "move right": the D key on PC, a finger dragged right on the move side on touch
async function holdMoveRight(P) {
  const { page, prof } = P;
  if (!prof.touch) {
    await page.keyboard.down("d");
    return { keep: (ms) => page.waitForTimeout(ms), release: () => page.keyboard.up("d") };
  }
  const cdp = await P.ctx.newCDPSession(page),
    x0 = prof.viewport.width * 0.22,
    y0 = prof.viewport.height * 0.62;
  const touch = (type, x) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: y0, id: 7 }] });
  await touch("touchStart", x0);
  for (let i = 1; i <= 4; i++) {
    await touch("touchMove", x0 + 15 * i);
    await page.waitForTimeout(40);
  }
  let n = 0;
  return {
    keep: async (ms) => {
      for (const end = Date.now() + ms; Date.now() < end; ) {
        await touch("touchMove", x0 + 60 + (n++ % 2));
        await page.waitForTimeout(50);
      }
    },
    release: () => touch("touchEnd"),
  };
}
// clear the current wave (kills everything, plan exhausted) -> choose / victory screen
const CLEAR = () => {
  const w = window.__riftTest.game.world;
  w.god = true;
  w.planIdx = w.plan.length;
  w.bossPending = null;
  w.championPending = null;
  w.markers = [];
  for (const e of [...w.enemies]) w.killEnemy(e);
};

// 3.10.0: clear the wave and run the real world logic (the cleared phase, the pickups, the offer) to the upgrade
// choice in one go, without waiting for frames. For checks of the choice screen itself; the run sections keep the
// real clear through the main loop (the transition is what they test). A frame under software GL advances at most
// 0.1 s of game time, so waiting for the ~3.5 s cleared phase took 15 to 35 s of real time per clear.
const CLEAR_TO_CHOICE = () => {
  const w = window.__riftTest.game.world;
  w.god = true;
  w.planIdx = w.plan.length;
  w.bossPending = null;
  w.championPending = null;
  w.markers = [];
  for (let k = 0; k < 900 && w.state !== "choose"; k++) {
    for (const e of [...w.enemies]) w.killEnemy(e);
    w.step(1 / 60, {});
  }
};

/* ======================= 1. files / PWA ======================= */
await section("files", async (L) => {
  const P = await open("desktop");
  await P.boot();
  const sw = await (await P.page.request.get(BASE + "sw.js")).text();
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\])/)[1]);
  const cache = sw.match(/const CACHE = '([^']+)'/)[1];
  const missing = [];
  for (const f of files) {
    const r = await P.page.request.get(BASE + (f === "./" ? "" : f));
    if (r.status() !== 200) missing.push(`${f} ${r.status()}`);
  }
  check(
    L,
    "service worker: every precached file exists",
    !missing.length,
    `${files.length} files${missing.length ? "; missing " + missing.join(", ") : ""}`,
  );
  const man = await (await P.page.request.get(BASE + "manifest.webmanifest")).json();
  const icons = [];
  for (const i of man.icons || []) {
    const r = await P.page.request.get(BASE + i.src);
    r.status() !== 200 && icons.push(i.src);
  }
  check(L, "manifest: all icons exist", !icons.length && (man.icons || []).length > 0, icons.join(", "));
  const meta = await P.ev(() => ({
    v: document.querySelector('meta[name="riftline-version"]')?.content,
    b: document.querySelector('meta[name="riftline-build"]')?.content,
    src: [...document.scripts].map((s) => s.getAttribute("src")).filter(Boolean),
  }));
  const infoText = await (await P.page.request.get(BASE + "build-info.json")).text(),
    info = JSON.parse(infoText);
  // 3.17.1: the game fetches build-info.json at every start: it is the small identity file, the history is changes.json
  const hist = await (await P.page.request.get(BASE + "changes.json")).json();
  check(
    L,
    "build-info.json is small (no changelog), the history is in changes.json",
    infoText.length < 2000 && !("changes" in info) && hist.version === info.version && hist.changes.length > 50,
    `${infoText.length} bytes, ${hist.changes.length} changes`,
  );
  check(
    L,
    "version identical in index.html / build-info / service worker",
    meta.v === info.version && meta.b === info.build && cache.includes(meta.v.replace(/\./g, "-")),
    `${meta.v} / ${info.version} / ${cache}`,
  );
  check(
    L,
    "game script is the one precached by the SW",
    meta.src.every((s) => files.includes(s)),
    meta.src.join(","),
  );
  // What's new tab: the newest entry is this version, the badge shows until the tab was opened
  const badge0 = await P.ev(() => !document.getElementById("newsBadge").hidden);
  await P.nav("news");
  const news = await P.ev(() => ({
    shown: !document.getElementById("news").hidden,
    first: document.querySelector("#newsList .section-h")?.textContent || "",
    rows: document.querySelectorAll("#newsList .set-row").length,
  }));
  await P.back("news");
  const badge1 = await P.ev(() => !document.getElementById("newsBadge").hidden);
  check(
    L,
    "What's new: newest entry is this version, rows listed, badge gone after opening",
    news.shown && news.first.startsWith(meta.v) && news.rows >= 3 && badge0 && !badge1,
    JSON.stringify({ news, badge0, badge1, v: meta.v }),
  );
  const inGame = await P.ev(() => (window.__riftTest.data && document.getElementById("verText")?.textContent) || "");
  check(L, "no failed requests while booting", !P.bad.length, P.bad.join(" | "));
  check(L, "no page errors while booting", !P.errors.length, P.errors.join(" | "));
  await P.close();
});

/* ======================= 2. save matrix ======================= */
await section("saves", async (L) => {
  const v222 = fs.readFileSync(FIX + "save-v222.json", "utf8"),
    v231 = fs.readFileSync(FIX + "save-v231.json", "utf8");
  const common = async (P, label, allowLoadLog = false) => {
    check(L, `${label}: boots to home`, await P.vis("home"));
    // the loader reporting a broken save through the diagnostics log is intended
    const errs = P.errors.filter((e) => !(allowLoadLog && /^console: \[riftline\] load /.test(e)));
    check(L, `${label}: no page errors`, !errs.length, errs.join(" | "));
    // round trip: what is stored must load back to the same data
    const rt = await P.ev(() => {
      const s = window.__riftTest.store;
      s.save("qa");
      const raw = localStorage.getItem("riftline.save.v1");
      const p = s.parse(raw);
      const strip = (d) => {
        const c = JSON.parse(JSON.stringify(d));
        delete c.savedAt;
        return c;
      };
      return p.ok && JSON.stringify(strip(p.data)) === JSON.stringify(strip(s.data));
    });
    check(L, `${label}: save → load round trip is lossless`, rt);
  };
  // 2.1 no save at all
  {
    const P = await open("desktop");
    await P.boot();
    const d = await P.ev(() => {
      const T = window.__riftTest,
        s = T.store.data;
      return {
        shards: s.shards,
        run: s.run,
        hist: s.history,
        set: JSON.stringify(s.settings) === JSON.stringify(T.data.defaultSettings),
      };
    });
    check(
      L,
      "fresh: default profile",
      d.shards === 0 && d.run === null && Array.isArray(d.hist) && d.hist.length === 0 && d.set,
      JSON.stringify(d),
    );
    check(L, "fresh: no Continue button", !(await P.vis("continueBtn")));
    await common(P, "fresh");
    await P.close();
  }
  // 2.2 / 2.3 real saves from older builds (with a pending upgrade offer)
  for (const [label, raw] of [
    ["2.2.2 save", v222],
    ["2.3.1 save", v231],
  ]) {
    const P = await open("desktop", { save: raw });
    await P.boot();
    const src = JSON.parse(raw);
    const told = await P.page
      .waitForFunction(() => document.body.innerText.includes("The arsenal is down to 7 weapons"), null, {
        timeout: 6000,
      })
      .then(
        () => true,
        () => false,
      );
    check(L, `${label}: a toast says which retired weapon was converted`, told);
    const d = await P.ev(() => {
      const g = window.__riftTest.game,
        s = window.__riftTest.store.data;
      return {
        shards: s.shards,
        hull: s.workshop.hull,
        ion: s.weapons.ion,
        tesla: s.weapons.tesla,
        teslaCost: window.__riftTest.weaponDefs.tesla.cost,
        weapon: s.weapon,
        set: s.settings,
        runs: s.stats.runs,
        best: s.stats.bestWave,
        run: !!s.run,
        hist: s.history,
        vol: g.sound.sfxVol,
        zoom: window.__riftTest.renderer.zoom,
        contrast: window.__riftTest.renderer.contrast,
      };
    });
    check(
      L,
      `${label}: progress kept (shards, workshop, stats)`,
      d.hull === 2 && d.runs === src.stats.runs && d.best === src.stats.bestWave,
      JSON.stringify({ hull: d.hull, runs: d.runs }),
    );
    // 2.4.0: Ion Repeater was retired; it becomes Arc Caster (its original) plus the price difference
    check(
      L,
      `${label}: retired Ion Repeater → Arc Caster selected, +${1250 - d.teslaCost} shards`,
      d.ion === undefined && d.tesla === true && d.weapon === "tesla" && d.shards === src.shards + 1250 - d.teslaCost,
      JSON.stringify({ shards: d.shards, weapon: d.weapon, ion: d.ion, tesla: d.tesla }),
    );
    check(
      L,
      `${label}: settings kept and applied (3.8.0: the retired left-handed and reduce-flashes settings dropped)`,
      eq(d.set, { ...d.set, ...src.settings, swap: undefined, calm: undefined }) &&
        !("swap" in d.set) &&
        !("calm" in d.set) &&
        Math.abs(d.vol - src.settings.sfx) < 1e-6 &&
        Math.abs(d.zoom - src.settings.zoom) < 1e-6 &&
        d.contrast === src.settings.contrast,
      `sfxVol ${d.vol} zoom ${d.zoom} contrast ${d.contrast}`,
    );
    check(
      L,
      `${label}: run history present`,
      Array.isArray(d.hist) && d.hist.length === (src.history || []).length,
      `${d.hist && d.hist.length} entries`,
    );
    check(L, `${label}: unfinished run offered`, d.run && (await P.vis("continueBtn")));
    await P.tap("#continueBtn");
    await P.page.waitForTimeout(1200);
    const r = await P.ev(() => {
      const w = window.__riftTest.game.world;
      return (
        w && {
          wave: w.wave,
          weapon: w.weapon,
          state: w.state,
          cards: document.querySelectorAll("#cards .card").length,
          choose: !document.getElementById("choose").hidden,
        }
      );
    });
    check(
      L,
      `${label}: continue restores the pending upgrade choice (run weapon Ion → Arc Caster)`,
      r && r.wave === src.run.wave && r.weapon === "tesla" && r.choose && r.cards >= 3,
      JSON.stringify(r),
    );
    if (r && r.choose) {
      await P.page.waitForSelector("#cards:not(.locked) .card", { timeout: 8000 }); // the cards are locked for 0.65 s
      await P.tap("#cards .card");
      await P.page.waitForTimeout(800);
    }
    const w2 = await P.ev(() => window.__riftTest.game.world?.wave);
    check(L, `${label}: picking the upgrade starts the next wave`, w2 === src.run.wave + 1, "wave " + w2);
    await P.ev(() => window.__riftTest.game.abandon());
    await P.page.waitForTimeout(1200);
    check(L, `${label}: abandon shows the run summary`, await P.vis("over"));
    await P.tap("#homeBtn");
    await common(P, label);
    await P.close();
  }
  // 2.4 corrupt JSON, 2.5 oversized save: must not brick the game and must not be lost
  for (const [label, raw] of [
    ["corrupt JSON", v222.slice(0, -40)],
    ["oversized save", JSON.stringify({ ...JSON.parse(v222), pad: "x".repeat(300000) })],
  ]) {
    const P = await open("desktop", { save: raw });
    await P.boot();
    const d = await P.ev(() => ({
      shards: window.__riftTest.store.data.shards,
      backups: Object.keys(localStorage)
        .filter((k) => k.startsWith("riftline.save.v1.backup-"))
        .map((k) => localStorage.getItem(k)),
    }));
    check(L, `${label}: falls back to a fresh profile`, d.shards === 0);
    check(
      L,
      `${label}: unreadable save is kept in a backup key (not overwritten)`,
      d.backups.some((b) => b === raw),
      `${d.backups.length} backup(s)`,
    );
    await common(P, label, true);
    await P.close();
  }
  // 2.6 hostile / out-of-range values
  {
    const hostile = JSON.stringify({
      v: 1,
      game: "riftline",
      shards: -5,
      weapon: "evil",
      weapons: { evil: true, ion: "yes" },
      workshop: { hull: 99, power: -3, nope: 2 },
      threatMax: 9,
      threat: 7,
      milestones: { fake: true },
      settings: { sfx: 9, music: -1, zoom: 0, quality: "extreme", autoFire: "no", contrast: 1 },
      stats: { runs: "5", bestWave: 1e99, kills: NaN, bosses: { "<img src=x>": 3, warden: 2 } },
      history: [1, "x", null, { wave: "a" }, { wave: 5, win: "yes" }],
      run: { v: 1, weapon: "pulse", wave: "x", hp: 5 },
      seen: { tutorial: "yes" },
    });
    const P = await open("desktop", { save: hostile });
    await P.boot();
    const d = await P.ev(() => window.__riftTest.store.data);
    const probs = [];
    d.shards !== 0 && probs.push("shards " + d.shards);
    d.weapon !== "pulse" && probs.push("weapon " + d.weapon);
    (d.weapons.evil || d.weapons.ion) && probs.push("weapons " + JSON.stringify(d.weapons));
    d.workshop.hull !== 5 && probs.push("hull " + d.workshop.hull);
    ("power" in d.workshop || "nope" in d.workshop) && probs.push("workshop " + JSON.stringify(d.workshop));
    (d.threatMax !== 5 || d.threat !== 5) && probs.push(`threat ${d.threat}/${d.threatMax}`);
    d.milestones.fake && probs.push("fake milestone");
    const s = d.settings;
    !(s.sfx >= 0 && s.sfx <= 1) && probs.push("sfx " + s.sfx);
    !(s.music >= 0 && s.music <= 1) && probs.push("music " + s.music);
    ![0.85, 1, 1.18].includes(s.zoom) && probs.push("zoom " + s.zoom);
    s.quality !== "auto" && probs.push("quality " + s.quality);
    (s.autoFire !== true || s.contrast !== false) && probs.push("booleans");
    (d.stats.runs !== 0 || !Number.isFinite(d.stats.bestWave) || d.stats.bestWave > 1e12) &&
      probs.push("stats " + d.stats.runs + "/" + d.stats.bestWave);
    Object.keys(d.stats.bosses).some((k) => /[<>]/.test(k)) && probs.push("boss key injection");
    d.run !== null && probs.push("invalid run kept");
    d.seen.tutorial === "yes" && probs.push("seen");
    !d.history.every((h) => h && typeof h === "object" && Number.isFinite(h.wave)) &&
      probs.push("history " + JSON.stringify(d.history));
    check(L, "hostile save: every value clamped to its valid range", !probs.length, probs.join("; "));
    await common(P, "hostile save");
    await P.close();
  }
  // 2.7 storage unavailable (private mode / blocked)
  {
    const P = await open("desktop", { block: true });
    await P.boot();
    check(L, "storage blocked: game still boots", await P.vis("home"));
    await P.nav("settings");
    check(L, "storage blocked: warning shown in settings", await P.vis("storageWarn"));
    check(L, "storage blocked: no page errors", !P.errors.length, P.errors.join(" | "));
    await P.close();
  }
});

/* ======================= 2b. workshop modules do what their text says ======================= */
await section("workshop", async (L) => {
  const P = await open("desktop");
  await P.boot();
  const r = await P.ev(() => {
    const T = window.__riftTest,
      max = (id) => T.workshopModules.find((a) => a.id === id).costs.length;
    const S = (ws, up = {}) => T.computeStats("pulse", up, ws),
      b = S({});
    const W = (ws) => new T.World({ weapon: "pulse", threat: 0, ws, seed: 7 });
    const res = {},
      near = (a, x) => Math.abs(a - x) < 1e-6;
    const L = (id) => max(id);
    res.hull = near(S({ hull: L("hull") }).maxHp, b.maxHp + 10 * L("hull"));
    // 2.3.5: Armor Core takes 4 %/level off enemy hits; lava and acid stay with Hazard Seal
    const hit = (ws, src) => {
      const w = W(ws);
      w.state = "fight";
      w.player.iT = 0;
      w.player.shield = false;
      const hp = w.player.hp;
      w.hurtPlayer(50, null, null, src);
      return hp - w.player.hp;
    };
    const ac = L("armorCore");
    res.armorCore =
      near(S({ armorCore: ac }).maxHp, b.maxHp) &&
      hit({ armorCore: ac }, "grunt") === Math.round(50 * (1 - 0.04 * ac)) &&
      hit({}, "grunt") === 50 &&
      hit({ armorCore: ac }, "lava") === 50;
    res.power = near(S({ power: L("power") }).dmgMul, b.dmgMul * (1 + 0.05 * L("power")));
    // 2.3.5: Arsenal Lab = fire rate (Power Core = damage)
    res.arsenalLab =
      near(S({ arsenalLab: L("arsenalLab") }).rateMul, b.rateMul * (1 + 0.06 * L("arsenalLab"))) &&
      near(S({ arsenalLab: L("arsenalLab") }).dmgMul, b.dmgMul);
    res.thrust = near(S({ thrust: L("thrust") }).speed, b.speed * (1 + 0.04 * L("thrust")));
    res.dash = near(S({ dash: L("dash") }).dashCd, b.dashCd * (1 - 0.08 * L("dash")));
    res.magnet = near(S({ magnet: L("magnet") }).magnet, b.magnet * (1 + 0.2 * L("magnet")));
    res.hazardSeal = near(S({ hazardSeal: L("hazardSeal") }).hazardResist, 0.15 * L("hazardSeal"));
    res.reroll = W({ reroll: L("reroll") }).rerolls === W({}).rerolls + L("reroll");
    res.insight = W({ insight: 1 }).makeOffer().length === 4 && W({}).makeOffer().length === 3;
    // Nova Cell: each wave starts with AT LEAST 25 %/level (carried charge is kept). 2.5.0 B: Rift
    // Battery and Reactor Core were merged into it; nothing adds charge on top any more.
    const nova = (ws, carry) => {
      const w = W(ws);
      w.player.nova = carry;
      w.startWave(2);
      return w.player.nova;
    };
    res.nova =
      nova({ nova: L("nova") }, 0) === Math.min(100, 25 * L("nova")) &&
      nova({ nova: 2 }, 80) === 80 &&
      nova({ nova: 1 }, 10) === 25 &&
      nova({}, 20) === 20;
    res.droneBay =
      S({ droneBay: 1 }, { wingman: 1 }).wingmen === S({}, { wingman: 1 }).wingmen + 1 &&
      S({ droneBay: 1 }).wingmen === 0;
    // Field Supply: +1 cache per level in every non-boss wave from wave 2 (boss waves stay
    // cache-free). 2.5.0 B: it took over Route Scanner, so every cache also holds +50 % shards/level.
    let nb = 0;
    const caches = (ws) => {
      let n = 0,
        v = 0,
        odd = 0,
        boss = 0;
      nb = 0;
      for (let wave = 2; wave <= 12; wave++) {
        const w = W(ws);
        w.startWave(wave);
        const cs = w.pickups.filter((p) => p.cache);
        if (w.bossPending) boss += cs.length;
        else {
          n += cs.length;
          nb++;
          for (const p of cs) if (p.kind === "shard") ((v += p.v), (odd += p.v % 2));
        }
      }
      return boss ? { n: -1 } : { n, v, odd };
    };
    const c0 = caches({}),
      cf = caches({ fieldSupply: 2 });
    res.fieldSupply =
      c0.n >= 0 &&
      cf.n === c0.n + 2 * nb &&
      cf.v > 2 * c0.v &&
      cf.odd === 0 &&
      near(S({ fieldSupply: 2 }).cacheValue, 2) &&
      near(b.cacheValue, 1);
    // 2.5.0 B: Starter Kit — one distinct common upgrade per level on a new run, none on a resumed one
    const kit = W({ starterKit: L("starterKit") }),
      kitIds = Object.keys(kit.up);
    const resumed = new T.World({
      snap: T.data.cleanRun({ v: 1, seed: 4, weapon: "pulse", wave: 6, hp: 50, nova: 0, up: {} }),
      ws: { starterKit: 3 },
    });
    res.starterKit =
      kitIds.length === L("starterKit") &&
      kitIds.every((id) => T.upgradesById[id].rarity === 1 && kit.up[id] === 1) &&
      kit.player.hp === kit.stats.maxHp &&
      !Object.keys(W({}).up).length &&
      !Object.keys(resumed.up).length;
    // 2.5.0 B: Hazard Attunement — +10 % damage and +0.5 HP/s per level, only within 2 m of a hazard
    const ha = L("hazardAttune"),
      aw = W({ hazardAttune: ha });
    aw.startWave(2);
    aw.hold = true;
    let dmgIn = 0;
    const baseStepDmg = aw.stats.dmgMul;
    aw.arena.vents.push({ x: aw.player.x + 3.3, y: aw.player.y, r: 1.5, phase: 0, period: 999 });
    {
      const st = aw.stats,
        orig = aw.updatePlayer;
      aw.updatePlayer = function (dt, inp) {
        dmgIn = st.dmgMul;
        return orig.call(this, dt, inp);
      };
      aw.step(1 / 60, {});
      delete aw.updatePlayer;
    }
    const onAt = aw.attuned;
    aw.arena.vents.pop();
    aw.step(1 / 60, {});
    res.hazardAttune =
      onAt &&
      !aw.attuned &&
      near(dmgIn, baseStepDmg * (1 + 0.1 * ha)) &&
      near(aw.stats.dmgMul, baseStepDmg) &&
      near(S({ hazardAttune: ha }).attuneRegen, 0.5 * ha) &&
      near(S({ hazardAttune: ha }).dmgMul, b.dmgMul);
    // 2.5.0 B: Emergency Shield — once per wave below 30 % hull: repair 8 %/level and block damage for 1 s/level
    const esL = L("emergencyShield"),
      ew = W({ emergencyShield: esL }),
      ep = ew.player;
    ew.state = "fight";
    ep.iT = 0;
    ep.shield = false;
    ew.hurtPlayer(ep.hp - 20, null, null, "grunt", true);
    const eHeal = ep.hp,
      eBlock = ew.hurtPlayer(30, null, null, "grunt", true) === false && ep.hp === eHeal,
      eT = ew.barrierT;
    ew.barrierT = 0;
    ep.hp = 20;
    ew.hurtPlayer(1, null, null, "grunt", true);
    res.emergencyShield =
      eHeal === 20 + Math.round(ew.stats.maxHp * 0.08 * esL) &&
      eBlock &&
      near(eT, esL) &&
      ep.hp === 19 &&
      (ew.startWave(2), !ew.barrierUsed);
    const rv = W({ revive: 1 });
    rv.state = "fight";
    rv.player.iT = 0;
    rv.player.shield = false;
    rv.hurtPlayer(99999, null, null, "grunt", true);
    const dv = W({});
    dv.state = "fight";
    dv.player.iT = 0;
    dv.player.shield = false;
    dv.hurtPlayer(99999, null, null, "grunt", true);
    res.revive = rv.player.alive && rv.player.hp === Math.round(rv.stats.maxHp * 0.5) && !dv.player.alive;
    res.salvage = true; // payout formula is verified by the post-run audit ("payout") after every run
    const untested = T.workshopModules.map((a) => a.id).filter((id) => !(id in res));
    return { res, untested };
  });
  for (const [id, ok] of Object.entries(r.res)) check(L, `module ${id} works as described`, ok);
  // every run upgrade changes at least one stat for every weapon ("heal" is an instant repair)
  const dead = await P.ev(() => {
    const T = window.__riftTest,
      out = [];
    for (const w of Object.keys(T.weaponDefs)) {
      const b = JSON.stringify(T.computeStats(w, {}, {}));
      for (const u of T.data.upgradeList)
        if (u.id !== "heal" && JSON.stringify(T.computeStats(w, { [u.id]: 1 }, {})) === b) out.push(`${u.id}@${w}`);
    }
    return out;
  });
  check(L, "every upgrade has an effect with every weapon", !dead.length, dead.slice(0, 12).join(", "));
  const heal = await P.ev(() => {
    const T = window.__riftTest,
      w = new T.World({ weapon: "pulse", threat: 0, ws: {}, seed: 3 });
    w.player.hp = 10;
    w.state = "choose";
    w.offer = ["heal"];
    w.choose("heal");
    return w.player.hp;
  });
  check(L, "Field Repair heals 45 % of max HP", heal === 10 + 45, "hp " + heal);
  check(L, "every workshop module has an effect test", !r.untested.length, r.untested.join(", "));
  check(L, "no page errors", !P.errors.length, P.errors.join(" | "));
  await P.close();
});

/* ======================= 2c. 2.5.0 B: merged workshop modules in an old save ======================= */
await section("workshop-merge", async (L) => {
  // Rift Battery + Reactor Core → Nova Cell, Route Scanner → Field Supply: every bought level of a
  // removed module is refunded at full price, the kept modules keep their levels, a saved run resumes
  const old = {
    v: 1,
    game: "riftline",
    shards: 300,
    weapon: "pulse",
    weapons: { pulse: true },
    seen: { tutorial: true },
    workshop: { hull: 2, nova: 2, fieldSupply: 1, riftBattery: 3, reactorCore: 1, routeScanner: 2 },
    run: {
      v: 1,
      seed: 77,
      weapon: "pulse",
      threat: 0,
      wave: 4,
      hp: 60,
      nova: 30,
      up: { dmg: 1 },
      offer: ["rate", "crit", "hp"],
    },
  };
  const refund = 260 + 540 + 980 + 1600 + (1800 + 3800);
  for (const profName of ["desktop", "phone"]) {
    const P = await open(profName, { save: JSON.stringify(old) });
    await P.boot();
    const told = await P.page
      .waitForFunction(
        () =>
          /Workshop update: Rift Battery, Reactor Core, Route Scanner were merged into Nova Cell and Field Supply\. All their levels refunded: \+[\d,.]+ shards/.test(
            document.getElementById("toasts").innerText,
          ),
        null,
        { timeout: 6000 },
      )
      .then(
        () => true,
        () => false,
      );
    check(L, `${profName}: a toast says which modules were merged and what was refunded`, told);
    const d = await P.ev(() => {
      const s = window.__riftTest.store.data;
      return {
        shards: s.shards,
        ws: s.workshop,
        stored: JSON.parse(localStorage.getItem("riftline.save.v1")),
        run: !!s.run,
      };
    });
    check(
      L,
      `${profName}: full price refunded (+${refund}), kept modules keep their levels`,
      d.shards === 300 + refund && JSON.stringify(d.ws) === JSON.stringify({ hull: 2, nova: 2, fieldSupply: 1 }),
      JSON.stringify({ shards: d.shards, ws: d.ws }),
    );
    check(
      L,
      `${profName}: converted save stored at once`,
      d.stored.shards === d.shards && !("riftBattery" in d.stored.workshop) && !("routeScanner" in d.stored.workshop),
    );
    await P.nav("workshop");
    const rows = await P.ev(() => [...document.querySelectorAll("#wsList .row b")].map((b) => b.textContent)),
      nMods = await P.ev(() => window.__riftTest.workshopModules.length);
    check(
      L,
      `${profName}: workshop lists every module once, none of the removed ones`,
      rows.length === nMods &&
        new Set(rows).size === nMods &&
        !rows.some((n) => /Rift Battery|Reactor Core|Route Scanner/.test(n)) &&
        ["Starter Kit", "Hazard Attunement", "Emergency Shield"].every((n) => rows.includes(n)),
      rows.join(", "),
    );
    const pips = await P.ev(() =>
      [...document.querySelectorAll("#wsList .row")]
        .map((r) => [r.querySelector("b").textContent, r.querySelectorAll(".pips i.on").length])
        .filter(([n]) => n === "Nova Cell" || n === "Field Supply"),
    );
    check(
      L,
      `${profName}: Nova Cell and Field Supply show their kept levels`,
      JSON.stringify(pips) ===
        JSON.stringify([
          ["Nova Cell", 2],
          ["Field Supply", 1],
        ]),
      JSON.stringify(pips),
    );
    await P.shot({ path: new URL(`./shots/workshop-merge-${profName}.png`, import.meta.url).pathname });
    await P.back("workshop");
    check(L, `${profName}: unfinished run offered`, await P.vis("continueBtn"));
    await P.tap("#continueBtn");
    await P.page.waitForTimeout(1200);
    const r = await P.ev(() => {
      const w = window.__riftTest.game.world;
      return (
        w && {
          wave: w.wave,
          choose: w.state === "choose",
          offer: w.offer,
          dmg: w.up.dmg,
          ups: Object.keys(w.up).length,
          nova: w.player.nova,
        }
      );
    });
    check(
      L,
      `${profName}: the saved run resumes at its upgrade choice, no Starter Kit on resume`,
      r && r.wave === 4 && r.choose && r.dmg === 1 && r.ups === 1,
      JSON.stringify(r),
    );
    if (r && r.choose) {
      await P.page.waitForSelector("#cards:not(.locked) .card", { timeout: 8000 }); // the cards are locked for 0.65 s
      await P.tap("#cards .card");
      await P.page.waitForTimeout(800);
    }
    const w2 = await P.ev(() => {
      const w = window.__riftTest.game.world;
      return w && { wave: w.wave, nova: Math.round(w.player.nova) };
    });
    check(
      L,
      `${profName}: next wave starts with the kept Nova Cell floor (50%)`,
      w2 && w2.wave === 5 && w2.nova >= 50,
      JSON.stringify(w2),
    );
    await P.ev(() => window.__riftTest.game.abandon());
    await P.page.waitForTimeout(1200);
    // reload: the notice is not shown a second time and nothing is refunded twice
    await P.page.reload();
    await P.page.waitForFunction(() => window.__riftTest && window.__riftTest.ui, null, { timeout: 90000 });
    await P.page.waitForTimeout(2500);
    const again = await P.ev(() => ({
      toast: /Workshop update/.test(document.getElementById("toasts").innerText),
      ws: window.__riftTest.store.data.workshop,
    }));
    check(
      L,
      `${profName}: after a reload no second notice, levels unchanged`,
      !again.toast && again.ws.nova === 2 && again.ws.fieldSupply === 1,
      JSON.stringify(again),
    );
    check(L, `${profName}: no page errors`, !P.errors.length, P.errors.join(" | "));
    await P.close();
  }
});

/* ======================= 3. menus: settings, workshop, weapons, import/export ======================= */
for (const profName of ["desktop", "phone"])
  await section(`ui-${profName}`, async (L) => {
    const P = await open(profName, { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
    await P.boot();
    // --- settings: every toggle changes data, storage and its runtime effect; survives reload
    await P.nav("settings");
    const toggles = {
      setAuto: "autoFire",
      setAssist: "assist",
      setShake: "shake",
      setNumbers: "numbers",
      setContrast: "contrast",
    };
    for (const [id, key] of Object.entries(toggles)) {
      const before = await P.ev((k) => window.__riftTest.store.data.settings[k], key);
      const el = await P.page.$("#" + id);
      const box = await el.boundingBox();
      await P.tap(
        box && box.width > 4
          ? "#" + id
          : await P.page.evaluateHandle((i) => document.getElementById(i).closest("label"), id),
      );
      const d = await P.ev(
        ([k, id]) => ({
          v: window.__riftTest.store.data.settings[k],
          ui: document.getElementById(id).checked,
          st: JSON.parse(localStorage.getItem("riftline.save.v1")).settings[k],
        }),
        [key, id],
      );
      check(
        L,
        `setting ${key}: toggles and is saved`,
        d.v === !before && d.ui === d.v && d.st === d.v,
        JSON.stringify(d),
      );
    }
    const fx = await P.ev(() => {
      const T = window.__riftTest;
      return {
        contrast: T.renderer.contrast,
        // 3.8.0: the left-handed and reduce-flashes settings are gone
        gone: !("swap" in T.store.data.settings) && !("calm" in T.store.data.settings),
        rows: !document.getElementById("setSwap") && !document.getElementById("setCalm"),
      };
    });
    check(L, "setting contrast takes effect immediately", fx.contrast, JSON.stringify(fx));
    check(L, "no left-handed or reduce-flashes setting any more", fx.gone && fx.rows, JSON.stringify(fx));
    // 3.1.0: the music block of the settings: a theme and a boss button for each biome; each toggles a looping
    // preview, only one plays at a time, and it ends when the settings screen closes
    const mpState = () =>
      P.ev(() => {
        const sound = window.__riftTest.game.sound;
        return {
          pv: sound.previewing(),
          kind: sound.playKind,
          on: [...document.querySelectorAll("#musicPreview button.on")].map(
            (b) => b.parentElement.dataset.biome + ":" + b.dataset.music,
          ),
        };
      });
    const mp = await P.ev(() => ({
      n: document.querySelectorAll("#musicPreview .seg button").length,
      biomes: [...document.querySelectorAll("#musicPreview .seg")].map((seg) => seg.dataset.biome).join(),
    }));
    check(
      L,
      "settings: a theme and a boss button for each of the five biomes",
      mp.n === 10 && mp.biomes === "yard,works,vault,marsh,void",
      JSON.stringify(mp),
    );
    await P.tap('#musicPreview [data-biome="vault"] [data-music="boss"]');
    let mps = await mpState();
    check(
      L,
      "music preview: a boss button starts the boss track of its biome",
      mps.pv && mps.pv.mode === "boss" && mps.pv.biome === "vault" && mps.kind === "boss" && eq(mps.on, ["vault:boss"]),
      JSON.stringify(mps),
    );
    await P.tap('#musicPreview [data-biome="yard"] [data-music="fight"]');
    mps = await mpState();
    check(
      L,
      "music preview: another button replaces it (one plays at a time)",
      mps.pv &&
        mps.pv.mode === "fight" &&
        mps.pv.biome === "yard" &&
        mps.kind === "fight" &&
        eq(mps.on, ["yard:fight"]),
      JSON.stringify(mps),
    );
    await P.tap('#musicPreview [data-biome="yard"] [data-music="fight"]');
    mps = await mpState();
    check(
      L,
      "music preview: the same button stops it",
      !mps.pv && mps.kind !== "fight" && eq(mps.on, []),
      JSON.stringify(mps),
    );
    await P.tap('#musicPreview [data-biome="marsh"] [data-music="boss"]');
    await P.back("settings");
    mps = await mpState();
    check(
      L,
      "music preview: leaving the settings screen stops it",
      !mps.pv && mps.kind !== "boss" && eq(mps.on, []),
      JSON.stringify(mps),
    );
    await P.nav("settings");
    await P.tap('#setQuality button[data-v="battery"]');
    await P.tap('#setZoom button[data-v="1.18"]');
    await P.ev(() => {
      for (const [id, v] of [
        ["setSfx", 0.25],
        ["setMusic", 0.15],
      ]) {
        const e = document.getElementById(id);
        e.value = v;
        e.dispatchEvent(new Event("input"));
        e.dispatchEvent(new Event("change"));
      }
    });
    const q = await P.ev(() => {
      const T = window.__riftTest,
        s = T.store.data.settings;
      return {
        q: s.quality,
        z: s.zoom,
        rz: T.renderer.zoom,
        sfx: T.game.sound.sfxVol,
        mus: T.game.sound.musVol,
        on: document.querySelector("#setQuality .on")?.dataset.v,
      };
    });
    check(
      L,
      "quality/zoom/volume controls apply",
      q.q === "battery" && q.z === 1.18 && q.rz === 1.18 && q.sfx === 0.25 && q.mus === 0.15 && q.on === "battery",
      JSON.stringify(q),
    );
    const want = await P.ev(() => JSON.stringify(window.__riftTest.store.data.settings));
    await P.page.reload();
    await P.page.waitForFunction(() => window.__riftTest && window.__riftTest.ui, null, { timeout: 90000 });
    await P.page.waitForTimeout(800);
    const after = await P.ev(() => {
      const T = window.__riftTest;
      T.ui.renderSettings();
      const s = T.store.data.settings;
      return {
        s: JSON.stringify(s),
        ui: ["setAuto", "setAssist", "setShake", "setNumbers", "setContrast"].every(
          (id, i) =>
            document.getElementById(id).checked === s[["autoFire", "assist", "shake", "numbers", "contrast"][i]],
        ),
        vol: T.game.sound.sfxVol,
        zoom: T.renderer.zoom,
      };
    });
    check(
      L,
      "all settings survive a reload (data, controls, effect)",
      after.s === want && after.ui && after.vol === 0.25 && after.zoom === 1.18,
      after.s === want ? "" : `${after.s} != ${want}`,
    );
    // --- workshop: buy every level; exact costs; persisted; MAX at the end
    await P.ev(() => {
      const T = window.__riftTest;
      T.store.data.shards = 100000;
      T.store.save("qa");
      T.ui.homeInit = false;
    });
    await P.nav("workshop");
    let buys = 0;
    for (let guard = 0; guard < 60; guard++) {
      const b = await P.page.$("#wsList [data-buy]:not([disabled])");
      if (!b) break;
      // 3.10.0: wait for the purchase itself instead of a fixed pause per tap (58 s for the 50-odd levels); a
      // double purchase still shows in buys !== levels below
      const owned = () => Object.values(window.__riftTest.store.data.workshop).reduce((a, b) => a + b, 0);
      const before = await P.ev(owned);
      await P.tap(b, { settle: false });
      await P.page.waitForFunction(
        (n) => Object.values(window.__riftTest.store.data.workshop).reduce((a, b) => a + b, 0) > n,
        before,
        { timeout: 10000 },
      );
      buys++;
    }
    if (P.prof.touch) await P.page.waitForTimeout(900); // the last tap's ghost click must not count after the check
    const ws = await P.ev(() => {
      const T = window.__riftTest,
        d = T.store.data;
      return {
        shards: d.shards,
        all: T.workshopModules.every((a) => d.workshop[a.id] === a.costs.length),
        total: T.workshopModules.reduce((s, a) => s + a.costs.reduce((x, y) => x + y, 0), 0),
        levels: T.workshopModules.reduce((s, a) => s + a.costs.length, 0),
        maxBtns: document.querySelectorAll("#wsList button[disabled]").length,
        stored:
          JSON.stringify(JSON.parse(localStorage.getItem("riftline.save.v1")).workshop) === JSON.stringify(d.workshop),
      };
    });
    check(
      L,
      "workshop: every level purchasable, exact cost, all MAX, saved",
      ws.all &&
        buys === ws.levels &&
        ws.shards === 100000 - ws.total &&
        ws.maxBtns === (await P.ev(() => window.__riftTest.workshopModules.length)) &&
        ws.stored,
      `${buys}/${ws.levels} buys, spent ${100000 - ws.shards}/${ws.total}`,
    );
    await P.back("workshop");
    // --- weapons: locked weapon cannot be bought without shards, can with
    const locked = await P.ev(() => {
      const T = window.__riftTest,
        d = T.store.data,
        order = T.data.weaponOrder;
      const i = order.findIndex((id) => !d.weapons[id]);
      return { i, id: order[i], cost: T.weaponDefs[order[i]].cost };
    });
    await P.ev(() => {
      const T = window.__riftTest;
      T.store.data.shards = 0;
      T.ui.homeInit = false;
      T.ui.renderHome && T.ui.renderHome();
    });
    for (let k = 0; k < locked.i; k++) await P.tap("#wNext");
    await P.tap("#wBuy").catch(() => {});
    check(
      L,
      "weapon: not unlocked without enough shards",
      !(await P.ev((id) => window.__riftTest.store.data.weapons[id], locked.id)),
    );
    await P.ev(() => {
      const T = window.__riftTest;
      T.store.data.shards = 50000;
      T.ui.renderHome();
    });
    await P.tap("#wBuy");
    const wb = await P.ev((id) => {
      const d = window.__riftTest.store.data;
      return { own: d.weapons[id], sel: d.weapon, shards: d.shards };
    }, locked.id);
    check(
      L,
      `weapon: buying ${locked.id} unlocks, selects and charges ${locked.cost}`,
      wb.own && wb.sel === locked.id && wb.shards === 50000 - locked.cost,
      JSON.stringify(wb),
    );
    // --- threat selector
    await P.ev(() => {
      const T = window.__riftTest;
      T.store.data.threatMax = 2;
      T.store.data.threat = 0;
      T.ui.renderHome();
    });
    await P.tap("#tNext");
    check(
      L,
      "threat: next raises threat, capped by unlocked max",
      (await P.ev(() => window.__riftTest.store.data.threat)) === 1,
    );
    await P.ev(() => {
      const T = window.__riftTest;
      T.store.data.threat = 0;
      T.store.save("qa");
      T.ui.renderHome();
    });
    // --- export
    await P.nav("settings");
    await P.tap("#backupBtn");
    const exp = await P.ev(() => document.getElementById("saveExport")?.value || "");
    let expOk = false;
    try {
      const j = JSON.parse(exp);
      expOk = j.game === "riftline" && j.shards === (await P.ev(() => window.__riftTest.store.data.shards));
    } catch {}
    check(L, "export: dialog shows the complete save as JSON", expOk, exp.length + " chars");
    await P.dlg("Close");
    // --- import: invalid text is rejected without touching the save
    const shardsBefore = await P.ev(() => window.__riftTest.store.data.shards);
    await P.tap("#restoreBtn");
    await P.page.fill("#saveImport", '{"not":"a save"}');
    await P.dlg("Restore");
    check(
      L,
      "import: invalid text rejected with a message",
      (await P.dlgTitle()) === "Invalid save" &&
        (await P.ev(() => window.__riftTest.store.data.shards)) === shardsBefore,
    );
    await P.dlg("OK").catch(() => P.page.keyboard.press("Escape"));
    // --- import: a real 2.2.2 export is accepted
    const imp = JSON.parse(fs.readFileSync(FIX + "save-v222.json", "utf8"));
    imp.shards = 4321;
    await P.tap("#restoreBtn");
    await P.page.fill("#saveImport", JSON.stringify(imp));
    await P.dlg("Restore");
    await P.dlg("Restore");
    const im = await P.ev(() => ({
      shards: window.__riftTest.store.data.shards,
      st: JSON.parse(localStorage.getItem("riftline.save.v1")).shards,
      home: !document.getElementById("home").hidden,
      hist: Array.isArray(window.__riftTest.store.data.history),
      weapon: window.__riftTest.store.data.weapon,
      refund: 1250 - window.__riftTest.weaponDefs.tesla.cost,
    }));
    // 2.4.0: the export owns the retired Ion Repeater -> Arc Caster plus the price difference, on import too
    check(
      L,
      "import: old (2.2.2) export restores progress (Ion Repeater → Arc Caster + refund) and returns home",
      im.shards === 4321 + im.refund && im.st === im.shards && im.weapon === "tesla" && im.home && im.hist,
      JSON.stringify(im),
    );
    // --- reset keeps settings, wipes progress (two confirmations)
    await P.nav("settings");
    const setB = await P.ev(() => JSON.stringify(window.__riftTest.store.data.settings));
    await P.tap("#resetBtn");
    await P.dlg("Continue");
    await P.dlg("Reset everything");
    const rs = await P.ev(() => {
      const d = window.__riftTest.store.data;
      return { shards: d.shards, ws: Object.keys(d.workshop).length, set: JSON.stringify(d.settings), run: d.run };
    });
    check(
      L,
      "reset: progress wiped, settings kept",
      rs.shards === 0 && rs.ws === 0 && rs.set === setB && rs.run === null,
      JSON.stringify({ ...rs, set: rs.set === setB }),
    );
    // --- replay tutorial
    await P.ev(() => {
      window.__riftTest.store.data.seen.tutorial = true;
    });
    await P.tap("#replayTutBtn");
    await P.dlg("Enable");
    check(L, "replay tutorial: queued", (await P.ev(() => window.__riftTest.store.data.seen.tutorial)) === false);
    check(L, "no page errors", !P.errors.length, P.errors.join(" | "));
    await P.close();
  });

/* ======================= 4. run flow ======================= */
for (const profName of ["desktop", "phone"])
  await section(`run-${profName}`, async (L) => {
    const P = await open(profName, { save: JSON.stringify({ v: 1, game: "riftline", shards: 0, seen: {} }) });
    await P.boot();
    const pause = async () => {
      if (P.prof.touch) await P.tap("#pauseBtn");
      else {
        await P.page.keyboard.press("Escape");
        await P.page.waitForTimeout(300);
      }
    };
    const waitScreen = (id, ms = 15000) =>
      P.page
        .waitForFunction((i) => !document.getElementById(i).hidden, id, { timeout: ms })
        .then(
          () => true,
          () => false,
        );
    // tutorial on the first ever run
    await P.tap("#playBtn");
    await P.page.waitForTimeout(900);
    check(
      L,
      "first run shows the tutorial coach",
      (await P.ev(() => !!window.__riftTest.game.tut)) && (await P.vis("coach")),
    );
    // 2.3.4: the coach speaks the player's input (keys on PC, dragging on touch)
    const coach = await P.ev(() => document.getElementById("coachText").textContent);
    check(
      L,
      `tutorial explains the ${P.prof.touch ? "touch" : "keyboard"} controls`,
      P.prof.touch ? /^Drag /.test(coach) : /W A S D/.test(coach),
      coach,
    );
    await P.ev(() => {
      const g = window.__riftTest.game;
      if (g.tut) g.tut.step = 4;
    });
    // restart from pause
    const w0 = await P.ev(() => (window.__riftTest.game.world.__qa = 1));
    await pause();
    await P.tap("#restartBtn");
    await P.dlg("Restart");
    await P.page.waitForTimeout(800);
    const rst = await P.ev(() => {
      const g = window.__riftTest.game;
      return { fresh: !g.world.__qa, wave: g.world.wave, mode: g.mode, paused: g.paused };
    });
    check(
      L,
      "pause → restart gives a fresh run at wave 1",
      rst.fresh && rst.wave === 1 && rst.mode === "game" && !rst.paused,
      JSON.stringify(rst),
    );
    // wave clear -> choose -> reroll
    await P.ev(CLEAR);
    check(L, "wave clear opens the upgrade choice", await waitScreenGame(P.page, "choose", 8));
    await P.page.waitForTimeout(700);
    const rr0 = await P.ev(() => {
      const w = window.__riftTest.game.world;
      w.rerolls = 2;
      window.__riftTest.ui.renderChoose?.(w);
      return {
        n: w.rerolls,
        offer: w.offer.map((o) => (o.u && o.u.id) || o.id || o.name || JSON.stringify(o).slice(0, 24)).join(),
      };
    });
    await P.tap("#rerollBtn");
    const rr1 = await P.ev(() => {
      const w = window.__riftTest.game.world;
      return {
        n: w.rerolls,
        offer: w.offer.map((o) => (o.u && o.u.id) || o.id || o.name || JSON.stringify(o).slice(0, 24)).join(),
        cards: [...document.querySelectorAll("#cards .card")].length,
      };
    });
    check(
      L,
      "reroll: uses one reroll and redraws the cards",
      rr1.n === rr0.n - 1 && rr1.cards >= 3,
      `${rr0.n}→${rr1.n}; ${rr0.offer} → ${rr1.offer}`,
    );
    // boss wave: jump to wave 10 via the choice. Freshly drawn cards ignore clicks for
    // 650 ms (anti-misclick lock), so wait for the lock after the reroll to end.
    await P.page.waitForFunction(() => !document.getElementById("cards").classList.contains("locked"), null, {
      timeout: 5000,
    });
    // 3.1.0: record every music switch of the boss wave (the boss track must start when the boss appears)
    await P.ev(() => {
      const T = window.__riftTest,
        sound = T.game.sound,
        base = sound.setMusic.bind(sound);
      window.__qaMusic = [];
      sound.setMusic = (mode, biome) => {
        window.__qaMusic.push({ mode, biome, boss: !!T.game.world?.boss });
        return base(mode, biome);
      };
    });
    await P.ev(() => {
      window.__riftTest.game.world.wave = 9;
    });
    await P.page.waitForSelector("#cards:not(.locked) .card", { timeout: 8000 }); // the cards are locked for 0.65 s
    await P.tap("#cards .card");
    await P.page.waitForTimeout(600);
    const bw = await P.ev(() => {
      const w = window.__riftTest.game.world;
      w.god = true;
      return { wave: w.wave, boss: !!(w.bossPending || w.boss) };
    });
    check(L, "wave 10 is a boss wave", bw.wave === 10 && bw.boss, JSON.stringify(bw));
    // 2.3.6: input held through the camera pan to the boss keeps steering. The pan used to drop all
    // input: a finger on the move side did nothing until it was lifted, held keys stopped.
    const hold = await holdMoveRight(P);
    const pan = await P.page
      .waitForFunction(() => !!window.__riftTest.game.intro, null, { timeout: 20000 })
      .then(
        () => true,
        () => false,
      );
    await P.page.waitForFunction(() => !window.__riftTest.game.intro, null, { timeout: 20000 }).catch(() => {});
    await hold.keep(300);
    const mx = await P.ev(SAMPLE_MX);
    check(
      L,
      "input held through the boss intro still steers",
      pan && mx > 0.5,
      `intro seen ${pan}, move x ${mx.toFixed(2)}`,
    );
    if (!P.prof.touch) {
      // 2.3.6: held keys survive pause and resume (only the key that auto-repeats came back)
      await P.page.keyboard.press("Escape");
      await P.page.waitForTimeout(250);
      await P.page.keyboard.press("Escape");
      await P.page.waitForTimeout(250);
      const mx2 = await P.ev(SAMPLE_MX);
      check(L, "a key held through pause and resume still counts", mx2 > 0.5, `move x ${mx2.toFixed(2)}`);
    }
    await hold.release();
    const bossUp = await P.page
      .waitForFunction(
        () => {
          const w = window.__riftTest.game.world;
          return w.boss && !document.getElementById("bossBar").hidden;
        },
        null,
        { timeout: 30000 },
      )
      .then(
        () => true,
        () => false,
      );
    check(L, "boss spawns with its health bar", bossUp);
    const bm = await P.ev(() => {
      const sound = window.__riftTest.game.sound;
      return { calls: window.__qaMusic, kind: sound.playKind, over: sound.bossOver, step: sound.step };
    });
    check(
      L,
      "boss music: the calm theme at the wave start, the boss track exactly when the boss appears",
      bm.calls[0].mode === "fight" &&
        !bm.calls[0].boss &&
        bm.calls.filter((call) => call.mode === "boss").length >= 1 &&
        bm.calls.find((call) => call.mode === "boss").boss &&
        bm.calls.find((call) => call.mode === "boss").biome === bm.calls[0].biome &&
        bm.kind === "boss" &&
        !bm.over,
      JSON.stringify(bm),
    );
    const cachesInBoss = await P.ev(() => {
      const w = window.__riftTest.game.world;
      return JSON.stringify(w.pickups.filter((p) => /cache/i.test(p.k || p.kind || p.type || "")).length);
    });
    check(L, "no wave cache during the boss wave", cachesInBoss === "0", cachesInBoss);
    await P.ev(CLEAR);
    check(L, "boss kill → upgrade choice", await waitScreenGame(P.page, "choose", 8));
    const be = await P.ev(() => {
      const sound = window.__riftTest.game.sound;
      return { kind: sound.playKind, over: sound.bossOver, heat: sound.heat };
    });
    check(
      L,
      "boss music: the boss track resolves into the calm theme when the boss is dead",
      be.over && be.kind === "fight" && be.heat === 0,
      JSON.stringify(be),
    );
    await P.page.waitForTimeout(600);
    // final boss (wave 20) → victory → endless
    await P.ev(() => {
      window.__riftTest.game.world.wave = 19;
    });
    await P.page.waitForSelector("#cards:not(.locked) .card", { timeout: 8000 }); // the cards are locked for 0.65 s
    await P.tap("#cards .card");
    await P.page.waitForTimeout(600);
    await P.ev(() => {
      window.__riftTest.game.world.god = true;
    });
    await P.page.waitForFunction(() => window.__riftTest.game.world.boss, null, { timeout: 30000 }).catch(() => {});
    await P.ev(CLEAR);
    const won = await waitScreenGame(P.page, "over", 9);
    const vs = await P.ev(() => ({
      state: window.__riftTest.game.world?.state,
      title: document.getElementById("overTitle").textContent,
    }));
    check(L, "clearing wave 20 is a victory", won && vs.state === "victory", JSON.stringify(vs));
    await P.page.waitForTimeout(1200);
    check(L, "victory screen offers Endless", await P.vis("endlessBtn"));
    await P.tap("#endlessBtn");
    check(L, "Endless starts with a bonus upgrade choice", await waitScreen("choose", 8000));
    await P.page.waitForTimeout(700);
    await P.page.waitForSelector("#cards:not(.locked) .card", { timeout: 8000 }); // the cards are locked for 0.65 s
    await P.tap("#cards .card");
    await P.page.waitForTimeout(1000);
    const en = await P.ev(() => {
      const w = window.__riftTest.game.world;
      return {
        endless: w.endless,
        wave: w.wave,
        hud: !document.getElementById("hud").hidden,
        over: !document.getElementById("over").hidden,
      };
    });
    check(L, "Endless continues the same run", en.endless && en.wave === 21 && en.hud && !en.over, JSON.stringify(en));
    // abandon from pause
    await pause();
    await P.tap("#abandonBtn");
    await P.dlg("Abandon");
    const ab = (await waitScreen("over", 8000)) || (await P.vis("home"));
    const st = await P.stored();
    check(
      L,
      "pause → abandon ends the run and clears the saved run",
      ab && st.run === null,
      "run " + JSON.stringify(st.run),
    );
    if (await P.vis("over")) await P.tap("#homeBtn");
    // death → retry
    await P.tap("#playBtn");
    await P.page.waitForTimeout(800);
    await P.ev(() => {
      const w = window.__riftTest.game.world;
      w.god = false;
      w.player.iT = 0;
      w.player.dashT = 0;
      w.player.shield = false;
      w.hurtPlayer(99999, null, null, "grunt", true);
    });
    check(L, "death shows the game-over screen", await waitScreen("over"));
    await P.page.waitForTimeout(1200);
    await P.tap("#retryBtn");
    await P.page.waitForTimeout(800);
    const rt = await P.ev(() => {
      const g = window.__riftTest.game;
      return { mode: g.mode, wave: g.world && g.world.wave, over: !document.getElementById("over").hidden };
    });
    check(L, "retry starts a new run", rt.mode === "game" && rt.wave === 1 && !rt.over, JSON.stringify(rt));
    await P.ev(() => window.__riftTest.game.abandon());
    await P.page.waitForTimeout(800);
    if (await P.vis("over")) await P.tap("#homeBtn");
    // records & history
    await P.nav("records");
    const hs = await P.ev(() => ({
      n: window.__riftTest.store.data.history.length,
      rows: document.querySelectorAll("#runHist > *").length,
      ms: document.querySelectorAll("#msList .row").length,
      msWant: window.__riftTest.data.milestones.length,
    }));
    check(L, "records: recent runs listed", hs.n >= 3 && hs.rows >= Math.min(hs.n, 3), JSON.stringify(hs));
    check(L, "records: every milestone rendered", hs.ms === hs.msWant, `${hs.ms}/${hs.msWant}`);
    // claim a milestone through the UI
    const claim = await P.page.$("#msList [data-claim]");
    if (claim) {
      const b0 = await P.ev(() => window.__riftTest.store.data.shards);
      const id = await claim.getAttribute("data-claim");
      await P.tap(claim);
      const c = await P.ev((id) => {
        const d = window.__riftTest.store.data,
          m = window.__riftTest.data.milestones.find((x) => x.id === id);
        return { done: d.milestones[id], gain: d.shards, reward: m.reward };
      }, id);
      check(
        L,
        "milestone claim pays its reward once",
        c.done === true && c.gain - b0 === c.reward,
        JSON.stringify({ ...c, b0 }),
      );
    } else L("INFO", "milestone claim", "nothing claimable in this run");
    const aud = await P.ev(() => window.__riftTest.lastRunAudit);
    check(
      L,
      "last run audit has no FAIL",
      aud && !aud.checks.some((c) => c.st === "FAIL"),
      aud
        ? aud.checks
            .filter((c) => c.st !== "OK")
            .map((c) => c.id + ":" + c.st)
            .join(", ")
        : "none",
    );
    check(L, "no page errors", !P.errors.length, P.errors.slice(0, 4).join(" | "));
    await P.close();
  });

/* ======================= 4b. visual criteria ======================= */
await section("visual", async (L) => {
  // biomes: grid colours must be clearly different (ΔE >= 30) — identity check
  {
    const P = await open("desktop");
    await P.boot();
    const q = await P.ev(() => window.__riftTest.data.rlBiomeDistinct());
    check(L, "every biome is recognisable (grid colours ΔE ≥ 30 apart)", !q.length, q.join(", "));
    await P.close();
  }
  // upgrade cards on wide screens: one row, equal height, content fills the card
  const sizes = [
    [1920, 955, 0],
    [1920, 955, 1],
    [1440, 900, 0],
    [1366, 768, 1],
    [1280, 640, 0],
    [1024, 768, 0],
  ];
  for (const [w, h, insight] of sizes) {
    PROFILES.tmp = { viewport: { width: w, height: h }, touch: w < 1100 && h === 768, mobile: w < 1100 && h === 768 };
    const P = await open("tmp", {
      save: JSON.stringify({
        v: 1,
        game: "riftline",
        seen: { tutorial: true },
        workshop: insight ? { insight: 1 } : {},
      }),
    });
    await P.boot();
    await P.ev(() => window.__riftTest.game.startRun({}));
    await P.page.waitForTimeout(800);
    await P.ev(CLEAR_TO_CHOICE);
    await P.page.waitForFunction(() => !document.getElementById("choose").hidden, null, { timeout: 30000 });
    await P.page.waitForTimeout(600);
    await P.ev(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest("#cards"))
          .map((a) => a.finished),
      ),
    );
    const r = await P.ev(() => {
      const cards = [...document.querySelectorAll("#cards .card")],
        rr = cards.map((c) => c.getBoundingClientRect());
      const fill = cards.map((c) => {
        const ch = [...c.children].map((x) => x.getBoundingClientRect());
        const top = Math.min(...ch.map((x) => x.top)),
          bot = Math.max(...ch.map((x) => x.bottom));
        return (bot - top) / c.getBoundingClientRect().height;
      });
      const rb = document.getElementById("rerollBtn").getBoundingClientRect();
      return {
        n: cards.length,
        oneRow: rr.every((x) => Math.abs(x.top - rr[0].top) < 2),
        tops: rr.map((x) => Math.round(x.top)).join("/"),
        hover: cards.map((c) => (c.matches(":hover") ? 1 : 0)).join(""),
        eqH: rr.every((x) => Math.abs(x.height - rr[0].height) < 2),
        minFill: Math.min(...fill),
        h: Math.round(rr[0].height),
        w: Math.round(rr[0].width),
        clipped: cards.some((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1),
        reroll: rb.bottom <= innerHeight && rb.top >= rr[0].bottom,
        inView: rr.every((x) => x.left >= 0 && x.right <= innerWidth && x.bottom <= innerHeight),
      };
    });
    const tag = `${w}×${h} · ${r.n} cards`;
    check(
      L,
      `cards ${tag}: one row, equal height, fully visible`,
      r.oneRow && r.eqH && r.inView && !r.clipped,
      JSON.stringify(r),
    );
    check(
      L,
      `cards ${tag}: content fills the card (≥ 50 %)`,
      r.minFill >= 0.5,
      `fill ${(r.minFill * 100).toFixed(0)} % · card ${r.w}×${r.h}`,
    );
    check(L, `cards ${tag}: reroll below the cards and on screen`, r.reroll);
    await P.shot({ path: new URL(`./shots/qa-cards-${w}x${h}-${r.n}.png`, import.meta.url).pathname });
    await P.close();
  }
});

/* ======================= 4c. layout criteria per device ======================= */
for (const [name, vp, touch] of [
  ["pc", { width: 1920, height: 955 }, false],
  ["small", { width: 640, height: 360 }, true],
  ["land", { width: 844, height: 390 }, true],
])
  await section(`layout-${name}`, async (L) => {
    PROFILES["L" + name] = { viewport: vp, touch, mobile: touch };
    const P = await open("L" + name, {
      save: JSON.stringify({ v: 1, game: "riftline", shards: 5000, seen: { tutorial: true } }),
    });
    await P.boot();
    // settings: every switch/slider sits on the same line as its label, at the right edge
    await P.ev(() => window.__riftTest.ui.show("settings"));
    await P.page.waitForTimeout(700);
    const rows = await P.ev(() =>
      [...document.querySelectorAll("#settings label.set-row")].map((r) => {
        const t = r.firstElementChild.getBoundingClientRect(),
          c = r.lastElementChild.getBoundingClientRect(),
          R = r.getBoundingClientRect();
        const cy = (c.top + c.bottom) / 2;
        return {
          n: r.textContent.trim().slice(0, 18),
          ok: cy >= t.top - 2 && cy <= t.bottom + 2 && R.right - c.right < 24 && c.left > t.left + 40,
        };
      }),
    );
    const badRows = rows.filter((r) => !r.ok).map((r) => r.n);
    check(
      L,
      `settings: all ${rows.length} switches/sliders beside their label, right-aligned`,
      !badRows.length,
      badRows.join(", "),
    );
    // menu pages: no row stretched across a huge screen (readability)
    for (const [pg, sel] of [
      ["workshop", ".row"],
      ["records", ".row"],
      ["settings", ".set-row"],
    ]) {
      await P.ev((pg) => {
        window.__riftTest.ui.show(pg);
      }, pg);
      await P.page.waitForTimeout(700);
      const wmax = await P.ev(
        ([pg, sel]) =>
          Math.max(...[...document.querySelectorAll(`#${pg} ${sel}`)].map((r) => r.getBoundingClientRect().width)),
        [pg, sel],
      );
      check(L, `${pg}: list rows at most 900 px wide`, wmax <= 900, `widest row ${Math.round(wmax)} px`);
    }
    // 2.3.4: the settings header lines up with its list (2.3.3 had a 760 px header over a 1240 px list)
    await P.ev(() => window.__riftTest.ui.show("settings"));
    await P.page.waitForTimeout(500);
    const sx = await P.ev(() => {
      const h = document.querySelector("#settings > .topbar").getBoundingClientRect(),
        b = document.querySelector("#settings > .scroll").getBoundingClientRect();
      return { head: Math.round(h.left), list: Math.round(b.left) };
    });
    check(L, "settings: header and list share the left edge", Math.abs(sx.head - sx.list) <= 2, JSON.stringify(sx));
    // 2.3.4: record tiles in one row show their numbers on one line, even when a label wraps
    await P.ev(() => {
      const T = window.__riftTest;
      T.store.data.stats.runs = 12;
      T.ui.show("records");
    });
    await P.page.waitForTimeout(500);
    const tiles = await P.ev(() => {
      const v = [...document.querySelectorAll("#statGrid .cell .v")].map((e) => e.getBoundingClientRect());
      const top = Math.min(...v.map((r) => r.top));
      const row = v.filter((r) => r.top < top + 40);
      return {
        n: row.length,
        spread: Math.round(Math.max(...row.map((r) => r.bottom)) - Math.min(...row.map((r) => r.bottom))),
      };
    });
    check(L, "records: numbers of the first tile row are aligned", tiles.spread <= 2, JSON.stringify(tiles));
    // 2.3.6: workshop prices from "50" to "6800" share one button width
    await P.ev(() => window.__riftTest.ui.show("workshop"));
    await P.page.waitForTimeout(400);
    const pw = await P.ev(() =>
      [...document.querySelectorAll("#wsList .row .btn")].map((b) => Math.round(b.getBoundingClientRect().width)),
    );
    check(
      L,
      "workshop: price buttons share one width",
      Math.max(...pw) - Math.min(...pw) <= 1,
      [...new Set(pw)].join("/"),
    );
    await P.ev(() => window.__riftTest.ui.show("home"));
    await P.page.waitForTimeout(900);
    // 2.3.6: the drone preview stays off the RIFTLINE title (two-column homes put it on the "E")
    const dr = await P.ev(() => {
      const r = window.__riftTest.renderer,
        o = {};
      r.project(0, 0.5, 0, o);
      const l = document.querySelector("#home .logo").getBoundingClientRect();
      return { x: Math.round(o.x), y: Math.round(o.y), logo: [l.left, l.top, l.right, l.bottom].map(Math.round) };
    });
    const onLogo = dr.x > dr.logo[0] - 30 && dr.x < dr.logo[2] + 30 && dr.y > dr.logo[1] - 30 && dr.y < dr.logo[3] + 30;
    check(L, "home: the drone preview is not on the title", !onLogo, JSON.stringify(dr));
    if (touch) {
      // 2.3.6: weapon/threat arrows shrink to 27–32 px on landscape phones; their tap area stays ≥ 44 px
      const ar = await P.ev(() =>
        [...document.querySelectorAll("#home .arrow")]
          .filter((a) => a.offsetWidth)
          .map((a) => {
            const r = a.getBoundingClientRect(),
              s = getComputedStyle(a, "::after");
            return {
              id: a.id,
              box: Math.round(Math.min(r.width, r.height)),
              tap: Math.round(Math.min(parseFloat(s.width) || r.width, parseFloat(s.height) || r.height, 99)),
            };
          }),
      );
      const small = ar.filter((a) => Math.max(a.box, a.tap) < 44);
      check(
        L,
        "home: weapon/threat arrows have a tap area of at least 44 px",
        ar.length === 4 && !small.length,
        ar.map((a) => `${a.id} ${a.box}/${a.tap}`).join(", "),
      );
    }
    // hints: hidden behind the pause menu; below the boss bar in a boss fight
    await P.ev(() => window.__riftTest.game.startRun({}));
    await P.page.waitForTimeout(800);
    // 2.3.6: the hull value and the wave label keep apart (they touched on 360 px phones)
    await P.ev(() => {
      const w = window.__riftTest.game.world;
      w.wave = 10;
      w.player.hp = w.stats.maxHp = 230;
    });
    await P.page.waitForTimeout(400);
    const hud = await P.ev(() => {
      const n = document.getElementById("hpNum").getBoundingClientRect(),
        w = document.getElementById("waveLabel").getBoundingClientRect();
      return {
        hullEnd: Math.round(n.right),
        waveStart: Math.round(w.left),
        text: document.getElementById("waveLabel").textContent,
      };
    });
    check(L, "HUD: hull value and wave label do not touch", hud.waveStart - hud.hullEnd >= 6, JSON.stringify(hud));
    // 3.0.0: the GADGET button: visible, inside the screen, clear of the other controls, named, with pips (once the
    // HUD has drawn a frame: with software WebGL the first frame of a run can take longer than the waits above)
    await P.page
      .waitForFunction(() => document.querySelectorAll("#gadgetPips i").length > 0, null, { timeout: 15000 })
      .catch(() => {});
    const gad = await P.ev(() => {
      const T = window.__riftTest,
        w = T.game.world,
        box = (e) => {
          const r = e.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        },
        hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t,
        btn = document.getElementById("gadgetBtn"),
        me = box(btn),
        others = ["novaBtn", "dashBtn", "pauseBtn", "shardChip"]
          .map((id) => document.getElementById(id))
          .concat([...document.querySelectorAll("#hud .hp-block, #hud .wave-block")])
          .filter((e) => e && e.offsetWidth)
          .map((e) => ({ id: e.id || e.className, r: box(e) })),
        pips = document.querySelectorAll("#gadgetPips i"),
        key = document.getElementById("gadgetKey");
      return {
        shown: !!(btn.offsetWidth && btn.offsetHeight),
        inside: me.l >= 0 && me.t >= 0 && me.r <= innerWidth && me.b <= innerHeight,
        size: Math.round(me.r - me.l),
        name: btn.getAttribute("aria-label"),
        overlap: others.filter((o) => hit(me, o.r)).map((o) => o.id),
        pips: pips.length,
        lit: [...pips].filter((i) => i.classList.contains("on")).length,
        want: w.stats.gadgetMax,
        key: getComputedStyle(key).display !== "none" ? key.textContent : "",
      };
    });
    check(
      L,
      "GADGET button: visible, on screen, named, clear of NOVA/DASH/pause/hull/wave",
      gad.shown && gad.inside && /singularity/i.test(gad.name) && !gad.overlap.length,
      JSON.stringify(gad),
    );
    check(L, "GADGET button: one pip per charge, all lit at the start", gad.pips === gad.want && gad.lit === gad.want);
    check(
      L,
      touch ? "GADGET button: no key hint on touch screens" : "GADGET button: shows the key hint G",
      touch ? gad.key === "" : gad.key === "G",
      JSON.stringify(gad.key),
    );
    if (touch) {
      check(L, "GADGET button: touch target of at least 44 px", gad.size >= 44, String(gad.size));
      // a tap on the button queues a throw (the game loop consumes the flag, so the call is recorded)
      const tapped = await P.ev(() => {
        const input = window.__riftTest.game.input,
          press = input.press,
          seen = [];
        input.press = (action) => {
          seen.push(action);
          return press.call(input, action);
        };
        document.getElementById("gadgetBtn").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        input.press = press;
        return seen;
      });
      check(L, "GADGET button: a tap queues a throw", tapped.join() === "gadget", tapped.join());
    }
    // 2.3.6: gameplay hints stay off the drone (two hints hid it on landscape phones)
    await P.ev(() => {
      const T = window.__riftTest,
        w = T.game.world;
      w.god = true;
      w.hold = true;
      w.planIdx = 0;
      T.ui.toast(
        "NEW · SWARMER — Swarmers rush in packs. Keep moving and let splash damage thin them out.",
        "intro",
        8000,
      );
      T.ui.toast("Tip: SPACE dashes — it makes you untouchable for a moment.", "", 8000);
    });
    await P.page.waitForTimeout(1200);
    const cover = await P.ev(() => {
      const g = window.__riftTest.game,
        p = g.world.player,
        o = {};
      window.__riftTest.renderer.project(p.x, 0.6, p.y, o);
      const t = [...document.querySelectorAll("#toasts .toast")]
        .filter((x) => getComputedStyle(x).display !== "none")
        .map((x) => x.getBoundingClientRect());
      return {
        drone: [Math.round(o.x), Math.round(o.y)],
        hit: t.some((r) => o.x > r.left - 30 && o.x < r.right + 30 && o.y > r.top - 30 && o.y < r.bottom + 30),
        shown: t.length,
      };
    });
    check(L, "hints do not cover the drone", !cover.hit && cover.shown >= 1, JSON.stringify(cover));
    if (touch) {
      // 2.3.6: touches beside NOVA/DASH reach the aim side (the button box swallowed ~25 % of its area)
      const dead = await P.ev(() => {
        const a = document.querySelector("#hud .act").getBoundingClientRect();
        let n = 0,
          all = 0;
        for (let x = a.left + 1; x < a.right; x += 3)
          for (let y = a.top + 1; y < a.bottom; y += 3) {
            all++;
            const e = document.elementFromPoint(x, y);
            if (e && !e.closest("#novaBtn, #dashBtn, #gadgetBtn") && e.id !== "touch") n++;
          }
        return Math.round((100 * n) / all);
      });
      check(
        L,
        "every touch near NOVA/DASH/GADGET hits a button or the aim side",
        dead === 0,
        `${dead} % of the button box is dead`,
      );
    }
    await P.ev(() => {
      const w = window.__riftTest.game.world;
      w.hold = false;
    });
    await P.ev(() => {
      window.__riftTest.ui.toast("QA hint that must not cover the pause menu", "intro", 8000);
      window.__riftTest.game.pause();
      window.__riftTest.ui.toast("QA feedback", "good", 8000);
    });
    await P.page.waitForTimeout(400);
    const tp = await P.ev(() => {
      const t = [...document.querySelectorAll("#toasts .toast")],
        vis = (x) => x && getComputedStyle(x).visibility !== "hidden";
      return {
        hint: vis(t.find((x) => x.classList.contains("intro"))),
        ui: vis(t.find((x) => x.textContent === "QA feedback")),
      };
    });
    check(L, "hints are hidden while the pause menu is open", !tp.hint, JSON.stringify(tp));
    // 2.8.1: UI feedback (for example "Copied" in the pause settings) stays visible
    check(L, "UI feedback toasts stay visible in the pause menu", tp.ui, JSON.stringify(tp));
    await P.ev(() => {
      const g = window.__riftTest.game;
      g.paused = false;
      window.__riftTest.ui.hidePause();
    });
    await P.ev(CLEAR_TO_CHOICE);
    await P.page.waitForFunction(() => !document.getElementById("choose").hidden, null, { timeout: 30000 });
    await P.page.waitForTimeout(700);
    await P.ev(() => {
      const w = window.__riftTest.game.world;
      w.wave = 9;
      w.choose(w.offer[0]);
    });
    await P.page
      .waitForFunction(
        () => {
          const b = document.getElementById("bossBar");
          return !b.hidden && window.__riftTest.game.world.boss;
        },
        null,
        { timeout: 40000 },
      )
      .catch(() => {});
    await P.ev(() => window.__riftTest.ui.toast("QA hint during the boss fight", "intro", 8000));
    await P.page.waitForTimeout(500);
    const bb = await P.ev(() => {
      const b = document.getElementById("bossBar").getBoundingClientRect(),
        t = [...document.querySelectorAll("#toasts .toast")]
          .filter((x) => getComputedStyle(x).display !== "none")
          .map((x) => x.getBoundingClientRect());
      return { bar: Math.round(b.bottom), top: t.length ? Math.round(Math.min(...t.map((x) => x.top))) : null };
    });
    check(
      L,
      "boss fight: hints start below the boss health bar",
      bb.top != null && bb.top >= bb.bar,
      JSON.stringify(bb),
    );
    check(L, "no page errors", !P.errors.length, P.errors.join(" | "));
    await P.close();
  });

/* ======================= 4b. 2.4.2 fixes and quality of life (PC) ======================= */
await section("qol", async (L) => {
  const P = await open("desktop", {
    save: JSON.stringify({ v: 1, game: "riftline", shards: 0, seen: { tutorial: true } }),
  });
  await P.boot();
  const hidden = (id) => P.ev((i) => document.getElementById(i).hidden, id);
  const hide = () =>
    P.ev(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
  // a lost run is settled when the page is hidden in the 1.5 s before the game-over screen
  await P.tap("#playBtn");
  await P.page.waitForTimeout(600);
  await P.ev(() => {
    const w = window.__riftTest.game.world;
    w.player.iT = 0;
    w.player.dashT = 0;
    w.player.shield = false;
    w.hurtPlayer(99999, null, null, "grunt", true);
  });
  await P.page.waitForTimeout(150);
  await hide();
  const dead = await P.stored();
  check(
    L,
    "death, then page hidden before game over: run is gone and the death counts",
    !dead.run && dead.stats.deaths === 1 && !(await hidden("over")),
    `run ${!!dead.run}, deaths ${dead.stats.deaths}`,
  );
  // letters by position: AZERTY "q" (KeyA) moves left and does not fire the Nova
  await P.ev(() => window.__riftTest.game.startRun({}));
  await P.page.waitForTimeout(600);
  const az = await P.ev(() => {
    const g = window.__riftTest.game;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q", code: "KeyA" }));
    const r = { left: g.input.keys.has("a"), nova: g.input.pending.nova };
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "q", code: "KeyA" }));
    r.released = !g.input.keys.size;
    return r;
  });
  check(
    L,
    "AZERTY: Q (the A position) moves left without firing the Nova",
    az.left && !az.nova && az.released,
    JSON.stringify(az),
  );
  // 3.0.0: G throws the gadget (3.12.0: the Singularity; one charge less, the pips follow), the first trap warning shows its tip
  await P.page.waitForFunction(() => window.__riftTest.game.world.state === "fight", null, { timeout: 30000 });
  const gr = await P.ev(() => {
    const w = window.__riftTest.game.world;
    w.god = true;
    return { n: w.player.gadgetN, max: w.stats.gadgetMax };
  });
  await P.page.keyboard.press("g");
  // wait for the throw to be processed (in software rendering a frame takes about 0.3 s)
  await P.page
    .waitForFunction(
      () => {
        const w = window.__riftTest.game.world;
        return w.player.gadgetN < w.stats.gadgetMax;
      },
      null,
      { timeout: 5000 },
    )
    .catch(() => {});
  const gr2 = await P.ev(() => {
    const w = window.__riftTest.game.world;
    return {
      n: w.player.gadgetN,
      flying: w.singularities.length,
      lit: document.querySelectorAll("#gadgetPips i.on").length,
      empty: document.getElementById("gadgetBtn").classList.contains("empty"),
    };
  });
  check(
    L,
    "G throws a Singularity: one charge less, one in flight, the pips follow",
    gr.n === gr.max && gr2.n === gr.max - 1 && gr2.lit === gr2.n && !gr2.empty,
    JSON.stringify({ gr, gr2 }),
  );
  await P.ev(() => {
    const w = window.__riftTest.game.world;
    w.player.gadgetN = 0;
    w.player.gadgetT = 3;
  });
  await P.page.keyboard.press("g");
  // the flash lasts 0.28 s: wait for it to show up instead of sleeping (a slow frame loop made a fixed wait flaky)
  const sawDeny = await P.page
    .waitForFunction(() => document.getElementById("gadgetBtn").classList.contains("deny"), null, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  const dn = await P.ev(
    (deny) => ({
      deny,
      empty: document.getElementById("gadgetBtn").classList.contains("empty"),
      ring: document.getElementById("gadgetBtn").style.getPropertyValue("--q"),
    }),
    sawDeny,
  );
  check(
    L,
    "G without a charge: the button flashes deny, shows empty and a recharge ring",
    dn.deny && dn.empty && !!dn.ring,
    JSON.stringify(dn),
  );
  await P.ev(() => {
    const w = window.__riftTest.game.world;
    w.player.gadgetN = w.stats.gadgetMax;
    w.emit("trapWarn", { id: 1, fam: "floor", skin: "plate", x: 0, y: 0, r: 2, delay: 1, dur: 1 });
  });
  await P.page
    .waitForFunction(
      () => [...document.querySelectorAll("#toasts .toast")].some((t) => /Traps flash/.test(t.textContent)),
      null,
      { timeout: 5000 },
    )
    .catch(() => {});
  const tip = await P.ev(() => [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent));
  check(
    L,
    "first trap warning: one-time tip about the telegraphs",
    tip.some((t) => /Traps flash/.test(t)),
    JSON.stringify(tip),
  );
  // upgrade choice by keys: locked for 650 ms, then 1–4 pick and R rerolls
  await P.ev(CLEAR_TO_CHOICE);
  await P.page.waitForFunction(() => !document.getElementById("choose").hidden, null, { timeout: 30000 });
  await P.page.keyboard.press("1");
  const early = await P.ev(() => window.__riftTest.game.world.state);
  await P.page.waitForTimeout(800);
  const hints = await P.ev(() => ({
    cards: document.querySelectorAll("#cards .card-key").length,
    offer: window.__riftTest.game.world.offer.length,
  }));
  check(L, "upgrade cards show their number key", hints.cards === hints.offer, JSON.stringify(hints));
  await P.ev(() => {
    window.__riftTest.game.world.rerolls = 2;
  });
  await P.page.keyboard.press("r");
  const rr = await P.ev(() => ({
    n: window.__riftTest.game.world.rerolls,
    hints: document.querySelectorAll("#rerollBtn .card-key").length,
  }));
  check(L, "R rerolls (one key hint on the button)", rr.n === 1 && rr.hints === 1, JSON.stringify(rr));
  await P.page.waitForFunction(() => !document.getElementById("cards").classList.contains("locked"), null, {
    timeout: 5000,
  });
  const want = await P.ev(() => document.querySelectorAll("#cards [data-pick]")[1].dataset.pick);
  await P.page.keyboard.press("2");
  await P.page.waitForTimeout(300);
  const got = await P.ev(
    (p) => ({ lv: window.__riftTest.game.world.up[p] || 0, wave: window.__riftTest.game.world.wave }),
    want,
  );
  check(
    L,
    "key 2 picks the second card (not while the cards are locked)",
    early === "choose" && got.lv === 1 && got.wave === 2,
    `${early}; ${want} ${JSON.stringify(got)}`,
  );
  // pause: the build explains each upgrade
  await P.page.keyboard.press("Escape");
  await P.page.waitForTimeout(300);
  await P.tap("#pauseBuild [data-up]");
  const info = await P.ev(() => document.getElementById("pauseUpInfo").textContent);
  check(L, "pause build: an upgrade shows its level and effect", /LV 1\/\d/.test(info) && info.length > 20, info);
  // settings from the pause menu: no backup/reset, Esc and Back return to the pause menu
  await P.tap("#pauseSetBtn");
  const ps = await P.ev(() => ({
    set: !document.getElementById("settings").hidden,
    pause: !document.getElementById("pause").hidden,
    reset: !!document.getElementById("resetBtn").offsetParent,
    backup: !!document.getElementById("backupBtn").offsetParent,
  }));
  check(
    L,
    "pause → settings opens without backup and reset",
    ps.set && !ps.pause && !ps.reset && !ps.backup,
    JSON.stringify(ps),
  );
  await P.tap("#setTimer");
  await P.tap("#setFps");
  await P.page.keyboard.press("Escape");
  await P.page.waitForTimeout(250);
  const e1 = await P.ev(() => ({
    set: !document.getElementById("settings").hidden,
    pause: !document.getElementById("pause").hidden,
    paused: window.__riftTest.game.paused,
  }));
  await P.tap("#pauseSetBtn");
  await P.back("settings");
  const e2 = await P.ev(() => ({
    set: !document.getElementById("settings").hidden,
    pause: !document.getElementById("pause").hidden,
  }));
  check(
    L,
    "Esc and Back in those settings return to the pause menu",
    !e1.set && e1.pause && e1.paused && !e2.set && e2.pause,
    JSON.stringify([e1, e2]),
  );
  await P.tap("#resumeBtn");
  await P.page.waitForTimeout(1300);
  const hud = await P.ev(() => ({
    t: document.getElementById("hudInfo").textContent,
    shown: !document.getElementById("hudInfo").hidden,
  }));
  check(L, "run timer and FPS counter show in the HUD", hud.shown && /^\d+:\d\d · \d+ FPS$/.test(hud.t), hud.t);
  // Last Stand never raises a hit (a 0.4 acid tick stays below 1)
  const ls = await P.ev(() => {
    const T = window.__riftTest,
      w = new T.World({ weapon: "pulse", threat: 0, ws: {}, seed: 5 });
    w.up.laststand = 2;
    w.stats = T.computeStats("pulse", w.up, {});
    w.state = "fight";
    w.player.hp = 20;
    const a = w.player.hp;
    w.hurtPlayer(0.4, null, null, "acid", true);
    const b = w.player.hp;
    w.hurtPlayer(10, null, null, "grunt", true);
    return [a - b, b - w.player.hp];
  });
  check(
    L,
    "Last Stand lowers hits and never raises small ones",
    ls[0] === 0 && ls[1] === Math.round(10 * (1 - 0.44)),
    JSON.stringify(ls),
  );
  // menu pages: Esc goes back
  await P.ev(() => {
    const g = window.__riftTest.game;
    g.abandon();
    g.goHome();
  });
  await P.page.waitForTimeout(300);
  const back = [];
  for (const s of ["workshop", "records", "settings"]) {
    await P.nav(s);
    await P.page.keyboard.press("Escape");
    await P.page.waitForTimeout(250);
    back.push(await P.ev(() => window.__riftTest.ui.screen));
  }
  check(
    L,
    "Esc goes back from Workshop, Records and Settings",
    back.every((x) => x === "home"),
    back.join(", "),
  );
  // import applies the imported settings at once
  await P.nav("settings");
  const exp = await P.ev(() => {
    const d = JSON.parse(JSON.stringify(window.__riftTest.store.data));
    d.settings.contrast = !d.settings.contrast;
    d.settings.music = 0.1;
    return JSON.stringify(d);
  });
  await P.tap("#restoreBtn");
  await P.page.fill("#saveImport", exp);
  await P.dlg("Restore");
  await P.dlg("Restore");
  await P.page.waitForTimeout(300);
  const imp = await P.ev(() => ({
    contrast: window.__riftTest.renderer.contrast === window.__riftTest.store.data.settings.contrast,
    music: window.__riftTest.game.sound.musVol === 0.1,
  }));
  check(L, "import applies the imported settings without a reload", imp.contrast && imp.music, JSON.stringify(imp));
  // 2.4.6: no update bar; a downloaded update is applied only when no run is going on
  const upd = await P.ev(() => {
    const g = window.__riftTest.game,
      hide = () => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        delete document.visibilityState;
      };
    const r = { bar: !!document.getElementById("updateBar") };
    let n = 0;
    g.startRun({});
    g.pendingUpdate = () => n++;
    hide();
    r.inRun = n;
    g.abandon();
    g.goHome();
    r.afterRun = n;
    g.pendingUpdate = () => n++;
    hide();
    r.menuHidden = n;
    return r;
  });
  check(
    L,
    "update: no update bar, never applied during a run, applied back in the menu",
    !upd.bar && upd.inRun === 0 && upd.afterRun === 1 && upd.menuHidden === 2,
    JSON.stringify(upd),
  );
  check(L, "no page errors", !P.errors.length, P.errors.join(" | "));
  await P.close();
});

/* ======================= 5. controls: every button is wired and named ======================= */
/* ======================= sound notes (3.17.2) ======================= */
for (const profName of ["desktop", "phone"])
  await section(`soundnotes-${profName}`, async (L) => {
    const P = await open(profName, { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
    await P.boot();
    const notes = () => P.ev(() => JSON.parse(localStorage.getItem("riftline.soundNotes") || "[]"));
    // a run, a few sounds heard lately (the engine's memory of them is filled directly: headless audio may not run)
    await P.ev(() => {
      const T = window.__riftTest;
      T.game.startRun({});
      T.game.sound.heard("eshot", { type: "boss", boss: "warden" });
      T.game.sound.heard("step", { ground: "ice" });
      T.game.sound.heard("step", { ground: "ice" });
      T.game.sound.heard("place:siren");
      T.game.sound.heard("click");
    });
    await P.page.waitForTimeout(600);
    await P.ev(() => window.__riftTest.game.pause());
    await P.page.waitForTimeout(400);
    check(L, "pause menu has the Sound notes button", await P.vis("pauseSndBtn"));
    await P.tap("#pauseSndBtn");
    check(L, "sound notes open", await P.vis("sndNotes"));
    const list = await P.ev(() =>
      [...document.querySelectorAll("#snList .sn-item")].map(
        (e) => e.dataset.key + "|" + e.querySelector("small").textContent,
      ),
    );
    check(
      L,
      "the list names the sounds heard lately (distinct, counted), not the menu's own clicks",
      list.some((x) => x.startsWith("step:ice|2×")) &&
        list.some((x) => x.startsWith("eshot:warden")) &&
        list.some((x) => x.startsWith("place:siren")) &&
        !list.some((x) => x.startsWith("click")),
      list.join(" ; "),
    );
    check(L, "no reasons before a sound is picked", !(await P.vis("snReasons")));
    await P.tap('#snList [data-key="step:ice"]');
    check(L, "picking a sound shows the reasons", await P.vis("snReasons"));
    await P.tap('#snReasons [data-reason="loud"]');
    await P.tap('#snList [data-key="place:siren"]');
    await P.tap('#snReasons [data-reason="love"]');
    const saved = await notes();
    check(
      L,
      "the notes are saved with the exact sound, the reason and where it was",
      saved.length === 2 &&
        saved[0].key === "step:ice" &&
        saved[0].reason === "loud" &&
        saved[1].key === "place:siren" &&
        saved[1].reason === "love" &&
        saved[0].wave >= 1 &&
        !!saved[0].biome,
      JSON.stringify(saved),
    );
    check(L, "the count shows", (await P.ev(() => document.getElementById("snCount").textContent)) === "2");
    // the copied text (the clipboard may be blocked: the text is what is built)
    const text = await P.ev(() => {
      let copied = null;
      const g = window.__riftTest.ui;
      g.copy = (t) => (copied = t);
      g.copySoundNotes();
      return copied;
    });
    check(
      L,
      "copy builds one text with a line per note",
      !!text &&
        text.split("\n").length === 3 &&
        /step:ice \| Too loud/.test(text) &&
        /place:siren \| Love it/.test(text),
      String(text).replace(/\n/g, " / "),
    );
    // back: the button and the Esc key lead to the pause menu
    await P.tap("#snBack");
    check(L, "Back returns to the pause menu", (await P.vis("pause")) && !(await P.vis("sndNotes")));
    await P.tap("#pauseSndBtn");
    if (!P.prof.touch) {
      await P.page.keyboard.press("Escape");
      await P.page.waitForTimeout(300);
      check(L, "Esc returns to the pause menu", (await P.vis("pause")) && !(await P.vis("sndNotes")));
      await P.tap("#pauseSndBtn");
    }
    await P.tap("#snClear");
    check(L, "Clear removes the notes", (await notes()).length === 0);
    await P.tap("#snBack");
    check(L, "no page errors in the run", !P.errors.length, P.errors.slice(0, 3).join(" | "));
    await P.close();
    // from the settings of the main menu (no run: the notes can be copied and cleared there)
    const Q = await open(profName, {
      save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }),
    });
    await Q.boot();
    await Q.nav("settings");
    check(L, "settings have the Sound notes button in the menu", await Q.vis("sndNotesBtn"));
    await Q.tap("#sndNotesBtn");
    check(L, "sound notes open from the settings", await Q.vis("sndNotes"));
    check(
      L,
      "no run: the music of the menu is the one thing to note",
      (await Q.ev(() => [...document.querySelectorAll("#snList .sn-item")].map((e) => e.dataset.key))).join() ===
        "music:menu:yard",
    );
    await Q.tap("#snBack");
    check(L, "Back returns to the settings", (await Q.vis("settings")) && !(await Q.vis("sndNotes")));
    check(L, "no page errors in the menu", !Q.errors.length, Q.errors.slice(0, 3).join(" | "));
    await Q.close();
  });

await section("buttons", async (L) => {
  const P = await open("desktop");
  await P.boot();
  await P.ev(() => {
    const u = window.__riftTest.ui;
    u.renderWorkshop();
    u.renderRecords();
    u.renderSettings();
  });
  const n = await P.ev(() => {
    let i = 0;
    for (const e of document.querySelectorAll('button, input, select, [role="button"]')) e.dataset.qaI = i++;
    return i;
  });
  const cdp = await P.ctx.newCDPSession(P.page);
  const unwired = [],
    unnamed = [];
  for (let i = 0; i < n; i++) {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('[data-qa-i="${i}"]')`,
    });
    const info = await P.ev((i) => {
      const e = document.querySelector(`[data-qa-i="${i}"]`);
      const lbl = e.closest("label");
      return {
        d: e.id
          ? "#" + e.id
          : e.tagName.toLowerCase() +
            (e.className ? "." + String(e.className).split(" ")[0] : "") +
            (e.dataset.v ? `[${e.dataset.v}]` : ""),
        shown: !!(e.offsetWidth || e.offsetHeight),
        name: (
          e.getAttribute("aria-label") ||
          e.title ||
          e.textContent ||
          (lbl && lbl.textContent) ||
          e.placeholder ||
          ""
        ).trim(),
        path: (() => {
          const p = [];
          let n = e;
          while (n && n !== document.body) {
            p.push(n);
            n = n.parentElement;
          }
          return p.length;
        })(),
      };
    }, i);
    // own listeners + listeners on ancestors below <body> (delegation)
    let wired = false,
      obj = result.objectId;
    for (let depth = 0; depth < info.path && obj && !wired; depth++) {
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: obj });
      if (listeners.some((l) => /click|pointer|touch|input|change|keydown/.test(l.type))) wired = true;
      const par = await cdp.send("Runtime.callFunctionOn", {
        objectId: obj,
        functionDeclaration: "function(){return this.parentElement}",
      });
      obj = par.result.objectId;
    }
    if (!wired) unwired.push(info.d);
    if (!info.name && info.shown) unnamed.push(info.d); // hidden controls get their label when shown
  }
  check(L, `every control has an event handler (${n} controls)`, !unwired.length, unwired.join(", "));
  check(L, "every control has an accessible name", !unnamed.length, unnamed.join(", "));
  await P.close();
});

/* ======================= 2.5.0 A: upgrades (retired copies, new mechanics) ======================= */
await section("upgrades250A", async (L) => {
  // a save from 2.4 with a run saved mid-way: retired upgrades in the build and in the pending offer
  const old = {
    v: 1,
    game: "riftline",
    shards: 500,
    weapon: "pulse",
    weapons: { pulse: true },
    seen: { tutorial: true },
    history: [{ t: 1, weapon: "pulse", threat: 0, wave: 9, outcome: "dead", build: ["caliber", "fortify", "dmg"] }],
    run: {
      v: 1,
      seed: 250250,
      weapon: "pulse",
      threat: 0,
      wave: 6,
      hp: 80,
      shards: 40,
      kills: 100,
      time: 300,
      rerolls: 1,
      nova: 20,
      up: {
        caliber: 3,
        kinetic: 2,
        dmg: 2,
        fortify: 5,
        hp: 6,
        coolant: 3,
        afterburner: 3,
        scavenger: 2,
        focus: 1,
        payloadMatrix: 2,
        payload: 1,
        chainlink: 1,
      },
      offer: ["fortify", "flux", "crit"],
      offerBoss: false,
    },
  };
  for (const prof of ["desktop", "phone"]) {
    const P = await open(prof, { save: JSON.stringify(old) });
    await P.boot();
    const d = await P.ev(() => {
      const s = window.__riftTest.store.data;
      return { up: s.run && s.run.up, offer: s.run && s.run.offer, build: s.history[0] && s.history[0].build };
    });
    const want = { dmg: 6, hp: 10, speed: 6, supply: 2, crit: 1, payload: 3, resonance: 1 };
    check(
      L,
      `${prof}: retired upgrade levels became levels of the upgrade that took them over`,
      d.up && Object.keys(d.up).length === 7 && Object.entries(want).every(([k, v]) => d.up[k] === v),
      JSON.stringify(d.up),
    );
    check(
      L,
      `${prof}: retired ids in the pending offer were replaced`,
      JSON.stringify(d.offer) === '["dmg","overcharge","crit"]',
      JSON.stringify(d.offer),
    );
    check(
      L,
      `${prof}: run history shows the new upgrade names`,
      JSON.stringify(d.build) === '["dmg","hp"]',
      JSON.stringify(d.build),
    );
    await P.tap("#continueBtn");
    await P.page.waitForTimeout(1200);
    const r = await P.ev(() => {
      const w = window.__riftTest.game.world;
      return (
        w && {
          wave: w.wave,
          choose: !document.getElementById("choose").hidden,
          cards: [...document.querySelectorAll("#cards [data-pick]")].map((c) => c.dataset.pick).join(","),
          maxHp: w.stats.maxHp,
        }
      );
    });
    check(
      L,
      `${prof}: continue shows the converted offer`,
      r && r.choose && r.wave === 6 && r.cards === "dmg,overcharge,crit" && r.maxHp === 350,
      JSON.stringify(r),
    );
    await P.page.waitForFunction(() => !document.getElementById("cards").classList.contains("locked"), null, {
      timeout: 5000,
    });
    await P.tap('#cards [data-pick="overcharge"]');
    await P.ev(() => {
      window.__riftTest.game.world.god = true;
    });
    await P.page.waitForTimeout(3000);
    const g = await P.ev(() => {
      const w = window.__riftTest.game.world;
      return { wave: w.wave, state: w.state, oc: w.up.overcharge, hp: w.player.hp };
    });
    check(
      L,
      `${prof}: the migrated run plays on`,
      g.wave === 7 && g.state === "fight" && g.oc === 1 && Number.isFinite(g.hp),
      JSON.stringify(g),
    );
    // the six new upgrades as cards: readable, nothing clipped (4 cards with Insight)
    for (const [i, offer] of [
      ["skates", "acidcoat", "heatsink", "surge"],
      ["slipstream", "surge", "reactive"],
    ].entries()) {
      // clear and run the simulation to the choice (splitters leave mites; a busy machine renders slowly)
      await P.ev(CLEAR_TO_CHOICE);
      await P.page.waitForFunction(() => !document.getElementById("choose").hidden, null, { timeout: 30000 });
      await P.ev((o) => {
        const T = window.__riftTest,
          w = T.game.world;
        w.offer = o;
        T.ui.renderCards(w);
      }, offer);
      await P.page.waitForTimeout(900);
      const c = await P.ev(() => {
        const cards = [...document.querySelectorAll("#cards .card")];
        return {
          n: cards.length,
          clipped: cards
            .filter((x) => x.scrollHeight > x.clientHeight + 1 || x.scrollWidth > x.clientWidth + 1)
            .map((x) => x.dataset.pick),
          off: cards
            .filter((x) => {
              const b = x.getBoundingClientRect();
              return b.left < 0 || b.right > innerWidth;
            })
            .map((x) => x.dataset.pick),
          text: cards.map((x) => x.querySelector("p").textContent),
        };
      });
      await P.shot({ path: new URL(`./shots/upgrades250A-${prof}-${i + 1}.png`, import.meta.url).pathname });
      check(
        L,
        `${prof}: new upgrade cards ${offer.join(", ")} fit`,
        c.n === offer.length &&
          !c.clipped.length &&
          !c.off.length &&
          c.text.every((t) => t.length > 20 && !/NaN|undefined/.test(t)),
        JSON.stringify(c),
      );
      await P.page.waitForFunction(() => !document.getElementById("cards").classList.contains("locked"), null, {
        timeout: 5000,
      });
      await P.page.waitForSelector("#cards:not(.locked) .card", { timeout: 8000 }); // the cards are locked for 0.65 s
      await P.tap("#cards .card");
      await P.page.waitForTimeout(400);
    }
    // all six at once in a live wave: the timed ones show a HUD chip, nothing throws
    const live = await P.ev(async () => {
      const T = window.__riftTest,
        w = T.game.world;
      Object.assign(w.up, { skates: 2, acidcoat: 2, heatsink: 2, slipstream: 2, surge: 2, reactive: 2 });
      w.stats = T.computeStats(w.weapon, w.up, w.ws);
      w.god = true;
      w.player.heatT = 3;
      w.player.slipT = 1.3;
      // 3.10.0: three animation frames (the HUD updates once per game frame) instead of 400 ms, which under
      // software GL (2 to 6 fps) could pass without a single frame
      for (let k = 0; k < 3; k++) await new Promise((r) => requestAnimationFrame(r));
      const chips = [...document.querySelectorAll("#buffs [data-b]")].map((b) => b.dataset.b);
      await new Promise((r) => setTimeout(r, 2500));
      return { chips, state: w.state, finite: [w.player.x, w.player.y, w.player.nova].every(Number.isFinite) };
    });
    check(
      L,
      `${prof}: Heat Sink and Slipstream show a HUD chip, the wave keeps running`,
      live.chips.includes("heat") && live.chips.includes("slip") && live.finite,
      JSON.stringify(live),
    );
    check(L, `${prof}: no page errors`, !P.errors.length, P.errors.join(" | "));
    await P.close();
  }
});

/* ======================= 2.5.0 C: biome events in the real game ======================= */
// Every hazard biome's event, forced on PC and phone: the banner names it, the HUD chip shows it,
// it only happens in its biome, the Whiteout fog closes in, the Rift Storm shows where the portals
// jump, and nothing throws. Screenshots: tests/shots/qa-event-<profile>-<event>.png
for (const profName of ["desktop", "phone"])
  await section(`biome-events-${profName}`, async (L) => {
    const P = await open(profName, {
      save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true }, settings: { quality: "high" } }),
    });
    await P.boot();
    await P.ev(() => {
      const T = window.__riftTest;
      for (const k of Object.keys(T.store.data.seen)) T.store.data.seen[k] = true;
    });
    // record every banner with whether it fits the screen (the banner only lasts 2.6 s)
    await P.ev(() => {
      const u = window.__riftTest.ui,
        base = u.banner;
      window.__qaBanners = [];
      // offsetWidth: the banner starts its animation scaled by 1.25, the layout box is what must fit
      u.banner = function (...a) {
        const out = base.apply(this, a),
          bn = document.querySelector("#banner .bn");
        window.__qaBanners.push({ big: a[0], fits: !bn || bn.offsetWidth <= innerWidth });
        return out;
      };
    });
    await P.ev(() => window.__riftTest.game.startRun({}));
    await P.page.waitForTimeout(800);
    const route = await P.ev(() => window.__riftTest.game.world.route.slice(0, 4));
    const want = { works: "meltdown", vault: "whiteout", marsh: "bloom", void: "riftstorm" };
    let normalFog = null;
    for (const biome of route) {
      if (!want[biome]) continue;
      const at = await P.ev((b) => {
        const w = window.__riftTest.game.world;
        return w.biomeEventWave(1 + 5 * w.route.indexOf(b));
      }, biome);
      if (biome === "vault") {
        // the vault's fog in a wave without the event, for comparison
        await P.ev(
          (n) => {
            const g = window.__riftTest.game,
              w = g.world;
            w.god = true;
            w.startWave(n);
            g.intro = null;
          },
          at === 7 ? 9 : 7,
        );
        await P.page.waitForTimeout(1500);
        normalFog = await P.ev(() => window.__riftTest.renderer.scene.fog.far);
      }
      await P.ev((n) => {
        const g = window.__riftTest.game,
          w = g.world;
        w.god = true;
        w.startWave(n);
        g.intro = null;
        window.__riftTest.renderer.focusOn(null);
      }, at);
      const name = await P.ev((n) => window.__riftTest.data.waveEvents[n].name, want[biome]);
      await P.page
        .waitForFunction(
          (n) =>
            window.__qaBanners.some((b) => b.big === n) &&
            document.querySelector('#buffs [data-b="event"]')?.textContent === n,
          name,
          { timeout: 15000 },
        )
        .catch(() => {});
      await P.shot({
        path: new URL(`./shots/qa-event-${profName}-${want[biome]}-banner.png`, import.meta.url).pathname,
      });
      const r = await P.ev((n) => {
        const w = window.__riftTest.game.world,
          chip = document.querySelector('#buffs [data-b="event"]'),
          bn = window.__qaBanners.find((b) => b.big === n);
        window.__qaBanners.length = 0;
        return {
          event: w.event,
          biome: w.arena.biome.id,
          banner: bn ? bn.big : "",
          fits: bn ? bn.fits : null,
          chip: chip ? chip.textContent : "",
        };
      }, name);
      check(
        L,
        `${biome}: wave ${at} brings ${want[biome]}`,
        r.event === want[biome] && r.biome === biome,
        JSON.stringify(r),
      );
      check(
        L,
        `${biome}: banner and HUD chip name the event`,
        r.banner === name && r.chip === name,
        `${r.banner} / ${r.chip}`,
      );
      check(L, `${biome}: banner text fits the screen`, r.fits === true);
      // let the event play: 5 s of wave time (the Rift Storm telegraph is up from 4.4 s)
      await P.ev(() => {
        const w = window.__riftTest.game.world;
        while (w.waveT < 4.7) w.step(1 / 60, { mx: 0, my: 0 });
      });
      await P.page.waitForTimeout(biome === "vault" ? 1600 : 400);
      const s = await P.ev(() => {
        const w = window.__riftTest.game.world,
          A = w.arena;
        return {
          fog: window.__riftTest.renderer.scene.fog.far,
          next: A.portals.filter((q) => q.next).length,
          portals: A.portals.length,
          vents: A.vents.map((q) => A.ventState(q, w.waveT)),
          acid: A.acid.length,
          ice: A.ice.length,
        };
      });
      if (biome === "vault")
        check(
          L,
          "whiteout: the fog closes in (far < 75 % of a normal vault wave)",
          normalFog && s.fog < normalFog * 0.75,
          `${s.fog.toFixed(1)} vs ${normalFog && normalFog.toFixed(1)}`,
        );
      if (biome === "void") {
        // the telegraph is up in phases while the world runs on in real time (a frame takes about 0.3 s in
        // software rendering): wait until every portal shows its target at once instead of sampling one instant
        const all = await P.page
          .waitForFunction(
            () => {
              const A = window.__riftTest.game.world.arena;
              return A.portals.length > 0 && A.portals.every((q) => q.next);
            },
            null,
            { timeout: 8000 },
          )
          .then(() => true)
          .catch(() => false);
        check(L, "rift storm: every portal shows where it jumps next", s.portals > 0 && all, JSON.stringify(s));
      }
      if (biome === "works")
        check(
          L,
          "meltdown: all vents in the same state",
          s.vents.length >= 6 && s.vents.every((v) => v === s.vents[0]),
          s.vents.join(","),
        );
      await P.shot({
        path: new URL(`./shots/qa-event-${profName}-${want[biome]}.png`, import.meta.url).pathname,
      });
    }
    check(L, "no page errors", !P.errors.length, P.errors.slice(0, 3).join(" | "));
    await P.close();
  });

/* ======================= 2.5.0 D: biome title card, boss intro card, Codex ======================= */
PROFILES.land = { viewport: { width: 844, height: 390 }, touch: true, mobile: true };
for (const profName of ["desktop", "phone"])
  await section(`codex-${profName}`, async (L) => {
    // an old save: no Codex keys except one enemy tip, a defeated boss and a build in the history
    const P = await open(profName, {
      save: JSON.stringify({
        v: 1,
        game: "riftline",
        seen: { tutorial: true, enemy_grunt: true },
        stats: { runs: 3, bosses: { warden: 2 } },
        history: [
          {
            t: Date.now() - 6e4,
            outcome: "dead",
            wave: 6,
            endless: false,
            weapon: "pulse",
            threat: 0,
            time: 300,
            kills: 120,
            shards: 40,
            killer: "grunt",
            build: ["dmg"],
          },
        ],
      }),
    });
    await P.boot();
    const cardOn = (sel) =>
      P.page
        .waitForFunction((s) => document.querySelector(s), sel, { timeout: 60000, polling: 30 })
        .then(
          () => true,
          () => false,
        );
    const inView = () =>
      P.ev(() => {
        const c = document.querySelector("#titleCard .tcard");
        if (!c) return null;
        const r = (c.querySelector(".tc-panel") || c.querySelector(".tc-band")).getBoundingClientRect(),
          x = r.left + r.width / 2,
          y = r.top + r.height / 2,
          hit = document.elementFromPoint(x, y);
        return {
          ok: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight,
          noInput: !hit || !hit.closest("#titleCard"),
          wide: document.documentElement.scrollWidth <= innerWidth,
          text: c.textContent,
        };
      });
    // Records → Codex tab
    await P.nav("records");
    await P.tap('[data-rtab="codex"]');
    const cx = await P.ev(() => {
      const d = window.__riftTest,
        rows = [...document.querySelectorAll("#codexList .row")],
        txt = (k) => {
          const r = document.querySelector(`#codexList [data-cx="${k}"]`);
          return r ? r.textContent : "";
        };
      return {
        shown: !document.getElementById("codexList").hidden && document.getElementById("recStats").hidden,
        rows: rows.length,
        want: Object.keys(d.enemyDefs).length + Object.keys(d.data.bossDefs).length + d.data.upgradeList.length,
        unseen: rows.filter((r) => r.classList.contains("unseen")).length,
        grunt: txt("enemy_grunt"),
        warden: txt("boss_warden"),
        dmg: txt("up_dmg"),
        sniper: txt("enemy_sniper"),
        core: txt("boss_core"),
        audit: window.__riftLayoutAudit(),
      };
    });
    check(
      L,
      "codex: tab shows one row per enemy, boss and upgrade",
      cx.shown && cx.rows === cx.want,
      `${cx.rows}/${cx.want}`,
    );
    check(
      L,
      'codex: old save — seen tip, defeated boss and history build are known, the rest is "???"',
      cx.unseen === cx.want - 3 &&
        /Grunt/.test(cx.grunt) &&
        /WARDEN/.test(cx.warden) &&
        /Defeated ×2/.test(cx.warden) &&
        /High-Yield|damage/i.test(cx.dmg) &&
        /\?\?\?/.test(cx.sniper) &&
        /\?\?\?/.test(cx.core),
      JSON.stringify({
        unseen: cx.unseen,
        grunt: cx.grunt.slice(0, 30),
        warden: cx.warden.slice(0, 40),
        sniper: cx.sniper,
      }),
    );
    check(L, "codex: layout audit clean", cx.audit.ok, cx.audit.findings.join(", "));
    const rows = await P.ev(() =>
      Math.max(...[...document.querySelectorAll("#codexList .row")].map((r) => r.getBoundingClientRect().width)),
    );
    check(
      L,
      "codex: rows at most 900 px wide and inside the screen",
      rows <= 900 && rows <= P.prof.viewport.width,
      `${Math.round(rows)} px`,
    );
    await P.tap('[data-rtab="stats"]');
    check(
      L,
      "codex: Stats tab brings the records back",
      await P.ev(
        () =>
          !document.getElementById("recStats").hidden &&
          document.getElementById("codexList").hidden &&
          document.querySelectorAll("#statGrid .cell").length > 5,
      ),
    );
    await P.back("records");
    // wave 1: biome title card instead of the wave banner
    await P.ev(() => window.__riftTest.game.startRun({}));
    const c1 = await cardOn("#titleCard .tcard.biome");
    const b1 = await P.ev(() => ({ banner: document.getElementById("banner").textContent }));
    const v1 = await inView();
    check(
      L,
      "biome card on wave 1: biome, hazard and boss, no wave banner",
      c1 &&
        v1 &&
        /Blackout City/i.test(v1.text) &&
        /Live manholes/i.test(v1.text) &&
        /THE WARDEN/.test(v1.text) &&
        !b1.banner,
      JSON.stringify({ c1, b1, text: v1 && v1.text }),
    );
    check(
      L,
      "biome card: on screen, no horizontal overflow, takes no input",
      v1 && v1.ok && v1.wide && v1.noInput,
      JSON.stringify(v1),
    );
    const gone = await P.page
      .waitForFunction(() => !document.querySelector("#titleCard .tcard"), null, { timeout: 15000 })
      .then(
        () => true,
        () => false,
      );
    check(L, "biome card fades out on its own", gone);
    // upgrades that are offered count as seen (and are saved)
    await P.ev(CLEAR_TO_CHOICE);
    await P.page.waitForFunction(() => !document.getElementById("choose").hidden, null, { timeout: 60000 });
    const up = await P.ev(() => {
      const w = window.__riftTest.game.world,
        s = window.__riftTest.store.data.seen;
      return { offer: [...w.offer], ok: w.offer.every((id) => s["up_" + id] === true) };
    });
    const st = await P.stored();
    check(
      L,
      "offered upgrades are marked seen and saved",
      up.ok && up.offer.every((id) => st.seen["up_" + id] === true),
      JSON.stringify(up),
    );
    // boss wave: name card during the camera pan
    await P.ev(() => {
      const g = window.__riftTest.game;
      g.world.wave = 4;
      g.choose(g.world.offer[0]);
    });
    const c2 = await cardOn("#titleCard .tcard.boss");
    const i2 = await P.ev(() => !!window.__riftTest.game.intro);
    const v2 = await inView();
    check(
      L,
      "boss card during the camera pan: name, title, biome",
      c2 &&
        i2 &&
        v2 &&
        /THE WARDEN/.test(v2.text) &&
        /Enforcer of the Blackout/i.test(v2.text) &&
        /Blackout City/i.test(v2.text),
      JSON.stringify({ c2, i2, text: v2 && v2.text }),
    );
    check(L, "boss card: on screen and takes no input", v2 && v2.ok && v2.noInput, JSON.stringify(v2));
    if (P.prof.touch) {
      const btn = await P.ev(() => {
        const c = document.querySelector("#titleCard .tc-panel");
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return ["novaBtn", "dashBtn", "gadgetBtn"]
          .map((id) => document.getElementById(id).getBoundingClientRect())
          .some((b) => b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top);
      });
      check(L, "boss card: clear of the NOVA, DASH and GADGET buttons", btn === false, String(btn));
    }
    const saved = await P.stored();
    check(L, "boss counts as seen for the Codex", saved.seen.boss_warden === true);
    const gone2 = await P.page
      .waitForFunction(() => !window.__riftTest.game.intro && !document.querySelector("#titleCard .tcard"), null, {
        timeout: 30000,
      })
      .then(
        () => true,
        () => false,
      );
    check(L, "boss card fades out after the pan", gone2);
    // biome change after the boss: the card of the next biome and its boss
    await P.ev(CLEAR_TO_CHOICE);
    await P.page.waitForFunction(() => !document.getElementById("choose").hidden, null, { timeout: 60000 });
    await P.ev(() => {
      const g = window.__riftTest.game;
      g.choose(g.world.offer[0]);
    });
    const c3 = await cardOn("#titleCard .tcard.biome");
    const want = await P.ev(() => {
      const w = window.__riftTest.game.world,
        b = w.biomeFor(6);
      return {
        wave: w.wave,
        name: b.name,
        boss: window.__riftTest.data.bossDefs[
          { yard: "warden", works: "forge", vault: "prism", marsh: "queen", void: "core" }[b.id]
        ].name,
      };
    });
    const v3 = await inView();
    check(
      L,
      "biome change (wave 6): card of the new biome with its boss",
      c3 && want.wave === 6 && v3 && v3.text.includes(want.name) && v3.text.includes(want.boss),
      JSON.stringify({ want, text: v3 && v3.text }),
    );
    // the pause menu hides a card
    await P.ev(() => window.__riftTest.game.pause());
    await P.page.waitForTimeout(300);
    check(L, "pause menu hides the card", await P.ev(() => !document.querySelector("#titleCard .tcard")));
    await P.ev(() => window.__riftTest.game.resume());
    check(L, "no page errors", !P.errors.length, P.errors.join(" | "));
    await P.close();
  });

/* ======================= 2.8.1: two tabs share one save ======================= */
await section("tabs", async (L) => {
  const P = await open("desktop", {
    save: JSON.stringify({ v: 1, game: "riftline", shards: 100, seen: { tutorial: true } }),
  });
  await P.boot();
  const B = await P.ctx.newPage();
  const errorsB = [];
  // about:blank has no storage, so the seeding script throws there; only errors of the game count
  await B.goto("about:blank");
  await B.evaluate(() => (window.name = "qa-tab2"));
  B.on("pageerror", (e) => errorsB.push(e.message));
  await B.goto(BASE + "index.html");
  await B.waitForFunction(() => window.__riftTest && window.__riftTest.store, null, { timeout: 90000 });
  const addInB = (n) =>
    B.evaluate((n) => {
      const s = window.__riftTest.store;
      s.data.shards += n;
      s.save("qa-tab2");
    }, n);
  // tab A is in the menu: it takes over what tab B saved right away
  await addInB(500);
  await P.page.waitForTimeout(400);
  const menuBank = await P.ev(() => window.__riftTest.store.data.shards);
  check(L, "menu tab reloads the progress saved in the other tab", menuBank === 600, String(menuBank));
  // tab A is in a run: tab B's progress is kept when tab A saves and when the run is settled
  await P.tap("#playBtn");
  await P.page.waitForTimeout(600);
  await addInB(1000);
  await P.page.waitForTimeout(400);
  const warned = await P.ev(() =>
    [...document.querySelectorAll("#toasts .toast")].some((t) => t.textContent.includes("another tab")),
  );
  check(L, "a running tab says that the game is open in another tab", warned);
  await P.ev(() => {
    const g = window.__riftTest.game;
    g.world.shards = 7;
    g.abandon();
  });
  await P.page.waitForTimeout(300);
  const st = await P.stored();
  check(
    L,
    "after the run: the other tab's shards and this run's shards are both in the save",
    st && st.shards >= 1607,
    String(st && st.shards),
  );
  check(L, "no page errors", !P.errors.length && !errorsB.length, [...P.errors, ...errorsB].join(" | "));
  await P.close();
});

/* ======================= 3.6.0: the button layout editor ======================= */
/* ======================= 3.11.0: landscape only ======================= */
await section("shell", async (L) => {
  const save = JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } });
  // the installed app asks for landscape
  {
    const P = await open("desktop");
    const manifest = await (await P.page.request.get(BASE + "manifest.webmanifest")).json();
    check(L, "manifest: orientation landscape", manifest.orientation === "landscape", manifest.orientation);
    await P.close();
  }
  // 3.18.0: there is no rotate screen; on a phone or tablet the shell (index.html) runs the game in a frame and turns it.
  // Automated browsers run the game directly (navigator.webdriver), so the shell is asked for with ?shell=1.
  const shellOf = async (P, query = "?shell=1") => {
    await P.page.goto(BASE + "index.html" + query);
    await P.page.waitForTimeout(600);
  };
  const frameOf = async (P) => {
    await P.page.waitForFunction(() => !!document.getElementById("rl"), null, { timeout: 15000 });
    const fr = await (await P.page.$("#rl")).contentFrame();
    await fr.waitForFunction(
      () =>
        window.__riftTest && window.__riftTest.game && window.__riftTest.ui && window.__riftTest.RL_HEALTH.length > 5,
      null,
      { timeout: 90000 },
    );
    return fr;
  };
  const state = (P) =>
    P.ev(() => ({ ...window.__rlShell, style: document.getElementById("rl").getAttribute("style") }));
  // a game point (in the frame's own coordinates) as a point on the screen: turned, the frame's x runs down the screen and
  // its y towards the left
  const onScreen = (st, W, p) => (st.turned ? { x: W - p.y, y: p.x } : p);
  const rectIn = (fr, sel) =>
    fr.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, sel);

  // --- a phone held upright: the game is turned, it plays in landscape, the touches arrive where the buttons are
  {
    PROFILES.upright = { viewport: { width: 390, height: 844 }, touch: true, mobile: true };
    const P = await open("upright", { save, draw: true });
    await shellOf(P);
    const fr = await frameOf(P);
    const st = await state(P);
    check(
      L,
      "upright phone: the shell turns the frame a quarter (the frame is landscape: 844 x 390)",
      st.turned === true &&
        /width: 844px/.test(st.style) &&
        /height: 390px/.test(st.style) &&
        /rotate\(90deg\)/.test(st.style),
      JSON.stringify(st),
    );
    const inner = await fr.evaluate(() => ({
      w: innerWidth,
      h: innerHeight,
      orient: document.body.dataset.orientation,
      device: document.body.dataset.device,
      rotate: !!document.getElementById("rotate"),
      home: !document.getElementById("home").hidden,
    }));
    check(
      L,
      "the game inside sees a landscape phone and shows no rotate screen",
      inner.w === 844 &&
        inner.h === 390 &&
        inner.orient === "landscape" &&
        inner.device === "phone" &&
        !inner.rotate &&
        inner.home,
      JSON.stringify(inner),
    );
    await P.page.screenshot({ path: new URL("./shots/qa-shell-upright.png", import.meta.url).pathname });
    // a tap on the screen where the play button is turned to starts a run
    const play = onScreen(st, 390, await rectIn(fr, "#playBtn"));
    await P.page.touchscreen.tap(play.x, play.y);
    const started = await fr
      .waitForFunction(() => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight", null, {
        timeout: 20000,
      })
      .then(
        () => true,
        () => false,
      );
    check(L, "a tap on the turned PLAY button starts a run", started);
    // the DASH button, turned
    await fr.evaluate(() => {
      window.__riftTest.game.world.god = true;
    });
    await P.page.waitForTimeout(500);
    const dashBefore = await fr.evaluate(() => window.__riftTest.game.world.runStats.dashes);
    const dash = onScreen(st, 390, await rectIn(fr, "#dashBtn"));
    await P.page.touchscreen.tap(dash.x, dash.y);
    check(
      L,
      "a tap on the turned DASH button dashes",
      await fr
        .waitForFunction((n) => window.__riftTest.game.world.runStats.dashes > n, dashBefore, { timeout: 15000 })
        .then(
          () => true,
          () => false,
        ),
    );
    // the move stick: a finger dragged on the left of the game moves the drone to the right of the game
    const cdp = await P.ctx.newCDPSession(P.page);
    const x0 = (await fr.evaluate(() => innerWidth)) * 0.22,
      y0 = (await fr.evaluate(() => innerHeight)) * 0.62,
      at = (dx) => onScreen(st, 390, { x: x0 + dx, y: y0 });
    const px0 = await fr.evaluate(() => window.__riftTest.game.world.player.x);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...at(0), id: 1 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...at((70 * i) / 8), id: 1 }] });
      await P.page.waitForTimeout(40);
    }
    await P.page.waitForTimeout(1500);
    const px1 = await fr.evaluate(() => window.__riftTest.game.world.player.x);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    check(
      L,
      "a finger dragged along the screen moves the drone to the right of the game",
      px1 > px0 + 0.5,
      `${px0.toFixed(2)} -> ${px1.toFixed(2)}`,
    );
    // turned to landscape: the same game goes on, upright, without a reload
    await fr.evaluate(() => {
      window.__qaMark = 42;
    });
    await P.page.setViewportSize({ width: 844, height: 390 });
    // (the window reports its new size a moment after its new orientation; the shell fits again after each)
    await P.page.waitForFunction(
      () => window.__rlShell && window.__rlShell.turned === false && window.__rlShell.w === 844,
      null,
      {
        timeout: 5000,
      },
    );
    const st2 = await state(P);
    const same = await fr.evaluate(() => ({
      mark: window.__qaMark,
      w: innerWidth,
      h: innerHeight,
      fight: window.__riftTest.game.world.state,
    }));
    check(
      L,
      "turned to landscape: the frame is upright and the run goes on (no reload)",
      /transform: none/.test(st2.style) &&
        same.mark === 42 &&
        same.w === 844 &&
        same.h === 390 &&
        same.fight !== undefined,
      JSON.stringify({ st2, same }),
    );
    const dash2 = onScreen(st2, 844, await rectIn(fr, "#dashBtn"));
    const d2 = await fr.evaluate(() => window.__riftTest.game.world.runStats.dashes);
    // the dash of the tap before has to be ready again (game time, not real time: a loaded machine runs the game slowly)
    await fr.waitForFunction(() => window.__riftTest.game.world.player.dashCdT <= 0, null, { timeout: 60000 });
    await P.page.touchscreen.tap(dash2.x, dash2.y);
    check(
      L,
      "in landscape a tap on DASH dashes as well",
      await fr
        .waitForFunction((n) => window.__riftTest.game.world.runStats.dashes > n, d2, { timeout: 15000 })
        .then(
          () => true,
          () => false,
        ),
    );
    check(L, "no page errors", !P.errors.length, P.errors.slice(0, 3).join(" | "));
    await P.close();
  }
  // --- a phone held sideways: the shell is there, nothing is turned
  {
    PROFILES.sideways = { viewport: { width: 844, height: 390 }, touch: true, mobile: true };
    const P = await open("sideways", { save });
    await shellOf(P);
    const fr = await frameOf(P);
    const st = await state(P);
    const inner = await fr.evaluate(() => ({
      w: innerWidth,
      h: innerHeight,
      home: !document.getElementById("home").hidden,
    }));
    check(
      L,
      "sideways phone: the frame fills the screen, not turned",
      st.turned === false && /transform: none/.test(st.style) && inner.w === 844 && inner.h === 390 && inner.home,
      JSON.stringify({ st, inner }),
    );
    await P.close();
  }
  // --- no shell where it must not turn: a desktop window of any shape, ?shell=0, a touch laptop with a snapped window
  {
    PROFILES.tall = { viewport: { width: 600, height: 900 }, touch: false };
    const P = await open("tall", { save });
    await P.page.goto(BASE + "index.html?shell=1");
    const r = await P.ev(() => ({
      frame: !!document.getElementById("rl"),
      turned: window.__rlShell && window.__rlShell.turned,
    }));
    // ?shell=1 forces the shell even here, but a tall window on a landscape screen is not turned
    check(
      L,
      "desktop window, tall: the shell (forced) does not turn it",
      r.frame && r.turned === false,
      JSON.stringify(r),
    );
    await P.page.goto(BASE + "index.html");
    await P.page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });
    check(
      L,
      "desktop window, tall: the game runs directly, no frame, no rotate screen",
      (await P.ev(() => !document.getElementById("rl") && !document.getElementById("rotate"))) && (await P.vis("home")),
    );
    await P.close();
  }
  {
    PROFILES.snapped = { viewport: { width: 683, height: 768 }, screen: { width: 1366, height: 768 }, touch: true };
    const P = await open("snapped", { save });
    await shellOf(P);
    const fr = await frameOf(P);
    const st = await state(P);
    check(
      L,
      "touch laptop, window snapped to half the screen: the shell does not turn it",
      st.turned === false,
      JSON.stringify(st),
    );
    await P.close();
  }
  {
    PROFILES.upright2 = { viewport: { width: 390, height: 844 }, touch: true, mobile: true };
    const P = await open("upright2", { save });
    await P.page.goto(BASE + "index.html?shell=0");
    await P.page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });
    check(
      L,
      "?shell=0: the game runs directly (no frame) even upright",
      await P.ev(() => !document.getElementById("rl")),
    );
    await P.close();
  }
});

await section("layout360", async (L) => {
  const P = await open("phone", { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
  await P.boot();
  const { page } = P,
    cdp = await P.ctx.newCDPSession(page),
    center = async (sel) => {
      const b = await (await page.$(sel)).boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
    },
    // a real finger: down, eight moves, up
    drag = async (from, to) => {
      const at = (i) => ({ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8, id: 3 });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at(0)] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at(i)] });
        await page.waitForTimeout(30);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(150);
    },
    problems = () => P.ev(() => [...window.__riftTest.hudEditor.problems()]),
    W = 844,
    H = 390;
  // the cleaning of a save: broken places fall back to the default layout, numbers keep the range of their sliders
  const cleaned = await P.ev(() => {
    const S = window.__riftTest.store,
      base = JSON.parse(JSON.stringify(S.data)),
      run = (settings) => {
        const r = S.parse(JSON.stringify({ ...base, settings })).data.settings;
        return { l: r.hudLayout, a: r.hudAlpha, k: r.stickSize, f: r.stickFixed };
      },
      spot = (x, y, s) => ({ x, y, s });
    return [
      run({
        hudLayout: {
          portrait: { dash: { x: "a" } },
          landscape: {
            dash: spot(2, -1, 9),
            nova: { x: 0.5, y: 0.5 },
            gadget: spot(0.4, 0.4, 0.1),
            pause: spot(0.9, 0.1, 1),
            stick: 5,
          },
        },
        hudAlpha: 7,
        stickSize: 0,
        stickFixed: "yes",
      }),
      run({ hudLayout: [1, 2] }),
    ];
  });
  check(
    L,
    "save: a broken layout is cleaned (missing control -> default, values clamped, junk dropped)",
    cleaned[0].l &&
      cleaned[0].l.portrait === null &&
      eq(cleaned[0].l.landscape.dash, { x: 1, y: 0, s: 1.6 }) &&
      cleaned[0].l.landscape.gadget.s === 0.6 &&
      cleaned[0].l.landscape.nova.s === 1 &&
      !("stick" in cleaned[0].l.landscape) &&
      cleaned[0].a === 1 &&
      cleaned[0].k === 0.7 &&
      cleaned[0].f === false &&
      cleaned[1].l === null,
    JSON.stringify(cleaned),
  );
  // the editor opens over the real HUD; the default layout is valid
  await P.nav("settings");
  await P.tap("#hudEditBtn");
  check(
    L,
    "the editor opens over the HUD",
    (await P.vis("hudEdit")) && (await P.vis("dashBtn")) && !(await P.vis("settings")),
  );
  check(L, "the default layout has no overlaps", !(await problems()).length, (await problems()).join(", "));
  // a tap only picks a button (the default layout stays the default layout); P does not close the editor
  const dash0 = await center("#dashBtn");
  await page.touchscreen.tap(dash0.x, dash0.y);
  await page.waitForTimeout(200);
  await page.keyboard.press("p");
  await page.waitForTimeout(200);
  check(
    L,
    "a tap picks a button without making a layout of its own; P keeps the editor open",
    (await P.ev(() => window.__riftTest.hudEditor.draft.layouts.landscape === null)) &&
      (await page.textContent("#heWhat")) === "DASH" &&
      (await P.vis("hudEdit")),
  );
  // DASH moves with a finger
  await drag(dash0, { x: W * 0.64, y: H * 0.56 });
  const dash1 = await center("#dashBtn");
  check(
    L,
    "DASH follows the finger",
    Math.abs(dash1.x - W * 0.64) < 3 && Math.abs(dash1.y - H * 0.56) < 3,
    `${dash1.x.toFixed(0)},${dash1.y.toFixed(0)}`,
  );
  // NOVA dropped on DASH jumps back
  const nova0 = await center("#novaBtn");
  await drag(nova0, { x: dash1.x + 4, y: dash1.y + 4 });
  const nova1 = await center("#novaBtn");
  check(
    L,
    "a button dropped on another one jumps back",
    Math.hypot(nova1.x - nova0.x, nova1.y - nova0.y) < 2 && /Not there/.test(await page.textContent("#heNote")),
  );
  // NOVA moved to free space and made bigger; growing into a neighbour is refused
  await drag(nova0, { x: W * 0.8, y: H * 0.42 });
  await P.ev(() => {
    const el = document.getElementById("heSize");
    el.value = "1.4";
    el.dispatchEvent(new Event("input"));
  });
  const nova2 = await center("#novaBtn");
  check(
    L,
    "the size slider resizes the picked button",
    Math.abs(nova2.w / nova0.w - 1.4) < 0.02,
    `${nova2.w.toFixed(1)} px`,
  );
  // the move stick pinned and moved; it stays on the move side
  await P.tap("#heFixed");
  const stick0 = await P.ev(() => window.__riftTest.hudEditor.stickCircle());
  await drag(stick0, { x: W * 0.9, y: stick0.y - 30 });
  const stick1 = await P.ev(() => window.__riftTest.hudEditor.stickCircle());
  check(L, "the fixed stick stays on the move side", stick1.x + stick1.r <= W / 2 + 1, JSON.stringify(stick1));
  check(L, "no overlaps before saving", !(await problems()).length, (await problems()).join(", "));
  await P.tap("#heSave");
  const stored = await P.stored();
  check(
    L,
    "Save stores the layout (landscape only) and the fixed stick",
    stored.settings.hudLayout &&
      stored.settings.hudLayout.landscape &&
      stored.settings.hudLayout.portrait === null &&
      stored.settings.hudLayout.landscape.nova.s === 1.4 &&
      stored.settings.stickFixed === true,
    JSON.stringify(stored.settings.hudLayout),
  );
  check(L, "back in the settings after Save", (await P.vis("settings")) && !(await P.vis("hudEdit")));
  check(L, "the settings say that an own layout is on", /own layout/.test(await page.textContent("#hudLayoutNote")));
  // Esc leaves the editor without saving
  await P.tap("#hudEditBtn");
  await drag(await center("#dashBtn"), { x: W * 0.6, y: H * 0.4 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(
    L,
    "Esc closes the editor and keeps the saved layout",
    !(await P.vis("hudEdit")) &&
      (await P.vis("settings")) &&
      eq((await P.stored()).settings.hudLayout, stored.settings.hudLayout),
  );
  // Esc in the middle of a drag: the editor closes, and opens again with a panel that can be used
  await P.tap("#hudEditBtn");
  {
    const at = await center("#novaBtn");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, id: 5 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x - 30, y: at.y, id: 5 }] });
    await page.keyboard.press("Escape");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
  }
  await P.tap("#hudEditBtn");
  check(
    L,
    "after Esc in the middle of a drag the panel works again",
    (await P.vis("hudEdit")) && !(await P.ev(() => document.getElementById("hePanel").classList.contains("faded"))),
  );
  await P.tap("#heCancel");
  // a run uses the layout: DASH where it was put, the fixed stick steers from its centre
  await P.back("settings");
  await P.tap("#playBtn");
  await page.waitForFunction(
    () => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight",
    null,
    {
      timeout: 20000,
    },
  );
  const dashRun = await center("#dashBtn");
  check(L, "in the run DASH sits where it was saved", Math.hypot(dashRun.x - dash1.x, dashRun.y - dash1.y) < 2);
  const at = await P.ev(() => window.__riftTest.game.input.fixedMove(window.__riftTest.game.input.radius()));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x + 50, y: at.y, id: 4 }] });
  await page.waitForTimeout(120);
  const mx = await P.ev(SAMPLE_MX);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  check(L, "a touch right of the fixed stick moves right at once", mx > 0.5, `mx ${mx.toFixed(2)}`);
  await P.tap("#dashBtn");
  await page
    .waitForFunction(() => window.__riftTest.game.world.runStats.dashes > 0, null, { timeout: 4000 })
    .catch(() => {});
  check(L, "the moved DASH dashes", await P.ev(() => window.__riftTest.game.world.runStats.dashes > 0));
  const audit = await P.ev(() => window.__riftLayoutAudit());
  check(L, "layout audit in the run with the own layout", audit.ok, audit.findings.join("; "));
  // a layout that does not fit this screen (here: DASH on NOVA, as from another phone) gives way to the default one
  const kept = await P.ev(() => JSON.stringify(window.__riftTest.store.data.settings.hudLayout));
  await P.ev(() => {
    const set = window.__riftTest.store.data.settings,
      broken = structuredClone(set.hudLayout);
    broken.landscape.dash = { ...broken.landscape.nova };
    set.hudLayout = broken;
    window.__riftTest.game.settingsChanged(true);
  });
  await page.waitForTimeout(300);
  check(
    L,
    "a layout that does not fit falls back to the default layout and says so",
    !(await P.ev(() => document.getElementById("hud").classList.contains("custom"))) &&
      (await P.ev(() =>
        [...document.querySelectorAll("#toasts .toast")].some((t) => t.textContent.includes("does not fit")),
      )),
  );
  await P.ev((json) => {
    window.__riftTest.store.data.settings.hudLayout = JSON.parse(json);
    window.__riftTest.game.settingsChanged(true);
  }, kept);
  // 3.18.0: turning the phone no longer pauses (the shell keeps the game landscape); the own layout stays in use
  await page.setViewportSize({ width: H, height: W });
  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(700);
  check(
    L,
    "turned and back: the own layout is still in use",
    await P.ev(() => document.getElementById("hud").classList.contains("custom")),
  );
  // the editor from the pause menu gives the HUD back to the pause menu
  await P.ev(() => window.__riftTest.game.pause());
  await P.tap("#pauseSetBtn");
  await P.tap("#hudEditBtn");
  check(L, "the editor opens from the pause menu", (await P.vis("hudEdit")) && (await P.vis("dashBtn")));
  await P.tap("#heReset");
  check(
    L,
    "Reset puts the default layout back",
    !(await P.ev(() => document.getElementById("hud").classList.contains("custom"))),
  );
  await P.tap("#heCancel");
  check(
    L,
    "Cancel goes back to the settings of the pause menu, the HUD stays covered",
    (await P.vis("settings")) &&
      (await P.ev(() => document.getElementById("hud").style.visibility === "hidden")) &&
      eq((await P.stored()).settings.hudLayout, stored.settings.hudLayout),
  );
  check(L, "no page errors", !P.errors.length, P.errors.join(" | "));
  await P.close();
});

// 3.20.0: the Ultra look (Settings, Graphics: Ultra): the button is there and saves, the look turns on (a filmic tone curve,
// real shadows, the graded pass) and off again without a trace, and no shader fails to compile
await section("ultra", async (L) => {
  const P = await open("desktop", {
    save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }),
    draw: true,
  });
  const glErrors = [];
  P.page.on("console", (m) => m.type() === "error" && glErrors.push(m.text().slice(0, 200)));
  await P.boot();
  await P.tap('[data-go="settings"]');
  check(
    L,
    "the Graphics setting has an Ultra button",
    await P.ev(() => !!document.querySelector('#setQuality [data-v="ultra"]')),
  );
  await P.tap('#setQuality [data-v="ultra"]');
  await P.page.waitForTimeout(400);
  check(L, "tapping it saves the setting", (await P.stored()).settings.quality === "ultra");
  const look = () =>
    P.ev(() => {
      const r = window.__riftTest.renderer;
      return {
        on: r.look.on,
        tone: r.renderer.toneMapping,
        shadows: r.renderer.shadowMap.enabled,
        sun: r.sun.castShadow,
        catcher: r.look.catcher.visible,
        blob: r.shadows.mesh.visible,
      };
    });
  const on = await look();
  check(
    L,
    "the look is on: tone curve, shadow map, the catcher; the blob shadows are off",
    on.on && on.tone !== 0 && on.shadows && on.sun && on.catcher && !on.blob,
    JSON.stringify(on),
  );
  await P.ev(() => {
    window.__riftTest.game.startRun({});
  });
  await P.page.waitForFunction(
    () => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight",
    null,
    {
      timeout: 30000,
    },
  );
  await P.page.waitForTimeout(2500);
  const solids = await P.ev(() => {
    let cast = 0;
    window.__riftTest.renderer.scene.traverse((o) => o.isMesh && o.castShadow && cast++);
    return cast;
  });
  check(L, "the solids of the scene cast shadows", solids > 20, String(solids));
  await P.shot({ path: new URL("./shots/qa-ultra.png", import.meta.url).pathname });
  check(L, "no shader or GL errors in the console", !glErrors.length, glErrors.slice(0, 2).join(" | "));
  // back to High: nothing of the look is left
  await P.ev(() => {
    const T = window.__riftTest;
    T.store.data.settings.quality = "high";
    T.game.settingsChanged(true);
  });
  await P.page.waitForTimeout(1500);
  const off = await look();
  check(
    L,
    "back on High the look is off: no tone curve, no shadow map, the blob shadows are back",
    !off.on && off.tone === 0 && !off.shadows && !off.sun && !off.catcher && off.blob,
    JSON.stringify(off),
  );
  check(L, "no shader or GL errors after switching back", !glErrors.length, glErrors.slice(0, 2).join(" | "));
  check(L, "no page errors", !P.errors.length, P.errors.slice(0, 2).join(" | "));
  await P.close();
});

// 3.21.0: the recap of a lost run on the end screen: the last hits, the final blow, the damage taken by source
for (const profName of ["desktop", "phone"]) {
  await section(`recap-${profName}`, async (L) => {
    const P = await open(profName, { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
    await P.boot();
    await P.ev(() => {
      const T = window.__riftTest;
      T.game.startRun({});
    });
    await P.page.waitForFunction(
      () => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight",
      null,
      {
        timeout: 30000,
      },
    );
    // three hits from three sources, the last one kills
    await P.ev(() => {
      const w = window.__riftTest.game.world,
        p = w.player;
      w.god = false;
      p.hp = p.maxHp = 400;
      const hit = (dmg, src) => {
        p.iT = 0;
        p.dashT = 0;
        p.shield = false;
        w.time += 1.5;
        w.hurtPlayer(dmg, null, null, src);
      };
      hit(12, "grunt");
      hit(30, "brute");
      p.hp = 20;
      hit(200, "turret");
    });
    await P.page.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 60000 });
    await P.page.waitForTimeout(500);
    const rec = await P.ev(() => {
      const box = document.getElementById("overRecap");
      return {
        hidden: box.hidden,
        rows: [...box.querySelectorAll(".hit")].map((r) => r.textContent.replace(/\s+/g, " ").trim()),
        final: [...box.querySelectorAll(".hit.final")].length,
        text: box.textContent,
        fits: (() => {
          const r = box.getBoundingClientRect();
          return r.right <= innerWidth + 1 && r.left >= -1;
        })(),
      };
    });
    check(L, "the recap is shown on the end screen", !rec.hidden && rec.rows.length === 3, JSON.stringify(rec.rows));
    check(
      L,
      "it names who hit (the last one marked as the final blow), with the damage",
      rec.final === 1 &&
        /grunt|Grunt/i.test(rec.rows[0]) &&
        /final blow/.test(rec.rows[2]) &&
        /\u2212/.test(rec.rows[2]),
      rec.rows.join(" | "),
    );
    check(L, "it lists where most damage came from", /Most damage taken from/.test(rec.text), rec.text.slice(-120));
    await P.shot({ path: new URL(`./shots/qa-recap-${profName}.png`, import.meta.url).pathname });
    check(L, "it fits the screen", rec.fits);
    // a won run has no recap
    check(L, "no page errors", !P.errors.length, P.errors.slice(0, 2).join(" | "));
    await P.close();
  });
}

// 3.22.0: the numbers behind the build in the pause menu: the value now and how far it is from the plain weapon
for (const profName of ["desktop", "phone"]) {
  await section(`stats-${profName}`, async (L) => {
    const P = await open(profName, { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
    await P.boot();
    await P.ev(() => {
      const T = window.__riftTest;
      T.game.startRun({});
    });
    await P.page.waitForFunction(
      () => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight",
      null,
      {
        timeout: 30000,
      },
    );
    await P.ev(() => {
      const w = window.__riftTest.game.world;
      w.up.dmg = 2;
      w.up.speed = 1;
      w.stats = window.__riftTest.computeStats(w.weapon, w.up, w.ws);
      window.__riftTest.game.pause();
    });
    await P.page.waitForTimeout(500);
    const rows = await P.ev(() => {
      const box = document.getElementById("pauseStatRows"),
        cells = [...box.children].map((c) => c.textContent.trim()),
        out = {};
      for (let i = 0; i + 2 < cells.length; i += 3) out[cells[i]] = { v: cells[i + 1], d: cells[i + 2] };
      const r = box.getBoundingClientRect();
      return { out, count: cells.length / 3, inView: r.right <= innerWidth + 1 };
    });
    check(L, "the pause menu lists the numbers of the build", rows.count >= 12, String(rows.count));
    check(
      L,
      "damage per hit is up 36 % (two levels of Overclock), the dash cooldown down",
      rows.out["Damage per hit"]?.d === "+36%" && /^\u2212\d+%$/.test(rows.out["Dash cooldown"]?.d || ""),
      JSON.stringify([rows.out["Damage per hit"], rows.out["Dash cooldown"]]),
    );
    check(
      L,
      "the hull shows what is left over what there is",
      /^\d+ \/ \d+$/.test(rows.out.Hull?.v || ""),
      rows.out.Hull?.v,
    );
    check(L, "unchanged numbers show no change", rows.out["Armor"]?.d === "", JSON.stringify(rows.out["Armor"]));
    await P.shot({ path: new URL(`./shots/qa-stats-${profName}.png`, import.meta.url).pathname });
    check(L, "it fits the screen", rows.inView);
    check(L, "no page errors", !P.errors.length, P.errors.slice(0, 2).join(" | "));
    await P.close();
  });
}

// 3.22.0: a look at the next wave under the title of the upgrade choice
await section("nextwave", async (L) => {
  const P = await open("desktop", { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
  await P.boot();
  await P.ev(() => window.__riftTest.game.startRun({}));
  await P.page.waitForFunction(
    () => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight",
    null,
    {
      timeout: 30000,
    },
  );
  const chips = async (cleared) => {
    await P.ev((n) => {
      const g = window.__riftTest.game,
        w = g.world;
      g.chooseShown = false;
      w.god = true;
      w.wave = n;
      for (const e of [...w.enemies]) w.killEnemy(e);
      w.beginChoice();
    }, cleared);
    await P.page.waitForFunction(() => !document.getElementById("choose").hidden, null, { timeout: 30000 });
    await P.page.waitForTimeout(300);
    return P.ev(() => [...document.querySelectorAll("#nextWave .nw")].map((c) => c.textContent.trim()));
  };
  // after wave 4 the boss of wave 5 comes (Blackout City: the Warden); after wave 5 the second biome starts
  const beforeBoss = await chips(4);
  check(
    L,
    "after wave 4 it announces wave 5 and its boss",
    beforeBoss[0] === "Wave 5" && beforeBoss.some((c) => /^Boss/.test(c)),
    beforeBoss.join(" | "),
  );
  const newBiome = await chips(5);
  check(
    L,
    "after wave 5 it announces the new biome",
    newBiome.some((c) => /^Entering /.test(c)),
    newBiome.join(" | "),
  );
  const traps = await chips(7);
  check(
    L,
    "from wave 6 on it says that traps are on the floor",
    traps.includes("Traps on the floor"),
    traps.join(" | "),
  );
  await P.shot({ path: new URL("./shots/qa-nextwave.png", import.meta.url).pathname });
  check(L, "no page errors", !P.errors.length, P.errors.slice(0, 2).join(" | "));
  await P.close();
});

// 3.23.0: the gamepad (a faked controller): sticks, buttons, pause, the rumble, and the ring of focus in the menus
await section("gamepad", async (L) => {
  const P = await open("desktop", { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
  await P.boot();
  await P.ev(() => {
    const pad = {
      id: "Test Pad (STANDARD GAMEPAD)",
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      vibrationActuator: { playEffect: (...a) => (window.__rumbles = window.__rumbles || []).push(a) },
    };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
  });
  const frames = (n = 3) =>
    P.ev(
      (n) =>
        new Promise((resolve) => {
          let left = n;
          const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
      n,
    );
  const hold = async (button, n = 4) => {
    await P.ev((b) => ((window.__pad.buttons[b].pressed = true), (window.__pad.buttons[b].value = 1)), button);
    await frames(n);
    await P.ev((b) => ((window.__pad.buttons[b].pressed = false), (window.__pad.buttons[b].value = 0)), button);
    await frames(2);
  };
  // the menus: the D-pad moves a ring of focus, A presses, B goes back
  await frames(3);
  const focused = () =>
    P.ev(
      () =>
        document.querySelector(".pad-focus")?.getAttribute("data-go") || document.querySelector(".pad-focus")?.id || "",
    );
  await hold(13); // down
  const first = await focused();
  check(
    L,
    "the D-pad puts the ring of focus on a button of the home screen",
    first !== "" || (await P.ev(() => !!document.querySelector(".pad-focus"))),
    first,
  );
  let reached = false;
  for (let i = 0; i < 10 && !reached; i++) {
    reached = (await P.ev(() => document.querySelector(".pad-focus")?.getAttribute("data-go") === "settings")) || false;
    if (!reached) await hold(i % 2 ? 13 : 15);
  }
  check(L, "the ring walks to Settings", reached);
  await hold(0); // A
  await P.page.waitForTimeout(500);
  check(L, "A presses it: the settings open", await P.vis("settings"));
  await hold(1); // B
  await P.page.waitForTimeout(500);
  check(L, "B goes back to the home screen", (await P.vis("home")) && !(await P.vis("settings")));
  // a run: the left stick moves, A dashes, Start pauses, the rumble answers a hit
  await P.ev(() => window.__riftTest.game.startRun({}));
  await P.page.waitForFunction(
    () => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight",
    null,
    {
      timeout: 30000,
    },
  );
  await P.ev(() => (window.__riftTest.game.world.god = true));
  const x0 = await P.ev(() => window.__riftTest.game.world.player.x);
  await P.ev(() => (window.__pad.axes[0] = 1));
  await frames(10);
  await P.ev(() => (window.__pad.axes[0] = 0));
  const x1 = await P.ev(() => window.__riftTest.game.world.player.x);
  check(L, "the left stick moves the drone to the right", x1 > x0 + 0.5, `${x0.toFixed(2)} -> ${x1.toFixed(2)}`);
  // the right stick aims (up) and fires
  await P.ev(() => {
    window.__riftTest.game.world.pb.length = 0;
    window.__pad.axes[3] = -1;
  });
  await frames(12);
  const aim = await P.ev(() => ({
    aim: window.__riftTest.game.world.player.aim,
    shots: window.__riftTest.game.world.pb.length,
  }));
  await P.ev(() => (window.__pad.axes[3] = 0));
  check(
    L,
    "the right stick aims up and fires",
    Math.abs(aim.aim + Math.PI / 2) < 0.35 && aim.shots > 0,
    JSON.stringify(aim),
  );
  const d0 = await P.ev(() => window.__riftTest.game.world.runStats.dashes);
  await P.ev(() => (window.__riftTest.game.world.player.dashCdT = 0));
  await hold(0);
  check(L, "A dashes", (await P.ev(() => window.__riftTest.game.world.runStats.dashes)) > d0);
  await P.ev(() => {
    const w = window.__riftTest.game.world;
    w.god = false;
    w.player.iT = 0;
    w.player.dashT = 0;
    w.player.shield = false;
    w.hurtPlayer(3, null, null, "grunt");
    w.god = true;
  });
  await frames(4);
  check(L, "a hit makes the controller rumble", (await P.ev(() => (window.__rumbles || []).length)) >= 1);
  await hold(9); // Start
  check(L, "Start pauses the run", await P.ev(() => window.__riftTest.game.paused));
  await hold(9);
  check(L, "Start resumes it", !(await P.ev(() => window.__riftTest.game.paused)));
  // without a controller nothing is left of it
  await P.ev(() => (navigator.getGamepads = () => []));
  await frames(3);
  check(L, "no controller: no ring of focus in the way", !(await P.ev(() => !!document.querySelector(".pad-focus"))));
  check(L, "no page errors", !P.errors.length, P.errors.slice(0, 2).join(" | "));
  await P.close();
});

// 3.23.0: a phone buzzes on a hit and on the end of a run (Android: navigator.vibrate), and not when the setting is off
await section("vibration-phone", async (L) => {
  const P = await open("phone", { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
  await P.boot();
  await P.ev(() => {
    window.__buzz = [];
    navigator.vibrate = (pattern) => (window.__buzz.push(pattern), true);
    window.__riftTest.game.startRun({});
  });
  await P.page.waitForFunction(
    () => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight",
    null,
    {
      timeout: 30000,
    },
  );
  const hurt = () =>
    P.ev(() => {
      const w = window.__riftTest.game.world;
      w.god = false;
      w.player.hp = w.player.maxHp = 500;
      w.player.iT = 0;
      w.player.dashT = 0;
      w.player.shield = false;
      w.hurtPlayer(4, null, null, "grunt");
    });
  await hurt();
  await P.page.waitForTimeout(800);
  check(
    L,
    "a hit buzzes the phone",
    (await P.ev(() => window.__buzz.length)) >= 1,
    await P.ev(() => JSON.stringify(window.__buzz)),
  );
  await P.ev(() => {
    window.__buzz.length = 0;
    const T = window.__riftTest;
    T.store.data.settings.vibration = false;
    T.game.settingsChanged(true);
  });
  await hurt();
  await P.page.waitForTimeout(800);
  check(L, "with Vibration off it stays still", (await P.ev(() => window.__buzz.length)) === 0);
  check(L, "no page errors", !P.errors.length, P.errors.slice(0, 2).join(" | "));
  await P.close();
});

// 3.24.0: boss medals: the banner of a kill, the best one kept per boss, the Codex shows it
await section("medals", async (L) => {
  const P = await open("desktop", { save: JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }) });
  await P.boot();
  await P.ev(() => window.__riftTest.game.startRun({}));
  await P.page.waitForFunction(
    () => window.__riftTest.game.world && window.__riftTest.game.world.state === "fight",
    null,
    {
      timeout: 30000,
    },
  );
  const kill = (secs, damage) =>
    P.ev(
      ([secs, damage]) => {
        const w = window.__riftTest.game.world;
        w.god = true;
        if (!w.boss) w.spawnBoss("warden");
        w.bossT0 = w.time - secs;
        w.bossDmg0 = w.runStats.dmgTaken - damage;
        const boss = w.boss;
        boss.hp = 0;
        w.killEnemy(boss);
      },
      [secs, damage],
    );
  const banner = () => P.ev(() => document.getElementById("toasts").textContent);
  await kill(30, 0);
  await P.page.waitForFunction(() => /medal/i.test(document.getElementById("toasts").textContent), null, {
    timeout: 15000,
  });
  check(L, "a hitless kill in 30 s earns Gold and says so", /Gold medal/i.test(await banner()), await banner());
  const stored = () => P.ev(() => window.__riftTest.store.data.stats.medals.warden);
  check(
    L,
    "the medal is kept",
    (await stored())?.medal === 3 && (await stored()).secs === 30,
    JSON.stringify(await stored()),
  );
  // a worse kill later does not take it away
  await P.ev(() => (window.__riftTest.game.world.state = "fight"));
  await kill(90, 60);
  await P.page.waitForTimeout(600);
  check(L, "a worse kill later does not replace it", (await stored())?.medal === 3, JSON.stringify(await stored()));
  // the Codex
  await P.ev(() => {
    window.__riftTest.game.abandon && window.__riftTest.game.abandon();
  });
  await P.page.waitForTimeout(500);
  await P.ev(() => {
    const T = window.__riftTest;
    T.ui.save = T.store.data;
    T.ui.recordsTab("codex");
  });
  const codex = await P.ev(() => document.querySelector('[data-cx="boss_warden"]')?.textContent || "");
  check(
    L,
    "the Codex shows Gold and the time on the boss",
    /Gold/.test(codex) && /30 s/.test(codex),
    codex.slice(0, 120),
  );
  check(L, "no page errors", !P.errors.length, P.errors.slice(0, 2).join(" | "));
  await P.close();
});

if (!sectionsRun) log("filter", "FAIL", `no section matches "${ONLY}"`);
await browser.close();
console.log(out.join("\n"));
console.log(`\nFULL QA: ${fails ? fails + " FAIL" : "all checks passed"}`);
process.exit(fails ? 1 : 0);
