// Outline cards read the way the book does: right to left in a Hebrew book,
// left to right in an English one; an RTL script's scene cards follow it, in both interfaces.
// Run with node_modules/.bin/electron scripts/rtl-outline.e2e.js.
'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const LANG = process.env.NEO_UI;
if (!LANG) {
  const { spawnSync } = require('node:child_process');
  let failed = 0;
  for (const lang of ['en', 'he']) {
    const r = spawnSync(process.execPath, [__filename], { stdio: 'inherit', env: { ...process.env, NEO_UI: lang } });
    if (r.status !== 0) failed++;
  }
  process.exit(failed ? 1 : 0);
}
for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-rtl-outline-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-rtl-outline-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'app', 'settings.json'), JSON.stringify({ uiLanguage: LANG }));
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const WORDS = { rtl: ['פתיחה', 'נמל', 'ספינה', 'גשם', 'לילה', 'בוקר', 'שוב'], ltr: ['Opening', 'harbor', 'ship', 'rain', 'night', 'morning', 'again'] };
const sections = (ws) => ws.map((w) => `<p>${w} ${w} ${w}.</p>`).join('<p class="scene-break">***</p>');
for (const dir of ['rtl', 'ltr', 'script']) {
  const folder = path.join(lib, 'cards-' + dir);
  fs.mkdirSync(path.join(folder, 'chapters'), { recursive: true });
  // a script that says rtl gets right-to-left scene cards (Phase 10)
  fs.writeFileSync(path.join(folder, 'book.json'), JSON.stringify({ id: 'cards-' + dir, title: 'Cards', author: 'Dana', chapterOrder: dir === 'script' ? ['ch-1'] : ['ch-1', 'ch-2'], direction: dir === 'ltr' ? 'ltr' : 'rtl', ...(dir === 'script' ? { format: 'screenplay' } : {}) }));
  if (dir === 'script') {
    fs.writeFileSync(path.join(folder, 'chapters/ch-1.html'), ['INT. OFFICE - DAY', 'EXT. PORT - NIGHT', 'INT. SHIP - DAY'].map((h) => `<p class="sp-heading">${h}</p><p>Dana waits.</p>`).join(''));
  } else {
    fs.writeFileSync(path.join(folder, 'chapters/ch-1.html'), sections(WORDS[dir]));
    fs.writeFileSync(path.join(folder, 'chapters/ch-2.html'), sections(WORDS[dir].slice(0, 2)));
  }
}
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({ authorName: '', firstRunDone: true, moreFeatures: true, outlineView: 'cards', pageTheme: 'night', fonts: { dropcap: 'none', dropcapChosen: true }, shelves: [{ id: 's1', name: 'Books', bookIds: ['cards-rtl', 'cards-ltr', 'cards-script'] }] }));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) { return loadFile.call(this, path.resolve(__dirname, '..', file), opts); };
require('../main.js');
let win, wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
async function press(keyCode) {
  win.focus(); wc.focus();
  wc.sendInputEvent({ type: 'keyDown', keyCode });
  wc.sendInputEvent({ type: 'keyUp', keyCode });
  await tick();
}
async function board(dir) {
  if (await js('!!book')) { await js('backToShelf()'); await tick(100); }
  await js(`openBook('cards-${dir}')`); await tick(300);
  await js(`switchTab('outline')`); await tick(200);
  return js(`(() => {
    const b = document.getElementById('outline-board');
    const cells = [...b.querySelectorAll('.ob-cell:not([data-new])')];
    const cs = getComputedStyle(cells[0]);
    return {
      shown: !b.hidden, attr: b.getAttribute('dir'), dir: getComputedStyle(b).direction,
      rects: cells.map((c) => { const r = c.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; }),
      first: { tl: cs.borderTopLeftRadius, tr: cs.borderTopRightRadius, ml: cs.marginLeft, mr: cs.marginRight },
    };
  })()`);
}
async function focusCard(i) {
  await js(`document.querySelectorAll('#outline-board .ob-cell:not([data-new])')[${i}].focus()`);
}
const focused = () => js(`[...document.querySelectorAll('#outline-board .ob-cell:not([data-new])')].indexOf(document.activeElement)`);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('rtl book: cards read right to left, the mat rounded on the right', async () => {
  const b = await board('rtl');
  assert.ok(b.shown);
  assert.equal(b.attr, null, 'the board inherits the book box, no attribute of its own');
  assert.equal(b.dir, 'rtl');
  assert.equal(b.rects[0].top, b.rects[1].top, 'same line');
  assert.ok(b.rects[0].left > b.rects[1].left, 'the first card is right of the second');
  assert.equal(b.first.tr, '10px'); assert.equal(b.first.tl, '0px');
  assert.equal(b.first.mr, '5px'); assert.equal(b.first.ml, '0px');
});
test('rtl book: ArrowLeft is the next card, ArrowRight the previous', async () => {
  await board('rtl');
  await focusCard(1);
  await press('Left'); assert.equal(await focused(), 2);
  await press('Right'); await press('Right'); assert.equal(await focused(), 0);
});
test('rtl book: a drop on a card\'s left half goes after it', async () => {
  await board('rtl');
  const r = await js(`(() => {
    const cells = [...document.querySelectorAll('#outline-board .ob-cell:not([data-new])')];
    const q = cells[1].getBoundingClientRect(), y = q.top + q.height / 2;
    const t = (x) => { const d = dragTarget({ src: { kind: 'section', cell: cells[3] }, x, y }); return [cells.indexOf(d.cell), d.side]; };
    const ch = cells.find((c, i) => i > 0 && c.dataset.kind === 'chapter') || cells[0];
    const cq = ch.getBoundingClientRect();
    const f = (x) => outlineFileTarget(x, cq.top + cq.height / 2).side;
    return { left: t(q.left + 4), right: t(q.right - 4), fileRight: f(cq.right - 4), fileLeft: f(cq.left + 4) };
  })()`);
  assert.deepEqual(r.left, [1, 'after']);
  assert.deepEqual(r.right, [1, 'before']);
  assert.equal(r.fileRight, 'before');
  assert.equal(r.fileLeft, 'after');
});
test('ltr book: unchanged, left to right', async () => {
  const b = await board('ltr');
  assert.equal(b.attr, null);
  assert.equal(b.dir, 'ltr');
  assert.ok(b.rects[0].left < b.rects[1].left);
  assert.equal(b.first.tl, '10px'); assert.equal(b.first.tr, '0px'); assert.equal(b.first.ml, '5px');
  await focusCard(1);
  await press('Right'); assert.equal(await focused(), 2);
  await press('Left'); await press('Left'); assert.equal(await focused(), 0);
  const side = await js(`(() => { const cells = [...document.querySelectorAll('#outline-board .ob-cell:not([data-new])')]; const q = cells[1].getBoundingClientRect(); return dragTarget({ src: { kind: 'section', cell: cells[3] }, x: q.left + 4, y: q.top + q.height / 2 }).side; })()`);
  assert.equal(side, 'before');
});
// Phase 10: a right-to-left script's scene cards follow it, like a book's
test('script: an rtl script\'s scene cards read right to left', async () => {
  const b = await board('script');
  assert.equal(b.attr, null);
  assert.equal(b.dir, 'rtl');
  assert.ok(b.rects[0].left > b.rects[1].left);
  await focusCard(0);
  await press('Left'); assert.equal(await focused(), 1);
});

async function main() {
  await app.whenReady(); let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick();
    wc = win.webContents; win.setBounds({ width: 1400, height: 900 });
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick();
    await js(`document.getElementById('firstrun').hidden = true`);
    const selected = tests.filter((t) => !process.env.NEO_TEST || t.name.includes(process.env.NEO_TEST));
    for (const t of selected) {
      try { await t.fn(); console.log('ok   ' + t.name); } catch (err) { failed++; console.log('FAIL ' + t.name + '\n' + String(err.stack || err)); }
    }
    console.log(`[${LANG}] ${selected.length - failed} passed, ${failed} failed`);
  } catch (err) { failed++; console.error(err); }
  finally { app.exit(failed ? 1 : 0); }
}
main();
