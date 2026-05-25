import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  teams,
  leagueTeams,
  players,
  playerSeasons,
  licenses,
} from '../../db/schema/index.js';
import { games } from '../../db/schema/games.js';
import { leagues } from '../../db/schema/leagues.js';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { slugify } from '../../utils/slugify.js';

export async function adminTeamsRoutes(app: FastifyInstance) {
  // GET / - list teams; optional ?seasonId= limits to clubs in that workspace season (league membership and/or season rosters)
  app.get<{ Querystring: { seasonId?: string } }>('/', async (request, reply) => {
    try {
      const seasonIdStr = request.query?.seasonId;
      if (seasonIdStr === undefined || seasonIdStr === '') {
        const result = await db.select().from(teams).orderBy(asc(teams.name));
        return reply.send(result);
      }
      const sid = parseInt(seasonIdStr, 10);
      if (Number.isNaN(sid)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }
      const seasonTeamIds = new Set<number>();
      const rosterTeamRows = await db
        .selectDistinct({ teamId: playerSeasons.teamId })
        .from(playerSeasons)
        .where(eq(playerSeasons.seasonId, sid));
      for (const r of rosterTeamRows) seasonTeamIds.add(r.teamId);

      const leagueTeamRows = await db
        .selectDistinct({ teamId: leagueTeams.teamId })
        .from(leagueTeams)
        .innerJoin(leagues, eq(leagueTeams.leagueId, leagues.id))
        .where(eq(leagues.seasonId, sid));
      for (const r of leagueTeamRows) seasonTeamIds.add(r.teamId);

      const ids = [...seasonTeamIds];
      if (ids.length === 0) {
        return reply.send([]);
      }
      const result = await db.select().from(teams).where(inArray(teams.id, ids)).orderBy(asc(teams.name));
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

      const activeTeams = await db.select().from(teams).where(eq(teams.isActive, true));

      if (!seasonId) {
        // Return teams with empty rosters if no season selected
        return reply.send(activeTeams.map(t => ({ ...t, players: [] })));
      }

      // Only clubs that actually participate this season (league membership and/or roster rows).
      const seasonTeamIds = new Set<number>();

      const rosterTeamRows = await db
        .selectDistinct({ teamId: playerSeasons.teamId })
        .from(playerSeasons)
        .where(eq(playerSeasons.seasonId, seasonId));
      for (const r of rosterTeamRows) seasonTeamIds.add(r.teamId);

      const leagueTeamRows = await db
        .selectDistinct({ teamId: leagueTeams.teamId })
        .from(leagueTeams)
        .innerJoin(leagues, eq(leagueTeams.leagueId, leagues.id))
        .where(eq(leagues.seasonId, seasonId));
      for (const r of leagueTeamRows) seasonTeamIds.add(r.teamId);

      const ids = [...seasonTeamIds];
      if (ids.length === 0) {
        return reply.send([]);
      }

      const allTeams = (await db.select().from(teams).where(inArray(teams.id, ids))).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

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

  // PATCH /roster/:rosterId - update roster fields (jersey number, etc.)
  app.patch<{
    Params: { rosterId: string };
    Body: { jerseyNumber?: string | null };
  }>('/roster/:rosterId', async (request, reply) => {
    try {
      const rosterId = parseInt(request.params.rosterId, 10);
      if (isNaN(rosterId)) {
        return reply.status(400).send({ message: 'Invalid roster id' });
      }

      const body = request.body ?? {};
      if (!('jerseyNumber' in body)) {
        return reply.status(400).send({ message: 'No fields to update' });
      }

      const jerseyRaw = body.jerseyNumber != null ? String(body.jerseyNumber).trim() : '';
      const jerseyNumber = jerseyRaw === '' ? null : jerseyRaw.slice(0, 5);

      const updated = await db
        .update(playerSeasons)
        .set({ jerseyNumber })
        .where(eq(playerSeasons.id, rosterId))
        .returning({
          id: playerSeasons.id,
          jerseyNumber: playerSeasons.jerseyNumber,
        });

      if (updated.length === 0) {
        return reply.status(404).send({ message: 'Roster entry not found' });
      }

      return reply.send(updated[0]);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update roster entry' });
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
      /** When set, the club is linked to this season only via league_teams (not visible on other seasons' roster screens). */
      seasonId?: number;
      /** Required when the season has more than one league. Must belong to seasonId. */
      leagueId?: number;
    };
  }>('/', async (request, reply) => {
    try {
      const {
        name,
        shortName,
        city,
        foundedYear,
        description,
        logoUrl,
        seasonId: seasonIdBody,
        leagueId: leagueIdBody,
      } = request.body ?? {};
      if (!name) {
        return reply.status(400).send({ message: 'name required' });
      }

      const slug = slugify(name);

      const seasonId =
        seasonIdBody !== undefined && seasonIdBody !== null
          ? parseInt(String(seasonIdBody), 10)
          : NaN;
      const wantsSeasonScope = Number.isFinite(seasonId);

      let targetLeagueId: number | null = null;
      if (wantsSeasonScope) {
        const leagueIdParsed =
          leagueIdBody !== undefined && leagueIdBody !== null
            ? parseInt(String(leagueIdBody), 10)
            : NaN;
        if (Number.isFinite(leagueIdParsed)) {
          const [lg] = await db
            .select({ id: leagues.id })
            .from(leagues)
            .where(and(eq(leagues.id, leagueIdParsed), eq(leagues.seasonId, seasonId)))
            .limit(1);
          if (!lg) {
            return reply.status(400).send({ message: 'leagueId does not belong to that season' });
          }
          targetLeagueId = lg.id;
        } else {
          const inSeason = await db
            .select({ id: leagues.id })
            .from(leagues)
            .where(eq(leagues.seasonId, seasonId));
          if (inSeason.length === 0) {
            return reply.status(400).send({
              message:
                'This season has no league yet. Create one under Leagues, then add the team again (or omit seasonId to create an unattached club).',
            });
          }
          if (inSeason.length > 1) {
            return reply.status(400).send({
              message:
                'This season has multiple leagues; pass leagueId so we know which competition the team joins.',
            });
          }
          targetLeagueId = inSeason[0]!.id;
        }
      }

      const [team] = await db.transaction(async (tx) => {
        const [t] = await tx
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

        if (wantsSeasonScope && targetLeagueId != null) {
          await tx.insert(leagueTeams).values({ leagueId: targetLeagueId, teamId: t.id });
        }

        return [t];
      });

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

  // POST /:id/reactivate — undo global soft-deactivate (teams.isActive is org-wide, not per season)
  app.post<{ Params: { id: string } }>('/:id/reactivate', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid team id' });
      }

      const [team] = await db
        .update(teams)
        .set({ isActive: true })
        .where(eq(teams.id, id))
        .returning();

      if (!team) {
        return reply.status(404).send({ message: 'Team not found' });
      }

      return reply.send({ message: 'Team reactivated', team });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to reactivate team' });
    }
  });

  // DELETE /:id — soft delete (set isActive=false) for the whole organization.
  // Blocked while the club still has league links, games, or any roster history so one season cannot "remove" it globally by mistake.
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid team id' });
      }

      const [inLeague] = await db
        .select({ id: leagueTeams.id })
        .from(leagueTeams)
        .where(eq(leagueTeams.teamId, id))
        .limit(1);
      if (inLeague) {
        return reply.status(409).send({
          message:
            'This club is still registered in one or more leagues. To stop it competing in the current season only, open Season setup, uncheck it for that league, and click Save team membership. That removes the league link without hiding the club in other years.',
        });
      }

      const [onRoster] = await db
        .select({ id: playerSeasons.id })
        .from(playerSeasons)
        .where(eq(playerSeasons.teamId, id))
        .limit(1);
      if (onRoster) {
        return reply.status(409).send({
          message:
            'This club still has roster rows in player history. Remove players from rosters (or transfer them) before deactivating the organization, or use Season setup to remove the club from a league for one season only.',
        });
      }

      const [hasGame] = await db
        .select({ id: games.id })
        .from(games)
        .where(or(eq(games.homeTeamId, id), eq(games.awayTeamId, id)))
        .limit(1);
      if (hasGame) {
        return reply.status(409).send({
          message:
            'This club appears on scheduled or recorded games. Deactivating it is blocked until those references are resolved.',
        });
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
