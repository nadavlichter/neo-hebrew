'use strict';

// Phase 1 of the Hebrew plan: the interface language's direction, the
// isolates around {placeholders}, Hebrew plural forms and the translation
// checker's view of them.

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const I18n = require('../i18n');
const { isTranslated, placeholdersBroken } = require('./i18n.js');

const HE = {
  _meta: { name: 'עברית' },
  'Hello {name}': 'שלום {name}',
  'Your books live in:\n{dir}': 'הספרים שלך נמצאים ב:\n{dir}',
  '{n} words': { one: 'מילה אחת', two: 'שתי מילים', other: '{n} מילים' }
};
const FSI = '\u2068', LRI = '\u2066', PDI = '\u2069';

beforeEach(() => I18n.setLocale('en', {}, {}));

describe('getDir', () => {
  test('left to right for ordinary languages', () => {
    for (const code of ['en', 'fr', 'fr-CA', 'de', undefined]) {
      I18n.setLocale(code, {}, {});
      assert.equal(I18n.getDir(), 'ltr', String(code));
    }
  });
  test('right to left from the language code', () => {
    for (const code of ['he', 'he-IL', 'iw', 'ar', 'fa']) {
      I18n.setLocale(code, {}, {});
      assert.equal(I18n.getDir(), 'rtl', code);
    }
  });
  test('_meta.dir wins over the code, both ways', () => {
    I18n.setLocale('he', { _meta: { dir: 'ltr' } }, {});
    assert.equal(I18n.getDir(), 'ltr');
    I18n.setLocale('xx', { _meta: { dir: 'rtl' } }, {});
    assert.equal(I18n.getDir(), 'rtl');
    I18n.setLocale('en', { _meta: { dir: 'sideways' } }, {});
    assert.equal(I18n.getDir(), 'ltr');
  });
  test('a language chosen after a right to left one is left to right again', () => {
    I18n.setLocale('he', HE, {});
    I18n.setLocale('fr', {}, {});
    assert.equal(I18n.getDir(), 'ltr');
  });
});

describe('isolates around variables', () => {
  test('a string variable is isolated in a right to left language', () => {
    I18n.setLocale('he', HE, {});
    assert.equal(I18n.t('Hello {name}', { name: 'Bob' }), `שלום ${FSI}Bob${PDI}`);
  });
  test('a number stays bare, formatted for the language', () => {
    I18n.setLocale('he', HE, {});
    assert.equal(I18n.t('{n} words', { n: 1200 }), '1,200 מילים');
  });
  test('a path is isolated left to right', () => {
    I18n.setLocale('he', HE, {});
    for (const p of ['/Users/me/NEO Library', '~/Books', 'C:\\Users\\me', 'D:/Books', '\\\\server\\share']) {
      assert.equal(I18n.t('Your books live in:\n{dir}', { dir: p }), `הספרים שלך נמצאים ב:\n${LRI}${p}${PDI}`, p);
    }
  });
  test('an empty value and an unknown placeholder are left alone', () => {
    I18n.setLocale('he', HE, {});
    assert.equal(I18n.t('Hello {name}', { name: '' }), 'שלום ');
    assert.equal(I18n.t('Hello {name}', {}), 'שלום {name}');
  });
  test('left to right output is byte-identical to what it always was', () => {
    for (const code of ['en', 'fr']) {
      I18n.setLocale(code, { 'Hello {name}': 'Hi {name}' }, {});
      const out = I18n.t('Hello {name}', { name: 'Bob /x' });
      assert.equal(out, 'Hi Bob /x');
      assert.ok(!/[\u2066-\u2069]/.test(out));
    }
  });
  test('RTL or mixed writer text is isolated in English chrome, but not in book words', () => {
    I18n.setLocale('en', {}, {});
    for (const name of ['שלום', 'iPhone שלום']) {
      assert.equal(I18n.t('Hello {name}', { name }), `Hello ${FSI}${name}${PDI}`);
      assert.equal(I18n.plain(I18n.t('Hello {name}', { name })), 'Hello ' + name);
      assert.equal(I18n.translator('en', {}, {})('Hello {name}', { name }), 'Hello ' + name);
    }
  });
  test('plain() takes every isolate out and nothing else', () => {
    I18n.setLocale('he', HE, {});
    const s = I18n.t('Hello {name}', { name: 'Bob' }) + I18n.t('Your books live in:\n{dir}', { dir: '/a b' });
    assert.ok(/[\u2066-\u2069]/.test(s));
    assert.equal(I18n.plain(s), 'שלום Bobהספרים שלך נמצאים ב:\n/a b');
    assert.equal(I18n.plain('a\u200Fb\u200Ec'), 'a\u200Fb\u200Ec');
    assert.equal(I18n.plain(null), '');
    assert.equal(I18n.plain('plain'), 'plain');
  });
});

describe('Hebrew plurals', () => {
  test('Intl has one, two and other for Hebrew', () => {
    assert.deepEqual(new Intl.PluralRules('he').resolvedOptions().pluralCategories.slice().sort(), ['one', 'other', 'two']);
  });
  test('1, 2 and the rest pick their own form', () => {
    I18n.setLocale('he', HE, {});
    assert.equal(I18n.t('{n} words', { n: 1 }), 'מילה אחת');
    assert.equal(I18n.t('{n} words', { n: 2 }), 'שתי מילים');
    assert.equal(I18n.t('{n} words', { n: 0 }), '0 מילים');
    assert.equal(I18n.t('{n} words', { n: 3 }), '3 מילים');
    assert.equal(I18n.t('{n} words', { n: 22 }), '22 מילים');
  });
  test('a form missing falls back to other', () => {
    I18n.setLocale('he', { '{n} words': { one: 'מילה', other: '{n} מילים' } }, {});
    assert.equal(I18n.t('{n} words', { n: 2 }), '2 מילים');
  });
});

