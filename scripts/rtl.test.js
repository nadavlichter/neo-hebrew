'use strict';

// Direction helpers (bidi.js) and the book's writing language (app.js).
// Phase 0 of the Hebrew plan: nothing here changes how an existing book
// behaves; these are the rules the later phases stand on.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, test } = require('node:test');

const bidi = require('../bidi');
const { isRtlLang, charDir, strongDir, dirCounts, majorityDir, bookDir } = bidi;

describe('isRtlLang', () => {
  test('Hebrew in every spelling', () => {
    for (const code of ['he', 'he-IL', 'he_IL', 'iw', 'HE', 'He-il', 'iw-IL']) assert.equal(isRtlLang(code), true, code);
  });
  test('other right-to-left languages', () => {
    for (const code of ['ar', 'fa', 'ur', 'yi', 'ar-EG']) assert.equal(isRtlLang(code), true, code);
  });
  test('left-to-right languages and nothing', () => {
    for (const code of ['en', 'en-US', 'fr', 'de', 'hebrew', '', undefined, null]) assert.equal(isRtlLang(code), false, String(code));
  });
});

describe('charDir', () => {
  test('letters', () => {
    assert.equal(charDir('ש'), 'rtl');
    assert.equal(charDir('ת'), 'rtl');
    assert.equal(charDir('ب'), 'rtl');
    assert.equal(charDir('a'), 'ltr');
    assert.equal(charDir('é'), 'ltr');
    assert.equal(charDir('Ж'), 'ltr');
  });
  test('digits, punctuation, spaces and marks are not strong', () => {
    for (const ch of ['5', '٣', ' ', '.', ',', '-', '(', '₪', '$', '‎', '‏', '', undefined]) assert.equal(charDir(ch), '', JSON.stringify(ch));
  });
  test('niqqud and cantillation are marks', () => {
    for (const ch of ['ְ', 'ַ', 'ּ', 'ׁ', '֑']) assert.equal(charDir(ch), '');
  });
  test('maqaf, geresh and gershayim are punctuation', () => {
    for (const ch of ['־', '׳', '״']) assert.equal(charDir(ch), '');
  });
});

describe('strongDir', () => {
  test('the first strong letter decides', () => {
    assert.equal(strongDir('שלום world'), 'rtl');
    assert.equal(strongDir('iPhone הוא טלפון'), 'ltr');
    assert.equal(strongDir('2024 היא שנה'), 'rtl');
    assert.equal(strongDir('“שלום”'), 'rtl');
  });
  test('only neutrals: no direction', () => {
    assert.equal(strongDir(''), '');
    assert.equal(strongDir('  123 -- ()'), '');
    assert.equal(strongDir(undefined), '');
  });
  test('niqqud ahead of the first letter does not decide', () => {
    assert.equal(strongDir('ְַ בית'), 'rtl');
    assert.equal(strongDir('ְ abc'), 'ltr');
  });
  test('an explicit mark ahead of any letter decides', () => {
    assert.equal(strongDir('‏abc'), 'rtl');
    assert.equal(strongDir('‎שלום'), 'ltr');
    assert.equal(strongDir('؜abc'), 'rtl');
    assert.equal(strongDir('12 ‏abc'), 'rtl');
  });
  test('a mark after a letter is too late', () => {
    assert.equal(strongDir('abc‏שלום'), 'ltr');
  });
  test('isolates are passed over', () => {
    assert.equal(strongDir('⁨abc⁩ שלום'), 'rtl');
    assert.equal(strongDir('⁧שלום⁩ abc'), 'ltr');
    assert.equal(strongDir('⁦abc ⁧שלום⁩ def⁩ גם'), 'rtl');
    assert.equal(strongDir('⁨abc⁩'), '');
  });
});

describe('dirCounts and majorityDir', () => {
  test('counts strong letters only', () => {
    assert.deepEqual(dirCounts('שלום abc 123'), { rtl: 4, ltr: 3 });
    assert.deepEqual(dirCounts(''), { rtl: 0, ltr: 0 });
    assert.deepEqual(dirCounts('ְַ 12 ,.'), { rtl: 0, ltr: 0 });
  });
  test('the majority wins, a tie takes the fallback', () => {
    assert.equal(majorityDir('הוא גר בעיר הגדולה New York'), 'rtl');
    assert.equal(majorityDir('He lives in תל'), 'ltr');
    assert.equal(majorityDir('אב ab'), 'ltr');
    assert.equal(majorityDir('אב ab', 'rtl'), 'rtl');
    assert.equal(majorityDir('123'), 'ltr');
    assert.equal(majorityDir('123', 'rtl'), 'rtl');
  });
});

