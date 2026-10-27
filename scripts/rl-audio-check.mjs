// Chaos checks for the audio-engine reliability fixes (audit H1/H2 + the room pool).
// Usage: node scripts/rl-audio-check.mjs [base-url]   (a server must already serve the build)
import { chromium } from "playwright";
import { launchArgs } from "../tests/lib/renderer.mjs";

const BASE = process.argv[2] || "http://localhost:8126/index.html";
const browser = await chromium.launch({ args: launchArgs() });
const page = await browser.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
await page.goto(BASE, { timeout: 90000 });
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });

const result = await page.evaluate(async () => {
  const out = { fail: [] };
  const sound = window.__riftTest.game.sound;
  if (!sound) {
    out.fail.push("no sound engine");
    return out;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // H1: the scheduler is alive and stepping after unlock
  sound.unlock();
  sound.setMusic("fight", "yard");
  await wait(400);
  if (!sound.timer) out.fail.push("scheduler not running after unlock");
  const sched0 = sound.musicScheduled;
  await wait(300);
  if (sound.musicScheduled <= sched0) out.fail.push("scheduler not stepping notes");

  // H1 chaos 1: a throw inside the note path is contained per step (the tick keeps advancing)
  const realNote = sound.note.bind(sound);
  let threw = 0;
  sound.note = (...a) => {
    threw++;
    throw new Error("chaos");
  };
  await wait(300);
  sound.note = realNote;
  if (!threw) out.fail.push("chaos throw never reached the note path");
  if (!sound.timer) out.fail.push("scheduler died after a note throw");
  if (sound.schedFails) out.fail.push("note throw should be contained by the per-step guard");
  const after = sound.musicScheduled;
  await wait(400);
  if (sound.musicScheduled <= after) out.fail.push("music did not keep stepping through note throws");

  // H1 chaos 2: a throw outside the per-step guard (syncTrack) kills the interval — it must
  // re-arm with a backoff and recover
  const realSyncTrack = sound.syncTrack.bind(sound);
  let stThrew = 0;
  sound.syncTrack = (...a) => {
    stThrew++;
    throw new Error("chaos-track");
  };
  await wait(150);
  sound.syncTrack = realSyncTrack;
  if (!stThrew) out.fail.push("chaos throw never reached syncTrack");
  if (sound.timer) out.fail.push("timer not released after the throw");
  if (!sound.schedFails) out.fail.push("scheduler failure not counted");
  await wait(2200);
  if (!sound.timer) out.fail.push("scheduler did not re-arm after the throw");
  const after2 = sound.musicScheduled;
  await wait(400);
  if (sound.musicScheduled <= after2) out.fail.push("music did not recover after the re-arm");

  // H2: a room tone whose build throws is cleaned up, marked dead, and not rebuilt inside 10 s
  const realOsc = sound.ctx.createOscillator.bind(sound.ctx);
  sound.ctx.createOscillator = () => {
    throw new Error("chaos-osc");
  };
  sound.toneBed = null;
  sound.deadTone = Object.create(null);
  let toneThrew = false;
  try {
    sound.startTone("yard");
  } catch (e) {
    toneThrew = true;
  }
  sound.ctx.createOscillator = realOsc;
  if (sound.toneBed) out.fail.push("toneBed left registered after a failed build");
  if (!sound.deadTone.yard) out.fail.push("deadTone not marked after the throw");
  try {
    sound.startTone("yard");
  } catch {}
  if (sound.toneBed) out.fail.push("dead tone was rebuilt inside the 10 s window");
  sound.deadTone = Object.create(null);
  sound.startTone("yard");
  if (!sound.toneBed) out.fail.push("tone did not start after the dead mark was cleared");
  sound.stopTone();

  // track switches exercise the two-room pool and the rollback paths
  for (const [kind, biome] of [
    ["boss", "yard"],
    ["fight", "vault"],
    ["menu", "yard"],
    ["fight", "marsh"],
    ["fight", "club"],
    ["boss", "club"],
    ["fight", "flats"],
    ["boss", "flats"],
  ]) {
    sound.setMusic(kind, biome);
    await wait(150);
  }
  if (!sound.timer) out.fail.push("scheduler died across track switches");
  if (!sound.verbPool || sound.verbPool.length !== 2) out.fail.push("room pool is not two rooms");
  if (!sound.verb || !sound.verbOut) out.fail.push("active room lost after switches");
  return out;
});

console.log(JSON.stringify(result, null, 1));
console.log(result.fail.length ? "AUDIO CHAOS: FAIL" : "AUDIO CHAOS: ok");
await browser.close();
process.exit(result.fail.length ? 1 : 0);
