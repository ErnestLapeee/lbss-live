/**
 * Older DBs may omit playoff columns; we probe `information_schema` and sometimes
 * omit those fields from `select()`. Normalize API shape without `(season as any)`.
 */
export function seasonWithPlayoffDefaults(
  hasPoCols: boolean,
  row: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...row,
    hasPlayoffs: hasPoCols ? Boolean(row.hasPlayoffs) : false,
    regularSeasonGamesPerTeam: hasPoCols
      ? ((row.regularSeasonGamesPerTeam as number | null | undefined) ?? null)
      : null,
    playoffSettings: hasPoCols
      ? (row.playoffSettings != null && typeof row.playoffSettings === 'object'
        ? row.playoffSettings
        : {})
      : {},
  };
}
