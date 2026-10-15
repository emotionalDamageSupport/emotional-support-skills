---
name: pull-push
description: Update-and-push in one go — merges the parent branch into the current one, installs dependencies, then pushes. Use when the user asks to update the branch ("спулься", "подтяни main и запушь") or another skill such as merge-request needs the branch updated and pushed.
---

# Pull, then push

The user, or the calling skill, already decided this should happen: run it straight through. Stop only at the points listed at the end, where continuing could lose or mix up work.

**Authorship is the user's alone.** Every commit this skill makes ends with its own message — no attribution trailer, even one the agent's defaults would append.

## 1. Parent branch

The branch the caller passed or the user named; otherwise the remote default (`git symbolic-ref --short refs/remotes/origin/HEAD`, minus `origin/`).

## 2. Merge

```bash
git status --porcelain                           # must be empty
git fetch origin <parent>
git rev-list --count HEAD..origin/<parent>       # 0 → skip to step 4
git merge --no-commit --no-edit origin/<parent>  # merge, not rebase: the branch may already be pushed
```

Lockfile-only conflicts (`yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`, `bun.lock`): `git checkout --theirs <lockfile> && git add <lockfile>`. `package.json`: keep both sides, the higher version on a clash. Step 3 commits, so the reinstalled lockfile lands in the merge commit.

## 3. Install and commit

```bash
bash <this skill's directory>/scripts/install-deps.sh -C <repo root>
```

Run it as is and read its exit code — piping through `tail` hides a failure. Then commit:

- merge pending (`git rev-parse -q --verify MERGE_HEAD`): `git add <lockfile> && git commit --no-edit --cleanup=strip`;
- fast-forward that changed the lockfile: commit it as `chore: update lockfile`.

## 4. Push

```bash
git push                    # no upstream yet → git push -u origin HEAD
```

## Stop and ask only when

- the working tree has uncommitted changes — they'd get mixed into the merge;
- a conflict touches anything beyond lockfiles and `package.json`;
- the install fails — report the error and keep the branch local until it builds;
- the push is rejected because the remote branch moved (someone rebased or pushed in GitLab/GitHub) — report it and let the user decide; the remote may have been rewritten on purpose.

## Report

One or two lines: commits merged in, install result, pushed to `<remote>/<branch>`.
