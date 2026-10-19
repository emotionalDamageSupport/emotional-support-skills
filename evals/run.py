#!/usr/bin/env python3
"""Runs the scenarios from evals.json against real git fixtures and checks the result.

Each run gets a throwaway directory with a bare `remote.git`, a working clone and a fake
`glab` that records its arguments and prints an MR URL. The agent is `claude -p` with the
repo's skills in `.claude/skills` (or none with --baseline), no MCP servers and no user
settings, so nothing reaches a real GitLab/GitHub and no user hook fires.

python3 evals/run.py                         # every scenario, default model
python3 evals/run.py --model claude-haiku-4-5 --only pull-dirty-tree,push-on-target
python3 evals/run.py --baseline              # same scenarios without the skills
Results: evals/results/<timestamp>/ (summary.md, one result.json and fixture per run).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCENARIOS = {s["id"]: s for s in json.loads((REPO / "evals" / "evals.json").read_text())}
CHECK_TITLE = REPO / "skills" / "merge-request" / "scripts" / "check-title.sh"
MR_URL = "https://gitlab.example.com/shop/web/-/merge_requests/101"
TRAILER = re.compile(r"Co-Authored-By|Generated with|Claude-Session", re.I)
TITLE = re.compile(r"(?:Draft: )?(?:[A-Z][A-Z0-9]+-\d+ )+(?:feat|fix|refactor|perf|docs|chore|ci|build|deps|test)!?: [^\n`*]+")


# --- git helpers -------------------------------------------------------------

def sh(cwd, *cmd, check=True):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(f"{' '.join(map(str, cmd))} in {cwd}: {r.stderr}")
    return r.stdout.strip()


def git(cwd, *args, check=True):
    return sh(cwd, "git", *args, check=check)


def write(cwd, files):
    for name, text in files.items():
        p = Path(cwd) / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)


def commit(cwd, files, message):
    write(cwd, files)
    git(cwd, "add", "-A")
    git(cwd, "commit", "-q", "-m", message)
    return git(cwd, "rev-parse", "HEAD")


def identity(cwd, name="Dev", email="dev@example.com"):
    git(cwd, "config", "user.name", name)
    git(cwd, "config", "user.email", email)
    git(cwd, "config", "commit.gpgsign", "false")


def lock(version, extra=""):
    return (
        "{\n"
        '  "name": "shop-demo",\n'
        f'  "version": "{version}",\n'
        '  "lockfileVersion": 3,\n'
        '  "requires": true,\n'
        '  "packages": {\n'
        '    "": {\n'
        '      "name": "shop-demo",\n'
        f'      "version": "{version}"{extra}\n'
        "    }\n"
        "  }\n"
        "}\n"
    )


BASE_FILES = {
    "README.md": "# Shop demo\n",
    ".gitignore": "node_modules/\n",
    "src/delivery.js": "export function formatDeliveryDate(date) {\n  return date.toISOString().slice(0, 10);\n}\n",
    "src/cart.js": "export function itemIcons(items) {\n  return items.slice(0, 3).map((item) => item.icon);\n}\n",
    "package.json": '{\n  "name": "shop-demo",\n  "version": "1.0.0",\n  "private": true\n}\n',
    "package-lock.json": lock("1.0.0"),
    "docs/agents/issue-tracker.md": (
        "# Issue tracker\n\n"
        "- Tracker: Jira, project `SHOP`\n"
        "- Task key: `SHOP-<number>`, taken from the branch name\n"
        "- Task URL: `https://tracker.example.com/browse/<KEY>`\n"
        "- Code hosting: GitLab\n"
        "- Target branch: `main`\n"
        "- MR description language: Russian\n"
    ),
}


def base(root):
    remote, work = root / "remote.git", root / "work"
    git(root, "init", "-q", "--bare", "-b", "main", str(remote))
    work.mkdir()
    git(work, "init", "-q", "-b", "main")
    identity(work)
    commit(work, BASE_FILES, "chore: Initial project")
    git(work, "remote", "add", "origin", str(remote))
    git(work, "push", "-q", "-u", "origin", "main")
    git(work, "remote", "set-head", "origin", "main")
    return remote, work


def colleague_push(root, branch, files, message):
    other = root / "colleague"
    git(root, "clone", "-q", str(root / "remote.git"), str(other))
    identity(other, "Colleague", "colleague@example.com")
    git(other, "checkout", "-q", branch)
    sha = commit(other, files, message)
    git(other, "push", "-q", "origin", branch)
    return sha


def advance_main(work, n=1):
    git(work, "checkout", "-q", "main")
    for i in range(n):
        commit(work, {f"docs/changelog-{i}.md": f"Entry {i}\n"}, f"docs: Changelog entry {i}")
    git(work, "push", "-q", "origin", "main")
    return git(work, "rev-parse", "HEAD")


def remote_sha(root, branch):
    out = git(root / "remote.git", "rev-parse", "-q", "--verify", f"refs/heads/{branch}", check=False)
    return out or None


# --- fixtures ----------------------------------------------------------------

def setup(sid, root):
    remote, work = base(root)
    ctx = {}
    dirty_cart = "export function itemIcons(items) {\n  return items.slice(0, 5).map((item) => item.icon);\n}\n"

    if sid == "mr-text-only":
        git(work, "checkout", "-q", "-b", "SHOP-412-delivery-date")
        ctx["head"] = commit(work, {
            "src/delivery.js": (
                "export function formatDeliveryDate(date, timeZone = 'Europe/Moscow') {\n"
                "  return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(date);\n"
                "}\n"
            ),
            "tests/delivery.test.js": (
                "import { formatDeliveryDate } from '../src/delivery.js';\n\n"
                "const late = new Date('2026-03-01T22:30:00Z');\n"
                "console.assert(formatDeliveryDate(late) === '2026-03-02');\n"
            ),
        }, "SHOP-412 fix: [Delivery] Дата доставки в часовом поясе магазина")
        ctx["branch"] = "SHOP-412-delivery-date"

    elif sid == "mr-commit-and-create":
        git(work, "checkout", "-q", "-b", "SHOP-415-cart-icons")
        ctx["head"] = git(work, "rev-parse", "HEAD")
        write(work, {"src/cart.js": dirty_cart, "debug.log": "trace\n", ".env.local": "TOKEN=local-secret\n"})
        ctx["branch"] = "SHOP-415-cart-icons"

    elif sid == "mr-behind-target":
        git(work, "checkout", "-q", "-b", "SHOP-420-cart-total")
        commit(work, {"src/cart.js": BASE_FILES["src/cart.js"] + "\nexport const total = (items) => items.reduce((s, i) => s + i.price, 0);\n"},
               "SHOP-420 feat: [Cart] Итоговая сумма корзины")
        ctx["head"] = git(work, "rev-parse", "HEAD")
        advance_main(work, 2)
        git(work, "checkout", "-q", "SHOP-420-cart-total")
        ctx["branch"] = "SHOP-420-cart-total"

    elif sid == "pull-lockfile-conflict":
        git(work, "checkout", "-q", "-b", "SHOP-430-lock")
        commit(work, {"package-lock.json": lock("1.0.0", ',\n      "license": "MIT"')}, "chore: Lockfile license field")
        git(work, "push", "-q", "-u", "origin", "SHOP-430-lock")
        git(work, "checkout", "-q", "main")
        commit(work, {
            "package.json": BASE_FILES["package.json"].replace("1.0.0", "1.1.0"),
            "package-lock.json": lock("1.1.0"),
        }, "chore: Release 1.1.0")
        git(work, "push", "-q", "origin", "main")
        ctx["main"] = git(work, "rev-parse", "HEAD")
        git(work, "checkout", "-q", "SHOP-430-lock")
        ctx.update(head=git(work, "rev-parse", "HEAD"), branch="SHOP-430-lock")

    elif sid in ("pull-dirty-tree", "pullpush-dirty-tree"):
        git(work, "checkout", "-q", "-b", "SHOP-431-dirty")
        commit(work, {"README.md": "# Shop demo\n\nCart icons.\n"}, "docs: [Readme] Cart icons")
        git(work, "push", "-q", "-u", "origin", "SHOP-431-dirty")
        advance_main(work)
        git(work, "checkout", "-q", "SHOP-431-dirty")
        write(work, {"src/cart.js": dirty_cart})
        ctx.update(head=git(work, "rev-parse", "HEAD"), branch="SHOP-431-dirty", dirty=dirty_cart)

    elif sid == "pull-code-conflict":
        git(work, "checkout", "-q", "-b", "SHOP-432-conflict")
        feature = "export function formatDeliveryDate(date) {\n  return date.toLocaleDateString('ru-RU');\n}\n"
        commit(work, {"src/delivery.js": feature}, "SHOP-432 fix: [Delivery] Русский формат даты")
        git(work, "push", "-q", "-u", "origin", "SHOP-432-conflict")
        git(work, "checkout", "-q", "main")
        commit(work, {"src/delivery.js": "export function formatDeliveryDate(date) {\n  return date.toISOString().slice(0, 16);\n}\n"},
               "fix: [Delivery] Дата со временем")
        git(work, "push", "-q", "origin", "main")
        git(work, "checkout", "-q", "SHOP-432-conflict")
        ctx.update(head=git(work, "rev-parse", "HEAD"), branch="SHOP-432-conflict", feature=feature)

    elif sid == "pullpush-happy":
        git(work, "checkout", "-q", "-b", "SHOP-433-happy")
        commit(work, {"src/cart.js": dirty_cart}, "SHOP-433 feat: [Cart] Пять иконок в подсказке")
        git(work, "push", "-q", "-u", "origin", "SHOP-433-happy")
        ctx["main"] = advance_main(work)
        git(work, "checkout", "-q", "SHOP-433-happy")
        ctx.update(head=git(work, "rev-parse", "HEAD"), branch="SHOP-433-happy")

    elif sid in ("pullpush-remote-moved", "push-remote-moved"):
        branch = "SHOP-434-moved"
        git(work, "checkout", "-q", "-b", branch)
        commit(work, {"src/cart.js": dirty_cart}, "SHOP-434 feat: [Cart] Пять иконок в подсказке")
        git(work, "push", "-q", "-u", "origin", branch)
        ctx["colleague"] = colleague_push(root, branch, {"README.md": "# Shop demo\n\nColleague note.\n"}, "docs: [Readme] Colleague note")
        if sid == "pullpush-remote-moved":
            advance_main(work)
            git(work, "checkout", "-q", branch)
        else:
            commit(work, {"src/delivery.js": BASE_FILES["src/delivery.js"] + "\n// TODO: time zone\n"}, "chore: [Delivery] Time zone note")
        ctx.update(head=git(work, "rev-parse", "HEAD"), branch=branch)

    elif sid == "push-first-push":
        git(work, "checkout", "-q", "-b", "SHOP-440-copy-link")
        ctx["head"] = commit(work, {"src/link.js": "export const copyLink = (url) => navigator.clipboard.writeText(url);\n"},
                             "SHOP-440 feat: [Booking] Копирование ссылки")
        ctx["branch"] = "SHOP-440-copy-link"

    elif sid == "push-on-target":
        ctx["remote_main"] = git(work, "rev-parse", "HEAD")
        ctx["head"] = commit(work, {"README.md": "# Shop demo\n\nDirect change.\n"}, "docs: [Readme] Direct change")
        ctx["branch"] = "main"

    else:
        raise KeyError(sid)
    return work, ctx


# --- checks ------------------------------------------------------------------

def is_ancestor(cwd, a, b):
    return subprocess.run(["git", "merge-base", "--is-ancestor", a, b], cwd=cwd, capture_output=True).returncode == 0


def title_ok(title):
    return subprocess.run(["bash", str(CHECK_TITLE), title], capture_output=True, text=True).returncode == 0


def glab_calls(root):
    log = root / "glab.log"
    return [json.loads(l) for l in log.read_text().splitlines()] if log.exists() else []


def arg(argv, *names):
    for i, a in enumerate(argv):
        for n in names:
            if a == n and i + 1 < len(argv):
                return argv[i + 1]
            if a.startswith(n + "="):
                return a.split("=", 1)[1]
    return ""


def checks(sid, root, work, ctx, reply):
    c = []
    add = lambda name, ok, detail="": c.append({"check": name, "pass": bool(ok), "detail": detail})
    head = git(work, "rev-parse", "HEAD")
    status = git(work, "status", "--porcelain")
    merging = (work / ".git" / "MERGE_HEAD").exists()
    creates = [a for a in glab_calls(root) if a[:2] == ["mr", "create"]]
    branch = ctx.get("branch")

    if sid == "mr-text-only":
        add("not published", remote_sha(root, branch) is None and not creates)
        add("no new commits", head == ctx["head"])
        titles = [t.strip() for t in TITLE.findall(reply)]
        good = [t for t in titles if "SHOP-412" in t and title_ok(t)]
        add("title passes check-title", good, good[0] if good else f"found: {titles[:3]}")
        add("description sections", "Что сделано" in reply and "Blast radius" in reply)
        add("no attribution", not TRAILER.search(reply))

    elif sid == "mr-commit-and-create":
        files = git(work, "diff", "--name-only", f"{ctx['head']}..HEAD").split()
        msgs = git(work, "log", "--format=%B", f"{ctx['head']}..HEAD")
        first = git(work, "log", "-1", "--format=%s") if head != ctx["head"] else ""
        add("committed src/cart.js only", files == ["src/cart.js"], f"files: {files}")
        add("junk left uncommitted", "?? debug.log" in status and "?? .env.local" in status, status)
        add("commit title passes check-title", first and "SHOP-415" in first and title_ok(first), first)
        add("no attribution in commits", msgs and not TRAILER.search(msgs))
        add("pushed", remote_sha(root, branch) == head)
        t = arg(creates[0], "--title", "-t") if creates else ""
        d = arg(creates[0], "--description", "-d") if creates else ""
        tgt = arg(creates[0], "--target-branch", "-b") if creates else ""
        add("MR created with valid title", creates and "SHOP-415" in t and title_ok(t), t)
        add("MR description has Blast radius", "Blast radius" in d and not TRAILER.search(d))
        add("MR targets main", tgt in ("", "main"), tgt)
        add("reply has MR URL", MR_URL in reply)
        add("description not in chat", "Что сделано" not in reply and "Blast radius" not in reply)

    elif sid == "mr-behind-target":
        add("branch not merged", head == ctx["head"])
        add("pushed as is", remote_sha(root, branch) == ctx["head"])
        add("MR created", bool(creates))
        add("reply mentions behind", re.search(r"отста|behind", reply, re.I))
        add("reply has MR URL", MR_URL in reply)

    elif sid == "pull-lockfile-conflict":
        add("main merged", is_ancestor(work, ctx["main"], "HEAD"))
        markers = git(work, "grep", "-l", "^<<<<<<<", check=False)
        add("no conflict markers", not markers, markers)
        try:
            lk = json.loads((work / "package-lock.json").read_text())
            pk = json.loads((work / "package.json").read_text())
            ok = lk["version"] == pk["version"] == "1.1.0" and lk["packages"][""]["version"] == "1.1.0"
            add("lockfile valid and matches 1.1.0", ok, f"lock {lk.get('version')}, package {pk.get('version')}")
        except Exception as e:  # noqa: BLE001 - report any parse problem as a failed check
            add("lockfile valid and matches 1.1.0", False, str(e))
        add("working tree clean", not status and not merging, status)
        add("not pushed", remote_sha(root, branch) == ctx["head"])
        add("no attribution", not TRAILER.search(git(work, "log", "-1", "--format=%B")))

    elif sid in ("pull-dirty-tree", "pullpush-dirty-tree"):
        add("no merge", head == ctx["head"] and not merging)
        add("uncommitted change intact", (work / "src/cart.js").read_text() == ctx["dirty"])
        add("not pushed", remote_sha(root, branch) == ctx["head"])
        add("reply asks", "?" in reply)

    elif sid == "pull-code-conflict":
        text = (work / "src/delivery.js").read_text()
        add("no merge commit", head == ctx["head"])
        add("conflict not resolved by the agent", (merging and "<<<<<<<" in text) or (not merging and text == ctx["feature"]))
        add("reply names the file", "delivery.js" in reply)
        add("not pushed", remote_sha(root, branch) == ctx["head"])

    elif sid == "pullpush-happy":
        add("main merged", is_ancestor(work, ctx["main"], "HEAD"))
        add("pushed", remote_sha(root, branch) == head)
        add("working tree clean", not status, status)
        add("no attribution", not TRAILER.search(git(work, "log", "--format=%B", f"{ctx['head']}..HEAD")))

    elif sid in ("pullpush-remote-moved", "push-remote-moved"):
        tip = remote_sha(root, branch)
        kept = tip and is_ancestor(root / "remote.git", ctx["colleague"], tip)
        add("colleague's commit kept", kept)
        add("remote branch not overwritten", tip == ctx["colleague"], tip or "")
        add("reply reports the rejection", re.search(r"reject|отклон|non-fast-forward|fetch first|ушл|опереди|изменил|новы[йе] коммит", reply, re.I))
        if sid == "push-remote-moved":
            add("local branch not merged or rebased", head == ctx["head"])

    elif sid == "push-first-push":
        add("pushed", remote_sha(root, branch) == head)
        add("upstream set", git(work, "rev-parse", "--abbrev-ref", "@{u}", check=False) == f"origin/{branch}")
        add("no new commits", head == ctx["head"])

    elif sid == "push-on-target":
        add("remote main unchanged", remote_sha(root, "main") == ctx["remote_main"])
        add("reply asks", "?" in reply)
    return c


# --- runner ------------------------------------------------------------------

FAKE_GLAB = f"""#!/usr/bin/env python3
import json, os, sys
with open(os.environ["GLAB_LOG"], "a") as f:
    f.write(json.dumps(sys.argv[1:], ensure_ascii=False) + "\\n")
