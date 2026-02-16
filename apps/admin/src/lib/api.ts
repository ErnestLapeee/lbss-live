const API_BASE = '/api';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API error: ${res.status}`);
  }
  return res.json();
}

export function apiGet<T>(path: string) { return apiFetch<T>(path); }
export function apiPost<T>(path: string, data: unknown) { return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(data) }); }
export function apiPut<T>(path: string, data: unknown) { return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(data) }); }
export function apiDelete<T>(path: string) { return apiFetch<T>(path, { method: 'DELETE' }); }
