# Riftline

A 3D arena roguelite shooter. You pilot a small combat drone through 20 waves of the rift, pick
one upgrade after every wave and fight a boss every fifth wave, the boss of the biome you are in.
After each boss the rift moves on to the next biome. After the Rift Core at wave 20 you can keep
going in Endless mode. Shards from every run, won or lost, buy permanent modules in the Workshop.

The game runs in the browser (desktop and phone) and installs as an offline-capable PWA. It is
built with three.js and plain JavaScript. There is no framework.

**Play:** <https://aaron40776.github.io/Riftline/> (GitHub Pages, rebuilt on every push to `main`). Locally: `npm install && npm run dev`, then open <http://localhost:8124/>.

## Controls

| | Keyboard and mouse | Touch |
|---|---|---|
| Move | `W` `A` `S` `D` or arrow keys | drag on the left half |
| Aim and fire | hold the left mouse button (auto-fire shoots the nearest enemy otherwise) | drag on the right half |
| Dash | `Space` or `Shift` | `DASH` button |
| Nova | `E` (also `Q`, `F`) | `NOVA` button |
| Grenade | `G` | `GADGET` button (aimed with the aim stick) |
| Pause | `Esc` or `P` | pause button |
| Pick an upgrade | `1`–`4`, `R` rerolls | tap a card |
| Back in menus | `Esc` | back button |

*Left-handed* in Settings swaps the two touch halves. Keys are read by their position, so on
AZERTY or other layouts the same physical keys (where W A S D sit on QWERTY) move the drone.

## Content

| | |
|---|---|
| Weapons | 7, unlocked with shards: Pulse Blaster, Scattergun, Arc Caster, Railgun, Rocket Pod, Disc Launcher, Ember Jet |
| Enemies | 25 types with their own models, plus biome champions; enemies and bosses wear a skin of the biome (lava veins, frost, slime, void glow) |
| Look and sound | Procedural low-poly models with a silhouette of their own for the drone, 25 enemies and 5 bosses, animated per instance; all sounds and music are synthesised with WebAudio (no audio files); every biome has its own calm theme over an atmosphere of its place (wind, insects, machines, rain, drones) and a hard boss track (double-tracked distorted guitars, blast beats, breakdowns) that starts when the boss appears; sounds are panned by where they happen and big blasts ring out in the room of the biome; Settings can preview the music |
| Bosses | 5, one per biome: The Warden (Neon Yard), The Crucible (Ember Works), Frost Prism (Cryo Vault), Hive Queen (Toxin Marsh), Rift Core (Void Core); a boss wave brings the boss of its biome, its hull follows the wave (5, 10, 15, 20) and grows by a quarter per boss before it (at most double); every later boss rests less between attacks; enraged, each boss adds its Overdrive attack (Warden: laser lockdown grid, Crucible: expanding lava rings, Prism: three-beam whiteout, Queen: acid plague, Core: collapse), and the Warden, Crucible and Prism call reinforcements of their biome |
| Biomes | 5, one per boss cycle: waves 1–5 Neon Yard, 6–15 two of Ember Works, Cryo Vault and Toxin Marsh in a seeded order, 16–20 Void Core, the third from wave 21 in Endless. Each has its own floor, props, border, particles, light, music, hazard and enemy mix: Neon Yard (open ground), Ember Works (lava vents, heavy enemies), Cryo Vault (slick floor and ice, shielded/ranged enemies), Toxin Marsh (acid pools and fog, swarms), Void Core (portals over the abyss, teleporters). A new biome opens with a title card; each hazard biome has one event per visit: Meltdown (Ember Works), Whiteout (Cryo Vault), Spore Bloom (Toxin Marsh), Rift Storm (Void Core) |
| Upgrades | 55, 13 of them evolutions; each does something of its own (2.5.0–2.8.0 folded the copies and weak ones into the originals and rebalanced them; 3.0.0 added three grenade cards) |
| Grenade | the gadget on `G`: two charges, about 6 s per charge, thrown where you aim or at the densest group in sight, blast with a short slow; cards Grenade Cells, Blast Core, Incendiary Mix |
| Traps | from wave 6 the arena fights back, with a skin per biome: floor strikes (electric plate, piston crusher, ice spikes, acid geyser, rift burst), sweeping beams (laser, flame jet, rift beam, from wave 9) and mines (from wave 12); all warn first, hurt you and, as a share of their hull, enemies; boss waves get floor traps from wave 15 on; many more and faster in Endless |
| Difficulty beyond wave 20 | Endless hulls grow faster after wave 30, and from wave 40 an enemy can lose only a shrinking share of its hull within a quarter of a second, whatever lands (`core/difficulty.js`); from wave 21 every tenth wave adds an Endless mutator for the rest of the run (Volatile, Shielded, Hasted, Armored, Barrage, Trap Storm; then they level up, `core/mutators.js`) |
| Workshop | 18 permanent modules, among them Starter Kit, Hazard Attunement and Emergency Shield |
| Milestones | 47 with shard rewards |
| Codex | in Records: every enemy, boss and upgrade you have seen |
| Threat | Standard and Threat I–V |

