// 3.10.0: screenshots of the attacks of enemies and bosses in every biome: the zones while they warn, the blasts and
// the marks they leave, the enemy shots of every kind. Usage: node tools/qa.js attack-shots pc
//   -> tests/shots/attacks-<profile>/
import { chromium } from "playwright";
import fs from "fs";
const URL = /^https?:/.test(process.argv[2] || "") ? process.argv[2] : "http://localhost:8124/index.html";
const NAME = (/^https?:/.test(process.argv[2] || "") ? process.argv[3] : process.argv[2]) || "pc";
const prof = {
  pc: { viewport: { width: 1440, height: 900 } },
}[NAME];
if (!prof) {
  console.error("usage: node attack-shots.mjs [url] pc");
  process.exit(2);
}
const OUT = `tests/shots/attacks-${NAME}`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const p = await (await b.newContext(prof)).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 300)));
await p.goto(URL);
await p.waitForFunction(() => window.__riftTest && window.__riftTest.ui, null, { timeout: 90000 });
const ev = (f, a) => p.evaluate(f, a);
await ev(() => {
  const T = window.__riftTest;
  for (const k of Object.keys(T.store.data.seen)) T.store.data.seen[k] = true;
  T.store.data.settings.quality = "high";
});
// the title cards of a new biome would cover the middle of the shots
await p.addStyleTag({ content: ".tcard{display:none!important}" });
await ev(() => window.__riftTest.game.startRun({}));
await p.waitForTimeout(800);
// what each biome shows: [kind, maker (src), lobbed from afar]
const STAGE = {
  yard: [
    ["stomp", "warden"],
    ["mortar", "mortar", true],
    ["mine", "minebot"],
    ["sapper", "sapper"],
    ["volatile", "grunt"],
    ["drill", "driller"],
    ["fire", "grunt"],
  ],
  works: [
    ["stomp", "forge"],
    ["slag", "forge"],
    ["rain", "forge"],
    ["mortar", "forge", true],
    ["volatile", "brute"],
    ["slag", "forge"],
  ],
  vault: [
    ["frost", "prism"],
    ["glacier", "prism"],
    ["glacier", "prism"],
    ["mine", "minebot"],
    ["mortar", "mortar", true],
  ],
  marsh: [
    ["rain", "queen"],
    ["rain", "queen"],
    ["rain", "queen"],
    ["fire", "hive"],
    ["sapper", "sapper"],
  ],
  void: [
    ["rain", "core"],
    ["rain", "core"],
    ["rain", "core"],
    ["mortar", "mortar", true],
    ["drill", "driller"],
  ],
};
const ids = await ev(() => window.__riftTest.game.world.route.slice());
for (const id of ids) {
  await ev(
    ([id, stage]) => {
      const g = window.__riftTest.game,
        w = g.world,
        i = w.route.indexOf(id);
      w.god = true;
      w.startWave(2 + 5 * i);
      g.intro = null;
      w.planIdx = w.plan.length;
      w.markers = [];
      w.bossPending = null;
      w.championPending = null;
      for (const e of [...w.enemies]) w.killEnemy(e);
      // one enemy far away and still keeps the wave running, so the zones go off
      const keep = w.spawnEnemy("grunt", w.arena.W - 2, w.arena.H - 2, {});
      keep.speed = 0;
      window.__attackKeep = keep;
      const px = w.player.x,
        py = w.player.y;
      w.player.vx = w.player.vy = 0;
      stage.forEach(([kind, src, lob], j) => {
        const a = (j / stage.length) * Math.PI * 2 + 0.3,
          x = px + Math.cos(a) * 6.5,
          y = py + Math.sin(a) * 4.6,
          r =
            { stomp: 2.6, frost: 2.4, glacier: 2.2, rain: 1.9, slag: 1.4, mortar: 1.9, mine: 1.15, sapper: 1.25 }[
              kind
            ] || 1.5;
        w._src = src;
        w.hazard({ x, y, r, delay: 2.4, dmg: 0, kind, sx: lob ? x - 9 : undefined, sy: lob ? y - 6 : undefined });
      });
      w._src = null;
      // the shots of every kind, slow, in a fan above the drone
      ["orb", "fast", "turret", "shard", "weaver", "drone", "carrier", "slag"].forEach((kind, j) =>
        w.shoot(px - 5.6 + j * 1.6, py - 2.6, Math.PI / 2, 0.4, 0, { kind, life: 9, r: kind === "slag" ? 0.34 : 0.26 }),
      );
    },
    [id, STAGE[id] || STAGE.yard],
  );
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${id}-1-warn.png` });
  await p.waitForFunction(() => window.__riftTest.game.world.hazards.every((h) => h.done), null, { timeout: 20000 });
  await p.waitForTimeout(120);
  await p.screenshot({ path: `${OUT}/${id}-2-blast.png` });
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${OUT}/${id}-3-marks.png` });
  const state = await ev(() => window.__riftTest.game.world.state);
  console.log(id, "state", state);
}
// 3.12.0: the Singularity of the player: thrown into a ring of enemies, while it pulls them in, and its collapse
await ev(() => {
  const w = window.__riftTest.game.world,
    px = w.player.x,
    py = w.player.y;
  w.god = true;
  w.hazards.length = 0;
  w.player.gadgetN = Math.max(1, w.player.gadgetN);
  ["grunt", "brute", "striker", "gunner", "splitter", "grunt"].forEach((type, k) => {
    const a = (k / 6) * Math.PI * 2;
    const enemy = w.spawnEnemy(type, px + 7 + Math.cos(a) * 3.6, py + Math.sin(a) * 3.6, {});
    enemy.spawnT = 0;
    enemy.maxHp = enemy.hp = 1e6;
  });
  w.useGadget({ aim: true, ax: 1, ay: 0 });
});
await p.waitForFunction(() => (window.__riftTest.game.world.singularities[0]?.pullT ?? -1) > 0.9, null, {
  timeout: 60000,
});
await p.screenshot({ path: `${OUT}/singularity-1-pull.png` });
await p.waitForFunction(() => !window.__riftTest.game.world.singularities.length, null, { timeout: 60000 });
await p.screenshot({ path: `${OUT}/singularity-2-collapse.png` });
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no errors");
await b.close();
process.exit(errs.length ? 1 : 0);
