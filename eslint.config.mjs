// 3.45.3: one rule on purpose - no-undef. The 3.45.0 buff-row crash shipped because buffs() read
// hud()'s local `cache` alias as a bare identifier: perfectly legal at parse time and to esbuild,
// then "Can't find variable: cache" on a real player's iPhone the first time a timed buff chip
// ticked, three frames in a row, run dead. No test saw it because no test had a buff on screen.
// A static undefined-name check catches this whole class before anything ships.
import globals from "globals";

// the placeholders build.js and esbuild define replace (build.js text-replace + esbuild "define")
const buildTokens = {
  __RL_VERSION__: "readonly",
  __RL_BUILD__: "readonly",
  __RL_VERSION_DASHED__: "readonly",
  __RL_GAME_FILE__: "readonly",
};

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    // the game: a browser module. util.js, diagnostics.js and build-info.json carry the define tokens.
    files: ["src/**/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2026,
      globals: { ...globals.browser, ...buildTokens },
    },
    rules: { "no-undef": "error" },
  },
  {
    // the service worker: a classic script with worker globals of its own
    files: ["src/sw.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2026,
      globals: { ...globals.serviceworker, ...buildTokens },
    },
    rules: { "no-undef": "error" },
  },
  {
    // tests, tools and the build script run in node (and drive a browser from there)
    files: ["tests/**/*.mjs", "tools/**/*.js", "*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2026,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { "no-undef": "error" },
  },
];
