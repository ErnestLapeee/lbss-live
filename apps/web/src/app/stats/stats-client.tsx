'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { usePlayerModal } from '@/components/player-modal';
import { getStatAbbreviationMeaning } from '@/lib/stat-abbreviations';
import { HorizontalScrollArea } from '@/components/stats/horizontal-scroll-area';


/* ── Types ── */

interface Season {
  id: number;
  name: string;
  year: number;
  isActive: boolean;
}

interface BattingStat {
  playerId: number;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  games: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  runs: number;
  walks: number;
  strikeouts: number;
  hitByPitch: number;
  stolenBases: number;
  caughtStealing: number;
  sacrificeFlies: number;
  sacrificeBunts: number;
  battingAvg: string | null;
  onBasePct: string | null;
  sluggingPct: string | null;
  ops: string | null;
  runsCreated?: string | null;
  gpa?: string | null;
  babip?: string | null;
  iso?: string | null;
  bbPct?: string | null;
  kPct?: string | null;
}

interface PitchingStat {
  playerId: number;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  games: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  saves: number;
  inningsPitched: string | null;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walksAllowed: number;
  strikeouts: number;
  homeRunsAllowed: number;
  hitBatters: number;
  wildPitches: number;
  era: string | null;
  whip: string | null;
  strikeoutRate: string | null;
  walkRate: string | null;
  k9?: string | null;
  bb9?: string | null;
  h9?: string | null;
  fip?: string | null;
  babip?: string | null;
  balls?: number;
  strikes?: number;
  strikePercentage?: string | null;
  firstPitchStrikes?: number;
  firstPitchTotal?: number;
  firstPitchStrikePct?: string | null;
  goAo?: string | null;
  groundOuts?: number;
  flyOuts?: number;
}

interface FieldingStat {
  playerId: number;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  games: number;
  innings: string | null;
  putouts: number;
  assists: number;
  errors: number;
  doublePlays: number;
  triplePlays: number;
  passedBalls: number;
  catcherStolenBases: number;
  catcherCaughtStealing: number;
  pickoffs: number;
  fieldingPct: string | null;
  position?: number | null;
  sba?: number;
}

interface BattingContactStat {
  playerId: number;
  playerSlug: string | null;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  bip: number;
  gbSoft: number;
  gbMedium: number;
  gbHard: number;
  ldSoft: number;
  ldMedium: number;
  ldHard: number;
  puSoft: number;
  puMedium: number;
  puHard: number;
  fbSoft: number;
  fbMedium: number;
  fbHard: number;
  gbPct?: string | null;
  ldPct?: string | null;
  puPct?: string | null;
  fbPct?: string | null;
}

type PitchingContactStat = BattingContactStat;

const POSITION_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'P' },
  { value: '2', label: 'C' },
  { value: '3', label: '1B' },
  { value: '4', label: '2B' },
  { value: '5', label: '3B' },
  { value: '6', label: 'SS' },
  { value: '7', label: 'LF' },
  { value: '8', label: 'CF' },
  { value: '9', label: 'RF' },
];

interface LeaderEntry {
  playerId: number;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  value: string | number | null;
}

interface LeadersData {
  [key: string]: {
    label: string;
    players: LeaderEntry[];
  };
}

type SortDirection = 'asc' | 'desc';
type StatsTab = 'batting' | 'pitching' | 'fielding';

/* ── Column definitions ── */

interface Column {
  key: string;
  label: string;
  align: 'left' | 'right';
  sticky?: boolean;
  highlight?: boolean;
}

const BATTING_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'games', label: 'G', align: 'right' },
  { key: 'plateAppearances', label: 'PA', align: 'right' },
  { key: 'atBats', label: 'AB', align: 'right' },
  { key: 'runs', label: 'R', align: 'right' },
  { key: 'hits', label: 'H', align: 'right' },
  { key: 'doubles', label: '2B', align: 'right' },
  { key: 'triples', label: '3B', align: 'right' },
  { key: 'homeRuns', label: 'HR', align: 'right' },
  { key: 'rbi', label: 'RBI', align: 'right' },
  { key: 'walks', label: 'BB', align: 'right' },
  { key: 'hitByPitch', label: 'HBP', align: 'right' },
  { key: 'strikeouts', label: 'SO', align: 'right' },
  { key: 'strikeoutsLooking', label: 'Kc', align: 'right' },
  { key: 'strikeoutsSwinging', label: 'Ks', align: 'right' },
  { key: 'stolenBases', label: 'SB', align: 'right' },
  { key: 'caughtStealing', label: 'CS', align: 'right' },
  { key: 'sacrificeFlies', label: 'SF', align: 'right' },
  { key: 'sacrificeBunts', label: 'SH', align: 'right' },
  { key: 'intentionalWalks', label: 'IBB', align: 'right' },
  { key: 'groundedIntoDoublePlays', label: 'GDP', align: 'right' },
  { key: 'reachedOnError', label: 'ROE', align: 'right' },
  { key: 'totalBases', label: 'TB', align: 'right' },
  { key: 'buntSingles', label: 'B', align: 'right' },
  { key: 'pickedOff', label: 'PK', align: 'right' },
  { key: 'fieldersChoice', label: 'FC', align: 'right' },
  { key: 'catcherInterference', label: 'CI', align: 'right' },
  { key: 'groundedIntoTriplePlay', label: 'GTP', align: 'right' },
  { key: 'battingAvg', label: 'AVG', align: 'right', highlight: true },
  { key: 'onBasePct', label: 'OBP', align: 'right' },
  { key: 'sluggingPct', label: 'SLG', align: 'right' },
  { key: 'ops', label: 'OPS', align: 'right', highlight: true },
  { key: 'babip', label: 'BABIP', align: 'right' },
  { key: 'iso', label: 'ISO', align: 'right' },
  { key: 'bbPct', label: 'BB%', align: 'right' },
  { key: 'kPct', label: 'K%', align: 'right' },
];

