---
name: capability-orchestrator
description: Entry point for complex, multi-discipline tasks (e.g. "make this game look and sound better", "add a new enemy with model, animation, sound and tests", "build a prototype in a new engine"). Breaks the request into subtasks, picks the specialist skills and tools for each, finds capability gaps, coordinates execution and integration, and validates the combined result before reporting. Use when a request spans two or more of code, 3D, art, animation, audio, engine choice, assets, QA.
---

# Capability orchestrator

Turn a large request into verified, integrated results. Load specialist skills only when their subtask
starts (progressive disclosure); do not pre-load all of them.

## Specialist map

| Need | Skill | Has tested scripts |
| --- | --- | --- |
| What tools exist / can be added | `/toolchain-audit` | `audit_tools.sh` |
| Meshes, props, materials, GLB, budgets, LODs | `/3d-asset-pipeline` | GLB writer + inspector, Blender prop + preview render |
| Art direction, textures, UI, HUD, VFX, image checks | `/visual-art-ui-vfx` | `image_report.py` (palette, blank, tiling, diff, contact sheet) |
| Rigs, skinning, clips, blending, retargeting | `/animation-rigging` | Blender procedural rig + 3 clips → GLB |
| SFX, ambience, music, mix, encoding | `/audio-production` | `sfx_synth.py`, `audio_report.py`, `encode_for_web.sh` |
| Engine / tech choice or migration | `/game-engine-selection` | (decision procedure + matrix) |
| Gameplay code, architecture, input, saves, perf | `/game-development` | (procedures; uses the project's own tests) |
| Getting files into the engine, licences, provenance | `/asset-integration-licensing` | `three_load_check.mjs`, `asset_manifest.py` |
| Run it, screenshot it, measure it on devices | `/visual-qa-performance` | `capture.mjs` |
| Add, fix or audit skills | `/skill-maintenance` | `validate_skills.py` |

Also check the session's skill list for skills more specific than these: `riftline-sound`,
`shader-and-dsp-recipes`, the `threejs-*` skills, plugins such as `parallax-threejs:*`.
**Project-specific skills and the repo's CLAUDE.md win** over these generic ones.

Scripts of a sibling skill: `${CLAUDE_SKILL_DIR}/../audio-production/scripts/audio_report.py` (all skills sit in
`.claude/skills/`).

## In Riftline

These skills are generic; Riftline's rules come first (CLAUDE.md, `docs/ROADMAP.de.md`, `.claude/skills/README.md`):

- **Models are built in code** (`src/render/models.js`, `biome-props.js`, `*-view.js`); the game loads no GLB files.
  Use the Blender/GLB tools to prototype a shape, check proportions or render a reference, then build it the way
  `models.js` does. Shipping model files would be a new pipeline: the owner's decision.
- **Sound and music are synthesized live in WebAudio** (`src/audio/`); load `riftline-sound` first. `sfx_synth.py`
  is for sketching a layer stack and `audio_report.py` for measuring renders, never for adding sample files.
- No paid or external generation services without the owner's approval (see the roadmap).
- Phones first: no heavy post-processing or PBR by default, landscape only, judge looks on a real phone.
- Checks: `npm test` before every commit (`npm run check` is quicker), `npm run release-check` before a release;
  the QA tools (`npm run qa`, `e2e`, `screens`, `window.__riftTest`) are the reference, `capture.mjs` adds profiles.
- A new feature comes with its model, sound, telegraph and tests (the owner's design principle).

## Workflow

1. **Ground in the real project.** Read CLAUDE.md/README/roadmap, the build/test commands, the engine and
   versions, existing asset/audio pipelines, and owner decisions. Never apply a generic recipe that conflicts
   with them (e.g. a repo that synthesizes all audio at runtime does not want WAV files).
2. **Define "done" per subtask** as observable evidence: a test passes, a GLB loads in the engine with
   clips moving bones, a screenshot shows X, loudness within target, frame time p95 below Y on profile Z.
3. **Decompose** into subtasks with inputs → outputs → acceptance check → owner skill. Mark dependencies
   (model before rig before animation before integration before QA).
4. **Capability check** each subtask: tool present and working? (`/toolchain-audit`). Classify:
   *available now* / *gainable locally (user-space download, scratch npm/pip)* / *needs external service,
   account, key or permission* / *unavailable*. Ask before any install that is system-wide, paid, needs
   credentials or adds a dependency to the user's project.
5. **Execute** smallest-risk first. Work on a branch in repos; scratch work in the scratchpad.
   Delegate only isolated, well-specified work to subagents (broad code search → Explore; independent
   asset batches; independent reviews). Give them the acceptance check; verify what they return.
6. **Integrate**: the asset/sound/code must run inside the actual project, not just exist as a file.
7. **Validate the whole**: project tests, format/lint, runtime load, screenshots on desktop + phone
   profiles, audio report, and your own look at images. Fix and re-run; do not report on unverified output.
8. **Report**: what was done (with evidence), what failed, what was not testable here (e.g. real-device
   performance, listening on real speakers), assumptions, and the next step that needs the user.

## Rules

- Prefer working results over recommendations; prefer existing tools over new code.
- Never claim quality from code: look at renders, measure audio, run the game.
- Keep generated assets reproducible: record the command, seed and tool version (`/asset-integration-licensing`).
- When a capability is missing, say what it would add and the cheapest safe way to get it; do not fake it.
- Respect the user's limits on usage: batch tool calls, avoid re-deriving known facts, stop when asked.
