import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { openStore } from '../src/storage.mjs';
import { token, input } from './helpers.mjs';

async function start(workspace) {
  const child = spawn(
    process.execPath,
    ['scripts/xangi-extension', 'serve', '--workspace', workspace],
    {
      env: {
        ...process.env,
        XANGI_EXTENSION_AUTH_TOKEN: token,
        XANGI_EXTENSION_INSTANCE_ID: 'lifecycle-fixture',
        XANGI_REPORT_DATA_DIR: join(workspace, 'data'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const lines = createInterface({ input: child.stdout });
  const line = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Readiness timeout'));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('Exited before readiness'));
    });
    lines.once('line', (value) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
  return { child, ready: JSON.parse(line) };
}
async function stop(child, signal) {
  const exited = once(child, 'exit');
  if (signal) child.kill(signal);
  else child.stdin.end();
  return exited;
}
test('real entrypoint emits readiness and persists reports across EOF, SIGTERM and crash recovery', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'report-life-'));
  const children = [];
  t.after(async () => {
    for (const c of children) if (c.exitCode === null && !c.killed) c.kill();
    await rm(workspace, { recursive: true, force: true });
  });
  let { child, ready } = await start(workspace);
  children.push(child);
  assert.equal(ready.schemaVersion, 2);
  assert.equal(ready.event, 'ready');
  assert.equal(ready.id, 'xangi-report');
  assert.equal(ready.workspace, workspace);
  const result = await fetch(ready.baseUrl + '/api/reports', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const report = await result.json();
  assert.equal(result.status, 201);
  assert.equal((await stop(child))[0], 0);
  ({ child, ready } = await start(workspace));
  children.push(child);
  const restored = await (
    await fetch(ready.baseUrl + '/api/reports/' + report.id, {
      headers: { Authorization: 'Bearer ' + token },
    })
  ).json();
  assert.equal(restored.content, input.content);
  assert.equal(restored.revision, 1);
  assert.equal((await stop(child, 'SIGTERM'))[0], 0);
  ({ child, ready } = await start(workspace));
  children.push(child);
  await stop(child, 'SIGKILL');
  ({ child, ready } = await start(workspace));
  children.push(child);
  assert.equal(
    (await fetch(ready.baseUrl + '/health', { headers: { Authorization: 'Bearer ' + token } }))
      .status,
    200,
  );
  await stop(child);
});

test('restart marks interrupted sends uncertain and keeps requested and prior URL', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'report-restart-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let store = await openStore(dir);
  const r = await store.create(input);
  const uuid = '11111111-1111-4111-8111-111111111111';
  await store.transact((s) => {
    s.reports[0].saves = [
      {
        requestId: uuid,
        revision: 1,
        status: 'sending',
        sessionId: 'fixture',
        callbackToken: 'a'.repeat(64),
        pageUrl: 'https://www.notion.so/' + '2'.repeat(32),
      },
    ];
  });
  await store.close();
  store = await openStore(dir);
  assert.equal(store.report(r.id).saves[0].status, 'uncertain');
  assert.ok(store.report(r.id).saves[0].pageUrl);
  await store.transact((s) => {
    s.reports[0].saves[0].status = 'requested';
  });
  await store.close();
  store = await openStore(dir);
  assert.equal(store.report(r.id).saves[0].status, 'requested');
  await store.close();
});
