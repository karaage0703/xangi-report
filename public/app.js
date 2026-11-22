const $ = (id) => document.getElementById(id);
const statuses = {
  queued: '保存待ち',
  creating: '保存用会話を準備中',
  sending: '保存AIへ送信中',
  requested: '保存AIへ依頼済み',
  saved: '保存完了',
  partial: '一部保存',
  needs_input: '回答待ち',
  error: '保存できませんでした',
  uncertain: '保存結果を確認してください',
};
let reports = [],
  current = null,
  settings = null,
  editing = null,
  loadNumber = 0,
  refreshing = false;
let imported = null,
  classifying = null,
  importGeneration = 0;
const tagsFrom = (value) =>
  value
    .split(/[,、]/)
    .map((x) => x.trim())
    .filter(Boolean);
function filterOptions(id, values) {
  const selected = $(id).value;
  $(id).replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'すべて';
  $(id).append(all);
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent =
      id === 'category-filter'
        ? value === '__uncategorized__'
          ? '未分類'
          : value.slice(9)
        : value;
    $(id).append(option);
  }
  $(id).value = values.includes(selected) ? selected : '';
}
function rememberFilters() {
  try {
    localStorage.setItem(
      'xangi-report-filters',
      JSON.stringify({
        category: $('category-filter').value,
        tag: $('tag-filter').value,
        archive: $('archive-filter').value,
        sort: $('sort').value,
      }),
    );
  } catch {}
}
const pending = new Set(['queued', 'creating', 'sending', 'requested', 'needs_input']);
const pane = { collapsed: false, width: null };
let lastReportId = null,
  resizePointer = null;
const wideLayout = matchMedia('(min-width: 761px)');
try {
  const saved = JSON.parse(localStorage.getItem('xangi-report-layout') || '{}');
  pane.collapsed = saved.collapsed === true;
  if (Number.isFinite(saved.width) && saved.width >= 220 && saved.width <= 1200)
    pane.width = saved.width;
} catch {}
function persistPane() {
  try {
    localStorage.setItem('xangi-report-layout', JSON.stringify(pane));
  } catch {}
}
function applyPane() {
  const layout = document.querySelector('.layout');
  const max = Math.max(220, Math.min(600, layout.clientWidth - 328));
  const width = Math.round(Math.max(220, Math.min(pane.width ?? 290, max)));
  layout.style.setProperty('--library-width', width + 'px');
  layout.classList.toggle('library-hidden', wideLayout.matches && pane.collapsed);
  $('library').hidden = wideLayout.matches && pane.collapsed;
  $('toggle-library').setAttribute(
    'aria-expanded',
    String(wideLayout.matches ? !pane.collapsed : !current),
  );
  $('toggle-library').disabled = !wideLayout.matches && !current && !lastReportId;
  $('resize-library').setAttribute('aria-valuemax', String(max));
  $('resize-library').setAttribute('aria-valuenow', String(width));
  $('resize-library').setAttribute('aria-valuetext', width + 'px');
}
function endResize(cancelled = false) {
  if (!resizePointer) return;
  const previous = resizePointer;
  resizePointer = null;
  if (cancelled) pane.width = previous.saved;
  else persistPane();
  document.body.classList.remove('resizing-library');
  if ($('resize-library').hasPointerCapture(previous.id))
    $('resize-library').releasePointerCapture(previous.id);
  applyPane();
}
$('toggle-library').onclick = () => {
  if (wideLayout.matches) {
    pane.collapsed = !pane.collapsed;
    persistPane();
    applyPane();
  } else navigate(current ? null : lastReportId);
};
$('close-library').onclick = () => {
  pane.collapsed = true;
  persistPane();
  applyPane();
  $('toggle-library').focus();
};
$('resize-library').addEventListener('pointerdown', (event) => {
  if (!wideLayout.matches || event.button !== 0 || !event.isPrimary) return;
  applyPane();
  resizePointer = {
    id: event.pointerId,
    x: event.clientX,
    width: Number($('resize-library').getAttribute('aria-valuenow')),
    saved: pane.width,
  };
  $('resize-library').setPointerCapture(event.pointerId);
  $('resize-library').focus({ preventScroll: true });
  document.body.classList.add('resizing-library');
  event.preventDefault();
});
$('resize-library').addEventListener('pointermove', (event) => {
  if (resizePointer?.id !== event.pointerId) return;
  pane.width = Math.max(
    220,
    Math.min(
      Number($('resize-library').getAttribute('aria-valuemax')),
      resizePointer.width + event.clientX - resizePointer.x,
    ),
  );
  applyPane();
});
$('resize-library').addEventListener('pointerup', () => endResize());
for (const name of ['pointercancel', 'lostpointercapture'])
  $('resize-library').addEventListener(name, () => endResize(true));
