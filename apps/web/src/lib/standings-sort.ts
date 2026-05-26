/** Shared standings ordering (matches API: winPct desc, then wins). */

export type StandingsSortRow = {
  wins: number;
  losses: number;
  winPct?: string | null;
  teamName?: string | null;
};

function parseWinPct(winPct: string | null | undefined, wins: number, losses: number): number {
  if (winPct != null && winPct !== '') {
    const n = parseFloat(winPct);
    if (!Number.isNaN(n)) return n;
  }
  const gp = wins + losses;
  return gp > 0 ? wins / gp : 0;
}

export function compareStandingsRows(a: StandingsSortRow, b: StandingsSortRow): number {
  const pctA = parseWinPct(a.winPct, a.wins, a.losses);
  const pctB = parseWinPct(b.winPct, b.wins, b.losses);
  if (pctB !== pctA) return pctB - pctA;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return (a.teamName ?? '').localeCompare(b.teamName ?? '', 'lv');
}

export function sortStandingsRows<T extends StandingsSortRow>(rows: T[]): T[] {
  return [...rows].sort(compareStandingsRows);
}
