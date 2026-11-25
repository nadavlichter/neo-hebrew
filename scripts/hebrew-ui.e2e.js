// End-to-end test for the Hebrew interface (Phase 1 of the Hebrew plan): the
// window runs right to left (<html dir="rtl">), the writer's page keeps the
// book's own direction (ltr), nothing new reaches a saved chapter, and the
// menus carry a right-to-left mark. The same flow runs in English, which must
// stay as it was. Run with `npm run test:hebrew-ui`.
//
// The script starts itself once per language (a window's language is chosen
// at launch), and the first run compares what the two saved.
// Screenshots go to $NEO_SHOTS, or neo-hebrew-ui-shots in the system's temp folder.

'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHOTS = process.env.NEO_SHOTS || path.join(os.tmpdir(), 'neo-hebrew-ui-shots');
const LANG = process.env.NEO_UI;

if (!LANG) {
  // ---- the parent: one run per language, then compare ----
  const { spawnSync } = require('child_process');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-hebrew-ui-out-'));
  let bad = 0;
  const seen = {};
  for (const lang of ['en', 'he']) {
    const result = path.join(out, lang + '.json');
    const r = spawnSync(process.execPath, [__filename], {
      stdio: 'inherit', env: { ...process.env, NEO_UI: lang, NEO_RESULT: result }
    });
    if (r.status !== 0) bad++;
    try { seen[lang] = JSON.parse(fs.readFileSync(result, 'utf8')); } catch { bad++; }
  }
  if (seen.en && seen.he) {
    try {
      assert.equal(seen.en.chapterFile, seen.he.chapterFile, 'the saved chapter is the same in both languages');
      assert.equal(seen.en.bookJson, seen.he.bookJson, 'book.json is the same in both languages');
      console.log('ok   the chapter and book.json saved in Hebrew equal those saved in English');
    } catch (err) { bad++; console.log('FAIL ' + err.message); }
  }
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
}

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-hebrew-ui-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-hebrew-ui-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'app', 'settings.json'), JSON.stringify({ uiLanguage: LANG }));
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
// Three Hebrew books laid on the shelf by hand, old on disk: one that says it
// runs right to left (with a paragraph that runs the other way), one whose
// book.json says nothing (as a rebuilt one), one that says ltr on purpose.
// Opening and closing them must not touch a chapter file.
const HE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'hebrew', 'book-chapter.html'), 'utf8');
const SEEDS = [
  { id: 'seed-rtl', extra: { direction: 'rtl', language: 'he' }, html: HE_TEXT + '<p dir="ltr">Plain English, going the other way.</p>\n' },
  { id: 'seed-rebuilt', extra: {}, html: HE_TEXT },
  { id: 'seed-ltr', extra: { direction: 'ltr' }, html: HE_TEXT }
];
const OLD = new Date('2024-01-02T03:04:05Z');
for (const sd of SEEDS) {
  const dir = path.join(lib, sd.id);
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({
    id: sd.id, title: 'ספר ' + sd.id, subtitle: '', series: '', author: 'דנה', wordGoal: 0,
    created: OLD.toISOString(), modified: OLD.toISOString(), chapterOrder: ['ch-1', 'ch-2'], ...sd.extra
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'chapters', 'ch-1.html'), sd.html);
  fs.writeFileSync(path.join(dir, 'chapters', 'ch-2.html'), HE_TEXT);
  fs.writeFileSync(path.join(dir, 'notes.html'), '');
  fs.writeFileSync(path.join(dir, 'outline.html'), '');
  for (const f of ['book.json', 'chapters/ch-1.html', 'chapters/ch-2.html']) fs.utimesSync(path.join(dir, f), OLD, OLD);
}
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, pageTheme: 'night',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: SEEDS.map((x) => x.id) }]
}));

