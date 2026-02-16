export type EventType =
  | 'single' | 'double' | 'triple' | 'home_run'
  | 'walk' | 'intentional_walk' | 'hit_by_pitch'
  | 'strikeout_swinging' | 'strikeout_looking'
  | 'sacrifice_fly' | 'sacrifice_bunt' | 'fielders_choice'
  | 'ground_out' | 'fly_out' | 'line_out' | 'pop_out'
  | 'double_play' | 'triple_play'
  | 'error' | 'wild_pitch' | 'passed_ball'
  | 'stolen_base' | 'caught_stealing'
  | 'balk' | 'interference' | 'other';

export interface GameEvent {
  id: number;
  gameId: number;
  eventNumber: number;
  inning: number;
  half: 'top' | 'bot';
  batterId: number | null;
  pitcherId: number | null;
  eventType: EventType;
  eventDetail: string | null;
  rbi: number;
  runsScored: number;
  outsRecorded: number;
  errorsOnPlay: number;
  balls: number;
  strikes: number;
  runnerFirstId: number | null;
  runnerSecondId: number | null;
  runnerThirdId: number | null;
  runnersScored: number[];
  isDeleted: boolean;
  createdAt: string;
  createdBy: number | null;
}
