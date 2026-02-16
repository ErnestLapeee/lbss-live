import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBattingAvg(avg: number | null): string {
  if (avg === null || avg === undefined) return '.000';
  return avg.toFixed(3).replace(/^0/, '');
}

export function formatInningHalf(inning: number, half: 'top' | 'bot'): string {
  const arrow = half === 'top' ? '▲' : '▼';
  return `${arrow}${inning}`;
}

export function formatRecord(wins: number, losses: number, ties?: number): string {
  if (ties && ties > 0) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[āä]/g, 'a').replace(/[ēė]/g, 'e').replace(/[īį]/g, 'i')
    .replace(/[ōö]/g, 'o').replace(/[ūü]/g, 'u').replace(/[čć]/g, 'c')
    .replace(/[šś]/g, 's').replace(/[žź]/g, 'z').replace(/[ķ]/g, 'k')
    .replace(/[ļ]/g, 'l').replace(/[ņ]/g, 'n').replace(/[ģ]/g, 'g')
    .replace(/[ŗ]/g, 'r')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
