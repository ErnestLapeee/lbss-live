import Image from 'next/image';
import { clsx } from 'clsx';

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
  className?: string;
}) {
  const dim = variantClass[variant];
  const rounded = variant === 'bracket' ? 'rounded-full' : 'rounded-lg';
  const imgWrap = clsx(
    'flex shrink-0 items-center justify-center overflow-hidden border border-border/60 bg-surface',
    rounded,
    dim,
    emphasized && 'border-accent/30 bg-accent/5',
    className
  );
  const fallbackWrap = clsx(
    'flex shrink-0 items-center justify-center font-heading font-black',
    rounded,
    dim,
    won ? 'bg-surface-alt text-text' : emphasized ? 'bg-accent/10 text-accent-light' : 'bg-surface-alt/50 text-text-faint',
    className
  );

  if (logoUrl) {
    const px = variant === 'card' ? 56 : variant === 'bracket' ? 48 : variant === 'live' ? 40 : 20;
    return (
      <div className={imgWrap}>
        <Image
          src={logoUrl}
          alt={name}
          width={px}
          height={px}
          className="max-h-full max-w-full object-contain p-0.5"
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
