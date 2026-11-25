'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const source = require('./app-files').appSource();
const paged = fs.readFileSync(path.join(root, 'print/paged.polyfill.js'), 'utf8');
// An English paperback is the file NEO's main writes (rtl-baseline.js)
const { UPSTREAM: PIN, appSourceAt, LITRPG } = require('./rtl-baseline');
const before = appSourceAt(PIN);
function builder(src, fonts = {}) {
  const ctx = vm.createContext({ library: { fonts }, book: {}, FN_HTML: /<span class="fn">([\s\S]*?)<\/span>/g,
    escHtml: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    t: (s, v = {}) => s.replace(/\{(\w+)\}/g, (m, k) => v[k]),
    tBook: (s, v = {}) => s.replace(/\{(\w+)\}/g, (m, k) => v[k]), plain: (s) => s,
    writingLanguage: () => 'en', exportBodyFont: () => 'Georgia, serif', exportDropCapFont: () => 'Didot, serif',
    OPENING_DASH: /^[—–-]/, isAttribution: (p) => /^—/.test(p.text), bookDirection: () => 'ltr'
  });
  vm.runInContext(LITRPG + '\n' + (src.includes('function dropCapStyle(') ? src.slice(src.indexOf('function dropCapStyle('), src.indexOf('function syncDropCap(')) : '') + '\n'
    + src.slice(src.indexOf('const PRINT_TRIMS ='), src.indexOf('// File → Export → Paperback for KDP…:')) + '\nthis.build = buildPrintHtml;', ctx);
  return ctx.build;
}
const para = (text, extra = {}) => ({ text, html: `<p>${text}</p>`, ...extra });
const data = (dir = 'ltr') => ({ dir, language: dir === 'rtl' ? 'he' : 'en', title: 'Book', author: 'Writer', subtitle: 'Subtitle', contents: true,
  sections: [{kind:'dedication',num:1,paras:[para('For you')]},{kind:'part',num:2,heading:'Part One',partTitle:'Waves',paras:[]},
    {kind:'chapter',num:3,heading:'First',paras:[para('First words.'),para('A verse',{poetry:true}),para('***',{sceneBreak:true}),para('Flush',{flush:true})]},
    {kind:'acknowledgments',num:4,heading:'Thanks',paras:[para('Thank you.')]}],
  toc: [{num:2,type:'part',label:'Part One',level:0},{num:3,type:'chapter',label:'First',level:1}] });
const options = { trim:'5x8',paper:'cream',fiction:true,isbn:'123',review:true,links:{website:'example.com'},alsoBy:['Another Book'] };

