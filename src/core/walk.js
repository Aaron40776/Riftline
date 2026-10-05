// 3.17.0: the walker. The drone became a two-legged robot (render/models.js buildPlayerModel); this is its stride. Every
// STEP_LEN metres the drone walks, a foot comes down: a `step` event (with the ground it comes down on) that the
// renderer shows as a puff of dust and the sound engine plays as a footstep of that ground. A dash is a jump: the legs
// tuck while it lasts and a `land` event comes when it ends. The stride (`player.stride`, metres walked) also drives the
// walk cycle of the model, so the legs and the sounds always agree. Nothing here changes how the drone moves.

const STEP_LEN = 1,
  // how long a dash lasts (World.step sets player.dashT to it): the jump of the model follows it
  DASH_TIME = 0.17;

// the ground under the drone: the sheets of ice and the pools of acid of the arena, else the floor of the biome
const FLOOR = { yard: "asphalt", works: "grate", vault: "frost", marsh: "mud", void: "glass" };
function groundOf(world) {
  const player = world.player;
  if (player.onIce) return "ice";
  if (player.inAcid) return "acid";
  return FLOOR[world.arena.biome.id] || "asphalt";
}

// called after the drone moved (World.step): x0, y0 is where it stood before
function walkStep(world, x0, y0, dt) {
  const player = world.player;
  if (!player.alive) {
    player.air = false;
    return;
  }
  if (player.dashT > 0) {
    // in the air: no steps, the stride stands still
    player.air = true;
    return;
  }
  if (player.air) {
    player.air = false;
    world.emit("land", { x: player.x, y: player.y, ground: groundOf(world) });
  }
  const moved = Math.hypot(player.x - x0, player.y - y0);
  if (moved < 1e-4) return;
  const before = Math.floor(player.stride / STEP_LEN);
  player.stride += moved;
  const after = Math.floor(player.stride / STEP_LEN);
  // a long step in one frame (a slow machine) is at most two feet down
  for (let n = before; n < Math.min(after, before + 2); n++)
    world.emit("step", {
      x: player.x,
      y: player.y,
      foot: (n + 1) & 1,
      ground: groundOf(world),
      v: moved / Math.max(dt, 1e-3),
    });
}

export { STEP_LEN, DASH_TIME, FLOOR, groundOf, walkStep };
