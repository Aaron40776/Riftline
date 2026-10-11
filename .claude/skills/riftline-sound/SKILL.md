---
name: riftline-sound
description: Use when adding, changing or debugging any sound, music, ambience or mix in Riftline (src/audio/sound.js, src/audio/place.js), when a sound is silent, too loud, clipped, dropped or cut off, when music notes are skipped or stutter in heavy fights, or when the owner asks for a biome to sound different.
---

# Riftline sound engine

Every sound and every note is synthesised live in WebAudio: no samples, no external services. Two files, about 5,900
lines. Find code by the **names** below (`grep -n "name(" src/audio/sound.js`), not by line numbers.

## Map

| What                 | Where (`src/audio/sound.js` unless noted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signal chain         | `buildGraph()`: `sfx` / `ambBus` / music → `comp` (−14 dB, 4:1) → `limiter` (−3 dB, 20:1) → `master` 0.82 → `clip` (`softClipCurve`, knee 0.7) → speakers                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Music chain          | `mus` → `fade` → `glue` (compressor, set per track by `mixFor`) → `makeup` → `musLevel` → `duckGain` → `comp`. Send buses into `mus`: `pump` (pads, bass, choir; dips on kicks), `delay`, `ping` (stereo ping-pong of the bloom), `choir` (formant band-passes, `CHOIR_VOWEL`), `verbIn` (2 s room), `atmos`                                                                                                                                                                                                                                                                                                                        |
| Sound effects        | `play(id, arg)` → `_play` (one big `switch`) → `tone()` / `noise()` / `hum()` → `route()` (pan `curPan`, room `curRev` → `sfxVerbIn`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Game events → sounds | `consume(events, listener)`: one `case` per event kind `ev.k`; pan from the event's x. Tables: `RL_SOUND_EVENTS` (heard, with sample payloads) and `RL_SILENT_EVENTS` (silent on purpose)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Per-sound tables     | `KEY_SOUNDS` (never dropped), `MUSIC_DUCK` (music dips), `SFX_ROOM` (reverb send), `SFX_ROOM_BIOME`, `BOSS_SOUND` / `BOSS_ROOT` (boss timbre and motif), `RL_DEATH_FAMILY`, `RL_ESHOT_VOICE`, `RL_TRAP_SOUND`, `RL_MINE_BEEP`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Voice budget         | `claim(pri, …)`. Effects: `MAX_VOICES` 24; when full, a new voice replaces the oldest voice of lower priority (at priority 1 or more also of equal priority), else it is dropped (`dropped`). The looping beds (`startBed`) sit in this list too (pri 3, `loop: true`) and hold their slots while they play. Priorities: **2** `KEY_SOUNDS`, **1** gameplay, **0.5** place sounds and the `accent()` sounds of biome events (their start cue `eventCue` plays at 1), **0** music (own list, `MAX_MUSIC_VOICES` 44, never steals; `opt: true` notes leave `MUSIC_RESERVE` 8 slots to the essentials). Loops (beds) are never dropped |
| Music scheduler      | `startScheduler()` (30 ms timer) → `schedule()` (140 ms lookahead) → `note(step, time)` → the track's `play(e, c)`. Tracks: `MUSIC_TRACKS[biome].fight / .boss` (bpm, bars)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Calm themes          | `yardCalm`, `worksCalm`, `vaultCalm`, `marshCalm`, `voidCalm`, built from `calmMotif`, `calmPad`, `calmFloor`, `calmBloom` (`BLOOM`, `BLOOM_VOICE`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Boss tracks          | `yardBoss` … `voidBoss`, `bossSection`, `bossHeatLayer` (phase/enrage), `buildRiser`, `sectionHit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Music helpers        | `kit(e, c)`: buses `k.m` (music), `k.p` (pump), `k.d` (delay), `k.c` (choir), `k.g` (ping-pong; null without a stereo panner), each with `.t()` (tone) and `.n()` (noise). Instruments: `bell`, `pad`, `pluck`, `strings`, `brass`, `choir`, `formant`, `kick`, `taiko`, `anvil`, `clang`, `sub` … (defined just after `kit`). `R(c, n)` hashed random, `P(c, n, w)` hashed pan, `pat("x..X.o")` rhythm strings, `tremoloEnv` / `padEnv` level curves                                                                                                                                                                               |
| Beds and atmospheres | `MUSIC_BEDS`, `startBed` / `stopBed`, `startMusicBed`; event ambience `AMBIENCE_LEVEL` + `accent()` / `accentOf()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Place soundscapes    | `src/audio/place.js`: `PLACE` (every sound; `T()` / `N()` put it on `ambBus` at pri 0.5), `SCAPE[biome]` (`bed` grains + `far` sounds with `every` [lo, hi] s and `big`), `placeTick` (scheduler, hazards by distance `HEAR` 16 m, props `PROP_HEAR` 7 m)                                                                                                                                                                                                                                                                                                                                                                           |
| Test hooks           | `SoundEngine.renderOffline(spec, seconds)`, `SoundEngine.musicBudget(spec)`, `rlSoundCatalog()` (everything the deep test renders), `musicLog`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Recipes

**A new sound effect**

1. Add a `case "myId":` to `_play`. Use `this.gate(id, gap)` for anything that can fire many times a second; keep a voice
   at most 2 s.
2. Trigger it: `sound.play("myId", arg)` from `main.js`, or from a world event in `consume()`. A **new event kind** must
   also be listed in `RL_EVENT_KINDS` (`src/core/diagnostics.js`; payload fields in `RL_EVENT_FIELDS`) and go into
   `RL_SOUND_EVENTS` (with a sample payload) or `RL_SILENT_EVENTS`; the self-test fails otherwise.
3. Add the id to `rlSoundCatalog()`. That makes it a known sound for the self-test, and the deep test renders it (not
   silent, finite, peak < 0.95, ends in time, every tone 15–20000 Hz).
4. **Loudness is not checked for effects** beyond clipping. Render it and compare its peak and RMS with neighbours of
   the same weight (`hit`, `kill`, `pulse`, `scatter`) before you call it done.
5. Optional: `KEY_SOUNDS` if it must never drop, `MUSIC_DUCK` for a big hit, `SFX_ROOM` for a reverb tail. Weapons,
   death families and boss intros must also stay distinct from each other (the deep test's similarity check).

**A new place sound** (`place.js`)

1. Add a function to `PLACE` using `T(e, a, …)` / `N(e, a, …)` only (they handle the bus, priority, level and pan).
2. Schedule it: an entry in `SCAPE[biome].far` (`every`, `big` for loud ones) or `.bed`, or a hazard/prop branch in
   `placeTick`. It joins the catalog automatically (`PLACE_IDS`).
3. Limits checked by the deep test: steady layers under 60 % of a Pulse shot, other place sounds under a Scattergun shot;
   20 s of the soundscape must have an RMS under `AMB_UNDER` (0.6) times that of the biome's calm theme.

**A new music layer**

1. Add it to the biome's `…Calm` or `…Boss` function with `kit(e, c)` buses. Read `c` (`b` step in bar, `bar`, `L`
   intensity, `chord`, `root`, `heat`, `sec`).
2. **Use `R(c, n)` and `P(c, n)`, never `Math.random()`, in music.** The deep test compares note logs between runs and
   with or without a flood of effects. Take an `n` the function does not use yet; a reused one plays in lockstep.
3. Mark texture notes `opt: true` (they leave the last 8 slots to the kick and bass). It is not a safety net: the deep
   test fails on any shed or skipped note and on more than 36 music voices alive at once (`musicBudget`).
4. Music noise is pink or brown (`kit` defaults to pink); white noise is for effects only.
5. The deep test also wants the five calm themes (and the five boss tracks) to differ from each other, every boss track
   clearly louder than its calm theme, and the soundscape under `AMB_UNDER` of the calm theme. A louder calm theme
   changes the last two.

## Checking a change

- `npm test` runs the deep test, which renders every catalog entry and the music offline. It caches results in
  `node_modules/.cache/riftline/deep-sound.json`, keyed on the audio files, so the first run after an audio change takes
  about 3–5 minutes longer. `node tools/qa.js deep-test --full` (or `npm run check -- --full`) renders everything again; CI always does.
- **Listening previews:** `node tools/qa.js scape-preview <biome>` renders a soundscape, and `scape-preview music` renders
  every track as `music-calm-quiet-<biome>` (intensity 0.15), `music-calm-<biome>` (0.9) and `music-boss-<biome>`. The
  files land in `tests/shots/scapes/` as WAV and MP3. The owner judges by ear; give him these files.
- **One effect:** `SoundEngine.renderOffline({ id, seed: 1, stereo: true, wav: true }, 1.5)` in the page.
- **Loudness:** `ffmpeg -i file.wav -af ebur128 -f null -`.

## The owner's decisions (`docs/ROADMAP.de.md`)

- No constant white-noise hiss: rain is drops and patter, not a noise band.
- Direction: Osmos. Wide, high-quality stereo, a subtle evolving melody per biome, and pleasant ambience that is distinct
  for each biome.
- Each biome keeps its motif as its melody. The rhythm and instruments come from the place.
- Boss tracks are cinematic synth.
- Ambience stays below the music; the fight stays above both.
- Claude measures, the owner listens. Never claim something "sounds" better; report numbers and give him previews.

## Known mix weaknesses (measured, not heard)

|                        | Now                            | Direction                                                                                                                        |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Energy below 200 Hz    | music 71–92 %, impacts 86–96 % | high-pass the music beds at 60–90 Hz; keep the sub for the boss kick and big impacts                                             |
| Energy above 2 kHz     | 0.2–3.4 %                      | one bright signature voice per biome in 1–6 kHz (Vault glass, City rain plinks, Marsh kalimba, Void choir air, Works anvil ring) |
| Stereo L/R correlation | 0.91–0.98 (near mono)          | wide but mono-safe beds and pads; effects centre-weighted                                                                        |
| Calm vs boss loudness  | about 11 dB apart              | about 6–8 dB                                                                                                                     |

Source: the strategy audit of 10.10.2026, section E (`docs/STRATEGY-AUDIT.md` on the branch `claude/strategy-audit`, PR #60), from offline renders of the live engine.

Lock any such change in the deep test, the way the noise ratio was locked in 3.7.0.

## Related

- `shader-and-dsp-recipes`: DSP maths (FM, percussion, formants, delay) and a table translating it into WebAudio nodes.
- `game-audio`: a general mix hierarchy checklist. Riftline's rules above win over it.
