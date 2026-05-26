/** iScore-style game summary lines derived from per-game box score rows. */

export interface SummaryPlayerRow {
  firstName: string;
  lastName: string;
  playerId: number;
}

export function formatSummaryPlayerName(lastName: string, firstName: string): string {
  const ln = (lastName || '').trim().toUpperCase();
  const fn = (firstName || '').trim();
  return fn ? `${ln}, ${fn}` : ln;
}

/** e.g. `2B:(2) KAMANDULIS, Domas; (1) SMITH, John` */
export function buildStatSummaryLine(
  label: string,
  players: SummaryPlayerRow[],
  getCount: (p: SummaryPlayerRow) => number,
): string | null {
  const parts = players
    .map((p) => ({ p, count: getCount(p) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || a.p.lastName.localeCompare(b.p.lastName))
    .map(({ p, count }) => `(${count}) ${formatSummaryPlayerName(p.lastName, p.firstName)}`);
  if (parts.length === 0) return null;
  return `${label}:${parts.join('; ')}`;
}

const BATTING_SUMMARY_STATS: { label: string; key: string }[] = [
  { label: '2B', key: 'doubles' },
  { label: '3B', key: 'triples' },
  { label: 'HR', key: 'homeRuns' },
  { label: 'RBI', key: 'rbi' },
  { label: 'BB', key: 'walks' },
  { label: 'SF', key: 'sacrificeFlies' },
  { label: 'SH', key: 'sacrificeBunts' },
  { label: 'HBP', key: 'hitByPitch' },
  { label: 'TB', key: 'totalBases' },
];

const BASE_RUNNING_STATS: { label: string; key: string }[] = [
  { label: 'SB', key: 'stolenBases' },
  { label: 'CS', key: 'caughtStealing' },
];

export function buildBattingSummaryLines(
  players: SummaryPlayerRow[],
  getStat: (playerId: number, key: string) => number,
): string[] {
  return BATTING_SUMMARY_STATS.map(({ label, key }) =>
    buildStatSummaryLine(label, players, (p) => getStat(p.playerId, key)),
  ).filter((line): line is string => line != null);
}

export function buildBaseRunningSummaryLines(
  players: SummaryPlayerRow[],
  getStat: (playerId: number, key: string) => number,
): string[] {
  return BASE_RUNNING_STATS.map(({ label, key }) =>
    buildStatSummaryLine(label, players, (p) => getStat(p.playerId, key)),
  ).filter((line): line is string => line != null);
}

export function buildFieldingErrorLine(
  players: SummaryPlayerRow[],
  getErrors: (playerId: number) => number,
): string | null {
  return buildStatSummaryLine('E', players, (p) => getErrors(p.playerId));
}

export interface PitchSummaryRow {
  firstName: string;
  lastName: string;
  pitchesThrown: number | null;
  balls: number | null;
  strikes: number | null;
}

/** e.g. `Pitches-Strikes: RAČKAUSKAS, Justinas 76-48; …` */
export function buildPitchesStrikesLine(pitchers: PitchSummaryRow[]): string | null {
  const parts = pitchers
    .map((p) => {
      const np = p.pitchesThrown ?? (p.balls ?? 0) + (p.strikes ?? 0);
      const strikes = p.strikes ?? 0;
      if (np <= 0) return null;
      return `${formatSummaryPlayerName(p.lastName, p.firstName)} ${np}-${strikes}`;
    })
    .filter((x): x is string => x != null);
  if (parts.length === 0) return null;
  return `Pitches-Strikes: ${parts.join('; ')}`;
}

export interface GameInfoSummary {
  venue?: string | null;
  officialScorer?: string | null;
  umpire?: string | null;
}

export function buildGameInfoLines(info: GameInfoSummary): string[] {
  const lines: string[] = [];
  if (info.venue?.trim()) lines.push(`Location: ${info.venue.trim()}`);
  if (info.umpire?.trim()) lines.push(`Umpire: ${info.umpire.trim()}`);
  if (info.officialScorer?.trim()) lines.push(`Scorer: ${info.officialScorer.trim()}`);
  return lines;
}