describe('bookDir', () => {
  test('only an explicit rtl makes a book right to left', () => {
    assert.equal(bookDir({ direction: 'rtl' }), 'rtl');
    assert.equal(bookDir({ direction: 'ltr' }), 'ltr');
    assert.equal(bookDir({}), 'ltr');
    assert.equal(bookDir({ direction: 'RTL' }), 'ltr');
    assert.equal(bookDir({ direction: 'auto' }), 'ltr');
    assert.equal(bookDir({ language: 'he' }), 'ltr');
    assert.equal(bookDir(null), 'ltr');
    assert.equal(bookDir(undefined), 'ltr');
  });
});

describe('mixed-text fixtures', () => {
  const dir = path.join(__dirname, 'fixtures', 'hebrew');
  const cases = JSON.parse(fs.readFileSync(path.join(dir, 'mixed-cases.json'), 'utf8'));

  test('the file is well formed', () => {
    assert.ok(cases.length >= 20);
    const ids = new Set();
    for (const c of cases) {
      assert.ok(c.id && c.text && c.note, c.id);
      assert.ok(c.paragraphDir === 'rtl' || c.paragraphDir === 'ltr', c.id);
      assert.ok(!ids.has(c.id), 'duplicate id ' + c.id);
      ids.add(c.id);
    }
  });
  for (const c of cases) {
    test(c.id, () => {
      if (c.firstStrongDiffers) {
        assert.notEqual(strongDir(c.text), c.paragraphDir);
        assert.equal(strongDir(c.text), 'ltr');
      } else {
        assert.equal(strongDir(c.text), c.paragraphDir);
      }
    });
  }
  test('the chapter file carries dir only on the English paragraph', () => {
    const html = fs.readFileSync(path.join(dir, 'book-chapter.html'), 'utf8');
    assert.equal((html.match(/ dir="/g) || []).length, 1);
    assert.ok(html.includes('<p dir="ltr">It was a quiet morning'));
    assert.ok(html.includes('<p class="scene-break">***</p>'));
  });
});

describe('writingLanguage', () => {
  const app = require('./app-files').appSource();
  const from = app.indexOf('function writingLanguage(');
  const to = app.indexOf('function quoteStyle(');
  assert.ok(from > 0 && to > from, 'writingLanguage and quoteStyle are where this test looks');
  const context = vm.createContext({ library: null, book: null, NeoI18n: { getLocale: () => 'fr' }, NeoBidi: bidi });
  vm.runInContext(app.slice(from, to) + '\nthis.api = { writingLanguage };', context);
  const { writingLanguage } = context.api;

  test('the book\'s language comes first', () => {
    context.library = { spellLanguage: 'en-US' };
    context.book = { language: 'he' };
    assert.equal(writingLanguage(), 'he');
  });
  test('a book with no language is as before: the spellcheck language, then the interface', () => {
    context.library = { spellLanguage: 'en-US' };
    context.book = { title: 'x' };
    assert.equal(writingLanguage(), 'en-US');
    context.book = { language: '' };
    assert.equal(writingLanguage(), 'en-US');
    context.library = {};
    assert.equal(writingLanguage(), 'fr');
  });
  test('on the shelf there is no book', () => {
    context.book = null;
    context.library = { spellLanguage: 'de' };
    assert.equal(writingLanguage(), 'de');
    context.library = null;
    assert.equal(writingLanguage(), 'fr');
  });
});

describe('logical alignment (D3)', () => {
  const { alignStyleFor, alignOf } = bidi;
  test('left to right: Left is the default and stored as nothing, as it always was', () => {
    assert.equal(alignStyleFor('left', 'ltr'), '');
    for (const v of ['center', 'right', 'justify']) assert.equal(alignStyleFor(v, 'ltr'), v);
    assert.equal(alignStyleFor('left', undefined), '');
  });
  test('right to left: Right is the default and stored as nothing; Left is kept', () => {
    assert.equal(alignStyleFor('right', 'rtl'), '');
    assert.equal(alignStyleFor('left', 'rtl'), 'left');
    for (const v of ['center', 'justify']) assert.equal(alignStyleFor(v, 'rtl'), v);
  });
  test('the menu tick: no text-align is the start side', () => {
    assert.equal(alignOf('', 'ltr'), 'left');
    assert.equal(alignOf(undefined, 'ltr'), 'left');
    assert.equal(alignOf('', 'rtl'), 'right');
  });
  test('physical values keep their meaning in either direction', () => {
    for (const dir of ['ltr', 'rtl']) for (const v of ['left', 'right', 'center', 'justify']) assert.equal(alignOf(v, dir), v);
  });
  test('start and end follow the paragraph', () => {
    assert.equal(alignOf('start', 'ltr'), 'left');
    assert.equal(alignOf('end', 'ltr'), 'right');
    assert.equal(alignOf('start', 'rtl'), 'right');
    assert.equal(alignOf('end', 'rtl'), 'left');
  });
  test('anything else ticks nothing', () => {
    assert.equal(alignOf('match-parent', 'ltr'), null);
    assert.equal(alignOf('RIGHT', 'ltr'), 'right');
  });
});
