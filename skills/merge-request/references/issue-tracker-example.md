# Example `issue-tracker.md`

Put a file like this at `docs/agents/issue-tracker.md` (or `.agents/issue-tracker.md`, or the repo root) to tell the `merge-request`, `pull` and `pull-push` skills — and any other agent — how this project works. Every field is optional; anything missing falls back to the skills' defaults.

```markdown
# Issue tracker

- Tracker: Yandex Tracker, queue `SHOP`
- Task key: `SHOP-<number>`, taken from the branch name (`SHOP-412-short-slug`)
- Task URL: `https://tracker.yandex.ru/<KEY>`
- Code hosting: GitLab, project `shop/web/frontend` (id 10)
- Target branch: `main`; release branches: `RELEASE-YYYY-MM-DD*`
- MR description language: Russian

## MR title

Release tooling parses the squash commit with:
`^([A-Z]+-\d+\s)?(feat|build|ci|chore|deps|docs?|fix|perf|refactor)(\(\w+\))?:\s`
— so at most one task key in the title; extra keys go into the description.

## MR defaults

- squash: yes, remove source branch: yes
- assignee: the author

## Team

| Name | Username | GitLab id |
|---|---|---|
| Анна | a.petrova | 21 |
| Борис | b.ivanov | 22 |
```
