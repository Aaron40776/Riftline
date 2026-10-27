# Riftline — Full Code Audit & Improvement Roadmap

**Repo:** `Aaron40776/Riftline` @ `c1b4840` (main) · **Date:** 2026-10-17 · **Scope:** 39,458 lines in `src/`, three@0.186.0, esbuild build, PWA + service worker, full QA/test suite.

**Method:** four parallel subsystem audits (audio engine, UI/input/bootstrap, three.js render layer, core simulation). Every finding was verified against source with file:line references, and the highest-severity claims were independently spot-checked against the raw files. Earlier audit-pass claims were re-verified and corrected where the actual mechanism differed (see Appendix B).

---

## 1. Executive Summary

The codebase is in genuinely strong shape for a game of this ambition. The simulation is deterministic (zero `Math.random` in sim paths), delta time is clamped and stepped fixed-timestep, all entity arrays are hard-capped, the save system is hardened against corruption and quota errors, disposal on biome switches is correct, and HUD DOM writes are change-detected. Most of the classic indie-three.js failure modes are already handled here.

The real risks cluster in four places:

1. **Audio engine error paths** — two unrecoverable failure modes where a single exception permanently kills music/ambience (H1, H2) or leaks permanently-playing nodes (M2, M3).
2. **Mobile GPU cost** — the static prop layer draws ~230–320 individual meshes per biome (H3), and a full-screen procedural floor shader has no device-tier LOD (M4).
3. **One iOS input gap** — held keyboard keys survive backgrounding because `visibilitychange` never resets input (M1).
4. **A steady stream of per-frame allocations** in render and sim hot paths — small per frame, but constant GC pressure on phones (M8 + LOWs).

**Totals:** 3 HIGH · 8 MEDIUM · ~18 LOW · plus a "verified safe" list to prevent re-chasing non-issues. **No HIGH-severity correctness bug was found in the simulation core.**

---

## 2. HIGH Findings

### H1 — One exception permanently kills the music scheduler (audio)

`src/audio/sound.js:3788-3800` ✅ verified

`startScheduler()`'s interval callback catches any throw from `schedule()` and responds with `this.fail(err)` + `clearInterval(this.timer)`. The `timer` handle is **never reset to null**, and `startScheduler()` is only ever called from `init()` (sound.js:689), which runs once when `!this.ctx`. There is no restart path. Meanwhile the guarded portion of `schedule()` only covers `syncAudio()`/`syncTone()` (3804-3809); the note-stepping loop at 3814-3830 is **unguarded** and drives ~1,100 lines of biome composition code (`yardCalm` 4617, `yardBoss` 4898, `voidBoss` 5168, etc.) with zero try/catch. Any single exception there — a NaN reaching `setValueAtTime`, a `0` reaching `exponentialRampToValueAtTime` (both throw in Chrome) — terminates the interval forever: music, beds, engine hum, room tone, event accents, and voice pruning all die until page reload. One-shot SFX keep working (`play()` is separately guarded), so the game "half-hears" with no recovery.

**Fix:** wrap the loop body so `nextT`/`step` still advance on error and failures are counted; in the interval catch, set `this.timer = null` and re-arm `startScheduler()` with a backoff (e.g. 2 s) instead of clearing forever.

### H2 — `startTone()` mid-build throw orphans permanently-playing nodes and retries every 30 ms (audio)

`src/audio/sound.js:3557-3665, 3685` ✅ verified

`startTone()` has no internal try/catch — unlike `startBed()`, which was hardened in 3.43.1 with register-before-build + try/catch + `deadBeds` (sound.js:3321-3324, 3451-3458). In `startTone`, `gain.connect(this.ambBus)` (3567) and `node.start(now)` (3572, and the noise loop at 861) all happen **before** `this.toneBed` is assigned (3664). A mid-build throw leaves already-started oscillators/noise loops playing forever, and because `toneBed` stays null, `syncTone` retries `startTone` **every 30 ms tick** (3685) — stacking a new orphan set each time. This is exactly the failure shape the 3.43.1 comment says was fixed for beds, but it was missed for the room tone.

