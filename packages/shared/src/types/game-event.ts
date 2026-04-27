export type EventType =
  // Pitch-level
  | 'pitch'

  // Hits / reaching safely
  | 'single'
  | 'bunt_single'
  | 'double'
  | 'ground_rule_double'
  | 'triple'
  | 'home_run'
  | 'inside_park_hr'

  // Walk/HBP/CI
  | 'walk'
  | 'intentional_walk'
  | 'hit_by_pitch'
  | 'catcher_obstruction'
  | 'catcher_interference'

  // Strikeouts / special K outcomes
  | 'strikeout'
  | 'strikeout_swinging'
  | 'strikeout_looking'
  | 'caught_foul_tip'
  | 'bunt_foul'
  | 'dropped_third_strike'
  | 'dropped_third_strike_out'
  | 'wild_pitch_third_strike'

  // Outs in play
  | 'ground_out'
  | 'fly_out'
  | 'line_out'
  | 'pop_out'
  | 'foul_out'
  | 'bunt_out'
  | 'infield_fly'

  // Sacrifice / FC
  | 'sacrifice_fly'
  | 'sacrifice_bunt'
  | 'fielders_choice'

  // Multi-out plays
  | 'double_play'
  | 'triple_play'

  // Batter reaches on error (or sac error)
  | 'error'
  | 'sac_bunt_error'
  | 'sac_fly_error'

  // Runner-only events
  | 'stolen_base'
  | 'caught_stealing'
  | 'picked_off'
  | 'wild_pitch'
  | 'passed_ball'
  | 'balk'
  | 'defensive_indifference'
  | 'advance'
  | 'advance_on_error'
  | 'runner_interference'
  | 'appeal_play'
  | 'tagged_out'
  | 'force_out'
  | 'hit_by_ball'
  | 'missed_base'
  | 'left_base_early'
  | 'left_base_path'
  | 'offensive_interference'
  | 'passed_runner'
  | 'hesitation'
  | 'illegal_pitch'

  // System / roster
  | 'end_half_inning'
  | 'substitution'
  | 'adjust_score'

  // Misc/legacy
  | 'interference'
  | 'other';

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
