'use strict';

// Hebrew/RTL Phase 8: what the export builders write for a right-to-left
// book (EPUB 3, Web Page / PDF HTML, Markdown, plain text), and that a
// left-to-right book comes out exactly as it did before. The builders are
// cut out of app.js and run in vm with a few stubs; the DOM-bound parts
// (parasFromHtml, paraRuns, the PDF itself) run in scripts/footnotes.e2e.js.

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const NeoBidi = require('../bidi.js');

const current = require('./app-files').appSource();
// An English book's exports are the files NEO's main writes (rtl-baseline.js).
const { UPSTREAM, appSourceAt, LITRPG, printHelpers } = require('./rtl-baseline');
const before = appSourceAt(UPSTREAM);

// app.js's own htmlLetters, which the export's Hebrew test reads the words with
const htmlLetters = vm.runInNewContext('(' + current.slice(current.indexOf('function htmlLetters('), current.indexOf('// The direction a book with none is given on opening')) + ')');
function load(src, lib = { fonts: {} }, bookState = null, fontVars = null) {
  const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
  const code = [
    LITRPG,
    printHelpers(src),
    cut('function markedRuns(', 'function spFountain('),
    cut('const plainHeading', '/* ---------- A BOOK OF BOOKS'),
    cut('function tocTree(', 'function plainError('),
    cut('function dropCapStyle(', 'function syncDropCap('),
    cut('function exportLanguage(', 'function bookExportData(')
  ].filter((x) => x.length > 2).join('\n');
  const ctx = vm.createContext({
    NeoBidi, NeoI18n: { getLocale: () => 'en' }, library: lib, book: bookState,
    bookDirection: () => NeoBidi.bookDir(bookState), writingLanguage: () => (bookState && bookState.language) || 'en',
    t: (s, v = {}) => s.replace(/\{(\w+)\}/g, (m, k) => v[k]),
    tBook: (s, v = {}) => s.replace(/\{(\w+)\}/g, (m, k) => v[k]),
    plain: (s) => s,
    escHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    countWords: (s) => String(s).split(/\s+/).filter(Boolean).length,
    safeName: (s) => s, exportCover: async () => ({ ext: 'jpg', mime: 'image/jpeg', base64: 'AAAA' }),
    document: { createElement: () => ({ innerHTML: '', firstElementChild: null }) },
    getComputedStyle: () => ({ getPropertyValue: (prop) => (fontVars && fontVars[prop]) || 'Georgia, serif' }), htmlLetters,
    OPENING_DASH: /^\s*[-‐‑‒–—―]/, EPUB_TYPES_STUB: 0, crypto: { randomUUID: () => 'x' },
    paraRuns: (html) => [{ text: html.replace(/<[^>]+>/g, '') }],
    healStrayNbsp: () => {}, EPUB_TYPES: {}
  });
  // paraRuns and friends are declared in the cut; keep the stubs by running last
  vm.runInContext(code.replace(/^function paraRuns[\s\S]*?\n}\n/m, '').replace(/^function healStrayNbsp[\s\S]*?\n}\n/m, '').replace(/^async function exportCover[\s\S]*?\n}\n/m, '')
    + '\nthis.api = { buildTxt, buildMd, buildHtml, buildEpubEntries, chapterXhtml, dropCapStyle: typeof dropCapStyle === "function" ? dropCapStyle : null };', ctx);
  return ctx.api;
}
const para = (text, extra = {}) => ({ sceneBreak: false, poetry: false, flush: false, text, runs: [{ text }], align: '', dir: '', html: `<p${extra.dir ? ` dir="${extra.dir}"` : ''}>${text}</p>`, ...extra });
function data(dir, paras, lang = dir === 'rtl' ? 'he' : 'en') {
  const sections = [{ kind: 'chapter', heading: dir === 'rtl' ? 'פרק 1' : 'Chapter 1', paras, num: 1, level: 0, front: false }];
  return { id: 'b', uuid: 'u-1', title: dir === 'rtl' ? 'ספר' : 'Book', subtitle: '', author: 'A', language: lang, dir, sections, toc: [{ label: sections[0].heading, num: 1, level: 0, type: 'chapter' }], contents: false, contentsChapters: true };
}
const ltrBook = () => data('ltr', [para('First paragraph.'), para('Second one.', { poetry: true }), para('***', { sceneBreak: true }), para('After the break.', { align: 'center' })]);
const rtlBook = () => data('rtl', [para('פסקה ראשונה.'), para('Hello there.', { dir: 'ltr' }), para('שורה', { poetry: true })]);
const entry = (entries, p) => entries.find((e) => e.path === p).content;
const unstamp = (s) => s.replace(/<meta property="dcterms:modified">[^<]*</, '<meta property="dcterms:modified">T<');

