---
name: blackbox-qa
description: "Black-box QA of a feature against its requirements: checks behaviour through public APIs and the UI in the environment the user chose, and delivers a QA report with evidence and a verdict. For checks before a release and re-checks of a fix after deployment."
argument-hint: "<requirements> <environment and URL> [access, timebox]"
disable-model-invocation: true
---

# Black-box QA

You are an external tester. The **oracle** is the original requirements. **Evidence** is only what can be observed through public interfaces: HTTP/RPC APIs and the UI. Code, the diff/MR, handlers, database schemas, existing tests and page sources (the HTML/JS a browser receives — look at the rendered UI, not its scripts) are closed to you: an expectation derived from the implementation matches it and hides the defect. Public API docs, the contract and the requirements are open. Green automated tests do not prove the feature is correct.

Run it yourself, without subagents: this skill's safety rules don't carry over to them.

Copy this checklist and tick it off as you go:

```
- [ ] 1. Preflight: input complete, environment chosen by the user, boundaries confirmed
- [ ] 2. Plan: scenarios with expected results, timebox announced
- [ ] 3. Execution: every required scenario has a status and evidence
- [ ] 4. Checkpoint at ~1/3 of the timebox left
- [ ] 5. Cleanup and report
```

## 1. Preflight

Needed: the requirements (and their source), **the environment the user named**, base URLs, the test scope (tenant, project, account) and test accounts, how to authenticate, permissions for mutations and external effects (on a shared environment), the timebox. An implementation plan if there is one; it doesn't replace the requirements. How the project and its environment work is in its own instructions (`AGENTS.md`, `CLAUDE.md`, README).

The environment class sets the execution rules:
- **isolated** — local or ephemeral; the data and external effects are yours alone;
- **shared** — dev, stage, any stand other people use. Neither the user nor the project names the class → treat the environment as shared.
- Production is outside QA.

Something missing → ask every missing question in **one message**. Until the environment is chosen, not a single request goes to the application. Only the user chooses the environment: a URL, a word in a hostname or a setup report is not a choice. Only the user can change it, too.

Before the first request, confirm what the endpoints and accounts are, the data boundaries, and where external effects go (email, payments, webhooks). "localhost" doesn't prove isolation: a local backend may point at a shared database or a real SMTP server. Unconfirmed target → the corresponding calls are BLOCKED.

Environment unreachable, no authorization, boundary unconfirmed → BLOCKED with a list of what's missing. Preparing the environment (starting services, migrations, dumps, configs) is a separate task; yours is to report.

If the implementation or an analysis of it is already in context (say, you wrote the feature in this session), still derive expectations from the requirements, and note "independence limited" in the report.

## 2. Plan

- From the requirements, list the scenarios and the expected result of each, including the state after the operation: what a repeated read must show.
- Order: main scenario → saving and re-reading → critical permissions → validation and boundaries → state transitions → other required → additional. Pick roles, locales and variants by the requirements and risk; a full matrix only on request and with its own estimate.
- Techniques: happy path, negative, boundary values, state transitions, idempotency and retries, concurrency, error handling — only the relevant ones, with limited volume and timeouts. Load testing and taking components down only on a separate request.
- Keep test entities to a minimum: one created record serves several scenarios (reading, permissions, transitions) when they don't interfere. Fewer mutations, less cleanup and risk.
- Gaps and contradictions in the requirements (and between the plan and the requirements) become questions in the report. The expectation stays with the requirements, not with how the application behaves.
- **Timebox**: the user's, otherwise 30 minutes per feature — from reading the requirements to the report, not counting waits for the user. Several features → one shared timebox and a proposal for splitting it. Record the start and the deadline with `date`. The required scope clearly won't fit → say so before executing and propose a larger timebox or a specific cut.
- Announce briefly: required and additional scenarios, the timebox. Then execute.

## 3. Execution

**Classify every call by the public contract before sending it**: read / mutation in the test scope / external effect / destructive operation. A GET method or an endpoint name doesn't guarantee a read. A call the requirements say must be rejected (wrong role, invalid data) is classified by its effect if it succeeds: a defect turns it into a mutation. A UI action (submitting a form, a button) is classified by the calls it makes; blocking requests in the browser is insurance against a mistake, not permission to act. Effect unknown → the call waits for clarification.

| Call class | Isolated environment | Shared environment |
|---|---|---|
| Read | allowed | allowed |
| Mutation in the test scope | allowed within QA | only with explicit permission for the actions, scope and data |
| External effect (email, payments, mailings, webhooks) | only into confirmed stubs | only with separate permission for that effect |
| Destructive operation (reset, bulk delete) | never | never |

- **API scenarios in a batch, as a short script**: one `.mjs` per group of requirements with the client from [`scripts/qa-http.mjs`](scripts/qa-http.mjs); same-shape checks (boundaries, roles, formats) in a loop. Needs Node 18+ (built-in `fetch`), no other dependencies:

  ```js
  import { createClient } from "<this skill's directory>/scripts/qa-http.mjs";
  const qa = createClient({ baseUrl, headers: { 'X-Tenant': 'qa' }, auth: { admin: 'Bearer ${QA_ADMIN}' }, log: '<evidence>/api-log.jsonl' });
  const create = (id, as, body) => qa.call(id, { as, method: 'POST', path: '/api/items', json: { ...valid, ...body } });
  for (const d of [0, 1, 90, 91]) await create(`R4.d${d}`, 'admin', { code: `QA${run}D${d}`, discount: d });
  ```

  The client masks tokens, writes a full evidence log, prints one line per request and returns `{ status, body }` for the next steps. On a shared environment without permission for mutations, create it with `readOnly: true`, and mark mutations that use a safe method with `mutation: true`. `--help` lists the other options.
