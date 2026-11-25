# Decisions: Hebrew and right-to-left writing

The design decisions behind NEO's Hebrew and right-to-left support, the smaller choices made while building it and why, and what is still unverified. How it works is in [ARCHITECTURE.md](ARCHITECTURE.md). When a decision changes, add the new one and say which it replaces.

## Design decisions

**D1. A book has a writing language and a direction, stored in `book.json`.** `"language": "he"` and `"direction": "rtl"`. Absent means left to right, so every existing book is untouched. The library-wide spellcheck language can't be the source of truth for a book: Hebrew has no spellcheck dictionary NEO can ship. `writingLanguage()` is `book.language || library.spellLanguage || locale`.

**D2. A paragraph's direction is stored only where it differs from the book's.** The page carries the book's direction on its containers, so it isn't in the file. Writing `dir` onto every paragraph would rewrite every chapter of every book on first open and fight iCloud and Syncthing ("Do not rewrite a chapter that has not changed"). `dir` is meaning, not decoration: it changes how the words read in any HTML viewer, so unlike search highlights it belongs in the file.

**D3. Alignment is logical where it has to be.** In an RTL paragraph, Align Right is the start and saves nothing; Align Left saves `text-align: left`. LTR paragraphs behave exactly as before, so English files are byte-identical. `start`/`end` in a file are read in the paragraph's direction, existing `left`/`right` keep their physical meaning, and nothing is migrated. In an RTL book the submenu lists Right first, as Hebrew Word does.

**D4. Automatic direction.** The first strong letter typed into an empty paragraph decides its direction; digits and punctuation don't. A paragraph with a letter before the caret is never flipped by typing. An RTL paragraph that begins with an English word stays RTL ("iPhone הוא הטלפון הכי טוב כרגע."); a whole English paragraph inside a Hebrew book is an explicit Paragraph Direction choice. Chapters and notes share the rule.

**D5. Caret movement follows the platform.** NEO keeps Chromium's native caret and builds no visual/logical preference of its own. Chromium maps ←/→ by the paragraph's direction, so inside an opposite-direction run the arrows move logically. Vim's h/l ask for native left/right; w, b, e, 0 and $ stay logical.

**D6. What shows by default.** RTL books, automatic paragraph direction and the Hebrew interface are not features: they are what a Hebrew writer needs to write at all, so they are always on. The explicit commands (Paragraph Direction, Book Direction, Insert LRM/RLM, Insert Maqaf) sit behind Options → Alignment and other fonts, except when the open book or the interface is RTL, when they always show.

**D7. Hebrew quotation marks** are `“…”` with `‘…’` inside. A book that already holds another complete pair (`„…”`, `„…“`, `”…”`) keeps it. Nothing is normalised. Geresh and gershayim inside words are separate from quotation.

**D8. Italic works in Hebrew, as in Word and Google Docs.** `<i>` is slanted in a Hebrew book on the page, in notes and cards, and in every export; Word stores it as `w:iCs`. Few Hebrew fonts have a drawn italic, so the slant is usually synthesized. Hebrew is not treated like Korean, which NEO keeps upright (`font-synthesis-style: none` under `html:lang(ko)`).

## Implementation choices

### Direction helpers are a shared UMD module, `bidi.js`
The window, the main process (import) and Pocket need the same rules. NEO already shares code this way (`i18n.js`, `manuscript.js`). Copying the helpers into the window and `main.js` would let them drift; putting them in `i18n.js` would mix two concerns.

### Only letters are strong
`charDir` treats only `\p{L}` as strong. Niqqud and cantillation, maqaf, geresh, gershayim, digits and the marks are neutral, so a pointed word takes its direction from its letters, and a line that starts with a number or a quote takes it from the first word. This is simpler than the full bidi classes and gives the same answer for every fixture case. LRM/RLM/ALM before any letter, and isolates, are handled as rule P2 says.

### The page's direction is set on a few outer containers
`<html dir="rtl">` is inherited by everything, so an English book would turn right to left in the Hebrew interface. `dir` on each `.chapter-body` was rejected: the bodies are rebuilt often, the title page, notes, outline and darlings sit outside them, and an outer container can never end up in a saved chapter.

