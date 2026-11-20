import { sql } from 'drizzle-orm';

/**
 * Namespace for transaction-scoped scoring locks. PostgreSQL advisory locks
 * with two integer keys avoid collisions with advisory locks used elsewhere.
 */
const SCORING_LOCK_NAMESPACE = 1_276_316_497;

/**
 * Serialize all state-changing work for one game.
 *
 * This must be called from inside a database transaction. PostgreSQL releases
 * the lock automatically when that transaction commits or rolls back.
 */
export async function lockScoringGame(
  conn: { execute: (query: any) => Promise<unknown> },
  gameId: number,
): Promise<void> {
  if (!Number.isInteger(gameId) || gameId <= 0) {
    throw new Error('A valid game id is required for the scoring lock');
  }
  await conn.execute(
    sql`SELECT pg_advisory_xact_lock(${SCORING_LOCK_NAMESPACE}, ${gameId})`,
  );
}
