---
name: visual-qa-performance
description: Run the actual app or game and prove how it looks and performs - multi-device screenshots (desktop, phone portrait/landscape, tablet, throttled low-end phone), console/page/network errors, blank-frame detection, frame-time statistics (p50/p95/p99, long frames), WebGL renderer, heap and transfer sizes, image diffs for regressions, audio playback checks, profiling before optimising, and clear reports that separate confirmed defects from taste. Use before claiming something works, looks good or runs well, and for performance work.
---

# Visual QA and performance

Compiling is not working; a screenshot from one desktop is not "works on mobile".

## Tools (tested)
- `scripts/capture.mjs` (Playwright + Chromium):
  `node ${CLAUDE_SKILL_DIR}/scripts/capture.mjs http://localhost:5173 --profiles desktop,phone-landscape,tablet,low-end-phone --wait 3000 --sample 5000 --click "#start"`
  Exit 1 on page/console errors, failed requests (incl. HTTP ≥ 400), or blank screenshots.
- `/visual-art-ui-vfx` → `image_report.py --diff before.png after.png --diff-out heat.png`, contact sheets.
- `/audio-production` → `audio_report.py` for delivered audio files.
- Existing project QA (e2e, screenshot scripts, test hooks) comes first; plugins such as
  `parallax-threejs:*` or Playwright MCP tools add scene-graph and trace inspection when connected.

## Workflow
1. **Start the real build** the way users get it (production build + static server, correct base path).
   Run the project's own tests and QA scripts first.
2. **Capture** on several profiles; read every screenshot yourself. Check: content visible, nothing cut off
   by safe areas/orientation, text readable at phone size, touch controls present, no debug UI.
3. **Errors**: zero page errors, console errors, 404s. Treat warnings from the engine (shader compile,
   WebGL context lost, audio context blocked) as findings.
4. **Performance**: profile first, then change one thing, then re-measure with the same profile and
   duration. Report p50/p95/p99 frame time and long frames, not just average FPS. Identify CPU vs GPU bound
   (Chrome trace via DevTools/CDP, `renderer.info` draw calls/triangles, heap growth over time).
5. **Audio**: verify the context resumes after a gesture, sounds trigger (test hooks or analyser node level), no
   errors decoding, loudness of delivered files.
6. **Regression**: keep baseline screenshots per profile; diff after changes (`changed_pct`), review heat maps.
7. **Report**: Confirmed defects (repro steps, profile, evidence) / Measurements (table) / Subjective notes
   (marked as opinion) / Not testable here.

## Interpreting results honestly
- `SwiftShader`/`llvmpipe` in the GL renderer = software rendering: absolute frame times are meaningless for real
  devices; use them only to compare before/after on the same machine. Real GPU numbers need a real device or a
  GPU machine; say so.
- Device emulation does not reproduce mobile GPU, thermals, memory pressure, or touch latency. When mobile
  performance matters, ask the user to test on a phone (provide a URL and what to look for) or use a cloud device
  service if they have one.
- Pages without `<meta name="viewport">` render at ~980 px layout width on phones (seen in testing).
