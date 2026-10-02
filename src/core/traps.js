// 3.0.0: traps. From wave 6 the arena itself fights back: floor strikes, sweeping beams and mines, each
// with a skin that belongs to the biome (a security laser in Blackout City, piston crushers in Ember Works, ice
// spikes in Cryo Vault, acid geysers and spore pods in Toxin Marsh, rift beams and rift mines in the
// Void). The three families share their mechanics, so the skins only change numbers, colours and one side
// effect (chill, acid puddle, knock-back). Everything is announced first (a warning ring or line), hurts
// the player and, as a share of their hull, the enemies too, and grows with the wave; in Endless there are
// more of them, they come faster, warn shorter and some of the floor strikes hunt the player.
//
// The world keeps them in `world.traps` (plain objects, for the renderer) and calls
// rlPlanTraps once per wave and rlUpdateTraps every step. Placement uses its own random stream
// (seed + wave), so it never disturbs the world's.

import { makeRng, hashString, TAU, clamp } from "./util.js";

// skins: family, base damage (times the enemies' damage multiplier), radius, warning, pause, side effect
const TRAP_SKINS = {
  laser: { fam: "beam", dmg: 16, w: 0.8, len: 26, warn: 1.1, dur: 2.0, rot: 0.5, cd: 3.6 },
  flame: { fam: "beam", dmg: 20, w: 1.5, len: 12, warn: 1.0, dur: 1.6, rot: 0.7, cd: 3.2 },
  rift: { fam: "beam", dmg: 18, w: 1.1, len: 22, warn: 1.2, dur: 2.4, rot: -0.4, cd: 3.8 },
  plate: { fam: "floor", dmg: 22, r: 2.2, warn: 1.0, cd: 4.2, special: "shock", frac: 0.1 },
  crusher: { fam: "floor", dmg: 30, r: 2.6, warn: 1.0, cd: 4.6, special: "quake", frac: 0.14 },
  icespike: { fam: "floor", dmg: 24, r: 2.2, warn: 1.0, cd: 4.2, special: "chill", frac: 0.1 },
  geyser: { fam: "floor", dmg: 20, r: 2.0, warn: 1.0, cd: 4.0, special: "acid", frac: 0.1 },
  riftburst: { fam: "floor", dmg: 24, r: 2.4, warn: 1.0, cd: 4.2, special: "shock", frac: 0.1 },
  mine: { fam: "mine", dmg: 30, r: 2.6, trig: 1.5, arm: 1.5, fuse: 0.45, frac: 0.18 },
  frost: { fam: "mine", dmg: 22, r: 3.0, trig: 1.5, arm: 1.5, fuse: 0.45, special: "chill", frac: 0.12 },
  spore: { fam: "mine", dmg: 18, r: 3.0, trig: 1.5, arm: 1.5, fuse: 0.45, special: "acid", frac: 0.1 },
  riftmine: { fam: "mine", dmg: 26, r: 2.8, trig: 1.5, arm: 1.5, fuse: 0.45, frac: 0.15 },
};
// which skin each biome uses for each family (a biome can lack a family)
const BIOME_TRAPS = {
  yard: { floor: "plate", beam: "laser", mine: "mine" },
  works: { floor: "crusher", beam: "flame" },
  vault: { floor: "icespike", mine: "frost" },
  marsh: { floor: "geyser", mine: "spore" },
  void: { floor: "riftburst", beam: "rift", mine: "riftmine" },
};
// first wave of each family, and the number of traps per family on a wave
const TRAP_FROM = { floor: 6, beam: 9, mine: 12 };
function trapCount(fam, wave) {
  if (wave < TRAP_FROM[fam]) return 0;
  const late = wave - TRAP_FROM[fam];
  let count =
    fam === "floor" ? 1 + Math.floor(late / 6) : fam === "beam" ? 1 + Math.floor(late / 14) : 2 + Math.floor(late / 5);
  // Endless (past the twentieth wave): half as many more, and the wave still adds on top
  if (wave > 20) count = Math.ceil(count * 1.5) + Math.floor(Math.max(0, wave - 40) / 20);
  return Math.min(count, fam === "floor" ? 9 : fam === "beam" ? 4 : 12);
}
// endless pace: pauses 20% shorter, warnings 15% shorter (never below 0.7 s); 3.3.0: the Trap Storm mutator takes
// another 12% off the pauses per level
const pace = (wave, storm = 0) => (wave > 20 ? { cd: 0.8 * (1 - 0.12 * storm), warn: 0.85 } : { cd: 1, warn: 1 });

