import { db } from '../db/index.js';
import {
  playerSeasonBatting,
  playerSeasonPitching,
  playerGameFielding,
  players,
  teams,
  seasons,
} from '../db/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';

export const ALL_STAR_CRITERIA = {
  minAtBats: 6,
  minGamesAtPosition: 2,
  minInningsPitcher: 3,
  minGamesStarted: 1,
} as const;

const POSITION_SLOTS = [
  { num: 2, slot: 'C' as const },
  { num: 3, slot: '1B' as const },
  { num: 4, slot: '2B' as const },
  { num: 5, slot: '3B' as const },
  { num: 6, slot: 'SS' as const },
  { num: 7, slot: 'LF' as const },
  { num: 8, slot: 'CF' as const },
  { num: 9, slot: 'RF' as const },
];

type BattingRow = {
  playerId: number;
  teamId: number;
  playerSlug: string;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  atBats: number;
  ops: string | null;
  battingAvg: string | null;
  homeRuns: number | null;
  rbi: number | null;
  hits: number | null;
};

type FieldingPosRow = {
  playerId: number;
  teamId: number;
  playerSlug: string;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  position: number;
  games: number;
  putouts: number;
  assists: number;
  errors: number;
};

type PitchingRow = {
  playerId: number;
  playerSlug: string;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  games: number;
  gamesStarted: number;
  inningsPitched: string | number | null;
  era: string | null;
  whip: string | null;
  strikeouts: number | null;
  wins: number | null;
  saves: number | null;
};

export type AllStarPosition = {
  slot: string;
  positionNum: number;
  playerId: number;
  playerSlug: string;
  firstName: string;
  lastName: string;
  teamId: number;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  gamesAtPosition: number;
  selectionStat: 'ops';
  selectionValue: string;
  battingAvg: string | null;
  homeRuns: number;
  rbi: number;
  hits: number;
  fieldingPct: string | null;
};

export type AllStarPitcher = {
  role: 'SP' | 'RP';
  playerId: number;
  playerSlug: string;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  gamesStarted: number;
  inningsPitched: string;
  era: string | null;
  whip: string | null;
  strikeouts: number;
  wins: number;
  saves: number;
};

export type AllStarTeamResult = {
  seasonId: number;
  seasonYear: number;
  seasonName: string;
  positions: AllStarPosition[];
  pitchers: AllStarPitcher[];
  criteria: typeof ALL_STAR_CRITERIA & {
    positionPlayers: string;
    startingPitcher: string;
    reliefPitchers: string;
  };
};

function parseIp(ip: string | number | null | undefined): number {
  if (ip == null) return 0;
  const n = typeof ip === 'string' ? parseFloat(ip) : ip;
  return Number.isFinite(n) ? n : 0;
}

function parseOps(ops: string | null | undefined): number {
  if (ops == null) return -1;
  const n = parseFloat(ops);
  return Number.isFinite(n) ? n : -1;
}

function fieldingPct(po: number, a: number, e: number): string | null {
  const chances = po + a + e;
  if (chances <= 0) return null;
  return ((po + a) / chances).toFixed(3);
}

function battingForPlayer(
  battingRows: BattingRow[],
  playerId: number,
  teamId: number,
): BattingRow | null {
  const exact = battingRows.find((b) => b.playerId === playerId && b.teamId === teamId);
  if (exact) return exact;
  const rows = battingRows.filter((b) => b.playerId === playerId);
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => (parseOps(row.ops) > parseOps(best.ops) ? row : best));
}

