// Loopback-only disposable proxy fixture; does not register with a live xangi.
import { createServer, request } from 'node:http';
import { rm } from 'node:fs/promises';
import { setup, token, mockHost } from './helpers.mjs';
const { app, workspace, base } = await setup(
  null,
  mockHost({
    async artifact(source) {
      if (source.path !== 'fixtures/old.html') throw new Error('Missing fixture');
      return '<!doctype html><html lang="ja"><meta charset="utf-8"><title>過去の検証レポート</title><button onclick="this.textContent=42">インポートを確認</button></html>';
    },
  }),
);
let probes = 0;
const prefix = '/api/extensions/xangi-report/service';
const proxy = createServer(async (req, res) => {
  if (req.url === '/probe') {
    probes++;
    res.writeHead(200);
    res.end('probe');
    return;
  }
  if (req.url === '/probes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ probes }));
    return;
  }
  if (req.url === '/api/extensions/xangi-report/ui') {
    const response = await fetch(base + '/ui', { headers: { Authorization: 'Bearer ' + token } });
    const body = (await response.text()).replace('<head>', '<head><base href="./service/">');
    res.writeHead(response.status, {
      'Content-Type': 'text/html',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    });
    res.end(body);
    return;
  }
  if (!req.url.startsWith(prefix + '/')) {
    res.writeHead(404);
    res.end();
    return;
  }
  const upstream = request(
    base + req.url.slice(prefix.length),
    {
      method: req.method,
      headers: {
        authorization: 'Bearer ' + token,
        origin: base,
        ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
      },
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});
await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
console.log(JSON.stringify({ base: 'http://127.0.0.1:' + proxy.address().port }));
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  proxy.closeAllConnections();
  await new Promise((resolve) => proxy.close(resolve));
  await app.close();
  await rm(workspace, { recursive: true, force: true });
  process.stdin.pause();
}
process.stdin.resume();
process.stdin.on('end', close);
process.on('SIGTERM', close);
process.on('SIGINT', close);
