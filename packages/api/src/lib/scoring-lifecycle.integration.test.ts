import test from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';

const TEST_DB_URL = process.env.TEST_DATABASE_URL?.trim();

if (!TEST_DB_URL) {
  test('scoring lifecycle DB integration tests (skipped without TEST_DATABASE_URL)', { skip: 'Set TEST_DATABASE_URL to run PostgreSQL concurrency and rollback integration tests' }, () => {});
} else {
  // Explicitly route API DB connection to the dedicated test database only.
  process.env.DATABASE_URL = TEST_DB_URL;

  const [
    { db },
    schema,
    { buildApp },
    { finalizeGame },
  ] = await Promise.all([
    import('../db/index.js'),
    import('../db/schema/index.js'),
    import('../app.js'),
    import('../services/finalize-game.js'),
  ]);

  const {
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
    sessions,
    users,
  } = schema;

  async function createFixture() {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const [adminUser] = await db.insert(users).values({
      email: `test-admin-${suffix}@example.com`,
      passwordHash: 'not-used-in-direct-session',
      displayName: 'Test Admin',
      role: 'admin',
    }).returning();

    const [season] = await db.insert(seasons).values({
      year: 2099,
      name: `Test Season ${suffix}`,
      leagueLevel: 'adult',
    }).returning();

    const [league] = await db.insert(leagues).values({
      seasonId: season.id,
      name: `Test League ${suffix}`,
      slug: `test-league-${suffix}`,
    }).returning();

    const [homeTeam] = await db.insert(teams).values({
      name: `Home ${suffix}`,
      shortName: 'HOM',
      slug: `home-${suffix}`,
    }).returning();
    const [awayTeam] = await db.insert(teams).values({
      name: `Away ${suffix}`,
      shortName: 'AWY',
      slug: `away-${suffix}`,
    }).returning();

    await db.insert(leagueTeams).values([
      { leagueId: league.id, teamId: homeTeam.id },
      { leagueId: league.id, teamId: awayTeam.id },
    ]);

    const homePlayers: number[] = [];
    const awayPlayers: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const [hp] = await db.insert(players).values({
        firstName: `Home${i}`,
        lastName: suffix,
        slug: `home-${i}-${suffix}`,
      }).returning();
      homePlayers.push(hp.id);
      const [ap] = await db.insert(players).values({
        firstName: `Away${i}`,
        lastName: suffix,
        slug: `away-${i}-${suffix}`,
      }).returning();
      awayPlayers.push(ap.id);
    }

    await db.insert(playerSeasons).values([
      ...homePlayers.map((playerId, i) => ({ playerId, teamId: homeTeam.id, seasonId: season.id, jerseyNumber: String(i + 1) })),
      ...awayPlayers.map((playerId, i) => ({ playerId, teamId: awayTeam.id, seasonId: season.id, jerseyNumber: String(i + 1) })),
    ]);

    const [game] = await db.insert(games).values({
      leagueId: league.id,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      scheduledAt: new Date(),
      status: 'scheduled',
    }).returning();

    const sessionId = `test-session-${suffix}`;
    await db.insert(sessions).values({
      id: sessionId,
      userId: adminUser.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const cookie = `session=${sessionId}`;

    return {
      adminUser,
      season,
      league,
      homeTeam,
      awayTeam,
      homePlayers,
      awayPlayers,
      game,
      cookie,
      async cleanup() {
        await db.delete(playerGameFielding).where(eq(playerGameFielding.gameId, game.id));
        await db.delete(playerGamePitching).where(eq(playerGamePitching.gameId, game.id));
        await db.delete(playerGameBatting).where(eq(playerGameBatting.gameId, game.id));
        await db.delete(gameEvents).where(eq(gameEvents.gameId, game.id));
        await db.delete(gameLineups).where(eq(gameLineups.gameId, game.id));
        await db.delete(games).where(eq(games.id, game.id));
        await db.delete(standings).where(eq(standings.leagueId, league.id));
        await db.delete(playerSeasonBatting).where(eq(playerSeasonBatting.seasonId, season.id));
        await db.delete(playerSeasonPitching).where(eq(playerSeasonPitching.seasonId, season.id));
        await db.delete(playerSeasonFielding).where(eq(playerSeasonFielding.seasonId, season.id));
        await db.delete(playerSeasons).where(eq(playerSeasons.seasonId, season.id));
        await db.delete(leagueTeams).where(eq(leagueTeams.leagueId, league.id));
        await db.delete(leagues).where(eq(leagues.id, league.id));
        await db.delete(seasons).where(eq(seasons.id, season.id));
        for (const pid of [...homePlayers, ...awayPlayers]) {
          await db.delete(players).where(eq(players.id, pid));
        }
        await db.delete(teams).where(eq(teams.id, homeTeam.id));
        await db.delete(teams).where(eq(teams.id, awayTeam.id));
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        await db.delete(users).where(eq(users.id, adminUser.id));
      },
    };
  }

  test('serialized concurrent mutations, idempotent retries, status transitions, and atomic finalization rollback', async () => {
    const app = await buildApp();
    const fx = await createFixture();
    try {
      // Cannot start before lineups exist
      const prematureStart = await app.inject({
        method: 'POST',
        url: `/api/admin/scoring/${fx.game.id}/start`,
        headers: { cookie: fx.cookie },
      });
      assert.equal(prematureStart.statusCode, 400);

      // Cannot bypass lifecycle via generic admin PUT
      const bypassFinal = await app.inject({
        method: 'PUT',
        url: `/api/admin/games/${fx.game.id}`,
        headers: { cookie: fx.cookie },
        payload: { status: 'final' },
      });
      assert.equal(bypassFinal.statusCode, 409);

      // Submit starting lineups
      const lineupRes = await app.inject({
        method: 'POST',
        url: `/api/admin/scoring/${fx.game.id}/lineup`,
        headers: { cookie: fx.cookie },
        payload: {
          home: fx.homePlayers.slice(0, 9).map((playerId, i) => ({ playerId, battingOrder: i + 1, position: i + 1 })),
          away: fx.awayPlayers.slice(0, 9).map((playerId, i) => ({ playerId, battingOrder: i + 1, position: i + 1 })),
        },
      });
      assert.equal(lineupRes.statusCode, 200);

      // Start -> pause -> resume transitions
      const startRes = await app.inject({
        method: 'POST',
        url: `/api/admin/scoring/${fx.game.id}/start`,
        headers: { cookie: fx.cookie },
      });
      assert.equal(startRes.statusCode, 200);

      const pauseRes = await app.inject({
        method: 'POST',
        url: `/api/admin/scoring/${fx.game.id}/pause`,
        headers: { cookie: fx.cookie },
      });
      assert.equal(pauseRes.statusCode, 200);

      const resumeRes = await app.inject({
        method: 'POST',
        url: `/api/admin/scoring/${fx.game.id}/resume`,
        headers: { cookie: fx.cookie },
      });
      assert.equal(resumeRes.statusCode, 200);

      // Concurrent duplicate event retries with same clientOpId produce exactly one event
      const opId = `op-dup-${Date.now()}`;
      const [evA, evB] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/admin/scoring/${fx.game.id}/event`,
          headers: { cookie: fx.cookie },
          payload: {
            clientOpId: opId,
            inning: 1,
            half: 'top',
            batterId: fx.awayPlayers[0],
            pitcherId: fx.homePlayers[0],
            eventType: 'single',
            runnerFirstId: fx.awayPlayers[0],
          },
        }),
        app.inject({
          method: 'POST',
          url: `/api/admin/scoring/${fx.game.id}/event`,
          headers: { cookie: fx.cookie },
          payload: {
            clientOpId: opId,
            inning: 1,
            half: 'top',
            batterId: fx.awayPlayers[0],
            pitcherId: fx.homePlayers[0],
            eventType: 'single',
            runnerFirstId: fx.awayPlayers[0],
          },
        }),
      ]);
      assert.equal(evA.statusCode, 200);
      assert.equal(evB.statusCode, 200);
      const eventsAfterDup = await db.select().from(gameEvents).where(eq(gameEvents.gameId, fx.game.id));
      assert.equal(eventsAfterDup.length, 1);

      // Concurrent distinct appends serialize cleanly without duplicate event_number errors
      const [p1, p2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/admin/scoring/${fx.game.id}/event`,
          headers: { cookie: fx.cookie },
          payload: {
            clientOpId: `op-p1-${Date.now()}`,
            inning: 1,
            half: 'top',
            batterId: fx.awayPlayers[1],
            pitcherId: fx.homePlayers[0],
            eventType: 'pitch',
            eventDetail: 'ball',
          },
        }),
        app.inject({
          method: 'POST',
          url: `/api/admin/scoring/${fx.game.id}/event`,
          headers: { cookie: fx.cookie },
          payload: {
            clientOpId: `op-p2-${Date.now()}`,
            inning: 1,
            half: 'top',
            batterId: fx.awayPlayers[1],
            pitcherId: fx.homePlayers[0],
            eventType: 'pitch',
            eventDetail: 'called_strike',
          },
        }),
      ]);
      assert.equal(p1.statusCode, 200);
      assert.equal(p2.statusCode, 200);

      // Concurrent undo with same targetEventNumber only undoes once
      const [u1, u2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/admin/scoring/${fx.game.id}/undo`,
          headers: { cookie: fx.cookie },
          payload: { clientOpId: `op-undo-1-${Date.now()}`, targetEventNumber: 3 },
        }),
        app.inject({
          method: 'POST',
          url: `/api/admin/scoring/${fx.game.id}/undo`,
          headers: { cookie: fx.cookie },
          payload: { clientOpId: `op-undo-2-${Date.now()}`, targetEventNumber: 3 },
        }),
      ]);
      assert.equal(u1.statusCode, 200);
      assert.equal(u2.statusCode, 200);
      const activeAfterUndo = await db.select().from(gameEvents).where(and(eq(gameEvents.gameId, fx.game.id), eq(gameEvents.isDeleted, false)));
      assert.equal(activeAfterUndo.length, 2);

      // Concurrent redo with same clientOpId only redoes once
      const redoOpId = `op-redo-${Date.now()}`;
      const [r1, r2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/admin/scoring/${fx.game.id}/redo`,
          headers: { cookie: fx.cookie },
          payload: { clientOpId: redoOpId, targetEventNumber: 3 },
        }),
        app.inject({
          method: 'POST',
          url: `/api/admin/scoring/${fx.game.id}/redo`,
          headers: { cookie: fx.cookie },
          payload: { clientOpId: redoOpId, targetEventNumber: 3 },
        }),
      ]);
      assert.equal(r1.statusCode, 200);
      assert.equal(r2.statusCode, 200);
      const activeAfterRedo = await db.select().from(gameEvents).where(and(eq(gameEvents.gameId, fx.game.id), eq(gameEvents.isDeleted, false)));
      assert.equal(activeAfterRedo.length, 3);

      // Failure injected during finalization rolls back ALL derived rows, season stats, standings, and game status
      await assert.rejects(
        () => finalizeGame(fx.game.id, fx.adminUser.id, {
          beforeCommitHook: async () => {
            throw new Error('INJECTED_FINALIZE_FAILURE');
          },
        }),
        /INJECTED_FINALIZE_FAILURE/,
      );

      const [gameAfterFail] = await db.select().from(games).where(eq(games.id, fx.game.id)).limit(1);
      assert.equal(gameAfterFail?.isFinalized, false);
      assert.equal(gameAfterFail?.status, 'live');
      const gameBattingAfterFail = await db.select().from(playerGameBatting).where(eq(playerGameBatting.gameId, fx.game.id));
      const seasonBattingAfterFail = await db.select().from(playerSeasonBatting).where(eq(playerSeasonBatting.seasonId, fx.season.id));
      const standingsAfterFail = await db.select().from(standings).where(eq(standings.leagueId, fx.league.id));
      assert.equal(gameBattingAfterFail.length, 0);
      assert.equal(seasonBattingAfterFail.length, 0);
      assert.equal(standingsAfterFail.length, 0);

      // Normal finalization commits cleanly and blocks second finalize
      const finRes = await app.inject({
        method: 'POST',
        url: `/api/admin/scoring/${fx.game.id}/finalize`,
        headers: { cookie: fx.cookie },
      });
      assert.equal(finRes.statusCode, 200);

      const finAgain = await app.inject({
        method: 'POST',
        url: `/api/admin/scoring/${fx.game.id}/finalize`,
        headers: { cookie: fx.cookie },
      });
      assert.equal(finAgain.statusCode, 409);
    } finally {
      await fx.cleanup();
      await app.close();
    }
  });
}
