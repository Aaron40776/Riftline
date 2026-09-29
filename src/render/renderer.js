// three.js renderer (Renderer): scene, camera, lights, instanced pools, particles, per-frame drawing.

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Fog,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { logError } from "../core/diagnostics.js";
import {
  debrisGeometry,
  discGeometry,
  enemyGeometry,
  shardGeometry,
  orbitBladeGeometry,
  buildBossModel,
  shieldArcGeometry,
  healCrossGeometry,
  buildPlayerModel,
  wingDroneGeometry,
} from "./models.js";
import { enemyDefs, eliteAffixes, bossDefs } from "../data/enemies.js";
import { ui } from "../main.js";
import { smoothstep, clamp, TAU, easeOutBack, dampFactor } from "../core/util.js";
import { biomeList } from "../data/biomes.js";
import { weaponDefs } from "../data/weapons.js";
import { RL_BIOME_LOOK, RL_SKIN, ArenaView, rlAmbient, rlSkinMaterial, rlSkinParticles } from "./biome-visuals.js";

var tmpColor = new Color(),
  InstancePool = class {
    constructor(geo, mat, max, opts = {}) {
      this.max = max;
      this.mesh = new InstancedMesh(geo, mat, max);
      this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.count = 0;
      this.m = this.mesh.instanceMatrix.array;
      if (opts.color !== false) {
        this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
        this.mesh.instanceColor.setUsage(DynamicDrawUsage);
        this.c = this.mesh.instanceColor.array;
      }
      if (opts.flash) {
        this.fAttr = new InstancedBufferAttribute(new Float32Array(max), 1);
        this.fAttr.setUsage(DynamicDrawUsage);
        geo.setAttribute("aFlash", this.fAttr);
        this.f = this.fAttr.array;
      }
      this.n = 0;
    }
    begin() {
      this.n = 0;
    }
    end() {
      this.mesh.count = this.n;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.c) {
        this.mesh.instanceColor.needsUpdate = true;
      }
      if (this.f) {
        this.fAttr.needsUpdate = true;
      }
    }
    y(x, y, z, angle, sx, sy = sx, sz = sx) {
      if (this.n >= this.max) return -1;
      let idx = this.n++,
        arr = this.m,
        off = idx * 16,
        cos = Math.cos(-angle),
        sin = Math.sin(-angle);
      arr[off] = cos * sx;
      arr[off + 1] = 0;
      arr[off + 2] = -sin * sx;
      arr[off + 3] = 0;
      arr[off + 4] = 0;
      arr[off + 5] = sy;
      arr[off + 6] = 0;
      arr[off + 7] = 0;
      arr[off + 8] = sin * sz;
      arr[off + 9] = 0;
      arr[off + 10] = cos * sz;
      arr[off + 11] = 0;
      arr[off + 12] = x;
      arr[off + 13] = y;
      arr[off + 14] = z;
      arr[off + 15] = 1;
      return idx;
    }
    bb(x, y, z, size, basis, rot = 0) {
      if (this.n >= this.max) return -1;
      let idx = this.n++,
        arr = this.m,
        off = idx * 16,
        rx = basis.rx,
        ry = basis.ry,
        rz = basis.rz,
        ux = basis.ux,
        uy = basis.uy,
        uz = basis.uz;
      if (rot) {
        let cos = Math.cos(rot),
          sin = Math.sin(rot),
          nrx = rx * cos + ux * sin,
          nry = ry * cos + uy * sin,
          nrz = rz * cos + uz * sin;
        ux = ux * cos - rx * sin;
        uy = uy * cos - ry * sin;
        uz = uz * cos - rz * sin;
        rx = nrx;
        ry = nry;
        rz = nrz;
      }
      arr[off] = rx * size;
      arr[off + 1] = ry * size;
      arr[off + 2] = rz * size;
      arr[off + 3] = 0;
      arr[off + 4] = ux * size;
      arr[off + 5] = uy * size;
      arr[off + 6] = uz * size;
      arr[off + 7] = 0;
      arr[off + 8] = basis.fx;
      arr[off + 9] = basis.fy;
      arr[off + 10] = basis.fz;
      arr[off + 11] = 0;
      arr[off + 12] = x;
      arr[off + 13] = y;
      arr[off + 14] = z;
      arr[off + 15] = 1;
      return idx;
    }
    seg(x0, z0, x1, z1, y, width, height) {
      let dx = x1 - x0,
        dz = z1 - z0,
        len = Math.hypot(dx, dz);
      return len < 1e-4 ? -1 : this.y(x0, y, z0, Math.atan2(dz, dx), len, height, width);
    }
    col(idx, r, g, b) {
      if (idx < 0 || !this.c) return;
      let off = idx * 3;
      this.c[off] = r;
      this.c[off + 1] = g;
      this.c[off + 2] = b;
    }
    colC(idx, color, mul = 1) {
      if (idx < 0 || !this.c) return;
      let off = idx * 3;
      this.c[off] = color.r * mul;
      this.c[off + 1] = color.g * mul;
      this.c[off + 2] = color.b * mul;
    }
    colHex(idx, hex, mul = 1) {
      tmpColor.setHex(hex);
      this.colC(idx, tmpColor, mul);
    }
    flash(idx, value) {
      if (idx >= 0 && this.f) {
        this.f[idx] = value;
      }
    }
  };
