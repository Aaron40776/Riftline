// The simulation world (World): player, enemies, bullets, pickups, waves and states. Runs without
// rendering.

import { enemyDefs, bossOrder, biomeVariants, bossDefs, bossByWave } from "../data/enemies.js";
import { clamp, TAU, turnToward, hashString, angleDiff, makeRng, dampFactor } from "./util.js";
import { updateEnemy, updateBoss, initBoss } from "./ai.js";
import { RL_BIOME_INFO, biomesById, planBiomeRoute, biomeList } from "../data/biomes.js";
import { weaponDefs } from "../data/weapons.js";
import { waveEvents, EVENT_CHANCE, planWave, rollUpgradeOffer, set_RL_BIOME_MIX_CUR } from "./waves.js";
import { threatMods } from "../data/progression.js";
import { upgradesById } from "../data/upgrades.js";
import { Arena, buildLayout, SpatialHash } from "./arena.js";
import { computeStats } from "./stats.js";

var comboRewards = [
  [10, 3],
  [25, 8],
  [50, 20],
  [100, 45],
  [150, 80],
  [250, 150],
];
var rlStep = 1 / 60,
  PLAYER_RADIUS = 0.55,
  MAX_PLAYER_BULLETS = 420,
  MAX_ENEMY_BULLETS = 360,
  blastSources = { nova: "nova", inferno: "inferno", pop: "pop", bomber: "pop", payload: "payload", rocket: "weapon" },
  World = class {
    constructor(t) {
      let e = t.snap || null;
      if (
        ((this.seed = (e ? e.seed : t.seed) >>> 0),
        (this.weapon = weaponDefs[e ? e.weapon : t.weapon] ? (e ? e.weapon : t.weapon) : "pulse"),
        (this.threat = clamp((e ? e.threat : t.threat) | 0, 0, 5)),
        (this.tm = threatMods(this.threat)),
        (this.ws = { ...(t.ws || {}) }),
        (this.up = e ? { ...e.up } : {}),
        (this.wave = e ? e.wave : 1),
        (this.endless = e ? !!e.endless : !1),
        (this.time = (e && e.time) || 0),
        (this.kills = (e && e.kills) || 0),
        (this.shards = (e && e.shards) || 0),
        (this.rerolls = e && e.rerolls != null ? e.rerolls | 0 : 1 + (this.ws.reroll || 0)),
        (this.revived = e ? !!e.revived : !1),
        (this.bossKills = e ? [...(e.bossKills || [])] : []),
        (this.flawless = (e && e.flawless) || 0),
        (this.legendaries = (e && e.legendaries) || 0),
        (this.dmgDealt = (e && e.dmgDealt) || 0),
        (this.bestCombo = (e && e.bestCombo) || 0),
        (this.evolved = (e && e.evolved) || 0),
        (this.runStats = {
          dmgTaken: (e && e.runStats && Number(e.runStats.dmgTaken)) || 0,
          dashes: (e && e.runStats && Number(e.runStats.dashes)) || 0,
          critHits: (e && e.runStats && Number(e.runStats.critHits)) || 0,
        }),
        (this.dmgSrc = {}),
        e && e.dmgSrc && typeof e.dmgSrc == "object")
      )
        for (let n in e.dmgSrc) Number.isFinite(e.dmgSrc[n]) && (this.dmgSrc[n] = e.dmgSrc[n]);
      if (
        ((this.route = planBiomeRoute(makeRng(hashString(this.seed + ":route")))),
        (this.combo = 0),
        (this.comboT = 0),
        (this.trails = []),
        (this.hold = !1),
        (this.nextId = 1),
        (this.fx = []),
        (this.stats = computeStats(this.weapon, this.up, this.ws)),
        (this.player = {
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
          shield: !1,
          nova: 0,
          alive: !0,
          moving: !1,
          firing: !1,
          rushN: 0,
          rushT: 0,
          regenAcc: 0,
          wings: [],
          target: null,
          hurtT: 0,
          trailT: 0,
          portalT: 0,
          onIce: !1,
          shotN: 0,
          slowT: 0,
          acidT: 0,
          inAcid: !1,
        }),
        e && (this.player.hp = clamp(e.hp, 1, this.stats.maxHp)),
        (this.chronoT = 0),
        (this.offer = null),
        (this.offerBoss = !1),
        (this.state = "fight"),
        (this.stateT = 0),
        this.startWave(this.wave, e ? e.nova : null),
        e && Array.isArray(e.offer))
      ) {
        let n = e.offer.filter((s) => upgradesById[s]);
        ((this.fx.length = 0),
          (this.plan = []),
          (this.planIdx = 0),
          (this.bossPending = null),
          (this.offerBoss = !!e.offerBoss),
          (this.state = "choose"),
          (this.offer = n.length ? n : this.makeOffer()));
      }
    }
    emit(t, e) {
      return ((e = e || {}), (e.k = t), this.fx.push(e), e);
    }
    startWave(t, e) {
      ((this.wave = t), (this.rng = makeRng(hashString(this.seed + ":" + t))));
      let n = this.biomeFor(t),
        s = buildLayout(n, this.seed, t, t === 1 || !!this.bossFor(t));
      ((!this.arena || this.arena.key !== s.key) &&
        ((this.arena = new Arena(n, s)), (this.hash = new SpatialHash(s.W, s.H, 2.5))),
        (this.enemies = []),
        (this.pb = []),
        (this.eb = []),
        (this.pickups = []),
        (this.beams = []),
        (this.hazards = []),
        (this.markers = []),
        (this.trails = []),
        (this.boss = null),
        (this.combo = 0),
        (this.comboT = 0));
      let r = this.player;
      ((r.x = 0),
        (r.y = 2),
        (r.vx = r.vy = 0),
        (r.dashT = 0),
        (r.iT = 1),
        (r.target = null),
        (r.alive = !0),
        (r.shield = this.stats.shieldCd > 0),
        (r.shieldT = 0));
      let a = 25 * (this.ws.nova || 0);
      ((r.nova = e ?? Math.max(r.nova, a)),
        (this.waveT = 0),
        (this.waveDmg = 0),
        (this.hpMul = (1 + 0.085 * (t - 1) + 0.0058 * (t - 1) * (t - 1)) * this.tm.hp),
        (this.dmgMul = (1 + 0.035 * (t - 1)) * this.tm.dmg),
        (this.stragglerT = 0));
      let o = this.bossFor(t);
      ((this.event = this.eventFor(t)), (this.rainT = 1.5), (this.champion = null));
      let c = makeRng(hashString(this.seed + ":champ:" + t));
      ((this.championPending =
        !o && !this.event && t >= 3 && (t - 1) % 5 >= 2 && c.chance(0.4) ? this.championType(n.id, t, c) : null),
        (this.plan = planWave(this.rng, t, this.tm, !!o, this.event ? waveEvents[this.event].plan : {})),
        (this.planIdx = 0),
        (this.planTotal = this.plan.reduce((h, l) => h + l.members.length, 0)),
        (this.groupT = 1.1),
        (this.bossPending = o),
        (this.state = "fight"),
        (this.stateT = 0),
        this.emit("wave", { n: t, boss: o, biome: n.id, event: this.event }));
    }
    championType(t, e, n) {
      let r = (
        {
          yard: ["grunt", "gunner"],
          works: ["brute", "grunt"],
          vault: ["bulwark", "gunner"],
          void: ["striker", "brute"],
          marsh: ["splitter", "brute"],
        }[t] || ["grunt"]
      ).filter((a) => enemyDefs[a].from <= e);
      return r.length ? n.pick(r) : "grunt";
    }
    eventFor(t) {
      let e = (r) => r >= 3 && !this.bossFor(r) && (r - 1) % 5 !== 0,
        n = (r) => makeRng(hashString(this.seed + ":event:" + r));
      if (!e(t) || n(t).next() >= EVENT_CHANCE || (e(t - 1) && n(t - 1).next() < EVENT_CHANCE)) return null;
      let s = n(t);
      return (s.next(), ["elite", "rain"][Math.floor(s.next() * 2)]);
    }
    biomeFor(t) {
      let e = Math.max(1, t) - 1,
        n = Math.floor(e / this.route.length),
        s = (e + n) % this.route.length;
      return biomesById[this.route[s]] || biomeList[0];
    }
    bossFor(t) {
      return t % 5 !== 0 ? null : bossByWave[t] || bossOrder[(t / 5 - 1) % bossOrder.length];
    }
    isFinalWave() {
      return !this.endless && this.wave >= 20;
    }
    snapshot() {
      let t = {
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
        runStats: {
          dmgTaken: Math.round(this.runStats.dmgTaken),
          dashes: this.runStats.dashes | 0,
          critHits: this.runStats.critHits | 0,
        },
        dmgSrc: Object.fromEntries(Object.entries(this.dmgSrc).map(([e, n]) => [e, Math.round(n)])),
      };
      return (
        this.state === "choose" && this.offer && ((t.offer = [...this.offer]), (t.offerBoss = !!this.offerBoss)),
        t
      );
    }
    choose(t) {
      if (this.state !== "choose" || !this.offer || !this.offer.includes(t)) return !1;
      let e = upgradesById[t],
        n = this.player,
        s = this.stats.maxHp;
      return (
        (this.up[t] = (this.up[t] || 0) + 1),
        e.rarity === 4 && this.legendaries++,
        e.rarity === 5 && this.evolved++,
        (this.stats = computeStats(this.weapon, this.up, this.ws)),
        t === "hp" && (n.hp = Math.min(this.stats.maxHp, n.hp + 20 + (this.stats.maxHp - s - 20))),
        t === "heal" && (n.hp = Math.min(this.stats.maxHp, n.hp + this.stats.maxHp * 0.45)),
        (n.hp = Math.min(n.hp, this.stats.maxHp)),
        (this.offer = null),
        this.emit("pick", { id: t, evo: e.rarity === 5 }),
        this.startWave(this.wave + 1),
        !0
      );
    }
    reroll() {
      return this.state !== "choose" || this.rerolls <= 0
        ? !1
        : (this.rerolls--, (this.offer = this.makeOffer(this.offer || [])), this.emit("reroll"), !0);
    }
    makeOffer(t = []) {
      let e = 3 + ((this.ws.insight || 0) > 0 ? 1 : 0);
      return rollUpgradeOffer(
        this.rng,
        this.up,
        this.wave,
        this.player.hp / this.stats.maxHp,
        e,
        this.offerBoss,
        t,
        this.weapon,
      );
    }
    continueEndless() {
      this.state === "victory" &&
        ((this.endless = !0), (this.state = "choose"), (this.offer = this.makeOffer()), this.emit("offer"));
    }
    step(t, e) {
      if (((this.stateT += t), this.state === "choose" || this.state === "victory")) {
        this.idle(t);
        return;
      }
      ((this.time += this.state === "dead" ? 0 : t), (this.waveT += t));
      let n = this.chronoT > 0 ? 0.45 : 1;
      (this.chronoT > 0 && (this.chronoT -= t),
        this.comboT > 0 &&
          ((this.comboT -= t),
          this.comboT <= 0 && (this.combo >= 5 && this.emit("comboEnd", { n: this.combo }), (this.combo = 0))),
        this.player.alive ? this.updatePlayer(t, e) : ((this.player.vx *= 0.9), (this.player.vy *= 0.9)),
        this.hash.build(this.enemies),
        this.state === "fight" && this.updateSpawns(t),
        this.arena.flow.update(this.player.x, this.player.y));
      let s = t * n;
      for (let r = 0; r < this.enemies.length; r++) {
        let a = this.enemies[r];
        a.dead ||
          (this.statusTick(a, t),
          !a.dead &&
            ((this._src = a.type),
            (this._var = a.variant || null),
            a.boss ? updateBoss(this, a, s) : updateEnemy(this, a, s),
            (a.variant || a.champion) && this.variantTick(a, s),
            this.moveEnemy(a, s)));
      }
      ((this._src = null),
        (this._var = null),
        this.separate(),
        this.hash.build(this.enemies),
        this.player.alive && (this.updateOrbitals(t), this.updateWingman(t), this.contactDamage()),
        this.updateTrails(t),
        this.updatePBullets(t),
        this.updateEBullets(s),
        this.updateBeams(s),
        this.updateHazards(s),
        this.updatePickups(t),
        this.updateMarkers(t),
        this.updateFeatures(t),
        this.event === "rain" && this.state === "fight" && this.shardRain(t),
        this.sweep(),
        this.checkWaveEnd());
    }
    variantTick(t, e) {
      if (t.spawnT > 0) return;
      let n = this.player;
      if (
        (t.champion &&
          this.hash.query(t.x, t.y, 7, (s) => {
            !s.dead && s !== t && Math.hypot(s.x - t.x, s.y - t.y) < 7 && (s.rallyT = 0.3);
          }),
        t.rallyT > 0 && (t.rallyT -= e),
        (t.vt = (t.vt || 0) - e),
        t.variant === "scorch" && t.vt <= 0 && Math.hypot(t.vx, t.vy) > 0.5)
      ) {
        t.vt = 1.1;
        let s = this._src;
        ((this._src = t.type),
          this.hazard({ x: t.x, y: t.y, r: 1, delay: 0.8, dmg: t.dmg * 0.6, kind: "fire" }),
          (this._src = s));
      } else if (t.variant === "phase" && t.vt <= 0) {
        t.vt = 2.4 + this.rng.next();
        let s = n.x - t.x,
          r = n.y - t.y,
          a = Math.hypot(s, r);
        if (a > 4.5) {
          let o = t.x + (s / a) * 3,
            c = t.y + (r / a) * 3;
          !this.arena.blocked(o, c, t.r) &&
            !this.arena.outside(o, c, t.r) &&
            (this.emit("blink", { x: t.x, y: t.y, small: !0, phase: !0 }), (t.x = o), (t.y = c));
        }
      }
    }
    shardRain(t) {
      if (
        (this.planIdx >= this.plan.length && this.enemies.length === 0) ||
        ((this.rainT -= t), this.rainT > 0 || this.pickups.length > 200)
      )
        return;
      this.rainT = 0.8 + this.rng.next() * 0.5;
      let e = this.arena.freePoint(this.rng, this.player.x, this.player.y, 3, 0.4),
        n = this.mkPickup("shard", e.x, e.y, this.rng.chance(0.15) ? 5 : 1);
      ((n.vx = 0), (n.vy = 0), (n.rain = !0), this.pickups.push(n));
    }
    updateFeatures(t) {
      let e = this.arena,
        n = this.player;
      if (e.acid.length) {
        for (let s of e.acid) s.life != null && (s.life -= t);
        (e.acid.some((s) => s.life != null && s.life <= 0) &&
          (e.acid = e.acid.filter((s) => s.life == null || s.life > 0)),
          (n.inAcid = n.alive && e.inAcid(n.x, n.y)),
          n.inAcid && this.state === "fight"
            ? ((n.acidT += t),
              n.acidT >= 0.5 &&
                ((n.acidT = 0),
                this.hurtPlayer(
                  2 * this.dmgMul * Math.max(0, 1 - (this.stats.hazardResist || 0)),
                  null,
                  null,
                  "acid",
                  !0,
                )))
            : (n.acidT = 0.35));
        for (let s of this.enemies) s.corrode = !s.boss && e.inAcid(s.x, s.y);
      } else n.inAcid = !1;
      if (e.vents.length && this.state === "fight")
        for (let s of e.vents) {
          let r = e.ventState(s, this.waveT);
          (r !== s.st && (r === "erupt" && this.emit("erupt", { x: s.x, y: s.y, r: s.r }), (s.st = r)),
            r === "erupt" &&
              (n.alive &&
                Math.hypot(n.x - s.x, n.y - s.y) < s.r + n.r * 0.4 &&
                this.hurtPlayer(9 * this.dmgMul * Math.max(0, 1 - (this.stats.hazardResist || 0)), s.x, s.y, "lava"),
              this.hash.query(s.x, s.y, s.r, (a) => {
                if (a.dead || a.boss || Math.hypot(a.x - s.x, a.y - s.y) > s.r + a.r * 0.5) return;
                let o = a.burnT > 0 ? a.burnDps : 0;
                ((a.burnT = Math.max(a.burnT, 2)), (a.burnDps = Math.max(o, a.maxHp * 0.14)), (a.burnSrc = "lava"));
              })));
        }
      if (e.portals.length) {
        n.portalT > 0 && (n.portalT -= t);
        for (let s of e.portals)
          for (let [r, a, o, c] of [
            [s.ax, s.ay, s.bx, s.by],
            [s.bx, s.by, s.ax, s.ay],
          ]) {
            if (n.alive && n.portalT <= 0 && Math.hypot(n.x - r, n.y - a) < 0.8) {
              let h = Math.hypot(n.vx, n.vy),
                l = h > 0.5 ? n.vx / h : 0,
                u = h > 0.5 ? n.vy / h : 1;
              (this.emit("warp", { x: n.x, y: n.y, tx: o, ty: c, who: "player" }),
                (n.x = o + l * 1.2),
                (n.y = c + u * 1.2),
                this.arena.resolve(n, n.r),
                (n.portalT = 0.9));
            }
            for (let h of [this.pb, this.eb])
              for (let l of h)
                if (
                  !(l.life <= 0 || (l.warpT || 0) > this.time) &&
                  Math.abs(l.x - r) < 0.75 &&
                  Math.abs(l.y - a) < 0.75
                ) {
                  let u = Math.hypot(l.vx, l.vy) || 1;
                  ((l.x = o + (l.vx / u) * 0.9),
                    (l.y = c + (l.vy / u) * 0.9),
                    (l.warpT = this.time + 0.35),
                    l.boom && (l.back = !0),
                    Math.random() < 0.5 && this.emit("warp", { x: r, y: a, tx: o, ty: c, who: "shot" }));
                }
          }
      }
    }
    idle(t) {
      this.updatePickups(t);
      for (let e of this.eb) e.life = 0;
      this.sweep();
    }
    updatePlayer(t, e) {
      let n = this.player,
        s = this.stats;
      ((e = e || {}),
        (n.iT = Math.max(0, n.iT - t)),
        (n.dashCdT = Math.max(0, n.dashCdT - t)),
        (n.hurtT = Math.max(0, n.hurtT - t)),
        n.rushT > 0 && ((n.rushT -= t), n.rushT <= 0 && (n.rushN = 0)),
        s.shieldCd > 0 &&
          !n.shield &&
          ((n.shieldT += t), n.shieldT >= s.shieldCd && ((n.shield = !0), (n.shieldT = 0), this.emit("shieldUp"))),
        s.regen > 0 && n.hp < s.maxHp && (n.hp = Math.min(s.maxHp, n.hp + s.regen * t)));
      let r = +e.mx || 0,
        a = +e.my || 0,
        o = Math.hypot(r, a);
      if ((o > 1 && ((r /= o), (a /= o)), (n.moving = o > 0.08), e.dash && n.dashCdT <= 0 && n.dashT <= 0)) {
        let d = r,
          f = a;
        Math.hypot(d, f) < 0.2 && ((d = Math.cos(n.face)), (f = Math.sin(n.face)));
        let p = Math.hypot(d, f) || 1;
        ((n.dashX = d / p),
          (n.dashY = f / p),
          (n.dashT = 0.17),
          (n.dashCdT = s.dashCd),
          n.dashId++,
          this.runStats.dashes++,
          (n.iT = Math.max(n.iT, 0.24)),
          s.chrono && (this.chronoT = 2),
          this.emit("dash", { x: n.x, y: n.y, a: Math.atan2(n.dashY, n.dashX) }));
      }
      if (n.dashT > 0)
        ((n.dashT -= t),
          (n.vx = n.dashX * 28),
          (n.vy = n.dashY * 28),
          s.shockDash && this.dashHits(),
          s.trail &&
            ((n.trailT -= t),
            n.trailT <= 0 &&
              ((n.trailT = 0.025), this.trails.length < 80 && this.trails.push({ x: n.x, y: n.y, life: 1.4 }))));
      else {
        let d = this.arena.ice.length && this.arena.onIce(n.x, n.y);
        ((n.onIce = !!d), n.slowT > 0 && (n.slowT -= t));
        // 2.4.0: a biome can set its own floor grip (Cryo Vault: the whole floor is slick)
        let f = dampFactor(d ? 2.4 : this.arena.biome.grip || 16, t),
          p = s.speed * (d ? 1.12 : 1) * (n.slowT > 0 ? 0.65 : 1);
        ((n.vx += (r * p - n.vx) * f), (n.vy += (a * p - n.vy) * f));
      }
      ((n.x += n.vx * t),
        (n.y += n.vy * t),
        this.arena.resolve(n, n.r),
        n.moving && n.dashT <= 0 && (n.face = turnToward(n.face, Math.atan2(a, r), 14 * t)));
      let c = !!e.aim && Math.hypot(+e.ax || 0, +e.ay || 0) > 0.2,
        h = null;
      if (c) ((h = Math.atan2(e.ay, e.ax)), e.assist !== !1 && (h = this.assistAim(h)), (n.target = null));
      else {
        let d = this.pickTarget();
        ((n.target = d), d && (h = Math.atan2(d.y - n.y, d.x - n.x)));
      }
      let l = c || (!!e.fire && h != null) || (!!e.auto && h != null && n.target != null);
      (h != null ? (n.aim = turnToward(n.aim, h, 30 * t)) : n.moving && (n.aim = turnToward(n.aim, n.face, 8 * t)),
        (n.firing = l),
        (n.manual = c));
      let u = s.weapon.rate * s.rateMul * (1 + (s.bloodrush ? 0.04 * n.rushN : 0));
      if (((n.fireT -= t), l && h != null)) {
        let d = 0;
        for (; n.fireT <= 0 && d < 3; ) (this.fire(h), (n.fireT += 1 / u), d++);
        n.fireT < 0 && (n.fireT = 0);
      } else n.fireT < 0 && (n.fireT = 0);
      e.nova && this.nova();
    }
    assistAim(t) {
      let e = this.player,
        n = null,
        s = 0.22,
        r = this.stats.range + 2;
      for (let a of this.enemies) {
        if (a.dead || a.ghost) continue;
        let o = a.x - e.x,
          c = a.y - e.y,
          h = Math.hypot(o, c);
        if (h > r) continue;
        let l = Math.abs(angleDiff(t, Math.atan2(c, o))),
          u = Math.min(0.35, 0.12 + Math.atan2(a.r, h));
        l < u && l < s + (0.05 * h) / r && ((n = a), (s = l));
      }
      return n ? Math.atan2(n.y - e.y, n.x - e.x) : t;
    }
    pickTarget() {
      let t = this.player,
        e = this.stats.range + 2.5,
        n = null,
        s = 1 / 0;
      for (let r of this.enemies) {
        if (r.dead || r.spawnT > 0.2 || r.ghost) continue;
        let a = Math.hypot(r.x - t.x, r.y - t.y) - r.r;
        if (a > e) continue;
        let o = a + (r.los ? 0 : 9);
        (r === t.target && (o *= 0.8), o < s && ((s = o), (n = r)));
      }
      return n;
    }
    fire(t) {
      let e = this.player,
        n = this.stats,
        s = n.weapon,
        r = s.count + (s.cone ? n.extra * 2 : n.extra),
        a = 0.75,
        o = e.x + Math.cos(t) * a,
        c = e.y + Math.sin(t) * a;
      e.shotN = (e.shotN || 0) + 1;
      let h = n.overdrive && e.shotN % 4 === 0,
        l = (u, d) => {
          if (this.pb.length >= MAX_PLAYER_BULLETS) return;
          let f = (this.rng.next() - 0.5) * 2 * s.spread,
            p = u + f,
            x = s.speed * n.velMul * (s.cone ? 0.85 + this.rng.next() * 0.3 : 1),
            m = {
              id: this.nextId++,
              x: o,
              y: c,
              vx: Math.cos(p) * x,
              vy: Math.sin(p) * x,
              a: p,
              r: s.r * n.sizeMul,
              dmg: s.dmg * n.dmgMul * d,
              life: s.life * (s.cone ? 0.85 + this.rng.next() * 0.3 : 1),
              pierce: n.lance && s.rail ? 999 : n.pierce,
              bounce: s.boomerang ? 0 : n.bounce,
              hits: [],
              w: s.id,
              age: 0,
              homing: n.homing,
            };
          (h && d >= 1 && ((m.dmg *= 3), (m.r *= 2), (m.pierce += 3), (m.vx *= 1.2), (m.vy *= 1.2), (m.heavy = !0)),
            s.boomerang && ((m.boom = !0), (m.turn = s.life * 0.5), (m.life = 4), (m.sp = x), (m.spin = 0)),
            s.drag && ((m.drag = s.drag), (m.grow = s.grow)),
            this.pb.push(m));
        };
      if (s.cone) {
        let u = s.cone + n.extra * 0.08;
        for (let d = 0; d < r; d++) l(t - u / 2 + (u * (d + 0.5)) / r, 1);
      } else for (let u = 0; u < r; u++) l(t + (u - (r - 1) / 2) * s.fan, 1);
      (n.rear >= 1 && l(t + Math.PI, 0.6),
        n.rear >= 2 && (l(t + Math.PI / 2, 0.6), l(t - Math.PI / 2, 0.6)),
        this.emit("shot", { w: s.id, x: o, y: c, a: t, heavy: h }));
    }
    dashHits() {
      let t = this.player;
      this.hash.query(t.x, t.y, 1.1, (e) => {
        e.dead ||
          e.dashHit === t.dashId ||
          Math.hypot(e.x - t.x, e.y - t.y) > e.r + 1.1 ||
          ((e.dashHit = t.dashId),
          this.hurtEnemy(e, this.stats.shockDash * this.stats.dmgMul, t.dashX, t.dashY, 6, !1, "dash"),
          this.emit("zap", { x: e.x, y: e.y }));
      });
    }
    nova() {
      let t = this.player,
        e = this.stats;
      if (t.nova < 100 || !t.alive || this.state !== "fight") return;
      ((t.nova = 0), (t.iT = Math.max(t.iT, 0.5)));
      let n = e.novaR;
      this.explode(t.x, t.y, n, 70 * e.dmgMul, { enemies: !0, knock: 12, kind: "nova" });
      for (let s of this.eb)
        Math.hypot(s.x - t.x, s.y - t.y) < n * 1.7 && ((s.life = 0), this.emit("pop", { x: s.x, y: s.y }));
      this.emit("nova", { x: t.x, y: t.y, r: n });
    }
    addNova(t) {
      let e = this.player,
        n = e.nova;
      ((e.nova = Math.min(100, e.nova + t * this.stats.novaMul)), n < 100 && e.nova >= 100 && this.emit("novaReady"));
    }
    hurtPlayer(t, e, n, s, r = !1) {
      let a = this.player,
        b = a.hp;
      if (!a.alive || (!r && a.iT > 0) || a.dashT > 0 || this.state !== "fight" || this.god) return !1;
      if (a.shield && !r)
        return ((a.shield = !1), (a.shieldT = 0), (a.iT = 0.6), this.emit("shieldBreak", { x: a.x, y: a.y }), !1);
      if (
        ((t = Math.round(t)),
        (a.hp -= t),
        (this.runStats.dmgTaken += Math.min(t, b)),
        (this.lastHit = s || null),
        this.dmgBy && (this.dmgBy[s || "?"] = (this.dmgBy[s || "?"] || 0) + t),
        r || ((a.iT = 0.65), (a.hurtT = 0.3)),
        (this.waveDmg += t),
        e != null && !r)
      ) {
        let o = a.x - e,
          c = a.y - n,
          h = Math.hypot(o, c) || 1;
        ((a.vx += (o / h) * 7), (a.vy += (c / h) * 7));
      }
      return (
        this.emit("hurt", { dmg: t, x: a.x, y: a.y, sx: e, sy: n, chip: r }),
        a.hp <= 0 &&
          ((this.ws.revive || 0) > 0 && !this.revived
            ? ((this.revived = !0),
              (a.hp = Math.round(this.stats.maxHp * 0.5)),
              (a.iT = 2.2),
              (a.nova = 100),
              this.nova(),
              this.emit("revive", { x: a.x, y: a.y }))
            : ((a.hp = 0),
              (a.alive = !1),
              (this.state = "dead"),
              (this.stateT = 0),
              this.emit("die", { x: a.x, y: a.y }))),
        !0
      );
    }
    spawnEnemy(t, e, n, s = {}) {
      let r = enemyDefs[t],
        a = !!s.elite,
        o = r.hp * this.hpMul * (a ? 3.2 : 1) * (s.hpF || 1),
        c = {
          id: this.nextId++,
          type: t,
          def: r,
          x: e,
          y: n,
          vx: 0,
          vy: 0,
          kx: 0,
          ky: 0,
          r: r.r * (a ? 1.3 : 1),
          hp: o,
          maxHp: o,
          speed: r.speed * (a ? 1.12 : 1) * (0.92 + this.rng.next() * 0.16),
          dmg: r.dmg * this.dmgMul * (a ? 1.3 : 1),
          face: Math.atan2(this.player.y - n, this.player.x - e),
          elite: a,
          boss: !1,
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
          orbT: 0,
          dashHit: 0,
          dead: !1,
          los: !0,
          losT: this.rng.next() * 0.25,
          parent: s.parent || 0,
          kids: 0,
          phase: this.rng.next() * TAU,
          noDrop: !!s.noDrop,
          affix: null,
          shield: 0,
          shieldMax: 0,
        };
      s.champion &&
        ((c.champion = !0),
        (c.maxHp = c.hp = o * 2.2),
        (c.r *= 1.3),
        (c.speed *= 0.9),
        (c.dmg *= 1.2),
        (c.spawnT = 0.8));
      let h = biomeVariants[this.arena.biome.id];
      return (
        h &&
          h.types.includes(t) &&
          !s.champion &&
          !s.noVariant &&
          this.wave >= 3 &&
          this.rng.chance(0.35) &&
          (c.variant = h.id),
        t === "bulwark" && ((c.guard = c.guardMax = c.hp * 0.9), (c.guardDown = 0), (c.guardFlash = 0)),
        a &&
          this.wave >= 10 &&
          t !== "mite" &&
          !s.champion &&
          ((c.affix = this.rng.pick(["shielded", "hasted", "volatile"])),
          c.affix === "shielded" && (c.shield = c.shieldMax = o * 0.45),
          c.affix === "hasted" && (c.speed *= 1.35)),
        this.enemies.push(c),
        c
      );
    }
    spawnBoss(t) {
      let e = bossDefs[t],
        n = this.endless ? 1 + Math.floor((this.wave - 20) / 5) * 0.55 : 1,
        s = e.hp * this.tm.boss * 0.9 * n * (1 + (this.wave > 20 ? (this.wave - 20) * 0.08 : 0)),
        r = this.arena,
        a = {
          id: this.nextId++,
          type: t,
          def: e,
          x: 0,
          y: -r.H + 5,
          vx: 0,
          vy: 0,
          kx: 0,
          ky: 0,
          r: e.r,
          hp: s,
          maxHp: s,
          speed: e.speed,
          dmg: e.dmg * this.dmgMul,
          face: Math.PI / 2,
          elite: !1,
          boss: !0,
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
          orbT: 0,
          dashHit: 0,
          dead: !1,
          los: !0,
          losT: 0,
          parent: 0,
          kids: 0,
          phase: 0,
          enraged: !1,
          noDrop: !1,
          pattern: 0,
        };
      return (
        this.player.y < 0 && (a.y = r.H - 5),
        initBoss(this, a),
        this.enemies.push(a),
        (this.boss = a),
        this.emit("boss", { id: t, name: e.name, title: e.title }),
        a
      );
    }
    statusTick(t, e) {
      if (
        ((t.age += e),
        t.spawnT > 0 && (t.spawnT -= e),
        t.flash > 0 && (t.flash = Math.max(0, t.flash - e * 7)),
        t.slowT > 0 && (t.slowT -= e),
        t.orbT > 0 && (t.orbT -= e),
        t.burnT > 0 && ((t.burnT -= e), !t.shielded && !t.ghost))
      ) {
        let n = t.burnDps * e;
        if (t.shield > 0) {
          let s = Math.min(t.shield, n);
          ((t.shield -= s), (n -= s), t.shield <= 0 && this.emit("shieldPop", { x: t.x, y: t.y, r: t.r }));
        }
        ((n = this.capPhase(t, n)),
          (t.burnAcc += n),
          (t.burnShow += e),
          (t.hp -= n),
          (this.dmgDealt += n),
          this.credit(t.burnSrc || "burn", n),
          t.burnShow > 0.5 &&
            (t.burnAcc > 0.5 && this.emit("dmg", { x: t.x, y: t.y, v: t.burnAcc, burn: !0, id: t.id }),
            (t.burnAcc = 0),
            (t.burnShow = 0)),
          t.hp <= 0 && this.killEnemy(t));
      }
      ((t.losT -= e),
        t.losT <= 0 &&
          ((t.losT = 0.2 + this.rng.next() * 0.1),
          (t.los = this.arena.los(t.x, t.y, this.player.x, this.player.y, 0.2))));
    }
    chaseDir(t) {
      let e = this.player,
        n = e.x - t.x,
        s = e.y - t.y,
        r = Math.hypot(n, s) || 1;
      if (((this.cdx = n / r), (this.cdy = s / r), t.los || r < 2)) return;
      let a = this.arena.flow,
        o = a.idx(t.x, t.y),
        c = a.dx[o],
        h = a.dy[o];
      (c !== 0 || h !== 0) && ((this.cdx = c), (this.cdy = h));
    }
    moveEnemy(t, e) {
      let n = (t.slowT > 0 ? 0.55 : 1) * (t.rallyT > 0 ? 1.2 : 1),
        s = t.vx,
        r = t.vy;
      if (this.arena.ice.length && !t.boss && this.arena.onIce(t.x, t.y)) {
        let o = dampFactor(2.2, e);
        ((t.svx = (t.svx ?? s) + (s - (t.svx ?? s)) * o),
          (t.svy = (t.svy ?? r) + (r - (t.svy ?? r)) * o),
          (s = t.svx),
          (r = t.svy));
      } else ((t.svx = s), (t.svy = r));
      ((t.x += (s * n + t.kx) * e), (t.y += (r * n + t.ky) * e));
      let a = dampFactor(7, e);
      ((t.kx -= t.kx * a), (t.ky -= t.ky * a), (t.hitWall = this.arena.resolve(t, t.r)));
    }
    separate() {
      let t = this.enemies;
      for (let e = 0; e < t.length; e++) {
        let n = t[e];
        n.dead ||
          this.hash.query(n.x, n.y, n.r, (s) => {
            if (s === n || s.dead || s.id < n.id) return;
            let r = s.x - n.x,
              a = s.y - n.y,
              o = n.r + s.r,
              c = r * r + a * a;
            if (c >= o * o) return;
            let h = Math.sqrt(c) || 0.001,
              l = (o - h) * 0.5,
              u = n.boss ? 20 : n.r * n.r,
              d = s.boss ? 20 : s.r * s.r,
              f = u + d,
              p = c > 1e-6 ? r / h : 1,
              x = c > 1e-6 ? a / h : 0;
            ((n.x -= p * l * 2 * (d / f)),
              (n.y -= x * l * 2 * (d / f)),
              (s.x += p * l * 2 * (u / f)),
              (s.y += x * l * 2 * (u / f)));
          });
      }
      for (let e of t) e.dead || this.arena.resolve(e, e.r);
    }
    contactDamage() {
      let t = this.player;
      this.hash.query(t.x, t.y, t.r, (e) => {
        if (e.dead || e.spawnT > 0 || e.ghost) return;
        let n = e.x - t.x,
          s = e.y - t.y,
          r = e.r + t.r,
          a = n * n + s * s;
        if (a >= r * r) return;
        let o = Math.sqrt(a) || 0.001;
        if (
          (e.boss
            ? ((t.x -= (n / o) * (r - o)), (t.y -= (s / o) * (r - o)), this.arena.resolve(t, t.r))
            : ((e.x += (n / o) * (r - o)), (e.y += (s / o) * (r - o)), this.arena.resolve(e, e.r)),
          e.type === "bomber")
        )
          return;
        let c = e.boss
          ? e.dmg
          : (e.st === 2 && e.type === "brute") || (e.st === 3 && e.type === "striker")
            ? e.dmg * 1.4
            : e.dmg;
        this.hurtPlayer(c, e.x, e.y, e.type);
      });
    }
    hurtEnemy(t, e, n, s, r, a, o = "weapon") {
      if (!(t.dead || e <= 0 || t.ghost)) {
        if (t.shielded) {
          this.emit("ping", { x: t.x, y: t.y });
          return;
        }
        if (t.shield > 0) {
          let c = Math.min(t.shield, e);
          if (
            ((t.shield -= c),
            (e -= c),
            (t.flash = 0.6),
            t.shield <= 0 && this.emit("shieldPop", { x: t.x, y: t.y, r: t.r }),
            e <= 0)
          ) {
            this.emit("dmg", { x: t.x, y: t.y, v: c, shield: !0, id: t.id });
            return;
          }
        }
        if (
          (a && this.runStats.critHits++,
          t.corrode && !t.boss && (e *= 1.25),
          (e = this.capPhase(t, e)),
          (t.hp -= e),
          (this.dmgDealt += Math.min(e, t.hp + e)),
          this.credit(o, Math.min(e, t.hp + e)),
          (t.flash = 1),
          r)
        ) {
          let c = Math.hypot(n, s) || 1,
            h = t.boss ? 0.04 : 1 / (0.6 + t.r * t.r * 1.6);
          ((t.kx += (n / c) * r * h * 2.2), (t.ky += (s / c) * r * h * 2.2));
        }
        (t.boss && this.addNova(e * 0.045),
          this.emit("dmg", { x: t.x, y: t.y, v: e, crit: a, id: t.id }),
          t.hp <= 0 && this.killEnemy(t));
      }
    }
    capPhase(t, e) {
      if (!t.boss || t.type !== "core") return e;
      for (let n of [0.66, 0.33]) {
        let s = t.maxHp * n;
        if (t.hp > s && t.hp - e < s) return Math.max(0, t.hp - (s - 1));
      }
      return e;
    }
    credit(t, e) {
      e > 0 && (this.dmgSrc[t] = (this.dmgSrc[t] || 0) + e);
    }
    killEnemy(t) {
      if (t.dead) return;
      ((t.dead = !0), (t.hp = 0));
      let e = t.def;
      if (!t.boss) {
        (this.kills++, t.noCombo || this.addCombo(), this.addNova(2.5 * Math.max(1, e.cost) * (t.elite ? 3 : 1)));
        let n = this.stats,
          s = this.player;
        (n.siphonCh &&
          this.rng.chance(n.siphonCh) &&
          ((s.hp = Math.min(n.maxHp, s.hp + 4)), this.emit("heal", { x: s.x, y: s.y, v: 4 })),
          n.bloodrush && ((s.rushN = Math.min(10, s.rushN + 1)), (s.rushT = 4)));
        if (!t.noDrop) {
          n.bounty &&
            t.elite &&
            (this.dropShards(s.x, s.y, 2 * n.bounty),
            this.emit("bountyPulse", { x: s.x, y: s.y, amount: 2 * n.bounty }));
          n.capacitor && this.addNova(3 * n.capacitor);
        }
      }
      if (!t.noDrop) {
        let n =
          (t.boss ? e.shards : e.shards * (t.elite ? 4 : 1) * 0.4) * (this.event ? waveEvents[this.event].shardMul : 1);
        this.dropShards(t.x, t.y, n);
        let s = this.player.hp / this.stats.maxHp,
          r = t.boss ? 1 : t.elite ? 0.5 : s < 0.5 ? 0.045 : 0.02;
        this.rng.chance(r) && this.pickups.push(this.mkPickup("heal", t.x, t.y, t.boss ? 40 : 15));
      }
      if (
        (this.emit("kill", { type: t.type, x: t.x, y: t.y, elite: t.elite, boss: t.boss, r: t.r }),
        t.type === "splitter")
      )
        for (let n = 0; n < 3; n++) {
          let s = (n / 3) * TAU + this.rng.next(),
            r = this.spawnEnemy("mite", t.x + Math.cos(s) * 0.6, t.y + Math.sin(s) * 0.6, {
              elite: t.elite,
              noDrop: !1,
            });
          ((r.spawnT = 0), (r.kx = Math.cos(s) * 6), (r.ky = Math.sin(s) * 6));
        }
      if (this.stats.inferno && t.burnT > 0 && !t.boss) {
        let n = Math.max(6 * this.stats.dmgMul, t.burnDps);
        (this.hash.query(t.x, t.y, 2.4, (s) => {
          s.dead ||
            s === t ||
            Math.hypot(s.x - t.x, s.y - t.y) > 2.4 + s.r ||
            ((s.burnT = Math.max(s.burnT, 3)), (s.burnDps = Math.max(s.burnDps, n)));
        }),
          this.explode(t.x, t.y, 2.2, 18 * this.stats.dmgMul, { enemies: !0, knock: 2, kind: "inferno" }));
      }
      if (
        (t.variant === "toxic" && this.arena.acid.push({ x: t.x, y: t.y, r: 1.4, life: 5 }),
        t.champion &&
          ((this.champion = null),
          this.pickups.push(this.mkPickup("heal", t.x, t.y, 25)),
          this.dropShards(t.x, t.y, 20),
          this.hash.query(t.x, t.y, 8, (n) => {
            !n.dead && n !== t && !n.boss && (n.slowT = Math.max(n.slowT, 2.5));
          }),
          this.emit("championDown", { x: t.x, y: t.y, type: t.type })),
        t.affix === "volatile")
      ) {
        let n = this._src;
        ((this._src = t.type),
          this.hazard({ x: t.x, y: t.y, r: 2.3, delay: 0.75, dmg: t.dmg * 1.1, kind: "volatile" }),
          (this._src = n));
      }
      if (
        (t.type === "bomber" &&
          t.st !== 3 &&
          this.explode(t.x, t.y, 2.3, 30 * this.stats.dmgMul, { enemies: !0, kind: "pop" }),
        t.parent)
      ) {
        let n = this.enemies.find((s) => s.id === t.parent);
        n && (n.kids = Math.max(0, n.kids - 1));
      }
      if (t.boss) {
        (this.bossKills.push(t.type), (this.boss = null));
        for (let n of this.enemies) n.dead || ((n.noDrop = !0), (n.noCombo = !0), (n.affix = null), this.killEnemy(n));
        for (let n of this.eb) n.life = 0;
        ((this.beams.length = 0),
          (this.hazards.length = 0),
          (this.markers = []),
          (this.planIdx = this.plan.length),
          this.emit("bossDown", { id: t.type, x: t.x, y: t.y }));
      }
    }
    addCombo() {
      (this.combo++, (this.comboT = 2.2), this.combo > this.bestCombo && (this.bestCombo = this.combo));
      for (let [t, e] of comboRewards) this.combo === t && ((this.shards += e), this.emit("combo", { n: t, bonus: e }));
    }
    dropShards(t, e, n) {
      for (
        this.shardFrac = (this.shardFrac || 0) + n - Math.floor(n),
          n = Math.floor(n),
          this.shardFrac >= 1 && ((n += 1), (this.shardFrac -= 1)),
          n = Math.max(0, Math.round(n));
        n > 0;
      ) {
        let s = n >= 25 ? 25 : n >= 5 ? 5 : 1;
        ((n -= s),
          this.pickups.push(this.mkPickup("shard", t, e, s)),
          this.pickups.length > 260 && ((this.pickups[this.pickups.length - 1].v += n), (n = 0)));
      }
    }
    mkPickup(t, e, n, s) {
      let r = this.rng.next() * TAU,
        a = 2 + this.rng.next() * 4;
      return {
        kind: t,
        x: e,
        y: n,
        vx: Math.cos(r) * a,
        vy: Math.sin(r) * a,
        v: s,
        t: 0,
        pull: !1,
        dead: !1,
        id: this.nextId++,
      };
    }
    explode(t, e, n, s, r = {}) {
      if (
        (r.enemies &&
          this.hash.query(t, e, n, (a) => {
            if (
              !(a.dead || Math.hypot(a.x - t, a.y - e) > n + a.r) &&
              (this.hurtEnemy(a, s, a.x - t, a.y - e, r.knock || 3, !1, blastSources[r.kind] || "weapon"),
              r.burn && !a.dead && !a.shielded && !a.ghost)
            ) {
              let c = a.burnT > 0 ? a.burnDps : 0;
              ((a.burnT = Math.max(a.burnT, 3)), (a.burnDps = Math.max(c, r.burn)), (a.burnSrc = "burn"));
            }
          }),
        r.player)
      ) {
        let a = this.player;
        Math.hypot(a.x - t, a.y - e) < n + a.r && this.hurtPlayer(r.dmgPlayer || s, t, e, r.src || this._src);
      }
      this.emit("boom", { x: t, y: e, r: n, kind: r.kind || "boom" });
    }
    chainFrom(t, e, n, s, r = "weapon") {
      let a = t,
        o = [a.x, a.y],
        c = new Set(s || []);
      c.add(t.id);
      for (let h = 0; h < e; h++) {
        let l = null,
          u = 5.5;
        if (
          (this.hash.query(a.x, a.y, 5.5, (f) => {
            if (f.dead || f.ghost || c.has(f.id)) return;
            let p = Math.hypot(f.x - a.x, f.y - a.y) - f.r;
            p < u && this.arena.los(a.x, a.y, f.x, f.y) && ((u = p), (l = f));
          }),
          !l)
        )
          break;
        (c.add(l.id), o.push(l.x, l.y));
        let d = l;
        (this.hurtEnemy(d, n, d.x - a.x, d.y - a.y, 0.5, !1, r), (a = d));
      }
      o.length > 2 && this.emit("chain", { pts: o });
    }
    updatePBullets(t) {
      let e = this.stats,
        n = this.arena,
        s = this.player;
      for (let r of this.pb) {
        if (r.life <= 0) continue;
        if (((r.life -= t), (r.age += t), r.boom))
          if ((!r.back && r.age >= r.turn && ((r.back = !0), (r.hits.length = 0)), r.back)) {
            let x = s.x - r.x,
              m = s.y - r.y,
              g = Math.hypot(x, m) || 0.001;
            if (g < 0.9 || !s.alive || r.age > 4) {
              r.life = 0;
              continue;
            }
            let M = dampFactor(9, t),
              b = r.sp * 1.15;
            ((r.vx += ((x / g) * b - r.vx) * M), (r.vy += ((m / g) * b - r.vy) * M));
          } else r.homing > 0 && r.age > 0.05 && this.home(r, t);
        else r.homing > 0 && r.age > 0.05 && this.home(r, t);
        if (r.drag) {
          let x = 1 - r.drag * t;
          ((r.vx *= x), (r.vy *= x), (r.r = Math.min(1.3, r.r + r.grow * t)));
        }
        let a = r.x,
          o = r.y;
        ((r.x += r.vx * t), (r.y += r.vy * t));
        let c = !1,
          h = Math.hypot(r.vx, r.vy) * t,
          l = h > 0.4 ? Math.ceil(h / 0.4) : 1,
          u = e.lance && r.w === "rail";
        for (let x = 1; x <= l; x++) {
          let m = x / l,
            g = a + (r.x - a) * m,
            M = o + (r.y - o) * m;
          if (n.outside(g, M) || (!u && n.blocked(g, M, r.r * 0.5))) {
            ((r.x = g), (r.y = M), (c = !0));
            break;
          }
        }
        if (c) {
          if (r.boom && !r.back) {
            ((r.back = !0),
              (r.hits.length = 0),
              (r.x -= r.vx * t),
              (r.y -= r.vy * t),
              this.emit("spark", { x: r.x, y: r.y, w: r.w }));
            continue;
          }
          ((r.life = 0),
            (r.bomblet || r.w === "rocket" || weaponDefs[r.w]?.explode || (e.payloadR && !r.drag)) &&
              this.bulletBurst(r, null),
            r.drag || this.emit("spark", { x: r.x, y: r.y, w: r.w }));
          continue;
        }
        let d = Math.hypot(r.vx, r.vy) * t,
          f = d > 0.5 ? Math.ceil(d / 0.5) : 1,
          p = !!weaponDefs[r.w].rail;
        for (let x = 0; x < f && r.life > 0; x++) {
          let m = f > 1 ? (x + 1) / f - 1 : 0,
            g = r.x + r.vx * t * m,
            M = r.y + r.vy * t * m;
          this.hash.query(g, M, r.r + 0.8, (b) => {
            if (r.life <= 0) return !0;
            if (b.dead || b.spawnT > 0.15 || b.ghost) return;
            let v = b.x - g,
              S = b.y - M;
            if (b.type === "bulwark" && !p && b.guardDown <= 0 && !r.hits.includes(b.id)) {
              let R = Math.hypot(v, S),
                _ = b.r + 0.75 + r.r;
              if (R < _ && Math.abs(angleDiff(b.face, Math.atan2(-S, -v))) < 1.15) {
                let E = b.x + Math.cos(b.face) * (b.r + 0.45),
                  C = b.y + Math.sin(b.face) * (b.r + 0.45);
                return (
                  r.boom && !r.back
                    ? ((r.back = !0), (r.hits.length = 0))
                    : r.drag
                      ? (r.hits.push(b.id), r.pierce-- <= 0 && (r.life = 0))
                      : ((r.life = 0),
                        (r.w === "rocket" || r.bomblet || weaponDefs[r.w]?.explode || e.payloadR) &&
                          ((r.x = E), (r.y = C), this.bulletBurst(r, null))),
                  (b.guard -= r.dmg),
                  (b.guardFlash = 1),
                  b.guard <= 0
                    ? ((b.guardDown = 4), this.emit("guardBreak", { x: E, y: C }))
                    : (!r.drag || this.rng.chance(0.2)) && this.emit("block", { x: E, y: C }),
                  !0
                );
              }
            }
            let T = b.r + r.r;
            v * v + S * S > T * T || r.hits.includes(b.id) || this.bulletHit(r, b);
          });
        }
      }
    }
    home(t, e) {
      let n = null,
        s = 8,
        r = Math.atan2(t.vy, t.vx);
      if (
        (this.hash.query(t.x, t.y, 8, (c) => {
          if (c.dead || c.ghost || t.hits.includes(c.id)) return;
          let h = c.x - t.x,
            l = c.y - t.y,
            u = Math.hypot(h, l);
          u > s || Math.abs(angleDiff(r, Math.atan2(l, h))) > 1.3 || ((s = u), (n = c));
        }),
        !n)
      )
        return;
      let a = turnToward(r, Math.atan2(n.y - t.y, n.x - t.x), t.homing * e),
        o = Math.hypot(t.vx, t.vy);
      ((t.vx = Math.cos(a) * o), (t.vy = Math.sin(a) * o), (t.a = a));
    }
    bulletHit(t, e) {
      let n = this.stats,
        s = weaponDefs[t.w],
        r = this.rng.chance(n.crit),
        a = t.dmg * (r ? n.critMul : 1);
      (t.hits.push(e.id),
        this.hurtEnemy(e, a, t.vx, t.vy, s.knock, r, t.wing ? "wingman" : t.bomblet ? "payload" : "weapon"));
      let o = e.shielded || e.ghost;
      if (
        (n.cryo && !o && this.rng.chance(n.cryo) && ((e.slowT = 2), this.emit("freeze", { x: e.x, y: e.y })),
        t.drag && n.burn && !e.dead && !o)
      ) {
        let c = e.burnT > 0 ? e.burnDps : 0;
        ((e.burnT = Math.max(e.burnT, 2.5)),
          (e.burnDps = Math.max(c, n.burn * n.burnMul * n.dmgMul)),
          (e.burnSrc = "burn"));
      }
      if (n.thermite && !e.dead && !o) {
        let c = e.burnT > 0 ? e.burnDps : 0;
        ((e.burnT = 3), (e.burnDps = Math.max(c, a * n.thermite)), (e.burnSrc = "burn"));
      }
      if (
        (n.chain && this.chainFrom(e, n.chain, a * n.chainF, t.hits),
        n.arc && this.rng.chance(n.arc * (t.drag ? 0.25 : 1)) && this.chainFrom(e, n.arcJumps, a * 0.6, t.hits, "arc"),
        (t.bomblet ||
          t.w === "rocket" ||
          weaponDefs[t.w]?.explode ||
          (n.payloadR && (!t.drag || this.rng.chance(0.2)))) &&
          this.bulletBurst(t, e),
        t.bounce > 0)
      ) {
        let c = null,
          h = 8;
        if (
          (this.hash.query(e.x, e.y, 8, (l) => {
            if (l.dead || l.ghost || t.hits.includes(l.id)) return;
            let u = Math.hypot(l.x - e.x, l.y - e.y);
            u < h && ((h = u), (c = l));
          }),
          c)
        ) {
          t.bounce--;
          let l = Math.hypot(t.vx, t.vy),
            u = Math.atan2(c.y - e.y, c.x - e.x);
          ((t.x = e.x),
            (t.y = e.y),
            (t.vx = Math.cos(u) * l),
            (t.vy = Math.sin(u) * l),
            (t.a = u),
            (t.life = Math.max(t.life, 0.35)),
            this.emit("bounce", { x: e.x, y: e.y }));
          return;
        }
      }
      if (t.pierce > 0) {
        t.pierce--;
        return;
      }
      t.life = 0;
    }
    bulletBurst(t, e) {
      let n = this.stats,
        s = weaponDefs[t.w],
        r = e ? e.x : t.x,
        a = e ? e.y : t.y;
      if (t.bomblet) {
        this.explode(r, a, 1.4, t.dmg, { enemies: !0, knock: 1.5, kind: "payload" });
        return;
      }
      if (s?.explode && t.w !== "rocket" && !t.wing) {
        let c = Number.isFinite(s.explodeDmg) ? s.explodeDmg * n.dmgMul : t.dmg,
          o = n.sizeMul > 1 ? 1.15 : 1;
        this.explode(r, a, s.explode * o, c, { enemies: !0, knock: 3, kind: t.w });
      }
      if (t.w === "rocket" && !t.wing) {
        let o = n.hellfire;
        this.explode(r, a, s.explode * (n.sizeMul > 1 ? 1.25 : 1) * (o ? 1.35 : 1), s.explodeDmg * n.dmgMul, {
          enemies: !0,
          knock: 4,
          kind: "rocket",
          burn: o ? s.explodeDmg * n.dmgMul * 0.35 : 0,
        });
      }
      n.payloadR &&
        (this.explode(r, a, n.payloadR, t.dmg * n.payloadF, { enemies: !0, knock: 1.5, kind: "payload" }),
        n.cluster && this.bomblets(r, a, Math.max(6, t.dmg * 0.5)));
    }
    bomblets(t, e, n) {
      for (let s = 0; s < 3; s++) {
        if (this.pb.length >= MAX_PLAYER_BULLETS) return;
        let r = this.rng.next() * TAU;
        this.pb.push({
          id: this.nextId++,
          x: t,
          y: e,
          vx: Math.cos(r) * 11,
          vy: Math.sin(r) * 11,
          a: r,
          r: 0.16,
          dmg: n,
          life: 0.8,
          pierce: 0,
          bounce: 0,
          hits: [],
          w: "rocket",
          age: 0,
          homing: 6,
          bomblet: !0,
        });
      }
    }
    updateEBullets(t) {
      let e = this.player,
        n = this.arena;
      for (let s of this.eb)
        if (!(s.life <= 0)) {
          if (((s.life -= t), (s.age += t), s.homing && s.age > 0.3 && s.age < 2.4 && e.alive)) {
            let r = Math.atan2(s.vy, s.vx),
              a = Math.hypot(s.vx, s.vy),
              o = turnToward(r, Math.atan2(e.y - s.y, e.x - s.x), s.homing * t);
            ((s.vx = Math.cos(o) * a), (s.vy = Math.sin(o) * a));
          }
          if (
            (s.accel && ((s.vx *= 1 + s.accel * t), (s.vy *= 1 + s.accel * t)),
            (s.x += s.vx * t),
            (s.y += s.vy * t),
            n.outside(s.x, s.y, -0.5) || (s.solid !== !1 && n.blocked(s.x, s.y, s.r * 0.4)))
          ) {
            ((s.life = 0), this.emit("pop", { x: s.x, y: s.y }));
            continue;
          }
          if (e.alive) {
            let r = e.x - s.x,
              a = e.y - s.y,
              o = e.r * 0.8 + s.r;
            r * r + a * a < o * o &&
              e.iT <= 0 &&
              e.dashT <= 0 &&
              ((s.life = 0),
              this.hurtPlayer(s.dmg, s.x - s.vx * 0.05, s.y - s.vy * 0.05, s.src) &&
                s.frost &&
                ((e.slowT = 1.6), this.emit("chill", { x: e.x, y: e.y })));
          }
        }
    }
    shoot(t, e, n, s, r, a = {}) {
      if (this.eb.length >= MAX_ENEMY_BULLETS) return null;
      let o = {
        x: t,
        y: e,
        vx: Math.cos(n) * s,
        vy: Math.sin(n) * s,
        r: a.r || 0.24,
        dmg: r,
        life: a.life || 5,
        age: 0,
        kind: a.kind || "orb",
        homing: a.homing || 0,
        accel: a.accel || 0,
        solid: a.solid,
        src: a.src || this._src,
        frost: this._var === "frost",
      };
      return (this.eb.push(o), o);
    }
    updateOrbitals(t) {
      let e = this.stats.orbit;
      if (!e) return;
      let n = this.player,
        s = this.stats.orbitR,
        r = this.stats.orbitDmg * this.stats.dmgMul,
        a = 0.6 * this.stats.bladeScale;
      for (let o = 0; o < e; o++) {
        let c = this.time * 3.3 + (o * TAU) / e,
          h = n.x + Math.cos(c) * s,
          l = n.y + Math.sin(c) * s;
        this.hash.query(h, l, a, (u) => {
          u.dead ||
            u.orbT > 0 ||
            u.spawnT > 0.1 ||
            Math.hypot(u.x - h, u.y - l) > u.r + a ||
            ((u.orbT = 0.38), this.hurtEnemy(u, r, u.x - n.x, u.y - n.y, 2.5, !1, "orbit"));
        });
        for (let u of this.eb)
          u.life > 0 &&
            Math.abs(u.x - h) < 0.7 &&
            Math.abs(u.y - l) < 0.7 &&
            ((u.life = 0), this.emit("pop", { x: u.x, y: u.y }));
      }
    }
    updateWingman(t) {
      let e = this.stats.wingmen;
      if (!e) return;
      let n = this.player;
      for (; n.wings.length < e; ) n.wings.push({ x: n.x, y: n.y, t: n.wings.length * 0.2 });
      let s = dampFactor(6, t);
      for (let r = 0; r < e; r++) {
        let a = n.wings[r],
          o = [2.3, -2.3, 1.3, -1.3][r] ?? 2.3,
          c = n.x + Math.cos(n.aim + o) * 1.5,
          h = n.y + Math.sin(n.aim + o) * 1.5;
        if (((a.x += (c - a.x) * s), (a.y += (h - a.y) * s), (a.t -= t), a.t > 0)) continue;
        let l = null,
          u = 13;
        for (let p of this.enemies) {
          if (p.dead || p.spawnT > 0.2 || p.ghost) continue;
          let x = Math.hypot(p.x - a.x, p.y - a.y) + (p.los ? 0 : 7);
          x < u && ((u = x), (l = p));
        }
        if (!l) continue;
        a.t = this.stats.wingman > 1 ? 0.3 : 0.5;
        let d = Math.atan2(l.y - a.y, l.x - a.x),
          f = this.stats.wingSpread;
        for (let p = 0; p < f && !(this.pb.length >= MAX_PLAYER_BULLETS); p++) {
          let x = d + (p - (f - 1) / 2) * 0.16;
          this.pb.push({
            id: this.nextId++,
            x: a.x,
            y: a.y,
            vx: Math.cos(x) * 30,
            vy: Math.sin(x) * 30,
            a: x,
            r: 0.14,
            dmg: 9 * this.stats.dmgMul,
            life: 0.5,
            pierce: 0,
            bounce: 0,
            hits: [],
            w: "pulse",
            age: 0,
            homing: 0,
            wing: !0,
          });
        }
        this.emit("wingShot", { x: a.x, y: a.y, a: d });
      }
    }
    updateTrails(t) {
      if (!this.trails.length) return;
      let e = 7 * this.stats.dmgMul;
      for (let n of this.trails)
        ((n.life -= t),
          this.hash.query(n.x, n.y, 0.8, (s) => {
            s.dead ||
              s.trailT > this.time ||
              Math.hypot(s.x - n.x, s.y - n.y) > s.r + 0.8 ||
              ((s.trailT = this.time + 0.25), this.hurtEnemy(s, e, 0, 0, 0, !1, "trail"));
          }));
      this.trails = this.trails.filter((n) => n.life > 0);
    }
    updateBeams(t) {
      let e = this.player;
      for (let n of this.beams)
        if (
          ((n.t += t),
          n.rot && (n.a += n.rot * t),
          n.follow && ((n.x = n.follow.x), (n.y = n.follow.y), n.follow.dead && (n.t = 999)),
          (n.live = n.t >= n.warn && n.t < n.warn + n.dur),
          (n.cur = this.arena.rayLen(n.x, n.y, n.a, n.len)),
          n.live && e.alive)
        ) {
          let s = n.x + Math.cos(n.a) * n.cur,
            r = n.y + Math.sin(n.a) * n.cur,
            a = s - n.x,
            o = r - n.y,
            c = a * a + o * o,
            h = ((e.x - n.x) * a + (e.y - n.y) * o) / c;
          h = clamp(h, 0, 1);
          let l = n.x + a * h,
            u = n.y + o * h,
            d = n.w * 0.5 + e.r * 0.7;
          (e.x - l) ** 2 + (e.y - u) ** 2 < d * d && this.hurtPlayer(n.dmg, l, u, n.src);
        }
      this.beams = this.beams.filter((n) => n.t < n.warn + n.dur);
    }
    beam(t) {
      let e = {
        x: t.x,
        y: t.y,
        a: t.a,
        len: t.len || 30,
        cur: t.len || 30,
        w: t.w || 0.8,
        warn: t.warn ?? 0.8,
        dur: t.dur ?? 0.5,
        t: 0,
        rot: t.rot || 0,
        dmg: t.dmg || 20,
        follow: t.follow || null,
        live: !1,
        color: t.color || 0,
        src: this._src,
      };
      return (this.beams.push(e), e);
    }
    hazard(t) {
      let e = {
        x: t.x,
        y: t.y,
        r: t.r,
        delay: t.delay ?? 1,
        t: 0,
        dmg: t.dmg || 20,
        kind: t.kind || "stomp",
        done: !1,
        src: this._src,
        sx: t.sx,
        sy: t.sy,
      };
      return (this.hazards.push(e), e);
    }
    updateHazards(t) {
      for (let e of this.hazards)
        ((e.t += t),
          !e.done &&
            e.t >= e.delay &&
            ((e.done = !0),
            this.explode(e.x, e.y, e.r, 0, { player: !0, dmgPlayer: e.dmg, kind: e.kind, src: e.src })));
      this.hazards = this.hazards.filter((e) => e.t < e.delay + 0.4);
    }
    updatePickups(t) {
      let e = this.player,
        n = this.stats,
        s =
          this.state !== "fight" ||
          (this.enemies.length === 0 && this.planIdx >= this.plan.length && !this.bossPending),
        r = n.magnet;
      for (let a of this.pickups) {
        if (a.dead) continue;
        a.t += t;
        let o = e.x - a.x,
          c = e.y - a.y,
          h = Math.hypot(o, c) || 0.001,
          l = a.kind === "heal" && e.hp >= n.maxHp - 0.5 && this.state === "fight";
        if (
          (l && a.pull && !s && (a.pull = !1),
          !l && !a.pull && a.t > 0.35 && (h < r || s) && (a.pull = !0),
          a.pull && (e.alive || this.state !== "dead"))
        ) {
          let u = 9 + a.t * 10 + (s ? 14 : 0);
          ((a.vx += ((o / h) * u - a.vx) * dampFactor(9, t)), (a.vy += ((c / h) * u - a.vy) * dampFactor(9, t)));
        } else ((a.vx *= 1 - dampFactor(4, t)), (a.vy *= 1 - dampFactor(4, t)));
        if (
          ((a.x += a.vx * t), (a.y += a.vy * t), a.pull || this.arena.resolve(a, 0.2), h < e.r + 0.35 && e.alive && !l)
        ) {
          if (((a.dead = !0), a.kind === "shard")) ((this.shards += a.v), this.emit("shard", { v: a.v }));
          else if (a.kind === "heal") {
            let u = e.hp;
            ((e.hp = Math.min(n.maxHp, e.hp + a.v)), this.emit("heal", { x: e.x, y: e.y, v: Math.round(e.hp - u) }));
          }
        }
        a.kind === "heal" && a.t > 14 && !a.pull && (a.dead = !0);
      }
    }
    updateMarkers(t) {
      for (let e of this.markers)
        if (((e.t += t), !e.fake && e.t >= e.dur && !e.done)) {
          e.done = !0;
          let n = this.spawnEnemy(e.type, e.x, e.y, { elite: e.elite, champion: e.champion });
          (e.champion && ((this.champion = n), this.emit("champion", { type: e.type, x: e.x, y: e.y })),
            this.emit("spawn", { x: e.x, y: e.y, type: e.type, elite: e.elite }),
            (n.face = Math.atan2(this.player.y - e.y, this.player.x - e.x)));
        }
      this.markers = this.markers.filter((e) => !e.done);
    }
    updateSpawns(t) {
      if (this.planIdx >= this.plan.length && !this.bossPending && !this.boss && this.enemies.length <= 4) {
        if (((this.stragglerT += t), this.stragglerT > 9)) for (let o of this.enemies) o.hunt = !0;
      } else this.stragglerT = 0;
      if (this.bossPending && this.waveT > 1.6) {
        let o = this.bossPending;
        ((this.bossPending = null), this.spawnBoss(o));
      }
      if (this.championPending && this.waveT > 5 && !this.hold) {
        let o = this.arena.freePoint(this.rng, this.player.x, this.player.y, 9, 1.6);
        (this.markers.push({
          x: o.x,
          y: o.y,
          t: 0,
          dur: 1.6,
          type: this.championPending,
          elite: !0,
          champion: !0,
          done: !1,
        }),
          (this.championPending = null));
      }
      if (this.planIdx >= this.plan.length || this.hold) return;
      this.groupT -= t;
      let e = this.enemies.length + this.markers.length,
        n = Math.min(70, 26 + Math.round(this.wave * 2.5));
      if (this.groupT > 0 || e >= n) return;
      let s = this.plan[this.planIdx++];
      this.groupT = s.gap;
      let r = this.player,
        a = this.arena.freePoint(this.rng, r.x, r.y, 8.5, 1.2),
        o = [];
      for (let c = 0; c < s.members.length; c++) {
        let h = a.x,
          l = a.y,
          u = this.rng.next() * TAU + c * 2.399963;
        for (let d = 0; d < 12; d++) {
          let f =
              0.55 + Math.min(1.7, 1 + s.members.length * 0.12) * Math.sqrt((c + 0.6) / Math.max(1, s.members.length)),
            p = u + this.rng.range(-0.35, 0.35),
            x = a.x + Math.cos(p) * f,
            m = a.y + Math.sin(p) * f;
          if (
            !this.arena.blocked(x, m, 0.8) &&
            !this.arena.outside(x, m, 1) &&
            !this.arena.featureBlocked(x, m, 0.25) &&
            Math.hypot(x - r.x, m - r.y) >= 6.5 &&
            o.every((g) => Math.hypot(x - g.x, m - g.y) >= 0.9)
          ) {
            h = x;
            l = m;
            break;
          }
        }
        o.push({ x: h, y: l });
        this.markers.push({
          x: h,
          y: l,
          t: 0,
          dur: 0.95,
          type: s.members[c].type,
          elite: s.members[c].elite,
          done: !1,
        });
      }
      this.emit("portal", { x: a.x, y: a.y, n: s.members.length });
    }
    sweep() {
      (this.enemies.some((t) => t.dead) && (this.enemies = this.enemies.filter((t) => !t.dead)),
        this.pb.some((t) => t.life <= 0) && (this.pb = this.pb.filter((t) => t.life > 0)),
        this.eb.some((t) => t.life <= 0) && (this.eb = this.eb.filter((t) => t.life > 0)),
        this.pickups.some((t) => t.dead) && (this.pickups = this.pickups.filter((t) => !t.dead)));
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
          ((this.state = "cleared"), (this.stateT = 0), this.waveDmg === 0 && this.wave >= 8 && this.flawless++);
          let e = !!this.bossFor(this.wave);
          if (e) {
            let n = this.player;
            n.hp = Math.min(this.stats.maxHp, n.hp + this.stats.maxHp * 0.3);
          }
          ((this.offerBoss = e), this.emit("cleared", { n: this.wave, boss: e, flawless: this.waveDmg === 0 }));
        }
      } else if (this.state === "cleared" && ((this.stateT > 1.6 && this.pickups.length === 0) || this.stateT > 3.5)) {
        for (let t of this.pickups) t.kind === "shard" && (this.shards += t.v);
        ((this.pickups.length = 0),
          this.isFinalWave()
            ? ((this.state = "victory"), (this.stateT = 0), this.emit("victory"))
            : ((this.state = "choose"), (this.stateT = 0), (this.offer = this.makeOffer()), this.emit("offer")));
      }
    }
  };

