/** Build W-L record strings from bundled standings API response. */
export function buildRecordByTeamIdFromStandings(
  standings: {
    leagues?: Array<{
      leagueId?: number;
      rows?: Array<{ teamId: number; wins?: number; losses?: number }>;
    }>;
  } | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const league of standings?.leagues ?? []) {
    for (const row of league.rows ?? []) {
      if (row?.teamId == null) continue;
      const label = `${row.wins ?? 0}-${row.losses ?? 0}`;
      map[String(row.teamId)] = label;
      if (league.leagueId != null) map[`${league.leagueId}:${row.teamId}`] = label;
    }
  }
  return map;
}
