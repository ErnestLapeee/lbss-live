export const GAME_STATUSES = [
  'scheduled',
  'postponed',
  'cancelled',
  'live',
  'suspended',
  'final',
] as const;

export type GameStatus = (typeof GAME_STATUSES)[number];
export type GameTransitionSource = 'admin' | 'start' | 'pause' | 'resume' | 'finalize';

export function normalizeGameStatus(value: unknown): GameStatus | null {
  const status = String(value ?? '').trim().toLowerCase();
  return (GAME_STATUSES as readonly string[]).includes(status)
    ? status as GameStatus
    : null;
}

export function gameTransitionError(args: {
  currentStatus: unknown;
  targetStatus: unknown;
  isFinalized: boolean | null | undefined;
  source: GameTransitionSource;
}): string | null {
  const current = normalizeGameStatus(args.currentStatus);
  const target = normalizeGameStatus(args.targetStatus);
  if (!current) return `Unknown current game status: ${String(args.currentStatus)}`;
  if (!target) return `Unknown target game status: ${String(args.targetStatus)}`;

  if (args.isFinalized || current === 'final') {
    if (args.source === 'finalize' && target === 'final' && args.isFinalized) {
      return 'Game is already finalized';
    }
    return 'Finalized games cannot change status';
  }

  if (args.source === 'finalize') {
    return target === 'final' && (current === 'live' || current === 'suspended')
      ? null
      : 'Only a live or suspended game can be finalized';
  }
  if (args.source === 'start') {
    return target === 'live' && (current === 'scheduled' || current === 'postponed')
      ? null
      : 'Only a scheduled or postponed game can be started';
  }
  if (args.source === 'pause') {
    return target === 'suspended' && current === 'live'
      ? null
      : 'Only a live game can be suspended';
  }
  if (args.source === 'resume') {
    return target === 'live' && current === 'suspended'
      ? null
      : 'Only a suspended game can be resumed';
  }

  // Generic game editing may schedule, postpone, or cancel a game. Live,
  // suspended, and final states are owned by the scoring lifecycle endpoints.
  if (target === 'live' || target === 'suspended' || target === 'final') {
    return 'Use the scoring lifecycle controls to start, suspend, resume, or finalize a game';
  }
  return current === 'live' || current === 'suspended'
    ? 'A live or suspended game must be changed through the scoring lifecycle controls'
    : null;
}
