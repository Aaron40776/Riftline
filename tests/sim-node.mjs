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

// 7. 3.31.0: drawing between two steps (render/interp.js) moves the positions only while a frame is drawn: the run is the
// same with it, a drawn position lies between the step before and the last step, and restore() gives back the exact values
{
  const { interpCapture, interpApply, interpRestore, interpReset } = await import("../src/render/interp.js");
  const run = (interp) => {
    const w = new World({ seed: 2024, weapon: "scatter", threat: 1, ws: {}, pacts: [] });
    w.god = true;
    interpReset();
    let ang = 0,
      between = 0,
      outside = 0,
      exact = true;
    for (let i = 0; i < 60 * 150; i++) {
      if (w.state === "choose") {
        w.choose(w.offer[0]);
        continue;
      }
      if (interp) interpCapture(w);
      const before = w.enemies.map((e) => [e, e.x, e.y]);
      ang += rlStep * 0.6;
      w.step(rlStep, { mx: Math.cos(ang), my: Math.sin(ang), auto: true });
      w.fx.length = 0;
      if (!interp) continue;
      const after = w.enemies.map((e) => [e, e.x, e.y]);
      interpApply(0.5);
      const old = new Map(before.map(([e, x, y]) => [e, [x, y]]));
      for (const [e, x, y] of after) {
        const o = old.get(e);
        if (!o || Math.abs(x - o[0]) >= 2.5 || Math.abs(y - o[1]) >= 2.5) continue;
        if (Math.abs(e.x - (o[0] + x) / 2) < 1e-9 && Math.abs(e.y - (o[1] + y) / 2) < 1e-9) between++;
        else outside++;
      }
      interpRestore();
      for (const [e, x, y] of after) if (e.x !== x || e.y !== y) exact = false;
    }
    return { d: digest(w), between, outside, exact };
  };
  const a = run(false),
    b = run(true);
  line(
    a.d === b.d && b.exact && b.outside === 0 && b.between > 1000,
    "drawn between two steps",
    `same run: ${a.d === b.d}, ${b.between} drawn halfway, ${b.outside} off, restored exactly: ${b.exact}`,
  );
}

