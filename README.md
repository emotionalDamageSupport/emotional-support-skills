# emotional-support-skills

Agent skills for the chores that cause emotional damage. Plain [Agent Skills](https://agentskills.io) — a folder with a `SKILL.md` — so they work in Claude Code, Codex, Cursor, Copilot, Gemini CLI, OpenCode and anything else that reads the format.

## Skills

| Skill | What it does |
|---|---|
| [`merge-request`](skills/merge-request/SKILL.md) | Commits if asked, then pushes and opens a GitLab MR / GitHub PR straight away, replying with its URL: `<TASK-KEYS> <type>: [Scope] <Summary>` title (scope and summary capitalised), a short description with links to tasks and sources, and a **Blast radius** section at the end. Offers `pull-push` when the branch is behind. |
| [`pull`](skills/pull/SKILL.md) | Merges the parent branch (main, release, or the branch it was cut from), resolves lockfile conflicts, then installs dependencies with the repo's Node version and package manager. |
| [`pull-push`](skills/pull-push/SKILL.md) | `pull` and then `git push` in one go, no intermediate confirmations. Used by `merge-request` when you ask to update the branch. |
| [`push`](skills/push/SKILL.md) | Pushes the current branch: sets the upstream on first push, never force-pushes, stops when the remote branch has moved. Used by `merge-request`. |
| [`blackbox-qa`](skills/blackbox-qa/SKILL.md) | Black-box QA of a feature against its requirements, through public APIs and the UI only, in the environment you name (isolated or shared): scenarios with evidence, a QA report and a verdict. Run it explicitly: `/blackbox-qa <requirements> <environment and URL> [access, timebox]`. |
| [`frontend-verify`](skills/frontend-verify/SKILL.md) | Frontend work against a reference: picks the design reference before editing, then checks the result in a browser (scenario, console, layout, texts and translations) and fixes what it finds. Run it explicitly: `/frontend-verify <task or change to check>`. |

`merge-request` pushes with `push`, or with `pull-push` when you ask to update the branch — install them together. `blackbox-qa` reads its design-review reference from `frontend-verify` — install them together too. Both run only when invoked (`disable-model-invocation`), since they are long procedures that small edits don't need; agents that ignore that field may still pick them up by description. `pull` and `pull-push` each carry their own copy of `scripts/install-deps.sh` so either works alone; edit both.

## Install

Pick one route per agent — installing twice gives you every skill twice.

<details open>
<summary><strong>Any agent</strong> (skills.sh, manual updates)</summary>

```bash
npx skills@latest add emotionalDamageSupport/emotional-support-skills
```

Add `-a <agent>` (`claude-code`, `codex`, `cursor`, `opencode`, …) to skip the prompt. Update with `npx skills@latest update`.

</details>

<details>
<summary><strong>Claude Code</strong> (plugin)</summary>

```bash
claude plugin marketplace add emotionalDamageSupport/emotional-support-skills
claude plugin install emotional-support-skills@emotional-support
```

</details>

<details>
<summary><strong>Codex</strong> (plugin)</summary>

```bash
codex plugin marketplace add emotionalDamageSupport/emotional-support-skills
codex plugin add emotional-support-skills@emotional-support
```

</details>

<details>
<summary><strong>GitHub Copilot</strong> (CLI)</summary>

```bash
copilot plugin marketplace add emotionalDamageSupport/emotional-support-skills
copilot plugin install emotional-support-skills@emotional-support
```

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

```bash
gemini skills install https://github.com/emotionalDamageSupport/emotional-support-skills.git --path skills
```

</details>

<details>
<summary><strong>From a clone</strong> (symlinks, updates with <code>git pull</code>)</summary>

```bash
git clone git@github.com:emotionalDamageSupport/emotional-support-skills.git
./emotional-support-skills/scripts/link-skills.sh
```

Links every skill into `~/.claude/skills` and `~/.agents/skills`.

</details>

## Script permissions

Skills ship small bash scripts (`skills/*/scripts/*.sh`) that read git state or run your package manager — nothing else. Strict permission modes (e.g. Claude Code auto mode) may block them as external code. Either allow them once — in Claude Code, a `permissions.allow` rule for the exact command your agent runs, such as `Bash(bash /Users/you/.claude/skills/pull/scripts/install-deps.sh:*)` — or let the agent take the manual fallback each `SKILL.md` describes.

## Per-project setup

Skills read `issue-tracker.md` from the project they run in (`docs/agents/`, `.agents/` or the repo root): tracker, task key format, task URL pattern, target and release branches, release title regex, MR defaults, team for reviewers. It's optional — see the [example](skills/merge-request/references/issue-tracker-example.md). The location matches [mattpocock/skills](https://github.com/mattpocock/skills), so its setup skill's file works here too.

## Layout

```
skills/<name>/SKILL.md       # one folder per skill, flat
skills/<name>/references/    # loaded only when the skill points to them
.claude-plugin/              # plugin + marketplace manifests (Claude Code, Codex, Copilot)
scripts/link-skills.sh       # local symlink install
```

Adding a skill: create `skills/<name>/SKILL.md` with `name` and `description` frontmatter (other fields aren't portable across agents; the only exceptions are Claude Code's `disable-model-invocation` and `argument-hint`, which other agents ignore), and add its path to `.claude-plugin/plugin.json`.

## Credits

The Blast radius section (door + radius) comes from [`pr`](https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md) by Matt Pocock, itself adapted from Humanlayer's `show-me`.
