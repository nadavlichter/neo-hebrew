'use strict';

// Hebrew/RTL 8.1: the Word export of a right-to-left book (w:bidi
// paragraphs, w:rtl runs with Cs emphasis and sizes, the Cs font and
// language, a mirrored section), and that a left-to-right book's .docx is
// the file it was. The builders are cut out of app.js and run in vm; a
// small paraRuns stands in for the DOM one. The .docx is then read back by
// NEO's own import (main.js), as a writer would open it again.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const NeoBidi = require('../bidi.js');

const root = path.join(__dirname, '..');
const current = require('./app-files').appSource();
// An English book's .docx is the file NEO's main writes (rtl-baseline.js).
const { UPSTREAM, appSourceAt, LITRPG } = require('./rtl-baseline');
const before = appSourceAt(UPSTREAM);

// <p …>text <b>bold <i>both</i></b> <i>it</i></p> → paraRuns' runs
function paraRuns(html) {
  const runs = [];
  const st = { b: 0, i: 0, u: 0, s: 0 };
  const key = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's' };
  for (const tok of String(html).match(/<[^>]+>|[^<]+/g) || []) {
    const m = /^<(\/?)(\w+)/.exec(tok);
    if (m) { if (key[m[2]]) st[key[m[2]]] += m[1] ? -1 : 1; continue; }
    if (tok.startsWith('<')) continue;
    runs.push({ text: tok, b: !!st.b, i: !!st.i, u: !!st.u, s: !!st.s });
  }
  return runs;
}

function load(src, hebrewWords = false) {
  const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
  const code = [
    LITRPG,
    cut('const escXml = ', '// Walk a paragraph'),
    cut('/* ---------- DOCX ---------- */', '/* ---------- EPUB')
  ].join('\n');
  const ctx = vm.createContext({
    NeoBidi, paraRuns,
    isAttribution: (p) => /^[—–]/.test(p.text || ''),
    t: (s) => s,
    tBook: (s) => (hebrewWords && s === 'Contents' ? 'תוכן העניינים' : s),
    firstFamily: () => 'Georgia', exportBodyFont: () => 'Georgia, serif',
    window: { neo: { paper: 'Letter' } }
  });
  vm.runInContext(code + '\nthis.api = { buildDocxEntries };', ctx);
  return ctx.api;
}

const para = (html, extra = {}) => ({ sceneBreak: false, poetry: false, flush: false, align: '', dir: '', text: html.replace(/<[^>]+>/g, ''), html: `<p>${html}</p>`, ...extra });
function data(dir, sections, extra = {}) {
  return {
    id: 'b', uuid: 'u', title: dir === 'rtl' ? 'ספר' : 'Book', subtitle: dir === 'rtl' ? 'משנה' : 'Sub', author: 'A',
    language: dir === 'rtl' ? 'he' : 'en', dir, sections,
    toc: sections.map((s, i) => ({ label: s.heading, num: i + 1, level: 0, type: s.kind })), contents: true, contentsChapters: true, ...extra
  };
}
const chapter = (heading, paras, extra = {}) => ({ kind: 'chapter', heading, paras, level: 0, front: false, ...extra });

const ltrBook = () => data('ltr', [
  { kind: 'epigraph', heading: '', paras: [para('A line.'), para('— Someone')], front: true },
  chapter('Chapter 1', [
    para('First <b>bold</b> and <i>italic</i> and <b><i>both</i></b>.'),
    para('Poem line', { poetry: true }), para('Flush.', { flush: true }),
    para('***', { sceneBreak: true }), para('Centered.', { align: 'center' }), para('Right.', { align: 'right' }),
    para('Justified.', { align: 'justify' }), para('Left.', { align: 'left' })
  ])
]);
const rtlBook = () => data('rtl', [
  chapter('פרק 1', [
    para('שלום <b>מודגש</b> ו<i>נטוי</i> עם iPhone בתוך.'),
    para('An English paragraph.', { dir: 'ltr' }),
    para('שיר', { poetry: true }),
    para('סוף', { align: 'end' }), para('שמאל', { align: 'left' }), para('ימין', { align: 'right' }),
    para('אמצע', { align: 'center' }), para('התחלה', { align: 'start' })
  ])
]);
const entry = (entries, p) => entries.find((e) => e.path === p).content;
const paras = (xml) => xml.match(/<w:p>[\s\S]*?<\/w:p>/g);
const paraOf = (xml, text) => paras(xml).find((p) => p.includes(text));

