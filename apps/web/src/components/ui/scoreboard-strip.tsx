interface ScoreGame {
  id: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  scheduledAt: string;
}

export function ScoreboardStrip({ games }: { games: ScoreGame[] }) {
  if (games.length === 0) return null;

  return (
    <div className="bg-primary-light border-b border-white/[0.06]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 py-2 overflow-x-auto scoreboard-scroll">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-white/30 mr-3">
            Scores
          </span>
          {games.map((g) => {
            const isLive = g.status === 'live';
            const isFinal = g.status === 'final';
            const isScheduled = g.status === 'scheduled';
            const date = new Date(g.scheduledAt);

            const away = g.awayTeamName || 'TBD';
            const home = g.homeTeamName || 'TBD';
            // Get 3-letter abbreviations
            const awayAbbr = away.length <= 4 ? away.toUpperCase() : away.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
            const homeAbbr = home.length <= 4 ? home.toUpperCase() : home.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();

            return (
              <div
                key={g.id}
                className={`shrink-0 flex items-center gap-3 px-3 py-1.5 rounded-lg text-white transition-colors ${
                  isLive
                    ? 'bg-live/10 border border-live/20'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                {/* Teams + Scores */}
                <div className="flex flex-col gap-0.5 min-w-[80px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold tracking-wide text-white/80">{awayAbbr}</span>
                    {!isScheduled && (
                      <span className={`text-[12px] font-bold stat-value ${
                        isFinal && (g.awayScore ?? 0) > (g.homeScore ?? 0) ? 'text-white' : 'text-white/50'
                      }`}>
                        {g.awayScore ?? 0}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold tracking-wide text-white/80">{homeAbbr}</span>
                    {!isScheduled && (
                      <span className={`text-[12px] font-bold stat-value ${
                        isFinal && (g.homeScore ?? 0) > (g.awayScore ?? 0) ? 'text-white' : 'text-white/50'
                      }`}>
                        {g.homeScore ?? 0}
                      </span>
                    )}
                  </div>
                </div>
                {/* Status badge */}
                <div className="flex flex-col items-center">
                  {isLive && (
                    <span className="text-[9px] font-bold uppercase text-live tracking-wider">Live</span>
                  )}
                  {isFinal && (
                    <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Final</span>
                  )}
                  {isScheduled && (
                    <span className="text-[9px] font-medium text-white/30">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
