'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');

const app = require('./app-files').appSource();
const from = app.indexOf('function latinKey');
const to = app.indexOf('// a key pressed on its own on the way to a shortcut');
const context = vm.createContext({});
vm.runInContext(app.slice(from, to) + '\nthis.latinKey = latinKey;', context);
const k = (key, code, shiftKey = false) => context.latinKey({ key, code, shiftKey });

test('an English layout is unchanged', () => {
  assert.equal(k('z', 'KeyZ'), 'z');
  assert.equal(k('Z', 'KeyZ', true), 'Z');
});
test('a Hebrew letter becomes the Latin letter of its physical key', () => {
  assert.equal(k('ז', 'KeyZ'), 'z');
  assert.equal(k('ז', 'KeyZ', true), 'Z');
});
test('named keys, symbols and digits are unchanged', () => {
  assert.equal(k('Enter', 'Enter'), 'Enter');
  assert.equal(k('*', 'Digit8', true), '*');
  assert.equal(k('5', 'Digit5'), '5');
});
test('a Hebrew letter on a non-letter code is unchanged', () => {
  assert.equal(k('ז', 'Semicolon'), 'ז');
  assert.equal(k('ז', undefined), 'ז');
});
