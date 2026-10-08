import type { FastifyInstance } from 'fastify';
import { hash } from 'argon2';
import { db } from '../../db/index.js';
import { sessions, users } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { validatePasswordStrength } from '../../lib/password-policy.js';

const ALLOWED_ROLES = new Set(['public', 'admin', 'league_official', 'statistician']);

async function otherActiveAdmins(userId: number): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, true)));
  return rows.filter((row) => row.id !== userId).length;
}

export async function adminUsersRoutes(app: FastifyInstance) {
  // GET / - list all users
  app.get('/', async (request, reply) => {
    try {
      if (request.user?.role === 'statistician') {
        return reply.status(403).send({ message: 'Scorer accounts cannot manage users.' });
      }
      const result = await db.select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      }).from(users);
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch users' });
    }
  });

  // POST / - create user. Only an administrator can do this.
  app.post<{
    Body: {
      email: string;
      password: string;
      displayName: string;
      role?: string;
    };
  }>('/', async (request, reply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({
        message: 'Only administrators can create new users from the admin panel.',
      });
    }
    try {
      const { email, password, displayName, role } = request.body ?? {};

      if (!email || !password || !displayName) {
        return reply
          .status(400)
          .send({ message: 'email, password, and displayName required' });
      }

      const passwordCheck = validatePasswordStrength(password);
      if (!passwordCheck.ok) {
        return reply.status(400).send({ message: passwordCheck.message });
      }

      const roleNorm = role != null && ALLOWED_ROLES.has(String(role)) ? String(role) : 'public';

      const passwordHash = await hash(password);

      const [user] = await db
        .insert(users)
        .values({
          email: String(email).trim(),
          passwordHash,
          displayName: String(displayName).trim(),
          role: roleNorm,
        })
        .returning();

      return reply.status(201).send({
        id: user!.id,
        email: user!.email,
        displayName: user!.displayName,
        role: user!.role,
      });
    } catch (err) {
      request.log.error(err);
      const code =
        err && typeof err === 'object'
          ? ((err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code)
          : undefined;
      if (code === '23505') {
        return reply.status(409).send({ message: 'That email is already registered.' });
      }
      return reply.status(500).send({ message: 'Failed to create user' });
    }
  });

  // PUT /:id - update user (not password)
  app.put<{
    Params: { id: string };
    Body: {
      email?: string;
      displayName?: string;
      role?: string;
    };
  }>('/:id', async (request, reply) => {
    try {
      if (request.user?.role !== 'admin') {
        return reply.status(403).send({ message: 'Only administrators can edit users.' });
      }
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid user id' });
      }

      const { email, displayName, role } = request.body ?? {};
      if (role !== undefined && !ALLOWED_ROLES.has(String(role))) {
        return reply.status(400).send({ message: 'Invalid role' });
      }

      let roleChanged = false;
      if (role !== undefined) {
        const [existing] = await db
          .select({ role: users.role, isActive: users.isActive })
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        if (!existing) {
          return reply.status(404).send({ message: 'User not found' });
        }
        roleChanged = existing.role !== role;
        if (role !== 'admin' && existing.role === 'admin' && existing.isActive && (await otherActiveAdmins(id)) === 0) {
          return reply.status(400).send({ message: 'The last administrator cannot be changed to another role.' });
        }
      }

      const [user] = await db
        .update(users)
        .set({
          ...(email !== undefined && { email }),
          ...(displayName !== undefined && { displayName }),
          ...(role !== undefined && { role }),
        })
        .where(eq(users.id, id))
        .returning();
      if (roleChanged) {
        await db.delete(sessions).where(eq(sessions.userId, id));
      }

      if (!user) {
        return reply.status(404).send({ message: 'User not found' });
      }

      return reply.send({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update user' });
    }
  });

  // DELETE /:id - soft delete (set isActive=false)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      if (request.user?.role !== 'admin') {
        return reply.status(403).send({ message: 'Only administrators can deactivate users.' });
      }
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid user id' });
      }

      const [existing] = await db
        .select({ role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        return reply.status(404).send({ message: 'User not found' });
      }
      if (existing.role === 'admin' && existing.isActive && (await otherActiveAdmins(id)) === 0) {
        return reply.status(400).send({ message: 'The last administrator cannot be deactivated.' });
      }

      const [user] = await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, id))
        .returning();
      await db.delete(sessions).where(eq(sessions.userId, id));

      if (!user) {
        return reply.status(404).send({ message: 'User not found' });
      }

      return reply.send({ message: 'User deactivated' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete user' });
    }
  });
}
