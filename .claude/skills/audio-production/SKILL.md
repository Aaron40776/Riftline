---
name: audio-production
description: Original game audio end to end - layered sound-effect design (impacts, weapons, magic, movement, enemies, UI, pickups), ambience and seamless loops, procedural synthesis and processing, music workflow, mixing (loudness, true peak, dynamics, frequency masking), variation against repetition, spatial audio, format/sample-rate/size choices for web and mobile, and measured verification. Use when creating, fixing, mixing, encoding or checking any sound or music.
---

# Audio production

> In Riftline: see "In Riftline" in `capability-orchestrator` first (models are code, sound is live WebAudio).

All three scripts are tested here (numpy + ffmpeg). Synthesized output is synthesized: never describe it
as recorded audio.

| Script | Does |
| --- | --- |
| `scripts/sfx_synth.py` | layered synthesis engine + 12 recipes (impact, gunshot, laser, explosion, whoosh, footstep, ui_click/confirm/error, pickup, ambience_wind, machine_hum loops); `--variants N` re-rolls pitch/noise/timing; importable primitives (oscillators, FM, pink/brown noise, time-varying SVF, FFT band filter, saturation, convolution reverb, ping-pong delay, seamless `make_loop`) |
| `scripts/audio_report.py` | EBU R128 integrated/momentary loudness, true peak, clipping, DC, silence, stereo correlation, spectral balance, `--loop` seam click test, `--compare` near-duplicate variants; exit 1 on errors |
| `scripts/encode_for_web.sh` | WAV → ogg/m4a/mp3/opus(webm), mono option, quality presets; never overwrites input |

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/sfx_synth.py gunshot --variants 4 --out-dir sfx
python3 ${CLAUDE_SKILL_DIR}/scripts/audio_report.py sfx/*.wav --compare --target-lufs -16 --lufs-tol 4
bash ${CLAUDE_SKILL_DIR}/scripts/encode_for_web.sh -o web -f ogg,m4a -m sfx/*.wav
```

## Workflow

1. **Read the project's audio architecture first.** If the game synthesizes sound at runtime (WebAudio,
   FMOD/Wwise events, Godot generators), design in that system and use these scripts only to prototype and
   measure. Load project audio skills (e.g. a repo's own sound skill) before generic advice.
2. **Spec each sound**: gameplay meaning, priority in the mix, length, loop/one-shot, how often it plays
   (frequent sounds need variation and less loudness), spatial or 2D, character/material, and the frequency
   space it must occupy without masking (see [references/mix-and-delivery.md](references/mix-and-delivery.md)).
3. **Layer**: transient (identity, 0–20 ms), body (pitch/material), sub/weight (only for big events),
   tail/space (reverb matched to the place). Process: saturation for density, filtering per layer to give each
   its band, envelopes for punch, short pre-delay reverb for size.
4. **Variation**: 3–6 variants (pitch ±1–2 semitones, layer swaps, noise re-roll) plus runtime random
   pitch/volume; `--compare` flags near-duplicates (r > 0.995).
5. **Mix targets** (starting points, adjust to the game): master at about −16 LUFS integrated for web/mobile
   gameplay, true peak ≤ −1 dBTP after encoding; masters at −2 dBFS peak leave room for codec overshoot
   (measured: −1 dBFS WAV became +0.4 dBTP in Vorbis). UI quieter than combat; dialogue/critical cues ducked over.
6. **Deliver**: mono for positional SFX, 44.1/48 kHz, ogg/opus for loops (gapless), m4a/mp3 fallback where
   needed; keep WAV masters out of the shipped bundle.
7. **Verify**: `audio_report.py` on the delivered files, then in the running game: plays, not cut off, voice
   limits, no clicks, loops seamless, levels relative to neighbours. Listening is required; if you cannot
   listen, say so and ask the user to (numbers do not prove a sound is good).

## Music
Options here: compose in code (sequencer + synth voices, as runtime WebAudio/engine code), render MIDI with
FluidSynth + a licensed SoundFont (if installed), or the user's DAW. AI music services only with the user's
account, approval and licence review. Music should change with game state (layers/stems, intensity).

## Licensing
Original synthesis: you own it. Third-party samples (freesound.org etc.): record licence per file
(`/asset-integration-licensing`), CC-BY needs credits, avoid NC for commercial plans.
