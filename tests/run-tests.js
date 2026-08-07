const { spawnSync } = require('node:child_process');
const path = require('node:path');

const result = spawnSync(process.execPath, ['--test', 'tests/importer-utils.test.js'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit'
});

process.exit(result.status === null ? 1 : result.status);
