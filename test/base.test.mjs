import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadConfig,
  manifestFor,
  environmentFor,
  envPrefix,
  validateConfig,
} from '../src/config.mjs';
import { createApp } from '../src/server.mjs';
import { token, input, mockHost, saving } from './helpers.mjs';

test('published template config and generated manifest agree with the xangi-report display name', async () => {
  const config = await loadConfig();
  assert.deepEqual(
    manifestFor(config),
    JSON.parse(await readFile(new URL('../xangi-extension.json', import.meta.url), 'utf8')),
  );
  assert.equal(config.id, 'xangi-report');
  assert.equal(config.displayName, 'xangi-report');
  assert.equal(envPrefix(config), 'XANGI_XANGI_DASH_REPORT');
  assert.equal(
    environmentFor(config, { XANGI_REPORT_DATA_DIR: '/fixture/data' }).EXTENSION_DATA_DIR,
    '/fixture/data',
  );
  assert.equal(
    environmentFor(config, { XANGI_XANGI_DASH_REPORT_DATA_DIR: '/fixture/data' })
      .EXTENSION_DATA_DIR,
    '/fixture/data',
  );
  assert.throws(
    () =>
      environmentFor(config, {
        XANGI_REPORT_DATA_DIR: '/fixture/old',
        XANGI_XANGI_DASH_REPORT_DATA_DIR: '/fixture/new',
      }),
    /Conflicting/,
  );
  assert.throws(
    () => validateConfig({ ...config, features: { ...config.features, device: true } }),
    /does not implement/,
  );
});

test('configure validates before writing and generates flags and escaped identity', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'report-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'src'));
  await mkdir(join(dir, 'scripts'));
  for (const file of [
    'src/config.mjs',
    'scripts/configure.mjs',
    'extension.config.json',
    'xangi-extension.json',
  ])
    await cp(new URL('../' + file, import.meta.url), join(dir, file));
  const run = (...args) =>
    spawnSync(process.execPath, ['scripts/configure.mjs', ...args], { cwd: dir, encoding: 'utf8' });
  const before = await readFile(join(dir, 'extension.config.json'), 'utf8');
  assert.notEqual(run('--features', 'device').status, 0);
  assert.equal(await readFile(join(dir, 'extension.config.json'), 'utf8'), before);
  assert.equal(
    run('--id', 'report-test', '--name', '検証 & <Report>', '--features', 'none').status,
    0,
  );
  const config = JSON.parse(await readFile(join(dir, 'extension.config.json'), 'utf8'));
  assert.deepEqual(config.features, { ui: false, device: false, ai: false });
  const manifest = JSON.parse(await readFile(join(dir, 'xangi-extension.json'), 'utf8'));
  assert.equal(manifest.id, 'report-test');
  assert.equal(manifest.ui, undefined);
  assert.notEqual(run('--features', 'ui,ui').status, 0);
});

for (const ui of [false, true])
  for (const ai of [false, true]) {
    test('independent template flags: ui=' + ui + ', ai=' + ai, async (t) => {
      const dir = await mkdtemp(join(tmpdir(), 'report-features-'));
      const host = mockHost();
      const config = { ...(await loadConfig()), features: { ui, device: false, ai } };
      const app = await createApp({ dir, workspace: dir, token, host, config });
      await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
      t.after(async () => {
        await app.close();
        await rm(dir, { recursive: true, force: true });
      });
      const base = 'http://127.0.0.1:' + app.server.address().port;
      const call = async (path, body, method) =>
        fetch(base + path, {
          method: method || (body ? 'POST' : 'GET'),
          headers: {
            Authorization: 'Bearer ' + token,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      assert.equal((await call('/ui')).status, ui ? 200 : 404);
      const report = await (await call('/api/reports', input)).json();
      assert.ok(report.id);
      const response = await call('/api/settings', { ...saving, saveMode: 'auto' }, 'PUT');
      assert.equal(response.status, ai ? 200 : 400);
      if (!ai) {
        await app.store.setSettings({ ...saving, saveMode: 'auto' });
        const settings = await (await call('/api/settings')).json();
        assert.equal(settings.saveMode, 'off');
        assert.equal(settings.configuredSaveMode, 'auto');
        await call('/api/reports', input);
        assert.equal(host.creates.length, 0);
      }
    });
  }
