// Determinism ("golden") test: proves that a refactor did not change game behaviour.
//
// Runs fixed-seed simulations directly on the world class (window.__riftTest.World, no rendering,
// no UI loop) with a deterministic bot, plus cheap checks of pure functions (stat computation,
// arena layouts, wave planner, upgrade offers, data tables). Every case yields a compact record;
// the record is hashed (FNV-1a over canonical JSON) into one digest per case and compared with
// tests/fixtures/determinism.json.
//
// Usage: node tools/qa.js determinism              compare with the golden file
//        node tools/qa.js determinism --update     rewrite the golden file from this build
//        node tools/qa.js determinism sim-pulse    only the cases whose name contains "sim-pulse"
//
// Only update the golden file when a change is MEANT to alter game behaviour (balance, new
// content, bug fixes in the simulation). A pure refactor must pass without --update.
//
// What the simulation must not depend on: Math.random, Date, performance.now, rendering, the UI
// or the save store. The world uses its own seeded RNG (qi/Yi) for everything that matters, with
// one exception found when this test was written (2.4.4): the void portal warp of player shots
// emits its "warp" fx event only with Math.random() < 0.5 (cosmetic, no effect on the state).
// Because the fx counts are part of the record, Math.random is replaced by a seeded generator for
// the duration of each case (reset per case) and its calls are counted in the record (`rnd`).
// Date.now and performance.now are wrapped too; any call during a simulation fails the case.
//
// The state hashes only read long-standing, semantic fields (wave, state, time, kills, shards,
// dmgDealt, player x/y/vx/vy/hp/nova, enemies id/type/x/y/vx/vy/hp, pickups kind/x/y/v, pb/eb
// x/y, rng.state, offer). If a refactor renames one of them, adapt `snap()` below instead of
// regenerating the golden file.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const PAGE_URL = process.argv[2] || "http://localhost:8124/index.html";
const extra = process.argv.slice(3);
const UPDATE = extra.includes("--update");
const filters = extra.filter((a) => !a.startsWith("--"));
const GOLDEN = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "determinism.json");

// FNV-1a, two 32-bit lanes (different offset bases) -> 16 hex digits. Same code runs in the page.
const FNV_SRC = `(s) => {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}`;
// Canonical JSON: sorted keys, functions dropped, cycles cut. Numbers keep full precision.
const CANON_SRC = `(v) => {
  const seen = new WeakSet();
  const walk = (x) => {
    if (x === null || typeof x !== 'object') return typeof x === 'function' ? undefined : x;
    if (seen.has(x)) return '[cycle]';
    seen.add(x);
    let r;
    if (Array.isArray(x)) r = x.map((y) => { const z = walk(y); return z === undefined ? null : z; });
    else if (ArrayBuffer.isView(x)) r = Array.from(x);
    else if (x instanceof Set) r = { $set: [...x].map(walk) };
    else if (x instanceof Map) r = { $map: [...x].map(([k, y]) => [walk(k), walk(y)]) };
    else {
      r = {};
      for (const k of Object.keys(x).sort()) { const z = walk(x[k]); if (z !== undefined) r[k] = z; }
    }
    seen.delete(x);
    return r;
  };
  return JSON.stringify(walk(v));
}`;
const fnv = eval(FNV_SRC),
  canon = eval(CANON_SRC);

