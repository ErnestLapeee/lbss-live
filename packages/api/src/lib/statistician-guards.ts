import type { FastifyRequest } from 'fastify';

export function isStatistician(request: FastifyRequest): boolean {
  return request.user?.role === 'statistician';
}

/** Scorers may change games and the live book. The path has to be that prefix, not a string that merely contains it. */
export function scorerMayMutate(rawUrl: string): boolean {
  let path = rawUrl.split('?')[0] ?? '';
  try {
    path = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) return false;
  return path === '/api/admin/games' || path.startsWith('/api/admin/games/') || path.startsWith('/api/admin/scoring/');
}
