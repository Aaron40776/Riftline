// Enemy and boss behaviour (mu, vu) and enemy variants.

import { clamp, TAU, turnToward } from "./util.js";

/* ---- stragglers: when only a few enemies are left for 9 s the game sets
 enemy.hunt so they come to the player. The 2.1/2.2 ranged enemies ignored
 it and could kite forever (the last Beacon fleeing into a corner). ---- */
var RL_KITERS = new Set(["turret", "minebot", "sapper", "sentinel", "carrier", "drone", "beacon", "weaver"]);
// 3b: the hunt override is folded into updateEnemy; kept as a no-op because main.js still calls it.
function rlInstallHunt() {}
function updateEnemyCore(i, t, e) {
  if (t.spawnT > 0) {
    ((t.vx = 0), (t.vy = 0));
    return;
  }
  let n = i.player,
    s = n.x - t.x,
    r = n.y - t.y,
    a = Math.hypot(s, r) || 0.001,
    o = Math.atan2(r, s);
  i.chaseDir(t);
  let c = i.cdx,
    h = i.cdy,
    l = t.speed,
    u = n.alive;
  if (
    t.hunt &&
    (t.type === "gunner" || t.type === "sniper" || t.type === "hive" || t.type === "mortar" || t.type === "mender")
  ) {
    ((t.st = 0),
      (t.vx = c * Math.max(l, 2.6) * 1.3),
      (t.vy = h * Math.max(l, 2.6) * 1.3),
      (t.face = turnToward(t.face, Math.atan2(t.vy, t.vx), 8 * e)));
    return;
  }
  switch (t.type) {
    case "swarmer":
    case "mite": {
      let f = Math.sin(t.age * 6 + t.phase) * 0.45;
      ((t.vx = (c - h * f) * l), (t.vy = (h + c * f) * l));
      break;
    }
    case "grunt":
    case "splitter":
      ((t.vx = c * l), (t.vy = h * l));
      break;
    case "gunner": {
      if (t.st === 0) {
        if (a > 11 || !t.los) ((t.vx = c * l), (t.vy = h * l));
        else if (a < 6.5) ((t.vx = (-s / a) * l * 0.8), (t.vy = (-r / a) * l * 0.8));
        else {
          let f = Math.sin(t.phase) > 0 ? 1 : -1;
          ((t.vx = (-r / a) * f * l * 0.55), (t.vy = (s / a) * f * l * 0.55));
        }
        ((t.t -= e),
          t.t <= 0 &&
            t.los &&
            a < 15 &&
            u &&
            ((t.st = 1), (t.t2 = 0.45), i.emit("charge", { x: t.x, y: t.y, type: t.type })));
      } else if (((t.vx *= 0.8), (t.vy *= 0.8), (t.t2 -= e), t.t2 <= 0)) {
        let f = t.elite ? 3 : 1,
          p = 8.2 + i.wave * 0.06;
        for (let x = 0; x < f; x++) i.shoot(t.x, t.y, o + (x - (f - 1) / 2) * 0.2, p, t.dmg);
        (i.emit("eshot", { x: t.x, y: t.y, type: "gunner" }), (t.st = 0), (t.t = 2.2 + i.rng.next() * 0.9));
      }
      t.face = turnToward(t.face, o, 8 * e);
      return;
    }
    case "bomber": {
      t.st === 0
        ? ((t.vx = c * l),
          (t.vy = h * l),
          a < 1.9 + n.r && u && ((t.st = 1), (t.t2 = 0.55), i.emit("fuse", { x: t.x, y: t.y })))
        : t.st === 1 &&
          ((t.vx *= 0.85),
          (t.vy *= 0.85),
          (t.t2 -= e),
          t.t2 <= 0 &&
            ((t.st = 3),
            i.explode(t.x, t.y, 2.6, 30 * i.stats.dmgMul, {
              enemies: !0,
              player: !0,
              dmgPlayer: t.dmg,
              knock: 5,
              kind: "bomber",
            }),
            i.killEnemy(t)));
      break;
    }
    case "brute": {
      if (t.st === 0)
        ((t.vx = c * l),
          (t.vy = h * l),
          (t.t -= e),
          t.t <= 0 &&
            t.los &&
            a < 10 &&
            u &&
            ((t.st = 1), (t.t2 = 0.8), (t.ta = o), i.emit("charge", { x: t.x, y: t.y, type: "brute" })));
      else if (t.st === 1) {
        ((t.vx = 0),
          (t.vy = 0),
          t.t2 > 0.35 && (t.ta = turnToward(t.ta, o, 2.5 * e)),
          (t.face = turnToward(t.face, t.ta, 10 * e)),
          (t.t2 -= e),
          t.t2 <= 0 && ((t.st = 2), (t.t2 = 0.6)));
        return;
      } else if (t.st === 2) {
        ((t.vx = Math.cos(t.ta) * 15),
          (t.vy = Math.sin(t.ta) * 15),
          (t.face = t.ta),
          (t.t2 -= e),
          t.hitWall && t.t2 < 0.5
            ? ((t.st = 3), (t.t2 = 0.8), i.emit("thud", { x: t.x, y: t.y }))
            : t.t2 <= 0 && ((t.st = 0), (t.t = 2.8 + i.rng.next() * 1.4)));
        return;
      } else {
        ((t.vx = 0), (t.vy = 0), (t.t2 -= e), t.t2 <= 0 && ((t.st = 0), (t.t = 2.5 + i.rng.next())));
        return;
      }
      break;
    }
    case "sniper": {
      if (t.st === 0) {
        if (a > 14.5 || !t.los) ((t.vx = c * l), (t.vy = h * l));
        else if (a < 9.5) ((t.vx = (-s / a) * l), (t.vy = (-r / a) * l));
        else {
          let f = Math.cos(t.phase) > 0 ? 1 : -1;
          ((t.vx = (-r / a) * f * l * 0.4), (t.vy = (s / a) * f * l * 0.4));
        }
        ((t.t -= e),
          t.t <= 0 &&
            t.los &&
            a < 19 &&
            u &&
            ((t.st = 1), (t.t2 = 1.25), (t.ta = o), i.emit("aim", { x: t.x, y: t.y })));
      } else
        ((t.vx = 0),
          (t.vy = 0),
          t.t2 > 0.35 && (t.ta = turnToward(t.ta, o, 3 * e)),
          (t.t2 -= e),
          t.t2 <= 0 &&
            (i.shoot(t.x + Math.cos(t.ta) * 0.7, t.y + Math.sin(t.ta) * 0.7, t.ta, 22, t.dmg, {
              kind: "fast",
              r: 0.2,
            }),
            i.emit("eshot", { x: t.x, y: t.y, type: "sniper" }),
            (t.st = 0),
            (t.t = 3 + i.rng.next() * 1.2)));
      t.face = turnToward(t.face, t.st === 1 ? t.ta : o, 8 * e);
      return;
    }
    case "hive": {
      (a > 6 || !t.los ? ((t.vx = c * l), (t.vy = h * l)) : ((t.vx *= 0.9), (t.vy *= 0.9)), (t.t -= e));
      let f = t.elite ? 7 : 5;
      if (t.t <= 0 && ((t.t = 3.2), t.kids < f && i.enemies.length < 75)) {
        let p = i.rng.next() * TAU,
          x = i.spawnEnemy("swarmer", t.x + Math.cos(p) * (t.r + 0.5), t.y + Math.sin(p) * (t.r + 0.5), {
            parent: t.id,
            hpF: 0.8,
          });
        ((x.spawnT = 0.15), (x.noDrop = i.rng.chance(0.5)), t.kids++, i.emit("hatch", { x: t.x, y: t.y }));
      }
      t.face += e * 0.6;
      return;
    }
    case "bulwark": {
      if ((t.guardFlash > 0 && (t.guardFlash -= e * 5), t.guardDown > 0)) {
        ((t.guardDown -= e),
          (t.vx *= 0.9),
          (t.vy *= 0.9),
          t.guardDown <= 0 && ((t.guard = t.guardMax), i.emit("guardUp", { x: t.x, y: t.y })));
        return;
      }
      ((t.vx = c * l), (t.vy = h * l), (t.face = turnToward(t.face, o, 0.95 * e)));
      return;
    }
    case "striker": {
      if (t.st === 0) {
        if (a > 7 || !t.los) ((t.vx = c * l), (t.vy = h * l));
        else {
          let f = Math.sin(t.phase) > 0 ? 1 : -1;
          ((t.vx = (-r / a) * f * l * 0.6), (t.vy = (s / a) * f * l * 0.6));
        }
        if (((t.t -= e), t.t <= 0 && t.los && a < 13 && u)) {
          let f = Math.atan2(t.y - n.y, t.x - n.x),
            p = i.rng.chance(0.5) ? 1 : -1,
            x = null;
          for (let m of [p, -p]) {
            let g = f + m * 1.35,
              M = n.x + Math.cos(g) * 3.3,
              b = n.y + Math.sin(g) * 3.3;
            if (!i.arena.outside(M, b, 1) && !i.arena.blocked(M, b, t.r + 0.3)) {
              x = { x: M, y: b };
              break;
            }
          }
          x
            ? ((t.st = 1), (t.t2 = 0.7), (t.tx = x.x), (t.ty = x.y), i.emit("blinkWarn", { x: x.x, y: x.y }))
            : (t.t = 0.8);
        }
        break;
      }
      if (t.st === 1) {
        ((t.vx = 0),
          (t.vy = 0),
          (t.t2 -= e),
          t.t2 <= 0 &&
            (i.emit("blink", { x: t.x, y: t.y, small: !0 }),
            (t.x = t.tx),
            (t.y = t.ty),
            i.arena.resolve(t, t.r),
            i.emit("blink", { x: t.x, y: t.y, small: !0, in: !0 }),
            (t.st = 2),
            (t.t2 = 0.32),
            (t.ta = Math.atan2(n.y - t.y, n.x - t.x))));
        return;
      }
      if (t.st === 2) {
        ((t.vx = 0),
          (t.vy = 0),
          (t.face = turnToward(t.face, t.ta, 14 * e)),
          (t.t2 -= e),
          t.t2 <= 0 && ((t.st = 3), (t.t2 = 0.24), i.emit("charge", { x: t.x, y: t.y, type: "striker" })));
        return;
      }
      ((t.vx = Math.cos(t.ta) * 17),
        (t.vy = Math.sin(t.ta) * 17),
        (t.face = t.ta),
        (t.t2 -= e),
        (t.t2 <= 0 || (t.hitWall && t.t2 < 0.2)) && ((t.st = 0), (t.t = 3 + i.rng.next() * 1.5)));
      return;
    }
    case "leaper": {
      if (t.st === 0) {
        if (a > 6.5 || !t.los) ((t.vx = c * l), (t.vy = h * l));
        else if (((t.t -= e), t.t <= 0 && u)) {
          ((t.st = 1), (t.t2 = 0.55), (t.ta = o), i.emit("charge", { x: t.x, y: t.y, type: "leaper" }));
        }
      } else if (t.st === 1) {
        ((t.vx = 0),
          (t.vy = 0),
          (t.ta = turnToward(t.ta, o, 3.8 * e)),
          (t.face = t.ta),
          (t.t2 -= e),
          t.t2 <= 0 &&
            ((t.st = 2),
            (t.t2 = 0.6),
            (t.vx = Math.cos(t.ta) * 13),
            (t.vy = Math.sin(t.ta) * 13),
            i.emit("blink", { x: t.x, y: t.y, leap: !0 })));
      } else {
        ((t.t2 -= e),
          (t.vx *= 0.975),
          (t.vy *= 0.975),
          (t.hitWall || t.t2 <= 0) && ((t.st = 0), (t.t = 2.2 + i.rng.next() * 1.3), (t.hitWall = !1)));
      }
      t.face = turnToward(t.face, t.st === 1 ? t.ta : Math.atan2(t.vy, t.vx), 10 * e);
      return;
    }
    case "turret": {
      if (t.st === 0) {
        (a > 16 || !t.los
          ? ((t.vx = c * l), (t.vy = h * l))
          : a < 8
            ? ((t.vx = (-s / a) * l), (t.vy = (-r / a) * l))
            : ((t.vx *= 0.82), (t.vy *= 0.82)),
          (t.t -= e),
          t.t <= 0 &&
            t.los &&
            a < 19 &&
            u &&
            ((t.st = 1), (t.t2 = 0.62), (t.ta = o), i.emit("aim", { x: t.x, y: t.y, type: "turret" })));
      } else
        ((t.vx *= 0.8),
          (t.vy *= 0.8),
          (t.ta = turnToward(t.ta, o, 2.6 * e)),
          (t.face = t.ta),
          (t.t2 -= e),
          t.t2 <= 0 &&
            (i.shoot(t.x + Math.cos(t.ta) * 0.7, t.y + Math.sin(t.ta) * 0.7, t.ta, 19, t.dmg, {
              kind: "turret",
              r: 0.21,
            }),
            t.elite &&
              i.shoot(
                t.x + Math.cos(t.ta) * 0.7,
                t.y + Math.sin(t.ta) * 0.7,
                t.ta + (i.rng.chance(0.5) ? 0.12 : -0.12),
                19,
                t.dmg * 0.72,
                { kind: "turret", r: 0.18 },
              ),
            i.emit("eshot", { x: t.x, y: t.y, type: "turret" }),
            (t.st = 0),
            (t.t = 2.4 + i.rng.next() * 1.1)));
      return;
    }
    case "mender": {
      if (a > 13 || !t.los) ((t.vx = c * l), (t.vy = h * l));
      else if (a < 8) ((t.vx = (-s / a) * l), (t.vy = (-r / a) * l));
      else {
        let f = Math.sin(t.phase) > 0 ? 1 : -1;
        ((t.vx = (-r / a) * f * l * 0.5), (t.vy = (s / a) * f * l * 0.5));
      }
      if (((t.t -= e), t.t <= 0)) {
        t.t = 2.8;
        let f = null,
          p = 0.92;
        (i.hash.query(t.x, t.y, 9, (x) => {
          if (x.dead || x === t || x.boss || x.type === "mender" || Math.hypot(x.x - t.x, x.y - t.y) > 9) return;
          let m = x.hp / x.maxHp;
          m < p && ((p = m), (f = x));
        }),
          f &&
            ((f.hp = Math.min(f.maxHp, f.hp + f.maxHp * (t.elite ? 0.22 : 0.15))),
            i.emit("mend", { x: t.x, y: t.y, tx: f.x, ty: f.y })));
      }
      t.face = turnToward(t.face, o, 5 * e);
      return;
    }
    case "mortar": {
      if (
        (a > 16 || !t.los
          ? ((t.vx = c * l), (t.vy = h * l))
          : a < 9
            ? ((t.vx = (-s / a) * l), (t.vy = (-r / a) * l))
            : ((t.vx *= 0.85), (t.vy *= 0.85)),
        (t.t -= e),
        t.st === 1 && ((t.t2 -= e), t.t2 <= 0 && (t.st = 0)),
        t.t <= 0 && a < 19 && u)
      ) {
        let f = t.elite ? 3 : 1;
        for (let p = 0; p < f; p++) {
          let m = n.x + n.vx * 0.9 + (f > 1 ? i.rng.range(-2.2, 2.2) : 0),
            g = n.y + n.vy * 0.9 + (f > 1 ? i.rng.range(-2.2, 2.2) : 0);
          ((m = Math.max(-i.arena.W + 1, Math.min(i.arena.W - 1, m))),
            (g = Math.max(-i.arena.H + 1, Math.min(i.arena.H - 1, g))),
            i.hazard({ x: m, y: g, r: 2, delay: 1.5 + p * 0.15, dmg: t.dmg, kind: "mortar", sx: t.x, sy: t.y }));
        }
        (i.emit("lob", { x: t.x, y: t.y }),
          (t.st = 1),
          (t.t2 = 0.35),
          (t.t = (3.8 + i.rng.next() * 1.2) * (t.los ? 1 : 1.6)));
      }
      t.face = turnToward(t.face, o, 4 * e);
      return;
    }
  }
  Math.hypot(t.vx, t.vy) > 0.2 && (t.face = turnToward(t.face, Math.atan2(t.vy, t.vx), 8 * e));
}
var bossPatterns = {
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
function initBoss(i, t) {
  ((t.st = "walk"), (t.t = 2.2), (t.t2 = 0), (t.n = 0), (t.pattern = 0), (t.spin = 0), (t.phaseN = 1));
}
function nextBossAttack(i, t) {
  let e = bossPatterns[t.type];
  ((t.st = e[t.pattern % e.length]),
    t.pattern++,
    (t.t = 0),
    (t.t2 = 0),
    (t.n = 0),
    i.emit("bossAtk", { id: t.type, atk: t.st }));
}
function endBossAttack(i, t) {
  ((i.st = "walk"), (i.t = t), (i.n = 0), (i.t2 = 0));
}
function updateBoss(i, t, e) {
  if (t.spawnT > 0) {
    ((t.vx = 0), (t.vy = 0));
    return;
  }
  let n = i.player,
    s = n.x - t.x,
    r = n.y - t.y,
    a = Math.hypot(s, r) || 0.001,
    o = Math.atan2(r, s),
    c = t.hp / t.maxHp,
    h = t.dmg * 0.7;
  !t.enraged &&
    c < (t.type === "queen" ? 0.4 : 0.5) &&
    ((t.enraged = !0), i.emit("enrage", { id: t.type, x: t.x, y: t.y }));
  let l = t.enraged ? 1 : 0;
  if (((t.spin += e), t.type === "core")) {
    let u = c > 0.66 ? 1 : c > 0.33 ? 2 : 3;
    if (u !== t.phaseN) {
      ((t.phaseN = u), (t.shieldT = 1.4));
      for (let d of i.eb) d.life = 0;
      ((i.beams.length = 0), i.emit("phase", { n: u, x: t.x, y: t.y }), endBossAttack(t, 1.6));
    }
    t.shieldT > 0 && ((t.shieldT -= e), (t.shielded = t.shieldT > 0));
  }
  if (t.st === "walk") {
    ((t.t -= e), moveBoss(i, t, e, o, a), t.t <= 0 && nextBossAttack(i, t), (t.face = turnToward(t.face, o, 3 * e)));
    return;
  }
  switch (((t.t += e), t.type)) {
    case "warden": {
      if (t.st === "charge") {
        let u = 2 + l;
        if (
          (t.t2 === 0 &&
            ((t.t2 = 1), (t.ta = o), (t.sub = 0), (t.subT = 0), i.emit("charge", { x: t.x, y: t.y, type: "warden" })),
          (t.subT += e),
          t.sub === 0)
        )
          ((t.vx = 0),
            (t.vy = 0),
            t.subT < 0.5 && (t.ta = turnToward(t.ta, o, 3 * e)),
            (t.face = turnToward(t.face, t.ta, 8 * e)),
            t.subT > (l ? 0.65 : 0.85) && ((t.sub = 1), (t.subT = 0)));
        else if (t.sub === 1) {
          let d = l ? 18 : 15.5;
          ((t.vx = Math.cos(t.ta) * d),
            (t.vy = Math.sin(t.ta) * d),
            (t.charging = !0),
            ((t.hitWall && t.subT > 0.1) || t.subT > 0.8) &&
              ((t.charging = !1),
              t.hitWall && (i.emit("thud", { x: t.x, y: t.y, big: !0 }), l && shootRing(i, t, 10, 7.5, h, t.spin)),
              (t.sub = 2),
              (t.subT = 0)));
        } else
          ((t.vx *= 0.8),
            (t.vy *= 0.8),
            t.subT > 0.45 &&
              (t.n++,
              t.n >= u
                ? endBossAttack(t, 2.2 - l * 0.6)
                : ((t.sub = 0), (t.subT = 0), (t.ta = o), i.emit("charge", { x: t.x, y: t.y, type: "warden" }))));
        return;
      }
      if (t.st === "ring") {
        ((t.vx *= 0.85), (t.vy *= 0.85));
        let u = 3 + l,
          d = 0.55;
        (t.t >= 0.4 + t.n * d &&
          t.n < u &&
          (shootRing(i, t, 16 + l * 6, 7 + l, h, (t.n % 2) * (Math.PI / (16 + l * 6))),
          t.n++,
          i.emit("eshot", { x: t.x, y: t.y, type: "boss" })),
          t.t > 0.4 + u * d + 0.4 && endBossAttack(t, 2.4 - l * 0.7));
        return;
      }
      if (t.st === "stomp") {
        if (
          ((t.vx = 0),
          (t.vy = 0),
          t.n === 0 && ((t.n = 1), i.hazard({ x: t.x, y: t.y, r: 4.8, delay: 1, dmg: t.dmg, kind: "stomp" }), l))
        )
          for (let u = 0; u < 3; u++) {
            let d = i.rng.next() * TAU,
              f = i.rng.range(0, 3);
            i.hazard({
              x: clamp(n.x + Math.cos(d) * f, -i.arena.W + 1, i.arena.W - 1),
              y: clamp(n.y + Math.sin(d) * f, -i.arena.H + 1, i.arena.H - 1),
              r: 2.4,
              delay: 1.25 + u * 0.2,
              dmg: t.dmg * 0.8,
              kind: "stomp",
            });
          }
        (t.n === 1 && t.t > 1 && ((t.n = 2), shootRing(i, t, 12, 9, h, 0), i.emit("thud", { x: t.x, y: t.y, big: !0 })),
          t.t > 1.6 && endBossAttack(t, 2));
        return;
      }
      break;
    }
    case "queen": {
      if ((moveBoss(i, t, e, o, a, 0.4), t.st === "summon")) {
        if (t.n === 0) {
          t.n = 1;
          let u = 5 + l * 2;
          for (let d = 0; d < u; d++) {
            let f = (d / u) * TAU + t.spin,
              p = i.spawnEnemy("swarmer", t.x + Math.cos(f) * 2.4, t.y + Math.sin(f) * 2.4, { hpF: 1 });
            ((p.spawnT = 0.3), (p.noDrop = i.rng.chance(0.6)), (p.kx = Math.cos(f) * 5), (p.ky = Math.sin(f) * 5));
          }
          i.emit("hatch", { x: t.x, y: t.y, big: !0 });
        }
        t.t > 1 && endBossAttack(t, 1.4);
        return;
      }
      if (t.st === "spiral") {
        let u = 3 + l * 2;
        for (t.t2 += e; t.t2 > 0.1; ) {
          ((t.t2 -= 0.1), (t.ta = (t.ta || 0) + 0.24));
          for (let d = 0; d < u; d++) i.shoot(t.x, t.y, t.ta + (d / u) * TAU, 6.2, h, { r: 0.26 });
        }
        t.t > 3.2 && endBossAttack(t, 1.4);
        return;
      }
      if (t.st === "burst") {
        if (t.t >= 0.35 + t.n * 0.42 && t.n < 3 + l) {
          for (let u = 0; u < 5; u++) i.shoot(t.x, t.y, o + (u - 2) * 0.16, 9.5, h);
          (t.n++, i.emit("eshot", { x: t.x, y: t.y, type: "boss" }));
        }
        t.t > 2 && endBossAttack(t, 1.3);
        return;
      }
      if (t.st === "eggs") {
        if (t.n === 0) {
          t.n = 1;
          for (let u = 0; u < 3 + l; u++) {
            let d = o + (u - 1) * 0.6,
              f = i.spawnEnemy("bomber", t.x + Math.cos(d) * 2, t.y + Math.sin(d) * 2, {});
            ((f.spawnT = 0.3), (f.kx = Math.cos(d) * 9), (f.ky = Math.sin(d) * 9), (f.noDrop = !0));
            // 2.4.6: every hatched egg leaves a short-lived acid puddle where it lay (Toxin Marsh)
            i.arena.acid.filter((p) => p.life != null).length < 12 &&
              i.arena.acid.push({
                x: clamp(t.x + Math.cos(d) * 2, -i.arena.W + 1, i.arena.W - 1),
                y: clamp(t.y + Math.sin(d) * 2, -i.arena.H + 1, i.arena.H - 1),
                r: 1.3,
                life: 4.5,
              });
          }
          i.emit("hatch", { x: t.x, y: t.y, big: !0 });
        }
        t.t > 1.2 && endBossAttack(t, 1.6);
        return;
      }
      break;
    }
    case "prism": {
      // 2.4.6: the Frost Prism of Cryo Vault. Frost Beam, Ice Lances and Ice Shards were the Laser
      // Sweep, Lances and Homing Shards of the old Prism; Frost Nova and Glacier are new.
      if (t.st === "frostbeam") {
        if (((t.vx *= 0.8), (t.vy *= 0.8), t.n === 0)) {
          t.n = 1;
          let u = i.rng.chance(0.5) ? 1 : -1,
            d = o - u * 1.15,
            f = u * (l ? 1.25 : 1),
            b = {
              x: t.x,
              y: t.y,
              rot: f,
              warn: 0.95,
              dur: 2.2,
              w: 0.85,
              dmg: t.dmg,
              follow: t,
              len: 34,
              color: PRISM_ICE,
            };
          (i.beam({ ...b, a: d }), l && i.beam({ ...b, a: d + Math.PI }), i.emit("beamWarn", { x: t.x, y: t.y }));
        }
        t.t > 3.4 && endBossAttack(t, 1.2);
        return;
      }
      if (t.st === "teleport") {
        if (
          ((t.vx = 0),
          (t.vy = 0),
          t.n === 0 && ((t.n = 1), (t.ghost = !0), i.emit("blink", { x: t.x, y: t.y })),
          t.n === 1 && t.t > 0.45)
        ) {
          t.n = 2;
          let u = findOpenSpot(i, n.x, n.y, 8, 10.5);
          u
            ? ((t.tx = u.x),
              (t.ty = u.y),
              i.markers.push({ x: u.x, y: u.y, t: 0, dur: 99, type: "_prism", done: !1, fake: !0 }))
            : ((t.tx = t.x), (t.ty = t.y));
        }
        (t.n === 2 &&
          t.t > 1.15 &&
          ((t.n = 3),
          (i.markers = i.markers.filter((u) => !u.fake)),
          (t.x = t.tx),
          (t.y = t.ty),
          (t.ghost = !1),
          shootRing(i, t, 12 + l * 4, 6.5, h, t.spin, "shard"),
          i.emit("blink", { x: t.x, y: t.y, in: !0 })),
          t.t > 1.6 && endBossAttack(t, 0.9));
        return;
      }
      if (t.st === "iceshards") {
        if ((moveBoss(i, t, e, o, a, 0.3), t.t >= 0.3 + t.n * 0.12 && t.n < 8 + l * 4)) {
          let u = o + Math.PI + (t.n - 4) * 0.4;
          (i.shoot(t.x, t.y, u, 5.5, h, { kind: "shard", homing: 1.3, life: 5, r: 0.24 }), t.n++);
        }
        t.t > 2.4 && endBossAttack(t, 1.2);
        return;
      }
      if (t.st === "icelances") {
        ((t.vx *= 0.8), (t.vy *= 0.8));
        let u = 3 + l * 2;
        if (t.t >= 0.2 + t.n * 0.45 && t.n < u) {
          let f = n.x + n.vx * 0.5,
            p = n.y + n.vy * 0.5;
          (i.beam({
            x: t.x,
            y: t.y,
            a: Math.atan2(p - t.y, f - t.x),
            warn: 0.6,
            dur: 0.22,
            w: 1,
            dmg: t.dmg,
            len: 34,
            color: PRISM_ICE,
          }),
            t.n++,
            i.emit("beamWarn", { x: t.x, y: t.y, small: !0 }));
        }
        t.t > 0.2 + u * 0.45 + 0.8 && endBossAttack(t, 1.2);
        return;
      }
      if (t.st === "frostnova") {
        // Frost Nova: the Prism roots itself, a marked zone around it freezes over (close range
        // only), then the ice shatters outwards in two (enraged: three) staggered shard rings.
        ((t.vx *= 0.8), (t.vy *= 0.8));
        let u = 2 + l;
        t.n === 0 &&
          ((t.n = 1),
          i.hazard({ x: t.x, y: t.y, r: 3.6, delay: 0.9, dmg: t.dmg * 0.8, kind: "frost" }),
          i.emit("charge", { x: t.x, y: t.y, type: "prism" }));
        if (t.n >= 1 && t.n <= u && t.t >= 0.9 + (t.n - 1) * 0.45) {
          let d = 14 + l * 2;
          (shootRing(i, t, d, 5.2 + t.n * 0.9, h, t.spin + ((t.n % 2) * Math.PI) / d, "shard"),
            t.n++,
            i.emit("eshot", { x: t.x, y: t.y, type: "boss" }));
        }
        t.t > 0.9 + u * 0.45 + 0.5 && endBossAttack(t, 1.3);
        return;
      }
      if (t.st === "glacier") {
        // Glacier: marked zones on and around the player freeze one after another; a zone that
        // catches the player chills it (slower for 1.6 s, see World.updateHazards 2.4.6).
        if ((moveBoss(i, t, e, o, a, 0.5), t.n === 0)) {
          ((t.n = 1), i.emit("charge", { x: t.x, y: t.y, type: "prism" }));
          let u = 3 + l;
          for (let d = 0; d < u; d++) {
            let f =
              d === 0
                ? {
                    x: clamp(n.x + n.vx * 0.4, -i.arena.W + 1, i.arena.W - 1),
                    y: clamp(n.y + n.vy * 0.4, -i.arena.H + 1, i.arena.H - 1),
                  }
                : findOpenSpot(i, n.x, n.y, 2.5, 6.5);
            f && i.hazard({ x: f.x, y: f.y, r: 2.3, delay: 1.25 + d * 0.22, dmg: t.dmg * 0.55, kind: "glacier" });
          }
        }
        t.t > 2.6 && endBossAttack(t, 1.3);
        return;
      }
      break;
    }
    case "core": {
      let u = t.phaseN;
      if ((moveBoss(i, t, e, o, a, 0.2), t.st === "spiral")) {
        let d = 4 + (u - 1) * 1;
        t.t2 += e;
        let f = u === 3 ? 0.08 : 0.11;
        for (; t.t2 > f; ) {
          ((t.t2 -= f), (t.ta = (t.ta || 0) + (u === 2 ? -0.2 : 0.2)));
          for (let p = 0; p < d; p++) i.shoot(t.x, t.y, t.ta + (p / d) * TAU, 6 + u * 0.5, h, { r: 0.26 });
        }
        t.t > 3 && endBossAttack(t, 1.2);
        return;
      }
      if (t.st === "summon") {
        if (t.n === 0) {
          t.n = 1;
          let d =
            u === 1
              ? ["grunt", "grunt", "gunner", "gunner"]
              : u === 2
                ? ["grunt", "gunner", "bomber", "striker"]
                : ["brute", "bulwark", "striker", "mortar"];
          for (let f of d) {
            let p = i.arena.freePoint(i.rng, n.x, n.y, 7, 1);
            i.markers.push({ x: p.x, y: p.y, t: 0, dur: 1, type: f, elite: !1, done: !1 });
          }
          i.emit("portal", { x: t.x, y: t.y, n: d.length });
        }
        t.t > 1 && endBossAttack(t, 1.2);
        return;
      }
      if (t.st === "ring") {
        (t.t >= 0.3 + t.n * 0.5 &&
          t.n < 2 + u &&
          (shootRing(i, t, 18 + u * 2, 7, h, (t.n % 2) * 0.15),
          t.n++,
          i.emit("eshot", { x: t.x, y: t.y, type: "boss" })),
          t.t > 0.3 + (2 + u) * 0.5 + 0.3 && endBossAttack(t, 1.3));
        return;
      }
      if (t.st === "cross") {
        if (u === 1) {
          nextBossAttack(i, t);
          return;
        }
        if (t.n === 0) {
          t.n = 1;
          let d = u === 3 ? 4 : 3,
            f = (i.rng.chance(0.5) ? 1 : -1) * (u === 3 ? 0.55 : 0.42);
          for (let p = 0; p < d; p++)
            i.beam({
              x: t.x,
              y: t.y,
              a: o + 0.6 + (p / d) * TAU,
              rot: f,
              warn: 1.2,
              dur: 3.2,
              w: 0.9,
              dmg: t.dmg,
              follow: t,
              len: 34,
            });
          i.emit("beamWarn", { x: t.x, y: t.y });
        }
        if (u === 3 && ((t.t2 += e), t.t2 > 0.7)) {
          t.t2 = 0;
          for (let d = -1; d <= 1; d++) i.shoot(t.x, t.y, o + d * 0.2, 8.5, h);
        }
        t.t > 4.6 && endBossAttack(t, 1.4);
        return;
      }
      if (t.st === "burst") {
        if (t.t >= 0.3 + t.n * 0.35 && t.n < 3 + u) {
          for (let d = 0; d < 7; d++) i.shoot(t.x, t.y, o + (d - 3) * 0.13, 9 + u * 0.5, h);
          (t.n++, i.emit("eshot", { x: t.x, y: t.y, type: "boss" }));
        }
        t.t > 0.3 + (3 + u) * 0.35 + 0.4 && endBossAttack(t, 1.2);
        return;
      }
      if (t.st === "rain") {
        if (t.n === 0) {
          t.n = 1;
          let d = 4 + u * 2;
          for (let f = 0; f < d; f++) {
            let p = f === 0 ? { x: n.x, y: n.y } : findOpenSpot(i, n.x, n.y, 1.5, 7);
            p && i.hazard({ x: p.x, y: p.y, r: 2.2, delay: 1.1 + f * 0.12, dmg: t.dmg * 0.8, kind: "rain" });
          }
        }
        t.t > 2.4 && endBossAttack(t, 1.2);
        return;
      }
      break;
    }
    case "forge":
      if (updateCrucible(i, t, e, o, a, h, l)) return;
      break;
  }
  endBossAttack(t, 1);
}
function moveBoss(i, t, e, n, s, r = 1) {
  let a = t.speed * (t.enraged ? 1.3 : 1) * r;
  if (t.type === "queen" || t.type === "prism") {
    let o = t.type === "queen" ? 8 : 9,
      c = s > o + 1 ? 1 : s < o - 1 ? -1 : 0,
      h = i.player,
      l = (h.x - t.x) / s,
      u = (h.y - t.y) / s;
    ((t.vx = (l * c - u * 0.7) * a * 1.4), (t.vy = (u * c + l * 0.7) * a * 1.4));
    return;
  }
  if (t.type === "core") {
    let o = i.player,
      c = o.x * 0.25 - t.x,
      h = o.y * 0.25 - t.y,
      l = Math.hypot(c, h);
    l > 0.5 ? ((t.vx = (c / l) * a), (t.vy = (h / l) * a)) : ((t.vx *= 0.9), (t.vy *= 0.9));
    return;
  }
  (i.chaseDir(t), (t.vx = i.cdx * a), (t.vy = i.cdy * a));
}
function shootRing(i, t, e, n, s, r, a) {
  for (let o = 0; o < e; o++) i.shoot(t.x, t.y, r + (o / e) * TAU, n, s, { kind: a || "orb", r: 0.27 });
}
function findOpenSpot(i, t, e, n, s) {
  for (let r = 0; r < 20; r++) {
    let a = i.rng.next() * TAU,
      o = i.rng.range(n, s),
      c = t + Math.cos(a) * o,
      h = e + Math.sin(a) * o;
    if (!i.arena.outside(c, h, 2) && !i.arena.blocked(c, h, 2) && !i.arena.featureBlocked(c, h, 0.6))
      return { x: c, y: h };
  }
  for (let r = 0; r < 16; r++) {
    let a = (r / 16) * TAU,
      c = clamp(t * 0.4 + Math.cos(a) * Math.max(n, 2.5), -i.arena.W + 3, i.arena.W - 3),
      h = clamp(e * 0.4 + Math.sin(a) * Math.max(n, 2.5), -i.arena.H + 3, i.arena.H - 3);
    if (!i.arena.outside(c, h, 2) && !i.arena.blocked(c, h, 2) && !i.arena.featureBlocked(c, h, 0.6))
      return { x: c, y: h };
  }
  return null;
}
function updateEnemy(game, enemy, dt) {
  // stragglers (see RL_KITERS): hunting ranged enemies (RL_KITERS) come straight at the player.
  if (enemy.hunt && RL_KITERS.has(enemy.type) && !(enemy.spawnT > 0)) {
    game.chaseDir(enemy);
    const sp = Math.max(enemy.speed, 2.6) * 1.3;
    enemy.vx = game.cdx * sp;
    enemy.vy = game.cdy * sp;
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
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx),
      side = Math.sin(enemy.age * 2.1 + enemy.phase);
    if (dist < 7) {
      enemy.vx = (-dx / dist) * enemy.speed;
      enemy.vy = (-dy / dist) * enemy.speed;
    } else if (dist > 11) ((enemy.vx = Math.cos(ang) * enemy.speed), (enemy.vy = Math.sin(ang) * enemy.speed));
    else
      ((enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed),
        (enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed));
    enemy.face = turnToward(enemy.face, ang, 7 * dt);
    enemy.t -= dt;
    if (p.alive && dist < 16 && dist > 5 && enemy.t <= 0 && enemy.los) {
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
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
      enemy.face = turnToward(enemy.face, ang, 7 * dt);
      enemy.t -= dt;
      if (p.alive && dist < 8.7 && dist > 4.2 && enemy.t <= 0 && enemy.los) {
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
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (dist < 9.5) ((enemy.vx = -game.cdx * enemy.speed * 0.85), (enemy.vy = -game.cdy * enemy.speed * 0.85));
    else if (dist > 13) ((enemy.vx = game.cdx * enemy.speed), (enemy.vy = game.cdy * enemy.speed));
    else {
      const side = Math.sin(enemy.age * 1.5 + enemy.phase);
      enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed * 0.7;
      enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed * 0.7;
    }
    enemy.face = turnToward(enemy.face, ang, 5 * dt);
    enemy.t -= dt;
    if (enemy.t <= 0) {
      enemy.t = 3.0 + game.rng.next() * 0.8;
      game.hash.query(enemy.x, enemy.y, 6, (q) => {
        if (q === enemy || q.dead || q.boss || q.type === "beacon" || (q.beaconT || 0) > game.time) return;
        q.beaconT = game.time + 3;
        q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.08);
        q.healFlash = 0.3;
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
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx),
      side = Math.sin(enemy.age * 2.8 + enemy.phase);
    ((enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed),
      (enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed));
    enemy.face = turnToward(enemy.face, ang, 8 * dt);
    enemy.t -= dt;
    if (enemy.t <= 0) {
      const spot = game.arena.freePoint(game.rng, p.x, p.y, 7.4, 1.25);
      if (spot) {
        const ox = enemy.x,
          oy = enemy.y;
        enemy.x = spot.x;
        enemy.y = spot.y;
        game.arena.resolve(enemy, enemy.r);
        game.emit("warp", { x: ox, y: oy, tx: enemy.x, ty: enemy.y, who: "weaver" });
      }
      const a = spot ? Math.atan2(p.y - enemy.y, p.x - enemy.x) : ang;
      for (const off of [-0.22, 0, 0.22])
        game.shoot(enemy.x, enemy.y, a + off, 24, enemy.dmg * 0.72, { kind: "weaver", life: 2.6 });
      enemy.t = 3.4 + game.rng.next() * 1.2;
    }
    return;
  }
  // original roles
  if (enemy.type === "charger") {
    if (enemy.spawnT > 0) {
      ((enemy.vx = 0), (enemy.vy = 0));
      return;
    }
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      ((enemy.vx = game.cdx * enemy.speed),
        (enemy.vy = game.cdy * enemy.speed),
        (enemy.t -= dt),
        (enemy.face = turnToward(enemy.face, ang, 9 * dt)));
      if (p.alive && dist < 10.5 && dist > 4 && enemy.t <= 0 && enemy.los) {
        ((enemy.st = 1),
          (enemy.t2 = 0.48),
          (enemy.ta = ang),
          (enemy.vx *= 0.2),
          (enemy.vy *= 0.2),
          game.emit("charge", { x: enemy.x, y: enemy.y, type: enemy.type }));
      }
    } else if (enemy.st === 1) {
      ((enemy.vx *= 0.65),
        (enemy.vy *= 0.65),
        (enemy.t2 -= dt),
        (enemy.face = turnToward(enemy.face, enemy.ta, 16 * dt)));
      if (enemy.t2 <= 0) {
        ((enemy.st = 2),
          (enemy.t2 = 0.62),
          (enemy.vx = Math.cos(enemy.ta) * 16.5),
          (enemy.vy = Math.sin(enemy.ta) * 16.5),
          game.emit("edash", { x: enemy.x, y: enemy.y, a: enemy.ta, type: enemy.type }));
      }
    } else {
      ((enemy.t2 -= dt), (enemy.vx *= 0.985), (enemy.vy *= 0.985));
      if (enemy.t2 <= 0) ((enemy.st = 0), (enemy.t = 1.5 + game.rng.next() * 1.2));
    }
    return;
  }
  if (enemy.type === "minebot") {
    if (enemy.spawnT > 0) {
      ((enemy.vx = 0), (enemy.vy = 0));
      return;
    }
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001;
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      const retreat = dist < 5.2;
      ((enemy.vx = (retreat ? -game.cdx : game.cdx) * enemy.speed * (retreat ? 1.35 : 1)),
        (enemy.vy = (retreat ? -game.cdy : game.cdy) * enemy.speed * (retreat ? 1.35 : 1)),
        (enemy.t -= dt),
        (enemy.face = turnToward(enemy.face, Math.atan2(dy, dx), 8 * dt)));
      if (p.alive && dist < 10 && dist > 4.2 && enemy.t <= 0 && enemy.los) {
        ((enemy.st = 1),
          (enemy.t2 = 0.55),
          (enemy.vx = 0),
          (enemy.vy = 0),
          game.hazard({ x: enemy.x, y: enemy.y, r: 1.15, delay: 0.55, dmg: enemy.dmg * 1.25, kind: "mine" }),
          game.emit("mine", { x: enemy.x, y: enemy.y }));
      }
    } else {
      ((enemy.t2 -= dt), (enemy.face = turnToward(enemy.face, Math.atan2(dy, dx), 8 * dt)));
      if (enemy.t2 <= 0) ((enemy.st = 0), (enemy.t = 2.4 + game.rng.next() * 1.2));
    }
    return;
  }
  if (enemy.type === "sapper") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      const retreat = dist < 5.5;
      enemy.vx = (retreat ? -game.cdx : game.cdx) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.vy = (retreat ? -game.cdy : game.cdy) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.t -= dt;
      enemy.face = turnToward(enemy.face, ang, 8 * dt);
      if (p.alive && dist < 9.5 && dist > 4.2 && enemy.t <= 0 && enemy.los) {
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
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
      enemy.face = turnToward(enemy.face, ang, 10 * dt);
      enemy.t -= dt;
      if (p.alive && dist < 8.5 && dist > 3.8 && enemy.t <= 0) {
        enemy.st = 1;
        enemy.t2 = 0.82;
        enemy.ghost = true;
        enemy.t = 2.7;
        game.emit("blink", { x: enemy.x, y: enemy.y, small: !0, phase: !0 });
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
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      if (dist > 12) (game.chaseDir(enemy), (enemy.vx = game.cdx * enemy.speed), (enemy.vy = game.cdy * enemy.speed));
      else if (dist < 8.5)
        ((enemy.vx = (-dx / dist) * enemy.speed * 0.7), (enemy.vy = (-dy / dist) * enemy.speed * 0.7));
      else ((enemy.vx *= 0.65), (enemy.vy *= 0.65));
      enemy.face = turnToward(enemy.face, ang, 6 * dt);
      enemy.t -= dt;
      if (p.alive && dist < 15 && dist > 6 && enemy.t <= 0 && enemy.los) {
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
        game.emit("beamWarn", { x: enemy.x, y: enemy.y, small: !0 });
        enemy.st = 2;
        enemy.t2 = 2.5 + game.rng.next() * 1.2;
      }
    } else {
      enemy.t2 -= dt;
      if (enemy.t2 <= 0) ((enemy.st = 0), (enemy.t = 0.5 + game.rng.next() * 0.8));
    }
    return;
  }
  if (enemy.type === "carrier") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const p = game.player,
      dx = p.x - enemy.x,
      dy = p.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (dist < 8.5) ((enemy.vx = (-dx / dist) * enemy.speed), (enemy.vy = (-dy / dist) * enemy.speed));
    else if (dist > 12)
      (game.chaseDir(enemy), (enemy.vx = game.cdx * enemy.speed), (enemy.vy = game.cdy * enemy.speed));
    else {
      const side = Math.sin(enemy.age * 1.7 + enemy.phase);
      enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed;
      enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed;
    }
    enemy.face = turnToward(enemy.face, ang, 7 * dt);
    enemy.t -= dt;
    if (p.alive && dist < 14 && dist > 7 && enemy.t <= 0 && enemy.los) {
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
  const p = game.player;
  for (const v of game.arena.vents)
    Math.hypot(v.x - p.x, v.y - p.y) < 15 &&
      boss.fx.push(game.hazard({ x: v.x, y: v.y, r: v.r + 0.5, delay, dmg, kind: "rain" }));
}
function updateCrucible(game, boss, dt, aim, dist, shotDmg, rage) {
  const p = game.player,
    arena = game.arena,
    inside = (x, y) => !arena.outside(x, y, 0.8);
  // lava fountains where tracked blasts go off (vents and some of the eruption bursts)
  if (boss.fx)
    for (const hz of boss.fx) hz.done && !hz.fx && ((hz.fx = 1), game.emit("erupt", { x: hz.x, y: hz.y, r: hz.r }));
  const end = (walk) => {
    ((boss.fx = null), (boss.charging = !1), endBossAttack(boss, walk));
  };
  switch (boss.st) {
    case "hammer": {
      const wind = rage ? 0.8 : 1;
      ((boss.vx *= 0.8), (boss.vy *= 0.8));
      if (boss.n === 0) {
        ((boss.n = 1), (boss.charging = !0), (boss.ta = aim));
        game.hazard({ x: boss.x, y: boss.y, r: 4.4, delay: wind, dmg: boss.dmg, kind: "stomp" });
        for (const off of rage ? [-0.5, 0, 0.5] : [0])
          for (let k = 0; k < 5; k++) {
            const d = 5.2 + k * 2.4,
              x = boss.x + Math.cos(aim + off) * d,
              y = boss.y + Math.sin(aim + off) * d;
            inside(x, y) &&
              game.hazard({ x, y, r: 1.45, delay: wind + 0.12 + k * 0.12, dmg: boss.dmg * 0.8, kind: "stomp" });
          }
        game.emit("charge", { x: boss.x, y: boss.y, type: "forge" });
      }
      boss.face = turnToward(boss.face, boss.ta, 6 * dt);
      if (boss.n === 1 && boss.t >= wind) {
        ((boss.n = 2), (boss.charging = !1));
        shootRing(game, boss, 12 + rage * 4, 6.5, shotDmg, boss.spin, "slag");
        game.emit("thud", { x: boss.x, y: boss.y, big: !0 });
      }
      if (boss.n === 2 && rage && boss.t >= wind + 0.45) {
        boss.n = 3;
        shootRing(game, boss, 16, 5, shotDmg, boss.spin + Math.PI / 16, "slag");
      }
      boss.t > wind + 1.1 && end(2 - rage * 0.5);
      return !0;
    }
    case "slag": {
      moveBoss(game, boss, dt, aim, dist, 0.35);
      const salvos = 3 + rage;
      if (boss.t >= 0.35 + boss.n * 0.6 && boss.n < salvos) {
        boss.n++;
        const spots = [
          [p.x, p.y],
          [p.x + p.vx * 1.1, p.y + p.vy * 1.1],
        ];
        if (rage) {
          const a = game.rng.next() * TAU,
            d = game.rng.range(2.5, 5);
          spots.push([p.x + Math.cos(a) * d, p.y + Math.sin(a) * d]);
        }
        spots.forEach(([x, y], k) => {
          ((x = clamp(x, -arena.W + 1, arena.W - 1)), (y = clamp(y, -arena.H + 1, arena.H - 1)));
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
      boss.t > 0.35 + salvos * 0.6 + 1.1 && end(1.6 - rage * 0.3);
      return !0;
    }
    case "eruption": {
      ((boss.vx *= 0.8), (boss.vy *= 0.8));
      const first = 1,
        step = rage ? 0.35 : 0.45;
      if (boss.n === 0) {
        ((boss.n = 1), (boss.fx = []));
        const turn = game.rng.next() * TAU;
        for (let ring = 0; ring < 3; ring++) {
          const R = 4.5 + ring * 4.5,
            count = 5 * (ring + 1);
          for (let k = 0; k < count; k++) {
            const a = turn + ((k + (ring % 2) * 0.5) / count) * TAU,
              x = boss.x + Math.cos(a) * R,
              y = boss.y + Math.sin(a) * R;
            if (!inside(x, y)) continue;
            const hz = game.hazard({ x, y, r: 1.4, delay: first + ring * step, dmg: boss.dmg * 0.85, kind: "rain" });
            k % 3 === 0 && boss.fx.push(hz);
          }
        }
        crucibleVents(game, boss, first + 0.3, boss.dmg * 0.9);
        rage && game.hazard({ x: p.x, y: p.y, r: 2, delay: first + 0.5, dmg: boss.dmg * 0.8, kind: "rain" });
        ((boss.charging = !0), game.emit("charge", { x: boss.x, y: boss.y, type: "forge" }));
      }
      boss.t >= first && (boss.charging = !1);
      boss.t > first + 2 * step + 0.6 && end(1.8 - rage * 0.4);
      return !0;
    }
    case "furnace": {
      ((boss.vx *= 0.85), (boss.vy *= 0.85));
      const waves = 3 + rage,
        count = 7,
        spread = 1.1;
      boss.n === 0 && boss.t2 === 0 && ((boss.t2 = 1), (boss.ta = aim), (boss.charging = !0));
      // the mouth only turns slowly, so running around the fan gets out of it
      ((boss.ta = turnToward(boss.ta, aim, 0.45 * dt)), (boss.face = turnToward(boss.face, boss.ta, 6 * dt)));
      if (boss.t >= 0.6 + boss.n * 0.5 && boss.n < waves) {
        boss.charging = !1;
        const half = boss.n % 2 ? 0.5 : 0,
          mx = boss.x + Math.cos(boss.face) * 1.6,
          my = boss.y + Math.sin(boss.face) * 1.6;
        for (let k = 0; k < count - (half ? 1 : 0); k++) {
          const a = boss.face + (k + half - (count - 1) / 2) * (spread / (count - 1));
          game.shoot(mx, my, a, 5.2 + rage * 0.6, shotDmg, { kind: "slag", r: 0.34, life: 6 });
        }
        (boss.n++, game.emit("eshot", { x: boss.x, y: boss.y, type: "boss" }));
      }
      boss.t > 0.6 + waves * 0.5 + 0.4 && end(1.6 - rage * 0.3);
      return !0;
    }
    case "stoke": {
      ((boss.vx *= 0.8), (boss.vy *= 0.8));
      if (boss.n === 0) {
        ((boss.n = 1), (boss.fx = []), (boss.charging = !0));
        const kinds = rage ? ["bomber", "bomber", "bomber", "brute"] : ["bomber", "bomber", "brute"],
          alive = game.enemies.filter((q) => !q.dead && !q.boss).length,
          room = Math.max(0, 10 - alive - game.markers.length);
        for (const type of kinds.slice(0, room)) {
          const pt = arena.freePoint(game.rng, p.x, p.y, 7, 1);
          game.markers.push({ x: pt.x, y: pt.y, t: 0, dur: 1.1, type, elite: !1, done: !1 });
        }
        crucibleVents(game, boss, 1.1, boss.dmg * 0.9);
        game.emit("portal", { x: boss.x, y: boss.y, n: Math.min(room, kinds.length) });
      }
      boss.t > 0.6 && (boss.charging = !1);
      boss.t > 1.5 && end(1.8 - rage * 0.4);
      return !0;
    }
  }
  return !1;
}

export { RL_KITERS, updateEnemy, rlInstallHunt, updateBoss, findOpenSpot, initBoss };
