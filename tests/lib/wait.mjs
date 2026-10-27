// Helpers shared by the browser tests (not a test script of its own; tools/qa.js lists only tests/*.mjs).

// The game clock as the main loop sees it: every animation frame adds its time, at most 0.1 s (main.js clamps dt the
// same way). Started on first use in a page; returns the current reading.
export async function gameClock(page) {
  return page.evaluate(() => {
    if (!window.__qaClock) {
      const clock = (window.__qaClock = { t: 0 });
      let last = performance.now();
      const tick = (now) => {
        clock.t += Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    return window.__qaClock.t;
  });
}

// Waits until the game has run for gameSec seconds (for input held "for a while"); false after capMs of real time.
export async function waitGameTime(page, gameSec, capMs = 120000) {
  const t0 = await gameClock(page);
  return page
    .waitForFunction(([t0, s]) => window.__qaClock.t - t0 >= s, [t0, gameSec], { timeout: capMs })
    .then(
      () => true,
      () => false,
    );
}

// 3.10.0: waits for a screen the game opens after some game time (the upgrade choice after a clear, the victory
// screen). The limit counts game seconds the way the main loop does (each frame at most 0.1 s): under software GL
// the game runs at 2 to 6 fps, so the old wall-clock limits failed at random although the game was right. A
// wall-clock cap still ends the wait when the page hangs.
export async function waitScreenGame(page, id, gameSec, capMs = 150000) {
  const t0 = await gameClock(page);
  return page
    .waitForFunction(
      ([i, t0, limit]) => {
        if (!document.getElementById(i).hidden) return true;
        if (window.__qaClock.t - t0 > limit) throw new Error(`#${i} not shown within ${limit} game seconds`);
        return false;
      },
      [id, t0, gameSec],
      { timeout: capMs },
    )
    .then(
      () => true,
      () => false,
    );
}
