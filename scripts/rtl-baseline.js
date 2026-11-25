'use strict';

// The baseline the Hebrew/RTL tests hold English output to: NEO's own main
// at the last merge (2.0.0). An English book exported here must be the file
// main writes, byte for byte. Without git (or that commit) the comparisons
// are skipped, never run against themselves.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { APP_FILES } = require('./app-files');

const root = path.join(__dirname, '..');
const UPSTREAM = '7366b41';

function fileAt(rev, file) {
  try {
    return execFileSync('git', ['show', `${rev}:${file}`], { cwd: root, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch { return null; }
}
// the window's source at a commit, joined as appSource() joins it
function appSourceAt(rev) {
  const files = APP_FILES.map((f) => fileAt(rev, f));
  return files.every((s) => s !== null) ? files.join('\n') : null;
}
// LitRPG's export pieces (LITRPG_DOCX_PPR, litrpgCss, litrpgClass, …): a file
// of plain definitions, run as it is beside the builders a test cuts out
const LITRPG = fs.readFileSync(path.join(root, 'app/litrpg.js'), 'utf8').replace(/^'use strict';/, '');
// headingOwnCase and DROP_CAP_SIZE, from the PDF builders' file
const printHelpers = (src) => src.slice(src.indexOf('// A chapter heading for the regular PDF'), src.indexOf('function buildPrintHtml('));

module.exports = { UPSTREAM, fileAt, appSourceAt, LITRPG, printHelpers };
