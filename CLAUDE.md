# Riftline

This repository is **Riftline**, the 3D arena roguelite shooter (three.js). **Riftdeck**, the
deckbuilder set in the same universe, is a different game in its own repository
(`Aaron40776/Riftdeck`). Do not mix the two up, and do not change Riftdeck from here.

README.md explains build, commands, project structure and hosting. Read it first. In short:

- The game code is split into ES modules under `src/` (`main.js`, `core/`, `data/`, `render/`,
  `audio/`, `ui/`; see README). three.js comes from npm (`three`, pinned to 0.186.0) and
  `build.js` bundles everything from `src/main.js`. Top-level names are readable (`World`,
  `game`, `ui`, `store` …); new ones follow the same style. Since 2.5.1 nothing is patched from
  outside any more: change classes and functions directly, in the module that owns them. A
  version comment (`// 2.5.1: …`) is kept only where it explains why code looks the way it does.
- Design principle (from the owner): everything fits together organically and dynamically. Mechanics,
  looks and sounds belong to each other (a trap family gets a skin, a model and a sound per biome; music
  and ambience belong to the place), the game keeps getting harder as it scales (waves, Endless), and it
  still looks and sounds good and detailed. New features come with their model, sound, telegraph and
  tests, not as a bare mechanic.
- Format with Prettier (`npm run format`, width 120, `.prettierrc`); CI runs `npm run format:check`.
- `npm test` includes `tests/determinism.mjs`. A refactor must pass it unchanged; update
  `tests/fixtures/determinism.json` (`--update`) only for changes meant to alter game behaviour.
- The version and build id exist only in `package.json` (`version`, `riftline.build`). After a
  bump run `npm install` so `package-lock.json` follows.
- A release also adds a short player-facing entry at the top of `src/data/whatsnew.js` (the What's new tab; the
  first entry must match the version, the QA checks it), its changes at the top of `changes` in `src/build-info.json` and a new
  section at the top of `docs/QA-REPORT.de.txt` (German, same layout as the earlier ones).
- Run `npm test` before every commit. Before a release also run `npm run qa`, `npm run e2e`,
  `npm run audit` and `npm run screens`, and look at the screenshots.
- All changes go through pull requests: work on a branch, open a PR against `main`, and let the
  owner merge it. Never push to `main` directly.
- A push to `main` deploys the game to GitHub Pages. Other branches and pull requests only run
  the tests (`.github/workflows/test.yml`).
- Saves use the `localStorage` keys `riftline.*`. Riftdeck shares the GitHub Pages origin and uses
  `riftdeck.*`; never read or write those.
- The player-facing texts in the game are English. Commit messages and README are English, the QA
  reports German.
