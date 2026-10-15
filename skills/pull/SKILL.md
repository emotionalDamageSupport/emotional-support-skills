---
name: pull
description: Pull without pushing — merges the parent branch (main, a release branch, or the branch it was cut from) into the current one, then installs dependencies with the repo's Node version and package manager. Use when the user asks to update the branch but keep it local ("подтяни main", "обнови ветку, не пушь"), or the branch is behind its target and a push isn't wanted.
---

# Pull

Merge the parent branch into the current one, then install dependencies. The install is the step that gets skipped: the merge brings a new lockfile, `node_modules` stays old, and compile errors get blamed on the code.

**Authorship is the user's alone.** Every commit this skill makes ends with its own message — no attribution trailer, even one the agent's defaults would append.

## 1. Pick the parent branch

In order: the branch the user named → the target branch from the project's `issue-tracker.md` (`docs/agents/`, `.agents/` or repo root) → the remote default (`git symbolic-ref --short refs/remotes/origin/HEAD`, minus `origin/`).

- "релизная" / release: the newest release branch — `git branch -r --list 'origin/RELEASE-*' --sort=-refname | head -1`, or the pattern from `issue-tracker.md`.
- "родительская" / parent: the branch this one was created from — `git reflog show --format=%gs <branch> | tail -1` ("branch: Created from X"); empty → ask.

The current branch *is* the parent → `git pull --ff-only`, then install.

## 2. Check the working tree

`git status --porcelain` must be empty. Uncommitted changes → stop and ask: commit, stash, or abort. Merging over them mixes the user's work into conflict resolution.

## 3. Fetch and merge

```bash
git fetch origin <parent>
git rev-list --count HEAD..origin/<parent>   # commits coming in
```

0 → the branch is up to date; report that and stop.

Otherwise merge (rebase only when the user asks for it: it rewrites pushed history), stopping before the merge commit so the lockfile from the install lands in the same commit:

```bash
git merge --no-commit --no-edit origin/<parent>
```

A fast-forward has nothing to commit and simply moves the branch.

### Conflicts

- **Only lockfiles** (`yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`, `bun.lock`): take the parent's version (`git checkout --theirs <lockfile>`) and `git add` it; step 4 re-resolves it against the merged `package.json`.
- **`package.json`**: keep both sides' changes; on a version clash take the higher version. Then the lockfile as above.
- **Anything else**: stop, list the conflicted files, and ask how to resolve them — code conflicts are the user's call.

## 4. Install and commit

```bash
bash <this skill's directory>/scripts/install-deps.sh -C <repo root>
```

Run it as is and read its exit code — piping through `tail` hides a failure. Without script access, do the same by hand: `nvm use`, then `yarn install` / `pnpm install` / `npm install` / `bun install`. An `engine "node" is incompatible` error means the wrong Node is active, not broken code.

Then commit, so the merged lockfile and `package.json` travel together:

- merge pending (`git rev-parse -q --verify MERGE_HEAD` succeeds): `git add <lockfile>`, then `git commit --no-edit --cleanup=strip`;
- fast-forward and the install changed the lockfile: commit it as `chore: update lockfile`;
- install failed with the merge pending: stop and report, leaving the merge uncommitted so the user can fix it or `git merge --abort`.

Later node commands in this session need the same Node; the script prints how to switch.

## 5. Report

Commits that came in, conflicts and how they were resolved, install result. Pushing is `pull-push`'s job — leave the branch unpushed unless the user asked.
