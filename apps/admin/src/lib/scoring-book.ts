import { reduceGameState, type GameState } from '@lbss/shared';

export type BookEvent = {
  id: number;
  eventNumber: number;
  eventType: string;
  eventDetail?: string | null;
  half: string;
  inning: number;
  runsScored?: number;
  outsRecorded?: number;
  rbi?: number;
  runnerFirstId?: number | null;
  runnerSecondId?: number | null;
  runnerThirdId?: number | null;
  batterId?: number | null;
  pitcherId?: number | null;
  isDeleted?: boolean;
};

export type BookLineup = {
  id: number;
  playerId: number | null;
  teamId: number;
  battingOrder: number;
  position: number | null;
  isActive: boolean;
  isStarter?: boolean;
  firstName: string;
  lastName: string;
  bats?: string | null;
  jerseyNumber?: string | null;
  enteredInning?: number | null;
  enteredHalf?: string | null;
  exitedInning?: number | null;
  exitedHalf?: string | null;
};

export type BookPlayer = {
  playerId: number;
  teamId: number;
  firstName: string;
  lastName: string;
  jerseyNumber?: string | null;
  bats?: string | null;
};

export type ScoringSnapshot = {
  game: Record<string, unknown>;
  events: BookEvent[];
  homeLineup: BookLineup[];
  awayLineup: BookLineup[];
  homeRoster: BookPlayer[];
  awayRoster: BookPlayer[];
};

export type ScoringOp =
  | { id: string; kind: 'event'; body: Record<string, unknown> }
  | { id: string; kind: 'undo'; targetEventNumber: number }
  | { id: string; kind: 'redo'; targetEventNumber: number }
  | {
      id: string;
      kind: 'substitute';
      body: {
        outPlayerId: number;
        inPlayerId: number;
        teamId: number;
        position: number | null;
        inning: number;
        half: string;
        subKind?: string;
      };
    }
  | { id: string; kind: 'swap'; body: { changes: Array<{ playerId: number; newPosition: number }> } }
  | { id: string; kind: 'adjust-score'; body: { homeScore: number; awayScore: number } };

type StoredBook = { base: ScoringSnapshot; pending: ScoringOp[] };

export type ScoringView = ScoringSnapshot & { state: GameState; pending: number };

const memory = new Map<number, StoredBook>();

function storageKey(gameId: number) {
  return `lbss-scoring-book:${gameId}`;
}

function canStore(): boolean {
  return typeof localStorage !== 'undefined';
}

