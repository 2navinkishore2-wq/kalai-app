import { describe, expect, it } from 'vitest';
import { buildInvoicePdf, buildReportPdf, billFileName, pdfMoney, safeFileName } from './pdf';
import { DEFAULT_SETTINGS } from '../lib/constants';
import type { Bill } from '../lib/types';

const bill: Bill = {
  id: 'bill-1',
  number: 'KD-2026-0001',
  date: '2026-08-27',
  customerId: 'c1',
  customer: { name: 'Ramesh Kumar', phone: '9876543210', address: 'Main Road, Madurai', email: '' },
  items: [
    {
      key: 'line-1',
      product: 'FLEX',
      label: 'Flex',
      widthIn: 120,
      heightIn: 120,
      areaSqft: 100,
      chargeableSqft: 100,
      basisSqft: 16,
      rate: 120,
      qty: 1,
      amount: 750,
      note: '₹120 per 16 sq.ft'
    },
    {
      key: 'line-2',
      product: 'FRAME',
      label: 'Frame',
      frameSizeId: 'frame-12x10',
      frameSizeLabel: '12×10 in',
      rate: 800,
      qty: 2,
      amount: 1600
    }
  ],
  subtotal: 2350,
  discountType: 'amount',
  discountValue: 100,
  discount: 100,
  additionalCharges: 50,
  gstEnabled: true,
  gstRate: 18,
  gstAmount: 414,
  total: 2714,
  paid: 1000,
  balance: 1714,
  status: 'partial',
  payments: [{ method: 'Cash', amount: 1000, date: '2026-08-27', reference: 'CASH-1' }],
  note: 'Delivery Friday',
  version: 1,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z'
};

describe('invoice PDF', () => {
  it('builds a non-empty A4 PDF', () => {
    const doc = buildInvoicePdf(bill, DEFAULT_SETTINGS);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(String.fromCharCode(...new Uint8Array(bytes).slice(0, 5))).toBe('%PDF-');
  });

  it('builds a PDF for a long invoice without throwing', () => {
    const long: Bill = {
      ...bill,
      items: Array.from({ length: 55 }, (_, i) => ({ ...bill.items[0], key: `line-${i}`, amount: 100 }))
    };
    const doc = buildInvoicePdf(long, DEFAULT_SETTINGS);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('builds a report PDF with summary sections', () => {
    const doc = buildReportPdf(
      'Business report',
      'Period: 01 Aug 2026 → 27 Aug 2026',
      [
        { title: 'Summary', columns: ['Measure', 'Value'], rows: [['Sales', pdfMoney(2350)]] },
        { title: 'Sales by product', columns: ['Product', 'Qty'], rows: [['Flex', 1]], numericColumns: [1] }
      ],
      DEFAULT_SETTINGS
    );
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1500);
  });
});

describe('PDF helpers', () => {
  it('formats money with an ASCII rupee prefix', () => {
    expect(pdfMoney(1234.5)).toBe('Rs. 1,234.50');
    expect(pdfMoney(0)).toBe('Rs. 0.00');
    expect(pdfMoney(Number.NaN)).toBe('Rs. 0.00');
  });

  it('creates safe file names', () => {
    expect(safeFileName('KD-2026/0001', 'invoice')).toBe('KD-2026_0001');
    expect(safeFileName('', 'fallback')).toBe('fallback');
    expect(billFileName(bill, 'pdf')).toBe('KD-2026-0001_Ramesh_Kumar.pdf');
  });
});
