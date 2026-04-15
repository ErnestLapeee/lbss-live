import { seasons } from '../db/schema/index.js';
import type { SeasonsColumnFlags } from './seasons-playoff-columns-cache.js';

/** Drizzle select shape for `seasons` that omits columns not present in the DB yet. */
export function seasonsRowSelectShape(flags: SeasonsColumnFlags) {
  return {
    id: seasons.id,
    year: seasons.year,
    name: seasons.name,
    startDate: seasons.startDate,
    endDate: seasons.endDate,
    isActive: seasons.isActive,
    ...(flags.hasSeasonKindOptionals
      ? { seasonKind: seasons.seasonKind, parentSeasonId: seasons.parentSeasonId }
      : {}),
    ...(flags.hasPlayoffOptionals
      ? {
          hasPlayoffs: seasons.hasPlayoffs,
          regularSeasonGamesPerTeam: seasons.regularSeasonGamesPerTeam,
          playoffSettings: seasons.playoffSettings,
        }
      : {}),
    createdAt: seasons.createdAt,
  };
}
