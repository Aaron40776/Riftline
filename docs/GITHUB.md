# GitHub page of Riftline: what to set

These are settings of the repository on github.com. They are not files, so only the owner can change them
(Repository, Settings, General, and the gear next to "About" on the front page). Everything below is ready to paste.

## About (the gear next to "About" on the front page)

**Description** (one line, 98 characters):

> Riftline: a 3D arena roguelite shooter for the browser. Twin-stick touch or keyboard, five biomes, synthesized sound.

**Website:** `https://aaron40776.github.io/Riftline/`

**Topics** (type them in the same box; GitHub lowercases them):

`game`, `roguelite`, `arena-shooter`, `threejs`, `webgl`, `webaudio`, `procedural`, `pwa`, `javascript`, `browser-game`,
`twin-stick-shooter`, `low-poly`

## Social preview (Settings, General, "Social preview")

An image of 1280 x 640 px shows when the link is shared. A good one: the Blackout City picture of the game with the title
(RIFTLINE in the display font) over it. The pictures `tests/shots/biomes-pc/01-yard.png` and the Ultra version
`tests/shots/biomes-pc-ultra/01-yard.png` (run `SHOT_QUALITY=ultra npm run screens`, or the biome-shots alone) are a start; the
title can be added with any image editor. If you want, I can make one.

## The licence (decide, then add a LICENSE file)

Without a licence file nobody may legally use, copy or change the code (the default is "all rights reserved"). That is a
valid choice for a game you want to keep to yourself. The usual choices:

| Choice | What it allows | Fits when |
|---|---|---|
| **MIT** | anyone may use, change, sell and include it, as long as the notice stays | you do not mind others building on the code |
| **GPL-3.0** | others may use and change it, but their changes must stay open under the same licence | you want improvements to flow back |
| **All rights reserved** (no file, or a short copyright note) | nobody may reuse it without asking | you plan to sell the game or keep it closed |

Three-package code (three.js, MIT) and the fonts (OFL) in the build keep their own licences either way. I will add the
`LICENSE` file as soon as you say which one (it is a pull request like everything else).

## Other settings worth a look

- **Settings, Pages:** source is "GitHub Actions" (already set; the deploy workflow publishes `dist/`).
- **Settings, Branches:** a rule for `main` that requires the `test` check to pass before a merge (the owner merges every
  pull request himself anyway; the rule only stops a red one by mistake).
- **Settings, Actions, General:** "Allow GitHub Actions to create and approve pull requests" can stay off.
- **Releases:** a release per version (the zip of `dist/`) would give players a download of an old version; not needed while
  the game lives on the Pages address.
