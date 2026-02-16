import { z } from 'zod';

export const createPlayerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().nullable().optional(),
  nationality: z.string().default('LV'),
  throws: z.enum(['L', 'R', 'S']).nullable().optional(),
  bats: z.enum(['L', 'R', 'S']).nullable().optional(),
  heightCm: z.number().int().positive().nullable().optional(),
  weightKg: z.number().int().positive().nullable().optional(),
  bio: z.string().nullable().optional(),
});

export const updatePlayerSchema = createPlayerSchema.partial();
