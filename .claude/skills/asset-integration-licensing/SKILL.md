---
name: asset-integration-licensing
description: Make models, textures, animations, sounds and fonts actually work inside a project and stay legally usable - import into the engine, formats, coordinate systems, scale/orientation, materials, texture/mesh optimisation, naming and folders, loading code, runtime verification (three.js load check with screenshot and clip test), and provenance/licence tracking with attribution and credits. Use when adding any external or generated asset to a project, or when auditing licences.
---

# Asset integration and licensing

> In Riftline: see "In Riftline" in `capability-orchestrator` first (models are code, sound is live WebAudio).

A file existing is not done. Done = it loads in the real project, looks/sounds right at runtime, fits the
budget, and its origin and licence are recorded.

## Tools (tested)
- `scripts/three_load_check.mjs`: loads GLB/glTF with the project's own three.js in headless Chromium; reports
  meshes/skinned/materials/tris/draw calls/bounds, plays every clip and fails if no bone moves; writes screenshots.
  `node ${CLAUDE_SKILL_DIR}/scripts/three_load_check.mjs assets/*.glb --three . --out-dir /tmp/shots`
  (run from or point `--three` at the project so the version matches; Playwright from cwd or global npm).
- `scripts/asset_manifest.py`: `scan` / `check` / `credits` for a JSON provenance manifest (sha256, source,
  author, licence, URL, attribution, generator+params). `check` exits 1 on TODOs, unknown files, changed hashes,
  licences outside the allow-list, missing attribution, NC/ND licences.
- Inspection/validation: `/3d-asset-pipeline` (`glb_inspect.py`), audio: `/audio-production` (`audio_report.py`),
  images: `/visual-art-ui-vfx` (`image_report.py`).

## Workflow
1. **Learn the project's conventions**: asset folders, naming, how assets are loaded (bundled, fetched,
   generated in code), compression (Draco/meshopt/KTX2 decoders registered?), budgets, and whether the project
   wants files at all (some generate all content in code: then port the asset into that system instead).
2. **Normalise**: glTF 2.0 binary, metres, Y-up, +Z forward in three.js (−Z camera look), origin at the
   base/pivot used by gameplay, transforms applied, names stable (`enemy_brute.glb`, clips `Idle/Walk/Attack`).
   Audio: mono SFX, consistent sample rate, encoded per `/audio-production`.
3. **Optimise** to budget (textures pow2 + appropriate size, merged materials, compression the loader supports).
4. **Wire it in** using the project's loader/caching; dispose on unload; handle load failure gracefully.
5. **Verify at runtime**: the load check (or the engine's own test/e2e), then in the actual game scene on desktop and
   a phone profile (`/visual-qa-performance`). Check scale against the player, lighting response, animation
   events, sound levels in context.
6. **Record provenance** in the manifest *before* merging; generate credits; keep source files (.blend, WAV masters)
   and generator commands reproducible. Licence notes: [references/licensing.md](references/licensing.md).

## Rules
- Never commit an asset whose licence is unknown; never strip attribution or licence files.
- AI-generated assets: record the service, model, prompt, date and the service's terms; rights vary by provider/plan.
- Do not download from untrusted sources into the repo; scan archives in a separate scratch folder first.
