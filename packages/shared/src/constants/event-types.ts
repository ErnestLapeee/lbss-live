// These constants are the "shared truth" for scoring/stat classification across apps.
// They intentionally include the full set of event types emitted by the admin scorer.

export const HIT_EVENTS = [
  'single',
  'bunt_single',
  'double',
  'ground_rule_double',
  'triple',
  'home_run',
  'inside_park_hr',
] as const;

export const WALK_EVENTS = [
  'walk',
  'intentional_walk',
  'hit_by_pitch',
  // Treated like HBP: batter awarded first, not an AB.
  'catcher_obstruction',
  'catcher_interference',
] as const;

export const BASE_ON_BALLS_EVENTS = ['walk', 'intentional_walk'] as const;

export const SACRIFICE_EVENTS = ['sacrifice_fly', 'sacrifice_bunt'] as const;

export const STRIKEOUT_EVENTS = [
  'strikeout',
  'strikeout_swinging',
  'strikeout_looking',
  'caught_foul_tip',
  'bunt_foul',
  'dropped_third_strike_out',
  // These can be scored as K + reach; still a K event type in our system.
  'dropped_third_strike',
  'wild_pitch_third_strike',
] as const;

export const OUT_EVENTS = [
  ...STRIKEOUT_EVENTS,
  'ground_out',
  'fly_out',
  'line_out',
  'pop_out',
  'foul_out',
  'bunt_out',
  'infield_fly',
  'hit_by_batted_ball',
  'runner_interference_batter',
  'offensive_interference_batter',
  'batting_out_of_turn',
  'fan_interference',
  'thrown_bat',
  'out_of_box',
  'left_base_path_batter',
  'other_out',
  'double_play',
  'triple_play',
] as const;

export const BATTER_REACH_ON_ERROR_EVENTS = ['error', 'sac_bunt_error', 'sac_fly_error'] as const;

export const AT_BAT_EVENTS = [
  ...HIT_EVENTS,
  // outs excluding DP/TP are ABs; DP/TP are tracked as ABs in per-game stats too,
  // but some consumers treat them separately. Keep them in OUT_EVENTS and include
  // them here for "isAtBat" correctness.
  ...OUT_EVENTS,
  'fielders_choice',
  ...BATTER_REACH_ON_ERROR_EVENTS,
] as const;

export const PLATE_APPEARANCE_EVENTS = [
  ...AT_BAT_EVENTS,
  ...WALK_EVENTS,
  ...SACRIFICE_EVENTS,
] as const;

export const RUNNER_ONLY_EVENTS = [
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
] as const;

export const SYSTEM_EVENTS = [
  'pitch',
  'end_half_inning',
  'substitution',
  'adjust_score',
] as const;

export const NON_PA_EVENTS = [
  ...RUNNER_ONLY_EVENTS,
  ...SYSTEM_EVENTS,
] as const;

export const KNOWN_EVENT_TYPES = [
  ...PLATE_APPEARANCE_EVENTS,
  ...RUNNER_ONLY_EVENTS,
  ...SYSTEM_EVENTS,
  'interference',
  'other',
] as const;

export const PA_ENDING_EVENTS = [
  ...PLATE_APPEARANCE_EVENTS,
] as const;

export const BETWEEN_PITCH_EVENTS = [
  ...RUNNER_ONLY_EVENTS,
  'end_half_inning',
  'adjust_score',
] as const;

export const isKnownEventType = (eventType: string): boolean =>
  (KNOWN_EVENT_TYPES as readonly string[]).includes(eventType);

export const isPlateAppearanceEvent = (eventType: string): boolean =>
  (PLATE_APPEARANCE_EVENTS as readonly string[]).includes(eventType);

export const isAtBatEvent = (eventType: string): boolean =>
  (AT_BAT_EVENTS as readonly string[]).includes(eventType);

export const isBetweenPitchEvent = (eventType: string): boolean =>
  (BETWEEN_PITCH_EVENTS as readonly string[]).includes(eventType);

export const isRunnerOnlyEvent = (eventType: string): boolean =>
  (RUNNER_ONLY_EVENTS as readonly string[]).includes(eventType);

export const EVENT_TYPE_LABELS: Record<string, string> = {
  // Batter events
  single: 'Single',
  bunt_single: 'Bunt Single',
  double: 'Double',
  ground_rule_double: 'Ground Rule Double',
  triple: 'Triple',
  home_run: 'Home Run',
  inside_park_hr: 'Inside-the-park HR',
  walk: 'Walk',
  intentional_walk: 'Intentional Walk',
  hit_by_pitch: 'Hit By Pitch',
  catcher_obstruction: "Catcher Interference",
  catcher_interference: "Catcher Interference",
  strikeout: 'Strikeout',
  strikeout_swinging: 'Strikeout (Swinging)',
  strikeout_looking: 'Strikeout (Looking)',
  caught_foul_tip: 'Caught Foul Tip',
  bunt_foul: 'Bunt Foul (3rd Strike)',
  dropped_third_strike: 'Dropped 3rd Strike',
  dropped_third_strike_out: 'Dropped 3rd Strike (Out)',
  wild_pitch_third_strike: 'Wild Pitch 3rd Strike',
  sacrifice_fly: 'Sacrifice Fly',
  sacrifice_bunt: 'Sacrifice Bunt',
  fielders_choice: "Fielder's Choice",
  ground_out: 'Ground Out',
  fly_out: 'Fly Out',
  line_out: 'Line Out',
  pop_out: 'Pop Out',
  foul_out: 'Foul Out',
  bunt_out: 'Bunt Out',
  infield_fly: 'Infield Fly',
  hit_by_batted_ball: 'Hit By Batted Ball',
  runner_interference_batter: 'Runner Interference',
  offensive_interference_batter: 'Offensive Interference',
  batting_out_of_turn: 'Batting Out Of Turn',
  fan_interference: 'Fan Interference',
  thrown_bat: 'Thrown Bat',
  out_of_box: 'Out Of Box',
  left_base_path_batter: 'Left Base Path',
  other_out: 'Other Out',
  double_play: 'Double Play',
  triple_play: 'Triple Play',
  error: 'Error',
  sac_bunt_error: 'Error on Sac Bunt',
  sac_fly_error: 'Error on Sac Fly',

  // Runner-only events
  stolen_base: 'Stolen Base',
  caught_stealing: 'Caught Stealing',
  picked_off: 'Picked Off',
  wild_pitch: 'Wild Pitch',
  passed_ball: 'Passed Ball',
  balk: 'Balk',
  defensive_indifference: 'Defensive Indifference',
  advance: 'Advance',
  advance_on_error: 'Advance on Error',
  runner_interference: 'Runner Interference',
  appeal_play: 'Appeal Play',
  tagged_out: 'Tagged Out',
  force_out: 'Force Out',
  hit_by_ball: 'Hit By Ball',
  missed_base: 'Missed Base',
  left_base_early: 'Left Base Early',
  left_base_path: 'Left Base Path',
  offensive_interference: 'Offensive Interference',
  passed_runner: 'Passed Runner',
  hesitation: 'Hesitation',
  illegal_pitch: 'Illegal Pitch',

  // System / misc
  pitch: 'Pitch',
  end_half_inning: 'End of Inning',
  substitution: 'Substitution',
  adjust_score: 'Score Adjustment',
  interference: 'Interference',
  other: 'Other',
};
