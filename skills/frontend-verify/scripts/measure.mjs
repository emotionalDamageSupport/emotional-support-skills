#!/usr/bin/env node
// Измерение страниц через Playwright: несколько URL × несколько ширин окна за один запуск.
// Пишет в --out: measure-<label>-<W>x<H>.json, screenshot-<label>-<W>x<H>.png,
// block-<label>-<W>x<H>.png (крупный план --shot-selector), console.json.
// В stdout — по строке на страницу и ширину. Состояние приложения не меняет: только открывает URL и читает DOM.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Холодная сборка dev server отдаёт первую страницу за 10–20 с; 30 с — запас, дольше страница уже не загрузится.
const DEFAULT_TIMEOUT_MS = '30000';
// Типичная рабочая ширина десктопа и узкий ноутбук. Это запасной вариант: ширины из требований
// или инструкций проекта передавай через --viewports.
const DEFAULT_VIEWPORTS = '1440x900,1024x768';

const HELP = `Использование:
  node measure.mjs --url [метка=]<URL> [--url ...] --selectors "<css1>,<css2>" [флаги]

Флаги:
  --url [метка=]<URL>       страница; повторяй флаг для нескольких (например, ru=...&lang=ru en=...&lang=en)
  --selectors <список>      CSS-селекторы через запятую (по умолчанию: body)
  --viewports <список>      размеры окна WxH через запятую (по умолчанию: ${DEFAULT_VIEWPORTS})
  --shot-selector <css>     дополнительно снять крупный план этого элемента (его и смотри в первую очередь)
  --out <папка>             куда писать результат (по умолчанию: ./measure-out)
  --storage-state <файл>    Playwright storage state для страниц за авторизацией
  --wait-for <селектор>     дождаться элемента перед измерением
  --timeout <мс>            таймаут загрузки и ожидания (по умолчанию: ${DEFAULT_TIMEOUT_MS})
  --full-page               скриншот всей страницы, а не только окна
`;

function parseArgs(argv) {
  const args = { urls: [], selectors: 'body', viewports: DEFAULT_VIEWPORTS, out: 'measure-out', timeout: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--full-page') args.fullPage = true;
    else if (a === '--url') args.urls.push(argv[++i]);
    else if (a.startsWith('--')) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return args;
}

function loadPlaywright() {
  // Сначала локальная установка проекта, затем глобальная (npm root -g).
  const require = createRequire(join(process.cwd(), 'noop.js'));
  for (const name of ['playwright', '@playwright/test']) {
    try { return require(name); } catch {}
  }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const gRequire = createRequire(join(globalRoot, 'noop.js'));
    for (const name of ['playwright', '@playwright/test']) {
      try { return gRequire(name); } catch {}
    }
  } catch {}
  return null;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.urls.length) {
  process.stdout.write(HELP);
  process.exit(args.help ? 0 : 2);
}

const pw = loadPlaywright();
if (!pw) {
  console.error('Playwright не найден ни в проекте, ни глобально.\n' +
    'Варианты: установить во временную папку (`npm i playwright` вне репозитория) ' +
    'или использовать scripts/measure-snippet.js через уже доступный браузерный инструмент.');
  process.exit(3);
}

const here = dirname(fileURLToPath(import.meta.url));
const snippet = readFileSync(join(here, 'measure-snippet.js'), 'utf8');
const selectors = args.selectors.split(',').map((s) => s.trim()).filter(Boolean);
const viewports = args.viewports.split(',').map((v) => {
  const m = /^(\d+)x(\d+)$/.exec(v.trim());
  if (!m) { console.error(`Неверный размер окна: "${v}", нужен формат 1440x900`); process.exit(2); }
  return { width: Number(m[1]), height: Number(m[2]) };
});
const pages = args.urls.map((u, i) => {
  const m = /^([\w-]+)=(https?:\/\/.+)$/.exec(u);
  return m ? { label: m[1], url: m[2] } : { label: args.urls.length > 1 ? `p${i + 1}` : 'page', url: u };
});
const timeout = Number(args.timeout);
const outDir = resolve(args.out);
mkdirSync(outDir, { recursive: true });

const browser = await pw.chromium.launch();
const consoleLog = [];
let exitCode = 0;
try {
  for (const { label, url } of pages) {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: vp, storageState: args.storageState || undefined });
      const page = await context.newPage();
      const tag = `${label}-${vp.width}x${vp.height}`;
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') consoleLog.push({ page: tag, type: msg.type(), text: msg.text() });
      });
      page.on('pageerror', (err) => consoleLog.push({ page: tag, type: 'pageerror', text: String(err) }));
      page.on('requestfailed', (req) => consoleLog.push({ page: tag, type: 'requestfailed', text: `${req.method()} ${req.url()} — ${req.failure()?.errorText}` }));
      page.on('response', (res) => {
        if (res.status() >= 400) consoleLog.push({ page: tag, type: 'http-error', text: `${res.status()} ${res.request().method()} ${res.url()}` });
      });

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout });
        if (args.waitFor) await page.waitForSelector(args.waitFor, { timeout });
      } catch (e) {
        console.error(`[${tag}] страница не загрузилась: ${e.message.split('\n')[0]}`);
        exitCode = 1;
        await context.close();
        continue;
      }
      await page.addScriptTag({ content: snippet });
      const result = await page.evaluate((sels) => window.measureUi(sels), selectors);
      writeFileSync(join(outDir, `measure-${tag}.json`), JSON.stringify(result, null, 2));
      await page.screenshot({ path: join(outDir, `screenshot-${tag}.png`), fullPage: Boolean(args.fullPage) });
      if (args.shotSelector) {
        const el = page.locator(args.shotSelector).first();
        if (await el.count()) await el.screenshot({ path: join(outDir, `block-${tag}.png`) });
      }

      const flags = [];
      if (result.page.horizontalScroll) flags.push(`горизонтальный скролл (scrollWidth ${result.page.scrollWidth} > ${result.page.clientWidth})`);
      if (result.overlaps.length) flags.push(`наложения: ${result.overlaps.map((p) => p.join(' × ')).join('; ')}`);
      if (result.rawTranslationKeyCandidates.length) flags.push(`похоже на сырые ключи: ${result.rawTranslationKeyCandidates.join(', ')}`);
      for (const [sel, info] of Object.entries(result.elements)) {
        if (info.error) flags.push(`${sel}: ${info.error}`);
        else if (info.count === 0) flags.push(`${sel}: не найден`);
        else info.items.forEach((it, i) => {
          if (it.truncated) flags.push(`${sel}[${i}]: текст обрезан`);
          if (it.outsideViewportX) flags.push(`${sel}[${i}]: выходит за окно по горизонтали`);
        });
      }
      console.log(`[${tag}] ${flags.length ? flags.join(' | ') : 'явных проблем не найдено'}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(outDir, 'console.json'), JSON.stringify(consoleLog, null, 2));
console.log(`Замеры и скриншоты: ${outDir}; консоль и запросы: ${consoleLog.length} записей → console.json`);
process.exit(exitCode);
