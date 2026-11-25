// NEO — text direction helpers
//
// Shared by the main process (require) and the window (window.NeoBidi),
// the same way i18n.js is. Plain functions, no dependencies, so the tests
// can run them in Node.
//
// A book is left to right unless its book.json says "direction": "rtl".
// Absent or unknown means ltr, so every book written before this existed
// behaves as it always did.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoBidi = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Hebrew, Yiddish, Arabic, Persian, Urdu. Not Hebrew-only: the rest come
  // almost free once Hebrew works.
  const RTL_LANGS = new Set(['he', 'yi', 'ar', 'fa', 'ur']);

  // 'iw' is the old code for Hebrew (and 'ji' for Yiddish); some systems
  // and files still say it.
  const LEGACY = { iw: 'he', ji: 'yi' };

  function isRtlLang(code) {
    if (!code) return false;
    const base = String(code).toLowerCase().split(/[-_]/)[0];
    return RTL_LANGS.has(LEGACY[base] || base);
  }

  // Letters that run right to left: Hebrew, Arabic, Syriac, Thaana, NKo and
  // their presentation forms. Only \p{L} counts, so points, cantillation,
  // digits and punctuation in the same blocks never decide a direction.
  const RTL_BLOCKS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  const LETTER = /\p{L}/u;

  // 'rtl' or 'ltr' for a strong letter, '' for everything else (digits,
  // punctuation, spaces, combining marks such as niqqud, LRM/RLM).
  function charDir(ch) {
    if (!ch || !LETTER.test(ch)) return '';
    return RTL_BLOCKS.test(ch) ? 'rtl' : 'ltr';
  }

  // Direction of the first strong character, or ''. As in the Unicode
  // algorithm (P2), text inside an isolate (LRI, RLI, FSI … PDI) is passed
  // over, and an explicit mark ahead of any letter decides.
  function strongDir(text) {
    let depth = 0;
    for (const ch of String(text || '')) {
      const c = ch.codePointAt(0);
      if (c >= 0x2066 && c <= 0x2068) { depth++; continue; }
      if (c === 0x2069) { if (depth > 0) depth--; continue; }
      if (depth) continue;
      if (c === 0x200E) return 'ltr';
      if (c === 0x200F || c === 0x061C) return 'rtl';
      const d = charDir(ch);
      if (d) return d;
    }
    return '';
  }

  // How many strong letters run each way. For imports and rebuilt books,
  // where there is no setting to read yet.
  function dirCounts(text) {
    const n = { rtl: 0, ltr: 0 };
    for (const ch of String(text || '')) {
      const d = charDir(ch);
      if (d) n[d]++;
    }
    return n;
  }

  function majorityDir(text, fallback = 'ltr') {
    const n = dirCounts(text);
    return n.rtl > n.ltr ? 'rtl' : n.ltr > n.rtl ? 'ltr' : fallback;
  }

  // The book's direction. Only an explicit 'rtl' makes it right to left.
  function bookDir(book) {
    return book && book.direction === 'rtl' ? 'rtl' : 'ltr';
  }

  // A book with no direction of its own (book.json rebuilt from the chapter
  // files, or made before directions existed) whose text is mostly right to
  // left. Returns the fields to set, or null. It never answers 'ltr': an
  // English book with no direction stays as it is on disk, and an explicit
  // 'ltr' (or 'rtl') from the writer is respected. Scripts are left alone.
  // `text` is plain text; the language is only guessed when it is Hebrew.
  function inferRtlBook(book, text) {
    if (!book || book.direction !== undefined || book.format === 'screenplay') return null;
    if (majorityDir(text) !== 'rtl') return null;
    const out = { direction: 'rtl' };
    if (!book.language) {
      let he = 0, other = 0;
      for (const ch of String(text || '')) {
        if (charDir(ch) !== 'rtl') continue;
        if (/[\u0590-\u05FF\uFB1D-\uFB4F]/.test(ch)) he++; else other++;
      }
      if (he > other) out.language = 'he';
    }
    return out;
  }

  // D4: the direction a paragraph takes when `inserted` is typed after
  // `before` (the paragraph's text up to the caret). Only the first strong
  // letter counts, so digits, quotes and spaces never decide, and a paragraph
  // that already has a letter before the insertion is never flipped. Returns
  // 'rtl', 'ltr' or '' (nothing to decide). An RTL paragraph keeps its
  // direction when an English word opens it; whole LTR paragraphs use the
  // explicit direction command.
  function autoDir(before, inserted, currentDir = 'ltr') {
    if (strongDir(before)) return '';
    const dir = strongDir(inserted);
    return currentDir === 'rtl' && dir === 'ltr' ? '' : dir;
  }

  // What a paragraph's dir attribute is for a direction in a book of
  // `bookDirection` (D2): none where it matches the book, else the direction.
  function paraDirAttr(dir, bookDirection) {
    return !dir || dir === bookDirection ? null : dir;
  }

  // 3.8: the first strong letter of a book with no direction of its own,
  // typed when no chapter holds a letter yet, sets the book. `typed` is the
  // text just typed; `texts` the plain text of everything else in the book.
  // Returns the fields to set or null. It never answers 'ltr': an English
  // letter in a book with no direction changes nothing, and an explicit
  // direction is left alone. A script too: its first Hebrew letter mirrors
  // its page (Phase 10).
  function bookFromFirstLetter(book, typed, texts) {
    if (!book || book.direction !== undefined) return null;
    if (strongDir(typed) !== 'rtl') return null;
    if ((texts || []).some((x) => strongDir(x))) return null;
    const out = { direction: 'rtl' };
    if (!book.language) {
      for (const ch of String(typed || '')) {
        if (charDir(ch) !== 'rtl') continue;
        if (/[\u0590-\u05FF\uFB1D-\uFB4F]/.test(ch)) out.language = 'he';
        break;
      }
    }
    return out;
  }

  // Book Direction: a chapter's HTML with the dir a paragraph carries
  // removed where it now equals the book's (D2). The same string comes back
  // when nothing changes, so a chapter that needs no rewrite isn't written.
  function dropParaDir(html, dir) {
    const attr = ` dir="${dir}"`;
    if (typeof html !== 'string' || !html.includes(attr)) return html;
    return html.replace(/<p\b[^>]*>/g, (tag) => tag.replace(attr, ''));
  }

  // D3: alignment is logical. A paragraph's default alignment is its start (left
  // in a left-to-right paragraph, right in a right-to-left one) and is stored as
  // nothing. `alignStyleFor` is the text-align to store ('' for none) when the
  // writer picks `value` (left, center, right, justify) in a paragraph of
  // `paraDir`. A physical left/right already in a file keeps its meaning.
  function alignStyleFor(value, paraDir) {
    if (paraDir === 'rtl') return value === 'right' ? '' : value;
    return value === 'left' ? '' : value;
  }
  // The menu value (left, center, right, justify) a stored text-align shows as in
  // a paragraph of `paraDir`; null for anything else. start and end are read in
  // the paragraph's direction.
  function alignOf(style, paraDir) {
    const v = String(style || '').trim().toLowerCase();
    const rtl = paraDir === 'rtl';
    if (!v) return rtl ? 'right' : 'left';
    if (v === 'start') return rtl ? 'right' : 'left';
    if (v === 'end') return rtl ? 'left' : 'right';
    return ['left', 'center', 'right', 'justify'].includes(v) ? v : null;
  }

  // Where a pointer-placed menu of width w goes, in screen pixels from the
  // left edge of a viewport vw wide. Left to right it opens to the right of
  // the pointer; right to left its right edge is at the pointer. Either way it
  // stays `gap` clear of both edges (the left edge wins if it can't fit).
  function menuLeft(x, w, vw, rtl, gap = 4) {
    const want = rtl ? x - w : x;
    return Math.max(gap, Math.min(want, vw - w - gap));
  }

  // Whether a pointer at x falls before the middle of a box [left, left +
  // width) laid out in a row of the given direction: before is on the left
  // for 'ltr' and on the right for 'rtl'.
  function beforeMiddle(x, left, width, dir) {
    const mid = left + width / 2;
    return dir === 'rtl' ? x > mid : x < mid;
  }

  // ArrowLeft/ArrowRight in a row of the given direction, as a step through
  // the row's items in reading order: +1 the next, -1 the previous, 0 any
  // other key. Left to right, → is next; right to left, ← is.
  function rowStep(key, dir) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return 0;
    return (key === 'ArrowRight') === (dir !== 'rtl') ? 1 : -1;
  }

  // Whether a box [left, right) that grows to `span` wide toward the end of
  // its row (rightward for 'ltr', leftward for 'rtl') would run past the
  // row's own box [boxLeft, boxRight) by more than `slack`, so it should grow
  // back toward the start instead.
  function opensBack(left, right, span, boxLeft, boxRight, dir, slack = 4) {
    return dir === 'rtl' ? right - span < boxLeft - slack : left + span > boxRight + slack;
  }

  return { RTL_LANGS, isRtlLang, charDir, strongDir, dirCounts, majorityDir, bookDir, inferRtlBook, autoDir, paraDirAttr, alignStyleFor, alignOf, bookFromFirstLetter, dropParaDir, menuLeft, beforeMiddle, rowStep, opensBack };
});