// ---- cases ------------------------------------------------------------------------------------
const WS_MID = {
  hull: 2,
  power: 2,
  thrust: 1,
  dash: 1,
  magnet: 1,
  salvage: 1,
  nova: 1,
  armorCore: 1,
  droneBay: 1,
  fieldSupply: 1,
};
const WS_FULL = "max"; // every workshop module at its highest level (resolved in the page)
const SIMS = [
  { name: "sim-pulse-t0", seed: 101, weapon: "pulse", threat: 0, ws: {}, to: 12 },
  { name: "sim-scatter-t2", seed: 202, weapon: "scatter", threat: 2, ws: WS_MID, to: 12 },
  { name: "sim-tesla-t5", seed: 303, weapon: "tesla", threat: 5, ws: WS_FULL, to: 12 },
  { name: "sim-rail-t0", seed: 404, weapon: "rail", threat: 0, ws: WS_FULL, to: 12 },
  { name: "sim-rocket-t2", seed: 505, weapon: "rocket", threat: 2, ws: {}, to: 12 },
  { name: "sim-disc-t5", seed: 606, weapon: "disc", threat: 5, ws: WS_MID, to: 12 },
  {
    name: "sim-flame-t2",
    seed: 707,
    weapon: "flame",
    threat: 2,
    ws: { hull: 5, power: 5, droneBay: 2, insight: 1, reroll: 2 },
    to: 12,
  },
  // through the Rift Core (wave 20), the victory state and continueEndless() into Endless
  {
    name: "sim-pulse-t2-endless",
    seed: 0x2201,
    weapon: "pulse",
    threat: 2,
    ws: { hull: 5, power: 5, droneBay: 2 },
    to: 22,
  },
  // save/restore: snapshot() at the wave-6 choice, sanitize (cleanRun), new world from the snapshot
  { name: "sim-scatter-t1-resume", seed: 818, weapon: "scatter", threat: 1, ws: WS_MID, to: 10, resumeAt: 6 },
  // no god mode: real damage, death (or survival) with the armour and revive modules
  {
    name: "sim-rocket-t5-mortal",
    seed: 919,
    weapon: "rocket",
    threat: 5,
    ws: { revive: 1, armorCore: 2 },
    to: 12,
    mortal: true,
  },
];
const CASES = [
  { name: "data-tables", kind: "data" },
  { name: "stats-nr", kind: "stats" },
  { name: "layouts-su", kind: "layouts" },
  { name: "planner-waves", kind: "planner" },
  ...SIMS.map((s) => ({ kind: "sim", ...s })),
  // same case again after all others: catches state that leaks between worlds through globals
  { ...SIMS[0], kind: "sim", name: "repeat-sim-pulse-t0", repeatOf: "sim-pulse-t0" },
];

