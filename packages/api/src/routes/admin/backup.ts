import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  seasons,
  leagues,
  teams,
  leagueTeams,
  players,
  playerSeasons,
  games,
  gameEvents,
  gameLineups,
  playerGameBatting,
  playerGamePitching,
  playerGameFielding,
  playerSeasonBatting,
  playerSeasonPitching,
  playerSeasonFielding,
  standings,
  licenses,
  payments,
  articles,
  users,
  playoffs,
  playoffSeries,
} from '../../db/schema/index.js';

export async function adminBackupRoutes(app: FastifyInstance) {

  app.get('/export', async (_request, reply) => {
    try {
      const [
        seasonsData,
        leaguesData,
        teamsData,
        leagueTeamsData,
        playersData,
        playerSeasonsData,
        gamesData,
        gameEventsData,
        gameLineupsData,
        playerGameBattingData,
        playerGamePitchingData,
        playerGameFieldingData,
        playerSeasonBattingData,
        playerSeasonPitchingData,
        playerSeasonFieldingData,
        standingsData,
        licensesData,
        paymentsData,
        articlesData,
        usersData,
        playoffsData,
        playoffSeriesData,
      ] = await Promise.all([
        db.select().from(seasons),
        db.select().from(leagues),
        db.select().from(teams),
        db.select().from(leagueTeams),
        db.select().from(players),
        db.select().from(playerSeasons),
        db.select().from(games),
        db.select().from(gameEvents),
        db.select().from(gameLineups),
        db.select().from(playerGameBatting),
        db.select().from(playerGamePitching),
        db.select().from(playerGameFielding),
        db.select().from(playerSeasonBatting),
        db.select().from(playerSeasonPitching),
        db.select().from(playerSeasonFielding),
        db.select().from(standings),
        db.select().from(licenses),
        db.select().from(payments),
        db.select().from(articles),
        db.select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          playerId: users.playerId,
          isActive: users.isActive,
          createdAt: users.createdAt,
        }).from(users),
        db.select().from(playoffs),
        db.select().from(playoffSeries),
      ]);

      const backup = {
        exportedAt: new Date().toISOString(),
        version: 2,
        data: {
          seasons: seasonsData,
          leagues: leaguesData,
          teams: teamsData,
          leagueTeams: leagueTeamsData,
          players: playersData,
          playerSeasons: playerSeasonsData,
          games: gamesData,
          gameEvents: gameEventsData,
          gameLineups: gameLineupsData,
          playerGameBatting: playerGameBattingData,
          playerGamePitching: playerGamePitchingData,
          playerGameFielding: playerGameFieldingData,
          playerSeasonBatting: playerSeasonBattingData,
          playerSeasonPitching: playerSeasonPitchingData,
          playerSeasonFielding: playerSeasonFieldingData,
          standings: standingsData,
          licenses: licensesData,
          payments: paymentsData,
          articles: articlesData,
          users: usersData,
          playoffs: playoffsData,
          playoffSeries: playoffSeriesData,
        },
      };

      const dateStr = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename=lbss-backup-${dateStr}.json`);
      return reply.send(backup);
    } catch (err) {
      _request.log.error(err);
      return reply.status(500).send({ message: 'Failed to export backup' });
    }
  });
}
