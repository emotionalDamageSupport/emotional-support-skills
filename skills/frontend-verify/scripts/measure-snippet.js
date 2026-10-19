// measureUi(selectors, options) — измерение отображаемого интерфейса в браузере.
// Вставь файл целиком в evaluate браузерного инструмента, затем вызови:
//   measureUi(['.form', '.field', 'textarea'])
// Только читает DOM и computed styles; состояние приложения не меняет.
// options.maxPerSelector — сколько элементов на селектор описывать (по умолчанию 5).
function measureUi(selectors, options) {
  const opts = Object.assign({ maxPerSelector: 5 }, options || {});
  const STYLE_PROPS = [
    'display', 'position', 'box-sizing',
    'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'gap', 'row-gap', 'column-gap',
    'flex-grow', 'flex-shrink', 'flex-basis', 'flex-direction', 'align-items', 'justify-content',
    'grid-template-columns',
    'font-family', 'font-size', 'line-height', 'font-weight', 'letter-spacing',
    'text-align', 'white-space', 'text-overflow', 'overflow-x', 'overflow-y', 'color',
  ];
  const round = (n) => Math.round(n * 100) / 100;

  function describe(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const styles = {};
    for (const p of STYLE_PROPS) styles[p] = cs.getPropertyValue(p);
    const clipsX = el.scrollWidth > el.clientWidth + 1;
    const clipsY = el.scrollHeight > el.clientHeight + 1;
    const hidesOverflow = /hidden|clip/.test(cs.overflowX + cs.overflowY) || cs.textOverflow === 'ellipsis';
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: el.className && typeof el.className === 'string' ? el.className : undefined,
      // 80 символов хватает, чтобы узнать элемент в отчёте, и не раздувают вывод.
      text: (el.innerText || el.value || '').trim().slice(0, 80) || undefined,
      rect: { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height), right: round(r.right), bottom: round(r.bottom) },
      visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
      styles,
      truncated: hidesOverflow && (clipsX || clipsY),
      overflowsContent: clipsX || clipsY,
      outsideViewportX: r.right > document.documentElement.clientWidth + 1 || r.left < -1,
    };
  }

  function overlaps(a, b) {
    return a.x < b.right - 1 && b.x < a.right - 1 && a.y < b.bottom - 1 && b.y < a.bottom - 1;
  }

  const report = {
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    page: {
      url: location.href,
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    },
    elements: {},
    overlaps: [],
    rawTranslationKeyCandidates: [],
  };

  const measured = [];
  for (const sel of selectors || []) {
    let nodes;
    try {
      nodes = Array.from(document.querySelectorAll(sel));
    } catch (e) {
      report.elements[sel] = { error: 'invalid selector: ' + e.message };
      continue;
    }
    const items = nodes.slice(0, opts.maxPerSelector).map(describe);
    report.elements[sel] = { count: nodes.length, items };
    items.forEach((it, i) => { if (it.visible) measured.push({ sel: sel + '[' + i + ']', rect: it.rect, el: nodes[i] }); });
  }

  // Наложения между измеренными элементами, кроме вложенных друг в друга.
  for (let i = 0; i < measured.length; i++) {
    for (let j = i + 1; j < measured.length; j++) {
      const a = measured[i], b = measured[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (overlaps(a.rect, b.rect)) report.overlaps.push([a.sel, b.sel]);
    }
  }

  // Видимый текст вида "section.sub.key" или "section.sub_key" — похоже на непереведённый ключ.
  const KEY_RE = /^[a-zA-Z][\w-]*(\.[\w-]+){1,}$/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode.nodeValue.trim();
    if (!t || seen.has(t) || !KEY_RE.test(t) || /^\d/.test(t) || /\.(js|css|png|svg|html)$/.test(t)) continue;
    const parent = walker.currentNode.parentElement;
    if (!parent || ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(parent.tagName)) continue;
    const r = parent.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    seen.add(t);
    report.rawTranslationKeyCandidates.push(t);
  }
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    const t = el.getAttribute('placeholder').trim();
    if (KEY_RE.test(t) && !seen.has(t)) { seen.add(t); report.rawTranslationKeyCandidates.push(t); }
  }

  return report;
}

if (typeof module !== 'undefined' && module.exports) module.exports = measureUi;
