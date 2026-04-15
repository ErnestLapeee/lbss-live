import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = {
  title: 'Statistics Legend - LBSS',
  description: 'Definitions and formulas for baseball statistics used on LBSS',
};

const BATTING = [
  { abbr: 'G', name: 'Games', desc: 'Games played (batting)' },
  { abbr: 'PA', name: 'Plate Appearances', desc: 'Total plate appearances' },
  { abbr: 'AB', name: 'At Bats', desc: 'Official at bats' },
  { abbr: 'R', name: 'Runs', desc: 'Runs scored' },
  { abbr: 'H', name: 'Hits', desc: 'Total hits' },
  { abbr: '2B', name: 'Doubles', desc: 'Two-base hits' },
  { abbr: '3B', name: 'Triples', desc: 'Three-base hits' },
  { abbr: 'HR', name: 'Home Runs', desc: 'Home runs' },
  { abbr: 'RBI', name: 'Runs Batted In', desc: 'Runs driven in' },
  { abbr: 'BB', name: 'Walks', desc: 'Base on balls' },
  { abbr: 'HBP', name: 'Hit By Pitch', desc: 'Times hit by pitch' },
  { abbr: 'SO', name: 'Strikeouts', desc: 'Total strikeouts' },
  { abbr: 'SB', name: 'Stolen Bases', desc: 'Successful stolen bases' },
  { abbr: 'CS', name: 'Caught Stealing', desc: 'Caught stealing attempts' },
  { abbr: 'AVG', name: 'Batting Average', desc: 'H / AB' },
  { abbr: 'OBP', name: 'On Base Percentage', desc: '(H + BB + HBP) / (AB + BB + HBP + SF)' },
  { abbr: 'SLG', name: 'Slugging Percentage', desc: 'Total Bases / AB' },
  { abbr: 'OPS', name: 'On Base Plus Slugging', desc: 'OBP + SLG' },
  { abbr: 'RC', name: 'Runs Created', desc: '(H + BB) × TB / (AB + BB)' },
  { abbr: 'GPA', name: 'Gross Production Average', desc: '(1.8 × OBP + SLG) / 4' },
  { abbr: 'BABIP', name: 'Batting Avg. on Balls in Play', desc: '(H - HR) / (AB - SO - HR + SF)' },
  { abbr: 'BU', name: 'Bunt Singles', desc: 'Singles on bunt hits' },
  { abbr: 'Kc', name: 'Strikeouts Looking', desc: 'Strikeouts called (looking)' },
  { abbr: 'Ks', name: 'Strikeouts Swinging', desc: 'Strikeouts swinging' },
  { abbr: 'PK', name: 'Picked Off', desc: 'Times picked off base' },
  { abbr: 'FC', name: "Fielder's Choice", desc: 'Reached on fielder\'s choice' },
  { abbr: 'CI', name: 'Catcher Interference', desc: 'Reached on catcher interference' },
  { abbr: 'GDP', name: 'Grounded into Double Play', desc: 'Grounded into double play' },
  { abbr: 'GTP', name: 'Grounded into Triple Play', desc: 'Grounded into triple play' },
];

