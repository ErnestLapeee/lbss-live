import Link from 'next/link';

interface SectionHeaderProps {
  title: string;
  href?: string;
  linkLabel?: string;
  light?: boolean;
}

export function SectionHeader({ title, href, linkLabel = 'View All' }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-4">
      <h2 className="text-base font-bold text-[#111]">
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-xs font-medium text-[#136cb2] hover:underline">
          {linkLabel} &rarr;
        </Link>
      )}
    </div>
  );
}
