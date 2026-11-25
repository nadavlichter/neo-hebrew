// Pocket's real page/bridge with simulated Capacitor services. This exercises
// browser layout/input and the native PDF hand-off, not UIKit/Android printing.
'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const LANG = process.env.NEO_UI;
const PLATFORM = process.env.NEO_PLATFORM || 'android';
if (!LANG) {
  const { spawnSync } = require('node:child_process');
  let failed = 0;
  for (const platform of ['android','ios']) {
    for (const lang of ['en', 'he']) {
      const r = spawnSync(process.execPath, [__filename], { stdio: 'inherit', env: { ...process.env, NEO_UI: lang, NEO_PLATFORM:platform } });
      if (r.status !== 0) failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-pocket-rtl-'));
app.setPath('userData', tmp);
const OUT = process.env.NEO_POCKET_SHOTS || path.join(tmp, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const files = {};
const put = (file, data) => { files['NEO Library/' + file] = typeof data === 'string' ? data : JSON.stringify(data); };
put('library.json', { firstRunDone: true, authorName: 'Dana', pageTheme: 'night', moreFeatures: true, shelves: [{ id: 's1', name: 'Books', bookIds: ['book-he', 'book-en'] }] });
for (const [code, direction] of [['he', 'rtl'], ['en', 'ltr']]) {
  put('book-' + code + '/book.json', { id: 'book-' + code, title: code === 'he' ? 'הים השקט' : 'The quiet sea', author: 'Dana', language: code, direction, chapterOrder: ['ch1'], chapterTitles: { ch1: code === 'he' ? 'האור' : 'Light' } });
  put('book-' + code + '/chapters/ch1.html', code === 'he' ? '<p>iPhone הוא הטלפון הכי טוב כרגע.</p>\n<p>שָׁלוֹם לַעוֹלָם.</p>\n<p dir="ltr">An English exception.</p>\n' : '<p>The sea was quiet.</p>\n');
  put('book-' + code + '/notes.html', '');
}
// Storage and native callbacks are simulated; production bridge/page code is
// unchanged. Every write is recorded so an open/close cannot silently rewrite.
const bootstrap = `(() => {
  Object.defineProperty(navigator, 'language', {value:${JSON.stringify(LANG === 'he' ? 'he-IL' : 'en-US')}});
  const files = window.__pocketFiles = ${JSON.stringify(files)};
  window.__writes = []; window.__pdfs = []; window.__shares = [];
  window.__nativeListeners = {};window.__platform=${JSON.stringify(PLATFORM)};
  const norm = p => { const s=decodeURIComponent(p).replace('file:///mock/',''); return s.endsWith('/')?s.slice(0,-1):s; };
  const requireFile = p => { p=norm(p); if (!(p in files)) throw Error('ENOENT '+p); return p; };
  const fs = {
    mkdir: async()=>({}),
    readFile: async o=>({data:files[requireFile(o.path)]}),
    writeFile: async o=>{const p=norm(o.path); files[p]=o.data; window.__writes.push(p); return {uri:'file:///cache/'+p};},
    rename: async o=>{const a=requireFile(o.from),b=norm(o.to); files[b]=files[a]; delete files[a]; window.__writes.push(b);},
    deleteFile: async o=>{delete files[requireFile(o.path)];},
    stat: async o=>{const p=requireFile(o.path); return {size:files[p].length,mtime:100};},
    getUri: async o=>({uri:'file:///mock/'+o.path}),
    readdir: async o=>{const pre=norm(o.path)+'/';const children=new Map();for(const p of Object.keys(files)){if(!p.startsWith(pre))continue;const rel=p.slice(pre.length),name=rel.split('/')[0];children.set(name,{name,type:rel.includes('/')?'directory':'file',mtime:100,size:rel.includes('/')?0:files[p].length});}return {files:[...children.values()]};}
  };
  const keyboard={addListener:(n,f)=>{window.__nativeListeners[n]=f;},setStyle:async()=>{},setAccessoryBarVisible:async()=>{},hide:async()=>{},show:async()=>{}};
  const plugins={Filesystem:fs,Keyboard:keyboard,Share:{share:async o=>{window.__shares.push(o);}},NeoPdf:{print:async o=>{window.__pdfs.push(o);return {uri:'file:///cache/proof.pdf'};}},LibraryHome:{locate:async()=>({path:'file:///mock/NEO Library',cloud:false}),setKeyboard:async()=>{}},NeoBars:{keyboard:async()=>({hardware:true}),hide:async()=>{},set:async()=>{}}};
  window.Capacitor={getPlatform:()=>window.__platform||'android',Plugins:plugins,convertFileSrc:p=>p,registerPlugin:n=>plugins[n]};
})()`;
setTimeout(()=>{console.error('Pocket test timed out');app.exit(2);},90000).unref();
let win, wc;
const js = code => wc.executeJavaScript(code, true);
const tick = (ms = 70) => new Promise(resolve => setTimeout(resolve, ms));
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const rect = id => `(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};})()`;
async function open(code) {
  if (await js('!!book')) await js('backToShelf()');
  await js(`openBook('book-${code}')`); await tick(150);
}
async function reset(code = 'he', html = '<p><br></p>', aux = false) {
  await open(code);
  if (aux) await js(`switchTab('notes')`);
  await js(`(()=>{const b=document.querySelector(${JSON.stringify(aux ? '#aux-editor' : '.chapter-body')});b.innerHTML=${JSON.stringify(html)};b.focus();const r=document.createRange();r.selectNodeContents(b.lastElementChild||b);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);window.__editing=b;})()`);
}
async function mobileInput(text, inputType = 'insertReplacementText', composing = false) {
  // Insert through Chromium to retain a real engine undo item, but dispatch
  // the mobile event type to NEO instead of insertText. Not a hardware IME.
  await js(`(()=>{const b=__editing;const before=new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:${JSON.stringify(inputType)},data:${JSON.stringify(text)},isComposing:${composing}});if(!b.dispatchEvent(before))return;const suppress=e=>e.stopImmediatePropagation();b.addEventListener('input',suppress,true);document.execCommand('insertText',false,${JSON.stringify(text)});b.removeEventListener('input',suppress,true);b.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:${JSON.stringify(inputType)},data:${JSON.stringify(text)},isComposing:${composing}}));})()`);
}
async function save() { await js(`flushAllSaves('tick')`); await tick(120); }
// the notes page open in the editor: the book's, or (with chapter notes pages on) the chapter's own
async function saved(code = 'he', aux = false) { await save(); const file = aux ? (await js(`document.querySelector('#aux-editor').dataset.kind`)) + '.html' : 'chapters/ch1.html'; return js(`__pocketFiles['NEO Library/book-${code}/${file}']`); }
async function swipe(x, dx) {
  await js(`(()=>{for(const [type,at] of [['touchstart',${x}],['touchmove',${x + dx}]]){const e=new Event(type,{bubbles:true});Object.defineProperty(e,'touches',{value:[{clientX:at,clientY:300}]});document.body.dispatchEvent(e);}})()`); await tick(250);
}
test('14.1 copied helpers, Hebrew fonts and locales are the actual shared assets', async () => {
  for (const file of [...require('./app-files').APP_FILES,'styles.css','i18n.js','bidi.js','locales/he.json',...fs.readdirSync(path.join(root,'fonts')).filter(f=>f.includes('hebrew')).map(f=>'fonts/'+f)]) {
    assert.deepEqual(fs.readFileSync(path.join(root,'pocket/www',file)),fs.readFileSync(path.join(root,file)),file);
  }
  assert.equal(await js("IS_POCKET && !featureOn('formatting')"), true);
  assert.equal(await js('document.documentElement.dir'), LANG === 'he' ? 'rtl' : 'ltr');
});
test('14.1 both book directions open with no chapter writes or new bidi marks', async () => {
  for (const code of ['he','en']) {
    const before = await js(`__pocketFiles['NEO Library/book-${code}/chapters/ch1.html']`);
    await js('__writes=[]'); await open(code); await save();
    assert.equal(await js(`document.querySelector('#paper').dir`),code === 'he' ? 'rtl' : 'ltr');
    assert.equal(await js(`__pocketFiles['NEO Library/book-${code}/chapters/ch1.html']`),before);
    assert.equal(await js(`__writes.some(p=>p.includes('/chapters/'))`),false);
  }
});
test('14.1 new books use the device locale through the real Pocket bridge',async()=>{
  await js('backToShelf()');await js('createBookOnShelf(library.shelves[0])');await tick(300);
  const meta=await js('window.neo.readBookMeta(book.id)');
  if(LANG==='he'){assert.equal(meta.language,'he');assert.equal(meta.direction,'rtl');}
  else{assert.equal(meta.direction,undefined);}
});
test('14.1 phone/tablet bars, sheet and touch edges follow chrome, not book', async () => {
  for (const width of [390,768]) {
    win.setContentSize(width, 844); await tick(150); await open('he');
    await js("document.querySelector('.chapter-body').scrollIntoView({block:'start'});document.querySelector('#hint').hidden=true");await tick();
    const more=await js(rect('pocket-more')),nav=await js(rect('pocket-chapters'));
    assert.ok(more.x>=0 && more.right<=width+1); assert.ok(nav.x>=0 && nav.right<=width+1);
    assert.ok(LANG==='he' ? more.x<nav.x : more.x>nav.x);
    const start=LANG==='he'?width-2:2,sign=LANG==='he'?-1:1;
    await swipe(start,sign*80);
    assert.equal(await js(`document.querySelector('#nav-pane').classList.contains('open')`),true);
    const pane=await js(rect('nav-pane'));assert.ok(LANG==='he'?Math.abs(pane.right-width)<2:Math.abs(pane.x)<2,JSON.stringify({width,pane}));
    await swipe(width/2,-sign*80);
    assert.equal(await js(`document.querySelector('#nav-pane').classList.contains('open')`),false);
    await swipe(width-start,-sign*80);
    assert.equal(await js(`document.querySelector('#side-pane').classList.contains('open')`),true);
    await swipe(width/2,sign*80);
    assert.equal(await js(`document.querySelector('#side-pane').classList.contains('open')`),false);
    await js(`document.querySelector('#pocket-more').click()`);await tick();
    assert.equal(await js(`document.querySelector('#pocket-menu').hidden`),false);
    assert.ok(await js(`(()=>{const s=document.querySelector('#pocket-menu-sheet');return s.scrollWidth<=s.clientWidth+1;})()`));
    assert.equal(await js(`!!document.querySelector('[data-msg*="paragraphDirection"], [data-msg*="insert-bidi-mark"]')`),false);
    assert.equal(await js(`document.querySelector('#pocket-menu-sheet bdi').dir`),'ltr');
    if(LANG==='he')assert.ok(await js(`getComputedStyle(document.querySelector('#pocket-menu-sheet')).fontFamily.includes('NEO Hebrew Sans')`));
    await js('document.fonts.ready');
    fs.writeFileSync(path.join(OUT,`${PLATFORM}-${LANG}-sheet-${width}.png`),(await wc.capturePage()).toPNG());
    await js(`document.querySelector('#pocket-menu').hidden=true`);
    fs.writeFileSync(path.join(OUT,`${PLATFORM}-${LANG}-book-${width}.png`),(await wc.capturePage()).toPNG());
  }
});
test('14.1 drop-cap tick follows the book default and a writer choice',async()=>{
  const active="(()=>{const buttons=[...document.querySelectorAll('#pocket-menu-sheet button[data-msg]')];return buttons.filter(b=>b.classList.contains('on')).map(b=>JSON.parse(b.dataset.msg)).find(m=>m.type==='dropCap')?.value;})()";
  for(const code of ['he','en']){await open(code);await js("document.querySelector('#pocket-more').click()");assert.equal(await js(active),code==='he'?'none':'literary');await js("document.querySelector('#pocket-menu').hidden=true");}
  await open('he');await js("document.querySelector('#pocket-more').click();[...document.querySelectorAll('#pocket-menu-sheet button[data-msg]')].find(b=>{const m=JSON.parse(b.dataset.msg);return m.type==='dropCap'&&m.value==='literary';}).click()");await tick(150);
  assert.equal(await js(active),'literary');assert.equal(await js('library.fonts.dropcapChosen'),true);
  await js("[...document.querySelectorAll('#pocket-menu-sheet button[data-msg]')].find(b=>{const m=JSON.parse(b.dataset.msg);return m.type==='dropCap'&&m.value==='none';}).click()");await tick(150);await js("document.querySelector('#pocket-menu').hidden=true");
});
test('14.1 keyboard undo toolbar stays at the interface end edge',async()=>{
  await reset('he');await js('__nativeListeners.keyboardDidShow()');await tick();
  const bar=await js(rect('pocket-undo'));const width=win.getContentSize()[0];
  assert.ok(LANG==='he'?Math.abs(bar.x-12)<2:Math.abs(bar.right-(width-12))<2);
  assert.equal(await js("document.querySelector('#pocket-undo').hidden"),false);
  await js('__nativeListeners.keyboardDidHide()');
});
test('14.2 replacement text decides an empty LTR paragraph; RTL English openings stay RTL',async()=>{
  await reset('en');await mobileInput('שלום');assert.match(await saved('en'),/<p dir="rtl">שלום<\/p>/);
  await reset('he');await mobileInput('iPhone הוא הטלפון הכי טוב כרגע.');const html=await saved();assert.ok(!html.includes('dir='));
  assert.equal(await js('getComputedStyle(__editing.lastElementChild).direction'),'rtl');
  const edge=await js("(()=>{const p=__editing.lastElementChild,r=document.createRange();r.setStart(p.firstChild,0);r.setEnd(p.firstChild,6);return {right:r.getBoundingClientRect().right,edge:p.getBoundingClientRect().right-parseFloat(getComputedStyle(p).textIndent)};})()");assert.ok(Math.abs(edge.right-edge.edge)<2,JSON.stringify(edge));
  await reset('en','<p>Earlier words </p>');await mobileInput('שלום');assert.ok(!(await saved('en')).includes('dir='));
});
test('14.2 composition defers direction until commit, including empty final event data',async()=>{
  for(const endData of ['שלום','']){
    await reset('en');await js(`__editing.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}))`);
    await mobileInput('שלום','insertCompositionText',true);
    assert.equal(await js(`__editing.lastElementChild.hasAttribute('dir')`),false);
    await js(`__editing.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:${JSON.stringify(endData)}}))`);
    assert.match(await saved('en'),/<p dir="rtl">שלום<\/p>/);
  }
  await reset('en','<p>Earlier words </p>');await js(`__editing.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))`);await mobileInput('שלום','insertCompositionText',true);await js(`__editing.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}))`);assert.ok(!(await saved('en')).includes('dir='));
});
test('14.2 notes begin empty, accept replacement/composition and save sparse directions',async()=>{
  await reset('en','',true);await mobileInput('שלום');assert.match(await saved('en',true),/<p dir="rtl">שלום<\/p>/);
  await reset('en','',true);await js(`__editing.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))`);await mobileInput('שלום','insertCompositionText',true);await js(`__editing.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}))`);assert.match(await saved('en',true),/<p dir="rtl">שלום<\/p>/);
  await reset('he','',true);await mobileInput('iPhone');assert.ok(!(await saved('he',true)).includes('dir='));
});
test('14.2 cancelled composition and engine undo leave no stale direction',async()=>{
  await reset('en');await js(`__editing.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));__editing.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}))`);assert.equal(await js(`__editing.lastElementChild.hasAttribute('dir')`),false);
  await mobileInput('שלום');await js(`document.execCommand('undo')`);const html=await saved('en');assert.ok(!html.includes('שלום')&&!html.includes('dir='));
});
test('14.2 iOS/Android PDF hand-off keeps HTML direction, exceptions and font data',async()=>{
  await reset('he','<p>שלום עולם.</p><p dir="ltr">English exception.</p>');await js(`__editing.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:null}))`);await save();
  const html=await js(`(async()=>{const d=await bookExportData();return buildHtml(d,{fonts:await exportFontFaces(d)});})()`);
  assert.match(html,/<html[^>]+dir="rtl"/);assert.match(html,/lang="he/);assert.ok(html.includes('data:font/'));
  fs.writeFileSync(path.join(OUT,PLATFORM+'-'+LANG+'-export.html'),html);
  // An explicit foreign paragraph is kept even when the interface differs.
  assert.ok(html.includes('dir="ltr"'));const exception=html;
  for(const platform of ['ios','android']){
    await js(`__platform=${JSON.stringify(platform)};window.neo.exportSave({format:'pdf',defaultName:'proof',content:${JSON.stringify(exception)}})`);
    const sent=await js('__pdfs.at(-1)');assert.match(sent.html,/<html[^>]+dir="rtl"/);assert.match(sent.html,/<p[^>]*dir="ltr"[^>]*>English exception\.<\/p>/);assert.ok(sent.html.includes('data:font/'));assert.equal(sent.screenplay,false);
  }
  assert.equal(await js('__shares.length'),2);
});
app.whenReady().then(async()=>{
  console.log('Opening Pocket '+LANG);
  win=new BrowserWindow({width:390,height:844,useContentSize:true,webPreferences:{contextIsolation:true,nodeIntegration:false}});wc=win.webContents;
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3)console.log('PAGE',details.message);});
  wc.on('did-fail-load',(_e,code,desc)=>console.log('LOAD',code,desc));
  await win.loadURL('about:blank');wc.debugger.attach('1.3');await wc.debugger.sendCommand('Page.enable');await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap});
  console.log('Loading Pocket page');
  await win.loadFile(path.join(root,'pocket/www/index.html'));console.log('Pocket loaded');await tick(500);
  let failed=0;
  for(const {name,fn} of tests){try{await fn();console.log('ok  '+name);}catch(err){failed++;console.error('FAIL '+name+'\n'+err.stack);}}
  // Retain the simulated plain files for diagnosis without touching real books.
  fs.writeFileSync(path.join(OUT,PLATFORM+'-'+LANG+'-files.json'),JSON.stringify(await js('__pocketFiles'),null,2));
  console.log(`[${PLATFORM}/${LANG}] ${tests.length-failed} passed, ${failed} failed`);app.exit(failed?1:0);
}).catch(err=>{console.error(err);app.exit(1);});