### Isolates go in `fill()` and come out at file boundaries
Wrapping values centrally fixes every interface sentence at once; wrapping at each call site would touch hundreds of `t()` calls. The cost is that text leaving the screen goes through `NeoI18n.plain()`. Stripping in `export:save` globally was rejected because it would also strip the writer's own bidi characters from the manuscript.

### RLM on menu and dialog text, in one place
The OS lays out a label that starts with a Latin word ("EPUB (.epub)") or a number left to right. One `buildTemplate()` and one wrapper around the dialog functions cover every label without touching `buildMenu()`'s items, and an LTR interface gets its text back untouched.

### Chromium's `--lang` switch is not set
It makes `app.getLocale()` and default-locale dates Hebrew, but NEO draws its own right-click menu and formats numbers and dates with explicit locales, the switch only applies after a restart (leaving `app.getLocale()` stale), and `initLanguage` would feed it back into itself. Revisit if a native Chromium string shows in English.

### Logical CSS, proved by pixel comparison
`styles.css` was converted in one pass after `scripts/mirror-shots.e2e.js` was written to prove English didn't move: a fixed library, a frozen clock, animations off, 35 views compared pixel by pixel. Logical properties give the same pixels in LTR, so any difference is a bug.

### Isolates in chrome only where they're needed
`<bdi>` around writer text in chrome only when the interface is RTL or the text has RTL letters. Always wrapping moved English glyphs by sub-pixels and broke the pixel-identical check.

### A new book takes a language and direction only in an RTL interface
Setting `book.language` on every new book would stop English, French or Romanian books from following `library.spellLanguage`, changing their quotation marks and headings. A writer with an English interface gets a Hebrew book by typing Hebrew first, or with Format → Book Direction.

### `direction` is inferred once on open, never as `ltr`
This covers a rebuilt `book.json` without new reads in the main process (which iCloud placeholders make dangerous). It runs on the text already in memory, saves `book.json` once, never overrides a value, never touches a script, and writes no chapter. A book written since directions existed already marks its Hebrew paragraphs `dir="rtl"`, so inference runs only when no paragraph does; otherwise it would turn that book's English paragraphs right to left.

### `dir` is normalised in `captureBody`, and only there
A file written elsewhere with a redundant `dir` keeps it until the chapter is next edited. Normalising on open would rewrite unchanged chapters.

### Deleting a paragraph's words keeps its `dir`
Clearing `dir` when a paragraph is emptied made ⌘Z of the deletion bring the words back in the book's direction, since the engine's undo doesn't restore attributes. The first-letter rule already decides whenever no letter is before the caret, so `dir` is cleared only when an undo empties the paragraph.

### Paragraph Direction undoes like Align, Book Direction like a structural change
Paragraph Direction is an attribute edit and `syncChapter`, like Align Paragraph. Book Direction rewrites many chapters, so it takes `snapshotStructure` first, and `structuralUndo` puts `book.direction`/`language` back only for that action.

### An RTL book's drop cap is off unless the writer chose one
The bundled drop-cap faces have no Hebrew letters, and the setting is library-wide. Rather than a new book field, `dropCapStyle()` answers `none` for an RTL book unless `library.fonts.dropcapChosen` is set, which choosing a style records. The exports and Pocket's sheet ask the same function.

### Chapter words follow the book's language
A Hebrew book in an English interface says "פרק 1" and an English book in a Hebrew interface says "Chapter 1", while every existing book in an LTR interface is unchanged. A Hebrew book's heading and byline drop the spaced capitals' tracking (`#paper[lang|="he"]`), keyed on the attribute so an English book in a Hebrew interface keeps it.

### Find folds Hebrew in every book
Points, cantillation, the bidi marks, and ׳/״ against '/". It changes nothing for Latin text. Curly and straight quotes are not folded together, because "don't" would newly match "don’t" in English books.

### Bidi marks are removed, not spaced, before counting
Turning them into spaces would split a word with an LRM inside it.

### Typed word marks stay separate from quotation
A straight quote after a Hebrew letter can still close a quotation, so NEO remembers the key and converts it only when the next Hebrew letter shows it was an abbreviation or word mark. A word-final apostrophe becomes a geresh unless it closes an open single quotation. Paste and curly marks typed directly are left alone.

### Insert Maqaf, LRM and RLM have no accelerator
NEO has no Insert menu, so they sit in Format beside the direction commands. A new global shortcut would take a key from the Hebrew keyboard layout.

