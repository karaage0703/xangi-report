import test from 'node:test';
import assert from 'node:assert/strict';
import { hostClient } from '../src/features/ai.mjs';

test('parent host uses host token and host default session selection, never managed token', async () => {
  const calls = [];
  const client = hostClient(
    {
      XANGI_EXTENSION_HOST_URL: 'http://host.example.test',
      XANGI_TOKEN: 'fixture-host',
      XANGI_EXTENSION_AUTH_TOKEN: 'fixture-service',
    },
    async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify(
          url.endsWith('/api/sessions')
            ? { sessionId: 'session' }
            : { backend: { value: { backend: 'fixture' } } },
        ),
      );
    },
  );
  await client.describe();
  await client.create('', true);
  await client.send('session', 'save report');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-host');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    projectId: null,
    executionOrigin: 'automation',
  });
  assert.equal(calls[2].url, 'http://host.example.test/api/chat');
  assert.equal(
    calls.some((x) => JSON.stringify(x).includes('fixture-service')),
    false,
  );
  assert.throws(() =>
    hostClient({ XANGI_EXTENSION_HOST_URL: 'https://user:secret@other.example.test/path' }),
  );
  assert.equal(hostClient({}).configured, false);
});

test('host errors do not produce a successful request or retry', async () => {
  let calls = 0;
  const client = hostClient({ XANGI_EXTENSION_HOST_URL: 'http://host.example.test' }, async () => {
    calls++;
    return new Response('', { status: 503 });
  });
  await assert.rejects(client.send('session', 'hello'), /503/);
  assert.equal(calls, 1);
});
