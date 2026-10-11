# Budgets for browser / mobile games (starting points — measure on the target device)

These are conventional starting points, not standards. Replace with numbers measured in the project
(`/visual-qa-performance`) and with the project's own documented limits.

| Item | Phone (mid-range) | Desktop browser |
| --- | --- | --- |
| Draw calls per frame | 100–200 | 500–1000 |
| Visible triangles | 100k–300k | 1–3M |
| Hero character | 3k–10k tris, ≤ 64 bones, 1 material | 10k–30k |
| Enemy / NPC | 1k–5k tris | 5k–15k |
| Small prop | 50–800 tris | up to 3k |
| Texture size | 512–1024 px, KTX2/ETC1S or WebP | 1024–2048 |
| Total texture VRAM | ≤ 100–150 MB | ≤ 500 MB |
| GLB download per asset | ≤ 200 KB props, ≤ 1–2 MB characters | larger, but first-load time matters |

## Memory maths
- RGBA8 texture with mips: `w × h × 4 × 1.33` bytes (1024² ≈ 5.6 MB). JPEG/PNG/WebP size on disk does **not**
  reduce VRAM; KTX2 (Basis) does.
- Vertex: ~32–48 bytes (pos+normal+uv(+tangent)); skinned adds 32.

## Levers, cheapest first
1. Fewer materials (atlas / baked colour) → fewer draw calls.
2. Instancing (`InstancedMesh`) for repeated props.
3. Merge static geometry by material.
4. LODs / impostors for distant objects; cull what is off-screen.
5. Lower device pixel ratio cap on phones (often the biggest fill-rate win).
6. Texture compression (KTX2), smaller textures for small on-screen objects.
7. Shader cost: fewer lights, no per-pixel shadow-casting on phones, avoid full-screen post passes.
