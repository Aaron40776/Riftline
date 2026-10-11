---
name: 3d-asset-pipeline
description: Create, process, optimise and validate real 3D game assets - procedural props via Blender Python or a numpy GLB writer, meshes, topology, normals, UVs, PBR materials and texture baking, LODs, polygon/texture/draw-call budgets, GLB/glTF/FBX export, preview renders and automated asset checks. Use when a task needs a model, prop, environment piece, material, or when a 3D file must be inspected, fixed or optimised.
---

# 3D asset pipeline

> In Riftline: see "In Riftline" in `capability-orchestrator` first (models are code, sound is live WebAudio).

Produce assets that load and look right in the target engine, within budget. Scripts here are tested:
Blender 5.2.2 LTS headless, Khronos glTF-Validator (0 errors), three.js 0.186 GLTFLoader.

## Tools (check with `/toolchain-audit 3d`)

| Script | Needs | Does |
| --- | --- | --- |
| `scripts/glb_inspect.py` | Python stdlib | tris/verts/draws, bounds, attributes, materials, textures (size, bytes, pow2), skins, clips, spec errors; budget gates |
| `scripts/glb_write.py` | numpy (+Pillow for textures) | write GLB from arrays; demos `rock`, `crystal`, `crate`; `flat_shade()` for low-poly |
| `scripts/blender/procedural_prop.py` | Blender | rock / crate / pillar / barrel with bevels, decimation to budget, smart UVs, PBR material, optional colour bake |
| `scripts/blender/render_preview.py` | Blender | turntable PNGs of any GLB/FBX/OBJ (Cycles CPU default: works without GPU) |

```bash
B=${BLENDER_BIN:-blender}
$B -b --factory-startup --python-exit-code 1 -P ${CLAUDE_SKILL_DIR}/scripts/blender/procedural_prop.py -- --kind crate --out crate.glb --max-tris 600 --bake 512
python3 ${CLAUDE_SKILL_DIR}/scripts/glb_inspect.py crate.glb --max-tris 600 --max-texture 1024 --require normals,uvs
$B -b --factory-startup --python-exit-code 1 -P ${CLAUDE_SKILL_DIR}/scripts/blender/render_preview.py -- --in crate.glb --out-dir previews --views 4
python3 ${CLAUDE_SKILL_DIR}/scripts/glb_write.py demo crystal crystal.glb --seed 3     # no-Blender fallback
```

## Workflow

1. **Brief**: purpose, camera distance, art direction (match the project's existing assets), budget
   (see [references/budgets.md](references/budgets.md)), target engine + loader, units/axes.
2. **Pick the method**: Blender script (best for organic shapes, bevels, baking, rigs) → numpy GLB writer
   (simple procedural/low-poly, no Blender) → in-engine procedural geometry (if the project builds meshes in
   code, follow that instead of adding files) → external generator/marketplace (needs approval + licence record).
3. **Build** with intentional shape language: silhouettes readable at game distance, bevels to catch light,
   big/medium/small detail, wear where hands/feet touch. Primitive-with-noise is a start, not a finish.
4. **Materials**: glTF exports Principled BSDF factors and image textures only. Procedural node trees
   do **not** export: bake them (`--bake`) or set flat factors. Set metallic explicitly (glTF default is 1).
   Closed meshes: backface culling on (exports `doubleSided:false`).
5. **Optimise**: decimate to budget, merge materials sharing a baked atlas (1 draw call), power-of-two
   textures, LODs for anything seen far away, instancing for repeats. Further: `@gltf-transform/cli optimize`
   / `gltfpack` if available (see toolchain catalog).
6. **Validate**: `glb_inspect.py` budgets + Khronos validator when available; then render (`render_preview.py`)
   and **look at the image**; then load in the real engine (`/asset-integration-licensing` →
   `three_load_check.mjs` for three.js).
7. **Record provenance** (command, seed, Blender version) in the asset manifest.

## Pitfalls seen in testing

- `bpy.ops.object.shade_smooth()` acts on *selected* objects only; objects created via `bpy.data` start
  unselected → faces stay flat and the export splits vertices (4x verts in one test).
- EEVEE/Workbench need a GPU context; headless servers: use Cycles CPU (`--engine cycles`).
- Blender is Z-up; the glTF exporter converts to Y-up (`export_yup=True`). Apply transforms before export.
- Over-bright previews hide material problems: keep the light rig moderate (the script's defaults are tuned).
- Validator warning `NODE_SKINNED_MESH_NON_ROOT` on Blender skinned exports is harmless in three.js.

## When blocked

No Blender → numpy writer or in-engine geometry, and say Blender would add bevels/baking/rigging.
Install path in `/toolchain-audit` (portable tarball, checksum). Never claim an asset is good without a render.
