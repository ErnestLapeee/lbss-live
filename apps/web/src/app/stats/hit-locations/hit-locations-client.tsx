'use client';

import { useState, useEffect } from 'react';
import { SprayChart } from '@/components/stats/spray-chart';

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

interface SprayChartHit {
  hitLocationX: number;
  hitLocationY: number;
  hitType: string | null;
  hitHardness: string | null;
  eventType: string;
  isOut: boolean;
}

interface HitLocationsClientProps {
  seasons: Season[];
  teams: Team[];
}

export function HitLocationsClient({ seasons, teams }: HitLocationsClientProps) {
  const [seasonId, setSeasonId] = useState<number | null>(seasons.length > 0 ? seasons[0].id : null);
  const [teamId, setTeamId] = useState<number | null>(teams.length > 0 ? teams[0].id : null);
  const [hits, setHits] = useState<SprayChartHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!seasonId || !teamId) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/proxy/public/stats/team-hit-locations?seasonId=${seasonId}&teamId=${teamId}`)
      .then(r => r.json())
      .then((data: SprayChartHit[]) => {
        setHits(Array.isArray(data) ? data : []);
      })
      .catch(() => setHits([]))
      .finally(() => setLoading(false));
  }, [seasonId, teamId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-text-muted">Season:</label>
          <select
            value={seasonId ?? ''}
            onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
            aria-label="Select season"
          >
            {seasons.length === 0 ? (
              <option value="">Select season</option>
            ) : (
              seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))
            )}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-text-muted">Team:</label>
          <select
            value={teamId ?? ''}
            onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
            aria-label="Select team"
          >
            {teams.length === 0 ? (
              <option value="">Select team</option>
            ) : (
              teams.map(t => (
                <option key={t.id} value={t.id}>{t.shortName || t.name}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6">
          <SprayChart hits={hits} width={400} height={280} />
          {hits.length > 0 && (
            <p className="text-[10px] text-text-faint mt-3 text-center">
              Green = hit, Red = out, Blue = error. Shape: square = ground ball, diamond = line drive, circle = fly/pop.
            </p>
          )}
          {!loading && hits.length === 0 && seasonId && teamId && (
            <p className="text-sm text-text-muted text-center mt-4">
              No hit location data for this team and season. Data appears when games have hit locations recorded for batted balls.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
