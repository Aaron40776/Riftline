// 3.35.0: the modules the deep self-test reads. The self-test is a file of its own (selftest-v<version>.js, built by
// build.js), loaded only by the tests; its imports are these namespaces of the running game (live bindings), so it
// tests the game itself and the player's game file carries none of it. Keys are the specifiers selftest.js imports.

import * as mui from "../ui/ui.js";
import * as minput from "../ui/input.js";
import * as msound from "../audio/sound.js";
import * as mattacks_view from "../render/attacks-view.js";
import * as mplace from "../audio/place.js";
import * as mwalk from "./walk.js";
import * as mmodels from "../render/models.js";
import * as mboss_cards from "./boss-cards.js";
import * as msave from "./save.js";
import * as menemies from "../data/enemies.js";
import * as mmain from "../main.js";
import * as mutil from "./util.js";
import * as mai from "./ai.js";
import * as mmutators from "./mutators.js";
import * as mbiomes from "../data/biomes.js";
import * as mweapons from "../data/weapons.js";
import * as mwaves from "./waves.js";
import * as mworld from "./world.js";
import * as mprogression from "../data/progression.js";
import * as mupgrades from "../data/upgrades.js";
import * as mdifficulty from "./difficulty.js";
import * as mtraps from "./traps.js";
import * as marena from "./arena.js";
import * as mstats from "./stats.js";
import * as mmedals from "./medals.js";
import * as mpacts from "../data/pacts.js";
import * as mdaily from "./daily.js";
import * as mdiagnostics from "./diagnostics.js";

export const SELFTEST_MODULES = {
  "../ui/ui.js": mui,
  "../ui/input.js": minput,
  "../audio/sound.js": msound,
  "../render/attacks-view.js": mattacks_view,
  "../audio/place.js": mplace,
  "./walk.js": mwalk,
  "../render/models.js": mmodels,
  "./boss-cards.js": mboss_cards,
  "./save.js": msave,
  "../data/enemies.js": menemies,
  "../main.js": mmain,
  "./util.js": mutil,
  "./ai.js": mai,
  "./mutators.js": mmutators,
  "../data/biomes.js": mbiomes,
  "../data/weapons.js": mweapons,
  "./waves.js": mwaves,
  "./world.js": mworld,
  "../data/progression.js": mprogression,
  "../data/upgrades.js": mupgrades,
  "./difficulty.js": mdifficulty,
  "./traps.js": mtraps,
  "./arena.js": marena,
  "./stats.js": mstats,
  "./medals.js": mmedals,
  "../data/pacts.js": mpacts,
  "./daily.js": mdaily,
  "./diagnostics.js": mdiagnostics,
};
