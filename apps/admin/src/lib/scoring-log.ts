/** Events that do not end a plate appearance. Keep this aligned with the scorer's batter cursor. */
export const SCORER_NON_AB_EVENTS = new Set([
  'pitch', 'stolen_base', 'caught_stealing', 'picked_off', 'wild_pitch', 'passed_ball',
  'balk', 'advance', 'advance_on_error', 'defensive_indifference',
  'runner_interference', 'appeal_play', 'tagged_out', 'force_out',
  'hit_by_ball', 'missed_base', 'left_base_early', 'left_base_path',
  'offensive_interference', 'passed_runner', 'hesitation',
  'end_half_inning', 'adjust_score', 'illegal_pitch', 'substitution',
  'place_runner_second',
]);

const HALF_BREAK_EVENTS = new Set([
  'end_half_inning', 'adjust_score', 'place_runner_second',
]);

export type LogEvent = {
  id: number;
  eventNumber: number;
  eventType: string;
  eventDetail?: string | null;
  inning: number;
  half: string;
  batterId?: number | null;
  runsScored?: number | null;
  rbi?: number | null;
  outsRecorded?: number | null;
};

export type LogPlate = {
  kind: 'pa';
  id: string;
  inning: number;
  half: string;
  batterId: number | null;
  pitches: LogEvent[];
  notes: LogEvent[];
  result: LogEvent | null;
  awayBefore: number;
  homeBefore: number;
};

export type LogNote = {
  kind: 'note';
  id: string;
  event: LogEvent;
  inning: number;
  half: string;
  awayBefore: number;
  homeBefore: number;
};

export type LogGroup = LogPlate | LogNote;

export function normalizeLogHalf(half: string | null | undefined): 'top' | 'bot' {
  const h = String(half ?? '').toLowerCase();
  return h === 'bottom' || h === 'bot' ? 'bot' : 'top';
}

export function pitchMark(detail: string | null | undefined): 'B' | 'S' | 'F' | 'P' {
  const d = String(detail ?? '').toLowerCase();
  if (d === 'ball') return 'B';
  if (d === 'foul' || d.includes('foul')) return 'F';
  if (d === 'strike' || d === 'called_strike' || d === 'swinging_strike' || d.includes('strike')) return 'S';
  return 'P';
}

export function pitchLabel(detail: string | null | undefined): string {
  const mark = pitchMark(detail);
  if (mark === 'B') return 'Ball';
  if (mark === 'S') return 'Strike';
  if (mark === 'F') return 'Foul';
  return String(detail || 'Pitch').replace(/_/g, ' ');
}

function isResult(eventType: string): boolean {
  return !SCORER_NON_AB_EVENTS.has(eventType);
}

type OpenPlate = {
  inning: number;
  half: string;
  batterId: number | null;
  pitches: LogEvent[];
  notes: LogEvent[];
  awayBefore: number;
  homeBefore: number;
};

export function groupScoringLog(events: LogEvent[]): LogGroup[] {
  const groups: LogGroup[] = [];
  let away = 0;
  let home = 0;
  let open: OpenPlate | null = null;

  const scoreNow = () => ({ awayBefore: away, homeBefore: home });

  const pushPlate = (plate: OpenPlate, result: LogEvent | null) => {
    if (plate.pitches.length === 0 && plate.notes.length === 0 && !result) return;
    groups.push({
      kind: 'pa',
      id: `pa-${result?.id ?? plate.pitches[0]?.id ?? plate.notes[0]?.id ?? groups.length}`,
      inning: plate.inning,
      half: plate.half,
      batterId: result?.batterId ?? plate.batterId,
      pitches: plate.pitches,
      notes: plate.notes,
      result,
      awayBefore: plate.awayBefore,
      homeBefore: plate.homeBefore,
    });
  };

  const flushOpen = () => {
    if (!open) return;
    pushPlate(open, null);
    open = null;
  };

  const sameHalf = (evt: LogEvent, inning: number, half: string) =>
    evt.inning === inning && normalizeLogHalf(evt.half) === normalizeLogHalf(half);

  const pushStandalone = (evt: LogEvent) => {
    groups.push({
      kind: 'note',
      id: `note-${evt.id}`,
      event: evt,
      inning: evt.inning,
      half: evt.half,
      ...scoreNow(),
    });
  };

  const applyRuns = (evt: LogEvent) => {
    const runs = Number(evt.runsScored) || 0;
    if (!runs) return;
    if (normalizeLogHalf(evt.half) === 'top') away += runs;
    else home += runs;
  };

  for (const evt of events) {
    if (open && (open.inning !== evt.inning || normalizeLogHalf(open.half) !== normalizeLogHalf(evt.half))) {
      flushOpen();
    }

    if (evt.eventType === 'pitch') {
      if (open && open.batterId != null && evt.batterId != null && open.batterId !== evt.batterId) flushOpen();
      if (!open) {
        open = {
          inning: evt.inning,
          half: evt.half,
          batterId: evt.batterId ?? null,
          pitches: [],
          notes: [],
          ...scoreNow(),
        };
      }
      if (open.batterId == null && evt.batterId != null) open.batterId = evt.batterId;
      open.pitches.push(evt);
      applyRuns(evt);
      continue;
    }

    if (HALF_BREAK_EVENTS.has(evt.eventType)) {
      flushOpen();
      pushStandalone(evt);
      applyRuns(evt);
      continue;
    }

    if (evt.eventType === 'substitution') {
      if (open) open.notes.push(evt);
      else pushStandalone(evt);
      applyRuns(evt);
      continue;
    }

    if (isResult(evt.eventType)) {
      if (open && open.batterId != null && evt.batterId != null && open.batterId !== evt.batterId) flushOpen();
      if (!open) {
        open = {
          inning: evt.inning,
          half: evt.half,
          batterId: evt.batterId ?? null,
          pitches: [],
          notes: [],
          ...scoreNow(),
        };
      }
      pushPlate(open, evt);
      open = null;
      applyRuns(evt);
      continue;
    }

    if (open) open.notes.push(evt);
    else {
      const last = groups[groups.length - 1];
      if (last?.kind === 'pa' && sameHalf(evt, last.inning, last.half)) last.notes.push(evt);
      else pushStandalone(evt);
    }
    applyRuns(evt);
  }

  flushOpen();
  return groups;
}
