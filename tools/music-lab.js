// Music Lab: the music of the game on one page, to tune it together with the owner (published as a claude.ai
// artifact). It plays every track with a mixer per instrument group (SoundEngine.setMix), the tempo, a loop over a
// section, the boss heat and transitions and a live spectrogram, and keeps the owner's marks and notes in the
// artifact's database (Claude reads them and answers there).
//   tools/music-lab.html + src/audio/sound.js (bundled and minified) -> dist/music-lab.html
// Usage: node tools/music-lab.js   (npm run lab)

import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const r = (...p) => path.join(ROOT, ...p);
const pkg = JSON.parse(fs.readFileSync(r("package.json"), "utf8"));

// the engine version shown on the page and stored with every mark: the game version and the commit of the music
let commit = "local";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  if (execSync("git status --porcelain src/audio", { cwd: ROOT }).toString().trim()) commit += "+";
} catch {}
const engineId = `${pkg.version} · ${commit}`;

// the engine logs its errors through the diagnostics of the game, which pull in the whole game: the lab logs them
const labDiagnostics = {
  name: "lab-diagnostics",
  setup(build) {
    build.onResolve({ filter: /diagnostics\.js$/ }, () => ({ path: "diagnostics", namespace: "lab" }));
    build.onLoad({ filter: /.*/, namespace: "lab" }, () => ({
      contents: "export const logError = (err) => console.error(err);",
      loader: "js",
    }));
  },
};

const out = await esbuild.build({
  stdin: {
    contents: 'export { SoundEngine, MIX_GROUPS, MUSIC_TRACKS, musicChords } from "./src/audio/sound.js";',
    resolveDir: ROOT,
    loader: "js",
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "RiftEngine",
  minify: true,
  target: "es2020",
  define: { __RL_VERSION__: JSON.stringify(pkg.version), __RL_BUILD__: JSON.stringify(pkg.riftline.build) },
  plugins: [labDiagnostics],
});
const engine = out.outputFiles[0].text;
if (/<\/script/i.test(engine)) throw new Error("the engine bundle contains </script>");

const page = fs.readFileSync(r("tools/music-lab.html"), "utf8");
if (!page.includes("/*__ENGINE__*/") || !page.includes("__ENGINE_ID__"))
  throw new Error("tools/music-lab.html lacks a placeholder");
fs.mkdirSync(r("dist"), { recursive: true });
fs.writeFileSync(
  r("dist/music-lab.html"),
  page.replaceAll("__ENGINE_ID__", engineId).replace("/*__ENGINE__*/", () => engine),
);
console.log(`dist/music-lab.html (engine ${engineId}, ${Math.round(engine.length / 1024)} KB)`);
