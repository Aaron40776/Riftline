# Engine matrix (orientation only — verify version-specific claims in current official docs)

Compiled 11.10.2026 from general knowledge; items marked *(check)* change between versions.

| Criterion | three.js (+ own code) | Babylon.js / PlayCanvas | Godot 4 | Unity |
| --- | --- | --- | --- | --- |
| Licence | MIT | Apache-2.0 / MIT engine (PlayCanvas editor is a hosted service) | MIT | proprietary, plan/revenue terms *(check)* |
| Distribution to friends | URL, instant; PWA for offline/install | URL | native builds; web export (WebAssembly) — larger download, threads/SharedArrayBuffer and mobile-browser caveats *(check for version)* | native builds; WebGL/WebGPU export — large download, mobile web caveats *(check)* |
| Editor / content tools | none built in (code + Blender) | Babylon: inspector, node editors; PlayCanvas: full web editor | full editor, scenes, animation tree, particles | full editor, huge asset store |
| Rendering potential | high, all manual; WebGL2, WebGPU renderer available *(check maturity)* | high, more built-in PBR/post/GUI | strong (Forward+/Mobile/Compatibility renderers); web uses Compatibility (GL ES 3/WebGL2) | strongest ecosystem (URP/HDRP); web limited to URP-class features |
| Animation | AnimationMixer, glTF clips; state machines in code | similar + more helpers | AnimationTree/state machines, IK | Mecanim, Timeline, IK |
| Audio | WebAudio (full control, own mixing) | engine audio APIs over WebAudio | buses, effects, 3D audio | mixer, 3D audio; FMOD/Wwise integrations |
| Physics | add library (Rapier, cannon-es) | Havok (Babylon) / Ammo | built-in (Godot Physics/Jolt) | PhysX |
| Multiplayer | own (WebSocket/WebRTC) + server | same | high-level multiplayer API, ENet/WebRTC | Netcode/3rd party |
| Phones | best reach; performance depends on discipline | similar | native mobile good; web export heavier | native mobile good; web heavier |
| Testing/automation by Claude | excellent (node, Playwright, headless) | excellent | good with headless editor (GDScript tests, `--headless` export) | harder (editor licence, heavy CLI) |
| Migration cost from a three.js codebase | 0 | medium (APIs differ, concepts similar) | high (new language/scene system, re-import) | high |

## Scoring template
| Criterion | Weight (1–5) | Option A | Option B | Option C | Evidence (spike numbers, docs links) |
| --- | --- | --- | --- | --- | --- |
