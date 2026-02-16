import Link from 'next/link';
import { LiveBadge } from './live-badge';
import { cn } from '@/lib/utils';

interface GameCardProps {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  status: string;
  scheduledAt: string;
  venue?: string;
}

export function GameCard({ id, homeTeam, awayTeam, homeScore, awayScore, status, scheduledAt, venue }: GameCardProps) {
  const isLive = status === 'live';
  const isFinal = status === 'final';
  const date = new Date(scheduledAt);

  const content = (
    <div
      className={cn(
        'rounded-xl border bg-surface p-4 transition-all hover:shadow-md',
        isLive ? 'border-live/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted font-medium">
          {date.toLocaleDateString('lv-LV', { month: 'short', day: 'numeric' })}
          {' '}
          {date.toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {isLive && <LiveBadge />}
        {isFinal && (
          <span className="text-xs font-semibold text-text-muted uppercase">Final</span>
        )}
        {status === 'scheduled' && (
          <span className="text-xs font-medium text-text-muted">Upcoming</span>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{awayTeam}</span>
          {(isFinal || isLive) && (
            <span className={cn('font-heading font-bold text-lg tabular-nums', awayScore! > homeScore! && 'text-accent')}>
              {awayScore}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{homeTeam}</span>
          {(isFinal || isLive) && (
            <span className={cn('font-heading font-bold text-lg tabular-nums', homeScore! > awayScore! && 'text-accent')}>
              {homeScore}
            </span>
          )}
        </div>
      </div>
      {venue && (
        <div className="mt-2 text-xs text-text-muted">{venue}</div>
      )}
    </div>
  );

  return (
    <Link href={`/games/${id}`} className="block">
      {content}
    </Link>
  );
}
