#!/usr/bin/env bash
# Everything the merge-request skill needs to start, in one call.
# Usage: context.sh [-C <repo>] [target-branch]
# Read-only except for `git fetch` of the target branch.
set -uo pipefail

if [ "${1:-}" = "-C" ]; then
  cd "${2:?-C needs a path}" || { echo "cannot cd to $2"; exit 1; }
  shift 2
fi

root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "$(pwd) is not inside a git repository; pass -C <repo>"; exit 1; }
cd "$root" || exit 1

section() { printf '\n## %s\n' "$1"; }

section "conventions"
found=""
for f in docs/agents/issue-tracker.md .agents/issue-tracker.md issue-tracker.md; do
  if [ -f "$f" ]; then
    echo "### $f"
    cat "$f"
    found=1
    break
  fi
done
[ -z "$found" ] && echo "no issue-tracker.md: use the skill defaults"

section "repo"
branch="$(git branch --show-current)"
remote_url="$(git remote get-url origin 2>/dev/null || true)"
case "$remote_url" in
  *github.com*) host=github ;;
  "") host=none ;;
  *) host=gitlab ;;
esac
echo "branch: ${branch:-DETACHED}"
echo "remote: ${remote_url:-none} (host: $host)"
echo "task keys in branch: $(printf '%s' "$branch" | tr '[:lower:]' '[:upper:]' | grep -oE '[A-Z][A-Z0-9]+-[0-9]+' | tr '\n' ' ')"

created_from="$(git reflog show --format=%gs "$branch" 2>/dev/null | tail -1 | sed -n 's/^branch: Created from //p')"
if [ -z "$created_from" ] || [ "$created_from" = HEAD ]; then
  # Guess: the local branch whose merge-base with HEAD is closest.
  best=""; best_n=""
  for b in $(git for-each-ref --format='%(refname:short)' refs/heads); do
    [ "$b" = "$branch" ] && continue
    mb="$(git merge-base HEAD "$b" 2>/dev/null)" || continue
    n="$(git rev-list --count "$mb..HEAD")"
    if [ -z "$best_n" ] || [ "$n" -lt "$best_n" ]; then best="$b"; best_n="$n"; fi
  done
  created_from="${best:+$best (guess)}"
fi
echo "created from: ${created_from:-unknown}"

target="${1:-}"
if [ -z "$target" ]; then
  target="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
fi
if [ -z "$target" ]; then
  for b in main master; do git rev-parse --verify -q "$b" >/dev/null && target="$b" && break; done
fi
echo "target: $target"
latest_release="$(git branch -r --list 'origin/RELEASE-*' --sort=-refname 2>/dev/null | head -1 | tr -d ' ')"
[ -n "$latest_release" ] && echo "latest release branch: ${latest_release#origin/}"

base_ref="$target"
if [ "$host" != none ]; then
  git fetch --quiet origin "$target" 2>/dev/null && base_ref="origin/$target"
fi
echo "behind $base_ref by: $(git rev-list --count "HEAD..$base_ref" 2>/dev/null || echo '?') commits"

upstream="$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || true)"
if [ -n "$upstream" ]; then
  echo "upstream: $upstream (unpushed: $(git rev-list --count "$upstream..HEAD") commits)"
else
  echo "upstream: none (branch not pushed)"
fi

section "working tree"
status="$(git status --short)"
echo "${status:-clean}"

section "commits $base_ref..HEAD"
commits="$(git log --oneline "$base_ref..HEAD")"
echo "${commits:-none yet — the changes are only in the working tree above}"

section "diff stat"
stat="$(git diff --stat "$base_ref...HEAD")"
echo "${stat:-empty — nothing committed on top of $base_ref}"