// ---- in-page library ----------------------------------------------------------------------------
function installLib({ FNV_SRC, CANON_SRC, WS_MID }) {
  const T = window.__riftTest,
    D = T.data;
  const fnv = eval(FNV_SRC),
    canon = eval(CANON_SRC),
    H = (v) => fnv(canon(v));
  // Seeded stand-ins for the non-deterministic globals, active only while a case runs.
  const guard = (seed, fn) => {
    const rnd0 = Math.random,
      now0 = Date.now,
      perf0 = performance.now;
    let s = seed >>> 0,
      rnd = 0,
      clock = 0;
    Math.random = () => {
      rnd++;
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Date.now = () => (clock++, now0.call(Date));
    performance.now = () => (clock++, perf0.call(performance));
    try {
      const out = fn();
      return { out, rnd, clock };
    } finally {
      Math.random = rnd0;
      Date.now = now0;
      performance.now = perf0;
    }
  };
  const wsOf = (ws) =>
    ws === "max" ? Object.fromEntries(T.workshopModules.map((m) => [m.id, m.costs.length])) : { ...ws };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  // Full-precision state fingerprint of a world.
  const snap = (w) => ({
    wave: w.wave,
    state: w.state,
    endless: !!w.endless,
    time: w.time,
    kills: w.kills,
    shards: w.shards,
    dmg: w.dmgDealt,
    rng: w.rng && w.rng.state,
    offer: w.offer ? [...w.offer] : null,
    p: [w.player.x, w.player.y, w.player.vx, w.player.vy, w.player.hp, w.player.nova, w.player.alive],
    e: w.enemies.map((e) => [e.id, e.type, e.x, e.y, e.vx, e.vy, e.hp, !!e.dead]),
    k: w.pickups.map((q) => [q.kind, q.x, q.y, q.v]),
    pb: w.pb.map((b) => [b.x, b.y]),
    eb: w.eb.map((b) => [b.x, b.y]),
  });
  // Deterministic bot (same shape as tests/sim.mjs and tests/run-audit.mjs).
  const botInput = (w, step) => {
    const p = w.player;
    let tgt = null,
      best = 1e9;
    for (const e of w.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < best) {
        best = d;
        tgt = e;
      }
    }
    const inp = {
      mx: 0,
      my: 0,
      aim: false,
      fire: true,
      auto: true,
      assist: true,
      dash: step % 180 === 0,
      nova: p.nova >= 100,
    };
    if (tgt) {
      const a = Math.atan2(tgt.y - p.y, tgt.x - p.x),
        k = best < 5 ? -1 : best > 9 ? 1 : 0.3;
      inp.aim = true;
      inp.ax = Math.cos(a);
      inp.ay = Math.sin(a);
      inp.mx = Math.cos(a) * k + Math.cos(a + 1.57) * 0.5;
      inp.my = Math.sin(a) * k + Math.sin(a + 1.57) * 0.5;
    } else if (w.pickups.length) {
      const q = w.pickups[0],
        a = Math.atan2(q.y - p.y, q.x - p.x);
      inp.mx = Math.cos(a);
      inp.my = Math.sin(a);
    }
    return inp;
  };
  const sim = (c) => {
    const ws = wsOf(c.ws);
    let w = new T.World({ seed: c.seed, weapon: c.weapon, threat: c.threat, ws });
    const fx = {},
      trace = [],
      salt = c.seed % 7;
    let steps = 0,
      waveSteps = 0,
      breaks = 0,
      resumed = null,
      rerolls = 0;
    const MAX_WAVE_STEPS = 60 * 180; // stuck breaker (deterministic): clears the wave after 180 s
    w.god = !c.mortal;
    while (steps < 200000) {
      if (w.state === "dead") {
        if (w.stateT > 2) break;
      }
      if (w.state === "choose") {
        trace.push(H(snap(w)));
        if (w.wave >= c.to) break;
        if (c.resumeAt && w.wave === c.resumeAt && !resumed) {
          const s = D.cleanRun(JSON.parse(JSON.stringify(w.snapshot())));
          resumed = H(s);
          w = new T.World({ snap: s, ws });
          w.god = !c.mortal;
          trace.push(H(snap(w)));
        }
        if (w.wave % 4 === 3 && w.rerolls > 0 && w.reroll()) rerolls++;
        w.choose(w.offer[(w.wave * 7 + salt) % w.offer.length]);
        waveSteps = 0;
      } else if (w.state === "victory") {
        if (w.stateT === 0) trace.push(H(snap(w)));
        if (w.wave >= c.to) break;
        if (w.stateT > 1) w.continueEndless(); // like the Endless button after the victory screen
      }
      w.step(1 / 60, botInput(w, steps));
      steps++;
      waveSteps++;
      for (const f of w.fx) fx[f.k] = (fx[f.k] || 0) + 1;
      w.fx.length = 0;
      if (waveSteps > MAX_WAVE_STEPS && w.state === "fight") {
        breaks++;
        for (const e of [...w.enemies]) w.killEnemy(e);
        w.planIdx = w.plan.length;
        w.markers = [];
        waveSteps = 0;
      }
    }
    const p = w.player;
    return {
      wave: w.wave,
      state: w.state,
      endless: !!w.endless,
      steps,
      kills: w.kills,
      shards: w.shards,
      dmg: Math.round(w.dmgDealt),
      hp: r3(p.hp),
      nova: r3(p.nova),
      time: r3(w.time),
      rerolls,
      up: Object.keys(w.up)
        .sort()
        .map((k) => k + (w.up[k] > 1 ? "×" + w.up[k] : ""))
        .join(" "),
      bossKills: [...(w.bossKills || [])].join(","),
      revived: !!w.revived,
      breaks,
      enemies: w.enemies.length,
      pickups: w.pickups.length,
      resumed,
      fx: Object.fromEntries(
        Object.keys(fx)
          .sort()
          .map((k) => [k, fx[k]]),
      ),
      trace,
      final: H(snap(w)),
    };
  };
  const data = () => {
    // The keys keep the old short names on purpose: they are part of the hashed record, so renaming
    // them would change the data-tables hash in tests/fixtures/determinism.json.
    const tables = {
      ue: T.weaponDefs,
      Ae: T.enemyDefs,
      ri: T.upgradesById,
      ai: T.workshopModules,
      ii: T.biomeList,
      Zi: D.upgradeList,
      En: D.weaponOrder,
      lu: D.enemyOrder,
      Ip: D.spawnWeights,
      ec: D.heavyEnemies,
      Mu: D.obstacleShapes,
      Dp: D.mapTemplates,
      cu: D.biomeVariants,
      _i: D.milestones,
      si: D.threatLevels,
      en: D.bossDefs,
      Kl: D.bossOrder,
      uu: D.bossByWave,
      $i: D.waveEvents,
      Qf: D.musicChords,
      tp: D.musicVoices,
      Oh: D.defaultSettings,
      hazard: D.RL_BIOME_HAZARD,
      kiters: D.RL_KITERS,
      events: D.RL_EVENT_KINDS,
    };
    const out = {};
    for (const k of Object.keys(tables)) out[k] = H(tables[k]);
    out.threat = H([0, 1, 2, 3, 4, 5].map(D.threatMods));
    out.range = H(D.weaponOrder.map((id) => D.weaponRange(T.weaponDefs[id])));
    return out;
  };
  const stats = () => {
    const ids = D.upgradeList.map((u) => u.id),
      maxOf = Object.fromEntries(D.upgradeList.map((u) => [u.id, u.max || 1]));
    const upSets = [
      {},
      Object.fromEntries(ids.map((id) => [id, maxOf[id]])),
      { dmg: 3, surge: 2, crit: 2, resonance: 1, hp: 2, speed: 1, skates: 1, reactive: 1 },
      { speed: 6, hazmat: 4, pierce: 2, echo: 1, siphon: 1, overcharge: 4, heatsink: 2, slipstream: 1 },
    ];
    for (const id of ids) upSets.push({ [id]: 1 });
    const wsSets = [{}, wsOf(WS_MID), wsOf("max")];
    const out = {};
    for (const wid of D.weaponOrder) {
      const rows = [];
      for (const up of upSets) for (const ws of wsSets) rows.push(T.computeStats(wid, up, ws));
      out[wid] = H(rows);
    }
    out.n = D.weaponOrder.length * upSets.length * wsSets.length;
    return out;
  };
  const layouts = () => {
    const out = {},
      seeds = [1, 7, 4242, 0xdeadbeef],
      waves = [1, 2, 3, 4, 6, 7, 9, 12, 13, 17, 21, 28, 33];
    const w0 = new T.World({ seed: 1, weapon: "pulse", threat: 0, ws: {} });
    let n = 0;
    for (const b of T.biomeList) {
      const rows = [];
      for (const s of seeds)
        for (const wave of waves) {
          rows.push(T.buildLayout(b, s, wave, wave === 1 || !!w0.bossFor(wave)));
          n++;
        }
      rows.push(T.buildLayout(b, 99, 10, true));
      out[b.id] = H(rows);
    }
    out.n = n;
    return out;
  };
  const planner = () => {
    const out = {};
    for (const seed of [3, 1234, 0x51f7])
      for (const threat of [0, 2, 5]) {
        const w = new T.World({ seed, weapon: "pulse", threat, ws: { fieldSupply: 1 } }),
          rows = [];
        rows.push(w.route);
        for (let wave = 1; wave <= 40; wave++) {
          if (wave > 1) w.startWave(wave);
          const offerBoss = !!w.bossFor(wave);
          w.offerBoss = offerBoss;
          rows.push({
            wave,
            biome: w.arena.biome.id,
            key: w.arena.key,
            event: w.event,
            mode: w.waveMode,
            intensity: w.waveIntensity,
            champion: w.championPending,
            boss: w.bossPending,
            hpMul: w.hpMul,
            dmgMul: w.dmgMul,
            plan: w.plan,
            total: w.planTotal,
            caches: w.pickups.map((q) => [q.kind, q.x, q.y, q.v]),
            offer: w.makeOffer(),
          });
          w.fx.length = 0;
        }
        out[seed + "/" + threat] = H(rows);
      }
    return out;
  };
  window.__det = {
    run(c) {
      const t0 = performance.now();
      const fn = { sim: () => sim(c), data, stats, layouts, planner }[c.kind];
      const g = guard(0x5eed ^ (c.seed || 0), fn);
      return { rec: { ...g.out, rnd: g.rnd }, clock: g.clock, ms: Math.round(performance.now() - t0) };
    },
  };
  return Object.keys(T);
}