function makeFlashMaterial(params) {
  let mat = new MeshLambertMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
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
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vFlash;`,
      )
      .replace(
        "#include <opaque_fragment>",
        `outgoingLight = mix(outgoingLight, vec3(1.0), vFlash);
#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => "flashLambert";
  return mat;
}
function additiveMaterial(map, opts = {}) {
  return new MeshBasicMaterial({
    map: map || null,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    ...opts,
  });
}
function makeCanvasTexture(size, draw) {
  let canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  let ctx = canvas.getContext("2d");
  draw(ctx, size);
  let tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
function makeGlowTexture() {
  return makeCanvasTexture(128, (ctx, size) => {
    let half = size / 2,
      grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.25)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
}
function makeShadowTexture() {
  return makeCanvasTexture(64, (ctx, size) => {
    let half = size / 2,
      grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, "rgba(0,0,0,0.75)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.35)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
}
function makeSparkTexture() {
  return makeCanvasTexture(64, (ctx, size) => {
    let grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size * 0.62, size / 2);
    ctx.lineTo(size / 2, size);
    ctx.lineTo(size * 0.38, size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size / 2, size * 0.6);
    ctx.lineTo(size, size / 2);
    ctx.lineTo(size / 2, size * 0.4);
    ctx.closePath();
    ctx.fill();
  });
}
function makeColumnTexture() {
  return makeCanvasTexture(64, (ctx, size) => {
    let grad = ctx.createLinearGradient(0, size, 0, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
}
var MAX_PARTICLES = 1400,
  goldColor = new Color(16762954),
  colorCache = new Map(),
  hexColor = (hex) => {
    let color = colorCache.get(hex);
    if (!color) {
      color = new Color(hex);
      colorCache.set(hex, color);
    }
    return color;
  },
  // 2.4.6: slag, the molten orbs of the Crucible
  enemyShotColors = {
    orb: hexColor(16727423),
    fast: hexColor(16722474),
    shard: hexColor(9431295),
    slag: hexColor(16743722),
  },
  shardColors = { 1: hexColor(8386303), 5: hexColor(16762954), 25: hexColor(16734936) },
  healColor = hexColor(7208842),
  whiteColor = hexColor(16777215),
  hurtColor = hexColor(16724048),
  warnColor = new Color(16728160),
  variantColors = {
    scorch: hexColor(16738858),
    frost: hexColor(11462911),
    phase: hexColor(16732120),
    toxic: hexColor(11861821),
  },
  beamColor = new Color(16732064),
  Renderer = class {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: "high-performance",
        stencil: false,
      });
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.setClearColor(329485, 1);
      this.dprCap = opts.dpr || 1.5;
      this.zoom = 1;
      this.scene = new Scene();
      this.scene.fog = new Fog(395798, 30, 75);
      this.camera = new PerspectiveCamera(42, 1, 0.5, 200);
      this.hemi = new HemisphereLight(2771594, 657944, 1.9);
      this.sun = new DirectionalLight(16777215, 1.5);
      this.sun.position.set(6, 14, 9);
      this.scene.add(this.hemi, this.sun);
      this.arena = new ArenaView(this.scene);
      this.time = 0;
      this.shake = 0;
      this.camX = 0;
      this.camZ = 2;
      this.camInit = false;
      this.B = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
      this.nums = [];
      this.maxParticles = opts.particles || MAX_PARTICLES;
      this.initPools();
      this.initParticles();
      this.lines = [];
      this.rings = [];
      this.player = null;
      this.playerWeapon = null;
      this.bossView = null;
      this.flashT = 0;
      this.menuA = 0;
      this.flashK = 1;
      this.contrast = false;
      this.resize();
    }
    initPools() {
      let scene = this.scene;
      this.texGlow = makeGlowTexture();
      this.texShadow = makeShadowTexture();
      this.texSpark = makeSparkTexture();
      let quad = new PlaneGeometry(1, 1);
      this.sprites = new InstancePool(quad, additiveMaterial(this.texGlow), 2200);
      this.sparks = new InstancePool(quad.clone(), additiveMaterial(this.texSpark), 700);
      let ringGeo = new RingGeometry(0.86, 1, 48, 1);
      ringGeo.rotateX(-Math.PI / 2);
      this.ringPool = new InstancePool(ringGeo, additiveMaterial(null, { side: DoubleSide }), 260);
      let discGeo = new CircleGeometry(1, 40);
      discGeo.rotateX(-Math.PI / 2);
      this.discs = new InstancePool(discGeo, additiveMaterial(null, { side: DoubleSide }), 120);
      let beamGeo = new BoxGeometry(1, 1, 1);
      beamGeo.translate(0.5, 0, 0);
      this.beams = new InstancePool(beamGeo, additiveMaterial(null), 500);
      let floorQuad = new PlaneGeometry(1, 1);
      floorQuad.rotateX(-Math.PI / 2);
      this.shadows = new InstancePool(
        floorQuad,
        new MeshBasicMaterial({ map: this.texShadow, transparent: true, depthWrite: false, color: 16777215 }),
        320,
        { color: false },
      );
      let sphere = new SphereGeometry(1, 10, 6);
      this.pbCore = new InstancePool(sphere, new MeshBasicMaterial({ toneMapped: false }), 460);
      this.ebCore = new InstancePool(sphere.clone(), new MeshBasicMaterial({ toneMapped: false }), 380);
      this.shardPool = new InstancePool(shardGeometry(), new MeshBasicMaterial({ toneMapped: false }), 300);
      this.healPool = new InstancePool(
        healCrossGeometry(),
        new MeshBasicMaterial({ toneMapped: false, vertexColors: true }),
        40,
      );
      this.blades = new InstancePool(orbitBladeGeometry(), new MeshBasicMaterial({ toneMapped: false }), 8);
      this.wing = new InstancePool(wingDroneGeometry(), new MeshLambertMaterial({ vertexColors: true }), 4, {
        color: false,
      });
      this.shieldPool = new InstancePool(shieldArcGeometry(), additiveMaterial(null, { side: DoubleSide }), 24);
      this.discPool = new InstancePool(
        discGeometry(),
        new MeshBasicMaterial({ toneMapped: false, vertexColors: true }),
        60,
      );
      this.debris = new InstancePool(debrisGeometry(), new MeshLambertMaterial({ flatShading: true }), 320);
      this.scorch = new InstancePool(
        floorQuad.clone(),
        new MeshBasicMaterial({ map: this.texShadow, transparent: true, depthWrite: false, color: 16777215 }),
        70,
        { color: false },
      );
      let columnGeo = new CylinderGeometry(1, 1, 1, 16, 1, true);
      columnGeo.translate(0, 0.5, 0);
      this.columns = new InstancePool(columnGeo, additiveMaterial(makeColumnTexture(), { side: DoubleSide }), 60);
      this.scorch.mesh.renderOrder = 0;
      this.columns.mesh.renderOrder = 4;
      this.shieldPool.mesh.renderOrder = 5;
      this.shadows.mesh.renderOrder = 1;
      this.discs.mesh.renderOrder = 2;
      this.ringPool.mesh.renderOrder = 3;
      this.beams.mesh.renderOrder = 5;
      this.sprites.mesh.renderOrder = 6;
      this.sparks.mesh.renderOrder = 7;
      this.enemyPools = {};
      for (let type in enemyDefs) {
        let def = enemyDefs[type],
          geo = enemyGeometry(type, def.color),
          max = def.r > 0.9 ? 40 : 120,
          body = new InstancePool(geo.body, makeFlashMaterial({ vertexColors: true, flatShading: true }), max, {
            flash: true,
          }),
          glow = new InstancePool(geo.glow, new MeshBasicMaterial({ toneMapped: false, vertexColors: true }), max);
        this.enemyPools[type] = { body, glow, color: hexColor(def.color) };
        scene.add(body.mesh, glow.mesh);
      }
      for (let pool of this.allPools()) scene.add(pool.mesh);
      this.pLight = new PointLight(4846335, 0, 9, 2);
      this.bLight = new PointLight(16747069, 0, 12, 2);
      scene.add(this.pLight, this.bLight);
      this.flashes = [];
      this.D = [];
      this.scorches = [];
      this.kick = 0;
      this.kickA = 0;
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
      let max = this.maxParticles;
      this.P = {
        n: 0,
        x: new Float32Array(max),
        y: new Float32Array(max),
        z: new Float32Array(max),
        vx: new Float32Array(max),
        vy: new Float32Array(max),
        vz: new Float32Array(max),
        life: new Float32Array(max),
        max: new Float32Array(max),
        size: new Float32Array(max),
        grow: new Float32Array(max),
        r: new Float32Array(max),
        g: new Float32Array(max),
        b: new Float32Array(max),
        drag: new Float32Array(max),
        grav: new Float32Array(max),
        spark: new Uint8Array(max),
      };
    }
    setQuality(dprCap, particles) {
      this.dprCap = dprCap;
      if (particles && particles !== this.maxParticles) {
        this.maxParticles = particles;
        this.initParticles();
      }
      this.resize(true);
    }
    resize(force) {
      let canvas = this.canvas,
        w = Math.max(1, canvas.clientWidth || window.innerWidth),
        h = Math.max(1, canvas.clientHeight || window.innerHeight),
        dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
      if (!(!force && w === this.w && h === this.h && dpr === this.dpr)) {
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.fov = w / h < 1 ? 50 : 40;
        this.camera.updateProjectionMatrix();
      }
    }
    camDistance() {
      let aspect = this.w / this.h,
        halfV = (this.camera.fov * Math.PI) / 360,
        halfH = Math.atan(Math.tan(halfV) * aspect),
        fitW = aspect < 1 ? 15.5 : 26,
        fitD = aspect < 1 ? 19 : 13;
      return Math.max(fitW / 2 / Math.tan(halfH), fitD / 2 / Math.tan(halfV)) * this.zoom;
    }
    setBiome(biome, layout) {
      let prevKey = this.arena.layKey;
      this.arena.build(
        biome,
        layout ? { key: layout.key, W: layout.W, H: layout.H, obs: layout.obs, deco: layout.deco } : null,
        !!layout,
      );
      if (layout && prevKey != null && prevKey !== this.arena.layKey) {
        let color = hexColor(biome.grid);
        for (let obstacle of layout.obs) {
          let size = obstacle.t === "c" ? obstacle.r : Math.max(obstacle.w, obstacle.h);
          this.burst(obstacle.x, obstacle.y, 0.2, 10, 3 + size, color, 0.7, 0.45, { up: 1.5, drag: 3 });
          this.ring(obstacle.x, obstacle.y, size * 0.6, size * 1.8, color, 0.5);
        }
        this.addShake(0.12);
        this.mapChanged = true;
      }
      this.scene.fog.color.setHex(biome.fog);
      this.renderer.setClearColor(biome.fog, 1);
      this.hemi.color.setHex(biome.sky);
      this.hemi.groundColor.setHex(biome.ground);
      this.biome = biome;
      // 2.4.0: sun colour and fog density of the biome look
      const look = RL_BIOME_LOOK[biome.id] || RL_BIOME_LOOK.yard,
        fog = this.scene.fog;
      this.sun.color.setHex(look.sun);
      if (look.fog) {
        // fog relative to the camera distance, so portrait phones (camera further out) look the same
        const dist = this.camDistance();
        fog.near = dist * look.fog[0];
        fog.far = dist * look.fog[1];
      } else {
        fog.near = 30;
        fog.far = 75;
      }
      // 2.5.0 C: in a Whiteout the fog closes in and turns pale
      const whiteK = this.rlWhiteK || 0;
      if (!(whiteK > 0) || biome.id !== "vault") return;
      const camDist = this.camDistance();
      fog.near += (camDist * RL_WHITEOUT_FOG[0] - fog.near) * whiteK;
      fog.far += (camDist * RL_WHITEOUT_FOG[1] - fog.far) * whiteK;
      fog.color.lerp(RL_WHITEOUT_TINT, 0.8 * whiteK);
      this.renderer.setClearColor(fog.color, 1);
    }
    ensurePlayer(weapon) {
      if (!(this.playerWeapon === weapon && this.player)) {
        if (this.player) {
          this.scene.remove(this.player.group);
          this.player.group.traverse((obj) => {
            if (obj.geometry) {
              obj.geometry.dispose();
            }
          });
        }
        this.player = buildPlayerModel(weapon, weaponDefs[weapon].color);
        this.playerWeapon = weapon;
        this.scene.add(this.player.group);
      }
    }
    emit(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
      let parts = this.P;
      if (
        parts.n >= this.maxParticles ||
        (parts.n > this.maxParticles * 0.6 && Math.random() < (parts.n / this.maxParticles - 0.6) * 2)
      )
        return;
      let i = parts.n++;
      parts.x[i] = x;
      parts.y[i] = y;
      parts.z[i] = z;
      parts.vx[i] = vx;
      parts.vy[i] = vy;
      parts.vz[i] = vz;
      parts.life[i] = life;
      parts.max[i] = life;
      parts.size[i] = size;
      parts.grow[i] = opts.grow || 0;
      parts.r[i] = color.r;
      parts.g[i] = color.g;
      parts.b[i] = color.b;
      parts.drag[i] = opts.drag ?? 2.5;
      parts.grav[i] = opts.grav ?? 0;
      parts.spark[i] = opts.spark ? 1 : 0;
    }
    burst(x, z, y, count, speed, color, life = 0.5, size = 0.35, opts = {}) {
      for (let i = 0; i < count; i++) {
        let angle = Math.random() * TAU,
          spd = speed * (0.35 + Math.random() * 0.65),
          vy = opts.up != null ? opts.up : (Math.random() - 0.3) * speed * 0.5;
        this.emit(
          x,
          y,
          z,
          Math.cos(angle) * spd,
          vy,
          Math.sin(angle) * spd,
          life * (0.6 + Math.random() * 0.6),
          size * (0.6 + Math.random() * 0.7),
          color,
          opts,
        );
      }
    }
    line(x1, z1, x2, z2, color, life, width = 0.12, y = 0.7, jag = 0) {
      if (!(this.lines.length > 120)) {
        this.lines.push({ x1, z1, x2, z2, col: color, life, max: life, w: width, y, jag });
      }
    }
    ring(x, z, r0, r1, color, life, y = 0.06) {
      if (!(this.rings.length > 100)) {
        this.rings.push({ x, z, r0, r1, col: color, life, max: life, y });
      }
    }
    addShake(amount) {
      this.shake = Math.min(1, this.shake + amount);
    }
    flash(x, z, radius, intensity, color, decay = 6) {
      if (this.flashes.length > 24) {
        this.flashes.shift();
      }
      this.flashes.push({ x, z, r: radius, i: intensity * this.flashK, col: color, decay });
    }
    updateLights(dt, world) {
      let flashes = this.flashes;
      for (let flash of flashes) flash.i -= flash.i * Math.min(1, flash.decay * dt) + dt * 0.05;
      if (flashes.length && flashes.some((flash) => flash.i <= 0.02)) {
        this.flashes = flashes.filter((flash) => flash.i > 0.02);
      }
      let sorted = this.flashes.slice().sort((a, b) => b.i - a.i),
        uniforms = this.arena.uniforms;
      for (let i = 0; i < 6; i++) {
        let flash = sorted[i];
        if (flash) {
          uniforms.uL.value[i].set(flash.x, flash.z, flash.r, Math.min(1.6, flash.i));
          uniforms.uLC.value[i].copy(flash.col);
        } else {
          uniforms.uL.value[i].w = 0;
        }
      }
      let player = world && world.player;
      this.muzzle = Math.max(0, (this.muzzle || 0) - dt * 14);
      if (player) {
        this.pLight.position.set(player.x + Math.cos(player.aim) * 0.8, 1.3, player.y + Math.sin(player.aim) * 0.8);
      }
      this.hemi.intensity = 1.9;
      this.sun.intensity = 1.5;
      this.pLight.intensity = this.muzzle * 6;
      let big = sorted.find((flash) => !flash.muzzle);
      if (big) {
        this.bLight.position.set(big.x, 1.6, big.z);
        this.bLight.color.copy(big.col);
        this.bLight.intensity = Math.min(1.5, big.i) * 10;
        this.bLight.distance = big.r * 3;
      } else {
        this.bLight.intensity = 0;
      }
      // 2.4.0: light intensities of the biome look
      const look = this.biome && RL_BIOME_LOOK[this.biome.id];
      if (look) {
        this.hemi.intensity = look.hemi;
        this.sun.intensity = look.sunI;
      }
    }
    debrisBurst(x, z, y, count, color, size, speed) {
      let list = this.D;
      for (let i = 0; i < count && list.length < 300; i++) {
        let angle = Math.random() * TAU,
          spd = speed * (0.4 + Math.random() * 0.8);
        list.push({
          x: x + Math.cos(angle) * 0.2,
          y,
          z: z + Math.sin(angle) * 0.2,
          vx: Math.cos(angle) * spd,
          vy: 3 + Math.random() * speed * 0.9,
          vz: Math.sin(angle) * spd,
          rx: Math.random() * 6,
          ry: Math.random() * 6,
          rz: Math.random() * 6,
          sx: (Math.random() - 0.5) * 16,
          sy: (Math.random() - 0.5) * 16,
          sz: (Math.random() - 0.5) * 16,
          s: size * (0.5 + Math.random() * 0.7),
          life: 0.9 + Math.random() * 0.7,
          col: color,
        });
      }
    }
    drawDebris(dt) {
      let list = this.D,
        pool = this.debris,
        arr = pool.m,
        euler = this._e || (this._e = new Euler()),
        quat = this._q || (this._q = new Quaternion()),
        mat = this._m || (this._m = new Matrix4()),
        pos = this._p || (this._p = new Vector3()),
        scale = this._s || (this._s = new Vector3());
      for (let piece of list) {
        piece.life -= dt;
        piece.vy -= 22 * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.z += piece.vz * dt;
        if (piece.y < piece.s * 0.5) {
          piece.y = piece.s * 0.5;
          piece.vy *= -0.35;
          piece.vx *= 0.7;
          piece.vz *= 0.7;
          piece.sx *= 0.6;
          piece.sy *= 0.6;
          piece.sz *= 0.6;
        }
        piece.rx += piece.sx * dt;
        piece.ry += piece.sy * dt;
        piece.rz += piece.sz * dt;
        if (pool.n >= pool.max) continue;
        let idx = pool.n++,
          fade = piece.life < 0.3 ? Math.max(0, piece.life / 0.3) : 1;
        euler.set(piece.rx, piece.ry, piece.rz);
        quat.setFromEuler(euler);
        mat.compose(pos.set(piece.x, piece.y, piece.z), quat, scale.setScalar(piece.s * fade));
        mat.toArray(arr, idx * 16);
        pool.colC(idx, piece.col, 1);
      }
      if (list.length && list.some((piece) => piece.life <= 0)) {
        this.D = list.filter((piece) => piece.life > 0);
      }
    }
    addScorch(x, z, radius) {
      if (this.scorches.length >= 60) {
        this.scorches.shift();
      }
      this.scorches.push({ x, z, r: radius, life: 7, a: Math.random() * TAU });
    }
    drawScorch(dt) {
      for (let mark of this.scorches) {
        mark.life -= dt;
        let fade = mark.life < 1.5 ? Math.max(0, mark.life / 1.5) : 1;
        this.scorch.y(mark.x, 0.015, mark.z, mark.a, mark.r * 2 * fade);
      }
      if (this.scorches.length && this.scorches[0].life <= 0) {
        this.scorches = this.scorches.filter((mark) => mark.life > 0);
      }
    }
    consume(events, world, opts) {
      let showNumbers = opts.numbers !== false,
        shakeK = opts.shake === false ? 0 : 1;
      for (let ev of events)
        switch (ev.k) {
          case "shot": {
            let def = weaponDefs[ev.w],
              color = hexColor(def.color),
              dirX = Math.cos(ev.a),
              dirZ = Math.sin(ev.a);
            if (def.id !== "flame") {
              this.emit(ev.x, 0.8, ev.y, dirX * 2, 0, dirZ * 2, 0.07, def.id === "scatter" ? 1.3 : 0.9, color, {
                drag: 0,
              });
            }
            this.muzzle = Math.min(1, (this.muzzle || 0) + (def.id === "flame" ? 0.12 : 0.6));
            this.pLight.color.copy(color);
            if (!this.lastMuzzleT || this.time - this.lastMuzzleT > 0.05) {
              this.lastMuzzleT = this.time;
              let muzzleFlash = {
                x: ev.x + dirX * 0.6,
                z: ev.y + dirZ * 0.6,
                r: def.id === "rail" ? 3.2 : 2.2,
                i: (def.id === "flame" ? 0.35 : 0.55) * this.flashK,
                col: color,
                decay: 16,
                muzzle: true,
              };
              this.flashes.push(muzzleFlash);
            }
            if (def.shake > 0.04 && shakeK) {
              this.kick = Math.min(0.6, this.kick + def.shake * 2.2);
              this.kickA = ev.a;
            }
            if (def.rail) {
              let len = world.stats.lance ? world.stats.range : world.arena.rayLen(ev.x, ev.y, ev.a, world.stats.range);
              this.line(ev.x, ev.y, ev.x + dirX * len, ev.y + dirZ * len, color, 0.2, 0.16, 0.8);
              this.line(ev.x, ev.y, ev.x + dirX * len, ev.y + dirZ * len, whiteColor, 0.08, 0.05, 0.8);
            }
            this.addShake(def.shake * 0.3 * shakeK);
            break;
          }
          case "wingShot":
            this.emit(ev.x, 0.9, ev.y, 0, 0, 0, 0.06, 0.6, hexColor(4846335), { drag: 0 });
            break;
          case "dmg": {
            if (showNumbers) {
              let existing = ev.id
                ? this.nums.find(
                    (num) => num.id === ev.id && num.life > 0.45 && !num.burn == !ev.burn && !num.shield == !ev.shield,
                  )
                : null;
              if (existing) {
                existing.v += ev.v;
                existing.crit = existing.crit || ev.crit;
                existing.life = Math.max(existing.life, 0.55);
              } else {
                if (this.nums.length < 60) {
                  this.nums.push({
                    id: ev.id,
                    x: ev.x + (Math.random() - 0.5) * 0.4,
                    z: ev.y,
                    y: 1.4,
                    v: ev.v,
                    crit: ev.crit,
                    burn: ev.burn,
                    shield: ev.shield,
                    life: ev.crit ? 0.8 : 0.6,
                  });
                }
              }
            }
            if (!ev.burn) {
              this.burst(
                ev.x,
                ev.y,
                0.6,
                ev.crit ? 4 : 2,
                5,
                ev.crit ? hexColor(16767050) : hexColor(weaponDefs[world.weapon].color),
                0.18,
                0.18,
                {
                  spark: true,
                  drag: 6,
                },
              );
            }
            break;
          }
          case "kill": {
            let color = ev.boss
                ? hexColor(bossDefs[ev.type].color)
                : ev.elite
                  ? goldColor
                  : hexColor(enemyDefs[ev.type].color),
              scale = ev.boss ? 4 : ev.elite ? 1.8 : Math.max(0.8, ev.r * 1.4);
            this.burst(
              ev.x,
              ev.y,
              0.6,
              Math.round(10 * scale),
              7 * Math.sqrt(scale),
              color,
              0.55,
              0.45 * Math.sqrt(scale),
            );
            this.burst(ev.x, ev.y, 0.6, Math.round(6 * scale), 10 * Math.sqrt(scale), whiteColor, 0.3, 0.22, {
              spark: true,
              drag: 5,
            });
            this.ring(ev.x, ev.y, 0.2, 1.6 * scale, color, 0.35);
            this.emit(ev.x, 0.8, ev.y, 0, 0, 0, 0.12, 2.2 * scale, color, { drag: 0 });
            let base = hexColor(ev.boss ? bossDefs[ev.type].color : enemyDefs[ev.type].color),
              dark = this._dk || (this._dk = new Color());
            dark.copy(base).multiplyScalar(0.55);
            this.debrisBurst(
              ev.x,
              ev.y,
              0.6,
              Math.round(Math.min(18, 4 + scale * 5)),
              dark.clone(),
              0.14 + 0.12 * Math.sqrt(scale),
              3 + scale * 2,
            );
            if (ev.r >= 0.5 || ev.elite || ev.boss) {
              this.addScorch(ev.x, ev.y, ev.r * 1.3 + 0.3);
            }
            this.flash(ev.x, ev.y, 2 + scale * 1.6, 0.7 + scale * 0.2, color, 5);
            this.addShake((ev.boss ? 0.9 : ev.elite ? 0.18 : 0.04) * shakeK);
            break;
          }
          case "boom": {
            let color =
                ev.kind === "nova"
                  ? hexColor(8386303)
                  : ev.kind === "pop"
                    ? hexColor(16769354)
                    : ev.kind === "payload"
                      ? hexColor(16752957)
                      : ev.kind === "rocket"
                        ? hexColor(16738877)
                        : ev.kind === "frost" || ev.kind === "glacier" // 2.4.6: Frost Prism ice
                          ? hexColor(12578815)
                          : hexColor(16734778),
              radius = ev.r;
            if (ev.kind !== "nova") {
              this.burst(ev.x, ev.y, 0.5, Math.round(6 + radius * 5), radius * 5, color, 0.45, 0.5 + radius * 0.12);
              this.emit(ev.x, 0.6, ev.y, 0, 0, 0, 0.15, radius * 2.4, color, { drag: 0 });
            }
            this.ring(ev.x, ev.y, radius * 0.3, radius, color, 0.3);
            this.addShake(
              (ev.kind === "payload"
                ? 0.02
                : ev.kind === "rain" || ev.kind === "stomp" || ev.kind === "mortar"
                  ? 0.25
                  : 0.1) * shakeK,
            );
            if (ev.kind !== "payload" || Math.random() < 0.3) {
              this.flash(ev.x, ev.y, radius * 1.6, ev.kind === "payload" ? 0.5 : 1.1, color, 4.5);
            }
            if (
              ev.kind !== "payload" &&
              ev.kind !== "nova" &&
              ev.kind !== "pop" &&
              ev.kind !== "frost" &&
              ev.kind !== "glacier"
            ) {
              this.addScorch(ev.x, ev.y, radius * 0.7);
            }
            if (ev.kind === "frost" || ev.kind === "glacier") {
              this.burst(ev.x, ev.y, 0.2, Math.round(8 + radius * 4), radius * 1.6, whiteColor, 0.6, 0.22, {
                spark: true,
              });
            }
            if (ev.kind === "rocket" || ev.kind === "bomber" || ev.kind === "mortar" || ev.kind === "volatile") {
              this.debrisBurst(ev.x, ev.y, 0.3, 5, hexColor(3811874), 0.12, 5);
            }
            break;
          }
          case "nova":
            this.ring(ev.x, ev.y, 0.5, ev.r, hexColor(8386303), 0.45);
            this.ring(ev.x, ev.y, 0.3, ev.r * 0.8, whiteColor, 0.3);
            this.burst(ev.x, ev.y, 0.7, 40, 16, hexColor(8386303), 0.5, 0.5);
            this.flashT = 0.25;
            this.addShake(0.5 * shakeK);
            this.flash(ev.x, ev.y, ev.r * 1.4, 1.6, hexColor(8386303), 3);
            break;
          case "chain": {
            let pts = ev.pts;
            for (let i = 0; i + 3 < pts.length; i += 2)
              this.line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], hexColor(13019391), 0.16, 0.09, 0.7, 0.5);
            break;
          }
          case "zap":
            this.burst(ev.x, ev.y, 0.6, 6, 6, hexColor(8386303), 0.25, 0.3, { spark: true });
            break;
          case "freeze":
            this.burst(ev.x, ev.y, 0.8, 4, 3, hexColor(12580095), 0.4, 0.3);
            break;
          case "spark":
            this.burst(
              ev.x,
              ev.y,
              0.7,
              3,
              4,
              hexColor(weaponDefs[ev.w] ? weaponDefs[ev.w].color : 16777215),
              0.2,
              0.2,
              {
                spark: true,
              },
            );
            break;
          case "pop":
            this.burst(ev.x, ev.y, 0.7, 3, 3, hexColor(16740250), 0.2, 0.25);
            break;
          case "bounce":
            this.burst(ev.x, ev.y, 0.7, 3, 5, whiteColor, 0.2, 0.2, { spark: true });
            break;
          case "ping":
            this.burst(ev.x, ev.y, 1.2, 2, 4, hexColor(10466520), 0.2, 0.25, { spark: true });
            break;
          case "dash":
            this.ring(world.player.x, world.player.y, 0.3, 1.4, hexColor(8386303), 0.25);
            break;
          case "edash":
            {
              let color = hexColor(enemyDefs[ev.type] ? enemyDefs[ev.type].color : 16777215);
              this.ring(ev.x, ev.y, 0.2, 1.3, color, 0.25);
              this.burst(ev.x, ev.y, 0.5, 8, 6, color, 0.3, 0.25, { spark: true });
            }
            break;
          case "supplyDrop":
            this.ring(ev.x, ev.y, 0.3, 1.8, goldColor, 0.35);
            break;
          case "hurt":
            this.addShake(0.35 * shakeK);
            this.burst(ev.x, ev.y, 0.7, 10, 6, hurtColor, 0.35, 0.3);
            break;
          case "shieldBreak":
            this.ring(ev.x, ev.y, 0.5, 2.2, hexColor(8386303), 0.35);
            this.burst(ev.x, ev.y, 0.7, 14, 7, hexColor(8386303), 0.35, 0.28, { spark: true });
            this.addShake(0.15 * shakeK);
            break;
          case "heal":
            this.burst(ev.x, ev.y, 0.5, 8, 2.5, healColor, 0.6, 0.3, { up: 3 });
            break;
          case "revive":
            this.ring(ev.x, ev.y, 0.5, 6, healColor, 0.6);
            this.burst(ev.x, ev.y, 0.7, 40, 9, healColor, 0.7, 0.45);
            break;
          case "die":
            this.burst(ev.x, ev.y, 0.7, 60, 12, hexColor(8386303), 0.9, 0.5);
            this.ring(ev.x, ev.y, 0.5, 5, hurtColor, 0.5);
            this.addShake(0.8 * shakeK);
            break;
          case "spawn": {
            let color = ev.elite ? goldColor : hexColor(enemyDefs[ev.type] ? enemyDefs[ev.type].color : 16777215);
            this.ring(ev.x, ev.y, 0.2, 1.4, color, 0.3);
            this.burst(ev.x, ev.y, 0.3, 8, 4, color, 0.4, 0.3, { up: 5 });
            break;
          }
          case "thud":
            this.addShake((ev.big ? 0.4 : 0.15) * shakeK);
            this.ring(ev.x, ev.y, 0.5, ev.big ? 3.5 : 1.8, hexColor(16756896), 0.3);
            break;
          case "hatch":
            this.burst(ev.x, ev.y, 1.2, ev.big ? 16 : 6, 4, hexColor(13041469), 0.4, 0.3);
            break;
          case "blink":
            if (ev.small) {
              let color = hexColor(ev.phase ? 16732120 : enemyDefs.striker.color);
              this.burst(ev.x, ev.y, 0.8, 12, 6, color, 0.35, 0.3);
              this.ring(ev.x, ev.y, 0.3, 1.6, color, 0.25);
            } else {
              this.burst(ev.x, ev.y, 2.2, 24, 8, hexColor(9431295), 0.45, 0.4);
              this.ring(ev.x, ev.y, 0.4, 3, hexColor(9431295), 0.35);
            }
            break;
          case "block":
            this.burst(ev.x, ev.y, 0.9, 3, 5, hexColor(10475775), 0.2, 0.25, { spark: true, drag: 6 });
            break;
          case "guardBreak":
            this.burst(ev.x, ev.y, 0.9, 22, 8, hexColor(5941503), 0.45, 0.35, { spark: true });
            this.ring(ev.x, ev.y, 0.3, 2.4, hexColor(10475775), 0.35);
            this.addShake(0.08 * shakeK);
            break;
          case "guardUp":
            this.ring(ev.x, ev.y, 2, 0.6, hexColor(5941503), 0.35);
            break;
          case "shieldPop":
            this.burst(ev.x, ev.y, 0.8, 16, 6, hexColor(eliteAffixes.shielded.color), 0.4, 0.3, { spark: true });
            this.ring(ev.x, ev.y, 0.3, ev.r * 2.6, hexColor(eliteAffixes.shielded.color), 0.3);
            break;
          case "lob":
            this.burst(ev.x, ev.y, 1.4, 8, 3, hexColor(12099712), 0.5, 0.45, { up: 4, drag: 3 });
            this.flash(ev.x, ev.y, 2, 0.6, hexColor(16752957), 8);
            break;
          case "phase":
          case "enrage":
            this.ring(ev.x, ev.y, 1, 7, hexColor(16732120), 0.5);
            this.addShake(0.4 * shakeK);
            break;
          case "bossDown":
            this.flashT = 0.35;
            this.addShake(1 * shakeK);
            this.ring(ev.x, ev.y, 1, 16, whiteColor, 0.8);
            break;
          case "wave":
            this.pulse = 1;
            break;
          case "mend":
            if (ev.tx == null) {
              this.ring(ev.x, ev.y, 0.5, ev.r || 6, hexColor(7208904), 0.5);
              this.burst(ev.x, ev.y, 1, 14, 3, hexColor(7208904), 0.5, 0.3, { up: 3 });
            } else {
              this.line(ev.x, ev.y, ev.tx, ev.ty, hexColor(7208904), 0.35, 0.12, 0.9, 0.3);
              this.burst(ev.tx, ev.ty, 0.8, 10, 2, hexColor(7208904), 0.5, 0.3, { up: 3 });
            }
            break;
          case "chill":
            this.burst(ev.x, ev.y, 0.6, 12, 3, hexColor(11462911), 0.5, 0.3, { spark: true });
            break;
          case "champion":
            this.ring(ev.x, ev.y, 0.5, 5, goldColor, 0.6);
            this.burst(ev.x, ev.y, 0.5, 30, 7, goldColor, 0.6, 0.45, { up: 4 });
            this.addShake(0.25 * shakeK);
            break;
          case "championDown":
            this.ring(ev.x, ev.y, 1, 9, goldColor, 0.6);
            this.flash(ev.x, ev.y, 6, 1.4, goldColor, 3);
            break;
          case "erupt": {
            let color = hexColor(16738858);
            this.burst(ev.x, ev.y, 0.3, 26, 5, color, 0.8, 0.6, { up: 7, grav: 9, drag: 1.5 });
            this.burst(ev.x, ev.y, 0.3, 10, 3, hexColor(16765562), 0.5, 0.4, { up: 9, spark: true });
            this.ring(ev.x, ev.y, ev.r * 0.4, ev.r * 1.4, color, 0.4);
            this.flash(ev.x, ev.y, ev.r * 3, 1.3, color, 3);
            this.addShake(0.12 * shakeK);
            break;
          }
          case "warp": {
            let color = hexColor(16732120),
              count = ev.who === "player" ? 18 : 5;
            this.burst(ev.x, ev.y, 0.6, count, 4, color, 0.4, 0.35, { spark: true });
            this.burst(ev.tx, ev.ty, 0.6, count, 4, hexColor(8386303), 0.4, 0.35, { spark: true });
            if (ev.who === "player") {
              this.ring(ev.tx, ev.ty, 0.3, 2, hexColor(8386303), 0.35);
              this.camInit = false;
            }
            break;
          }
        }
    }
    updateCamera(dt, world, menu) {
      let cam = this.camera,
        tilt = this.w < this.h ? 1.08 : 0.98,
        dist = this.camDistance();
      if (menu) {
        this.menuA += dt * 0.12;
        let radius = 22 * this.zoom,
          height = 15 * this.zoom;
        cam.position.set(Math.sin(this.menuA) * radius, height, Math.cos(this.menuA) * radius);
        cam.lookAt(0, 0.5, 0);
      } else {
        let player = world.player,
          arena = world.arena,
          tx = player.x,
          tz = player.y;
        if (player.firing) {
          tx += Math.cos(player.aim) * 1.2;
          tz += Math.sin(player.aim) * 1.2;
        }
        tx += player.vx * 0.12;
        tz += player.vy * 0.12;
        tx = clamp(tx, -arena.W + 3, arena.W - 3);
        tz = clamp(tz, -arena.H + 3, arena.H - 3);
        if (!this.camInit) {
          this.camX = tx;
          this.camZ = tz;
          this.camInit = true;
        }
        let damp = dampFactor(5, dt);
        if (this.focus) {
          let k = clamp(this.focusK || 0, 0, 1),
            blend = k < 0.3 ? smoothstep(k / 0.3) : k > 0.75 ? smoothstep((1 - k) / 0.25) : 1;
          tx += (clamp(this.focus.x, -arena.W + 3, arena.W - 3) - tx) * blend;
          tz += (clamp(this.focus.z, -arena.H + 3, arena.H - 3) - tz) * blend;
          damp = dampFactor(12, dt);
        }
        this.camX += (tx - this.camX) * damp;
        this.camZ += (tz - this.camZ) * damp;
        let amp = this.shake * this.shake * 0.55,
          shakeX = (Math.random() - 0.5) * amp - Math.cos(this.kickA) * this.kick * 0.35,
          shakeZ = (Math.random() - 0.5) * amp - Math.sin(this.kickA) * this.kick * 0.35;
        cam.position.set(this.camX + shakeX, Math.sin(tilt) * dist, this.camZ + Math.cos(tilt) * dist + shakeZ);
        cam.lookAt(this.camX + shakeX, 0, this.camZ + shakeZ - 1);
      }
      this.shake = Math.max(0, this.shake - dt * 2.2);
      this.kick = Math.max(0, this.kick - dt * (4 + this.kick * 10));
      cam.updateMatrixWorld();
      let elements = cam.matrixWorld.elements,
        basis = this.B;
      basis.rx = elements[0];
      basis.ry = elements[1];
      basis.rz = elements[2];
      basis.ux = elements[4];
      basis.uy = elements[5];
      basis.uz = elements[6];
      basis.fx = elements[8];
      basis.fy = elements[9];
      basis.fz = elements[10];
      // 2.3.6: on the two-column home screen the drone is shown in the free band of the title
      // column instead of the screen centre (see homeViewSpot below the class)
      let want = null;
      if (menu && ui.screen === "home") {
        if (dirty) {
          homeViewSpot = measureHomeViewSpot();
          dirty = false;
        }
        want = homeViewSpot;
      }
      const key = want ? `${Math.round(want.x)},${Math.round(want.y)},${this.w},${this.h}` : "";
      if (key === (this._rlViewKey || "")) return;
      this._rlViewKey = key;
      if (want) {
        this.camera.setViewOffset(this.w, this.h, this.w / 2 - want.x, this.h / 2 - want.y, this.w, this.h);
      } else {
        this.camera.clearViewOffset();
      }
    }
    frame(dt, world, opts = {}) {
      // 2.5.0 C: Whiteout (Cryo Vault) blows wind-driven snow across the view; it fades in and out
      // over about a second and scales with the particle budget of the quality setting
      const want =
        !opts.menu &&
        world &&
        world.event === "whiteout" &&
        world.state === "fight" &&
        world.arena?.biome?.id === "vault"
          ? 1
          : 0;
      this.rlWhiteK = clamp((this.rlWhiteK || 0) + (want ? 1 : -1) * (dt || 0) * 0.9, 0, 1);
      if (this.rlWhiteK > 0.02 && dt > 0 && dt < 0.25) {
        const density = Math.min(1, this.maxParticles / 1400) * this.rlWhiteK,
          amount = 70 * dt * density,
          count = Math.floor(amount) + (Math.random() < amount - Math.floor(amount) ? 1 : 0),
          W = world.arena.W,
          H = world.arena.H;
        for (let j = 0; j < count; j++)
          this.emit(
            clamp(this.camX + (Math.random() * 2 - 1) * 18, -W - 2, W + 2),
            0.6 + Math.random() * 5,
            clamp(this.camZ + (Math.random() * 2 - 1) * 14 - 2, -H - 2, H + 2),
            5 + Math.random() * 3,
            -1.6 - Math.random(),
            1.2 + Math.random(),
            2.2,
            0.16 + Math.random() * 0.08,
            RL_WHITEOUT_SNOW,
            { drag: 0 },
          );
      }
      // 2.4.1: biome skins for enemy and boss materials and particles
      if (!this.rlSkinned) {
        for (const id in this.enemyPools) rlSkinMaterial(this.enemyPools[id].body.mesh.material, true);
        this.rlSkinned = true;
      }
      const look = this.biome && RL_BIOME_LOOK[this.biome.id];
      RL_SKIN.uSkin.value = look ? look.style : 0;
      RL_SKIN.uSkinT.value += dt || 0;
      if (this.bossView && !this.bossView.rlSkin) {
        for (const mat of this.bossView.mats) rlSkinMaterial(mat, false);
        this.bossView.rlSkin = true;
      }
      try {
        if (!opts.menu) {
          rlSkinParticles(this, dt, world);
        }
      } catch (err) {
        if (!this.rlSkinErr) {
          logError("skin", err);
          this.rlSkinErr = true;
        }
      }
      // 2.4.0: ambient particles of the biome
      try {
        rlAmbient(this, dt, world, opts);
      } catch (err) {
        if (!this.rlAmbErr) {
          logError("ambient", err);
          this.rlAmbErr = true;
        }
      }
      this.time += dt;
      this.resize();
      let menu = !world || opts.menu;
      if (menu) {
        let biome = opts.biome || biomeList[0];
        this.setBiome(biome);
        this.ensurePlayer(opts.weapon || "pulse");
      } else {
        this.setBiome(world.arena.biome, world.arena);
        this.ensurePlayer(world.weapon);
      }
      this.updateCamera(dt, world, menu);
      this.pulse = Math.max(0, (this.pulse || 0) - dt * 1.5);
      let px = menu ? 0 : world.player.x,
        pz = menu ? 0 : world.player.y;
      this.arena.update(dt, px, pz, this.pulse);
      let pools = this.allPools();
      for (let pool of pools) pool.begin();
      for (let type in this.enemyPools) {
        this.enemyPools[type].body.begin();
        this.enemyPools[type].glow.begin();
      }
      if (menu) {
        this.drawMenuPlayer(dt);
      } else {
        this.drawWorld(dt, world);
      }
      this.updateLights(dt, menu ? null : world);
      this.drawDebris(dt);
      this.drawScorch(dt);
      this.drawParticles(dt);
      this.drawTransient(dt);
      for (let pool of pools) pool.end();
      for (let type in this.enemyPools) {
        this.enemyPools[type].body.end();
        this.enemyPools[type].glow.end();
      }
      for (let num of this.nums) {
        num.life -= dt;
        num.y += dt * 1.6;
      }
      if (this.nums.length && this.nums[0].life <= 0) {
        this.nums = this.nums.filter((num) => num.life > 0);
      }
      this.flashT = Math.max(0, this.flashT - dt);
      this.renderer.render(this.scene, this.camera);
    }
    drawMenuPlayer(dt) {
      let drone = this.player;
      drone.group.visible = true;
      drone.group.position.set(0, 0.25 + Math.sin(this.time * 2) * 0.08, 0);
      drone.base.rotation.y = this.time * 0.3;
      drone.turret.rotation.y = Math.sin(this.time * 0.7) * 1.2;
      drone.shield.visible = false;
      for (let mat of drone.mats) mat.emissive.setScalar(0);
      let shadow = this.shadows.y(0, 0.02, 0, 0, 2.2),
        glow = this.sprites.bb(0, 0.15, 0, 2.2, this.B);
      this.sprites.colC(glow, hexColor(weaponDefs[this.playerWeapon].color), 0.35);
      if (Math.random() < dt * 30) {
        let angle = Math.random() * TAU,
          dist = 3 + Math.random() * 14;
        this.emit(
          Math.cos(angle) * dist,
          0.1,
          Math.sin(angle) * dist,
          0,
          0.6 + Math.random(),
          0,
          2.5,
          0.25,
          hexColor(this.biome.grid),
          {
            drag: 0,
          },
        );
      }
      if (this.bossView) {
        this.bossView.group.visible = false;
      }
    }
    drawWorld(dt, world) {
      let basis = this.B,
        time = this.time,
        player = world.player,
        drone = this.player;
      drone.group.visible = player.alive;
      if (player.alive) {
        let bob = Math.sin(time * 5) * 0.05;
        drone.group.position.set(player.x, 0.22 + bob, player.y);
        drone.base.rotation.y = -player.face;
        drone.turret.rotation.y = -player.aim;
        drone.shield.visible = player.shield;
        drone.shield.material.opacity = 0.12 + Math.sin(time * 6) * 0.04;
        let blink =
            player.iT > 0 && player.hurtT <= 0 && world.state === "fight" && Math.floor(time * 20) % 2 ? 0.35 : 0,
          hurt = player.hurtT > 0 ? player.hurtT / 0.3 : 0;
        for (let mat of drone.mats) mat.emissive.setRGB(hurt * 0.9 + blink, blink * 0.8, blink);
        this.shadows.y(player.x, 0.02, player.y, 0, 1.9);
        if (player.manual) {
          let reach = world.arena.rayLen(player.x, player.y, player.aim, Math.min(world.stats.range, 16)),
            cos = Math.cos(player.aim),
            sin = Math.sin(player.aim),
            aimBeam = this.beams.seg(
              player.x + cos * 0.9,
              player.y + sin * 0.9,
              player.x + cos * reach,
              player.y + sin * reach,
              0.08,
              0.07,
              0.02,
            );
          this.beams.colC(aimBeam, hexColor(weaponDefs[world.weapon].color), 0.22);
        }
        let glow = this.sprites.bb(player.x, 0.2, player.y, 2, basis);
        this.sprites.colC(glow, hexColor(weaponDefs[world.weapon].color), 0.3);
        if (player.dashT > 0)
          for (let i = 0; i < 3; i++)
            this.emit(
              player.x + (Math.random() - 0.5) * 0.4,
              0.6,
              player.y + (Math.random() - 0.5) * 0.4,
              -player.vx * 0.1,
              0,
              -player.vy * 0.1,
              0.25,
              0.7,
              hexColor(8386303),
              { drag: 4 },
            );
        else if (player.moving && Math.random() < dt * 30) {
          let ex = player.x - Math.cos(player.face) * 0.55,
            ez = player.y - Math.sin(player.face) * 0.55;
          this.emit(
            ex,
            0.45,
            ez,
            -Math.cos(player.face) * 2,
            0.2,
            -Math.sin(player.face) * 2,
            0.25,
            0.35,
            hexColor(weaponDefs[world.weapon].color),
            {
              drag: 3,
            },
          );
        }
        let count = world.stats.orbit;
        for (let i = 0; i < count; i++) {
          let angle = world.time * 3.3 + (i * TAU) / count,
            bx = player.x + Math.cos(angle) * world.stats.orbitR,
            bz = player.y + Math.sin(angle) * world.stats.orbitR,
            blade = this.blades.y(bx, 0, bz, angle + Math.PI / 2, 1.2 * world.stats.bladeScale);
          this.blades.colHex(blade, 10483967);
          let halo = this.sprites.bb(bx, 0.62, bz, 1.1, basis);
          this.sprites.colHex(halo, 4846335, 0.55);
        }
        for (let wing of player.wings) {
          this.wing.y(wing.x, Math.sin(time * 4 + wing.x) * 0.1, wing.y, player.aim, 1.3);
          let halo = this.sprites.bb(wing.x, 0.9, wing.y, 1, basis);
          this.sprites.colHex(halo, 4846335, 0.5);
          this.shadows.y(wing.x, 0.02, wing.y, 0, 0.9);
        }
      }
      let boss = null;
      for (let enemy of world.enemies) {
        if (enemy.boss) {
          boss = enemy;
          continue;
        }
        let pools = this.enemyPools[enemy.type];
        if (!pools) continue;
        let grow = enemy.spawnT > 0 ? 1 - enemy.spawnT / 0.35 : 1,
          scale = (enemy.r / enemyDefs[enemy.type].r) * easeOutBack(clamp(grow, 0, 1)),
          scaleY = scale,
          lift = 0;
        if (enemy.type === "bomber" && enemy.st === 1) {
          let pulse = 1 + Math.sin(time * 40) * 0.08;
          scale *= pulse;
          scaleY *= pulse;
        }
        if (enemy.type === "swarmer" || enemy.type === "mite") {
          lift = Math.sin(time * 9 + enemy.phase) * 0.06;
        }
        if (enemy.type === "hive") {
          scaleY *= 1 + Math.sin(time * 3 + enemy.phase) * 0.05;
        }
        if (enemy.type === "brute" && enemy.st === 1) {
          scaleY *= 0.9;
        }
        if (enemy.type === "mortar" && enemy.st === 1) {
          scaleY *= 0.88;
        }
        if (enemy.type === "striker" && enemy.st === 1) {
          let jitter = Math.floor(time * 30) % 2 ? 0.9 : 1.05;
          scale *= jitter;
        }
        if (enemy.flash > 0) {
          scale *= 1 + enemy.flash * 0.1;
          scaleY *= 1 - enemy.flash * 0.06;
        }
        let bodyIdx = pools.body.y(enemy.x, lift, enemy.y, enemy.face, scale, scaleY, scale);
        pools.body.flash(bodyIdx, enemy.flash > 0 ? enemy.flash : enemy.slowT > 0 ? 0.25 : 0);
        let tint = enemy.variant ? variantColors[enemy.variant] : null;
        if (enemy.slowT > 0) {
          pools.body.col(bodyIdx, 0.7, 0.9, 1.3);
        } else {
          if (enemy.corrode) {
            pools.body.col(bodyIdx, 0.9, 1.3, 0.6);
          } else {
            if (tint) {
              pools.body.col(bodyIdx, 0.55 + tint.r * 0.7, 0.55 + tint.g * 0.7, 0.55 + tint.b * 0.7);
            } else {
              if (enemy.elite) {
                pools.body.col(bodyIdx, 1.25, 1.05, 0.7);
              } else {
                pools.body.col(bodyIdx, 1, 1, 1);
              }
            }
          }
        }
        let glowIdx = pools.glow.y(enemy.x, lift, enemy.y, enemy.face, scale, scaleY, scale),
          glowK = 1;
        if ((enemy.type === "gunner" || enemy.type === "sniper") && enemy.st === 1) {
          glowK = 1.6 + Math.sin(time * 30) * 0.4;
        }
        if (enemy.type === "bomber" && enemy.st === 1) {
          glowK = 2;
        }
        pools.glow.colC(glowIdx, tint || (enemy.elite ? goldColor : pools.color), glowK);
        if (enemy.champion) {
          let ring = this.ringPool.y(enemy.x, 0.06, enemy.y, time * 1.5, 7);
          this.ringPool.colC(ring, goldColor, 0.18 + Math.sin(time * 4) * 0.06);
          let crown = this.ringPool.y(enemy.x, 1.6 + enemy.r, enemy.y, -time * 3, enemy.r * 0.8);
          this.ringPool.colC(crown, goldColor, 1);
        }
        if (enemy.rallyT > 0 && !enemy.champion && Math.random() < dt * 6) {
          this.emit(enemy.x, 0.3, enemy.y, 0, 1.5, 0, 0.35, 0.3, goldColor, { drag: 1 });
        }
        if (tint && Math.random() < dt * 5) {
          this.emit(
            enemy.x + (Math.random() - 0.5) * enemy.r,
            0.5,
            enemy.y + (Math.random() - 0.5) * enemy.r,
            0,
            1,
            0,
            0.4,
            0.25,
            tint,
            { drag: 1 },
          );
        }
        this.shadows.y(enemy.x, 0.02, enemy.y, 0, enemy.r * 2.8 * scale);
        let halo = this.sprites.bb(enemy.x, 0.35, enemy.y, enemy.r * (enemy.elite ? 4.4 : 3.4) * scale, basis);
        this.sprites.colC(halo, enemy.elite ? goldColor : pools.color, enemy.elite ? 0.3 : 0.2);
        if (enemy.burnT > 0 && Math.random() < dt * 14) {
          this.emit(
            enemy.x + (Math.random() - 0.5) * enemy.r,
            0.6,
            enemy.y + (Math.random() - 0.5) * enemy.r,
            0,
            1.8,
            0,
            0.35,
            0.35,
            hexColor(16742958),
            { drag: 1 },
          );
        }
        if (enemy.type === "sniper" && enemy.st === 1) {
          this.aimLine(world, enemy.x, enemy.y, enemy.ta, enemy.t2 < 0.35, 1 - enemy.t2 / 1.25);
        }
        if (enemy.type === "brute" && enemy.st === 1) {
          this.chargeLine(enemy.x, enemy.y, enemy.ta, 9.5, 1.7, 1 - enemy.t2 / 0.8);
        }
        if (enemy.type === "leaper" && enemy.st === 1) {
          this.chargeLine(enemy.x, enemy.y, enemy.ta, 7.5, 1.35, 1 - enemy.t2 / 0.55);
        }
        if (enemy.type === "bomber" && enemy.st === 1) {
          let k = 1 - enemy.t2 / 0.55,
            ring = this.ringPool.y(enemy.x, 0.05, enemy.y, 0, 2.6);
          this.ringPool.colC(ring, warnColor, 0.6 + Math.sin(time * 40) * 0.3);
          let disc = this.discs.y(enemy.x, 0.04, enemy.y, 0, 2.6 * k);
          this.discs.colC(disc, warnColor, 0.25);
        }
        if (enemy.type === "gunner" && enemy.st === 1) {
          let gx = enemy.x + Math.cos(enemy.face) * 0.95,
            gz = enemy.y + Math.sin(enemy.face) * 0.95,
            flare = this.sprites.bb(gx, 0.62, gz, 0.5 + (1 - enemy.t2 / 0.45) * 0.9, basis);
          this.sprites.colC(flare, pools.color, 1);
        }
        if (enemy.type === "turret" && enemy.st === 1) {
          this.aimLine(world, enemy.x, enemy.y, enemy.ta, enemy.t2 < 0.22, 1 - enemy.t2 / 0.62);
        }
        if (enemy.type === "bulwark") {
          let guardUp = enemy.guardDown <= 0,
            alpha = guardUp
              ? 0.35 +
                0.35 * clamp(enemy.guard / enemy.guardMax, 0, 1) +
                (enemy.guardFlash > 0 ? enemy.guardFlash * 0.6 : 0)
              : 0;
          if (guardUp) {
            let shield = this.shieldPool.y(
              enemy.x,
              0,
              enemy.y,
              enemy.face,
              ((enemy.r + 0.5) / 1.35) * scale,
              scale,
              ((enemy.r + 0.5) / 1.35) * scale,
            );
            this.shieldPool.colC(shield, pools.color, alpha);
          } else {
            if (Math.random() < dt * 20) {
              this.emit(
                enemy.x,
                1.2,
                enemy.y,
                (Math.random() - 0.5) * 3,
                1,
                (Math.random() - 0.5) * 3,
                0.3,
                0.25,
                pools.color,
                {
                  spark: true,
                },
              );
            }
          }
        }
        if (enemy.type === "striker" && enemy.st === 1) {
          let k = 1 - enemy.t2 / 0.7,
            ring = this.ringPool.y(enemy.tx, 0.05, enemy.ty, time * 4, 1.4 - k * 0.6);
          this.ringPool.colC(ring, pools.color, 0.6 + k * 0.6);
          let disc = this.discs.y(enemy.tx, 0.04, enemy.ty, 0, 0.9 * k);
          this.discs.colC(disc, pools.color, 0.25);
        }
        if (enemy.type === "striker" && enemy.st === 2) {
          this.chargeLine(enemy.x, enemy.y, enemy.ta, 4.2, 1, 1 - enemy.t2 / 0.32);
        }
        if (enemy.affix) {
          let color = hexColor(eliteAffixes[enemy.affix].color);
          if (enemy.affix === "shielded" && enemy.shield > 0) {
            let ring = this.ringPool.y(enemy.x, 0.9, enemy.y, time, enemy.r * 1.7 * scale);
            this.ringPool.colC(ring, color, 0.35 + 0.4 * (enemy.shield / enemy.shieldMax));
            let halo = this.sprites.bb(enemy.x, 0.8, enemy.y, enemy.r * 4.2 * scale, basis);
            this.sprites.colC(halo, color, 0.18);
          } else if (enemy.affix === "hasted" && Math.random() < dt * 25)
            this.emit(enemy.x, 0.5, enemy.y, -enemy.vx * 0.2, 0.2, -enemy.vy * 0.2, 0.3, enemy.r * 1.4, color, {
              drag: 2,
            });
          else if (enemy.affix === "volatile") {
            let ring = this.ringPool.y(enemy.x, 0.06, enemy.y, 0, enemy.r * 1.9);
            this.ringPool.colC(ring, color, 0.35 + Math.sin(time * 9 + enemy.phase) * 0.25);
          }
        }
      }
      this.drawBoss(dt, world, boss);
      let flameHot = hexColor(16765562),
        flameCool = hexColor(16734746);
      for (let shot of world.pb) {
        let def = weaponDefs[shot.w],
          color = hexColor(def.color),
          angle = Math.atan2(shot.vy, shot.vx);
        if (shot.drag) {
          let age = clamp(shot.age / 0.5, 0, 1),
            fade = 1 - age * 0.55,
            puff = this.sprites.bb(shot.x, 0.7 + age * 0.4, shot.y, shot.r * 4.6, basis, shot.id);
          this.sprites.col(
            puff,
            (flameHot.r + (flameCool.r - flameHot.r) * age) * fade,
            (flameHot.g + (flameCool.g - flameHot.g) * age) * fade * 0.8,
            (flameHot.b + (flameCool.b - flameHot.b) * age) * fade * 0.6,
          );
          if (age < 0.6) {
            let core = this.sprites.bb(shot.x, 0.72, shot.y, shot.r * 2.2, basis);
            this.sprites.col(core, 1, 0.92, 0.6 * (1 - age));
          }
          if (age > 0.6 && Math.random() < 0.08) {
            this.emit(shot.x, 1.1, shot.y, shot.vx * 0.2, 1.4, shot.vy * 0.2, 0.5, shot.r * 2.2, hexColor(3811876), {
              drag: 2,
              grow: 1,
            });
          }
          continue;
        }
        if (shot.boom) {
          shot.spin = (shot.spin || 0) + dt * 22;
          let disc = this.discPool.y(shot.x, 0.7, shot.y, shot.spin, shot.r, 1, shot.r);
          this.discPool.colC(disc, color, 1);
          let halo = this.sprites.bb(shot.x, 0.7, shot.y, shot.r * 5, basis);
          this.sprites.colC(halo, color, 0.55);
          continue;
        }
        let len = shot.r * (def.rail ? 9 : def.id === "rocket" ? 2.4 : 3.2),
          thick = shot.r * 0.9;
        if (shot.heavy && Math.random() < 0.5) {
          this.emit(shot.x, 0.75, shot.y, 0, 0, 0, 0.18, shot.r * 3, color, { drag: 0 });
        }
        if (shot.wing) {
          len = 0.5;
          thick = 0.1;
        }
        let core = this.pbCore.y(shot.x, 0.75, shot.y, angle, len, thick, thick);
        this.pbCore.col(core, 0.55 + color.r * 0.6, 0.55 + color.g * 0.6, 0.55 + color.b * 0.6);
        let halo = this.sprites.bb(shot.x, 0.75, shot.y, shot.r * (def.rail ? 7 : 6.5), basis);
        this.sprites.colC(halo, color, 0.75);
        if (def.id === "rocket" && Math.random() < (shot.bomblet ? 0.3 : 0.6)) {
          this.emit(
            shot.x - shot.vx * 0.02,
            0.75,
            shot.y - shot.vy * 0.02,
            -shot.vx * 0.05 + (Math.random() - 0.5),
            0.3,
            -shot.vy * 0.05 + (Math.random() - 0.5),
            0.35,
            shot.bomblet ? 0.25 : 0.4,
            hexColor(16752736),
            { drag: 3, grow: 1.5 },
          );
        }
        if (def.id === "tesla" && Math.random() < 0.3) {
          this.emit(shot.x, 0.75, shot.y, (Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3, 0.12, 0.3, color, {
            spark: true,
          });
        }
      }
      for (let trail of world.trails) {
        let puff = this.sprites.bb(trail.x, 0.3, trail.y, 1.3 * Math.min(1, trail.life), basis);
        this.sprites.colHex(puff, 8386303, 0.35 * Math.min(1, trail.life));
      }
      for (let shot of world.eb) {
        let color = enemyShotColors[shot.kind] || enemyShotColors.orb;
        if (shot.kind === "fast") {
          let angle = Math.atan2(shot.vy, shot.vx),
            core = this.ebCore.y(shot.x, 0.75, shot.y, angle, shot.r * 5, shot.r * 0.8, shot.r * 0.8);
          this.ebCore.col(core, 1, 0.75, 0.75);
        } else {
          let pulse = 1 + Math.sin(time * 14 + shot.x) * 0.08,
            core = this.ebCore.y(shot.x, 0.75, shot.y, 0, shot.r * 0.85 * pulse);
          this.ebCore.col(core, 1, 0.82 + color.g * 0.2, 0.9 + color.b * 0.1);
        }
        let halo = this.sprites.bb(shot.x, 0.75, shot.y, shot.r * 7.5, basis);
        this.sprites.colC(halo, color, 0.95);
      }
      for (let pickup of world.pickups) {
        let lift = 0.45 + Math.sin(time * 4 + pickup.id) * 0.12;
        if (pickup.rain && pickup.t < 0.6) {
          lift += (0.6 - pickup.t) * 16;
          if (Math.random() < 0.5) {
            this.emit(pickup.x, lift + 0.4, pickup.y, 0, 2, 0, 0.25, 0.3, shardColors[1], { drag: 1 });
          }
        }
        if (pickup.rain && pickup.t >= 0.6 && !pickup.landed) {
          pickup.landed = true;
          this.ring(pickup.x, pickup.y, 0.2, 1.1, shardColors[1], 0.3);
        }
        if (pickup.kind === "shard") {
          let color = shardColors[pickup.v] || shardColors[1],
            scale = pickup.v >= 25 ? 1.8 : pickup.v >= 5 ? 1.35 : 1,
            shard = this.shardPool.y(pickup.x, lift, pickup.y, time * 3 + pickup.id, scale);
          this.shardPool.colC(shard, color, 1);
          let halo = this.sprites.bb(pickup.x, lift, pickup.y, 0.9 * scale, basis);
          this.sprites.colC(halo, color, 0.45);
        } else {
          if (pickup.t > 11 && !pickup.pull && Math.floor(time * (pickup.t > 13 ? 12 : 6)) % 2) continue;
          let cross = this.healPool.y(pickup.x, lift + 0.2, pickup.y, time * 2, 1);
          this.healPool.colC(cross, healColor, 1);
          let halo = this.sprites.bb(pickup.x, lift + 0.2, pickup.y, 1.6, basis);
          this.sprites.colC(halo, healColor, 0.5 + Math.sin(time * 6) * 0.15);
        }
      }
      this.drawFeatures(dt, world);
      for (let marker of world.markers) {
        let k = clamp(marker.t / marker.dur, 0, 1),
          color = marker.fake
            ? hexColor(9431295)
            : marker.elite
              ? goldColor
              : hexColor(enemyDefs[marker.type] ? enemyDefs[marker.type].color : 16777215),
          size = marker.fake ? 2.2 : 1.2 - k * 0.5,
          ring = this.ringPool.y(marker.x, 0.05, marker.y, time * 2, size);
        this.ringPool.colC(ring, color, 0.5 + k * 0.6);
        let disc = this.discs.y(marker.x, 0.04, marker.y, 0, size * 0.9);
        this.discs.colC(disc, color, 0.12 + k * 0.2);
        if (!marker.fake) {
          let column = this.columns.y(marker.x, 0, marker.y, 0, 0.55 + k * 0.25, 2 + k * 5, 0.55 + k * 0.25);
          this.columns.colC(column, color, 0.25 + k * 0.45);
        }
        if (Math.random() < dt * 20) {
          this.emit(
            marker.x + (Math.random() - 0.5) * size,
            0.1,
            marker.y + (Math.random() - 0.5) * size,
            0,
            3 + Math.random() * 3,
            0,
            0.4,
            0.3,
            color,
            { drag: 0 },
          );
        }
      }
      for (let hazard of world.hazards) {
        let k = clamp(hazard.t / hazard.delay, 0, 1);
        if (!hazard.done && hazard.sx != null) {
          let hx = hazard.sx + (hazard.x - hazard.sx) * k,
            hz = hazard.sy + (hazard.y - hazard.sy) * k,
            hy = 0.8 + Math.sin(Math.PI * k) * 7,
            core = this.ebCore.y(hx, hy, hz, 0, 0.26);
          this.ebCore.col(core, 1, 0.85, 0.6);
          let halo = this.sprites.bb(hx, hy, hz, 1.6, basis);
          this.sprites.colHex(halo, 16752957, 0.9);
          if (Math.random() < 0.5) {
            this.emit(hx, hy, hz, 0, 0, 0, 0.3, 0.35, hexColor(6965808), { drag: 1, grow: 1.2 });
          }
        }
        if (!hazard.done) {
          let ring = this.ringPool.y(hazard.x, 0.05, hazard.y, 0, hazard.r);
          this.ringPool.colC(ring, warnColor, 0.55 + Math.sin(time * 25) * 0.25 * k);
          let disc = this.discs.y(hazard.x, 0.04, hazard.y, 0, hazard.r * k);
          this.discs.colC(disc, warnColor, 0.18 + k * 0.12);
          if (this.contrast) {
            let inner = this.ringPool.y(hazard.x, 0.05, hazard.y, 0, hazard.r * 0.55);
            this.ringPool.colC(inner, warnColor, 0.7);
          }
        }
      }
      for (let beam of world.beams) {
        let len = beam.cur || beam.len,
          ex = beam.x + Math.cos(beam.a) * len,
          ez = beam.y + Math.sin(beam.a) * len;
        if (beam.live) {
          // 2.4.6: a beam can bring its own colour (Frost Prism: ice); Clear warnings keeps yellow
          let flicker = 0.85 + Math.random() * 0.3,
            outer = this.beams.seg(beam.x, beam.y, ex, ez, 1, beam.w * flicker, beam.w * 0.6),
            beamCol = beam.color && !this.contrast ? hexColor(beam.color) : beamColor;
          this.beams.colC(outer, beamCol, 0.8);
          let inner = this.beams.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.35, beam.w * 0.3);
          this.beams.colC(inner, whiteColor, 1);
          if (Math.random() < 0.5) {
            let along = Math.random() * len;
            this.emit(
              beam.x + Math.cos(beam.a) * along,
              1,
              beam.y + Math.sin(beam.a) * along,
              (Math.random() - 0.5) * 4,
              2,
              (Math.random() - 0.5) * 4,
              0.3,
              0.4,
              beam.color ? beamCol : hexColor(16732064),
            );
          }
        } else {
          let k = clamp(beam.t / beam.warn, 0, 1),
            edge = this.beams.seg(beam.x, beam.y, ex, ez, 0.3, 0.06 + k * 0.08, 0.04);
          this.beams.colC(edge, warnColor, 0.5 + (Math.floor(time * 16) % 2) * 0.4);
          let fill = this.beams.seg(beam.x, beam.y, ex, ez, 0.08, beam.w * k, 0.02);
          this.beams.colC(fill, warnColor, 0.18);
        }
      }
    }
    drawFeatures(dt, world) {
      let arena = world.arena,
        time = this.time,
        basis = this.B,
        ventCol = hexColor(16734746),
        ventWarnCol = hexColor(16756816);
      for (let vent of arena.vents) {
        let state = world.state === "fight" ? arena.ventState(vent, world.waveT) : "idle",
          cycle = (world.waveT + vent.phase) % vent.period,
          warnStart = vent.period - 2.7,
          disc = this.discs.y(vent.x, 0.03, vent.y, 0, vent.r),
          ring = this.ringPool.y(vent.x, 0.05, vent.y, 0, vent.r);
        if (state === "idle") {
          this.discs.colC(disc, ventCol, 0.1 + Math.sin(time * 2 + vent.phase) * 0.03);
          this.ringPool.colC(ring, ventCol, 0.35);
        } else if (state === "warn") {
          let k = clamp((cycle - warnStart) / 1.2, 0, 1);
          this.discs.colC(disc, ventWarnCol, 0.2 + k * 0.35 + Math.sin(time * 30) * 0.08 * k);
          this.ringPool.colC(ring, this.contrast ? warnColor : ventWarnCol, 0.6 + k * 0.5);
          if (Math.random() < dt * 18) {
            this.emit(
              vent.x + (Math.random() - 0.5) * vent.r,
              0.1,
              vent.y + (Math.random() - 0.5) * vent.r,
              0,
              1.5 + k * 2,
              0,
              0.4,
              0.25,
              ventWarnCol,
              { drag: 1 },
            );
          }
        } else {
          this.discs.colC(disc, ventWarnCol, 0.75);
          this.ringPool.colC(ring, whiteColor, 0.8);
          let column = this.columns.y(vent.x, 0, vent.y, 0, vent.r * 0.8, 3.2, vent.r * 0.8);
          this.columns.colC(column, ventCol, 0.9);
          if (Math.random() < dt * 40) {
            this.emit(
              vent.x + (Math.random() - 0.5) * vent.r * 1.4,
              0.3,
              vent.y + (Math.random() - 0.5) * vent.r * 1.4,
              (Math.random() - 0.5) * 2,
              4 + Math.random() * 4,
              (Math.random() - 0.5) * 2,
              0.6,
              0.5,
              ventCol,
              { drag: 1.5, grav: 6, grow: 0.6 },
            );
          }
        }
      }
      let iceCol = hexColor(12580095);
      for (let patch of arena.ice) {
        let disc = this.discs.y(patch.x, 0.02, patch.y, 0, patch.r);
        this.discs.colC(disc, iceCol, 0.09);
        let ring = this.ringPool.y(patch.x, 0.03, patch.y, 0, patch.r);
        this.ringPool.colC(ring, iceCol, 0.22);
        if (Math.random() < dt * 3 * patch.r) {
          let angle = Math.random() * TAU,
            dist = Math.random() * patch.r;
          this.emit(
            patch.x + Math.cos(angle) * dist,
            0.08,
            patch.y + Math.sin(angle) * dist,
            0,
            0.3,
            0,
            0.5,
            0.18,
            whiteColor,
            {
              spark: true,
              drag: 0,
            },
          );
        }
      }
      let acidCol = hexColor(11861821),
        // 2.5.0: the player's own Acid Coating puddles are cyan, so they never read as a threat
        mineCol = hexColor(0x4de8ff);
      for (let puddle of arena.acid) {
        let color = puddle.mine ? mineCol : acidCol,
          fade = puddle.life != null ? Math.min(1, puddle.life / 1.2) : 1,
          disc = this.discs.y(puddle.x, 0.025, puddle.y, 0, puddle.r);
        this.discs.colC(disc, color, (0.16 + Math.sin(time * 2 + puddle.x) * 0.03) * fade);
        let ring = this.ringPool.y(puddle.x, 0.03, puddle.y, 0, puddle.r);
        this.ringPool.colC(ring, color, 0.35 * fade);
        if (Math.random() < dt * 2.5 * puddle.r) {
          let angle = Math.random() * TAU,
            dist = Math.random() * puddle.r;
          this.emit(
            puddle.x + Math.cos(angle) * dist,
            0.1,
            puddle.y + Math.sin(angle) * dist,
            0,
            0.8,
            0,
            0.7,
            0.25,
            color,
            {
              drag: 1,
              grow: 0.8,
            },
          );
        }
      }
      for (let portal of arena.portals)
        for (let [px, pz, color] of [
          [portal.ax, portal.ay, hexColor(16732120)],
          [portal.bx, portal.by, hexColor(8386303)],
        ]) {
          let ring = this.ringPool.y(px, 0.06, pz, time * 2.4, 1.05);
          this.ringPool.colC(ring, color, 0.9);
          let inner = this.ringPool.y(px, 0.07, pz, -time * 3.1, 0.7);
          this.ringPool.colC(inner, color, 0.6);
          let disc = this.discs.y(px, 0.03, pz, 0, 0.95);
          this.discs.colC(disc, color, 0.2 + Math.sin(time * 5) * 0.05);
          let column = this.columns.y(px, 0, pz, 0, 0.75, 1.6, 0.75);
          this.columns.colC(column, color, 0.35);
          let glow = this.sprites.bb(px, 0.4, pz, 2.2, basis);
          this.sprites.colC(glow, color, 0.35);
          if (Math.random() < dt * 14) {
            let angle = Math.random() * TAU;
            this.emit(
              px + Math.cos(angle) * 1,
              0.2,
              pz + Math.sin(angle) * 1,
              -Math.cos(angle) * 1.6,
              0.8,
              -Math.sin(angle) * 1.6,
              0.5,
              0.22,
              color,
              { drag: 0 },
            );
          }
        }
      // 2.5.0 C: Rift Storm (Void Core): the spots the portals jump to glow ahead of the jump — a
      // shrinking ring in the portal colour and a faint line from the old spot
      for (const portal of world.arena.portals) {
        const next = portal.next;
        if (!next) continue;
        const k = clamp((portal.moveIn || 0) / 1.6, 0, 1),
          blink = 0.45 + (Math.floor(time * 10) % 2) * 0.35;
        for (const [x, y, ox, oy, col] of [
          [next.ax, next.ay, portal.ax, portal.ay, hexColor(16732120)],
          [next.bx, next.by, portal.bx, portal.by, hexColor(8386303)],
        ]) {
          const ring = this.ringPool.y(x, 0.06, y, time * 3, 1.05 + k * 1.3);
          this.ringPool.colC(ring, col, blink);
          const inner = this.ringPool.y(x, 0.05, y, -time * 2, 0.6);
          this.ringPool.colC(inner, col, 0.5);
          const disc = this.discs.y(x, 0.03, y, 0, 1.05);
          this.discs.colC(disc, col, 0.12 + (1 - k) * 0.2);
          const line = this.beams.seg(ox, oy, x, y, 0.08, 0.05, 0.05);
          this.beams.colC(line, col, 0.18 + (1 - k) * 0.2);
        }
      }
    }
    aimLine(world, x, z, angle, locked, k) {
      let dist = 0.6,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      for (; dist < 32; ) {
        let px = x + cos * dist,
          pz = z + sin * dist;
        if (world.arena.outside(px, pz) || world.arena.blocked(px, pz, 0)) break;
        dist += 0.5;
      }
      let idx = this.beams.seg(
        x + cos * 0.6,
        z + sin * 0.6,
        x + cos * dist,
        z + sin * dist,
        0.95,
        locked ? 0.09 : 0.04,
        locked ? 0.09 : 0.04,
      );
      this.beams.colC(idx, warnColor, locked ? (Math.floor(this.time * 24) % 2 ? 1.2 : 0.6) : 0.25 + k * 0.4);
    }
    chargeLine(x, z, angle, len, width, k) {
      let ex = x + Math.cos(angle) * len,
        ez = z + Math.sin(angle) * len,
        track = this.beams.seg(x, z, ex, ez, 0.06, width, 0.02);
      this.beams.colC(track, warnColor, 0.12 + k * 0.2);
      let fill = this.beams.seg(x, z, x + Math.cos(angle) * len * k, z + Math.sin(angle) * len * k, 0.07, width, 0.02);
      this.beams.colC(fill, warnColor, 0.25);
    }
    drawBoss(dt, world, boss) {
      if (!boss) {
        if (this.bossView) {
          this.bossView.group.visible = false;
        }
        return;
      }
      if (!this.bossView || this.bossView.id !== boss.type) {
        if (this.bossView) {
          this.scene.remove(this.bossView.group);
          this.bossView.group.traverse((obj) => {
            if (obj.geometry) {
              obj.geometry.dispose();
            }
            if (obj.material) {
              [].concat(obj.material).forEach((mat) => mat.dispose());
            }
          });
        }
        let model = buildBossModel(boss.type, bossDefs[boss.type].color);
        model.id = boss.type;
        this.bossView = model;
        this.scene.add(model.group);
      }
      let view = this.bossView,
        group = view.group,
        time = this.time;
      group.visible = true;
      let grow = boss.spawnT > 0 ? clamp(1 - boss.spawnT / 1.2, 0, 1) : 1;
      if (this.focus) {
        grow = Math.max(grow, clamp((this.focusK - 0.15) / 0.45, 0, 1));
      }
      let scale = easeOutBack(grow);
      group.position.set(
        boss.x,
        boss.type === "prism" || boss.type === "queen" ? Math.sin(time * 1.6) * 0.2 : 0,
        boss.y,
      );
      group.scale.setScalar(Math.max(0.01, scale));
      group.rotation.y = -boss.face;
      for (let part of view.spin) part.m.rotation[part.ax] += part.v * dt * (boss.enraged ? 1.8 : 1);
      let flash = boss.flash;
      for (let mat of view.mats)
        mat.emissive.setRGB(flash * 0.8 + (boss.charging ? 0.25 : 0), flash * 0.8, flash * 0.8);
      view.glowMat.color.setHex(boss.enraged ? 16732120 : bossDefs[boss.type].color);
      if (boss.shielded) {
        view.glowMat.color.setHex(16777215);
      }
      let alpha = boss.ghost ? 0.12 : 1;
      // 2.4.6: a fade material can be translucent on its own (userData.opacity, Frost Prism ice)
      if (group.userData.fadeMats)
        for (let mat of group.userData.fadeMats) mat.opacity = alpha * (mat.userData.opacity ?? 1);
      view.glowMat.opacity = boss.ghost ? 0.15 : 1;
      this.shadows.y(boss.x, 0.02, boss.y, 0, boss.r * 3.4 * scale);
      let glow = this.sprites.bb(boss.x, 1.2, boss.y, boss.r * 5, this.B);
      this.sprites.colHex(glow, boss.enraged ? 16732120 : bossDefs[boss.type].color, 0.25);
      if (boss.shielded) {
        let ring = this.ringPool.y(boss.x, 0.1, boss.y, time, boss.r * 1.6);
        this.ringPool.colC(ring, whiteColor, 0.8);
      }
      // 2.4.6: cold mist drifts off the Frost Prism
      if (boss.type === "prism" && !boss.ghost && Math.random() < dt * 18) {
        this.emit(
          boss.x + (Math.random() - 0.5) * 2.6,
          1 + Math.random() * 2.4,
          boss.y + (Math.random() - 0.5) * 2.6,
          (Math.random() - 0.5) * 0.6,
          -0.5 - Math.random() * 0.6,
          (Math.random() - 0.5) * 0.6,
          1.1,
          0.3,
          hexColor(12578815),
          { drag: 0.5 },
        );
      }
      if (boss.type === "warden" && boss.st === "charge" && boss.sub === 0) {
        this.chargeLine(boss.x, boss.y, boss.ta, 12, 3.4, clamp(boss.subT / 0.85, 0, 1));
      }
      // 2.4.6: the Crucible's chimneys throw embers, more while it winds up or is enraged
      if (group.userData.chimneys && boss.spawnT <= 0) {
        const rate = (boss.enraged ? 20 : 11) * (boss.charging ? 2.2 : 1),
          cf = Math.cos(boss.face),
          sf = Math.sin(boss.face),
          ember = this._emberColor || (this._emberColor = hexColor(16752957));
        for (const [lx, ly, lz] of group.userData.chimneys) {
          if (Math.random() < dt * rate) {
            this.emit(
              boss.x + (lx * cf - lz * sf) * scale,
              ly * scale,
              boss.y + (lx * sf + lz * cf) * scale,
              (Math.random() - 0.5) * 1.4,
              2.6 + Math.random() * 2.2,
              (Math.random() - 0.5) * 1.4,
              0.8,
              0.28,
              ember,
              { drag: 1, grow: 1.3 },
            );
          }
        }
      }
    }
    drawParticles(dt) {
      let parts = this.P,
        basis = this.B,
        count = parts.n;
      for (let i = 0; i < count; i++) {
        parts.life[i] -= dt;
        if (parts.life[i] <= 0) {
          count--;
          if (i !== count) {
            parts.x[i] = parts.x[count];
            parts.y[i] = parts.y[count];
            parts.z[i] = parts.z[count];
            parts.vx[i] = parts.vx[count];
            parts.vy[i] = parts.vy[count];
            parts.vz[i] = parts.vz[count];
            parts.life[i] = parts.life[count];
            parts.max[i] = parts.max[count];
            parts.size[i] = parts.size[count];
            parts.grow[i] = parts.grow[count];
            parts.r[i] = parts.r[count];
            parts.g[i] = parts.g[count];
            parts.b[i] = parts.b[count];
            parts.drag[i] = parts.drag[count];
            parts.grav[i] = parts.grav[count];
            parts.spark[i] = parts.spark[count];
            i--;
          }
          continue;
        }
        let damp = 1 - Math.exp(-parts.drag[i] * dt);
        parts.vx[i] -= parts.vx[i] * damp;
        parts.vy[i] -= parts.vy[i] * damp + parts.grav[i] * dt;
        parts.vz[i] -= parts.vz[i] * damp;
        parts.x[i] += parts.vx[i] * dt;
        parts.y[i] += parts.vy[i] * dt;
        parts.z[i] += parts.vz[i] * dt;
        if (parts.y[i] < 0.05) {
          parts.y[i] = 0.05;
          parts.vy[i] *= -0.4;
        }
        let k = parts.life[i] / parts.max[i],
          size = parts.size[i] * (1 + parts.grow[i] * (1 - k)),
          pool = parts.spark[i] ? this.sparks : this.sprites,
          idx = pool.bb(
            parts.x[i],
            parts.y[i],
            parts.z[i],
            size * (parts.spark[i] ? 1 : 0.6 + 0.4 * k),
            basis,
            parts.spark[i] ? i : 0,
          );
        if (idx >= 0) {
          pool.col(idx, parts.r[i] * k, parts.g[i] * k, parts.b[i] * k);
        }
      }
      parts.n = count;
    }
    drawTransient(dt) {
      for (let line of this.lines) {
        line.life -= dt;
        let k = Math.max(0, line.life / line.max);
        if (line.jag) {
          let px = line.x1,
            pz = line.z1,
            dx = line.x2 - line.x1,
            dz = line.z2 - line.z1,
            len = Math.hypot(dx, dz) || 1,
            nx = -dz / len,
            nz = dx / len;
          for (let i = 1; i <= 4; i++) {
            let frac = i / 4,
              jitter = i < 4 ? (Math.random() - 0.5) * line.jag * 2 : 0,
              qx = line.x1 + dx * frac + nx * jitter,
              qz = line.z1 + dz * frac + nz * jitter,
              seg = this.beams.seg(px, pz, qx, qz, line.y, line.w, line.w);
            this.beams.colC(seg, line.col, k * 1.3);
            px = qx;
            pz = qz;
          }
        } else {
          let seg = this.beams.seg(line.x1, line.z1, line.x2, line.z2, line.y, line.w * k, line.w * k);
          this.beams.colC(seg, line.col, k);
        }
      }
      if (this.lines.length && this.lines.some((line) => line.life <= 0)) {
        this.lines = this.lines.filter((line) => line.life > 0);
      }
      for (let ring of this.rings) {
        ring.life -= dt;
        let k = Math.max(0, ring.life / ring.max),
          radius = ring.r1 + (ring.r0 - ring.r1) * k,
          idx = this.ringPool.y(ring.x, ring.y, ring.z, 0, radius);
        this.ringPool.colC(idx, ring.col, k);
      }
      if (this.rings.length && this.rings.some((ring) => ring.life <= 0)) {
        this.rings = this.rings.filter((ring) => ring.life > 0);
      }
    }
    project(x, y, z, out) {
      let ndc = this._v || (this._v = new Vector3());
      ndc.set(x, y, z).project(this.camera);
      out.x = (ndc.x * 0.5 + 0.5) * this.w;
      out.y = (-ndc.y * 0.5 + 0.5) * this.h;
      out.vis = ndc.z < 1 && ndc.x > -1.05 && ndc.x < 1.05 && ndc.y > -1.05 && ndc.y < 1.05;
      out.nx = ndc.x;
      out.ny = ndc.y;
      return out;
    }
    groundAt(sx, sy) {
      let caster = this._ray || (this._ray = new Raycaster()),
        ndc = this._nd || (this._nd = new Vector2());
      ndc.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
      caster.setFromCamera(ndc, this.camera);
      let origin = caster.ray.origin,
        dir = caster.ray.direction;
      if (Math.abs(dir.y) < 1e-4) return null;
      let dist = (0.75 - origin.y) / dir.y;
      return { x: origin.x + dir.x * dist, y: origin.z + dir.z * dist };
    }
    setAccess(contrast, reduceFlash) {
      this.contrast = !!contrast;
      warnColor.setHex(contrast ? 16773226 : 16728160);
      beamColor.setHex(contrast ? 16765498 : 16732064);
      this.flashK = reduceFlash ? 0.35 : 1;
    }
    resetCamera() {
      this.camInit = false;
      this.shake = 0;
    }
    focusOn(x, z) {
      this.focus = x == null ? null : { x, z };
      this.focusK = 0;
    }
  };
// 2.3.6: on landscape phones and tablets the home screen has two columns (title left, weapon
// card right). The drone preview is drawn at the screen centre, which is where the title ends,
// so the drone sat on the last letters of RIFTLINE. With two columns the view is now shifted so
// the drone shows in the larger free band of the title column, above or below the title
// (Renderer.updateCamera). `dirty` asks for a new measurement.
let homeViewSpot = null,
  dirty = true;
const measureHomeViewSpot = () => {
  const query = (sel) => document.querySelector(sel),
    brand = query("#home .brand"),
    panel = query("#home .home-panel"),
    top = query("#home .topbar"),
    nav = query("#home .bottom-nav");
  if (!brand || !panel || !top || !nav) return null;
  const brandBox = brand.getBoundingClientRect(),
    panelBox = panel.getBoundingClientRect();
  if (brandBox.width < 1 || panelBox.width < 1 || brandBox.right > panelBox.left) return null; // stacked: the centre is free
  const topEdge = top.getBoundingClientRect().bottom,
    navEdge = nav.getBoundingClientRect().top,
    above = brandBox.top - topEdge,
    below = navEdge - brandBox.bottom;
  return {
    x: (brandBox.left + brandBox.right) / 2,
    y: above > below ? brandBox.top - Math.min(above / 2, 100) : brandBox.bottom + Math.min(below / 2, 100),
  };
};
/** Asks the home screen drone view for a new measurement (the UI calls it when a screen is shown). */
function markHomeViewDirty() {
  dirty = true;
}
// the device classes (phone/tablet, portrait/landscape) settle up to 420 ms after a resize
const remeasureHomeView = () => {
  dirty = true;
  setTimeout(() => (dirty = true), 450);
};
addEventListener("resize", remeasureHomeView, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", remeasureHomeView, { passive: true });
}
if (document.fonts) {
  document.fonts.ready.then(() => (dirty = true));
}

// 2.5.0 C: biome events in the renderer (Whiteout fog and snow, see frame() and setBiome()).
const RL_WHITEOUT_FOG = [0.48, 1.5],
  RL_WHITEOUT_TINT = new Color(0x55707c),
  RL_WHITEOUT_SNOW = new Color(0xf2f8ff);

export { Renderer, hexColor, additiveMaterial, markHomeViewDirty };
