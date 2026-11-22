import { resolve } from 'node:path';
import { createApp } from './server.mjs';
import { storageDirectory } from './storage.mjs';
import { loadConfig, environmentFor } from './config.mjs';
if (
  process.argv.length !== 5 ||
  process.argv[2] !== 'serve' ||
  process.argv[3] !== '--workspace' ||
  !process.argv[4]
) {
  throw new Error('Start through xangi with serve --workspace PATH.');
}
const workspace = resolve(process.argv[4]);
const config = await loadConfig();
const app = await createApp({
  config,
  env: environmentFor(config, process.env),
  dir: await storageDirectory(workspace, process.env, config),
  workspace,
  token: process.env.XANGI_EXTENSION_AUTH_TOKEN,
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await app.close();
  } catch {
    process.exitCode = 1;
  }
  process.stdin.pause();
}
process.stdin.resume();
process.stdin.on('end', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
app.server.listen(0, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      schemaVersion: 2,
      event: 'ready',
      id: config.id,
      workspace,
      baseUrl: 'http://127.0.0.1:' + app.server.address().port,
    }),
  ),
);
