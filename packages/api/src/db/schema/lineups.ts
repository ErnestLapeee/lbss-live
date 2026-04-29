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
    /** Null = vacant batting-order slot (no hitter yet / ejected). */
    playerId: integer('player_id').references(() => players.id),
    battingOrder: integer('batting_order').notNull(), // 1-9, 0 = sub not yet in
    /** Null when playerId is null (vacant slot does not occupy a defensive position). */
    position: integer('position'), // 1=P..10=DH when fielding
    enteredInning: integer('entered_inning').default(1),
    enteredHalf: varchar('entered_half', { length: 3 }).default('top'),
    /** Set when this stint ends (player subbed out); used for fielding innings. */
    exitedInning: integer('exited_inning'),
    exitedHalf: varchar('exited_half', { length: 3 }),
    isStarter: boolean('is_starter').default(true),
    isActive: boolean('is_active').default(true),
  },
  (table) => [
    index('game_lineups_game_id_idx').on(table.gameId),
    index('game_lineups_game_id_team_id_idx').on(table.gameId, table.teamId),
  ]
);
