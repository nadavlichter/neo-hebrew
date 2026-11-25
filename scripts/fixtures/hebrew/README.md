# Hebrew / RTL fixtures

Made by hand, without Word or Google Docs. See docs/ARCHITECTURE.md and docs/DECISIONS.md.

| File | What it is | Used by |
|---|---|---|
| `mixed-cases.json` | Mixed Hebrew and English cases: `{ id, text, paragraphDir, note }`. `paragraphDir` is the direction the paragraph should have. `firstStrongDiffers: true` marks a case whose first strong letter points the other way (English at the start of a Hebrew paragraph). | `scripts/rtl.test.js`, the paragraph-direction tests and the typing e2e |
| `book-chapter.html` | One chapter as NEO saves it: `<p>` paragraphs, `p.scene-break`, italic and bold. Only the English paragraph carries `dir="ltr"` (D2: only exceptions carry `dir`). | Opening and saving without a rewrite (D2), export tests (EPUB, PDF, .docx) |
| `plain.txt`, `plain.md` | The same text with Hebrew chapter headings (פרק 1, פרק שני) and, in the Markdown, `#` headings and emphasis. | Import: chapter detection (`CHAPTER_WORDS`), direction of an imported book |

## Still needed

These must come from the real programs; they are not faked here.

- A `.docx` saved by Microsoft Word (Mac and Windows) with RTL paragraphs, Hebrew bold and italic in `w:bCs` / `w:iCs`, and one LTR English paragraph.
- The same document exported from Google Docs.
- Clipboard HTML captured from Word, Google Docs and Pages when copying Hebrew text.
- A Hebrew `.fdx` saved by Final Draft, and a Hebrew `.fountain`.
