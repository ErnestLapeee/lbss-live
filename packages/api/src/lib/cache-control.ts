/** Cache-Control for read-mostly public GET responses. Single-game and live paths stay uncached. */
export function cacheControlForPublicPath(url: string): string {
  const path = url.split('?')[0] ?? url;

  if (path.startsWith('/api/public/games/')) {
    return 'no-store';
  }
  if (path.startsWith('/api/public/stats/') || path.startsWith('/api/public/standings')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  if (
    path.startsWith('/api/public/seasons') ||
    path.startsWith('/api/public/teams') ||
    path.startsWith('/api/public/articles')
  ) {
    return 'public, max-age=120, stale-while-revalidate=300';
  }
  if (path === '/api/public/games') {
    return url.includes('status=live') ? 'no-store' : 'public, max-age=20, stale-while-revalidate=60';
  }
  if (path.startsWith('/api/public/players')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  return 'public, max-age=30, stale-while-revalidate=60';
}