$('resize-library').addEventListener('dblclick', () => {
  pane.width = null;
  persistPane();
  applyPane();
});
$('resize-library').addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && resizePointer) {
    event.preventDefault();
    endResize(true);
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const min = 220,
    max = Number($('resize-library').getAttribute('aria-valuemax'));
  pane.width = Math.max(
    min,
    Math.min(
      max,
      event.key === 'Home'
        ? min
        : event.key === 'End'
          ? max
          : Number($('resize-library').getAttribute('aria-valuenow')) +
            (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10),
    ),
  );
  persistPane();
  applyPane();
});
new ResizeObserver(applyPane).observe(document.querySelector('.layout'));
wideLayout.addEventListener('change', () => {
  endResize(true);
  applyPane();
});
window.addEventListener('blur', () => endResize(true));
applyPane();
async function api(path, body, method) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method: method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '処理できませんでした');
  return data;
}
function notice(message = '') {
  $('notice').textContent = message;
}
function message(error) {
  notice(error.message);
}
function selection() {
  const params = new URLSearchParams(location.hash.slice(1));
  return { id: params.get('report'), revision: Number(params.get('revision')) || null };
}
function navigate(id, revision) {
  location.hash = id
    ? new URLSearchParams({ report: id, ...(revision ? { revision } : {}) }).toString()
    : '';
}
let reportSize = { width: 0, height: 0, minimumWidth: 0 };
let detailReportId = null;
function showReportDetails(open) {
  $('report-details').hidden = !open;
  $('details-button').setAttribute('aria-expanded', String(open));
}
function readingFocus(enabled) {
  document.body.classList.toggle('reading-focus', enabled);
  $('focus-button').setAttribute('aria-pressed', String(enabled));
  for (const attribute of ['aria-label', 'title'])
    $('focus-button').setAttribute(attribute, enabled ? '通常表示に戻す' : '表示を広げる');
  if (enabled) {
    showReportDetails(false);
    notice('');
  }
}
$('details-button').onclick = () => showReportDetails($('report-details').hidden);
$('focus-button').onclick = () => readingFocus(!document.body.classList.contains('reading-focus'));
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (!$('report-details').hidden) {
    showReportDetails(false);
    $('details-button').focus();
  } else if (document.body.classList.contains('reading-focus')) {
    readingFocus(false);
    $('focus-button').focus();
  }
});
function layoutReport() {
  const viewport = $('report-viewport');
  if (!current || !reportSize.width || !viewport.clientWidth) return;
  const mode = $('viewer-zoom').value;
  const scale =
    mode === 'width'
      ? Math.min(1, viewport.clientWidth / reportSize.width)
      : mode === 'page'
        ? Math.min(
            1,
            viewport.clientWidth / reportSize.width,
            viewport.clientHeight / reportSize.height,
          )
        : Number(mode);
  $('report-stage').style.width = Math.ceil(reportSize.width * scale) + 'px';
  $('report-stage').style.height = Math.ceil(reportSize.height * scale) + 'px';
  const frame = $('report-frame');
  frame.style.width = reportSize.width + 'px';
  frame.style.height = reportSize.height + 'px';
  frame.style.transform = 'scale(' + scale + ')';
  $('viewer-scale').value = Math.round(scale * 100) + '%';
}
function resetReportSize() {
  const viewport = $('report-viewport');
  reportSize = {
    width: Math.max(240, viewport.clientWidth),
    height: Math.max(240, viewport.clientHeight),
    minimumWidth: 0,
  };
  viewport.scrollTo(0, 0);
  layoutReport();
}
window.addEventListener('message', (event) => {
  const frame = $('report-frame'),
    size = event.data;
  if (
    !current ||
    event.source !== frame.contentWindow ||
    size?.type !== 'xangi-report-size' ||
    size.url !== frame.src ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < 1 ||
    size.height < 1
  )
    return;
  if (size.width > reportSize.width + 1)
    reportSize.minimumWidth = Math.min(12000, Math.ceil(size.width));
  reportSize.width = Math.max(240, Math.min(12000, Math.ceil(size.width)));
  reportSize.height = Math.max(240, Math.min(120000, Math.ceil(size.height)));
  layoutReport();
});
let viewportWidth = 0;
new ResizeObserver(() => {
  const width = $('report-viewport').clientWidth;
  if (width && width !== viewportWidth && current) {
    viewportWidth = width;
    reportSize.width = Math.max(240, width, reportSize.minimumWidth);
    reportSize.height = Math.max(240, $('report-viewport').clientHeight);
  }
  layoutReport();
}).observe($('report-viewport'));
$('viewer-zoom').onchange = () => {
  $('report-viewport').scrollTo(0, 0);
  layoutReport();
};
function drawList() {
  const categories = [...new Set(reports.map((r) => r.category).filter(Boolean))].sort();
  filterOptions('category-filter', [
    '__uncategorized__',
    ...categories.map((name) => 'category:' + name),
  ]);
  filterOptions('tag-filter', [...new Set(reports.flatMap((r) => r.tags))].sort());
  $('category-options').replaceChildren(
    ...categories.map((name) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    }),
  );
  const query = $('search').value.toLowerCase(),
    starred = $('starred').checked;
  const visible = reports.filter(
    (r) =>
      ($('archive-filter').value === 'all' ||
        r.archived === ($('archive-filter').value === 'archived')) &&
      (!starred || r.starred) &&
      (!$('category-filter').value ||
        ($('category-filter').value === '__uncategorized__'
          ? !r.category
          : r.category === $('category-filter').value.slice(9))) &&
      (!$('tag-filter').value || r.tags.includes($('tag-filter').value)) &&
      [r.title, r.project, r.category, ...r.tags].join(' ').toLowerCase().includes(query),
  );
  const filtered = starred || $('category-filter').value || $('tag-filter').value;
  const archive = $('archive-filter').selectedOptions[0].textContent;
  $('filter-state').textContent =
    (filtered ? '（絞り込み中）' : '') +
    ($('archive-filter').value !== 'active' ? '・' + archive : '');
  $('count').textContent = visible.length + '件';
  $('reports').replaceChildren();
  for (const r of visible) {
    const button = document.createElement('button');
    button.className = 'report-row';
    button.setAttribute('aria-current', String(r.id === current?.id));
    const title = document.createElement('strong');
    title.textContent = (r.starred ? '★ ' : '') + r.title + (r.archived ? '（アーカイブ）' : '');
    const meta = document.createElement('span');
    meta.textContent =
      (r.project ? r.project + ' / ' : '') +
      new Date(r.updated).toLocaleDateString('ja-JP') +
      ' / 第' +
      r.revision +
      '版';
    const classification = document.createElement('span');
    classification.textContent =
      (r.category || '未分類') +
      (r.tags.length ? ' / ' + r.tags.map((tag) => '#' + tag).join(' ') : '');
    button.append(title, meta, classification);
    button.onclick = () => navigate(r.id);
    $('reports').append(button);
  }
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = reports.length
      ? '一致するレポートがありません'
      : 'まだレポートはありません';
    $('reports').append(empty);
  }
}
function showSaves() {
  const panel = $('save-state');
  panel.replaceChildren();
  const save = current.saves.at(-1);
  $('save-button').disabled =
    settings?.saveMode === 'off' ||
    settings?.aiEnabled === false ||
    (save && pending.has(save.status));
  $('save-button').hidden = settings?.saveMode === 'off';
  if (!save) return;
  const text = document.createElement('span');
  text.textContent =
    '第' +
    save.revision +
    '版：' +
    statuses[save.status] +
    (save.summary ? ' — ' + save.summary : '') +
    (save.error ? ' — ' + save.error : '');
  panel.append(text);
  if (save.pageUrl) {
    const link = document.createElement('a');
    link.href = save.pageUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Notionを開く';
    panel.append(link);
  }
  if (save.sessionId) {
    const link = document.createElement('a');
    link.href = '/chat/' + encodeURIComponent(save.sessionId);
    link.target = '_top';
    link.textContent = '保存用会話を開く';
    panel.append(link);
  }
  if (save.status === 'uncertain') {
    const button = document.createElement('button');
    button.textContent = '結果確認後に再依頼';
    button.onclick = () => {
      if (
        confirm(
          '保存用会話とNotionを確認しましたか？結果不明のまま再依頼すると重複することがあります。確認済みの場合だけ続けてください。',
        )
      )
        saveCurrent(true);
    };
    panel.append(button);
    $('save-button').disabled = true;
  }
}
function drawDetail() {
  const pick = selection(),
    revision = pick.revision || current.revision;
  const artifact = current.versions.find((a) => a.revision === revision);
  if (!artifact) {
    notice('指定した版がありません');
    return;
  }
  document.querySelector('.layout').classList.add('reading');
  lastReportId = current.id;
  applyPane();
  $('empty').hidden = true;
  $('detail').hidden = false;
  $('report-title').textContent = current.title;
  $('report-title').title = current.title;
  $('report-full-title').textContent = current.title;
  if (detailReportId !== current.id) {
    detailReportId = current.id;
    showReportDetails(false);
  }
  $('report-classification').textContent =
    (current.category || '未分類') +
    (current.tags.length ? ' / ' + current.tags.map((tag) => '#' + tag).join(' ') : '');
  $('report-origin').textContent = current.origin ? '取込元：' + current.origin.path : '';
  $('report-meta').textContent =
    (current.project ? current.project + ' / ' : '') +
    '第' +
    revision +
    '版 / ' +
    new Date(artifact.created).toLocaleString('ja-JP');
  $('star-button').textContent = current.starred ? '★ スター済み' : '☆ スター';
  $('star-button').setAttribute('aria-pressed', String(current.starred));
  $('archive-button').textContent = current.archived ? 'アーカイブから戻す' : 'アーカイブ';
  $('archive-state').hidden = !current.archived;
  $('version').replaceChildren(
    ...[...current.versions].reverse().map((a) => {
      const option = document.createElement('option');
      option.value = a.revision;
      option.textContent = '第' + a.revision + '版';
      return option;
    }),
  );
  $('version').value = revision;
  const prefix = 'api/reports/' + current.id + '/versions/' + revision;
  const src = new URL(prefix + '/view?presentation=1', document.baseURI).href;
  if ($('report-frame').src !== src) {
    resetReportSize();
    $('report-frame').src = src;
  }
  $('download').href = prefix + '/download';
  showSaves();
  drawList();
}
async function select() {
  const seq = ++loadNumber,
    pick = selection();
  if (!pick.id) {
    readingFocus(false);
    showReportDetails(false);
    detailReportId = null;
    current = null;
    $('report-frame').removeAttribute('src');
    $('detail').hidden = true;
    $('empty').hidden = false;
    document.querySelector('.layout').classList.remove('reading');
    applyPane();
    drawList();
    return;
  }
  try {
    const data = await api('api/reports/' + encodeURIComponent(pick.id));
    if (seq !== loadNumber) return;
    current = data;
    drawDetail();
  } catch (error) {
    if (seq === loadNumber) {
      message(error);
      navigate(null);
    }
  }
}
async function refresh() {
  reports = (await api('api/reports?archive=all&sort=' + encodeURIComponent($('sort').value)))
    .reports;
  drawList();
}
function openEditor(report = null) {
  showReportDetails(false);
  editing = report;
  imported = null;
  $('editor-title').textContent = report ? 'レポートを更新' : 'HTMLを追加';
  $('report-form').reset();
  $('editor-error').textContent = '';
  $('title').value = report?.title || '';
  $('project').value = report?.project || '';
  $('source-notes').value = report?.sourceNotes || '';
  $('html-content').value = report?.content || '';
  $('html-content').readOnly = false;
  $('artifact-import').hidden = !!report;
  $('artifact-import').open = false;
  $('artifact-status').textContent = '';
  $('initial-classification').hidden = !!report;
  $('editor').showModal();
  $('title').focus();
}
async function saveCurrent(retryAfterCheck = false) {
  try {
    $('save-button').disabled = true;
    await api('api/reports/' + current.id + '/save', {
      requestId: crypto.randomUUID(),
      revision: selection().revision || current.revision,
      retryAfterCheck,
    });
    await select();
    notice('保存AIへの依頼を記録しました');
  } catch (error) {
    message(error);
    await select();
  }
}
$('new-button').onclick = () => openEditor();
$('empty-add').onclick = () => openEditor();
$('edit-button').onclick = () => openEditor(current);
$('back-button').onclick = () => navigate(null);
$('search').oninput = drawList;
$('starred').onchange = drawList;
for (const id of ['category-filter', 'tag-filter', 'archive-filter'])
  $(id).onchange = () => {
    rememberFilters();
    drawList();
  };
