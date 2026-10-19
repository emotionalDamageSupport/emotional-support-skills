#!/usr/bin/env node
// Пакетный HTTP-раннер для black-box QA: исполняет список запросов, пишет полный журнал
// доказательств (JSONL, секреты замаскированы) и печатает по одной короткой строке на запрос.
// Без зависимостей, Node 18+.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Ответ API обычно приходит за доли секунды; 15 с покрывают медленный стенд и холодный старт,
// но не дают зависшему запросу съесть таймбокс прогона.
const DEFAULT_TIMEOUT_MS = 15000;
// 160 символов — примерно две строки терминала: видно статус и код ошибки; полный ответ — в журнале.
const DEFAULT_WIDTH = 160;

const HELP = `Использование:
  в коде (основной способ):  import { createClient } from 'qa-http.mjs'
    const qa = createClient({ baseUrl, headers, auth: { admin: 'Bearer \${QA_ADMIN}' }, log, readOnly });
    const { status, body } = await qa.call('R1.create', { as: 'admin', method: 'POST', path: '/api/x', json: {...} });
    параметры call: as, method, path, query, json, body, headers, mutation — как поля запроса ниже
  из командной строки:      node qa-http.mjs <сценарии.json> --log <evidence/api-log.jsonl> [флаги]

Флаги:
  --log <файл>        журнал доказательств JSONL (дописывается; обязательно)
  --read-only         исполнять только GET/HEAD/OPTIONS и запросы без "mutation": true;
                      остальные пропускаются с пометкой BLOCKED (для общих сред без разрешения)
  --only <id,id>      исполнить только перечисленные id
  --width <N>         сколько символов тела ответа печатать (по умолчанию ${DEFAULT_WIDTH})
  --timeout <мс>      таймаут запроса (по умолчанию ${DEFAULT_TIMEOUT_MS})

Формат сценариев:
{
  "baseUrl": "http://127.0.0.1:3000",
  "headers": { "X-Tenant": "qa" },                 // общие заголовки
  "auth": { "admin": "Bearer ...", "viewer": "Bearer ..." },  // роль -> Authorization
  "requests": [
    { "id": "S1.create", "as": "admin", "method": "POST", "path": "/api/items", "json": { "name": "QA1" } },
    { "id": "S1.read", "as": "admin", "path": "/api/items", "query": { "input": { "all": true } } },
    { "id": "S9.redeem", "as": "admin", "path": "/api/redeem", "mutation": true }
  ]
}
query: значения-объекты сериализуются в JSON (удобно для tRPC: ?input={...}).
mutation: true — пометить запрос, который меняет данные, несмотря на безопасный метод.
Строки вида \${ENV_VAR} в auth/headers подставляются из окружения — так токены не попадают в файл.
`;


const SECRET = /^(authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const env = (s) => (typeof s === 'string' ? s.replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? '') : s);
const mask = (h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SECRET.test(k) ? '***' : v]));

// Клиент для сценариев в коде: однотипные проверки (границы, роли) — циклом, короче JSON.
//   import { createClient } from '<skill>/scripts/qa-http.mjs';
//   const qa = createClient({ baseUrl, headers, auth: { admin: 'Bearer ${QA_ADMIN}' }, log: 'evidence/api-log.jsonl', readOnly: false });
//   for (const d of [0, 1, 90, 91]) await qa.call(`R4.d${d}`, { as: 'admin', method: 'POST', path: '/api/items', json: { discount: d } });
// call() печатает одну строку и возвращает { status, body } (body — разобранный JSON или текст).
export function createClient({ baseUrl, headers = {}, auth = {}, log, readOnly = false, width = DEFAULT_WIDTH, timeout = DEFAULT_TIMEOUT_MS }) {
  if (!log) throw new Error('createClient: нужен log — путь к журналу доказательств');
  mkdirSync(dirname(resolve(log)), { recursive: true });
  return {
    async call(id, r = {}) {
      // Запрос без path ушёл бы на корень сайта (HTML страницы) — это ошибка вызова, а не проверка.
      if (typeof r !== 'object' || !r.path) {
        console.log(`${id}  ERROR  нужен call(id, { as, method, path, ... }) с path`);
        return { status: 0, error: 'bad call' };
      }
      const method = (r.method || 'GET').toUpperCase();
      const url = new URL(r.path, r.baseUrl || baseUrl);
      for (const [k, v] of Object.entries(r.query || {})) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      const h = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, env(v)])), ...(r.headers || {}) };
      if (r.as) {
        const token = env(auth[r.as]);
        if (token === undefined) { console.log(`${id}  ERROR  роль "${r.as}" не описана в auth`); return { status: 0, error: 'unknown role' }; }
        if (token) h.Authorization = token;
      }
      let body;
      if (r.json !== undefined) { body = JSON.stringify(r.json); h['Content-Type'] ??= 'application/json'; }
      else if (r.body !== undefined) body = String(r.body);
      const entry = { t: new Date().toISOString(), id, as: r.as, request: { method, url: url.toString(), headers: mask(h), body: r.json ?? r.body } };
      if (readOnly && (!SAFE.has(method) || r.mutation)) {
        entry.skipped = 'read-only';
        appendFileSync(log, JSON.stringify(entry) + '\n');
        console.log(`${id}  BLOCKED  ${method} ${url.pathname} (read-only)`);
        return { status: 0, blocked: true };
      }
      const started = Date.now();
      try {
        const res = await fetch(url, { method, headers: h, body, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
        const text = await res.text();
        let parsed; try { parsed = JSON.parse(text); } catch { parsed = undefined; }
        entry.response = { status: res.status, ms: Date.now() - started, headers: mask(Object.fromEntries(res.headers)), body: parsed ?? text };
        if (res.status >= 300 && res.status < 400) entry.response.redirectNotFollowed = res.headers.get('location');
        appendFileSync(log, JSON.stringify(entry) + '\n');
        const short = text.replace(/\s+/g, ' ').slice(0, width);
        console.log(`${id}  ${res.status}  ${short}${text.length > width ? '…' : ''}`);
        return { status: res.status, body: parsed ?? text };
      } catch (e) {
        entry.error = String(e.message || e);
        appendFileSync(log, JSON.stringify(entry) + '\n');
        console.log(`${id}  ERROR  ${entry.error}`);
        return { status: 0, error: entry.error };
      }
    },
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isCli) await cli();

async function cli() {
const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) { process.stdout.write(HELP); process.exit(args.length ? 0 : 2); }
const opt = { width: DEFAULT_WIDTH, timeout: DEFAULT_TIMEOUT_MS };
let file;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--read-only') opt.readOnly = true;
  else if (a === '--log') opt.log = args[++i];
  else if (a === '--only') opt.only = new Set(args[++i].split(','));
  else if (a === '--width') opt.width = Number(args[++i]);
  else if (a === '--timeout') opt.timeout = Number(args[++i]);
  else file = a;
}
if (!file || !opt.log) { console.error('Нужны файл сценариев и --log. Подробнее: --help'); process.exit(2); }
let spec;
try { spec = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error(`Не удалось прочитать ${file}: ${e.message}`); process.exit(2); }
const qa = createClient({ baseUrl: spec.baseUrl, headers: spec.headers, auth: spec.auth, log: opt.log, readOnly: opt.readOnly, width: opt.width, timeout: opt.timeout });
let failed = 0;
for (const r of spec.requests || []) {
  if (opt.only && !opt.only.has(r.id)) continue;
  const res = await qa.call(r.id, r);
  if (res.error) failed++;
}
process.exit(failed ? 1 : 0);
}
