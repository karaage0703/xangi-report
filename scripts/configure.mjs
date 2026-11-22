import { writeFile } from 'node:fs/promises';
import { envPrefix, loadConfig, manifestFor, validateConfig } from '../src/config.mjs';

const root = new URL('../', import.meta.url);
const config = await loadConfig(root);
const args = process.argv.slice(2),
  options = new Map();
for (let i = 0; i < args.length; i += 2) {
  const key = args[i],
    value = args[i + 1];
  if (!['--id', '--name', '--features'].includes(key) || value === undefined || options.has(key)) {
    throw new Error(
      'Usage: node scripts/configure.mjs [--id ID] [--name NAME] [--features ui,ai|none]',
    );
  }
  options.set(key, value);
}
if (options.has('--id')) config.id = options.get('--id');
if (options.has('--name')) config.displayName = options.get('--name');
if (options.has('--features')) {
  const features = options.get('--features') === 'none' ? [] : options.get('--features').split(',');
  if (
    features.some((key) => !['ui', 'ai'].includes(key)) ||
    new Set(features).size !== features.length
  ) {
    throw new Error('Report supports ui, ai, or none; device ingress is not implemented.');
  }
  config.features = Object.fromEntries(
    ['ui', 'device', 'ai'].map((key) => [key, features.includes(key)]),
  );
}
validateConfig(config);
const manifest = manifestFor(config);
await writeFile(new URL('extension.config.json', root), JSON.stringify(config, null, 2) + '\n');
await writeFile(new URL('xangi-extension.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Configured ${config.id}: ${
    Object.keys(config.features)
      .filter((key) => config.features[key])
      .join(', ') || 'base only'
  }`,
);

console.log('Environment prefix: ' + envPrefix(config));
