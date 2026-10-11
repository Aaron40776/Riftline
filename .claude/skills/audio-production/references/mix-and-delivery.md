# Mix and delivery reference

## Frequency roles (avoid masking: give each class its own space)
| Band | Who lives there | Typical move |
| --- | --- | --- |
| < 60 Hz sub | explosions, boss stomps, music kick | only big events; high-pass everything else at 60–120 Hz |
| 60–250 Hz weight | impacts, footsteps on wood, bass | short decays; duck music during big hits |
| 250 Hz–2 kHz body | most SFX, voices, music mids | where mud builds: cut 300–500 Hz on dense layers |
| 2–6 kHz presence | UI, warnings, transients, speech intelligibility | reserve for critical cues; phone speakers live here |
| > 6 kHz air | sparkle, fizz, cymbals, wind | gentle; fatiguing on repetition |

Phone speakers reproduce little below ~200 Hz: a hit that is only sub disappears. Give every important
sound energy in 1–5 kHz too. Check mono compatibility (stereo correlation > −0.2).

## Loudness (EBU R128 / ITU-R BS.1770)
- Integrated LUFS needs ≥ 400 ms of audio; short-term needs 3 s. For short SFX use momentary max or compare by ear.
- Relative levels matter more than absolute: build a reference list (UI click, footstep, main weapon, explosion)
  and match new sounds against it.
- Lossy encoders overshoot peaks: measure true peak on the *encoded* file.

## Formats
| Use | Format | Why |
| --- | --- | --- |
| Loops, music in browser | Ogg Vorbis / Opus | gapless decode in WebAudio |
| Fallback | AAC (.m4a), MP3 | MP3/AAC have encoder delay padding: loops click unless trimmed |
| Short SFX | Ogg/Opus mono 64–96 kbps | small; decode to buffers once at load |
| Masters | WAV 24-bit 48 kHz | archive, not shipped |

## Runtime checks (web)
AudioContext must be resumed on a user gesture (mobile); decode once and reuse buffers; cap simultaneous voices
per sound; use a limiter/compressor on master; PannerNode `HRTF` is expensive: `equalpower` on phones.
