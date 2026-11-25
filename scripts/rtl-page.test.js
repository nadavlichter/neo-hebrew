'use strict';

// Phase 3: what a chapter's page saves of a paragraph's direction (D2), and
// the rule that sets a rebuilt book right to left.

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const NeoBidi = require('../bidi.js');

const app = require('./app-files').appSource();
function pageIn(dir) {
  const context = vm.createContext({ bookDirection: () => dir });
  vm.runInContext(app.slice(app.indexOf('function captureBody('), app.indexOf('// A chapter that opens on a line of dialogue')), context);
  vm.runInContext('this.api = { captureBody };', context);
  return (innerHTML) => context.api.captureBody({ innerHTML });
}
const ltr = pageIn('ltr');
const rtl = pageIn('rtl');

test('a dir equal to the book\'s is not saved; a different one stays', () => {
  assert.equal(rtl('<p dir="rtl">שלום</p><p dir="ltr">Hello</p>'), '<p>שלום</p><p dir="ltr">Hello</p>');
  assert.equal(ltr('<p dir="ltr">Hello</p><p dir="rtl">שלום</p>'), '<p>Hello</p><p dir="rtl">שלום</p>');
  assert.equal(rtl('<p class="poetry" dir="rtl" style="text-align: center;">שלום</p>'), '<p class="poetry" style="text-align: center;">שלום</p>');
});

test('a direction style the engine leaves becomes dir, then the same rule applies', () => {
  assert.equal(rtl('<p style="direction: rtl;">שלום</p>'), '<p>שלום</p>');
  assert.equal(rtl('<p style="direction: ltr;">Hello</p>'), '<p dir="ltr">Hello</p>');
  assert.equal(ltr('<p style="text-align: right; direction: rtl;">שלום</p>'), '<p dir="rtl" style="text-align: right;">שלום</p>');
  assert.equal(ltr('<p dir="ltr" style="direction: rtl;">שלום</p>'), '<p dir="rtl">שלום</p>');
  assert.equal(rtl('<p class="x" style="direction: rtl; text-align: center;">שלום</p>'), '<p class="x" style="text-align: center;">שלום</p>');
});

test('a span\'s dir or direction goes with the engine\'s spans', () => {
  assert.equal(rtl('<p>a <span dir="ltr">b</span> <span style="direction: ltr">c</span></p>'), '<p>a b c</p>');
});

test('English chapter HTML with no dir passes through byte for byte', () => {
  const page = '<p>The harbor was quiet.</p><p class="scene-break">***</p><p style="text-align: center;">One <i>was</i> missing, directly.</p><p class="poetry">Dir</p>';
  assert.equal(ltr(page), page);
  assert.equal(rtl(page), page);
});

test('a rebuilt book is set right to left only when its text is mostly so', () => {
  const he = 'זה היה בוקר שקט בנמל. The sea. ' + 'והספינות עמדו במקומן '.repeat(5);
  assert.deepEqual(NeoBidi.inferRtlBook({}, he), { direction: 'rtl', language: 'he' });
  assert.deepEqual(NeoBidi.inferRtlBook({ language: 'yi' }, he), { direction: 'rtl' });
  assert.deepEqual(NeoBidi.inferRtlBook({}, 'مرحبا بالعالم وأهلا بكم'), { direction: 'rtl' });
  // never 'ltr': English and empty books are left alone
  assert.equal(NeoBidi.inferRtlBook({}, 'The harbor was quiet.'), null);
  assert.equal(NeoBidi.inferRtlBook({}, ''), null);
  assert.equal(NeoBidi.inferRtlBook({}, '1234 ... שלום hello'), null);
  // an explicit field is respected, and scripts wait
  assert.equal(NeoBidi.inferRtlBook({ direction: 'ltr' }, he), null);
  assert.equal(NeoBidi.inferRtlBook({ direction: 'rtl' }, he), null);
  assert.equal(NeoBidi.inferRtlBook({ format: 'screenplay' }, he), null);
});

