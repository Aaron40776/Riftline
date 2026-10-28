// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/data-audit.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "3.60.0",
    title: "An arrival that says what is coming",
    items: [
      "Enemies now land with a shape that matches their weight: the light ones arrive in a quick streak, the heavy ones under a slow wide ring and a puff of dust.",
      "Before, all 25 types arrived the same way \u2014 same ring, same burst, same size \u2014 so the first thing you saw of a Brute looked like the first thing you saw of a Swarmer.",
      "The colour was already each type's own (and gold for an elite); it is unchanged. No damage, speed or spawn-time change.",
    ],
  },
  {
    version: "3.59.0",
    title: "The Weekly Rift",
    items: [
      "THE WEEKLY RIFT joins the Daily: one run a week, the same for every pilot, with a twist — two mutators are pinned for the whole week and are on from wave 1.",
      "Seed, weapon, threat and both mutators come from the ISO week; a new Rift opens every Monday 00:00 UTC.",
      "Like the Daily it ignores your workshop and pacts, so everyone flies the same drone, and it keeps its own best-of-week and a count of the weeks you played.",
      "You reach it on the Rifts page, under the Daily; the home-screen dot now lights up for an unplayed week too.",
      "The Daily Rift and its streak are unchanged.",
    ],
  },
  {
    version: "3.58.0",
    title: "A fairer first run, and no more silent defaults",
    items: [
      "Reduce motion now really stills the camera: the shake and the weapon recoil follow the device's setting instead of only the menus.",
      "The free Pulse hits 8% harder: the bench cleared a wave in 39.9 s with it against 25.2 s with the Ember Jet, and it is the one weapon every new player owns.",
      "The first boss brings a smaller escort, so learning the Warden's three attacks no longer costs most of a hull.",
      "Cryo Skates gives +9% speed a level everywhere (was +4%), with the ice bonus on top, so it is not a worse Servo Thrusters outside the Aurora Shelf.",
      "The Repair Beacon appears in the Glowmarsh: it was in no wave before wave 26, so its Codex entry and its tip reached nobody.",
      'Every threat level says exactly what it does \u2014 hull, damage, wave size, elites, bosses and shards \u2014 instead of "only for tuned builds".',
      "The Glasswyrm gets a medal par of its own (68 s) instead of an unnamed 70 s default, and a self-test now checks every place's boss against the per-boss tables.",
    ],
  },
  {
    version: "3.57.0",
    title: "A calmer camera and a shorter options screen",
    items: [
      "The screen shake calmed: in Endless a burst of hits can no longer keep the camera ringing, and the worst single shove is about half of what it was.",
      "Five options nobody used are gone — camera distance, warning contrast, the screen-shake switch, the run timer and the FPS counter — so the settings screen is shorter.",
      "Ask your device for less motion and the camera goes still: the screen shake and the weapon recoil stop, while the flashes, damage numbers, sounds and telegraphs all stay.",
      "Every biome keeps exactly one boss again: the Glass Flats no longer falls back to a boss that belongs to another place.",
    ],
  },
  {
    version: "3.56.0",
    title: "The Glasswyrm takes the desert",
    items: [
      "THE GLASSWYRM is the Glass Flats' own boss: a serpent of living fused glass that swims the sand beneath the sheets — a foundry golem never belonged there, and the Crucible goes back to the bench.",
      "RISE: the glass bulges in a racing chain, then the wyrm bursts up where it ends — the bulges show exactly where NOT to stand.",
      "SUNLANCE: it bends the noon through its body into a sweeping hot lance — and the MIRAGE surfaces where you are not.",
      "Enraged, the sun stands still: NOON — a dial of five lances turns while the glass bursts in rings.",
      "Its card, the Glasswyrm Fang: every 14 kills the last kill bursts into piercing glass lances.",
      "The wyrm sings its own boss track at 134, and the Vitrified milestone replaces Quenched (earned saves keep it).",
      "The Crucible, its hammer card and its music stay in the game for the saves that own them — just not in the desert.",
    ],
  },
];