**Fix:** mirror `startBed`: assign `this.toneBed = { name, gain, nodes }` before the build switch, wrap the build in try/catch that stops + disconnects `nodes`, disconnects `gain`, and marks a one-strike `deadTone` consulted by the retry at 3685.

### H3 — ~230–320 static draw calls per biome: per-prop Meshes with per-prop geometry (render)

`src/render/biome-visuals.js:462-567` ✅ verified

The yard (Blackout City) builder places jersey barriers every 2.3 m via `rlAlongBorder(W, H, 0.45, 2.3)` (472) with **3 `rlMesh` calls per step, each allocating a fresh `new BoxGeometry`** (475-478). With W=H=18 (`src/data/biomes.js:20-21`) that is 64 border steps → **192 barrier meshes**, plus 8 corner posts (481-485), 4–19 obstacles × 4–10 meshes each (492-557), and 4 manhole discs (560-566). Classic layout ≈ **231 meshes**; director layouts (up to 19 obstacles, `src/core/arena.js:716`) ≈ **310–320**. Meanwhile the detail layer is already merged to exactly 2 meshes (`src/render/biome-props.js:1009-1018`) and enemies are merged + instanced (`models.js:29-31`) — the primary prop layer is the outlier. Each mesh also keeps `matrixAutoUpdate = true`, so three.js recomputes ~300 local matrices every frame for objects that never move.

**Fix:** merge each static prop family into 1–2 meshes per material (reuse `mergeParts`/`meshPart` from models.js, as `biome-props.js` already does), share one unit `BoxGeometry` scaled per instance, and set `matrixAutoUpdate = false` after initial placement (leave it on for animated `rlAnim` props). Estimated result: ~10–15 draw calls per biome.

---

## 3. MEDIUM Findings

### M1 — Held keys survive iOS backgrounding; input never resets on `visibilitychange` (input) ✅ verified

`src/main.js:1541-1552` + `src/ui/input.js:285-306, 48-53`

The `visibilitychange → hidden` handler calls only `game.pause()` (which does a partial `input.reset()` — keys survive by design), `store.save()`, and `sound.suspend()`. Full resets (`reset(true)`) are wired only to `blur` (input.js:48-53) and `pagehide`/`pageshow` (main.js:1553-1560) — but iOS Safari does not reliably dispatch `blur` when backgrounding (and never in standalone PWA mode), and `pagehide` does not fire on app backgrounding. The design comment at input.js:285-288 ("keyup events keep arriving") encodes exactly the assumption iOS violates. Result: with a hardware keyboard on iPad/iPhone, hold W, background the app mid-fight, return and resume → the drone keeps moving until each stuck key is re-pressed. Fix is one line.

**Fix:** in the `hidden` branch add `input.reset(true)` and clear `GamepadReader.prev/held` (main.js:1541-1552). Zero risk to desktop — blur already does the same.

### M2 — `startMusicBed()` throw orphans nodes; track state is committed before the build (audio)

`src/audio/sound.js:3488-3542, 3133, 3142-3143, 3148-3174`

No internal guard; `out` is connected + ramped (3533-3538) before `this.mbed` is set (3541). `syncTrack` commits `playKind`/`playBiome` (3142-3143) **before** the try that calls `startMusicBed` (3157), and its catch only logs. A throw leaves orphaned playing nodes that `stopMusicBed` cannot reach (mbed null), and the "no change" guard (3133) suppresses any rebuild until the next mode/biome change. **Fix:** set `this.mbed = { out, nodes }` before `recipe.build` so cleanup works; move the state commit after the try, or revert it in the catch.

### M3 — `buildGraph()` is not transactional; `unlock()` never retries once a ctx exists (audio)

`src/audio/sound.js:695-696, 663-675`

`this.ctx = ctx` is the first statement of `buildGraph`. If the graph build throws midway (e.g. convolver allocation on a memory-constrained iOS device), the engine keeps a half-built graph forever: missing `fade` makes `syncTrack` silently no-op (3130); missing `sfx`/`atmos` makes every `play()` and `setVolumes` (881-892) throw into `fail()`. Audio is dead for the session even though `ok` is true. **Fix:** build into locals and commit at the end, or null `this.ctx` in the catch so the next user gesture re-runs `init()`.

### M4 — Full-screen procedural floor shader has no device-tier LOD (render)

