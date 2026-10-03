/** Client IP helper (backup export throttling, logging). */
export function clientIpFromRequest(headers: Record<string, unknown>, fallbackIp: string): string {
  const xf = headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0]!.trim();
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).trim();
  }
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim();
  }
  return fallbackIp || 'unknown';
}

/** Cache-Control for read-mostly public GET responses (live paths stay uncached). */
export function cacheControlForPublicPath(url: string): string | null {
  const path = url.split('?')[0] ?? url;

  if (/\/games\/\d+\/(events|lineups|boxscore|pitching-boxscore|fielding-boxscore)/.test(path)) {
    return 'no-store';
  }
  if (path.startsWith('/api/public/stats/') || path.startsWith('/stats/')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  if (path.startsWith('/api/public/standings') || path.startsWith('/standings')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  if (
    path.startsWith('/api/public/seasons') ||
    path.startsWith('/api/public/teams') ||
    path.startsWith('/api/public/articles') ||
    path.startsWith('/seasons') ||
    path.startsWith('/teams') ||
    path.startsWith('/articles')
  ) {
    return 'public, max-age=120, stale-while-revalidate=300';
  }
  if (
    path === '/api/public/games' ||
    /^\/api\/public\/games\/\d+$/.test(path) ||
    path === '/games' ||
    /^\/games\/\d+$/.test(path)
  ) {
    return 'public, max-age=20, stale-while-revalidate=60';
  }
  if (path.startsWith('/api/public/players') || path.startsWith('/players')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  return 'public, max-age=30, stale-while-revalidate=60';
}
