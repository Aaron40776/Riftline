# Systems reference

## Game loop
```js
const STEP = 1 / 60; let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min((now - last) / 1000, 0.25); last = now;   // clamp: tab switches / hitches
  while (acc >= STEP) { simulate(STEP); acc -= STEP; }
  render(acc / STEP);                                          // interpolate between sim states
  requestAnimationFrame(frame);
}
```

## Input
- Abstract to actions (`move`, `fire`, `dash`), map devices onto them; show prompts for the last-used device.
- Touch: virtual stick with dynamic origin, 44 px+ targets, multi-touch ids, `touch-action: none`,
  prevent scroll/zoom, handle `pointercancel`. Gamepad API: poll per frame, radial dead zone ~0.15–0.2.
- Lose focus / `visibilitychange` → pause and release all keys.

## Collision & physics
Broadphase (uniform grid / spatial hash for many small actors), narrowphase on circles/capsules/AABBs for
arcade games; a physics engine only when you need stacking, joints or rigid-body response. Use layers/masks.
Swept tests for fast projectiles.

## AI
Finite state machine for most enemies (idle → telegraph → attack → recover); utility AI for choosing among
many options; separation/steering for crowds; flow fields for many agents to one target. Every attack has a
readable telegraph (pose + VFX + sound) of 300–800 ms scaled by difficulty.

## Saves
`{ version, data }`; migrate old versions forward; validate; on parse failure keep a backup and start clean
with a message; write atomically (write new key then swap); namespace keys per game; never touch other apps' keys.

## Procedural content
Seeded generators, constraints validated by tests (reachability, spawn fairness), designer-tunable tables,
and a debug view. Prefer authored chunks + procedural assembly over pure noise.

## Testing
Unit tests for pure systems, determinism snapshot (seed → state hash after N steps), headless bot runs for
balance (survival time distribution per wave), e2e in a browser for input/UI/rendering smoke, screenshots
for visual regressions.
