// Screenshots of every view, for the Hebrew/RTL work (Phase 2.1: styles.css to
// logical properties). A logical property is identical in LTR, so an English
// run before and after the change must match to the pixel.
//
//   electron scripts/mirror-shots.e2e.js <outDir> [en|he]
//   electron scripts/mirror-shots.e2e.js --compare <dirA> <dirB> [outDiffDir]
//
// A fixed 1400x900 window (shots are at the display's scale: 2800x1800 on retina), a library
// written before launch with fixed ids and text, the clock frozen, animations,
// transitions and the caret off. Each view is <outDir>/<lang>-<view>.png.
// `npm run test:shots -- <outDir> [en|he]`.

'use strict';

const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--inspect') && !a.startsWith('--remote'));

// ---------------------------------------------------------------------------
// compare mode: no window, just two folders of PNGs
// ---------------------------------------------------------------------------
if (argv[0] === '--compare') {
  const [, dirA, dirB, diffDirArg] = argv;
  const diffDir = diffDirArg || path.join(path.resolve(dirB), '_diff');
  const names = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.png')).sort();
  const a = new Set(names(dirA));
  const b = new Set(names(dirB));
  let same = 0;
  let differ = 0;
  let missing = 0;
  for (const name of [...new Set([...a, ...b])].sort()) {
    if (!a.has(name) || !b.has(name)) { console.log(`MISSING   ${name} (only in ${a.has(name) ? dirA : dirB})`); missing++; continue; }
    const ia = nativeImage.createFromPath(path.join(dirA, name));
    const ib = nativeImage.createFromPath(path.join(dirB, name));
    const sa = ia.getSize();
    const sb = ib.getSize();
    if (sa.width !== sb.width || sa.height !== sb.height) { console.log(`DIFFER    ${name}: size ${sa.width}x${sa.height} vs ${sb.width}x${sb.height}`); differ++; continue; }
    const pa = ia.toBitmap();
    const pb = ib.toBitmap();
    const out = Buffer.from(pb);
    let n = 0;
    let x0 = 1e9; let y0 = 1e9; let x1 = -1; let y1 = -1;
    for (let i = 0; i < pa.length; i += 4) {
      const d = pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2];
      if (d) {
        n++;
        const px = (i / 4) % sa.width;
        const py = Math.floor(i / 4 / sa.width);
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
        out[i] = 0; out[i + 1] = 0; out[i + 2] = 255; out[i + 3] = 255; // red, as BGRA
      } else {
        // fade what matches
        out[i] = out[i] >> 2; out[i + 1] = out[i + 1] >> 2; out[i + 2] = out[i + 2] >> 2;
      }
    }
    if (!n) { console.log(`identical ${name}`); same++; continue; }
    differ++;
    fs.mkdirSync(diffDir, { recursive: true });
    const file = path.join(diffDir, 'diff-' + name);
    fs.writeFileSync(file, nativeImage.createFromBitmap(out, { width: sa.width, height: sa.height }).toPNG());
    console.log(`DIFFER    ${name}: ${n} pixels differ, box x ${x0}-${x1}, y ${y0}-${y1}  -> ${file}`);
  }
  console.log(`\n${same} identical, ${differ} differ, ${missing} missing`);
  process.exit(differ || missing ? 1 : 0);
}

// ---------------------------------------------------------------------------
// capture mode
// ---------------------------------------------------------------------------
const OUT = path.resolve(argv[0] || path.join(os.tmpdir(), 'neo-shots'));
const LANG = argv[1] || 'en';
const W = 1400;
const H = 900;

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-shots-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-shots-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'app', 'settings.json'), JSON.stringify({ uiLanguage: LANG }));
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);

