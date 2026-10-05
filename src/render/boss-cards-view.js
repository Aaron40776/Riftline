// 3.15.0: how the boss cards look (core/boss-cards.js decides everything, this only shows it). They are the player's
// own, so none of them uses the red of a warning: the Lockdown Grid is gold, the Crucible Hammer orange and molten,
// the Shard Field ice white and blue, the Brood acid green, Event Collapse the violet of the rift.
//   cages      six pylons drop around the spot and hit the floor, then gold beams run between them while they hold
//   hammer     an ember glow on the drone while the next dash slams; the slam: an orange ring, sparks, molten ground
//   splinters  thin ice shards that fly out of a kill
//   brood      small larvae with wings and a green glow that circle the drone, then dive at an enemy
//   implode    rings and sparks drawn into the drone before the Nova

import { Color, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry } from "three";
import { meshPart, mergeParts, box, ball, bar } from "./models.js";
import { clamp, TAU } from "../core/util.js";
import { MARK_LOOK } from "./attacks-view.js";
import { LOCK_WARN, LOCK_TIME, COLLAPSE_TIME } from "../core/boss-cards.js";

const hex = (value) => new Color(value),
  GOLD = hex(0xffc84a),
  GOLD_WHITE = hex(0xfff0c0),
  EMBER = hex(0xff8a2a),
  MOLTEN = hex(0xff5a1a),
  HOT = hex(0xffd27a),
  ICE = hex(0x9ae6ff),
  ICE_WHITE = hex(0xe8fbff),
  ACID = hex(0xa8f03a),
  ACID_PALE = hex(0xe6ff8a),
  RIFT = hex(0xa56bff),
  RIFT_RIM = hex(0x7ae8ff),
  PYLONS = 6;

const MODELS = {
  // a squat steel pylon with a gold emitter at the top and one at knee height
  pylon: () => ({
    body: [
      box(0x2a2f3a, 0.34, 0.08, 0.34, { y: 0.04 }),
      box(0x3a4252, 0.16, 1.05, 0.16, { y: 0.55 }),
      box(0x1a1e26, 0.22, 0.1, 0.22, { y: 1.1 }),
      box(0x1a1e26, 0.2, 0.06, 0.2, { y: 0.42 }),
    ],
    glow: [ball(0xffc84a, 0.08, 6, 4, { y: 1.2 }), box(0xffc84a, 0.18, 0.04, 0.18, { y: 0.46 })],
  }),
  // a larva of the Brood: three body segments, two pairs of wings, a pale sting
  larva: () => ({
    body: [
      ball(0x3d5a1a, 0.17, 7, 5, { x: 0.12, sx: 1.2 }),
      ball(0x4f7322, 0.13, 6, 4, { x: -0.1 }),
      ball(0x2d4512, 0.1, 6, 4, { x: -0.28, sx: 1.3 }),
      bar(0xd8f0a0, 0.03, [-0.36, 0, 0], [-0.5, -0.03, 0]),
    ],
    glow: [
      ball(0xd7ff4a, 0.04, 4, 3, { x: 0.27, y: 0.05, z: 0.07 }),
      ball(0xd7ff4a, 0.04, 4, 3, { x: 0.27, y: 0.05, z: -0.07 }),
      ball(0xa8f03a, 0.06, 5, 3, { x: -0.28, y: 0.04 }),
    ],
    mover: [
      bar(0xbfe8a0, 0.14, [0.05, 0.08, 0.06], [-0.05, 0.12, 0.42], 0.01),
      bar(0xbfe8a0, 0.14, [0.05, 0.08, -0.06], [-0.05, 0.12, -0.42], 0.01),
    ],
  }),
  // an ice splinter, long and thin along x
  splinter: () => ({
    body: [meshPart(new OctahedronGeometry(0.12, 0), 0xcff4ff, { sx: 3.2, sy: 0.6, sz: 0.6 })],
  }),
};