function rlPlanTraps(world, wave, boss) {
  const traps = [];
  // 3.3.0: boss waves get floor traps from wave 15 on (half as many), so the later boss fights are fought on a
  // dangerous floor too
  if ((boss && wave < 15) || wave < 6) return traps;
  const biome = world.arena.biome.id,
    skins = BIOME_TRAPS[biome];
  if (!skins) return traps;
  const rng = makeRng(hashString(world.seed + ":traps:" + wave)),
    arena = world.arena,
    taken = [];
  let nextId = 1;
  const place = (pad) => {
    for (let k = 0; k < 60; k++) {
      const x = rng.range(-arena.W + 3, arena.W - 3),
        y = rng.range(-arena.H + 3, arena.H - 3);
      if (arena.blocked(x, y, pad + 0.6) || arena.featureBlocked(x, y, pad * 0.3)) continue;
      // not on the start area, and apart from each other
      if (Math.hypot(x, y - 2) < 6.5) continue;
      if (taken.some((spot) => Math.hypot(x - spot.x, y - spot.y) < 4.5)) continue;
      taken.push({ x, y });
      return { x, y };
    }
    return null;
  };
  const storm = (world.mods && world.mods.trapstorm) || 0;
  for (const fam of boss ? ["floor"] : ["floor", "beam", "mine"]) {
    const skinName = skins[fam];
    if (!skinName) continue;
    const skin = TRAP_SKINS[skinName],
      base = trapCount(fam, wave) + (base0(fam, wave) ? storm : 0),
      count = boss ? Math.ceil(base / 2) : base;
    for (let i = 0; i < count; i++) {
      const spot = place(skin.r || 1.2);
      if (!spot) break;
      const trap = {
        id: nextId++,
        fam,
        skin: skinName,
        x: spot.x,
        y: spot.y,
        r: skin.r || skin.w,
        st: fam === "mine" ? "unarmed" : "idle",
        // the first strike comes late and staggered, so a wave never starts with a hit
        t: 0,
        wait: 3 + rng.next() * 3 + i * 0.9,
        hunt: fam === "floor" && wave >= 40 && i % 2 === 1,
        a: rng.next() * TAU,
        dir: rng.chance(0.5) ? 1 : -1,
      };
      traps.push(trap);
    }
  }
  return traps;
}

// a family that is in play at this wave (the Trap Storm adds to those only)
const base0 = (fam, wave) => wave >= TRAP_FROM[fam];

// damage of a trap on the player: its base times the wave's enemy damage multiplier
const trapDamage = (world, skin) => skin.dmg * world.dmgMul;

function trapEffectsOnPlayer(world, skin, trap) {
  const player = world.player;
  if (skin.special === "chill" || skin.special === "shock") {
    player.slowT = Math.max(player.slowT, skin.special === "chill" ? 1.6 : 0.8);
    world.emit("chill", { x: player.x, y: player.y });
  }
}

// an area strike: the player, and every enemy as a share of its hull
function trapStrike(world, trap, skin, radius) {
  const player = world.player;
  world._src = "trap";
  if (player.alive && Math.hypot(player.x - trap.x, player.y - trap.y) < radius + player.r) {
    world.hurtPlayer(trapDamage(world, skin), trap.x, trap.y, "trap");
    trapEffectsOnPlayer(world, skin, trap);
  }
  world.hash.query(trap.x, trap.y, radius, (enemy) => {
    if (enemy.dead || enemy.boss || Math.hypot(enemy.x - trap.x, enemy.y - trap.y) > radius + enemy.r) return;
    world.hurtEnemy(
      enemy,
      enemy.maxHp * skin.frac,
      enemy.x - trap.x,
      enemy.y - trap.y,
      skin.special === "quake" ? 9 : 3,
      false,
      "trap",
    );
    if (skin.special === "chill") enemy.slowT = Math.max(enemy.slowT, 1.6);
  });
  // the acid puddle stays off a spot where an enemy is about to appear (spawns keep away from hazards)
  if (
    skin.special === "acid" &&
    !world.markers.some((marker) => Math.hypot(marker.x - trap.x, marker.y - trap.y) < radius * 0.85 + 0.8)
  )
    world.arena.acid.push({ x: trap.x, y: trap.y, r: radius * 0.85, life: 7 });
  world.emit("boom", { x: trap.x, y: trap.y, r: radius, kind: "trap" });
  world.emit("trapFire", { id: trap.id, fam: trap.fam, skin: trap.skin, x: trap.x, y: trap.y, r: radius });
}

