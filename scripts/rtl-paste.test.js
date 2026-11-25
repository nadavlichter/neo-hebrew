'use strict';

// Hebrew/RTL 7.3: a pasted block's direction. pasteDirOf from app.js, run on
// stub elements shaped like hand-made clipboard HTML (not captured from the
// real programs yet): Word for Mac/Windows (<p class=MsoNormal dir=RTL
// style='direction:rtl'>), Google Docs (<p dir="rtl"> inside its <b id=
// "docs-internal-guid-…">), a Hebrew web page (<div dir="rtl"><p>), <bdo>.
// cleanPasteHtml itself needs a real DOM: its cases run in the window, in
// scripts/rtl-typing.e2e.js.

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');

const app = require('./app-files').appSource();
const src = app.slice(app.indexOf('function pasteDirOf'), app.indexOf('// target: { bookDir }'));
assert.ok(src.startsWith('function pasteDirOf'), 'pasteDirOf is where the test expects it');
const c = vm.createContext({});
vm.runInContext(src + '\nthis.pasteDirOf = pasteDirOf;', c);

// el('p', { dir: 'RTL' }, { direction: 'rtl' }, parent)
function el(tag, attrs = {}, style = {}, parentElement = null) {
  return { nodeType: 1, tagName: tag.toUpperCase(), parentElement, style, getAttribute: (a) => (a in attrs ? attrs[a] : null) };
}

test('Word: dir=RTL (upper case) on the paragraph', () => {
  assert.equal(c.pasteDirOf(el('p', { dir: 'RTL', class: 'MsoNormal' }, { direction: 'rtl' })), 'rtl');
  // Word's LTR paragraph in a Hebrew document
  assert.equal(c.pasteDirOf(el('p', { dir: 'LTR' })), 'ltr');
});

test('a style\'s direction alone', () => {
  assert.equal(c.pasteDirOf(el('p', {}, { direction: 'rtl' })), 'rtl');
  assert.equal(c.pasteDirOf(el('div', {}, { direction: 'LTR' })), 'ltr');
});

test('Google Docs: <p dir="rtl"> inside the <b id="docs-internal-guid-…"> wrapper', () => {
  const b = el('b', { id: 'docs-internal-guid-1234' }, { fontWeight: 'normal' }, el('body'));
  assert.equal(c.pasteDirOf(el('p', { dir: 'rtl' }, {}, b)), 'rtl');
  assert.equal(c.pasteDirOf(el('p', { dir: 'ltr' }, {}, b)), 'ltr');
});

test('a Hebrew web page: the paragraph inherits its <div dir="rtl">; the nearest says', () => {
  const div = el('div', { dir: 'rtl' }, {}, el('body'));
  assert.equal(c.pasteDirOf(el('p', {}, {}, div)), 'rtl');
  assert.equal(c.pasteDirOf(el('p', { dir: 'ltr' }, {}, div)), 'ltr');
  const html = el('html', { dir: 'rtl' });
  assert.equal(c.pasteDirOf(el('li', {}, {}, el('ul', {}, {}, el('body', {}, {}, html)))), 'rtl');
  // a style beats dir on the same element, as it does on screen
  assert.equal(c.pasteDirOf(el('p', { dir: 'rtl' }, { direction: 'ltr' })), 'ltr');
});

test('<bdo dir> around a block', () => {
  assert.equal(c.pasteDirOf(el('p', {}, {}, el('bdo', { dir: 'rtl' }))), 'rtl');
});

test('nothing said, or dir="auto": unknown, so the text\'s first letter decides', () => {
  assert.equal(c.pasteDirOf(el('p', {}, {}, el('div', {}, {}, el('body')))), '');
  assert.equal(c.pasteDirOf(el('p', { dir: 'auto' }, {}, el('div', { dir: 'rtl' }))), '');
  assert.equal(c.pasteDirOf(null), '');
});
