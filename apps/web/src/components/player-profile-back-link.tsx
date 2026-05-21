'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { returnLabelForPath, sanitizeReturnPath } from '@/lib/player-profile-nav';

const DEFAULT_HREF = '/stats';
const DEFAULT_LABEL = 'Statistics';

export function PlayerProfileBackLink() {
  const searchParams = useSearchParams();
  const from = sanitizeReturnPath(searchParams.get('from'));
  const href = from ?? DEFAULT_HREF;
  const label = from ? returnLabelForPath(from) : DEFAULT_LABEL;

  return (
    <Link
      href={href}
      className="text-xs text-text-muted hover:text-text transition-colors mb-5 inline-block"
    >
      &larr; {label}
    </Link>
  );
}
