import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema/index.js';
import { eq, and, gt } from 'drizzle-orm';

/** Roles allowed into the admin API at all; `public` accounts are not staff. */
const STAFF_ROLES = new Set(['admin', 'league_official', 'statistician']);

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === 'OPTIONS') return;

  // Exact pathname match: a substring check on the full URL let `?x=/auth/login` skip auth on any route.
  const pathname = request.url.split('?')[0];
  if (pathname === '/api/admin/auth/login' || pathname === '/api/admin/auth/logout') {
    return;
  }

  const sessionId = request.cookies?.session;
  if (!sessionId) {
    return reply.status(401).send({ message: 'Authentication required' });
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) {
    return reply.status(401).send({ message: 'Invalid or expired session' });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || !user.isActive) {
    return reply.status(401).send({ message: 'User not found or inactive' });
  }

  if (!STAFF_ROLES.has(user.role ?? '')) {
    return reply.status(403).send({ message: 'This account does not have admin access.' });
  }

  request.user = user;
  request.sessionId = sessionId;
}
