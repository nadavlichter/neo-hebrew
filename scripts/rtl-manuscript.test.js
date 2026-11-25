'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const M=require('../manuscript.js');
let old;
// an English manuscript is the file NEO's main writes (rtl-baseline.js)
const { UPSTREAM, fileAt } = require('./rtl-baseline');
try { const source=fileAt(UPSTREAM,'manuscript.js');if(source===null)throw new Error('no history');const ctx=vm.createContext({module:{exports:{}}});vm.runInContext(source,ctx);old=ctx.module.exports; }catch{ /* the comparison skips without history */ }
const p=(text,extra={})=>({runs:[{text}],...extra});
const model=(extra={})=>({title:'Harbor',byline:'Dana Levy',headerName:'Levy',headerTitle:'HARBOR',contact:{name:'Dana Levy',lines:['Main Street','dana@example.com']},wordsText:'about 90,000 words',byText:'by Dana Levy',endText:'END',font:'times',paper:'Letter',lang:'en-US',dir:'ltr',short:false,sections:[{kind:'chapter',heading:'Chapter 1',paras:[p('Quiet.'),p('A line',{poetry:true}),{sceneBreak:true},p('A note',{runs:[{text:'A note'},{fn:'Note text.'}]}),p('Right',{align:'right'}),p('Center',{align:'center'})]}],...extra});
const he=()=>model({dir:'rtl',lang:'he',title:'הים השקט',byline:'דנה לוי',headerName:'לוי',headerTitle:'הים השקט',wordsText:'כ־90,000 מילים',byText:'מאת דנה לוי',sections:[{kind:'chapter',heading:'פרק 1',paras:[{runs:[{text:'שלום ',b:true},{text:'iPhone ',i:true},{text:'נטוי',i:true,b:true}]},p('English exception',{dir:'ltr'}),p('שיר',{poetry:true}),p('סוף',{align:'end'}),p('הערה',{runs:[{text:'הערה'},{fn:'הערת שוליים'}]})]}]});
const part=(entries,name)=>entries.find((e)=>e.path==='word/'+name).content;
function wellFormed(xml){const stack=[];for(const m of xml.replace(/<\?xml[^>]*>/,'').matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)){if(m[3])continue;if(m[1])assert.equal(stack.pop(),m[2]);else stack.push(m[2]);}assert.deepEqual(stack,[]);}

