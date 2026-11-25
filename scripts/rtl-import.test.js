'use strict';

// Hebrew/RTL Phase 7.2 and 7.4: a .txt or .md file's paragraphs carry their
// direction, a new book takes the majority's, and the chapter HTML writes
// `dir` only where a paragraph differs from the book (D2). main.js runs in a
// sandbox as import.test.js loads it; the window's side is app.js's import
// section with the disk stubbed out.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { describe, test } = require('node:test');

const root = path.join(__dirname, '..');
const localRequire = createRequire(path.join(root, 'main.js'));
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const NeoBidi = require('../bidi');

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
vm.runInContext(source, vm.createContext({
  require: (name) => name === 'electron' ? electron : localRequire(name),
  __dirname: root, process: { platform: process.platform, on() {} }, console
}), { filename: path.join(root, 'main.js') });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-rtl-import-'));
async function importOne(name, data) {
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, data);
  const [r] = await handlers.get('import:files')(null, [fp]);
  return JSON.parse(JSON.stringify(r));
}
const flat = (r) => r.chapters.flatMap((ch) => ch.paras.map((p) => [p.scene ? '***' : p.text, p.dir || '']));

// ---- the window ----
const app = require('./app-files').appSource();
const from = app.indexOf('// One imported chapter\'s paragraphs as a chapter body');
const to = app.indexOf('async function importBooks()');
assert.ok(from > 0 && to > from, 'the import code is where the test expects it');
const win = vm.createContext({
  NeoBidi,
  escHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  dialogueDashes: (s) => s,
  dashStyle: () => 'em',
  // smart quotes on import are main's (quotes.test.js); here they pass through
  incomingQuotes: (s) => s, quoteRuns: () => {}, bookQuotes: () => null, singleQuotes: () => null
});
vm.runInContext(app.slice(from, to), win);

describe('text import: direction per paragraph', () => {
  test('each paragraph takes its first strong letter; digits and punctuation have none', async () => {
    const r = await importOne('mixed.txt', 'שלום עולם.\n\nHello there.\n\n2024\n\n* * *\n\niPhone הוא טלפון.\n');
    assert.deepEqual(flat(r), [['שלום עולם.', 'rtl'], ['Hello there.', 'ltr'], ['2024', ''], ['***', ''], ['iPhone הוא טלפון.', 'ltr']]);
  });

  test('a Hebrew first paragraph with a Latin acronym is not taken for an all-caps title', async () => {
    const r = await importOne('nasa.txt', 'החללית של NASA המריאה בבוקר\n\nשלום עולם.\n');
    assert.equal(r.chapters[0].paras[0].text, 'החללית של NASA המריאה בבוקר');
  });
  test('a leading byte-order mark and stray embeddings are not the writer\'s words', async () => {
    const r = await importOne('bom.txt', '﻿‫שלום עולם.‬\n\n‪Hi there‬.\n');
    assert.deepEqual(flat(r), [['שלום עולם.', 'rtl'], ['Hi there.', 'ltr']]);
    // LRM and RLM are the writer's own marks: kept
    const m = await importOne('marks.txt', 'הטמפרטורה ‎-5 מעלות.\n');
    assert.equal(m.chapters[0].paras[0].text, 'הטמפרטורה ‎-5 מעלות.');
  });

  test('a UTF-16 file with its mark reads the same', async () => {
    const buf = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('שלום עולם.\n\nHi.\n', 'utf16le')]);
    const r = await importOne('u16.txt', buf);
    assert.deepEqual(flat(r), [['שלום עולם.', 'rtl'], ['Hi.', 'ltr']]);
  });

  test('Markdown <div dir> blocks set their paragraphs\' direction, and the tags are not text', async () => {
    const md = [
      'Plain English opening.', '',
      '<div dir="rtl">', '', '2024', '', 'Some English inside a Hebrew block.', '', 'שלום', '', '</div>', '',
      '<div dir=\'ltr\'>', 'שלום בתוך בלוק אנגלי', '</div>', '',
      'After the blocks שלום.', ''
    ].join('\n');
    const r = await importOne('div.md', md);
    assert.deepEqual(flat(r), [
      ['Plain English opening.', 'ltr'],
      ['2024', 'rtl'], ['Some English inside a Hebrew block.', 'rtl'], ['שלום', 'rtl'],
      ['שלום בתוך בלוק אנגלי', 'ltr'],
      ['After the blocks שלום.', 'ltr']
    ]);
    assert.ok(!JSON.stringify(r.chapters).includes('div'), 'no tag left over');
  });

  test('a <div> with no dir keeps the direction around it; blocks nest; one-line blocks work', async () => {
    const md = '<div dir="rtl">\n\n<div class="x">\n\nשלום\n\n</div>\n\nHello\n\n</div>\n\n<div dir="rtl">שורה</div>\n\nEnd.\n';
    const r = await importOne('nest.md', md);
    assert.deepEqual(flat(r), [['שלום', 'rtl'], ['Hello', 'rtl'], ['שורה', 'rtl'], ['End.', 'ltr']]);
  });

  test('a .txt is not scanned for <div>', async () => {
    const r = await importOne('div.txt', '<div dir="rtl">\n\nhello\n');
    assert.ok(r.chapters[0].paras.some((p) => p.text.includes('<div')));
  });

  test('English files carry dir ltr only, and nothing changes in their text', async () => {
    const r = await importOne('en.txt', 'Chapter 1\n\nIt was late.\n\n"Go," she said.\n');
    assert.deepEqual(flat(r), [['It was late.', 'ltr'], ['"Go," she said.', 'ltr']]);
  });

  test('the Hebrew fixtures: English words inside Hebrew paragraphs, English-first stays rtl by its first strong letter only for plain text', async () => {
    const r = await importOne('plain.txt', fs.readFileSync(path.join(root, 'scripts', 'fixtures', 'hebrew', 'plain.txt')));
    const dirs = r.chapters.flatMap((ch) => ch.paras.map((p) => p.dir || ''));
    assert.ok(dirs.filter((d) => d === 'rtl').length >= 5);
    // "iPhone הוא טלפון…" opens with a Latin letter: plain text has no other word, so it reads as ltr and the window marks it
    assert.equal(r.chapters[0].paras.find((p) => p.text.startsWith('iPhone')).dir, 'ltr');
  });
});

