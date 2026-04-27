import { z } from 'zod';

const eventTypes = [
  // Pitch-level
  'pitch',

  // Hits / reaching safely
  'single',
  'bunt_single',
  'double',
  'ground_rule_double',
  'triple',
  'home_run',
  'inside_park_hr',

  // Walk/HBP/CI
  'walk',
  'intentional_walk',
  'hit_by_pitch',
  'catcher_obstruction',
  'catcher_interference',

  // Strikeouts / special K outcomes
  'strikeout',
  'strikeout_swinging',
  'strikeout_looking',
  'caught_foul_tip',
  'bunt_foul',
  'dropped_third_strike',
  'dropped_third_strike_out',
  'wild_pitch_third_strike',

  // Outs in play
  'ground_out',
  'fly_out',
  'line_out',
  'pop_out',
  'foul_out',
  'bunt_out',
  'infield_fly',

  // Sacrifice / FC
  'sacrifice_fly',
  'sacrifice_bunt',
  'fielders_choice',

  // Multi-out plays
  'double_play',
  'triple_play',

  // Batter reaches on error
  'error',
  'sac_bunt_error',
  'sac_fly_error',

  // Runner-only
  'stolen_base',
  'caught_stealing',
  'picked_off',
  'wild_pitch',
  'passed_ball',
  'balk',
  'defensive_indifference',
  'advance',
  'advance_on_error',
  'runner_interference',
  'appeal_play',
  'tagged_out',
  'force_out',
  'hit_by_ball',
  'missed_base',
  'left_base_early',
  'left_base_path',
  'offensive_interference',
  'passed_runner',
  'hesitation',
  'illegal_pitch',

  // System / roster
  'end_half_inning',
  'substitution',
  'adjust_score',

  // Misc/legacy
  'interference',
  'other',
] as const;

export const createGameEventSchema = z.object({
  inning: z.number().int().min(1),
  half: z.enum(['top', 'bot']),
  batterId: z.number().int().nullable().optional(),
  pitcherId: z.number().int().nullable().optional(),
  eventType: z.enum(eventTypes),
  eventDetail: z.string().nullable().optional(),
  rbi: z.number().int().min(0).default(0),
  runsScored: z.number().int().min(0).default(0),
  outsRecorded: z.number().int().min(0).max(3).default(0),
  errorsOnPlay: z.number().int().min(0).default(0),
  balls: z.number().int().min(0).max(4).default(0),
  strikes: z.number().int().min(0).max(3).default(0),
  runnerFirstId: z.number().int().nullable().optional(),
  runnerSecondId: z.number().int().nullable().optional(),
  runnerThirdId: z.number().int().nullable().optional(),
  runnersScored: z.array(z.number().int()).default([]),
});
