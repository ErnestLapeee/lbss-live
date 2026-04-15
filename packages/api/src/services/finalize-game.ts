import { db } from '../db/index.js';
import {
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
  teams,
} from '../db/schema/index.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { aggregatePitchingStatsByPitcher, inningsFromOuts } from '@lbss/shared';

/* ═══════════════════════════════════════════════════════════════
   Event-type classification helpers (MLB Rules 9.02 – 9.16)
   ═══════════════════════════════════════════════════════════════ */

const HIT_EVENTS = new Set([
  'single', 'bunt_single',
  'double', 'ground_rule_double',
  'triple',
  'home_run', 'inside_park_hr',
]);

const STRIKEOUT_LOOKING = new Set(['strikeout_looking', 'caught_foul_tip', 'bunt_foul']);
const STRIKEOUT_SWINGING = new Set(['strikeout_swinging', 'dropped_third_strike', 'dropped_third_strike_out', 'wild_pitch_third_strike']);
const STRIKEOUT_EVENTS = new Set([
  'strikeout', 'strikeout_swinging', 'strikeout_looking',
  'caught_foul_tip', 'bunt_foul',
  'dropped_third_strike', 'dropped_third_strike_out',
  'wild_pitch_third_strike',
]);

const WALK_EVENTS = new Set(['walk', 'intentional_walk']);

const OUT_BATTED_EVENTS = new Set([
  'ground_out', 'fly_out', 'line_out', 'pop_out',
  'bunt_out', 'infield_fly', 'fielders_choice',
]);

const SACRIFICE_FLY_EVENTS = new Set(['sacrifice_fly', 'sac_fly_error']);
const SACRIFICE_BUNT_EVENTS = new Set(['sacrifice_bunt', 'sac_bunt_error']);

const NON_PA_EVENTS = new Set([
  'pitch',
  'stolen_base', 'caught_stealing', 'picked_off',
  'balk', 'illegal_pitch', 'wild_pitch', 'passed_ball',
  'end_half_inning', 'advance', 'defensive_indifference',
  'runner_interference', 'appeal_play', 'tagged_out', 'force_out',
  'hit_by_ball', 'missed_base', 'left_base_early', 'left_base_path',
  'offensive_interference', 'passed_runner', 'hesitation',
  'double_play', 'triple_play', 'advance_on_error',
]);

const GROUND_BALL_OUTS = new Set(['ground_out', 'bunt_out']);
const FLY_BALL_OUTS = new Set(['fly_out', 'line_out', 'pop_out', 'infield_fly']);

function isPlateAppearance(t: string): boolean {
  return !NON_PA_EVENTS.has(t);
}

