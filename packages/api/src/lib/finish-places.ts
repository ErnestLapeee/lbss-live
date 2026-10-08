export type FinishPlace = 1 | 2 | 3;

export type FinishRow = {
  teamId: number;
  wins: number;
  losses: number;
  winPct?: string | null;
  teamName?: string | null;
};

function winPctOf(row: FinishRow): number {
  if (row.winPct != null && row.winPct !== '') {
    const parsed = parseFloat(row.winPct);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const decided = row.wins + row.losses;
  return decided > 0 ? row.wins / decided : 0;
}

function sameRecord(a: FinishRow, b: FinishRow): boolean {
  return winPctOf(a) === winPctOf(b) && a.wins === b.wins;
}

function byRecord(a: FinishRow, b: FinishRow): number {
  const pct = winPctOf(b) - winPctOf(a);
  if (pct !== 0) return pct;
  return b.wins - a.wins;
}

/**
 * Competition rank from winning percentage, then wins.
 * A tied record shares one rank. The name of the club does not break the tie.
 * `place` is 1, 2, or 3 only when the table is finished and exactly one club holds that rank.
 */
export function annotateFinish<T extends FinishRow>(
  rows: T[],
  tableComplete: boolean,
): (T & { rank: number; place: FinishPlace | null })[] {
  const byStanding = [...rows].sort((a, b) => byRecord(a, b) || a.teamId - b.teamId);
  const rankByTeam = new Map<number, number>();
  let index = 0;
  while (index < byStanding.length) {
    let end = index + 1;
    while (end < byStanding.length && sameRecord(byStanding[index]!, byStanding[end]!)) end += 1;
    const rank = index + 1;
    for (let i = index; i < end; i += 1) rankByTeam.set(byStanding[i]!.teamId, rank);
    index = end;
  }

  return [...rows]
    .sort((a, b) => byRecord(a, b) || (a.teamName ?? '').localeCompare(b.teamName ?? '', 'lv') || a.teamId - b.teamId)
    .map((row) => {
      const rank = rankByTeam.get(row.teamId) ?? rows.length;
      const alone = byStanding.filter((other) => rankByTeam.get(other.teamId) === rank).length === 1;
      const place: FinishPlace | null =
        tableComplete && alone && (rank === 1 || rank === 2 || rank === 3) ? rank : null;
      return { ...row, rank, place };
    });
}

export type PlayoffSeriesResult = {
  roundNumber: number;
  label?: string | null;
  higherTeamId?: number | null;
  lowerTeamId?: number | null;
  winnerTeamId?: number | null;
};

export type PlayoffPodium = {
  hasBracket: boolean;
  decided: boolean;
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdTeamId: number | null;
};

function isChampionshipLabel(label: string | null | undefined): boolean {
  const text = label ?? '';
  if (/semi[-\s]?final/i.test(text)) return false;
  return /final|champion|čempion|cempion/i.test(text);
}

function isThirdPlaceLabel(label: string | null | undefined): boolean {
  return /third|\b3rd\b|treš/i.test(label ?? '');
}

function loserOf(series: PlayoffSeriesResult): number | null {
  const winner = series.winnerTeamId;
  if (winner == null) return null;
  if (series.higherTeamId != null && series.higherTeamId !== winner) return series.higherTeamId;
  if (series.lowerTeamId != null && series.lowerTeamId !== winner) return series.lowerTeamId;
  return null;
}

/**
 * The title comes from the last round of the bracket.
 * One series in that round is the final. Several series need one labeled as the final.
 * A series labeled as third place supplies third when it has a winner.
 */
export function playoffPodium(series: PlayoffSeriesResult[]): PlayoffPodium {
  const empty: PlayoffPodium = {
    hasBracket: false,
    decided: false,
    championTeamId: null,
    runnerUpTeamId: null,
    thirdTeamId: null,
  };
  if (series.length === 0) return empty;

  const titleSeries = series.filter((item) => !isThirdPlaceLabel(item.label));
  const pool = titleSeries.length > 0 ? titleSeries : series;
  const maxRound = Math.max(...pool.map((item) => item.roundNumber));
  const finalRound = pool.filter((item) => item.roundNumber === maxRound);
  const finalSeries =
    finalRound.length === 1 ? finalRound[0]! : finalRound.find((item) => isChampionshipLabel(item.label)) ?? null;

  const thirdSeries = series.find((item) => item !== finalSeries && isThirdPlaceLabel(item.label) && item.winnerTeamId != null);

  if (!finalSeries || finalSeries.winnerTeamId == null) {
    return {
      hasBracket: true,
      decided: false,
      championTeamId: null,
      runnerUpTeamId: null,
      thirdTeamId: thirdSeries?.winnerTeamId ?? null,
    };
  }

  return {
    hasBracket: true,
    decided: true,
    championTeamId: finalSeries.winnerTeamId,
    runnerUpTeamId: loserOf(finalSeries),
    thirdTeamId: thirdSeries?.winnerTeamId ?? null,
  };
}