// Hebrew needs locales/he.json. If it isn't written yet, a small stand-in is
// read in its place (never written into locales/).
const HE_FILE = path.join(__dirname, '..', 'locales', 'he.json');
const STANDIN = { _meta: { name: 'עברית', dir: 'rtl' }, 'Manuscript': 'כתב היד', 'Notes': 'הערות', 'Outline': 'מתאר', 'File': 'קובץ', 'Edit': 'עריכה', 'View': 'תצוגה' };
if (LANG === 'he' && !fs.existsSync(HE_FILE)) {
  console.log('note locales/he.json is missing: using a stand-in');
  const readFileSync = fs.readFileSync;
  const readdirSync = fs.readdirSync;
  fs.readFileSync = function (f, ...rest) {
    if (path.resolve(String(f)) === HE_FILE) return JSON.stringify(STANDIN);
    return readFileSync.call(this, f, ...rest);
  };
  fs.readdirSync = function (d, ...rest) {
    const out = readdirSync.call(this, d, ...rest);
    return path.resolve(String(d)) === path.dirname(HE_FILE) && Array.isArray(out) ? [...out, 'he.json'] : out;
  };
}

const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = async (name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const img = await wc.capturePage();
  const file = path.join(SHOTS, `${LANG}-${name}.png`);
  fs.writeFileSync(file, img.toPNG());
  console.log('shot ' + file);
};
const menuLabels = () => {
  const out = [];
  const walk = (m) => { for (const i of m.items) { if (i.label) out.push(i.label); if (i.submenu) walk(i.submenu); } };
  walk(Menu.getApplicationMenu());
  return out;
};
const dirOf = (sel) => js(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).direction`);
const RTL = LANG === 'he';
const result = {};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the window says its language and direction', async () => {
  assert.equal(await js('document.documentElement.lang'), LANG);
  assert.equal(await js('document.documentElement.dir'), RTL ? 'rtl' : 'ltr');
  assert.equal(await js('NeoI18n.getDir()'), RTL ? 'rtl' : 'ltr');
  assert.equal(await dirOf('#bookshelf-view'), RTL ? 'rtl' : 'ltr');
  await shot('shelf');
});

test('the menus carry a right-to-left mark in Hebrew, and not in English', async () => {
  // (the application's own name, from its role, is the system's)
  const labels = menuLabels().filter((l) => l !== app.getName() && l !== 'Electron');
  assert.ok(labels.length > 10);
  const marked = labels.filter((l) => l.startsWith('‏'));
  if (RTL) assert.equal(marked.length, labels.length, 'every label starts with an RLM, not: ' + JSON.stringify(labels.filter((l) => !l.startsWith('\u200F'))));
  else assert.equal(labels.filter((l) => /‏/.test(l)).length, 0, 'no RLM in English');
});

test('the Edit menu is still found (NEO\'s own items on macOS)', async () => {
  assert.ok(Menu.getApplicationMenu().items.some((it) => it.submenu && /Edit|עריכה/.test(it.label)));
});

test('the writer\'s page keeps the book\'s direction: ltr', async () => {
  assert.equal(await js('bookDirection()'), 'ltr');
  for (const sel of ['#paper', '#aux-paper', '#sticky-list', '.chapter-body', '#tp-title', '#tp-subtitle']) {
    assert.equal(await dirOf(sel), 'ltr', sel);
  }
  // the author line takes its direction from its first letter (dir=auto): an unnamed author shows
  // the interface's word for Anonymous, so in a Hebrew interface it reads right to left
  assert.equal(await dirOf('#tp-author'), RTL ? 'rtl' : 'ltr', '#tp-author');
  // …while the interface around it follows the language
  assert.equal(await dirOf('#bottombar'), RTL ? 'rtl' : 'ltr');
  assert.equal(await dirOf('#nav-pane'), RTL ? 'rtl' : 'ltr');
});

test('no paragraph or body carries a dir attribute', async () => {
  assert.equal(await js(`document.querySelectorAll('.chapter-body[dir], .chapter-body [dir]').length`), 0);
});

test('other tabs keep the book\'s direction too', async () => {
  for (const tab of ['notes', 'outline', 'darlings', 'manuscript']) {
    await js(`document.querySelector('.tab[data-tab="${tab}"]').click()`);
    await tick(300);
    assert.equal(await dirOf('#aux-paper'), 'ltr', tab);
  }
});

test('typing and saving writes exactly what English writes', async () => {
  await js(`(() => {
    const id = book.chapterOrder.filter((c) => isStory(c))[0];
    const p = document.querySelector('.chapter[data-id="' + id + '"] .chapter-body p');
    p.closest('.chapter-body').focus();
    const r = document.createRange();
    r.setStart(p.firstChild, 3); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    currentChapterId = id;
    document.execCommand('insertText', false, ' typed words');
  })()`);
  await tick(2500);
  const id = await js(`book.chapterOrder.filter((c) => isStory(c))[0]`);
  const bookDir = await js('book.id');
  const file = fs.readFileSync(path.join(lib, bookDir, 'chapters', id + '.html'), 'utf8');
  assert.ok(file.includes('typed words'), 'the typing was saved');
  assert.ok(!/\sdir=|[⁦-⁩‏]/.test(file), 'no dir attribute, isolate or mark in the file');
  result.chapterFile = file;
  const meta = JSON.parse(fs.readFileSync(path.join(lib, bookDir, 'book.json'), 'utf8'));
  // only the ids and times differ between runs
  for (const k of ['id', 'createdAt', 'updatedAt', 'lastPosition', 'dailyCounts', 'chapterOrder', 'chapterTitles', 'chapterKinds', 'chapterWords', 'created', 'modified', 'author']) delete meta[k];
  result.bookJson = JSON.stringify(meta);
  assert.ok(!/[⁦-⁩‏]/.test(result.bookJson), 'no isolate in book.json');
  await shot('editor');
});

test('a title page edit is saved without a mark', async () => {
  const bookDir = await js('book.id');
  const meta = JSON.parse(fs.readFileSync(path.join(lib, bookDir, 'book.json'), 'utf8'));
  assert.ok(!/[⁦-⁩‏]/.test(JSON.stringify(meta)));
});

// ---- Phase 3: right-to-left books ----
function rtlBookTests() {
  const out = [];
  const add = (name, fn) => out.push({ name, fn });
  const bytes = (id) => ['chapters/ch-1.html', 'chapters/ch-2.html'].map((f) => {
    const file = path.join(lib, id, f);
    return fs.readFileSync(file, 'utf8') + '@' + fs.statSync(file).mtimeMs;
  });
  const metaOf = (id) => JSON.parse(fs.readFileSync(path.join(lib, id, 'book.json'), 'utf8'));
  const visit = async (id) => {
    await js(`openBook(${JSON.stringify(id)})`);
    await tick(900);
    await js(`window.dispatchEvent(new Event('blur')); flushAllSaves('tick')`);
    await tick(1500); // the meta save debounces 800 ms
  };
  const close = async () => { await js('backToShelf()'); await tick(500); };

  add('an rtl Hebrew book: the page is rtl, an exception ltr, and no chapter is rewritten', async () => {
    const before = bytes('seed-rtl');
    await visit('seed-rtl');
    assert.equal(await js(`document.querySelector('#paper').dir`), 'rtl');
    assert.equal(await js(`document.querySelector('#paper').lang`), 'he');
    assert.equal(await js(`document.querySelector('#aux-paper').dir`), 'rtl');
    assert.equal(await dirOf('#tp-title'), 'rtl');
    assert.equal(await js(`document.querySelector('.chapter-body p[dir]')`) === null, false);
    assert.equal(await js(`getComputedStyle(document.querySelector('.chapter-body p:not([dir])')).direction`), 'rtl');
    assert.equal(await js(`getComputedStyle(document.querySelector('.chapter-body p[dir="ltr"]')).direction`), 'ltr');
    assert.equal(await js(`document.querySelectorAll('.chapter-body[dir]').length`), 0);
    await shot('rtl-book');
    await close();
    assert.deepEqual(bytes('seed-rtl'), before, 'chapter bytes and mtimes unchanged');
    assert.equal(metaOf('seed-rtl').direction, 'rtl');
  });

  add('a book with no direction and mostly Hebrew is set rtl once, chapters untouched', async () => {
    const before = bytes('seed-rebuilt');
    assert.equal(metaOf('seed-rebuilt').direction, undefined);
    await visit('seed-rebuilt');
    assert.equal(await js(`document.querySelector('#paper').dir`), 'rtl');
    await close();
    const m = metaOf('seed-rebuilt');
    assert.equal(m.direction, 'rtl');
    assert.equal(m.language, 'he');
    assert.deepEqual(bytes('seed-rebuilt'), before, 'chapter bytes and mtimes unchanged');
  });

  add('an explicit ltr on a Hebrew book is respected and nothing is written', async () => {
    const before = bytes('seed-ltr');
    const meta = fs.statSync(path.join(lib, 'seed-ltr', 'book.json')).mtimeMs;
    await visit('seed-ltr');
    assert.equal(await js(`document.querySelector('#paper').dir`), 'ltr');
    await close();
    assert.equal(metaOf('seed-ltr').direction, 'ltr');
    assert.equal(metaOf('seed-ltr').language, undefined);
    assert.deepEqual(bytes('seed-ltr'), before);
    assert.equal(fs.statSync(path.join(lib, 'seed-ltr', 'book.json')).mtimeMs >= meta, true);
  });

  add('an English book with no direction is not given one', async () => {
    const id = await js(`library.shelves[0].bookIds.find((b) => !b.startsWith('seed-'))`);
    const m = metaOf(id);
    assert.equal(m.direction, undefined);
    assert.equal(m.language, undefined);
  });

  add('a New Book takes the interface\'s language and direction, and in English neither', async () => {
    const known = new Set(fs.readdirSync(lib));
    await js(`createBookOnShelf(library.shelves[0])`);
    await tick(1200);
    const id = fs.readdirSync(lib).find((d) => d.startsWith('book-') && !known.has(d));
    assert.ok(id, 'a new book folder');
    const m = metaOf(id);
    if (RTL) {
      assert.equal(m.direction, 'rtl');
      assert.equal(m.language, 'he');
      assert.equal(await js(`document.querySelector('#paper').dir`), 'rtl');
    } else {
      assert.ok(!('direction' in m) && !('language' in m), JSON.stringify(m));
      assert.equal(await js(`document.querySelector('#paper').dir`), 'ltr');
      assert.equal(await js(`document.querySelector('#paper').hasAttribute('lang')`), false);
    }
  });
  return out;
}

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library && !!library.features`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      const paras = (s) => Array.from({ length: 6 }, () => ({ text: s }));
      await addImportedBooks([{ name: 'The Lantern Year', chapters: [
        { title: 'The Thaw', paras: paras('Ines found the lantern in the ice house.') },
        { title: 'Salt Road', paras: paras('The convoy left at dawn.') }
      ] }], library.shelves[0]);
    })()`);
    await tick(500);
    win.focus();
    const first = tests.shift(); // the shelf, before a book opens
    const second = tests.shift();
    const third = tests.shift();
    for (const t of [first, second, third]) {
      try { await t.fn(); console.log('ok   ' + t.name); } catch (err) { failed++; console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     ')); }
    }
    await js(`(async () => { const ids = library.shelves[0].bookIds; await openBook(ids[ids.length - 1]); })()`);
    await tick(600);
    for (const t of tests) {
      try {
        await t.fn();
        console.log('ok   ' + t.name);
      } catch (err) {
        failed++;
        console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     '));
      }
    }
    const extra = rtlBookTests();
    for (const t of extra) {
      try { await t.fn(); console.log('ok   ' + t.name); } catch (err) { failed++; console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     ')); }
    }
    console.log(`\n[${LANG}] ${tests.length + 3 + extra.length - failed} passed, ${failed} failed`);
    if (process.env.NEO_RESULT) fs.writeFileSync(process.env.NEO_RESULT, JSON.stringify(result));
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
