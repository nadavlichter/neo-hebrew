# Print (Paperback for KDP)

Files the paperback export uses in its print window. Copied from npm.

- `paged.polyfill.js`: Paged.js 0.4.3 (MIT, see `LICENSE-pagedjs.txt`), which lays the book out in pages
  (facing pages, running heads, chapters on a right-hand page, widows and orphans). Every change is marked
  `NEO:` in the file. There are five:
  - `textBreak`: a word split across a page turn breaks at its soft hyphen, not a letter later (the letter
    after a soft hyphen can still measure on the line above).
  - `Page.index`: in a right-to-left book the page classes are reversed, so recto (odd pages) is the
    physical left page and verso the right.
  - `Chunker.setup`: `settings.neoRtl` is read once, from the root element's `direction`, never from the
    text's own runs or content.
  - `Chunker.handleBreaks`: a `break-before: left`/`right` is physical, so in a right-to-left book the
    page position it is matched against is swapped; `recto`/`verso` keep their odd/even meaning.
  - `Chunker.clonePage`: a page cloned for overflow gets the same settings, so it keeps the same progression.
- `hyphen/hyphen.js`: hyphen 1.14.1 (ISC, see `hyphen/LICENSE-hyphen`), Liang's hyphenation algorithm.
- `hyphen/patterns/*.js`: the TeX hyphenation patterns (hyph-utf8, ctan.org) as packaged by hyphen 1.14.1,
  for the languages NEO spellchecks. Each set keeps its own free licence (MIT, LPPL, or a TeX-style
  permission to copy); they are distributed unchanged.

Hyphenation is done here, with soft hyphens, rather than by the browser engine: Chromium on Windows and
Linux ships without hyphenation dictionaries, so `hyphens: auto` would hyphenate on a Mac only.

## Right-to-left pagination

The last four patches above are the right-to-left ones. No content-based direction inference is involved, and the English path keeps the original page classes and breaks. NEO's own CSS keeps Paged.js's page box and column container left to right and puts the right-to-left back on the inner text, margin content and footnotes, because the furniture grid reverses its physical columns under inherited RTL and its overflow detector misses columns that extend to the left. The real-engine checks are in `scripts/rtl-print.e2e.js`; `scripts/rtl-print.test.js` covers the rest.

Hyphenation is not applied to a Hebrew book (no patterns are loaded for it).
