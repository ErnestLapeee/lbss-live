import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { teams, players, playerSeasons, licenses } from '../../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { slugify } from '../../utils/slugify.js';

export async function adminTeamsRoutes(app: FastifyInstance) {
  // GET / - list all teams
  app.get('/', async (request, reply) => {
    try {
      const result = await db.select().from(teams);
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch teams' });
    }
  });

  // GET /rosters?seasonId=X - get all teams with their players for a season
  app.get<{ Querystring: { seasonId?: string } }>('/rosters', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId ? parseInt(request.query.seasonId, 10) : null;

      const allTeams = await db.select().from(teams).where(eq(teams.isActive, true));

      if (!seasonId) {
        // Return teams with empty rosters if no season selected
        return reply.send(allTeams.map(t => ({ ...t, players: [] })));
      }

      // Get all roster entries for this season with player data and license status
      const rosterEntries = await db
        .select({
          rosterId: playerSeasons.id,
          playerId: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          jerseyNumber: playerSeasons.jerseyNumber,
          position: playerSeasons.position,
          teamId: playerSeasons.teamId,
          bats: players.bats,
          throws: players.throws,
          isActive: players.isActive,
          licensePaid: licenses.paymentStatus,
        })
        .from(playerSeasons)
        .innerJoin(players, eq(playerSeasons.playerId, players.id))
        .leftJoin(licenses, and(
          eq(licenses.playerId, playerSeasons.playerId),
          eq(licenses.seasonId, playerSeasons.seasonId),
        ))
        .where(eq(playerSeasons.seasonId, seasonId));

      // Group players by team
      const playersByTeam = new Map<number, typeof rosterEntries>();
      for (const entry of rosterEntries) {
        const list = playersByTeam.get(entry.teamId) || [];
        list.push(entry);
        playersByTeam.set(entry.teamId, list);
      }

      const result = allTeams.map(t => ({
        ...t,
        players: playersByTeam.get(t.id) || [],
      }));

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch rosters' });
    }
  });

  // PUT /roster/:rosterId/transfer - add a player to another team for the same season
  app.put<{
    Params: { rosterId: string };
    Body: { newTeamId: number };
  }>('/roster/:rosterId/transfer', async (request, reply) => {
    try {
      const rosterId = parseInt(request.params.rosterId, 10);
      if (isNaN(rosterId)) {
        return reply.status(400).send({ message: 'Invalid roster id' });
      }

      const { newTeamId } = request.body ?? {};
      if (!newTeamId) {
        return reply.status(400).send({ message: 'newTeamId required' });
      }

      const [sourceRoster] = await db
        .select()
        .from(playerSeasons)
        .where(eq(playerSeasons.id, rosterId))
        .limit(1);

      if (!sourceRoster) {
        return reply.status(404).send({ message: 'Roster entry not found' });
      }

      if (sourceRoster.teamId === newTeamId) {
        return reply.status(400).send({ message: 'Player is already on that team roster' });
      }

      const [existingTargetRoster] = await db
        .select()
        .from(playerSeasons)
        .where(and(
          eq(playerSeasons.playerId, sourceRoster.playerId),
          eq(playerSeasons.teamId, newTeamId),
          eq(playerSeasons.seasonId, sourceRoster.seasonId),
        ))
        .limit(1);

      if (existingTargetRoster) {
        return reply.send(existingTargetRoster);
      }

      const [created] = await db
        .insert(playerSeasons)
        .values({
          playerId: sourceRoster.playerId,
          teamId: newTeamId,
          seasonId: sourceRoster.seasonId,
          jerseyNumber: sourceRoster.jerseyNumber,
          position: sourceRoster.position,
          role: sourceRoster.role ?? 'player',
        })
        .returning();

      return reply.status(201).send(created);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to add player to team' });
    }
  });

  // DELETE /roster/:rosterId - remove a player from a team roster
  app.delete<{ Params: { rosterId: string } }>('/roster/:rosterId', async (request, reply) => {
    try {
      const rosterId = parseInt(request.params.rosterId, 10);
      if (isNaN(rosterId)) {
        return reply.status(400).send({ message: 'Invalid roster id' });
      }

      const deleted = await db
        .delete(playerSeasons)
        .where(eq(playerSeasons.id, rosterId))
        .returning({ id: playerSeasons.id });

      if (deleted.length === 0) {
        return reply.status(404).send({ message: 'Roster entry not found' });
      }

      return reply.send({ message: 'Player removed from roster' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to remove from roster' });
    }
  });

  // PUT /roster/:rosterId/toggle-license - toggle license payment status for a player
  app.put<{
    Params: { rosterId: string };
  }>('/roster/:rosterId/toggle-license', async (request, reply) => {
    try {
      const rosterId = parseInt(request.params.rosterId, 10);
      if (isNaN(rosterId)) {
        return reply.status(400).send({ message: 'Invalid roster id' });
      }

      // Get the roster entry to find playerId + seasonId
      const [roster] = await db
        .select()
        .from(playerSeasons)
        .where(eq(playerSeasons.id, rosterId))
        .limit(1);

      if (!roster) {
        return reply.status(404).send({ message: 'Roster entry not found' });
      }

      // Find existing license
      const [existing] = await db
        .select()
        .from(licenses)
        .where(and(
          eq(licenses.playerId, roster.playerId),
          eq(licenses.seasonId, roster.seasonId),
        ))
        .limit(1);

      if (existing) {
        // Toggle: paid -> unpaid, anything else -> paid
        const newStatus = existing.paymentStatus === 'paid' ? 'unpaid' : 'paid';
        const [updated] = await db
          .update(licenses)
          .set({
            paymentStatus: newStatus,
            status: newStatus === 'paid' ? 'approved' : 'pending',
            updatedAt: new Date(),
          })
          .where(eq(licenses.id, existing.id))
          .returning();
        return reply.send({ paymentStatus: updated.paymentStatus });
      } else {
        // Create new license as paid
        const [created] = await db
          .insert(licenses)
          .values({
            playerId: roster.playerId,
            seasonId: roster.seasonId,
            status: 'approved',
            paymentStatus: 'paid',
          })
          .returning();
        return reply.send({ paymentStatus: created.paymentStatus });
      }
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to toggle license' });
    }
  });

  // POST / - create team
  app.post<{
    Body: {
      name: string;
      shortName?: string;
      city?: string;
      foundedYear?: number;
      description?: string;
      logoUrl?: string;
    };
  }>('/', async (request, reply) => {
    try {
      const { name, shortName, city, foundedYear, description, logoUrl } = request.body ?? {};
      if (!name) {
        return reply.status(400).send({ message: 'name required' });
      }

      const slug = slugify(name);

      const [team] = await db
        .insert(teams)
        .values({
          name,
          shortName: shortName ?? null,
          city: city ?? null,
          foundedYear: foundedYear ?? null,
          description: description ?? null,
          logoUrl: logoUrl ?? null,
          slug,
        })
        .returning();

      return reply.status(201).send(team);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create team' });
    }
  });

  // PUT /:id - update team
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      shortName?: string;
      city?: string;
      foundedYear?: number;
      description?: string;
      logoUrl?: string;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid team id' });
      }

      const { name, shortName, city, foundedYear, description, logoUrl } = request.body ?? {};

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (shortName !== undefined) updateData.shortName = shortName;
      if (city !== undefined) updateData.city = city;
      if (foundedYear !== undefined) updateData.foundedYear = foundedYear;
      if (description !== undefined) updateData.description = description;
      if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
      if (name !== undefined) updateData.slug = slugify(name);

      const [team] = await db
        .update(teams)
        .set(updateData)
        .where(eq(teams.id, id))
        .returning();

      if (!team) {
        return reply.status(404).send({ message: 'Team not found' });
      }

      return reply.send(team);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update team' });
    }
  });

  // DELETE /:id - soft delete (set isActive=false)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid team id' });
      }

      const [team] = await db
        .update(teams)
        .set({ isActive: false })
        .where(eq(teams.id, id))
        .returning();

      if (!team) {
        return reply.status(404).send({ message: 'Team not found' });
      }

      return reply.send({ message: 'Team deactivated' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete team' });
    }
  });
}