// ---- Word (7.1) ----
// Spec-based fixtures, written by hand from ECMA-376 (w:bCs, w:iCs, w:rtl,
// w:bidi, w:docDefaults). Files saved by Hebrew Word and Google Docs are
// still needed to confirm them.
const JSZip = localRequire('jszip');
async function docx(paragraphs, { styles = '', sect = '' } = {}) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${paragraphs.join('')}${sect}</w:body></w:document>`);
  if (styles) zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles xmlns:w="w">${styles}</w:styles>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
const run = (text, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (runs, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs}</w:p>`;
const wordParas = (r) => r.chapters.flatMap((ch) => ch.paras.map((p) => [p.text, p.dir || '']));

describe('Word import: right-to-left (spec-based fixtures)', () => {
  test('Hebrew bold and italic kept only in w:bCs / w:iCs survive', async () => {
    const r = await importOne('cs.docx', await docx([
      para(run('מילה ') + run('מודגשת', '<w:bCs/>') + run(' ו') + run('נטויה', '<w:iCs/>') + run('.'), '<w:bidi/>')
    ]));
    assert.deepEqual(wordParas(r), [['מילה **מודגשת** ו*נטויה*.', 'rtl']]);
  });

  test('Latin text with only w:bCs is not bold, as Word shows it; with w:b it is', async () => {
    const r = await importOne('lat.docx', await docx([para(run('plain ') + run('cs', '<w:bCs/>') + run(' and ') + run('bold', '<w:b/>'))]));
    assert.deepEqual(wordParas(r), [['plain cs and **bold**', 'ltr']]);
  });

  test('a <w:rtl/> run with Latin letters takes w:bCs; w:bCs="0" turns a w:b off for Hebrew', async () => {
    const r = await importOne('rtlrun.docx', await docx([
      para(run('שלום ') + run('abc', '<w:rtl/><w:bCs/>') + run(' ') + run('עולם', '<w:b/><w:bCs w:val="0"/>'), '<w:bidi/>')
    ]));
    assert.deepEqual(wordParas(r), [['שלום **abc** עולם', 'rtl']]);
  });

  test('a producer writing only w:b / w:i on Hebrew is still heard', async () => {
    const r = await importOne('bi.docx', await docx([para(run('שלום', '<w:b/>') + run(' ') + run('עולם', '<w:i/>'))]));
    assert.deepEqual(wordParas(r), [['**שלום** *עולם*', 'rtl']]);
  });

  test('paragraph w:bidi gives rtl; w:bidi w:val="0" gives ltr, even over Hebrew letters', async () => {
    const r = await importOne('bidi.docx', await docx([
      para(run('Starts in English, ואז עברית.'), '<w:bidi/>'),
      para(run('שורה בכיוון שמאל לימין'), '<w:bidi w:val="0"/>'),
      para(run('2024'), '<w:bidi w:val="true"/>'),
      para(run('Unmarked.'))
    ]));
    assert.deepEqual(wordParas(r), [
      ['Starts in English, ואז עברית.', 'rtl'], ['שורה בכיוון שמאל לימין', 'ltr'], ['2024', 'rtl'], ['Unmarked.', 'ltr']
    ]);
  });

  test('direction and complex-script emphasis come from the paragraph style, its base, the default style and docDefaults', async () => {
    const styles = '<w:docDefaults><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="HebBase"><w:name w:val="heb base"/><w:pPr><w:bidi/></w:pPr><w:rPr><w:iCs/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="HebQuote"><w:name w:val="heb quote"/><w:basedOn w:val="HebBase"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="English"><w:name w:val="english"/><w:pPr><w:bidi w:val="0"/></w:pPr></w:style>' +
      '<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/><w:bCs/></w:rPr></w:style>';
    const r = await importOne('styles.docx', await docx([
      para(run('ציטוט בעברית'), '<w:pStyle w:val="HebQuote"/>'),
      para(run('English styled'), '<w:pStyle w:val="English"/>'),
      para(run('42')),
      para(run('חזק', '<w:rStyle w:val="Strong"/>'))
    ], { styles }));
    assert.deepEqual(wordParas(r), [['*ציטוט בעברית*', 'rtl'], ['English styled', 'ltr'], ['42', 'rtl'], ['**חזק**', 'rtl']]);
  });

  test('the default paragraph style (Normal) sets direction when the paragraph names none', async () => {
    const styles = '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:bidi/></w:pPr></w:style>';
    const r = await importOne('normal.docx', await docx([para(run('7'))], { styles }));
    assert.deepEqual(wordParas(r), [['7', 'rtl']]);
  });

  test('a section break inside a paragraph\'s w:pPr is not the paragraph\'s direction', async () => {
    const r = await importOne('sectp.docx', await docx([para(run('English.'), '<w:sectPr><w:bidi/></w:sectPr>')]));
    assert.deepEqual(wordParas(r), [['English.', 'ltr']]);
  });

  test('the body\'s section w:bidi is a hint: only paragraphs with no letters become rtl, and only when no paragraph says its own', async () => {
    const sect = '<w:sectPr><w:bidi/></w:sectPr>';
    const r = await importOne('sect.docx', await docx([para(run('שלום')), para(run('2024')), para(run('Hello.'))], { sect }));
    assert.deepEqual(wordParas(r), [['שלום', 'rtl'], ['2024', 'rtl'], ['Hello.', 'ltr']]);
    const r2 = await importOne('sect2.docx', await docx([para(run('שלום'), '<w:bidi/>'), para(run('2024'))], { sect }));
    assert.deepEqual(wordParas(r2), [['שלום', 'rtl'], ['2024', '']]);
  });

  test('a line break inside an rtl paragraph: every line keeps the direction', async () => {
    const r = await importOne('br.docx', await docx([para('<w:r><w:t>שורה</w:t><w:br/><w:t>Line</w:t></w:r>', '<w:bidi/>')]));
    assert.deepEqual(wordParas(r), [['שורה', 'rtl'], ['Line', 'rtl']]);
  });

  test('a Hebrew Word heading (style id Heading1, Hebrew name) starts a chapter', async () => {
    const styles = '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="כותרת 1"/><w:pPr><w:bidi/></w:pPr></w:style>';
    const r = await importOne('heh.docx', await docx([
      para(run('פתיחה.')), para(run('הים'), '<w:pStyle w:val="Heading1"/>'), para(run('גלים.'))
    ], { styles }));
    assert.equal(r.chapters.length, 2);
    assert.equal(r.chapters[1].title, 'הים');
  });

  test('an English .docx is as before: no rtl anywhere, Cs properties ignored', async () => {
    const r = await importOne('en.docx', await docx([
      para(run('It was ') + run('late', '<w:i/><w:iCs/>') + run(', she ') + run('said', '<w:bCs/>') + run('.')),
      para(run('Next ') + run('one', '<w:b/>'))
    ]));
    assert.deepEqual(wordParas(r), [['It was *late*, she said.', 'ltr'], ['Next **one**', 'ltr']]);
  });
});

