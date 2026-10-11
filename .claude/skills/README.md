# Claude Code skills for Riftline

Skills that Claude Code sessions in this repository load automatically (`.claude/skills/<name>/SKILL.md`).
They are guidance only: nothing here is part of the game, the build or the tests. Added on 10.10.2026 at the owner's
request ("can you acquire the needed skills? Like for graphics / sound design?"). Every file was read before it was
added.

| Skill                          | Source (MIT)                                                                                                                                        | Use for                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `threejs-aaa-graphics-builder` | [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) @ `8286774`                                           | art direction, models, materials, lighting, VFX, render budgets, the visual scorecard                                                                       |
| `threejs-debug-profiler`       | same                                                                                                                                                | render and runtime bugs, profiling draw calls, fill rate, memory, bundle size                                                                               |
| `threejs-qa-release`           | same                                                                                                                                                | QA passes, mobile checks, release traps, canvas pixel metrics (`scripts/inspect-threejs-canvas.mjs`)                                                        |
| `threejs-game-ui-designer`     | same                                                                                                                                                | HUD, menus, touch controls, safe areas, text fit                                                                                                            |
| `threejs-gameplay-systems`     | same (only `SKILL.md` and `references/`)                                                                                                            | game feel (hitstop, shake, feedback stacks), encounter and difficulty design                                                                                |
| `game-audio`                   | [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) @ `a2c1531`                                                       | a short checklist for sound design, mix hierarchy, adaptive music                                                                                           |
| `game-art`                     | same                                                                                                                                                | a short checklist for style, colour, readability, animation principles                                                                                      |
| `shader-and-dsp-recipes`       | [MiniMax-AI/skills](https://github.com/MiniMax-AI/skills) `shader-dev` @ `60aaae5` (six of its technique files, with an index written for Riftline) | noise, Voronoi, anti-aliasing and palettes for the floor and surface shaders; DSP recipes to translate into WebAudio                                        |
| `riftline-sound`               | written for Riftline (11.10.2026)                                                                                                                   | a map of the sound engine, recipes for a new effect, place sound or music layer with their checks, the owner's audio decisions and the measured mix targets |

The licence of each source sits next to its skills (`LICENSE.*`).

10.10.2026 (later): searched [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) and the GitHub topic
`claude-code-skills` (2 099 repositories) through its three largest catalogues (VoltAgent/awesome-agent-skills,
sickn33/agentic-awesome-skills with 8 300 skill files, alirezarezvani/claude-skills) for audio, WebAudio, synthesis,
three.js, WebGL, shaders, game development, performance, PWA and testing. Only `shader-and-dsp-recipes` was added.

## Riftline's own rules come first

These skills are written for new Vite + TypeScript games. Where they disagree with `CLAUDE.md`, the roadmap or the owner's
decisions, those win. In particular:

- Riftline is plain JavaScript with esbuild and three.js pinned at 0.186.0; there is no Vite, TypeScript or scaffold. The
  shader cookbook targets three.js r184: check every recipe against r186.
- All sound and music are synthesised in WebAudio; nothing calls a paid or external generation service (the roadmap keeps
  such services for the owner to approve).
- No post-processing passes or heavy PBR by default: the Ultra preset was removed in 3.28.2 because it made phones hot. Judge
  a look on a real phone, not from software-GL screenshots.
- Landscape only on phones (the rotate screen), whatever `mobile-games` style advice says.
- The test hooks are `window.__riftTest`, not `__THREE_GAME_TEST_HOOKS__`; the existing QA tools (`npm run qa`, `screens`,
  `biome-shots`, `attack-shots`) stay the reference. The canvas inspector needs `@playwright/test` and `pngjs`, which the
  project does not install.

## Left out, and why

- `threejs-audio-generator`, `threejs-image-generator`, `threejs-3d-generator`: they generate assets through paid APIs
  (ElevenLabs, image and 3D providers) and need API keys.
- `threejs-game-director`: it routes to the generators above and ships a script that reads shell profiles to look for
  API keys.
- The Vite + TypeScript scaffold of `threejs-gameplay-systems` (`assets/`, `scripts/`): Riftline has its own structure.
- `web-games`, `mobile-games`, `3d-games` of claude-code-templates: shallow, partly out of date, and `mobile-games` argues
  against forced landscape.
- Neither source has a skill for procedural WebAudio synthesis and mixing; `game-audio` is the closest. The later search
  (about 9 000 skills) found none either: every audio skill there calls a paid speech or music generation API.
- `CloudAI-X/threejs-skills` (ten three.js reference skills, MIT): read; generic API notes written for r160, partly out of
  date for r186 (the `uv2` channel for AO maps, the WebGL1 `extensions` flags) and adding nothing over what the graphics
  builder and the code already hold.
- The rest of MiniMax `shader-dev` (ray marching, path tracing, volumetrics, fractals, terrain, 1.6 MB): ShaderToy
  techniques for full-screen effects, not a low-poly game on phones.
- `playwright-pro` (alirezarezvani): a plugin with hooks and settings; its `fix` skill is written for the `@playwright/test`
  runner (Riftline drives Playwright from its own scripts) and recommends CI retries, which hide flaky tests.
