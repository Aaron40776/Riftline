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
      // 3.29.2: and it makes no zones of its own (a scorch or volatile one would)
      keep.variant = null;
      keep.affix = null;
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
      // 3.16.0: and the bosses' own: the Warden's siren slugs, the Hive Queen's spores, the Rift Core's rings
      ["orb", "fast", "turret", "shard", "weaver", "drone", "carrier", "slag", "siren", "spore", "riftorb"].forEach(
        (kind, j) =>
          w.shoot(px - 8 + j * 1.6, py - 2.6, Math.PI / 2, 0.4, 0, { kind, life: 9, r: kind === "slag" ? 0.34 : 0.26 }),
      );
    },
    [id, STAGE[id] || STAGE.yard],
  );
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${id}-1-warn.png` });
  // 3.29.2: the zones go off after 2.4 s of game time; under software GL late in a release check the game runs at about
  // 1 fps (0.1 s of game time a frame), so 20 s of real time was not always enough (Ember Works timed out on 10.10.2026)
  await p.waitForFunction(() => window.__riftTest.game.world.hazards.every((h) => h.done), null, { timeout: 120000 });
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
// 3.13.0: the light of the place: a lightning strike lights the arena, a passing siren glows red and blue at the edge
await ev(() => window.__riftTest.renderer.scapeLight("lightning", 0));
await ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await p.screenshot({ path: `${OUT}/scape-lightning.png` });
await ev(() => window.__riftTest.renderer.scapeLight("siren", 0.6));
await ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await p.screenshot({ path: `${OUT}/scape-siren.png` });
// 3.15.0: the boss cards: the Lockdown Grid holding a group (with larvae of the Brood and the ember glow of a ready
// Crucible Hammer), the slam of the hammer, splinters of the Shard Field, the pull of Event Collapse, and the upgrade
// choice with a boss card
await ev(() => {
  const T = window.__riftTest,
    w = T.game.world;
  w.god = true;
  // a running fight again (the last stage can end in an upgrade choice), with one far enemy that keeps it going
  w.startWave(w.wave);
  T.game.intro = null;
  w.planIdx = w.plan.length;
  w.markers = [];
  w.bossPending = null;
  w.championPending = null;
  for (const e of [...w.enemies]) w.killEnemy(e);
  const keep = w.spawnEnemy("grunt", w.arena.W - 2, w.arena.H - 2, {});
  keep.speed = 0;
  keep.maxHp = keep.hp = 1e9;
  document.getElementById("choose").hidden = true;
  T.ui.coverHud(false);
  w.hazards.length = 0;
  w.singularities = [];
  const px = w.player.x,
    py = w.player.y;
  Object.assign(w.up, { lockdown: 1, hammer: 1, shardfield: 1, brood: 1, collapse: 1 });
  w.stats = T.computeStats(w.weapon, w.up, w.ws);
  window.__bossGroup = ["grunt", "brute", "gunner", "grunt", "splitter"].map((type, k) => {
    const a = (k / 5) * Math.PI * 2;
    const enemy = w.spawnEnemy(type, px + 6 + Math.cos(a) * 1.4, py + Math.sin(a) * 1.4, {});
    enemy.spawnT = 0;
    enemy.maxHp = enemy.hp = 1e6;
    enemy.speed = 0;
    return enemy;
  });
  for (let k = 0; k < 3; k++)
    w.player.brood.push({ id: w.nextId++, x: px - 1.5 + k, y: py + 1.5, vx: 0, vy: 0, t: -60, life: 99, target: null });
  w.player.hammerT = 0;
  w.player.lockT = 0.01;
});
await p.waitForFunction(() => (window.__riftTest.game.world.cages[0]?.t ?? 0) > 0.9, null, { timeout: 60000 });
await p.screenshot({ path: `${OUT}/bosscards-1-cage.png` });
await ev(() => {
  const pl = window.__riftTest.game.world.player;
  pl.dashX = 1;
  pl.dashY = 0;
  pl.dashT = 0.17;
});
await p.waitForFunction(() => window.__riftTest.game.world.slag.length > 0, null, { timeout: 60000 });
await ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await p.screenshot({ path: `${OUT}/bosscards-2-slam.png` });
await ev(() => {
  const w = window.__riftTest.game.world;
  for (const enemy of window.__bossGroup.slice(0, 3)) w.hurtEnemy(enemy, 1e7, 0, 0, 0, false, "weapon");
});
await ev(() => new Promise((r) => requestAnimationFrame(r)));
await p.screenshot({ path: `${OUT}/bosscards-3-shatter.png` });
await ev(() => {
  const w = window.__riftTest.game.world,
    px = w.player.x,
    py = w.player.y;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const enemy = w.spawnEnemy("grunt", px + Math.cos(a) * 8, py + Math.sin(a) * 5, {});
    enemy.spawnT = 0;
    enemy.maxHp = enemy.hp = 1e6;
  }
  w.player.nova = 100;
  w.nova();
});
await p.waitForFunction(() => (window.__riftTest.game.world.implode?.t ?? 0) > 0.15, null, { timeout: 60000 });
await p.screenshot({ path: `${OUT}/bosscards-4-implode.png` });
await ev(() => {
  const T = window.__riftTest,
    w = T.game.world;
  w.offerBoss = true;
  w.offerExclusive = "lockdown";
  w.up.lockdown = 0;
  w.offer = w.makeOffer();
  w.state = "choose";
  T.ui.showChoose(w);
});
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/bosscards-5-choice.png` });
// 3.17.0: the walker, close up (the camera zoomed in): standing, mid-stride and in the air of a dash
await ev(() => {
  const T = window.__riftTest,
    w = T.game.world;
  w.startWave(w.wave);
  T.game.intro = null;
  w.planIdx = w.plan.length;
  w.markers = [];
  w.bossPending = null;
  w.championPending = null;
  for (const e of [...w.enemies]) w.killEnemy(e);
  const keep = w.spawnEnemy("grunt", w.arena.W - 2, w.arena.H - 2, {});
  keep.speed = 0;
  keep.maxHp = keep.hp = 1e9;
  document.getElementById("choose").hidden = true;
  T.ui.coverHud(false);
  w.god = true;
  w.hazards.length = 0;
  T.renderer.zoom = 0.28;
});
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/walker-1-stand.png` });
await p.keyboard.down("d");
await p.waitForFunction(() => window.__riftTest.game.world.player.stride > 2.4, null, { timeout: 60000 });
await p.screenshot({ path: `${OUT}/walker-2-stride.png` });
await p.keyboard.press("Space");
await p.waitForFunction(() => window.__riftTest.game.world.player.dashT > 0.06, null, { timeout: 60000 });
await p.screenshot({ path: `${OUT}/walker-3-jump.png` });
await p.keyboard.up("d");
await ev(() => {
  window.__riftTest.renderer.zoom = 1;
});
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no errors");
await b.close();
process.exit(errs.length ? 1 : 0);
