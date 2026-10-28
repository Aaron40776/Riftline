// Build: turns the readable sources into the deployable game in dist/.
//   src/main.js + the modules it imports (src/core, data, render, audio, ui) and three.js from
//   npm             -> dist/game-v<version>-final.js  (one file, bundled and minified by esbuild)
//   src/core/selftest.js -> dist/selftest-v<version>.js  (3.35.0: the deep self-test, loaded only by the tests; its
//                      imports are the running game's modules, see src/core/selftest-link.js)
//   src/index.html, src/sw.js, src/build-info.json -> dist/ (placeholders filled in)
//   public/*          -> dist/ (icons, fonts, manifest; copied as they are)
// Version and build id live only in package.json ("version", "riftline.build"). The sources use
// the placeholders __RL_VERSION__, __RL_BUILD__, __RL_VERSION_DASHED__ and __RL_GAME_FILE__.
// Usage: node build.js [--watch]   (watch also serves dist/ on http://localhost:8124)

import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./tools/serve.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const r = (...p) => path.join(ROOT, ...p);
const DIST = r("dist");
const watch = process.argv.includes("--watch");

function meta() {
  const pkg = JSON.parse(fs.readFileSync(r("package.json"), "utf8"));
  const version = pkg.version,
    build = pkg.riftline && pkg.riftline.build;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`package.json version "${version}" is not x.y.z`);
  // 3.10.0: the version digits may be four (r3100 for 3.10.0)
  if (!/^r\d{3,4}a\d{4}[a-z]-r\d+$/.test(build || ""))
    throw new Error(`package.json riftline.build "${build}" does not look like r233a0926g-r1`);
  return { version, build, dashed: version.replace(/\./g, "-"), gameFile: `game-v${version}-final.js` };
}

// Replaces every placeholder; fails if one is left (typo) so a broken contract never ships.
function fill(text, m, name) {
  const out = text
    .replaceAll("__RL_VERSION_DASHED__", m.dashed)
    .replaceAll("__RL_VERSION__", m.version)
    .replaceAll("__RL_BUILD__", m.build)
    .replaceAll("__RL_GAME_FILE__", m.gameFile);
  const left = out.match(/__RL_[A-Z_]+__/);
  if (left) throw new Error(`${name}: unknown placeholder ${left[0]}`);
  return out;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name),
      b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

async function build() {
  const t0 = Date.now();
  const m = meta();
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(r("public"), DIST);

  // The game is one IIFE: src/main.js, the modules it imports and the parts of three.js they use
  // (the package from node_modules, version pinned in package.json). The version constants are plain identifiers
  // in the source; esbuild swaps them for string literals. The three.js license is in
  // public/THIRD-PARTY-NOTICES.txt, so the bundle carries no license comments.
  await esbuild.build({
    entryPoints: [r("src/main.js")],
    outfile: path.join(DIST, m.gameFile),
    bundle: true,
    format: "iife",
    minify: !watch && !process.env.RL_NO_MINIFY,
    target: "es2020",
    legalComments: "none",
    charset: "utf8",
    logLevel: "warning",
    define: { __RL_VERSION__: JSON.stringify(m.version), __RL_BUILD__: JSON.stringify(m.build) },
  });

  // 3.35.0: the deep self-test, a file of its own that players never download. Every module it imports stays outside
  // the bundle and is read from the running game (globalThis.__riftModules, set by main.js from selftest-link.js), so it
  // tests the game's own objects; a specifier the link module does not provide fails the build.
  const link = fs.readFileSync(r("src/core/selftest-link.js"), "utf8"),
    linked = [];
  await esbuild.build({
    entryPoints: [r("src/core/selftest.js")],
    outfile: path.join(DIST, `selftest-v${m.version}.js`),
    bundle: true,
    format: "iife",
    globalName: "__riftSelfTest",
    minify: !watch && !process.env.RL_NO_MINIFY,
    target: "es2020",
    legalComments: "none",
    charset: "utf8",
    logLevel: "warning",
    define: { __RL_VERSION__: JSON.stringify(m.version), __RL_BUILD__: JSON.stringify(m.build) },
    banner: {
      js: 'var require = (p) => { const mod = globalThis.__riftModules && globalThis.__riftModules[p]; if (!mod) throw new Error("self-test: " + p + " is not linked"); return mod; };',
    },
    plugins: [
      {
        name: "riftline-game-modules",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === "entry-point") return null;
            linked.push(args.path);
            return { path: args.path, external: true };
          });
        },
      },
    ],
  });
  const unlinked = [...new Set(linked)].filter((p) => !link.includes(`"${p}"`));
  if (unlinked.length) throw new Error(`selftest-link.js does not provide: ${unlinked.join(", ")}`);

  for (const f of ["index.html", "sw.js", "build-info.json"]) {
    fs.writeFileSync(path.join(DIST, f), fill(fs.readFileSync(r("src", f), "utf8"), m, f));
  }
  // 3.17.1: the game fetches build-info.json at every start (the health check, the update handshake) and reads only the
  // version and the build id from it, but the file carried the whole changelog (93 % of 50 KB, four KB more with every
  // release). The build writes the small identity file the game needs. src/build-info.json stays the one place the
  // release notes are written. 3.37.0: dist/changes.json (which nothing ever fetched) is no longer written.
  const info = JSON.parse(fs.readFileSync(path.join(DIST, "build-info.json"), "utf8")); // must stay valid JSON
  delete info.features;
  delete info.changes;
  fs.writeFileSync(path.join(DIST, "build-info.json"), JSON.stringify(info, null, 1) + "\n");

  // Offline contract: every file the service worker precaches must exist in dist/.
  const sw = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\]);/)[1]);
  const missing = files.filter((f) => f !== "./" && !fs.existsSync(path.join(DIST, f)));
  if (missing.length) throw new Error(`sw.js precaches missing files: ${missing.join(", ")}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.webmanifest"), "utf8"));
  const icons = manifest.icons.map((i) => i.src).filter((f) => !fs.existsSync(path.join(DIST, f)));
  if (icons.length) throw new Error(`manifest icons missing: ${icons.join(", ")}`);

  const kb = (f) => `${(fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0)} KB`;
  console.log(
    `built Riftline ${m.version} (${m.build}) in ${Date.now() - t0}ms  ${m.gameFile} ${kb(m.gameFile)}, index.html ${kb("index.html")}, self-test ${kb(`selftest-v${m.version}.js`)}`,
  );
}

await build();

if (watch) {
  let timer = null;
  fs.watch(r("src"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
  });
  const { url } = await serve(DIST, 8124);
  console.log(`serving ${url} (rebuilds on change)`);
}
