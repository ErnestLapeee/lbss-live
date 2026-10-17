/** Jaunieši games are marked on the season. Lineup size is chosen while scoring, not in advance. */

export const YOUTH_MAX_BATTING_ORDER = 30;
/** First extra fielder. Position 10 stays the adult DH, who does not play defense. */
export const EXTRA_FIELDER_POSITION = 11;
const EXTRA_FIELDER_LAST = 16;

export interface YouthRules {
  fielders: number;
  maxRunsPerInning: number | null;
}

export interface LineupRules {
  youth: boolean;
  maxBattingOrder: number;
  maxFielders: number;
  maxRunsPerInning: number | null;
}

/** Older seasons may still store these. Scoring no longer uses them. */
export function parseYouthRules(raw: unknown): YouthRules {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fielders = Number(source.fielders);
  const runs = Number(source.maxRunsPerInning);
  return {
    fielders: Number.isInteger(fielders) && fielders >= 5 && fielders <= 12 ? fielders : 6,
    maxRunsPerInning: Number.isInteger(runs) && runs >= 1 && runs <= 30 ? runs : null,
  };
}

export function lineupRulesForSeason(leagueLevel: unknown, _youthRules?: unknown): LineupRules {
  if (leagueLevel !== 'youth') {
    return { youth: false, maxBattingOrder: 10, maxFielders: 10, maxRunsPerInning: null };
  }
  return {
    youth: true,
    maxBattingOrder: YOUTH_MAX_BATTING_ORDER,
    maxFielders: YOUTH_MAX_BATTING_ORDER,
    maxRunsPerInning: null,
  };
}

/** Positions that can record a putout or assist. 10 is the DH. 11–16 are extra fielders. */
export function isNumberedFielder(position: number): boolean {
  return (position >= 1 && position <= 9) || (position >= EXTRA_FIELDER_POSITION && position <= EXTRA_FIELDER_LAST);
}

export function isExtraFielder(position: number): boolean {
  return position >= EXTRA_FIELDER_POSITION && position <= EXTRA_FIELDER_LAST;
}

export function validateLineupEntries(
  entries: Array<{ playerId: number | null; battingOrder: number; position: number | null }>,
  rules: LineupRules,
): string | null {
  const battingOrders = entries.map((entry) => Number(entry.battingOrder));
  if (battingOrders.some((order) => !Number.isInteger(order) || order < 1 || order > rules.maxBattingOrder)) {
    return rules.youth
      ? `Batting order must be integers 1–${rules.maxBattingOrder}`
      : 'Batting order must be integers 1–10 for each slot';
  }
  if (new Set(battingOrders).size !== battingOrders.length) {
    return 'Duplicate batting order in lineup';
  }

  const playerIds: number[] = [];
  const positions: number[] = [];
  for (const entry of entries) {
    const vacant = entry.playerId == null;
    if (vacant) {
      if (entry.position != null) return 'Vacant lineup slots cannot have a defensive position';
      continue;
    }
    const playerId = Number(entry.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) return 'Invalid player id in lineup';
    playerIds.push(playerId);

    if (entry.position == null) {
      if (!rules.youth) return 'Each filled slot needs a defensive position 1–10';
      continue;
    }
    const position = Number(entry.position);
    if (rules.youth) {
      if (!isNumberedFielder(position)) {
        return 'Jaunieši fielders use positions 1–9, or an extra fielder spot';
      }
    } else if (!Number.isInteger(position) || position < 1 || position > 10) {
      return 'Each filled slot needs a defensive position 1–10';
    }
    positions.push(position);
  }

  if (new Set(playerIds).size !== playerIds.length) {
    return 'The same player cannot appear twice in one lineup';
  }
  if (new Set(positions).size !== positions.length) {
    return rules.youth
      ? 'Each fielder needs a different position'
      : 'Each defensive position (P–DH) must be unique among active fielders';
  }
  return null;
}
