export type HonorKind = 'champion' | 'runner_up' | 'third' | 'custom';

export type PlayerAccolade = {
  seasonYear: number;
  seasonName: string;
  teamName: string;
  honor: HonorKind;
  label?: string | null;
};

export function normalizeHonor(honor: string): HonorKind {
  if (honor === 'champion' || honor === 'runner_up' || honor === 'third' || honor === 'custom') return honor;
  return 'custom';
}

function honorSortKey(honor: string): number {
  if (honor === 'champion') return 0;
  if (honor === 'runner_up') return 1;
  if (honor === 'third') return 2;
  return 3;
}

/** Manual lines are added. The same year and honor already earned from the table is kept once. */
export function mergeManualAccolades(computed: PlayerAccolade[], manual: PlayerAccolade[]): PlayerAccolade[] {
  const seen = new Set(computed.map((row) => `${row.seasonYear}|${row.honor}|${row.label ?? ''}`));
  const extra = manual.filter((row) => !seen.has(`${row.seasonYear}|${row.honor}|${row.label ?? ''}`));
  return [...computed, ...extra].sort(
    (a, b) =>
      b.seasonYear - a.seasonYear ||
      honorSortKey(a.honor) - honorSortKey(b.honor) ||
      (a.label ?? '').localeCompare(b.label ?? ''),
  );
}
