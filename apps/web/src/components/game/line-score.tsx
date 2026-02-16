interface LineScoreProps {
  homeTeam: string;
  awayTeam: string;
  homeLineScore: number[];
  awayLineScore: number[];
  homeTotal: { runs: number; hits: number; errors: number };
  awayTotal: { runs: number; hits: number; errors: number };
}

export function LineScore({ homeTeam, awayTeam, homeLineScore, awayLineScore, homeTotal, awayTotal }: LineScoreProps) {
  const maxInnings = Math.max(homeLineScore.length, awayLineScore.length, 9);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-alt">
            <th className="px-3 py-2 text-left font-semibold text-text-muted w-32">Team</th>
            {Array.from({ length: maxInnings }, (_, i) => (
              <th key={i} className="px-2 py-2 text-center font-semibold text-text-muted w-8">{i + 1}</th>
            ))}
            <th className="px-2 py-2 text-center font-bold border-l border-border w-8">R</th>
            <th className="px-2 py-2 text-center font-bold w-8">H</th>
            <th className="px-2 py-2 text-center font-bold w-8">E</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="px-3 py-2 font-semibold">{awayTeam}</td>
            {Array.from({ length: maxInnings }, (_, i) => (
              <td key={i} className="px-2 py-2 text-center font-mono tabular-nums">
                {awayLineScore[i] !== undefined ? awayLineScore[i] : ''}
              </td>
            ))}
            <td className="px-2 py-2 text-center font-bold font-mono border-l border-border">{awayTotal.runs}</td>
            <td className="px-2 py-2 text-center font-mono">{awayTotal.hits}</td>
            <td className="px-2 py-2 text-center font-mono">{awayTotal.errors}</td>
          </tr>
          <tr>
            <td className="px-3 py-2 font-semibold">{homeTeam}</td>
            {Array.from({ length: maxInnings }, (_, i) => (
              <td key={i} className="px-2 py-2 text-center font-mono tabular-nums">
                {homeLineScore[i] !== undefined ? homeLineScore[i] : ''}
              </td>
            ))}
            <td className="px-2 py-2 text-center font-bold font-mono border-l border-border">{homeTotal.runs}</td>
            <td className="px-2 py-2 text-center font-mono">{homeTotal.hits}</td>
            <td className="px-2 py-2 text-center font-mono">{homeTotal.errors}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
