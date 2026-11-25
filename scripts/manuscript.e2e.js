// End-to-end test for File → Export → Manuscript Format…, on a throwaway
// library: the dialog starts from what NEO knows (the author's name, the
// Email Draft address, the book's byline, the header from them), the
// header's name follows the byline until it's changed by hand, Save as Word
// writes a .docx that NEO's own import reads back, Save as PDF writes the
// pages with the header on every page but the title page, and what was
// typed is kept for next time (the details for every book, the byline for
// this one). Run with `npm run test:manuscript` (under xvfb-run without a
// display).

'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-manuscript-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-manuscript-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const LIB = path.join(tmp, 'NEO Library');
fs.mkdirSync(LIB);
fs.writeFileSync(path.join(LIB, 'library.json'), JSON.stringify({
  authorName: 'Mary Ann Evans', emailAddress: 'mary@example.com', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night', hintShown: true,
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }]
}));
let beforeMs = null, beforePaged = null, baselineMs = false;
try {
  // an English manuscript is the PDF NEO's main makes (rtl-baseline.js)
  const { UPSTREAM, fileAt } = require('./rtl-baseline');
  beforeMs = fileAt(UPSTREAM, 'manuscript.js');
  beforePaged = fileAt(UPSTREAM, 'print/paged.polyfill.js');
  if (!beforeMs || !beforePaged) throw new Error('no history');
} catch { /* pinned parity explicitly skips without history */ }
const msLayouts = [];
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  if (path.basename(file).startsWith('neo-paged-')) {
    if (baselineMs && beforePaged) {
      const current = fs.readFileSync(path.join(__dirname, '..', 'print/paged.polyfill.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
      const page = fs.readFileSync(file, 'utf8'); assert.ok(page.includes(current));
      fs.writeFileSync(file, page.replace(current, () => beforePaged.replace(/<\/script/gi, '<\\/script')));
    }
    if (!this.webContents.__msProof) {
      this.webContents.__msProof = true;
      const print = this.webContents.printToPDF;
      this.webContents.printToPDF = async (options) => {
        const layout = await this.webContents.executeJavaScript(`(() => {
          const pages = [...document.querySelectorAll('.pagedjs_page')];
          const content = (p, side) => getComputedStyle(p.querySelector('.pagedjs_margin-' + side + ' .pagedjs_margin-content'), '::after').content;
          const row = document.querySelector('.contact .row1'); const spans = row && [...row.children];
          const c = document.createElement('canvas').getContext('2d'); c.font = '12pt "NEO Hebrew Mono"';
          return { dir: document.documentElement.dir, contact: spans && spans.map((s) => s.getBoundingClientRect().x), monoWidth: c.measureText('אבג').width / 48,
            pages: pages.map((p) => ({left:content(p,'top-left'),right:content(p,'top-right'),counter:p.style.counterReset,headerY:p.querySelector('.pagedjs_margin-top-left .pagedjs_margin-content').getBoundingClientRect().y-p.getBoundingClientRect().y,rightY:p.querySelector('.pagedjs_margin-top-right .pagedjs_margin-content').getBoundingClientRect().y-p.getBoundingClientRect().y})) };
        })()`);
        msLayouts.push(layout);
        return print.call(this.webContents, options);
      };
    }
  }
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');
const JSZip = require('jszip');

let wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(cond, ms = 20000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out waiting: ' + cond);
    await tick(80);
  }
}
const D = `document.getElementById('manuscript-dialog')`;
const val = (k) => js(`${D}.querySelector('[data-k="${k}"]').value`);
const setVal = (k, v) => js(`(() => { const el = ${D}.querySelector('[data-k="${k}"]'); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const has = (cmd) => { try { execFileSync(cmd, ['-v'], { stdio: 'ignore' }); return true; } catch (err) { return err.code !== 'ENOENT'; } };
async function shot(name) {
  if (!process.env.NEO_TEST_SHOTS) return;
  const img = await wc.capturePage();
  fs.writeFileSync(path.join(process.env.NEO_TEST_SHOTS, name + '.png'), img.toPNG());
}

const STORY = 'The tide came in over the stones, and the gulls rose. The harbor light turned.';
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the dialog starts from what NEO knows', async () => {
  await js(`(() => { window.__ms = doExport('manuscript'); })()`);
  await until(() => js(`!!${D}`));
  assert.equal(await val('name'), 'Mary Ann Evans');
  assert.equal(await val('email'), 'mary@example.com');
  assert.equal(await val('byline'), 'M. A. Evans');
  assert.equal(await val('headerName'), 'Evans');
  assert.equal(await val('headerTitle'), 'THE CURSE');
  assert.equal(await js(`${D}.querySelector('.ms-header-eg').textContent`), 'At the top right: Evans / THE CURSE / 1');
  assert.match(await js(`${D}.querySelector('.ms-count').textContent`), /^about \d[\d,]* words on the title page \(\d[\d,]* counted\)\.$/);
  assert.equal(await js(`${D}.querySelector('input[name="ms-font"]:checked').value`), 'times');
  assert.equal(await js(`${D}.querySelector('[data-k="end"]').checked`), true);
  // the header's name follows the byline, until it's changed by hand
  await setVal('byline', 'George H. Eliot');
  assert.equal(await val('headerName'), 'Eliot');
  await setVal('headerName', 'GEliot');
  await setVal('byline', 'George Eliot');
  assert.equal(await val('headerName'), 'GEliot');
  await setVal('headerName', 'Eliot');
  await setVal('address', '123 Main Street\nSpringfield, IL 62701');
  await setVal('phone', '(555) 555-0100');
  await shot('manuscript-dialog');
  // Cancel writes nothing and keeps nothing
  await js(`${D}.querySelector('.m-cancel').click()`);
  assert.equal(await js(`!!${D}`), false);
  assert.equal(await js(`library.manuscript === undefined`), true);
});

test('Save as Word: the .docx, which NEO\'s own import reads back', async () => {
  const to = path.join(tmp, 'curse-manuscript.docx');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: to });
  await js(`(() => { window.__ms = doExport('manuscript'); })()`);
  await until(() => js(`!!${D}`));
  await setVal('byline', 'George Eliot');
  await setVal('address', '123 Main Street\nSpringfield, IL 62701');
  await setVal('phone', '(555) 555-0100');
  await js(`${D}.querySelector('.ms-docx').click()`);
  await until(() => fs.existsSync(to) && fs.statSync(to).size > 0);
  await tick(300);
  const zip = await JSZip.loadAsync(fs.readFileSync(to));
  const doc = await zip.file('word/document.xml').async('string');
  const hdr = await zip.file('word/header1.xml').async('string');
  assert.ok(doc.includes('>Mary Ann Evans<'), 'the contact block');
  assert.ok(doc.includes('>123 Main Street<') && doc.includes('>Springfield, IL 62701<') && doc.includes('>(555) 555-0100<') && doc.includes('>mary@example.com<'));
  assert.ok(doc.includes('>by George Eliot<'));
  assert.ok(doc.includes('>THE CURSE<') === false && doc.includes('>The Curse<'), 'the title as written on the title page');
  assert.ok(hdr.includes('Eliot / THE CURSE / '));
  assert.ok(doc.includes('<w:rStyle w:val="Emphasis"/></w:rPr><w:t xml:space="preserve">old</w:t>'), 'italics kept');
  assert.ok(doc.includes('>#<'), 'the scene break');
  assert.ok(!doc.includes('All rights reserved'), 'the copyright page left out');
  assert.ok(doc.includes('>END<'));
  // NEO's own Word import reads it back: the story's words are all there
  const back = await js(`window.neo.importFiles([${JSON.stringify(to)}])`);
  const text = JSON.stringify(back);
  assert.ok(text.includes('The tide came in over the stones'), text.slice(0, 300));
  // kept: the details for every book, the byline for this one
  const lib = JSON.parse(fs.readFileSync(path.join(LIB, 'library.json'), 'utf8'));
  assert.deepEqual(lib.manuscript, { name: 'Mary Ann Evans', address: '123 Main Street\nSpringfield, IL 62701', phone: '(555) 555-0100', email: 'mary@example.com', font: 'times', end: true });
  assert.deepEqual(await js(`book.manuscript`), { byline: 'George Eliot' });
});

test('the next time, it starts where it was left', async () => {
  await js(`(() => { window.__ms = doExport('manuscript'); })()`);
  await until(() => js(`!!${D}`));
  assert.equal(await val('byline'), 'George Eliot');
  assert.equal(await val('headerName'), 'Eliot');
  assert.equal(await val('phone'), '(555) 555-0100');
  assert.equal(await js(`document.activeElement.classList.contains('ms-pdf')`), true, 'with the details there, Save as PDF has the focus');
  await js(`${D}.querySelector('.m-cancel').click()`);
});

test('a title with quotation marks comes through whole; "Anonymous" is no byline; never two dialogs', async () => {
  await js(`book.title = 'The "Real" Curse'; book.manuscript = undefined; window.__author = book.author; book.author = t('Anonymous'); library.authorName = ''`);
  await js(`(() => { window.__ms = doExport('manuscript'); })()`);
  await until(() => js(`!!${D}`));
  assert.equal(await val('headerTitle'), 'THE "REAL" CURSE');
  assert.equal(await val('byline'), '', 'not "Anonymous"');
  // the menu again, under the open dialog: no second one
  await js(`(() => { doExport('manuscript'); })()`);
  await tick(200);
  assert.equal(await js(`document.querySelectorAll('#manuscript-dialog').length`), 1);
  await js(`${D}.querySelector('.m-cancel').click()`);
  await js(`book.title = 'The Curse'; book.author = window.__author; book.manuscript = { byline: 'George Eliot' }; library.authorName = 'Mary Ann Evans'`);
});

test('Save as PDF: the title page, then the story from page 1 under the header', async () => {
  const to = path.join(tmp, 'curse-manuscript.pdf');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: to });
  await js(`(() => { window.__ms = doExport('manuscript'); })()`);
  await until(() => js(`!!${D}`));
  await js(`(() => { ${D}.querySelector('input[name="ms-font"][value="courier"]').checked = true; ${D}.querySelector('.ms-pdf').click(); })()`);
  await until(() => fs.existsSync(to) && fs.statSync(to).size > 0, 120000);
  await until(() => js(`/Exported: curse-manuscript\\.pdf \\(\\d+ pages\\)/.test($('#hint').textContent)`));
  const pages = +(await js(`$('#hint').textContent.match(/\\((\\d+) pages\\)/)[1]`));
  assert.ok(pages >= 4, `${pages} pages`);
  assert.ok(fs.readFileSync(to).subarray(0, 5).toString() === '%PDF-');
  if (has('pdftotext')) {
    const page = (n) => execFileSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', to, '-']).toString();
    const one = page(1);
    assert.match(one, /Mary Ann Evans\s+about [\d,]+ words/);
    assert.match(one, /The Curse\s+by George Eliot/);
    assert.ok(!/\/ THE CURSE \//.test(one), 'no header on the title page');
    assert.match(page(2), /Eliot \/ THE CURSE \/ 1/);
    assert.match(page(3), /Eliot \/ THE CURSE \/ 2/);
    assert.match(page(2), /Chapter 1/);
    const all = execFileSync('pdftotext', ['-layout', to, '-']).toString();
    assert.ok(all.includes('#') && /\bEND\b/.test(all));
    const fonts = execFileSync('pdffonts', [to]).toString();
    assert.match(fonts, /CourierPrime/, 'Courier Prime set in the file');
    if (process.env.NEO_TEST_SHOTS && has('pdftoppm')) execFileSync('pdftoppm', ['-r', '40', '-png', '-l', '4', to, path.join(process.env.NEO_TEST_SHOTS, 'manuscript-pdf')]);
  } else console.log('     (pdftotext not here: the pages\' text not read back)');
  assert.equal(JSON.parse(fs.readFileSync(path.join(LIB, 'library.json'), 'utf8')).manuscript.font, 'courier');
  let errors = '';
  try { errors = fs.readFileSync(path.join(LIB, 'neo-errors.log'), 'utf8'); } catch { /* none */ }
  assert.equal(errors, '');
});

test('English manuscript PDF matches the pinned builder and Paged.js engine', async () => {
  if (!beforeMs || !beforePaged) { console.log('     skip parity with main: git history unavailable'); return; }
  await js(`(function(){const current=window.NeoManuscript;${beforeMs} window.__oldManuscript=window.NeoManuscript;window.NeoManuscript=current;})()`);
  const proof=await js(`(async()=>{const m=manuscriptModel(manuscriptDefaults(),manuscriptSections());const opts={fontFaces:await manuscriptFontFaces(m.font,m.dir)};const html=NeoManuscript.html(m,opts);if(html!==__oldManuscript.html(m,opts))throw Error('English manuscript HTML changed');return {html,paper:m.paper};})()`);
  const pdfs=[];
  for(const old of [true,false]) {
    baselineMs=old;const to=path.join(tmp,old?'ms-before.pdf':'ms-after.pdf');dialog.showSaveDialog=async()=>({canceled:false,filePath:to});
    await js(`window.neo.printManuscript({html:${JSON.stringify(proof.html)},paper:${JSON.stringify(proof.paper)},defaultName:'parity'})`);pdfs.push(fs.readFileSync(to));
  }
  baselineMs=false;
  const normalize=(p)=>p.toString('latin1').replace(/\/(CreationDate|ModDate) \(D:[^)]+\)/g,'/$1 (DATE)').replace(/\/ID\s*\[<[^>]+>\s*<[^>]+>\]/g,'/ID [ID]');
  assert.equal(normalize(pdfs[1]),normalize(pdfs[0]));
});

test('Hebrew manuscript Word: the real dialog, bidi/Cs formatting and NEO import round trip', async () => {
  const dir=path.join(LIB,'book-he');fs.mkdirSync(path.join(dir,'chapters'),{recursive:true});
  fs.writeFileSync(path.join(dir,'book.json'),JSON.stringify({id:'book-he',title:'הים השקט',author:'דנה לוי',language:'he',direction:'rtl',chapterOrder:['he1','he2'],chapterTitles:{he1:'האור',he2:'השיבה'}}));
  const line='<p>הגלים עלו אל החוף והאור נשאר בחלון. הוא אמר שלום וחזר אל הבית השקט.</p>';
  fs.writeFileSync(path.join(dir,'chapters/he1.html'),'<p>שלום <b>מודגש</b> ו<i>נטוי</i> עם iPhone בתוכו.<span class="fn" data-note="הערת שוליים HEBREWNOTE" contenteditable="false">​</span></p><p dir="ltr">An English exception stays left to right.</p><p class="scene-break">***</p>'+Array.from({length:30},(_,i)=>line.replace('<p>','<p>MSMARK'+String(i+1).padStart(3,'0')+' ')).join(''));
  fs.writeFileSync(path.join(dir,'chapters/he2.html'),Array.from({length:15},(_,i)=>line.replace('<p>','<p>MSMARK'+String(i+31).padStart(3,'0')+' ')).join(''));
  await js(`backToShelf();openBook('book-he')`);await tick(250);
  const to=path.join(tmp,'hebrew-manuscript.docx');dialog.showSaveDialog=async()=>({canceled:false,filePath:to});
  await js(`window.__ms=doExport('manuscript');undefined`);await until(()=>js(`!!${D}`));
  await setVal('name','דנה לוי');await setVal('address','רחוב הים 12\nתל אביב');await setVal('byline','דנה לוי');await setVal('headerName','לוי');await setVal('headerTitle','הים השקט');
  assert.match(await js(`${D}.querySelector('.ms-header-eg').textContent`),/^At the top left:/);
  const words=await js(`manuscriptModel(manuscriptDefaults(),manuscriptSections()).wordsText`);assert.ok(words.includes('מילים'));
  await js(`${D}.querySelector('.ms-docx').click()`);await until(()=>fs.existsSync(to)&&fs.statSync(to).size>0);await tick(250);
  const zip=await JSZip.loadAsync(fs.readFileSync(to));const doc=await zip.file('word/document.xml').async('string');const styles=await zip.file('word/styles.xml').async('string');
  assert.ok(doc.includes('<w:bidi w:val="0"/>'));assert.ok(styles.includes('<w:iCs/>')&&styles.includes('<w:bCs/>'));
  const back=await js(`window.neo.importFiles([${JSON.stringify(to)}])`);const paras=back.flatMap((b)=>b.chapters.flatMap((c)=>c.paras));
  const mixed=paras.find((p)=>p.text.includes('מודגש'));
  assert.equal(mixed.dir,'rtl');assert.ok(mixed.text.includes('**מודגש**')&&mixed.text.includes('*נטוי*'));
  assert.equal(paras.find((p)=>p.text.includes('English exception')).dir,'ltr');
  assert.ok(mixed.html && mixed.html.includes('HEBREWNOTE'), 'import keeps the native footnote marker');
  // Check the exported part too, alongside the body/note import round trip.
  const notes=await zip.file('word/footnotes.xml').async('string');
  assert.ok(notes.includes('הערת שוליים')&&notes.includes('HEBREWNOTE')&&notes.includes('<w:rtl/>'),'export retains Hebrew footnote words and run direction');
  if(process.env.NEO_PRINT_OUT){fs.mkdirSync(process.env.NEO_PRINT_OUT,{recursive:true});fs.copyFileSync(to,path.join(process.env.NEO_PRINT_OUT,'he-manuscript.docx'));}
});

test('Hebrew manuscript PDF: mirrored contact/header, mono pitch, all story text and italic', async () => {
  for(const font of ['times','courier']) {
    const to=path.join(tmp,'he-manuscript-'+font+'.pdf');dialog.showSaveDialog=async()=>({canceled:false,filePath:to});
    await js(`window.__ms=doExport('manuscript');undefined`);await until(()=>js(`!!${D}`));
    await js(`(()=>{${D}.querySelector('input[name="ms-font"][value="${font}"]').checked=true;${D}.querySelector('.ms-pdf').click();})()`);
    await until(()=>fs.existsSync(to)&&fs.statSync(to).size>0,120000);await until(()=>js(`!manuscriptBusy`));
    const layout=msLayouts.at(-1);assert.equal(layout.dir,'rtl');assert.ok(layout.contact[0]>layout.contact[1],'contact right, count left');
    assert.equal(layout.pages[0].left,'none');assert.ok(layout.pages.slice(1).every((p)=>p.left!=='none'&&p.right==='none'),'header on physical left');
    if(font==='courier'){assert.ok(Math.abs(layout.monoWidth-0.6)<0.01);assert.ok(fs.readFileSync(to).includes(Buffer.from('CourierNew')));}
    if(has('pdftotext')) {
      const text=execFileSync('pdftotext',[to,'-']).toString().replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g,'');
      assert.ok(text.includes('לוי')&&text.includes('הים השקט'));assert.ok(text.includes('English exception'));
      assert.ok(text.includes('הגלים עלו אל החוף'));assert.ok(text.includes('#'));assert.ok(text.includes('HEBREWNOTE'));assert.ok(text.includes('(555) 555-0100'),'phone retains LTR reading');for(let i=1;i<=45;i++)assert.ok(text.includes('MSMARK'+String(i).padStart(3,'0')),'PDF keeps manuscript paragraph '+i);
    }else console.log('     skip Hebrew PDF extraction: pdftotext unavailable');
    if(process.env.NEO_PRINT_OUT){fs.mkdirSync(process.env.NEO_PRINT_OUT,{recursive:true});fs.copyFileSync(to,path.join(process.env.NEO_PRINT_OUT,'he-manuscript-'+font+'.pdf'));fs.writeFileSync(path.join(process.env.NEO_PRINT_OUT,'he-manuscript-'+font+'-layout.json'),JSON.stringify(layout,null,2));}
  }
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick(50);
    await tick(300);
    const md = path.join(tmp, 'curse.md');
    const many = (n) => Array.from({ length: n }, () => STORY).join(' ');
    fs.writeFileSync(md, ['# The Harbor', 'She came back to the old house at dusk.', ...Array.from({ length: 30 }, () => many(3)), '* * *', many(2),
      '# Low Water', ...Array.from({ length: 30 }, () => many(3))].join('\n\n'));
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      const results = await window.neo.importFiles([${JSON.stringify(md)}]);
      await addImportedBooks(results, library.shelves[0]);
      const ids = library.shelves[0].bookIds;
      await openBook(ids[ids.length - 1]);
      book.title = 'The Curse';
      book.author = 'M. A. Evans';
      await saveMeta();
    })()`);
    await tick(800);
    win.focus();
    await js(`(() => {
      const p = document.querySelectorAll('.chapter-body')[0].querySelector('p');
      p.closest('.chapter-body').focus();
      const at = p.firstChild.data.indexOf('old');
      const r = document.createRange();
      r.setStart(p.firstChild, at); r.setEnd(p.firstChild, at + 3);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      document.execCommand('italic');
    })()`);
    await tick(1200);
    const selected = tests.filter((t) => !process.env.NEO_TEST || t.name.includes(process.env.NEO_TEST));
    for (const t of selected) {
      try {
        await t.fn();
        console.log('ok   ' + t.name);
      } catch (err) {
        failed++;
        console.log('FAIL ' + t.name + '\n     ' + String(err.stack || err.message).replace(/\n/g, '\n     '));
      }
    }
    console.log(`\n${selected.length - failed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
