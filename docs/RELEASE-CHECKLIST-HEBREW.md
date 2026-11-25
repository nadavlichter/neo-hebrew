# Hebrew release checklist

NEO's Hebrew and right-to-left support is built and tested on a Mac. These checks need real programs, real devices or a Hebrew reader, so they can't be done in code. Work down the list and write what you saw next to each line. Anything that looks wrong goes back to the developer with a screenshot.

Use a short Hebrew test book with:
- a title and author in Hebrew;
- two chapters, one paragraph of English inside a Hebrew chapter;
- a footnote, some bold and italic, a word with niqqud, and a number like 10–20.

## Print (Amazon KDP)

1. **Previewer:** Export → Paperback for KDP. Upload the interior PDF and the cover template PDF to KDP with "right to left" reading chosen. Does the Previewer accept both?
2. **Page order:** in the Previewer, does page 1 sit on the left-hand page, does each chapter start on a left-hand page, and are the page numbers at the outside corners?
3. **Printed proof:** order one. Check the binding is on the right, the wider margin is next to the binding, and the spine text reads the way Hebrew books on your shelf do.
4. **Barcode:** check where KDP puts it on the back cover. NEO leaves room for it next to the spine.

## Word processors

5. **Word export:** File → Export → Word, opened in Microsoft Word, LibreOffice, Google Docs and Pages. Is the Hebrew right-aligned, the English paragraph left to right, the bold and italic kept, and the footnote there?
6. **Manuscript Format, Word:** export it and check the header at the top left, the word count, the contact block, and that chapter pages start a third of the way down.
7. **Word import:** a Hebrew `.docx` made in Word, and one made in Google Docs, dropped on a shelf. Do they open right to left, with chapters, emphasis and footnotes?

## Ebooks and scripts

8. **EPUB:** open the exported file in Apple Books and one other reader. Do pages turn right to left, and does the contents work? If you can, run it through an EPUB checker (EPUBCheck).
9. **Final Draft:** open a Hebrew script exported as `.fdx`. Final Draft doesn't officially support right to left, so note what it shows. Importing a Hebrew `.fdx` from a screenwriter is the more useful test.
10. **Script PDF:** export a Hebrew screenplay as a PDF and have a Hebrew screenwriter read the terms (פנים./חוץ., יום/לילה, קאט ל:, (המשך)).

## Phones (Pocket)

11. **Keyboard:** on an iPhone and an Android phone, type Hebrew with the system keyboard, including predictions and autocorrect. Does each paragraph keep its direction, and do selection handles behave?
12. **PDFs on the phone:** export a PDF from the phone (Android's print screen, iOS's share sheet). Is it right to left, in a Hebrew font?
13. **Screenplays on the phone:** check a Hebrew screenplay's typeface. Courier New may be missing on Android and Linux.

## A Hebrew reader

14. **Interface:** go through NEO's menus and dialogs in Hebrew and mark any wording that sounds wrong or foreign (`locales/he.json`).
15. **Fonts:** look at the fonts, italic, drop caps and quotation marks (“…”) in a printed proof.
16. **Credit:** the reviewer is credited in `_meta.translators`.

## Decisions waiting on Hugh

17. **Options:** with an English book and interface, do the direction items and the mark/maqaf items show only while Alignment and other fonts is on (design decision D6)?
18. **Spellcheck:** Hebrew spellcheck is not included, because the only Hebrew dictionary's license (AGPL) doesn't fit NEO's (MIT). Decide whether to look for another.
