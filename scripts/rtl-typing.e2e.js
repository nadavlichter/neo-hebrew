// End-to-end test for Hebrew/RTL Phase 3.3, 3.4 and the second half of 3.8:
// an RTL paragraph keeps its direction with an English opening, the first letter of an
// empty book sets the book, Format → Paragraph Direction and Book Direction,
// the Windows/Linux keys, and the Options feature gating (D6). NEO runs on a
// throwaway library and the typing arrives as the writer's does
// (webContents.insertText, sendInputEvent). The suite runs once with an
// English interface and once with a Hebrew one. Run with `npm run test:rtl-typing`.

'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LANG = process.env.NEO_UI;

if (!LANG) {
  const { spawnSync } = require('child_process');
  let bad = 0;
  for (const lang of ['en', 'he']) {
    const r = spawnSync(process.execPath, [__filename], { stdio: 'inherit', env: { ...process.env, NEO_UI: lang } });
    if (r.status !== 0) bad++;
  }
  process.exit(bad ? 1 : 0);
}

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-rtl-typing-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-rtl-typing-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'app', 'settings.json'), JSON.stringify({ uiLanguage: LANG }));
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);

// ---- the books on the shelf, old on disk ----
const OLD = new Date('2024-01-02T03:04:05Z');
const HE1 = 'זה היה בוקר שקט בנמל.';
const HE2 = 'והספינות עמדו במקומן.';
const SEEDS = [
  // right to left, one empty paragraph to type into
  { id: 'seed-he', extra: { direction: 'rtl', language: 'he' }, chapters: { 'ch-1': '<p>' + HE1 + '</p>\n<p><br></p>\n' } },
  // right to left, for the Paragraph Direction menu
  { id: 'seed-para', extra: { direction: 'rtl', language: 'he' }, chapters: { 'ch-1': `<p>${HE1}</p>\n<p>${HE2}</p>\n<p>${HE1}</p>\n` } },
  // right to left with one paragraph the other way; chapter 2 has none
  { id: 'seed-flip', extra: { direction: 'rtl', language: 'he' }, chapters: {
    'ch-1': `<p>${HE1}</p>\n<p dir="ltr">Plain English, going the other way.</p>\n<p>${HE2}</p>\n`,
    'ch-2': `<p>${HE1}</p>\n<p>${HE2}</p>\n`
  } },
  // an English book that says nothing about direction
  { id: 'seed-en', extra: {}, chapters: { 'ch-1': '<p>Hello world.</p>\n<p>The harbor was quiet.</p>\n' } },
  // the same, for the test that compares the file byte for byte
  // right to left, for the mixed-text suite (4.1): the cases go in one after another
  { id: 'seed-mixed', extra: { direction: 'rtl', language: 'he' }, chapters: { 'ch-1': '<p>' + HE1 + '</p>\n<p><br></p>\n' } },
  // an English book, for the mirror of the mixed-text suite
  { id: 'seed-enmix', extra: {}, chapters: { 'ch-1': '<p>Hello world.</p>\n<p><br></p>\n' } },
  { id: 'seed-en2', extra: {}, chapters: { 'ch-1': '<p>Hello world.</p>\n<p>The harbor was quiet.</p>\n' } },
  // 7.3: pastes into a Hebrew book and an English one, each with an empty paragraph
  { id: 'seed-paste', extra: { direction: 'rtl', language: 'he' }, chapters: { 'ch-1': '<p>' + HE1 + '</p>\n<p><br></p>\n' } },
  { id: 'seed-pastetext', extra: { direction: 'rtl', language: 'he' }, chapters: { 'ch-1': '<p>' + HE1 + '</p>\n<p><br></p>\n' } },
  { id: 'seed-pasteen', extra: {}, chapters: { 'ch-1': '<p>Hello world.</p>\n<p><br></p>\n' } }
];
for (const sd of SEEDS) {
  const dir = path.join(lib, sd.id);
  const order = Object.keys(sd.chapters);
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({
    id: sd.id, title: sd.id, subtitle: '', series: '', author: 'Dana', wordGoal: 0,
    created: OLD.toISOString(), modified: OLD.toISOString(), chapterOrder: order, ...sd.extra
  }, null, 2));
  for (const [ch, html] of Object.entries(sd.chapters)) fs.writeFileSync(path.join(dir, 'chapters', ch + '.html'), html);
  fs.writeFileSync(path.join(dir, 'notes.html'), '');
  fs.writeFileSync(path.join(dir, 'outline.html'), '');
  for (const f of ['book.json', ...order.map((c) => 'chapters/' + c + '.html')]) fs.utimesSync(path.join(dir, f), OLD, OLD);
}
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: false, pageTheme: 'night',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: SEEDS.map((x) => x.id) }]
}));

const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc, win;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const RTL_UI = LANG === 'he';
// Show More Features as it was: every feature but vim keys (those were their own choice)
const MAC = process.platform === 'darwin';

// ---- helpers ----
const folderOf = (id) => fs.readdirSync(lib).find((d) => {
  try { return JSON.parse(fs.readFileSync(path.join(lib, d, 'book.json'), 'utf8')).id === id; } catch { return false; }
});
const metaOf = (id) => JSON.parse(fs.readFileSync(path.join(lib, folderOf(id), 'book.json'), 'utf8'));
const chapter = (id, ch = 'ch-1') => fs.readFileSync(path.join(lib, folderOf(id), 'chapters', ch + '.html'), 'utf8');
const stamp = (id, ch) => fs.statSync(path.join(lib, folderOf(id), 'chapters', ch + '.html')).mtimeMs;