class BossCardView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
    this.wingT = 0;
  }
  get(name, max) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name](),
      mk = (parts, glow, lit) => {
        const pool = new this.Pool(
          mergeParts(parts.flat()),
          glow
            ? new MeshBasicMaterial({ toneMapped: false, vertexColors: true })
            : new MeshLambertMaterial({
                vertexColors: true,
                flatShading: true,
                ...(lit ? { emissive: 0x223344 } : {}),
              }),
          max,
        );
        this.r.scene.add(pool.mesh);
        this.list.push(pool);
        pool.mesh.renderOrder = glow ? 2 : 1;
        return pool;
      };
    set = this.pl[name] = {
      body: mk(m.body, false, name === "splinter"),
      glow: m.glow ? mk(m.glow, true) : null,
      mover: m.mover ? mk(m.mover, false) : null,
    };
    // pools made in the middle of a frame start empty, like the others did at its begin
    for (const pool of [set.body, set.glow, set.mover]) if (pool) pool.begin();
    return set;
  }
  update(dt, world) {
    const r = this.r,
      quality = Math.min(1, r.maxParticles / 1400);
    if (world.cages && world.cages.length) this.cages(dt, world, quality);
    if (world.slag && world.slag.length) this.slag(dt, world, quality);
    if (world.splinters && world.splinters.length) this.splinters(world);
    if (world.player.brood && world.player.brood.length) this.brood(dt, world, quality);
    if (world.implode) this.implode(dt, world, quality);
    if (world.stats.hammer && world.player.alive) this.hammerGlow(dt, world, quality);
  }
  cages(dt, world, quality) {
    const r = this.r,
      P = this.get("pylon", 6 * PYLONS),
      time = r.time;
    for (const cage of world.cages) {
      const drop = clamp(cage.t / LOCK_WARN, 0, 1),
        fall = 1 - drop * drop,
        live = cage.t >= LOCK_WARN,
        end = clamp((cage.t - LOCK_WARN - LOCK_TIME + 0.3) / 0.3, 0, 1),
        spin = cage.id * 0.7,
        pts = [];
      for (let i = 0; i < PYLONS; i++) {
        const a = spin + (i / PYLONS) * TAU,
          x = cage.x + Math.cos(a) * cage.r,
          z = cage.y + Math.sin(a) * cage.r,
          y = fall * 5 - end * 1.2;
        pts.push(x, z);
        P.body.y(x, y, z, -a, 1, 1 - end * 0.5, 1);
        const g = P.glow.y(x, y, z, -a, 1, 1 - end * 0.5, 1);
        P.glow.colC(g, GOLD, live ? 1.4 + Math.sin(time * 30 + i) * 0.3 : 0.6 + drop);
        r.shadows.y(x, 0.02, z, 0, 0.5 + drop * 0.3);
      }
      if (!live) {
        // where it will close: a thin gold circle that fills in (the player's own colour, not a warning)
        r.ringPool.colC(r.ringPool.y(cage.x, 0.05, cage.y, 0, cage.r), GOLD, 0.25 + drop * 0.35);
        continue;
      }
      // the beams between the pylons, at two heights, flickering; a faint gold floor inside
      const k = (1 - end) * (0.9 + Math.sin(time * 40 + cage.id) * 0.1);
      for (let i = 0; i < PYLONS; i++) {
        const j = (i + 1) % PYLONS,
          x0 = pts[i * 2],
          z0 = pts[i * 2 + 1],
          x1 = pts[j * 2],
          z1 = pts[j * 2 + 1];
        r.beams.colC(r.beams.seg(x0, z0, x1, z1, 1.2, 0.07, 0.05), GOLD_WHITE, 1.1 * k);
        r.beams.colC(r.beams.seg(x0, z0, x1, z1, 0.46, 0.06, 0.04), GOLD, 0.9 * k);
      }
      r.discs.colC(r.discs.y(cage.x, 0.04, cage.y, 0, cage.r), GOLD, 0.08 * k);
      r.ringPool.colC(r.ringPool.y(cage.x, 0.05, cage.y, 0, cage.r), GOLD, 0.55 * k);
      // sparks off the held enemies
      for (const enemy of cage.held)
        if (!enemy.dead && Math.random() < dt * 8 * quality)
          r.emit(enemy.x, 0.7, enemy.y, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, 0.3, 0.12, GOLD, {
            spark: true,
            drag: 3,
          });
    }
  }
  slag(dt, world, quality) {
    const r = this.r,
      time = r.time;
    for (const pool of world.slag) {
      const fade = clamp(pool.life / 0.6, 0, 1),
        rise = clamp((3 - pool.life) / 0.25, 0, 1),
        rad = pool.r * (0.6 + 0.4 * rise);
      r.shadows.y(pool.x, 0.02, pool.y, 0, rad * 2.2);
      r.discs.colC(r.discs.y(pool.x, 0.035, pool.y, 0, rad), MOLTEN, (0.35 + Math.sin(time * 5) * 0.05) * fade);
      r.discs.colC(r.discs.y(pool.x, 0.04, pool.y, time * 0.4, rad * 0.55), HOT, 0.3 * fade);
      r.ringPool.colC(r.ringPool.y(pool.x, 0.045, pool.y, 0, rad), EMBER, 0.45 * fade);
      if (Math.random() < dt * 18 * quality * fade) {
        const a = Math.random() * TAU,
          d = Math.random() * rad * 0.85;
        r.emit(
          pool.x + Math.cos(a) * d,
          0.15,
          pool.y + Math.sin(a) * d,
          0,
          0.8 + Math.random(),
          0,
          0.7,
          0.1,
          Math.random() < 0.5 ? EMBER : HOT,
          { drag: 1, grav: -0.5, spark: true },
        );
      }
    }
  }
  splinters(world) {
    const r = this.r,
      P = this.get("splinter", 64);
    for (const s of world.splinters) {
      P.body.y(s.x, 0.7, s.y, s.a, 1);
      r.sprites.colC(r.sprites.bb(s.x, 0.7, s.y, 0.55, r.B), ICE, 0.55);
    }
  }
  brood(dt, world, quality) {
    const r = this.r,
      P = this.get("larva", 8),
      time = r.time;
    for (const larva of world.player.brood) {
      const a = Math.atan2(larva.vy, larva.vx),
        bob = Math.sin(time * 9 + larva.id) * 0.08,
        hunt = !!larva.target,
        y = (hunt ? 0.55 : 0.95) + bob,
        dive = hunt ? -0.35 : 0;
      P.body.yr(larva.x, y, larva.y, a, 1, 1, 1, dive, 0);
      P.glow.colC(P.glow.yr(larva.x, y, larva.y, a, 1, 1, 1, dive, 0), ACID, 1.2);
      // the wings beat: a fast roll of the wing pair
      const beat = Math.sin(time * 70 + larva.id) * 0.5;
      P.mover.yr(larva.x, y, larva.y, a, 1, 1 + beat * 0.6, 1, dive, 0);
      r.sprites.colC(r.sprites.bb(larva.x, y, larva.y, 0.7, r.B), ACID, 0.35);
      r.shadows.y(larva.x, 0.02, larva.y, 0, 0.45);
      if (Math.random() < dt * (hunt ? 14 : 4) * quality)
        r.emit(larva.x, y, larva.y, -larva.vx * 0.1, 0.2, -larva.vy * 0.1, 0.4, 0.08, ACID_PALE, { drag: 2 });
    }
  }
  implode(dt, world, quality) {
    const r = this.r,
      imp = world.implode,
      k = clamp(imp.t / COLLAPSE_TIME, 0, 1),
      pull = imp.r * 1.4,
      x = imp.x,
      z = imp.y;
    // three rings run in from the pull radius, the floor darkens, the core of the drone brightens
    for (let i = 0; i < 3; i++) {
      const f = (k + i / 3) % 1,
        rad = pull * (1 - f);
      r.ringPool.colC(r.ringPool.y(x, 0.06, z, 0, Math.max(0.2, rad)), i % 2 ? RIFT_RIM : RIFT, 0.3 + f * 0.5);
    }
    r.shadows.y(x, 0.025, z, 0, pull * (1.4 - k * 0.6));
    r.sprites.colC(r.sprites.bb(x, 0.9, z, 1 + k * 2.2, r.B), RIFT, 0.4 + k * 0.6);
    if (Math.random() < dt * 120 * quality) {
      const a = Math.random() * TAU,
        d = pull * (0.6 + Math.random() * 0.4),
        speed = d / Math.max(0.12, COLLAPSE_TIME - imp.t);
      r.emit(
        x + Math.cos(a) * d,
        0.4,
        z + Math.sin(a) * d,
        -Math.cos(a) * speed,
        0.4,
        -Math.sin(a) * speed,
        Math.max(0.1, COLLAPSE_TIME - imp.t),
        0.14,
        Math.random() < 0.5 ? RIFT_RIM : RIFT,
        { drag: 0, spark: true },
      );
    }
  }
  // the next dash slams: embers rise from the drone; while that dash runs, a molten streak follows it
  hammerGlow(dt, world, quality) {
    const r = this.r,
      player = world.player,
      ready = !(player.hammerT > 0);
    if (!ready) return;
    r.sprites.colC(r.sprites.bb(player.x, 0.35, player.y, 1.1, r.B), EMBER, 0.35 + Math.sin(r.time * 6) * 0.08);
    if (Math.random() < dt * (player.dashT > 0 ? 60 : 6) * quality)
      r.emit(
        player.x + (Math.random() - 0.5) * 0.5,
        0.3,
        player.y + (Math.random() - 0.5) * 0.5,
        0,
        1 + Math.random(),
        0,
        0.5,
        0.1,
        Math.random() < 0.5 ? EMBER : HOT,
        { drag: 1.5, grav: -0.4, spark: true },
      );
  }
  /* the events: the slam of the hammer and the burst of a larva (both `boom`), a shatter, a hatch, the cage */
  event(ev, world, shakeK) {
    const r = this.r;
    switch (ev.k) {
      case "lockdown":
        r.ring(ev.x, ev.y, ev.r * 1.2, ev.r, GOLD, 0.3);
        return true;
      case "lockOn":
        r.ring(ev.x, ev.y, 0.3, ev.r, GOLD_WHITE, 0.25);
        r.flash(ev.x, ev.y, ev.r * 1.4, 1.1, GOLD, 5);
        r.addShake(0.08 * shakeK);
        return true;
      case "hammerReady":
        r.burst(world.player.x, world.player.y, 0.6, 6, 2.5, HOT, 0.4, 0.14, { spark: true, grav: 3 });
        return true;
      case "shatter":
        r.burst(ev.x, ev.y, 0.7, 8, 5, ICE_WHITE, 0.35, 0.12, { spark: true, drag: 3, grav: 5 });
        r.ring(ev.x, ev.y, 0.2, 1.2, ICE, 0.2);
        return true;
      case "broodHatch":
        r.burst(ev.x, ev.y, 0.5, 8, 3, ACID, 0.4, 0.14, { drag: 3, grav: 4 });
        r.ring(ev.x, ev.y, 0.2, 0.9, ACID_PALE, 0.25);
        return true;
      case "boom":
        if (ev.kind === "hammer") {
          r.ring(ev.x, ev.y, 0.3, ev.r, EMBER, 0.32);
          r.ring(ev.x, ev.y, 0.2, ev.r * 0.7, HOT, 0.2);
          r.emit(ev.x, 0.6, ev.y, 0, 0, 0, 0.18, ev.r * 1.3, HOT, { drag: 0 });
          r.burst(ev.x, ev.y, 0.4, 22, ev.r * 4, EMBER, 0.6, 0.16, { spark: true, drag: 2, grav: 7 });
          r.debrisBurst(ev.x, ev.y, 0.3, 8, hex(0x3a2a20), 0.14, 6);
          r.flash(ev.x, ev.y, ev.r * 2, 1.6, MOLTEN, 4);
          if (r.attackView) r.attackView.mark(ev.x, ev.y, ev.r * 0.55, MARK_LOOK.slag);
          r.addShake(0.35 * shakeK);
          return true;
        }
        if (ev.kind === "brood") {
          r.ring(ev.x, ev.y, 0.2, ev.r, ACID, 0.25);
          r.burst(ev.x, ev.y, 0.5, 12, 4, ACID, 0.45, 0.16, { drag: 2, grav: 5 });
          r.emit(ev.x, 0.5, ev.y, 0, 0.3, 0, 0.5, ev.r * 1.2, ACID_PALE, { drag: 0, grow: 1 });
          r.flash(ev.x, ev.y, ev.r * 1.6, 0.9, ACID, 5);
          if (r.attackView) r.attackView.mark(ev.x, ev.y, ev.r * 0.5, MARK_LOOK.slime);
          return true;
        }
        return false;
    }
    return false;
  }
}

export { BossCardView };
