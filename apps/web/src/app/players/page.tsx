import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Players' };

function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && 'data' in v && Array.isArray((v as { data: T[] }).data)) return (v as { data: T[] }).data;
  return [];
}

export default async function PlayersPage() {
  let players: any[] = [];
  try { players = toArray(await apiFetch<{ data?: any[] } | any[]>('/api/public/players')); } catch {}

  return (
    <div>
      <PageHeader title="Players" description="All registered players in the league" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {players.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
            <p className="text-text-muted text-lg font-medium">No players registered yet</p>
            <p className="text-text-faint text-sm mt-2">Players will appear here once added by administrators.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">Player</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">Nationality</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">B/T</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p: any) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/players/${p.slug}`} className="font-semibold text-accent hover:text-accent-light transition-colors">
                        {p.firstName} {p.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{p.nationality || '—'}</td>
                    <td className="px-4 py-3 text-text-muted font-mono text-xs">{[p.bats, p.throws].filter(Boolean).join('/') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
