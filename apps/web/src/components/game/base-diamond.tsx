interface BaseDiamondProps {
  first?: boolean;
  second?: boolean;
  third?: boolean;
  size?: number;
  className?: string;
}

export function BaseDiamond({ first, second, third, size = 48, className }: BaseDiamondProps) {
  const r = size / 2;
  const baseSize = size * 0.18;
  const offset = size * 0.35;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      {/* Diamond outline */}
      <path
        d={`M ${r} ${size * 0.1} L ${r + offset} ${r} L ${r} ${size * 0.9} L ${r - offset} ${r} Z`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={0.3}
      />
      {/* Second base */}
      <rect
        x={r - baseSize / 2}
        y={size * 0.1 - baseSize / 2}
        width={baseSize}
        height={baseSize}
        transform={`rotate(45 ${r} ${size * 0.1})`}
        fill={second ? '#f59e0b' : 'currentColor'}
        opacity={second ? 1 : 0.2}
      />
      {/* Third base */}
      <rect
        x={r - offset - baseSize / 2}
        y={r - baseSize / 2}
        width={baseSize}
        height={baseSize}
        transform={`rotate(45 ${r - offset} ${r})`}
        fill={third ? '#f59e0b' : 'currentColor'}
        opacity={third ? 1 : 0.2}
      />
      {/* First base */}
      <rect
        x={r + offset - baseSize / 2}
        y={r - baseSize / 2}
        width={baseSize}
        height={baseSize}
        transform={`rotate(45 ${r + offset} ${r})`}
        fill={first ? '#f59e0b' : 'currentColor'}
        opacity={first ? 1 : 0.2}
      />
      {/* Home plate */}
      <polygon
        points={`${r},${size * 0.85} ${r + baseSize * 0.6},${size * 0.9} ${r + baseSize * 0.4},${size * 0.95} ${r - baseSize * 0.4},${size * 0.95} ${r - baseSize * 0.6},${size * 0.9}`}
        fill="currentColor"
        opacity={0.4}
      />
    </svg>
  );
}
