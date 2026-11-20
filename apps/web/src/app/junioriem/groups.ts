import { unstable_noStore as noStore } from 'next/cache';
import { apiFetch, API_REVALIDATE_SEASONS } from '@/lib/api';
import { fetchPublicSeasons, isYouthSeason, type PublicSeason } from '../stats/load-stats-page';

export type JunioriemSectionName = 'statistika' | 'schedule' | 'standings';

export function junioriemGroups(seasons: PublicSeason[]): PublicSeason[] {
  return seasons
    .filter((season) => isYouthSeason(season))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || groupLabel(a).localeCompare(groupLabel(b)));
}

export function groupLabel(season: PublicSeason): string {
  const name = (season.name ?? '').trim();
  if (name) return name;
  if (season.year != null) return String(season.year);
  return `Season ${season.id}`;
}

async function fetchSeasonsUncached(): Promise<PublicSeason[]> {
  const data = await apiFetch('/api/public/stats/seasons', { noCache: true });
  return Array.isArray(data) ? data : [];
}

export async function loadJunioriemGroups(): Promise<PublicSeason[]> {
  let seasons: PublicSeason[] | null = null;
  try {
    seasons = await fetchPublicSeasons();
  } catch {
    seasons = null;
  }
  const groups = seasons ? junioriemGroups(seasons) : [];
  if (groups.length > 0) return groups;
  // An empty list is what we show as "no children's league". A timed-out or cached
  // miss looks the same, and the next click would keep serving it. Confirm live.
  noStore();
  try {
    return junioriemGroups(await fetchSeasonsUncached());
  } catch {
    return [];
  }
}

export type AgeGroup = { id: number; name: string; slug: string };

export async function loadAgeGroups(seasonId: number): Promise<AgeGroup[]> {
  try {
    const season = await apiFetch<{ leagues?: Array<{ id: number; name?: string; slug?: string }> }>(
      `/api/public/seasons/by-id/${seasonId}`,
      { revalidate: API_REVALIDATE_SEASONS },
    );
    return (season.leagues ?? [])
      .filter((league) => league.id != null && league.slug)
      .map((league) => ({
        id: league.id,
        name: (league.name ?? league.slug ?? `Group ${league.id}`).trim(),
        slug: league.slug as string,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
