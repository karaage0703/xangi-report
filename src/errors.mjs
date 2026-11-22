export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function text(value, name, max, required = false) {
  requireValue(
    typeof value === 'string' && value.length <= max && (!required || value.trim()),
    name + 'が不正です',
  );
  return value.trim();
}
export function onlyKeys(value, keys) {
  requireValue(
    Object.keys(value).every((key) => keys.includes(key)),
    '未対応の項目があります',
  );
}