function isAtBat(t: string): boolean {
  if (!isPlateAppearance(t)) return false;
  if (WALK_EVENTS.has(t)) return false;
  if (t === 'hit_by_pitch') return false;
  if (t === 'catcher_obstruction') return false;
  if (SACRIFICE_FLY_EVENTS.has(t)) return false;
  if (SACRIFICE_BUNT_EVENTS.has(t)) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   Main finalize function
   ═══════════════════════════════════════════════════════════════ */

export type FinalizeGameOptions = { recompute?: boolean };

export async function finalizeGame(gameId: number, userId?: number, options?: FinalizeGameOptions) {
  const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game) throw new Error('Game not found');
  if (game.isFinalized && !options?.recompute) throw new Error('Game already finalized');

  const events = await db
    .select()
    .from(gameEvents)
    .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
    .orderBy(gameEvents.eventNumber);

  const lineups = await db.select().from(gameLineups).where(eq(gameLineups.gameId, gameId));

  const playerTeamMap = new Map<number, number>();
  for (const entry of lineups) {
    playerTeamMap.set(entry.playerId, entry.teamId);
  }

  /* ── Per-game BATTING stats ── */

  // Infer the "actor" runner for runner events from base state changes, so SB/CS/PO
  // can be counted even if older data saved batterId as null.
  const runnerActorByEventId = new Map<number, number>();
  {
    let prev = { first: null as number | null, second: null as number | null, third: null as number | null };
    const getBaseState = (e: any) => ({
      first: e.runnerFirstId ?? null,
      second: e.runnerSecondId ?? null,
      third: e.runnerThirdId ?? null,
    });
    for (const e of events) {
      if (!e?.id) { prev = getBaseState(e); continue; }
      const t = e.eventType;
      const cur = getBaseState(e);

      if (t === 'stolen_base') {
        // Actor is the runner that moved up (id exists in cur at a higher base than prev).
        // Prefer 1->2, 2->3, 3->home (home not represented; for home steals we can't infer here).
        if (prev.first && cur.second === prev.first) runnerActorByEventId.set(e.id, prev.first);
        else if (prev.second && cur.third === prev.second) runnerActorByEventId.set(e.id, prev.second);
        else if (prev.first && cur.third === prev.first) runnerActorByEventId.set(e.id, prev.first);
      } else if (t === 'caught_stealing' || t === 'picked_off') {
        // Actor is the runner removed from bases.
        const prevIds = [prev.first, prev.second, prev.third].filter(Boolean) as number[];
        const curIds = new Set([cur.first, cur.second, cur.third].filter(Boolean) as number[]);
        const removed = prevIds.find(id => !curIds.has(id));
        if (removed) runnerActorByEventId.set(e.id, removed);
      }

      prev = cur;
    }
  }

  // Include all players who either had plate appearances OR runner events (SB, CS, etc.)
  const batterIds = new Set(events.filter(e => e.batterId).map(e => e.batterId!));

  for (const batterId of batterIds) {
    const playerEvents = events.filter(e => e.batterId === batterId && isPlateAppearance(e.eventType));
    const teamId = playerTeamMap.get(batterId) || game.homeTeamId;

    let pa = 0, ab = 0, hits = 0, singles = 0, doubles = 0, triples = 0, homeRuns = 0;
    let rbi = 0, walks = 0, strikeouts = 0, hitByPitch = 0;
    let sacrificeFlies = 0, sacrificeBunts = 0;
    let stolenBases = 0, caughtStealing = 0, errors = 0;
    let groundOuts = 0, flyOuts = 0, groundedIntoDoublePlays = 0;
    let intentionalWalks = 0, reachedOnError = 0;
    let buntSingles = 0, strikeoutsLooking = 0, strikeoutsSwinging = 0;
    let fieldersChoice = 0, catcherInterference = 0, groundedIntoTriplePlay = 0;

    for (const e of playerEvents) {
      const t = e.eventType;
      pa++;
      if (isAtBat(t)) ab++;
      rbi += e.rbi ?? 0;

      if (HIT_EVENTS.has(t)) {
        hits++;
        if (t === 'single' || t === 'bunt_single') {
          singles++;
          if (t === 'bunt_single') buntSingles++;
        } else if (t === 'double' || t === 'ground_rule_double') doubles++;
        else if (t === 'triple') triples++;
        else if (t === 'home_run' || t === 'inside_park_hr') homeRuns++;
      }

      if (STRIKEOUT_EVENTS.has(t)) {
        strikeouts++;
        if (STRIKEOUT_LOOKING.has(t)) strikeoutsLooking++;
        else if (STRIKEOUT_SWINGING.has(t)) strikeoutsSwinging++;
        else strikeoutsSwinging++; // generic 'strikeout' counts as swinging
      }
      if (WALK_EVENTS.has(t)) walks++;
      if (t === 'intentional_walk') intentionalWalks++;
      if (t === 'hit_by_pitch') hitByPitch++;
      if (SACRIFICE_FLY_EVENTS.has(t)) sacrificeFlies++;
      if (SACRIFICE_BUNT_EVENTS.has(t)) sacrificeBunts++;
      if (t === 'error' || t === 'sac_bunt_error' || t === 'sac_fly_error' || t === 'catcher_obstruction') {
        if (t === 'error') reachedOnError++;
        if (t === 'catcher_obstruction') catcherInterference++;
      }

      if (GROUND_BALL_OUTS.has(t)) groundOuts++;
      if (FLY_BALL_OUTS.has(t)) flyOuts++;
      if (t === 'fielders_choice') {
        fieldersChoice++;
        const ht = e.hitType;
        if (ht === 'grounder') groundOuts++;
        else flyOuts++;
      }

      const outs = e.outsRecorded ?? 0;
      if ((t === 'ground_out' || t === 'fielders_choice') && outs >= 2) {
        groundedIntoDoublePlays++;
        if (outs >= 3) groundedIntoTriplePlay++;
      }
    }

    let pickedOff = 0;
    for (const e of events) {
      if (e.eventType === 'picked_off' && e.batterId === batterId) pickedOff++;
    }

    // Count SB/CS from runner events where this batter was involved
    for (const e of events) {
      const actorId = (e.batterId ?? runnerActorByEventId.get(e.id)) as number | undefined;
      if (e.eventType === 'stolen_base' && actorId === batterId) stolenBases++;
      if (e.eventType === 'caught_stealing' && actorId === batterId) caughtStealing++;
    }

    // Count runs scored (when this player appears in runnersScored arrays)
    let runs = 0;
    for (const e of events) {
      const scored = (e.runnersScored as number[]) || [];
      if (scored.includes(batterId)) runs++;
    }

    const totalBases = singles + doubles * 2 + triples * 3 + homeRuns * 4;

    await db
      .insert(playerGameBatting)
      .values({
        gameId, playerId: batterId, teamId,
        plateAppearances: pa, atBats: ab, hits, singles, doubles, triples, homeRuns,
        rbi, runs, walks, strikeouts, hitByPitch,
        sacrificeFlies, sacrificeBunts, stolenBases, caughtStealing,
        errors: 0,
        groundOuts, flyOuts, groundedIntoDoublePlays,
        intentionalWalks, reachedOnError, totalBases,
        buntSingles, strikeoutsLooking, strikeoutsSwinging, pickedOff,
        fieldersChoice, catcherInterference, groundedIntoTriplePlay,
      })
      .onConflictDoUpdate({
        target: [playerGameBatting.gameId, playerGameBatting.playerId],
        set: {
          plateAppearances: pa, atBats: ab, hits, singles, doubles, triples, homeRuns,
          rbi, runs, walks, strikeouts, hitByPitch,
          sacrificeFlies, sacrificeBunts, stolenBases, caughtStealing,
          errors: 0,
          groundOuts, flyOuts, groundedIntoDoublePlays,
          intentionalWalks, reachedOnError, totalBases,
          buntSingles, strikeoutsLooking, strikeoutsSwinging, pickedOff,
          fieldersChoice, catcherInterference, groundedIntoTriplePlay,
        },
      });
  }

  /* ── Per-game PITCHING stats ── */

  const pitcherAgg = aggregatePitchingStatsByPitcher(
    events.map(e => ({
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

  const pitcherIds = new Set(events.filter(e => e.pitcherId).map(e => e.pitcherId!));

  for (const pitcherId of pitcherIds) {
    const a = pitcherAgg.get(pitcherId);
    if (!a) continue;
    const teamId = playerTeamMap.get(pitcherId) || game.homeTeamId;

    const outsRecorded = a.outsRecorded;
    const hitsAllowed = a.hitsAllowed;
    const runsAllowed = a.runsAllowed;
    const earnedRuns = a.earnedRuns;
    const walksAllowed = a.walksAllowed;
    const pStrikeouts = a.strikeouts;
    const homeRunsAllowed = a.homeRunsAllowed;
    const hitBatters = a.hitBatters;
    const wildPitches = a.wildPitches;
    const totalPitches = a.pitchesThrown;
    const pBalls = a.balls;
    const pStrikes = a.strikes;
    const firstPitchStrikes = a.firstPitchStrikes;
    const firstPitchTotal = a.firstPitchTotal;
    const battersFaced = a.battersFaced;
    const pBalks = a.balks;
    const pIntentionalWalks = a.intentionalWalks;
    const pGroundOuts = a.groundOuts;
    const pFlyOuts = a.flyOuts;
    const pStrikeoutsLooking = a.strikeoutsLooking;
    const pStrikeoutsSwinging = a.strikeoutsSwinging;

    const ip = inningsFromOuts(outsRecorded);
    const ipNum = Math.floor(outsRecorded / 3) + (outsRecorded % 3) / 3;

    const isStarter = lineups.some(l => l.playerId === pitcherId && l.isStarter && l.position === 1);
    const isCompleteGame = outsRecorded >= 27;
    const qualityStart = isStarter && ipNum >= 6 && earnedRuns <= 3 ? 1 : 0;
    const shutout = isCompleteGame && earnedRuns === 0 ? 1 : 0;
    const completeGames = isCompleteGame ? 1 : 0;
    const gameScoreVal = 50 + outsRecorded - 2 * (hitsAllowed + walksAllowed) - earnedRuns + pStrikeouts;

    await db
      .insert(playerGamePitching)
      .values({
        gameId, playerId: pitcherId, teamId,
        inningsPitched: String(ip),
        hitsAllowed, runsAllowed, earnedRuns, walksAllowed,
        strikeouts: pStrikeouts, homeRunsAllowed, hitBatters, wildPitches,
        pitchesThrown: totalPitches || null,
        balls: pBalls,
        strikes: pStrikes,
        firstPitchStrikes,
        firstPitchTotal,
        isStarter,
        decision: null,
        battersFaced, balks: pBalks,
        intentionalWalks: pIntentionalWalks,
        groundOuts: pGroundOuts, flyOuts: pFlyOuts,
        strikeoutsLooking: pStrikeoutsLooking,
        strikeoutsSwinging: pStrikeoutsSwinging,
        qualityStarts: qualityStart,
        shutouts: shutout,
        completeGames,
        gameScore: Math.max(0, Math.round(gameScoreVal)),
      })
      .onConflictDoUpdate({
        target: [playerGamePitching.gameId, playerGamePitching.playerId],
        set: {
          inningsPitched: String(ip),
          hitsAllowed, runsAllowed, earnedRuns, walksAllowed,
          strikeouts: pStrikeouts, homeRunsAllowed, hitBatters, wildPitches,
          pitchesThrown: totalPitches || null,
          balls: pBalls,
          strikes: pStrikes,
          firstPitchStrikes,
          firstPitchTotal,
          isStarter,
          battersFaced, balks: pBalks,
          intentionalWalks: pIntentionalWalks,
          groundOuts: pGroundOuts, flyOuts: pFlyOuts,
          strikeoutsLooking: pStrikeoutsLooking,
          strikeoutsSwinging: pStrikeoutsSwinging,
          qualityStarts: qualityStart,
          shutouts: shutout,
          completeGames,
          gameScore: Math.max(0, Math.round(gameScoreVal)),
        },
      });
  }

  /* ── Pitcher Win / Loss decisions ── */
  await assignPitcherDecisions(gameId, game, events, lineups);

  /* ── Per-game FIELDING stats ── */

  const fielderPutouts = new Map<number, number>();
  const fielderAssists = new Map<number, number>();
  const fielderErrors = new Map<number, number>();
  const fielderDP = new Map<number, number>();
  const fielderTP = new Map<number, number>();
  const fielderPB = new Map<number, number>();
  const fielderCSB = new Map<number, number>(); // catcher: stolen bases allowed
  const fielderCCS = new Map<number, number>(); // catcher: caught stealing
  const fielderPickoffs = new Map<number, number>();

  // Find catchers (position 2) for each team
  const homeCatcher = lineups.find(l => l.teamId === game.homeTeamId && l.position === 2);
  const awayCatcher = lineups.find(l => l.teamId === game.awayTeamId && l.position === 2);

  // Build position-to-player map for each team (for fieldingSequence fallback)
  const homePosToPid = new Map<number, number>();
  const awayPosToPid = new Map<number, number>();
  for (const l of lineups) {
    if (l.position && l.teamId === game.homeTeamId) homePosToPid.set(l.position, l.playerId);
    if (l.position && l.teamId === game.awayTeamId) awayPosToPid.set(l.position, l.playerId);
  }

  for (const e of events) {
    let po = (e.putoutFielderIds as number[]) || [];
    let ast = (e.assistFielderIds as number[]) || [];
    let err = (e.errorFielderIds as number[]) || [];

    const isTopHalf = e.half === 'top';
    const posMap = isTopHalf ? homePosToPid : awayPosToPid;

    // Fallback: if no player IDs but fieldingSequence exists, parse it
    if (e.fieldingSequence) {
      const seqStr = e.fieldingSequence;
      const isErrorSeq = seqStr.startsWith('E');
      if (isErrorSeq && err.length === 0) {
        // Error fielding: "E6" or "E4" → map position to player ID
        const positions = seqStr.replace(/^E/, '').split('').map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 9);
        err = positions.map(p => posMap.get(p)).filter((pid): pid is number => pid !== undefined);
      } else if (!isErrorSeq && po.length === 0 && ast.length === 0) {
        // Convention: last position = putout, others = assists
        const positions = seqStr.split('-').map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 9);
        if (positions.length > 0) {
          const lastPos = positions[positions.length - 1];
          const putoutPid = posMap.get(lastPos);
          if (putoutPid) po = [putoutPid];
          ast = positions.slice(0, -1)
            .map(p => posMap.get(p))
            .filter((pid): pid is number => pid !== undefined);
        }
      }
    }

    for (const pid of po) fielderPutouts.set(pid, (fielderPutouts.get(pid) || 0) + 1);
    for (const pid of ast) fielderAssists.set(pid, (fielderAssists.get(pid) || 0) + 1);
    for (const pid of err) fielderErrors.set(pid, (fielderErrors.get(pid) || 0) + 1);

    const t = e.eventType;

    // Double plays: credit all fielders involved
    if (t === 'double_play' || (e.outsRecorded ?? 0) >= 2) {
      for (const pid of [...po, ...ast]) {
        fielderDP.set(pid, (fielderDP.get(pid) || 0) + 1);
      }
    }

    // Triple plays
    if (t === 'triple_play' || (e.outsRecorded ?? 0) >= 3) {
      for (const pid of [...po, ...ast]) {
        fielderTP.set(pid, (fielderTP.get(pid) || 0) + 1);
      }
    }

    // Passed balls (credit to the catcher of the fielding team)
    if (t === 'passed_ball') {
      const catcher = isTopHalf ? homeCatcher : awayCatcher;
      if (catcher) fielderPB.set(catcher.playerId, (fielderPB.get(catcher.playerId) || 0) + 1);
    }

    // Stolen bases (charge to catcher)
    if (t === 'stolen_base') {
      const catcher = isTopHalf ? homeCatcher : awayCatcher;
      if (catcher) fielderCSB.set(catcher.playerId, (fielderCSB.get(catcher.playerId) || 0) + 1);
    }

    // Caught stealing (credit catcher)
    if (t === 'caught_stealing') {
      const catcher = isTopHalf ? homeCatcher : awayCatcher;
      if (catcher) fielderCCS.set(catcher.playerId, (fielderCCS.get(catcher.playerId) || 0) + 1);
    }

    // Pickoffs (credit pitcher or whoever is credited)
    if (t === 'picked_off') {
      if (e.pitcherId) fielderPickoffs.set(e.pitcherId, (fielderPickoffs.get(e.pitcherId) || 0) + 1);
    }
  }

  // Compute defensive innings per team from events
  // Home team fields during "top" halves, away team fields during "bot" halves
  const halfInnings = new Set<string>();
  for (const e of events) {
    if (e.inning && e.half) halfInnings.add(`${e.inning}-${e.half}`);
  }
  let homeDefensiveInnings = 0;
  let awayDefensiveInnings = 0;
  for (const hi of halfInnings) {
    const half = hi.split('-')[1];
    if (half === 'top') homeDefensiveInnings++;
    else awayDefensiveInnings++;
  }

  // Include ALL players who appeared in the lineup (so everyone gets a fielding record)
  const allFielders = new Set<number>();
  for (const l of lineups) allFielders.add(l.playerId);
  for (const pid of fielderPutouts.keys()) allFielders.add(pid);
  for (const pid of fielderAssists.keys()) allFielders.add(pid);
  for (const pid of fielderErrors.keys()) allFielders.add(pid);

  for (const pid of allFielders) {
    const teamId = playerTeamMap.get(pid) || game.homeTeamId;
    const putouts = fielderPutouts.get(pid) || 0;
    const assists = fielderAssists.get(pid) || 0;
    const errCount = fielderErrors.get(pid) || 0;
    const doublePlays = fielderDP.get(pid) || 0;
    const triplePlays = fielderTP.get(pid) || 0;
    const passedBalls = fielderPB.get(pid) || 0;
    const catcherStolenBases = fielderCSB.get(pid) || 0;
    const catcherCaughtStealing = fielderCCS.get(pid) || 0;
    const pickoffs = fielderPickoffs.get(pid) || 0;
    const lineupEntry = lineups.find(l => l.playerId === pid);
    const innings = teamId === game.homeTeamId ? homeDefensiveInnings : awayDefensiveInnings;

    await db
      .insert(playerGameFielding)
      .values({
        gameId, playerId: pid, teamId,
        position: lineupEntry?.position ?? null,
        innings: String(innings),
        putouts, assists, errors: errCount,
        doublePlays, triplePlays, passedBalls,
        catcherStolenBases, catcherCaughtStealing, pickoffs,
      })
      .onConflictDoUpdate({
        target: [playerGameFielding.gameId, playerGameFielding.playerId],
        set: {
          innings: String(innings),
          putouts, assists, errors: errCount,
          doublePlays, triplePlays, passedBalls,
          catcherStolenBases, catcherCaughtStealing, pickoffs,
        },
      });
  }

  /* ── Lock game (skip when recomputing already-finalized games) ── */
  if (!options?.recompute) {
    await db
      .update(games)
      .set({
        isFinalized: true,
        status: 'final',
        finalizedAt: new Date(),
        finalizedBy: userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(games.id, gameId));
  }

  /* ── Recompute season aggregates ── */
  const seasonResult = await db.execute(
    sql`SELECT s.id FROM seasons s JOIN leagues l ON l.season_id = s.id WHERE l.id = ${game.leagueId} LIMIT 1`
  );
  const rows = (seasonResult as any).rows ?? seasonResult;
  const seasonIdVal = Array.isArray(rows) ? rows[0]?.id : undefined;

  if (seasonIdVal) {
    try {
      await recomputeSeasonBatting(seasonIdVal);
    } catch (err) {
      console.error('[finalize] recomputeSeasonBatting failed:', err);
    }
    try {
      await recomputeSeasonPitching(seasonIdVal);
    } catch (err) {
      console.error('[finalize] recomputeSeasonPitching failed:', err);
    }
    try {
      await recomputeSeasonFielding(seasonIdVal);
    } catch (err) {
      console.error('[finalize] recomputeSeasonFielding failed:', err);
    }
  } else {
    console.error(`[finalize] Could not find seasonId for leagueId=${game.leagueId}. Season stats NOT recomputed.`);
  }

  try {
    await recomputeStandings(game.leagueId);
  } catch (err) {
    console.error('[finalize] recomputeStandings failed:', err);
  }

  return { success: true, gameId, seasonRecomputed: !!seasonIdVal };
}

/* ═══════════════════════════════════════════════════════════════
   Pitcher W/L assignment (simplified MLB Rule 9.17)
   ═══════════════════════════════════════════════════════════════ */

async function assignPitcherDecisions(
  gameId: number,
  game: any,
  events: any[],
  lineups: any[],
) {
  const homeScore = game.homeScore ?? 0;
  const awayScore = game.awayScore ?? 0;
  if (homeScore === awayScore) return; // tie, no decision

  // Clear any previous decisions for this game (important when re-finalizing / backfilling).
  await db.update(playerGamePitching)
    .set({ decision: null })
    .where(eq(playerGamePitching.gameId, gameId));

  const winningTeamId = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
  const losingTeamId = homeScore > awayScore ? game.awayTeamId : game.homeTeamId;

  // Find the scoring event where the winning team took the lead FOR GOOD.
  //
  // Old logic incorrectly overwrote the decision every time the winning team scored while already ahead.
  // This version:
  // - Determines the last point at which the winning team was NOT leading (tied or trailing).
  // - Finds the first scoring event after that point that puts the winning team in the lead.
  //
  // half='top' → away bats, home pitches (curHomePitcher)
  // half='bot' → home bats, away pitches (curAwayPitcher)
  let runH = 0, runA = 0;
  let curHomePitcher: number | null = null; // pitches in top half
  let curAwayPitcher: number | null = null; // pitches in bot half

  // Pass 1: compute the last eventNumber where winning team was NOT leading.
  let lastNotLeadingEvtNum = 0;
  for (const e of events) {
    if (e.half === 'top' && e.pitcherId) curHomePitcher = e.pitcherId;
    if (e.half === 'bot' && e.pitcherId) curAwayPitcher = e.pitcherId;

    const runs = e.runsScored ?? 0;
    if (runs > 0) {
      if (e.half === 'top') runA += runs; else runH += runs;
    }

    const winningIsHome = winningTeamId === game.homeTeamId;
    const winningScore = winningIsHome ? runH : runA;
    const losingScore = winningIsHome ? runA : runH;
    if (winningScore <= losingScore) {
      lastNotLeadingEvtNum = e.eventNumber ?? lastNotLeadingEvtNum;
    }
  }

  // Pass 2: find the go-ahead-for-good scoring event and assign pitcher of record.
  runH = 0; runA = 0;
  curHomePitcher = null; curAwayPitcher = null;
  let winPitcherId: number | null = null;
  let losePitcherId: number | null = null;

  for (const e of events) {
    if (e.half === 'top' && e.pitcherId) curHomePitcher = e.pitcherId;
    if (e.half === 'bot' && e.pitcherId) curAwayPitcher = e.pitcherId;

    const runs = e.runsScored ?? 0;
    if (runs <= 0) continue;

    const prevH = runH, prevA = runA;
    if (e.half === 'top') runA += runs; else runH += runs;

    // Only consider scoring that occurs strictly after the last not-leading point.
    if ((e.eventNumber ?? 0) <= lastNotLeadingEvtNum) continue;

    const winningIsHome = winningTeamId === game.homeTeamId;
    const prevWinningScore = winningIsHome ? prevH : prevA;
    const prevLosingScore = winningIsHome ? prevA : prevH;
    const nextWinningScore = winningIsHome ? runH : runA;
    const nextLosingScore = winningIsHome ? runA : runH;

    // The go-ahead moment: winning team goes from tied/trailing to leading.
    if (prevWinningScore <= prevLosingScore && nextWinningScore > nextLosingScore) {
      if (winningIsHome) {
        // Home took the lead in bottom half; W goes to home pitcher of record (pitched top), L to away pitcher pitching now.
        winPitcherId = curHomePitcher;
        losePitcherId = curAwayPitcher;
      } else {
        // Away took the lead in top half; W goes to away pitcher of record (pitched bottom), L to home pitcher pitching now.
        winPitcherId = curAwayPitcher;
        losePitcherId = curHomePitcher;
      }
      break;
    }
  }

  // Fallback: if no lead change found, use starters
  if (!winPitcherId) {
    const winStarter = lineups.find(l =>
      l.teamId === winningTeamId && l.isStarter && l.position === 1
    );
    winPitcherId = winStarter?.playerId ?? null;
  }
  if (!losePitcherId) {
    const loseStarter = lineups.find(l =>
      l.teamId === losingTeamId && l.isStarter && l.position === 1
    );
    losePitcherId = loseStarter?.playerId ?? null;
  }

  if (winPitcherId) {
    await db.update(playerGamePitching)
      .set({ decision: 'W' })
      .where(and(
        eq(playerGamePitching.gameId, gameId),
        eq(playerGamePitching.playerId, winPitcherId)
      ));
  }
  if (losePitcherId) {
    await db.update(playerGamePitching)
      .set({ decision: 'L' })
      .where(and(
        eq(playerGamePitching.gameId, gameId),
        eq(playerGamePitching.playerId, losePitcherId)
      ));
  }
}

/* ═══════════════════════════════════════════════════════════════
   Season aggregate recomputation
   ═══════════════════════════════════════════════════════════════ */

export async function recomputeSeasonBatting(seasonId: number) {
  await db.execute(sql`
    INSERT INTO player_season_batting (
      player_id, team_id, season_id, games, plate_appearances, at_bats,
      hits, singles, doubles, triples, home_runs, rbi, runs, walks, strikeouts,
      hit_by_pitch, stolen_bases, caught_stealing, sacrifice_flies, sacrifice_bunts,
      ground_outs, fly_outs, grounded_into_double_plays,
      intentional_walks, reached_on_error, total_bases,
      bunt_singles, strikeouts_looking, strikeouts_swinging, picked_off,
      fielders_choice, catcher_interference, grounded_into_triple_play,
      batting_avg, on_base_pct, slugging_pct, ops, babip, last_computed_at)
    SELECT
      pgb.player_id, pgb.team_id, l.season_id,
      COUNT(DISTINCT pgb.game_id),
      SUM(pgb.plate_appearances), SUM(pgb.at_bats),
      SUM(pgb.hits), SUM(pgb.singles), SUM(pgb.doubles), SUM(pgb.triples), SUM(pgb.home_runs),
      SUM(pgb.rbi), SUM(pgb.runs), SUM(pgb.walks), SUM(pgb.strikeouts),
      SUM(pgb.hit_by_pitch), SUM(pgb.stolen_bases), SUM(pgb.caught_stealing),
      SUM(pgb.sacrifice_flies), SUM(pgb.sacrifice_bunts),
      COALESCE(SUM(pgb.ground_outs), 0),
      COALESCE(SUM(pgb.fly_outs), 0),
      COALESCE(SUM(pgb.grounded_into_double_plays), 0),
      COALESCE(SUM(pgb.intentional_walks), 0),
      COALESCE(SUM(pgb.reached_on_error), 0),
      COALESCE(SUM(pgb.total_bases), 0),
      COALESCE(SUM(pgb.bunt_singles), 0),
      COALESCE(SUM(pgb.strikeouts_looking), 0),
      COALESCE(SUM(pgb.strikeouts_swinging), 0),
      COALESCE(SUM(pgb.picked_off), 0),
      COALESCE(SUM(pgb.fielders_choice), 0),
      COALESCE(SUM(pgb.catcher_interference), 0),
      COALESCE(SUM(pgb.grounded_into_triple_play), 0),
      -- AVG
      CASE WHEN SUM(pgb.at_bats) > 0
        THEN ROUND(SUM(pgb.hits)::numeric / SUM(pgb.at_bats), 3) ELSE 0 END,
      -- OBP
      CASE WHEN (SUM(pgb.at_bats) + SUM(pgb.walks) + SUM(pgb.hit_by_pitch) + SUM(pgb.sacrifice_flies)) > 0
        THEN ROUND(
          (SUM(pgb.hits) + SUM(pgb.walks) + SUM(pgb.hit_by_pitch))::numeric /
          (SUM(pgb.at_bats) + SUM(pgb.walks) + SUM(pgb.hit_by_pitch) + SUM(pgb.sacrifice_flies)), 3)
        ELSE 0 END,
      -- SLG
      CASE WHEN SUM(pgb.at_bats) > 0
        THEN ROUND(COALESCE(SUM(pgb.total_bases), 0)::numeric / SUM(pgb.at_bats), 3)
        ELSE 0 END,
      -- OPS = OBP + SLG
      CASE WHEN SUM(pgb.at_bats) > 0
        THEN ROUND(
          COALESCE(
            (SUM(pgb.hits) + SUM(pgb.walks) + SUM(pgb.hit_by_pitch))::numeric /
              NULLIF(SUM(pgb.at_bats) + SUM(pgb.walks) + SUM(pgb.hit_by_pitch) + SUM(pgb.sacrifice_flies), 0),
            0
          ) +
          COALESCE(SUM(pgb.total_bases), 0)::numeric / SUM(pgb.at_bats)
        , 3)
        ELSE 0 END,
      -- BABIP = (H - HR) / (AB - SO - HR + SF)
      CASE WHEN (SUM(pgb.at_bats) - SUM(pgb.strikeouts) - SUM(pgb.home_runs) + SUM(pgb.sacrifice_flies)) > 0
        THEN ROUND(
          (SUM(pgb.hits) - SUM(pgb.home_runs))::numeric /
          (SUM(pgb.at_bats) - SUM(pgb.strikeouts) - SUM(pgb.home_runs) + SUM(pgb.sacrifice_flies)), 3)
        ELSE NULL END,
      NOW()
    FROM player_game_batting pgb
    JOIN games g ON pgb.game_id = g.id
    JOIN leagues l ON g.league_id = l.id
    WHERE l.season_id = ${seasonId} AND g.is_finalized = true
    GROUP BY pgb.player_id, pgb.team_id, l.season_id
    ON CONFLICT (player_id, team_id, season_id) DO UPDATE SET
      games = EXCLUDED.games,
      plate_appearances = EXCLUDED.plate_appearances,
      at_bats = EXCLUDED.at_bats,
      hits = EXCLUDED.hits,
      singles = EXCLUDED.singles,
      doubles = EXCLUDED.doubles,
      triples = EXCLUDED.triples,
      home_runs = EXCLUDED.home_runs,
      rbi = EXCLUDED.rbi,
      runs = EXCLUDED.runs,
      walks = EXCLUDED.walks,
      strikeouts = EXCLUDED.strikeouts,
      hit_by_pitch = EXCLUDED.hit_by_pitch,
      stolen_bases = EXCLUDED.stolen_bases,
      caught_stealing = EXCLUDED.caught_stealing,
      sacrifice_flies = EXCLUDED.sacrifice_flies,
      sacrifice_bunts = EXCLUDED.sacrifice_bunts,
      ground_outs = EXCLUDED.ground_outs,
      fly_outs = EXCLUDED.fly_outs,
      grounded_into_double_plays = EXCLUDED.grounded_into_double_plays,
      intentional_walks = EXCLUDED.intentional_walks,
      reached_on_error = EXCLUDED.reached_on_error,
      total_bases = EXCLUDED.total_bases,
      bunt_singles = EXCLUDED.bunt_singles,
      strikeouts_looking = EXCLUDED.strikeouts_looking,
      strikeouts_swinging = EXCLUDED.strikeouts_swinging,
      picked_off = EXCLUDED.picked_off,
      fielders_choice = EXCLUDED.fielders_choice,
      catcher_interference = EXCLUDED.catcher_interference,
      grounded_into_triple_play = EXCLUDED.grounded_into_triple_play,
      batting_avg = EXCLUDED.batting_avg,
      on_base_pct = EXCLUDED.on_base_pct,
      slugging_pct = EXCLUDED.slugging_pct,
      ops = EXCLUDED.ops,
      babip = EXCLUDED.babip,
      last_computed_at = NOW()
  `);
}

export async function recomputeSeasonPitching(seasonId: number) {
  // IP is stored in baseball notation (7.1 = 7⅓ innings, 6.2 = 6⅔).
  // We must convert to total outs before summing, then convert back.
  // total_outs = TRUNC(ip)*3 + ROUND((ip - TRUNC(ip))*10)
  // ip_display  = TRUNC(total_outs/3) + (total_outs%3)*0.1
  // For rate stats: actual_innings = total_outs / 3.0
  await db.execute(sql`
    WITH pitcher_agg AS (
      SELECT
        pgp.player_id, pgp.team_id, l.season_id,
        COUNT(DISTINCT pgp.game_id) AS games,
        COUNT(DISTINCT CASE WHEN pgp.is_starter THEN pgp.game_id END) AS games_started,
        COALESCE(SUM(CASE WHEN pgp.decision = 'W' THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN pgp.decision = 'L' THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE WHEN pgp.decision = 'S' THEN 1 ELSE 0 END), 0) AS saves,
        SUM(
          TRUNC(pgp.innings_pitched::numeric) * 3 +
          ROUND((pgp.innings_pitched::numeric - TRUNC(pgp.innings_pitched::numeric)) * 10)
        ) AS total_outs,
        SUM(pgp.hits_allowed) AS hits_allowed,
        SUM(pgp.runs_allowed) AS runs_allowed,
        SUM(pgp.earned_runs) AS earned_runs,
        SUM(pgp.walks_allowed) AS walks_allowed,
        SUM(pgp.strikeouts) AS strikeouts,
        SUM(pgp.home_runs_allowed) AS home_runs_allowed,
        SUM(pgp.hit_batters) AS hit_batters,
        SUM(pgp.wild_pitches) AS wild_pitches,
        COALESCE(SUM(pgp.batters_faced), 0) AS batters_faced,
        COALESCE(SUM(pgp.balks), 0) AS balks,
        COALESCE(SUM(pgp.intentional_walks), 0) AS intentional_walks,
        COALESCE(SUM(pgp.ground_outs), 0) AS ground_outs,
        COALESCE(SUM(pgp.fly_outs), 0) AS fly_outs,
        COALESCE(SUM(pgp.holds), 0) AS holds,
        COALESCE(SUM(pgp.save_opportunities), 0) AS save_opportunities,
        COALESCE(SUM(pgp.blown_saves), 0) AS blown_saves,
        COALESCE(SUM(pgp.complete_games), 0) AS complete_games,
        SUM(pgp.game_score) AS game_score_sum,
        COALESCE(SUM(pgp.quality_starts), 0) AS quality_starts,
        COALESCE(SUM(pgp.shutouts), 0) AS shutouts,
        COALESCE(SUM(pgp.inherited_runners), 0) AS inherited_runners,
        COALESCE(SUM(pgp.inherited_runners_scored), 0) AS inherited_runners_scored,
        COALESCE(SUM(pgp.strikeouts_looking), 0) AS strikeouts_looking,
        COALESCE(SUM(pgp.strikeouts_swinging), 0) AS strikeouts_swinging,
        COALESCE(SUM(pgp.balls), 0) AS balls,
        COALESCE(SUM(pgp.strikes), 0) AS strikes,
        COALESCE(SUM(pgp.first_pitch_strikes), 0) AS first_pitch_strikes,
        COALESCE(SUM(pgp.first_pitch_total), 0) AS first_pitch_total
      FROM player_game_pitching pgp
      JOIN games g ON pgp.game_id = g.id
      JOIN leagues l ON g.league_id = l.id
      WHERE l.season_id = ${seasonId} AND g.is_finalized = true
      GROUP BY pgp.player_id, pgp.team_id, l.season_id
    )
    INSERT INTO player_season_pitching (
      player_id, team_id, season_id, games, games_started,
      wins, losses, saves,
      innings_pitched, hits_allowed, runs_allowed, earned_runs, walks_allowed,
      strikeouts, home_runs_allowed, hit_batters, wild_pitches,
      batters_faced, balks, intentional_walks, ground_outs, fly_outs,
      holds, save_opportunities, blown_saves, complete_games, game_score,
      quality_starts, shutouts, inherited_runners, inherited_runners_scored,
      strikeouts_looking, strikeouts_swinging,
      balls, strikes,
      first_pitch_strikes, first_pitch_total,
      era, whip, strikeout_rate, walk_rate, fip, k9, bb9, h9, babip,
      last_computed_at)
    SELECT
      player_id, team_id, season_id, games, games_started, wins, losses, saves,
      -- Convert total_outs back to baseball IP notation
      TRUNC(total_outs / 3) + (total_outs % 3) * 0.1,
      hits_allowed, runs_allowed, earned_runs, walks_allowed,
      strikeouts, home_runs_allowed, hit_batters, wild_pitches,
      batters_faced, balks, intentional_walks, ground_outs, fly_outs,
      holds, save_opportunities, blown_saves, complete_games,
      CASE WHEN games > 0 THEN ROUND(game_score_sum::numeric / games, 0)::int ELSE NULL END,
      quality_starts, shutouts, inherited_runners, inherited_runners_scored,
      strikeouts_looking, strikeouts_swinging,
      balls, strikes,
      first_pitch_strikes, first_pitch_total,
      -- ERA = ER * 27 / total_outs  (equivalent to ER * 9 / actual_IP)
      CASE WHEN total_outs > 0
        THEN ROUND(earned_runs::numeric * 27 / total_outs, 2) ELSE 0 END,
      -- WHIP = (BB + H) * 3 / total_outs
      CASE WHEN total_outs > 0
        THEN ROUND((walks_allowed + hits_allowed)::numeric * 3 / total_outs, 2) ELSE 0 END,
      -- K rate (K/9) = K * 27 / total_outs
      CASE WHEN total_outs > 0
        THEN ROUND(strikeouts::numeric * 27 / total_outs, 1) ELSE 0 END,
      -- BB rate (BB/9) = BB * 27 / total_outs
      CASE WHEN total_outs > 0
        THEN ROUND(walks_allowed::numeric * 27 / total_outs, 1) ELSE 0 END,
      -- FIP = (13*HR + 3*(BB+HBP) - 2*K) * 3 / total_outs + 3.10
      CASE WHEN total_outs > 0
        THEN ROUND(
          (13 * home_runs_allowed + 3 * (walks_allowed + hit_batters) - 2 * strikeouts)::numeric
          * 3 / total_outs + 3.10, 2) ELSE NULL END,
      -- K/9 (same as strikeout_rate)
      CASE WHEN total_outs > 0
        THEN ROUND(strikeouts::numeric * 27 / total_outs, 1) ELSE 0 END,
      -- BB/9 (same as walk_rate)
      CASE WHEN total_outs > 0
        THEN ROUND(walks_allowed::numeric * 27 / total_outs, 1) ELSE 0 END,
      -- H/9
      CASE WHEN total_outs > 0
        THEN ROUND(hits_allowed::numeric * 27 / total_outs, 1) ELSE 0 END,
      -- BABIP = (H - HR) / (BF - K - HR - BB)
      CASE WHEN (batters_faced - strikeouts - home_runs_allowed - walks_allowed) > 0
        THEN ROUND(
          (hits_allowed - home_runs_allowed)::numeric /
          (batters_faced - strikeouts - home_runs_allowed - walks_allowed), 3)
        ELSE NULL END,
      NOW()
    FROM pitcher_agg
    ON CONFLICT (player_id, team_id, season_id) DO UPDATE SET
      games = EXCLUDED.games,
      games_started = EXCLUDED.games_started,
      wins = EXCLUDED.wins,
      losses = EXCLUDED.losses,
      saves = EXCLUDED.saves,
      innings_pitched = EXCLUDED.innings_pitched,
      hits_allowed = EXCLUDED.hits_allowed,
      runs_allowed = EXCLUDED.runs_allowed,
      earned_runs = EXCLUDED.earned_runs,
      walks_allowed = EXCLUDED.walks_allowed,
      strikeouts = EXCLUDED.strikeouts,
      home_runs_allowed = EXCLUDED.home_runs_allowed,
      hit_batters = EXCLUDED.hit_batters,
      wild_pitches = EXCLUDED.wild_pitches,
      batters_faced = EXCLUDED.batters_faced,
      balks = EXCLUDED.balks,
      intentional_walks = EXCLUDED.intentional_walks,
      ground_outs = EXCLUDED.ground_outs,
      fly_outs = EXCLUDED.fly_outs,
      holds = EXCLUDED.holds,
      save_opportunities = EXCLUDED.save_opportunities,
      blown_saves = EXCLUDED.blown_saves,
      complete_games = EXCLUDED.complete_games,
      game_score = EXCLUDED.game_score,
      quality_starts = EXCLUDED.quality_starts,
      shutouts = EXCLUDED.shutouts,
      inherited_runners = EXCLUDED.inherited_runners,
      inherited_runners_scored = EXCLUDED.inherited_runners_scored,
      strikeouts_looking = EXCLUDED.strikeouts_looking,
      strikeouts_swinging = EXCLUDED.strikeouts_swinging,
      balls = EXCLUDED.balls,
      strikes = EXCLUDED.strikes,
      first_pitch_strikes = EXCLUDED.first_pitch_strikes,
      first_pitch_total = EXCLUDED.first_pitch_total,
      era = EXCLUDED.era,
      whip = EXCLUDED.whip,
      strikeout_rate = EXCLUDED.strikeout_rate,
      walk_rate = EXCLUDED.walk_rate,
      fip = EXCLUDED.fip,
      k9 = EXCLUDED.k9,
      bb9 = EXCLUDED.bb9,
      h9 = EXCLUDED.h9,
      babip = EXCLUDED.babip,
      last_computed_at = NOW()
  `);
}

export async function recomputeSeasonFielding(seasonId: number) {
  await db.execute(sql`
    INSERT INTO player_season_fielding (player_id, team_id, season_id, games,
      innings, putouts, assists, errors, double_plays, triple_plays,
      passed_balls, catcher_stolen_bases, catcher_caught_stealing, pickoffs,
      fielding_pct, last_computed_at)
    SELECT
      pgf.player_id, pgf.team_id, l.season_id,
      COUNT(DISTINCT pgf.game_id),
      SUM(COALESCE(pgf.innings, 0)),
      SUM(pgf.putouts), SUM(pgf.assists), SUM(pgf.errors),
      SUM(pgf.double_plays), SUM(pgf.triple_plays),
      SUM(pgf.passed_balls), SUM(pgf.catcher_stolen_bases),
      SUM(pgf.catcher_caught_stealing), SUM(pgf.pickoffs),
      CASE WHEN (SUM(pgf.putouts) + SUM(pgf.assists) + SUM(pgf.errors)) > 0
        THEN ROUND((SUM(pgf.putouts) + SUM(pgf.assists))::numeric / (SUM(pgf.putouts) + SUM(pgf.assists) + SUM(pgf.errors)), 3)
        ELSE 1.000 END,
      NOW()
    FROM player_game_fielding pgf
    JOIN games g ON pgf.game_id = g.id
    JOIN leagues l ON g.league_id = l.id
    WHERE l.season_id = ${seasonId} AND g.is_finalized = true
    GROUP BY pgf.player_id, pgf.team_id, l.season_id
    ON CONFLICT (player_id, team_id, season_id) DO UPDATE SET
      games = EXCLUDED.games,
      innings = EXCLUDED.innings,
      putouts = EXCLUDED.putouts,
      assists = EXCLUDED.assists,
      errors = EXCLUDED.errors,
      double_plays = EXCLUDED.double_plays,
      triple_plays = EXCLUDED.triple_plays,
      passed_balls = EXCLUDED.passed_balls,
      catcher_stolen_bases = EXCLUDED.catcher_stolen_bases,
      catcher_caught_stealing = EXCLUDED.catcher_caught_stealing,
      pickoffs = EXCLUDED.pickoffs,
      fielding_pct = EXCLUDED.fielding_pct,
      last_computed_at = NOW()
  `);
}

export async function recomputeStandings(leagueId: number) {
  const finalGames = await db
    .select()
    .from(games)
    .where(and(eq(games.leagueId, leagueId), eq(games.isFinalized, true)));

  const leagueTeams = await db.execute(
    sql`SELECT t.id FROM teams t JOIN league_teams lt ON lt.team_id = t.id WHERE lt.league_id = ${leagueId}`
  );
  const teamIds = ((leagueTeams as any).rows ?? (leagueTeams as any[]))?.map((r: any) => r.id) ?? [];

  if (teamIds.length === 0) {
    const gameTeams = new Set<number>();
    for (const g of finalGames) {
      gameTeams.add(g.homeTeamId);
      gameTeams.add(g.awayTeamId);
    }
    teamIds.push(...gameTeams);
  }

  const teamStats = new Map<number, { wins: number; losses: number; ties: number; rs: number; ra: number }>();
  for (const tid of teamIds) {
    teamStats.set(tid, { wins: 0, losses: 0, ties: 0, rs: 0, ra: 0 });
  }

  for (const g of finalGames) {
    const hs = g.homeScore ?? 0;
    const as_ = g.awayScore ?? 0;
    const home = teamStats.get(g.homeTeamId);
    const away = teamStats.get(g.awayTeamId);

    if (home) {
      home.rs += hs; home.ra += as_;
      if (hs > as_) home.wins++; else if (hs < as_) home.losses++; else home.ties++;
    }
    if (away) {
      away.rs += as_; away.ra += hs;
      if (as_ > hs) away.wins++; else if (as_ < hs) away.losses++; else away.ties++;
    }
  }

  let bestWins = 0, bestLosses = 0;
  for (const [, s] of teamStats) {
    const wp = (s.wins + s.losses) > 0 ? s.wins / (s.wins + s.losses) : 0;
    const bestWp = (bestWins + bestLosses) > 0 ? bestWins / (bestWins + bestLosses) : 0;
    if (wp > bestWp || (wp === bestWp && s.wins > bestWins)) {
      bestWins = s.wins; bestLosses = s.losses;
    }
  }

  for (const [teamId, s] of teamStats) {
    const gamesPlayed = s.wins + s.losses + s.ties;
    const winPct = gamesPlayed > 0 ? (s.wins / (s.wins + s.losses || 1)).toFixed(3) : '0.000';
    const gb = ((bestWins - s.wins) + (s.losses - bestLosses)) / 2;

    await db
      .insert(standings)
      .values({
        leagueId, teamId,
        wins: s.wins, losses: s.losses, ties: s.ties,
        gamesPlayed, runsScored: s.rs, runsAllowed: s.ra,
        winPct, gamesBehind: gb === 0 ? '0' : gb.toFixed(1),
        lastComputedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [standings.leagueId, standings.teamId],
        set: {
          wins: s.wins, losses: s.losses, ties: s.ties,
          gamesPlayed, runsScored: s.rs, runsAllowed: s.ra,
          winPct, gamesBehind: gb === 0 ? '0' : gb.toFixed(1),
          lastComputedAt: new Date(),
        },
      });
  }
}
