// three.js renderer (Bl): scene, camera, lights, instanced pools, particles, per-frame drawing.

import {
  AdditiveBlending as rs,
  BoxGeometry as Ct,
  CanvasTexture as Rr,
  CircleGeometry as Pr,
  Color as Ot,
  CylinderGeometry as ye,
  DirectionalLight as $r,
  DoubleSide as fn,
  DynamicDrawUsage as ra,
  Euler as Mn,
  Fog as _r,
  HemisphereLight as Xr,
  InstancedBufferAttribute as fi,
  InstancedMesh as Er,
  Matrix4 as de,
  MeshBasicMaterial as Ie,
  MeshLambertMaterial as $e,
  PerspectiveCamera as Je,
  PlaneGeometry as jn,
  PointLight as ss,
  Quaternion as mn,
  Raycaster as Zr,
  RingGeometry as Gr,
  Scene as br,
  SphereGeometry as De,
  SRGBColorSpace as Ze,
  Vector2 as ht,
  Vector3 as I,
  WebGLRenderer as Il,
} from "three";
import { ze } from "../core/diagnostics.js";
import { Gl } from "../ui/ui.js";
import { Bf, Ff, Fh, Gf, Hf, Of, Uf, Vf, kf, zf } from "./models.js";
import { Ae, ba, en } from "../data/enemies.js";
import { Ft } from "../main.js";
import { $f, Lt, Me, Zf, vn } from "../core/util.js";
import { ii } from "../data/biomes.js";
import { ue } from "../data/weapons.js";
import { RL_BIOME_LOOK, RL_SKIN, Ul, rlAmbient, rlSkinMaterial, rlSkinParticles } from "./biome-visuals.js";

var wf = new Ot(),
  Ue = class {
    constructor(t, e, n, s = {}) {
      ((this.max = n),
        (this.mesh = new Er(t, e, n)),
        this.mesh.instanceMatrix.setUsage(ra),
        (this.mesh.frustumCulled = !1),
        (this.mesh.count = 0),
        (this.m = this.mesh.instanceMatrix.array),
        s.color !== !1 &&
          ((this.mesh.instanceColor = new fi(new Float32Array(n * 3).fill(1), 3)),
          this.mesh.instanceColor.setUsage(ra),
          (this.c = this.mesh.instanceColor.array)),
        s.flash &&
          ((this.fAttr = new fi(new Float32Array(n), 1)),
          this.fAttr.setUsage(ra),
          t.setAttribute("aFlash", this.fAttr),
          (this.f = this.fAttr.array)),
        (this.n = 0));
    }
    begin() {
      this.n = 0;
    }
    end() {
      ((this.mesh.count = this.n),
        (this.mesh.instanceMatrix.needsUpdate = !0),
        this.c && (this.mesh.instanceColor.needsUpdate = !0),
        this.f && (this.fAttr.needsUpdate = !0));
    }
    y(t, e, n, s, r, a = r, o = r) {
      if (this.n >= this.max) return -1;
      let c = this.n++,
        h = this.m,
        l = c * 16,
        u = Math.cos(-s),
        d = Math.sin(-s);
      return (
        (h[l] = u * r),
        (h[l + 1] = 0),
        (h[l + 2] = -d * r),
        (h[l + 3] = 0),
        (h[l + 4] = 0),
        (h[l + 5] = a),
        (h[l + 6] = 0),
        (h[l + 7] = 0),
        (h[l + 8] = d * o),
        (h[l + 9] = 0),
        (h[l + 10] = u * o),
        (h[l + 11] = 0),
        (h[l + 12] = t),
        (h[l + 13] = e),
        (h[l + 14] = n),
        (h[l + 15] = 1),
        c
      );
    }
    bb(t, e, n, s, r, a = 0) {
      if (this.n >= this.max) return -1;
      let o = this.n++,
        c = this.m,
        h = o * 16,
        l = r.rx,
        u = r.ry,
        d = r.rz,
        f = r.ux,
        p = r.uy,
        x = r.uz;
      if (a) {
        let m = Math.cos(a),
          g = Math.sin(a),
          M = l * m + f * g,
          b = u * m + p * g,
          v = d * m + x * g;
        ((f = f * m - l * g), (p = p * m - u * g), (x = x * m - d * g), (l = M), (u = b), (d = v));
      }
      return (
        (c[h] = l * s),
        (c[h + 1] = u * s),
        (c[h + 2] = d * s),
        (c[h + 3] = 0),
        (c[h + 4] = f * s),
        (c[h + 5] = p * s),
        (c[h + 6] = x * s),
        (c[h + 7] = 0),
        (c[h + 8] = r.fx),
        (c[h + 9] = r.fy),
        (c[h + 10] = r.fz),
        (c[h + 11] = 0),
        (c[h + 12] = t),
        (c[h + 13] = e),
        (c[h + 14] = n),
        (c[h + 15] = 1),
        o
      );
    }
    seg(t, e, n, s, r, a, o) {
      let c = n - t,
        h = s - e,
        l = Math.hypot(c, h);
      return l < 1e-4 ? -1 : this.y(t, r, e, Math.atan2(h, c), l, o, a);
    }
    col(t, e, n, s) {
      if (t < 0 || !this.c) return;
      let r = t * 3;
      ((this.c[r] = e), (this.c[r + 1] = n), (this.c[r + 2] = s));
    }
    colC(t, e, n = 1) {
      if (t < 0 || !this.c) return;
      let s = t * 3;
      ((this.c[s] = e.r * n), (this.c[s + 1] = e.g * n), (this.c[s + 2] = e.b * n));
    }
    colHex(t, e, n = 1) {
      (wf.setHex(e), this.colC(t, wf, n));
    }
    flash(t, e) {
      t >= 0 && this.f && (this.f[t] = e);
    }
  };
