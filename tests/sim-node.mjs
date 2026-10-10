// 3.30.0: the simulation in Node, without a browser (seconds instead of minutes). World and its modules need no DOM since
// core/run-hooks.js; only the two version constants that build.js fills in are defined here.
//   node tests/sim-node.mjs      (npm run test:sim; part of npm test)
// Checks: no Math.random in the simulation, the same seed and inputs give the same run, a bot plays every weapon without a
// crash, a non-finite number or a stalled wave, Banish keeps its cards out of the offers, and a snapshot resumes the run.
globalThis.__RL_VERSION__ = "0.0.0";
globalThis.__RL_BUILD__ = "node";
const { World, rlStep } = await import("../src/core/world.js");
const { upgradeList } = await import("../src/data/upgrades.js");
const { weaponOrder } = await import("../src/data/weapons.js");

const t0 = performance.now();
let fails = 0;
const line = (ok, name, detail = "") => {
  if (!ok) fails++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
};
// every random draw of the simulation must come from its seeded RNG
Math.random = () => {
  throw new Error("Math.random called in the simulation");
};

/* a plain bot: circles, backs away from the nearest enemy, fires on its own, dashes when one is close, uses the Nova and
   the Singularity; picks the first card */
function play(world, maxWave, maxSec = 1500) {
  let ang = 0,
    steps = 0,
    waveSteps = 0,
    lastWave = world.wave,
    issue = "";
  while (world.wave <= maxWave && world.state !== "dead" && world.state !== "victory" && steps < maxSec * 60) {
    if (world.state === "choose") {
      world.choose(world.offer[0]);
      continue;
    }
    let near = null,
      nd = 1e9;
    for (const e of world.enemies) {
      const d = Math.hypot(e.x - world.player.x, e.y - world.player.y);
      if (d < nd) {
        nd = d;
        near = e;
      }
    }
    ang += rlStep * 0.6;
    let mx = Math.cos(ang),
      my = Math.sin(ang);
    if (near && nd < 5) {
      mx = (world.player.x - near.x) / nd;
      my = (world.player.y - near.y) / nd;
    }
    world.step(rlStep, {
      mx,
      my,
      auto: true,
      dash: !!near && nd < 2.2,
      nova: world.player.nova >= 100,
      gadget: world.enemies.length > 8,
    });
    world.fx.length = 0;
    steps++;
    if (world.wave !== lastWave) {
      lastWave = world.wave;
      waveSteps = 0;
    } else if (++waveSteps > 240 * 60) {
      issue = `wave ${world.wave} lasted over 240 s (stalled?)`;
      break;
    }
    if (steps % 30 === 0) {
      const p = world.player;
      if (![p.x, p.y, p.hp, p.vx, p.vy].every(Number.isFinite)) issue = "the drone has a non-finite value";
      for (const e of world.enemies)
        if (![e.x, e.y, e.hp].every(Number.isFinite)) issue = `a ${e.type} has a non-finite value`;
      if (issue) break;
    }
  }
  return { steps, issue };
}
const digest = (w) =>
  JSON.stringify([w.wave, w.state, w.kills, w.shards, Math.round(w.player.hp * 1e3), w.player.x.toFixed(6), w.time]);

// 1. the same seed and inputs give the same run (and no Math.random: it throws)
{
  const run = () => {
    const w = new World({ seed: 1234, weapon: "scatter", threat: 1, ws: {}, pacts: [] });
    play(w, 7);
    return digest(w);
  };
  let a, b, err;
  try {
    a = run();
    b = run();
  } catch (e) {
    err = e;
  }
  line(!err && a === b, "same seed, same run", err ? err.message : a);
}

// 2. a bot plays every weapon to wave 12 (Threat II from wave 1, god mode so the run reaches it)
for (const weapon of weaponOrder) {
  let res, err;
  const w = new World({ seed: 77, weapon, threat: 2, ws: {}, pacts: [] });
  w.god = true;
  try {
    res = play(w, 12);
  } catch (e) {
    err = e;
  }
  line(
    !err && !res.issue && w.wave > 12,
    `bot run ${weapon}`,
    err ? err.stack.split("\n").slice(0, 2).join(" ") : res.issue || `wave ${w.wave}, ${w.kills} kills`,
  );
}

