import type { FastifyRequest, FastifyReply } from 'fastify';

const ROLE_HIERARCHY: Record<string, number> = {
  public: 0,
  statistician: 1,
  league_official: 2,
  admin: 3,
};

export function requireRole(minRole: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ message: 'Authentication required' });
    }
    const roleKey = user.role ?? 'public';
    const userLevel = ROLE_HIERARCHY[roleKey] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
    if (userLevel < requiredLevel) {
      return reply.status(403).send({ message: 'Insufficient permissions' });
    }
  };
}
