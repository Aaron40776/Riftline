# Tool catalog: capability → options

Facts here were checked against official sites/package registries on 11.10.2026 unless marked *(unverified)*.
Re-check versions before installing. "Free" = free of charge; licence noted where it matters for shipping.

| Capability | First choice (free/local) | Official source | Notes |
| --- | --- | --- | --- |
| 3D modelling, rigging, baking, rendering, FBX/GLB I/O | Blender (GPL; output is yours) | download.blender.org/release (portable .tar.xz + .sha256) | 5.2.2 LTS tested headless here. `bpy` pip wheel exists but is large and version-locked to one Python *(unverified for 3.13)* |
| glTF optimise: prune, dedup, weld, resample, quantize, meshopt/draco, texture resize/webp/ktx2 | `@gltf-transform/cli` (MIT) | npm | `npx @gltf-transform/cli optimize in.glb out.glb` (needs network once). KTX2 needs `toktx` (KTX-Software) |
| Mesh simplification + meshopt compression | `gltfpack` (meshoptimizer, MIT) | github.com/zeux/meshoptimizer releases / npm `gltfpack` | three.js loads via `MeshoptDecoder` |
| glTF validation (spec) | Khronos glTF-Validator | npm `gltf-validator` (library) | Used in tests here: `validateBytes()` |
| GPU texture compression | KTX-Software `toktx`, `basisu` | github.com/KhronosGroup/KTX-Software releases | Big VRAM win on mobile; three.js `KTX2Loader` |
| Image processing | ImageMagick, Pillow | distro / pip | `magick` (v7) vs `convert` (v6) |
| PNG/WebP/AVIF size | `oxipng`/`pngquant`, `cwebp`, `avifenc` | distro packages | pngquant is GPL (tool use is fine) |
| Vector/UI art | Inkscape (CLI export) | inkscape.org | SVG→PNG at multiple sizes |
| Raster painting | Krita, GIMP | official sites | interactive; Claude can script GIMP (Script-Fu) only if installed |
| Audio conversion/analysis | ffmpeg (loudnorm, ebur128, astats, afir) | distro | Present here with vorbis/opus/mp3/aac encoders |
| Audio editing/effects CLI | SoX | distro | not required: ffmpeg + numpy cover most |
| Music rendering from MIDI | FluidSynth + a GM SoundFont (e.g. FluidR3_GM, MIT; GeneralUser GS, permissive) | distro / soundfont authors | Check each SoundFont's licence before shipping renders |
| Notation/music engraving | MuseScore, LilyPond | official sites | |
| DAW (manual) | Reaper (paid licence), Ardour (GPL), LMMS | official | Claude cannot operate a GUI DAW without computer-use |
| Browser automation, screenshots, emulation | Playwright | npm | Present here (1.56.1 + Chromium 1194) |
| WebGL capture/inspection | Spector.js, Chrome DevTools | spector.babylonjs.com | MCP variants exist as plugins (parallax-threejs) |
| Engines | Godot 4 (MIT, headless export), Unity (proprietary licence), three.js (MIT), Babylon.js (Apache-2.0), PlayCanvas engine (MIT), Defold (free licence) | official | see `/game-engine-selection` |
| Image generation (AI) | external services only (none configured here) | provider sites | needs account/API key + terms review → ask the user |
| Audio/music generation (AI) | external services only (none configured here) | provider sites | licence terms differ per provider/plan → ask the user |
| Text-to-3D (AI) | external services only | provider sites | output usually needs retopo/UV cleanup; licence check |

## Install recipes (scratch scope; delete afterwards)

```bash
# Blender portable, checksum-verified (Linux x64)
V=5.2.2; D="$SCRATCH/blender"; mkdir -p "$D" && cd "$D"
curl -sSLO https://download.blender.org/release/Blender${V%.*}/blender-$V-linux-x64.tar.xz
curl -sSLO https://download.blender.org/release/Blender${V%.*}/blender-$V.sha256
grep linux-x64.tar.xz blender-$V.sha256 | sha256sum -c - && tar xJf blender-$V-linux-x64.tar.xz
export BLENDER_BIN="$D/blender-$V-linux-x64/blender"

# Node tools for one check, without touching a project
mkdir -p "$SCRATCH/node" && cd "$SCRATCH/node" && npm init -y >/dev/null && npm i --no-save three gltf-validator

# Python libs isolated
python3 -m venv "$SCRATCH/venv" && "$SCRATCH/venv/bin/pip" install trimesh
```

macOS Blender: `/Applications/Blender.app/Contents/MacOS/Blender`. Windows: `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"`
(from Git Bash: `/c/Program Files/...`). Set `BLENDER_BIN` to whichever applies.
