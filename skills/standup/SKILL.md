---
name: standup
description: "Standup message for the team sync — collects the last working day across every repo the user commits to (git, tracker, GitLab, wiki, agent session history) and writes a ready-to-paste «Вчера / Сегодня» message where each piece of work links to its task, MR or page. Run it explicitly: /standup [date | вчера | пятница]."
argument-hint: "[YYYY-MM-DD | вчера | пятница] — default: the last working day"
disable-model-invocation: true
---

# Standup

Collect the last working day and write a ready-to-paste message for the team sync.

Argument: `$ARGUMENTS` — empty means pick the window yourself (step 2). An agent that doesn't substitute `$ARGUMENTS` takes the argument from the user's message.

Read-only: nothing is posted anywhere and no file is saved unless the user asks.

## Identity

Filter commits by the **author name**: `git config --global user.name`, or the name the user gives. Not by email: one person usually commits under several addresses (work, old work, personal), and an address may hide a lookalike letter — a Cyrillic `с` in a Latin name — that defeats a string filter. The full name catches every variant.

Never shorten the name: a colleague with the same first name gets caught by `--author="<first name>"`. If a name in the log starts the same but isn't the user's, leave it out and keep the full-name filter.

## 0. Find the repos

Work is spread over many repos — frontend, ui-kit, mobile, widgets, tools, services. One repo is always an incomplete report. Don't keep a list; search every time:

```bash
find <workspace> -maxdepth 2 -name .git -type d 2>/dev/null | sed 's|/.git$||'
```

`<workspace>` is the folder the user named, else the parent of the current repo. Add the current directory if it's a git repo and not in the list yet. Then drop the repos with no commits of the user's in the window — usually 1–3 are active. Check with a cheap `git -C <repo> log --since=… --until=… --author=… --pretty=%h | wc -l`, not a full collection.

**Project conventions** — tracker, task key format, task URL pattern, git host — come from `issue-tracker.md` in the active repos (`docs/agents/`, `.agents/` or the repo root; often only the frontend has one). None found → the tracker tool's own URLs and a generic key pattern `[A-Z][A-Z0-9]+-\d+`.

## 1. Bring up the MCP servers

Do it before collecting — otherwise the report quietly comes out of git alone.

1. Load the deferred tool schemas in one ToolSearch call: tracker (`issues_find`, `issue_get`, `issue_get_url`, `issue_get_changelog`, `issue_get_comments`, `issue_get_worklogs`, `user_get_current`), GitLab (`list_merge_requests`, `get_merge_request_notes`, `list_events`, `whoami`), wiki (`Search`, `GetPageDetails`), sessions (`list_sessions`, `search_session_transcripts`, `get_session`).
2. Probe each server with one cheap call: tracker → `user_get_current`, GitLab → `whoami`, wiki → `Search` with any word. An answer means it works.
3. A server that doesn't answer or asks for authorization — **say so and never make up its data**. Name the server and how to bring it back: connectors on claude.ai, or `claude mcp` / `/mcp` in an interactive terminal. Collect from what's available and note the gap in the footnote.
4. Never type tokens, codes or callback URLs yourself, and never ask the user for them.

## 2. Pick the window

Get today's date from `date`; don't guess it.

- Argument given → use it.
- Today is Monday → Friday 00:00 — Sunday 23:59, label «В пятницу».
- Otherwise → yesterday, label «Вчера».
- No activity in the window at all (vacation, holiday, sick leave) → widen it one day back at a time until there is some, at most 7 days. The label is then the date: «В понедельник, 1 сентября».

## 3. Collect the facts

Call the sources in parallel, in one block.

**git — per active repo:**

```bash
git -C <repo> log --all --since="<start>" --until="<end>" --author="<full name>" \
    --pretty=format:'%ad|%h|%d|%s' --date=iso
git -C <repo> reflog --date=iso      # what was actually worked on: checkouts, rebases, resets
git -C <repo> status                 # unpushed WIP is work too
```

**Tracker:** tasks the user changed in the window (statuses, comments, worklogs), and `issue_get` on every task key found in git — for the human title, the parent and the URL.

**GitLab:** the user's MRs in every active repo — created, updated, merged, closed. Plus **reviews of other people's MRs**: comments and approvals in the window. Git doesn't show them, and for the team they're a result.

**Wiki:** pages the user created or edited in the window.

**Agent session history** (`list_sessions` → `search_session_transcripts` / `get_session`): what was debugged and how it ended, decisions made, where work got stuck, what was postponed. Neither git nor the tracker has this; it matters most for «Сегодня». Skip discussions that led nowhere.

**URLs** for everything that may end up in the message: the task (`issue_get_url`, or the pattern from `issue-tracker.md`), the MR (`web_url`), the wiki page, design links from the task or the sessions. Take them from the tools; never build one by guessing.

## 4. Find the topic of each piece of work

Look for the task key along this chain, stop at the first hit:

1. the branch name (`SHOP-412`, `SHOP-412-safe-area`, `SHOP-412-f`);
2. the commit title (`SHOP-412 fix: persist guest map...`);
3. the MR for that branch — its title, description, linked task;
4. no key at all (mobile branches are often descriptive, `feat-add-safe-area-plugin-1`) → find the commit's branch with `git -C <repo> branch -a --contains <sha>` (dropping `main`/`origin/main`), group by it and take the topic from its name.

The same topic often runs in parallel in several repos under different names: `SHOP-412-safe-area` in the frontend and `feat-add-safe-area-plugin-1` in mobile are one piece of work. Merge by meaning, not only by a matching key.

**Don't trust commit titles**: a good share of them are `f`, `fix`, `wip`, `.`. Such a commit only means "I was on this branch" — take the topic from the branch and the task, not from the text.

