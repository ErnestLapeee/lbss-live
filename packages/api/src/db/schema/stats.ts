import {
  pgTable,
  serial,
  integer,
  varchar,
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { games } from './games.js';
import { players } from './players.js';
import { teams } from './teams.js';
import { seasons } from './seasons.js';
import { leagues } from './leagues.js';

export const playerGameBatting = pgTable(
  'player_game_batting',
  {
    id: serial('id').primaryKey(),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    plateAppearances: integer('plate_appearances').default(0),
    atBats: integer('at_bats').default(0),
    hits: integer('hits').default(0),
    singles: integer('singles').default(0),
    doubles: integer('doubles').default(0),
    triples: integer('triples').default(0),
    homeRuns: integer('home_runs').default(0),
    rbi: integer('rbi').default(0),
    runs: integer('runs').default(0),
    walks: integer('walks').default(0),
    strikeouts: integer('strikeouts').default(0),
    hitByPitch: integer('hit_by_pitch').default(0),
    sacrificeFlies: integer('sacrifice_flies').default(0),
    sacrificeBunts: integer('sacrifice_bunts').default(0),
    stolenBases: integer('stolen_bases').default(0),
    caughtStealing: integer('caught_stealing').default(0),
    errors: integer('errors').default(0),
    groundOuts: integer('ground_outs').default(0),
    flyOuts: integer('fly_outs').default(0),
    groundedIntoDoublePlays: integer('grounded_into_double_plays').default(0),
    intentionalWalks: integer('intentional_walks').default(0),
    reachedOnError: integer('reached_on_error').default(0),
    totalBases: integer('total_bases').default(0),
    buntSingles: integer('bunt_singles').default(0),
    strikeoutsLooking: integer('strikeouts_looking').default(0),
    strikeoutsSwinging: integer('strikeouts_swinging').default(0),
    pickedOff: integer('picked_off').default(0),
    fieldersChoice: integer('fielders_choice').default(0),
    catcherInterference: integer('catcher_interference').default(0),
    groundedIntoTriplePlay: integer('grounded_into_triple_play').default(0),
  },
  (table) => [
    uniqueIndex('player_game_batting_game_id_player_id_unique').on(
      table.gameId,
      table.playerId
    ),
  ]
);

export const playerGamePitching = pgTable(
  'player_game_pitching',
  {
    id: serial('id').primaryKey(),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    inningsPitched: numeric('innings_pitched', { precision: 4, scale: 1 }).default(
      '0'
    ),
    hitsAllowed: integer('hits_allowed').default(0),
    runsAllowed: integer('runs_allowed').default(0),
    earnedRuns: integer('earned_runs').default(0),
    walksAllowed: integer('walks_allowed').default(0),
    strikeouts: integer('strikeouts').default(0),
    homeRunsAllowed: integer('home_runs_allowed').default(0),
    hitBatters: integer('hit_batters').default(0),
    wildPitches: integer('wild_pitches').default(0),
    pitchesThrown: integer('pitches_thrown'),
    balls: integer('balls').default(0),
    strikes: integer('strikes').default(0),
    firstPitchStrikes: integer('first_pitch_strikes').default(0),
    firstPitchTotal: integer('first_pitch_total').default(0),
    isStarter: boolean('is_starter').default(false),
    decision: varchar('decision', { length: 5 }),
    battersFaced: integer('batters_faced').default(0),
    balks: integer('balks').default(0),
    intentionalWalks: integer('intentional_walks').default(0),
    groundOuts: integer('ground_outs').default(0),
    flyOuts: integer('fly_outs').default(0),
    holds: integer('holds').default(0),
    saveOpportunities: integer('save_opportunities').default(0),
    blownSaves: integer('blown_saves').default(0),
    completeGames: integer('complete_games').default(0),
    gameScore: integer('game_score'),
    qualityStarts: integer('quality_starts').default(0),
    shutouts: integer('shutouts').default(0),
    inheritedRunners: integer('inherited_runners').default(0),
    inheritedRunnersScored: integer('inherited_runners_scored').default(0),
    strikeoutsLooking: integer('strikeouts_looking').default(0),
    strikeoutsSwinging: integer('strikeouts_swinging').default(0),
  },
  (table) => [
    uniqueIndex('player_game_pitching_game_id_player_id_unique').on(
      table.gameId,
      table.playerId
    ),
  ]
);

export const playerSeasonBatting = pgTable(
  'player_season_batting',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    games: integer('games').default(0),
    plateAppearances: integer('plate_appearances').default(0),
    atBats: integer('at_bats').default(0),
    hits: integer('hits').default(0),
    singles: integer('singles').default(0),
    doubles: integer('doubles').default(0),
    triples: integer('triples').default(0),
    homeRuns: integer('home_runs').default(0),
    rbi: integer('rbi').default(0),
    runs: integer('runs').default(0),
    walks: integer('walks').default(0),
    strikeouts: integer('strikeouts').default(0),
    hitByPitch: integer('hit_by_pitch').default(0),
    stolenBases: integer('stolen_bases').default(0),
    caughtStealing: integer('caught_stealing').default(0),
    sacrificeFlies: integer('sacrifice_flies').default(0),
    sacrificeBunts: integer('sacrifice_bunts').default(0),
    groundOuts: integer('ground_outs').default(0),
    flyOuts: integer('fly_outs').default(0),
    groundedIntoDoublePlays: integer('grounded_into_double_plays').default(0),
    intentionalWalks: integer('intentional_walks').default(0),
    reachedOnError: integer('reached_on_error').default(0),
    totalBases: integer('total_bases').default(0),
    buntSingles: integer('bunt_singles').default(0),
    strikeoutsLooking: integer('strikeouts_looking').default(0),
    strikeoutsSwinging: integer('strikeouts_swinging').default(0),
    pickedOff: integer('picked_off').default(0),
    fieldersChoice: integer('fielders_choice').default(0),
    catcherInterference: integer('catcher_interference').default(0),
    groundedIntoTriplePlay: integer('grounded_into_triple_play').default(0),
    battingAvg: numeric('batting_avg', { precision: 4, scale: 3 }),
    onBasePct: numeric('on_base_pct', { precision: 4, scale: 3 }),
    sluggingPct: numeric('slugging_pct', { precision: 4, scale: 3 }),
    ops: numeric('ops', { precision: 5, scale: 3 }),
    babip: numeric('babip', { precision: 4, scale: 3 }),
    lastComputedAt: timestamp('last_computed_at', {
      withTimezone: true,
    }).defaultNow(),
  },
  (table) => [
    uniqueIndex('player_season_batting_player_id_team_id_season_id_unique').on(
      table.playerId,
      table.teamId,
      table.seasonId
    ),
  ]
);

