/** Build W-L record strings from bundled standings API response. */
export function buildRecordByTeamIdFromStandings(
  standings: { leagues?: Array<{ rows?: Array<{ teamId: number; wins?: number; losses?: number }> }> } | null | undefined,
): Record<number, string> {
  const map: Record<number, string> = {};
  for (const row of standings?.leagues?.flatMap((lg) => lg.rows ?? []) ?? []) {
    if (row?.teamId != null) {
      map[row.teamId] = `${row.wins ?? 0}-${row.losses ?? 0}`;
    }
  }
  return map;
}
