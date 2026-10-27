/* 3.31.0: frame pacing on phones and tablets. A 120 Hz (or 144 Hz) screen asks for a frame at every refresh, twice
   the GPU work and heat of 60 Hz, which the owner felt on his phone. On touch devices with Auto or High quality a screen
   faster than 100 Hz draws every other refresh (60 or 72 frames a second, evenly spaced; render/interp.js keeps the
   motion smooth). A 90 Hz screen keeps all its frames: dropping every third would make the spacing uneven. Desktops and
   the Saver setting (its own 30 fps cap) are not touched. The refresh rate is learnt from the frame clock itself. */

function makePacer() {
  return { avg: 0, last: 0, skip: false };
}

/** true when this refresh should be drawn; `halve` allows halving fast screens */
function paceFrame(pacer, now, halve) {
  const raw = pacer.last ? (now - pacer.last) / 1000 : 0;
  pacer.last = now;
  // a long gap (a hidden tab, a hitch) says nothing about the screen
  if (raw > 0 && raw < 0.05) pacer.avg = pacer.avg ? pacer.avg + (raw - pacer.avg) * 0.05 : raw;
  if (!halve || !(pacer.avg > 0 && pacer.avg < 1 / 100)) {
    pacer.skip = false;
    return true;
  }
  pacer.skip = !pacer.skip;
  return !pacer.skip;
}

export { makePacer, paceFrame };
