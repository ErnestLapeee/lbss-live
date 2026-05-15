/** Used for `Intl` / `toLocale*` and as `lang` on native time inputs (24h where applicable). */
export const APP_LOCALE = 'lv-LV' as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` → `DD/MM/YYYY` for display (always day-first). */
export function isoDateToDdMmYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso).trim());
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Strip non-digits and format as DD/MM/YYYY while typing (slashes inserted automatically). */
export function formatDateDigitsAsEuropeanDisplay(digitsRaw: string): string {
  const d = String(digitsRaw).replace(/\D/g, '').slice(0, 8);
  if (!d) return '';
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * When the field already has separators, keep day / month / year as separate segments.
 * Globbing all digits and re-slicing as DDMMYYYY breaks in-place edits (e.g. `17/05/2026` → `1/05/2026` became `10/52/026`).
 */
function normalizeSlashedEuropeanDateDisplay(raw: string): string {
  const s = String(raw)
    .replace(/[.-]/g, '/')
    .replace(/[^\d/]/g, '');
  const rawParts = s.split('/').map((p) => p.replace(/\D/g, ''));
  const day = (rawParts[0] ?? '').slice(0, 2);
  const month = (rawParts[1] ?? '').slice(0, 2);
  const year = rawParts.slice(2).join('').slice(0, 4);
  const out: string[] = [];
  if (rawParts.length >= 1) out.push(day);
  if (rawParts.length >= 2) out.push(month);
  if (rawParts.length >= 3) out.push(year);
  return out.join('/');
}

/** Normalize raw field text to a DD/MM/YYYY display string (handles paste of ISO date). */
export function userCalendarInputToDdMmDisplay(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return isoDateToDdMmYyyy(s.slice(0, 10));
  if (/[/.-]/.test(s)) return normalizeSlashedEuropeanDateDisplay(s);
  return formatDateDigitsAsEuropeanDisplay(s);
}

/**
 * Parse European calendar date: day first, then month, then year.
 * Accepts `DD/MM/YYYY`, `DD.MM.YYYY`, `DD-MM-YYYY`, or already `YYYY-MM-DD` (year must be four digits).
 * @returns `YYYY-MM-DD`, empty string if input empty, or `null` if invalid.
 */
export function parseEuropeanDateStringToIso(input: string): string | null {
  const s = input.trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const digits = s.replace(/\D/g, '');
  if (digits.length === 8 && /^(\d{8})$/.test(digits)) {
    const synthetic = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    return parseEuropeanDateStringToIso(synthetic);
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function formatShortDate(isoDate: string | null | undefined): string {
  if (isoDate == null || String(isoDate).trim() === '') return '—';
  const s = String(isoDate).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : isoDateToDdMmYyyy(
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      ) || s;
}

export function formatShortDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(APP_LOCALE, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
