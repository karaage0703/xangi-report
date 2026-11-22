import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function validateConfig(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !/^[a-z0-9](?:[a-z0-9.-]{0,55}[a-z0-9])?$/.test(value.id || '') ||
    typeof value.displayName !== 'string' ||
    !value.displayName.trim() ||
    value.displayName.length > 80 ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version || '') ||
    !value.features ||
    typeof value.features !== 'object' ||
    Array.isArray(value.features) ||
    Object.keys(value.features).some((key) => !['ui', 'device', 'ai'].includes(key)) ||
    ['ui', 'device', 'ai'].some((key) => typeof value.features[key] !== 'boolean')
  ) {
    throw new Error(
      'Invalid extension config: use a 1-57 character lowercase id, name, version, and boolean ui/device/ai features.',
    );
  }
  if (value.features.device)
    throw new Error('Report does not implement device ingress. Use ui, ai, or none.');
  return value;
}

export async function loadConfig(root = new URL('../', import.meta.url)) {
  return validateConfig(JSON.parse(await readFile(new URL('extension.config.json', root), 'utf8')));
}

export function envPrefix(config) {
  // IDs cannot contain underscores, so these substitutions are unambiguous.
  return `XANGI_${config.id.toUpperCase().replaceAll('-', '_DASH_').replaceAll('.', '_DOT_')}`;
}

export function environmentFor(config, env) {
  const prefix = envPrefix(config);
  const canonical = env[`${prefix}_DATA_DIR`];
  const legacy = config.id === 'xangi-report' ? env.XANGI_REPORT_DATA_DIR : undefined;
  if (canonical && legacy && canonical !== legacy)
    throw new Error('Conflicting canonical and legacy DATA_DIR settings.');
  return {
    XANGI_EXTENSION_INSTANCE_ID: env.XANGI_EXTENSION_INSTANCE_ID,
    XANGI_EXTENSION_AUTH_TOKEN: env.XANGI_EXTENSION_AUTH_TOKEN,
    XANGI_EXTENSION_HOST_URL: env.XANGI_EXTENSION_HOST_URL,
    XANGI_TOKEN: env.XANGI_TOKEN,
    EXTENSION_DATA_DIR: canonical || legacy,
  };
}

export function manifestFor(config) {
  validateConfig(config);
  const capability = `${config.id}.manage`;
  return {
    schemaVersion: 2,
    id: config.id,
    displayName: config.displayName,
    version: config.version,
    entrypoint: 'scripts/xangi-extension',
    runtime: { kind: 'managed-http' },
    setup: { instructions: 'XANGI_SETUP.md' },
    update: { prepare: { command: './scripts/prepare-update', args: [] } },
    permissions: [
      'Store report snapshots in workspace-scoped persistent storage',
      ...(config.features.ai
        ? ['Send reports to the configured saving AI and Notion only when enabled or requested']
        : []),
    ],
    capabilities: [{ id: capability, protocol: 'http', healthPath: '/health' }],
    ...(config.features.ui ? { ui: { capability, path: '/ui' } } : {}),
  };
}
