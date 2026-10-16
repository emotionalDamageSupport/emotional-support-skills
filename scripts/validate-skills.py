#!/usr/bin/env python3
"""Checks every skill against the Agent Skills spec and this repo's own rules.

Run from anywhere: python3 scripts/validate-skills.py
Exits 1 and lists every problem found.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILLS = REPO / "skills"

# Limits from the Agent Skills spec / Anthropic skill authoring best practices.
NAME_RE = re.compile(r"^[a-z0-9-]{1,64}$")
RESERVED = ("anthropic", "claude")
DESCRIPTION_MAX = 1024
BODY_MAX_LINES = 500
# Only name and description are portable across agents (see README "Adding a skill").
# Claude Code invocation hints are allowed too: other agents ignore them.
ALLOWED_KEYS = {"name", "description", "disable-model-invocation", "argument-hint"}

problems: list[str] = []


def frontmatter(text: str) -> tuple[dict, str]:
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not match:
        return {}, text
    fields = {}
    for line in match.group(1).splitlines():
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1)
            fields[key.strip()] = value.strip()
    return fields, match.group(2)


skill_dirs = sorted(p.parent for p in SKILLS.glob("*/SKILL.md"))
for skill in skill_dirs:
    rel = skill.relative_to(REPO)
    fields, body = frontmatter((skill / "SKILL.md").read_text())
    if not fields:
        problems.append(f"{rel}: no YAML frontmatter")
        continue

    extra = set(fields) - ALLOWED_KEYS
    if extra:
        problems.append(f"{rel}: non-portable frontmatter keys {sorted(extra)}")

    name = fields.get("name", "")
    if not NAME_RE.match(name):
        problems.append(f"{rel}: name '{name}' must be 1-64 chars of a-z, 0-9, -")
    if name != skill.name:
        problems.append(f"{rel}: name '{name}' must match the directory name")
    if any(word in name for word in RESERVED):
        problems.append(f"{rel}: name must not contain {RESERVED}")

    description = fields.get("description", "")
    if not description:
        problems.append(f"{rel}: empty description")
    if len(description) > DESCRIPTION_MAX:
        problems.append(f"{rel}: description is {len(description)} chars, max {DESCRIPTION_MAX}")
    if re.search(r"<[a-zA-Z/][^>]*>", description):
        problems.append(f"{rel}: description must not contain XML tags")

    lines = body.count("\n")
    if lines > BODY_MAX_LINES:
        problems.append(f"{rel}: SKILL.md body is {lines} lines, keep it under {BODY_MAX_LINES}")

    for target in re.findall(r"\]\(([^)#]+?)\)", body):
        # Skip URLs and template placeholders like [KEY](url): only path-like targets are files.
        if "://" in target or not re.search(r"[./]", target):
            continue
        if not (skill / target).exists():
            problems.append(f"{rel}: broken link {target}")

    # References stay one level deep: a reference file must not send the agent to another file.
    for ref in skill.glob("references/*.md"):
        for target in re.findall(r"\]\(([^)#]+?\.md)\)", ref.read_text()):
            if "://" not in target:
                problems.append(f"{ref.relative_to(REPO)}: links to {target} — keep references one level deep")

plugin = json.loads((REPO / ".claude-plugin" / "plugin.json").read_text())
listed = {Path(p).name for p in plugin.get("skills", [])}
present = {p.name for p in skill_dirs}
for missing in sorted(present - listed):
    problems.append(f".claude-plugin/plugin.json: skill '{missing}' is not listed")
for stale in sorted(listed - present):
    problems.append(f".claude-plugin/plugin.json: lists '{stale}', which doesn't exist")

# pull and pull-push each ship install-deps.sh so either works alone; the copies must not drift.
copies = sorted(SKILLS.glob("*/scripts/install-deps.sh"))
if len({c.read_bytes() for c in copies}) > 1:
    problems.append("install-deps.sh copies differ: " + ", ".join(str(c.relative_to(REPO)) for c in copies))

if problems:
    print("\n".join(f"- {p}" for p in problems))
    sys.exit(1)
print(f"OK: {len(skill_dirs)} skills")
