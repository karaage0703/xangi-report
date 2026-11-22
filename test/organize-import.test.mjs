import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/storage.mjs';
import { setup, input, mockHost } from './helpers.mjs';
import { hostClient } from '../src/features/ai.mjs';

test('category and tags can be edited and filtered without creating an HTML version', async (t) => {
  const { call } = await setup(t);
  const a = (
    await call('/api/reports', { ...input, category: '開発', tags: [' 調査 ', '調査', '保留'] })
  ).data;
  assert.deepEqual(a.tags, ['調査', '保留']);
  const b = (await call('/api/reports', input)).data;
  const classify = { category: '生活', tags: ['予定'], expectedClassificationRevision: 1 };
  const result = await call('/api/reports/' + a.id + '/classification', classify);
  assert.equal(result.status, 200);
  assert.equal(result.data.revision, 1);
  assert.equal(result.data.classificationRevision, 2);
  assert.equal((await call('/api/reports/' + a.id + '/classification', classify)).status, 409);
  assert.equal(
    (
      await call(
        '/api/reports?category=' +
          encodeURIComponent('生活') +
          '&tag=' +
          encodeURIComponent('予定'),
      )
    ).data.reports[0].id,
    a.id,
  );
  assert.equal((await call('/api/reports?q=' + encodeURIComponent('予定'))).data.reports.length, 1);
  assert.equal((await call('/api/reports?uncategorized=true')).data.reports[0].id, b.id);
  assert.equal((await call('/api/reports', { ...input, tags: ['x'.repeat(41)] })).status, 400);
  assert.equal((await call('/api/reports', { ...input, tags: Array(21).fill('tag') })).status, 400);
});

test('schema-1 migration backs up exact input and retains IDs, versions, saves and Notion settings', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'report-migration-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let store = await openStore(dir);
  const report = await store.create(input);
  await store.close();
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  state.schemaVersion = 1;
  for (const r of state.reports) {
    delete r.category;
    delete r.tags;
    delete r.classificationRevision;
  }
  const raw = JSON.stringify(state);
  await writeFile(join(dir, 'state.json'), raw);
  store = await openStore(dir);
  const migrated = store.report(report.id);
  assert.equal(store.snapshot().schemaVersion, 2);
  assert.equal(migrated.id, report.id);
  assert.equal(migrated.versions[0].content, input.content);
  assert.deepEqual(migrated.tags, []);
  assert.equal(migrated.category, '');
  assert.deepEqual(store.settings(), state.settings);
  assert.deepEqual(migrated.saves, state.reports[0].saves);
  const backup = (await readdir(dir)).find((x) => x.startsWith('state.schema-1.'));
  assert.ok(backup);
  assert.equal(await readFile(join(dir, backup), 'utf8'), raw);
  await store.close();
  store = await openStore(dir);
  assert.equal(store.report(report.id).classificationRevision, 1);
  await store.close();
});

test('import is a copied snapshot, repeated same source/content is deduplicated and source change is not silently saved', async (t) => {
  let content = input.content;
  const host = mockHost({
    async artifact() {
      return content;
    },
  });
  const { call } = await setup(t, host);
  const source = { path: 'reports/old.html', workspaceId: 'fixture-workspace' };
  const preview = await call('/api/imports/preview', source);
  assert.equal(preview.status, 200);
  assert.equal((await call('/api/reports')).data.reports.length, 0);
  const body = {
    ...source,
    expectedSha256: preview.data.sha256,
    title: '過去の成果物',
    category: '調査',
    tags: ['過去'],
  };
  const [a, b] = await Promise.all([
    call('/api/imports/artifact', body),
    call('/api/imports/artifact', body),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.data.id, b.data.id);
  assert.equal((await call('/api/reports')).data.reports.length, 1);
  content = '<h1>Changed source</h1>';
  assert.equal((await call('/api/imports/artifact', body)).status, 409);
  assert.equal((await call('/api/reports/' + a.data.id)).data.content, input.content);
  const changed = (await call('/api/imports/preview', source)).data;
  const newer = await call('/api/imports/artifact', { ...body, expectedSha256: changed.sha256 });
  assert.equal(newer.status, 201);
  assert.notEqual(newer.data.id, a.data.id);
  assert.equal(newer.data.origin.path, source.path);
});

test('import validates host paths and failure does not create a report', async (t) => {
  const { call } = await setup(
    t,
    mockHost({
      async artifact() {
        const e = new Error('not found');
        e.hostStatus = 404;
        throw e;
      },
    }),
  );
  assert.equal((await call('/api/imports/preview', { path: 'missing.html' })).status, 404);
  for (const bad of [
    { path: 'https://other.example.test/file.html' },
    { path: 'private.txt' },
    { path: 'a.html', workspaceId: 'a', sessionId: 'b' },
  ]) {
    assert.equal((await call('/api/imports/preview', bad)).status, 400);
  }
  assert.equal((await call('/api/reports')).data.reports.length, 0);
});

test('host artifact requests stay at parent origin, are bounded and use explicit workspace/session scopes', async () => {
  const calls = [];
  const host = hostClient(
    { XANGI_EXTENSION_HOST_URL: 'http://host.example.test', XANGI_TOKEN: 'fixture-host' },
    async (url, options) => {
      calls.push({ url, options });
      return new Response(input.content);
    },
  );
  assert.equal(await host.artifact({ path: 'a b.html', workspaceId: 'work' }, 2000), input.content);
  assert.equal(new URL(calls[0].url).searchParams.get('path'), 'a b.html');
  assert.equal(new URL(calls[0].url).searchParams.get('workspaceId'), 'work');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-host');
  await host.artifact({ path: 'a.html', sessionId: 'session' }, 2000);
  assert.equal(new URL(calls[1].url).pathname, '/api/session-attachment');
  assert.equal(new URL(calls[1].url).searchParams.get('mode'), 'raw');
  await assert.rejects(host.artifact({ path: 'a.html' }, 1), (error) => error.status === 413);
});
