# Architecture: Hebrew and right-to-left writing

How Hebrew and right-to-left (RTL) writing fit into NEO. NEO's own architecture (processes, files on disk, saving and sync) is in [../AGENTS.md](../AGENTS.md); its "Right-to-left" section is the short version of this file. The design decisions D1–D8 and the reasons behind the smaller choices are in [DECISIONS.md](DECISIONS.md).

## The two directions

NEO has two directions, and they never set each other:

- **The interface's** (`uiRtl()` in `app/editor.js`, `<html dir>`): the shelf, panes, tab bar, bottom bar, menus, modals, find bar, toasts and Options. It comes from `NeoI18n.getDir()`, which reads `_meta.dir` from the locale file (`he.json` says `"rtl"`), else `NeoBidi.isRtlLang(locale)`.
- **The book's** (`bookDirection()` in `app/editor.js`): the page, notes, outline cards, darlings, snapshots and every export. It comes from `book.direction`.

An English book in a Hebrew interface and a Hebrew book in an English interface both work. `applyBookDir()` sets `dir` (and `lang`, when the book has one) on the outer containers in `BOOK_DIR_BOXES`: `#paper`, `#aux-paper` (notes, outline, darlings, `#snap-view`) and `#sticky-list`; `#side-cards` and `#loose-list` get it when they are built. It runs in `openBook` and `backToShelf`. Nothing is set on `.chapter-body` or its paragraphs, so no direction from the box reaches a saved chapter. A new container that holds writer text needs `dir = bookDirection()`.

## Where a direction comes from

