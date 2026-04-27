'use client';

import { Fragment } from 'react';
import type { PlayoffSeriesForCard } from './playoff-series-card';
import { PlayoffSeriesCard, type WinnerSemifinalNumbers } from './playoff-series-card';

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

function roundSubtitle(name: string): string | null {
  const stripped = name.replace(/^\s*round\s*\d+\s*/i, '').trim();
  if (stripped) return stripped;
  if (/^round\s*\d+\s*$/i.test(String(name).trim())) return null;
  return String(name).trim() || null;
}

/** Derive "Semifinal N" from admin labels (e.g. "SEMIFINAL 2 • BO3"); fallback = order in the penultimate round. */
function parseSemifinalNumber(label: string, fallback: number): number {
  const s = String(label ?? '').trim();
  const semi = /\bsemifinal\s*(\d+)/i.exec(s);
  if (semi) return parseInt(semi[1]!, 10);
  const ser = /\bseries\s*(\d+)/i.exec(s);
  if (ser) return parseInt(ser[1]!, 10);
  return fallback;
}

/** Map final higher/lower rows to the two semifinal series immediately before the final (4- and 8-team, and 3-team ladder). */
function winnerSemifinalNumbersFromBracket(rounds: PlayoffBracketRound[]): WinnerSemifinalNumbers | undefined {
  if (rounds.length < 2) return undefined;
  const penultimate = rounds[rounds.length - 2]!;
  const semis = penultimate.series ?? [];
  if (semis.length === 2) {
    return {
      higher: parseSemifinalNumber(semis[0]!.label, 1),
      lower: parseSemifinalNumber(semis[1]!.label, 2),
    };
  }
  if (semis.length === 1) {
    return { lower: parseSemifinalNumber(semis[0]!.label, 1) };
  }
  return undefined;
}

/** Desktop: bracket connectors — muted stroke so lines read as structure, not a loud accent */
function BracketJoiner({ fromCount, toCount }: { fromCount: number; toCount: number }) {
  const stroke = 'text-text-faint/45';
  const strokeWidth = 1.75;
  if (fromCount === 1 && toCount === 1) {
    return (
      <div className="hidden w-10 shrink-0 items-center justify-center md:flex md:w-12 lg:w-14" aria-hidden>
        <svg
          viewBox="0 0 64 40"
          className={`h-10 w-full max-w-[3.5rem] ${stroke}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <path
            d="M4 20 H44"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M40 13 L54 20 L40 27"
            stroke="currentColor"
            strokeWidth={strokeWidth}
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
      <div className="hidden w-8 shrink-0 items-stretch py-2 md:flex md:w-12 lg:w-14" aria-hidden>
        <svg
          viewBox="0 0 64 220"
          className={`h-full min-h-[9rem] w-full ${stroke}`}
          preserveAspectRatio="none"
        >
          <path
            d="M4 55 H22 Q28 55 28 61 V106 Q28 110 32 110 H60 M4 165 H22 Q28 165 28 159 V114 Q28 110 32 110"
            stroke="currentColor"
            strokeWidth={strokeWidth}
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
      <div className="hidden w-8 shrink-0 items-stretch py-2 md:flex md:w-12" aria-hidden>
        <svg
          viewBox="0 0 64 360"
          className={`h-full min-h-[16rem] w-full ${stroke}`}
          preserveAspectRatio="none"
        >
          <path
            d="M4 52 H22 Q28 52 28 58 V100 Q28 104 32 104 H60 M4 156 H22 Q28 156 28 150 V108 Q28 104 32 104 M4 208 H22 Q28 208 28 214 V256 Q28 260 32 260 H60 M4 312 H22 Q28 312 28 306 V264 Q28 260 32 260"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="hidden w-8 shrink-0 items-center justify-center text-text-faint md:flex md:w-10" aria-hidden>
      <span className="select-none text-xl font-light">→</span>
    </div>
  );
}

function MobileVerticalConnector() {
  return (
    <div className="flex h-14 w-full shrink-0 flex-col items-center justify-center md:hidden" aria-hidden>
      <svg viewBox="0 0 48 120" className="h-14 w-10 text-text-faint/45">
        <path
          d="M24 8 V88 M16 80 L24 96 L32 80"
          stroke="currentColor"
          strokeWidth="1.75"
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
  winnerSemifinalNumbers,
}: {
  round: PlayoffBracketRound;
  recordText?: (teamName: string) => string;
  winnerSemifinalNumbers?: WinnerSemifinalNumbers;
}) {
  const sub = roundSubtitle(round.name);
  const seriesGap =
    round.series.length === 2 ? 'gap-3 md:gap-4' : round.series.length >= 4 ? 'gap-4 md:gap-5' : 'gap-5 md:gap-6';

  return (
    <div className="flex w-full min-w-0 max-w-[22rem] shrink-0 flex-col justify-center gap-4 sm:max-w-[24rem]">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">Round {round.roundNumber}</span>
        {sub ? (
          <p className="max-w-[18rem] text-balance text-sm font-semibold leading-snug text-text-muted">{sub}</p>
        ) : null}
        <div className="h-px w-12 bg-border" aria-hidden />
      </div>
      <div className={`flex flex-col ${seriesGap}`}>
        {round.series.map((s) => (
          <div key={s.id ?? `${round.roundNumber}-${s.label}-${s.higherTeamName}`} className="min-w-0">
            <PlayoffSeriesCard
              embedded
              series={s}
              winnerSemifinalNumbers={winnerSemifinalNumbers}
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

  const winnerSf = winnerSemifinalNumbersFromBracket(list);

  return (
    <div className="playoff-bracket-wrap relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6 md:p-8">
      <div className="relative overflow-x-auto overflow-y-visible pb-1 [-webkit-overflow-scrolling:touch]">
        <div className="flex min-w-0 flex-col items-stretch justify-center gap-0 md:min-w-min md:flex-row md:items-stretch md:justify-center md:gap-0 md:px-1">
          {list.map((round, ri) => (
            <Fragment key={round.roundNumber}>
              <RoundColumn
                round={round}
                recordText={recordText}
                winnerSemifinalNumbers={ri === list.length - 1 ? winnerSf : undefined}
              />
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
