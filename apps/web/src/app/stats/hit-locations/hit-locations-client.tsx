'use client';

import { useState, useEffect } from 'react';
import { SprayChart } from '@/components/stats/spray-chart';
import type { SprayChartHit } from '@/components/stats/spray-chart';

interface Season {
  id: number;
  name: string;
  year: number;
}

interface Team {
  id: number;
  name: string;
  shortName: string | null;
}

interface PlayerHitData {
  playerId: number;
  name: string;
  atBats: number;
  hits: SprayChartHit[];
}

interface HitLocationsClientProps {
  seasons: Season[];
  teams: Team[];
}

export function HitLocationsClient({ seasons, teams }: HitLocationsClientProps) {
  const [seasonId, setSeasonId] = useState<number | null>(seasons.length > 0 ? seasons[0].id : null);
  const [teamId, setTeamId] = useState<number | null>(teams.length > 0 ? teams[0].id : null);
  const [teamHits, setTeamHits] = useState<SprayChartHit[]>([]);
  const [playerData, setPlayerData] = useState<PlayerHitData[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'team' | 'players'>('team');

  useEffect(() => {
    if (!seasonId || !teamId) { setTeamHits([]); setPlayerData([]); return; }
    setLoading(true);
    Promise.all([
      fetch(`/api/proxy/public/stats/team-hit-locations?seasonId=${seasonId}&teamId=${teamId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/proxy/public/stats/team-hit-locations-by-player?seasonId=${seasonId}&teamId=${teamId}`).then(r => r.json()).catch(() => []),
    ]).then(([team, players]) => {
      setTeamHits(Array.isArray(team) ? team : []);
      setPlayerData(Array.isArray(players) ? players : []);
    }).finally(() => setLoading(false));
  }, [seasonId, teamId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[#666]">Season:</label>
          <select value={seasonId ?? ''} onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)}
            className="border border-[#ccc] bg-white px-2 py-1 text-sm">
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[#666]">Team:</label>
          <select value={teamId ?? ''} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}
            className="border border-[#ccc] bg-white px-2 py-1 text-sm">
            {teams.map(t => <option key={t.id} value={t.id}>{t.shortName || t.name}</option>)}
          </select>
        </div>
        <div className="flex border border-[#ccc] text-xs">
          <button onClick={() => setView('team')}
            className={`px-3 py-1 ${view === 'team' ? 'bg-[#333] text-white' : 'bg-white text-[#333] hover:bg-[#eee]'}`}>
            Team
          </button>
          <button onClick={() => setView('players')}
            className={`px-3 py-1 border-l border-[#ccc] ${view === 'players' ? 'bg-[#333] text-white' : 'bg-white text-[#333] hover:bg-[#eee]'}`}>
            Per Player
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#333] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === 'team' ? (
        <div className="border border-[#ccc] bg-white p-6">
          <SprayChart hits={teamHits} width={720} height={480} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {playerData.map(p => (
            <div key={p.playerId} className="border border-[#ccc] bg-white p-2">
              <div className="text-xs font-bold text-[#111] truncate">{p.name}</div>
              <div className="text-[10px] text-[#888] mb-1">{p.atBats} AB &middot; {p.hits.length} batted</div>
              <SprayChart hits={p.hits} width={200} height={134} compact showLegend={false} />
            </div>
          ))}
          {playerData.length === 0 && (
            <div className="col-span-full text-sm text-[#999] text-center py-8">No data</div>
          )}
        </div>
      )}
    </div>
  );
}
