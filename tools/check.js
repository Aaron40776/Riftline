// Runs a chain of checks one after another and prints how long each step took.
//   node tools/check.js            quick check while developing (= npm run check): formatting, build, the deep
//                                  test, the files section, the data audit and the determinism test; extra
//                                  full-QA sections can be named: npm run check -- run-desktop codex
//   node tools/check.js --release  everything a release needs (= npm run release-check): the quick steps, the full
//                                  QA, E2E, the audits and all screenshots, built once
// Steps never run in parallel: under software GL every browser takes all cores, and browsers that share them
// starve each other into false failures. A failing step does not stop the chain; the summary lists every result and
// the exit code is 1 if any step failed. `--full` is passed on to the deep test (renders every sound again).
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2),
  release = args.includes("--release"),
  full = args.includes("--full"),
  sections = args.filter((a) => !a.startsWith("--"));

const qa = (...rest) => ["node", "tools/qa.js", ...rest];
const steps = [
  ["format", ["npx", "prettier", "--check", "src/**/*.js", "tests/**/*.mjs", "tools/**/*.js", "build.js"]],
  ["build", ["node", "build.js"]],
  ["deep test", qa("deep-test", ...(full ? ["--full"] : []))],
  // the full QA of a release contains the files section
  ...(release ? [] : [["full-qa files", qa("full-qa", "files")]]),
  ["data audit", qa("data-audit")],
  ["determinism", qa("determinism")],
  ...sections.map((name) => [`full-qa ${name}`, qa("full-qa", name)]),
];
if (release)
  steps.push(
    ["full QA", qa("full-qa")],
    ["e2e", qa("e2e")],
    ["world audit", qa("world-audit")],
    ["run audit", qa("run-audit")],
    ...["pc", "land"].map((p) => [`screens ${p}`, qa("screens", p)]),
    ...["pc", "land"].map((p) => [`biome shots ${p}`, qa("biome-shots", p)]),
    ["attack shots pc", qa("attack-shots", "pc")],
  );

const results = [],
  start = Date.now();
for (const [name, cmd] of steps) {
  console.log(`\n▶ ${name}`);
  const t0 = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, stdio: "inherit" });
  results.push({ name, ok: r.status === 0, s: (Date.now() - t0) / 1000 });
  // nothing after a failed build would test the current code
  if (name === "build" && r.status !== 0) break;
}
const fmt = (s) => {
  const n = Math.round(s);
  return n >= 60 ? `${Math.floor(n / 60)} min ${String(n % 60).padStart(2, "0")} s` : `${n} s`;
};
console.log(`\n${release ? "RELEASE CHECK" : "CHECK"} — time per step`);
for (const r of results) console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.name.padEnd(18)} ${fmt(r.s).padStart(12)}`);
const failed = results.filter((r) => !r.ok);
console.log(`  total ${fmt((Date.now() - start) / 1000)} · ${failed.length ? failed.length + " FAILED" : "all ok"}`);
process.exit(failed.length ? 1 : 0);
