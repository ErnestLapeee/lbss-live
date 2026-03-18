import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { playoffs } from './playoffs.js';
import { teams } from './teams.js';

export const playoffSeries = pgTable(
  'playoff_series',
  {
    id: serial('id').primaryKey(),
    playoffsId: integer('playoffs_id')
      .notNull()
      .references(() => playoffs.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull(),
    seriesIndex: integer('series_index').notNull(),
    label: varchar('label', { length: 120 }),
    // Manual seeding numbers (1 = best seed). Used for auto-fill and display.
    higherSeed: integer('higher_seed'),
    lowerSeed: integer('lower_seed'),
    // Team assignments can be manual or derived from seeds.
    higherTeamId: integer('higher_team_id').references(() => teams.id),
    lowerTeamId: integer('lower_team_id').references(() => teams.id),
    bestOf: integer('best_of').notNull().default(1),
    winnerTeamId: integer('winner_team_id').references(() => teams.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('playoff_series_playoffs_id_idx').on(t.playoffsId),
    index('playoff_series_round_idx').on(t.playoffsId, t.roundNumber),
  ]
);