export async function computeAllStarTeam(seasonId: number): Promise<AllStarTeamResult | null> {
  const [season] = await db
    .select({ id: seasons.id, year: seasons.year, name: seasons.name })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!season) return null;

  const seasonGames = sql`${playerGameFielding.gameId} IN (
    SELECT g.id FROM games g
    INNER JOIN leagues l ON g.league_id = l.id
    WHERE l.season_id = ${seasonId}
  )`;

  const [battingRows, fieldingRows, pitchingRows] = await Promise.all([
    db
      .select({
        playerId: players.id,
        teamId: playerSeasonBatting.teamId,
        playerSlug: players.slug,
        firstName: players.firstName,
        lastName: players.lastName,
        teamName: teams.name,
        teamShortName: teams.shortName,
        teamLogoUrl: teams.logoUrl,
        atBats: playerSeasonBatting.atBats,
        ops: playerSeasonBatting.ops,
        battingAvg: playerSeasonBatting.battingAvg,
        homeRuns: playerSeasonBatting.homeRuns,
        rbi: playerSeasonBatting.rbi,
        hits: playerSeasonBatting.hits,
      })
      .from(playerSeasonBatting)
      .innerJoin(players, eq(playerSeasonBatting.playerId, players.id))
      .innerJoin(teams, eq(playerSeasonBatting.teamId, teams.id))
      .where(eq(playerSeasonBatting.seasonId, seasonId)) as Promise<BattingRow[]>,

    db
      .select({
        playerId: players.id,
        teamId: playerGameFielding.teamId,
        playerSlug: players.slug,
        firstName: players.firstName,
        lastName: players.lastName,
        teamName: teams.name,
        teamShortName: teams.shortName,
        teamLogoUrl: teams.logoUrl,
        position: playerGameFielding.position,
        games: sql<number>`count(*)::int`.as('games'),
        putouts: sql<number>`sum(${playerGameFielding.putouts})::int`.as('putouts'),
        assists: sql<number>`sum(${playerGameFielding.assists})::int`.as('assists'),
        errors: sql<number>`sum(${playerGameFielding.errors})::int`.as('errors'),
      })
      .from(playerGameFielding)
      .innerJoin(players, eq(playerGameFielding.playerId, players.id))
      .innerJoin(teams, eq(playerGameFielding.teamId, teams.id))
      .where(
        and(
          seasonGames,
          sql`${playerGameFielding.position} IN (2, 3, 4, 5, 6, 7, 8, 9)`,
        ),
      )
      .groupBy(
        players.id,
        playerGameFielding.teamId,
        players.slug,
        players.firstName,
        players.lastName,
        teams.name,
        teams.shortName,
        teams.logoUrl,
        playerGameFielding.position,
      ) as Promise<FieldingPosRow[]>,

    db
      .select({
        playerId: players.id,
        playerSlug: players.slug,
        firstName: players.firstName,
        lastName: players.lastName,
        teamName: teams.name,
        teamShortName: teams.shortName,
        teamLogoUrl: teams.logoUrl,
        games: playerSeasonPitching.games,
        gamesStarted: playerSeasonPitching.gamesStarted,
        inningsPitched: playerSeasonPitching.inningsPitched,
        era: playerSeasonPitching.era,
        whip: playerSeasonPitching.whip,
        strikeouts: playerSeasonPitching.strikeouts,
        wins: playerSeasonPitching.wins,
        saves: playerSeasonPitching.saves,
      })
      .from(playerSeasonPitching)
      .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
      .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
      .where(eq(playerSeasonPitching.seasonId, seasonId)) as Promise<PitchingRow[]>,
  ]);

  const usedPlayerIds = new Set<number>();
  const positions: AllStarPosition[] = [];

  for (const { num, slot } of POSITION_SLOTS) {
    const candidates = fieldingRows
      .filter((f) => f.position === num && Number(f.games) >= ALL_STAR_CRITERIA.minGamesAtPosition)
      .map((f) => {
        const batting = battingForPlayer(battingRows, f.playerId, f.teamId);
        return { fielding: f, batting };
      })
      .filter(({ batting }) => batting && Number(batting!.atBats) >= ALL_STAR_CRITERIA.minAtBats && parseOps(batting!.ops) >= 0)
      .sort((a, b) => parseOps(b.batting!.ops) - parseOps(a.batting!.ops));

    const pick = candidates.find(({ fielding }) => !usedPlayerIds.has(fielding.playerId));
    if (!pick?.batting) continue;

    const { fielding, batting } = pick;
    usedPlayerIds.add(fielding.playerId);
    positions.push({
      slot,
      positionNum: num,
      playerId: fielding.playerId,
      playerSlug: fielding.playerSlug,
      firstName: fielding.firstName,
      lastName: fielding.lastName,
      teamId: fielding.teamId,
      teamName: fielding.teamName,
      teamShortName: fielding.teamShortName,
      teamLogoUrl: fielding.teamLogoUrl,
      gamesAtPosition: Number(fielding.games),
      selectionStat: 'ops',
      selectionValue: batting.ops ?? '—',
      battingAvg: batting.battingAvg,
      homeRuns: Number(batting.homeRuns ?? 0),
      rbi: Number(batting.rbi ?? 0),
      hits: Number(batting.hits ?? 0),
      fieldingPct: fieldingPct(
        Number(fielding.putouts),
        Number(fielding.assists),
        Number(fielding.errors),
      ),
    });
  }

  const starterCandidates = pitchingRows
    .filter(
      (p) =>
        Number(p.gamesStarted ?? 0) >= ALL_STAR_CRITERIA.minGamesStarted &&
        parseIp(p.inningsPitched) >= ALL_STAR_CRITERIA.minInningsPitcher &&
        p.era != null,
    )
    .sort((a, b) => parseFloat(a.era!) - parseFloat(b.era!));

  const anyPitcherCandidates = pitchingRows
    .filter((p) => parseIp(p.inningsPitched) >= ALL_STAR_CRITERIA.minInningsPitcher && p.era != null)
    .sort((a, b) => parseFloat(a.era!) - parseFloat(b.era!));

  const starter = starterCandidates[0] ?? anyPitcherCandidates[0] ?? null;
  const starterId = starter?.playerId ?? null;

  const relieverCandidates = pitchingRows
    .filter((p) => {
      if (starterId != null && p.playerId === starterId) return false;
      const gs = Number(p.gamesStarted ?? 0);
      const g = Number(p.games ?? 0);
      const ip = parseIp(p.inningsPitched);
      const isReliever = g > gs || (gs === 0 && ip > 0);
      return isReliever && ip >= ALL_STAR_CRITERIA.minInningsPitcher && p.era != null;
    })
    .sort((a, b) => parseFloat(a.era!) - parseFloat(b.era!));

  const pitchers: AllStarPitcher[] = [];
  if (starter) {
    pitchers.push({
      role: 'SP',
      playerId: starter.playerId,
      playerSlug: starter.playerSlug,
      firstName: starter.firstName,
      lastName: starter.lastName,
      teamName: starter.teamName,
      teamShortName: starter.teamShortName,
      teamLogoUrl: starter.teamLogoUrl,
      gamesStarted: Number(starter.gamesStarted ?? 0),
      inningsPitched: String(starter.inningsPitched ?? '0'),
      era: starter.era,
      whip: starter.whip,
      strikeouts: Number(starter.strikeouts ?? 0),
      wins: Number(starter.wins ?? 0),
      saves: Number(starter.saves ?? 0),
    });
  }

  for (const rp of relieverCandidates.slice(0, 3)) {
    pitchers.push({
      role: 'RP',
      playerId: rp.playerId,
      playerSlug: rp.playerSlug,
      firstName: rp.firstName,
      lastName: rp.lastName,
      teamName: rp.teamName,
      teamShortName: rp.teamShortName,
      teamLogoUrl: rp.teamLogoUrl,
      gamesStarted: Number(rp.gamesStarted ?? 0),
      inningsPitched: String(rp.inningsPitched ?? '0'),
      era: rp.era,
      whip: rp.whip,
      strikeouts: Number(rp.strikeouts ?? 0),
      wins: Number(rp.wins ?? 0),
      saves: Number(rp.saves ?? 0),
    });
  }

  return {
    seasonId: season.id,
    seasonYear: season.year,
    seasonName: season.name,
    positions,
    pitchers,
    criteria: {
      ...ALL_STAR_CRITERIA,
      positionPlayers: 'Highest OPS at each position (min. 2 games there, 6 AB)',
      startingPitcher: 'Lowest ERA among starters (min. 1 GS, 3 IP)',
      reliefPitchers: 'Lowest ERA among relievers (min. 3 IP)',
    },
  };
}
