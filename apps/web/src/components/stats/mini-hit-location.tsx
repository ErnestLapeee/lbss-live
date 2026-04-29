'use client';

/** Tiny spray-chart dot on the standard 300×200 hit-location SVG space (matches SprayChart). */
export function MiniHitLocation({
  hitLocationX,
  hitLocationY,
}: {
  hitLocationX: number;
  hitLocationY: number;
}) {
  return (
    <svg
      viewBox="0 0 300 200"
      className="h-14 w-[5.25rem] shrink-0 rounded-md border border-slate-200 bg-[#f8fafc]"
      aria-hidden
    >
      <path
        d="M 45,78 Q 150,-20 255,78 L 202,130 L 150,78 L 98,130 Z"
        fill="#3fa45f"
        opacity={0.88}
      />
      <polygon points="150,78 202,130 150,182 98,130" fill="#c98545" opacity={0.92} />
      <circle
        cx={hitLocationX}
        cy={hitLocationY}
        r={5}
        fill="#ef4444"
        stroke="#fff"
        strokeWidth={1.2}
      />
    </svg>
  );
}