`src/render/biome-visuals.js:69-74, 107, 253-403`

A 100×100 plane with a `ShaderMaterial` covers essentially every screen pixel every frame. Per pixel: 2× `gridLine` (fwidth), `fbm` = 3-octave value noise (271-275), 9-cell voronoi (277-288), a per-biome style branch (yard style 5 = vnoise + voro + 2× fbm + ripple/lane math), void style adds a starfield with 2 more fbm calls (289-295), plus a 6-light loop (391-396). Resolution scaling exists (dprCap 1.5, Auto quality dpr 1.0–1.5 by FPS, Saver dpr 1 + 30 fps) but **no octave/branch LOD, no half-res floor, no tier gating** — a "High" phone pays 4× a dpr-1.0 phone for identical shader work. **Fix:** bake the static per-biome layer once into a texture (the repo already proves this pattern in `attacks-view.js` `bakeMarks`, 312-316, 498-557) and keep only dynamic terms (player glow, 6 lights, pulse/dark, edge glow) per-pixel; or render the floor to a half-res RT and upscale.

### M5 — Reed sway recomposes and fully re-uploads the whole instance matrix buffer every frame (render)

`src/render/biome-visuals.js:148-163, 910-923, 420`

Marsh only: ~720 reeds (2 per 0.4 m of border). Every frame `ArenaView.update` runs 720× (2× `Math.sin`, `updateMatrix`, `setMatrixAt`) then `instanceMatrix.needsUpdate = true` — a full **~46 KB buffer re-upload per frame** plus 720 CPU matrix composes, with `frustumCulled = false`. The `InstancePool.upload` helper (renderer.js:73-77) already does partial-range uploads, and shader-based sway would cost nothing per frame. **Fix:** move sway into the vertex shader (per-instance `aPhase`/`aSpeed` attributes, bend by `uv.y`, static matrices); at minimum update only changed ranges.

### M6 — Zone & hazard-surface shaders are procedural per-pixel on up to ~120 discs (render)

`src/render/attacks-view.js:129-230` (up to 64 zones), `src/render/hazards-view.js:86-210` (pools up to 24+32+64+64)

`cracks()` alone is a 7-iteration loop + voronoi per fragment; the molten look does voro + 3× fbm; big zones (rain r≈7 m) cover large screen areas. The marks system already solved exactly this by baking looks into a 768×512 atlas (`attacks-view.js:312-316, 498-507`). **Fix:** extend the baked-atlas treatment to zones/surfaces (bake per look×seed-bucket, animate countdown ring/level via instance color), keeping procedural pixels only for the small animated rim.

### M7 — Boss model = 17–31 individual per-part Meshes (render)

`src/render/models.js:1442-1835` — warden 28, queen 28, prism 31, forge 20, core 18 meshes, +2 aux (shadow blob + glow sprite) → **20–33 draw calls** while a boss is on screen, plus per-mesh transparent sorting for prism's 5 transparent materials. The detail passes already merge per material (1682-1686, 1781-1784). **Fix:** merge all non-spinning parts per material (hull/dark/glow → one mesh each); keep only `spin` parts (bar, halo, orbit, wheel, crown, shards) separate → ~7–10 draw calls per boss.

### M8 — Sim hot-path costs: per-bullet spatial queries, per-enemy raycasts, closure garbage (core)

- **`home()` runs a full spatial query per homing bullet per step** (`world.js:2595-2615`, callers 2471/2476). Radius 8 + `maxR` visits ~80 cells; Seeker Rounds/Twin Saws give *every* bullet homing (`stats.js:55`), so a fast Flame build keeps 30–60 bullets alive → thousands of cell visits + callbacks per step, ×5 catch-up steps on slow devices. **Fix:** cache the acquired target on the bullet and re-acquire only every ~0.15 s or on target death.
- **Auto-targeting pays a fresh wall raycast per enemy per step** (`world.js:1326-1346` `pickTarget`, `1302-1321` `assistAim` → `arena.los`). Range ≈ weapon range + 2.5 covers nearly the whole arena; at the 70-enemy cap × ≤19 obstacles that's ~1,300 segment tests per step — while `statusTick` already maintains a cached per-enemy `enemy.los` refreshed every 0.2 s (`world.js:1951-1955`) that targeting ignores. **Fix:** score using cached `enemy.los`; run a fresh `canSee` only for the single winner; early-out on the aim cone before LOS in `assistAim`.
- **Per-frame closure + filter garbage in the step path:** one arrow closure per live enemy in `separate()` (`world.js:2000`), orbital blades closures + full `eb` scan per blade (2858, 2871-2876), and `trails`/`beams`/`hazards` re-`filter`ed into new arrays every frame while non-empty (2951, 2985, 3051); Acid Coating double-filters per frame (993-994, 1010-1011, 1124-1126); same pattern in `boss-cards.js:189/239/313`. **Fix:** in-place write-index compaction instead of `filter`; hoist per-call-site query callbacks to module-level named functions.

