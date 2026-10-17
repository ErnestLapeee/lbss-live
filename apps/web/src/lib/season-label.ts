export type SeasonLabelInput = {
  id?: number;
  name?: string | null;
  year?: number | null;
  seasonKind?: string | null;
  leagueLevel?: string | null;
  isActive?: boolean;
};

export function seasonOptionLabel(season: SeasonLabelInput): string {
  const base =
    (season.name ?? '').trim() ||
    (season.year != null ? String(season.year) : season.id != null ? `Season ${season.id}` : 'Season');
  const tags = [
    season.seasonKind === 'playoff' ? 'Playoffs' : '',
    season.leagueLevel === 'youth' ? 'Jaunieši' : '',
  ].filter(Boolean);
  return tags.length ? `${base} (${tags.join(', ')})` : base;
}

export function defaultPublicSeason<T extends { isActive?: boolean; leagueLevel?: string | null }>(
  seasons: T[],
): T | null {
  if (seasons.length === 0) return null;
  return (
    seasons.find((season) => season.isActive && season.leagueLevel !== 'youth') ??
    seasons.find((season) => season.leagueLevel !== 'youth') ??
    seasons.find((season) => season.isActive) ??
    seasons[0] ??
    null
  );
}