describe('scripts/i18n.js check', () => {
  const key = '{n} words';
  test('a plural object with a "two" key is translated', () => {
    assert.equal(isTranslated(HE[key]), true);
    assert.equal(isTranslated({ one: 'x', two: 'y' }), false); // no "other"
    assert.equal(isTranslated(''), false);
    assert.equal(isTranslated(undefined), false);
  });
  test('"one" and "two" forms without {n} are not lost placeholders', () => {
    assert.equal(placeholdersBroken(key, HE[key]), false);
  });
  test('a lost or invented placeholder still is', () => {
    assert.equal(placeholdersBroken('Hello {name}', 'שלום'), true);
    assert.equal(placeholdersBroken('Hello {name}', 'שלום {nmae}'), true);
    assert.equal(placeholdersBroken('Hello {name}', 'שלום {name}'), false);
    assert.equal(placeholdersBroken('{n} of {total}', { one: 'אחד', other: '{n} מתוך' }), true);
    assert.equal(placeholdersBroken('{n} of {total}', { one: '{total}', other: '{n} {total}' }), false);
  });
});

test('plural validation keeps neighbouring variables and requires counts in other forms', () => {
  const key = '{name}: {n} words';
  assert.equal(placeholdersBroken(key, { one: '{name}: מילה אחת', two: '{name}: שתי מילים', other: '{name}: {n} מילים' }), false);
  assert.equal(placeholdersBroken(key, { one: 'מילה אחת', other: '{name}: {n} מילים' }), true);
  assert.equal(placeholdersBroken(key, { one: '{name}: מילה אחת', other: '{name}: מילים' }), true);
  assert.equal(placeholdersBroken(key, '{name}: מילים'), true);
  assert.equal(placeholdersBroken(key, '{n} מילים: {name}'), false);
  assert.equal(placeholdersBroken('Hello {name}', { one: 'שלום {name} {invented}', other: 'שלום {name}' }), true);
});

test('the shipped Hebrew locale passes the actual CLI check without placeholder warnings', () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const output = execFileSync(process.execPath, [path.join(__dirname, 'i18n.js'), 'check', 'he'], { encoding: 'utf8' });
  assert.match(output, /he: \d+\/\d+ translated/);
  assert.ok(!output.includes('Placeholders differ') && !output.includes('Missing:'));
});

describe('the words a book carries (translator, headingLanguage)', () => {
  const EN = { '{n} words': { one: '{n} word', other: '{n} words' } };
  const FR = { 'Chapter {n}': 'Chapitre {n}', Part: 'Partie' };
  const HEB = { 'Chapter {n}': 'פרק {n}', 'Part {n}': 'חלק {n}', 'Hello {name}': 'שלום {name}' };

  test('a second language beside the interface, with no isolates', () => {
    I18n.setLocale('he', HEB, EN); // a Hebrew interface isolates its variables…
    assert.equal(I18n.t('Hello {name}', { name: 'Dana' }), `שלום ${FSI}Dana${PDI}`);
    const fr = I18n.translator('fr', FR, EN); // …a book's words never carry them
    assert.equal(fr('Chapter {n}', { n: 3 }), 'Chapitre 3');
    assert.equal(fr('Part'), 'Partie');
    const he = I18n.translator('he', HEB, EN);
    assert.equal(he('Hello {name}', { name: 'Dana' }), 'שלום Dana');
    assert.equal(he('Part {n}', { n: 'IV' }), 'חלק IV');
  });
  test('a missing key is the English key itself; plurals fall back on English', () => {
    const fr = I18n.translator('fr', FR, EN);
    assert.equal(fr('Prologue'), 'Prologue');
    assert.equal(fr('{n} words', { n: 1 }), '1 word');
    assert.equal(fr('{n} words', { n: 5 }), '5 words');
  });
  test('numbers are formatted in the translator\'s language, not the interface\'s', () => {
    I18n.setLocale('en', {}, EN);
    assert.equal(I18n.translator('he', HEB, EN)('Chapter {n}', { n: 1200 }), 'פרק 1,200');
    assert.equal(I18n.t('Chapter {n}', { n: 1200 }), 'Chapter 1,200');
  });
  test('the interface\'s own t() is untouched by making a translator', () => {
    I18n.setLocale('fr', FR, EN);
    I18n.translator('he', HEB, EN);
    assert.equal(I18n.t('Chapter {n}', { n: 2 }), 'Chapitre 2');
    assert.equal(I18n.getLocale(), 'fr');
  });
  test('headingLanguage: the book\'s own language first', () => {
    I18n.setLocale('en', {}, EN);
    assert.equal(I18n.headingLanguage('he', 'en-US'), 'he');
    I18n.setLocale('he', HEB, EN);
    assert.equal(I18n.headingLanguage('en', 'he'), 'en');
  });
  test('headingLanguage: a book with none follows the interface, as NEO always did', () => {
    for (const code of ['en', 'fr', 'fr-CA', 'de']) {
      I18n.setLocale(code, {}, EN);
      assert.equal(I18n.headingLanguage(undefined, 'es'), code, code);
      assert.equal(I18n.headingLanguage('', undefined), code, code);
    }
  });
  test('headingLanguage: in a right-to-left interface, the spellcheck language, else English', () => {
    I18n.setLocale('he', HEB, EN);
    assert.equal(I18n.headingLanguage(undefined, 'en-US'), 'en-US');
    assert.equal(I18n.headingLanguage(undefined, 'fr'), 'fr');
    assert.equal(I18n.headingLanguage('', ''), 'en');
    assert.equal(I18n.headingLanguage(undefined, undefined), 'en');
  });
});
