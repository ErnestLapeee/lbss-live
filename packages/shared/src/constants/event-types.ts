export const HIT_EVENTS = ['single', 'double', 'triple', 'home_run'] as const;
export const OUT_EVENTS = ['strikeout_swinging', 'strikeout_looking', 'ground_out', 'fly_out', 'line_out', 'pop_out', 'double_play', 'triple_play'] as const;
export const WALK_EVENTS = ['walk', 'intentional_walk', 'hit_by_pitch'] as const;
export const SACRIFICE_EVENTS = ['sacrifice_fly', 'sacrifice_bunt'] as const;

export const AT_BAT_EVENTS = [...HIT_EVENTS, ...OUT_EVENTS.filter(e => e !== 'double_play' && e !== 'triple_play'), 'fielders_choice', 'error'] as const;
export const PLATE_APPEARANCE_EVENTS = [...AT_BAT_EVENTS, ...WALK_EVENTS, ...SACRIFICE_EVENTS] as const;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home Run',
  walk: 'Walk', intentional_walk: 'Intentional Walk', hit_by_pitch: 'Hit By Pitch',
  strikeout_swinging: 'Strikeout (Swinging)', strikeout_looking: 'Strikeout (Looking)',
  sacrifice_fly: 'Sacrifice Fly', sacrifice_bunt: 'Sacrifice Bunt',
  fielders_choice: "Fielder's Choice",
  ground_out: 'Ground Out', fly_out: 'Fly Out', line_out: 'Line Out', pop_out: 'Pop Out',
  double_play: 'Double Play', triple_play: 'Triple Play',
  error: 'Error', wild_pitch: 'Wild Pitch', passed_ball: 'Passed Ball',
  stolen_base: 'Stolen Base', caught_stealing: 'Caught Stealing',
  balk: 'Balk', interference: 'Interference', other: 'Other',
};
