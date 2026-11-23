import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openStore } from './storage.mjs';
import { createSaves, publicSave } from './saves.mjs';
import { hostClient } from './features/ai.mjs';
import { requireValue, HttpError } from './errors.mjs';
import { viewingCsp, presentation } from './formats/html.mjs';
import { root, loadConfig, validateConfig } from './config.mjs';
import { previewArtifact, importArtifact } from './imports.mjs';
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/ui': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};
const uiCsp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'";
function safeReport(view) {
  return { ...view, saves: view.saves.map(publicSave) };
}
async function readBody(req) {
  requireValue(
    /^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''),
    'application/jsonを使ってください',
    415,
  );
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    requireValue(bytes <= 4 * 1024 * 1024, 'リクエストが大きすぎます', 413);
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSONが不正です');
  }
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    'JSONオブジェクトを指定してください',
  );
  return value;
}
export async function createApp({
  dir,
  workspace,
  token,
  env = process.env,
  config,
  host = hostClient(env),
}) {
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('Managed authentication token (32+ characters) is required.');
  config ||= await loadConfig();
  validateConfig(config);
  const ui = config.features.ui ? await (await import('./features/ui.mjs')).renderUi(config) : null;
  const store = await openStore(dir),
    saves = createSaves(store, host, workspace, config);
  const expected = Buffer.from('Bearer ' + token);
  const server = createServer(async (req, res) => {
    function send(status, value, type = 'application/json; charset=utf-8', extra = {}) {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        ...extra,
      });
      res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
    }
    const supplied = Buffer.from(String(req.headers.authorization || ''));
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      send(401, { error: 'Unauthorized' });
      return;
    }
    // Prevent authenticated browser requests from an unrelated website.
    if (
      req.headers.origin &&
      req.headers.origin !== 'http://' + req.headers.host &&
      req.headers.origin !== 'https://' + req.headers.host
    ) {
      send(403, { error: 'Originが一致しません' });
      return;
    }
    try {
      const url = new URL(req.url, 'http://localhost'),
        path = url.pathname,
        method = req.method;
      if (method === 'GET' && path === '/health') return send(200, { ready: true });
      if (config.features.ui && method === 'GET' && Object.hasOwn(staticFiles, path)) {
        const [file, type] = staticFiles[path];
        if (file === 'index.html') {
          return send(200, ui.html, type, { 'Content-Security-Policy': ui.csp });
        }
        return send(200, await readFile(join(root, 'public', file)), type, {
          'Content-Security-Policy': uiCsp,
        });
      }
      if (method === 'GET' && path === '/api/settings')
        return send(200, {
          ...store.settings(),
          ...(!config.features.ai
            ? { configuredSaveMode: store.settings().saveMode, saveMode: 'off' }
            : {}),
          aiEnabled: config.features.ai,
          hostConfigured: host.configured,
          hostDestination: host.destination,
        });
      if (method === 'POST' && path === '/api/imports/preview')
        return send(200, await previewArtifact(host, await readBody(req)));
      if (method === 'POST' && path === '/api/imports/artifact') {
        const imported = await importArtifact(store, host, await readBody(req));
        if (!imported.duplicate) await saves.auto(imported.id, imported.revision);
        return send(imported.duplicate ? 200 : 201, {
          ...safeReport(store.view(imported.id, true)),
          duplicate: !!imported.duplicate,
          importedRevision: imported.importedRevision || 1,
        });
      }
      if (method === 'PUT' && path === '/api/settings') {
        const settings = await readBody(req);
        requireValue(
          config.features.ai || settings.saveMode === 'off',
          'この構成ではAI保存は無効です',
        );
        return send(200, await store.setSettings(settings));
      }
      if (method === 'GET' && path === '/api/agents') {
        if (!host.configured || !config.features.ai)
          return send(200, { agents: [], defaultAgent: null, configured: false });
        return send(200, {
          agents: (await host.agents()).map((a) => ({
            id: a.id,
            name: a.name,
            available: a.available !== false,
          })),
          defaultAgent: await host.describe(),
          configured: true,
        });
      }
      if (method === 'GET' && path === '/api/reports') {
        return send(200, {
          reports: store.list(url.searchParams).map(safeReport),
        });
      }
      if (method === 'POST' && path === '/api/reports') {
        const r = await store.create(await readBody(req));
        await saves.auto(r.id, r.revision);
        return send(201, safeReport(store.view(r.id, true)));
      }
      const match = path.match(/^\/api\/reports\/([0-9a-f-]{36})(?:\/(.*))?$/i);
      if (match) {
        const [, id, action = ''] = match;
        if (method === 'GET' && action === '')
          return send(200, safeReport(store.view(id, url.searchParams.get('content') !== '0')));
        if (method === 'PUT' && action === '') {
          const r = await store.update(id, await readBody(req));
          await saves.auto(id, r.revision);
          return send(200, safeReport(store.view(id, true)));
        }
        if (method === 'PATCH' && action === '') {
          await store.star(id, await readBody(req));
          return send(200, safeReport(store.view(id)));
        }
        if (method === 'POST' && action === 'save')
          return send(202, await saves.request(id, await readBody(req)));
        if (method === 'POST' && action === 'classification') {
          await store.classify(id, await readBody(req));
          return send(200, safeReport(store.view(id)));
        }
        if (method === 'POST' && action === 'archive') {
          await store.archive(id, await readBody(req));
          return send(200, safeReport(store.view(id)));
        }
        if (method === 'POST' && action === 'save-result')
          return send(200, await saves.report(id, await readBody(req)));
        const version = action.match(/^versions\/([1-9][0-9]*)(?:\/(view|download))?$/);
        if (method === 'GET' && version) {
          const artifact = store.version(id, Number(version[1]));
          requireValue(artifact, '版が見つかりません', 404);
          if (!version[2]) return send(200, { ...artifact, reportId: id });
          if (version[2] === 'download')
            return send(200, artifact.content, artifact.mediaType, {
              'Content-Disposition':
                'attachment; filename="report-' + id + '-v' + artifact.revision + '.html"',
            });
          return send(
            200,
            url.searchParams.get('presentation') === '1'
              ? presentation(artifact.content)
              : artifact.content,
            artifact.mediaType,
            {
              'Content-Security-Policy': viewingCsp,
            },
          );
        }
      }
      send(404, { error: '見つかりません' });
    } catch (error) {
      send(error.status || 500, {
        error: error.status
          ? error.message
          : '処理できませんでした。接続・保存先を確認してください',
      });
      if (!error.status) console.error('Request failed:', error.name);
    }
  });
  server.requestTimeout = 30000;
  return {
    server,
    store,
    async close() {
      await saves.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await store.close();
    },
  };
}