// a well-formedness check: every tag closes in order, attributes quoted
function wellFormed(xml, name) {
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([\w:]+)((?:\s+[\w:]+="[^"<]*")*)\s*(\/?)>|<|>/g)) {
    if (!m[2]) assert.fail(`${name}: a stray ${m[0]} at ${m.index}`);
    if (m[1]) assert.equal(stack.pop(), m[2], `${name}: </${m[2]}> closes the wrong element`);
    else if (!m[4]) stack.push(m[2]);
  }
  assert.deepEqual(stack, [], `${name}: unclosed elements`);
}

// CT_PPr and CT_RPr child order (ECMA-376 Part 1, 17.3.1.26 and 17.3.2.28), for the ones NEO writes
const P_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'pBdr', 'shd', 'bidi', 'spacing', 'ind', 'jc', 'outlineLvl'];
const R_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'strike', 'spacing', 'vertAlign', 'sz', 'szCs', 'u', 'rtl', 'lang'];
function inOrder(xml, wrapper, order) {
  for (const m of xml.matchAll(new RegExp(`<w:${wrapper}>([\\s\\S]*?)</w:${wrapper}>`, 'g'))) {
    // a border's sides are its own children, not the paragraph's
    const names = [...m[1].replace(/<w:pBdr>[\s\S]*?<\/w:pBdr>/g, '<w:pBdr/>').matchAll(/<w:(\w+)/g)].map((x) => x[1]);
    const idx = names.map((n) => order.indexOf(n));
    assert.ok(idx.every((x) => x >= 0), `${wrapper}: unknown child in ${m[1]}`);
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b), `${wrapper} out of order: ${m[1]}`);
  }
}

test('a left-to-right book: every part of the .docx is the file it was', { skip: !before && 'needs git and commit ' + UPSTREAM }, () => {
  const now = load(current).buildDocxEntries(ltrBook());
  const old = load(before).buildDocxEntries(ltrBook());
  assert.equal(now.map((e) => e.path).join('|'), old.map((e) => e.path).join('|'));
  now.forEach((e, i) => assert.equal(e.content, old[i].content, e.path));
  const all = now.map((e) => e.content).join('');
  assert.ok(!/bidi|w:rtl|Cs[ /]|szCs|w:start/.test(all));
});