async function openSeed(id) {
  if (await js('!!book')) { await js('backToShelf()'); await tick(400); }
  await js(`openBook(${JSON.stringify(id)})`);
  await tick(800);
  win.focus();
  wc.focus();
}
// the caret in paragraph `p` of chapter body `b`: 'end' of its text, or 'start'
async function caret(b, p, at = 'end') {
  await js(`(() => {
    const body = document.querySelectorAll('.chapter-body')[${b}];
    body.focus();
    const p = body.children[${p}];
    const r = document.createRange();
    r.selectNodeContents(p);
    r.collapse(${at === 'start'});
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    currentChapterId = body.closest('.chapter').dataset.id;
  })()`);
  await tick(60);
}
// a new book opens on its title page with no chapter: the first line of writing makes one
async function startWriting() {
  if (!(await js(`document.querySelectorAll('.chapter-body').length`))) { await js('newChapter()'); await tick(400); }
}
// typed one letter at a time, as a keyboard does
async function type(text) {
  win.focus(); wc.focus();
  for (const ch of [...text]) { wc.insertText(ch); await tick(20); }
  await tick(60);
}
async function press(keyCode, char) {
  win.focus(); wc.focus();
  wc.sendInputEvent({ type: 'keyDown', keyCode });
  if (char) wc.sendInputEvent({ type: 'char', keyCode: char });
  wc.sendInputEvent({ type: 'keyUp', keyCode });
  await tick(250);
}
const enter = () => press('Enter', '\r');
const backspace = () => press('Backspace', '');
// what the chapter body holds, in its own markup
const bodyHTML = (b = 0) => js(`document.querySelectorAll('.chapter-body')[${b}].innerHTML`);
const paraAttr = (b, p) => js(`document.querySelectorAll('.chapter-body')[${b}].children[${p}].getAttribute('dir')`);
const paraDir = (b, p) => js(`getComputedStyle(document.querySelectorAll('.chapter-body')[${b}].children[${p}]).direction`);
const paraCount = (b = 0) => js(`document.querySelectorAll('.chapter-body')[${b}].children.length`);
// the saved files are written after a short wait: flush, then wait out the meta save
async function settle() {
  await js(`window.dispatchEvent(new Event('blur')); flushAllSaves('tick')`);
  await tick(1500);
}
function menuItem(...names) {
  const strip = (l) => String(l || '').replace(/‏/g, '');
  let items = Menu.getApplicationMenu().items;
  let found = null;
  for (const name of names) {
    found = items.find((i) => strip(i.label) === name);
    if (!found) return null;
    items = found.submenu ? found.submenu.items : [];
  }
  return found;
}
const FORMAT = RTL_UI ? 'עיצוב' : 'Format';
const L = (en, he) => (RTL_UI ? he : en);
const PARA = L('Paragraph Direction', 'כיוון פסקה');
const BOOKDIR = L('Book Direction', 'כיוון הספר');
const TO_RTL = L('Right to Left', 'מימין לשמאל');
const TO_LTR = L('Left to Right', 'משמאל לימין');
async function choose(...names) {
  const it = menuItem(FORMAT, ...names);
  assert.ok(it, 'menu item ' + names.join(' › '));
  it.click();
  await tick(400);
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('reopening an RTL book preserves every chapter byte and timestamp, including its LTR exception', async () => {
  const ids = ['ch-1', 'ch-2'];
  const before = ids.map((id) => ({ html: chapter('seed-flip', id), stamp: stamp('seed-flip', id) }));
  for (let pass = 0; pass < 2; pass++) {
    await openSeed('seed-flip');
    await settle();
    await js('backToShelf()'); await tick(300);
    for (let i = 0; i < ids.length; i++) {
      assert.equal(chapter('seed-flip', ids[i]), before[i].html);
      assert.equal(stamp('seed-flip', ids[i]), before[i].stamp);
    }
  }
});

// ---- 3.3 ----
test('Hebrew book: an English opening stays at the right-hand start, on screen and in the file', async () => {
  await openSeed('seed-he');
  await caret(0, 1);
  const text = 'iPhone הוא הטלפון הכי טוב כרגע.';
  await type(text);
  assert.equal(await paraAttr(0, 1), null);
  assert.equal(await paraDir(0, 1), 'rtl');
  const geo = await js(`(() => {
    const p = document.querySelector('.chapter-body').children[1];
    const word = rangeFromOffsets(p, 0, 6).getBoundingClientRect();
    const he = rangeFromOffsets(p, 7, 8).getBoundingClientRect();
    const chars = Array.from({ length: 6 }, (_, i) => [...rangeFromOffsets(p, i, i + 1).getClientRects()].find((r) => r.width > 0).left);
    const cs = getComputedStyle(p);
    return { align: cs.textAlign, gap: p.getBoundingClientRect().right - word.right, indent: parseFloat(cs.textIndent), heRight: he.right, wordLeft: word.left, chars };
  })()`);
  assert.ok(['start', 'right'].includes(geo.align));
  assert.ok(Math.abs(geo.gap - geo.indent) < 2, 'iPhone at the right-hand indent: ' + JSON.stringify(geo));
  assert.ok(geo.heRight < geo.wordLeft, 'Hebrew follows the opening English word to its left');
  for (let i = 1; i < geo.chars.length; i++) assert.ok(geo.chars[i] > geo.chars[i - 1], 'iPhone letters read LTR');
  await enter();
  await type('שלום');
  assert.equal(await paraCount(), 3);
  assert.equal(await paraAttr(0, 2), null, 'the second paragraph needs no dir');
  assert.equal(await paraDir(0, 2), 'rtl');
  await settle();
  const file = chapter('seed-he');
  assert.ok(file.includes('<p>' + text + '</p>'), file);
  assert.ok(file.includes('<p>שלום</p>'), file);
  assert.equal((file.match(/dir=/g) || []).length, 0, 'the book already supplies RTL');
  assert.ok(!/[\u200e\u200f\u061c\u2066-\u2069]/.test(file), 'no direction controls added');
  assert.equal(metaOf('seed-he').direction, 'rtl');
});

test('a number or a quote first: the first letter decides, not the digit', async () => {
  await openSeed('seed-he');
  const n = await paraCount();
  await caret(0, n - 1);
  await enter();
  await js(`document.querySelectorAll('.chapter-body')[0].children[${n}].removeAttribute('dir')`); // whatever Enter carried over
  await type('120 ');
  assert.equal(await paraAttr(0, n), null, 'digits and a space decide nothing');
  await type('ש״ח');
  assert.equal(await paraAttr(0, n), null);
  assert.equal(await paraDir(0, n), 'rtl');
  await enter();
  await js(`document.querySelectorAll('.chapter-body')[0].children[${n + 1}].removeAttribute('dir')`);
  await type('120 ');
  assert.equal(await paraAttr(0, n + 1), null);
  await type('dollars');
  assert.equal(await paraAttr(0, n + 1), null, 'Latin after the digits keeps the RTL paragraph');
  assert.equal(await paraDir(0, n + 1), 'rtl');
  // in an English book, quotes and digits don't decide either
  await openSeed('seed-en');
  await caret(0, 1);
  await enter();
  await type('120 ');
  assert.equal(await paraAttr(0, 2), null, 'digits and a space decide nothing');
  await type('ש״ח');
  assert.equal(await paraAttr(0, 2), 'rtl');
  await enter();
  await type('“שלום');
  assert.equal(await paraAttr(0, 3), 'rtl');
  assert.equal(await paraDir(0, 3), 'rtl');
  assert.equal(metaOf('seed-en').direction, undefined, 'the book already had English: it stays as it was');
});

test('a paragraph that already has words is never flipped by typing', async () => {
  await openSeed('seed-he');
  const n = await paraCount();
  await caret(0, n - 1);
  await enter();
  await type('iPhone ');
  assert.equal(await paraAttr(0, n), null);
  await type('שלום');
  assert.equal(await paraAttr(0, n), null, 'Hebrew after an English opening in an RTL paragraph');
  await enter();
  await type('שלום ');
  assert.equal(await paraAttr(0, n + 1), null);
  await type('iPhone');
  assert.equal(await paraAttr(0, n + 1), null, 'English at the end of a Hebrew paragraph');
});

test('an emptied paragraph: the next first letter decides afresh', async () => {
  await openSeed('seed-he');
  const n = await paraCount();
  await caret(0, n - 1);
  await enter();
  await choose(PARA, TO_LTR); // whole LTR paragraphs are an explicit choice
  await type('Hi');
  assert.equal(await paraAttr(0, n), 'ltr');
  await backspace();
  assert.equal(await paraAttr(0, n), 'ltr', 'one letter left');
  await backspace();
  assert.equal(await paraAttr(0, n), 'ltr', 'empty: dir kept, so undoing the deletion keeps it');
  await type('שלום');
  assert.equal(await paraAttr(0, n), null);
  assert.equal(await paraDir(0, n), 'rtl');
  await settle();
  assert.ok(!chapter('seed-he').includes('<p>שלום</p>\n<p dir'), 'saved without a stale dir');
  // ⌘Z of the first letter: the paragraph is empty and carries nothing stale
  await enter();
  await tick(1300); // the engine's typing run ends after a second of quiet: the letters are their own undo steps
  await choose(PARA, TO_LTR);
  await type('Yo');
  assert.equal(await paraAttr(0, n + 1), 'ltr');
  // undo until the line is empty: wherever the caret's paragraph has no text, it has no dir
  let emptied = false;
  for (let i = 0; i < 3 && !emptied; i++) {
    await js(`document.execCommand('undo')`);
    await tick(100);
    const st = await js(`(() => { const p = focusParagraph(); return p ? { text: p.textContent, dir: p.getAttribute('dir') } : null; })()`);
    if (st && st.text === '') { emptied = true; assert.equal(st.dir, null, 'undo left an empty paragraph without a dir'); }
  }
  assert.ok(emptied, 'undo reached an empty paragraph');
});

test('a paste is not typing: it does not change a paragraph\'s direction', async () => {
  await openSeed('seed-he');
  const n = await paraCount();
  await caret(0, n - 1);
  await enter();
  const carried = await paraAttr(0, n);
  await js(`(() => { const b = document.querySelectorAll('.chapter-body')[0]; const dt = new DataTransfer(); dt.setData('text/plain', 'Pasted words'); b.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
  await tick(200);
  assert.ok((await bodyHTML()).includes('Pasted words'));
  const last = (await paraCount()) - 1;
  assert.equal(last, n);
  assert.equal(await paraAttr(0, last), carried, 'the paste is Phase 7\'s: Hebrew-book Enter carried the dir, English words did not change it');
});

// ---- 3.8 ----
test('a new book: the first Hebrew letter sets the book; the first English letter does not', async () => {
  if (await js('!!book')) { await js('backToShelf()'); await tick(400); }
  const before = new Set(await js('library.shelves[0].bookIds'));
  await js(`createBookOnShelf(library.shelves[0])`);
  await tick(2500);
  let id = await js('book && book.id');
  if (!id) { id = (await js('library.shelves[0].bookIds')).find((b) => !before.has(b)); await openSeed(id); }
  win.focus(); wc.focus();
  await startWriting();
  await caret(0, 0);
  await type('שלום');
  assert.equal(await js('bookDirection()'), 'rtl');
  assert.equal(await js(`document.querySelector('#paper').dir`), 'rtl');
  assert.equal(await paraAttr(0, 0), null, 'the paragraph needs no dir');
  await enter();
  await type('עולם');
  assert.equal(await paraAttr(0, 1), null, 'the second paragraph is right too');
  await settle();
  const m = metaOf(id);
  assert.equal(m.direction, 'rtl');
  assert.equal(m.language, 'he');
  assert.ok(!/\sdir=/.test(chapter(id, (await js('book.chapterOrder[0]')))), 'no dir in the file');

  // another new book, English first
  await js('backToShelf()');
  await tick(400);
  const known = new Set(await js('library.shelves[0].bookIds'));
  await js(`createBookOnShelf(library.shelves[0])`);
  await tick(1200);
  let id2 = await js('book && book.id');
  if (!id2) { id2 = (await js('library.shelves[0].bookIds')).find((b) => !known.has(b)); await openSeed(id2); }
  win.focus(); wc.focus();
  await startWriting();
  await caret(0, 0);
  await type('Hello there');
  await settle();
  const m2 = metaOf(id2);
  if (RTL_UI) {
    assert.equal(m2.direction, 'rtl', 'a Hebrew interface\'s book was rtl from the start');
    assert.equal(await paraAttr(0, 0), null, 'English does not override the RTL book');
    assert.equal(await paraDir(0, 0), 'rtl');
  } else {
    assert.equal(m2.direction, undefined, 'an English letter never writes a direction');
    assert.equal(m2.language, undefined);
    assert.equal(await paraAttr(0, 0), null);
  }
});

test('English book, English typing: the chapter file holds no dir and nothing new', async () => {
  await openSeed('seed-en2');
  await js(`(() => {
    const p = document.querySelectorAll('.chapter-body')[0].children[0];
    p.closest('.chapter-body').focus();
    const r = document.createRange();
    r.setStart(p.firstChild, 5); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    currentChapterId = p.closest('.chapter').dataset.id;
  })()`);
  await type(' typed');
  await settle();
  assert.equal(chapter('seed-en2'), '<p>Hello typed world.</p>\n<p>The harbor was quiet.</p>\n'.replace(/\n/g, chapter('seed-en2').includes('\n') ? '\n' : ''));
  assert.ok(!/dir=/.test(chapter('seed-en2')));
  assert.equal(metaOf('seed-en2').direction, undefined);
});

// ---- 3.4 ----
test('simple NEO shows the direction items for an rtl book or interface only', async () => {
  await openSeed('seed-en');
  await tick(300);
  assert.equal(!!menuItem(FORMAT, PARA), RTL_UI, 'an ltr book in simple NEO');
  assert.equal(!!menuItem(FORMAT, BOOKDIR), RTL_UI);
  await openSeed('seed-para');
  await caret(0, 0);
  await tick(300);
  assert.ok(menuItem(FORMAT, PARA), 'an rtl book');
  assert.ok(menuItem(FORMAT, BOOKDIR));
  const it = menuItem(FORMAT, PARA, TO_RTL);
  assert.equal(it.checked, true, 'ticked from the caret\'s paragraph');
  assert.equal(menuItem(FORMAT, BOOKDIR, TO_RTL).checked, true);
  if (MAC) {
    assert.equal(it.accelerator, 'Ctrl+Cmd+Right');
    assert.equal(menuItem(FORMAT, PARA, TO_LTR).accelerator, 'Ctrl+Cmd+Left');
  }
});

test('Format → Paragraph Direction flips every paragraph the selection touches, and the file follows', async () => {
  await openSeed('seed-para');
  await js(`(() => {
    const body = document.querySelectorAll('.chapter-body')[0];
    body.focus();
    const r = document.createRange();
    r.setStart(body.children[0].firstChild, 4);
    r.setEnd(body.children[1].firstChild, 6);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    currentChapterId = body.closest('.chapter').dataset.id;
  })()`);
  await tick(300);
  await choose(PARA, TO_LTR);
  assert.equal(await paraAttr(0, 0), 'ltr');
  assert.equal(await paraAttr(0, 1), 'ltr');
  assert.equal(await paraAttr(0, 2), null, 'the paragraph outside the selection is left alone');
  await settle();
  const file = chapter('seed-para');
  assert.equal((file.match(/<p dir="ltr">/g) || []).length, 2, file);
  assert.equal(menuItem(FORMAT, PARA, TO_LTR).checked, true);
  await choose(PARA, TO_RTL);
  assert.equal(await paraAttr(0, 0), null);
  assert.equal(await paraAttr(0, 1), null);
  await settle();
  assert.equal(chapter('seed-para'), `<p>${HE1}</p>\n<p>${HE2}</p>\n<p>${HE1}</p>\n`.replace(/\n/g, chapter('seed-para').includes('\n') ? '\n' : ''));
});

test('Format → Book Direction flips the book; unchanged chapters are not written; ⌘Z puts it back', async () => {
  await openSeed('seed-flip');
  const ch1 = chapter('seed-flip', 'ch-1');
  const ch2 = chapter('seed-flip', 'ch-2');
  const t2 = stamp('seed-flip', 'ch-2');
  await caret(0, 0);
  await choose(BOOKDIR, TO_LTR);
  await settle();
  assert.equal(metaOf('seed-flip').direction, 'ltr');
  assert.equal(await js(`document.querySelector('#paper').dir`), 'ltr');
  assert.ok(!/dir=/.test(chapter('seed-flip', 'ch-1')), 'the exception paragraph lost its dir');
  assert.equal(await paraDir(0, 1), 'ltr');
  assert.equal(await paraDir(0, 0), 'ltr', 'paragraphs with no dir follow the book');
  assert.equal(chapter('seed-flip', 'ch-2'), ch2);
  assert.equal(stamp('seed-flip', 'ch-2'), t2, 'a chapter that needs no change is not written');
  // in simple NEO an English interface keeps the items only while the book runs right to left
  assert.equal(!!menuItem(FORMAT, BOOKDIR), RTL_UI);
  if (RTL_UI) assert.equal(menuItem(FORMAT, BOOKDIR, TO_LTR).checked, true);

  await js('structuralUndo()');
  await tick(500);
  await settle();
  assert.equal(await js('book.direction'), 'rtl');
  assert.equal(await js(`document.querySelector('#paper').dir`), 'rtl');
  assert.equal(metaOf('seed-flip').direction, 'rtl');
  assert.equal(chapter('seed-flip', 'ch-1'), ch1, 'the chapter is back as it was');
  assert.equal(await paraDir(0, 1), 'ltr');
  assert.equal(await paraDir(0, 0), 'rtl');

  await js('structuralRedo()');
  await tick(500);
  assert.equal(await js('book.direction'), 'ltr');
  assert.equal(await js(`document.querySelector('#paper').dir`), 'ltr');
});

test('an explicit ltr is written when the writer chooses it, and not by the first letter', async () => {
  await openSeed('seed-en');
  await caret(0, 0);
  // simple NEO has no item for an ltr book, so this is the window's own message
  await js(`setBookDirection('ltr')`);
  await settle();
  assert.equal(metaOf('seed-en').direction, 'ltr');
  await js('structuralUndo()');
  await tick(400);
  await settle();
  assert.equal(metaOf('seed-en').direction, undefined, 'undone: no direction at all, as before');
});

// ---- 3.5 alignment ----
const alignItem = (accel) => {
  const sub = menuItem(FORMAT, L('Align Paragraph', 'יישור פסקה'));
  return sub && sub.submenu.items.find((i) => i.accelerator === accel);
};
const alignOrder = () => menuItem(FORMAT, L('Align Paragraph', 'יישור פסקה')).submenu.items.map((i) => i.accelerator.replace('CmdOrCtrl+Shift+', ''));
const fileOf = (id) => chapter(id).replace(/\r?\n/g, '');

test('alignment in a Hebrew book: Right is the start and stored as nothing; Left is stored; the menu lists Right first', async () => {
  await js(`(async () => { for (const f of FEATURES) if (f.key !== 'vim') await setFeature(f.key, true); })()`);
  await tick(500);
  await openSeed('seed-para');
  const orig = fileOf('seed-para');
  await caret(0, 0);
  await tick(300);
  assert.deepEqual(await alignOrder(), ['R', 'C', 'L', 'J'], 'Right, Center, Left, Justify');
  assert.equal(alignItem('CmdOrCtrl+Shift+R').checked, true, 'no text-align in an rtl paragraph ticks Right');
  await js(`applyAlign('right')`);
  await settle();
  assert.equal(fileOf('seed-para'), orig, 'Right adds nothing to the file');
  await js(`applyAlign('left')`);
  await settle();
  assert.ok(chapter('seed-para').includes(`<p style="text-align: left;">${HE1}</p>`), chapter('seed-para'));
  await tick(200);
  assert.equal(alignItem('CmdOrCtrl+Shift+L').checked, true);
  await js(`applyAlign('right')`);
  await settle();
  assert.equal(fileOf('seed-para'), orig, 'Right takes the left back out');
  await js(`applyAlign('center')`);
  await settle();
  assert.ok(chapter('seed-para').includes(`<p style="text-align: center;">${HE1}</p>`));
  await js(`applyAlign('right')`);
  await settle();
  assert.equal(fileOf('seed-para'), orig);
  // an old file's text-align: right keeps its meaning (the start of an rtl line) and ticks Right
  // a paragraph of its own direction: ltr inside the rtl book, Left is its start
  await openSeed('seed-flip');
  await caret(0, 1);
  await tick(300);
  assert.equal(alignItem('CmdOrCtrl+Shift+L').checked, true, 'an ltr paragraph in an rtl book: Left is the default');
  const before = fileOf('seed-flip');
  await js(`applyAlign('left')`);
  await settle();
  assert.equal(fileOf('seed-flip'), before, 'Left in an ltr paragraph stores nothing');
});

test('alignment in an English book is as it always was', async () => {
  await openSeed('seed-en');
  const orig = fileOf('seed-en');
  await caret(0, 0);
  await tick(300);
  assert.deepEqual(await alignOrder(), ['L', 'C', 'R', 'J']);
  assert.equal(alignItem('CmdOrCtrl+Shift+L').checked, true);
  await js(`applyAlign('left')`);
  await settle();
  assert.equal(fileOf('seed-en'), orig, 'Left stores nothing');
  await js(`applyAlign('right')`);
  await settle();
  assert.ok(chapter('seed-en').includes('<p style="text-align: right;">Hello world.</p>'), chapter('seed-en'));
  await tick(400);
  assert.equal(alignItem('CmdOrCtrl+Shift+R').checked, true);
  await js(`applyAlign('left')`);
  await settle();
  assert.equal(fileOf('seed-en'), orig);
  await js(`(async () => { for (const f of FEATURES) if (f.key !== 'vim') await setFeature(f.key, false); })()`);
  await tick(400);
});

// ---- 3.6 drop cap, indents ----
test('an rtl book starts with no drop cap; an English one keeps it; a chosen style shows in either', async () => {
  const cap = () => js(`(() => { const p = document.querySelector('#paper .chapter-body p[data-first]'); const cs = getComputedStyle(p, '::before'); return { none: document.body.classList.contains('no-dropcap'), float: cs.float, size: cs.fontSize, ind: getComputedStyle(p).textIndent, padL: cs.paddingLeft, padR: cs.paddingRight, padEnd: cs.paddingInlineEnd, all: cs.padding }; })()`);
  await js(`delete library.fonts`);
  await js(`applyFonts()`);
  await openSeed('seed-para');
  await caret(0, 1);
  let c = await cap();
  assert.equal(c.none, true, 'rtl book, nothing chosen: no drop cap');
  assert.equal(c.ind, '0px', 'the opening paragraph keeps its no-indent rule');
  await openSeed('seed-en');
  await caret(0, 1);
  c = await cap();
  assert.equal(c.none, false, 'an English book keeps its drop cap');
  assert.equal(c.float, 'inline-start');
  assert.equal(c.padR, '8px', JSON.stringify(c));
  assert.equal(c.padL, '0px');
  // the writer picks a style: it shows in the Hebrew book too, on the right, padded on its inline end
  wc.send('menu', { type: 'dropCap', value: 'literary' });
  await tick(500);
  await openSeed('seed-para');
  await caret(0, 1);
  c = await cap();
  assert.equal(c.none, false, 'a chosen style is honoured in an rtl book');
  assert.equal(c.float, 'inline-start');
  assert.equal(c.padL, '8px', 'the gap is on the left, the inline end of a right-to-left line: ' + JSON.stringify(c));
  assert.equal(c.padR, '0px');
  wc.send('menu', { type: 'dropCap', value: 'none' });
  await tick(400);
  assert.equal((await cap()).none, true);
  await js(`delete library.fonts; applyFonts()`);
  // poetry and flush are symmetric / start-side only
  const geo = await js(`(() => {
    const body = document.querySelector('#paper .chapter-body');
    const mk = (cls) => { const p = document.createElement('p'); p.className = cls; p.textContent = 'x'; body.appendChild(p); const cs = getComputedStyle(p); const o = { ml: cs.marginLeft, mr: cs.marginRight, ind: cs.textIndent }; p.remove(); return o; };
    return { poetry: mk('poetry'), flush: mk('flush') };
  })()`);
  assert.equal(geo.poetry.ml, geo.poetry.mr);
  assert.equal(geo.poetry.ind, '0px');
  assert.equal(geo.flush.ind, '0px');
  await settle();
});

// ---- 3.7 fields ----
test('writer-typed fields take their direction from their first letter', async () => {
  await openSeed('seed-para');
  const dirs = await js(`['#tp-title', '#tp-subtitle', '#tp-author', '#search-input', '#replace-input'].map((s) => document.querySelector(s).getAttribute('dir'))`);
  assert.deepEqual(dirs, ['auto', 'auto', 'auto', 'auto', 'auto']);
  // an empty field still lies the way the interface does (an empty dir=auto box is ltr by the spec)
  const find = await js(`(() => { const i = document.querySelector('#search-input'); return { dir: getComputedStyle(i).direction, align: getComputedStyle(i).textAlign }; })()`);
  assert.equal(find.dir, RTL_UI ? 'rtl' : 'ltr', 'an empty field follows the interface until a letter is typed');
  const emptyCard = await js(`(() => { const d = document.createElement('div'); d.setAttribute('dir', 'auto'); d.contentEditable = 'true'; document.querySelector('#paper').appendChild(d); const r = getComputedStyle(d).direction; d.remove(); return r; })()`);
  assert.equal(emptyCard, 'rtl', 'an empty contenteditable in an rtl book follows the book');
  await js(`(() => { const i = document.querySelector('#search-input'); i.value = 'שלום'; })()`);
  assert.equal(await js(`getComputedStyle(document.querySelector('#search-input')).direction`), 'rtl', 'Hebrew typed in an English interface');
  await js(`document.querySelector('#search-input').value = ''`);
  // saved chapter files carry no screen dir from these
  await settle();
  assert.ok(!/dir=/.test(chapter('seed-para')));
  // the title-page and chapter heading
  const heads = await js(`[...document.querySelectorAll('#paper .ch-title')].map((e) => e.getAttribute('dir'))`);
  assert.ok(heads.length && heads.every((d) => d === 'auto'));
});

// ---- chapter-heading words follow the book's language ----
test('chapter words: a Hebrew book says פרק, an English book says Chapter, whatever the interface', async () => {
  // two chapters, so the headings show
  await openSeed('seed-flip');
  const heads = await js(`[...document.querySelectorAll('#paper .chapter-head .ch-num')].map((e) => e.textContent)`);
  assert.deepEqual(heads, ['פרק 1', 'פרק 2'], 'a Hebrew book');
  assert.equal(await js(`chapterName(book.chapterOrder[0])`), 'פרק 1');
  assert.equal(await js(`partLabel(2)`), 'חלק II');
  assert.equal(await js(`kindName('chapter')`), 'פרק');
  await openSeed('seed-en');
  await js(`newChapter()`);
  await tick(500);
  const en = await js(`[...document.querySelectorAll('#paper .chapter-head .ch-num')].map((e) => e.textContent)`);
  assert.deepEqual(en, ['Chapter 1', 'Chapter 2'], 'a book with no language');
  assert.equal(await js(`chapterName(book.chapterOrder[0])`), 'Chapter 1');
  // the interface's own words stay the interface's
  assert.equal(await js(`t('Chapter {n}', { n: 1 })`), L('Chapter 1', 'פרק 1'));
  // an English book with its language set, in a Hebrew interface
  await js(`book.language = 'en'; refreshBookWords()`);
  await tick(300);
  assert.equal(await js(`chapterName(book.chapterOrder[0])`), 'Chapter 1');
  await js(`delete book.language`);
});

test('a whole English paragraph can still be explicitly LTR inside an RTL book', async () => {
  await openSeed('seed-he');
  await caret(0, (await paraCount()) - 1);
  await enter();
  const n = (await paraCount()) - 1;
  await choose(PARA, TO_LTR);
  await type('A whole English paragraph.');
  assert.equal(await paraDir(0, n), 'ltr');
  assert.equal(await paraAttr(0, n), 'ltr');
  await settle();
  assert.ok(chapter('seed-he').includes('<p dir="ltr">A whole English paragraph.</p>'));
});

test('an explicitly RTL paragraph in an English book keeps an English opening', async () => {
  await openSeed('seed-en');
  await caret(0, (await paraCount()) - 1);
  await enter();
  const n = (await paraCount()) - 1;
  // Same command as the menu; simple NEO hides it in an English book/interface.
  await js(`applyParaDir('rtl')`);
  await type('iPhone הוא הטלפון הכי טוב כרגע.');
  assert.equal(await paraDir(0, n), 'rtl');
  assert.equal(await paraAttr(0, n), 'rtl');
  await settle();
  assert.ok(chapter('seed-en').includes('<p dir="rtl">iPhone הוא הטלפון הכי טוב כרגע.</p>'));
});

for (const id of ['seed-he', 'seed-en']) {
  test(id + ': book and chapter notes share typing direction, history cleanup, paste and D2 saves', async () => {
    await js(`(async () => { for (const f of FEATURES) if (f.key !== 'vim') await setFeature(f.key, true); })()`); await tick(300);
    await openSeed(id); const dir = await js('bookDirection()');
    await js(`switchTab('notes')`); await tick(500);
    for (const page of ['book', 'ch-1']) {
      await js(`openNotesPage(${JSON.stringify(page)})`); await tick(500);
      await js(`(() => { const e = document.querySelector('#aux-editor'); e.innerHTML = ''; e.focus(); getSelection().collapse(e, 0); })()`);
      await type('שלום');
      assert.equal(await js(`getComputedStyle(document.querySelector('#aux-editor p')).direction`), 'rtl');
      await enter(); await type('iPhone הוא הטלפון הכי טוב כרגע.');
      assert.equal(await js(`getComputedStyle(document.querySelectorAll('#aux-editor p')[1]).direction`), 'rtl', 'English opening preserves RTL in notes too');
      await enter();
      await js(`document.querySelector('#aux-editor p:last-child').dir = 'ltr'`);
      await tick(1300); await wc.insertText('Hi'); await tick(100);
      await js(`document.execCommand('undo')`); await tick(100);
      assert.equal(await js(`document.querySelector('#aux-editor p:last-child').getAttribute('dir')`), null, 'undo clears an empty paragraph direction');
      await js(`document.querySelector('#aux-editor p:last-child').dir = 'ltr'`);
      await type('English notes.');
      // Source notes may contain a redundant dir; normalize it only on save.
      await js(`document.querySelector('#aux-editor p').dir = 'rtl'; auxDirty = true; flushAux()`);
      await settle();
      const file = fs.readFileSync(path.join(lib, folderOf(id), page === 'book' ? 'notes.html' : 'notes-ch-1.html'), 'utf8');
      const saved = await js(`(() => { const d = document.createElement('div'); d.innerHTML = ${JSON.stringify(file)}; return [...d.children].map((p) => ({ text: p.textContent, dir: p.getAttribute('dir') })); })()`);
      assert.equal(saved[0].dir, dir === 'rtl' ? null : 'rtl');
      assert.equal(saved[1].dir, dir === 'rtl' ? null : 'rtl');
      assert.equal(saved[2].dir, dir === 'ltr' ? null : 'ltr');
      assert.equal(saved[2].text, 'English notes.');
      await js(`(() => { const e = document.querySelector('#aux-editor'); const p = document.createElement('p'); p.appendChild(document.createElement('br')); e.appendChild(p); getSelection().collapse(p, 0); const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(dir === 'rtl' ? 'Pasted English' : 'שלום מודבק')}); e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
      assert.equal(await js(`document.querySelector('#aux-editor p:last-child').getAttribute('dir')`), null, 'paste is not first-letter typing');
    }
    assert.equal(await js('bookDirection()'), dir, 'notes never infer or flip the manuscript direction');
    await js(`switchTab('manuscript')`);
    await js(`(async () => { for (const f of FEATURES) if (f.key !== 'vim') await setFeature(f.key, false); })()`); await tick(200);
  });
}

