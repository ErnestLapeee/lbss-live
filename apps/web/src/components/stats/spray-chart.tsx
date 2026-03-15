'use client';

interface SprayChartHit {
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
}

const HIT_EVENTS = new Set([
  'single', 'bunt_single', 'double', 'ground_rule_double',
  'triple', 'home_run', 'inside_park_hr',
]);

const ERROR_EVENTS = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

function getDotColor(hit: SprayChartHit): string {
  if (HIT_EVENTS.has(hit.eventType)) return '#22c55e'; // green = hit
  if (ERROR_EVENTS.has(hit.eventType)) return '#3b82f6'; // blue = error
  return '#ef4444'; // red = out
}

function getDotShape(hit: SprayChartHit): 'circle' | 'square' | 'diamond' {
  if (hit.hitType === 'grounder') return 'square';
  if (hit.hitType === 'line_drive') return 'diamond';
  return 'circle'; // fly_ball, pop_up, or null
}

function getDotSize(hit: SprayChartHit): number {
  if (hit.hitHardness === 'hard') return 5;
  if (hit.hitHardness === 'soft') return 3;
  return 4;
}

export function SprayChart({ hits, width = 300, height = 200 }: SprayChartProps) {
  if (hits.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-text-muted py-8">
        No hit location data available
      </div>
    );
  }

  return (
    <div>
      <svg viewBox="0 0 300 200" width={width} height={height} className="w-full max-w-md mx-auto">
        <defs>
          <radialGradient id="sprayGrad" cx="50%" cy="90%" r="65%">
            <stop offset="0%" stopColor="#1a4d2e" />
            <stop offset="100%" stopColor="#0f2e1a" />
          </radialGradient>
        </defs>
        {/* Simple, clean field layout */}
        {/* Outfield arc */}
        <path d="M 30,110 Q 150,20 270,110 L 210,150 L 150,85 L 90,150 Z" fill="url(#sprayGrad)" />
        {/* Warning track */}
        <path d="M 42,110 Q 150,32 258,110 L 210,145 L 150,92 L 90,145 Z" fill="rgba(0,0,0,0.08)" />
        {/* Infield dirt (square rotated 45°) */}
        <polygon points="150,85 215,150 150,190 85,150" fill="#c89a5b" opacity="0.9" />
        {/* Baselines */}
        <line x1="150" y1="190" x2="215" y2="150" stroke="#ffffff" strokeWidth="1" />
        <line x1="150" y1="190" x2="85" y2="150" stroke="#ffffff" strokeWidth="1" />
        <line x1="85" y1="150" x2="150" y2="85" stroke="#ffffff" strokeWidth="1" />
        <line x1="215" y1="150" x2="150" y2="85" stroke="#ffffff" strokeWidth="1" />
        {/* Foul lines */}
        <line x1="150" y1="190" x2="30" y2="110" stroke="#ffffff" strokeWidth="1" />
        <line x1="150" y1="190" x2="270" y2="110" stroke="#ffffff" strokeWidth="1" />

        {/* Hit markers only (no trajectory lines) */}
        {hits.map((hit, i) => {
          const color = getDotColor(hit);
          const shape = getDotShape(hit);
          const size = getDotSize(hit);

          return (
            <g key={i}>
              {shape === 'square' && (
                <rect
                  x={hit.hitLocationX - size}
                  y={hit.hitLocationY - size}
                  width={size * 2}
                  height={size * 2}
                  fill={color}
                  opacity="0.9"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth="0.5"
                />
              )}
              {shape === 'diamond' && (
                <rect
                  x={hit.hitLocationX - size}
                  y={hit.hitLocationY - size}
                  width={size * 2}
                  height={size * 2}
                  fill={color}
                  opacity="0.9"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth="0.5"
                  transform={`rotate(45 ${hit.hitLocationX} ${hit.hitLocationY})`}
                />
              )}
              {shape === 'circle' && (
                <circle
                  cx={hit.hitLocationX}
                  cy={hit.hitLocationY}
                  r={size}
                  fill={color}
                  opacity="0.9"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth="0.5"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-2 text-[9px] text-text-faint">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" /> Hit
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> Out
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" /> Error
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 bg-white/40 rounded-full" /> Fly
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 bg-white/40" /> Ground
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 bg-white/40 rotate-45" /> Line
        </span>
      </div>
    </div>
  );
}
