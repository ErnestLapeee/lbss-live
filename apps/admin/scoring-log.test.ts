import assert from 'node:assert/strict';
import test from 'node:test';
import { groupScoringLog, pitchMark, type LogEvent } from './src/lib/scoring-log.ts';

function evt(partial: Partial<LogEvent> & Pick<LogEvent, 'id' | 'eventNumber' | 'eventType'>): LogEvent {
  return {
    inning: 1,
    half: 'top',
    runsScored: 0,
    ...partial,
  };
}

test('pitches and the result are one plate appearance', () => {
  const groups = groupScoringLog([
    evt({ id: 1, eventNumber: 1, eventType: 'pitch', eventDetail: 'ball', batterId: 12 }),
    evt({ id: 2, eventNumber: 2, eventType: 'pitch', eventDetail: 'strike', batterId: 12 }),
    evt({ id: 3, eventNumber: 3, eventType: 'pitch', eventDetail: 'foul', batterId: 12 }),
    evt({ id: 4, eventNumber: 4, eventType: 'walk', eventDetail: 'Walk', batterId: 12 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'pa');
  if (groups[0].kind !== 'pa') return;
  assert.deepEqual(groups[0].pitches.map((p) => pitchMark(p.eventDetail)), ['B', 'S', 'F']);
  assert.equal(groups[0].result?.eventType, 'walk');
  assert.equal(groups[0].batterId, 12);
});

test('a stolen base during the count stays on that plate appearance', () => {
  const groups = groupScoringLog([
    evt({ id: 1, eventNumber: 1, eventType: 'pitch', eventDetail: 'ball', batterId: 12 }),
    evt({ id: 2, eventNumber: 2, eventType: 'stolen_base', eventDetail: 'Stolen base', batterId: 4 }),
    evt({ id: 3, eventNumber: 3, eventType: 'single', eventDetail: 'Single', batterId: 12, runsScored: 1 }),
  ]);
  assert.equal(groups.length, 1);
  if (groups[0].kind !== 'pa') return;
  assert.equal(groups[0].notes[0]?.eventType, 'stolen_base');
  assert.equal(groups[0].awayBefore, 0);
});

test('a substitution is its own row and the next half starts from the new score', () => {
  const groups = groupScoringLog([
    evt({ id: 1, eventNumber: 1, eventType: 'single', eventDetail: 'Single', batterId: 12, runsScored: 1, half: 'top', inning: 1 }),
    evt({ id: 2, eventNumber: 2, eventType: 'substitution', eventDetail: 'Pitching change', half: 'top', inning: 1 }),
    evt({ id: 3, eventNumber: 3, eventType: 'ground_out', eventDetail: 'Ground out', batterId: 8, half: 'bot', inning: 1 }),
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups[1].kind, 'note');
  assert.equal(groups[2].kind, 'pa');
  if (groups[2].kind !== 'pa') return;
  assert.equal(groups[2].awayBefore, 1);
  assert.equal(groups[2].homeBefore, 0);
  assert.equal(groups[2].half, 'bot');
});

test('a pitching change during the count stays with that at-bat', () => {
  const groups = groupScoringLog([
    evt({ id: 1, eventNumber: 1, eventType: 'pitch', eventDetail: 'strike', batterId: 25 }),
    evt({ id: 2, eventNumber: 2, eventType: 'pitch', eventDetail: 'foul', batterId: 25 }),
    evt({ id: 3, eventNumber: 3, eventType: 'substitution', eventDetail: '{}' }),
    evt({ id: 4, eventNumber: 4, eventType: 'strikeout_swinging', eventDetail: 'K', batterId: 25 }),
  ]);
  assert.equal(groups.length, 1);
  if (groups[0].kind !== 'pa') return;
  assert.equal(groups[0].pitches.length, 2);
  assert.equal(groups[0].notes[0]?.eventType, 'substitution');
  assert.equal(groups[0].result?.eventType, 'strikeout_swinging');
});

test('a runner advance after the result stays on that plate appearance', () => {
  const groups = groupScoringLog([
    evt({ id: 1, eventNumber: 1, eventType: 'single', eventDetail: 'Single', batterId: 33 }),
    evt({ id: 2, eventNumber: 2, eventType: 'advance', eventDetail: 'advance to second', batterId: 33 }),
    evt({ id: 3, eventNumber: 3, eventType: 'fly_out', eventDetail: 'Fly out', batterId: 42 }),
  ]);
  assert.equal(groups.length, 2);
  if (groups[0].kind !== 'pa') return;
  assert.equal(groups[0].notes[0]?.eventType, 'advance');
  assert.equal(groups[1].kind, 'pa');
});