// 3. Endless with a maxed build: finite numbers and no crash over a few waves
{
  const up = {};
  for (const u of upgradeList) if (!u.weapon || u.weapon === "flame") up[u.id] = u.max;
  const w = new World({
    seed: 11,
    weapon: "flame",
    threat: 5,
    ws: {},
    pacts: [],
    snap: {
      v: 1,
      seed: 11,
      weapon: "flame",
      threat: 5,
      wave: 60,
      endless: true,
      up,
      hp: 9999,
      shards: 0,
      kills: 0,
      time: 0,
      nova: 0,
    },
  });
  w.god = true;
  let res, err;
  try {
    res = play(w, 62, 400);
  } catch (e) {
    err = e;
  }
  line(!err && !res.issue, "Endless wave 60, maxed flame build", err ? err.message : res.issue || `wave ${w.wave}`);
}

// 4. Banish: a banished card and a banished evolution never come back
{
  const w = new World({ seed: 5, weapon: "pulse", threat: 0, ws: { banish: 2 }, pacts: [] });
  w.state = "choose";
  w.wave = 6;
  w.offerBoss = false;
  w.offer = w.makeOffer();
  const card = w.offer[0];
  w.banish(card);
  let back = 0;
  for (let i = 0; i < 5000; i++) if (w.makeOffer().includes(card)) back++;
  line(back === 0, "banished card stays out", `${card}: ${back} of 5000 offers`);
  const evo = upgradeList.find((u) => u.evo && !u.weapon),
    e = new World({ seed: 9, weapon: "pulse", threat: 0, ws: { banish: 1 }, pacts: [] });
  for (const [id, need] of Object.entries(evo.evo)) e.up[id] = need;
  e.state = "choose";
  e.wave = 8;
  e.offerBoss = false;
  e.offer = e.makeOffer();
  const banished = e.banish(evo.id);
  let evoBack = 0;
  for (let i = 0; i < 500; i++) if (e.makeOffer().includes(evo.id)) evoBack++;
  line(banished && evoBack === 0, "banished evolution stays out", `${evo.id}: ${evoBack} of 500 offers`);
}

// 5. a snapshot at an upgrade choice resumes the same choice, and the run goes on the same way
{
  const w = new World({ seed: 4242, weapon: "rail", threat: 0, ws: {}, pacts: [] });
  w.god = true;
  play(w, 3);
  while (w.state !== "choose") {
    w.step(rlStep, { auto: true });
    w.fx.length = 0;
  }
  const snap = JSON.parse(JSON.stringify(w.snapshot())),
    r = new World({ seed: 1, weapon: "rail", threat: 0, ws: {}, pacts: [], snap });
  const same = r.state === "choose" && JSON.stringify(r.offer) === JSON.stringify(w.offer) && r.wave === w.wave;
  r.god = true;
  w.choose(w.offer[0]);
  r.choose(r.offer[0]);
  for (let i = 0; i < 600; i++) {
    w.step(rlStep, { auto: true });
    r.step(rlStep, { auto: true });
    w.fx.length = r.fx.length = 0;
  }
  line(same && digest(w) === digest(r), "snapshot resumes the run", same ? digest(r) : "the resumed choice differs");
}

// 6. a layout built ahead during the upgrade choice gives the same run, and the wave start takes it
{
  const run = (ahead) => {
    const w = new World({ seed: 31337, weapon: "pulse", threat: 0, ws: {}, pacts: [] });
    w.god = true;
    let used = 0,
      ang = 0;
    while (w.wave <= 8) {
      if (w.state === "choose") {
        if (ahead) w.prefetchLayout();
        const next = w.nextLayout;
        w.choose(w.offer[0]);
        if (next && w.arena && w.arena.key === next.layout.key) used++;
        continue;
      }
      ang += rlStep * 0.6;
      w.step(rlStep, { mx: Math.cos(ang), my: Math.sin(ang), auto: true });
      w.fx.length = 0;
    }
    return { d: digest(w), used };
  };
  const a = run(false),
    b = run(true);
  line(a.d === b.d && b.used >= 5, "layout built ahead", `same run: ${a.d === b.d}, taken ${b.used} times`);
}

console.log(
  `\nSIM (node): ${fails ? fails + " FAIL" : "all checks passed"} in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
);
process.exitCode = fails ? 1 : 0;
