export type BaseOccupancy = {
  first: number | null;
  second: number | null;
  third: number | null;
};

/**
 * After a `substitution` event with `kind: 'player_change'`, the outgoing player may
 * still appear on bases from the prior play's snapshot — replace that ID with the
 * incoming player on each occupied base.
 */
export function remapBasesForSubstitutionDetail(
  bases: BaseOccupancy,
  eventDetail: string | null | undefined,
): BaseOccupancy {
  try {
    const d = JSON.parse(eventDetail || '{}') as {
      kind?: string;
      outPlayerId?: number;
      inPlayerId?: number;
    };
    if (d.kind !== 'player_change') return { ...bases };
    const o = Number(d.outPlayerId);
    const i = Number(d.inPlayerId);
    if (!Number.isFinite(o) || !Number.isFinite(i)) return { ...bases };
    return {
      first: bases.first === o ? i : bases.first,
      second: bases.second === o ? i : bases.second,
      third: bases.third === o ? i : bases.third,
    };
  } catch {
    return { ...bases };
  }
}
