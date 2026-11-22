import { requireValue, text } from './errors.mjs';

export function classification(input) {
  const category = text(input.category ?? '', 'カテゴリ', 60).normalize('NFC');
  const values = input.tags ?? [];
  requireValue(
    Array.isArray(values) && values.length <= 20,
    'タグは20個までの配列で指定してください',
  );
  const tags = [
    ...new Set(values.map((value) => text(value, 'タグ', 40).normalize('NFC')).filter(Boolean)),
  ];
  return { category, tags };
}

export function matches(r, { query = '', category = '', tag = '', uncategorized = false } = {}) {
  return (
    (!category || r.category === category) &&
    (!uncategorized || !r.category) &&
    (!tag || r.tags.includes(tag)) &&
    [r.title, r.project, r.category, ...r.tags]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase())
  );
}