const BATTING_ADVANCED_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'games', label: 'G', align: 'right' },
  { key: 'plateAppearances', label: 'PA', align: 'right' },
  { key: 'atBats', label: 'AB', align: 'right' },
  { key: 'runs', label: 'R', align: 'right' },
  { key: 'hits', label: 'H', align: 'right' },
  { key: 'doubles', label: '2B', align: 'right' },
  { key: 'triples', label: '3B', align: 'right' },
  { key: 'homeRuns', label: 'HR', align: 'right' },
  { key: 'rbi', label: 'RBI', align: 'right' },
  { key: 'walks', label: 'BB', align: 'right' },
  { key: 'strikeouts', label: 'SO', align: 'right' },
  { key: 'battingAvg', label: 'AVG', align: 'right', highlight: true },
  { key: 'onBasePct', label: 'OBP', align: 'right' },
  { key: 'sluggingPct', label: 'SLG', align: 'right' },
  { key: 'ops', label: 'OPS', align: 'right', highlight: true },
  { key: 'runsCreated', label: 'RC', align: 'right' },
  { key: 'gpa', label: 'GPA', align: 'right' },
  { key: 'babip', label: 'BABIP', align: 'right' },
];

const BATTING_CONTACT_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'bip', label: 'BIP', align: 'right' },
  { key: 'gbSoft', label: 'GBs', align: 'right' },
  { key: 'gbMedium', label: 'GBm', align: 'right' },
  { key: 'gbHard', label: 'GBh', align: 'right' },
  { key: 'ldSoft', label: 'LDs', align: 'right' },
  { key: 'ldMedium', label: 'LDm', align: 'right' },
  { key: 'ldHard', label: 'LDh', align: 'right' },
  { key: 'puSoft', label: 'PUs', align: 'right' },
  { key: 'puMedium', label: 'PUm', align: 'right' },
  { key: 'puHard', label: 'PUh', align: 'right' },
  { key: 'fbSoft', label: 'FBs', align: 'right' },
  { key: 'fbMedium', label: 'FBm', align: 'right' },
  { key: 'fbHard', label: 'FBh', align: 'right' },
  { key: 'gbPct', label: 'GB%', align: 'right' },
  { key: 'ldPct', label: 'LD%', align: 'right' },
  { key: 'puPct', label: 'PU%', align: 'right' },
  { key: 'fbPct', label: 'FB%', align: 'right' },
];

const PITCHING_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'games', label: 'G', align: 'right' },
  { key: 'gamesStarted', label: 'GS', align: 'right' },
  { key: 'wins', label: 'W', align: 'right' },
  { key: 'losses', label: 'L', align: 'right' },
  { key: 'saves', label: 'SV', align: 'right' },
  { key: 'saveOpportunities', label: 'SVOP', align: 'right' },
  { key: 'blownSaves', label: 'BS', align: 'right' },
  { key: 'inningsPitched', label: 'IP', align: 'right' },
  { key: 'hitsAllowed', label: 'H', align: 'right' },
  { key: 'runsAllowed', label: 'R', align: 'right' },
  { key: 'earnedRuns', label: 'ER', align: 'right' },
  { key: 'walksAllowed', label: 'BB', align: 'right' },
  { key: 'strikeouts', label: 'SO', align: 'right' },
  { key: 'k9', label: 'K/9', align: 'right' },
  { key: 'bb9', label: 'BB/9', align: 'right' },
  { key: 'h9', label: 'H/9', align: 'right' },
  { key: 'homeRunsAllowed', label: 'HR', align: 'right' },
  { key: 'hitBatters', label: 'HBP', align: 'right' },
  { key: 'wildPitches', label: 'WP', align: 'right' },
  { key: 'balls', label: 'B', align: 'right' },
  { key: 'strikes', label: 'S', align: 'right' },
  { key: 'strikePercentage', label: '%S', align: 'right' },
  { key: 'firstPitchStrikePct', label: 'FPS%', align: 'right' },
  { key: 'qualityStarts', label: 'QS', align: 'right' },
  { key: 'completeGames', label: 'CMP', align: 'right' },
  { key: 'shutouts', label: 'ShO', align: 'right' },
  { key: 'gameScore', label: 'GSc', align: 'right' },
  { key: 'strikeoutsLooking', label: 'Kc', align: 'right' },
  { key: 'strikeoutsSwinging', label: 'Ks', align: 'right' },
  { key: 'groundOuts', label: 'GO', align: 'right' },
  { key: 'flyOuts', label: 'AO', align: 'right' },
  { key: 'goAo', label: 'GO/AO', align: 'right' },
  { key: 'era', label: 'ERA', align: 'right', highlight: true },
  { key: 'whip', label: 'WHIP', align: 'right', highlight: true },
  { key: 'fip', label: 'FIP', align: 'right' },
  { key: 'babip', label: 'BABIP', align: 'right' },
];

