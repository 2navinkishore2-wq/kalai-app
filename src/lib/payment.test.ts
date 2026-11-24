import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './constants';
import {
  describePaymentChange,
  isValidBusinessMobile,
  isValidUpiId,
  paymentQrSrc,
  paymentSnapshotFor,
  snapshotPayment
} from './payment';
import type { Bill, BusinessSettings } from './types';

function settingsWith(patch: Partial<BusinessSettings['payment']>): BusinessSettings {
  return {
    ...DEFAULT_SETTINGS,
    payment: { ...DEFAULT_SETTINGS.payment, ...patch }
  };
}

function legacyBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    number: 'KB-0001',
    date: '2026-11-01',
    customer: { name: 'Walk-in Customer' },
    items: [],
    subtotal: 0,
    discount: 0,
    discountType: 'amount',
    additionalCharges: 0,
    gstRate: 0,
    gstAmount: 0,
    total: 0,
    paid: 0,
    balance: 0,
    status: 'credit',
    payments: [],
    version: 1,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides
  } as Bill;
}

describe('payment snapshot', () => {
  it('freezes the payment details so later Settings edits cannot rewrite an old bill', () => {
    const settings = settingsWith({ upiId: 'paytm.s16gsmj@pty', qrImage: 'data:image/png;base64,AAA' });
    const snapshot = snapshotPayment(settings);

    settings.payment.upiId = 'someone.else@bank';
    settings.payment.qrImage = '';

    expect(snapshot.upiId).toBe('paytm.s16gsmj@pty');
    expect(snapshot.qrImage).toBe('data:image/png;base64,AAA');
    expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uses the bill snapshot instead of the current settings', () => {
    const bill = legacyBill({
      payment: {
        showQr: true,
        businessMobile: '9876543210',
        upiId: 'old@bank',
        payeeName: 'KALAI DIGITAL',
        qrImage: 'data:image/png;base64,OLD',
        showLogos: false,
        footerMessage: 'Old footer',
        capturedAt: '2026-11-01T10:00:00.000Z'
      }
    });
    const current = settingsWith({ upiId: 'new@bank', qrImage: 'data:image/png;base64,NEW' });

    expect(paymentSnapshotFor(bill, current).upiId).toBe('old@bank');
    expect(paymentSnapshotFor(bill, current).qrImage).toBe('data:image/png;base64,OLD');
  });

  it('falls back to the current settings for bills saved before 1.4.0', () => {
    const current = settingsWith({ upiId: 'paytm.s16gsmj@pty' });
    const payment = paymentSnapshotFor(legacyBill(), current);
    expect(payment.upiId).toBe('paytm.s16gsmj@pty');
    expect(payment.showQr).toBe(true);
    // A legacy bill had no recorded payment data, so the snapshot is stamped
    // when it is read rather than claiming an original capture time.
    expect(payment.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('payment validation', () => {
  it('accepts a normal UPI handle and rejects malformed input', () => {
    expect(isValidUpiId('paytm.s16gsmj@pty')).toBe(true);
    expect(isValidUpiId('')).toBe(true);
    expect(isValidUpiId('not-a-upi')).toBe(false);
    expect(isValidUpiId('@bank')).toBe(false);
  });

  it('accepts a blank or real mobile number and rejects short ones', () => {
    expect(isValidBusinessMobile('')).toBe(true);
    expect(isValidBusinessMobile('9876543210')).toBe(true);
    expect(isValidBusinessMobile('123')).toBe(false);
  });

  it('reports destination changes separately from wording changes', () => {
    const base = settingsWith({ upiId: 'a@bank', qrImage: 'data:image/png;base64,ONE' }).payment;
    expect(describePaymentChange(base, { ...base, footerMessage: 'New line' }).destinationChanges).toBe(false);
    expect(describePaymentChange(base, { ...base, upiId: 'b@bank' }).upiChanged).toBe(true);
    expect(describePaymentChange(base, { ...base, qrImage: '' }).qrChanged).toBe(true);
  });

  it('resolves the bundled QR asset and keeps data URLs untouched', () => {
    expect(paymentQrSrc('')).toBe('');
    expect(paymentQrSrc('./payment-qr.webp').endsWith('payment-qr.webp')).toBe(true);
    expect(paymentQrSrc('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });
});
