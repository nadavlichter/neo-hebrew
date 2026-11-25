'use strict';

// Reading a manuscript in: Word files, plain text and Markdown. The real
// main.js runs in a sandbox the way power-loss.test.js loads it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { describe, test } = require('node:test');

const root = path.join(__dirname, '..');
const localRequire = createRequire(path.join(root, 'main.js'));
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const JSZip = localRequire('jszip');

const handlers = new Map();
const electron = {
  app: { commandLine: { appendSwitch() {} }, getPath: () => os.tmpdir(), getLocale: () => 'en', requestSingleInstanceLock: () => true, whenReady: () => ({ then() {} }), on() {} },
  ipcMain: { on() {}, handle: (name, fn) => handlers.set(name, fn) },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  Menu: { buildFromTemplate: (items) => items, setApplicationMenu() {} },
  dialog: { showMessageBox: () => Promise.resolve({}) },
  utilityProcess: { fork: () => ({ on() {}, postMessage() {} }) },
  screen: {}
};
vm.runInContext(source, vm.createContext({
  require: (name) => name === 'electron' ? electron : localRequire(name),
  __dirname: root, process: { platform: process.platform, on() {} }, console
}), { filename: path.join(root, 'main.js') });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-import-'));
async function importOne(name, data) {
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, data);
  const [r] = await handlers.get('import:files')(null, [fp]);
  return r;
}
const texts = (r) => JSON.parse(JSON.stringify(r.chapters.map((ch) => ch.paras.map((p) => p.text || (p.scene ? '***' : '')))));

