declare global {
  interface Window {
    __LBSS_API_URL__?: string;
  }
}

function getApiBase(): string {
  const raw = typeof window !== 'undefined' ? window.__LBSS_API_URL__ : undefined;
  return (raw && raw.replace(/\/$/, '')) || '/api';
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(0, message);
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.message || `API error: ${res.status}`);
  }
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Phone is offline, or the host did not answer. A 400 from the scorer is a real rejection. */
export function isUnreachableError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 0 || err.status === 408 || err.status >= 500;
  if (err instanceof TypeError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}

export function apiGet<T>(path: string) { return apiFetch<T>(path); }
export function apiPost<T>(path: string, data: unknown) { return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(data) }); }
export function apiPut<T>(path: string, data: unknown) { return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(data) }); }
export function apiPatch<T>(path: string, data: unknown) { return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(data) }); }
export function apiDelete<T>(path: string) { return apiFetch<T>(path, { method: 'DELETE' }); }
