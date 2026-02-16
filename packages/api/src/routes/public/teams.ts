import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  teams,
  playerSeasons,
  players,
  playerSeasonBatting,
  playerGameFielding,
  licenses,
} from '../../db/schema/index.js';
import { eq, and, sql, inArray } from 'drizzle-orm';

export async function teamsRoutes(app: FastifyInstance) {
  // GET / - list all active teams
  app.get('/', async (request, reply) => {
    try {
      const result = await db
        .select()
        .from(teams)
        .where(eq(teams.isActive, true));
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch teams' });
    }
  });

  // GET /:slug - get team by slug
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    try {
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.slug, request.params.slug))
        .limit(1);

      if (!team || !team.isActive) {
        return reply.status(404).send({ message: 'Team not found' });
      }

      return reply.send(team);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch team' });
    }
  });

  // GET /:slug/roster - get team roster for a season (query param seasonId)
  app.get<{
    Params: { slug: string };
    Querystring: { seasonId?: string };
  }>('/:slug/roster', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }

      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.slug, request.params.slug))
        .limit(1);

      if (!team || !team.isActive) {
        return reply.status(404).send({ message: 'Team not found' });
      }

      const roster = await db
        .select({
          playerId: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          slug: players.slug,
          jerseyNumber: playerSeasons.jerseyNumber,
          position: playerSeasons.position,
          bats: players.bats,
          throws: players.throws,
          licensePaid: licenses.paymentStatus,
        })
        .from(playerSeasons)
        .innerJoin(players, eq(playerSeasons.playerId, players.id))
        .leftJoin(licenses, and(
          eq(licenses.playerId, playerSeasons.playerId),
          eq(licenses.seasonId, playerSeasons.seasonId),
        ))
        .where(
          and(
            eq(playerSeasons.teamId, team.id),
            eq(playerSeasons.seasonId, seasonIdNum)
          )
        );

      const POS_LABELS: Record<number, string> = {
        1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF',
      };

      const playerIds = roster.map(r => r.playerId);
      let posMap: Record<number, string> = {};

      if (playerIds.length > 0) {
        const fieldingRows = await db
          .select({
            playerId: playerGameFielding.playerId,
            position: playerGameFielding.position,
            games: sql<number>`count(*)`.as('games'),
          })
          .from(playerGameFielding)
          .where(
            and(
              inArray(playerGameFielding.playerId, playerIds),
              eq(playerGameFielding.teamId, team.id),
            )
          )
          .groupBy(playerGameFielding.playerId, playerGameFielding.position)
          .orderBy(sql`count(*) desc`);

        const playerPosMap: Record<number, { pos: number; games: number }[]> = {};
        for (const row of fieldingRows) {
          if (row.position == null) continue;
          if (!playerPosMap[row.playerId]) playerPosMap[row.playerId] = [];
          playerPosMap[row.playerId].push({ pos: row.position, games: Number(row.games) });
        }

        for (const [pid, entries] of Object.entries(playerPosMap)) {
          const sorted = entries.sort((a, b) => b.games - a.games);
          if (sorted.length === 0) continue;
          const top = sorted[0];
          const second = sorted[1];
          if (second && second.games >= top.games * 0.6) {
            posMap[Number(pid)] = `${POS_LABELS[top.pos] || top.pos}/${POS_LABELS[second.pos] || second.pos}`;
          } else {
            posMap[Number(pid)] = POS_LABELS[top.pos] || String(top.pos);
          }
        }
      }

      const enriched = roster.map(r => ({
        ...r,
        position: r.position || posMap[r.playerId] || null,
      }));

      return reply.send(enriched);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch roster' });
    }
  });

  // GET /:slug/stats - get team batting stats for a season (query param seasonId)
  app.get<{
    Params: { slug: string };
    Querystring: { seasonId?: string };
  }>('/:slug/stats', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }

      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.slug, request.params.slug))
        .limit(1);

      if (!team || !team.isActive) {
        return reply.status(404).send({ message: 'Team not found' });
      }

      const stats = await db
        .select()
        .from(playerSeasonBatting)
        .where(
          and(
            eq(playerSeasonBatting.teamId, team.id),
            eq(playerSeasonBatting.seasonId, seasonIdNum)
          )
        );

      return reply.send(stats);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch team stats' });
    }
  });
}
