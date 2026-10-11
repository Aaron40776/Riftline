---
name: game-development
description: General game engineering in any engine - architecture and modularity, game loop and update order, gameplay systems (combat, controls, AI, progression, balancing), physics/collision/navigation, procedural and deterministic systems, rendering/shader/lighting integration, keyboard/mouse/touch/gamepad input, saves and state recovery, multiplayer architecture, asset loading and memory, profiling, accessibility, and automated tests and dev tooling. Use for implementing or debugging game features and systems.
---

# Game development

## Before writing code
1. Read the repo's CLAUDE.md, README, roadmap, architecture notes and tests. Find how this project does
   entities, update order, input, saves, randomness, assets, and how tests drive the game (test hooks,
   determinism fixtures, e2e). Follow those patterns over anything here.
2. Load more specific skills if present (engine-specific gameplay/debug/QA skills, the project's own skills).
3. Define the acceptance check (test, measurable behaviour, screenshot, perf number) before implementing.

## Implementation principles
- Fixed-timestep simulation, variable-rate rendering with interpolation; never tie gameplay to frame rate.
- Deterministic where it matters (replays, tests, lockstep): seeded RNG per system, no `Math.random()`/wall
  clock in simulation, stable iteration order. Keep the project's determinism tests passing unchanged for refactors.
- Data-driven content (tables for enemies, weapons, waves) with code for behaviour; validate data in tests.
- Small modules owned by one system; events/messages between systems instead of deep coupling; no framework
  (ECS etc.) without a demonstrated need.
- Difficulty that scales: parametrise by wave/time, cap extremes, test the curve with a bot or simulation.
- A feature ships with feedback: model/VFX, sound, telegraph, UI hint, and tests (coordinate via `/capability-orchestrator`).

## Systems checklist (detail in [references/systems.md](references/systems.md))
Input (keyboard, mouse, touch, gamepad; rebinding; dead zones), camera, collision (broadphase, layers),
navigation (grid/navmesh/flow fields), AI (state machine/utility/behaviour tree; telegraphs), combat (hitboxes,
i-frames, hitstop), saves (versioned schema, migration, corruption fallback, namespaced keys), pause/focus loss,
resize/orientation, error boundary + recovery, accessibility (remapping, colour-blind-safe cues, reduced motion,
subtitles/visual sound cues, scalable UI).

## Performance
Profile before optimising (`/visual-qa-performance`): find whether CPU (scripts, GC, physics) or GPU
(fill rate, draw calls, shader cost) bound. Common wins: object pools, avoid per-frame allocations, spatial
hashing, instancing, cap device pixel ratio on phones, throttle off-screen work.

## Multiplayer (only when required)
Decide authority (host/server/lockstep) from game type; send inputs not states where determinism allows;
client prediction + reconciliation for action games; plan hosting cost and cheating risk up front.

## Done means
Project test suite + format/lint pass, new tests cover the feature, it runs in the real build on desktop and a
phone profile, and the change is documented where the project expects (changelog, roadmap).
