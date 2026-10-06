// The simulation world (World): player, enemies, bullets, pickups, waves and states. Runs without
// rendering.

import { enemyDefs, bossOrder, biomeVariants, bossDefs, bossByBiome, BOSS_SLOT_HP } from "../data/enemies.js";
import { clamp, TAU, turnToward, hashString, angleDiff, makeRng, dampFactor } from "./util.js";
import { updateEnemy, updateBoss, initBoss } from "./ai.js";
import { RL_BIOME_INFO, biomesById, planBiomeRoute, biomeList } from "../data/biomes.js";
import { weaponDefs } from "../data/weapons.js";
import {
  waveEvents,
  EVENT_CHANCE,
  planWave,
  rollUpgradeOffer,
  set_RL_BIOME_MIX_CUR,
  RL_BIOME_EVENT,
  rlBiomeStart,
  rlEnemyFrom,
} from "./waves.js";
import { threatMods } from "../data/progression.js";
import { upgradesById, upgradeList } from "../data/upgrades.js";
import { Arena, buildLayout, SpatialHash, rlAddHazard250, rlPortalPair250, rlHazardRoom250 } from "./arena.js";
import { computeStats, DASH_CD_MIN } from "./stats.js";
import { BURST_WINDOW, burstFraction, endlessHpBoost } from "./difficulty.js";
import { rlPlanTraps, rlUpdateTraps } from "./traps.js";
import { walkStep } from "./walk.js";
import {
  bossCardOffer,
  bossCardKill,
  bossCardNova,
  novaBlast,
  resetBossCards,
  updateBossCards,
  BOSS_CARD_CHANCE,
} from "./boss-cards.js";
import { rlMutatorsFor } from "./mutators.js";
// 2.2.3: the run monitor observes the live run's world (used at run time only; circular import)
import { RL_MON, rlMonStep, rlMonIssue, rlMonBeginWave } from "./diagnostics.js";

/* 2.3.5: shards in a supply cache, raised by Route Scanner (+50% per level). */
function rlCacheShards(world, value) {
  return Math.round(value * Math.max(1, world.stats.cacheValue || 1));
}
/* 2.3.5: Armor Core absorbs part of the damage from enemies. Lava and acid are left to
   Hazard Seal, so the two modules do not stack on the same damage. */
// 3.0.0: traps are environment too: the Armor Core does not soften them
const RL_HAZARD_SRC = new Set(["lava", "shock", "acid", "trap"]);

// 2.5.0 A: the six new run upgrades (levels from computeStats: skates, acidCoat, heatSink, slip,
// surge, reactive). Their parts in step, fire, hurtPlayer, bulletHit, updateFeatures and addCombo
// do nothing without the upgrade.
const RL_SLIP_TIME = 1.2,
  RL_HEAT_TIME = 3,
  RL_COAT_MAX = 6;

/* ==========================================================================
   2.5.0 B: new workshop modules (Starter Kit, Hazard Attunement, Emergency Shield)
   ========================================================================== */
/* Starter Kit: the common upgrades a new run starts with. Seeded by the run, so a run and its
 replay get the same kit; one pick per module level, never the same upgrade twice. */
function rlStarterKit(world, count) {
  const rng = makeRng(hashString(world.seed + ":kit")),
    pool = upgradeList.filter(
      (upgrade) =>
        upgrade.rarity === 1 &&
        !upgrade.evo &&
        !upgrade.repeat &&
        upgrade.id !== "heal" &&
        (!upgrade.weapon || upgrade.weapon === world.weapon),
    ),
    out = [];
  for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0].id);
  return out;
}
/* 3.7.1: the whole points of a hazard tick (acid). The rest is kept for the next tick, so a resistance works exactly:
 with Hazmat and Hazard Seal (88%) a tick of 0.24 used to round to 0 and still sound, shake and flash as a hit, and a
 tick of 0.5 rounded up to a full point. */
function rlChipDamage(player, dmg) {
  const sum = (player.chipAcc || 0) + Math.max(0, dmg),
    whole = Math.floor(sum + 1e-9);
  player.chipAcc = Math.max(0, sum - whole);
  return whole;
}
/* Hazard Attunement: close = within 2 m of the edge of a vent, ice sheet or acid pool, or of a
 portal mouth. Boss-attack zones (this.hazards) do not count. */
const RL_ATTUNE_RANGE = 2;
function rlNearHazard(world) {
  const arena = world.arena,
    player = world.player;
  if (!arena || !player.alive) return false;
  for (const list of [arena.vents, arena.ice, arena.acid])
    for (const hazard of list || [])
      // 2.5.0: the player's own Acid Coating puddles (mine) are not a map hazard
      if (!hazard.mine && Math.hypot(player.x - hazard.x, player.y - hazard.y) - (hazard.r || 0) < RL_ATTUNE_RANGE)
        return true;
  for (const portal of arena.portals || [])
    if (
      Math.hypot(player.x - portal.ax, player.y - portal.ay) < RL_ATTUNE_RANGE + 0.8 ||
      Math.hypot(player.x - portal.bx, player.y - portal.by) < RL_ATTUNE_RANGE + 0.8
    )
      return true;
  return false;
}

// ---- 2.5.0 C: biome events. Every visit of a hazard biome brings its event in one of waves 2–4
// of the visit (never a boss wave, never right next to an Elite Surge or Shard Rain):
//   Ember Works  Meltdown     three extra vents, all vents erupt together every 3.4 s
//   Cryo Vault   Whiteout     three extra ice sheets; the renderer thickens the fog (snow storm)
//   Toxin Marsh  Spore Bloom  the pools grow by up to 40% over the wave, a new one sprouts every 7 s
//   Void Core    Rift Storm   the portals jump to new spots every 6 s; the new spots glow 1.6 s ahead
// Extra and moved hazards follow the fairness rules of the wave hazards (arena.js) and keep off
// the player. The signature enemies of a biome can spawn from its first wave (waves.js).
const RL_MELTDOWN_PERIOD = 3.4,
  RL_BLOOM_GROW = 1.4,
  RL_BLOOM_GROW_T = 35,
  RL_BLOOM_EVERY = 7,
  RL_STORM_EVERY = 6,
  RL_STORM_WARN = 1.6;

