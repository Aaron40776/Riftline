// The deep self-test (rlSelfTest: the base test plus one part per release) and its palette checks.
// Used by the tests (window.__riftTest) and the "Deep test" button of the diagnostics dialog.

import { GameUI, rlCodexEntries, rlBiomeCardInfo } from "../ui/ui.js";
import { Input } from "../ui/input.js";
import {
  musicChords,
  RL_SFX_VOICES,
  musicVoices,
  trackInfo,
  SoundEngine,
  rlSoundCatalog,
  RL_DEATH_FAMILY,
  RL_ESHOT_VOICE,
  RL_CHARGE_VOICE,
  RL_DASH_VOICE,
  RL_BOSS_ATK,
  RL_SOUND_EVENTS,
  RL_SILENT_EVENTS,
  RL_TRAP_SOUND,
  MAX_VOICES,
  MUSIC_DUCK,
  BOSS_SOUND,
  attackVoice,
} from "../audio/sound.js";
import { lookOf, ATTACK_LOOK } from "../render/attacks-view.js";
import { PLACE_IDS, BIOME_PLACE, SCAPE, placeTick, PROP_HEAR } from "../audio/place.js";
import { STEP_LEN, FLOOR } from "./walk.js";
import { buildPlayerModel } from "../render/models.js";
import {
  BOSS_CARD,
  BOSS_CARD_CHANCE,
  BOSS_CARD_STEP,
  LOCK_EVERY,
  LOCK_WARN,
  HAMMER_EVERY,
  BROOD_EVERY,
  BROOD_MAX,
  COLLAPSE_TIME,
} from "./boss-cards.js";
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
  defaultSettings,
  newSave,
  cleanSave,
} from "./save.js";
import { enemyDefs, bossOrder, biomeVariants, bossDefs, bossByWave, bossByBiome } from "../data/enemies.js";
import { ui, renderer } from "../main.js";
import { hashString, GAME_VERSION, makeRng } from "./util.js";
import { updateEnemy, findOpenSpot, updateBoss, OVERDRIVE } from "./ai.js";
import { MUTATORS, MUTATOR_IDS, MUTATOR_MAX_LEVEL, rlMutatorsFor } from "./mutators.js";
import { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, biomeList } from "../data/biomes.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { waveEvents, planWave, set_RL_BIOME_MIX_CUR, RL_BIOME_EVENT, rlEnemyFrom } from "./waves.js";
import { World } from "./world.js";
import { threatMods, workshopModules, modulesById, RL_RETIRED_MODULES } from "../data/progression.js";
import { upgradeList, upgradesById, RL_RETIRED_UPGRADES } from "../data/upgrades.js";
import { BURST_WINDOW, burstFraction, endlessHpBoost } from "./difficulty.js";
import { TRAP_SKINS, BIOME_TRAPS, TRAP_FROM, trapCount, rlUpdateTraps } from "./traps.js";
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
  result = selfTestV291(result);
  result = selfTestV300(result);
  result = selfTestV330(result);
  result = selfTestV360(result);
  result = selfTestV371(result);
  result = selfTestV380(result);
  result = selfTestV390(result);
  result = selfTestV3100(result);
  result = selfTestV3130(result);
  result = selfTestV3140(result);
  result = selfTestV3150(result);
  result = selfTestV3160(result);
  result = selfTestV3170(result);
  result = selfTestV3172(result);
  result = selfTestV3210(result);
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
  // 2c. music: every biome has a calm theme and a boss track; every step of both (and of the menu music)
  // schedules cleanly through the real engine, within the voice budget, at every intensity and boss heat
  section("music", () => {
    const OfflineAudio = typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : null,
      tempos = new Set();
    for (const biome of biomeList) {
      if (!musicChords[biome.id] || !musicVoices[biome.id]) {
        bad("music-missing", biome.id);
        continue;
      }
      for (const kind of ["fight", "boss"]) {
        const info = trackInfo(kind, biome.id);
        if (!(info.bpm >= 60 && info.bpm <= 190 && info.steps % 16 === 0)) bad("music-track", `${biome.id}:${kind}`);
        if (kind === "boss" && info.steps !== 22 * 16) bad("music-boss-structure", biome.id);
        if (kind === "fight" && info.steps !== 16 * 16) bad("music-calm-structure", biome.id);
        tempos.add(`${kind}:${info.bpm}`);
      }
      if (!OfflineAudio) continue;
      for (const [kind, intensity, heat] of [
        ["fight", 0.9, 0],
        ["fight", 0.05, 0],
        ["boss", 1, 0],
        ["boss", 1, 2],
        ["menu", 0.9, 0],
      ]) {
        const sound = new SoundEngine();
        sound.attach(new OfflineAudio(1, 2205, 22050), { room: false });
        sound.playKind = kind;
        sound.playBiome = biome.id;
        sound.intensity = intensity;
        sound.heat = heat;
        const info = trackInfo(kind, biome.id),
          len = 60 / info.bpm / 4;
        for (let step = 0; step < info.steps * 3; step++) {
          sound.simT = step * len;
          sound.cycle = Math.floor(step / info.steps);
          sound.note(step % info.steps, sound.simT);
        }
        if (sound.failed) bad("music-error", `${biome.id}:${kind}`);
        if (sound.musicSkipped || sound.musicShed || sound.musicPeak > 36)
          bad(
            "music-budget",
            `${biome.id}:${kind} heat ${heat} skipped ${sound.musicSkipped} shed ${sound.musicShed} peak ${sound.musicPeak}`,
          );
      }
    }
    // five calm themes and five boss tracks, five different tempos each
    if (tempos.size !== 10) bad("music-tempos", [...tempos].join(","));
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
  // route: Blackout City first, then one biome per boss cycle, all five by wave 21
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
  // enemy mix: each biome spawns more of its own enemies than the plain mix does
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
  // 3.15.0: 55 and the five boss cards
  if (upgradeList.length !== 60) fail.push("count:" + upgradeList.length);
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
  // Reactive Plating: a hit pushes enemies away and clears enemy shots (no fire-rate cost since 2.8.0)
  {
    const world = makeWorld({ reactive: 1 }),
      player = world.player,
      enemy = foe(world, player.x + 1.5, player.y);
    enemy.hp = enemy.maxHp = 1e6;
    world.eb.push({ x: player.x + 1, y: player.y, vx: 0, vy: 0, r: 0.2, dmg: 5, life: 2 });
    world.hurtPlayer(5, enemy.x, enemy.y, "brute");
    if (!(enemy.hp < 1e6) || world.eb[0].life > 0) fail.push("reactive");
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
  // enemy table itself is not changed, and the first biome (waves 1-5) keeps the global unlock waves
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
    // 2.9.0: nine death families, every enemy shot and every boss has its own voice and signature
    if (new Set(Object.values(RL_DEATH_FAMILY)).size < 9) fail.push("death-families<9");
    for (const id of Object.values(RL_ESHOT_VOICE)) if (!known.has(id)) fail.push("eshot-voice-missing-sound:" + id);
    for (const id of bossOrder) {
      const sig = BOSS_SOUND[id];
      if (!sig || !(sig.motif && sig.motif.length >= 3) || !(sig.chord && sig.chord.length >= 3))
        fail.push("boss-signature-missing:" + id);
      for (const name of ["enrage", "bossDown"])
        if (!catalog.some((entry) => entry.spec.id === name && entry.spec.arg === id)) fail.push(`no-${name}:${id}`);
    }
    if (new Set(bossOrder.map((id) => BOSS_SOUND[id] && BOSS_SOUND[id].motif.join())).size < bossOrder.length)
      fail.push("boss-motifs-not-distinct");
    for (const [id, depth] of Object.entries(MUSIC_DUCK)) {
      if (!known.has(id) && id !== "evolve") fail.push("duck-unknown-sound:" + id);
      if (!(depth > 0 && depth <= 0.15)) fail.push(`duck-depth:${id}:${depth}`);
    }
    // 3.0.0: every trap skin warns with a sound of its own, every strike (floor, mine) has one, none is shared
    const trapVoices = [];
    for (const [skin, def] of Object.entries(TRAP_SKINS)) {
      const voice = RL_TRAP_SOUND[skin];
      if (!voice || !known.has(voice.warn)) fail.push("trap-warn-sound:" + skin);
      else trapVoices.push(voice.warn);
      if (def.fam !== "beam" && !(voice && known.has(voice.fire))) fail.push("trap-fire-sound:" + skin);
      else if (voice && voice.fire) trapVoices.push(voice.fire);
    }
    if (new Set(trapVoices).size !== trapVoices.length) fail.push("trap-sounds-shared");
    for (const id of ["singThrow", "singPull", "singCollapse", "gadgetReady", "gadgetNo", "resist"])
      if (!known.has(id)) fail.push("no-sound:" + id);
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
      // 2.8.2: sounds never take voices from the music
      for (let i = 0; i < 6; i++) engine.tone(220 + i * 10, 1, "sine", 0.01, { dest: engine.mus, at: 0.1 });
      const musicBefore = engine.musicVoiceList.filter((voice) => voice.node).length;
      for (let i = 0; i < 100; i++) engine.play("hurt");
      const musicAfter = engine.musicVoiceList.filter((voice) => voice.node).length;
      if (!musicBefore || musicAfter < musicBefore) fail.push(`music-voices-stolen:${musicBefore}->${musicAfter}`);
      if (engine.voices.length > MAX_VOICES) fail.push("voice-limit:" + engine.voices.length);
      if (!engine.dropped) fail.push("voice-limit-never-hit");
      // 2.9.0: the music never drops a note during a flood of sounds and never pauses: the same 64 steps of
      // the fight theme are scheduled with and without 40 sounds per step (the music has its own voice list)
      const runMusic = (flood) => {
        const eng = new SoundEngine();
        eng.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
        eng.playKind = "fight";
        eng.playBiome = "works";
        eng.intensity = 0.9;
        eng.musicLog = [];
        const ids = [
          ...RL_SFX_VOICES,
          "boom",
          "hurt",
          "nova",
          "hit",
          "crit",
          "bigkill",
          "dCrunch",
          "dArmor",
          "eshotBoss",
        ];
        for (let step = 0; step < 256; step++) {
          eng.simT = step * 0.156;
          eng.note(step, eng.simT);
          if (flood)
            for (let k = 0; k < 40; k++) {
              eng.last = Object.create(null);
              eng.play(ids[(step * 3 + k) % ids.length], 1.2);
            }
        }
        return eng;
      };
      const calm = runMusic(false),
        busy = runMusic(true);
      if (!calm.musicScheduled) fail.push("music-not-scheduled");
      if (busy.musicScheduled !== calm.musicScheduled || busy.musicSkipped !== calm.musicSkipped)
        fail.push(
          `music-dropped-in-flood:${calm.musicScheduled}/${calm.musicSkipped} vs ${busy.musicScheduled}/${busy.musicSkipped}`,
        );
      if (calm.musicSkipped) fail.push("music-skipped-without-flood:" + calm.musicSkipped);
      if (JSON.stringify(calm.musicLog) !== JSON.stringify(busy.musicLog)) fail.push("music-notes-differ-in-flood");
      if (!busy.dropped) fail.push("flood-did-not-fill-the-voice-list");
      if (!busy.duckGain || !(busy.duckT > -1e8)) fail.push("music-duck-never-fired");
      for (const voice of engine.voices) {
        if (!(voice.end < 10) || voice.loop) fail.push("voice-never-ends");
      }
      for (const bed of ["hum", "blackout", "meltdown", "whiteout", "bloom", "riftstorm"]) {
        engine.startBed(bed);
        if (!engine.voices.some((voice) => voice.loop)) fail.push("bed-not-registered:" + bed);
        engine.stopBed(bed);
        if (engine.voices.some((voice) => voice.loop)) fail.push("bed-never-ends:" + bed);
        if (engine.beds[bed]) fail.push("bed-kept:" + bed);
      }
      // 3.1.0: the boss track starts on the spot with an impact (not with the wave), a phase change or the enrage sends
      // it back to its drop, it resolves into the calm theme when the boss is dead, and a preview of the settings
      // screen plays a track until it is stopped or the game takes over the music
      {
        const eng = new SoundEngine();
        eng.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
        eng.musicLog = [];
        eng.setMusic("fight", "marsh");
        if (eng.playKind !== "fight" || eng.playBiome !== "marsh") fail.push("music-fight-not-selected");
        eng.step = 37;
        eng.setMusic("fight", "marsh");
        if (eng.step !== 37) fail.push("music-restarts-on-every-wave");
        // 3.2.0: a calm theme plays over its atmosphere; the pause menu keeps the place of the track and resuming goes
        // on from there (a new start of the same theme without resume starts from the top)
        if (!eng.mbed) fail.push("music-without-atmosphere");
        eng.setMusic("menu");
        if (eng.mbed) fail.push("atmosphere-kept-in-the-menu");
        eng.setMusic("fight", "marsh", true);
        if (eng.step !== 37) fail.push("pause-restarts-the-track");
        eng.setMusic("menu");
        eng.setMusic("fight", "marsh");
        if (eng.step !== 0) fail.push("new-start-continues-an-old-track");
        eng.step = 37;
        const before = eng.musicLog.length;
        eng.setMusic("boss", "marsh");
        if (eng.playKind !== "boss" || eng.step !== 0 || eng.bossOver) fail.push("boss-track-not-started-on-the-spot");
        // the start is a deep taiko, a brass swell and a short choir
        if (!eng.musicLog.slice(before).some((voice) => voice.bus === "c" && voice.dur > 1.4))
          fail.push("boss-start-without-impact");
        eng.bossPush(1);
        eng.bossPush(2);
        if (eng.heat !== 2 || !eng.jump) fail.push("boss-heat-not-raised");
        eng.bossPush(1);
        if (eng.heat !== 2) fail.push("boss-heat-lowered");
        const beforeEnd = eng.musicLog.length;
        eng.bossEnd();
        if (eng.playKind !== "fight" || eng.heat !== 0) fail.push("boss-track-not-resolved");
        // the last hit ends on the choir
        if (!eng.musicLog.slice(beforeEnd).some((voice) => voice.bus === "c" && voice.dur > 1))
          fail.push("boss-end-without-last-hit");
        eng.setMusic("menu");
        if (eng.playKind !== "menu") fail.push("menu-music-not-selected");
        eng.preview("boss", "void");
        const pv = eng.previewing();
        if (!pv || pv.mode !== "boss" || pv.biome !== "void" || eng.playKind !== "boss")
          fail.push("preview-not-playing");
        eng.setMusic("menu");
        if (!eng.previewing()) fail.push("preview-stopped-by-the-menu-music");
        eng.stopPreview();
        if (eng.previewing() || eng.playKind !== "menu") fail.push("preview-not-stopped");
        eng.preview("fight", "yard");
        if (eng.playKind !== "fight" || eng.playBiome !== "yard") fail.push("calm-preview-not-playing");
        eng.setMusic("fight", "vault");
        if (eng.previewing() || eng.playBiome !== "vault") fail.push("preview-not-ended-by-the-game");
        eng.preview("fight", "nowhere");
        if (eng.playBiome !== "yard") fail.push("preview-of-an-unknown-biome");
        eng.stopPreview();
        // muted music: no transition sounds
        eng.setVolumes(1, 0);
        const muted = eng.musicLog.length;
        eng.setMusic("boss", "yard");
        eng.bossEnd();
        if (eng.musicLog.length !== muted) fail.push("transition-sounds-while-muted");
        if (eng.failed) fail.push("engine-error-in-music-transitions");
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

/* ---- 2.9.1: the Weaver announces its shot (lock-on sound and 0.45 s of aiming after the warp) ---- */
function selfTestV291(result) {
  const fail = [];
  try {
    const world = new World({ seed: 0x291, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(5);
    world.state = "fight";
    world.god = true;
    world.hold = false;
    world.arena.obs = [];
    for (const enemy of [...world.enemies]) enemy.dead = true;
    world.enemies.length = 0;
    world.plan = [];
    world.planIdx = 0;
    world.bossPending = null;
    world.championPending = null;
    const player = world.player,
      weaver = world.spawnEnemy("weaver", player.x + 8, player.y);
    weaver.spawnT = 0;
    weaver.t = 0;
    let seen = 0,
      aimStep = -1,
      shotStep = -1;
    for (let step = 0; step < 400 && shotStep < 0; step++) {
      world.step(1 / 60, { mx: 0, my: 0, aim: false, ax: 1, ay: 0, fire: false, assist: false });
      for (; seen < world.fx.length; seen++) {
        const ev = world.fx[seen];
        if (ev.k === "aim" && ev.type === "weaver" && aimStep < 0) aimStep = step;
      }
      if (aimStep >= 0 && shotStep < 0 && world.eb.some((bullet) => bullet.kind === "weaver")) shotStep = step;
      if (world.fx.length > 4000) world.fx.length = seen = 0;
    }
    if (aimStep < 0) fail.push("weaver-no-aim-event");
    else if (shotStep < 0) fail.push("weaver-never-shoots");
    else if (shotStep - aimStep < 22 || shotStep - aimStep > 36) fail.push("weaver-aim-time:" + (shotStep - aimStep));
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  // everything maxed (hull healthy): the wave end must not open an empty upgrade choice; the run goes on
  try {
    const world = new World({ seed: 0x292, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(2);
    world.state = "fight";
    world.god = true;
    world.hold = false;
    for (const upgrade of upgradeList) world.up[upgrade.id] = upgrade.max;
    world.stats = computeStats(world.weapon, world.up, world.ws);
    world.player.hp = world.stats.maxHp;
    world.arena.obs = [];
    for (const enemy of [...world.enemies]) enemy.dead = true;
    world.enemies.length = 0;
    world.plan = [];
    world.planIdx = 0;
    world.bossPending = null;
    world.championPending = null;
    const shards0 = world.shards;
    let maxed = false,
      choose = false;
    for (let step = 0; step < 600 && world.wave === 2; step++) {
      world.step(1 / 60, { mx: 0, my: 0, aim: false, ax: 1, ay: 0, fire: false, assist: false });
      if (world.state === "choose") choose = true;
      if (world.fx.some((ev) => ev.k === "maxed")) maxed = true;
      world.fx.length = 0;
    }
    if (choose) fail.push("maxed-opens-choice");
    if (!maxed) fail.push("maxed-no-event");
    if (world.wave !== 3 || world.state === "choose") fail.push(`maxed-stuck:wave ${world.wave} ${world.state}`);
    if (!(world.shards > shards0)) fail.push("maxed-no-reward");
    // a saved run stuck on an empty choice (offer []) resumes into the next wave
    const snap = world.snapshot();
    snap.offer = [];
    snap.wave = 7;
    const resumed = new World({ seed: 0x292, weapon: "pulse", threat: 0, ws: {}, snap });
    if (resumed.state === "choose" || resumed.wave !== 8) fail.push(`maxed-resume:${resumed.state} ${resumed.wave}`);
  } catch (err) {
    fail.push("maxed-exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v291: { ok: fail.length === 0, fail } };
}

/* ---- 3.0.0: burst cap, Endless hull curve ---- */
function selfTestV300(result) {
  const fail = [];
  try {
    const world = new World({ seed: 0x300, weapon: "pulse", threat: 0, ws: {} });
    const target = (wave, hp = 1000, type = "brute") => {
      world.startWave(wave);
      world.state = "fight";
      world.god = true;
      for (const enemy of [...world.enemies]) enemy.dead = true;
      world.enemies.length = 0;
      world.plan = [];
      world.planIdx = 0;
      world.bossPending = null;
      world.championPending = null;
      const enemy = world.spawnEnemy(type, world.player.x + 6, world.player.y);
      enemy.spawnT = 0;
      enemy.maxHp = enemy.hp = hp;
      return enemy;
    };
    // up to wave 40 nothing is capped: one big hit kills
    let enemy = target(20);
    world.hurtEnemy(enemy, 100000, 0, 0, 0, false, "weapon");
    if (!enemy.dead) fail.push("capped-too-early");
    // wave 100: at most burstFraction(100) of the hull within the window, however many hits land
    const f100 = burstFraction(100);
    enemy = target(100);
    world.hurtEnemy(enemy, 100000, 0, 0, 0, false, "weapon");
    world.hurtEnemy(enemy, 100000, 0, 0, 0, false, "weapon");
    world.hurtEnemy(enemy, 100000, 0, 0, 0, false, "weapon");
    const lost = 1000 - enemy.hp;
    if (enemy.dead || lost > 1000 * f100 + 1e-6 || lost < 1000 * f100 - 1e-6)
      fail.push(`burst-cap:${lost} want ${1000 * f100}`);
    // a ping marks the resisted hits
    const before = world.fx.length;
    world.hurtEnemy(enemy, 50, 0, 0, 0, false, "weapon");
    if (!world.fx.slice(before).some((ev) => ev.k === "ping" && ev.resist)) fail.push("resist-ping");
    // after the window the next burst lands again
    world.time += BURST_WINDOW + 0.05;
    world.hurtEnemy(enemy, 100000, 0, 0, 0, false, "weapon");
    if (!(1000 - enemy.hp > lost + 1)) fail.push("window-never-reopens");
    // the Nova and bosses are exempt
    enemy = target(100);
    world.hurtEnemy(enemy, 100000, 0, 0, 0, false, "nova");
    if (!enemy.dead) fail.push("nova-capped");
    if (!(burstFraction(40) === 1 && burstFraction(400) === 0.12 && burstFraction(70) < 1)) fail.push("fraction-curve");
    // Endless hull curve
    if (endlessHpBoost(30) !== 1 || !(endlessHpBoost(150) > 4 && endlessHpBoost(150) < 5)) fail.push("hp-boost");
    world.startWave(150);
    if (!(world.hpMul > 142 * 4)) fail.push("hpMul-not-boosted:" + world.hpMul);
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  // the gadget: 3.12.0 the Singularity (thrown far and fast, pulls the crowd together for 1.5 s, then collapses)
  try {
    const world = new World({ seed: 0x301, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(2);
    world.state = "fight";
    world.god = true;
    world.hold = false;
    world.arena.obs = [];
    // no live manholes or other hazards of the place: they hurt enemies on their own
    for (const kind of ["vents", "ice", "acid", "portals"]) world.arena[kind] = [];
    const player = world.player,
      reset = () => {
        for (const enemy of [...world.enemies]) enemy.dead = true;
        world.enemies.length = 0;
        world.plan = [];
        world.planIdx = 0;
        world.bossPending = null;
        world.championPending = null;
        world.singularities = [];
        player.gadgetN = world.stats.gadgetMax;
        player.gadgetT = 0;
        // a far, tough dummy keeps the wave (and so the fight state) alive
        world.state = "fight";
        world.stateT = 0;
        const dummy = world.spawnEnemy("turret", player.x, player.y - 17);
        dummy.spawnT = 0;
        dummy.maxHp = dummy.hp = 1e9;
      },
      spawn = (dx, dy, hp = 1e6, type = "brute") => {
        const enemy = world.spawnEnemy(type, player.x + dx, player.y + dy);
        enemy.spawnT = 0;
        enemy.maxHp = enemy.hp = hp;
        return enemy;
      },
      run = (seconds, input = {}) => {
        for (let i = 0; i < seconds * 60; i++)
          world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, assist: false, ...(i === 0 ? input : {}) });
      },
      spread = (list, x, y) => list.reduce((sum, enemy) => sum + Math.hypot(enemy.x - x, enemy.y - y), 0) / list.length;
    if (world.stats.gadgetMax !== 2 || player.gadgetN !== 2) fail.push("sing-charges:" + player.gadgetN);
    // thrown at the crowd, not at the lone enemy that is closer
    reset();
    const lone = spawn(-4, 0),
      crowd = [spawn(8, 0), spawn(9.2, 0.5), spawn(8.4, -1)];
    const before = world.fx.length;
    world.useGadget({});
    const throwEv = world.fx.slice(before).find((ev) => ev.k === "singularity");
    if (!throwEv || Math.hypot(throwEv.tx - 8.5 - player.x, throwEv.ty - player.y) > 2.5) fail.push("sing-aim-crowd");
    if (player.gadgetN !== 1) fail.push("sing-charge-not-used");
    // fast: it lands and opens within half a second; the crowd it was thrown at is hit by the collapse
    run(0.5);
    if (!world.fx.slice(before).some((ev) => ev.k === "singOpen")) fail.push("sing-not-open");
    run(1.8);
    if (!crowd.every((enemy) => enemy.hp < enemy.maxHp)) fail.push("sing-no-damage");
    if (lone.hp < lone.maxHp - 1e-6 === true) fail.push("sing-hit-the-lone-enemy");
    if (!crowd.some((enemy) => enemy.slowT > 0)) fail.push("sing-no-slow");
    if (world.singularities.length) fail.push("sing-not-done");
    // the pull gathers enemies spread around the rift (walking towards the player) before the collapse
    reset();
    const ring = [spawn(11, 4), spawn(15, 0.5), spawn(8, -3.5), spawn(13, -3.5, 1e6, "grunt")];
    const pullBefore = world.fx.length;
    world.useGadget({ aim: true, ax: 1, ay: 0 });
    const pullEv = world.fx.slice(pullBefore).find((ev) => ev.k === "singularity");
    const s0 = spread(ring, pullEv.tx, pullEv.ty);
    run(1.8);
    const s1 = spread(ring, pullEv.tx, pullEv.ty);
    if (!(s1 < s0 * 0.6)) fail.push(`sing-no-pull:${s0.toFixed(2)}->${s1.toFixed(2)}`);
    if (ring.some((enemy) => enemy.hp < enemy.maxHp)) fail.push("sing-damage-before-collapse");
    run(0.4);
    if (!ring.every((enemy) => enemy.hp < enemy.maxHp)) fail.push("sing-collapse-missed-the-gathered");
    // farther than the grenade: a crowd 14.5 m away is the target (the grenade looked 14 m far)
    reset();
    const far = [spawn(14.5, 0), spawn(15, 0.8), spawn(14.2, -0.7)];
    const farBefore = world.fx.length;
    world.useGadget({});
    const farEv = world.fx.slice(farBefore).find((ev) => ev.k === "singularity");
    if (!farEv || Math.hypot(farEv.tx - player.x, farEv.ty - player.y) < 13.5) fail.push("sing-short-reach");
    for (const enemy of far) enemy.dead = true;
    // elites are pulled less than the same enemy without the elite mark; bosses stand
    reset();
    const plain = spawn(10, 3.5),
      elite = spawn(10, -3.5);
    elite.elite = true;
    world.useGadget({ aim: true, ax: 1, ay: 0 });
    const ex = elite.y,
      px = plain.y;
    run(1.2);
    if (!(Math.abs(px - plain.y) > Math.abs(ex - elite.y) + 0.2))
      fail.push(`sing-elite-pull:${Math.abs(px - plain.y).toFixed(2)}/${Math.abs(ex - elite.y).toFixed(2)}`);
    // recharge: one charge after gadgetCd, no throw without a charge
    reset();
    world.useGadget({});
    world.useGadget({});
    const denyBefore = world.fx.length;
    if (world.useGadget({}) !== false || !world.fx.slice(denyBefore).some((ev) => ev.k === "gadgetDeny"))
      fail.push("sing-deny");
    run(world.stats.gadgetCd + 0.3);
    if (player.gadgetN < 1) fail.push("sing-no-recharge:" + player.gadgetN);
    // never into a wall: a wall 4 m ahead stops the throw in front of it
    reset();
    world.arena.obs = [{ x: player.x + 4, y: player.y, w: 0.4, h: 6, t: "b" }];
    const wallBefore = world.fx.length;
    world.useGadget({ aim: true, ax: 1, ay: 0 });
    const wallEv = world.fx.slice(wallBefore).find((ev) => ev.k === "singularity");
    if (!wallEv || wallEv.tx > player.x + 4 - 0.3) fail.push("sing-through-wall");
    world.arena.obs = [];
    // Searing Collapse sets survivors on fire; the cards change the numbers
    reset();
    world.up = { gfire: 1, gcells: 2, gblast: 2 };
    world.stats = computeStats(world.weapon, world.up, world.ws);
    if (world.stats.gadgetMax !== 4 || !(world.stats.gadgetR > 3.4 * 1.29) || !(world.stats.gadgetDmg > 1.59))
      fail.push("sing-cards");
    player.gadgetN = world.stats.gadgetMax;
    // at the spot the aimed Singularity lands (11 m ahead), so the collapse surely reaches it
    const victim = spawn(10.5, 0);
    world.useGadget({ aim: true, ax: 1, ay: 0 });
    run(2.4);
    if (!(victim.burnT > 0)) fail.push("sing-no-burn");
    // a Singularity still pulling when the wave ends does not hang over the upgrade choice
    reset();
    for (const enemy of [...world.enemies]) enemy.dead = true;
    world.enemies.length = 0;
    world.useGadget({ aim: true, ax: 1, ay: 0 });
    run(0.6);
    world.state = "cleared";
    world.stateT = 1.7;
    run(0.1);
    if (world.state !== "choose" || world.singularities.length) fail.push(`sing-left-over:${world.state}`);
    // nothing is thrown outside a fight
    reset();
    world.state = "cleared";
    if (world.useGadget({}) !== false) fail.push("sing-outside-fight");
    world.state = "fight";
  } catch (err) {
    fail.push("sing-exception:" + (err && err.message));
  }
  // traps: which wave, which family, which skin; placement; behaviour of each family
  try {
    const world = new World({ seed: 0x302, weapon: "pulse", threat: 0, ws: {} });
    const seen = {};
    for (let wave = 1; wave <= 60; wave++) {
      world.startWave(wave);
      const traps = world.traps,
        biome = world.arena.biome.id,
        boss = !!world.bossFor(wave);
      // 3.3.0: boss waves from wave 15 on have floor traps (only those)
      if ((wave < 6 || (boss && wave < 15)) && traps.length) fail.push(`traps-where-none-belong:${wave}`);
      if (boss && traps.some((trap) => trap.fam !== "floor")) fail.push(`boss-wave-trap-family:${wave}`);
      for (const trap of traps) {
        const skin = TRAP_SKINS[trap.skin];
        if (!skin || skin.fam !== trap.fam || BIOME_TRAPS[biome][trap.fam] !== trap.skin)
          fail.push(`trap-skin:${wave}:${trap.skin}`);
        if (wave < TRAP_FROM[trap.fam]) fail.push(`trap-too-early:${wave}:${trap.fam}`);
        if (Math.hypot(trap.x, trap.y - 2) < 6.4) fail.push(`trap-on-start:${wave}`);
        if (world.arena.blocked(trap.x, trap.y, 0.3)) fail.push(`trap-in-wall:${wave}`);
        (seen[biome] ||= new Set()).add(trap.skin);
      }
      for (let i = 0; i < traps.length; i++)
        for (let j = i + 1; j < traps.length; j++)
          if (Math.hypot(traps[i].x - traps[j].x, traps[i].y - traps[j].y) < 4.4) fail.push(`traps-too-close:${wave}`);
    }
    for (const [biome, skins] of Object.entries(BIOME_TRAPS))
      for (const skin of Object.values(skins))
        if (!seen[biome] || !seen[biome].has(skin)) fail.push(`skin-never-used:${biome}:${skin}`);
    if (
      !(
        trapCount("floor", 30) > trapCount("floor", 12) &&
        trapCount("mine", 30) > trapCount("mine", 12) &&
        trapCount("floor", 6) === 1 &&
        trapCount("beam", 8) === 0
      )
    )
      fail.push("trap-counts");
    // same seed and wave: the same traps
    world.startWave(23);
    const first = JSON.stringify(world.traps.map((trap) => [trap.skin, trap.x.toFixed(3), trap.y.toFixed(3)]));
    world.startWave(23);
    if (JSON.stringify(world.traps.map((trap) => [trap.skin, trap.x.toFixed(3), trap.y.toFixed(3)])) !== first)
      fail.push("traps-not-deterministic");
    // behaviour: every family warns first, then hurts the player and the enemies near it
    const arm = (spec) => {
      world.startWave(8);
      world.state = "fight";
      world.god = false;
      world.hold = false;
      for (const enemy of [...world.enemies]) enemy.dead = true;
      world.enemies.length = 0;
      world.markers = [];
      world.plan = [{ gap: 99, members: [{ type: "grunt", elite: false }] }];
      world.planIdx = 0;
      world.groupT = 99;
      world.bossPending = null;
      world.arena.obs = [];
      world.player.hp = world.stats.maxHp;
      world.player.iT = 0;
      world.player.slowT = 0;
      world.traps = [{ id: 1, t: 0, wait: 0, hunt: false, a: 0, dir: 1, ...spec }];
      // beside the trap, inside its radius but out of touching distance of the player (even a touch with no
      // damage would start the player's protection time)
      const foe = world.spawnEnemy("brute", spec.x + 2.0, spec.y);
      foe.spawnT = 0;
      foe.maxHp = foe.hp = 1000;
      // the dummy must not hurt the player itself, or the trap's damage cannot be told apart
      foe.dmg = 0;
      foe.speed = 0;
      const events = [];
      let seenEv = world.fx.length;
      for (let i = 0; i < 60 * 4; i++) {
        world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, assist: false });
        for (; seenEv < world.fx.length; seenEv++) events.push(world.fx[seenEv].k);
        if (world.fx.length > 3000) world.fx.length = seenEv = 0;
      }
      return { events, foe, trap: world.traps[0], hp: world.player.hp };
    };
    const at = (dx = 0, dy = 0) => ({ x: world.player.x + dx, y: world.player.y + dy });
    world.startWave(8);
    const base = at();
    let r = arm({ fam: "floor", skin: "crusher", st: "idle", r: 2.6, ...base });
    if (!(r.hp < world.stats.maxHp))
      fail.push(
        `floor-trap-no-damage:${r.hp}:${[...new Set(r.events)].filter((k) => !/dmg|spark|pop|shot/.test(k)).join()}`,
      );
    if (!(r.foe.hp < 1000 * (1 - 0.14) + 1)) fail.push("floor-trap-spares-enemies:" + r.foe.hp);
    if (r.events.indexOf("trapWarn") < 0 || r.events.indexOf("trapFire") < r.events.indexOf("trapWarn"))
      fail.push("floor-trap-no-warning");
    r = arm({ fam: "floor", skin: "icespike", st: "idle", r: 2.2, ...base });
    if (!(r.hp < world.stats.maxHp) || !(world.player.slowT > 0 || r.events.includes("chill")))
      fail.push("icespike-no-chill");
    const acidBefore = world.arena.acid.length;
    r = arm({ fam: "floor", skin: "geyser", st: "idle", r: 2.0, ...base });
    if (world.arena.acid.length <= 0 || world.arena.acid.length < acidBefore) fail.push("geyser-no-acid");
    // the beam turns 0.5 rad/s from the moment it warns: it starts 0.55 rad behind the player and sweeps over
    // him when it goes live
    r = arm({ fam: "beam", skin: "laser", st: "idle", r: 0.8, ...at(-6, 0), a: -0.55 });
    if (!(r.hp < world.stats.maxHp) || r.events.indexOf("trapWarn") < 0)
      fail.push(
        `beam-trap-no-damage:${r.hp}:${[...new Set(r.events)].filter((k) => !/dmg|spark|pop|shot/.test(k)).join()}`,
      );
    r = arm({ fam: "mine", skin: "mine", st: "unarmed", r: 2.6, ...at(0.6, 0) });
    if (!(r.hp < world.stats.maxHp) || r.trap.st === "armed" || !r.events.includes("trapArm"))
      fail.push("mine-did-not-go-off");
    if (!(r.foe.hp < 1000 * (1 - 0.18) + 1)) fail.push("mine-spares-enemies:" + r.foe.hp);
    // a trap is not softened by the Armor Core
    world.up = { ...world.up };
  } catch (err) {
    fail.push("traps-exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v300: { ok: fail.length === 0, fail } };
}

// the "Deep test" button of the diagnostics dialog (rlRunHealth({deep:true})) runs this
setDeepSelfTest(rlSelfTest);

export { rlSelfTest, rlPaletteIssues, rlBiomeDistinct };

// 3.3.0: harder bosses and the Endless mutators. (1) Every boss uses its Overdrive right after the enrage and leaves it
// again; the Warden, the Crucible and the Prism call reinforcements when enraged; a later boss rests less. (2) Boss
// waves get floor traps from wave 15 on, none before. (3) The mutators: none before wave 21, one more every tenth
// wave, all six by wave 71, levels never above the maximum, the same for the same seed; a gained mutator is announced
// once (not again when the wave is resumed), and Volatile and Shielded reach the enemies.
function selfTestV330(result) {
  const fail = [];
  try {
    const world = new World({ seed: 0x330, weapon: "pulse", threat: 0, ws: {} });
    const clear = (wave) => {
      world.startWave(wave);
      world.state = "fight";
      world.god = true;
      world.enemies.length = 0;
      world.plan = [];
      world.planIdx = 0;
      world.bossPending = null;
      world.championPending = null;
      world.markers = [];
      world.beams = [];
      world.hazards = [];
    };
    for (const id of Object.keys(OVERDRIVE)) {
      clear(10);
      const boss = world.spawnBoss(id);
      boss.spawnT = 0;
      boss.hp = boss.maxHp * 0.3;
      updateBoss(world, boss, 1 / 60);
      if (!boss.enraged || !boss.odDue) fail.push("no-overdrive-due:" + id);
      if (["warden", "forge", "prism"].includes(id) && world.markers.length < 2) fail.push("no-reinforcements:" + id);
      boss.st = "walk";
      boss.t = 0;
      updateBoss(world, boss, 1 / 60);
      if (boss.st !== OVERDRIVE[id]) fail.push(`overdrive-not-used:${id}:${boss.st}`);
      let telegraphs = 0;
      for (let i = 0; i < 60 * 6 && boss.st !== "walk"; i++) {
        updateBoss(world, boss, 1 / 60);
        telegraphs = Math.max(telegraphs, world.beams.length + world.hazards.length);
      }
      if (boss.st !== "walk") fail.push("overdrive-never-ends:" + id);
      if (telegraphs < 3) fail.push(`overdrive-without-telegraphs:${id}:${telegraphs}`);
      if (boss.odDue) fail.push("overdrive-repeats-at-once:" + id);
    }
    clear(20);
    const late = world.spawnBoss("warden");
    if (!(late.tier === 3 && Math.abs(late.pace - 0.76) < 1e-9)) fail.push(`boss-pace:${late.tier}:${late.pace}`);
    // (2) traps on boss waves
    world.startWave(10);
    if (world.traps.length) fail.push("traps-on-an-early-boss-wave");
    world.startWave(15);
    if (!world.traps.length || world.traps.some((trap) => trap.fam !== "floor")) fail.push("boss-wave-traps");
    // (3) mutators
    if (Object.keys(rlMutatorsFor(1, 20).mods).length) fail.push("mutator-before-21");
    const at21 = rlMutatorsFor(1, 21);
    if (Object.keys(at21.mods).length !== 1 || !at21.gained) fail.push("mutator-21");
    if (rlMutatorsFor(1, 30).gained || Object.keys(rlMutatorsFor(1, 30).mods).length !== 1) fail.push("mutator-30");
    if (Object.keys(rlMutatorsFor(1, 71).mods).length !== MUTATOR_IDS.length) fail.push("mutators-71");
    const far = rlMutatorsFor(1, 600).mods;
    if (Object.values(far).some((level) => level > MUTATOR_MAX_LEVEL)) fail.push("mutator-level-over-max");
    if (JSON.stringify(rlMutatorsFor(7, 91)) !== JSON.stringify(rlMutatorsFor(7, 91))) fail.push("mutators-not-stable");
    if (JSON.stringify(rlMutatorsFor(7, 91).mods) === JSON.stringify(rlMutatorsFor(8, 91).mods))
      if (JSON.stringify(rlMutatorsFor(7, 21).mods) === JSON.stringify(rlMutatorsFor(9, 21).mods))
        fail.push("mutators-same-for-every-seed");
    for (const id of MUTATOR_IDS) if (!MUTATORS[id].name || !MUTATORS[id].desc) fail.push("mutator-text:" + id);
    world.fx.length = 0;
    world.startWave(21);
    if (!world.fx.some((ev) => ev.k === "mutator")) fail.push("mutator-not-announced");
    world.fx.length = 0;
    world.startWave(21, 0, true);
    if (world.fx.some((ev) => ev.k === "mutator")) fail.push("mutator-announced-on-resume");
    world.fx.length = 0;
    world.startWave(22);
    if (world.fx.some((ev) => ev.k === "mutator")) fail.push("mutator-announced-twice");
    world.mods = { volatile: 3, shielded: 3 };
    let volatile = 0,
      shielded = 0;
    for (let i = 0; i < 200; i++) {
      const enemy = world.spawnEnemy("grunt", 0, -6);
      if (enemy.affix === "volatile") volatile++;
      if (enemy.affix === "shielded" && enemy.shield > 0) shielded++;
    }
    if (volatile < 40 || shielded < 15) fail.push(`mutator-affixes:${volatile}/${shielded}`);
  } catch (err) {
    fail.push("exception:" + (err && err.stack ? err.stack.split("\n").slice(0, 2).join(" ") : err));
  }
  return { ...result, ok: result.ok && fail.length === 0, v330: { ok: fail.length === 0, fail } };
}

// 3.6.0: the dash cooldown has a floor, every orbital blade hits on its own, Combo Surge has its own look and sound
function selfTestV360(result) {
  const fail = [];
  try {
    // (1) Phantom Dash, the full Dash Capacitor and Servo Thrusters: 0.34 s before, 0.8 s now; without them unchanged
    const fast = computeStats("pulse", { phantom: 1, speed: 6 }, { dash: 4 }).dashCd,
      plain = computeStats("pulse", {}, {}).dashCd;
    if (fast !== 0.8) fail.push("dash-floor:" + fast);
    if (Math.abs(plain - 1.9) > 1e-9) fail.push("dash-base:" + plain);
    // ... and the Cryo Skates on ice do not undercut it
    {
      const skater = new World({ seed: 0x362, weapon: "pulse", threat: 0, ws: { dash: 4 } });
      skater.startWave(3);
      skater.up = { phantom: 1, speed: 6, skates: 2 };
      skater.stats = computeStats(skater.weapon, skater.up, skater.ws);
      const player = skater.player;
      player.dashAt = skater.time;
      player.dashCdT = skater.stats.dashCd;
      let t = 0;
      for (let i = 0; i < 40 && player.dashCdT > 0; i++) {
        player.onIce = true;
        skater.step(0.05, {});
        t += 0.05;
      }
      if (t < 0.8 - 1e-6) fail.push("dash-floor-on-ice:" + t.toFixed(2));
    }
    // (2) four blades on an enemy that touches all of them: four hits at once, then each blade waits its 0.38 s
    const world = new World({ seed: 0x360, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(3);
    world.state = "fight";
    world.god = true;
    world.enemies.length = 0;
    world.plan = [];
    world.markers = [];
    world.up = { orbit: 4 };
    world.stats = computeStats(world.weapon, world.up, world.ws);
    const big = world.spawnEnemy("brute", world.player.x, world.player.y, {});
    big.spawnT = 0;
    big.r = world.stats.orbitR + 1;
    big.hp = big.maxHp = 1e9;
    world.hash.build(world.enemies);
    const hits = () => world.fx.filter((ev) => ev.k === "dmg").length;
    world.fx.length = 0;
    world.updateOrbitals(1 / 60);
    const first = hits();
    world.fx.length = 0;
    world.time += 0.1;
    world.updateOrbitals(1 / 60);
    const soon = hits();
    world.fx.length = 0;
    world.time += 0.4;
    world.updateOrbitals(1 / 60);
    const later = hits();
    if (first !== 4 || soon !== 0 || later !== 4) fail.push(`orbit-blades:${first},${soon},${later}`);
    // (3) Combo Surge: the shockwave sends "surge" with its radius and the combo; the blast does not sound twice
    const surging = new World({ seed: 0x361, weapon: "pulse", threat: 0, ws: {} });
    surging.startWave(3);
    surging.state = "fight";
    surging.up = { surge: 1 };
    surging.stats = computeStats(surging.weapon, surging.up, surging.ws);
    surging.combo = 14;
    surging.fx.length = 0;
    surging.addCombo();
    const surge = surging.fx.find((ev) => ev.k === "surge");
    if (!surge || surge.r !== 3.5 || surge.n !== 15 || surge.i !== 1)
      fail.push("surge-event:" + JSON.stringify(surge || null));
    if (!RL_EVENT_KINDS.has("surge") || !RL_SOUND_EVENTS.surge) fail.push("surge-unmapped");
    if (!rlSoundCatalog().some((entry) => entry.spec.id === "surge")) fail.push("surge-no-sound");
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v360: { ok: fail.length === 0, fail } };
}

/* ---- 3.7.1: the fixes of the checkup ---- */
function selfTestV371(result) {
  const fail = [];
  const fresh = (seed) => {
    const world = new World({ seed, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(8);
    world.state = "fight";
    world.hold = true;
    world.enemies.length = 0;
    world.markers = [];
    world.traps = [];
    world.arena.acid = [];
    world.arena.vents = [];
    world.fx.length = 0;
    return world;
  };
  try {
    // (1) Endless restarts the clock: the time of the last dash moves with it, so Cryo Skates do not lock the dash
    {
      const world = fresh(0x371);
      world.up = { skates: 2 };
      world.stats = computeStats(world.weapon, world.up, world.ws);
      const player = world.player;
      world.time = 900;
      player.dashAt = 899.9;
      player.dashCdT = world.stats.dashCd;
      world.restartClock();
      if (world.time !== 0 || Math.abs(player.dashAt + 0.1) > 1e-9) fail.push("clock:" + player.dashAt);
      let t = 0;
      for (let i = 0; i < 200 && player.dashCdT > 0; i++) {
        player.onIce = true;
        world.step(0.05, {});
        t += 0.05;
      }
      if (player.dashCdT > 0 || t > world.stats.dashCd + 0.1) fail.push("skates-after-endless:" + t.toFixed(2));
    }
    // (2) an acid tick below one point is no hit (no "hurt", no damage); the parts add up to whole points
    {
      const world = fresh(0x372);
      const player = world.player;
      player.hp = 50;
      let hurts = 0,
        hits = 0;
      for (let i = 0; i < 20; i++) {
        world.fx.length = 0;
        if (world.hurtPlayer(0.24, null, null, "acid", true)) hits++;
        hurts += world.fx.filter((ev) => ev.k === "hurt").length;
      }
      // 20 ticks of 0.24 are 4.8 points: four whole points, four hits, each with its "hurt"
      if (player.hp !== 46 || hits !== 4 || hurts !== 4) fail.push(`acid-chip:${player.hp},${hits},${hurts}`);
      if (world.fx.some((ev) => ev.k === "hurt" && !(ev.dmg >= 1))) fail.push("acid-zero-hurt");
    }
    // (3) a trap strike that the dash dodges neither chills nor stuns; a real hit does, an electric trap stuns
    const strike = (skin, dodge) => {
      const world = fresh(0x373),
        player = world.player;
      player.hp = world.stats.maxHp;
      player.iT = 0;
      player.slowT = 0;
      player.dashT = dodge ? 0.17 : 0;
      world.traps = [
        { id: 1, fam: "floor", skin, st: "warn", t: 1, delay: 0.5, x: player.x, y: player.y, r: 2, hunt: false },
      ];
      rlUpdateTraps(world, 1 / 60);
      return { slow: player.slowT, kind: player.slowKind, events: world.fx.map((ev) => ev.k), hp: player.hp };
    };
    let r = strike("icespike", true);
    if (r.slow > 0 || r.events.includes("chill")) fail.push("dodged-trap-chills");
    r = strike("plate", true);
    if (r.slow > 0 || r.events.includes("stun")) fail.push("dodged-trap-stuns");
    r = strike("icespike", false);
    if (!(r.slow > 0) || !r.events.includes("chill") || r.kind !== "chill") fail.push("icespike-no-chill");
    r = strike("plate", false);
    if (!(r.slow > 0) || !r.events.includes("stun") || r.events.includes("chill") || r.kind !== "shock")
      fail.push("plate-no-stun:" + r.events.join());
    if (!RL_EVENT_KINDS.has("stun") || !RL_SOUND_EVENTS.stun) fail.push("stun-unmapped");
    if (!rlSoundCatalog().some((entry) => entry.spec.id === "stun")) fail.push("stun-no-sound");
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v371: { ok: fail.length === 0, fail } };
}

/* ---- 3.8.0: the map hazards have models of their own (render/hazards-view.js) ---- */
function selfTestV380(result) {
  const fail = [];
  try {
    if (renderer && renderer.hazardView) {
      const view = renderer.hazardView,
        // the parts each biome's hazards must draw; erupt: the parts of an erupting vent
        want = {
          works: { idle: ["s:lava", "crater"], erupt: ["s:fire"] },
          yard: { idle: ["collar", "cover"], erupt: ["bolt"] },
          vault: { idle: ["s:ice", "shard"] },
          marsh: { idle: ["s:acid", "bank", "bubble"] },
          void: { idle: ["s:portal", "stone"] },
        },
        drawn = (name) => {
          const set = view.pl[name];
          if (!set) return 0;
          if (set.mesh) return set.n;
          return (set.body ? set.body.n : 0) + (set.glow ? set.glow.n : 0);
        },
        draw = (world) => {
          for (const pool of view.list) pool.begin();
          renderer.ringPool.begin();
          view.update(1 / 60, world);
        };
      for (const biome of Object.keys(want)) {
        const world = new World({ seed: 0x380, weapon: "pulse", threat: 0, ws: {} }),
          index = world.route.indexOf(biome);
        if (index < 0) continue;
        world.startWave(2 + 5 * index);
        world.state = "fight";
        const arena = world.arena;
        if (biome === "marsh" && !arena.acid.length) arena.acid.push({ x: 6, y: 6, r: 2, life: null });
        if (biome === "vault" && !arena.ice.length) arena.ice.push({ x: 6, y: 6, r: 3 });
        if ((biome === "works" || biome === "yard") && !arena.vents.length)
          arena.vents.push({ x: 6, y: 6, r: 2, phase: 0, period: 4, st: "idle" });
        if (biome === "void" && !arena.portals.length) arena.portals.push({ ax: 6, ay: 6, bx: -6, by: -6 });
        draw(world);
        for (const name of want[biome].idle) if (!(drawn(name) > 0)) fail.push(`${biome}-not-drawn:${name}`);
        if (want[biome].erupt) {
          const vent = arena.vents[0];
          world.waveT = vent.period - 0.5 - vent.phase + vent.period * 4;
          if (arena.ventState(vent, world.waveT) !== "erupt") fail.push(biome + "-no-erupt-state");
          draw(world);
          for (const name of want[biome].erupt) if (!(drawn(name) > 0)) fail.push(`${biome}-erupt-not-drawn:${name}`);
        }
      }
      // the warning ring takes the colour of Clear warnings
      if (renderer.warnColor !== undefined && !renderer.warnColor.isColor) fail.push("warn-colour");
    }
    // the left-handed (swap) and reduce-flashes (calm) settings are gone: an old save drops them on load
    const old = JSON.parse(JSON.stringify(newSave()));
    old.settings.swap = true;
    old.settings.calm = true;
    const loaded = cleanSave(old).settings;
    if ("swap" in loaded || "calm" in loaded || "swap" in defaultSettings || "calm" in defaultSettings)
      fail.push("old-settings-kept");
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v380: { ok: fail.length === 0, fail } };
}

/* ---- 3.9.0: the sounds of the place (audio/place.js) and the Ambience volume ---- */
function selfTestV390(result) {
  const fail = [];
  try {
    // the setting: default 0.8, the range of its slider
    if (defaultSettings.ambience !== 0.8) fail.push("default:" + defaultSettings.ambience);
    const raw = JSON.parse(JSON.stringify(newSave()));
    raw.settings.ambience = 7;
    if (cleanSave(raw).settings.ambience !== 1) fail.push("range");
    // every far sound of a biome exists, and every sound is in the catalog of the offline test
    for (const [biome, list] of Object.entries(BIOME_PLACE))
      for (const id of list) if (!PLACE_IDS.includes(id)) fail.push(`far-unknown:${biome}:${id}`);
    for (const biome of ["yard", "works", "vault", "marsh", "void"])
      if (!BIOME_PLACE[biome] || BIOME_PLACE[biome].length < 4) fail.push("far-missing:" + biome);
    const catalog = rlSoundCatalog();
    for (const id of PLACE_IDS)
      if (!catalog.some((entry) => entry.spec.id === "place" && entry.spec.arg.id === id))
        fail.push("uncatalogued:" + id);
    if (typeof OfflineAudioContext !== "undefined") {
      // each biome with its hazards: 30 s of a fight near them make the sounds of that place, on the ambience bus
      const want = {
        works: ["lavaBlub", "lavaWarn"],
        yard: ["hum", "charge"],
        vault: ["iceCrack|iceCreak", "iceTink"],
        marsh: ["acidBubble", "acidSizzle"],
        void: ["portalHum"],
      };
      for (const biome of Object.keys(want)) {
        const world = new World({ seed: 0x390, weapon: "pulse", threat: 0, ws: {} }),
          index = world.route.indexOf(biome);
        if (index < 0) continue;
        world.startWave(2 + 5 * index);
        world.state = "fight";
        const arena = world.arena,
          player = world.player;
        if ((biome === "works" || biome === "yard") && !arena.vents.length)
          arena.vents.push({ x: 4, y: 4, r: 2, phase: 0, period: 4, st: "idle" });
        if (biome === "vault" && !arena.ice.length) arena.ice.push({ x: 4, y: 4, r: 3 });
        if (biome === "marsh" && !arena.acid.length) arena.acid.push({ x: 4, y: 4, r: 2, life: null });
        if (biome === "void" && !arena.portals.length) arena.portals.push({ ax: 4, ay: 4, bx: -4, by: -4 });
        const spot = arena.vents[0] ||
          arena.ice[0] ||
          arena.acid[0] || { x: arena.portals[0].ax, y: arena.portals[0].ay };
        player.x = spot.x;
        player.y = spot.y;
        player.vx = 6;
        player.onIce = biome === "vault";
        player.inAcid = biome === "marsh";
        const engine = new SoundEngine();
        engine.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
        const heard = [],
          buses = new Set();
        engine.placePlay = (id, a) => {
          heard.push(id);
          if (!(a.g > 0 && a.g <= 1 && Math.abs(a.pan) <= 1)) fail.push(`${biome}-level:${id}:${a.g}:${a.pan}`);
        };
        for (let i = 0; i < 300; i++) {
          world.waveT += 0.1;
          placeTick(engine, world, 0.1);
        }
        for (const ids of want[biome])
          if (!ids.split("|").some((id) => heard.includes(id))) fail.push(`${biome}-silent:${ids}`);
        if (!heard.some((id) => BIOME_PLACE[biome].includes(id))) fail.push(biome + "-no-far-sound");
        // a real sound goes to the ambience bus as a voice of low priority (any effect may take its place)
        const real = new SoundEngine();
        real.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
        const route = real.route.bind(real);
        real.route = (amp, opts) => {
          buses.add(opts.dest === real.ambBus);
          route(amp, opts);
        };
        real.placePlay(want[biome][0].split("|")[0], { g: 1, pan: 0.3 });
        if (!buses.has(true) || buses.has(false)) fail.push(biome + "-not-on-ambience-bus");
        if (!real.voices.length || real.voices.some((voice) => voice.pri !== 0.5)) fail.push(biome + "-priority");
      }
      // Ambience at 0 is silent; the event beds follow the Ambience volume, not the Effects volume
      const engine = new SoundEngine();
      engine.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
      engine.setVolumes(0.8, 0.45, 0);
      let played = 0;
      const place = engine.placePlay.bind(engine);
      engine.placePlay = (id, a) => {
        played++;
        place(id, a);
      };
      const quiet = new World({ seed: 0x391, weapon: "pulse", threat: 0, ws: {} });
      quiet.startWave(2);
      engine.place(quiet, 30);
      if (played) fail.push("ambience-off-not-silent");
      engine.setVolumes(0, 0.45, 0.8);
      engine.mode = "fight";
      engine.liveT = engine.ctx.currentTime;
      engine.amb = "meltdown";
      engine.syncAudio();
      if (!engine.beds.meltdown) fail.push("event-bed-needs-effects-volume");
      if (engine.beds.hum) fail.push("hum-without-effects-volume");
    }
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v390: { ok: fail.length === 0, fail } };
}

/* ---- 3.10.0: the attacks of enemies and bosses look and sound like what they are (render/attacks-view.js) ---- */
function selfTestV3100(result) {
  const fail = [];
  try {
    // every zone the bosses and enemies really make (kind and maker) has a look, a blast of its own and, where the
    // kind is shared, the look and voice of its maker
    const seen = new Map(),
      watch = (world) => {
        const hazard = world.hazard.bind(world);
        world.hazard = (opts) => {
          const out = hazard(opts);
          seen.set(out.kind + "|" + (out.src || ""), out);
          return out;
        };
      },
      input = { mx: 0, my: 0, aim: false, fire: false, auto: false };
    for (const id of bossOrder) {
      const world = new World({ seed: 0x3100, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(bossByWave[5] === id ? 5 : bossByWave[10] === id ? 10 : bossByWave[15] === id ? 15 : 20);
      world.god = true;
      watch(world);
      const boss = world.spawnBoss(id);
      for (let frame = 0; frame < 2400 && world.boss; frame++) {
        // the second half enraged, so the Overdrive attacks come too
        if (frame === 1200) boss.hp = boss.maxHp * 0.2;
        world.step(1 / 30, input);
      }
    }
    for (const type of ["mortar", "minebot", "sapper", "driller"]) {
      const world = new World({ seed: 0x3101, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(12);
      world.god = true;
      world.planIdx = world.plan.length;
      for (const enemy of [...world.enemies]) world.killEnemy(enemy);
      watch(world);
      for (let k = 0; k < 3; k++) world.spawnEnemy(type, world.player.x + 7 + k, world.player.y + 2, {});
      for (let frame = 0; frame < 600; frame++) world.step(1 / 30, input);
    }
    for (const want of [
      "stomp|warden",
      "stomp|forge",
      "slag|forge",
      "rain|forge",
      "mortar|forge",
      "frost|prism",
      "glacier|prism",
      "rain|queen",
      "rain|core",
      "mortar|mortar",
      "mine|minebot",
      "sapper|sapper",
      "drill|driller",
    ])
      if (!seen.has(want)) fail.push("never-made:" + want);
    const own = {
      "rain|core": [ATTACK_LOOK.rift, "aRift"],
      "rain|queen": [ATTACK_LOOK.acid, "aAcid"],
      "rain|forge": [ATTACK_LOOK.molten, "aLava"],
      "stomp|forge": [ATTACK_LOOK.lavaCrack, "aQuake"],
      "stomp|warden": [ATTACK_LOOK.crack, "aQuake"],
      "glacier|prism": [ATTACK_LOOK.frost, "aIce"],
      "slag|forge": [ATTACK_LOOK.molten, "aLava"],
    };
    for (const [key, hazard] of seen) {
      const look = lookOf(hazard.kind, hazard.src, "yard");
      if (!Number.isInteger(look)) fail.push("no-look:" + key);
      if (own[key] && own[key][0] !== look) fail.push(`look:${key}:${look}`);
      if (own[key] && attackVoice(hazard.kind, hazard.src, "yard") !== own[key][1]) fail.push("voice:" + key);
      if (renderer && renderer.attackView) {
        const view = renderer.attackView,
          before = view.marks.length;
        if (!view.impact({ x: 0, y: 0, r: hazard.r, kind: hazard.kind, src: hazard.src }, null, 0))
          fail.push("no-blast:" + key);
        else if (view.marks.length <= before && view.marks.length < 80) fail.push("no-mark:" + key);
      }
    }
    // every voice of a blast is in the catalog of the offline test
    const catalog = rlSoundCatalog();
    for (const id of ["aQuake", "aLava", "aIce", "aAcid", "aRift", "aFire"])
      if (!catalog.some((entry) => entry.spec.id === id)) fail.push("uncatalogued:" + id);
    // the zones, models, shells and shots are drawn
    if (renderer && renderer.attackView) {
      const view = renderer.attackView,
        world = new World({ seed: 0x3102, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(2);
      const kinds = [
        "stomp",
        "drill",
        "slag",
        "frost",
        "glacier",
        "fire",
        "volatile",
        "mortar",
        "rain",
        "mine",
        "sapper",
      ];
      kinds.forEach((kind, i) => world.hazard({ x: i * 2 - 10, y: 3, r: 1.4, delay: 1, kind }));
      world.hazard({ x: 4, y: -4, r: 2, delay: 1.5, kind: "mortar", sx: -6, sy: -6 });
      for (const hazard of world.hazards) hazard.t = 0.5;
      for (const kind of ["orb", "fast", "turret", "shard", "weaver", "drone", "carrier", "slag"])
        world.shoot(0, 0, 0, 1, 1, { kind });
      for (const pool of renderer.allPools()) pool.begin();
      view.update(1 / 60, world);
      view.shots(world);
      const n = (name, part) => (view.pl[name] && view.pl[name][part] ? view.pl[name][part].n : 0);
      if (!view.pl.zone || view.pl.zone.n !== world.hazards.length) fail.push("zones-not-drawn");
      if (!(n("mine", "glow") > 0)) fail.push("mine-not-drawn");
      if (!(n("charge", "body") > 0)) fail.push("charge-not-drawn");
      if (!(n("shell", "body") > 0)) fail.push("shell-not-drawn");
      if (n("crystal", "glow") !== 2) fail.push("crystals:" + n("crystal", "glow"));
      if (n("dart", "glow") !== 2) fail.push("darts:" + n("dart", "glow"));
      // a burnt mark instead of the black blob of old
      const before = view.marks.length;
      renderer.addScorch(1, 1, 1);
      if (view.marks.length !== Math.min(before + 1, 86) || view.marks[view.marks.length - 1].look !== 0)
        fail.push("scorch-not-a-mark");
      if (renderer.scorch) fail.push("old-scorch-pool");
      view.marks.length = 0;
      view.spikes.length = 0;
      view.pillars.length = 0;
    }
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v3100: { ok: fail.length === 0, fail } };
}

/* ---- 3.13.0: the soundscapes (audio/place.js SCAPE): rates, no clutter, thinner in a boss fight, light ---- */
function selfTestV3130(result) {
  const fail = [];
  try {
    const catalog = rlSoundCatalog();
    for (const [biome, scape] of Object.entries(SCAPE)) {
      for (const [id] of scape.bed) if (!PLACE_IDS.includes(id)) fail.push(`bed-unknown:${biome}:${id}`);
      for (const f of scape.far) if (!PLACE_IDS.includes(f.id)) fail.push(`far-unknown:${biome}:${f.id}`);
      if (scape.far.length < 7) fail.push(`few-far-sounds:${biome}:${scape.far.length}`);
    }
    for (const id of PLACE_IDS)
      if (!catalog.some((entry) => entry.spec.id === "place" && entry.spec.arg.id === id))
        fail.push("uncatalogued:" + id);
    if (typeof OfflineAudioContext !== "undefined") {
      // 20 minutes of each biome (10 of them in a boss fight): what the scheduler plays, when
      const listen = (biome, boss, seconds, crowd = false) => {
        const world = new World({ seed: 0x3130, weapon: "pulse", threat: 0, ws: {} }),
          index = world.route.indexOf(biome);
        world.startWave(2 + 5 * Math.max(0, index));
        world.state = "fight";
        world.arena.biome = { ...world.arena.biome, id: biome };
        for (const kind of ["vents", "ice", "acid", "portals"]) world.arena[kind] = [];
        // a crowded arena: eight portals around the drone hum all the time and take the voice slots of many frames
        if (crowd) for (let i = 0; i < 8; i++) world.arena.portals.push({ ax: i - 4, ay: 2, bx: i - 4, by: -2 });
        world.boss = boss ? { type: "warden" } : null;
        const engine = new SoundEngine();
        engine.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
        const heard = [],
          lights = [];
        let t = 0;
        engine.placePlay = (id) => heard.push({ id, t });
        engine.onScape = (kind) => lights.push({ kind, t });
        for (; t < seconds; t += 0.1) placeTick(engine, world, 0.1);
        return { heard, lights };
      };
      for (const [biome, scape] of Object.entries(SCAPE)) {
        const { heard, lights } = listen(biome, false, 1200),
          farIds = new Set(scape.far.map((f) => f.id)),
          far = heard.filter((h) => farIds.has(h.id));
        // every far sound comes, none more often than its rate allows
        for (const f of scape.far) {
          const n = far.filter((h) => h.id === f.id).length;
          if (!n) fail.push(`${biome}-never:${f.id}`);
          if (n > Math.ceil(1200 / f.every[0]) + 1) fail.push(`${biome}-too-often:${f.id}:${n}`);
        }
        // no clutter: 2.5 s between far sounds, never the same twice in a row, big ones 4 s apart
        const big = new Set(scape.far.filter((f) => f.big).map((f) => f.id));
        let lastBig = -99;
        far.forEach((h, i) => {
          if (i && h.t - far[i - 1].t < 2.45) fail.push(`${biome}-crowded:${far[i - 1].id}/${h.id}`);
          if (i && h.id === far[i - 1].id) fail.push(`${biome}-repeat:${h.id}`);
          if (big.has(h.id)) {
            if (h.t - lastBig < 3.95) fail.push(`${biome}-two-big:${h.id}`);
            lastBig = h.t;
          }
        });
        // the steady layer keeps going
        for (const [id, , hi] of scape.bed) {
          const n = heard.filter((h) => h.id === id).length;
          if (n < (1200 / hi) * 0.5) fail.push(`${biome}-bed-thin:${id}:${n}`);
        }
        // thunder and sirens come with their light (in Blackout City)
        for (const f of scape.far.filter((f) => f.light)) {
          const n = far.filter((h) => h.id === f.id).length,
            m = lights.filter((l) => l.kind === f.light).length;
          if (n !== m) fail.push(`${biome}-light:${f.id}:${n}/${m}`);
        }
        // a boss fight is thinner: about half the far sounds
        const bossFar = listen(biome, true, 1200).heard.filter((h) => farIds.has(h.id)).length;
        if (!(bossFar < far.length * 0.7)) fail.push(`${biome}-boss-not-thinner:${bossFar}/${far.length}`);
      }
      if (!SCAPE.yard.far.some((f) => f.light === "lightning") || !SCAPE.yard.far.some((f) => f.light === "siren"))
        fail.push("city-light");
      // with the voice slots taken by hazards, a light still never comes without its sound, and the thunder still comes
      {
        const { heard, lights } = listen("yard", false, 1200, true),
          thunder = heard.filter((h) => h.id === "thunder").length,
          flashes = lights.filter((l) => l.kind === "lightning").length;
        if (thunder !== flashes || thunder < 1200 / 50 - 2) fail.push(`crowded-light:${thunder}/${flashes}`);
      }
    }
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v3130: { ok: fail.length === 0, fail } };
}

/* ---- 3.14.0: the music of the place: where the calm theme plays a sound of the place, the bed of that sound steps back ---- */
function selfTestV3140(result) {
  const fail = [];
  try {
    if (typeof OfflineAudioContext !== "undefined") {
      const level = (musVol, playKind, biome = "yard", sound = "rainDrop", intensity = 0) => {
        const world = new World({ seed: 0x3140, weapon: "pulse", threat: 0, ws: {} });
        world.startWave(2);
        world.state = "fight";
        world.arena.biome = { ...world.arena.biome, id: biome };
        for (const kind of ["vents", "ice", "acid", "portals"]) world.arena[kind] = [];
        const engine = new SoundEngine();
        engine.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
        engine.musVol = musVol;
        engine.playKind = playKind;
        engine.intensity = intensity;
        const drops = [];
        engine.placePlay = (id, a) => id === sound && drops.push(a.g);
        for (let t = 0; t < 30; t += 0.1) placeTick(engine, world, 0.1);
        return drops.length ? Math.max(...drops) : 0;
      };
      const alone = level(0.45, "boss"),
        under = level(0.45, "fight"),
        silent = level(0, "fight");
      if (!(alone > 0 && Math.abs(under - alone * 0.5) < 1e-9)) fail.push(`rain-not-halved:${alone}/${under}`);
      if (silent !== alone) fail.push(`rain-halved-without-music:${silent}/${alone}`);
      // the calm theme of the Void Core plays its heartbeat only above intensity 0.5: below it the bed stays full
      const beatAlone = level(0.45, "boss", "void", "heartbeat", 0.3),
        beatLow = level(0.45, "fight", "void", "heartbeat", 0.3),
        beatHigh = level(0.45, "fight", "void", "heartbeat", 0.8);
      if (!(beatAlone > 0 && beatLow === beatAlone && Math.abs(beatHigh - beatAlone * 0.5) < 1e-9))
        fail.push(`heartbeat:${beatAlone}/${beatLow}/${beatHigh}`);
    }
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v3140: { ok: fail.length === 0, fail } };
}

/* ---- 3.15.0: the boss rewards: the offer (chance, growth after a miss, once per run, the first place through a reroll,
   saved with the run) and the mechanics of the five boss cards ---- */
function selfTestV3150(result) {
  const fail = [];
  const isBoss = (id) => !!upgradesById[id].boss;
  try {
    // one card per boss, all rarity 6, none in a normal offer
    const bosses = Object.keys(BOSS_CARD).sort().join(",");
    if (bosses !== "core,forge,prism,queen,warden") fail.push("cards:" + bosses);
    if (Object.values(BOSS_CARD).some((id) => upgradesById[id].rarity !== 6 || upgradesById[id].max !== 1))
      fail.push("card-rarity");
    const normal = new World({ seed: 0x315, weapon: "pulse", threat: 0, ws: {} });
    for (let i = 0; i < 400; i++) {
      normal.wave = 1 + (i % 40);
      if (normal.makeOffer().some(isBoss)) {
        fail.push("card-in-normal-offer");
        break;
      }
    }
    // the first boss offer: about 30 % (the card's own random stream), always in the first place, still three cards,
    // kept through a reroll
    let got = 0,
      order = 0,
      kept = 0;
    for (let seed = 0; seed < 600; seed++) {
      const world = new World({ seed, weapon: "pulse", threat: 0, ws: {} });
      world.wave = 5;
      world.offerBoss = true;
      world.beginChoice();
      const id = world.offer.find(isBoss);
      if (!id) continue;
      got++;
      if (world.offer[0] === id && world.offer.length === 3 && id === BOSS_CARD[world.bossFor(5)]) order++;
      world.reroll();
      if (world.offer[0] === id && world.offer.filter(isBoss).length === 1) kept++;
    }
    if (!(got > 600 * (BOSS_CARD_CHANCE - 0.06) && got < 600 * (BOSS_CARD_CHANCE + 0.06))) fail.push("chance:" + got);
    if (order !== got) fail.push(`first-place:${order}/${got}`);
    if (kept !== got) fail.push(`reroll-kept:${kept}/${got}`);
    // a miss raises the chance by 15 %, a hit sets it back; a card owned is never offered again
    const luck = new World({ seed: 1, weapon: "pulse", threat: 0, ws: {} });
    let misses = 0,
      hit = false;
    for (let wave = 5; wave <= 100 && !hit; wave += 5) {
      luck.wave = wave;
      luck.offerBoss = true;
      const before = luck.bossLuck,
        id = BOSS_CARD[luck.bossFor(wave)];
      luck.beginChoice();
      if (luck.offer[0] === id) {
        hit = true;
        if (luck.bossLuck !== BOSS_CARD_CHANCE) fail.push("luck-not-reset");
      } else {
        misses++;
        if (Math.abs(luck.bossLuck - Math.min(1, before + BOSS_CARD_STEP)) > 1e-9)
          fail.push("luck-step:" + luck.bossLuck);
      }
      if (misses > 5) break;
    }
    if (!hit) fail.push("never-hit");
    const owned = new World({ seed: 2, weapon: "pulse", threat: 0, ws: {} });
    owned.wave = 5;
    const ownedId = BOSS_CARD[owned.bossFor(5)];
    owned.up[ownedId] = 1;
    owned.bossLuck = 1;
    owned.offerBoss = true;
    owned.beginChoice();
    if (owned.offer.some(isBoss) || owned.bossLuck !== 1) fail.push("owned-offered");
    // saved with the run: the chance, and a pending boss card in the first place after loading
    const saved = new World({ seed: 3, weapon: "pulse", threat: 0, ws: {} });
    saved.wave = 5;
    saved.bossLuck = 1;
    saved.offerBoss = true;
    saved.beginChoice();
    saved.bossLuck = 0.6;
    const snap = JSON.parse(JSON.stringify(saved.snapshot())),
      loaded = new World({ snap, ws: {} });
    if (loaded.bossLuck !== 0.6) fail.push("luck-not-saved");
    // through the save cleaner too (a resumed run), and a boss card in a normal offer is dropped there
    const cleaned = cleanRun(snap);
    if (!cleaned || cleaned.bossLuck !== 0.6 || cleaned.offer[0] !== snap.offer[0]) fail.push("luck-not-cleaned");
    const forged = cleanRun({ ...snap, offerBoss: false });
    if (!forged || (forged.offer || []).some(isBoss)) fail.push("card-in-normal-save");
    if (!(loaded.offerExclusive && loaded.offer[0] === loaded.offerExclusive)) fail.push("pending-card-lost");
    loaded.reroll();
    if (loaded.offer[0] !== snap.offer[0]) fail.push("pending-card-reroll");
    if (
      !loaded.choose(loaded.offer[0]) ||
      !loaded.stats[
        { lockdown: "lockdown", hammer: "hammer", shardfield: "shardField", brood: "brood", collapse: "collapse" }[
          snap.offer[0]
        ]
      ]
    )
      fail.push("pending-card-pick");
  } catch (err) {
    fail.push("offer-exception:" + (err && err.message));
  }
  // the mechanics, each in a clean arena with tough dummies
  const arena = (up) => {
    const world = new World({ seed: 0x3150, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(2);
    world.state = "fight";
    world.god = true;
    world.arena.obs = [];
    for (const kind of ["vents", "ice", "acid", "portals"]) world.arena[kind] = [];
    for (const enemy of world.enemies) enemy.dead = true;
    world.enemies.length = 0;
    world.plan = [];
    world.planIdx = 0;
    world.traps = [];
    world.bossPending = null;
    world.championPending = null;
    Object.assign(world.up, up);
    world.stats = computeStats(world.weapon, world.up, world.ws);
    const player = world.player,
      keep = world.spawnEnemy("turret", player.x, player.y - 17);
    keep.spawnT = 0;
    keep.maxHp = keep.hp = 1e9;
    const spawn = (dx, dy, hp = 1e6, type = "brute") => {
        const enemy = world.spawnEnemy(type, player.x + dx, player.y + dy);
        enemy.spawnT = 0;
        enemy.maxHp = enemy.hp = hp;
        return enemy;
      },
      run = (seconds, input = {}) => {
        for (let i = 0; i < Math.round(seconds * 60); i++)
          world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, assist: false, ...(i === 0 ? input : {}) });
      };
    return { world, player, spawn, run };
  };
  try {
    // Lockdown Grid: the cage drops on the group (not on the lone enemy), holds it and burns it
    const { world, player, spawn, run } = arena({ lockdown: 1 });
    const lone = spawn(-5, 0, 1e6, "grunt"),
      group = [spawn(7, 0, 1e6, "grunt"), spawn(7.8, 0.6, 1e6, "grunt"), spawn(7.4, -0.7, 1e6, "grunt")];
    for (const enemy of [lone, ...group]) enemy.speed = 0;
    player.lockT = 0.01;
    run(0.1);
    const cage = world.cages[0];
    if (!cage || Math.hypot(cage.x - 7.4 - player.x, cage.y - player.y) > 1.5) fail.push("lock-aim");
    else {
      run(LOCK_WARN + 0.1);
      if (cage.held.length !== 3) fail.push("lock-held:" + cage.held.length);
      // a held enemy pulled away stays inside
      group[0].x = cage.x + 6;
      run(0.2);
      if (Math.hypot(group[0].x - cage.x, group[0].y - cage.y) > cage.r) fail.push("lock-escaped");
      run(1.5);
      if (!(world.dmgSrc.lockdown > 3 * 26 * 1.5 * 0.8)) fail.push("lock-damage:" + world.dmgSrc.lockdown);
      if (lone.hp < 1e6) fail.push("lock-hurt-lone");
      run(2);
      if (world.cages.length) fail.push("lock-not-gone");
      if (!(player.lockT > 0 && player.lockT <= LOCK_EVERY)) fail.push("lock-cooldown:" + player.lockT);
    }
  } catch (err) {
    fail.push("lock-exception:" + (err && err.message));
  }
  try {
    // Crucible Hammer: a dash ends in a slam (damage, fire, molten ground), the next dash right after does not slam
    const { world, player, spawn, run } = arena({ hammer: 1 });
    const near = spawn(4.5, 0, 1e6);
    near.speed = 0;
    const fx0 = world.fx.length;
    run(0.5, { dash: true, mx: 1, my: 0 });
    const slam = world.fx.slice(fx0).find((ev) => ev.k === "boom" && ev.kind === "hammer");
    if (!slam) fail.push("hammer-no-slam");
    if (!(world.dmgSrc.hammer > 70)) fail.push("hammer-damage:" + world.dmgSrc.hammer);
    if (!(near.burnT > 0 && near.burnSrc === "hammer")) fail.push("hammer-no-fire");
    if (world.slag.length !== 1) fail.push("hammer-no-slag");
    if (!(player.hammerT > HAMMER_EVERY - 1)) fail.push("hammer-cooldown");
    player.dashCdT = 0;
    const fx1 = world.fx.length;
    run(0.5, { dash: true, mx: -1, my: 0 });
    if (world.fx.slice(fx1).some((ev) => ev.kind === "hammer")) fail.push("hammer-twice");
    run(3);
    if (world.slag.length) fail.push("slag-not-gone");
  } catch (err) {
    fail.push("hammer-exception:" + (err && err.message));
  }
  try {
    // Shard Field: a kill throws five splinters; the enemy next to it is hit and chilled
    const { world, spawn, run } = arena({ shardfield: 1 });
    const victim = spawn(5, 0, 10, "grunt"),
      next = spawn(6.2, 0, 1e6);
    for (const enemy of [victim, next]) enemy.speed = 0;
    world.hurtEnemy(victim, 1000, 0, 0, 0, false, "weapon");
    if (world.splinters.length !== 5) fail.push("shard-count:" + world.splinters.length);
    run(0.5);
    if (!(world.dmgSrc.shard > 0)) fail.push("shard-no-hit");
    if (!(next.slowT > 0)) fail.push("shard-no-chill");
    if (world.splinters.length) fail.push("shard-not-gone");
    // Endless restarts the clock at 0 after the victory: the shatter must not wait for the old time to come round again
    world.time = 500;
    world.splinters = [];
    const first = spawn(5, 1, 10, "grunt");
    world.hurtEnemy(first, 1000, 0, 0, 0, false, "weapon");
    world.restartClock();
    world.splinters = [];
    const second = spawn(5, -1, 10, "grunt");
    world.hurtEnemy(second, 1000, 0, 0, 0, false, "weapon");
    if (world.splinters.length !== 5) fail.push("shard-blocked-after-clock-restart:" + world.splinters.length);
  } catch (err) {
    fail.push("shard-exception:" + (err && err.message));
  }
  try {
    // Brood: every tenth kill hatches a larva (at most four); a larva hunts an enemy and bursts into poison
    const { world, player, spawn, run } = arena({ brood: 1 });
    for (let i = 0; i < BROOD_EVERY * (BROOD_MAX + 1); i++) {
      const enemy = spawn(-6, 3, 5, "grunt");
      world.hurtEnemy(enemy, 1000, 0, 0, 0, false, "weapon");
    }
    if (player.brood.length !== BROOD_MAX) fail.push("brood-count:" + player.brood.length);
    const prey = spawn(6, 0, 1e6);
    prey.speed = 0;
    run(2.5);
    if (!(world.dmgSrc.brood > 0)) fail.push("brood-no-burst");
    if (!(prey.burnT > 0 && prey.burnSrc === "brood")) fail.push("brood-no-poison");
    if (player.brood.length >= BROOD_MAX) fail.push("brood-not-spent");
  } catch (err) {
    fail.push("brood-exception:" + (err && err.message));
  }
  try {
    // Event Collapse: the Nova pulls first (no damage yet), then blasts 40 % harder than a plain Nova
    const nova = (up) => {
      const { world, player, spawn, run } = arena(up),
        far = spawn(8, 0, 1e6),
        close = spawn(3, 0, 1e6);
      for (const enemy of [far, close]) enemy.speed = 0;
      // one step first: the blast finds enemies through the spatial hash, built in the step
      run(1 / 60);
      player.nova = 100;
      world.nova();
      const early = 1e6 - close.hp;
      run(COLLAPSE_TIME * 0.5);
      const midX = far.x - player.x;
      run(COLLAPSE_TIME);
      return { early, midX, dealt: 1e6 - close.hp, far: far.x - player.x, implode: !!world.implode };
    };
    const plain = nova({}),
      collapse = nova({ collapse: 1 });
    if (collapse.early !== 0) fail.push("collapse-hit-early");
    if (!(collapse.midX < 7.6)) fail.push("collapse-no-pull:" + collapse.midX);
    if (collapse.implode) fail.push("collapse-hangs");
    if (!(Math.abs(collapse.dealt / plain.dealt - 1.4) < 0.05))
      fail.push(`collapse-damage:${collapse.dealt}/${plain.dealt}`);
  } catch (err) {
    fail.push("collapse-exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v3150: { ok: fail.length === 0, fail } };
}

/* ---- 3.16.0: every boss attack has a look of its own: the shots of each boss have its shape (none is the generic
   orb any more), every boss beam has a skin or a colour, and a boss volley names its boss for its sound ---- */
function selfTestV3160(result) {
  const fail = [];
  const WANT = { warden: "siren", queen: "spore", core: "riftorb", prism: "shard", forge: "slag" };
  try {
    for (const type of Object.keys(WANT)) {
      const world = new World({ seed: 0x3160, weapon: "pulse", threat: 0, ws: {} });
      let wave = 5;
      while (world.bossFor(wave) !== type && wave < 200) wave += 5;
      if (world.bossFor(wave) !== type) {
        fail.push("no-wave:" + type);
        continue;
      }
      world.startWave(wave);
      world.state = "fight";
      world.god = true;
      const kinds = new Set(),
        bare = new Set(),
        volleys = [];
      let boss = null;
      for (let i = 0; i < 60 * 70; i++) {
        world.step(1 / 60, { mx: Math.sin(i / 90), my: Math.cos(i / 130), aim: false, fire: false, assist: false });
        if (!boss && world.boss) {
          boss = world.boss;
          // the Overdrive comes first, then the whole pattern
          boss.odDue = true;
        }
        for (const bullet of world.eb) if (bullet.src === type) kinds.add(bullet.kind);
        for (const beam of world.beams) if (beam.src === type && !beam.skin && !beam.color) bare.add(beam.src);
        for (const ev of world.fx) if (ev.k === "eshot" && ev.type === "boss") volleys.push(ev.boss);
        world.fx.length = 0;
        if (world.state !== "fight") break;
      }
      if (!boss) {
        fail.push("no-boss:" + type);
        continue;
      }
      if (!kinds.size) fail.push("no-shots:" + type);
      if (kinds.has("orb")) fail.push("orb:" + type);
      if (!kinds.has(WANT[type])) fail.push(`kind:${type}:${[...kinds].join("/")}`);
      if (bare.size) fail.push("bare-beam:" + type);
      if (volleys.some((id) => id !== type)) fail.push("volley-boss:" + type);
    }
    // Searing Collapse leaves burning ground that keeps enemies burning (credited as burning)
    {
      const world = new World({ seed: 0x316, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(2);
      world.state = "fight";
      world.god = true;
      for (const kind of ["vents", "ice", "acid", "portals"]) world.arena[kind] = [];
      Object.assign(world.up, { gfire: 1 });
      world.stats = computeStats(world.weapon, world.up, world.ws);
      for (const enemy of world.enemies) enemy.dead = true;
      world.enemies.length = 0;
      world.plan = [];
      world.planIdx = 0;
      const keep = world.spawnEnemy("turret", world.player.x, world.player.y - 17);
      keep.spawnT = 0;
      keep.maxHp = keep.hp = 1e9;
      const target = world.spawnEnemy("brute", world.player.x + 8, world.player.y);
      target.spawnT = 0;
      target.maxHp = target.hp = 1e7;
      target.speed = 0;
      world.useGadget({});
      for (let i = 0; i < 60 * 2.4; i++) world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, assist: false });
      const ground = world.slag.find((pool) => pool.fire);
      if (!ground) fail.push("searing-no-ground");
      // the collapse's own burn lasts 3 s; well after it the ground still keeps the enemy alight
      for (let i = 0; i < 60 * 2.5; i++) world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, assist: false });
      const inside = ground && Math.hypot(target.x - ground.x, target.y - ground.y) < ground.r;
      if (ground && inside && !(target.burnT > 0)) fail.push("searing-not-burning");
    }
    // the props near the drone sound (the street lamps of Blackout City, the machines of the Ember Works, the obelisks of
    // the Void Core), and only near them
    if (typeof OfflineAudioContext !== "undefined") {
      const heard = (biome, where) => {
        const world = new World({ seed: 0x3170, weapon: "pulse", threat: 0, ws: {} });
        world.startWave(2);
        world.state = "fight";
        world.arena.biome = { ...world.arena.biome, id: biome };
        for (const kind of ["vents", "ice", "acid", "portals"]) world.arena[kind] = [];
        const spot = where(world.arena);
        if (!spot) return null;
        world.player.x = spot.x;
        world.player.y = spot.y;
        const engine = new SoundEngine();
        engine.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
        const ids = new Set();
        engine.placePlay = (id) => ids.add(id);
        for (let t = 0; t < 6; t += 0.1) placeTick(engine, world, 0.1);
        return ids;
      };
      const PROPS = {
        yard: ["lampBuzz", (arena) => ({ x: 0, y: -arena.H + 0.5 })],
        works: ["gears", (arena) => arena.obs.find((ob) => ob.t !== "c")],
        void: ["gravityHum", (arena) => arena.obs.find((ob) => ob.t === "c")],
      };
      for (const [biome, [id, near]] of Object.entries(PROPS)) {
        const close = heard(biome, (arena) => {
            const ob = near(arena);
            return ob && { x: ob.x + (ob.t === "c" ? ob.r + 0.8 : (ob.w || 0) + 0.8), y: ob.y };
          }),
          far = heard(biome, (arena) => {
            // a point that is far from every prop of that kind
            for (let k = 0; k < 200; k++) {
              const x = ((k * 37) % 21) - 10,
                y = ((k * 53) % 13) - 6;
              const tooNear =
                biome === "yard"
                  ? Math.min(arena.W - Math.abs(x), arena.H - Math.abs(y)) + 1.6 < PROP_HEAR
                  : arena.obs.some(
                      (ob) => (biome === "void") === (ob.t === "c") && Math.hypot(ob.x - x, ob.y - y) < PROP_HEAR,
                    );
              if (!tooNear && !arena.blocked(x, y, 0.6)) return { x, y };
            }
            return null;
          });
        if (!close) fail.push("prop-none:" + biome);
        else if (!close.has(id)) fail.push("prop-silent:" + biome);
        if (far && far.has(id)) fail.push("prop-far:" + biome);
      }
    }
    // the portals a boss calls open name their boss (they wear its colours); the Rift Core summons in its pattern
    {
      const world = new World({ seed: 0x3160, weapon: "pulse", threat: 0, ws: {} });
      let wave = 5;
      while (world.bossFor(wave) !== "core" && wave < 200) wave += 5;
      world.startWave(wave);
      world.state = "fight";
      world.god = true;
      let called = 0;
      for (let i = 0; i < 60 * 70 && !called; i++) {
        world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, assist: false });
        called = world.markers.filter((m) => m.boss === "core").length;
      }
      if (!called) fail.push("summon-portal-no-boss");
    }
    // the sentinel's beam is the security laser in Blackout City
    {
      const world = new World({ seed: 0x3161, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(2);
      world.state = "fight";
      world.god = true;
      world.arena.biome = { ...world.arena.biome, id: "yard" };
      world.arena.obs = [];
      for (const enemy of world.enemies) enemy.dead = true;
      world.enemies.length = 0;
      world.plan = [];
      world.planIdx = 0;
      const sentinel = world.spawnEnemy("sentinel", world.player.x + 9, world.player.y);
      sentinel.spawnT = 0;
      sentinel.maxHp = sentinel.hp = 1e7;
      let skin = null;
      for (let i = 0; i < 60 * 12 && !skin; i++) {
        world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, assist: false });
        const beam = world.beams.find((b) => b.src === "sentinel");
        if (beam) skin = beam.skin || "none";
      }
      if (skin !== "laser") fail.push("sentinel-skin:" + skin);
    }
    // the shots of an ordinary enemy stay what they were
    const world = new World({ seed: 1, weapon: "pulse", threat: 0, ws: {} });
    world._src = "gunner";
    const shot = world.shoot(0, 0, 0, 5, 5);
    if (!shot || shot.kind !== "orb") fail.push("gunner-shot");
    world._src = null;
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v3160: { ok: fail.length === 0, fail } };
}

/* ---- 3.17.0: the walker. A foot comes down every STEP_LEN metres walked (alternating feet, with the ground of the
   biome, of an ice sheet or of an acid pool), none while the dash has the drone in the air, and a landing when it ends;
   the model has two legs that swing opposite to each other, tuck in the air and stand still when it stands ---- */
function selfTestV3170(result) {
  const fail = [];
  try {
    const arena = (biome) => {
      const world = new World({ seed: 0x3170, weapon: "pulse", threat: 0, ws: {} });
      world.startWave(2);
      world.state = "fight";
      world.god = true;
      world.arena.biome = { ...world.arena.biome, id: biome };
      world.arena.obs = [];
      for (const kind of ["vents", "ice", "acid", "portals"]) world.arena[kind] = [];
      for (const enemy of world.enemies) enemy.dead = true;
      world.enemies.length = 0;
      world.plan = [];
      world.planIdx = 0;
      world.traps = [];
      const keep = world.spawnEnemy("turret", world.player.x, world.player.y - 17);
      keep.spawnT = 0;
      keep.maxHp = keep.hp = 1e9;
      keep.speed = 0;
      world.player.x = -10;
      world.player.y = 0;
      return world;
    };
    const run = (world, seconds, input) => {
      const found = [];
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        world.step(1 / 60, { mx: 0, my: 0, aim: false, fire: false, assist: false, ...input });
        for (const ev of world.fx) if (ev.k === "step" || ev.k === "land") found.push({ ...ev });
        world.fx.length = 0;
      }
      return found;
    };
    // standing still: no steps; walking: about one per STEP_LEN metres, the feet alternate
    const world = arena("yard");
    if (run(world, 1, {}).length) fail.push("steps-standing");
    const x0 = world.player.x,
      walked = run(world, 2, { mx: 1 }),
      dist = world.player.x - x0,
      steps = walked.filter((ev) => ev.k === "step");
    if (!(Math.abs(steps.length - Math.floor(world.player.stride / STEP_LEN)) <= 1 && steps.length >= 5))
      fail.push(`step-count:${steps.length}/${dist.toFixed(1)}m`);
    if (steps.some((ev, i) => i && ev.foot === steps[i - 1].foot)) fail.push("feet-not-alternating");
    if (!steps.every((ev) => ev.ground === FLOOR.yard)) fail.push("ground-yard");
    // the dash is a jump: no steps in the air, one landing at the end
    world.player.dashCdT = 0;
    const jump = run(world, 0.6, { mx: 1, dash: true });
    const lands = jump.filter((ev) => ev.k === "land");
    if (lands.length !== 1) fail.push("lands:" + lands.length);
    const landAt = jump.findIndex((ev) => ev.k === "land");
    if (jump.slice(0, landAt).some((ev) => ev.k === "step")) fail.push("step-in-the-air");
    // every biome has its own ground; ice and acid take over where they are
    for (const [biome, ground] of Object.entries(FLOOR)) {
      const w = arena(biome),
        found = run(w, 1.2, { mx: 1 }).filter((ev) => ev.k === "step");
      if (!found.length || !found.every((ev) => ev.ground === ground))
        fail.push(`ground-${biome}:${found[0] && found[0].ground}`);
    }
    {
      const w = arena("vault");
      w.arena.ice = [{ x: 0, y: 0, r: 60 }];
      const found = run(w, 1.2, { mx: 1 }).filter((ev) => ev.k === "step");
      if (!found.length || found.some((ev) => ev.ground !== "ice")) fail.push("ground-ice");
    }
    {
      const w = arena("marsh");
      w.arena.acid = [{ x: 0, y: 0, r: 60 }];
      const found = run(w, 1.2, { mx: 1 }).filter((ev) => ev.k === "step");
      if (!found.length || found.some((ev) => ev.ground !== "acid")) fail.push("ground-acid");
    }
    // the model: two legs that swing opposite to each other, tuck in the air and stand still when it stands
    const model = buildPlayerModel("pulse", 0x49f2ff);
    if (!model.legs || model.legs.length !== 2) fail.push("model-legs");
    else {
      model.setWalk(Math.PI / 2, 1, 0, 0);
      const [a, b] = model.legs;
      if (!(a.hip.rotation.z * b.hip.rotation.z < 0 && Math.abs(a.hip.rotation.z) > 0.5))
        fail.push("legs-not-opposite");
      model.setWalk(0, 0, 0, 0);
      if (Math.abs(a.hip.rotation.z) > 1e-6 || Math.abs(b.knee.rotation.z) > 1e-6) fail.push("legs-move-standing");
      model.setWalk(0, 0, 1, 0);
      if (!(a.hip.rotation.z > 0.4 && a.knee.rotation.z < -0.8 && b.knee.rotation.z < -0.8))
        fail.push("legs-not-tucked");
      // standing the model's feet are on the floor: the lowest point of the feet is within 5 cm of y = 0
      model.setWalk(0, 0, 0, 0);
      model.group.updateMatrixWorld(true);
      let low = 1e9;
      for (const leg of model.legs) {
        const v = leg.ankle.getWorldPosition(leg.ankle.position.clone());
        low = Math.min(low, v.y);
      }
      if (!(low > -0.05 && low < 0.1)) fail.push("feet-height:" + low.toFixed(3));
    }
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v3170: { ok: fail.length === 0, fail } };
}

/* ---- 3.21.0: the recap of a lost run: the last twelve hits with their source, the ticks of a hazard in one entry, the
   damage taken by source ---- */
function selfTestV3210(result) {
  const fail = [];
  try {
    const world = new World({ seed: 0x3210, weapon: "pulse", threat: 0, ws: {} });
    world.startWave(2);
    world.state = "fight";
    const p = world.player;
    p.hp = p.maxHp = 100000;
    if (world.hitLog.length || Object.keys(world.takenBy).length) fail.push("starts-empty");
    const hit = (dmg, src, chip) => {
      p.iT = 0;
      p.dashT = 0;
      p.shield = false;
      world.time += 2;
      world.hurtPlayer(dmg, null, null, src, chip);
    };
    hit(10, "grunt");
    hit(20, "brute");
    if (world.hitLog.length !== 2 || world.hitLog[1].src !== "brute" || world.hitLog[1].dmg < 15) fail.push("two-hits");
    // the ticks of a hazard that follow each other are one entry (and add up)
    for (let i = 0; i < 4; i++) {
      p.iT = 0;
      world.time += 0.3;
      world.hurtPlayer(3, null, null, "acid", true);
    }
    const acid = world.hitLog.filter((h) => h.src === "acid");
    if (acid.length !== 1 || acid[0].n < 2) fail.push("ticks-merge:" + JSON.stringify(acid));
    // only the last twelve are kept; the totals are for the whole run
    for (let i = 0; i < 30; i++) hit(5, "spitter");
    if (world.hitLog.length !== 12) fail.push("keeps-twelve:" + world.hitLog.length);
    if (!(world.takenBy.spitter >= 140 && world.takenBy.grunt >= 8 && world.takenBy.brute >= 15))
      fail.push("taken-by:" + JSON.stringify(world.takenBy));
    if (world.hitLog.some((h, i) => i && h.t < world.hitLog[i - 1].t)) fail.push("order");
    // the final blow is the last entry
    p.hp = 5;
    hit(50, "turret");
    if (world.state !== "dead" || world.hitLog[world.hitLog.length - 1].src !== "turret") fail.push("final-blow");
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v3210: { ok: fail.length === 0, fail } };
}

/* ---- 3.17.2: the engine's memory of what was heard lately (the sound notes in the pause menu): one entry per distinct
   sound, counted, most recent first, forgotten after half a minute; the music that plays now ---- */
function selfTestV3172(result) {
  const fail = [];
  try {
    if (typeof OfflineAudioContext !== "undefined") {
      const engine = new SoundEngine();
      engine.attach(new OfflineAudioContext(1, 44100, 44100), { room: false });
      if (engine.recentSounds().length) fail.push("heard-from-the-start");
      engine.heard("step", { ground: "ice" });
      engine.heard("step", { ground: "ice" });
      engine.heard("step", { ground: "mud" });
      engine.heard("eshot", { type: "boss", boss: "warden" });
      engine.heard("pick", 6);
      engine.heard("place:siren");
      engine.heard("nova");
      const list = engine.recentSounds(),
        by = Object.fromEntries(list.map((e) => [e.key, e]));
      if (by["step:ice"]?.n !== 2 || by["step:mud"]?.n !== 1) fail.push("counts:" + JSON.stringify(by));
      if (!by["eshot:warden"] || !by["pick:6"] || !by["place:siren"] || !by.nova) fail.push("keys:" + Object.keys(by));
      if (list.length !== 6) fail.push("distinct:" + list.length);
      if (list.some((e, i) => i && e.ago < list[i - 1].ago)) fail.push("order");
      if (engine.recentSounds(0).length > 0 && engine.recentSounds(0).some((e) => e.ago > 0)) fail.push("window");
      // a flood of different sounds does not grow the memory without bound
      for (let i = 0; i < 300; i++) engine.heard("flood" + i);
      if (engine.recent.size > 80) fail.push("unbounded:" + engine.recent.size);
      if (engine.musicNow() !== null) fail.push("music-off");
      engine.playKind = "boss";
      engine.playBiome = "works";
      engine.intensity = 0.6;
      const now = engine.musicNow();
      if (!now || now.kind !== "boss" || now.biome !== "works" || now.paused) fail.push("music-now");
      // paused in a fight the game plays the menu music but holds the track: that is the one that counts
      engine.playKind = "menu";
      engine.held = { kind: "fight", biome: "works" };
      const held = engine.musicNow();
      if (!held || held.kind !== "fight" || held.biome !== "works" || !held.paused) fail.push("music-held");
    }
  } catch (err) {
    fail.push("exception:" + (err && err.message));
  }
  return { ...result, ok: result.ok && fail.length === 0, v3172: { ok: fail.length === 0, fail } };
}