test('a left-to-right book: EPUB, HTML, Markdown and text are the files they were', { skip: !before && 'needs git and commit ' + UPSTREAM }, async () => {
  const now = load(current);
  const old = load(before);
  const [a, b] = await Promise.all([now.buildEpubEntries(ltrBook()), old.buildEpubEntries(ltrBook())]);
  assert.equal(a.length, b.length);
  a.forEach((e, i) => assert.equal(unstamp(e.content), unstamp(b[i].content), e.path));
  assert.equal(now.buildHtml(ltrBook()), old.buildHtml(ltrBook()));
  assert.equal(now.buildMd(ltrBook()), old.buildMd(ltrBook()));
  assert.equal(now.buildTxt(ltrBook()), old.buildTxt(ltrBook()));
  assert.ok(!/page-progression|dir=/.test(a.map((e) => e.content).join('')));
  assert.ok(!/dir=/.test(now.buildHtml(ltrBook())));
});

test('EPUB, right to left: spine, language, dir on every page, exception paragraph, stylesheet', async () => {
  const e = await load(current).buildEpubEntries(rtlBook());
  assert.match(entry(e, 'OEBPS/content.opf'), /<spine toc="ncx" page-progression-direction="rtl">/);
  assert.match(entry(e, 'OEBPS/content.opf'), /<dc:language>he<\/dc:language>/);
  for (const p of ['OEBPS/ch1.xhtml', 'OEBPS/nav.xhtml', 'OEBPS/title.xhtml', 'OEBPS/cover.xhtml']) {
    assert.match(entry(e, p), /<html [^>]*xml:lang="he" lang="he" dir="rtl">/, p);
  }
  const ch = entry(e, 'OEBPS/ch1.xhtml');
  assert.match(ch, /<p class="first">פסקה ראשונה\.<\/p>/); // the book's own direction: no attribute
  assert.match(ch, /<p dir="ltr">Hello there\.<\/p>/);
  assert.match(ch, /<p class="poetry">שורה<\/p>/);
  const css = entry(e, 'OEBPS/style.css');
  assert.ok(css.includes('html[dir=rtl] nav#toc ol ol { padding-left: 0; padding-right: 1.5em; }'));
  assert.ok(css.includes('text-align: right; text-align: start;'));
  // the left-to-right sheet is the same sheet with the right-to-left rules after it
  assert.ok(css.startsWith(entry(await load(current).buildEpubEntries(ltrBook()), 'OEBPS/style.css')));
});

test('an exception in a left-to-right book is marked the other way', async () => {
  const d = ltrBook();
  d.sections[0].paras.push(para('שלום', { dir: 'rtl' }));
  const e = await load(current).buildEpubEntries(d);
  assert.match(entry(e, 'OEBPS/ch1.xhtml'), /<p dir="rtl">שלום<\/p>/);
  assert.ok(!/page-progression/.test(entry(e, 'OEBPS/content.opf')));
  assert.match(load(current).buildMd(d), /<div dir="rtl">\n\nשלום\n\n<\/div>\n\n/);
});

test('HTML / PDF page: dir and lang on the root, dir on exception paragraphs, sides turned over', () => {
  const html = load(current).buildHtml(rtlBook());
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /<p dir="ltr">Hello there\.<\/p>/);
  assert.ok(html.includes('.contents .toc-pg { text-align: left; }'));
  assert.ok(html.includes('.contents li.lv1 { margin-left: 0; margin-right: 1.6em; }'));
  assert.ok(html.includes('.notes::before { left: auto; right: 0; }'));
  // the page number stays centred; there is no header to mirror
  assert.ok(html.includes('@bottom-center { content: counter(page)'));
});