## Commands

```bash
npm install          # esbuild, playwright, prettier (browsers are preinstalled in the cloud env,
                     # elsewhere: npx playwright install chromium)
npm run build        # -> dist/ (the deployable site)
npm run dev          # build unminified, rebuild on change, serve http://localhost:8124
npm run serve        # serve dist/ on http://localhost:8124
npm test             # build + deep self-test + file/PWA contract + data audit + determinism (~1.5 min, also in CI)
npm run qa           # full QA: saves, settings, workshop, runs on PC and phone, layout, buttons (~10 min)
npm run e2e          # end-to-end with real pointer/touch input on 5 device sizes
npm run audit        # world audit (routes, walls, spawns), data audit, bot run to wave 22 + post-run audit
npm run sim -- pulse,rail 31   # weapon simulation to wave 31 (| python3 tools/summarize-sim.py)
npm run format       # Prettier over src/, tests/, tools/ (CI runs npm run format:check)
npm run screens      # screenshot of every screen and every biome on PC, phone and landscape phone -> tests/shots/
```

Single test scripts run with `node tools/qa.js <script> [args]`. It serves `dist/` on a free port and
passes the URL to the script, for example `node tools/qa.js full-qa run-desktop` runs one section
of the full QA. Before a release run
`npm run qa`, `npm run e2e`, `npm run audit` and `npm run screens`, then look at the screenshots.

## Project structure

```
src/
  main.js          entry point: boot, game controller, main loop, wiring
  core/            simulation and services: world, arena, waves, AI, stats, traps, difficulty, save, diagnostics (runtime log and monitor), selftest (deep self-test), util
  data/            tables: weapons, enemies, upgrades, progression (workshop, milestones, threat), biomes, whatsnew (the News tab)
  render/          three.js renderer, models, biome visuals and skins, 2D overlay
  audio/           sound effects and music
  ui/              DOM UI (screens, HUD, dialogs) and input
  index.html       page shell, all CSS, device detection, layout audit
  sw.js            service worker (offline cache, update handshake)
  build-info.json  version, build id, feature and change list (fetched by the game)
public/            icons, fonts, web manifest, third-party licenses (copied to dist/ unchanged)
tests/             browser test scripts (Playwright) and real old saves for migration tests
tools/             build helpers: static server, test runner, sim summary
docs/              QA reports of every release (German)
build.js           src/ -> dist/
CLAUDE.md          short working rules for Claude Code sessions in this repository
```

### About the game code

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

Working rules:

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

### Versions

The version and build id exist only in `package.json` (`version`, `riftline.build`). The sources use
the placeholders `__RL_VERSION__`, `__RL_BUILD__`, `__RL_VERSION_DASHED__` and `__RL_GAME_FILE__`,
and `build.js` fills them in. That keeps the version contract the game checks at start-up
(HTML meta, script name, JS constants, build-info.json, service-worker cache) consistent. `build.js`
also fails if the service worker would precache a file that does not exist.

For a release: bump `version` and `riftline.build` in `package.json`, add the changes at the top of
`changes` in `src/build-info.json`, and write the QA report in `docs/`.

## Hosting

Every push to `main` runs `.github/workflows/pages.yml`: it installs, runs `npm test` (which builds)
and publishes `dist/` on GitHub Pages. One-time setup: *Settings → Pages → Build and deployment →
Source: GitHub Actions*. Pushes to other branches and pull requests run the same tests without
deploying (`.github/workflows/test.yml`).

`dist/` is a static site that works in any sub-path. The service worker only caches files of its own
folder and removes old `riftline-*` caches on update. A new version is downloaded in the
background and applied on its own when no run is going on (at start, back in the menu, or when the
page is hidden in the menu); a run is never interrupted. GitHub Pages sends `max-age=600` for every
file and allows no custom cache headers. None are needed: the service worker fetches `index.html`
and `build-info.json` with `no-store`, and the game file has the version in its name.

Saves live in `localStorage` under `riftline.save.v1` (plus a log and backups under `riftline.*`).
Riftdeck (<https://aaron40776.github.io/Riftdeck/>) runs on the same origin and only uses
`riftdeck.*` keys, so the two games never touch each other's data.

## Licenses

The game bundles three.js (MIT) and uses the fonts Chakra Petch and Barlow Semi Condensed
(SIL Open Font License 1.1). Their notices and license texts are in
[`public/THIRD-PARTY-NOTICES.txt`](public/THIRD-PARTY-NOTICES.txt), which is also published next
to the game.

## Known limits and ideas

- Automated tests run only in Chromium. Firefox and Safari are checked by hand.
