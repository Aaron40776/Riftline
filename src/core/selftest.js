// The deep self-test (rlSelfTest: the base test plus one part per release) and its palette checks.
// Used by the tests (window.__riftTest) and the "Deep test" button of the diagnostics dialog.

import { GameUI, rlCodexEntries, rlBiomeCardInfo } from "../ui/ui.js";
import { Input } from "../ui/input.js";
import {
  musicChords,
  RL_SFX_VOICES,
  musicVoices,
  SoundEngine,
  rlSoundCatalog,
  RL_DEATH_FAMILY,
  RL_CHARGE_VOICE,
  RL_DASH_VOICE,
  RL_BOSS_ATK,
  RL_SOUND_EVENTS,
  RL_SILENT_EVENTS,
  MAX_VOICES,
} from "../audio/sound.js";
import {
  RL_RETIRE_NOTE,
  rlMigrateRetired,
  set_RL_RETIRE_NOTE,
  cleanRun,
  RL_MODULE_NOTE,
  rlMigrateModules,
  set_RL_MODULE_NOTE,
  rlMigrateUpgrades,
  rlSanitizeHistory,
} from "./save.js";
import { enemyDefs, bossOrder, biomeVariants, bossDefs, bossByWave, bossByBiome } from "../data/enemies.js";
import { ui, renderer } from "../main.js";
import { hashString, GAME_VERSION, makeRng } from "./util.js";
import { updateEnemy, findOpenSpot } from "./ai.js";
import { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, biomeList } from "../data/biomes.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { waveEvents, planWave, set_RL_BIOME_MIX_CUR, RL_BIOME_EVENT, rlEnemyFrom } from "./waves.js";
import { World } from "./world.js";
import { threatMods, workshopModules, modulesById, RL_RETIRED_MODULES } from "../data/progression.js";
import { upgradeList, upgradesById, RL_RETIRED_UPGRADES } from "../data/upgrades.js";
import { hitsObstacle, buildLayout, isConnected, RL_HAZARD_SIZE_250, rlSpawnZone } from "./arena.js";
import { computeStats } from "./stats.js";
import {
  RL_EVENT_KINDS,
  RL_BOSS_EVENTS,
  rlEventPayloadError,
  rlUiButtonGuardSelfTest,
  setDeepSelfTest,
} from "./diagnostics.js";

