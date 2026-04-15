/**
 * Drizzle `db.execute()` / node-pg can return `{ rows: T[] }` or a bare array depending on driver.
 * Centralize normalization so route code does not scatter `(x as any).rows` casts.
 */
export function rowsFromExecute<T extends Record<string, unknown>>(result: unknown): T[] {
  if (result == null) return [];
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] };
  return Array.isArray(r.rows) ? r.rows : [];
}

/** First row from a SQL execute result, or null. */
export function firstRowFromExecute<T extends Record<string, unknown>>(result: unknown): T | null {
  const rows = rowsFromExecute<T>(result);
  return rows[0] ?? null;
}