const PITCHING_CONTACT_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'bip', label: 'BIP', align: 'right' },
  { key: 'gbSoft', label: 'GBs', align: 'right' },
  { key: 'gbMedium', label: 'GBm', align: 'right' },
  { key: 'gbHard', label: 'GBh', align: 'right' },
  { key: 'ldSoft', label: 'LDs', align: 'right' },
  { key: 'ldMedium', label: 'LDm', align: 'right' },
  { key: 'ldHard', label: 'LDh', align: 'right' },
  { key: 'puSoft', label: 'PUs', align: 'right' },
  { key: 'puMedium', label: 'PUm', align: 'right' },
  { key: 'puHard', label: 'PUh', align: 'right' },
  { key: 'fbSoft', label: 'FBs', align: 'right' },
  { key: 'fbMedium', label: 'FBm', align: 'right' },
  { key: 'fbHard', label: 'FBh', align: 'right' },
  { key: 'gbPct', label: 'GB%', align: 'right' },
  { key: 'ldPct', label: 'LD%', align: 'right' },
  { key: 'puPct', label: 'PU%', align: 'right' },
  { key: 'fbPct', label: 'FB%', align: 'right' },
];

const FIELDING_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'games', label: 'G', align: 'right' },
  { key: 'putouts', label: 'PO', align: 'right' },
  { key: 'assists', label: 'A', align: 'right' },
  { key: 'errors', label: 'E', align: 'right' },
  { key: 'doublePlays', label: 'DP', align: 'right' },
  { key: 'passedBalls', label: 'PB', align: 'right' },
  { key: 'catcherStolenBases', label: 'SB', align: 'right' },
  { key: 'catcherCaughtStealing', label: 'CS', align: 'right' },
  { key: 'sba', label: 'SBA', align: 'right' },
  { key: 'pickoffs', label: 'PK', align: 'right' },
  { key: 'fieldingPct', label: 'FP%', align: 'right', highlight: true },
];

const BATTING_LEADER_CATS = ['battingAvg', 'homeRuns', 'rbi', 'hits', 'stolenBases', 'ops'];
const PITCHING_LEADER_CATS = ['era', 'strikeouts', 'wins', 'whip', 'saves', 'inningsPitched'];

/* ── Helpers ── */

function formatStatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  if (num >= 0 && num < 2 && String(value).includes('.')) {
    return num.toFixed(3).replace(/^0/, '');
  }
  return String(value).includes('.') ? num.toFixed(2) : String(Math.round(num));
}