function Tf(i) {
  let t = new $e(i);
  return (
    (t.onBeforeCompile = (e) => {
      ((e.vertexShader = e.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute float aFlash;
varying float vFlash;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vFlash = aFlash;`,
        )),
        (e.fragmentShader = e.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying float vFlash;`,
          )
          .replace(
            "#include <opaque_fragment>",
            `outgoingLight = mix(outgoingLight, vec3(1.0), vFlash);
#include <opaque_fragment>`,
          )));
    }),
    (t.customProgramCacheKey = () => "flashLambert"),
    t
  );
}
function zi(i, t = {}) {
  return new Ie({ map: i || null, transparent: !0, depthWrite: !1, blending: rs, toneMapped: !1, ...t });
}
function Nl(i, t) {
  let e = document.createElement("canvas");
  e.width = e.height = i;
  let n = e.getContext("2d");
  t(n, i);
  let s = new Rr(e);
  return ((s.colorSpace = Ze), (s.needsUpdate = !0), s);
}
function Ef() {
  return Nl(128, (i, t) => {
    let e = t / 2,
      n = i.createRadialGradient(e, e, 0, e, e, e);
    (n.addColorStop(0, "rgba(255,255,255,1)"),
      n.addColorStop(0.18, "rgba(255,255,255,0.85)"),
      n.addColorStop(0.45, "rgba(255,255,255,0.25)"),
      n.addColorStop(1, "rgba(255,255,255,0)"),
      (i.fillStyle = n),
      i.fillRect(0, 0, t, t));
  });
}
function Af() {
  return Nl(64, (i, t) => {
    let e = t / 2,
      n = i.createRadialGradient(e, e, 0, e, e, e);
    (n.addColorStop(0, "rgba(0,0,0,0.75)"),
      n.addColorStop(0.6, "rgba(0,0,0,0.35)"),
      n.addColorStop(1, "rgba(0,0,0,0)"),
      (i.fillStyle = n),
      i.fillRect(0, 0, t, t));
  });
}
function Rf() {
  return Nl(64, (i, t) => {
    let e = i.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
    (e.addColorStop(0, "rgba(255,255,255,1)"),
      e.addColorStop(0.35, "rgba(255,255,255,0.6)"),
      e.addColorStop(1, "rgba(255,255,255,0)"),
      (i.fillStyle = e),
      i.beginPath(),
      i.moveTo(t / 2, 0),
      i.lineTo(t * 0.62, t / 2),
      i.lineTo(t / 2, t),
      i.lineTo(t * 0.38, t / 2),
      i.closePath(),
      i.fill(),
      i.beginPath(),
      i.moveTo(0, t / 2),
      i.lineTo(t / 2, t * 0.6),
      i.lineTo(t, t / 2),
      i.lineTo(t / 2, t * 0.4),
      i.closePath(),
      i.fill());
  });
}
function Cf() {
  return Nl(64, (i, t) => {
    let e = i.createLinearGradient(0, t, 0, 0);
    (e.addColorStop(0, "rgba(255,255,255,0.95)"),
      e.addColorStop(0.25, "rgba(255,255,255,0.45)"),
      e.addColorStop(1, "rgba(255,255,255,0)"),
      (i.fillStyle = e),
      i.fillRect(0, 0, t, t));
  });
}
var Jv = 1400,
  Pn = new Ot(16762954),
  Wf = new Map(),
  lt = (i) => {
    let t = Wf.get(i);
    return (t || ((t = new Ot(i)), Wf.set(i, t)), t);
  },
  Xf = { orb: lt(16727423), fast: lt(16722474), shard: lt(9431295) },
  Fl = { 1: lt(8386303), 5: lt(16762954), 25: lt(16734936) },
  ha = lt(7208842),
  mi = lt(16777215),
  qf = lt(16724048),
  In = new Ot(16728160),
  Kv = { scorch: lt(16738858), frost: lt(11462911), phase: lt(16732120), toxic: lt(11861821) },
  Yf = new Ot(16732064),
  Bl = class {
    constructor(t, e = {}) {
      ((this.canvas = t),
        (this.renderer = new Il({ canvas: t, antialias: !0, powerPreference: "high-performance", stencil: !1 })),
        (this.renderer.outputColorSpace = Ze),
        this.renderer.setClearColor(329485, 1),
        (this.dprCap = e.dpr || 1.5),
        (this.zoom = 1),
        (this.scene = new br()),
        (this.scene.fog = new _r(395798, 30, 75)),
        (this.camera = new Je(42, 1, 0.5, 200)),
        (this.hemi = new Xr(2771594, 657944, 1.9)),
        (this.sun = new $r(16777215, 1.5)),
        this.sun.position.set(6, 14, 9),
        this.scene.add(this.hemi, this.sun),
        (this.arena = new Ul(this.scene)),
        (this.time = 0),
        (this.shake = 0),
        (this.camX = 0),
        (this.camZ = 2),
        (this.camInit = !1),
        (this.B = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 }),
        (this.nums = []),
        (this.maxParticles = e.particles || Jv),
        this.initPools(),
        this.initParticles(),
        (this.lines = []),
        (this.rings = []),
        (this.player = null),
        (this.playerWeapon = null),
        (this.bossView = null),
        (this.flashT = 0),
        (this.menuA = 0),
        (this.flashK = 1),
        (this.contrast = !1),
        this.resize());
    }
    initPools() {
      let t = this.scene;
      ((this.texGlow = Ef()), (this.texShadow = Af()), (this.texSpark = Rf()));
      let e = new jn(1, 1);
      ((this.sprites = new Ue(e, zi(this.texGlow), 2200)), (this.sparks = new Ue(e.clone(), zi(this.texSpark), 700)));
      let n = new Gr(0.86, 1, 48, 1);
      (n.rotateX(-Math.PI / 2), (this.ringPool = new Ue(n, zi(null, { side: fn }), 260)));
      let s = new Pr(1, 40);
      (s.rotateX(-Math.PI / 2), (this.discs = new Ue(s, zi(null, { side: fn }), 120)));
      let r = new Ct(1, 1, 1);
      (r.translate(0.5, 0, 0), (this.beams = new Ue(r, zi(null), 500)));
      let a = new jn(1, 1);
      (a.rotateX(-Math.PI / 2),
        (this.shadows = new Ue(
          a,
          new Ie({ map: this.texShadow, transparent: !0, depthWrite: !1, color: 16777215 }),
          320,
          { color: !1 },
        )));
      let o = new De(1, 10, 6);
      ((this.pbCore = new Ue(o, new Ie({ toneMapped: !1 }), 460)),
        (this.ebCore = new Ue(o.clone(), new Ie({ toneMapped: !1 }), 380)),
        (this.shardPool = new Ue(Gf(), new Ie({ toneMapped: !1 }), 300)),
        (this.healPool = new Ue(Vf(), new Ie({ toneMapped: !1, vertexColors: !0 }), 40)),
        (this.blades = new Ue(Hf(), new Ie({ toneMapped: !1 }), 8)),
        (this.wing = new Ue(zf(), new $e({ vertexColors: !0 }), 4, { color: !1 })),
        (this.shieldPool = new Ue(Uf(), zi(null, { side: fn }), 24)),
        (this.discPool = new Ue(Ff(), new Ie({ toneMapped: !1, vertexColors: !0 }), 60)),
        (this.debris = new Ue(Bf(), new $e({ flatShading: !0 }), 320)),
        (this.scorch = new Ue(
          a.clone(),
          new Ie({ map: this.texShadow, transparent: !0, depthWrite: !1, color: 16777215 }),
          70,
          { color: !1 },
        )));
      let c = new ye(1, 1, 1, 16, 1, !0);
      (c.translate(0, 0.5, 0),
        (this.columns = new Ue(c, zi(Cf(), { side: fn }), 60)),
        (this.scorch.mesh.renderOrder = 0),
        (this.columns.mesh.renderOrder = 4),
        (this.shieldPool.mesh.renderOrder = 5),
        (this.shadows.mesh.renderOrder = 1),
        (this.discs.mesh.renderOrder = 2),
        (this.ringPool.mesh.renderOrder = 3),
        (this.beams.mesh.renderOrder = 5),
        (this.sprites.mesh.renderOrder = 6),
        (this.sparks.mesh.renderOrder = 7),
        (this.enemyPools = {}));
      for (let h in Ae) {
        let l = Ae[h],
          u = Fh(h, l.color),
          d = l.r > 0.9 ? 40 : 120,
          f = new Ue(u.body, Tf({ vertexColors: !0, flatShading: !0 }), d, { flash: !0 }),
          p = new Ue(u.glow, new Ie({ toneMapped: !1, vertexColors: !0 }), d);
        ((this.enemyPools[h] = { body: f, glow: p, color: lt(l.color) }), t.add(f.mesh, p.mesh));
      }
      for (let h of this.allPools()) t.add(h.mesh);
      ((this.pLight = new ss(4846335, 0, 9, 2)),
        (this.bLight = new ss(16747069, 0, 12, 2)),
        t.add(this.pLight, this.bLight),
        (this.flashes = []),
        (this.D = []),
        (this.scorches = []),
        (this.kick = 0),
        (this.kickA = 0));
    }
    allPools() {
      return [
        this.scorch,
        this.shadows,
        this.discs,
        this.ringPool,
        this.columns,
        this.beams,
        this.shieldPool,
        this.pbCore,
        this.ebCore,
        this.discPool,
        this.shardPool,
        this.healPool,
        this.blades,
        this.wing,
        this.debris,
        this.sprites,
        this.sparks,
      ];
    }
    initParticles() {
      let t = this.maxParticles;
      this.P = {
        n: 0,
        x: new Float32Array(t),
        y: new Float32Array(t),
        z: new Float32Array(t),
        vx: new Float32Array(t),
        vy: new Float32Array(t),
        vz: new Float32Array(t),
        life: new Float32Array(t),
        max: new Float32Array(t),
        size: new Float32Array(t),
        grow: new Float32Array(t),
        r: new Float32Array(t),
        g: new Float32Array(t),
        b: new Float32Array(t),
        drag: new Float32Array(t),
        grav: new Float32Array(t),
        spark: new Uint8Array(t),
      };
    }
    setQuality(t, e) {
      ((this.dprCap = t),
        e && e !== this.maxParticles && ((this.maxParticles = e), this.initParticles()),
        this.resize(!0));
    }
    resize(t) {
      let e = this.canvas,
        n = Math.max(1, e.clientWidth || window.innerWidth),
        s = Math.max(1, e.clientHeight || window.innerHeight),
        r = Math.min(window.devicePixelRatio || 1, this.dprCap);
      (!t && n === this.w && s === this.h && r === this.dpr) ||
        ((this.w = n),
        (this.h = s),
        (this.dpr = r),
        this.renderer.setPixelRatio(r),
        this.renderer.setSize(n, s, !1),
        (this.camera.aspect = n / s),
        (this.camera.fov = n / s < 1 ? 50 : 40),
        this.camera.updateProjectionMatrix());
    }
    camDistance() {
      let t = this.w / this.h,
        e = (this.camera.fov * Math.PI) / 360,
        n = Math.atan(Math.tan(e) * t),
        s = t < 1 ? 15.5 : 26,
        r = t < 1 ? 19 : 13;
      return Math.max(s / 2 / Math.tan(n), r / 2 / Math.tan(e)) * this.zoom;
    }
    setBiome(t, e) {
      let n = this.arena.layKey;
      if (
        (this.arena.build(t, e ? { key: e.key, W: e.W, H: e.H, obs: e.obs, deco: e.deco } : null, !!e),
        e && n != null && n !== this.arena.layKey)
      ) {
        let s = lt(t.grid);
        for (let r of e.obs) {
          let a = r.t === "c" ? r.r : Math.max(r.w, r.h);
          (this.burst(r.x, r.y, 0.2, 10, 3 + a, s, 0.7, 0.45, { up: 1.5, drag: 3 }),
            this.ring(r.x, r.y, a * 0.6, a * 1.8, s, 0.5));
        }
        (this.addShake(0.12), (this.mapChanged = !0));
      }
      (this.scene.fog.color.setHex(t.fog),
        this.renderer.setClearColor(t.fog, 1),
        this.hemi.color.setHex(t.sky),
        this.hemi.groundColor.setHex(t.ground),
        (this.biome = t));
    }
    ensurePlayer(t) {
      (this.playerWeapon === t && this.player) ||
        (this.player &&
          (this.scene.remove(this.player.group),
          this.player.group.traverse((e) => {
            e.geometry && e.geometry.dispose();
          })),
        (this.player = kf(t, ue[t].color)),
        (this.playerWeapon = t),
        this.scene.add(this.player.group));
    }
    emit(t, e, n, s, r, a, o, c, h, l = {}) {
      let u = this.P;
      if (
        u.n >= this.maxParticles ||
        (u.n > this.maxParticles * 0.6 && Math.random() < (u.n / this.maxParticles - 0.6) * 2)
      )
        return;
      let d = u.n++;
      ((u.x[d] = t),
        (u.y[d] = e),
        (u.z[d] = n),
        (u.vx[d] = s),
        (u.vy[d] = r),
        (u.vz[d] = a),
        (u.life[d] = o),
        (u.max[d] = o),
        (u.size[d] = c),
        (u.grow[d] = l.grow || 0),
        (u.r[d] = h.r),
        (u.g[d] = h.g),
        (u.b[d] = h.b),
        (u.drag[d] = l.drag ?? 2.5),
        (u.grav[d] = l.grav ?? 0),
        (u.spark[d] = l.spark ? 1 : 0));
    }
    burst(t, e, n, s, r, a, o = 0.5, c = 0.35, h = {}) {
      for (let l = 0; l < s; l++) {
        let u = Math.random() * Me,
          d = r * (0.35 + Math.random() * 0.65),
          f = h.up != null ? h.up : (Math.random() - 0.3) * r * 0.5;
        this.emit(
          t,
          n,
          e,
          Math.cos(u) * d,
          f,
          Math.sin(u) * d,
          o * (0.6 + Math.random() * 0.6),
          c * (0.6 + Math.random() * 0.7),
          a,
          h,
        );
      }
    }
    line(t, e, n, s, r, a, o = 0.12, c = 0.7, h = 0) {
      this.lines.length > 120 ||
        this.lines.push({ x1: t, z1: e, x2: n, z2: s, col: r, life: a, max: a, w: o, y: c, jag: h });
    }
    ring(t, e, n, s, r, a, o = 0.06) {
      this.rings.length > 100 || this.rings.push({ x: t, z: e, r0: n, r1: s, col: r, life: a, max: a, y: o });
    }
    addShake(t) {
      this.shake = Math.min(1, this.shake + t);
    }
    flash(t, e, n, s, r, a = 6) {
      (this.flashes.length > 24 && this.flashes.shift(),
        this.flashes.push({ x: t, z: e, r: n, i: s * this.flashK, col: r, decay: a }));
    }
    updateLights(t, e) {
      let n = this.flashes;
      for (let h of n) h.i -= h.i * Math.min(1, h.decay * t) + t * 0.05;
      n.length && n.some((h) => h.i <= 0.02) && (this.flashes = n.filter((h) => h.i > 0.02));
      let s = this.flashes.slice().sort((h, l) => l.i - h.i),
        r = this.arena.uniforms;
      for (let h = 0; h < 6; h++) {
        let l = s[h];
        l ? (r.uL.value[h].set(l.x, l.z, l.r, Math.min(1.6, l.i)), r.uLC.value[h].copy(l.col)) : (r.uL.value[h].w = 0);
      }
      let a = e && e.player;
      ((this.muzzle = Math.max(0, (this.muzzle || 0) - t * 14)),
        a && this.pLight.position.set(a.x + Math.cos(a.aim) * 0.8, 1.3, a.y + Math.sin(a.aim) * 0.8));
      ((this.hemi.intensity = 1.9), (this.sun.intensity = 1.5), (this.pLight.intensity = this.muzzle * 6));
      let c = s.find((h) => !h.muzzle);
      c
        ? (this.bLight.position.set(c.x, 1.6, c.z),
          this.bLight.color.copy(c.col),
          (this.bLight.intensity = Math.min(1.5, c.i) * 10),
          (this.bLight.distance = c.r * 3))
        : (this.bLight.intensity = 0);
    }
    debrisBurst(t, e, n, s, r, a, o) {
      let c = this.D;
      for (let h = 0; h < s && c.length < 300; h++) {
        let l = Math.random() * Me,
          u = o * (0.4 + Math.random() * 0.8);
        c.push({
          x: t + Math.cos(l) * 0.2,
          y: n,
          z: e + Math.sin(l) * 0.2,
          vx: Math.cos(l) * u,
          vy: 3 + Math.random() * o * 0.9,
          vz: Math.sin(l) * u,
          rx: Math.random() * 6,
          ry: Math.random() * 6,
          rz: Math.random() * 6,
          sx: (Math.random() - 0.5) * 16,
          sy: (Math.random() - 0.5) * 16,
          sz: (Math.random() - 0.5) * 16,
          s: a * (0.5 + Math.random() * 0.7),
          life: 0.9 + Math.random() * 0.7,
          col: r,
        });
      }
    }
    drawDebris(t) {
      let e = this.D,
        n = this.debris,
        s = n.m,
        r = this._e || (this._e = new Mn()),
        a = this._q || (this._q = new mn()),
        o = this._m || (this._m = new de()),
        c = this._p || (this._p = new I()),
        h = this._s || (this._s = new I());
      for (let l of e) {
        if (
          ((l.life -= t),
          (l.vy -= 22 * t),
          (l.x += l.vx * t),
          (l.y += l.vy * t),
          (l.z += l.vz * t),
          l.y < l.s * 0.5 &&
            ((l.y = l.s * 0.5),
            (l.vy *= -0.35),
            (l.vx *= 0.7),
            (l.vz *= 0.7),
            (l.sx *= 0.6),
            (l.sy *= 0.6),
            (l.sz *= 0.6)),
          (l.rx += l.sx * t),
          (l.ry += l.sy * t),
          (l.rz += l.sz * t),
          n.n >= n.max)
        )
          continue;
        let u = n.n++,
          d = l.life < 0.3 ? Math.max(0, l.life / 0.3) : 1;
        (r.set(l.rx, l.ry, l.rz),
          a.setFromEuler(r),
          o.compose(c.set(l.x, l.y, l.z), a, h.setScalar(l.s * d)),
          o.toArray(s, u * 16),
          n.colC(u, l.col, 1));
      }
      e.length && e.some((l) => l.life <= 0) && (this.D = e.filter((l) => l.life > 0));
    }
    addScorch(t, e, n) {
      (this.scorches.length >= 60 && this.scorches.shift(),
        this.scorches.push({ x: t, z: e, r: n, life: 7, a: Math.random() * Me }));
    }
    drawScorch(t) {
      for (let e of this.scorches) {
        e.life -= t;
        let n = e.life < 1.5 ? Math.max(0, e.life / 1.5) : 1;
        this.scorch.y(e.x, 0.015, e.z, e.a, e.r * 2 * n);
      }
      this.scorches.length && this.scorches[0].life <= 0 && (this.scorches = this.scorches.filter((e) => e.life > 0));
    }
    consume(t, e, n) {
      let s = n.numbers !== !1,
        r = n.shake === !1 ? 0 : 1;
      for (let a of t)
        switch (a.k) {
          case "shot": {
            let o = ue[a.w],
              c = lt(o.color),
              h = Math.cos(a.a),
              l = Math.sin(a.a);
            if (
              (o.id !== "flame" &&
                this.emit(a.x, 0.8, a.y, h * 2, 0, l * 2, 0.07, o.id === "scatter" ? 1.3 : 0.9, c, { drag: 0 }),
              (this.muzzle = Math.min(1, (this.muzzle || 0) + (o.id === "flame" ? 0.12 : 0.6))),
              this.pLight.color.copy(c),
              !this.lastMuzzleT || this.time - this.lastMuzzleT > 0.05)
            ) {
              this.lastMuzzleT = this.time;
              let u = {
                x: a.x + h * 0.6,
                z: a.y + l * 0.6,
                r: o.id === "rail" ? 3.2 : 2.2,
                i: (o.id === "flame" ? 0.35 : 0.55) * this.flashK,
                col: c,
                decay: 16,
                muzzle: !0,
              };
              this.flashes.push(u);
            }
            if (
              (o.shake > 0.04 && r && ((this.kick = Math.min(0.6, this.kick + o.shake * 2.2)), (this.kickA = a.a)),
              o.rail)
            ) {
              let u = e.stats.lance ? e.stats.range : e.arena.rayLen(a.x, a.y, a.a, e.stats.range);
              (this.line(a.x, a.y, a.x + h * u, a.y + l * u, c, 0.2, 0.16, 0.8),
                this.line(a.x, a.y, a.x + h * u, a.y + l * u, mi, 0.08, 0.05, 0.8));
            }
            this.addShake(o.shake * 0.3 * r);
            break;
          }
          case "wingShot":
            this.emit(a.x, 0.9, a.y, 0, 0, 0, 0.06, 0.6, lt(4846335), { drag: 0 });
            break;
          case "dmg": {
            if (s) {
              let o = a.id
                ? this.nums.find((c) => c.id === a.id && c.life > 0.45 && !c.burn == !a.burn && !c.shield == !a.shield)
                : null;
              o
                ? ((o.v += a.v), (o.crit = o.crit || a.crit), (o.life = Math.max(o.life, 0.55)))
                : this.nums.length < 60 &&
                  this.nums.push({
                    id: a.id,
                    x: a.x + (Math.random() - 0.5) * 0.4,
                    z: a.y,
                    y: 1.4,
                    v: a.v,
                    crit: a.crit,
                    burn: a.burn,
                    shield: a.shield,
                    life: a.crit ? 0.8 : 0.6,
                  });
            }
            a.burn ||
              this.burst(a.x, a.y, 0.6, a.crit ? 4 : 2, 5, a.crit ? lt(16767050) : lt(ue[e.weapon].color), 0.18, 0.18, {
                spark: !0,
                drag: 6,
              });
            break;
          }
          case "kill": {
            let o = a.boss ? lt(en[a.type].color) : a.elite ? Pn : lt(Ae[a.type].color),
              c = a.boss ? 4 : a.elite ? 1.8 : Math.max(0.8, a.r * 1.4);
            (this.burst(a.x, a.y, 0.6, Math.round(10 * c), 7 * Math.sqrt(c), o, 0.55, 0.45 * Math.sqrt(c)),
              this.burst(a.x, a.y, 0.6, Math.round(6 * c), 10 * Math.sqrt(c), mi, 0.3, 0.22, { spark: !0, drag: 5 }),
              this.ring(a.x, a.y, 0.2, 1.6 * c, o, 0.35),
              this.emit(a.x, 0.8, a.y, 0, 0, 0, 0.12, 2.2 * c, o, { drag: 0 }));
            let h = lt(a.boss ? en[a.type].color : Ae[a.type].color),
              l = this._dk || (this._dk = new Ot());
            (l.copy(h).multiplyScalar(0.55),
              this.debrisBurst(
                a.x,
                a.y,
                0.6,
                Math.round(Math.min(18, 4 + c * 5)),
                l.clone(),
                0.14 + 0.12 * Math.sqrt(c),
                3 + c * 2,
              ),
              (a.r >= 0.5 || a.elite || a.boss) && this.addScorch(a.x, a.y, a.r * 1.3 + 0.3),
              this.flash(a.x, a.y, 2 + c * 1.6, 0.7 + c * 0.2, o, 5),
              this.addShake((a.boss ? 0.9 : a.elite ? 0.18 : 0.04) * r));
            break;
          }
          case "boom": {
            let o =
                a.kind === "nova"
                  ? lt(8386303)
                  : a.kind === "pop"
                    ? lt(16769354)
                    : a.kind === "payload"
                      ? lt(16752957)
                      : a.kind === "rocket"
                        ? lt(16738877)
                        : lt(16734778),
              c = a.r;
            (a.kind !== "nova" &&
              (this.burst(a.x, a.y, 0.5, Math.round(6 + c * 5), c * 5, o, 0.45, 0.5 + c * 0.12),
              this.emit(a.x, 0.6, a.y, 0, 0, 0, 0.15, c * 2.4, o, { drag: 0 })),
              this.ring(a.x, a.y, c * 0.3, c, o, 0.3),
              this.addShake(
                (a.kind === "payload"
                  ? 0.02
                  : a.kind === "rain" || a.kind === "stomp" || a.kind === "mortar"
                    ? 0.25
                    : 0.1) * r,
              ),
              (a.kind !== "payload" || Math.random() < 0.3) &&
                this.flash(a.x, a.y, c * 1.6, a.kind === "payload" ? 0.5 : 1.1, o, 4.5),
              a.kind !== "payload" && a.kind !== "nova" && a.kind !== "pop" && this.addScorch(a.x, a.y, c * 0.7),
              (a.kind === "rocket" || a.kind === "bomber" || a.kind === "mortar" || a.kind === "volatile") &&
                this.debrisBurst(a.x, a.y, 0.3, 5, lt(3811874), 0.12, 5));
            break;
          }
          case "nova":
            (this.ring(a.x, a.y, 0.5, a.r, lt(8386303), 0.45),
              this.ring(a.x, a.y, 0.3, a.r * 0.8, mi, 0.3),
              this.burst(a.x, a.y, 0.7, 40, 16, lt(8386303), 0.5, 0.5),
              (this.flashT = 0.25),
              this.addShake(0.5 * r),
              this.flash(a.x, a.y, a.r * 1.4, 1.6, lt(8386303), 3));
            break;
          case "chain": {
            let o = a.pts;
            for (let c = 0; c + 3 < o.length; c += 2)
              this.line(o[c], o[c + 1], o[c + 2], o[c + 3], lt(13019391), 0.16, 0.09, 0.7, 0.5);
            break;
          }
          case "zap":
            this.burst(a.x, a.y, 0.6, 6, 6, lt(8386303), 0.25, 0.3, { spark: !0 });
            break;
          case "freeze":
            this.burst(a.x, a.y, 0.8, 4, 3, lt(12580095), 0.4, 0.3);
            break;
          case "spark":
            this.burst(a.x, a.y, 0.7, 3, 4, lt(ue[a.w] ? ue[a.w].color : 16777215), 0.2, 0.2, { spark: !0 });
            break;
          case "pop":
            this.burst(a.x, a.y, 0.7, 3, 3, lt(16740250), 0.2, 0.25);
            break;
          case "bounce":
            this.burst(a.x, a.y, 0.7, 3, 5, mi, 0.2, 0.2, { spark: !0 });
            break;
          case "ping":
            this.burst(a.x, a.y, 1.2, 2, 4, lt(10466520), 0.2, 0.25, { spark: !0 });
            break;
          case "dash":
            this.ring(e.player.x, e.player.y, 0.3, 1.4, lt(8386303), 0.25);
            break;
          case "edash":
            {
              let o = lt(Ae[a.type] ? Ae[a.type].color : 16777215);
              (this.ring(a.x, a.y, 0.2, 1.3, o, 0.25), this.burst(a.x, a.y, 0.5, 8, 6, o, 0.3, 0.25, { spark: !0 }));
            }
            break;
          case "supplyDrop":
            this.ring(a.x, a.y, 0.3, 1.8, Pn, 0.35);
            break;
          case "hurt":
            (this.addShake(0.35 * r), this.burst(a.x, a.y, 0.7, 10, 6, qf, 0.35, 0.3));
            break;
          case "shieldBreak":
            (this.ring(a.x, a.y, 0.5, 2.2, lt(8386303), 0.35),
              this.burst(a.x, a.y, 0.7, 14, 7, lt(8386303), 0.35, 0.28, { spark: !0 }),
              this.addShake(0.15 * r));
            break;
          case "heal":
            this.burst(a.x, a.y, 0.5, 8, 2.5, ha, 0.6, 0.3, { up: 3 });
            break;
          case "revive":
            (this.ring(a.x, a.y, 0.5, 6, ha, 0.6), this.burst(a.x, a.y, 0.7, 40, 9, ha, 0.7, 0.45));
            break;
          case "die":
            (this.burst(a.x, a.y, 0.7, 60, 12, lt(8386303), 0.9, 0.5),
              this.ring(a.x, a.y, 0.5, 5, qf, 0.5),
              this.addShake(0.8 * r));
            break;
          case "spawn": {
            let o = a.elite ? Pn : lt(Ae[a.type] ? Ae[a.type].color : 16777215);
            (this.ring(a.x, a.y, 0.2, 1.4, o, 0.3), this.burst(a.x, a.y, 0.3, 8, 4, o, 0.4, 0.3, { up: 5 }));
            break;
          }
          case "thud":
            (this.addShake((a.big ? 0.4 : 0.15) * r), this.ring(a.x, a.y, 0.5, a.big ? 3.5 : 1.8, lt(16756896), 0.3));
            break;
          case "hatch":
            this.burst(a.x, a.y, 1.2, a.big ? 16 : 6, 4, lt(13041469), 0.4, 0.3);
            break;
          case "blink":
            if (a.small) {
              let o = lt(a.phase ? 16732120 : Ae.striker.color);
              (this.burst(a.x, a.y, 0.8, 12, 6, o, 0.35, 0.3), this.ring(a.x, a.y, 0.3, 1.6, o, 0.25));
            } else
              (this.burst(a.x, a.y, 2.2, 24, 8, lt(9431295), 0.45, 0.4),
                this.ring(a.x, a.y, 0.4, 3, lt(9431295), 0.35));
            break;
          case "block":
            this.burst(a.x, a.y, 0.9, 3, 5, lt(10475775), 0.2, 0.25, { spark: !0, drag: 6 });
            break;
          case "guardBreak":
            (this.burst(a.x, a.y, 0.9, 22, 8, lt(5941503), 0.45, 0.35, { spark: !0 }),
              this.ring(a.x, a.y, 0.3, 2.4, lt(10475775), 0.35),
              this.addShake(0.08 * r));
            break;
          case "guardUp":
            this.ring(a.x, a.y, 2, 0.6, lt(5941503), 0.35);
            break;
          case "shieldPop":
            (this.burst(a.x, a.y, 0.8, 16, 6, lt(ba.shielded.color), 0.4, 0.3, { spark: !0 }),
              this.ring(a.x, a.y, 0.3, a.r * 2.6, lt(ba.shielded.color), 0.3));
            break;
          case "lob":
            (this.burst(a.x, a.y, 1.4, 8, 3, lt(12099712), 0.5, 0.45, { up: 4, drag: 3 }),
              this.flash(a.x, a.y, 2, 0.6, lt(16752957), 8));
            break;
          case "phase":
          case "enrage":
            (this.ring(a.x, a.y, 1, 7, lt(16732120), 0.5), this.addShake(0.4 * r));
            break;
          case "bossDown":
            ((this.flashT = 0.35), this.addShake(1 * r), this.ring(a.x, a.y, 1, 16, mi, 0.8));
            break;
          case "wave":
            this.pulse = 1;
            break;
          case "mend":
            a.tx == null
              ? (this.ring(a.x, a.y, 0.5, a.r || 6, lt(7208904), 0.5),
                this.burst(a.x, a.y, 1, 14, 3, lt(7208904), 0.5, 0.3, { up: 3 }))
              : (this.line(a.x, a.y, a.tx, a.ty, lt(7208904), 0.35, 0.12, 0.9, 0.3),
                this.burst(a.tx, a.ty, 0.8, 10, 2, lt(7208904), 0.5, 0.3, { up: 3 }));
            break;
          case "chill":
            this.burst(a.x, a.y, 0.6, 12, 3, lt(11462911), 0.5, 0.3, { spark: !0 });
            break;
          case "champion":
            (this.ring(a.x, a.y, 0.5, 5, Pn, 0.6),
              this.burst(a.x, a.y, 0.5, 30, 7, Pn, 0.6, 0.45, { up: 4 }),
              this.addShake(0.25 * r));
            break;
          case "championDown":
            (this.ring(a.x, a.y, 1, 9, Pn, 0.6), this.flash(a.x, a.y, 6, 1.4, Pn, 3));
            break;
          case "erupt": {
            let o = lt(16738858);
            (this.burst(a.x, a.y, 0.3, 26, 5, o, 0.8, 0.6, { up: 7, grav: 9, drag: 1.5 }),
              this.burst(a.x, a.y, 0.3, 10, 3, lt(16765562), 0.5, 0.4, { up: 9, spark: !0 }),
              this.ring(a.x, a.y, a.r * 0.4, a.r * 1.4, o, 0.4),
              this.flash(a.x, a.y, a.r * 3, 1.3, o, 3),
              this.addShake(0.12 * r));
            break;
          }
          case "warp": {
            let o = lt(16732120),
              c = a.who === "player" ? 18 : 5;
            (this.burst(a.x, a.y, 0.6, c, 4, o, 0.4, 0.35, { spark: !0 }),
              this.burst(a.tx, a.ty, 0.6, c, 4, lt(8386303), 0.4, 0.35, { spark: !0 }),
              a.who === "player" && (this.ring(a.tx, a.ty, 0.3, 2, lt(8386303), 0.35), (this.camInit = !1)));
            break;
          }
        }
    }
    updateCamera(t, e, n) {
      let s = this.camera,
        r = this.w < this.h ? 1.08 : 0.98,
        a = this.camDistance();
      if (n) {
        this.menuA += t * 0.12;
        let h = 22 * this.zoom,
          l = 15 * this.zoom;
        (s.position.set(Math.sin(this.menuA) * h, l, Math.cos(this.menuA) * h), s.lookAt(0, 0.5, 0));
      } else {
        let h = e.player,
          l = e.arena,
          u = h.x,
          d = h.y;
        (h.firing && ((u += Math.cos(h.aim) * 1.2), (d += Math.sin(h.aim) * 1.2)),
          (u += h.vx * 0.12),
          (d += h.vy * 0.12),
          (u = Lt(u, -l.W + 3, l.W - 3)),
          (d = Lt(d, -l.H + 3, l.H - 3)),
          this.camInit || ((this.camX = u), (this.camZ = d), (this.camInit = !0)));
        let f = vn(5, t);
        if (this.focus) {
          let g = Lt(this.focusK || 0, 0, 1),
            M = g < 0.3 ? $f(g / 0.3) : g > 0.75 ? $f((1 - g) / 0.25) : 1;
          ((u += (Lt(this.focus.x, -l.W + 3, l.W - 3) - u) * M),
            (d += (Lt(this.focus.z, -l.H + 3, l.H - 3) - d) * M),
            (f = vn(12, t)));
        }
        ((this.camX += (u - this.camX) * f), (this.camZ += (d - this.camZ) * f));
        let p = this.shake * this.shake * 0.55,
          x = (Math.random() - 0.5) * p - Math.cos(this.kickA) * this.kick * 0.35,
          m = (Math.random() - 0.5) * p - Math.sin(this.kickA) * this.kick * 0.35;
        (s.position.set(this.camX + x, Math.sin(r) * a, this.camZ + Math.cos(r) * a + m),
          s.lookAt(this.camX + x, 0, this.camZ + m - 1));
      }
      ((this.shake = Math.max(0, this.shake - t * 2.2)),
        (this.kick = Math.max(0, this.kick - t * (4 + this.kick * 10))),
        s.updateMatrixWorld());
      let o = s.matrixWorld.elements,
        c = this.B;
      ((c.rx = o[0]),
        (c.ry = o[1]),
        (c.rz = o[2]),
        (c.ux = o[4]),
        (c.uy = o[5]),
        (c.uz = o[6]),
        (c.fx = o[8]),
        (c.fy = o[9]),
        (c.fz = o[10]));
    }
    frame(t, e, n = {}) {
      ((this.time += t), this.resize());
      let s = !e || n.menu;
      if (s) {
        let c = n.biome || ii[0];
        (this.setBiome(c), this.ensurePlayer(n.weapon || "pulse"));
      } else (this.setBiome(e.arena.biome, e.arena), this.ensurePlayer(e.weapon));
      (this.updateCamera(t, e, s), (this.pulse = Math.max(0, (this.pulse || 0) - t * 1.5)));
      let r = s ? 0 : e.player.x,
        a = s ? 0 : e.player.y;
      this.arena.update(t, r, a, this.pulse);
      let o = this.allPools();
      for (let c of o) c.begin();
      for (let c in this.enemyPools) (this.enemyPools[c].body.begin(), this.enemyPools[c].glow.begin());
      (s ? this.drawMenuPlayer(t) : this.drawWorld(t, e),
        this.updateLights(t, s ? null : e),
        this.drawDebris(t),
        this.drawScorch(t),
        this.drawParticles(t),
        this.drawTransient(t));
      for (let c of o) c.end();
      for (let c in this.enemyPools) (this.enemyPools[c].body.end(), this.enemyPools[c].glow.end());
      for (let c of this.nums) ((c.life -= t), (c.y += t * 1.6));
      (this.nums.length && this.nums[0].life <= 0 && (this.nums = this.nums.filter((c) => c.life > 0)),
        (this.flashT = Math.max(0, this.flashT - t)),
        this.renderer.render(this.scene, this.camera));
    }
    drawMenuPlayer(t) {
      let e = this.player;
      ((e.group.visible = !0),
        e.group.position.set(0, 0.25 + Math.sin(this.time * 2) * 0.08, 0),
        (e.base.rotation.y = this.time * 0.3),
        (e.turret.rotation.y = Math.sin(this.time * 0.7) * 1.2),
        (e.shield.visible = !1));
      for (let r of e.mats) r.emissive.setScalar(0);
      let n = this.shadows.y(0, 0.02, 0, 0, 2.2),
        s = this.sprites.bb(0, 0.15, 0, 2.2, this.B);
      if ((this.sprites.colC(s, lt(ue[this.playerWeapon].color), 0.35), Math.random() < t * 30)) {
        let r = Math.random() * Me,
          a = 3 + Math.random() * 14;
        this.emit(Math.cos(r) * a, 0.1, Math.sin(r) * a, 0, 0.6 + Math.random(), 0, 2.5, 0.25, lt(this.biome.grid), {
          drag: 0,
        });
      }
      this.bossView && (this.bossView.group.visible = !1);
    }
    drawWorld(t, e) {
      let n = this.B,
        s = this.time,
        r = e.player,
        a = this.player;
      if (((a.group.visible = r.alive), r.alive)) {
        let l = Math.sin(s * 5) * 0.05;
        (a.group.position.set(r.x, 0.22 + l, r.y),
          (a.base.rotation.y = -r.face),
          (a.turret.rotation.y = -r.aim),
          (a.shield.visible = r.shield),
          (a.shield.material.opacity = 0.12 + Math.sin(s * 6) * 0.04));
        let u = r.iT > 0 && r.hurtT <= 0 && e.state === "fight" && Math.floor(s * 20) % 2 ? 0.35 : 0,
          d = r.hurtT > 0 ? r.hurtT / 0.3 : 0;
        for (let x of a.mats) x.emissive.setRGB(d * 0.9 + u, u * 0.8, u);
        if ((this.shadows.y(r.x, 0.02, r.y, 0, 1.9), r.manual)) {
          let x = e.arena.rayLen(r.x, r.y, r.aim, Math.min(e.stats.range, 16)),
            m = Math.cos(r.aim),
            g = Math.sin(r.aim),
            M = this.beams.seg(r.x + m * 0.9, r.y + g * 0.9, r.x + m * x, r.y + g * x, 0.08, 0.07, 0.02);
          this.beams.colC(M, lt(ue[e.weapon].color), 0.22);
        }
        let f = this.sprites.bb(r.x, 0.2, r.y, 2, n);
        if ((this.sprites.colC(f, lt(ue[e.weapon].color), 0.3), r.dashT > 0))
          for (let x = 0; x < 3; x++)
            this.emit(
              r.x + (Math.random() - 0.5) * 0.4,
              0.6,
              r.y + (Math.random() - 0.5) * 0.4,
              -r.vx * 0.1,
              0,
              -r.vy * 0.1,
              0.25,
              0.7,
              lt(8386303),
              { drag: 4 },
            );
        else if (r.moving && Math.random() < t * 30) {
          let x = r.x - Math.cos(r.face) * 0.55,
            m = r.y - Math.sin(r.face) * 0.55;
          this.emit(x, 0.45, m, -Math.cos(r.face) * 2, 0.2, -Math.sin(r.face) * 2, 0.25, 0.35, lt(ue[e.weapon].color), {
            drag: 3,
          });
        }
        let p = e.stats.orbit;
        for (let x = 0; x < p; x++) {
          let m = e.time * 3.3 + (x * Me) / p,
            g = r.x + Math.cos(m) * e.stats.orbitR,
            M = r.y + Math.sin(m) * e.stats.orbitR,
            b = this.blades.y(g, 0, M, m + Math.PI / 2, 1.2 * e.stats.bladeScale);
          this.blades.colHex(b, 10483967);
          let v = this.sprites.bb(g, 0.62, M, 1.1, n);
          this.sprites.colHex(v, 4846335, 0.55);
        }
        for (let x of r.wings) {
          this.wing.y(x.x, Math.sin(s * 4 + x.x) * 0.1, x.y, r.aim, 1.3);
          let m = this.sprites.bb(x.x, 0.9, x.y, 1, n);
          (this.sprites.colHex(m, 4846335, 0.5), this.shadows.y(x.x, 0.02, x.y, 0, 0.9));
        }
      }
      let o = null;
      for (let l of e.enemies) {
        if (l.boss) {
          o = l;
          continue;
        }
        let u = this.enemyPools[l.type];
        if (!u) continue;
        let d = l.spawnT > 0 ? 1 - l.spawnT / 0.35 : 1,
          f = (l.r / Ae[l.type].r) * Zf(Lt(d, 0, 1)),
          p = f,
          x = 0;
        if (l.type === "bomber" && l.st === 1) {
          let S = 1 + Math.sin(s * 40) * 0.08;
          ((f *= S), (p *= S));
        }
        if (
          ((l.type === "swarmer" || l.type === "mite") && (x = Math.sin(s * 9 + l.phase) * 0.06),
          l.type === "hive" && (p *= 1 + Math.sin(s * 3 + l.phase) * 0.05),
          l.type === "brute" && l.st === 1 && (p *= 0.9),
          l.type === "mortar" && l.st === 1 && (p *= 0.88),
          l.type === "striker" && l.st === 1)
        ) {
          let S = Math.floor(s * 30) % 2 ? 0.9 : 1.05;
          f *= S;
        }
        l.flash > 0 && ((f *= 1 + l.flash * 0.1), (p *= 1 - l.flash * 0.06));
        let m = u.body.y(l.x, x, l.y, l.face, f, p, f);
        u.body.flash(m, l.flash > 0 ? l.flash : l.slowT > 0 ? 0.25 : 0);
        let g = l.variant ? Kv[l.variant] : null;
        l.slowT > 0
          ? u.body.col(m, 0.7, 0.9, 1.3)
          : l.corrode
            ? u.body.col(m, 0.9, 1.3, 0.6)
            : g
              ? u.body.col(m, 0.55 + g.r * 0.7, 0.55 + g.g * 0.7, 0.55 + g.b * 0.7)
              : l.elite
                ? u.body.col(m, 1.25, 1.05, 0.7)
                : u.body.col(m, 1, 1, 1);
        let M = u.glow.y(l.x, x, l.y, l.face, f, p, f),
          b = 1;
        if (
          ((l.type === "gunner" || l.type === "sniper") && l.st === 1 && (b = 1.6 + Math.sin(s * 30) * 0.4),
          l.type === "bomber" && l.st === 1 && (b = 2),
          u.glow.colC(M, g || (l.elite ? Pn : u.color), b),
          l.champion)
        ) {
          let S = this.ringPool.y(l.x, 0.06, l.y, s * 1.5, 7);
          this.ringPool.colC(S, Pn, 0.18 + Math.sin(s * 4) * 0.06);
          let T = this.ringPool.y(l.x, 1.6 + l.r, l.y, -s * 3, l.r * 0.8);
          this.ringPool.colC(T, Pn, 1);
        }
        (l.rallyT > 0 &&
          !l.champion &&
          Math.random() < t * 6 &&
          this.emit(l.x, 0.3, l.y, 0, 1.5, 0, 0.35, 0.3, Pn, { drag: 1 }),
          g &&
            Math.random() < t * 5 &&
            this.emit(
              l.x + (Math.random() - 0.5) * l.r,
              0.5,
              l.y + (Math.random() - 0.5) * l.r,
              0,
              1,
              0,
              0.4,
              0.25,
              g,
              { drag: 1 },
            ),
          this.shadows.y(l.x, 0.02, l.y, 0, l.r * 2.8 * f));
        let v = this.sprites.bb(l.x, 0.35, l.y, l.r * (l.elite ? 4.4 : 3.4) * f, n);
        if (
          (this.sprites.colC(v, l.elite ? Pn : u.color, l.elite ? 0.3 : 0.2),
          l.burnT > 0 &&
            Math.random() < t * 14 &&
            this.emit(
              l.x + (Math.random() - 0.5) * l.r,
              0.6,
              l.y + (Math.random() - 0.5) * l.r,
              0,
              1.8,
              0,
              0.35,
              0.35,
              lt(16742958),
              { drag: 1 },
            ),
          l.type === "sniper" && l.st === 1 && this.aimLine(e, l.x, l.y, l.ta, l.t2 < 0.35, 1 - l.t2 / 1.25),
          l.type === "brute" && l.st === 1 && this.chargeLine(l.x, l.y, l.ta, 9.5, 1.7, 1 - l.t2 / 0.8),
          l.type === "leaper" && l.st === 1 && this.chargeLine(l.x, l.y, l.ta, 7.5, 1.35, 1 - l.t2 / 0.55),
          l.type === "bomber" && l.st === 1)
        ) {
          let S = 1 - l.t2 / 0.55,
            T = this.ringPool.y(l.x, 0.05, l.y, 0, 2.6);
          this.ringPool.colC(T, In, 0.6 + Math.sin(s * 40) * 0.3);
          let R = this.discs.y(l.x, 0.04, l.y, 0, 2.6 * S);
          this.discs.colC(R, In, 0.25);
        }
        if (l.type === "gunner" && l.st === 1) {
          let S = l.x + Math.cos(l.face) * 0.95,
            T = l.y + Math.sin(l.face) * 0.95,
            R = this.sprites.bb(S, 0.62, T, 0.5 + (1 - l.t2 / 0.45) * 0.9, n);
          this.sprites.colC(R, u.color, 1);
        }
        l.type === "turret" && l.st === 1 && this.aimLine(e, l.x, l.y, l.ta, l.t2 < 0.22, 1 - l.t2 / 0.62);
        if (l.type === "bulwark") {
          let S = l.guardDown <= 0,
            T = S ? 0.35 + 0.35 * Lt(l.guard / l.guardMax, 0, 1) + (l.guardFlash > 0 ? l.guardFlash * 0.6 : 0) : 0;
          if (S) {
            let R = this.shieldPool.y(l.x, 0, l.y, l.face, ((l.r + 0.5) / 1.35) * f, f, ((l.r + 0.5) / 1.35) * f);
            this.shieldPool.colC(R, u.color, T);
          } else
            Math.random() < t * 20 &&
              this.emit(l.x, 1.2, l.y, (Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 3, 0.3, 0.25, u.color, {
                spark: !0,
              });
        }
        if (l.type === "striker" && l.st === 1) {
          let S = 1 - l.t2 / 0.7,
            T = this.ringPool.y(l.tx, 0.05, l.ty, s * 4, 1.4 - S * 0.6);
          this.ringPool.colC(T, u.color, 0.6 + S * 0.6);
          let R = this.discs.y(l.tx, 0.04, l.ty, 0, 0.9 * S);
          this.discs.colC(R, u.color, 0.25);
        }
        if ((l.type === "striker" && l.st === 2 && this.chargeLine(l.x, l.y, l.ta, 4.2, 1, 1 - l.t2 / 0.32), l.affix)) {
          let S = lt(ba[l.affix].color);
          if (l.affix === "shielded" && l.shield > 0) {
            let T = this.ringPool.y(l.x, 0.9, l.y, s, l.r * 1.7 * f);
            this.ringPool.colC(T, S, 0.35 + 0.4 * (l.shield / l.shieldMax));
            let R = this.sprites.bb(l.x, 0.8, l.y, l.r * 4.2 * f, n);
            this.sprites.colC(R, S, 0.18);
          } else if (l.affix === "hasted" && Math.random() < t * 25)
            this.emit(l.x, 0.5, l.y, -l.vx * 0.2, 0.2, -l.vy * 0.2, 0.3, l.r * 1.4, S, { drag: 2 });
          else if (l.affix === "volatile") {
            let T = this.ringPool.y(l.x, 0.06, l.y, 0, l.r * 1.9);
            this.ringPool.colC(T, S, 0.35 + Math.sin(s * 9 + l.phase) * 0.25);
          }
        }
      }
      this.drawBoss(t, e, o);
      let c = lt(16765562),
        h = lt(16734746);
      for (let l of e.pb) {
        let u = ue[l.w],
          d = lt(u.color),
          f = Math.atan2(l.vy, l.vx);
        if (l.drag) {
          let M = Lt(l.age / 0.5, 0, 1),
            b = 1 - M * 0.55,
            v = this.sprites.bb(l.x, 0.7 + M * 0.4, l.y, l.r * 4.6, n, l.id);
          if (
            (this.sprites.col(
              v,
              (c.r + (h.r - c.r) * M) * b,
              (c.g + (h.g - c.g) * M) * b * 0.8,
              (c.b + (h.b - c.b) * M) * b * 0.6,
            ),
            M < 0.6)
          ) {
            let S = this.sprites.bb(l.x, 0.72, l.y, l.r * 2.2, n);
            this.sprites.col(S, 1, 0.92, 0.6 * (1 - M));
          }
          M > 0.6 &&
            Math.random() < 0.08 &&
            this.emit(l.x, 1.1, l.y, l.vx * 0.2, 1.4, l.vy * 0.2, 0.5, l.r * 2.2, lt(3811876), { drag: 2, grow: 1 });
          continue;
        }
        if (l.boom) {
          l.spin = (l.spin || 0) + t * 22;
          let M = this.discPool.y(l.x, 0.7, l.y, l.spin, l.r, 1, l.r);
          this.discPool.colC(M, d, 1);
          let b = this.sprites.bb(l.x, 0.7, l.y, l.r * 5, n);
          this.sprites.colC(b, d, 0.55);
          continue;
        }
        let p = l.r * (u.rail ? 9 : u.id === "rocket" ? 2.4 : 3.2),
          x = l.r * 0.9;
        (l.heavy && Math.random() < 0.5 && this.emit(l.x, 0.75, l.y, 0, 0, 0, 0.18, l.r * 3, d, { drag: 0 }),
          l.wing && ((p = 0.5), (x = 0.1)));
        let m = this.pbCore.y(l.x, 0.75, l.y, f, p, x, x);
        this.pbCore.col(m, 0.55 + d.r * 0.6, 0.55 + d.g * 0.6, 0.55 + d.b * 0.6);
        let g = this.sprites.bb(l.x, 0.75, l.y, l.r * (u.rail ? 7 : 6.5), n);
        (this.sprites.colC(g, d, 0.75),
          u.id === "rocket" &&
            Math.random() < (l.bomblet ? 0.3 : 0.6) &&
            this.emit(
              l.x - l.vx * 0.02,
              0.75,
              l.y - l.vy * 0.02,
              -l.vx * 0.05 + (Math.random() - 0.5),
              0.3,
              -l.vy * 0.05 + (Math.random() - 0.5),
              0.35,
              l.bomblet ? 0.25 : 0.4,
              lt(16752736),
              { drag: 3, grow: 1.5 },
            ),
          u.id === "tesla" &&
            Math.random() < 0.3 &&
            this.emit(l.x, 0.75, l.y, (Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3, 0.12, 0.3, d, {
              spark: !0,
            }));
      }
      for (let l of e.trails) {
        let u = this.sprites.bb(l.x, 0.3, l.y, 1.3 * Math.min(1, l.life), n);
        this.sprites.colHex(u, 8386303, 0.35 * Math.min(1, l.life));
      }
      for (let l of e.eb) {
        let u = Xf[l.kind] || Xf.orb;
        if (l.kind === "fast") {
          let f = Math.atan2(l.vy, l.vx),
            p = this.ebCore.y(l.x, 0.75, l.y, f, l.r * 5, l.r * 0.8, l.r * 0.8);
          this.ebCore.col(p, 1, 0.75, 0.75);
        } else {
          let f = 1 + Math.sin(s * 14 + l.x) * 0.08,
            p = this.ebCore.y(l.x, 0.75, l.y, 0, l.r * 0.85 * f);
          this.ebCore.col(p, 1, 0.82 + u.g * 0.2, 0.9 + u.b * 0.1);
        }
        let d = this.sprites.bb(l.x, 0.75, l.y, l.r * 7.5, n);
        this.sprites.colC(d, u, 0.95);
      }
      for (let l of e.pickups) {
        let u = 0.45 + Math.sin(s * 4 + l.id) * 0.12;
        if (
          (l.rain &&
            l.t < 0.6 &&
            ((u += (0.6 - l.t) * 16),
            Math.random() < 0.5 && this.emit(l.x, u + 0.4, l.y, 0, 2, 0, 0.25, 0.3, Fl[1], { drag: 1 })),
          l.rain && l.t >= 0.6 && !l.landed && ((l.landed = !0), this.ring(l.x, l.y, 0.2, 1.1, Fl[1], 0.3)),
          l.kind === "shard")
        ) {
          let d = Fl[l.v] || Fl[1],
            f = l.v >= 25 ? 1.8 : l.v >= 5 ? 1.35 : 1,
            p = this.shardPool.y(l.x, u, l.y, s * 3 + l.id, f);
          this.shardPool.colC(p, d, 1);
          let x = this.sprites.bb(l.x, u, l.y, 0.9 * f, n);
          this.sprites.colC(x, d, 0.45);
        } else {
          if (l.t > 11 && !l.pull && Math.floor(s * (l.t > 13 ? 12 : 6)) % 2) continue;
          let d = this.healPool.y(l.x, u + 0.2, l.y, s * 2, 1);
          this.healPool.colC(d, ha, 1);
          let f = this.sprites.bb(l.x, u + 0.2, l.y, 1.6, n);
          this.sprites.colC(f, ha, 0.5 + Math.sin(s * 6) * 0.15);
        }
      }
      this.drawFeatures(t, e);
      for (let l of e.markers) {
        let u = Lt(l.t / l.dur, 0, 1),
          d = l.fake ? lt(9431295) : l.elite ? Pn : lt(Ae[l.type] ? Ae[l.type].color : 16777215),
          f = l.fake ? 2.2 : 1.2 - u * 0.5,
          p = this.ringPool.y(l.x, 0.05, l.y, s * 2, f);
        this.ringPool.colC(p, d, 0.5 + u * 0.6);
        let x = this.discs.y(l.x, 0.04, l.y, 0, f * 0.9);
        if ((this.discs.colC(x, d, 0.12 + u * 0.2), !l.fake)) {
          let m = this.columns.y(l.x, 0, l.y, 0, 0.55 + u * 0.25, 2 + u * 5, 0.55 + u * 0.25);
          this.columns.colC(m, d, 0.25 + u * 0.45);
        }
        Math.random() < t * 20 &&
          this.emit(
            l.x + (Math.random() - 0.5) * f,
            0.1,
            l.y + (Math.random() - 0.5) * f,
            0,
            3 + Math.random() * 3,
            0,
            0.4,
            0.3,
            d,
            { drag: 0 },
          );
      }
      for (let l of e.hazards) {
        let u = Lt(l.t / l.delay, 0, 1);
        if (!l.done && l.sx != null) {
          let d = l.sx + (l.x - l.sx) * u,
            f = l.sy + (l.y - l.sy) * u,
            p = 0.8 + Math.sin(Math.PI * u) * 7,
            x = this.ebCore.y(d, p, f, 0, 0.26);
          this.ebCore.col(x, 1, 0.85, 0.6);
          let m = this.sprites.bb(d, p, f, 1.6, n);
          (this.sprites.colHex(m, 16752957, 0.9),
            Math.random() < 0.5 && this.emit(d, p, f, 0, 0, 0, 0.3, 0.35, lt(6965808), { drag: 1, grow: 1.2 }));
        }
        if (!l.done) {
          let d = this.ringPool.y(l.x, 0.05, l.y, 0, l.r);
          this.ringPool.colC(d, In, 0.55 + Math.sin(s * 25) * 0.25 * u);
          let f = this.discs.y(l.x, 0.04, l.y, 0, l.r * u);
          if ((this.discs.colC(f, In, 0.18 + u * 0.12), this.contrast)) {
            let p = this.ringPool.y(l.x, 0.05, l.y, 0, l.r * 0.55);
            this.ringPool.colC(p, In, 0.7);
          }
        }
      }
      for (let l of e.beams) {
        let u = l.cur || l.len,
          d = l.x + Math.cos(l.a) * u,
          f = l.y + Math.sin(l.a) * u;
        if (l.live) {
          let p = 0.85 + Math.random() * 0.3,
            x = this.beams.seg(l.x, l.y, d, f, 1, l.w * p, l.w * 0.6);
          this.beams.colC(x, Yf, 0.8);
          let m = this.beams.seg(l.x, l.y, d, f, 1, l.w * 0.35, l.w * 0.3);
          if ((this.beams.colC(m, mi, 1), Math.random() < 0.5)) {
            let g = Math.random() * u;
            this.emit(
              l.x + Math.cos(l.a) * g,
              1,
              l.y + Math.sin(l.a) * g,
              (Math.random() - 0.5) * 4,
              2,
              (Math.random() - 0.5) * 4,
              0.3,
              0.4,
              lt(16732064),
            );
          }
        } else {
          let p = Lt(l.t / l.warn, 0, 1),
            x = this.beams.seg(l.x, l.y, d, f, 0.3, 0.06 + p * 0.08, 0.04);
          this.beams.colC(x, In, 0.5 + (Math.floor(s * 16) % 2) * 0.4);
          let m = this.beams.seg(l.x, l.y, d, f, 0.08, l.w * p, 0.02);
          this.beams.colC(m, In, 0.18);
        }
      }
    }
    drawFeatures(t, e) {
      let n = e.arena,
        s = this.time,
        r = this.B,
        a = lt(16734746),
        o = lt(16756816);
      for (let u of n.vents) {
        let d = e.state === "fight" ? n.ventState(u, e.waveT) : "idle",
          f = (e.waveT + u.phase) % u.period,
          p = u.period - 2.7,
          x = this.discs.y(u.x, 0.03, u.y, 0, u.r),
          m = this.ringPool.y(u.x, 0.05, u.y, 0, u.r);
        if (d === "idle")
          (this.discs.colC(x, a, 0.1 + Math.sin(s * 2 + u.phase) * 0.03), this.ringPool.colC(m, a, 0.35));
        else if (d === "warn") {
          let g = Lt((f - p) / 1.2, 0, 1);
          (this.discs.colC(x, o, 0.2 + g * 0.35 + Math.sin(s * 30) * 0.08 * g),
            this.ringPool.colC(m, this.contrast ? In : o, 0.6 + g * 0.5),
            Math.random() < t * 18 &&
              this.emit(
                u.x + (Math.random() - 0.5) * u.r,
                0.1,
                u.y + (Math.random() - 0.5) * u.r,
                0,
                1.5 + g * 2,
                0,
                0.4,
                0.25,
                o,
                { drag: 1 },
              ));
        } else {
          (this.discs.colC(x, o, 0.75), this.ringPool.colC(m, mi, 0.8));
          let g = this.columns.y(u.x, 0, u.y, 0, u.r * 0.8, 3.2, u.r * 0.8);
          (this.columns.colC(g, a, 0.9),
            Math.random() < t * 40 &&
              this.emit(
                u.x + (Math.random() - 0.5) * u.r * 1.4,
                0.3,
                u.y + (Math.random() - 0.5) * u.r * 1.4,
                (Math.random() - 0.5) * 2,
                4 + Math.random() * 4,
                (Math.random() - 0.5) * 2,
                0.6,
                0.5,
                a,
                { drag: 1.5, grav: 6, grow: 0.6 },
              ));
        }
      }
      let c = lt(12580095);
      for (let u of n.ice) {
        let d = this.discs.y(u.x, 0.02, u.y, 0, u.r);
        this.discs.colC(d, c, 0.09);
        let f = this.ringPool.y(u.x, 0.03, u.y, 0, u.r);
        if ((this.ringPool.colC(f, c, 0.22), Math.random() < t * 3 * u.r)) {
          let p = Math.random() * Me,
            x = Math.random() * u.r;
          this.emit(u.x + Math.cos(p) * x, 0.08, u.y + Math.sin(p) * x, 0, 0.3, 0, 0.5, 0.18, mi, {
            spark: !0,
            drag: 0,
          });
        }
      }
      let h = lt(11861821);
      for (let u of n.acid) {
        let d = u.life != null ? Math.min(1, u.life / 1.2) : 1,
          f = this.discs.y(u.x, 0.025, u.y, 0, u.r);
        this.discs.colC(f, h, (0.16 + Math.sin(s * 2 + u.x) * 0.03) * d);
        let p = this.ringPool.y(u.x, 0.03, u.y, 0, u.r);
        if ((this.ringPool.colC(p, h, 0.35 * d), Math.random() < t * 2.5 * u.r)) {
          let x = Math.random() * Me,
            m = Math.random() * u.r;
          this.emit(u.x + Math.cos(x) * m, 0.1, u.y + Math.sin(x) * m, 0, 0.8, 0, 0.7, 0.25, h, {
            drag: 1,
            grow: 0.8,
          });
        }
      }
      for (let u of n.portals)
        for (let [d, f, p] of [
          [u.ax, u.ay, lt(16732120)],
          [u.bx, u.by, lt(8386303)],
        ]) {
          let x = this.ringPool.y(d, 0.06, f, s * 2.4, 1.05);
          this.ringPool.colC(x, p, 0.9);
          let m = this.ringPool.y(d, 0.07, f, -s * 3.1, 0.7);
          this.ringPool.colC(m, p, 0.6);
          let g = this.discs.y(d, 0.03, f, 0, 0.95);
          this.discs.colC(g, p, 0.2 + Math.sin(s * 5) * 0.05);
          let M = this.columns.y(d, 0, f, 0, 0.75, 1.6, 0.75);
          this.columns.colC(M, p, 0.35);
          let b = this.sprites.bb(d, 0.4, f, 2.2, r);
          if ((this.sprites.colC(b, p, 0.35), Math.random() < t * 14)) {
            let v = Math.random() * Me;
            this.emit(
              d + Math.cos(v) * 1,
              0.2,
              f + Math.sin(v) * 1,
              -Math.cos(v) * 1.6,
              0.8,
              -Math.sin(v) * 1.6,
              0.5,
              0.22,
              p,
              { drag: 0 },
            );
          }
        }
    }
    aimLine(t, e, n, s, r, a) {
      let o = 0.6,
        c = Math.cos(s),
        h = Math.sin(s);
      for (; o < 32; ) {
        let u = e + c * o,
          d = n + h * o;
        if (t.arena.outside(u, d) || t.arena.blocked(u, d, 0)) break;
        o += 0.5;
      }
      let l = this.beams.seg(e + c * 0.6, n + h * 0.6, e + c * o, n + h * o, 0.95, r ? 0.09 : 0.04, r ? 0.09 : 0.04);
      this.beams.colC(l, In, r ? (Math.floor(this.time * 24) % 2 ? 1.2 : 0.6) : 0.25 + a * 0.4);
    }
    chargeLine(t, e, n, s, r, a) {
      let o = t + Math.cos(n) * s,
        c = e + Math.sin(n) * s,
        h = this.beams.seg(t, e, o, c, 0.06, r, 0.02);
      this.beams.colC(h, In, 0.12 + a * 0.2);
      let l = this.beams.seg(t, e, t + Math.cos(n) * s * a, e + Math.sin(n) * s * a, 0.07, r, 0.02);
      this.beams.colC(l, In, 0.25);
    }
    drawBoss(t, e, n) {
      if (!n) {
        this.bossView && (this.bossView.group.visible = !1);
        return;
      }
      if (!this.bossView || this.bossView.id !== n.type) {
        this.bossView &&
          (this.scene.remove(this.bossView.group),
          this.bossView.group.traverse((f) => {
            (f.geometry && f.geometry.dispose(), f.material && [].concat(f.material).forEach((p) => p.dispose()));
          }));
        let d = Of(n.type, en[n.type].color);
        ((d.id = n.type), (this.bossView = d), this.scene.add(d.group));
      }
      let s = this.bossView,
        r = s.group,
        a = this.time;
      r.visible = !0;
      let o = n.spawnT > 0 ? Lt(1 - n.spawnT / 1.2, 0, 1) : 1;
      this.focus && (o = Math.max(o, Lt((this.focusK - 0.15) / 0.45, 0, 1)));
      let c = Zf(o);
      (r.position.set(n.x, n.type === "prism" || n.type === "queen" ? Math.sin(a * 1.6) * 0.2 : 0, n.y),
        r.scale.setScalar(Math.max(0.01, c)),
        (r.rotation.y = -n.face));
      for (let d of s.spin) d.m.rotation[d.ax] += d.v * t * (n.enraged ? 1.8 : 1);
      let h = n.flash;
      for (let d of s.mats) d.emissive.setRGB(h * 0.8 + (n.charging ? 0.25 : 0), h * 0.8, h * 0.8);
      (s.glowMat.color.setHex(n.enraged ? 16732120 : en[n.type].color), n.shielded && s.glowMat.color.setHex(16777215));
      let l = n.ghost ? 0.12 : 1;
      if (r.userData.fadeMats) for (let d of r.userData.fadeMats) d.opacity = l;
      ((s.glowMat.opacity = n.ghost ? 0.15 : 1), this.shadows.y(n.x, 0.02, n.y, 0, n.r * 3.4 * c));
      let u = this.sprites.bb(n.x, 1.2, n.y, n.r * 5, this.B);
      if ((this.sprites.colHex(u, n.enraged ? 16732120 : en[n.type].color, 0.25), n.shielded)) {
        let d = this.ringPool.y(n.x, 0.1, n.y, a, n.r * 1.6);
        this.ringPool.colC(d, mi, 0.8);
      }
      n.type === "warden" &&
        n.st === "charge" &&
        n.sub === 0 &&
        this.chargeLine(n.x, n.y, n.ta, 12, 3.4, Lt(n.subT / 0.85, 0, 1));
    }
    drawParticles(t) {
      let e = this.P,
        n = this.B,
        s = e.n;
      for (let r = 0; r < s; r++) {
        if (((e.life[r] -= t), e.life[r] <= 0)) {
          (s--,
            r !== s &&
              ((e.x[r] = e.x[s]),
              (e.y[r] = e.y[s]),
              (e.z[r] = e.z[s]),
              (e.vx[r] = e.vx[s]),
              (e.vy[r] = e.vy[s]),
              (e.vz[r] = e.vz[s]),
              (e.life[r] = e.life[s]),
              (e.max[r] = e.max[s]),
              (e.size[r] = e.size[s]),
              (e.grow[r] = e.grow[s]),
              (e.r[r] = e.r[s]),
              (e.g[r] = e.g[s]),
              (e.b[r] = e.b[s]),
              (e.drag[r] = e.drag[s]),
              (e.grav[r] = e.grav[s]),
              (e.spark[r] = e.spark[s]),
              r--));
          continue;
        }
        let a = 1 - Math.exp(-e.drag[r] * t);
        ((e.vx[r] -= e.vx[r] * a),
          (e.vy[r] -= e.vy[r] * a + e.grav[r] * t),
          (e.vz[r] -= e.vz[r] * a),
          (e.x[r] += e.vx[r] * t),
          (e.y[r] += e.vy[r] * t),
          (e.z[r] += e.vz[r] * t),
          e.y[r] < 0.05 && ((e.y[r] = 0.05), (e.vy[r] *= -0.4)));
        let o = e.life[r] / e.max[r],
          c = e.size[r] * (1 + e.grow[r] * (1 - o)),
          h = e.spark[r] ? this.sparks : this.sprites,
          l = h.bb(e.x[r], e.y[r], e.z[r], c * (e.spark[r] ? 1 : 0.6 + 0.4 * o), n, e.spark[r] ? r : 0);
        l >= 0 && h.col(l, e.r[r] * o, e.g[r] * o, e.b[r] * o);
      }
      e.n = s;
    }
    drawTransient(t) {
      for (let e of this.lines) {
        e.life -= t;
        let n = Math.max(0, e.life / e.max);
        if (e.jag) {
          let s = e.x1,
            r = e.z1,
            a = e.x2 - e.x1,
            o = e.z2 - e.z1,
            c = Math.hypot(a, o) || 1,
            h = -o / c,
            l = a / c;
          for (let u = 1; u <= 4; u++) {
            let d = u / 4,
              f = u < 4 ? (Math.random() - 0.5) * e.jag * 2 : 0,
              p = e.x1 + a * d + h * f,
              x = e.z1 + o * d + l * f,
              m = this.beams.seg(s, r, p, x, e.y, e.w, e.w);
            (this.beams.colC(m, e.col, n * 1.3), (s = p), (r = x));
          }
        } else {
          let s = this.beams.seg(e.x1, e.z1, e.x2, e.z2, e.y, e.w * n, e.w * n);
          this.beams.colC(s, e.col, n);
        }
      }
      this.lines.length && this.lines.some((e) => e.life <= 0) && (this.lines = this.lines.filter((e) => e.life > 0));
      for (let e of this.rings) {
        e.life -= t;
        let n = Math.max(0, e.life / e.max),
          s = e.r1 + (e.r0 - e.r1) * n,
          r = this.ringPool.y(e.x, e.y, e.z, 0, s);
        this.ringPool.colC(r, e.col, n);
      }
      this.rings.length && this.rings.some((e) => e.life <= 0) && (this.rings = this.rings.filter((e) => e.life > 0));
    }
    project(t, e, n, s) {
      let r = this._v || (this._v = new I());
      return (
        r.set(t, e, n).project(this.camera),
        (s.x = (r.x * 0.5 + 0.5) * this.w),
        (s.y = (-r.y * 0.5 + 0.5) * this.h),
        (s.vis = r.z < 1 && r.x > -1.05 && r.x < 1.05 && r.y > -1.05 && r.y < 1.05),
        (s.nx = r.x),
        (s.ny = r.y),
        s
      );
    }
    groundAt(t, e) {
      let n = this._ray || (this._ray = new Zr()),
        s = this._nd || (this._nd = new ht());
      (s.set((t / this.w) * 2 - 1, -(e / this.h) * 2 + 1), n.setFromCamera(s, this.camera));
      let r = n.ray.origin,
        a = n.ray.direction;
      if (Math.abs(a.y) < 1e-4) return null;
      let o = (0.75 - r.y) / a.y;
      return { x: r.x + a.x * o, y: r.z + a.z * o };
    }
    setAccess(t, e) {
      ((this.contrast = !!t),
        In.setHex(t ? 16773226 : 16728160),
        Yf.setHex(t ? 16765498 : 16732064),
        (this.flashK = e ? 0.35 : 1));
    }
    resetCamera() {
      ((this.camInit = !1), (this.shake = 0));
    }
    focusOn(t, e) {
      ((this.focus = t == null ? null : { x: t, z: e }), (this.focusK = 0));
    }
  };
// 2.3.6: on landscape phones and tablets the home screen has two columns (title left, weapon
// card right). The drone preview is drawn at the screen centre, which is where the title ends,
// so the drone sat on the last letters of RIFTLINE. With two columns the view is now shifted so
// the drone shows in the larger free band of the title column, above or below the title.
(() => {
  const baseCamera = Bl.prototype.updateCamera;
  let spot = null,
    dirty = !0;
  const measure = () => {
    const q = (sel) => document.querySelector(sel),
      brand = q("#home .brand"),
      panel = q("#home .home-panel"),
      top = q("#home .topbar"),
      nav = q("#home .bottom-nav");
    if (!brand || !panel || !top || !nav) return null;
    const b = brand.getBoundingClientRect(),
      p = panel.getBoundingClientRect();
    if (b.width < 1 || p.width < 1 || b.right > p.left) return null; // stacked: the centre is free
    const t = top.getBoundingClientRect().bottom,
      n = nav.getBoundingClientRect().top,
      above = b.top - t,
      below = n - b.bottom;
    return {
      x: (b.left + b.right) / 2,
      y: above > below ? b.top - Math.min(above / 2, 100) : b.bottom + Math.min(below / 2, 100),
    };
  };
  // the device classes (phone/tablet, portrait/landscape) settle up to 420 ms after a resize
  const remeasure = () => {
    dirty = !0;
    setTimeout(() => (dirty = !0), 450);
  };
  addEventListener("resize", remeasure, { passive: !0 });
  window.visualViewport && window.visualViewport.addEventListener("resize", remeasure, { passive: !0 });
  document.fonts && document.fonts.ready.then(() => (dirty = !0));
  const baseShow = Gl.prototype._show;
  Gl.prototype._show = function (screen) {
    dirty = !0;
    return baseShow.call(this, screen);
  };
  Bl.prototype.updateCamera = function (dt, world, menu) {
    baseCamera.call(this, dt, world, menu);
    let want = null;
    if (menu && Ft.screen === "home") {
      dirty && ((spot = measure()), (dirty = !1));
      want = spot;
    }
    const key = want ? `${Math.round(want.x)},${Math.round(want.y)},${this.w},${this.h}` : "";
    if (key === (this._rlViewKey || "")) return;
    this._rlViewKey = key;
    want
      ? this.camera.setViewOffset(this.w, this.h, this.w / 2 - want.x, this.h / 2 - want.y, this.w, this.h)
      : this.camera.clearViewOffset();
  };
})();
const _rlFrame240 = Bl.prototype.frame;
Bl.prototype.frame = function (t, e, n = {}) {
  try {
    rlAmbient(this, t, e, n);
  } catch (err) {
    this.rlAmbErr || (ze("ambient", err), (this.rlAmbErr = !0));
  }
  return _rlFrame240.call(this, t, e, n);
};
const _rlSetBiome240 = Bl.prototype.setBiome;
Bl.prototype.setBiome = function (t, e) {
  _rlSetBiome240.call(this, t, e);
  const L = RL_BIOME_LOOK[t.id] || RL_BIOME_LOOK.yard,
    f = this.scene.fog;
  this.sun.color.setHex(L.sun);
  if (L.fog) {
    // fog relative to the camera distance, so portrait phones (camera further out) look the same
    const a = this.camDistance();
    ((f.near = a * L.fog[0]), (f.far = a * L.fog[1]));
  } else ((f.near = 30), (f.far = 75));
};
const _rlLights240 = Bl.prototype.updateLights;
Bl.prototype.updateLights = function (t, e) {
  _rlLights240.call(this, t, e);
  const L = this.biome && RL_BIOME_LOOK[this.biome.id];
  L && ((this.hemi.intensity = L.hemi), (this.sun.intensity = L.sunI));
};
const _rlFrame241 = Bl.prototype.frame;
Bl.prototype.frame = function (t, e, n = {}) {
  if (!this.rlSkinned) {
    for (const id in this.enemyPools) rlSkinMaterial(this.enemyPools[id].body.mesh.material, !0);
    this.rlSkinned = !0;
  }
  const L = this.biome && RL_BIOME_LOOK[this.biome.id];
  ((RL_SKIN.uSkin.value = L ? L.style : 0), (RL_SKIN.uSkinT.value += t || 0));
  if (this.bossView && !this.bossView.rlSkin) {
    for (const m of this.bossView.mats) rlSkinMaterial(m, !1);
    this.bossView.rlSkin = !0;
  }
  try {
    n.menu || rlSkinParticles(this, t, e);
  } catch (err) {
    this.rlSkinErr || (ze("skin", err), (this.rlSkinErr = !0));
  }
  return _rlFrame241.call(this, t, e, n);
};

export { Bl, lt, zi };