$('sort').onchange = async () => {
  rememberFilters();
  try {
    await refresh();
  } catch (error) {
    message(error);
  }
};
$('clear-filters').onclick = () => {
  $('category-filter').value = '';
  $('tag-filter').value = '';
  $('search').value = '';
  $('starred').checked = false;
  rememberFilters();
  drawList();
};
$('classify-button').onclick = () => {
  showReportDetails(false);
  classifying = { id: current.id, revision: current.classificationRevision };
  $('category').value = current.category;
  $('tags').value = current.tags.join(', ');
  $('classification-error').textContent = '';
  $('classification-dialog').showModal();
};
$('classification-form').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await api('api/reports/' + classifying.id + '/classification', {
      category: $('category').value,
      tags: tagsFrom($('tags').value),
      expectedClassificationRevision: classifying.revision,
    });
    $('classification-dialog').close();
    await refresh();
    await select();
    notice('分類を保存しました');
  } catch (error) {
    $('classification-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
function clearImport() {
  importGeneration++;
  imported = null;
  $('html-content').readOnly = false;
  $('artifact-status').textContent = '';
}
$('clear-artifact').onclick = () => {
  clearImport();
  $('artifact-path').value = '';
  $('artifact-workspace').value = '';
  $('artifact-session').value = '';
};
for (const id of ['artifact-path', 'artifact-workspace', 'artifact-session'])
  $(id).oninput = clearImport;
$('preview-artifact').onclick = async () => {
  const button = $('preview-artifact');
  button.disabled = true;
  clearImport();
  $('editor-error').textContent = '';
  const generation = importGeneration;
  try {
    let source = {
      path: $('artifact-path').value,
      workspaceId: $('artifact-workspace').value,
      sessionId: $('artifact-session').value,
    };
    if (
      /^https?:\/\//i.test(source.path) ||
      source.path.startsWith('/api/artifact-preview?') ||
      source.path.startsWith('/api/session-attachment?')
    ) {
      const url = new URL(source.path, location.origin);
      if (
        url.origin !== location.origin ||
        !['/api/artifact-preview', '/api/session-attachment'].includes(url.pathname)
      )
        throw new Error('このxangiのアーティファクトURLを指定してください');
      source = {
        path: url.searchParams.get('path') || '',
        workspaceId: url.searchParams.get('workspaceId') || '',
        sessionId: url.searchParams.get('sessionId') || '',
      };
    }
    const value = await api('api/imports/preview', source);
    if (generation !== importGeneration)
      throw new Error('取り込み指定が変わりました。もう一度内容を確認してください');
    imported = {
      path: value.path,
      workspaceId: value.workspaceId,
      sessionId: value.sessionId,
      expectedSha256: value.sha256,
    };
    $('title').value = value.title;
    $('html-content').value = value.content;
    $('html-content').readOnly = true;
    $('artifact-status').textContent =
      '原本を確認しました。保存するとコピーを取り込みます。取り込み後に本文を更新できます。';
  } catch (error) {
    $('editor-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$('version').onchange = () => navigate(current.id, Number($('version').value));
$('save-button').onclick = () => saveCurrent();
$('star-button').onclick = async () => {
  try {
    await api('api/reports/' + current.id, { starred: !current.starred }, 'PATCH');
    await refresh();
    await select();
  } catch (error) {
    message(error);
  }
};
$('archive-button').onclick = async () => {
  const button = $('archive-button'),
    report = current;
  button.disabled = true;
  try {
    await api('api/reports/' + report.id + '/archive', {
      archived: !report.archived,
      expectedArchived: report.archived,
    });
    await refresh();
    await select();
    notice(
      report.archived
        ? '通常の一覧に戻しました'
        : 'アーカイブしました。「表示」のアーカイブから戻せます',
    );
  } catch (error) {
    message(error);
  } finally {
    button.disabled = false;
  }
};
for (const button of document.querySelectorAll('[data-close]'))
  button.onclick = () => $(button.dataset.close).close();
$('html-file').onchange = async () => {
  const file = $('html-file').files[0];
  if (!file) return;
  $('clear-artifact').click();
  if (file.size > 2 * 1024 * 1024) {
    $('editor-error').textContent = 'HTMLは2 MiBまでです';
    return;
  }
  $('html-content').value = await file.text();
  if (!$('title').value) $('title').value = file.name.replace(/\.html?$/i, '');
};
$('report-form').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    if (!editing && $('artifact-path').value.trim() && !imported)
      throw new Error('取り込み元の内容を確認してください');
    const body = {
      title: $('title').value,
      project: $('project').value,
      sourceNotes: $('source-notes').value,
      content: $('html-content').value,
      ...(editing
        ? { expectedRevision: editing.revision }
        : { category: $('new-category').value, tags: tagsFrom($('new-tags').value) }),
    };
    if (imported) {
      delete body.content;
      Object.assign(body, imported);
    }
    const r = await api(
      imported ? 'api/imports/artifact' : 'api/reports' + (editing ? '/' + editing.id : ''),
      body,
      editing ? 'PUT' : 'POST',
    );
    $('editor').close();
    await refresh();
    navigate(r.id, r.importedRevision);
    if (selection().id === r.id) await select();
    notice(
      r.duplicate
        ? '同じ原本は取り込み済みです。保存済みの版を開きました'
        : '第' + r.revision + '版を保存しました',
    );
  } catch (error) {
    $('editor-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$('settings-button').onclick = async () => {
  $('settings-error').textContent = '';
  try {
    settings = await api('api/settings');
    $('save-mode').value = settings.saveMode;
    $('save-mode').disabled = settings.aiEnabled === false;
    $('destination').value = settings.notionDestination;
    $('save-skill').value = settings.saveSkillName;
    const agents = await api('api/agents').catch(() => ({ agents: [], configured: false }));
    $('save-agent').replaceChildren();
    const add = (id, name) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      $('save-agent').append(option);
    };
    add('', 'xangiの既定AI');
    for (const agent of agents.agents.filter((a) => a.available))
      add(agent.id, agent.name || agent.id);
    if (
      settings.saveAgentId &&
      !agents.agents.some((a) => a.id === settings.saveAgentId && a.available)
    )
      add(settings.saveAgentId, settings.saveAgentId + '（利用状況を確認できません）');
    $('save-agent').value = settings.saveAgentId;
    $('host-status').textContent = settings.hostConfigured
      ? '保存AIの接続先：' +
        settings.hostDestination +
        (agents.configured ? '' : '（AI一覧を取得できません）')
      : '保存AIへの接続が未設定です。HTML保存・閲覧は利用できます。';
    $('settings').showModal();
  } catch (error) {
    message(error);
  }
};
$('settings-form').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    settings = await api(
      'api/settings',
      {
        saveMode: $('save-mode').value,
        notionDestination: $('destination').value,
        saveAgentId: $('save-agent').value,
        saveSkillName: $('save-skill').value,
      },
      'PUT',
    );
    $('settings').close();
    if (current) showSaves();
    notice('Notion保存の設定を保存しました');
  } catch (error) {
    $('settings-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
window.addEventListener('hashchange', () => select());
setInterval(async () => {
  if (
    refreshing ||
    !$('report-details').hidden ||
    document.hidden ||
    $('editor').open ||
    $('settings').open ||
    $('classification-dialog').open
  )
    return;
  refreshing = true;
  try {
    await refresh();
    if (current) await select();
  } catch {
  } finally {
    refreshing = false;
  }
}, 4000);
try {
  settings = await api('api/settings');
  try {
    const stored = JSON.parse(localStorage.getItem('xangi-report-filters') || '{}');
    if (['active', 'archived', 'all'].includes(stored.archive))
      $('archive-filter').value = stored.archive;
    if ([...$('sort').options].some((o) => o.value === stored.sort)) $('sort').value = stored.sort;
    await refresh();
    $('category-filter').value = stored.category || '';
    $('tag-filter').value = stored.tag || '';
    drawList();
  } catch {
    await refresh();
  }
  await select();
} catch (error) {
  message(error);
}
