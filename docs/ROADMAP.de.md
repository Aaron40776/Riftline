# Riftline – Wünsche des Eigentümers und Plan

Stand: 03.10.2026, nach 3.5.0. Diese Datei sammelt, was der Eigentümer sich gewünscht hat, was entschieden ist und
welche Ideen noch offen sind. Zu Beginn einer Sitzung lesen, nach jeder Änderung des Plans aktualisieren (im selben PR).

Leitgedanke des Eigentümers (steht auch in `CLAUDE.md`): alle Funktionen, Designs und Sounds passen organisch und
dynamisch zusammen; das Spiel skaliert und wird schwerer, und sieht und klingt dabei schön. Neue Funktionen kommen
mit Modell, Sound, Vorwarnung und Tests, nicht als nackte Mechanik. Der Eigentümer prüft Klang und Spielgefühl selbst:
Musik und Balance sind von uns nur gemessen, nicht gehört oder gespielt.

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

### 4. Aus dem Checkup (offen)
- Handy-Leistung (2.9.2): Untergrenze für den Dash-Cooldown (etwa 0,8 s), eigener Cooldown je Klinge bei Orbital Blades,
  Kantenglättung und Overlay-Auflösung im Saver-Modus. Die Bildrate der Tests (Software-GL, 5–8 fps) sagt nichts über echte
  Geräte.
- Toxin Marsh: sehr große, grelle Säurepfützen verdecken Gegner und Warnungen.
- Crucible-Modell wirkte im Screenshot körnig (vielleicht nur Software-Rendering).
- Upgrade-Bildschirm auf dem Handy: viel Leerraum unter den Karten, „0/1" allein in einer Zeile.
- `surge`-Upgrade ohne eigenen Sound oder Effekt (Audit-Warnung „surge has no consumer").
- Pause und Fortsetzen: Musik jetzt fortgesetzt (3.2.0); der Übergang ruhig → Boss hat einen kurzen Schnitt (bis 0,14 s).

## Offene Zweifel (nur der Eigentümer kann sie prüfen)
- Klang aller Tracks (zuletzt 3.5.0): ob Rohre, Kalimba und Glas so schön klingen wie die Eisglocken; Boss-Tracks wuchtig genug
  (gemessene Spitzenabstände 12–19 dB, echter Metal etwa 8–12 dB).
- Blackout-Event (3.4.0) auf dunklen Handy-Displays zu finster?
- Overdrive-Angriffe der Bosse (3.3.0) mit Handy-Steuerung fair? Erster Endless-Boss (Welle 25, doppelte Hülle) zu hart
  (Test-Bot starb 4–9 Mal)?
- Rechenlast der zwei Faltungshalls auf schwachen Handys.

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
- Boss-Phasen mit eigenem Musik-Abschnitt (statt nur Enrage-Schicht), Sprach-Schnipsel im Hubschrauber/Funk.

**Qualität und Zugang**
- Farbenblind-Modus für Warnungen, Option „Blitze reduzieren" (Blackout, Lichtbögen), Haptik am Handy bei Treffer und Dash.
- Gamepad-Unterstützung, Tastenbelegung.
- Frühe Welle 1–5 als bessere Einführung (kurzes Tutorial für Granate und Fallen), Codex-Einträge für Mutatoren und
  Overdrive-Angriffe.
- Auto-Qualität anhand echter Bildrate (Saver-Modus automatisch auf schwachen Geräten).
