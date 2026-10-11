---
name: visual-art-ui-vfx
description: Art direction and visual polish for games and apps - reference research, palettes, silhouette and shape language, value/contrast, texture creation and image processing, materials, lighting, shaders, particles/trails/VFX, HUDs, menus, icons and typography, plus objective image checks (blank frames, contrast, palette, tiling seams, before/after diffs, contact sheets). Use when something looks basic, generic or inconsistent, or when creating textures, UI or effects.
---

# Visual art, UI and VFX

> In Riftline: see "In Riftline" in `capability-orchestrator` first (models are code, sound is live WebAudio).

Judge visuals by rendered results on the target device, not by the code that makes them.

## Tools

- `scripts/image_report.py` (Pillow+numpy, tested): per-image palette, luminance mean/contrast, saturation,
  clipped blacks/whites, **blank-frame detection**, `--tile` seam check for textures, `--sheet out.png`
  contact sheet, `--diff A B --diff-out heat.png` before/after.
  `python3 ${CLAUDE_SKILL_DIR}/scripts/image_report.py shots/*.png --sheet sheet.png`
- Screens come from `/visual-qa-performance` (`capture.mjs`), model renders from `/3d-asset-pipeline`.
- ImageMagick (`convert`/`magick`), Pillow, numpy are typical; Blender can bake textures; check others with
  `/toolchain-audit image`. Image-generation models are **external services**: only with the user's account
  and approval; record them as generated assets with their terms.
- Project skills such as `threejs-aaa-graphics-builder` / `threejs-game-ui-designer` hold engine-specific recipes:
  load them for three.js work.

## Workflow

1. **Capture the current state** (screenshots: desktop + phone landscape) and run `image_report.py`.
   Write down concrete problems ("enemies same value as floor", "HUD text 9 px on phone"), not adjectives.
2. **Direction** ([references/art-direction.md](references/art-direction.md)): pick 3–5 references and
   state the rules they share (palette, value structure, shape language, edge treatment, lighting mood).
   Stay consistent with the project's existing look and owner decisions.
3. **Readability first**: gameplay-critical things (player, threats, pickups, telegraphs) separated by
   value and hue from the environment; check with a greyscale version (`convert in.png -colorspace gray`).
4. **Implement** the cheapest change with the biggest visible effect: lighting/fog/colour grade and palette
   before new geometry; materials with roughness variation before more polygons; VFX with timing
   (anticipation → hit → dissipation) and additive layering before more particles.
5. **Textures**: tileable (`--tile` seam ratio ≤ ~2), power-of-two, value range not crushed, detail scale
   matches on-screen size. Procedural is fine if the result passes the same checks and does not repeat visibly.
6. **UI**: one type scale, 44 px min touch targets, safe areas, contrast ≥ 4.5:1 for text, test at phone width.
7. **Verify**: re-capture, `--diff` against before, contact sheet, and *look*. Separate confirmed defects
   (blank, clipped, unreadable, seams) from taste calls, and say which is which.

## Avoid

Default primitives with flat colours, rainbow gradients, uniform noise everywhere, bloom on everything,
glow without a dark background to sit on, particle spam that hides gameplay, text over busy backgrounds
without a plate, and judging colour from software-GL screenshots alone (different gamma/precision).