// ---- the library: fixed ids, titles and text ----
const NOW = '2026-03-15T12:00:00.000Z';
const lorem = (n, seed) => {
  const w = ['the', 'lantern', 'burned', 'low', 'in', 'ice', 'house', 'while', 'Ines', 'counted', 'salt', 'barrels', 'along', 'road', 'and', 'wind', 'carried', 'river', 'smoke', 'across', 'frozen', 'fields', 'toward', 'town'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(w[(i * 7 + seed * 5 + (i >> 2)) % w.length]);
  const s = out.join(' ');
  return s[0].toUpperCase() + s.slice(1) + '.';
};
const paras = (k, seed) => Array.from({ length: k }, (_, i) => `<p>${lorem(38 + ((i * 11 + seed) % 30), seed + i)}</p>`).join('');
const BOOKS = [
  { id: 'book-the-lantern-year-aaaa1', title: 'The Lantern Year', subtitle: 'A novel of the north', author: 'Ines Marlow', chapters: [['The Thaw', 7], ['Salt Road', 6], ['Ice House', 5], ['Epilogue', 3]] },
  { id: 'book-salt-road-aaaa2', title: 'Salt Road', subtitle: '', author: 'Ines Marlow', chapters: [['One', 4], ['Two', 4]] },
  { id: 'book-river-smoke-aaaa3', title: 'River Smoke', subtitle: '', author: 'Tom Hale', chapters: [['Dawn', 3]] },
  { id: 'book-small-fires-aaaa4', title: 'Small Fires', subtitle: 'Stories', author: 'Tom Hale', chapters: [['First', 3], ['Second', 3], ['Third', 3]] },
  { id: 'book-winter-ledger-aaaa5', title: 'The Winter Ledger', subtitle: '', author: 'Ines Marlow', chapters: [['Entry', 2]] }
];
BOOKS.forEach((b, bi) => {
  const dir = path.join(lib, b.id);
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  const order = b.chapters.map((_, i) => `ch-${bi}${i}`);
  const meta = {
    id: b.id, title: b.title, subtitle: b.subtitle, series: '', author: b.author, wordGoal: bi === 0 ? 60000 : 0,
    created: NOW, modified: NOW, chapterOrder: order,
    chapterTitles: Object.fromEntries(b.chapters.map(([t], i) => [order[i], t])),
    tabNames: { notes: 'Notes', outline: 'Outline' }
  };
  if (bi === 0) {
    meta.chapterKinds = { 'ch-03': 'epilogue' };
    meta.sectionNotes = {};
    meta.looseCards = [{ id: 'lc-1', text: 'The ferryman knows more than he says.' }, { id: 'lc-2', text: 'Move the thaw to spring.' }];
  }
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify(meta));
  b.chapters.forEach(([, k], i) => {
    const sec = bi === 0 && i === 0 ? '<p class="scene-break">***</p>' : '';
    fs.writeFileSync(path.join(dir, 'chapters', order[i] + '.html'), paras(k, bi * 3 + i) + sec + (sec ? paras(2, 9) : ''));
  });
  fs.writeFileSync(path.join(dir, 'notes.html'), bi === 0 ? '<p>Remember: the lantern is brass, not tin.</p><p>Check the ferry timetable.</p>' : '');
  fs.writeFileSync(path.join(dir, 'outline.html'), bi === 0 ? '<p>Act one: the thaw.</p><p>Act two: the road.</p>' : '');
  fs.writeFileSync(path.join(dir, 'darlings.json'), JSON.stringify(bi === 0 ? [
    { id: 'd-1', html: '<p>A sentence cut from chapter one that was too fond of the weather.</p>', text: 'A sentence cut from chapter one that was too fond of the weather.', chapterId: null, chapterLabel: 'Chapter 1', date: '2026-03-10T09:00:00.000Z' },
    { id: 'd-2', html: '<p>The old keeper never spoke of the second winter.</p>', text: 'The old keeper never spoke of the second winter.', chapterId: null, chapterLabel: 'deleted Chapter 3', date: '2026-03-12T09:00:00.000Z' }
  ] : []));
  fs.writeFileSync(path.join(dir, 'stickies.json'), JSON.stringify([]));
});
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: 'Ines Marlow', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night',
  shelves: [
    { id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOKS[0].id, BOOKS[1].id, BOOKS[2].id] },
    { id: 'shelf-2', name: 'Finished', bookIds: [BOOKS[3].id, BOOKS[4].id] }
  ]
}));

