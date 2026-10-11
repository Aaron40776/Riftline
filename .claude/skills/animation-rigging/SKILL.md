---
name: animation-rigging
description: Character and object rigging and animation for games - skeletons, skin weights, clips (idle, locomotion, attacks, hits, deaths, environmental loops), procedural animation, blending/cross-fades and state machines, root motion, retargeting, import/export between Blender and engines (glTF/FBX), and runtime verification that clips actually play. Use when something needs to move, a rig or clip is broken, or animations must be integrated or optimised.
---

# Animation and rigging

## Tested tool

`scripts/blender/rig_creature.py` (Blender 5.2.2 headless): joint graph → Skin-modifier mesh → armature from
the same joints → heat weights (envelope fallback; reports unweighted verts) → Idle/Walk/Attack actions on
NLA tracks → GLB with skin + all clips. Verified in three.js 0.186: every clip moves bones.

```bash
$BLENDER_BIN -b --factory-startup --python-exit-code 1 -P ${CLAUDE_SKILL_DIR}/scripts/blender/rig_creature.py -- --out creature.glb --max-tris 1500 --fps 30
python3 ${CLAUDE_SKILL_DIR}/../3d-asset-pipeline/scripts/glb_inspect.py creature.glb --require skin,animations
node ${CLAUDE_SKILL_DIR}/../asset-integration-licensing/scripts/three_load_check.mjs creature.glb --three .
```

Use it as a pipeline template: replace the joint graph/mesh with a real model, keep the weighting,
action-per-clip and export settings.

## Workflow

1. **List the clips the game needs** from the gameplay code (states, transitions, events like "hit frame").
   Decide per clip: loop or one-shot, in-place or root motion, length, and the gameplay event frame.
2. **Rig**: bones only where motion is needed (mobile: ≤ ~64 per skinned mesh), clean names
   (`thigh.L` mirrorable), rest pose in T/A-pose, transforms applied, scale 1.
3. **Weights**: automatic, then check: no unweighted verts, ≤ 4 influences, no candy-wrapper twists.
   Bone-heat fails on non-manifold or tiny meshes → fix the mesh or use envelopes.
4. **Animate** with the principles that read in games: anticipation before attacks, fast action, follow-through,
   overlapping motion, weight shift. Loops: first key == last key; in-place walk speed matches game move speed
   (foot sliding check).
5. **Export**: glTF (`export_animation_mode="ACTIONS"`, skins on). Blender samples all bone channels; trim
   with gltf-transform `resample`/`prune` when available.
6. **Integrate**: state machine with cross-fades (three.js: `AnimationMixer`, `action.crossFadeTo`,
   `setLoop(LoopOnce)` + `clampWhenFinished` for one-shots, `mixer` `finished` event for gameplay hooks).
   Drive procedural layers (look-at, recoil, breathing, IK feet) after the mixer update.
7. **Verify at runtime**: clips listed, bones move (`three_load_check.mjs` checks this), no T-pose flashes on
   transitions, timings match gameplay events, cost: skinned meshes × bones per frame on phone profiles.

## Procedural alternatives (no rig files): Riftline's way
Riftline animates its code-built models in code (part hierarchies, `render/interp.js` smoothing); a rigged GLB
would be a new pipeline for the owner to decide.

Rigid-part hierarchies animated in code (sin/cos, springs, easing) are often better for robots, turrets,
floating enemies and environment (doors, platforms, foliage sway in the vertex shader). Prefer them when the
project already builds models in code.

## Pitfalls
- Blender actions in 4.4+/5.x are slotted; assigning an action to an object assigns its slot automatically.
- Clip length off by one frame: start keys at frame 0 for exact durations.
- FBX from other tools: check scale (0.01), axis, and that bone rolls survive; prefer glTF.
- Retargeting between skeletons needs matching rest poses or a retarget tool; report it if unavailable.
