// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; the QA checks it). Keep every line to one short sentence.
export const WHATS_NEW = [
  {
    version: "3.51.0",
    title: "The shelf sings under the aurora",
    items: [
      "The Cryo Vault is now THE AURORA SHELF — the arctic shelf at night: indigo snowfields under curtains of green and pink light, blue ice ridges, and expedition arks half-sunk in the ice.",
      "The blizzard breathes: every ~20 s the storm thickens and thins, and the thin ice freezes and thaws with it — traction comes and goes, so time your sprints.",
      "WHITEOUT is the storm's peak now: it locks the breath dense and closes in on top.",
      "The Frost Prism carries two aurora gems in its orbit, and every enemy's rim drifts aurora green to pink.",
      "The calm theme's ice bells became a music box, and the shelf's wind keeps singing under it.",
      "Saves and records carry over untouched: it is still the same biome underneath.",
    ],
  },
  {
    version: "3.50.0",
    title: "The marsh glows in the dark",
    items: [
      "The Toxin Marsh is now THE GLOWMARSH — the swamp after dark: black water over dark peat, veins of glowing algae, glowcap mushrooms and drifting spores. The light is the warning: the brightest water is where the acid is.",
      "The SPORE TIDE event: the pools swell like before, and once the tide is in it breathes — a slow pull-back and return that opens windows to cross.",
      "The mud clings: quick to stop, slow to sprint — the marsh is the opposite of the Vault's slick floor.",
      "The Hive Queen wears a crown of glowcaps now, and she goes out in a burst of spores. The Toxic variant is the Bloomed: it still bursts into a pool when it dies.",
      "The marsh's own sounds stay bayou — frogs, crickets, mud — and the night adds drips off the glowcaps.",
      "Saves and records carry over untouched: it is still the same biome underneath.",
    ],
  },
  {
    version: "3.49.0",
    title: "The caldera takes the foundry's place",
    items: [
      "Ember Works is gone: the fire biome is now the Ashfall Caldera — charred basalt plates split by molten seams, obsidian spires, falling ash and fumaroles that jet magma.",
      "Its boss is THE ASH TYRANT, the mountain that walks: a molten fan of slugs, a shoulder charge, the burning dead — and when it is hurt it calls FIRESTORM.",
      "The caldera plays its own music: a slow march with cracking crust and a deep drum, and a boss track that ends in a roar.",
      "The ASHFALL event: lights out under the ash, every fumarole jets in step.",
      "The foundry's heavy crews joined the caldera: mortars, minebots and drillers march with the burning dead.",
      "The Kingpin's Cut card is now the Tyrant's Tithe (same payout); saves and records carry over untouched.",
    ],
  },
  {
    version: "3.48.0",
    title: "Hear what you set",
    items: [
      "The volume sliders speak up: turning Effects fires the weapon in your hand, Music plays the arrival hit of the arena and Ambience sounds a far voice of the place — always at the level you set.",
      "A Restore default settings button puts every slider, switch and the HUD layout back to stock in one tap; your progress stays as it is.",
    ],
  },
  {
    version: "3.47.0",
    title: "The Onyx Club opens its doors",
    items: [
      "A sixth biome: the Onyx Club, a speakeasy under the city — a checkerboard dance floor, brass and velvet, and stage pyro that jets gold between the tables.",
      "Its boss is THE KINGPIN, owner of the club: a tommy-gun barrage, a shoulder charge, the boys in the back room and molotovs — and when he is hurt he calls LAST CALL.",
      "The club plays its own music: a smoky jazz calm theme with finger snaps and a walking bass, and a mean noir-funk boss track that ends in a scream.",
      "The vice squad shows up too: the RAID event kills the lights and every pyro jets in step.",
      "His exclusive card, the Kingpin's Cut: every 20 kills the tribute pays out in shards and a bandage.",
    ],
  },
  {
    version: "3.46.0",
    title: "Every place sings its own song",
    items: [
      "The boss tracks are epic now: the theme of the arena rings out in two octaves, tom fills walk into every section change and a long fight keeps growing.",
      "The arrival of a boss is a braam: a hall-filling hit with a sub drop, brass and the choir taking the octave.",
      "Each biome walks its own gait: the City swings like noir, the Marsh drags like the bayou, and the Works, the Vault and the Core let their chords breathe over two bars.",
      "New signature voices: a comping piano under the rain, a machine bass in the foundry, a glass run in the ice cavern, a dub answer in the marsh and a whisper chant in the core.",
    ],
  },
  {
    version: "3.45.5",
    title: "A mix you can hear",
    items: [
      "The music steps back: the fight theme now sits clearly under your shots, and the boss tracks no longer bury the fight in sound.",
      "The place got its voice back: rain, furnaces, wind, crickets and the hum of the core stay audible while the music plays.",
      "Two Settings switches woke up: Screen shake really calms the camera now, and Damage numbers really turns the floating numbers off.",
    ],
  },
  {
    version: "3.45.4",
    title: "The phone buzzes",
    items: [
      "Vibration reaches iPhones at last: a hit, a dash and the end of a run give a short tick on the iOS versions that still allow it (Apple silenced the web trick in 26.5, iOS 27 lets it back in).",
      "Settings has a Test button for vibration, and the line under it says honestly what this device can do - a controller still rumbles everywhere.",
      "The end screen answers to R: run again without reaching for the mouse.",
    ],
  },
  {
    version: "3.45.3",
    title: "The first chip",
    items: [
      "Dashing with Slipstream, a stun, a barrier - the first timed buff chip threw an error three frames in a row and killed the run; the HUD row now reads the store it was always meant to read.",
      "The player battery dashes for real through the DASH button with every timed chip lit, so a HUD crash can't hide from the tests again.",
      "A one-rule linter (no-undef) fails any bare name that is not an import, a local or a build token - this class of bug cannot ship again.",
      "The repo has a README, and the build info counts its workshop modules right.",
    ],
  },
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
