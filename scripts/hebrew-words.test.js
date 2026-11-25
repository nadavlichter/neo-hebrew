'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');

const app = require('./app-files').appSource();
const from = app.indexOf('const SEGMENTED_SCRIPTS');
const to = app.indexOf('// A copy of a chapter without the marks');
const context = vm.createContext({ Intl });
context.window = context;
vm.runInContext(app.slice(from, to) + '\nthis.countWords = countWords;', context);
const n = context.countWords;

test('a Hebrew sentence counts its words', () => {
  assert.equal(n('הילד הלך לבית הספר'), 4);
});
test('bidi marks beside or inside words do not change the count', () => {
  assert.equal(n('שלום‏ עולם‎'), 2);
  assert.equal(n('של‏ום עולם'), 2);
  assert.equal(n('‏'), 0);
  assert.equal(n('שלום ‎ ⁧ עולם ⁩'), 2);
});
test('maqaf joins words', () => {
  assert.equal(n('בית־ספר'), 1);
});
test('niqqud and cantillation stay in the word', () => {
  assert.equal(n('שָׁלוֹם'), 1);
  assert.equal(n('בְּרֵאשִׁ֖ית בָּרָ֣א'), 2);
  assert.equal(n('ְ ־'), 0);
});
test('geresh and gershayim abbreviations are one word', () => {
  assert.equal(n('צה״ל'), 1);
  assert.equal(n('ת"א'), 1);
  assert.equal(n("ג'ק"), 1);
});
test('mixed Hebrew, English and numbers', () => {
  assert.equal(n('קראתי את Harry Potter בשנת 2004'), 6);
});
test('English counts are unchanged', () => {
  assert.equal(n(''), 0);
  assert.equal(n('  '), 0);
  assert.equal(n('It was — in fact — a well-known « fact ».'), 7);
  assert.equal(n("Don't stop"), 2);
});

test('pasted text drops bidi embeddings and keeps the writer\'s marks', () => {
  const src = app.slice(app.indexOf('function dropEmbeddings'), app.indexOf('function cleanPasteHtml'));
  const c = vm.createContext({});
  vm.runInContext(src + '\nthis.f = dropEmbeddings;', c);
  assert.equal(c.f('a\u202Ab\u202Bc\u202Cd\u202De\u202Ef'), 'abcdef');
  assert.equal(c.f('x\u200E\u200F\u061C\u2066y\u2069'), 'x\u200E\u200F\u061C\u2066y\u2069');
});
