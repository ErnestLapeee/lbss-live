import { useEffect, useState } from 'react';
import { isoDateToDdMmYyyy, parseEuropeanDateStringToIso } from '@/lib/localeDisplay';

type Props = {
  value: string;
  onChange: (isoYyyyMmDd: string) => void;
  className?: string;
  id?: string;
  'aria-label'?: string;
  autoComplete?: string;
};

/**
 * Day-first date field (`DD/MM/YYYY`). Value/onChange use ISO `YYYY-MM-DD` for APIs and storage.
 * Replaces `type="date"`, which follows OS locale (often MM/DD on en-US Windows).
 */
export function EuropeanDateInput({
  value,
  onChange,
  className,
  id,
  'aria-label': ariaLabel,
  autoComplete = 'off',
}: Props) {
  const [text, setText] = useState(() => (value ? isoDateToDdMmYyyy(value) : ''));

  useEffect(() => {
    setText(value ? isoDateToDdMmYyyy(value) : '');
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange('');
      setText('');
      return;
    }
    const iso = parseEuropeanDateStringToIso(trimmed);
    if (iso === null) {
      setText(value ? isoDateToDdMmYyyy(value) : '');
      return;
    }
    onChange(iso);
    setText(iso ? isoDateToDdMmYyyy(iso) : '');
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete={autoComplete}
      placeholder="DD/MM/YYYY"
      aria-label={ariaLabel}
      title="Day / month / year (European order)"
      className={className}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