export const playerSeasonPitching = pgTable(
  'player_season_pitching',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    games: integer('games').default(0),
    gamesStarted: integer('games_started').default(0),
    wins: integer('wins').default(0),
    losses: integer('losses').default(0),
    saves: integer('saves').default(0),
    inningsPitched: numeric('innings_pitched', { precision: 5, scale: 1 }).default('0'),
    hitsAllowed: integer('hits_allowed').default(0),
    runsAllowed: integer('runs_allowed').default(0),
    earnedRuns: integer('earned_runs').default(0),
    walksAllowed: integer('walks_allowed').default(0),
    strikeouts: integer('strikeouts').default(0),
    homeRunsAllowed: integer('home_runs_allowed').default(0),
    hitBatters: integer('hit_batters').default(0),
    wildPitches: integer('wild_pitches').default(0),
    battersFaced: integer('batters_faced').default(0),
    balks: integer('balks').default(0),
    intentionalWalks: integer('intentional_walks').default(0),
    groundOuts: integer('ground_outs').default(0),
    flyOuts: integer('fly_outs').default(0),
    era: numeric('era', { precision: 5, scale: 2 }),
    whip: numeric('whip', { precision: 4, scale: 2 }),
    strikeoutRate: numeric('strikeout_rate', { precision: 4, scale: 1 }),
    walkRate: numeric('walk_rate', { precision: 4, scale: 1 }),
    fip: numeric('fip', { precision: 5, scale: 2 }),
    k9: numeric('k9', { precision: 4, scale: 1 }),
    bb9: numeric('bb9', { precision: 4, scale: 1 }),
    h9: numeric('h9', { precision: 4, scale: 1 }),
    babip: numeric('babip', { precision: 4, scale: 3 }),
    holds: integer('holds').default(0),
    saveOpportunities: integer('save_opportunities').default(0),
    blownSaves: integer('blown_saves').default(0),
    completeGames: integer('complete_games').default(0),
    gameScore: integer('game_score'),
    qualityStarts: integer('quality_starts').default(0),
    shutouts: integer('shutouts').default(0),
    inheritedRunners: integer('inherited_runners').default(0),
    inheritedRunnersScored: integer('inherited_runners_scored').default(0),
    strikeoutsLooking: integer('strikeouts_looking').default(0),
    strikeoutsSwinging: integer('strikeouts_swinging').default(0),
    balls: integer('balls').default(0),
    strikes: integer('strikes').default(0),
    firstPitchStrikes: integer('first_pitch_strikes').default(0),
    firstPitchTotal: integer('first_pitch_total').default(0),
    lastComputedAt: timestamp('last_computed_at', {
      withTimezone: true,
    }).defaultNow(),
  },
  (table) => [
    uniqueIndex('player_season_pitching_player_id_team_id_season_id_unique').on(
      table.playerId,
      table.teamId,
      table.seasonId
    ),
  ]
);

