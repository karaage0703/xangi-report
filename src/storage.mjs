import { mkdir, readFile, writeFile, rename, open, unlink, realpath } from 'node:fs/promises';
import { join, resolve, isAbsolute, relative, sep } from 'node:path';
import { root, loadConfig, environmentFor } from './config.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { requireValue, text, onlyKeys } from './errors.mjs';
import * as html from './formats/html.mjs';
import { classification } from './classification.mjs';
import { listReports } from './listing.mjs';
export const pendingStatuses = new Set([
  'queued',
  'creating',
  'sending',
  'requested',
  'needs_input',
  'uncertain',
]);
export async function storageDirectory(workspace, env, config) {
  config ||= await loadConfig();
  const mapped = environmentFor(config, env);
  const instance = createHash('sha256')
    .update(env.XANGI_EXTENSION_INSTANCE_ID || 'default')
    .digest('hex')
    .slice(0, 16);
  const dir =
    env.EXTENSION_DATA_DIR ||
    mapped.EXTENSION_DATA_DIR ||
    resolve(workspace, '.' + config.id, instance);
  if (!isAbsolute(dir)) throw new Error('The ID-specific DATA_DIR must be absolute.');
  const source = await realpath(root);
  const outside = (value) => {
    const rel = relative(source, value);
    return rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel);
  };
  if (!outside(resolve(dir)))
    throw new Error('Data must be outside the replaceable source directory.');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (!outside(await realpath(dir))) throw new Error('Data must not resolve into source.');
  return dir;
}
export const defaultSettings = {
  saveMode: 'off',
  saveAgentId: '',
  saveSkillName: 'xangi-report-save',
  notionDestination: '',
};
const clone = (value) => structuredClone(value);
const stamp = () => new Date().toISOString();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateSettings(input) {
  onlyKeys(input, Object.keys(defaultSettings));
  requireValue(['off', 'manual', 'auto'].includes(input.saveMode), '保存モードが不正です');
  text(input.saveAgentId, '担当AI', 200);
  requireValue(
    typeof input.saveSkillName === 'string' &&
      /^[a-z0-9][a-z0-9-]{0,63}$/.test(input.saveSkillName),
    '保存スキル名が不正です',
  );
  text(input.notionDestination, 'Notion保存先', 2000);
  requireValue(
    input.saveMode === 'off' || input.notionDestination.trim(),
    'Notion保存先を指定してください',
  );
  return clone(input);
}
function artifact(input, revision) {
  requireValue((input.format ?? 'html') === 'html', '初版の対応形式はHTMLです', 415);
  return {
    revision,
    format: html.format,
    mediaType: html.mediaType,
    content: html.validate(input.content),
    title: text(input.title, 'タイトル', 200, true),
    project: text(input.project ?? '', '案件', 100),
    sourceNotes: text(input.sourceNotes ?? '', '出典', 16000),
    created: stamp(),
  };
}
function validateState(state) {
  if (state?.schemaVersion !== 2 || !Array.isArray(state.reports))
    throw new Error('Invalid schema');
  validateSettings(state.settings);
  const ids = new Set(),
    requests = new Set();
  for (const r of state.reports) {
    if (!uuid.test(r.id) || ids.has(r.id)) throw new Error('Invalid report identity');
    ids.add(r.id);
    text(r.title, 'タイトル', 200, true);
    text(r.project, '案件', 100);
    text(r.sourceNotes, '出典', 16000);
    if (
      r.origin &&
      (r.origin.kind !== 'xangi-artifact' ||
        typeof r.origin.identity !== 'string' ||
        typeof r.origin.path !== 'string' ||
        !/^[0-9a-f]{64}$/.test(r.origin.sha256) ||
        !Number.isSafeInteger(r.origin.revision) ||
        !r.versions?.[r.origin.revision - 1])
    )
      throw new Error('Invalid import origin');
    const normalized = classification(r);
    if (
      normalized.category !== r.category ||
      JSON.stringify(normalized.tags) !== JSON.stringify(r.tags) ||
      !Number.isSafeInteger(r.classificationRevision) ||
      r.classificationRevision < 1
    )
      throw new Error('Invalid classification');
    if (
      typeof r.starred !== 'boolean' ||
      (r.archived !== undefined && typeof r.archived !== 'boolean') ||
      !Array.isArray(r.versions) ||
      !r.versions.length ||
      !Array.isArray(r.saves)
    )
      throw new Error('Invalid report');
    for (const [i, a] of r.versions.entries()) {
      if (
        a.revision !== i + 1 ||
        a.format !== 'html' ||
        a.mediaType !== html.mediaType ||
        !Number.isFinite(Date.parse(a.created))
      )
        throw new Error('Invalid version');
      text(a.title, 'タイトル', 200, true);
      text(a.project, '案件', 100);
      text(a.sourceNotes, '出典', 16000);
      html.validate(a.content);
    }
    for (const s of r.saves) {
      if (
        !uuid.test(s.requestId) ||
        requests.has(s.requestId) ||
        !Number.isSafeInteger(s.revision) ||
        !r.versions[s.revision - 1] ||
        ![
          'queued',
          'creating',
          'sending',
          'requested',
          'needs_input',
          'uncertain',
          'saved',
          'partial',
          'error',
        ].includes(s.status) ||
        typeof s.callbackToken !== 'string' ||
        !/^[0-9a-f]{64}$/.test(s.callbackToken) ||
        typeof s.sessionId !== 'string'
      )
        throw new Error('Invalid save state');
      requests.add(s.requestId);
    }
  }
}
export function reportView(r, withContent = false) {
  const current = r.versions.at(-1);
  return {
    id: r.id,
    title: r.title,
    project: r.project,
    sourceNotes: r.sourceNotes,
    category: r.category,
    tags: clone(r.tags),
    classificationRevision: r.classificationRevision,
    origin: r.origin ? clone(r.origin) : null,
    starred: r.starred,
    archived: r.archived ?? false,
    created: r.created,
    updated: r.updated,
    revision: current.revision,
    format: current.format,
    versions: r.versions.map(({ content, ...a }) => a),
    saves: clone(r.saves),
    ...(withContent ? { content: current.content } : {}),
  };
}
export async function openStore(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lockPath = join(dir, 'writer.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // Do not steal incomplete locks or ones still owned by a live process.
    const pid = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error('Storage lock is incomplete; inspect it before recovery.');
    try {
      process.kill(pid, 0);
      throw new Error('Storage is already open.');
    } catch (check) {
      if (check.code !== 'ESRCH') throw check;
    }
    // Retrying crash recovery concurrently is deliberately not supported.
    await unlink(lockPath);
    lock = await open(lockPath, 'wx', 0o600);
  }
  await lock.writeFile(String(process.pid));
  const file = join(dir, 'state.json');
  let state;
  let migrationSource;
  try {
    try {
      const raw = await readFile(file, 'utf8');
      state = JSON.parse(raw);
      if (state?.schemaVersion === 1 && Array.isArray(state.reports)) {
        migrationSource = raw;
        state.schemaVersion = 2;
        for (const r of state.reports)
          Object.assign(r, { category: '', tags: [], classificationRevision: 1 });
      }
      validateState(state);
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw new Error('Stored state is invalid; restore a backup instead of resetting.', {
          cause: error,
        });
      state = { schemaVersion: 2, settings: clone(defaultSettings), reports: [] };
    }
  } catch (error) {
    await lock.close();
    await unlink(lockPath);
    throw error;
  }
  let tail = Promise.resolve();
  let closed = false;
  async function transact(fn) {
    if (closed) throw new Error('Storage is closed.');
    const operation = tail.then(async () => {
      const next = clone(state);
      const result = fn(next);
      const temp = file + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temp, JSON.stringify(next) + '\n', { mode: 0o600 });
        await rename(temp, file);
      } finally {
        await unlink(temp).catch(() => {});
      }
      state = next;
      return clone(result);
    });
    tail = operation.catch(() => {});
    return operation;
  }
  function get(state, id) {
    const r = state.reports.find((r) => r.id === id);
    requireValue(r, 'レポートが見つかりません', 404);
    return r;
  }
  const store = {
    dir,
    snapshot: () => clone(state),
    transact,
    report: (id) => clone(get(state, id)),
    view: (id, withContent) => reportView(get(state, id), withContent),
    version: (id, revision) => clone(get(state, id).versions[revision - 1]),
    list: (params = new URLSearchParams('archive=all')) =>
      listReports(state.reports, params).map((r) => reportView(r)),
    settings: () => clone(state.settings),
    setSettings: (input) => transact((s) => (s.settings = validateSettings(input))),
    create: (input, origin = null) =>
      transact((s) => {
        onlyKeys(input, [
          'title',
          'project',
          'sourceNotes',
          'format',
          'content',
          'category',
          'tags',
        ]);
        if (origin) {
          const existing = s.reports.find(
            (r) => r.origin?.identity === origin.identity && r.origin?.sha256 === origin.sha256,
          );
          if (existing)
            return {
              ...reportView(existing, true),
              duplicate: true,
              importedRevision: existing.origin.revision,
            };
        }
        const r = {
          id: randomUUID(),
          title: text(input.title, 'タイトル', 200, true),
          project: text(input.project ?? '', '案件', 100),
          sourceNotes: text(input.sourceNotes ?? '', '出典', 16000),
          ...classification(input),
          classificationRevision: 1,
          ...(origin ? { origin: { ...origin, revision: 1 } } : {}),
          starred: false,
          archived: false,
          created: stamp(),
          updated: stamp(),
          versions: [artifact(input, 1)],
          saves: [],
        };
        s.reports.push(r);
        return reportView(r, true);
      }),
    update: (id, input) =>
      transact((s) => {
        onlyKeys(input, [
          'title',
          'project',
          'sourceNotes',
          'format',
          'content',
          'expectedRevision',
        ]);
        const r = get(s, id);
        requireValue(
          input.expectedRevision === r.versions.length,
          '別の更新があります。再読込してください',
          409,
        );
        const a = artifact(input, r.versions.length + 1);
        r.title = text(input.title, 'タイトル', 200, true);
        r.project = text(input.project ?? '', '案件', 100);
        r.sourceNotes = text(input.sourceNotes ?? '', '出典', 16000);
        r.versions.push(a);
        r.updated = stamp();
        return reportView(r, true);
      }),
    star: (id, input) =>
      transact((s) => {
        onlyKeys(input, ['starred']);
        requireValue(typeof input.starred === 'boolean', 'starredが不正です');
        const r = get(s, id);
        r.starred = input.starred;
        return reportView(r);
      }),
    archive: (id, input) =>
      transact((s) => {
        onlyKeys(input, ['archived', 'expectedArchived']);
        requireValue(
          typeof input.archived === 'boolean' && typeof input.expectedArchived === 'boolean',
          'アーカイブ状態が不正です',
        );
        const r = get(s, id);
        requireValue(
          (r.archived ?? false) === input.expectedArchived,
          'アーカイブ状態が更新されています。再読込してください',
          409,
        );
        r.archived = input.archived;
        return reportView(r);
      }),
    classify: (id, input) =>
      transact((s) => {
        onlyKeys(input, ['category', 'tags', 'expectedClassificationRevision']);
        const r = get(s, id);
        requireValue(
          input.expectedClassificationRevision === r.classificationRevision,
          '分類が更新されています。再読込してください',
          409,
        );
        requireValue(r.classificationRevision < Number.MAX_SAFE_INTEGER, '分類の更新上限です', 409);
        Object.assign(r, classification(input));
        r.classificationRevision++;
        r.updated = stamp();
        return reportView(r);
      }),
    async close() {
      closed = true;
      await tail;
      await lock.close();
      await unlink(lockPath);
    },
  };
  if (migrationSource !== undefined) {
    try {
      const digest = createHash('sha256').update(migrationSource).digest('hex');
      const backup = join(dir, 'state.schema-1.' + digest + '.json');
      try {
        await writeFile(backup, migrationSource, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code !== 'EEXIST' || (await readFile(backup, 'utf8')) !== migrationSource)
          throw error;
      }
      await transact(() => null);
    } catch (error) {
      await store.close();
      throw error;
    }
  }
  // A queued/sending operation is never replayed after a restart: delivery may
  // have happened before its durable acknowledgement.
  if (
    state.reports.some((r) =>
      r.saves.some((s) => ['queued', 'creating', 'sending'].includes(s.status)),
    )
  ) {
    await transact((s) => {
      for (const r of s.reports)
        for (const save of r.saves)
          if (['queued', 'creating', 'sending'].includes(save.status)) {
            save.status = 'uncertain';
            save.error = '再起動前の送信結果を保存用会話で確認してください';
          }
    });
  }
  return store;
}
