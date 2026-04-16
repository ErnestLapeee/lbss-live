'use client';

import { Fragment } from 'react';
import type { PlayoffSeriesForCard } from './playoff-series-card';
import { PlayoffSeriesCard } from './playoff-series-card';

export type PlayoffBracketRound = {
  roundNumber: number;
  name: string;
  series: PlayoffSeriesForCard[];
};

type PlayoffBracketProps = {
  rounds: PlayoffBracketRound[];
  /** Shown under team names when provided (e.g. regular-season line). */
  recordText?: (teamName: string) => string;
};

/** Safe record line — skip placeholder / empty names. */
function safeRecord(recordText: ((name: string) => string) | undefined, name: string) {
  if (!recordText) return undefined;
  const t = String(name ?? '').trim();
  if (!t || t === 'TBD' || t === '—') return undefined;
  return recordText(t);
}

/** SVG connector between rounds — heights stretch with the row (items-stretch). */
function BracketJoiner({ fromCount, toCount }: { fromCount: number; toCount: number }) {
  if (fromCount === 1 && toCount === 1) {
    return (
      <div className="flex w-9 shrink-0 items-center justify-center md:w-12" aria-hidden>
        <svg
          viewBox="0 0 48 32"
          className="h-8 w-full max-w-[3rem] text-[color:var(--color-accent)] opacity-[0.58] md:max-w-[3.25rem]"
          preserveAspectRatio="xMidYMid meet"
        >
          <path
            d="M2 16 H38"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M34 11 L44 16 L34 21"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (fromCount === 2 && toCount === 1) {
    return (
      <div className="flex w-9 shrink-0 items-stretch py-3 md:w-12" aria-hidden>
        <svg
          viewBox="0 0 48 200"
          className="h-full min-h-[9rem] w-full text-[color:var(--color-accent)] opacity-[0.58]"
          preserveAspectRatio="none"
        >
          <path
            d="M0 50 H20 V100 H48 M0 150 H20 V100"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (fromCount === 4 && toCount === 2) {
    return (
      <div className="flex w-9 shrink-0 items-stretch py-2 md:w-12" aria-hidden>
        <svg
          viewBox="0 0 48 360"
          className="h-full min-h-[16rem] w-full text-[color:var(--color-accent)] opacity-[0.58]"
          preserveAspectRatio="none"
        >
          <path
            d="M0 48 H20 V96 H48 M0 144 H20 V96 M0 216 H20 V264 H48 M0 312 H20 V264"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="flex w-7 shrink-0 items-center justify-center text-[color:var(--color-accent)] opacity-35 md:w-9"
      aria-hidden
    >
      <span className="select-none text-lg font-light">→</span>
    </div>
  );
}

function RoundColumn({
  round,
  recordText,
}: {
  round: PlayoffBracketRound;
  recordText?: (teamName: string) => string;
}) {
  return (
    <div className="flex w-[min(100%,18rem)] shrink-0 flex-col justify-center gap-3 sm:w-[20rem] md:gap-4">
      <div className="text-center">
        <span className="inline-flex items-center justify-center rounded-lg border border-[color:var(--color-accent)]/20 bg-gradient-to-br from-[color:var(--color-accent)]/[0.07] to-transparent px-3.5 py-2 font-heading text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--color-accent)] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]">
          {round.name}
        </span>
      </div>
      <div className="flex flex-col gap-4 md:gap-5">
        {round.series.map((s) => (
          <div
            key={s.id ?? `${round.roundNumber}-${s.label}-${s.higherTeamName}`}
            className="group relative overflow-hidden rounded-xl border border-[color:var(--color-border)]/90 bg-[color:var(--color-surface)] shadow-[0_4px_20px_rgba(0,0,0,0.07),0_0_0_1px_rgba(0,0,0,0.03)_inset] transition-[box-shadow,transform] duration-200 group-hover:-translate-y-px group-hover:shadow-[0_8px_28px_rgba(19,108,178,0.12)]"
          >
            <div
              className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[color:var(--color-accent)] via-[color:var(--color-accent)]/85 to-[color:var(--color-accent)]/60"
              aria-hidden
            />
            <div className="pl-[5px] pr-0.5 py-2 [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 [&>div]:shadow-none [&>div]:ring-0">
              <PlayoffSeriesCard
                series={s}
                recordText={
                  recordText
                    ? (n) => {
                        const line = safeRecord(recordText, n);
                        return line ?? '';
                      }
                    : undefined
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal elimination-style bracket: rounds as columns, SVG joins for common shapes (1→1, 2→1, 4→2).
 */
export function PlayoffBracket({ rounds, recordText }: PlayoffBracketProps) {
  const list = rounds?.filter((r) => (r.series?.length ?? 0) > 0) ?? [];
  if (list.length === 0) return null;

  return (
    <div className="playoff-bracket-wrap relative">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, var(--color-border) 1px, transparent 0)`,
          backgroundSize: '22px 22px',
        }}
        aria-hidden
      />
      <div className="overflow-x-auto overflow-y-visible pb-1 [-webkit-overflow-scrolling:touch]">
        <div className="flex min-w-min flex-row items-stretch justify-center gap-0 px-2 py-3 md:px-4 md:py-5">
          {list.map((round, ri) => (
            <Fragment key={round.roundNumber}>
              <RoundColumn round={round} recordText={recordText} />
              {ri < list.length - 1 ? (
                <BracketJoiner
                  fromCount={round.series.length}
                  toCount={list[ri + 1]!.series.length}
                />
              ) : null}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
