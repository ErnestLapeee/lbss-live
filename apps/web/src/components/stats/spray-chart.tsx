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
  const base = compact ? 3 : 4;
  if (hit.hitHardness === 'hard') return base + 1;
  if (hit.hitHardness === 'soft') return base - 1;
  return base;
}

export function SprayChart({ hits, width = 300, height = 220, compact = false, showLegend = true }: SprayChartProps) {
  if (hits.length === 0 && !compact) {
    return (
      <div className="flex items-center justify-center text-sm text-[#999] py-8">
        No hit location data
      </div>
    );
  }

  const cx = 150, hp = 195;
  const infR = 57;
  const outR = 130;

  return (
    <div>
      <svg viewBox="0 0 300 200" width={width} height={height} className="w-full max-w-md mx-auto bg-black">
        {/* Outfield grass */}
        <path
          d={`M ${cx - outR * Math.sin(Math.PI / 4)},${hp - outR * Math.cos(Math.PI / 4)}
              A ${outR},${outR} 0 0,1 ${cx + outR * Math.sin(Math.PI / 4)},${hp - outR * Math.cos(Math.PI / 4)}
              L ${cx + infR * Math.sin(Math.PI / 4)},${hp - infR * Math.cos(Math.PI / 4)}
              A ${infR},${infR} 0 0,0 ${cx - infR * Math.sin(Math.PI / 4)},${hp - infR * Math.cos(Math.PI / 4)}
              Z`}
          fill="#2c8f3a"
        />
        {/* Infield dirt arc */}
        <path
          d={`M ${cx - infR * 1.6},${hp - infR * 0.2}
              A ${infR * 1.6},${infR * 1.1} 0 0,1 ${cx + infR * 1.6},${hp - infR * 0.2}
              L ${cx + infR * Math.sin(Math.PI / 4)},${hp - infR * Math.cos(Math.PI / 4)}
              L ${cx - infR * Math.sin(Math.PI / 4)},${hp - infR * Math.cos(Math.PI / 4)}
              Z`}
          fill="#d6a365"
        />
        {/* Infield dirt diamond */}
        <polygon
          points={`${cx},${hp} ${cx + infR * Math.sin(Math.PI / 4)},${hp - infR * Math.cos(Math.PI / 4)} ${cx},${hp - infR} ${cx - infR * Math.sin(Math.PI / 4)},${hp - infR * Math.cos(Math.PI / 4)}`}
          fill="#d6a365"
        />
        {/* Infield grass inside diamond */}
        <polygon
          points={`${cx},${hp - infR * 0.4} ${cx + infR * 0.6},${hp - infR * 0.1} ${cx},${hp + infR * 0.2 - infR} ${cx - infR * 0.6},${hp - infR * 0.1}`}
          fill="#2c8f3a"
        />
        {/* Mound / inner circle */}
        <circle cx={cx} cy={hp - infR * 0.6} r={infR * 0.18} fill="#2c8f3a" stroke="#d6a365" strokeWidth={2} />
        {/* Baselines (dirt stripes) */}
        <polygon
          points={`${cx - 3},${hp} ${cx + 3},${hp} ${cx + infR * Math.sin(Math.PI / 4) + 3},${hp - infR * Math.cos(Math.PI / 4) + 1} ${cx + infR * Math.sin(Math.PI / 4) - 3},${hp - infR * Math.cos(Math.PI / 4) - 1}`}
          fill="#e4b978"
        />
        <polygon
          points={`${cx - 3},${hp} ${cx + 3},${hp} ${cx - infR * Math.sin(Math.PI / 4) + 3},${hp - infR * Math.cos(Math.PI / 4) + 1} ${cx - infR * Math.sin(Math.PI / 4) - 3},${hp - infR * Math.cos(Math.PI / 4) - 1}`}
          fill="#e4b978"
        />
        {/* Foul lines in black */}
        <line x1={cx} y1={hp} x2={cx - outR * Math.sin(Math.PI / 4)} y2={hp - outR * Math.cos(Math.PI / 4)} stroke="#111" strokeWidth="2" />
        <line x1={cx} y1={hp} x2={cx + outR * Math.sin(Math.PI / 4)} y2={hp - outR * Math.cos(Math.PI / 4)} stroke="#111" strokeWidth="2" />
        {/* Bases and plate */}
        <rect x={cx - 3} y={hp - 4} width={6} height={6} fill="white" />
        <rect x={cx + infR * Math.sin(Math.PI / 4) - 3} y={hp - infR * Math.cos(Math.PI / 4) - 3} width={6} height={6} fill="white" transform={`rotate(45 ${cx + infR * Math.sin(Math.PI / 4)} ${hp - infR * Math.cos(Math.PI / 4)})`} />
        <rect x={cx - 3} y={hp - infR - 3} width={6} height={6} fill="white" transform={`rotate(45 ${cx} ${hp - infR})`} />
        <rect x={cx - infR * Math.sin(Math.PI / 4) - 3} y={hp - infR * Math.cos(Math.PI / 4) - 3} width={6} height={6} fill="white" transform={`rotate(45 ${cx - infR * Math.sin(Math.PI / 4)} ${hp - infR * Math.cos(Math.PI / 4)})`} />

        {hits.map((hit, i) => {
          const color = getDotColor(hit);
          const shape = getDotShape(hit);
          const size = getDotSize(hit, compact);

          if (shape === 'square') {
            return (
              <rect key={i}
                x={hit.hitLocationX - size} y={hit.hitLocationY - size}
                width={size * 2} height={size * 2}
                fill={color} opacity="0.85"
                stroke="rgba(0,0,0,0.4)" strokeWidth="0.5"
              />
            );
          }
          if (shape === 'diamond') {
            return (
              <rect key={i}
                x={hit.hitLocationX - size} y={hit.hitLocationY - size}
                width={size * 2} height={size * 2}
                fill={color} opacity="0.85"
                stroke="rgba(0,0,0,0.4)" strokeWidth="0.5"
                transform={`rotate(45 ${hit.hitLocationX} ${hit.hitLocationY})`}
              />
            );
          }
          return (
            <circle key={i}
              cx={hit.hitLocationX} cy={hit.hitLocationY}
              r={size} fill={color} opacity="0.85"
              stroke="rgba(0,0,0,0.4)" strokeWidth="0.5"
            />
          );
        })}
      </svg>

      {showLegend && !compact && (
        <div className="flex items-center justify-center gap-3 mt-2 text-[9px] text-[#888]">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" /> Hit</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> Out</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" /> Error</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 bg-[#888] rounded-full" /> Fly</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 bg-[#888]" /> Ground</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 bg-[#888] rotate-45" /> Line</span>
        </div>
      )}
    </div>
  );
}
