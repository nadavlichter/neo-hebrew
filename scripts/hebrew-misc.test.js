'use strict';
// Hebrew in small places: Markdown emphasis around Hebrew words, the voice a
// right-to-left book is read in, the stats chart's direction, and the
// footnote / walking-note boxes taking the page's direction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = require('./app-files').appSource();
const slice = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const bidi = fs.readFileSync(path.join(__dirname, '..', 'bidi.js'), 'utf8');

test('Markdown emphasis closes around Hebrew words and a Hebrew prefix', () => {
  const ctx = vm.createContext({});
  vm.runInContext(slice('const escRe', 'function pointAt('), ctx);
  const m = ctx.mdEmphasisMatch('הוא אמר *מילה', '*');
  assert.ok(m && m.italic && !m.bold && m.inner === 'מילה');
  const b = ctx.mdEmphasisMatch('**מילה חזקה*', '*');
  assert.ok(b && b.bold && b.inner === 'מילה חזקה', 'the second closing * of ** is the one still to type');
  assert.equal(ctx.mdEmphasisMatch('ה*מילה', '*'), null, 'a letter right before the opening mark (as in 2*3) is not an emphasis edge');
});

function room(book, lib, locale) {
  const ctx = vm.createContext({ book, library: lib, NeoI18n: { getLocale: () => locale || 'en' } });
  vm.runInContext(bidi, ctx);
  vm.runInContext('var NeoBidi = (typeof NeoBidi !== "undefined" ? NeoBidi : globalThis.NeoBidi);', ctx);
  vm.runInContext(slice('function bookDirection()', 'const uiRtl'), ctx);
  vm.runInContext(slice('function writingLanguage()', 'function hebrewWriting()'), ctx);
  vm.runInContext(slice('function exportLanguage()', 'function bookExportData()'), ctx);
  return ctx;
}

test('read aloud: a right-to-left book with no language is read in Hebrew; English is unchanged', () => {
  const rtl = room({ direction: 'rtl' }, { spellLanguage: 'en-US' }, 'en');
  assert.equal(rtl.exportLanguage(), 'he');
  const en = room({}, { spellLanguage: 'en-US' }, 'he');
  assert.equal(en.exportLanguage(), 'en-US');
  const fr = room({ language: 'fr', direction: 'rtl' }, {}, 'en');
  assert.equal(fr.exportLanguage(), 'fr');
});

test('the stats chart is mirrored in a right-to-left interface only', () => {
  const run = (rtl) => {
    const ctx = vm.createContext({
      book: { dailyCounts: {} }, library: {}, t: (s) => s, escHtml: (s) => s, writingDay: () => 'd', uiRtl: () => rtl
    });
    vm.runInContext(slice('function statsChartSvg()', '/*  COVER ART SETTINGS'), ctx);
    return ctx.statsChartSvg();
  };
  assert.match(run(true), /<svg id="stats-chart"[^>]*scaleX\(-1\)/);
  assert.doesNotMatch(run(false), /scaleX/);
});

test('the footnote box and the walking note take the page\'s direction', () => {
  assert.match(source, /el\.className = 'fn-box';\n\s+el\.dir = mark\.dataset\.noteDir \|\| getComputedStyle\(p\)\.direction;/);
  assert.match(source, /walkEl\.className = 'walk-note';\n\s+walkEl\.dir = getComputedStyle\(p\)\.direction;/);
});