test('Windows and Linux: Ctrl+Right Shift and Ctrl+Left Shift flip the caret\'s paragraph', async () => {
  // the key handler is installed for a non-Mac platform only: pretend to be one and reload
  await js('backToShelf()');
  await tick(300);
  if (MAC) {
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setUserAgentOverride', { userAgent: wc.getUserAgent(), platform: 'Win32' });
    wc.reload();
    await tick(1500);
    while (!(await js(`typeof library !== 'undefined' && !!library && !!library.features`).catch(() => false))) await tick(50);
    await tick(500);
  }
  assert.equal(await js('IS_MAC'), false);
  await openSeed('seed-para');
  await caret(0, 0);
  const send = (type, code, extra = {}) => js(`document.activeElement.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { code: ${JSON.stringify(code)}, key: ${JSON.stringify(code.startsWith('Shift') ? 'Shift' : 'Control')}, ctrlKey: ${extra.ctrl !== false}, bubbles: true, cancelable: true }))`);
  await send('keydown', 'ControlLeft');
  await send('keydown', 'ShiftLeft');
  await send('keyup', 'ShiftLeft');
  await send('keyup', 'ControlLeft', { ctrl: false });
  await tick(200);
  assert.equal(await paraAttr(0, 0), 'ltr', 'Ctrl+Left Shift: left to right');
  assert.equal(await paraAttr(0, 1), null);
  // another key in between: nothing
  await send('keydown', 'ControlLeft');
  await send('keydown', 'ShiftRight');
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a', ctrlKey: true, bubbles: true }))`);
  await send('keyup', 'ShiftRight');
  await tick(100);
  assert.equal(await paraAttr(0, 0), 'ltr', 'a key between cancels it');
  await send('keydown', 'ShiftRight');
  await send('keyup', 'ShiftRight');
  await tick(200);
  assert.equal(await paraAttr(0, 0), null, 'Ctrl+Right Shift: right to left, the book\'s own');
  const rows = await js(`bookShortcutSections().find((s) => s.title === 'Formatting' || s.title.includes('Format')).rows.map((r) => r[1])`);
  assert.ok(rows.some((r) => /right to left/i.test(r)) || RTL_UI, 'listed in the shortcuts: ' + JSON.stringify(rows));
});


