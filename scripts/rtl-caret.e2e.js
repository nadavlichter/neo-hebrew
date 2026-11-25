// Native caret movement in mixed prose, and NEO's vim/script keys.
// Uses temporary books in both interface languages.
// Run with node_modules/.bin/electron scripts/rtl-caret.e2e.js.
'use strict';
const { app, BrowserWindow, Menu } = require('electron');
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
  const pid = /^neo-rtl-caret-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-rtl-caret-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'app', 'settings.json'), JSON.stringify({ uiLanguage: LANG }));
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const TEXT = { rtl: 'הספינות harbor 12345 חוזרות לנמל.', ltr: 'Quiet harbor 12345 הספינות return home.' };
for (const dir of ['rtl', 'ltr', 'script']) {
  const folder = path.join(lib, 'caret-' + dir);
  fs.mkdirSync(path.join(folder, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'book.json'), JSON.stringify({ id: 'caret-' + dir, title: 'Caret', author: 'Dana', chapterOrder: ['ch-1'], direction: dir === 'rtl' ? 'rtl' : 'ltr', ...(dir === 'script' ? { format: 'screenplay' } : {}) }));
  fs.writeFileSync(path.join(folder, 'chapters/ch-1.html'), dir === 'script' ? '<p class="sp-heading">INT. OFFICE - DAY</p><p class="sp-character">DANA</p><p class="sp-dialogue">Hello.</p><p class="sp-character">DA</p>' : '<p>' + TEXT[dir] + '</p>');
}
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({ authorName: '', firstRunDone: true, moreFeatures: true, pageTheme: 'night', fonts: { dropcap: 'none', dropcapChosen: true }, shelves: [{ id: 's1', name: 'Books', bookIds: ['caret-rtl', 'caret-ltr', 'caret-script'] }] }));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) { return loadFile.call(this, path.resolve(__dirname, '..', file), opts); };
require('../main.js');
let win, wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
const MAC = process.platform === 'darwin';
async function press(keyCode, modifiers = []) {
  win.focus(); wc.focus();
  // Injected Electron events do not pass through macOS's native key binding
  // translation. CDP carries the editing command that Cocoa normally supplies.
  const command = MAC && modifiers.includes('meta') && { Left: 'MoveToLeftEndOfLine', Right: 'MoveToRightEndOfLine', Z: 'Undo' }[keyCode];
  if (command) {
    const key = keyCode === 'Z' ? 'z' : 'Arrow' + keyCode;
    const code = keyCode === 'Z' ? 'KeyZ' : key;
    const event = { key, code, modifiers: 4, windowsVirtualKeyCode: { Left: 37, Right: 39, Z: 90 }[keyCode] };
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...event, commands: [command] });
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
  } else {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  }
  await tick();
}
async function open(dir) {
  if (await js('!!book')) { await js('backToShelf()'); await tick(100); }
  await js(`openBook('caret-${dir}')`); await tick(300);
  win.focus(); wc.focus();
}
async function reset(dir) {
  if (await js('book && book.id') !== 'caret-' + dir) await open(dir);
  await js(`(() => { vimEnabled = false; vimSetNav(false); const b = document.querySelector('.chapter-body'); b.innerHTML = '<p></p>'; b.firstChild.textContent = ${JSON.stringify(TEXT[dir])}; b.focus(); currentChapterId = 'ch-1'; })()`);
}
async function caret(at, last = false) {
  await js(`(() => { const b = document.querySelector('.chapter-body'); b.focus(); const p = ${last ? 'b.lastElementChild' : 'b.firstElementChild'}; const r = rangeFromOffsets(p, ${at}, ${at}); getSelection().removeAllRanges(); getSelection().addRange(r); p.scrollIntoView({ block: 'nearest' }); })()`);
  await tick();
}
const state = () => js(`(() => { const s = getSelection(); const p = s.focusNode.nodeType === 3 ? s.focusNode.parentElement.closest('p') : s.focusNode.closest('p'); const r = document.createRange(); r.selectNodeContents(p); r.setEnd(s.focusNode, s.focusOffset); const c = s.getRangeAt(0).cloneRange(); c.collapse(false); return { at: r.toString().length, x: c.getBoundingClientRect().left, text: p.textContent, selection: s.toString(), collapsed: s.isCollapsed }; })()`);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
for (const dir of ['rtl', 'ltr']) {
  for (const run of ['harbor', 'הספינות', '12345']) {
    const towardEnd = dir === 'rtl' ? 'Left' : 'Right', away = dir === 'rtl' ? 'Right' : 'Left';
    const visualSign = run === 'הספינות' ? -1 : 1;
    test(`${dir}: native arrows step one character monotonically in ${run}`, async () => {
      await reset(dir);
      const at = TEXT[dir].indexOf(run) + 1;
      await caret(at);
      let prev = await state();
      for (let i = 1; i <= 3; i++) {
        await press(towardEnd); const now = await state();
        assert.equal(now.at, at + i, 'one logical character within the run');
        assert.ok(visualSign * (now.x - prev.x) > 0, JSON.stringify({ prev, now })); prev = now;
      }
      for (let i = 2; i >= 0; i--) { await press(away); const now = await state(); assert.equal(now.at, at + i); assert.ok(visualSign * (now.x - prev.x) < 0); prev = now; }
    });
  }
  test(`${dir}: Shift+arrow selects English and Hebrew characters`, async () => {
    await reset(dir);
    for (const run of ['harbor', 'הספינות']) {
      const arrow = dir === 'rtl' ? 'Left' : 'Right';
      const at = TEXT[dir].indexOf(run) + 1; await caret(at);
      await press(arrow, ['shift']); await press(arrow, ['shift']);
      assert.equal((await state()).selection, TEXT[dir].slice(at, at + 2));
    }
  });
  test(`${dir}: platform word keys reach word boundaries`, async () => {
    await reset(dir);
    for (const run of ['harbor', 'הספינות', '12345']) {
      const startKey = dir === 'rtl' ? 'Right' : 'Left', endKey = dir === 'rtl' ? 'Left' : 'Right';
      const at = TEXT[dir].indexOf(run);
      await caret(at + 2); await press(startKey, [MAC ? 'alt' : 'control']); assert.equal((await state()).at, at, run + ' start');
      await caret(at + 2); await press(endKey, [MAC ? 'alt' : 'control']); assert.equal((await state()).at, at + run.length, run + ' end');
    }
  });
  test(`${dir}: line-end keys reach the platform boundaries`, async () => {
    await reset(dir);
    const at = TEXT[dir].indexOf('harbor') + 2;
    if (MAC) {
      const edges = await js(`(() => { const p = document.querySelector('.chapter-body p'); const rs = Array.from({ length: p.textContent.length }, (_, i) => rangeFromOffsets(p, i, i + 1).getBoundingClientRect()); return { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)) }; })()`);
      await caret(at); await press('Left', ['meta']); assert.ok(Math.abs((await state()).x - edges.left) < 2, 'Cmd+Left');
      await caret(at); await press('Right', ['meta']); assert.ok(Math.abs((await state()).x - edges.right) < 2, 'Cmd+Right');
    }
    await caret(at); await press('Home'); assert.equal((await state()).at, 0, 'Home');
    await caret(at); await press('End'); assert.equal((await state()).at, TEXT[dir].length, 'End');
  });
  test(`${dir}: Backspace/Delete remove the logical preceding/following character`, async () => {
    for (const run of ['harbor', 'הספינות', '12345']) {
      for (const key of ['Backspace', 'Delete']) {
      await reset(dir); const at = TEXT[dir].indexOf(run) + 2;
      await caret(at); await press(key);
      const cut = at - (key === 'Backspace' ? 1 : 0);
      assert.equal((await state()).text, TEXT[dir].slice(0, cut) + TEXT[dir].slice(cut + 1), run + ' ' + key);
      }
    }
  });
  test(`${dir}: vim h/l request native left/right; w/b/e/0/$ are logical`, async () => {
    await reset(dir);
    assert.equal(await js("(library.features = { ...(library.features || {}), vim: true }), featureOn('vim')"), true);
    await js('vimEnabled = true; vimSetNav(true)');
    for (const run of ['harbor', 'הספינות']) { for (const [key, direction] of [['H', 'left'], ['L', 'right']]) {
      const at = TEXT[dir].indexOf(run) + 3;
      await caret(at); await js(`getSelection().modify('move', '${direction}', 'character')`); const expected = await state();
      await caret(at); await press(key); const after = await state();
      assert.equal(after.at, expected.at, run + ' ' + key + ' uses native ' + direction);
      assert.equal(after.x, expected.x);
      assert.equal(Math.abs(after.at - at), 1);
    } }
    const start = TEXT[dir].indexOf('harbor');
    await caret(start); await press('E'); assert.equal((await state()).at, start + 5, 'e');
    await caret(start); await press('W'); assert.equal((await state()).at, start + 7, 'w');
    await press('B'); assert.equal((await state()).at, start, 'b');
    await caret(start + 2); await press('0'); assert.equal((await state()).at, 0, '0');
    await caret(start + 2); await js(`vimKey({ key: '$', code: 'Digit4', shiftKey: true, getModifierState: () => false })`); assert.equal((await state()).at, TEXT[dir].length, '$');
    await js('vimEnabled = false; vimSetNav(false)');
  });
}
for (const dir of ['ltr', 'rtl']) { test(`script: ${dir} ghost accepts only toward the logical end`, async () => {
  await open('script');
  await js(`(() => { const b = document.querySelector('.chapter-body'); b.lastElementChild.textContent = 'DA'; b.lastElementChild.dir = '${dir}'; })()`);
  await caret(2, true); await js('spRefreshGhost()');
  assert.equal(await js(`getComputedStyle(document.querySelector('.chapter-body p:last-child')).direction`), dir);
  assert.equal(await js(`spCaretAtEnd(document.querySelector('.chapter-body p:last-child'))`), true);
  assert.equal(await js(`document.querySelector('.chapter-body p:last-child').getAttribute('data-ghost')`), 'NA');
  await press(dir === 'rtl' ? 'Right' : 'Left');
  assert.equal((await state()).text, 'DA', 'opposite arrow does not accept');
  await caret(2, true); await js('spRefreshGhost()');
  await press(dir === 'rtl' ? 'Left' : 'Right');
  assert.equal((await state()).text, 'DANA');
}); }
// Mark insertion uses the native Format menu, including the keyboard undo path.
function menuItem(label) {
  const strip = (s) => String(s || '').replace(/\u200f/g, '');
  const find = (items) => {
    for (const item of items) {
      if (strip(item.label) === label) return item;
      const nested = item.submenu && find(item.submenu.items);
      if (nested) return nested;
    }
    return null;
  };
  return find(Menu.getApplicationMenu().items);
}
async function settle() {
  await js(`flushAllSaves('tick')`); await tick(1000);
}
for (const [name, mark] of [['Left-to-Right', '\u200e'], ['Right-to-Left', '\u200f']]) { test(`marks: native Insert ${name} Mark saves, and keyboard undo removes it`, async () => {
  await reset('rtl');
  const at = TEXT.rtl.indexOf('harbor') + 2; await caret(at);
  const label = await js(`t(${JSON.stringify('Insert ' + name + ' Mark')})`);
  const item = menuItem(label); assert.ok(item, label);
  item.click(); await tick();
  const expected = TEXT.rtl.slice(0, at) + mark + TEXT.rtl.slice(at);
  assert.equal((await state()).text, expected);
  await settle();
  const file = path.join(lib, 'caret-rtl', 'chapters/ch-1.html');
  assert.ok(fs.readFileSync(file, 'utf8').includes(expected), 'writer-inserted mark saved');
  await press('Z', [MAC ? 'meta' : 'control']);
  assert.equal((await state()).text, TEXT.rtl, 'Cmd/Ctrl+Z removed only the mark');
  await settle();
  assert.ok(!fs.readFileSync(file, 'utf8').includes(mark), 'undo saved');
}); }

