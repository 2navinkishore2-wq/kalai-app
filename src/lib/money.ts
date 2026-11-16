import Decimal from 'decimal.js';

/** Money helpers — all rounding is explicit so bills and reports never drift. */
export function round2(n: number): number {
  return new Decimal(Number.isFinite(n) ? n : 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function roundRupee(n: number): number {
  return new Decimal(Number.isFinite(n) ? n : 0).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}
