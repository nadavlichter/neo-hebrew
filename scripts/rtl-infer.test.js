'use strict';

// Opening a book with no direction: it is set right to left only when its
// paragraphs don't already say which way they run.

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const NeoBidi = require('../bidi.js');

const app = require('./app-files').appSource();
const context = vm.createContext({ NeoBidi });
vm.runInContext(app.slice(app.indexOf('function htmlLetters('), app.indexOf('async function openBook(')), context);
vm.runInContext('this.api = { openingDirection };', context);
const { openingDirection } = context.api;

const hebrew = 'והספינות עמדו במקומן בנמל השקט '.repeat(6);

test('a rebuilt book of bare Hebrew paragraphs is set right to left', () => {
  assert.deepEqual({ ...openingDirection({}, { a: `<p>${hebrew}</p>`, b: `<p>${hebrew}</p>` }) }, { direction: 'rtl', language: 'he' });
});

test('an English-first book whose Hebrew paragraphs carry dir="rtl" is left alone', () => {
  const html = { a: '<p>The harbor was quiet.</p>', b: `<p dir="rtl">${hebrew}</p><p dir="rtl">${hebrew}</p>` };
  assert.equal(openingDirection({}, html), null);
  assert.equal(openingDirection({}, { a: `<p class="poetry" dir="rtl" style="text-align: center;">${hebrew}</p>` }), null);
});

test('English books and books with a direction are never changed', () => {
  assert.equal(openingDirection({}, { a: '<p>The harbor was quiet.</p>' }), null);
  assert.equal(openingDirection({ direction: 'ltr' }, { a: `<p>${hebrew}</p>` }), null);
  assert.equal(openingDirection({}, {}), null);
  // a dir="ltr" paragraph (an English line in a right-to-left book) is not a mark of a known direction
  assert.deepEqual({ ...openingDirection({}, { a: `<p>${hebrew}</p><p dir="ltr">Hello</p>` }) }, { direction: 'rtl', language: 'he' });
});

test('a direction or language adopted from another device is applied to the open page', () => {
  const at = app.indexOf('async function refreshFromDisk(');
  const body = app.slice(at, app.indexOf('\n}\n', at));
  const adopt = body.indexOf('book = { ...meta, chapterOrder: order');
  assert.ok(adopt > 0);
  const after = body.slice(adopt, body.indexOf('\n        }', adopt));
  assert.match(after, /book\.direction !== dirWas \|\| book\.language !== langWas\) applyBookDir\(\)/);
  assert.match(body.slice(adopt - 200, adopt), /const dirWas = book\.direction;[\s\S]*const langWas = book\.language;/);
});

// A shelf's anthology or bound book prints its words in its first title's language
function shelfWordsIn(ui, metas, dicts) {
  const ctx = vm.createContext({
    library: { spellLanguage: 'en' },
    isPageMeta: (m) => !!m.kind,
    t: (s, v = {}) => 'ui:' + s.replace(/\{(\w+)\}/g, (m, k) => v[k]),
    NeoI18n: {
      headingLanguage: (lang, spell) => lang || spell, getLocale: () => ui, getDir: () => (ui === 'he' ? 'rtl' : 'ltr'),
      translator: (code, dict) => (s, v = {}) => (dict[s] || s).replace(/\{(\w+)\}/g, (m, k) => v[k])
    },
    window: { neo: { readBookMeta: async (id) => metas[id], bookDict: async (code) => (dicts[code] ? { locale: code, dict: dicts[code] } : null), i18n: { base: {} } } }
  });
  vm.runInContext(app.slice(app.indexOf('let bookWords = null;'), app.indexOf('// the book\'s language changed while it is open')) + '\n'
    + app.slice(app.indexOf('async function withShelfWords('), app.indexOf('async function exportShelfAnthology(')) + '\nthis.api = { withShelfWords, tBook, words: () => bookWords };', ctx);
  return ctx.api;
}

test('a Hebrew shelf\'s anthology headings are Hebrew in an English interface, and the words are put back', async () => {
  const api = shelfWordsIn('en', { cov: { kind: 'cover' }, a: { language: 'he' } }, { he: { 'Chapter {n}': 'פרק {n}', Prologue: 'פרולוג' } });
  const got = await api.withShelfWords({ bookIds: ['cov', 'a'] }, async () => [api.tBook('Chapter {n}', { n: 2 }), api.tBook('Prologue')]);
  assert.deepEqual([...got], ['פרק 2', 'פרולוג']);
  assert.equal(api.words(), null);
  assert.equal(api.tBook('Prologue'), 'ui:Prologue');
});

test('an English shelf in an English interface prints the interface\'s own words', async () => {
  const api = shelfWordsIn('en', { a: {}, b: { language: 'he' } }, { he: { Prologue: 'פרולוג' } });
  assert.equal(await api.withShelfWords({ bookIds: ['a', 'b'] }, async () => api.tBook('Prologue')), 'ui:Prologue');
});

test('the anthology\'s chapter headings go through tBook', () => {
  const at = app.indexOf('async function shelfBookData(');
  const body = app.slice(at, app.indexOf('\n}\n', at));
  assert.ok(!/\bt\('(Prologue|Epilogue|Chapter \{n\})'/.test(body));
  assert.match(body, /tBook\('Chapter \{n\}', \{ n \}\)/);
  for (const caller of ['async function exportShelfAnthology(', 'async function exportBoundBook(']) {
    const c = app.slice(app.indexOf(caller), app.indexOf('\n}\n', app.indexOf(caller)));
    assert.match(c, /withShelfWords\(shelf, async \(\) => \{\n\s*const data = await shelfBookData/, caller);
  }
});

test('a book exported from the shelf borrows its own words for the export, then puts them back', () => {
  const at = app.indexOf('async function exportFromShelf(');
  const body = app.slice(at, app.indexOf('\n}\n', at));
  const borrow = body.indexOf('const words = await bookWordsFor(meta);');
  assert.ok(borrow > 0 && borrow < body.indexOf('if (book) return; // a book was opened meanwhile'));
  assert.ok(body.indexOf('bookWords = words;') < body.indexOf('await doExport(format)'));
  assert.match(body.slice(body.indexOf('} finally {')), /if \(bookWords === words\) bookWords = keep\.bookWords;/);
});
