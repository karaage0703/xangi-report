import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { requireValue, text, onlyKeys, HttpError } from './errors.mjs';
import { maxBytes, validate } from './formats/html.mjs';

export function artifactSource(input) {
  const path = text(input.path, 'アーティファクトのパス', 4000, true);
  requireValue(
    /\.html?$/i.test(path) && !path.includes('\0') && !/^[a-z]+:\/\//i.test(path),
    'HTMLファイルのパスを指定してください',
  );
  const workspaceId = text(input.workspaceId ?? '', 'workspace ID', 200);
  const sessionId = text(input.sessionId ?? '', '会話ID', 200);
  requireValue(!workspaceId || !sessionId, 'workspace IDと会話IDはどちらか一方を指定してください');
  return { path: posix.normalize(path), workspaceId, sessionId };
}
export async function previewArtifact(host, input) {
  onlyKeys(input, ['path', 'workspaceId', 'sessionId']);
  const source = artifactSource(input);
  requireValue(host.configured, '親xangiへの接続が未設定です', 503);
  let content;
  try {
    content = await host.artifact(source, maxBytes);
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(
      [403, 404].includes(error.hostStatus) ? error.hostStatus : 502,
      'アーティファクトを取得できません。パス・workspace・会話と閲覧権限を確認してください',
    );
  }
  validate(content);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const title =
    (content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || posix.basename(source.path))
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, 200) || '取り込んだレポート';
  return { ...source, content, title, sha256 };
}
export async function importArtifact(store, host, input) {
  onlyKeys(input, [
    'path',
    'workspaceId',
    'sessionId',
    'expectedSha256',
    'title',
    'project',
    'sourceNotes',
    'category',
    'tags',
  ]);
  requireValue(
    typeof input.expectedSha256 === 'string' && /^[0-9a-f]{64}$/.test(input.expectedSha256),
    '取り込み前に内容を確認してください',
  );
  const preview = await previewArtifact(host, artifactSource(input));
  requireValue(
    preview.sha256 === input.expectedSha256,
    '元ファイルが変わりました。もう一度内容を確認してください',
    409,
  );
  const identity = JSON.stringify([
    preview.sessionId ? 'session' : 'workspace',
    preview.sessionId || preview.workspaceId,
    preview.path,
  ]);
  return store.create(
    {
      title: input.title ?? preview.title,
      content: preview.content,
      project: input.project ?? '',
      sourceNotes: input.sourceNotes ?? '',
      category: input.category ?? '',
      tags: input.tags ?? [],
    },
    {
      kind: 'xangi-artifact',
      identity,
      path: preview.path,
      workspaceId: preview.workspaceId,
      sessionId: preview.sessionId,
      sha256: preview.sha256,
    },
  );
}
