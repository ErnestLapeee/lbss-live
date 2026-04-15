import type { FastifyInstance } from 'fastify';
import { hash } from 'argon2';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { validatePasswordStrength } from '../../lib/password-policy.js';

export async function adminUsersRoutes(app: FastifyInstance) {
  // GET / - list all users
  app.get('/', async (request, reply) => {
    try {
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

  // POST / - create user (disabled by default; use DB + db:set-password or seed)
  app.post<{
    Body: {
      email: string;
      password: string;
      displayName: string;
      role?: string;
    };
  }>('/', async (request, reply) => {
    if (process.env.ALLOW_ADMIN_USER_CREATE !== 'true') {
      return reply.status(403).send({
        message:
          'Creating users from the admin UI is disabled. Add users in the database or set ALLOW_ADMIN_USER_CREATE=true for a controlled environment.',
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

      const passwordHash = await hash(password);

      const [user] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          displayName,
          role: role ?? 'public',
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
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid user id' });
      }

      const { email, displayName, role } = request.body ?? {};

      const [user] = await db
        .update(users)
        .set({
          ...(email !== undefined && { email }),
          ...(displayName !== undefined && { displayName }),
          ...(role !== undefined && { role }),
        })
        .where(eq(users.id, id))
        .returning();

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
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid user id' });
      }

      const [user] = await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, id))
        .returning();

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
