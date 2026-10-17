/** Children's league rules stored on a season. Adult seasons ignore these. */

export const YOUTH_MAX_BATTING_ORDER = 30;
/** Tenth fielder. Position 10 stays the adult DH, who does not play defense. */
export const EXTRA_FIELDER_POSITION = 11;

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

export function parseYouthRules(raw: unknown): YouthRules {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fielders = Number(source.fielders);
  const runs = Number(source.maxRunsPerInning);
  return {
    fielders: Number.isInteger(fielders) && fielders >= 5 && fielders <= 12 ? fielders : 6,
    maxRunsPerInning: Number.isInteger(runs) && runs >= 1 && runs <= 30 ? runs : null,
  };
}

export function lineupRulesForSeason(leagueLevel: unknown, youthRules: unknown): LineupRules {
  if (leagueLevel !== 'youth') {
    return { youth: false, maxBattingOrder: 10, maxFielders: 10, maxRunsPerInning: null };
  }
  const rules = parseYouthRules(youthRules);
  return {
    youth: true,
    maxBattingOrder: YOUTH_MAX_BATTING_ORDER,
    maxFielders: rules.fielders,
    maxRunsPerInning: rules.maxRunsPerInning,
  };
}

/** Positions that can record a putout or assist. 10 is the DH. */
export function isNumberedFielder(position: number): boolean {
  return (position >= 1 && position <= 9) || position === EXTRA_FIELDER_POSITION;
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
      const extraFielder = rules.maxFielders > 9 && position === EXTRA_FIELDER_POSITION;
      if (!((position >= 1 && position <= 9) || extraFielder)) {
        return 'Children\'s fielders use positions 1–9, or EF when the field has more than nine';
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
  if (rules.youth && positions.length > rules.maxFielders) {
    return `This children's season fields ${rules.maxFielders}. Extra players bat only, with no position.`;
  }
  return null;
}
