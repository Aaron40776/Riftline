// Helpers shared by the browser tests (not a test script of its own; tools/qa.js lists only tests/*.mjs).

// 3.10.0: waits for a screen the game opens after some game time (the upgrade choice after a clear, the victory
// screen). The limit counts game seconds the way the main loop does (each frame at most 0.1 s): under software GL
// the game runs at 2 to 6 fps, so the old wall-clock limits failed at random although the game was right. A
// wall-clock cap still ends the wait when the page hangs.
export async function waitScreenGame(page, id, gameSec, capMs = 150000) {
  await page.evaluate(() => {
    if (window.__qaClock) return;
    const clock = (window.__qaClock = { t: 0 });
    let last = performance.now();
    const tick = (now) => {
      clock.t += Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const t0 = await page.evaluate(() => window.__qaClock.t);
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
