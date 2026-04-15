/**
 * Public `/games/:id/events` should return a JSON array; gateways may wrap it
 * (`events`, `data`, `gameEvents`, nested objects, etc.).
 * Returns null if the body is not a recognizable event list (caller should not overwrite state).
 */
export function tryExtractEventArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return null;

  const o = data as Record<string, unknown>;
  for (const key of ['events', 'data', 'gameEvents', 'items', 'result', 'rows', 'records', 'payload']) {
    const v = o[key];
    if (Array.isArray(v)) return v;
  }

  for (const v of Object.values(o)) {
    if (Array.isArray(v) && v.length > 0 && looksLikeGameEventRow(v[0])) {
      return v;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = tryExtractEventArray(v);
      if (inner !== null) return inner;
    }
  }

  return null;
}

/** @deprecated Use tryExtractEventArray — kept for any external imports */
export function parseEventsFromFetchResponse(data: unknown): unknown[] | null {
  return tryExtractEventArray(data);
}

function looksLikeGameEventRow(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  const hasNum =
    typeof r.eventNumber === 'number'
    || typeof r.event_number === 'number'
    || (typeof r.eventNumber === 'string' && r.eventNumber !== '')
    || (typeof r.event_number === 'string' && r.event_number !== '');
  const hasType = typeof r.eventType === 'string' || typeof r.event_type === 'string';
  return hasNum || hasType;
}

/**
 * Coerce API / JSON rows into the shape the live game UI expects.
 * Supports camelCase (Drizzle) and snake_case (some gateways or raw SQL).
 */
export function normalizeGameEvents(raw: unknown): any[] {
  const list = tryExtractEventArray(raw) ?? [];
  return list.map((row) => normalizeGameEventRow(row as Record<string, unknown>));
}

function pick<T>(r: Record<string, unknown>, camel: string, snake: string): T | undefined {
  const v = r[camel];
  if (v !== undefined && v !== null) return v as T;
  const s = r[snake];
  if (s !== undefined && s !== null) return s as T;
  return undefined;
}

function normalizeHalf(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === 'bottom') return 'bot';
  return s;
}

function normalizeGameEventRow(r: Record<string, unknown>): Record<string, unknown> {
  const rawType = (pick<string>(r, 'eventType', 'event_type') ?? '') as string;
  const eventType = rawType.trim().toLowerCase();
  const half = normalizeHalf((pick<string>(r, 'half', 'half') ?? '') as string);
  return {
    ...r,
    id: Number(pick(r, 'id', 'id') ?? 0),
    eventNumber: Number(pick(r, 'eventNumber', 'event_number') ?? 0),
    eventType,
    inning: Number(pick(r, 'inning', 'inning') ?? 0),
    half,
    batterId: toNullableInt(pick(r, 'batterId', 'batter_id')),
    pitcherId: toNullableInt(pick(r, 'pitcherId', 'pitcher_id')),
    rbi: Number(pick(r, 'rbi', 'rbi') ?? 0),
    runsScored: Number(pick(r, 'runsScored', 'runs_scored') ?? 0),
    outsRecorded: Number(pick(r, 'outsRecorded', 'outs_recorded') ?? 0),
    eventDetail: (pick<string | null>(r, 'eventDetail', 'event_detail') ?? null) as string | null,
    fieldingSequence: (pick<string | null>(r, 'fieldingSequence', 'fielding_sequence') ?? null) as string | null,
    runnerFirstId: toNullableInt(pick(r, 'runnerFirstId', 'runner_first_id')),
    runnerSecondId: toNullableInt(pick(r, 'runnerSecondId', 'runner_second_id')),
    runnerThirdId: toNullableInt(pick(r, 'runnerThirdId', 'runner_third_id')),
    runnersScored: toNumArray(pick(r, 'runnersScored', 'runners_scored')),
    batterName: (pick<string | null>(r, 'batterName', 'batter_name') ?? null) as string | null,
    pitcherName: (pick<string | null>(r, 'pitcherName', 'pitcher_name') ?? null) as string | null,
    runnerFirstName: (pick<string | null>(r, 'runnerFirstName', 'runner_first_name') ?? null) as string | null,
    runnerSecondName: (pick<string | null>(r, 'runnerSecondName', 'runner_second_name') ?? null) as string | null,
    runnerThirdName: (pick<string | null>(r, 'runnerThirdName', 'runner_third_name') ?? null) as string | null,
    runnersScoredNames: toStrArray(pick(r, 'runnersScoredNames', 'runners_scored_names')),
    balls: Number(pick(r, 'balls', 'balls') ?? 0),
    strikes: Number(pick(r, 'strikes', 'strikes') ?? 0),
    runnerScoredReasons: pick(r, 'runnerScoredReasons', 'runner_scored_reasons') as string[] | null | undefined,
    errorsOnPlay: toNullableInt(pick(r, 'errorsOnPlay', 'errors_on_play')),
    hitType: (pick<string | null>(r, 'hitType', 'hit_type') ?? null) as string | null,
  };
}

function toNullableInt(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toNumArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
  return [];
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [];
}
