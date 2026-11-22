import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadConfig, manifestFor } from '../src/config.mjs';
async function check(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + item.name;
    if (item.isDirectory()) await check(path);
    else if (/\.(mjs|js)$/.test(path)) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
for (const dir of ['src', 'public', 'scripts', 'test']) await check(dir);
console.log('Syntax checks passed.');
assert.deepEqual(
  JSON.parse(await readFile('xangi-extension.json', 'utf8')),
  manifestFor(await loadConfig()),
);
console.log('Config and manifest agree.');
