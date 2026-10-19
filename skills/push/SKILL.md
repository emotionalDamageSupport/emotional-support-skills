---
name: push
description: Push the current branch to its remote — sets the upstream on first push, never force-pushes, and stops when the remote branch has moved. Use when the user asks to push ("запушь", "push the branch") or another skill such as merge-request needs the branch on the remote. For merging the parent branch first, use pull-push.
---

# Push

Get the current branch onto the remote as it is: no merge, no rebase, no new commits. The push is the last step before other people see the work, so this skill refuses to overwrite anything on the remote.

## 1. Check where you are

```bash
git branch --show-current          # empty → detached HEAD: stop and ask which branch to push
git status --porcelain             # uncommitted changes stay local; mention them in the report
```

The current branch is the target branch itself (`main`, a release branch, the target in the project's `issue-tracker.md`) → stop and ask: a direct push skips review.

## 2. Push

```bash
git push                           # no upstream yet → git push -u origin HEAD
```

`Everything up-to-date` → nothing to push; say so.

## Stop and ask only when

- the push is rejected because the remote branch moved (`[rejected] … (fetch first)` / `non-fast-forward`): someone pushed or rebased in GitLab/GitHub. Report it and let the user choose between pulling it in (`pull-push`) and overwriting it; never force-push on your own;
- a hook or protected-branch rule rejects the push: quote the remote's message;
- the remote asks for credentials: the user has to sign in, not the agent.

## Report

One line: pushed to `<remote>/<branch>` (new upstream or N commits), or why not.
