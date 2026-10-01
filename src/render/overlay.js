// 2D overlay canvas (Overlay): health bars, off-screen indicators, hints and callouts.

import { enemyDefs, bossDefs } from "../data/enemies.js";
import { clamp } from "../core/util.js";

const healthBarTypes = { brute: 1, hive: 1, splitter: 1, sniper: 1, gunner: 1, bulwark: 1, mortar: 1, striker: 1 },
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
    // 2.4.6: Frost Prism
    frostbeam: "FROST BEAM",
    icelances: "ICE LANCES",
    iceshards: "ICE SHARDS",
    frostnova: "FROST NOVA",
    glacier: "GLACIER",
    // 2.4.6: The Crucible
    hammer: "FORGE HAMMER",
    slag: "SLAG RAIN",
    eruption: "ERUPTION",
    furnace: "FURNACE BLAST",
    stoke: "STOKE",
  },
  Overlay = class {
    constructor(canvas) {
      this.c = canvas;
      this.g = canvas.getContext("2d");
      this.tmp = { x: 0, y: 0, vis: false, nx: 0, ny: 0 };
      this.tmp2 = { x: 0, y: 0, vis: false, nx: 0, ny: 0 };
      this.w = 0;
      this.h = 0;
      this.hurts = [];
      this.callouts = [];
      this.time = 0;
    }
    addHurt(world, x, y) {
      if (x == null || !world) return;
      let angle = Math.atan2(y - world.player.y, x - world.player.x);
      if (this.hurts.length > 5) {
        this.hurts.shift();
      }
      this.hurts.push({ a: angle, life: 0.8 });
    }
    callout(attack) {
      let label = bossAttackNames[attack];
      if (label) {
        this.callouts = [{ t: label, life: 1.4 }];
      }
    }
    resize() {
      let w = this.c.clientWidth || window.innerWidth,
        h = this.c.clientHeight || window.innerHeight,
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!(w === this.w && h === this.h && dpr === this.dpr)) {
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.c.width = Math.round(w * dpr);
        this.c.height = Math.round(h * dpr);
      }
    }
    clear() {
      this.resize();
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.g.clearRect(0, 0, this.w, this.h);
    }
    draw(renderer, world, input, opts = {}) {
      this.clear();
      if (!world) return;
      let ctx = this.g,
        pos = this.tmp,
        safe = opts.safe || { t: 0, b: 0, l: 0, r: 0 },
        dt = opts.dt || 0.016;
      // project a world point into pos; true when it is in front of the camera
      const project = (x, y, z) => {
        renderer.project(x, y, z, pos);
        return pos.vis;
      };
      // …and inside the screen with an 8 px margin
      const inView = (x, y, z) =>
        project(x, y, z) && pos.x > 8 && pos.x < this.w - 8 && pos.y > 8 && pos.y < this.h - 8;
      this.time += dt;
      let player = world.player,
        target = player.target;
      if (
        target &&
        !target.dead &&
        player.firing &&
        !player.manual &&
        player.alive &&
        project(target.x, 0.6, target.y)
      ) {
        renderer.project(target.x + target.r, 0.6, target.y, this.tmp2);
        let size = Math.max(12, Math.abs(this.tmp2.x - pos.x) * 1.5 + 6),
          spin = this.time * 2.2,
          tick = size * 0.45;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(spin);
        ctx.strokeStyle = "rgba(210,250,255,0.75)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(size, -tick * 0.5);
          ctx.lineTo(size, 0);
          ctx.lineTo(size - tick * 0.5, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
      for (let enemy of world.enemies) {
        if (
          enemy.boss ||
          (enemy.hp >= enemy.maxHp && !(enemy.shieldMax > 0 && enemy.shield < enemy.shieldMax)) ||
          !(enemy.elite || healthBarTypes[enemy.type]) ||
          !project(enemy.x, 1.2 + enemy.r * 1.4, enemy.y)
        )
          continue;
        let width = 18 + enemy.r * 16,
          hpFrac = clamp(enemy.hp / enemy.maxHp, 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(pos.x - width / 2 - 1, pos.y - 1, width + 2, 5);
        ctx.fillStyle = enemy.elite ? "#ffc84a" : "#ff5a7a";
        ctx.fillRect(pos.x - width / 2, pos.y, width * hpFrac, 3);
        if (enemy.shieldMax > 0 && enemy.shield > 0) {
          ctx.fillStyle = "#8fd4ff";
          ctx.fillRect(pos.x - width / 2, pos.y - 4, width * (enemy.shield / enemy.shieldMax), 2);
        }
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let num of renderer.nums) {
        if (num.life <= 0 || !project(num.x, num.y, num.z)) continue;
        // 3.0.0: the size follows the number (a maxed Railgun shot is bigger than a Pulse hit) and a new number
        // pops in for a moment
        let alpha = clamp(num.life / 0.35, 0, 1),
          pop = 1 + Math.max(0, 1 - (renderer.time - num.t0) / 0.12) * 0.3,
          fontSize = Math.min(32, (num.crit ? 14 : num.burn ? 9 : 11) + 3.4 * Math.log10(1 + Math.max(0, num.v))) * pop;
        ctx.font = `700 ${fontSize}px "Chakra Petch", "Barlow Semi Condensed", system-ui, sans-serif`;
        let text = String(Math.max(1, Math.round(num.v)));
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(6,8,16,0.85)";
        ctx.strokeText(text, pos.x, pos.y);
        ctx.fillStyle = num.crit ? "#ffd84a" : num.burn ? "#ff9a4a" : num.shield ? "#8fd4ff" : "#ffffff";
        ctx.fillText(text, pos.x, pos.y);
      }
      ctx.globalAlpha = 1;
      let fewEnemies = world.enemies.length <= 6,
        margin = 26;
      for (let enemy of world.enemies) {
        let windingUp =
          (enemy.type === "sniper" && enemy.st === 1) ||
          (enemy.type === "striker" && enemy.st === 1) ||
          (enemy.type === "mortar" && enemy.st === 1);
        if (
          (!enemy.boss && !fewEnemies && !windingUp && !(world.state === "fight" && world.stragglerT > 3)) ||
          inView(enemy.x, 0.6, enemy.y)
        )
          continue;
        let cx = this.w / 2,
          cy = this.h / 2,
          dx = pos.x - cx,
          dy = pos.y - cy;
        if ((pos.nx === 0 && pos.ny === 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) continue;
        let len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        let tx = Math.abs(dx) > 0.001 ? ((dx > 0 ? this.w - margin - safe.r : margin + safe.l) - cx) / dx : 1 / 0,
          ty =
            Math.abs(dy) > 0.001 ? ((dy > 0 ? this.h - margin - safe.b - 120 : margin + safe.t + 60) - cy) / dy : 1 / 0,
          edge = Math.min(tx, ty),
          ax = cx + dx * edge,
          ay = cy + dy * edge,
          color = windingUp
            ? this.contrast
              ? "#fff06a"
              : "#ff3a4e"
            : enemy.boss
              ? cssColor(bossDefs[enemy.type].color)
              : enemy.elite
                ? "#ffc84a"
                : cssColor(enemyDefs[enemy.type].color);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = color;
        ctx.globalAlpha = windingUp ? (Math.floor(this.time * 10) % 2 ? 1 : 0.45) : 0.85;
        ctx.beginPath();
        let scale = enemy.boss ? 1.5 : 1;
        ctx.moveTo(10 * scale, 0);
        ctx.lineTo(-6 * scale, -7 * scale);
        ctx.lineTo(-3 * scale, 0);
        ctx.lineTo(-6 * scale, 7 * scale);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (player.alive && player.hp / world.stats.maxHp < 0.6) {
        for (let pickup of world.pickups) {
          if (pickup.kind !== "heal" || inView(pickup.x, 0.5, pickup.y)) continue;
          let cx = this.w / 2,
            cy = this.h / 2,
            dx = pos.x - cx,
            dy = pos.y - cy;
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
          let len = Math.hypot(dx, dy) || 1;
          dx /= len;
          dy /= len;
          let tx = Math.abs(dx) > 0.001 ? ((dx > 0 ? this.w - margin - safe.r : margin + safe.l) - cx) / dx : 1 / 0,
            ty =
              Math.abs(dy) > 0.001
                ? ((dy > 0 ? this.h - margin - safe.b - 120 : margin + safe.t + 60) - cy) / dy
                : 1 / 0,
            edge = Math.min(tx, ty);
          ctx.save();
          ctx.translate(cx + dx * edge, cy + dy * edge);
          ctx.globalAlpha = 0.6 + Math.sin(this.time * 6) * 0.3;
          ctx.fillStyle = "#6dff8a";
          ctx.fillRect(-7, -2.5, 14, 5);
          ctx.fillRect(-2.5, -7, 5, 14);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.lineTo(10, -5);
          ctx.lineTo(10, 5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      if (this.hurts.length) {
        renderer.project(player.x, 0.6, player.y, pos);
        let radius = Math.min(this.w, this.h) * 0.16 + 30;
        for (let hurt of this.hurts) {
          hurt.life -= dt;
          if (!(hurt.life <= 0)) {
            ctx.globalAlpha = Math.min(1, hurt.life / 0.5) * 0.85;
            ctx.strokeStyle = "#ff3050";
            ctx.lineWidth = 7;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, hurt.a - 0.42, hurt.a + 0.42);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#ffd0d8";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius - 7, hurt.a - 0.25, hurt.a + 0.25);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = "butt";
        this.hurts = this.hurts.filter((hurt) => hurt.life > 0);
      }
      if (this.callouts.length && world.boss) {
        let callout = this.callouts[0];
        callout.life -= dt;
        renderer.project(world.boss.x, 4.2 + world.boss.r, world.boss.y, pos);
        if (callout.life > 0 && pos.vis) {
          let alpha = Math.min(1, callout.life / 0.3);
          ctx.globalAlpha = alpha;
          ctx.font = '700 16px "Chakra Petch", system-ui, sans-serif';
          ctx.textAlign = "center";
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(6,8,16,0.9)";
          ctx.strokeText(callout.t, pos.x, pos.y);
          ctx.fillStyle = "#ff9ab8";
          ctx.fillText(callout.t, pos.x, pos.y);
          ctx.globalAlpha = 1;
        }
        if (callout.life <= 0) {
          this.callouts.length = 0;
        }
      }
      if (input) {
        this.drawSticks(input, opts);
      }
    }
    drawSticks(input, opts) {
      let ctx = this.g;
      for (let stick of [input.move, input.aim]) {
        if (!stick.active || stick.mouse) continue;
        let radius = input.R,
          isAim = stick === input.aim;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        ctx.strokeStyle = isAim ? "rgba(255,120,150,0.55)" : "rgba(120,240,255,0.5)";
        ctx.fillStyle = isAim ? "rgba(255,90,130,0.08)" : "rgba(80,220,255,0.08)";
        ctx.beginPath();
        ctx.arc(stick.ox, stick.oy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        let dx = stick.x - stick.ox,
          dy = stick.y - stick.oy,
          dist = Math.hypot(dx, dy),
          scale = dist > radius ? radius / dist : 1;
        ctx.fillStyle = isAim ? "rgba(255,120,150,0.7)" : "rgba(120,240,255,0.65)";
        ctx.beginPath();
        ctx.arc(stick.ox + dx * scale, stick.oy + dy * scale, radius * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (opts.hints) {
        ctx.font = '600 14px "Barlow Semi Condensed", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(200,230,255,0.75)";
        let y = this.h - (opts.safe ? opts.safe.b : 0) - 58,
          leftLabel = input.swap ? "AIM + FIRE" : "MOVE",
          rightLabel = input.swap ? "MOVE" : "AIM + FIRE";
        ctx.fillText("DRAG HERE TO " + leftLabel, this.w * 0.25, y);
        ctx.fillText("DRAG HERE TO " + rightLabel, this.w * 0.75, y);
      }
    }
  },
  cssColorCache = {};
function cssColor(color) {
  return cssColorCache[color] || (cssColorCache[color] = "#" + color.toString(16).padStart(6, "0"));
}

export { Overlay };
