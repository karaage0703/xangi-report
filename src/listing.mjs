import { requireValue } from './errors.mjs';
import { matches } from './classification.mjs';

export function listReports(reports, params) {
  const sort = params.get('sort') || 'updated_desc';
  const archive = params.get('archive') || 'active';
  requireValue(['active', 'archived', 'all'].includes(archive), 'アーカイブの条件が不正です');
  const sorts = {
    updated_desc: (a, b) => b.updated.localeCompare(a.updated),
    updated_asc: (a, b) => a.updated.localeCompare(b.updated),
    created_desc: (a, b) => b.created.localeCompare(a.created),
    created_asc: (a, b) => a.created.localeCompare(b.created),
    title_asc: (a, b) => a.title.localeCompare(b.title, 'ja'),
  };
  requireValue(Object.hasOwn(sorts, sort), '並び順が不正です');
  const filters = {
    query: params.get('q') || '',
    category: params.get('category') || '',
    uncategorized: params.get('uncategorized') === 'true',
    tag: params.get('tag') || '',
  };
  const starred = params.has('starred');
  return reports
    .filter(
      (r) =>
        (archive === 'all' || (r.archived ?? false) === (archive === 'archived')) &&
        (!starred || r.starred) &&
        matches(r, filters),
    )
    .sort((a, b) => sorts[sort](a, b) || a.id.localeCompare(b.id));
}
