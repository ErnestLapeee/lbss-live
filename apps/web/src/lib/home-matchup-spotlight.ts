export type MatchupSpotlightPlayer = {
  name: string;
  line: string;
};

export type TeamMatchupSpotlight = {
  batter: MatchupSpotlightPlayer | null;
  pitcher: MatchupSpotlightPlayer | null;
};

const MIN_AB = 10;
const MIN_IP = 5;

function parseIp(ip: unknown): number {
  if (ip == null || ip === '') return 0;
  const n = typeof ip === 'string' ? parseFloat(ip) : Number(ip);
  return Number.isFinite(n) ? n : 0;
}

function fmtRate(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(3).replace(/^0/, '');
}

function fmtEra(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function pickTopBatter(rows: any[], teamId: number): MatchupSpotlightPlayer | null {
  const eligible = rows.filter(
    (r) => r.teamId === teamId && (r.atBats ?? 0) >= MIN_AB && r.ops != null && r.ops !== '',
  );
  if (eligible.length === 0) return null;
  const best = [...eligible].sort(
    (a, b) => parseFloat(String(b.ops)) - parseFloat(String(a.ops)),
  )[0];
  return {
    name: `${best.firstName} ${best.lastName}`,
    line: `${fmtRate(best.ops)} OPS`,
  };
}

function pickTopPitcher(rows: any[], teamId: number): MatchupSpotlightPlayer | null {
  const eligible = rows.filter(
    (r) => r.teamId === teamId && parseIp(r.inningsPitched) >= MIN_IP && r.era != null && r.era !== '',
  );
  if (eligible.length === 0) return null;
  const best = [...eligible].sort((a, b) => parseFloat(String(a.era)) - parseFloat(String(b.era)))[0];
  return {
    name: `${best.firstName} ${best.lastName}`,
    line: `${fmtEra(best.era)} ERA`,
  };
}

export function buildTeamMatchupSpotlight(
  batting: any[],
  pitching: any[],
  teamId: number,
): TeamMatchupSpotlight {
  return {
    batter: pickTopBatter(batting, teamId),
    pitcher: pickTopPitcher(pitching, teamId),
  };
}
