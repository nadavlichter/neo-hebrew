// Hebrew font coverage and export rendering in real Chromium.
// Run node_modules/.bin/electron scripts/hebrew-fonts.e2e.js.
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
  const pid = /^neo-hebrew-fonts-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-hebrew-fonts-test-${process.pid}-`));
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
async function fonts(selector) {
  const { root } = await wc.debugger.sendCommand('DOM.getDocument');
  const { nodeId } = await wc.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
  return (await wc.debugger.sendCommand('CSS.getPlatformFontsForNode', { nodeId })).fonts;
}
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
async function sample(stack, text = 'שָׁלוֹםעוֹלָם', style = '') {
  await js(`(async () => { const p = document.querySelector('.chapter-body p'); p.id = 'font-proof'; p.style.cssText = 'font-size:32px;line-height:1.8;text-indent:0;' + ${JSON.stringify(style)}; p.style.fontFamily = ${JSON.stringify(stack)}; p.textContent = ${JSON.stringify(text)}; await document.fonts.ready; })()`);
  return fonts('#font-proof');
}
for (const name of ['Georgia', 'Palatino', 'Baskerville', 'Hoefler Text', 'Iowan Old Style', 'Cambria', 'Constantia', 'Jost', 'iA Writer Quattro']) {
  test('6.1 Hebrew body companion for ' + name, async () => {
    const stack = await js(`bodyFontStack(${JSON.stringify(name)})`);
    const found = await sample(stack);
    assert.ok(found.length && found.every((f) => f.isCustomFont && f.familyName.includes(/Jost|Quattro/.test(name) ? 'Noto Sans Hebrew' : 'Frank Ruhl Libre')), JSON.stringify(found));
  });
}
test('6.1 both body companions cover Hebrew punctuation, shekel and presentation forms', async () => {
  for (const face of ['Serif', 'Sans']) {
    const found = await sample('"NEO Hebrew ' + face + '"', 'אבגדהוזחטיכךלמםנןסעפףצץקרשת־׳״₪◌שׁ');
    const unexpected = [];
    for (const char of '־׳״₪◌שׁ') {
      const actual = await sample('"NEO Hebrew ' + face + '"', char);
      if (actual.some((f) => !f.isCustomFont)) unexpected.push({ char, actual });
    }
    assert.ok(found.length && found.every((f) => f.isCustomFont && /Frank Ruhl Libre|Noto Sans Hebrew/.test(f.familyName)), JSON.stringify({found,unexpected}));
  }
});
test('6.1 Latin keeps its original font and rectangles in every built-in stack', async () => {
  for (const [name, base] of Object.entries(await js('BODY_FONTS'))) {
    const stack = await js(`bodyFontStack(${JSON.stringify(name)})`);
    const geometry = async (family) => {
      await sample(family, 'iPhone The quiet harbor 123.');
      return { fonts: await fonts('#font-proof'), rects: await js(`(() => { const n = document.querySelector('#font-proof').firstChild; return [...n.textContent].map((c,i) => { const r = document.createRange(); r.setStart(n,i); r.setEnd(n,i+1); const b = r.getBoundingClientRect(); return [b.x,b.y,b.width,b.height]; }); })()`) };
    };
    assert.deepEqual(await geometry(stack), await geometry(base), name);
  }
});
test('6.1 Linux aliases also get companions without changing the selected Latin family', async () => {
  const stacks = await js('LINUX_BODY_FONTS');
  for (const [name, base] of Object.entries(stacks)) {
    const stack = '"NEO Hebrew ' + (/sans-serif/.test(base) ? 'Sans' : 'Serif') + '", ' + base;
    const found = await sample(stack);
    assert.ok(found.every((f) => f.isCustomFont && /Frank Ruhl Libre|Noto Sans Hebrew/.test(f.familyName)), name);
    await sample(stack, 'The harbor');
    const latin = await fonts('#font-proof');
    assert.ok(latin.every((f) => f.isCustomFont && !/Hebrew|Frank Ruhl/.test(f.familyName)), JSON.stringify(latin));
  }
});
for (const [alias, want] of [['NEO Anton', 'Karantina'], ['NEO Bebas', 'Karantina'], ['NEO Abril', 'Suez One'], ['NEO Playfair', 'Frank Ruhl Libre'], ['NEO Cinzel', 'Frank Ruhl Libre'], ['NEO Oswald', 'Secular One'], ['NEO Josefin', 'Secular One'], ['NEO Baskerville', 'Frank Ruhl Libre']]) {
  test('6.2 cover companion for ' + alias, async () => {
    const found = await sample('"' + alias + '"', 'הספרהחדש', 'font-weight:' + (/Playfair|Cinzel/.test(alias) ? 900 : /Oswald|Josefin|Baskerville/.test(alias) ? 700 : 400));
    assert.ok(found.length && found.every((f) => f.isCustomFont && f.familyName.includes(want)), JSON.stringify(found));
  });
}
test('6.2 cover preparation loads Hebrew and italic shelf lines use the companion', async () => {
  await js(`NeoCovers.ready`);
  for (const kind of ['black', 'fat']) {
    await js(`(async () => { const el = document.createElement('div'); el.id='cover-proof'; el.className='book cv-${kind}'; el.innerHTML='<span class="b-title"><span id="cover-italic" class="b-line b-ital">הספר</span></span>'; document.body.appendChild(el); await document.fonts.ready; })()`);
    try {
      const found = await fonts('#cover-italic');
      assert.ok(found.length && found.every((f) => f.isCustomFont && f.familyName.includes('Frank Ruhl Libre')), JSON.stringify(found));
      assert.equal(await js(`getComputedStyle(document.querySelector('#cover-italic')).fontStyle`), 'italic');
    } finally { await js(`document.querySelector('#cover-proof').remove()`); }
  }
});
test('6.2 all three drop cap stacks have Hebrew glyphs', async () => {
  for (const [kind, stack] of Object.entries(await js('DROPCAP_FONTS'))) {
    const found = await sample(stack, 'א');
    assert.ok(found.length && found.every((f) => f.isCustomFont), kind + JSON.stringify(found));
  }
});
test('6.2 the interface fallback has bundled Hebrew', async () => {
  const found = await sample('"NEO Hebrew Sans", sans-serif', 'עברית');
  assert.ok(found.every((f) => f.familyName.includes('Noto Sans Hebrew') && f.isCustomFont));
});
test('6.3 italic and bold change real Hebrew ink; niqqud fits the line', async () => {
  for (const face of ['Serif', 'Sans']) {
    const data = await js(`(async () => {
      const family = '"NEO Hebrew ${face}"'; await document.fonts.load('700 64px ' + family, 'שָׁלוֹם');
      await document.fonts.load('italic 64px ' + family, 'שָׁלוֹם');
      const c = document.createElement('canvas'); c.width = 450; c.height = 150;
      const ctx = c.getContext('2d');
      const ink = (style) => { ctx.clearRect(0,0,450,150); ctx.font = style + ' 64px ' + family; ctx.fillText('שָׁלוֹם עוֹלָם', 20, 90); let hash = 0; for (const v of ctx.getImageData(0,0,450,150).data) hash = ((hash*31) ^ v) >>> 0; return hash; };
      ctx.font = '64px ' + family; const m = ctx.measureText('שָׁלוֹם בְּרֵאשִׁ֖ית');
      return { normal:ink('400'), bold:ink('700'), italic:ink('italic'), height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent };
    })()`);
    assert.notDeepEqual(data.italic, data.normal, face + ' slant');
    assert.notDeepEqual(data.bold, data.normal, face + ' bold');
    assert.ok(data.height < 64 * 1.8, face + ' niqqud fits');
    const found = await sample('"NEO Hebrew ' + face + '"', 'שָׁלוֹם', 'font-style:italic;font-weight:700;font-synthesis-weight:none;');
    assert.ok(found.length && found.every((f) => f.isCustomFont), JSON.stringify(found));
  }
});
test('6.3 Hebrew books retain synthesized italic under a Korean interface', async () => {
  const values = await js(`(() => { const h = document.documentElement; const old = h.lang; h.lang = 'ko'; try { return BOOK_DIR_BOXES.filter((s) => document.querySelector(s)).map((s) => { const el = document.querySelector(s); return [s, el.lang, getComputedStyle(el).fontSynthesisStyle]; }); } finally { h.lang = old; } })()`);
  assert.ok(values.length >= 3);
  for (const [selector, lang, synthesis] of values) { assert.equal(lang, 'he', selector); assert.equal(synthesis, 'auto', selector); }
});
test('6.3 exports embed the companion and its range; English exports omit it', async () => {
  const result = await js(`(async () => {
    library.fonts = {body:'Jost',dropcap:'none'}; applyFonts();
    const d = {title:'ספר',author:'דנה',sections:[{paras:[{html:'<i>שָׁלוֹם</i> <b>עולם</b>'}]}]};
    const he = await exportFontFaces(d);
    const en = await exportFontFaces({title:'Book',author:'Dana',sections:[{paras:[{html:'<i>Hello</i> <b>world</b>'}]}]});
    const metadata = await exportFontFaces({title:'Book',sections:[{byline:'&#x5d3;&#x5e0;&#x5d4;',paras:[{html:'Hello'}]}]});
    const first = firstFamily(exportBodyFont()), stack = exportBodyFont();
    library.fonts.body = 'Georgia'; applyFonts();
    const serif = await exportFontFaces(d);
    return {he,en,metadata,serif,first,stack};
  })()`);
  assert.ok(result.he.includes("font-family: 'NEO Hebrew Sans'"));
  assert.ok(/font-weight: 100 900/.test(result.he));
  assert.ok(/unicode-range:.*U\+590-5FF/i.test(result.he));
  assert.ok(result.he.includes('data:font/woff2;base64,'));
  assert.ok(result.he.includes("font-family: 'Jost'"), 'Latin font also embedded');
  assert.ok(!result.en.includes('NEO Hebrew'), 'no Hebrew payload in English export');
  assert.ok(result.metadata.includes('NEO Hebrew Sans'), 'Hebrew-only byline and numeric entities also embed');
  assert.equal(result.first, 'Jost', 'Word retains the Latin font name');
  const print = new BrowserWindow({show:false,webPreferences:{offscreen:true}});
  try {
    const html = `<html lang="he" dir="rtl"><meta charset="utf-8"><style>${result.he}${result.serif}body{font-family:${result.stack};font-size:28px;line-height:1.8}.serif{font-family:"NEO Hebrew Serif",Georgia,serif}</style><p>שָׁלוֹם עוֹלָם iPhone</p><p><i>שָׁלוֹם עוֹלָם</i></p><p><b>שָׁלוֹם עוֹלָם</b></p><div class="serif"><p>שָׁלוֹם עוֹלָם iPhone</p><p><i>שָׁלוֹם עוֹלָם</i></p><p><b>שָׁלוֹם עוֹלָם</b></p></div></html>`;
    const file = path.join(tmp,'proof.html'); fs.writeFileSync(file,html);
    await loadFile.call(print,file); await print.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
    const pdf = await print.webContents.printToPDF({printBackground:true});
    assert.ok(pdf.includes(Buffer.from('/FontFile2')) || pdf.includes(Buffer.from('/FontFile3')), 'PDF embeds font outlines');
    if (process.env.NEO_FONT_SHOTS) { fs.mkdirSync(process.env.NEO_FONT_SHOTS,{recursive:true}); fs.writeFileSync(path.join(process.env.NEO_FONT_SHOTS,LANG+'-fonts.pdf'),pdf); }
    assert.ok(pdf.includes(Buffer.from('NotoSansHebrew')), 'PDF uses bundled Hebrew: ' + [...pdf.toString('latin1').matchAll(/\/FontName\s*\/(\S+)/g)].map((m) => m[1]).join(', '));
    assert.ok(pdf.includes(Buffer.from('FrankRuhlLibre')), 'PDF uses bundled Hebrew serif');
  } finally { print.destroy(); }
});
test('6.3 proof page and saved text retain all marks and formatting', async () => {
  await js(`(() => { library.fonts={body:'Georgia',dropcap:'none'};applyFonts(); const b=document.querySelector('.chapter-body'); b.innerHTML='<p>iPhone הוא הטלפון הכי טוב כרגע.</p><p>שָׁלוֹם עוֹלָם — בְּרֵאשִׁ֖ית בָּרָ֣א</p><p><i>שָׁלוֹם עוֹלָם — נטוי</i></p><p><b>שָׁלוֹם עוֹלָם — מודגש</b></p><p><b><i>שָׁלוֹם עוֹלָם — מודגש ונטוי</i></b></p>'; chapterHTML['ch-1']=captureBody(b); b.closest('.chapter').scrollIntoView({block:'start'}); })()`);
  await js(`flushAllSaves('tick')`); await tick(400);
  const saved = fs.readFileSync(path.join(lib,'typing-he','chapters/ch-1.html'),'utf8');
  assert.ok(saved.includes('<i>שָׁלוֹם'));
  assert.ok(!saved.includes('font-proof') && !saved.includes('font-family'));
  if (process.env.NEO_FONT_SHOTS) { fs.mkdirSync(process.env.NEO_FONT_SHOTS,{recursive:true}); fs.writeFileSync(path.join(process.env.NEO_FONT_SHOTS,LANG+'-fonts.png'),(await wc.capturePage()).toPNG()); }
});
async function main() {
  await app.whenReady(); let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(); wc = win.webContents;
    win.setBounds({width:1400,height:900}); wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('DOM.enable'); await wc.debugger.sendCommand('CSS.enable');
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick();
    await js(`document.getElementById('firstrun').hidden=true; openBook('typing-he')`); await tick(300);
    const selected = tests.filter((t) => !process.env.NEO_TEST || t.name.includes(process.env.NEO_TEST));
    for (const t of selected) { try { await t.fn(); console.log('ok   '+t.name); } catch(err) { failed++; console.log('FAIL '+t.name+'\n'+String(err.stack||err)); } }
    console.log(`[${LANG}] ${selected.length-failed} passed, ${failed} failed`);
  } catch(err) { failed++;console.error(err); } finally { app.exit(failed?1:0); }
}
main();
