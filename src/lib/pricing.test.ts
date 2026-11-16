import { describe, expect, it } from 'vitest';
import {
  applyRounding,
  areaFromFeet,
  areaFromInches,
  billStatus,
  computeBillTotals,
  computeFrame,
  computeSqft
} from './pricing';
import { formatBillNumber, parseBillSequence, previewInvoiceNumber, validateInvoicePattern } from './invoiceNumber';

describe('area calculations', () => {
  it('converts inches to square feet', () => {
    expect(areaFromInches(24, 36)).toBe(6);
    expect(areaFromInches(120, 120)).toBe(100);
    expect(areaFromInches(12, 12)).toBe(1);
    expect(areaFromFeet(10, 10)).toBe(100);
  });

  it('returns zero for invalid dimensions', () => {
    expect(areaFromInches(0, 10)).toBe(0);
    expect(areaFromInches(-2, 10)).toBe(0);
    expect(areaFromInches(Number.NaN, 10)).toBe(0);
    expect(areaFromFeet(0, 4)).toBe(0);
  });

  it('rounds areas to two decimals', () => {
    expect(areaFromInches(10, 10)).toBe(0.69);
  });
});

describe('square-feet pricing engine', () => {
  it('prices with the configured 16 sq.ft basis', () => {
    const result = computeSqft({ widthIn: 96, heightIn: 96, qty: 1, rate: 800, basisSqft: 16, rounding: 'none' });
    expect(result.areaSqft).toBe(64);
    expect(result.chargeableSqft).toBe(64);
    expect(result.rawAmount).toBe(3200);
    expect(result.amount).toBe(3200);
    expect(result.minimumApplied).toBe(false);
  });

  it('supports a 1 sq.ft basis', () => {
    const result = computeSqft({ widthIn: 60, heightIn: 60, qty: 2, rate: 25, basisSqft: 1, rounding: 'none' });
    expect(result.areaSqft).toBe(25);
    expect(result.amount).toBe(1250);
  });

  it('applies the minimum chargeable area when enabled', () => {
    const result = computeSqft({
      widthIn: 12,
      heightIn: 12,
      qty: 1,
      rate: 160,
      basisSqft: 16,
      minSqft: 4,
      minChargeEnabled: true,
      rounding: 'none'
    });
    expect(result.areaSqft).toBe(1);
    expect(result.chargeableSqft).toBe(4);
    expect(result.minimumApplied).toBe(true);
    expect(result.amount).toBe(40);
  });

  it('does not apply the minimum when it is disabled or smaller than the area', () => {
    const disabled = computeSqft({ widthIn: 48, heightIn: 48, qty: 1, rate: 160, basisSqft: 16, minSqft: 100, minChargeEnabled: false });
    expect(disabled.minimumApplied).toBe(false);
    expect(disabled.chargeableSqft).toBe(16);

    const larger = computeSqft({ widthIn: 96, heightIn: 96, qty: 1, rate: 160, basisSqft: 16, minSqft: 4, minChargeEnabled: true });
    expect(larger.minimumApplied).toBe(false);
  });

  it('applies each rounding mode', () => {
    expect(applyRounding(10.4, 'nearest')).toBe(10);
    expect(applyRounding(10.5, 'nearest')).toBe(11);
    expect(applyRounding(10.1, 'up')).toBe(11);
    expect(applyRounding(10.9, 'down')).toBe(10);
    expect(applyRounding(10.456, 'none')).toBe(10.46);
    expect(applyRounding(Number.NaN, 'nearest')).toBe(0);
  });

  it('multiplies quantity before rounding', () => {
    const result = computeSqft({ widthIn: 48, heightIn: 48, qty: 3, rate: 100, basisSqft: 16, rounding: 'nearest' });
    expect(result.areaSqft).toBe(16);
    expect(result.rawAmount).toBe(300);
    expect(result.amount).toBe(300);
  });

  it('prices Flex 10 × 10 ft at ₹16/sq.ft as ₹1,600', () => {
    const result = computeSqft({ widthIn: 120, heightIn: 120, qty: 1, rate: 16, basisSqft: 1, rounding: 'nearest' });
    expect(result.areaSqft).toBe(100);
    expect(result.chargeableSqft).toBe(100);
    expect(result.amount).toBe(1600);
  });

  it('prices Vinyl and Star 10 × 10 ft at ₹25/sq.ft as ₹2,500', () => {
    const result = computeSqft({ widthIn: 120, heightIn: 120, qty: 1, rate: 25, basisSqft: 1, rounding: 'nearest' });
    expect(result.areaSqft).toBe(100);
    expect(result.amount).toBe(2500);
  });

  it('scales the line total by quantity', () => {
    const result = computeSqft({ widthIn: 120, heightIn: 120, qty: 2, rate: 16, basisSqft: 1, rounding: 'nearest' });
    expect(result.amount).toBe(3200);
  });
});

