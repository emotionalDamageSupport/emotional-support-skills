# Evals

Scenario tests for `merge-request`, `pull`, `pull-push` and `push`: three scenarios per skill in [`evals.json`](evals.json), in the format from Anthropic's [skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#build-evaluations-first).

Each run builds a throwaway git setup — a bare `remote.git`, a working clone in the state the scenario needs, a colleague's clone where one is needed — and runs `claude -p` with the scenario's prompt in the clone. The checks read the result from git (commits, merge state, what reached the remote), from a fake `glab` that records its arguments and prints an MR URL, and from the final reply.

Runs are isolated: no MCP servers (`--strict-mcp-config`) and no user settings or hooks (`--setting-sources project,local`), so nothing reaches a real GitLab or GitHub.

## Run

Needs the `claude` CLI, `git`, `node`/`npm` and `perl`.

```bash
python3 evals/run.py                                        # all scenarios, default model
python3 evals/run.py --model claude-haiku-5-5 --model claude-sonnet-5-5
python3 evals/run.py --only pull-dirty-tree,push-on-target
python3 evals/run.py --baseline                             # same scenarios without the skills
```

Results go to `evals/results/<timestamp>/`, which git ignores: `summary.md` with one row per run, and per run its fixture, `transcript.jsonl` and `result.json` with every check.

## Adding a scenario

Add an entry to `evals.json`, then a branch for its id in `setup()` (the starting state) and in `checks()` (what must hold afterwards) in `run.py`. Check observable state — git, the remote, the fake `glab` log — and keep reply checks to what only the reply can show.
