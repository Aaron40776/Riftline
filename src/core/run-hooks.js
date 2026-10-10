// 3.30.0: the link from the simulation to the run monitor of core/diagnostics.js. World used to import diagnostics.js,
// which imports main.js and the DOM UI, so the simulation could only run in a browser. Now diagnostics.js fills these
// hooks and World only reads them: the World runs in Node too (npm run test:sim).
//   world      the World the monitor watches (the live run), or null
//   step, issue, beginWave   the monitor's functions (rlMonStep, rlMonIssue, rlMonBeginWave)
export const runHooks = { world: null, step: null, issue: null, beginWave: null };
