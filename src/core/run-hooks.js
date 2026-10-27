// 3.30.0: the link from the simulation to the run monitor of core/diagnostics.js. World used to import diagnostics.js,
// which imports main.js and the DOM UI, so the simulation could only run in a browser. Now diagnostics.js fills these
// hooks and World only reads them: the World runs in Node too (npm run test:sim).
//   world      the World the monitor watches (the live run), or null
//   step, issue, beginWave   the monitor's functions (rlMonStep, rlMonIssue, rlMonBeginWave)
//   log        the error log (logError; see hookLog below)
export const runHooks = { world: null, step: null, issue: null, beginWave: null, log: null };

// 3.32.0: the error log of core/diagnostics.js for modules that must load without it (core/save.js, in Node too). Errors
// logged before diagnostics.js has registered its logger (the save is read while the modules load) wait here.
const early = [];
export function hookLog(where, error) {
  if (runHooks.log) runHooks.log(where, error);
  else if (early.length < 20) early.push([where, error]);
}
export function setLogHook(log) {
  runHooks.log = log;
  for (const [where, error] of early.splice(0)) log(where, error);
}
