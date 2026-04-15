import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema/index.js';
import { eq, and, gt } from 'drizzle-orm';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === 'OPTIONS') return;

  // Skip auth for login and logout
  const path = request.url;
  if (path.includes('/auth/login') || path.includes('/auth/logout')) {
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

  (request as any).user = user;
  (request as any).sessionId = sessionId;
}