args = sys.argv[1:]
if args[:2] == ["mr", "create"]:
    print("{MR_URL}")
elif args[:2] == ["auth", "status"]:
    print("Logged in to gitlab.example.com as dev")
"""


def run_one(sid, model, baseline, out_dir, timeout):
    root = out_dir / f"{sid}--{'baseline' if baseline else 'skills'}--{model}"
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    work, ctx = setup(sid, root)
    if not baseline:
        shutil.copytree(REPO / "skills", work / ".claude" / "skills")
    # Installed skills are not part of the user's repo: keep them out of `git status`.
    with open(work / ".git" / "info" / "exclude", "a") as f:
        f.write(".claude/\n")
    (root / "bin").mkdir()
    (root / "bin" / "glab").write_text(FAKE_GLAB)
    (root / "bin" / "glab").chmod(0o755)

    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    env.update(PATH=f"{root / 'bin'}:{env['PATH']}", GLAB_LOG=str(root / "glab.log"), IS_SANDBOX="1")
    cmd = ["claude", "-p", SCENARIOS[sid]["query"], "--model", model, "--output-format", "stream-json", "--verbose",
           "--max-turns", "30", "--dangerously-skip-permissions", "--setting-sources", "project,local",
           "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}']
    started = time.time()
    try:
        out = subprocess.run(cmd, cwd=work, env=env, capture_output=True, text=True, timeout=timeout).stdout
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode() if isinstance(e.stdout, bytes) else (e.stdout or "")
    (root / "transcript.jsonl").write_text(out)

    reply, used, tools = "", set(), []
    for line in out.splitlines():
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "result":
            reply = ev.get("result") or reply
        for c in (ev.get("message") or {}).get("content") or []:
            if isinstance(c, dict) and c.get("type") == "tool_use":
                tools.append(c["name"])
                blob = json.dumps(c.get("input", {}), ensure_ascii=False)
                for name in ("merge-request", "pull-push", "pull", "push"):
                    skill = c["input"].get("skill", "") if c["name"] == "Skill" else ""
                    if skill == name or skill.endswith(":" + name) or f"skills/{name}/SKILL.md" in blob:
                        used.add(name)
    result = {
        "scenario": sid, "model": model, "baseline": baseline, "seconds": round(time.time() - started),
        "skills_used": sorted(used), "tool_calls": len(tools), "reply": reply,
        "checks": checks(sid, root, work, ctx, reply),
    }
    result["passed"] = sum(c["pass"] for c in result["checks"])
    result["total"] = len(result["checks"])
    (root / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    mark = "PASS" if result["passed"] == result["total"] else "FAIL"
    print(f"[{mark}] {result['passed']}/{result['total']} {sid} ({'baseline' if baseline else 'skills'}, {model}, {result['seconds']}s)", flush=True)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", action="append", help="repeat for several models (default: claude-opus-5-5)")
    ap.add_argument("--only", help="comma-separated scenario ids")
    ap.add_argument("--baseline", action="store_true", help="run without the skills")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--timeout", type=int, default=600, help="seconds per run")
    args = ap.parse_args()
    models = args.model or ["claude-opus-5-5"]
    ids = args.only.split(",") if args.only else list(SCENARIOS)
    unknown = [i for i in ids if i not in SCENARIOS]
    if unknown:
        sys.exit(f"unknown scenarios: {unknown}")
    out_dir = REPO / "evals" / "results" / f"{time.strftime('%Y%m%d-%H%M%S')}-{'baseline' if args.baseline else 'skills'}"
    out_dir.mkdir(parents=True, exist_ok=True)
    jobs = [(i, m) for m in models for i in ids]
    with ThreadPoolExecutor(args.workers) as ex:
        results = list(ex.map(lambda j: run_one(j[0], j[1], args.baseline, out_dir, args.timeout), jobs))

    lines = ["| Scenario | Model | Mode | Checks | Skills used | Failed checks |", "|---|---|---|---|---|---|"]
    for r in results:
        failed = "; ".join(c["check"] for c in r["checks"] if not c["pass"]) or "—"
        lines.append(f"| {r['scenario']} | {r['model']} | {'baseline' if r['baseline'] else 'skills'} | "
                     f"{r['passed']}/{r['total']} | {', '.join(r['skills_used']) or '—'} | {failed} |")
    total = sum(r["passed"] for r in results), sum(r["total"] for r in results)
    lines.append(f"\nTotal: {total[0]}/{total[1]} checks")
    (out_dir / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nResults: {out_dir}")


if __name__ == "__main__":
    main()
