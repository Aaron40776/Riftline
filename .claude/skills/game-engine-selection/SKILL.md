---
name: game-engine-selection
description: Evidence-based engine and technology decisions - three.js and other web stacks (Babylon.js, PlayCanvas), Godot, Unity, other engines or hybrids - scored against the project's real requirements (graphics, assets, animation, audio, effort, performance on phones/tablets/PCs, browser vs native install, offline, multiplayer, hosting, maintenance). Use when choosing an engine for a new game, when someone asks whether to switch engines, or when a platform/quality goal seems blocked by the current tech.
---

# Game engine selection

Decide from evidence, not preference. Switching engines is a rewrite: recommend it only if the gain is large,
measured, and not achievable by fixing the current stack.

## Workflow

1. **Requirements from the project and the user**, written as testable statements, with weights:
   who plays and on what (e.g. friends on phones/tablets/PCs → zero-install link matters), visual and audio
   ambition, offline, multiplayer, team size/skills, how much existing code/content exists, release cadence,
   hosting budget, monetisation/licence constraints.
2. **Diagnose the current stack first** (if one exists): is the quality/perf problem caused by the engine, or by
   assets, lighting, shaders, draw calls, pixel ratio, audio design? Measure (`/visual-qa-performance`). Most
   "the engine looks bad" problems are content and lighting problems.
3. **Shortlist ≤ 3 options** using [references/engine-matrix.md](references/engine-matrix.md). Include
   "stay and improve" as an option whenever a working project exists.
4. **Spike before deciding** (time-boxed, 1–2 days of work): the riskiest requirement in each finalist, e.g. the
   heaviest scene exported to the web build and run on the weakest target phone; build size; load time;
   input on touch. Godot and Unity web exports can be produced headless when the editor is installed
   (`/toolchain-audit engines`); if not installed, say the spike is pending and what installing needs.
5. **Score** each criterion 1–5 × weight; show the table, the spike numbers, and the migration cost
   (code to port, assets to re-import, tests to rewrite, features lost).
6. **Recommend** with: what is gained, lost, required, the risk, and a reversible first step. Record the
   decision (ADR) in the project when the user agrees.

## Defaults that usually hold (verify per project)
- "Open a link and play" across phones/tablets/PCs strongly favours web. Native engines' web exports
  (Godot 4, Unity WebGL) work but are heavier downloads with their own mobile caveats; check current docs
  for the engine version.
- Rendering quality in the browser is limited more by mobile GPU budgets and content than by the library.
- A rewrite resets testing, tooling and content pipelines; an incremental path (better assets/lighting/audio,
  WebGPU renderer where supported, an editor for content) is often the better trade.
