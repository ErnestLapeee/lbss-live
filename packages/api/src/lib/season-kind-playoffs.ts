/**
 * Each season stores its own playoff setup (seeds, series length, third-place game).
 * Fields omitted from the request are left unchanged.
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
  const patch: Record<string, unknown> = {};
  if (input.hasPlayoffs !== undefined) patch.hasPlayoffs = input.hasPlayoffs;
  else if (kind === 'playoff') patch.hasPlayoffs = true;
  if (input.regularSeasonGamesPerTeam !== undefined) {
    patch.regularSeasonGamesPerTeam = input.regularSeasonGamesPerTeam;
  }
  if (input.playoffSettings !== undefined) {
    patch.playoffSettings =
      input.playoffSettings != null && typeof input.playoffSettings === 'object'
        ? (input.playoffSettings as Record<string, unknown>)
        : {};
  }
  return patch;
}