// ---- 4.1: the mixed-text suite, every case of the fixture, in the real editor ----
const MIXED = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hebrew', 'mixed-cases.json'), 'utf8'));
const CONTROLS = /[‎‏؜⁦-⁩‪-‮]/g;
const countControls = (s) => (s.match(CONTROLS) || []).length;
// one line per paragraph for the geometry; a style sheet of the test's own, so nothing reaches the file
async function noWrap() {
  await js(`(() => { if (document.getElementById('test-nowrap')) return; const st = document.createElement('style'); st.id = 'test-nowrap'; st.textContent = '.chapter-body p { white-space: nowrap !important; }'; document.head.appendChild(st); })()`);
}
// every UTF-16 unit of the paragraph with its box on screen (null for a unit with no width: marks, a collapsed space)
const glyphs = (b, p) => js(`(() => {
  const para = document.querySelectorAll('.chapter-body')[${b}].children[${p}];
  const t = para.textContent;
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const r = [...rangeFromOffsets(para, i, i + 1).getClientRects()].find((x) => x.width > 0);
    out.push({ ch: t[i], l: r ? r.left : null, r: r ? r.right : null });
  }
  const pb = para.getBoundingClientRect();
  const cs = getComputedStyle(para);
  return { text: t, g: out, pl: pb.left, pr: pb.right, indent: parseFloat(cs.textIndent), align: cs.textAlign };
})()`);
const MARK = /\p{Mn}/u;
// the letters that carry a box: not combining marks, not spaces
const solid = (G, from, to) => G.g.map((x, i) => ({ ...x, i })).filter((x) => x.i >= from && x.i < to && x.l !== null && !MARK.test(x.ch) && /\S/.test(x.ch));
function ascending(G, from, to, what) {
  const s = solid(G, from, to);
  assert.ok(s.length >= 2, `${what}: glyphs measured in ${G.text}`);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].l > s[i - 1].l, `${what}: ${s[i - 1].ch} then ${s[i].ch} should go left to right (${s[i - 1].l} ${s[i].l}) in ${G.text}`);
}
function descending(G, from, to, what) {
  const s = solid(G, from, to);
  assert.ok(s.length >= 2, `${what}: glyphs measured in ${G.text}`);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].l < s[i - 1].l, `${what}: ${s[i - 1].ch} then ${s[i].ch} should go right to left (${s[i - 1].l} ${s[i].l}) in ${G.text}`);
}
function at(G, str, nth = 0) {
  let from = -1;
  for (let k = 0; k <= nth; k++) from = G.text.indexOf(str, from + 1);
  assert.ok(from >= 0, `"${str}" in ${G.text}`);
  return { from, to: from + str.length };
}
const leftOf = (G, a, b, what) => assert.ok(G.g[a].l < G.g[b].l, `${what}: ${G.g[a].ch} should be left of ${G.g[b].ch} in ${G.text}`);
const isLeftmost = (G, i, what) => {
  const min = Math.min(...solid(G, 0, G.text.length).map((x) => x.l));
  assert.ok(G.g[i].l <= min + 0.5, `${what}: ${JSON.stringify(G.g[i].ch)} should be the leftmost glyph (${G.g[i].l} vs ${min}) in ${G.text}`);
};
// stays together, in this order, left to right, with no gap bigger than a space
function oneGroup(G, str, what) {
  const { from, to } = at(G, str);
  ascending(G, from, to, what);
  for (let i = from + 1; i < to; i++) assert.ok(Math.abs(G.g[i].l - G.g[i - 1].r) < 2, `${what}: ${G.g[i - 1].ch}${G.g[i].ch} are not touching (${G.g[i - 1].r} ${G.g[i].l})`);
}
const lastIdx = (G) => G.text.length - 1;

