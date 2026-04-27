'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type SortKey = 'name' | 'nationality' | 'batsThrows';
type SortDir = 'asc' | 'desc';

interface PlayerRow {
  id: number | string;
  slug: string;
  firstName?: string | null;
  lastName?: string | null;
  nationality?: string | null;
  bats?: string | null;
  throws?: string | null;
}

interface PlayersTableProps {
  players: PlayerRow[];
}

const columns: { key: SortKey; label: string; align?: 'left' | 'right' }[] = [
  { key: 'name', label: 'Player' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'batsThrows', label: 'B/T' },
];

function playerName(player: PlayerRow) {
  return `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || 'Unknown player';
}

function batsThrows(player: PlayerRow) {
  return [player.bats, player.throws].filter(Boolean).join('/') || '';
}

function sortValue(player: PlayerRow, key: SortKey) {
  if (key === 'name') return `${player.lastName ?? ''} ${player.firstName ?? ''}`.trim().toLowerCase();
  if (key === 'batsThrows') return batsThrows(player).toLowerCase();
  return (player.nationality ?? '').toLowerCase();
}

export function PlayersTable({ players }: PlayersTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [players, sortDir, sortKey]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-alt">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint"
              >
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className={`inline-flex items-center gap-1.5 transition-colors hover:text-accent ${
                    sortKey === col.key ? 'text-accent' : ''
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <svg
                      className={`h-3 w-3 ${sortDir === 'asc' ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedPlayers.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/players/${p.slug}`} className="font-semibold text-accent hover:text-accent-light transition-colors">
                  {playerName(p)}
                </Link>
              </td>
              <td className="px-4 py-3 text-text-muted">{p.nationality || '-'}</td>
              <td className="px-4 py-3 text-text-muted font-mono text-xs">{batsThrows(p) || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
