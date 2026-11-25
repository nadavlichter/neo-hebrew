// NEO — interface translations
//
// One tiny helper shared by the main process (require) and the window
// (window.NeoI18n). The English text itself is the key, so the code stays
// readable and a missing translation simply shows the English original:
//
//   t('Sprint complete — {n} words. Well earned.', { n: 1200 })
//
// A language is one file, locales/<code>.json, mapping each English string
// to its translation. Plural-sensitive strings may map to an object keyed by
// Intl.PluralRules categories ("one", "few", "many", "other"…), chosen by
// the {n} variable:
//
//   "{n} words": { "one": "{n} mot", "other": "{n} mots" }
//
// "_meta" in each file gives the language's own name for the Language menu.
// Numbers passed as variables are formatted for the language (1 200 in
// French, 1,200 in English). Pass a string to keep a number raw.
//
// Right to left: getDir() says 'rtl' for a language that runs that way (its
// file's _meta.dir, or else bidi.js's list of languages). In such a language
// every string variable is wrapped in an isolate, so a title or a name in
// another script cannot reorder the sentence around it (a path gets a
// left-to-right one, so it still reads as a path). The isolates are for the
// eye (also for RTL values in LTR chrome): plain() takes them out wherever the text goes into a file, a book's
// data or an exported document.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoI18n = api;
})(typeof self !== 'undefined' ? self : this, function () {
  let locale = 'en';
  let dict = {};      // the chosen language
  let base = {};      // locales/en.json: English plurals and overrides
  let plural = new Intl.PluralRules('en');
  let numFmt = new Intl.NumberFormat('en');
  let metaDir = '';   // _meta.dir of the chosen language: 'rtl', 'ltr' or ''

  // bidi.js: require in Node, the window's NeoBidi in the page
  let bidi = null;
  try { bidi = typeof module === 'object' && module.exports ? require('./bidi.js') : null; } catch { bidi = null; }
  if (!bidi && typeof self !== 'undefined') bidi = self.NeoBidi || null;

  const ISOLATES = /[\u2066-\u2069]/g;
  const FSI = '\u2068', LRI = '\u2066', PDI = '\u2069';

  function setLocale(code, translations, english) {
    locale = code || 'en';
    dict = translations || {};
    base = english || {};
    const dir = dict._meta && dict._meta.dir;
    metaDir = dir === 'rtl' || dir === 'ltr' ? dir : '';
    try { plural = new Intl.PluralRules(locale); } catch { plural = new Intl.PluralRules('en'); }
    try { numFmt = new Intl.NumberFormat(locale); } catch { numFmt = new Intl.NumberFormat('en'); }
  }

  function pick(entry, vars, rules = plural) {
    if (entry && typeof entry === 'object') {
      const n = vars && typeof vars.n === 'number' ? vars.n : 0;
      return entry[rules.select(n)] || entry.other || null;
    }
    return typeof entry === 'string' && entry ? entry : null;
  }

  // 'rtl' or 'ltr' for the interface language
  function getDir() {
    if (metaDir) return metaDir;
    return bidi && bidi.isRtlLang(locale) ? 'rtl' : 'ltr';
  }

  // A value that is a file path: absolute (/…, ~/…, C:\… or C:/…), or a UNC
  // share (\\host). It reads left to right even in a Hebrew sentence.
  const PATHLIKE = /^(?:\/|~\/|[A-Za-z]:[\\/]|\\\\)/;

  function fill(str, vars, fmt = numFmt, isolate = true) {
    if (!vars) return str;
    const rtl = isolate && getDir() === 'rtl';
    return str.replace(/\{(\w+)\}/g, (m, k) => {
      if (!(k in vars)) return m;
      const v = vars[k];
      if (typeof v === 'number') return fmt.format(v);
      const s = String(v);
      if (!s || !isolate || (!rtl && !(bidi && bidi.dirCounts(s).rtl))) return s;
      return (PATHLIKE.test(s) ? LRI : FSI) + s + PDI;
    });
  }

  // The text without the isolates fill() put around its variables
  const plain = (s) => String(s == null ? '' : s).replace(ISOLATES, '');

  function t(key, vars) {
    let str = pick(dict[key], vars);
    if (str == null) {
      // English plurals live in en.json; the key is the last word
      const savedPlural = plural;
      if (locale !== 'en') plural = new Intl.PluralRules('en');
      str = pick(base[key], vars);
      plural = savedPlural;
    }
    if (str == null) str = key;
    return fill(str, vars);
  }

  // A second language beside the interface's, for the words a book carries into its
  // pages and files (Chapter 1 / פרק 1) whatever the interface says. The same lookup
  // as t(), with that language's plurals and numbers, and no isolates: these strings
  // are the book's, not a sentence of the interface. `english` is locales/en.json.
  function translator(code, translations, english) {
    const loc = code || 'en';
    const dct = translations || {};
    const eng = english || {};
    let rules, fmt;
    try { rules = new Intl.PluralRules(loc); } catch { rules = new Intl.PluralRules('en'); }
    try { fmt = new Intl.NumberFormat(loc); } catch { fmt = new Intl.NumberFormat('en'); }
    const enRules = new Intl.PluralRules('en');
    return (key, vars) => {
      let str = pick(dct[key], vars, rules);
      if (str == null) str = pick(eng[key], vars, enRules);
      if (str == null) str = key;
      return fill(str, vars, fmt, false);
    };
  }

  // Which language a book's own words (chapter, part, prologue…) are set in: the
  // book's language when it has one; else, in a right-to-left interface, the
  // spellcheck language (English if none), so a Hebrew writer's English book
  // says Chapter; else the interface's own, which is what NEO always did.
  function headingLanguage(bookLanguage, spellLanguage) {
    if (typeof bookLanguage === 'string' && bookLanguage) return bookLanguage;
    if (getDir() === 'rtl') return spellLanguage || 'en';
    return locale;
  }

  const fmtNum = (n) => numFmt.format(n || 0);
  const fmtDate = (d, opts) => new Date(d).toLocaleDateString(locale, opts);
  const getLocale = () => locale;

  return { setLocale, t, translator, headingLanguage, plain, fmtNum, fmtDate, getLocale, getDir };
});
