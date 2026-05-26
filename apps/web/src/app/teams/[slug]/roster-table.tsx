import Link from 'next/link';
import { playerProfilePath } from '@/lib/player-profile-nav';

interface RosterPlayer {
  playerId: number;
  playerSlug?: string;
  slug?: string;
  firstName: string;
  lastName: string;
  jerseyNumber?: string | number;
  bats?: string | null;
  throws?: string | null;
  position?: string | number | null;
  licensePaid?: string | null;
}

const POS_LABELS: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH',
};

export function RosterTable({ roster, returnTo }: { roster: RosterPlayer[]; returnTo?: string }) {
  const formatPos = (position: RosterPlayer['position']) => {
    if (position == null || position === '') return '—';
    if (typeof position === 'number') return POS_LABELS[position] || String(position);
    const s = String(position).trim();
    if (!s) return '—';
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && POS_LABELS[n]) return POS_LABELS[n];
    return s;
  };

  return (
    <div className="rounded-xl border border-border bg-surface overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-alt">
            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint w-12">#</th>
            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">Player</th>
            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">Pos</th>
            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">B/T</th>
            <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-text-faint w-16">License</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((p, i) => {
            const posStr = formatPos(p.position);
            return (
              <tr key={p.playerId || i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                <td className="px-4 py-3 font-mono text-text-faint font-bold">{p.jerseyNumber || '—'}</td>
                <td className="px-4 py-3">
                  <Link
                    href={playerProfilePath(p.playerSlug || p.slug || '#', returnTo)}
                    className="font-semibold text-[#111] hover:text-[#136cb2] hover:underline transition-colors"
                  >
                    {p.firstName} {p.lastName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-text-muted text-xs font-mono">{posStr}</td>
                <td className="px-4 py-3 text-text-muted font-mono text-xs">{[p.bats, p.throws].filter(Boolean).join('/') || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block w-2 h-2 rounded-full ${p.licensePaid === 'paid' ? 'bg-green-500' : 'bg-red-500'}`}
                    title={p.licensePaid === 'paid' ? 'License paid' : 'License unpaid'} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
