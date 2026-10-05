// 3.10.0: the deep test's sound checks (every sound rendered offline, the sound-similarity pairs, the music) take
// about 200 s and depend only on the sound engine and the data it imports. Their result is kept in
// node_modules/.cache/riftline/ and reused while none of those inputs changed. The key is a hash of every file the
// sound engine imports (followed automatically, so a new import counts at once), the deep test itself and the
// lockfile (browser version). Only a passing result is kept. CI (env CI) and `--full` always render everything.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const FILE = path.join(ROOT, "node_modules", ".cache", "riftline", "deep-sound.json");
// sound.js imports diagnostics.js only for logError (error logging); following it would pull in the whole game
const NOT_SOUND = new Set([path.join(ROOT, "src", "core", "diagnostics.js")]);

function soundInputs() {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file) || NOT_SOUND.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+"(\.[^"]+)"/gm))
      walk(path.resolve(path.dirname(file), m[1]));
  };
  walk(path.join(ROOT, "src", "audio", "sound.js"));
  return [...seen, path.join(ROOT, "tests", "deep-test.mjs"), path.join(ROOT, "package-lock.json")].sort();
}

export function soundCache() {
  const files = soundInputs(),
    hash = crypto.createHash("sha256");
  for (const file of files) hash.update(path.relative(ROOT, file) + "\0" + fs.readFileSync(file) + "\0");
  const key = hash.digest("hex"),
    full = !!process.env.CI || process.argv.includes("--full");
  let data = null;
  if (!full)
    try {
      const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
      if (saved.key === key) data = saved;
    } catch {}
  return {
    data,
    files: files.map((file) => path.relative(ROOT, file)),
    save(results) {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify({ key, at: new Date().toISOString(), ...results }));
    },
  };
}
