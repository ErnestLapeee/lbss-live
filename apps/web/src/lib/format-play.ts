/**
 * formatPlayByPlay — Pure function that converts a raw game event into
 * human-readable scorebook text following baseball conventions.
 *
 * Returns { title, subtitle, chips } where:
 *   title    — Main play description (one line)
 *   subtitle — Matchup + state line
 *   chips    — Small tags like "Bases loaded", "2 outs"
 */

// ── Position number → short label ──────────────────────────────────
const POS: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH',
};

function posLabel(n: number): string {
  return POS[n] || `#${n}`;
}

// ── Display name: use full name as-is ──────────────────────────────
function lastName(full: string | null | undefined): string {
  if (!full) return 'Unknown';
  return full.trim();
}

// ── Fielding sequence to human text: "4-3" → "4–3", "E6" → "E6" ──
function formatFS(fs: string | null | undefined): string {
  if (!fs) return '';
  return fs.replace(/-/g, '–');
}

// ── Base state to short token ──────────────────────────────────────
export function basesToken(
  first: boolean | number | string | null,
  second: boolean | number | string | null,
  third: boolean | number | string | null,
): string {
  const f = !!first, s = !!second, t = !!third;
  if (f && s && t) return 'Bases loaded';
  const parts: string[] = [];
  if (f) parts.push('1st');
  if (s) parts.push('2nd');
  if (t) parts.push('3rd');
  if (parts.length === 0) return '—';
  return parts.join(' & ');
}

// ── Types ──────────────────────────────────────────────────────────
export interface PlayInput {
  eventType: string;
  batterName: string | null;
  pitcherName: string | null;
  fieldingSequence: string | null;
  rbi: number;
  runsScored: number;
  outsRecorded: number;
  runnersScoredNames: string[];
  runnerFirstName?: string | null;
  runnerSecondName?: string | null;
  runnerThirdName?: string | null;
  runnerFirstId?: number | null;
  runnerSecondId?: number | null;
  runnerThirdId?: number | null;
  errorFielderIds?: number[];
  eventDetail?: string | null;
  balls?: number;
  strikes?: number;
}

export interface PlayOutput {
  title: string;
  subtitle: string;
  chips: string[];
}

// ── Categorization sets ────────────────────────────────────────────
const HIT_TYPES = new Set([
  'single', 'bunt_single', 'double', 'triple',
  'home_run', 'inside_park_hr', 'ground_rule_double',
]);

const OUT_TYPES = new Set([
  'ground_out', 'fly_out', 'line_out', 'pop_out',
  'bunt_out', 'foul_out', 'infield_fly',
]);

const STRIKEOUT_TYPES = new Set([
  'strikeout', 'strikeout_swinging', 'strikeout_looking',
  'caught_foul_tip', 'bunt_foul',
  'dropped_third_strike_out',
]);

const MISC_OUT_TYPES = new Set([
  'hit_by_batted_ball', 'runner_interference_batter', 'offensive_interference_batter',
  'batting_out_of_turn', 'fan_interference', 'thrown_bat', 'out_of_box',
  'left_base_path_batter', 'other_out',
]);

const WALK_TYPES = new Set(['walk', 'intentional_walk']);

const ERROR_TYPES = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

const RUNNER_TYPES = new Set([
  'stolen_base', 'caught_stealing', 'picked_off',
  'wild_pitch', 'passed_ball', 'balk',
  'advance', 'advance_on_error', 'defensive_indifference',
  'tagged_out', 'force_out',
]);

// ── Verbs for out types ────────────────────────────────────────────
const OUT_VERBS: Record<string, string> = {
  ground_out: 'grounds out',
  fly_out: 'flies out',
  line_out: 'lines out',
  pop_out: 'pops out',
  bunt_out: 'bunts out',
  foul_out: 'fouls out',
  infield_fly: 'infield fly',
};

