import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setup, input, saving, eventually } from './helpers.mjs';
import { randomUUID } from 'node:crypto';
import { listReports } from '../src/listing.mjs';
import { openStore } from '../src/storage.mjs';

test('list orders by content update, addition or Japanese title and rejects invalid options', async (t) => {
  const { call, app } = await setup(t);
  const a = (await call('/api/reports', { ...input, title: 'い' })).data;
  const b = (await call('/api/reports', { ...input, title: 'あ' })).data;
  await app.store.transact((s) => {
    Object.assign(s.reports[0], {
      created: '2025-01-01T00:00:00Z',
      updated: '2025-03-01T00:00:00Z',
    });
    Object.assign(s.reports[1], {
      created: '2025-02-01T00:00:00Z',
      updated: '2025-02-01T00:00:00Z',
    });
  });
  for (const [sort, ids] of Object.entries({
    updated_desc: [a.id, b.id],
    updated_asc: [b.id, a.id],
    created_desc: [b.id, a.id],
    created_asc: [a.id, b.id],
    title_asc: [b.id, a.id],
  })) {
    assert.deepEqual(
      (await call('/api/reports?sort=' + sort)).data.reports.map((r) => r.id),
      ids,
    );
  }
  assert.equal((await call('/api/reports?sort=__proto__')).status, 400);
  assert.equal((await call('/api/reports?archive=unknown')).status, 400);
  const tied = [
    { ...a, updated: b.updated, id: 'b' },
    { ...a, updated: b.updated, id: 'a' },
  ];
  assert.deepEqual(
    listReports(tied, new URLSearchParams()).map((r) => r.id),
    ['a', 'b'],
  );
});

test('archive hides only from active lists, supports filters and restoration without altering content or saves', async (t) => {
  const { call, app, host } = await setup(t);
  const r = (await call('/api/reports', { ...input, category: '資料', tags: ['過去'] })).data;
  await call('/api/settings', saving, 'PUT');
  assert.equal(
    (await call('/api/reports/' + r.id + '/save', { requestId: randomUUID(), revision: 1 })).status,
    202,
  );
  await eventually(() => app.store.report(r.id).saves.at(-1).status === 'requested');
  const before = app.store.report(r.id);
  const archive = () =>
    call('/api/reports/' + r.id + '/archive', { archived: true, expectedArchived: false });
  assert.equal((await archive()).status, 200);
  assert.equal((await call('/api/reports')).data.reports.length, 0);
  assert.equal(
    (await call('/api/reports?archive=archived&tag=' + encodeURIComponent('過去'))).data.reports[0]
      .id,
    r.id,
  );
  assert.equal((await call('/api/reports?archive=all')).data.reports.length, 1);
  assert.equal((await archive()).status, 409);
  assert.equal(
    (await call('/api/reports/' + r.id + '/archive', { archived: 'yes', expectedArchived: true }))
      .status,
    400,
  );
  const archived = app.store.report(r.id);
  assert.deepEqual({ ...archived, archived: false }, before);
  assert.equal((await call('/api/reports/' + r.id)).data.archived, true);
  assert.equal((await call('/api/reports/' + r.id + '/versions/1/download')).data, input.content);
  assert.equal(
    (await call('/api/reports/' + r.id + '/archive', { archived: false, expectedArchived: true }))
      .status,
    200,
  );
  assert.equal((await call('/api/reports')).data.reports.length, 1);
  assert.equal(host.prompts.length, 1);
});

test('legacy schema-2 reports default to active without rewriting state; archive survives reopen', async (t) => {
  const { app } = await setup(t);
  const report = await app.store.create(input);
  const dir = app.store.dir;
  // Use an independent store directory; setup owns its application lifecycle.
  const legacyDir = join(dir, 'legacy');
  let store = await openStore(legacyDir);
  await store.create(input);
  await store.close();
  const file = join(legacyDir, 'state.json'),
    state = JSON.parse(await readFile(file, 'utf8'));
  delete state.reports[0].archived;
  const raw = JSON.stringify(state);
  await writeFile(file, raw);
  store = await openStore(legacyDir);
  try {
    assert.equal(store.list()[0].archived, false);
    assert.equal(await readFile(file, 'utf8'), raw);
    await store.archive(store.list()[0].id, { archived: true, expectedArchived: false });
  } finally {
    await store.close();
  }
  store = await openStore(legacyDir);
  try {
    assert.equal(store.list()[0].archived, true);
  } finally {
    await store.close();
  }
  assert.equal(app.store.report(report.id).archived, false);
});

test('measurement is opt-in and preserves original responses, download and sandbox isolation', async (t) => {
  const { call } = await setup(t);
  const r = (await call('/api/reports', input)).data;
  const prefix = '/api/reports/' + r.id + '/versions/1/';
  const view = await call(prefix + 'view?presentation=1');
  assert.ok(view.data.startsWith(input.content));
  assert.match(view.data, /xangi-report-size/);
  assert.match(view.headers.get('content-security-policy'), /sandbox allow-scripts/);
  assert.doesNotMatch(view.headers.get('content-security-policy'), /allow-same-origin/);
  assert.equal((await call(prefix + 'view')).data, input.content);
  assert.equal((await call(prefix + 'download')).data, input.content);
  assert.equal((await call('/api/reports/' + r.id)).data.content, input.content);
});
