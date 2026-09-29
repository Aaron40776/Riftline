import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const page = await browser.newPage();
await page.goto(process.argv[2] || "http://localhost:8124/index.html");
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 60000 });
const out = await page.evaluate(() => {
  const T = window.__riftTest,
    D = T.data,
    R = [],
    bad = (a, m) => R.push(`[${a}] ${m}`),
    f = Number.isFinite;
  const dupe = (arr, key, area) => {
    const s = new Map();
    for (const x of arr) {
      const k = key(x);
      s.has(k) ? bad(area, `duplicate "${k}": ${s.get(k)} / ${x.id}`) : s.set(k, x.id);
    }
  };
  // weapons
  const W = Object.values(T.weaponDefs);
  dupe(W, (w) => w.name, "weapon");
  dupe(W, (w) => w.blurb, "weapon");
  dupe(W, (w) => w.color, "weapon-color");
  for (const w of W) {
    for (const k of ["dmg", "rate", "speed", "life", "count", "r", "knock", "cost"])
      f(w[k]) || bad("weapon", `${w.id}.${k} = ${w[k]}`);
    if (!D.weaponOrder.includes(w.id)) bad("weapon", `${w.id} not selectable`);
    const rg = D.weaponRange(w);
    (rg < 6 || rg > 45) && bad("weapon-range", `${w.id} range ${rg.toFixed(1)} m`);
  }
  for (let i = 1; i < D.weaponOrder.length; i++)
    if (T.weaponDefs[D.weaponOrder[i]].cost < T.weaponDefs[D.weaponOrder[i - 1]].cost)
      bad(
        "weapon-order",
        `${D.weaponOrder[i]} (${T.weaponDefs[D.weaponOrder[i]].cost}) cheaper than previous ${D.weaponOrder[i - 1]} (${T.weaponDefs[D.weaponOrder[i - 1]].cost})`,
      );
  // enemies
  const E = Object.values(T.enemyDefs);
  dupe(E, (e) => e.name, "enemy");
  dupe(
    E.filter((e) => e.id !== "mite"),
    (e) => e.color,
    "enemy-color",
  );
  for (const e of E) {
    for (const k of ["hp", "speed", "r", "dmg", "cost", "shards", "from"]) f(e[k]) || bad("enemy", `${e.id}.${k}`);
    if (e.id === "mite") continue;
    D.enemyOrder.includes(e.id) || bad("enemy", `${e.id} missing from spawn pool`);
    f(D.spawnWeights[e.id]) || bad("enemy", `${e.id} has no spawn weight`);
    D.RL_ENEMY_TIPS[e.id] || bad("enemy", `${e.id} no intro`);
    D.RL_MESH_TYPES.includes(e.id) || bad("enemy", `${e.id} no model`);
  }
  // biomes
  for (const b of T.biomeList) {
    D.rlPaletteIssues(b).forEach((m) => bad("biome-palette", `${b.id}: ${m}`));
    D.obstacleShapes[b.id] || bad("biome", `${b.id} has no obstacle shapes (always classic layout)`);
    D.mapTemplates[b.id] || bad("biome", `${b.id} has no layout templates`);
    D.musicChords[b.id] || bad("biome", `${b.id} no music`);
    b.id in D.RL_BIOME_HAZARD || bad("biome", `${b.id} no hazard theme`);
    (b.W < 15 || b.W > 21 || b.H < 15 || b.H > 21) && bad("biome", `${b.id} size ${b.W}x${b.H}`);
  }
  dupe(T.biomeList, (b) => b.name, "biome");
  dupe(T.biomeList, (b) => b.grid, "biome-grid");
  for (const [id, v] of Object.entries(D.biomeVariants)) {
    T.biomesById[id] || bad("variant", `unknown biome ${id}`);
    v.types.forEach((t) => T.enemyDefs[t] || bad("variant", `${id}: ${t}`));
  }
  // upgrades
  const Z = D.upgradeList;
  dupe(Z, (u) => u.id, "upgrade");
  dupe(Z, (u) => u.name, "upgrade");
  const base = T.computeStats("pulse", {}, {});
  const behaviour = new Set(["heal", "hp"]);
  for (const u of Z) {
    D.iconPaths[u.icon] || bad("icon", `upgrade ${u.id} icon "${u.icon}" missing`);
    (u.rarity < 1 || u.rarity > 5 || !(u.max >= 1)) && bad("upgrade", `${u.id} rarity/max`);
    for (let l = 0; l < Math.min(u.max, 8); l++) {
      const t = u.desc(l);
      (typeof t !== "string" || /NaN|undefined|Infinity/.test(t)) && bad("upgrade-text", `${u.id}(${l}): ${t}`);
    }
    if (u.evo)
      for (const [k, n] of Object.entries(u.evo)) {
        const r = T.upgradesById[k];
        !r
          ? bad("evo", `${u.id} needs unknown ${k}`)
          : r.max < n && bad("evo", `${u.id} needs ${k} ${n} but max ${r.max}`);
        r && r.weapon && r.weapon !== u.weapon && bad("evo", `${u.id} needs weapon-locked ${k}`);
      }
    if (u.weapon && !T.weaponDefs[u.weapon]) bad("evo", `${u.id} for unknown weapon`);
    // effect: stats must change (or known behaviour)
    const s1 = T.computeStats(u.weapon || "pulse", { [u.id]: 1 }, {}),
      b0 = u.weapon ? T.computeStats(u.weapon, {}, {}) : base;
    const diff = Object.keys(s1).some((k) =>
      typeof s1[k] === "number" || typeof s1[k] === "boolean" ? s1[k] !== b0[k] : false,
    );
    diff || behaviour.has(u.id) || bad("upgrade-noop", `${u.id} (${u.name}) changes no stat`);
  }
  // workshop
  for (const m of T.workshopModules) {
    D.iconPaths[m.icon] || bad("icon", `module ${m.id} icon "${m.icon}" missing`);
    for (let i = 1; i < m.costs.length; i++)
      m.costs[i] <= m.costs[i - 1] && bad("workshop", `${m.id} costs not increasing`);
    const s1 = T.computeStats("pulse", {}, { [m.id]: 1 });
    const diff = Object.keys(s1).some((k) => typeof s1[k] === "number" && s1[k] !== base[k]);
    diff ||
      ["reroll", "nova", "insight", "revive", "salvage", "fieldSupply", "droneBay", "starterKit"].includes(m.id) ||
      bad("workshop-noop", `${m.id} changes no stat`);
  }
  dupe(T.workshopModules, (m) => m.name, "workshop");
  // milestones
  const fresh = D.newSave();
  dupe(D.milestones, (m) => m.id, "milestone");
  dupe(D.milestones, (m) => m.name, "milestone");
  for (const m of D.milestones) {
    try {
      m.test(fresh) && bad("milestone", `${m.id} already true on a fresh save`);
    } catch (e) {
      bad("milestone", `${m.id} throws: ${e.message}`);
    }
    m.reward > 0 || bad("milestone", `${m.id} reward`);
  }
  // icons used in HTML
  for (const el of document.querySelectorAll("[data-icon]"))
    D.iconPaths[el.dataset.icon] || bad("icon", `html icon ${el.dataset.icon}`);
  return R;
});
console.log(out.length ? out.join("\n") : "no data issues");
await browser.close();
process.exitCode = out.length ? 1 : 0;