---

## 4. LOW Findings (grouped by subsystem)

**Audio (sound.js)**
1. `deadBeds` mutes an event's ambience for the whole session after one throw (620, 3455, 3713) — allow one retry after ~10 s or clear on biome change.
2. `quietOld` allocates a fresh multi-MB convolver on every track change (3231-3256) — pre-build two convolvers and swap.
3. Stolen/finished voices are stopped but never `disconnect()`ed (987-995, 3177-3195, 3471-3475) — harmless in Chrome/Firefox, keeps detached nodes alive longer on Safari.
4. Gestureless resume on iOS is best-effort (918-924 + main.js:1549) — consider a "tap for sound" hint when `live()` is false.

**UI / input / bootstrap**
5. Arrow keys are unconditionally `preventDefault()`ed (input.js:230-239) so keyboard users can't scroll `.scroll` menu lists; Space is *not* prevented in those same lists while menus are open (215-217) — skip arrow prevention inside `.scroll, textarea, input`, prevent Space when it would scroll.
6. `GamepadReader` disconnect doesn't clear `held` (gamepad.js:69-74) → one spurious menu-repeat after reconnect; 1 s idle gate ignores an already-connected pad for the first second of every session (45-47) — clear `held` alongside `prev`; call `pad()` eagerly on first `read()`.
7. `sw.js`: cache-first handler has no offline fallback (53-56), floating `c.put` promise, and `activate` deletes old caches immediately (11-13) while a bfcache-restored page may still request them — add a 504 fallback, catch the put, keep the previous cache one cycle.
8. `offer()` registers a fresh `controllerchange` listener per update offer (main.js:150-163) — register once at module scope.
9. `ui.buffs()` runs every frame and allocates a chips array + joined key string, two unconditional `getById` lookups, and per-chip `querySelector` on each 5% step (ui.js:1201-1282) — the game's hottest DOM path; cache the row element and reuse a scratch array.
10. `fitHudLayout`'s `unfit` set is session-wide and never invalidated by resize (hud-layout.js:51-57, 151-138) — clear entries for an orientation when the viewport grows ≥20%.

**Render (renderer.js / biome-visuals.js)**
11. Per-frame array/closure garbage: `flashes.slice().sort()` every frame (renderer.js:822 ✅ verified), `allPools()` rebuilt per frame with 5 spreads (1623, 571-594), `setBiome` layout object allocated per frame despite early-return (653 + biome-visuals.js:81), `.some()/.filter()` closures (930-932, 2490-2502, 1647-1648), event-time `clone()`s (870, 1080) — cache pools, reuse scratch arrays, hoist the layout object.
12. `matrixAutoUpdate` left on for hundreds of static nodes (see H3) — freeze after placement.
13. Per-obstacle materials in biome builders (biome-visuals.js:493, 509, 535) — one white Lambert with `vertexColors: true`.
14. Floor `PlaneGeometry(100,100)` re-created on every biome rebuild (107) — create once in the constructor.
15. `powerPreference: "high-performance"` even for the Saver battery preset (renderer.js:435) — pass `"low-power"` when quality is battery.
16. `hexColor()` Map lookups inside per-entity per-frame loops (renderer.js:2043-2044, 2161-2165, 2237, 2252, 1849, 1981) — resolve colors once at init like `shardColors` (394).

