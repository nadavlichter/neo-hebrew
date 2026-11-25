// Real paperback pagination and PDF checks. Run directly with Electron.
'use strict';
const { app, BrowserWindow, dialog } = require('electron');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const LANG = process.env.NEO_UI;
if (!LANG) {
  let failures = 0;
  for (const lang of ['en','he']) {
    const r = spawnSync(process.execPath,[__filename],{stdio:'inherit',env:{...process.env,NEO_UI:lang}});
    if (r.status !== 0) failures++;
  }
  process.exit(failures?1:0);
}
const root=path.resolve(__dirname,'..');
const out=process.env.NEO_PRINT_OUT || path.join(os.tmpdir(),'neo-rtl-print-proofs');
fs.mkdirSync(out,{recursive:true});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'neo-rtl-print-test-'));
app.setPath('userData',path.join(tmp,'app'));app.setPath('documents',tmp);
fs.mkdirSync(path.join(tmp,'app'),{recursive:true});
fs.writeFileSync(path.join(tmp,'app/settings.json'),JSON.stringify({uiLanguage:LANG}));
const lib=path.join(tmp,'NEO Library');fs.mkdirSync(path.join(lib,'book-he/chapters'),{recursive:true});
fs.writeFileSync(path.join(lib,'library.json'),JSON.stringify({firstRunDone:true,moreFeatures:true,hintShown:true,fonts:{body:'Georgia'},shelves:[{id:'s1',name:'Books',bookIds:['book-he']}]}));
fs.writeFileSync(path.join(lib,'book-he/book.json'),JSON.stringify({id:'book-he',title:'הים השקט',author:'דנה לוי',language:'he',direction:'rtl',chapterOrder:['c1','c2'],chapterTitles:{c1:'האור',c2:'השיבה'}}));
fs.writeFileSync(path.join(lib,'book-he/chapters/c1.html'),'<p>שָׁלוֹם עוֹלָם. iPhone הוא הטלפון הכי טוב כרגע.<span class="fn" data-note="הערת שוליים HEBREWNOTE" contenteditable="false">​</span></p><p dir="ltr">An English paragraph stays left to right.</p>');
fs.writeFileSync(path.join(lib,'book-he/chapters/c2.html'),'<p>הסוף של הסיפור.</p>');
// an English paperback is the PDF NEO's main makes, builder and Paged.js alike (rtl-baseline.js)
const {UPSTREAM,appSourceAt,fileAt}=require('./rtl-baseline');
const pinnedApp=appSourceAt(UPSTREAM),pinnedPaged=fileAt(UPSTREAM,'print/paged.polyfill.js');
const loadFile=BrowserWindow.prototype.loadFile;
// This suite needs no focus or keyboard input; other native checks can keep focus.
BrowserWindow.prototype.show=function(){};
let baseline=false;
const layouts=[];
BrowserWindow.prototype.loadFile=function(file,opts) {
  if (path.basename(file).startsWith('neo-paged-')) {
    if (baseline && pinnedPaged && fs.readFileSync(file,'utf8').includes('window.PagedConfig')) {
      const current=fs.readFileSync(path.join(root,'print/paged.polyfill.js'),'utf8').replace(/<\/script/gi,'<\\/script');
      const html=fs.readFileSync(file,'utf8');assert.ok(html.includes(current));
      fs.writeFileSync(file,html.replace(current,()=>pinnedPaged.replace(/<\/script/gi,'<\\/script')));
    }
    const original=this.webContents.printToPDF;
    if (!this.webContents.__neoProof) {
      this.webContents.__neoProof=true;
      this.webContents.printToPDF=async (options)=>{
        const record=await this.webContents.executeJavaScript(`(() => {
          const rect=(n)=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
          return {dir:document.documentElement.dir,softHyphens:document.body.textContent.includes(String.fromCharCode(173)),footnotes:[...document.querySelectorAll('.pagedjs_footnote_area .footnote')].map((n)=>{const t=document.createTreeWalker(n,NodeFilter.SHOW_TEXT).nextNode(),r=document.createRange();r.setStart(t,0);r.setEnd(t,1);const a=n.closest('.pagedjs_area').getBoundingClientRect();return {text:n.textContent,dir:getComputedStyle(n).direction,numberRight:r.getBoundingClientRect().right,areaRight:a.right};}),pages:[...document.querySelectorAll('.pagedjs_page')].map((p)=>{
            const r=rect(p),a=rect(p.querySelector('.pagedjs_area'));
            const content=(side)=>getComputedStyle(p.querySelector('.pagedjs_margin-'+side+' .pagedjs_margin-content'),'::after').content;
            return {side:p.classList.contains('pagedjs_left_page')?'left':'right',blank:p.classList.contains('pagedjs_blank_page'),pad:!!p.querySelector('.neo-pad'),
              counter:p.style.counterReset,left:a.left-r.left,right:r.right-a.right,footerLeft:content('bottom-left'),footerRight:content('bottom-right'),head:content('top-center'),
              chapters:[...p.querySelectorAll('section.chapter:not([data-split-from])')].map((s)=>s.id),storyStart:!!p.querySelector('.pg1:not([data-split-from])'),
              ltr:[...p.querySelectorAll('p[dir="ltr"]')].map((n)=>getComputedStyle(n).direction),
              overflow:[...p.querySelectorAll('.chapter p.hy')].some((n)=>[...n.getClientRects()].some((b)=>b.left<a.left-1 || b.right>a.right+1 || b.bottom>p.querySelector('.pagedjs_area').getBoundingClientRect().bottom+1))};
          })};
        })()`);
        layouts.push(record);
        return original.call(this.webContents,options);
      };
    }
  }
  return loadFile.call(this,path.resolve(root,file),opts);
};
let saveName='proof';
dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(out,LANG+'-'+saveName+'.pdf')});
require('../main.js');
let wc;
const js=(code)=>wc.executeJavaScript(code,true);
const tick=(ms=60)=>new Promise((resolve)=>setTimeout(resolve,ms));
const tests=[];const test=(name,fn,skip='')=>tests.push({name,fn,skip});
function normalize(pdf) {
  return pdf.toString('latin1').replace(/\/(CreationDate|ModDate) \(D:[^)]+\)/g, '/$1 (DATE)').replace(/\/ID\s*\[<[^>]+>\s*<[^>]+>\]/g,'/ID [ID]');
}
test('9.1/9.2 Hebrew paperback: physical sides, recto chapters, gutter, outside numbers and even count',async()=>{
  const job=await js(`(async()=>{
    const d=bookExportData();d.contents=true;d.subtitle='סיפור על בית וים';
    const p={html:'<p>הגלים עלו אל החוף והאור נשאר בחלון. הוא אמר שלום וחזר אל הבית השקט.</p>',text:'הגלים עלו אל החוף והאור נשאר בחלון. הוא אמר שלום וחזר אל הבית השקט.'};
    d.sections[0].paras.push(...Array.from({length:70},(_,i)=>({...p,html:'<p>MARK'+String(i+1).padStart(3,'0')+' '+p.text+'</p>'}))); d.sections[1].paras.push(...Array.from({length:12},()=>({...p})));
    window.__rtlPrintData=d;
    return {html:buildPrintHtml(d,{trim:'5x8',paper:'cream',fiction:true,review:true,links:{},fonts:await exportFontFaces(d)}),trim:'5x8',paper:'cream',pagesGuess:200,title:d.title,author:d.author,language:d.language,dir:d.dir,defaultName:'proof'};
  })()`);
  assert.ok(!job.html.includes('initial-letter: 2'),'RTL drop cap is off without writer choice');
  assert.ok(job.html.includes('כל הזכויות שמורות'),'printed copyright follows the book language');
  saveName='paperback'; const result=await js(`window.neo.printPaperback(${JSON.stringify(job)})`);
  const laid=layouts.filter((l)=>l.pages.length).at(-1);fs.writeFileSync(path.join(out,LANG+'-pagination.json'),JSON.stringify(laid,null,2));assert.equal(laid.dir,'rtl');assert.equal(laid.softHyphens,false);assert.ok(laid.footnotes.some((n)=>n.text.includes('HEBREWNOTE')&&n.dir==='rtl'&&Math.abs(n.numberRight-n.areaRight)<2));
  assert.equal(laid.pages.length,result.pages);assert.equal(result.pages%2,0);
  assert.deepEqual(laid.pages.slice(0,3).map((p)=>p.side),['left','right','left']);
  assert.ok(laid.pages.find((p)=>p.storyStart && p.side==='left'));
  const openings=laid.pages.filter((p)=>p.chapters.length);assert.equal(openings.length,2);assert.ok(openings.every((p)=>p.side==='left'));
  for (const p of laid.pages) {
    assert.ok(Math.abs((p.side==='left'?p.right:p.left)-72)<1,'gutter '+JSON.stringify(p));
    assert.ok(Math.abs((p.side==='left'?p.left:p.right)-57.6)<1,'outside '+JSON.stringify(p));
    if (p.blank || p.pad) {assert.equal(p.footerLeft,'none');assert.equal(p.footerRight,'none');assert.equal(p.head,'none');}
    if (p.counter && !p.counter.endsWith(' 0') && !p.blank && !p.pad) {
      assert.notEqual(p.side==='left'?p.footerLeft:p.footerRight,'none','outside page number');
      assert.equal(p.side==='left'?p.footerRight:p.footerLeft,'none','no inside page number');
    }
    assert.equal(p.overflow,false,'all prose stays on its page');
    assert.ok(p.ltr.every((d)=>d==='ltr'));
  }
  assert.ok(fs.statSync(result.file).size>1000);
  try { const extracted=execFileSync(process.env.NEO_PDFTOTEXT || 'pdftotext',[result.file,'-']).toString();assert.ok(extracted.includes('HEBREWNOTE'));for(let i=1;i<=70;i++)assert.ok(extracted.includes('MARK'+String(i).padStart(3,'0')),'PDF keeps paragraph '+i); } catch(err) { if(err.code!=='ENOENT')throw err;console.log('skip PDF text extraction: pdftotext unavailable'); }assert.ok(fs.statSync(result.cover).size>1000);
  fs.writeFileSync(path.join(out,LANG+'-pagination.json'),JSON.stringify(laid,null,2));
});
// e8d0840's builder named the Hebrew companion faces in every book's CSS; an
// English book no longer does (as on main), so they are taken out of its side
test('9.1/9.2 an English PDF matches main\'s engine and builder',async()=>{
  await js(`(async()=>{book.language='en';book.direction='ltr';bookWords=await bookWordsFor(book);applyBookDir();})()`);
  const code=pinnedApp.slice(pinnedApp.indexOf('const PRINT_TRIMS ='),pinnedApp.indexOf('// File → Export → Paperback for KDP…:'));
  await js(`window.__oldPrint=(function(){${code}\nreturn buildPrintHtml;})();undefined`);
  const job=await js(`(async()=>{const d={dir:'ltr',language:'en',title:'The Harbor',author:'Dana Levy',sections:[{kind:'chapter',heading:'Chapter One',num:1,paras:[{html:'<p>The harbor was quiet and the light stayed on.</p>',text:'The harbor was quiet and the light stayed on.'}]}]};window.__englishPrint=d;const opts={trim:'5x8',paper:'cream',links:{},fonts:await exportFontFaces(d)};const html=buildPrintHtml(d,opts);const was=__oldPrint(d,opts).split('"NEO Hebrew ').map((x,k)=>k?x.replace(/^[^"]*",\\s*/,''):x).join('');if(html!==was)throw Error('English print HTML changed');return {html,trim:'5x8',paper:'cream',pagesGuess:24,title:d.title,author:d.author,language:'en',defaultName:'english'};})()`);
  const outputs=[];
  for (const old of [true,false]) {baseline=old;saveName=old?'english-before':'english-after';const r=await js(`window.neo.printPaperback(${JSON.stringify(job)})`);outputs.push(fs.readFileSync(r.file));}
  baseline=false;
  assert.equal(normalize(outputs[1]),normalize(outputs[0]),'PDF streams differ beyond timestamps/IDs');
}, LANG !== 'en' ? 'English parity uses English chrome; previous foreign-chrome print matter used the UI language' : !pinnedApp || !pinnedPaged ? 'requires git and '+UPSTREAM : '');
test('9.4 RTL cover proof: front left, barcode right and readable reverse spine',async()=>{
  const src=fs.readFileSync(path.join(root,'main.js'),'utf8');
  const ctx=vm.createContext({NeoI18n:require('../i18n.js'),t:(s)=>s,
    resolveLanguage:(s)=>s,localeDict:(s)=>JSON.parse(fs.readFileSync(path.join(root,'locales',s+'.json'),'utf8')),
    readLocaleFile:(s)=>JSON.parse(fs.readFileSync(path.join(root,'locales',s+'.json'),'utf8'))});
  vm.runInContext(src.slice(src.indexOf('const KDP_TRIMS ='),src.indexOf('function kdpGutterMin('))+'\n'+src.slice(src.indexOf('function kdpCoverHtml('),src.indexOf('// The window hands over'))+'\nthis.cover=kdpCoverHtml;',ctx);
  const html=ctx.cover({trim:'6x9',paper:'cream',pages:300,title:'הים השקט',author:'דנה לוי',dir:'rtl',language:'he'});
  const file=path.join(tmp,'cover-proof.html');fs.writeFileSync(file,html);
  await loadFile.call(BrowserWindow.fromWebContents(wc),file);
  const positions=await js(`(() => {const panels=[...document.querySelectorAll('.panel')];const x=(n)=>n.getBoundingClientRect().x;return {panels:panels.map((p)=>({text:p.textContent,x:x(p)})),barcode:x(document.querySelector('.barcode')),spine:x(document.querySelector('.spine')),rotation:getComputedStyle(document.querySelector('.vert')).transform};})()`);
  const front=positions.panels.find((p)=>p.text.includes('קדמית')),back=positions.panels.find((p)=>p.text.includes('אחורית'));
  assert.ok(front.x<positions.spine && back.x>positions.spine);
  assert.ok(positions.barcode>positions.spine);
  assert.ok(positions.rotation.includes('-1'));
  const pdf=await wc.printToPDF({preferCSSPageSize:true,printBackground:true,margins:{marginType:'none'}});
  fs.writeFileSync(path.join(out,LANG+'-cover-300.pdf'),pdf);
});
async function main(){
  await app.whenReady();let failed=0,skipped=0;
  try {
    let win;while(!(win=BrowserWindow.getAllWindows()[0]))await tick();wc=win.webContents;
    while(!(await js(`typeof library!=='undefined'&&!!library`).catch(()=>false)))await tick();
    await js(`document.getElementById('firstrun').hidden=true;openBook('book-he')`);await tick(250);
    for(const t of tests){if(t.skip){skipped++;console.log('skip '+t.name+': '+t.skip);continue;}try{await t.fn();console.log('ok   '+t.name);}catch(err){failed++;console.error('FAIL '+t.name+'\n'+err.stack);}}
    console.log('['+LANG+'] '+(tests.length-failed-skipped)+' passed, '+failed+' failed, '+skipped+' skipped');
  }catch(err){failed++;console.error(err);}finally{app.exit(failed?1:0);}
}
main();
