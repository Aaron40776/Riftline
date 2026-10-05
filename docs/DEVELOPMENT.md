# Riftline: development notes

How the code is organised and the rules for changing it. The README covers commands, structure and hosting;
`CLAUDE.md` holds the short working rules for Claude Code sessions.

## How the code got here

Riftline was released as one minified bundle (game code and three.js, built with esbuild) and then
patched by hand for several releases. The module sources the bundle was built from are not part of
the release, so the code was turned back into readable sources step by step:

- 2.4.3: three.js comes from npm (`three`, pinned to 0.186.0 / r186). Each module imports the
  classes it needs by their three.js names (`import { BoxGeometry, Mesh } from "three"`). Updating
  three.js means changing the version in `package.json`, running `npm install` and the full release
  checks.
- 2.4.4: the game code is split into ES modules under `src/`. `build.js` bundles `src/main.js`,
  everything it imports and three.js into one minified file.
- 2.4.5: readable top-level names: `game` (controller), `ui` (instance of `GameUI`), `store`
  (`SaveStore`), `renderer` (`Renderer`), `input` (`Input`), `sound` (`SoundEngine`), `World`
  (simulation), `weaponDefs`, `enemyDefs`, `bossDefs`, `upgradeList`/`upgradesById`,
  `workshopModules`, `milestones`, `threatLevels`, `biomeList`/`biomesById`, `computeStats`,
  `planWave`, `updateEnemy`, `buildLayout` … The imports at the top of each file say where a name
  comes from.
- 2.5.1: the patches of the content packs and later fixes (methods wrapped from outside, up to
  eight times) are folded into the classes and functions, so every method is in one place; local
  variables have readable names; the syntax tricks of the minifier (`!0`, comma chains,
  `a && f()` as a statement …) are plain statements; the self-tests have their own module
  (`core/selftest.js`); `window.__riftTest` uses the real names; Prettier (`.prettierrc`, width
  120) formats everything and CI checks it.

## Working rules

- Every file starts with a comment that says what it contains. `main.js` imports every module.
- Change classes and functions directly, in the module that owns them; nothing is patched from
  outside. Keep a version comment (`// 2.5.1: …`) only where it explains why code looks the way
  it does.
- An imported binding cannot be assigned. Where one module sets a variable of another, the
  owning module exports a setter (`set_RL_RETIRE_NOTE(v)`).
- `tests/determinism.mjs` runs fixed-seed simulations, stat computations, arena layouts and wave
  plans and compares them with `tests/fixtures/determinism.json`. A refactor must pass it
  unchanged. Only a change that is meant to alter game behaviour updates the file
  (`node tools/qa.js determinism --update`), in the same commit.
- `window.__riftTest` (end of `main.js`) exposes the game, UI, store, renderer and data tables for
  the tests.
- `npm run format` formats the code; `npm run format:check` is what CI runs.

## Versions

The version and build id exist only in `package.json` (`version`, `riftline.build`). The sources use
the placeholders `__RL_VERSION__`, `__RL_BUILD__`, `__RL_VERSION_DASHED__` and `__RL_GAME_FILE__`,
and `build.js` fills them in. That keeps the version contract the game checks at start-up
(HTML meta, script name, JS constants, build-info.json, service-worker cache) consistent. `build.js`
also fails if the service worker would precache a file that does not exist.

For a release: bump `version` and `riftline.build` in `package.json` and run `npm install` (so `package-lock.json`
follows), add a player-facing entry at the top of `src/data/whatsnew.js` (the News tab; the QA checks that its first
entry matches the version), add the changes at the top of `changes` in `src/build-info.json`, write a new section at
the top of `docs/QA-REPORT.de.txt`, run `npm run release-check` and look at the screenshots in `tests/shots/`.
