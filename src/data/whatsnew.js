// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/data-audit.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
