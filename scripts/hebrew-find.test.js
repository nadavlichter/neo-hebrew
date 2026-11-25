'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');

const app = require('./app-files').appSource();
const from = app.indexOf('// ---- find\'s matching:');
const to = app.indexOf('// ---- end of find\'s matching ----');
const context = vm.createContext({});
vm.runInContext(app.slice(from, to) + '\nthis.matchSpans = matchSpans;', context);
const spans = (texts, q) => JSON.parse(JSON.stringify(context.matchSpans(texts, q)));

test('a plain query finds a word with niqqud, and covers the points', () => {
  assert.deepEqual(spans(['שָׁלוֹם עולם'], 'שלום'), [{ from: [0, 0], to: [0, 7] }]);
});
test('a pointed query finds the plain word', () => {
  assert.deepEqual(spans(['שלום עולם'], 'שָׁלוֹם'), [{ from: [0, 0], to: [0, 4] }]);
});
test('points on the last letter belong to the match', () => {
  assert.deepEqual(spans(['שלוֹם'], 'שלו'), [{ from: [0, 0], to: [0, 4] }]);
});
test('a query of only points matches nothing', () => {
  assert.deepEqual(spans(['שלום'], 'ְ'), []);
});
test('geresh and gershayim fold to the ASCII marks', () => {
  assert.deepEqual(spans(['צה״ל'], 'צה"ל'), [{ from: [0, 0], to: [0, 4] }]);
  assert.deepEqual(spans(['צה"ל'], 'צה״ל'), [{ from: [0, 0], to: [0, 4] }]);
  assert.deepEqual(spans(['ג׳ק'], "ג'ק"), [{ from: [0, 0], to: [0, 3] }]);
});
test('bidi marks in the text are matched across', () => {
  assert.deepEqual(spans(['של‏ום'], 'שלום'), [{ from: [0, 0], to: [0, 5] }]);
  assert.deepEqual(spans(['של', '‏ום'], 'שלום'), [{ from: [0, 0], to: [1, 3] }]);
});
test('maqaf is not skipped', () => {
  assert.deepEqual(spans(['בית־ספר'], 'ביתספר'), []);
  assert.deepEqual(spans(['בית־ספר'], 'בית־ספר'), [{ from: [0, 0], to: [0, 7] }]);
});
test('Latin matching is as before', () => {
  assert.deepEqual(spans(['Salt and SALT'], 'salt'), [
    { from: [0, 0], to: [0, 4] }, { from: [0, 9], to: [0, 13] }
  ]);
});