// what each case claims, from its note and the plan's 4.1 table. `period` cases end with a full stop that must be the line's far left.
const CHECK = {
  'english-mid': (G) => { const w = at(G, 'iPhone'); ascending(G, w.from, w.to, 'iPhone'); isLeftmost(G, lastIdx(G), 'the period'); },
  'english-end': (G) => {
    const ny = at(G, 'New York'); ascending(G, ny.from, ny.to, 'New York');
    leftOf(G, ny.from, ny.from + 4, 'one LTR run: New is left of York');
    isLeftmost(G, lastIdx(G), 'the period');
  },
  'english-start': (G) => {
    const w = at(G, 'iPhone'); ascending(G, w.from, w.to, 'iPhone');
    const he = at(G, 'הוא'); leftOf(G, he.from, w.from, 'the Hebrew follows iPhone to its left');
    isLeftmost(G, lastIdx(G), 'the period');
  },
  numbers: (G) => {
    const y = at(G, '2024'); ascending(G, y.from, y.to, '2024');
    const first = at(G, 'בשנת'); const mid = at(G, 'נסעתי');
    leftOf(G, y.from, first.from, '2024 sits left of the word before it'); leftOf(G, mid.from, y.from, 'the word after sits left of 2024');
    isLeftmost(G, lastIdx(G), 'the period');
  },
  'digits-first': (G) => { oneGroup(G, '2024', '2024'); leftOf(G, at(G, 'הייתה').from, at(G, '2024').from, 'the sentence runs left of the opening digits'); isLeftmost(G, lastIdx(G), 'the period'); },
  range: (G) => {
    // Bidi rules (N1): the dash between two numbers takes the numbers' side, so in an RTL paragraph the range shows as 20–10. That is Unicode, not a NEO fault; the digits of each number still read left to right.
    const a = at(G, '10'); const b = at(G, '20'); ascending(G, a.from, a.to, '10'); ascending(G, b.from, b.to, '20');
    leftOf(G, b.from, a.from, 'in an RTL line the second number of a range sits left of the first (Unicode)');
  },
  // the text carries an LRM before the minus (the 4.2 escape hatch): "-" stays glued to the left of 5
  minus: (G) => { const m = at(G, '-5'); assert.ok(G.text.includes('‎-5'), 'the fixture carries the LRM'); oneGroup(G, '-5', 'minus then 5'); leftOf(G, m.from, m.from + 1, '- is left of 5'); },
  phone: (G) => oneGroup(G, '050-1234567', 'phone'),
  time: (G) => oneGroup(G, '14:30', 'time'),
  date: (G) => oneGroup(G, '4.11.2026', 'date'),
  // ET before EN makes the symbol part of the number's LTR run: the symbol is on the number's left, touching it
  'currency-shekel': (G) => oneGroup(G, '₪120', 'shekel and number'),
  'currency-dollar': (G) => oneGroup(G, '$40', 'dollar and number'),
  'currency-word': (G) => { oneGroup(G, '120', '120'); leftOf(G, at(G, 'ש״ח').from + 2, at(G, '120').from, 'the abbreviation follows the price to its left'); descending(G, at(G, 'ש״ח').from, at(G, 'ש״ח').to, 'ש״ח'); },
  parentheses: (G) => {
    const open = G.text.indexOf('('); const close = G.text.indexOf(')');
    leftOf(G, at(G, 'ראה').from, open, 'the opening bracket stands to the right of ראה'); // mirrored: the "(" glyph faces left
    const c = at(G, 'Chapter 3'); ascending(G, c.from, c.to, 'Chapter 3');
    leftOf(G, close, c.from, 'the closing bracket ends the group on the far left');
    leftOf(G, at(G, 'ובנספח').from, close, 'the word after the bracket sits left of it');
  },
  'english-sentence-inside': (G) => {
    const h = at(G, 'Hello, world'); ascending(G, h.from, h.to, 'Hello, world');
    // without a mark the ! takes the paragraph's direction (the plan's correction, 2026-11-04): left of Hello
    const bang = G.text.indexOf('!');
    leftOf(G, bang, h.from, 'without an LRM the ! shows left of Hello, as in Word and Docs');
  },
  'english-paragraph': (G) => {
    ascending(G, 0, G.text.length, 'English sentence');
    assert.ok(G.align === 'left' || G.align === 'start', G.align);
    assert.ok(Math.abs(G.g[0].l - (G.pl + G.indent)) < 3, 'its indent is on the left');
  },
  url: (G) => { const u = at(G, 'https://example.com/books'); ascending(G, u.from, u.to, 'URL'); },
  email: (G) => { const e = at(G, 'dana@example.com'); ascending(G, e.from, e.to, 'email'); },
  percent: (G) => oneGroup(G, '85%', '85%'),
  gershayim: (G) => { const w = at(G, 'בצה״ל'); descending(G, w.from, w.to, 'the acronym'); isLeftmost(G, lastIdx(G), 'the period'); },
  geresh: (G) => { const w = at(G, 'ז׳אנר'); descending(G, w.from, w.to, 'the loanword'); },
  'numeral-letters': (G) => descending(G, 0, G.text.length, 'Hebrew letter numeral and the words'),
  niqqud: (G) => descending(G, 0, G.text.length, 'the letters under their points'),
  'niqqud-only-start': (G) => descending(G, 0, G.text.length, 'the letters after the points'),
  maqaf: (G) => { const w = at(G, 'בית־ספר'); descending(G, w.from, w.to, 'maqaf joins the words'); },
  poetry: (G) => descending(G, 0, G.text.length, 'the line')
};
// cases typed key by key, as a keyboard does; the rest arrive with insertText (a paste-like insertion, but not Paste)
const TYPED = new Set(['english-mid', 'english-end', 'english-start', 'phone', 'time', 'date']);

