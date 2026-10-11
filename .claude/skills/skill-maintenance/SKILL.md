---
name: skill-maintenance
description: Maintain and extend Riftline's Claude Code skills in .claude/skills - inventory existing project, personal and plugin skills, find gaps, duplication, conflicts and outdated instructions, check current official docs for format changes, create or update skills with backups, and validate names, frontmatter, links, scripts and cross-references. Use when asked to add/improve/audit skills, after a workflow repeatedly fails or is reinvented, or when Claude Code's skill format may have changed.
---

# Skill maintenance

## Validate (read-only)
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skills.py .claude/skills         # from the repo root
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skills.py .claude/skills --strict
```
Checks frontmatter/YAML, name rules, description length (1024 spec / 1536 listing cap), unknown keys,
reserved folder names, 500-line guideline, broken links and `${CLAUDE_SKILL_DIR}` paths, script syntax
(py/sh/mjs), shebangs, slash-command cross-references, duplicate names across roots.

## When to change a skill
Only with an identifiable benefit: a procedure failed or misled in real use, a tool/format changed, a repeated
workaround should become a script, or two skills conflict. Not after every task, not for wording polish.

## Procedure
1. **Inventory**: the session's skill list (project, personal, plugin, account-synced), `.claude/skills/` and its
   `README.md` (sources, licences, what was left out and why). Reuse or extend before creating. Precedence on name clashes: enterprise > personal
   > project; plugin skills are namespaced (`plugin:name`). Never name a folder `synced` or `anthropic-skills`.
2. **Check the current docs** when format questions arise: https://code.claude.com/docs/en/skills (fetch it;
   don't rely on memory). Key facts as of 11.10.2026: personal skills in `~/.claude/skills/<name>/SKILL.md`; all
   frontmatter optional, `description` recommended; description + `when_to_use` truncated at 1,536 chars;
   SKILL.md ≤ 500 lines; `${CLAUDE_SKILL_DIR}` for script paths; skill dirs are watched (live reload), a newly
   created top-level skills dir needs `/reload-skills`.
3. **Work on a branch and open a PR** (CLAUDE.md): git history is the backup. Never rewrite a third-party skill
   in place beyond the adaptations noted in the README; keep its licence file.
4. **Write**: description = what + when (trigger words users actually say), body = procedure, tools with exact
   commands, acceptance checks, fallbacks, pitfalls; long material in `references/`; repeatable steps as tested
   scripts in `scripts/`. No placeholder sections, no invented commands.
5. **Test**: run every script on a real input and on a failure case; run the validator; confirm the skill appears
   in the session's skill list (live reload) and, if possible, invoke it once on a realistic task.
6. **Record** the skill in `.claude/skills/README.md` (source, use) and note it in the roadmap, in the same PR.

## Scope
These skills live in the repository, so every Claude Code session on Riftline (cloud or local) loads them and nothing
else does. Personal skills (`~/.claude/skills`) with the same name would win over them: avoid name clashes.
