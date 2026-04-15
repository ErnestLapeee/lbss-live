import { describe, it, expect } from 'vitest';
import { formatPlayByPlay, basesToken, type PlayInput } from './format-play';

function make(overrides: Partial<PlayInput>): PlayInput {
  return {
    eventType: 'ground_out',
    batterName: 'Gordon Hahn',
    pitcherName: 'Dainis Svikis',
    fieldingSequence: null,
    rbi: 0,
    runsScored: 0,
    outsRecorded: 0,
    runnersScoredNames: [],
    runnerFirstId: null,
    runnerSecondId: null,
    runnerThirdId: null,
    ...overrides,
  };
}

// ── basesToken helper ──────────────────────────────────────────────
describe('basesToken', () => {
  it('returns — for empty bases', () => {
    expect(basesToken(null, null, null)).toBe('—');
  });
  it('returns 1st & 3rd', () => {
    expect(basesToken(1, null, 3)).toBe('1st & 3rd');
  });
  it('returns Bases loaded', () => {
    expect(basesToken(1, 2, 3)).toBe('Bases loaded');
  });
  it('returns 2nd for runner on second', () => {
    expect(basesToken(null, 5, null)).toBe('2nd');
  });
});

// ── Walk scenarios ─────────────────────────────────────────────────
describe('Walk', () => {
  it('bases-empty walk', () => {
    const result = formatPlayByPlay(make({
      eventType: 'walk',
      batterName: 'Ernests Lapins',
      runnerFirstId: 10,
    }));
    expect(result.title).toBe('Ernests Lapins walks');
  });

  it('walk with runner advancing', () => {
    const result = formatPlayByPlay(make({
      eventType: 'walk',
      batterName: 'Ernests Lapins',
      runnerFirstId: 10,
      runnerSecondId: 20,
    }));
    expect(result.title).toBe('Ernests Lapins walks');
  });

  it('walk forcing in a run (bases loaded)', () => {
    const result = formatPlayByPlay(make({
      eventType: 'walk',
      batterName: 'Ernests Lapins',
      runsScored: 1,
      rbi: 1,
      runnersScoredNames: ['Roberts Lipsbergs'],
      runnerFirstId: 10,
      runnerSecondId: 20,
      runnerThirdId: 30,
    }));
    expect(result.title).toContain('forces in a run');
    expect(result.title).toContain('Roberts Lipsbergs scores');
  });

  it('intentional walk', () => {
    const result = formatPlayByPlay(make({
      eventType: 'intentional_walk',
      batterName: 'Gordon Hahn',
      runnerFirstId: 10,
    }));
    expect(result.title).toBe('Gordon Hahn intentionally walked');
  });
});

// ── HBP ────────────────────────────────────────────────────────────
describe('Hit by Pitch', () => {
  it('simple HBP', () => {
    const result = formatPlayByPlay(make({
      eventType: 'hit_by_pitch',
      batterName: 'Kiril Grickevics',
      runnerFirstId: 10,
    }));
    expect(result.title).toBe('Kiril Grickevics hit by pitch');
  });

  it('HBP forcing in a run', () => {
    const result = formatPlayByPlay(make({
      eventType: 'hit_by_pitch',
      batterName: 'Kiril Grickevics',
      runsScored: 1,
      rbi: 1,
      runnersScoredNames: ['Dainis Svikis'],
    }));
    expect(result.title).toContain('forces in a run');
    expect(result.title).toContain('Dainis Svikis scores');
  });
});

