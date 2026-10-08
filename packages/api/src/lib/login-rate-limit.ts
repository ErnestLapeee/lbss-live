/**
 * In-memory login failures per client IP.
 * One Railway proxy sits in front of the API, and `request.ip` is that proxy's client.
 * Do not read X-Forwarded-For here: the visitor can put any address in the first hop.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

const MAX_TRACKED_IPS = 10_000;

function pruneExpired(now: number) {
  for (const [ip, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(ip);
  }
}

function bucketFor(ip: string, now: number): Bucket {
  if (buckets.size > MAX_TRACKED_IPS) pruneExpired(now);
  let bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    buckets.set(ip, bucket);
  }
  return bucket;
}

export function loginAttemptAllowed(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = bucketFor(ip || 'unknown', now);
  if (bucket.count < MAX_FAILURES) return { ok: true };
  const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000));
  return { ok: false, retryAfterSec };
}

export function noteLoginFailure(ip: string): void {
  const bucket = bucketFor(ip || 'unknown', Date.now());
  bucket.count += 1;
}
