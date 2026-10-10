/* 3.31.0: smooth motion at any refresh rate. The simulation steps at a fixed 60 Hz (rlStep); a frame of the screen
   falls between two steps. Drawing the last step as it is makes motion judder: on a 90 Hz screen frames get 1, 1 and 0
   steps in turn, on 120 Hz every other frame repeats, and at 60 Hz the jitter of the frame clock gives 0 or 2 steps now
   and then. Here the moving things (the drone, enemies and bosses, shots, pickups) are drawn between the step before and
   the last step, by the part of a step the clock has run on (game.acc / rlStep).
   capture(world) runs before every world step; apply(world, alpha) moves the positions for drawing and restore() puts
   the exact values back before anything else reads them, so the simulation never sees a drawn position. Nothing is
   allocated per frame: the references and positions live in buffers that grow once. */

// a move longer than this in one step is a jump (a portal, a new wave, a spawn) and is drawn where it lands
const JUMP = 2.5;

let refs = [],
  prev = new Float64Array(1024),
  cur = new Float64Array(1024),
  count = 0,
  applied = 0;

function grow(n) {
  if (n * 2 <= prev.length) return;
  const size = Math.max(n * 2, prev.length * 2);
  const p = new Float64Array(size);
  p.set(prev);
  prev = p;
  cur = new Float64Array(size);
}

function add(e) {
  grow(count + 1);
  refs[count] = e;
  prev[count * 2] = e.x;
  prev[count * 2 + 1] = e.y;
  count++;
}

function addList(list) {
  if (!list) return;
  for (let i = 0; i < list.length; i++) add(list[i]);
}

/** remembers where everything is before a step of the world */
function capture(world) {
  count = 0;
  if (!world || !world.player) return;
  add(world.player);
  addList(world.enemies);
  addList(world.pb);
  addList(world.eb);
  addList(world.pickups);
  // drop the references of the last capture beyond the new count (no stale objects kept alive)
  if (refs.length > count * 2 + 64) refs.length = count;
}

/** moves the captured things to their place between the step before and the last step (alpha 0 to 1) */
function apply(alpha) {
  applied = 0;
  if (!(alpha >= 0)) return;
  if (alpha > 1) alpha = 1;
  for (let i = 0; i < count; i++) {
    const e = refs[i],
      x = e.x,
      y = e.y,
      px = prev[i * 2],
      py = prev[i * 2 + 1];
    cur[i * 2] = x;
    cur[i * 2 + 1] = y;
    if (!(Math.abs(x - px) < JUMP && Math.abs(y - py) < JUMP)) continue;
    e.x = px + (x - px) * alpha;
    e.y = py + (y - py) * alpha;
  }
  applied = count;
}

/** puts the exact positions of the simulation back */
function restore() {
  for (let i = 0; i < applied; i++) {
    const e = refs[i];
    e.x = cur[i * 2];
    e.y = cur[i * 2 + 1];
  }
  applied = 0;
}

/** forgets the capture (a new run, Home); the next frame draws the world as it is until a step captures again */
function reset() {
  restore();
  count = 0;
  refs.length = 0;
}

export { capture as interpCapture, apply as interpApply, restore as interpRestore, reset as interpReset };
