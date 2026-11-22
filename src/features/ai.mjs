// Host contract follows xangi's managed extension template and session/chat API.
export function hostClient(env, request = fetch) {
  const raw = env.XANGI_EXTENSION_HOST_URL;
  let origin = '';
  if (raw) {
    const u = new URL(raw);
    if (
      !['http:', 'https:'].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== '/'
    )
      throw new Error('Host URL must be an HTTP(S) origin.');
    origin = u.origin;
  }
  const active = new Set();
  async function call(path, body) {
    if (!origin) throw new Error('Parent xangi host is not configured.');
    const controller = new AbortController();
    active.add(controller);
    try {
      const res = await request(origin + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          ...(env.XANGI_TOKEN ? { Authorization: 'Bearer ' + env.XANGI_TOKEN } : {}),
        },
        redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) {
        await res.body?.cancel();
        const error = new Error('xangi request failed (' + res.status + ').');
        error.hostStatus = res.status;
        throw error;
      }
      return res;
    } finally {
      active.delete(controller);
    }
  }
  return {
    configured: !!origin,
    destination: origin,
    async artifact(source, limit) {
      const params = new URLSearchParams({ path: source.path });
      if (source.workspaceId) params.set('workspaceId', source.workspaceId);
      if (source.sessionId) {
        params.set('sessionId', source.sessionId);
        params.set('mode', 'raw');
      }
      const response = await call(
        (source.sessionId ? '/api/session-attachment' : '/api/artifact-preview') + '?' + params,
      );
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Host returned no artifact.');
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > limit) {
            const error = new Error('HTMLは2 MiBまでです');
            error.status = 413;
            throw error;
          }
          chunks.push(chunk.value);
        }
        try {
          return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
            Buffer.concat(chunks),
          );
        } catch {
          const error = new Error('UTF-8のHTMLを指定してください');
          error.status = 400;
          throw error;
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    },
    async agents() {
      const res = await call('/api/agents');
      return (await res.json()).agents || [];
    },
    async describe() {
      const res = await call('/api/runtime-settings');
      const value = (await res.json()).backend?.value;
      if (!value?.backend) throw new Error('Host default agent is unavailable.');
      return { name: 'xangiの既定AI', backend: value.backend, model: value.model || '' };
    },
    async create(agentId, automation) {
      const res = await call('/api/sessions', {
        projectId: null,
        ...(agentId ? { agentId } : {}),
        ...(automation ? { executionOrigin: 'automation' } : {}),
      });
      const id = (await res.json()).sessionId;
      if (typeof id !== 'string' || !id || id.length > 200)
        throw new Error('Invalid session ID from xangi.');
      return id;
    },
    async send(sessionId, message) {
      // xangi accepts a turn before SSE. Keep the session for questions and
      // recovery; cancelling the response stream does not cancel the host turn.
      const res = await call('/api/chat', { appSessionId: sessionId, message });
      await res.body?.cancel();
    },
    close() {
      for (const controller of active) controller.abort();
    },
  };
}
