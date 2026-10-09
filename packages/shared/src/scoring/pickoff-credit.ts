/**
 * Fielding pickoff (PK) goes to the fielder who starts the throw.
 * 1-3: pitcher. 2-3: catcher. A lone fielder gets the PK with the putout.
 * The pitcher on the mound is not credited when the sequence starts at catcher.
 */
export function pickoffCreditPlayerId(args: {
  assistFielderIds?: number[] | null;
  putoutFielderIds?: number[] | null;
  fieldingSequence?: string | null;
  positionToPlayer?: Map<number, number> | null;
}): number | null {
  const sequence = args.fieldingSequence?.trim();
  if (sequence && args.positionToPlayer) {
    const firstPosition = sequence
      .split('-')
      .map((segment) => segment.trim())
      .filter((segment) => /^\d+$/.test(segment))
      .map((segment) => Number(segment))
      .find((position) => position >= 1 && position <= 9);
    if (firstPosition != null) {
      const playerId = args.positionToPlayer.get(firstPosition);
      if (playerId != null) return playerId;
    }
  }
  const assists = (args.assistFielderIds ?? []).filter((id) => Number.isFinite(id));
  if (assists.length > 0) return assists[0]!;
  const putouts = (args.putoutFielderIds ?? []).filter((id) => Number.isFinite(id));
  if (putouts.length > 0) return putouts[0]!;
  return null;
}
