---
name: frontend-verify
description: "Frontend work against a reference: picks the design reference before editing, then checks the result in a browser (scenario, console, layout, texts and translations) and fixes what it finds. For new screens and noticeable frontend changes, and on a request to check the frontend."
argument-hint: "<task or change to check>"
disable-model-invocation: true
---

# Frontend: reference → implementation → check

The skill is invoked at the start of a task — then the reference is chosen before the first edit — or on a finished change: then it is a check that brings the change up to the reference (steps 1, 2, 4–7). The final check always comes after the last write and formatting. Tell the user in one line which reference you chose.

**Autonomous mode** — the user said not to wait for answers. Then every "agree" and "ask" below becomes "pick the default and record it under «Decisions» with the reason": the default is named in the rule, and where it isn't, take the option closest to the design system. Work goes on.

Copy this checklist and tick it off as you go:

```
- [ ] 1. Setup: project instructions, commands, initial git status
- [ ] 2. Reference and texts fixed before editing; for a finished change, a "before" measurement from the browser saved
- [ ] 3. Implementation within the feature; disputed values agreed or recorded under «Decisions»
- [ ] 4. Code checks passed, formatting done, other files untouched
- [ ] 5. After the last write: reload, scenario, console and requests
- [ ] 6. Visual check per references/visual-check.md
- [ ] 7. Result
```

## 1. Setup

Find the working checkout (or the worktree the work happens in) and its instructions: `AGENTS.md`, `CLAUDE.md`, README, `Makefile`, the scripts in `package.json`. They are the source of truth on how the project is linted, tested, formatted and run, on its design system, locales and supported widths. Find the command for each role and keep the gotchas in mind:

- **lint and type checks** — required before handing over, if the project requires them;
- **tests for the changed files** — "no tests found" means "no coverage", not "passed";
- **formatter** — usually rewrites files outside your change too (see step 4);
- **dev server for the affected entry point** — take the actual URL from its output; it may proxy the API to an external backend.

Record the initial `git status` to tell the user's changes from yours. Leave dependencies, environment resets and setup commands as they are; if you can't do without them, explain the established reason and ask for permission. Storybook and similar tools only on a direct request.

## 2. Reference and texts — before editing

**Reference.** The user gave a mockup → that's the reference. Otherwise find an existing screen or component of the same kind in the project (form, table, modal, panel, card) and study its code and how it looks in the app. Checking a finished change → the reference comes first too, and before editing measure the current state in the browser: those values are the evidence for the deviations you find. Take spacing, widths, sizes and flex/grid rules from the reference through the project's shared components and design-system tokens. Deviate only where the task requires it, and explain; don't copy obvious defects of the reference. No reference exists or the sources contradict each other → ask only for the missing design decisions and continue the independent work.

**Texts.** Collect block titles, field labels, button labels, hints and messages from the mockup and the task's documentation. Use them verbatim: a synonym changes the terminology. A business-logic description helps pick a term but isn't necessarily UI text itself. The mockup and the docs disagree → show the user both versions with exact locations; follow the priority they already chose, otherwise agree on the text before fixing it (in autonomous mode, the source that defines UI text specifically, usually the mockup). Write your own wording only when no source defines the element's text: use the app's terminology and existing translation keys. Other locales keep the source's meaning and terms.

## 3. Implementation

- Within the feature, bring the implementation up to the mockup. Standard design-system components keep their standard styling and sizes without separate agreement.
- **Disputed value** — there's no standard component, and a spacing or size falls off the grid (an odd value, say). Check tokens and similar screens first: being odd isn't an error by itself. Still in doubt → show the user the spot, the mockup's value and the design-system option; agree before implementing that value and continue the independent parts (in autonomous mode, the design-system option). A value silently copied or rounded is exactly what this rule prevents.
- **Boundaries**: describe deviations of other page elements from the mockup (element, expected and actual look, where it shows, a screenshot), but don't fix them without a request — the same page doesn't widen the scope. Fix a regression your change caused.
- Add tests unasked only for substantial calculations, transformations and validation; tests for markup and display states on request.

## 4. Code checks and final writes

- Run the required checks from the project's instructions; after fixes, re-run only the affected ones.
- The formatter is the last write. Then compare `git status`/`git diff` with the initial state: revert the formatter's edits in files outside your change one by one (its hunks only) and keep the user's edits. A bulk reset/checkout destroys the user's work. If the formatter would change only files outside your change, a check-mode run over the same files is enough — note it in the result.
- Any write after this step takes you back to step 5, starting with a reload.

## 5. Check in the app

Reuse the running dev server and tab if they belong to this checkout. Otherwise start the needed entry point and take the actual URL from the server's output; check the backend's availability separately and don't print secrets from env. Route and access conditions come from the router and the screen's code. Use real data; mocks only with an explicit note to the user. The backend may be external: creating, deleting and notifications need permission; without it, check the steps up to the write and mark the boundary.

After the last write:

1. Reload the page and wait for the right screen.
2. Walk the main changed scenario and the edge states available in the data. A form → the applicable validation; an interactive change → the interaction itself, not just the element's presence.
3. Read the console and failed requests; separate new errors from background ones. No tool for reading the console → say so: "console not checked".
4. Show the user the checked screen; a screenshot when it helps judge the change.

Collect the scenario, console and measurements in one browser script per run, not step by step. In the script, set a short default timeout (`page.setDefaultTimeout(5000)`) and a `try/catch` around each check: a missing element costs seconds, and one failed check doesn't cut off the rest. Keep the output short: details go to artifact files, the console gets the summary. Save screenshots; open the close-up of the affected block, and the full screen only when you need the overall view.

No authorization, backend or data → run the independent checks and name the scenario left unchecked. A successful build is not a visual check.

## 6. Visual check

Read [references/visual-check.md](references/visual-check.md) and follow it; measure with the bundled `scripts/measure.mjs` (all widths and URLs in one run, screenshots, console; needs Playwright from the project or installed globally) or `scripts/measure-snippet.js` (inside an open tab), not with a new script. Fix the deviations in the change being checked — both your own and a finished change the user asked you to check (a request to check the frontend includes bringing it up to the reference); describe unrelated ones separately. After fixes and formatting, step 5 again and a repeat of the affected check. A known unfixed deviation in the change being checked is acceptable only with an explained limitation.

## 7. Result

The task is done when every checklist item is done or marked blocked with a reason, and the last browser check came after the last write to files. Report briefly, one line per item:

- what changed;
- which code checks ran and their results;
- which scenarios and states were checked in the app;
- the reference; the window sizes used for comparison; measured values for disputed spots;
- **Decisions**: disputed values and text conflicts — what was chosen and why;
- limitations and what wasn't checked (no reference → design conformance not confirmed); unrelated deviations;
- a link to the tab or file, if available.

Leave someone else's server running; stop your own temporary process if it isn't needed to view the result.
