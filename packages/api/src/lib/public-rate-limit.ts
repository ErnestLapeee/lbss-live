/**
 * In-memory rate limit for public GET endpoints (per client IP).
 * Two tiers: general browsing and heavy JSON dumps (stats, game lists).
 */
const WINDOW_MS = 60 * 1000;
/** Enough for live-game polling (~45 req/min) with headroom for a second tab. */
const MAX_GENERAL = 100;
/** Heavy endpoints return large payloads; keep tight to limit bot egress. */
const MAX_HEAVY = 30;

type Bucket = { general: number; heavy: number; windowStart: number };
const buckets = new Map<string, Bucket>();

function isHeavyPublicPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  if (path.startsWith('/api/public/stats/')) return true;
  if (path === '/api/public/games') return true;
  if (path === '/api/public/players') return true;
  return false;
}

export function checkPublicRateLimit(
  ip: string,
  url: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { general: 0, heavy: 0, windowStart: now };
    buckets.set(ip, b);
  }

  const heavy = isHeavyPublicPath(url);
  if (b.general >= MAX_GENERAL || (heavy && b.heavy >= MAX_HEAVY)) {
    const elapsed = now - b.windowStart;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
    return { ok: false, retryAfterSec };
  }

  b.general += 1;
  if (heavy) b.heavy += 1;
  return { ok: true };
}

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
  if (path.startsWith('/api/public/stats/')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  if (path.startsWith('/api/public/standings')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  if (
    path.startsWith('/api/public/seasons') ||
    path.startsWith('/api/public/teams') ||
    path.startsWith('/api/public/articles')
  ) {
    return 'public, max-age=120, stale-while-revalidate=300';
  }
  if (path === '/api/public/games' || /^\/api\/public\/games\/\d+$/.test(path)) {
    return 'public, max-age=20, stale-while-revalidate=60';
  }
  if (path.startsWith('/api/public/players')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  return 'public, max-age=30, stale-while-revalidate=60';
}
