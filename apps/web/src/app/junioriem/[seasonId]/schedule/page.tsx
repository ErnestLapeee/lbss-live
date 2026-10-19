import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch, API_REVALIDATE_GAMES, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { buildRecordByTeamIdFromStandings } from '@/lib/standings-records';
import { ScheduleClient } from '../../../schedule/schedule-client';
import { JunioriemSection } from '../../section';
import { groupLabel, loadAgeGroups, loadJunioriemGroups } from '../../groups';

export const metadata: Metadata = { title: 'Junioriem Schedule - LBSS' };

export const revalidate = 20;

type Props = { params: Promise<{ seasonId: string }>; searchParams: Promise<{ group?: string }> };

export default async function JunioriemSchedulePage({ params, searchParams }: Props) {
  const { seasonId: raw } = await params;
  const { group: groupSlug } = await searchParams;
  const seasonId = parseInt(raw, 10);
  const groups = await loadJunioriemGroups();
  if (!groups.some((group) => group.id === seasonId)) redirect('/junioriem');

  const ageGroups = await loadAgeGroups(seasonId);
  const active = ageGroups.find((group) => group.slug === groupSlug) ?? null;
  if (ageGroups.length > 0 && !active) {
    redirect(`/junioriem/${seasonId}/schedule?group=${encodeURIComponent(ageGroups[0]!.slug)}`);
  }

  let initialGames: any[] = [];
  let initialRecordByTeamId: Record<number, string> = {};
  if (active) {
    try {
      const data = await apiFetch(`/api/public/games?leagueId=${active.id}`, { revalidate: API_REVALIDATE_GAMES });
      if (Array.isArray(data)) initialGames = data;
    } catch {}
    try {
      const rows = await apiFetch<Array<{ teamId: number; wins?: number; losses?: number }>>(
        `/api/public/standings/${active.id}?includeZeroGames=1`,
        { revalidate: API_REVALIDATE_STANDINGS },
      );
      initialRecordByTeamId = buildRecordByTeamIdFromStandings({
        leagues: [{ rows: Array.isArray(rows) ? rows : [] }],
      });
    } catch {}
  }

  return (
    <JunioriemSection
      groups={groups}
      seasonId={seasonId}
      section="schedule"
      ageGroups={ageGroups}
      activeSlug={active?.slug ?? null}
    >
      {active ? (
        <ScheduleClient
          key={active.id}
          embedded
          leagueId={active.id}
          initialGames={initialGames}
          seasons={groups.map((group) => ({
            id: group.id,
            name: group.name ?? groupLabel(group),
            year: group.year ?? 0,
            seasonKind: group.seasonKind,
            leagueLevel: group.leagueLevel,
          }))}
          defaultSeasonId={seasonId}
          initialRecordByTeamId={initialRecordByTeamId}
        />
      ) : null}
    </JunioriemSection>
  );
}
