'use client';

/**
 * Team logo slot (48×48). Pass `logoUrl` when available; otherwise shows initial letter + stitch motif.
 * `letter` overrides the initial (e.g. seed-based "R", "S", "P").
 */
export function PlayoffTeamAvatar({
  teamName,
  letter,
  logoUrl,
  variant = 'filled',
  className = '',
}: {
  teamName: string;
  letter?: string;
  logoUrl?: string | null;
  variant?: 'filled' | 'tbd';
  className?: string;
}) {
  const raw = String(teamName ?? '').trim();
  const isTbd = variant === 'tbd' || !raw || raw === '—' || raw === 'TBD';
  const ch = isTbd ? '?' : (letter ?? raw.charAt(0)).toUpperCase();

  return (
    <div
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 shadow-md ${className} ${
        isTbd
          ? 'border-white/15 bg-slate-700/80 text-slate-400'
          : 'border-[#38bdf8]/40 bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-[0_0_20px_rgba(56,189,248,0.15)]'
      }`}
      aria-hidden
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary league URLs
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <svg
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden
          >
            <path
              d="M24 8v32M14 14c2 4 4 8 10 10M34 14c-2 4-4 8-10 10M14 34c2-4 4-8 10-10M34 34c-2-4-4-8-10-10"
              stroke="currentColor"
              strokeWidth="1"
              className="text-white"
            />
          </svg>
          <span className="relative font-heading text-lg font-black tabular-nums tracking-tight">{ch}</span>
        </>
      )}
    </div>
  );
}
