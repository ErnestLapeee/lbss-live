'use client';

export interface SprayChartHit {
  hitLocationX: number;
  hitLocationY: number;
  hitType: string | null;
  hitHardness: string | null;
  eventType: string;
  isOut: boolean;
}

interface SprayChartProps {
  hits: SprayChartHit[];
  width?: number;
  height?: number;
  compact?: boolean;
  showLegend?: boolean;
}

const HIT_EVENTS = new Set([
  'single', 'bunt_single', 'double', 'ground_rule_double',
  'triple', 'home_run', 'inside_park_hr',
]);

const ERROR_EVENTS = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

function getDotColor(hit: SprayChartHit): string {
  if (HIT_EVENTS.has(hit.eventType)) return '#22c55e';
  if (ERROR_EVENTS.has(hit.eventType)) return '#3b82f6';
  return '#ef4444';
}

function getDotShape(hit: SprayChartHit): 'circle' | 'square' | 'diamond' {
  if (hit.hitType === 'grounder') return 'square';
  if (hit.hitType === 'line_drive') return 'diamond';
  return 'circle';
}

function getDotSize(hit: SprayChartHit, compact: boolean): number {
  const base = compact ? 1.55 : 2.05;
  if (hit.hitHardness === 'hard') return base + 0.45;
  if (hit.hitHardness === 'soft') return Math.max(1.1, base - 0.45);
  return base;
}

export function SprayChart({ hits, width = 720, height = 480, compact = false, showLegend = true }: SprayChartProps) {
  if (hits.length === 0 && !compact) {
    return (
      <div className="flex items-center justify-center text-sm text-[#999] py-8">
        No hit location data
      </div>
    );
  }

  const hitsCount = hits.filter((hit) => HIT_EVENTS.has(hit.eventType)).length;
  const outsCount = hits.filter((hit) => !HIT_EVENTS.has(hit.eventType) && !ERROR_EVENTS.has(hit.eventType)).length;
  const errorsCount = hits.filter((hit) => ERROR_EVENTS.has(hit.eventType)).length;

  return (
    <div>
      <svg
        viewBox="0 0 300 200"
        width={width}
        height={height}
        className="h-auto w-full max-w-4xl mx-auto overflow-hidden rounded-2xl border border-border/70 bg-white"
      >
        <rect width="300" height="200" fill="#f8fafc" />
        {/* Outfield grass */}
        <path d="M 45,78 Q 150,-20 255,78 L 202,130 L 150,78 L 98,130 Z" fill="#3fa45f" />
        <path d="M 64,86 Q 150,6 236,86" fill="none" stroke="#2f8a50" strokeWidth="1" opacity="0.45" />
        <path d="M 82,96 Q 150,30 218,96" fill="none" stroke="#2f8a50" strokeWidth="1" opacity="0.35" />
        <path d="M 102,108 Q 150,54 198,108" fill="none" stroke="#2f8a50" strokeWidth="1" opacity="0.3" />
        {/* Infield dirt diamond */}
        <polygon points="150,78 202,130 150,182 98,130" fill="#c98545" />
        <path d="M 150,182 Q 150,138 150,78" stroke="#9b6634" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.45" />
        {/* Grass cutout */}
        <circle cx="150" cy="130" r="10" fill="#3fa45f" />
        {/* Mound rubber */}
        <rect x="147" y="129" width="6" height="2" rx="1" fill="#f8fafc" opacity="0.75" />
        {/* Baselines */}
        <line x1="150" y1="182" x2="202" y2="130" stroke="#f8fafc" strokeWidth="0.9" opacity="0.8" />
        <line x1="150" y1="182" x2="98" y2="130" stroke="#f8fafc" strokeWidth="0.9" opacity="0.8" />
        <line x1="98" y1="130" x2="150" y2="78" stroke="#f8fafc" strokeWidth="0.9" opacity="0.65" />
        <line x1="202" y1="130" x2="150" y2="78" stroke="#f8fafc" strokeWidth="0.9" opacity="0.65" />
        {/* Foul lines */}
        <line x1="150" y1="182" x2="45" y2="78" stroke="#64748b" strokeWidth="0.7" opacity="0.25" />
        <line x1="150" y1="182" x2="255" y2="78" stroke="#64748b" strokeWidth="0.7" opacity="0.25" />
        {/* Fence arc */}
        <path d="M 46,77 Q 150,-18 254,77" fill="none" stroke="#64748b" strokeWidth="2" opacity="0.16" />
        {/* Bases */}
        <rect x="147" y="76" width="6" height="6" rx="0.5" transform="rotate(45 150 79)" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.5" />
        <rect x="199" y="128" width="6" height="6" rx="0.5" transform="rotate(45 202 131)" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.5" />
        <rect x="95" y="128" width="6" height="6" rx="0.5" transform="rotate(45 98 131)" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.5" />
        {/* Home plate */}
        <polygon points="150,180 147,184 150,188 153,184" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.5" />
        <line x1="145" y1="181" x2="137" y2="190" stroke="#64748b" strokeWidth="0.6" opacity="0.24" />
        <line x1="155" y1="181" x2="163" y2="190" stroke="#64748b" strokeWidth="0.6" opacity="0.24" />

        {hits.map((hit, i) => {
          const color = getDotColor(hit);
          const shape = getDotShape(hit);
          const size = getDotSize(hit, compact);

          if (shape === 'square') {
            return (
              <rect key={i}
                x={hit.hitLocationX - size} y={hit.hitLocationY - size}
                width={size * 2} height={size * 2}
                fill={color} opacity="0.82"
                stroke="#0f172a" strokeWidth="0.28"
              />
            );
          }
          if (shape === 'diamond') {
            return (
              <rect key={i}
                x={hit.hitLocationX - size} y={hit.hitLocationY - size}
                width={size * 2} height={size * 2}
                fill={color} opacity="0.82"
                stroke="#0f172a" strokeWidth="0.28"
                transform={`rotate(45 ${hit.hitLocationX} ${hit.hitLocationY})`}
              />
            );
          }
          return (
            <circle key={i}
              cx={hit.hitLocationX} cy={hit.hitLocationY}
              r={size} fill={color} opacity="0.82"
              stroke="#0f172a" strokeWidth="0.28"
            />
          );
        })}
      </svg>

      {showLegend && !compact && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Hit ({hitsCount})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Out ({outsCount})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Error ({errorsCount})</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#888]" /> Fly</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 bg-[#888]" /> Ground</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 bg-[#888] rotate-45" /> Line</span>
        </div>
      )}
    </div>
  );
}
