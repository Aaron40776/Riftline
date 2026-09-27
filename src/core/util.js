// Small helpers used everywhere: clamp/lerp, number and time formatting, the seeded RNG and
// hashing, version and build id.

function rlAgo(t) {
  const s = Math.max(0, (Date.now() - t) / 1e3);
  return s < 60
    ? "now"
    : s < 3600
      ? Math.floor(s / 60) + "m ago"
      : s < 86400
        ? Math.floor(s / 3600) + "h ago"
        : Math.floor(s / 86400) + "d ago";
}
var TAU = Math.PI * 2,
  clamp = (i, t, e) => (i < t ? t : i > e ? e : i);
function angleDiff(i, t) {
  let e = (t - i) % TAU;
  return (e > Math.PI && (e -= TAU), e < -Math.PI && (e += TAU), e);
}
function turnToward(i, t, e) {
  let n = angleDiff(i, t);
  return Math.abs(n) <= e ? t : i + Math.sign(n) * e;
}
var dampFactor = (i, t) => 1 - Math.exp(-i * t);
function makeRng(i) {
  let t = i >>> 0,
    e = () => {
      t = (t + 1831565813) >>> 0;
      let n = t;
      return (
        (n = Math.imul(n ^ (n >>> 15), n | 1)),
        (n ^= n + Math.imul(n ^ (n >>> 7), n | 61)),
        ((n ^ (n >>> 14)) >>> 0) / 4294967296
      );
    };
  return {
    next: e,
    range: (n, s) => n + (s - n) * e(),
    int: (n, s) => n + Math.floor(e() * (s - n + 1)),
    chance: (n) => e() < n,
    pick: (n) => n[Math.floor(e() * n.length)],
    get state() {
      return t;
    },
  };
}
function weightedPick(i, t, e) {
  let n = 0;
  for (let r of e) n += r;
  if (n <= 0) return t[0];
  let s = i.next() * n;
  for (let r = 0; r < t.length; r++) if (((s -= e[r]), s <= 0)) return t[r];
  return t[t.length - 1];
}
function hashString(i) {
  let t = 2166136261;
  for (let e = 0; e < i.length; e++) ((t ^= i.charCodeAt(e)), (t = Math.imul(t, 16777619)));
  return t >>> 0;
}
function formatTime(i) {
  i = Math.max(0, Math.floor(i));
  let t = Math.floor(i / 60),
    e = i % 60;
  return t + ":" + String(e).padStart(2, "0");
}
function formatCount(i) {
  return ((i = Math.floor(i)), i >= 1e4 ? (i / 1e3).toFixed(i >= 1e5 ? 0 : 1) + "k" : String(i));
}
var GAME_VERSION = __RL_VERSION__;
function smoothstep(i) {
  return ((i = clamp(i, 0, 1)), i * i * (3 - 2 * i));
}
function easeOutBack(i) {
  return 1 + 2.70158 * Math.pow(i - 1, 3) + 1.70158 * Math.pow(i - 1, 2);
}
var BUILD_ID = __RL_BUILD__;

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
