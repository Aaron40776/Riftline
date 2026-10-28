// 3.60.1: `npm test` used to run its eight steps strictly one after the other, and one of them (the deep
// sound test) is 18 of the 20 minutes - so the five node-side checks spent their time waiting for a browser to
// finish. They are independent of it and of each other (no ports, no dist), so they now run beside it.
//
// The browser steps stay serial: they each start a static server and Playwright, and two of them on one port is
// an EADDRINUSE, not a speed-up.
//
// usage: node tests/run-all.mjs [--no-build] [--skip=deep,files] [--only=sim,save]
import { spawn } from "node:child_process";

const args = process.argv.slice(2),
  flag = (name) => args.includes(`--${name}`),
  list = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit
      ? hit
          .slice(name.length + 3)
          .split(",")
          .filter(Boolean)
      : null;
  };

/* A step is a name, a command and whether it needs a browser. `serial` runs after every browser step, for the
   steps that want the machine to themselves. */
const STEPS = [
  { name: "sim", cmd: ["node", "tests/sim-node.mjs"] },
  { name: "save", cmd: ["node", "tests/save-node.mjs"] },
  { name: "data", cmd: ["node", "tools/qa.js", "data-audit"] },
  { name: "determinism", cmd: ["node", "tools/qa.js", "determinism"] },
  { name: "deep", cmd: ["node", "tools/qa.js", "deep-test"], browser: true },
  { name: "files", cmd: ["node", "tools/qa.js", "full-qa", "files"], browser: true },
  { name: "offline", cmd: ["node", "tools/qa.js", "full-qa", "offline"], browser: true },
];

const skip = list("skip") || [],
  only = list("only"),
  picked = STEPS.filter((s) => (only ? only.includes(s.name) : !skip.includes(s.name))),
  started = Date.now(),
  results = [];

function run(step) {
  return new Promise((resolve) => {
    const t0 = Date.now(),
      child = spawn(step.cmd[0], step.cmd.slice(1), { stdio: ["ignore", "inherit", "inherit"] });
    child.on("close", (code) => {
      const secs = +((Date.now() - t0) / 1000).toFixed(1);
      results.push({ name: step.name, code, secs });
      resolve(code);
    });
  });
}

function runBuild() {
  return new Promise((resolve) => {
    const t0 = Date.now(),
      child = spawn("node", ["build.js"], { stdio: "inherit" });
    child.on("close", (code) => {
      results.push({ name: "build", code, secs: +((Date.now() - t0) / 1000).toFixed(1) });
      resolve(code);
    });
  });
}

if (!flag("no-build") && picked.some((s) => s.browser)) {
  if ((await runBuild()) !== 0) {
    console.log("RUN-ALL: build failed");
    process.exit(1);
  }
}

const light = picked.filter((s) => !s.browser),
  heavy = picked.filter((s) => s.browser);

// the long one first, so the short checks fit inside it rather than after it
const heavyRun = (async () => {
  for (const step of heavy) if ((await run(step)) !== 0) return 1;
  return 0;
})();

const lightRun = await Promise.all(light.map((step) => run(step)));
const heavyCode = await heavyRun;

const failed = results.filter((r) => r.code !== 0),
  total = +((Date.now() - started) / 1000).toFixed(1);
for (const r of results) console.log(`  ${r.code === 0 ? "PASS" : "FAIL"} ${r.name.padEnd(12)} ${r.secs} s`);
console.log(`RUN-ALL: ${failed.length ? "FAIL" : "all passed"} in ${total} s`);
process.exit(failed.length || lightRun.some((c) => c !== 0) || heavyCode ? 1 : 0);
