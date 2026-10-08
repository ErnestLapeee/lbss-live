import assert from 'node:assert/strict';
import test from 'node:test';
import { annotateFinish, playoffPodium } from './finish-places.js';

const table = [
  { teamId: 1, teamName: 'SM GAJA', wins: 10, losses: 2, winPct: '0.833' },
  { teamId: 2, teamName: 'Kiili', wins: 9, losses: 3, winPct: '0.750' },
  { teamId: 3, teamName: 'Sigulda', wins: 7, losses: 5, winPct: '0.583' },
  { teamId: 4, teamName: 'Baldone', wins: 5, losses: 7, winPct: '0.417' },
];

test('a finished table gives gold, silver, and bronze to the top three', () => {
  const rows = annotateFinish(table, true);
  assert.deepEqual(
    rows.map((row) => [row.teamId, row.rank, row.place]),
    [
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, null],
    ],
  );
});

test('places wait until every game is final', () => {
  const rows = annotateFinish(table, false);
  assert.equal(rows[0]?.rank, 1);
  assert.equal(rows[0]?.place, null);
  assert.equal(rows[2]?.place, null);
});

test('a tie at the top is not a champion, and the next unique club stays third', () => {
  const rows = annotateFinish(
    [
      { teamId: 1, teamName: 'A', wins: 10, losses: 2, winPct: '0.833' },
      { teamId: 2, teamName: 'B', wins: 10, losses: 2, winPct: '0.833' },
      { teamId: 3, teamName: 'C', wins: 7, losses: 5, winPct: '0.583' },
    ],
    true,
  );
  const byId = new Map(rows.map((row) => [row.teamId, row]));
  assert.equal(byId.get(1)?.rank, 1);
  assert.equal(byId.get(1)?.place, null);
  assert.equal(byId.get(2)?.place, null);
  assert.equal(byId.get(3)?.rank, 3);
  assert.equal(byId.get(3)?.place, 3);
});

test('the playoff final names the champion and the runner-up', () => {
  const podium = playoffPodium([
    { roundNumber: 1, label: 'Semifinal', higherTeamId: 1, lowerTeamId: 4, winnerTeamId: 1 },
    { roundNumber: 1, label: 'Semifinal', higherTeamId: 2, lowerTeamId: 3, winnerTeamId: 2 },
    { roundNumber: 2, label: 'Final', higherTeamId: 1, lowerTeamId: 2, winnerTeamId: 2 },
    { roundNumber: 2, label: 'Third place', higherTeamId: 3, lowerTeamId: 4, winnerTeamId: 3 },
  ]);
  assert.equal(podium.decided, true);
  assert.equal(podium.championTeamId, 2);
  assert.equal(podium.runnerUpTeamId, 1);
  assert.equal(podium.thirdTeamId, 3);
});

test('a bracket without a final winner does not name a champion', () => {
  const podium = playoffPodium([
    { roundNumber: 1, label: 'Final', higherTeamId: 1, lowerTeamId: 2, winnerTeamId: null },
  ]);
  assert.equal(podium.hasBracket, true);
  assert.equal(podium.decided, false);
  assert.equal(podium.championTeamId, null);
});

test('no playoff series leaves the title with the standings', () => {
  const podium = playoffPodium([]);
  assert.equal(podium.hasBracket, false);
  assert.equal(podium.decided, false);
});
