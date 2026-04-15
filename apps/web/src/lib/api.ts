/** Server components prefer INTERNAL_API_URL (e.g. Docker/Railway private URL); browser uses NEXT_PUBLIC. */
const API_BASE =
  typeof window === 'undefined'
    ? (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002')
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002');

export async function apiFetch<T>(path: string, options?: RequestInit & { noCache?: boolean }): Promise<T> {
  const { noCache, ...fetchOptions } = options ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions?.headers,
    },
    ...(noCache ? { cache: 'no-store' as const } : { next: { revalidate: 30 } }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
