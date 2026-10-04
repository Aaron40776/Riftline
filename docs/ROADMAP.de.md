# Riftline – Wünsche des Eigentümers und Plan

As of 04.10.2026, with 3.10.0. New entries are written in English (the owner's wish since 03.10.2026).

Diese Datei sammelt, was der Eigentümer sich gewünscht hat, was entschieden ist und
welche Ideen noch offen sind. Zu Beginn einer Sitzung lesen, nach jeder Änderung des Plans aktualisieren (im selben PR).

Leitgedanke des Eigentümers (steht auch in `CLAUDE.md`): alle Funktionen, Designs und Sounds passen organisch und
dynamisch zusammen; das Spiel skaliert und wird schwerer, und sieht und klingt dabei schön. Neue Funktionen kommen
mit Modell, Sound, Vorwarnung und Tests, nicht als nackte Mechanik. Der Eigentümer prüft Klang und Spielgefühl selbst:
Musik und Balance sind von uns nur gemessen, nicht gehört oder gespielt.

## Entschieden am 03.10.2026 (nach 3.5.0)

Reihenfolge vom Eigentümer bestätigt: erst die schnellen Sachen und Fixes, dann die größeren Dinge. Jeder Punkt ein
eigener PR mit Release.
1. **3.6.0 Steuerung anpassbar + Checkup-Fixes** (erledigt): Editor „Button layout“ in den Einstellungen (DASH, NOVA,
   GADGET und Pause frei verschieben und skalieren, Deckkraft, Stickgröße, fester Bewegungs-Stick; Hoch- und
   Querformat getrennt; Linkshänder spiegelt), Dash-Untergrenze, Orbital Blades, Combo Surge, Säurepfützen,
   Upgrade-Bildschirm, Saver-Modus (siehe QA-Bericht 3.6.0).
2. **3.7.0 Musik neu** (erledigt, wartet auf das Ohr des Eigentümers; MP3-Vorschau aller zehn Tracks geschickt): Das
   laute Rauschen gefällt dem Eigentümer nicht. Messung (3.5.0): die
   Atmosphären der ruhigen Themen sind eine 1 s lange Schleife aus weißem Rauschen; oberhalb von 200 Hz (das, was ein
   Handy-Lautsprecher spielt) ist das im Cryo Vault etwa 75 % des Klangs, in der Toxin Marsh etwa 50 %, in Blackout
   City etwa 35 %. Plan: kein Dauerrauschen mehr, sondern einzelne, gepannte Geräusche des Ortes (Tropfen,
   Eisknacken, Grillen als Töne, Glut-Knistern; das ist zugleich das „Ambient je Biom“ aus Punkt 2 unten), wo Rauschen
   bleibt rosa/braun, länger und leiser; die Biom-Events ebenso; ein Test für den Rauschanteil.
   **Boss-Tracks in neuem Stil, entschieden: Cinematic Synth** („wir probieren es erst mal so“): Taikos und große
   Trommeln, kurze Streicher-Figuren, Blechbläser-Stöße, Chor, Arpeggios, Sub-Bass mit Pumpen, keine verzerrten
   Gitarren und keine Rausch-Becken; das Motiv jedes Bioms bleibt die Leitmelodie. Warden: Cyberpunk-Verfolgung,
   Crucible: Schmiede-Taikos und Blech, Frost Prism: Eis-Trance, Hive Queen: Tribal und Acid-Bass, Rift Core: Drum &
   Bass mit Chor als Finale. Boss-Phasen mit eigenem Abschnitt, weicher Übergang ruhig → Boss. WAV/MP3-Vorschau aller
   Tracks an den Eigentümer vor dem Merge.
3. **Boss-Belohnungen** (Punkt 1 unten; after the checkup of 03.10.2026 probably 3.10.0).
4. **Läufer statt Drohne** mit Schritt-Sounds (Punkt 2 unten).
5. Cloudflare erst, wenn der Eigentümer Bescheid sagt.

## Requested on 03.10.2026 (after 3.7.0): checkup, prettier hazards, biomes that sound different

From this request on, everything is written in English (the owner's wish; earlier entries stay as they are).

The owner's request: look through the whole project again carefully, find things he may not like that much and look
for bugs; then a plan, fixes first, then features, in logical PRs one after another. His examples: "the music is good
but all biomes sound pretty much the same, maybe add more effect sounds to each one" and "the fire pillars, ice areas,
manholes etc. are all just colored circles, maybe make them prettier".

What the review found: `npm test` and `npm run audit` green (bot run to wave 22 without runtime errors). The map hazards
(lava vents, manholes, ice sheets, acid pools, portals) really are only discs and rings of the effect pools
(`drawFeatures` in `render/renderer.js`), the lava eruption a glowing tube; the traps have had real models since 3.0.0.
The biomes differ in sound almost only by their music: since 3.7.0 the sounds of a place are soft notes of the calm
themes, and the hazards are silent until a vent erupts.

Order (one PR with a release each, to be merged one after another):
1. **3.7.1 Fixes** (done): Endless with Cryo Skates locked the dash for minutes (the clock was reset, the time of the
   last dash was not); with a high hazard resistance acid ticks below one point counted as hits (sound, shake, red
   flash, Heat Sink), now the fraction is kept; a dodged trap strike (dash, shield) still slowed; electric traps
   (plate, rift burst) showed the ice sparkle and played the frost ping, now they stun with their own effect and sound
   (see the QA report of 3.7.1).
2. **3.8.0 Hazards with real models** (done, `render/hazards-view.js`): lava vents as basalt craters with moving lava
   and a pillar of fire instead of a tube, manholes with an iron cover in a concrete collar (the cover rattles and
   lifts, jagged bolts), ice sheets with frost, cracks and ice shards on the rim, acid with a bubbling surface and a mud
   bank, portals with a swirl and floating rune stones. The warnings keep the language of the rings. The owner also
   asked to remove the "Left-handed" and "Reduce flashes" settings completely; done in the same release.
3. **3.9.0 Sounds of the place** (done, `audio/place.js`): the hazards sound by distance and direction (lava bubbles and
   rumbles before it erupts, manholes hum and crackle, ice cracks under the drone, acid bubbles, portals hum), rare far
   sounds of each biome (thunder and a car alarm, anvils and steam, ice cracking, frogs and birds, deep swells in the
   Void) and a volume of their own, "Ambience" (item B7 of the proposals below).
4. Then as planned: boss rewards (then 3.10.0; after the request of 04.10.2026 3.13.0), the walker.

## Requested on 04.10.2026 (after 3.9.0): what the polish missed, music and ambience of the place

The owner's request: look through the project again for things that "missed" the polishing of the last days (biome
details and enemy skins are there, but some effects are still simple, like the pools that were just coloured circles),
make the music fit the atmosphere of each place, and add more sounds of the place in reasonable amounts (Blackout City:
more thunder, light rain, a few sirens; Ember Works: anvils and machinery; the same for every biome), with the volumes
right.

What the review found (screenshots of every attack in every biome): the zones of the attacks of enemies and bosses
(`world.hazards`: the Warden's stomp, the Crucible's hammer, slag rings and eruptions, the Frost Prism's nova and
glaciers, the Hive Queen's plague, the Rift Core's bombardments, mortar shells, minebot mines, sapper charges, burning
and volatile ground) were all the same red ring around a flat red disc with one generic blast and one `boom` sound;
every blast and kill left the same black blob in every biome; every enemy shot was a glowing ball. The calm themes share
one template (motif rhythm, heartbeat, sub); the place is only in the instrument and rare notes. The sounds of the place
(3.9.0) are one far sound every 5 to 11 s from four or five per biome, nothing tied to the props; no test measures
ambience against music and effects.

Decisions of the owner (04.10.2026):
- Order as proposed, each its own PR with a release: visuals first, then the soundscapes, then the music.
- Calm themes: keep melody and key, rebuild rhythm and instruments per place (option a).
- Rain in Blackout City: yes, but no constant "white noise" kind of rain (soft patter and single drops).
- Visual tie-ins where they are logical (a lightning flash in the sky with the thunder, a faint red and blue glow of a
  passing siren on the skyline).

Plan:
1. **3.10.0 Attacks with a look and sound of their own** (done, `render/attacks-view.js`): surfaces per attack (cracks,
   lava cracks, molten pools, frost from the rim, acid, rifts, turning targets with a countdown, smouldering ground);
   mines, charges and mortar shells with models; blasts of their kind (ice spikes, pillars of fire, bolts of light,
   splashes) with sounds of their own; marks of the place instead of the black blob; enemy shots with shapes of their
   kind. The warning ring stays.
2. **3.11.0 Soundscapes**: per biome a soft steady layer, sounds from the props near the drone and far sounds in
   variants, with rate limits per sound (for example thunder about every 25 to 50 s, a siren about every 60 to 120 s),
   never two big sounds at once, no repeats, thinner in boss fights. Blackout City: light rain (patter, gutter drips,
   rain on metal), thunder with lightning, sirens with their light, a helicopter, a horn, a dog, a buzzing street lamp.
   Ember Works: anvil series, a drop hammer, conveyors and gears near the conveyors, steam valves and a steam whistle,
   chain hoists, a molten pour, the roar of the furnaces. Cryo Vault: howling gusts, glacier groans, icicles, a far
   avalanche, crystals that ring. Toxin Marsh: frog choruses, crickets and cicadas, insects flying past, splashes, an
   owl, a heron. Void Core: the heartbeat of the core, a gravity hum near the rune stones, reversed sounds, metallic
   resonances, chirps. Levels measured from offline renders (ambience well below the music, no far sound louder than a
   shot, hiss under the 3.7.0 limit) and locked in tests; MP3 previews of every biome before the merge.
3. **3.12.0 Music of the place**: keys and motifs stay, rhythm and instruments come from the place (Ember Works an
   industrial beat of hammers, pistons and conveyors; Blackout City noir with an electric piano, a walking bass,
   brushes, rain plinks and a siren on a chord tone; Cryo Vault refined; Toxin Marsh bayou with kalimba, log drum,
   frog croaks in time and a wobbling drone; Void Core glass, choir, reversed swells, glitches); the boss tracks take
   the place sounds into their drums; the ambience thins out where the music already carries a sound; MP3 previews of
   all ten tracks before the merge.
4. Then the boss rewards, the walker. (Renumbered on 04.10.2026: the owner's later requests come first, as 3.11.0
   landscape only and 3.12.0 the Singularity, so the soundscapes become 3.13.0 and the music 3.14.0.)

### HANDOFF (night of 04/05.10.2026; read this first when the work goes on)

**State.** 3.11.0 (landscape only) is finished on branch `claude/landscape-3110`, stacked on 3.10.0 (PR #30); merge
#30 first. 3.10.0 is finished on branch `claude/attack-looks-3100` (PR #30 against `main`, not merged yet): the attack
looks and sounds, plus the faster and steadier release checks the owner asked for (QA report 3.10.0, points 6 and 7:
release-check green, 432 QA checks, 170 E2E checks, no page errors). The open QA failure of the first runs was a
timing flake under software WebGL that main had too; the waits that depend on the game now count game time.

**Order agreed with the owner for the night (04.10.2026), one PR each, stacked because nothing is merged overnight**
(each later branch starts from the earlier one, each PR targets the earlier branch and says "stacked on #N, merge in
order"; after a merge and a deleted branch GitHub retargets the next PR to main):
1. 3.10.0 with the faster tests (done, see above).
2. 3.11.0 Landscape only (done, QA report 3.11.0): phones open and stay in landscape (manifest orientation landscape, screen.orientation.lock
   where the browser allows it, a "rotate your phone" screen that pauses a run in portrait; iPhone Safari and browser
   tabs cannot be locked); the portrait layouts, the portrait layout of the button editor and the portrait tests go
   (about 9 minutes less in the release checks). PC unchanged.
3. 3.12.0 The Singularity replaces the grenade: thrown fast and far (to the aim or the biggest group within about
   14 m), it opens a small rift that pulls enemies together for about 1.5 s, then collapses in a blast. Its own model
   (a spinning core with a ring), a swirling rift mark on the ground as the warning, a rising pull and a collapse as the
   sound; the three cards keep their ids (gcells, gblast, gfire) with new effects (more charges and faster recharge;
   bigger pull and blast; burning ground), so saves stay valid.
4. If usage is left: the repository cleanup the owner asked for (README as the landing page with the Play link,
   stale information, docs, .github), without deleting this roadmap or the QA report (CLAUDE.md needs them).
5. Then the roadmap below in its order: 3.13.0 soundscapes, 3.14.0 music of the place, boss rewards, the walker.

Usage rules of the owner: stop at a clean point at about 90 % of the 5-hour window and go on after its reset; stop and
report at about 85 % of the weekly limit. Before every PR: code review of the diff, the full release check, a look at
the screenshots, no new page errors or audit warnings, determinism unchanged unless the change means it.

**Notes for the tests.** `npm run check` while developing (about 2 minutes), `npm run release-check` before a
release (about 41 to 44 minutes). Never run two browser tests at once (software WebGL takes every core). Waits that
depend on the game use `tests/lib/wait.mjs` (game time), never a fixed real-time limit. The slowest parts left are the
real transitions (run-desktop 146 s, the E2E with five devices 7 min) and the screenshots (12 min); what is left is
the game rendering in software. Ideas not done: one browser shared by several sections, fewer device sizes once
portrait is gone.

## Requested on 04.10.2026 (later the same day): next ideas of the owner

Planned with the owner on 04.10.2026 (the order and the designs are in the HANDOFF above; faster tests done in
3.10.0):
- **Replace the grenade**: "the current grenades just aren't useful, you gotta get so close until they actually fly
  into the enemies that you'll basically always have defeated them already". Make it another, cooler mechanic that
  fits the game (with model, sound, telegraph and tests, like everything else).
- **Landscape only**: "the game is way better at landscape", so on phones it should open in landscape and always stay
  that way; PC keeps working as it does. (The portrait layouts, the portrait button layout of the editor and the
  portrait tests would go.)
- **Faster tests**: the release checks take about 45 minutes; optimize the steps for this project.


## Vorgemerkt, vom Eigentümer gewünscht (Reihenfolge nach Empfehlung)

### 1. Boss-Belohnungen
- Nach dem Besiegen **jedes Bosses** gibt es nur **besonders starke Upgrades** (Angebot nur aus hohen Seltenheiten).
- Jeder der fünf Bosse (Warden, Crucible, Frost Prism, Hive Queen, Rift Core) hat eine **Chance auf ein exklusives
  Upgrade**, das man nur von diesem einen Boss bekommen kann.
- Heute: `bossRarityWeights` und der Filter `rarity < 2` bei Boss-Angeboten in `rollUpgradeOffer` (`core/waves.js`),
  Karten in `data/upgrades.js`.
- Beim Bau klären: Wie stark ist der heutige Filter, wie hoch die Chance (Vorschlag 25–35 %, erhöht sich nach
  Fehlschlägen), Kennzeichnung der exklusiven Karte im Upgrade-Bildschirm (Boss-Siegel, eigener Rahmen und Sound),
  Codex-Eintrag, Verhalten im Endless (mehrfach?), Tests, keine Doppelung mit Evolutionen.
- Ideen für die fünf Exklusiven (je ein Bezug zur Mechanik des Bosses): Warden „Lockdown-Gitter" (eigene Laser-Falle für
  Gegner), Crucible „Schmelztiegel" (Brandspur), Frost Prism „Splitterfeld", Hive Queen „Brut" (Drohnen-Begleiter),
  Rift Core „Singularität" (Sog-Nova).

### 2. Läufer statt Drohne (3.6.0) und Umgebungssounds
- Die Drohne wird ein **laufender Roboter mit zwei Beinen** (entschieden: zwei, nicht vier); Beine animiert beim
  Laufen, Steuerung unverändert, Dash als Schub oder Sprung, auch in der Startbildschirm-Vorschau.
- **Schritt-Sounds je Untergrund**: nasser Asphalt (Platschen), Eis (Knirschen und Rutschen), Metallgitter, Schlamm,
  Void-Platten (gläsern), Pfützen, Säure, Nähe zu Lava oder Gullys; Landung nach dem Dash, Rutschen auf Eis, Servo-Laut.
- **Ambient je Biom**: zufällige, ortsgebundene Geräusche (Tropfen, Eis-Knacken, Funken, Tiere, ferner Verkehr),
  nach links und rechts gepannt. Insgesamt „viel mehr Sounds".
- Grundlage ist da: Panning und Raum der Effekte (3.2.0), Boden-Atmosphäre je Biom (`MUSIC_BEDS`), Untergrund je
  Biom bekannt (`arena.ice`, `acid`, `vents`, `portals`).

### 3. Cloudflare (Hosting und Bestenliste)
Entscheidungen des Eigentümers (alles auf Cloudflare, GitHub Pages danach abschalten):
- Hosting als **Cloudflare Worker mit Static Assets** (`dist`) plus **D1-Bestenliste**. Voreingestellte Adresse
  `workers.dev` (eigene Domain optional; **die Adresse ändert sich, `localStorage`-Spielstände gehen verloren**, der
  Eigentümer muss vorher den Spielstand exportieren).
- **Punktzahl** = `Welle × 100 + Boss-Kills × 500 + Kills`, mal Threat-Faktor (Threat I–V: ×1.1 … ×1.5). Das Spiel
  hatte bisher keinen Punktewert.
- **Eine Zeile pro Spieler (Bestwert)**; ein **Gerätetoken** ist an den Namen gebunden (Namen sind frei, kein Filter).
- `wrangler.toml` in `cloudflare/` (im Dashboard Root directory `cloudflare`, Build `cd .. && npm ci && npm run build`,
  `NODE_VERSION` 22, Assets `../dist`, `run_worker_first = ["/api/*"]`, SPA-Fallback, D1-Binding mit `id` als TODO,
  Migrationen), `cloudflare/README.md` mit den Schritten im Dashboard, eigenes `cloudflare/package.json`.
  **Die Git-Anbindung nicht selbst herstellen** (macht der Eigentümer im Dashboard).
- `sw.js` darf `/api/*` nicht cachen (Cache-first mit `ignoreSearch` würde eine veraltete Bestenliste liefern).
- `compatibility_date` und die Syntax von `run_worker_first` beim Bau gegen die aktuelle Cloudflare-Doku prüfen.
- Vorschau-URLs je PR (Workers Builds) sind der echte Gewinn für „früher veröffentlichen"; ob Vorschauen dieselbe
  D1 nutzen, klären (sonst Testeinträge in der echten Liste). Auto-Merge hat der Eigentümer vorerst abgelehnt
  („wir lassen es bei meinem manuellen Merge").
- Der Eigentümer sagt Bescheid, wenn es losgehen soll. Voraussichtlich Release 3.7.0 oder höher.

### 4. Aus dem Checkup
- Erledigt in 3.6.0: Dash-Untergrenze 0,8 s, eigener Cooldown je Klinge bei Orbital Blades, Saver-Modus ohne
  Kantenglättung (ab dem nächsten Start) und Overlay in einfacher Auflösung, kleinere und gedämpftere Säurepfützen,
  Upgrade-Bildschirm auf dem Handy (kein Loch über REROLL, Werte und Einheiten brechen nicht mehr um), Combo Surge mit
  eigenem Effekt und Sound.
- Offen: Crucible-Modell wirkte im Screenshot körnig (vielleicht nur Software-Rendering). Die Bildrate der Tests
  (Software-GL, 5–8 fps) sagt nichts über echte Geräte.
- 3.7.0: der Übergang ruhig → Boss beginnt mit tiefer Taiko, Blech und Chor, die den kurzen Schnitt (bis 0,14 s)
  überdecken; ein echter Übergang (Ausblenden über einen Takt) bleibt eine Idee.

## Vorschläge vom 03.10.2026 (nach 3.7.0, Eigentümer entscheidet)

Gewünscht: sinnvolle Verbesserungen (Komfort usw.), die Spieler gern hätten, ohne dass das Spiel leichter wird. Jeder
Punkt mit seiner Wirkung auf die Schwierigkeit.

**A. Lernen und Überblick (neutral: erklärt, was passiert, nimmt nichts ab)**
1. Tod-Rückblick am Run-Ende: die letzten Treffer (wer, welcher Angriff, wie viel), der tödliche Treffer hervorgehoben,
   dazu Schaden je eigener Quelle (Waffe, Klingen, Granate, Surge, Fallen) und je Gegnertyp. Lernt man am meisten,
   wenn das Spiel schwer ist.
2. Werte-Übersicht im Pausenmenü: alle aktuellen Werte (Schaden, Feuerrate, Krit, Tempo, Dash, Hülle, Panzerung,
   Regeneration, Aufsammelradius, Granaten) mit Grund- und Bonuswert.
3. Vorschau auf die nächste Welle in der Upgrade-Wahl (Boss, Ereignis, Mutator, ab wann Fallen kommen): man wählt
   passend, statt blind.
4. Kurze Einführung für Granate und Fallen in den Wellen 1–6, Codex-Einträge für Mutatoren und Overdrive-Angriffe.

**B. Bedienung (neutral)**
5. Gamepad (Sticks, Schultertasten, Start für Pause; Menüs zuerst weiter mit Maus/Touch) und Tastenbelegung am PC.
6. Vibration am Handy bei Treffern, Dash und Boss-Schlägen (nur Android, abschaltbar).
7. Getrennte Regler für Musik, Effekte und Atmosphäre (die Atmosphären sind seit 3.7.0 ein eigener Teil).
   Done in 3.9.0: the "Ambience" volume (atmospheres, event beds and the sounds of the place).
8. Kompakte Schadenszahlen (pro Gegner zusammengezählt) gegen das Gewimmel im Endless; Farbenblind-Paletten für
   Gegnerschüsse und Warnungen (zusätzlich zu „Clear warnings").

**C. Herausforderung (macht es freiwillig schwerer, belohnt Können)**
9. Pakte vor dem Run: bis zu zwei Nachteile wählen (zum Beispiel halbe Hülle, schnellere Gegner, keine Nova, Nebel)
   für mehr Shards und ein Abzeichen in der Run-Historie; Meilensteine für Siege mit Pakten.
10. Tägliche Herausforderung: fester Seed, feste Waffe und feste Mutatoren für alle; eigener Bestwert (später die
    Cloudflare-Bestenliste).
11. Boss-Medaillen: ohne Treffer und auf Zeit, je Boss Bronze, Silber, Gold im Codex.
12. Training gegen bereits besiegte Bosse (keine Belohnung): üben, ohne den Run leichter zu machen.

**D. Mit Vorsicht (macht es etwas leichter, nur begrenzt)**
13. „Verbannen" in der Upgrade-Wahl: eine Karte für den Run aus dem Pool nehmen, höchstens ein- bis zweimal pro Run
    über ein Werkstatt-Modul freigeschaltet.

Empfehlung zur Reihenfolge: 3.8.0 Boss-Belohnungen (wie geplant), dann ein Paket „Lernen und Überblick" (1–3, klein bis
mittel, hoher Nutzen), dann Herausforderung (9–11), dann der Läufer. Gamepad und Vibration passen zu jedem Release.
(03.10.2026: the checkup releases 3.7.1–3.9.0 above come first, so the boss rewards move to 3.10.0.)

## Offene Zweifel (nur der Eigentümer kann sie prüfen)
- Musik 3.7.0: ob der neue Boss-Stil (Cinematic Synth) gefällt oder ein anderer probiert werden soll (Alternativen:
  durchgehend Synthwave/Darksynth oder Drum & Bass); ob die Atmosphären jetzt angenehm leise sind und der Chor nach
  Chor klingt (Formant-Filter, nur gemessen).
- Button-Layout-Editor (3.6.0) auf echten Handys: Ziehen mit dem Daumen, Größe des Panels, fester Stick im Kampf.
- Klang der ruhigen Tracks (3.5.0): ob Rohre, Kalimba und Glas so schön klingen wie die Eisglocken.
- Blackout-Event (3.4.0) auf dunklen Handy-Displays zu finster?
- Overdrive-Angriffe der Bosse (3.3.0) mit Handy-Steuerung fair? Erster Endless-Boss (Welle 25, doppelte Hülle) zu hart
  (Test-Bot starb 4–9 Mal)?
- Rechenlast der zwei Faltungshalls auf schwachen Handys (3.7.0 hat dafür die Verzerrer- und Gitarrenketten entfernt).

## Weitere gute Ideen (ungeprüft, nach Gewinn für „skalierendes, schwerer werdendes Spiel mit schönem Look und Klang")

**Endless und Herausforderung**
- Mutatoren vertiefen (3.3.0 hat sechs): Gegner-Elite-Eigenschaften stapeln, Herausforderungswellen (z. B. nur
  Schwarmgegner, nur Fernkämpfer), Welle mit Zeitlimit, Abyss-Gegner jenseits von Welle 100, Gravitationsquellen.
- **Pakte und Relikte** (Vor- und Nachteil wählen, gelten für den Run), Gadget-Wahl vor dem Run, weitere Gadgets
  (Wächter-Geschütz, Abstoßer, Schildkuppel).
- **Tägliche Herausforderung** mit festem Seed und eigener Bestenliste (passt zur Cloudflare-D1); wöchentlicher Mutator.
- Boss-Variationen pro Run (zufälliger Overdrive-Zusatz), Mini-Bosse in Endless alle 25 Wellen.

**Look**
- Biom-Wetter und Tageszeit pro Besuch (Regen verstärkt sich, Nebel zieht auf), bewegliche Hintergrund-Elemente
  (Hubschrauber über der Stadt, Züge im Void).
- Boss-Tod-Zeitlupe mit Kamerafahrt, Biom-Übergänge (Portal-Effekt zwischen den Bioms), Gegner-Skins pro Elite-Eigenschaft.
- Zusammenfassung am Run-Ende mit Schaden je Quelle, Zeitleiste, gesammelten Upgrades und der Punktzahl (Cloudflare).

**Klang**
- Musik reagiert auf Zustand: tiefer Hüllen-Herzschlag und Dämpfung bei wenig Hülle, Aufhellen nach einer Welle ohne Treffer.
- Getrennte Regler für Musik, Effekte und Ambient in den Einstellungen; Vorschau-Knopf für Ambient je Biom.
  (The Ambience volume came in 3.9.0.)
- Boss-Phasen mit eigenem Musik-Abschnitt (statt nur Enrage-Schicht), Sprach-Schnipsel im Hubschrauber/Funk.

**Qualität und Zugang**
- Farbenblind-Modus für Warnungen, Haptik am Handy bei Treffer und Dash. (03.10.2026: no option to reduce flashes and
  no left-handed mode; the owner had both removed in 3.8.0.)
- Gamepad-Unterstützung, Tastenbelegung.
- Frühe Welle 1–5 als bessere Einführung (kurzes Tutorial für Granate und Fallen), Codex-Einträge für Mutatoren und
  Overdrive-Angriffe.
- Auto-Qualität anhand echter Bildrate (Saver-Modus automatisch auf schwachen Geräten).
