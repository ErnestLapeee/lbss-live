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

/** Adult seasons count toward all-time. Children's seasons stay on their own season. */
export function seasonLeagueFields(row: Record<string, unknown>): { leagueLevel: 'adult' | 'youth'; youthRules: Record<string, unknown> } {
  const leagueLevel = row.leagueLevel === 'youth' ? 'youth' : 'adult';
  const youthRules =
    leagueLevel === 'youth' && row.youthRules != null && typeof row.youthRules === 'object'
      ? (row.youthRules as Record<string, unknown>)
      : {};
  return { leagueLevel, youthRules };
}
