#!/usr/bin/env python3
"""Validate Claude Code skill directories. Read-only.

  validate_skills.py [ROOT ...] [--strict]      default roots: ~/.claude/skills and ./.claude/skills

Checks per skill: SKILL.md exists and starts with '---' frontmatter; YAML parses; name (or folder name) matches
^[a-z0-9]+(-[a-z0-9]+)*$, <= 64 chars, equals the folder name; description present, <= 1024 chars (Agent Skills
spec / claude.ai upload limit) and description+when_to_use <= 1536 (Claude Code listing cap); unknown keys;
reserved folder names (synced, anthropic-skills); SKILL.md <= 500 lines; relative markdown links and
${CLAUDE_SKILL_DIR}/... paths exist; scripts parse (python -m py_compile, bash -n, node --check) and have a
shebang if executable; inline-code `/name` references resolve to a known skill (personal, project or plugin
`ns:name`); duplicate names across roots. Exit 1 on errors (and on warnings with --strict).
"""
import os
import re
import subprocess
import sys

try:
    import yaml
except ImportError:
    yaml = None

KNOWN = {"name", "description", "when_to_use", "argument-hint", "arguments", "disable-model-invocation", "user-invocable",
         "allowed-tools", "disallowed-tools", "model", "effort", "context", "agent", "background", "hooks", "paths", "shell",
         "metadata", "license", "compatibility", "version"}
BUILTIN = {"reload-skills", "reload-plugins", "help", "config", "model", "clear", "compact", "init", "memory", "agents", "mcp",
           "plugin", "skills", "permissions", "hooks", "doctor", "review", "add-dir", "fast", "loop", "skill-doctor"}
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def parse_front(text):
    if not text.startswith("---"):
        return None, "SKILL.md does not start with '---' frontmatter"
    end = text.find("\n---", 3)
    if end < 0:
        return None, "unterminated frontmatter"
    raw = text[3:end]
    if yaml:
        try:
            return yaml.safe_load(raw) or {}, None
        except yaml.YAMLError as e:
            return None, f"YAML error: {e}"
    d = {}
    for line in raw.splitlines():
        if ":" in line and not line.startswith(" "):
            k, v = line.split(":", 1)
            d[k.strip()] = v.strip().strip('"')
    return d, None


def check_script(p):
    ext = os.path.splitext(p)[1]
    cmd = {".py": [sys.executable, "-m", "py_compile", p], ".sh": ["bash", "-n", p], ".mjs": ["node", "--check", p], ".js": ["node", "--check", p]}.get(ext)
    if not cmd:
        return None
    r = subprocess.run(cmd, capture_output=True, text=True)
    return None if r.returncode == 0 else (r.stderr or r.stdout).strip().splitlines()[-1][:200]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    roots = args or [os.path.expanduser("~/.claude/skills"), os.path.join(os.getcwd(), ".claude/skills")]
    skills, errs, warns = {}, [], []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for d in sorted(os.listdir(root)):
            sd = os.path.join(root, d)
            if not os.path.isdir(sd) or d.startswith("."):
                continue
            if d in ("synced", "anthropic-skills"):
                continue  # reserved, managed by Claude Code
            sk = os.path.join(sd, "SKILL.md")
            if not os.path.exists(sk):
                warns.append(f"{sd}: directory without SKILL.md")
                continue
            text = open(sk, encoding="utf-8").read()
            fm, err = parse_front(text)
            tag = f"{d} ({root})"
            if err:
                errs.append(f"{tag}: {err}")
                continue
            name = str(fm.get("name", d))
            skills.setdefault(name, []).append(sd)
            if not NAME_RE.match(name) or len(name) > 64:
                errs.append(f"{tag}: invalid name '{name}'")
            if name != d:
                warns.append(f"{tag}: name '{name}' differs from folder '{d}'")
            desc = str(fm.get("description", "")).strip()
            if not desc:
                errs.append(f"{tag}: no description (Claude cannot tell when to use it)")
            if len(desc) > 1024:
                errs.append(f"{tag}: description {len(desc)} chars > 1024")
            if len(desc) + len(str(fm.get("when_to_use", ""))) > 1536:
                errs.append(f"{tag}: description+when_to_use > 1536 chars (truncated in listing)")
            unknown = set(fm) - KNOWN
            if unknown:
                warns.append(f"{tag}: unknown frontmatter keys {sorted(unknown)} (ignored by Claude Code)")
            lines = text.count("\n") + 1
            if lines > 500:
                warns.append(f"{tag}: SKILL.md has {lines} lines (> 500: move detail to references/)")
            body = text[text.find("\n---", 3) + 4 :]
            if len(body.strip()) < 400:
                warns.append(f"{tag}: body under 400 chars: placeholder?")
            for link in re.findall(r"\]\(([^)#\s]+)\)", body):
                if not re.match(r"^[a-z]+:", link) and not os.path.exists(os.path.join(sd, link)):
                    errs.append(f"{tag}: broken link {link}")
            for ref in re.findall(r"\$\{CLAUDE_SKILL_DIR\}/([\w./-]+)", text):
                if not os.path.exists(os.path.join(sd, ref.rstrip("."))):
                    errs.append(f"{tag}: missing file ${{CLAUDE_SKILL_DIR}}/{ref}")
            for dp, _, fs in os.walk(sd):
                for f in fs:
                    p = os.path.join(dp, f)
                    e = check_script(p)
                    if e:
                        errs.append(f"{tag}: {os.path.relpath(p, sd)} does not parse: {e}")
                    if os.access(p, os.X_OK) and os.path.splitext(f)[1] in (".py", ".sh", ".mjs") and not open(p, "rb").read(2) == b"#!":
                        warns.append(f"{tag}: {os.path.relpath(p, sd)} executable without shebang")
            prose = re.sub(r"```.*?```", "", body, flags=re.S)
            spans = re.findall(r"`([^`\n]+)`", prose)
            refs = [m.group(1) for sp in spans if (m := re.match(r"^/([a-z0-9-]+(?::[a-z0-9-]+)?)(?:\s.*)?$", sp))]
            skills[name][-1] = (sd, [r for r in refs if r not in BUILTIN])
    names = set(skills)
    for name, entries in skills.items():
        if len(entries) > 1:
            warns.append(f"duplicate skill name '{name}' in {[e[0] if isinstance(e, tuple) else e for e in entries]} (personal wins over project)")
        for e in entries:
            if isinstance(e, tuple):
                for ref in e[1]:
                    if ":" not in ref and ref not in names:
                        errs.append(f"{name}: references `/{ref}` which is not a skill in {roots}")
    print(f"skills: {len(names)} in {roots}")
    for w in warns:
        print("WARN ", w)
    for e in errs:
        print("ERROR", e)
    bad = errs or ("--strict" in sys.argv and warns)
    print("result:", "FAIL" if bad else "PASS")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