describe('frame pricing', () => {
  it('charges the fixed size price per piece', () => {
    expect(computeFrame(250, 1)).toBe(250);
    expect(computeFrame(250, 3)).toBe(750);
    expect(computeFrame(350, 2)).toBe(700);
    expect(computeFrame(0, 3)).toBe(0);
    expect(computeFrame(250, 0)).toBe(0);
  });

  it('applies frame rounding', () => {
    expect(computeFrame(249.5, 2, 'nearest')).toBe(499);
    expect(computeFrame(249.5, 2, 'none')).toBe(499);
    expect(computeFrame(249.4, 1, 'up')).toBe(250);
  });
});

describe('bill totals', () => {
  it('applies a rupee discount', () => {
    const totals = computeBillTotals({ subtotal: 1000, discountType: 'amount', discountValue: 100, additionalCharges: 50, gstEnabled: false, gstRate: 18, gstInclusive: false });
    expect(totals.discount).toBe(100);
    expect(totals.taxable).toBe(950);
    expect(totals.total).toBe(950);
  });

  it('applies a percentage discount and never exceeds the subtotal', () => {
    const totals = computeBillTotals({ subtotal: 1000, discountType: 'percent', discountValue: 10, additionalCharges: 0, gstEnabled: false, gstRate: 18, gstInclusive: false });
    expect(totals.discount).toBe(100);
    expect(totals.total).toBe(900);

    const capped = computeBillTotals({ subtotal: 1000, discountType: 'percent', discountValue: 200, additionalCharges: 0, gstEnabled: false, gstRate: 18, gstInclusive: false });
    expect(capped.discount).toBe(1000);
    expect(capped.total).toBe(0);
  });

  it('adds exclusive GST after discount and additional charges', () => {
    const totals = computeBillTotals({ subtotal: 1000, discountType: 'amount', discountValue: 100, additionalCharges: 50, gstEnabled: true, gstRate: 18, gstInclusive: false });
    expect(totals.taxable).toBe(950);
    expect(totals.gstAmount).toBe(171);
    expect(totals.total).toBe(1121);
  });

  it('extracts inclusive GST from the total', () => {
    const totals = computeBillTotals({ subtotal: 1180, discountType: 'amount', discountValue: 0, additionalCharges: 0, gstEnabled: true, gstRate: 18, gstInclusive: true });
    expect(totals.total).toBe(1180);
    expect(totals.gstAmount).toBe(180);
  });

  it('does not add GST when disabled or zero-rated', () => {
    const off = computeBillTotals({ subtotal: 500, discountType: 'amount', discountValue: 0, additionalCharges: 0, gstEnabled: false, gstRate: 18, gstInclusive: false });
    expect(off.gstAmount).toBe(0);
    expect(off.total).toBe(500);
    const zero = computeBillTotals({ subtotal: 500, discountType: 'amount', discountValue: 0, additionalCharges: 0, gstEnabled: true, gstRate: 0, gstInclusive: false });
    expect(zero.total).toBe(500);
  });
});

describe('bill status', () => {
  it('derives paid, partial, unpaid', () => {
    expect(billStatus(100, 100)).toBe('paid');
    expect(billStatus(100, 99.999)).toBe('paid');
    expect(billStatus(100, 99.99)).toBe('partial');
    expect(billStatus(100, 50)).toBe('partial');
    expect(billStatus(100, 0)).toBe('credit');
    expect(billStatus(0, 0)).toBe('credit');
  });
});

describe('invoice numbering', () => {
  it('formats default tokens', () => {
    expect(formatBillNumber('{PREFIX}-{YYYY}-{SEQ}', 'KD', 7, new Date(2026, 7, 27))).toBe('KD-2026-0007');
  });

  it('supports padded sequences and short year/month', () => {
    expect(formatBillNumber('{PREFIX}{YY}{MM}-{SEQ:3}', 'A', 12, new Date(2026, 10, 5))).toBe('A2611-012');
  });

  it('parses the trailing sequence', () => {
    expect(parseBillSequence('KD-2026-0042')).toBe(42);
    expect(parseBillSequence('no digits')).toBe(0);
  });

  it('validates the required tokens', () => {
    expect(validateInvoicePattern('{PREFIX}-{YYYY}-{SEQ}')).toBeNull();
    expect(validateInvoicePattern('')).not.toBeNull();
    expect(validateInvoicePattern('{PREFIX}-{SEQ}')).toBeNull();
    expect(validateInvoicePattern('{PREFIX}-{YYYY}')).not.toBeNull();
    expect(validateInvoicePattern('{SEQ}')).not.toBeNull();
  });

  it('previews the next number', () => {
    expect(previewInvoiceNumber('{PREFIX}-{YYYY}-{SEQ}', 'KD', 1)).toMatch(/^KD-\d{4}-0001$/);
  });
});
