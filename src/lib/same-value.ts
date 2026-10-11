/** JSONB can reorder object keys; that is not a change to a saved field. Array order remains significant. */
export function sameStoredValue(before: unknown, after: unknown): boolean {
  const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered)
    : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)])) : value;
  return JSON.stringify(ordered(before)) === JSON.stringify(ordered(after));
}
