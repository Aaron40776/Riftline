---
name: toolchain-audit
description: Discover, verify and plan tools for a task - installed CLIs, runtimes, Python/npm libraries, Blender, ffmpeg, image tools, browsers/Playwright, GPU, engines, MCP servers and plugins. Use before relying on a tool, when a task needs software that may be missing, when choosing free/local alternatives to paid services, or when asked "what can you do here / what should I install".
---

# Toolchain audit

## 1. Inventory (read-only, ~5 s)

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/audit_tools.sh            # all groups
bash ${CLAUDE_SKILL_DIR}/scripts/audit_tools.sh audio 3d   # subset
BLENDER_BIN=/path/to/blender bash ${CLAUDE_SKILL_DIR}/scripts/audit_tools.sh 3d
```

Output is `STATUS group tool version`. `OK` = answered a version probe, `FOUND` = on PATH only,
`MISSING`. MCP servers, plugins and skills are not visible to a shell: check your own tool list,
`ToolSearch`, and the skill list in the session context.

## 2. Verify before relying

"On PATH" is not "works". Run the smallest real operation: ffmpeg encode 0.1 s of sine; Blender
`-b --factory-startup --python-expr "import bpy;print(bpy.app.version_string)"`; Playwright launch +
screenshot of `about:blank`; a WebGL context in that browser (note SwiftShader = software GL).

## 3. Missing tool → plan, don't pretend

For each gap state: capability it adds, the concrete option (official source), cost/licence, install scope,
and whether approval is needed. Options and sources are in [references/tool-catalog.md](references/tool-catalog.md).

Install scope ladder (prefer the top):
1. Already installed → use it.
2. Scratch/user-space, no system change: official portable archive verified by checksum into the
   scratchpad (Blender tarball), `npm i --no-save` in a scratch dir, `python3 -m venv` in scratch.
   OK for verification when the network allows; delete afterwards; say you did it.
3. Project dependency (package.json, requirements) → only with the user's agreement, in a PR.
4. System-wide (apt, brew, installers), paid tools, accounts, API keys, MCP servers → ask first.

Never pipe unknown install scripts to a shell, disable TLS checks, or add credentials to files.

## 4. Report format

```
Available now:      tool version - what you will use it for
Gainable locally:   tool - how (scratch download / venv) - approval needed? 
Needs service/perm: what - why - what the user must do
Unavailable:        what - impact - fallback used
```

Separate confirmed facts (probed) from assumptions (docs say, not tested here).

## Known environment notes

- Cloud sessions (claude.ai/code) run in ephemeral containers: anything installed or written to
  `~/.claude` disappears with the container unless it is committed to a repo or synced.
- Headless Linux without `/dev/dri`: browsers render WebGL through SwiftShader; Blender EEVEE/Workbench need
  a GPU context, Cycles CPU works.
