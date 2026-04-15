/**
 * Playoff bracket settings (`has_playoffs`, `playoff_settings`, …) belong on **playoff** seasons only.
 * Regular seasons never imply a league-wide playoff — add a separate season with kind `playoff`.
 */
export type SeasonKind = 'regular' | 'playoff';

export function playoffColumnsForSeasonKind(
  kind: SeasonKind,
  hasPoCols: boolean,
  input: {
    hasPlayoffs?: boolean;
    regularSeasonGamesPerTeam?: number | null;
    playoffSettings?: unknown;
  },
): Record<string, unknown> {
  if (!hasPoCols) return {};
  if (kind === 'regular') {
    return {
      hasPlayoffs: false,
      regularSeasonGamesPerTeam: null,
      playoffSettings: {},
    };
  }
  return {
    hasPlayoffs: input.hasPlayoffs ?? true,
    regularSeasonGamesPerTeam: input.regularSeasonGamesPerTeam ?? null,
    playoffSettings: (input.playoffSettings != null && typeof input.playoffSettings === 'object'
      ? input.playoffSettings
      : {}) as Record<string, unknown>,
  };
}
