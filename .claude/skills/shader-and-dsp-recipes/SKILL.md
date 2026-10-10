---
name: shader-and-dsp-recipes
description: "Tested GLSL and DSP recipes for Riftline's procedural look and sound: hashes and value/simplex noise, FBM and domain warping, Voronoi cells and exact borders, fwidth anti-aliasing, cosine/HSV/blackbody palettes, WebGL2 shader pitfalls, and synthesis recipes (FM, additive, percussion, formants, delay) to translate into WebAudio. Use when changing the floor or surface shaders in render/, fixing shader banding or precision, or designing a synthesized sound or instrument in audio/."
---

# Shader and DSP recipes (for Riftline)

Six technique files from MiniMax's `shader-dev` skill (MIT, see `LICENSE.minimax-skills`), chosen because they match
code Riftline already has. They are written for ShaderToy (`mainImage`, `iTime`, `iResolution`, `mainSound`): take the
functions, not the scaffolding. The deeper `reference/` files of the original are not included, so their "Further
reading" links point nowhere.

| File | Read it when | Where it lands in Riftline |
| --- | --- | --- |
| `techniques/procedural-noise.md` | changing noise, FBM or warping in a floor or surface shader | `render/biome-visuals.js` (the floor shader: fbm per biome), `render/hazards-view.js`, `render/attacks-view.js` |
| `techniques/voronoi-cellular-noise.md` | cells, cracks, lava veins, crystal or hex patterns | the floor's Voronoi (Ember Works cracks, Void Core), crack marks in `attacks-view.js` |
| `techniques/anti-aliasing.md` | lines or cell edges shimmer or crawl at a distance | use the `fwidth()` analytic edge for floor lines and decals; the SSAA/TAA parts do not apply |
| `techniques/color-palette.md` | a biome's ramps, lava or fire colours, per-tile variation | cosine palettes and the blackbody ramp for lava; keep the biome palettes in `data/biomes.js` and `RL_BIOME_LOOK` |
| `techniques/webgl-pitfalls.md` | a shader fails to compile or a uniform reads as null | mostly ShaderToy-to-WebGL2 notes; the "unused uniform is optimised away" rule applies to every `ShaderMaterial` |
| `techniques/sound-synthesis.md` | designing a synthesized sound, instrument or effect | translate the maths into WebAudio nodes in `audio/sound.js` (see below) |

## Riftline rules that come first

- three.js is pinned at 0.186 and the game runs on WebGL2 through three's `ShaderMaterial` and `onBeforeCompile`; GLSL is
  written the three.js way (three supplies `#version`, `position`, `uv`, the matrices). Check every recipe against r186.
- Phones are the target. The floor shader already runs on every pixel at DPR up to 1.5–2; adding octaves or a 5x5
  Voronoi search costs fill rate on every frame. Measure before adding, prefer fewer octaves, and judge on a device
  (the Ultra preset was removed because it heated phones).
- Precision: `fract(sin(x) * 43758.5)` hashes and noise fed with a time that grows without end lose precision after long
  sessions and on mediump GPUs. Prefer the sin-free hashes (`hash12`, `hash22`) and keep time inputs bounded.
- The simulation (`core/`) never uses shader or render randomness; visual noise may use `Math.random`, the simulation must
  use its seeded RNG (`tests/sim-node.mjs` makes `Math.random` throw there).

## From the DSP recipes to WebAudio

`sound-synthesis.md` computes samples in a shader; Riftline builds the same sounds from WebAudio nodes scheduled ahead
of time. The translations:

| Recipe | WebAudio |
| --- | --- |
| `sin(TAU*f*t)`, saw, square, triangle | `OscillatorNode` with `type` sine, sawtooth, square, triangle |
| `exp(-rate*t)` envelope, `smoothstep` attack | `GainNode.gain`: `setValueAtTime` + `linearRampToValueAtTime` (attack) + `setTargetAtTime` or `exponentialRampToValueAtTime` (decay; never ramp exponentially to 0) |
| FM `sin(TAU*fc*t + depth*sin(TAU*fm*t))` | a modulator oscillator → `GainNode` (depth × fm Hz) → the carrier's `frequency` |
| kick: pitch sweep + click | oscillator `frequency` from a high value down with `exponentialRampToValueAtTime`, plus a few ms of filtered noise |
| hi-hat, clap: noise with a decay | a short noise `AudioBuffer` → `BiquadFilterNode` (highpass or bandpass) → gain envelope |
| resonant low-pass sweep (303) | `BiquadFilterNode` lowpass with `Q`, `frequency` automated by the envelope |
| formant vowels | parallel bandpass `BiquadFilterNode`s at F1–F3 on a saw or pulse (the boss choir already does this) |
| multi-tap or ping-pong delay | `DelayNode` with a feedback `GainNode`, `StereoPannerNode` or a channel merger for left/right |
| sidechain pumping | duck a bus gain on each kick |

What the engine already does and a new sound must respect (read `audio/sound.js` first): the voice budget and priorities
(a new sound claims a voice with a priority; place and event sounds use 0.5, gameplay 1, key sounds 2), the buses (music,
effects, ambience) with their own volumes, the master chain (compressor → limiter → master gain → soft clip), the music
scheduler that plans notes ahead, and the offline previews (`node tools/qa.js scape-preview` writes WAV/MP3 to
`tests/shots/scapes/`). The deep test renders every sound offline and checks it, so a new sound needs a test there too.
Numbers measure a sound; only the owner's ears judge it.
