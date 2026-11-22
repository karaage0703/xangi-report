import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { root, loadConfig } from '../config.mjs';

// The host's /ui route only allows inline style/scripts. Keep authoring assets
// separate, then embed trusted application resources at startup. Report HTML is
// never passed through this renderer and retains its own sandbox response.
export async function renderUi(config) {
  config ||= await loadConfig();
  const [template, css, javascript] = await Promise.all(
    ['index.html', 'style.css', 'app.js'].map((file) =>
      readFile(join(root, 'public', file), 'utf8'),
    ),
  );
  const style = '\n' + css + '\n';
  const script = '\n' + javascript + '\n';
  if (/<\/style/i.test(style) || /<\/script/i.test(script)) {
    throw new Error('Inline application assets must not contain closing element tags.');
  }
  const hash = (body) => "'sha256-" + createHash('sha256').update(body).digest('base64') + "'";
  const name = config.displayName
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return {
    html: template
      .replace('<title>xangi-report</title>', () => '<title>' + name + '</title>')
      .replace('<h1>xangi-report</h1>', () => '<h1>' + name + '</h1>')
      .replace('<main class="layout"', () => '<main aria-label="' + name + '" class="layout"')
      .replace(
        /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/,
        () => '<style>' + style + '</style>',
      )
      .replace(
        /<script\s+type="module"\s+src="app\.js"><\/script>/,
        () => '<script type="module">' + script + '</script>',
      ),
    csp:
      "default-src 'none'; script-src " +
      hash(script) +
      '; style-src ' +
      hash(style) +
      "; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'",
  };
}
