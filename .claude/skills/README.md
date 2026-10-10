# Claude Code skills for Riftline

Third-party skills that Claude Code sessions in this repository load automatically (`.claude/skills/<name>/SKILL.md`).
They are guidance only: nothing here is part of the game, the build or the tests. Added on 10.10.2026 at the owner's
request ("can you acquire the needed skills? Like for graphics / sound design?"). Every file was read before it was
added.

| Skill | Source (MIT) | Use for |
| --- | --- | --- |
| `threejs-aaa-graphics-builder` | [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) @ `8286774` | art direction, models, materials, lighting, VFX, render budgets, the visual scorecard |
| `threejs-debug-profiler` | same | render and runtime bugs, profiling draw calls, fill rate, memory, bundle size |
| `threejs-qa-release` | same | QA passes, mobile checks, release traps, canvas pixel metrics (`scripts/inspect-threejs-canvas.mjs`) |
| `threejs-game-ui-designer` | same | HUD, menus, touch controls, safe areas, text fit |
| `threejs-gameplay-systems` | same (only `SKILL.md` and `references/`) | game feel (hitstop, shake, feedback stacks), encounter and difficulty design |
| `game-audio` | [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) @ `a2c1531` | a short checklist for sound design, mix hierarchy, adaptive music |
| `game-art` | same | a short checklist for style, colour, readability, animation principles |

The licence of each source sits next to its skills (`LICENSE.*`).

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
- Neither source has a skill for procedural WebAudio synthesis and mixing; `game-audio` is the closest.
