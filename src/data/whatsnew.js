// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; the QA checks it). Keep every line to one short sentence.
export const WHATS_NEW = [
  {
    version: "3.45.2",
    title: "The edges sanded",
    items: [
      "A crash report now speaks about the crash: a finished run's audit no longer wanders into it as if it were the crashed run.",
      "The end of a run no longer warns about a missing monitor - the monitor is simply a test-room guest.",
      "The player-mode test grew sharper: it resumes runs, dies a normal death and crashes on purpose, all without the test flag.",
    ],
  },
  {
    version: "3.45.1",
    title: "The false start",
    items: [
      "Runs start again: a test-only watchdog tripped every run three frames in - it stands down for players now.",
      "The startup check stops missing the log button that 3.45.0 retired, so the health list is green again.",
      "A new test plays a run like a real player, so a fix that only works in the test lab can't ship again.",
    ],
  },
  {
    version: "3.45.0",
    title: "The quieter screen",
    items: [
      "The HUD says everything once: the progress bar carries the count, the hull is its bar and its number.",
      "The buttons rest: no seconds under DASH, the gadget ring speaks only while it recharges, a charged NOVA glows instead of pulsing.",
      "Damage numbers stay a handful, and a burn keeps one live number instead of a fresh one every half second.",
      "The boss intro card carries the name alone - no second banner on top of it.",
      "Banners and title cards glow softer and the chips tick calmer: the fight stays loud, the screen stays quiet.",
    ],
  },
  {
    version: "3.44.0",
    title: "The soft edges",
    items: [
      "Every place dissolves at its rim now: the fog steps closer, so the far edge fades like weather.",
      "Kills shed fewer, rounder pieces that settle gently instead of spraying bright cubes.",
      "The vault rests: the frost decals and glints keep a step back so enemies read on the white.",
      "The marsh glows: fireflies hover over the pools and the reeds lean with a slow wind.",
      "The storms breathe: a Whiteout gathers and passes slower, the Blackout settles without a snap.",
    ],
  },
  {
    version: "3.43.1",
    title: "The seams closed",
    items: [
      "An abandoned run goes fully quiet behind its end screen: no fight sounds and no heartbeat under the menu music.",
      "The hidden test machinery no longer runs inside a normal game - a player's run carries none of it.",
      "A Chrono Dash slow-mo runs out on the upgrade screen instead of leaking into the next wave.",
      "The escorts a boss takes with it vanish without the screen punch, and a boss killed after death pays no medal.",
    ],
  },
  {
    version: "3.43.0",
    title: "The living quiet",
    items: [
      "Every place breathes now: the city hums, the furnaces rumble, the vault wind wanders - also on the home and upgrade screens.",
      "The storms arrive like weather: a Whiteout gathers and passes instead of snapping on and off.",
      "The room reacts: blasts press the ambience down for a moment, and a boss dips the world while it walks.",
      "Endless wakes up slowly: past wave 20 the far sounds of a biome come a little more often.",
    ],
  },
  {
    version: "3.42.0",
    title: "A deeper voice",
    items: [
      "The weapons lose the arcade chirp: the Pulse lands as a weighty thoom, the Arc Caster crackles like current, the Disc rings lower.",
      "Enemies die lower and heavier: bubbles, short circuits, glass and ghosts all sound an octave deeper.",
      "A Whiteout muffles the whole world behind the storm, and lifts when it passes.",
      "Menus speak softer: clicks and hovers are warm low blips instead of high ticks.",
    ],
  },
];
