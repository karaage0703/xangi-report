import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.mjs';
export const token = 'fixture-managed-token-' + 'x'.repeat(32);
export const input = {
  title: '検証レポート',
  project: '検証',
  sourceNotes: 'fixture source',
  content:
    '<!doctype html><html><title>検証</title><body><button onclick="this.textContent=42">計算</button></body></html>',
};
export function mockHost(changes = {}) {
  return {
    configured: true,
    destination: 'http://host.example.test',
    prompts: [],
    creates: [],
    async agents() {
      return [{ id: 'saving', name: '保存AI', available: true }];
    },
    async describe() {
      return { backend: 'fixture', name: 'xangiの既定AI' };
    },
    async create(agentId, automation) {
      this.creates.push({ agentId, automation });
      return 'fixture-session-' + this.creates.length;
    },
    async send(id, prompt) {
      this.prompts.push({ id, prompt });
    },
    close() {},
    ...changes,
  };
}
export async function setup(t, host = mockHost()) {
  const workspace = await mkdtemp(join(tmpdir(), 'report-test-'));
  const app = await createApp({ workspace, dir: join(workspace, 'data'), token, host });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  async function call(path, body, method, headers = {}) {
    const res = await fetch(base + path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = res.headers.get('content-type')?.startsWith('application/json')
      ? await res.json()
      : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  t?.after(async () => {
    await app.close();
    await rm(workspace, { recursive: true, force: true });
  });
  return { workspace, app, base, call, host };
}
export async function eventually(fn) {
  for (let i = 0; i < 150; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Condition not reached');
}
export const saving = {
  saveMode: 'manual',
  saveAgentId: '',
  saveSkillName: 'xangi-report-save',
  notionDestination: 'https://www.notion.so/' + '1'.repeat(32),
};
export function callback(app, id) {
  const save = app.store.report(id).saves.at(-1);
  return {
    requestId: save.requestId,
    sessionId: save.sessionId,
    revision: save.revision,
    callbackToken: save.callbackToken,
    status: 'saved',
    pageUrl: 'https://www.notion.so/' + '2'.repeat(32),
    summary: '本文を保存し読み戻して照合',
    verified: true,
  };
}