async function docx(paragraphs, styles = '', notes = '') {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${paragraphs.join('')}</w:body></w:document>`);
  if (notes) zip.file('word/footnotes.xml', notes);
  if (styles) zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles xmlns:w="w">${styles}</w:styles>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('import', () => {
  test('a one-line-per-paragraph .txt keeps its paragraphs and finds its chapters', async () => {
    const r = await importOne('lines.txt', 'Chapter 1\r\nIt was late.\r\nShe left.\r\nChapter 2\r\nMorning came.\r\nThe end.\r\n');
    assert.deepEqual(texts(r), [['It was late.', 'She left.'], ['Morning came.', 'The end.']]);
  });

  test('a Windows-1252 .txt reads its curly quotes and accents', async () => {
    const r = await importOne('cp1252.txt', Buffer.from([0x93, 0x48, 0x69, 0x94, 0x20, 0x97, 0x20, 0x63, 0x61, 0x66, 0xE9]));
    assert.equal(r.chapters[0].paras[0].text, '“Hi” — café');
  });

  test('a UTF-16 .txt reads', async () => {
    const r = await importOne('u16.txt', Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('Hello there.', 'utf16le')]));
    assert.equal(r.chapters[0].paras[0].text, 'Hello there.');
  });

  test('Word: soft returns, tabs and no-break hyphens survive; empty bold runs leave no stray markers', async () => {
    const r = await importOne('w.docx', await docx([
      '<w:p><w:r><w:t>Roses are red,</w:t><w:br/><w:t>violets blue.</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>well</w:t><w:noBreakHyphen/><w:t>known</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:tab/></w:r><w:r><w:t>end</w:t></w:r></w:p>'
    ]));
    assert.deepEqual(texts(r)[0], ['Roses are red,', 'violets blue.', 'well‑known end']);
  });

  test('a hard-wrapped .txt (blank line between paragraphs) keeps whole paragraphs', async () => {
    const para = (n) => Array.from({ length: n }, (_, i) => 'This is wrapped line number ' + i + ' of a long paragraph and').join('\n') + ' it ends.';
    const r = await importOne('wrapped.txt', ['Chapter 1', '', para(5), '', para(6), '', para(5), '', para(7), ''].join('\n'));
    assert.equal(r.chapters[0].paras.length, 4);
  });

  test('Word: an italic poem with line breaks stays italic on every line', async () => {
    const r = await importOne('poem.docx', await docx([
      '<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Roses are red,</w:t><w:br/><w:t>violets are blue</w:t></w:r></w:p>'
    ]));
    assert.deepEqual(texts(r)[0], ['*Roses are red,*', '*violets are blue*']);
  });

  test('Word: literal asterisks and underscores travel escaped; numeric entities decode; &amp;lt; stays text', async () => {
    const r = await importOne('lit.docx', await docx([
      '<w:p><w:r><w:t xml:space="preserve">5 * 3 and file_name and &#8220;q&#8221; and &amp;lt;</w:t></w:r></w:p>'
    ]));
    assert.equal(r.chapters[0].paras[0].text, '5 \\* 3 and file\\_name and “q” and &lt;');
  });

  test('Word: a bold "Chapter 2" line is a chapter heading', async () => {
    const r = await importOne('bold.docx', await docx([
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Chapter 1</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>It began.</w:t></w:r></w:p>',
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Chapter 2</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>It ended.</w:t></w:r></w:p>'
    ]));
    assert.deepEqual(texts(r), [['It began.'], ['It ended.']]);
  });

  test('Korean headings: 제N장, 프롤로그 and a bare 3장 line start chapters; a sentence that opens with 3장 stays prose', async () => {
    const r = await importOne('ko.txt', ['프롤로그', '비가 왔다.', '제1장', '그는 떠났다.', '3장', '3장 남았다.', '에필로그', '끝났다.', ''].join('\n'));
    assert.deepEqual(texts(r), [['비가 왔다.'], ['그는 떠났다.'], ['3장 남았다.'], ['끝났다.']]);
    assert.deepEqual(JSON.parse(JSON.stringify(r.chapters.map((c) => c.role || null))), ['prologue', null, null, 'epilogue']);
  });

  test('Word in another language: a localized heading style still starts a chapter', async () => {
    const r = await importOne('de.docx', await docx([
      '<w:p><w:pPr><w:pStyle w:val="berschrift1"/></w:pPr><w:r><w:t>Der Anfang</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Eins.</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="berschrift1"/></w:pPr><w:r><w:t>Das Ende</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Zwei.</w:t></w:r></w:p>'
    ], '<w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/></w:style>'));
    assert.deepEqual(JSON.parse(JSON.stringify(r.chapters.map((c) => c.title))), ['Der Anfang', 'Das Ende']);
  });
  test('Hebrew headings: פרק and חלק with a number, an ordinal or a letter numeral start chapters; the same words in a sentence stay prose', async () => {
    const lines = ['פרק 3', 'ירד גשם.', 'פרק שני', 'הוא עזב.', 'פרק א׳', 'ואז חזר.', 'פרק י״א', 'סוף.', 'פרק יא', 'עוד.', 'חלק ראשון', 'התחלה.', 'חלק מהם נשארו בבית', 'פרק חדש נפתח בחייו.', 'פרק אבל', 'פרק כה ארוך', 'חלק מה שאמרו', 'שוב.', ''];
    const r = await importOne('he-words.txt', lines.join('\n'));
    assert.deepEqual(texts(r), [['ירד גשם.'], ['הוא עזב.'], ['ואז חזר.'], ['סוף.'], ['עוד.'], ['התחלה.', 'חלק מהם נשארו בבית', 'פרק חדש נפתח בחייו.', 'פרק אבל', 'פרק כה ארוך', 'חלק מה שאמרו', 'שוב.']]);
  });

  test('Hebrew headings: ordinals, feminine forms and a long numeral; ASCII quotes stand in for gershayim', async () => {
    const heads = ['פרק ראשון', 'פרק שנייה', 'פרק עשירי', 'פרק ט"ו', 'פרק ט׳', "פרק י'", 'פרק קכ״ג', 'חלק 12', 'חלק שלישית'];
    const r = await importOne('he-ords.txt', heads.map((h, i) => h + '\nטקסט ' + (i + 1) + '.').join('\n') + '\n');
    assert.equal(r.chapters.length, heads.length);
    assert.ok(r.chapters.every((c) => c.title === ''), 'numbering is NEO\'s own: no title');
  });

  test('Hebrew prologue and epilogue give the first and last chapter their role; preface, introduction and afterword start chapters on their own line', async () => {
    const r = await importOne('he-roles.txt', ['פרולוג', 'לפני הכול.', 'פרק 1', 'באמצע.', 'אפילוג', 'אחרי הכול.', ''].join('\n'));
    assert.deepEqual(JSON.parse(JSON.stringify(r.chapters.map((c) => c.role || null))), ['prologue', null, 'epilogue']);
    const r2 = await importOne('he-front.txt', ['הקדמה', 'מילים ראשונות.', 'מבוא', 'עוד מילים.', 'פרק 1', 'הסיפור.', 'אחרית דבר:', 'מילים אחרונות.', ''].join('\n'));
    assert.deepEqual(texts(r2), [['מילים ראשונות.'], ['עוד מילים.'], ['הסיפור.'], ['מילים אחרונות.']]);
    // as ordinary words in a line they are prose
    const r3 = await importOne('he-prose.txt', ['מבוא לפילוסופיה הוא ספר נחמד', 'הקדמה קצרה לא תזיק לאף אחד.', 'עוד שורה.', 'ועוד אחת.', ''].join('\n'));
    assert.equal(r3.chapters.length, 1);
  });

  test('Hebrew bare letter numerals as a ladder are chapter markers; a lone one is text', async () => {
    const r = await importOne('he-ladder.txt', ['א׳', 'ראשון.', 'ב׳', 'שני.', 'י״א', 'אחד עשר.', ''].join('\n'));
    assert.deepEqual(texts(r), [['ראשון.'], ['שני.'], ['אחד עשר.']]);
    const one = await importOne('he-lone.txt', ['א׳', 'ראשון.', 'ועוד שורה.', 'ושורה.', 'ועוד.', ''].join('\n'));
    assert.equal(one.chapters.length, 1);
    assert.equal(one.chapters[0].paras[0].text, 'א׳');
    // "יא" with no mark is a word, not a number
    const word = await importOne('he-word.txt', ['יא', 'ראשון.', 'יא', 'שני.', ''].join('\n'));
    assert.equal(word.chapters.length, 1);
  });

  test('the Hebrew fixtures (.txt and .md): פרק 1 and פרק שני start two chapters', async () => {
    for (const f of ['plain.txt', 'plain.md']) {
      const r = await importOne(f, fs.readFileSync(path.join(root, 'scripts', 'fixtures', 'hebrew', f)));
      assert.equal(r.chapters.length, 2, f);
      assert.deepEqual(JSON.parse(JSON.stringify(r.chapters.map((c) => c.title))), ['', ''], f);
    }
  });
});

// Referenced notes use the same inert native marker as notes written in NEO.
const noteXml = (body) => `<w:footnotes xmlns:w="w">${body}</w:footnotes>`;
const reference = '<w:footnoteReference w:id="7"/>';
test('Word footnotes: inline order, escaped note text and explicit note direction survive import', async () => {
  const note = '<w:footnote w:id="7"><w:p><w:pPr><w:bidi/></w:pPr><w:r><w:t>שלום &amp; &quot;עולם&quot; &lt;img src=x&gt;</w:t></w:r></w:p></w:footnote>';
  const r = await importOne('notes.docx', await docx([`<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Before </w:t>${reference}<w:t> after.</w:t></w:r></w:p>`], '', noteXml(note)));
  const p = r.chapters[0].paras[0];
  assert.match(p.html, /<b>Before <\/b><span class="fn"/);
  assert.match(p.html, /data-note-dir="rtl"/);
  assert.match(p.html, /data-note="שלום &amp; &quot;עולם&quot; &lt;img src=x&gt;"/);
  assert.ok(!p.html.includes('<img'));
  assert.ok(!p.text.includes('שלום'), 'notes do not enter manuscript counts');
});

test('Word footnotes: a note-only paragraph, multiple note paragraphs and separators keep all real words', async () => {
  const notes = noteXml('<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:t>NOT A NOTE</w:t></w:r></w:p></w:footnote><w:footnote w:id="7"><w:p><w:pPr><w:bidi w:val="0"/></w:pPr><w:r><w:t>First *literal*.</w:t></w:r></w:p><w:p><w:r><w:t>Second.</w:t></w:r></w:p></w:footnote>');
  const r = await importOne('only-note.docx', await docx([`<w:p><w:r>${reference}</w:r></w:p>`], '', notes));
  const html = r.chapters[0].paras[0].html;
  assert.ok(html.includes('First *literal*.&#10;Second.'));
  assert.match(html, /data-note-dir="ltr"/);
  assert.ok(!html.includes('NOT A NOTE'));
});

test('Word footnotes on headings and beside soft returns remain recoverable prose', async () => {
  const notes = noteXml('<w:footnote w:id="7"><w:p><w:r><w:t>Keep this note.</w:t></w:r></w:p></w:footnote>');
  const r = await importOne('heading-note.docx', await docx([`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>TITLE</w:t>${reference}<w:br/><w:t>Next line.</w:t></w:r></w:p>`], '', notes));
  const paras = r.chapters.flatMap((c) => c.paras);
  assert.ok(paras.some((p) => p.html && p.html.includes('Keep this note.')));
  assert.ok(paras.some((p) => p.text === 'Next line.'));
});

test('manuscript Word footnotes round-trip text and an independent note direction', async () => {
  const M = require('../manuscript');
  for (const dir of ['ltr', 'rtl']) {
    const fnDir = dir === 'rtl' ? 'ltr' : 'rtl';
    const note = fnDir === 'rtl' ? 'הערה שנשמרת MSNOTE' : 'Independent English MSNOTE';
    const model = { title: 'A story', dir, lang: dir === 'rtl' ? 'he' : 'en', short: true, sections: [{ kind: 'chapter', heading: '', paras: [{ runs: [{ text: 'Story words. ' }, { fn: note, fnDir }] }] }] };
    const zip = new JSZip();
    for (const e of M.docxEntries(model)) zip.file(e.path, e.content);
    const r = await importOne('ms-note-'+dir+'.docx', await zip.generateAsync({type:'nodebuffer'}));
    const html = r.chapters.flatMap((c) => c.paras).map((p) => p.html || '').join('');
    assert.ok(html.includes(note));assert.ok(html.includes('data-note-dir="'+fnDir+'"'));
  }
});
