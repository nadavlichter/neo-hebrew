'use strict';

// The complete RTL browser battery, once per suite (each suite owns its
// interface/platform variants). Run with npm run test:rtl.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');
const root = path.resolve(__dirname, '..');
const suites = ['rtl-typing', 'rtl-caret', 'hebrew-typing', 'hebrew-fonts', 'hebrew-ui',
  'rtl-outline', 'rtl-print', 'pocket-rtl', 'manuscript', 'footnotes'];
const build = spawnSync(process.execPath, [path.join(__dirname, 'pocket-www.js')], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
for (const suite of suites) {
  console.log('\nRTL suite: ' + suite);
  const run = spawnSync(electron, [path.join(__dirname, suite + '.e2e.js')], { cwd: root, stdio: 'inherit' });
  if (run.error) console.error(run.error);
  if (run.status !== 0) process.exit(run.status || 1);
}
