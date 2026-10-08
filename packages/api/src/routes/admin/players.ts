import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { players, playerSeasons, licenses, playerAccolades, seasons, teams } from '../../db/schema/index.js';
import { and, desc, eq } from 'drizzle-orm';
import { normalizeHonor } from '../../lib/honor-merge.js';
import { slugify } from '../../utils/slugify.js';

export async function adminPlayersRoutes(app: FastifyInstance) {
  // GET / - list all players
  app.get('/', async (request, reply) => {
    try {
      const result = await db.select().from(players);
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch players' });
    }
  });

  // POST / - create player
  app.post<{
    Body: {
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      nationality?: string;
      throws?: string;
      bats?: string;
      heightCm?: number;
      weightKg?: number;
      photoUrl?: string;
      bio?: string;
    };
  }>('/', async (request, reply) => {
    try {
      const {
        firstName,
        lastName,
        dateOfBirth,
        nationality,
        throws: throwsHand,
        bats,
        heightCm,
        weightKg,
        photoUrl,
        bio,
      } = request.body ?? {};

      if (!firstName || !lastName) {
        return reply.status(400).send({ message: 'firstName and lastName required' });
      }

      const slug = slugify(`${firstName}-${lastName}`);

      const [player] = await db
        .insert(players)
        .values({
          firstName,
          lastName,
          slug,
          dateOfBirth: dateOfBirth ?? null,
          nationality: nationality ?? 'LV',
          throws: throwsHand ?? null,
          bats: bats ?? null,
          heightCm: heightCm ?? null,
          weightKg: weightKg ?? null,
          photoUrl: photoUrl ?? null,
          bio: bio ?? null,
        })
        .returning();

      return reply.status(201).send(player);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create player' });
    }
  });

  // PUT /:id - update player
  app.put<{
    Params: { id: string };
    Body: {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      nationality?: string;
      throws?: string;
      bats?: string;
      heightCm?: number;
      weightKg?: number;
      photoUrl?: string;
      bio?: string;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid player id' });
      }

      const body = request.body ?? {};
      const updateData: Record<string, unknown> = {};
      if (body.firstName !== undefined) updateData.firstName = body.firstName;
      if (body.lastName !== undefined) updateData.lastName = body.lastName;
      if (body.dateOfBirth !== undefined)
        updateData.dateOfBirth = body.dateOfBirth;
      if (body.nationality !== undefined) updateData.nationality = body.nationality;
      if (body.throws !== undefined) updateData.throws = body.throws;
      if (body.bats !== undefined) updateData.bats = body.bats;
      if (body.heightCm !== undefined) updateData.heightCm = body.heightCm;
      if (body.weightKg !== undefined) updateData.weightKg = body.weightKg;
      if (body.photoUrl !== undefined) updateData.photoUrl = body.photoUrl;
      if (body.bio !== undefined) updateData.bio = body.bio;

      if (body.firstName !== undefined || body.lastName !== undefined) {
        const [existing] = await db
          .select({ firstName: players.firstName, lastName: players.lastName })
          .from(players)
          .where(eq(players.id, id))
          .limit(1);
        if (existing) {
          updateData.slug = slugify(
            `${body.firstName ?? existing.firstName}-${body.lastName ?? existing.lastName}`
          );
        }
      }

      const [player] = await db
        .update(players)
        .set(updateData)
        .where(eq(players.id, id))
        .returning();

      if (!player) {
        return reply.status(404).send({ message: 'Player not found' });
      }

      return reply.send(player);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update player' });
    }
  });

  // DELETE /:id - soft delete (set isActive=false)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid player id' });
      }

      const [player] = await db
        .update(players)
        .set({ isActive: false })
        .where(eq(players.id, id))
        .returning();

      if (!player) {
        return reply.status(404).send({ message: 'Player not found' });
      }

      return reply.send({ message: 'Player deactivated' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete player' });
    }
  });

  // POST /:id/roster - add player to team for a season
  app.post<{
    Params: { id: string };
    Body: { teamId: number; seasonId: number; jerseyNumber?: string; position?: string };
  }>('/:id/roster', async (request, reply) => {
    try {
      const playerId = parseInt(request.params.id, 10);
      if (isNaN(playerId)) {
        return reply.status(400).send({ message: 'Invalid player id' });
      }

      const { teamId, seasonId, jerseyNumber, position } = request.body ?? {};
      if (!teamId || !seasonId) {
        return reply.status(400).send({ message: 'teamId and seasonId required' });
      }

      const [existingRosterEntry] = await db
        .select()
        .from(playerSeasons)
        .where(and(
          eq(playerSeasons.playerId, playerId),
          eq(playerSeasons.teamId, teamId),
          eq(playerSeasons.seasonId, seasonId),
        ))
        .limit(1);

      if (existingRosterEntry) {
        return reply.send(existingRosterEntry);
      }

      const [rosterEntry] = await db
        .insert(playerSeasons)
        .values({
          playerId,
          teamId,
          seasonId,
          jerseyNumber: jerseyNumber ?? null,
          position: position ?? null,
        })
        .returning();

      // Auto-create a license record (unpaid by default)
      await db
        .insert(licenses)
        .values({
          playerId,
          seasonId,
          status: 'pending',
          paymentStatus: 'unpaid',
        })
        .onConflictDoNothing();

      return reply.status(201).send(rosterEntry);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to add player to roster' });
    }
  });

  app.get<{ Params: { id: string } }>('/:id/accolades', async (request, reply) => {
    const playerId = parseInt(request.params.id, 10);
    if (!Number.isFinite(playerId)) return reply.status(400).send({ message: 'Invalid player id' });
    try {
      const rows = await db
        .select({
          id: playerAccolades.id,
          playerId: playerAccolades.playerId,
          seasonId: playerAccolades.seasonId,
          teamId: playerAccolades.teamId,
          seasonYear: playerAccolades.seasonYear,
          honor: playerAccolades.honor,
          label: playerAccolades.label,
          teamName: teams.name,
          seasonName: seasons.name,
        })
        .from(playerAccolades)
        .leftJoin(teams, eq(playerAccolades.teamId, teams.id))
        .leftJoin(seasons, eq(playerAccolades.seasonId, seasons.id))
        .where(eq(playerAccolades.playerId, playerId))
        .orderBy(desc(playerAccolades.seasonYear), desc(playerAccolades.id));
      return reply.send(rows);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to load honors' });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { seasonYear?: number; seasonId?: number | null; teamId?: number | null; honor?: string; label?: string | null };
  }>('/:id/accolades', async (request, reply) => {
    const playerId = parseInt(request.params.id, 10);
    if (!Number.isFinite(playerId)) return reply.status(400).send({ message: 'Invalid player id' });
    const honor = normalizeHonor(String(request.body?.honor ?? ''));
    const label = typeof request.body?.label === 'string' ? request.body.label.trim() : '';
    let seasonYear = Number(request.body?.seasonYear);
    const seasonId = request.body?.seasonId != null ? Number(request.body.seasonId) : null;
    const teamId = request.body?.teamId != null ? Number(request.body.teamId) : null;
    if (honor === 'custom' && !label) {
      return reply.status(400).send({ message: 'A custom honor needs a name' });
    }
    if (label.length > 80) return reply.status(400).send({ message: 'Honor name is too long' });
    try {
      const [player] = await db.select({ id: players.id }).from(players).where(eq(players.id, playerId)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });
      if (seasonId != null && Number.isFinite(seasonId)) {
        const [season] = await db.select({ year: seasons.year }).from(seasons).where(eq(seasons.id, seasonId)).limit(1);
        if (!season) return reply.status(400).send({ message: 'Season not found' });
        seasonYear = season.year;
      }
      if (!Number.isFinite(seasonYear) || seasonYear < 1900 || seasonYear > 2200) {
        return reply.status(400).send({ message: 'Enter a year' });
      }
      const [row] = await db
        .insert(playerAccolades)
        .values({
          playerId,
          seasonId: seasonId != null && Number.isFinite(seasonId) ? seasonId : null,
          teamId: teamId != null && Number.isFinite(teamId) ? teamId : null,
          seasonYear,
          honor,
          label: label || null,
        })
        .returning();
      return reply.status(201).send(row);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to save honor' });
    }
  });

  app.delete<{ Params: { id: string; accoladeId: string } }>('/:id/accolades/:accoladeId', async (request, reply) => {
    const playerId = parseInt(request.params.id, 10);
    const accoladeId = parseInt(request.params.accoladeId, 10);
    if (!Number.isFinite(playerId) || !Number.isFinite(accoladeId)) {
      return reply.status(400).send({ message: 'Invalid id' });
    }
    try {
      const [row] = await db
        .delete(playerAccolades)
        .where(and(eq(playerAccolades.id, accoladeId), eq(playerAccolades.playerId, playerId)))
        .returning({ id: playerAccolades.id });
      if (!row) return reply.status(404).send({ message: 'Honor not found' });
      return reply.send({ ok: true });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete honor' });
    }
  });
}