let RL_SELFTEST = null;
function selfTestBase() {
  if (RL_SELFTEST && RL_SELFTEST.version === GAME_VERSION) return RL_SELFTEST;
  const selftestStarted = performance.now?.() || 0;
  let fail = [],
    warn = [],
    worlds = 0,
    waves = 0,
    weapons = 0,
    bosses = 0,
    det = 0,
    frames = 0,
    enemyTypes = 0,
    biomeCases = 0,
    threatCases = 0,
    upgradeChecks = 0,
    snapshotCases = 0,
    safePointCases = 0;
  const bad = (id, msg) => fail.push(`${id}: ${msg}`);
  const finite = (value) => Number.isFinite(value);
  try {
    const seeds = [0x13579bdf, 0x2468ace0, 0x10203040, 0x55667788, 0xa5a5a5a5];
    for (const seed of seeds) {
      const world = new World({ seed, weapon: "pulse", threat: 0, ws: {} }),
        twin = new World({ seed, weapon: "pulse", threat: 0, ws: {} });
      for (let wave = 1; wave <= 20; wave++) {
        world.startWave(wave);
        twin.startWave(wave);
        worlds++;
        waves++;
        if (world.arena.key !== twin.arena.key || world.arena.W !== twin.arena.W || world.arena.H !== twin.arena.H)
          bad("determinism", `seed ${seed} wave ${wave} arena mismatch`);
        else det++;
        const currentBiome = world.biomeFor(wave)?.id,
          previousBiome = wave > 1 ? world.biomeFor(wave - 1)?.id : null;
        // 2.4.0: one biome per boss cycle — it changes right after each boss wave (5, 10, 15 …)
        if (wave > 1 && (currentBiome === previousBiome) !== ((wave - 1) % 5 !== 0))
          bad("biome-route", `biome must change exactly after boss waves (seed ${seed}, wave ${wave - 1}/${wave})`);
        if (world.event && (!waveEvents[world.event] || world.event === "dark"))
          bad("events", `invalid/removed event ${world.event} at seed ${seed} wave ${wave}`);
        if (world.boss && world.event)
          bad("events", `boss wave received event ${world.event} at seed ${seed} wave ${wave}`);
        if (!Array.isArray(world.arena.obs)) bad("arena", `missing obstacle array at seed ${seed} wave ${wave}`);
        if (
          wave >= 2 &&
          !world.boss &&
          (!world.arena.director ||
            !Number.isFinite(world.arena.director.obstacles) ||
            world.arena.director.obstacles < 0)
        )
          bad("director", `missing dynamic wave director at seed ${seed} wave ${wave}`);
        const featureSets = {
          vents: world.arena.vents || [],
          ice: world.arena.ice || [],
          acid: world.arena.acid || [],
        };
        for (const [featureType, items] of Object.entries(featureSets))
          for (const feature of items) {
            if (![feature.x, feature.y, feature.r].every(finite))
              bad("features", `non-finite ${featureType} seed ${seed} wave ${wave}`);
            if (hitsObstacle(world.arena.obs, feature.x, feature.y, (feature.r || 0) + 0.8))
              bad("features", `${featureType} overlaps obstacle at seed ${seed} wave ${wave}`);
          }
        const portals = world.arena.portals || [],
          portalPts = [];
        for (let i = 0; i < portals.length; i++) {
          const portal = portals[i],
            pair = [
              { x: portal.ax, y: portal.ay },
              { x: portal.bx, y: portal.by },
            ];
          if (![portal.ax, portal.ay, portal.bx, portal.by].every(finite))
            bad("portal", `non-finite portal pair at seed ${seed} wave ${wave}`);
          const pairDist = Math.hypot(portal.ax - portal.bx, portal.ay - portal.by);
          if (finite(pairDist) && pairDist < 7.0)
            bad("portal", `portal pair too close (${pairDist.toFixed(2)}) at seed ${seed} wave ${wave}`);
          for (const end of pair) {
            if (![end.x, end.y].every(finite) || hitsObstacle(world.arena.obs, end.x, end.y, 1.5))
              bad("portal", `invalid portal endpoint at seed ${seed} wave ${wave}`);
            if (Math.abs(end.x) > world.arena.W - 3.6 || Math.abs(end.y) > world.arena.H - 3.6)
              bad("portal", `portal endpoint out of safe bounds at seed ${seed} wave ${wave}`);
            for (const prev of portalPts) {
              const dist = Math.hypot(end.x - prev.x, end.y - prev.y);
              if (dist < 4.0)
                bad("portal", `portal endpoints overlap/cluster (${dist.toFixed(2)}) at seed ${seed} wave ${wave}`);
            }
            portalPts.push(end);
          }
        }
        const spawnProbeRng = makeRng(hashString(seed + ":spawn-probe:" + wave));
        for (const [clearance, dist] of [
          [7, 1],
          [9, 1.6],
          [3, 0.4],
        ]) {
          const point = world.arena.freePoint(spawnProbeRng, world.player.x, world.player.y, clearance, dist);
          if (
            !point ||
            !finite(point.x) ||
            !finite(point.y) ||
            world.arena.blocked(point.x, point.y, dist + 0.4) ||
            world.arena.featureBlocked(point.x, point.y, dist * 0.3)
          )
            bad("spawn-safe", `freePoint failed at seed ${seed} wave ${wave}`);
        }
        const helperRng = makeRng(hashString(seed + ":safe-point-probe:" + wave));
        for (const [minD, maxD] of [
          [2, 6],
          [4, 10],
          [1.5, 5],
        ]) {
          const point = findOpenSpot(
            { rng: helperRng, arena: world.arena },
            world.player.x,
            world.player.y,
            minD,
            maxD,
          );
          if (
            point &&
            (!finite(point.x) ||
              !finite(point.y) ||
              world.arena.outside(point.x, point.y, 2) ||
              world.arena.blocked(point.x, point.y, 2) ||
              world.arena.featureBlocked(point.x, point.y, 0.6))
          )
            bad("safe-point", `unsafe helper point seed ${seed} wave ${wave}`);
          else if (point) safePointCases++;
        }
      }
    }
    for (const biome of biomeList)
      for (const seed of seeds) {
        const world = new World({ seed, weapon: "pulse", threat: 0, ws: {} });
        if (!world.route?.includes(biome.id)) bad("biome-route", `seed ${seed} route is missing biome ${biome.id}`);
      }
    for (const id of Object.keys(weaponDefs)) {
      const world = new World({ seed: 0x7f4a7c15, weapon: id, threat: 0, ws: {} });
      for (let frame = 0; frame < 12; frame++) {
        world.step(1 / 60, {
          mx: 1,
          my: 0.15,
          aim: true,
          ax: 1,
          ay: 0.15,
          fire: true,
          assist: false,
          dash: frame === 1,
          nova: frame === 5,
        });
        frames++;
        if (![world.player.x, world.player.y, world.player.vx, world.player.vy, world.player.hp].every(finite))
          bad("weapon-runtime", `${id} produced non-finite player state`);
        for (const shot of world.pb || [])
          if (![shot.x, shot.y, shot.vx, shot.vy, shot.life].every(finite))
            bad("weapon-runtime", `${id} produced non-finite projectile state`);
      }
      weapons++;
    }
    for (const id of bossOrder) {
      const world = new World({ seed: 0x31415926, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(bossByWave[5] === id ? 5 : bossByWave[10] === id ? 10 : bossByWave[15] === id ? 15 : 20);
      const boss = world.spawnBoss(id);
      bosses++;
      if (!boss || !finite(boss.hp) || !finite(boss.x) || !finite(boss.y)) bad("boss-runtime", `${id} failed spawn`);
      for (let frame = 0; frame < 4; frame++) {
        world.step(1 / 60, { mx: 0, my: 0, aim: true, ax: 1, ay: 0, fire: true, assist: false });
        frames++;
        if (!world.boss || !finite(world.boss.hp)) bad("boss-runtime", `${id} failed during step`);
      }
    }
    for (const id of Object.keys(enemyDefs)) {
      const def = enemyDefs[id],
        world = new World({
          seed: hashString("enemy-probe:" + id),
          weapon: "pulse",
          threat: Math.min(5, Math.floor((def.from || 1) / 5)),
          ws: {},
        });
      world.startWave(Math.max(1, Math.min(50, def.from || 1)));
      const point = world.arena.freePoint(
        makeRng(hashString("enemy-spawn:" + id)),
        world.player.x,
        world.player.y,
        6,
        0.45,
      );
      if (!point || !finite(point.x) || !finite(point.y)) bad("enemy-spawn", `${id} has no safe spawn point`);
      else {
        const enemy = world.spawnEnemy(id, point.x, point.y);
        if (!enemy || enemy.type !== id) bad("enemy-spawn", `${id} failed direct spawn`);
        else {
          enemy.t = 0;
          for (let frame = 0; frame < 60; frame++) {
            world.step(1 / 60, { mx: 0.15, my: 0.05, aim: true, ax: 1, ay: 0.05, fire: true, assist: false });
            frames++;
            if (![enemy.x, enemy.y, enemy.vx, enemy.vy, enemy.hp, enemy.t, enemy.t2].every(finite))
              bad("enemy-runtime", `${id} produced non-finite state at frame ${frame}`);
          }
          enemyTypes++;
        }
      }
    }
    for (const biome of biomeList) {
      for (const seed of [0x10101, 0x20202, 0x30303]) {
        const world = new World({ seed, weapon: "pulse", threat: 2, ws: {} }),
          idx = world.route.indexOf(biome.id),
          firstWave = 1 + 5 * idx; // 2.4.0: first wave of that biome's boss cycle
        world.startWave(firstWave);
        if (world.arena.biome?.id !== biome.id)
          bad("biome-runtime", `route for seed ${seed} did not resolve ${biome.id} at wave ${firstWave}`);
        const point = world.arena.freePoint(
          makeRng(hashString(seed + ":" + biome.id)),
          world.player.x,
          world.player.y,
          4,
          0.45,
        );
        if (!point || world.arena.blocked(point.x, point.y, 0.85))
          bad("biome-runtime", `unsafe spawn space in ${biome.id} seed ${seed}`);
        biomeCases++;
      }
    }
    for (let threat = 0; threat <= 5; threat++)
      for (const seed of [0x4141, 0x5151]) {
        const world = new World({ seed, weapon: "pulse", threat, ws: {} });
        for (let wave = 1; wave <= 12; wave++) {
          world.startWave(wave);
          for (let frame = 0; frame < 8; frame++) {
            world.step(1 / 60, {
              mx: frame % 2 ? 0.4 : 0,
              my: frame % 3 ? 0.2 : 0,
              aim: true,
              ax: 1,
              ay: 0,
              fire: true,
              assist: false,
              dash: frame === 3,
              nova: frame === 6,
            });
            frames++;
            if (![world.player.x, world.player.y, world.player.hp, world.time, world.kills, world.shards].every(finite))
              bad("threat-runtime", `Threat ${threat} wave ${wave} became non-finite`);
          }
        }
        threatCases++;
      }
    {
      const base = computeStats("pulse", {}, {}),
        boost = computeStats("pulse", { rate: 3, crit: 2 }, {}); // 2.8.0: Targeting Chip speeds shots up too
      if (!(boost.rateMul > base.rateMul && boost.velMul > base.velMul))
        bad("upgrade-runtime", "Rapid Cycler and Targeting Chip do not alter rate and velocity");
      else upgradeChecks++;
      for (const def of upgradeList) {
        const testUp = {};
        testUp[def.id] = 1;
        const stats = computeStats(def.weapon || "pulse", testUp, {
          hull: 1,
          power: 1,
          thrust: 1,
          dash: 1,
          magnet: 1,
          salvage: 1,
          reroll: 1,
          nova: 1,
          insight: 1,
          revive: 1,
        });
        const finiteNumbers = Object.entries(stats)
          .filter(([key]) => key !== "weapon")
          .every(([, value]) => typeof value !== "number" || Number.isFinite(value));
        if (!finiteNumbers) bad("upgrade-runtime", `${def.id} produced non-finite stat`);
        else upgradeChecks++;
      }
      const world = new World({ seed: 0x1ce55eed, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(13);
      world.stats = computeStats("pulse", { supply: 2, overcharge: 2 }, {});
      const point = world.arena.freePoint(
          makeRng(hashString("upgrade-kill-probe")),
          world.player.x,
          world.player.y,
          6,
          0.45,
        ),
        enemy = point && world.spawnEnemy("turret", point.x, point.y, { elite: true });
      if (!enemy) bad("upgrade-runtime", "could not spawn elite turret probe");
      else {
        const shardBefore = world.pickups
            .filter((pickup) => pickup.kind === "shard")
            .reduce((sum, pickup) => sum + (pickup.v || 0), 0),
          novaBefore = world.player.nova;
        world.killEnemy(enemy);
        const shardAfter = world.pickups
            .filter((pickup) => pickup.kind === "shard")
            .reduce((sum, pickup) => sum + (pickup.v || 0), 0),
          novaAfter = world.player.nova;
        if (shardAfter - shardBefore < 2) bad("upgrade-runtime", "Supply Loop did not add its elite bonus shards");
        else upgradeChecks++;
        if (novaAfter - novaBefore < 39.4) bad("upgrade-runtime", "Overcharge did not add its per-kill Nova charge");
        else upgradeChecks++;
      }
    }
    {
      const director = new World({ seed: 0x5a17c0de, weapon: "rocket", threat: 2, ws: {} });
      let dynamic = 0,
        caches = 0;
      for (let wave = 2; wave <= 28; wave++) {
        director.startWave(wave);
        dynamic += Math.max(0, director.arena.obs.length - (director.arena.biome.obstacles?.length || 0));
        caches += director.pickups.filter((pickup) => pickup.cache).length;
        for (const obstacle of director.arena.obs)
          if (![obstacle.x, obstacle.y].every(finite))
            bad("director-runtime", `non-finite dynamic obstacle at wave ${wave}`);
        for (const kind of ["vents", "ice", "acid", "portals"])
          for (const feature of director.arena[kind] || [])
            for (const value of Object.values(feature))
              if (typeof value === "number" && !finite(value))
                bad("director-runtime", `non-finite ${kind} value at wave ${wave}`);
      }
      if (dynamic < 8) bad("director-runtime", `too few dynamic obstacle cases (${dynamic})`);
      else det++;
      if (caches < 12) bad("director-runtime", `too few wave caches (${caches})`);
      else det++;
    }
    {
      const world = new World({ seed: 0xdecafbad, weapon: "pulse", threat: 3, ws: {} });
      world.startWave(7);
      for (let frame = 0; frame < 20; frame++) {
        world.step(1 / 60, { mx: 0.3, my: 0.1, aim: true, ax: 1, ay: 0, fire: true, assist: false, dash: frame === 4 });
        frames++;
      }
      const snap = world.snapshot(),
        restored = new World({ snap, ws: {} });
      if (
        restored.wave !== world.wave ||
        restored.seed !== world.seed ||
        restored.weapon !== world.weapon ||
        restored.hp !== world.hp ||
        JSON.stringify(restored.up) !== JSON.stringify(world.up)
      )
        bad("snapshot", "extended snapshot roundtrip mismatch");
      else snapshotCases++;
    }
    const offerWorld = new World({ seed: 0xabcdef01, weapon: "pulse", threat: 0, ws: {} }),
      offer = offerWorld.makeOffer();
    if (!Array.isArray(offer) || offer.length < 1 || offer.some((id) => !upgradesById[id]))
      bad("upgrade-offer", "invalid generated offer");
    else det++;
  } catch (err) {
    bad("selftest-exception", (err && err.message) || String(err));
  }
  RL_SELFTEST = {
    version: GAME_VERSION,
    ok: fail.length === 0,
    fail,
    warn,
    worlds,
    waves,
    weapons,
    bosses,
    det,
    frames,
    enemyTypes,
    biomeCases,
    threatCases,
    upgradeChecks,
    snapshotCases,
    safePointCases,
    ms: Math.max(0, Math.round((performance.now?.() || selftestStarted) - selftestStarted)),
  };
  return RL_SELFTEST;
}
/* The deep self-test: the base test, then one part per release. Each part takes the result so far
 and returns it with its own key added and `ok` combined. Until 2.5.0 the parts wrapped
 rlSelfTest one after another; they run in the order of that wrapper chain (innermost first). */
function rlSelfTest() {
  let result = selfTestBase();
  result = selfTestExpansion23(result); // 2.2.3
  result = selfTestExpansion22(result); // 2.2
  result = selfTestExpansion21(result); // 2.1
  result = selfTestV240(result);
  result = selfTestV246(result);
  result = selfTestV250A(result);
  result = selfTestV250C(result);
  result = selfTestV250D(result);
  result = selfTestV250B(result);
  result = selfTestV260(result);
  result = selfTestV270Sound(result);
  result = selfTestV280(result);
  return result;
}
/* ---- 2.2.3 deep self-test additions: each case reproduces a bug class that
 slipped through 2.2.2 (plan members, event names, save loader, texts, arena features).
 Every section runs in its own try so one failure cannot hide the others. ---- */
function selfTestExpansion23(result) {
  const t0 = performance.now(),
    finite = Number.isFinite,
    cats = new Map();
  const bad = (cat, example) => {
    const entry = cats.get(cat);
    if (entry) {
      entry.n++;
      if (entry.all.length < 8) {
        entry.all.push(example);
      }
    } else {
      cats.set(cat, { n: 1, ex: example, all: [example] });
    }
  };
  const section = (cat, fn) => {
    try {
      fn();
    } catch (err) {
      bad(cat + "-exception", String((err && err.message) || err));
    }
  };
  let planWaves = 0,
    spawned = 0,
    eventKinds = new Set(),
    featureLayouts = 0,
    features = 0,
    snaps = 0;
  // 1. every wave's spawn plan (incl. director bonus groups) must be valid and spawn, waves 2–60
  section("plan", () => {
    for (const threat of [0, 5]) {
      const world = new World({ seed: 0x51, weapon: "pulse", threat, ws: { fieldSupply: 3 } });
      for (let wave = 2; wave <= 60; wave++) {
        world.startWave(wave);
        planWaves++;
        for (const group of world.plan)
          for (let i = 0; i < group.members.length; i++) {
            const member = group.members[i];
            if (!member || typeof member !== "object" || !enemyDefs[member.type]) {
              bad("plan-member", `wave ${wave}: ${JSON.stringify(member)}`);
              continue;
            }
            if (i) continue; // every member is type-checked; one per group is spawned for real
            const point = world.arena.freePoint(world.rng, world.player.x, world.player.y, 4, 0.5),
              enemy = world.spawnEnemy(member.type, point.x, point.y, { elite: member.elite });
            spawned++;
            if (!enemy || ![enemy.x, enemy.y, enemy.hp].every(finite))
              bad("plan-spawn", `${member.type} @ wave ${wave}`);
          }
        if (world.bossPending && !bossDefs[world.bossPending]) bad("plan-boss", `${world.bossPending} @ wave ${wave}`);
        world.enemies.length = 0;
      }
    }
  });
  // 2. event contract: every enemy type fights for 7 s near a stationary player, no boss present
  section("events", () => {
    for (const id of Object.keys(enemyDefs)) {
      const world = new World({ seed: hashString("ev:" + id), weapon: "pulse", threat: 0, ws: {} });
      world.startWave(41);
      world.god = true;
      world.hold = true;
      world.plan = [];
      world.bossPending = null;
      world.championPending = null;
      world.fx.length = 0;
      let point = null;
      for (let step = 0; step < 12 && !point; step++) {
        const x = world.player.x + Math.cos(step * 0.52) * 7,
          y = world.player.y + Math.sin(step * 0.52) * 7;
        if (!(world.arena.blocked(x, y, 1) || world.arena.outside(x, y, 1))) {
          point = { x, y };
        }
      }
      point = point || world.arena.freePoint(world.rng, world.player.x, world.player.y, 5, 0.6);
      world.spawnEnemy(id, point.x, point.y, {}).spawnT = 0;
      for (let frame = 0; frame < 420; frame++) {
        const dash0 = world.player.dashId,
          fxStart = world.fx.length;
        world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, auto: false });
        for (let i = fxStart; i < world.fx.length; i++) {
          const kind = world.fx[i].k;
          eventKinds.add(kind);
          if (!RL_EVENT_KINDS.has(kind)) {
            bad("event-unconsumed", `"${kind}" from ${id}`);
          }
          {
            const payloadError = rlEventPayloadError(world.fx[i]);
            if (payloadError) {
              bad("event-payload", `${payloadError} (${id})`);
            }
          }
          if (RL_BOSS_EVENTS.has(kind) && !world.boss) {
            bad("event-boss-only", `"${kind}" from ${id}`);
          }
          if (kind === "dash" && world.player.dashId === dash0) {
            bad("event-player-dash", `"dash" from ${id}`);
          }
        }
        world.fx.length = 0;
      }
    }
  });
  // 2b. the sound engine gives every weapon a voice (exercises the real consumer)
  section("sfx", () => {
    const sound = new SoundEngine(),
      heard = [];
    sound.ctx = { state: "running" };
    sound.play = (name) => heard.push(name);
    for (const id of Object.keys(weaponDefs)) {
      heard.length = 0;
      sound.consume([{ k: "shot", w: id }]);
      if (!RL_SFX_VOICES.includes(heard[0])) {
        bad("sfx-silent-weapon", id);
      }
    }
  });
  // 2e. every biome has one coherent palette and valid champion variants
  section("palette", () => {
    for (const biome of biomeList) {
      const issues = rlPaletteIssues(biome);
      if (issues.length) {
        bad("biome-palette", `${biome.id}: ${issues.join(", ")}`);
      }
    }
    for (const issue of rlBiomeDistinct()) bad("biome-lookalike", issue);
    for (const [biomeId, variant] of Object.entries(biomeVariants)) {
      if (!["scorch", "frost", "phase", "toxic"].includes(variant.id)) {
        bad("variant-dead", `${biomeId} → ${variant.id}`);
      }
    }
    for (const [biomeId, variant] of Object.entries(biomeVariants))
      for (const type of variant.types) {
        if (!enemyDefs[type]) {
          bad("variant-type", `${biomeId}: ${type}`);
        }
      }
  });
  // 2c. music: every biome has its own theme and every step of fight/boss/menu music schedules cleanly
  section("music", () => {
    const OfflineAudio = typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : null;
    for (const biome of biomeList) {
      if (!musicChords[biome.id] || !musicVoices[biome.id]) {
        bad("music-missing", biome.id);
        continue;
      }
      if (!OfflineAudio) continue;
      const sound = new SoundEngine(),
        ctx = new OfflineAudio(1, 2205, 22050);
      sound.ctx = ctx;
      sound.mus = ctx.createGain();
      sound.delay = ctx.createDelay(1);
      sound.sfx = ctx.createGain();
      sound.mus.connect(ctx.destination);
      sound.delay.connect(sound.mus);
      sound.sfx.connect(ctx.destination);
      sound.noiseBuf = ctx.createBuffer(1, 2205, 22050);
      sound.biome = biome.id;
      for (const [mode, steps] of [
        ["fight", 64],
        ["menu", 16],
      ]) {
        sound.mode = mode;
        sound.intensity = 0.9;
        sound.cycle = 0;
        for (let step = 0; step < steps; step++) sound.note(step, 0);
      }
    }
  });
  // 2d. stragglers: a hunting enemy of every type closes in on a stationary player
  section("hunt", () => {
    for (const id of Object.keys(enemyDefs)) {
      if (id === "mite" || id === "hive") continue;
      const world = new World({ seed: hashString("hunt:" + id), weapon: "pulse", threat: 0, ws: {} });
      world.startWave(41);
      world.god = true;
      world.hold = true;
      world.plan = [];
      world.bossPending = null;
      world.championPending = null;
      let point = null;
      for (let step = 0; step < 24 && !point; step++) {
        const x = world.player.x + Math.cos(step * 0.26) * 12,
          y = world.player.y + Math.sin(step * 0.26) * 12;
        if (!(world.arena.blocked(x, y, 1.2) || world.arena.outside(x, y, 1.2))) {
          point = { x, y };
        }
      }
      point = point || world.arena.freePoint(world.rng, world.player.x, world.player.y, 9, 0.6);
      const enemy = world.spawnEnemy(id, point.x, point.y, {});
      enemy.spawnT = 0;
      enemy.hunt = true;
      enemy.hp = enemy.maxHp = 1e9;
      const dist0 = Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y);
      let dmin = dist0;
      for (let frame = 0; frame < 480; frame++) {
        world.step(1 / 60, { mx: 0, my: 0, fire: false, auto: false });
        enemy.hunt = true;
        dmin = Math.min(dmin, Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y));
      }
      if (dmin > 6) {
        bad("straggler-kites", `${id} stayed ${dmin.toFixed(1)} m away (start ${dist0.toFixed(1)}) while hunting`);
      }
    }
  });
  // 3. save loader: live snapshots must pass cleanRun() and restore the same run
  section("snapshot", () => {
    for (const wave of [1, 7, 19, 33]) {
      const world = new World({ seed: 0x77 + wave, weapon: "tesla", threat: 1, ws: { hull: 2 } });
      world.startWave(wave);
      world.up = { dmg: 2, orbit: 1 };
      world.stats = computeStats(world.weapon, world.up, world.ws);
      const snap = cleanRun(JSON.parse(JSON.stringify(world.snapshot()))),
        restored = snap && new World({ snap: snap, ws: { hull: 2 } });
      if (!restored || restored.wave !== wave || restored.weapon !== "tesla" || restored.up.dmg !== 2)
        bad("snapshot", `wave ${wave} does not restore`);
      else snaps++;
    }
  });
  // 4. upgrade texts describe the level you are about to take (no "+0 %")
  section("desc", () => {
    for (const upgrade of upgradeList) {
      const text = upgrade.desc(0);
      if (/(^|[^\d.])[+\-]?0(%|\s|\))/.test(text)) {
        bad("desc-zero", `${upgrade.id}: “${text}”`);
      }
    }
  });
  // 5. every weapon has a firing voice; every enemy has a mesh pool
  section("coverage", () => {
    if (renderer)
      for (const id of Object.keys(enemyDefs)) {
        if (!renderer.enemyPools[id]) {
          bad("mesh", id);
        }
      }
  });
  // 6. arena features (vents, ice, acid, portals) of every biome, waves 21–60: no overlap with obstacles, portals valid
  section("features", () => {
    for (const biome of biomeList)
      for (const wave of [21, 33, 47, 58]) {
        const lay = buildLayout(biome, 0x33 + wave, wave, false),
          hazards = lay.features || {};
        featureLayouts++;
        for (const kind of ["vents", "ice", "acid"])
          for (const feature of hazards[kind] || []) {
            features++;
            if (
              ![feature.x, feature.y, feature.r].every(finite) ||
              hitsObstacle(lay.obstacles, feature.x, feature.y, (feature.r || 0) + 0.8)
            )
              bad("feature-overlap", `${kind} in ${biome.id} wave ${wave}`);
          }
        for (const portal of hazards.portals || []) {
          features++;
          for (const [x, y] of [
            [portal.ax, portal.ay],
            [portal.bx, portal.by],
          ])
            if (
              !finite(x) ||
              !finite(y) ||
              hitsObstacle(lay.obstacles, x, y, 1.5) ||
              Math.abs(x) > lay.W - 3.6 ||
              Math.abs(y) > lay.H - 3.6
            )
              bad("portal", `${biome.id} wave ${wave}`);
        }
        if ("pads" in hazards) bad("pads-removed", `${biome.id} still generates jump pads`);
        const theme = RL_BIOME_HAZARD[biome.id] ?? "";
        for (const kind of ["vents", "ice", "acid", "portals"]) {
          if ((hazards[kind] || []).length && kind !== theme) {
            bad("hazard-theme", `${kind} in ${biome.id} (theme: ${theme || "none"})`);
          }
        }
      }
  });
  const fail = [...cats].map(([cat, entry]) => `${cat}${entry.n > 1 ? ` ×${entry.n}` : ""} (${entry.all.join("; ")})`);
  return {
    ...result,
    ok: result.ok && !fail.length,
    expansion23: {
      ok: !fail.length,
      fail,
      planWaves,
      spawned,
      eventKinds: eventKinds.size,
      snapshots: snaps,
      featureLayouts,
      features,
      ms: Math.round(performance.now() - t0),
    },
  };
}
function rlLum(color) {
  return (0.2126 * ((color >> 16) & 255) + 0.7152 * ((color >> 8) & 255) + 0.0722 * (color & 255)) / 255;
}
function rlPaletteIssues(biome) {
  const lum = rlLum,
    out = [];
  if (lum(biome.floor) > 0.1) {
    out.push(`floor too bright (${lum(biome.floor).toFixed(2)})`);
  }
  if (lum(biome.fog) > 0.08) {
    out.push(`fog too bright (${lum(biome.fog).toFixed(2)})`);
  }
  if (lum(biome.ground) > 0.1) {
    out.push(`ground light too bright (${lum(biome.ground).toFixed(2)})`);
  }
  if (lum(biome.wall) > 0.2) {
    out.push(`walls too bright (${lum(biome.wall).toFixed(2)})`);
  }
  if (lum(biome.grid) < 0.4) {
    out.push(`grid too dark (${lum(biome.grid).toFixed(2)})`);
  }
  if (lum(biome.accent) < 0.35) {
    out.push(`accent too dark (${lum(biome.accent).toFixed(2)})`);
  }
  if (lum(biome.sky) < 0.12 || lum(biome.sky) > 0.55) {
    out.push(`sky light out of range (${lum(biome.sky).toFixed(2)})`);
  }
  return out;
}
/* 2.3.3: biomes must be told apart at a glance. The floor is near-black in every
 biome, so identity rests on the grid colour: CIE76 ΔE between the grids of any
 two biomes must be >= 30 (≈ clearly different hue or lightness). */
