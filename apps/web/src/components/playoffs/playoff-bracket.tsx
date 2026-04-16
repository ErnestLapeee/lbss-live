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
  recordText?: (teamName: string) => string;
};

function safeRecord(recordText: ((name: string) => string) | undefined, name: string) {
  if (!recordText) return undefined;
  const t = String(name ?? '').trim();
  if (!t || t === 'TBD' || t === '—') return undefined;
  return recordText(t);
}

/** Second line under ROUND N — omit if the API name is only “Round 1”, etc. */
function roundSubtitle(name: string): string | null {
  const stripped = name.replace(/^\s*round\s*\d+\s*/i, '').trim();
  if (stripped) return stripped;
  if (/^round\s*\d+\s*$/i.test(String(name).trim())) return null;
  return String(name).trim() || null;
}

/** Desktop: horizontal bracket paths with glow */
function BracketJoiner({ fromCount, toCount }: { fromCount: number; toCount: number }) {
  const glow = 'drop-shadow-[0_0_8px_rgba(56,189,248,0.45)]';
  if (fromCount === 1 && toCount === 1) {
    return (
      <div className="hidden w-10 shrink-0 items-center justify-center md:flex md:w-14 lg:w-16" aria-hidden>
        <svg
          viewBox="0 0 64 40"
          className={`h-10 w-full max-w-[4rem] text-[#38bdf8] ${glow}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <path
            d="M4 20 H44"
            stroke="currentColor"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M40 13 L54 20 L40 27"
            stroke="currentColor"
            strokeWidth="2.5"
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
      <div className="hidden w-10 shrink-0 items-stretch py-4 md:flex md:w-14 lg:w-16" aria-hidden>
        <svg
          viewBox="0 0 64 220"
          className={`h-full min-h-[10rem] w-full text-[#38bdf8] ${glow}`}
          preserveAspectRatio="none"
        >
          <path
            d="M4 55 H28 V110 H60 M4 165 H28 V110"
            stroke="currentColor"
            strokeWidth="2.5"
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
      <div className="hidden w-10 shrink-0 items-stretch py-2 md:flex md:w-14" aria-hidden>
        <svg
          viewBox="0 0 64 360"
          className={`h-full min-h-[16rem] w-full text-[#38bdf8] ${glow}`}
          preserveAspectRatio="none"
        >
          <path
            d="M4 52 H28 V104 H60 M4 156 H28 V104 M4 208 H28 V260 H60 M4 312 H28 V260"
            stroke="currentColor"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="hidden w-8 shrink-0 items-center justify-center text-[#38bdf8]/80 md:flex md:w-10" aria-hidden>
      <span className={`select-none text-2xl font-light ${glow}`}>→</span>
    </div>
  );
}

/** Mobile: vertical connector between rounds */
function MobileVerticalConnector() {
  return (
    <div className="flex h-16 w-full shrink-0 flex-col items-center justify-center md:hidden" aria-hidden>
      <svg viewBox="0 0 48 120" className="h-16 w-12 text-[#38bdf8] drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">
        <path
          d="M24 8 V88 M16 80 L24 96 L32 80"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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
  const sub = roundSubtitle(round.name);

  return (
    <div className="flex w-full min-w-0 max-w-[22rem] shrink-0 flex-col justify-center gap-4 sm:max-w-[24rem]">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-[10px] font-black uppercase tracking-[0.35em] text-sky-300/90">
          Round {round.roundNumber}
        </span>
        {sub ? (
          <p className="max-w-[18rem] text-balance text-sm font-semibold leading-snug text-slate-300/95">
            {sub}
          </p>
        ) : null}
        <div className="h-px w-8 bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" aria-hidden />
      </div>
      <div className="flex flex-col gap-6 md:gap-7">
        {round.series.map((s) => (
          <div key={s.id ?? `${round.roundNumber}-${s.label}-${s.higherTeamName}`} className="min-w-0">
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
        ))}
      </div>
    </div>
  );
}

export function PlayoffBracket({ rounds, recordText }: PlayoffBracketProps) {
  const list = rounds?.filter((r) => (r.series?.length ?? 0) > 0) ?? [];
  if (list.length === 0) return null;

  return (
    <div className="playoff-bracket-wrap relative overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-b from-[#0a1628] via-[#0c1829] to-[#070b12] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_rgba(0,0,0,0.5),0_0_80px_rgba(14,165,233,0.08)] sm:p-6 md:p-8">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_-30%,rgba(56,189,248,0.14),transparent_55%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_80%,rgba(251,191,36,0.06),transparent_50%)]" aria-hidden />
      <div className="relative overflow-x-auto overflow-y-visible pb-1 [-webkit-overflow-scrolling:touch]">
        <div className="flex min-w-0 flex-col items-stretch justify-center gap-0 md:min-w-min md:flex-row md:items-stretch md:justify-center md:gap-0 md:px-1">
          {list.map((round, ri) => (
            <Fragment key={round.roundNumber}>
              <RoundColumn round={round} recordText={recordText} />
              {ri < list.length - 1 ? (
                <>
                  <BracketJoiner fromCount={round.series.length} toCount={list[ri + 1]!.series.length} />
                  <MobileVerticalConnector />
                </>
              ) : null}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
