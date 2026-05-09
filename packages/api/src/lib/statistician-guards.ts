import type { FastifyRequest } from 'fastify';

export function isStatistician(request: FastifyRequest): boolean {
  return request.user?.role === 'statistician';
}
