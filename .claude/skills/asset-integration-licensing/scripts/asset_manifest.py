#!/usr/bin/env python3
"""Track provenance and licences of project assets in a JSON manifest; generate credits.

  asset_manifest.py scan ASSET_DIR --manifest assets/MANIFEST.json      # add new files (fields left "TODO"), update hashes
  asset_manifest.py check ASSET_DIR --manifest assets/MANIFEST.json [--allow CC0-1.0,CC-BY-4.0,MIT,OFL-1.1,original]
  asset_manifest.py credits --manifest assets/MANIFEST.json [> CREDITS.md]

Each entry: path, sha256, bytes, kind, source ("original" | "generated" | "third-party"), author, license (SPDX id or
"original"), url, attribution (text if the licence requires it), generator (tool/script + params for generated assets),
modified (bool), notes. `check` fails (exit 1) on: files missing from the manifest, entries whose file is gone,
TODO fields, changed hashes not re-scanned, licences outside --allow, CC-BY*/OFL/MIT entries without attribution,
and NC/ND licences (non-commercial / no-derivatives) unless explicitly allowed. `scan` never deletes entries.
This records what you were told about a file; it cannot verify a licence claim. Keep the source URL and the
licence text/screenshot for third-party assets.
"""
import hashlib
import json
import os
import sys

KINDS = {".glb": "model", ".gltf": "model", ".fbx": "model", ".obj": "model", ".blend": "model-source", ".png": "image", ".jpg": "image",
         ".jpeg": "image", ".webp": "image", ".ktx2": "texture", ".svg": "image", ".wav": "audio", ".ogg": "audio", ".mp3": "audio",
         ".m4a": "audio", ".webm": "audio", ".flac": "audio", ".ttf": "font", ".otf": "font", ".woff2": "font", ".mid": "music-source"}
NEEDS_ATTR = ("CC-BY", "OFL", "MIT", "Apache", "BSD")
FIELDS = ("source", "author", "license", "url", "attribution", "generator", "modified", "notes")


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def files(root):
    for d, _, fs in os.walk(root):
        for f in sorted(fs):
            if os.path.splitext(f)[1].lower() in KINDS:
                yield os.path.relpath(os.path.join(d, f), root)


def load(m):
    return json.load(open(m)) if os.path.exists(m) else {"version": 1, "assets": {}}


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("scan", "check", "credits"):
        print(__doc__)
        sys.exit(2)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    man_path = opt("--manifest") or sys.exit("--manifest required")
    man = load(man_path)
    A = man["assets"]
    if a[0] == "credits":
        print("# Credits\n")
        for p, e in sorted(A.items()):
            if e.get("source") == "third-party":
                print(f"- **{p}**: {e.get('attribution') or e.get('author')} — {e.get('license')} — {e.get('url')}" + (" (modified)" if e.get("modified") else ""))
        gen = [p for p, e in A.items() if e.get("source") == "generated"]
        if gen:
            print(f"\n{len(gen)} assets were generated procedurally or with tools listed in the manifest.")
        return
    root = a[1]
    if a[0] == "scan":
        added = changed = 0
        for p in files(root):
            full = os.path.join(root, p)
            h = sha(full)
            if p not in A:
                A[p] = {"sha256": h, "bytes": os.path.getsize(full), "kind": KINDS[os.path.splitext(p)[1].lower()], **{k: "TODO" for k in FIELDS}}
                added += 1
            elif A[p]["sha256"] != h:
                A[p].update(sha256=h, bytes=os.path.getsize(full), modified=True)
                A[p]["notes"] = (A[p].get("notes") or "") + " [hash changed on re-scan: confirm source/licence still apply]"
                changed += 1
        os.makedirs(os.path.dirname(os.path.abspath(man_path)), exist_ok=True)
        json.dump(man, open(man_path, "w"), indent=2, sort_keys=True)
        print(f"manifest {man_path}: {len(A)} entries, {added} added (fill the TODO fields), {changed} hash changes")
        return
    allow = set((opt("--allow") or "CC0-1.0,original").split(","))
    problems = []
    present = set(files(root))
    for p in sorted(present - set(A)):
        problems.append(f"{p}: not in manifest (run scan, then fill provenance)")
    for p, e in sorted(A.items()):
        if p not in present:
            problems.append(f"{p}: in manifest but file missing")
            continue
        if sha(os.path.join(root, p)) != e.get("sha256"):
            problems.append(f"{p}: file changed since manifest (re-scan and re-confirm)")
        todo = [k for k in FIELDS if e.get(k) == "TODO" and not (k in ("url", "attribution", "generator", "notes") and e.get("source") == "original")]
        if todo:
            problems.append(f"{p}: TODO fields {todo}")
        lic = str(e.get("license", ""))
        if lic not in allow and lic != "TODO":
            problems.append(f"{p}: licence {lic} not in allow-list {sorted(allow)}")
        if any(x in lic for x in ("-NC", "-ND")) and lic not in allow:
            problems.append(f"{p}: {lic} forbids commercial use or derivatives")
        if lic.startswith(NEEDS_ATTR) and e.get("attribution") in (None, "", "TODO"):
            problems.append(f"{p}: {lic} requires attribution text")
        if e.get("source") == "generated" and e.get("generator") in (None, "", "TODO"):
            problems.append(f"{p}: generated asset without generator/params (not reproducible)")
    for pr in problems:
        print("PROBLEM", pr)
    print(f"{len(A)} entries, {len(present)} files, {len(problems)} problems -> {'FAIL' if problems else 'PASS'}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
