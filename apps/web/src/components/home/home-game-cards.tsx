import Link from 'next/link';
import { formatGameDateMonthDay, formatGameDateShort, formatGameTime } from '@/lib/game-datetime';
import { TeamMark } from '@/components/ui/team-mark';

export function gamePagePath(gameId: number) {
  return `/games/${gameId}/live`;
}

function TeamBadge({
  name,
  shortName,
  logoUrl,
}: {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
}) {
  return (
    <TeamMark
      name={name}
      shortName={shortName}
      logoUrl={logoUrl}
      variant="tableSm"
      className="border-[#ccc] bg-[#f0f0f0]"
    />
  );
}

export function UpcomingGameCard({
  game,
  awayRecord,
  homeRecord,
}: {
  game: {
    id: number;
    scheduledAt: string;
    venue?: string | null;
    awayTeamName: string | null;
    homeTeamName: string | null;
    awayTeamShort?: string | null;
    homeTeamShort?: string | null;
    awayTeamLogoUrl?: string | null;
    homeTeamLogoUrl?: string | null;
  };
  awayRecord?: string | null;
  homeRecord?: string | null;
}) {
  return (
    <Link
      href={gamePagePath(game.id)}
      className="group block rounded-xl border border-border bg-surface p-4 transition-all hover:border-accent/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">
          {formatGameDateShort(game.scheduledAt)}
        </span>
        <span className="text-[11px] font-medium text-text-faint tabular-nums">{formatGameTime(game.scheduledAt)}</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <TeamBadge
            name={game.awayTeamName || 'TBD'}
            shortName={game.awayTeamShort}
            logoUrl={game.awayTeamLogoUrl}
          />
          <span className="font-semibold text-sm group-hover:text-accent transition-colors truncate flex-1">
            {game.awayTeamName || 'TBD'}
          </span>
          {awayRecord && <span className="text-[10px] font-mono text-text-faint shrink-0">{awayRecord}</span>}
        </div>
        <div className="flex items-center gap-2">
          <TeamBadge
            name={game.homeTeamName || 'TBD'}
            shortName={game.homeTeamShort}
            logoUrl={game.homeTeamLogoUrl}
          />
          <span className="font-semibold text-sm group-hover:text-accent transition-colors truncate flex-1">
            {game.homeTeamName || 'TBD'}
          </span>
          {homeRecord && <span className="text-[10px] font-mono text-text-faint shrink-0">{homeRecord}</span>}
        </div>
      </div>
      {game.venue && <div className="mt-2 text-[11px] text-text-faint truncate">{game.venue}</div>}
    </Link>
  );
}

export function RecentGameCard({
  game,
}: {
  game: {
    id: number;
    status: string;
    scheduledAt: string;
    awayTeamName: string | null;
    homeTeamName: string | null;
    awayTeamShort?: string | null;
    homeTeamShort?: string | null;
    awayTeamLogoUrl?: string | null;
    homeTeamLogoUrl?: string | null;
    awayScore?: number;
    homeScore?: number;
  };
}) {
  const isLive = game.status === 'live';
  const awayWon = (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0);

  return (
    <Link
      href={gamePagePath(game.id)}
      className={`group block rounded-xl border p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        isLive
          ? 'border-live/30 bg-live/[0.03] shadow-[0_0_20px_rgba(34,197,94,0.06)] hover:border-live/50'
          : 'border-border bg-surface hover:border-accent/30 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <TeamBadge
              name={game.awayTeamName || 'TBD'}
              shortName={game.awayTeamShort}
              logoUrl={game.awayTeamLogoUrl}
            />
            <span
              className={`text-sm font-semibold truncate group-hover:text-accent transition-colors ${awayWon ? '' : 'text-text-muted'}`}
            >
              {game.awayTeamName || 'TBD'}
            </span>
            <span
              className={`ml-auto font-heading text-lg font-bold stat-value shrink-0 ${awayWon ? '' : 'text-text-muted'}`}
            >
              {game.awayScore ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TeamBadge
              name={game.homeTeamName || 'TBD'}
              shortName={game.homeTeamShort}
              logoUrl={game.homeTeamLogoUrl}
            />
            <span
              className={`text-sm font-semibold truncate group-hover:text-accent transition-colors ${homeWon ? '' : 'text-text-muted'}`}
            >
              {game.homeTeamName || 'TBD'}
            </span>
            <span
              className={`ml-auto font-heading text-lg font-bold stat-value shrink-0 ${homeWon ? '' : 'text-text-muted'}`}
            >
              {game.homeScore ?? 0}
            </span>
          </div>
        </div>
        <div className="ml-4 flex flex-col items-center shrink-0">
          {isLive ? (
            <span className="text-[10px] font-bold uppercase text-live tracking-wider live-badge px-2 py-0.5 rounded-full bg-live/10">
              Live
            </span>
          ) : (
            <>
              <span className="text-[10px] font-bold uppercase text-text-faint tracking-wider">Final</span>
              <span className="text-[10px] text-text-faint mt-0.5">{formatGameDateMonthDay(game.scheduledAt)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
