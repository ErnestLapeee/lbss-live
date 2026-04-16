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
          className="h-8 w-full max-w-[3rem] text-sky-600 opacity-80 md:max-w-[3.25rem]"
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
          className="h-full min-h-[9rem] w-full text-sky-600 opacity-80"
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
          className="h-full min-h-[16rem] w-full text-sky-600 opacity-80"
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
      className="flex w-7 shrink-0 items-center justify-center text-sky-500/70 md:w-9"
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
    <div className="flex w-[min(100%,19rem)] shrink-0 flex-col justify-center gap-4 sm:w-[21rem] md:gap-5">
      <div className="flex flex-col items-center text-center">
        <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">
          Round {round.roundNumber}
        </span>
        <div
          className="mt-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 via-sky-700 to-indigo-900 text-xl font-black tabular-nums text-white shadow-[0_4px_14px_rgba(14,116,144,0.45)] ring-[3px] ring-white"
          aria-hidden
        >
          {round.roundNumber}
        </div>
        <p className="mt-2 max-w-[16rem] text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-600">
          {round.name.replace(/^\s*round\s*\d+\s*/i, '').trim() || round.name}
        </p>
      </div>
      <div className="flex flex-col gap-5 md:gap-6">
        {round.series.map((s) => (
          <div
            key={s.id ?? `${round.roundNumber}-${s.label}-${s.higherTeamName}`}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_8px_30px_-6px_rgba(15,23,42,0.12),0_0_0_1px_rgba(255,255,255,0.8)_inset] backdrop-blur-sm transition-[box-shadow,transform] duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_40px_-8px_rgba(14,116,144,0.2)]"
          >
            <div
              className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-400 via-sky-600 to-indigo-950"
              aria-hidden
            />
            <div className="pl-2 pr-1 py-1">
              <PlayoffSeriesCard
                embedded
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
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12] mix-blend-multiply"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.45) 1px, transparent 0)`,
          backgroundSize: '20px 20px',
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