// ── Hit verbs ──────────────────────────────────────────────────────
const HIT_VERBS: Record<string, string> = {
  single: 'singles',
  bunt_single: 'bunts for a single',
  double: 'doubles',
  triple: 'triples',
  home_run: 'homers',
  inside_park_hr: 'hits an inside-the-park home run',
  ground_rule_double: 'hits a ground-rule double',
};

// ── Helpers ────────────────────────────────────────────────────────
function scoredPhrase(names: string[]): string {
  if (names.length === 0) return '';
  const lasts = names.map(n => lastName(n));
  if (lasts.length === 1) return `${lasts[0]} scores`;
  if (lasts.length === 2) return `${lasts[0]} and ${lasts[1]} score`;
  return lasts.slice(0, -1).join(', ') + ` and ${lasts[lasts.length - 1]} score`;
}

function outsPhrase(n: number, cumulative?: number): string {
  if (cumulative !== undefined && cumulative > 0) {
    return cumulative === 1 ? '1 out' : `${cumulative} outs`;
  }
  if (n === 0) return '';
  return n === 1 ? '1 out' : `${n} outs`;
}

function fsPhrase(fs: string | null | undefined): string {
  if (!fs) return '';
  return ` (${formatFS(fs)})`;
}

// ── The formatter ──────────────────────────────────────────────────
export function formatPlayByPlay(
  play: PlayInput,
  context?: { outsBefore?: number; outsAfter?: number },
): PlayOutput {
  const batter = lastName(play.batterName);
  const pitcher = lastName(play.pitcherName);
  const fs = play.fieldingSequence;
  const scored = play.runnersScoredNames || [];
  const rbi = play.rbi || 0;
  const outs = play.outsRecorded || 0;
  const outsAfter = context?.outsAfter;

  let title = '';
  const chips: string[] = [];

  // ── Base state after play (from runner IDs on event) ──
  const basesAfter = basesToken(
    (play.runnerFirstId ?? play.runnerFirstName) ?? null,
    (play.runnerSecondId ?? play.runnerSecondName) ?? null,
    (play.runnerThirdId ?? play.runnerThirdName) ?? null,
  );

  // ═══ WALKS ═══
  if (WALK_TYPES.has(play.eventType)) {
    const isIBB = play.eventType === 'intentional_walk';
    const prefix = isIBB ? `${batter} intentionally walked` : `${batter} walks`;

    if (scored.length > 0) {
      title = `${prefix}, forces in a run. ${scoredPhrase(scored)}`;
    } else if (basesAfter === 'Bases loaded') {
      title = `${prefix}, bases loaded`;
    } else {
      title = prefix;
    }
  }

  // ═══ HIT BY PITCH ═══
  else if (play.eventType === 'hit_by_pitch') {
    if (scored.length > 0) {
      title = `${batter} hit by pitch, forces in a run. ${scoredPhrase(scored)}`;
    } else {
      title = `${batter} hit by pitch`;
    }
  }

  // ═══ HITS ═══
  else if (HIT_TYPES.has(play.eventType)) {
    const verb = HIT_VERBS[play.eventType] || 'hits';

    if (play.eventType === 'home_run' || play.eventType === 'inside_park_hr') {
      const total = (play.runsScored || 0);
      if (total >= 4) {
        title = `${batter} hits a grand slam!`;
      } else if (total >= 2) {
        title = scored.length > 0
          ? `${batter} ${verb}. ${scoredPhrase(scored)}`
          : `${batter} ${verb}, ${total}-run homer`;
      } else {
        title = `${batter} ${verb}`;
      }
    } else {
      const parts: string[] = [`${batter} ${verb}`];
      if (scored.length > 0) {
        parts.push(scoredPhrase(scored));
      }
      title = parts.join('. ');
    }
  }

  // ═══ STRIKEOUTS ═══
  else if (STRIKEOUT_TYPES.has(play.eventType)) {
    if (play.eventType === 'strikeout_looking') {
      title = `${batter} called out on strikes`;
    } else if (play.eventType === 'strikeout_swinging' || play.eventType === 'strikeout') {
      title = `${batter} strikes out swinging`;
    } else if (play.eventType === 'caught_foul_tip') {
      title = `${batter} strikes out on a foul tip`;
    } else if (play.eventType === 'bunt_foul') {
      title = `${batter} strikes out on a foul bunt`;
    } else if (play.eventType === 'dropped_third_strike_out') {
      title = `${batter} out on dropped third strike${fsPhrase(fs)}`;
    } else {
      title = `${batter} strikes out`;
    }
  }

  // ═══ DROPPED 3RD STRIKE (safe) ═══
  else if (play.eventType === 'dropped_third_strike' || play.eventType === 'wild_pitch_third_strike') {
    title = `${batter} reaches on ${play.eventType === 'wild_pitch_third_strike' ? 'wild pitch' : 'dropped'} third strike`;
  }

  // ═══ OUTS IN PLAY ═══
  else if (OUT_TYPES.has(play.eventType)) {
    const verb = OUT_VERBS[play.eventType] || 'out';
    title = `${batter} ${verb}${fsPhrase(fs)}`;
    if (scored.length > 0) {
      title += `. ${scoredPhrase(scored)}`;
    }
  }

  // ═══ SACRIFICE FLY ═══
  else if (play.eventType === 'sacrifice_fly') {
    title = `${batter} hits a sacrifice fly${fsPhrase(fs)}`;
    if (scored.length > 0) {
      title += `. ${scoredPhrase(scored)}`;
    }
  }

  // ═══ SACRIFICE BUNT ═══
  else if (play.eventType === 'sacrifice_bunt') {
    title = `${batter} lays down a sacrifice bunt${fsPhrase(fs)}`;
    if (scored.length > 0) {
      title += `. ${scoredPhrase(scored)}`;
    }
  }

  // ═══ FIELDER'S CHOICE ═══
  else if (play.eventType === 'fielders_choice') {
    title = `${batter}: fielder's choice${fsPhrase(fs)}`;
    const detail = play.eventDetail || '';
    const runnerInfo = detail.includes('. ') ? detail.substring(detail.indexOf('. ') + 2) : '';
    if (runnerInfo) {
      title += `. ${runnerInfo}`;
    } else if (scored.length > 0) {
      title += `. ${scoredPhrase(scored)}`;
    }
  }

  // ═══ DOUBLE PLAY ═══
  else if (play.eventType === 'double_play') {
    title = `${batter} grounds into double play${fsPhrase(fs)}`;
    if (scored.length > 0) {
      title += `. ${scoredPhrase(scored)}`;
    }
  }

  // ═══ TRIPLE PLAY ═══
  else if (play.eventType === 'triple_play') {
    title = `${batter} hits into triple play${fsPhrase(fs)}`;
  }

  // ═══ ERRORS ═══
  else if (ERROR_TYPES.has(play.eventType)) {
    const errFs = fs && fs.startsWith('E') ? fs.slice(1) : fs;
    const errPos = errFs ? posLabel(parseInt(errFs, 10)) : null;
    const who = errPos ? `error by ${errPos}` : 'error';

    if (play.eventType === 'sac_bunt_error') {
      title = `${batter} reaches on ${who} (sac bunt)`;
    } else if (play.eventType === 'sac_fly_error') {
      title = `${batter} reaches on ${who} (sac fly)`;
    } else {
      title = `${batter} reaches on ${who}`;
    }

    if (scored.length > 0) {
      title += `. ${scoredPhrase(scored)}`;
    }
  }

  // ═══ CATCHER'S OBSTRUCTION ═══
  else if (play.eventType === 'catcher_obstruction') {
    title = `${batter} awarded first on catcher's interference`;
    if (scored.length > 0) {
      title += `. ${scoredPhrase(scored)}`;
    }
  }

  // ═══ RUNNER EVENTS (between pitches) ═══
  else if (RUNNER_TYPES.has(play.eventType)) {
    const runner = lastName(play.batterName);
    const detail = play.eventDetail || '';

    // Extract runner movement summary from detail (format: "event: X scores, Y to 3rd")
    const movementSuffix = detail.includes(': ') ? detail.substring(detail.indexOf(': ') + 2) : '';
    const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

    const EVENT_LABELS: Record<string, string> = {
      stolen_base: 'Stolen base',
      wild_pitch: 'Wild pitch',
      passed_ball: 'Passed ball',
      balk: 'Balk',
      advance_on_error: 'Error',
      defensive_indifference: 'Defensive indifference',
    };

    const label = EVENT_LABELS[play.eventType];

    switch (play.eventType) {
      case 'stolen_base':
      case 'wild_pitch':
      case 'passed_ball':
      case 'balk':
      case 'advance_on_error':
      case 'defensive_indifference': {
        if (movementSuffix) {
          title = `${label}. ${capitalize(movementSuffix)}`;
        } else if (scored.length > 0) {
          title = `${label}. ${scoredPhrase(scored)}`;
        } else if (runner && runner !== 'Unknown') {
          title = `${label}, ${runner} advances`;
        } else {
          title = label || play.eventType.replace(/_/g, ' ');
        }
        break;
      }
      case 'caught_stealing':
        title = `${runner} caught stealing${fsPhrase(fs)}`;
        break;
      case 'picked_off':
        title = `${runner} picked off${fsPhrase(fs)}`;
        break;
      case 'tagged_out':
        title = `${runner} tagged out${fsPhrase(fs)}`;
        break;
      case 'force_out':
        title = `${runner} forced out${fsPhrase(fs)}`;
        break;
      default:
        title = movementSuffix ? `${capitalize(movementSuffix)}` : `${runner}: ${play.eventType.replace(/_/g, ' ')}`;
    }
  }

  // ═══ MISC OUTS (hit by ball, interference, etc.) ═══
  else if (MISC_OUT_TYPES.has(play.eventType)) {
    const MISC_VERBS: Record<string, string> = {
      hit_by_batted_ball: 'out, hit by batted ball',
      runner_interference_batter: 'out on runner interference',
      offensive_interference_batter: 'out on offensive interference',
      batting_out_of_turn: 'out, batting out of turn',
      fan_interference: 'out on fan interference',
      thrown_bat: 'out, thrown bat',
      out_of_box: 'out, left batter\'s box',
      left_base_path_batter: 'out, left base path',
      other_out: 'out',
    };
    title = `${batter} ${MISC_VERBS[play.eventType] || 'out'}`;
  }

  // ═══ FALLBACK ═══
  else {
    title = `${batter}: ${play.eventType.replace(/_/g, ' ')}`;
    if (scored.length > 0) {
      title += `. ${scoredPhrase(scored)}`;
    }
  }

  // ── Build subtitle ──
  const subParts: string[] = [];
  if (pitcher && pitcher !== 'Unknown') subParts.push(`P: ${pitcher}`);
  if (outsAfter !== undefined) {
    subParts.push(outsPhrase(0, outsAfter));
  } else if (outs > 0) {
    subParts.push(`${outs} out${outs > 1 ? 's' : ''} recorded`);
  }
  if (basesAfter && basesAfter !== '—') subParts.push(`Bases: ${basesAfter}`);
  const subtitle = subParts.join(' · ');

  // ── Build chips ──
  if (outsAfter !== undefined) {
    chips.push(outsAfter === 1 ? '1 out' : `${outsAfter} outs`);
  }
  if (basesAfter && basesAfter !== '—') {
    chips.push(basesAfter);
  }
  if (rbi > 0) {
    chips.push(`${rbi} RBI`);
  }

  return { title, subtitle, chips };
}
