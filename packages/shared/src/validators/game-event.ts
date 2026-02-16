import { z } from 'zod';

const eventTypes = ['single','double','triple','home_run','walk','intentional_walk','hit_by_pitch','strikeout_swinging','strikeout_looking','sacrifice_fly','sacrifice_bunt','fielders_choice','ground_out','fly_out','line_out','pop_out','double_play','triple_play','error','wild_pitch','passed_ball','stolen_base','caught_stealing','balk','interference','other'] as const;

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
