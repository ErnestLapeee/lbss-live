import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { seasons } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

export async function adminSeasonsRoutes(app: FastifyInstance) {
  // GET / - list all seasons
  app.get('/', async (request, reply) => {
    try {
      const result = await db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.year));
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch seasons' });
    }
  });

  // GET /:id - get season by id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const [season] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.id, id))
        .limit(1);

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      return reply.send(season);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });

  // POST / - create season
  app.post<{
    Body: { year: number; name: string; startDate?: string; endDate?: string; isActive?: boolean };
  }>('/', async (request, reply) => {
    try {
      const { year, name, startDate, endDate, isActive } = request.body ?? {};
      if (!year || !name) {
        return reply.status(400).send({ message: 'year and name required' });
      }

      const [season] = await db
        .insert(seasons)
        .values({
          year,
          name,
          startDate: startDate ?? null,
          endDate: endDate ?? null,
          isActive: isActive ?? false,
        })
        .returning();

      return reply.status(201).send(season);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create season' });
    }
  });

  // PUT /:id - update season
  app.put<{
    Params: { id: string };
    Body: { year?: number; name?: string; startDate?: string; endDate?: string; isActive?: boolean };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const { year, name, startDate, endDate, isActive } = request.body ?? {};

      const [season] = await db
        .update(seasons)
        .set({
          ...(year !== undefined && { year }),
          ...(name !== undefined && { name }),
          ...(startDate !== undefined && { startDate }),
          ...(endDate !== undefined && { endDate }),
          ...(isActive !== undefined && { isActive }),
        })
        .where(eq(seasons.id, id))
        .returning();

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      return reply.send(season);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update season' });
    }
  });

  // DELETE /:id - delete season
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const deleted = await db
        .delete(seasons)
        .where(eq(seasons.id, id))
        .returning({ id: seasons.id });

      if (deleted.length === 0) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      return reply.send({ message: 'Season deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete season' });
    }
  });
}
