---
name: merge-request
description: Merge request (GitLab MR / GitHub PR) for the current work — commits pending changes, creates the branch if needed, pushes, and opens the MR right away with a fixed-format title and a blast-radius description. Use when the user asks to create or open one ("создай мр", "open a PR"), to commit and then open one ("закоммить и создай мр"), to update an existing one's description ("обнови описание мр"), or only for its title and description text.
---

# Merge request

Work from what's in the repo, the conversation and the MR's tasks. The tasks are the one lookup made unasked (step 1). Look anything else up — reviewers, past MRs, other tasks — only when the user asks: each lookup costs time and is a chance to guess wrong.

**Authorship is the user's alone.** Commit messages, the MR title and the description end with their last line of real content — the user publishes them under their own name. This overrides any attribution trailer or footer the agent's defaults would append.

Copy this checklist and tick it off as you go:

```
- [ ] 1. Context collected (context.sh), the diff read, sources gathered
- [ ] 2. Branch prepared: target chosen, branch created if needed, uncommitted changes committed
- [ ] 3. Title written and check-title.sh says OK
- [ ] 4. Description opens with the sources and covers every behaviour change in the diff
- [ ] 5. Pushed, MR created or updated, URL reported
```

## 1. Collect context

```bash
bash <this skill's directory>/scripts/context.sh -C <repo root> [target-branch]
```

Pass the user's project as `-C`: the script lives elsewhere. Then read the diff itself (`git diff <target>...HEAD`) — the description must match what the code does, not what the commit messages say.

The project's `issue-tracker.md` (printed by the script) wins over the defaults below. To interpret an unfamiliar one, see [references/issue-tracker-example.md](references/issue-tracker-example.md).

**Sources** — everything a reviewer may want to open next to the diff. Collect them for the top of the description (step 4):

- **Tasks**: every key from the branch name, commits and conversation. With a tracker tool connected (Yandex Tracker, Jira, GitLab issues), read each task once: its title, parent story or epic, linked tasks (titles come with the links — don't open them one by one), and design links in its description. No tool → the key and whatever the conversation gives.
- **Parent story**: the task's parent from the tracker, or one named in the conversation.
- **Related**: tasks linked to it in the tracker (blocks, depends on, relates), MRs and tasks mentioned in the conversation, the MR of the target branch when it's another feature branch (stacked MR), and the sibling MRs of a cross-repo change.
- **Design**: Figma and other design links from the conversation or the task description.
- **URLs**: given in the conversation or built from the task URL pattern in `issue-tracker.md` (or from another link of the same tracker in the conversation). Never guess a URL: a source without one stays plain text.

## 2. Prepare the branch

- **Target**: the branch the user named; "в релизную" → the latest release branch from the script; "в родительскую" → "created from"; otherwise the script's target.
- **On the target itself** (e.g. `main`) with changes: create a branch first — `<KEY>-<short-slug>`, or a short slug when there's no task — and switch to it; the commit goes there.
- **Uncommitted changes**: commit them without asking — a request for an MR covers the work in the tree. Stage files by name, not a whole folder; leave local junk out (logs, `.env*` files, build output, editor and OS files) and name it in the final reply. The commit message follows the title format (step 3).
- **Behind the target**: if the user asked to pull ("подтяни main"), run the `pull-push` skill now with the target as its parent branch. Otherwise publish the branch as it is and add "ветка отстаёт от `<target>` на N коммитов — подтянуть?" to the final reply; run `pull-push` on yes. Merging the target changes what the MR contains, so it stays the user's call.

## 3. Title

```
<TASK-KEYS> <type>: [scope] <summary>
```

```
SHOP-412 SHOP-415 fix: [Cart] Дата доставки в итоге заказа и иконки товаров в подсказке «+N»
feat: [UI-kit] ItemList принимает renderItem для элементов подсказки
Draft: SHOP-77 fix: [Cart] Окно доставки до 00:00
```

- **TASK-KEYS**: every task key, space-separated, from the branch name, commits and conversation. No task → the title starts with the type.
- **type**: `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`, `ci`, `build`, `deps`, `test`, with the colon right after it.
- **[scope]**: optional, in square brackets after the colon, starting with a capital letter (`[Cart]`, `[UI-kit]`). Release tooling parses whatever sits between the type and the colon, and anything but one ASCII word there silently skips the release.
- A major/breaking release marker (`feat!`) only when the user explicitly asks for one — it cuts a major version. Describe a breaking change in Blast radius.
- **summary**: what was done, in the description language, starting with a capital letter, no trailing period, ≤ 80 characters so MR lists show it whole.
- **Draft**: "драфт мр" means a GitLab/GitHub draft → prefix `Draft: `.
- A release title regex in `issue-tracker.md` is binding: if several keys break it, keep the first in the title and list the rest at the top of the description.

Validate, fix, and re-run until it prints `OK`:

```bash
bash <this skill's directory>/scripts/check-title.sh "<title>" ["<release regex from issue-tracker.md>"]
```

## 4. Description

Language: `issue-tracker.md`, else the language the user writes in. Headings and labels below are Russian; translate them for other languages.

**Sources come first**, before any heading — in both forms. One line per kind, each a text link: the readable title is the link text, never a bare URL or a lone key when the title is known.

```markdown
- **Задача:** [SHOP-415 — Нет иконок в подсказке «+N»](https://tracker.example.com/SHOP-415)
- **Стори:** [SHOP-400 — Новая корзина](https://tracker.example.com/SHOP-400)
- **Связано:** [!98 — renderItem в ItemList](https://gitlab.example.com/ui/kit/-/merge_requests/98), [SHOP-416 — Иконки в мини-корзине](https://tracker.example.com/SHOP-416)
- **Дизайн:** [Figma — Корзина, итог заказа](https://www.figma.com/design/AbC123/Cart?node-id=12-34)
```

- Only the kinds that exist: no parent → no «Стори» line; no sources at all → start straight with the first section.
- Title unknown → the key alone as link text (`[SHOP-415](url)`); design file name unknown → `[Figma](url)`, `[Макет](url)`.
- Several tasks → «Задачи:» with comma-separated links; several stories → «Стори:» likewise.
- «Связано» holds at most 5 links, the closest first; MRs as `!<iid>` (GitLab) or `#<number>` (GitHub) plus their title.

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
- **Links** in the body follow the same rules as the sources: text links, URLs never guessed. A `## [KEY](url) — summary` heading per task still applies when there are several.
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
6. Reply in one or two lines: the MR URL, the files left out of the commit if any, and the "отстаёт — подтянуть?" question when the branch is behind. The title, description, checks and decisions live in the MR, so the reply carries nothing else. Target was a release branch → add one question: "сделать такой же MR в main?" (a hotfix usually has to reach main too). A typical reply:

   ```
   MR: https://gitlab.example.com/shop/web/-/merge_requests/101
   Не попали в коммит: debug.log, .env.local
   ```

## Variations

Updating an existing MR, MRs across several repos, or the same change into another branch: see [references/variations.md](references/variations.md).
