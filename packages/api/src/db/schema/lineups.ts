import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { games } from './games.js';
import { teams } from './teams.js';
import { players } from './players.js';

export const gameLineups = pgTable(
  'game_lineups',
  {
    id: serial('id').primaryKey(),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    battingOrder: integer('batting_order').notNull(), // 1-9, 0 = sub not yet in
    position: integer('position').notNull(), // 1=P,2=C,3=1B,4=2B,5=3B,6=SS,7=LF,8=CF,9=RF,10=DH
    enteredInning: integer('entered_inning').default(1),
    enteredHalf: varchar('entered_half', { length: 3 }).default('top'),
    isStarter: boolean('is_starter').default(true),
    isActive: boolean('is_active').default(true),
  },
  (table) => [
    index('game_lineups_game_id_idx').on(table.gameId),
    index('game_lineups_game_id_team_id_idx').on(table.gameId, table.teamId),
  ]
);
