// Enemy and boss behaviour (mu, vu) and enemy variants.

import { clamp, TAU, turnToward } from "./util.js";

/* ---- stragglers: when only a few enemies are left for 9 s the game sets
 enemy.hunt so they come to the player. The 2.1/2.2 ranged enemies ignored
 it and could kite forever (the last Beacon fleeing into a corner). ---- */
const RL_KITERS = new Set(["turret", "minebot", "sapper", "sentinel", "carrier", "drone", "beacon", "weaver"]);
function updateEnemyCore(game, enemy, dt) {
  if (enemy.spawnT > 0) {
    enemy.vx = 0;
    enemy.vy = 0;
    return;
  }
  let player = game.player,
    dx = player.x - enemy.x,
    dy = player.y - enemy.y,
    dist = Math.hypot(dx, dy) || 0.001,
    ang = Math.atan2(dy, dx);
  game.chaseDir(enemy);
  let cdx = game.cdx,
    cdy = game.cdy,
    speed = enemy.speed,
    alive = player.alive;
  if (
    enemy.hunt &&
    (enemy.type === "gunner" ||
      enemy.type === "sniper" ||
      enemy.type === "hive" ||
      enemy.type === "mortar" ||
      enemy.type === "mender")
  ) {
    enemy.st = 0;
    enemy.vx = cdx * Math.max(speed, 2.6) * 1.3;
    enemy.vy = cdy * Math.max(speed, 2.6) * 1.3;
    enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 8 * dt);
    return;
  }
  switch (enemy.type) {
    case "swarmer":
    case "mite": {
      let wobble = Math.sin(enemy.age * 6 + enemy.phase) * 0.45;
      enemy.vx = (cdx - cdy * wobble) * speed;
      enemy.vy = (cdy + cdx * wobble) * speed;
      break;
    }
    case "grunt":
    case "splitter":
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
      break;
    case "gunner": {
      if (enemy.st === 0) {
        if (dist > 11 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else if (dist < 6.5) {
          enemy.vx = (-dx / dist) * speed * 0.8;
          enemy.vy = (-dy / dist) * speed * 0.8;
        } else {
          let side = Math.sin(enemy.phase) > 0 ? 1 : -1;
          enemy.vx = (-dy / dist) * side * speed * 0.55;
          enemy.vy = (dx / dist) * side * speed * 0.55;
        }
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 15 && alive) {
          enemy.st = 1;
          enemy.t2 = 0.45;
          game.emit("charge", { x: enemy.x, y: enemy.y, type: enemy.type });
        }
      } else {
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          let shots = enemy.elite ? 3 : 1,
            shotSpeed = 8.2 + game.wave * 0.06;
          for (let k = 0; k < shots; k++)
            game.shoot(enemy.x, enemy.y, ang + (k - (shots - 1) / 2) * 0.2, shotSpeed, enemy.dmg);
          game.emit("eshot", { x: enemy.x, y: enemy.y, type: "gunner" });
          enemy.st = 0;
          enemy.t = 2.2 + game.rng.next() * 0.9;
        }
      }
      enemy.face = turnToward(enemy.face, ang, 8 * dt);
      return;
    }
    case "bomber": {
      if (enemy.st === 0) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
        if (dist < 1.9 + player.r && alive) {
          enemy.st = 1;
          enemy.t2 = 0.55;
          game.emit("fuse", { x: enemy.x, y: enemy.y });
        }
      } else {
        if (enemy.st === 1) {
          enemy.vx *= 0.85;
          enemy.vy *= 0.85;
          enemy.t2 -= dt;
          if (enemy.t2 <= 0) {
            enemy.st = 3;
            game.explode(enemy.x, enemy.y, 2.6, 30 * game.stats.dmgMul, {
              enemies: true,
              player: true,
              dmgPlayer: enemy.dmg,
              knock: 5,
              kind: "bomber",
            });
            game.killEnemy(enemy);
          }
        }
      }
      break;
    }
    case "brute": {
      if (enemy.st === 0) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 10 && alive) {
          enemy.st = 1;
          enemy.t2 = 0.8;
          enemy.ta = ang;
          game.emit("charge", { x: enemy.x, y: enemy.y, type: "brute" });
        }
      } else if (enemy.st === 1) {
        enemy.vx = 0;
        enemy.vy = 0;
        if (enemy.t2 > 0.35) {
          enemy.ta = turnToward(enemy.ta, ang, 2.5 * dt);
        }
        enemy.face = turnToward(enemy.face, enemy.ta, 10 * dt);
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 2;
          enemy.t2 = 0.6;
        }
        return;
      } else if (enemy.st === 2) {
        enemy.vx = Math.cos(enemy.ta) * 15;
        enemy.vy = Math.sin(enemy.ta) * 15;
        enemy.face = enemy.ta;
        enemy.t2 -= dt;
        if (enemy.hitWall && enemy.t2 < 0.5) {
          enemy.st = 3;
          enemy.t2 = 0.8;
          game.emit("thud", { x: enemy.x, y: enemy.y });
        } else {
          if (enemy.t2 <= 0) {
            enemy.st = 0;
            enemy.t = 2.8 + game.rng.next() * 1.4;
          }
        }
        return;
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 0;
          enemy.t = 2.5 + game.rng.next();
        }
        return;
      }
      break;
    }
    case "sniper": {
      if (enemy.st === 0) {
        if (dist > 14.5 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else if (dist < 9.5) {
          enemy.vx = (-dx / dist) * speed;
          enemy.vy = (-dy / dist) * speed;
        } else {
          let side = Math.cos(enemy.phase) > 0 ? 1 : -1;
          enemy.vx = (-dy / dist) * side * speed * 0.4;
          enemy.vy = (dx / dist) * side * speed * 0.4;
        }
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 19 && alive) {
          enemy.st = 1;
          enemy.t2 = 1.25;
          enemy.ta = ang;
          game.emit("aim", { x: enemy.x, y: enemy.y });
        }
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
        if (enemy.t2 > 0.35) {
          enemy.ta = turnToward(enemy.ta, ang, 3 * dt);
        }
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          game.shoot(enemy.x + Math.cos(enemy.ta) * 0.7, enemy.y + Math.sin(enemy.ta) * 0.7, enemy.ta, 22, enemy.dmg, {
            kind: "fast",
            r: 0.2,
          });
          game.emit("eshot", { x: enemy.x, y: enemy.y, type: "sniper" });
          enemy.st = 0;
          enemy.t = 3 + game.rng.next() * 1.2;
        }
      }
      enemy.face = turnToward(enemy.face, enemy.st === 1 ? enemy.ta : ang, 8 * dt);
      return;
    }
    case "hive": {
      if (dist > 6 || !enemy.los) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
      } else {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
      }
      enemy.t -= dt;
      let maxKids = enemy.elite ? 7 : 5;
      const spawnNow = enemy.t <= 0;
      if (spawnNow) enemy.t = 3.2;
      if (spawnNow && enemy.kids < maxKids && game.enemies.length < 75) {
        let angle = game.rng.next() * TAU,
          kid = game.spawnEnemy(
            "swarmer",
            enemy.x + Math.cos(angle) * (enemy.r + 0.5),
            enemy.y + Math.sin(angle) * (enemy.r + 0.5),
            {
              parent: enemy.id,
              hpF: 0.8,
            },
          );
        kid.spawnT = 0.15;
        kid.noDrop = game.rng.chance(0.5);
        enemy.kids++;
        game.emit("hatch", { x: enemy.x, y: enemy.y });
      }
      enemy.face += dt * 0.6;
      return;
    }
    case "bulwark": {
      if (enemy.guardFlash > 0) {
        enemy.guardFlash -= dt * 5;
      }
      if (enemy.guardDown > 0) {
        enemy.guardDown -= dt;
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        if (enemy.guardDown <= 0) {
          enemy.guard = enemy.guardMax;
          game.emit("guardUp", { x: enemy.x, y: enemy.y });
        }
        return;
      }
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
      enemy.face = turnToward(enemy.face, ang, 0.95 * dt);
      return;
    }
    case "striker": {
      if (enemy.st === 0) {
        if (dist > 7 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else {
          let side = Math.sin(enemy.phase) > 0 ? 1 : -1;
          enemy.vx = (-dy / dist) * side * speed * 0.6;
          enemy.vy = (dx / dist) * side * speed * 0.6;
        }
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 13 && alive) {
          let away = Math.atan2(enemy.y - player.y, enemy.x - player.x),
            first = game.rng.chance(0.5) ? 1 : -1,
            spot = null;
          for (let side of [first, -first]) {
            let angle = away + side * 1.35,
              sx = player.x + Math.cos(angle) * 3.3,
              sy = player.y + Math.sin(angle) * 3.3;
            if (!game.arena.outside(sx, sy, 1) && !game.arena.blocked(sx, sy, enemy.r + 0.3)) {
              spot = { x: sx, y: sy };
              break;
            }
          }
          if (spot) {
            enemy.st = 1;
            enemy.t2 = 0.7;
            enemy.tx = spot.x;
            enemy.ty = spot.y;
            game.emit("blinkWarn", { x: spot.x, y: spot.y });
          } else {
            enemy.t = 0.8;
          }
        }
        break;
      }
      if (enemy.st === 1) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          game.emit("blink", { x: enemy.x, y: enemy.y, small: true });
          enemy.x = enemy.tx;
          enemy.y = enemy.ty;
          game.arena.resolve(enemy, enemy.r);
          game.emit("blink", { x: enemy.x, y: enemy.y, small: true, in: true });
          enemy.st = 2;
          enemy.t2 = 0.32;
          enemy.ta = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        }
        return;
      }
      if (enemy.st === 2) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.face = turnToward(enemy.face, enemy.ta, 14 * dt);
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 3;
          enemy.t2 = 0.24;
          game.emit("charge", { x: enemy.x, y: enemy.y, type: "striker" });
        }
        return;
      }
      enemy.vx = Math.cos(enemy.ta) * 17;
      enemy.vy = Math.sin(enemy.ta) * 17;
      enemy.face = enemy.ta;
      enemy.t2 -= dt;
      if (enemy.t2 <= 0 || (enemy.hitWall && enemy.t2 < 0.2)) {
        enemy.st = 0;
        enemy.t = 3 + game.rng.next() * 1.5;
      }
      return;
    }
    case "leaper": {
      if (enemy.st === 0) {
        if (dist > 6.5 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else {
          enemy.t -= dt;
          if (enemy.t <= 0 && alive) {
            enemy.st = 1;
            enemy.t2 = 0.55;
            enemy.ta = ang;
            game.emit("charge", { x: enemy.x, y: enemy.y, type: "leaper" });
          }
        }
      } else if (enemy.st === 1) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.ta = turnToward(enemy.ta, ang, 3.8 * dt);
        enemy.face = enemy.ta;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 2;
          enemy.t2 = 0.6;
          enemy.vx = Math.cos(enemy.ta) * 13;
          enemy.vy = Math.sin(enemy.ta) * 13;
          game.emit("blink", { x: enemy.x, y: enemy.y, leap: true });
        }
      } else {
        enemy.t2 -= dt;
        enemy.vx *= 0.975;
        enemy.vy *= 0.975;
        if (enemy.hitWall || enemy.t2 <= 0) {
          enemy.st = 0;
          enemy.t = 2.2 + game.rng.next() * 1.3;
          enemy.hitWall = false;
        }
      }
      enemy.face = turnToward(enemy.face, enemy.st === 1 ? enemy.ta : Math.atan2(enemy.vy, enemy.vx), 10 * dt);
      return;
    }
    case "turret": {
      if (enemy.st === 0) {
        if (dist > 16 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else {
          if (dist < 8) {
            enemy.vx = (-dx / dist) * speed;
            enemy.vy = (-dy / dist) * speed;
          } else {
            enemy.vx *= 0.82;
            enemy.vy *= 0.82;
          }
        }
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 19 && alive) {
          enemy.st = 1;
          enemy.t2 = 0.62;
          enemy.ta = ang;
          game.emit("aim", { x: enemy.x, y: enemy.y, type: "turret" });
        }
      } else {
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        enemy.ta = turnToward(enemy.ta, ang, 2.6 * dt);
        enemy.face = enemy.ta;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          game.shoot(enemy.x + Math.cos(enemy.ta) * 0.7, enemy.y + Math.sin(enemy.ta) * 0.7, enemy.ta, 19, enemy.dmg, {
            kind: "turret",
            r: 0.21,
          });
          if (enemy.elite) {
            game.shoot(
              enemy.x + Math.cos(enemy.ta) * 0.7,
              enemy.y + Math.sin(enemy.ta) * 0.7,
              enemy.ta + (game.rng.chance(0.5) ? 0.12 : -0.12),
              19,
              enemy.dmg * 0.72,
              { kind: "turret", r: 0.18 },
            );
          }
          game.emit("eshot", { x: enemy.x, y: enemy.y, type: "turret" });
          enemy.st = 0;
          enemy.t = 2.4 + game.rng.next() * 1.1;
        }
      }
      return;
    }
    case "mender": {
      if (dist > 13 || !enemy.los) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
      } else if (dist < 8) {
        enemy.vx = (-dx / dist) * speed;
        enemy.vy = (-dy / dist) * speed;
      } else {
        let side = Math.sin(enemy.phase) > 0 ? 1 : -1;
        enemy.vx = (-dy / dist) * side * speed * 0.5;
        enemy.vy = (dx / dist) * side * speed * 0.5;
      }
      enemy.t -= dt;
      if (enemy.t <= 0) {
        enemy.t = 2.8;
        let target = null,
          lowest = 0.92;
        game.hash.query(enemy.x, enemy.y, 9, (other) => {
          if (
            other.dead ||
            other === enemy ||
            other.boss ||
            other.type === "mender" ||
            Math.hypot(other.x - enemy.x, other.y - enemy.y) > 9
          )
            return;
          let frac = other.hp / other.maxHp;
          if (frac < lowest) {
            lowest = frac;
            target = other;
          }
        });
        if (target) {
          target.hp = Math.min(target.maxHp, target.hp + target.maxHp * (enemy.elite ? 0.22 : 0.15));
          game.emit("mend", { x: enemy.x, y: enemy.y, tx: target.x, ty: target.y });
        }
      }
      enemy.face = turnToward(enemy.face, ang, 5 * dt);
      return;
    }
    case "mortar": {
      if (dist > 16 || !enemy.los) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
      } else {
        if (dist < 9) {
          enemy.vx = (-dx / dist) * speed;
          enemy.vy = (-dy / dist) * speed;
        } else {
          enemy.vx *= 0.85;
          enemy.vy *= 0.85;
        }
      }
      enemy.t -= dt;
      if (enemy.st === 1) {
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 0;
        }
      }
      if (enemy.t <= 0 && dist < 19 && alive) {
        let shots = enemy.elite ? 3 : 1;
        for (let k = 0; k < shots; k++) {
          let tx = player.x + player.vx * 0.9 + (shots > 1 ? game.rng.range(-2.2, 2.2) : 0),
            ty = player.y + player.vy * 0.9 + (shots > 1 ? game.rng.range(-2.2, 2.2) : 0);
          tx = Math.max(-game.arena.W + 1, Math.min(game.arena.W - 1, tx));
          ty = Math.max(-game.arena.H + 1, Math.min(game.arena.H - 1, ty));
          game.hazard({
            x: tx,
            y: ty,
            r: 2,
            delay: 1.5 + k * 0.15,
            dmg: enemy.dmg,
            kind: "mortar",
            sx: enemy.x,
            sy: enemy.y,
          });
        }
        game.emit("lob", { x: enemy.x, y: enemy.y });
        enemy.st = 1;
        enemy.t2 = 0.35;
        enemy.t = (3.8 + game.rng.next() * 1.2) * (enemy.los ? 1 : 1.6);
      }
      enemy.face = turnToward(enemy.face, ang, 4 * dt);
      return;
    }
  }
  if (Math.hypot(enemy.vx, enemy.vy) > 0.2) {
    enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 8 * dt);
  }
}
const bossPatterns = {
  warden: ["charge", "ring", "stomp", "charge", "ring", "stomp"],
  queen: ["summon", "spiral", "burst", "eggs", "spiral", "burst"],
  // 2.4.6: the Frost Prism (was: sweep, teleport, shards, lances, teleport, sweep)
  prism: ["frostbeam", "teleport", "frostnova", "icelances", "glacier", "teleport", "iceshards"],
  core: ["spiral", "summon", "ring", "cross", "burst", "rain"],
};
// 2.4.6: THE CRUCIBLE of Ember Works (its attacks are in updateCrucible at the end of this file)
bossPatterns.forge = ["hammer", "slag", "eruption", "furnace", "hammer", "slag", "stoke"];
// 2.4.6: colour of the Frost Prism's live beams (the warning lines keep the warning colour)
const PRISM_ICE = 12578815;
function initBoss(game, boss) {
  boss.st = "walk";
  boss.t = 2.2;
  boss.t2 = 0;
  boss.n = 0;
  boss.pattern = 0;
  boss.spin = 0;
  boss.phaseN = 1;
}
function nextBossAttack(game, boss) {
  let attacks = bossPatterns[boss.type];
  boss.st = attacks[boss.pattern % attacks.length];
  boss.pattern++;
  boss.t = 0;
  boss.t2 = 0;
  boss.n = 0;
  game.emit("bossAtk", { id: boss.type, atk: boss.st });
}
function endBossAttack(boss, delay) {
  boss.st = "walk";
  boss.t = delay;
  boss.n = 0;
  boss.t2 = 0;
}
function updateBoss(game, boss, dt) {
  if (boss.spawnT > 0) {
    boss.vx = 0;
    boss.vy = 0;
    return;
  }
  let player = game.player,
    dx = player.x - boss.x,
    dy = player.y - boss.y,
    dist = Math.hypot(dx, dy) || 0.001,
    aim = Math.atan2(dy, dx),
    hpFrac = boss.hp / boss.maxHp,
    shotDmg = boss.dmg * 0.7;
  if (!boss.enraged && hpFrac < (boss.type === "queen" ? 0.4 : 0.5)) {
    boss.enraged = true;
    game.emit("enrage", { id: boss.type, x: boss.x, y: boss.y });
  }
  let rage = boss.enraged ? 1 : 0;
  boss.spin += dt;
  if (boss.type === "core") {
    let phase = hpFrac > 0.66 ? 1 : hpFrac > 0.33 ? 2 : 3;
    if (phase !== boss.phaseN) {
      boss.phaseN = phase;
      boss.shieldT = 1.4;
      for (let shot of game.eb) shot.life = 0;
      game.beams.length = 0;
      game.emit("phase", { n: phase, x: boss.x, y: boss.y });
      endBossAttack(boss, 1.6);
    }
    if (boss.shieldT > 0) {
      boss.shieldT -= dt;
      boss.shielded = boss.shieldT > 0;
    }
  }
  if (boss.st === "walk") {
    boss.t -= dt;
    moveBoss(game, boss, dt, aim, dist);
    if (boss.t <= 0) {
      nextBossAttack(game, boss);
    }
    boss.face = turnToward(boss.face, aim, 3 * dt);
    return;
  }
  boss.t += dt;
  switch (boss.type) {
    case "warden": {
      if (boss.st === "charge") {
        let charges = 2 + rage;
        if (boss.t2 === 0) {
          boss.t2 = 1;
          boss.ta = aim;
          boss.sub = 0;
          boss.subT = 0;
          game.emit("charge", { x: boss.x, y: boss.y, type: "warden" });
        }
        boss.subT += dt;
        if (boss.sub === 0) {
          boss.vx = 0;
          boss.vy = 0;
          if (boss.subT < 0.5) {
            boss.ta = turnToward(boss.ta, aim, 3 * dt);
          }
          boss.face = turnToward(boss.face, boss.ta, 8 * dt);
          if (boss.subT > (rage ? 0.65 : 0.85)) {
            boss.sub = 1;
            boss.subT = 0;
          }
        } else if (boss.sub === 1) {
          let chargeSpeed = rage ? 18 : 15.5;
          boss.vx = Math.cos(boss.ta) * chargeSpeed;
          boss.vy = Math.sin(boss.ta) * chargeSpeed;
          boss.charging = true;
          if ((boss.hitWall && boss.subT > 0.1) || boss.subT > 0.8) {
            boss.charging = false;
            if (boss.hitWall) {
              game.emit("thud", { x: boss.x, y: boss.y, big: true });
              if (rage) {
                shootRing(game, boss, 10, 7.5, shotDmg, boss.spin);
              }
            }
            boss.sub = 2;
            boss.subT = 0;
          }
        } else {
          boss.vx *= 0.8;
          boss.vy *= 0.8;
          if (boss.subT > 0.45) {
            boss.n++;
            if (boss.n >= charges) {
              endBossAttack(boss, 2.2 - rage * 0.6);
            } else {
              boss.sub = 0;
              boss.subT = 0;
              boss.ta = aim;
              game.emit("charge", { x: boss.x, y: boss.y, type: "warden" });
            }
          }
        }
        return;
      }
      if (boss.st === "ring") {
        boss.vx *= 0.85;
        boss.vy *= 0.85;
        let rings = 3 + rage,
          gap = 0.55;
        if (boss.t >= 0.4 + boss.n * gap && boss.n < rings) {
          shootRing(game, boss, 16 + rage * 6, 7 + rage, shotDmg, (boss.n % 2) * (Math.PI / (16 + rage * 6)));
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss" });
        }
        if (boss.t > 0.4 + rings * gap + 0.4) {
          endBossAttack(boss, 2.4 - rage * 0.7);
        }
        return;
      }
      if (boss.st === "stomp") {
        boss.vx = 0;
        boss.vy = 0;
        const firstStomp = boss.n === 0;
        if (firstStomp) {
          boss.n = 1;
          game.hazard({ x: boss.x, y: boss.y, r: 4.8, delay: 1, dmg: boss.dmg, kind: "stomp" });
        }
        if (firstStomp && rage)
          for (let k = 0; k < 3; k++) {
            let angle = game.rng.next() * TAU,
              off = game.rng.range(0, 3);
            game.hazard({
              x: clamp(player.x + Math.cos(angle) * off, -game.arena.W + 1, game.arena.W - 1),
              y: clamp(player.y + Math.sin(angle) * off, -game.arena.H + 1, game.arena.H - 1),
              r: 2.4,
              delay: 1.25 + k * 0.2,
              dmg: boss.dmg * 0.8,
              kind: "stomp",
            });
          }
        if (boss.n === 1 && boss.t > 1) {
          boss.n = 2;
          shootRing(game, boss, 12, 9, shotDmg, 0);
          game.emit("thud", { x: boss.x, y: boss.y, big: true });
        }
        if (boss.t > 1.6) {
          endBossAttack(boss, 2);
        }
        return;
      }
      break;
    }
    case "queen": {
      moveBoss(game, boss, dt, aim, dist, 0.4);
      if (boss.st === "summon") {
        if (boss.n === 0) {
          boss.n = 1;
          // 2.8.1: summons stop while the arena is crowded (no cap before)
          let count = game.enemies.length > 70 ? 0 : 5 + rage * 2;
          for (let k = 0; k < count; k++) {
            let angle = (k / count) * TAU + boss.spin,
              kid = game.spawnEnemy("swarmer", boss.x + Math.cos(angle) * 2.4, boss.y + Math.sin(angle) * 2.4, {
                hpF: 1,
              });
            kid.spawnT = 0.3;
            kid.noDrop = game.rng.chance(0.6);
            kid.kx = Math.cos(angle) * 5;
            kid.ky = Math.sin(angle) * 5;
          }
          game.emit("hatch", { x: boss.x, y: boss.y, big: true });
        }
        if (boss.t > 1) {
          endBossAttack(boss, 1.4);
        }
        return;
      }
      if (boss.st === "spiral") {
        let count = 3 + rage * 2;
        for (boss.t2 += dt; boss.t2 > 0.1; ) {
          boss.t2 -= 0.1;
          boss.ta = (boss.ta || 0) + 0.24;
          for (let k = 0; k < count; k++)
            game.shoot(boss.x, boss.y, boss.ta + (k / count) * TAU, 6.2, shotDmg, { r: 0.26 });
        }
        if (boss.t > 3.2) {
          endBossAttack(boss, 1.4);
        }
        return;
      }
      if (boss.st === "burst") {
        if (boss.t >= 0.35 + boss.n * 0.42 && boss.n < 3 + rage) {
          for (let k = 0; k < 5; k++) game.shoot(boss.x, boss.y, aim + (k - 2) * 0.16, 9.5, shotDmg);
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss" });
        }
        if (boss.t > 2) {
          endBossAttack(boss, 1.3);
        }
        return;
      }
      if (boss.st === "eggs") {
        if (boss.n === 0) {
          boss.n = 1;
          for (let k = 0; k < 3 + rage; k++) {
            let angle = aim + (k - 1) * 0.6,
              egg = game.spawnEnemy("bomber", boss.x + Math.cos(angle) * 2, boss.y + Math.sin(angle) * 2, {});
            egg.spawnT = 0.3;
            egg.kx = Math.cos(angle) * 9;
            egg.ky = Math.sin(angle) * 9;
            egg.noDrop = true;
            // 2.4.6: every hatched egg leaves a short-lived acid puddle where it lay (Toxin Marsh)
            if (game.arena.acid.filter((puddle) => puddle.life != null).length < 12) {
              game.arena.acid.push({
                x: clamp(boss.x + Math.cos(angle) * 2, -game.arena.W + 1, game.arena.W - 1),
                y: clamp(boss.y + Math.sin(angle) * 2, -game.arena.H + 1, game.arena.H - 1),
                r: 1.3,
                life: 4.5,
              });
            }
          }
          game.emit("hatch", { x: boss.x, y: boss.y, big: true });
        }
        if (boss.t > 1.2) {
          endBossAttack(boss, 1.6);
        }
        return;
      }
      break;
    }
    case "prism": {
      // 2.4.6: the Frost Prism of Cryo Vault. Frost Beam, Ice Lances and Ice Shards were the Laser
      // Sweep, Lances and Homing Shards of the old Prism; Frost Nova and Glacier are new.
      if (boss.st === "frostbeam") {
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        if (boss.n === 0) {
          boss.n = 1;
          let dir = game.rng.chance(0.5) ? 1 : -1,
            angle = aim - dir * 1.15,
            rot = dir * (rage ? 1.25 : 1),
            beam = {
              x: boss.x,
              y: boss.y,
              rot,
              warn: 0.95,
              dur: 2.2,
              w: 0.85,
              dmg: boss.dmg,
              follow: boss,
              len: 34,
              color: PRISM_ICE,
            };
          game.beam({ ...beam, a: angle });
          if (rage) {
            game.beam({ ...beam, a: angle + Math.PI });
          }
          game.emit("beamWarn", { x: boss.x, y: boss.y });
        }
        if (boss.t > 3.4) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "teleport") {
        boss.vx = 0;
        boss.vy = 0;
        if (boss.n === 0) {
          boss.n = 1;
          boss.ghost = true;
          game.emit("blink", { x: boss.x, y: boss.y });
        }
        if (boss.n === 1 && boss.t > 0.45) {
          boss.n = 2;
          let spot = findOpenSpot(game, player.x, player.y, 8, 10.5);
          if (spot) {
            boss.tx = spot.x;
            boss.ty = spot.y;
            game.markers.push({ x: spot.x, y: spot.y, t: 0, dur: 99, type: "_prism", done: false, fake: true });
          } else {
            boss.tx = boss.x;
            boss.ty = boss.y;
          }
        }
        if (boss.n === 2 && boss.t > 1.15) {
          boss.n = 3;
          game.markers = game.markers.filter((marker) => !marker.fake);
          boss.x = boss.tx;
          boss.y = boss.ty;
          boss.ghost = false;
          shootRing(game, boss, 12 + rage * 4, 6.5, shotDmg, boss.spin, "shard");
          game.emit("blink", { x: boss.x, y: boss.y, in: true });
        }
        if (boss.t > 1.6) {
          endBossAttack(boss, 0.9);
        }
        return;
      }
      if (boss.st === "iceshards") {
        moveBoss(game, boss, dt, aim, dist, 0.3);
        if (boss.t >= 0.3 + boss.n * 0.12 && boss.n < 8 + rage * 4) {
          let angle = aim + Math.PI + (boss.n - 4) * 0.4;
          game.shoot(boss.x, boss.y, angle, 5.5, shotDmg, { kind: "shard", homing: 1.3, life: 5, r: 0.24 });
          boss.n++;
        }
        if (boss.t > 2.4) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "icelances") {
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        let count = 3 + rage * 2;
        if (boss.t >= 0.2 + boss.n * 0.45 && boss.n < count) {
          let tx = player.x + player.vx * 0.5,
            ty = player.y + player.vy * 0.5;
          game.beam({
            x: boss.x,
            y: boss.y,
            a: Math.atan2(ty - boss.y, tx - boss.x),
            warn: 0.6,
            dur: 0.22,
            w: 1,
            dmg: boss.dmg,
            len: 34,
            color: PRISM_ICE,
          });
          boss.n++;
          game.emit("beamWarn", { x: boss.x, y: boss.y, small: true });
        }
        if (boss.t > 0.2 + count * 0.45 + 0.8) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "frostnova") {
        // Frost Nova: the Prism roots itself, a marked zone around it freezes over (close range
        // only), then the ice shatters outwards in two (enraged: three) staggered shard rings.
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        let rings = 2 + rage;
        if (boss.n === 0) {
          boss.n = 1;
          game.hazard({ x: boss.x, y: boss.y, r: 3.6, delay: 0.9, dmg: boss.dmg * 0.8, kind: "frost" });
          game.emit("charge", { x: boss.x, y: boss.y, type: "prism" });
        }
        if (boss.n >= 1 && boss.n <= rings && boss.t >= 0.9 + (boss.n - 1) * 0.45) {
          let shots = 14 + rage * 2;
          shootRing(
            game,
            boss,
            shots,
            5.2 + boss.n * 0.9,
            shotDmg,
            boss.spin + ((boss.n % 2) * Math.PI) / shots,
            "shard",
          );
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss" });
        }
        if (boss.t > 0.9 + rings * 0.45 + 0.5) {
          endBossAttack(boss, 1.3);
        }
        return;
      }
      if (boss.st === "glacier") {
        // Glacier: marked zones on and around the player freeze one after another; a zone that
        // catches the player chills it (slower for 1.6 s, see World.updateHazards 2.4.6).
        moveBoss(game, boss, dt, aim, dist, 0.5);
        if (boss.n === 0) {
          boss.n = 1;
          game.emit("charge", { x: boss.x, y: boss.y, type: "prism" });
          let count = 3 + rage;
          for (let k = 0; k < count; k++) {
            let spot =
              k === 0
                ? {
                    x: clamp(player.x + player.vx * 0.4, -game.arena.W + 1, game.arena.W - 1),
                    y: clamp(player.y + player.vy * 0.4, -game.arena.H + 1, game.arena.H - 1),
                  }
                : findOpenSpot(game, player.x, player.y, 2.5, 6.5);
            if (spot) {
              game.hazard({
                x: spot.x,
                y: spot.y,
                r: 2.3,
                delay: 1.25 + k * 0.22,
                dmg: boss.dmg * 0.55,
                kind: "glacier",
              });
            }
          }
        }
        if (boss.t > 2.6) {
          endBossAttack(boss, 1.3);
        }
        return;
      }
      break;
    }
    case "core": {
      let phase = boss.phaseN;
      moveBoss(game, boss, dt, aim, dist, 0.2);
      if (boss.st === "spiral") {
        let shots = 4 + (phase - 1) * 1;
        boss.t2 += dt;
        let interval = phase === 3 ? 0.08 : 0.11;
        for (; boss.t2 > interval; ) {
          boss.t2 -= interval;
          boss.ta = (boss.ta || 0) + (phase === 2 ? -0.2 : 0.2);
          for (let k = 0; k < shots; k++)
            game.shoot(boss.x, boss.y, boss.ta + (k / shots) * TAU, 6 + phase * 0.5, shotDmg, { r: 0.26 });
        }
        if (boss.t > 3) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "summon") {
        if (boss.n === 0) {
          boss.n = 1;
          let types =
            phase === 1
              ? ["grunt", "grunt", "gunner", "gunner"]
              : phase === 2
                ? ["grunt", "gunner", "bomber", "striker"]
                : ["brute", "bulwark", "striker", "mortar"];
          for (let type of types) {
            let spot = game.arena.freePoint(game.rng, player.x, player.y, 7, 1);
            game.markers.push({ x: spot.x, y: spot.y, t: 0, dur: 1, type, elite: false, done: false });
          }
          game.emit("portal", { x: boss.x, y: boss.y, n: types.length });
        }
        if (boss.t > 1) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "ring") {
        if (boss.t >= 0.3 + boss.n * 0.5 && boss.n < 2 + phase) {
          shootRing(game, boss, 18 + phase * 2, 7, shotDmg, (boss.n % 2) * 0.15);
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss" });
        }
        if (boss.t > 0.3 + (2 + phase) * 0.5 + 0.3) {
          endBossAttack(boss, 1.3);
        }
        return;
      }
      if (boss.st === "cross") {
        if (phase === 1) {
          nextBossAttack(game, boss);
          return;
        }
        if (boss.n === 0) {
          boss.n = 1;
          let count = phase === 3 ? 4 : 3,
            rot = (game.rng.chance(0.5) ? 1 : -1) * (phase === 3 ? 0.55 : 0.42);
          for (let k = 0; k < count; k++)
            game.beam({
              x: boss.x,
              y: boss.y,
              a: aim + 0.6 + (k / count) * TAU,
              rot,
              warn: 1.2,
              dur: 3.2,
              w: 0.9,
              dmg: boss.dmg,
              follow: boss,
              len: 34,
            });
          game.emit("beamWarn", { x: boss.x, y: boss.y });
        }
        if (phase === 3) boss.t2 += dt;
        if (phase === 3 && boss.t2 > 0.7) {
          boss.t2 = 0;
          for (let k = -1; k <= 1; k++) game.shoot(boss.x, boss.y, aim + k * 0.2, 8.5, shotDmg);
        }
        if (boss.t > 4.6) {
          endBossAttack(boss, 1.4);
        }
        return;
      }
      if (boss.st === "burst") {
        if (boss.t >= 0.3 + boss.n * 0.35 && boss.n < 3 + phase) {
          for (let k = 0; k < 7; k++) game.shoot(boss.x, boss.y, aim + (k - 3) * 0.13, 9 + phase * 0.5, shotDmg);
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss" });
        }
        if (boss.t > 0.3 + (3 + phase) * 0.35 + 0.4) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "rain") {
        if (boss.n === 0) {
          boss.n = 1;
          let count = 4 + phase * 2;
          for (let k = 0; k < count; k++) {
            let spot = k === 0 ? { x: player.x, y: player.y } : findOpenSpot(game, player.x, player.y, 1.5, 7);
            if (spot) {
              game.hazard({ x: spot.x, y: spot.y, r: 2.2, delay: 1.1 + k * 0.12, dmg: boss.dmg * 0.8, kind: "rain" });
            }
          }
        }
        if (boss.t > 2.4) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      break;
    }
    case "forge":
      if (updateCrucible(game, boss, dt, aim, dist, shotDmg, rage)) return;
      break;
  }
  endBossAttack(boss, 1);
}
function moveBoss(game, boss, dt, aim, dist, speedMul = 1) {
  let speed = boss.speed * (boss.enraged ? 1.3 : 1) * speedMul;
  if (boss.type === "queen" || boss.type === "prism") {
    let orbit = boss.type === "queen" ? 8 : 9,
      approach = dist > orbit + 1 ? 1 : dist < orbit - 1 ? -1 : 0,
      player = game.player,
      nx = (player.x - boss.x) / dist,
      ny = (player.y - boss.y) / dist;
    boss.vx = (nx * approach - ny * 0.7) * speed * 1.4;
    boss.vy = (ny * approach + nx * 0.7) * speed * 1.4;
    return;
  }
  if (boss.type === "core") {
    let player = game.player,
      dx = player.x * 0.25 - boss.x,
      dy = player.y * 0.25 - boss.y,
      len = Math.hypot(dx, dy);
    if (len > 0.5) {
      boss.vx = (dx / len) * speed;
      boss.vy = (dy / len) * speed;
    } else {
      boss.vx *= 0.9;
      boss.vy *= 0.9;
    }
    return;
  }
  game.chaseDir(boss);
  boss.vx = game.cdx * speed;
  boss.vy = game.cdy * speed;
}
function shootRing(game, boss, count, speed, dmg, start, kind) {
  for (let k = 0; k < count; k++)
    game.shoot(boss.x, boss.y, start + (k / count) * TAU, speed, dmg, { kind: kind || "orb", r: 0.27 });
}
function findOpenSpot(game, x, y, minR, maxR) {
  for (let k = 0; k < 20; k++) {
    let angle = game.rng.next() * TAU,
      dist = game.rng.range(minR, maxR),
      px = x + Math.cos(angle) * dist,
      py = y + Math.sin(angle) * dist;
    if (!game.arena.outside(px, py, 2) && !game.arena.blocked(px, py, 2) && !game.arena.featureBlocked(px, py, 0.6))
      return { x: px, y: py };
  }
  for (let k = 0; k < 16; k++) {
    let angle = (k / 16) * TAU,
      px = clamp(x * 0.4 + Math.cos(angle) * Math.max(minR, 2.5), -game.arena.W + 3, game.arena.W - 3),
      py = clamp(y * 0.4 + Math.sin(angle) * Math.max(minR, 2.5), -game.arena.H + 3, game.arena.H - 3);
    if (!game.arena.outside(px, py, 2) && !game.arena.blocked(px, py, 2) && !game.arena.featureBlocked(px, py, 0.6))
      return { x: px, y: py };
  }
  return null;
}
function updateEnemy(game, enemy, dt) {
  // stragglers (see RL_KITERS): hunting ranged enemies (RL_KITERS) come straight at the player.
  if (enemy.hunt && RL_KITERS.has(enemy.type) && !(enemy.spawnT > 0)) {
    game.chaseDir(enemy);
    const speed = Math.max(enemy.speed, 2.6) * 1.3;
    enemy.vx = game.cdx * speed;
    enemy.vy = game.cdy * speed;
    enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 8 * dt);
    enemy.st = 0;
    return;
  }
  // 2.2: new enemy roles use the same movement/shooting primitives as the core AI.
  if (enemy.type === "drone") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx),
      side = Math.sin(enemy.age * 2.1 + enemy.phase);
    if (dist < 7) {
      enemy.vx = (-dx / dist) * enemy.speed;
      enemy.vy = (-dy / dist) * enemy.speed;
    } else if (dist > 11) {
      enemy.vx = Math.cos(ang) * enemy.speed;
      enemy.vy = Math.sin(ang) * enemy.speed;
    } else {
      enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed;
      enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed;
    }
    enemy.face = turnToward(enemy.face, ang, 7 * dt);
    enemy.t -= dt;
    if (player.alive && dist < 16 && dist > 5 && enemy.t <= 0 && enemy.los) {
      for (const off of [-0.18, 0.18])
        game.shoot(enemy.x, enemy.y, ang + off, 18, enemy.dmg * 0.72, { kind: "drone", life: 2.8, homing: 1.6 });
      enemy.t = 2.2 + game.rng.next() * 0.8;
      game.emit("eshot", { x: enemy.x, y: enemy.y, type: "drone" });
    }
    return;
  }
  if (enemy.type === "driller") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
      enemy.face = turnToward(enemy.face, ang, 7 * dt);
      enemy.t -= dt;
      if (player.alive && dist < 8.7 && dist > 4.2 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.58;
        enemy.ta = ang;
        enemy.vx *= 0.15;
        enemy.vy *= 0.15;
        game.emit("charge", { x: enemy.x, y: enemy.y, type: "driller" });
      }
    } else if (enemy.st === 1) {
      enemy.t2 -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      enemy.face = turnToward(enemy.face, enemy.ta, 14 * dt);
      if (enemy.t2 <= 0) {
        enemy.st = 2;
        enemy.t2 = 0.62;
        enemy.vx = Math.cos(enemy.ta) * 18;
        enemy.vy = Math.sin(enemy.ta) * 18;
        game.emit("edash", { x: enemy.x, y: enemy.y, a: enemy.ta, type: enemy.type });
      }
    } else {
      enemy.t2 -= dt;
      enemy.vx *= 0.97;
      enemy.vy *= 0.97;
      if (enemy.hitWall || enemy.t2 <= 0) {
        game.hazard({ x: enemy.x, y: enemy.y, r: 1.6, delay: 0.18, dmg: enemy.dmg * 0.7, kind: "drill" });
        enemy.st = 0;
        enemy.t = 1.6 + game.rng.next() * 1.4;
      }
    }
    return;
  }
  if (enemy.type === "beacon") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (dist < 9.5) {
      enemy.vx = -game.cdx * enemy.speed * 0.85;
      enemy.vy = -game.cdy * enemy.speed * 0.85;
    } else if (dist > 13) {
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
    } else {
      const side = Math.sin(enemy.age * 1.5 + enemy.phase);
      enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed * 0.7;
      enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed * 0.7;
    }
    enemy.face = turnToward(enemy.face, ang, 5 * dt);
    enemy.t -= dt;
    if (enemy.t <= 0) {
      enemy.t = 3.0 + game.rng.next() * 0.8;
      game.hash.query(enemy.x, enemy.y, 6, (ally) => {
        if (ally === enemy || ally.dead || ally.boss || ally.type === "beacon" || (ally.beaconT || 0) > game.time)
          return;
        // 2.8.1: the hash query covers whole cells (up to ~10 m); heal only inside the 6 m ring that is shown
        if (Math.hypot(ally.x - enemy.x, ally.y - enemy.y) > 6 + ally.r) return;
        ally.beaconT = game.time + 3;
        ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.08);
        ally.healFlash = 0.3;
      });
      game.emit("mend", { x: enemy.x, y: enemy.y, r: 6, type: "beacon" });
    }
    return;
  }
  if (enemy.type === "weaver") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx),
      side = Math.sin(enemy.age * 2.8 + enemy.phase);
    enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed;
    enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed;
    enemy.face = turnToward(enemy.face, ang, 8 * dt);
    enemy.t -= dt;
    // 2.8.1: a dead player is not shot at any more
    if (enemy.t <= 0 && !player.alive) enemy.t = 1;
    if (enemy.t <= 0) {
      const spot = game.arena.freePoint(game.rng, player.x, player.y, 7.4, 1.25);
      if (spot) {
        const ox = enemy.x,
          oy = enemy.y;
        enemy.x = spot.x;
        enemy.y = spot.y;
        game.arena.resolve(enemy, enemy.r);
        game.emit("warp", { x: ox, y: oy, tx: enemy.x, ty: enemy.y, who: "weaver" });
      }
      const aim = spot ? Math.atan2(player.y - enemy.y, player.x - enemy.x) : ang;
      for (const off of [-0.22, 0, 0.22])
        game.shoot(enemy.x, enemy.y, aim + off, 24, enemy.dmg * 0.72, { kind: "weaver", life: 2.6 });
      enemy.t = 3.4 + game.rng.next() * 1.2;
    }
    return;
  }
  // original roles
  if (enemy.type === "charger") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
      enemy.t -= dt;
      enemy.face = turnToward(enemy.face, ang, 9 * dt);
      if (player.alive && dist < 10.5 && dist > 4 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.48;
        enemy.ta = ang;
        enemy.vx *= 0.2;
        enemy.vy *= 0.2;
        game.emit("charge", { x: enemy.x, y: enemy.y, type: enemy.type });
      }
    } else if (enemy.st === 1) {
      enemy.vx *= 0.65;
      enemy.vy *= 0.65;
      enemy.t2 -= dt;
      enemy.face = turnToward(enemy.face, enemy.ta, 16 * dt);
      if (enemy.t2 <= 0) {
        enemy.st = 2;
        enemy.t2 = 0.62;
        enemy.vx = Math.cos(enemy.ta) * 16.5;
        enemy.vy = Math.sin(enemy.ta) * 16.5;
        game.emit("edash", { x: enemy.x, y: enemy.y, a: enemy.ta, type: enemy.type });
      }
    } else {
      enemy.t2 -= dt;
      enemy.vx *= 0.985;
      enemy.vy *= 0.985;
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        enemy.t = 1.5 + game.rng.next() * 1.2;
      }
    }
    return;
  }
  if (enemy.type === "minebot") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001;
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      const retreat = dist < 5.2;
      enemy.vx = (retreat ? -game.cdx : game.cdx) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.vy = (retreat ? -game.cdy : game.cdy) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.t -= dt;
      enemy.face = turnToward(enemy.face, Math.atan2(dy, dx), 8 * dt);
      if (player.alive && dist < 10 && dist > 4.2 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.55;
        enemy.vx = 0;
        enemy.vy = 0;
        game.hazard({ x: enemy.x, y: enemy.y, r: 1.15, delay: 0.55, dmg: enemy.dmg * 1.25, kind: "mine" });
        game.emit("mine", { x: enemy.x, y: enemy.y });
      }
    } else {
      enemy.t2 -= dt;
      enemy.face = turnToward(enemy.face, Math.atan2(dy, dx), 8 * dt);
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        enemy.t = 2.4 + game.rng.next() * 1.2;
      }
    }
    return;
  }
  if (enemy.type === "sapper") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      const retreat = dist < 5.5;
      enemy.vx = (retreat ? -game.cdx : game.cdx) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.vy = (retreat ? -game.cdy : game.cdy) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.t -= dt;
      enemy.face = turnToward(enemy.face, ang, 8 * dt);
      if (player.alive && dist < 9.5 && dist > 4.2 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.72;
        enemy.vx *= 0.15;
        enemy.vy *= 0.15;
        game.hazard({ x: enemy.x, y: enemy.y, r: 1.25, delay: 0.72, dmg: enemy.dmg * 1.25, kind: "sapper" });
        game.emit("mine", { x: enemy.x, y: enemy.y });
      }
    } else {
      enemy.t2 -= dt;
      enemy.face = turnToward(enemy.face, ang, 8 * dt);
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        enemy.t = 2.4 + game.rng.next() * 1.3;
      }
    }
    return;
  }
  if (enemy.type === "phantom") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
      enemy.face = turnToward(enemy.face, ang, 10 * dt);
      enemy.t -= dt;
      if (player.alive && dist < 8.5 && dist > 3.8 && enemy.t <= 0) {
        enemy.st = 1;
        enemy.t2 = 0.82;
        enemy.ghost = true;
        enemy.t = 2.7;
        game.emit("blink", { x: enemy.x, y: enemy.y, small: true, phase: true });
      }
    } else if (enemy.st === 1) {
      enemy.ghost = true;
      enemy.vx *= 0.82;
      enemy.vy *= 0.82;
      enemy.t2 -= dt;
      if (enemy.t2 <= 0) {
        enemy.ghost = false;
        enemy.st = 2;
        enemy.t2 = 0.32;
        enemy.vx = Math.cos(ang) * 13;
        enemy.vy = Math.sin(ang) * 13;
        game.emit("edash", { x: enemy.x, y: enemy.y, a: ang, type: enemy.type });
      }
    } else {
      enemy.ghost = false;
      enemy.t2 -= dt;
      enemy.vx *= 0.985;
      enemy.vy *= 0.985;
      if (enemy.t2 <= 0) enemy.st = 0;
    }
    return;
  }
  if (enemy.type === "sentinel") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      if (dist > 12) {
        game.chaseDir(enemy);
        enemy.vx = game.cdx * enemy.speed;
        enemy.vy = game.cdy * enemy.speed;
      } else if (dist < 8.5) {
        enemy.vx = (-dx / dist) * enemy.speed * 0.7;
        enemy.vy = (-dy / dist) * enemy.speed * 0.7;
      } else if (!enemy.los) {
        // 2.8.1: without a line of sight at 8.5-12 m it used to stand still for good; walk up to get one
        game.chaseDir(enemy);
        enemy.vx = game.cdx * enemy.speed * 0.6;
        enemy.vy = game.cdy * enemy.speed * 0.6;
      } else {
        enemy.vx *= 0.65;
        enemy.vy *= 0.65;
      }
      enemy.face = turnToward(enemy.face, ang, 6 * dt);
      enemy.t -= dt;
      if (player.alive && dist < 15 && dist > 6 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.65;
        enemy.ta = ang;
        enemy.vx *= 0.2;
        enemy.vy *= 0.2;
      }
    } else if (enemy.st === 1) {
      enemy.t2 -= dt;
      enemy.vx *= 0.72;
      enemy.vy *= 0.72;
      enemy.face = turnToward(enemy.face, enemy.ta, 8 * dt);
      if (enemy.t2 <= 0) {
        game.beam({
          x: enemy.x,
          y: enemy.y,
          a: enemy.ta,
          len: 18,
          w: 0.2,
          warn: 0.55,
          dur: 0.48,
          rot: 0.08,
          dmg: enemy.dmg * 1.2,
          color: enemy.def.color,
        });
        game.emit("beamWarn", { x: enemy.x, y: enemy.y, small: true });
        enemy.st = 2;
        enemy.t2 = 2.5 + game.rng.next() * 1.2;
      }
    } else {
      enemy.t2 -= dt;
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        enemy.t = 0.5 + game.rng.next() * 0.8;
      }
    }
    return;
  }
  if (enemy.type === "carrier") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (dist < 8.5) {
      enemy.vx = (-dx / dist) * enemy.speed;
      enemy.vy = (-dy / dist) * enemy.speed;
    } else if (dist > 12) {
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
    } else {
      const side = Math.sin(enemy.age * 1.7 + enemy.phase);
      enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed;
      enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed;
    }
    enemy.face = turnToward(enemy.face, ang, 7 * dt);
    enemy.t -= dt;
    if (player.alive && dist < 14 && dist > 7 && enemy.t <= 0 && enemy.los) {
      for (const off of [-0.16, 0, 0.16])
        game.shoot(enemy.x, enemy.y, ang + off, 20, enemy.dmg * 0.72, { kind: "carrier", life: 3.8, homing: 1.2 });
      enemy.t = 2.4 + game.rng.next() * 1.2;
      game.emit("eshot", { x: enemy.x, y: enemy.y });
    }
    return;
  }
  return updateEnemyCore(game, enemy, dt);
}

