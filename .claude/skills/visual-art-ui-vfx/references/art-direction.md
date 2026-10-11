# Art-direction checklist and techniques

## Style brief (fill before producing assets)
- Genre/mood in 3 words; 3–5 reference images (record URLs; references are for analysis, never traced or shipped).
- Palette: 1 dominant, 1–2 supporting, 1 accent reserved for gameplay-critical items. Store as hex in the project.
- Value plan: background mid/dark, play space mid, actors light or saturated, UI on plates.
- Shape language: round = friendly, square = sturdy, triangle = danger. Enemies of one family share it.
- Detail density: high near focal points and the player, low elsewhere (rest areas for the eye).
- Lighting: key direction and colour temperature; complementary fill; rim for silhouettes.

## Techniques with good cost/benefit in real-time
- Colour grading via a LUT or tone-mapping exposure, fog colour matched to sky.
- Hemisphere + one directional light + baked/vertex AO beats many dynamic lights on phones.
- Vertex colours for gradients and AO on low-poly assets (no texture cost).
- Trim sheets / atlases: one material for many props.
- Fresnel rim in the shader for readability against dark scenes.
- Decals for variation instead of unique textures.
- VFX: flipbook sprites or shader-driven quads, additive blending, short lifetimes, scale-up + fade-out,
  a bright core with a coloured falloff, screen shake/hitstop sparingly.

## Critique format
```
Observation (measurable) → Why it hurts (readability/mood/consistency) → Change → How we'll verify
```
