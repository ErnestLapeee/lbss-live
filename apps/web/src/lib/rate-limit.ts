/**
 * In-memory rate limit for the Next.js API proxy (per client IP).
 * One bucket only — live pages and stats need many small requests; caching stops bot egress.
 */
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 240;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { count: 0, windowStart: now };
    buckets.set(ip, b);
  }
  if (b.count >= MAX_REQUESTS) {
    const elapsed = now - b.windowStart;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
    return { ok: false, retryAfterSec };
  }
  b.count += 1;
  return { ok: true };
}

export function clientIpFromHeaders(headers: Headers): string {
  const xf = headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]!.trim();
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}
