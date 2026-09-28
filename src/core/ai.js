// Enemy and boss behaviour (mu, vu) and enemy variants.

import { clamp, TAU, turnToward } from "./util.js";

/* ---- stragglers: when only a few enemies are left for 9 s the game sets
 enemy.hunt so they come to the player. The 2.1/2.2 ranged enemies ignored
 it and could kite forever (the last Beacon fleeing into a corner). ---- */
var RL_KITERS = new Set(["turret", "minebot", "sapper", "sentinel", "carrier", "drone", "beacon", "weaver"]);
function rlInstallHunt() {
  const base = updateEnemy;
  updateEnemy = function (g, e, dt) {
    if (e.hunt && RL_KITERS.has(e.type) && !(e.spawnT > 0)) {
      g.chaseDir(e);
      const sp = Math.max(e.speed, 2.6) * 1.3;
      e.vx = g.cdx * sp;
      e.vy = g.cdy * sp;
      e.face = turnToward(e.face, Math.atan2(e.vy, e.vx), 8 * dt);
      e.st = 0;
      return;
    }
    return base(g, e, dt);
  };
}
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
  prism: ["sweep", "teleport", "shards", "lances", "teleport", "sweep"],
  core: ["spiral", "summon", "ring", "cross", "burst", "rain"],
};
// 2.4.6 placeholder until the Crucible gets its attacks (see the 2.4.6 section below)
bossPatterns.forge = ["walk"];
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
          }
          i.emit("hatch", { x: t.x, y: t.y, big: !0 });
        }
        t.t > 1.2 && endBossAttack(t, 1.6);
        return;
      }
      break;
    }
    case "prism": {
      if (t.st === "sweep") {
        if (((t.vx *= 0.8), (t.vy *= 0.8), t.n === 0)) {
          t.n = 1;
          let u = i.rng.chance(0.5) ? 1 : -1,
            d = o - u * 1.15,
            f = u * (l ? 1.25 : 1);
          (i.beam({ x: t.x, y: t.y, a: d, rot: f, warn: 0.95, dur: 2.2, w: 0.85, dmg: t.dmg, follow: t, len: 34 }),
            l &&
              i.beam({
                x: t.x,
                y: t.y,
                a: d + Math.PI,
                rot: f,
                warn: 0.95,
                dur: 2.2,
                w: 0.85,
                dmg: t.dmg,
                follow: t,
                len: 34,
              }),
            i.emit("beamWarn", { x: t.x, y: t.y }));
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
      if (t.st === "shards") {
        if ((moveBoss(i, t, e, o, a, 0.3), t.t >= 0.3 + t.n * 0.12 && t.n < 8 + l * 4)) {
          let u = o + Math.PI + (t.n - 4) * 0.4;
          (i.shoot(t.x, t.y, u, 5.5, h, { kind: "shard", homing: 1.3, life: 5, r: 0.24 }), t.n++);
        }
        t.t > 2.4 && endBossAttack(t, 1.2);
        return;
      }
      if (t.st === "lances") {
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
          }),
            t.n++,
            i.emit("beamWarn", { x: t.x, y: t.y, small: !0 }));
        }
        t.t > 0.2 + u * 0.45 + 0.8 && endBossAttack(t, 1.2);
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
function updateEnemy(i, t, e) {
  if (t.type === "charger") {
    if (t.spawnT > 0) {
      ((t.vx = 0), (t.vy = 0));
      return;
    }
    const p = i.player,
      dx = p.x - t.x,
      dy = p.y - t.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    i.chaseDir(t);
    if (t.st === 0) {
      ((t.vx = i.cdx * t.speed), (t.vy = i.cdy * t.speed), (t.t -= e), (t.face = turnToward(t.face, ang, 9 * e)));
      if (p.alive && dist < 10.5 && dist > 4 && t.t <= 0 && t.los) {
        ((t.st = 1),
          (t.t2 = 0.48),
          (t.ta = ang),
          (t.vx *= 0.2),
          (t.vy *= 0.2),
          i.emit("charge", { x: t.x, y: t.y, type: t.type }));
      }
    } else if (t.st === 1) {
      ((t.vx *= 0.65), (t.vy *= 0.65), (t.t2 -= e), (t.face = turnToward(t.face, t.ta, 16 * e)));
      if (t.t2 <= 0) {
        ((t.st = 2),
          (t.t2 = 0.62),
          (t.vx = Math.cos(t.ta) * 16.5),
          (t.vy = Math.sin(t.ta) * 16.5),
          i.emit("edash", { x: t.x, y: t.y, a: t.ta, type: t.type }));
      }
    } else {
      ((t.t2 -= e), (t.vx *= 0.985), (t.vy *= 0.985));
      if (t.t2 <= 0) ((t.st = 0), (t.t = 1.5 + i.rng.next() * 1.2));
    }
    return;
  }
  if (t.type === "minebot") {
    if (t.spawnT > 0) {
      ((t.vx = 0), (t.vy = 0));
      return;
    }
    const p = i.player,
      dx = p.x - t.x,
      dy = p.y - t.y,
      dist = Math.hypot(dx, dy) || 0.001;
    i.chaseDir(t);
    if (t.st === 0) {
      const retreat = dist < 5.2;
      ((t.vx = (retreat ? -i.cdx : i.cdx) * t.speed * (retreat ? 1.35 : 1)),
        (t.vy = (retreat ? -i.cdy : i.cdy) * t.speed * (retreat ? 1.35 : 1)),
        (t.t -= e),
        (t.face = turnToward(t.face, Math.atan2(dy, dx), 8 * e)));
      if (p.alive && dist < 10 && dist > 4.2 && t.t <= 0 && t.los) {
        ((t.st = 1),
          (t.t2 = 0.55),
          (t.vx = 0),
          (t.vy = 0),
          i.hazard({ x: t.x, y: t.y, r: 1.15, delay: 0.55, dmg: t.dmg * 1.25, kind: "mine" }),
          i.emit("mine", { x: t.x, y: t.y }));
      }
    } else {
      ((t.t2 -= e), (t.face = turnToward(t.face, Math.atan2(dy, dx), 8 * e)));
      if (t.t2 <= 0) ((t.st = 0), (t.t = 2.4 + i.rng.next() * 1.2));
    }
    return;
  }
  if (t.type === "sapper") {
    if (t.spawnT > 0) {
      t.vx = 0;
      t.vy = 0;
      return;
    }
    const p = i.player,
      dx = p.x - t.x,
      dy = p.y - t.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    i.chaseDir(t);
    if (t.st === 0) {
      const retreat = dist < 5.5;
      t.vx = (retreat ? -i.cdx : i.cdx) * t.speed * (retreat ? 1.35 : 1);
      t.vy = (retreat ? -i.cdy : i.cdy) * t.speed * (retreat ? 1.35 : 1);
      t.t -= e;
      t.face = turnToward(t.face, ang, 8 * e);
      if (p.alive && dist < 9.5 && dist > 4.2 && t.t <= 0 && t.los) {
        t.st = 1;
        t.t2 = 0.72;
        t.vx *= 0.15;
        t.vy *= 0.15;
        i.hazard({ x: t.x, y: t.y, r: 1.25, delay: 0.72, dmg: t.dmg * 1.25, kind: "sapper" });
        i.emit("mine", { x: t.x, y: t.y });
      }
    } else {
      t.t2 -= e;
      t.face = turnToward(t.face, ang, 8 * e);
      if (t.t2 <= 0) {
        t.st = 0;
        t.t = 2.4 + i.rng.next() * 1.3;
      }
    }
    return;
  }
  if (t.type === "phantom") {
    if (t.spawnT > 0) {
      t.vx = 0;
      t.vy = 0;
      return;
    }
    const p = i.player,
      dx = p.x - t.x,
      dy = p.y - t.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (t.st === 0) {
      i.chaseDir(t);
      t.vx = i.cdx * t.speed;
      t.vy = i.cdy * t.speed;
      t.face = turnToward(t.face, ang, 10 * e);
      t.t -= e;
      if (p.alive && dist < 8.5 && dist > 3.8 && t.t <= 0) {
        t.st = 1;
        t.t2 = 0.82;
        t.ghost = true;
        t.t = 2.7;
        i.emit("blink", { x: t.x, y: t.y, small: !0, phase: !0 });
      }
    } else if (t.st === 1) {
      t.ghost = true;
      t.vx *= 0.82;
      t.vy *= 0.82;
      t.t2 -= e;
      if (t.t2 <= 0) {
        t.ghost = false;
        t.st = 2;
        t.t2 = 0.32;
        t.vx = Math.cos(ang) * 13;
        t.vy = Math.sin(ang) * 13;
        i.emit("edash", { x: t.x, y: t.y, a: ang, type: t.type });
      }
    } else {
      t.ghost = false;
      t.t2 -= e;
      t.vx *= 0.985;
      t.vy *= 0.985;
      if (t.t2 <= 0) t.st = 0;
    }
    return;
  }
  if (t.type === "sentinel") {
    if (t.spawnT > 0) {
      t.vx = 0;
      t.vy = 0;
      return;
    }
    const p = i.player,
      dx = p.x - t.x,
      dy = p.y - t.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (t.st === 0) {
      if (dist > 12) (i.chaseDir(t), (t.vx = i.cdx * t.speed), (t.vy = i.cdy * t.speed));
      else if (dist < 8.5) ((t.vx = (-dx / dist) * t.speed * 0.7), (t.vy = (-dy / dist) * t.speed * 0.7));
      else ((t.vx *= 0.65), (t.vy *= 0.65));
      t.face = turnToward(t.face, ang, 6 * e);
      t.t -= e;
      if (p.alive && dist < 15 && dist > 6 && t.t <= 0 && t.los) {
        t.st = 1;
        t.t2 = 0.65;
        t.ta = ang;
        t.vx *= 0.2;
        t.vy *= 0.2;
      }
    } else if (t.st === 1) {
      t.t2 -= e;
      t.vx *= 0.72;
      t.vy *= 0.72;
      t.face = turnToward(t.face, t.ta, 8 * e);
      if (t.t2 <= 0) {
        i.beam({
          x: t.x,
          y: t.y,
          a: t.ta,
          len: 18,
          w: 0.2,
          warn: 0.55,
          dur: 0.48,
          rot: 0.08,
          dmg: t.dmg * 1.2,
          color: t.def.color,
        });
        i.emit("beamWarn", { x: t.x, y: t.y, small: !0 });
        t.st = 2;
        t.t2 = 2.5 + i.rng.next() * 1.2;
      }
    } else {
      t.t2 -= e;
      if (t.t2 <= 0) ((t.st = 0), (t.t = 0.5 + i.rng.next() * 0.8));
    }
    return;
  }
  if (t.type === "carrier") {
    if (t.spawnT > 0) {
      t.vx = 0;
      t.vy = 0;
      return;
    }
    const p = i.player,
      dx = p.x - t.x,
      dy = p.y - t.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (dist < 8.5) ((t.vx = (-dx / dist) * t.speed), (t.vy = (-dy / dist) * t.speed));
    else if (dist > 12) (i.chaseDir(t), (t.vx = i.cdx * t.speed), (t.vy = i.cdy * t.speed));
    else {
      const side = Math.sin(t.age * 1.7 + t.phase);
      t.vx = Math.cos(ang + Math.PI / 2) * side * t.speed;
      t.vy = Math.sin(ang + Math.PI / 2) * side * t.speed;
    }
    t.face = turnToward(t.face, ang, 7 * e);
    t.t -= e;
    if (p.alive && dist < 14 && dist > 7 && t.t <= 0 && t.los) {
      for (const off of [-0.16, 0, 0.16])
        i.shoot(t.x, t.y, ang + off, 20, t.dmg * 0.72, { kind: "carrier", life: 3.8, homing: 1.2 });
      t.t = 2.4 + i.rng.next() * 1.2;
      i.emit("eshot", { x: t.x, y: t.y });
    }
    return;
  }
  return updateEnemyCore(i, t, e);
}

/* New enemy roles use the same movement/shooting primitives as the core AI. */
const _rlUpdateEnemy22 = updateEnemy;
updateEnemy = function (game, enemy, dt) {
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
  return _rlUpdateEnemy22(game, enemy, dt);
};

export { RL_KITERS, updateEnemy, rlInstallHunt, updateBoss, findOpenSpot, initBoss };
