import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setup, input, saving, callback, eventually, mockHost } from './helpers.mjs';

test('off by default, settings validation and saving through selected host AI', async (t) => {
  const { app, call, host } = await setup(t);
  const r = (await call('/api/reports', input)).data;
  assert.equal(
    (await call('/api/reports/' + r.id + '/save', { requestId: randomUUID(), revision: 1 })).status,
    400,
  );
  assert.equal(
    (await call('/api/settings', { ...saving, saveMode: 'manual', notionDestination: '' }, 'PUT'))
      .status,
    400,
  );
  assert.equal(
    (await call('/api/settings', { ...saving, saveSkillName: '../escape' }, 'PUT')).status,
    400,
  );
  await call('/api/settings', { ...saving, saveAgentId: 'saving' }, 'PUT');
  const result = await call('/api/reports/' + r.id + '/save', {
    requestId: randomUUID(),
    revision: 1,
  });
  assert.equal(result.status, 202);
  assert.equal(result.data.callbackToken, undefined);
  await eventually(() => host.prompts.length === 1);
  assert.deepEqual(host.creates, [{ agentId: 'saving', automation: false }]);
  assert.match(host.prompts[0].prompt, new RegExp('/api/reports/' + r.id + '/versions/1'));
  const view = await call('/api/reports/' + r.id);
  assert.equal(
    JSON.stringify(view.data).includes(app.store.report(r.id).saves[0].callbackToken),
    false,
  );
  assert.equal(
    (await call('/api/reports/' + r.id + '/save-result', callback(app, r.id))).status,
    200,
  );
});

test('same request concurrently produces one host turn and cannot be reused for a different report', async (t) => {
  const { call, host } = await setup(t);
  await call('/api/settings', saving, 'PUT');
  const r = (await call('/api/reports', input)).data,
    requestId = randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      call('/api/reports/' + r.id + '/save', { requestId, revision: 1 }),
    ),
  );
  assert.ok(responses.every((x) => x.status === 202));
  await eventually(() => host.prompts.length);
  assert.equal(host.prompts.length, 1);
  assert.equal((await call('/api/reports/' + r.id)).data.saves.length, 1);
  const other = (await call('/api/reports', input)).data;
  assert.equal(
    (await call('/api/reports/' + other.id + '/save', { requestId, revision: 1 })).status,
    409,
  );
});

test('result identity, verification, partial outcomes and previous page retention', async (t) => {
  const { app, call, host } = await setup(t);
  await call('/api/settings', saving, 'PUT');
  const r = (await call('/api/reports', input)).data;
  await call('/api/reports/' + r.id + '/save', { requestId: randomUUID(), revision: 1 });
  await eventually(() => host.prompts.length);
  const valid = callback(app, r.id);
  for (const changes of [
    { callbackToken: '' },
    { sessionId: 'wrong' },
    { revision: 2 },
    { verified: false },
    { pageUrl: 'https://other.example.test' },
  ]) {
    assert.notEqual(
      (await call('/api/reports/' + r.id + '/save-result', { ...valid, ...changes })).status,
      200,
    );
  }
  assert.equal(
    (
      await call('/api/reports/' + r.id + '/save-result', {
        ...valid,
        status: 'partial',
        verified: false,
      })
    ).status,
    200,
  );
  await call('/api/reports/' + r.id + '/save', { requestId: randomUUID(), revision: 1 });
  await eventually(() => host.prompts.length === 2);
  assert.ok(host.prompts[1].prompt.includes(valid.pageUrl));
  assert.equal(
    (await call('/api/reports/' + r.id + '/save-result', { ...valid, status: 'error' })).status,
    409,
  );
});