test('marks: all seven controls show outside editable HTML, toggle off, and never change layout or the saved file', async () => {
  await reset('rtl');
  const text = 'א\u200eב\u200fג\u061cד \u2066ab\u2069 \u2067הו\u2069 \u2068xy\u2069.';
  await js(`(() => { const b = document.querySelector('.chapter-body'); b.firstElementChild.textContent = ${JSON.stringify(text)}; syncChapter(b, 'ch-1'); })()`);
  const body = await js(`document.querySelector('.chapter-body').innerHTML`);
  const captured = await js(`captureBody(document.querySelector('.chapter-body'))`);
  const boxes = () => js(`(() => { const p = document.querySelector('.chapter-body p'); return Array.from({ length: p.textContent.length }, (_, i) => { const r = rangeFromOffsets(p, i, i + 1).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }); })()`);
  const before = await boxes();
  await js('nbspMarksEnabled = true; applyNbspMarks()'); await tick(150);
  const marks = await js(`(() => { const layer = document.querySelector('.chapter > .shy-ticks'); const nodes = [...layer.querySelectorAll('.bidi-tick')]; return { codes: nodes.map((n) => n.dataset.bidi), visible: nodes.every((n) => n.textContent && n.getBoundingClientRect().height > 0), hidden: layer.getAttribute('aria-hidden'), pointer: getComputedStyle(layer).pointerEvents }; })()`);
  assert.equal(marks.codes.length, (text.match(/[\u200e\u200f\u061c\u2066-\u2069]/g) || []).length);
  assert.equal(new Set(marks.codes).size, 7);
  assert.equal(marks.visible, true); assert.equal(marks.hidden, 'true'); assert.equal(marks.pointer, 'none');
  assert.equal(await js(`document.querySelector('.chapter-body').innerHTML`), body);
  assert.equal(await js(`captureBody(document.querySelector('.chapter-body'))`), captured);
  assert.deepEqual(await boxes(), before, 'marks do not move any characters');
  if (process.env.NEO_RTL_SHOTS) {
    fs.mkdirSync(process.env.NEO_RTL_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.NEO_RTL_SHOTS, LANG + '-bidi-marks.png'), (await wc.capturePage()).toPNG());
  }
  await settle();
  assert.equal(fs.readFileSync(path.join(lib, 'caret-rtl', 'chapters/ch-1.html'), 'utf8'), captured);
  await js('nbspMarksEnabled = false; applyNbspMarks()'); await tick(100);
  assert.equal(await js(`document.querySelectorAll('.shy-ticks').length`), 0, 'off removes all screen marks');
});

async function main() {
  await app.whenReady(); let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick();
    wc = win.webContents; if (MAC) wc.debugger.attach('1.3'); win.setBounds({ width: 1400, height: 900 });
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