## 5. Collapse into items

- Group **by task, not by repo or commit**. One task spread over frontend, ui-kit and mobile is **one item**. Mention a repo only when it matters ("вынес в ui-kit", "в мобилке через плагин").
- Several tasks of one product or epic done the same day → **one item** that opens with the product and names each result with its own link: «Почти весь день сидел на Кассе. Чек теперь [делится по гостям](…), а скидки [считаются после сервисного сбора](…).»
- The wording comes from the task's summary, rephrased into a sentence. No tracker → the most meaningful commit or the branch name, never a service commit.
- Drop the noise: merge commits, `style:`, `chore:`, formatting, import fixes, rebases. There are many of them, but they don't make an item.
- Work without a task (`docs: document Makefile targets`) → its own item, or a line «по мелочи».
- **No process statuses**: "влито в релиз и в main", "задача решена", "на тестировании", "MR ещё не открыт", "ветка запушена", "передал в тестирование", package versions. They tell you what happened; they don't go into the text. An item that was only a status change is dropped.
- A short note is fine when it changes what the team expects: «бэк уже готов», «завтра уходят в тест», «пока бэк не готов, работаю на моках».
- Write the **action**, first person, past tense: «сделал», «поправил», «довёл», «принял», «расписал», «декомпозировал», «начал смотреть». Unfinished → «в процессе», «пока локально».
- Cut implementation details: «поправил скролл», not «добавил скролл через ScrollableV2»; no sizes, minor props, permission details. ui-kit component names may stay.
- Split a long item: a separate part in another service (a new endpoint in the gateway) gets its own line.
- Russian, to the point, no bureaucratese, no file lists. An item is what a backend developer and a manager understand, not a diff. Usually 4–8 items; more means it isn't collapsed enough.

## 6. Links

The message carries links, not task keys:

- Each task, MR, wiki page or design in the text is a **text link on the phrase that names the result** — 2–6 words from the sentence: «Дубль позиции теперь [проверяет обязательные модификаторы](…)», «Довёл фронт [новых пресетов периодов](…)».
- No keys in the text (`SHOP-412`), no bare URLs, no «тут» / «ссылка», never the whole sentence as a link, never the product name alone.
- Target: the task in the tracker; a review or work without a task → the MR; docs → the wiki page; a design acceptance → its task, else the design file.
- Several tasks in one item → several links, each on its own phrase.
- URL unknown → the phrase stays plain text; name it in the footnote.

## 7. «Сегодня»

The user's plan for the day, not a tracker export. Short lines in the present tense with links where there's a task: «Вливаю [пресеты периодов](…): завтра они уходят в тест», «Начинаю [логи для виджетов](…)», «Проверяю вчерашние задачи на устройстве».

Topics come only from yesterday's unfinished work: uncommitted WIP, branches without an MR, MRs waiting to be merged, loose ends from the session history. Nothing made up beyond that. Usually 2–6 lines.

Not in the message: tracker tasks "in progress" the user didn't touch yesterday, "жду результатов теста", "на меня назначен баг", MRs waiting for the user's review, lists of open questions. If there are any, mention them in the footnote, one line each — the user decides.

Meetings (1:1s, calls) the user adds by hand — remind them in the footnote.

## 8. Output

First the message itself, ready to copy, in a code block, in exactly this shape:

```markdown
Всем привет!
**Вчера:**
- ...
- ...

**Сегодня:**
- ...
```

The label is «Вчера:», «В пятницу:» or «В <день>, <дата>:». Items are sentences: capital letter, full stop at the end.

A reference for tone and length (made-up products and URLs):

```markdown
Всем привет!
**Вчера:**
- Почти весь день сидел на Кассе. Чек теперь [делится по гостям](https://tracker.example.com/SHOP-412), а если терминал отклоняет оплату, официант видит [понятную причину](https://tracker.example.com/SHOP-418). Настройки зала теперь [хранятся на бэкенде](https://tracker.example.com/SHOP-421) и сохраняются после выхода из аккаунта.
- Продумал [историю заказов гостя](https://tracker.example.com/SHOP-430) и завёл по ней задачи на бэк и мобилку. Начал делать мобилку.
- Довёл фронт [фильтра по датам в отчётах](https://tracker.example.com/SHOP-402), бэк уже готов.
- Принял [компонент Drawer](https://tracker.example.com/UI-77) в ui-kit, отписал всё в задачу по разработке.
- Расписал стратегию [логов для виджетов](https://wiki.example.com/widgets/logs).
- Ревью MR по [атрибуции в виджетах](https://gitlab.example.com/shop/widgets/-/merge_requests/214).

**Сегодня:**
- Вливаю [фильтр по датам](https://gitlab.example.com/shop/web/-/merge_requests/1031): завтра он уходит в тест.
- Делаю мобильную часть [истории заказов](https://tracker.example.com/SHOP-431). Пока бэк не готов, работаю на моках.
- Проверяю вчерашние задачи по Кассе на устройстве и собираю сборку для теста.
```

**No emoji** — neither here nor in any other variant. Don't add them for mood.

The message is Markdown: `**bold**` and `[text](url)` render in Mattermost, GitLab and other chats that accept Markdown. If the user's chat doesn't render pasted Markdown links, ask how they post there before giving a variant; never hand over GitHub-flavoured `#` headings blind.

Below, **outside the block**, a short footnote:

- which repos had activity, so the user notices one that wasn't picked up;
- which sources didn't answer and what is unverified because of it; phrases left without a link;
- what the user may want to add by hand: calls, 1:1s, voice discussions, debugging that left no trace;
- what didn't make it into «Сегодня» but may matter: tracker tasks "in progress", MRs waiting for the user's review, open questions from the sessions — one line each.
