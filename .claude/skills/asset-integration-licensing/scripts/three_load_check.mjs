#!/usr/bin/env node
// Load .glb/.gltf files with three.js GLTFLoader in headless Chromium and prove they work at runtime:
// parse errors, meshes/skinned meshes/materials/triangles, bounds, animation clips, and that playing each
// clip actually moves bones. Writes one screenshot per model.
//
//   node three_load_check.mjs model.glb [more.glb] [--three <dir with node_modules/three>] [--out-dir shots]
//        [--size 640x480] [--json]
//
// three is resolved from --three, else the current directory's node_modules, else fails with instructions
// (use the project's own three version; for a scratch check: `npm i --no-save three` in a scratch dir).
// Playwright is resolved from the cwd, then the global npm root. Exit 1 if any model fails.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const files = args.filter((a, i) => !a.startsWith("--") && !["--three", "--out-dir", "--size"].includes(args[i - 1]));
if (!files.length) {
  console.error("usage: three_load_check.mjs model.glb [...] [--three DIR] [--out-dir DIR] [--size WxH] [--json]");
  process.exit(2);
}
const outDir = opt("--out-dir", "three-load-shots");
const [W, H] = opt("--size", "640x480").split("x").map(Number);

function resolvePkg(name, bases) {
  // packages with an "exports" map may hide package.json, so resolve the entry point and walk up to its root
  for (const b of bases) {
    let p;
    try { p = createRequire(path.join(b, "noop.js")).resolve(name); } catch { continue; }
    for (let d = path.dirname(p); d !== path.dirname(d); d = path.dirname(d)) {
      const pj = path.join(d, "package.json");
      if (fs.existsSync(pj) && JSON.parse(fs.readFileSync(pj)).name === name) return d;
    }
  }
  return null;
}
let globalRoot = "";
try { globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim(); } catch {}
const threeDir = resolvePkg("three", [opt("--three", ""), process.cwd()].filter(Boolean));
if (!threeDir) {
  console.error("three not found: pass --three <project dir> or run `npm i --no-save three` in a scratch dir and run from there");
  process.exit(2);
}
const pwDir = resolvePkg("playwright", [process.cwd(), path.join(globalRoot, "..")]) || (globalRoot && path.join(globalRoot, "playwright"));
const { chromium } = await import(path.join(pwDir, "index.mjs")).catch(() => import("playwright"));
const threeVersion = JSON.parse(fs.readFileSync(path.join(threeDir, "package.json"))).version;

const page_html = `<!doctype html><html><body style="margin:0;background:#222">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(${W}, ${H});
document.body.appendChild(renderer.domElement);
window.check = async (url) => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2a30);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(3, 5, 4); scene.add(sun);
  scene.add(gltf.scene);
  let meshes = 0, skinned = 0, tris = 0; const mats = new Set(); const bones = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) { meshes++; if (o.isSkinnedMesh) skinned++;
      const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.type + ":" + (m.name || "?"))); }
    if (o.isBone) bones.push(o);
  });
  const box = new THREE.Box3().setFromObject(gltf.scene, true);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const clips = [];
  if (gltf.animations.length) {
    const mixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      mixer.stopAllAction();
      const act = mixer.clipAction(clip); act.reset().play(); mixer.update(0);
      const before = bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
      const q0 = bones.map((b) => b.quaternion.clone());
      mixer.update(clip.duration * 0.37);
      let maxMove = 0, maxRot = 0;
      bones.forEach((b, i) => { maxMove = Math.max(maxMove, b.getWorldPosition(new THREE.Vector3()).distanceTo(before[i]));
        maxRot = Math.max(maxRot, b.quaternion.angleTo(q0[i])); });
      clips.push({ name: clip.name, duration: +clip.duration.toFixed(3), tracks: clip.tracks.length,
        maxBoneMove: +maxMove.toFixed(4), maxBoneRotDeg: +(maxRot * 180 / Math.PI).toFixed(1) });
    }
  }
  const cam = new THREE.PerspectiveCamera(40, ${W} / ${H}, 0.01, 1000);
  const r = Math.max(size.length() / 2, 1e-3);
  cam.position.copy(center).add(new THREE.Vector3(1, 0.6, 1.4).normalize().multiplyScalar(r / Math.sin(Math.PI * 20 / 180) * 1.1));
  cam.lookAt(center);
  renderer.render(scene, cam);
  const gl = renderer.getContext(); const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return { meshes, skinned, triangles: Math.round(tris), materials: [...mats], bones: bones.length,
    size: size.toArray().map((v) => +v.toFixed(4)), min: box.min.toArray().map((v) => +v.toFixed(4)), clips,
    calls: renderer.info.render.calls, glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?" };
};
window.ready = true;
</script></body></html>`;

const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".ktx2": "image/ktx2", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  let p = null;
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(page_html); }
  if (u.startsWith("/three/")) p = path.join(threeDir, u.slice(7));
  if (u.startsWith("/m/")) { const [i, ...rest] = u.slice(3).split("/"); p = path.join(path.dirname(path.resolve(files[+i])), rest.join("/")); }
  if (!p || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));
await page.goto(base + "/");
await page.waitForFunction("window.ready === true", null, { timeout: 15000 });
fs.mkdirSync(outDir, { recursive: true });
const results = [];
let failed = 0;
for (const [i, f] of files.entries()) {
  const r = { file: f, three: threeVersion };
  try {
    Object.assign(r, await page.evaluate((u) => window.check(u), `/m/${i}/${path.basename(f)}`));
    r.screenshot = path.join(outDir, path.basename(f).replace(/\.\w+$/, "") + ".png");
    await page.screenshot({ path: r.screenshot });
    const problems = [];
    if (!r.meshes) problems.push("no meshes");
    for (const c of r.clips) if (c.maxBoneMove < 1e-4 && c.maxBoneRotDeg < 0.5) problems.push(`clip ${c.name} does not move any bone`);
    r.problems = problems;
    if (problems.length) failed++;
  } catch (e) { r.error = String(e); failed++; }
  results.push(r);
}
await browser.close();
server.close();
if (consoleErrors.length) results.push({ consoleErrors });
if (args.includes("--json")) console.log(JSON.stringify(results, null, 2));
else for (const r of results) {
  if (r.consoleErrors) { console.log("console errors:", r.consoleErrors); continue; }
  console.log(`== ${r.file} (three ${r.three})`);
  if (r.error) { console.log("   LOAD ERROR", r.error); continue; }
  console.log(`   meshes ${r.meshes} (skinned ${r.skinned}) tris ${r.triangles} bones ${r.bones} draw calls ${r.calls} size ${r.size} min ${r.min}`);
  console.log(`   materials ${r.materials.join(", ")}  | GL: ${r.glRenderer}`);
  for (const c of r.clips) console.log(`   clip ${c.name}: ${c.duration}s ${c.tracks} tracks, max bone move ${c.maxBoneMove} m, max rot ${c.maxBoneRotDeg} deg`);
  for (const p of r.problems) console.log("   PROBLEM", p);
  console.log(`   screenshot ${r.screenshot}  -> ${r.problems.length ? "FAIL" : "PASS"}`);
}
process.exit(failed ? 1 : 0);
