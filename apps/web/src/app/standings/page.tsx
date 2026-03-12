import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Standings' };

export default async function StandingsPage() {
  let allStandings: { leagueName: string; rows: any[] }[] = [];

  try {
    // Align with stats/players pages: use stats seasons helper
    const seasons: any[] = await apiFetch('/api/public/stats/seasons');
    const activeSeason = seasons.find((s: any) => s.isActive) || seasons[0];
    if (activeSeason) {
      const seasonDetail: any = await apiFetch(`/api/public/seasons/${activeSeason.year}`);
      const leagueList: any[] = seasonDetail.leagues || [];
      for (const league of leagueList) {
        try {
          const rows: any[] = await apiFetch(`/api/public/standings/${league.id}`);
          if (rows.length > 0) {
            allStandings.push({ leagueName: league.name, rows });
          }
        } catch {}
      }
    }
  } catch {}

  return (
    <div>
      <PageHeader title="Standings" description="Current season league standings" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {allStandings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
            <p className="text-text-muted text-lg font-medium">No standings data available yet</p>
            <p className="text-text-faint text-sm mt-2">Standings will update as games are played and finalized.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {allStandings.map((league) => (
              <div key={league.leagueName}>
                <h2 className="text-lg font-bold mb-3">{league.leagueName}</h2>
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-alt">
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint w-8">#</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">Team</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">W</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">L</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">T</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">GP</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">PCT</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">GB</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">RS</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">RA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {league.rows.map((row: any, i: number) => (
                        <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                          <td className="px-4 py-3 font-bold text-text-faint">{i + 1}</td>
                          <td className="px-4 py-3 font-semibold">{row.teamName || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono stat-value">{row.wins}</td>
                          <td className="px-4 py-3 text-right font-mono stat-value">{row.losses}</td>
                          <td className="px-4 py-3 text-right font-mono stat-value">{row.ties ?? 0}</td>
                          <td className="px-4 py-3 text-right font-mono stat-value">{row.gamesPlayed}</td>
                          <td className="px-4 py-3 text-right font-mono stat-value font-semibold">{row.winPct || '.000'}</td>
                          <td className="px-4 py-3 text-right text-text-muted font-mono">{row.gamesBehind === '0' || row.gamesBehind === '0.0' ? '—' : row.gamesBehind ?? '—'}</td>
                          <td className="px-4 py-3 text-right font-mono stat-value">{row.runsScored ?? 0}</td>
                          <td className="px-4 py-3 text-right font-mono stat-value">{row.runsAllowed ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
