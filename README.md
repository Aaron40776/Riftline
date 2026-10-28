# Riftline

**Riftline** is a 3D arena roguelite wave shooter for the browser — one arena, six biomes, escalating waves, one broken drone against all of it. Built with three.js and WebAudio, no framework, no build-time game engine: the game IS the code in `src/`.

**Play it:** https://aaron40776.github.io/Riftline/ — installable (PWA), runs offline after the first visit, playable on desktop and on phones/tablets in landscape.

## What's in the game

- **7 weapons**, each with its own projectile behaviour, plus one evolution path per weapon
- **25 enemy types** with late-run role diversity, champions, elites and **6 bosses** (one per biome cycle), each with phases, enrage and a boss card reward
- **6 biomes** — Blackout City, the Glowmarsh, the Aurora Shelf, the Shattered Core, the Ashfall Caldera and the Glass Flats — each with its own floor, props, hazards (live vents, ice, acid, portals, magma vents, dust devils that move), light, music theme and soundscape
- **61 run upgrades** including 13 evolutions, rarer cards offered more often, no duplicates in one offer
- **19 persistent workshop modules**, milestones through wave 200, threat levels, medals
- **Endless** mode with mutators, and a **daily run** with a fixed seed
- A dynamic wave director that mixes 12+ encounter modes instead of a fixed spawn table

## Controls

| | Desktop | Touch | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | left stick | left stick |
| Aim / fire | mouse | right stick (auto-aim by default) | right stick / auto |
| Dash | Space or Shift | DASH button | A / LB |
| Nova | E, Q or F | NOVA button | X / RB |
| Gadget | G | gadget button | Y |
| Pause | Esc or P | pause button | menu |

Upgrade picks: keys **1–4**, reroll **R**. Phone: hold it in landscape; the game asks politely if you don't.

## Development

```
npm install          # node 22 or newer
npm run build        # bundle src/ into dist/ (esbuild), substitute version + build id
npm run dev          # rebuild on every change
npm run serve        # serve dist/ for a quick look
npm test             # full suite: sim, save, build, deep sound test, full-qa, data-audit, determinism
npm run lint         # eslint, one rule on purpose: no-undef (see "Why a linter" below)
npm run format       # prettier
```

### Which renderer the browser suites use

Every browser-driven suite launches Chromium through `tests/lib/renderer.mjs`, so the backend is chosen
in one place instead of in each file. Set `RIFT_RENDERER` to pick it:

| `RIFT_RENDERER` | Effect |
|---|---|
| unset / `auto` | prefer the real GPU; Chromium falls back to software when there is none. The default, and correct on both a workstation and a GPU-less runner |
| `gpu` | force the hardware path — fails loudly rather than silently measuring software rendering |
| `swiftshader` | force software rasterisation, for byte-identical frame pacing or to reproduce a driver bug |

This matters: software rendering managed 4 fps on a machine whose GPU ran the same build at 61 fps, so a
frame-rate assertion tuned on one measures the host, not the game.

### Probes (measure a change instead of guessing)

The `scripts/` probes stand behind the sound work. They serve `dist/` themselves, so run `npm run build`
first (the npm aliases already do).

| Probe | Answers |
|---|---|
| `npm run probe:mix` | the mix balance at the default volumes, per bus, from numbers rather than taste |
| `npm run probe:music` | the music rules of the deep test, without the multi-minute catalog |
| `npm run probe:place` | how far each ambience bed and far sound sits under the deep-test peak caps |
| `npm run probe:audio` | chaos checks of the audio engine's failure paths |

### The test suites

| Suite | What it proves |
|---|---|
| `tests/sim-node.mjs` | the simulation (combat, waves, economy) in plain node, thousands of checks per run |
| `tests/save-node.mjs` | save sanitize, snapshot round-trips, resume contracts |
| `tests/data-audit.mjs` | weapons/enemies/upgrades/biomes data consistency in a real browser boot |
| `tests/determinism.mjs` | same seed → same fight, 15 cases identical |
| `tests/deep-test.mjs` | renders **every** synthesized sound offline and diffs it; CI caches the result |
| `tests/full-qa.mjs` | boots the real game headless: `files` (boot over network), `offline` (PWA), `run-desktop` (plays a wave) |
| `tests/player-mode.mjs` | plays a whole run with `navigator.webdriver` patched **off** — like a real player: boot, health suite, wave, reload-and-continue, every timed buff chip, a real dash through the DASH button, death, payout, and a deliberate crash to prove the crash report |

