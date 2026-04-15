/**
 * Simple in-memory rate limit for login attempts (per client IP).
 * Not suitable for multi-instance deploy without shared store; good for single-node / small admin.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

export function checkLoginRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { count: 0, windowStart: now };
    buckets.set(ip, b);
  }
  if (b.count >= MAX_ATTEMPTS) {
    const elapsed = now - b.windowStart;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
    return { ok: false, retryAfterSec };
  }
  b.count += 1;
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
  return fallbackIp || 'unknown';
}
