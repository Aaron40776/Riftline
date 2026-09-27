# Riftline

This repository is **Riftline**, the 3D arena roguelite shooter (three.js). **Riftdeck**, the
deckbuilder set in the same universe, is a different game in its own repository
(`Aaron40776/Riftdeck`). Do not mix the two up, and do not change Riftdeck from here.

README.md explains build, commands, project structure and hosting. Read it first. In short:

- `src/game.js` is the release bundle formatted with Prettier (game code and three.js r186 in one
  file). Leave three.js alone (roughly lines 9 800–34 100). New fixes wrap prototype methods like
  the existing ones and say in a comment which version added them.
- The version and build id exist only in `package.json` (`version`, `riftline.build`). After a
  bump run `npm install` so `package-lock.json` follows.
- A release also adds its changes at the top of `changes` in `src/build-info.json` and a new
  section at the top of `docs/QA-REPORT.de.txt` (German, same layout as the earlier ones).
- Run `npm test` before every commit. Before a release also run `npm run qa`, `npm run e2e`,
  `npm run audit` and `npm run screens`, and look at the screenshots.
- A push to `main` deploys the game to GitHub Pages. Other branches and pull requests only run
  the tests (`.github/workflows/test.yml`).
- Saves use the `localStorage` keys `riftline.*`. Riftdeck shares the GitHub Pages origin and uses
  `riftdeck.*`; never read or write those.
- The player-facing texts in the game are English. Commit messages and README are English, the QA
  reports German.