test('English paperback HTML is byte-identical to main\'s builder', {skip:!before && 'requires git and '+PIN}, () => {
  for (const fonts of [{},{dropcap:'none'},{dropcap:'literary',dropcapChosen:true}]) {
    assert.equal(builder(source,fonts)(data(),options),builder(before,fonts)(data(),options));
  }
});
test('RTL paperback requests recto/verso while English keeps right/left', () => {
  const html = builder(source)(data('rtl'),options);
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /\.chapter \{ page: chapter; break-before: recto;/);
  assert.match(html, /\.copyright \{ break-before: verso;/);
  assert.match(html, /@page :left \{\s*margin-left: 0.6in; margin-right: __NEO_GUTTER__;/);
  assert.match(html, /@page :right \{\s*margin-left: __NEO_GUTTER__; margin-right: 0.6in;/);
});
function method(from, to) {
  const start = paged.indexOf(from);
  assert.ok(start >= 0);
  return vm.runInNewContext('({' + paged.slice(start, paged.indexOf(to,start)) + '})');
}
test('Paged.js assigns physical left/right to pages 1–3 by book progression', () => {
  const api = method('\n\t\tindex(pgnum)', '\n\t\t/*');
  for (const rtl of [false,true]) {
    const sides = [];
    for (let i=0;i<3;i++) {
      const classes = new Set();
      const page = {settings:{neoRtl:rtl},element:{dataset:{},setAttribute(){},classList:{add:(s)=>classes.add(s),remove:(s)=>classes.delete(s)}}};
      api.index.call(page,i);
      sides.push(classes.has('pagedjs_left_page')?'left':'right');
    }
    assert.deepEqual(sides,rtl?['left','right','left']:['right','left','right']);
  }
});
test('Paged.js break-before and break-after keep physical sides and logical recto/verso', async () => {
  const api = method('\n\t\tasync handleBreaks(', '\n\t\tasync *layout(');
  for (const rtl of [false,true]) { for (const next of [2,3]) { for (const property of ['breakBefore','previousBreakAfter']) { for (const target of ['left','right','recto','verso']) {
    let blanks = 0;
    const currentSide = next%2?'recto':'verso';
    const position = next%2?(rtl?'left':'right'):(rtl?'right':'left');
    const hooks = Object.fromEntries(['beforePageLayout','afterPageLayout','finalizePage'].map((k)=>[k,{trigger:async()=>{}}]));
    await api.handleBreaks.call({total:next-1,settings:{neoRtl:rtl},hooks,emit(){},addPage(blank){assert.equal(blank,true);blanks++;return {};}},{dataset:{[property]:target}});
    assert.equal(blanks, target===(['recto','verso'].includes(target)?currentSide:position)?0:1,JSON.stringify({rtl,next,property,target}));
  } } } }
});

test('paperback preserves D2 exceptions in prose, poetry and front matter, without inferred marks', () => {
  const d=data('rtl');
  d.sections[0].paras=[para('Dedication',{dir:'ltr'})];
  d.sections[2].paras=[para('שלום'),para('English prose',{dir:'ltr'}),para('Verse',{dir:'ltr',poetry:true}),para('Redundant',{dir:'rtl'})];
  const html=builder(source)(d,options);
  assert.match(html, /<p dir="ltr">Dedication<\/p>/);
  assert.match(html, /<p class="hy" dir="ltr">English prose<\/p>/);
  assert.match(html, /<p class="poetry" dir="ltr">Verse<\/p>/);
  assert.ok(!html.includes('<p class="hy" dir="rtl">'));
  assert.ok(!/[\u200e\u200f\u061c\u2066-\u2069]/.test(html));
  assert.match(html,/\.toc a::after \{ padding-left: 0; padding-right: 1em; direction: ltr;/);
});
test('paperback uses the data direction for drop caps and recto running heads', () => {
  assert.ok(!builder(source)(data('rtl'),options).includes('initial-letter: 2'));
  const chosen=builder(source,{dropcap:'literary',dropcapChosen:true})(data('rtl'),options);
  assert.ok(chosen.includes('initial-letter: 2'));
  assert.ok(chosen.includes('padding-right: 0; padding-left: 0.06em;'));
  assert.match(chosen,/@page :left \{[\s\S]*?@top-center \{ content: "Book";/);
  assert.match(chosen,/@page :right \{[\s\S]*?@top-center \{ content: "Writer";/);
});

test('the paperback names NEO\'s Hebrew faces only for a book with Hebrew in it', () => {
  const ctx = vm.createContext({ library: { fonts: { dropcap: 'literary', dropcapChosen: true } }, book: {}, FN_HTML: /<span class="fn">([\s\S]*?)<\/span>/g,
    escHtml: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    t: (s, v = {}) => s.replace(/\{(\w+)\}/g, (m, k) => v[k]),
    tBook: (s, v = {}) => s.replace(/\{(\w+)\}/g, (m, k) => v[k]), plain: (s) => s,
    writingLanguage: () => 'en', OPENING_DASH: /^[—–-]/, isAttribution: (p) => /^—/.test(p.text), bookDirection: () => 'ltr',
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: (prop) => prop === '--body-font'
      ? '"NEO Hebrew Serif", Georgia, "Times New Roman", serif' : '"NEO Hebrew Serif", "Didot", "Bodoni 72", Georgia, serif' })
  });
  vm.runInContext(LITRPG + '\n' + source.slice(source.indexOf('function htmlLetters('), source.indexOf('// The direction a book with none is given on opening')) + '\n'
    + source.slice(source.indexOf('const exportBodyFont = '), source.indexOf('const fontFamilies = ')) + '\n'
    + source.slice(source.indexOf('function dropCapStyle('), source.indexOf('function syncDropCap(')) + '\n'
    + source.slice(source.indexOf('const PRINT_TRIMS ='), source.indexOf('// File → Export → Paperback for KDP…:')) + '\nthis.build = buildPrintHtml;', ctx);
  const english = ctx.build(data(), options);
  assert.ok(!english.includes('NEO Hebrew'));
  assert.ok(english.includes('body { font-family: Georgia, "Times New Roman", serif;'));
  const he = data('rtl');
  he.sections[2].paras.push(para('שלום'));
  assert.ok(ctx.build(he, options).includes('body { font-family: "NEO Hebrew Serif", Georgia'));
});