// 8. 3.31.0: fixes from the audit of 10.10.2026 (evening), each measured on a dummy that cannot die
{
  const { computeStats } = await import("../src/core/stats.js");
  // a world in a fight with no enemies of its own (the wave never ends) and the given cards
  const arena = (weapon, up, ws = {}) => {
    const w = new World({ seed: 1, weapon, threat: 0, ws, pacts: [] });
    w.startWave(3);
    w.state = "fight";
    w.hold = true;
    w.enemies = [];
    w.markers = [];
    w.plan = [];
    w.planIdx = 0;
    w.championPending = null;
    w.bossPending = null;
    w.traps = [];
    w.up = up;
    w.stats = computeStats(weapon, up, ws);
    return w;
  };
  const dummy = (w, x, y, opts) => {
    const e = w.spawnEnemy("brute", x, y, opts);
    e.spawnT = 0;
    e.hp = e.maxHp = 1e7;
    return e;
  };
  // Thermite raises the Ember Jet's burn (it did nothing for the flame)
  const flameBurn = (up) => {
    const w = arena("flame", up),
      e = dummy(w, 3, 2);
    e.speed = 0;
    w.player.x = 0;
    w.player.y = 2;
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      e.x = 3;
      e.y = 2;
      e.vx = e.vy = 0;
      w.step(rlStep, { auto: true });
      w.fx.length = 0;
      peak = Math.max(peak, e.burnDps);
    }
    return peak;
  };
  const burn0 = flameBurn({}),
    burn3 = flameBurn({ thermite: 3 });
  line(
    burn3 > burn0 * 1.4,
    "Thermite on the Ember Jet",
    `burn ${burn0.toFixed(1)}/s, with Thermite 3 ${burn3.toFixed(1)}/s`,
  );
  // the Aegis keeps recharging behind the Emergency Shield barrier
  {
    const w = arena("pulse", { shield: 1 }, { emergencyShield: 2 }),
      p = w.player;
    p.shield = false;
    p.shieldT = w.stats.shieldCd - w.stats.barrierT - 0.5;
    p.hp = 40;
    p.iT = 0;
    w.hurtPlayer(15, null, null, "grunt");
    const barrier = w.barrierT > 0;
    for (let i = 0; i < Math.ceil((w.stats.barrierT + 0.6) / rlStep); i++) {
      w.step(rlStep, {});
      w.fx.length = 0;
    }
    line(barrier && p.shield, "the Aegis recharges behind the barrier", `barrier ${barrier}, Aegis up ${p.shield}`);
  }
  // a Rear Guard rocket blasts with its 60 % (its splash was at full damage)
  {
    const w = arena("rocket", { rearguard: 1 }),
      front = dummy(w, 5, 2),
      back = dummy(w, -5, 2);
    w.player.x = 0;
    w.player.y = 2;
    w.fire(0);
    for (let i = 0; i < 120; i++) {
      w.hash.build(w.enemies);
      w.updatePBullets(rlStep);
      w.sweep();
    }
    const f = 1e7 - front.hp,
      b = 1e7 - back.hp;
    line(Math.abs(b / f - 0.6) < 0.01, "Rear Guard rockets at 60 %", `front ${f.toFixed(1)}, rear ${b.toFixed(1)}`);
  }
  // the auto-aim range of Targeting Chip stays within the reach of the shots
  {
    let worst = "";
    for (const weapon of ["pulse", "rail", "flame", "disc"]) {
      const w = arena(weapon, { crit: 8 });
      w.arena.blocked = () => false;
      w.arena.outside = () => false;
      w.player.x = 0;
      w.player.y = 0;
      w.pb = [];
      w.fire(0);
      const shot = w.pb[0];
      let reach = 0;
      while (shot.life > 0) {
        w.hash.build([]);
        w.updatePBullets(rlStep);
        reach = Math.max(reach, shot.x);
      }
      if (w.stats.range > reach) worst += `${weapon} ${w.stats.range.toFixed(1)} > ${reach.toFixed(1)} `;
    }
    line(!worst, "Targeting Chip range within the shots' reach", worst || "all four weapons");
  }
  // the owner, 10.10.2026: Overload grows with damage, rocket blasts crit, Chrono Dash does not slow the Singularity
  {
    const burst = (up) => {
      const w = arena("pulse", up);
      let got = 0;
      const explode = w.explode.bind(w);
      w.explode = (x, y, r, dmg, opts) => {
        if (opts && opts.kind === "overload") got = dmg;
        return explode(x, y, r, dmg, opts);
      };
      dummy(w, 6, 2);
      w.player.x = 0;
      w.player.y = 2;
      w.player.shotN = 4;
      w.fire(0);
      return got;
    };
    const plain = burst({ overload: 1 }),
      strong = burst({ overload: 1, dmg: 3 });
    line(
      plain > 0 && strong > plain * 1.2,
      "Overload grows with damage",
      `burst ${plain.toFixed(1)}, with 3 damage cards ${strong.toFixed(1)}`,
    );
  }
  {
    const blast = (critChance) => {
      const w = arena("rocket", {}),
        e = dummy(w, 5, 2);
      w.stats.crit = critChance;
      w.player.x = 0;
      w.player.y = 2;
      w.fire(0);
      for (let i = 0; i < 120; i++) {
        w.hash.build(w.enemies);
        w.updatePBullets(rlStep);
        w.sweep();
      }
      return { taken: 1e7 - e.hp, critMul: w.stats.critMul };
    };
    const a = blast(0),
      b = blast(1);
    line(
      Math.abs(b.taken - a.taken * b.critMul) < 0.5,
      "a rocket's blast crits with its hit",
      `no crit ${a.taken.toFixed(1)}, crit ${b.taken.toFixed(1)} (x${b.critMul.toFixed(2)})`,
    );
  }
  {
    const opened = (chrono) => {
      const w = arena("pulse", {});
      w.chronoT = chrono ? 9 : 0;
      w.singularities.push({ fx: 0, fy: 2, tx: 4, ty: 2, t: 0, dur: 0.5, pullT: -1 });
      for (let i = 0; i < 24; i++) {
        w.step(rlStep, {});
        w.fx.length = 0;
      }
      return w.singularities.length ? w.singularities[0].t : -1;
    };
    const free = opened(false),
      slowed = opened(true);
    line(
      Math.abs(free - slowed) < 1e-9 && free > 0.39,
      "Chrono Dash leaves the Singularity at full speed",
      `after 0.4 s: ${free.toFixed(3)} s, with Chrono Dash ${slowed.toFixed(3)} s`,
    );
  }
  // a burn counts for Apex Hunter like a hit
  {
    const w = arena("flame", { hunter: 3 }),
      e = dummy(w, 10, 10, { elite: true });
    e.burnT = 5;
    e.burnDps = 100;
    for (let i = 0; i < 60; i++) w.statusTick(e, rlStep);
    const burnt = 1e7 - e.hp;
    line(Math.abs(burnt - 145) < 1, "Apex Hunter on a burn", `1 s of 100/s on an elite: ${burnt.toFixed(1)}`);
  }
}