### Capitals follow Hebrew writing, not the letters' shape
Hebrew letters have no case, but English brands inside a Hebrew book ("iPhone") would be capitalised by the Latin rules. Automatic capitals and capitalization-slip suggestions are off for Hebrew writing, which is the book's language and never the interface's.

### Paste drops embeddings and overrides, keeps marks and isolates
U+202A–202E come from other programs' bidi handling and change how the text reads in NEO; LRM, RLM, ALM and isolates are the writer's own.

### Exports carry only the stored exceptions
No export computes a direction per paragraph. A format that can say it uses `dir` on the root and on exceptions. Markdown can't, so an exception goes in `<div dir>`, which NEO's import reads back. Plain text stays plain: NEO never inserts LRM/RLM.

### The EPUB stylesheet writes the physical side, then `start`
Older readers (Kindle, Apple Books) don't all know logical properties. The RTL rules come after the LTR stylesheet, which stays byte-identical, and apply only to an RTL book.

### Word: exceptions only, runs cut by script only where Hebrew is
So an English document is byte-identical. The complex-script font is Times New Roman, because NEO's Hebrew faces aren't installed fonts.

### The paperback patches Paged.js rather than relabelling NEO's pages
Physical `:left`/`:right` stay physical, so the outside page numbers and gutter rules hold in either binding. Paged.js is told the root direction, swaps page classes and break matching, and passes it to cloned pages; recto and verso stay odd and even. Only an RTL book's CSS asks for recto/verso breaks. KDP's Hebrew help places the RTL front cover left of the spine and the back right, so the cover template and barcode area mirror with the same dimensions.

### Hebrew scripts: the page mirrored, Courier New's Hebrew at Courier Prime's pitch
An RTL script gets `#paper.script[dir="rtl"]` overrides, so no English rule changes. Line counts need every glyph to be 0.6em wide; Courier Prime has no Hebrew, and Courier New (macOS, Windows) has Hebrew at 600/1000, so nothing new is bundled.

### Fonts: separate Hebrew-only families before the built-in stacks
Rather than giving installed fonts Hebrew under the same name: this keeps the system's Latin faces as they were and lets Hebrew be slanted beside Latin italic faces. Frank Ruhl Libre (serif) and Noto Sans Hebrew (sans) are the body faces.

### Word footnotes are imported
`word/footnotes.xml` becomes NEO footnotes, with `data-note-dir` only where a note's direction differs. This changes English imports too: notes that used to be dropped now arrive.

## Deliberately not built

- **Deriving direction in `rebuildBookMeta`.** It would need new reads of chapter files in the main process, which AGENTS.md forbids because of iCloud placeholders. Inference on open covers it.
- **Hand-made Word, Google Docs, Pages or Final Draft fixtures.** A fabricated `.docx` tests what we think Word writes. They must come from the real programs (`scripts/fixtures/hebrew/README.md` lists them).
- **A Hebrew spellcheck dictionary.** The only Hunspell Hebrew dictionary is built from Hspell, which is AGPL-3.0; NEO is MIT.

## Unverified and open

These need real programs, devices or a Hebrew reader. [RELEASE-CHECKLIST-HEBREW.md](RELEASE-CHECKLIST-HEBREW.md) turns them into steps.

- The Hebrew interface is a machine translation (`_meta.translators` says so). A native review is needed; [he-glossary.md](he-glossary.md) lists the terms and uncertain strings.
- Word: `w:jc` in a bidi paragraph, the manuscript title page's mirrored tab stop and the inherited bidi alignment need checking in real Word and LibreOffice.
- KDP: the Previewer with a right-to-left interior and cover; the rotation of the Hebrew spine label.
- EPUB in Apple Books and Kindle; native Pocket on Android and iOS, including Gboard and iOS keyboards' composition; Windows and Linux font fallback (no Courier New on Linux or Android, so Hebrew script lines fall back to another monospace).
- Hover hot zones, drag-and-drop on the shelf, the pen rack and `scrollbarUnder` haven't been tried with a real pointer in Hebrew.
- Writer text not yet isolated in chrome: book titles in cover text, `.pt-label`, loose card text.
- A shelf export of a book that isn't open still uses the interface's chapter words.
- Hebrew screenplay terms are provisional.
- The audit of where isolates leave the screen wasn't exhaustive.
