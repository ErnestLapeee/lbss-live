import { apiFetch, API_REVALIDATE_SEASONS, API_REVALIDATE_STANDINGS } from '@/lib/api';

export type PublicSeason = {
  id: number;
  name?: string;
  year?: number;
  isActive?: boolean;
  seasonKind?: string;
  leagueLevel?: string;
};

export type StatsOverview = {
  batting?: unknown[];
  battingLeaders?: unknown;
  pitching?: unknown[];
  pitchingLeaders?: unknown;
  fielding?: unknown[];
};

export function isYouthSeason(season: { leagueLevel?: string | null }): boolean {
  return season.leagueLevel === 'youth';
}

export async function fetchPublicSeasons(): Promise<PublicSeason[]> {
  try {
    const data = await apiFetch('/api/public/stats/seasons', { revalidate: API_REVALIDATE_SEASONS });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchStatsBundle(seasonId: number | null, leagueId?: number | null) {
  const seasonPart = seasonId != null ? `seasonId=${seasonId}` : 'seasonId=all';
  const initialSeasonParam = leagueId != null ? `${seasonPart}&leagueId=${leagueId}` : seasonPart;
  let initialBatting: any[] = [];
  let initialPitching: any[] = [];
  let initialFielding: any[] = [];
  let initialBattingLeaders: any = null;
  let initialPitchingLeaders: any = null;

  try {
    const overview = await apiFetch<StatsOverview>(
      `/api/public/stats/overview?${initialSeasonParam}`,
      { revalidate: API_REVALIDATE_STANDINGS },
    );
    initialBatting = Array.isArray(overview.batting) ? overview.batting : [];
    initialPitching = Array.isArray(overview.pitching) ? overview.pitching : [];
    initialFielding = Array.isArray(overview.fielding) ? overview.fielding : [];
    initialBattingLeaders =
      overview.battingLeaders && typeof overview.battingLeaders === 'object' && !Array.isArray(overview.battingLeaders)
        ? overview.battingLeaders
        : null;
    initialPitchingLeaders =
      overview.pitchingLeaders &&
      typeof overview.pitchingLeaders === 'object' &&
      !Array.isArray(overview.pitchingLeaders)
        ? overview.pitchingLeaders
        : null;
  } catch {
    const [batting, bLeaders, pitching, pLeaders, fielding] = await Promise.all([
      apiFetch(`/api/public/stats/batting?${initialSeasonParam}`, { revalidate: API_REVALIDATE_STANDINGS }).catch(
        () => [],
      ),
      apiFetch(`/api/public/stats/leaders?${initialSeasonParam}`, { revalidate: API_REVALIDATE_STANDINGS }).catch(
        () => null,
      ),
      apiFetch(`/api/public/stats/pitching?${initialSeasonParam}`, { revalidate: API_REVALIDATE_STANDINGS }).catch(
        () => [],
      ),
      apiFetch(`/api/public/stats/pitching-leaders?${initialSeasonParam}`, {
        revalidate: API_REVALIDATE_STANDINGS,
      }).catch(() => null),
      apiFetch(`/api/public/stats/fielding?${initialSeasonParam}`, { revalidate: API_REVALIDATE_STANDINGS }).catch(
        () => [],
      ),
    ]);
    initialBatting = Array.isArray(batting) ? batting : [];
    initialPitching = Array.isArray(pitching) ? pitching : [];
    initialFielding = Array.isArray(fielding) ? fielding : [];
    initialBattingLeaders = bLeaders && typeof bLeaders === 'object' && !Array.isArray(bLeaders) ? bLeaders : null;
    initialPitchingLeaders =
      pLeaders && typeof pLeaders === 'object' && !Array.isArray(pLeaders) ? pLeaders : null;
  }

  return {
    initialBatting,
    initialPitching,
    initialFielding,
    initialBattingLeaders,
    initialPitchingLeaders,
  };
}
