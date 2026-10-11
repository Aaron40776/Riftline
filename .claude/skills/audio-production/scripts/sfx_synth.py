#!/usr/bin/env python3
"""Layered procedural sound-effect synthesis (numpy only) -> WAV. Original, synthesized audio: no samples.

  sfx_synth.py RECIPE [--variants N] [--seed S] [--out-dir DIR] [--sr 48000] [--bits 16|24] [--pitch 1.0] [--mono]
  sfx_synth.py list

RECIPEs: impact, gunshot, laser, explosion, whoosh, footstep, ui_click, ui_confirm, ui_error, pickup,
         ambience_wind (seamless loop), machine_hum (seamless loop)

Every recipe stacks separate layers (transient / body / sub / tail / space) the way sound designers build
SFX, and each variant re-rolls pitch, timing and noise so repeated plays do not sound identical.
Import it to build new recipes from the same primitives:

    sys.path.insert(0, "<skill>/scripts"); from sfx_synth import *
    x = mix(layer(sine_sweep(110, 40, .4), exp_env(.4, a=.002, d=.12)), ...); write_wav("x.wav", stereo(x))

Output: peak-normalised to -2 dBFS (headroom for lossy-encoder overshoot), DC removed, short fades. Check it with audio_report.py and LISTEN
(or have the user listen): these numbers do not prove a sound is good.
"""
import math
import os
import struct
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(1)


# ---------------- primitives ----------------
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def exp_env(dur, a=0.002, d=0.1, hold=0.0):
    """attack time a, hold, exponential decay with time-constant d"""
    t = t_axis(dur)
    att = np.clip(t / max(a, 1e-5), 0, 1)
    dec = np.exp(-np.maximum(t - a - hold, 0) / d)
    return att * dec


def sweep(f0, f1, dur, curve=3.0):
    """frequency array gliding f0->f1, exponential-ish (curve>1 = fast early drop)"""
    x = np.linspace(0, 1, int(dur * SR))
    return f1 + (f0 - f1) * (1 - x) ** curve


def osc(freq, shape="sine", phase=0.0):
    ph = 2 * np.pi * np.cumsum(np.asarray(freq, float)) / SR + phase
    if shape == "sine":
        return np.sin(ph)
    if shape == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if shape == "saw":  # naive saw softened by a one-pole: acceptable for short, filtered layers
        return onepole_lp((ph / np.pi) % 2 - 1, 9000)
    if shape == "square":
        return onepole_lp(np.sign(np.sin(ph)), 7000)
    raise ValueError(shape)


def sine_sweep(f0, f1, dur, curve=3.0):
    return osc(sweep(f0, f1, dur, curve))


def fm(carrier, ratio, index_env):
    """2-operator FM: carrier freq array, modulator = carrier*ratio, index envelope array"""
    mod = np.sin(2 * np.pi * np.cumsum(carrier * ratio) / SR)
    return np.sin(2 * np.pi * np.cumsum(carrier) / SR + index_env * mod)


def noise(dur, color="white"):
    n = rng.standard_normal(int(dur * SR))
    if color == "white":
        return n / 3
    spec = np.fft.rfft(n)
    f = np.maximum(np.fft.rfftfreq(len(n), 1 / SR), 20)
    spec /= np.sqrt(f) if color == "pink" else f  # pink 1/f power, brown 1/f^2
    out = np.fft.irfft(spec, len(n))
    return out / (np.abs(out).max() + 1e-9)


def onepole_lp(x, fc):
    a = math.exp(-2 * math.pi * fc / SR)
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        s = (1 - a) * v + a * s
        y[i] = s
    return y


