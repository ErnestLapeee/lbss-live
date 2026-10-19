import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rowsFromExecute } from './pg-result.js';
import { formatOpponentBattingAvgPitch } from './opponent-batting-avg.js';
import { MIN_OUTS_PER_TEAM_GAME, MIN_PA_PER_TEAM_GAME } from './stat-qualification.js';

/**
 * Innings are stored in baseball notation (7.1 = 7⅓), so they are summed as outs.
 * `col` must be a trusted column reference.
 */
function outsExpr(col: string) {
  return sql.raw(
    `TRUNC(COALESCE(${col}, 0)::numeric) * 3 + ROUND((COALESCE(${col}, 0)::numeric - TRUNC(COALESCE(${col}, 0)::numeric)) * 10)`,
  );
}

function inningsNotation(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function qualification(leagueId: number): Promise<{ minPlateAppearances: number; minOuts: number }> {
  const result = await db.execute(sql`
    SELECT COALESCE(MAX(g), 0)::int AS team_games
    FROM (
      SELECT tg.team_id, COUNT(*)::int AS g
      FROM games gm
      CROSS JOIN LATERAL (VALUES (gm.home_team_id), (gm.away_team_id)) AS tg(team_id)
      WHERE gm.league_id = ${leagueId} AND gm.is_finalized = true
      GROUP BY tg.team_id
    ) counted
  `);
  const teamGames = num(rowsFromExecute<{ team_games: number }>(result)[0]?.team_games);
  return {
    minPlateAppearances: teamGames * MIN_PA_PER_TEAM_GAME,
    minOuts: teamGames * MIN_OUTS_PER_TEAM_GAME,
  };
}

function battingRates(row: {
  atBats: number;
  hits: number;
  walks: number;
  hitByPitch: number;
  sacrificeFlies: number;
  totalBases: number;
  homeRuns: number;
  strikeouts: number;
}) {
  const ab = row.atBats;
  const h = row.hits;
  const bb = row.walks;
  const hbp = row.hitByPitch;
  const sf = row.sacrificeFlies;
  const tb = row.totalBases;
  const hr = row.homeRuns;
  const so = row.strikeouts;
  const obDenom = ab + bb + hbp + sf;
  const babipDenom = ab - so - hr + sf;
  const obp = obDenom > 0 ? (h + bb + hbp) / obDenom : 0;
  const slg = ab > 0 ? tb / ab : 0;
  const rc = ab + bb > 0 ? ((h + bb) * tb) / (ab + bb) : 0;
  const gpa = (1.8 * obp + slg) / 4;
  const avg = ab > 0 ? h / ab : null;
  return {
    battingAvg: avg != null ? avg.toFixed(3) : null,
    onBasePct: obDenom > 0 ? obp.toFixed(3) : null,
    sluggingPct: ab > 0 ? slg.toFixed(3) : null,
    ops: obDenom > 0 || ab > 0 ? (obp + slg).toFixed(3) : null,
    babip: babipDenom > 0 ? ((h - hr) / babipDenom).toFixed(3) : null,
    runsCreated: rc > 0 ? rc.toFixed(1) : null,
    gpa: obp > 0 || slg > 0 ? gpa.toFixed(3) : null,
  };
}

type BattingLine = ReturnType<typeof mapBatting>;

function mapBatting(raw: Record<string, unknown>) {
  const counted = {
    atBats: num(raw.at_bats),
    hits: num(raw.hits),
    walks: num(raw.walks),
    hitByPitch: num(raw.hit_by_pitch),
    sacrificeFlies: num(raw.sacrifice_flies),
    totalBases: num(raw.total_bases),
    homeRuns: num(raw.home_runs),
    strikeouts: num(raw.strikeouts),
  };
  return {
    playerId: num(raw.player_id),
    playerSlug: String(raw.player_slug ?? ''),
    firstName: String(raw.first_name ?? ''),
    lastName: String(raw.last_name ?? ''),
    teamName: String(raw.team_name ?? ''),
    teamShortName: (raw.team_short_name as string | null) ?? null,
    teamLogoUrl: (raw.team_logo_url as string | null) ?? null,
    teamId: num(raw.team_id),
    games: num(raw.games),
    plateAppearances: num(raw.plate_appearances),
    ...counted,
    singles: num(raw.singles),
    doubles: num(raw.doubles),
    triples: num(raw.triples),
    rbi: num(raw.rbi),
    runs: num(raw.runs),
    stolenBases: num(raw.stolen_bases),
    caughtStealing: num(raw.caught_stealing),
    sacrificeBunts: num(raw.sacrifice_bunts),
    groundOuts: num(raw.ground_outs),
    flyOuts: num(raw.fly_outs),
    groundedIntoDoublePlays: num(raw.grounded_into_double_plays),
    intentionalWalks: num(raw.intentional_walks),
    reachedOnError: num(raw.reached_on_error),
    buntSingles: num(raw.bunt_singles),
    strikeoutsLooking: num(raw.strikeouts_looking),
    strikeoutsSwinging: num(raw.strikeouts_swinging),
    pickedOff: num(raw.picked_off),
    fieldersChoice: num(raw.fielders_choice),
    catcherInterference: num(raw.catcher_interference),
    groundedIntoTriplePlay: num(raw.grounded_into_triple_play),
    ...battingRates(counted),
  };
}

export async function battingLinesForLeague(leagueId: number) {
  const result = await db.execute(sql`
    SELECT
      p.id AS player_id,
      p.slug AS player_slug,
      p.first_name,
      p.last_name,
      t.name AS team_name,
      t.short_name AS team_short_name,
      t.logo_url AS team_logo_url,
      b.team_id,
      COUNT(DISTINCT b.game_id)::int AS games,
      SUM(COALESCE(b.plate_appearances, 0))::int AS plate_appearances,
      SUM(COALESCE(b.at_bats, 0))::int AS at_bats,
      SUM(COALESCE(b.hits, 0))::int AS hits,
      SUM(COALESCE(b.singles, 0))::int AS singles,
      SUM(COALESCE(b.doubles, 0))::int AS doubles,
      SUM(COALESCE(b.triples, 0))::int AS triples,
      SUM(COALESCE(b.home_runs, 0))::int AS home_runs,
      SUM(COALESCE(b.rbi, 0))::int AS rbi,
      SUM(COALESCE(b.runs, 0))::int AS runs,
      SUM(COALESCE(b.walks, 0))::int AS walks,
      SUM(COALESCE(b.strikeouts, 0))::int AS strikeouts,
      SUM(COALESCE(b.hit_by_pitch, 0))::int AS hit_by_pitch,
      SUM(COALESCE(b.stolen_bases, 0))::int AS stolen_bases,
      SUM(COALESCE(b.caught_stealing, 0))::int AS caught_stealing,
      SUM(COALESCE(b.sacrifice_flies, 0))::int AS sacrifice_flies,
      SUM(COALESCE(b.sacrifice_bunts, 0))::int AS sacrifice_bunts,
      SUM(COALESCE(b.ground_outs, 0))::int AS ground_outs,
      SUM(COALESCE(b.fly_outs, 0))::int AS fly_outs,
      SUM(COALESCE(b.grounded_into_double_plays, 0))::int AS grounded_into_double_plays,
      SUM(COALESCE(b.intentional_walks, 0))::int AS intentional_walks,
      SUM(COALESCE(b.reached_on_error, 0))::int AS reached_on_error,
      SUM(COALESCE(b.total_bases, 0))::int AS total_bases,
      SUM(COALESCE(b.bunt_singles, 0))::int AS bunt_singles,
      SUM(COALESCE(b.strikeouts_looking, 0))::int AS strikeouts_looking,
      SUM(COALESCE(b.strikeouts_swinging, 0))::int AS strikeouts_swinging,
      SUM(COALESCE(b.picked_off, 0))::int AS picked_off,
      SUM(COALESCE(b.fielders_choice, 0))::int AS fielders_choice,
      SUM(COALESCE(b.catcher_interference, 0))::int AS catcher_interference,
      SUM(COALESCE(b.grounded_into_triple_play, 0))::int AS grounded_into_triple_play
    FROM player_game_batting b
    INNER JOIN games g ON g.id = b.game_id
    INNER JOIN players p ON p.id = b.player_id
    INNER JOIN teams t ON t.id = b.team_id
    WHERE g.league_id = ${leagueId} AND g.is_finalized = true
    GROUP BY p.id, p.slug, p.first_name, p.last_name, t.name, t.short_name, t.logo_url, b.team_id
  `);
  return rowsFromExecute<Record<string, unknown>>(result)
    .map(mapBatting)
    .sort((a, b) => num(b.battingAvg) - num(a.battingAvg));
}

function leaderPlayers(
  rows: BattingLine[],
  pick: (row: BattingLine) => number | null,
  direction: 'asc' | 'desc',
  qualifies?: (row: BattingLine) => boolean,
) {
  const pool = qualifies ? rows.filter(qualifies) : rows;
  const sorted = [...pool].sort((a, b) => {
    const av = pick(a) ?? (direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    const bv = pick(b) ?? (direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    return direction === 'asc' ? av - bv : bv - av;
  });
  return sorted.slice(0, 5).map((row) => ({
    playerId: row.playerId,
    playerSlug: row.playerSlug,
    firstName: row.firstName,
    lastName: row.lastName,
    teamName: row.teamName,
    teamShortName: row.teamShortName,
    teamLogoUrl: row.teamLogoUrl,
    value: pick(row),
  }));
}

export async function battingLeadersForLeague(leagueId: number) {
  const [rows, limits] = await Promise.all([battingLinesForLeague(leagueId), qualification(leagueId)]);
  const rates = (row: BattingLine) => row.plateAppearances >= limits.minPlateAppearances;
  return {
    battingAvg: { label: 'Batting Average', players: leaderPlayers(rows, (r) => num(r.battingAvg), 'desc', rates) },
    homeRuns: { label: 'Home Runs', players: leaderPlayers(rows, (r) => r.homeRuns, 'desc') },
    rbi: { label: 'RBI', players: leaderPlayers(rows, (r) => r.rbi, 'desc') },
    hits: { label: 'Hits', players: leaderPlayers(rows, (r) => r.hits, 'desc') },
    stolenBases: { label: 'Stolen Bases', players: leaderPlayers(rows, (r) => r.stolenBases, 'desc') },
    ops: { label: 'OPS', players: leaderPlayers(rows, (r) => num(r.ops), 'desc', rates) },
    runs: { label: 'Runs', players: leaderPlayers(rows, (r) => r.runs, 'desc') },
  };
}

type PitchingLine = ReturnType<typeof mapPitching>;

function mapPitching(raw: Record<string, unknown>) {
  const outs = num(raw.outs);
  const ip = outs / 3;
  const er = num(raw.earned_runs);
  const h = num(raw.hits_allowed);
  const bb = num(raw.walks_allowed);
  const k = num(raw.strikeouts);
  const hr = num(raw.home_runs_allowed);
  const hb = num(raw.hit_batters);
  const bf = num(raw.batters_faced);
  const balls = num(raw.balls);
  const strikes = num(raw.strikes);
  const go = num(raw.ground_outs);
  const ao = num(raw.fly_outs);
  const fpStrikes = num(raw.first_pitch_strikes);
  const fpTotal = num(raw.first_pitch_total);
  const babipDenom = bf - k - hr - bb - hb;
  const row = {
    playerId: num(raw.player_id),
    playerSlug: String(raw.player_slug ?? ''),
    firstName: String(raw.first_name ?? ''),
    lastName: String(raw.last_name ?? ''),
    teamName: String(raw.team_name ?? ''),
    teamShortName: (raw.team_short_name as string | null) ?? null,
    teamLogoUrl: (raw.team_logo_url as string | null) ?? null,
    teamId: num(raw.team_id),
    games: num(raw.games),
    gamesStarted: num(raw.games_started),
    wins: num(raw.wins),
    losses: num(raw.losses),
    saves: num(raw.saves),
    inningsPitched: inningsNotation(outs),
    outs,
    hitsAllowed: h,
    runsAllowed: num(raw.runs_allowed),
    earnedRuns: er,
    walksAllowed: bb,
    strikeouts: k,
    homeRunsAllowed: hr,
    hitBatters: hb,
    wildPitches: num(raw.wild_pitches),
    battersFaced: bf,
    balks: num(raw.balks),
    intentionalWalks: num(raw.intentional_walks),
    groundOuts: go,
    flyOuts: ao,
    holds: num(raw.holds),
    saveOpportunities: num(raw.save_opportunities),
    blownSaves: num(raw.blown_saves),
    completeGames: num(raw.complete_games),
    qualityStarts: num(raw.quality_starts),
    shutouts: num(raw.shutouts),
    inheritedRunners: num(raw.inherited_runners),
    inheritedRunnersScored: num(raw.inherited_runners_scored),
    strikeoutsLooking: num(raw.strikeouts_looking),
    strikeoutsSwinging: num(raw.strikeouts_swinging),
    balls,
    strikes,
    firstPitchStrikes: fpStrikes,
    firstPitchTotal: fpTotal,
    era: ip > 0 ? ((er / ip) * 9).toFixed(2) : null,
    whip: ip > 0 ? ((bb + h) / ip).toFixed(2) : null,
    strikeoutRate: ip > 0 ? (k / ip).toFixed(1) : null,
    walkRate: ip > 0 ? (bb / ip).toFixed(1) : null,
    k9: ip > 0 ? ((k / ip) * 9).toFixed(1) : null,
    bb9: ip > 0 ? ((bb / ip) * 9).toFixed(1) : null,
    h9: ip > 0 ? ((h / ip) * 9).toFixed(1) : null,
    fip: ip > 0 ? (3.1 + (13 * hr + 3 * bb - 2 * k) / ip).toFixed(2) : null,
    babip: babipDenom > 0 ? ((h - hr) / babipDenom).toFixed(3) : null,
    goAo: ao > 0 ? (go / ao).toFixed(2) : null,
    strikePercentage: balls + strikes > 0 ? ((strikes / (balls + strikes)) * 100).toFixed(1) : null,
    firstPitchStrikePct: fpTotal > 0 ? ((fpStrikes / fpTotal) * 100).toFixed(1) : null,
  };
  return {
    ...row,
    opponentAvg: formatOpponentBattingAvgPitch(row),
  };
}

export async function pitchingLinesForLeague(leagueId: number) {
  const [result, limits] = await Promise.all([
    db.execute(sql`
      SELECT
        p.id AS player_id,
        p.slug AS player_slug,
        p.first_name,
        p.last_name,
        t.name AS team_name,
        t.short_name AS team_short_name,
        t.logo_url AS team_logo_url,
        pg.team_id,
        COUNT(DISTINCT pg.game_id)::int AS games,
        SUM(CASE WHEN pg.is_starter THEN 1 ELSE 0 END)::int AS games_started,
        SUM(CASE WHEN pg.decision = 'W' THEN 1 ELSE 0 END)::int AS wins,
        SUM(CASE WHEN pg.decision = 'L' THEN 1 ELSE 0 END)::int AS losses,
        SUM(CASE WHEN pg.decision = 'S' THEN 1 ELSE 0 END)::int AS saves,
        SUM(${outsExpr('pg.innings_pitched')})::int AS outs,
        SUM(COALESCE(pg.hits_allowed, 0))::int AS hits_allowed,
        SUM(COALESCE(pg.runs_allowed, 0))::int AS runs_allowed,
        SUM(COALESCE(pg.earned_runs, 0))::int AS earned_runs,
        SUM(COALESCE(pg.walks_allowed, 0))::int AS walks_allowed,
        SUM(COALESCE(pg.strikeouts, 0))::int AS strikeouts,
        SUM(COALESCE(pg.home_runs_allowed, 0))::int AS home_runs_allowed,
        SUM(COALESCE(pg.hit_batters, 0))::int AS hit_batters,
        SUM(COALESCE(pg.wild_pitches, 0))::int AS wild_pitches,
        SUM(COALESCE(pg.batters_faced, 0))::int AS batters_faced,
        SUM(COALESCE(pg.balks, 0))::int AS balks,
        SUM(COALESCE(pg.intentional_walks, 0))::int AS intentional_walks,
        SUM(COALESCE(pg.ground_outs, 0))::int AS ground_outs,
        SUM(COALESCE(pg.fly_outs, 0))::int AS fly_outs,
        SUM(COALESCE(pg.holds, 0))::int AS holds,
        SUM(COALESCE(pg.save_opportunities, 0))::int AS save_opportunities,
        SUM(COALESCE(pg.blown_saves, 0))::int AS blown_saves,
        SUM(COALESCE(pg.complete_games, 0))::int AS complete_games,
        SUM(COALESCE(pg.quality_starts, 0))::int AS quality_starts,
        SUM(COALESCE(pg.shutouts, 0))::int AS shutouts,
        SUM(COALESCE(pg.inherited_runners, 0))::int AS inherited_runners,
        SUM(COALESCE(pg.inherited_runners_scored, 0))::int AS inherited_runners_scored,
        SUM(COALESCE(pg.strikeouts_looking, 0))::int AS strikeouts_looking,
        SUM(COALESCE(pg.strikeouts_swinging, 0))::int AS strikeouts_swinging,
        SUM(COALESCE(pg.balls, 0))::int AS balls,
        SUM(COALESCE(pg.strikes, 0))::int AS strikes,
        SUM(COALESCE(pg.first_pitch_strikes, 0))::int AS first_pitch_strikes,
        SUM(COALESCE(pg.first_pitch_total, 0))::int AS first_pitch_total
      FROM player_game_pitching pg
      INNER JOIN games g ON g.id = pg.game_id
      INNER JOIN players p ON p.id = pg.player_id
      INNER JOIN teams t ON t.id = pg.team_id
      WHERE g.league_id = ${leagueId} AND g.is_finalized = true
      GROUP BY p.id, p.slug, p.first_name, p.last_name, t.name, t.short_name, t.logo_url, pg.team_id
    `),
    qualification(leagueId),
  ]);
  return rowsFromExecute<Record<string, unknown>>(result)
    .map((raw) => ({ ...mapPitching(raw), qualified: num(raw.outs) >= limits.minOuts }))
    .sort((a, b) => num(a.era ?? 999) - num(b.era ?? 999));
}

function pitchingLeaderPlayers(
  rows: Array<PitchingLine & { qualified?: boolean }>,
  pick: (row: PitchingLine) => number | null,
  direction: 'asc' | 'desc',
  qualifiedOnly: boolean,
) {
  const pool = qualifiedOnly ? rows.filter((row) => row.qualified && pick(row) != null) : rows;
  const sorted = [...pool].sort((a, b) => {
    const av = pick(a) ?? 0;
    const bv = pick(b) ?? 0;
    return direction === 'asc' ? av - bv : bv - av;
  });
  return sorted.slice(0, 5).map((row) => ({
    playerId: row.playerId,
    playerSlug: row.playerSlug,
    firstName: row.firstName,
    lastName: row.lastName,
    teamName: row.teamName,
    teamShortName: row.teamShortName,
    teamLogoUrl: row.teamLogoUrl,
    value: pick(row),
  }));
}

export async function pitchingLeadersForLeague(leagueId: number) {
  const rows = await pitchingLinesForLeague(leagueId);
  return {
    era: { label: 'ERA', players: pitchingLeaderPlayers(rows, (r) => (r.era != null ? num(r.era) : null), 'asc', true) },
    whip: { label: 'WHIP', players: pitchingLeaderPlayers(rows, (r) => (r.whip != null ? num(r.whip) : null), 'asc', true) },
    strikeouts: { label: 'Strikeouts', players: pitchingLeaderPlayers(rows, (r) => r.strikeouts, 'desc', false) },
    wins: { label: 'Wins', players: pitchingLeaderPlayers(rows, (r) => r.wins, 'desc', false) },
    strikes: { label: 'Strikes', players: pitchingLeaderPlayers(rows, (r) => r.strikes, 'desc', false) },
    inningsPitched: { label: 'Innings Pitched', players: pitchingLeaderPlayers(rows, (r) => r.outs, 'desc', false).map((player) => ({
      ...player,
      value: inningsNotation(num(player.value)),
    })) },
  };
}

export async function fieldingLinesForLeague(leagueId: number) {
  const result = await db.execute(sql`
    SELECT
      p.id AS player_id,
      p.slug AS player_slug,
      p.first_name,
      p.last_name,
      t.name AS team_name,
      t.short_name AS team_short_name,
      t.logo_url AS team_logo_url,
      f.team_id,
      COUNT(DISTINCT f.game_id)::int AS games,
      SUM(${outsExpr('f.innings')})::int AS outs,
      SUM(COALESCE(f.putouts, 0))::int AS putouts,
      SUM(COALESCE(f.assists, 0))::int AS assists,
      SUM(COALESCE(f.errors, 0))::int AS errors,
      SUM(COALESCE(f.double_plays, 0))::int AS double_plays,
      SUM(COALESCE(f.triple_plays, 0))::int AS triple_plays,
      SUM(COALESCE(f.passed_balls, 0))::int AS passed_balls,
      SUM(COALESCE(f.catcher_stolen_bases, 0))::int AS catcher_stolen_bases,
      SUM(COALESCE(f.catcher_caught_stealing, 0))::int AS catcher_caught_stealing,
      SUM(COALESCE(f.pickoffs, 0))::int AS pickoffs
    FROM player_game_fielding f
    INNER JOIN games g ON g.id = f.game_id
    INNER JOIN players p ON p.id = f.player_id
    INNER JOIN teams t ON t.id = f.team_id
    WHERE g.league_id = ${leagueId} AND g.is_finalized = true
    GROUP BY p.id, p.slug, p.first_name, p.last_name, t.name, t.short_name, t.logo_url, f.team_id
  `);
  return rowsFromExecute<Record<string, unknown>>(result)
    .map((raw) => {
      const po = num(raw.putouts);
      const a = num(raw.assists);
      const e = num(raw.errors);
      const chances = po + a + e;
      return {
        playerId: num(raw.player_id),
        playerSlug: String(raw.player_slug ?? ''),
        firstName: String(raw.first_name ?? ''),
        lastName: String(raw.last_name ?? ''),
        teamName: String(raw.team_name ?? ''),
        teamShortName: (raw.team_short_name as string | null) ?? null,
        teamLogoUrl: (raw.team_logo_url as string | null) ?? null,
        teamId: num(raw.team_id),
        games: num(raw.games),
        innings: inningsNotation(num(raw.outs)),
        putouts: po,
        assists: a,
        errors: e,
        doublePlays: num(raw.double_plays),
        triplePlays: num(raw.triple_plays),
        passedBalls: num(raw.passed_balls),
        catcherStolenBases: num(raw.catcher_stolen_bases),
        catcherCaughtStealing: num(raw.catcher_caught_stealing),
        pickoffs: num(raw.pickoffs),
        fieldingPct: chances > 0 ? ((po + a) / chances).toFixed(3) : null,
      };
    })
    .sort((a, b) => num(b.fieldingPct) - num(a.fieldingPct));
}

export function requestedLeagueId(query: { leagueId?: string }): number | null {
  if (query.leagueId == null || query.leagueId === '') return null;
  const n = parseInt(query.leagueId, 10);
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
}
