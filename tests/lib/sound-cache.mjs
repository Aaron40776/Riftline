// 3.10.0: the deep test's sound checks (every sound rendered offline, the sound-similarity pairs, the music) take
// about 200 s and depend only on the sound engine and the data it imports. Their result is kept in
// node_modules/.cache/riftline/ and reused while none of those inputs changed. The key is a hash of every file the
// sound engine imports (followed automatically, so a new import counts at once), the deep test itself and the
// installed Playwright (the browser that renders). Only a passing result is kept. CI (env CI) and `--full` always
// render everything.
// 3.32.0: a data file (src/data/) counts by what the sound engine can read from it, not by its text: its exports
// without the texts for the player (names, card descriptions), so a reworded card no longer renders every sound
// again (3 minutes). A data file that does not load in Node counts by its text, as before. The cache keeps the last
// SLOTS results, so going back and forth between two branches reuses both.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = path.join(ROOT, "node_modules", ".cache", "riftline", "deep-sound.json");
// sound.js imports diagnostics.js only for logError (error logging); following it would pull in the whole game
const NOT_SOUND = new Set([path.join(ROOT, "src", "core", "diagnostics.js")]);
const SLOTS = 4;
// keys whose string values are player-facing text, left out of a data file's view
const TEXT_KEYS = /^(name|desc|text|lore|hint|tip|tips|flavor|label|title|short|long|note|blurb)$/;

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
  return [
    ...seen,
    path.join(ROOT, "tests", "deep-test.mjs"),
    path.join(ROOT, "node_modules", "playwright-core", "package.json"),
  ].sort();
}

/* what a data file contributes to the key: its exports without player texts; functions count by their source */
async function dataView(file) {
  try {
    globalThis.__RL_VERSION__ ??= "0.0.0";
    globalThis.__RL_BUILD__ ??= "cache";
    const mod = await import(pathToFileURL(file).href),
      seen = new WeakSet();
    return JSON.stringify(mod, function (key, value) {
      if ((typeof value === "string" || typeof value === "function") && TEXT_KEYS.test(key)) return undefined;
      if (typeof value === "function") return "fn:" + value.toString();
      if (value instanceof Set) return [...value];
      if (value instanceof Map) return [...value.entries()];
      if (value && typeof value === "object") {
        if (seen.has(value)) return "[seen]";
        seen.add(value);
      }
      return value;
    });
  } catch {
    return fs.readFileSync(file, "utf8");
  }
}

export async function soundCache() {
  const files = soundInputs(),
    hash = crypto.createHash("sha256"),
    data = path.join(ROOT, "src", "data") + path.sep;
  for (const file of files)
    hash.update(
      path.relative(ROOT, file) +
        "\0" +
        (file.startsWith(data) ? await dataView(file) : fs.readFileSync(file, "utf8")) +
        "\0",
    );
  const key = hash.digest("hex"),
    full = !!process.env.CI || process.argv.includes("--full");
  let entries = [];
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    entries = Array.isArray(saved.entries) ? saved.entries : saved.key ? [saved] : [];
  } catch {}
  const hit = full ? null : entries.find((entry) => entry.key === key) || null;
  return {
    data: hit,
    key,
    files: files.map((file) => path.relative(ROOT, file)),
    save(results) {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const entry = { key, at: new Date().toISOString(), ...results };
      fs.writeFileSync(
        FILE,
        JSON.stringify({ entries: [entry, ...entries.filter((other) => other.key !== key)].slice(0, SLOTS) }),
      );
    },
  };
}