**Core sim (world.js / traps / data)**
17. Every live beam re-raycasts the arena every step (`world.js:2968` → `arena.rayLen`, arena.js:142-151); Warden Lockdown Grid + Overdrive spawn ~12–24 static beams → ~50k+ obstacle tests per step for the whole attack — compute `cur` once for static beams; re-ray every 4th step for rotating ones.
18. Orbital blades scan all enemy bullets per blade per step (2871-2876; O(4×360) at caps) — use the SpatialHash or skip when `eb` is empty.
19. `killEnemy` parent lookup is a linear scan per kill (2264-2269) — keep a `Map(id → enemy)` or a direct `parentRef`.
20. `snapshot()` drops the death-recap buffers (586-627): `hitLog` and `takenBy` aren't persisted, so a resumed run's end-screen recap only shows post-resume hits — persist the ≤12 plain-object `hitLog` entries; rebuild `takenBy` from `dmgSrc`.
21. **Wave preview misreports traps on boss waves:** `previewWave` returns `traps: n >= 6 && !boss` (world.js:540-553) but `rlPlanTraps` adds floor traps to boss waves from wave 15 (traps.js:53-57, 79) — the pre-wave UI tells the player a wave-15+ boss floor is clean. **Fix:** `traps: n >= 6 && (!boss || n >= 15)`.

---

## 5. Verified Safe — Do Not Re-Chase

These were suspected at some point and are **confirmed non-issues** (with the evidence):

- **dt handling:** sim never sees raw frame dt — clamped to [0, 0.1] and stepped at fixed `1/60` with a 5-step catch-up cap (main.js:918, 970-979).
- **NaN safety:** every division site in world/ai/arena/boss-cards has a `|| 1` / `|| 0.001` guard, including zero-vector normalize in `separate` (world.js:2012-2013) and `resolve` (arena.js:69, 86-97).
- **Array bounds:** all capped — player bullets 420 / enemy bullets 360, enemies ~70-75, pickups ≤~262, splinters 60, brood 4, trails 80, hitLog 12; `fx` cleared per frame.
- **save.js:** fully hardened — wrapped JSON.parse + 256 KB limit, corrupt-save backup + quota flag, newer-build key preservation, idempotent migrations.
- **Determinism:** zero `Math.random` in sim paths (audio only); `restartClock` stale-time hazards neutralized (no entity persists across waves).
- **Trap fairness:** no spawn-kill (wave-start i-frames, traps first-strike ≥3 s, hazard spawn-clear ring); acid chip-ticks bypass i-frames by design via the `rlChipDamage` accumulator.
- **SpatialHash.query** radius expansion convention is correct; **freePoint()** has a 3-tier fallback and never returns null; **gamepad `clearFocus()`** costs nothing when idle (1 s poll gate).
- **Audio voice limiting** is solid: 24 SFX voices with priority stealing + 44 music voices with 8 reserved; expired voices pruned; envelopes ramp to −60 dB before stop (no clicks); no master-volume race.
- **Render lifecycle:** disposal on biome switch/restart is correct (geometry/material/InstancedMesh disposed); no shadow maps (blob shadows only); single 768×512 RT rendered only on biome change; transparent objects have explicit renderOrders; PWA cache is version-named with network-first navigation and menu-idle reload gating.
- **HUD writes** are change-detected via `hudCache` (only `ui.buffs()` noted above); no duplicate event listeners across restarts; no pointer lock (absolute cursor aim) so no requestPointerLock rejection issues.
- **True O(n²) loops** are event-driven and bounded (`lockTarget` every 8 s, `singularityTarget` on gadget use) — negligible.

---

## 6. Performance Priority Matrix (mobile-first)

| # | Issue | Cost today | Fix | Effort | Win |
|---|-------|-----------|-----|--------|-----|
| 1 | H3 prop layer | ~230–320 draw calls + 300 matrix recomputes/frame | merge per material + shared unit geometry + freeze matrices | M | Very high |
| 2 | M4 floor shader | full-screen fbm×3 + voronoi + 6 lights per pixel | bake static layer to texture, keep dynamics per-pixel | M | Very high |
| 3 | M5 reed sway | ~46 KB upload + 720 matrix composes per frame | vertex-shader sway, static matrices | S–M | High |
| 4 | M6 zones/hazards | procedural fill on up to ~120 discs | extend marks atlas baking | M | High |
| 5 | M8 targeting/LOS | ~1,300 raycast segment tests/step at 70 enemies | reuse cached `enemy.los`, cache homing targets | S–M | High |
| 6 | M7 boss meshes | 20–33 draw calls per boss | merge non-spinning parts per material | S | Medium |
| 7 | M8 + L11 allocations | constant minor-GC pressure | in-place compaction + scratch objects | M | Medium |
| 8 | H1/H2/M2/M3 audio | unrecoverable audio death / node leaks | guards + re-arm + register-before-build | S | Reliability |