// ── Hits ───────────────────────────────────────────────────────────
describe('Hits', () => {
  it('single with runner scoring', () => {
    const result = formatPlayByPlay(make({
      eventType: 'single',
      batterName: 'Gordon Hahn',
      rbi: 1,
      runsScored: 1,
      runnersScoredNames: ['Ernests Lapins'],
      runnerFirstId: 10,
    }));
    expect(result.title).toBe('Gordon Hahn singles. Ernests Lapins scores');
  });

  it('double with nobody on', () => {
    const result = formatPlayByPlay(make({
      eventType: 'double',
      batterName: 'Roberts Lipsbergs',
      runnerSecondId: 5,
    }));
    expect(result.title).toBe('Roberts Lipsbergs doubles');
  });

  it('home run solo', () => {
    const result = formatPlayByPlay(make({
      eventType: 'home_run',
      batterName: 'Bruno Lipsbergs',
      runsScored: 1,
      rbi: 1,
      runnersScoredNames: [],
    }));
    expect(result.title).toBe('Bruno Lipsbergs homers');
  });

  it('grand slam', () => {
    const result = formatPlayByPlay(make({
      eventType: 'home_run',
      batterName: 'Gordon Hahn',
      runsScored: 4,
      rbi: 4,
      runnersScoredNames: ['Ernests Lapins', 'Dainis Svikis', 'Roberts Lipsbergs'],
    }));
    expect(result.title).toContain('grand slam');
  });

  it('two-run homer', () => {
    const result = formatPlayByPlay(make({
      eventType: 'home_run',
      batterName: 'Kiril Grickevics',
      runsScored: 2,
      rbi: 2,
      runnersScoredNames: ['Ernests Lapins'],
    }));
    expect(result.title).toContain('homers');
    expect(result.title).toContain('Ernests Lapins scores');
  });

  it('triple with two scoring', () => {
    const result = formatPlayByPlay(make({
      eventType: 'triple',
      batterName: 'Dainis Svikis',
      runsScored: 2,
      rbi: 2,
      runnersScoredNames: ['Ernests Lapins', 'Roberts Lipsbergs'],
    }));
    expect(result.title).toContain('triples');
    expect(result.title).toContain('Ernests Lapins and Roberts Lipsbergs score');
  });
});

// ── Strikeouts ─────────────────────────────────────────────────────
describe('Strikeouts', () => {
  it('strikeout looking', () => {
    const result = formatPlayByPlay(make({
      eventType: 'strikeout_looking',
      batterName: 'Ernests Lapins',
      outsRecorded: 1,
    }), { outsBefore: 0, outsAfter: 1 });
    expect(result.title).toBe('Ernests Lapins called out on strikes');
    expect(result.chips).toContain('1 out');
  });

  it('strikeout swinging', () => {
    const result = formatPlayByPlay(make({
      eventType: 'strikeout_swinging',
      batterName: 'Gordon Hahn',
      outsRecorded: 1,
    }));
    expect(result.title).toBe('Gordon Hahn strikes out swinging');
  });

  it('automatic out (empty lineup slot)', () => {
    const result = formatPlayByPlay(make({
      eventType: 'strikeout',
      batterName: null,
      eventDetail: 'automatic_out_empty_slot',
      outsRecorded: 1,
    }));
    expect(result.title).toBe('Automatic out (empty lineup slot)');
  });
});

// ── Outs in play ───────────────────────────────────────────────────
describe('Outs in play', () => {
  it('groundout with fielding sequence', () => {
    const result = formatPlayByPlay(make({
      eventType: 'ground_out',
      batterName: 'Gordon Hahn',
      fieldingSequence: '4-3',
      outsRecorded: 1,
    }));
    expect(result.title).toBe('Gordon Hahn grounds out (4–3)');
  });

  it('flyout', () => {
    const result = formatPlayByPlay(make({
      eventType: 'fly_out',
      batterName: 'Bruno Lipsbergs',
      fieldingSequence: '8',
      outsRecorded: 1,
    }));
    expect(result.title).toBe('Bruno Lipsbergs flies out (8)');
  });

  it('double play', () => {
    const result = formatPlayByPlay(make({
      eventType: 'double_play',
      batterName: 'Dainis Svikis',
      fieldingSequence: '6-4-3',
      outsRecorded: 2,
    }), { outsAfter: 3 });
    expect(result.title).toContain('double play');
    expect(result.title).toContain('6–4–3');
    expect(result.chips).toContain('3 outs');
  });
});