test('English manuscript Word parts and PDF HTML are byte-identical to main', {skip:!old&&'requires git and '+UPSTREAM},()=>{
  for(const font of ['times','courier']) { for(const short of [false,true]) { for(const paper of ['Letter','A4']) {
    const m=model({font,short,paper});assert.equal(JSON.stringify(M.docxEntries(m)),JSON.stringify(old.docxEntries(m)));
    assert.equal(M.html(m,{fontFaces:'/* embedded font */'}),old.html(m,{fontFaces:'/* embedded font */'}));
  } } }
});
test('Hebrew manuscript declares sparse bidi, both sections, Cs language/font and a mirrored header',()=>{
  const entries=M.docxEntries(he());entries.forEach((e)=>wellFormed(e.content));
  const doc=part(entries,'document.xml'),styles=part(entries,'styles.xml'),header=part(entries,'header1.xml');
  assert.equal((doc.match(/<w:bidi\/>/g)||[]).length,2,'two sections; ordinary paragraphs inherit Normal');
  assert.equal((doc.match(/<w:bidi w:val="0"\/>/g)||[]).length,3,'one stored body exception and two Latin contact-field lines');
  assert.match(styles,/<w:style[^>]*w:styleId="Normal">[\s\S]*?<w:pPr><w:bidi\/><\/w:pPr>/);
  assert.ok(styles.includes('w:cs="Times New Roman"'));
  assert.ok(styles.includes('<w:lang w:val="he" w:bidi="he-IL"/>'));
  assert.ok(header.includes('<w:jc w:val="left"/>') && header.includes('לוי / הים השקט / '));
  assert.match(doc,/<w:tabs><w:tab w:val="left"/,'mirrored contact tab is declared, native Word review remains');
});
test('Hebrew manuscript formatting runs retain Cs emphasis/size and schema property order',()=>{
  const entries=M.docxEntries(he()),doc=part(entries,'document.xml'),styles=part(entries,'styles.xml');
  assert.ok(doc.includes('<w:rStyle w:val="StrongEmphasis"/><w:szCs w:val="24"/><w:rtl/>'));
  assert.ok(styles.includes('<w:b/><w:bCs/><w:i/><w:iCs/>'));
  assert.ok(doc.includes('<w:rStyle w:val="Emphasis"/></w:rPr><w:t xml:space="preserve">iPhone '));
  const ranks=['rStyle','rFonts','b','bCs','i','iCs','caps','strike','spacing','sz','szCs','u','vertAlign','rtl','lang'];
  for(const e of entries) { for(const m of e.content.matchAll(/<w:rPr>([\s\S]*?)<\/w:rPr>/g)) {
    let rank=-1;for(const tag of m[1].matchAll(/<w:(\w+)\b/g)){const next=ranks.indexOf(tag[1]);assert.ok(next>=rank,tag[1]+' in '+e.path);rank=next;}
  } }
});
test('Hebrew poetry uses logical indents and end-alignment follows the paragraph direction',()=>{
  const entries=M.docxEntries(he());assert.ok(part(entries,'styles.xml').includes('<w:ind w:start="720" w:end="720"/>'));
  assert.match(part(entries,'document.xml'),/<w:pStyle w:val="Centered"\/><w:jc w:val="left"\/>/);
});
test('Hebrew manuscript PDF mirrors the header and contact block, carrying only paragraph exceptions',()=>{
  const html=M.html(he());assert.match(html,/<html lang="he" dir="rtl">/);assert.ok(html.includes('@top-left { content: "לוי / הים השקט / " counter(page)'));
  assert.ok(html.includes('<p dir="ltr">English exception</p>'));assert.ok(!html.includes('<p dir="rtl">'));
  assert.ok(html.includes('.contact { text-align: right; }'));
  assert.ok(html.includes('<div dir="ltr">dana@example.com</div>'),'contact fields retain LTR order');
  assert.ok(html.includes('.pagedjs_pagebox, .pagedjs_page_content { direction: ltr; }'));
  assert.ok(html.includes('<p class="l">סוף</p>'));
  assert.ok(html.includes('<i>נטוי</i>'));
  assert.ok(!/[\u200e\u200f\u061c\u2066-\u2069]/.test(html));
});
test('a Hebrew short manuscript hides its first header and keeps a single bidi section',()=>{
  const m={...he(),short:true};const entries=M.docxEntries(m);assert.equal((part(entries,'document.xml').match(/<w:sectPr>/g)||[]).length,1);
  assert.ok(part(entries,'document.xml').includes('<w:titlePg/><w:bidi/>'));
  assert.ok(!part(entries,'header2.xml').includes('PAGE'));
  assert.ok(M.html(m).includes('@page :first { @top-left { content: none; } }'));
});
test('Hebrew Courier uses the same local mono as scripts and Hebrew footnotes retain direction',()=>{
  const m={...he(),font:'courier'},entries=M.docxEntries(m);
  assert.ok(part(entries,'styles.xml').includes('w:cs="Courier New"'));
  assert.ok(M.html(m).includes('"NEO Hebrew Mono", "Courier Prime"'));
  assert.match(part(entries,'footnotes.xml'),/<w:szCs w:val="24"\/><w:rtl\/><\/w:rPr><w:t xml:space="preserve"> הערת שוליים/);
});
test('a Hebrew exception in an English manuscript gets bidi without changing Normal or the next export',()=>{
  const m=model();m.sections[0].paras.push(p('שלום',{dir:'rtl',runs:[{text:'שלום',i:true}]}));
  const entries=M.docxEntries(m);assert.match(part(entries,'document.xml'),/<w:pStyle w:val="Manuscript"\/><w:bidi\/>/);
  assert.ok(!part(entries,'styles.xml').includes('<w:pPr><w:bidi/></w:pPr>'));
  assert.ok(part(entries,'styles.xml').includes('<w:i/><w:iCs/>'));
  if(old)assert.equal(JSON.stringify(M.docxEntries(model())),JSON.stringify(old.docxEntries(model())));
});

test('an untitled book\'s header and title page both say Untitled in the book\'s language', () => {
  const app = require('./app-files').appSource();
  const at = app.indexOf('/*  MANUSCRIPT FORMAT ');
  const body = app.indexOf('*/\n/* ====', at) + 80; // past the section's own banner
  const section = app.slice(at, app.indexOf('\n/* ====', body));
  assert.ok(section.includes("tBook('Untitled')"));
  assert.ok(!section.includes("t('Untitled')"), 'every Untitled in the manuscript is the book\'s word');
});
