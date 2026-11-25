// End-to-end tests for the typographic dash and ellipsis NEO sets as you type
// (-- becomes —, ... becomes …) in a book, and that a script keeps what is
// typed (#460). NEO runs on a throwaway library; each key goes to the page
// as a keydown and, where the page leaves it alone, is typed in as the engine
// would. A Hebrew script's keys, page and PDF are checked too (Phase 10).
// Run with `npm run test:script-keys`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A folder of its own for each run (see words.e2e.js for why earlier runs'
// folders are the ones removed).
for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-script-keys-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-script-keys-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'NEO Library'));
fs.writeFileSync(path.join(tmp, 'NEO Library', 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }]
}));
// run from scripts/, NEO's window would look for scripts/index.html
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

// every character as a key the page can answer; one it leaves alone is typed in
const typeKeys = (text) => js(`(() => {
  for (const c of ${JSON.stringify(text)}) {
    const e = new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(e);
    if (!e.defaultPrevented) document.execCommand('insertText', false, c);
  }
})()`);
// the caret at the end of the last line of the open book
const caretAtEnd = () => js(`(() => {
  const body = document.querySelector('.chapter-body');
  body.focus();
  const r = document.createRange();
  r.selectNodeContents(body.lastElementChild);
  r.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
})()`);
const lastLine = () => js(`document.querySelector('.chapter-body').lastElementChild.textContent`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('in a book, -- and ... become a dash and an ellipsis', async () => {
  await caretAtEnd();
  await typeKeys(' -- and... then');
  assert.equal(await lastLine(), 'Rain fell on the harbor — and… then');
});

test('in a script, -- and ... stay as typed, and so does a spaced hyphen', async () => {
  await js(`(async () => { await backToShelf(); await createScriptOnShelf(library.shelves[0]); })()`);
  await tick(500);
  assert.equal(await js('isScript()'), true);
  await js(`(() => {
    const body = document.querySelector('.chapter-body');
    body.innerHTML = '<p class="sp-heading">INT. KITCHEN - DAY</p><p>He waits</p>';
    syncChapter(body, book.chapterOrder[0]);
  })()`);
  await caretAtEnd();
  await typeKeys(' - then -- gone...');
  assert.equal(await lastLine(), 'He waits - then -- gone...');
});

// a key the script answers (Enter, Tab), sent to the line the caret is in
const press = (key, shift = false) => js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, shiftKey: ${shift}, bubbles: true, cancelable: true }))`);
const lines = () => js(`[...document.querySelector('.chapter-body').children].map((p) => [p.className.replace('sp-', '') || 'action', p.textContent])`);

test('a Hebrew script: mirrored page, cues by the cast and by @, Tab, (המשך), the PDF', async () => {
  await js(`(async () => { await backToShelf(); await createScriptOnShelf(library.shelves[0]); })()`);
  await tick(500);
  await js(`(() => {
    book.language = 'he';
    setBookDirection('rtl');
    const body = document.querySelector('.chapter-body');
    body.innerHTML = '<p class="sp-heading">פנים. מטבח - לילה</p><p>דנה נכנסת.</p><p class="sp-character">דנה</p><p class="sp-dialogue">שלום.</p><p>היא יושבת.</p>';
    syncChapter(body, book.chapterOrder[0]);
  })()`);
  assert.equal(await js(`document.getElementById('paper').dir`), 'rtl');
  // a name the script already has, then Enter: a character, and speech next
  await caretAtEnd();
  await press('Enter');
  await typeKeys('דנה');
  await press('Enter');
  await typeKeys('עוד משהו.');
  // Fountain's @ for a name the script doesn't have yet; the @ comes off
  await press('Enter');
  await press('Enter');
  await typeKeys('@יוסי');
  await press('Enter');
  await typeKeys('מה?');
  await press('Enter');
  // פנים. at the start of a line makes a heading as it's typed
  await typeKeys('חוץ. חוף - יום');
  await press('Enter');
  // Tab steps an action line to a character
  await typeKeys('רינה');
  await press('Tab');
  assert.deepEqual(await lines(), [
    ['heading', 'פנים. מטבח - לילה'], ['action', 'דנה נכנסת.'], ['character', 'דנה'], ['dialogue', 'שלום.'], ['action', 'היא יושבת.'],
    ['character', 'דנה'], ['dialogue', 'עוד משהו.'], ['character', 'יוסי'], ['dialogue', 'מה?'], ['heading', 'חוץ. חוף - יום'], ['character', 'רינה']
  ]);
  await tick(400);
  const geo = await js(`(() => {
    const paper = document.getElementById('paper');
    const page = document.getElementById('chapters').getBoundingClientRect();
    const em = parseFloat(getComputedStyle(paper).fontSize);
    const cue = document.querySelector('.chapter-body p.sp-character').getBoundingClientRect();
    const said = document.querySelector('.chapter-body p.sp-dialogue').getBoundingClientRect();
    const back = document.querySelectorAll('.chapter-body p.sp-character')[1];
    // the same pitch: ten Hebrew letters as wide as ten Latin ones
    const room = document.createElement('div');
    room.className = 'sp-geom';
    room.innerHTML = '<span>אבגדהוזחטי</span><br><span>ABCDEFGHIJ</span>';
    paper.appendChild(room);
    const [he, en] = [...room.querySelectorAll('span')].map((x) => x.getBoundingClientRect().width);
    room.remove();
    return { cueIn: (page.right - cue.right) / em, saidIn: (page.right - said.right) / em, he, en,
      contd: back.hasAttribute('data-contd') ? getComputedStyle(back, '::after').content : '',
      hebrewFace: document.fonts.check('12px "NEO Hebrew Mono"', 'א') };
  })()`);
  assert.ok(Math.abs(geo.cueIn - 22.2) < 0.1, 'the cue is 9em + 13.2em from the page\'s right: ' + geo.cueIn);
  assert.ok(Math.abs(geo.saidIn - 15) < 0.1, 'the speech is 9em + 6em from the right: ' + geo.saidIn);
  assert.ok(Math.abs(geo.he - geo.en) < 0.5, 'Hebrew at Courier Prime\'s pitch: ' + geo.he + ' vs ' + geo.en);
  assert.ok(geo.hebrewFace, 'the Hebrew mono face is there');
  assert.equal(geo.contd, '" (המשך)"');
  const pdf = await js('spPdfHtml()');
  assert.match(pdf, /<html lang="he" dir="rtl">/);
  assert.match(pdf, /\.num \{ right: auto; left: 1in; \}/);
  assert.match(pdf, /font-family: 'NEO Hebrew Mono'; src: local\('Courier New'\)/);
  assert.match(pdf, /דנה \(המשך\)/);
});

test('an English script\'s PDF carries no direction and no Hebrew face', async () => {
  await js(`(async () => { await backToShelf(); await createScriptOnShelf(library.shelves[0]); })()`);
  await tick(500);
  await js(`(() => {
    const body = document.querySelector('.chapter-body');
    body.innerHTML = '<p class="sp-heading">INT. KITCHEN - DAY</p><p class="sp-character">KIM</p><p class="sp-dialogue">Hi.</p><p>She sits.</p><p class="sp-character">KIM</p><p class="sp-dialogue">Bye.</p>';
    syncChapter(body, book.chapterOrder[0]);
  })()`);
  assert.equal(await js(`document.getElementById('paper').dir`), 'ltr');
  const pdf = await js('spPdfHtml()');
  assert.match(pdf, /<html lang="[^"]*"><head>/);
  assert.doesNotMatch(pdf, /NEO Hebrew Mono|dir="rtl"/);
  assert.match(pdf, /KIM \(CONT'D\)/);
});

/* ---------- runner ---------- */

test('Final Draft import infers RTL by majority without changing English scripts', async () => {
  for (const he of [false,true]) {
    const lines = he ? [{type:'heading',runs:[{text:'פנים. בית - יום'}]},{type:'action',runs:[{text:'הבוקר היה שקט והים נח. '.repeat(8)}]}] : [{type:'heading',runs:[{text:'INT. HOUSE - DAY'}]},{type:'action',runs:[{text:'The quiet sea was still.'}]}];
    const xml=await js(`spToFdx(${JSON.stringify(lines)},{title:${JSON.stringify(he?'הים השקט':'The quiet sea')}})`);
    assert.ok(!/RightToLeft|Direction=|\u200f|\u200e/.test(xml),'no invented fields or added controls');
    const fp=path.join(tmp,he?'he.fdx':'en.fdx');fs.writeFileSync(fp,xml);
    await js(`backToShelf();(async()=>{const r=await window.neo.importFiles([${JSON.stringify(fp)}]);await addImportedBooks(r,library.shelves[0]);const ids=library.shelves[0].bookIds;await openBook(ids[ids.length-1]);})()`);await tick(500);
    assert.equal(await js('isScript()'),true);
    assert.equal(await js('bookDirection()'),he?'rtl':'ltr');
    assert.equal(await js('book.direction'),he?'rtl':undefined);
    if(he)assert.equal(await js('book.language'),'he');
  }
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    win.setBounds({ width: 1200, height: 800 });
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await addImportedBooks([{ name: 'Dashes', chapters: [
        { title: 'One', paras: [{ text: 'Rain fell on the harbor' }] }
      ] }], library.shelves[0]);
      const ids = library.shelves[0].bookIds;
      await openBook(ids[ids.length - 1]);
    })()`);
    await tick(300);
    win.focus();
    for (const t of tests) {
      try {
        await t.fn();
        console.log('ok   ' + t.name);
      } catch (err) {
        failed++;
        console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     '));
      }
    }
    console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