// ---- the window: fixed size, the clock frozen, no motion ----
const FREEZE = `(() => {
  const RealDate = Date;
  const T = new RealDate('2026-03-15T12:00:00').getTime();
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(T); }
    static now() { return T; }
  }
  window.Date = FixedDate;
  // the test window is rarely the focused one, and a window blur closes menus: leave blur unheard
  const listen = window.addEventListener;
  window.addEventListener = function (type, ...rest) { if (type === 'blur') return; return listen.call(this, type, ...rest); };
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
  const add = () => document.head && document.head.appendChild(style);
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
})();`;
app.on('browser-window-created', (_e, win) => {
  win.setContentSize(W, H);
  win.setPosition(40, 40);
});
// the freeze goes in as a session preload, which runs before the page's scripts
const PRELOAD = path.join(tmp, 'freeze-preload.js');
fs.writeFileSync(PRELOAD, `require('electron').webFrame.executeJavaScript(${JSON.stringify(FREEZE)});`);
app.on('browser-window-created', (_e, win) => {
  win.webContents.session.setPreloads([PRELOAD]);
});
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
let win;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const counts = [];
async function shot(name) {
  await tick(250);
  fs.mkdirSync(OUT, { recursive: true });
  const img = await wc.capturePage();
  const file = path.join(OUT, `${LANG}-${name}.png`);
  fs.writeFileSync(file, img.toPNG());
  counts.push(name);
  console.log('shot ' + name + ' ' + img.getSize().width + 'x' + img.getSize().height);
}
const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const hover = async (x, y) => { wc.sendInputEvent({ type: 'mouseMove', x, y }); await tick(150); };
const pressEscape = async () => {
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await tick(150);
};
const closeModals = async () => {
  for (let i = 0; i < 4; i++) {
    const open = await js(`!!document.querySelector('.modal-backdrop:not([hidden]), .pop-menu, #keyboard-shortcuts')`);
    if (!open) break;
    // (Escape on the document leaves the book: only the shortcuts window needs it)
    if (await js(`!!document.querySelector('#keyboard-shortcuts')`)) await pressEscape();
    await js(`popMenu.close && popMenu.close(); document.querySelectorAll('.pop-menu').forEach((m) => m.remove())`);
    await js(`document.querySelectorAll('.modal-backdrop:not([hidden]) [data-cancel], .modal-backdrop:not([hidden]) .m-cancel, .modal-backdrop:not([hidden]) .m-ok').forEach((b) => b.click())`);
  }
  await tick(150);
};
const view = async (name, fn) => {
  try {
    await fn();
    await shot(name);
  } catch (err) {
    console.log('FAILED view ' + name + ': ' + err.message);
  }
  try { await closeModals(); } catch { /* next view */ }
  if (process.env.NEO_DEBUG) console.log('  after ' + name + ': book ' + (await js('!!book')));
};
const contextAt = (sel, nth = 0) => js(`(() => {
  const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
})()`);

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    win.setContentSize(W, H);
    wc = win.webContents;
    wc.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) console.log('page: ' + msg); });
    wc.on('did-fail-load', (_e, c, d) => console.log('load failed ' + c + ' ' + d));
    while (!(await js(`typeof library !== 'undefined' && !!library && !!library.features`).catch(() => false))) await tick(50);
    await tick(1200);
    win.focus();
    await js(`document.getElementById('firstrun') && (document.getElementById('firstrun').hidden = true)`);
    console.log('window ' + JSON.stringify(await js(`[innerWidth, innerHeight, devicePixelRatio, document.documentElement.dir, new Date().toISOString()]`)));

    // ---- the shelf ----
    await view('shelf', async () => { await hover(5, 5); });
    await view('shelf-hover-book', async () => {
      const r = await js(`(() => { const r = document.querySelector('.book').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await hover(Math.round(r[0]), Math.round(r[1]));
    });
    await view('shelf-book-menu', async () => { await hover(5, 5); contextAt('.book', 0); await tick(300); });
    await view('shelf-label-menu', async () => { contextAt('.shelf-label, .shelf-name, .shelf h2', 0); await tick(300); });
    await view('shelf-plus-menu', async () => { contextAt('.new-book', 0); await tick(300); });
    await view('shelf-shortcuts', async () => { wc.send('menu', { type: 'help' }); await tick(500); });
    await view('about', async () => { wc.send('menu', { type: 'about' }); await tick(500); });
    await view('goals', async () => { wc.send('menu', { type: 'stats' }); await tick(500); });
    await view('email-settings', async () => { wc.send('menu', { type: 'emailSettings' }); await tick(500); });

    // ---- the editor ----
    await js(`openBook(${JSON.stringify(BOOKS[0].id)})`);
    await tick(1500);
    await js(`(() => { const b = document.querySelector('.chapter-body'); b && b.blur(); getSelection().removeAllRanges(); })()`);
    await view('editor', async () => { await hover(700, 880); });
    await view('editor-nav-pane', async () => { await js(`document.querySelector('#nav-pane').classList.add('open')`); await hover(30, 300); });
    await view('editor-nav-menu', async () => { contextAt('#nav-pane .nav-item, #nav-pane .nav-row, #nav-pane li', 1); await tick(300); });
    await js(`document.querySelector('#nav-pane').classList.remove('open')`);
    await view('editor-side-pane', async () => { await js(`document.querySelector('#side-pane').classList.add('open')`); await hover(1380, 300); });
    await js(`document.querySelector('#side-pane').classList.remove('open')`);
    await view('editor-hover-bottom', async () => { await hover(700, 888); });
    await view('editor-find', async () => { wc.send('menu', { type: 'find' }); await tick(300); await js(`(() => { const i = document.querySelector('#search-input'); i.value = 'lantern'; i.dispatchEvent(new Event('input', { bubbles: true })); const r = document.querySelector('#replace-input'); if (r) r.value = 'lamp'; })()`); await tick(300); });
    await js(`(() => { const s = document.querySelector('#searchbar'); if (s && !s.hidden) document.querySelector('#search-close').click(); })()`);
    await view('editor-focus-mode', async () => {
      await js(`(() => { const p = document.querySelector('.chapter-body p'); p.closest('.chapter-body').focus(); const r = document.createRange(); r.setStart(p.firstChild, 12); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); setFocus('paragraph'); })()`);
      await tick(400);
    });
    await js(`setFocus('off')`);
    await view('editor-pages-view', async () => { wc.send('menu', { type: 'pagedView' }); await tick(800); });
    wc.send('menu', { type: 'pagedView' });
    await tick(600);
    await view('editor-snapshot-toast', async () => { await js(`toast('Snapshot taken: the whole book.', 60000)`); });
    await js(`toast('', 1); document.getElementById('hint').hidden = true`);
    await view('editor-zoomed', async () => { await js(`document.querySelector('#zoom-in').click()`); });
    await js(`document.querySelector('#zoom-out').click()`);

    // ---- the tabs ----
    await view('notes-tab', async () => { await click('.tab[data-tab="notes"]'); await tick(600); });
    await view('notes-tab-side', async () => { await js(`document.querySelector('#side-pane').classList.add('open')`); await tick(300); });
    await js(`document.querySelector('#side-pane').classList.remove('open')`);
    await view('outline-cards', async () => { await click('.tab[data-tab="outline"]'); await tick(800); });
    await view('outline-card-menu', async () => { contextAt('.ob-card', 1); await tick(300); });
    await view('outline-loose-cards', async () => { await js(`document.querySelector('#side-pane').classList.add('open')`); await tick(400); });
    await js(`document.querySelector('#side-pane').classList.remove('open')`);
    await view('outline-list', async () => {
      await js(`library.outlineView = 'list'; renderOutline()`);
      await tick(600);
    });
    await js(`library.outlineView = 'cards'; renderOutline()`);
    await tick(400);
    await view('darlings-tab', async () => { await click('.tab[data-tab="darlings"]'); await tick(800); });
    await view('darlings-snapshots', async () => {
      await js(`(async () => { await takeSnapshot('k'); snapList && snapList(); })()`);
      await tick(900);
      await js(`document.querySelector('#side-pane').classList.add('open')`);
    });
    await view('darlings-snapshot-shown', async () => {
      await js(`(async () => { const l = await loadSnaps(book.id); if (l.length) await showSnapshot(l[0].name || l[0].id); })()`);
      await tick(900);
    });
    await click('.tab[data-tab="manuscript"]');
    await tick(600);

    // ---- dialogs inside the book ----
    await view('book-goals', async () => { wc.send('menu', { type: 'stats' }); await tick(600); });
    await view('export-manuscript-format', async () => { wc.send('menu', { type: 'export', format: 'manuscript' }); await tick(1000); });
    await view('export-paperback', async () => { wc.send('menu', { type: 'export', format: 'paperback' }); await tick(1000); });
    await view('shortcuts-in-book', async () => { wc.send('menu', { type: 'help' }); await tick(600); });
    await view('editor-right-click', async () => {
      await js(`(() => { const p = document.querySelector('.chapter-body p'); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 90, clientY: r.top + 10 })); })()`);
      await tick(400);
    });
    await closeModals();

    // ---- other looks ----
    await view('editor-paper-theme', async () => {
      await js(`library.pageTheme = 'paper'; applyFonts()`);
      await tick(500);
    });
    await js(`library.pageTheme = 'night'; applyFonts()`);
    await view('shelf-after-book', async () => { await js(`backToShelf()`); await tick(1000); });
    console.log(`\n${counts.length} views written to ${OUT}`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
