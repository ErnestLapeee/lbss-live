/**
 * Opponent batting average allowed: H / opponent AB, with
 * opponent AB ≈ BF − BB − IBB − HBP (sacrifice flies/bunts not stored on pitching aggregates).
 */
export function formatOpponentBattingAvgPitch(row: Record<string, unknown>): string | null {
  const h = Number(row.hitsAllowed ?? row.hits_allowed ?? 0);
  const bf = Number(row.battersFaced ?? row.batters_faced ?? 0);
  const bb = Number(row.walksAllowed ?? row.walks_allowed ?? 0);
  const ibb = Number(row.intentionalWalks ?? row.intentional_walks ?? 0);
  const hb = Number(row.hitBatters ?? row.hit_batters ?? 0);
  const denom = bf - bb - ibb - hb;
  if (denom <= 0) return null;
  return (h / denom).toFixed(3).replace(/^0/, '');
}
