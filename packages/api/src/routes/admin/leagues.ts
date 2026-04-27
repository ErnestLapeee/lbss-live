import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { leagueTeams, leagues, playerSeasons, seasons, standings, teams } from '../../db/schema/index.js';
import { and, asc, eq, inArray } from 'drizzle-orm';

export async function adminLeaguesRoutes(app: FastifyInstance) {
  // GET / - list all leagues
  app.get('/', async (request, reply) => {
    try {
      // IMPORTANT: do not `select()` all columns from leagues, because production DB may lag behind
      // app schema during deployments/migration rollbacks. Keep this to core columns.
      const result = await db.select({
        id: leagues.id,
        seasonId: leagues.seasonId,
        name: leagues.name,
        slug: leagues.slug,
        sport: leagues.sport,
        level: leagues.level,
        createdAt: leagues.createdAt,
      }).from(leagues);
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch leagues' });
    }
  });

  // POST / - create league
  app.post<{
    Body: {
      seasonId: number;
      name: string;
      slug: string;
      sport?: string;
      level?: string;
    };
  }>('/', async (request, reply) => {
    try {
      const { seasonId, name, slug, sport, level } = request.body ?? {};
      if (!seasonId || !name || !slug) {
        return reply.status(400).send({ message: 'seasonId, name, and slug required' });
      }

      const [league] = await db
        .insert(leagues)
        .values({
          seasonId,
          name,
          slug,
          sport: sport ?? 'baseball',
          level: level ?? 'senior',
        })
        .returning();

      return reply.status(201).send(league);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create league' });
    }
  });

  // GET /:id/teams — teams registered in this league (for schedules / standings)
  app.get<{ Params: { id: string } }>('/:id/teams', async (request, reply) => {
    try {
      const leagueId = parseInt(request.params.id, 10);
      if (isNaN(leagueId)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }
      const [league] = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.id, leagueId)).limit(1);
      if (!league) {
        return reply.status(404).send({ message: 'League not found' });
      }
      const rows = await db
        .select({
          teamId: leagueTeams.teamId,
          name: teams.name,
          shortName: teams.shortName,
        })
        .from(leagueTeams)
        .innerJoin(teams, eq(teams.id, leagueTeams.teamId))
        .where(eq(leagueTeams.leagueId, leagueId))
        .orderBy(asc(teams.name));
      return reply.send(rows);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch league teams' });
    }
  });

  // PUT /:id/teams — replace which teams participate in this league (full set)
  app.put<{
    Params: { id: string };
    Body: { teamIds: number[] };
  }>('/:id/teams', async (request, reply) => {
    try {
      const leagueId = parseInt(request.params.id, 10);
      if (isNaN(leagueId)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }
      const raw = (request.body as { teamIds?: unknown } | undefined)?.teamIds;
      const teamIds = Array.isArray(raw) ? raw.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
      const unique = [...new Set(teamIds)];

      const [league] = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.id, leagueId)).limit(1);
      if (!league) {
        return reply.status(404).send({ message: 'League not found' });
      }

      if (unique.length > 0) {
        const found = await db
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.id, unique));
        if (found.length !== unique.length) {
          return reply.status(400).send({ message: 'One or more team ids are invalid' });
        }
      }

      await db.transaction(async (tx) => {
        const current = await tx
          .select({ teamId: leagueTeams.teamId })
          .from(leagueTeams)
          .where(eq(leagueTeams.leagueId, leagueId));
        const cur = new Set(current.map((c) => c.teamId));
        const want = new Set(unique);
        const toRemove = [...cur].filter((id) => !want.has(id));
        const toAdd = [...want].filter((id) => !cur.has(id));
        if (toRemove.length > 0) {
          await tx
            .delete(leagueTeams)
            .where(and(eq(leagueTeams.leagueId, leagueId), inArray(leagueTeams.teamId, toRemove)));
        }
        if (toAdd.length > 0) {
          await tx.insert(leagueTeams).values(toAdd.map((teamId) => ({ leagueId, teamId })));
        }
      });

      return reply.send({ teamIds: unique });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update league teams' });
    }
  });

  // POST /:id/import-rosters — copy player_seasons from another season for teams in this league
  app.post<{
    Params: { id: string };
    Body: { sourceSeasonId: number };
  }>('/:id/import-rosters', async (request, reply) => {
    try {
      const leagueId = parseInt(request.params.id, 10);
      if (isNaN(leagueId)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }
      const sourceSeasonId = Number((request.body as { sourceSeasonId?: unknown })?.sourceSeasonId);
      if (!Number.isFinite(sourceSeasonId)) {
        return reply.status(400).send({ message: 'sourceSeasonId required' });
      }

      const [league] = await db
        .select({ id: leagues.id, seasonId: leagues.seasonId })
        .from(leagues)
        .where(eq(leagues.id, leagueId))
        .limit(1);
      if (!league) {
        return reply.status(404).send({ message: 'League not found' });
      }
      const targetSeasonId = league.seasonId;
      if (sourceSeasonId === targetSeasonId) {
        return reply.status(400).send({ message: 'Source and target season must differ' });
      }

      const [sourceSeasonRow] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.id, sourceSeasonId))
        .limit(1);
      if (!sourceSeasonRow) {
        return reply.status(400).send({ message: 'Source season not found' });
      }

      const teamLinks = await db
        .select({ teamId: leagueTeams.teamId })
        .from(leagueTeams)
        .where(eq(leagueTeams.leagueId, leagueId));
      const teamIds = teamLinks.map((t) => t.teamId);
      if (teamIds.length === 0) {
        return reply.send({ imported: 0, skipped: 0, message: 'No teams in this league — add teams first.' });
      }

      const sourceRoster = await db
        .select()
        .from(playerSeasons)
        .where(and(eq(playerSeasons.seasonId, sourceSeasonId), inArray(playerSeasons.teamId, teamIds)));

      const existingTarget = await db
        .select({ playerId: playerSeasons.playerId, teamId: playerSeasons.teamId })
        .from(playerSeasons)
        .where(eq(playerSeasons.seasonId, targetSeasonId));
      const alreadyInTarget = new Set(existingTarget.map((r) => `${r.playerId}:${r.teamId}`));

      let imported = 0;
      let skipped = 0;

      await db.transaction(async (tx) => {
        for (const row of sourceRoster) {
          const targetKey = `${row.playerId}:${row.teamId}`;
          if (alreadyInTarget.has(targetKey)) {
            skipped++;
            continue;
          }
          await tx.insert(playerSeasons).values({
            playerId: row.playerId,
            teamId: row.teamId,
            seasonId: targetSeasonId,
            jerseyNumber: row.jerseyNumber,
            position: row.position,
            role: row.role ?? 'player',
          });
          alreadyInTarget.add(targetKey);
          imported++;
        }
      });

      return reply.send({
        imported,
        skipped,
        message: `Imported ${imported} roster slot(s); skipped ${skipped} (already on that team this season).`,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to import rosters' });
    }
  });

  // PUT /:id - update league
  app.put<{
    Params: { id: string };
    Body: {
      seasonId?: number;
      name?: string;
      slug?: string;
      sport?: string;
      level?: string;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }

      const { seasonId, name, slug, sport, level } = request.body ?? {};

      const [league] = await db
        .update(leagues)
        .set({
          ...(seasonId !== undefined && { seasonId }),
          ...(name !== undefined && { name }),
          ...(slug !== undefined && { slug }),
          ...(sport !== undefined && { sport }),
          ...(level !== undefined && { level }),
        })
        .where(eq(leagues.id, id))
        .returning();

      if (!league) {
        return reply.status(404).send({ message: 'League not found' });
      }

      return reply.send(league);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update league' });
    }
  });

  // DELETE /:id - delete league
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }

      const deleted = await db.transaction(async (tx) => {
        // Remove dependent data that references this league so FK constraints don't block deletion.
        await tx.delete(standings).where(eq(standings.leagueId, id));
        await tx.delete(leagueTeams).where(eq(leagueTeams.leagueId, id));

        return tx
          .delete(leagues)
          .where(eq(leagues.id, id))
          .returning({ id: leagues.id });
      });

      if (deleted.length === 0) {
        return reply.status(404).send({ message: 'League not found' });
      }

      return reply.send({ message: 'League deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete league' });
    }
  });
}