// ---- runner -------------------------------------------------------------------------------------
const t0 = Date.now();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(PAGE_URL);
await page.waitForFunction(() => window.__riftTest && window.__riftTest.World, null, { timeout: 60000 });
await page.evaluate(installLib, { FNV_SRC, CANON_SRC, WS_MID });

const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, "utf8")) : { cases: {} };
const results = {};
let fails = 0;
const line = (st, name, detail) => {
  console.log(`[${st}] determinism · ${name}${detail ? " — " + detail : ""}`);
  if (st === "FAIL") fails++;
};
const diff = (a, b, pre = "") => {
  const out = [];
  if (canon(a) === canon(b)) return out;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])])
      out.push(...diff(a[k], b[k], pre ? pre + "." + k : k));
    return out;
  }
  return [`${pre}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
};

for (const c of CASES) {
  if (filters.length && !filters.some((f) => c.name.includes(f))) continue;
  let r;
  try {
    r = await page.evaluate((c) => window.__det.run(c), c);
  } catch (e) {
    line("FAIL", c.name, "exception: " + String(e.message).split("\n")[0]);
    continue;
  }
  const digest = fnv(canon(r.rec));
  results[c.name] = { digest, rec: r.rec };
  const info = `${digest} (${r.ms} ms)`;
  if (r.clock) {
    line("FAIL", c.name, `simulation read the clock ${r.clock}× (Date.now/performance.now)`);
    continue;
  }
  if (c.repeatOf) {
    const first = results[c.repeatOf];
    if (first && first.digest !== digest) {
      line(
        "FAIL",
        c.name,
        `differs from ${c.repeatOf} in the same page: ${diff(first.rec, r.rec).slice(0, 4).join("; ")}`,
      );
      continue;
    }
  }
  if (UPDATE) {
    line("PASS", c.name, "recorded " + info);
    continue;
  }
  const g = golden.cases[c.name];
  if (!g) {
    line("FAIL", c.name, `not in ${path.basename(GOLDEN)} (run with --update) · ${info}`);
    continue;
  }
  if (g.digest === digest) {
    line("PASS", c.name, info);
    continue;
  }
  const d = diff(g.rec, r.rec);
  const tr = g.rec.trace && r.rec.trace ? g.rec.trace.findIndex((h, i) => h !== r.rec.trace[i]) : -1;
  line("FAIL", c.name, `expected ${g.digest}, got ${info}${tr >= 0 ? ` · first differing checkpoint #${tr}` : ""}`);
  for (const x of d.filter((x) => !x.startsWith("trace.")).slice(0, 12)) console.log("       " + x);
}
if (!filters.length && !UPDATE)
  for (const name of Object.keys(golden.cases))
    if (!results[name]) line("FAIL", name, "in the golden file but no longer run");
if (errors.length) line("FAIL", "page errors", errors.slice(0, 3).join(" | "));

if (UPDATE) {
  if (fails) {
    console.log("\nDETERMINISM: not updated, fix the failures first");
    process.exitCode = 1;
  } else {
    const cases = filters.length ? { ...golden.cases } : {};
    for (const [k, v] of Object.entries(results)) cases[k] = { digest: v.digest, rec: v.rec };
    const out = {
      note: "Golden records of tests/determinism.mjs. Regenerate with `node tools/qa.js determinism --update` only for intended behaviour changes.",
      cases,
    };
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 1) + "\n");
    console.log(
      `\nDETERMINISM: golden file updated (${Object.keys(results).length} cases) in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
  }
} else
  console.log(
    `\nDETERMINISM: ${fails ? fails + " FAIL" : "all " + Object.keys(results).length + " cases identical"} in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
await browser.close();
process.exitCode = fails ? 1 : 0;
