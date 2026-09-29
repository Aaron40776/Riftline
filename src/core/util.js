// Small helpers used everywhere: clamp/lerp, number and time formatting, the seeded RNG and
// hashing, version and build id.

function rlAgo(time) {
  const secs = Math.max(0, (Date.now() - time) / 1e3);
  return secs < 60
    ? "now"
    : secs < 3600
      ? Math.floor(secs / 60) + "m ago"
      : secs < 86400
        ? Math.floor(secs / 3600) + "h ago"
        : Math.floor(secs / 86400) + "d ago";
}
const TAU = Math.PI * 2,
  clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
function angleDiff(from, to) {
  let diff = (to - from) % TAU;
  if (diff > Math.PI) {
    diff -= TAU;
  }
  if (diff < -Math.PI) {
    diff += TAU;
  }
  return diff;
}
function turnToward(angle, target, maxStep) {
  let diff = angleDiff(angle, target);
  return Math.abs(diff) <= maxStep ? target : angle + Math.sign(diff) * maxStep;
}
const dampFactor = (rate, dt) => 1 - Math.exp(-rate * dt);
function makeRng(seed) {
  let state = seed >>> 0,
    next = () => {
      state = (state + 1831565813) >>> 0;
      let x = state;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    get state() {
      return state;
    },
  };
}
function weightedPick(rng, items, weights) {
  let total = 0;
  for (let weight of weights) total += weight;
  if (total <= 0) return items[0];
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function formatTime(secs) {
  secs = Math.max(0, Math.floor(secs));
  let mins = Math.floor(secs / 60),
    rest = secs % 60;
  return mins + ":" + String(rest).padStart(2, "0");
}
function formatCount(n) {
  n = Math.floor(n);
  return n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : String(n);
}
const GAME_VERSION = __RL_VERSION__;
function smoothstep(x) {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
}
function easeOutBack(x) {
  return 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
}
const BUILD_ID = __RL_BUILD__;

export {
  smoothstep,
  BUILD_ID,
  clamp,
  TAU,
  turnToward,
  hashString,
  easeOutBack,
  GAME_VERSION,
  angleDiff,
  weightedPick,
  makeRng,
  formatCount,
  rlAgo,
  formatTime,
  dampFactor,
};
