import { useEffect, useState } from 'react';
import { isoDateToDdMmYyyy, parseEuropeanDateStringToIso, userCalendarInputToDdMmDisplay } from '@/lib/localeDisplay';

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
 * Typing only digits auto-inserts `/`; pasting `YYYY-MM-DD` works. Replaces `type="date"` (OS-locale order issues).
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

  const handleInputChange = (raw: string) => {
    const next = userCalendarInputToDdMmDisplay(raw);
    setText(next);
    const trimmed = next.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    const iso = parseEuropeanDateStringToIso(trimmed);
    if (iso !== null) {
      onChange(iso);
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete={autoComplete}
      placeholder="DD/MM/YYYY"
      aria-label={ariaLabel}
      title="Day / month / year — type digits only; slashes are added automatically"
      className={className}
      value={text}
      onChange={(e) => handleInputChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
