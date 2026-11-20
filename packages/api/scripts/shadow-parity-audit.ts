/**
 * Read-only shadow parity audit for finalized games.
 * Compares canonical reducer state and event-derived batting/pitching summaries
 * against stored `games` and `player_game_*` rows without mutating any table.
 *
 * Run:
 *   DATABASE_URL=... pnpm --filter @lbss/api run shadow-parity-audit
 */
import { eq, and } from 'drizzle-orm';
import {
  aggregatePitchingStatsByPitcher,
  computePlayerGameBattingLinesFromEvents,
  inningsFromOuts,
  reduceGameState,
  type EventType,
  type GameEvent,
} from '@lbss/shared';
import { db } from '../src/db/index.js';
import {
  games,
  gameEvents,
  gameLineups,
  playerGameBatting,
  playerGamePitching,
} from '../src/db/schema/index.js';

function toSharedEvent(row: typeof gameEvents.$inferSelect): GameEvent {
  return {
    id: row.id,
    gameId: row.gameId,
    eventNumber: row.eventNumber,
    inning: row.inning,
    half: row.half === 'bot' ? 'bot' : 'top',
    batterId: row.batterId ?? null,
    pitcherId: row.pitcherId ?? null,
    eventType: row.eventType as EventType,
    eventDetail: row.eventDetail ?? null,
    rbi: row.rbi ?? 0,
    runsScored: row.runsScored ?? 0,
    outsRecorded: row.outsRecorded ?? 0,
    errorsOnPlay: row.errorsOnPlay ?? 0,
    balls: row.balls ?? 0,
    strikes: row.strikes ?? 0,
    runnerFirstId: row.runnerFirstId ?? null,
    runnerSecondId: row.runnerSecondId ?? null,
    runnerThirdId: row.runnerThirdId ?? null,
    runnersScored: Array.isArray(row.runnersScored) ? (row.runnersScored as number[]) : [],
    isDeleted: Boolean(row.isDeleted),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
    createdBy: row.createdBy ?? null,
  };
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is not set. Provide a read-only database connection string to run the shadow parity audit.');
    process.exit(2);
  }

  const finalized = await db
    .select({
      id: games.id,
      status: games.status,
      isFinalized: games.isFinalized,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      currentInning: games.currentInning,
      currentHalf: games.currentHalf,
      currentOuts: games.currentOuts,
    })
    .from(games)
    .where(eq(games.isFinalized, true));

  let scoreDrifts = 0;
  let stateDrifts = 0;
  let battingDrifts = 0;
  let pitchingDrifts = 0;
  let statusAnomalies = 0;

  for (const g of finalized) {
    if (g.status !== 'final') {
      statusAnomalies++;
      console.log(`[STATUS] game=${g.id} isFinalized=true but status=${g.status}`);
    }

    const [events, lineups, storedBatting, storedPitching] = await Promise.all([
      db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, g.id), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber),
      db.select().from(gameLineups).where(eq(gameLineups.gameId, g.id)),
      db.select().from(playerGameBatting).where(eq(playerGameBatting.gameId, g.id)),
      db.select().from(playerGamePitching).where(eq(playerGamePitching.gameId, g.id)),
    ]);

    const reduced = reduceGameState(events.map(toSharedEvent));
    if ((g.homeScore ?? 0) !== reduced.homeScore || (g.awayScore ?? 0) !== reduced.awayScore) {
      scoreDrifts++;
      console.log(
        `[SCORE] game=${g.id} stored=${g.awayScore ?? 0}-${g.homeScore ?? 0} reduced=${reduced.awayScore}-${reduced.homeScore}`,
      );
    }
    if (
      (g.currentInning ?? 1) !== reduced.inning ||
      (g.currentHalf ?? 'top') !== reduced.half ||
      (g.currentOuts ?? 0) !== reduced.outs
    ) {
      stateDrifts++;
      console.log(
        `[STATE] game=${g.id} stored=${g.currentInning ?? 1}/${g.currentHalf ?? 'top'}/${g.currentOuts ?? 0} reduced=${reduced.inning}/${reduced.half}/${reduced.outs}`,
      );
    }

    const playerTeamMap = new Map<number, number>();
    for (const l of lineups) {
      if (l.isActive && l.playerId != null) playerTeamMap.set(l.playerId, l.teamId);
    }
    for (const l of lineups) {
      if (l.playerId != null && !playerTeamMap.has(l.playerId)) playerTeamMap.set(l.playerId, l.teamId);
    }

    const derivedBatting = computePlayerGameBattingLinesFromEvents({
      events,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      playerTeamMap,
    });
    const storedBattingByPlayer = new Map(storedBatting.map((r) => [r.playerId, r]));
    for (const [playerId, line] of derivedBatting) {
      const stored = storedBattingByPlayer.get(playerId);
      if (
        !stored ||
        stored.plateAppearances !== line.plateAppearances ||
        stored.atBats !== line.atBats ||
        stored.hits !== line.hits ||
        stored.runs !== line.runs ||
        stored.rbi !== line.rbi
      ) {
        battingDrifts++;
        console.log(
          `[BATTING] game=${g.id} player=${playerId} stored=${stored ? `${stored.hits}/${stored.atBats} R:${stored.runs} RBI:${stored.rbi}` : 'missing'} derived=${line.hits}/${line.atBats} R:${line.runs} RBI:${line.rbi}`,
        );
      }
    }

    const derivedPitching = aggregatePitchingStatsByPitcher(
      events.map((e) => ({
        eventNumber: e.eventNumber,
        eventType: e.eventType,
        inning: e.inning,
        half: e.half,
        pitcherId: e.pitcherId,
        runsScored: e.runsScored,
        outsRecorded: e.outsRecorded,
        runnerScoredReasons: e.runnerScoredReasons as string[] | null,
        errorsOnPlay: e.errorsOnPlay,
        eventDetail: e.eventDetail,
        hitType: e.hitType,
      })),
    );
    const storedPitchingByPlayer = new Map(storedPitching.map((r) => [r.playerId, r]));
    for (const [pitcherId, line] of derivedPitching) {
      const stored = storedPitchingByPlayer.get(pitcherId);
      const derivedIp = String(inningsFromOuts(line.outsRecorded));
      if (
        !stored ||
        String(stored.inningsPitched) !== derivedIp ||
        stored.runsAllowed !== line.runsAllowed ||
        stored.earnedRuns !== line.earnedRuns ||
        stored.strikeouts !== line.strikeouts
      ) {
        pitchingDrifts++;
        console.log(
          `[PITCHING] game=${g.id} pitcher=${pitcherId} stored=${stored ? `IP:${stored.inningsPitched} R:${stored.runsAllowed} ER:${stored.earnedRuns} K:${stored.strikeouts}` : 'missing'} derived=IP:${derivedIp} R:${line.runsAllowed} ER:${line.earnedRuns} K:${line.strikeouts}`,
        );
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        checkedFinalizedGames: finalized.length,
        statusAnomalies,
        scoreDrifts,
        stateDrifts,
        battingDrifts,
        pitchingDrifts,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
