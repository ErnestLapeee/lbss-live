/**
 * Sentinel stored in homeLineScore when the home team does not bat the bottom
 * of an inning (e.g. visitor wins in top of 9). Render as "X" in the UI.
 */
export const LINE_SCORE_X_MARKER = -1;

export type HalfInningBounds = { maxTop: number; maxBot: number };

/** Derive completed half-innings from official `end_half_inning` markers. */
export function boundsFromEvents(
  evts: ReadonlyArray<{ inning: number | null; half: string | null; eventType: string }>,
): HalfInningBounds {
  let maxTop = 0;
  let maxBot = 0;
  for (const e of evts) {
    if (e.eventType !== 'end_half_inning' || e.inning == null || !e.half) continue;
    if (e.half === 'top') maxTop = Math.max(maxTop, e.inning);
    else maxBot = Math.max(maxBot, e.inning);
  }
  return { maxTop, maxBot };
}

export function buildPublicLineScores(input: {
  awayScoring: number[];
  homeScoring: number[];
  bounds: HalfInningBounds;
  gameStatus: string;
  isFinalized: boolean;
  awayRuns: number;
  homeRuns: number;
  currentInning: number | null;
  currentHalf: string | null;
}): { awayLineScore: number[]; homeLineScore: number[] } {
  const isFinal = input.gameStatus === 'final' || input.isFinalized;

  let maxTop = input.bounds.maxTop;
  let maxBot = input.bounds.maxBot;
  const scoringLen = Math.max(input.awayScoring.length, input.homeScoring.length, 1);

  if (maxTop === 0 && maxBot === 0) {
    maxTop = scoringLen;
    maxBot = scoringLen;
  }

  if (
    isFinal &&
    maxTop === maxBot &&
    input.awayRuns > input.homeRuns &&
    input.currentHalf === 'top' &&
    input.currentInning != null &&
    input.currentInning >= 1
  ) {
    maxTop = Math.max(maxTop, input.currentInning);
    maxBot = Math.max(0, input.currentInning - 1);
  }

  let columns = Math.max(maxTop, maxBot, input.awayScoring.length, input.homeScoring.length, 1);

  const away = Array.from({ length: columns }, (_, i) => Number(input.awayScoring[i] ?? 0));
  const home = Array.from({ length: columns }, (_, i) => Number(input.homeScoring[i] ?? 0));

  if (isFinal && maxTop > maxBot && maxTop >= 1 && input.awayRuns > input.homeRuns) {
    home[maxTop - 1] = LINE_SCORE_X_MARKER;
  }

  while (columns > 1) {
    const j = columns - 1;
    if (away[j] === 0 && home[j] === 0) {
      columns -= 1;
    } else {
      break;
    }
  }

  return {
    awayLineScore: away.slice(0, columns),
    homeLineScore: home.slice(0, columns),
  };
}

export function formatLineScoreCell(value: number): string {
  if (value === LINE_SCORE_X_MARKER) return 'X';
  return String(value);
}
