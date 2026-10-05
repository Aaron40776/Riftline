// 3.18.2: how far does a plain bot get with each weapon? The world runs without the renderer (fast), the bot is mortal,
// kites the nearest enemy, dashes now and then and takes the first card it is offered. A table per weapon and threat
// level: the wave it dies in (median over the seeds), the time it lives, the damage it takes per wave. It is not a
// player, so it is a comparison between weapons, not a measure of difficulty: a weapon that falls far behind the others
// (or that no bot can use) is worth a look. Usage: node tools/qa.js balance [seeds] [threat levels, e.g. 0,2] [wave cap].
import { chromium } from "playwright";
const URL = process.argv[2] || "http://localhost:8124/index.html";
const SEEDS = +(process.argv[3] || 4),
  THREATS = (process.argv[4] || "0,2").split(",").map(Number),
  CAP = +(process.argv[5] || 60);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL);
await page.waitForFunction(() => window.__riftTest, null, { timeout: 60000 });
const weapons = await page.evaluate(() => Object.keys(window.__riftTest.weaponDefs));
const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const table = {},
  warnList = [];
for (const threat of THREATS) {
  for (const wpn of weapons) {
    const runs = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = await page.evaluate(
        ({ wpn, seed, threat, CAP }) => {
          const T = window.__riftTest;
          const w = new T.World({ seed: seed * 7919 + wpn.length, weapon: wpn, threat, ws: {} });
          let steps = 0;
          const cap = 60 * 60 * 40; // 40 minutes of game time at most
          while (w.state !== "dead" && w.wave < CAP && steps++ < cap) {
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
              dash: steps % 180 === 0,
              nova: p.nova >= 100,
            };
            if (tgt) {
              const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
              inp.aim = true;
              inp.ax = Math.cos(a);
              inp.ay = Math.sin(a);
              const k = best < 5 ? -1 : best > 9 ? 1 : 0.3;
              inp.mx = Math.cos(a) * k + Math.cos(a + 1.57) * 0.5;
              inp.my = Math.sin(a) * k + Math.sin(a + 1.57) * 0.5;
            } else if (w.pickups.length) {
              const q = w.pickups[0];
              const a = Math.atan2(q.y - p.y, q.x - p.x);
              inp.mx = Math.cos(a);
              inp.my = Math.sin(a);
            }
            w.step(1 / 60, inp);
            w.fx.length = 0;
            if (w.state === "choose") w.choose(w.offer[0]);
            else if (w.state === "victory") w.startEndless && w.startEndless();
          }
          return {
            wave: w.wave,
            secs: Math.round(w.time),
            dmg: Math.round(w.runStats.dmgTaken),
            dead: w.state === "dead",
          };
        },
        { wpn, seed, threat, CAP },
      );
      runs.push(r);
    }
    table[`${wpn}@${threat}`] = {
      wave: median(runs.map((r) => r.wave)),
      min: Math.min(...runs.map((r) => r.wave)),
      max: Math.max(...runs.map((r) => r.wave)),
      secs: median(runs.map((r) => r.secs)),
      dmgPerWave: +(median(runs.map((r) => r.dmg / Math.max(1, r.wave))) || 0).toFixed(1),
      died: runs.filter((r) => r.dead).length,
    };
    const t = table[`${wpn}@${threat}`];
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
  const per = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    per.push(
      await page.evaluate(
        ({ wpn, seed }) => {
          const T = window.__riftTest;
          const w = new T.World({ seed: seed * 104729 + wpn.length, weapon: wpn, threat: 0, ws: {} });
          w.god = true;
          const times = [];
          let steps = 0,
            t0 = 0;
          while (w.wave < 20 && steps++ < 60 * 60 * 40) {
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
              dash: steps % 180 === 0,
              nova: p.nova >= 100,
            };
            if (tgt) {
              const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
              inp.aim = true;
              inp.ax = Math.cos(a);
              inp.ay = Math.sin(a);
              const k = best < 5 ? -1 : best > 9 ? 1 : 0.3;
              inp.mx = Math.cos(a) * k + Math.cos(a + 1.57) * 0.5;
              inp.my = Math.sin(a) * k + Math.sin(a + 1.57) * 0.5;
            } else if (w.pickups.length) {
              const q = w.pickups[0];
              inp.mx = Math.cos(Math.atan2(q.y - p.y, q.x - p.x));
              inp.my = Math.sin(Math.atan2(q.y - p.y, q.x - p.x));
            }
            w.step(1 / 60, inp);
            w.fx.length = 0;
            if (w.state === "choose") {
              times.push({ wave: w.wave, secs: w.time - t0 });
              t0 = w.time;
              w.choose(w.offer[0]);
            }
          }
          return times;
        },
        { wpn, seed },
      ),
    );
  }
  const med = (pick) => median(per.flatMap((times) => times.filter(pick).map((t) => t.secs)));
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
      warnList.push(
        `${wpn}: ${speed[wpn].wave} s per ordinary wave against ${fastest} s for the fastest weapon (2.5x)`,
      );
    if (speed[wpn].boss > fastBoss * 3)
      warnList.push(`${wpn}: ${speed[wpn].boss} s per boss wave against ${fastBoss} s for the fastest weapon (3x)`);
  }
}
// the verdict: a weapon far behind the best one is a finding, a weapon no bot gets anywhere with too
const fail = [],
  warn = warnList;
for (const threat of THREATS) {
  const waves = weapons.map((w) => table[`${w}@${threat}`].wave);
  const best = Math.max(...waves);
  for (const wpn of weapons) {
    const t = table[`${wpn}@${threat}`];
    if (t.wave < 5) fail.push(`${wpn} at threat ${threat}: the bot dies by wave ${t.wave}`);
    else if (best > 12 && t.wave < best * 0.4)
      warn.push(`${wpn} at threat ${threat}: wave ${t.wave} against ${best} for the best weapon (under 40 %)`);
  }
}
if (errors.length) fail.push(`page errors: ${errors.slice(0, 3).join(" | ")}`);
console.log(JSON.stringify({ seeds: SEEDS, threats: THREATS, cap: CAP, warn, fail }, null, 1));
await browser.close();
process.exitCode = fail.length ? 1 : 0;
