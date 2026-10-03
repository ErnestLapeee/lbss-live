import assert from 'node:assert/strict';
import test from 'node:test';
import { discardBook, enqueueOp, replayBook, shiftPending, type ScoringSnapshot } from './src/lib/scoring-book.ts';

function base(): ScoringSnapshot {
  return {
    game: { homeTeamId: 1, awayTeamId: 2 },
    events: [],
    homeLineup: [],
    awayLineup: [
      {
        id: 1,
        playerId: 10,
        teamId: 2,
        battingOrder: 1,
        position: 1,
        isActive: true,
        firstName: 'Pat',
        lastName: 'Pitcher',
      },
      {
        id: 2,
        playerId: 11,
        teamId: 2,
        battingOrder: 2,
        position: 2,
        isActive: true,
        firstName: 'Out',
        lastName: 'Going',
      },
    ],
    homeRoster: [],
    awayRoster: [
      { playerId: 11, teamId: 2, firstName: 'Out', lastName: 'Going' },
      { playerId: 12, teamId: 2, firstName: 'In', lastName: 'Coming', bats: 'S', jerseyNumber: '7' },
    ],
  };
}

test('a saved pitch updates the count on the phone', () => {
  const view = replayBook(base(), [
    { id: 'pitch-1', kind: 'event', body: { eventType: 'pitch', eventDetail: 'ball', half: 'top', inning: 1 } },
  ]);
  assert.equal(view.state.balls, 1);
  assert.equal(view.state.strikes, 0);
  assert.equal(view.pending, 1);
});

test('undo removes the last saved play', () => {
  const view = replayBook(base(), [
    { id: 'pitch-1', kind: 'event', body: { eventType: 'pitch', eventDetail: 'ball', half: 'top', inning: 1 } },
    { id: 'undo-1', kind: 'undo', targetEventNumber: 1 },
  ]);
  assert.equal(view.state.balls, 0);
  assert.equal(view.events[0]?.isDeleted, true);
});

test('a substitution parks the outgoing player and brings in the roster player', () => {
  const view = replayBook(base(), [
    {
      id: 'sub-1',
      kind: 'substitute',
      body: { outPlayerId: 11, inPlayerId: 12, teamId: 2, position: 2, inning: 1, half: 'top', subKind: 'defensive' },
    },
  ]);
  const incoming = view.awayLineup.find((row) => row.isActive && row.playerId === 12);
  const outgoing = view.awayLineup.find((row) => row.playerId === 11);
  assert.equal(incoming?.lastName, 'Coming');
  assert.equal(incoming?.bats, 'S');
  assert.equal(incoming?.jerseyNumber, '7');
  assert.equal(outgoing?.isActive, false);
  assert.equal(view.events.at(-1)?.eventType, 'substitution');
});

test('a play that already uploaded stays in the book when a later one is still waiting', () => {
  discardBook(100);
  enqueueOp(100, base(), {
    id: 'pitch-1',
    kind: 'event',
    body: { eventType: 'pitch', eventDetail: 'ball', half: 'top', inning: 1 },
  });
  enqueueOp(100, base(), {
    id: 'pitch-2',
    kind: 'event',
    body: { eventType: 'pitch', eventDetail: 'strike', half: 'top', inning: 1 },
  });
  const next = shiftPending(100);
  assert.equal(next?.pending.length, 1);
  assert.equal(next?.base.events.filter((event) => !event.isDeleted).length, 1);
  const view = replayBook(next!.base, next!.pending);
  assert.equal(view.state.balls, 1);
  assert.equal(view.state.strikes, 1);
  discardBook(100);
});

test('queued plays stay in order until they are sent', () => {
  discardBook(99);
  const first = enqueueOp(99, base(), {
    id: 'pitch-1',
    kind: 'event',
    body: { eventType: 'pitch', eventDetail: 'strike', half: 'top', inning: 1 },
  });
  assert.equal(first.state.strikes, 1);
  const second = enqueueOp(99, base(), { id: 'undo-1', kind: 'undo', targetEventNumber: 1 });
  assert.equal(second.state.strikes, 0);
  assert.equal(second.pending, 2);
  discardBook(99);
});
