import type { FastifyInstance } from 'fastify';
import { hash, verify } from 'argon2';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import { users, sessions } from '../../db/schema/index.js';
import { eq, and, gt } from 'drizzle-orm';

export async function authRoutes(app: FastifyInstance) {
  // POST /login - accepts {email, password}
  app.post<{
    Body: { email?: string; password?: string };
  }>('/login', async (request, reply) => {
    try {
      const { email, password } = request.body ?? {};
      if (!email || !password) {
        return reply.status(400).send({ message: 'Email and password required' });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user || !user.isActive) {
        return reply.status(401).send({ message: 'Invalid credentials' });
      }

      const valid = await verify(user.passwordHash, password);
      if (!valid) {
        return reply.status(401).send({ message: 'Invalid credentials' });
      }

      const sessionId = nanoid(40);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await db.insert(sessions).values({
        id: sessionId,
        userId: user.id,
        expiresAt,
      });

      reply.setCookie('session', sessionId, {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
        expires: expiresAt,
      });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
        },
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Login failed' });
    }
  });

  // POST /logout - delete session, clear cookie
  app.post('/logout', async (request, reply) => {
    try {
      const sessionId = request.cookies?.session;
      if (sessionId) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
      }
      reply.clearCookie('session', { path: '/', sameSite: 'none', secure: true });
      return reply.send({ message: 'Logged out' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Logout failed' });
    }
  });

  // GET /me - return current user (does its own session lookup
  // because Fastify encapsulation means the parent requireAuth hook
  // may not apply to routes registered in this child plugin)
  app.get('/me', async (request, reply) => {
    try {
      // Check if requireAuth already populated the user
      if (request.user) {
        const u = request.user;
        return reply.send({ id: u.id, email: u.email, displayName: u.displayName, role: u.role });
      }

      // Otherwise resolve session ourselves
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

      return reply.send({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to get user' });
    }
  });
}
