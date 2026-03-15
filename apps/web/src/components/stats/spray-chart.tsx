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
        {/* Outfield – symmetric arc so the field looks straight */}
        <path d="M 20,105 Q 150,10 280,105 L 220,145 L 150,80 L 80,145 Z" fill="url(#sprayGrad)" />
        {/* Infield dirt */}
        <polygon points="150,80 220,145 150,195 80,145" fill="#5a3a1a" opacity="0.7" />
        {/* Baselines */}
        <line x1="150" y1="195" x2="225" y2="145" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
        <line x1="150" y1="195" x2="75" y2="145" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
        <line x1="75" y1="145" x2="150" y2="80" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
        <line x1="225" y1="145" x2="150" y2="80" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
        {/* Foul lines */}
        <line x1="150" y1="195" x2="20" y2="105" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" />
        <line x1="150" y1="195" x2="280" y2="105" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" />
        {/* Guide lines to help see trajectory */}
        {[
          { x2: 150, y2: 20 },
          { x2: 115, y2: 40 },
          { x2: 185, y2: 40 },
          { x2: 100, y2: 65 },
          { x2: 200, y2: 65 },
        ].map((p, idx) => (
          <line
            // key is safe here because this is a fixed list
            // eslint-disable-next-line react/no-array-index-key
            key={idx}
            x1="150"
            y1="195"
            x2={p.x2}
            y2={p.y2}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.5"
          />
        ))}

        {/* Hit trajectories + dots */}
        {hits.map((hit, i) => {
          const color = getDotColor(hit);
          const shape = getDotShape(hit);
          const size = getDotSize(hit);

          // Each batted ball gets a faint line from home plate to its location
          const homeX = 150;
          const homeY = 195;

          return (
            <g key={i}>
              <line
                x1={homeX}
                y1={homeY}
                x2={hit.hitLocationX}
                y2={hit.hitLocationY}
                stroke={color}
                strokeWidth={0.7}
                strokeOpacity={0.35}
              />
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