test('a right-to-left book: Normal is bidi, the section mirrors, docDefaults carry the Cs font, size and language', () => {
  const e = load(current, true).buildDocxEntries(rtlBook());
  const styles = entry(e, 'word/styles.xml');
  const doc = entry(e, 'word/document.xml');
  assert.match(styles, /<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"\/><w:qFormat\/><w:pPr><w:bidi\/><\/w:pPr><\/w:style>/);
  assert.match(styles, /<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Times New Roman"\/><w:sz w:val="24"\/><w:szCs w:val="24"\/><w:lang w:bidi="he-IL"\/>/);
  assert.match(styles, /w:styleId="Emphasis">.*<w:rPr><w:i\/><w:iCs\/><\/w:rPr>/);
  assert.match(styles, /w:styleId="Strong">.*<w:rPr><w:b\/><w:bCs\/><\/w:rPr>/);
  assert.match(styles, /w:styleId="StrongEmphasis">.*<w:rPr><w:b\/><w:bCs\/><w:i\/><w:iCs\/><\/w:rPr>/);
  assert.match(styles, /w:styleId="Title">.*<w:rPr><w:b\/><w:bCs\/><w:sz w:val="56"\/><w:szCs w:val="56"\/><\/w:rPr>/);
  assert.match(styles, /<w:rPr><w:caps\/><w:sz w:val="28"\/><w:szCs w:val="28"\/><\/w:rPr>/);
  assert.match(doc, /<w:pgMar [^>]*\/><w:bidi\/><\/w:sectPr>/);
  assert.ok(!/rtlGutter/.test(doc));
  for (const x of e) wellFormed(x.content, x.path);
  inOrder(doc + styles, 'pPr', P_ORDER);
  inOrder(doc + styles, 'rPr', R_ORDER);
});

test('a right-to-left book: runs split by script, Hebrew marked rtl, emphasis through the Cs styles', () => {
  const doc = entry(load(current, true).buildDocxEntries(rtlBook()), 'word/document.xml');
  const p = paraOf(doc, 'מודגש');
  // no exception: the paragraph is bidi through Normal
  assert.match(p, /^<w:p><w:pPr><w:pStyle w:val="BodyText"\/><\/w:pPr>/);
  assert.match(p, /<w:r><w:rPr><w:rtl\/><\/w:rPr><w:t xml:space="preserve">שלום <\/w:t><\/w:r>/);
  assert.match(p, /<w:r><w:rPr><w:rStyle w:val="Strong"\/><w:rtl\/><\/w:rPr><w:t xml:space="preserve">מודגש<\/w:t><\/w:r>/);
  assert.match(p, /<w:r><w:rPr><w:rStyle w:val="Emphasis"\/><w:rtl\/><\/w:rPr><w:t xml:space="preserve">נטוי<\/w:t><\/w:r>/);
  // the Latin word is its own run, without w:rtl, and takes the space after it
  assert.match(p, /<w:r><w:t xml:space="preserve">iPhone <\/w:t><\/w:r>/);
  assert.match(p, /<w:rtl\/><\/w:rPr><w:t xml:space="preserve">בתוך.<\/w:t>/);
  // the heading's sized runs carry szCs; the title page too
  assert.match(doc, /<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:rPr><w:rtl\/><\/w:rPr><w:t xml:space="preserve">פרק 1<\/w:t>/);
  assert.match(paraOf(doc, 'תוכן העניינים'), /<w:caps\/><w:sz w:val="28"\/><w:szCs w:val="28"\/><w:rtl\/>/);
});

test('a right-to-left book: an English paragraph says bidi 0; indents and alignment are logical', () => {
  const doc = entry(load(current, true).buildDocxEntries(rtlBook()), 'word/document.xml');
  assert.match(paraOf(doc, 'An English paragraph.'), /<w:pPr><w:pStyle w:val="BodyText"\/><w:bidi w:val="0"\/><\/w:pPr><w:r><w:t xml:space="preserve">An English paragraph.<\/w:t><\/w:r>/);
  assert.equal((doc.match(/<w:bidi/g) || []).length, 2); // the exception and the section
  assert.match(paraOf(doc, 'שיר'), /<w:pStyle w:val="Poetry"\/><\/w:pPr>/);
  // end and a physical left are Word's left side; start, right and nothing are the default
  assert.match(paraOf(doc, 'סוף'), /<w:pStyle w:val="BodyTextNoIndent"\/><w:jc w:val="left"\/>/);
  assert.match(paraOf(doc, 'שמאל'), /<w:jc w:val="left"\/>/);
  assert.match(paraOf(doc, 'ימין'), /<w:pStyle w:val="BodyText"\/><\/w:pPr>/);
  assert.match(paraOf(doc, 'התחלה'), /<w:pStyle w:val="BodyText"\/><\/w:pPr>/);
  assert.match(paraOf(doc, 'אמצע'), /<w:jc w:val="center"\/>/);
  // the contents' entries indent from the start
  const d = rtlBook();
  d.toc[0].level = 1;
  const doc2 = entry(load(current, true).buildDocxEntries(d), 'word/document.xml');
  assert.match(doc2, /<w:ind w:start="480"\/><\/w:pPr><w:r><w:rPr><w:caps w:val="0"\/><w:rtl\/><\/w:rPr><w:t xml:space="preserve">פרק 1/);
});

test('a Hebrew paragraph in a left-to-right book: bidi on it, the Cs styles and language come along', () => {
  const d = ltrBook();
  d.sections[1].paras.push(para('ציטוט <i>בעברית</i>', { dir: 'rtl' }));
  const e = load(current).buildDocxEntries(d);
  const doc = entry(e, 'word/document.xml');
  const styles = entry(e, 'word/styles.xml');
  assert.match(paraOf(doc, 'ציטוט'), /<w:pStyle w:val="BodyText"\/><w:bidi\/><\/w:pPr><w:r><w:rPr><w:rtl\/><\/w:rPr><w:t xml:space="preserve">ציטוט <\/w:t><\/w:r><w:r><w:rPr><w:rStyle w:val="Emphasis"\/><w:rtl\/>/);
  assert.equal((doc.match(/<w:bidi/g) || []).length, 1);
  assert.match(styles, /<w:rPr><w:i\/><w:iCs\/><\/w:rPr>/);
  assert.match(styles, /<w:lang w:bidi="he-IL"\/>/);
  assert.ok(!/<w:pPr><w:bidi\/><\/w:pPr><\/w:style>/.test(styles), 'Normal stays left to right');
  // English paragraphs around it are untouched
  assert.match(paraOf(doc, 'Poem line'), /^<w:p><w:pPr><w:pStyle w:val="Poetry"\/><\/w:pPr><w:r><w:t xml:space="preserve">Poem line<\/w:t><\/w:r><\/w:p>$/);
});

// a footnote needs paraRuns' fn run; this loader adds one for <fn>…</fn>
function loadWithNotes(src) {
  const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
  const ctx = vm.createContext({
    NeoBidi,
    paraRuns: (html) => {
      const m = /<fn>([^<]*)<\/fn>/.exec(html);
      const runs = paraRuns(html.replace(/<fn>[^<]*<\/fn>/, ''));
      if (m) runs.push({ fn: m[1], text: '' });
      return runs;
    },
    isAttribution: () => false, t: (s) => s, tBook: (s) => s,
    firstFamily: () => 'Georgia', exportBodyFont: () => 'Georgia', window: { neo: { paper: 'A4' } }
  });
  vm.runInContext([LITRPG, cut('const escXml = ', '// Walk a paragraph'), cut('/* ---------- DOCX ---------- */', '/* ---------- EPUB')].join('\n') + '\nthis.api = { buildDocxEntries };', ctx);
  return ctx.api;
}

test('footnotes: Hebrew in an RTL book is split and marked; English in an LTR book is as it was', () => {
  const he = loadWithNotes(current).buildDocxEntries(data('rtl', [chapter('פרק', [para('טקסט<fn>הערה עם word בתוכה</fn>')])], { contents: false }));
  const notes = entry(he, 'word/footnotes.xml');
  wellFormed(notes, 'footnotes');
  inOrder(notes, 'rPr', R_ORDER);
  assert.match(notes, /<w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"\/><\/w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"\/><\/w:rPr><w:footnoteRef\/><\/w:r><w:r><w:rPr><w:rtl\/><\/w:rPr><w:t xml:space="preserve"> הערה עם <\/w:t><\/w:r><w:r><w:t xml:space="preserve">word <\/w:t><\/w:r><w:r><w:rPr><w:rtl\/><\/w:rPr><w:t xml:space="preserve">בתוכה<\/w:t><\/w:r><\/w:p><\/w:footnote>/);
  assert.match(entry(he, 'word/styles.xml'), /<w:sz w:val="20"\/><w:szCs w:val="20"\/>/);
  if (!before) return;
  const en = () => data('ltr', [chapter('One', [para('Text<fn>A note.</fn>')])], { contents: false });
  const a = loadWithNotes(current).buildDocxEntries(en());
  const b = loadWithNotes(before).buildDocxEntries(en());
  a.forEach((x, i) => assert.equal(x.content, b[i].content, x.path));
});

// ---- read back by NEO's own import (main.js, 7.1) ----
const localRequire = createRequire(path.join(root, 'main.js'));
let JSZip = null;
try { JSZip = localRequire('jszip'); } catch { /* not installed */ }

test('round trip: NEO\'s import reads the directions and the Hebrew bold and italic back', { skip: !JSZip && 'needs jszip' }, async () => {
  const handlers = new Map();
  const electron = {
    app: { commandLine: { appendSwitch() {} }, getPath: () => os.tmpdir(), getLocale: () => 'en', requestSingleInstanceLock: () => true, whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { on() {}, handle: (name, fn) => handlers.set(name, fn) },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
    Menu: { buildFromTemplate: (items) => items, setApplicationMenu() {} },
    dialog: { showMessageBox: () => Promise.resolve({}) },
    utilityProcess: { fork: () => ({ on() {}, postMessage() {} }) },
    screen: {}
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), vm.createContext({
    require: (name) => name === 'electron' ? electron : localRequire(name),
    __dirname: root, process: { platform: process.platform, on() {} }, console
  }), { filename: path.join(root, 'main.js') });

  const d = data('rtl', [chapter('פרק 1', [
    para('שלום <b>מודגש</b> ו<i>נטוי</i> עם iPhone בתוך.'),
    para('An <i>English</i> paragraph.', { dir: 'ltr' }),
    para('עוד פסקה.')
  ])], { contents: false });
  const zip = new JSZip();
  for (const x of load(current).buildDocxEntries(d)) zip.file(x.path, x.content);
  const fp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-rtl-docx-')), 'he.docx');
  fs.writeFileSync(fp, await zip.generateAsync({ type: 'nodebuffer' }));
  const [r] = await handlers.get('import:files')(null, [fp]);
  const got = JSON.parse(JSON.stringify(r)).chapters.flatMap((ch) => ch.paras.map((p) => [p.text, p.dir || '']));
  const find = (s) => got.find(([x]) => x.includes(s));
  assert.deepEqual(find('מודגש'), ['שלום **מודגש** ו*נטוי* עם iPhone בתוך.', 'rtl']);
  assert.deepEqual(find('English'), ['An *English* paragraph.', 'ltr']);
  assert.deepEqual(find('עוד'), ['עוד פסקה.', 'rtl']);
});
