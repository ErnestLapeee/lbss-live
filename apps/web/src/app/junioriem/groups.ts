import { fetchPublicSeasons, isYouthSeason, type PublicSeason } from '../stats/load-stats-page';

export type JunioriemSectionName = 'statistika' | 'schedule' | 'standings';

export function junioriemGroups(seasons: PublicSeason[]): PublicSeason[] {
  return seasons
    .filter((season) => isYouthSeason(season))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || groupLabel(a).localeCompare(groupLabel(b)));
}

export function groupLabel(season: PublicSeason): string {
  const name = (season.name ?? '').trim();
  if (name && season.year != null && name !== String(season.year)) return `${name} · ${season.year}`;
  if (name) return name;
  if (season.year != null) return String(season.year);
  return `Season ${season.id}`;
}

export async function loadJunioriemGroups(): Promise<PublicSeason[]> {
  return junioriemGroups(await fetchPublicSeasons());
}
