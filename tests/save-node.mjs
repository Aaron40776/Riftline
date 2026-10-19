// 3.32.0: the save store in Node, without a browser. A newer build's save opened by an older build (an installed app
// on one version, a tab on the next) must come back whole when the newer build opens it again, and a broken save that
// cannot be backed up must not be overwritten.
//   node tests/save-node.mjs      (npm run test:save; part of npm test)
import fs from "node:fs";

globalThis.__RL_VERSION__ = "3.31.0";
globalThis.__RL_BUILD__ = "node";

// a localStorage in memory; `full` makes every write fail like a full quota
const mem = new Map();
let full = false;
globalThis.localStorage = {
  get length() {
    return mem.size;
  },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem(k, v) {
    if (full) throw Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
};

const { SaveStore, SAVE_KEY, newSave } = await import("../src/core/save.js");

let failed = 0;
const check = (name, ok, info = "") => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${info ? " — " + info : ""}`);
  if (!ok) failed++;
};
const reset = (text) => {
  mem.clear();
  full = false;
  if (text != null) mem.set(SAVE_KEY, text);
};
const stored = () => JSON.parse(mem.get(SAVE_KEY));

// what a later build might add: a weapon, a workshop module, a milestone, a stat, a setting, a top-level field and a
// run with the new weapon
const newer = () => ({
  ...newSave(),
  ver: "3.40.0",
  shards: 777,
  weapons: { pulse: true, scatter: true, plasma: true },
  weapon: "scatter",
  workshop: { hull: 2, overclock: 3 },
  milestones: { warden: true, plasmaMaster: true },
  stats: { ...newSave().stats, runs: 9, plasmaKills: 41 },
  settings: { ...newSave().settings, music: 0.2, haptics: "strong" },
  cosmetics: { trail: "ember" },
  run: { v: 1, seed: 5, weapon: "plasma", wave: 7, hp: 80, threat: 0, up: {} },
});

// 1. a newer save survives an older build: load, play (a save), and everything it did not know is written back
{
  reset(JSON.stringify(newer()));
  const store = new SaveStore();
  check("the newer save loads", store.data.shards === 777 && store.data.weapons.scatter === true);
  check("this build does not offer the run it cannot play", store.data.run === null);
  store.data.shards += 5;
  store.save("test");
  const out = stored();
  check("known progress is saved", out.shards === 782 && out.stats.runs === 9);
  check("an unknown weapon is kept", out.weapons.plasma === true, JSON.stringify(out.weapons));
  check("an unknown workshop module is kept", out.workshop.overclock === 3 && out.workshop.hull === 2);
  check("an unknown milestone is kept", out.milestones.plasmaMaster === true);
  check("an unknown stat is kept", out.stats.plasmaKills === 41);
  check("an unknown setting is kept", out.settings.haptics === "strong" && out.settings.music === 0.2);
  check("an unknown top-level field is kept", out.cosmetics && out.cosmetics.trail === "ember");
  check("the run it cannot play is kept", out.run && out.run.weapon === "plasma" && out.run.wave === 7);
  check("the save still says it was written by the newer build", out.ver === "3.40.0", out.ver);
  // reloading in the old build keeps it all again
  const again = new SaveStore();
  again.save("test");
  check("a second load and save in the old build keeps it", stored().weapons.plasma === true && !!stored().run);
}

// 2. the old build starts a run of its own: the newer run is replaced, and does not come back when that run ends
{
  reset(JSON.stringify(newer()));
  const store = new SaveStore();
  store.data.run = { ...stored().run, weapon: "pulse", seed: 9, wave: 2 };
  store.save("run");
  check("a run of this build replaces the kept run", stored().run.weapon === "pulse");
  store.data.run = null;
  store.save("run-end");
  check("the replaced run does not come back", stored().run === null);
}

// 3. a save of this build or an older one is cleaned as before (fields that builds removed are dropped)
{
  reset(fs.readFileSync(new URL("./fixtures/save-v231.json", import.meta.url), "utf8"));
  const store = new SaveStore();
  store.save("test");
  const out = stored();
  check("an old save drops the settings that were removed", !("swap" in out.settings) && !("calm" in out.settings));
  check("an old save is stamped with this build", out.ver === "3.31.0", out.ver);
  const same = { ...newer(), ver: "3.31.0" };
  reset(JSON.stringify(same));
  new SaveStore().save("test");
  check("unknown data of a save of the same build is dropped", !stored().weapons.plasma && !stored().cosmetics);
}

// 4. import keeps the unknown data of a newer export; reset drops it
{
  reset(JSON.stringify(newSave()));
  const store = new SaveStore();
  const parsed = store.parse(JSON.stringify(newer()));
  check("a newer export parses", parsed.ok);
  store.data = parsed.data;
  store.kept = parsed.kept;
  store.save("import");
  check("import keeps the unknown data", stored().weapons.plasma === true && stored().cosmetics.trail === "ember");
  check("the export text carries it too", JSON.parse(store.text()).workshop.overclock === 3);
  store.reset();
  check("reset drops it", !stored().weapons.plasma && !stored().cosmetics && stored().run === null);
}

// 5. another tab (the newer build) saved meanwhile: its unknown data is taken over with its progress
{
  reset(JSON.stringify(newSave()));
  const store = new SaveStore();
  mem.set(SAVE_KEY, JSON.stringify(newer()));
  store.foreign = true;
  store.save("test");
  check(
    "the other tab's newer save keeps its unknown data",
    stored().weapons.plasma === true && stored().shards === 777,
  );
  // an unreadable save of another tab must not replace this tab's progress
  store.data.shards = 4321;
  mem.set(SAVE_KEY, JSON.stringify({ v: 1, game: "riftline", weapons: "broken", run: 7, stats: [] }).slice(0, 30));
  store.foreign = true;
  store.save("test");
  check(
    "an unreadable save of another tab does not wipe this tab's progress",
    stored().shards === 4321,
    stored().shards,
  );
}

// 6. a broken save that cannot be backed up (full storage) is not overwritten by the first autosave
{
  const broken = '{"v":1,"game":"riftline","shards":5000,"weapons":{';
  reset(broken);
  full = true;
  const store = new SaveStore();
  check("the game starts with a fresh profile", store.data.shards === 0);
  full = false;
  store.save("test");
  check("the broken save is still there", mem.get(SAVE_KEY) === broken);
  check("the menu warns", store.storageOk === false && store.held === true);
  // with room for the backup the fresh profile saves normally
  reset(broken);
  const ok = new SaveStore();
  ok.save("test");
  const backups = [...mem.keys()].filter((k) => k.startsWith(SAVE_KEY + ".backup-"));
  check("with room, the broken save is backed up and the game saves", backups.length === 1 && stored().v === 1);
}

// 3.34.0: a stored run keeps the part of a shard its kills owe (a resumed run started it at 0 and dropped shards
// differently); a broken value falls back to 0
{
  const run = (frac) => ({
    ...newSave(),
    ver: "3.31.0",
    run: { v: 1, seed: 5, weapon: "pulse", wave: 7, hp: 80, threat: 0, up: {}, shardFrac: frac },
  });
  reset(JSON.stringify(run(0.4)));
  const kept = new SaveStore().data.run;
  reset(JSON.stringify(run("lots")));
  const broken = new SaveStore().data.run;
  check(
    "a stored run keeps its shard remainder; a broken one is 0",
    kept && kept.shardFrac === 0.4 && broken && broken.shardFrac === 0,
    `${kept && kept.shardFrac} / ${broken && broken.shardFrac}`,
  );
}

// 3.35.0: the list of the removed sound notes is cleared at start
{
  reset(JSON.stringify(newSave()));
  mem.set("riftline.soundNotes", "[]");
  new SaveStore();
  check("the old sound notes are cleared at start", !mem.has("riftline.soundNotes"));
}

// 3.48.0: resetSettings puts the stock settings back (audio, video, controls, HUD layout) and keeps
// every bit of progress; the next store reads the same story back from the storage
{
  reset();
  const store = new SaveStore();
  store.data.shards = 4321;
  store.data.stats.bestWave = 12;
  store.data.settings.sfx = 0.1;
  store.data.settings.music = 1;
  store.data.settings.quality = "battery";
  store.data.settings.hudLayout = { portrait: {}, landscape: null };
  store.resetSettings();
  const s = store.data.settings;
  const d = newSave().settings;
  check(
    "resetSettings: the stock settings come back",
    JSON.stringify(s) === JSON.stringify(d) &&
      s.sfx === 0.8 &&
      s.music === 0.45 &&
      s.ambience === 0.8 &&
      s.quality === "auto" &&
      s.hudLayout === null,
    JSON.stringify(s),
  );
  check("resetSettings: progress stays", store.data.shards === 4321 && store.data.stats.bestWave === 12);
  check("resetSettings: written through", stored().settings.sfx === 0.8 && stored().shards === 4321);
  const again = new SaveStore();
  check("resetSettings: survives a reload", again.data.settings.music === 0.45 && again.data.shards === 4321);
}

console.log(failed ? `\nSAVE (node): ${failed} check(s) failed` : "\nSAVE (node): all checks passed");
process.exit(failed ? 1 : 0);
