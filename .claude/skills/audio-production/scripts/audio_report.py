#!/usr/bin/env python3
"""Measure game-audio files with ffmpeg + numpy: loudness, peaks, clipping, DC, silence, stereo, spectrum,
loop seams and variant similarity. Read-only.

  audio_report.py FILES... [--json] [--loop] [--compare]
        [--target-lufs -18 --lufs-tol 3]   (checked against momentary max for clips < 3 s, integrated otherwise)
        [--max-true-peak -1.0]

Flags (exit 1 if any ERROR):
  ERROR  clipped samples, true peak above --max-true-peak, loudness outside target, loop seam click (--loop)
  WARN   DC offset, long leading silence, mono-incompatible stereo (correlation < -0.2), near-duplicate variants (--compare)
Numbers do not judge taste: listen, and compare against a reference sound in the same game.
"""
import json
import re
import subprocess
import sys

import numpy as np


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate:format=duration,bit_rate,size",
                          "-of", "json", path], capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(out.stderr.strip() or "ffprobe failed")
    j = json.loads(out.stdout)
    s = next((s for s in j.get("streams", []) if "sample_rate" in s), {})
    f = j.get("format", {})
    return {"codec": s.get("codec_name"), "sample_rate": int(s.get("sample_rate", 0)), "channels": int(s.get("channels", 0)),
            "duration_s": round(float(f.get("duration", 0)), 3), "bytes": int(f.get("size", 0)),
            "kbps": round(int(f.get("bit_rate", 0) or 0) / 1000)}


def decode(path, sr):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, "<f4")


def loudness(path):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true:framelog=info", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = [float(x) for x in re.findall(r"M:\s*(-?[\d.]+)", err)]
    s = [float(x) for x in re.findall(r"S:\s*(-?[\d.]+)", err)]
    summary = err[err.rfind("Summary:"):]
    get = lambda k: (lambda r: float(r.group(1)) if r else None)(re.search(k + r":\s*(-?[\d.]+|-inf)", summary))
    return {"integrated_lufs": get("I"), "lra_lu": get("LRA"), "true_peak_dbtp": get(r"Peak"),
            "momentary_max_lufs": max(m) if m else None, "short_term_max_lufs": max(s) if s else None}


def db(x):
    return round(float(20 * np.log10(max(float(x), 1e-12))), 2)


def analyse(path, args):
    info = probe(path)
    ch = max(info["channels"], 1)
    x = decode(path, info["sample_rate"]).reshape(-1, ch)
    sr = info["sample_rate"]
    info.update(loudness(path))
    errs, warns = [], []
    mono = x.mean(1)
    peak = float(np.abs(x).max()) if len(x) else 0
    rms = float(np.sqrt(np.mean(x ** 2))) if len(x) else 0
    clipped = int(np.sum(np.abs(x) >= 0.9999))
    dc = float(np.abs(x.mean(0)).max()) if len(x) else 0
    env = np.abs(mono)
    thr = 10 ** (-60 / 20)
    above = np.nonzero(env > thr)[0]
    lead = above[0] / sr if len(above) else info["duration_s"]
    trail = (len(env) - above[-1]) / sr if len(above) else 0
    corr = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]) if ch == 2 and np.std(x[:, 0]) > 0 and np.std(x[:, 1]) > 0 else None
    spec = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2 if len(mono) > 16 else np.zeros(2)
    f = np.fft.rfftfreq(len(mono), 1 / sr) if len(mono) > 16 else np.zeros(2)
    tot = spec.sum() + 1e-20
    bands = {"sub<60": spec[f < 60].sum() / tot, "low60-250": spec[(f >= 60) & (f < 250)].sum() / tot,
             "mid250-2k": spec[(f >= 250) & (f < 2000)].sum() / tot, "pres2k-6k": spec[(f >= 2000) & (f < 6000)].sum() / tot,
             "air>6k": spec[f >= 6000].sum() / tot}
    info.update({"sample_peak_dbfs": db(peak), "rms_dbfs": db(rms), "crest_db": round(db(peak) - db(rms), 2), "clipped_samples": clipped,
                 "dc_offset": round(dc, 5), "lead_silence_s": round(lead, 3), "tail_silence_s": round(trail, 3),
                 "stereo_correlation": None if corr is None else round(corr, 3),
                 "spectral_centroid_hz": round(float((spec * f).sum() / tot)), "band_energy": {k: round(float(v), 3) for k, v in bands.items()}})
    if clipped:
        errs.append(f"{clipped} clipped samples")
    if info["true_peak_dbtp"] is not None and info["true_peak_dbtp"] > args["max_tp"]:
        errs.append(f"true peak {info['true_peak_dbtp']} dBTP > {args['max_tp']}")
    if dc > 0.01:
        warns.append(f"DC offset {dc:.4f} (wastes headroom, clicks on start/stop)")
    if lead > 0.02:
        warns.append(f"{lead * 1000:.0f} ms leading silence (delays the hit; trim it)")
    if corr is not None and corr < -0.2:
        warns.append(f"stereo correlation {corr:.2f}: phasey, will thin out when summed to mono (phone speakers)")
    if args["target"] is not None:
        short = info["duration_s"] < 3  # the 3 s short-term window cannot fill on a short clip: use momentary (400 ms) max
        val = info["momentary_max_lufs"] if short else info["integrated_lufs"]
        kind = "momentary max" if short else "integrated"
        if val is None:
            warns.append("too short for any LUFS window (< 400 ms): judge level by peak / by ear against neighbours")
        elif abs(val - args["target"]) > args["tol"]:
            errs.append(f"{kind} loudness {val} LUFS outside {args['target']}+-{args['tol']}")
    if args["loop"] and len(x) > sr // 10:
        w = int(0.01 * sr)
        jump = float(np.abs(x[0] - x[-1]).max())
        local = float(np.abs(np.diff(x[-w:], axis=0)).max() + np.abs(np.diff(x[:w], axis=0)).max()) / 2 + 1e-9
        rms_end, rms_start = np.sqrt(np.mean(x[-w * 5 :] ** 2)), np.sqrt(np.mean(x[: w * 5] ** 2))
        info["loop_seam"] = {"jump": round(jump, 4), "typical_step": round(local, 4), "rms_ratio_db": db(float(rms_end) / max(float(rms_start), 1e-9))}
        if jump > 3 * local and jump > 0.01:
            errs.append(f"loop seam click: wrap jump {jump:.3f} vs typical step {local:.3f}")
        if abs(info["loop_seam"]["rms_ratio_db"]) > 3:
            warns.append(f"loop level jump {info['loop_seam']['rms_ratio_db']} dB across the wrap")
    info["file"], info["errors"], info["warnings"] = path, errs, warns
    info["_spec_env"] = np.interp(np.geomspace(40, sr / 2.2, 64), f, np.sqrt(np.convolve(spec, np.ones(64) / 64, "same"))) if len(f) > 64 else None
    return info