def fft_band(x, lo=None, hi=None, slope=1.5):
    """static zero-phase band filter in the frequency domain (fast); smooth power-law skirts"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR) + 1e-3
    g = np.ones_like(f)
    if hi:
        g /= 1 + (f / hi) ** (2 * slope)
    if lo:
        g /= 1 + (lo / f) ** (2 * slope)
    return np.fft.irfft(X * g, len(x))


def svf(x, cutoff, q=0.7, mode="lp"):
    """time-varying TPT state-variable filter; cutoff = number or array (Hz)"""
    cut = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    g = np.tan(np.pi * np.clip(cut, 10, SR * 0.45) / SR)
    k = 1 / q
    ic1 = ic2 = 0.0
    y = np.empty_like(x)
    for i in range(len(x)):
        gi = g[i]
        a1 = 1 / (1 + gi * (gi + k))
        v3 = x[i] - ic2
        v1 = a1 * ic1 + gi * a1 * v3
        v2 = ic2 + gi * v1
        ic1, ic2 = 2 * v1 - ic1, 2 * v2 - ic2
        y[i] = v2 if mode == "lp" else v1 if mode == "bp" else x[i] - k * v1 - v2
    return y


def sat(x, drive=2.0):
    return np.tanh(drive * x) / np.tanh(drive)


def layer(sig, env, gain=1.0, delay=0.0):
    n = min(len(sig), len(env))
    out = sig[:n] * env[:n] * gain
    return np.concatenate([np.zeros(int(delay * SR)), out])


def mix(*layers):
    n = max(len(l) for l in layers)
    out = np.zeros(n) if layers[0].ndim == 1 else np.zeros((n, 2))
    for l in layers:
        out[: len(l)] += l
    return out


def stereo(x, width=0.0, pan=0.0):
    """mono -> stereo; width>0 adds a short decorrelated (Haas-safe, <1 ms) difference signal"""
    if x.ndim == 2:
        return x
    L, R = x * math.cos((pan + 1) * math.pi / 4), x * math.sin((pan + 1) * math.pi / 4)
    if width:
        d = int(0.0007 * SR)
        side = fft_band(np.concatenate([np.zeros(d), x[:-d]]) - x, lo=300) * width * 0.5
        L, R = L + side, R - side
    return np.stack([L, R], 1) * math.sqrt(2)


def reverb(x, size=0.6, decay=1.2, damp=4000, wet=0.25, pre=0.012):
    """convolution with a synthetic stereo IR: decaying noise that darkens over time (air absorption)"""
    st = stereo(x)
    n = int(decay * SR)
    t = t_axis(decay)
    irs = []
    for _ in range(2):
        nz = rng.standard_normal(n) * np.exp(-6.9 * t / decay)
        bright = fft_band(nz, hi=damp * 2)
        dark = fft_band(nz, hi=damp / 3)
        mixw = np.clip(t / (decay * 0.5), 0, 1)
        ir = (1 - mixw) * bright + mixw * dark
        ir *= np.clip(t / (0.004 + 0.02 * size), 0, 1)
        irs.append(np.concatenate([np.zeros(int(pre * SR)), ir]) / np.sqrt(np.sum(ir ** 2)))
    out_len = len(st) + len(irs[0]) - 1
    N = 1 << (out_len - 1).bit_length()
    wetsig = np.stack([np.fft.irfft(np.fft.rfft(st[:, c], N) * np.fft.rfft(irs[c], N), N)[:out_len] for c in range(2)], 1)
    dry = np.zeros_like(wetsig)
    dry[: len(st)] = st
    return dry + wetsig * wet


def slap(x, time=0.09, fb=0.3, wet=0.3, hi=3500):
    st = stereo(x)
    d = int(time * SR)
    out = np.zeros((len(st) + d * 4, 2))
    out[: len(st)] += st
    tap = st.copy()
    for k in range(1, 5):
        tap = np.stack([fft_band(tap[:, c], hi=hi) for c in range(2)], 1) * (fb if k > 1 else 1)
        out[d * k : d * k + len(tap)] += tap[:, ::-1] * wet  # ping-pong
    return out


def finish(x, peak_db=-2.0, fade_in=0.001, fade_out=0.02, trim_db=-70):
    st = stereo(x)
    st = st - st.mean(0)
    a = np.abs(st).max(1)
    thr = 10 ** (trim_db / 20) * a.max()
    nz = np.nonzero(a > thr)[0]
    if len(nz):
        st = st[: nz[-1] + 1]
    fi, fo = int(fade_in * SR), int(fade_out * SR)
    if fi:
        st[:fi] *= np.linspace(0, 1, fi)[:, None]
    if fo:
        st[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2
    return st / (np.abs(st).max() + 1e-12) * 10 ** (peak_db / 20)


def make_loop(x, xfade=0.5):
    """seamless loop: equal-power crossfade of the tail into the head; result loops without a click"""
    st = stereo(x)
    n = int(xfade * SR)
    head, body, tail = st[:n], st[n:-n] if n else st, st[-n:]
    w = np.sin(np.linspace(0, np.pi / 2, n))[:, None]
    blended = tail * np.cos(np.linspace(0, np.pi / 2, n))[:, None] + head * w
    return np.concatenate([body, blended])  # blended ends on head[-1], which continues into body[0] on wrap


def write_wav(path, x, bits=16):
    st = stereo(x) if x.ndim == 1 else x
    ch = st.shape[1]
    q = np.clip(st, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(bits // 8)
        w.setframerate(SR)
        if bits == 16:
            w.writeframes((q * 32767).astype("<i2").tobytes())
        else:
            i = (q * 8388607).astype("<i4").reshape(-1)
            w.writeframes(b"".join(struct.pack("<i", v)[:3] for v in i))


# ---------------- recipes ----------------
def r(lo, hi):
    return rng.uniform(lo, hi)


def impact(p=1.0):
    sub = layer(sine_sweep(95 * p, 38 * p, 0.35, 4), exp_env(0.35, 0.001, 0.09), 0.9)
    body = layer(sat(fft_band(noise(0.25), lo=250 * p, hi=1400 * p), 2.5), exp_env(0.25, 0.0005, 0.035), 0.7)
    crack = layer(fft_band(noise(0.01), lo=3000), exp_env(0.01, 0.0001, 0.0015), 0.9)
    deb_n = np.zeros(int(0.4 * SR))
    for _ in range(14):  # sparse debris ticks
        i = int(r(0.02, 0.35) * SR)
        deb_n[i : i + 60] += rng.standard_normal(60) * r(0.1, 0.4) * np.exp(-np.arange(60) / 12)
    debris = layer(fft_band(deb_n, lo=1500, hi=7000), np.ones(len(deb_n)), 0.5)
    return reverb(mix(sub, body, crack, debris), size=0.3, decay=0.6, wet=0.18)


def gunshot(p=1.0):
    crack = layer(fft_band(noise(0.012), lo=2000), exp_env(0.012, 0.0001, 0.002), 1.0)
    body = layer(sat(fft_band(noise(0.2), lo=150 * p, hi=900 * p), 3), exp_env(0.2, 0.0005, 0.04), 0.9)
    boom = layer(sine_sweep(110 * p, 45 * p, 0.3, 5), exp_env(0.3, 0.001, 0.07), 0.8)
    mech = mix(*[layer(osc(np.full(int(0.05 * SR), f * p)), exp_env(0.05, 0.0002, 0.006), 0.08, delay=0.11)
                 for f in (3150, 4420, 5870)])
    dry = mix(crack, body, boom, mech)
    return reverb(dry, size=0.9, decay=1.4, damp=2500, wet=0.32, pre=0.02)


def laser(p=1.0):
    d = r(0.22, 0.32)
    car = sweep(1700 * p, 260 * p, d, 2.2)
    zap = layer(fm(car, r(1.4, 2.6), 6 * exp_env(d, 0.0005, d / 3)), exp_env(d, 0.001, d / 2.5), 0.8)
    fizz = layer(svf(noise(d), sweep(9000, 2000, d), 2.0, "bp"), exp_env(d, 0.0005, 0.03), 0.5)
    kick = layer(sine_sweep(160, 50, 0.12, 4), exp_env(0.12, 0.0005, 0.03), 0.5)
    return slap(stereo(mix(zap, fizz, kick), width=0.6), time=0.07, wet=0.18)


def explosion(p=1.0):
    d = 2.2
    rumble = layer(sat(svf(noise(d, "brown"), sweep(2200 * p, 140 * p, d, 2.5), 0.8), 1.8), exp_env(d, 0.004, 0.55), 1.0)
    sub = layer(sine_sweep(60 * p, 24 * p, 1.2, 2), exp_env(1.2, 0.003, 0.35), 0.9)
    crack = layer(fft_band(noise(0.03), lo=1200), exp_env(0.03, 0.0001, 0.006), 0.8)
    cr = np.zeros(int(d * SR))
    for _ in range(90):
        i = int(abs(rng.normal(0.25, 0.5)) * SR) % (len(cr) - 200)
        cr[i : i + 120] += rng.standard_normal(120) * np.exp(-np.arange(120) / 20) * r(0.1, 0.6)
    crackle = layer(fft_band(cr, lo=2000, hi=9000), exp_env(d, 0.01, 0.6), 0.35)
    return reverb(stereo(mix(rumble, sub, crack, crackle), width=0.8), size=1.0, decay=2.4, damp=1800, wet=0.35, pre=0.03)


def whoosh(p=1.0):
    d = r(0.45, 0.7)
    t = np.linspace(-1, 1, int(d * SR))
    bell = np.exp(-(t / 0.45) ** 2)
    s = svf(noise(d, "pink"), (500 + 3500 * bell) * p, 1.6, "bp")
    x = s * bell
    pan = np.linspace(-0.7, 0.7, len(x))
    return np.stack([x * np.cos((pan + 1) * np.pi / 4), x * np.sin((pan + 1) * np.pi / 4)], 1) * 1.4


def footstep(p=1.0):
    thud = layer(fft_band(noise(0.12, "brown"), hi=300 * p), exp_env(0.12, 0.002, 0.025), 1.0)
    grit = layer(fft_band(noise(0.09), lo=1800 * p, hi=6000), exp_env(0.09, 0.004, 0.02), 0.35, delay=r(0.003, 0.012))
    return reverb(mix(thud, grit), size=0.2, decay=0.35, wet=0.08)


def ui_click(p=1.0):
    blip = layer(osc(np.full(int(0.03 * SR), 2300 * p)), exp_env(0.03, 0.0003, 0.004), 0.7)
    tick = layer(fft_band(noise(0.006), lo=4000), exp_env(0.006, 0.0001, 0.0008), 0.6)
    return mix(blip, tick)


def ui_confirm(p=1.0):
    notes = [660, 830, 990]
    out = [layer(osc(np.full(int(0.25 * SR), f * p)) * 0.7 + osc(np.full(int(0.25 * SR), f * 2 * p), "tri") * 0.12,
                 exp_env(0.25, 0.004, 0.08), 0.5, delay=i * 0.055) for i, f in enumerate(notes)]
    return slap(mix(*out), time=0.11, wet=0.12, hi=5000)


def ui_error(p=1.0):
    out = [layer(fft_band(osc(np.full(int(0.16 * SR), f * p), "square") + osc(np.full(int(0.16 * SR), f * 1.012 * p), "square"), hi=1800),
                 exp_env(0.16, 0.003, 0.06), 0.35, delay=i * 0.12) for i, f in enumerate((330, 247))]
    return mix(*out)


def pickup(p=1.0):
    out = []
    for i, f in enumerate((1047, 1319, 1568, 2093)):
        n = int(0.35 * SR)
        car = np.full(n, f * p)
        out.append(layer(fm(car, 3.5, 2.5 * exp_env(0.35, 0.0005, 0.05)), exp_env(0.35, 0.001, 0.09), 0.35, delay=i * 0.045))
    sparkle = layer(fft_band(noise(0.3), lo=7000), exp_env(0.3, 0.02, 0.06), 0.08, delay=0.1)
    return reverb(stereo(mix(*out, sparkle), width=0.5), size=0.5, decay=0.9, damp=6000, wet=0.2)


def ambience_wind(p=1.0, dur=12.0):
    t = t_axis(dur)
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * (t / dur * 3) + r(0, 6)) * np.sin(2 * np.pi * t / dur * 2)
    chans = []
    for c in range(2):
        base = noise(dur, "pink")
        gust = svf(base, (350 + 900 * lfo) * p, 1.2, "bp")
        bed = fft_band(noise(dur, "brown"), hi=180)
        chans.append(gust * (0.35 + 0.65 * lfo) + bed * 0.5)
    return make_loop(np.stack(chans, 1), xfade=1.5)


def machine_hum(p=1.0, dur=8.0):
    t = t_axis(dur)
    f0 = 50 * p  # mains-like hum + harmonics with slow beating partials
    x = sum(a * np.sin(2 * np.pi * f0 * k * t * (1 + 0.0015 * k) + r(0, 6)) for k, a in ((1, 0.6), (2, 0.35), (3, 0.2), (5, 0.1), (7, 0.05)))
    air = fft_band(noise(dur, "pink"), lo=800, hi=4000) * 0.06 * (1 + 0.3 * np.sin(2 * np.pi * t * 0.25))
    return make_loop(stereo(x + air, width=0.4), xfade=1.0)


RECIPES = {k: v for k, v in globals().items() if k in ("impact", "gunshot", "laser", "explosion", "whoosh", "footstep", "ui_click",
                                                     "ui_confirm", "ui_error", "pickup", "ambience_wind", "machine_hum")}
LOOPS = ("ambience_wind", "machine_hum")


def main():
    global SR, rng
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help") or (a[0] != "list" and a[0] not in RECIPES):
        print(__doc__)
        sys.exit(0 if a and a[0] in ("-h", "--help") else 2)
    if a[0] == "list":
        print(" ".join(RECIPES))
        return
    get = lambda k, d: type(d)(a[a.index(k) + 1]) if k in a else d
    SR = get("--sr", 48000)
    seed, nvar, out_dir, bits, pitch = get("--seed", 1), get("--variants", 1), get("--out-dir", "."), get("--bits", 16), get("--pitch", 1.0)
    os.makedirs(out_dir, exist_ok=True)
    for v in range(nvar):
        rng = np.random.default_rng(seed * 1000 + v)
        p = pitch * (1 if a[0] in LOOPS else 2 ** (rng.uniform(-1.2, 1.2) / 12))  # +-1.2 semitones per variant
        x = RECIPES[a[0]](p)
        x = finish(x, fade_in=0 if a[0] in LOOPS else 0.001, fade_out=0 if a[0] in LOOPS else 0.02, trim_db=-200 if a[0] in LOOPS else -70)
        if "--mono" in a:
            x = x.mean(1, keepdims=True)
        name = os.path.join(out_dir, f"{a[0]}_{v + 1:02d}.wav" if nvar > 1 else f"{a[0]}.wav")
        write_wav(name, x, bits)
        print(f"wrote {name}  {len(x) / SR:.3f}s  {x.shape[1]}ch  {SR}Hz  {bits}bit")


if __name__ == "__main__":
    main()
