import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { standings, teams, leagues } from '../../db/schema/index.js';
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';

type StandingsRowDto = {
  id: number;
  leagueId: number;
  teamId: number;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  gamesPlayed: number | null;
  runsScored: number | null;
  runsAllowed: number | null;
  winPct: string | null;
  gamesBehind: string | null;
  streak: string | null;
  lastTen: string | null;
};

async function fetchStandingsRows(leagueIds: number[], includeZero: boolean): Promise<StandingsRowDto[]> {
  if (leagueIds.length === 0) return [];

  return db
    .select({
      id: standings.id,
      leagueId: standings.leagueId,
      teamId: standings.teamId,
      teamName: teams.name,
      teamShortName: teams.shortName,
      teamLogoUrl: teams.logoUrl,
      wins: standings.wins,
      losses: standings.losses,
      ties: standings.ties,
      gamesPlayed: standings.gamesPlayed,
      runsScored: standings.runsScored,
      runsAllowed: standings.runsAllowed,
      winPct: standings.winPct,
      gamesBehind: standings.gamesBehind,
      streak: standings.streak,
      lastTen: standings.lastTen,
    })
    .from(standings)
    .innerJoin(teams, eq(standings.teamId, teams.id))
    .where(and(
      inArray(standings.leagueId, leagueIds),
      ...(includeZero ? [] : [gt(standings.gamesPlayed, 0)]),
    ))
    .orderBy(asc(standings.leagueId), desc(standings.winPct));
}

function groupByLeague(
  rows: StandingsRowDto[],
  leagueMeta: { id: number; name: string }[],
): { leagueId: number; leagueName: string; rows: StandingsRowDto[] }[] {
  const byLeague = new Map<number, StandingsRowDto[]>();
  for (const row of rows) {
    const list = byLeague.get(row.leagueId) ?? [];
    list.push(row);
    byLeague.set(row.leagueId, list);
  }
  return leagueMeta.map((lg) => ({
    leagueId: lg.id,
    leagueName: lg.name,
    rows: byLeague.get(lg.id) ?? [],
  }));
}

export async function standingsRoutes(app: FastifyInstance) {
  // GET /by-season/:seasonId — all leagues for a season in one request (register before /:leagueId)
  app.get<{
    Params: { seasonId: string };
    Querystring: { includeZeroGames?: string };
  }>('/by-season/:seasonId', async (request, reply) => {
    try {
      const seasonId = parseInt(request.params.seasonId, 10);
      if (isNaN(seasonId)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }
      const includeZero =
        request.query?.includeZeroGames === '1' || request.query?.includeZeroGames === 'true';

      const seasonLeagues = await db
        .select({ id: leagues.id, name: leagues.name })
        .from(leagues)
        .where(eq(leagues.seasonId, seasonId))
        .orderBy(asc(leagues.name));

      if (seasonLeagues.length === 0) {
        return reply.send({ seasonId, leagues: [] });
      }

      const leagueIds = seasonLeagues.map((l) => l.id);
      const rows = await fetchStandingsRows(leagueIds, includeZero);

      return reply.send({
        seasonId,
        leagues: groupByLeague(rows, seasonLeagues),
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch standings by season' });
    }
  });

  // GET /:leagueId - get standings for a league, ordered by winPct desc
  app.get<{ Params: { leagueId: string }; Querystring: { includeZeroGames?: string } }>(
    '/:leagueId',
    async (request, reply) => {
      try {
        const leagueId = parseInt(request.params.leagueId, 10);
        if (isNaN(leagueId)) {
          return reply.status(400).send({ message: 'Invalid league id' });
        }
        const includeZero =
          request.query?.includeZeroGames === '1' || request.query?.includeZeroGames === 'true';

        const result = await fetchStandingsRows([leagueId], includeZero);
        return reply.send(result);
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({ message: 'Failed to fetch standings' });
      }
    },
  );
}