// ---- Phase 3.3, 3.4, 3.8: the first letter, the book's direction, the keys ----
test('the first strong letter decides a paragraph; digits, quotes and spaces never do', () => {
  assert.equal(NeoBidi.autoDir('', 'ש'), 'rtl');
  assert.equal(NeoBidi.autoDir('', 'a'), 'ltr');
  assert.equal(NeoBidi.autoDir('120 ', 'ש'), 'rtl');
  assert.equal(NeoBidi.autoDir('“', 'ש'), 'rtl');
  assert.equal(NeoBidi.autoDir('', '120 '), '');
  assert.equal(NeoBidi.autoDir('', '“'), '');
  assert.equal(NeoBidi.autoDir('', '—'), '');
  // a paragraph with a letter before the caret is never flipped by typing
  assert.equal(NeoBidi.autoDir('iPhone ', 'ש'), '');
  assert.equal(NeoBidi.autoDir('שלום ', 'a'), '');
  // niqqud and an explicit mark: the mark is a decision, the point is not
  assert.equal(NeoBidi.autoDir('', 'ְ'), '');
  assert.equal(NeoBidi.autoDir('', '‏a'), 'rtl');
});

test('an English opening keeps an RTL paragraph in its direction', () => {
  assert.equal(NeoBidi.autoDir('', 'i', 'rtl'), '');
  assert.equal(NeoBidi.autoDir('', 'iPhone הוא הטלפון הכי טוב כרגע.', 'rtl'), '');
  assert.equal(NeoBidi.autoDir('120 ', 'dollars', 'rtl'), '');
  assert.equal(NeoBidi.autoDir('“', 'Hello', 'rtl'), '');
  assert.equal(NeoBidi.autoDir('', 'Hello', 'ltr'), 'ltr');
  assert.equal(NeoBidi.autoDir('', 'שלום', 'ltr'), 'rtl');
  assert.equal(NeoBidi.autoDir('Hello ', 'שלום', 'ltr'), '');
});

test('a dir is kept only where it differs from the book', () => {
  assert.equal(NeoBidi.paraDirAttr('rtl', 'rtl'), null);
  assert.equal(NeoBidi.paraDirAttr('ltr', 'rtl'), 'ltr');
  assert.equal(NeoBidi.paraDirAttr('rtl', 'ltr'), 'rtl');
  assert.equal(NeoBidi.paraDirAttr('', 'ltr'), null);
});

test('the first right-to-left letter of a book with nothing in it sets the book', () => {
  assert.deepEqual(NeoBidi.bookFromFirstLetter({}, 'ש', ['', '  12 ']), { direction: 'rtl', language: 'he' });
  assert.deepEqual(NeoBidi.bookFromFirstLetter({}, '“ש', []), { direction: 'rtl', language: 'he' });
  assert.deepEqual(NeoBidi.bookFromFirstLetter({}, 'م', []), { direction: 'rtl' });
  assert.deepEqual(NeoBidi.bookFromFirstLetter({ language: 'yi' }, 'ש', []), { direction: 'rtl' });
  // never 'ltr'; a letter anywhere else and an explicit direction leave it
  assert.equal(NeoBidi.bookFromFirstLetter({}, 'a', []), null);
  assert.equal(NeoBidi.bookFromFirstLetter({}, 'ש', ['Once upon a time']), null);
  assert.equal(NeoBidi.bookFromFirstLetter({ direction: 'ltr' }, 'ש', []), null);
  assert.equal(NeoBidi.bookFromFirstLetter({ direction: 'rtl' }, 'ש', []), null);
  // a script with no letters is mirrored by its first Hebrew letter too (Phase 10)
  assert.deepEqual(NeoBidi.bookFromFirstLetter({ format: 'screenplay' }, 'ש', []), { direction: 'rtl', language: 'he' });
  assert.equal(NeoBidi.bookFromFirstLetter({ format: 'screenplay', direction: 'ltr' }, 'ש', []), null);
});

