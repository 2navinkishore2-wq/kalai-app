import type { BillStatus, Language, ProductKey } from './types';
import { PRODUCT_NAMES } from './constants';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const INR0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function formatINR(n: number, decimals = true): string {
  return (decimals ? INR : INR0).format(Number.isFinite(n) ? n : 0);
}

export function formatNumber(n: number, digits = 2): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(Number.isFinite(n) ? n : 0);
}

/** Local YYYY-MM-DD (never UTC-shifted). */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(date: string): Date {
  // Date-only strings are parsed as local midnight, not UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(date);
}

export function formatDate(date: string): string {
  if (!date) return '—';
  const d = parseISO(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: string): string {
  if (!date) return '—';
  const d = parseISO(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function formatLongDate(date: Date = new Date(), language: Language = 'en'): string {
  return date.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function startOfMonth(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function productName(key: ProductKey, language: Language = 'en'): string {
  return PRODUCT_NAMES[key]?.[language] ?? key;
}

export const STATUS_LABEL: Record<BillStatus, string> = {
  paid: 'Paid',
  partial: 'Partial',
  credit: 'Unpaid',
  cancelled: 'Cancelled'
};

export function initials(name: string): string {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+\s-]/g, '').slice(0, 18);
}

export function isValidPhone(phone: string): boolean {
  if (!phone.trim()) return true; // phone is optional
  return /^[+]?[\d\s-]{6,18}$/.test(phone.trim());
}

export function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function downloadText(filename: string, text: string, mime = 'text/plain', withBom = mime === 'text/csv'): Promise<'native' | 'browser'> {
  // A UTF-8 BOM keeps Excel on Windows from garbling Tamil text in CSV files.
  const payload = withBom ? `\uFEFF${text}` : text;
  const blob = new Blob([payload], { type: `${mime};charset=utf-8` });
  const { saveFile } = await import('../services/download');
  return saveFile(filename, blob, mime);
}
