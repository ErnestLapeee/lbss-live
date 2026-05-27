/** Safe internal return paths for player profile back links (?from=). */

const RETURN_LABELS: Record<string, string> = {
  '/stats': 'Statistics',
  '/teams': 'Teams',
  '/schedule': 'Schedule',
  '/standings': 'Standings',
};

export function sanitizeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('://') || trimmed.includes('\\')) return null;

  try {
    const url = new URL(trimmed, 'http://local');
    if (url.pathname.includes('..')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function playerProfilePath(slug: string, returnTo?: string | null): string {
  const base = `/players/${encodeURIComponent(slug)}`;
  const safe = sanitizeReturnPath(returnTo);
  if (!safe) return base;
  return `${base}?from=${encodeURIComponent(safe)}`;
}

export function returnLabelForPath(path: string): string {
  const safe = sanitizeReturnPath(path);
  if (!safe) return 'Back';

  const pathname = safe.split('?')[0]?.split('#')[0] ?? safe;
  if (RETURN_LABELS[pathname]) return RETURN_LABELS[pathname];

  const teamMatch = pathname.match(/^\/teams\/([^/]+)$/);
  if (teamMatch) return 'Team';

  const playerMatch = pathname.match(/^\/players\/([^/]+)$/);
  if (playerMatch) return 'Player';

  const gameMatch = pathname.match(/^\/games\/(\d+)/);
  if (gameMatch) return 'Game';

  return 'Back';
}