/* ---- 2.4.6: THE CRUCIBLE, the boss of Ember Works ----
 A slow furnace golem that walks at the player like the Warden. Every hit is telegraphed on the
 ground (hazard rings) or comes as slow slag orbs. Enraged (below half hull) its attacks get more
 shots, more blasts and shorter pauses.
   hammer    FORGE HAMMER   winds up and slams: a blast around itself, a fissure of blasts towards
                            the player (three when enraged) and a shockwave ring of slag orbs
   slag      SLAG RAIN      lobs molten globs at the player and where the player is heading
   eruption  ERUPTION       three rings of lava bursts roll outward from it one after the other,
                            and the lava vents near the player erupt early
   furnace   FURNACE BLAST  fans of slow slag orbs from its mouth, aimed where the player was
   stoke     STOKE          portals for bombers and a brute; the vents near the player flare up
 The vents only erupt through extra hazards on top of them; their own cycle is not changed. */
function crucibleVents(game, boss, delay, dmg) {
  const player = game.player;
  for (const vent of game.arena.vents) {
    if (Math.hypot(vent.x - player.x, vent.y - player.y) < 15) {
      boss.fx.push(game.hazard({ x: vent.x, y: vent.y, r: vent.r + 0.5, delay, dmg, kind: "rain" }));
    }
  }
}
function updateCrucible(game, boss, dt, aim, dist, shotDmg, rage) {
  const player = game.player,
    arena = game.arena,
    inside = (x, y) => !arena.outside(x, y, 0.8);
  // lava fountains where tracked blasts go off (vents and some of the eruption bursts)
  if (boss.fx)
    for (const hazard of boss.fx) {
      if (hazard.done && !hazard.fx) {
        hazard.fx = 1;
        game.emit("erupt", { x: hazard.x, y: hazard.y, r: hazard.r });
      }
    }
  const end = (walk) => {
    boss.fx = null;
    boss.charging = false;
    endBossAttack(boss, walk);
  };
  switch (boss.st) {
    case "hammer": {
      const wind = rage ? 0.8 : 1;
      boss.vx *= 0.8;
      boss.vy *= 0.8;
      if (boss.n === 0) {
        boss.n = 1;
        boss.charging = true;
        boss.ta = aim;
        game.hazard({ x: boss.x, y: boss.y, r: 4.4, delay: wind, dmg: boss.dmg, kind: "stomp" });
        for (const off of rage ? [-0.5, 0, 0.5] : [0])
          for (let k = 0; k < 5; k++) {
            const reach = 5.2 + k * 2.4,
              x = boss.x + Math.cos(aim + off) * reach,
              y = boss.y + Math.sin(aim + off) * reach;
            if (inside(x, y)) {
              game.hazard({ x, y, r: 1.45, delay: wind + 0.12 + k * 0.12, dmg: boss.dmg * 0.8, kind: "stomp" });
            }
          }
        game.emit("charge", { x: boss.x, y: boss.y, type: "forge" });
      }
      boss.face = turnToward(boss.face, boss.ta, 6 * dt);
      if (boss.n === 1 && boss.t >= wind) {
        boss.n = 2;
        boss.charging = false;
        shootRing(game, boss, 12 + rage * 4, 6.5, shotDmg, boss.spin, "slag");
        game.emit("thud", { x: boss.x, y: boss.y, big: true });
      }
      if (boss.n === 2 && rage && boss.t >= wind + 0.45) {
        boss.n = 3;
        shootRing(game, boss, 16, 5, shotDmg, boss.spin + Math.PI / 16, "slag");
      }
      if (boss.t > wind + 1.1) {
        end(2 - rage * 0.5);
      }
      return true;
    }
    case "slag": {
      moveBoss(game, boss, dt, aim, dist, 0.35);
      const salvos = 3 + rage;
      if (boss.t >= 0.35 + boss.n * 0.6 && boss.n < salvos) {
        boss.n++;
        const spots = [
          [player.x, player.y],
          [player.x + player.vx * 1.1, player.y + player.vy * 1.1],
        ];
        if (rage) {
          const angle = game.rng.next() * TAU,
            reach = game.rng.range(2.5, 5);
          spots.push([player.x + Math.cos(angle) * reach, player.y + Math.sin(angle) * reach]);
        }
        spots.forEach(([x, y], k) => {
          x = clamp(x, -arena.W + 1, arena.W - 1);
          y = clamp(y, -arena.H + 1, arena.H - 1);
          game.hazard({
            x,
            y,
            r: 1.9,
            delay: 1.25 + k * 0.1,
            dmg: boss.dmg * 0.75,
            kind: "mortar",
            sx: boss.x,
            sy: boss.y,
          });
        });
        game.emit("lob", { x: boss.x, y: boss.y });
      }
      if (boss.t > 0.35 + salvos * 0.6 + 1.1) {
        end(1.6 - rage * 0.3);
      }
      return true;
    }
    case "eruption": {
      boss.vx *= 0.8;
      boss.vy *= 0.8;
      const first = 1,
        step = rage ? 0.35 : 0.45;
      if (boss.n === 0) {
        boss.n = 1;
        boss.fx = [];
        const turn = game.rng.next() * TAU;
        for (let ring = 0; ring < 3; ring++) {
          const radius = 4.5 + ring * 4.5,
            count = 5 * (ring + 1);
          for (let k = 0; k < count; k++) {
            const angle = turn + ((k + (ring % 2) * 0.5) / count) * TAU,
              x = boss.x + Math.cos(angle) * radius,
              y = boss.y + Math.sin(angle) * radius;
            if (!inside(x, y)) continue;
            const hazard = game.hazard({
              x,
              y,
              r: 1.4,
              delay: first + ring * step,
              dmg: boss.dmg * 0.85,
              kind: "rain",
            });
            if (k % 3 === 0) {
              boss.fx.push(hazard);
            }
          }
        }
        crucibleVents(game, boss, first + 0.3, boss.dmg * 0.9);
        if (rage) {
          game.hazard({ x: player.x, y: player.y, r: 2, delay: first + 0.5, dmg: boss.dmg * 0.8, kind: "rain" });
        }
        boss.charging = true;
        game.emit("charge", { x: boss.x, y: boss.y, type: "forge" });
      }
      if (boss.t >= first) {
        boss.charging = false;
      }
      if (boss.t > first + 2 * step + 0.6) {
        end(1.8 - rage * 0.4);
      }
      return true;
    }
    case "furnace": {
      boss.vx *= 0.85;
      boss.vy *= 0.85;
      const waves = 3 + rage,
        count = 7,
        spread = 1.1;
      if (boss.n === 0 && boss.t2 === 0) {
        boss.t2 = 1;
        boss.ta = aim;
        boss.charging = true;
      }
      // the mouth only turns slowly, so running around the fan gets out of it
      boss.ta = turnToward(boss.ta, aim, 0.45 * dt);
      boss.face = turnToward(boss.face, boss.ta, 6 * dt);
      if (boss.t >= 0.6 + boss.n * 0.5 && boss.n < waves) {
        boss.charging = false;
        const half = boss.n % 2 ? 0.5 : 0,
          mx = boss.x + Math.cos(boss.face) * 1.6,
          my = boss.y + Math.sin(boss.face) * 1.6;
        for (let k = 0; k < count - (half ? 1 : 0); k++) {
          const angle = boss.face + (k + half - (count - 1) / 2) * (spread / (count - 1));
          game.shoot(mx, my, angle, 5.2 + rage * 0.6, shotDmg, { kind: "slag", r: 0.34, life: 6 });
        }
        boss.n++;
        game.emit("eshot", { x: boss.x, y: boss.y, type: "boss" });
      }
      if (boss.t > 0.6 + waves * 0.5 + 0.4) {
        end(1.6 - rage * 0.3);
      }
      return true;
    }
    case "stoke": {
      boss.vx *= 0.8;
      boss.vy *= 0.8;
      if (boss.n === 0) {
        boss.n = 1;
        boss.fx = [];
        boss.charging = true;
        const kinds = rage ? ["bomber", "bomber", "bomber", "brute"] : ["bomber", "bomber", "brute"],
          alive = game.enemies.filter((enemy) => !enemy.dead && !enemy.boss).length,
          room = Math.max(0, 10 - alive - game.markers.length);
        for (const type of kinds.slice(0, room)) {
          const spot = arena.freePoint(game.rng, player.x, player.y, 7, 1);
          game.markers.push({ x: spot.x, y: spot.y, t: 0, dur: 1.1, type, elite: false, done: false });
        }
        crucibleVents(game, boss, 1.1, boss.dmg * 0.9);
        game.emit("portal", { x: boss.x, y: boss.y, n: Math.min(room, kinds.length) });
      }
      if (boss.t > 0.6) {
        boss.charging = false;
      }
      if (boss.t > 1.5) {
        end(1.8 - rage * 0.4);
      }
      return true;
    }
  }
  return false;
}

export { RL_KITERS, updateEnemy, updateBoss, findOpenSpot, initBoss };
