/** Used for `Intl` / `toLocale*` and as `lang` on native date inputs (day-first, 24h where applicable). */
export const APP_LOCALE = 'lv-LV' as const;

export function formatShortDate(isoDate: string | null | undefined): string {
  if (isoDate == null || String(isoDate).trim() === '') return '—';
  const s = String(isoDate).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
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
