interface SummarySection {
  title: string;
  lines: string[];
}

export function BoxScoreTeamSummary({ sections }: { sections: SummarySection[] }) {
  const visible = sections.filter((s) => s.lines.length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="mb-6 mt-2 space-y-2.5 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-text-muted">
      {visible.map((section) => (
        <div key={section.title}>
          <div className="mb-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-text-faint">
            {section.title}
          </div>
          <div className="space-y-0.5 font-mono">
            {section.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoxScoreGameInfo({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border pt-4 text-center text-[11px] leading-relaxed text-text-faint">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
