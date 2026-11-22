import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, storageDirectory } from '../src/storage.mjs';
import { root } from '../src/config.mjs';
import { setup, input, token } from './helpers.mjs';

test('snapshot registration, search, star, optimistic updates and immutable prior versions', async (t) => {
  const { call } = await setup(t);
  const first = await call('/api/reports', input);
  assert.equal(first.status, 201);
  const id = first.data.id;
  assert.equal(first.data.format, 'html');
  assert.equal(first.data.revision, 1);
  const concurrent = await Promise.all(
    [2, 3].map((n) =>
      call(
        '/api/reports/' + id,
        { ...input, content: '<h1>v' + n + '</h1>', expectedRevision: 1 },
        'PUT',
      ),
    ),
  );
  assert.deepEqual(concurrent.map((x) => x.status).sort(), [200, 409]);
  assert.equal((await call('/api/reports/' + id + '/versions/1')).data.content, input.content);
  assert.equal((await call('/api/reports/' + id)).data.revision, 2);
  assert.equal((await call('/api/reports/' + id, { starred: true }, 'PATCH')).status, 200);
  assert.equal(
    (await call('/api/reports?starred&q=' + encodeURIComponent('検証'))).data.reports.length,
    1,
  );
  assert.equal((await call('/api/reports?q=missing')).data.reports.length, 0);
  assert.equal((await call('/api/reports/' + id + '/versions/30')).status, 404);
  assert.equal((await call('/api/reports', { ...input, format: 'pdf' })).status, 415);
  assert.equal((await call('/api/reports', { ...input, content: '' })).status, 400);
  assert.equal(
    (await call('/api/reports', { ...input, content: 'x'.repeat(2 * 1024 * 1024 + 1) })).status,
    413,
  );
  assert.equal((await call('/api/reports', { ...input, arbitrary: true })).status, 400);
});

test('managed auth, cross-origin rejection, proxied relative UI assets and view/download isolation', async (t) => {
  const { call } = await setup(t);
  assert.equal(
    (await call('/health', undefined, undefined, { Authorization: 'Bearer wrong' })).status,
    401,
  );
  assert.equal(
    (await call('/api/reports', input, undefined, { Origin: 'https://other.example.test' })).status,
    403,
  );
  assert.equal((await call('/api/reports', input, undefined, { Origin: 'null' })).status, 403);
  const r = (await call('/api/reports', input)).data;
  const view = await call('/api/reports/' + r.id + '/versions/1/view');
  assert.equal(view.data, input.content);
  assert.match(view.headers.get('content-security-policy'), /sandbox allow-scripts/);
  assert.doesNotMatch(view.headers.get('content-security-policy'), /allow-same-origin/);
  assert.match(view.headers.get('content-security-policy'), /connect-src 'none'/);
  const downloaded = await call('/api/reports/' + r.id + '/versions/1/download');
  assert.equal(downloaded.data, input.content);
  assert.match(downloaded.headers.get('content-disposition'), /^attachment/);
  assert.equal((await call('/ui')).status, 200);
  assert.equal((await call('/app.js')).status, 200);
  assert.equal((await call('/style.css')).status, 200);
  const invalid = await fetch(
    'http://127.0.0.1:' + (await setup(t)).app.server.address().port + '/api/reports',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{bad',
    },
  );
  assert.equal(invalid.status, 400);
});

test('durable restart retention, serialization, single writer and fail closed on corrupt state', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'report-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let store = await openStore(dir);
  const records = await Promise.all(
    Array.from({ length: 8 }, (_, i) => store.create({ ...input, title: 'Report ' + i })),
  );
  await assert.rejects(openStore(dir), /already open/);
  await store.close();
  store = await openStore(dir);
  assert.equal(store.list().length, 8);
  assert.equal(store.report(records[0].id).versions[0].content, input.content);
  await store.close();
  const before = await readFile(join(dir, 'state.json'), 'utf8');
  await writeFile(join(dir, 'state.json'), '{bad');
  await assert.rejects(openStore(dir), /invalid/);
  assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), '{bad');
  await writeFile(join(dir, 'state.json'), before);
  store = await openStore(dir);
  await store.close();
});

test('storage is instance-scoped, outside source and does not follow source-directed symlinks', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'report-scope-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const a = await storageDirectory(workspace, { XANGI_EXTENSION_INSTANCE_ID: 'fixture-a' });
  const b = await storageDirectory(workspace, { XANGI_EXTENSION_INSTANCE_ID: 'fixture-b' });
  assert.notEqual(a, b);
  await assert.rejects(storageDirectory(workspace, { XANGI_REPORT_DATA_DIR: root }), /outside/);
  await assert.rejects(
    storageDirectory(workspace, { XANGI_REPORT_DATA_DIR: 'relative' }),
    /absolute/,
  );
  const link = join(workspace, 'source-link');
  await symlink(root, link);
  await assert.rejects(
    storageDirectory(workspace, { XANGI_REPORT_DATA_DIR: link }),
    /resolve into/,
  );
});
