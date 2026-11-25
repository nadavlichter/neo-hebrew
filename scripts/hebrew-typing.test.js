'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const source = require('./app-files').appSource();
const slice = (a, b) => source.slice(source.indexOf(a), source.indexOf(b));
function room(language, locale = 'en', spellLanguage = 'fr') {
  let selected = 0;
  const ctx = vm.createContext({ book: { language }, library: { spellLanguage }, NeoI18n: { getLocale: () => locale }, window: { getSelection: () => { selected++; return { rangeCount: 0 }; } }, CAPS_ABBREV: new Set(), pressHoldOn: false, capPending: null, MODIFIER_KEYS: new Set() });
  vm.runInContext(slice('function writingLanguage()', 'function hebrewWriting()'), ctx);
  vm.runInContext(slice('function hebrewWriting()', '// Opening marks before a word'), ctx);
  vm.runInContext(slice('function autoCapKey(', '// ⌘Z (Ctrl+Z) right after: the lowercase'), ctx);
  vm.runInContext(slice('function capitalSlips(', 'function rebuildSpellHighlight('), ctx);
  vm.runInContext(slice('function frenchTypography()', '// ⌥⌘→ / ⌥⌘←'), ctx);
  return { ctx, selected: () => selected };
}
const body = { matches: () => true, querySelectorAll: () => [] };
for (const language of ['he', 'he-IL', 'iw']) {
  test(language + ' leaves Latin and Hebrew casing untouched, regardless of the interface/spellcheck language', () => {
    for (const locale of ['en', 'he', 'fr-CA']) {
      const r = room(language, locale);
      for (const key of ['i', 'h', 'ש']) r.ctx.autoCapKey({ key }, body);
      assert.equal(r.selected(), 0, 'no typing edits attempted');
      assert.equal(JSON.stringify(r.ctx.capitalSlips(body)), '[]', 'no capitalization squiggles');
      assert.equal(r.ctx.frenchTypography(), false);
    }
  });
}
test('an English book keeps its capitalization path in a Hebrew interface', () => {
  const r = room('en', 'he');
  r.ctx.autoCapKey({ key: 'i' }, body);
  assert.equal(r.selected(), 1);
  assert.equal(r.ctx.frenchTypography(), false);
});
test('a book with no language follows the book, not the Hebrew interface', () => {
  const plain = room(undefined, 'he', undefined);
  plain.ctx.autoCapKey({ key: 'i' }, body);
  assert.equal(plain.selected(), 1, 'an English book with no language keeps automatic capitals');
  const rtl = room(undefined, 'en', undefined);
  rtl.ctx.book.direction = 'rtl';
  rtl.ctx.autoCapKey({ key: 'i' }, body);
  assert.equal(rtl.selected(), 0, 'a right-to-left book with no language is Hebrew writing');
});
test('French typography follows the book language rather than the Hebrew interface', () => {
  const r = room('fr', 'he', 'en');
  assert.equal(r.ctx.frenchTypography(), 'fr');
});
