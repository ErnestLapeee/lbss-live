export interface BattingStats {
  plateAppearances: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  runs: number;
  walks: number;
  strikeouts: number;
  hitByPitch: number;
  sacrificeFlies: number;
  sacrificeBunts: number;
  stolenBases: number;
  caughtStealing: number;
  errors: number;
}

export interface ComputedBattingStats extends BattingStats {
  battingAvg: number;
  onBasePct: number;
  sluggingPct: number;
  ops: number;
}

export interface PitchingStats {
  inningsPitched: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walksAllowed: number;
  strikeouts: number;
  homeRunsAllowed: number;
  hitBatters: number;
  wildPitches: number;
  pitchesThrown: number | null;
  isStarter: boolean;
  decision: 'W' | 'L' | 'S' | 'H' | null;
}

export interface PlayerGameBatting extends BattingStats {
  id: number;
  gameId: number;
  playerId: number;
  teamId: number;
}

export interface PlayerSeasonBatting extends ComputedBattingStats {
  id: number;
  playerId: number;
  teamId: number;
  seasonId: number;
  games: number;
  lastComputedAt: string;
}

export interface StandingsEntry {
  id: number;
  leagueId: number;
  teamId: number;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  runsScored: number;
  runsAllowed: number;
  winPct: number;
  gamesBehind: number | null;
  streak: string | null;
  lastTen: string | null;
  lastComputedAt: string;
}
