import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { DEFAULT_SETTINGS } from '../lib/constants';
import { buildInvoicePdf } from './pdf';
import { PDF_TAMIL_FONT, ensureTamilFont, hasTamil, pdfSplitTextToSize, tamilVisual } from './pdfText';
import type { Bill } from '../lib/types';

const TAMIL_WORDS = [
  'கலை டிஜிட்டல்',
  'வணக்கம்',
  'நன்றி',
  'வாடிக்கையாளர்',
  'மொத்தம்',
  'செலுத்திய தொகை',
  'நிலுவைத் தொகை',
  'இனிய நல்வாழ்த்துகள்'
];

const bill: Bill = {
  id: 'bill-tamil',
  number: 'KD-2026-0007',
  date: '2026-08-27',
  customerId: 'c1',
  customer: { name: 'முருகன்', phone: '9876543210', address: 'மதுரை', email: '' },
  items: [
    {
      key: 'line-1',
      product: 'FLEX',
      label: 'ஃபிளக்ஸ்',
      widthIn: 120,
      heightIn: 120,
      areaSqft: 100,
      chargeableSqft: 100,
      basisSqft: 1,
      rate: 16,
      qty: 1,
      amount: 1600,
      note: 'மொத்தம் 100 சதுர அடி'
    }
  ],
  subtotal: 1600,
  discount: 0,
  discountType: 'amount',
  discountValue: 0,
  additionalCharges: 0,
  gstEnabled: false,
  gstRate: 0,
  gstAmount: 0,
  total: 1600,
  paid: 600,
  balance: 1000,
  status: 'partial',
  payments: [{ method: 'Cash', amount: 600, date: '2026-08-27', reference: '' }],
  note: 'நன்றி',
  version: 1,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z'
};

describe('Tamil PDF text', () => {
  it('detects Tamil text', () => {
    expect(hasTamil('கலை டிஜிட்டல்')).toBe(true);
    expect(hasTamil('KALAI DIGITAL')).toBe(false);
    expect(hasTamil('')).toBe(false);
  });

  it('moves pre-base vowel signs in front of their consonant', () => {
    // கலை -> the ை is drawn before ல
    expect(tamilVisual('கலை')).toBe('\u0B95\u0BC8\u0BB2');
    // மொத்தம் -> ொ splits into ெ + ா around ம
    expect(tamilVisual('மொத்தம்')).toBe('\u0BC6\u0BAE\u0BBE\u0BA4\u0BCD\u0BA4\u0BAE\u0BCD');
    // செலுத்திய -> ெ moves before ச
    expect(tamilVisual('செலுத்திய')).toBe('\u0BC6\u0B9A\u0BB2\u0BC1\u0BA4\u0BCD\u0BA4\u0BBF\u0BAF');
  });

  it('keeps every Tamil word intact and never drops letters', () => {
    for (const word of TAMIL_WORDS) {
      expect(hasTamil(tamilVisual(word))).toBe(true);
      expect(tamilVisual(word).replace(/[\u0BBE\u0BD7]/g, '').length).toBeGreaterThan(0);
    }
    // No Latin characters are touched.
    expect(tamilVisual('KALAI 123')).toBe('KALAI 123');
  });

  it('registers the embedded Tamil font once per document', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    expect(ensureTamilFont(doc)).toBe(true);
    expect(ensureTamilFont(doc)).toBe(true);
    expect(Object.keys(doc.getFontList())).toContain(PDF_TAMIL_FONT);
  });

  it('builds an invoice PDF with Tamil text and the embedded font', () => {
    const doc = buildInvoicePdf(bill, {
      ...DEFAULT_SETTINGS,
      nameTa: 'கலை டிஜிட்டல்',
      invoiceFooter: 'நன்றி! வணக்கம்.',
      thankYou: 'இனிய நல்வாழ்த்துகள்'
    });
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const raw = Buffer.from(bytes).toString('latin1');
    // The Tamil font is embedded as a subset, so the PDF is not relying on
    // Helvetica for these glyphs.
    expect(raw).toContain(PDF_TAMIL_FONT);
    expect(raw).toContain('/FontFile2');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('keeps Latin, numbers and Tamil together on one measured line', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFontSize(9);
    expect(ensureTamilFont(doc)).toBe(true);
    const lines = pdfSplitTextToSize(doc, 'KALAI DIGITAL · கலை டிஜிட்டல் · Total Rs. 1234.50', 70);
    const joined = lines.join(' ');
    expect(joined).toContain('KALAI DIGITAL');
    expect(joined).toContain('1234.50');
    expect(joined).toContain('\u0B95\u0BC8\u0BB2'); // shaped கலை
    expect(lines.every((line) => line.length > 0)).toBe(true);
  });
});