// 9. 3.31.0: frame pacing (render/pacing.js): a phone with a screen over 100 Hz draws every other refresh, evenly; 60 and
// 90 Hz keep every frame; nothing is halved where it is not allowed (desktop, Saver)
{
  const { makePacer, paceFrame } = await import("../src/render/pacing.js");
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rate = (hz, halve) => {
    const p = makePacer();
    let drawn = 0,
      lastDrawn = null,
      worst = 0;
    for (let f = 0; f < hz * 10; f++) {
      const t = (f / hz) * 1000 + (rnd() - 0.5) * 1.5;
      if (paceFrame(p, t, halve)) {
        if (f > hz && lastDrawn !== null) worst = Math.max(worst, t - lastDrawn);
        lastDrawn = t;
        drawn++;
      }
    }
    return { fps: Math.round(drawn / 10), worst: +worst.toFixed(1) };
  };
  const r = {
    60: rate(60, true),
    90: rate(90, true),
    120: rate(120, true),
    144: rate(144, true),
    off: rate(120, false),
  };
  line(
    r[60].fps === 60 &&
      r[90].fps === 90 &&
      Math.abs(r[120].fps - 60) <= 1 &&
      Math.abs(r[144].fps - 72) <= 1 &&
      r[120].worst < 18.5 &&
      r.off.fps === 120,
    "frame pacing on fast phone screens",
    JSON.stringify(r),
  );
}

// 10. 3.31.1: a shot fired at an enemy pressed against a wall hits it (the wall test ended a fast shot before the enemy
// test of the same step, so an enemy hugging a wall could not be hit at close range; a bot pinned in a corner stalled)
{
  const { computeStats } = await import("../src/core/stats.js");
  const missed = [];
  for (const weapon of weaponOrder)
    for (const gap of [0.05, 0.3, 0.6]) {
      const w = new World({ seed: 1, weapon, threat: 0, ws: {}, pacts: [] });
      w.startWave(3);
      w.state = "fight";
      w.hold = true;
      w.enemies = [];
      w.markers = [];
      w.plan = [];
      w.planIdx = 0;
      w.championPending = null;
      w.bossPending = null;
      w.traps = [];
      w.arena.obs = [];
      w.stats = computeStats(weapon, {}, {});
      const e = w.spawnEnemy("mite", 0, 0);
      e.spawnT = 0;
      e.hp = e.maxHp = 1e7;
      const pin = () => {
        e.x = w.arena.W - e.r;
        e.y = 0;
        e.vx = e.vy = 0;
      };
      pin();
      w.player.x = e.x - e.r - w.player.r - gap;
      w.player.y = 0;
      for (let i = 0; i < 30 && e.hp === 1e7; i++) {
        w.hash.build(w.enemies);
        w.fire(0);
        w.updatePBullets(rlStep);
        w.sweep();
        pin();
      }
      if (e.hp === 1e7) missed.push(`${weapon} at ${gap} m`);
    }
  line(
    !missed.length,
    "an enemy against a wall can be shot",
    missed.length ? "missed by " + missed.join(", ") : "all weapons hit",
  );
}

// 11. 3.31.1: names inherited from Object.prototype ("constructor", "toString") are not pacts, weapons or cards (a
// crafted or broken save gave a NaN payout and a World without a weapon)
{
  const { cleanPacts, pactBonus } = await import("../src/data/pacts.js");
  const pacts = cleanPacts(["constructor", "toString", "glass", "__proto__"]),
    bonus = pactBonus(["constructor", "hasOwnProperty"]);
  const w = new World({ seed: 3, weapon: "constructor", threat: 0, ws: {}, pacts: ["toString"] });
  line(
    JSON.stringify(pacts) === '["glass"]' &&
      bonus === 0 &&
      w.weapon === "pulse" &&
      Number.isFinite(w.stats.damage ?? 0),
    "inherited names are not game ids",
    `pacts ${JSON.stringify(pacts)}, bonus ${bonus}, weapon ${w.weapon}`,
  );
}

console.log(
  `\nSIM (node): ${fails ? fails + " FAIL" : "all checks passed"} in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
);
process.exitCode = fails ? 1 : 0;