test('auto-saving coalesces updates, binds results to a version and respects disabling', async (t) => {
  const { app, call, host } = await setup(t);
  await call('/api/settings', { ...saving, saveMode: 'auto' }, 'PUT');
  const r = (await call('/api/reports', input)).data;
  await eventually(() => host.prompts.length === 1);
  await call(
    '/api/reports/' + r.id,
    { ...input, content: '<h1>Version 2</h1>', expectedRevision: 1 },
    'PUT',
  );
  await call(
    '/api/reports/' + r.id,
    { ...input, content: '<h1>Version 3</h1>', expectedRevision: 2 },
    'PUT',
  );
  assert.equal(host.prompts.length, 1);
  const old = callback(app, r.id);
  assert.equal((await call('/api/reports/' + r.id + '/save-result', old)).status, 200);
  await eventually(() => host.prompts.length === 2);
  const current = (await call('/api/reports/' + r.id)).data;
  assert.equal(current.saves[0].revision, 1);
  assert.equal(current.saves[0].status, 'saved');
  assert.equal(current.saves[1].revision, 3);
  assert.notEqual(current.saves[1].status, 'saved');
  await call('/api/settings', { ...saving, saveMode: 'off' }, 'PUT');
  await call('/api/reports/' + r.id, { ...input, expectedRevision: 3 }, 'PUT');
  await call('/api/reports/' + r.id + '/save-result', callback(app, r.id));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(host.prompts.length, 2);
});

test('unknown delivery is durable, does not resend and needs an explicit checked retry', async (t) => {
  const host = mockHost({
    async send() {
      throw new Error('timeout');
    },
  });
  const { app, call } = await setup(t, host);
  await call('/api/settings', saving, 'PUT');
  const r = (await call('/api/reports', input)).data;
  await call('/api/reports/' + r.id + '/save', { requestId: randomUUID(), revision: 1 });
  await eventually(() => app.store.report(r.id).saves.at(-1).status === 'uncertain');
  await call('/api/reports/' + r.id + '/save', { requestId: randomUUID(), revision: 1 });
  assert.equal(host.creates.length, 1);
  await call('/api/reports/' + r.id + '/save', {
    requestId: randomUUID(),
    revision: 1,
    retryAfterCheck: true,
  });
  await eventually(() => host.creates.length === 2);
});

test('unconfigured or unavailable saving leaves local report intact', async (t) => {
  const { app, call } = await setup(t, mockHost({ configured: false }));
  await call('/api/settings', { ...saving, saveMode: 'auto' }, 'PUT');
  const r = await call('/api/reports', input);
  assert.equal(r.status, 201);
  await eventually(() => app.store.report(r.data.id).saves.at(-1).status === 'error');
  assert.equal((await call('/api/reports/' + r.data.id)).data.content, input.content);
});

test('saving an old version uses its source metadata and changing destination does not reuse an old page', async (t) => {
  const { app, call, host } = await setup(t);
  await call('/api/settings', saving, 'PUT');
  const r = (await call('/api/reports', input)).data;
  await call(
    '/api/reports/' + r.id,
    { ...input, title: '新版タイトル', sourceNotes: 'new sources', expectedRevision: 1 },
    'PUT',
  );
  await call('/api/reports/' + r.id + '/save', { requestId: randomUUID(), revision: 1 });
  await eventually(() => host.prompts.length === 1);
  assert.ok(host.prompts[0].prompt.includes(input.title));
  assert.equal(app.store.report(r.id).saves[0].sourceNotes, input.sourceNotes);
  await call('/api/reports/' + r.id + '/save-result', callback(app, r.id));
  await call('/api/settings', { ...saving, notionDestination: 'A different destination' }, 'PUT');
  await call('/api/reports/' + r.id + '/save', { requestId: randomUUID(), revision: 2 });
  await eventually(() => host.prompts.length === 2);
  assert.equal(app.store.report(r.id).saves[1].pageUrl, '');
});

test('concurrent cross-report reuse of a request ID permits only one delivery', async (t) => {
  const { call, host } = await setup(t);
  await call('/api/settings', saving, 'PUT');
  const a = (await call('/api/reports', input)).data,
    b = (await call('/api/reports', input)).data;
  const requestId = randomUUID();
  const results = await Promise.all(
    [a, b].map((r) => call('/api/reports/' + r.id + '/save', { requestId, revision: 1 })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [202, 409]);
  await eventually(() => host.prompts.length);
  assert.equal(host.prompts.length, 1);
});
