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
        {/* Outfield */}
        <path d="M 10,95 Q 150,-30 290,95 L 220,140 L 150,80 L 80,140 Z" fill="url(#sprayGrad)" />
        {/* Infield dirt */}
        <polygon points="150,80 220,140 150,195 80,140" fill="#5a3a1a" opacity="0.7" />
        {/* Baselines */}
        <line x1="150" y1="195" x2="225" y2="140" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
        <line x1="150" y1="195" x2="75" y2="140" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
        <line x1="75" y1="140" x2="150" y2="80" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
        <line x1="225" y1="140" x2="150" y2="80" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
        {/* Foul lines */}
        <line x1="150" y1="195" x2="10" y2="95" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        <line x1="150" y1="195" x2="290" y2="95" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />

        {/* Hit dots */}
        {hits.map((hit, i) => {
          const color = getDotColor(hit);
          const shape = getDotShape(hit);
          const size = getDotSize(hit);

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
