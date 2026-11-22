import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { renderUi } from '../src/features/ui.mjs';
import { loadConfig } from '../src/config.mjs';

test('configured display name is escaped in document, heading and main label', async () => {
  const rendered = await renderUi({ ...(await loadConfig()), displayName: '検証 & <Report>' });
  assert.ok(rendered.html.includes('<title>検証 &amp; &lt;Report&gt;</title>'));
  assert.ok(rendered.html.includes('<h1>検証 &amp; &lt;Report&gt;</h1>'));
  assert.ok(rendered.html.includes('aria-label="検証 &amp; &lt;Report&gt;"'));
});

test('host UI embeds trusted assets and its direct response authorizes their exact hashes', async () => {
  const rendered = await renderUi();
  assert.doesNotMatch(rendered.html, /<script[^>]+src=|<link[^>]+href="style\.css"/);
  const style = rendered.html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const script = rendered.html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.equal(
    style,
    '\n' + (await readFile(new URL('../public/style.css', import.meta.url), 'utf8')) + '\n',
  );
  assert.equal(
    script,
    '\n' + (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')) + '\n',
  );
  for (const body of [style, script]) {
    assert.ok(
      rendered.csp.includes("'sha256-" + createHash('sha256').update(body).digest('base64') + "'"),
    );
  }
  assert.doesNotMatch(rendered.csp, /unsafe-inline|unsafe-eval/);
});
