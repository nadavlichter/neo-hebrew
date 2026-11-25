// Hebrew typography through real keyboard dispatch in temporary books.
// Run node_modules/.bin/electron scripts/hebrew-typing.e2e.js.
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
  const pid = /^neo-hebrew-typing-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-hebrew-typing-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app')); app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'app', 'settings.json'), JSON.stringify({ uiLanguage: LANG }));
const lib = path.join(tmp, 'NEO Library'); fs.mkdirSync(lib);
for (const language of ['he', 'en', 'script']) {
  const folder = path.join(lib, 'typing-' + language); fs.mkdirSync(path.join(folder, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'book.json'), JSON.stringify({ id: 'typing-' + language, title: 'Typography', author: 'Dana', chapterOrder: ['ch-1'], language: language === 'en' ? 'en' : 'he', direction: language === 'he' ? 'rtl' : 'ltr', ...(language === 'script' ? { format: 'screenplay' } : {}) }));
  fs.writeFileSync(path.join(folder, 'chapters/ch-1.html'), '<p><br></p>');
}
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({ firstRunDone: true, moreFeatures: false, spellLanguage: 'fr', pageTheme: 'night', shelves: [{ id: 's1', name: 'Books', bookIds: ['typing-he', 'typing-en', 'typing-script'] }] }));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) { return loadFile.call(this, path.resolve(__dirname, '..', file), opts); };
require('../main.js');
let win, wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
const MAC = process.platform === 'darwin';
async function open(language) {
  if (await js('!!book')) { await js('backToShelf()'); await tick(100); }
  await js(`openBook('typing-${language}')`); await tick(300); win.focus(); wc.focus();
}
async function reset(language = 'he', html = '<p><br></p>') {
  if (await js('book && book.id') !== 'typing-' + language) await open(language);
  await js(`(() => { hebrewQuotePending = null; hebrewQuoteJustSet = null; const b = document.querySelector('.chapter-body'); b.innerHTML = ${JSON.stringify(html)}; b.focus(); currentChapterId = 'ch-1'; const r = document.createRange(); r.selectNodeContents(b.lastElementChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); b.lastElementChild.scrollIntoView({ block: 'nearest' }); })()`);
}
async function key(c, modifiers = []) {
  win.focus(); wc.focus();
  await js('window.lastTypingKey = null');
  const keyCode = c === ' ' ? 'Space' : c;
  const unicode = c.codePointAt(0) > 127;
  const input = { key: c, code: 'Unidentified', modifiers: modifiers.includes('alt') ? 1 : 0 };
  if (unicode) await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...input });
  else wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  let handled = null;
  for (let i = 0; i < 20 && handled === null; i++) { await tick(5); handled = await js('lastTypingKey'); }
  assert.notEqual(handled, null, 'keydown arrived for ' + c);
  if (!handled) wc.sendInputEvent({ type: 'char', keyCode: c, modifiers });
  if (unicode) await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...input });
  else wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await tick(10);
}
async function type(text) { for (const c of text) await key(c); }
async function undo() {
  if (MAC) {
    const e = { key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90 };
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...e, commands: ['Undo'] });
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...e });
  } else { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: ['control'] }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers: ['control'] }); }
  await tick();
}
const text = () => js(`document.querySelector('.chapter-body').lastElementChild.textContent`);
async function save() { await js(`flushAllSaves('tick')`); await tick(500); }
const saved = (language = 'he') => fs.readFileSync(path.join(lib, 'typing-' + language, 'chapters/ch-1.html'), 'utf8');
function item(label) {
  const strip = (s) => String(s || '').replace(/\u200f/g, '');
  const find = (items) => { for (const it of items) { if (!it.visible) continue; if (strip(it.label) === label) return it; const nested = it.submenu && find(it.submenu.items); if (nested) return nested; } return null; };
  return find(Menu.getApplicationMenu().items);
}
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
for (const [old, want] of [['', '“שלום”'], ['“ישן”', '“שלום”'], ['„ישן”', '„שלום”'], ['„ישן“', '„שלום“'], ['”ישן”', '”שלום”']]) {
  test('5.1 quotes preserve ' + (old || 'the high-curly default'), async () => {
    await reset('he', old ? '<p>' + old + '</p><p><br></p>' : '<p><br></p>');
    await type('"שלום"'); assert.equal(await text(), want);
    await save(); assert.ok(saved().includes(want));
  });
}
for (const [keys, want] of [['צה"ל', 'צה״ל'], ['ת"א', 'ת״א'], ['ד"ר', 'ד״ר'], ['י"ח', 'י״ח'], ['תשפ"ו', 'תשפ״ו'], ["ג'ירפה", 'ג׳ירפה'], ["ז'אנר", 'ז׳אנר'], ["צ'יפס", 'צ׳יפס'], ["פרופ'", 'פרופ׳']]) {
  test('5.2 Hebrew word mark: ' + keys, async () => {
    await reset(); await type(keys); assert.equal(await text(), want);
    await save(); assert.ok(saved().includes(want));
  });
}
test('5.2 immediate undo restores a straight quote and keeps the following letter', async () => {
  await reset(); await type('צה"ל'); await undo(); assert.equal(await text(), 'צה"ל');
  await save(); assert.ok(saved().includes('צה"ל'));
  await type('ים'); assert.equal(await text(), 'צה"לים', 'an undone conversion stays straight while writing continues');
  await reset(); await type("פרופ'"); await undo(); assert.equal(await text(), "פרופ'");
});
test('5.2 quotation boundaries and an abbreviation inside a quotation', async () => {
  await reset(); await type('"שלום" הוא אמר.'); assert.equal(await text(), '“שלום” הוא אמר.');
  await reset(); await type("'שלום'"); assert.equal(await text(), '‘שלום’');
  await reset(); await type("'ז'אנר'"); assert.equal(await text(), '‘ז׳אנר’');
});
test('5.2 acronym replacement across inline formatting preserves the letters and style', async () => {
  await reset('he', '<p>צ<i>ה</i></p>'); await type('"ל');
  assert.equal(await text(), 'צה״ל');
  assert.ok(await js(`document.querySelector('.chapter-body i').textContent.includes('ה')`));
});
test('5.2 Hebrew word marks work inside English prose without changing its direction', async () => {
  await reset('en'); await type('I use צה"ל here.'); assert.equal(await text(), 'I use צה״ל here.');
  assert.equal(await js(`getComputedStyle(document.querySelector('.chapter-body p')).direction`), 'ltr');
});
test('5.2 niqqud stays with its letter and a formatted quotation closes correctly', async () => {
  await reset(); await type('שָׁ"ל'); assert.equal(await text(), 'שָׁ״ל');
  await reset('he', '<p>“<i>שלום</i></p>'); await type('"'); assert.equal(await text(), '“שלום”');
});
test('5.2 paste and deliberately typed curly marks are not treated as abbreviation keys', async () => {
  await reset(); await wc.insertText('צה"ל'); await tick(); assert.equal(await text(), 'צה"ל');
  await reset(); await type('צה”ל'); assert.equal(await text(), 'צה”ל');
});
test('5.2 screenplay headings and character cues get no Hebrew word conversion', async () => {
  for (const cls of ['sp-heading', 'sp-character']) {
    await reset('script', '<p class="' + cls + '"><br></p>'); await type('צה"ל');
    assert.ok(!/[׳״]/.test(await text()));
  }
});
test('5.3 maqaf stays intact through direct/Alt input, brackets, and dash/ellipsis typing', async () => {
  await reset(); await type('בית'); await key('־', ['alt']); await type('ספר (חדש) [טוב] -- סוף...');
  assert.equal(await text(), 'בית־ספר (חדש) [טוב] — סוף…');
  await save(); assert.ok(saved().includes('בית־ספר'));
});
test('5.3 Insert Maqaf uses the native menu, saves and undoes', async () => {
  await reset(); await type('בית');
  const command = item(await js(`t('Insert Maqaf')`)); assert.ok(command); command.click(); await tick();
  assert.equal(await text(), 'בית־'); await save(); assert.ok(saved().includes('בית־'));
  await undo(); assert.equal(await text(), 'בית');
});
for (const [name, mark] of [['Left-to-Right', '\u200e'], ['Right-to-Left', '\u200f']]) {
  test('5.3 menu ' + name + ' Mark has its own undo step after typing', async () => {
    await reset(); await type('בית');
    const command = item(await js(`t(${JSON.stringify('Insert ' + name + ' Mark')})`)); assert.ok(command); command.click(); await tick();
    assert.equal(await text(), 'בית' + mark); await undo(); assert.equal(await text(), 'בית');
  });
}
test('5.3 Maqaf command follows D6 and stays out of scripts', async () => {
  await reset('en'); await tick(200); assert.equal(!!item(await js(`t('Insert Maqaf')`)), LANG === 'he');
  await open('script'); await tick(200); assert.equal(!!item(await js(`t('Insert Maqaf')`)), false);
});
test('5.4 Hebrew writing preserves iPhone/lowercase and gets no French spacing', async () => {
  await reset(); await type('iPhone i wait ! שלום. hello : סוף');
  assert.equal(await text(), 'iPhone i wait ! שלום. hello : סוף');
  assert.equal(await js(`capitalSlips(document.querySelector('.chapter-body')).length`), 0);
});
test('5.4 English capitalization survives in a Hebrew interface', async () => {
  await reset('en'); await type('quiet i wait.'); assert.equal(await text(), 'Quiet I wait.');
});
test('5.4 Hebrew typography proof page saves exactly what is displayed', async () => {
  await reset(); await type('"שלום" צה"ל ז\'אנר בית־ספר iPhone.');
  const want = '“שלום” צה״ל ז׳אנר בית־ספר iPhone.';
  assert.equal(await text(), want);
  assert.equal(await js(`getComputedStyle(document.querySelector('.chapter-body p')).direction`), 'rtl');
  await save(); assert.ok(saved().includes(want));
  assert.ok(!/[\u200e\u200f\u061c\u2066-\u2069]/.test(saved()), 'no automatic bidi controls');
  if (process.env.NEO_HEBREW_SHOTS) {
    fs.mkdirSync(process.env.NEO_HEBREW_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.NEO_HEBREW_SHOTS, LANG + '-typography.png'), (await wc.capturePage()).toPNG());
  }
});
async function main() {
  await app.whenReady(); let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(); wc = win.webContents;
    win.setBounds({ width: 1400, height: 900 }); wc.debugger.attach('1.3');
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick();
    await js(`document.getElementById('firstrun').hidden = true; window.lastTypingKey = null; window.addEventListener('keydown', (e) => { window.lastTypingKey = e.defaultPrevented; })`);
    const selected = tests.filter((t) => !process.env.NEO_TEST || t.name.includes(process.env.NEO_TEST));
    for (const t of selected) { try { await t.fn(); console.log('ok   ' + t.name); } catch (err) { failed++; console.log('FAIL ' + t.name + '\n' + String(err.stack || err)); } }
    console.log(`[${LANG}] ${selected.length - failed} passed, ${failed} failed`);
  } catch (err) { failed++; console.error(err); }
  finally { app.exit(failed ? 1 : 0); }
}
main();
