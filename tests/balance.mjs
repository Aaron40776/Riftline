// 3.18.2: how far does a plain bot get with each weapon? The bot is mortal, kites the nearest enemy, dashes now and then
// and takes a card of the offer. A table per weapon and threat level: the wave it dies in (median over the seeds), the
// time it lives, the damage it takes per wave. It is not a player, so it is a comparison between weapons, not a measure
// of difficulty: a weapon that falls far behind the others (or that no bot can use) is worth a look.
// 3.31.0: runs in Node (World needs no browser since 3.30.0): seconds instead of minutes. The bot takes a card chosen by
// its own seeded generator instead of always the first one, so the runs see more of the upgrade pool.
// Usage: node tests/balance.mjs [seeds] [threat levels, e.g. 0,2] [wave cap]   (npm run balance -- 4 0,2 50)
globalThis.__RL_VERSION__ = "0.0.0";
globalThis.__RL_BUILD__ = "node";
const { World, rlStep } = await import("../src/core/world.js");
const { weaponOrder } = await import("../src/data/weapons.js");

const SEEDS = +(process.argv[2] || 4),
  THREATS = (process.argv[3] || "0,2").split(",").map(Number),
  CAP = +(process.argv[4] || 60);
const weapons = weaponOrder;
const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/* the bot: aims at and kites the nearest enemy, walks to pickups when the arena is empty; onChoose picks the card */
function play(w, { cap, until, onChoose }) {
  let steps = 0,
    pick = (w.seed * 2654435761) >>> 0;
  while (w.state !== "dead" && !until(w) && steps++ < cap) {
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
    const inp = { mx: 0, my: 0, aim: false, fire: true, auto: true, assist: true, dash: steps % 180 === 0 };
    inp.nova = p.nova >= 100;
    if (tgt) {
      const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      inp.aim = true;
      inp.ax = Math.cos(a);
      inp.ay = Math.sin(a);
      const k = best < 5 ? -1 : best > 9 ? 1 : 0.3;
      inp.mx = Math.cos(a) * k + Math.cos(a + 1.57) * 0.5;
      inp.my = Math.sin(a) * k + Math.sin(a + 1.57) * 0.5;
    } else if (w.pickups.length) {
      const q = w.pickups[0],
        a = Math.atan2(q.y - p.y, q.x - p.x);
      inp.mx = Math.cos(a);
      inp.my = Math.sin(a);
    }
    w.step(rlStep, inp);
    w.fx.length = 0;
    if (w.state === "choose") {
      if (onChoose) onChoose(w);
      pick = (Math.imul(pick ^ (pick >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
      w.choose(w.offer[pick % w.offer.length]);
    } else if (w.state === "victory") w.startEndless && w.startEndless();
  }
}

const table = {},
  warn = [],
  fail = [];
const t0 = performance.now();
for (const threat of THREATS) {
  for (const wpn of weapons) {
    const runs = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const w = new World({ seed: seed * 7919 + wpn.length, weapon: wpn, threat, ws: {}, pacts: [] });
      play(w, { cap: 60 * 60 * 40, until: (w) => w.wave >= CAP });
      runs.push({ wave: w.wave, secs: Math.round(w.time), dmg: w.runStats.dmgTaken, dead: w.state === "dead" });
    }
    const t = (table[`${wpn}@${threat}`] = {
      wave: median(runs.map((r) => r.wave)),
      min: Math.min(...runs.map((r) => r.wave)),
      max: Math.max(...runs.map((r) => r.wave)),
      secs: median(runs.map((r) => r.secs)),
      dmgPerWave: +(median(runs.map((r) => r.dmg / Math.max(1, r.wave))) || 0).toFixed(1),
      died: runs.filter((r) => r.dead).length,
    });
    console.log(
      `threat ${threat} ${wpn.padEnd(8)} wave ${String(t.wave).padStart(3)} (${t.min}-${t.max})  ${String(t.secs).padStart(5)} s  damage/wave ${String(t.dmgPerWave).padStart(6)}  died ${t.died}/${SEEDS}`,
    );
  }
}
// the speed of a weapon: the same bot cannot die, so every wave of the first twenty is cleared; the seconds per ordinary
// wave and per boss wave (every fifth) say how much damage the weapon brings with the cards the bot is offered
const speed = {};
console.log("\nclear speed (god mode, waves 1-19, median over the seeds)");
for (const wpn of weapons) {
  const times = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const w = new World({ seed: seed * 104729 + wpn.length, weapon: wpn, threat: 0, ws: {}, pacts: [] });
    w.god = true;
    let start = 0;
    play(w, {
      cap: 60 * 60 * 40,
      until: (w) => w.wave >= 20,
      onChoose: (w) => {
        times.push({ wave: w.wave, secs: w.time - start });
        start = w.time;
      },
    });
  }
  const med = (keep) => median(times.filter(keep).map((t) => t.secs));
  speed[wpn] = { wave: +med((t) => t.wave % 5 !== 0).toFixed(1), boss: +med((t) => t.wave % 5 === 0).toFixed(1) };
  console.log(
    `${wpn.padEnd(8)} ordinary wave ${String(speed[wpn].wave).padStart(6)} s   boss wave ${String(speed[wpn].boss).padStart(6)} s`,
  );
}
{
  const waves = weapons.map((w) => speed[w].wave),
    bosses = weapons.map((w) => speed[w].boss);
  const fastest = Math.min(...waves),
    slowest = Math.max(...waves),
    fastBoss = Math.min(...bosses),
    slowBoss = Math.max(...bosses);
  console.log(
    `spread: ordinary waves ${fastest}-${slowest} s (x${(slowest / fastest).toFixed(2)}), boss waves ${fastBoss}-${slowBoss} s (x${(slowBoss / fastBoss).toFixed(2)})`,
  );
  for (const wpn of weapons) {
    if (speed[wpn].wave > fastest * 2.5)
      warn.push(`${wpn}: ${speed[wpn].wave} s per ordinary wave against ${fastest} s for the fastest weapon (2.5x)`);
    if (speed[wpn].boss > fastBoss * 3)
      warn.push(`${wpn}: ${speed[wpn].boss} s per boss wave against ${fastBoss} s for the fastest weapon (3x)`);
  }
}
// the verdict: a weapon far behind the best one is a finding, a weapon no bot gets anywhere with too
for (const threat of THREATS) {
  const best = Math.max(...weapons.map((w) => table[`${w}@${threat}`].wave));
  for (const wpn of weapons) {
    const t = table[`${wpn}@${threat}`];
    if (t.wave < 5) fail.push(`${wpn} at threat ${threat}: the bot dies by wave ${t.wave}`);
    else if (best > 12 && t.wave < best * 0.4)
      warn.push(`${wpn} at threat ${threat}: wave ${t.wave} against ${best} for the best weapon (under 40 %)`);
  }
}
console.log(JSON.stringify({ seeds: SEEDS, threats: THREATS, cap: CAP, warn, fail }, null, 1));
console.log(`BALANCE (node): ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exitCode = fail.length ? 1 : 0;