test('flipping the book drops the dir that now matches, and nothing else', () => {
  const html = '<p>שלום</p><p dir="ltr">Hello</p><p class="poetry" dir="ltr" style="text-align: center;">x</p><p dir="rtl">a</p>';
  assert.equal(NeoBidi.dropParaDir(html, 'ltr'), '<p>שלום</p><p>Hello</p><p class="poetry" style="text-align: center;">x</p><p dir="rtl">a</p>');
  assert.equal(NeoBidi.dropParaDir(html, 'rtl'), '<p>שלום</p><p dir="ltr">Hello</p><p class="poetry" dir="ltr" style="text-align: center;">x</p><p>a</p>');
  // the same string, not a copy of it, when nothing changes (so the chapter isn't written)
  const plain = '<p>One</p><p dir="rtl">Two</p>';
  assert.equal(NeoBidi.dropParaDir(plain, 'ltr'), plain);
  assert.equal(NeoBidi.dropParaDir(undefined, 'ltr'), undefined);
  // text that only mentions dir is not touched
  assert.equal(NeoBidi.dropParaDir('<p>say dir="ltr" aloud</p>', 'ltr'), '<p>say dir="ltr" aloud</p>');
});

test('Ctrl+Right Shift and Ctrl+Left Shift: held with Ctrl, alone, acting on release', () => {
  const from = app.indexOf('function directionKeyTracker()');
  const to = app.indexOf('// ---- end of direction keys ----');
  assert.ok(from > 0 && to > from);
  const context = vm.createContext({});
  vm.runInContext(app.slice(from, to) + '\nthis.make = directionKeyTracker;', context);
  const ev = (code, mods = {}) => ({ code, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...mods });
  const run = (steps) => {
    const track = context.make();
    return steps.map(([type, code, mods]) => track(type, ev(code, mods)));
  };
  const last = (r) => r[r.length - 1];
  const C = { ctrlKey: true };
  assert.equal(last(run([['keydown', 'ControlLeft', C], ['keydown', 'ShiftRight', C], ['keyup', 'ShiftRight', C]])), 'rtl');
  assert.equal(last(run([['keydown', 'ControlLeft', C], ['keydown', 'ShiftLeft', C], ['keyup', 'ShiftLeft', C]])), 'ltr');
  // another key between: no
  assert.equal(last(run([['keydown', 'ControlLeft', C], ['keydown', 'ShiftRight', C], ['keydown', 'KeyA', C], ['keyup', 'KeyA', C], ['keyup', 'ShiftRight', C]])), null);
  // Ctrl let go first, or never held: no
  assert.equal(last(run([['keydown', 'ControlLeft', C], ['keydown', 'ShiftRight', C], ['keyup', 'ControlLeft'], ['keyup', 'ShiftRight']])), null);
  assert.equal(last(run([['keydown', 'ShiftRight'], ['keyup', 'ShiftRight']])), null);
  // both Shifts, or Alt, or Cmd: no
  assert.equal(last(run([['keydown', 'ShiftRight', C], ['keydown', 'ShiftLeft', C], ['keyup', 'ShiftLeft', C], ['keyup', 'ShiftRight', C]])), null);
  assert.equal(last(run([['keydown', 'ShiftRight', { ctrlKey: true, altKey: true }], ['keyup', 'ShiftRight', C]])), null);
  // a held key repeating still fires once, on release
  const held = run([['keydown', 'ShiftRight', C], ['keydown', 'ShiftRight', { ...C, repeat: true }], ['keyup', 'ShiftRight', C]]);
  assert.deepEqual(held, [null, null, 'rtl']);
  // and nothing is left armed afterwards
  const t = context.make();
  assert.equal(t('keydown', ev('ShiftRight', C)), null);
  assert.equal(t('keyup', ev('ShiftRight', C)), 'rtl');
  assert.equal(t('keyup', ev('ShiftRight', C)), null);
});
