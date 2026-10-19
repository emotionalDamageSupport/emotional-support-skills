#!/usr/bin/env node
// Measures pages with Playwright: several URLs × several window widths in one run.
// Writes to --out: measure-<label>-<W>x<H>.json, screenshot-<label>-<W>x<H>.png,
// block-<label>-<W>x<H>.png (close-up of --shot-selector), console.json.
// Prints one line per page and width. Doesn't change app state: only opens URLs and reads the DOM.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A dev server's cold build serves the first page in 10–20 s; 30 s leaves headroom, past that the page won't load.
const DEFAULT_TIMEOUT_MS = '30000';
// A typical desktop working width and a narrow laptop. A fallback only: pass widths from the requirements
// or the project's instructions with --viewports.
const DEFAULT_VIEWPORTS = '1440x900,1024x768';

const HELP = `Usage:
  node measure.mjs --url [label=]<URL> [--url ...] --selectors "<css1>,<css2>" [flags]

Flags:
  --url [label=]<URL>       a page; repeat the flag for several (e.g. ru=...&lang=ru en=...&lang=en)
  --selectors <list>        comma-separated CSS selectors (default: body)
  --viewports <list>        comma-separated WxH window sizes (default: ${DEFAULT_VIEWPORTS})
  --shot-selector <css>     also take a close-up of this element (look at it first)
  --out <dir>               where to write the results (default: ./measure-out)
  --storage-state <file>    Playwright storage state for pages behind a login
  --wait-for <selector>     wait for an element before measuring
  --timeout <ms>            load and wait timeout (default: ${DEFAULT_TIMEOUT_MS})
  --full-page               screenshot the whole page, not just the window
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
  // The project's own install first, then the global one (npm root -g).
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
  console.error('Playwright is not installed in the project or globally.\n' +
    'Options: install it into a temporary folder (`npm i playwright` outside the repository) ' +
    'or use scripts/measure-snippet.js through a browser tool you already have.');
  process.exit(3);
}

const here = dirname(fileURLToPath(import.meta.url));
const snippet = readFileSync(join(here, 'measure-snippet.js'), 'utf8');
const selectors = args.selectors.split(',').map((s) => s.trim()).filter(Boolean);
const viewports = args.viewports.split(',').map((v) => {
  const m = /^(\d+)x(\d+)$/.exec(v.trim());
  if (!m) { console.error(`Invalid window size: "${v}", expected the 1440x900 format`); process.exit(2); }
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
        console.error(`[${tag}] page did not load: ${e.message.split('\n')[0]}`);
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
      if (result.page.horizontalScroll) flags.push(`horizontal scroll (scrollWidth ${result.page.scrollWidth} > ${result.page.clientWidth})`);
      if (result.overlaps.length) flags.push(`overlaps: ${result.overlaps.map((p) => p.join(' × ')).join('; ')}`);
      if (result.rawTranslationKeyCandidates.length) flags.push(`looks like raw translation keys: ${result.rawTranslationKeyCandidates.join(', ')}`);
      for (const [sel, info] of Object.entries(result.elements)) {
        if (info.error) flags.push(`${sel}: ${info.error}`);
        else if (info.count === 0) flags.push(`${sel}: not found`);
        else info.items.forEach((it, i) => {
          if (it.truncated) flags.push(`${sel}[${i}]: text clipped`);
          if (it.outsideViewportX) flags.push(`${sel}[${i}]: overflows the window horizontally`);
        });
      }
      console.log(`[${tag}] ${flags.length ? flags.join(' | ') : 'no obvious problems found'}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(outDir, 'console.json'), JSON.stringify(consoleLog, null, 2));
console.log(`Measurements and screenshots: ${outDir}; console and requests: ${consoleLog.length} entries → console.json`);
process.exit(exitCode);