function TeamLogo({ name, shortName, logoUrl, size = 'sm' }: { name: string; shortName?: string | null; logoUrl?: string | null; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-8 h-8' : 'w-5 h-5';
  const textSize = size === 'md' ? 'text-[10px]' : 'text-[8px]';

  if (logoUrl) {
    return <img src={logoUrl} alt={name} className={`${dim} object-contain rounded`} />;
  }

  const abbr = shortName || (name.length <= 3
    ? name.toUpperCase()
    : name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase());

  return (
    <div className={`${dim} rounded border border-[#ccc] bg-[#e8e8e8] flex items-center justify-center shrink-0`}>
      <span className={`${textSize} font-bold text-[#333]`}>{abbr}</span>
    </div>
  );
}

/* ── Main Component ── */

interface StatsClientProps {
  initialSeasons: Season[];
  initialSeasonId: number | null;
  initialBatting: BattingStat[];
  initialPitching: PitchingStat[];
  initialFielding: FieldingStat[];
  initialBattingLeaders: LeadersData | null;
  initialPitchingLeaders: LeadersData | null;
}

export function StatsClient({
  initialSeasons, initialSeasonId,
  initialBatting, initialPitching, initialFielding,
  initialBattingLeaders, initialPitchingLeaders,
}: StatsClientProps) {
  const enrichBattingRates = (rows: BattingStat[]): BattingStat[] => {
    return rows.map((r) => {
      const ab = Number(r.atBats ?? 0);
      const hits = Number(r.hits ?? 0);
      const tb = Number((r as any).totalBases ?? 0);
      const pa = Number(r.plateAppearances ?? 0);
      const bb = Number(r.walks ?? 0);
      const so = Number(r.strikeouts ?? 0);
      return {
        ...r,
        iso: ab > 0 ? ((tb - hits) / ab).toFixed(3) : null,
        bbPct: pa > 0 ? ((bb / pa) * 100).toFixed(1) : null,
        kPct: pa > 0 ? ((so / pa) * 100).toFixed(1) : null,
      };
    });
  };
  const { openModal, renderModal } = usePlayerModal();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<StatsTab>('batting');
  const [seasons, setSeasons] = useState<Season[]>(initialSeasons);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(initialSeasonId); // null = All time
  const [battingStats, setBattingStats] = useState<BattingStat[]>(enrichBattingRates(initialBatting));
  const [pitchingStats, setPitchingStats] = useState<PitchingStat[]>(initialPitching);
  const [fieldingStats, setFieldingStats] = useState<FieldingStat[]>(
    initialFielding.map((f: any) => ({ ...f, sba: (f.catcherStolenBases || 0) + (f.catcherCaughtStealing || 0) }))
  );
  const [fieldingPosition, setFieldingPosition] = useState<string>('all');
  const [fieldingCategory, setFieldingCategory] = useState<'all' | 'infield' | 'outfield'>('all');
  const [battingCategory, setBattingCategory] = useState<'basic' | 'advanced' | 'hittype'>('basic');
  const [pitchingCategory, setPitchingCategory] = useState<'basic' | 'hittype'>('basic');
  const [battingContactStats, setBattingContactStats] = useState<BattingContactStat[]>([]);
  const [pitchingContactStats, setPitchingContactStats] = useState<PitchingContactStat[]>([]);
  const [fieldingByPosLoading, setFieldingByPosLoading] = useState(false);
  const [battingLeaders, setBattingLeaders] = useState<LeadersData | null>(initialBattingLeaders);
  const [pitchingLeaders, setPitchingLeaders] = useState<LeadersData | null>(initialPitchingLeaders);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<string>('battingAvg');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // Track whether this is the first render (skip initial fetch since data comes from server)
  const isInitialLoad = useRef(true);

  const seasonParam = selectedSeasonId != null ? `seasonId=${selectedSeasonId}` : 'seasonId=all';

  // Re-fetch stats when season changes (but not on first mount — server already provided data)
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    setLoading(true);

    Promise.all([
      fetch(`/api/proxy/public/stats/batting?${seasonParam}`).then(r => r.json()).catch(() => []),
      fetch(`/api/proxy/public/stats/leaders?${seasonParam}`).then(r => r.json()).catch(() => null),
      fetch(`/api/proxy/public/stats/pitching?${seasonParam}`).then(r => r.json()).catch(() => []),
      fetch(`/api/proxy/public/stats/pitching-leaders?${seasonParam}`).then(r => r.json()).catch(() => null),
      fetch(`/api/proxy/public/stats/fielding?${seasonParam}`).then(r => r.json()).catch(() => []),
    ])
      .then(([batting, bLeaders, pitching, pLeaders, fielding]) => {
        setBattingStats(Array.isArray(batting) ? enrichBattingRates(batting) : []);
        setBattingLeaders(bLeaders && typeof bLeaders === 'object' && !Array.isArray(bLeaders) ? bLeaders : null);
        setPitchingStats(Array.isArray(pitching) ? pitching : []);
        setPitchingLeaders(pLeaders && typeof pLeaders === 'object' && !Array.isArray(pLeaders) ? pLeaders : null);
        setFieldingStats(Array.isArray(fielding) ? fielding.map((f: any) => ({
          ...f,
          sba: (f.catcherStolenBases || 0) + (f.catcherCaughtStealing || 0),
        })) : []);
      })
      .finally(() => setLoading(false));
  }, [seasonParam]);

  // Fetch fielding stats by position/category when filter changes
  useEffect(() => {
    if (tab !== 'fielding') return;
    const mapSba = (data: any[]) => Array.isArray(data) ? data.map((f: any) => ({
      ...f,
      sba: (f.catcherStolenBases || 0) + (f.catcherCaughtStealing || 0),
    })) : [];
    if (fieldingCategory === 'infield' || fieldingCategory === 'outfield') {
      setFieldingByPosLoading(true);
      fetch(`/api/proxy/public/stats/fielding-by-position?${seasonParam}&category=${fieldingCategory}`)
        .then(r => r.json())
        .then(data => setFieldingStats(mapSba(data)))
        .catch(() => setFieldingStats([]))
        .finally(() => setFieldingByPosLoading(false));
      return;
    }
    if (fieldingPosition === 'all') {
      setFieldingByPosLoading(true);
      fetch(`/api/proxy/public/stats/fielding?${seasonParam}`)
        .then(r => r.json())
        .then(data => setFieldingStats(mapSba(data)))
        .catch(() => setFieldingStats([]))
        .finally(() => setFieldingByPosLoading(false));
      return;
    }
    setFieldingByPosLoading(true);
    fetch(`/api/proxy/public/stats/fielding-by-position?${seasonParam}&position=${fieldingPosition}`)
      .then(r => r.json())
      .then(data => setFieldingStats(mapSba(data)))
      .catch(() => setFieldingStats([]))
      .finally(() => setFieldingByPosLoading(false));
  }, [fieldingPosition, fieldingCategory, seasonParam, tab]);

  // Fetch batting/pitching contact when Hit type view is selected
  useEffect(() => {
    if (tab === 'batting' && battingCategory === 'hittype') {
      fetch(`/api/proxy/public/stats/batting-contact?${seasonParam}`)
        .then(r => r.json())
        .then((data: BattingContactStat[]) => {
          const withPct = (Array.isArray(data) ? data : []).map(row => {
            const bip = row.bip ?? 0;
            const gb = (row.gbSoft ?? 0) + (row.gbMedium ?? 0) + (row.gbHard ?? 0);
            const ld = (row.ldSoft ?? 0) + (row.ldMedium ?? 0) + (row.ldHard ?? 0);
            const pu = (row.puSoft ?? 0) + (row.puMedium ?? 0) + (row.puHard ?? 0);
            const fb = (row.fbSoft ?? 0) + (row.fbMedium ?? 0) + (row.fbHard ?? 0);
            return {
              ...row,
              gbPct: bip > 0 ? (gb / bip).toFixed(3) : null,
              ldPct: bip > 0 ? (ld / bip).toFixed(3) : null,
              puPct: bip > 0 ? (pu / bip).toFixed(3) : null,
              fbPct: bip > 0 ? (fb / bip).toFixed(3) : null,
            };
          });
          setBattingContactStats(withPct);
        })
        .catch(() => setBattingContactStats([]));
    }
    if (tab === 'pitching' && pitchingCategory === 'hittype') {
      fetch(`/api/proxy/public/stats/pitching-contact?${seasonParam}`)
        .then(r => r.json())
        .then((data: PitchingContactStat[]) => {
          const withPct = (Array.isArray(data) ? data : []).map(row => {
            const bip = row.bip ?? 0;
            const gb = (row.gbSoft ?? 0) + (row.gbMedium ?? 0) + (row.gbHard ?? 0);
            const ld = (row.ldSoft ?? 0) + (row.ldMedium ?? 0) + (row.ldHard ?? 0);
            const pu = (row.puSoft ?? 0) + (row.puMedium ?? 0) + (row.puHard ?? 0);
            const fb = (row.fbSoft ?? 0) + (row.fbMedium ?? 0) + (row.fbHard ?? 0);
            return {
              ...row,
              gbPct: bip > 0 ? (gb / bip).toFixed(3) : null,
              ldPct: bip > 0 ? (ld / bip).toFixed(3) : null,
              puPct: bip > 0 ? (pu / bip).toFixed(3) : null,
              fbPct: bip > 0 ? (fb / bip).toFixed(3) : null,
            };
          });
          setPitchingContactStats(withPct);
        })
        .catch(() => setPitchingContactStats([]));
    }
  }, [tab, battingCategory, pitchingCategory, seasonParam]);

  // Reset fielding position/category when season changes
  useEffect(() => {
    setFieldingPosition('all');
    setFieldingCategory('all');
  }, [selectedSeasonId]);

  // Reset sort when tab or category changes
  useEffect(() => {
    if (tab === 'batting') {
      setSortKey(battingCategory === 'hittype' ? 'bip' : 'battingAvg');
      setSortDir(battingCategory === 'hittype' ? 'desc' : 'desc');
    } else if (tab === 'pitching') {
      setSortKey(pitchingCategory === 'hittype' ? 'bip' : 'era');
      setSortDir(pitchingCategory === 'hittype' ? 'desc' : 'asc');
    } else {
      setSortKey('fieldingPct');
      setSortDir('desc');
    }
  }, [tab, battingCategory, pitchingCategory]);

  // Sort logic
  const handleSort = useCallback((key: string) => {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      // ERA and WHIP: lower is better so default to asc
      const lowerIsBetter = ['era', 'whip', 'walkRate'];
      const textCols = ['name', 'teamName'];
      if (textCols.includes(key)) {
        setSortDir('asc');
      } else if (lowerIsBetter.includes(key)) {
        setSortDir('asc');
      } else {
        setSortDir('desc');
      }
    }
  }, [sortKey]);

  const sortedBatting = useMemo(() => sortData(battingStats, sortKey, sortDir), [battingStats, sortKey, sortDir]);
  const sortedPitching = useMemo(() => sortData(pitchingStats, sortKey, sortDir), [pitchingStats, sortKey, sortDir]);
  const sortedFielding = useMemo(() => sortData(fieldingStats, sortKey, sortDir), [fieldingStats, sortKey, sortDir]);
  const sortedBattingContact = useMemo(() => sortData(battingContactStats, sortKey, sortDir), [battingContactStats, sortKey, sortDir]);
  const sortedPitchingContact = useMemo(() => sortData(pitchingContactStats, sortKey, sortDir), [pitchingContactStats, sortKey, sortDir]);

  const currentColumns = tab === 'batting'
    ? (battingCategory === 'advanced' ? BATTING_ADVANCED_COLUMNS : battingCategory === 'hittype' ? BATTING_CONTACT_COLUMNS : BATTING_COLUMNS)
    : tab === 'pitching'
      ? (pitchingCategory === 'hittype' ? PITCHING_CONTACT_COLUMNS : PITCHING_COLUMNS)
      : FIELDING_COLUMNS;
  const displayColumns = selectedSeasonId == null
    ? currentColumns.filter(col => col.key !== 'teamName')
    : currentColumns;
  const currentData = tab === 'batting'
    ? (battingCategory === 'hittype' ? sortedBattingContact : sortedBatting)
    : tab === 'pitching'
      ? (pitchingCategory === 'hittype' ? sortedPitchingContact : sortedPitching)
      : sortedFielding;
  const currentLeaders = tab === 'batting' ? battingLeaders : tab === 'pitching' ? pitchingLeaders : null;
  const currentLeaderCats = tab === 'batting' ? BATTING_LEADER_CATS : PITCHING_LEADER_CATS;
  const hasData = tab === 'batting'
    ? (battingCategory === 'hittype' ? battingContactStats.length > 0 : battingStats.length > 0)
    : tab === 'pitching'
      ? (pitchingCategory === 'hittype' ? pitchingContactStats.length > 0 : pitchingStats.length > 0)
      : fieldingStats.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        {/* Tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden bg-surface-alt">
          <button
            onClick={() => setTab('batting')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              tab === 'batting'
                ? 'bg-[#136cb2] text-white'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            Batting
          </button>
          <button
            onClick={() => setTab('pitching')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              tab === 'pitching'
                ? 'bg-[#136cb2] text-white'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            Pitching
          </button>
          <button
            onClick={() => setTab('fielding')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              tab === 'fielding'
                ? 'bg-[#136cb2] text-white'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            Fielding
          </button>
        </div>

        {/* Season + category + Legend */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted">Season:</label>
            <select
              value={selectedSeasonId ?? 'all'}
              onChange={(e) => {
                const v = e.target.value;
                const newId = v === 'all' ? null : Number(v);
                setSelectedSeasonId(newId);
                const q = newId == null ? 'all' : String(newId);
                router.replace(`${pathname}?season=${q}`, { scroll: false });
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="all">All time</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {tab === 'batting' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-muted">View:</label>
              <select
                value={battingCategory}
                onChange={(e) => setBattingCategory(e.target.value as 'basic' | 'advanced' | 'hittype')}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
                title="Basic = full counting stats; Advanced = rate stats (AVG, OBP, SLG, OPS, RC, GPA, BABIP)"
              >
                <option value="basic">Basic (full stats)</option>
                <option value="advanced">Advanced (rates &amp; RC, GPA, BABIP)</option>
                <option value="hittype">Hit type &amp; power</option>
              </select>
            </div>
          )}
          {tab === 'pitching' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-muted">View:</label>
              <select
                value={pitchingCategory}
                onChange={(e) => setPitchingCategory(e.target.value as 'basic' | 'hittype')}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                <option value="basic">Basic</option>
                <option value="hittype">Hit type &amp; power</option>
              </select>
            </div>
          )}
          {tab === 'fielding' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-muted">View:</label>
              <select
                value={fieldingCategory}
                onChange={(e) => setFieldingCategory(e.target.value as 'all' | 'infield' | 'outfield')}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                <option value="all">All positions</option>
                <option value="infield">Infield (P, C, 1B, 2B, 3B, SS)</option>
                <option value="outfield">Outfield (LF, CF, RF)</option>
              </select>
            </div>
          )}
          <Link
            href="/stats/legend"
            className="text-sm font-medium text-accent hover:text-accent-light transition-colors"
          >
            Legend
          </Link>
          <Link
            href="/stats/hit-locations"
            className="text-sm font-medium text-accent hover:text-accent-light transition-colors"
          >
            Team hit locations
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasData && !currentLeaders ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-alt p-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.05] flex items-center justify-center">
            <svg className="w-8 h-8 text-text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-text-muted text-lg font-medium">
            No {tab} statistics available yet
          </p>
          <p className="text-text-faint text-sm mt-2">
            Stats will appear here once games are played and recorded.
          </p>
        </div>
      ) : (
        <>
          {/* ── Leaders (hidden for Hit type & power view) ── */}
          {currentLeaders && Object.keys(currentLeaders).length > 0 && (tab !== 'batting' || battingCategory !== 'hittype') && (tab !== 'pitching' || pitchingCategory !== 'hittype') && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-6 rounded-full bg-accent" />
                <h2 className="font-heading text-xl font-bold tracking-tight">
                  {tab === 'batting' ? 'Batting' : tab === 'pitching' ? 'Pitching' : 'Fielding'} Leaders
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentLeaderCats.map(catKey => {
                  const cat = currentLeaders[catKey];
                  if (!cat || cat.players.length === 0) return null;
                  const leader = cat.players[0];
                  const runnersUp = cat.players.slice(1, 5);

                  return (
                    <div
                      key={catKey}
                      className="rounded-xl border border-border bg-surface overflow-hidden hover:border-accent/20 transition-colors"
                    >
                      <div className="px-4 py-2.5 bg-surface-alt border-b border-border">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          {cat.label}
                        </h3>
                      </div>

                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-gold">1</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {selectedSeasonId != null && (
                              <TeamLogo
                                name={leader.teamName}
                                shortName={leader.teamShortName}
                                logoUrl={leader.teamLogoUrl}
                                size="sm"
                              />
                            )}
                            <span className="font-semibold text-sm truncate">
                              {leader.firstName} {leader.lastName}
                            </span>
                          </div>
                          {selectedSeasonId != null && (
                            <span className="text-[11px] text-text-faint">{leader.teamName}</span>
                          )}
                        </div>
                        <span className="font-heading text-xl font-bold stat-value shrink-0">
                          {formatStatValue(leader.value)}
                        </span>
                      </div>

                      {runnersUp.length > 0 && (
                        <div className="border-t border-border divide-y divide-border/50">
                          {runnersUp.map((player, idx) => (
                            <div key={player.playerId} className="px-4 py-2 flex items-center gap-3 hover:bg-surface-alt/50 transition-colors">
                              <span className="text-[11px] font-bold text-text-faint w-5 text-center shrink-0">
                                {idx + 2}
                              </span>
                              {selectedSeasonId != null && (
                                <TeamLogo
                                  name={player.teamName}
                                  shortName={player.teamShortName}
                                  logoUrl={player.teamLogoUrl}
                                  size="sm"
                                />
                              )}
                              <span className="text-sm truncate flex-1">
                                {player.firstName} {player.lastName}
                              </span>
                              <span className="text-sm font-mono font-semibold text-text-muted shrink-0">
                                {formatStatValue(player.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Stats Table ── */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full bg-accent" />
                <h2 className="font-heading text-xl font-bold tracking-tight">
                  {tab === 'batting' ? 'Batting' : tab === 'pitching' ? 'Pitching' : 'Fielding'} Statistics
                </h2>
                <span className="text-[11px] font-medium text-text-faint bg-surface-alt px-2 py-0.5 rounded">
                  {currentData.length} players
                </span>
              </div>

              {/* Position filter for fielding (only when View = All positions) */}
              {tab === 'fielding' && fieldingCategory === 'all' && (
                <div className="flex items-center gap-1 sm:ml-auto">
                  <span className="text-[10px] font-medium text-text-faint mr-1.5">Position:</span>
                  <div className="flex rounded-lg border border-border overflow-hidden bg-surface-alt">
                    {POSITION_FILTERS.map(pf => (
                      <button
                        key={pf.value}
                        onClick={() => setFieldingPosition(pf.value)}
                        className={`px-2 py-1 text-[11px] font-semibold transition-colors ${
                          fieldingPosition === pf.value
                            ? 'bg-[#136cb2] text-white'
                            : 'text-text-muted hover:text-text hover:bg-surface'
                        }`}
                      >
                        {pf.label}
                      </button>
                    ))}
                  </div>
                  {fieldingByPosLoading && (
                    <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin ml-2" />
                  )}
                </div>
              )}
              {tab === 'fielding' && fieldingCategory !== 'all' && fieldingByPosLoading && (
                <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin ml-2" />
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
              <HorizontalScrollArea>
                <table className="min-w-full w-max text-[13px] leading-snug whitespace-nowrap border-separate border-spacing-0">
                  <thead>
                    <tr className="sticky top-0 z-20 border-b border-border bg-[#e6e9ee] shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.06)]">
                      <th className="px-2.5 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-text-muted w-10">
                        #
                      </th>
                      {displayColumns.map(col => (
                        (() => {
                          const meaning = getStatAbbreviationMeaning(col.label);
                          return (
                        <th
                          key={col.key}
                          title={meaning ?? undefined}
                          className={`px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-accent ${
                            col.align === 'left' ? 'text-left' : 'text-right'
                          } ${sortKey === col.key ? 'text-accent' : 'text-text-muted'} ${
                            col.sticky ? 'sticky left-0 top-0 z-30 bg-[#e6e9ee] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]' : ''
                          }`}
                          onClick={() => handleSort(col.key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {sortKey === col.key && (
                              <svg className={`w-3 h-3 ${sortDir === 'asc' ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                              </svg>
                            )}
                          </span>
                        </th>
                          );
                        })()
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.map((stat: any, idx: number) => (
                      <tr
                        key={stat.playerId}
                        className="group border-b border-border/40 last:border-0 transition-colors odd:bg-white even:bg-[#f7f8fa] hover:bg-[#eef2f7]"
                      >
                        <td className="px-2.5 py-2 text-center text-[12px] tabular-nums text-text-muted">
                          {idx + 1}
                        </td>
                        {displayColumns.map(col => {
                          let cellValue: React.ReactNode;

                          if (col.key === 'name') {
                            cellValue = (
                              <div className="flex items-center gap-2">
                                {selectedSeasonId != null && (
                                  <TeamLogo
                                    name={stat.teamName}
                                    shortName={stat.teamShortName}
                                    logoUrl={stat.teamLogoUrl}
                                    size="sm"
                                  />
                                )}
                                <button
                                  onClick={() => {
                                    const modalSlug = stat.playerSlug || stat.slug || null;
                                    if (!modalSlug) return;
                                    openModal(modalSlug, stat.firstName, stat.lastName);
                                  }}
                                  className="font-semibold text-[#111] hover:text-[#136cb2] hover:underline transition-colors text-left"
                                >
                                  {stat.firstName} {stat.lastName}
                                </button>
                              </div>
                            );
                          } else if (col.key === 'teamName') {
                            cellValue = (
                              <span className="text-text-muted">{stat.teamShortName || stat.teamName}</span>
                            );
                          } else {
                            const raw = stat[col.key];
                            cellValue = (
                              <span
                                className={`tabular-nums tracking-tight ${
                                  col.highlight ? 'font-semibold text-text stat-value' : 'text-text-muted'
                                }`}
                              >
                                {formatStatValue(raw)}
                              </span>
                            );
                          }

                          return (
                            <td
                              key={col.key}
                              className={`px-2.5 py-2 ${
                                col.align === 'left' ? 'text-left' : 'text-right'
                              } ${
                                col.sticky
                                  ? 'sticky left-0 z-10 bg-white shadow-[2px_0_8px_-3px_rgba(0,0,0,0.07)] group-even:bg-[#f7f8fa] group-hover:bg-[#eef2f7]'
                                  : ''
                              }`}
                            >
                              {cellValue}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {currentData.length === 0 && (
                      <tr>
                        <td colSpan={displayColumns.length + 1} className="px-4 py-12 text-center text-text-muted">
                          {currentLeaders && Object.keys(currentLeaders).length > 0 ? (
                            <span>
                              No {tab} table data for this season. Leaders above use the same source — try refreshing the page.
                              {tab === 'batting' && ' If you added new stat columns recently, run the backfill script (see docs) to recompute existing games.'}
                            </span>
                          ) : (
                            `No ${tab} data available for this season.`
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </HorizontalScrollArea>
            </div>

          </section>
        </>
      )}

      {/* Player modal */}
      {renderModal()}
    </div>
  );
}

/* ── Sort utility ── */

function sortData<T extends { firstName: string; lastName: string; teamName: string }>(
  data: T[],
  sortKey: string,
  sortDir: SortDirection
): T[] {
  const parseBaseballInnings = (value: any): number => {
    if (value == null || value === '') return sortDir === 'asc' ? Infinity : -Infinity;
    const s = String(value).trim();
    const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
    if (m) {
      const inn = parseInt(m[1] || '0', 10);
      const fracRaw = m[2] ?? '';
      if (fracRaw.length === 0) return inn;
      const outsDigit = parseInt(fracRaw[0] || '0', 10);
      if (!Number.isNaN(outsDigit) && outsDigit >= 0 && outsDigit <= 2) return inn + outsDigit / 3;
    }
    const n = parseFloat(s);
    return Number.isNaN(n) ? (sortDir === 'asc' ? Infinity : -Infinity) : n;
  };

  const sorted = [...data];
  sorted.sort((a, b) => {
    let aVal: any;
    let bVal: any;

    if (sortKey === 'name') {
      aVal = `${(a as any).lastName} ${(a as any).firstName}`;
      bVal = `${(b as any).lastName} ${(b as any).firstName}`;
    } else if (sortKey === 'teamName') {
      aVal = (a as any).teamName;
      bVal = (b as any).teamName;
    } else {
      aVal = (a as any)[sortKey];
      bVal = (b as any)[sortKey];
      if (sortKey === 'inningsPitched' || sortKey === 'innings') {
        aVal = parseBaseballInnings(aVal);
        bVal = parseBaseballInnings(bVal);
      } else {
      const missingSentinel = sortDir === 'asc' ? Infinity : -Infinity;
      aVal = aVal !== null && aVal !== undefined ? parseFloat(String(aVal)) : missingSentinel;
      bVal = bVal !== null && bVal !== undefined ? parseFloat(String(bVal)) : missingSentinel;
      }
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });
  return sorted;
}