function rlLab(color) {
  const lin = (value) => ((value /= 255) <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4),
    r = lin((color >> 16) & 255),
    g = lin((color >> 8) & 255),
    b = lin(color & 255);
  const labCurve = (value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const x = labCurve((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047),
    y = labCurve(r * 0.2126 + g * 0.7152 + b * 0.0722),
    z = labCurve((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function rlBiomeDistinct(min = 30) {
  const out = [];
  for (let i = 0; i < biomeList.length; i++)
    for (let j = i + 1; j < biomeList.length; j++) {
      const labA = rlLab(biomeList[i].grid),
        labB = rlLab(biomeList[j].grid),
        dist = Math.hypot(labA[0] - labB[0], labA[1] - labB[1], labA[2] - labB[2]);
      if (dist < min) {
        out.push(`${biomeList[i].id}/${biomeList[j].id} ΔE ${dist.toFixed(0)}`);
      }
    }
  return out;
}
function selfTestExpansion22(result) {
  const fail = [];
  const weapons = Object.keys(weaponDefs),
    enemies = Object.keys(enemyDefs),
    biomes = Object.keys(biomesById),
    upgrades = Object.keys(upgradesById),
    modules = Object.keys(modulesById);
  if (!["drone", "driller", "beacon", "weaver"].every((id) => enemies.includes(id))) fail.push("missing-v22-enemy");
  // 2.5.0: of the 2.2 upgrades only Salvager Core is left; the others were copies (retired)
  if (!upgrades.includes("salvager")) fail.push("missing-v22-upgrade");
  // 2.5.0 B: Route Scanner and Reactor Core were merged into Field Supply and Nova Cell
  if (!["fieldSupply", "nova"].every((id) => modules.includes(id))) fail.push("missing-v22-workshop");
  // 2.4.0: every selectable weapon (the 2.2 weapons are gone)
  for (const id of weaponOrder) {
    const world = new World({ seed: 0x2200 + id.length, weapon: id, threat: 0, ws: {} });
    world.startWave(2);
    world.fire(0);
    if (!world.pb.length) fail.push("weapon-fire:" + id);
    for (const shot of world.pb)
      if (![shot.x, shot.y, shot.vx, shot.vy, shot.r, shot.dmg, shot.life].every(Number.isFinite))
        fail.push("weapon-finite:" + id);
  }
  for (const id of ["drone", "driller", "beacon", "weaver"]) {
    const world = new World({ seed: 0x3300 + id.length, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(28);
    const enemy = world.spawnEnemy(id, 8, 0, {});
    for (let frame = 0; frame < 90; frame++) {
      updateEnemy(world, enemy, 0.05);
      enemy.x += enemy.vx * 0.05;
      enemy.y += enemy.vy * 0.05;
      if (![enemy.x, enemy.y, enemy.vx, enemy.vy, enemy.hp].every(Number.isFinite)) fail.push("enemy-finite:" + id);
    }
  }
  const modes = new Set();
  // 2.4.0: every hazard biome for every wave (picking one biome by (seed + wave) % count only
  // reached 9 of the 12 modes once there were four biomes)
  for (let seed = 1; seed <= 4; seed++)
    for (let wave = 2; wave <= 38; wave++)
      for (const biome of biomeList.slice(1)) {
        const lay = buildLayout(biome, seed, wave, false);
        if (!lay.director?.mode) fail.push("director-missing");
        else modes.add(lay.director.mode);
        if (!isConnected(lay.obstacles, lay.W, lay.H)) fail.push("director-connectivity");
        for (const key of ["vents", "ice", "acid"]) {
          for (const feature of lay.features?.[key] || [])
            if (hitsObstacle(lay.obstacles, feature.x, feature.y, (feature.r || 0) + 0.8))
              fail.push("feature-overlap:" + key);
        }
        for (const portal of lay.features?.portals || []) {
          for (const [x, y] of [
            [portal.ax, portal.ay],
            [portal.bx, portal.by],
          ])
            if (hitsObstacle(lay.obstacles, x, y, 1.5) || Math.abs(x) > lay.W - 3.6 || Math.abs(y) > lay.H - 3.6)
              fail.push("portal-overlap");
        }
      }
  if (modes.size < 10) fail.push("director-variety");
  let minCache = Infinity,
    maxCache = 0;
  for (let wave = 2; wave <= 30; wave++) {
    const world = new World({ seed: 0x4400 + wave, weapon: "pulse", threat: 0, ws: { fieldSupply: 1 } });
    world.startWave(wave);
    const caches = world.pickups.filter((pickup) => pickup.cache).length;
    if (world.bossPending) {
      if (caches) {
        fail.push("cache-in-boss-wave:" + wave);
      }
      continue;
    }
    minCache = Math.min(minCache, caches);
    maxCache = Math.max(maxCache, caches);
    if (caches < 1) fail.push("cache-missing:" + wave);
  }
  const haz = new World({ seed: 0x5500, weapon: "pulse", threat: 0, ws: { hazardSeal: 3 } });
  if (!(haz.stats.hazardResist > 0.4)) fail.push("hazard-resist");
  const guard = rlUiButtonGuardSelfTest();
  if (!guard.ok || guard.count !== 9 || guard.steps !== 8) fail.push("ui-guard");
  const counts = {
    weaponCount: weapons.length,
    enemyCount: enemies.length,
    biomeCount: biomes.length,
    upgradeCount: upgrades.length,
    workshopCount: modules.length,
    directorModes: [...modes],
    cacheRange: [minCache, maxCache],
  };
  return { ...result, ok: result.ok && fail.length === 0, expansion22: { ok: fail.length === 0, fail, ...counts } };
}
function selfTestExpansion21(result) {
  const fail = [];
  const weapons = Object.keys(weaponDefs),
    enemies = Object.keys(enemyDefs),
    biomes = Object.keys(biomesById),
    upgrades = Object.keys(upgradesById);
  if (!["sapper", "phantom", "sentinel", "carrier"].every((id) => enemies.includes(id))) fail.push("missing-v21-enemy");
  if (
    // 2.5.0: Dead Focus, Fortify, Nanite Leech and Scavenger Net were retired
    !["overload", "resonance", "hazmat", "echo"].every((id) => upgrades.includes(id))
  )
    fail.push("missing-v21-upgrade");
  // 2.4.0: every weapon with a blast (was Graviton Core, Nova Bloom and Vortex)
  for (const weapon of weaponOrder.filter((id) => weaponDefs[id].explode)) {
    const world = new World({ seed: 0x21 + weapon.length, weapon: weapon, threat: 0, ws: {} });
    world.startWave(2);
    world.bulletBurst({ x: 0, y: 0, w: weapon, dmg: 10, hits: [], bomblet: false, wing: false }, null);
    if (!world.fx.some((fx) => fx.k === "boom")) fail.push("burst:" + weapon);
  }
  const modes = new Set();
  for (let seed = 1; seed <= 4; seed++)
    for (let wave = 2; wave <= 28; wave++) {
      const biome = biomeList[1 + ((seed + wave) % (biomeList.length - 1))],
        lay = buildLayout(biome, seed, wave, false);
      if (!lay.director?.mode) fail.push("director-missing");
      else modes.add(lay.director.mode);
      if (!isConnected(lay.obstacles, lay.W, lay.H)) fail.push("director-connectivity");
    }
  if (modes.size < 6) fail.push("director-variety");
  return {
    ...result,
    ok: result.ok && fail.length === 0,
    expansion21: {
      ok: fail.length === 0,
      fail,
      weaponCount: weapons.length,
      enemyCount: enemies.length,
      biomeCount: biomes.length,
      upgradeCount: upgrades.length,
      directorModes: [...modes],
    },
  };
}
function selfTestV240(result) {
  const fail = [];
  if (weaponOrder.length !== 7 || Object.keys(weaponDefs).length !== 7) fail.push("weapon-count:" + weaponOrder.length);
  if (biomeList.length !== 5) fail.push("biome-count:" + biomeList.length);
  for (const upgrade of upgradeList)
    if (upgrade.weapon && !weaponDefs[upgrade.weapon]) fail.push("evo-weapon:" + upgrade.id);
  // route: Neon Yard first, then one biome per boss cycle, all five by wave 21
  for (const seed of [11, 222, 3333, 44444]) {
    const world = new World({ seed, weapon: "pulse", threat: 0, ws: {} }),
      seen = new Set();
    for (let wave = 1; wave <= 30; wave++) {
      const biome = world.biomeFor(wave).id;
      if (wave <= 21) {
        seen.add(biome);
      }
      if (wave <= 5 && biome !== "yard") {
        fail.push(`route-start:${seed}:${wave}`);
      }
      if (wave > 1 && (biome === world.biomeFor(wave - 1).id) !== ((wave - 1) % 5 !== 0))
        fail.push(`route-cycle:${seed}:${wave}`);
    }
    if (seen.size !== 5) {
      fail.push(`route-coverage:${seed}:${seen.size}`);
    }
  }
  // every hazard biome has its hazard in a normal wave, and only that one
  const want = { works: "vents", vault: "ice", marsh: "acid", void: "portals" };
  for (const [id, kind] of Object.entries(want)) {
    const world = new World({ seed: 0x240 + id.length, weapon: "pulse", threat: 0, ws: {} }),
      wave = 2 + 5 * world.route.indexOf(id);
    world.startWave(wave);
    if (world.arena.biome.id !== id) fail.push("hazard-biome:" + id);
    if (!world.arena[kind].length) fail.push("hazard-missing:" + id);
    for (const other of ["vents", "ice", "acid", "portals"]) {
      if (other !== kind && world.arena[other].length) {
        fail.push(`hazard-foreign:${id}:${other}`);
      }
    }
  }
  // Cryo Vault: the drone drifts (lower grip than anywhere else)
  const drift = (id) => {
    const world = new World({ seed: 0x2401, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(1 + 5 * world.route.indexOf(id));
    world.arena.ice.length = 0;
    world.enemies.length = 0;
    world.plan = [];
    world.step(1 / 60, { mx: 1, my: 0 });
    return world.player.vx;
  };
  if (!(drift("vault") < drift("yard") * 0.6)) fail.push("vault-grip");
  // enemy mix: each biome spawns more of its own enemies than Neon Yard does
  for (const [id, info] of Object.entries(RL_BIOME_INFO)) {
    if (!info.mix) continue;
    const own = Object.keys(info.mix).filter((type) => info.mix[type] > 1),
      count = (mix) => {
        let hits = 0;
        set_RL_BIOME_MIX_CUR(mix);
        try {
          for (let i = 1; i <= 12; i++)
            for (const group of planWave(makeRng(hashString("mix:" + i)), 30, threatMods(0), false, {}))
              hits += group.members.filter((member) => own.includes(member.type)).length;
        } finally {
          set_RL_BIOME_MIX_CUR(null);
        }
        return hits;
      };
    if (!(count(info.mix) > count(null) * 1.3)) fail.push("enemy-mix:" + id);
  }
  // old saves: retired weapons become their original + refund, run and selection follow
  const note = RL_RETIRE_NOTE,
    migrated = rlMigrateRetired({
      shards: 100,
      weapon: "ion",
      weapons: { pulse: true, ion: true, voidlance: true, rail: true },
      run: { weapon: "cyclone", wave: 4 },
    });
  set_RL_RETIRE_NOTE(note);
  if (
    migrated.weapon !== "tesla" ||
    migrated.run.weapon !== "disc" ||
    !migrated.weapons.tesla ||
    migrated.weapons.ion ||
    migrated.weapons.voidlance ||
    migrated.shards !== 100 + (1250 - weaponDefs.tesla.cost) + 1950
  )
    fail.push("migrate:" + JSON.stringify(migrated));
  if (rlMigrateRetired(migrated) !== migrated) fail.push("migrate-twice");
  return { ...result, ok: result.ok && fail.length === 0, v240: { ok: fail.length === 0, fail } };
}
// 2.4.6: one boss per biome, Void Core always waves 16–20 with the Rift Core as the final boss.
function selfTestV246(result) {
  const fail = [];
  for (const [biome, id] of Object.entries(bossByBiome)) {
    if (!biomesById[biome]) fail.push("boss-biome:" + biome);
    if (!bossDefs[id]) fail.push("boss-def:" + id);
  }
  if (Object.keys(bossByBiome).length !== biomeList.length) fail.push("boss-per-biome");
  for (const seed of [11, 222, 3333, 44444, 0x246]) {
    const world = new World({ seed, weapon: "pulse", threat: 0, ws: {} }),
      mid = new Set([world.biomeFor(6).id, world.biomeFor(11).id]);
    if (world.biomeFor(16).id !== "void" || world.biomeFor(20).id !== "void") fail.push(`void-last:${seed}`);
    if (world.bossFor(20) !== "core") fail.push(`final-boss:${seed}`);
    if (world.bossFor(5) !== "warden") fail.push(`first-boss:${seed}`);
    if (mid.size !== 2 || mid.has("void") || mid.has("yard")) fail.push(`mid-biomes:${seed}`);
    if (world.biomeFor(21).id === "void" || world.biomeFor(21).id === "yard" || mid.has(world.biomeFor(21).id))
      fail.push(`endless-biome:${seed}`);
    for (let wave = 5; wave <= 60; wave += 5)
      if (world.bossFor(wave) !== bossByBiome[world.biomeFor(wave).id]) fail.push(`boss-mismatch:${seed}:${wave}`);
  }
  // the hull of a boss in waves 5–20 follows its slot, whichever boss it is
  const hull = (id, wave) => {
    const world = new World({ seed: 0x2460, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(wave);
    return world.spawnBoss(id).maxHp;
  };
  for (const wave of [10, 15])
    for (const id of ["prism", "forge"])
      if (!(Math.abs(hull(id, wave) - hull("queen", wave)) < 1e-6)) fail.push(`slot-hull:${id}:${wave}`);
  if (!(hull("queen", 15) > hull("queen", 10))) fail.push("slot-hull-order");
  return { ...result, ok: result.ok && fail.length === 0, v246: { ok: fail.length === 0, fail } };
}
// 2.5.0 A: retired upgrades are gone and migrate, the six new upgrades do what their card says.
function selfTestV250A(result) {
  const fail = [],
    NEW = ["skates", "acidcoat", "heatsink", "slipstream", "surge", "reactive"];
  if (upgradeList.length !== 52) fail.push("count:" + upgradeList.length);
  for (const [id, retired] of Object.entries(RL_RETIRED_UPGRADES)) {
    if (upgradesById[id]) fail.push("still-offered:" + id);
    const target = upgradesById[retired.to];
    if (!target || target.evo || target.repeat || !(retired.k > 0 && retired.k <= 1.5))
      fail.push("retired-target:" + id);
  }
  for (const id of NEW) if (!upgradesById[id] || upgradesById[id].evo) fail.push("new-missing:" + id);
  // a run saved mid-way with retired upgrades and a pending offer of retired ids
  const old = {
      v: 1,
      seed: 2500,
      weapon: "pulse",
      threat: 1,
      wave: 7,
      up: { caliber: 3, kinetic: 2, dmg: 2, fortify: 5, hp: 6, coolant: 3, afterburner: 3, scavenger: 2, focus: 1 },
      hp: 60,
      offer: ["fortify", "flux", "crit"],
      offerBoss: false,
    },
    run = cleanRun(old),
    want = { dmg: 6, hp: 10, speed: 6, supply: 2, crit: 1 };
  if (!run || Object.keys(run.up).length !== 5 || Object.entries(want).some(([key, value]) => run.up[key] !== value))
    fail.push("migrate-up:" + JSON.stringify(run && run.up));
  // Fortify → Reinforced Hull is maxed, so a common takes its place; Flux Capacitor → Overcharge
  if (!run || JSON.stringify(run.offer) !== JSON.stringify(["dmg", "overcharge", "crit"]))
    fail.push("migrate-offer:" + JSON.stringify(run && run.offer));
  if (old.up.caliber !== 3 || old.offer[0] !== "fortify") fail.push("migrate-mutates");
  if (run && rlMigrateUpgrades(run) !== run) fail.push("migrate-twice");
  const boss = cleanRun({ ...old, up: { rate: 10 }, offer: ["overclock", "leech", "arc"], offerBoss: true });
  if (!boss || boss.offer.length !== 3 || boss.offer.some((id) => upgradesById[id].rarity < 2))
    fail.push("migrate-boss-offer:" + JSON.stringify(boss && boss.offer));
  if (run) {
    const world = new World({ snap: run, ws: {} });
    if (world.state !== "choose" || world.offer.length !== 3 || world.stats.maxHp !== 350)
      fail.push("resume:" + world.state);
    world.choose(world.offer[0]);
    for (let frame = 0; frame < 120; frame++)
      world.step(1 / 60, { mx: 0.4, my: 0.2, fire: true, auto: true, dash: frame === 30 });
    if (world.wave !== 8 || ![world.player.hp, world.player.x, world.player.nova].every(Number.isFinite))
      fail.push("resume-play");
  }
  const hist = rlSanitizeHistory([
    { t: 1, weapon: "pulse", threat: 0, wave: 9, outcome: "dead", build: ["caliber", "dmg", "fortify", "flux"] },
  ]);
  if (JSON.stringify(hist[0]?.build) !== JSON.stringify(["dmg", "hp", "overcharge"])) fail.push("history-build");
  // the new mechanics
  const makeWorld = (up, wave = 2) => {
    const world = new World({ seed: 0x250a, weapon: "pulse", threat: 0, ws: {} });
    world.up = { ...up };
    world.stats = computeStats("pulse", world.up, {});
    world.startWave(wave);
    world.plan = [];
    world.enemies = [];
    world.player.iT = 0;
    world.player.shield = false;
    return world;
  };
  const foe = (world, x, y) => {
    const enemy = world.spawnEnemy("brute", x, y, {});
    enemy.spawnT = 0;
    if (!world.enemies.includes(enemy)) {
      world.enemies.push(enemy);
    }
    world.hash.build(world.enemies);
    return enemy;
  };
  // Cryo Skates: dash recharges 35%/level faster on ice
  {
    const world = makeWorld({ skates: 2 }),
      player = world.player;
    player.dashCdT = 1;
    player.onIce = true;
    world.step(0.1, {});
    if (!(Math.abs(player.dashCdT - (1 - 0.1 - 0.07)) < 1e-6)) fail.push("skates-dash:" + player.dashCdT.toFixed(3));
    if (!(computeStats("pulse", { skates: 1 }, {}).speed > computeStats("pulse", {}, {}).speed))
      fail.push("skates-speed");
  }
  // Acid Coating: hits leave acid that marks enemies but never hurts the player
  {
    const world = makeWorld({ acidcoat: 2 }),
      player = world.player,
      enemy = foe(world, 4, 2);
    enemy.hp = enemy.maxHp = 1e6;
    for (let i = 0; i < 60 && !world.arena.acid.some((pool) => pool.mine); i++) {
      world.time += 2;
      world.bulletHit(
        { x: enemy.x, y: enemy.y, vx: 1, vy: 0, dmg: 1, hits: [], w: "pulse", pierce: 0, bounce: 0, life: 1 },
        enemy,
      );
    }
    const pool = world.arena.acid.find((pool) => pool.mine);
    if (!pool) fail.push("acid-none");
    else {
      player.x = pool.x;
      player.y = pool.y;
      enemy.x = pool.x + 0.3;
      enemy.y = pool.y;
      const hpBefore = player.hp;
      for (let frame = 0; frame < 60; frame++) world.updateFeatures(1 / 60);
      if (player.hp !== hpBefore || player.inAcid) fail.push("acid-hurts-player");
      if (!enemy.corrode) fail.push("acid-no-corrode");
      for (let frame = 0; frame < 300; frame++) world.updateFeatures(1 / 60);
      if (world.arena.acid.some((pool) => pool.mine) || enemy.corrode) fail.push("acid-stays");
    }
  }
  // Heat Sink: hazard damage heats up (fire rate) and charges Nova
  {
    const world = makeWorld({ heatsink: 1 }),
      player = world.player;
    player.nova = 0;
    world.hurtPlayer(4, null, null, "lava", true);
    if (!(player.heatT === 3 && player.nova > 0)) fail.push("heat-hazard");
    const cold = makeWorld({}),
      shots = (probe) => {
        probe.player.fireT = 0;
        let total = 0;
        for (let frame = 0; frame < 60; frame++) {
          const before = probe.player.shotN || 0;
          probe.player.heatT = probe === cold ? 0 : 3;
          probe.step(1 / 60, { aim: true, ax: 1, ay: 0 });
          total += (probe.player.shotN || 0) - before;
        }
        return total;
      };
    if (!(shots(world) > shots(cold))) fail.push("heat-rate");
  }
  // Slipstream: shots right after a dash hit harder
  {
    const world = makeWorld({ slipstream: 2 }),
      player = world.player;
    world.step(1 / 60, { dash: true });
    if (!(player.slipT > 1)) fail.push("slip-timer");
    world.pb.length = 0;
    world.fire(0);
    const hot = world.pb[0]?.dmg;
    player.slipT = 0;
    world.pb.length = 0;
    world.fire(0);
    const cold = world.pb[0]?.dmg;
    if (!(Math.abs(hot / cold - 1.5) < 1e-6)) fail.push("slip-dmg:" + hot + "/" + cold);
  }
  // Combo Surge: the 15th combo kill releases a shockwave
  {
    const world = makeWorld({ surge: 1 }),
      enemy = foe(world, 2, 2);
    enemy.hp = enemy.maxHp = 1e6;
    world.combo = 14;
    world.fx.length = 0;
    world.addCombo();
    if (!world.fx.some((fx) => fx.k === "boom" && fx.kind === "surge") || !(enemy.hp < 1e6)) fail.push("surge");
    if (!(world.comboT > 2.2)) fail.push("surge-combo-time");
  }
  // Reactive Plating: a hit pushes enemies away and clears enemy shots; costs fire rate
  {
    const world = makeWorld({ reactive: 1 }),
      player = world.player,
      enemy = foe(world, player.x + 1.5, player.y);
    enemy.hp = enemy.maxHp = 1e6;
    world.eb.push({ x: player.x + 1, y: player.y, vx: 0, vy: 0, r: 0.2, dmg: 5, life: 2 });
    world.hurtPlayer(5, enemy.x, enemy.y, "brute");
    if (!(enemy.hp < 1e6) || world.eb[0].life > 0) fail.push("reactive");
    if (!(world.stats.rateMul < computeStats("pulse", {}, {}).rateMul)) fail.push("reactive-cost");
  }
  return { ...result, ok: result.ok && fail.length === 0, v250A: { ok: fail.length === 0, fail } };
}

// ---- 2.5.0 C: stronger biomes — hazard count, size and fairness, one biome event per visit of a
// hazard biome and what it does, signature enemies from the biome's first wave, old saved runs.
function selfTestV250C(result) {
  const fail = [],
    bad = (msg) => fail.length < 40 && fail.push(msg),
    theme = { works: "vents", vault: "ice", marsh: "acid" },
    // fairness of one arena: hazards off obstacles and walls, the spawn ring clear, portals valid
    fair = (arena, tag) => {
      for (const kind of ["vents", "ice", "acid"])
        for (const hazard of arena[kind]) {
          if (hazard.life != null) continue;
          if (hitsObstacle(arena.obs, hazard.x, hazard.y, hazard.r + 0.8)) bad("hazard-on-obstacle:" + tag);
          if (Math.hypot(hazard.x - rlSpawnZone.x, hazard.y - rlSpawnZone.y) < hazard.r + rlSpawnZone.r)
            bad("hazard-in-spawn:" + tag);
          if (Math.abs(hazard.x) + hazard.r > arena.W - 1.4 || Math.abs(hazard.y) + hazard.r > arena.H - 1.4)
            bad("hazard-at-wall:" + tag);
        }
      const ends = [];
      for (const portal of arena.portals) {
        if (Math.hypot(portal.ax - portal.bx, portal.ay - portal.by) < 7) bad("portal-pair-close:" + tag);
        for (const [x, y] of [
          [portal.ax, portal.ay],
          [portal.bx, portal.by],
        ]) {
          if (hitsObstacle(arena.obs, x, y, 1.5) || Math.abs(x) > arena.W - 3.6 || Math.abs(y) > arena.H - 3.6)
            bad("portal-bad:" + tag);
          if (ends.some((end) => Math.hypot(end[0] - x, end[1] - y) < 4)) {
            bad("portal-cluster:" + tag);
          }
          ends.push([x, y]);
        }
      }
    };
  // 1. hazards: about five per wave, 25–30% bigger than 2.4.6, fair; Void Core mostly two portal pairs
  const count = { vents: [0, 0], ice: [0, 0], acid: [0, 0] },
    pairs = [0, 0];
  for (let seed = 1; seed <= 24; seed++) {
    const world = new World({ seed: 0x2500 + seed, weapon: "pulse", threat: 0, ws: {} });
    for (let wave = 6; wave <= 24; wave++) {
      if (world.bossFor(wave)) continue;
      world.startWave(wave);
      const arena = world.arena,
        id = arena.biome.id,
        kind = theme[id];
      fair(arena, `${seed}:${wave}`);
      if (world.event && waveEvents[world.event].biome) continue; // the event adds its own
      if (kind) {
        count[kind][0] += arena[kind].length;
        count[kind][1]++;
        for (const hazard of arena[kind]) {
          if (hazard.r < RL_HAZARD_SIZE_250[kind][0] - 1e-9 || hazard.r > RL_HAZARD_SIZE_250[kind][1] + 1e-9) {
            bad("hazard-size:" + kind);
          }
        }
      } else if (id === "void") {
        pairs[0] += arena.portals.length >= 2 ? 1 : 0;
        pairs[1]++;
      }
    }
  }
  for (const [kind, [total, waves]] of Object.entries(count)) {
    if (waves && total / waves < 4.3) {
      bad(`hazard-count:${kind}:${(total / waves).toFixed(2)}`);
    }
  }
  if (pairs[1] && pairs[0] / pairs[1] < 0.7) {
    bad("portal-pairs:" + (pairs[0] / pairs[1]).toFixed(2));
  }
  // 2. biome events: one per visit of a hazard biome, in wave 2–4 of the visit, only there, never
  // next to another event
  for (let seed = 1; seed <= 30; seed++) {
    const world = new World({ seed: 0x25c0 + seed, weapon: "pulse", threat: 0, ws: {} }),
      evs = [];
    for (let wave = 1; wave <= 40; wave++) evs[wave] = world.eventFor(wave);
    for (let start = 1; start <= 36; start += 5) {
      const id = world.biomeFor(start).id,
        want = RL_BIOME_EVENT[id],
        got = [1, 2, 3, 4, 5].map((step) => evs[start + step - 1]).filter((event) => event && waveEvents[event].biome);
      if (want ? got.length !== 1 || got[0] !== want : got.length) bad(`biome-event:${seed}:${start}:${got}`);
      if (evs[start] || evs[start + 4]) bad(`event-first-or-boss:${seed}:${start}`);
    }
    for (let wave = 2; wave <= 40; wave++) {
      if (evs[wave] && evs[wave - 1]) {
        bad(`event-adjacent:${seed}:${wave}`);
      }
    }
  }
  for (const [id, event] of Object.entries(RL_BIOME_EVENT)) {
    if (!waveEvents[event] || waveEvents[event].biome !== id || !waveEvents[event].name || !waveEvents[event].desc) {
      bad("event-def:" + event);
    }
  }
  // 3. what the events do (run in the world with a god-mode player standing still)
  const eventWorld = (biome, seed = 0x25e0) => {
    for (let worldSeed = seed; worldSeed < seed + 40; worldSeed++) {
      const world = new World({ seed: worldSeed, weapon: "pulse", threat: 0, ws: {} }),
        i = world.route.indexOf(biome);
      if (i < 0 || i > 3) continue;
      const eventWave = world.biomeEventWave(1 + 5 * i);
      if (!eventWave) continue;
      world.god = true;
      world.startWave(eventWave);
      return world;
    }
    return null;
  };
  const run = (world, sec) => {
    for (let time = 0; time < sec; time += 1 / 30) world.step(1 / 30, { mx: 0, my: 0 });
  };
  const melt = eventWorld("works");
  if (!melt || melt.event !== "meltdown") bad("meltdown-missing");
  else {
    const vents = melt.arena.vents;
    if (vents.length < 6) {
      bad("meltdown-vents:" + vents.length);
    }
    if (vents.some((vent) => vent.period !== vents[0].period || vent.phase !== vents[0].phase)) {
      bad("meltdown-sync");
    }
    fair(melt.arena, "meltdown");
    run(melt, 2.5);
    if (!vents.every((vent) => melt.arena.ventState(vent, melt.waveT) === "erupt")) {
      bad("meltdown-erupt-together");
    }
  }
  const white = eventWorld("vault");
  if (!white || white.event !== "whiteout") bad("whiteout-missing");
  else {
    const lay = buildLayout(white.arena.biome, white.seed, white.wave, false);
    if (!(white.arena.ice.length > (lay.features?.ice || []).length)) {
      bad("whiteout-ice");
    }
    fair(white.arena, "whiteout");
  }
  const bloom = eventWorld("marsh");
  if (!bloom || bloom.event !== "bloom") bad("bloom-missing");
  else {
    const pools0 = bloom.arena.acid.filter((pool) => pool.life == null).length,
      radius0 = bloom.arena.acid.reduce((sum, pool) => sum + pool.r, 0);
    run(bloom, 20);
    const own = bloom.arena.acid.filter((pool) => pool.life == null);
    if (!(own.length > pools0)) {
      bad("bloom-no-sprout");
    }
    if (!(own.slice(0, pools0).reduce((sum, pool) => sum + pool.r, 0) > radius0 + 0.5)) {
      bad("bloom-no-growth");
    }
    fair(bloom.arena, "bloom");
    // a pool never sprouts under the player
    if (own.some((pool) => Math.hypot(pool.x - bloom.player.x, pool.y - bloom.player.y) < pool.r)) {
      bad("bloom-on-player");
    }
  }
  const storm = eventWorld("void");
  if (!storm || storm.event !== "riftstorm") bad("riftstorm-missing");
  else {
    const at0 = storm.arena.portals.map((portal) => [portal.ax, portal.ay]);
    run(storm, 5);
    if (!storm.arena.portals.every((portal) => portal.next)) {
      bad("riftstorm-no-telegraph");
    }
    run(storm, 1.2);
    if (!storm.arena.portals.some((portal, i) => portal.ax !== at0[i][0] || portal.ay !== at0[i][1])) {
      bad("riftstorm-no-move");
    }
    fair(storm.arena, "riftstorm");
  }
  // 4. signature enemies: every mix enemy of a biome can spawn from the biome's first wave; the
  // enemy table itself is not changed, and Neon Yard keeps the global unlock waves
  const before = JSON.stringify(Object.values(enemyDefs).map((def) => def.from)),
    seen = {};
  for (let seed = 1; seed <= 40; seed++) {
    const world = new World({ seed: 0x25f0 + seed, weapon: "pulse", threat: 0, ws: {} });
    for (let wave = 1; wave <= 19; wave++) {
      if (world.bossFor(wave)) continue;
      world.startWave(wave);
      const id = world.arena.biome.id;
      for (const group of world.plan)
        for (const member of group.members) {
          (seen[id] || (seen[id] = new Set())).add(member.type);
          if (id === "yard" && enemyDefs[member.type].from > wave) {
            bad(`yard-early:${member.type}:${wave}`);
          }
          if (world.enemyFrom(member.type, wave) > wave) {
            bad(`too-early:${member.type}:${wave}`);
          }
        }
    }
  }
  if (JSON.stringify(Object.values(enemyDefs).map((def) => def.from)) !== before) {
    bad("enemy-from-mutated");
  }
  for (const [id, info] of Object.entries(RL_BIOME_INFO))
    for (const [type, weight] of Object.entries(info.mix || {})) {
      if (!(weight >= 1)) continue;
      if (rlEnemyFrom(type, id, 6) > 6) {
        bad(`from:${id}:${type}`);
      }
      if (seen[id] && !seen[id].has(type)) {
        bad(`never-seen:${id}:${type}`);
      }
    }
  // 5. an old saved run (2.4.6 snapshot, no event fields) in an event wave loads and plays it
  const probe = eventWorld("void");
  if (probe) {
    const old = cleanRun({
      v: 1,
      seed: probe.seed,
      weapon: "pulse",
      threat: 0,
      wave: probe.wave,
      endless: false,
      up: { dmg: 2 },
      hp: 80,
      shards: 30,
      kills: 50,
      time: 300,
      rerolls: 1,
      revived: false,
      nova: 20,
      bossKills: ["warden"],
    });
    const world = old && new World({ snap: old, ws: {} });
    if (!world || world.event !== "riftstorm" || !world.bioEv) bad("old-save-event");
    else {
      run(world, 7);
      if (!(world.state === "fight" || world.state === "choose")) {
        bad("old-save-state:" + world.state);
      }
      const snap = world.snapshot(),
        reloaded = new World({ snap, ws: {} });
      if (reloaded.event !== "riftstorm") {
        bad("resave-event");
      }
    }
  }
  return { ...result, ok: result.ok && fail.length === 0, v250C: { ok: fail.length === 0, fail } };
}

// 2.5.0 D: biome title card, boss intro card and Codex data. Every biome card names its hazard and
// its boss; the Codex has one entry per enemy, boss and upgrade, hides unseen ones, reads old saves
// without Codex keys (defeated bosses, builds in the history and the saved run count as seen) and
// never throws on broken save data.
function selfTestV250D(result) {
  const fail = [];
  try {
    for (const biome of biomeList) {
      const card = rlBiomeCardInfo(biome);
      if (card.name !== biome.name) fail.push("card-name:" + biome.id);
      if (!card.hazard) fail.push("card-hazard:" + biome.id);
      if (!card.boss || card.boss !== (bossDefs[bossByBiome[biome.id]] || {}).name) fail.push("card-boss:" + biome.id);
      if (!/^#[0-9a-f]{6}$/.test(card.color)) fail.push("card-color:" + biome.id);
    }
    const count = (codex) => [codex.enemies.length, codex.bosses.length, codex.upgrades.length].join("/"),
      want = [Object.keys(enemyDefs).length, Object.keys(bossDefs).length, upgradeList.length].join("/"),
      flat = (codex) => [...codex.enemies, ...codex.bosses, ...codex.upgrades];
    const none = rlCodexEntries({ seen: {} });
    if (count(none) !== want) fail.push(`codex-count:${count(none)}!=${want}`);
    if (flat(none).some((entry) => entry.seen)) fail.push("codex-unseen");
    const keys = flat(none).map((entry) => entry.key);
    if (new Set(keys).size !== keys.length) fail.push("codex-keys");
    const all = rlCodexEntries({ seen: Object.fromEntries(keys.map((key) => [key, true])) });
    for (const entry of flat(all)) if (!entry.seen || !entry.name || !entry.desc) fail.push("codex-entry:" + entry.key);
    // an old save: no Codex keys, but a defeated boss, a build in the history and a saved run
    const old = rlCodexEntries({
        seen: { tutorial: true },
        stats: { bosses: { warden: 1 } },
        history: [{ build: [upgradeList[0].id] }],
        run: { up: { [upgradeList[1].id]: 1 }, offer: [upgradeList[2].id] },
      }),
      seenKeys = flat(old)
        .filter((entry) => entry.seen)
        .map((entry) => entry.key)
        .sort()
        .join(),
      wantKeys = ["boss_warden", ...upgradeList.slice(0, 3).map((upgrade) => "up_" + upgrade.id)].sort().join();
    if (seenKeys !== wantKeys) fail.push(`codex-old-save:${seenKeys}`);
    for (const bad of [null, undefined, {}, { seen: null, history: "x", run: 5, stats: { bosses: null } }])
      rlCodexEntries(bad);
    for (const method of [
      "biomeCard",
      "bossCard",
      "releaseTitleCard",
      "clearTitleCard",
      "renderCodex",
      "recordsTab",
      "markSeen",
    ]) {
      if (typeof GameUI.prototype[method] !== "function") {
        fail.push("ui:" + method);
      }
    }
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v250D: { ok: fail.length === 0, fail } };
}

/* ==========================================================================
   2.5.0 B: workshop merge (refund migration) and the three new modules
   ========================================================================== */
function selfTestV250B(result) {
  const fail = [],
    ids = workshopModules.map((mod) => mod.id);
  for (const id of Object.keys(RL_RETIRED_MODULES)) {
    if (ids.includes(id) || modulesById[id]) fail.push("retired-listed:" + id);
    if (!modulesById[RL_RETIRED_MODULES[id].to]) fail.push("retired-target:" + id);
  }
  for (const id of ["nova", "fieldSupply", "starterKit", "hazardAttune", "emergencyShield"]) {
    if (!modulesById[id]) {
      fail.push("module-missing:" + id);
    }
  }
  // old save: every bought level of a removed module is refunded at full price, kept modules keep
  // their levels, over-range levels are capped, the run is left alone; a second pass changes nothing
  const note = RL_MODULE_NOTE,
    run = { v: 1, weapon: "pulse", wave: 7, hp: 50 },
    raw = {
      shards: 50,
      workshop: { nova: 2, fieldSupply: 1, hull: 3, riftBattery: 2, reactorCore: 9, routeScanner: 1 },
      run,
    },
    migrated = rlMigrateModules(raw);
  const want = 50 + 260 + 540 + (1600 + 3400 + 6200) + 1800;
  if (
    migrated.shards !== want ||
    migrated.workshop.nova !== 2 ||
    migrated.workshop.fieldSupply !== 1 ||
    migrated.workshop.hull !== 3 ||
    "riftBattery" in migrated.workshop ||
    "reactorCore" in migrated.workshop ||
    "routeScanner" in migrated.workshop ||
    migrated.run !== run ||
    raw.workshop.riftBattery !== 2 ||
    !RL_MODULE_NOTE ||
    RL_MODULE_NOTE.refund !== want - 50 ||
    RL_MODULE_NOTE.names.length !== 3
  )
    fail.push("migrate:" + JSON.stringify({ m: migrated, note: RL_MODULE_NOTE }));
  set_RL_MODULE_NOTE(null);
  if (rlMigrateModules(migrated) !== migrated || RL_MODULE_NOTE) fail.push("migrate-twice");
  const zero = rlMigrateModules({ shards: 5, workshop: { routeScanner: 0 } });
  if (zero.shards !== 5 || "routeScanner" in zero.workshop || RL_MODULE_NOTE) fail.push("migrate-zero");
  set_RL_MODULE_NOTE(note);
  // a saved run with the kept Nova Cell level resumes (no kit on resume)
  const snap = cleanRun({ v: 1, seed: 9, weapon: "pulse", wave: 7, hp: 60, nova: 10, up: { dmg: 1 } }),
    resumed = snap && new World({ snap, ws: { nova: 2, starterKit: 3 } });
  if (!resumed || resumed.wave !== 7 || resumed.up.dmg !== 1 || Object.keys(resumed.up).length !== 1)
    fail.push("resume");
  // Starter Kit: one distinct common upgrade per level on a new run
  const kit = new World({ seed: 0x250b, weapon: "pulse", threat: 0, ws: { starterKit: 3 } }),
    kitIds = Object.keys(kit.up);
  if (kitIds.length !== 3 || !kitIds.every((id) => upgradesById[id].rarity === 1 && kit.up[id] === 1))
    fail.push("kit:" + kitIds.join(","));
  if (Math.round(kit.player.hp) !== Math.round(kit.stats.maxHp)) fail.push("kit-hp");
  if (Object.keys(new World({ seed: 0x250b, weapon: "pulse", threat: 0, ws: {} }).up).length) fail.push("kit-free");
  // Hazard Attunement: close to a pool (edge within 2 m) raises damage and repair only while there
  const attuneWorld = new World({ seed: 0x250c, weapon: "pulse", threat: 0, ws: { hazardAttune: 2 } });
  attuneWorld.startWave(2);
  attuneWorld.hold = true;
  const dmg0 = attuneWorld.stats.dmgMul;
  attuneWorld.arena.acid.push({ x: attuneWorld.player.x + 3.2, y: attuneWorld.player.y, r: 1.5 });
  attuneWorld.step(1 / 60, {});
  const attunedNear = attuneWorld.attuned;
  attuneWorld.arena.acid.pop();
  attuneWorld.step(1 / 60, {});
  if (!attunedNear || attuneWorld.attuned || attuneWorld.stats.dmgMul !== dmg0) fail.push("attune");
  // Emergency Shield: once per wave below 30% hull, blocks damage while up, ready again next wave
  const shieldWorld = new World({ seed: 0x250d, weapon: "pulse", threat: 0, ws: { emergencyShield: 1 } }),
    player = shieldWorld.player;
  shieldWorld.state = "fight";
  player.iT = 0;
  player.shield = false;
  shieldWorld.hurtPlayer(player.hp - 20, null, null, "grunt", true);
  const healed = player.hp,
    blocked = shieldWorld.hurtPlayer(5, null, null, "grunt", true) === false;
  shieldWorld.barrierT = 0;
  const hpNow = player.hp;
  shieldWorld.hurtPlayer(2, null, null, "grunt", true);
  if (
    healed !== 20 + Math.round(shieldWorld.stats.maxHp * 0.08) ||
    !blocked ||
    player.hp !== hpNow - 2 ||
    !shieldWorld.barrierUsed
  )
    fail.push("barrier:" + [healed, blocked, hpNow, player.hp]);
  shieldWorld.startWave(2);
  if (shieldWorld.barrierUsed) fail.push("barrier-wave");
  return { ...result, ok: result.ok && fail.length === 0, v250B: { ok: fail.length === 0, fail } };
}

// 2.6.0: the touch sticks stay where the finger touched down (their centre no longer follows the finger)
function selfTestV260(result) {
  const fail = [];
  try {
    const layer = document.createElement("div"),
      input = new Input(layer, { groundAt: () => null }),
      event = (id, x, y) => ({ pointerType: "touch", pointerId: id, clientX: x, clientY: y, preventDefault() {} }),
      w = window.innerWidth,
      h = window.innerHeight,
      settings = { autoFire: true, assist: true };
    // a touch on the move side, dragged far past the stick radius and back
    input.down(event(1, w * 0.2, h * 0.7));
    input.moveEv(event(1, w * 0.2 + 400, h * 0.7 - 300));
    const stick = input.move;
    if (stick.ox !== w * 0.2 || stick.oy !== h * 0.7) fail.push("centre-moved:" + [stick.ox, stick.oy]);
    const far = input.sample(null, settings);
    if (Math.abs(Math.hypot(far.mx, far.my) - 1) > 1e-9) fail.push("far-strength:" + Math.hypot(far.mx, far.my));
    input.moveEv(event(1, w * 0.2, h * 0.7));
    const back = input.sample(null, settings);
    if (back.mx !== 0 || back.my !== 0) fail.push("back-to-centre:" + [back.mx, back.my]);
    // the aim stick (other side) keeps its centre too and reports the direction from the touch point
    input.down(event(2, w * 0.8, h * 0.7));
    input.moveEv(event(2, w * 0.8, h * 0.7 - 500));
    const aim = input.sample(null, settings);
    if (input.aim.ox !== w * 0.8 || input.aim.oy !== h * 0.7) fail.push("aim-centre-moved");
    if (!aim.aim || Math.abs(aim.ax) > 1e-9 || Math.abs(aim.ay + 1) > 1e-9) fail.push("aim-dir:" + [aim.ax, aim.ay]);
    input.up(event(1, 0, 0));
    input.up(event(2, 0, 0));
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v260: { ok: fail.length === 0, fail } };
}

// 2.7.0: sound coverage. Every enemy type, boss and event kind that should sound is mapped to a sound that
// exists, the real consumer reacts to each event, the voice limit holds, and no sound keeps a node alive
// (the offline render of every sound is in tests/deep-test.mjs, it needs to wait for the audio thread).
function selfTestV270Sound(result) {
  const fail = [],
    catalog = rlSoundCatalog(),
    known = new Set(catalog.map((entry) => entry.spec.id).filter(Boolean));
  try {
    // (a) mapping
    for (const type of Object.keys(enemyDefs)) {
      if (!RL_DEATH_FAMILY[type]) fail.push("no-death-voice:" + type);
    }
    for (const [type, id] of Object.entries(RL_DEATH_FAMILY)) {
      if (!enemyDefs[type]) fail.push("death-voice-unknown-type:" + type);
      if (!known.has(id)) fail.push("death-voice-missing-sound:" + id);
    }
    if (new Set(Object.values(RL_DEATH_FAMILY)).size < 6) fail.push("death-families<6");
    for (const table of [RL_CHARGE_VOICE, RL_DASH_VOICE, RL_BOSS_ATK])
      for (const id of Object.values(table)) if (id && !known.has(id)) fail.push("voice-missing-sound:" + id);
    for (const id of bossOrder) {
      if (!catalog.some((entry) => entry.spec.id === "bossIntro" && entry.spec.arg === id)) fail.push("no-intro:" + id);
    }
    for (const kind of RL_EVENT_KINDS) {
      const sounds = !!RL_SOUND_EVENTS[kind],
        silent = RL_SILENT_EVENTS.has(kind);
      if (sounds === silent) fail.push((sounds ? "both:" : "unmapped-event:") + kind);
    }
    for (const kind of [...Object.keys(RL_SOUND_EVENTS), ...RL_SILENT_EVENTS])
      if (!RL_EVENT_KINDS.has(kind)) fail.push("unknown-event-kind:" + kind);
    // every boss attack that really happens has an entry (a null entry says another event sounds for it)
    for (const id of bossOrder) {
      const world = new World({ seed: 0x270270, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(bossByWave[5] === id ? 5 : bossByWave[10] === id ? 10 : bossByWave[15] === id ? 15 : 20);
      world.god = true;
      world.spawnBoss(id);
      world.boss.spawnT = 0;
      const seen = new Set();
      for (let frame = 0; frame < 60 * 45 && world.boss; frame++) {
        world.step(1 / 60, { mx: 0, my: 0, aim: false, ax: 1, ay: 0, fire: false, assist: false });
        for (const ev of world.fx)
          if (ev.k === "bossAtk") {
            seen.add(ev.atk);
            if (!(ev.atk in RL_BOSS_ATK)) fail.push(`boss-atk-unmapped:${id}:${ev.atk}`);
          }
        world.fx.length = 0;
      }
      if (seen.size < 3) fail.push(`boss-atk-not-seen:${id}:${[...seen]}`);
    }
    // (b) the consumer: no ctx, suspended ctx and muted make no sound and no error
    const idle = new SoundEngine();
    idle.play("hurt");
    idle.consume([{ k: "hurt" }]);
    idle.setState(0.5, "bloom");
    idle.setMusic("boss", "yard");
    idle.bossEnd();
    const played = [],
      suspended = new SoundEngine();
    suspended.ctx = { state: "suspended" };
    suspended._play = (id) => played.push(id);
    suspended.play("hurt");
    suspended.consume([{ k: "hurt" }]);
    suspended.ctx = { state: "running" };
    suspended.sfxVol = 0;
    suspended.play("hurt");
    if (played.length) fail.push("sound-while-suspended-or-muted:" + played);
    if (idle.failed || suspended.failed) fail.push("engine-error-without-ctx");
    // (c) every event that should sound reaches a sound, and the voices end
    if (typeof OfflineAudioContext !== "undefined") {
      const engine = new SoundEngine(),
        heard = [];
      engine.attach(new OfflineAudioContext(1, 44100, 44100));
      const real = engine._play.bind(engine);
      engine._play = (id, arg) => {
        heard.push(id);
        if (id !== "pick" && !known.has(id)) fail.push("event-plays-unknown-sound:" + id);
        real(id, arg);
      };
      for (const [kind, samples] of Object.entries(RL_SOUND_EVENTS))
        for (const sample of samples) {
          heard.length = 0;
          engine.consume([{ k: kind, ...sample }]);
          if (!heard.length) fail.push("event-silent:" + kind);
        }
      if (engine.failed) fail.push("engine-error-in-consume");
      for (let i = 0; i < 100; i++) engine.play("hurt");
      if (engine.voices.length > MAX_VOICES) fail.push("voice-limit:" + engine.voices.length);
      if (!engine.dropped) fail.push("voice-limit-never-hit");
      for (const voice of engine.voices) {
        if (!(voice.end < 10) || voice.loop) fail.push("voice-never-ends");
      }
      for (const bed of ["hum", "meltdown", "whiteout", "bloom", "riftstorm"]) {
        engine.startBed(bed);
        if (!engine.voices.some((voice) => voice.loop)) fail.push("bed-not-registered:" + bed);
        engine.stopBed(bed);
        if (engine.voices.some((voice) => voice.loop)) fail.push("bed-never-ends:" + bed);
        if (engine.beds[bed]) fail.push("bed-kept:" + bed);
      }
      // the boss music variant fades in with the boss and out after it
      engine.setMusic("boss", "vault");
      if (engine.bossOver) fail.push("boss-over-at-start");
      engine.bossEnd();
      if (!engine.bossOver) fail.push("boss-end-ignored");
      engine.setMusic("fight", "vault");
    }
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v270Sound: { ok: fail.length === 0, fail } };
}

// 2.8.0: auto-aim skips enemies behind walls, prefers near enemies and rushers, keeps a good target
function selfTestV280(result) {
  const fail = [];
  try {
    const world = new World({ seed: 0x280, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(2);
    world.state = "fight";
    const player = world.player,
      reset = () => {
        for (const enemy of [...world.enemies]) enemy.dead = true;
        world.enemies.length = 0;
        world.arena.obs = [];
        player.target = null;
      },
      spawn = (type, dx, dy) => {
        const enemy = world.spawnEnemy(type, player.x + dx, player.y + dy);
        enemy.spawnT = 0;
        return enemy;
      },
      wall = (dx, dy, halfW, halfH) =>
        world.arena.obs.push({ x: player.x + dx, y: player.y + dy, w: halfW, h: halfH, t: "b" });
    // a near enemy behind a wall is skipped for a farther one in the open
    reset();
    wall(2, 0, 0.4, 4);
    const hidden = spawn("grunt", 4, 0),
      open = spawn("grunt", 0, -9);
    if (world.pickTarget() !== open) fail.push("wall-skipped");
    // only a hidden enemy: no target, and the manual aim assist does not snap to it either
    open.dead = true;
    world.enemies = world.enemies.filter((enemy) => enemy !== open);
    if (world.pickTarget() !== null) fail.push("hidden-only");
    if (Math.abs(world.assistAim(0) - 0) > 1e-9) fail.push("assist-through-wall");
    // the Lance slug flies through walls, so it may aim at the hidden enemy
    const normal = world.stats;
    world.stats = computeStats("rail", { lance: 1 }, {});
    if (world.pickTarget() !== hidden) fail.push("lance-through-wall");
    world.stats = normal;
    // two visible enemies: the near one first
    reset();
    const near = spawn("grunt", 3, 0);
    spawn("grunt", -8, 0);
    if (world.pickTarget() !== near) fail.push("near-first");
    // a rusher a bit further away beats a plain enemy
    reset();
    spawn("grunt", 0, 5);
    const bomber = spawn("bomber", 0, -5.4);
    if (world.pickTarget() !== bomber) fail.push("rusher-first");
    // an immune enemy only when nothing else is in reach
    reset();
    const shielded = spawn("grunt", 3, 0);
    shielded.shielded = true;
    const plain = spawn("grunt", -8, 0);
    if (world.pickTarget() !== plain) fail.push("shielded-last");
    plain.dead = true;
    world.enemies = world.enemies.filter((enemy) => enemy !== plain);
    if (world.pickTarget() !== shielded) fail.push("shielded-only");
    reset();
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v280: { ok: fail.length === 0, fail } };
}

// the "Deep test" button of the diagnostics dialog (rlRunHealth({deep:true})) runs this
setDeepSelfTest(rlSelfTest);

export { rlSelfTest, rlPaletteIssues, rlBiomeDistinct };