**A book** (`book.direction`, D1):
- New Book in an RTL interface (`newBookLanguage`, `app/shelf.js`);
- the first RTL letter typed into a book with no letters and no `direction` (`NeoBidi.bookFromFirstLetter`);
- opening a book with no `direction` whose text is mostly RTL and where no paragraph already says `dir="rtl"` (`openingDirection` in `app/editor.js`, `NeoBidi.inferRtlBook`; never for a script's format, never `"ltr"`);
- Format → Book Direction (`setBookDirection`, `app/menu.js`), the only path that writes `"ltr"`.

**A paragraph** (its `dir`, D2): the first strong letter typed into a paragraph with no letter before the caret (`firstLetterDir`, `app/typing.js`; not for paste, drop, scripts, ghosts or scene breaks), Format → Paragraph Direction and its keys (`applyParaDir`, `app/menu.js`), paste (below) and import (below). `paraDirOf(p)` is the resolved direction (its own `dir`, else the book's); alignment and the menu ticks use it.

**What reaches the file.** `captureBody` calls `savedParaDir` (`app/typing-rules.js`): an engine `style="direction: …"` becomes `dir`, and a `dir` equal to the book's is dropped. Book Direction takes a `snapshotStructure`, runs `NeoBidi.dropParaDir` over every chapter and writes only those whose HTML changed. Nothing is normalised on open. NEO never inserts LRM or RLM on its own; the writer's own are kept.

## Data model

| Where | Field | Meaning | Written by |
|---|---|---|---|
| `book.json` | `language` | BCP 47 code of the book's text, e.g. `"he"`. Absent: the library's spellcheck language, then the interface's. | New Book in an RTL interface, the first Hebrew letter of an empty book, inference on open, Book Direction (RTL, in an RTL interface), import |
| `book.json` | `direction` | `"rtl"` or `"ltr"`. Absent or unknown means `ltr`. | The same paths; only Book Direction writes `"ltr"` |
| chapter `<p>` | `dir` | Only where it differs from the book's direction | Typing, Paragraph Direction, engine direction styles (through `captureBody`), paste, import |
| footnote | `data-note-dir` | A note's direction, only where it differs from the book's | Word import, the footnote editor |

Both `book.json` fields travel like any other metadata: `metaSig` saves them, no code keeps a whitelist of keys, and `book:writeMeta`, `book:readMeta`, `book:duplicate` and Pocket's bridge pass the object whole. `book:create` and `rebuildBookMeta` don't set them; a rebuilt book gets its direction back by inference on open.

## `bidi.js` (`window.NeoBidi`, `require('./bidi')`)

A UMD module shared by the window, the main process and Pocket. It loads before `i18n.js` and `app/` on both pages, and `scripts/pocket-www.js` copies it into `pocket/www/`.

| Function | Returns | Notes |
|---|---|---|
| `RTL_LANGS` | `Set` of `he yi ar fa ur` | Only Hebrew is tested and supported |
| `isRtlLang(code)` | boolean | `he`, `he-IL`, `he_IL`, any case; also the legacy `iw` and `ji` |
| `charDir(ch)` | `'rtl'`, `'ltr'` or `''` | Only `\p{L}` letters are strong. Niqqud, cantillation, maqaf, geresh, gershayim, digits, punctuation and LRM/RLM give `''` |
| `strongDir(text)` | `'rtl'`, `'ltr'` or `''` | The first strong character (bidi rule P2). LRM/RLM/ALM before any letter decide; text inside isolates is skipped |
| `dirCounts(text)` / `majorityDir(text, fallback)` | counts / direction | For imports and books with no setting |
| `bookDir(book)` | `'rtl'` or `'ltr'` | `'rtl'` only when `book.direction === 'rtl'` |
| `inferRtlBook(book, text)` | `{ direction: 'rtl'[, language: 'he'] }` or `null` | Only when `direction` is unset and the book isn't a script |
| `autoDir(before, inserted, currentDir)` | `'rtl'`, `'ltr'` or `''` | D4 |
| `paraDirAttr(dir, bookDir)` | the `dir` to store, or `null` | D2 |
| `bookFromFirstLetter(book, typed, texts)` | fields or `null` | The first RTL letter of a book with no letters |
| `dropParaDir(html, dir)` | HTML | The same string when nothing changes |
| `alignStyleFor(value, paraDir)` / `alignOf(style, paraDir)` | CSS value / menu value | D3 |
| `menuLeft(...)`, `beforeMiddle(...)`, `rowStep`, `opensBack` | positions | Placing menus, drops and cards in either direction |

`strongDir` alone must not decide a paragraph in a Hebrew book: "iPhone הוא טלפון" starts with an English letter but is a Hebrew paragraph (fixture `english-start`). D4 uses the first letter only when it is typed into an empty paragraph.

## Language

```
writingLanguage() = book.language || library.spellLanguage || NeoI18n.getLocale()
```

`writingLanguage()` (`app/typing-rules.js`) sets the quotation marks, read aloud's voice, the sentence segmenters of read aloud and focus mode, and the `lang` of the HTML, EPUB and PDF exports. `hebrewWriting()` is narrower and never looks at the interface: `book.language` if set, else an RTL book counts as Hebrew, else `library.spellLanguage`. It turns off automatic capitals and capitalization-slip suggestions.

Words printed in the book (Chapter 1, Contents, Prologue, the paperback's back matter) use `tBook()` (`app/core.js`), from the dictionary of `NeoI18n.headingLanguage()`: the book's language; else, in an RTL interface, the spellcheck language or English; else the interface language, as NEO always did. The dictionary comes through `window.neo.bookDict` (`i18n:dict` in `main.js`, which accepts only a file in `locales/`). `NeoI18n.translator()` fills values without isolates, because the words go into the page and files.

## The interface

**Isolates.** In an RTL interface `fill()` wraps each value it puts into a string in FSI…PDI (U+2068/2069); a value that looks like a path gets LRI…PDI. A value with RTL letters is isolated in any interface. Numbers formatted by `Intl` stay bare. An LTR interface's output is byte-identical. `NeoI18n.plain(s)` removes U+2066–2069, and every `t()` string that goes into a file or book data passes through it first (part labels, copyright lines, "Also by", review wording, "by {author}", the manuscript's word count and byline, Duplicate's "(copy)", twin chapters' "from other device", the email draft, the KDP cover template's lines). File names go through `safeName`, which drops format characters. When code saves or exports `t()` output with values, wrap it in `plain()`.

**Menus and dialogs.** Native menus and dialogs are drawn by the OS. In an RTL interface `rtlText()` in `main.js` puts an RLM before each line, `buildTemplate()` applies it to every label of the app menu and the right-click menu (`rtlTemplate`), and wrappers around `dialog.showMessageBox`, `showMessageBoxSync` and `showErrorBox` do the same for their text. Code that compares menu labels ignores the RLM (`menuTitle()`).

**CSS.** `styles.css` uses logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`). A physical property says in a comment why it is physical: the paperback's page geometry, the screenplay page, Paged.js's grid, the cover art, the soft-hyphen and bidi-mark ticks placed from the page rect. In RTL the chapters pane sits on the right and the side pane on the left. `‹ › ( ) [ ] « »` are mirrored by Unicode and must not be swapped by hand; `⇤` uses `.mirror-rtl` (`scaleX(-1)`) and `▸` becomes `◂`.

**Writer text in chrome.** Nav and notes rows go through `setIsolated` / `markedLabel` (`app/editor.js`), which use `<bdi>` only when the interface is RTL or the text has RTL letters (always using `<bdi>` moved English glyphs by sub-pixels). Shelf labels, pen names and similar fields have `dir="auto"`; an empty `dir="auto"` field inherits its surroundings' direction. Trim sizes, ISBN, email and phone fields are `dir="ltr"`.

**Where the direction commands show.** Format → Paragraph Direction, Book Direction, Insert Left-to-Right Mark, Insert Right-to-Left Mark and Insert Maqaf carry `feature: 'formatting'` in `buildMenu()` unless `rtlWriting` (the open book or the interface is RTL), in which case they always show. In the window, `dirItemsShown()` (`app/menu.js`) asks the same of the keys and the shortcuts window. RTL books, automatic direction and the Hebrew interface are never behind a feature.

## Typing

- **Direction keys.** On a Mac, ⌃⌘→ is right to left and ⌃⌘← left to right (menu accelerators; the arrow points to the side the line starts from). On Windows and Linux, Ctrl+Right Shift and Ctrl+Left Shift, read in the window on keyup by `directionKeyTracker`.
- **Quotation marks.** `QUOTE_STYLES` gives Hebrew `“…”` with `‘…’` inside. `hebrewBookQuotes` keeps a book's own complete pairs (`„…”`, `„…“`, `”…”`), looking first at the text being edited, then at the other chapters. The apostrophe after a Hebrew letter is not curled.
- **Geresh and gershayim.** A straight `"` between Hebrew letters becomes ״ and a straight `'` after a Hebrew letter becomes ׳. The mark is settled when the next letter arrives (`hebrewQuotePending`, `finishHebrewWordQuote`, the pure `hebrewWordMark`), and ⌘Z right after gives back the straight mark (`hebrewQuoteJustSet`). Paste is left alone, and scripts are excluded.
- **Maqaf, LRM, RLM.** Format → Insert Maqaf / Left-to-Right Mark / Right-to-Left Mark insert with `execCommand('insertText')` through the same menu path, as their own undo step. No accelerator: the Hebrew layout's own keys are kept.
- **Shortcuts on a Hebrew layout.** `e.key` is the layout's letter there. Upstream's `keyLetter(e)` covers the editor's shortcuts; `latinKey(e)` (`app/typing-rules.js`) covers the few places NEO compared `e.key` with z, y or s. Both return an ASCII `e.key` unchanged.
- **Find** folds Hebrew points and cantillation, the bidi marks, and ׳/״ to '/" (`foldForFind`, `app/find.js`), and maps each match back to the original span, so Replace is unchanged. The folding changes nothing for Latin text.
- **Word count** deletes bidi marks and embeddings before splitting (`countWords`, `app/core.js`); maqaf, niqqud and geresh/gershayim stay inside a word.
- **Pocket and IMEs.** `insertReplacementText` follows the same first-letter rule as `insertText`. Direction is never changed during composition: `dirCompositionAt` remembers the paragraph and caret when composition starts, and the committed text decides when it ends.

## Paste and import

**Paste** (`pasteHtmlInto`, `cleanPasteHtml`, `pasteDirOf` in `app/typing-rules.js`). `dropEmbeddings` removes U+202A–202E; LRM, RLM, ALM and isolates are the writer's and are kept. Several pasted paragraphs keep the direction their source gave (style, then `dir`, then ancestors), else their first strong letter. A single block pastes inline and takes its paragraph's direction; if that paragraph had no letters, the first-letter rule decides exactly as for typing. The direction travels through `cleanPasteHtml` as private-use marks (U+E003/E004) next to its U+E000 break.

**Import** (`importFile` in `main.js`, the window's import section). A paragraph's direction comes from the file (`<div dir>` in Markdown, `w:bidi` in Word), else its first strong letter. The new book takes `inferRtlBook`, so an English import writes nothing new. Markdown `<div>` tags become private-use marker paragraphs (U+E100) that are dropped once they have set the direction. Word import reads `word/footnotes.xml`: each note becomes a NEO footnote, with `data-note-dir` only where its direction differs. An RTL run takes bold and italic from `w:bCs`/`w:iCs`, else `w:b`/`w:i`. Hebrew chapter words (`CHAPTER_WORDS`): פרק and חלק need a number, ordinal or letter numeral after them; הקדמה (prologue), מבוא and אחרית דבר (epilogue) count only as a whole line.

## Fonts

`bodyFontStack()` (`app/menu.js`) puts a Hebrew-only family before each built-in stack: `NEO Hebrew Serif` (Frank Ruhl Libre) or `NEO Hebrew Sans` (Noto Sans Hebrew), limited by `unicode-range` to Hebrew. Latin letters keep their own face and metrics, and a local font chosen with Other Font… stays first. Drop-cap and display stacks add Bellefair, Karantina, Secular One or Suez One. The files and their licenses are listed in [HEBREW-FONTS.md](HEBREW-FONTS.md). Hebrew italic is the browser's slant of the upright face (D8); Hebrew in a Korean interface keeps it.

Exports embed fonts through `embedFontFaces()` (`app/print.js`). `exportFontFaces()` picks faces across the whole stack and includes the Hebrew companions only when the book has Hebrew in it (`exportHasHebrew`), so an English export doesn't name them. A face of the computer's own (`NEO Hebrew Mono`, which is local Courier New) travels as its `@font-face` rule. Word gets the writer's Latin font name (`firstFamily()` skips the companions) and Times New Roman as the complex-script font.

## Exports

Every export carries the book's direction on its root and only the stored exceptions on paragraphs. No export computes a direction per paragraph, and an English book's file is byte-identical to NEO's own main (the RTL tests compare against it, see Tests).

- **Word** (`docxP`, `docxJc`, `app/print.js`). An RTL book puts `w:bidi` in the Normal style and the section, so only exceptions carry their own (`w:val="0"` for LTR). Runs are cut by script only in an RTL book or a paragraph with RTL letters; RTL runs get `w:rtl` and `w:bCs`/`w:iCs`, and neutral characters join the letter before them. Indents are `w:start`/`w:end` in an RTL paragraph. Alignment at the start writes nothing, at the end `w:jc="left"`.
- **EPUB.** `page-progression-direction="rtl"` in the spine, `dir` and `lang` on every page, and `EPUB_RTL_CSS` after the LTR stylesheet, writing the physical side and then `start` for older readers.
- **HTML and PDF.** `dir` and `lang` on the root, `dir` on exceptions, and `htmlRtlCss()` for what turns over (contents numbers, deeper entries, poetry and notes start, no letter-spacing on Hebrew headings, the drop cap's gap).
- **Markdown** has no direction, so an exception goes in a `<div dir>`, which GitHub, Obsidian and Typora honour and NEO's import reads back. Plain text stays plain.
- **Paperback for KDP** (`buildPrintHtml`, `makePaperback`). In an RTL book recto is the physical left: page 1 is a left-hand page, chapters open on left-hand pages, and the cover template puts the front left of the spine. The marked `NEO:` patches in `print/paged.polyfill.js` swap Paged.js's page classes and break matching (listed in `print/README.md`). Paged.js's grid and overflow detector misread RTL columns, so the page box and column container stay LTR and the inner text, margin content and footnotes are RTL. A Hebrew book gets no hyphenation, and Hebrew words in Latin prose are left whole. Running heads swap sides.
- **Manuscript format** (`manuscript.js`, `app/export.js`). The header sits at the top left and the title page's blocks mirror; contact lines that are Latin (email, phone) stay LTR inside the right-hand block. Word gets Normal-style bidi, both sections, Cs fonts and script-split runs; poetry uses start/end indents. The PDF gets the Hebrew serif in Times and `NEO Hebrew Mono` in Courier.
- **Screenplays.** A Hebrew script is the English page mirrored (`#paper.script[dir="rtl"]`). `NEO Hebrew Mono` is Courier New's Hebrew by `local()`, at Courier Prime's 0.6em pitch, so line counts hold. Hebrew has no capitals, so in a caseless script (`spCaseless`) a short line naming someone in the cast is a cue, and Fountain's `@`, `.` and `>` force character, heading and transition (`spForced`). (CONT'D) is (המשך). Final Draft has no direction field; import infers a script's direction by majority.

## Pocket

Pocket runs the same `app/` files. Its edge gestures and bars follow `<html dir>`, the interface's direction, not the book's: the chapter swipe starts at the interface's start edge (the right in Hebrew). `pocket.css` uses logical properties. `scripts/pocket-www.js` copies `bidi.js`, the Hebrew fonts and `locales/he.json`, and both phones list `he` among their languages (`locales_config.xml`, `Info.plist`). Pocket has no Paragraph Direction row; paragraph exceptions synced from the desktop are kept.

## Tests

`npm test` runs the unit tests: `scripts/rtl*.test.js`, `hebrew-*.test.js`, `i18n-rtl.test.js`, `latin-key.test.js`, `ui-placement.test.js`. They read the window through `appSource()` and cut out the functions they need. `scripts/rtl-baseline.js` pins NEO's main at the last merge (`UPSTREAM`): the export, Word, paperback and manuscript tests build the same English book with main's builders and require the same bytes. Move `UPSTREAM` forward after each merge from main.

End-to-end tests run in Electron: `npm run test:rtl`, `test:rtl-typing`, `test:hebrew-ui`, `test:shots` (`mirror-shots.e2e.js`, 35 views compared pixel by pixel; capture the baseline and the candidate back to back, since hover and focus state follow the OS window), and `scripts/rtl-print.e2e.js`, `rtl-caret.e2e.js`, `rtl-outline.e2e.js`, `hebrew-fonts.e2e.js`, `hebrew-typing.e2e.js`, `pocket-rtl.e2e.js` with `npx electron`. Hand-made Hebrew fixtures are in `scripts/fixtures/hebrew/`.