export function readBook(gameId: number): StoredBook | null {
  if (!canStore()) return memory.get(gameId) ?? null;
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBook;
    if (!parsed?.base || !Array.isArray(parsed.pending)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBook(gameId: number, book: StoredBook) {
  memory.set(gameId, book);
  if (!canStore()) return;
  try {
    localStorage.setItem(storageKey(gameId), JSON.stringify(book));
  } catch {
    /* A full disk should not stop the in-memory book for this session. */
  }
}

export function writeSnapshot(gameId: number, snapshot: ScoringSnapshot) {
  const existing = readBook(gameId);
  if (existing && existing.pending.length > 0) return;
  writeBook(gameId, { base: snapshot, pending: [] });
}

function activeMax(events: BookEvent[]): number {
  return events.filter((e) => !e.isDeleted).reduce((max, e) => Math.max(max, e.eventNumber), 0);
}

function clearRedoTail(events: BookEvent[]): BookEvent[] {
  const tail = activeMax(events);
  return events.filter((e) => !(e.isDeleted && e.eventNumber > tail));
}

function appendEvent(events: BookEvent[], partial: Omit<BookEvent, 'id' | 'eventNumber'> & { id?: number }): BookEvent[] {
  const kept = clearRedoTail(events);
  const eventNumber = kept.reduce((max, e) => Math.max(max, e.eventNumber), 0) + 1;
  return [...kept, { id: -eventNumber, isDeleted: false, rbi: 0, runsScored: 0, outsRecorded: 0, ...partial, eventNumber }];
}

function playerName(roster: BookPlayer[], playerId: number, teamId: number): BookPlayer | undefined {
  return roster.find((p) => p.playerId === playerId && p.teamId === teamId) ?? roster.find((p) => p.playerId === playerId);
}

function applySubstitute(snapshot: ScoringSnapshot, body: Extract<ScoringOp, { kind: 'substitute' }>['body'], events: BookEvent[]): { events: BookEvent[]; homeLineup: BookLineup[]; awayLineup: BookLineup[] } {
  const all = [...snapshot.homeLineup, ...snapshot.awayLineup];
  const outRow = all.find((row) => row.isActive && row.playerId === body.outPlayerId);
  if (!outRow) return { events, homeLineup: snapshot.homeLineup, awayLineup: snapshot.awayLineup };
  const incoming = playerName([...snapshot.homeRoster, ...snapshot.awayRoster], body.inPlayerId, body.teamId);
  const nextRows = all.map((row) =>
    row.id === outRow.id
      ? { ...row, isActive: false, exitedInning: body.inning, exitedHalf: body.half }
      : row,
  );
  nextRows.push({
    id: -Date.now(),
    playerId: body.inPlayerId,
    teamId: body.teamId,
    battingOrder: outRow.battingOrder,
    position: body.position,
    isActive: true,
    isStarter: false,
    firstName: incoming?.firstName ?? '',
    lastName: incoming?.lastName ?? '',
    bats: incoming?.bats ?? null,
    jerseyNumber: incoming?.jerseyNumber ?? null,
    enteredInning: body.inning,
    enteredHalf: body.half,
  });
  const stateBefore = reduceGameState(events.filter((e) => !e.isDeleted) as never);
  const detail = JSON.stringify({
    kind: 'player_change',
    subKind: body.subKind ?? 'defensive',
    position: body.position,
    teamId: body.teamId,
    outPlayerId: body.outPlayerId,
    inPlayerId: body.inPlayerId,
  });
  const nextEvents = appendEvent(events, {
    eventType: 'substitution',
    eventDetail: detail,
    inning: body.inning,
    half: body.half,
    batterId: null,
    pitcherId: null,
    runsScored: 0,
    outsRecorded: 0,
    runnerFirstId: stateBefore.bases.first,
    runnerSecondId: stateBefore.bases.second,
    runnerThirdId: stateBefore.bases.third,
  });
  return {
    events: nextEvents,
    homeLineup: nextRows.filter((row) => row.teamId === Number(snapshot.game.homeTeamId)),
    awayLineup: nextRows.filter((row) => row.teamId === Number(snapshot.game.awayTeamId)),
  };
}

function revertSubstitute(lineups: BookLineup[], detailRaw: string | null | undefined): BookLineup[] {
  let detail: { kind?: string; outPlayerId?: number; inPlayerId?: number; changes?: Array<{ playerId?: number; oldPosition?: number; newPosition?: number }> } = {};
  try {
    detail = JSON.parse(detailRaw || '{}');
  } catch {
    return lineups;
  }
  if (detail.kind === 'position_swap' && Array.isArray(detail.changes)) {
    return lineups.map((row) => {
      const change = detail.changes?.find((c) => c.playerId === row.playerId && row.isActive);
      return change && change.oldPosition != null ? { ...row, position: change.oldPosition } : row;
    });
  }
  if (detail.kind !== 'player_change' || detail.outPlayerId == null || detail.inPlayerId == null) return lineups;
  const incoming = [...lineups].reverse().find((row) => row.isActive && row.playerId === detail.inPlayerId);
  const outgoing = [...lineups].reverse().find((row) => !row.isActive && row.playerId === detail.outPlayerId);
  return lineups
    .filter((row) => row.id !== incoming?.id)
    .map((row) =>
      outgoing && row.id === outgoing.id ? { ...row, isActive: true, exitedInning: null, exitedHalf: null } : row,
    );
}

function applySwap(snapshot: ScoringSnapshot, changes: Array<{ playerId: number; newPosition: number }>, events: BookEvent[]) {
  const all = [...snapshot.homeLineup, ...snapshot.awayLineup];
  const detailChanges = changes.map((change) => {
    const row = all.find((entry) => entry.isActive && entry.playerId === change.playerId);
    return {
      playerId: change.playerId,
      oldPosition: row?.position ?? change.newPosition,
      newPosition: change.newPosition,
    };
  });
  const nextRows = all.map((row) => {
    const change = changes.find((c) => c.playerId === row.playerId && row.isActive);
    return change ? { ...row, position: change.newPosition } : row;
  });
  const stateBefore = reduceGameState(events.filter((e) => !e.isDeleted) as never);
  const half = stateBefore.half;
  const nextEvents = appendEvent(events, {
    eventType: 'substitution',
    eventDetail: JSON.stringify({ kind: 'position_swap', changes: detailChanges }),
    inning: stateBefore.inning,
    half,
    batterId: null,
    pitcherId: null,
    runnerFirstId: stateBefore.bases.first,
    runnerSecondId: stateBefore.bases.second,
    runnerThirdId: stateBefore.bases.third,
  });
  return {
    events: nextEvents,
    homeLineup: nextRows.filter((row) => row.teamId === Number(snapshot.game.homeTeamId)),
    awayLineup: nextRows.filter((row) => row.teamId === Number(snapshot.game.awayTeamId)),
  };
}

function reapplySubstitution(lineups: BookLineup[], detailRaw: string | null | undefined, roster: BookPlayer[]): BookLineup[] {
  let detail: {
    kind?: string;
    outPlayerId?: number;
    inPlayerId?: number;
    teamId?: number;
    position?: number | null;
    changes?: Array<{ playerId?: number; newPosition?: number }>;
  } = {};
  try {
    detail = JSON.parse(detailRaw || '{}');
  } catch {
    return lineups;
  }
  if (detail.kind === 'position_swap' && Array.isArray(detail.changes)) {
    return lineups.map((row) => {
      const change = detail.changes?.find((c) => c.playerId === row.playerId && row.isActive);
      return change && change.newPosition != null ? { ...row, position: change.newPosition } : row;
    });
  }
  if (detail.kind !== 'player_change' || detail.outPlayerId == null || detail.inPlayerId == null || detail.teamId == null) {
    return lineups;
  }
  const outRow = lineups.find((row) => row.isActive && row.playerId === detail.outPlayerId);
  if (!outRow) return lineups;
  const incoming = playerName(roster, detail.inPlayerId, detail.teamId);
  const parked = lineups.map((row) =>
    row.id === outRow.id ? { ...row, isActive: false, exitedInning: outRow.enteredInning ?? null, exitedHalf: outRow.enteredHalf ?? null } : row,
  );
  parked.push({
    id: -Date.now(),
    playerId: detail.inPlayerId,
    teamId: detail.teamId,
    battingOrder: outRow.battingOrder,
    position: detail.position ?? outRow.position,
    isActive: true,
    isStarter: false,
    firstName: incoming?.firstName ?? '',
    lastName: incoming?.lastName ?? '',
    bats: incoming?.bats ?? null,
    jerseyNumber: incoming?.jerseyNumber ?? null,
  });
  return parked;
}

function redoTarget(events: BookEvent[]): BookEvent | undefined {
  const tail = activeMax(events);
  return events
    .filter((e) => e.isDeleted && e.eventNumber > tail)
    .sort((a, b) => a.eventNumber - b.eventNumber)[0];
}

export function replayBook(base: ScoringSnapshot, pending: ScoringOp[]): ScoringView {
  let events = base.events.map((e) => ({ ...e }));
  let homeLineup = base.homeLineup.map((row) => ({ ...row }));
  let awayLineup = base.awayLineup.map((row) => ({ ...row }));
  const game = base.game;
  const homeRoster = base.homeRoster;
  const awayRoster = base.awayRoster;

  const current = (): ScoringSnapshot => ({ game, events, homeLineup, awayLineup, homeRoster, awayRoster });

  for (const op of pending) {
    if (op.kind === 'event') {
      const body = op.body;
      events = appendEvent(events, {
        eventType: String(body.eventType ?? 'other'),
        eventDetail: (body.eventDetail as string | null | undefined) ?? null,
        half: String(body.half ?? 'top'),
        inning: Number(body.inning ?? 1),
        runsScored: Number(body.runsScored ?? 0),
        outsRecorded: Number(body.outsRecorded ?? 0),
        rbi: Number(body.rbi ?? 0),
        batterId: (body.batterId as number | null | undefined) ?? null,
        pitcherId: (body.pitcherId as number | null | undefined) ?? null,
        runnerFirstId: (body.runnerFirstId as number | null | undefined) ?? null,
        runnerSecondId: (body.runnerSecondId as number | null | undefined) ?? null,
        runnerThirdId: (body.runnerThirdId as number | null | undefined) ?? null,
      });
    } else if (op.kind === 'undo') {
      const last = [...events].reverse().find((e) => !e.isDeleted);
      if (last) {
        if (last.eventType === 'substitution') {
          const reverted = revertSubstitute([...homeLineup, ...awayLineup], last.eventDetail);
          homeLineup = reverted.filter((row) => row.teamId === Number(game.homeTeamId));
          awayLineup = reverted.filter((row) => row.teamId === Number(game.awayTeamId));
        }
        events = events.map((e) => (e.eventNumber === last.eventNumber ? { ...e, isDeleted: true } : e));
      }
    } else if (op.kind === 'redo') {
      const target = redoTarget(events);
      if (target) {
        events = events.map((e) => (e.eventNumber === target.eventNumber ? { ...e, isDeleted: false } : e));
        if (target.eventType === 'substitution') {
          const restored = reapplySubstitution([...homeLineup, ...awayLineup], target.eventDetail, [...homeRoster, ...awayRoster]);
          homeLineup = restored.filter((row) => row.teamId === Number(game.homeTeamId));
          awayLineup = restored.filter((row) => row.teamId === Number(game.awayTeamId));
        }
      }
    } else if (op.kind === 'substitute') {
      const next = applySubstitute(current(), op.body, events);
      events = next.events;
      homeLineup = next.homeLineup;
      awayLineup = next.awayLineup;
    } else if (op.kind === 'swap') {
      const next = applySwap(current(), op.body.changes, events);
      events = next.events;
      homeLineup = next.homeLineup;
      awayLineup = next.awayLineup;
    } else if (op.kind === 'adjust-score') {
      const state = reduceGameState(events.filter((e) => !e.isDeleted) as never);
      const homeDelta = op.body.homeScore - state.homeScore;
      const awayDelta = op.body.awayScore - state.awayScore;
      if (homeDelta !== 0 || awayDelta !== 0) {
        events = appendEvent(events, {
          eventType: 'adjust_score',
          eventDetail: JSON.stringify({ homeDelta, awayDelta }),
          inning: state.inning,
          half: state.half,
          batterId: null,
          pitcherId: null,
        });
      }
    }
  }

  const state = reduceGameState(events.filter((e) => !e.isDeleted) as never);
  return { game, events, homeLineup, awayLineup, homeRoster, awayRoster, state, pending: pending.length };
}

export function enqueueOp(gameId: number, live: ScoringSnapshot, op: ScoringOp): ScoringView {
  const existing = readBook(gameId);
  const baseSource = existing && existing.pending.length > 0 ? existing.base : live;
  const previous = existing?.base;
  const previousRoster = (previous?.homeRoster.length ?? 0) + (previous?.awayRoster.length ?? 0);
  const sourceRoster = baseSource.homeRoster.length + baseSource.awayRoster.length;
  const base = previous && sourceRoster === 0 && previousRoster > 0
    ? { ...baseSource, homeRoster: previous.homeRoster, awayRoster: previous.awayRoster }
    : baseSource;
  const pending = [...(existing?.pending ?? []), op];
  const view = replayBook(base, pending);
  writeBook(gameId, { base, pending });
  return view;
}

export function dropLastPending(gameId: number): StoredBook | null {
  const book = readBook(gameId);
  if (!book || book.pending.length === 0) return book;
  const next = { base: book.base, pending: book.pending.slice(0, -1) };
  writeBook(gameId, next);
  return next;
}

export function shiftPending(gameId: number): StoredBook | null {
  const book = readBook(gameId);
  if (!book || book.pending.length === 0) return book;
  const [sent, ...rest] = book.pending;
  const folded = replayBook(book.base, [sent]);
  const next = {
    base: {
      game: folded.game,
      events: folded.events,
      homeLineup: folded.homeLineup,
      awayLineup: folded.awayLineup,
      homeRoster: folded.homeRoster,
      awayRoster: folded.awayRoster,
    },
    pending: rest,
  };
  writeBook(gameId, next);
  return next;
}

export function newOpId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function lastActiveEventNumber(events: BookEvent[]): number | null {
  const last = [...events].reverse().find((e) => !e.isDeleted);
  return last ? last.eventNumber : null;
}

export function nextRedoEventNumber(events: BookEvent[]): number | null {
  return redoTarget(events)?.eventNumber ?? null;
}

export function discardBook(gameId: number) {
  memory.delete(gameId);
  if (!canStore()) return;
  try {
    localStorage.removeItem(storageKey(gameId));
  } catch {
    /* The in-memory copy is already gone. */
  }
}

/** Refresh names on a book that already has unsent plays, without dropping those plays. */
export function patchBookRosters(gameId: number, homeRoster: BookPlayer[], awayRoster: BookPlayer[]) {
  const book = readBook(gameId);
  if (!book || book.pending.length === 0) return;
  if (homeRoster.length + awayRoster.length === 0) return;
  writeBook(gameId, { ...book, base: { ...book.base, homeRoster, awayRoster } });
}

let scoringGate: Promise<void> = Promise.resolve();

/** One upload at a time. A timer and a button can both try to send the same play. */
export function withScoringLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = scoringGate.then(fn, fn);
  scoringGate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