test('4.1: all 27 mixed cases in an RTL book: resolved direction, visual order, and the saved file', async () => {
  await openSeed('seed-mixed');
  await noWrap();
  const cases = MIXED.filter((c) => c.id !== 'hebrew-in-english-book'); // that one is an English book's: the mirror test below
  assert.equal(MIXED.length, 27);
  const chosen = [];
  const n = await paraCount();
  await caret(0, n - 1);
  let first = true;
  for (const c of cases) {
    if (!first) {
      await caret(0, (await paraCount()) - 1);
      await enter();
      await js(`document.querySelectorAll('.chapter-body')[0].lastElementChild.removeAttribute('dir')`); // whatever Enter carried over
    }
    first = false;
    const idx = (await paraCount()) - 1;
    await caret(0, idx);
    if (c.paragraphDir === 'ltr') await choose(PARA, TO_LTR); // a whole LTR paragraph in an RTL book is an explicit choice (D4)
    win.focus(); wc.focus();
    if (TYPED.has(c.id)) await type(c.text); else { wc.insertText(c.text); await tick(120); }
    const G = await glyphs(0, idx);
    assert.equal(G.text, c.text, c.id + ': the text arrived as written');
    assert.equal(await paraDir(0, idx), c.paragraphDir, c.id + ': resolved direction (' + c.note + ')');
    assert.equal(await paraAttr(0, idx), c.paragraphDir === 'ltr' ? 'ltr' : null, c.id + ': dir only where it differs from the book');
    try { CHECK[c.id](G); } catch (err) { err.message = c.id + ': ' + err.message; throw err; }
    chosen.push(c);
  }
  assert.equal(chosen.length, 26);
  // an LRM after the exclamation mark keeps it with "world" (the 4.2 escape hatch), and the writer's own mark is saved, nothing else is
  const q = MIXED.find((c) => c.id === 'english-sentence-inside');
  await caret(0, (await paraCount()) - 1);
  await enter();
  await js(`document.querySelectorAll('.chapter-body')[0].lastElementChild.removeAttribute('dir')`);
  const withMark = q.text.replace('!', '!‎');
  wc.insertText(withMark);
  await tick(120);
  const lastP = (await paraCount()) - 1;
  const G = await glyphs(0, lastP);
  const bang = G.text.indexOf('!'); const dEnd = G.text.indexOf('world') + 4;
  assert.ok(G.g[bang].l > G.g[dEnd].l, 'with an LRM the ! is right of the d');
  assert.ok(Math.abs(G.g[bang].l - G.g[dEnd].r) < 2, 'and touches world');
  await settle();
  const file = chapter('seed-mixed');
  for (const c of chosen) if (c.paragraphDir !== 'ltr') assert.ok(file.includes('<p>' + c.text + '</p>'), c.id + ' in the file: ' + file);
  assert.ok(file.includes('<p dir="ltr">' + MIXED.find((c) => c.id === 'english-paragraph').text + '</p>'), 'the English paragraph carries dir=ltr');
  assert.equal((file.match(/dir=/g) || []).length, 1, 'only the English paragraph carries a dir');
  const own = chosen.reduce((a, c) => a + countControls(c.text), 0) + countControls(withMark);
  assert.equal(countControls(file), own, 'no direction controls beyond the ones the cases carry');
  assert.ok(!/test-nowrap|white-space/.test(file), 'no test decoration in the file');
  assert.equal(metaOf('seed-mixed').direction, 'rtl');
});

