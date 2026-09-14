/**
 * In-memory rate limit for the Next.js API proxy (per client IP).
 */
const WINDOW_MS = 60 * 1000;
const MAX_GENERAL = 100;
const MAX_HEAVY = 30;

type Bucket = { general: number; heavy: number; windowStart: number };
const buckets = new Map<string, Bucket>();

function isHeavyProxyPath(path: string[]): boolean {
  const p = path.join('/');
  if (p.startsWith('public/stats/')) return true;
  if (p === 'public/games') return true;
  if (p === 'public/players') return true;
  return false;
}

export function checkRateLimit(
  ip: string,
  path: string[],
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { general: 0, heavy: 0, windowStart: now };
    buckets.set(ip, b);
  }

  const heavy = isHeavyProxyPath(path);
  if (b.general >= MAX_GENERAL || (heavy && b.heavy >= MAX_HEAVY)) {
    const elapsed = now - b.windowStart;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
    return { ok: false, retryAfterSec };
  }

  b.general += 1;
  if (heavy) b.heavy += 1;
  return { ok: true };
}

export function clientIpFromHeaders(headers: Headers): string {
  const xf = headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]!.trim();
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}
