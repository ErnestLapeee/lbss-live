export function PlaceMark({ rank, place }: { rank: number; place?: 1 | 2 | 3 | null }) {
  const medal =
    place === 1
      ? 'bg-gold text-white'
      : place === 2
        ? 'bg-[#c5c8ce] text-[#1c1e22]'
        : place === 3
          ? 'bg-[#b87333] text-white'
          : '';
  if (!medal) {
    return (
      <span className="inline-flex h-5 min-w-5 items-center justify-center text-[11px] font-bold tabular-nums text-text-faint">
        {rank}
      </span>
    );
  }
  const label = place === 1 ? '1st' : place === 2 ? '2nd' : '3rd';
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums ${medal}`}
      title={label}
      aria-label={label}
    >
      {rank}
    </span>
  );
}
