/** Server components prefer INTERNAL_API_URL (e.g. Docker/Railway private URL); browser uses NEXT_PUBLIC. */
const API_BASE =
  typeof window === 'undefined'
    ? (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002')
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002');

/** Default ISR seconds for public read-mostly data (standings, seasons, schedules). */
export const API_REVALIDATE_DEFAULT = 30;
/** Standings and season metadata change infrequently during a game day. */
export const API_REVALIDATE_STANDINGS = 60;
/** Season list rarely changes mid-day. */
export const API_REVALIDATE_SEASONS = 120;
/** Game lists: short cache; live pages poll client-side when needed. */
export const API_REVALIDATE_GAMES = 20;

export type ApiFetchOptions = RequestInit & {
  /** Bypass Next.js fetch cache entirely (live scores, admin). */
  noCache?: boolean;
  /** ISR revalidate seconds; ignored when noCache is true. */
  revalidate?: number;
};

export async function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const { noCache, revalidate, ...fetchOptions } = options ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions?.headers,
    },
    ...(noCache
      ? { cache: 'no-store' as const }
      : { next: { revalidate: revalidate ?? API_REVALIDATE_DEFAULT } }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
