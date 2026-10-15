#!/usr/bin/env bash
# Installs dependencies for the repo the current directory belongs to.
# Picks the Node version from .nvmrc / .node-version and the package manager
# from package.json#packageManager or the lockfile. Exits non-zero on failure;
# don't pipe its output through `tail` — that hides the exit code.
# Usage: install-deps.sh [-C <repo>]
set -uo pipefail

if [ "${1:-}" = "-C" ]; then
  cd "${2:?-C needs a path}" || { echo "cannot cd to $2"; exit 1; }
fi
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" || exit 1

if [ ! -f package.json ]; then
  echo "no package.json in $(pwd): nothing to install"
  exit 0
fi

# --- Node version ---------------------------------------------------------
want_node=""
[ -f .nvmrc ] && want_node="$(tr -d '[:space:]' < .nvmrc)"
[ -z "$want_node" ] && [ -f .node-version ] && want_node="$(tr -d '[:space:]' < .node-version)"

node_hint=""
if [ -n "$want_node" ]; then
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env)"
    if ! fnm use "$want_node" >/dev/null; then
      echo "fnm: Node $want_node is not installed (fnm install $want_node)"
      exit 1
    fi
    node_hint="eval \"\$(fnm env)\" && fnm use $want_node"
  elif [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm use "$want_node" >/dev/null || { echo "nvm: Node $want_node is not installed (nvm install $want_node)"; exit 1; }
    node_hint="source \"\${NVM_DIR:-\$HOME/.nvm}/nvm.sh\" && nvm use $want_node"
  elif command -v volta >/dev/null 2>&1; then
    : # volta pins per project on its own
  else
    echo "warning: repo wants Node $want_node but no fnm/nvm/volta found; using $(node -v 2>/dev/null || echo 'no node')"
  fi
fi

# --- Package manager -------------------------------------------------------
pm=""
pm_field="$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"\([a-z]*\)@.*/\1/p' package.json | head -1)"
if [ -n "$pm_field" ]; then
  pm="$pm_field"
elif [ -f pnpm-lock.yaml ]; then
  pm=pnpm
elif [ -f yarn.lock ]; then
  pm=yarn
elif [ -f bun.lock ] || [ -f bun.lockb ]; then
  pm=bun
else
  pm=npm
fi

case "$pm" in
  yarn) cmd=(yarn install) ;;
  pnpm) cmd=(pnpm install) ;;
  bun)  cmd=(bun install) ;;
  *)    cmd=(npm install) ;;
esac

if ! command -v "${cmd[0]}" >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
  cmd=(corepack "${cmd[@]}")
fi

echo "node: $(node -v 2>/dev/null || echo none)${want_node:+ (wanted $want_node)}"
echo "package manager: $pm"
echo "running: ${cmd[*]}"
"${cmd[@]}"
status=$?

if [ $status -eq 0 ]; then
  lock_changes="$(git status --porcelain -- pnpm-lock.yaml yarn.lock package-lock.json bun.lock bun.lockb 2>/dev/null)"
  [ -n "$lock_changes" ] && echo "lockfile changed by install:" && echo "$lock_changes"
  [ -n "$node_hint" ] && echo "run later node commands after: $node_hint"
fi
exit $status
