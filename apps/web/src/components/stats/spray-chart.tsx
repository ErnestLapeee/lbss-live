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

/** Field colors — aligned with site palette, not slate dashboard tones */
const GRASS = '#4a9e5c';
const GRASS_DARK = '#3d8a4f';
const DIRT = '#c4a574';
const DIRT_EDGE = '#a68455';
const LINE = 'rgba(255,255,255,0.85)';
const FOUL = 'rgba(0,0,0,0.12)';
const CHART_BG = '#f0f0f0';

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
      <div className="flex items-center justify-center py-8 text-sm text-text-muted">
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
        className="mx-auto h-auto w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-surface"
        role="img"
        aria-label="Hit spray chart on a baseball field"
      >
        <rect width="300" height="200" fill={CHART_BG} />

        {/* Outfield grass (fan from home through the fence) */}
        <path
          d="M 150,184 L 42,76 Q 150,8 258,76 Z"
          fill={GRASS}
        />
        {/* Single depth arc — fence hint */}
        <path
          d="M 52,74 Q 150,14 248,74"
          fill="none"
          stroke={GRASS_DARK}
          strokeWidth="1.2"
          opacity="0.5"
        />

        {/* Foul lines (home → outfield corners only) */}
        <line x1="150" y1="184" x2="42" y2="76" stroke={FOUL} strokeWidth="1" />
        <line x1="150" y1="184" x2="258" y2="76" stroke={FOUL} strokeWidth="1" />

        {/* Infield dirt */}
        <polygon points="150,78 202,130 150,182 98,130" fill={DIRT} stroke={DIRT_EDGE} strokeWidth="0.6" />

        {/* Baselines */}
        <line x1="150" y1="182" x2="202" y2="130" stroke={LINE} strokeWidth="1" />
        <line x1="150" y1="182" x2="98" y2="130" stroke={LINE} strokeWidth="1" />
        <line x1="98" y1="130" x2="150" y2="78" stroke={LINE} strokeWidth="0.9" opacity="0.9" />
        <line x1="202" y1="130" x2="150" y2="78" stroke={LINE} strokeWidth="0.9" opacity="0.9" />

        {/* Pitcher's mound */}
        <circle cx="150" cy="130" r="9" fill={GRASS} stroke={DIRT_EDGE} strokeWidth="0.5" />
        <rect x="147.5" y="129" width="5" height="2" rx="0.5" fill="#fff" opacity="0.9" />

        {/* Bases (diamonds) */}
        <rect x="147" y="75" width="6" height="6" transform="rotate(45 150 78)" fill="#fff" stroke="#ccc" strokeWidth="0.4" />
        <rect x="199" y="127" width="6" height="6" transform="rotate(45 202 130)" fill="#fff" stroke="#ccc" strokeWidth="0.4" />
        <rect x="95" y="127" width="6" height="6" transform="rotate(45 98 130)" fill="#fff" stroke="#ccc" strokeWidth="0.4" />

        {/* Home plate — pentagon pointing toward pitcher (no extra lines behind it) */}
        <polygon
          points="150,178 146,182 147,187 153,187 154,182"
          fill="#fff"
          stroke="#bbb"
          strokeWidth="0.5"
        />

        {hits.map((hit, i) => {
          const color = getDotColor(hit);
          const shape = getDotShape(hit);
          const size = getDotSize(hit, compact);

          if (shape === 'square') {
            return (
              <rect
                key={i}
                x={hit.hitLocationX - size}
                y={hit.hitLocationY - size}
                width={size * 2}
                height={size * 2}
                fill={color}
                opacity="0.88"
                stroke="#111"
                strokeWidth="0.3"
              />
            );
          }
          if (shape === 'diamond') {
            return (
              <rect
                key={i}
                x={hit.hitLocationX - size}
                y={hit.hitLocationY - size}
                width={size * 2}
                height={size * 2}
                fill={color}
                opacity="0.88"
                stroke="#111"
                strokeWidth="0.3"
                transform={`rotate(45 ${hit.hitLocationX} ${hit.hitLocationY})`}
              />
            );
          }
          return (
            <circle
              key={i}
              cx={hit.hitLocationX}
              cy={hit.hitLocationY}
              r={size}
              fill={color}
              opacity="0.88"
              stroke="#111"
              strokeWidth="0.3"
            />
          );
        })}
      </svg>

      {showLegend && !compact && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Hit ({hitsCount})
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Out ({outsCount})
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Error ({errorsCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#888]" /> Fly
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-[#888]" /> Ground
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rotate-45 bg-[#888]" /> Line
          </span>
        </div>
      )}
    </div>
  );
}