test('Markdown: only an exception is wrapped; plain text is unchanged', () => {
  const api = load(current);
  const md = api.buildMd(rtlBook());
  assert.ok(md.includes('פסקה ראשונה.\n\n'));
  assert.ok(!md.includes('<div dir="rtl">'));
  assert.ok(md.includes('<div dir="ltr">\n\nHello there.\n\n</div>\n\n'));
  assert.ok(md.includes('> שורה\n\n'));
  const txt = api.buildTxt(rtlBook());
  assert.ok(txt.includes('Hello there.\n\n') && !/[‎‏]|<div/.test(txt));
});

test('chapter-only and shelf data carry the same fields through the builders', async () => {
  const d = rtlBook();
  const one = { ...d, sections: [{ ...d.sections[0], num: 1 }], contents: false, chapterOnly: 'פרק 1' };
  assert.match(load(current).buildHtml(one), /<html lang="he" dir="rtl">/);
  assert.match(load(current).buildMd(one), /<div dir="ltr">/);
  const e = await load(current).buildEpubEntries({ ...one, title: 'אנתולוגיה' });
  assert.match(entry(e, 'OEBPS/content.opf'), /page-progression-direction="rtl"/);
});

test('drop cap: off for a right-to-left book unless the writer chose one; the page rule is the export rule', () => {
  const lib = (f) => ({ fonts: f });
  const rtlB = { direction: 'rtl' };
  assert.equal(load(current, lib({}), rtlB).dropCapStyle(), 'none');
  assert.equal(load(current, lib({ dropcap: 'classic' }), rtlB).dropCapStyle(), 'none');
  assert.equal(load(current, lib({ dropcap: 'classic', dropcapChosen: true }), rtlB).dropCapStyle(), 'classic');
  assert.equal(load(current, lib({}), {}).dropCapStyle(), 'literary');
  assert.equal(load(current, lib({ dropcap: 'none', dropcapChosen: true }), rtlB).dropCapStyle(), 'none');
  // exports ask with the data's own direction
  const api = load(current, lib({}), {});
  assert.equal(api.dropCapStyle('rtl'), 'none');
  assert.ok(!/initial-letter: \d/.test(load(current, lib({}), {}).buildHtml(rtlBook())));
  assert.match(load(current, lib({}), {}).buildHtml(ltrBook()), /initial-letter: 2\.15 3/);
  const chosen = load(current, lib({ dropcap: 'classic', dropcapChosen: true }), {}).buildHtml(rtlBook());
  assert.match(chosen, /initial-letter: 2\.15 3/);
  assert.ok(chosen.includes('padding-right: 0; padding-left: 4px;'));
});

test('NEO\'s Hebrew companion faces travel only in a book with Hebrew in it', () => {
  const vars = { '--body-font': '"NEO Hebrew Serif", Georgia, "Times New Roman", serif', '--dropcap-font': '"NEO Hebrew Serif", "Didot", "Bodoni 72", Georgia, serif' };
  const lib = { fonts: { dropcap: 'literary', dropcapChosen: true } };
  const english = load(current, lib, null, vars).buildHtml(ltrBook());
  assert.ok(!english.includes('NEO Hebrew'), 'an English page names no Hebrew face');
  assert.ok(english.includes('body { font-family: Georgia, "Times New Roman", serif;'));
  assert.ok(english.includes('font-family: "Didot", "Bodoni 72", Georgia, serif; }'));
  const hebrew = load(current, lib, null, vars).buildHtml(rtlBook());
  assert.ok(hebrew.includes('body { font-family: "NEO Hebrew Serif", Georgia, "Times New Roman", serif;'));
  // one Hebrew paragraph in an English book is Hebrew enough
  const mixed = ltrBook();
  mixed.sections[0].paras.push(para('שלום', { dir: 'rtl' }));
  assert.ok(load(current, lib, null, vars).buildHtml(mixed).includes('"NEO Hebrew Serif", Georgia'));
  // a writer's own font keeps its place; only the companion goes
  const own = load(current, { fonts: {} }, null, { '--body-font': '"Garamond", "NEO Hebrew Serif", Georgia, serif' }).buildHtml(ltrBook());
  assert.ok(own.includes('body { font-family: "Garamond", Georgia, serif;'));
  // the EPUB names no face of its own
  return load(current, lib, null, vars).buildEpubEntries(ltrBook()).then((e) => assert.ok(!e.map((x) => x.content).join('').includes('NEO Hebrew')));
});
