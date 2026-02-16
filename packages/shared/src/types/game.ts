export type GameStatus = 'scheduled' | 'warmup' | 'live' | 'final' | 'postponed' | 'cancelled' | 'suspended';

export interface Game {
  id: number;
  leagueId: number;
  homeTeamId: number;
  awayTeamId: number;
  scheduledAt: string;
  venue: string | null;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  inningsCount: number;
  currentInning: number | null;
  currentHalf: 'top' | 'bot' | null;
  currentOuts: number;
  isFinalized: boolean;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