export const playerGameFielding = pgTable(
  'player_game_fielding',
  {
    id: serial('id').primaryKey(),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    position: integer('position'), // 1=P..9=RF
    innings: numeric('innings', { precision: 4, scale: 1 }).default('0'),
    putouts: integer('putouts').default(0),
    assists: integer('assists').default(0),
    errors: integer('errors').default(0),
    doublePlays: integer('double_plays').default(0),
    triplePlays: integer('triple_plays').default(0),
    passedBalls: integer('passed_balls').default(0),
    catcherStolenBases: integer('catcher_stolen_bases').default(0),
    catcherCaughtStealing: integer('catcher_caught_stealing').default(0),
    pickoffs: integer('pickoffs').default(0),
  },
  (table) => [
    uniqueIndex('player_game_fielding_game_player_unique').on(
      table.gameId,
      table.playerId
    ),
  ]
);

export const playerSeasonFielding = pgTable(
  'player_season_fielding',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    games: integer('games').default(0),
    innings: numeric('innings', { precision: 5, scale: 1 }).default('0'),
    putouts: integer('putouts').default(0),
    assists: integer('assists').default(0),
    errors: integer('errors').default(0),
    doublePlays: integer('double_plays').default(0),
    triplePlays: integer('triple_plays').default(0),
    passedBalls: integer('passed_balls').default(0),
    catcherStolenBases: integer('catcher_stolen_bases').default(0),
    catcherCaughtStealing: integer('catcher_caught_stealing').default(0),
    pickoffs: integer('pickoffs').default(0),
    fieldingPct: numeric('fielding_pct', { precision: 4, scale: 3 }),
    lastComputedAt: timestamp('last_computed_at', {
      withTimezone: true,
    }).defaultNow(),
  },
  (table) => [
    uniqueIndex('player_season_fielding_player_team_season_unique').on(
      table.playerId,
      table.teamId,
      table.seasonId
    ),
  ]
);

export const standings = pgTable(
  'standings',
  {
    id: serial('id').primaryKey(),
    leagueId: integer('league_id')
      .notNull()
      .references(() => leagues.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    wins: integer('wins').default(0),
    losses: integer('losses').default(0),
    ties: integer('ties').default(0),
    gamesPlayed: integer('games_played').default(0),
    runsScored: integer('runs_scored').default(0),
    runsAllowed: integer('runs_allowed').default(0),
    winPct: numeric('win_pct', { precision: 4, scale: 3 }).default('0'),
    gamesBehind: numeric('games_behind', { precision: 4, scale: 1 }),
    streak: varchar('streak', { length: 10 }),
    lastTen: varchar('last_ten', { length: 10 }),
    lastComputedAt: timestamp('last_computed_at', {
      withTimezone: true,
    }).defaultNow(),
  },
  (table) => [
    uniqueIndex('standings_league_id_team_id_unique').on(
      table.leagueId,
      table.teamId
    ),
  ]
);
