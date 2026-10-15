#!/usr/bin/env bash
set -euo pipefail

# Symlinks every skill in this repo into the skill directories agents read:
#   ~/.claude/skills  Claude Code
#   ~/.agents/skills  Codex and other Agent Skills-compatible agents
# Each entry points back into this clone, so `git pull` updates them.

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DESTS=("$HOME/.claude/skills" "$HOME/.agents/skills")

for DEST in "${DESTS[@]}"; do
  mkdir -p "$DEST"
  for skill_md in "$REPO"/skills/*/SKILL.md; do
    src="$(dirname "$skill_md")"
    name="$(basename "$src")"
    target="$DEST/$name"

    if [ -e "$target" ] && [ ! -L "$target" ]; then
      echo "skip $target: exists and is not a symlink" >&2
      continue
    fi

    ln -sfn "$src" "$target"
    echo "linked $name -> $target"
  done
done
