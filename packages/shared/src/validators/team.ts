import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  shortName: z.string().max(20).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  foundedYear: z.number().int().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const updateTeamSchema = createTeamSchema.partial();
