// 2D overlay canvas (Overlay): health bars, off-screen indicators, hints and callouts.

import { enemyDefs, bossDefs } from "../data/enemies.js";
import { clamp } from "../core/util.js";

var healthBarTypes = { brute: 1, hive: 1, splitter: 1, sniper: 1, gunner: 1, bulwark: 1, mortar: 1, striker: 1 },
  bossAttackNames = {
    charge: "CHARGE",
    ring: "BULLET RING",
    stomp: "STOMP",
    summon: "SUMMON",
    spiral: "SPIRAL",
    burst: "VOLLEY",
    eggs: "BROOD",
    sweep: "LASER SWEEP",
    teleport: "BLINK",
    shards: "HOMING SHARDS",
    lances: "LANCES",
    cross: "LASER CROSS",
    rain: "BOMBARDMENT",
    // 2.4.6: The Crucible
    hammer: "FORGE HAMMER",
    slag: "SLAG RAIN",
    eruption: "ERUPTION",
    furnace: "FURNACE BLAST",
    stoke: "STOKE",
  },
  Overlay = class {
    constructor(t) {
      ((this.c = t),
        (this.g = t.getContext("2d")),
        (this.tmp = { x: 0, y: 0, vis: !1, nx: 0, ny: 0 }),
        (this.tmp2 = { x: 0, y: 0, vis: !1, nx: 0, ny: 0 }),
        (this.w = 0),
        (this.h = 0),
        (this.hurts = []),
        (this.callouts = []),
        (this.time = 0));
    }
    addHurt(t, e, n) {
      if (e == null || !t) return;
      let s = Math.atan2(n - t.player.y, e - t.player.x);
      (this.hurts.length > 5 && this.hurts.shift(), this.hurts.push({ a: s, life: 0.8 }));
    }
    callout(t) {
      let e = bossAttackNames[t];
      e && (this.callouts = [{ t: e, life: 1.4 }]);
    }
    resize() {
      let t = this.c.clientWidth || window.innerWidth,
        e = this.c.clientHeight || window.innerHeight,
        n = Math.min(window.devicePixelRatio || 1, 2);
      (t === this.w && e === this.h && n === this.dpr) ||
        ((this.w = t),
        (this.h = e),
        (this.dpr = n),
        (this.c.width = Math.round(t * n)),
        (this.c.height = Math.round(e * n)));
    }
    clear() {
      (this.resize(), this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0), this.g.clearRect(0, 0, this.w, this.h));
    }
    draw(t, e, n, s = {}) {
      if ((this.clear(), !e)) return;
      let r = this.g,
        a = this.tmp,
        o = s.safe || { t: 0, b: 0, l: 0, r: 0 },
        c = s.dt || 0.016;
      this.time += c;
      let h = e.player,
        l = h.target;
      if (
        l &&
        !l.dead &&
        h.firing &&
        !h.manual &&
        h.alive &&
        (t.project(l.x, 0.6, l.y, a), t.project(l.x + l.r, 0.6, l.y, this.tmp2), a.vis)
      ) {
        let f = Math.max(12, Math.abs(this.tmp2.x - a.x) * 1.5 + 6),
          p = this.time * 2.2,
          x = f * 0.45;
        (r.save(), r.translate(a.x, a.y), r.rotate(p), (r.strokeStyle = "rgba(210,250,255,0.75)"), (r.lineWidth = 2));
        for (let m = 0; m < 4; m++)
          (r.rotate(Math.PI / 2),
            r.beginPath(),
            r.moveTo(f, -x * 0.5),
            r.lineTo(f, 0),
            r.lineTo(f - x * 0.5, 0),
            r.stroke());
        r.restore();
      }
      for (let f of e.enemies) {
        if (
          f.boss ||
          (f.hp >= f.maxHp && !(f.shieldMax > 0 && f.shield < f.shieldMax)) ||
          !(f.elite || healthBarTypes[f.type]) ||
          (t.project(f.x, 1.2 + f.r * 1.4, f.y, a), !a.vis)
        )
          continue;
        let p = 18 + f.r * 16,
          x = clamp(f.hp / f.maxHp, 0, 1);
        ((r.fillStyle = "rgba(0,0,0,0.55)"),
          r.fillRect(a.x - p / 2 - 1, a.y - 1, p + 2, 5),
          (r.fillStyle = f.elite ? "#ffc84a" : "#ff5a7a"),
          r.fillRect(a.x - p / 2, a.y, p * x, 3),
          f.shieldMax > 0 &&
            f.shield > 0 &&
            ((r.fillStyle = "#8fd4ff"), r.fillRect(a.x - p / 2, a.y - 4, p * (f.shield / f.shieldMax), 2)));
      }
      ((r.textAlign = "center"), (r.textBaseline = "middle"));
      for (let f of t.nums) {
        if (f.life <= 0 || (t.project(f.x, f.y, f.z, a), !a.vis)) continue;
        let p = clamp(f.life / 0.35, 0, 1),
          x = f.crit ? 19 : f.burn ? 12 : 14;
        r.font = `700 ${x}px "Chakra Petch", "Barlow Semi Condensed", system-ui, sans-serif`;
        let m = String(Math.max(1, Math.round(f.v)));
        ((r.globalAlpha = p),
          (r.lineWidth = 3),
          (r.strokeStyle = "rgba(6,8,16,0.85)"),
          r.strokeText(m, a.x, a.y),
          (r.fillStyle = f.crit ? "#ffd84a" : f.burn ? "#ff9a4a" : f.shield ? "#8fd4ff" : "#ffffff"),
          r.fillText(m, a.x, a.y));
      }
      r.globalAlpha = 1;
      let u = e.enemies.length <= 6,
        d = 26;
      for (let f of e.enemies) {
        let p =
          (f.type === "sniper" && f.st === 1) ||
          (f.type === "striker" && f.st === 1) ||
          (f.type === "mortar" && f.st === 1);
        if (
          (!f.boss && !u && !p && !(e.state === "fight" && e.stragglerT > 3)) ||
          (t.project(f.x, 0.6, f.y, a), a.vis && a.x > 8 && a.x < this.w - 8 && a.y > 8 && a.y < this.h - 8)
        )
          continue;
        let x = this.w / 2,
          m = this.h / 2,
          g = a.x - x,
          M = a.y - m;
        if ((a.nx === 0 && a.ny === 0) || !Number.isFinite(g) || !Number.isFinite(M)) continue;
        let b = Math.hypot(g, M) || 1;
        ((g /= b), (M /= b));
        let v = Math.abs(g) > 0.001 ? ((g > 0 ? this.w - d - o.r : d + o.l) - x) / g : 1 / 0,
          S = Math.abs(M) > 0.001 ? ((M > 0 ? this.h - d - o.b - 120 : d + o.t + 60) - m) / M : 1 / 0,
          T = Math.min(v, S),
          R = x + g * T,
          _ = m + M * T,
          E = p
            ? this.contrast
              ? "#fff06a"
              : "#ff3a4e"
            : f.boss
              ? cssColor(bossDefs[f.type].color)
              : f.elite
                ? "#ffc84a"
                : cssColor(enemyDefs[f.type].color);
        (r.save(),
          r.translate(R, _),
          r.rotate(Math.atan2(M, g)),
          (r.fillStyle = E),
          (r.globalAlpha = p ? (Math.floor(this.time * 10) % 2 ? 1 : 0.45) : 0.85),
          r.beginPath());
        let C = f.boss ? 1.5 : 1;
        (r.moveTo(10 * C, 0),
          r.lineTo(-6 * C, -7 * C),
          r.lineTo(-3 * C, 0),
          r.lineTo(-6 * C, 7 * C),
          r.closePath(),
          r.fill(),
          r.restore());
      }
      if (((r.globalAlpha = 1), h.alive && h.hp / e.stats.maxHp < 0.6)) {
        for (let f of e.pickups) {
          if (
            f.kind !== "heal" ||
            (t.project(f.x, 0.5, f.y, a), a.vis && a.x > 8 && a.x < this.w - 8 && a.y > 8 && a.y < this.h - 8)
          )
            continue;
          let p = this.w / 2,
            x = this.h / 2,
            m = a.x - p,
            g = a.y - x;
          if (!Number.isFinite(m) || !Number.isFinite(g)) continue;
          let M = Math.hypot(m, g) || 1;
          ((m /= M), (g /= M));
          let b = Math.abs(m) > 0.001 ? ((m > 0 ? this.w - d - o.r : d + o.l) - p) / m : 1 / 0,
            v = Math.abs(g) > 0.001 ? ((g > 0 ? this.h - d - o.b - 120 : d + o.t + 60) - x) / g : 1 / 0,
            S = Math.min(b, v);
          (r.save(),
            r.translate(p + m * S, x + g * S),
            (r.globalAlpha = 0.6 + Math.sin(this.time * 6) * 0.3),
            (r.fillStyle = "#6dff8a"),
            r.fillRect(-7, -2.5, 14, 5),
            r.fillRect(-2.5, -7, 5, 14),
            r.rotate(Math.atan2(g, m)),
            r.beginPath(),
            r.moveTo(16, 0),
            r.lineTo(10, -5),
            r.lineTo(10, 5),
            r.closePath(),
            r.fill(),
            r.restore());
        }
        r.globalAlpha = 1;
      }
      if (this.hurts.length) {
        t.project(h.x, 0.6, h.y, a);
        let f = Math.min(this.w, this.h) * 0.16 + 30;
        for (let p of this.hurts)
          ((p.life -= c),
            !(p.life <= 0) &&
              ((r.globalAlpha = Math.min(1, p.life / 0.5) * 0.85),
              (r.strokeStyle = "#ff3050"),
              (r.lineWidth = 7),
              (r.lineCap = "round"),
              r.beginPath(),
              r.arc(a.x, a.y, f, p.a - 0.42, p.a + 0.42),
              r.stroke(),
              (r.lineWidth = 2),
              (r.strokeStyle = "#ffd0d8"),
              r.beginPath(),
              r.arc(a.x, a.y, f - 7, p.a - 0.25, p.a + 0.25),
              r.stroke()));
        ((r.globalAlpha = 1), (r.lineCap = "butt"), (this.hurts = this.hurts.filter((p) => p.life > 0)));
      }
      if (this.callouts.length && e.boss) {
        let f = this.callouts[0];
        if (((f.life -= c), t.project(e.boss.x, 4.2 + e.boss.r, e.boss.y, a), f.life > 0 && a.vis)) {
          let p = Math.min(1, f.life / 0.3);
          ((r.globalAlpha = p),
            (r.font = '700 16px "Chakra Petch", system-ui, sans-serif'),
            (r.textAlign = "center"),
            (r.lineWidth = 4),
            (r.strokeStyle = "rgba(6,8,16,0.9)"),
            r.strokeText(f.t, a.x, a.y),
            (r.fillStyle = "#ff9ab8"),
            r.fillText(f.t, a.x, a.y),
            (r.globalAlpha = 1));
        }
        f.life <= 0 && (this.callouts.length = 0);
      }
      n && this.drawSticks(n, s);
    }
    drawSticks(t, e) {
      let n = this.g;
      for (let s of [t.move, t.aim]) {
        if (!s.active || s.mouse) continue;
        let r = t.R,
          a = s === t.aim;
        ((n.globalAlpha = 0.9),
          (n.lineWidth = 2),
          (n.strokeStyle = a ? "rgba(255,120,150,0.55)" : "rgba(120,240,255,0.5)"),
          (n.fillStyle = a ? "rgba(255,90,130,0.08)" : "rgba(80,220,255,0.08)"),
          n.beginPath(),
          n.arc(s.ox, s.oy, r, 0, Math.PI * 2),
          n.fill(),
          n.stroke());
        let o = s.x - s.ox,
          c = s.y - s.oy,
          h = Math.hypot(o, c),
          l = h > r ? r / h : 1;
        ((n.fillStyle = a ? "rgba(255,120,150,0.7)" : "rgba(120,240,255,0.65)"),
          n.beginPath(),
          n.arc(s.ox + o * l, s.oy + c * l, r * 0.42, 0, Math.PI * 2),
          n.fill());
      }
      if (((n.globalAlpha = 1), e.hints)) {
        ((n.font = '600 14px "Barlow Semi Condensed", system-ui, sans-serif'),
          (n.textAlign = "center"),
          (n.fillStyle = "rgba(200,230,255,0.75)"));
        let s = this.h - (e.safe ? e.safe.b : 0) - 58,
          r = t.swap ? "AIM + FIRE" : "MOVE",
          a = t.swap ? "MOVE" : "AIM + FIRE";
        (n.fillText("DRAG HERE TO " + r, this.w * 0.25, s), n.fillText("DRAG HERE TO " + a, this.w * 0.75, s));
      }
    }
  },
  cssColorCache = {};
function cssColor(i) {
  return cssColorCache[i] || (cssColorCache[i] = "#" + i.toString(16).padStart(6, "0"));
}

export { Overlay };
