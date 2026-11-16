import type { BillStatus, RoundingMode } from './types';
import { round2 } from './money';

export const SQFT_BASIS_DEFAULT = 16;

/** Area in square feet from dimensions entered in inches. */
export function areaFromInches(widthIn: number, heightIn: number): number {
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) return 0;
  return round2((widthIn * heightIn) / 144);
}

/** Area in square feet from dimensions already in feet (for reports/tests). */
export function areaFromFeet(widthFt: number, heightFt: number): number {
  if (!Number.isFinite(widthFt) || !Number.isFinite(heightFt) || widthFt <= 0 || heightFt <= 0) return 0;
  return round2(widthFt * heightFt);
}

export function applyRounding(amount: number, mode: RoundingMode): number {
  if (!Number.isFinite(amount)) return 0;
  switch (mode) {
    case 'up':
      return Math.ceil(amount - 1e-9);
    case 'down':
      return Math.floor(amount + 1e-9);
    case 'nearest':
      return Math.round(amount);
    default:
      return round2(amount);
  }
}

export interface SqftInput {
  widthIn: number;
  heightIn: number;
  qty: number;
  /** Configured price per `basisSqft`. */
  rate: number;
  /** 1 = price per sq.ft, 16 = price per 16 sq.ft. */
  basisSqft: number;
  minSqft?: number;
  minChargeEnabled?: boolean;
  rounding?: RoundingMode;
}

export interface SqftBreakdown {
  areaSqft: number;
  chargeableSqft: number;
  minimumApplied: boolean;
  basisSqft: number;
  rate: number;
  qty: number;
  rawAmount: number;
  amount: number;
}

/**
 * Square-feet billing engine.
 *   Area = (Width × Height) / 144
 *   Amount = (ChargeableArea ÷ Basis) × ConfiguredRate × Qty
 */
export function computeSqft(input: SqftInput): SqftBreakdown {
  const area = areaFromInches(input.widthIn, input.heightIn);
  const qty = Number.isFinite(input.qty) && input.qty > 0 ? input.qty : 0;
  const basis = Number.isFinite(input.basisSqft) && input.basisSqft > 0 ? input.basisSqft : 1;
  let chargeable = area;
  let minimumApplied = false;
  if (input.minChargeEnabled && (input.minSqft ?? 0) > area) {
    chargeable = input.minSqft ?? area;
    minimumApplied = true;
  }
  const rawAmount = (chargeable / basis) * (input.rate || 0) * qty;
  return {
    areaSqft: area,
    chargeableSqft: round2(chargeable),
    minimumApplied,
    basisSqft: basis,
    rate: input.rate || 0,
    qty,
    rawAmount: round2(rawAmount),
    amount: applyRounding(rawAmount, input.rounding ?? 'nearest')
  };
}

/** Frame is a fixed price per piece from the editable size table. */
export function computeFrame(price: number, qty: number, rounding: RoundingMode = 'nearest'): number {
  const amount = (price || 0) * (Number.isFinite(qty) && qty > 0 ? qty : 0);
  return applyRounding(amount, rounding);
}

export function billStatus(total: number, paid: number): BillStatus {
  if (total <= 0) return paid > 0 ? 'paid' : 'credit';
  if (paid >= total - 0.009) return 'paid';
  if (paid > 0) return 'partial';
  return 'credit';
}

export interface BillTotalsInput {
  subtotal: number;
  discountType: 'amount' | 'percent';
  discountValue: number;
  additionalCharges: number;
  gstEnabled: boolean;
  gstRate: number;
  gstInclusive: boolean;
}

export interface BillTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  additionalCharges: number;
  gstAmount: number;
  total: number;
}

export function computeBillTotals(input: BillTotalsInput): BillTotals {
  const subtotal = round2(input.subtotal);
  const rawDiscount =
    input.discountType === 'percent' ? (subtotal * Math.max(0, input.discountValue)) / 100 : Math.max(0, input.discountValue);
  const discount = round2(Math.min(subtotal, rawDiscount));
  const taxable = round2(subtotal - discount + Math.max(0, input.additionalCharges));
  let gstAmount = 0;
  let total = taxable;
  if (input.gstEnabled && input.gstRate > 0) {
    if (input.gstInclusive) {
      gstAmount = round2(taxable - taxable / (1 + input.gstRate / 100));
      total = taxable;
    } else {
      gstAmount = round2((taxable * input.gstRate) / 100);
      total = round2(taxable + gstAmount);
    }
  }
  return {
    subtotal,
    discount,
    taxable,
    additionalCharges: round2(Math.max(0, input.additionalCharges)),
    gstAmount,
    total
  };
}

export function formatSize(width: number, height: number): string {
  return `${width}×${height}`;
}
