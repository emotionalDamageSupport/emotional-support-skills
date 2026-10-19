#!/usr/bin/env bash
# Validates an MR title before it is used.
# Usage: check-title.sh "<title>" ["<release regex from issue-tracker.md>"]
# Prints OK, or every problem found; exits 1 on problems.
set -uo pipefail

title="${1:-}"
release_re="${2:-}"
[ -z "$title" ] && { echo "usage: check-title.sh \"<title>\" [release-regex]"; exit 2; }

# Strip a Draft prefix: it is removed before merge, so it never reaches release tooling.
core="${title#Draft: }"

problems=()
TYPES='feat|fix|refactor|perf|docs|chore|ci|build|deps|test'

perl -e 'exit(($ARGV[0] =~ /^(?:[A-Z][A-Z0-9]+-\d+ )*(?:'"$TYPES"')!?: (?:\[[^\]]+\] )?\S/) ? 0 : 1)' -- "$core" \
  || problems+=("does not match '<TASK-KEYS> <type>: [scope] <summary>' (types: ${TYPES//|/, })")

perl -e 'exit(($ARGV[0] =~ /^(?:[A-Z][A-Z0-9]+-\d+ )*\w+\(/) ? 0 : 1)' -- "$core" \
  && problems+=("uses type(scope): — move the scope after the colon as [scope]")

perl -e 'exit(($ARGV[0] =~ /^(?:[A-Z][A-Z0-9]+-\d+ )*\w+!:/) ? 0 : 1)' -- "$core" \
  && problems+=("has '!' — this cuts a major release; keep it only if the user explicitly asked for one")

perl -e 'exit(($ARGV[0] =~ /[A-Z][A-Z0-9]+-\d+,/) ? 0 : 1)' -- "$core" \
  && problems+=("task keys are separated by commas — use spaces")

# 80 characters keeps the title readable in GitLab/GitHub lists without truncation.
summary="$(printf '%s' "$core" | sed -E 's/^([A-Z][A-Z0-9]+-[0-9]+ )*[a-z]+!?: (\[[^]]*\] )?//')"
# Count characters, not bytes: ${#var} counts bytes in the C locale and doubles Cyrillic.
summary_len="$(perl -CSA -e 'print length($ARGV[0])' -- "$summary")"
[ "$summary_len" -gt 80 ] && problems+=("summary is $summary_len chars; aim for ≤ 80")
[ "${summary%.}" != "$summary" ] && problems+=("summary ends with a period")

# Scope and summary start with a capital letter (Cyrillic too, hence -CSA and \p{Lu}).
scope="$(printf '%s' "$core" | sed -nE 's/^([A-Z][A-Z0-9]+-[0-9]+ )*[a-z]+!?: \[([^]]*)\] .*/\2/p')"
starts_upper() { perl -CSA -e 'exit(($ARGV[0] =~ /^\p{Lu}/) ? 0 : 1)' -- "$1"; }
[ -n "$scope" ] && ! starts_upper "$scope" && problems+=("scope [$scope] starts with a lowercase letter — capitalise it")
[ -n "$summary" ] && ! starts_upper "$summary" && problems+=("summary starts with a lowercase letter — capitalise it")

if [ -n "$release_re" ]; then
  perl -e 'exit(($ARGV[0] =~ /$ARGV[1]/) ? 0 : 1)' -- "$core" "$release_re" \
    || problems+=("does not match the release regex: $release_re (with several task keys, keep the first in the title and list the rest in the description)")
fi

if [ ${#problems[@]} -eq 0 ]; then
  echo OK
  exit 0
fi
printf -- '- %s\n' "${problems[@]}"
exit 1