describe('a new book from an import: direction and D2', () => {
  const chapters = (...paras) => [{ title: '', paras: paras.map((p) => (typeof p === 'string' ? { text: p } : p)) }];

  test('a mostly Hebrew import is right to left and Hebrew; paragraphs carry dir only where they differ', () => {
    const chs = chapters({ text: 'שלום עולם, זה סיפור ארוך.', dir: 'rtl' }, { text: 'Plain English line.', dir: 'ltr' }, { text: '2024' }, { scene: true }, { text: 'עוד פסקה בעברית.', dir: 'rtl' });
    const meta = {};
    const d = win.importedBookDirection(meta, chs);
    assert.equal(d, 'rtl');
    assert.equal(meta.direction, 'rtl');
    assert.equal(meta.language, 'he');
    assert.equal(win.importedChapterHTML(chs[0], d),
      '<p>שלום עולם, זה סיפור ארוך.</p><p dir="ltr">Plain English line.</p><p>2024</p><p class="scene-break">***</p><p>עוד פסקה בעברית.</p>');
  });

  test('an English import writes no direction and no dir: its book.json and chapters are as before', () => {
    const chs = chapters({ text: 'It was late.', dir: 'ltr' }, { text: 'She left.', dir: 'ltr' }, { text: '7' });
    const meta = { id: 'b', title: 'T' };
    const before = JSON.stringify(meta);
    const d = win.importedBookDirection(meta, chs);
    assert.equal(d, 'ltr');
    assert.equal(JSON.stringify(meta), before);
    assert.equal(win.importedChapterHTML(chs[0], d), '<p>It was late.</p><p>She left.</p><p>7</p>');
    // a result from an older main process has no dir at all
    assert.equal(win.importedChapterHTML({ paras: [{ text: 'Old.' }] }), '<p>Old.</p>');
  });

  test('a few Hebrew words in an English import: the book stays English, the Hebrew paragraph says so', () => {
    const chs = chapters({ text: 'A long English paragraph about the harbor and the ships that came.', dir: 'ltr' }, { text: 'שלום', dir: 'rtl' });
    const meta = {};
    const d = win.importedBookDirection(meta, chs);
    assert.equal(d, 'ltr');
    assert.ok(!('direction' in meta));
    assert.equal(win.importedChapterHTML(chs[0], d), '<p>A long English paragraph about the harbor and the ships that came.</p><p dir="rtl">שלום</p>');
  });

  test('Arabic is right to left but not called Hebrew', () => {
    const meta = {};
    assert.equal(win.importedBookDirection(meta, chapters({ text: 'مرحبا بالعالم كله', dir: 'rtl' })), 'rtl');
    assert.equal(meta.language, undefined);
  });

  test('end to end: a .md with a Hebrew book and an English block', async () => {
    const r = await importOne('book.md', '# פרק 1\n\nהיה בוקר שקט.\n\n<div dir="ltr">\n\nQuote in English.\n\n</div>\n\nוהספינות עמדו.\n');
    const meta = {};
    const d = win.importedBookDirection(meta, r.chapters);
    assert.equal(d, 'rtl');
    assert.equal(win.importedChapterHTML(r.chapters[0], d), '<p>היה בוקר שקט.</p><p dir="ltr">Quote in English.</p><p>והספינות עמדו.</p>');
  });
});
