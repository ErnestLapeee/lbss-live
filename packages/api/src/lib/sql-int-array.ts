import { sql } from 'drizzle-orm';

/** A Postgres int array literal. Only finite integers are interpolated, so a bad id cannot change the query. */
export function sqlIntArray(ids: readonly number[]) {
  if (ids.length === 0) throw new Error('Empty id list');
  const clean: string[] = [];
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id < 0 || id > 2_147_483_647) {
      throw new Error('Invalid id list');
    }
    clean.push(String(id));
  }
  return sql.raw(`ARRAY[${clean.join(',')}]::int[]`);
}