test('4.1 mirror: Hebrew inside an English book, and a Hebrew paragraph in it', async () => {
  await openSeed('seed-enmix');
  await noWrap();
  const n = await paraCount();
  // a Hebrew word and then a Hebrew sentence inside English paragraphs, typed key by key
  await caret(0, n - 1);
  await type('I said שלום to her.');
  let G = await glyphs(0, n - 1);
  assert.equal(await paraDir(0, n - 1), 'ltr');
  assert.equal(await paraAttr(0, n - 1), null);
  let w = at(G, 'שלום'); descending(G, w.from, w.to, 'the Hebrew word');
  ascending(G, 0, w.from - 1, 'English before'); ascending(G, w.to + 1, G.text.length, 'English after');
  leftOf(G, at(G, 'said').from, w.from, 'said is left of the Hebrew'); leftOf(G, w.from, at(G, 'to her').from, 'the Hebrew is left of "to her"');
  await enter();
  await type('She whispered שלום לכולם והלכה, then went on.');
  G = await glyphs(0, n);
  assert.equal(await paraDir(0, n), 'ltr');
  w = at(G, 'שלום לכולם והלכה'); descending(G, w.from, w.to, 'the Hebrew sentence');
  leftOf(G, at(G, 'whispered').from, w.to - 1, 'whispered is left of the Hebrew run');
  leftOf(G, w.from, at(G, 'then').from, 'the Hebrew run is left of what follows');
  ascending(G, at(G, 'then').from, G.text.length, 'English after');
  // a Hebrew paragraph in an English book: the first Hebrew letter makes it right to left, dir saved on that paragraph only
  const c = MIXED.find((x) => x.id === 'hebrew-in-english-book');
  await enter();
  await type(c.text);
  assert.equal(await paraDir(0, n + 1), 'rtl');
  assert.equal(await paraAttr(0, n + 1), 'rtl');
  G = await glyphs(0, n + 1);
  descending(G, 0, G.text.length, 'the Hebrew sentence');
  // points before the first letter do not decide; the letter does
  await enter();
  await type('ְַ בית');
  assert.equal(await paraDir(0, n + 2), 'rtl', 'the first letter is Hebrew');
  await settle();
  const file = chapter('seed-enmix');
  assert.ok(file.includes('<p>I said שלום to her.</p>'), file);
  assert.ok(file.includes('<p>She whispered שלום לכולם והלכה, then went on.</p>'), file);
  assert.ok(file.includes('<p dir="rtl">' + c.text + '</p>'), file);
  assert.equal((file.match(/<p>/g) || []).length, 3, 'English paragraphs carry no dir');
  assert.equal(countControls(file), 0, 'no direction controls added');
  assert.ok(!('direction' in metaOf('seed-enmix')) || metaOf('seed-enmix').direction !== 'rtl', 'the book stays English');
});