def main():
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    opt = lambda k, d: float(a[a.index(k) + 1]) if k in a else d
    args = {"target": opt("--target-lufs", None), "tol": opt("--lufs-tol", 3.0), "max_tp": opt("--max-true-peak", -1.0), "loop": "--loop" in a}
    skip = {a[i + 1] for i, v in enumerate(a) if v in ("--target-lufs", "--lufs-tol", "--max-true-peak") and i + 1 < len(a)}
    files = [f for f in a if not f.startswith("--") and f not in skip]
    res, rc = [], 0
    for f in files:
        try:
            res.append(analyse(f, args))
        except Exception as e:
            res.append({"file": f, "fatal": str(e)})
            rc = 2
    if "--compare" in a:
        envs = [(r["file"], r["_spec_env"]) for r in res if r.get("_spec_env") is not None]
        for i in range(len(envs)):
            for j in range(i + 1, len(envs)):
                u, v = np.log(envs[i][1] + 1e-9), np.log(envs[j][1] + 1e-9)
                sim = float(np.corrcoef(u, v)[0, 1])
                res[i].setdefault("similar_to", []).append((envs[j][0], round(sim, 4)))
                if sim > 0.995:
                    res[i]["warnings"].append(f"near-duplicate spectrum of {envs[j][0]} (r={sim:.4f}): variation too small?")
    for r in res:
        r.pop("_spec_env", None)
        if r.get("errors"):
            rc = max(rc, 1)
    if "--json" in a:
        print(json.dumps(res if len(res) > 1 else res[0], indent=2))
    else:
        for r in res:
            if "fatal" in r:
                print(f"== {r['file']}\n   FATAL {r['fatal']}")
                continue
            print(f"== {r['file']}  {r['codec']} {r['sample_rate']}Hz {r['channels']}ch {r['duration_s']}s {r['bytes'] / 1024:.1f}KiB {r['kbps']}kbps")
            print(f"   LUFS I {r['integrated_lufs']}  S-max {r['short_term_max_lufs']}  M-max {r['momentary_max_lufs']}  LRA {r['lra_lu']}  "
                  f"TP {r['true_peak_dbtp']} dBTP  peak {r['sample_peak_dbfs']} dBFS  crest {r['crest_db']} dB")
            print(f"   centroid {r['spectral_centroid_hz']} Hz  bands {r['band_energy']}  corr {r['stereo_correlation']}  "
                  f"silence lead/tail {r['lead_silence_s']}/{r['tail_silence_s']} s")
            if "loop_seam" in r:
                print(f"   loop seam {r['loop_seam']}")
            for s in r.get("similar_to", []):
                print(f"   similarity to {s[0]}: {s[1]}")
            for w in r["warnings"]:
                print(f"   WARN  {w}")
            for e in r["errors"]:
                print(f"   ERROR {e}")
    sys.exit(rc)


if __name__ == "__main__":
    main()
