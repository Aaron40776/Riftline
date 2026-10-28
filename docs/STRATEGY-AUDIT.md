# Riftline – strategy, quality and technology assessment

10.10.2026 · a Claude Code audit of 3.29.1 (commit `147e140`; the live site served the same build). The owner asked for an
investigation, decisions and a roadmap, not for changes, so nothing in the game was changed. The short version, the open
decisions and the first batch are in `docs/ROADMAP.de.md` ("Strategy audit of 10.10.2026"); this file holds the full report
and, at the end, the raw measurements and how to repeat them.

## Evidence used, and its limits

| Kind | What was done |
|---|---|
| Verified source behaviour | Read the renderer, materials, floor shader, skins, quality presets, main loop, auto quality, overlay, sound engine, scheduler, lifecycle, service worker, manifest and page shell (file:line below). |
| Rendered (software GL) | 22 screenshots of the **live 3.29.1 build** (menu, all 5 biomes, each in a wave and with its boss) at 1440×900 and at 844×390 @2x (phone held sideways), plus `renderer.info` for each. Software rendering: colours, anti-aliasing and speed are not what a phone shows. |
| Measured | Draw calls, triangles, textures, shader programs, JS heap, download size; simulation time per step and WebAudio nodes per second in a crowded fight; offline renders of all 15 music tracks and 17 sound effects through the real engine, measured for loudness, spectrum, stereo and similarity. |
| **Not done** | **No listening** (I can't hear audio; every sound conclusion is a measurement or a reading of the code). No real phone, tablet or GPU, so there are no device frame rates, temperatures or battery numbers. No play-testing for feel. No `npm` scripts: `node_modules` was absent and installing was out of scope, so I drove the deployed build with Playwright from scripts outside the repository. |

The screenshots and audio renders were not committed (size); the appendix says how to make them again.

---

## A. Executive recommendation

**Stay on three.js and the web; change how the game is made, not the engine.** Move to a **hybrid production pipeline**:
- Keep procedural: the simulation, the combat effects and the adaptive music engine.
- Make in Blender (or license) and import as glTF: arena surfaces with baked lighting, landmark and border structures, and later the hero models.
- Rebuild the audio **mix** and add a small set of recorded layers where synthesis is weakest.

Before any art work, do a cheap **mobile frame-budget pass**.

**Strongest systems to keep.**
- A deterministic, well-tested simulation that is cheap on the CPU (0.44 ms per step with 56 enemies, measured on a desktop CPU).
- A tiny download: 405 KB of game script.
- Instanced rendering (68–127 draw calls, 12k–47k triangles in every biome, measured).
- Detailed, readable hazards (lava vents, manholes, ice sheets, portals).
- A large adaptive sound engine with place-based ambience.
- A working PWA with an offline cache and safe updates.
- Unusually strong QA tooling.

**Largest quality limits** (in order of effect on the player):
1. **No sense of place.** Every arena is a flat patterned plane seen from above, with box obstacles and nothing around or below the edge. Blackout City doesn't read as a city. *Seen in the screenshots.*
2. **Readability fights the art.** Enemy "skins" paint the biome's pattern onto enemies (`biome-visuals.js:1462`), so Ember Works enemies and the Crucible blend into the lava floor, and Marsh enemies and the Hive Queen into the camo floor. *Seen.*
3. **The floor is a busy, high-contrast graphic, not a material.** It is about 70 % of every frame, so it is the biggest visual lever, and per pixel probably the biggest GPU cost too (see F; not measured on a device).
4. **The sound is almost all bass.** Measured, not heard:
   - Music: 71–92 % of the energy is below 200 Hz, the centroid is 109–335 Hz, and there is about 0 % above 8 kHz.
   - Explosion, nova, rocket and scattergun sounds: 86–96 % below 200 Hz.
   - Phone speakers reproduce little of that band, and impacts and music mask each other in it.
   - The mix is near mono (L/R correlation 0.91–0.98).
   - This is a likely concrete cause of "all biomes sound pretty much the same" and of the missing Osmos-like shimmer.
5. **No frame cap on Auto or High** (`main.js:221-225, 883`). On 90/120 Hz Android phones the game renders up to 120 fps, about twice the GPU work and heat for no gameplay gain. *Verified in source; the effect on a device is not measured.*

**Most valuable improvements:**
- a 60 fps cap with a pixel budget;
- a readability-first art direction (calm floors, enemies that contrast, a boss presence);
- a Blackout City pilot with baked-light authored surroundings;
- a spectral and stereo remix with transient layers;
- a device test loop with the owner and friends.

**Engine:** Godot's web export is materially worse for this game, so a proof of concept is not recommended (see D).

---

## B. Current-state assessment (what matters for the future)

**Graphics pipeline** (`render/renderer.js`)
- WebGLRenderer with MSAA (off in Saver) and no tone mapping.
- Lights: hemisphere, sun, a fill light (3.29.0) and two point lights (`renderer.js:415-436`).
- Every lit object uses `MeshLambertMaterial` with flat shading plus `onBeforeCompile` patches (`renderer.js:261`, `biome-visuals.js:1462`). There is no PBR, no texture maps (4–5 small canvas textures in total), no shadow maps (blob shadows) and no post-processing (Ultra was removed in 3.28.2, rightly).
- Models are merged code-built primitives with vertex colours (`render/models.js`); enemies are instanced per type.
- The floor is one 100×100 `ShaderMaterial` plane with per-biome procedural patterns (`biome-visuals.js:167, 283-432`).

Verdict: technically lean and well organised. The visual ceiling comes from **the production method** (everything is primitives and procedural patterns) and from **art direction** (decoration competes with gameplay), not from three.js.

**Environment production.** Props, borders and details are placed by code per biome (`biome-props.js`, about 1,000 lines). That works for scatter, but it is a slow and poor way to author silhouettes, landmarks and material detail.

**Audio.**
- All synthesis: about 5,300 lines in `sound.js` and 650 in `place.js`.
- Chain: compressor, limiter and soft clip, with 2–3 convolution reverbs.
- 24 effect voices (`sound.js:228`).
- The music scheduler runs on the main thread (30 ms timer, 140 ms lookahead; `sound.js:3577`).
- The structure is sophisticated and adaptive. The weak point is spectral balance and width (measured, see E).

**Gameplay.**
- Content: 20 waves, 5 bosses, 7 weapons, 60 upgrades, 25 enemies, Endless, Workshop, Daily, Pacts, medals, codex, death recap.
- Feedback already includes hit-stop, slow motion, shake and death sounds by family.
- The game is not short of systems; it is short of **legibility and presence**.

**Performance (measured on the live build, headless).**
- Download: 405 KB script plus about 43 KB of fonts. JS heap 18–21 MB. 16–26 shader programs.
- CPU: simulation is cheap; about 94 WebAudio nodes are created per second in a busy fight.
- GPU: unknown on real devices.

**Distribution.**
- GitHub Pages; the static site works from any sub-path.
- Service worker: network-first page with a 3 s fallback, cache-first assets, and updates applied only outside a run.
- Manifest set to landscape and standalone.
- Wake lock is used. There is no Fullscreen API use, and no install hint.

---

## C. Five-biome review

Visual notes come from the screenshots; audio notes from the measurements. One table per biome: what to keep, the weaknesses, and the highest-value changes.

**Blackout City (yard)**

| | |
|---|---|
| Keep | Wet asphalt with worn yellow road markings, arcing manholes, the red emergency accent; rain, thunder with lightning and sirens with their light (the sound/light link is excellent). |
| Weakest | Obstacles are black boxes; there are no curbs, cars, buildings or street furniture, so it doesn't read as a city. The floor blotches read as stains. The first wave (Blackout event) is very dark on phones. |
| Visual | Authored street kit: a curb and sidewalk ring, barricades, a wrecked car, a bus stop, building façades dropping away below the arena edge with a few lit windows and one flickering sign. Baked AO and light. A dark floor with puddles in specular highlights only. |
| Audio | Keep the noir theme; move energy up (electric-piano and rain-on-metal transients at 1–5 kHz), widen the rain bed. |

**Ember Works**

| | |
|---|---|
| Keep | The lava vents (the best hazard art in the game), anvil and steam ambience. |
| Weakest | A Voronoi lava-crack pattern covers the whole floor; enemies wear the same lava skin (camouflage); the Crucible disappears into the floor on the phone. |
| Visual | Dark iron plates and grating, with lava only in a few channels; a furnace or crucible-pour landmark at one edge; heat shimmer only near vents. Enemies keep their own colours with a hot-edge accent. |
| Audio | The forge taikos sit around 100–150 Hz; add a metallic clang transient layer around 2–4 kHz. |

**Cryo Vault**

| | |
|---|---|
| Keep | Ice sheets with frost and cracks, crystal props, Whiteout fog. |
| Weakest | Pale, low-contrast palette (white-grey enemies on pale ice); shield rings dominate; box obstacles. |
| Visual | A deeper blue-black floor under glossy ice; frozen machinery (cryo pods, vault doors) as landmarks; a cold rim light; enemies warmer or darker for contrast. |
| Audio | The most natural home for glassy bells and a wide shimmer, which the spectrum now lacks (2–8 kHz is 1.8–2 %). |

**Toxin Marsh**

| | |
|---|---|
| Keep | The bubbling acid pools, logs, frogs, insects and the bayou idea. |
| Weakest | **The worst readability:** a camo floor plus camo enemy skins plus a green Hive Queen. The lime acid discs look flat. |
| Visual | Separate land from water clearly (dark, reflective water against mud banks); reeds and dead trees at the border; low mist bands; enemies drop the camo skin. |
| Audio | Calm-marsh music has the lowest centroid of all (147 Hz) and the boss track is 92 % below 200 Hz; give the kalimba and insect layers presence. |

**Void Core**

| | |
|---|---|
| Keep | Portals, rune stones, the floating-slab edge, the heartbeat. |
| Weakest | A generic neon hex grid at high contrast, a magenta wash, wireframe props. |
| Visual | An obsidian floor with sparse glowing runes; an abyss below with slowly drifting debris (cheap parallax); one accent colour. |
| Audio | Has the widest boss track (side/mid 0.18); keep the reversed swells, and add choir air above 4 kHz. |

**Pilot biome: Blackout City.** Every player sees it first (waves 1–5), it has the largest gap between its name and what is on screen, and its rain and city sounds are already the most developed, so the audio pilot fits. Ember Works is the alternative if the owner prefers the most "dramatic" biome.

---

## D. Technology and production options

**Comparison**

| | A. three.js, procedural only | **B/C. three.js, hybrid authored (recommended)** | Godot 4.x web export |
|---|---|---|---|
| Visual ceiling | Limited by primitives and code-placed detail | High: baked lighting, real silhouettes and textures where they matter | Web export uses the **Compatibility renderer only** (Godot 4.7 docs): no Forward+ or Mobile features on the web |
| Mobile web performance | Good (light scene) | Good if budgets hold (static meshes, baked light) | Runs as WebAssembly; the docs say native mobile performs much better than web, and Safari has WebGL 2 issues |
| Download | 0.45 MB | About 2–4 MB with assets (estimate) | Engine `.wasm` plus `.pck` are "usually large", needing server compression (docs; no exact figure verified) |
| Audio | Full WebAudio | Full WebAudio | Web "Sample" mode has **no audio effects, no reverb and no procedural generation**; "Stream" mode adds latency |
| Code reuse | 100 % | About 95 % (the renderer gains a loader and materials) | About 0 %; about 39k lines and the test toolchain would have to be rewritten |
| Development speed | Slow for art | Fast for art, same for code | Better editor, but a rewrite measured in months |

- **Babylon.js** offers no Riftline-specific advantage (it is the same WebGL/WebGPU platform), and switching would be a renderer rewrite.
- **WebGPU** (three.js `WebGPURenderer` with a WebGL 2 fallback; Safari has WebGPU since iOS 26) is not worth it now. The game's `onBeforeCompile` shader patches would need a rewrite in three.js's node shading language (TSL), and the baseline has to run on WebGL 2 anyway. Revisit later.

**What should change in production:**

| Content | How it should be made |
|---|---|
| Arena surfaces and borders, landmarks, obstacles | **Authored in Blender** as a modular kit with a shared trim sheet / atlas. Lighting and AO **baked** into a texture or vertex colours: the arena is static and the camera nearly fixed, so baked light gives the "professional" look at almost no runtime cost (unlike Ultra). Exported as GLB, optimised with `gltf-transform` (meshopt geometry, compressed textures). One GLB per biome, loaded lazily while the previous biome is played and cached by the service worker. |
| Floor | Authored tileable material or decals, plus a little procedural variation; the static procedural layers become a texture **baked once per arena** (render-to-texture at `setBiome`). |
| Enemies and bosses | Stay procedural in phase 1 (they are readable, instanced and animated by code); fix the skins and scale first. Authored hero models for the 5 bosses only after the pilot proves the pipeline. |
| Effects, telegraphs, particles, hazards' animated parts | Stay procedural: dynamic and cheap, and they already work. |
| Licensed assets | CC0 sources (Poly Haven, ambientCG textures; Kenney or Quaternius models) are safe, but their style is either realistic or cartoonish, so expect to kit-bash and restyle. Avoid NC licences; CC-BY needs credits in `THIRD-PARTY-NOTICES.txt`. Nothing was downloaded in this audit. |

**Material model:** prefer Lambert (or a small custom lit shader) plus baked light, with a matcap or spec term only on hero props. Test `MeshStandardMaterial` only as an A/B in the pilot; PBR with environment maps on every pixel is the kind of cost that sank Ultra.

---

## E. Audio strategy

**Measured** (offline renders of the live engine; not listened to):

| | Calm themes | Boss tracks | Impacts (boom, nova, rocket, scatter) |
|---|---|---|---|
| Energy below 200 Hz | 71–87 % | 78–92 % | 86–96 % |
| Energy above 2 kHz | 0.9–2.6 % | 0.2–3.4 % | 0–6 % |
| Loudness | −30 to −33 LUFS | −19 to −21 LUFS | — |
| Stereo L/R correlation | 0.91–0.98 | 0.92–0.98 | near mono |
| Similarity of tonal balance between biomes | 0.86–0.96 | 0.93–0.98 | — |

- Calm themes are about 11 dB quieter than boss tracks.
- Dynamic range within 30 s is 1–4 LU: little evolution.
- The small hit sound lasts 7 ms at −31 dBFS.
- Only the rail and tesla sounds have real high-frequency content.

**Interpretation (hypothesis, owner's ears decide):**
- On phone speakers most of the mix is cut away, and what remains is a thin midrange shared by music and effects.
- On headphones it is boomy and narrow.
- Biomes differ mostly in melody and rhythm, not in timbre.

**Recommendation: hybrid, with the mix first.**

1. **Keep procedural:** the adaptive music engine, the place scheduler, the hazard sounds and the UI sounds. Synthesis is strong for tonal, adaptive and varied material.
2. **Mix pass (no assets, highest value):**
   - High-pass the music beds at 60–90 Hz, and the music generally under combat.
   - Give each biome one bright signature voice in 1–6 kHz (glass bells for the Vault, rain plinks for the City, kalimba for the Marsh, choir air for the Void, anvil ring for the Works).
   - Keep the sub band for the boss kick and the big impacts only; duck the music's lows on big impacts.
   - Ambience beds wide but mono-compatible; effects centre-weighted.
   - A loudness target per category, and a smaller calm-to-boss jump (about 6–8 dB).
   - Lock all of it in tests, the same way the noise ratio was locked in 3.7.0.
3. **Recorded layers, where synthesis is weakest:**
   - Explosion and impact transients (crack, debris), metal hits, footsteps on wet ground and metal, and 6–10 ambience one-shots per biome (rain on metal, a foundry clank, ice creak).
   - Randomise pitch, filter and pan procedurally so repeats don't tire.
   - Budget ≤1.5 MB in total, mono effects at 96–128 kbps, decoded after the first tap, cached by the service worker.
   - Use **AAC (.m4a) or MP3**, which every target browser decodes; Opus support in Safari needs checking first.
4. **Workflow:** REAPER (or Audacity for simple edits) → normalise per category (for example effects peaking at −1 dBTP, beds at a fixed LUFS) → export → A/B preview with the existing `scape-preview` tool → the owner listens on a **phone speaker and on headphones** before merging. Sources: CC0 (Freesound CC0 filter) or your own recordings; check every licence.

**Replace or redesign first:** `boom`, `nova`, `rocket` and `scatter` (impact weight on phone speakers), then the five calm themes' signature voices, then the Blackout City beds for the pilot.

**Device check needed:** `navigator.audioSession.type = "ambient"` (`sound.js:662`) lets the iPhone silent switch mute the game. That is a deliberate trade-off (it mixes politely with other audio), but many friends will have their phone on silent. The owner should decide; `playback` ignores the switch. I found no handling of the iOS `interrupted` audio state: test a phone call during a run.

---

## F. Mobile performance strategy

**Most consequential costs** (CPU and memory are measured as low; the GPU ones are inferred from source, not measured):

1. **Uncapped frame rate** on Auto and High (`main.js:221-225, 883`). On 120 Hz Android this can mean about 2× the GPU work and heat. Fix: cap at 60 by default on touch devices, with a "Max" option. Auto quality only reacts below 48 fps (`main.js:1450`), so a phone that is hot but still above 48 fps is never relieved.
2. **Pixel fill.**
   - High renders at DPR 2 (an 844×390 CSS viewport becomes 1688×780; full-HD phones more).
   - Every pixel runs the floor shader (3×3 Voronoi, several fBm calls, a six-light `exp` loop) plus transparent and additive particles (up to 1,400).
   - Fix: bake the static floor layers to a texture per arena; set a pixel budget (for example ≤1.6 MP for the 3D canvas in the baseline) instead of a fixed DPR.
3. **The 2D overlay** is a full-screen canvas at up to DPR 2, cleared and redrawn every frame (`overlay.js:72, 84`). Cap it at 1.5 and measure.
4. **Audio on the main thread:** the 30 ms scheduler and about 94 nodes per second. Fine on desktop; watch for dropped notes on slow phones (the engine already counts `musicSkipped`).

**Tiers** (one renderer with switches, not three implementations):

| | Baseline (default, all phones) | Enhanced (opt-in "High", capable devices) | Saver (fallback) |
|---|---|---|---|
| Frame rate | 60 fps cap | 60, or Max on request | 30 fps |
| Resolution | Pixel budget about 1.6 MP, MSAA | DPR up to 2 | DPR 1, no MSAA |
| Scene | Baked floor, all gameplay effects | More particles, live floor animation, extra ambient motion | 500 particles, fewer ambient props |
| Audio | 1 reverb | Both reverbs | 1 reverb |

The baseline must look **the same** as High in composition and art. Enhanced adds density and smoothness, not the look.

**Proposed budgets** (starting points to confirm on devices):
- Draw calls ≤150 and triangles ≤150k in the worst wave.
- GPU texture memory ≤48 MB.
- JS heap ≤80 MB.
- First load ≤3 MB, the whole game ≤8 MB.
- p95 frame time ≤16.7 ms on the reference mid-range Android.
- No drop below 50 fps after 15 minutes of play (thermal).

**Measurements needed:** build a `?perf` readout on top of the existing run monitor (`diagnostics.js:742` already records frames, slow frames and the worst frame per run). It should show fps, p95 frame time, DPR, draw calls and the elapsed time. Friends screenshot it after 10 minutes. Device matrix:
- a low-end Android (3–4 GB RAM, Mali-G52 class);
- a mid-range 120 Hz Android;
- an older iPhone (SE 2, 11 or 12 class) and a current iPhone;
- an iPad;
- a laptop with an integrated GPU (Windows) and a Mac.

---

## G. Distribution and hosting

**Recommendation:**
- **Keep GitHub Pages as the one public link.** It already works offline as a PWA, and hosting does not change frame rate.
- Use **Cloudflare Pages only as a preview host for pull requests** (a URL per PR to open on a phone before merging). It directly serves the lesson of Ultra, "judge on the real device". It needs the owner's approval and the dashboard set-up, and production stays on GitHub Pages.
- The roadmap's plan (a Worker plus a D1 leaderboard, then GitHub Pages switched off) only makes sense if the leaderboard is wanted, and it changes the origin, which loses `localStorage` saves. Leave it parked until the owner says go.

**Small, high-value additions:**
- A **Fullscreen button on Android and desktop.** In a browser tab held sideways, the browser bars take a large share of a roughly 390 px tall viewport, and `lockLandscape()` only works in fullscreen or an installed app. iPhone Safari has no element fullscreen, so there show a one-time "Add to Home Screen for full screen" hint.
- A **save export/import** that is visible to players. iOS home-screen apps likely keep storage separate from Safari (to verify on a device), and any host change needs it too.
- Extend the service worker precache to biome assets once they exist (`build.js` already checks the precache list).

**Compatibility matrix:**

| Platform | Status | To test |
|---|---|---|
| Desktop Chrome / Edge | Verified by automated tests (software GL) | Integrated-GPU laptop frame rate |
| Desktop Firefox / Safari | README: checked by hand; not verified here | One session each |
| Android Chrome | **Unverified on a device** | 120 Hz heat, fullscreen, rotate screen, vibration |
| Samsung Internet | Unverified | Smoke test |
| iPhone Safari | **Unverified** | Silent switch, rotate screen, audio interruption, memory, installed-app storage |
| iPad Safari | Unverified (landscape-only via the rotate screen) | Layout, touch |

---

## H. Ranked improvements

| ID | Pri | Conf. | Change | Evidence | Impact | Cost / risk | Done when |
|---|---|---|---|---|---|---|---|
| P1 | P0 | High (cause) / medium (effect) | 60 fps cap by default on touch devices; Auto reacts to a budget, not only to < 48 fps | `main.js:221-225, 883, 1450` | Less heat and battery on 90/120 Hz phones | XS; nil risk | Measured on one 120 Hz Android: fps ≈ 60, lower temperature over 15 minutes |
| M1 | P0 | High | `?perf` readout plus a device test protocol | `diagnostics.js:742` | Makes every later decision evidence-based | S | Readings from ≥4 devices in the roadmap |
| R1 | P1 | High (seen) | Readability pass: enemy skins become an accent only; floor contrast and saturation down; bosses bigger with a clear silhouette and spawned away from the HUD bar; tips placed off the play area on phones | Screenshots; `biome-visuals.js:1462` | Fairer combat, clearer bosses, a calmer look | S–M; changes the look in every biome (owner's eye) | Side-by-side shots; on the phone the owner finds each boss and every enemy at a glance |
| A1 | P1 | Medium (measured, not heard) | Audio mix pass: spectral reallocation, signature voice per biome, impact transients, width for beds, loudness targets with tests | `audio-stats.txt`, `sfx-stats.txt` | Better sound on phone speakers and headphones; biomes more distinct | M; procedural only | Above-200 Hz share and biome similarity improve in the tests; the owner prefers the A/B on a phone speaker |
| V1 | P1 | Medium | **Blackout City pilot:** Blender kit, baked lighting, border and backdrop, quiet material floor; glTF pipeline with meshopt and compressed textures; lazy load | Screenshots; C | The core "professional look" proof | M–L; adds the asset pipeline and loader | Owner and friends judge on phones: "clearly better"; budgets in F hold on the low-end Android |
| P2 | P1 | Medium | Floor statics baked per arena; overlay DPR capped; pixel budget | `biome-visuals.js:296-430`, `overlay.js:72` | Lower GPU cost at the same look | S–M | Before/after device readings |
| D1 | P2 | High | Fullscreen button (Android/desktop), iOS install hint, visible save export/import | `index.html`, `main.js:867` | More screen for friends on phones; safe saves | S | Works on Android Chrome and iPhone |
| A2 | P2 | Medium | Recorded impact and ambience layers (≤1.5 MB) | E | Weight and realism | M; licences, download | A/B approved by the owner |
| V2 | P2 | Medium | Roll the pilot's method out to the other four biomes, one PR each | C | Coherent world | L | Same gates as V1 |
| V3 | P3 | Low | Authored boss hero models | — | Boss presence | L | After V2 |
| H1 | P3 | High | Cloudflare PR previews | G | Device review before merge | S; owner's dashboard | Preview URL per PR |

**Not recommended now:** more weapons, upgrades, currencies or meta systems (there are already Daily, Pacts, medals, Workshop, Threat and Endless mutators), a WebGPU port, an engine switch, cloud saves or a backend.

---

## I. Implementation roadmap

Each batch is a small PR with a release. Visual-only batches leave `tests/determinism.mjs` unchanged; screenshot baselines are re-checked by eye.

| # | Kind | Batch | Systems | Validation | Owner decision |
|---|---|---|---|---|---|
| 1 | Performance | P1 frame cap and Auto policy; M1 `?perf` readout | `main.js`, `diagnostics.js`, settings UI | `npm run check`, full QA settings section; **one 120 Hz Android and one iPhone** | Default cap on desktop too? |
| 2 | Evaluation | Device baseline: owner and 2–3 friends run `?perf` on the matrix (F) | none | Readings written to the roadmap | Which devices are "must run well" |
| 3 | Visual (art direction) | R1 readability pass, plus a 1-page art-direction sheet (palette per biome, a value hierarchy floor < props < enemies < threats, shape language) | `biome-visuals.js` skins and floor uniforms, boss scale and spawn, tip placement | Biome and attack shots, attack telegraph check; owner on phone | Approve the art direction and a reference image |
| 4 | Audio | A1 mix pass (procedural only) | `sound.js`, `place.js`, deep-test audio checks | New spectral and loudness tests; `scape-preview` MP3s; owner listens on phone speaker and headphones | Accept the new mix; the iOS silent-switch policy |
| 5 | Architecture experiment | Asset pipeline skeleton: GLTFLoader (plus meshopt, compressed-texture decoder if used), biome asset manifest, lazy load, service-worker precache, size check in `build.js` | renderer, `build.js`, `sw.js` | Offline test (full QA PWA section), download-size check, load while playing | Licence policy for assets |
| 6 | Visual production (pilot) | V1 Blackout City kit plus baked light, P2 floor bake for this biome | `biome-props.js` (yard), new `assets/` | Shots, budgets on the low-end Android, 15-minute thermal run | **Go / no-go for the rollout** |
| 7 | Audio production | A2 recorded layers for Blackout City and the four impacts | `sound.js`, assets | A/B previews, size budget | Approve the sound |
| 8 | Distribution | D1 fullscreen, iOS hint, save export/import | `ui/`, `index.html` | e2e on 4 sizes; iPhone and Android by hand | — |
| 9–12 | Visual and audio production | Rollout per biome (Works, Vault, Marsh, Void) | per biome | As 6 and 7 | Per biome |
| later | Optional | V3 boss models; H1 previews; Cloudflare leaderboard only if wanted | — | — | Owner |

**Bug fixes:** this audit confirmed no new functional defects. The frame-rate cap is a performance defect (batch 1); the audio interruption and silent switch are device checks (batches 2 and 4).

**Regression risks:**
- Telegraph readability whenever floors or effects change: re-run the attack shots each time.
- Service-worker caching of new assets: the offline test.
- Load hitches when a biome's assets arrive mid-run: preload during the upgrade choice.

---

## J. Remaining uncertainty and the smallest next step

| Not established | Smallest step |
|---|---|
| Real GPU cost, heat and fps on phones (the size of the floor-shader and frame-cap effects) | Batch 1, then `?perf` on one 120 Hz Android and one iPhone for 10 minutes, with the cap on and off |
| Whether the measured bass-heavy mix actually *sounds* bad | Owner listens to the 15 previews (`node tools/qa.js scape-preview music` → `tests/shots/scapes/*.mp3`) on a phone speaker and on headphones |
| Whether baked authored surroundings look better on a phone than the procedural look | One graybox-plus-bake test of Blackout City's border in Blender before building the whole kit |
| iOS behaviour: silent switch, audio interruption, home-screen storage, rotate screen | A 15-minute session on an iPhone with a checklist |
| Gameplay feel, pacing, difficulty of the first Endless boss | Watch two friends play their first run (they think aloud); the existing `npm run balance` / `npm run sim` for numbers |
| Godot web download size and Safari stability | Not needed unless the hybrid three.js pilot (batch 6) fails |

**Preferred direction, in one line:** three.js on the web with a hybrid pipeline (authored, baked-light environments and recorded accent sounds on top of the procedural game, effects and adaptive music), mobile-first budgets, and every look judged on real phones.

**First batch of work:** batch 1 (60 fps cap, Auto policy, `?perf` readout), then batch 2 (device baseline) and batch 3 (readability and art-direction pass).

---

## Appendix: raw measurements (live 3.29.1, headless Chromium with SwiftShader, 10.10.2026)

### Render statistics per biome

`renderer.info` about 3–4 s after the wave started, Graphics setting High. For waves, 8 enemies were placed around the drone;
for bosses, the boss alone. Each column is given as PC (1440×900, DPR 1) / phone held sideways (844×390, DPR 2).

| Biome | Shot | Draw calls | Triangles | Shader programs | Transparent meshes |
|---|---|---|---|---|---|
| Blackout City (yard) | wave | 79 / 75 | 21.8k / 24.4k | 16 | 9 / 8 |
| Blackout City (yard) | boss | 97 / 87 | 12.6k / 12.7k | 19 | 19 |
| Ember Works | wave | 106 / 127 | 32.0k / 37.1k | 21 | 8 |
| Ember Works | boss | 94 / 85 | 26.6k / 26.6k | 21 | 13 / 14 |
| Toxin Marsh | wave | 89 / 119 | 44.0k / 47.5k | 22 / 23 | 15 / 17 |
| Toxin Marsh | boss | 84 / 70 | 34.9k / 33.7k | 23 | 18 |
| Void Core | wave | 121 / 117 | 18.7k / 24.0k | 24 | 13 / 20 |
| Void Core | boss | 73 / 71 | 16.0k / 15.8k | 24 | 18 / 17 |
| Cryo Vault | wave | 106 / 122 | 25.2k / 25.5k | 26 | 51 / 81 |
| Cryo Vault | boss | 82 / 68 | 17.3k / 16.7k | 26 | 53 / 52 |

Further figures:
- Textures in GPU memory: 4–5.
- JS heap: 18 MB (PC), 21 MB (phone).
- Download: game script 405 KB over the network (1.32 MB unpacked) plus about 43 KB of fonts.
- Lights: one hemisphere light, two directional lights, two point lights.

### Crowded fight (CPU side)

Wave 18 with 56 enemies, 15 s of play; sound unlocked and running:
- `world.step`: 0.44 ms on average, 5 ms at most (desktop x86 CPU; a phone is slower).
- Web Audio nodes created per second: about 34 gain, 23 oscillator, 21 stereo panner, 12 biquad filter, 4 buffer source.
- 12 effect voices alive; 119 draw calls; 43k triangles.

The renderer's own time is not meaningful here (software rendering).

### Music

Offline renders through the real engine with its reverbs, 30 s per track (40 s for "calm-quiet"), first 2 s skipped.
The spectral columns are shares of the energy.

| Track | LUFS | LRA | Centroid Hz | < 200 Hz | 200 Hz – 2 kHz | 2–8 kHz | > 8 kHz | Side/mid | L/R correlation |
|---|---|---|---|---|---|---|---|---|---|
| calm-quiet yard | −31.6 | 1.8 | 295 | 71.3 % | 26.1 % | 2.1 % | 0 % | 0.19 | 0.93 |
| calm-quiet works | −30.8 | 1.6 | 235 | 77.8 % | 19.0 % | 1.6 % | 0 % | 0.21 | 0.91 |
| calm-quiet vault | −31.6 | 2.0 | 282 | 71.9 % | 23.6 % | 2.0 % | 0 % | 0.17 | 0.94 |
| calm-quiet marsh | −32.8 | 2.5 | 156 | 84.8 % | 12.1 % | 0.8 % | 0 % | 0.13 | 0.97 |
| calm-quiet void | −30.0 | 1.7 | 315 | 73.8 % | 24.9 % | 1.4 % | 0 % | 0.20 | 0.92 |
| calm yard | −31.3 | 1.5 | 260 | 76.0 % | 21.4 % | 1.9 % | 0 % | 0.16 | 0.95 |
| calm works | −30.7 | 1.5 | 217 | 79.9 % | 17.2 % | 1.3 % | 0 % | 0.19 | 0.93 |
| calm vault | −31.4 | 1.7 | 254 | 74.5 % | 21.1 % | 1.8 % | 0 % | 0.14 | 0.96 |
| calm marsh | −32.3 | 2.1 | 147 | 87.2 % | 9.8 % | 0.9 % | 0 % | 0.09 | 0.98 |
| calm void | −29.8 | 1.6 | 289 | 75.8 % | 23.0 % | 1.1 % | 0 % | 0.17 | 0.94 |
| boss yard | −20.6 | 1.5 | 335 | 78.2 % | 17.9 % | 3.4 % | 0 % | 0.20 | 0.92 |
| boss works | −18.9 | 1.0 | 147 | 89.1 % | 10.1 % | 0.4 % | 0 % | 0.17 | 0.95 |
| boss vault | −19.9 | 1.5 | 192 | 86.1 % | 12.3 % | 1.0 % | 0 % | 0.09 | 0.98 |
| boss marsh | −19.7 | 1.7 | 109 | 92.2 % | 5.9 % | 0.2 % | 0 % | 0.11 | 0.98 |
| boss void | −20.8 | 3.8 | 254 | 79.0 % | 19.4 % | 1.3 % | 0 % | 0.18 | 0.94 |

Similarity of tonal balance between biomes (correlation of the 32-band log spectrum, where 1 means identical): calm
0.86–0.96, boss 0.93–0.98.

### Sound effects

Seeded and centred. "Duration" is the time in which 90 % of the energy arrives.

| Sound | Peak dBFS | Duration ms | Centroid Hz | < 200 Hz | 200 Hz – 2 kHz | 2–8 kHz | > 8 kHz |
|---|---|---|---|---|---|---|---|
| boom | −11.7 | 63 | 110 | 95.7 % | 4.0 % | 0 % | 0 % |
| nova | −5.9 | 161 | 183 | 93.6 % | 3.7 % | 2.7 % | 0 % |
| dCrunch | −19.8 | 34 | 146 | 92.8 % | 6.5 % | 0.5 % | 0 % |
| rocket | −16.5 | 139 | 238 | 87.4 % | 10.0 % | 1.6 % | 0.2 % |
| scatter | −10.1 | 29 | 369 | 86.5 % | 6.9 % | 6.0 % | 0 % |
| step | −32.1 | 10 | 202 | 84.6 % | 13.1 % | 0.5 % | 0 % |
| dClang | −18.6 | 35 | 679 | 56.5 % | 41.3 % | 1.3 % | 0.2 % |
| rail | −9.5 | 85 | 1644 | 50.4 % | 17.3 % | 27.9 % | 4.0 % |
| bigkill | −15.2 | 71 | 639 | 37.7 % | 58.0 % | 4.2 % | 0 % |
| dSquelch | −24.2 | 70 | 310 | 18.2 % | 81.6 % | 0 % | 0 % |
| flame | −30.5 | 216 | 898 | 10.5 % | 83.9 % | 4.5 % | 0 % |
| hurt | −17.2 | 42 | 434 | 6.3 % | 93.1 % | 0.6 % | 0 % |
| eshot | −31.6 | 22 | 407 | 1.3 % | 98.3 % | 0.4 % | 0 % |
| disc | −22.7 | 68 | 852 | 1.2 % | 88.4 % | 10.3 % | 0 % |
| pulse | −25.6 | 16 | 1297 | 0 % | 99.2 % | 0.8 % | 0 % |
| hit | −31.0 | 7 | 1316 | 0 % | 98.5 % | 1.4 % | 0.1 % |
| tesla | −33.0 | 34 | 4712 | 0 % | 0 % | 95.5 % | 4.5 % |

### How to repeat

After `npm install`, the repository's own tools produce the same material:

- `node tools/qa.js biome-shots pc` and `node tools/qa.js biome-shots land`: the biome pictures. Add
  `renderer.renderer.info` to the logged object for the render statistics.
- `node tools/qa.js scape-preview music`: the 15 music tracks as WAV and MP3 in `tests/shots/scapes/`.
- `SoundEngine.renderOffline({ id, seed: 1, stereo: true, wav: true }, 1.5)` in the page: one effect.
- Loudness: `ffmpeg -i file.wav -af ebur128 -f null -`.
- Spectrum: band energies of an FFT of the mid channel (numpy).

Both test scripts also take a URL as their first argument, so they can run against the live site.
