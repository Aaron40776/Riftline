// three.js r186 from npm (package.json). The game code still uses the short names of the
// original minified bundle; this import is the only place that says which is which.
import {
  AdditiveBlending as rs,
  BoxGeometry as Ct,
  BufferAttribute as Ke,
  BufferGeometry as Ge,
  CanvasTexture as Rr,
  CircleGeometry as Pr,
  Color as Ot,
  ConeGeometry as Ir,
  CylinderGeometry as ye,
  DirectionalLight as $r,
  DodecahedronGeometry as Lr,
  DoubleSide as fn,
  DynamicDrawUsage as ra,
  Euler as Mn,
  ExtrudeGeometry as Hr,
  Fog as _r,
  Group as rn,
  HemisphereLight as Xr,
  IcosahedronGeometry as ks,
  InstancedBufferAttribute as fi,
  InstancedMesh as Er,
  Matrix4 as de,
  Mesh as Gt,
  MeshBasicMaterial as Ie,
  MeshLambertMaterial as $e,
  Object3D as an,
  OctahedronGeometry as Qe,
  PerspectiveCamera as Je,
  PlaneGeometry as jn,
  PointLight as ss,
  Quaternion as mn,
  Raycaster as Zr,
  RingGeometry as Gr,
  Scene as br,
  ShaderMaterial as un,
  Shape as Fs,
  SphereGeometry as De,
  SRGBColorSpace as Ze,
  TetrahedronGeometry as Vr,
  TorusGeometry as Ve,
  UniformsLib as yt,
  UniformsUtils as El,
  Vector2 as ht,
  Vector3 as I,
  Vector4 as Re,
  WebGLRenderer as Il,
} from "three";
(() => {
  const RL_LOG_VERSION = __RL_VERSION__,
    nu = "riftline.log.v4";
  var Xn = [],
    ya = new Set(),
    Xi = {},
    RL_RT = {
      pointerdown: 0,
      pointermove: 0,
      pointerup: 0,
      pointercancel: 0,
      keydown: 0,
      keyup: 0,
      reset: 0,
      runStartMs: 0,
      runErrorSnapshot: null,
      orientationChanges: 0,
      buttonActivations: 0,
      lastButton: null,
      uiGuardDrops: 0,
    };
  var RL_TOUCH_CLICK_GUARD = { until: 0, x: 0, y: 0, key: "" };
  // 2.3.4: the input the player is using right now, so hints can say "W A S D" or "drag".
  // Starts from the primary pointer (coarse = touch screen) and follows the last real input.
  var RL_INPUT = { touch: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches };
  function rlUiClickKey(t) {
    if (!t) return "";
    if (t.id) return "id:" + t.id;
    const e = t.dataset || {};
    return e.buy
      ? "buy:" + e.buy
      : e.claim
        ? "claim:" + e.claim
        : e.go
          ? "go:" + e.go
          : t.hasAttribute && t.hasAttribute("data-back")
            ? "back"
            : "";
  }
  function iu() {
    try {
      globalThis.localStorage && localStorage.setItem(nu, JSON.stringify(Xn));
    } catch {}
  }
  try {
    let i = globalThis.localStorage && localStorage.getItem(nu);
    if (i) {
      let t = JSON.parse(i);
      Array.isArray(t) &&
        t.slice(-30).forEach((e) => {
          e && e.v === RL_LOG_VERSION && Xn.push(e);
        });
    }
  } catch {}
  try {
    if (globalThis.localStorage)
      for (let j = localStorage.length - 1; j >= 0; j--) {
        let q = localStorage.key(j);
        q && (q.startsWith("riftline.log.v2.") || q === "riftline.log.v3") && localStorage.removeItem(q);
      }
  } catch {}
  function Zl(i) {
    Xi = { ...Xi, ...i };
  }
  function ze(i, t) {
    let e = t && typeof t === "object" ? t : null,
      n = e && e.error ? e.error : e && e.reason ? e.reason : t,
      s = String((n && n.message) || (e && e.message) || n || "unknown").slice(0, 300),
      r = String((e && (e.filename || e.fileName || "")) || "").slice(0, 500),
      a = Number(e && (e.lineno || e.line || 0)) || 0,
      o = Number(e && (e.colno || e.column || 0)) || 0,
      c = String((n && n.stack) || "")
        .split(
          `
`,
        )
        .slice(0, 6)
        .join(
          `
`,
        )
        .slice(0, 1000),
      h = r ? `${r}:${a}:${o}` : "";
    if (h && s.endsWith("Script error.")) s += ` @ ${h}`;
    let l = new Date().toISOString(),
      u = Xn.find((d) => d.msg === s && d.where === i && d.file === r && d.line === a && d.col === o);
    if (u) (u.n++, (u.last = l));
    else {
      for (
        Xn.push({
          where: i,
          msg: s,
          stack: c,
          n: 1,
          first: l,
          last: l,
          v: Xi.version || RL_LOG_VERSION,
          file: r,
          line: a,
          col: o,
        });
        Xn.length > 30;
      )
        Xn.shift();
      typeof console < "u" && console.error("[riftline]", i, t);
    }
    iu();
    for (let d of ya)
      try {
        d();
      } catch {}
  }
  function su() {
    return Xn;
  }
  function ru(i) {
    return (ya.add(i), () => ya.delete(i));
  }
  function au() {
    ((Xn.length = 0), iu());
    for (let i of ya) i();
  }
  function tr() {
    let i = [
      "Riftline " + (Xi.version || RL_LOG_VERSION) + " " + (Xi.build || ""),
      "Mode: " + (Xi.mode || "?"),
      "UA: " + (typeof navigator < "u" ? navigator.userAgent : "node"),
      "Screen: " +
        (typeof window < "u" ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}` : "-"),
      "GPU: " + (Xi.gpu || "?"),
      "Time: " + new Date().toISOString(),
      "",
      rlHealthSummary(),
      "Health checks:",
    ];
    for (let h of RL_HEALTH) i.push(`[${h.status}] ${h.id}: ${h.detail}`);
    rlAuditReportLines(i);
    i.push(
      "",
      "Runtime: pointer " +
        RL_RT.pointerdown +
        "/" +
        RL_RT.pointermove +
        "/" +
        RL_RT.pointerup +
        "/" +
        RL_RT.pointercancel +
        " · keys " +
        RL_RT.keydown +
        "/" +
        RL_RT.keyup +
        " · buttons " +
        RL_RT.buttonActivations +
        " · rotates " +
        RL_RT.orientationChanges +
        (RL_RT.lastButton ? " · last " + RL_RT.lastButton : "") +
        " · ui-dedupes " +
        RL_RT.uiGuardDrops,
    );
    Xn.length || i.push("", "Errors: none recorded.");
    for (let t of Xn) {
      let e = t.file ? ` @ ${t.file}:${t.line || 0}:${t.col || 0}` : "";
      (i.push(`[${t.where}] ${t.msg}  (x${t.n}, v${t.v}${e}, first ${t.first}, last ${t.last})`),
        t.stack &&
          i.push(
            t.stack
              .split(
                `
`,
              )
              .map((n) => "    " + n.trim()).join(`
`),
          ));
    }
    return i.join(`
`);
  }
  var RL_REQUIRED_DOM = [
      "abandonBtn",
      "backupBtn",
      "bank",
      "banner",
      "bestLine",
      "bossBar",
      "bossFill",
      "bossLag",
      "bossName",
      "bossPhase",
      "bossTicks",
      "buffs",
      "buildStrip",
      "cards",
      "choose",
      "chooseEyebrow",
      "chooseHp",
      "chooseHpNum",
      "chooseTitle",
      "coach",
      "coachDots",
      "coachText",
      "combo",
      "comboBar",
      "comboN",
      "continueBtn",
      "crash",
      "crashCopy",
      "crashHome",
      "crashLog",
      "dashBtn",
      "dashSec",
      "dialog",
      "dlgBody",
      "dlgBtns",
      "dlgTitle",
      "endlessBtn",
      "flash",
      "homeBtn",
      "hpFill",
      "hpLag",
      "hpNum",
      "hud",
      "logBtn",
      "logCount",
      "msList",
      "novaBtn",
      "over",
      "overBest",
      "overCause",
      "overDmg",
      "overExtra",
      "overEyebrow",
      "overMs",
      "overStats",
      "overTitle",
      "pause",
      "pauseBtn",
      "pauseBuild",
      "pauseStats",
      "pauseTitle",
      "payRows",
      "payTotal",
      "playBtn",
      "qualityNote",
      "recBadge",
      "replayTutBtn",
      "rerollBtn",
      "rerollTxt",
      "resetBtn",
      "restartBtn",
      "restoreBtn",
      "resumeBtn",
      "retryBtn",
      "pauseSetBtn",
      "pauseUpInfo",
      "hudInfo",
      "setTimer",
      "setFps",
      "runShards",
      "setAssist",
      "setAuto",
      "setCalm",
      "setContrast",
      "setMusic",
      "setNumbers",
      "setQuality",
      "setSfx",
      "setShake",
      "setSwap",
      "setZoom",
      "settings",
      "shardChip",
      "shareBtn",
      "shieldPip",
      "statGrid",
      "storageWarn",
      "tDesc",
      "tName",
      "tNext",
      "tPrev",
      "toasts",
      "touch",
      "updateBar",
      "updateBtn",
      "verText",
      "vignette",
      "wBlurb",
      "wBuy",
      "wIndex",
      "wName",
      "wNext",
      "wPrev",
      "wStats",
      "waveLabel",
      "waveProg",
      "waveProgFill",
      "waveSub",
      "wsList",
    ],
    RL_HEALTH = [];
  function rlHealthAdd(i, t, e) {
    RL_HEALTH.push({ id: i, status: t, detail: String(e || "") });
  }
  var RL_SELFTEST = null;
  function rlSelfTest() {
    if (RL_SELFTEST && RL_SELFTEST.version === _a) return RL_SELFTEST;
    const selftestStarted = performance.now?.() || 0;
    let fail = [],
      warn = [],
      worlds = 0,
      waves = 0,
      weapons = 0,
      bosses = 0,
      det = 0,
      frames = 0,
      enemyTypes = 0,
      biomeCases = 0,
      threatCases = 0,
      upgradeChecks = 0,
      snapshotCases = 0,
      safePointCases = 0;
    const bad = (id, msg) => fail.push(`${id}: ${msg}`);
    const finite = (v) => Number.isFinite(v);
    try {
      const seeds = [0x13579bdf, 0x2468ace0, 0x10203040, 0x55667788, 0xa5a5a5a5];
      for (const seed of seeds) {
        const a = new Aa({ seed, weapon: "pulse", threat: 0, ws: {} }),
          b = new Aa({ seed, weapon: "pulse", threat: 0, ws: {} });
        for (let wave = 1; wave <= 20; wave++) {
          a.startWave(wave);
          b.startWave(wave);
          worlds++;
          waves++;
          if (a.arena.key !== b.arena.key || a.arena.W !== b.arena.W || a.arena.H !== b.arena.H)
            bad("determinism", `seed ${seed} wave ${wave} arena mismatch`);
          else det++;
          const currentBiome = a.biomeFor(wave)?.id,
            previousBiome = wave > 1 ? a.biomeFor(wave - 1)?.id : null;
          // 2.4.0: one biome per boss cycle — it changes right after each boss wave (5, 10, 15 …)
          if (wave > 1 && (currentBiome === previousBiome) !== ((wave - 1) % 5 !== 0))
            bad("biome-route", `biome must change exactly after boss waves (seed ${seed}, wave ${wave - 1}/${wave})`);
          if (a.event && (!$i[a.event] || a.event === "dark"))
            bad("events", `invalid/removed event ${a.event} at seed ${seed} wave ${wave}`);
          if (a.boss && a.event) bad("events", `boss wave received event ${a.event} at seed ${seed} wave ${wave}`);
          if (!Array.isArray(a.arena.obs)) bad("arena", `missing obstacle array at seed ${seed} wave ${wave}`);
          if (
            wave >= 2 &&
            !a.boss &&
            (!a.arena.director || !Number.isFinite(a.arena.director.obstacles) || a.arena.director.obstacles < 0)
          )
            bad("director", `missing dynamic wave director at seed ${seed} wave ${wave}`);
          const featureSets = { vents: a.arena.vents || [], ice: a.arena.ice || [], acid: a.arena.acid || [] };
          for (const [featureType, items] of Object.entries(featureSets))
            for (const q of items) {
              if (![q.x, q.y, q.r].every(finite))
                bad("features", `non-finite ${featureType} seed ${seed} wave ${wave}`);
              if (Eu(a.arena.obs, q.x, q.y, (q.r || 0) + 0.8))
                bad("features", `${featureType} overlaps obstacle at seed ${seed} wave ${wave}`);
            }
          const portals = a.arena.portals || [],
            portalPts = [];
          for (let pi = 0; pi < portals.length; pi++) {
            const q = portals[pi],
              pair = [
                { x: q.ax, y: q.ay },
                { x: q.bx, y: q.by },
              ];
            if (![q.ax, q.ay, q.bx, q.by].every(finite))
              bad("portal", `non-finite portal pair at seed ${seed} wave ${wave}`);
            const pairDist = Math.hypot(q.ax - q.bx, q.ay - q.by);
            if (finite(pairDist) && pairDist < 7.0)
              bad("portal", `portal pair too close (${pairDist.toFixed(2)}) at seed ${seed} wave ${wave}`);
            for (const p of pair) {
              if (![p.x, p.y].every(finite) || Eu(a.arena.obs, p.x, p.y, 1.5))
                bad("portal", `invalid portal endpoint at seed ${seed} wave ${wave}`);
              if (Math.abs(p.x) > a.arena.W - 3.6 || Math.abs(p.y) > a.arena.H - 3.6)
                bad("portal", `portal endpoint out of safe bounds at seed ${seed} wave ${wave}`);
              for (const prev of portalPts) {
                const d = Math.hypot(p.x - prev.x, p.y - prev.y);
                if (d < 4.0)
                  bad("portal", `portal endpoints overlap/cluster (${d.toFixed(2)}) at seed ${seed} wave ${wave}`);
              }
              portalPts.push(p);
            }
          }
          const spawnProbeRng = qi(Yi(seed + ":spawn-probe:" + wave));
          for (const [clearance, dist] of [
            [7, 1],
            [9, 1.6],
            [3, 0.4],
          ]) {
            const p = a.arena.freePoint(spawnProbeRng, a.player.x, a.player.y, clearance, dist);
            if (
              !p ||
              !finite(p.x) ||
              !finite(p.y) ||
              a.arena.blocked(p.x, p.y, dist + 0.4) ||
              a.arena.featureBlocked(p.x, p.y, dist * 0.3)
            )
              bad("spawn-safe", `freePoint failed at seed ${seed} wave ${wave}`);
          }
          const helperRng = qi(Yi(seed + ":safe-point-probe:" + wave));
          for (const [minD, maxD] of [
            [2, 6],
            [4, 10],
            [1.5, 5],
          ]) {
            const p = xu({ rng: helperRng, arena: a.arena }, a.player.x, a.player.y, minD, maxD);
            if (
              p &&
              (!finite(p.x) ||
                !finite(p.y) ||
                a.arena.outside(p.x, p.y, 2) ||
                a.arena.blocked(p.x, p.y, 2) ||
                a.arena.featureBlocked(p.x, p.y, 0.6))
            )
              bad("safe-point", `unsafe helper point seed ${seed} wave ${wave}`);
            else if (p) safePointCases++;
          }
        }
      }
      for (const b of ii)
        for (const seed of seeds) {
          const a = new Aa({ seed, weapon: "pulse", threat: 0, ws: {} });
          if (!a.route?.includes(b.id)) bad("biome-route", `seed ${seed} route is missing biome ${b.id}`);
        }
      for (const id of Object.keys(ue)) {
        const w = new Aa({ seed: 0x7f4a7c15, weapon: id, threat: 0, ws: {} });
        for (let f = 0; f < 12; f++) {
          w.step(1 / 60, {
            mx: 1,
            my: 0.15,
            aim: true,
            ax: 1,
            ay: 0.15,
            fire: true,
            assist: false,
            dash: f === 1,
            nova: f === 5,
          });
          frames++;
          if (![w.player.x, w.player.y, w.player.vx, w.player.vy, w.player.hp].every(finite))
            bad("weapon-runtime", `${id} produced non-finite player state`);
          for (const q of w.pb || [])
            if (![q.x, q.y, q.vx, q.vy, q.life].every(finite))
              bad("weapon-runtime", `${id} produced non-finite projectile state`);
        }
        weapons++;
      }
      for (const id of Kl) {
        const w = new Aa({ seed: 0x31415926, weapon: "pulse", threat: 0, ws: {} });
        w.startWave(uu[5] === id ? 5 : uu[10] === id ? 10 : uu[15] === id ? 15 : 20);
        const boss = w.spawnBoss(id);
        bosses++;
        if (!boss || !finite(boss.hp) || !finite(boss.x) || !finite(boss.y)) bad("boss-runtime", `${id} failed spawn`);
        for (let f = 0; f < 4; f++) {
          w.step(1 / 60, { mx: 0, my: 0, aim: true, ax: 1, ay: 0, fire: true, assist: false });
          frames++;
          if (!w.boss || !finite(w.boss.hp)) bad("boss-runtime", `${id} failed during step`);
        }
      }
      for (const id of Object.keys(Ae)) {
        const def = Ae[id],
          w = new Aa({
            seed: Yi("enemy-probe:" + id),
            weapon: "pulse",
            threat: Math.min(5, Math.floor((def.from || 1) / 5)),
            ws: {},
          });
        w.startWave(Math.max(1, Math.min(50, def.from || 1)));
        const p = w.arena.freePoint(qi(Yi("enemy-spawn:" + id)), w.player.x, w.player.y, 6, 0.45);
        if (!p || !finite(p.x) || !finite(p.y)) bad("enemy-spawn", `${id} has no safe spawn point`);
        else {
          const q = w.spawnEnemy(id, p.x, p.y);
          if (!q || q.type !== id) bad("enemy-spawn", `${id} failed direct spawn`);
          else {
            q.t = 0;
            for (let f = 0; f < 60; f++) {
              w.step(1 / 60, { mx: 0.15, my: 0.05, aim: true, ax: 1, ay: 0.05, fire: true, assist: false });
              frames++;
              if (![q.x, q.y, q.vx, q.vy, q.hp, q.t, q.t2].every(finite))
                bad("enemy-runtime", `${id} produced non-finite state at frame ${f}`);
            }
            enemyTypes++;
          }
        }
      }
      for (const b of ii) {
        for (const seed of [0x10101, 0x20202, 0x30303]) {
          const a = new Aa({ seed, weapon: "pulse", threat: 2, ws: {} }),
            idx = a.route.indexOf(b.id),
            w = 1 + 5 * idx; // 2.4.0: first wave of that biome's boss cycle
          a.startWave(w);
          if (a.arena.biome?.id !== b.id)
            bad("biome-runtime", `route for seed ${seed} did not resolve ${b.id} at wave ${w}`);
          const p = a.arena.freePoint(qi(Yi(seed + ":" + b.id)), a.player.x, a.player.y, 4, 0.45);
          if (!p || a.arena.blocked(p.x, p.y, 0.85)) bad("biome-runtime", `unsafe spawn space in ${b.id} seed ${seed}`);
          biomeCases++;
        }
      }
      for (let threat = 0; threat <= 5; threat++)
        for (const seed of [0x4141, 0x5151]) {
          const w = new Aa({ seed, weapon: "pulse", threat, ws: {} });
          for (let wave = 1; wave <= 12; wave++) {
            w.startWave(wave);
            for (let f = 0; f < 8; f++) {
              w.step(1 / 60, {
                mx: f % 2 ? 0.4 : 0,
                my: f % 3 ? 0.2 : 0,
                aim: true,
                ax: 1,
                ay: 0,
                fire: true,
                assist: false,
                dash: f === 3,
                nova: f === 6,
              });
              frames++;
              if (![w.player.x, w.player.y, w.player.hp, w.time, w.kills, w.shards].every(finite))
                bad("threat-runtime", `Threat ${threat} wave ${wave} became non-finite`);
            }
          }
          threatCases++;
        }
      {
        const base = nr("pulse", {}, {}),
          boost = nr("pulse", { overclock: 3 }, {});
        if (!(boost.rateMul > base.rateMul && boost.velMul > base.velMul))
          bad("upgrade-runtime", "Overclock Matrix does not alter rate and velocity");
        else upgradeChecks++;
        for (const def of Zi) {
          const testUp = {};
          testUp[def.id] = 1;
          const stats = nr(def.weapon || "pulse", testUp, {
            hull: 1,
            power: 1,
            thrust: 1,
            dash: 1,
            magnet: 1,
            salvage: 1,
            reroll: 1,
            nova: 1,
            insight: 1,
            revive: 1,
          });
          const finiteNumbers = Object.entries(stats)
            .filter(([k]) => k !== "weapon")
            .every(([, v]) => typeof v !== "number" || Number.isFinite(v));
          if (!finiteNumbers) bad("upgrade-runtime", `${def.id} produced non-finite stat`);
          else upgradeChecks++;
        }
        const w = new Aa({ seed: 0x1ce55eed, weapon: "pulse", threat: 0, ws: {} });
        w.startWave(13);
        w.stats = nr("pulse", { bounty: 2, capacitor: 2 }, {});
        const p = w.arena.freePoint(qi(Yi("upgrade-kill-probe")), w.player.x, w.player.y, 6, 0.45),
          enemy = p && w.spawnEnemy("turret", p.x, p.y, { elite: !0 });
        if (!enemy) bad("upgrade-runtime", "could not spawn elite turret probe");
        else {
          const shardBefore = w.pickups.filter((q) => q.kind === "shard").reduce((n, q) => n + (q.v || 0), 0),
            novaBefore = w.player.nova;
          w.killEnemy(enemy);
          const shardAfter = w.pickups.filter((q) => q.kind === "shard").reduce((n, q) => n + (q.v || 0), 0),
            novaAfter = w.player.nova;
          if (shardAfter - shardBefore < 4) bad("upgrade-runtime", "Bounty Protocol did not add its bonus shards");
          else upgradeChecks++;
          if (novaAfter - novaBefore < 43.4) bad("upgrade-runtime", "Capacitor Bank did not add its bonus Nova charge");
          else upgradeChecks++;
        }
      }
      {
        const director = new Aa({ seed: 0x5a17c0de, weapon: "rocket", threat: 2, ws: {} });
        let dynamic = 0,
          caches = 0;
        for (let wave = 2; wave <= 28; wave++) {
          director.startWave(wave);
          dynamic += Math.max(0, director.arena.obs.length - (director.arena.biome.obstacles?.length || 0));
          caches += director.pickups.filter((q) => q.cache).length;
          for (const q of director.arena.obs)
            if (![q.x, q.y].every(finite)) bad("director-runtime", `non-finite dynamic obstacle at wave ${wave}`);
          for (const k of ["vents", "ice", "acid", "portals"])
            for (const q of director.arena[k] || [])
              for (const v of Object.values(q))
                if (typeof v === "number" && !finite(v))
                  bad("director-runtime", `non-finite ${k} value at wave ${wave}`);
        }
        if (dynamic < 8) bad("director-runtime", `too few dynamic obstacle cases (${dynamic})`);
        else det++;
        if (caches < 12) bad("director-runtime", `too few wave caches (${caches})`);
        else det++;
      }
      {
        const a = new Aa({ seed: 0xdecafbad, weapon: "pulse", threat: 3, ws: {} });
        a.startWave(7);
        for (let f = 0; f < 20; f++) {
          a.step(1 / 60, { mx: 0.3, my: 0.1, aim: true, ax: 1, ay: 0, fire: true, assist: false, dash: f === 4 });
          frames++;
        }
        const snap = a.snapshot(),
          b = new Aa({ snap, ws: {} });
        if (
          b.wave !== a.wave ||
          b.seed !== a.seed ||
          b.weapon !== a.weapon ||
          b.hp !== a.hp ||
          JSON.stringify(b.up) !== JSON.stringify(a.up)
        )
          bad("snapshot", "extended snapshot roundtrip mismatch");
        else snapshotCases++;
      }
      const offerWorld = new Aa({ seed: 0xabcdef01, weapon: "pulse", threat: 0, ws: {} }),
        offer = offerWorld.makeOffer();
      if (!Array.isArray(offer) || offer.length < 1 || offer.some((id) => !ri[id]))
        bad("upgrade-offer", "invalid generated offer");
      else det++;
    } catch (e) {
      bad("selftest-exception", (e && e.message) || String(e));
    }
    RL_SELFTEST = {
      version: _a,
      ok: fail.length === 0,
      fail,
      warn,
      worlds,
      waves,
      weapons,
      bosses,
      det,
      frames,
      enemyTypes,
      biomeCases,
      threatCases,
      upgradeChecks,
      snapshotCases,
      safePointCases,
      ms: Math.max(0, Math.round((performance.now?.() || selftestStarted) - selftestStarted)),
    };
    return RL_SELFTEST;
  }
  var RL_LAST_RUN_AUDIT = null;
  /* ==========================================================================
   Riftline 2.2.3 diagnostics
   --------------------------------------------------------------------------
   rlRunAudit      final-state sanity of the world when a run ends (2.2.x checks)
   RL_MON          live run monitor: invariants, waves, events, snapshots, perf
   rlMonFinish     post-run audit = final state + monitor + save/economy checks
   rlRunHealth     fast health checks; the heavy simulation self-test only runs
                   on demand ({deep:true}) so startup and run end never block
                   the UI thread.
   ========================================================================== */
  function rlRunAudit(w, outcome, abandoned) {
    const fail = [],
      warn = [],
      finite = (v) => Number.isFinite(v),
      add = (id, msg) => fail.push(`${id}: ${msg}`),
      aw = (id, msg) => warn.push(`${id}: ${msg}`);
    try {
      if (!w) {
        add("world", "world missing");
        return (RL_LAST_RUN_AUDIT = { ok: false, fail, warn, checks: [], outcome: "missing" });
      }
      const arena = w.arena;
      if (!arena || !finite(arena.W) || !finite(arena.H) || !Array.isArray(arena.obs))
        add("arena", "invalid arena geometry");
      if (arena) {
        if (!arena.biome || !du[arena.biome.id]) add("biome", "unknown live biome");
        for (const enemy of w.enemies || [])
          if (!enemy?.type || !(Ae[enemy.type] || (enemy.boss && en[enemy.type])))
            add("enemy", "unknown live enemy type");
        const checkObj = (arr, id) => {
          if (!Array.isArray(arr)) return;
          for (const q of arr) {
            for (const k of ["x", "y"]) {
              if (k in q && !finite(q[k])) {
                add(id, `non-finite ${k}`);
                break;
              }
            }
            if ("r" in q && !finite(q.r)) add(id, "non-finite radius");
          }
        };
        checkObj(arena.obs, "obstacle");
        checkObj(arena.vents, "vent");
        checkObj(arena.ice, "ice");
        checkObj(arena.acid, "acid");
        const pts = [];
        for (const q of arena.portals || []) {
          if (![q.ax, q.ay, q.bx, q.by].every(finite)) {
            add("portal", "non-finite endpoint");
            continue;
          }
          const d = Math.hypot(q.ax - q.bx, q.ay - q.by);
          if (d < 7) add("portal", `pair distance ${d.toFixed(2)} < 7.00`);
          for (const p of [
            { x: q.ax, y: q.ay },
            { x: q.bx, y: q.by },
          ]) {
            if (Math.abs(p.x) > arena.W - 3.6 || Math.abs(p.y) > arena.H - 3.6)
              add("portal", "endpoint outside safe bounds");
            if (Eu(arena.obs, p.x, p.y, 1.5)) add("portal", "endpoint overlaps obstacle");
            for (const old of pts) {
              const dd = Math.hypot(p.x - old.x, p.y - old.y);
              if (dd < 4) add("portal", `endpoint spacing ${dd.toFixed(2)} < 4.00`);
            }
            pts.push(p);
          }
        }
      }
      const finiteState = (q, id) => {
        if (!q || typeof q !== "object") return;
        for (const k of ["x", "y", "vx", "vy", "hp", "life", "t"]) {
          if (k in q && !finite(q[k])) {
            add(id, `non-finite ${k}`);
            break;
          }
        }
      };
      for (const q of w.enemies || []) finiteState(q, "enemy");
      for (const q of w.pb || []) finiteState(q, "projectile");
      for (const q of w.eb || []) finiteState(q, "enemy-shot");
      for (const q of w.hazards || []) finiteState(q, "hazard");
      for (const q of w.markers || []) finiteState(q, "marker");
      for (const q of w.pickups || []) finiteState(q, "pickup");
      if (w.boss) finiteState(w.boss, "boss");
      const p = w.player;
      if (!p || ![p.x, p.y, p.vx, p.vy, p.hp].every(finite)) add("player", "non-finite final player state");
      if (!finite(w.time) || !finite(w.shards) || !finite(w.kills)) add("run-state", "non-finite run totals");
      if (!["dead", "victory"].includes(w.state) && !abandoned) aw("state", `run ended in state ${w.state}`);
      if (w.event && (!$i[w.event] || w.event === "dark")) add("event", "removed/invalid event reached at runtime");
    } catch (e) {
      add("audit-exception", (e && e.message) || String(e));
    }
    const a = {
      ok: fail.length === 0,
      fail,
      warn,
      checks: [],
      outcome: abandoned ? "abandoned" : outcome ? "victory" : "defeat",
      wave: w?.wave || 0,
      time: w?.time || 0,
      kills: w?.kills || 0,
      shards: w?.shards || 0,
    };
    RL_LAST_RUN_AUDIT = a;
    return a;
  }

  /* ---- event contract: every event the simulation emits must have a consumer
   (renderer, sound or UI) or be explicitly internal. Boss events must only be
   emitted while a boss is alive — enemy code once reused "phase"/"dash". ---- */
  var RL_EVENT_KINDS = new Set([
    "aim",
    "beamWarn",
    "blink",
    "blinkWarn",
    "block",
    "boom",
    "boss",
    "bossAtk",
    "bossDown",
    "bounce",
    "bountyPulse",
    "chain",
    "champion",
    "championDown",
    "charge",
    "chill",
    "cleared",
    "combo",
    "comboEnd",
    "dash",
    "dmg",
    "edash",
    "die",
    "enrage",
    "erupt",
    "eshot",
    "freeze",
    "fuse",
    "guardBreak",
    "guardUp",
    "hatch",
    "heal",
    "hurt",
    "kill",
    "lob",
    "mend",
    "mine",
    "nova",
    "novaReady",
    "offer",
    "phase",
    "pick",
    "ping",
    "pop",
    "portal",
    "reroll",
    "revive",
    "salvagePulse",
    "shard",
    "shieldBreak",
    "shieldPop",
    "shieldUp",
    "shot",
    "spark",
    "spawn",
    "supplyDrop",
    "thud",
    "victory",
    "warp",
    "wave",
    "wingShot",
    "zap",
  ]);
  var RL_BOSS_EVENTS = new Set(["phase", "enrage", "bossAtk"]);
  /* positional payload the renderer reads for each event (missing -> NaN geometry) */
  var RL_EVENT_FIELDS = {
    warp: ["x", "y", "tx", "ty"],
    kill: ["x", "y"],
    spawn: ["x", "y"],
    boom: ["x", "y", "r"],
    erupt: ["x", "y", "r"],
    edash: ["x", "y"],
    blink: ["x", "y"],
    heal: ["x", "y"],
    hurt: ["x", "y"],
    portal: ["x", "y"],
    dmg: ["x", "y"],
    chain: ["pts"],
  };
  function rlEventPayloadError(ev) {
    const f = Number.isFinite,
      need = RL_EVENT_FIELDS[ev.k];
    if (need)
      for (const q of need)
        if (q === "pts" ? !Array.isArray(ev.pts) || !ev.pts.every(f) : !f(ev[q])) return `"${ev.k}" is missing ${q}`;
    if (ev.k === "mend" && !(f(ev.x) && f(ev.y) && ((f(ev.tx) && f(ev.ty)) || f(ev.r))))
      return `"mend" needs a target (tx/ty) or a radius`;
    if ("x" in ev && !(f(ev.x) && f(ev.y))) return `"${ev.k}" has a non-finite position`;
    return "";
  }
  /* The sound engine has seven weapon voices; newer weapons borrow the closest one. */
  var RL_SFX_VOICES = ["pulse", "scatter", "tesla", "rail", "rocket", "disc", "flame"];
  function rlShotSfx(id) {
    const d = ue[id];
    if (!d) return "pulse";
    if (RL_SFX_VOICES.includes(id)) return id;
    if (d.rail) return "rail";
    if (d.boomerang) return "disc";
    if (d.burn || d.drag) return "flame";
    if (d.explode) return "rocket";
    if (d.chain) return "tesla";
    if (d.count >= 5 || d.cone) return "scatter";
    return "pulse";
  }

  var RL_MON = null;
  function rlMonErrKey(e) {
    return `${e.where}|${e.msg}|${e.file}|${e.line}`;
  }
  function rlMonStart(w, resume) {
    RL_MON = {
      w,
      resume: !!resume,
      t0: Date.now(),
      startWave: w.wave,
      weapon: w.weapon,
      threat: w.threat,
      errBase: new Map(Xn.map((e) => [rlMonErrKey(e), e.n])),
      inputBase: RL_RT.pointerdown + RL_RT.keydown,
      frames: 0,
      dtSum: 0,
      slow: 0,
      worst: 0,
      workSum: 0,
      lastT: 0,
      steps: 0,
      samples: 0,
      idleT: 0,
      issues: new Map(),
      waves: [],
      cur: null,
      events: 0,
      kinds: {},
      types: new Set(),
      peak: { enemies: 0, pb: 0, eb: 0, pickups: 0 },
      snaps: { checked: 0, ok: 0 },
      pendingSnap: 0,
      pendingSnapFrames: 0,
      shards: w.shards,
      kills: w.kills,
    };
    rlMonBeginWave(w);
    // Resumed at the upgrade choice (or continuing into endless): that wave is already won.
    if (w.state === "choose" || w.state === "victory") RL_MON.cur.cleared = true;
  }
  function rlMonIssue(sev, id, msg) {
    const m = RL_MON;
    if (!m) return;
    const k = sev + "|" + id + "|" + msg,
      q = m.issues.get(k);
    if (q) q.n++;
    else if (m.issues.size < 80) m.issues.set(k, { sev, id, msg, n: 1, wave: m.w?.wave || 0 });
  }
  function rlMonBeginWave(w) {
    const m = RL_MON;
    if (!m) return;
    if (m.cur && !m.cur.cleared && m.cur.wave !== w.wave)
      rlMonIssue("WARN", "waves", `wave ${m.cur.wave} was left without a clear`);
    m.cur = {
      wave: w.wave,
      biome: w.arena?.biome?.id || "?",
      mode: w.waveMode || "-",
      boss: !!(w.bossPending || w.boss),
      t0: w.time,
      cleared: false,
      secs: 0,
      planned: w.planTotal || 0,
    };
    m.waves.push(m.cur);
    // Spawn plan contract: every member must be {type, elite} with a known enemy type.
    for (const g of w.plan || []) {
      if (!g || !Array.isArray(g.members) || !Number.isFinite(g.gap)) {
        rlMonIssue("FAIL", "spawn-plan", `wave ${w.wave}: malformed spawn group`);
        continue;
      }
      for (const q of g.members)
        if (!q || typeof q !== "object" || !Ae[q.type])
          rlMonIssue("FAIL", "spawn-plan", `wave ${w.wave}: invalid plan member ${JSON.stringify(q)}`);
    }
    if (w.bossPending && !en[w.bossPending])
      rlMonIssue("FAIL", "spawn-plan", `wave ${w.wave}: unknown boss ${w.bossPending}`);
    if (w.championPending && !Ae[w.championPending])
      rlMonIssue("FAIL", "spawn-plan", `wave ${w.wave}: unknown champion ${w.championPending}`);
    for (const [k, v] of Object.entries(w.stats || {}))
      if (typeof v === "number" && !Number.isFinite(v))
        rlMonIssue("FAIL", "stats", `wave ${w.wave}: stat ${k} is not finite`);
    m.pendingSnap = w.wave;
    m.pendingSnapFrames = 0;
  }
  function rlMonStep(w, n0, dash0, sh0, k0, dt) {
    const m = RL_MON;
    m.steps++;
    const fx = w.fx;
    for (let i = n0; i < fx.length; i++) {
      const ev = fx[i],
        k = ev && ev.k;
      m.events++;
      m.kinds[k] = (m.kinds[k] || 0) + 1;
      if (!RL_EVENT_KINDS.has(k)) rlMonIssue("WARN", "events", `"${k}" has no consumer`);
      {
        const pe = rlEventPayloadError(ev);
        pe && rlMonIssue("FAIL", "events", pe);
      }
      if (RL_BOSS_EVENTS.has(k) && !w.boss)
        rlMonIssue("FAIL", "events", `boss event "${k}" emitted without an active boss`);
      if (k === "phase" && w.boss && w.boss.type !== "core")
        rlMonIssue("FAIL", "events", `"phase" emitted by ${w.boss.type}`);
      if (k === "dash" && w.player.dashId === dash0)
        rlMonIssue("FAIL", "events", `"dash" emitted although the player did not dash`);
      if (k === "spawn" || k === "boss") {
        const type = k === "boss" ? ev.id : ev.type,
          known = k === "boss" ? !!en[type] : !!Ae[type];
        if (!known) rlMonIssue("FAIL", "spawns", `unknown ${k} type ${type}`);
        else {
          m.types.add(type);
          if (k === "spawn" && oe && !oe.enemyPools[type])
            rlMonIssue("FAIL", "render", `no mesh pool for enemy ${type}`);
        }
      }
      if (k === "shot" && !ue[ev.w]) rlMonIssue("FAIL", "weapons", `shot from unknown weapon ${ev.w}`);
      if (k === "cleared" && m.cur) {
        m.cur.cleared = true;
        m.cur.secs = w.time - m.cur.t0;
        if (w.enemies.length || w.markers.length || w.planIdx < w.plan.length)
          rlMonIssue(
            "FAIL",
            "wave-end",
            `wave ${w.wave} cleared with ${w.enemies.length} enemies / ${w.markers.length} markers / ${w.plan.length - w.planIdx} groups left`,
          );
      }
    }
    if (w.shards < sh0) rlMonIssue("FAIL", "economy", "run shards decreased during a step");
    if (w.kills < k0) rlMonIssue("FAIL", "economy", "kill counter decreased during a step");
    // Soft-lock: nothing left to fight, but the wave does not end.
    const empty =
      w.state === "fight" &&
      w.planIdx >= w.plan.length &&
      !w.bossPending &&
      !w.championPending &&
      !w.enemies.length &&
      !w.markers.length;
    m.idleT = empty ? m.idleT + dt : 0;
    if (m.idleT > 4) rlMonIssue("FAIL", "wave-end", `wave ${w.wave} did not end although no enemies remain`);
    if (w.state === "fight" && m.cur && w.time - m.cur.t0 > 480)
      rlMonIssue("WARN", "waves", `wave ${w.wave} has lasted over 8 minutes`);
    if (m.steps % 20 === 0) rlMonSample(w);
  }
  function rlMonSample(w) {
    const m = RL_MON,
      f = Number.isFinite,
      p = w.player,
      A = w.arena;
    m.samples++;
    if (![p.x, p.y, p.vx, p.vy, p.hp, p.nova].every(f))
      rlMonIssue("FAIL", "invariants", "player state became non-finite");
    else {
      if (Math.abs(p.x) > A.W + 0.05 || Math.abs(p.y) > A.H + 0.05)
        rlMonIssue("FAIL", "invariants", "player left the arena bounds");
      if (p.hp > w.stats.maxHp + 0.5) rlMonIssue("FAIL", "invariants", "player HP above max HP");
      if (p.nova < 0 || p.nova > 100.01) rlMonIssue("FAIL", "invariants", "nova charge outside 0–100");
    }
    for (const e of w.enemies) {
      if (!(Ae[e.type] || (e.boss && en[e.type]))) {
        rlMonIssue("FAIL", "invariants", `live enemy with unknown type ${e.type}`);
        continue;
      }
      if (![e.x, e.y, e.hp, e.vx, e.vy].every(f)) {
        rlMonIssue("FAIL", "invariants", `${e.type} state became non-finite`);
        continue;
      }
      if (Math.abs(e.x) > A.W + 1.5 || Math.abs(e.y) > A.H + 1.5)
        rlMonIssue("WARN", "invariants", `${e.type} outside the arena`);
      if (!e.boss && !e.ghost && A.blocked(e.x, e.y, -Math.min(0.3, e.r * 0.5)))
        rlMonIssue("WARN", "invariants", `${e.type} inside a wall`);
    }
    for (const q of w.pb)
      if (!f(q.x) || !f(q.y)) {
        rlMonIssue("FAIL", "invariants", `projectile (${q.w}) became non-finite`);
        break;
      }
    for (const q of w.eb)
      if (!f(q.x) || !f(q.y)) {
        rlMonIssue("FAIL", "invariants", "enemy shot became non-finite");
        break;
      }
    if (![w.shards, w.kills, w.time].every(f)) rlMonIssue("FAIL", "invariants", "run totals became non-finite");
    const P = m.peak;
    P.enemies = Math.max(P.enemies, w.enemies.length);
    P.pb = Math.max(P.pb, w.pb.length);
    P.eb = Math.max(P.eb, w.eb.length);
    P.pickups = Math.max(P.pickups, w.pickups.length);
    if (w.pb.length > 420 || w.eb.length > 360) rlMonIssue("FAIL", "invariants", "projectile pool cap exceeded");
    if (w.enemies.length > 140) rlMonIssue("WARN", "invariants", `${w.enemies.length} enemies alive at once`);
    if (w.pickups.length > 320) rlMonIssue("WARN", "invariants", `${w.pickups.length} pickups alive at once`);
  }
  /* Called once per rendered frame while a run is active and visible. */
  function rlMonFrame(workMs) {
    const m = RL_MON;
    if (
      !m ||
      ft.world !== m.w ||
      ft.mode !== "game" ||
      ft.paused ||
      ft.chooseShown ||
      ft.overShown ||
      document.visibilityState === "hidden"
    ) {
      if (m) m.lastT = 0;
    } else {
      const now = performance.now();
      if (m.lastT) {
        const dt = now - m.lastT;
        if (dt < 1000) {
          m.frames++;
          m.dtSum += dt;
          dt > 50 && m.slow++;
          dt > m.worst && (m.worst = dt);
          m.workSum += workMs;
        }
      }
      m.lastT = now;
    }
    // What is drawn must be the wave's own biome and layout (no mixed palettes / stale walls).
    if (m && oe && ft.world === m.w && ft.mode === "game" && oe.biome && (m.frames & 15) === 0) {
      const A = m.w.arena;
      oe.biome.id !== A.biome.id &&
        rlMonIssue("FAIL", "render", `renderer shows biome ${oe.biome.id} during a ${A.biome.id} wave`);
      oe.arena.layKey !== A.key &&
        rlMonIssue("FAIL", "render", `renderer walls (${oe.arena.layKey}) differ from the wave layout (${A.key})`);
      oe.arena.biomeId !== A.biome.id &&
        rlMonIssue("FAIL", "render", `floor palette from ${oe.arena.biomeId} during a ${A.biome.id} wave`);
    }
    // 2.3.2: while the run is being played the HUD (HP, pause, touch buttons) must be
    // on screen — Endless used to leave it hidden. 1.5 s of grace for transitions.
    if (
      m &&
      ft.world === m.w &&
      ft.mode === "game" &&
      !ft.paused &&
      !ft.chooseShown &&
      !ft.overShown &&
      !["choose", "victory", "dead"].includes(m.w.state)
    ) {
      const hud = document.getElementById("hud");
      if (hud && (hud.hidden || hud.style.visibility === "hidden")) {
        const t = performance.now();
        m.hudOff || (m.hudOff = t);
        t - m.hudOff > 1500 &&
          rlMonIssue("FAIL", "hud", `HUD hidden during wave ${m.w.wave}${m.w.endless ? " (endless)" : ""}`);
      } else m.hudOff = 0;
    }
    // Every wave start writes a resumable snapshot; verify it with the real loader
    // (cheap sr() per wave; the full world restore runs once at the end of the run).
    if (m && m.pendingSnap && ft.world === m.w) {
      const run = ee.data.run;
      if (run && run.wave === m.pendingSnap) {
        m.snaps.checked++;
        const wave = m.pendingSnap;
        m.pendingSnap = 0;
        try {
          const s = sr(run);
          s
            ? (m.snaps.ok++, (m.lastSnap = s))
            : rlMonIssue("FAIL", "save", `wave ${wave} snapshot is rejected by the loader`);
        } catch (e) {
          rlMonIssue("FAIL", "save", `wave ${wave} snapshot check threw: ${e.message}`);
        }
      } else if (++m.pendingSnapFrames > 90) {
        rlMonIssue("FAIL", "save", `wave ${m.pendingSnap} snapshot was not written`);
        m.pendingSnap = 0;
      }
    }
  }
  function rlMonPreEnd(w) {
    const d = ee.data,
      s = d.stats;
    return {
      bank: d.shards,
      kills: s.kills,
      runs: s.runs,
      deaths: s.deaths,
      clears: s.clears,
      bestWave: s.bestWave,
      shards: w.shards,
      runKills: w.kills,
      threat: w.threat,
      salvage: d.workshop.salvage || 0,
      endless: !!w.endless,
      wave: w.wave,
    };
  }
  /* Builds the post-run audit: final state (rlRunAudit) + monitor + save/economy. */
  function rlMonFinish(w, pre, win, abandoned, silent, crashed) {
    const m = RL_MON && RL_MON.w === w ? RL_MON : null,
      fresh0 = !crashed && RL_LAST_RUN_AUDIT && RL_LAST_RUN_AUDIT.wave === w.wave && !RL_LAST_RUN_AUDIT.checks.length,
      base = fresh0 ? RL_LAST_RUN_AUDIT : rlRunAudit(w, win, abandoned);
    const checks = [],
      C = (st, id, msg) => checks.push({ st, id, msg });
    const issues = m ? [...m.issues.values()] : [],
      byId = (id) => issues.filter((q) => q.id === id);
    const fmt = (q) => `${q.msg}${q.n > 1 ? ` (×${q.n})` : ""}`;
    const group = (id, okMsg, ids = [id]) => {
      const qs = issues.filter((q) => ids.includes(q.id)),
        f = qs.filter((q) => q.sev === "FAIL"),
        wn = qs.filter((q) => q.sev === "WARN");
      C(
        f.length ? "FAIL" : wn.length ? "WARN" : "OK",
        id,
        f.length || wn.length
          ? [...f, ...wn].slice(0, 4).map(fmt).join(" | ") +
              (f.length + wn.length > 4 ? ` … +${f.length + wn.length - 4}` : "")
          : okMsg,
      );
    };
    if (crashed) C("FAIL", "crash", "the game loop crashed (3 consecutive frame errors)");
    // 1. runtime errors logged since the run started
    const fresh = m ? Xn.filter((e) => (m.errBase.get(rlMonErrKey(e)) || 0) < e.n) : [];
    C(
      fresh.length ? "FAIL" : "OK",
      "runtime-errors",
      fresh.length
        ? fresh
            .slice(0, 3)
            .map((e) => `[${e.where}] ${e.msg}`)
            .join(" | ")
        : "none during this run",
    );
    // 2. final world state
    C(
      base.fail.length ? "FAIL" : base.warn.length ? "WARN" : "OK",
      "final-state",
      base.fail.length || base.warn.length
        ? [...base.fail, ...base.warn].slice(0, 4).join(" | ")
        : "arena, entities and totals are finite and consistent",
    );
    if (m) {
      group(
        "invariants",
        `${m.samples} samples over ${m.steps} steps · peak ${m.peak.enemies} enemies / ${m.peak.pb}+${m.peak.eb} shots / ${m.peak.pickups} pickups`,
      );
      group("spawn-plan", `${m.waves.length} wave plan(s) valid`, ["spawn-plan", "stats"]);
      const done = m.waves.filter((q) => q.cleared),
        longest = done.reduce((a, q) => (q.secs > a.secs ? q : a), { secs: 0, wave: 0 });
      group(
        "waves",
        `${done.length}/${m.waves.length} cleared${done.length ? ` · avg ${Math.round(done.reduce((a, q) => a + q.secs, 0) / done.length)} s · longest ${Math.round(longest.secs)} s (wave ${longest.wave})` : ""}`,
        ["waves", "wave-end"],
      );
      group("spawns", `${m.types.size} enemy/boss types seen · all with meshes`, ["spawns", "render"]);
      group("events", `${m.events} events · ${Object.keys(m.kinds).length} kinds · all consumed`, [
        "events",
        "weapons",
      ]);
      group("economy", "shards and kills only increased", ["economy"]);
      group("hud", "HUD visible whenever a wave was being played");
      if (m.lastSnap)
        try {
          const s = m.lastSnap,
            t = new Aa({ snap: s, ws: ee.data.workshop });
          (t.wave !== s.wave || t.weapon !== s.weapon || JSON.stringify(t.up) !== JSON.stringify(s.up)) &&
            rlMonIssue("FAIL", "save", `wave ${s.wave} snapshot restores a different run`);
        } catch (e) {
          rlMonIssue("FAIL", "save", `wave ${m.lastSnap.wave} snapshot restore threw: ${e.message}`);
        }
      const sq = [...m.issues.values()].filter((q) => q.id === "save");
      C(
        sq.some((q) => q.sev === "FAIL") ? "FAIL" : m.snaps.checked ? "OK" : "WARN",
        "snapshots",
        sq.length
          ? sq.slice(0, 3).map(fmt).join(" | ")
          : m.snaps.checked
            ? `${m.snaps.ok}/${m.snaps.checked} wave snapshot(s) accepted by the loader · last one restored into a live world`
            : "no wave snapshot was verified",
      );
      const fps = m.dtSum > 0 ? m.frames / (m.dtSum / 1000) : 0,
        slowPct = m.frames ? (m.slow / m.frames) * 100 : 0;
      C(
        m.frames < 120 ? "INFO" : fps < 40 || slowPct > 5 ? "WARN" : "OK",
        "performance",
        m.frames
          ? `${fps.toFixed(0)} fps avg · ${m.slow} slow frame(s) >50 ms (${slowPct.toFixed(1)}%) · worst ${Math.round(m.worst)} ms · JS ${(m.workSum / m.frames).toFixed(1)} ms/frame`
          : "no frames measured",
      );
      const inp = RL_RT.pointerdown + RL_RT.keydown - m.inputBase;
      C(
        inp > 0 ? "OK" : "WARN",
        "input",
        inp > 0 ? `${inp} input event(s) during the run` : "no input events observed during this run",
      );
    } else C("WARN", "monitor", "run monitor was not attached (run started before diagnostics were ready)");
    if (!crashed) {
      // 3. payout, records and persistence after endRun() ran
      const d = ee.data,
        c = pre.shards,
        bonus = win ? Math.round(c * 0.25) : 0,
        expect = Math.round((c + bonus) * Ma(pre.threat).shards * (1 + 0.1 * pre.salvage)),
        got = d.shards - pre.bank;
      C(
        got === expect ? "OK" : "FAIL",
        "payout",
        got === expect ? `+${expect} shards credited` : `bank changed by ${got}, expected +${expect}`,
      );
      const s = d.stats,
        rec = [];
      s.kills - pre.kills !== pre.runKills && rec.push(`kills +${s.kills - pre.kills} (run had ${pre.runKills})`);
      s.bestWave < (win ? 20 : pre.wave) && rec.push(`best wave ${s.bestWave} < reached ${win ? 20 : pre.wave}`);
      win && !pre.endless && s.clears !== pre.clears + 1 && rec.push("clear not counted");
      !win && !abandoned && s.deaths !== pre.deaths + 1 && rec.push("death not counted");
      C(
        rec.length ? "FAIL" : "OK",
        "records",
        rec.length ? rec.join(" | ") : `kills +${pre.runKills} · best wave ${s.bestWave}`,
      );
      const per = [];
      d.run !== null && per.push("finished run is still stored as resumable");
      try {
        const r = ee.parse(JSON.stringify(d));
        r.ok || per.push("save does not round-trip");
      } catch (e) {
        per.push("save round-trip threw: " + e.message);
      }
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem(kh) || "null");
      } catch {}
      if (!ee.storageOk) C("WARN", "persistence", "storage is blocked — progress only lives in memory");
      else {
        (stored && stored.savedAt === d.savedAt && stored.shards === d.shards) ||
          per.push("localStorage does not match the in-memory save");
        C(
          per.length ? "FAIL" : "OK",
          "persistence",
          per.length ? per.join(" | ") : "run cleared · save round-trips · localStorage in sync",
        );
      }
    }
    const fail = checks.filter((q) => q.st === "FAIL").map((q) => `${q.id}: ${q.msg}`),
      warn = checks.filter((q) => q.st === "WARN").map((q) => `${q.id}: ${q.msg}`);
    const a = {
      ...base,
      ok: !fail.length,
      fail,
      warn,
      checks,
      outcome: crashed ? "crashed" : base.outcome,
      wave: w.wave,
      time: w.time,
      kills: w.kills,
      shards: w.shards,
      weapon: w.weapon,
      threat: w.threat,
      endScreen: null,
    };
    RL_LAST_RUN_AUDIT = a;
    RL_MON = null;
    if (!silent && !crashed) {
      // 4. end screen: visible, HUD hidden, every control reachable (checked two frames later)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          try {
            const over = document.getElementById("over"),
              hud = document.getElementById("hud"),
              la = window.__riftLayoutAudit?.(),
              probs = [];
            over.hidden && probs.push("run summary not shown");
            hud.hidden || probs.push("HUD still visible");
            la && !la.ok && probs.push(...la.findings.slice(0, 3));
            const st = probs.length ? "FAIL" : "OK";
            a.checks.push({
              st,
              id: "end-screen",
              msg: probs.length ? probs.join(" | ") : `${la ? la.checked : 0} controls reachable`,
            });
            if (probs.length) {
              a.ok = !1;
              a.fail.push("end-screen: " + probs.join(" | "));
            }
          } catch (e) {
            a.checks.push({ st: "WARN", id: "end-screen", msg: e.message });
          }
          a.fail.length &&
            Ft.toast(
              `Diagnostics: ${a.fail.length} problem${a.fail.length === 1 ? "" : "s"} in this run — Settings › Diagnostics`,
              "warn",
              6000,
            );
          rlRunHealth({ context: "post-run" }).catch((e) => ze("health", e));
        }),
      );
    } else rlRunHealth({ context: "post-run" }).catch((e) => ze("health", e));
    return a;
  }
  function rlMonCrashed() {
    try {
      const w = RL_MON && RL_MON.w;
      w && rlMonFinish(w, rlMonPreEnd(w), !1, !1, !0, !0);
    } catch {}
  }
  function rlAuditReportLines(out) {
    const a = RL_LAST_RUN_AUDIT;
    if (!a) return;
    const f = a.checks.filter((q) => q.st === "FAIL").length,
      w = a.checks.filter((q) => q.st === "WARN").length;
    out.push(
      "",
      `Post-run audit: ${String(a.outcome).toUpperCase()} · ${a.weapon ? ue[a.weapon]?.name + " · " : ""}wave ${a.wave} · ${va(a.time || 0)} · ${a.checks.length} checks · ${f} FAIL · ${w} WARN`,
    );
    for (const q of a.checks) out.push(`  [${q.st}]${" ".repeat(Math.max(1, 5 - q.st.length))}${q.id}: ${q.msg}`);
  }

  function rlUiButtonGuardSelfTest() {
    // Runs on a detached host: no document-level listeners fire, so the test
    // cannot unlock audio or pollute the runtime counters shown in the log.
    const host = document.createElement("div");
    host.setAttribute("data-rift-ui-test", "1");
    const fake = { sound: { play: () => {} }, store: { data: {} }, input: {} },
      ui = { g: fake };
    ui.click = Gl.prototype.click;
    let count = 0,
      steps = 0,
      pass = true;
    const drops = RL_RT.uiGuardDrops;
    const make = (key = "") => {
      const b = document.createElement("button");
      b.type = "button";
      key && (b.dataset.buy = key);
      host.appendChild(b);
      ui.click.call(ui, b, () => count++);
      return b;
    };
    const touch = (el, id, x, y, type = "touch") => {
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: id,
          pointerType: type,
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );
      el.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: id,
          pointerType: type,
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );
    };
    const click = (el, x, y) =>
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1, clientX: x, clientY: y }));
    try {
      RL_TOUCH_CLICK_GUARD.until = 0;
      RL_TOUCH_CLICK_GUARD.key = "";
      // 1. DOM replacement after a touch must not create a second activation.
      let b = make("touch-test");
      touch(b, 41, 12, 12);
      host.replaceChildren();
      b = make("touch-test");
      click(b, 12, 12);
      if (count !== 1) pass = false;
      steps++;
      // 2. A later deliberate click remains available.
      click(b, 12, 12);
      if (count !== 2) pass = false;
      steps++;
      // 3. Pointer-id mismatch must not activate; the matching pointer does, and its ghost click is dropped.
      b = make();
      b.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 50,
          pointerType: "pen",
          isPrimary: true,
          clientX: 4,
          clientY: 4,
        }),
      );
      b.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 51,
          pointerType: "pen",
          isPrimary: false,
          clientX: 4,
          clientY: 4,
        }),
      );
      if (count !== 2) pass = false;
      b.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 50,
          pointerType: "pen",
          isPrimary: true,
          clientX: 4,
          clientY: 4,
        }),
      );
      click(b, 4, 4);
      if (count !== 3) pass = false;
      steps++;
      // 4. Pointer cancellation must not suppress the following ordinary click.
      b = make();
      b.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 60,
          pointerType: "touch",
          isPrimary: true,
          clientX: 8,
          clientY: 8,
        }),
      );
      b.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          pointerId: 60,
          pointerType: "touch",
          isPrimary: true,
          clientX: 8,
          clientY: 8,
        }),
      );
      b.dispatchEvent(new PointerEvent("click", { bubbles: true, detail: 1, clientX: 8, clientY: 8 }));
      if (count !== 4) pass = false;
      steps++;
      // 5. Secondary pointers cannot hijack the primary activation.
      b = make();
      b.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 70,
          pointerType: "touch",
          isPrimary: true,
          clientX: 10,
          clientY: 10,
        }),
      );
      b.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 71,
          pointerType: "touch",
          isPrimary: false,
          clientX: 10,
          clientY: 10,
        }),
      );
      b.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 70,
          pointerType: "touch",
          isPrimary: true,
          clientX: 10,
          clientY: 10,
        }),
      );
      b.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 71,
          pointerType: "touch",
          isPrimary: false,
          clientX: 10,
          clientY: 10,
        }),
      );
      click(b, 10, 10);
      if (count !== 5) pass = false;
      steps++;
      // 6. A button disabled between press and release must not arm a stale guard.
      b = make();
      b.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 75,
          pointerType: "touch",
          isPrimary: true,
          clientX: 90,
          clientY: 90,
        }),
      );
      b.disabled = true;
      b.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 75,
          pointerType: "touch",
          isPrimary: true,
          clientX: 90,
          clientY: 90,
        }),
      );
      b.disabled = false;
      click(b, 90, 90);
      if (count !== 6 || RL_TOUCH_CLICK_GUARD.until !== 0) pass = false;
      steps++;
      // 7. Ghost click after a screen change: a DIFFERENT button now under the finger must not fire
      //    (2.2.2 bug: tapping Home on the run summary started a new run via START RUN).
      const a = make("a");
      touch(a, 80, 100, 100);
      b = make("b");
      click(b, 100, 100);
      if (count !== 7) pass = false;
      steps++;
      // 8. A click far away from the last tap is a new, deliberate action.
      touch(a, 81, 100, 100);
      b = make("c");
      click(b, 300, 300);
      if (count !== 9) pass = false;
      steps++;
    } catch (e) {
      pass = false;
    }
    RL_TOUCH_CLICK_GUARD.until = 0;
    RL_TOUCH_CLICK_GUARD.key = "";
    RL_RT.uiGuardDrops = drops;
    host.remove();
    return { ok: pass, count, steps };
  }

  /* Health checks. Cheap by default; {deep:true} adds the simulation self-test.
   Concurrent calls share one run so the report never contains duplicates. */
  var RL_HEALTH_BUSY = null;
  function rlRunHealth(opts) {
    const o = typeof opts === "object" && opts ? opts : { context: opts || "startup" };
    if (RL_HEALTH_BUSY) {
      if (!o.deep) return RL_HEALTH_BUSY;
      return RL_HEALTH_BUSY.then(() => rlRunHealth(o));
    }
    RL_HEALTH_BUSY = rlRunHealthNow(o).finally(() => {
      RL_HEALTH_BUSY = null;
    });
    return RL_HEALTH_BUSY;
  }
  async function rlRunHealthNow({ context = "startup", deep = false } = {}) {
    RL_HEALTH = [];
    let ok = (i, e, n) => rlHealthAdd(i, e ? "OK" : "FAIL", n),
      warn = (i, n) => rlHealthAdd(i, "WARN", n),
      info = (i, n) => rlHealthAdd(i, "INFO", n);
    info("context", `${context}${deep ? " · deep" : ""} · ${new Date().toISOString()}`);
    try {
      ok(
        "version-bundle",
        _a === RL_LOG_VERSION && Xi.version === RL_LOG_VERSION,
        `JS ${_a} · logger ${RL_LOG_VERSION} · runtime ${Xi.version || "?"}`,
      );
    } catch (e) {
      rlHealthAdd("version-bundle", "FAIL", e.message);
    }
    try {
      let meta = document.querySelector('meta[name="riftline-version"]')?.content || "?",
        buildMeta = document.querySelector('meta[name="riftline-build"]')?.content || "?",
        scripts = [...document.scripts].map((e) => e.src || e.getAttribute("src") || "").filter(Boolean),
        gameSrc = scripts.find((e) => /game-v/i.test(e)) || "",
        file = gameSrc.split("/").pop() || "";
      ok(
        "version-contract",
        meta === _a && file === `game-v${_a}-final.js` && buildMeta === Hh,
        `HTML ${meta} · JS ${_a} · script ${file || "?"} · build ${buildMeta}${buildMeta === Hh ? "" : " ≠ " + Hh}`,
      );
    } catch (e) {
      rlHealthAdd("version-contract", "FAIL", e.message);
    }
    try {
      let m = RL_REQUIRED_DOM.filter((e) => !document.getElementById(e));
      ok(
        "dom",
        m.length === 0,
        m.length
          ? `${m.length} missing: ${m.slice(0, 8).join(", ")}${m.length > 8 ? "…" : ""}`
          : `${RL_REQUIRED_DOM.length} required nodes present`,
      );
    } catch (e) {
      rlHealthAdd("dom", "FAIL", e.message);
    }
    try {
      let ids = [...document.querySelectorAll("[id]")].map((e) => e.id),
        dup = ids.filter((v, i) => ids.indexOf(v) !== i);
      ok(
        "dom-unique",
        dup.length === 0,
        dup.length ? `duplicate ids: ${[...new Set(dup)].join(", ")}` : `${ids.length} ids unique`,
      );
    } catch (e) {
      rlHealthAdd("dom-unique", "FAIL", e.message);
    }
    try {
      let c = document.getElementById("gl"),
        g = c && c.getContext && (c.getContext("webgl2") || c.getContext("webgl"));
      if (!!oe && !!g) rlHealthAdd("webgl", "OK", "renderer/context ready");
      else
        rlHealthAdd("webgl", "WARN", "WebGL unavailable; gameplay start is disabled but the menu remains interactive");
    } catch (e) {
      rlHealthAdd("webgl", "WARN", e.message || "WebGL check unavailable");
    }
    try {
      ok(
        "game-data",
        Object.keys(ue).length === En.length &&
          ii.length === 5 &&
          Object.keys(en).length === 4 &&
          Object.keys(Ae).length >= 25,
        `${Object.keys(ue).length} weapons (${En.length} selectable) · ${Object.keys(Ae).length} enemies · ${ii.length} biomes · ${Object.keys(en).length} bosses · ${Zi.length} upgrades · ${ai.length} modules`,
      );
    } catch (e) {
      rlHealthAdd("game-data", "FAIL", e.message);
    }
    try {
      const reqE = ["leaper", "turret", "charger", "minebot", "drone", "driller", "beacon", "weaver"],
        reqB = ["works", "vault", "void", "marsh"],
        reqU = [
          "overclock",
          "bounty",
          "capacitor",
          "caliber",
          "stabilizer",
          "hunter",
          "supply",
          "momentum",
          "laststand",
          "scavenger",
          "vector",
        ],
        badE = Object.keys(Ae).filter((id) => !Ae[id] || (!(Ae[id].from >= 1) && id !== "mite")),
        badEvo = Zi.filter((u) => u.evo && Object.keys(u.evo).some((k) => !ri[k])).map((u) => u.id),
        badWpn = Zi.filter((u) => u.weapon && !ue[u.weapon]).map((u) => u.id),
        miss = [
          ...reqE.filter((id) => !Ae[id]),
          ...reqB.filter((id) => !du[id]),
          ...reqU.filter((id) => !ri[id]),
          ...badE,
          ...badEvo,
          ...badWpn,
        ];
      ok(
        "content-contract",
        !miss.length,
        miss.length
          ? `problems: ${miss.join(", ")}`
          : "required content present · evolutions reference valid upgrades and weapons",
      );
    } catch (e) {
      rlHealthAdd("content-contract", "FAIL", e.message);
    }
    try {
      const noPool = oe ? Object.keys(Ae).filter((t) => !oe.enemyPools[t]) : [],
        noModel = Object.keys(Ae).filter((t) => !RL_MESH_TYPES.includes(t)),
        noSfx = Object.keys(ue).filter((w) => !RL_SFX_VOICES.includes(rlShotSfx(w))),
        noMusic = ii.filter((b) => !Qf[b.id] || !tp[b.id]).map((b) => b.id),
        noTip = Object.keys(Ae).filter((t) => t !== "mite" && !RL_ENEMY_TIPS[t]),
        miss = [
          ...noPool.map((t) => "mesh pool " + t),
          ...noModel.map((t) => "model " + t),
          ...noSfx.map((t) => "sound " + t),
          ...noMusic.map((t) => "music " + t),
          ...noTip.map((t) => "intro " + t),
        ];
      ok(
        "content-coverage",
        !miss.length,
        miss.length
          ? `missing: ${miss.slice(0, 8).join(", ")}`
          : `${Object.keys(ue).length} weapons voiced · ${Object.keys(Ae).length} enemies with own model + intro · ${ii.length}/${ii.length} biomes with own music theme`,
      );
    } catch (e) {
      rlHealthAdd("content-coverage", "FAIL", e.message);
    }
    try {
      let v = [typeof ft?.startRun, typeof ft?.pause, typeof ft?.resume, typeof ft?.restart];
      ok(
        "game-state",
        v.every((e) => e === "function"),
        v.join(" | "),
      );
    } catch (e) {
      rlHealthAdd("game-state", "FAIL", e.message);
    }
    try {
      if (typeof PointerEvent !== "undefined" && typeof MouseEvent !== "undefined") {
        let r = rlUiButtonGuardSelfTest();
        ok(
          "ui-input-dedupe",
          r.ok,
          `${r.steps}/8 pointer-gesture cases · ${r.count}/9 expected activations · ghost clicks after screen changes are dropped`,
        );
      } else {
        rlHealthAdd("ui-input-dedupe", "WARN", "PointerEvent or MouseEvent unavailable in this browser");
      }
    } catch (e) {
      rlHealthAdd("ui-input-dedupe", "FAIL", e.message);
    }
    try {
      if (deep) {
        const r = rlSelfTest(),
          xf = [...(r.expansion21?.fail || []), ...(r.expansion22?.fail || []), ...(r.expansion23?.fail || [])],
          all = [...r.fail, ...xf];
        RL_SELFTEST_LAST = { r, at: Date.now() };
        rlHealthAdd(
          "self-test",
          r.ok ? "OK" : "FAIL",
          `${r.worlds} arena cases · ${r.expansion23?.planWaves || 0} wave plans / ${r.expansion23?.spawned || 0} spawns · ${r.expansion23?.eventKinds || 0} event kinds · ${r.weapons} weapons · ${r.bosses} bosses · ${r.enemyTypes} enemy probes · ${r.biomeCases} biome cases · ${r.threatCases} threat cases · ${r.upgradeChecks} upgrade checks · ${r.frames} sim frames · ${r.ms} ms` +
            (all.length ? ` · ${all.slice(0, 4).join(" | ")}` : " · deterministic + runtime checks passed"),
        );
      } else if (RL_SELFTEST_LAST) {
        const r = RL_SELFTEST_LAST.r;
        rlHealthAdd(
          "self-test",
          r.ok ? "OK" : "FAIL",
          `last deep run ${new Date(RL_SELFTEST_LAST.at).toLocaleTimeString()} · ${r.ok ? "passed" : "failed: " + [...r.fail, ...(r.expansion21?.fail || []), ...(r.expansion22?.fail || []), ...(r.expansion23?.fail || [])].slice(0, 3).join(" | ")} · ${r.expansion23?.planWaves || 0} wave plans · ${r.expansion23?.spawned || 0} spawns · ${r.frames} sim frames (tap “Deep test” to re-run)`,
        );
      } else info("self-test", "not run in quick checks — tap “Deep test” in this dialog (takes a few seconds)");
    } catch (e) {
      rlHealthAdd("self-test", "FAIL", e.message);
    }
    try {
      if (RL_LAST_RUN_AUDIT) {
        let a = RL_LAST_RUN_AUDIT,
          f = a.checks.filter((q) => q.st === "FAIL"),
          w = a.checks.filter((q) => q.st === "WARN");
        rlHealthAdd(
          "post-run-audit",
          f.length ? "FAIL" : w.length ? "WARN" : "OK",
          `${a.outcome} · wave ${a.wave} · ${a.checks.length} checks · ${f.length} fail · ${w.length} warn` +
            (f.length
              ? ` · ${f
                  .slice(0, 2)
                  .map((q) => q.id)
                  .join(", ")}`
              : w.length
                ? ` · ${w
                    .slice(0, 2)
                    .map((q) => q.id)
                    .join(", ")}`
                : " · run verified"),
        );
      }
    } catch (e) {
      rlHealthAdd("post-run-audit", "FAIL", e.message);
    }
    try {
      let v =
        typeof ln?.sample === "function" &&
        typeof ln?.reset === "function" &&
        typeof ln?.press === "function" &&
        typeof ln?.onBlur === "function";
      ok("input-api", v, v ? "pointer + keyboard pipeline ready" : "missing input methods");
      info(
        "input-runtime",
        `down ${RL_RT.pointerdown} · move ${RL_RT.pointermove} · up ${RL_RT.pointerup} · cancel ${RL_RT.pointercancel} · keys ${RL_RT.keydown}/${RL_RT.keyup} · resets ${RL_RT.reset}`,
      );
    } catch (e) {
      rlHealthAdd("input-api", "FAIL", e.message);
    }
    try {
      const rejected = sr({ v: 1, seed: "oops", weapon: "pulse", wave: 12, hp: "oops", up: {} }),
        bad = {
          v: 1,
          seed: "oops",
          weapon: "pulse",
          wave: 12,
          hp: 999999,
          up: { dmg: 999999, wat: 7 },
          time: "nan",
          shards: "bad",
          rerolls: 999999,
          bossKills: ["warden", "wat", "warden"],
          runStats: { dmgTaken: "bad", dashes: "bad", critHits: "bad" },
          dmgSrc: { turret: "bad" },
          offer: ["wat", "dmg", "dmg"],
        },
        s = sr(bad);
      ok(
        "save-sanitize",
        !rejected &&
          !!s &&
          s.wave === 12 &&
          s.weapon === "pulse" &&
          s.hp === 999999 &&
          s.up.dmg === 8 &&
          s.bossKills.length === 1 &&
          Number.isFinite(s.time) &&
          Number.isFinite(s.shards) &&
          s.offer.length === 1,
        "invalid run rejected; bounded run snapshot sanitized",
      );
    } catch (e) {
      rlHealthAdd("save-sanitize", "FAIL", e.message);
    }
    try {
      ok(
        "save-envelope",
        ee.parse(JSON.stringify({ game: "riftline" })).ok === false &&
          ee.parse(JSON.stringify({ game: "riftline", v: 1 })).ok === true,
        "import requires the v1 save envelope",
      );
    } catch (e) {
      rlHealthAdd("save-envelope", "FAIL", e.message);
    }
    try {
      let r = ee.parse(JSON.stringify(ee.data));
      ok("save-roundtrip", !!r && r.ok, "current save serializes + parses successfully");
    } catch (e) {
      rlHealthAdd("save-roundtrip", "FAIL", e.message);
    }
    try {
      const run = ee.data.run;
      if (run) {
        const s = sr(run),
          t = s && new Aa({ snap: s, ws: ee.data.workshop });
        ok(
          "save-resume",
          !!t && t.wave === s.wave,
          t ? `stored run (wave ${s.wave}, ${ue[s.weapon].name}) restores` : "stored run is rejected by the loader",
        );
      } else info("save-resume", "no unfinished run stored");
    } catch (e) {
      rlHealthAdd("save-resume", "FAIL", e.message);
    }
    try {
      let key = "__rift_health_" + _a,
        old = localStorage.getItem(key);
      localStorage.setItem(key, "1");
      localStorage.removeItem(key);
      ok("storage", true, "write/remove test passed");
      old !== null && localStorage.setItem(key, old);
    } catch (e) {
      warn("storage", "localStorage unavailable or restricted");
    }
    try {
      let w = window.innerWidth,
        h = window.innerHeight,
        d = window.devicePixelRatio || 0,
        ins = h_();
      ok(
        "viewport",
        w > 0 && h > 0 && d > 0 && [ins.t, ins.b, ins.l, ins.r].every(Number.isFinite),
        `${w}×${h} @${d}; insets ${ins.t}/${ins.b}/${ins.l}/${ins.r} · ${document.body.dataset.device || "?"}/${document.body.dataset.orientation || "?"}`,
      );
    } catch (e) {
      rlHealthAdd("viewport", "FAIL", e.message);
    }
    try {
      let de = document.documentElement,
        overflowX = de.scrollWidth > window.innerWidth + 1,
        overflowY = de.scrollHeight > window.innerHeight + 1;
      rlHealthAdd(
        "layout-overflow",
        overflowX || overflowY ? "WARN" : "OK",
        `scroll ${de.scrollWidth}×${de.scrollHeight} vs viewport ${window.innerWidth}×${window.innerHeight}`,
      );
    } catch (e) {
      rlHealthAdd("layout-overflow", "FAIL", e.message);
    }
    try {
      if (document.fonts && typeof document.fonts.check === "function") {
        let a = document.fonts.check('16px "Chakra Petch"'),
          b = document.fonts.check('16px "Barlow Semi Condensed"');
        a && b
          ? ok("fonts", true, "declared game fonts available")
          : warn("fonts", `font check: Chakra ${a ? "OK" : "WARN"}, Barlow ${b ? "OK" : "WARN"}`);
      } else warn("fonts", "FontFaceSet API unavailable");
    } catch (e) {
      warn("fonts", e.message);
    }
    try {
      let a = window.__riftLayoutAudit?.() || null;
      rlHealthAdd(
        "layout-hit-test",
        a?.ok ? "OK" : "FAIL",
        a
          ? `${a.checked} visible controls checked on “${Ft?.screen || "?"}” · ${a.bad || 0} covered/misaligned${a.bad ? ": " + a.findings.slice(0, 3).join("; ") : ""}`
          : `layout audit unavailable`,
      );
    } catch (e) {
      rlHealthAdd("layout-hit-test", "FAIL", e.message);
    }
    try {
      let p = typeof PointerEvent !== "undefined";
      ok(
        "device-input",
        p,
        `PointerEvent ${p ? "OK" : "missing"} · touch points ${navigator.maxTouchPoints || 0} · touch API ${"ontouchstart" in window ? "OK" : "n/a"}`,
      );
    } catch (e) {
      rlHealthAdd("device-input", "FAIL", e.message);
    }
    try {
      if (typeof caches !== "undefined") {
        const prefix = `riftline-v${_a.replace(/\./g, "-")}-`;
        let keys = await caches.keys(),
          current = keys.find((e) => e.startsWith(prefix)),
          stale = keys.filter((e) => e.startsWith("riftline-") && !e.startsWith(prefix));
        rlHealthAdd(
          "cache-version",
          current ? "OK" : "WARN",
          current
            ? `current cache ${current}${stale.length ? ` · stale caches visible: ${stale.join(", ")}` : ""}`
            : `current ${_a} cache not found yet (normal on the very first visit)${stale.length ? ` · stale: ${stale.join(", ")}` : ""}`,
        );
      } else warn("cache-version", "CacheStorage API unavailable");
    } catch (e) {
      warn("cache-version", e.message);
    }
    try {
      if ("serviceWorker" in navigator) {
        let r = await navigator.serviceWorker.getRegistration(),
          active = !!r?.active,
          controlled = !!navigator.serviceWorker.controller;
        rlHealthAdd(
          "service-worker",
          active ? "OK" : "WARN",
          `${active ? "active" : "no active"} registration · page ${controlled ? "controlled" : "not controlled"}${r?.waiting ? " · update waiting" : ""}`,
        );
      } else warn("service-worker", "Service Worker API unavailable");
    } catch (e) {
      warn("service-worker", e.message);
    }
    try {
      let res = await fetch(`./build-info.json?health=${Date.now()}`, { cache: "no-store" }),
        b = res.ok ? await res.json() : null,
        okBuild = !!b && b.version === _a && b.build_id === Hh;
      rlHealthAdd(
        "build-info-network",
        okBuild ? "OK" : "WARN",
        b
          ? `network build ${b.version} · ${b.build_id || "?"}${okBuild ? "" : ` (this page runs ${_a} · ${Hh})`}`
          : `HTTP ${res.status}`,
      );
    } catch (e) {
      warn("build-info-network", "offline or build-info fetch blocked");
    }
    try {
      let a = RL_HEALTH.filter((e) => e.status === "OK").length,
        w = RL_HEALTH.filter((e) => e.status === "WARN").length,
        f = RL_HEALTH.filter((e) => e.status === "FAIL").length;
      Xi.health = `${a} OK / ${w} WARN / ${f} FAIL`;
    } catch {}
    return RL_HEALTH;
  }
  var RL_SELFTEST_LAST = null;
  function rlHealthSummary() {
    let a = RL_HEALTH.filter((e) => e.status === "OK").length,
      w = RL_HEALTH.filter((e) => e.status === "WARN").length,
      f = RL_HEALTH.filter((e) => e.status === "FAIL").length;
    return `Health: ${a} OK · ${w} WARN · ${f} FAIL`;
  }

  /* ---- 2.2.3 deep self-test additions: each case reproduces a bug class that
   slipped through 2.2.2 (plan members, event names, save loader, texts, arena features).
   Every section runs in its own try so one failure cannot hide the others. ---- */
  const _rlSelfTestCore = rlSelfTest;
  rlSelfTest = function () {
    const r = _rlSelfTestCore(),
      t0 = performance.now(),
      f = Number.isFinite,
      cats = new Map();
    const bad = (cat, ex) => {
      const q = cats.get(cat);
      q ? (q.n++, q.all.length < 8 && q.all.push(ex)) : cats.set(cat, { n: 1, ex, all: [ex] });
    };
    const section = (cat, fn) => {
      try {
        fn();
      } catch (e) {
        bad(cat + "-exception", String((e && e.message) || e));
      }
    };
    let planWaves = 0,
      spawned = 0,
      eventKinds = new Set(),
      featureLayouts = 0,
      features = 0,
      snaps = 0;
    // 1. every wave's spawn plan (incl. director bonus groups) must be valid and spawn, waves 2–60
    section("plan", () => {
      for (const threat of [0, 5]) {
        const w = new Aa({ seed: 0x51, weapon: "pulse", threat, ws: { fieldSupply: 3 } });
        for (let wave = 2; wave <= 60; wave++) {
          w.startWave(wave);
          planWaves++;
          for (const g of w.plan)
            for (let gi = 0; gi < g.members.length; gi++) {
              const q = g.members[gi];
              if (!q || typeof q !== "object" || !Ae[q.type]) {
                bad("plan-member", `wave ${wave}: ${JSON.stringify(q)}`);
                continue;
              }
              if (gi) continue; // every member is type-checked; one per group is spawned for real
              const p = w.arena.freePoint(w.rng, w.player.x, w.player.y, 4, 0.5),
                e = w.spawnEnemy(q.type, p.x, p.y, { elite: q.elite });
              spawned++;
              if (!e || ![e.x, e.y, e.hp].every(f)) bad("plan-spawn", `${q.type} @ wave ${wave}`);
            }
          if (w.bossPending && !en[w.bossPending]) bad("plan-boss", `${w.bossPending} @ wave ${wave}`);
          w.enemies.length = 0;
        }
      }
    });
    // 2. event contract: every enemy type fights for 7 s near a stationary player, no boss present
    section("events", () => {
      for (const id of Object.keys(Ae)) {
        const w = new Aa({ seed: Yi("ev:" + id), weapon: "pulse", threat: 0, ws: {} });
        w.startWave(41);
        w.god = !0;
        w.hold = !0;
        w.plan = [];
        w.bossPending = null;
        w.championPending = null;
        w.fx.length = 0;
        let p = null;
        for (let a = 0; a < 12 && !p; a++) {
          const x = w.player.x + Math.cos(a * 0.52) * 7,
            y = w.player.y + Math.sin(a * 0.52) * 7;
          w.arena.blocked(x, y, 1) || w.arena.outside(x, y, 1) || (p = { x, y });
        }
        p = p || w.arena.freePoint(w.rng, w.player.x, w.player.y, 5, 0.6);
        w.spawnEnemy(id, p.x, p.y, {}).spawnT = 0;
        for (let k = 0; k < 420; k++) {
          const d0 = w.player.dashId,
            n0 = w.fx.length;
          w.step(1 / 60, { mx: 0, my: 0, aim: !1, fire: !1, auto: !1 });
          for (let i = n0; i < w.fx.length; i++) {
            const q = w.fx[i].k;
            eventKinds.add(q);
            RL_EVENT_KINDS.has(q) || bad("event-unconsumed", `"${q}" from ${id}`);
            {
              const pe = rlEventPayloadError(w.fx[i]);
              pe && bad("event-payload", `${pe} (${id})`);
            }
            RL_BOSS_EVENTS.has(q) && !w.boss && bad("event-boss-only", `"${q}" from ${id}`);
            q === "dash" && w.player.dashId === d0 && bad("event-player-dash", `"dash" from ${id}`);
          }
          w.fx.length = 0;
        }
      }
    });
    // 2b. the sound engine gives every weapon a voice (exercises the real consumer)
    section("sfx", () => {
      const s = new zl(),
        heard = [];
      s.ctx = { state: "running" };
      s.play = (n) => heard.push(n);
      for (const id of Object.keys(ue)) {
        heard.length = 0;
        s.consume([{ k: "shot", w: id }]);
        RL_SFX_VOICES.includes(heard[0]) || bad("sfx-silent-weapon", id);
      }
    });
    // 2e. every biome has one coherent palette and valid champion variants
    section("palette", () => {
      for (const b of ii) {
        const p = rlPaletteIssues(b);
        p.length && bad("biome-palette", `${b.id}: ${p.join(", ")}`);
      }
      for (const q of rlBiomeDistinct()) bad("biome-lookalike", q);
      for (const [id, v] of Object.entries(cu))
        ["scorch", "frost", "phase", "toxic"].includes(v.id) || bad("variant-dead", `${id} → ${v.id}`);
      for (const [id, v] of Object.entries(cu)) for (const t of v.types) Ae[t] || bad("variant-type", `${id}: ${t}`);
    });
    // 2c. music: every biome has its own theme and every step of fight/boss/menu music schedules cleanly
    section("music", () => {
      const O = typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : null;
      for (const b of ii) {
        if (!Qf[b.id] || !tp[b.id]) {
          bad("music-missing", b.id);
          continue;
        }
        if (!O) continue;
        const s = new zl(),
          c = new O(1, 2205, 22050);
        s.ctx = c;
        s.mus = c.createGain();
        s.delay = c.createDelay(1);
        s.sfx = c.createGain();
        s.mus.connect(c.destination);
        s.delay.connect(s.mus);
        s.sfx.connect(c.destination);
        s.noiseBuf = c.createBuffer(1, 2205, 22050);
        s.biome = b.id;
        for (const [mode, n] of [
          ["fight", 64],
          ["menu", 16],
        ]) {
          s.mode = mode;
          s.intensity = 0.9;
          s.cycle = 0;
          for (let t = 0; t < n; t++) s.note(t, 0);
        }
      }
    });
    // 2d. stragglers: a hunting enemy of every type closes in on a stationary player
    section("hunt", () => {
      for (const id of Object.keys(Ae)) {
        if (id === "mite" || id === "hive") continue;
        const w = new Aa({ seed: Yi("hunt:" + id), weapon: "pulse", threat: 0, ws: {} });
        w.startWave(41);
        w.god = !0;
        w.hold = !0;
        w.plan = [];
        w.bossPending = null;
        w.championPending = null;
        let p = null;
        for (let a = 0; a < 24 && !p; a++) {
          const x = w.player.x + Math.cos(a * 0.26) * 12,
            y = w.player.y + Math.sin(a * 0.26) * 12;
          w.arena.blocked(x, y, 1.2) || w.arena.outside(x, y, 1.2) || (p = { x, y });
        }
        p = p || w.arena.freePoint(w.rng, w.player.x, w.player.y, 9, 0.6);
        const e = w.spawnEnemy(id, p.x, p.y, {});
        e.spawnT = 0;
        e.hunt = !0;
        e.hp = e.maxHp = 1e9;
        const d0 = Math.hypot(e.x - w.player.x, e.y - w.player.y);
        let dmin = d0;
        for (let k = 0; k < 480; k++) {
          w.step(1 / 60, { mx: 0, my: 0, fire: !1, auto: !1 });
          e.hunt = !0;
          dmin = Math.min(dmin, Math.hypot(e.x - w.player.x, e.y - w.player.y));
        }
        dmin > 6 &&
          bad("straggler-kites", `${id} stayed ${dmin.toFixed(1)} m away (start ${d0.toFixed(1)}) while hunting`);
      }
    });
    // 3. save loader: live snapshots must pass sr() and restore the same run
    section("snapshot", () => {
      for (const wave of [1, 7, 19, 33]) {
        const w = new Aa({ seed: 0x77 + wave, weapon: "tesla", threat: 1, ws: { hull: 2 } });
        w.startWave(wave);
        w.up = { dmg: 2, orbit: 1 };
        w.stats = nr(w.weapon, w.up, w.ws);
        const s = sr(JSON.parse(JSON.stringify(w.snapshot()))),
          b = s && new Aa({ snap: s, ws: { hull: 2 } });
        if (!b || b.wave !== wave || b.weapon !== "tesla" || b.up.dmg !== 2)
          bad("snapshot", `wave ${wave} does not restore`);
        else snaps++;
      }
    });
    // 4. upgrade texts describe the level you are about to take (no "+0 %")
    section("desc", () => {
      for (const u of Zi) {
        const t = u.desc(0);
        /(^|[^\d.])[+\-]?0(%|\s|\))/.test(t) && bad("desc-zero", `${u.id}: “${t}”`);
      }
    });
    // 5. every weapon has a firing voice; every enemy has a mesh pool
    section("coverage", () => {
      if (oe) for (const id of Object.keys(Ae)) oe.enemyPools[id] || bad("mesh", id);
    });
    // 6. arena features (vents, ice, acid, portals) of every biome, waves 21–60: no overlap with obstacles, portals valid
    section("features", () => {
      for (const b of ii)
        for (const wave of [21, 33, 47, 58]) {
          const lay = Su(b, 0x33 + wave, wave, !1),
            F = lay.features || {};
          featureLayouts++;
          for (const k of ["vents", "ice", "acid"])
            for (const q of F[k] || []) {
              features++;
              if (![q.x, q.y, q.r].every(f) || Eu(lay.obstacles, q.x, q.y, (q.r || 0) + 0.8))
                bad("feature-overlap", `${k} in ${b.id} wave ${wave}`);
            }
          for (const q of F.portals || []) {
            features++;
            for (const [x, y] of [
              [q.ax, q.ay],
              [q.bx, q.by],
            ])
              if (
                !f(x) ||
                !f(y) ||
                Eu(lay.obstacles, x, y, 1.5) ||
                Math.abs(x) > lay.W - 3.6 ||
                Math.abs(y) > lay.H - 3.6
              )
                bad("portal", `${b.id} wave ${wave}`);
          }
          if ("pads" in F) bad("pads-removed", `${b.id} still generates jump pads`);
          const theme = RL_BIOME_HAZARD[b.id] ?? "";
          for (const k of ["vents", "ice", "acid", "portals"])
            (F[k] || []).length && k !== theme && bad("hazard-theme", `${k} in ${b.id} (theme: ${theme || "none"})`);
        }
    });
    const fail = [...cats].map(([c, q]) => `${c}${q.n > 1 ? ` ×${q.n}` : ""} (${q.all.join("; ")})`);
    return {
      ...r,
      ok: r.ok && !fail.length,
      expansion23: {
        ok: !fail.length,
        fail,
        planWaves,
        spawned,
        eventKinds: eventKinds.size,
        snapshots: snaps,
        featureLayouts,
        features,
        ms: Math.round(performance.now() - t0),
      },
    };
  };

  /* Save loading must never brick the game (2.2.2 crashed on every start once a
   save existed). Retry without the unfinished run, then fall back to a fresh
   profile while keeping the raw save in a backup key. */
  function rlLoadSave(raw) {
    try {
      return ap(raw);
    } catch (e) {
      ze("load", e);
    }
    try {
      const d = ap({ ...raw, run: null });
      ze("load", "unfinished run discarded: it could not be restored");
      return d;
    } catch (e) {
      ze("load", e);
    }
    rlBackupSave(JSON.stringify(raw));
    return zh();
  }
  /* 2.3.2: a save that cannot be used at all (broken JSON, oversized, not an
   object) is copied to a backup key before the fresh profile's first autosave
   overwrites it — progress can then still be recovered by hand. */
  function rlBackupSave(text) {
    try {
      localStorage.setItem("riftline.save.v1.backup-" + Date.now(), String(text));
    } catch (e) {
      ze("backup", e);
    }
  }
  /* 2.3.2: numeric settings get the range of their control (volume 0–1, zoom
   snaps to Near/Normal/Far) instead of a blanket 0–2 clamp. */
  const RL_ZOOM_STEPS = [0.85, 1, 1.18];
  function rlSettingNum(key, v, def) {
    const x = ni(v, def, 0, key === "sfx" || key === "music" ? 1 : 2);
    return key === "zoom" ? RL_ZOOM_STEPS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a)) : x;
  }
  /* ==========================================================================
   Riftline 2.3.0 content
   - rlEnemyMesh: dedicated models for the 12 enemies added in 2.0–2.2
     (they used to fall back to the Grunt box). +x is the facing direction;
     body parts take the enemy colour (e = 55 %, n = 30 %), "glow" parts are
     white and get tinted per instance by the renderer.
   ========================================================================== */
  function rlEnemyMesh(type, e, n, s) {
    const W = 16777215,
      P = Math.PI;
    switch (type) {
      case "leaper": {
        // crouched hopper: squat body, big folded hind legs, eye pair
        const legs = [];
        for (const z of [-0.34, 0.34])
          legs.push(
            At(new Ct(0.62, 0.14, 0.16), n, { x: -0.22, y: 0.3, z, rz: 0.75 }),
            At(new Ct(0.5, 0.12, 0.14), s, { x: -0.05, y: 0.14, z: z * 1.15, rz: -0.35 }),
          );
        return {
          body: _e([
            At(new De(0.46, 12, 8), e, { y: 0.46, sx: 1.25, sy: 0.7 }),
            At(new Ct(0.3, 0.14, 0.5), s, { x: 0.36, y: 0.3 }),
            ...legs,
          ]),
          glow: _e([
            At(new De(0.09, 8, 6), W, { x: 0.42, y: 0.62, z: 0.16 }),
            At(new De(0.09, 8, 6), W, { x: 0.42, y: 0.62, z: -0.16 }),
            At(new Ct(0.5, 0.04, 0.06), W, { x: -0.05, y: 0.78 }),
          ]),
        };
      }
      case "turret": {
        // hex base, column, gun head with long barrel
        return {
          body: _e([
            At(new ye(0.55, 0.7, 0.3, 6), n, { y: 0.15 }),
            At(new ye(0.17, 0.22, 0.5, 8), s, { y: 0.52 }),
            At(new Ct(0.56, 0.34, 0.48), e, { y: 0.9 }),
            At(new Ct(0.9, 0.11, 0.11), s, { x: 0.62, y: 0.92 }),
            At(new Ct(0.2, 0.2, 0.52), s, { x: -0.3, y: 0.94 }),
          ]),
          glow: _e([
            At(new De(0.1, 8, 6), W, { x: 1.08, y: 0.92 }),
            At(new Ve(0.64, 0.035, 4, 24), W, { y: 0.06, rx: P / 2 }),
            At(new Ct(0.06, 0.08, 0.3), W, { x: 0.29, y: 1.02 }),
          ]),
        };
      }
      case "charger": {
        // armoured wedge with a ram horn
        return {
          body: _e([
            At(new Ct(1.05, 0.58, 0.78), e, { y: 0.46 }),
            At(new Ct(0.62, 0.34, 0.66), n, { x: -0.12, y: 0.86 }),
            At(new Ir(0.28, 0.7, 6), s, { x: 0.82, y: 0.5, rz: -P / 2 }),
            At(new Ir(0.1, 0.36, 5), s, { x: 0.4, y: 0.86, z: 0.3, rz: -0.9 }),
            At(new Ir(0.1, 0.36, 5), s, { x: 0.4, y: 0.86, z: -0.3, rz: -0.9 }),
          ]),
          glow: _e([
            At(new Ct(0.07, 0.08, 0.52), W, { x: 0.54, y: 0.66 }),
            At(new Ct(0.7, 0.05, 0.06), W, { x: -0.15, y: 1.05 }),
          ]),
        };
      }
      case "minebot": {
        // low crab dome carrying three mines
        const legs = [],
          mines = [];
        for (const a of [0.6, 2.5, 3.8, 5.7])
          legs.push(At(new Ct(0.5, 0.1, 0.1), s, { x: Math.cos(a) * 0.55, y: 0.14, z: Math.sin(a) * 0.55, ry: -a }));
        for (let k = 0; k < 3; k++) {
          const a = P * 0.6 + k * 0.45;
          mines.push(At(new De(0.13, 8, 6), W, { x: Math.cos(a) * 0.34, y: 0.78, z: Math.sin(a) * 0.34 - 0.02 }));
        }
        return {
          body: _e([
            At(new ye(0.62, 0.7, 0.28, 8), n, { y: 0.26 }),
            At(new De(0.52, 14, 8, 0, P * 2, 0, P / 2), e, { y: 0.38 }),
            ...legs,
          ]),
          glow: _e([...mines, At(new Ct(0.1, 0.1, 0.34), W, { x: 0.52, y: 0.44 })]),
        };
      }
      case "sapper": {
        // upright engineer with a charge pack on its back
        return {
          body: _e([
            At(new ye(0.32, 0.4, 0.78, 8), e, { y: 0.42 }),
            At(new De(0.26, 10, 8), n, { y: 0.95 }),
            At(new Ct(0.34, 0.5, 0.5), s, { x: -0.38, y: 0.56 }),
            At(new ye(0.05, 0.05, 0.35, 6), s, { x: -0.38, y: 0.98 }),
          ]),
          glow: _e([
            At(new De(0.09, 8, 6), W, { x: -0.38, y: 1.18 }),
            At(new Ve(0.2, 0.035, 4, 16), W, { x: -0.38, y: 0.56, ry: P / 2 }),
            At(new Ct(0.08, 0.06, 0.3), W, { x: 0.24, y: 0.98 }),
          ]),
        };
      }
      case "phantom": {
        // hooded wraith fading into a point
        return {
          body: _e([
            At(new Ir(0.46, 1.05, 8), e, { y: 0.62, rx: P }),
            At(new De(0.32, 12, 8), n, { y: 1.18 }),
            At(new Ir(0.34, 0.4, 8), s, { x: -0.05, y: 1.36 }),
          ]),
          glow: _e([
            At(new De(0.08, 8, 6), W, { x: 0.27, y: 1.2, z: 0.12 }),
            At(new De(0.08, 8, 6), W, { x: 0.27, y: 1.2, z: -0.12 }),
            At(new Ve(0.42, 0.035, 4, 20), W, { y: 0.34, rx: P / 2 }),
            At(new Ve(0.3, 0.03, 4, 18), W, { y: 0.8, rx: P / 2 }),
            At(new Ve(0.34, 0.03, 4, 18), W, { y: 1.18, rz: P / 2 }),
          ]),
        };
      }
      case "sentinel": {
        // floating eye on a pylon, framed by a vertical ring
        return {
          body: _e([
            At(new ye(0.18, 0.46, 0.55, 6), n, { y: 0.28 }),
            At(new De(0.48, 14, 10), e, { y: 1.05 }),
            At(new Ve(0.64, 0.07, 5, 28), s, { y: 1.05 }),
          ]),
          glow: _e([
            At(new De(0.2, 10, 8), W, { x: 0.4, y: 1.05 }),
            At(new Ve(0.26, 0.03, 4, 18), W, { x: 0.34, y: 1.05, ry: P / 2 }),
            At(new Ve(0.46, 0.03, 4, 20), W, { y: 0.05, rx: P / 2 }),
          ]),
        };
      }
      case "carrier": {
        // hovering saucer with launch bays
        return {
          body: _e([
            At(new ye(0.86, 0.62, 0.28, 12), e, { y: 0.62 }),
            At(new De(0.4, 12, 8, 0, P * 2, 0, P / 2), n, { y: 0.76 }),
            At(new Ct(0.34, 0.2, 0.3), s, { y: 0.6, z: 0.78 }),
            At(new Ct(0.34, 0.2, 0.3), s, { y: 0.6, z: -0.78 }),
            At(new Ct(0.3, 0.2, 0.34), s, { x: -0.8, y: 0.6 }),
          ]),
          glow: _e([
            At(new Ve(0.7, 0.045, 4, 28), W, { y: 0.46, rx: P / 2 }),
            At(new Ct(0.08, 0.06, 0.24), W, { x: 0.84, y: 0.64 }),
            At(new De(0.1, 8, 6), W, { y: 1.14 }),
          ]),
        };
      }
      case "drone": {
        // quad-rotor needler
        const arms = [],
          rotors = [];
        for (const [x, z] of [
          [0.34, 0.34],
          [0.34, -0.34],
          [-0.34, 0.34],
          [-0.34, -0.34],
        ]) {
          arms.push(At(new Ct(0.5, 0.06, 0.08), s, { x: x / 2, y: 0.82, z: z / 2, ry: Math.atan2(-z, x) }));
          rotors.push(At(new Ve(0.17, 0.028, 4, 16), W, { x, y: 0.9, z, rx: P / 2 }));
        }
        return {
          body: _e([
            At(new Ct(0.4, 0.16, 0.36), e, { y: 0.82 }),
            At(new Ct(0.34, 0.08, 0.08), n, { x: 0.3, y: 0.76 }),
            ...arms,
          ]),
          glow: _e([...rotors, At(new De(0.07, 8, 6), W, { x: 0.48, y: 0.76 })]),
        };
      }
      case "driller": {
        // tracked body with a spinning drill
        return {
          body: _e([
            At(new Ct(0.95, 0.5, 0.76), e, { y: 0.42 }),
            At(new Ct(1.1, 0.22, 0.2), s, { y: 0.14, z: 0.44 }),
            At(new Ct(1.1, 0.22, 0.2), s, { y: 0.14, z: -0.44 }),
            At(new Ir(0.34, 0.9, 8), n, { x: 0.88, y: 0.46, rz: -P / 2 }),
            At(new ye(0.1, 0.14, 0.4, 6), s, { x: -0.32, y: 0.84 }),
          ]),
          glow: _e([
            At(new Ve(0.36, 0.04, 4, 20), W, { x: 0.46, y: 0.46, ry: P / 2 }),
            At(new De(0.08, 8, 6), W, { x: -0.32, y: 1.08 }),
            At(new Ct(0.07, 0.06, 0.5), W, { x: 0.2, y: 0.68 }),
          ]),
        };
      }
      case "beacon": {
        // repair spire with stacked halo rings
        return {
          body: _e([
            At(new ye(0.46, 0.58, 0.26, 6), n, { y: 0.13 }),
            At(new ye(0.16, 0.3, 1.15, 6), e, { y: 0.82 }),
            At(new Ct(0.62, 0.1, 0.1), s, { y: 1.22 }),
            At(new Ct(0.1, 0.1, 0.62), s, { y: 1.22 }),
          ]),
          glow: _e([
            At(new Qe(0.24), W, { y: 1.6 }),
            At(new Ve(0.4, 0.035, 4, 22), W, { y: 0.55, rx: P / 2 }),
            At(new Ve(0.3, 0.03, 4, 20), W, { y: 0.95, rx: P / 2 }),
          ]),
        };
      }
      case "weaver": {
        // angular rift spider
        const legs = [];
        for (let k = 0; k < 6; k++) {
          const a = (k < 3 ? -1 : 1) * (0.6 + (k % 3) * 0.55);
          legs.push(
            At(new Ct(0.62, 0.06, 0.08), s, {
              x: Math.cos(a) * 0.34,
              y: 0.46,
              z: Math.sin(a) * 0.34,
              ry: -a,
              rz: 0.45,
            }),
          );
        }
        return {
          body: _e([
            At(new Qe(0.38), e, { y: 0.66, sx: 1.35, sy: 0.8 }),
            At(new Qe(0.2), n, { x: 0.46, y: 0.7 }),
            ...legs,
          ]),
          glow: _e([
            At(new De(0.1, 8, 6), W, { y: 0.72 }),
            At(new Ve(0.5, 0.03, 4, 22), W, { y: 0.66, rx: P / 2 }),
            At(new Ct(0.06, 0.06, 0.2), W, { x: 0.62, y: 0.72 }),
          ]),
        };
      }
    }
    return null;
  }

  /* enemy types with a dedicated model (original 13 + the 12 above) */
  var RL_MESH_TYPES = [
    "swarmer",
    "mite",
    "grunt",
    "gunner",
    "bomber",
    "splitter",
    "brute",
    "sniper",
    "hive",
    "bulwark",
    "striker",
    "mender",
    "mortar",
    "leaper",
    "turret",
    "charger",
    "minebot",
    "sapper",
    "phantom",
    "sentinel",
    "carrier",
    "drone",
    "driller",
    "beacon",
    "weaver",
  ];

  /* ---- enemy intros: one short hint the first time each enemy type appears ---- */
  var RL_ENEMY_TIPS = {
    swarmer: "Swarmers rush in packs. Keep moving and let splash damage thin them out.",
    grunt: "Grunts are slow but tough. Kite them in wide circles.",
    gunner: "Gunners stop and glow before a burst — that glow is your cue to dodge.",
    bomber: "Bombers explode next to you. Shoot them early or dash away when they flash.",
    splitter: "Splitters burst into three mites when destroyed.",
    brute: "Brutes aim, then charge in a straight line. Sidestep — walls stun them.",
    sniper: "Snipers show a red aim line before they fire. Break line of sight or dash.",
    hive: "Hives keep hatching swarmers until you destroy them.",
    bulwark: "Bulwarks block shots from the front. Flank them or break the shield.",
    striker: "Strikers blink next to you — watch the ring where they will land.",
    mortar: "Mortars lob shells where you are heading. Keep changing direction.",
    mender: "Menders heal other enemies. Kill them first.",
    leaper: "Leapers freeze, then pounce. Move sideways the moment they crouch.",
    turret: "Rift Turrets lock on with an aim line, then fire a heavy shot.",
    charger: "Chargers telegraph, then ram at high speed. Step aside at the last moment.",
    minebot: "Minebots drop mines and back away. Don't chase them through the minefield.",
    sapper: "Sappers plant charges that blow after a moment. Stay mobile.",
    phantom: "Phantoms phase out and can't be hit — then lunge. Shoot when they reappear.",
    sentinel: "Sentinels charge a sweeping beam. Leave the line before it fires.",
    carrier: "Carriers hang back and launch homing shots. Close the gap.",
    drone: "Needler Drones strafe and fire homing needles. Keep moving.",
    driller: "Drillers ram forward and leave a blast where they stop.",
    beacon: "Repair Beacons heal every enemy around them. Destroy them first.",
    weaver: "Rift Weavers warp across the arena and fire spreads after each jump.",
  };
  var RL_INTRO = { queue: [], last: 0 };
  function rlIntroEvents(w) {
    if (ft.tut) return; // the tutorial coach owns the screen on the first run
    for (const ev of w.fx) {
      if (
        (ev.k === "spawn" || ev.k === "champion") &&
        RL_ENEMY_TIPS[ev.type] &&
        !ee.data.seen["enemy_" + ev.type] &&
        !RL_INTRO.queue.includes(ev.type)
      )
        RL_INTRO.queue.push(ev.type);
    }
    const now = performance.now();
    if (RL_INTRO.queue.length && now - RL_INTRO.last > 6500 && w.state === "fight") {
      const t = RL_INTRO.queue.shift(),
        seen = ee.data.seen;
      seen["enemy_" + t] = !0;
      t === "mender" && (seen.tip_mender = !0);
      ee.save("intro");
      RL_INTRO.last = now;
      Ft.toast(`NEW · ${Ae[t].name.toUpperCase()} — ${RL_ENEMY_TIPS[t]}`, "intro", 6200);
    }
  }

  /* ---- run history: the last 12 runs, shown under Records ---- */
  function rlSanitizeHistory(h) {
    if (!Array.isArray(h)) return [];
    const out = [],
      ni2 = (v, lo, hi, d = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    for (const q of h.slice(0, 12)) {
      // 2.4.0: runs with a retired weapon stay in the list (shown with the weapon's old name)
      if (!q || typeof q !== "object" || !(ue[q.weapon] || rlRetired(q.weapon))) continue;
      out.push({
        t: ni2(q.t, 0, 9e15),
        weapon: q.weapon,
        threat: Math.floor(ni2(q.threat, 0, 5)),
        wave: Math.floor(ni2(q.wave, 1, 999, 1)),
        outcome: ["win", "dead", "quit"].includes(q.outcome) ? q.outcome : "dead",
        endless: !!q.endless,
        time: Math.round(ni2(q.time, 0, 1e7)),
        kills: Math.floor(ni2(q.kills, 0, 1e9)),
        shards: Math.floor(ni2(q.shards, 0, 1e9)),
        killer: typeof q.killer === "string" && /^[a-z]{1,18}$/.test(q.killer) ? q.killer : "",
        build: Array.isArray(q.build) ? q.build.filter((id) => typeof id === "string" && ri[id]).slice(0, 6) : [],
      });
    }
    return out;
  }
  function rlRecordRun(w, pre, win, abandoned) {
    const d = ee.data,
      up = Object.entries(w.up || {})
        .filter(([id]) => ri[id] && !ri[id].repeat)
        .sort((a, b) => ri[b[0]].rarity - ri[a[0]].rarity || b[1] - a[1]);
    const entry = {
      t: Date.now(),
      weapon: w.weapon,
      threat: w.threat,
      wave: win && !w.endless ? 20 : w.wave,
      outcome: win ? "win" : abandoned ? "quit" : "dead",
      endless: !!w.endless,
      time: Math.round(w.time),
      kills: w.kills,
      shards: Math.max(0, d.shards - pre.bank),
      killer: (!win && !abandoned && w.lastHit) || "",
      build: up.slice(0, 6).map(([id]) => id),
    };
    d.history = rlSanitizeHistory([entry, ...(d.history || [])]);
    ee.save("history");
  }
  function rlAgo(t) {
    const s = Math.max(0, (Date.now() - t) / 1e3);
    return s < 60
      ? "now"
      : s < 3600
        ? Math.floor(s / 60) + "m ago"
        : s < 86400
          ? Math.floor(s / 3600) + "h ago"
          : Math.floor(s / 86400) + "d ago";
  }
  function rlRenderHistory() {
    const el = document.getElementById("runHist");
    if (!el) return;
    const h = ee.data.history || [];
    if (!h.length) {
      el.innerHTML = '<p class="note">No runs yet — your last 12 runs appear here.</p>';
      return;
    }
    const killerName = (id) =>
      id === "lava" ? "a lava vent" : id === "acid" ? "acid" : Ae[id] ? "a " + Ae[id].name : en[id] ? en[id].name : "";
    el.innerHTML = h
      .map((q) => {
        const icon = q.outcome === "win" ? "trophy" : q.outcome === "quit" ? "close" : "skull",
          kn = q.outcome === "dead" ? killerName(q.killer) : "";
        const meta = [
          si[q.threat].name,
          va(q.time),
          qn(q.kills) + " kills",
          "+" + qn(q.shards) + " shards",
          kn && "by " + kn,
          q.outcome === "quit" && "abandoned",
        ]
          .filter(Boolean)
          .join(" · ");
        const build = q.build.map((id) => ri[id].name).join(" · ");
        return `<div class="row panel hist ${q.outcome}"><div class="rico">${Ln(icon)}</div><div><b>${q.outcome === "win" ? "Rift sealed" : "Wave " + q.wave}${q.endless ? " · Endless" : ""} · ${we((ue[q.weapon] || rlRetired(q.weapon)).name)}</b><small>${we(meta)}</small>${build ? `<small class="hist-build">${we(build)}</small>` : ""}</div><span class="chip">${rlAgo(q.t)}</span></div>`;
      })
      .join("");
  }

  /* ---- stragglers: when only a few enemies are left for 9 s the game sets
   enemy.hunt so they come to the player. The 2.1/2.2 ranged enemies ignored
   it and could kite forever (the last Beacon fleeing into a corner). ---- */
  var RL_KITERS = new Set(["turret", "minebot", "sapper", "sentinel", "carrier", "drone", "beacon", "weaver"]);
  function rlInstallHunt() {
    const base = mu;
    mu = function (g, e, dt) {
      if (e.hunt && RL_KITERS.has(e.type) && !(e.spawnT > 0)) {
        g.chaseDir(e);
        const sp = Math.max(e.speed, 2.6) * 1.3;
        e.vx = g.cdx * sp;
        e.vy = g.cdy * sp;
        e.face = Ne(e.face, Math.atan2(e.vy, e.vx), 8 * dt);
        e.st = 0;
        return;
      }
      return base(g, e, dt);
    };
  }

  /* ---- biome palettes (2.3.1). The 2.0–2.2 biome packs shipped scrambled
   colours (neon-green floors, bright fog, clashing grids), so a wave looked
   like several biomes mixed together. Every biome now follows one rule set:
   dark floor/fog/ground in the biome hue, a bright grid, a contrasting accent,
   a mid-bright sky and a dark wall tone. rlPaletteIssues() enforces it. ---- */
  /* 2.3.3: grid colours re-spread so every biome is recognisable at a glance —
   in 2.3.1 Tempest/Aurora looked like Neon Yard (ΔE 6–20) and Catacombs like Requiem.
   Minimum grid distance between any two of the 19 biomes is now ΔE ≥ 30 (checked by
   rlBiomeDistinct in the deep test). Floor/fog/walls/light take the grid's hue. */
  var RL_PALETTES = {
    vault: {
      floor: 0x0e1718,
      grid: 0xbfdfe3,
      accent: 0x5cc8ff,
      fog: 0x080e0f,
      sky: 0x476c70,
      ground: 0x0a1112,
      wall: 0x1c2a2c,
    },
  };
  function rlLum(c) {
    return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
  }
  function rlPaletteIssues(b) {
    const L = rlLum,
      out = [];
    L(b.floor) > 0.1 && out.push(`floor too bright (${L(b.floor).toFixed(2)})`);
    L(b.fog) > 0.08 && out.push(`fog too bright (${L(b.fog).toFixed(2)})`);
    L(b.ground) > 0.1 && out.push(`ground light too bright (${L(b.ground).toFixed(2)})`);
    L(b.wall) > 0.2 && out.push(`walls too bright (${L(b.wall).toFixed(2)})`);
    L(b.grid) < 0.4 && out.push(`grid too dark (${L(b.grid).toFixed(2)})`);
    L(b.accent) < 0.35 && out.push(`accent too dark (${L(b.accent).toFixed(2)})`);
    (L(b.sky) < 0.12 || L(b.sky) > 0.55) && out.push(`sky light out of range (${L(b.sky).toFixed(2)})`);
    return out;
  }
  /* 2.3.3: biomes must be told apart at a glance. The floor is near-black in every
   biome, so identity rests on the grid colour: CIE76 ΔE between the grids of any
   two biomes must be >= 30 (≈ clearly different hue or lightness). */
  function rlLab(c) {
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4),
      r = lin((c >> 16) & 255),
      g = lin((c >> 8) & 255),
      b = lin(c & 255);
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047),
      y = f(r * 0.2126 + g * 0.7152 + b * 0.0722),
      z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function rlBiomeDistinct(min = 30) {
    const out = [];
    for (let i = 0; i < ii.length; i++)
      for (let j = i + 1; j < ii.length; j++) {
        const a = rlLab(ii[i].grid),
          b = rlLab(ii[j].grid),
          d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        d < min && out.push(`${ii[i].id}/${ii[j].id} ΔE ${d.toFixed(0)}`);
      }
    return out;
  }
  function rlApplyBiomeFixes() {
    for (const [id, p] of Object.entries(RL_PALETTES)) du[id] && Object.assign(du[id], p);
  }

  /* ---- one hazard theme per biome (2.3.1). The wave director used to drop a
   rotating vent/ice/acid pool into EVERY biome, so lava vents appeared in the
   Cryo Vault and ice in Ember Works. Each biome now owns one hazard type. ---- */
  var RL_BIOME_HAZARD = {
    yard: "",
    works: "vents",
    vault: "ice",
    void: "portals",
    marsh: "acid",
  };

  /* ---- content data fixes found by the data audit (2.3.2). Runs once, after all
   content packs are merged and before the save store and renderer are built. ---- */
  function rlApplyDataFixes() {
    // Distinct silhouettes need distinct colours: Sentinel shared Bomber's yellow,
    // Repair Beacon shared Mender's green.
    Ae.sentinel.color = 0xe8e8ff;
    Ae.beacon.color = 0x00ffa2;
    // The weapon carousel follows unlock price (it jumped 2400 → 1450 → … before).
    En.sort((a, b) => ue[a].cost - ue[b].cost);
    // 2.3.2: workshop texts must say what the module really does (full QA "workshop" section).
    // Drone Bay only works together with the Wingman upgrade. (Field Supply and Route Scanner
    // had the same effect until 2.3.5; their texts now live with their data.)
    const mod = (id) => ai.find((a) => a.id === id);
    mod("nova").desc = "Every wave starts with at least 25% Nova charge per level"; // floor, not additive
    mod("droneBay").desc = "+1 Wingman slot per level (needs the Wingman upgrade)";
    // 2.3.4: both add their charge once per level (10 / 5 per level); the text sounded like a flat bonus.
    mod("riftBattery").desc = "Start each wave with +10% Nova charge per level";
    mod("reactorCore").desc = "Start each wave with +5% Nova charge per level";
    // Route Scanner referenced a "map" icon that did not exist (fell back to "info").
    sp.map = '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>';
    rlApplyBiomeFixes();
  }
  var Me = Math.PI * 2,
    Lt = (i, t, e) => (i < t ? t : i > e ? e : i);
  function er(i, t) {
    let e = (t - i) % Me;
    return (e > Math.PI && (e -= Me), e < -Math.PI && (e += Me), e);
  }
  function Ne(i, t, e) {
    let n = er(i, t);
    return Math.abs(n) <= e ? t : i + Math.sign(n) * e;
  }
  var vn = (i, t) => 1 - Math.exp(-i * t);
  function qi(i) {
    let t = i >>> 0,
      e = () => {
        t = (t + 1831565813) >>> 0;
        let n = t;
        return (
          (n = Math.imul(n ^ (n >>> 15), n | 1)),
          (n ^= n + Math.imul(n ^ (n >>> 7), n | 61)),
          ((n ^ (n >>> 14)) >>> 0) / 4294967296
        );
      };
    return {
      next: e,
      range: (n, s) => n + (s - n) * e(),
      int: (n, s) => n + Math.floor(e() * (s - n + 1)),
      chance: (n) => e() < n,
      pick: (n) => n[Math.floor(e() * n.length)],
      get state() {
        return t;
      },
    };
  }
  function ou(i, t, e) {
    let n = 0;
    for (let r of e) n += r;
    if (n <= 0) return t[0];
    let s = i.next() * n;
    for (let r = 0; r < t.length; r++) if (((s -= e[r]), s <= 0)) return t[r];
    return t[t.length - 1];
  }
  function Yi(i) {
    let t = 2166136261;
    for (let e = 0; e < i.length; e++) ((t ^= i.charCodeAt(e)), (t = Math.imul(t, 16777619)));
    return t >>> 0;
  }
  function va(i) {
    i = Math.max(0, Math.floor(i));
    let t = Math.floor(i / 60),
      e = i % 60;
    return t + ":" + String(e).padStart(2, "0");
  }
  function qn(i) {
    return ((i = Math.floor(i)), i >= 1e4 ? (i / 1e3).toFixed(i >= 1e5 ? 0 : 1) + "k" : String(i));
  }
  var _a = __RL_VERSION__;
  var ue = {
      pulse: {
        id: "pulse",
        name: "Pulse Blaster",
        cost: 0,
        color: 4846335,
        blurb: "Reliable rapid fire. Scales with everything.",
        dmg: 12,
        rate: 6,
        speed: 27,
        life: 0.72,
        count: 1,
        spread: 0.035,
        fan: 0.13,
        r: 0.17,
        knock: 1.6,
        pierce: 0,
        shake: 0.03,
      },
      scatter: {
        id: "scatter",
        name: "Scattergun",
        cost: 120,
        color: 16760906,
        blurb: "Six piercing pellets at close range. Knocks enemies back.",
        dmg: 10,
        rate: 2,
        speed: 26,
        life: 0.5,
        count: 6,
        cone: 0.55,
        spread: 0.05,
        fan: 0.1,
        r: 0.15,
        knock: 3.4,
        pierce: 1,
        shake: 0.12,
      },
      tesla: {
        id: "tesla",
        name: "Arc Caster",
        cost: 300,
        color: 11635967,
        blurb: "Bolts that jump to two more enemies.",
        dmg: 11.5,
        rate: 5,
        speed: 34,
        life: 0.4,
        count: 1,
        spread: 0.05,
        fan: 0.14,
        r: 0.16,
        knock: 0.8,
        pierce: 0,
        chain: 2,
        shake: 0.03,
      },
      rail: {
        id: "rail",
        name: "Railgun",
        cost: 450,
        color: 8257434,
        blurb: "Slow, heavy slugs that pierce whole lines.",
        dmg: 58,
        rate: 1.1,
        speed: 95,
        life: 0.3,
        count: 1,
        spread: 0,
        fan: 0.09,
        r: 0.22,
        knock: 4.5,
        pierce: 4,
        shake: 0.18,
        rail: !0,
      },
      rocket: {
        id: "rocket",
        name: "Rocket Pod",
        cost: 650,
        color: 16738877,
        blurb: "Homing rockets with a splash radius.",
        dmg: 24,
        rate: 1.35,
        speed: 15,
        life: 1.25,
        count: 1,
        spread: 0.08,
        fan: 0.22,
        r: 0.22,
        knock: 2.5,
        pierce: 0,
        explode: 2.7,
        explodeDmg: 27,
        homing: 2.4,
        shake: 0.1,
      },
      disc: {
        id: "disc",
        name: "Disc Launcher",
        cost: 800,
        color: 4892927,
        blurb: "Spinning discs slice through everything \u2014 and come back.",
        dmg: 26,
        rate: 1.9,
        speed: 22,
        life: 1.2,
        count: 1,
        spread: 0.02,
        fan: 0.34,
        r: 0.34,
        knock: 1.2,
        pierce: 999,
        boomerang: !0,
        shake: 0.05,
      },
      flame: {
        id: "flame",
        name: "Ember Jet",
        cost: 1e3,
        color: 16747050,
        blurb: "A short torrent of fire. Everything it touches burns.",
        dmg: 5.1,
        rate: 15,
        speed: 23,
        life: 0.55,
        count: 1,
        spread: 0.14,
        fan: 0.12,
        r: 0.28,
        knock: 0.25,
        pierce: 2,
        burn: 10,
        drag: 1.2,
        grow: 1.9,
        shake: 0,
      },
    },
    En = ["pulse", "scatter", "tesla", "rail", "rocket", "disc", "flame"],
    Ae = {
      swarmer: {
        id: "swarmer",
        name: "Swarmer",
        hp: 8,
        speed: 5.6,
        r: 0.42,
        dmg: 8,
        cost: 1,
        shards: 1,
        from: 1,
        color: 16727423,
      },
      grunt: {
        id: "grunt",
        name: "Grunt",
        hp: 24,
        speed: 3.3,
        r: 0.62,
        dmg: 12,
        cost: 2,
        shards: 2,
        from: 1,
        color: 16734794,
      },
      gunner: {
        id: "gunner",
        name: "Gunner",
        hp: 20,
        speed: 2.9,
        r: 0.55,
        dmg: 10,
        cost: 3,
        shards: 3,
        from: 2,
        color: 16752957,
      },
      bomber: {
        id: "bomber",
        name: "Bomber",
        hp: 14,
        speed: 4.5,
        r: 0.5,
        dmg: 26,
        cost: 2,
        shards: 2,
        from: 3,
        color: 16769354,
      },
      splitter: {
        id: "splitter",
        name: "Splitter",
        hp: 44,
        speed: 2.6,
        r: 0.8,
        dmg: 12,
        cost: 4,
        shards: 3,
        from: 4,
        color: 4063156,
      },
      mite: {
        id: "mite",
        name: "Mite",
        hp: 7,
        speed: 5.8,
        r: 0.32,
        dmg: 6,
        cost: 0,
        shards: 0,
        from: 99,
        color: 4063156,
      },
      brute: {
        id: "brute",
        name: "Brute",
        hp: 100,
        speed: 2.1,
        r: 1.05,
        dmg: 18,
        cost: 6,
        shards: 6,
        from: 6,
        color: 16723797,
      },
      sniper: {
        id: "sniper",
        name: "Sniper",
        hp: 26,
        speed: 2.3,
        r: 0.55,
        dmg: 15,
        cost: 4,
        shards: 4,
        from: 7,
        color: 16730080,
      },
      hive: {
        id: "hive",
        name: "Hive",
        hp: 140,
        speed: 0.7,
        r: 1.2,
        dmg: 14,
        cost: 8,
        shards: 8,
        from: 9,
        color: 13041469,
      },
      bulwark: {
        id: "bulwark",
        name: "Bulwark",
        hp: 80,
        speed: 2,
        r: 0.85,
        dmg: 16,
        cost: 5,
        shards: 5,
        from: 8,
        color: 5941503,
      },
      striker: {
        id: "striker",
        name: "Striker",
        hp: 30,
        speed: 3.4,
        r: 0.5,
        dmg: 16,
        cost: 3,
        shards: 3,
        from: 11,
        color: 9207295,
      },
      mortar: {
        id: "mortar",
        name: "Mortar",
        hp: 46,
        speed: 1.6,
        r: 0.75,
        dmg: 20,
        cost: 4,
        shards: 4,
        from: 12,
        color: 14256701,
      },
      mender: {
        id: "mender",
        name: "Mender",
        hp: 40,
        speed: 2.4,
        r: 0.6,
        dmg: 8,
        cost: 4,
        shards: 5,
        from: 13,
        color: 7208904,
      },
      leaper: {
        id: "leaper",
        name: "Leaper",
        hp: 42,
        speed: 4.1,
        r: 0.6,
        dmg: 18,
        cost: 4,
        shards: 4,
        from: 10,
        color: 12562687,
      },
      turret: {
        id: "turret",
        name: "Rift Turret",
        hp: 52,
        speed: 1.1,
        r: 0.68,
        dmg: 14,
        cost: 5,
        shards: 6,
        from: 13,
        color: 3535103,
      },
    },
    lu = [
      "swarmer",
      "grunt",
      "gunner",
      "bomber",
      "splitter",
      "brute",
      "sniper",
      "hive",
      "bulwark",
      "striker",
      "mortar",
      "mender",
      "leaper",
      "turret",
    ],
    $i = {
      elite: {
        id: "elite",
        name: "ELITE SURGE",
        desc: "Fewer enemies, most of them elite · shards +50%",
        shardMul: 1.5,
        plan: { budget: 0.6, elite: 0.5 },
      },
      rain: {
        id: "rain",
        name: "SHARD RAIN",
        desc: "Shards fall from the sky — and so does the swarm",
        shardMul: 1,
        plan: { weights: { swarmer: 3, bomber: 1.6 } },
      },
    },
    Jl = 0.2,
    cu = {
      works: { id: "scorch", name: "Scorched", types: ["grunt", "brute", "splitter"], color: 16738858 },
      vault: { id: "frost", name: "Frost", types: ["gunner", "sniper", "mortar"], color: 11462911 },
      void: { id: "phase", name: "Phase", types: ["swarmer", "grunt", "gunner"], color: 16732120 },
      marsh: { id: "toxic", name: "Toxic", types: ["grunt", "splitter", "swarmer", "bomber"], color: 11861821 },
    },
    hu = [
      [10, 3],
      [25, 8],
      [50, 20],
      [100, 45],
      [150, 80],
      [250, 150],
    ],
    ba = {
      shielded: { name: "Shielded", color: 7325951 },
      hasted: { name: "Hasted", color: 16773754 },
      volatile: { name: "Volatile", color: 16734778 },
    },
    en = {
      warden: {
        id: "warden",
        name: "THE WARDEN",
        title: "Gatekeeper of the Yard",
        hp: 1500,
        r: 2,
        speed: 2.4,
        dmg: 22,
        shards: 60,
        color: 16727386,
      },
      queen: {
        id: "queen",
        name: "HIVE QUEEN",
        title: "Mother of the Swarm",
        hp: 3e3,
        r: 1.9,
        speed: 2,
        dmg: 20,
        shards: 100,
        color: 13041469,
      },
      prism: {
        id: "prism",
        name: "PRISM",
        title: "The Splitting Light",
        hp: 4400,
        r: 1.6,
        speed: 3,
        dmg: 24,
        shards: 150,
        color: 9431295,
      },
      core: {
        id: "core",
        name: "RIFT CORE",
        title: "Heart of the Breach",
        hp: 7600,
        r: 2.4,
        speed: 1.2,
        dmg: 26,
        shards: 250,
        color: 11758591,
      },
    },
    uu = { 5: "warden", 10: "queen", 15: "prism", 20: "core" },
    Kl = ["warden", "queen", "prism", "core"],
    ii = [
      {
        id: "yard",
        name: "Neon Yard",
        W: 18,
        H: 18,
        floor: 659746,
        grid: 2017535,
        accent: 16727423,
        fog: 395798,
        sky: 2771594,
        ground: 657944,
        wall: 1385016,
        obstacles: [
          { t: "c", x: -7, y: -7, r: 1.3 },
          { t: "c", x: 7, y: -7, r: 1.3 },
          { t: "c", x: -7, y: 7, r: 1.3 },
          { t: "c", x: 7, y: 7, r: 1.3 },
        ],
      },
      {
        id: "works",
        name: "Ember Works",
        W: 19,
        H: 17,
        floor: 1510153,
        grid: 16742958,
        accent: 16760906,
        fog: 1049860,
        sky: 9058848,
        ground: 1181702,
        wall: 2757648,
        obstacles: [
          { t: "b", x: 0, y: -7, w: 4, h: 0.8 },
          { t: "b", x: 0, y: 7, w: 4, h: 0.8 },
          { t: "c", x: -11, y: 0, r: 1.5 },
          { t: "c", x: 11, y: 0, r: 1.5 },
        ],
      },
      {
        id: "vault",
        name: "Cryo Vault",
        W: 18,
        H: 18,
        floor: 398361,
        grid: 9431295,
        accent: 15268863,
        fog: 266266,
        sky: 4885160,
        ground: 397336,
        wall: 993846,
        obstacles: [
          { t: "b", x: -9, y: 0, w: 0.8, h: 3 },
          { t: "b", x: 9, y: 0, w: 0.8, h: 3 },
          { t: "c", x: 0, y: -9.5, r: 1.4 },
          { t: "c", x: 0, y: 9.5, r: 1.4 },
        ],
      },
      {
        id: "void",
        name: "Void Core",
        W: 17,
        H: 17,
        floor: 854040,
        grid: 10771711,
        accent: 16732120,
        fog: 459791,
        sky: 4860554,
        ground: 525583,
        wall: 1970742,
        obstacles: [
          { t: "c", x: -10, y: -10, r: 1.2 },
          { t: "c", x: 10, y: -10, r: 1.2 },
          { t: "c", x: -10, y: 10, r: 1.2 },
          { t: "c", x: 10, y: 10, r: 1.2 },
        ],
      },
      {
        id: "marsh",
        name: "Toxin Marsh",
        W: 18,
        H: 17,
        floor: 529420,
        grid: 8257370,
        accent: 13958973,
        fog: 265222,
        sky: 3828266,
        ground: 397320,
        wall: 1320474,
        obstacles: [
          { t: "c", x: -8, y: -6, r: 1.4 },
          { t: "c", x: 8, y: 6, r: 1.4 },
          { t: "b", x: 8, y: -7, w: 1.6, h: 0.8 },
          { t: "b", x: -8, y: 7, w: 1.6, h: 0.8 },
        ],
      },
    ],
    du = Object.fromEntries(ii.map((i) => [i.id, i]));
  function fu(i) {
    let t = ii.slice(1).map((e) => e.id);
    for (let e = t.length - 1; e > 0; e--) {
      let n = Math.floor(i.next() * (e + 1));
      [t[e], t[n]] = [t[n], t[e]];
    }
    return ["yard", ...t];
  }
  var si = [
      { lvl: 0, name: "Standard", desc: "The rift as it is." },
      { lvl: 1, name: "Threat I", desc: "Enemies +25% health, +12% damage." },
      { lvl: 2, name: "Threat II", desc: "More elites, denser waves." },
      { lvl: 3, name: "Threat III", desc: "Bosses hit harder and faster." },
      { lvl: 4, name: "Threat IV", desc: "Only for tuned builds." },
      { lvl: 5, name: "Threat V", desc: "The breach at full strength." },
    ],
    Ma = (i) => ({
      hp: 1 + 0.25 * i,
      dmg: 1 + 0.12 * i,
      budget: 1 + 0.1 * i,
      elite: 0.05 * i,
      shards: 1 + 0.25 * i,
      boss: 1 + 0.3 * i,
    }),
    jl = ["", "Common", "Rare", "Epic", "Legendary", "Evolution"],
    Zi = [
      { id: "dmg", name: "High-Yield Rounds", rarity: 1, max: 8, icon: "burst", desc: () => "+15% damage" },
      { id: "rate", name: "Rapid Cycler", rarity: 1, max: 8, icon: "rate", desc: () => "+12% fire rate" },
      { id: "hp", name: "Reinforced Hull", rarity: 1, max: 6, icon: "shield", desc: () => "+20 max HP and repair 20" },
      { id: "speed", name: "Servo Thrusters", rarity: 1, max: 4, icon: "wing", desc: () => "+8% move speed" },
      {
        id: "velocity",
        name: "Long Barrel",
        rarity: 1,
        max: 4,
        icon: "arrow",
        desc: () => "+20% projectile speed and range",
      },
      { id: "magnet", name: "Tractor Field", rarity: 1, max: 3, icon: "magnet", desc: () => "+45% pickup radius" },
      {
        id: "crit",
        name: "Targeting Chip",
        rarity: 1,
        max: 5,
        icon: "crosshair",
        desc: () => "+8% critical hit chance (x2 damage)",
      },
      {
        id: "heal",
        name: "Field Repair",
        rarity: 1,
        max: 99,
        icon: "heart",
        desc: () => "Repair 45% of max HP",
        repeat: !0,
      },
      { id: "multishot", name: "Split Chamber", rarity: 2, max: 4, icon: "fan", desc: () => "+1 projectile per shot" },
      {
        id: "pierce",
        name: "Tungsten Core",
        rarity: 2,
        max: 3,
        icon: "pierce",
        desc: () => "Projectiles pierce +1 enemy",
      },
      {
        id: "ricochet",
        name: "Rebound",
        rarity: 2,
        max: 3,
        icon: "bounce",
        desc: () => "Projectiles bounce to +1 nearby enemy",
      },
      {
        id: "orbit",
        name: "Orbital Blades",
        rarity: 2,
        max: 4,
        icon: "orbit",
        desc: () => "+1 blade circling you. Blocks enemy shots.",
      },
      {
        id: "shield",
        name: "Aegis Shell",
        rarity: 2,
        max: 3,
        icon: "shield",
        desc: (i) => "Block a hit every " + [12, 8, 5][Math.min(i, 2)] + " s",
      },
      {
        id: "regen",
        name: "Nanite Swarm",
        rarity: 2,
        max: 3,
        icon: "heart",
        desc: (i) => `Regenerate ${(0.8 * (i + 1)).toFixed(1)} HP per second`,
      },
      {
        id: "cryo",
        name: "Cryo Rounds",
        rarity: 2,
        max: 3,
        icon: "snow",
        desc: (i) => `${15 * (i + 1)}% chance to slow enemies by 45%`,
      },
      {
        id: "shockdash",
        name: "Shock Dash",
        rarity: 2,
        max: 2,
        icon: "wing",
        desc: (i) => `Dashing through enemies deals ${i ? 48 : 30} damage`,
      },
      {
        id: "payload",
        name: "Payload",
        rarity: 3,
        max: 3,
        icon: "burst",
        desc: (i) => `Hits explode for ${40 + 15 * i}% damage around the target`,
      },
      {
        id: "arc",
        name: "Arc Relay",
        rarity: 3,
        max: 3,
        icon: "bolt",
        desc: (i) => `${20 + 10 * i}% chance for hits to chain to 2 enemies`,
      },
      {
        id: "seeker",
        name: "Seeker Rounds",
        rarity: 3,
        max: 2,
        icon: "crosshair",
        desc: () => "Projectiles curve toward enemies",
      },
      {
        id: "thermite",
        name: "Thermite",
        rarity: 3,
        max: 3,
        icon: "flame",
        desc: (i) => `Hits burn for ${30 + 15 * i}% of their damage per second`,
      },
      {
        id: "siphon",
        name: "Siphon",
        rarity: 3,
        max: 2,
        icon: "heart",
        desc: (i) => `Kills have a ${12 + 6 * i}% chance to repair 4 HP`,
      },
      {
        id: "rearguard",
        name: "Rear Guard",
        rarity: 3,
        max: 2,
        icon: "fan",
        desc: (i) => (i === 0 ? "Also fire backward" : "Also fire to both sides") + " at 60% damage",
      },
      {
        id: "overcharge",
        name: "Overcharge",
        rarity: 3,
        max: 2,
        icon: "star",
        desc: () => "Nova charges 40% faster, +25% radius",
      },
      {
        id: "overclock",
        name: "Overclock Matrix",
        rarity: 2,
        max: 3,
        icon: "rate",
        desc: (l, i = l + 1) => `+${8 * i}% fire rate and +${5 * i}% projectile speed`,
      },
      {
        id: "wingman",
        name: "Wingman",
        rarity: 4,
        max: 2,
        icon: "drone",
        desc: () => "A drone that fights beside you",
      },
      {
        id: "bounty",
        name: "Bounty Protocol",
        rarity: 2,
        max: 3,
        icon: "star",
        desc: (l, i = l + 1) => `Elite kills drop +${2 * i} shards`,
      },
      {
        id: "bloodrush",
        name: "Bloodrush",
        rarity: 4,
        max: 1,
        icon: "rate",
        desc: () => "Each kill: +4% fire rate for 4 s (stacks to 40%)",
      },
      {
        id: "colossus",
        name: "Colossus Rounds",
        rarity: 4,
        max: 1,
        icon: "burst",
        desc: () => "+60% projectile size, +45% damage, -12% fire rate",
      },
      {
        id: "capacitor",
        name: "Capacitor Bank",
        rarity: 3,
        max: 3,
        icon: "bolt",
        desc: (l, i = l + 1) => `Kills grant +${3 * i}% Nova charge`,
      },
      {
        id: "chrono",
        name: "Chrono Dash",
        rarity: 4,
        max: 1,
        icon: "clock",
        desc: () => "Dashing slows enemies and their shots for 2 s",
      },
      {
        id: "momentum",
        name: "Momentum Core",
        rarity: 2,
        max: 3,
        icon: "wing",
        desc: (i) => `+${9 * (i + 1)}% fire rate while moving`,
      },
      {
        id: "laststand",
        name: "Last Stand Plating",
        rarity: 2,
        max: 2,
        icon: "shield",
        desc: (i) => `-${18 * (i + 1)}% incoming damage below 35% hull`,
      },
      {
        id: "scavenger",
        name: "Salvage Pulse",
        rarity: 2,
        max: 3,
        icon: "magnet",
        desc: (i) => `Every ${30 - 5 * (i + 1)} kills releases +${2 * (i + 1)} bonus shards`,
      },
      {
        id: "vector",
        name: "Vector Capacitor",
        rarity: 2,
        max: 3,
        icon: "arrow",
        desc: (i) => `-${8 * (i + 1)}% dash cooldown`,
      },
      {
        id: "halo",
        name: "Halo",
        rarity: 5,
        max: 1,
        icon: "orbit",
        evo: { orbit: 3, shield: 1 },
        desc: () => "Blades grow, hit twice as hard and circle wider. Aegis recharges 30% faster.",
      },
      {
        id: "cluster",
        name: "Cluster Payload",
        rarity: 5,
        max: 1,
        icon: "burst",
        evo: { payload: 2, seeker: 1 },
        desc: () => "Every Payload blast throws 3 homing bomblets.",
      },
      {
        id: "storm",
        name: "Storm Relay",
        rarity: 5,
        max: 1,
        icon: "bolt",
        evo: { arc: 2, rate: 3 },
        desc: () => "+30% chain chance. Chains jump to 4 enemies.",
      },
      {
        id: "inferno",
        name: "Inferno",
        rarity: 5,
        max: 1,
        icon: "flame",
        evo: { thermite: 2, dmg: 3 },
        desc: () => "Burning enemies explode when they die and set others alight.",
      },
      {
        id: "phantom",
        name: "Phantom Dash",
        rarity: 5,
        max: 1,
        icon: "wing",
        evo: { shockdash: 1, speed: 2 },
        desc: () => "Dash cooldown -40%. Your dash leaves a searing trail.",
      },
      {
        id: "gunship",
        name: "Gunship",
        rarity: 5,
        max: 1,
        icon: "drone",
        evo: { wingman: 1, multishot: 2 },
        desc: () => "A second drone joins you. Drones fire 3-shot spreads.",
      },
      {
        id: "overdrive",
        name: "Overdrive Pulse",
        rarity: 5,
        max: 1,
        icon: "rate",
        weapon: "pulse",
        evo: { rate: 3, multishot: 1 },
        desc: () => "Every 4th shot is a heavy bolt: triple damage, bigger, pierces 3 enemies.",
      },
      {
        id: "shredder",
        name: "Shredder",
        rarity: 5,
        max: 1,
        icon: "fan",
        weapon: "scatter",
        evo: { multishot: 1, pierce: 1 },
        desc: () => "+2 pellets per blast, and every pellet ricochets once.",
      },
      {
        id: "tempest",
        name: "Tempest",
        rarity: 5,
        max: 1,
        icon: "bolt",
        weapon: "tesla",
        evo: { rate: 2, crit: 2 },
        desc: () => "Bolts jump to 4 enemies instead of 2 and lose less power per jump.",
      },
      {
        id: "lance",
        name: "Lance",
        rarity: 5,
        max: 1,
        icon: "pierce",
        weapon: "rail",
        evo: { pierce: 1, velocity: 1 },
        desc: () => "Slugs pass through walls and pierce every enemy in their path.",
      },
      {
        id: "hellfire",
        name: "Hellfire",
        rarity: 5,
        max: 1,
        icon: "burst",
        weapon: "rocket",
        evo: { payload: 1, dmg: 2 },
        desc: () => "Blasts are 35% bigger and set everything they hit on fire.",
      },
      {
        id: "twinsaw",
        name: "Twin Saws",
        rarity: 5,
        max: 1,
        icon: "orbit",
        weapon: "disc",
        evo: { rate: 2, velocity: 1 },
        desc: () => "Discs are 40% bigger, hit 35% harder and seek enemies on the way out.",
      },
      {
        id: "dragon",
        name: "Dragon's Breath",
        rarity: 5,
        max: 1,
        icon: "flame",
        weapon: "flame",
        evo: { thermite: 1, dmg: 2 },
        desc: () => "Flames reach 30% further and burn 60% hotter.",
      },
    ],
    ri = Object.fromEntries(Zi.map((i) => [i.id, i])),
    ai = [
      {
        id: "hull",
        name: "Hull Plating",
        icon: "shield",
        desc: "+10 max HP per level",
        costs: [60, 120, 200, 320, 480],
      },
      { id: "power", name: "Power Core", icon: "burst", desc: "+5% damage per level", costs: [80, 160, 260, 400, 600] },
      { id: "thrust", name: "Thrusters", icon: "wing", desc: "+4% move speed per level", costs: [60, 130, 220, 340] },
      {
        id: "dash",
        name: "Dash Capacitor",
        icon: "clock",
        desc: "-8% dash cooldown per level",
        costs: [50, 110, 190, 300],
      },
      { id: "magnet", name: "Magnet Coil", icon: "magnet", desc: "+20% pickup radius per level", costs: [40, 90, 160] },
      {
        id: "salvage",
        name: "Salvager",
        icon: "shard",
        desc: "+10% shards per level",
        costs: [100, 200, 320, 480, 700],
      },
      { id: "reroll", name: "Reroll Chip", icon: "reroll", desc: "+1 upgrade reroll per run", costs: [150, 300, 500] },
      { id: "nova", name: "Nova Cell", icon: "star", desc: "Start each wave with +25% Nova charge", costs: [120, 260] },
      {
        id: "insight",
        name: "Insight Module",
        icon: "eye",
        desc: "Choose from 4 upgrades instead of 3",
        costs: [1200],
      },
      { id: "revive", name: "Second Life", icon: "heart", desc: "Revive once per run at 50% HP", costs: [900] },
    ],
    p_ = Object.fromEntries(ai.map((i) => [i.id, i])),
    _i = [
      {
        id: "kills100",
        name: "First Contact",
        desc: "Destroy 100 enemies",
        reward: 50,
        test: (i) => i.stats.kills >= 100,
      },
      { id: "wave5", name: "Holding the Line", desc: "Reach wave 5", reward: 40, test: (i) => i.stats.bestWave >= 5 },
      {
        id: "warden",
        name: "Gate Crasher",
        desc: "Defeat the Warden",
        reward: 100,
        test: (i) => (i.stats.bosses.warden || 0) > 0,
      },
      {
        id: "queen",
        name: "Regicide",
        desc: "Defeat the Hive Queen",
        reward: 150,
        test: (i) => (i.stats.bosses.queen || 0) > 0,
      },
      {
        id: "prism",
        name: "Shattered Light",
        desc: "Defeat Prism",
        reward: 200,
        test: (i) => (i.stats.bosses.prism || 0) > 0,
      },
      { id: "clear", name: "Rift Sealed", desc: "Clear all 20 waves", reward: 400, test: (i) => i.stats.clears > 0 },
      {
        id: "legend",
        name: "Lucky Find",
        desc: "Pick a Legendary upgrade",
        reward: 80,
        test: (i) => i.stats.legendaries > 0,
      },
      {
        id: "flawless",
        name: "Untouchable",
        desc: "Clear wave 8 or later without taking damage",
        reward: 150,
        test: (i) => i.stats.flawless > 0,
      },
      {
        id: "kills2500",
        name: "Exterminator",
        desc: "Destroy 2,500 enemies",
        reward: 200,
        test: (i) => i.stats.kills >= 2500,
      },
      {
        id: "arsenal",
        name: "Full Arsenal",
        desc: "Unlock every weapon",
        reward: 200,
        test: (i) => En.every((t) => i.weapons[t]),
      },
      {
        id: "maxed",
        name: "Fine Tuned",
        desc: "Max out one workshop module",
        reward: 100,
        test: (i) => ai.some((t) => (i.workshop[t.id] || 0) >= t.costs.length),
      },
      {
        id: "threat2",
        name: "Heat Seeker",
        desc: "Clear a run on Threat II",
        reward: 400,
        test: (i) => i.stats.bestClearThreat >= 2,
      },
      { id: "wave30", name: "Endless Echo", desc: "Reach wave 30", reward: 500, test: (i) => i.stats.bestWave >= 30 },
      {
        id: "allweapons",
        name: "Master of Arms",
        desc: "Clear a run with every weapon",
        reward: 800,
        test: (i) => En.every((t) => (i.stats.clearsBy[t] || 0) > 0),
      },
      {
        id: "threat5",
        name: "Breach Breaker",
        desc: "Clear a run on Threat V",
        reward: 1500,
        test: (i) => i.stats.bestClearThreat >= 5,
      },
      {
        id: "evolve",
        name: "Evolution",
        desc: "Evolve two upgrades into one",
        reward: 150,
        test: (i) => i.stats.evolved > 0,
      },
      {
        id: "combo50",
        name: "Chain Reaction",
        desc: "Reach a \xD750 kill combo",
        reward: 150,
        test: (i) => i.stats.bestCombo >= 50,
      },
      {
        id: "combo150",
        name: "Unstoppable",
        desc: "Reach a \xD7150 kill combo",
        reward: 400,
        test: (i) => i.stats.bestCombo >= 150,
      },
      {
        id: "kills5000",
        name: "Rift Sweeper",
        desc: "Destroy 5,000 enemies",
        reward: 350,
        test: (i) => i.stats.kills >= 5000,
      },
      { id: "wave50", name: "Deep Breach", desc: "Reach wave 50", reward: 700, test: (i) => i.stats.bestWave >= 50 },
      {
        id: "bosses10",
        name: "Boss Hunter",
        desc: "Defeat 10 bosses total",
        reward: 500,
        test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 10,
      },
      {
        id: "combo300",
        name: "Cascade",
        desc: "Reach a \xD7300 kill combo",
        reward: 650,
        test: (i) => i.stats.bestCombo >= 300,
      },
      { id: "clears5", name: "Veteran", desc: "Seal the Rift 5 times", reward: 450, test: (i) => i.stats.clears >= 5 },
      {
        id: "evolve3",
        name: "Master Crafter",
        desc: "Evolve upgrades 3 times",
        reward: 450,
        test: (i) => i.stats.evolved >= 3,
      },
      {
        id: "kills10000",
        name: "World Eater",
        desc: "Destroy 10,000 enemies",
        reward: 900,
        test: (i) => i.stats.kills >= 10000,
      },
      { id: "wave75", name: "Abyss Walker", desc: "Reach wave 75", reward: 1000, test: (i) => i.stats.bestWave >= 75 },
      {
        id: "combo500",
        name: "Riftstorm",
        desc: "Reach a ×500 kill combo",
        reward: 1000,
        test: (i) => i.stats.bestCombo >= 500,
      },
      {
        id: "bosses25",
        name: "Apex Hunter",
        desc: "Defeat 25 bosses total",
        reward: 1200,
        test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 25,
      },
    ];
  var Sa = class {
    constructor(t, e) {
      this.biome = t;
      let n = e || { key: t.id + ":classic", W: t.W, H: t.H, obstacles: t.obstacles, deco: 0 };
      ((this.key = n.key),
        (this.director = n.director || null),
        (this.deco = n.deco || 0),
        (this.template = n.template || "classic"),
        (this.W = n.W),
        (this.H = n.H),
        (this.obs = n.obstacles.map((r) => ({ ...r }))));
      let s = n.features || {};
      ((this.vents = (s.vents || []).map((r) => ({ ...r }))),
        (this.ice = (s.ice || []).map((r) => ({ ...r }))),
        (this.portals = (s.portals || []).map((r) => ({ ...r }))),
        (this.acid = (s.acid || []).map((r) => ({ ...r }))),
        (this.flow = new Ql(this)));
    }
    ventState(t, e) {
      let n = (e + t.phase) % t.period,
        s = t.period - 1.5,
        r = s - 1.2;
      return n >= s ? "erupt" : n >= r ? "warn" : "idle";
    }
    inAcid(t, e) {
      for (let n of this.acid) {
        let s = t - n.x,
          r = e - n.y;
        if (s * s + r * r < n.r * n.r) return !0;
      }
      return !1;
    }
    onIce(t, e) {
      for (let n of this.ice) {
        let s = t - n.x,
          r = e - n.y;
        if (s * s + r * r < n.r * n.r) return !0;
      }
      return !1;
    }
    blocked(t, e, n = 0) {
      for (let s of this.obs)
        if (s.t === "c") {
          let r = t - s.x,
            a = e - s.y,
            o = s.r + n;
          if (r * r + a * a < o * o) return !0;
        } else if (Math.abs(t - s.x) < s.w + n && Math.abs(e - s.y) < s.h + n) return !0;
      return !1;
    }
    outside(t, e, n = 0) {
      return t < -this.W + n || t > this.W - n || e < -this.H + n || e > this.H - n;
    }
    resolve(t, e) {
      let n = !1;
      for (let a of this.obs)
        if (a.t === "c") {
          let o = t.x - a.x,
            c = t.y - a.y,
            h = a.r + e,
            l = o * o + c * c;
          if (l < h * h) {
            if (l < 1e-10) {
              ((t.x = a.x + h), (n = !0));
              continue;
            }
            let u = Math.sqrt(l);
            ((t.x = a.x + (o / u) * h), (t.y = a.y + (c / u) * h), (n = !0));
          }
        } else {
          let o = Lt(t.x, a.x - a.w, a.x + a.w),
            c = Lt(t.y, a.y - a.h, a.y + a.h),
            h = t.x - o,
            l = t.y - c,
            u = h * h + l * l;
          if (u < e * e) {
            if (u > 1e-8) {
              let d = Math.sqrt(u);
              ((t.x = o + (h / d) * e), (t.y = c + (l / d) * e));
            } else {
              let d = a.w + e - Math.abs(t.x - a.x),
                f = a.h + e - Math.abs(t.y - a.y);
              d < f
                ? (t.x = a.x + Math.sign(t.x - a.x || 1) * (a.w + e))
                : (t.y = a.y + Math.sign(t.y - a.y || 1) * (a.h + e));
            }
            n = !0;
          }
        }
      let s = this.W - e,
        r = this.H - e;
      return (
        t.x < -s ? ((t.x = -s), (n = !0)) : t.x > s && ((t.x = s), (n = !0)),
        t.y < -r ? ((t.y = -r), (n = !0)) : t.y > r && ((t.y = r), (n = !0)),
        n
      );
    }
    los(t, e, n, s, r = 0) {
      for (let a of this.obs)
        if (a.t === "c") {
          let o = a.r + r,
            c = n - t,
            h = s - e,
            l = c * c + h * h,
            u = l > 0 ? ((a.x - t) * c + (a.y - e) * h) / l : 0;
          u = Lt(u, 0, 1);
          let d = t + c * u - a.x,
            f = e + h * u - a.y;
          if (d * d + f * f < o * o) return !1;
        } else if (Ep(t, e, n, s, a.x - a.w - r, a.y - a.h - r, a.x + a.w + r, a.y + a.h + r)) return !1;
      return !0;
    }
    rayLen(t, e, n, s) {
      let r = Math.cos(n),
        a = Math.sin(n);
      for (let o = 0.8; o < s; o += 0.35) {
        let c = t + r * o,
          h = e + a * o;
        if (this.outside(c, h) || this.blocked(c, h, 0)) return o;
      }
      return s;
    }
    featureBlocked(t, e, n = 0.35) {
      let s = (r, a, o, c = 0.55) => {
        let h = t - r,
          l = e - a,
          u = o + c + n;
        return h * h + l * l < u * u;
      };
      for (let r of this.vents) if (s(r.x, r.y, r.r, 0.7)) return !0;
      for (let r of this.ice) if (s(r.x, r.y, r.r, 0.45)) return !0;
      for (let r of this.acid) if (s(r.x, r.y, r.r, 0.55)) return !0;
      for (let r of this.portals) if (s(r.ax, r.ay, 1, 0.45) || s(r.bx, r.by, 1, 0.45)) return !0;
      return !1;
    }
    freePoint(t, e, n, s, r = 1) {
      let a = null,
        o = -1e9,
        f = null,
        p = -1;
      for (let c = 0; c < 72; c++) {
        let h = t.range(-this.W + 1.5, this.W - 1.5),
          l = t.range(-this.H + 1.5, this.H - 1.5);
        if (this.blocked(h, l, r + 0.4) || this.featureBlocked(h, l, r * 0.3)) continue;
        let u = h - e,
          d = l - n,
          g = u * u + d * d,
          x = Math.sqrt(g);
        x > p && ((p = x), (f = { x: h, y: l }));
        if (g < s * s) continue;
        let m = Math.min(this.W - Math.abs(h), this.H - Math.abs(l)),
          v = x + Math.min(5, m) * 0.35 + t.next() * 0.7;
        v > o && ((o = v), (a = { x: h, y: l }));
      }
      if (a) return a;
      for (let c of [
        [0, -this.H + 2],
        [0, this.H - 2],
        [-this.W + 2, 0],
        [this.W - 2, 0],
        [-this.W + 2, -this.H + 2],
        [this.W - 2, -this.H + 2],
        [-this.W + 2, this.H - 2],
        [this.W - 2, this.H - 2],
      ]) {
        if (this.blocked(c[0], c[1], r + 0.4) || this.featureBlocked(c[0], c[1], r * 0.3)) continue;
        let h = Math.hypot(c[0] - e, c[1] - n);
        if (h >= s) return { x: c[0], y: c[1] };
        h > p && ((p = h), (f = { x: c[0], y: c[1] }));
      }
      if (f) return f;
      const h = e > 0 ? -this.W + 2 : this.W - 2,
        l = n > 0 ? -this.H + 2 : this.H - 2;
      return this.blocked(h, l, r + 0.1) || this.featureBlocked(h, l, r * 0.1) ? { x: 0, y: 0 } : { x: h, y: l };
    }
  };
  function Ep(i, t, e, n, s, r, a, o) {
    let c = 0,
      h = 1,
      l = e - i,
      u = n - t,
      d = [-l, l, -u, u],
      f = [i - s, a - i, t - r, o - t];
    for (let p = 0; p < 4; p++) {
      if (d[p] === 0) {
        if (f[p] < 0) return !1;
        continue;
      }
      let x = f[p] / d[p];
      if (d[p] < 0) {
        if (x > h) return !1;
        x > c && (c = x);
      } else {
        if (x < c) return !1;
        x < h && (h = x);
      }
    }
    return !0;
  }
  var wa = class {
      constructor(t, e, n = 2.5) {
        ((this.cell = n),
          (this.ox = -t - 2),
          (this.oy = -e - 2),
          (this.cols = Math.ceil((2 * t + 4) / n)),
          (this.rows = Math.ceil((2 * e + 4) / n)));
        let s = this.cols * this.rows;
        ((this.start = new Int32Array(s + 1)),
          (this.count = new Int32Array(s)),
          (this.items = []),
          (this.cellOf = new Int32Array(0)),
          (this.list = null),
          (this.maxR = 1));
      }
      _cell(t, e) {
        let n = Lt(Math.floor((t - this.ox) / this.cell), 0, this.cols - 1);
        return Lt(Math.floor((e - this.oy) / this.cell), 0, this.rows - 1) * this.cols + n;
      }
      build(t) {
        this.list = t;
        let e = t.length;
        (this.cellOf.length < e && (this.cellOf = new Int32Array(Math.max(e, this.cellOf.length * 2, 64))),
          this.count.fill(0));
        let n = 0.5;
        for (let a = 0; a < e; a++) {
          let o = t[a],
            c = this._cell(o.x, o.y);
          ((this.cellOf[a] = c), this.count[c]++, o.r > n && (n = o.r));
        }
        this.maxR = n;
        let s = 0;
        for (let a = 0; a < this.count.length; a++) ((this.start[a] = s), (s += this.count[a]));
        this.start[this.count.length] = s;
        let r = this.count;
        (r.fill(0), (this.items.length = e));
        for (let a = 0; a < e; a++) {
          let o = this.cellOf[a];
          this.items[this.start[o] + r[o]++] = t[a];
        }
      }
      query(t, e, n, s) {
        let r = n + this.maxR,
          a = Lt(Math.floor((t - r - this.ox) / this.cell), 0, this.cols - 1),
          o = Lt(Math.floor((t + r - this.ox) / this.cell), 0, this.cols - 1),
          c = Lt(Math.floor((e - r - this.oy) / this.cell), 0, this.rows - 1),
          h = Lt(Math.floor((e + r - this.oy) / this.cell), 0, this.rows - 1);
        for (let l = c; l <= h; l++)
          for (let u = a; u <= o; u++) {
            let d = l * this.cols + u;
            for (let f = this.start[d], p = this.start[d + 1]; f < p; f++) if (s(this.items[f])) return;
          }
      }
    },
    Ql = class {
      constructor(t) {
        ((this.a = t), (this.cs = 1), (this.cols = Math.ceil(t.W * 2)), (this.rows = Math.ceil(t.H * 2)));
        let e = this.cols * this.rows;
        ((this.block = new Uint8Array(e)),
          (this.dist = new Int32Array(e)),
          (this.dx = new Float32Array(e)),
          (this.dy = new Float32Array(e)),
          (this.queue = new Int32Array(e)),
          (this.target = -1));
        for (let n = 0; n < this.rows; n++)
          for (let s = 0; s < this.cols; s++) {
            let r = -t.W + (s + 0.5) * this.cs,
              a = -t.H + (n + 0.5) * this.cs;
            this.block[n * this.cols + s] = t.blocked(r, a, 0.55) ? 1 : 0;
          }
      }
      idx(t, e) {
        let n = Lt(Math.floor((t + this.a.W) / this.cs), 0, this.cols - 1);
        return Lt(Math.floor((e + this.a.H) / this.cs), 0, this.rows - 1) * this.cols + n;
      }
      update(t, e) {
        let n = this.idx(t, e);
        if (n === this.target) return;
        this.target = n;
        let { cols: s, rows: r, dist: a, block: o, queue: c } = this;
        a.fill(1 << 30);
        let h = 0,
          l = 0;
        for (a[n] = 0, c[l++] = n; h < l; ) {
          let u = c[h++],
            d = u % s,
            f = (u / s) | 0,
            p = a[u] + 1,
            x;
          (d > 0 && !o[(x = u - 1)] && a[x] > p && ((a[x] = p), (c[l++] = x)),
            d < s - 1 && !o[(x = u + 1)] && a[x] > p && ((a[x] = p), (c[l++] = x)),
            f > 0 && !o[(x = u - s)] && a[x] > p && ((a[x] = p), (c[l++] = x)),
            f < r - 1 && !o[(x = u + s)] && a[x] > p && ((a[x] = p), (c[l++] = x)));
        }
        for (let u = 0; u < r; u++)
          for (let d = 0; d < s; d++) {
            let f = u * s + d,
              p = a[f],
              x = 0,
              m = 0;
            for (let M = -1; M <= 1; M++)
              for (let b = -1; b <= 1; b++) {
                if (!b && !M) continue;
                let v = d + b,
                  S = u + M;
                if (v < 0 || S < 0 || v >= s || S >= r) continue;
                let T = S * s + v;
                (b && M && (o[u * s + v] || o[S * s + d])) || (a[T] < p && ((p = a[T]), (x = b), (m = M)));
              }
            let g = Math.hypot(x, m) || 1;
            ((this.dx[f] = x / g), (this.dy[f] = m / g));
          }
      }
    };
  function nrCore(i, t, e) {
    let n = ue[i] || ue.pulse,
      s = (u) => t[u] || 0,
      r = (u) => e[u] || 0,
      a = s("colossus") > 0,
      o = (u, d, f) => (s(u) ? d + f * (s(u) - 1) : 0),
      c = (u) => s(u) > 0,
      h = s("shield") ? [12, 8, 5][Math.min(s("shield"), 3) - 1] * (c("halo") ? 0.7 : 1) : 0,
      l = o("arc", 0.2, 0.1);
    return {
      weapon: n,
      maxHp: 100 + 10 * r("hull") + 20 * s("hp"),
      speed: 6.2 * (1 + 0.04 * r("thrust")) * (1 + 0.08 * s("speed")),
      dmgMul: (1 + 0.05 * r("power")) * (1 + 0.15 * s("dmg")) * (a ? 1.45 : 1) * (c("twinsaw") ? 1.35 : 1),
      rateMul: (1 + 0.12 * s("rate")) * (1 + 0.08 * s("overclock")) * (a ? 0.88 : 1),
      velMul: (1 + 0.2 * s("velocity")) * (1 + 0.05 * s("overclock")) * (c("dragon") ? 1.3 : 1),
      sizeMul: (a ? 1.6 : 1) * (c("twinsaw") ? 1.4 : 1),
      extra: s("multishot") + (c("shredder") ? 1 : 0),
      pierce: (n.pierce || 0) + s("pierce"),
      bounce: s("ricochet") + (c("shredder") ? 1 : 0),
      crit: 0.05 + 0.08 * s("crit"),
      critMul: 2,
      magnet: 2.4 * (1 + 0.2 * r("magnet")) * (1 + 0.45 * s("magnet")),
      dashCd: 1.9 * (1 - 0.08 * r("dash")) * (1 - 0.08 * s("vector")) * (c("phantom") ? 0.6 : 1),
      momentum: 0.09 * s("momentum"),
      laststand: 0.18 * s("laststand"),
      scavenger: s("scavenger"),
      regen: 0.8 * s("regen"),
      shieldCd: h,
      orbit: s("orbit"),
      orbitDmg: 14 * (c("halo") ? 2 : 1),
      orbitR: c("halo") ? 2.7 : 2.1,
      bladeScale: c("halo") ? 1.5 : 1,
      cryo: 0.15 * s("cryo"),
      shockDash: s("shockdash") ? (s("shockdash") > 1 ? 48 : 30) : 0,
      payloadR: o("payload", 1.6, 0.35),
      payloadF: o("payload", 0.4, 0.15),
      arc: c("storm") ? Math.min(0.9, l + 0.3) : l,
      arcJumps: c("storm") ? 4 : 2,
      chain: (n.chain || 0) + (c("tempest") ? 2 : 0),
      chainF: c("tempest") ? 0.85 : 0.7,
      homing: (n.homing || 0) + 2.2 * s("seeker") + (c("twinsaw") ? 2.5 : 0),
      thermite: o("thermite", 0.3, 0.15),
      siphonCh: o("siphon", 0.12, 0.06),
      rear: s("rearguard"),
      novaMul: 1 + 0.4 * s("overcharge"),
      novaR: 6.5 * (1 + 0.25 * s("overcharge")),
      wingman: s("wingman"),
      wingmen: s("wingman") ? 1 + (c("gunship") ? 1 : 0) : 0,
      wingSpread: c("gunship") ? 3 : 1,
      bloodrush: s("bloodrush"),
      chrono: s("chrono"),
      cluster: c("cluster"),
      inferno: c("inferno"),
      trail: c("phantom"),
      boomerang: !!n.boomerang,
      bounty: s("bounty"),
      capacitor: s("capacitor"),
      burn: n.burn || 0,
      burnMul: c("dragon") ? 1.6 : 1,
      overdrive: c("overdrive"),
      lance: c("lance"),
      hellfire: c("hellfire"),
      range: tc(n) * (1 + 0.2 * s("velocity")) * (c("dragon") ? 1.3 : 1),
    };
  }
  function nr(i, t, e) {
    const s = nrCore(i, t, e),
      u = (id) => t[id] || 0,
      w = (id) => e[id] || 0;
    s.dmgMul *= 1 + 0.1 * u("caliber");
    s.velMul *= 1 + 0.12 * u("stabilizer");
    s.range *= 1 + 0.12 * u("stabilizer");
    s.maxHp = Math.max(25, s.maxHp * (1 - 0.05 * u("glasscore")));
    s.dmgMul *= 1 + 0.08 * u("glasscore");
    s.crit += 0.04 * u("glasscore");
    s.novaMul *= 1 + 0.15 * u("aether");
    s.eliteMul = 1 + 0.1 * u("hunter");
    s.dashCd *= Math.max(0.45, 1 - 0.12 * u("coolant"));
    s.shieldCd *= Math.max(0.45, 1 - 0.12 * u("coolant"));
    s.supply = u("supply");
    s.armor = 0.04 * w("armorCore"); // 2.3.5: share of enemy damage absorbed (was +8 max HP)
    s.novaStart = Math.min(100, 10 * w("riftBattery"));
    s.wingmen += s.wingman ? Math.min(2, w("droneBay")) : 0;
    // v2.1 meta/run stats
    s.rateMul *= 1 + 0.06 * w("arsenalLab"); // 2.3.5: fire rate (was +5% damage like Power Core)
    s.hazardResist = Math.min(0.88, 0.15 * w("hazardSeal") + 0.25 * u("hazmat"));
    // 2.3.5: the cache modules split into quantity and value. cacheBonus (run upgrades Scavenger
    // Net and Salvager) still adds both a cache and +2 shards per cache; Field Supply only adds
    // caches (cacheCount), Route Scanner only multiplies the shards in caches (cacheValue).
    s.cacheBonus = u("scavengerNet");
    s.cacheCount = w("fieldSupply");
    s.overload = u("overload");
    s.range *= 1 + 0.1 * u("focus");
    s.crit = Math.min(0.95, s.crit + 0.04 * u("focus"));
    s.chain += u("resonance");
    s.arc = Math.min(0.95, s.arc + 0.08 * u("resonance"));
    s.maxHp += 15 * u("fortify");
    s.leech = u("leech");
    s.echo = u("echo");
    return s;
  }
  function tc(i) {
    return i.boomerang
      ? i.speed * i.life * 0.5
      : i.drag
        ? (i.speed * (1 - Math.exp(-i.drag * i.life))) / i.drag
        : i.speed * i.life;
  }
  var Ap = [0, 60, 28, 10, 2],
    Rp = [0, 0, 42, 44, 14];
  function pu(i, t, e, n, s, r, a = [], o = null) {
    let c = Zi.filter(
        (f) => !(f.evo || (t[f.id] || 0) >= f.max || (f.id === "heal" && n > 0.7) || (r && f.rarity < 2)),
      ),
      h = (f) => {
        let x = (r ? Rp : Ap)[f.rarity];
        return (
          r || (f.rarity === 3 && (x += e * 0.35), f.rarity === 4 && (x += e * 0.15)),
          f.id === "heal" && (x *= n < 0.35 ? 3 : 1.2),
          a.includes(f.id) && (x *= 0.05),
          x / Math.max(1, Cp(c, f.rarity))
        );
      },
      l = [],
      u = Zi.filter(
        (f) =>
          f.evo &&
          !t[f.id] &&
          (!f.weapon || f.weapon === o) &&
          Object.entries(f.evo).every(([p, x]) => (t[p] || 0) >= x),
      );
    u.length && l.push(u[Math.floor(i.next() * u.length)].id);
    let d = c.slice();
    for (; l.length < s && d.length; ) {
      let f = 0;
      for (let m of d) f += h(m);
      let p = i.next() * f,
        x = d[d.length - 1];
      for (let m of d)
        if (((p -= h(m)), p <= 0)) {
          x = m;
          break;
        }
      (l.push(x.id), d.splice(d.indexOf(x), 1));
    }
    return l;
  }
  function Cp(i, t) {
    let e = 0;
    for (let n of i) n.rarity === t && e++;
    return e;
  }
  function muCore(i, t, e) {
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
        (t.face = Ne(t.face, Math.atan2(t.vy, t.vx), 8 * e)));
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
        t.face = Ne(t.face, o, 8 * e);
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
            t.t2 > 0.35 && (t.ta = Ne(t.ta, o, 2.5 * e)),
            (t.face = Ne(t.face, t.ta, 10 * e)),
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
            t.t2 > 0.35 && (t.ta = Ne(t.ta, o, 3 * e)),
            (t.t2 -= e),
            t.t2 <= 0 &&
              (i.shoot(t.x + Math.cos(t.ta) * 0.7, t.y + Math.sin(t.ta) * 0.7, t.ta, 22, t.dmg, {
                kind: "fast",
                r: 0.2,
              }),
              i.emit("eshot", { x: t.x, y: t.y, type: "sniper" }),
              (t.st = 0),
              (t.t = 3 + i.rng.next() * 1.2)));
        t.face = Ne(t.face, t.st === 1 ? t.ta : o, 8 * e);
        return;
      }
      case "hive": {
        (a > 6 || !t.los ? ((t.vx = c * l), (t.vy = h * l)) : ((t.vx *= 0.9), (t.vy *= 0.9)), (t.t -= e));
        let f = t.elite ? 7 : 5;
        if (t.t <= 0 && ((t.t = 3.2), t.kids < f && i.enemies.length < 75)) {
          let p = i.rng.next() * Me,
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
        ((t.vx = c * l), (t.vy = h * l), (t.face = Ne(t.face, o, 0.95 * e)));
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
            (t.face = Ne(t.face, t.ta, 14 * e)),
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
            (t.ta = Ne(t.ta, o, 3.8 * e)),
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
        t.face = Ne(t.face, t.st === 1 ? t.ta : Math.atan2(t.vy, t.vx), 10 * e);
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
            (t.ta = Ne(t.ta, o, 2.6 * e)),
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
        t.face = Ne(t.face, o, 5 * e);
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
        t.face = Ne(t.face, o, 4 * e);
        return;
      }
    }
    Math.hypot(t.vx, t.vy) > 0.2 && (t.face = Ne(t.face, Math.atan2(t.vy, t.vx), 8 * e));
  }
  var Pp = {
    warden: ["charge", "ring", "stomp", "charge", "ring", "stomp"],
    queen: ["summon", "spiral", "burst", "eggs", "spiral", "burst"],
    prism: ["sweep", "teleport", "shards", "lances", "teleport", "sweep"],
    core: ["spiral", "summon", "ring", "cross", "burst", "rain"],
  };
  function yu(i, t) {
    ((t.st = "walk"), (t.t = 2.2), (t.t2 = 0), (t.n = 0), (t.pattern = 0), (t.spin = 0), (t.phaseN = 1));
  }
  function gu(i, t) {
    let e = Pp[t.type];
    ((t.st = e[t.pattern % e.length]),
      t.pattern++,
      (t.t = 0),
      (t.t2 = 0),
      (t.n = 0),
      i.emit("bossAtk", { id: t.type, atk: t.st }));
  }
  function He(i, t) {
    ((i.st = "walk"), (i.t = t), (i.n = 0), (i.t2 = 0));
  }
  function vu(i, t, e) {
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
        ((i.beams.length = 0), i.emit("phase", { n: u, x: t.x, y: t.y }), He(t, 1.6));
      }
      t.shieldT > 0 && ((t.shieldT -= e), (t.shielded = t.shieldT > 0));
    }
    if (t.st === "walk") {
      ((t.t -= e), Ta(i, t, e, o, a), t.t <= 0 && gu(i, t), (t.face = Ne(t.face, o, 3 * e)));
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
              t.subT < 0.5 && (t.ta = Ne(t.ta, o, 3 * e)),
              (t.face = Ne(t.face, t.ta, 8 * e)),
              t.subT > (l ? 0.65 : 0.85) && ((t.sub = 1), (t.subT = 0)));
          else if (t.sub === 1) {
            let d = l ? 18 : 15.5;
            ((t.vx = Math.cos(t.ta) * d),
              (t.vy = Math.sin(t.ta) * d),
              (t.charging = !0),
              ((t.hitWall && t.subT > 0.1) || t.subT > 0.8) &&
                ((t.charging = !1),
                t.hitWall && (i.emit("thud", { x: t.x, y: t.y, big: !0 }), l && ir(i, t, 10, 7.5, h, t.spin)),
                (t.sub = 2),
                (t.subT = 0)));
          } else
            ((t.vx *= 0.8),
              (t.vy *= 0.8),
              t.subT > 0.45 &&
                (t.n++,
                t.n >= u
                  ? He(t, 2.2 - l * 0.6)
                  : ((t.sub = 0), (t.subT = 0), (t.ta = o), i.emit("charge", { x: t.x, y: t.y, type: "warden" }))));
          return;
        }
        if (t.st === "ring") {
          ((t.vx *= 0.85), (t.vy *= 0.85));
          let u = 3 + l,
            d = 0.55;
          (t.t >= 0.4 + t.n * d &&
            t.n < u &&
            (ir(i, t, 16 + l * 6, 7 + l, h, (t.n % 2) * (Math.PI / (16 + l * 6))),
            t.n++,
            i.emit("eshot", { x: t.x, y: t.y, type: "boss" })),
            t.t > 0.4 + u * d + 0.4 && He(t, 2.4 - l * 0.7));
          return;
        }
        if (t.st === "stomp") {
          if (
            ((t.vx = 0),
            (t.vy = 0),
            t.n === 0 && ((t.n = 1), i.hazard({ x: t.x, y: t.y, r: 4.8, delay: 1, dmg: t.dmg, kind: "stomp" }), l))
          )
            for (let u = 0; u < 3; u++) {
              let d = i.rng.next() * Me,
                f = i.rng.range(0, 3);
              i.hazard({
                x: Lt(n.x + Math.cos(d) * f, -i.arena.W + 1, i.arena.W - 1),
                y: Lt(n.y + Math.sin(d) * f, -i.arena.H + 1, i.arena.H - 1),
                r: 2.4,
                delay: 1.25 + u * 0.2,
                dmg: t.dmg * 0.8,
                kind: "stomp",
              });
            }
          (t.n === 1 && t.t > 1 && ((t.n = 2), ir(i, t, 12, 9, h, 0), i.emit("thud", { x: t.x, y: t.y, big: !0 })),
            t.t > 1.6 && He(t, 2));
          return;
        }
        break;
      }
      case "queen": {
        if ((Ta(i, t, e, o, a, 0.4), t.st === "summon")) {
          if (t.n === 0) {
            t.n = 1;
            let u = 5 + l * 2;
            for (let d = 0; d < u; d++) {
              let f = (d / u) * Me + t.spin,
                p = i.spawnEnemy("swarmer", t.x + Math.cos(f) * 2.4, t.y + Math.sin(f) * 2.4, { hpF: 1 });
              ((p.spawnT = 0.3), (p.noDrop = i.rng.chance(0.6)), (p.kx = Math.cos(f) * 5), (p.ky = Math.sin(f) * 5));
            }
            i.emit("hatch", { x: t.x, y: t.y, big: !0 });
          }
          t.t > 1 && He(t, 1.4);
          return;
        }
        if (t.st === "spiral") {
          let u = 3 + l * 2;
          for (t.t2 += e; t.t2 > 0.1; ) {
            ((t.t2 -= 0.1), (t.ta = (t.ta || 0) + 0.24));
            for (let d = 0; d < u; d++) i.shoot(t.x, t.y, t.ta + (d / u) * Me, 6.2, h, { r: 0.26 });
          }
          t.t > 3.2 && He(t, 1.4);
          return;
        }
        if (t.st === "burst") {
          if (t.t >= 0.35 + t.n * 0.42 && t.n < 3 + l) {
            for (let u = 0; u < 5; u++) i.shoot(t.x, t.y, o + (u - 2) * 0.16, 9.5, h);
            (t.n++, i.emit("eshot", { x: t.x, y: t.y, type: "boss" }));
          }
          t.t > 2 && He(t, 1.3);
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
          t.t > 1.2 && He(t, 1.6);
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
          t.t > 3.4 && He(t, 1.2);
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
            let u = xu(i, n.x, n.y, 8, 10.5);
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
            ir(i, t, 12 + l * 4, 6.5, h, t.spin, "shard"),
            i.emit("blink", { x: t.x, y: t.y, in: !0 })),
            t.t > 1.6 && He(t, 0.9));
          return;
        }
        if (t.st === "shards") {
          if ((Ta(i, t, e, o, a, 0.3), t.t >= 0.3 + t.n * 0.12 && t.n < 8 + l * 4)) {
            let u = o + Math.PI + (t.n - 4) * 0.4;
            (i.shoot(t.x, t.y, u, 5.5, h, { kind: "shard", homing: 1.3, life: 5, r: 0.24 }), t.n++);
          }
          t.t > 2.4 && He(t, 1.2);
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
          t.t > 0.2 + u * 0.45 + 0.8 && He(t, 1.2);
          return;
        }
        break;
      }
      case "core": {
        let u = t.phaseN;
        if ((Ta(i, t, e, o, a, 0.2), t.st === "spiral")) {
          let d = 4 + (u - 1) * 1;
          t.t2 += e;
          let f = u === 3 ? 0.08 : 0.11;
          for (; t.t2 > f; ) {
            ((t.t2 -= f), (t.ta = (t.ta || 0) + (u === 2 ? -0.2 : 0.2)));
            for (let p = 0; p < d; p++) i.shoot(t.x, t.y, t.ta + (p / d) * Me, 6 + u * 0.5, h, { r: 0.26 });
          }
          t.t > 3 && He(t, 1.2);
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
          t.t > 1 && He(t, 1.2);
          return;
        }
        if (t.st === "ring") {
          (t.t >= 0.3 + t.n * 0.5 &&
            t.n < 2 + u &&
            (ir(i, t, 18 + u * 2, 7, h, (t.n % 2) * 0.15), t.n++, i.emit("eshot", { x: t.x, y: t.y, type: "boss" })),
            t.t > 0.3 + (2 + u) * 0.5 + 0.3 && He(t, 1.3));
          return;
        }
        if (t.st === "cross") {
          if (u === 1) {
            gu(i, t);
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
                a: o + 0.6 + (p / d) * Me,
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
          t.t > 4.6 && He(t, 1.4);
          return;
        }
        if (t.st === "burst") {
          if (t.t >= 0.3 + t.n * 0.35 && t.n < 3 + u) {
            for (let d = 0; d < 7; d++) i.shoot(t.x, t.y, o + (d - 3) * 0.13, 9 + u * 0.5, h);
            (t.n++, i.emit("eshot", { x: t.x, y: t.y, type: "boss" }));
          }
          t.t > 0.3 + (3 + u) * 0.35 + 0.4 && He(t, 1.2);
          return;
        }
        if (t.st === "rain") {
          if (t.n === 0) {
            t.n = 1;
            let d = 4 + u * 2;
            for (let f = 0; f < d; f++) {
              let p = f === 0 ? { x: n.x, y: n.y } : xu(i, n.x, n.y, 1.5, 7);
              p && i.hazard({ x: p.x, y: p.y, r: 2.2, delay: 1.1 + f * 0.12, dmg: t.dmg * 0.8, kind: "rain" });
            }
          }
          t.t > 2.4 && He(t, 1.2);
          return;
        }
        break;
      }
    }
    He(t, 1);
  }
  function Ta(i, t, e, n, s, r = 1) {
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
  function ir(i, t, e, n, s, r, a) {
    for (let o = 0; o < e; o++) i.shoot(t.x, t.y, r + (o / e) * Me, n, s, { kind: a || "orb", r: 0.27 });
  }
  function xu(i, t, e, n, s) {
    for (let r = 0; r < 20; r++) {
      let a = i.rng.next() * Me,
        o = i.rng.range(n, s),
        c = t + Math.cos(a) * o,
        h = e + Math.sin(a) * o;
      if (!i.arena.outside(c, h, 2) && !i.arena.blocked(c, h, 2) && !i.arena.featureBlocked(c, h, 0.6))
        return { x: c, y: h };
    }
    for (let r = 0; r < 16; r++) {
      let a = (r / 16) * Me,
        c = Lt(t * 0.4 + Math.cos(a) * Math.max(n, 2.5), -i.arena.W + 3, i.arena.W - 3),
        h = Lt(e * 0.4 + Math.sin(a) * Math.max(n, 2.5), -i.arena.H + 3, i.arena.H - 3);
      if (!i.arena.outside(c, h, 2) && !i.arena.blocked(c, h, 2) && !i.arena.featureBlocked(c, h, 0.6))
        return { x: c, y: h };
    }
    return null;
  }
  var Ip = {
      swarmer: 5,
      grunt: 4,
      gunner: 3,
      bomber: 2.4,
      splitter: 2,
      brute: 1.3,
      sniper: 1.5,
      hive: 0.6,
      bulwark: 1.3,
      striker: 1.6,
      mortar: 1.1,
      mender: 1,
      leaper: 1.5,
      turret: 0.9,
    },
    ec = { brute: 1, hive: 1, sniper: 1, bulwark: 1, mortar: 1, mender: 1, turret: 1 };
  function Lp(i, t) {
    return (16 + 8 * i + 0.3 * i * i) * t.budget;
  }
  function _u(i, t, e, n, s = {}) {
    let r = Lp(t, e) * (n ? 0.22 : 1) * (s.budget || 1),
      a = lu.filter((S) => Ae[S].from <= t && (!n || !ec[S])),
      o = {
        hive: 1 + Math.floor(t / 8),
        brute: 2 + Math.floor(t / 4),
        sniper: 2 + Math.floor(t / 4),
        splitter: 3 + Math.floor(t / 3),
        bulwark: 1 + Math.floor(t / 6),
        mortar: 1 + Math.floor(t / 6),
        striker: 2 + Math.floor(t / 5),
        mender: 1 + Math.floor(t / 10),
        leaper: 2 + Math.floor(t / 5),
        turret: 1 + Math.floor(t / 8),
        charger: 2 + Math.floor(t / 6),
        minebot: 2 + Math.floor(t / 8),
        sapper: 1 + Math.floor(t / 7),
        phantom: 1 + Math.floor(t / 8),
        sentinel: 1 + Math.floor(t / 9),
        carrier: 1 + Math.floor(t / 10),
        drone: 2 + Math.floor(t / 6),
        driller: 1 + Math.floor(t / 8),
        beacon: 1 + Math.floor(t / 14),
        weaver: 1 + Math.floor(t / 8),
      },
      c = {},
      h = [],
      l = s.elite != null ? s.elite : t >= 6 ? 0.035 + 0.006 * t + e.elite : 0,
      u = 0;
    for (; r >= 1 && u++ < 500; ) {
      let S = a.filter((R) => Ae[R].cost <= r && (c[R] || 0) < (o[R] ?? 999));
      if (!S.length) break;
      let T = ou(
        i,
        S,
        S.map((R) => Ip[R] * ((s.weights && s.weights[R]) || 1)),
      );
      ((c[T] = (c[T] || 0) + 1), (r -= Ae[T].cost), h.push({ type: T, elite: T !== "swarmer" && i.chance(l) }));
    }
    for (let S = h.length - 1; S > 0; S--) {
      let T = Math.floor(i.next() * (S + 1));
      [h[S], h[T]] = [h[T], h[S]];
    }
    let d = Math.floor(h.length / 4),
      f = h.slice(0, d),
      p = h.slice(d),
      x = f.filter((S) => ec[S.type] || S.elite),
      m = f.filter((S) => !(ec[S.type] || S.elite)).concat(p, x),
      g = [],
      M = Lt(4 + Math.floor(t / 2.5), 4, 12),
      b = n ? 7 : Math.max(1.6, 3.2 - t * 0.06),
      v = 0;
    for (; v < m.length; ) {
      let S = M + i.int(-1, 1),
        T = [],
        R = 0;
      for (; v < m.length && R < S; ) {
        let _ = m[v++];
        (T.push(_), (R += _.type === "swarmer" ? 0.5 : 1));
      }
      g.push({ gap: b * i.range(0.85, 1.15), members: T });
    }
    return g;
  }
  var Ea = 2.7,
    bi = { x: 0, y: 2, r: 4.6 },
    Mu = {
      yard: [
        [5, (i) => ({ t: "c", r: i.range(1, 1.5) })],
        [
          3,
          (i) => {
            let t = i.range(0.7, 1.1);
            return { t: "b", w: t, h: t };
          },
        ],
      ],
      works: [
        [
          4,
          (i) =>
            i.chance(0.5)
              ? { t: "b", w: i.range(2.4, 4.2), h: i.range(0.6, 0.85) }
              : { t: "b", w: i.range(0.6, 0.85), h: i.range(2.4, 4.2) },
        ],
        [3, (i) => ({ t: "c", r: i.range(1.1, 1.6) })],
        [
          2,
          (i) => {
            let t = i.range(0.8, 1.2);
            return { t: "b", w: t, h: t };
          },
        ],
      ],
      vault: [
        [4, (i) => ({ t: "c", r: i.range(0.7, 1.1) })],
        [
          3,
          (i) =>
            i.chance(0.5)
              ? { t: "b", w: i.range(1.4, 2.6), h: i.range(0.7, 1) }
              : { t: "b", w: i.range(0.7, 1), h: i.range(1.4, 2.6) },
        ],
      ],
      marsh: [
        [4, (i) => ({ t: "c", r: i.range(0.9, 1.5) })],
        [
          3,
          (i) =>
            i.chance(0.5)
              ? { t: "b", w: i.range(1.4, 2.4), h: i.range(0.7, 1) }
              : { t: "b", w: i.range(0.7, 1), h: i.range(1.4, 2.4) },
        ],
      ],
      void: [
        [
          4,
          (i) =>
            i.chance(0.5)
              ? { t: "b", w: i.range(0.5, 0.7), h: i.range(1.3, 2.2) }
              : { t: "b", w: i.range(1.3, 2.2), h: i.range(0.5, 0.7) },
        ],
        [3, (i) => ({ t: "c", r: i.range(0.9, 1.3) })],
      ],
    },
    Dp = {
      yard: ["scatter", "ring", "rot4", "mirror2"],
      works: ["scatter", "lanes", "mirror2", "rot2"],
      vault: ["scatter", "rot2", "ring", "rot4"],
      void: ["scatter", "ring", "rot2", "mirror4"],
      marsh: ["scatter", "mirror2", "ring", "rot2"],
    };
  function bu(i) {
    return {
      key: i.id + ":classic",
      W: i.W,
      H: i.H,
      obstacles: i.obstacles.map((t) => ({ ...t })),
      deco: 0,
      template: "classic",
    };
  }
  function mapScore(i, t, e, n) {
    let s = 0,
      r = 0,
      a = 0,
      o = new Array(8).fill(0),
      c = [];
    for (let h of i) {
      let l = h.t === "c" ? Math.PI * h.r * h.r : 4 * h.w * h.h;
      s += l;
      let u = Math.atan2(h.y, h.x);
      (u < 0 && (u += Me), o[Math.min(7, Math.floor((u / Me) * 8))]++, c.push(Math.hypot(h.x, h.y)));
    }
    r = s / (4 * t * e);
    let h = o.filter((u) => u > 0).length,
      l = 0;
    if (c.length > 1) {
      c.sort((u, d) => u - d);
      for (let u = 1; u < c.length; u++) l += Math.abs(c[u] - c[u - 1]);
      l += Math.abs(c[0] + Math.min(t, e) - c[c.length - 1]);
    }
    let u = Math.max(0, 0.13 - Math.min(0.13, Math.max(...o) - Math.min(...o))),
      d = Math.max(0, 1 - Math.abs(r - 0.035) / 0.035),
      f = Math.min(1, h / 6),
      p = Math.min(1, l / ((c.length + 1) * Math.max(1, Math.min(t, e))));
    return (
      d * 3.5 + f * 3 + p * 1.5 + (i.length >= 5 && i.length <= 9 ? 1 : 0) + u * 1.2 + (n === "scatter" ? 3 : 0) - 0.2
    );
  }
  function mu(i, t, e) {
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
        ((t.vx = i.cdx * t.speed), (t.vy = i.cdy * t.speed), (t.t -= e), (t.face = Ne(t.face, ang, 9 * e)));
        if (p.alive && dist < 10.5 && dist > 4 && t.t <= 0 && t.los) {
          ((t.st = 1),
            (t.t2 = 0.48),
            (t.ta = ang),
            (t.vx *= 0.2),
            (t.vy *= 0.2),
            i.emit("charge", { x: t.x, y: t.y, type: t.type }));
        }
      } else if (t.st === 1) {
        ((t.vx *= 0.65), (t.vy *= 0.65), (t.t2 -= e), (t.face = Ne(t.face, t.ta, 16 * e)));
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
          (t.face = Ne(t.face, Math.atan2(dy, dx), 8 * e)));
        if (p.alive && dist < 10 && dist > 4.2 && t.t <= 0 && t.los) {
          ((t.st = 1),
            (t.t2 = 0.55),
            (t.vx = 0),
            (t.vy = 0),
            i.hazard({ x: t.x, y: t.y, r: 1.15, delay: 0.55, dmg: t.dmg * 1.25, kind: "mine" }),
            i.emit("mine", { x: t.x, y: t.y }));
        }
      } else {
        ((t.t2 -= e), (t.face = Ne(t.face, Math.atan2(dy, dx), 8 * e)));
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
        t.face = Ne(t.face, ang, 8 * e);
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
        t.face = Ne(t.face, ang, 8 * e);
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
        t.face = Ne(t.face, ang, 10 * e);
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
        t.face = Ne(t.face, ang, 6 * e);
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
        t.face = Ne(t.face, t.ta, 8 * e);
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
      t.face = Ne(t.face, ang, 7 * e);
      t.t -= e;
      if (p.alive && dist < 14 && dist > 7 && t.t <= 0 && t.los) {
        for (const off of [-0.16, 0, 0.16])
          i.shoot(t.x, t.y, ang + off, 20, t.dmg * 0.72, { kind: "carrier", life: 3.8, homing: 1.2 });
        t.t = 2.4 + i.rng.next() * 1.2;
        i.emit("eshot", { x: t.x, y: t.y });
      }
      return;
    }
    return muCore(i, t, e);
  }
  function Su(i, t, e, n) {
    if (n || !Mu[i.id]) return bu(i);
    let s = qi(Yi(t + ":map:" + e)),
      r = null,
      a = -1e9;
    for (let o = 0; o < 24; o++) {
      let c = Lt(i.W + s.int(-1, 1), 15, 20),
        h = Lt(i.H + s.int(-1, 1), 15, 20),
        l = s.chance(0.55) ? "scatter" : s.pick(Dp[i.id].filter((u) => u !== "scatter")),
        u = Up(s, i.id, l, c, h);
      if (u.length < 4 || !kp(u, c, h)) continue;
      let d = mapScore(u, c, h, l);
      d > a && ((a = d), (r = { W: c, H: h, obstacles: u, template: l }));
    }
    if (!r) return bu(i);
    return {
      key: `${i.id}:${t}:${e}`,
      W: r.W,
      H: r.H,
      obstacles: r.obstacles,
      deco: 1 + s.int(0, 3),
      template: r.template,
      features: Op(s, i.id, r.obstacles, r.W, r.H),
    };
  }
  const _rlSuBase = Su;
  function rlSuV21(i, t, e, n) {
    const base = _rlSuBase(i, t, e, n),
      layout = rlAddWaveObstacles(base, i, t, e, n);
    return layout;
  }
  Su = rlSuV21;
  function rlFeaturePoint(rng, obs, W, H, features, extraR = 0.75) {
    const taken = [];
    for (const k of ["vents", "ice", "acid"])
      for (const q of features[k] || []) taken.push({ x: q.x, y: q.y, r: (q.r || 0.8) + extraR });
    for (const q of features.portals || []) {
      taken.push({ x: q.ax, y: q.ay, r: 1 + extraR });
      taken.push({ x: q.bx, y: q.by, r: 1 + extraR });
    }
    for (let tries = 0; tries < 80; tries++) {
      const a = rng.next() * Me,
        d = rng.range(6.5, 9.6),
        x = bi.x + Math.cos(a) * d,
        y = bi.y + Math.sin(a) * d,
        r = 0.72 + rng.next() * 0.28;
      if (Math.abs(x) > W - 3.7 || Math.abs(y) > H - 3.7 || Math.hypot(x - bi.x, y - bi.y) < 6.2) continue;
      if (Eu(obs, x, y, r + 0.9)) continue;
      if (taken.some((q) => Math.hypot(x - q.x, y - q.y) < r + q.r + 1)) continue;
      return { x, y, r };
    }
    return null;
  }
  function rlAddDynamicFeatures(layout, biome, seed, wave, boss, mode = "standard") {
    const features = {
      vents: [...(layout.features?.vents || [])],
      ice: [...(layout.features?.ice || [])],
      portals: [...(layout.features?.portals || [])],
      acid: [...(layout.features?.acid || [])],
    };
    const rng = qi(Yi(seed + ":director-features-v21:" + wave + ":" + mode));
    const theme = RL_BIOME_HAZARD[biome.id] ?? "",
      own = theme === "vents" || theme === "ice" || theme === "acid" ? theme : "";
    // Every biome keeps ONE hazard theme: whatever the wave mode asks for becomes the biome's own hazard.
    const add = (kind, count = 1) => {
      kind = own;
      if (!kind) return;
      for (let j = 0; j < count; j++) {
        if (features[kind].length >= 6) return;
        const p = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 0.1);
        if (!p) continue;
        if (kind === "vents")
          features.vents.push({ ...p, phase: rng.next() * 6, period: 2.8 + rng.next() * 1.6, st: "idle" });
        else if (kind === "ice") features.ice.push({ x: p.x, y: p.y, r: p.r });
        else if (kind === "acid") features.acid.push({ x: p.x, y: p.y, r: p.r, life: null });
      }
    };
    if (!boss) {
      add(own, 2); // 2.4.0: two per wave (was one) — the hazard is what the biome plays around
      if (theme === "portals" && !features.portals.length) {
        for (let k = 0; k < 6 && !features.portals.length; k++) {
          const a = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 0.1),
            b = rlFeaturePoint(rng, layout.obstacles, layout.W, layout.H, features, 0.1);
          if (a && b && Math.hypot(a.x - b.x, a.y - b.y) >= 7.2)
            features.portals.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
        }
      }
      switch (mode) {
        case "crossfire":
          add("vents", 2);
          break;
        case "riftwalk":
          add("ice", 1);
          break;
        case "shatter":
          add("acid", 1);
          add("ice", 1);
          break;
        case "deadzone":
          add("acid", 2);
          break;
        case "barricade":
          add("ice", 1);
          break;
        case "minefield":
          add("acid", 3);
          break;
        case "turbulence":
          add("vents", 2);
          add("ice", 1);
          break;
        case "fortress":
          add("vents", 1);
          break;
        case "salvage":
          add("ice", 1);
          break;
      }
    }
    return features;
  }
  function rlAddWaveObstacles(layout, biome, seed, wave, boss) {
    const modePool = [
      "barricade",
      "crossfire",
      "cache-run",
      "riftwalk",
      "gauntlet",
      "shatter",
      "deadzone",
      "minefield",
      "zigzag",
      "salvage",
      "turbulence",
      "fortress",
    ];
    if (boss) {
      layout.director = {
        mode: "boss",
        intensity: Math.min(8, 2 + Math.floor(wave / 25)),
        obstacles: 0,
        features: Object.fromEntries(Object.entries(layout.features || {}).map(([k, v]) => [k, v.length])),
      };
      return layout;
    }
    const mode = modePool[(wave + Yi(seed + ":" + biome.id + ":director-mode")) % modePool.length];
    const rng = qi(Yi(seed + ":director-obstacles-v21:" + wave + ":" + mode)),
      obs = layout.obstacles.map((q) => ({ ...q })),
      baseCount = obs.length;
    const protectedPoints = [];
    for (const kind of ["vents", "ice", "acid"]) {
      for (const q of layout.features?.[kind] || []) protectedPoints.push({ x: q.x, y: q.y, r: (q.r || 0.8) + 0.9 });
    }

    for (const q of layout.features?.portals || []) {
      protectedPoints.push({ x: q.ax, y: q.ay, r: 2.3 });
      protectedPoints.push({ x: q.bx, y: q.by, r: 2.3 });
    }
    const featureOverlap = (cand) =>
      protectedPoints.some(
        (q) => Math.hypot(cand.x - q.x, cand.y - q.y) < (cand.t === "c" ? cand.r : Math.hypot(cand.w, cand.h)) + q.r,
      );
    const target = Math.min(
      10,
      1 +
        Math.floor(wave / 3) +
        (mode === "gauntlet" ? 2 : 0) +
        (mode === "shatter" ? 1 : 0) +
        (mode === "fortress" ? 1 : 0),
    );
    for (let k = 0; k < target; k++) {
      let placed = null;
      for (let tries = 0; tries < 70 && !placed; tries++) {
        const a = rng.next() * Me,
          d = rng.range(6.2, Math.min(10.8, Math.min(layout.W, layout.H) - 4.2)),
          x = bi.x + Math.cos(a) * d,
          y = bi.y + Math.sin(a) * d;
        let cand;
        if (mode === "barricade" || mode === "gauntlet")
          cand = { t: "b", x, y, w: rng.range(0.65, 1.45), h: rng.range(2.0, 4.0) };
        else if (mode === "crossfire")
          cand = rng.chance(0.5)
            ? { t: "b", x, y, w: rng.range(0.7, 1.1), h: rng.range(1.7, 2.8) }
            : { t: "b", x, y, w: rng.range(1.7, 2.8), h: rng.range(0.7, 1.1) };
        else if (mode === "shatter" || mode === "minefield")
          cand = { t: "c", x, y, r: rng.range(mode === "minefield" ? 0.42 : 0.48, mode === "minefield" ? 0.82 : 0.95) };
        else if (mode === "deadzone") cand = { t: "c", x, y, r: rng.range(0.7, 1.15) };
        else if (mode === "zigzag" || mode === "turbulence")
          cand =
            k % 2 === 0
              ? { t: "b", x, y, w: rng.range(0.58, 0.9), h: rng.range(1.8, 3.0) }
              : { t: "b", x, y, w: rng.range(1.8, 3.0), h: rng.range(0.58, 0.9) };
        else if (mode === "fortress") cand = { t: "b", x, y, w: rng.range(1.0, 1.65), h: rng.range(0.55, 0.8) };
        else
          cand = rng.chance(0.45)
            ? { t: "c", x, y, r: rng.range(0.58, 1.0) }
            : { t: "b", x, y, w: rng.range(0.6, 1.25), h: rng.range(0.6, 1.25) };
        if (!Bp(cand, obs, layout.W, layout.H) || obs.some((q) => Tu(cand, q) < Ea) || featureOverlap(cand)) continue;
        const next = obs.concat(cand);
        if (!kp(next, layout.W, layout.H)) continue;
        placed = cand;
        obs.push(cand);
      }
    }
    layout.obstacles = obs.slice(0, 19);
    layout.features = rlAddDynamicFeatures(layout, biome, seed, wave, boss, mode);
    layout.key = `${layout.key}:director3:${mode}`;
    layout.deco = (layout.deco || 0) + 1;
    layout.director = {
      mode,
      intensity: Lt(1 + Math.floor(wave / 12) + (obs.length - baseCount > 3 ? 1 : 0), 1, 8),
      obstacles: Math.max(0, obs.length - baseCount),
      features: Object.fromEntries(Object.entries(layout.features).map(([k, v]) => [k, v.length])),
    };
    return layout;
  }
  function wu(i, t) {
    let e = Mu[t],
      n = 0;
    for (let [r] of e) n += r;
    let s = i.next() * n;
    for (let [r, a] of e) if (((s -= r), s <= 0)) return a(i);
    return e[0][1](i);
  }
  function Np(i, t) {
    let e = (r, a, o) => ({ ...t, x: r, y: a, ...(o && t.t === "b" ? { w: t.h, h: t.w } : {}) }),
      { x: n, y: s } = t;
    switch (i) {
      case "mirror4":
        return [e(n, s), e(-n, s), e(n, -s), e(-n, -s)];
      case "mirror2":
        return [e(n, s), e(-n, s)];
      case "rot2":
        return [e(n, s), e(-n, -s)];
      case "rot4":
        return [e(n, s), e(-s, n, !0), e(-n, -s), e(s, -n, !0)];
      default:
        return [e(n, s)];
    }
  }
  function Up(i, t, e, n, s) {
    let r = [],
      a = (o) => {
        if (r.length + o.length > 12) return !1;
        for (let c of o) if (!Bp(c, r, n, s)) return !1;
        for (let c = 0; c < o.length; c++) for (let h = c + 1; h < o.length; h++) if (Tu(o[c], o[h]) < Ea) return !1;
        return (r.push(...o), !0);
      },
      o;
    if (e === "scatter") {
      let c = i.int(5, 8),
        h = i.next() * Me,
        l = Math.min(n, s);
      for (let u = 0; u < c; u++) {
        let d = h + (u / c) * Me + i.range(-0.42, 0.42),
          f = i.range(l * 0.43, l * 0.72),
          p = wu(i, t);
        p.x = Math.cos(d) * f;
        p.y = Math.sin(d) * f;
        a([p]);
      }
      for (let c = 0; c < 18 && r.length < 4; c++) {
        let h = i.next() * Me,
          l = i.range(Math.min(n, s) * 0.4, Math.min(n, s) * 0.76),
          u = wu(i, t);
        u.x = Math.cos(h) * l;
        u.y = Math.sin(h) * l;
        a([u]);
      }
    } else if (e === "ring") {
      let o = i.pick([4, 6, 8]),
        c = Math.min(n, s) * i.range(0.42, 0.58),
        h = i.next() * Math.PI,
        l = wu(i, t);
      for (let u = 0; u < o; u++) {
        let d = h + (u / o) * Math.PI * 2;
        a([{ ...l, x: Math.cos(d) * c, y: Math.sin(d) * c }]);
      }
      nc(i, t, "mirror4", n, s, a, 2);
    } else if (e === "lanes") {
      let o = i.range(6, Math.min(9.5, s - 5)),
        c = i.range(3, 5.5),
        h = i.range(3.2, 5.5);
      for (let l of [-1, 1]) for (let u of [-1, 1]) a([{ t: "b", w: c / 2, h: 0.7, x: u * (h + c / 2), y: l * o }]);
      nc(i, t, "mirror2", n, s, a, 3);
    } else nc(i, t, e, n, s, a, i.int(2, 4));
    return r;
  }
  function nc(i, t, e, n, s, r, a) {
    for (let o = 0; o < a; o++)
      for (let c = 0; c < 14; c++) {
        let h = wu(i, t);
        if (
          ((h.x = i.range(e === "rot2" ? -n + 2 : 1.5, n - 2)),
          (h.y = i.range(e === "mirror4" ? 1.5 : -s + 2, s - 2)),
          r(Np(e, h)))
        )
          break;
      }
  }
  function Fp(i) {
    return i.t === "c" ? { hx: i.r, hy: i.r } : { hx: i.w, hy: i.h };
  }
  function Tu(i, t) {
    if (i.t === "c" && t.t === "c") return Math.max(0, Math.hypot(i.x - t.x, i.y - t.y) - i.r - t.r);
    if (i.t === "c" || t.t === "c") {
      let s = i.t === "c" ? i : t,
        r = i.t === "c" ? t : i,
        a = Math.max(0, Math.abs(s.x - r.x) - r.w),
        o = Math.max(0, Math.abs(s.y - r.y) - r.h);
      return Math.max(0, Math.hypot(a, o) - s.r);
    }
    let e = Math.max(0, Math.abs(i.x - t.x) - i.w - t.w),
      n = Math.max(0, Math.abs(i.y - t.y) - i.h - t.h);
    return Math.hypot(e, n);
  }
  function Bp(i, t, e, n) {
    let { hx: s, hy: r } = Fp(i);
    if (Math.abs(i.x) + s > e - Ea || Math.abs(i.y) + r > n - Ea) return !1;
    let a = Math.max(0, Math.abs(i.x - bi.x) - s),
      o = Math.max(0, Math.abs(i.y - bi.y) - r),
      c = Math.max(5.4, bi.r + Math.max(s, r) + 3.8);
    if (Math.hypot(a, o) < c) return !1;
    for (let h of t) if (Tu(i, h) < Ea) return !1;
    return !0;
  }
  function Eu(i, t, e, n) {
    for (let s of i)
      if (s.t === "c") {
        if (Math.hypot(t - s.x, e - s.y) < s.r + n) return !0;
      } else if (Math.abs(t - s.x) < s.w + n && Math.abs(e - s.y) < s.h + n) return !0;
    return !1;
  }
  function kp(i, t, e) {
    let n = 0;
    for (let p of i) n += p.t === "c" ? Math.PI * p.r * p.r : 4 * p.w * p.h;
    if (n > 4 * t * e * 0.13) return !1;
    let s = 0.5,
      r = Math.ceil((2 * t) / s),
      a = Math.ceil((2 * e) / s),
      o = 1.1,
      c = new Uint8Array(r * a),
      h = 0;
    for (let p = 0; p < a; p++)
      for (let x = 0; x < r; x++) {
        let m = -t + (x + 0.5) * s,
          g = -e + (p + 0.5) * s;
        Math.abs(m) > t - o || Math.abs(g) > e - o || Eu(i, m, g, o) || ((c[p * r + x] = 1), h++);
      }
    let l = Math.floor((bi.y + e) / s) * r + Math.floor((bi.x + t) / s);
    if (!c[l]) return !1;
    let u = new Uint8Array(r * a),
      d = [l];
    u[l] = 1;
    let f = 0;
    for (; d.length; ) {
      let p = d.pop();
      f++;
      let x = p % r,
        m = (p / r) | 0;
      for (let [g, M] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        let b = x + g,
          v = m + M;
        if (b < 0 || v < 0 || b >= r || v >= a) continue;
        let S = v * r + b;
        c[S] && !u[S] && ((u[S] = 1), d.push(S));
      }
    }
    return f >= h * 0.995;
  }
  function Op(i, t, e, n, s) {
    let r = { vents: [], ice: [], portals: [], acid: [] },
      path = (c, h, l, u, d = 0.5) => {
        let f = Math.max(d, bi.r + 0.12),
          p = l - c,
          x = u - h,
          m = p * p + x * x;
        if (Math.abs(c) > n - 2.7 || Math.abs(h) > s - 2.7 || Math.abs(l) > n - 2.7 || Math.abs(u) > s - 2.7) return !1;
        for (let M of e)
          if (M.t === "c") {
            let b = m ? Lt(((M.x - c) * p + (M.y - h) * x) / m, 0, 1) : 0,
              v = c + p * b,
              S = h + x * b;
            if ((v - M.x) * (v - M.x) + (S - M.y) * (S - M.y) < (M.r + f) * (M.r + f)) return !1;
          } else {
            let b = M.x - M.w - f,
              v = M.x + M.w + f,
              S = M.y - M.h - f,
              A = M.y + M.h + f,
              C = 0,
              E = 1;
            if (Math.abs(p) < 1e-9) {
              if (c < b || c > v) continue;
            } else {
              let T = (b - c) / p,
                R = (v - c) / p;
              T > R && ([T, R] = [R, T]);
              ((C = Math.max(C, T)), (E = Math.min(E, R)));
              if (C > E) continue;
            }
            if (Math.abs(x) < 1e-9) {
              if (h < S || h > A) continue;
            } else {
              let T = (S - h) / x,
                R = (A - h) / x;
              T > R && ([T, R] = [R, T]);
              ((C = Math.max(C, T)), (E = Math.min(E, R)));
              if (C > E) continue;
            }
            if (C <= E && E >= 0 && C <= 1) return !1;
          }
        return !0;
      },
      o = (c, h, l, u, d = {}) => {
        let f = null,
          p = -1e9,
          x = Math.max(3.6, c + 2.7),
          m = Math.max(5.6, bi.r + c + 4.1),
          g = Math.max(0.1, Math.min(n, s) - x),
          M = Math.min(10.5, Math.hypot(Math.max(0, n - x), Math.max(0, s - x))),
          b = Math.min(d.maxRadius ?? 9.2, Math.max(m + 1, M * 0.72)),
          v = Math.min(d.minRadius ?? 7.1, b - 1);
        for (let S = 0; S < 96; S++) {
          let A, C;
          if (d.anchor) {
            let T = i.next() * Me,
              R = i.range(d.minDist ?? 6, d.maxDist ?? 9);
            ((A = d.anchor.x + Math.cos(T) * R), (C = d.anchor.y + Math.sin(T) * R));
          } else {
            let T =
                d.angleCenter != null
                  ? d.angleCenter + i.range(-(d.angleSpan ?? 0.5), d.angleSpan ?? 0.5)
                  : i.next() * Me,
              R = i.range(d.minRadius ?? v, d.maxRadius ?? b);
            ((A = bi.x + Math.cos(T) * R), (C = bi.y + Math.sin(T) * R));
          }
          if (
            Math.abs(A) > n - x ||
            Math.abs(C) > s - x ||
            Math.hypot(A - bi.x, C - bi.y) < m ||
            !path(d.pathFrom?.x ?? A, d.pathFrom?.y ?? C, A, C, d.pathFrom?.x != null ? 0.45 : 0.5) ||
            Eu(e, A, C, c + h)
          )
            continue;
          let E = !0,
            _ = 999;
          for (let T of l) {
            let R = Math.hypot(T.x - A, T.y - C),
              V = R - (T.r || 0) - c;
            _ = Math.min(_, V);
            if (R < (T.r || 0) + c + u) {
              E = !1;
              break;
            }
          }
          if (!E || (d.farFrom && Math.hypot(A - d.farFrom.x, C - d.farFrom.y) < (d.farMin || 0))) continue;
          let T = Math.min(n - Math.abs(A), s - Math.abs(C)),
            R = Math.hypot(A - bi.x, C - bi.y),
            V = Math.min(_, 8),
            D = d.preferRadius != null ? Math.abs(R - d.preferRadius) : Math.abs(R - (v + b) * 0.5),
            P = 999;
          for (let L of l) {
            let I = Math.atan2(L.y - bi.y, L.x - bi.x),
              z = Math.atan2(C - bi.y, A - bi.x);
            P = Math.min(P, Math.abs(er(I, z)));
          }
          let O = T * 1.35 + V * 0.75 - P * 0.85 - D * 1.15 + i.next() * 1.1;
          O > p && ((p = O), (f = { x: A, y: C }));
        }
        return f;
      };
    if (t === "works") {
      let c = i.int(3, 5),
        h = i.range(6.5, 8);
      for (let l = 0; l < c; l++) {
        let u = i.range(1.1, 1.5),
          d = o(u, 0.6, r.vents, 3, { minRadius: 6.5, maxRadius: 9.2, preferRadius: 7.8 });
        d && r.vents.push({ x: d.x, y: d.y, r: u, period: h, phase: (l / c) * h + i.range(0, 0.8) });
      }
    } else if (t === "vault") {
      let c = i.int(3, 5);
      for (let h = 0; h < c; h++) {
        let l = i.range(2.2, 3.4),
          u = o(l, 0.45, r.ice, 1.5, { minRadius: 6, maxRadius: 8.8, preferRadius: 7.2 });
        u && r.ice.push({ x: u.x, y: u.y, r: l });
      }
    } else if (t === "marsh") {
      let c = i.int(3, 4);
      for (let h = 0; h < c; h++) {
        let l = i.range(1.8, 2.8),
          u = o(l, 0.55, r.acid, 1.8, { minRadius: 5.8, maxRadius: 8.8, preferRadius: 7 });
        u && r.acid.push({ x: u.x, y: u.y, r: l });
      }
    } else if (t === "void") {
      let c = i.chance(0.4) ? 2 : 1,
        used = [];
      const portalGap = 4.2,
        clearPoint = (p) =>
          Math.abs(p.x) <= n - 3.6 &&
          Math.abs(p.y) <= s - 3.6 &&
          !Eu(e, p.x, p.y, 2.3) &&
          Math.hypot(p.x - bi.x, p.y - bi.y) > 7.1 &&
          used.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= portalGap);
      for (let h = 0; h < c; h++) {
        let l = null;
        for (let u = 0; u < 96 && !l; u++) {
          let d = i.range(7.8, 9.8),
            f = i.next() * Me,
            g = { x: bi.x + Math.cos(f) * d, y: bi.y + Math.sin(f) * d };
          clearPoint(g) && (l = g);
        }
        if (!l) continue;
        let u = null,
          d = Math.atan2(l.y - bi.y, l.x - bi.x) + Math.PI;
        for (let f = 0; f < 96 && !u; f++) {
          let g = i.range(7.8, 9.8),
            M = d + i.range(-0.55, 0.55),
            b = { x: bi.x + Math.cos(M) * g, y: bi.y + Math.sin(M) * g };
          clearPoint(b) && Math.hypot(b.x - l.x, b.y - l.y) > Math.max(n, s) * 0.78 && (u = b);
        }
        if (!u) continue;
        (r.portals.push({ ax: l.x, ay: l.y, bx: u.x, by: u.y, hue: h }), used.push(l, u));
      }
    }
    return r;
  }
  var rlStep = 1 / 60,
    zp = 0.55,
    ic = 420,
    Hp = 360,
    Gp = { nova: "nova", inferno: "inferno", pop: "pop", bomber: "pop", payload: "payload", rocket: "weapon" },
    Aa = class {
      constructor(t) {
        let e = t.snap || null;
        if (
          ((this.seed = (e ? e.seed : t.seed) >>> 0),
          (this.weapon = ue[e ? e.weapon : t.weapon] ? (e ? e.weapon : t.weapon) : "pulse"),
          (this.threat = Lt((e ? e.threat : t.threat) | 0, 0, 5)),
          (this.tm = Ma(this.threat)),
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
          ((this.route = fu(qi(Yi(this.seed + ":route")))),
          (this.combo = 0),
          (this.comboT = 0),
          (this.trails = []),
          (this.hold = !1),
          (this.nextId = 1),
          (this.fx = []),
          (this.stats = nr(this.weapon, this.up, this.ws)),
          (this.player = {
            x: 0,
            y: 2,
            vx: 0,
            vy: 0,
            r: zp,
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
          e && (this.player.hp = Lt(e.hp, 1, this.stats.maxHp)),
          (this.chronoT = 0),
          (this.offer = null),
          (this.offerBoss = !1),
          (this.state = "fight"),
          (this.stateT = 0),
          this.startWave(this.wave, e ? e.nova : null),
          e && Array.isArray(e.offer))
        ) {
          let n = e.offer.filter((s) => ri[s]);
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
        ((this.wave = t), (this.rng = qi(Yi(this.seed + ":" + t))));
        let n = this.biomeFor(t),
          s = Su(n, this.seed, t, t === 1 || !!this.bossFor(t));
        ((!this.arena || this.arena.key !== s.key) &&
          ((this.arena = new Sa(n, s)), (this.hash = new wa(s.W, s.H, 2.5))),
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
        let c = qi(Yi(this.seed + ":champ:" + t));
        ((this.championPending =
          !o && !this.event && t >= 3 && (t - 1) % 5 >= 2 && c.chance(0.4) ? this.championType(n.id, t, c) : null),
          (this.plan = _u(this.rng, t, this.tm, !!o, this.event ? $i[this.event].plan : {})),
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
        ).filter((a) => Ae[a].from <= e);
        return r.length ? n.pick(r) : "grunt";
      }
      eventFor(t) {
        let e = (r) => r >= 3 && !this.bossFor(r) && (r - 1) % 5 !== 0,
          n = (r) => qi(Yi(this.seed + ":event:" + r));
        if (!e(t) || n(t).next() >= Jl || (e(t - 1) && n(t - 1).next() < Jl)) return null;
        let s = n(t);
        return (s.next(), ["elite", "rain"][Math.floor(s.next() * 2)]);
      }
      biomeFor(t) {
        let e = Math.max(1, t) - 1,
          n = Math.floor(e / this.route.length),
          s = (e + n) % this.route.length;
        return du[this.route[s]] || ii[0];
      }
      bossFor(t) {
        return t % 5 !== 0 ? null : uu[t] || Kl[(t / 5 - 1) % Kl.length];
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
        let e = ri[t],
          n = this.player,
          s = this.stats.maxHp;
        return (
          (this.up[t] = (this.up[t] || 0) + 1),
          e.rarity === 4 && this.legendaries++,
          e.rarity === 5 && this.evolved++,
          (this.stats = nr(this.weapon, this.up, this.ws)),
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
        return pu(this.rng, this.up, this.wave, this.player.hp / this.stats.maxHp, e, this.offerBoss, t, this.weapon);
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
              a.boss ? vu(this, a, s) : mu(this, a, s),
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
          let f = vn(d ? 2.4 : this.arena.biome.grip || 16, t),
            p = s.speed * (d ? 1.12 : 1) * (n.slowT > 0 ? 0.65 : 1);
          ((n.vx += (r * p - n.vx) * f), (n.vy += (a * p - n.vy) * f));
        }
        ((n.x += n.vx * t),
          (n.y += n.vy * t),
          this.arena.resolve(n, n.r),
          n.moving && n.dashT <= 0 && (n.face = Ne(n.face, Math.atan2(a, r), 14 * t)));
        let c = !!e.aim && Math.hypot(+e.ax || 0, +e.ay || 0) > 0.2,
          h = null;
        if (c) ((h = Math.atan2(e.ay, e.ax)), e.assist !== !1 && (h = this.assistAim(h)), (n.target = null));
        else {
          let d = this.pickTarget();
          ((n.target = d), d && (h = Math.atan2(d.y - n.y, d.x - n.x)));
        }
        let l = c || (!!e.fire && h != null) || (!!e.auto && h != null && n.target != null);
        (h != null ? (n.aim = Ne(n.aim, h, 30 * t)) : n.moving && (n.aim = Ne(n.aim, n.face, 8 * t)),
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
          let l = Math.abs(er(t, Math.atan2(c, o))),
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
            if (this.pb.length >= ic) return;
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
        let r = Ae[t],
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
            phase: this.rng.next() * Me,
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
        let h = cu[this.arena.biome.id];
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
        let e = en[t],
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
          yu(this, a),
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
          let o = vn(2.2, e);
          ((t.svx = (t.svx ?? s) + (s - (t.svx ?? s)) * o),
            (t.svy = (t.svy ?? r) + (r - (t.svy ?? r)) * o),
            (s = t.svx),
            (r = t.svy));
        } else ((t.svx = s), (t.svy = r));
        ((t.x += (s * n + t.kx) * e), (t.y += (r * n + t.ky) * e));
        let a = vn(7, e);
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
          let n = (t.boss ? e.shards : e.shards * (t.elite ? 4 : 1) * 0.4) * (this.event ? $i[this.event].shardMul : 1);
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
            let s = (n / 3) * Me + this.rng.next(),
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
          for (let n of this.enemies)
            n.dead || ((n.noDrop = !0), (n.noCombo = !0), (n.affix = null), this.killEnemy(n));
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
        for (let [t, e] of hu) this.combo === t && ((this.shards += e), this.emit("combo", { n: t, bonus: e }));
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
        let r = this.rng.next() * Me,
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
                (this.hurtEnemy(a, s, a.x - t, a.y - e, r.knock || 3, !1, Gp[r.kind] || "weapon"),
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
              let M = vn(9, t),
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
              (r.bomblet || r.w === "rocket" || ue[r.w]?.explode || (e.payloadR && !r.drag)) &&
                this.bulletBurst(r, null),
              r.drag || this.emit("spark", { x: r.x, y: r.y, w: r.w }));
            continue;
          }
          let d = Math.hypot(r.vx, r.vy) * t,
            f = d > 0.5 ? Math.ceil(d / 0.5) : 1,
            p = !!ue[r.w].rail;
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
                if (R < _ && Math.abs(er(b.face, Math.atan2(-S, -v))) < 1.15) {
                  let E = b.x + Math.cos(b.face) * (b.r + 0.45),
                    C = b.y + Math.sin(b.face) * (b.r + 0.45);
                  return (
                    r.boom && !r.back
                      ? ((r.back = !0), (r.hits.length = 0))
                      : r.drag
                        ? (r.hits.push(b.id), r.pierce-- <= 0 && (r.life = 0))
                        : ((r.life = 0),
                          (r.w === "rocket" || r.bomblet || ue[r.w]?.explode || e.payloadR) &&
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
            u > s || Math.abs(er(r, Math.atan2(l, h))) > 1.3 || ((s = u), (n = c));
          }),
          !n)
        )
          return;
        let a = Ne(r, Math.atan2(n.y - t.y, n.x - t.x), t.homing * e),
          o = Math.hypot(t.vx, t.vy);
        ((t.vx = Math.cos(a) * o), (t.vy = Math.sin(a) * o), (t.a = a));
      }
      bulletHit(t, e) {
        let n = this.stats,
          s = ue[t.w],
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
          n.arc &&
            this.rng.chance(n.arc * (t.drag ? 0.25 : 1)) &&
            this.chainFrom(e, n.arcJumps, a * 0.6, t.hits, "arc"),
          (t.bomblet || t.w === "rocket" || ue[t.w]?.explode || (n.payloadR && (!t.drag || this.rng.chance(0.2)))) &&
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
          s = ue[t.w],
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
          if (this.pb.length >= ic) return;
          let r = this.rng.next() * Me;
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
                o = Ne(r, Math.atan2(e.y - s.y, e.x - s.x), s.homing * t);
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
        if (this.eb.length >= Hp) return null;
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
          let c = this.time * 3.3 + (o * Me) / e,
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
        let s = vn(6, t);
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
          for (let p = 0; p < f && !(this.pb.length >= ic); p++) {
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
            h = Lt(h, 0, 1);
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
            ((a.vx += ((o / h) * u - a.vx) * vn(9, t)), (a.vy += ((c / h) * u - a.vy) * vn(9, t)));
          } else ((a.vx *= 1 - vn(4, t)), (a.vy *= 1 - vn(4, t)));
          if (
            ((a.x += a.vx * t),
            (a.y += a.vy * t),
            a.pull || this.arena.resolve(a, 0.2),
            h < e.r + 0.35 && e.alive && !l)
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
            u = this.rng.next() * Me + c * 2.399963;
          for (let d = 0; d < 12; d++) {
            let f =
                0.55 +
                Math.min(1.7, 1 + s.members.length * 0.12) * Math.sqrt((c + 0.6) / Math.max(1, s.members.length)),
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
        } else if (
          this.state === "cleared" &&
          ((this.stateT > 1.6 && this.pickups.length === 0) || this.stateT > 3.5)
        ) {
          for (let t of this.pickups) t.kind === "shard" && (this.shards += t.v);
          ((this.pickups.length = 0),
            this.isFinalWave()
              ? ((this.state = "victory"), (this.stateT = 0), this.emit("victory"))
              : ((this.state = "choose"), (this.stateT = 0), (this.offer = this.makeOffer()), this.emit("offer")));
        }
      }
    };
  /* RIFTLINE 2.0 content pack: data-only extensions live together so the core systems stay reusable. */
  Object.assign(Ae, {
    charger: {
      id: "charger",
      name: "Charger",
      hp: 50,
      speed: 4.5,
      r: 0.62,
      dmg: 22,
      cost: 4,
      shards: 5,
      from: 14,
      color: 16698368,
    },
    minebot: {
      id: "minebot",
      name: "Minebot",
      hp: 62,
      speed: 2.05,
      r: 0.7,
      dmg: 17,
      cost: 5,
      shards: 7,
      from: 16,
      color: 11646976,
    },
  });
  lu.push("charger", "minebot");
  Object.assign(Ip, { charger: 1.45, minebot: 0.8 });
  Object.assign(ec, { charger: 2, minebot: 3 });

  Zi.push(
    { id: "caliber", name: "Overbore Caliber", rarity: 1, max: 5, icon: "burst", desc: () => "+10% damage" },
    {
      id: "stabilizer",
      name: "Vector Stabilizer",
      rarity: 1,
      max: 4,
      icon: "arrow",
      desc: () => "+12% projectile speed and range",
    },
    {
      id: "glasscore",
      name: "Glass Core",
      rarity: 2,
      max: 3,
      icon: "star",
      desc: () => "+8% damage and +4% crit, but -5% max HP",
    },
    { id: "aether", name: "Aether Capacitor", rarity: 2, max: 3, icon: "star", desc: () => "+15% Nova gain" },
    {
      id: "hunter",
      name: "Apex Hunter",
      rarity: 3,
      max: 3,
      icon: "target",
      desc: () => "+10% damage against elites and bosses",
    },
    {
      id: "supply",
      name: "Supply Loop",
      rarity: 2,
      max: 4,
      icon: "shard",
      desc: () => "Every 12 kills drop bonus shards",
    },
    {
      id: "coolant",
      name: "Cryo Coolant",
      rarity: 2,
      max: 3,
      icon: "snow",
      desc: () => "-12% dash and shield cooldowns",
    },
  );
  ri = Object.fromEntries(Zi.map((i) => [i.id, i]));

  ai.push(
    // 2.3.5: Armor Core reduces enemy damage (it gave +8 max HP, next to Hull Plating's +10)
    { id: "armorCore", name: "Armor Core", icon: "shield", desc: "-4% damage from enemies per level", costs: [220, 420, 760, 1180] },
    {
      id: "riftBattery",
      name: "Rift Battery",
      icon: "star",
      desc: "Start each wave with +10% Nova charge",
      costs: [260, 540, 980],
    },
    { id: "droneBay", name: "Drone Bay", icon: "drone", desc: "+1 Wingman slot per level", costs: [950, 1800] },
  );
  p_ = Object.fromEntries(ai.map((i) => [i.id, i]));

  _i.push(
    {
      id: "wave100",
      name: "Endless Horizon",
      desc: "Reach wave 100",
      reward: 1600,
      test: (i) => i.stats.bestWave >= 100,
    },
    {
      id: "kills25000",
      name: "Planet Breaker",
      desc: "Destroy 25,000 enemies",
      reward: 1800,
      test: (i) => i.stats.kills >= 25000,
    },
    {
      id: "bosses50",
      name: "Apex Protocol",
      desc: "Defeat 50 bosses total",
      reward: 1800,
      test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 50,
    },
    {
      id: "allbiomes",
      name: "World Walker",
      // 2.4.0: the biome changes after every boss, so wave 21 is the first wave of the fifth biome
      desc: "Reach wave 21 \u2014 every biome of the rift in one run",
      reward: 1100,
      test: (i) => i.stats.bestWave >= 5 * (ii.length - 1) + 1,
    },
    {
      id: "weaponClear10",
      name: "Full Spectrum",
      // 2.4.0: 7 weapons left (was 10 of 21)
      desc: "Clear runs with at least 4 different weapons",
      reward: 600,
      test: (i) => Object.values(i.stats.clearsBy).filter((v) => v > 0).length >= 4,
    },
    {
      id: "combo750",
      name: "Event Horizon",
      desc: "Reach a ×750 kill combo",
      reward: 1600,
      test: (i) => i.stats.bestCombo >= 750,
    },
  );

  /* RIFTLINE 2.1 dynamic expansion: new content uses the existing data contracts. */

  Object.assign(Ae, {
    sapper: {
      id: "sapper",
      name: "Sapper",
      hp: 54,
      speed: 2.8,
      r: 0.62,
      dmg: 18,
      cost: 5,
      shards: 6,
      from: 18,
      color: 16734720,
    },
    phantom: {
      id: "phantom",
      name: "Phantom",
      hp: 38,
      speed: 4,
      r: 0.56,
      dmg: 19,
      cost: 5,
      shards: 6,
      from: 20,
      color: 10973306,
    },
    sentinel: {
      id: "sentinel",
      name: "Sentinel",
      hp: 68,
      speed: 1.2,
      r: 0.78,
      dmg: 18,
      cost: 6,
      shards: 8,
      from: 21,
      color: 16769354,
    },
    carrier: {
      id: "carrier",
      name: "Carrier",
      hp: 72,
      speed: 2.2,
      r: 0.82,
      dmg: 16,
      cost: 6,
      shards: 9,
      from: 22,
      color: 37119,
    },
  });
  lu.push("sapper", "phantom", "sentinel", "carrier");
  Object.assign(Ip, { sapper: 1.05, phantom: 0.9, sentinel: 0.72, carrier: 0.66 });
  Object.assign(ec, { sapper: 1, phantom: 1, sentinel: 1, carrier: 1 });

  Zi.push(
    {
      id: "overload",
      name: "Overload",
      rarity: 2,
      max: 3,
      icon: "burst",
      desc: (l, i = l + 1) => `Every 6th shot releases a close-range burst (${24 + 8 * i} damage)`,
    },
    {
      id: "focus",
      name: "Dead Focus",
      rarity: 1,
      max: 5,
      icon: "crosshair",
      desc: (l, i = l + 1) => `+${4 * i}% crit chance and +${10 * i}% range`,
    },
    {
      id: "resonance",
      name: "Resonance",
      rarity: 3,
      max: 3,
      icon: "bolt",
      desc: (l, i = l + 1) => `+${8 * i}% chain chance and +${i} chain jump`,
    },
    { id: "fortify", name: "Fortify", rarity: 1, max: 5, icon: "shield", desc: (l, i = l + 1) => `+${15 * i} max HP` },
    {
      id: "leech",
      name: "Nanite Leech",
      rarity: 3,
      max: 2,
      icon: "heart",
      desc: (l, i = l + 1) => `${8 * i}% kill chance to repair 2 HP`,
    },
    {
      id: "hazmat",
      name: "Hazmat",
      rarity: 2,
      max: 3,
      icon: "shield",
      desc: (l, i = l + 1) => `-${25 * i}% feature hazard damage`,
    },
    {
      id: "echo",
      name: "Echo Chamber",
      rarity: 3,
      max: 2,
      icon: "rate",
      desc: (l, i = l + 1) => `${8 * i}% chance for a shot to repeat`,
    },
    {
      id: "scavengerNet",
      name: "Scavenger Net",
      rarity: 2,
      max: 3,
      icon: "shard",
      desc: (l, i = l + 1) => `Supply caches gain +${i} bonus value tier`,
    },
  );
  ri = Object.fromEntries(Zi.map((i) => [i.id, i]));

  ai.push(
    // 2.3.5: Arsenal Lab raises the fire rate (it gave +5% damage, the same as Power Core)
    { id: "arsenalLab", name: "Arsenal Lab", icon: "burst", desc: "+6% fire rate per level", costs: [1800, 3600, 6500] },
    {
      id: "fieldSupply",
      name: "Field Supply",
      icon: "shard",
      desc: "+1 supply cache per wave per level (from wave 2, not in boss waves)",
      costs: [1400, 3000, 5200],
    },
    {
      id: "hazardSeal",
      name: "Hazard Seal",
      icon: "shield",
      desc: "-15% map hazard damage per level",
      costs: [1200, 2500, 4500],
    },
  );
  p_ = Object.fromEntries(ai.map((i) => [i.id, i]));

  _i.push(
    { id: "wave125", name: "Deep Horizon", desc: "Reach wave 125", reward: 1200, test: (i) => i.stats.bestWave >= 125 },
    { id: "wave150", name: "Far Breach", desc: "Reach wave 150", reward: 1600, test: (i) => i.stats.bestWave >= 150 },
    {
      id: "bosses100",
      name: "Apex Archive",
      desc: "Defeat 100 bosses total",
      reward: 2200,
      test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 100,
    },
    {
      id: "shards100k",
      name: "Shard Tycoon",
      desc: "Earn 100,000 total shards",
      reward: 2500,
      test: (i) => i.stats.shardsEarned >= 100000,
    },
    {
      id: "evolve10",
      name: "Evolution Engine",
      desc: "Evolve 10 times",
      reward: 1200,
      test: (i) => i.stats.evolved >= 10,
    },
  );

  /* 2.3.5: shards in a supply cache, raised by Route Scanner (+50% per level). */
  function rlCacheShards(w, v) {
    return Math.round(v * Math.max(1, w.stats.cacheValue || 1));
  }
  /* 2.3.5: Armor Core absorbs part of the damage from enemies. Lava and acid are left to
     Hazard Seal, so the two modules do not stack on the same damage. */
  const RL_HAZARD_SRC = new Set(["lava", "acid"]);
  const _rlHurtArmor = Aa.prototype.hurtPlayer;
  Aa.prototype.hurtPlayer = function (dmg, x, y, src, chip) {
    const armor = Math.min(0.5, this.stats.armor || 0);
    return _rlHurtArmor.call(this, armor > 0 && !RL_HAZARD_SRC.has(src) ? dmg * (1 - armor) : dmg, x, y, src, chip);
  };

  /* Prototype hooks keep new systems additive and preserve the original class implementation. */
  const _rlStartWave = Aa.prototype.startWave;
  Aa.prototype.startWave = function (wave, nova) {
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
          qi(Yi(this.seed + ":cache:" + wave + ":" + i)),
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
    const cacheRng = qi(Yi(this.seed + ":cache22:" + wave));
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
    const avail = bonusPool.filter((id) => Ae[id] && wave >= Ae[id].from);
    if (wave >= 18 && avail.length) {
      const members = [{ type: cacheRng.pick(avail), elite: !1 }];
      if (wave >= 30 && cacheRng.chance(0.45)) members.push({ type: cacheRng.pick(avail), elite: !1 });
      this.plan.push({ gap: 2.35, members });
      this.planTotal += members.length;
    }
  };
  const _rlKillEnemy = Aa.prototype.killEnemy;
  Aa.prototype.killEnemy = function (enemy) {
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
  const _rlHurtEnemy = Aa.prototype.hurtEnemy;
  Aa.prototype.hurtEnemy = function (enemy, dmg, dx, dy, knock, crit, src) {
    const mul = enemy && (enemy.elite || enemy.boss) ? this.stats.eliteMul || 1 : 1;
    return _rlHurtEnemy.call(this, enemy, dmg * mul, dx, dy, knock, crit, src);
  };
  const _rlChampionType = Aa.prototype.championType;
  Aa.prototype.championType = function (biome, wave, rng) {
    // 2.4.0: the pack biomes are gone; the five biomes also draw champions from the later enemies
    const special = {
      works: ["brute", "grunt", "charger", "minebot", "driller"],
      vault: ["bulwark", "gunner", "sentinel", "turret"],
      void: ["striker", "brute", "phantom", "weaver"],
      marsh: ["splitter", "brute", "sapper", "carrier"],
    }[biome];
    if (special) {
      const valid = special.filter((id) => Ae[id] && Ae[id].from <= wave);
      if (valid.length) return rng.pick(valid);
    }
    return _rlChampionType.call(this, biome, wave, rng);
  };
  const _rlFire21 = Aa.prototype.fire;
  Aa.prototype.fire = function (angle) {
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

  /* RIFTLINE 2.2 content pack: more build diversity, enemy roles, biomes and set-piece waves. */

  Object.assign(Ae, {
    drone: {
      id: "drone",
      name: "Needler Drone",
      hp: 34,
      speed: 3.0,
      r: 0.48,
      dmg: 12,
      cost: 3,
      shards: 3,
      from: 18,
      color: 6809343,
    },
    driller: {
      id: "driller",
      name: "Driller",
      hp: 90,
      speed: 2.3,
      r: 0.78,
      dmg: 26,
      cost: 6,
      shards: 8,
      from: 24,
      color: 16728644,
    },
    beacon: {
      id: "beacon",
      name: "Repair Beacon",
      hp: 75,
      speed: 1.5,
      r: 0.72,
      dmg: 8,
      cost: 7,
      shards: 10,
      from: 26,
      color: 7208904,
    },
    weaver: {
      id: "weaver",
      name: "Rift Weaver",
      hp: 48,
      speed: 3.7,
      r: 0.58,
      dmg: 17,
      cost: 5,
      shards: 7,
      from: 28,
      color: 12617185,
    },
  });
  lu.push("drone", "driller", "beacon", "weaver");
  Object.assign(Ip, { drone: 0.95, driller: 0.62, beacon: 0.5, weaver: 0.72 });
  Object.assign(ec, { drone: 1, driller: 2, beacon: 3, weaver: 1 });

  Zi.push(
    { id: "kinetic", name: "Kinetic Matrix", rarity: 1, max: 4, icon: "burst", desc: () => "+8% damage" },
    {
      id: "deadeye",
      name: "Deadeye Lens",
      rarity: 2,
      max: 4,
      icon: "crosshair",
      desc: () => "+3% crit and +5% targeting range",
    },
    { id: "thruster", name: "Vector Thrusters", rarity: 1, max: 4, icon: "wing", desc: () => "+5% move speed" },
    {
      id: "nanorepair",
      name: "Nanorepair Gel",
      rarity: 2,
      max: 3,
      icon: "heart",
      desc: (i) => `+${(0.55 * (i + 1)).toFixed(2)} HP/s regeneration`,
    },
    {
      id: "salvager",
      name: "Salvager Core",
      rarity: 2,
      max: 3,
      icon: "shard",
      desc: () => "Find +1 extra supply cache",
    },
    { id: "phasecoat", name: "Phasecoat", rarity: 2, max: 3, icon: "shield", desc: () => "-8% map hazard damage" },
    { id: "flux", name: "Flux Capacitor", rarity: 2, max: 4, icon: "star", desc: () => "+8% Nova gain" },
    {
      id: "payloadMatrix",
      name: "Payload Matrix",
      rarity: 3,
      max: 3,
      icon: "burst",
      desc: () => "Larger and stronger explosion radius",
    },
    { id: "chainlink", name: "Chain Link", rarity: 2, max: 3, icon: "bolt", desc: () => "+1 chain jump" },
    {
      id: "afterburner",
      name: "Afterburner",
      rarity: 3,
      max: 3,
      icon: "wing",
      desc: () => "-6% dash and shield cooldowns",
    },
  );
  ri = Object.fromEntries(Zi.map((i) => [i.id, i]));

  ai.push(
    {
      id: "routeScanner",
      name: "Route Scanner",
      icon: "map",
      desc: "+50% shards from supply caches per level",
      costs: [1800, 3800, 6800],
    },
    {
      id: "reactorCore",
      name: "Reactor Core",
      icon: "star",
      desc: "Start each wave with +5% Nova charge",
      costs: [1600, 3400, 6200],
    },
  );
  p_ = Object.fromEntries(ai.map((i) => [i.id, i]));

  _i.push(
    { id: "wave175", name: "Deep End", desc: "Reach wave 175", reward: 2200, test: (i) => i.stats.bestWave >= 175 },
    {
      id: "wave200",
      name: "Beyond the Rim",
      desc: "Reach wave 200",
      reward: 2800,
      test: (i) => i.stats.bestWave >= 200,
    },
    {
      id: "kills50000",
      name: "Graveyard Shift",
      desc: "Destroy 50,000 enemies",
      reward: 2600,
      test: (i) => i.stats.kills >= 50000,
    },
    {
      id: "bosses150",
      name: "Boss Archive",
      desc: "Defeat 150 bosses total",
      reward: 3200,
      test: (i) => Object.values(i.stats.bosses).reduce((a, b) => a + b, 0) >= 150,
    },
    {
      id: "shards250k",
      name: "Shard Industry",
      desc: "Earn 250,000 total shards",
      reward: 3500,
      test: (i) => i.stats.shardsEarned >= 250000,
    },
    {
      id: "evolve20",
      name: "Evolution Master",
      desc: "Evolve 20 times",
      reward: 2200,
      test: (i) => i.stats.evolved >= 20,
    },
    {
      id: "combo1000",
      name: "Singularity",
      desc: "Reach a ×1000 kill combo",
      reward: 2400,
      test: (i) => i.stats.bestCombo >= 1000,
    },
  );

  /* v2.2 stat integration is additive and centralized. */
  const _rlNr22 = nr;
  nr = function (weapon, run, workshop) {
    const s = _rlNr22(weapon, run, workshop),
      u = (id) => run[id] || 0,
      w = (id) => workshop[id] || 0;
    s.dmgMul *= 1 + 0.08 * u("kinetic");
    s.crit = Math.min(0.95, s.crit + 0.03 * u("deadeye"));
    s.range *= 1 + 0.05 * u("deadeye");
    s.speed *= 1 + 0.05 * u("thruster");
    s.regen += 0.55 * u("nanorepair");
    s.cacheBonus += u("salvager");
    s.cacheValue = 1 + 0.5 * w("routeScanner");
    s.hazardResist = Math.min(0.92, (s.hazardResist || 0) + 0.08 * u("phasecoat"));
    s.novaMul *= 1 + 0.08 * u("flux");
    s.payloadR += 0.35 * u("payloadMatrix");
    s.payloadF += 0.12 * u("payloadMatrix");
    s.chain += u("chainlink");
    s.dashCd *= Math.max(0.45, 1 - 0.06 * u("afterburner"));
    s.shieldCd *= Math.max(0.45, 1 - 0.06 * u("afterburner"));
    s.novaStart = Math.min(100, (s.novaStart || 0) + 5 * w("reactorCore"));
    return s;
  };

  /* New enemy roles use the same movement/shooting primitives as the core AI. */
  const _rlMu22 = mu;
  mu = function (game, enemy, dt) {
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
      enemy.face = Ne(enemy.face, ang, 7 * dt);
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
        enemy.face = Ne(enemy.face, ang, 7 * dt);
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
        enemy.face = Ne(enemy.face, enemy.ta, 14 * dt);
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
      enemy.face = Ne(enemy.face, ang, 5 * dt);
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
      enemy.face = Ne(enemy.face, ang, 8 * dt);
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
    return _rlMu22(game, enemy, dt);
  };

  const _rlSelfTest22 = rlSelfTest;
  rlSelfTest = function () {
    const r = _rlSelfTest22(),
      fail = [];
    const weapons = Object.keys(ue),
      enemies = Object.keys(Ae),
      biomes = Object.keys(du),
      upgrades = Object.keys(ri),
      modules = Object.keys(p_);
    if (!["drone", "driller", "beacon", "weaver"].every((k) => enemies.includes(k))) fail.push("missing-v22-enemy");
    if (
      ![
        "kinetic",
        "deadeye",
        "thruster",
        "nanorepair",
        "salvager",
        "phasecoat",
        "flux",
        "payloadMatrix",
        "chainlink",
        "afterburner",
      ].every((k) => upgrades.includes(k))
    )
      fail.push("missing-v22-upgrade");
    if (!["routeScanner", "reactorCore"].every((k) => modules.includes(k))) fail.push("missing-v22-workshop");
    // 2.4.0: every selectable weapon (the 2.2 weapons are gone)
    for (const id of En) {
      const w = new Aa({ seed: 0x2200 + id.length, weapon: id, threat: 0, ws: {} });
      w.startWave(2);
      w.fire(0);
      if (!w.pb.length) fail.push("weapon-fire:" + id);
      for (const q of w.pb)
        if (![q.x, q.y, q.vx, q.vy, q.r, q.dmg, q.life].every(Number.isFinite)) fail.push("weapon-finite:" + id);
    }
    for (const id of ["drone", "driller", "beacon", "weaver"]) {
      const w = new Aa({ seed: 0x3300 + id.length, weapon: "pulse", threat: 0, ws: {} });
      w.startWave(28);
      const e = w.spawnEnemy(id, 8, 0, {});
      for (let k = 0; k < 90; k++) {
        mu(w, e, 0.05);
        e.x += e.vx * 0.05;
        e.y += e.vy * 0.05;
        if (![e.x, e.y, e.vx, e.vy, e.hp].every(Number.isFinite)) fail.push("enemy-finite:" + id);
      }
    }
    const modes = new Set();
    // 2.4.0: every hazard biome for every wave (picking one biome by (seed + wave) % count only
    // reached 9 of the 12 modes once there were four biomes)
    for (let seed = 1; seed <= 4; seed++)
      for (let wave = 2; wave <= 38; wave++)
        for (const b of ii.slice(1)) {
          const lay = Su(b, seed, wave, false);
          if (!lay.director?.mode) fail.push("director-missing");
          else modes.add(lay.director.mode);
          if (!kp(lay.obstacles, lay.W, lay.H)) fail.push("director-connectivity");
          for (const key of ["vents", "ice", "acid"]) {
            for (const q of lay.features?.[key] || [])
              if (Eu(lay.obstacles, q.x, q.y, (q.r || 0) + 0.8)) fail.push("feature-overlap:" + key);
          }
          for (const q of lay.features?.portals || []) {
            for (const [x, y] of [
              [q.ax, q.ay],
              [q.bx, q.by],
            ])
              if (Eu(lay.obstacles, x, y, 1.5) || Math.abs(x) > lay.W - 3.6 || Math.abs(y) > lay.H - 3.6)
                fail.push("portal-overlap");
          }
        }
    if (modes.size < 10) fail.push("director-variety");
    let minCache = Infinity,
      maxCache = 0;
    for (let wave = 2; wave <= 30; wave++) {
      const w = new Aa({ seed: 0x4400 + wave, weapon: "pulse", threat: 0, ws: { fieldSupply: 1 } });
      w.startWave(wave);
      const c = w.pickups.filter((p) => p.cache).length;
      if (w.bossPending) {
        c && fail.push("cache-in-boss-wave:" + wave);
        continue;
      }
      minCache = Math.min(minCache, c);
      maxCache = Math.max(maxCache, c);
      if (c < 1) fail.push("cache-missing:" + wave);
    }
    const haz = new Aa({ seed: 0x5500, weapon: "pulse", threat: 0, ws: { hazardSeal: 3 } });
    if (!(haz.stats.hazardResist > 0.4)) fail.push("hazard-resist");
    const guard = rlUiButtonGuardSelfTest();
    if (!guard.ok || guard.count !== 9 || guard.steps !== 8) fail.push("ui-guard");
    const counts = {
      weaponCount: weapons.length,
      enemyCount: enemies.length,
      biomeCount: biomes.length,
      upgradeCount: upgrades.length,
      workshopCount: modules.length,
      directorModes: [...modes],
      cacheRange: [minCache, maxCache],
    };
    return { ...r, ok: r.ok && fail.length === 0, expansion22: { ok: fail.length === 0, fail, ...counts } };
  };

  const _rlSelfTest21 = rlSelfTest;
  rlSelfTest = function () {
    const r = _rlSelfTest21(),
      fail = [];
    const weapons = Object.keys(ue),
      enemies = Object.keys(Ae),
      biomes = Object.keys(du),
      upgrades = Object.keys(ri);
    if (!["sapper", "phantom", "sentinel", "carrier"].every((k) => enemies.includes(k))) fail.push("missing-v21-enemy");
    if (
      !["overload", "focus", "resonance", "fortify", "leech", "hazmat", "echo", "scavengerNet"].every((k) =>
        upgrades.includes(k),
      )
    )
      fail.push("missing-v21-upgrade");
    // 2.4.0: every weapon with a blast (was Graviton Core, Nova Bloom and Vortex)
    for (const k of En.filter((id) => ue[id].explode)) {
      const w = new Aa({ seed: 0x21 + k.length, weapon: k, threat: 0, ws: {} });
      w.startWave(2);
      w.bulletBurst({ x: 0, y: 0, w: k, dmg: 10, hits: [], bomblet: false, wing: false }, null);
      if (!w.fx.some((q) => q.k === "boom")) fail.push("burst:" + k);
    }
    const modes = new Set();
    for (let seed = 1; seed <= 4; seed++)
      for (let wave = 2; wave <= 28; wave++) {
        const b = ii[1 + ((seed + wave) % (ii.length - 1))],
          lay = Su(b, seed, wave, false);
        if (!lay.director?.mode) fail.push("director-missing");
        else modes.add(lay.director.mode);
        if (!kp(lay.obstacles, lay.W, lay.H)) fail.push("director-connectivity");
      }
    if (modes.size < 6) fail.push("director-variety");
    return {
      ...r,
      ok: r.ok && fail.length === 0,
      expansion21: {
        ok: fail.length === 0,
        fail,
        weaponCount: weapons.length,
        enemyCount: enemies.length,
        biomeCount: biomes.length,
        upgradeCount: upgrades.length,
        directorModes: [...modes],
      },
    };
  };

  /* ==========================================================================
     RIFTLINE 2.4.0 — fewer biomes and weapons, each clearly different
     ========================================================================== */
  /* 2.4.0: 21 weapons → the 7 originals. The 14 weapons of the 2.0–2.2 packs were parameter
   variants of those (Void Lance, Sunlance and Ember Rail were Railguns, Razor Loop and Cyclone
   Blades Disc Launchers …). A save that owned one gets the weapon it was a variant of, plus the
   price difference in shards — or the full price when it owns that weapon already. */
  var RL_RETIRED_WEAPONS = {
    ion: { name: "Ion Repeater", cost: 1250, to: "tesla" },
    gravity: { name: "Graviton Core", cost: 1550, to: "rocket" },
    voidlance: { name: "Void Lance", cost: 1950, to: "rail" },
    bloom: { name: "Nova Bloom", cost: 2400, to: "rocket" },
    volley: { name: "Volley", cost: 1450, to: "scatter" },
    prismcannon: { name: "Prism Cannon", cost: 1750, to: "tesla" },
    sunlance: { name: "Sunlance", cost: 2200, to: "rail" },
    vortex: { name: "Vortex", cost: 2450, to: "rocket" },
    razorloop: { name: "Razor Loop", cost: 2050, to: "disc" },
    needle: { name: "Needle Array", cost: 1200, to: "pulse" },
    lattice: { name: "Lattice Array", cost: 2850, to: "tesla" },
    quasar: { name: "Quasar Driver", cost: 3300, to: "rocket" },
    cyclone: { name: "Cyclone Blades", cost: 3050, to: "disc" },
    emberrail: { name: "Ember Rail", cost: 3900, to: "rail" },
  };
  const rlRetired = (id) =>
    typeof id === "string" && Object.prototype.hasOwnProperty.call(RL_RETIRED_WEAPONS, id)
      ? RL_RETIRED_WEAPONS[id]
      : null;
  // What the last load converted (shown once as a toast after start-up).
  var RL_RETIRE_NOTE = null;
  /* Runs on the raw save before it is sanitised (ap), so it covers loading and importing. Returns
   the input untouched when there is nothing to convert; never mutates it (rlLoadSave may still
   back up the raw object). Running it again on its own output changes nothing. */
  function rlMigrateRetired(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null),
      own = obj(raw.weapons),
      run = obj(raw.run),
      owned = own ? Object.keys(RL_RETIRED_WEAPONS).filter((id) => own[id] === true) : [],
      sel = rlRetired(raw.weapon),
      runW = run && rlRetired(run.weapon);
    if (!owned.length && !sel && !runW) return raw;
    const out = { ...raw },
      weapons = { ...(own || {}) };
    let refund = 0;
    for (const id of owned) {
      const r = RL_RETIRED_WEAPONS[id];
      delete weapons[id];
      if (weapons[r.to] === true) refund += r.cost;
      else ((weapons[r.to] = true), (refund += Math.max(0, r.cost - ue[r.to].cost)));
    }
    out.weapons = weapons;
    if (sel) out.weapon = sel.to;
    if (runW) out.run = { ...run, weapon: runW.to };
    if (refund > 0) out.shards = (Number.isFinite(raw.shards) ? Math.max(0, raw.shards) : 0) + refund;
    RL_RETIRE_NOTE = { refund, names: owned.map((id) => RL_RETIRED_WEAPONS[id].name) };
    return out;
  }
  const _rlApBase = ap;
  ap = function (raw) {
    return _rlApBase(rlMigrateRetired(raw));
  };

  /* 2.4.0: 19 biomes → 5, and the biome changes after every boss again (it changed every wave
   since 2.1). Waves 1–5 are always Neon Yard; the other four follow in a seeded order, one per
   boss cycle, so a 20-wave run shows four biomes and Endless reaches the fifth at wave 21.
   Each biome plays differently, not only in colour:
     Neon Yard    open ground, no hazard, the standard enemy mix
     Ember Works  lava vents; heavy and explosive enemies (brute, bomber, charger, minebot …)
     Cryo Vault   the whole floor is slick (you drift), ice sheets are slicker; shielded and
                  ranged enemies (bulwark, sniper, turret, sentinel …)
     Toxin Marsh  acid pools, thick fog; swarms (splitter, hive, swarmer, sapper …)
     Void Core    portal pairs; fast and teleporting enemies (striker, phantom, weaver …)
   The look of each biome (floor, props, border, particles, light) is in the renderer part of
   2.4.0 further down. */
  var RL_BIOME_INFO = {
    yard: { tag: "Open ground" },
    works: {
      tag: "Lava vents",
      mix: { brute: 2.2, bomber: 2.2, charger: 2, mortar: 1.6, minebot: 1.8, driller: 1.6, swarmer: 0.6 },
    },
    vault: {
      tag: "Slick floor",
      grip: 6.5,
      mix: { bulwark: 2.2, sniper: 2, gunner: 1.8, turret: 2, sentinel: 1.8, swarmer: 0.6, splitter: 0.6 },
    },
    marsh: {
      tag: "Acid pools",
      mix: { swarmer: 1.6, splitter: 2.4, hive: 2.2, mender: 1.8, sapper: 1.8, carrier: 1.5, gunner: 0.6 },
    },
    void: {
      tag: "Portals",
      mix: { striker: 2.2, phantom: 2.4, weaver: 2.2, leaper: 1.8, drone: 1.8, sniper: 0.6 },
    },
  };
  for (const [id, info] of Object.entries(RL_BIOME_INFO))
    du[id] && ((du[id].tag = info.tag), info.grip && (du[id].grip = info.grip));
  function rlBiomeTitle(b) {
    return b.tag ? `${b.name} \xB7 ${b.tag}` : b.name;
  }
  Aa.prototype.biomeFor = function (wave) {
    const cycle = Math.floor((Math.max(1, wave) - 1) / 5);
    return du[this.route[cycle % this.route.length]] || ii[0];
  };
  // Enemy mix: startWave builds the wave plan with _u; the biome's weights multiply the spawn
  // weights of the plan (events keep theirs on top).
  var RL_BIOME_MIX_CUR = null;
  const _rlPlan240 = _u;
  _u = function (rng, wave, tm, boss, plan = {}) {
    const mix = RL_BIOME_MIX_CUR;
    if (!mix) return _rlPlan240(rng, wave, tm, boss, plan);
    const weights = { ...(plan.weights || {}) };
    for (const [id, m] of Object.entries(mix)) weights[id] = (weights[id] || 1) * m;
    return _rlPlan240(rng, wave, tm, boss, { ...plan, weights });
  };
  const _rlStartWave240 = Aa.prototype.startWave;
  Aa.prototype.startWave = function (wave, nova) {
    RL_BIOME_MIX_CUR = RL_BIOME_INFO[this.biomeFor(wave).id]?.mix || null;
    try {
      return _rlStartWave240.call(this, wave, nova);
    } finally {
      RL_BIOME_MIX_CUR = null;
    }
  };

  const _rlSelfTest240 = rlSelfTest;
  rlSelfTest = function () {
    const r = _rlSelfTest240(),
      fail = [];
    if (En.length !== 7 || Object.keys(ue).length !== 7) fail.push("weapon-count:" + En.length);
    if (ii.length !== 5) fail.push("biome-count:" + ii.length);
    for (const u of Zi) if (u.weapon && !ue[u.weapon]) fail.push("evo-weapon:" + u.id);
    // route: Neon Yard first, then one biome per boss cycle, all five by wave 21
    for (const seed of [11, 222, 3333, 44444]) {
      const w = new Aa({ seed, weapon: "pulse", threat: 0, ws: {} }),
        seen = new Set();
      for (let wave = 1; wave <= 30; wave++) {
        const b = w.biomeFor(wave).id;
        wave <= 21 && seen.add(b);
        wave <= 5 && b !== "yard" && fail.push(`route-start:${seed}:${wave}`);
        if (wave > 1 && (b === w.biomeFor(wave - 1).id) !== ((wave - 1) % 5 !== 0))
          fail.push(`route-cycle:${seed}:${wave}`);
      }
      seen.size !== 5 && fail.push(`route-coverage:${seed}:${seen.size}`);
    }
    // every hazard biome has its hazard in a normal wave, and only that one
    const want = { works: "vents", vault: "ice", marsh: "acid", void: "portals" };
    for (const [id, kind] of Object.entries(want)) {
      const w = new Aa({ seed: 0x240 + id.length, weapon: "pulse", threat: 0, ws: {} }),
        wave = 2 + 5 * w.route.indexOf(id);
      w.startWave(wave);
      if (w.arena.biome.id !== id) fail.push("hazard-biome:" + id);
      if (!w.arena[kind].length) fail.push("hazard-missing:" + id);
      for (const k of ["vents", "ice", "acid", "portals"])
        k !== kind && w.arena[k].length && fail.push(`hazard-foreign:${id}:${k}`);
    }
    // Cryo Vault: the drone drifts (lower grip than anywhere else)
    const drift = (id) => {
      const w = new Aa({ seed: 0x2401, weapon: "pulse", threat: 0, ws: {} });
      w.startWave(1 + 5 * w.route.indexOf(id));
      w.arena.ice.length = 0;
      w.enemies.length = 0;
      w.plan = [];
      w.step(1 / 60, { mx: 1, my: 0 });
      return w.player.vx;
    };
    if (!(drift("vault") < drift("yard") * 0.6)) fail.push("vault-grip");
    // enemy mix: each biome spawns more of its own enemies than Neon Yard does
    for (const [id, info] of Object.entries(RL_BIOME_INFO)) {
      if (!info.mix) continue;
      const own = Object.keys(info.mix).filter((k) => info.mix[k] > 1),
        count = (mix) => {
          let n = 0;
          RL_BIOME_MIX_CUR = mix;
          try {
            for (let s = 1; s <= 12; s++)
              for (const g of _u(qi(Yi("mix:" + s)), 30, Ma(0), !1, {}))
                n += g.members.filter((m) => own.includes(m.type)).length;
          } finally {
            RL_BIOME_MIX_CUR = null;
          }
          return n;
        };
      if (!(count(info.mix) > count(null) * 1.3)) fail.push("enemy-mix:" + id);
    }
    // old saves: retired weapons become their original + refund, run and selection follow
    const note = RL_RETIRE_NOTE,
      m = rlMigrateRetired({
        shards: 100,
        weapon: "ion",
        weapons: { pulse: true, ion: true, voidlance: true, rail: true },
        run: { weapon: "cyclone", wave: 4 },
      });
    RL_RETIRE_NOTE = note;
    if (
      m.weapon !== "tesla" ||
      m.run.weapon !== "disc" ||
      !m.weapons.tesla ||
      m.weapons.ion ||
      m.weapons.voidlance ||
      m.shards !== 100 + (1250 - ue.tesla.cost) + 1950
    )
      fail.push("migrate:" + JSON.stringify(m));
    if (rlMigrateRetired(m) !== m) fail.push("migrate-twice");
    return { ...r, ok: r.ok && fail.length === 0, v240: { ok: fail.length === 0, fail } };
  };

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
  function If(i, t = !1) {
    let e = i[0].index !== null,
      n = new Set(Object.keys(i[0].attributes)),
      s = new Set(Object.keys(i[0].morphAttributes)),
      r = {},
      a = {},
      o = i[0].morphTargetsRelative,
      c = new Ge(),
      h = 0;
    for (let l = 0; l < i.length; ++l) {
      let u = i[l],
        d = 0;
      if (e !== (u.index !== null))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              l +
              ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.",
          ),
          null
        );
      for (let f in u.attributes) {
        if (!n.has(f))
          return (
            console.error(
              "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
                l +
                '. All geometries must have compatible attributes; make sure "' +
                f +
                '" attribute exists among all geometries, or in none of them.',
            ),
            null
          );
        (r[f] === void 0 && (r[f] = []), r[f].push(u.attributes[f]), d++);
      }
      if (d !== n.size)
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              l +
              ". Make sure all geometries have the same number of attributes.",
          ),
          null
        );
      if (o !== u.morphTargetsRelative)
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              l +
              ". .morphTargetsRelative must be consistent throughout all geometries.",
          ),
          null
        );
      for (let f in u.morphAttributes) {
        if (!s.has(f))
          return (
            console.error(
              "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
                l +
                ".  .morphAttributes must be consistent throughout all geometries.",
            ),
            null
          );
        (a[f] === void 0 && (a[f] = []), a[f].push(u.morphAttributes[f]));
      }
      if (t) {
        let f;
        if (e) f = u.index.count;
        else if (u.attributes.position !== void 0) f = u.attributes.position.count;
        else
          return (
            console.error(
              "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
                l +
                ". The geometry must have either an index or a position attribute",
            ),
            null
          );
        (c.addGroup(h, f, l), (h += f));
      }
    }
    if (e) {
      let l = 0,
        u = [];
      for (let d = 0; d < i.length; ++d) {
        let f = i[d].index;
        for (let p = 0; p < f.count; ++p) u.push(f.getX(p) + l);
        l += i[d].attributes.position.count;
      }
      c.setIndex(u);
    }
    for (let l in r) {
      let u = Pf(r[l]);
      if (!u)
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + l + " attribute.",
          ),
          null
        );
      c.setAttribute(l, u);
    }
    for (let l in a) {
      let u = a[l][0].length;
      if (u !== 0) {
        ((c.morphAttributes = c.morphAttributes || {}), (c.morphAttributes[l] = []));
        for (let d = 0; d < u; ++d) {
          let f = [];
          for (let x = 0; x < a[l].length; ++x) f.push(a[l][x][d]);
          let p = Pf(f);
          if (!p)
            return (
              console.error(
                "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " +
                  l +
                  " morphAttribute.",
              ),
              null
            );
          c.morphAttributes[l].push(p);
        }
      }
    }
    return c;
  }
  function Pf(i) {
    let t,
      e,
      n,
      s = -1,
      r = 0;
    for (let h = 0; h < i.length; ++h) {
      let l = i[h];
      if ((t === void 0 && (t = l.array.constructor), t !== l.array.constructor))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.",
          ),
          null
        );
      if ((e === void 0 && (e = l.itemSize), e !== l.itemSize))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.",
          ),
          null
        );
      if ((n === void 0 && (n = l.normalized), n !== l.normalized))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.",
          ),
          null
        );
      if ((s === -1 && (s = l.gpuType), s !== l.gpuType))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.",
          ),
          null
        );
      r += l.count * e;
    }
    let a = new t(r),
      o = new Ke(a, e, n),
      c = 0;
    for (let h = 0; h < i.length; ++h) {
      let l = i[h];
      if (l.isInterleavedBufferAttribute) {
        let u = c / e;
        for (let d = 0, f = l.count; d < f; d++)
          for (let p = 0; p < e; p++) {
            let x = l.getComponent(d, p);
            o.setComponent(d + u, p, x);
          }
      } else a.set(l.array, c);
      c += l.count * e;
    }
    return (s !== void 0 && (o.gpuType = s), o);
  }
  var Lf = new de(),
    Df = new mn(),
    Nf = new Mn(),
    qv = new I(),
    Yv = new I();
  function At(
    i,
    t,
    { x: e = 0, y: n = 0, z: s = 0, rx: r = 0, ry: a = 0, rz: o = 0, sx: c = 1, sy: h = 1, sz: l = 1 } = {},
  ) {
    let u = i.index ? i.toNonIndexed() : i;
    (Nf.set(r, a, o),
      Df.setFromEuler(Nf),
      Lf.compose(Yv.set(e, n, s), Df, qv.set(c, h, l)),
      u.applyMatrix4(Lf),
      u.deleteAttribute("uv"));
    let d = new Ot(t),
      f = u.attributes.position.count,
      p = new Float32Array(f * 3);
    for (let x = 0; x < f; x++) ((p[x * 3] = d.r), (p[x * 3 + 1] = d.g), (p[x * 3 + 2] = d.b));
    return (u.setAttribute("color", new Ke(p, 3)), u);
  }
  function _e(i) {
    let t = If(i, !1);
    return (t.computeBoundingSphere(), t);
  }
  var Uh = (i, t = 0.5) => new Ot(i).multiplyScalar(t).getHex();
  function Fh(i, t) {
    let e = Uh(t, 0.55),
      n = Uh(t, 0.3),
      s = 3818070;
    switch (i) {
      case "swarmer":
        return {
          body: _e([
            At(new Ir(0.4, 1, 4), e, { x: 0.05, y: 0.45, rz: -Math.PI / 2, rx: Math.PI / 4 }),
            At(new Ct(0.45, 0.06, 0.95), n, { x: -0.2, y: 0.45 }),
          ]),
          glow: _e([
            At(new De(0.13, 8, 6), 16777215, { x: -0.38, y: 0.45 }),
            At(new Ct(0.1, 0.07, 0.95), 16777215, { x: -0.44, y: 0.45 }),
          ]),
        };
      case "mite":
        return {
          body: _e([At(new Vr(0.34), e, { y: 0.32, ry: 0.4 })]),
          glow: _e([At(new De(0.1, 6, 4), 16777215, { x: 0.15, y: 0.42 })]),
        };
      case "grunt":
        return {
          body: _e([
            At(new Ct(0.9, 0.75, 0.9), e, { y: 0.5 }),
            At(new Ct(0.5, 0.5, 1.25), n, { x: -0.1, y: 0.55 }),
            At(new Ct(0.7, 0.2, 0.7), s, { y: 0.98 }),
          ]),
          glow: _e([At(new Ct(0.1, 0.14, 0.62), 16777215, { x: 0.46, y: 0.62 })]),
        };
      case "gunner":
        return {
          body: _e([
            At(new ye(0.42, 0.52, 0.75, 8), e, { y: 0.42 }),
            At(new Ct(0.8, 0.15, 0.15), s, { x: 0.52, y: 0.62 }),
            At(new De(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), n, { y: 0.8 }),
          ]),
          glow: _e([
            At(new Ve(0.47, 0.05, 5, 18), 16777215, { y: 0.78, rx: Math.PI / 2 }),
            At(new Ct(0.1, 0.18, 0.18), 16777215, { x: 0.95, y: 0.62 }),
          ]),
        };
      case "bomber":
        return {
          body: _e([At(new De(0.5, 12, 8), e, { y: 0.52 }), At(new ye(0.1, 0.12, 0.25, 6), s, { y: 1.05 })]),
          glow: _e([
            At(new Ve(0.5, 0.06, 5, 20), 16777215, { y: 0.52, rx: Math.PI / 2 }),
            At(new De(0.12, 8, 6), 16777215, { y: 1.22 }),
          ]),
        };
      case "splitter":
        return {
          body: _e([At(new Lr(0.78), e, { y: 0.8 })]),
          glow: _e([
            At(new Ve(0.8, 0.06, 5, 24), 16777215, { y: 0.8, rx: Math.PI / 2 }),
            At(new Qe(0.2), 16777215, { y: 1.62 }),
          ]),
        };
      case "brute":
        return {
          body: _e([
            At(new Ct(1.5, 1.1, 1.6), e, { y: 0.66 }),
            At(new Ct(0.9, 0.7, 2.2), n, { x: -0.15, y: 1 }),
            At(new Ct(0.5, 0.35, 0.9), s, { x: 0.65, y: 0.35 }),
          ]),
          glow: _e([
            At(new Ct(0.1, 0.16, 0.24), 16777215, { x: 0.76, y: 0.95, z: 0.35 }),
            At(new Ct(0.1, 0.16, 0.24), 16777215, { x: 0.76, y: 0.95, z: -0.35 }),
            At(new Ct(0.14, 0.1, 1.6), 16777215, { x: -0.76, y: 0.8 }),
          ]),
        };
      case "sniper":
        return {
          body: _e([At(new Qe(0.5), e, { y: 0.95, sy: 1.7 }), At(new Ct(1.4, 0.09, 0.09), s, { x: 0.7, y: 0.95 })]),
          glow: _e([At(new De(0.12, 8, 6), 16777215, { x: 1.42, y: 0.95 }), At(new Qe(0.16), 16777215, { y: 1.95 })]),
        };
      case "hive": {
        let r = [];
        for (let a = 0; a < 6; a++) {
          let o = (a / 6) * Math.PI * 2;
          r.push(
            At(new De(0.2, 8, 6), 16777215, { x: Math.cos(o) * 1.02, y: 1.05 + (a % 2) * 0.35, z: Math.sin(o) * 1.02 }),
          );
        }
        return (
          r.push(At(new Qe(0.28), 16777215, { y: 2.2 })),
          { body: _e([At(new ks(1.05, 0), e, { y: 1.15 }), At(new ye(0.7, 1, 0.35, 8), n, { y: 0.18 })]), glow: _e(r) }
        );
      }
      case "bulwark":
        return {
          body: _e([
            At(new Ct(1.1, 1, 1.2), e, { x: -0.15, y: 0.6 }),
            At(new Ct(0.6, 0.35, 0.9), s, { x: -0.2, y: 1.25 }),
            At(new ye(0.22, 0.26, 0.5, 6), n, { x: -0.1, y: 0.2, z: 0.45 }),
            At(new ye(0.22, 0.26, 0.5, 6), n, { x: -0.1, y: 0.2, z: -0.45 }),
          ]),
          glow: _e([
            At(new Ct(0.08, 0.12, 0.5), 16777215, { x: 0.43, y: 0.95 }),
            At(new Ct(0.5, 0.06, 0.06), 16777215, { x: -0.2, y: 1.45 }),
          ]),
        };
      case "striker":
        return {
          body: _e([
            At(new Qe(0.42), e, { y: 0.7, sx: 1.5, sy: 0.9, sz: 0.8 }),
            At(new Ct(0.9, 0.05, 0.14), s, { x: 0.35, y: 0.62, z: 0.34, ry: -0.35 }),
            At(new Ct(0.9, 0.05, 0.14), s, { x: 0.35, y: 0.62, z: -0.34, ry: 0.35 }),
          ]),
          glow: _e([
            At(new De(0.12, 8, 6), 16777215, { x: 0.45, y: 0.78 }),
            At(new Ct(0.5, 0.03, 0.05), 16777215, { x: 0.78, y: 0.64, z: 0.5, ry: -0.35 }),
            At(new Ct(0.5, 0.03, 0.05), 16777215, { x: 0.78, y: 0.64, z: -0.5, ry: 0.35 }),
          ]),
        };
      case "mender":
        return {
          body: _e([At(new ye(0.35, 0.55, 0.7, 6), e, { y: 0.4 }), At(new Qe(0.32), n, { y: 1.05 })]),
          glow: _e([
            At(new Ct(0.5, 0.12, 0.12), 16777215, { y: 1.05 }),
            At(new Ct(0.12, 0.12, 0.5), 16777215, { y: 1.05 }),
            At(new Ve(0.55, 0.04, 5, 18), 16777215, { y: 0.1, rx: Math.PI / 2 }),
          ]),
        };
      case "mortar":
        return {
          body: _e([
            At(new ye(0.75, 0.85, 0.5, 8), n, { y: 0.25 }),
            At(new De(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), e, { y: 0.5 }),
            At(new ye(0.2, 0.26, 0.95, 10), s, { x: 0.25, y: 1.05, rz: -0.55 }),
          ]),
          glow: _e([
            At(new Ve(0.2, 0.05, 5, 14), 16777215, { x: 0.52, y: 1.45, rz: -0.55, ry: Math.PI / 2 }),
            At(new Ve(0.78, 0.04, 5, 24), 16777215, { y: 0.52, rx: Math.PI / 2 }),
          ]),
        };
    }
    const rlM = rlEnemyMesh(i, e, n, s);
    return rlM || Fh("grunt", t);
  }
  function Uf() {
    let i = new ye(1.35, 1.35, 1.5, 20, 1, !0, -Math.PI / 2.9, (Math.PI * 2) / 2.9);
    return (i.rotateY(Math.PI / 2), i.translate(0, 0.8, 0), i);
  }
  function Ff() {
    return _e([
      At(new ye(1, 1, 0.12, 20), 16777215),
      At(new ye(0.45, 0.45, 0.2, 12), 10474239),
      At(new Ct(2.1, 0.14, 0.18), 13625599),
    ]);
  }
  function Bf() {
    return new Ct(1, 1, 1);
  }
  function kf(i, t) {
    let e = new rn(),
      n = new $e({ color: 2898514, emissive: 0 }),
      s = new $e({ color: 9348036, emissive: 0 }),
      r = new Ie({ color: t, toneMapped: !1 }),
      a = new rn(),
      o = new Gt(new ye(0.5, 0.62, 0.34, 6), n);
    o.position.y = 0.52;
    let c = new Gt(new ye(0.64, 0.5, 0.14, 6), s);
    c.position.y = 0.3;
    let h = new Gt(new Ve(0.6, 0.045, 5, 24), r);
    ((h.rotation.x = Math.PI / 2), (h.position.y = 0.52));
    let l = new Gt(new Ct(0.16, 0.12, 0.5), r);
    (l.position.set(-0.55, 0.42, 0), a.add(o, c, h, l), e.add(a));
    let u = new rn();
    u.position.y = 0.78;
    let d = new Gt(new De(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), s);
    u.add(d);
    let f = new Gt(new Ct(0.08, 0.08, 0.3), r);
    (f.position.set(0.24, 0.12, 0), u.add(f));
    let p = (m, g, M = 0, b = 0.02) => {
      let v = new Gt(new Ct(m, g, g), n);
      v.position.set(m / 2 + 0.12, b, M);
      let S = new Gt(new Ct(0.08, g * 1.2, g * 1.2), r);
      (S.position.set(m + 0.14, b, M), u.add(v, S));
    };
    if (i === "scatter") (p(0.5, 0.13, 0.1), p(0.5, 0.13, -0.1));
    else if (i === "rail") {
      p(0.95, 0.1);
      let m = new Gt(new Ct(0.8, 0.04, 0.26), s);
      (m.position.set(0.55, 0.02, 0), u.add(m));
    } else if (i === "rocket") {
      let m = new Gt(new Ct(0.46, 0.26, 0.36), n);
      (m.position.set(0.3, 0.05, 0), u.add(m));
      for (let g of [-0.09, 0.09])
        for (let M of [-0.03, 0.12]) {
          let b = new Gt(new Ct(0.05, 0.08, 0.08), r);
          (b.position.set(0.55, M, g), u.add(b));
        }
    } else if (i === "tesla") {
      p(0.55, 0.12);
      let m = new Gt(new Ve(0.12, 0.03, 5, 14), r);
      ((m.rotation.y = Math.PI / 2), m.position.set(0.45, 0.02, 0));
      let g = m.clone();
      ((g.position.x = 0.3), u.add(m, g));
    } else if (i === "disc") {
      let m = new Gt(new Ct(0.62, 0.08, 0.34), n);
      m.position.set(0.35, 0, 0);
      let g = new Gt(new ye(0.2, 0.2, 0.05, 16), r);
      (g.position.set(0.42, 0.08, 0), u.add(m, g));
    } else if (i === "flame") {
      let m = new Gt(new ye(0.12, 0.12, 0.5, 10), s);
      ((m.rotation.x = Math.PI / 2), m.position.set(-0.05, 0.1, 0));
      let g = new Gt(new ye(0.07, 0.12, 0.55, 10), n);
      ((g.rotation.z = -Math.PI / 2), g.position.set(0.42, 0.02, 0));
      let M = new Gt(new De(0.06, 8, 6), r);
      (M.position.set(0.72, 0.02, 0), u.add(m, g, M));
    } else p(0.62, 0.13);
    e.add(u);
    let x = new Gt(
      new ks(1, 2),
      new Ie({ color: t, transparent: !0, opacity: 0.16, blending: rs, depthWrite: !1, toneMapped: !1 }),
    );
    return ((x.position.y = 0.6), e.add(x), { group: e, base: a, turret: u, shield: x, mats: [n, s], glowMat: r });
  }
  function Of(i, t) {
    let e = new rn(),
      n = new $e({ color: Uh(t, 0.35), emissive: 0, flatShading: !0 }),
      s = new $e({ color: 2435898, emissive: 0, flatShading: !0 }),
      r = new Ie({ color: t, toneMapped: !1, transparent: !0 }),
      a = [],
      o = (c, h, l, u, d, f = e) => {
        let p = new Gt(c, h);
        return (p.position.set(l, u, d), f.add(p), p);
      };
    if (i === "warden") {
      (o(new ye(1.8, 2.05, 1.5, 6), n, 0, 0.9, 0),
        o(new Ct(1.8, 0.9, 1.6), s, -0.2, 2, 0),
        o(new Ct(0.9, 1.1, 0.9), s, 0, 1.2, 1.9),
        o(new Ct(0.9, 1.1, 0.9), s, 0, 1.2, -1.9),
        o(new Ct(0.12, 0.28, 1.3), r, 0.72, 2.05, 0),
        o(new Ct(0.2, 0.2, 0.2), r, 0.46, 1.25, 1.9),
        o(new Ct(0.2, 0.2, 0.2), r, 0.46, 1.25, -1.9));
      let c = o(new Ve(1.95, 0.07, 5, 36), r, 0, 0.35, 0);
      c.rotation.x = Math.PI / 2;
    } else if (i === "queen") {
      (o(new De(1.35, 16, 10), n, 0.3, 1.9, 0).scale.set(1.1, 0.8, 1),
        o(new De(1.1, 14, 9), s, -1.3, 1.6, 0).scale.set(1.3, 0.85, 0.9),
        o(new De(0.2, 8, 6), r, 1.5, 2.1, 0.45),
        o(new De(0.2, 8, 6), r, 1.5, 2.1, -0.45),
        o(new De(0.34, 10, 8), r, -2.4, 1.6, 0));
      let l = o(new Ve(2.1, 0.09, 5, 40), r, 0, 2.2, 0);
      ((l.rotation.x = Math.PI / 2 - 0.25), a.push({ m: l, ax: "z", v: 0.8 }));
      for (let u = 0; u < 6; u++) {
        let d = (u / 6) * Math.PI * 2;
        o(new Ct(0.18, 1.3, 0.18), s, Math.cos(d) * 1.2, 0.6, Math.sin(d) * 1.2).rotation.set(
          Math.sin(d) * 0.5,
          0,
          -Math.cos(d) * 0.5,
        );
      }
    } else if (i === "prism") {
      let c = new $e({ color: 8370392, emissive: 666170, flatShading: !0, transparent: !0, opacity: 1 }),
        h = o(new Qe(1.35, 0), c, 0, 2.3, 0);
      (h.scale.set(1, 1.5, 1), a.push({ m: h, ax: "y", v: 0.7 }), o(new Qe(0.55, 0), r, 0, 2.3, 0));
      let l = new rn();
      l.position.y = 2.3;
      for (let u = 0; u < 3; u++) {
        let d = (u / 3) * Math.PI * 2,
          f = o(new Qe(0.32, 0), r, Math.cos(d) * 2.1, 0, Math.sin(d) * 2.1, l);
        f.scale.y = 1.6;
      }
      (e.add(l), a.push({ m: l, ax: "y", v: -1.6 }), (n.transparent = !0), (e.userData.fadeMats = [c, r]));
    } else {
      o(new De(1.15, 18, 12), r, 0, 2.4, 0);
      for (let l = 0; l < 3; l++) {
        let u = o(new Ve(1.75 + l * 0.35, 0.16, 6, 36), l === 1 ? s : n, 0, 2.4, 0);
        (u.rotation.set(l * 1.1, l * 0.6, 0),
          a.push({ m: u, ax: l === 0 ? "x" : l === 1 ? "y" : "z", v: 0.6 + l * 0.35 }));
      }
      let c = o(new ye(1.2, 1.8, 0.5, 8), s, 0, 0.25, 0);
      c.rotation.y = 0.3;
      let h = o(new Ve(2.4, 0.08, 5, 44), r, 0, 0.1, 0);
      h.rotation.x = Math.PI / 2;
    }
    return { group: e, mats: [n, s], glowMat: r, spin: a };
  }
  function zf() {
    return _e([
      At(new Qe(0.28), 9348036, { y: 0.9, sy: 0.6 }),
      At(new Ct(0.5, 0.06, 0.12), 2898514, { x: 0.2, y: 0.9 }),
    ]);
  }
  function Hf() {
    let i = new Fs();
    (i.moveTo(0.42, 0), i.lineTo(-0.1, 0.16), i.lineTo(-0.22, 0), i.lineTo(-0.1, -0.16), i.closePath());
    let t = new Hr(i, { depth: 0.06, bevelEnabled: !1 });
    return (t.rotateX(Math.PI / 2), t.translate(0, 0.62, 0), t);
  }
  function Gf() {
    let i = new Qe(0.2, 0);
    return (i.scale(1, 1.5, 1), i);
  }
  function Vf() {
    return _e([At(new Ct(0.5, 0.16, 0.16), 16777215), At(new Ct(0.16, 0.5, 0.16), 16777215)]);
  }
  var $v = `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`,
    Zv = `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uBase; uniform vec3 uGrid; uniform vec3 uAccent;
  uniform vec2 uHalf; uniform vec2 uPlayer; uniform float uTime; uniform float uPulse; uniform float uDeco;
  uniform vec4 uL[6]; uniform vec3 uLC[6];
  varying vec2 vW;
  float gridLine(vec2 p, float w) {
    vec2 g = abs(fract(p - 0.5) - 0.5) / (fwidth(p) * w);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main() {
    vec2 p = vW;
    float minor = gridLine(p, 1.2);
    float major = gridLine(p / 4.0, 1.6);
    vec2 d = uHalf - abs(p);
    float edge = min(d.x, d.y);
    float inside = step(0.0, edge);
    float edgeGlow = exp(-max(edge, 0.0) * 1.1);
    vec2 dp = p - uPlayer;
    float pl = exp(-dot(dp, dp) * 0.018);
    // slow scanning wave across the floor
    float scan = smoothstep(0.0, 1.0, 1.0 - abs(fract(length(p) * 0.05 - uTime * 0.08) - 0.5) * 2.0);
    vec3 col = uBase * (0.75 + 0.7 * pl);
    col += uGrid * (minor * 0.07 + major * (0.22 + 0.12 * scan)) * (0.6 + 0.6 * pl) * inside;
    col += uAccent * edgeGlow * 0.28 * inside;
    col += uGrid * uPulse * 0.12 * inside;
    // floor markings that change with the layout: 1 rings, 2 hazard stripes along the edge, 3 cross lanes, 4 hex dots
    if (uDeco > 0.5) {
      float m = 0.0;
      if (uDeco < 1.5) { float rr = length(p); m = smoothstep(0.455, 0.49, abs(fract(rr / 5.5) - 0.5)) * step(4.0, rr); }
      else if (uDeco < 2.5) { float band = step(edge, 2.2) * step(0.5, edge); m = band * step(0.5, fract((p.x + p.y) * 0.35)); }
      else if (uDeco < 3.5) { vec2 a = abs(p); m = (smoothstep(1.7, 1.5, a.x) + smoothstep(1.7, 1.5, a.y)) * 0.45 * step(4.5, length(p)); }
      else { vec2 g = vec2(p.x * 0.5774 + p.y, p.x * 1.1547) / 3.0; vec2 f = fract(g) - 0.5; m = smoothstep(0.1, 0.06, length(f)) * 0.8; }
      col += uGrid * m * 0.05 * inside; // subtle: markings, not paint
    }
    // transient light pools: muzzle flashes and explosions light up the grid
    for (int i = 0; i < 6; i++) {
      if (uL[i].w <= 0.0) continue;
      vec2 d2 = p - uL[i].xy;
      float fall = exp(-dot(d2, d2) / max(0.01, uL[i].z * uL[i].z));
      col += uLC[i] * uL[i].w * fall * (0.35 + minor * 0.5 + major * 0.9);
    }
    col *= mix(0.3, 1.0, inside);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }`,
    Ul = class {
      constructor(t) {
        ((this.scene = t),
          (this.group = new rn()),
          t.add(this.group),
          (this.uniforms = El.merge([
            yt.fog,
            {
              uBase: { value: new Ot() },
              uGrid: { value: new Ot() },
              uAccent: { value: new Ot() },
              uHalf: { value: new ht(18, 18) },
              uPlayer: { value: new ht() },
              uTime: { value: 0 },
              uPulse: { value: 0 },
              uDeco: { value: 0 },
              uL: { value: Array.from({ length: 6 }, () => new Re()) },
              uLC: { value: Array.from({ length: 6 }, () => new Ot()) },
            },
          ])),
          (this.floorMat = new un({ uniforms: this.uniforms, vertexShader: $v, fragmentShader: Zv, fog: !0 })),
          (this.biomeId = null));
      }
      build(t, e, n = !1) {
        if (((e = e || { key: t.id + ":classic", W: t.W, H: t.H, obs: t.obstacles, deco: 0 }), this.layKey === e.key))
          return;
        let s = this.layKey == null;
        ((this.layKey = e.key),
          (this.biomeId = t.id),
          this.group.traverse((b) => {
            (b.geometry && b.geometry.dispose(), b.material && b.material !== this.floorMat && b.material.dispose());
          }),
          this.group.clear());
        let r = this.uniforms;
        (r.uBase.value.setHex(t.floor),
          r.uGrid.value.setHex(t.grid),
          r.uAccent.value.setHex(t.accent),
          r.uHalf.value.set(e.W, e.H),
          (r.uDeco.value = e.deco || 0));
        let a = new Gt(new jn(100, 100), this.floorMat);
        ((a.rotation.x = -Math.PI / 2), this.group.add(a));
        let o = new $e({ color: t.wall }),
          c = new Ie({ color: t.grid, toneMapped: !1 }),
          h = new Ie({ color: t.accent, toneMapped: !1 }),
          l = e.W,
          u = e.H,
          d = 0.5,
          f = 0.7,
          p = [
            [0, -u - d / 2, l * 2 + d * 2, d],
            [0, u + d / 2, l * 2 + d * 2, d],
            [-l - d / 2, 0, d, u * 2],
            [l + d / 2, 0, d, u * 2],
          ];
        for (let [b, v, S, T] of p) {
          let R = new Gt(new Ct(S, f, T), o);
          (R.position.set(b, f / 2, v), this.group.add(R));
          let _ = new Gt(new Ct(S === d ? 0.08 : S, 0.06, T === d ? 0.08 : T), c);
          (_.position.set(
            b + (S === d ? (b < 0 ? d / 2 - 0.04 : -d / 2 + 0.04) : 0),
            f + 0.03,
            v + (T === d ? (v < 0 ? d / 2 - 0.04 : -d / 2 + 0.04) : 0),
          ),
            this.group.add(_));
        }
        for (let b of [-1, 1])
          for (let v of [-1, 1]) {
            let S = new Gt(new Ct(0.9, 1.4, 0.9), o);
            S.position.set(b * (l + 0.25), 0.7, v * (u + 0.25));
            let T = new Gt(new Ct(0.95, 0.08, 0.95), h);
            (T.position.set(b * (l + 0.25), 1.42, v * (u + 0.25)), this.group.add(S, T));
          }
        let x = new rn();
        (this.group.add(x), (this.obsGroup = x));
        let m = new $e({ color: new Ot(t.wall).multiplyScalar(1.4) }),
          g = new $e({
            color: new Ot(t.grid).multiplyScalar(0.55),
            emissive: new Ot(t.grid).multiplyScalar(0.12),
            flatShading: !0,
          }),
          M = t.id;
        for (let b of e.obs)
          if (b.t === "c") {
            if (M === "vault") {
              let E = new Gt(new ye(b.r * 0.35, b.r * 1.05, 1.8, 6), g);
              (E.position.set(b.x, 0.9, b.y), (E.rotation.y = (b.x * 7 + b.y * 3) % 6));
              let C = new Gt(new Qe(b.r * 0.4), c);
              C.position.set(b.x, 1.95, b.y);
              let L = new Gt(new Ve(b.r * 1.1, 0.04, 4, 24), h);
              ((L.rotation.x = Math.PI / 2), L.position.set(b.x, 0.05, b.y), x.add(E, C, L));
              continue;
            }
            let v = M === "works" ? 1.5 : 1.8,
              S = new Gt(new ye(b.r, b.r * 1.08, v, 20), m);
            S.position.set(b.x, v / 2, b.y);
            let T = new Gt(new ye(b.r * 1.02, b.r * 1.02, 0.08, 20, 1, !0), c);
            T.position.set(b.x, v * 0.75, b.y);
            let R = new Gt(new Ve(b.r * 1.1, 0.04, 4, 32), h);
            ((R.rotation.x = Math.PI / 2), R.position.set(b.x, 0.05, b.y));
            let _ = new Gt(new ye(b.r * 0.6, b.r * 0.6, 0.06, 16), c);
            if ((_.position.set(b.x, v + 0.03, b.y), x.add(S, T, R, _), M === "works")) {
              let E = T.clone();
              ((E.position.y = v * 0.35), x.add(E));
            }
          } else {
            let v = M === "void" ? 1.75 : M === "vault" ? 1 : M === "yard" && b.w < 1.3 && b.h < 1.3 ? 1.1 : 1.3,
              S = new Gt(new Ct(b.w * 2, v, b.h * 2), M === "vault" ? g : m);
            (S.position.set(b.x, v / 2, b.y), x.add(S));
            let T = new Gt(new Ct(b.w * 2 + 0.04, 0.07, 0.07), c);
            for (let E of [-b.h, b.h]) {
              let C = T.clone();
              (C.position.set(b.x, v, b.y + E), x.add(C));
            }
            let R = new Gt(new Ct(0.07, 0.07, b.h * 2 + 0.04), c);
            for (let E of [-b.w, b.w]) {
              let C = R.clone();
              (C.position.set(b.x + E, v, b.y), x.add(C));
            }
            if (M === "void") {
              let E = new Gt(new Ct(b.w > b.h ? b.w * 2 + 0.02 : 0.06, v * 0.7, b.w > b.h ? 0.06 : b.h * 2 + 0.02), h);
              (E.position.set(b.x, v * 0.5, b.y), x.add(E));
            }
            let _ = new Gt(new Ct(b.w * 2 + 0.3, 0.05, b.h * 2 + 0.3), h);
            (_.position.set(b.x, 0.03, b.y), x.add(_));
          }
        ((this.rise = n && !s ? 0 : 1), (x.position.y = this.rise < 1 ? -2.6 : 0));
      }
      update(t, e, n, s) {
        if (this.obsGroup && this.rise < 1) {
          this.rise = Math.min(1, this.rise + t / 0.7);
          let r = 1 - Math.pow(1 - this.rise, 3);
          this.obsGroup.position.y = -2.6 * (1 - r);
        }
        ((this.uniforms.uTime.value += t), this.uniforms.uPlayer.value.set(e, n), (this.uniforms.uPulse.value = s));
      }
    };
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
          l
            ? (r.uL.value[h].set(l.x, l.z, l.r, Math.min(1.6, l.i)), r.uLC.value[h].copy(l.col))
            : (r.uL.value[h].w = 0);
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
                  ? this.nums.find(
                      (c) => c.id === a.id && c.life > 0.45 && !c.burn == !a.burn && !c.shield == !a.shield,
                    )
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
                this.burst(
                  a.x,
                  a.y,
                  0.6,
                  a.crit ? 4 : 2,
                  5,
                  a.crit ? lt(16767050) : lt(ue[e.weapon].color),
                  0.18,
                  0.18,
                  { spark: !0, drag: 6 },
                );
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
            this.emit(
              x,
              0.45,
              m,
              -Math.cos(r.face) * 2,
              0.2,
              -Math.sin(r.face) * 2,
              0.25,
              0.35,
              lt(ue[e.weapon].color),
              { drag: 3 },
            );
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
          if (
            (l.type === "striker" && l.st === 2 && this.chargeLine(l.x, l.y, l.ta, 4.2, 1, 1 - l.t2 / 0.32), l.affix)
          ) {
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
        (s.glowMat.color.setHex(n.enraged ? 16732120 : en[n.type].color),
          n.shielded && s.glowMat.color.setHex(16777215));
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
  function $f(i) {
    return ((i = Lt(i, 0, 1)), i * i * (3 - 2 * i));
  }
  function Zf(i) {
    return 1 + 2.70158 * Math.pow(i - 1, 3) + 1.70158 * Math.pow(i - 1, 2);
  }
  var jv = { brute: 1, hive: 1, splitter: 1, sniper: 1, gunner: 1, bulwark: 1, mortar: 1, striker: 1 },
    Qv = {
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
    },
    kl = class {
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
        let e = Qv[t];
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
            !(f.elite || jv[f.type]) ||
            (t.project(f.x, 1.2 + f.r * 1.4, f.y, a), !a.vis)
          )
            continue;
          let p = 18 + f.r * 16,
            x = Lt(f.hp / f.maxHp, 0, 1);
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
          let p = Lt(f.life / 0.35, 0, 1),
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
                ? Kf(en[f.type].color)
                : f.elite
                  ? "#ffc84a"
                  : Kf(Ae[f.type].color);
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
    Jf = {};
  function Kf(i) {
    return Jf[i] || (Jf[i] = "#" + i.toString(16).padStart(6, "0"));
  }
  var Ol = class {
    constructor(t, e) {
      ((this.layer = t),
        (this.r = e),
        (this.move = jf()),
        (this.aim = jf()),
        (this.keys = new Set()),
        (this.mouse = { x: 0, y: 0, down: !1, active: !1, t: 0 }),
        (this.pending = { dash: !1, nova: !1 }),
        (this.swap = !1),
        (this.R = 56),
        (this.enabled = !0),
        (this.onPause = null),
        (this.isPlaying = null),
        (this.usedMove = !1),
        (this.usedAim = !1),
        this.bind());
    }
    bind() {
      let t = this.layer;
      (t.addEventListener("pointerdown", (e) => this.down(e)),
        t.addEventListener("onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove", (e) => this.moveEv(e)),
        t.addEventListener("pointerup", (e) => this.up(e)),
        t.addEventListener("pointercancel", (e) => this.cancel(e)),
        t.addEventListener("lostpointercapture", (e) => this.cancel(e)),
        t.addEventListener("contextmenu", (e) => e.preventDefault()),
        window.addEventListener("keydown", (e) => this.key(e, !0)),
        window.addEventListener("keyup", (e) => this.key(e, !1)),
        window.addEventListener("blur", () => {
          (this.reset(!0), this.onBlur && this.onBlur());
        }),
        window.addEventListener("mousemove", (e) => {
          (Number.isFinite(e.clientX) && (this.mouse.x = e.clientX),
            Number.isFinite(e.clientY) && (this.mouse.y = e.clientY),
            (this.mouse.t = performance.now()));
        }),
        window.addEventListener("mouseup", () => {
          this.mouse.down = !1;
        }));
    }
    zoneIsMove(t) {
      let e = this.layer.getBoundingClientRect(),
        n = e.left + (e.width || this.layer.clientWidth || window.innerWidth) * 0.5,
        s = t < n;
      return this.swap ? !s : s;
    }
    down(t) {
      RL_RT.pointerdown++;
      RL_INPUT.touch = t.pointerType !== "mouse";
      if (!this.enabled) return;
      if ((t.preventDefault(), t.pointerType === "mouse")) {
        (t.button === 0 && ((this.mouse.down = !0), (this.mouse.active = !0)),
          (this.mouse.x = t.clientX),
          (this.mouse.y = t.clientY));
        return;
      }
      let e = this.zoneIsMove(t.clientX),
        n = e ? this.move : this.aim;
      if (n.active && n.id !== t.pointerId) {
        if (performance.now() - (n.lastEv || 0) < 2500) return;
        try {
          this.layer.releasePointerCapture(n.id);
        } catch {}
      }
      // 2.4.0: a double tap on the move side no longer dashes; the DASH button (and Space or
      // Shift on a keyboard) does.
      let s = performance.now();
      ((n.active = !0),
        (n.id = t.pointerId),
        (n.moved = 0),
        (n.lastEv = s),
        (n.ox = n.x = t.clientX),
        (n.oy = n.y = t.clientY),
        (n.t = performance.now()));
      try {
        this.layer.setPointerCapture(t.pointerId);
      } catch {}
    }
    moveEv(t) {
      RL_RT.pointermove++;
      if (t.pointerType === "mouse") {
        (Number.isFinite(t.clientX) && (this.mouse.x = t.clientX),
          Number.isFinite(t.clientY) && (this.mouse.y = t.clientY),
          (this.mouse.active = !0),
          (this.mouse.t = performance.now()),
          (RL_INPUT.touch = !1));
        return;
      }
      let n = t.getCoalescedEvents ? t.getCoalescedEvents() : null,
        s = n && n.length ? n[n.length - 1] : t,
        r = Number.isFinite(s.clientX) ? s.clientX : t.clientX,
        a = Number.isFinite(s.clientY) ? s.clientY : t.clientY;
      if (!Number.isFinite(r) || !Number.isFinite(a)) return;
      for (let e of [this.move, this.aim]) {
        if (!e.active || e.id !== s.pointerId) continue;
        ((e.lastEv = performance.now()),
          (e.x = r),
          (e.y = a),
          (e.moved = Math.max(e.moved || 0, Math.hypot(e.x - e.ox, e.y - e.oy))));
        let o = e.x - e.ox,
          c = e.y - e.oy,
          h = Math.hypot(o, c),
          l = this.R * 1.25;
        h > l && ((e.ox = e.x - (o / h) * l), (e.oy = e.y - (c / h) * l));
      }
    }
    up(t) {
      RL_RT.pointerup++;
      if (t.pointerType === "mouse") {
        this.mouse.down = !1;
        return;
      }
      for (let e of [this.move, this.aim]) !e.active || e.id !== t.pointerId || (e.active = !1);
    }
    cancel(t) {
      RL_RT.pointercancel++;
      if (t.pointerType === "mouse") {
        ((this.mouse.down = !1), (this.mouse.active = !1));
        return;
      }
      for (let e of [this.move, this.aim]) !e.active || e.id !== t.pointerId || (e.active = !1);
    }
    key(t, e) {
      e ? RL_RT.keydown++ : RL_RT.keyup++;
      let n = String(t.key || "").toLowerCase();
      if (!n) return;
      let s = t.target && t.target.tagName;
      // 2.3.6: a released key always counts as released, even when a text field has focus.
      e || this.keys.delete(n);
      if (!(s === "INPUT" || s === "TEXTAREA")) {
        e && (RL_INPUT.touch = !1);
        if (e && (n === "escape" || n === "p")) {
          !t.repeat && this.onPause && this.onPause();
          return;
        }
        (n === " " && this.isPlaying && this.isPlaying() && t.preventDefault(),
          e && !t.repeat && (n === " " || n === "shift") && (this.pending.dash = !0),
          e && !t.repeat && (n === "e" || n === "q" || n === "f") && ((this.pending.nova = !0), t.preventDefault()),
          ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(n) &&
            (e ? this.keys.add(n) : this.keys.delete(n), e && t.preventDefault()));
      }
    }
    press(t) {
      this.enabled && (this.pending[t] = !0);
    }
    // 2.3.6: held keys survive a reset (pause, upgrade pick, resize): keyup events keep arriving,
    // so W A S D stay correct. Before, holding W+D through a reset left only the key that
    // auto-repeats (D) working. reset(true) also forgets the keys, for when keyups can get lost
    // (window blur, page hide).
    reset(all) {
      RL_RT.reset++;
      for (let t of [this.move, this.aim])
        if (t.active && t.id >= 0)
          try {
            this.layer.releasePointerCapture(t.id);
          } catch {}
      ((this.move.active = !1),
        (this.aim.active = !1),
        all && this.keys.clear(),
        (this.mouse.down = !1),
        (this.mouse.active = !1),
        (this.pending.dash = !1),
        (this.pending.nova = !1));
    }
    // 2.3.6: for the camera pan to a new boss. It dropped every input, so a finger held on the
    // move side did nothing after the pan until it was lifted, and held keys stopped. Now only
    // one-shot presses made during the pan (dash, nova) are dropped.
    settle() {
      ((this.pending.dash = !1), (this.pending.nova = !1));
    }
    sample(t, e) {
      let n = (this.R = Lt(Math.min(window.innerWidth, window.innerHeight) * 0.14, 44, 72)),
        s = 0,
        r = 0;
      if (this.move.active) {
        let f = this.move.x - this.move.ox,
          p = this.move.y - this.move.oy,
          x = Math.hypot(f, p),
          m = n * 0.12;
        if (x > m) {
          let g = Lt((x - m) / (n - m), 0, 1);
          ((s = (f / x) * g), (r = (p / x) * g), (this.usedMove = !0));
        }
      }
      let a = this.keys;
      ((a.has("a") || a.has("arrowleft")) && (s -= 1),
        (a.has("d") || a.has("arrowright")) && (s += 1),
        (a.has("w") || a.has("arrowup")) && (r -= 1),
        (a.has("s") || a.has("arrowdown")) && (r += 1));
      let o = 0,
        c = 0,
        h = !1,
        l = !1;
      if (this.aim.active) {
        let f = this.aim.x - this.aim.ox,
          p = this.aim.y - this.aim.oy,
          x = Math.hypot(f, p);
        ((l = !0), x > n * 0.22 && ((o = f / x), (c = p / x), (h = !0), (this.usedAim = !0)));
      }
      let u = performance.now() - this.mouse.t < 2500;
      if (
        !h &&
        t &&
        (this.mouse.down || (u && this.mouse.active && !this.move.active && !this.aim.active && !e.autoFire))
      ) {
        let f = this.r.groundAt(this.mouse.x, this.mouse.y);
        if (f) {
          let p = f.x - t.player.x,
            x = f.y - t.player.y,
            m = Math.hypot(p, x);
          m > 0.3 && ((o = p / m), (c = x / m), (h = !0));
        }
        ((l = this.mouse.down), l || (h = !1));
      }
      let d = {
        mx: s,
        my: r,
        ax: o,
        ay: c,
        aim: h,
        fire: l,
        auto: e.autoFire !== !1,
        assist: e.assist !== !1,
        dash: this.pending.dash,
        nova: this.pending.nova,
      };
      return ((this.pending.dash = !1), (this.pending.nova = !1), d);
    }
  };
  function jf() {
    return { active: !1, id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0 };
  }
  var Qf = {
      yard: [
        [57, "m"],
        [53, "M"],
        [48, "M"],
        [55, "M"],
      ],
      works: [
        [50, "m"],
        [46, "M"],
        [48, "M"],
        [45, "m"],
      ],
      vault: [
        [52, "m"],
        [48, "M"],
        [55, "M"],
        [50, "M"],
      ],
      void: [
        [54, "m"],
        [50, "M"],
        [45, "M"],
        [52, "M"],
      ],
      marsh: [
        [53, "m"],
        [56, "M"],
        [51, "M"],
        [48, "m"],
      ],
    },
    tp = {
      yard: { arp: "square", bass: "sawtooth", lp: 2200, lead: "triangle" },
      works: { arp: "sawtooth", bass: "square", lp: 1600, lead: "sawtooth" },
      vault: { arp: "sine", bass: "triangle", lp: 4200, lead: "sine" },
      void: { arp: "square", bass: "sawtooth", lp: 3e3, lead: "square" },
      marsh: { arp: "triangle", bass: "sawtooth", lp: 1200, lead: "triangle" },
    },
    yn = (i) => 440 * Math.pow(2, (i - 69) / 12),
    ep = [
      [0, 1, 2, 3],
      [0, 2, 1, 3, 2, 1],
      [3, 2, 1, 0],
      [0, 2, 3, 1],
    ],
    np = [
      [0, null, null, 2, null, null, 3, null, 4, null, 3, null, 2, null, null, null],
      [1, null, 2, null, null, null, 3, null, null, 2, null, 1, null, null, 0, null],
      [2, null, null, 3, null, 4, null, null, 5, null, 4, null, 3, null, null, null],
      [3, null, 2, null, 1, null, null, 0, null, null, 1, null, 2, null, 3, null],
    ],
    zl = class {
      constructor() {
        ((this.ctx = null),
          (this.ok = typeof window < "u" && !!(window.AudioContext || window.webkitAudioContext)),
          (this.sfxVol = 0.8),
          (this.musVol = 0.45),
          (this.last = Object.create(null)),
          (this.mode = "off"),
          (this.biome = "yard"),
          (this.step = 0),
          (this.nextT = 0),
          (this.timer = null),
          (this.combo = 0),
          (this.comboT = 0),
          (this.intensity = 0),
          (this.want = 0),
          (this.cycle = 0));
      }
      setIntensity(t) {
        this.want = Math.max(0, Math.min(1, t || 0));
      }
      unlock() {
        if (this.ok)
          try {
            (this.ctx || this.init(), this.ctx.state !== "running" && this.ctx.resume().catch(() => {}));
          } catch (t) {
            this.fail(t);
          }
      }
      init() {
        try {
          navigator.audioSession && (navigator.audioSession.type = "ambient");
        } catch {}
        let t = window.AudioContext || window.webkitAudioContext,
          e = (this.ctx = new t({ latencyHint: "interactive" }));
        ((this.comp = e.createDynamicsCompressor()),
          (this.comp.threshold.value = -14),
          (this.comp.ratio.value = 4),
          (this.comp.attack.value = 0.004),
          (this.comp.release.value = 0.2),
          this.comp.connect(e.destination),
          (this.sfx = e.createGain()),
          (this.sfx.gain.value = this.sfxVol),
          this.sfx.connect(this.comp),
          (this.mus = e.createGain()),
          (this.mus.gain.value = this.musVol * 0.6),
          this.mus.connect(this.comp),
          (this.delay = e.createDelay(1)),
          (this.delay.delayTime.value = 0.28),
          (this.fb = e.createGain()),
          (this.fb.gain.value = 0.32),
          this.delay.connect(this.fb),
          this.fb.connect(this.delay),
          this.delay.connect(this.mus));
        let n = e.sampleRate;
        this.noiseBuf = e.createBuffer(1, n, e.sampleRate);
        let s = this.noiseBuf.getChannelData(0);
        for (let a = 0; a < n; a++) s[a] = Math.random() * 2 - 1;
        let r = e.createBufferSource();
        ((r.buffer = e.createBuffer(1, 1, 22050)), r.connect(e.destination), r.start(0), this.startScheduler());
      }
      fail(t) {
        (this.failed || ze("audio", t), (this.failed = !0));
      }
      setVolumes(t, e) {
        if (((this.sfxVol = t), (this.musVol = e), !this.ctx)) return;
        let n = this.ctx.currentTime;
        (this.sfx.gain.setTargetAtTime(t, n, 0.05), this.mus.gain.setTargetAtTime(e * 0.6, n, 0.1));
      }
      suspend() {
        try {
          this.ctx && this.ctx.state === "running" && this.ctx.suspend();
        } catch {}
      }
      resume() {
        try {
          this.ctx && this.ctx.state !== "running" && this.ctx.resume().catch(() => {});
        } catch {}
      }
      tone(t, e, n, s, r = {}) {
        let a = this.ctx,
          o = a.currentTime + (r.at || 0),
          c = a.createOscillator(),
          h = a.createGain();
        ((c.type = n),
          c.frequency.setValueAtTime(t, o),
          r.to && c.frequency.exponentialRampToValueAtTime(Math.max(20, r.to), o + e),
          r.detune && (c.detune.value = r.detune));
        let l = r.attack || 0.004;
        (h.gain.setValueAtTime(1e-4, o),
          h.gain.exponentialRampToValueAtTime(s, o + l),
          h.gain.exponentialRampToValueAtTime(1e-4, o + e));
        let u = c;
        if (r.lp) {
          let d = a.createBiquadFilter();
          ((d.type = "lowpass"), (d.frequency.value = r.lp), (d.Q.value = r.q || 0.7), u.connect(d), (u = d));
        }
        (u.connect(h), h.connect(r.dest || this.sfx), c.start(o), c.stop(o + e + 0.02));
      }
      noise(t, e, n = {}) {
        let s = this.ctx,
          r = s.currentTime + (n.at || 0),
          a = s.createBufferSource();
        ((a.buffer = this.noiseBuf), (a.playbackRate.value = n.rate || 1));
        let o = s.createBiquadFilter();
        ((o.type = n.type || "lowpass"),
          o.frequency.setValueAtTime(n.f || 2e3, r),
          n.to && o.frequency.exponentialRampToValueAtTime(n.to, r + t),
          (o.Q.value = n.q || 0.8));
        let c = s.createGain();
        (c.gain.setValueAtTime(1e-4, r),
          c.gain.exponentialRampToValueAtTime(e, r + (n.attack || 0.003)),
          c.gain.exponentialRampToValueAtTime(1e-4, r + t),
          a.connect(o),
          o.connect(c),
          c.connect(n.dest || this.sfx),
          a.start(r, Math.random() * 0.5),
          a.stop(r + t + 0.02));
      }
      gate(t, e) {
        let n = this.ctx.currentTime;
        return this.last[t] && n - this.last[t] < e ? !1 : ((this.last[t] = n), !0);
      }
      play(t, e) {
        if (!(!this.ctx || this.ctx.state !== "running" || this.sfxVol <= 0))
          try {
            this._play(t, e);
          } catch (n) {
            this.fail(n);
          }
      }
      _play(t, e) {
        let n = 1 + (Math.random() - 0.5) * 0.08;
        switch (t) {
          case "pulse":
            this.gate(t, 0.05) && this.tone(900 * n, 0.07, "square", 0.035, { to: 380, lp: 3500 });
            break;
          case "scatter":
            this.gate(t, 0.08) &&
              (this.noise(0.16, 0.22, { f: 2600, to: 500 }), this.tone(140, 0.12, "sine", 0.25, { to: 50 }));
            break;
          case "tesla":
            this.gate(t, 0.06) &&
              (this.tone(1500 * n, 0.06, "sawtooth", 0.025, { to: 700, lp: 5e3 }),
              this.noise(0.05, 0.05, { type: "bandpass", f: 5e3 }));
            break;
          case "rail":
            this.gate(t, 0.1) &&
              (this.tone(2200, 0.3, "sine", 0.12, { to: 180 }), this.noise(0.18, 0.12, { f: 6e3, to: 800 }));
            break;
          case "rocket":
            this.gate(t, 0.08) &&
              (this.noise(0.3, 0.12, { f: 900, to: 300 }), this.tone(220, 0.18, "triangle", 0.08, { to: 110 }));
            break;
          case "disc":
            this.gate(t, 0.1) &&
              (this.noise(0.22, 0.09, { type: "bandpass", f: 1800, to: 700, q: 3 }),
              this.tone(620 * n, 0.12, "triangle", 0.05, { to: 900 }));
            break;
          case "flame":
            this.gate(t, 0.11) && this.noise(0.16, 0.07, { type: "bandpass", f: 900 * n, q: 0.6, rate: 0.7 });
            break;
          case "block":
            this.gate(t, 0.06) && this.tone(2400 * n, 0.05, "square", 0.025, { lp: 5e3 });
            break;
          case "guardBreak":
            (this.noise(0.3, 0.2, { type: "highpass", f: 2500 }),
              this.tone(900, 0.25, "sawtooth", 0.06, { to: 200, lp: 3e3 }));
            break;
          case "shieldPop":
            this.tone(1600, 0.2, "sine", 0.07, { to: 500 });
            break;
          case "lob":
            this.gate(t, 0.1) && (this.tone(120, 0.18, "sine", 0.25, { to: 60 }), this.noise(0.12, 0.08, { f: 700 }));
            break;
          case "blinkWarn":
            this.gate(t, 0.1) && this.tone(500, 0.5, "sine", 0.05, { to: 1500, attack: 0.1 });
            break;
          case "blink":
            this.gate(t, 0.08) && this.noise(0.12, 0.08, { type: "bandpass", f: 3e3, to: 800, q: 2 });
            break;
          case "combo":
            [0, 0.06, 0.12].forEach((s, r) =>
              this.tone(yn(76 + Math.min(12, e || 0) + [0, 4, 7][r]), 0.14, "square", 0.035, { at: s, lp: 4e3 }),
            );
            break;
          case "heart":
            (this.tone(62, 0.12, "sine", 0.35, { to: 45 }), this.tone(58, 0.12, "sine", 0.25, { to: 42, at: 0.17 }));
            break;
          case "evolve":
            ([0, 0.09, 0.18, 0.27, 0.45].forEach((s, r) =>
              this.tone(yn(67 + [0, 4, 7, 11, 14][r]), 0.4, "triangle", 0.08, { at: s }),
            ),
              this.noise(0.8, 0.06, { type: "highpass", f: 5e3, attack: 0.2 }));
            break;
          case "hit":
            this.gate(t, 0.035) && this.tone(1300 * n, 0.03, "triangle", 0.035);
            break;
          case "crit":
            this.gate(t, 0.06) && this.tone(2e3 * n, 0.06, "square", 0.03, { lp: 4e3 });
            break;
          case "kill":
            if (this.gate(t, 0.03)) {
              let s = e || 1;
              (this.noise(0.14 + s * 0.04, 0.13 * Math.min(2, s), {
                type: "bandpass",
                f: (1500 / Math.sqrt(s)) * n,
                q: 1.2,
              }),
                this.tone((320 * n) / Math.sqrt(s), 0.12, "square", 0.04, { to: 70, lp: 2e3 }),
                s > 1.3 && this.tone(90, 0.22, "sine", 0.22, { to: 40 }));
            }
            break;
          case "bigkill":
            (this.noise(0.4, 0.3, { f: 1600, to: 200 }), this.tone(160, 0.35, "sawtooth", 0.12, { to: 40, lp: 900 }));
            break;
          case "boom":
            this.gate(t, 0.05) &&
              (this.noise(0.45, 0.28, { f: 700, to: 120 }), this.tone(100, 0.35, "sine", 0.3, { to: 35 }));
            break;
          case "smallboom":
            this.gate(t, 0.05) && this.noise(0.2, 0.12, { f: 1200, to: 300 });
            break;
          case "hurt":
            (this.tone(240, 0.22, "sawtooth", 0.15, { to: 90, lp: 1400 }), this.noise(0.15, 0.2, { f: 900 }));
            break;
          case "shield":
            (this.tone(1400, 0.35, "sine", 0.1, { to: 700 }), this.tone(2100, 0.25, "sine", 0.05));
            break;
          case "shieldUp":
            this.tone(700, 0.18, "sine", 0.06, { to: 1400 });
            break;
          case "dash":
            this.noise(0.18, 0.12, { type: "bandpass", f: 700, to: 3200, q: 1.5 });
            break;
          case "nova":
            (this.tone(70, 0.9, "sine", 0.45, { to: 28 }),
              this.noise(0.9, 0.3, { f: 3e3, to: 150 }),
              this.tone(600, 0.5, "sawtooth", 0.06, { to: 60, lp: 2e3 }));
            break;
          case "novaReady":
            (this.tone(880, 0.12, "sine", 0.07), this.tone(1320, 0.2, "sine", 0.07, { at: 0.08 }));
            break;
          case "shard": {
            let s = this.ctx.currentTime;
            ((this.combo = s - this.comboT < 0.4 ? Math.min(this.combo + 1, 14) : 0),
              (this.comboT = s),
              this.gate(t, 0.03) && this.tone(1100 * Math.pow(1.045, this.combo), 0.06, "sine", 0.04));
            break;
          }
          case "heal":
            (this.tone(660, 0.12, "sine", 0.08), this.tone(990, 0.2, "sine", 0.08, { at: 0.08 }));
            break;
          case "eshot":
            this.gate(t, 0.07) && this.tone(520 * n, 0.07, "square", 0.025, { to: 300, lp: 1800 });
            break;
          case "snipe":
            this.tone(1700, 0.16, "sine", 0.07, { to: 900 });
            break;
          case "warn":
            this.gate(t, 0.15) && this.tone(420, 0.3, "triangle", 0.05, { to: 900 });
            break;
          case "fuse":
            this.gate(t, 0.1) && this.tone(1200, 0.4, "square", 0.03, { to: 2400, lp: 3e3 });
            break;
          case "spawn":
            this.gate(t, 0.12) && this.noise(0.4, 0.05, { type: "bandpass", f: 400, to: 2400, q: 2 });
            break;
          case "wave":
            [0, 0.14, 0.28].forEach((s, r) =>
              this.tone(yn(57 + [0, 3, 7][r]), 0.35, "sawtooth", 0.06, { at: s, lp: 1800 }),
            );
            break;
          case "cleared":
            [0, 0.1, 0.2, 0.3].forEach((s, r) =>
              this.tone(yn(69 + [0, 4, 7, 12][r]), 0.3, "triangle", 0.08, { at: s }),
            );
            break;
          case "boss":
            (this.tone(55, 1.6, "sawtooth", 0.18, { lp: 400, attack: 0.3 }),
              this.tone(82.4, 1.6, "sawtooth", 0.12, { lp: 500, attack: 0.3 }),
              this.noise(1.4, 0.08, { f: 300, to: 2e3, attack: 0.5 }));
            break;
          case "pick":
            [0, 0.07, 0.14].forEach((s, r) =>
              this.tone(yn(72 + [0, 4, 7][r]), 0.2, "square", 0.04, { at: s, lp: 3e3 }),
            );
            break;
          case "click":
            this.tone(1800, 0.03, "triangle", 0.04);
            break;
          case "event":
            [0, 0.12, 0.24].forEach((s, r) =>
              this.tone(yn(62 + [0, 6, 12][r]), 0.3, "sawtooth", 0.05, { at: s, lp: 2400 }),
            );
            break;
          case "erupt":
            this.gate(t, 0.25) &&
              (this.noise(0.6, 0.16, { f: 600, to: 2400, attack: 0.05 }), this.tone(70, 0.5, "sine", 0.18, { to: 40 }));
            break;
          case "warp":
            this.gate(t, 0.12) && this.tone(420, 0.25, "sine", 0.07, { to: 1400 });
            break;
          case "mend":
            this.gate(t, 0.3) && this.tone(880, 0.3, "sine", 0.04, { to: 1320 });
            break;
          case "chill":
            this.gate(t, 0.3) && this.tone(2400, 0.2, "sine", 0.05, { to: 1200 });
            break;
          case "champion":
            (this.tone(90, 1, "sawtooth", 0.14, { lp: 500, attack: 0.2 }),
              this.tone(135, 1, "sawtooth", 0.09, { lp: 600, attack: 0.2 }));
            break;
          case "rumble":
            (this.tone(55, 0.8, "sawtooth", 0.12, { to: 38, lp: 260, attack: 0.08 }),
              this.noise(0.7, 0.12, { f: 400, to: 120, attack: 0.1 }));
            break;
          case "ready":
            this.gate(t, 0.3) && this.tone(1560, 0.07, "sine", 0.035, { to: 2100 });
            break;
          case "buy":
            (this.tone(880, 0.1, "square", 0.05, { lp: 3e3 }),
              this.tone(1320, 0.18, "square", 0.05, { at: 0.07, lp: 3e3 }));
            break;
          case "deny":
            this.tone(200, 0.15, "square", 0.05, { lp: 900 });
            break;
          case "die":
            (this.tone(400, 1.2, "sawtooth", 0.15, { to: 40, lp: 1200 }), this.noise(1, 0.25, { f: 2e3, to: 100 }));
            break;
          case "victory":
            [0, 0.15, 0.3, 0.45, 0.75].forEach((s, r) =>
              this.tone(yn(64 + [0, 4, 7, 12, 16][r]), 0.5, "triangle", 0.09, { at: s }),
            );
            break;
          case "thud":
            this.gate(t, 0.1) && (this.tone(80, 0.3, "sine", 0.3, { to: 30 }), this.noise(0.2, 0.15, { f: 500 }));
            break;
          case "beam":
            this.gate(t, 0.2) && this.tone(300, 0.9, "sawtooth", 0.05, { to: 1200, lp: 2500, attack: 0.2 });
            break;
        }
      }
      consume(t) {
        if (!this.ctx || this.ctx.state !== "running") return;
        let e = 0;
        for (let n of t)
          switch (n.k) {
            case "shot":
              this.play(rlShotSfx(n.w));
              break;
            case "dmg":
              n.burn || this.play(n.crit ? "crit" : "hit");
              break;
            case "kill":
              n.boss ? this.play("bigkill") : e++ < 3 && this.play("kill", n.elite ? 1.8 : Math.max(1, n.r * 1.6));
              break;
            case "boom":
              this.play(n.kind === "payload" || n.kind === "pop" ? "smallboom" : "boom");
              break;
            case "nova":
              this.play("nova");
              break;
            case "novaReady":
              this.play("novaReady");
              break;
            case "hurt":
              this.play("hurt");
              break;
            case "shieldBreak":
              this.play("shield");
              break;
            case "shieldUp":
              this.play("shieldUp");
              break;
            case "dash":
              this.play("dash");
              break;
            case "edash":
              this.play("blink");
              break;
            case "mine":
              this.play("fuse");
              break;
            case "shard":
              this.play("shard");
              break;
            case "heal":
              this.play("heal");
              break;
            case "eshot":
              this.play(n.type === "sniper" ? "snipe" : "eshot");
              break;
            case "aim":
            case "charge":
              this.play("warn");
              break;
            case "fuse":
              this.play("fuse");
              break;
            case "portal":
              this.play("spawn");
              break;
            case "wave":
              this.play(n.boss ? "boss" : "wave");
              break;
            case "cleared":
              this.play("cleared");
              break;
            case "die":
              this.play("die");
              break;
            case "victory":
              this.play("victory");
              break;
            case "thud":
              this.play("thud");
              break;
            case "beamWarn":
              this.play("beam");
              break;
            case "revive":
              this.play("nova");
              break;
            case "pick":
              this.play(n.evo ? "evolve" : "pick");
              break;
            case "block":
              this.play("block");
              break;
            case "guardBreak":
              this.play("guardBreak");
              break;
            case "shieldPop":
              this.play("shieldPop");
              break;
            case "lob":
              this.play("lob");
              break;
            case "blinkWarn":
              this.play("blinkWarn");
              break;
            case "blink":
              this.play("blink");
              break;
            case "erupt":
              this.play("erupt");
              break;
            case "warp":
              this.play("warp");
              break;
            case "mend":
            case "chill":
            case "champion":
              this.play(n.k);
              break;
            case "championDown":
              this.play("bigkill");
              break;
            case "combo":
              this.play("combo", Math.round(Math.log2(n.n / 10) * 3));
              break;
          }
      }
      setMusic(t, e) {
        ((this.mode = t), e && (this.biome = e));
      }
      startScheduler() {
        this.timer ||
          ((this.nextT = this.ctx.currentTime + 0.1),
          (this.timer = setInterval(() => {
            try {
              this.schedule();
            } catch (t) {
              (this.fail(t), clearInterval(this.timer));
            }
          }, 30)));
      }
      schedule() {
        let t = this.ctx;
        if (!t || t.state !== "running") return;
        this.nextT < t.currentTime - 0.5 && (this.nextT = t.currentTime + 0.05);
        let n = 60 / (this.mode === "boss" ? 134 : this.mode === "fight" ? 122 : 100) / 4;
        for (; this.nextT < t.currentTime + 0.14; )
          (this.mode !== "off" && this.musVol > 0 && this.note(this.step, this.nextT),
            (this.nextT += n),
            (this.step = (this.step + 1) % 64),
            this.step === 0 && this.cycle++,
            (this.intensity += (this.want - this.intensity) * 0.02));
      }
      note(t, e) {
        let n = Qf[this.biome] || Qf.yard,
          s = Math.floor(t / 16),
          r = t % 16,
          [a, o] = n[s],
          h = [a, a + (o === "m" ? 3 : 4), a + 7, a + 12],
          l = this.mode === "fight" || this.mode === "boss",
          u = this.mode === "boss",
          d = e - this.ctx.currentTime,
          f = this.mus;
        if (l) {
          let p = u ? Math.max(0.7, this.intensity) : this.intensity,
            x = this.cycle,
            m = x % 2 === 1 && s === 3 && r >= 12;
          (r % 4 === 0 && !(m && r > 12) && this.tone(150, 0.14, "sine", 0.5, { to: 42, dest: f, at: d }),
            p > 0.62 && r % 8 === 7 && this.tone(140, 0.1, "sine", 0.3, { to: 45, dest: f, at: d }),
            r % 4 === 2 && this.noise(0.03, 0.07, { type: "highpass", f: 7500, dest: f, at: d }),
            (p > 0.32 || u) &&
              r % 2 === 1 &&
              this.noise(0.02, 0.03 + p * 0.02, { type: "highpass", f: 9e3, dest: f, at: d }),
            m
              ? this.noise(0.08, 0.06 + (r - 12) * 0.025, {
                  type: "bandpass",
                  f: 1500 + (r - 12) * 250,
                  q: 0.9,
                  dest: f,
                  at: d,
                })
              : (r === 4 || r === 12) && this.noise(0.14, 0.14, { type: "bandpass", f: 1800, q: 0.8, dest: f, at: d }));
          let g = tp[this.biome] || tp.yard;
          if (
            (r % 2 === 0 &&
              this.tone(yn(a - 24 + (r % 8 === 6 ? 12 : 0)), 0.16, g.bass, 0.11, {
                lp: (u ? 700 : 520) + p * 380,
                dest: f,
                at: d,
              }),
            r % 2 === 0 || u || p > 0.8)
          ) {
            let M = ep[x % ep.length],
              b = (r / (u || p > 0.8 ? 1 : 2)) | 0,
              v = h[M[b % M.length]] + (x % 4 === 3 ? 24 : 12);
            this.tone(yn(v), 0.1, g.arp, g.arp === "sine" ? 0.045 : 0.025, {
              lp: g.lp + p * 1600,
              dest: this.delay,
              at: d,
            });
          }
          if ((p > 0.45 || u) && x % 2 === 0) {
            let M = np[s % np.length][r];
            M != null &&
              this.tone(
                yn(h[M % 4] + 24 + (M >= 4 ? 12 : 0)),
                0.22,
                g.lead,
                g.lead === "sawtooth" || g.lead === "square" ? 0.028 : 0.045,
                { dest: this.delay, at: d, attack: 0.01, lp: 3e3 },
              );
          }
        } else {
          if (r === 0)
            for (let p of h.slice(0, 3))
              (this.tone(yn(p - 12), ip(100) * 16, "sawtooth", 0.025, {
                lp: 800,
                attack: 0.6,
                dest: f,
                at: d,
                detune: 7,
              }),
                this.tone(yn(p - 12), ip(100) * 16, "sawtooth", 0.02, {
                  lp: 800,
                  attack: 0.6,
                  dest: f,
                  at: d,
                  detune: -7,
                }));
          (r % 4 === 0 &&
            (t * 7) % 3 !== 0 &&
            this.tone(yn(h[((t / 4) % 4) | 0] + 12), 0.4, "triangle", 0.04, { dest: this.delay, at: d }),
            r === 0 && this.tone(yn(a - 24), 1.6, "sine", 0.12, { dest: f, at: d, attack: 0.05 }));
        }
      }
    };
  function ip(i) {
    return 60 / i / 4;
  }
  var sp = {
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    shard: '<path d="M12 2.5l5 7-5 12-5-12z"/><path d="M7 9.5h10"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
    dash: '<path d="M3 12h10M6 7h8M6 17h8"/><path d="M14 6l6 6-6 6"/>',
    star: '<path d="M12 2.5l2.6 6.2 6.7.5-5.1 4.4 1.6 6.5L12 16.6l-5.8 3.5 1.6-6.5-5.1-4.4 6.7-.5z"/>',
    burst:
      '<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.3 5.3l3.5 3.5M15.2 15.2l3.5 3.5M5.3 18.7l3.5-3.5M15.2 8.8l3.5-3.5"/><circle cx="12" cy="12" r="2"/>',
    rate: '<path d="M4 7l5 5-5 5M11 7l5 5-5 5M18 7v10"/>',
    shield: '<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z"/>',
    wing: '<path d="M3 16c4-1 7-4 9-10 1 5 4 8 9 9-4 2-10 3-18 1z"/>',
    arrow: '<path d="M3 12h16M14 6l6 6-6 6"/>',
    magnet: '<path d="M6 3v8a6 6 0 0012 0V3"/><path d="M6 7h4M14 7h4"/>',
    crosshair: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    heart: '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 9c0 6.2-8 11-8 11z"/>',
    fan: '<path d="M12 21V11M12 11L5 4M12 11l7-7M12 11V3"/>',
    pierce: '<path d="M2 12h20M17 7l5 5-5 5"/><circle cx="8" cy="12" r="3"/>',
    bounce: '<path d="M3 18l6-12 6 12 6-12"/>',
    orbit:
      '<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5"/><circle cx="20.5" cy="10.5" r="1.3"/>',
    snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
    bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
    flame: '<path d="M12 22c-4 0-7-3-7-7 0-4 3-6 4-10 2 2 3 4 3 6 1-1 2-2 2-4 3 3 5 5 5 8 0 4-3 7-7 7z"/>',
    drone: '<rect x="8" y="9" width="8" height="6" rx="1.5"/><path d="M8 12H3M16 12h5M5 9v6M19 9v6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    reroll: '<path d="M20 11a8 8 0 00-14.5-4.5M4 13a8 8 0 0014.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 01-10 0z"/><path d="M7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4M12 14v4M8 21h8"/>',
    wrench: '<path d="M14.5 5.5a4 4 0 00-5.2 5.2L3 17l4 4 6.3-6.3a4 4 0 005.2-5.2l-2.7 2.7-2.8-.5-.5-2.8z"/>',
    check: '<path d="M4 12.5l5 5 11-11"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    load: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v4h16v-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    skull:
      '<path d="M12 3a8 8 0 00-5 14.2V21h10v-3.8A8 8 0 0012 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  };
  function Ln(i, t = "") {
    let e = sp[i] || sp.info;
    return `<svg class="ico ${t}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${e}</svg>`;
  }
  var k = (i) => document.getElementById(i),
    Bh = ["home", "workshop", "records", "settings"],
    gi = (i) => (Math.round(i * 10 + 1e-6) / 10).toString(),
    Js = (i) => Math.round(i * 100) + "%",
    rp = (i) => (i > 0 ? gi(i) + " s" : "off"),
    t_ = [
      ["Damage", (i) => i.weapon.dmg * i.dmgMul, gi],
      ["Fire rate", (i) => i.weapon.rate * i.rateMul, (i) => gi(i) + "/s"],
      ["Projectiles", (i) => i.weapon.count + (i.weapon.cone ? i.extra * 2 : i.extra), String],
      ["Pierce", (i) => (i.pierce > 99 ? 0 : i.pierce), String],
      ["Bounces", (i) => i.bounce, String],
      ["Crit", (i) => i.crit, Js],
      ["Max HP", (i) => i.maxHp, String],
      ["Speed", (i) => i.speed, (i) => gi(i) + " m/s"],
      ["Range", (i) => i.range, (i) => Math.round(i) + " m"],
      ["Pickup radius", (i) => i.magnet, (i) => gi(i) + " m"],
      ["Dash cooldown", (i) => i.dashCd, rp],
      ["Aegis every", (i) => i.shieldCd, rp],
      ["Regen", (i) => i.regen, (i) => gi(i) + " HP/s"],
      ["Blades", (i) => i.orbit, String],
      ["Blade damage", (i) => (i.orbit ? i.orbitDmg * i.dmgMul : 0), gi],
      ["Slow chance", (i) => i.cryo, Js],
      ["Chain chance", (i) => i.arc, Js],
      ["Bolt jumps", (i) => i.chain, String],
      ["Flame burn", (i) => (i.burn ? i.burn * i.burnMul * i.dmgMul : 0), (i) => gi(i) + "/s"],
      ["Chain jumps", (i) => (i.arc ? i.arcJumps : 0), String],
      ["Blast", (i) => i.payloadF, Js],
      ["Burn", (i) => i.thermite, Js],
      ["Repair chance", (i) => i.siphonCh, Js],
      ["Nova radius", (i) => i.novaR, (i) => gi(i) + " m"],
      ["Drones", (i) => i.wingmen, String],
    ],
    Hl = {
      arc: ["Arc Relay", "#c58bff"],
      burn: ["Burning", "#ff8a2a"],
      payload: ["Payload", "#ffa13d"],
      orbit: ["Orbital Blades", "#9ff8ff"],
      wingman: ["Wingman", "#49f2ff"],
      dash: ["Shock Dash", "#7ff6ff"],
      trail: ["Phantom trail", "#7ff6ff"],
      nova: ["Nova", "#7ff6ff"],
      pop: ["Bomber blasts", "#ffe14a"],
      lava: ["Lava", "#ff6a2a"],
      inferno: ["Inferno", "#ff5a3a"],
      other: ["Other", "#93a2bf"],
    },
    we = (i) =>
      String(i).replace(
        /[&<>"']/g,
        (t) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[t],
      ),
    Gl = class {
      constructor(t) {
        ((this.g = t),
          (this.screen = "home"),
          (this.stack = []),
          (this.viewWeapon = 0),
          (this.viewThreat = 0),
          (this.hudCache = {}),
          (this.dlgResolve = null),
          this.fillIcons(document),
          (k("pauseBtn").innerHTML = Ln("pause")),
          this.bind());
      }
      fillIcons(t) {
        for (let e of t.querySelectorAll("[data-icon]"))
          e.dataset.filled || ((e.dataset.filled = "1"), e.insertAdjacentHTML("afterbegin", Ln(e.dataset.icon)));
      }
      get save() {
        return this.g.store.data;
      }
      click(t, e) {
        if (!t) return;
        let n = 0,
          s = 0,
          r = 0,
          o = 0,
          h = () => {
            if (t.disabled || t.hidden) return !1;
            (this.g.sound.play("click"), e());
            return !0;
          };
        t.addEventListener(
          "pointerdown",
          (l) => {
            if ((l.pointerType === "touch" || l.pointerType === "pen") && l.isPrimary !== !1) {
              ((s = l.clientX), (r = l.clientY), (o = l.pointerId), (n = 1));
            }
          },
          { passive: !1 },
        );
        t.addEventListener(
          "pointerup",
          (l) => {
            if (!(l.pointerType === "touch" || l.pointerType === "pen") || !n || l.pointerId !== o) return;
            let u = l.clientX - s,
              d = l.clientY - r;
            if (((n = 0), Math.hypot(u, d) > 14 || !h())) return;
            (l.preventDefault(), l.stopPropagation());
            const c = performance.now();
            ((RL_TOUCH_CLICK_GUARD.until = c + 800),
              (RL_TOUCH_CLICK_GUARD.x = l.clientX),
              (RL_TOUCH_CLICK_GUARD.y = l.clientY),
              (RL_TOUCH_CLICK_GUARD.key = rlUiClickKey(t)));
          },
          { passive: !1 },
        );
        t.addEventListener(
          "pointercancel",
          (l) => {
            l.pointerId === o && (n = 0);
          },
          { passive: !0 },
        );
        t.addEventListener("click", (l) => {
          const u = performance.now(),
            g = RL_TOUCH_CLICK_GUARD,
            dx = Number(l.clientX) - g.x,
            dy = Number(l.clientY) - g.y,
            near = Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= 36,
            key = rlUiClickKey(t),
            same = !!(g.key && key && g.key === key) || near;
          if (u < g.until && same) {
            ((g.until = 0), (g.key = ""), RL_RT.uiGuardDrops++, l.preventDefault(), l.stopPropagation());
            return;
          }
          ((g.until = 0), (g.key = ""), h());
        });
      }
      bind() {
        for (let s of document.querySelectorAll("[data-go]")) this.click(s, () => this.show(s.dataset.go));
        for (let s of document.querySelectorAll("[data-back]")) this.click(s, () => this.back());
        (this.click(k("wPrev"), () => this.stepWeapon(-1)),
          this.click(k("wNext"), () => this.stepWeapon(1)),
          this.click(k("tPrev"), () => this.stepThreat(-1)),
          this.click(k("tNext"), () => this.stepThreat(1)),
          this.click(k("wBuy"), () => this.buyWeapon()),
          this.click(k("playBtn"), () => this.play()),
          this.click(k("continueBtn"), () => this.g.startRun({ resume: !0 })));
        let t = (s, r) =>
          s.addEventListener("pointerdown", (a) => {
            (a.preventDefault(), a.stopPropagation(), r());
          });
        (t(k("dashBtn"), () => {
          this.g.input.press("dash");
          let s = this.g.world,
            r = k("dashBtn");
          s &&
            s.player.dashCdT > 0.08 &&
            (r.classList.remove("deny"), r.offsetWidth, r.classList.add("deny"), this.g.sound.play("deny"));
        }),
          t(k("novaBtn"), () => {
            this.g.input.press("nova");
            let s = this.g.world,
              r = k("novaBtn");
            s &&
              s.player.nova < 100 &&
              (r.classList.remove("deny"), r.offsetWidth, r.classList.add("deny"), this.g.sound.play("deny"));
          }),
          this.click(k("pauseBtn"), () => this.g.pause()),
          this.click(k("resumeBtn"), () => this.g.resume()),
          this.click(k("abandonBtn"), async () => {
            (await this.confirm(
              "Abandon run?",
              "You keep the shards collected so far, but the run ends here.",
              "Abandon",
            )) && this.g.abandon();
          }),
          this.click(k("rerollBtn"), () => this.g.reroll()),
          this.click(k("restartBtn"), async () => {
            (await this.confirm(
              "Restart run?",
              "Shards collected so far are kept. A fresh run starts with the same weapon and threat.",
              "Restart",
            )) && this.g.restart();
          }),
          this.click(k("retryBtn"), () => this.g.startRun({})),
          this.click(k("homeBtn"), () => this.g.goHome()),
          this.click(k("endlessBtn"), () => this.g.endless()),
          this.click(k("crashHome"), () => this.g.recover()),
          this.click(k("crashCopy"), () => this.copy(k("crashLog").value)),
          this.click(k("updateBtn"), () => this.g.applyUpdate()));
        let e = () => this.save.settings,
          n = (s, r) => {
            let a = k(s);
            a.addEventListener("change", () => {
              ((e()[r] = a.checked), this.g.settingsChanged());
            });
          };
        (n("setAuto", "autoFire"),
          n("setAssist", "assist"),
          n("setSwap", "swap"),
          n("setShake", "shake"),
          n("setNumbers", "numbers"),
          n("setContrast", "contrast"),
          n("setCalm", "calm"));
        for (let [s, r] of [
          ["setSfx", "sfx"],
          ["setMusic", "music"],
        ]) {
          let a = k(s);
          (a.addEventListener("input", () => {
            ((e()[r] = +a.value), this.g.settingsChanged(!0));
          }),
            a.addEventListener("change", () => {
              (this.g.settingsChanged(), r === "sfx" && this.g.sound.play("pick"));
            }));
        }
        for (let [s, r, a] of [
          ["setQuality", "quality", !1],
          ["setZoom", "zoom", !0],
        ])
          for (let o of k(s).querySelectorAll("button"))
            this.click(o, () => {
              ((e()[r] = a ? +o.dataset.v : o.dataset.v), this.renderSettings(), this.g.settingsChanged());
            });
        (this.click(k("resetBtn"), async () => {
          (await this.confirm(
            "Reset all progress?",
            "Shards, workshop, weapons, records and milestones are wiped. Settings stay.",
            "Continue",
          )) &&
            (await this.confirm("Really reset?", "This cannot be undone.", "Reset everything", !0)) &&
            this.g.resetProgress();
        }),
          this.click(k("logBtn"), () => this.showLog()),
          ru(() => {
            this.screen === "settings" && this.renderLog();
          }),
          k("dialog").addEventListener("click", (s) => {
            s.target === k("dialog") && this.closeDialog(null);
          }));
      }
      show(t) {
        (Bh.includes(this.screen) && this.screen !== t && this.stack.push(this.screen), this._show(t));
      }
      _show(t) {
        for (let e of Bh) k(e).hidden = e !== t;
        ((this.screen = t),
          t === "home" && ((this.stack = []), this.renderHome()),
          t === "workshop" && this.renderWorkshop(),
          t === "records" && this.renderRecords(),
          t === "settings" && this.renderSettings());
      }
      back() {
        this._show(this.stack.pop() || "home");
      }
      hideMenus() {
        for (let t of Bh) k(t).hidden = !0;
        this.screen = "game";
      }
      renderHome() {
        let t = this.save;
        k("bank").textContent = qn(t.shards);
        for (let r of document.querySelectorAll(".bankMirror")) r.textContent = qn(t.shards);
        ((this.viewWeapon == null || !En[this.viewWeapon]) && (this.viewWeapon = 0),
          this.homeInit ||
            ((this.viewWeapon = En.indexOf(t.weapon)), (this.viewThreat = t.threat), (this.homeInit = !0)),
          this.renderWeapon(),
          this.renderThreat());
        let e = t.run,
          n = k("continueBtn");
        (e
          ? ((n.hidden = !1),
            (n.innerHTML = `${Ln("play")}CONTINUE \xB7 WAVE ${e.wave + (e.offer ? 1 : 0)} \xB7 ${we(ue[e.weapon].name)}`),
            k("playBtn").classList.remove("primary"))
          : ((n.hidden = !0), k("playBtn").classList.add("primary")),
          this.updatePlayState(),
          (k("recBadge").hidden = !this.g.claimable().length));
        let s = t.stats;
        ((k("bestLine").hidden = !s.runs),
          s.runs &&
            (k("bestLine").textContent =
              `Best wave ${s.bestWave}` + (s.clears ? ` \xB7 ${s.clears} clear${s.clears > 1 ? "s" : ""}` : "")));
      }
      renderWeapon() {
        let t = this.save,
          e = En[this.viewWeapon],
          n = ue[e],
          s = !!t.weapons[e],
          r = document.querySelector(".weapon-card");
        (r.classList.toggle("locked", !s),
          r.style.setProperty("--wc", "#" + n.color.toString(16).padStart(6, "0")),
          (k("wIndex").textContent = `${this.viewWeapon + 1}/${En.length}`),
          (k("wName").innerHTML = (s ? "" : Ln("lock", "inline")) + we(n.name)),
          k("wName").querySelector(".ico") &&
            (k("wName").querySelector(".ico").style.cssText =
              "display:inline-block;vertical-align:-3px;margin-right:6px;width:18px;height:18px"),
          (k("wBlurb").textContent = n.blurb));
        let a = n.dmg * n.count + (n.explodeDmg || 0),
          o = tc(n),
          c = (u) => {
            let d = Lt(Math.round(u), 1, 8);
            return (
              '<div class="segs">' +
              Array.from({ length: 8 }, (f, p) => `<i class="${p < d ? "on" : ""}"></i>`).join("") +
              "</div>"
            );
          },
          h = n.count > 1 ? `${n.dmg}\xD7${n.count}` : n.explodeDmg ? `${n.dmg}+${n.explodeDmg}` : String(n.dmg);
        k("wStats").innerHTML = `
      <div class="stat"><span class="k">DAMAGE</span><span class="v">${h}</span>${c((a / 55) * 8)}</div>
      <div class="stat"><span class="k">RATE</span><span class="v">${n.rate.toFixed(1)}/s</span>${c((n.rate / 6.5) * 8)}</div>
      <div class="stat"><span class="k">RANGE</span><span class="v">${Math.round(o)} m</span>${c((o / 28) * 8)}</div>`;
        let l = k("wBuy");
        ((l.hidden = s),
          s ||
            ((l.innerHTML = `UNLOCK \xB7 <span class="shard-ico"></span>${n.cost}`), (l.disabled = t.shards < n.cost)),
          (k("wPrev").disabled = this.viewWeapon <= 0),
          (k("wNext").disabled = this.viewWeapon >= En.length - 1),
          this.updatePlayState(),
          this.g.previewWeapon(s ? e : t.weapon));
      }
      renderThreat() {
        let t = this.save,
          e = si[this.viewThreat],
          n = this.viewThreat > t.threatMax;
        ((k("tName").textContent = e.name),
          k("tName").classList.toggle("hot", this.viewThreat > 0),
          (k("tDesc").textContent = n
            ? `Clear all ${20} waves on ${si[this.viewThreat - 1].name} to unlock`
            : this.viewThreat > 0
              ? `${e.desc} Shards \xD7${(1 + 0.25 * this.viewThreat).toFixed(2)}`
              : e.desc),
          (k("tPrev").disabled = this.viewThreat <= 0),
          (k("tNext").disabled = this.viewThreat >= Math.min(5, t.threatMax + 1)),
          this.updatePlayState());
      }
      updatePlayState() {
        let t = this.save,
          e = En[this.viewWeapon],
          n = !!t.weapons[e] && this.viewThreat <= t.threatMax,
          s = k("playBtn");
        ((s.disabled = !n),
          (s.textContent = n ? (t.run ? "NEW RUN" : "START RUN") : t.weapons[e] ? "THREAT LOCKED" : "WEAPON LOCKED"));
      }
      stepWeapon(t) {
        this.viewWeapon = Lt(this.viewWeapon + t, 0, En.length - 1);
        let e = En[this.viewWeapon];
        (this.save.weapons[e] && ((this.save.weapon = e), this.g.store.save("weapon")), this.renderWeapon());
      }
      stepThreat(t) {
        ((this.viewThreat = Lt(this.viewThreat + t, 0, Math.min(5, this.save.threatMax + 1))),
          this.viewThreat <= this.save.threatMax && ((this.save.threat = this.viewThreat), this.g.store.save("threat")),
          this.renderThreat());
      }
      buyWeapon() {
        let t = this.save,
          e = En[this.viewWeapon],
          n = ue[e];
        if (t.weapons[e] || t.shards < n.cost) {
          this.g.sound.play("deny");
          return;
        }
        ((t.shards -= n.cost),
          (t.weapons[e] = !0),
          (t.weapon = e),
          this.g.store.save("buy"),
          this.g.sound.play("buy"),
          this.toast(`${n.name} unlocked`, "gold"),
          this.renderHome());
      }
      async play() {
        let t = this.save;
        (t.run &&
          !(await this.confirm("Start a new run?", `Your run at wave ${t.run.wave} will be abandoned.`, "New run"))) ||
          (t.run && this.g.discardRun(), this.g.startRun({}));
      }
      renderWorkshop() {
        let t = this.save;
        for (let n of document.querySelectorAll(".bankMirror")) n.textContent = qn(t.shards);
        let e = k("wsList");
        e.innerHTML = ai
          .map((n) => {
            let s = t.workshop[n.id] || 0,
              r = n.costs.length,
              a = n.costs[s],
              o = Array.from({ length: r }, (h, l) => `<i class="${l < s ? "on" : ""}"></i>`).join(""),
              c =
                s >= r
                  ? '<button class="btn" disabled>MAX</button>'
                  : `<button class="btn" data-buy="${n.id}" ${t.shards < a ? "disabled" : ""}><span class="shard-ico"></span>${a}</button>`;
            return `<div class="row panel"><div class="rico">${Ln(n.icon)}</div><div><b>${we(n.name)}</b><small>${we(n.desc)}</small><div class="pips">${o}</div></div>${c}</div>`;
          })
          .join("");
        for (let n of e.querySelectorAll("[data-buy]")) this.click(n, () => this.buyModule(n.dataset.buy));
      }
      buyModule(t) {
        let e = this.save,
          n = ai.find((a) => a.id === t),
          s = e.workshop[t] || 0,
          r = n.costs[s];
        if (r == null || e.shards < r) {
          this.g.sound.play("deny");
          return;
        }
        ((e.shards -= r),
          (e.workshop[t] = s + 1),
          this.g.store.save("workshop"),
          this.g.sound.play("buy"),
          this.renderWorkshop());
      }
      renderRecords() {
        let t = this.save,
          e = t.stats;
        for (let a of document.querySelectorAll(".bankMirror")) a.textContent = qn(t.shards);
        let n = Object.values(e.bosses).reduce((a, o) => a + o, 0),
          s = [
            ["Runs", e.runs],
            ["Best wave", e.bestWave || "\u2014"],
            ["Full clears", e.clears],
            ["Enemies destroyed", qn(e.kills)],
            ["Bosses defeated", n],
            ["Best threat cleared", e.bestClearThreat >= 0 ? si[e.bestClearThreat].name : "\u2014"],
            ["Time in the rift", va(e.playTime)],
            ["Fastest clear", e.bestTime > 0 ? va(e.bestTime) : "—"],
            ["Shards earned", qn(e.shardsEarned)],
          ];
        k("statGrid").innerHTML = s
          .map(([a, o]) => `<div class="cell"><div class="k">${we(a)}</div><div class="v">${we(o)}</div></div>`)
          .join("");
        let r = k("msList");
        r.innerHTML = _i
          .map((a) => {
            let o = !!t.milestones[a.id],
              c = !o && a.test(t),
              h = o
                ? `<span class="chip">${Ln("check")}DONE</span>`
                : c
                  ? `<button class="btn" data-claim="${a.id}"><span class="shard-ico"></span>${a.reward}</button>`
                  : `<span class="chip"><span class="shard-ico"></span>${a.reward}</span>`;
            return `<div class="row panel ${o ? "done" : c ? "claim" : ""}"><div class="rico">${Ln(o ? "check" : "trophy")}</div><div><b>${we(a.name)}</b><small>${we(a.desc)}</small></div>${h}</div>`;
          })
          .join("");
        for (let a of r.querySelectorAll("[data-claim]")) this.click(a, () => this.claim(a.dataset.claim));
      }
      claim(t) {
        let e = this.save,
          n = _i.find((s) => s.id === t);
        !n ||
          e.milestones[t] ||
          !n.test(e) ||
          ((e.milestones[t] = !0),
          (e.shards += n.reward),
          this.g.store.save("claim"),
          this.g.sound.play("buy"),
          this.toast(`${n.name}: +${n.reward} shards`, "gold"),
          this.renderRecords());
      }
      renderSettings() {
        let t = this.save.settings;
        ((k("setAuto").checked = t.autoFire),
          (k("setAssist").checked = t.assist),
          (k("setSwap").checked = t.swap),
          (k("setShake").checked = t.shake),
          (k("setNumbers").checked = t.numbers),
          (k("setContrast").checked = t.contrast),
          (k("setCalm").checked = t.calm),
          (k("setSfx").value = t.sfx),
          (k("setMusic").value = t.music));
        for (let e of k("setQuality").querySelectorAll("button")) e.classList.toggle("on", e.dataset.v === t.quality);
        for (let e of k("setZoom").querySelectorAll("button"))
          e.classList.toggle("on", Math.abs(+e.dataset.v - t.zoom) < 0.01);
        ((k("qualityNote").textContent = this.g.qualityNote()),
          (k("storageWarn").hidden = this.g.store.storageOk),
          (k("verText").textContent = `v${_a}`),
          this.renderLog());
      }
      renderLog() {
        let t = su().length;
        k("logCount").textContent = t ? String(t) : "0";
      }
      async showLog(q) {
        q || (await rlRunHealth({ context: "diagnostics" }));
        let t = await this.dialog({
          title: "Diagnostics",
          body: `<p>Build ${we(this.g.buildId)}. “Deep test” runs the full simulation self-test (a few seconds). Copy this text when reporting a problem.</p><textarea readonly spellcheck="false">${we(tr())}</textarea>`,
          buttons: [
            { label: "Deep test", value: "deep", cls: "ghost" },
            { label: "Copy", value: "copy", cls: "ghost" },
            { label: "Clear", value: "clear", cls: "ghost" },
            { label: "Close", value: null, cls: "primary" },
          ],
        });
        (t === "copy" && this.copy(tr()),
          t === "clear" && (au(), (RL_LAST_RUN_AUDIT = null), this.renderLog(), this.toast("Log cleared")),
          t === "deep" &&
            (this.toast("Running deep self-test…", "", 2600),
            setTimeout(async () => {
              await rlRunHealth({ context: "diagnostics", deep: !0 });
              this.showLog(!0);
            }, 80)));
      }
      async copy(t) {
        let e = !1;
        try {
          navigator.clipboard && window.isSecureContext && (await navigator.clipboard.writeText(t), (e = !0));
        } catch {}
        if (!e) {
          let n = document.createElement("textarea");
          ((n.value = t),
            n.setAttribute("readonly", ""),
            (n.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0"),
            document.body.appendChild(n),
            n.select(),
            n.setSelectionRange(0, t.length));
          try {
            e = document.execCommand("copy");
          } catch {
            e = !1;
          }
          n.remove();
        }
        return (this.toast(e ? "Copied" : "Copy failed \u2014 select the text and copy it by hand"), e);
      }
      dialog({ title: t, body: e, buttons: n, onOpen: s, read: r }) {
        (this.dlgResolve && this.closeDialog(null), (k("dlgTitle").textContent = t), (k("dlgBody").innerHTML = e));
        let a = k("dlgBtns");
        return (
          (a.innerHTML = ""),
          new Promise((o) => {
            ((this.dlgResolve = o), (this.dlgRead = r || null));
            for (let c of n) {
              let h = document.createElement("button");
              ((h.className = "btn " + (c.cls || "")),
                (h.textContent = c.label),
                this.click(h, () => this.closeDialog(c.value)),
                a.appendChild(h));
            }
            ((k("dialog").hidden = !1), s && s());
          })
        );
      }
      closeDialog(t) {
        let e = this.dlgResolve,
          n = this.dlgRead ? this.dlgRead() : void 0;
        ((this.dlgResolve = null),
          (k("dialog").hidden = !0),
          e && e(this.dlgRead ? { value: t, text: n } : t),
          (this.dlgRead = null));
      }
      async confirm(t, e, n, s) {
        return (
          (await this.dialog({
            title: t,
            body: `<p>${we(e)}</p>`,
            buttons: [
              { label: "Cancel", value: !1, cls: "ghost" },
              { label: n, value: !0, cls: s ? "danger" : "primary" },
            ],
          })) === !0
        );
      }
      alert(t, e) {
        return this.dialog({
          title: t,
          body: `<p>${we(e)}</p>`,
          buttons: [{ label: "OK", value: !0, cls: "primary" }],
        });
      }
      toast(t, e = "", n = 2900) {
        let s = k("toasts"),
          r = document.createElement("div");
        for (
          r.className = "toast " + e, r.style.animationDuration = n + "ms", r.textContent = t, s.appendChild(r);
          s.children.length > 3;
        )
          s.firstChild.remove();
        setTimeout(() => r.remove(), n + 50);
      }
      banner(t, e, n = "", s = 2200) {
        let r = k("banner");
        ((r.innerHTML = `<div class="bn ${n}" style="animation-duration:${s}ms"><div class="small">${we(e || "")}</div><div class="big">${we(t)}</div></div>`),
          clearTimeout(this.bannerT),
          (this.bannerT = setTimeout(() => {
            r.innerHTML = "";
          }, s + 50)));
      }
      comboPop(t, e) {
        let n = document.createElement("div");
        ((n.className = "combo-pop"),
          (n.textContent = `\xD7${t} COMBO  +${e}`),
          k("hud").appendChild(n),
          setTimeout(() => n.remove(), 1250));
      }
      coach(t, e, n) {
        let s = k("coach");
        if (t == null) {
          ((s.hidden = !0), (this.coachKey = null));
          return;
        }
        let r = t + n;
        this.coachKey !== r &&
          ((this.coachKey = r),
          (k("coachDots").innerHTML = Array.from({ length: e }, (a, o) => `<i class="${o <= t ? "on" : ""}"></i>`).join(
            "",
          )),
          (k("coachText").textContent = n),
          (s.hidden = !1));
      }
      setSwap(t) {
        k("hud").classList.toggle("swap", !!t);
      }
      showHud(t) {
        ((k("hud").hidden = !t),
          (k("hud").style.visibility = ""),
          k("vignette").classList.remove("low"),
          (k("touch").hidden = !t),
          t || (k("bossBar").hidden = !0),
          (this.hudCache = {}));
      }
      hud(t) {
        let e = this.hudCache,
          n = t.player,
          s = t.stats,
          r = (x, m, g) => {
            e[x] !== m && ((e[x] = m), g(m));
          },
          a = Math.max(0, Math.ceil(n.hp));
        r("hp", a + "/" + s.maxHp, (x) => {
          k("hpNum").textContent = x;
        });
        let o = Lt(n.hp / s.maxHp, 0, 1);
        if (
          (r("hpf", Math.round(o * 200), () => {
            ((k("hpFill").style.transform = `scaleX(${o})`),
              (k("hpLag").style.transform = `scaleX(${o})`),
              k("hpFill").parentElement.classList.toggle("low", o < 0.3));
          }),
          r("shieldOn", s.shieldCd > 0, (x) => {
            k("shieldPip").hidden = !x;
          }),
          s.shieldCd > 0 &&
            r("shield", n.shield ? 100 : Math.round((n.shieldT / s.shieldCd) * 20) * 5, (x) => {
              (k("shieldPip").style.setProperty("--p", x + "%"), k("shieldPip").classList.toggle("ready", x >= 100));
            }),
          e.hpVal != null && n.hp > e.hpVal + 0.5)
        ) {
          let x = k("hpFill").parentElement;
          (x.classList.remove("heal"), x.offsetWidth, x.classList.add("heal"));
        }
        ((e.hpVal = n.hp),
          this.buffs(t),
          r("low", n.alive && o < 0.25, (x) => {
            k("vignette").classList.toggle("low", x);
          }),
          r("shards", t.shards, (x) => {
            k("runShards").textContent = qn(x);
            let m = k("shardChip");
            (e.shardsSeen && (m.classList.remove("bump"), m.offsetWidth, m.classList.add("bump")), (e.shardsSeen = !0));
          }));
        let c = t.endless ? "" : "/" + 20;
        r("wave", t.wave + c, () => {
          k("waveLabel").textContent = `WAVE ${t.wave}${c}`;
        });
        let h;
        if (t.state === "fight")
          if (t.boss || t.bossPending) h = "BOSS";
          else {
            let x = t.enemies.length + t.markers.length;
            for (let m = t.planIdx; m < t.plan.length; m++) x += t.plan[m].members.length;
            h = x + " LEFT";
          }
        else t.state === "cleared" ? (h = "CLEARED") : (h = "\xA0");
        r("sub", h, (x) => {
          k("waveSub").textContent = x;
        });
        let l = t.state === "fight" && !t.boss && !t.bossPending && t.planTotal > 0;
        if (
          (r("progOn", l, (x) => {
            k("waveProg").hidden = !x;
          }),
          l)
        ) {
          let x = t.enemies.length + t.markers.length;
          for (let g = t.planIdx; g < t.plan.length; g++) x += t.plan[g].members.length;
          let m = Lt(1 - x / Math.max(t.planTotal, x), 0, 1);
          r("prog", Math.round(m * 50), () => {
            k("waveProgFill").style.transform = `scaleX(${m})`;
          });
        }
        let u = t.boss || (t.champion && !t.champion.dead ? t.champion : null);
        (r("bossOn", !!u, (x) => {
          k("bossBar").hidden = !x;
        }),
          u &&
            (r("bossName", u.type + (u.enraged ? "!" : "") + (u.champion ? "c" : ""), () => {
              ((k("bossName").textContent = u.champion ? `${Ae[u.type].name.toUpperCase()} CHAMPION` : en[u.type].name),
                (k("bossPhase").textContent = u.enraged ? "ENRAGED" : u.champion ? "RALLYING" : ""));
            }),
            r("bossF", Math.round((u.hp / u.maxHp) * 300), (x) => {
              ((k("bossFill").style.transform = `scaleX(${Lt(x / 300, 0, 1)})`),
                (k("bossLag").style.transform = `scaleX(${Lt(x / 300, 0, 1)})`));
            }),
            r("bossTicks", u.type, (x) => {
              k("bossTicks").innerHTML = x === "core" ? '<s style="left:66%"></s><s style="left:33%"></s>' : "";
            })));
        let d = t.combo >= 5 ? t.combo : 0;
        (r("combo", d, (x) => {
          ((k("combo").hidden = !x),
            x && ((k("comboN").textContent = "\xD7" + x), k("combo").classList.toggle("hot", x >= 25)));
        }),
          d &&
            r("comboT", Math.round(t.comboT * 20), (x) => {
              k("comboBar").style.transform = `scaleX(${Lt(x / 44, 0, 1)})`;
            }));
        let f = s.dashCd > 0 ? Math.round((n.dashCdT / s.dashCd) * 100) : 0;
        (r("dash", f, (x) => {
          let m = k("dashBtn");
          (m.style.setProperty("--p", x + "%"), m.style.setProperty("--q", 100 - x + "%"));
          let g = x > 0;
          (m.classList.contains("cooling") &&
            !g &&
            (m.classList.remove("pop"),
            m.offsetWidth,
            m.classList.add("pop"),
            t.state === "fight" && this.g.sound.play("ready")),
            m.classList.toggle("cooling", g));
        }),
          r("dashSec", n.dashCdT > 0.25 ? n.dashCdT.toFixed(1) : "", (x) => {
            k("dashSec").textContent = x;
          }));
        let p = Math.floor(n.nova);
        r("nova", p, (x) => {
          (k("novaBtn").style.setProperty("--p", x + "%"), k("novaBtn").classList.toggle("ready", x >= 100));
        });
      }
      buffs(t) {
        let e = t.player,
          n = t.stats,
          s = [];
        (n.bloodrush && e.rushN > 0 && s.push(["rush", `RUSH \xD7${e.rushN}`, "#ff5a7a", e.rushT / 4]),
          t.chronoT > 0 && s.push(["chrono", "SLOW-MO", "#8fe8ff", t.chronoT / 2]),
          (t.ws.revive || 0) > 0 && !t.revived && s.push(["life", "2ND LIFE", "#6dff8a", -1]),
          t.event &&
            t.state === "fight" &&
            s.unshift(["event", $i[t.event].name, t.event === "elite" ? "#ffc84a" : "#7ff6ff", -1]),
          e.onIce && t.state === "fight" && s.push(["ice", "ICE", "#bff4ff", -1]),
          e.inAcid && t.state === "fight" && s.push(["acid", "ACID", "#b4ff3d", -1]),
          e.slowT > 0 && s.push(["chill", "CHILLED", "#aee8ff", e.slowT / 1.6]));
        let r = s.map((o) => o[0] + o[1]).join("|"),
          a = k("buffs");
        this.hudCache.buffKey !== r &&
          ((this.hudCache.buffKey = r),
          (a.innerHTML = s
            .map(
              ([o, c, h, l]) =>
                `<span class="buff" data-b="${o}" style="--bc:${h}">${c}${l >= 0 ? "<i></i>" : ""}</span>`,
            )
            .join("")));
        for (let [o, , , c] of s) {
          if (c < 0) continue;
          let h = a.querySelector(`[data-b="${o}"] i`);
          h && (h.style.transform = `scaleX(${Lt(c, 0, 1).toFixed(2)})`);
        }
      }
      showChoose(t) {
        let e = t.offerBoss;
        ((k("chooseEyebrow").textContent = e
          ? `${en[t.bossKills[t.bossKills.length - 1]] ? en[t.bossKills[t.bossKills.length - 1]].name : "BOSS"} DEFEATED`
          : `WAVE ${t.wave} CLEARED`),
          (k("chooseTitle").textContent = e ? "Claim a rare reward" : "Choose an upgrade"));
        let n = Lt(t.player.hp / t.stats.maxHp, 0, 1);
        ((k("chooseHp").style.transform = `scaleX(${n})`),
          (k("chooseHpNum").textContent = `${Math.ceil(t.player.hp)}/${t.stats.maxHp}`),
          this.renderCards(t),
          this.coverHud(!0),
          (k("choose").hidden = !1));
      }
      renderCards(t) {
        let e = k("cards");
        ((e.innerHTML = t.offer
          .map((n, s) => {
            let r = ri[n],
              a = t.up[n] || 0,
              o = r.evo
                ? "EVOLUTION"
                : r.repeat
                  ? jl[r.rarity].toUpperCase()
                  : a
                    ? `LV ${a} \u2192 ${a + 1}`
                    : `NEW \xB7 ${jl[r.rarity].toUpperCase()}`,
              c = this.evoHint(r, t),
              h = this.statDelta(n, t);
            return `<button class="card r${r.rarity}" data-pick="${n}" style="animation-delay:${s * 70}ms"><span class="cico">${Ln(r.icon)}</span><span><span class="ctop"><b>${we(r.name)}</b><span class="lv">${o}</span></span><p>${we(r.desc(a))}</p>${h}${c}</span></button>`;
          })
          .join("")),
          e.classList.add("locked"),
          clearTimeout(this.armT),
          (this.armT = setTimeout(() => e.classList.remove("locked"), 650)));
        for (let n of e.querySelectorAll("[data-pick]"))
          n.addEventListener("click", () => {
            e.classList.contains("locked") || this.g.choose(n.dataset.pick);
          });
        ((k("rerollTxt").textContent = `Reroll (${t.rerolls})`),
          (k("rerollBtn").disabled = t.rerolls <= 0),
          (k("buildStrip").innerHTML = this.buildHtml(t)));
      }
      statDelta(t, e) {
        let n = e.player,
          s = e.stats;
        if (t === "heal") {
          let o = Math.min(s.maxHp, n.hp + s.maxHp * 0.45);
          return `<small class="delta">Hull ${Math.ceil(n.hp)} \u2192 ${Math.ceil(o)}</small>`;
        }
        let r = nr(e.weapon, { ...e.up, [t]: (e.up[t] || 0) + 1 }, e.ws),
          a = [];
        for (let [o, c, h] of t_) {
          let l = c(s),
            u = c(r);
          if (!(Math.abs(l - u) < 1e-6) && (a.push(`${o} ${h(l)} \u2192 ${h(u)}`), a.length >= 2)) break;
        }
        return a.length ? `<small class="delta">${we(a.join(" \xB7 "))}</small>` : "";
      }
      evoHint(t, e) {
        if (t.evo)
          return `<small class="evo-hint">Merges ${Object.keys(t.evo)
            .map((o) => we(ri[o].name))
            .join(" + ")}</small>`;
        let n = Zi.filter((o) => o.evo && o.evo[t.id] && !e.up[o.id] && (!o.weapon || o.weapon === e.weapon)),
          s = n.find((o) => o.weapon) || n[0];
        if (!s) return "";
        let r = Object.keys(s.evo)
            .filter((o) => o !== t.id)
            .map((o) => `${ri[o].name} ${Math.min(e.up[o] || 0, s.evo[o])}/${s.evo[o]}`),
          a = `${Math.min((e.up[t.id] || 0) + 1, s.evo[t.id])}/${s.evo[t.id]}`;
        return `<small class="evo-hint">\u2192 ${we(s.name)}: this ${a} \xB7 ${we(r.join(", "))}</small>`;
      }
      hideChoose() {
        ((k("choose").hidden = !0), this.coverHud(!1));
      }
      coverHud(t) {
        ((k("hud").style.visibility = t ? "hidden" : ""),
          t && ((k("banner").innerHTML = ""), clearTimeout(this.bannerT)));
      }
      buildHtml(t) {
        let e = Zi.filter((n) => t.up[n.id] && !n.repeat);
        return e.length
          ? e
              .map(
                (n) =>
                  `<span class="bi r${n.rarity}" title="${we(n.name)}">${Ln(n.icon)}${we(n.name)}${t.up[n.id] > 1 ? " \xD7" + t.up[n.id] : ""}</span>`,
              )
              .join("")
          : '<span class="note">No upgrades yet.</span>';
      }
      showPause(t) {
        ((k("pauseTitle").textContent = `Wave ${t.wave}${t.endless ? " \xB7 Endless" : ""}`),
          (k("pauseStats").innerHTML =
            `<span>${va(t.time)}</span><span>${t.kills} KILLS</span><span>${t.shards} SHARDS</span>`),
          (k("pauseBuild").innerHTML = this.buildHtml(t)),
          this.coverHud(!0),
          (k("pause").hidden = !1),
          (this.screen = "pause"));
      }
      hidePause() {
        ((k("pause").hidden = !0), (k("settings").hidden = !0), this.coverHud(!1));
      }
      showOver(t) {
        k("overEyebrow").textContent = t.win
          ? `${si[t.threat].name.toUpperCase()} \xB7 ALL ${20} WAVES`
          : `${ue[t.weapon].name.toUpperCase()} \xB7 ${si[t.threat].name.toUpperCase()}`;
        let e = k("overTitle");
        ((e.textContent = t.win ? "RIFT SEALED" : t.abandoned ? "RUN ENDED" : "SIGNAL LOST"),
          (e.className = "over-title " + (t.win ? "win" : "lose")),
          (k("overBest").hidden = !(t.best || t.fastest)),
          (k("overBest").textContent = t.fastest && !t.best ? "NEW FASTEST" : "NEW BEST"));
        let n = t.killer ? Ae[t.killer] || en[t.killer] : null;
        ((k("overCause").hidden = !n && t.killer !== "lava" && t.killer !== "acid"),
          n
            ? (k("overCause").textContent = `Destroyed by ${en[t.killer] ? n.name : "a " + n.name}`)
            : t.killer === "lava"
              ? (k("overCause").textContent = "Burned by a lava vent")
              : t.killer === "acid" && (k("overCause").textContent = "Dissolved in acid"),
          (k("overStats").innerHTML = [
            ["Wave", t.wave],
            ["Time", va(t.time)],
            ["Kills", t.kills],
            ["Bosses", t.bosses],
          ]
            .map(([s, r]) => `<div class="cell"><div class="k">${s}</div><div class="v">${r}</div></div>`)
            .join("")),
          (k("payRows").innerHTML = t.rows
            .map(([s, r]) => `<div class="pay-row"><span>${we(s)}</span><span class="num">${we(r)}</span></div>`)
            .join("")),
          (k("overMs").innerHTML =
            (t.unlocks || []).map((s) => `<span class="chip">${Ln("star")} ${we(s)}</span>`).join("") +
            t.milestones.map((s) => `<span class="chip">${Ln("trophy")} Milestone ready: ${we(s)}</span>`).join("")),
          this.renderDamage(t),
          (k("endlessBtn").hidden = !t.canEndless),
          (k("retryBtn").hidden = t.canEndless),
          (k("over").hidden = !1),
          this.countUp(k("payTotal"), t.total));
      }
      renderDamage(t) {
        let e = k("overDmg"),
          n = t.dmgSrc || {},
          s = Object.entries(n)
            .filter(([, h]) => h >= 1)
            .sort((h, l) => l[1] - h[1]),
          r = s.reduce((h, [, l]) => h + l, 0);
        if (((e.hidden = !s.length || r < 50), e.hidden)) return;
        let a = s.slice(0, 4),
          o = s.slice(4).reduce((h, [, l]) => h + l, 0);
        o > 0 && a.push(["other", o]);
        let c = a[0][1];
        e.innerHTML =
          '<div class="dh">Damage dealt</div>' +
          a
            .map(([h, l]) => {
              let u = h === "weapon" ? t.weaponName : Hl[h] ? Hl[h][0] : "Other",
                d =
                  h === "weapon"
                    ? "#" + ue[t.weapon].color.toString(16).padStart(6, "0")
                    : Hl[h]
                      ? Hl[h][1]
                      : "#93a2bf",
                f = Math.round((l / r) * 100);
              return `<div class="dmg-row" style="--dc:${d}"><span>${we(u)}</span><span class="num">${qn(l)} \xB7 ${f}%</span><span class="db"><i style="transform:scaleX(${(l / c).toFixed(3)})"></i></span></div>`;
            })
            .join("");
      }
      hideOver() {
        k("over").hidden = !0;
      }
      countUp(t, e) {
        let n = performance.now(),
          s = 900,
          r = (a) => {
            let o = Lt((a - n) / s, 0, 1);
            ((t.textContent = qn(Math.round(e * (1 - Math.pow(1 - o, 3))))), o < 1 && requestAnimationFrame(r));
          };
        requestAnimationFrame(r);
      }
      showCrash(t) {
        for (let e of ["choose", "pause", "over"]) k(e).hidden = !0;
        (this.showHud(!1), (k("crashLog").value = t), (k("crash").hidden = !1));
      }
      hideCrash() {
        k("crash").hidden = !0;
      }
      hurtFlash() {
        if (this.calm) return;
        let t = k("flash");
        (t.classList.add("on"), requestAnimationFrame(() => requestAnimationFrame(() => t.classList.remove("on"))));
      }
      setUpdate(t) {
        k("updateBar").hidden = !t;
      }
    };
  var kh = "riftline.save.v1",
    Oh = {
      sfx: 0.8,
      music: 0.45,
      autoFire: !0,
      assist: !0,
      shake: !0,
      numbers: !0,
      quality: "auto",
      swap: !1,
      zoom: 1,
      contrast: !1,
      calm: !1,
      // 2.4.2: optional HUD readouts
      timer: !1,
      fps: !1,
    };
  function zh() {
    return {
      v: 1,
      game: "riftline",
      created: Date.now(),
      savedAt: 0,
      shards: 0,
      weapon: "pulse",
      weapons: { pulse: !0 },
      threat: 0,
      threatMax: 0,
      workshop: {},
      milestones: {},
      stats: {
        runs: 0,
        kills: 0,
        bestWave: 0,
        clears: 0,
        deaths: 0,
        bosses: {},
        clearsBy: {},
        bestBy: {},
        legendaries: 0,
        flawless: 0,
        bestClearThreat: -1,
        shardsEarned: 0,
        playTime: 0,
        bestTime: 0,
        evolved: 0,
        bestCombo: 0,
      },
      settings: { ...Oh },
      run: null,
      history: [],
      seen: {},
    };
  }
  var ni = (i, t, e = -1 / 0, n = 1 / 0) =>
      typeof i == "number" && Number.isFinite(i) ? Math.min(n, Math.max(e, i)) : t,
    e_ = (i, t) => (typeof i == "boolean" ? i : t),
    Hi = (i) => (i && typeof i == "object" && !Array.isArray(i) ? i : {});
  function sr(i) {
    if (
      !i ||
      typeof i !== "object" ||
      i.v !== 1 ||
      !ue[i.weapon] ||
      !Number.isFinite(i.wave) ||
      i.wave < 1 ||
      i.wave > 999 ||
      !Number.isFinite(i.hp) ||
      i.hp <= 0
    )
      return null;
    const o = {
      v: 1,
      seed: Number.isFinite(i.seed) ? i.seed >>> 0 : 0,
      weapon: i.weapon,
      threat: Math.floor(ni(i.threat, 0, 0, 5)),
      wave: Math.floor(ni(i.wave, 1, 1, 999)),
      endless: !!i.endless,
      up: {},
      hp: Math.max(1, Math.round(ni(i.hp, 1, 1, 1e6))),
      shards: Math.floor(ni(i.shards, 0, 0, 1e9)),
      kills: Math.floor(ni(i.kills, 0, 0, 1e9)),
      time: ni(i.time, 0, 0, 1e8),
      rerolls: Math.floor(ni(i.rerolls, 0, 0, 99)),
      revived: !!i.revived,
      nova: Math.floor(ni(i.nova, 0, 0, 100)),
      bossKills: [],
      flawless: Math.floor(ni(i.flawless, 0, 0, 1e6)),
      legendaries: Math.floor(ni(i.legendaries, 0, 0, 1e6)),
      dmgDealt: Math.floor(ni(i.dmgDealt, 0, 0, 1e12)),
      bestCombo: Math.floor(ni(i.bestCombo, 0, 0, 1e6)),
      evolved: Math.floor(ni(i.evolved, 0, 0, 1e6)),
      runStats: { dmgTaken: 0, dashes: 0, critHits: 0 },
      dmgSrc: {},
    };
    const rawUp = Hi(i.up);
    for (const d of Zi) {
      const v = Math.floor(ni(rawUp[d.id], 0, 0, d.max));
      if (v) o.up[d.id] = v;
    }
    const rawBoss = Array.isArray(i.bossKills) ? i.bossKills : [];
    o.bossKills = [...new Set(rawBoss.filter((v) => typeof v === "string" && Kl.includes(v)))];
    const rs = Hi(i.runStats);
    ((o.runStats.dmgTaken = Math.floor(ni(rs.dmgTaken, 0, 0, 1e12))),
      (o.runStats.dashes = Math.floor(ni(rs.dashes, 0, 0, 1e7))),
      (o.runStats.critHits = Math.floor(ni(rs.critHits, 0, 0, 1e9))));
    const src = Hi(i.dmgSrc);
    for (const k in src) if (/^[A-Za-z0-9_-]{1,18}$/.test(k)) o.dmgSrc[k] = Math.floor(ni(src[k], 0, 0, 1e12));
    if (Array.isArray(i.offer)) {
      const offer = [...new Set(i.offer.filter((v) => typeof v === "string" && !!ri[v]))].slice(0, 4);
      if (offer.length) ((o.offer = offer), (o.offerBoss = !!i.offerBoss));
    }
    return o;
  }
  function ap(i) {
    let t = zh(),
      e = Hi(i),
      n = t;
    ((n.created = ni(e.created, t.created)),
      (n.savedAt = ni(e.savedAt, 0)),
      (n.shards = Math.floor(ni(e.shards, 0, 0, 1e9))));
    for (let c in ue) Hi(e.weapons)[c] === !0 && (n.weapons[c] = !0);
    ((n.weapons.pulse = !0),
      (n.weapon = ue[e.weapon] && n.weapons[e.weapon] ? e.weapon : "pulse"),
      (n.threatMax = Math.floor(ni(e.threatMax, 0, 0, 5))),
      (n.threat = Math.floor(ni(e.threat, 0, 0, n.threatMax))));
    for (let c of ai) {
      let h = Math.floor(ni(Hi(e.workshop)[c.id], 0, 0, c.costs.length));
      h && (n.workshop[c.id] = h);
    }
    for (let c of _i) Hi(e.milestones)[c.id] === !0 && (n.milestones[c.id] = !0);
    let s = Hi(e.stats),
      r = t.stats;
    for (let c of [
      "runs",
      "kills",
      "bestWave",
      "clears",
      "deaths",
      "legendaries",
      "flawless",
      "shardsEarned",
      "playTime",
      "bestTime",
      "evolved",
      "bestCombo",
    ])
      r[c] = ni(s[c], 0, 0, 1e12);
    r.bestClearThreat = Math.floor(ni(s.bestClearThreat, -1, -1, 5));
    for (let c of ["bosses", "clearsBy", "bestBy"]) {
      let h = Hi(s[c]);
      for (let l in h) /^[a-z]{2,12}$/.test(l) && (r[c][l] = ni(h[l], 0, 0, 1e9));
    }
    let a = Hi(e.settings);
    for (let c in Oh) {
      let h = Oh[c];
      typeof h == "boolean"
        ? (n.settings[c] = e_(a[c], h))
        : typeof h == "number"
          ? (n.settings[c] = rlSettingNum(c, a[c], h))
          : (n.settings[c] = ["auto", "high", "battery"].includes(a[c]) ? a[c] : h);
    }
    n.run = sr(e.run);
    n.history = rlSanitizeHistory(e.history);
    let o = Hi(e.seen);
    for (let c in o) o[c] === !0 && (n.seen[c] = !0);
    return n;
  }
  var Ks = {
      ok: null,
      get(i) {
        try {
          return globalThis.localStorage ? localStorage.getItem(i) : null;
        } catch {
          return ((this.ok = !1), null);
        }
      },
      set(i, t) {
        try {
          return (localStorage.setItem(i, t), (this.ok = !0), !0);
        } catch (e) {
          return (this.ok !== !1 && ze("storage", e), (this.ok = !1), !1);
        }
      },
      del(i) {
        try {
          localStorage.removeItem(i);
        } catch {}
      },
    },
    Vl = class {
      constructor() {
        this.listeners = new Set();
        let t = null,
          e = Ks.get(kh);
        if (e && e.length <= 262144)
          try {
            t = JSON.parse(e);
          } catch (n) {
            ze("load", n);
          }
        e && (!t || typeof t != "object") && rlBackupSave(e);
        ((this.data = t && typeof t == "object" ? rlLoadSave(t) : zh()),
          (this.persistent = Ks.get(kh) !== null || Ks.set("riftline.probe", "1")),
          Ks.del("riftline.probe"));
      }
      get storageOk() {
        return Ks.ok !== !1;
      }
      onChange(t) {
        this.listeners.add(t);
      }
      save(t) {
        this.data.savedAt = Date.now();
        let e = JSON.stringify(this.data);
        Ks.set(kh, e);
        for (let n of this.listeners)
          try {
            n(e, t);
          } catch (s) {
            ze("save-listener", s);
          }
      }
      parse(t) {
        let e,
          r = String(t ?? "").trim();
        if (!r || r.length > 262144) return { ok: !1 };
        try {
          e = JSON.parse(r);
        } catch {
          return { ok: !1 };
        }
        return !e || e.game !== "riftline" || e.v !== 1 ? { ok: !1 } : { ok: !0, data: ap(e) };
      }
      reset() {
        let t = this.data.settings;
        ((this.data = zh()), (this.data.settings = t), this.save("reset"));
      }
    };
  var ua = !0,
    Hh = __RL_BUILD__,
    lp =
      typeof navigator < "u" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)),
    _S =
      typeof window < "u" &&
      ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        window.navigator.standalone === !0);
  function hp(i) {
    !ua ||
      !("serviceWorker" in navigator) ||
      (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") ||
      (navigator.serviceWorker
        .register("./sw.js", { scope: "./", updateViaCache: "none" })
        .then((t) => {
          let e = !!navigator.serviceWorker.controller,
            n = (r) => {
              !r ||
                !navigator.serviceWorker.controller ||
                i(() => {
                  let a = !1,
                    o = () => {
                      a || ((a = !0), location.reload());
                    };
                  (navigator.serviceWorker.addEventListener("controllerchange", o),
                    r.postMessage("skipWaiting"),
                    setTimeout(o, 4e3));
                });
            };
          (t.waiting && e && n(t.waiting),
            t.addEventListener("updatefound", () => {
              let r = t.installing;
              r &&
                r.addEventListener("statechange", () => {
                  r.state === "installed" && n(r);
                });
            }));
          let s = () => t.update().catch(() => {});
          (document.addEventListener("visibilitychange", () => {
            document.visibilityState === "visible" && s();
          }),
            window.addEventListener("online", s),
            setInterval(s, 900 * 1e3));
        })
        .catch((t) => ze("sw", t)),
      navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}));
  }
  var Gi = null,
    up = !1;
  async function Vi(i) {
    up = i;
    try {
      i && !Gi && navigator.wakeLock && document.visibilityState === "visible"
        ? ((Gi = await navigator.wakeLock.request("screen")),
          Gi.addEventListener("release", () => {
            Gi = null;
          }))
        : !i && Gi && (await Gi.release(), (Gi = null));
    } catch {
      Gi = null;
    }
  }
  typeof document < "u" &&
    document.addEventListener("visibilitychange", () => {
      document.visibilityState === "visible" && up && Vi(!0);
    });
  var dp = document.getElementById("nojs");
  dp && dp.remove();
  Zl({ version: _a, build: Hh, mode: ua ? "standalone" : "artifact" });
  window.addEventListener("error", (i) => ze("window", i));
  window.addEventListener("unhandledrejection", (i) => ze("promise", i.reason || i));
  var Wh = {
      high: { dpr: 2, particles: 1400, fps: 0 },
      battery: { dpr: 1, particles: 500, fps: 30 },
      auto: { dpr: 1.5, particles: 1400, fps: 0 },
    },
    ee = (rlApplyDataFixes(), new Vl()),
    Be = new zl(),
    hs = (i) => document.getElementById(i),
    oe = null;
  try {
    oe = new Bl(hs("gl"), { dpr: 1.5 });
    let i = oe.renderer.getContext(),
      t = i.getExtension("WEBGL_debug_renderer_info");
    Zl({ gpu: t ? i.getParameter(t.UNMASKED_RENDERER_WEBGL) : "n/a" });
  } catch (i) {
    ze("webgl", i);
  }
  hs("gl").addEventListener("webglcontextlost", () => ze("webgl", "context lost"));
  hs("gl").addEventListener("webglcontextrestored", () => ze("webgl", "context restored"));
  let _resizeRaf = 0,
    _resizeWhy = "resize",
    _resizeFollowTimer = 0;
  function _resetInputForViewportChange() {
    try {
      ln && (ln.move.active || ln.aim.active) && ln.reset();
    } catch (t) {
      ze("input-reset", t);
    }
  }
  function _scheduleResize(i) {
    ((_resizeWhy = i),
      _resizeRaf ||
        (_resizeRaf = requestAnimationFrame(() => {
          _resizeRaf = 0;
          try {
            oe && oe.resize(!0);
          } catch (t) {
            ze(_resizeWhy, t);
          }
        })));
  }
  window.addEventListener(
    "resize",
    () => {
      (_resetInputForViewportChange(), _scheduleResize("resize"));
    },
    { passive: !0 },
  );
  window.addEventListener(
    "orientationchange",
    () => {
      (_resetInputForViewportChange(),
        _scheduleResize("orientation"),
        clearTimeout(_resizeFollowTimer),
        (_resizeFollowTimer = setTimeout(() => {
          ((_resizeFollowTimer = 0), _scheduleResize("orientation-follow"));
        }, 120)));
    },
    { passive: !0 },
  );
  window.visualViewport &&
    window.visualViewport.addEventListener(
      "resize",
      () => {
        (_resetInputForViewportChange(), _scheduleResize("viewport"));
      },
      { passive: !0 },
    );
  var Qs = new kl(hs("ov")),
    ln = new Ol(hs("touch"), oe),
    ft = {
      store: ee,
      sound: Be,
      input: ln,
      renderer: oe,
      mode: "menu",
      world: null,
      paused: !1,
      previewW: ee.data.weapon,
      buildId: Hh,
      chooseShown: !1,
      overShown: !1,
      slowMo: 0,
      pendingUpdate: null,
      cloud: null,
      startRun({ resume: i }) {
        let t = ee.data,
          e = i ? t.run : null;
        i || t.stats.runs++;
        try {
          this.world = new Aa({
            seed: (Math.random() * 4294967296) >>> 0,
            weapon: t.weapon,
            threat: t.threat,
            ws: t.workshop,
            snap: e,
          });
        } catch (n) {
          (ze("start", n),
            (t.run = null),
            ee.save("bad-run"),
            Ft.alert("Could not start", "The saved run could not be restored and was discarded."));
          return;
        }
        ((this.mode = "game"),
          (this.paused = !1),
          (this.chooseShown = !1),
          (this.overShown = !1),
          (this.acc = 0),
          (this.slowMo = 0),
          (this.intro = null),
          (RL_RT.runStartMs = Date.now()),
          (RL_RT.runErrorSnapshot = Xn.map((e) => `${e.where}|${e.msg}|${e.n}`)),
          oe && oe.focusOn(null),
          (this.hintT = 0),
          Ft.hideMenus(),
          Ft.hideOver(),
          Ft.hideChoose(),
          Ft.hidePause(),
          Ft.hideCrash(),
          Ft.showHud(!0),
          ln.reset(),
          (ln.enabled = !0),
          (ft.freeze = 0),
          (ft.tut =
            !ee.data.seen.tutorial && !i && this.world.wave === 1
              ? { step: 0, t: 0, moved: 0, kills: 0, dashed: !1 }
              : null),
          ft.tut && (this.world.hold = !0),
          Ft.coach(null),
          oe && oe.resetCamera(),
          Be.setMusic("fight", this.world.biomeFor(this.world.wave).id),
          Vi(!0));
      },
      choose(i) {
        let t = this.world;
        !t || !t.choose(i) || ((this.chooseShown = !1), Ft.hideChoose(), ln.reset());
      },
      reroll() {
        let i = this.world;
        i && i.reroll() && (Ft.renderCards(i), Be.play("pick"), (ee.data.run = i.snapshot()), ee.save("reroll"));
      },
      pause() {
        let i = this.world;
        this.mode !== "game" ||
          !i ||
          this.paused ||
          this.overShown ||
          (i.state !== "fight" && i.state !== "cleared") ||
          ((this.paused = !0), ln.reset(), Ft.showPause(i), Be.setMusic("menu"), ee.save("pause"), Vi(!1));
      },
      resume() {
        this.paused &&
          ((this.paused = !1),
          Ft.hidePause(),
          ln.reset(),
          (this.last = performance.now()),
          Vi(!0),
          this.world && Be.setMusic(this.world.boss ? "boss" : "fight", this.world.biomeFor(this.world.wave).id));
      },
      restart() {
        (Ft.hidePause(), (this.paused = !1), this.endRun(!1, !0, !0), this.startRun({}));
      },
      abandon() {
        (Ft.hidePause(), (this.paused = !1), this.endRun(!1, !0));
      },
      endless() {
        let i = this.world;
        !i ||
          i.state !== "victory" ||
          (Ft.hideOver(),
          (this.overShown = !1),
          (i.shards = 0),
          (i.kills = 0),
          (i.bossKills = []),
          (i.legendaries = 0),
          (i.flawless = 0),
          (i.time = 0),
          (i.evolved = 0),
          (i.dmgSrc = {}),
          i.continueEndless(),
          Ft.showHud(!0),
          (this.chooseShown = !1));
      },
      goHome() {
        ((this.mode = "menu"),
          (this.world = null),
          (this.paused = !1),
          Ft.hideOver(),
          Ft.hideChoose(),
          Ft.hidePause(),
          Ft.showHud(!1),
          (Ft.homeInit = !1),
          Ft.show("home"),
          Be.setMusic("menu"),
          Vi(!1),
          this.pendingUpdate && Ft.setUpdate(!0));
      },
      discardRun() {
        ((ee.data.run = null), ee.save("discard"));
      },
      recover() {
        (Ft.hideCrash(), (this.crashed = !1), this.goHome(), xp());
      },
      endRun(i, t = !1, e = !1) {
        let n = this.world,
          s = ee.data,
          r = s.stats;
        if (!n || this.overShown) return;
        this.overShown = !0;
        rlRunAudit(n, i, t);
        let a = Ma(n.threat),
          o = 1 + 0.1 * (s.workshop.salvage || 0),
          c = n.shards,
          h = i ? Math.round(c * 0.25) : 0,
          l = Math.round((c + h) * a.shards * o),
          u = [["Collected", c]];
        (h && u.push(["Clear bonus +25%", "+" + h]),
          n.threat > 0 && u.push([`${si[n.threat].name} \xD7${a.shards.toFixed(2)}`, "\xD7"]),
          o > 1 && u.push([`Salvager \xD7${o.toFixed(1)}`, "\xD7"]));
        let d = new Set(this.claimable()),
          f = [],
          p = i ? 20 : n.wave,
          x = p > r.bestWave,
          y = i && !n.endless && n.time > 0 && (r.bestTime <= 0 || n.time < r.bestTime);
        ((r.bestWave = Math.max(r.bestWave, p)),
          y && (r.bestTime = n.time),
          (r.bestBy[n.weapon] = Math.max(r.bestBy[n.weapon] || 0, p)),
          (r.kills += n.kills),
          (r.playTime += n.time),
          (r.shardsEarned += l),
          (r.legendaries += n.legendaries),
          (r.flawless += n.flawless),
          (r.evolved += n.evolved),
          (r.bestCombo = Math.max(r.bestCombo, n.bestCombo)));
        for (let g of n.bossKills) r.bosses[g] = (r.bosses[g] || 0) + 1;
        (i && !n.endless
          ? (r.clears++,
            (r.clearsBy[n.weapon] = (r.clearsBy[n.weapon] || 0) + 1),
            (r.bestClearThreat = Math.max(r.bestClearThreat, n.threat)),
            n.threat >= s.threatMax &&
              s.threatMax < 5 &&
              ((s.threatMax = n.threat + 1), f.push(`${si[s.threatMax].name} unlocked`)))
          : (r.deaths += t ? 0 : 1),
          (s.shards += l),
          (s.run = null),
          ee.save("run-end"));
        let m = this.claimable()
          .filter((g) => !d.has(g))
          .map((g) => _i.find((M) => M.id === g).name);
        if ((ft.tut && ((ee.data.seen.tutorial = !0), (ft.tut = null), Ft.coach(null), ee.save("tutorial")), e)) {
          this.overShown = !1;
          return;
        }
        (Ft.showHud(!1),
          Ft.hideChoose(),
          Ft.showOver({
            win: i,
            abandoned: t,
            wave: p,
            time: n.time,
            kills: n.kills,
            bosses: n.bossKills.length,
            weapon: n.weapon,
            threat: n.threat,
            rows: u,
            total: l,
            best: x,
            milestones: m,
            unlocks: f,
            canEndless: i && !n.endless,
            killer: i || t ? null : n.lastHit,
            dmgSrc: n.dmgSrc,
            weaponName: ue[n.weapon].name,
            fastest: y,
          }),
          Be.setMusic("menu"),
          Vi(!1));
      },
      settingsChanged(i) {
        (Xh(), i || ee.save("settings"));
      },
      resetProgress() {
        (ee.reset(), gp("Progress reset"));
      },
      claimable() {
        let i = ee.data;
        return _i.filter((t) => !i.milestones[t.id] && t.test(i)).map((t) => t.id);
      },
      previewWeapon(i) {
        this.previewW = i;
      },
      applyUpdate() {
        (ee.save("update"), this.pendingUpdate && this.pendingUpdate());
      },
    };
  ft.qualityNote = () => {
    let i = ee.data.settings,
      t = oe ? oe.dpr.toFixed(2).replace(/0$/, "") : "-";
    return i.quality === "auto"
      ? `Adapts to your device (now ${t}\xD7)`
      : i.quality === "battery"
        ? "Lower resolution, 30 fps"
        : `Sharpest (${t}\xD7)`;
  };
  function gp(i) {
    ((Ft.homeInit = !1), Xh(), Ft.screen === "settings" && Ft.renderSettings(), Ft.toast(i));
  }
  (() => {
    const baseStep = Aa.prototype.step,
      baseHurt = Aa.prototype.hurtPlayer,
      baseKill = Aa.prototype.killEnemy;
    Aa.prototype.step = function (dt, input) {
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
    Aa.prototype.hurtPlayer = function (dmg, x, y, src, chip) {
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
    Aa.prototype.killEnemy = function (enemy) {
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

  (() => {
    addEventListener(
      "orientationchange",
      () => {
        RL_RT.orientationChanges++;
      },
      { passive: true },
    );
    document.addEventListener(
      "pointerup",
      (e) => {
        const b = e.target?.closest?.("button,[role=button],a");
        if (b && !b.disabled) {
          RL_RT.buttonActivations++;
          RL_RT.lastButton = (b.id || b.dataset.go || b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
        }
      },
      true,
    );
  })();

  (() => {
    const _show = Gl.prototype._show;
    Gl.prototype._show = function (screen) {
      const r = _show.call(this, screen);
      requestAnimationFrame(() => window.__riftLayoutAudit?.());
      return r;
    };
  })();
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
  var Ft = new Gl(ft);
  ft.ui = Ft;
  ln.onBlur = () => {
    ft.mode === "game" && ft.pause();
  };
  ln.isPlaying = () => ft.mode === "game" && !ft.paused && !ft.chooseShown && !ft.overShown;
  ln.onPause = () => {
    if (!document.getElementById("dialog").hidden) {
      Ft.closeDialog(null);
      return;
    }
    ft.mode === "game" && (ft.paused ? ft.resume() : ft.pause());
  };
  var pa = Wh.auto,
    js = 1.5;
  function Xh() {
    let i = ee.data.settings;
    if (
      (Be.setVolumes(i.sfx, i.music),
      (ln.swap = i.swap),
      Ft.setSwap(i.swap),
      (pa = Wh[i.quality] || Wh.auto),
      (Qs.contrast = i.contrast),
      (Ft.calm = i.calm),
      oe)
    ) {
      (oe.setAccess(i.contrast, i.calm), (oe.zoom = i.zoom || 1));
      let t = i.quality === "auto" ? js : pa.dpr;
      oe.setQuality(t, pa.particles);
    }
  }
  var ma = 0,
    Gh = 0,
    da = 0,
    Wl = 0,
    Vh = 0,
    fp = 0,
    menuFrame = 0;
  function xp() {
    ma || ((ft.last = performance.now()), (ma = requestAnimationFrame(yp)));
  }
  function yp(i) {
    ma = requestAnimationFrame(yp);
    let t = (i - (ft.last || i)) / 1e3;
    if (!(pa.fps && t < 1 / pa.fps - 0.004)) {
      ((ft.last = i), (t = Math.min(0.1, Math.max(0, t))));
      try {
        const w0 = performance.now();
        (i_(t), (Gh = 0));
        if (RL_MON)
          try {
            rlMonFrame(performance.now() - w0);
          } catch {}
      } catch (e) {
        (Gh++,
          ze("frame", e),
          Gh >= 3 &&
            (cancelAnimationFrame(ma), (ma = 0), (ft.crashed = !0), Vi(!1), rlMonCrashed(), Ft.showCrash(tr())));
      }
    }
  }
  function i_(i) {
    let t = ee.data.settings,
      e = ft.world;
    if (ft.mode === "game" && e) {
      if (!ft.paused && document.visibilityState !== "hidden") {
        let n = ft.slowMo > 0 ? 0.35 : 1;
        ft.slowMo = Math.max(0, ft.slowMo - i);
        let s = ft.speed || 1;
        ft.intro ? a_(i, e) : ft.freeze > 0 ? (ft.freeze -= i) : (ft.acc += i * n * s);
        let r = 0,
          a = 5 * s;
        for (; ft.acc >= rlStep && r < a; ) (e.step(rlStep, ln.sample(e, t)), (ft.acc -= rlStep), r++);
        (r >= a && (ft.acc = 0),
          r_(e),
          rlIntroEvents(e),
          l_(i, e),
          o_(i, e),
          Be.setIntensity(
            e.state === "fight"
              ? e.enemies.length / 34 +
                  e.eb.length / 90 +
                  (e.boss ? 0.4 : 0) +
                  (e.player.hp / e.stats.maxHp < 0.3 ? 0.2 : 0)
              : 0,
          ),
          c_(i, t));
      }
      if (ft.paused) return;
      if (oe) {
        (oe.consume(e.fx, e, t), oe.mapChanged && ((oe.mapChanged = !1), Be.play("rumble")));
        let n = ft.chooseShown || ft.overShown;
        (!n || (fp = (fp + 1) % 3) === 0) && oe.frame(n ? i * 3 : i, e);
      }
      if ((Be.consume(e.fx), (e.fx.length = 0), oe && !(ft.chooseShown || ft.overShown))) {
        // 2.3.6: the "DRAG HERE TO MOVE" hints follow the input in use (like the coach texts since
        // 2.3.4); on a laptop with a touch screen they showed while playing with keys and mouse.
        let n = !!ft.tut && ft.tut.step <= 1 && RL_INPUT.touch;
        Qs.draw(oe, e, ln, { hints: n, dt: i, safe: h_() });
      } else Qs.clear();
      (Ft.hud(e),
        e.state === "choose" &&
          !ft.chooseShown &&
          !ft.overShown &&
          ((ft.chooseShown = !0), ln.reset(), Ft.showChoose(e)),
        e.state === "dead" && e.stateT > 1.5 && !ft.overShown && ft.endRun(!1),
        e.state === "victory" && e.stateT > 0.8 && !ft.overShown && ft.endRun(!0));
    } else
      (oe &&
        (menuFrame = (menuFrame + 1) & 1) === 0 &&
        oe.frame(i, null, { menu: !0, weapon: ft.previewW, biome: ii[s_()] }),
        Qs.clear());
  }
  function s_() {
    let i = ee.data.stats.bestWave;
    return Math.min(ii.length - 1, Math.floor(Math.max(0, i - 1) / 5));
  }
  function r_(i) {
    for (let t of i.fx)
      switch (t.k) {
        case "wave": {
          ((ee.data.run = i.snapshot()), ee.save("wave"));
          let e = i.biomeFor(t.n);
          oe && oe.resetCamera();
          let n = t.n === 1 || i.biomeFor(t.n - 1).id !== e.id;
          if (t.event) {
            let s = $i[t.event];
            (Ft.banner(s.name, `Wave ${t.n} \xB7 ${s.desc}`, "good", 2600), Be.play("event"));
          } else
            Ft.banner(
              t.boss ? "WARNING" : `WAVE ${t.n}`,
              t.boss ? "Boss signature detected" : n ? rlBiomeTitle(e) : i.endless ? "Endless" : "",
              t.boss ? "boss" : "",
              2e3,
            );
          (!t.boss &&
            i.arena.vents.length &&
            Gn("lava", "Lava vents glow before they erupt. Lure enemies onto them \u2014 they burn too."),
            !t.boss && i.arena.ice.length && Gn("ice", "Cryo Vault: the whole floor is slick, the ice sheets even more \u2014 enemies slide on them too."),
            !t.boss &&
              i.arena.acid.length &&
              Gn("acid", "Acid pools eat at your hull \u2014 but enemies standing in them take 25% more damage."),
            !t.boss &&
              i.arena.portals.length &&
              Gn("portal", "Portals move you across the arena. Shots fly through them too."),
            Be.setMusic(t.boss ? "boss" : "fight", e.id),
            t.n === 2 &&
              Gn(
                "dash",
                rlKeys()
                  ? "Tip: SPACE dashes \u2014 it makes you untouchable for a moment."
                  : "Tip: DASH makes you untouchable for a moment.",
              ),
            t.n === 3 &&
              Gn(
                "aim",
                rlKeys()
                  ? "Tip: hold the left mouse button to aim and fire at the cursor."
                  : `Tip: drag the ${ql().aim} side to aim yourself. Holding it fires at the nearest enemy.`,
              ));
          break;
        }
        case "boss":
          (Ft.banner(t.name, t.title, "boss", 2600),
            Gn("boss", "Bosses telegraph every attack. Marked zones and lines hit hard \u2014 move out."),
            i.boss && oe && ((ft.intro = { t: 0 }), oe.focusOn(i.boss.x, i.boss.y), ln.settle()));
          break;
        case "novaReady":
          Gn(
            "nova",
            rlKeys()
              ? "NOVA is charged \u2014 press E to blast everything around you."
              : "NOVA is charged \u2014 tap it to blast everything around you.",
          );
          break;
        case "cleared":
          (Ft.banner(t.boss ? "BOSS DOWN" : "CLEARED", t.flawless ? "Flawless" : `Wave ${t.n}`, "good", 1500),
            t.boss || (ft.slowMo = Math.max(ft.slowMo, 0.45)));
          break;
        case "hurt":
          t.chip || (Ft.hurtFlash(), Qs.addHurt(i, t.sx, t.sy), fa(0.06));
          break;
        case "champion":
          (Ft.banner("CHAMPION", `A ${Ae[t.type].name} leads the pack \u2014 its allies move faster`, "warn", 2200),
            Gn("champion", "Champions rally nearby enemies. Take one down and the pack is stunned."));
          break;
        case "championDown":
          (Ft.banner("CHAMPION DOWN", "The pack is stunned", "good", 1400),
            (ft.slowMo = Math.max(ft.slowMo, 0.5)),
            fa(0.08));
          break;
        case "mend":
          Gn("mender", "Menders heal other enemies. Kill them first.");
          break;
        case "kill":
          (t.elite || t.r >= 0.8) && fa(t.elite ? 0.05 : 0.025);
          break;
        case "nova":
          fa(0.08);
          break;
        case "guardBreak":
          fa(0.03);
          break;
        case "bossAtk":
          Qs.callout(t.atk);
          break;
        case "offer":
          ((ee.data.run = i.snapshot()), ee.save("offer"));
          break;
        case "combo":
          Ft.comboPop(t.n, t.bonus);
          break;
        case "salvagePulse":
          Ft.toast(`SALVAGE PULSE · +${t.amount} shards`, "good", 1800);
          break;
        case "bountyPulse":
          Ft.toast(`BOUNTY · +${t.amount} shards`, "good", 1500);
          break;
        case "pick":
          t.evo && Ft.banner("EVOLVED", ri[t.id].name, "good", 1800);
          break;
        case "dash":
          ft.tut && (ft.tut.dashed = !0);
          break;
        case "enrage":
          Ft.banner("ENRAGED", "", "warn", 1400);
          break;
        case "phase":
          Ft.banner(`PHASE ${t.n}`, "The core adapts", "warn", 1600);
          break;
        case "bossDown":
          ft.slowMo = 1.1;
          break;
        case "revive":
          Ft.banner("SECOND LIFE", "Hull restored", "good", 1600);
          break;
        case "die":
          Be.setMusic("off");
          break;
        case "victory":
          Be.setMusic("menu");
          break;
      }
  }
  var pp = 1.5;
  function a_(i, t) {
    let e = ft.intro;
    ((e.t += i),
      oe && (oe.focusK = e.t / pp),
      (e.t >= pp || !t.boss) &&
        ((ft.intro = null),
        oe && oe.focusOn(null),
        t.boss && (t.boss.spawnT = Math.min(t.boss.spawnT, 0.1)),
        ln.settle(),
        (ft.acc = 0)));
  }
  function fa(i) {
    let t = performance.now();
    t - (ft.lastStop || 0) < 180 || ((ft.lastStop = t), (ft.freeze = Math.max(ft.freeze || 0, i)));
  }
  var Xl = 0;
  function o_(i, t) {
    let e = t.player;
    if (t.state !== "fight" || !e.alive || e.hp / t.stats.maxHp >= 0.25) {
      Xl = 0;
      return;
    }
    ((Xl -= i), Xl <= 0 && ((Xl = 0.95), Be.play("heart")));
  }
  var ql = () => (ee.data.settings.swap ? { move: "right", aim: "left" } : { move: "left", aim: "right" }),
    // 2.3.4: keyboard/mouse players got the touch texts ("drag the left side"), which do nothing
    // with a mouse, and the keys were explained nowhere. Every step now has both wordings and
    // follows the input in use (the coach re-reads the text every frame).
    rlKeys = () => !RL_INPUT.touch,
    mp = [
      () => (rlKeys() ? "Move with W A S D or the arrow keys." : `Drag anywhere on the ${ql().move} side to move.`),
      () =>
        rlKeys()
          ? "Enemies! Your drone fires on its own \u2014 hold the left mouse button to aim yourself."
          : `Enemies! Your drone fires on its own \u2014 drag the ${ql().aim} side to aim yourself.`,
      () => (rlKeys() ? "Press SPACE to dash through danger." : "Tap DASH to dodge through danger."),
      () => "Grab the shards \u2014 they buy permanent upgrades in the Workshop.",
    ];
  function l_(i, t) {
    let e = ft.tut;
    if (e) {
      if (
        ((e.t += i),
        e.step === 0
          ? (Math.hypot(t.player.vx, t.player.vy) > 2 && (e.moved += i),
            (e.moved > 1.1 || e.t > 12) && ((e.step = 1), (e.t = 0), (t.hold = !1), (e.k0 = t.kills)))
          : e.step === 1
            ? (t.kills - e.k0 >= 4 || e.t > 20) && ((e.step = 2), (e.t = 0), (e.dashed = !1))
            : e.step === 2
              ? (e.dashed || e.t > 14) && ((e.step = 3), (e.t = 0))
              : e.step === 3 && e.t > 5 && (e.step = 4),
        e.step >= 4 || t.state !== "fight")
      ) {
        ((ft.tut = null), (t.hold = !1), Ft.coach(null));
        let n = ee.data.seen;
        ((n.tutorial = !0), (n.tip_dash = !0), (n.tip_aim = !0), ee.save("tutorial"));
        return;
      }
      Ft.coach(e.step, mp.length, mp[e.step]());
    }
  }
  function Gn(i, t) {
    let e = ee.data.seen;
    e["tip_" + i] || ((e["tip_" + i] = !0), ee.save("tip"), Ft.toast(t, "", 5200));
  }
  // 2.4.2: Auto quality also steps back up. Before, two slow windows (a stutter at the start of
  // a run is enough) lowered the resolution until the next reload. It now rises again one step
  // after 20 s at 57+ fps. A level it had to leave twice becomes the ceiling for the session, so
  // a device at its limit does not flip between two levels.
  let rlQUp = 0,
    rlQCeil = 1.5;
  const rlQLeft = {},
    rlQParticles = (d) => (d >= 1.5 ? pa.particles : d <= 1 ? 800 : 1100);
  function c_(i, t) {
    if (t.quality !== "auto" || !oe || ((Wl += i), Vh++, Wl < 2.5)) return;
    let e = Vh / Wl;
    ((Wl = 0), (Vh = 0), e < 48 ? da++ : (da = Math.max(0, da - 1)), (rlQUp = e >= 57 ? rlQUp + 1 : 0));
    if (da >= 2 && js > 1) {
      (rlQLeft[js] && (rlQCeil = Math.min(rlQCeil, js - 0.25)), (rlQLeft[js] = !0));
      ((js = Math.max(1, js - 0.25)), (da = 0), (rlQUp = 0), oe.setQuality(js, rlQParticles(js)));
    } else if (rlQUp >= 8 && js + 0.25 <= rlQCeil) {
      ((js += 0.25), (rlQUp = 0), (da = 0), oe.setQuality(js, rlQParticles(js)));
    }
  }
  function h_() {
    let i = getComputedStyle(document.documentElement),
      t = (e) => parseFloat(i.getPropertyValue(e)) || 0;
    return { t: t("--st"), b: t("--sb"), l: t("--sl"), r: t("--sr") };
  }
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "hidden"
      ? (ft.mode === "game" && ft.pause(), ee.save("hidden"), Be.suspend())
      : (Be.resume(), (ft.last = performance.now()));
  });
  window.addEventListener("pagehide", () => {
    (ln.reset(!0), ee.save("pagehide"));
  });
  window.addEventListener("pageshow", () => {
    (ln.reset(!0), _scheduleResize("pageshow"));
  });
  var u_ = () => {
    (Be.unlock(), Be.mode === "off" && ft.mode === "menu" && Be.setMusic("menu"));
  };
  for (let i of ["pointerdown", "keydown", "click"]) document.addEventListener(i, u_, { capture: !0, passive: !0 });
  document.addEventListener("gesturestart", (i) => i.preventDefault());
  document.addEventListener("dblclick", (i) => i.preventDefault(), { passive: !1 });
  document.addEventListener(
    "touchmove",
    (i) => {
      let t = i.target;
      (t && t.closest && t.closest(".scroll, .cards, .center-col, textarea, input, .log")) || i.preventDefault();
    },
    { passive: !1 },
  );

  /* v1.6.0 merged polish: persistent run metrics + save backup + tutorial replay */
  (function () {
    var __showOver = Ft.showOver.bind(Ft);
    Ft.showOver = function (t) {
      __showOver(t);
      var e = k("overExtra"),
        r = this.g && this.g._runExtra;
      if (!e) return;
      if (!r) {
        e.hidden = true;
        return;
      }
      e.hidden = false;
      e.innerHTML =
        '<div class="dh">Run performance</div><div class="run-extra-grid">' +
        [
          ["Damage dealt", qn(Math.round(r.dmgDealt || 0))],
          ["Damage taken", qn(Math.round(r.dmgTaken || 0))],
          ["Crits", qn(r.critHits || 0)],
          ["Dashes", qn(r.dashes || 0)],
          ["Best combo", "×" + qn(r.bestCombo || 0)],
        ]
          .map(function (x) {
            return (
              '<div class="xcell"><div class="xk">' +
              we(x[0]) +
              '</div><div class="xv num">' +
              we(x[1]) +
              "</div></div>"
            );
          })
          .join("") +
        "</div>";
    };
    var __endRun = ft.endRun;
    ft.endRun = function (win, abandoned, silent) {
      var w = this.world;
      this._runExtra = w
        ? {
            dmgDealt: w.dmgDealt,
            dmgTaken: w.runStats && w.runStats.dmgTaken,
            critHits: w.runStats && w.runStats.critHits,
            dashes: w.runStats && w.runStats.dashes,
            bestCombo: w.bestCombo,
          }
        : null;
      return __endRun.call(this, win, abandoned, silent);
    };
  })();

  (function () {
    var makeBackup = function () {
      return JSON.stringify(ee.data, null, 2);
    };
    var exportSave = async function () {
      var value = makeBackup();
      var result = await Ft.dialog({
        title: "Export save",
        body: '<p>Copy this text and keep it somewhere safe. It contains your Riftline progress and settings.</p><textarea id="saveExport" class="log" spellcheck="false" readonly></textarea>',
        buttons: [
          { label: "Copy", value: "copy", cls: "ghost" },
          { label: "Close", value: null, cls: "primary" },
        ],
        onOpen: function () {
          k("saveExport").value = value;
        },
        read: function () {
          return k("saveExport").value;
        },
      });
      if (result && result.value === "copy") Ft.copy(result.text || value);
    };
    var importSave = async function () {
      var result = await Ft.dialog({
        title: "Import save",
        body: '<p>Paste a Riftline save export below. Importing replaces the current progress on this device.</p><textarea id="saveImport" class="log" spellcheck="false" placeholder="Paste save JSON here"></textarea>',
        buttons: [
          { label: "Cancel", value: null, cls: "ghost" },
          { label: "Restore", value: "restore", cls: "primary" },
        ],
        read: function () {
          return k("saveImport").value;
        },
      });
      if (!result || result.value !== "restore") return;
      var parsed = ee.parse(result.text);
      if (!parsed.ok) {
        Ft.alert("Invalid save", "That text is not a valid Riftline save export.");
        return;
      }
      if (
        !(await Ft.confirm(
          "Restore save?",
          "Your current local progress will be replaced by the imported save.",
          "Restore",
          true,
        ))
      )
        return;
      ee.data = parsed.data;
      ee.save("import");
      // 2.4.2: apply the imported settings (volume, left-handed, graphics, camera) right away;
      // they used to wait for the next reload or settings change.
      Xh();
      ft.previewW = ee.data.weapon;
      ft._runExtra = null;
      ft.world = null;
      ft.mode = "menu";
      ft.paused = false;
      Ft.hideOver();
      Ft.hideChoose();
      Ft.hidePause();
      Ft.showHud(false);
      Ft.homeInit = false;
      Ft.show("home");
      Be.setMusic("menu");
      Vi(false);
      Ft.toast("Save restored", "gold", 2400);
    };
    var backupBtn = k("backupBtn");
    var shareBtn = k("shareBtn");
    var restoreBtn = k("restoreBtn");
    var replayTutBtn = k("replayTutBtn");
    backupBtn && backupBtn.addEventListener("click", exportSave);
    if (shareBtn && !navigator.share) shareBtn.hidden = true;
    shareBtn &&
      shareBtn.addEventListener("click", async function () {
        var value = makeBackup();
        try {
          await navigator.share({ title: "Riftline save", text: value });
          Ft.toast("Save shared", "good", 2200);
        } catch (e) {
          if (e && e.name !== "AbortError") Ft.toast("Share failed — use Export instead");
        }
      });
    restoreBtn && restoreBtn.addEventListener("click", importSave);
    replayTutBtn &&
      replayTutBtn.addEventListener("click", async function () {
        var ok = await Ft.confirm(
          "Replay tutorial?",
          "The onboarding will show again on your next fresh run. Your current run and progress stay untouched.",
          "Enable",
        );
        if (!ok) return;
        ee.data.seen.tutorial = false;
        ee.save("tutorial-replay");
        Ft.toast("Tutorial queued for your next fresh run", "good", 2800);
      });
  })();

  /* ---- 2.4.0: every biome gets its own look, not just its own colours. Before, all 19 biomes
   shared one neon grid floor, the same boxes and pillars and the same wall; only the palette
   changed. Now each of the five has its own
     floor    Neon Yard: neon grid · Ember Works: basalt plates split by glowing lava seams ·
              Cryo Vault: frozen sheet with cracks, frost and glints · Toxin Marsh: mud, murky
              water with ripples and moss · Void Core: hex tiles floating over a starfield
     props    (same collision shapes) pylons and crates · chimneys and machines · crystal
              clusters and ice blocks · mushrooms, dead trees and logs · floating obelisks and
              hovering monoliths
     border   fence · steel wall with hazard stripes · ice wall with crystals · reeds and rocks
              on a mud bank · energy barrier over the abyss
     air      neon dust · rising embers and chimney sparks · snowfall · spores and marsh haze ·
              rising void motes
     light    sun colour, sky and fog density (the marsh is foggy, the void dark)
   ---- */
  var RL_BIOME_LOOK = {
    yard: { style: 0, hemi: 1.9, sun: 0xffffff, sunI: 1.5, fog: null },
    works: { style: 1, hemi: 1.6, sun: 0xffb27a, sunI: 1.75, fog: [1.35, 3.3] },
    vault: { style: 2, hemi: 2.2, sun: 0xd6ecff, sunI: 1.8, fog: [1.3, 3.2] },
    marsh: { style: 3, hemi: 1.6, sun: 0xdcffb8, sunI: 1.15, fog: [0.95, 2.5] },
    void: { style: 4, hemi: 1.35, sun: 0xd8c4ff, sunI: 1.05, fog: [1.7, 4.4] },
  };
  var RL_FLOOR_FRAG = `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uBase; uniform vec3 uGrid; uniform vec3 uAccent;
  uniform vec2 uHalf; uniform vec2 uPlayer; uniform float uTime; uniform float uPulse; uniform float uDeco;
  uniform float uStyle;
  uniform vec4 uL[6]; uniform vec3 uLC[6];
  varying vec2 vW;
  float gridLine(vec2 p, float w) {
    vec2 g = abs(fract(p - 0.5) - 0.5) / (fwidth(p) * w);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n)); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s / 0.875;
  }
  // x: distance to the nearest cell centre, y: distance to the cell border (F2 - F1), z: cell id
  vec3 voro(vec2 p) {
    vec2 n = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0, id = 0.0;
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j)), r = g + h22(n + g) - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h21(n + g); } else if (d < d2) { d2 = d; }
      }
    d1 = sqrt(d1);
    return vec3(d1, sqrt(d2) - d1, id);
  }
  vec3 starfield(vec2 p) {
    vec2 s = p * 1.4 + vec2(uTime * 0.04, 0.0), c = floor(s);
    float tw = 0.55 + 0.45 * sin(uTime * 2.0 + h21(c + 3.0) * 40.0);
    float star = step(0.965, h21(c)) * smoothstep(0.22, 0.0, length(fract(s) - 0.5)) * tw;
    float neb = fbm(p * 0.09 + vec2(uTime * 0.008, 0.0));
    return uAccent * neb * neb * 0.32 + uGrid * 0.07 * fbm(p * 0.25 - uTime * 0.015) + vec3(star * 0.9);
  }
  void main() {
    vec2 p = vW;
    float minor = gridLine(p, 1.2);
    float major = gridLine(p / 4.0, 1.6);
    vec2 d = uHalf - abs(p);
    float edge = min(d.x, d.y);
    float inside = step(0.0, edge);
    float edgeGlow = exp(-max(edge, 0.0) * 1.1);
    vec2 dp = p - uPlayer;
    float pl = exp(-dot(dp, dp) * 0.018);
    int st = int(uStyle + 0.5);
    vec3 col;
    float lit = 0.35 + minor * 0.5 + major * 0.9; // how strongly muzzle flashes / blasts light it
    float outside = 0.3; // brightness of the floor beyond the border
    if (st == 1) {
      // Ember Works: basalt plates, lava in the seams, each plate breathing heat at its own pace
      vec3 v = voro(p * 0.42);
      float heat = 0.55 + 0.45 * sin(uTime * 1.3 + v.z * 6.283);
      float seam = smoothstep(0.06, 0.0, v.y);
      col = uBase * (0.55 + 1.0 * fbm(p * 1.3)) * (0.8 + 0.5 * pl);
      col += uGrid * seam * (0.14 + 0.26 * heat) * inside;
      col += uAccent * smoothstep(0.02, 0.0, v.y) * heat * 0.2 * inside;
      col += uGrid * 0.04 * smoothstep(0.6, 0.95, v.z) * (1.0 - v.x) * heat * inside;
      lit = 0.45 + seam;
    } else if (st == 2) {
      // Cryo Vault: a lighter frozen sheet, cracks, frost drifts and glints
      float fr = fbm(p * 0.35 + 3.0);
      col = mix(uBase * 1.7, uGrid * 0.2, fr * 0.8) * (0.8 + 0.6 * pl) + uAccent * 0.035;
      vec3 v = voro(p * 0.3 + 11.0);
      col += uGrid * smoothstep(0.03, 0.0, v.y) * 0.2 * inside;
      float frost = smoothstep(0.55, 0.8, fbm(p * 1.1));
      col = mix(col, uGrid * 0.32, frost * 0.45);
      vec2 gc = floor(p * 2.0), gf = fract(p * 2.0) - 0.5 - (h22(gc) - 0.5) * 0.6;
      float glint = step(0.97, h21(gc)) * smoothstep(0.1, 0.0, length(gf)) * (0.5 + 0.5 * sin(uTime * 3.0 + h21(gc + 7.0) * 30.0));
      col += vec3(0.9) * glint * 0.45 * inside;
      col += uAccent * pl * 0.06;
      lit = 0.6 + 0.4 * frost;
    } else if (st == 3) {
      // Toxin Marsh: mud with murky pools that ripple, moss clumps and glowing specks
      float m = fbm(p * 0.28 + vec2(0.0, uTime * 0.01));
      float water = smoothstep(0.5, 0.58, m);
      vec3 mud = uBase * (0.7 + 1.0 * fbm(p * 1.7)) + vec3(0.012, 0.008, 0.0);
      vec3 pool = uBase * 0.55 + vec3(0.0, 0.012, 0.018);
      float sh = sin(dot(p, vec2(1.3, 0.7)) * 2.0 + fbm(p * 0.7 + uTime * 0.12) * 9.0 + uTime * 1.1);
      pool += uGrid * 0.025 * max(sh, 0.0);
      col = mix(mud, pool, water) * (0.8 + 0.5 * pl);
      float moss = smoothstep(0.6, 0.74, fbm(p * 0.9 + 5.0)) * (1.0 - water);
      col = mix(col, uBase * 1.5 + uGrid * 0.04, moss * 0.7);
      vec2 sc = floor(p * 1.5), sf = fract(p * 1.5) - 0.5;
      col += uAccent * step(0.985, h21(sc)) * smoothstep(0.14, 0.0, length(sf)) * (1.0 - water) * 0.3 * inside;
      lit = 0.4 + 0.6 * water;
    } else if (st == 4) {
      // Void Core: hex tiles with glowing rims floating over a starfield; beyond the border only the abyss
      vec2 q = p / 2.3, r = vec2(1.0, 1.7320508), hh = r * 0.5;
      vec2 a = mod(q, r) - hh, b = mod(q - hh, r) - hh;
      vec2 g = dot(a, a) < dot(b, b) ? a : b, cid = floor((q - g) * 2.0 + 0.5);
      vec2 ag = abs(g);
      float hd = max(dot(ag, normalize(r)), ag.x);
      float gap = smoothstep(0.465, 0.48, hd), rim = smoothstep(0.4, 0.46, hd) * (1.0 - gap);
      float pulse = step(0.94, h21(cid)) * (0.5 + 0.5 * sin(uTime * 2.2 + h21(cid + 1.0) * 20.0));
      vec3 tile = uBase * (0.75 + 0.35 * h21(cid + 5.0)) * (0.8 + 0.6 * pl) + uGrid * rim * 0.2 + uAccent * pulse * 0.06;
      col = mix(tile, starfield(p), max(gap, 1.0 - inside));
      lit = (0.3 + rim) * (1.0 - gap);
      outside = 1.0;
    } else {
      // Neon Yard: the neon grid with a slow scan wave and layout markings (unchanged)
      float scan = smoothstep(0.0, 1.0, 1.0 - abs(fract(length(p) * 0.05 - uTime * 0.08) - 0.5) * 2.0);
      col = uBase * (0.75 + 0.7 * pl);
      col += uGrid * (minor * 0.07 + major * (0.22 + 0.12 * scan)) * (0.6 + 0.6 * pl) * inside;
      if (uDeco > 0.5) {
        float mk = 0.0;
        if (uDeco < 1.5) { float rr = length(p); mk = smoothstep(0.455, 0.49, abs(fract(rr / 5.5) - 0.5)) * step(4.0, rr); }
        else if (uDeco < 2.5) { float band = step(edge, 2.2) * step(0.5, edge); mk = band * step(0.5, fract((p.x + p.y) * 0.35)); }
        else if (uDeco < 3.5) { vec2 aa = abs(p); mk = (smoothstep(1.7, 1.5, aa.x) + smoothstep(1.7, 1.5, aa.y)) * 0.45 * step(4.5, length(p)); }
        else { vec2 gg = vec2(p.x * 0.5774 + p.y, p.x * 1.1547) / 3.0; vec2 ff = fract(gg) - 0.5; mk = smoothstep(0.1, 0.06, length(ff)) * 0.8; }
        col += uGrid * mk * 0.05 * inside;
      }
    }
    col += uAccent * edgeGlow * 0.28 * inside;
    col += uGrid * uPulse * 0.12 * inside;
    for (int i = 0; i < 6; i++) {
      if (uL[i].w <= 0.0) continue;
      vec2 d2 = p - uL[i].xy;
      float fall = exp(-dot(d2, d2) / max(0.01, uL[i].z * uL[i].z));
      col += uLC[i] * uL[i].w * fall * lit;
    }
    col *= mix(outside, 1.0, inside);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }`;

  // Instanced props (reeds, crystals, stripes, rocks): one draw call per kind.
  function rlInst(group, geo, mat, list) {
    if (!list.length) return null;
    const m = new Er(geo, mat, list.length),
      o = new an();
    list.forEach((q, k) => {
      o.position.set(q.x, q.y, q.z);
      o.rotation.set(q.rx || 0, q.ry || 0, q.rz || 0);
      o.scale.set(q.sx ?? 1, q.sy ?? 1, q.sz ?? 1);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
      q.c != null && m.setColorAt(k, lt(q.c));
    });
    m.frustumCulled = !1;
    group.add(m);
    return m;
  }
  // Points along the border, `off` outside it, every `step` metres: fn(x, z, nx, nz)
  function rlAlongBorder(W, H, off, step, fn) {
    const a = W + off,
      b = H + off;
    for (const [x0, z0, x1, z1, nx, nz] of [
      [-a, -b, a, -b, 0, -1],
      [a, -b, a, b, 1, 0],
      [a, b, -a, b, 0, 1],
      [-a, b, -a, -b, -1, 0],
    ]) {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        fn(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, nx, nz);
      }
    }
  }
  const rlMesh = (group, geo, mat, x, y, z, ry = 0) => {
    const m = new Gt(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    return m;
  };
  const rlGlow = (c, opacity = 1) => new Ie({ color: c, toneMapped: !1, transparent: opacity < 1, opacity });
  // A thin ring on the floor at the collision radius, so the footprint reads in every biome.
  const rlFootRing = (g, x, z, r, mat) => {
    const q = rlMesh(g, new Ve(r, 0.04, 4, 32), mat, x, 0.05, z);
    q.rotation.x = Math.PI / 2;
    return q;
  };
  // Outline slab under a box obstacle.
  const rlFootSlab = (g, b, mat, pad = 0.3) =>
    rlMesh(g, new Ct(b.w * 2 + pad, 0.05, b.h * 2 + pad), mat, b.x, 0.03, b.y);

  var RL_BIOME_BUILD = {
    // Neon Yard: the original arena (fence with neon trim, pylons and crates)
    yard(A, t, W, H, obs) {
      const g = A.group,
        x = A.obsGroup,
        o = new $e({ color: t.wall }),
        c = new Ie({ color: t.grid, toneMapped: !1 }),
        h = new Ie({ color: t.accent, toneMapped: !1 }),
        d = 0.5,
        f = 0.7;
      for (const [bx, bz, sx, sz] of [
        [0, -H - d / 2, W * 2 + d * 2, d],
        [0, H + d / 2, W * 2 + d * 2, d],
        [-W - d / 2, 0, d, H * 2],
        [W + d / 2, 0, d, H * 2],
      ]) {
        rlMesh(g, new Ct(sx, f, sz), o, bx, f / 2, bz);
        rlMesh(
          g,
          new Ct(sx === d ? 0.08 : sx, 0.06, sz === d ? 0.08 : sz),
          c,
          bx + (sx === d ? (bx < 0 ? d / 2 - 0.04 : -d / 2 + 0.04) : 0),
          f + 0.03,
          bz + (sz === d ? (bz < 0 ? d / 2 - 0.04 : -d / 2 + 0.04) : 0),
        );
      }
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          rlMesh(g, new Ct(0.9, 1.4, 0.9), o, sx * (W + 0.25), 0.7, sz * (H + 0.25));
          rlMesh(g, new Ct(0.95, 0.08, 0.95), h, sx * (W + 0.25), 1.42, sz * (H + 0.25));
        }
      const m = new $e({ color: new Ot(t.wall).multiplyScalar(1.4) });
      for (const b of obs)
        if (b.t === "c") {
          const v = 1.8;
          rlMesh(x, new ye(b.r, b.r * 1.08, v, 20), m, b.x, v / 2, b.y);
          rlMesh(x, new ye(b.r * 1.02, b.r * 1.02, 0.08, 20, 1, !0), c, b.x, v * 0.75, b.y);
          rlFootRing(x, b.x, b.y, b.r * 1.1, h);
          rlMesh(x, new ye(b.r * 0.6, b.r * 0.6, 0.06, 16), c, b.x, v + 0.03, b.y);
        } else {
          const v = b.w < 1.3 && b.h < 1.3 ? 1.1 : 1.3;
          rlMesh(x, new Ct(b.w * 2, v, b.h * 2), m, b.x, v / 2, b.y);
          for (const e of [-b.h, b.h]) rlMesh(x, new Ct(b.w * 2 + 0.04, 0.07, 0.07), c, b.x, v, b.y + e);
          for (const e of [-b.w, b.w]) rlMesh(x, new Ct(0.07, 0.07, b.h * 2 + 0.04), c, b.x + e, v, b.y);
          rlFootSlab(x, b, h);
        }
    },
    // Ember Works: steel wall with hazard stripes, furnaces in the corners, chimneys and machines
    works(A, t, W, H, obs, R) {
      const g = A.group,
        x = A.obsGroup,
        steel = new $e({ color: 0x2b2420, flatShading: !0 }),
        dark = new $e({ color: t.wall, flatShading: !0 }),
        pipe = new $e({ color: 0x3d3129, flatShading: !0 }),
        glow = rlGlow(t.grid),
        hot = rlGlow(t.accent),
        d = 0.6,
        f = 1.25;
      for (const [bx, bz, sx, sz] of [
        [0, -H - d / 2, W * 2 + d * 2, d],
        [0, H + d / 2, W * 2 + d * 2, d],
        [-W - d / 2, 0, d, H * 2],
        [W + d / 2, 0, d, H * 2],
      ]) {
        rlMesh(g, new Ct(sx, f, sz), steel, bx, f / 2, bz);
        // a pipe along the inner face of every wall
        const along = sx > sz,
          p = rlMesh(
            g,
            new ye(0.12, 0.12, along ? sx : sz, 8),
            pipe,
            bx + (along ? 0 : -Math.sign(bx) * 0.38),
            0.45,
            bz + (along ? -Math.sign(bz) * 0.38 : 0),
          );
        along ? (p.rotation.z = Math.PI / 2) : (p.rotation.x = Math.PI / 2);
      }
      // hazard stripes on top of the wall: one instanced mesh, orange and black
      const stripes = [];
      let k = 0;
      rlAlongBorder(W, H, d / 2, 0.55, (px, pz, nx) =>
        stripes.push({
          x: px,
          y: f + 0.05,
          z: pz,
          ry: nx ? Math.PI / 2 : 0,
          sx: 0.5,
          sy: 0.1,
          sz: d + 0.02,
          c: k++ % 2 ? 0x141210 : t.grid,
        }),
      );
      rlInst(g, new Ct(1, 1, 1), new Ie({ toneMapped: !1 }), stripes);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const cx = sx * (W + 0.55),
            cz = sz * (H + 0.55);
          rlMesh(g, new Ct(1.6, 1.9, 1.6), dark, cx, 0.95, cz);
          rlMesh(g, new Ct(1.64, 0.14, 0.5), hot, cx, 1.2, cz);
          A.rlEmit.push({ x: cx, z: cz, y: 2.0, k: "spark" });
        }
      for (const b of obs)
        if (b.t === "c") {
          // chimney: steel stack, glowing band, fire in the mouth, sparks rising
          const v = 2.4;
          rlMesh(x, new ye(b.r * 0.78, b.r, v, 14), steel, b.x, v / 2, b.y);
          rlMesh(x, new ye(b.r * 0.84, b.r * 0.86, 0.18, 14), glow, b.x, v * 0.68, b.y);
          const rim = rlMesh(x, new Ve(b.r * 0.72, 0.09, 6, 20), dark, b.x, v, b.y);
          rim.rotation.x = Math.PI / 2;
          const mouth = rlMesh(x, new Pr(b.r * 0.66, 18), hot, b.x, v - 0.02, b.y);
          mouth.rotation.x = -Math.PI / 2;
          rlFootRing(x, b.x, b.y, b.r * 1.08, glow);
          A.rlEmit.push({ x: b.x, z: b.y, y: v + 0.1, k: "spark" });
        } else {
          // machine block: dark top plate, glowing seams, hot vents
          const v = 1.1,
            longX = b.w >= b.h;
          rlMesh(x, new Ct(b.w * 2, v, b.h * 2), steel, b.x, v / 2, b.y);
          rlMesh(x, new Ct(Math.max(0.1, b.w * 2 - 0.2), 0.08, Math.max(0.1, b.h * 2 - 0.2)), dark, b.x, v + 0.04, b.y);
          for (const s of [-1, 1])
            longX
              ? rlMesh(x, new Ct(b.w * 2 + 0.02, 0.08, 0.04), glow, b.x, v * 0.55, b.y + s * b.h)
              : rlMesh(x, new Ct(0.04, 0.08, b.h * 2 + 0.02), glow, b.x + s * b.w, v * 0.55, b.y);
          const n = Math.max(1, Math.min(4, Math.floor(Math.max(b.w, b.h) / 0.6)));
          for (let j = 0; j < n; j++) {
            const f2 = (j + 0.5) / n - 0.5;
            rlMesh(
              x,
              new Ct(0.28, 0.06, 0.28),
              hot,
              b.x + (longX ? f2 * b.w * 1.6 : 0),
              v + 0.1,
              b.y + (longX ? 0 : f2 * b.h * 1.6),
            );
          }
          rlFootSlab(x, b, glow, 0.25);
        }
    },
    // Cryo Vault: ice wall crowned with crystals, crystal clusters and ice blocks with snow caps
    vault(A, t, W, H, obs, R) {
      const g = A.group,
        x = A.obsGroup,
        ice = new $e({ color: 0x9fd8f0, emissive: 0x0c2a44, transparent: !0, opacity: 0.84, flatShading: !0 }),
        core = new $e({ color: 0x2a5a78, emissive: 0x061624, flatShading: !0 }),
        snow = new $e({ color: 0xe8f4ff, emissive: 0x1a2a38, flatShading: !0 }),
        glow = rlGlow(t.grid, 0.8),
        d = 0.6,
        f = 0.45;
      for (const [bx, bz, sx, sz] of [
        [0, -H - d / 2, W * 2 + d * 2, d],
        [0, H + d / 2, W * 2 + d * 2, d],
        [-W - d / 2, 0, d, H * 2],
        [W + d / 2, 0, d, H * 2],
      ])
        rlMesh(g, new Ct(sx, f, sz), core, bx, f / 2, bz);
      const spikes = [],
        tint = [0xbfe8ff, 0x9fd8f0, 0xdff4ff, 0x86c4e8];
      for (const off of [0.25, 0.85])
        rlAlongBorder(W, H, off, 0.75, (px, pz, nx, nz) => {
          const h = R.range(0.7, off < 0.5 ? 1.5 : 2.4),
            tilt = R.range(0.1, 0.35);
          spikes.push({
            x: px + R.range(-0.2, 0.2) * (nz ? 1 : 0),
            y: f + h / 2 - 0.1,
            z: pz + R.range(-0.2, 0.2) * (nx ? 1 : 0),
            rx: nz * tilt,
            rz: -nx * tilt,
            ry: R.range(0, 6),
            sx: R.range(0.7, 1.2),
            sy: h,
            sz: R.range(0.7, 1.2),
            c: R.pick(tint),
          });
        });
      rlInst(
        g,
        new Ir(0.28, 1, 6),
        new $e({ emissive: 0x0c2a44, transparent: !0, opacity: 0.88, flatShading: !0 }),
        spikes,
      );
      for (const b of obs)
        if (b.t === "c") {
          // crystal cluster: a tall hexagonal prism and four smaller ones leaning outwards
          const main = rlMesh(x, new ye(b.r * 0.3, b.r * 0.5, 2.1, 6), ice, b.x, 1.05, b.y, R.range(0, 6));
          main.rotation.z = R.range(-0.08, 0.08);
          for (let j = 0; j < 4; j++) {
            const a = (j / 4) * Math.PI * 2 + R.range(-0.4, 0.4),
              h = R.range(0.8, 1.4),
              q = rlMesh(
                x,
                new ye(b.r * 0.14, b.r * 0.24, h, 6),
                ice,
                b.x + Math.cos(a) * b.r * 0.55,
                h / 2 - 0.05,
                b.y + Math.sin(a) * b.r * 0.55,
              );
            q.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
          }
          const frost = rlMesh(x, new Pr(b.r, 20), snow, b.x, 0.02, b.y);
          frost.rotation.x = -Math.PI / 2;
          rlFootRing(x, b.x, b.y, b.r * 1.08, glow);
          A.rlEmit.push({ x: b.x, z: b.y, y: 2.0, k: "glint" });
        } else {
          // ice block: clear shell, dark core, snow cap
          const v = 1.05;
          rlMesh(x, new Ct(b.w * 2 * 0.72, v * 0.8, b.h * 2 * 0.72), core, b.x, v * 0.42, b.y);
          rlMesh(x, new Ct(b.w * 2, v, b.h * 2), ice, b.x, v / 2, b.y);
          rlMesh(x, new Ct(b.w * 2 + 0.1, 0.14, b.h * 2 + 0.1), snow, b.x, v + 0.05, b.y);
          rlFootSlab(x, b, glow, 0.25);
        }
    },
    // Toxin Marsh: a mud bank with reeds and rocks, mushrooms, dead trees and mossy logs
    marsh(A, t, W, H, obs, R) {
      const g = A.group,
        x = A.obsGroup,
        bark = new $e({ color: 0x2e2a1c, flatShading: !0 }),
        moss = new $e({ color: 0x2f5a22, emissive: 0x0a1a06, flatShading: !0 }),
        stem = new $e({ color: 0xcfc8a8, flatShading: !0 }),
        cap = new $e({ color: 0x6a3a8a, emissive: 0x1a0826, flatShading: !0 }),
        gill = new $e({ color: 0x1c1024 }),
        spot = rlGlow(t.accent),
        ring = rlGlow(t.grid, 0.55),
        wood = new $e({ color: 0x6a5a3a, flatShading: !0 }),
        d = 1.2;
      for (const [bx, bz, sx, sz] of [
        [0, -H - d / 2, W * 2 + d * 2, d],
        [0, H + d / 2, W * 2 + d * 2, d],
        [-W - d / 2, 0, d, H * 2],
        [W + d / 2, 0, d, H * 2],
      ])
        rlMesh(g, new Ct(sx, 0.22, sz), new $e({ color: 0x1a2414, flatShading: !0 }), bx, 0.11, bz);
      const reeds = [],
        rocks = [],
        green = [0x5a7a2a, 0x4a6a24, 0x6f8a34, 0x3e5a20];
      rlAlongBorder(W, H, 0.55, 0.4, (px, pz, nx, nz) => {
        for (let j = 0; j < 2; j++) {
          const h = R.range(0.9, 2.3),
            o = R.range(-0.45, 0.6);
          reeds.push({
            x: px + nx * o + R.range(-0.2, 0.2) * (nz ? 1 : 0),
            y: h / 2,
            z: pz + nz * o + R.range(-0.2, 0.2) * (nx ? 1 : 0),
            rx: R.range(-0.15, 0.15),
            rz: R.range(-0.15, 0.15),
            sy: h,
            c: R.pick(green),
          });
        }
      });
      rlAlongBorder(W, H, 1.3, 2.6, (px, pz) => {
        const s = R.range(0.5, 1.2);
        rocks.push({
          x: px + R.range(-0.4, 0.4),
          y: s * 0.25,
          z: pz + R.range(-0.4, 0.4),
          ry: R.range(0, 6),
          rx: R.range(0, 1),
          sx: s,
          sy: s * 0.6,
          sz: s * R.range(0.8, 1.2),
          c: R.pick([0x2a3328, 0x333a2c, 0x262e24]),
        });
      });
      rlInst(g, new ye(0.03, 0.05, 1, 4), new $e({ flatShading: !0 }), reeds);
      rlInst(g, new Lr(0.6), new $e({ flatShading: !0 }), rocks);
      for (const b of obs)
        if (b.t === "c") {
          if (R.chance(0.55)) {
            // giant mushroom: pale stem, purple cap with glowing spots, spores drifting up
            rlMesh(x, new ye(b.r * 0.22, b.r * 0.32, 1.25, 8), stem, b.x, 0.62, b.y);
            const c2 = rlMesh(x, new De(b.r * 1.02, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, b.x, 1.18, b.y);
            c2.scale.y = 0.6;
            const under = rlMesh(x, new Pr(b.r * 1.0, 18), gill, b.x, 1.18, b.y);
            under.rotation.x = Math.PI / 2;
            for (let j = 0; j < 6; j++) {
              const a = R.range(0, Math.PI * 2),
                el = R.range(0.25, 1.2);
              rlMesh(
                x,
                new De(R.range(0.06, 0.12), 6, 4),
                spot,
                b.x + Math.cos(a) * Math.sin(el) * b.r,
                1.18 + Math.cos(el) * b.r * 0.6,
                b.y + Math.sin(a) * Math.sin(el) * b.r,
              );
            }
            A.rlEmit.push({ x: b.x, z: b.y, y: 1.2 + b.r * 0.6, k: "spore" });
          } else {
            // dead tree: bare trunk, crooked branches, roots and a collar of moss
            rlMesh(x, new ye(b.r * 0.26, b.r * 0.55, 2.2, 7), bark, b.x, 1.1, b.y, R.range(0, 6));
            for (let j = 0; j < 3; j++) {
              const a = R.range(0, Math.PI * 2),
                q = rlMesh(
                  x,
                  new ye(0.04, 0.1, 1.0, 5),
                  bark,
                  b.x + Math.cos(a) * 0.3,
                  R.range(1.5, 2.1),
                  b.y + Math.sin(a) * 0.3,
                );
              q.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
            }
            for (let j = 0; j < 4; j++) {
              const a = (j / 4) * Math.PI * 2 + R.range(-0.3, 0.3),
                q = rlMesh(
                  x,
                  new ye(0.05, b.r * 0.18, b.r * 0.9, 5),
                  bark,
                  b.x + Math.cos(a) * b.r * 0.55,
                  0.16,
                  b.y + Math.sin(a) * b.r * 0.55,
                );
              q.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
            }
            const col = rlMesh(x, new Ve(b.r * 0.5, 0.14, 5, 14), moss, b.x, 0.14, b.y);
            col.rotation.x = Math.PI / 2;
          }
          rlFootRing(x, b.x, b.y, b.r * 1.08, ring);
        } else {
          // fallen log along the long side, moss on top, two small glowing mushrooms
          const longX = b.w >= b.h,
            L = Math.max(b.w, b.h) * 2,
            rad = Math.max(0.3, Math.min(b.w, b.h) * 0.9),
            log = rlMesh(x, new ye(rad, rad * 1.05, L, 10), bark, b.x, rad, b.y);
          longX ? (log.rotation.z = Math.PI / 2) : (log.rotation.x = Math.PI / 2);
          rlMesh(x, new Ct(longX ? L * 0.8 : rad * 1.1, 0.1, longX ? rad * 1.1 : L * 0.8), moss, b.x, rad * 1.95, b.y);
          for (const s of [-1, 1]) {
            const e = rlMesh(
              x,
              new Pr(rad * 0.92, 12),
              wood,
              b.x + (longX ? (s * L) / 2 + s * 0.02 : 0),
              rad,
              b.y + (longX ? 0 : (s * L) / 2 + s * 0.02),
            );
            longX ? (e.rotation.y = (s * Math.PI) / 2) : (e.rotation.y = s > 0 ? 0 : Math.PI);
          }
          for (let j = 0; j < 2; j++) {
            const f2 = R.range(-0.3, 0.3) * L,
              mx = b.x + (longX ? f2 : 0),
              mz = b.y + (longX ? 0 : f2);
            rlMesh(x, new ye(0.04, 0.05, 0.25, 5), stem, mx, rad * 2 + 0.12, mz);
            rlMesh(x, new De(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), spot, mx, rad * 2 + 0.24, mz);
          }
          rlFootSlab(x, b, ring, 0.2);
        }
    },
    // Void Core: an energy barrier over the abyss, floating obelisks and hovering monoliths
    void(A, t, W, H, obs, R) {
      const g = A.group,
        x = A.obsGroup,
        obsid = new $e({ color: 0x2a1a4a, emissive: 0x12072a, flatShading: !0 }),
        rim = rlGlow(t.grid),
        hot = rlGlow(t.accent),
        wall = zi(null, { color: t.grid, opacity: 0.13, side: fn }),
        f = 1.8;
      for (const [bx, bz, len, rot] of [
        [0, -H, W * 2, 0],
        [0, H, W * 2, 0],
        [-W, 0, H * 2, Math.PI / 2],
        [W, 0, H * 2, Math.PI / 2],
      ]) {
        rlMesh(g, new jn(len, f), wall, bx, f / 2, bz, rot);
        rlMesh(g, new Ct(rot ? 0.06 : len, 0.05, rot ? len : 0.06), rim, bx, 0.03, bz);
        rlMesh(g, new Ct(rot ? 0.04 : len, 0.03, rot ? len : 0.04), rim, bx, f, bz);
      }
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const q = rlMesh(g, new Qe(0.45), hot, sx * W, 1.3, sz * H);
          q.scale.y = 1.8;
          A.rlAnim.push({ o: q, k: "spin", s: 1.2, b: 1.3, ph: sx + sz * 2 });
        }
      // rocks drifting in the abyss around the arena
      const rocks = [];
      for (let j = 0; j < 46; j++) {
        const side = R.int(0, 3),
          along = R.range(-1, 1),
          out = R.range(1.6, 9),
          px = side < 2 ? along * (W + 6) : (side === 2 ? -1 : 1) * (W + out),
          pz = side < 2 ? (side === 0 ? -1 : 1) * (H + out) : along * (H + 6),
          s = R.range(0.3, 1.3);
        rocks.push({
          x: px,
          y: R.range(-3, 0.4),
          z: pz,
          rx: R.range(0, 6),
          ry: R.range(0, 6),
          sx: s,
          sy: s * R.range(0.6, 1.2),
          sz: s,
          c: R.pick([0x2a1c44, 0x1e1434, 0x352654]),
        });
      }
      const drift = new rn();
      g.add(drift);
      rlInst(drift, new Lr(0.8), new $e({ emissive: 0x0a0418, flatShading: !0 }), rocks);
      A.rlAnim.push({ o: drift, k: "bob", b: 0, ph: 0, a: 0.25, s: 0.35 });
      for (const b of obs)
        if (b.t === "c") {
          // floating obelisk with an orbiting ring over a rune circle
          const ob = rlMesh(x, new Qe(b.r * 0.72), obsid, b.x, 1.6, b.y);
          ob.scale.y = 2.3;
          A.rlAnim.push({ o: ob, k: "spinbob", s: 0.6, b: 1.6, ph: b.x * 1.7 + b.y, a: 0.12 });
          const orb = rlMesh(x, new Ve(b.r * 0.95, 0.04, 4, 32), hot, b.x, 1.6, b.y);
          orb.rotation.x = 1.2;
          A.rlAnim.push({ o: orb, k: "spin", s: 1.4, b: 1.6, ph: b.y });
          rlFootRing(x, b.x, b.y, b.r * 1.08, rim);
          const pad = rlMesh(x, new Pr(b.r * 0.95, 24), zi(null, { color: t.accent, opacity: 0.16 }), b.x, 0.04, b.y);
          pad.rotation.x = -Math.PI / 2;
          A.rlEmit.push({ x: b.x, z: b.y, y: 0.6, k: "mote" });
        } else {
          // monolith hovering above its outline, glowing seams on the edges
          const v = 2.0,
            mono = new rn();
          mono.position.set(b.x, 0.3 + v / 2, b.y);
          x.add(mono);
          rlMesh(mono, new Ct(b.w * 2 * 0.92, v, b.h * 2 * 0.92), obsid, 0, 0, 0);
          for (const sx of [-1, 1])
            for (const sz of [-1, 1])
              rlMesh(mono, new Ct(0.05, v + 0.02, 0.05), rim, sx * b.w * 0.92, 0, sz * b.h * 0.92);
          for (const s of [-1, 1]) {
            rlMesh(mono, new Ct(b.w * 2 * 0.92 + 0.04, 0.05, 0.05), hot, 0, v / 2, s * b.h * 0.92);
            rlMesh(mono, new Ct(0.05, 0.05, b.h * 2 * 0.92 + 0.04), hot, s * b.w * 0.92, v / 2, 0);
          }
          A.rlAnim.push({ o: mono, k: "bob", b: 0.3 + v / 2, ph: b.x + b.y * 0.7, a: 0.1, s: 1.1 });
          rlFootSlab(x, b, rim, 0.2);
        }
    },
  };

  /* The arena is rebuilt from scratch for every layout (as before); build() now asks the biome
   for its border and props and switches the floor shader's style. */
  Ul.prototype.build = function (t, e, n = !1) {
    if (((e = e || { key: t.id + ":classic", W: t.W, H: t.H, obs: t.obstacles, deco: 0 }), this.layKey === e.key))
      return;
    const first = this.layKey == null;
    if (!this.rlFloor) {
      // same uniforms, new fragment shader with one branch per biome style
      this.uniforms.uStyle = { value: 0 };
      this.floorMat.dispose();
      this.floorMat = new un({ uniforms: this.uniforms, vertexShader: $v, fragmentShader: RL_FLOOR_FRAG, fog: !0 });
      this.rlFloor = !0;
    }
    ((this.layKey = e.key), (this.biomeId = t.id));
    this.group.traverse((b) => {
      (b.geometry && b.geometry.dispose(), b.material && b.material !== this.floorMat && b.material.dispose());
    });
    this.group.clear();
    const look = RL_BIOME_LOOK[t.id] || RL_BIOME_LOOK.yard,
      r = this.uniforms;
    (r.uBase.value.setHex(t.floor),
      r.uGrid.value.setHex(t.grid),
      r.uAccent.value.setHex(t.accent),
      r.uHalf.value.set(e.W, e.H),
      (r.uDeco.value = look.style === 0 ? e.deco || 0 : 0),
      (r.uStyle.value = look.style));
    const floor = new Gt(new jn(100, 100), this.floorMat);
    ((floor.rotation.x = -Math.PI / 2), this.group.add(floor));
    const x = new rn();
    (this.group.add(x), (this.obsGroup = x));
    this.rlAnim = [];
    this.rlEmit = [];
    (RL_BIOME_BUILD[t.id] || RL_BIOME_BUILD.yard)(this, t, e.W, e.H, e.obs, qi(Yi(e.key + ":look")));
    ((this.rise = n && !first ? 0 : 1), (x.position.y = this.rise < 1 ? -2.6 : 0));
  };
  const _rlArenaUpdate240 = Ul.prototype.update;
  Ul.prototype.update = function (t, e, n, s) {
    _rlArenaUpdate240.call(this, t, e, n, s);
    const T = this.uniforms.uTime.value;
    for (const a of this.rlAnim || []) {
      const o = a.o;
      if (a.k === "spin" || a.k === "spinbob") o.rotation.y += t * a.s;
      if (a.k === "bob" || a.k === "spinbob") o.position.y = a.b + Math.sin(T * (a.s || 1) + a.ph) * (a.a || 0.1);
    }
  };

  // Ambient particles: the air of the biome, around the camera, plus sparks/spores/glints from props.
  const RL_C = {
    ember: new Ot(0xffa040),
    ember2: new Ot(0xffd070),
    snow: new Ot(0xdceeff),
    white: new Ot(0xffffff),
  };
  function rlAmbient(R, dt, w, opt) {
    const b = R.biome,
      A = R.arena;
    if (!b || !(dt > 0) || dt > 0.25) return;
    const k = Math.min(1, R.maxParticles / 1400) * (opt.menu || !w ? 0.6 : 1),
      W = A.uniforms.uHalf.value.x,
      H = A.uniforms.uHalf.value.y,
      cx = opt.menu || !w ? 0 : R.camX,
      cz = opt.menu || !w ? 0 : R.camZ,
      count = (rate) => {
        const c = rate * dt * k,
          m = Math.floor(c);
        return m + (Math.random() < c - m ? 1 : 0);
      },
      rx = (s = 15) => Lt(cx + (Math.random() * 2 - 1) * s, -W, W),
      rz = (s = 12) => Lt(cz + (Math.random() * 2 - 1) * s - 2, -H, H),
      grid = lt(b.grid),
      acc = lt(b.accent);
    switch (b.id) {
      case "works":
        for (let j = count(24); j--; )
          R.emit(
            rx(),
            0.1,
            rz(),
            (Math.random() - 0.5) * 0.8,
            1 + Math.random() * 1.6,
            (Math.random() - 0.5) * 0.8,
            1.6 + Math.random(),
            0.1 + Math.random() * 0.1,
            Math.random() < 0.5 ? RL_C.ember : RL_C.ember2,
            { drag: 0.3 },
          );
        break;
      case "vault":
        for (let j = count(42); j--; )
          R.emit(
            rx(17),
            2.5 + Math.random() * 6,
            rz(14),
            0.5 + Math.random() * 0.3,
            -1.3 - Math.random() * 0.6,
            0.15,
            4,
            0.13,
            RL_C.snow,
            { drag: 0 },
          );
        break;
      case "marsh":
        for (let j = count(14); j--; )
          R.emit(
            rx(),
            0.3 + Math.random() * 1.3,
            rz(),
            (Math.random() - 0.5) * 0.4,
            0.15 + Math.random() * 0.2,
            (Math.random() - 0.5) * 0.4,
            3.5,
            0.15,
            Math.random() < 0.6 ? acc : grid,
            { drag: 0.2 },
          );
        for (let j = count(4); j--; )
          R.emit(
            rx(),
            0.25,
            rz(),
            (Math.random() - 0.5) * 0.3,
            0.02,
            (Math.random() - 0.5) * 0.3,
            5,
            2.6,
            lt(0x0a1a08),
            { drag: 0, grow: 0.6 },
          );
        break;
      case "void":
        for (let j = count(20); j--; )
          R.emit(
            rx(18),
            0.05,
            rz(15),
            0,
            0.6 + Math.random() * 0.8,
            0,
            3.5,
            0.1,
            Math.random() < 0.5 ? acc : Math.random() < 0.5 ? grid : RL_C.white,
            { drag: 0 },
          );
        break;
      default:
        for (let j = count(6); j--; )
          R.emit(rx(), 0.2 + Math.random() * 0.8, rz(), 0, 0.3, 0, 3, 0.12, grid, { drag: 0 });
    }
    if (!(A.rise >= 1) || !A.rlEmit) return;
    for (const q of A.rlEmit) {
      if (Math.abs(q.x - cx) > 22 || Math.abs(q.z - cz) > 18) continue;
      if (q.k === "spark")
        count(5) &&
          R.emit(
            q.x + (Math.random() - 0.5) * 0.4,
            q.y,
            q.z + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.6,
            1.6 + Math.random() * 1.4,
            (Math.random() - 0.5) * 0.6,
            1.3,
            0.22,
            RL_C.ember,
            { drag: 0.6, grow: 1.2 },
          );
      else if (q.k === "glint")
        count(1.5) &&
          R.emit(
            q.x + (Math.random() - 0.5),
            q.y * Math.random(),
            q.z + (Math.random() - 0.5),
            0,
            0.2,
            0,
            0.6,
            0.2,
            RL_C.white,
            { spark: !0, drag: 0 },
          );
      else if (q.k === "spore")
        count(2.5) &&
          R.emit(
            q.x + (Math.random() - 0.5),
            q.y,
            q.z + (Math.random() - 0.5),
            (Math.random() - 0.5) * 0.3,
            0.4 + Math.random() * 0.3,
            (Math.random() - 0.5) * 0.3,
            3,
            0.14,
            acc,
            { drag: 0.1 },
          );
      else if (q.k === "mote") {
        if (count(3)) {
          const a = Math.random() * Me;
          R.emit(
            q.x + Math.cos(a) * 1.1,
            q.y,
            q.z + Math.sin(a) * 1.1,
            -Math.cos(a) * 0.5,
            0.9,
            -Math.sin(a) * 0.5,
            1.4,
            0.12,
            grid,
            { drag: 0 },
          );
        }
      }
    }
  }
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
  // 2.4.0: say once that the retired weapons of an old save were converted.
  function rlRetireToast() {
    const q = RL_RETIRE_NOTE;
    if (!q || !q.names.length) return;
    RL_RETIRE_NOTE = null;
    Ft.toast(
      `The arsenal is down to 7 weapons: ${q.names.join(", ")} became the weapon ${q.names.length > 1 ? "they were variants" : "it was a variant"} of${q.refund ? `, +${qn(q.refund)} shards refunded` : ""}.`,
      "good",
      9000,
    );
    ee.save("retire");
  }

  /* ---- 2.4.1: enemies and bosses wear the biome. A skin is laid over every enemy model by the
   shader (same shapes, same type colours and glow, so types stay recognisable):
     Neon Yard    none
     Ember Works  charred shell with pulsing lava veins, embers rising off them
     Cryo Vault   frost on the upper surfaces with glints, a cold tint, frost flakes
     Toxin Marsh  slime running down with glowing toxic spots, green drops
     Void Core    violet rim glow and star specks, motes rising
   The skin is only visual; how an enemy fights does not change. ---- */
  var RL_SKIN = { uSkin: { value: 0 }, uSkinT: { value: 0 } };
  const RL_SKIN_VERT_HEAD = `
varying vec3 vRlP;
varying vec3 vRlN;`;
  const RL_SKIN_VERT_BODY = `
vRlP = position;
#ifdef USE_INSTANCING
vRlN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
vRlN = normalize(mat3(modelMatrix) * objectNormal);
#endif`;
  const RL_SKIN_FRAG_HEAD = `
uniform float uSkin;
uniform float uSkinT;
varying vec3 vRlP;
varying vec3 vRlN;
float rlH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rlN3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rlH3(i), rlH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rlH3(i + vec3(0.0, 1.0, 0.0)), rlH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(rlH3(i + vec3(0.0, 0.0, 1.0)), rlH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rlH3(i + vec3(0.0, 1.0, 1.0)), rlH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`;
  const RL_SKIN_FRAG_BODY = `
{
  int rlS = int(uSkin + 0.5);
  if (rlS == 1) {
    // molten: charred shell, lava veins that pulse
    vec3 q = vRlP * 4.5;
    float n = rlN3(q) * 0.65 + rlN3(q * 2.1) * 0.35;
    float vein = smoothstep(0.07, 0.0, abs(n - 0.5));
    float pulse = 0.65 + 0.35 * sin(uSkinT * 3.5 + q.y * 2.0 + q.x);
    outgoingLight = outgoingLight * vec3(0.6, 0.5, 0.45) + vec3(1.0, 0.42, 0.08) * vein * pulse * 0.9;
  } else if (rlS == 2) {
    // frost on everything facing up, glints, a cold tint
    float fr = smoothstep(0.05, 0.75, vRlN.y + (rlN3(vRlP * 6.0) - 0.5) * 0.9);
    outgoingLight = outgoingLight * vec3(0.82, 0.93, 1.08);
    outgoingLight = mix(outgoingLight, vec3(0.72, 0.88, 1.0) * (0.55 + 0.35 * max(vRlN.y, 0.0)), fr * 0.7);
    float gl = step(0.9, rlN3(vRlP * 16.0)) * (0.5 + 0.5 * sin(uSkinT * 5.0 + vRlP.x * 30.0));
    outgoingLight += vec3(0.9, 0.97, 1.0) * gl * fr * 0.55;
  } else if (rlS == 3) {
    // slime running down, glowing toxic spots
    float s = smoothstep(0.56, 0.66, rlN3(vec3(vRlP.x * 5.0, vRlP.y * 1.8 + uSkinT * 0.35, vRlP.z * 5.0)));
    outgoingLight = mix(outgoingLight * vec3(0.85, 0.95, 0.75), vec3(0.08, 0.18, 0.04) + vec3(0.14, 0.24, 0.05) * max(vRlN.y, 0.0), s * 0.55);
    float spot = smoothstep(0.87, 0.93, rlN3(vRlP * 9.0 + 3.0));
    outgoingLight += vec3(0.45, 1.0, 0.15) * spot * (0.35 + 0.25 * sin(uSkinT * 2.5 + vRlP.y * 9.0));
  } else if (rlS == 4) {
    // void: violet rim and drifting star specks
    float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
    outgoingLight = outgoingLight * vec3(0.72, 0.62, 0.9) + vec3(0.72, 0.28, 1.0) * fres * 0.95;
    vec3 sc = vRlP * 10.0 + vec3(0.0, uSkinT * 0.6, 0.0);
    float st = step(0.94, rlH3(floor(sc))) * smoothstep(0.32, 0.12, length(fract(sc) - 0.5));
    outgoingLight += vec3(0.9, 0.8, 1.0) * st * 0.6;
  }
}`;
  // Adds the skin (and, for enemy bodies, the hit flash they already had) to a Lambert material.
  function rlSkinMaterial(mat, flash) {
    mat.onBeforeCompile = (e) => {
      e.uniforms.uSkin = RL_SKIN.uSkin;
      e.uniforms.uSkinT = RL_SKIN.uSkinT;
      e.vertexShader = e.vertexShader
        .replace("#include <common>", `#include <common>${RL_SKIN_VERT_HEAD}${flash ? "\nattribute float aFlash;\nvarying float vFlash;" : ""}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>${RL_SKIN_VERT_BODY}${flash ? "\nvFlash = aFlash;" : ""}`);
      e.fragmentShader = e.fragmentShader
        .replace("#include <common>", `#include <common>${RL_SKIN_FRAG_HEAD}${flash ? "\nvarying float vFlash;" : ""}`)
        .replace(
          "#include <opaque_fragment>",
          `${RL_SKIN_FRAG_BODY}${flash ? "\noutgoingLight = mix(outgoingLight, vec3(1.0), vFlash);" : ""}\n#include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => (flash ? "flashLambertSkin" : "lambertSkin");
    mat.needsUpdate = !0;
    mat.rlSkin = !0;
  }
  const RL_SKIN_FX = {
    1: { c: new Ot(0xff8a30), vy: 1.4, grav: 0, life: 0.7, size: 0.15, spark: !1 },
    2: { c: new Ot(0xdcf0ff), vy: -0.35, grav: 0, life: 0.9, size: 0.18, spark: !0 },
    3: { c: new Ot(0x8cff3a), vy: -0.2, grav: 7, life: 0.6, size: 0.13, spark: !1 },
    4: { c: new Ot(0xc070ff), vy: 0.9, grav: 0, life: 0.9, size: 0.12, spark: !1 },
  };
  function rlSkinParticles(R, dt, w) {
    const fx = RL_SKIN_FX[RL_SKIN.uSkin.value];
    if (!fx || !w || !(dt > 0) || dt > 0.25) return;
    const n = w.enemies.length,
      k = Math.min(1, R.maxParticles / 1400),
      rate = Math.min(2.2, 70 / Math.max(1, n)) * k;
    for (const e of w.enemies) {
      if (e.dead || e.ghost || e.spawnT > 0) continue;
      const big = e.boss ? 6 : 1;
      if (Math.random() >= rate * big * dt) continue;
      const a = Math.random() * Me,
        d = Math.random() * e.r * 0.8;
      R.emit(e.x + Math.cos(a) * d, 0.3 + e.r * (e.boss ? 1.4 : 0.9), e.y + Math.sin(a) * d, (Math.random() - 0.5) * 0.4, fx.vy * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.4, fx.life, fx.size * (e.boss ? 1.6 : 1), fx.c, { drag: 0.4, grav: fx.grav, spark: fx.spark });
    }
  }
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

  /* ---- 2.2.3: run monitor hooks (only the live run's world is observed;
   self-test and snapshot-check worlds are ignored by identity) ---- */
  (() => {
    rlInstallHunt();
    const baseStep = Aa.prototype.step;
    Aa.prototype.step = function (dt, input) {
      if (!RL_MON || RL_MON.w !== this) return baseStep.call(this, dt, input);
      const n0 = this.fx.length,
        d0 = this.player.dashId,
        s0 = this.shards,
        k0 = this.kills;
      const r = baseStep.call(this, dt, input);
      try {
        rlMonStep(this, n0, d0, s0, k0, dt);
      } catch (e) {
        rlMonIssue("WARN", "monitor", "monitor exception: " + e.message);
      }
      return r;
    };
    const baseWave = Aa.prototype.startWave;
    Aa.prototype.startWave = function (wave, nova) {
      const r = baseWave.call(this, wave, nova);
      if (RL_MON && RL_MON.w === this)
        try {
          rlMonBeginWave(this);
        } catch (e) {
          rlMonIssue("WARN", "monitor", "monitor exception: " + e.message);
        }
      return r;
    };
    const baseStart = ft.startRun;
    ft.startRun = function (o) {
      const r = baseStart.call(this, o);
      try {
        this.world && this.mode === "game" && rlMonStart(this.world, !!(o && o.resume));
      } catch (e) {
        ze("monitor", e);
      }
      return r;
    };
    const baseEnd = ft.endRun;
    ft.endRun = function (win, abandoned, silent) {
      const w = this.world,
        pre = w && !this.overShown ? rlMonPreEnd(w) : null;
      const r = baseEnd.call(this, win, abandoned, silent);
      if (pre)
        try {
          rlMonFinish(w, pre, !!win, !!abandoned, !!silent, !1);
        } catch (e) {
          ze("audit", e);
        }
      if (pre)
        try {
          rlRecordRun(w, pre, !!win, !!abandoned);
        } catch (e) {
          ze("history", e);
        }
      return r;
    };
    const baseEndless = ft.endless;
    ft.endless = function () {
      const r = baseEndless.call(this);
      try {
        this.world && this.world.endless && rlMonStart(this.world, !0);
      } catch (e) {
        ze("monitor", e);
      }
      return r;
    };
    // Records: recent runs list under the lifetime stats
    const baseRec = Gl.prototype.renderRecords;
    Gl.prototype.renderRecords = function () {
      const r = baseRec.call(this);
      try {
        rlRenderHistory();
      } catch (e) {
        ze("history", e);
      }
      return r;
    };
    // Touch ghost-click shield: after a touch activation the browser still sends a
    // compatibility click to whatever is under the finger NOW — often a button on
    // the next screen, a settings toggle or a workshop "buy". Drop that one click
    // in the capture phase, before any handler (guarded or plain) can see it.
    document.addEventListener(
      "click",
      (e) => {
        const g = RL_TOUCH_CLICK_GUARD;
        if (!g.until) return;
        if (performance.now() > g.until) {
          g.until = 0;
          g.key = "";
          return;
        }
        const dx = e.clientX - g.x,
          dy = e.clientY - g.y;
        if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= 36) {
          g.until = 0;
          g.key = "";
          RL_RT.uiGuardDrops++;
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      !0,
    );
  })();
  /* ==========================================================================
   Riftline 2.4.2: bug fixes and quality of life
   - a run that is already lost (or won) is settled when the page is hidden, so a reload in
     the 1.5 s before the game-over screen no longer brings the run back
   - letters are read by their position on the keyboard (e.code), so W A S D, E, Q and F sit in
     the same place on every layout (on AZERTY, Q moved left and fired the Nova as well)
   - upgrade choice: keys 1–4 pick a card, R rerolls
   - Esc goes back in Workshop, Records and Settings
   - Settings can be opened from the pause menu (without backup and reset)
   - the build in the pause menu explains each upgrade on tap or click
   - optional run timer and FPS counter in the HUD
   ========================================================================== */
  (() => {
    // ---- settle a lost or won run before the page goes away
    const settle = () => {
      const w = ft.world;
      ft.mode !== "game" ||
        !w ||
        ft.overShown ||
        (w.state !== "dead" && w.state !== "victory") ||
        ft.endRun(w.state === "victory");
    };
    document.addEventListener("visibilitychange", () => {
      document.visibilityState === "hidden" && settle();
    });
    window.addEventListener("pagehide", settle);

    // ---- keys by position; upgrade choice keys
    const baseKey = Ol.prototype.key;
    Ol.prototype.key = function (t, down) {
      const code = String(t.code || "");
      let key = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : String(t.key || "");
      this._rlKey = key.toLowerCase();
      const tag = t.target && t.target.tagName;
      if (down && !t.repeat && tag !== "INPUT" && tag !== "TEXTAREA" && rlChooseKey(code, this._rlKey))
        t.preventDefault();
      // Esc also works while a settings toggle or slider has focus (only text fields keep it)
      if (
        down &&
        !t.repeat &&
        this._rlKey === "escape" &&
        tag === "INPUT" &&
        /^(checkbox|range|radio)$/.test(t.target.type)
      ) {
        (t.target.blur(), this.onPause && this.onPause());
        return;
      }
      return baseKey.call(
        this,
        key === t.key ? t : { key, repeat: t.repeat, target: t.target, preventDefault: () => t.preventDefault() },
        down,
      );
    };
    function rlChooseKey(code, key) {
      if (!ft.chooseShown || ft.overShown || !k("dialog").hidden || k("choose").hidden) return !1;
      const m = /^(?:Digit|Numpad)([1-4])$/.exec(code) || /^([1-4])$/.exec(key);
      if (m) {
        const card = k("cards").querySelectorAll("[data-pick]")[+m[1] - 1];
        card && !k("cards").classList.contains("locked") && ft.choose(card.dataset.pick);
        return !0;
      }
      if (key === "r") {
        k("rerollBtn").disabled || ft.reroll();
        return !0;
      }
      return !1;
    }
    const baseCards = Gl.prototype.renderCards;
    Gl.prototype.renderCards = function (t) {
      // the reroll label survives a re-render (reroll), so drop its old key hint first
      k("rerollBtn")
        .querySelectorAll(".card-key")
        .forEach((e) => e.remove());
      const r = baseCards.call(this, t);
      if (rlKeys()) {
        k("cards")
          .querySelectorAll("[data-pick]")
          .forEach(
            (c, i) => (
              c.classList.add("has-key"),
              c.insertAdjacentHTML("beforeend", `<kbd class="card-key" aria-hidden="true">${i + 1}</kbd>`)
            ),
          );
        k("rerollTxt").insertAdjacentHTML("afterend", '<kbd class="card-key inline" aria-hidden="true">R</kbd>');
      }
      return r;
    };

    // ---- Esc: back in menu pages; from settings opened in the pause menu back to the pause menu
    const basePause = ln.onPause;
    ln.onPause = () => {
      if (!k("dialog").hidden) return basePause();
      if (Ft.rlFromPause) return Ft.back();
      if (ft.mode === "menu") {
        ln._rlKey === "escape" && ["workshop", "records", "settings"].includes(Ft.screen) && Ft.back();
        return;
      }
      basePause();
    };

    // ---- settings from the pause menu
    const closePauseSettings = () => {
      ((Ft.rlFromPause = !1), (k("settings").hidden = !0), k("settings").classList.remove("in-run"));
    };
    Gl.prototype.openPauseSettings = function () {
      if (!ft.paused || k("pause").hidden) return;
      ((this.rlFromPause = !0),
        (k("pause").hidden = !0),
        k("settings").classList.add("in-run"),
        this._show("settings"));
    };
    const baseBack = Gl.prototype.back;
    Gl.prototype.back = function () {
      if (!this.rlFromPause) return baseBack.call(this);
      (closePauseSettings(), (k("pause").hidden = !1), (this.screen = "pause"));
    };
    const baseHidePause = Gl.prototype.hidePause;
    Gl.prototype.hidePause = function () {
      (closePauseSettings(), baseHidePause.call(this));
    };
    Ft.click(k("pauseSetBtn"), () => Ft.openPauseSettings());

    // ---- what each upgrade of the build does (pause menu)
    const info = k("pauseUpInfo"),
      upInfo = (id, lv) => {
        const u = ri[id];
        if (!u) return "";
        const tag = u.evo ? "EVOLUTION" : u.repeat ? `\xD7${lv}` : `LV ${lv}/${u.max}`;
        return `<b>${we(u.name)}</b> <span class="lv">${tag}</span><p>${we(u.desc(Math.max(0, lv - 1)))}</p>`;
      };
    const baseShowPause = Gl.prototype.showPause;
    Gl.prototype.showPause = function (t) {
      const r = baseShowPause.call(this, t),
        own = Zi.filter((n) => t.up[n.id] && !n.repeat);
      own.length &&
        (k("pauseBuild").innerHTML = own
          .map(
            (n) =>
              `<button type="button" class="bi r${n.rarity}" data-up="${n.id}" aria-label="${we(n.name)}">${Ln(n.icon)}${we(n.name)}${t.up[n.id] > 1 ? " \xD7" + t.up[n.id] : ""}</button>`,
          )
          .join(""));
      ((info.hidden = !own.length), (info.innerHTML = '<p class="note">Select an upgrade to see what it does.</p>'));
      return r;
    };
    k("pauseBuild").addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest("[data-up]"),
        w = ft.world;
      if (!b || !w) return;
      for (const o of k("pauseBuild").querySelectorAll("[data-up]")) o.classList.toggle("sel", o === b);
      info.innerHTML = upInfo(b.dataset.up, w.up[b.dataset.up] || 0);
    });

    // ---- run timer and FPS counter
    for (const [id, key] of [
      ["setTimer", "timer"],
      ["setFps", "fps"],
    ])
      k(id).addEventListener("change", () => {
        ((ee.data.settings[key] = k(id).checked), ft.settingsChanged());
      });
    const baseRenderSettings = Gl.prototype.renderSettings;
    Gl.prototype.renderSettings = function () {
      const r = baseRenderSettings.call(this),
        s = this.save.settings;
      ((k("setTimer").checked = !!s.timer), (k("setFps").checked = !!s.fps));
      return r;
    };
    let frames = 0,
      since = 0,
      last = 0,
      fps = 0,
      shown = "";
    const baseHud = Gl.prototype.hud;
    Gl.prototype.hud = function (t) {
      const r = baseHud.call(this, t),
        s = ee.data.settings,
        now = performance.now();
      // a gap (pause, upgrade choice, hidden tab) starts a new measurement
      (now - last > 1e3 && ((since = now), (frames = 0)), (last = now));
      (frames++,
        now - since >= 500 &&
          ((fps = since ? Math.round((frames * 1e3) / (now - since)) : 0), (frames = 0), (since = now)));
      const parts = [];
      (s.timer && parts.push(va(t.time)), s.fps && fps && parts.push(fps + " FPS"));
      const txt = parts.join(" \xB7 ");
      txt !== shown && ((shown = txt), (k("hudInfo").textContent = txt), (k("hudInfo").hidden = !txt));
      return r;
    };
  })();
  Xh();
  Ft.show("home");
  setTimeout(rlRetireToast, 700);
  setTimeout(() => rlRunHealth({ context: "startup" }).catch((e) => ze("health", e)), 900);
  oe
    ? xp()
    : ((hs("playBtn").disabled = !0),
      (hs("continueBtn").disabled = !0),
      (hs("playBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play."),
      (hs("continueBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play."),
      Ft.toast(
        "3D graphics unavailable. The menu remains usable; enable hardware acceleration and reload to play.",
        "warn",
        9000,
      ));
  hp((i) => {
    ((ft.pendingUpdate = i), ft.mode === "menu" && Ft.setUpdate(!0));
  });
  window.__riftTest = {
    selftest: rlSelfTest,
    health: rlRunHealth,
    Aa,
    nr,
    Su,
    mu,
    Eu,
    kp,
    rlUiButtonGuardSelfTest,
    Gl,
    RL_TOUCH_CLICK_GUARD,
    ue,
    Ae,
    ii,
    du,
    ri,
    ai,
    get RL_HEALTH() {
      return RL_HEALTH;
    },
    get game() {
      return ft;
    },
    get ui() {
      return Ft;
    },
    get store() {
      return ee;
    },
    get renderer() {
      return oe;
    },
    get lastRunAudit() {
      return RL_LAST_RUN_AUDIT;
    },
    get monitor() {
      return RL_MON;
    },
    get data() {
      return {
        Zi,
        En,
        lu,
        Ip,
        ec,
        Mu,
        Dp,
        cu,
        sp,
        _i,
        si,
        en,
        Kl,
        uu,
        $i,
        ai,
        Qf,
        tp,
        tc,
        Ma,
        Oh,
        zh,
        sr,
        rlShotSfx,
        RL_ENEMY_TIPS,
        RL_MESH_TYPES,
        RL_BIOME_HAZARD,
        RL_KITERS,
        rlPaletteIssues,
        rlBiomeDistinct,
        rlSanitizeHistory,
        RL_EVENT_KINDS,
      };
    },
  };
})();