`tools/qa.js` runs any suite by name, e.g. `node tools/qa.js player-mode`. CI (`.github/workflows/test.yml`) runs formatting, lint, the full suite and both wave-playing suites on every PR.

One caveat on `deep-test`: the music section renders all six biomes inside a single `page.evaluate`, so on a machine with a modest browser heap it can exceed Chrome's memory and die with `Target crashed` during the music part (after the sound catalog has already reported its count). It reproduces with software rendering too, so it is not the renderer. `scripts/rl-music-probe.mjs` solves the same problem by building one browser per biome; doing that here is a separate change, left verifiable rather than folded in.

The determinism golden (`tests/fixtures/determinism.json`) pins the browser as well as the game: it records floating-point results, so a Chromium/V8 upgrade — or a deliberate gameplay change — moves every digest at once (the sim is chaotic, so one differently-rounded `Math.sin` reseeds the whole run). CI keeps the browser fixed through `package-lock.json`, which is why the file is stable there. Regenerate it with `node tools/qa.js determinism --update`, and say in the commit which of the two moved it.

### Why a linter with one rule

`no-undef` exists because of 3.45.0: the HUD's buff row read a local variable from a neighbouring function as a bare identifier — legal at parse time, invisible to esbuild and to every test (no test had a buff on screen), and it killed a real player's run the first time they dashed. A static undefined-name check fails that class before it ships. That's the whole config.

## Architecture

```
src/
  main.js          boot, wiring, the frame loop, run lifecycle, crash path
  core/
    world.js       the simulation: step, player, enemies, projectiles, economy
    waves.js       wave director: encounter modes, biome cycling, bosses
    ai.js          enemy behaviour
    arena.js       arena geometry, hazards, props
    save.js        localStorage save, snapshot sanitize, import/export
    diagnostics.js health checks, run monitor (test-only), post-run audit, crash reports
    ...            difficulty, mutators, medals, stats, traps, walk (the walker), util
  render/
    renderer.js    three.js scene, enemy/projectile meshes, biome visuals, effects
    overlay.js     2D HUD canvas: health bars, off-screen markers, hints
    interp.js      interpolation between simulation steps
    pacing.js      frame pacing, mobile frame halving
  audio/
    sound.js       the whole sound engine: synthesized music, sfx, room tones, event beds
    place.js       the sounds of the place: biome far-scenes, hazard proximity loops
  ui/
    ui.js          screens, HUD DOM, banners, cards, settings
    input.js       touch sticks and buttons, keyboard, pointer contracts
    gamepad.js     controller reading + rumble
    hud-layout.js  safe areas, HUD element placement
  data/            weapons, enemies, biomes, upgrades, progression, what's new
  sw.js            service worker: one cache per build, updates apply when idle
build.js           esbuild bundling + __RL_*__ placeholder substitution
tests/             the suites above
tools/             qa router, dev server, checkers
```

**Sound:** there are no audio files. Music, weapons, enemies, biome room tones and the far-off scenes (city sirens, marsh frogs, the void's breath) are all synthesized in WebAudio and verified by rendering them offline in the deep test.

## Releases

One version, one branch, one pull request: bump `version` and the build id in `package.json` (`r<version-digits>a<MMDD><letter>-r1`), add the top entry in `src/data/whatsnew.js` (the QA checks that it matches the game version), Prettier clean, suite green. Merging to `main` deploys to GitHub Pages. The service worker serves the new build the next time the game is opened and applies it when the player is idle.

## When something breaks

The game keeps its own flight recorder. A crashed run shows a report (version, device, health checks, the exact frame errors) with a **copy** button — paste it into an issue and it pins the bug down fast. Health checks also run at boot in every test session, so most breakage is caught before it ships.
