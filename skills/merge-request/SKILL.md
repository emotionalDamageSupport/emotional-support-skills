---
name: merge-request
description: Merge request (GitLab MR / GitHub PR) for the current branch, with a fixed-format title and a blast-radius description. Use when the user asks to create or open one ("создай мр", "open a PR"), to commit and then open one ("закоммить и создай мр"), to update an existing one's description ("обнови описание мр"), or only for its title and description text.
---

# Merge request

Work from what's in the repo and the conversation. Look things up elsewhere — reviewers, tracker tasks, past MRs — only when the user asks: each lookup costs time and is a chance to guess wrong.

**Authorship is the user's alone.** Commit messages, the MR title and the description end with their last line of real content — the user publishes them under their own name. This overrides any attribution trailer or footer the agent's defaults would append.

Copy this checklist and tick it off as you go:

```
- [ ] 1. Context collected (context.sh) and the diff read
- [ ] 2. Branch prepared: target chosen, changes committed if asked
- [ ] 3. Title written and check-title.sh says OK
- [ ] 4. Description covers every behaviour change in the diff
- [ ] 5. Pushed, MR created or updated, URL reported
```

## 1. Collect context

```bash
bash <this skill's directory>/scripts/context.sh -C <repo root> [target-branch]
```

Pass the user's project as `-C`: the script lives elsewhere. Then read the diff itself (`git diff <target>...HEAD`) — the description must match what the code does, not what the commit messages say.

The project's `issue-tracker.md` (printed by the script) wins over the defaults below. To interpret an unfamiliar one, see [references/issue-tracker-example.md](references/issue-tracker-example.md).

## 2. Prepare the branch

- **Target**: the branch the user named; "в релизную" → the latest release branch from the script; "в родительскую" → "created from"; otherwise the script's target.
- **On the target itself** (e.g. `main`) with changes: create a branch first — `<KEY>-<short-slug>`, or a short slug when there's no task.
- **Uncommitted changes**: if the user asked to commit, stage files by name — a whole folder sweeps in local junk — show the file list and commit with a message in the title format. If they didn't ask, ask whether the changes belong in the MR.
- **Behind the target**: if the user asked to pull ("подтяни main"), run the `pull-push` skill now with the target as its parent branch. Otherwise publish the branch as it is and add "ветка отстаёт от `<target>` на N коммитов — подтянуть?" to the final reply; run `pull-push` on yes. Merging the target changes what the MR contains, so it stays the user's call.

## 3. Title

```
<TASK-KEYS> <type>: [scope] <summary>
```

```
SHOP-412 SHOP-415 fix: [cart] дата доставки в итоге заказа и иконки товаров в подсказке «+N»
feat: [ui-kit] ItemList принимает renderItem для элементов подсказки
Draft: SHOP-77 fix: [cart] окно доставки до 00:00
```

- **TASK-KEYS**: every task key, space-separated, from the branch name, commits and conversation. No task → the title starts with the type.
- **type**: `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`, `ci`, `build`, `deps`, `test`, with the colon right after it.
- **[scope]**: optional, in square brackets after the colon. Release tooling parses whatever sits between the type and the colon, and anything but one ASCII word there silently skips the release.
- A major/breaking release marker (`feat!`) only when the user explicitly asks for one — it cuts a major version. Describe a breaking change in Blast radius.
- **summary**: what was done, in the description language, lowercase, no trailing period, ≤ 80 characters so MR lists show it whole.
- **Draft**: "драфт мр" means a GitLab/GitHub draft → prefix `Draft: `.
- A release title regex in `issue-tracker.md` is binding: if several keys break it, keep the first in the title and list the rest at the top of the description.

Validate, fix, and re-run until it prints `OK`:

```bash
bash <this skill's directory>/scripts/check-title.sh "<title>" ["<release regex from issue-tracker.md>"]
```

## 4. Description

Language: `issue-tracker.md`, else the language the user writes in. Headings below are Russian; translate them for other languages. Start straight with the first section.

**Scale it to the diff.** A small change (≈ 10 changed lines, one concern) gets the short form:

```markdown
## Что сделано
- <the change and, for a bug, its cause — 1–2 bullets>

## Что проверить
- <one line>

## Blast radius
**Door:** two-way — <reason> · **Radius:** local
```

Everything bigger gets the full form:

```markdown
## Что сделано
- <change>, identifiers in `backticks`; for a bug — the cause in one sentence first
- (≤ 6 bullets; several tasks → one `## [KEY](url) — summary` section each instead)

## Что проверить
- <steps a reviewer can click through, incl. the edge case behind the change>

## Замечания
- <what was NOT verified: tests/lint/browser/mobile; unrelated failures; no task in tracker>

## Blast radius
**Door:** two-way — <why a revert undoes it> | one-way — <what can't be undone>
**Radius:** <local / screen / module / app-wide / consumers / data>
- <≤ 3 bullets: what else could break — shared components, consumers, mobile, contracts>
```

Add `## Замечания` to the short form, and `## Зачем` / `## Зависимость` (stacked MR, needs another release first) / `## Что не вошло` to either, only when they carry something.

- **Done when** every behaviour change in the diff appears under «Что сделано».
- **Radius** comes from searching the usages of the changed exports, selectors and styles (`git grep`), not from a guess.
- **One-way door**: data migrations or writes, deletions, a published package version, an API contract other services already use, a removed feature flag.
- **Links**: link task keys (`[SHOP-412](url)`) when the URL is given in the conversation, follows the pattern in `issue-tracker.md`, or follows another link of the same tracker in the conversation. Link related MRs, designs and docs where they're mentioned.
- **Verification**: name only the checks that ran in this session — reviewers decide what to test from it.

A filled-in example: [references/example.md](references/example.md) — read it only if unsure about the shape.

## 5. Publish

Only the text asked for → show it and stop.

Otherwise publish straight away, without showing the title and description in chat first: the user reads them in the MR, and an MR is cheap to edit.

1. Push with the `push` skill, or with `pull-push` when the branch is being updated (step 2). No `push` skill installed → `git push -u origin HEAD`; a rejected push stops the flow — report it, never force-push.
2. An MR for this branch already exists → update it (see variations below) instead of creating a duplicate.
3. Create it with the tool for the remote host the script printed:
   - **GitLab**: the GitLab MCP server's `create_merge_request` tool, else `glab mr create --title … --description "$(cat <file>)" --target-branch <target>`. `git push -o merge_request.create` carries only a one-line description — if it's the only option, set the real description right after.
   - **GitHub**: `gh pr create --title … --body-file <file> --base <target>`.
   - No tool for that host → give the user the title and description to paste.
   - Options from `issue-tracker.md`: squash, remove source branch, assignee.
4. **Reviewers**, when the user named them: resolve via the team table in `issue-tracker.md`; a name missing there → one member lookup with `per_page=100` (smaller pages miss people), then ask if still ambiguous.
5. Merging is a separate request — leave the MR open.
6. Reply in one or two lines: the MR URL, plus the "отстаёт — подтянуть?" question when the branch is behind. Target was a release branch → add one question: "сделать такой же MR в main?" (a hotfix usually has to reach main too).

## Variations

Updating an existing MR, MRs across several repos, or the same change into another branch: see [references/variations.md](references/variations.md).