---

## 7. Feature Roadmap (drafted ideas)

Ordered by leverage given existing infrastructure:

1. **Boss Rush mode** (M) — `boss-cards.js` + wave/arena cycling already exist; a mode flag chaining the five bosses with escalating mutators.
2. **Input-recording ghosts** (M–L) — the determinism infra (seeded sim, `restartClock`, fixtures) makes recorded-input replays feasible: race your previous run, or share ghosts.
3. **Save-in-URL run sharing** (S–M) — `save.js` hardened serializer can encode seed + mutators + progress into a compact URL for click-to-load challenge runs; natural companion to `daily.js` seeds.
4. **Weekly mutator challenge** (S) — `mutators.js` + `daily.js` exist; add a weekly fixed seed + mutator set + local best tracking.
5. **Shader LOD tiers** (M) — octave/branch counts by quality tier for floor + zone shaders (pairs with perf items M4/M6).
6. **Death-recap persistence** (S) — fixes LOW #20 and upgrades the end screen: "what killed you" survives resume.
7. **Prop-merge utility as content enabler** (M) — H3's fix also makes richer, denser biomes essentially free.
8. ~~**Accessibility options** (S) — colorblind-safe accent palettes (accent-driven already), reduced-motion (disable shake/flash decay).~~ **reduced-motion done (3.57.0):** the OS preference is now read live in `renderer.js` (`motionOK`) and stills the camera (shake + recoil); the CSS animations already honoured it. Tested by `tests/a11y.mjs`, wired into `npm run check`. Colour-blind-safe palettes remain open.
9. **Gamepad menu polish** (S) — reader exists; add focus rings, remembered last tab, repeat-delay tuning.
10. **String extraction for i18n-readiness** (M) — UI strings are inline in ui.js; hoist to a data module if localization is ever planned.

---

## 8. Suggested Implementation Order

- **Phase 1 — Reliability guards (all small, ship together):** H1, H2, M2, M3 (audio try/catch + scheduler re-arm + register-before-build), M1 (`input.reset(true)` on hidden + gamepad state clear). *Acceptance:* `npm run test` green; add a chaos test that throws inside track composers and asserts music recovers.
- **Phase 2 — Mobile perf pass:** H3, M4, M5, M6, M7. *Acceptance:* `npm run soak` + `npm run screens`; assert draw-call count via `renderer.info` in a QA shot and flat frame time on a mid-tier profile.
- **Phase 3 — Hot-path allocations & targeting:** M8 items + LOWs 11, 12, 16, 17, 18, 19. *Acceptance:* extend `tests/sim-node.mjs` with a wave-60 Seeker+Halo Endless bot asserting flat per-step time and heap delta.
- **Phase 4 — Small correctness patches:** LOWs 5, 6, 7, 8, 9, 10, 20, 21. *Acceptance:* existing `data-audit` + `determinism` suites stay green.
- **Phase 5 — Features:** roadmap above, in order of desire.

---

## Appendix A — Evidence Quality

All HIGH and MEDIUM findings carry file:line references verified in this pass; the six highest-severity claims (H1, H2, M1, H3, M8/L11 renderer.js:822) were additionally spot-checked by direct file reads. LOW findings cite exact lines but were verified only within their subsystem audit.

## Appendix B — Corrections to the Earlier Audit Pass

