import Image from 'next/image';
import { clsx } from 'clsx';
import { resolveTeamLogoUrl } from '@/lib/team-logo';

type Variant = 'tableSm' | 'tableMd' | 'final' | 'live' | 'card' | 'bracket';

const variantClass: Record<Variant, string> = {
  tableSm: 'h-5 w-5 min-h-5 min-w-5 text-[8px]',
  tableMd: 'h-8 w-8 min-h-8 min-w-8 text-[10px]',
  final: 'h-7 w-7 min-h-7 min-w-7 text-[10px]',
  live: 'h-10 w-10 min-h-10 min-w-10 text-xs',
  card: 'h-14 w-14 min-h-14 min-w-14 text-lg',
  bracket: 'h-12 w-12 min-h-12 min-w-12 text-[11px]',
};

/** Team logo image or initials fallback — shared by schedule, teams, stats. */
export function TeamMark({
  name,
  shortName,
  logoUrl,
  variant,
  won,
  emphasized,
  place,
  className,
}: {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  variant: Variant;
  /** Final: winning team. */
  won?: boolean;
  /** Live: score leader (accent). */
  emphasized?: boolean;
  /** Finished-table place. Colors the logo box gold, silver, or bronze. */
  place?: 1 | 2 | 3 | null;
  className?: string;
}) {
  const dim = variantClass[variant];
  const rounded = variant === 'bracket' ? 'rounded-full' : 'rounded-lg';
  const placeTone =
    place === 1
      ? 'border-2 border-gold bg-gold text-white'
      : place === 2
        ? 'border-2 border-[#c5c8ce] bg-[#c5c8ce] text-[#1c1e22]'
        : place === 3
          ? 'border-2 border-[#b87333] bg-[#b87333] text-white'
          : null;
  const imgWrap = clsx(
    'flex shrink-0 items-center justify-center overflow-hidden border',
    placeTone ?? 'border-border/60 bg-surface',
    rounded,
    dim,
    !placeTone && emphasized && 'border-accent/30 bg-accent/5',
    className
  );
  const fallbackWrap = clsx(
    'flex shrink-0 items-center justify-center font-heading font-black',
    rounded,
    dim,
    placeTone ?? (won ? 'bg-surface-alt text-text' : emphasized ? 'bg-accent/10 text-accent-light' : 'bg-surface-alt/50 text-text-faint'),
    !placeTone && 'border border-transparent',
    className
  );

  const src = place ? null : resolveTeamLogoUrl(logoUrl);
  if (src) {
    const px = variant === 'card' ? 56 : variant === 'bracket' ? 48 : variant === 'live' ? 40 : 20;
    return (
      <div className={imgWrap}>
        <Image
          src={src}
          alt={name}
          width={px}
          height={px}
          className={clsx('max-h-full max-w-full object-contain', place ? 'p-1' : 'p-0.5')}
          loading="lazy"
          unoptimized
        />
      </div>
    );
  }

  const abbr =
    shortName?.slice(0, 3).toUpperCase() ||
    (name.length <= 3
      ? name.toUpperCase()
      : name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 3)
          .toUpperCase());

  return (
    <div className={fallbackWrap}>
      <span className="leading-none">{abbr}</span>
    </div>
  );
}