/* 2.3.5: shards in a supply cache, raised by Route Scanner (+50% per level). */
function rlCacheShards(w, v) {
  return Math.round(v * Math.max(1, w.stats.cacheValue || 1));
}
/* 2.3.5: Armor Core absorbs part of the damage from enemies. Lava and acid are left to
   Hazard Seal, so the two modules do not stack on the same damage. */
const RL_HAZARD_SRC = new Set(["lava", "acid"]);
const _rlHurtArmor = World.prototype.hurtPlayer;
World.prototype.hurtPlayer = function (dmg, x, y, src, chip) {
  const armor = Math.min(0.5, this.stats.armor || 0);
  return _rlHurtArmor.call(this, armor > 0 && !RL_HAZARD_SRC.has(src) ? dmg * (1 - armor) : dmg, x, y, src, chip);
};

/* Prototype hooks keep new systems additive and preserve the original class implementation. */
const _rlStartWave = World.prototype.startWave;
World.prototype.startWave = function (wave, nova) {
  _rlStartWave.call(this, wave, nova);
  if (nova == null && this.stats.novaStart > 0)
    this.player.nova = Math.min(100, this.player.nova + this.stats.novaStart);
  const director = this.arena?.director,
    mode = director?.mode || "standard";
  this.waveMode = mode;
  this.waveIntensity = director?.intensity || 0;
  if (nova == null && !this.bossPending && !this.boss && wave >= 2) {
    const count = wave % 6 === 0 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const p = this.arena.freePoint(
        makeRng(hashString(this.seed + ":cache:" + wave + ":" + i)),
        this.player.x,
        this.player.y,
        6.2,
        0.35,
      );
      if (!p) continue;
      const value = this.rng.chance(0.12) ? 25 : this.rng.chance(0.35) ? 10 : 5,
        kind = this.rng.chance(0.12) ? "heal" : "shard";
      const q = this.mkPickup(kind, p.x, p.y, kind === "heal" ? 20 : rlCacheShards(this, value));
      q.vx = 0;
      q.vy = 0;
      q.cache = !0;
      this.pickups.push(q);
    }
  }
  if (nova != null || this.bossPending || this.boss || wave < 2) return;
  const extra =
    Math.max(0, this.stats.cacheBonus || 0) +
    Math.max(0, this.stats.cacheCount || 0) +
    (mode === "cache-run" ? 2 : 0) +
    (mode === "salvage" ? 2 : 0) +
    (wave % 9 === 0 ? 1 : 0);
  const cacheRng = makeRng(hashString(this.seed + ":cache22:" + wave));
  for (let i = 0; i < extra; i++) {
    const p = this.arena.freePoint(cacheRng, this.player.x, this.player.y, 6.2, 0.35);
    if (!p) continue;
    const kind = cacheRng.chance(0.18) ? "heal" : "shard",
      value = kind === "heal" ? 20 : rlCacheShards(this, 5 + 2 * (this.stats.cacheBonus || 0));
    const q = this.mkPickup(kind, p.x, p.y, value);
    q.vx = 0;
    q.vy = 0;
    q.cache = !0;
    this.pickups.push(q);
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
    const members = [{ type: cacheRng.pick(avail), elite: !1 }];
    if (wave >= 30 && cacheRng.chance(0.45)) members.push({ type: cacheRng.pick(avail), elite: !1 });
    this.plan.push({ gap: 2.35, members });
    this.planTotal += members.length;
  }
};
const _rlKillEnemy = World.prototype.killEnemy;
World.prototype.killEnemy = function (enemy) {
  const before = this.kills;
  _rlKillEnemy.call(this, enemy);
  if (enemy?.boss || this.kills <= before || !this.player.alive) return;
  if (this.stats.leech && this.rng.chance(Math.min(0.24, 0.08 * this.stats.leech)))
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + 2);
  if (enemy.type === "carrier" && this.state === "fight" && this.rng.chance(0.55)) {
    const v = rlCacheShards(this, 5 + 3 * (this.stats.cacheBonus || 0)),
      q = this.mkPickup("shard", enemy.x, enemy.y, v);
    q.vx = 0;
    q.vy = 0;
    q.cache = !0;
    this.pickups.push(q);
  }
  if (this.stats.supply && this.kills % 12 === 0) {
    const amount = 2 * this.stats.supply;
    this.dropShards(enemy.x, enemy.y, amount);
    this.emit("supplyDrop", { x: enemy.x, y: enemy.y, amount });
  }
};
const _rlHurtEnemy = World.prototype.hurtEnemy;
World.prototype.hurtEnemy = function (enemy, dmg, dx, dy, knock, crit, src) {
  const mul = enemy && (enemy.elite || enemy.boss) ? this.stats.eliteMul || 1 : 1;
  return _rlHurtEnemy.call(this, enemy, dmg * mul, dx, dy, knock, crit, src);
};
const _rlChampionType = World.prototype.championType;
World.prototype.championType = function (biome, wave, rng) {
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
  return _rlChampionType.call(this, biome, wave, rng);
};
const _rlFire21 = World.prototype.fire;
World.prototype.fire = function (angle) {
  const echoing = !!this._rl21Echoing;
  _rlFire21.call(this, angle);
  if (echoing || this.state !== "fight" || !this.player.alive) return;
  const s = this.stats,
    shot = this.player.shotN || 0;
  if (s.overload > 0 && shot > 0 && shot % 6 === 0)
    this.explode(
      this.player.x + Math.cos(angle) * 0.9,
      this.player.y + Math.sin(angle) * 0.9,
      1.25,
      24 + 8 * s.overload,
      { enemies: true, knock: 2, kind: "overload" },
    );
  if (s.echo > 0 && this.rng.chance(Math.min(0.28, 0.08 * s.echo))) {
    this._rl21Echoing = true;
    try {
      _rlFire21.call(this, angle + this.rng.range(-0.035, 0.035));
    } finally {
      this._rl21Echoing = false;
    }
  }
};
World.prototype.biomeFor = function (wave) {
  const cycle = Math.floor((Math.max(1, wave) - 1) / 5);
  return biomesById[this.route[cycle % this.route.length]] || biomeList[0];
};
const _rlStartWave240 = World.prototype.startWave;
World.prototype.startWave = function (wave, nova) {
  set_RL_BIOME_MIX_CUR(RL_BIOME_INFO[this.biomeFor(wave).id]?.mix || null);
  try {
    return _rlStartWave240.call(this, wave, nova);
  } finally {
    set_RL_BIOME_MIX_CUR(null);
  }
};
(() => {
  const baseStep = World.prototype.step,
    baseHurt = World.prototype.hurtPlayer,
    baseKill = World.prototype.killEnemy;
  World.prototype.step = function (dt, input) {
    const st = this.stats,
      base = st.rateMul || 1;
    st.rateMul =
      base * (st.momentum > 0 && input && Math.hypot(+input.mx || 0, +input.my || 0) > 0.08 ? 1 + st.momentum : 1);
    try {
      return baseStep.call(this, dt, input);
    } finally {
      st.rateMul = base;
    }
  };
  World.prototype.hurtPlayer = function (dmg, x, y, src, chip) {
    const st = this.stats,
      low = this.player.hp <= st.maxHp * 0.35;
    return baseHurt.call(
      this,
      // 2.4.2: the 1-damage floor only applies to hits that did at least 1 before. Small hazard
      // ticks (acid with high resistance) used to be raised to 1 by Last Stand.
      low && st.laststand > 0 ? Math.min(dmg, Math.max(1, dmg * (1 - st.laststand))) : dmg,
      x,
      y,
      src,
      chip,
    );
  };
  World.prototype.killEnemy = function (enemy) {
    const before = this.kills;
    const out = baseKill.call(this, enemy);
    const lv = this.stats.scavenger || 0,
      every = Math.max(5, 30 - 5 * lv);
    if (lv > 0 && !enemy?.boss && !enemy?.noDrop && this.kills > before && this.kills % every === 0) {
      const amount = 2 * lv;
      this.dropShards(this.player.x, this.player.y, amount);
      this.emit("salvagePulse", { x: this.player.x, y: this.player.y, amount });
    }
    return out;
  };
})();

export { World, rlStep };