| Earlier claim | Status | Correction |
|---|---|---|
| "startTone/startMusicBed missing failure guard" | Partly confirmed, mechanism corrected | Autoplay unlock/ctx-suspend handling is actually safe (unlock on gesture, suspend/resume wired). The real bug is mid-build throw orphaning started nodes + a 30 ms rebuild loop (H2) / committed track state (M2). |
| "Audio scheduler one-throw-kills-audio" | Confirmed | See H1. |
| "Stuck keys on iOS background" | Confirmed | Mechanism narrowed: `game.pause()`'s partial reset already covers touch/mouse; only **keyboard keys** survive, and only when backgrounding outside a fight (pause guard refuses non-fight states) or on iOS PWA where `blur`/`pagehide` don't fire. |
| "Un-scaled procedural fragment shaders on mobile" | Partially confirmed | Resolution scaling exists (dprCap, Auto quality, Saver); what's missing is octave/branch LOD and tier gating (M4). |
| "150–300 static draw calls in yard" | Confirmed, refined | 231 classic / 310–320 director layouts (H3). |
| "25–40 boss draw calls" | Confirmed, narrowed | 20–33 measured across the five bosses (M7). |
| "Per-frame array garbage" | Confirmed | Renderer sites listed (LOW 11); sim-side sites listed under M8. `interp.js`/`pacing.js` are allocation-free. |
| "Reed sway full buffer re-upload" | Confirmed | ~46 KB/frame, ~720 reeds, marsh only (M5). |

---

## Appendix C — Implementation Status (branch `audit-fixes`)

All findings fixed except one deferred item. Commits, in order:

| Commit | Contents |
|---|---|
| `b4a4411` | Phase 1 — H1 (scheduler re-arm + per-step note guard), H2 (startTone register-before-build + deadTone), M2 (startMusicBed cleanup + syncTrack rollback/backoff), M3 (transactional init), M1 (`input.reset(true)` on hidden + gamepad edges cleared); LOWs: deadBeds/deadTone retry after 10 s, stolen/cut/pruned voices disconnected, 2-convolver room pool, gamepad `held` cleared on disconnect, arrows no longer block `.scroll` menus |
| `3b27694` | Phase 4 — wave-preview boss traps, death recap survives resume (hitLog + takenBy snapshotted & sanitized), single controllerchange listener, sw.js 504 fallback + caught puts + 30 s old-cache grace, cached buff row/bars/chips, unfit marks invalidated on viewport growth |
| `7449177` | Phase 3 — M8 (homing target cache, cached-LOS targeting + fresh check on the winner, hoisted separation callback, parent-by-reference), in-place compaction for trails/beams/hazards/slag/splinters/brood/debris/lines/rings/nums, static-beam wall distance cached, Acid Coating partitioned in place, renderer stable-pool cache + flash-sort scratch + setBiome layout reuse |
| `5eaee24` | Phase 2 — H3 (Blackout City props baked per material via `rlMerger`, ~200 draw calls → ~15; obstacles keep the rise group), M5 (reed wind in the vertex shader, static matrices), M4/M6 (`uLod` quality tier for fbm octaves / voronoi cells / starfield / crack rays across floor, zones, marks, hazards) |
| `4805ca5` | Re-audit fix — enemies spawn with their real LOS (the cache used to start blind-true for up to 0.25 s, enough for auto-aim to pick a walled enemy; caught by the `wall-skipped` self-test) |
| `b6293fe` | sw: the old-cache grace must not sit inside activate's waitUntil (offline reload stalled for the grace) |
| (re-check fix) | The new voice detach (Safari memory fix) also fired inside the offline test renders, where the whole graph renders *after* the scheduling pass — every detached voice's window was deleted before it could sound. Deep-test symptoms: Void bloom share 0.00, music level ×0.42, atmosphere share and flatness over cap. The five detach sites are now guarded with `!this.offline`, and stopTone's detach waits out the fade. Offline renders are bit-exact with main again; the Safari fix still applies live. |

**Deferred:** M7 (merging boss parts). The five boss builds scatter post-creation mutations (`rotation.set`, `scale.set`, conditional visibility) across ~125 parts; baking them safely needs per-part transform capture plus visual QA per boss, and the win is modest (20–33 draw calls for the one boss on screen). Recommended as a follow-up with `npm run screens` as the gate.

**Determinism:** the golden fixtures were regenerated with `node tools/qa.js determinism --update` — sanctioned by the tool for changes that intentionally alter simulation behaviour (homing target retention, cached-LOS target selection). Self-consistency holds: same seed twice → identical digest, all 15 cases.