// ── Sacrifice fly ──────────────────────────────────────────────────
describe('Sacrifice fly', () => {
  it('sac fly scoring a run', () => {
    const result = formatPlayByPlay(make({
      eventType: 'sacrifice_fly',
      batterName: 'Edgars Pogozelskis',
      fieldingSequence: '9',
      rbi: 1,
      runsScored: 1,
      outsRecorded: 1,
      runnersScoredNames: ['Ernests Lapins'],
    }));
    expect(result.title).toContain('sacrifice fly');
    expect(result.title).toContain('Ernests Lapins scores');
  });
});

// ── Error ──────────────────────────────────────────────────────────
describe('Error', () => {
  it('reaches on error by position', () => {
    const result = formatPlayByPlay(make({
      eventType: 'error',
      batterName: 'Roberts Lipsbergs',
      fieldingSequence: 'E6',
    }));
    expect(result.title).toContain('reaches on error by SS');
  });

  it('error with runner scoring', () => {
    const result = formatPlayByPlay(make({
      eventType: 'error',
      batterName: 'Roberts Lipsbergs',
      fieldingSequence: 'E3',
      runsScored: 1,
      runnersScoredNames: ['Dainis Svikis'],
    }));
    expect(result.title).toContain('error by 1B');
    expect(result.title).toContain('Dainis Svikis scores');
  });
});

// ── Runner events ──────────────────────────────────────────────────
describe('Runner events', () => {
  it('stolen base', () => {
    const result = formatPlayByPlay(make({
      eventType: 'stolen_base',
      batterName: 'Ernests Lapins',
    }));
    expect(result.title).toBe('Ernests Lapins steals a base');
  });

  it('caught stealing', () => {
    const result = formatPlayByPlay(make({
      eventType: 'caught_stealing',
      batterName: 'Gordon Hahn',
      fieldingSequence: '2-6',
      outsRecorded: 1,
    }));
    expect(result.title).toBe('Gordon Hahn caught stealing (2–6)');
  });

  it('wild pitch with run scoring', () => {
    const result = formatPlayByPlay(make({
      eventType: 'wild_pitch',
      batterName: 'Kiril Grickevics',
      runsScored: 1,
      runnersScoredNames: ['Dainis Svikis'],
    }));
    expect(result.title).toContain('Wild pitch');
    expect(result.title).toContain('Dainis Svikis scores');
  });

  it('picked off', () => {
    const result = formatPlayByPlay(make({
      eventType: 'picked_off',
      batterName: 'Bruno Lipsbergs',
      fieldingSequence: '1-3',
      outsRecorded: 1,
    }));
    expect(result.title).toBe('Bruno Lipsbergs picked off (1–3)');
  });
});

// ── Subtitle / chips ───────────────────────────────────────────────
describe('Subtitle and chips', () => {
  it('includes pitcher name and bases state', () => {
    const result = formatPlayByPlay(make({
      eventType: 'single',
      batterName: 'Gordon Hahn',
      pitcherName: 'Dainis Svikis',
      runnerFirstId: 10,
      runnerThirdId: 30,
    }), { outsAfter: 1 });
    expect(result.subtitle).toContain('P: Dainis Svikis');
    expect(result.subtitle).toContain('1 out');
    expect(result.subtitle).toContain('1st & 3rd');
    expect(result.chips).toContain('1st & 3rd');
  });

  it('shows bases loaded chip', () => {
    const result = formatPlayByPlay(make({
      eventType: 'walk',
      batterName: 'Ernests Lapins',
      runnerFirstId: 10,
      runnerSecondId: 20,
      runnerThirdId: 30,
    }));
    expect(result.chips).toContain('Bases loaded');
  });
});

// ── Fielder's choice ───────────────────────────────────────────────
describe("Fielder's choice", () => {
  it('FC with run scoring', () => {
    const result = formatPlayByPlay(make({
      eventType: 'fielders_choice',
      batterName: 'Edgars Pogozelskis',
      fieldingSequence: '6-4',
      rbi: 1,
      runsScored: 1,
      runnersScoredNames: ['Roberts Lipsbergs'],
    }));
    expect(result.title).toContain("fielder's choice");
    expect(result.title).toContain('Roberts Lipsbergs scores');
  });
});
