import assert from 'node:assert/strict';
import test from 'node:test';
import { playoffColumnsForSeasonKind } from './season-kind-playoffs.js';
import { mergeManualAccolades, type PlayerAccolade } from './honor-merge.js';

test('a regular season keeps the playoff setup that was sent', () => {
  const patch = playoffColumnsForSeasonKind('regular', true, {
    hasPlayoffs: true,
    regularSeasonGamesPerTeam: 12,
    playoffSettings: { seeds: 4, bestOf: 3, thirdPlace: true },
  });
  assert.equal(patch.hasPlayoffs, true);
  assert.equal(patch.regularSeasonGamesPerTeam, 12);
  assert.deepEqual(patch.playoffSettings, { seeds: 4, bestOf: 3, thirdPlace: true });
});

test('omitted playoff fields are not wiped', () => {
  const patch = playoffColumnsForSeasonKind('regular', true, {});
  assert.deepEqual(patch, {});
});

test('manual honors are added and a duplicate finish is kept once', () => {
  const computed: PlayerAccolade[] = [
    { seasonYear: 2025, seasonName: 'LBL 2025', teamName: 'Sigulda', honor: 'champion' },
  ];
  const manual: PlayerAccolade[] = [
    { seasonYear: 2025, seasonName: '2025', teamName: '', honor: 'champion' },
    { seasonYear: 2026, seasonName: '2026', teamName: '', honor: 'custom', label: 'MVP' },
  ];
  const merged = mergeManualAccolades(computed, manual);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.honor, 'custom');
  assert.equal(merged[0]?.label, 'MVP');
  assert.equal(merged[1]?.honor, 'champion');
});
