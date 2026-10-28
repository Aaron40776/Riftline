// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/data-audit.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "3.58.0",
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
  {
    version: "3.55.1",
    title: "Everything called by its right name",
    items: [
      "A naming sweep: the build notes and the field guide now use the six places' current names everywhere.",
      "The event list reads complete: Spore Tide, Whiteout, Dust Devils, Ashfall, Rift Storm and Blackout.",
      "The Crucible is named the Glass Flats' boss wherever it is introduced.",
      "No gameplay, save or record changes — words only.",
    ],
  },
  {
    version: "3.55.0",
    title: "Every place gets its detail pass",
    items: [
      "The Aurora Shelf sells its name: a curtain of green rays now hangs at the top of the sky, and the aurora's reflection sweeps the night ice in bright bands.",
      "The Shelf's frozen rinks read as night glass — deep blue with bright cracks — instead of white discs.",
      "The snow catches the aurora's green and pink as it falls.",
      "The Glass Flats reads as fused glass: every sheet took the melt differently, a sun-glare band slides across the plain, and the loose sand keeps the wind's ripples.",
      "The Flats' props went pale: sunlit dunes, brighter glass ridges with hot fused edges, and glass blisters where the melt bubbled.",
      "Dust devils and sunspikes now throw dust and sand, not dark boxes — the brown clutter is gone.",
      "Every change is visual only — saves, records and the run's rng are untouched.",
    ],
  },
];