// 3.16.0: the shots of each boss (the Warden's siren slugs, the Hive Queen's spores, the Rift Core's rift rings; the
// Frost Prism and the Crucible name theirs, shard and slag, in their attacks)
const BOSS_SHOT = { warden: "siren", queen: "spore", core: "riftorb", prism: "shard", forge: "slag" };
const comboRewards = [
  [10, 3],
  [25, 8],
  [50, 20],
  [100, 45],
  [150, 80],
  [250, 150],
];
// 2.8.0: enemies that reach you and blow up, ram or jump at you; auto-aim prefers them when they are close
const RL_RUSHERS = new Set(["bomber", "charger", "striker", "leaper", "sapper"]);
const rlStep = 1 / 60,
  PLAYER_RADIUS = 0.55,
  MAX_PLAYER_BULLETS = 420,
  MAX_ENEMY_BULLETS = 360,
  blastSources = {
    nova: "nova",
    inferno: "inferno",
    pop: "pop",
    bomber: "pop",
    payload: "payload",
    rocket: "weapon",
    // 3.12.0: the Singularity's collapse is credited to the gadget's old source id, so saved run records stay readable
    singularity: "grenade",
    // 3.15.0: the boss cards
    hammer: "hammer",
    brood: "brood",
  },
  // 3.12.0: the Singularity (it replaced the grenade): damage of its collapse (times the damage multiplier and Event
  // Horizon), how long the rift pulls, how far it pulls (times the blast radius), how hard (m/s² before mass)
  SING_DAMAGE = 90,
  SING_PULL_TIME = 1.5,
  SING_PULL_RADIUS = 1.7,
  SING_PULL = 50,
  World = class {
    constructor(opts) {
      let snap = opts.snap || null;
      this.seed = (snap ? snap.seed : opts.seed) >>> 0;
      this.weapon = weaponDefs[snap ? snap.weapon : opts.weapon] ? (snap ? snap.weapon : opts.weapon) : "pulse";
      this.threat = clamp((snap ? snap.threat : opts.threat) | 0, 0, 5);
      this.tm = threatMods(this.threat);
      this.ws = { ...(opts.ws || {}) };
      this.up = snap ? { ...snap.up } : {};
      this.wave = snap ? snap.wave : 1;
      this.endless = snap ? !!snap.endless : false;
      this.time = (snap && snap.time) || 0;
      this.kills = (snap && snap.kills) || 0;
      this.shards = (snap && snap.shards) || 0;
      this.rerolls = snap && snap.rerolls != null ? snap.rerolls | 0 : 1 + (this.ws.reroll || 0);
      this.revived = snap ? !!snap.revived : false;
      this.bossKills = snap ? [...(snap.bossKills || [])] : [];
      this.flawless = (snap && snap.flawless) || 0;
      this.legendaries = (snap && snap.legendaries) || 0;
      this.dmgDealt = (snap && snap.dmgDealt) || 0;
      this.bestCombo = (snap && snap.bestCombo) || 0;
      this.evolved = (snap && snap.evolved) || 0;
      // 3.15.0: the chance of the next boss card (it grows after each boss offer without one)
      this.bossLuck = snap && Number.isFinite(snap.bossLuck) ? clamp(snap.bossLuck, 0, 1) : BOSS_CARD_CHANCE;
      this.offerExclusive = null;
      this.broodN = 0;
      this.runStats = {
        dmgTaken: (snap && snap.runStats && Number(snap.runStats.dmgTaken)) || 0,
        dashes: (snap && snap.runStats && Number(snap.runStats.dashes)) || 0,
        critHits: (snap && snap.runStats && Number(snap.runStats.critHits)) || 0,
      };
      // 3.21.0: what hit the drone (the death recap): the last hits, and the damage taken by source over the run
      this.hitLog = [];
      this.takenBy = {};
      this.dmgSrc = {};
      if (snap && snap.dmgSrc && typeof snap.dmgSrc == "object")
        for (let src in snap.dmgSrc) {
          if (Number.isFinite(snap.dmgSrc[src])) {
            this.dmgSrc[src] = snap.dmgSrc[src];
          }
        }
      this.route = planBiomeRoute(makeRng(hashString(this.seed + ":route")));
      this.combo = 0;
      this.comboT = 0;
      this.trails = [];
      this.hold = false;
      this.nextId = 1;
      this.fx = [];
      this.stats = computeStats(this.weapon, this.up, this.ws);
      this.player = {
        x: 0,
        y: 2,
        vx: 0,
        vy: 0,
        r: PLAYER_RADIUS,
        hp: this.stats.maxHp,
        face: -Math.PI / 2,
        aim: -Math.PI / 2,
        fireT: 0,
        dashT: 0,
        dashCdT: 0,
        dashX: 0,
        dashY: 0,
        dashId: 0,
        iT: 0,
        shieldT: 0,
        shield: false,
        nova: 0,
        alive: true,
        moving: false,
        firing: false,
        rushN: 0,
        rushT: 0,
        regenAcc: 0,
        wings: [],
        target: null,
        hurtT: 0,
        trailT: 0,
        portalT: 0,
        onIce: false,
        shotN: 0,
        // 3.0.0: the gadget (3.12.0: the Singularity): charges and the time until the next one is back
        gadgetN: this.stats.gadgetMax,
        gadgetT: 0,
        slowT: 0,
        // 3.7.1: what slows the drone: "chill" (ice, frost) or "shock" (an electric trap)
        slowKind: "chill",
        acidT: 0,
        inAcid: false,
        // 3.7.1: the part of a hazard tick that has not added up to a whole point yet (rlChipDamage)
        chipAcc: 0,
        // 3.15.0: the larvae of Brood (boss-cards.js)
        brood: [],
        // 3.17.0: metres walked (the stride of the walker, core/walk.js) and whether the dash has it in the air
        stride: 0,
        air: false,
      };
      if (snap) {
        this.player.hp = clamp(snap.hp, 1, this.stats.maxHp);
      }
      this.chronoT = 0;
      this.singularities = [];
      resetBossCards(this);
      this.traps = [];
      this.offer = null;
      this.offerBoss = false;
      this.state = "fight";
      this.stateT = 0;
      // 2.8.1: a run resumed in the fight rebuilds its wave with the supply caches and the bonus group
      // (the snapshot is taken at the wave start); a resumed upgrade choice throws the wave away anyway
      this.startWave(this.wave, snap ? snap.nova : null, !!snap && !Array.isArray(snap.offer));
      if (snap && Array.isArray(snap.offer)) {
        let offer = snap.offer.filter((id) => upgradesById[id]);
        this.fx.length = 0;
        this.plan = [];
        this.planIdx = 0;
        this.bossPending = null;
        this.offerBoss = !!snap.offerBoss;
        this.state = "choose";
        this.offer = offer.length ? offer : this.makeOffer();
        this.offerExclusive = this.offer.find((id) => upgradesById[id].boss) || null;
        // 2.9.1: a save stuck on an empty choice (everything maxed) goes on with the next wave
        if (!this.offer.length) this.skipEmptyChoice();
      }
    }
    emit(kind, data) {
      data = data || {};
      data.k = kind;
      this.fx.push(data);
      return data;
    }
    // `nova`: the saved charge of a resumed run (null for a new wave); `resumed`: the wave is rebuilt
    // from a snapshot of its start, so it gets the same caches and bonus group as the first time
    startWave(wave, nova, resumed = false) {
      // 2.5.0 C: an arena changed by a biome event is never reused (startWave of the same wave again)
      if (this.arena && this.arena.rlEvent) {
        this.arena.key += ":used";
      }
      this.bioEv = null;
      // 2.5.0 B: a fresh run (not a resumed one: that passes its saved Nova charge) gets its Starter
      // Kit before the first wave is set up, so shield or HP upgrades from the kit count from the start
      const kit = (this.ws.starterKit || 0) | 0;
      let given = null;
      if (kit > 0 && wave === 1 && nova == null && !this.kitGiven && !Object.keys(this.up).length) {
        given = rlStarterKit(this, Math.min(3, kit));
        for (const id of given) this.up[id] = (this.up[id] || 0) + 1;
        this.stats = computeStats(this.weapon, this.up, this.ws);
        this.player.hp = this.stats.maxHp;
      }
      this.kitGiven = true;
      // 2.5.0 B: Emergency Shield is ready again in every wave
      this.barrierUsed = false;
      this.barrierT = 0;
      this.barrierOwnShield = false;
      this.attuned = false;
      // 2.4.0: the biome's enemy mix weights the spawn plan (planWave reads it while the wave is set up)
      set_RL_BIOME_MIX_CUR(RL_BIOME_INFO[this.biomeFor(wave).id]?.mix || null);
      try {
        this.wave = wave;
        this.rng = makeRng(hashString(this.seed + ":" + wave));
        let biome = this.biomeFor(wave),
          layout = buildLayout(biome, this.seed, wave, wave === 1 || !!this.bossFor(wave));
        if (!this.arena || this.arena.key !== layout.key) {
          this.arena = new Arena(biome, layout);
          this.hash = new SpatialHash(layout.W, layout.H, 2.5);
        }
        this.enemies = [];
        this.pb = [];
        this.eb = [];
        this.pickups = [];
        this.beams = [];
        this.hazards = [];
        this.markers = [];
        this.trails = [];
        resetBossCards(this);
        this.boss = null;
        this.combo = 0;
        this.comboT = 0;
        let player = this.player;
        player.x = 0;
        player.y = 2;
        player.vx = player.vy = 0;
        player.dashT = 0;
        player.iT = 1;
        player.target = null;
        player.alive = true;
        player.shield = this.stats.shieldCd > 0;
        // 3.0.0: every wave starts with all charges of the gadget
        player.gadgetN = this.stats.gadgetMax;
        player.gadgetT = 0;
        this.singularities = [];
        player.shieldT = 0;
        let novaFloor = 25 * (this.ws.nova || 0);
        player.nova = nova ?? Math.max(player.nova, novaFloor);
        this.waveT = 0;
        this.waveDmg = 0;
        // 3.3.0: the Endless mutators of this wave (see mutators.js): Armored adds hull, Barrage damage and shot speed
        const mutators = rlMutatorsFor(this.seed, wave);
        this.mods = mutators.mods;
        this.hpMul =
          (1 + 0.085 * (wave - 1) + 0.0058 * (wave - 1) * (wave - 1)) *
          this.tm.hp *
          endlessHpBoost(wave) *
          (1 + 0.25 * (this.mods.armored || 0));
        this.dmgMul = (1 + 0.035 * (wave - 1)) * this.tm.dmg * (1 + 0.1 * (this.mods.barrage || 0));
        this.shotMul = 1 + 0.2 * (this.mods.barrage || 0);
        this.stragglerT = 0;
        let boss = this.bossFor(wave);
        this.event = this.eventFor(wave);
        this.rainT = 1.5;
        this.champion = null;
        let champRng = makeRng(hashString(this.seed + ":champ:" + wave));
        this.championPending =
          !boss && !this.event && wave >= 3 && (wave - 1) % 5 >= 2 && champRng.chance(0.4)
            ? this.championType(biome.id, wave, champRng)
            : null;
        this.plan = planWave(this.rng, wave, this.tm, !!boss, this.event ? waveEvents[this.event].plan : {});
        this.planIdx = 0;
        this.planTotal = this.plan.reduce((sum, group) => sum + group.members.length, 0);
        // 3.0.0: the traps of this wave (none on boss waves and before wave 6)
        this.traps = rlPlanTraps(this, wave, !!boss);
        this.groupT = 1.1;
        this.bossPending = boss;
        this.state = "fight";
        this.stateT = 0;
        this.emit("wave", { n: wave, boss: boss, biome: biome.id, event: this.event });
        if (mutators.gained && !resumed)
          this.emit("mutator", { id: mutators.gained, level: this.mods[mutators.gained], x: player.x, y: player.y });
        // Nova start charge, the arena director's wave mode, supply caches and the director's bonus
        // group (kept additive to the wave set up above)
        if (nova == null && this.stats.novaStart > 0) player.nova = Math.min(100, player.nova + this.stats.novaStart);
        const director = this.arena?.director,
          mode = director?.mode || "standard";
        this.waveMode = mode;
        this.waveIntensity = director?.intensity || 0;
        const fresh = nova == null || resumed;
        if (fresh && !this.bossPending && !this.boss && wave >= 2) {
          const count = wave % 6 === 0 ? 2 : 1;
          for (let i = 0; i < count; i++) {
            const spot = this.arena.freePoint(
              makeRng(hashString(this.seed + ":cache:" + wave + ":" + i)),
              player.x,
              player.y,
              6.2,
              0.35,
            );
            if (!spot) continue;
            const value = this.rng.chance(0.12) ? 25 : this.rng.chance(0.35) ? 10 : 5,
              kind = this.rng.chance(0.12) ? "heal" : "shard";
            const pickup = this.mkPickup(kind, spot.x, spot.y, kind === "heal" ? 20 : rlCacheShards(this, value));
            pickup.vx = 0;
            pickup.vy = 0;
            pickup.cache = true;
            this.pickups.push(pickup);
          }
        }
        if (fresh && !this.bossPending && !this.boss && wave >= 2) {
          const extra =
            Math.max(0, this.stats.cacheBonus || 0) +
            Math.max(0, this.stats.cacheCount || 0) +
            (mode === "cache-run" ? 2 : 0) +
            (mode === "salvage" ? 2 : 0) +
            (wave % 9 === 0 ? 1 : 0);
          const cacheRng = makeRng(hashString(this.seed + ":cache22:" + wave));
          for (let i = 0; i < extra; i++) {
            const spot = this.arena.freePoint(cacheRng, player.x, player.y, 6.2, 0.35);
            if (!spot) continue;
            const kind = cacheRng.chance(0.18) ? "heal" : "shard",
              value = kind === "heal" ? 20 : rlCacheShards(this, 5 + 2 * (this.stats.cacheBonus || 0));
            const pickup = this.mkPickup(kind, spot.x, spot.y, value);
            pickup.vx = 0;
            pickup.vy = 0;
            pickup.cache = true;
            this.pickups.push(pickup);
          }
          const bonusPool =
            {
              barricade: ["charger", "brute"],
              crossfire: ["sentinel", "turret", "drone"],
              "cache-run": ["carrier", "mender", "beacon"],
              riftwalk: ["phantom", "striker", "weaver"],
              gauntlet: ["carrier", "leaper", "driller"],
              shatter: ["phantom", "splitter", "driller"],
              deadzone: ["sapper", "brute", "beacon"],
              minefield: ["sapper", "drone"],
              zigzag: ["weaver", "striker"],
              salvage: ["carrier", "beacon"],
              turbulence: ["sentinel", "drone", "weaver"],
              fortress: ["driller", "bulwark", "beacon"],
            }[mode] || [];
          const avail = bonusPool.filter((id) => enemyDefs[id] && wave >= enemyDefs[id].from);
          if (wave >= 18 && avail.length) {
            const members = [{ type: cacheRng.pick(avail), elite: false }];
            if (wave >= 30 && cacheRng.chance(0.45)) members.push({ type: cacheRng.pick(avail), elite: false });
            this.plan.push({ gap: 2.35, members });
            this.planTotal += members.length;
          }
        }
      } finally {
        set_RL_BIOME_MIX_CUR(null);
      }
      if (given && given.length) {
        this.emit("kit", { ids: given });
      }
      // 2.5.0 C: the biome event of this wave
      const eventDef = this.event && waveEvents[this.event];
      if (eventDef && eventDef.biome && eventDef.biome === this.arena.biome.id && !this.bossPending) {
        this.startBiomeEvent(this.event, wave);
      }
      // 2.2.3: run monitor (only the live run's world is observed; self-test and snapshot-check
      // worlds are ignored by identity)
      if (RL_MON && RL_MON.w === this)
        try {
          rlMonBeginWave(this);
        } catch (err) {
          rlMonIssue("WARN", "monitor", "monitor exception: " + err.message);
        }
    }
    championType(biome, wave, rng) {
      // 2.4.0: the pack biomes are gone; the five biomes also draw champions from the later enemies
      const special = {
        works: ["brute", "grunt", "charger", "minebot", "driller"],
        vault: ["bulwark", "gunner", "sentinel", "turret"],
        void: ["striker", "brute", "phantom", "weaver"],
        marsh: ["splitter", "brute", "sapper", "carrier"],
      }[biome];
      if (special) {
        const valid = special.filter((id) => enemyDefs[id] && enemyDefs[id].from <= wave);
        if (valid.length) return rng.pick(valid);
      }
      let pool = (
        {
          yard: ["grunt", "gunner"],
          works: ["brute", "grunt"],
          vault: ["bulwark", "gunner"],
          void: ["striker", "brute"],
          marsh: ["splitter", "brute"],
        }[biome] || ["grunt"]
      ).filter((type) => enemyDefs[type].from <= wave);
      return pool.length ? rng.pick(pool) : "grunt";
    }
    eventFor(wave) {
      // 2.5.0 C: a hazard biome's visit gets its biome event, and no other event right next to it
      const eventWave = this.biomeEventWave(wave);
      if (eventWave && eventWave === wave) return RL_BIOME_EVENT[this.biomeFor(wave).id];
      if (eventWave && Math.abs(eventWave - wave) === 1) return null;
      let eligible = (waveNo) => waveNo >= 3 && !this.bossFor(waveNo) && (waveNo - 1) % 5 !== 0,
        eventRng = (waveNo) => makeRng(hashString(this.seed + ":event:" + waveNo));
      if (
        !eligible(wave) ||
        eventRng(wave).next() >= EVENT_CHANCE ||
        (eligible(wave - 1) && eventRng(wave - 1).next() < EVENT_CHANCE)
      )
        return null;
      let rng = eventRng(wave);
      rng.next();
      return ["elite", "rain"][Math.floor(rng.next() * 2)];
    }
    /* 3.22.0: what the next wave brings (a look ahead for the upgrade choice; it changes nothing): the biome and whether
       it is a new one, the boss, the wave event, the mutator that joins in Endless, and whether traps are on the floor */
    previewWave(n) {
      const biome = this.biomeFor(n),
        boss = this.bossFor(n),
        mutators = rlMutatorsFor(this.seed, n);
      return {
        wave: n,
        biome: biome.id,
        newBiome: n > 1 && this.biomeFor(n - 1).id !== biome.id,
        boss: boss || null,
        event: boss ? null : this.eventFor(n),
        mutator: mutators.gained || null,
        traps: n >= 6 && !boss,
      };
    }
    biomeFor(wave) {
      const cycle = Math.floor((Math.max(1, wave) - 1) / 5);
      return biomesById[this.route[cycle % this.route.length]] || biomeList[0];
    }
    // 2.4.6: the boss of a boss wave is the boss of its biome (Blackout City: Warden, Ember Works:
    // Crucible, Cryo Vault: Frost Prism, Toxin Marsh: Hive Queen, Void Core: Rift Core). In waves 5–20
    // its hull follows the slot (wave 5, 10, 15, 20, see spawnBoss), because Queen, Prism and Crucible
    // can each come at wave 10 or 15; Endless keeps each boss's own hull as before.
    bossFor(wave) {
      return wave % 5 !== 0
        ? null
        : bossByBiome[this.biomeFor(wave).id] || bossOrder[(wave / 5 - 1) % bossOrder.length];
    }
    // 2.5.0 C: the wave of the current biome visit that gets its biome event (0: none)
    biomeEventWave(wave) {
      const id = RL_BIOME_EVENT[this.biomeFor(wave).id];
      if (!id) return 0;
      const start = rlBiomeStart(wave),
        eventWave = start + 1 + Math.floor(makeRng(hashString(this.seed + ":biome-event:" + start)).next() * 3);
      return this.bossFor(eventWave) ? 0 : eventWave;
    }
    // 2.5.0 C: the wave from which an enemy type can spawn in this run's biome at `wave`
    enemyFrom(type, wave) {
      return rlEnemyFrom(type, this.biomeFor(wave).id, wave);
    }
    isFinalWave() {
      return !this.endless && this.wave >= 20;
    }
    snapshot() {
      let snap = {
        v: 1,
        seed: this.seed,
        weapon: this.weapon,
        threat: this.threat,
        wave: this.wave,
        endless: this.endless,
        up: { ...this.up },
        hp: Math.max(1, Math.round(this.player.hp)),
        shards: this.shards,
        kills: this.kills,
        time: this.time,
        rerolls: this.rerolls,
        revived: this.revived,
        nova: Math.round(this.player.nova),
        bossKills: [...this.bossKills],
        flawless: this.flawless,
        legendaries: this.legendaries,
        dmgDealt: Math.round(this.dmgDealt),
        bestCombo: this.bestCombo,
        evolved: this.evolved,
        bossLuck: this.bossLuck,
        runStats: {
          dmgTaken: Math.round(this.runStats.dmgTaken),
          dashes: this.runStats.dashes | 0,
          critHits: this.runStats.critHits | 0,
        },
        dmgSrc: Object.fromEntries(Object.entries(this.dmgSrc).map(([src, dmg]) => [src, Math.round(dmg)])),
      };
      if (this.state === "choose" && this.offer) {
        snap.offer = [...this.offer];
        snap.offerBoss = !!this.offerBoss;
      }
      return snap;
    }
    choose(id) {
      if (this.state !== "choose" || !this.offer || !this.offer.includes(id)) return false;
      let upgrade = upgradesById[id],
        player = this.player,
        oldMaxHp = this.stats.maxHp;
      this.up[id] = (this.up[id] || 0) + 1;
      if (upgrade.rarity === 4) {
        this.legendaries++;
      }
      if (upgrade.rarity === 5) {
        this.evolved++;
      }
      const gadgetBefore = this.stats.gadgetMax;
      this.stats = computeStats(this.weapon, this.up, this.ws);
      // 3.0.0: a new gadget cell comes charged
      player.gadgetN = Math.min(this.stats.gadgetMax, player.gadgetN + (this.stats.gadgetMax - gadgetBefore));
      if (id === "hp") {
        player.hp = Math.min(this.stats.maxHp, player.hp + 20 + (this.stats.maxHp - oldMaxHp - 20));
      }
      if (id === "heal") {
        player.hp = Math.min(this.stats.maxHp, player.hp + this.stats.maxHp * 0.45);
      }
      player.hp = Math.min(player.hp, this.stats.maxHp);
      this.offer = null;
      this.offerExclusive = null;
      this.emit("pick", { id: id, evo: upgrade.rarity === 5, boss: !!upgrade.boss });
      this.startWave(this.wave + 1);
      return true;
    }
    reroll() {
      if (this.state !== "choose" || this.rerolls <= 0) return false;
      this.rerolls--;
      this.offer = this.makeOffer(this.offer || []);
      this.emit("reroll");
      return true;
    }
    makeOffer(exclude = []) {
      let count = 3 + ((this.ws.insight || 0) > 0 ? 1 : 0);
      // 3.15.0: the boss card holds the first place, also through a reroll
      const exclusive = this.offerBoss ? this.offerExclusive : null;
      const picks = rollUpgradeOffer(
        this.rng,
        this.up,
        this.wave,
        this.player.hp / this.stats.maxHp,
        count - (exclusive ? 1 : 0),
        this.offerBoss,
        exclude,
        this.weapon,
      );
      return exclusive ? [exclusive, ...picks] : picks;
    }
    // 2.9.1: opens the upgrade choice after a wave. When nothing is left to offer (every upgrade at its
    // maximum, hull healthy) there is nothing to choose: the empty screen used to hang the run for good.
    beginChoice() {
      this.offerExclusive = this.offerBoss ? bossCardOffer(this) : null;
      const offer = this.makeOffer();
      if (!offer.length) {
        this.skipEmptyChoice();
        return;
      }
      this.state = "choose";
      this.stateT = 0;
      this.offer = offer;
      this.emit("offer");
    }
    // no cards: repair the hull a bit, pay a few shards and go on with the next wave
    skipEmptyChoice() {
      const player = this.player,
        heal = Math.round(this.stats.maxHp * 0.35),
        shards = 10 + Math.floor(this.wave / 2);
      player.hp = Math.min(this.stats.maxHp, player.hp + heal);
      this.shards += shards;
      this.offer = null;
      this.emit("maxed", { heal, shards });
      this.startWave(this.wave + 1);
    }
    continueEndless() {
      if (this.state === "victory") {
        this.endless = true;
        this.beginChoice();
      }
    }
    // 3.7.1: the Endless part of a run starts its clock at 0 (game.endless: its summary counts only the Endless part).
    // A time stamp of the old clock moves with it: the last dash would otherwise lie in the future, and with Cryo Skates
    // the dash stayed locked for as long as the run had lasted
    restartClock() {
      const shift = this.time;
      this.time = 0;
      if (this.player.dashAt != null) this.player.dashAt -= shift;
    }
    step(dt, input) {
      // 2.2.3: run monitor (only the live run's world is observed; self-test and snapshot-check
      // worlds are ignored by identity)
      const monitored = !!RL_MON && RL_MON.w === this,
        fx0 = this.fx.length,
        dash0 = this.player.dashId,
        shards0 = this.shards,
        kills0 = this.kills;
      const stats = this.stats,
        player = this.player;
      // 2.5.0 B: the Emergency Shield barrier runs out
      if (this.barrierT > 0) {
        this.barrierT -= dt;
        if (this.barrierT <= 0) {
          this.barrierT = 0;
          // the bubble was only shown for the barrier; a shield from the Energy Shield upgrade stays
          if (this.barrierOwnShield) {
            player.shield = false;
            player.shieldT = 0;
          }
          this.barrierOwnShield = false;
        }
      }
      // 2.5.0 B: Hazard Attunement: more damage and repair while close to a map hazard
      this.attuned = stats.attuneDmg > 0 && this.state === "fight" && rlNearHazard(this);
      const attuned = this.attuned,
        dmg = stats.dmgMul,
        regen = stats.regen;
      if (attuned) {
        stats.dmgMul = dmg * (1 + stats.attuneDmg);
        stats.regen = (regen || 0) + stats.attuneRegen;
      }
      try {
        // 2.5.0 A: Cryo Skates, Heat Sink and Slipstream
        const tuned = !!(stats.skates || stats.heatSink || stats.slip),
          fight = this.state === "fight" && player.alive,
          // Cryo Skates: on ice or anywhere in Cryo Vault (onIce is from the last frame)
          skating = stats.skates > 0 && fight && (player.onIce || this.arena.biome.id === "vault"),
          speed = stats.speed,
          rate = stats.rateMul,
          dashId = player.dashId;
        if (tuned) {
          // Heat Sink: an erupting vent within 2.5 m of its edge keeps the heat up and charges Nova
          if (stats.heatSink && fight)
            for (const vent of this.arena.vents)
              if (vent.st === "erupt" && Math.hypot(player.x - vent.x, player.y - vent.y) < vent.r + 2.5) {
                player.heatT = RL_HEAT_TIME;
                this.addNova(10 * stats.heatSink * dt);
                break;
              }
          player.skating = skating;
          if (skating) stats.speed = speed * (1 + 0.15 * stats.skates);
          if (player.heatT > 0) stats.rateMul = rate * (1 + 0.25 * stats.heatSink);
        }
        try {
          const rateBase = stats.rateMul || 1;
          try {
            this.stateT += dt;
            if (this.state === "choose" || this.state === "victory") this.idle(dt);
            else {
              this.time += this.state === "dead" ? 0 : dt;
              this.waveT += dt;
              let slow = this.chronoT > 0 ? 0.45 : 1;
              if (this.chronoT > 0) {
                this.chronoT -= dt;
              }
              if (this.comboT > 0) {
                this.comboT -= dt;
                if (this.comboT <= 0) {
                  if (this.combo >= 5) {
                    this.emit("comboEnd", { n: this.combo });
                  }
                  this.combo = 0;
                }
              }
              if (this.player.alive) {
                this.updatePlayer(dt, input);
              } else {
                this.player.vx *= 0.9;
                this.player.vy *= 0.9;
              }
              this.hash.build(this.enemies);
              if (this.state === "fight") {
                this.updateSpawns(dt);
              }
              this.arena.flow.update(this.player.x, this.player.y);
              let slowDt = dt * slow;
              for (let i = 0; i < this.enemies.length; i++) {
                let enemy = this.enemies[i];
                if (!enemy.dead) {
                  this.statusTick(enemy, dt);
                  if (!enemy.dead) {
                    this._src = enemy.type;
                    this._var = enemy.variant || null;
                    if (enemy.boss) {
                      updateBoss(this, enemy, slowDt);
                    } else {
                      updateEnemy(this, enemy, slowDt);
                    }
                    if (enemy.variant || enemy.champion) {
                      this.variantTick(enemy, slowDt);
                    }
                    this.moveEnemy(enemy, slowDt);
                  }
                }
              }
              this._src = null;
              this._var = null;
              this.separate();
              this.hash.build(this.enemies);
              if (this.player.alive) {
                this.updateOrbitals(dt);
                this.updateWingman(dt);
                this.contactDamage();
              }
              this.updateTrails(dt);
              updateBossCards(this, dt);
              this.updatePBullets(dt);
              this.updateSingularities(slowDt);
              this.updateEBullets(slowDt);
              this.updateBeams(slowDt);
              this.updateHazards(slowDt);
              rlUpdateTraps(this, slowDt);
              this.updatePickups(dt);
              this.updateMarkers(dt);
              this.updateFeatures(dt);
              if (this.event === "rain" && this.state === "fight") {
                this.shardRain(dt);
              }
              this.sweep();
              this.checkWaveEnd();
            }
          } finally {
            stats.rateMul = rateBase;
          }
        } finally {
          if (tuned) {
            stats.speed = speed;
            stats.rateMul = rate;
            // the skates never bring the next dash closer than DASH_CD_MIN after the last one
            if (skating && player.dashCdT > 0)
              player.dashCdT = Math.max(
                0,
                DASH_CD_MIN - (this.time - (player.dashAt ?? -1e9)),
                player.dashCdT - 0.35 * stats.skates * dt,
              );
            if (player.heatT > 0) player.heatT = Math.max(0, player.heatT - dt);
            if (player.slipT > 0) player.slipT = Math.max(0, player.slipT - dt);
            // Slipstream: a new dash primes the shots for the dash itself plus RL_SLIP_TIME
            if (stats.slip && player.dashId !== dashId) player.slipT = RL_SLIP_TIME + 0.17;
          }
        }
      } finally {
        if (attuned) {
          stats.dmgMul = dmg;
          stats.regen = regen;
        }
      }
      if (monitored)
        try {
          rlMonStep(this, fx0, dash0, shards0, kills0, dt);
        } catch (err) {
          rlMonIssue("WARN", "monitor", "monitor exception: " + err.message);
        }
    }
    variantTick(enemy, dt) {
      if (enemy.spawnT > 0) return;
      let player = this.player;
      if (enemy.champion) {
        this.hash.query(enemy.x, enemy.y, 7, (ally) => {
          if (!ally.dead && ally !== enemy && Math.hypot(ally.x - enemy.x, ally.y - enemy.y) < 7) {
            ally.rallyT = 0.3;
          }
        });
      }
      if (enemy.rallyT > 0) {
        enemy.rallyT -= dt;
      }
      enemy.vt = (enemy.vt || 0) - dt;
      if (enemy.variant === "scorch" && enemy.vt <= 0 && Math.hypot(enemy.vx, enemy.vy) > 0.5) {
        enemy.vt = 1.1;
        let src = this._src;
        this._src = enemy.type;
        this.hazard({ x: enemy.x, y: enemy.y, r: 1, delay: 0.8, dmg: enemy.dmg * 0.6, kind: "fire" });
        this._src = src;
      } else if (enemy.variant === "phase" && enemy.vt <= 0) {
        enemy.vt = 2.4 + this.rng.next();
        let dx = player.x - enemy.x,
          dy = player.y - enemy.y,
          dist = Math.hypot(dx, dy);
        if (dist > 4.5) {
          let x = enemy.x + (dx / dist) * 3,
            y = enemy.y + (dy / dist) * 3;
          if (!this.arena.blocked(x, y, enemy.r) && !this.arena.outside(x, y, enemy.r)) {
            this.emit("blink", { x: enemy.x, y: enemy.y, small: true, phase: true });
            enemy.x = x;
            enemy.y = y;
          }
        }
      }
    }
    shardRain(dt) {
      if (this.planIdx >= this.plan.length && this.enemies.length === 0) return;
      this.rainT -= dt;
      if (this.rainT > 0 || this.pickups.length > 200) return;
      this.rainT = 0.8 + this.rng.next() * 0.5;
      let spot = this.arena.freePoint(this.rng, this.player.x, this.player.y, 3, 0.4),
        pickup = this.mkPickup("shard", spot.x, spot.y, this.rng.chance(0.15) ? 5 : 1);
      pickup.vx = 0;
      pickup.vy = 0;
      pickup.rain = true;
      this.pickups.push(pickup);
    }
    updateFeatures(dt) {
      // 2.5.0 C: the biome event ticks first. The player's Acid Coating puddles (mine) are not map
      // pools: Spore Bloom neither grows them nor counts them when it looks for room or checks its
      // pool cap.
      if (this.bioEv && this.state === "fight") {
        const all = this.arena.acid,
          ownAcid = all.filter((pool) => pool.mine);
        if (ownAcid.length) this.arena.acid = all.filter((pool) => !pool.mine);
        try {
          this.tickBiomeEvent(this.bioEv, dt);
        } finally {
          if (ownAcid.length) this.arena.acid.push(...ownAcid);
        }
      }
      // 2.5.0 A: Acid Coating. The player's own acid never hurts the player: those puddles leave
      // the list while the map features are updated below, then only mark enemies (corrode = +25%
      // damage taken).
      const coat = !!this.stats.acidCoat;
      let mine = null,
        natural = false,
        live = null;
      if (coat) {
        const all = this.arena.acid;
        mine = all.filter((pool) => pool.mine);
        this.arena.acid = all.filter((pool) => !pool.mine);
        natural = this.arena.acid.length > 0;
        live = mine;
      }
      try {
        let arena = this.arena,
          player = this.player;
        if (arena.acid.length) {
          for (let pool of arena.acid) {
            if (pool.life != null) {
              pool.life -= dt;
            }
          }
          if (arena.acid.some((pool) => pool.life != null && pool.life <= 0)) {
            arena.acid = arena.acid.filter((pool) => pool.life == null || pool.life > 0);
          }
          player.inAcid = player.alive && arena.inAcid(player.x, player.y);
          if (player.inAcid && this.state === "fight") {
            player.acidT += dt;
            if (player.acidT >= 0.5) {
              player.acidT = 0;
              this.hurtPlayer(
                2 * this.dmgMul * Math.max(0, 1 - (this.stats.hazardResist || 0)),
                null,
                null,
                "acid",
                true,
              );
            }
          } else {
            player.acidT = 0.35;
          }
          for (let enemy of this.enemies) enemy.corrode = !enemy.boss && arena.inAcid(enemy.x, enemy.y);
        } else {
          player.inAcid = false;
          // 2.8.1: when the last pool is gone nobody stands in acid any more
          for (let enemy of this.enemies) enemy.corrode = false;
        }
        // 3.4.0: in Blackout City the vents are live manholes: they arc (shock) instead of erupting lava, and the
        // current stuns the enemies it catches (slowed) besides burning them
        const shock = arena.biome.id === "yard";
        if (arena.vents.length && this.state === "fight")
          for (let vent of arena.vents) {
            let state = arena.ventState(vent, this.waveT);
            if (state !== vent.st) {
              if (state === "erupt") {
                this.emit("erupt", { x: vent.x, y: vent.y, r: vent.r });
              }
              vent.st = state;
            }
            if (state === "erupt") {
              if (player.alive && Math.hypot(player.x - vent.x, player.y - vent.y) < vent.r + player.r * 0.4) {
                this.hurtPlayer(
                  9 * this.dmgMul * Math.max(0, 1 - (this.stats.hazardResist || 0)),
                  vent.x,
                  vent.y,
                  shock ? "shock" : "lava",
                );
              }
              this.hash.query(vent.x, vent.y, vent.r, (enemy) => {
                if (enemy.dead || enemy.boss || Math.hypot(enemy.x - vent.x, enemy.y - vent.y) > vent.r + enemy.r * 0.5)
                  return;
                let burn = enemy.burnT > 0 ? enemy.burnDps : 0;
                enemy.burnT = Math.max(enemy.burnT, 2);
                enemy.burnDps = Math.max(burn, enemy.maxHp * 0.14);
                enemy.burnSrc = shock ? "shock" : "lava";
                if (shock) enemy.slowT = Math.max(enemy.slowT, 1.2);
              });
            }
          }
        if (arena.portals.length) {
          if (player.portalT > 0) {
            player.portalT -= dt;
          }
          for (let portal of arena.portals)
            for (let [fromX, fromY, toX, toY] of [
              [portal.ax, portal.ay, portal.bx, portal.by],
              [portal.bx, portal.by, portal.ax, portal.ay],
            ]) {
              if (player.alive && player.portalT <= 0 && Math.hypot(player.x - fromX, player.y - fromY) < 0.8) {
                let speed = Math.hypot(player.vx, player.vy),
                  dirX = speed > 0.5 ? player.vx / speed : 0,
                  dirY = speed > 0.5 ? player.vy / speed : 1;
                this.emit("warp", { x: player.x, y: player.y, tx: toX, ty: toY, who: "player" });
                player.x = toX + dirX * 1.2;
                player.y = toY + dirY * 1.2;
                this.arena.resolve(player, player.r);
                player.portalT = 0.9;
              }
              for (let list of [this.pb, this.eb])
                for (let bullet of list)
                  if (
                    !(bullet.life <= 0 || (bullet.warpT || 0) > this.time) &&
                    Math.abs(bullet.x - fromX) < 0.75 &&
                    Math.abs(bullet.y - fromY) < 0.75
                  ) {
                    let speed = Math.hypot(bullet.vx, bullet.vy) || 1;
                    bullet.x = toX + (bullet.vx / speed) * 0.9;
                    bullet.y = toY + (bullet.vy / speed) * 0.9;
                    bullet.warpT = this.time + 0.35;
                    if (bullet.boom) {
                      bullet.back = true;
                    }
                    if (Math.random() < 0.5) {
                      this.emit("warp", { x: fromX, y: fromY, tx: toX, ty: toY, who: "shot" });
                    }
                  }
            }
        }
      } finally {
        if (coat) {
          for (const pool of mine) pool.life -= dt;
          live = mine.filter((pool) => pool.life > 0);
          this.arena.acid.push(...live);
        }
      }
      if (coat)
        for (const enemy of this.enemies)
          enemy.corrode =
            (natural && !!enemy.corrode) ||
            (!enemy.boss && live.some((pool) => (enemy.x - pool.x) ** 2 + (enemy.y - pool.y) ** 2 < pool.r * pool.r));
    }
    idle(dt) {
      this.updatePickups(dt);
      for (let bullet of this.eb) bullet.life = 0;
      this.sweep();
    }
    updatePlayer(dt, input) {
      let player = this.player,
        stats = this.stats;
      input = input || {};
      player.iT = Math.max(0, player.iT - dt);
      player.dashCdT = Math.max(0, player.dashCdT - dt);
      // 3.0.0: gadget recharge, one charge at a time
      if (player.gadgetN < stats.gadgetMax && this.state === "fight") {
        player.gadgetT -= dt;
        if (player.gadgetT <= 0) {
          player.gadgetN++;
          player.gadgetT = player.gadgetN < stats.gadgetMax ? stats.gadgetCd : 0;
          this.emit("gadgetReady", { n: player.gadgetN });
        }
      }
      player.hurtT = Math.max(0, player.hurtT - dt);
      if (player.rushT > 0) {
        player.rushT -= dt;
        if (player.rushT <= 0) {
          player.rushN = 0;
        }
      }
      if (stats.shieldCd > 0 && !player.shield) {
        player.shieldT += dt;
        if (player.shieldT >= stats.shieldCd) {
          player.shield = true;
          player.shieldT = 0;
          this.emit("shieldUp");
        }
      }
      if (stats.regen > 0 && player.hp < stats.maxHp) {
        player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt);
      }
      let mx = +input.mx || 0,
        my = +input.my || 0,
        len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      player.moving = len > 0.08;
      if (input.dash && player.dashCdT <= 0 && player.dashT <= 0) {
        let dx = mx,
          dy = my;
        if (Math.hypot(dx, dy) < 0.2) {
          dx = Math.cos(player.face);
          dy = Math.sin(player.face);
        }
        let norm = Math.hypot(dx, dy) || 1;
        player.dashX = dx / norm;
        player.dashY = dy / norm;
        player.dashT = 0.17;
        player.dashCdT = stats.dashCd;
        player.dashAt = this.time;
        player.dashId++;
        this.runStats.dashes++;
        player.iT = Math.max(player.iT, 0.24);
        if (stats.chrono) {
          this.chronoT = 1.5;
        }
        this.emit("dash", { x: player.x, y: player.y, a: Math.atan2(player.dashY, player.dashX) });
      }
      if (player.dashT > 0) {
        player.dashT -= dt;
        player.vx = player.dashX * 28;
        player.vy = player.dashY * 28;
        if (stats.shockDash) {
          this.dashHits();
        }
        if (stats.trail) {
          player.trailT -= dt;
          if (player.trailT <= 0) {
            player.trailT = 0.025;
            if (this.trails.length < 80) {
              this.trails.push({ x: player.x, y: player.y, life: 1.4 });
            }
          }
        }
      } else {
        let onIce = this.arena.ice.length && this.arena.onIce(player.x, player.y);
        player.onIce = !!onIce;
        if (player.slowT > 0) {
          player.slowT -= dt;
        }
        // 2.4.0: a biome can set its own floor grip (Cryo Vault: the whole floor is slick)
        let grip = dampFactor(onIce ? 2.4 : this.arena.biome.grip || 16, dt),
          speed = stats.speed * (onIce ? 1.12 : 1) * (player.slowT > 0 ? 0.65 : 1);
        player.vx += (mx * speed - player.vx) * grip;
        player.vy += (my * speed - player.vy) * grip;
      }
      const x0 = player.x,
        y0 = player.y;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      this.arena.resolve(player, player.r);
      // 3.17.0: the walker: footsteps and the landing after a dash
      walkStep(this, x0, y0, dt);
      if (player.moving && player.dashT <= 0) {
        player.face = turnToward(player.face, Math.atan2(my, mx), 14 * dt);
      }
      let manual = !!input.aim && Math.hypot(+input.ax || 0, +input.ay || 0) > 0.2,
        aim = null;
      if (manual) {
        aim = Math.atan2(input.ay, input.ax);
        if (input.assist !== false) {
          aim = this.assistAim(aim);
        }
        player.target = null;
      } else {
        let target = this.pickTarget();
        player.target = target;
        if (target) {
          aim = Math.atan2(target.y - player.y, target.x - player.x);
        }
      }
      let firing = manual || (!!input.fire && aim != null) || (!!input.auto && aim != null && player.target != null);
      if (aim != null) {
        player.aim = turnToward(player.aim, aim, 30 * dt);
      } else {
        if (player.moving) {
          player.aim = turnToward(player.aim, player.face, 8 * dt);
        }
      }
      player.firing = firing;
      player.manual = manual;
      let rate = stats.weapon.rate * stats.rateMul * (1 + (stats.bloodrush ? 0.04 * player.rushN : 0));
      player.fireT -= dt;
      if (firing && aim != null) {
        let shots = 0;
        for (; player.fireT <= 0 && shots < 3; ) {
          this.fire(aim);
          player.fireT += 1 / rate;
          shots++;
        }
        if (player.fireT < 0) {
          player.fireT = 0;
        }
      } else {
        if (player.fireT < 0) {
          player.fireT = 0;
        }
      }
      if (input.nova) {
        this.nova();
      }
      if (input.gadget) {
        this.useGadget(input);
      }
    }
    // 2.8.0: shots stop at walls (only the Lance slug flies through), so nothing behind a wall is a target
    shotsCrossWalls() {
      return !!(this.stats.lance && this.stats.weapon.rail);
    }
    canSee(enemy) {
      return this.shotsCrossWalls() || this.arena.los(this.player.x, this.player.y, enemy.x, enemy.y, 0.15);
    }
    assistAim(angle) {
      let player = this.player,
        best = null,
        bestErr = 0.22,
        range = this.stats.range + 2;
      for (let enemy of this.enemies) {
        if (enemy.dead || enemy.ghost) continue;
        let dx = enemy.x - player.x,
          dy = enemy.y - player.y,
          dist = Math.hypot(dx, dy);
        if (dist > range) continue;
        let err = Math.abs(angleDiff(angle, Math.atan2(dy, dx))),
          cone = Math.min(0.35, 0.12 + Math.atan2(enemy.r, dist));
        if (err < cone && err < bestErr + (0.05 * dist) / range && this.canSee(enemy)) {
          best = enemy;
          bestErr = err;
        }
      }
      return best ? Math.atan2(best.y - player.y, best.x - player.x) : angle;
    }
    // 2.8.0: smarter auto-aim. Enemies behind a wall are skipped (the shots would only hit the
    // wall); close enemies come first, rushers that explode or ram you even more so; enemies that
    // are immune right now (shield phase) only when nothing else is in reach; the current target is
    // kept while it is still a good one, so the aim does not flicker between two similar enemies.
    pickTarget() {
      let player = this.player,
        range = this.stats.range + 2.5,
        best = null,
        bestScore = 1 / 0;
      for (let enemy of this.enemies) {
        if (enemy.dead || enemy.spawnT > 0.2 || enemy.ghost) continue;
        let dist = Math.hypot(enemy.x - player.x, enemy.y - player.y) - enemy.r;
        if (dist > range || !this.canSee(enemy)) continue;
        let score = dist;
        if (dist < 4) score *= 0.6;
        else if (dist < 7 && RL_RUSHERS.has(enemy.type)) score *= 0.75;
        if (enemy.shielded) score += 12;
        if (enemy === player.target) score *= 0.8;
        if (score < bestScore) {
          bestScore = score;
          best = enemy;
        }
      }
      return best;
    }
    fire(angle) {
      const stats = this.stats;
      // one volley; 2.1 Echo fires a second one. 2.8.1: only the main volley counts as a shot for Overload
      // and Overdrive (an Echo volley used to shift both counters and could itself be heavy)
      const volley = (aim, echo = false) => {
        let player = this.player,
          weapon = stats.weapon,
          count = weapon.count + (weapon.cone ? stats.extra * 2 : stats.extra),
          muzzle = 0.75,
          originX = player.x + Math.cos(aim) * muzzle,
          originY = player.y + Math.sin(aim) * muzzle;
        if (!echo) player.shotN = (player.shotN || 0) + 1;
        let heavy = !echo && stats.overdrive && player.shotN % 6 === 0,
          shoot = (dir, mul) => {
            if (this.pb.length >= MAX_PLAYER_BULLETS) return;
            let spread = (this.rng.next() - 0.5) * 2 * weapon.spread,
              heading = dir + spread,
              speed = weapon.speed * stats.velMul * (weapon.cone ? 0.85 + this.rng.next() * 0.3 : 1),
              bullet = {
                id: this.nextId++,
                x: originX,
                y: originY,
                vx: Math.cos(heading) * speed,
                vy: Math.sin(heading) * speed,
                a: heading,
                r: weapon.r * stats.sizeMul,
                dmg: weapon.dmg * stats.dmgMul * mul,
                life: weapon.life * (weapon.cone ? 0.85 + this.rng.next() * 0.3 : 1),
                pierce: stats.lance && weapon.rail ? 999 : stats.pierce,
                bounce: weapon.boomerang ? 0 : stats.bounce,
                hits: [],
                w: weapon.id,
                age: 0,
                homing: stats.homing,
              };
            if (heavy && mul >= 1) {
              bullet.dmg *= 2;
              bullet.r *= 2;
              bullet.pierce += 2;
              bullet.vx *= 1.2;
              bullet.vy *= 1.2;
              bullet.heavy = true;
            }
            if (weapon.boomerang) {
              bullet.boom = true;
              bullet.turn = weapon.life * 0.5;
              bullet.life = 4;
              bullet.sp = speed;
              bullet.spin = 0;
            }
            if (weapon.drag) {
              bullet.drag = weapon.drag;
              bullet.grow = weapon.grow;
            }
            this.pb.push(bullet);
          };
        if (weapon.cone) {
          let arc = weapon.cone + stats.extra * 0.08;
          for (let i = 0; i < count; i++) shoot(aim - arc / 2 + (arc * (i + 0.5)) / count, 1);
        } else for (let i = 0; i < count; i++) shoot(aim + (i - (count - 1) / 2) * weapon.fan, 1);
        if (stats.rear >= 1) {
          shoot(aim + Math.PI, 0.6);
        }
        if (stats.rear >= 2) {
          shoot(aim + Math.PI / 2, 0.6);
          shoot(aim - Math.PI / 2, 0.6);
        }
        this.emit("shot", { w: weapon.id, x: originX, y: originY, a: aim, heavy: heavy });
      };
      // 2.5.0 A: Slipstream: the shots after a dash hit harder
      const boost = stats.slip > 0 && this.player.slipT > 0,
        dmg = stats.dmgMul;
      if (boost) stats.dmgMul = dmg * (1 + 0.25 * stats.slip);
      try {
        // 2.1: Overload (every 5th shot bursts at the muzzle) and Echo (a chance of a second volley)
        volley(angle);
        if (this.state !== "fight" || !this.player.alive) return;
        const shot = this.player.shotN || 0;
        if (stats.overload > 0 && shot > 0 && shot % 5 === 0)
          this.explode(
            this.player.x + Math.cos(angle) * 0.9,
            this.player.y + Math.sin(angle) * 0.9,
            1.6,
            45 + 15 * stats.overload,
            { enemies: true, knock: 2, kind: "overload" },
          );
        if (stats.echo > 0 && this.rng.chance(Math.min(0.28, 0.08 * stats.echo))) {
          volley(angle + this.rng.range(-0.035, 0.035), true);
        }
      } finally {
        if (boost) stats.dmgMul = dmg;
      }
    }
    dashHits() {
      let player = this.player;
      this.hash.query(player.x, player.y, 1.1, (enemy) => {
        if (
          !(
            enemy.dead ||
            enemy.dashHit === player.dashId ||
            Math.hypot(enemy.x - player.x, enemy.y - player.y) > enemy.r + 1.1
          )
        ) {
          enemy.dashHit = player.dashId;
          this.hurtEnemy(enemy, this.stats.shockDash * this.stats.dmgMul, player.dashX, player.dashY, 6, false, "dash");
          this.emit("zap", { x: enemy.x, y: enemy.y });
        }
      });
    }
    // 3.12.0: the Singularity replaced the grenade ("you gotta get so close until they actually fly into the enemies
    // that you'll basically always have defeated them already"). It flies fast and far: where the player aims
    // (manual aim, 11 m) or at the densest group in sight within 16 m, never into a wall. Where it lands it opens a
    // small rift that pulls the enemies around it together for 1.5 s (bosses stand, elites and big ones are pulled
    // less), then collapses in a blast (damage to enemies only, no friendly fire).
    singularityTarget(input) {
      const player = this.player;
      let angle = player.aim,
        dist = 9;
      if (input.aim && (input.ax || input.ay)) {
        angle = Math.atan2(input.ay, input.ax);
        dist = 11;
      } else {
        const near = [];
        for (const enemy of this.enemies) {
          if (enemy.dead || enemy.ghost || near.length >= 60) continue;
          if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < 16 && this.canSee(enemy)) near.push(enemy);
        }
        let best = null,
          bestScore = -1e9;
        for (const enemy of near) {
          let crowd = 0;
          // the pull gathers a wider group than the grenade's blast reached, so the crowd counts within 4.5 m
          for (const other of near) if (Math.hypot(other.x - enemy.x, other.y - enemy.y) < 4.5) crowd++;
          const score = crowd * 10 - Math.hypot(enemy.x - player.x, enemy.y - player.y) * 0.2 + (enemy.elite ? 4 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = enemy;
          }
        }
        if (best) {
          angle = Math.atan2(best.y - player.y, best.x - player.x);
          dist = Math.hypot(best.x - player.x, best.y - player.y);
        }
      }
      const reach = this.arena.rayLen(player.x, player.y, angle, dist);
      dist = Math.max(1.5, Math.min(dist, reach - 0.4));
      return { x: player.x + Math.cos(angle) * dist, y: player.y + Math.sin(angle) * dist, dist };
    }
    useGadget(input) {
      const player = this.player,
        stats = this.stats;
      if (!player.alive || this.state !== "fight") return false;
      if (player.gadgetN <= 0) {
        this.emit("gadgetDeny");
        return false;
      }
      const target = this.singularityTarget(input),
        dur = 0.16 + target.dist * 0.022;
      player.gadgetN--;
      if (player.gadgetT <= 0) player.gadgetT = stats.gadgetCd;
      this.singularities.push({ fx: player.x, fy: player.y, tx: target.x, ty: target.y, t: 0, dur, pullT: -1 });
      this.emit("singularity", { x: player.x, y: player.y, tx: target.x, ty: target.y, dur });
      return true;
    }
    updateSingularities(dt) {
      if (!this.singularities.length) return;
      const stats = this.stats,
        radius = stats.gadgetR,
        pullR = radius * SING_PULL_RADIUS;
      for (const sing of this.singularities) {
        sing.t += dt;
        if (sing.t < sing.dur) continue;
        if (sing.pullT < 0) {
          sing.pullT = 0;
          sing.r = pullR;
          this.emit("singOpen", { x: sing.tx, y: sing.ty, r: pullR, dur: SING_PULL_TIME });
        }
        sing.pullT += dt;
        if (sing.pullT < SING_PULL_TIME) {
          // the pull grows over the first half second, fades near the middle (no jitter) and towards the rim
          const ramp = Math.min(1, sing.pullT / 0.5);
          this.hash.query(sing.tx, sing.ty, pullR, (enemy) => {
            if (enemy.dead || enemy.boss || enemy.ghost) return;
            const dx = sing.tx - enemy.x,
              dy = sing.ty - enemy.y,
              d = Math.hypot(dx, dy);
            if (d > pullR + enemy.r || d < 0.35) return;
            const mass = (1 / (0.6 + enemy.r * enemy.r * 1.6)) * (enemy.elite ? 0.6 : 1),
              falloff = Math.min(1, d / 1.2) * (1 - 0.35 * Math.min(1, d / pullR)),
              push = SING_PULL * ramp * falloff * mass * dt;
            enemy.kx += (dx / d) * push;
            enemy.ky += (dy / d) * push;
            // caught in the rift: an enemy walks slower while it is pulled (else a brute walked out of it)
            enemy.slowT = Math.max(enemy.slowT, 0.1);
          });
          continue;
        }
        sing.done = true;
        const dmg = SING_DAMAGE * stats.dmgMul * stats.gadgetDmg;
        this.explode(sing.tx, sing.ty, radius, dmg, {
          enemies: true,
          knock: 2.5,
          kind: "singularity",
          burn: stats.gadgetFire ? dmg * 0.15 : 0,
        });
        // 3.16.0: Searing Collapse leaves burning ground for 3 s that keeps the enemies in it alight (boss-cards.js
        // updates it with the slag of the Crucible Hammer, the view draws it as fire)
        if (stats.gadgetFire)
          this.slag.push({
            id: this.nextId++,
            x: sing.tx,
            y: sing.ty,
            r: radius * 0.7,
            life: 3,
            fire: true,
            dps: dmg * 0.1,
          });
        // the collapse rattles what it does not kill: enemies in it are slowed for a moment
        this.hash.query(sing.tx, sing.ty, radius, (enemy) => {
          if (!enemy.dead && !enemy.boss && Math.hypot(enemy.x - sing.tx, enemy.y - sing.ty) < radius + enemy.r)
            enemy.slowT = Math.max(enemy.slowT, 1.2);
        });
      }
      this.singularities = this.singularities.filter((sing) => !sing.done);
    }
    nova() {
      let player = this.player,
        stats = this.stats;
      if (player.nova < 100 || !player.alive || this.state !== "fight") return;
      player.nova = 0;
      player.iT = Math.max(player.iT, 0.5);
      // 3.15.0: with Event Collapse the blast comes after the pull (boss-cards.js)
      if (bossCardNova(this, stats.novaR)) return;
      novaBlast(this, stats.novaR);
    }
    // 2.8.0: raw charge (Overcharge per-kill bonus) is not scaled by the charge rate, so the card text holds
    addNova(amount, raw = false) {
      let player = this.player,
        before = player.nova;
      player.nova = Math.min(100, player.nova + amount * (raw ? 1 : this.stats.novaMul));
      if (before < 100 && player.nova >= 100) {
        this.emit("novaReady");
      }
    }
    /* 3.21.0: the last twelve hits of the run for the recap on the end screen; the ticks of a hazard (acid, lava) that
       follow each other within 1.5 s are one entry */
    logHit(src, dmg, chip) {
      const key = src || "?",
        log = this.hitLog,
        last = log[log.length - 1];
      this.takenBy[key] = (this.takenBy[key] || 0) + dmg;
      if (chip && last && last.chip && last.src === key && this.time - last.t < 1.5) {
        last.dmg += dmg;
        last.t = this.time;
        last.n++;
        return;
      }
      log.push({ t: this.time, wave: this.wave, src: key, dmg, chip: !!chip, n: 1 });
      if (log.length > 12) log.shift();
    }
    hurtPlayer(dmg, srcX, srcY, src, chip = false) {
      // 2.5.0 B: no damage while the Emergency Shield barrier is up
      if (this.barrierT > 0 && this.player.alive && this.state === "fight") return false;
      const stats = this.stats,
        player = this.player;
      // Last Stand: less damage below 35% hull. 2.4.2: the 1-damage floor only applies to hits that
      // did at least 1 before. Small hazard ticks (acid with high resistance) used to be raised to 1.
      if (player.hp <= stats.maxHp * 0.35 && stats.laststand > 0)
        dmg = Math.min(dmg, Math.max(1, dmg * (1 - stats.laststand)));
      // 2.3.5: Armor Core absorbs part of the damage from enemies (not lava and acid)
      const armor = Math.min(0.5, stats.armor || 0);
      if (armor > 0 && !RL_HAZARD_SRC.has(src)) dmg = dmg * (1 - armor);
      let hpBefore = player.hp,
        hit;
      if (!player.alive || (!chip && player.iT > 0) || player.dashT > 0 || this.state !== "fight" || this.god)
        hit = false;
      else if (player.shield && !chip) {
        player.shield = false;
        player.shieldT = 0;
        player.iT = 0.6;
        this.emit("shieldBreak", { x: player.x, y: player.y });
        hit = false;
      } else if (chip && !(dmg = rlChipDamage(player, dmg))) {
        // 3.7.1: a hazard tick that does not add up to a whole point yet is no hit (no sound, shake or flash)
        hit = false;
      } else {
        dmg = Math.round(dmg);
        player.hp -= dmg;
        this.runStats.dmgTaken += Math.min(dmg, hpBefore);
        this.lastHit = src || null;
        this.logHit(src, dmg, chip);
        if (this.dmgBy) {
          this.dmgBy[src || "?"] = (this.dmgBy[src || "?"] || 0) + dmg;
        }
        if (!chip) {
          player.iT = 0.65;
          player.hurtT = 0.3;
        }
        this.waveDmg += dmg;
        if (srcX != null && !chip) {
          let dx = player.x - srcX,
            dy = player.y - srcY,
            dist = Math.hypot(dx, dy) || 1;
          player.vx += (dx / dist) * 7;
          player.vy += (dy / dist) * 7;
        }
        this.emit("hurt", { dmg: dmg, x: player.x, y: player.y, sx: srcX, sy: srcY, chip: chip });
        if (player.hp <= 0) {
          if ((this.ws.revive || 0) > 0 && !this.revived) {
            this.revived = true;
            player.hp = Math.round(this.stats.maxHp * 0.5);
            player.iT = 2.2;
            player.nova = 100;
            this.nova();
            this.emit("revive", { x: player.x, y: player.y });
          } else {
            player.hp = 0;
            player.alive = false;
            this.state = "dead";
            this.stateT = 0;
            this.emit("die", { x: player.x, y: player.y });
          }
        }
        hit = true;
      }
      if (hit && player.alive) {
        // 2.5.0 A: Heat Sink: lava and acid damage (after Hazmat) heat the drone up
        if (stats.heatSink && (src === "lava" || src === "shock" || src === "acid")) {
          player.heatT = RL_HEAT_TIME;
          this.addNova(3 * stats.heatSink);
        }
        // 2.5.0 A: Reactive Plating: a real hit (not a hazard tick) pushes everything nearby away
        if (stats.reactive && !chip && !this._rlReacting) {
          const radius = 3 + 0.6 * (stats.reactive - 1);
          this._rlReacting = true;
          try {
            this.explode(player.x, player.y, radius, (45 + 25 * (stats.reactive - 1)) * stats.dmgMul, {
              enemies: true,
              knock: 10,
              kind: "reactive",
            });
          } finally {
            this._rlReacting = false;
          }
          for (const bullet of this.eb)
            if (bullet.life > 0 && Math.hypot(bullet.x - player.x, bullet.y - player.y) < radius * 1.2) {
              bullet.life = 0;
              this.emit("pop", { x: bullet.x, y: bullet.y });
            }
        }
      }
      // 2.5.0 B: Emergency Shield: once per wave below 30% hull, a short barrier and some repair
      if (
        hit &&
        stats.barrierT > 0 &&
        !this.barrierUsed &&
        player.alive &&
        this.state === "fight" &&
        player.hp > 0 &&
        player.hp < stats.maxHp * 0.3
      ) {
        this.barrierUsed = true;
        this.barrierT = stats.barrierT;
        player.hp = Math.min(stats.maxHp, player.hp + Math.round(stats.maxHp * stats.barrierHeal));
        this.barrierOwnShield = !player.shield;
        player.shield = true;
        this.emit("barrier", { x: player.x, y: player.y, t: stats.barrierT });
        this.emit("heal", { x: player.x, y: player.y });
      }
      return hit;
    }
    spawnEnemy(type, x, y, opts = {}) {
      let def = enemyDefs[type],
        elite = !!opts.elite,
        hp = def.hp * this.hpMul * (elite ? 3.2 : 1) * (opts.hpF || 1),
        enemy = {
          id: this.nextId++,
          type: type,
          def: def,
          x: x,
          y: y,
          vx: 0,
          vy: 0,
          kx: 0,
          ky: 0,
          r: def.r * (elite ? 1.3 : 1),
          hp: hp,
          maxHp: hp,
          speed: def.speed * (elite ? 1.12 : 1) * (0.92 + this.rng.next() * 0.16),
          dmg: def.dmg * this.dmgMul * (elite ? 1.3 : 1),
          face: Math.atan2(this.player.y - y, this.player.x - x),
          elite: elite,
          boss: false,
          age: 0,
          st: 0,
          t: this.rng.range(0.5, 2),
          t2: 0,
          ta: 0,
          flash: 0,
          spawnT: 0.35,
          slowT: 0,
          burnT: 0,
          burnDps: 0,
          burnAcc: 0,
          burnShow: 0,
          orbAt: null,
          dashHit: 0,
          dead: false,
          los: true,
          losT: this.rng.next() * 0.25,
          parent: opts.parent || 0,
          kids: 0,
          phase: this.rng.next() * TAU,
          noDrop: !!opts.noDrop,
          affix: null,
          shield: 0,
          shieldMax: 0,
        };
      if (opts.champion) {
        enemy.champion = true;
        enemy.maxHp = enemy.hp = hp * 2.2;
        enemy.r *= 1.3;
        enemy.speed *= 0.9;
        enemy.dmg *= 1.2;
        enemy.spawnT = 0.8;
      }
      let variant = biomeVariants[this.arena.biome.id];
      if (
        variant &&
        variant.types.includes(type) &&
        !opts.champion &&
        !opts.noVariant &&
        this.wave >= 3 &&
        this.rng.chance(0.35)
      ) {
        enemy.variant = variant.id;
      }
      if (type === "bulwark") {
        enemy.guard = enemy.guardMax = enemy.hp * 0.9;
        enemy.guardDown = 0;
        enemy.guardFlash = 0;
      }
      if (elite && this.wave >= 10 && type !== "mite" && !opts.champion) {
        enemy.affix = this.rng.pick(["shielded", "hasted", "volatile"]);
        if (enemy.affix === "shielded") {
          enemy.shield = enemy.shieldMax = hp * 0.45;
        }
        if (enemy.affix === "hasted") {
          enemy.speed *= 1.35;
        }
      }
      // 3.3.0: the Endless mutators (a hash of the enemy decides, so the wave's random stream stays the same)
      const mods = this.mods;
      if (mods && type !== "mite" && !opts.champion) {
        const roll = (salt) => hashString(this.seed + ":" + salt + ":" + enemy.id) / 4294967296;
        if (!enemy.affix && mods.volatile && roll("vol") < 0.2 * mods.volatile) enemy.affix = "volatile";
        if (!enemy.affix && mods.shielded && roll("shd") < 0.15 * mods.shielded) {
          enemy.affix = "shielded";
          enemy.shield = enemy.shieldMax = hp * 0.45;
        }
        if (mods.hasted) enemy.speed *= 1 + 0.12 * mods.hasted;
      }
      this.enemies.push(enemy);
      return enemy;
    }
    spawnBoss(id) {
      // 2.8.1: an Endless boss starts from the wave-20 hull (it used to start from its own base hull, so the
      // Warden at wave 30 had less than the boss at wave 20) and grows like the regular enemies, plus 10%
      // for every Endless boss so far
      const hpCurve = (wave) => 1 + 0.085 * (wave - 1) + 0.0058 * (wave - 1) * (wave - 1);
      let def = bossDefs[id],
        hp = this.endless
          ? BOSS_SLOT_HP[3] *
            this.tm.boss *
            0.9 *
            (hpCurve(this.wave) / hpCurve(20)) *
            (1 + 0.1 * Math.max(0, Math.floor((this.wave - 20) / 5)))
          : def.hp * this.tm.boss * 0.9 * (1 + (this.wave > 20 ? (this.wave - 20) * 0.08 : 0)),
        arena = this.arena,
        boss = {
          id: this.nextId++,
          type: id,
          def: def,
          x: 0,
          y: -arena.H + 5,
          vx: 0,
          vy: 0,
          kx: 0,
          ky: 0,
          r: def.r,
          hp: hp,
          maxHp: hp,
          speed: def.speed,
          dmg: def.dmg * this.dmgMul,
          face: Math.PI / 2,
          elite: false,
          boss: true,
          age: 0,
          st: 0,
          t: 2.2,
          t2: 0,
          ta: 0,
          flash: 0,
          spawnT: 1.2,
          slowT: 0,
          burnT: 0,
          burnDps: 0,
          burnAcc: 0,
          burnShow: 0,
          orbAt: null,
          dashHit: 0,
          dead: false,
          los: true,
          losT: 0,
          parent: 0,
          kids: 0,
          phase: 0,
          enraged: false,
          noDrop: false,
          pattern: 0,
        };
      if (this.player.y < 0) {
        boss.y = arena.H - 5;
      }
      initBoss(this, boss);
      // 3.3.0: the tier of a boss is the number of bosses before it in this run (wave 5: 0, wave 10: 1 …); a higher
      // tier rests less between its attacks (down to 60 %)
      boss.tier = Math.max(0, Math.floor(this.wave / 5) - 1);
      boss.pace = Math.max(0.6, 1 - 0.08 * boss.tier);
      // and more hull: the bot of the balance bench killed the bosses of waves 5-15 in 16-38 s, before their enrage
      // mattered; +25% per tier, at most twice the hull (the first boss stays as it was)
      this.enemies.push(boss);
      this.boss = boss;
      // 3.24.0: the start of the fight and the damage taken so far (the medal of the kill, see core/medals.js)
      this.bossT0 = this.time;
      this.bossDmg0 = this.runStats.dmgTaken;
      this.emit("boss", { id: id, name: def.name, title: def.title });
      // 2.4.6: in waves 5–20 the hull follows the slot (see bossFor)
      const slot = this.wave / 5 - 1;
      if (boss && !this.endless && this.wave <= 20 && Number.isInteger(slot) && BOSS_SLOT_HP[slot]) {
        const hpScale = BOSS_SLOT_HP[slot] / boss.def.hp;
        boss.hp *= hpScale;
        boss.maxHp *= hpScale;
      }
      const tierHull = Math.min(2, 1 + 0.25 * boss.tier);
      boss.hp *= tierHull;
      boss.maxHp *= tierHull;
      return boss;
    }
    statusTick(enemy, dt) {
      enemy.age += dt;
      if (enemy.spawnT > 0) {
        enemy.spawnT -= dt;
      }
      if (enemy.flash > 0) {
        enemy.flash = Math.max(0, enemy.flash - dt * 7);
      }
      if (enemy.slowT > 0) {
        enemy.slowT -= dt;
      }
      const burning = enemy.burnT > 0;
      if (burning) enemy.burnT -= dt;
      if (burning && !enemy.shielded && !enemy.ghost) {
        let dmg = enemy.burnDps * dt;
        if (enemy.shield > 0) {
          let absorbed = Math.min(enemy.shield, dmg);
          enemy.shield -= absorbed;
          dmg -= absorbed;
          if (enemy.shield <= 0) {
            this.emit("shieldPop", { x: enemy.x, y: enemy.y, r: enemy.r });
          }
        }
        dmg = this.capPhase(enemy, dmg);
        enemy.burnAcc += dmg;
        enemy.burnShow += dt;
        enemy.hp -= dmg;
        this.dmgDealt += dmg;
        this.credit(enemy.burnSrc || "burn", dmg);
        if (enemy.burnShow > 0.5) {
          if (enemy.burnAcc > 0.5) {
            this.emit("dmg", { x: enemy.x, y: enemy.y, v: enemy.burnAcc, burn: true, id: enemy.id });
          }
          enemy.burnAcc = 0;
          enemy.burnShow = 0;
        }
        if (enemy.hp <= 0) {
          this.killEnemy(enemy);
        }
      }
      enemy.losT -= dt;
      if (enemy.losT <= 0) {
        enemy.losT = 0.2 + this.rng.next() * 0.1;
        enemy.los = this.arena.los(enemy.x, enemy.y, this.player.x, this.player.y, 0.2);
      }
    }
    chaseDir(enemy) {
      let player = this.player,
        dx = player.x - enemy.x,
        dy = player.y - enemy.y,
        dist = Math.hypot(dx, dy) || 1;
      this.cdx = dx / dist;
      this.cdy = dy / dist;
      if (enemy.los || dist < 2) return;
      let flow = this.arena.flow,
        cell = flow.idx(enemy.x, enemy.y),
        flowX = flow.dx[cell],
        flowY = flow.dy[cell];
      if (flowX !== 0 || flowY !== 0) {
        this.cdx = flowX;
        this.cdy = flowY;
      }
    }
    moveEnemy(enemy, dt) {
      let mul = (enemy.slowT > 0 ? 0.55 : 1) * (enemy.rallyT > 0 ? 1.2 : 1),
        vx = enemy.vx,
        vy = enemy.vy;
      if (this.arena.ice.length && !enemy.boss && this.arena.onIce(enemy.x, enemy.y)) {
        let grip = dampFactor(2.2, dt);
        enemy.svx = (enemy.svx ?? vx) + (vx - (enemy.svx ?? vx)) * grip;
        enemy.svy = (enemy.svy ?? vy) + (vy - (enemy.svy ?? vy)) * grip;
        vx = enemy.svx;
        vy = enemy.svy;
      } else {
        enemy.svx = vx;
        enemy.svy = vy;
      }
      enemy.x += (vx * mul + enemy.kx) * dt;
      enemy.y += (vy * mul + enemy.ky) * dt;
      let damp = dampFactor(7, dt);
      enemy.kx -= enemy.kx * damp;
      enemy.ky -= enemy.ky * damp;
      enemy.hitWall = this.arena.resolve(enemy, enemy.r);
    }
    separate() {
      let enemies = this.enemies;
      for (let i = 0; i < enemies.length; i++) {
        let enemy = enemies[i];
        if (!enemy.dead) {
          this.hash.query(enemy.x, enemy.y, enemy.r, (other) => {
            if (other === enemy || other.dead || other.id < enemy.id) return;
            let dx = other.x - enemy.x,
              dy = other.y - enemy.y,
              minDist = enemy.r + other.r,
              distSq = dx * dx + dy * dy;
            if (distSq >= minDist * minDist) return;
            let dist = Math.sqrt(distSq) || 0.001,
              push = (minDist - dist) * 0.5,
              massA = enemy.boss ? 20 : enemy.r * enemy.r,
              massB = other.boss ? 20 : other.r * other.r,
              massSum = massA + massB,
              nx = distSq > 1e-6 ? dx / dist : 1,
              ny = distSq > 1e-6 ? dy / dist : 0;
            enemy.x -= nx * push * 2 * (massB / massSum);
            enemy.y -= ny * push * 2 * (massB / massSum);
            other.x += nx * push * 2 * (massA / massSum);
            other.y += ny * push * 2 * (massA / massSum);
          });
        }
      }
      for (let enemy of enemies) {
        if (!enemy.dead) {
          this.arena.resolve(enemy, enemy.r);
        }
      }
    }
    contactDamage() {
      let player = this.player;
      this.hash.query(player.x, player.y, player.r, (enemy) => {
        if (enemy.dead || enemy.spawnT > 0 || enemy.ghost) return;
        let dx = enemy.x - player.x,
          dy = enemy.y - player.y,
          minDist = enemy.r + player.r,
          distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) return;
        let dist = Math.sqrt(distSq) || 0.001;
        if (enemy.boss) {
          player.x -= (dx / dist) * (minDist - dist);
          player.y -= (dy / dist) * (minDist - dist);
          this.arena.resolve(player, player.r);
        } else {
          enemy.x += (dx / dist) * (minDist - dist);
          enemy.y += (dy / dist) * (minDist - dist);
          this.arena.resolve(enemy, enemy.r);
        }
        if (enemy.type === "bomber") return;
        let dmg = enemy.boss
          ? enemy.dmg
          : (enemy.st === 2 && enemy.type === "brute") || (enemy.st === 3 && enemy.type === "striker")
            ? enemy.dmg * 1.4
            : enemy.dmg;
        this.hurtPlayer(dmg, enemy.x, enemy.y, enemy.type);
      });
    }
    hurtEnemy(enemy, dmg, dx, dy, knock, crit, src = "weapon") {
      // Hunter: more damage to elites and bosses
      dmg = dmg * (enemy && (enemy.elite || enemy.boss) ? this.stats.eliteMul || 1 : 1);
      if (!(enemy.dead || dmg <= 0 || enemy.ghost)) {
        if (enemy.shielded) {
          this.emit("ping", { x: enemy.x, y: enemy.y });
          return;
        }
        if (enemy.shield > 0) {
          let absorbed = Math.min(enemy.shield, dmg);
          enemy.shield -= absorbed;
          dmg -= absorbed;
          enemy.flash = 0.6;
          if (enemy.shield <= 0) {
            this.emit("shieldPop", { x: enemy.x, y: enemy.y, r: enemy.r });
          }
          if (dmg <= 0) {
            this.emit("dmg", { x: enemy.x, y: enemy.y, v: absorbed, shield: true, id: enemy.id });
            return;
          }
        }
        if (crit) {
          this.runStats.critHits++;
        }
        if (enemy.corrode && !enemy.boss) {
          dmg *= 1.25;
        }
        // 3.0.0: burst cap (see core/difficulty.js); the Nova and bosses are exempt
        if (!enemy.boss && src !== "nova") {
          const taken = this.burstCap(enemy, dmg);
          if (taken <= 0) {
            enemy.flash = Math.max(enemy.flash, 0.35);
            this.emit("ping", { x: enemy.x, y: enemy.y, resist: true });
            return;
          }
          dmg = taken;
        }
        dmg = this.capPhase(enemy, dmg);
        enemy.hp -= dmg;
        this.dmgDealt += Math.min(dmg, enemy.hp + dmg);
        this.credit(src, Math.min(dmg, enemy.hp + dmg));
        enemy.flash = 1;
        if (knock) {
          let len = Math.hypot(dx, dy) || 1,
            knockMul = enemy.boss ? 0.04 : 1 / (0.6 + enemy.r * enemy.r * 1.6);
          enemy.kx += (dx / len) * knock * knockMul * 2.2;
          enemy.ky += (dy / len) * knock * knockMul * 2.2;
        }
        if (enemy.boss) {
          this.addNova(dmg * 0.045);
        }
        this.emit("dmg", { x: enemy.x, y: enemy.y, v: dmg, crit: crit, id: enemy.id });
        if (enemy.hp <= 0) {
          this.killEnemy(enemy);
        }
      }
    }
    // how much of a hit lands: at most burstFraction(wave) of the enemy's hull per BURST_WINDOW
    burstCap(enemy, dmg) {
      const fraction = burstFraction(this.wave);
      if (fraction >= 1) return dmg;
      if (this.time - (enemy.burstT ?? -9) > BURST_WINDOW) {
        enemy.burstT = this.time;
        enemy.burstD = 0;
      }
      const room = Math.max(0, enemy.maxHp * fraction - enemy.burstD),
        taken = Math.min(dmg, room);
      enemy.burstD += taken;
      return taken;
    }
    capPhase(enemy, dmg) {
      if (!enemy.boss || enemy.type !== "core") return dmg;
      for (let frac of [0.66, 0.33]) {
        let mark = enemy.maxHp * frac;
        if (enemy.hp > mark && enemy.hp - dmg < mark) return Math.max(0, enemy.hp - (mark - 1));
      }
      return dmg;
    }
    credit(src, amount) {
      if (amount > 0) {
        this.dmgSrc[src] = (this.dmgSrc[src] || 0) + amount;
      }
    }
    killEnemy(enemy) {
      if (enemy.dead) return;
      const kills0 = this.kills;
      enemy.dead = true;
      enemy.hp = 0;
      let def = enemy.def;
      // 2.8.1: the adds removed when a boss dies only vanish (no kill count, Nova, Siphon, drops, split,
      // explosions); they used to pay rewards, spawn mites and set off volatile or inferno effects
      if (enemy.cleanup) {
        this.emit("kill", { type: enemy.type, x: enemy.x, y: enemy.y, elite: enemy.elite, boss: false, r: enemy.r });
        return;
      }
      // 2.8.1: after the player died, kills by bullets still in flight, burn or explosions pay nothing
      const alive = this.player.alive;
      if (!enemy.boss && alive) {
        this.kills++;
        if (!enemy.noCombo) {
          this.addCombo();
        }
        this.addNova(2.5 * Math.max(1, def.cost) * (enemy.elite ? 3 : 1));
        if (!enemy.noDrop) bossCardKill(this, enemy);
        let stats = this.stats,
          player = this.player;
        if (stats.siphonCh && this.rng.chance(stats.siphonCh)) {
          player.hp = Math.min(stats.maxHp, player.hp + 4);
          this.emit("heal", { x: player.x, y: player.y, v: 4 });
        }
        if (stats.bloodrush) {
          player.rushN = Math.min(10, player.rushN + 1);
          player.rushT = 4;
        }
        if (!enemy.noDrop) {
          if (stats.bounty && enemy.elite) {
            this.dropShards(player.x, player.y, stats.bounty);
            this.emit("bountyPulse", { x: player.x, y: player.y, amount: stats.bounty });
          }
          if (stats.capacitor) {
            this.addNova(stats.capacitor, true);
          }
        }
      }
      if (!enemy.noDrop && alive) {
        let shards =
          (enemy.boss ? def.shards : def.shards * (enemy.elite ? 4 : 1) * 0.4) *
          (this.event ? waveEvents[this.event].shardMul : 1);
        this.dropShards(enemy.x, enemy.y, shards);
        let hpFrac = this.player.hp / this.stats.maxHp,
          healChance = enemy.boss ? 1 : enemy.elite ? 0.5 : hpFrac < 0.5 ? 0.045 : 0.02;
        if (this.rng.chance(healChance)) {
          this.pickups.push(this.mkPickup("heal", enemy.x, enemy.y, enemy.boss ? 40 : 15));
        }
      }
      this.emit("kill", {
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        elite: enemy.elite,
        boss: enemy.boss,
        r: enemy.r,
      });
      if (enemy.type === "splitter")
        for (let i = 0; i < 3; i++) {
          let angle = (i / 3) * TAU + this.rng.next(),
            mite = this.spawnEnemy("mite", enemy.x + Math.cos(angle) * 0.6, enemy.y + Math.sin(angle) * 0.6, {
              elite: false,
              noDrop: false,
            });
          // 2.8.1: an elite splitter's mites are tougher but not elites themselves (three elite mites paid
          // three elite heal chances, bounties and Nova charges each)
          if (enemy.elite) mite.maxHp = mite.hp = mite.hp * 2;
          mite.spawnT = 0;
          mite.kx = Math.cos(angle) * 6;
          mite.ky = Math.sin(angle) * 6;
        }
      if (this.stats.inferno && enemy.burnT > 0 && !enemy.boss) {
        let burnDps = Math.max(6 * this.stats.dmgMul, enemy.burnDps);
        this.hash.query(enemy.x, enemy.y, 2.4, (other) => {
          if (!(other.dead || other === enemy || Math.hypot(other.x - enemy.x, other.y - enemy.y) > 2.4 + other.r)) {
            other.burnT = Math.max(other.burnT, 3);
            other.burnDps = Math.max(other.burnDps, burnDps);
          }
        });
        this.explode(enemy.x, enemy.y, 2.2, 18 * this.stats.dmgMul, { enemies: true, knock: 2, kind: "inferno" });
      }
      if (enemy.variant === "toxic") {
        this.arena.acid.push({ x: enemy.x, y: enemy.y, r: 1.4, life: 5 });
      }
      if (enemy.champion) {
        this.champion = null;
        this.pickups.push(this.mkPickup("heal", enemy.x, enemy.y, 25));
        this.dropShards(enemy.x, enemy.y, 20);
        this.hash.query(enemy.x, enemy.y, 8, (other) => {
          if (!other.dead && other !== enemy && !other.boss) {
            other.slowT = Math.max(other.slowT, 2.5);
          }
        });
        this.emit("championDown", { x: enemy.x, y: enemy.y, type: enemy.type });
      }
      if (enemy.affix === "volatile") {
        let src = this._src;
        this._src = enemy.type;
        this.hazard({ x: enemy.x, y: enemy.y, r: 2.3, delay: 0.75, dmg: enemy.dmg * 1.1, kind: "volatile" });
        this._src = src;
      }
      if (enemy.type === "bomber" && enemy.st !== 3) {
        this.explode(enemy.x, enemy.y, 2.3, 30 * this.stats.dmgMul, { enemies: true, kind: "pop" });
      }
      if (enemy.parent) {
        let parent = this.enemies.find((other) => other.id === enemy.parent);
        if (parent) {
          parent.kids = Math.max(0, parent.kids - 1);
        }
      }
      if (enemy.boss) {
        if (alive) this.bossKills.push(enemy.type);
        this.boss = null;
        for (let other of this.enemies) {
          if (!other.dead) {
            other.noDrop = true;
            other.noCombo = true;
            other.affix = null;
            other.cleanup = true;
            this.killEnemy(other);
          }
        }
        for (let bullet of this.eb) bullet.life = 0;
        this.beams.length = 0;
        this.hazards.length = 0;
        this.markers = [];
        this.planIdx = this.plan.length;
        this.emit("bossDown", {
          id: enemy.type,
          x: enemy.x,
          y: enemy.y,
          // 3.24.0: how the fight went (null seconds after a resumed run: the start of the fight is not saved)
          secs: this.bossT0 == null ? null : this.time - this.bossT0,
          damage: this.runStats.dmgTaken - (this.bossDmg0 || 0),
        });
      }
      // carriers drop a shard cache, Supply Drop pays shards every 12th kill
      if (enemy.boss || this.kills <= kills0 || !this.player.alive) return;
      if (enemy.type === "carrier" && this.state === "fight" && this.rng.chance(0.55)) {
        const value = rlCacheShards(this, 5 + 3 * (this.stats.cacheBonus || 0)),
          pickup = this.mkPickup("shard", enemy.x, enemy.y, value);
        pickup.vx = 0;
        pickup.vy = 0;
        pickup.cache = true;
        this.pickups.push(pickup);
      }
      if (this.stats.supply && this.kills % 12 === 0) {
        const amount = 2 * this.stats.supply;
        this.dropShards(enemy.x, enemy.y, amount);
        this.emit("supplyDrop", { x: enemy.x, y: enemy.y, amount });
      }
    }
    addCombo() {
      this.combo++;
      this.comboT = 2.2;
      if (this.combo > this.bestCombo) {
        this.bestCombo = this.combo;
      }
      for (let [at, bonus] of comboRewards) {
        if (this.combo === at) {
          this.shards += bonus;
          this.emit("combo", { n: at, bonus: bonus });
        }
      }
      // 2.5.0 A: Combo Surge: longer combos, and every 15th (12th) combo kill sends out a shockwave
      const level = this.stats.surge || 0;
      if (!level) return;
      this.comboT += 0.5 * level;
      const every = level > 1 ? 12 : 15,
        player = this.player;
      if (this.combo % every === 0 && player.alive && this.state === "fight" && !this._rlSurging) {
        const radius = level > 1 ? 4 : 3.5;
        this._rlSurging = true;
        try {
          this.explode(player.x, player.y, radius, (level > 1 ? 90 : 60) * this.stats.dmgMul, {
            enemies: true,
            knock: 8,
            kind: "surge",
          });
        } finally {
          this._rlSurging = false;
        }
        // i: the surge of this combo (its sound climbs with it)
        this.emit("surge", { x: player.x, y: player.y, r: radius, n: this.combo, i: this.combo / every });
      }
    }
    dropShards(x, y, amount) {
      this.shardFrac = (this.shardFrac || 0) + amount - Math.floor(amount);
      amount = Math.floor(amount);
      if (this.shardFrac >= 1) {
        amount += 1;
        this.shardFrac -= 1;
      }
      amount = Math.max(0, Math.round(amount));
      while (amount > 0) {
        let chunk = amount >= 25 ? 25 : amount >= 5 ? 5 : 1;
        amount -= chunk;
        this.pickups.push(this.mkPickup("shard", x, y, chunk));
        if (this.pickups.length > 260) {
          this.pickups[this.pickups.length - 1].v += amount;
          amount = 0;
        }
      }
    }
    mkPickup(kind, x, y, value) {
      let angle = this.rng.next() * TAU,
        speed = 2 + this.rng.next() * 4;
      return {
        kind: kind,
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        v: value,
        t: 0,
        pull: false,
        dead: false,
        id: this.nextId++,
      };
    }
    explode(x, y, radius, dmg, opts = {}) {
      if (opts.enemies) {
        this.hash.query(x, y, radius, (enemy) => {
          if (enemy.dead || Math.hypot(enemy.x - x, enemy.y - y) > radius + enemy.r) return;
          this.hurtEnemy(
            enemy,
            dmg,
            enemy.x - x,
            enemy.y - y,
            opts.knock || 3,
            false,
            blastSources[opts.kind] || "weapon",
          );
          if (opts.burn && !enemy.dead && !enemy.shielded && !enemy.ghost) {
            let burn = enemy.burnT > 0 ? enemy.burnDps : 0;
            enemy.burnT = Math.max(enemy.burnT, 3);
            enemy.burnDps = Math.max(burn, opts.burn);
            enemy.burnSrc = "burn";
          }
        });
      }
      if (opts.player) {
        let player = this.player;
        if (Math.hypot(player.x - x, player.y - y) < radius + player.r) {
          this.hurtPlayer(opts.dmgPlayer || dmg, x, y, opts.src || this._src);
        }
      }
      // 3.10.0: src (who made the blast) lets a shared kind (rain, mortar, stomp) look like its maker
      this.emit("boom", { x: x, y: y, r: radius, kind: opts.kind || "boom", src: opts.src || null });
    }
    chainFrom(from, jumps, dmg, hits, src = "weapon") {
      let cur = from,
        pts = [cur.x, cur.y],
        seen = new Set(hits || []);
      seen.add(from.id);
      for (let i = 0; i < jumps; i++) {
        let next = null,
          best = 5.5;
        this.hash.query(cur.x, cur.y, 5.5, (enemy) => {
          if (enemy.dead || enemy.ghost || seen.has(enemy.id)) return;
          let dist = Math.hypot(enemy.x - cur.x, enemy.y - cur.y) - enemy.r;
          if (dist < best && this.arena.los(cur.x, cur.y, enemy.x, enemy.y)) {
            best = dist;
            next = enemy;
          }
        });
        if (!next) break;
        seen.add(next.id);
        pts.push(next.x, next.y);
        let target = next;
        this.hurtEnemy(target, dmg, target.x - cur.x, target.y - cur.y, 0.5, false, src);
        cur = target;
      }
      if (pts.length > 2) {
        this.emit("chain", { pts: pts });
      }
    }
    updatePBullets(dt) {
      let stats = this.stats,
        arena = this.arena,
        player = this.player;
      for (let bullet of this.pb) {
        if (bullet.life <= 0) continue;
        bullet.life -= dt;
        bullet.age += dt;
        if (bullet.boom) {
          if (!bullet.back && bullet.age >= bullet.turn) {
            bullet.back = true;
            bullet.hits.length = 0;
          }
          if (bullet.back) {
            let dx = player.x - bullet.x,
              dy = player.y - bullet.y,
              dist = Math.hypot(dx, dy) || 0.001;
            if (dist < 0.9 || !player.alive || bullet.age > 4) {
              bullet.life = 0;
              continue;
            }
            let damp = dampFactor(9, dt),
              speed = bullet.sp * 1.15;
            bullet.vx += ((dx / dist) * speed - bullet.vx) * damp;
            bullet.vy += ((dy / dist) * speed - bullet.vy) * damp;
          } else {
            if (bullet.homing > 0 && bullet.age > 0.05) {
              this.home(bullet, dt);
            }
          }
        } else {
          if (bullet.homing > 0 && bullet.age > 0.05) {
            this.home(bullet, dt);
          }
        }
        if (bullet.drag) {
          let keep = 1 - bullet.drag * dt;
          bullet.vx *= keep;
          bullet.vy *= keep;
          bullet.r = Math.min(1.3, bullet.r + bullet.grow * dt);
        }
        let prevX = bullet.x,
          prevY = bullet.y;
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        let hitWall = false,
          travel = Math.hypot(bullet.vx, bullet.vy) * dt,
          steps = travel > 0.4 ? Math.ceil(travel / 0.4) : 1,
          pierceWalls = stats.lance && bullet.w === "rail";
        for (let i = 1; i <= steps; i++) {
          let frac = i / steps,
            sx = prevX + (bullet.x - prevX) * frac,
            sy = prevY + (bullet.y - prevY) * frac;
          if (arena.outside(sx, sy) || (!pierceWalls && arena.blocked(sx, sy, bullet.r * 0.5))) {
            bullet.x = sx;
            bullet.y = sy;
            hitWall = true;
            break;
          }
        }
        if (hitWall) {
          if (bullet.boom && !bullet.back) {
            bullet.back = true;
            bullet.hits.length = 0;
            bullet.x -= bullet.vx * dt;
            bullet.y -= bullet.vy * dt;
            this.emit("spark", { x: bullet.x, y: bullet.y, w: bullet.w });
            continue;
          }
          bullet.life = 0;
          if (
            bullet.bomblet ||
            bullet.w === "rocket" ||
            weaponDefs[bullet.w]?.explode ||
            (stats.payloadR && !bullet.drag)
          ) {
            this.bulletBurst(bullet, null);
          }
          if (!bullet.drag) {
            this.emit("spark", { x: bullet.x, y: bullet.y, w: bullet.w });
          }
          continue;
        }
        let reach = Math.hypot(bullet.vx, bullet.vy) * dt,
          probes = reach > 0.5 ? Math.ceil(reach / 0.5) : 1,
          rail = !!weaponDefs[bullet.w].rail;
        for (let i = 0; i < probes && bullet.life > 0; i++) {
          let frac = probes > 1 ? (i + 1) / probes - 1 : 0,
            sx = bullet.x + bullet.vx * dt * frac,
            sy = bullet.y + bullet.vy * dt * frac;
          this.hash.query(sx, sy, bullet.r + 0.8, (enemy) => {
            if (bullet.life <= 0) return true;
            if (enemy.dead || enemy.spawnT > 0.15 || enemy.ghost) return;
            let dx = enemy.x - sx,
              dy = enemy.y - sy;
            if (enemy.type === "bulwark" && !rail && enemy.guardDown <= 0 && !bullet.hits.includes(enemy.id)) {
              let dist = Math.hypot(dx, dy),
                guardR = enemy.r + 0.75 + bullet.r;
              if (dist < guardR && Math.abs(angleDiff(enemy.face, Math.atan2(-dy, -dx))) < 1.15) {
                let gx = enemy.x + Math.cos(enemy.face) * (enemy.r + 0.45),
                  gy = enemy.y + Math.sin(enemy.face) * (enemy.r + 0.45);
                if (bullet.boom && !bullet.back) {
                  bullet.back = true;
                  bullet.hits.length = 0;
                } else {
                  if (bullet.drag) {
                    bullet.hits.push(enemy.id);
                    if (bullet.pierce-- <= 0) {
                      bullet.life = 0;
                    }
                  } else {
                    bullet.life = 0;
                    if (bullet.w === "rocket" || bullet.bomblet || weaponDefs[bullet.w]?.explode || stats.payloadR) {
                      bullet.x = gx;
                      bullet.y = gy;
                      this.bulletBurst(bullet, null);
                    }
                  }
                }
                enemy.guard -= bullet.dmg;
                enemy.guardFlash = 1;
                if (enemy.guard <= 0) {
                  enemy.guardDown = 4;
                  this.emit("guardBreak", { x: gx, y: gy });
                } else {
                  if (!bullet.drag || this.rng.chance(0.2)) {
                    this.emit("block", { x: gx, y: gy });
                  }
                }
                return true;
              }
            }
            let hitR = enemy.r + bullet.r;
            if (!(dx * dx + dy * dy > hitR * hitR || bullet.hits.includes(enemy.id))) {
              this.bulletHit(bullet, enemy);
            }
          });
        }
      }
    }
    home(bullet, dt) {
      let target = null,
        best = 8,
        heading = Math.atan2(bullet.vy, bullet.vx);
      this.hash.query(bullet.x, bullet.y, 8, (enemy) => {
        if (enemy.dead || enemy.ghost || bullet.hits.includes(enemy.id)) return;
        let dx = enemy.x - bullet.x,
          dy = enemy.y - bullet.y,
          dist = Math.hypot(dx, dy);
        if (!(dist > best || Math.abs(angleDiff(heading, Math.atan2(dy, dx))) > 1.3)) {
          best = dist;
          target = enemy;
        }
      });
      if (!target) return;
      let angle = turnToward(heading, Math.atan2(target.y - bullet.y, target.x - bullet.x), bullet.homing * dt),
        speed = Math.hypot(bullet.vx, bullet.vy);
      bullet.vx = Math.cos(angle) * speed;
      bullet.vy = Math.sin(angle) * speed;
      bullet.a = angle;
    }
    bulletHit(bullet, enemy) {
      let stats = this.stats,
        weapon = weaponDefs[bullet.w],
        crit = this.rng.chance(stats.crit),
        dmg = bullet.dmg * (crit ? stats.critMul : 1);
      bullet.hits.push(enemy.id);
      this.hurtEnemy(
        enemy,
        dmg,
        bullet.vx,
        bullet.vy,
        weapon.knock,
        crit,
        bullet.wing ? "wingman" : bullet.bomblet ? "payload" : "weapon",
      );
      let immune = enemy.shielded || enemy.ghost,
        bounced = false;
      if (stats.cryo && !immune && this.rng.chance(stats.cryo)) {
        enemy.slowT = 2;
        this.emit("freeze", { x: enemy.x, y: enemy.y });
      }
      if (bullet.drag && stats.burn && !enemy.dead && !immune) {
        let burn = enemy.burnT > 0 ? enemy.burnDps : 0;
        enemy.burnT = Math.max(enemy.burnT, 2.5);
        enemy.burnDps = Math.max(burn, stats.burn * stats.burnMul * stats.dmgMul);
        enemy.burnSrc = "burn";
      }
      if (stats.thermite && !enemy.dead && !immune) {
        let burn = enemy.burnT > 0 ? enemy.burnDps : 0;
        enemy.burnT = 3;
        enemy.burnDps = Math.max(burn, dmg * stats.thermite);
        enemy.burnSrc = "burn";
      }
      if (stats.chain) {
        this.chainFrom(enemy, stats.chain, dmg * stats.chainF, bullet.hits);
      }
      if (stats.arc && this.rng.chance(stats.arc * (bullet.drag ? 0.25 : 1))) {
        this.chainFrom(enemy, stats.arcJumps, dmg * 0.6, bullet.hits, "arc");
      }
      if (
        bullet.bomblet ||
        bullet.w === "rocket" ||
        weaponDefs[bullet.w]?.explode ||
        (stats.payloadR && (!bullet.drag || this.rng.chance(0.2)))
      ) {
        this.bulletBurst(bullet, enemy);
      }
      if (bullet.bounce > 0) {
        let next = null,
          best = 8;
        this.hash.query(enemy.x, enemy.y, 8, (other) => {
          if (other.dead || other.ghost || bullet.hits.includes(other.id)) return;
          let dist = Math.hypot(other.x - enemy.x, other.y - enemy.y);
          // 2.8.1: only enemies in sight (it used to bounce into a wall)
          if (dist < best && this.arena.los(enemy.x, enemy.y, other.x, other.y, 0.1)) {
            best = dist;
            next = other;
          }
        });
        if (next) {
          bullet.bounce--;
          let speed = Math.hypot(bullet.vx, bullet.vy),
            angle = Math.atan2(next.y - enemy.y, next.x - enemy.x);
          bullet.x = enemy.x;
          bullet.y = enemy.y;
          bullet.vx = Math.cos(angle) * speed;
          bullet.vy = Math.sin(angle) * speed;
          bullet.a = angle;
          bullet.life = Math.max(bullet.life, 0.35);
          this.emit("bounce", { x: enemy.x, y: enemy.y });
          bounced = true;
        }
      }
      if (!bounced)
        if (bullet.pierce > 0) bullet.pierce--;
        else bullet.life = 0;
      // 2.5.0 A: Acid Coating: a puddle under the enemy (at most one per enemy every 1.2 s, flames less often)
      if (
        stats.acidCoat > 0 &&
        this.state === "fight" &&
        !enemy.boss &&
        !enemy.shielded &&
        !enemy.ghost &&
        this.time - (enemy.coatAt ?? -9) > 1.2 &&
        this.rng.chance(0.22 * stats.acidCoat * (bullet.drag ? 0.3 : 1))
      ) {
        enemy.coatAt = this.time;
        const acid = this.arena.acid,
          mine = acid.filter((pool) => pool.mine);
        if (mine.length >= RL_COAT_MAX) acid.splice(acid.indexOf(mine[0]), 1);
        const marsh = this.arena.biome.id === "marsh";
        acid.push({ x: enemy.x, y: enemy.y, r: marsh ? 1.5 : 1.1, life: marsh ? 4 : 3, mine: true });
      }
    }
    bulletBurst(bullet, enemy) {
      let stats = this.stats,
        weapon = weaponDefs[bullet.w],
        x = enemy ? enemy.x : bullet.x,
        y = enemy ? enemy.y : bullet.y;
      if (bullet.bomblet) {
        this.explode(x, y, 1.4, bullet.dmg, { enemies: true, knock: 1.5, kind: "payload" });
        return;
      }
      if (weapon?.explode && bullet.w !== "rocket" && !bullet.wing) {
        let dmg = Number.isFinite(weapon.explodeDmg) ? weapon.explodeDmg * stats.dmgMul : bullet.dmg,
          size = stats.sizeMul > 1 ? 1.15 : 1;
        this.explode(x, y, weapon.explode * size, dmg, { enemies: true, knock: 3, kind: bullet.w });
      }
      if (bullet.w === "rocket" && !bullet.wing) {
        let hellfire = stats.hellfire;
        this.explode(
          x,
          y,
          weapon.explode * (stats.sizeMul > 1 ? 1.25 : 1) * (hellfire ? 1.35 : 1),
          weapon.explodeDmg * stats.dmgMul,
          {
            enemies: true,
            knock: 4,
            kind: "rocket",
            burn: hellfire ? weapon.explodeDmg * stats.dmgMul * 0.35 : 0,
          },
        );
      }
      if (stats.payloadR) {
        this.explode(x, y, stats.payloadR, bullet.dmg * stats.payloadF, { enemies: true, knock: 1.5, kind: "payload" });
        if (stats.cluster) {
          this.bomblets(x, y, Math.max(6, bullet.dmg * 0.4));
        }
      }
    }
    bomblets(x, y, dmg) {
      for (let i = 0; i < 2; i++) {
        if (this.pb.length >= MAX_PLAYER_BULLETS) return;
        let angle = this.rng.next() * TAU;
        this.pb.push({
          id: this.nextId++,
          x: x,
          y: y,
          vx: Math.cos(angle) * 11,
          vy: Math.sin(angle) * 11,
          a: angle,
          r: 0.16,
          dmg: dmg,
          life: 0.8,
          pierce: 0,
          bounce: 0,
          hits: [],
          w: "rocket",
          age: 0,
          homing: 6,
          bomblet: true,
        });
      }
    }
    updateEBullets(dt) {
      let player = this.player,
        arena = this.arena;
      for (let bullet of this.eb)
        if (!(bullet.life <= 0)) {
          bullet.life -= dt;
          bullet.age += dt;
          if (bullet.homing && bullet.age > 0.3 && bullet.age < 2.4 && player.alive) {
            let heading = Math.atan2(bullet.vy, bullet.vx),
              speed = Math.hypot(bullet.vx, bullet.vy),
              angle = turnToward(heading, Math.atan2(player.y - bullet.y, player.x - bullet.x), bullet.homing * dt);
            bullet.vx = Math.cos(angle) * speed;
            bullet.vy = Math.sin(angle) * speed;
          }
          if (bullet.accel) {
            bullet.vx *= 1 + bullet.accel * dt;
            bullet.vy *= 1 + bullet.accel * dt;
          }
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          if (
            arena.outside(bullet.x, bullet.y, -0.5) ||
            (bullet.solid !== false && arena.blocked(bullet.x, bullet.y, bullet.r * 0.4))
          ) {
            bullet.life = 0;
            this.emit("pop", { x: bullet.x, y: bullet.y });
            continue;
          }
          if (player.alive) {
            let dx = player.x - bullet.x,
              dy = player.y - bullet.y,
              hitR = player.r * 0.8 + bullet.r;
            if (dx * dx + dy * dy < hitR * hitR && player.iT <= 0 && player.dashT <= 0) {
              bullet.life = 0;
              if (
                this.hurtPlayer(bullet.dmg, bullet.x - bullet.vx * 0.05, bullet.y - bullet.vy * 0.05, bullet.src) &&
                bullet.frost
              ) {
                player.slowT = 1.6;
                player.slowKind = "chill";
                this.emit("chill", { x: player.x, y: player.y });
              }
            }
          }
        }
    }
    shoot(x, y, angle, speed, dmg, opts = {}) {
      if (this.eb.length >= MAX_ENEMY_BULLETS) return null;
      let bullet = {
        x: x,
        y: y,
        vx: Math.cos(angle) * speed * (this.shotMul || 1),
        vy: Math.sin(angle) * speed * (this.shotMul || 1),
        r: opts.r || 0.24,
        dmg: dmg,
        life: opts.life || 5,
        age: 0,
        // 3.16.0: a boss's shots have the shape of their boss unless the attack names its own kind
        kind: opts.kind || BOSS_SHOT[opts.src || this._src] || "orb",
        homing: opts.homing || 0,
        accel: opts.accel || 0,
        solid: opts.solid,
        src: opts.src || this._src,
        frost: this._var === "frost",
      };
      this.eb.push(bullet);
      return bullet;
    }
    updateOrbitals(dt) {
      let count = this.stats.orbit;
      if (!count) return;
      let player = this.player,
        radius = this.stats.orbitR,
        dmg = this.stats.orbitDmg * this.stats.dmgMul,
        size = 0.6 * this.stats.bladeScale;
      for (let i = 0; i < count; i++) {
        let angle = this.time * 3.3 + (i * TAU) / count,
          bx = player.x + Math.cos(angle) * radius,
          by = player.y + Math.sin(angle) * radius;
        // 3.6.0: every blade has its own cooldown on each enemy (orbAt: the time each blade may hit it again). One
        // shared cooldown let the first blade block the others for 0.38 s, so more blades added no damage on big
        // enemies and bosses that touch several blades at once.
        this.hash.query(bx, by, size, (enemy) => {
          if (
            !(
              enemy.dead ||
              (enemy.orbAt && enemy.orbAt[i] > this.time) ||
              enemy.spawnT > 0.1 ||
              Math.hypot(enemy.x - bx, enemy.y - by) > enemy.r + size
            )
          ) {
            (enemy.orbAt || (enemy.orbAt = []))[i] = this.time + 0.38;
            this.hurtEnemy(enemy, dmg, enemy.x - player.x, enemy.y - player.y, 2.5, false, "orbit");
          }
        });
        for (let bullet of this.eb) {
          if (bullet.life > 0 && Math.abs(bullet.x - bx) < 0.7 && Math.abs(bullet.y - by) < 0.7) {
            bullet.life = 0;
            this.emit("pop", { x: bullet.x, y: bullet.y });
          }
        }
      }
    }
    updateWingman(dt) {
      let count = this.stats.wingmen;
      if (!count) return;
      let player = this.player;
      for (; player.wings.length < count; )
        player.wings.push({ x: player.x, y: player.y, t: player.wings.length * 0.2 });
      let damp = dampFactor(6, dt);
      for (let i = 0; i < count; i++) {
        let wing = player.wings[i],
          offset = [2.3, -2.3, 1.3, -1.3][i] ?? 2.3,
          tx = player.x + Math.cos(player.aim + offset) * 1.5,
          ty = player.y + Math.sin(player.aim + offset) * 1.5;
        wing.x += (tx - wing.x) * damp;
        wing.y += (ty - wing.y) * damp;
        wing.t -= dt;
        if (wing.t > 0) continue;
        let target = null,
          best = 13;
        for (let enemy of this.enemies) {
          if (enemy.dead || enemy.spawnT > 0.2 || enemy.ghost) continue;
          let dist = Math.hypot(enemy.x - wing.x, enemy.y - wing.y) + (enemy.los ? 0 : 7);
          if (dist < best) {
            best = dist;
            target = enemy;
          }
        }
        if (!target) continue;
        wing.t = this.stats.wingman > 1 ? 0.3 : 0.5;
        let angle = Math.atan2(target.y - wing.y, target.x - wing.x),
          spread = this.stats.wingSpread;
        for (let j = 0; j < spread && !(this.pb.length >= MAX_PLAYER_BULLETS); j++) {
          let shotAngle = angle + (j - (spread - 1) / 2) * 0.16;
          this.pb.push({
            id: this.nextId++,
            x: wing.x,
            y: wing.y,
            vx: Math.cos(shotAngle) * 30,
            vy: Math.sin(shotAngle) * 30,
            a: shotAngle,
            r: 0.14,
            dmg: 9 * this.stats.dmgMul,
            life: 0.5,
            pierce: 0,
            bounce: 0,
            hits: [],
            w: "pulse",
            age: 0,
            homing: 0,
            wing: true,
          });
        }
        this.emit("wingShot", { x: wing.x, y: wing.y, a: angle });
      }
    }
    updateTrails(dt) {
      if (!this.trails.length) return;
      let dmg = 7 * this.stats.dmgMul;
      for (let trail of this.trails) {
        trail.life -= dt;
        this.hash.query(trail.x, trail.y, 0.8, (enemy) => {
          if (
            !(
              enemy.dead ||
              enemy.trailT > this.time ||
              Math.hypot(enemy.x - trail.x, enemy.y - trail.y) > enemy.r + 0.8
            )
          ) {
            enemy.trailT = this.time + 0.25;
            this.hurtEnemy(enemy, dmg, 0, 0, 0, false, "trail");
          }
        });
      }
      this.trails = this.trails.filter((trail) => trail.life > 0);
    }
    updateBeams(dt) {
      let player = this.player;
      for (let beam of this.beams) {
        beam.t += dt;
        if (beam.rot) {
          beam.a += beam.rot * dt;
        }
        if (beam.follow) {
          beam.x = beam.follow.x;
          beam.y = beam.follow.y;
          if (beam.follow.dead) {
            beam.t = 999;
          }
        }
        beam.live = beam.t >= beam.warn && beam.t < beam.warn + beam.dur;
        beam.cur = this.arena.rayLen(beam.x, beam.y, beam.a, beam.len);
        if (beam.live && player.alive) {
          let endX = beam.x + Math.cos(beam.a) * beam.cur,
            endY = beam.y + Math.sin(beam.a) * beam.cur,
            dx = endX - beam.x,
            dy = endY - beam.y,
            lenSq = dx * dx + dy * dy,
            along = ((player.x - beam.x) * dx + (player.y - beam.y) * dy) / lenSq;
          along = clamp(along, 0, 1);
          let cx = beam.x + dx * along,
            cy = beam.y + dy * along,
            hitR = beam.w * 0.5 + player.r * 0.7;
          if ((player.x - cx) ** 2 + (player.y - cy) ** 2 < hitR * hitR) {
            this.hurtPlayer(beam.dmg, cx, cy, beam.src);
          }
        }
      }
      this.beams = this.beams.filter((beam) => beam.t < beam.warn + beam.dur);
    }
    beam(opts) {
      let beam = {
        x: opts.x,
        y: opts.y,
        a: opts.a,
        len: opts.len || 30,
        cur: opts.len || 30,
        w: opts.w || 0.8,
        warn: opts.warn ?? 0.8,
        dur: opts.dur ?? 0.5,
        t: 0,
        rot: opts.rot || 0,
        dmg: opts.dmg || 20,
        follow: opts.follow || null,
        live: false,
        color: opts.color || 0,
        skin: opts.skin || null, // 3.0.0: trap beams name their skin (laser, flame, rift)
        src: this._src,
      };
      this.beams.push(beam);
      return beam;
    }
    hazard(opts) {
      let hazard = {
        x: opts.x,
        y: opts.y,
        r: opts.r,
        delay: opts.delay ?? 1,
        t: 0,
        dmg: opts.dmg || 20,
        kind: opts.kind || "stomp",
        done: false,
        src: this._src,
        sx: opts.sx,
        sy: opts.sy,
      };
      this.hazards.push(hazard);
      return hazard;
    }
    updateHazards(dt) {
      // 2.4.6: the Frost Prism's Glacier zones chill the player they catch (slower for 1.6 s, like a
      // frost shot). A dash through the zone avoids it, as it avoids the hit.
      let cold = null;
      for (const hazard of this.hazards) {
        if (hazard.kind === "glacier" && !hazard.done) {
          (cold || (cold = [])).push(hazard);
        }
      }
      for (let hazard of this.hazards) {
        hazard.t += dt;
        if (!hazard.done && hazard.t >= hazard.delay) {
          hazard.done = true;
          this.explode(hazard.x, hazard.y, hazard.r, 0, {
            player: true,
            dmgPlayer: hazard.dmg,
            kind: hazard.kind,
            src: hazard.src,
          });
        }
      }
      this.hazards = this.hazards.filter((hazard) => hazard.t < hazard.delay + 0.4);
      if (!cold) return;
      const player = this.player;
      for (const hazard of cold) {
        if (
          hazard.done &&
          player.alive &&
          player.dashT <= 0 &&
          this.state === "fight" &&
          Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.r + player.r
        ) {
          player.slowT = Math.max(player.slowT, 1.6);
          player.slowKind = "chill";
          this.emit("chill", { x: player.x, y: player.y });
        }
      }
    }
    updatePickups(dt) {
      let player = this.player,
        stats = this.stats,
        vacuum =
          this.state !== "fight" ||
          (this.enemies.length === 0 && this.planIdx >= this.plan.length && !this.bossPending),
        magnet = stats.magnet;
      for (let pickup of this.pickups) {
        if (pickup.dead) continue;
        pickup.t += dt;
        let dx = player.x - pickup.x,
          dy = player.y - pickup.y,
          dist = Math.hypot(dx, dy) || 0.001,
          skip = pickup.kind === "heal" && player.hp >= stats.maxHp - 0.5 && this.state === "fight";
        if (skip && pickup.pull && !vacuum) {
          pickup.pull = false;
        }
        if (!skip && !pickup.pull && pickup.t > 0.35 && (dist < magnet || vacuum)) {
          pickup.pull = true;
        }
        if (pickup.pull && (player.alive || this.state !== "dead")) {
          let speed = 9 + pickup.t * 10 + (vacuum ? 14 : 0);
          pickup.vx += ((dx / dist) * speed - pickup.vx) * dampFactor(9, dt);
          pickup.vy += ((dy / dist) * speed - pickup.vy) * dampFactor(9, dt);
        } else {
          pickup.vx *= 1 - dampFactor(4, dt);
          pickup.vy *= 1 - dampFactor(4, dt);
        }
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
        if (!pickup.pull) {
          this.arena.resolve(pickup, 0.2);
        }
        if (dist < player.r + 0.35 && player.alive && !skip) {
          pickup.dead = true;
          if (pickup.kind === "shard") {
            this.shards += pickup.v;
            this.emit("shard", { v: pickup.v });
          } else if (pickup.kind === "heal") {
            let before = player.hp;
            player.hp = Math.min(stats.maxHp, player.hp + pickup.v);
            this.emit("heal", { x: player.x, y: player.y, v: Math.round(player.hp - before) });
          }
        }
        if (pickup.kind === "heal" && pickup.t > 14 && !pickup.pull) {
          pickup.dead = true;
        }
      }
    }
    updateMarkers(dt) {
      for (let marker of this.markers) {
        marker.t += dt;
        if (!marker.fake && marker.t >= marker.dur && !marker.done) {
          marker.done = true;
          let enemy = this.spawnEnemy(marker.type, marker.x, marker.y, {
            elite: marker.elite,
            champion: marker.champion,
          });
          if (marker.champion) {
            this.champion = enemy;
            this.emit("champion", { type: marker.type, x: marker.x, y: marker.y });
          }
          this.emit("spawn", { x: marker.x, y: marker.y, type: marker.type, elite: marker.elite });
          enemy.face = Math.atan2(this.player.y - marker.y, this.player.x - marker.x);
        }
      }
      this.markers = this.markers.filter((marker) => !marker.done);
    }
    updateSpawns(dt) {
      if (this.planIdx >= this.plan.length && !this.bossPending && !this.boss && this.enemies.length <= 4) {
        this.stragglerT += dt;
        if (this.stragglerT > 9) for (let enemy of this.enemies) enemy.hunt = true;
      } else this.stragglerT = 0;
      if (this.bossPending && this.waveT > 1.6) {
        let id = this.bossPending;
        this.bossPending = null;
        this.spawnBoss(id);
      }
      if (this.championPending && this.waveT > 5 && !this.hold) {
        let spot = this.arena.freePoint(this.rng, this.player.x, this.player.y, 9, 1.6);
        this.markers.push({
          x: spot.x,
          y: spot.y,
          t: 0,
          dur: 1.6,
          type: this.championPending,
          elite: true,
          champion: true,
          done: false,
        });
        this.championPending = null;
      }
      if (this.planIdx >= this.plan.length || this.hold) return;
      this.groupT -= dt;
      let crowd = this.enemies.length + this.markers.length,
        cap = Math.min(70, 26 + Math.round(this.wave * 2.5));
      if (this.groupT > 0 || crowd >= cap) return;
      let group = this.plan[this.planIdx++];
      this.groupT = group.gap;
      let player = this.player,
        portal = this.arena.freePoint(this.rng, player.x, player.y, 8.5, 1.2),
        placed = [];
      for (let i = 0; i < group.members.length; i++) {
        let spawnX = portal.x,
          spawnY = portal.y,
          angle = this.rng.next() * TAU + i * 2.399963;
        for (let j = 0; j < 12; j++) {
          let dist =
              0.55 +
              Math.min(1.7, 1 + group.members.length * 0.12) * Math.sqrt((i + 0.6) / Math.max(1, group.members.length)),
            dir = angle + this.rng.range(-0.35, 0.35),
            tryX = portal.x + Math.cos(dir) * dist,
            tryY = portal.y + Math.sin(dir) * dist;
          if (
            !this.arena.blocked(tryX, tryY, 0.8) &&
            !this.arena.outside(tryX, tryY, 1) &&
            !this.arena.featureBlocked(tryX, tryY, 0.25) &&
            Math.hypot(tryX - player.x, tryY - player.y) >= 6.5 &&
            placed.every((other) => Math.hypot(tryX - other.x, tryY - other.y) >= 0.9)
          ) {
            spawnX = tryX;
            spawnY = tryY;
            break;
          }
        }
        placed.push({ x: spawnX, y: spawnY });
        this.markers.push({
          x: spawnX,
          y: spawnY,
          t: 0,
          dur: 0.95,
          type: group.members[i].type,
          elite: group.members[i].elite,
          done: false,
        });
      }
      this.emit("portal", { x: portal.x, y: portal.y, n: group.members.length });
    }
    sweep() {
      if (this.enemies.some((enemy) => enemy.dead)) {
        this.enemies = this.enemies.filter((enemy) => !enemy.dead);
      }
      if (this.pb.some((bullet) => bullet.life <= 0)) {
        this.pb = this.pb.filter((bullet) => bullet.life > 0);
      }
      if (this.eb.some((bullet) => bullet.life <= 0)) {
        this.eb = this.eb.filter((bullet) => bullet.life > 0);
      }
      if (this.pickups.some((pickup) => pickup.dead)) {
        this.pickups = this.pickups.filter((pickup) => !pickup.dead);
      }
    }
    checkWaveEnd() {
      if (this.state === "fight") {
        if (
          this.planIdx >= this.plan.length &&
          !this.bossPending &&
          !this.championPending &&
          this.enemies.length === 0 &&
          this.markers.length === 0 &&
          this.waveT > 1.8
        ) {
          this.state = "cleared";
          this.stateT = 0;
          if (this.waveDmg === 0 && this.wave >= 8) {
            this.flawless++;
          }
          let boss = !!this.bossFor(this.wave);
          if (boss) {
            let player = this.player;
            player.hp = Math.min(this.stats.maxHp, player.hp + this.stats.maxHp * 0.3);
          }
          this.offerBoss = boss;
          this.emit("cleared", { n: this.wave, boss: boss, flawless: this.waveDmg === 0 });
        }
      } else if (this.state === "cleared" && ((this.stateT > 1.6 && this.pickups.length === 0) || this.stateT > 3.5)) {
        for (let pickup of this.pickups) {
          if (pickup.kind === "shard") {
            this.shards += pickup.v;
          }
        }
        this.pickups.length = 0;
        // 3.12.0: a Singularity still pulling when the wave ends (it lasts up to 2 s, the cleared phase can be 1.6 s)
        // would hang over the upgrade choice, which does not step it; its enemies are gone, so it simply ends
        this.singularities = [];
        // 3.15.0: the same for the cages, slag, splinters and a Nova still pulling (the larvae stay with the drone)
        resetBossCards(this);
        if (this.isFinalWave()) {
          this.state = "victory";
          this.stateT = 0;
          this.emit("victory");
        } else {
          this.beginChoice();
        }
      }
    }
    // 2.5.0 C: set up the biome event of this wave (extra hazards, Meltdown timing, Bloom and Storm state)
    startBiomeEvent(id, wave) {
      const arena = this.arena,
        player = this.player,
        rng = makeRng(hashString(this.seed + ":biome-event:" + id + ":" + wave)),
        avoid = [{ x: player.x, y: player.y, r: 3.5 }],
        // the extra sheets of a Whiteout are smaller, so they still fit between the wave's big ones
        add = (kind, count, size) => {
          for (let k = 0; k < count * 3 && count > 0; k++) {
            if (rlAddHazard250(arena, kind, rng, arena.obs, arena.W, arena.H, { avoid, cap: 9, size, tries: 60 })) {
              count--;
            }
          }
        };
      arena.rlEvent = id;
      if (id === "meltdown") {
        add("vents", 3);
        // all vents in step: idle at the start, the first warning 0.7 s into the wave, then every 3.4 s
        const period = RL_MELTDOWN_PERIOD,
          phase = 0;
        for (const vent of arena.vents) {
          vent.period = period;
          vent.phase = phase;
          vent.st = "idle";
        }
      } else if (id === "blackout") {
        // three more manholes; they arc in a chain (one after another, ordered around the centre), every 4.8 s
        add("vents", 3);
        const vents = arena.vents.slice().sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)),
          period = 4.8;
        vents.forEach((vent, i) => {
          vent.period = period;
          // a higher phase arcs sooner; every manhole is idle when the wave starts (cycle < warning at 2.1 s)
          vent.phase = ((vents.length - 1 - i) / vents.length) * 1.9;
          vent.st = "idle";
        });
      } else if (id === "whiteout") add("ice", 3, [1.7, 2.5]);
      else if (id === "bloom") {
        for (const pool of arena.acid) {
          if (pool.life == null) {
            pool.grow = {
              r0: pool.r,
              to: rlHazardRoom250(arena, pool, pool.r * RL_BLOOM_GROW),
              t0: 0,
              dur: RL_BLOOM_GROW_T,
            };
          }
        }
        this.bioEv = { id, t: 0, next: RL_BLOOM_EVERY, n: 0, rng };
      } else if (id === "riftstorm") this.bioEv = { id, t: 0, next: RL_STORM_EVERY, rng };
    }
    // 2.5.0 C: Spore Bloom and Rift Storm over the wave (from updateFeatures)
    tickBiomeEvent(event, dt) {
      const arena = this.arena,
        player = this.player;
      event.t += dt;
      if (event.id === "bloom") {
        for (const pool of arena.acid) {
          if (pool.grow) {
            pool.r =
              pool.grow.r0 + (pool.grow.to - pool.grow.r0) * clamp((event.t - pool.grow.t0) / pool.grow.dur, 0, 1);
          }
        }
        if (event.t >= event.next && event.n < 4) {
          event.next += RL_BLOOM_EVERY;
          // not on the player, not on an enemy about to spawn
          const avoid = [
              { x: player.x, y: player.y, r: 4 },
              ...this.markers.map((marker) => ({ x: marker.x, y: marker.y, r: 1.2 })),
            ],
            pool = rlAddHazard250(arena, "acid", event.rng, arena.obs, arena.W, arena.H, {
              avoid,
              cap: 10,
              size: [1.6, 2.3],
              tries: 90,
            });
          if (pool) {
            event.n++;
            pool.grow = { r0: 0.3, to: pool.r, t0: event.t, dur: 2.5 };
            pool.r = 0.3;
            this.emit("hatch", { x: pool.x, y: pool.y, big: true });
          }
        }
      } else if (event.id === "riftstorm" && arena.portals.length) {
        if (!event.planned && event.t >= event.next - RL_STORM_WARN) {
          event.planned = true;
          const next = { portals: [] };
          for (const portal of arena.portals) {
            const avoid = [
                { x: player.x, y: player.y, r: 3.5 },
                { x: portal.ax, y: portal.ay, r: 3 },
                { x: portal.bx, y: portal.by, r: 3 },
              ],
              pair = rlPortalPair250(event.rng, arena.obs, arena.W, arena.H, next, { avoid });
            portal.next = pair;
            if (pair) {
              next.portals.push(pair);
              this.emit("blinkWarn", { x: pair.ax, y: pair.ay });
            }
          }
        }
        for (const portal of arena.portals) {
          if (portal.next) {
            portal.moveIn = Math.max(0, event.next - event.t);
          }
        }
        if (event.t >= event.next) {
          event.next += RL_STORM_EVERY;
          event.planned = false;
          for (const portal of arena.portals) {
            const dest = portal.next;
            if (!dest) continue;
            // the new spots must still be clear of the player (it may have walked there)
            if (
              Math.hypot(player.x - dest.ax, player.y - dest.ay) > 1.6 &&
              Math.hypot(player.x - dest.bx, player.y - dest.by) > 1.6
            ) {
              this.emit("blink", { x: portal.ax, y: portal.ay, small: true, phase: true });
              portal.ax = dest.ax;
              portal.ay = dest.ay;
              portal.bx = dest.bx;
              portal.by = dest.by;
              this.emit("blink", { x: portal.ax, y: portal.ay, small: true, phase: true });
              this.emit("blink", { x: portal.bx, y: portal.by, small: true, phase: true });
            }
            portal.next = null;
            portal.moveIn = 0;
          }
        }
      }
    }
  };

export { World, rlStep };
