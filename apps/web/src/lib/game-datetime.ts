/** Latvia league times are always shown in local (Riga) time, including SSR on UTC servers. */
export const GAME_DISPLAY_LOCALE = 'lv-LV';
export const GAME_DISPLAY_TIMEZONE = 'Europe/Riga';

const timeFormat: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: GAME_DISPLAY_TIMEZONE,
};

function parseInstant(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatGameTime(iso: string): string {
  const d = parseInstant(iso);
  if (!d) return '—';
  return d.toLocaleTimeString(GAME_DISPLAY_LOCALE, timeFormat);
}

export function formatGameDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  const d = parseInstant(iso);
  if (!d) return '—';
  return d.toLocaleDateString(GAME_DISPLAY_LOCALE, { ...options, timeZone: GAME_DISPLAY_TIMEZONE });
}

export function formatGameDayOfMonth(iso: string): string {
  const d = parseInstant(iso);
  if (!d) return '—';
  return d.toLocaleDateString(GAME_DISPLAY_LOCALE, {
    day: 'numeric',
    timeZone: GAME_DISPLAY_TIMEZONE,
  });
}

export function formatGameMonthShort(iso: string): string {
  return formatGameDate(iso, { month: 'short' });
}

export function formatGameWeekdayShort(iso: string): string {
  return formatGameDate(iso, { weekday: 'short' });
}

export function formatGameDateShort(iso: string): string {
  return formatGameDate(iso, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatGameDateLong(iso: string): string {
  return formatGameDate(iso, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatGameDateMonthDay(iso: string): string {
  return formatGameDate(iso, { month: 'short', day: 'numeric' });
}