function rlUpdateTraps(world, dt) {
  if (!world.traps.length || world.state !== "fight") return;
  const p = pace(world.wave, (world.mods && world.mods.trapstorm) || 0),
    player = world.player;
  for (const trap of world.traps) {
    const skin = TRAP_SKINS[trap.skin];
    trap.t += dt;
    if (trap.fam === "floor") {
      if (trap.st === "idle" && trap.t >= trap.wait) {
        // a hunting strike aims at where the player is going
        if (trap.hunt && player.alive) {
          trap.x = clamp(player.x + player.vx * 0.5, -world.arena.W + 2, world.arena.W - 2);
          trap.y = clamp(player.y + player.vy * 0.5, -world.arena.H + 2, world.arena.H - 2);
        }
        trap.st = "warn";
        trap.t = 0;
        trap.delay = Math.max(0.7, skin.warn * p.warn);
        world.emit("trapWarn", {
          id: trap.id,
          fam: "floor",
          skin: trap.skin,
          x: trap.x,
          y: trap.y,
          r: skin.r,
          delay: trap.delay,
        });
      } else if (trap.st === "warn" && trap.t >= trap.delay) {
        trapStrike(world, trap, skin, skin.r);
        trap.st = "idle";
        trap.t = 0;
        trap.wait = skin.cd * p.cd * (0.85 + 0.3 * ((trap.id * 0.618) % 1));
      }
    } else if (trap.fam === "beam") {
      if (trap.st === "idle" && trap.t >= trap.wait) {
        trap.st = "live";
        trap.t = 0;
        const warn = Math.max(0.7, skin.warn * p.warn);
        world._src = "trap";
        world.beam({
          skin: trap.skin,
          x: trap.x,
          y: trap.y,
          a: trap.a,
          len: skin.len,
          w: skin.w,
          warn,
          dur: skin.dur,
          rot: skin.rot * trap.dir,
          dmg: trapDamage(world, skin),
        });
        // Endless: a second beam crosses the first
        if (world.wave > 20)
          world.beam({
            skin: trap.skin,
            x: trap.x,
            y: trap.y,
            a: trap.a + Math.PI / 2,
            len: skin.len,
            w: skin.w,
            warn,
            dur: skin.dur,
            rot: skin.rot * trap.dir,
            dmg: trapDamage(world, skin),
          });
        trap.span = warn + skin.dur;
        world.emit("trapWarn", {
          id: trap.id,
          fam: "beam",
          skin: trap.skin,
          x: trap.x,
          y: trap.y,
          a: trap.a,
          len: skin.len,
          delay: warn,
          dur: skin.dur,
        });
      } else if (trap.st === "live" && trap.t >= trap.span) {
        trap.st = "idle";
        trap.t = 0;
        trap.a += 0.9 * trap.dir;
        trap.wait = skin.cd * p.cd;
      }
    } else if (trap.fam === "mine") {
      if (trap.st === "unarmed" && trap.t >= skin.arm) {
        trap.st = "armed";
        trap.t = 0;
        world.emit("trapArm", { id: trap.id, fam: "mine", skin: trap.skin, x: trap.x, y: trap.y, r: skin.r });
      } else if (trap.st === "armed") {
        // the player or any enemy walking in sets it off
        let set = player.alive && Math.hypot(player.x - trap.x, player.y - trap.y) < skin.trig;
        if (!set)
          world.hash.query(trap.x, trap.y, skin.trig, (enemy) => {
            if (!set && !enemy.dead && !enemy.boss && Math.hypot(enemy.x - trap.x, enemy.y - trap.y) < skin.trig * 0.8)
              set = true;
          });
        if (set) {
          trap.st = "fuse";
          trap.t = 0;
          world.emit("trapWarn", {
            id: trap.id,
            fam: "mine",
            skin: trap.skin,
            x: trap.x,
            y: trap.y,
            r: skin.r,
            delay: skin.fuse,
          });
        }
      } else if (trap.st === "fuse" && trap.t >= skin.fuse) {
        trapStrike(world, trap, skin, skin.r);
        trap.st = "gone";
        trap.t = 0;
        // re-armed somewhere else after a pause (shorter in Endless)
        trap.respawn = (world.wave > 20 ? 9 : 14) + trap.id * 0.7;
      } else if (trap.st === "gone" && trap.t >= trap.respawn) {
        const spot = rlPlaceAgain(world, trap);
        if (spot) {
          trap.x = spot.x;
          trap.y = spot.y;
        }
        trap.st = "unarmed";
        trap.t = 0;
      }
    }
  }
}
// a new place for a mine: random, off obstacles and the start area, away from the player
function rlPlaceAgain(world, trap) {
  const arena = world.arena,
    rng = makeRng(hashString(world.seed + ":mine:" + world.wave + ":" + trap.id + ":" + Math.floor(world.time)));
  for (let k = 0; k < 30; k++) {
    const x = rng.range(-arena.W + 3, arena.W - 3),
      y = rng.range(-arena.H + 3, arena.H - 3);
    if (arena.blocked(x, y, 1.6) || arena.featureBlocked(x, y, 0.5)) continue;
    if (Math.hypot(x - world.player.x, y - world.player.y) < 6) continue;
    return { x, y };
  }
  return null;
}

export { TRAP_SKINS, BIOME_TRAPS, TRAP_FROM, trapCount, rlPlanTraps, rlUpdateTraps };