// ---- 7.3: paste keeps direction ----
// Clipboard HTML shaped by hand after what Word, Google Docs and Hebrew web
// pages put on the clipboard; not yet captured from the programs themselves.
const WORD_HTML = `<html><body lang=HE dir=RTL><p class=MsoNormal dir=RTL style='text-align:right;direction:rtl;unicode-bidi:embed'><span lang=HE>שלום עולם</span></p>
<p class=MsoNormal dir=LTR style='direction:ltr;unicode-bidi:embed'><span lang=EN-US>Hello there</span></p></body></html>`;
const DOCS_HTML = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c"><p dir="rtl" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;">שורה ראשונה</span></p><p dir="ltr" style="line-height:1.38;margin-top:0pt;"><span style="font-size:11pt;">English line</span></p></b>`;
const WEB_HTML = `<div dir="rtl"><p>פסקה אחת</p><p>English inside the rtl block</p></div><p>Outside</p>`;
const clean = (html, bookDir) => js(`cleanPasteHtml(${JSON.stringify(html)}, undefined, ${bookDir ? JSON.stringify({ bookDir }) : 'undefined'})`);

test('cleanPasteHtml: Word, Google Docs and a Hebrew page keep each paragraph\'s direction, as dir only where it differs (D2)', async () => {
  await openSeed('seed-paste');
  assert.equal(await clean(WORD_HTML, 'rtl'), '<p>שלום עולם</p><p dir="ltr">Hello there</p>');
  assert.equal(await clean(WORD_HTML, 'ltr'), '<p dir="rtl">שלום עולם</p><p>Hello there</p>');
  assert.equal(await clean(DOCS_HTML, 'rtl'), '<p>שורה ראשונה</p><p dir="ltr">English line</p>');
  assert.equal(await clean(WEB_HTML, 'rtl'), '<p>פסקה אחת</p><p>English inside the rtl block</p><p dir="ltr">Outside</p>');
  // blocks that say nothing: each paragraph's first strong letter; digits have none
  assert.equal(await clean('<p>שלום</p><p>Hello</p><p>2024</p>', 'ltr'), '<p dir="rtl">שלום</p><p>Hello</p><p>2024</p>');
  // a line break inside a block keeps the block's direction
  assert.equal(await clean('<p dir="rtl">שורה<br>Line</p>', 'ltr'), '<p dir="rtl">שורה</p><p dir="rtl">Line</p>');
  // one block lands inline: no paragraph, no dir
  assert.equal(await clean('<p dir="rtl">שלום</p>', 'ltr'), 'שלום');
  // embeddings go, the writer's LRM stays
  assert.equal(await clean('<p dir="rtl">\u202Bשלום\u202C \u200E-5</p><p>x</p>', 'rtl'), '<p>שלום \u200E-5</p><p dir="ltr">x</p>');
});

test('cleanPasteHtml: an English paste is as before, with or without a book', async () => {
  const en = '<p>It was <i>late</i>.</p><div>She <b>left</b>.</div><p>3</p>';
  const before = await clean(en);
  assert.equal(before, '<p>It was <i>late</i>.</p><p>She <b>left</b>.</p><p>3</p>');
  assert.equal(await clean(en, 'ltr'), before);
  assert.equal(await clean(WORD_HTML), '<p>שלום עולם</p><p>Hello there</p>', 'no book target (a darling): no dir, as before');
});

const pasteEvent = (data) => js(`(() => {
  const b = document.querySelectorAll('.chapter-body')[0];
  const dt = new DataTransfer();
  for (const [k, v] of Object.entries(${JSON.stringify(data)})) dt.setData(k, v);
  b.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
})()`);

test('pasting a Hebrew and an English paragraph into a Hebrew book: the file marks only the English one', async () => {
  await openSeed('seed-paste');
  await caret(0, 1);
  await pasteEvent({ 'text/html': '<p dir="rtl">שורה מודבקת בעברית.</p><p dir="ltr">Pasted English line.</p>', 'text/plain': 'x' });
  await tick(200);
  await settle();
  const file = chapter('seed-paste');
  assert.ok(file.includes('<p>שורה מודבקת בעברית.</p>'), file);
  assert.ok(file.includes('<p dir="ltr">Pasted English line.</p>'), file);
  assert.equal(countControls(file), 0, 'no direction controls added');
});

test('plain text: several lines take their own first letter; one Hebrew line into an empty English paragraph makes it rtl', async () => {
  await openSeed('seed-pastetext');
  await caret(0, 1);
  await pasteEvent({ 'text/plain': 'שורה ראשונה\nAn English line' });
  await tick(200);
  await settle();
  let file = chapter('seed-pastetext');
  assert.ok(file.includes('<p>שורה ראשונה</p>'), file);
  assert.ok(file.includes('<p dir="ltr">An English line</p>'), file);
  await openSeed('seed-pasteen');
  await caret(0, 1);
  await pasteEvent({ 'text/plain': 'שלום לכולם' });
  await tick(200);
  await settle();
  file = chapter('seed-pasteen');
  assert.ok(file.includes('<p dir="rtl">שלום לכולם</p>'), file);
  assert.ok(file.includes('<p>Hello world.</p>'), file);
  assert.notEqual(metaOf('seed-pasteen').direction, 'rtl', 'the book already has English: it stays');
});

// ---- run ----
async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library && !!library.features`).catch(() => false))) await tick(50);
    await tick(400);
    await js(`document.getElementById('firstrun').hidden = true`);
    win.focus();
    wc.focus();
    wc.on('console-message', (_e, level, message, line, source) => { if (level >= 2) console.log('     [page] ' + message + ' (' + String(source).split('/').pop() + ':' + line + ')'); });
    for (const t of tests) {
      try { await t.fn(); console.log('ok   ' + t.name); } catch (err) { failed++; console.log('FAIL ' + t.name + '\n     ' + String(err.stack || err.message).replace(/\n/g, '\n     ')); }
    }
    console.log(`\n[${LANG}] ${tests.length - failed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