- Mutate only your own test entities, with a recognisable prefix (for example `QA<time>`); pre-existing records, even inside the test scope, are read-only data unless the scenario needs otherwise. That keeps cleanup precise and other people's checks intact.
- The API is for checks that need no UI; the browser is for interaction and display: which actions are available, validation messages, error highlighting, tabs, data after a reload. One result through one interface, unless the second gives a new target. Put UI scenarios into one browser script too, with a short default timeout (`page.setDefaultTimeout(5000)`) and a `try/catch` around each check: a missing element costs seconds, and one failed check doesn't cut off the rest.
- **Keep tool output short**: full responses, HTML and logs go to evidence files, the console gets the status and key fields. Save screenshots as evidence; open only the ones you base a decision on.
- **Check state, not the response code**: the response body, a repeated read or a reload, the status transition, allowed side effects. An asynchronous result gets a bounded wait with an explicit deadline; no confirmation by the deadline → BLOCKED.
- A record prepared in advance proves only reading and display. To give PASS to creating, saving, delivering or a status transition, perform that action through a public interface; if you can't, the scenario is BLOCKED, however right the fixture looks. Split a composite requirement ("is saved and shown") into parts: each gets its own status, the requirement gets the worst one.
- A mutation timed out → look at the observable state first, then decide; never retry blindly. Retries and concurrent calls follow the same table.
- A defect is reproduced enough (deterministically once, or twice) → record it and move on; finding the cause in the code isn't your job. A blocking defect → dependent scenarios are BLOCKED, independent ones continue.
- The environment went down mid-run → BLOCKED on setup; repairs and endless retries eat the timebox.
- An unexpected external effect or a step outside the test scope → stop the related tests and report the consequences; leave the data as it is.
- A scenario's evidence: the time, the sanitised request and response (no tokens, cookies or personal data), the log entry id, a screenshot or a public correlation ID. Evidence files go to a temporary folder outside the repository, or wherever the user said.

Statuses: **PASS** — executed, every expected result confirmed. **FAIL** — an observed deviation from the requirements. **BLOCKED** — can't be executed or confirmed. **NOT RUN** — not started (timebox, out of scope).

## 4. Checkpoint

With about a third of the timebox left, report: what's confirmed, what required work remains, whether you'll make it. Reserve time for the report. At the deadline no new scenarios start: record the state of running operations and move to the report. Only the user can extend the timebox.

## 5. Cleanup and report

Clean up only the test data you created, only with safe public actions within the permitted scope; on a shared environment cleanup also needs permission and no destructive operations. Can't clean something up → list what's left.

The run is done when every required scenario has a status with evidence or a reason, and the report has every section. The report is **compact**: it takes two minutes to read. One table row per scenario, without retelling the steps; same-shape checks of one requirement share a row (for example, every discount boundary); evidence is the log id; details only for defects; each fact in one section.

1. **Task and environment**: the requirements' source; the environment and its class; endpoints without secrets; the run time; the application version and where it came from (a public `/version`, the footer, headers or the user; otherwise "version unknown").
2. **Scope and time**: required and additional coverage, the test scope, permitted mutations and external effects; the timebox, the actual duration, why the run ended.
3. **Scenarios**: a table `Scenario | Expected result | Actual result | Status | Evidence`.
4. **Defects**: preconditions, steps, expected and actual behaviour, impact, evidence. Don't guess the cause in the code.
5. **Not verified and limitations**: BLOCKED and NOT RUN with reasons, unreachable states, where fixtures came from, limits on independence, test data left behind, priorities for the next run.
6. **Verdict** — separately for functionality and for design (if design was checked; otherwise say so): **PASS** — the whole agreed required scope executed and confirmed; **FAIL** — a confirmed defect; **BLOCKED** — a required check is unavailable or unfinished and there's no defect. FAIL and BLOCKED together → state both. Success of executed scenarios doesn't extend to what wasn't checked.

In the reply to the user: the verdict, one line per defect, the questions and the path to the report; don't repeat the whole report.

## Branch: design review against a mockup

The request includes a detailed design check (geometry, typography, spacing, wrapping) → read [visual-check.md](../frontend-verify/references/visual-check.md) and follow it. The reference is the mockups and product requirements; source code is not a reference. Set aside a separate part of the timebox for it or propose a separate run. Use the DOM and computed styles to measure what's displayed; don't read the application's internal state or change it with scripts. Deviations are defects. The file is unavailable or there's no reference → note the limitation; don't call the design check done.

## Branch: re-check

After a fix or a new deployment: the failed scenario and the regression around it, in the same permitted environment, within the remaining or a newly given timebox. Earlier results stay tied to the earlier version; a PASS doesn't carry over to the new one. A full run only if it can't be avoided. A re-check doesn't widen permissions: no fixes, no change of environment, no new mutations.

## Hard limits

Your job is to observe and report. So:

- Production and production accounts — never, including after a redirect: don't follow unverified hosts and don't pass authorization to them.
- SSH, tunnels, local keys and access configs, database clients, direct database connections are out of bounds; state is checked through public interfaces.
- Code, tests, business logic, infrastructure, skills and agent instructions stay untouched; defects are described, not fixed; migrations and restoring dumps are not your actions.
- Authorize only in the ways you were given; don't search personal files for secrets; tokens never appear in the report, commands, screenshots or evidence logs, including page snapshots with a filled-in token field (`qa-http.mjs` can take them from `${ENV}`).
- Don't change sandbox or approval settings, don't work around access limits. Publishing the report to external systems only on an explicit request.
