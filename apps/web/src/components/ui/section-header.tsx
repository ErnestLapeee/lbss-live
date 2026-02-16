import Link from 'next/link';

interface SectionHeaderProps {
  title: string;
  href?: string;
  linkLabel?: string;
  light?: boolean;
}

export function SectionHeader({ title, href, linkLabel = 'View All', light = false }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className={`w-1 h-6 rounded-full ${light ? 'bg-gold' : 'bg-accent'}`} />
        <h2 className={`font-heading text-xl font-bold tracking-tight ${light ? 'text-white' : ''}`}>
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
            light
              ? 'text-white/50 hover:text-white'
              : 'text-text-muted hover:text-accent'
          }`}
        >
          {linkLabel} &rarr;
        </Link>
      )}
    </div>
  );
}
