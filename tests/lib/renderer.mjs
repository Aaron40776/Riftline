// Chromium launch flags for every browser-driven suite and probe.
//
// Why this exists: the args used to be copy-pasted into 19 separate files, all of them forcing
// `--use-angle=swiftshader`. That pinned every run to software rasterisation even on machines with a
// real GPU, which made frame-rate-sensitive suites fail for reasons that had nothing to do with the
// game. Measured on an NVIDIA GTX 1070: SwiftShader managed 4 fps, the hardware path 61 fps — a 15x
// difference in the exact metric `player-mode` asserts on.
//
// One place to configure instead of nineteen. Pick the backend with RIFT_RENDERER:
//
//   auto        (default) prefer the real GPU; Chromium falls back to software on its own if there is
//               none. This is the right default for both a workstation and a GPU-less CI runner.
//   gpu         force the hardware path. Fails loudly instead of silently degrading, so a benchmark
//               never accidentally measures software rendering.
//   swiftshader force software rasterisation. Use when you need byte-identical frame pacing
//               regardless of the host, or to reproduce a GPU-driver-specific problem.
//
// Anything unrecognised falls back to auto with a warning rather than throwing, so a typo in CI
// config cannot take the whole matrix down.

const MODES = new Set(["auto", "gpu", "swiftshader"]);

// Flags that make the hardware path reachable. `--ignore-gpu-blocklist` lifts Chromium's driver
// denylist; without it a perfectly capable card can still be refused for "known issues" that do not
// apply to what we do (WebGL only, no video decode).
const GPU_ARGS = ["--ignore-gpu-blocklist", "--enable-gpu"];

// Software fallback needs its own opt-in: since Chrome 137, SwiftShader is disabled by default and a
// GPU-less host gets a blank canvas unless this flag is present.
const SW_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

export const rendererMode = () => {
  const raw = String(process.env.RIFT_RENDERER ?? "auto")
    .trim()
    .toLowerCase();
  if (MODES.has(raw)) return raw;
  console.warn(`[rift] unknown RIFT_RENDERER="${raw}" — using "auto" (valid: auto, gpu, swiftshader)`);
  return "auto";
};

/**
 * Launch args for chromium.launch({ args }).
 * @returns {string[]}
 */
export const launchArgs = () => {
  switch (rendererMode()) {
    case "swiftshader":
      return [...SW_ARGS];
    case "gpu":
      return [...GPU_ARGS];
    default:
      // auto: allow hardware, keep software reachable as a fallback. Chromium decides per host.
      return [...GPU_ARGS, "--enable-unsafe-swiftshader"];
  }
};

/**
 * Extra args some suites append (memory metrics, gc exposure) — merged without duplicates.
 * @param {...string[]} extra
 * @returns {string[]}
 */
export const launchArgsWith = (...extra) => [...new Set([...launchArgs(), ...extra.flat()])];
