/**
 * Lineup positions per team at each event (for catcher on passed balls, etc.).
 * Mirrors packages/api/src/services/finalize-game.ts `buildPositionMapsByEvent`.
 */

type PosMap = Map<number, Map<number, number>>;

function clonePosMap(src: PosMap): PosMap {
  const out: PosMap = new Map();
  for (const [teamId, posMap] of src) out.set(teamId, new Map(posMap));
  return out;
}

function removePlayerFromTeamPositions(posMap: Map<number, number>, playerId: number) {
  for (const [pos, pid] of [...posMap.entries()]) {
    if (pid === playerId) posMap.delete(pos);
  }
}

function setPlayerPosition(current: PosMap, teamId: number | undefined, playerId: number | undefined, position: number | undefined) {
  if (!teamId || !playerId || !position) return;
  const posMap = current.get(teamId) ?? new Map<number, number>();
  removePlayerFromTeamPositions(posMap, playerId);
  posMap.set(position, playerId);
  current.set(teamId, posMap);
}

export interface LineupPosRow {
  playerId: number;
  teamId: number;
  position: number | null;
  isActive: boolean;
}

export interface EventForPositionMap {
  id: number;
  eventNumber: number;
  eventType: string;
  eventDetail: string | null;
}

/** event id → team id → defensive position (1–9) → player id */
export function buildPositionMapsByEvent(events: EventForPositionMap[], lineups: LineupPosRow[]): Map<number, PosMap> {
  const playerTeam = new Map<number, number>();
  const current: PosMap = new Map();
  for (const row of lineups) {
    playerTeam.set(row.playerId, row.teamId);
    if (!row.isActive || row.position == null) continue;
    const posMap = current.get(row.teamId) ?? new Map<number, number>();
    posMap.set(row.position, row.playerId);
    current.set(row.teamId, posMap);
  }

  const byEventId = new Map<number, PosMap>();
  const descEvents = [...events].sort((a, b) => (b.eventNumber ?? 0) - (a.eventNumber ?? 0));
  for (const event of descEvents) {
    if (event.id != null) byEventId.set(event.id, clonePosMap(current));
    if (event.eventType !== 'substitution' || !event.eventDetail) continue;

    let detail: {
      kind?: string;
      teamId?: number;
      position?: number;
      outPlayerId?: number;
      inPlayerId?: number;
      changes?: Array<{ playerId?: number; oldPosition?: number; newPosition?: number }>;
    } = {};
    try {
      detail = JSON.parse(event.eventDetail || '{}');
    } catch {
      continue;
    }

    if (detail.kind === 'position_swap' && Array.isArray(detail.changes)) {
      for (const change of detail.changes) {
        const playerId = Number(change.playerId);
        const teamId = playerTeam.get(playerId);
        const oldPosition = Number(change.oldPosition);
        if (!Number.isFinite(playerId) || !Number.isFinite(oldPosition)) continue;
        setPlayerPosition(current, teamId, playerId, oldPosition);
      }
    } else if (detail.kind === 'player_change') {
      const teamId = Number(detail.teamId);
      const inPlayerId = Number(detail.inPlayerId);
      const outPlayerId = Number(detail.outPlayerId);
      const position = Number(detail.position);
      if (Number.isFinite(teamId) && Number.isFinite(inPlayerId)) {
        const posMap = current.get(teamId);
        if (posMap) removePlayerFromTeamPositions(posMap, inPlayerId);
      }
      if (Number.isFinite(teamId) && Number.isFinite(outPlayerId) && Number.isFinite(position)) {
        setPlayerPosition(current, teamId, outPlayerId, position);
      }
    }
  }

  return byEventId;
}