const PITCHING = [
  { abbr: 'G', name: 'Games', desc: 'Games pitched' },
  { abbr: 'GS', name: 'Games Started', desc: 'Games started as pitcher' },
  { abbr: 'W', name: 'Wins', desc: 'Pitching wins' },
  { abbr: 'L', name: 'Losses', desc: 'Pitching losses' },
  { abbr: 'SV', name: 'Saves', desc: 'Save opportunities converted' },
  { abbr: 'IP', name: 'Innings Pitched', desc: 'Total innings pitched' },
  { abbr: 'H', name: 'Hits', desc: 'Hits allowed' },
  { abbr: 'R', name: 'Runs', desc: 'Runs allowed' },
  { abbr: 'ER', name: 'Earned Runs', desc: 'Earned runs allowed' },
  { abbr: 'BB', name: 'Walks', desc: 'Walks allowed' },
  { abbr: 'SO', name: 'Strikeouts', desc: 'Strikeouts' },
  { abbr: 'HR', name: 'Home Runs', desc: 'Home runs allowed' },
  { abbr: 'HBP', name: 'Hit Batters', desc: 'Batters hit by pitch' },
  { abbr: 'WP', name: 'Wild Pitches', desc: 'Wild pitches' },
  { abbr: 'ERA', name: 'Earned Run Average', desc: '(ER / IP) × 9' },
  { abbr: 'WHIP', name: 'Walks + Hits per IP', desc: '(BB + H) / IP' },
  { abbr: 'FIP', name: 'Fielding Independent Pitching', desc: '3.10 + (13×HR + 3×BB - 2×K) / IP' },
  { abbr: 'K/9', name: 'Strikeouts per 9', desc: '(K / IP) × 9' },
  { abbr: 'BB/9', name: 'Walks per 9', desc: '(BB / IP) × 9' },
  { abbr: 'H/9', name: 'Hits per 9', desc: '(H / IP) × 9' },
  { abbr: 'BABIP', name: 'BABIP Against', desc: 'Batting average on balls in play allowed' },
  { abbr: 'HLD', name: 'Holds', desc: 'Hold (relief appearance preserving lead)' },
  { abbr: 'SVOP', name: 'Save Opportunities', desc: 'Save opportunities' },
  { abbr: 'BS', name: 'Blown Saves', desc: 'Save opportunities blown' },
  { abbr: 'QS', name: 'Quality Starts', desc: 'Start with ≥6 IP and ≤3 ER' },
  { abbr: 'CMP', name: 'Complete Games', desc: 'Complete games pitched' },
  { abbr: 'ShO', name: 'Shutouts', desc: 'Complete game with 0 runs allowed' },
  { abbr: 'GSc', name: 'Game Score', desc: 'Bill James game score (start quality)' },
  { abbr: 'Kc', name: 'Strikeouts Looking', desc: 'Strikeouts called (looking)' },
  { abbr: 'Ks', name: 'Strikeouts Swinging', desc: 'Strikeouts swinging' },
  { abbr: 'GO', name: 'Ground Outs', desc: 'Ground balls turned into outs' },
  { abbr: 'AO', name: 'Air Outs', desc: 'Fly balls and line drives turned into outs' },
  { abbr: 'GO/AO', name: 'Ground Out / Air Out ratio', desc: 'GO ÷ AO' },
];

const FIELDING = [
  { abbr: 'G', name: 'Games', desc: 'Games played (fielding)' },
  { abbr: 'PO', name: 'Putouts', desc: 'Putouts recorded' },
  { abbr: 'A', name: 'Assists', desc: 'Assists' },
  { abbr: 'E', name: 'Errors', desc: 'Errors' },
  { abbr: 'DP', name: 'Double Plays', desc: 'Double plays participated in' },
  { abbr: 'PB', name: 'Passed Balls', desc: 'Passed balls (catcher)' },
  { abbr: 'SB', name: 'Stolen Bases', desc: 'Stolen bases allowed (catcher)' },
  { abbr: 'CS', name: 'Caught Stealing', desc: 'Runners caught stealing (catcher)' },
  { abbr: 'SBA', name: 'Stolen Base Attempts', desc: 'SB + CS' },
  { abbr: 'PK', name: 'Pickoffs', desc: 'Pickoffs' },
  { abbr: 'FP%', name: 'Fielding Percentage', desc: '(PO + A) / (PO + A + E)' },
];

function LegendTable({ title, rows }: { title: string; rows: { abbr: string; name: string; desc: string }[] }) {
  return (
    <section className="mb-10">
      <h2 className="font-heading text-lg font-bold mb-4 flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-accent" />
        {title}
      </h2>
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-alt border-b border-border">
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-text-faint w-20">Abbr.</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-text-faint">Full Name</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-text-faint">Description / Formula</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50">
                <td className="px-4 py-2 font-mono font-semibold text-accent">{r.abbr}</td>
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 text-text-muted">{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LegendPage() {
  return (
    <div>
      <PageHeader title="Statistics Legend" />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <LegendTable title="Batting" rows={BATTING} />
        <LegendTable title="Pitching" rows={PITCHING} />
        <LegendTable title="Fielding" rows={FIELDING} />

        <div className="mt-10 pt-6 border-t border-border">
          <Link
            href="/stats"
            className="text-sm font-medium text-accent hover:text-accent-light transition-colors inline-flex items-center gap-1"
          >
            ← Back to Statistics
          </Link>
        </div>
      </div>
    </div>
  );
}
