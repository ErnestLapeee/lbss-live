/** Standard numeric positions (lineup / fielding). */
export const POS_LABELS: Record<number, string> = {
  1: 'P',
  2: 'C',
  3: '1B',
  4: '2B',
  5: '3B',
  6: 'SS',
  7: 'LF',
  8: 'CF',
  9: 'RF',
};

/**
 * Primary defensive label for header/UI: split when two positions are close,
 * or **UTL** when usage is spread across three or more meaningful roles.
 */
export function derivePrimaryPositionLabel(
  rows: Array<{ position: number; games: number }> | null | undefined,
): string | null {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => (b.games || 0) - (a.games || 0));
  const total = sorted.reduce((s, x) => s + (x.games || 0), 0);
  if (total <= 0) return null;
  const topShare = sorted[0].games / total;
  const qualCount = sorted.filter((x) => x.games / total >= 0.12).length;
  if (topShare <= 0.65 && qualCount >= 3) return 'UTL';

  const top = sorted[0];
  const second = sorted[1];
  const topLabel = POS_LABELS[top.position] || String(top.position);
  if (second && second.games >= top.games * 0.6) {
    const secLabel = POS_LABELS[second.position] || String(second.position);
    return `${topLabel}/${secLabel}`;
  }
  return topLabel;
}
