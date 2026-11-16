import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataService } from './localService';
import { createCustomer } from './customers';
import { cancelBill, createBill, recordBillPayment, updateBill, validateBill, type BillDraft } from './bills';
import { DEFAULT_SETTINGS } from '../lib/constants';
import type { AuthUser, BillItem } from '../lib/types';

const user: AuthUser = { uid: 'owner-1', name: 'Owner', email: 'owner@kalai.test', photoURL: null, isDemo: true };

const item = (amount = 750): BillItem => ({
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
  amount
});

function draft(overrides: Partial<BillDraft> = {}): BillDraft {
  return {
    date: '2026-08-27',
    customerId: null,
    customer: { name: 'Walk-in Customer', phone: '', address: '', email: '' },
    items: [item()],
    discountType: 'amount',
    discountValue: 0,
    additionalCharges: 0,
    gstEnabled: false,
    gstRate: 18,
    gstInclusive: false,
    payments: [],
    note: '',
    ...overrides
  };
}

describe('bill creation', () => {
  let svc: LocalDataService;

  beforeEach(() => {
    localStorage.clear();
    svc = new LocalDataService();
  });

  it('saves a bill with a unique number and payment receipts', async () => {
    const customer = await createCustomer(svc, { name: 'Ramesh', phone: '9876543210' });
    const bill = await createBill(
      svc,
      DEFAULT_SETTINGS,
      draft({
        customerId: customer.id,
        customer: { name: customer.name, phone: customer.phone, address: '', email: '' },
        payments: [{ method: 'Cash', amount: 500, date: '2026-08-27' }]
      }),
      user
    );

    expect(bill.number).toMatch(/^KD-\d{4}-0001$/);
    expect(bill.total).toBe(750);
    expect(bill.paid).toBe(500);
    expect(bill.balance).toBe(250);
    expect(bill.status).toBe('partial');
    expect(bill.version).toBe(1);

    const stored = await svc.get<typeof bill>('bills', bill.id);
    expect(stored?.number).toBe(bill.number);

    const payments = await svc.query<{ id: string }>('payments', { where: [{ field: 'billId', op: '==', value: bill.id }] });
    expect(payments).toHaveLength(1);

    const audits = await svc.query<{ id: string }>('auditLogs');
    expect(audits.length).toBeGreaterThan(0);
  });

  it('increments the invoice number across bills', async () => {
    const first = await createBill(svc, DEFAULT_SETTINGS, draft(), user);
    const second = await createBill(svc, DEFAULT_SETTINGS, draft(), user);
    expect(first.number).toMatch(/-0001$/);
    expect(second.number).toMatch(/-0002$/);
    expect(first.number).not.toBe(second.number);
  });

  it('saves a frame line with its size and beading, priced fixed × quantity', async () => {
    const frameItem: BillItem = {
      key: 'frame-line',
      product: 'FRAME',
      label: 'Frame',
      frameSizeId: 'frame-10x8',
      frameSizeLabel: '10×8 in',
      beading: '1½ inch',
      rate: 350,
      qty: 2,
      amount: 700
    };
    const bill = await createBill(svc, DEFAULT_SETTINGS, draft({ items: [frameItem] }), user);
    expect(bill.total).toBe(700);

    const stored = await svc.get<typeof bill>('bills', bill.id);
    expect(stored?.items[0].frameSizeLabel).toBe('10×8 in');
    expect(stored?.items[0].beading).toBe('1½ inch');
    expect(stored?.items[0].rate).toBe(350);
    expect(stored?.items[0].amount).toBe(700);
  });

  it('applies discount and additional charges before GST', async () => {
    const bill = await createBill(
      svc,
      { ...DEFAULT_SETTINGS, gstEnabled: true, gstRate: 18 },
      draft({ discountType: 'percent', discountValue: 10, additionalCharges: 50, gstEnabled: true }),
      user
    );
    expect(bill.subtotal).toBe(750);
    expect(bill.discount).toBe(75);
    expect(bill.gstAmount).toBe(130.5);
    expect(bill.total).toBe(855.5);
    expect(bill.status).toBe('credit');
  });

  it('rejects invalid bills', async () => {
    await expect(createBill(svc, DEFAULT_SETTINGS, draft({ customer: { name: '', phone: '', address: '', email: '' } }), user)).rejects.toThrow(/name/i);
    await expect(createBill(svc, DEFAULT_SETTINGS, draft({ items: [] }), user)).rejects.toThrow(/item/i);
    await expect(createBill(svc, DEFAULT_SETTINGS, draft({ items: [{ ...item(), qty: 0 }] }), user)).rejects.toThrow(/quantity/i);
    await expect(createBill(svc, DEFAULT_SETTINGS, draft({ date: '27-08-2026' }), user)).rejects.toThrow(/date/i);
  });

  it('validates bill drafts without touching storage', () => {
    expect(validateBill(draft())).toBeNull();
    expect(validateBill(draft({ items: [] }))).not.toBeNull();
    expect(validateBill(draft({ customer: { name: '   ', phone: '', address: '', email: '' } }))).not.toBeNull();
    expect(validateBill(draft({ payments: [{ method: 'UPI', amount: -1, date: '2026-08-27' }] }))).not.toBeNull();
  });
});

describe('payments and edits', () => {
  let svc: LocalDataService;

  beforeEach(() => {
    localStorage.clear();
    svc = new LocalDataService();
  });

  it('records a payment and marks the bill paid', async () => {
    const bill = await createBill(svc, DEFAULT_SETTINGS, draft(), user);
    expect(bill.balance).toBe(750);
    const updated = await recordBillPayment(svc, bill, { method: 'UPI', amount: 750, date: '2026-08-28', reference: 'UPI-1' }, user);
    expect(updated.paid).toBe(750);
    expect(updated.balance).toBe(0);
    expect(updated.status).toBe('paid');
    expect(updated.payments).toHaveLength(1);
  });

  it('rejects overpayment and invalid payment amounts', async () => {
    const bill = await createBill(svc, DEFAULT_SETTINGS, draft(), user);
    await expect(recordBillPayment(svc, bill, { method: 'Cash', amount: 751, date: '2026-08-28' }, user)).rejects.toThrow(/exceed/i);
    await expect(recordBillPayment(svc, bill, { method: 'Cash', amount: 0, date: '2026-08-28' }, user)).rejects.toThrow(/valid/i);
  });

  it('preserves existing payments when a bill is edited', async () => {
    const bill = await createBill(
      svc,
      DEFAULT_SETTINGS,
      draft({ payments: [{ method: 'Cash', amount: 300, date: '2026-08-27' }] }),
      user
    );
    const edited = await updateBill(svc, DEFAULT_SETTINGS, bill, draft({ discountType: 'amount', discountValue: 50 }), user);
    expect(edited.version).toBe(2);
    expect(edited.total).toBe(700);
    expect(edited.payments).toHaveLength(1);
    expect(edited.paid).toBe(300);
    expect(edited.balance).toBe(400);
    expect(edited.status).toBe('partial');
  });

  it('cancels a bill without deleting it', async () => {
    const bill = await createBill(svc, DEFAULT_SETTINGS, draft(), user);
    await cancelBill(svc, bill, 'Duplicate order', user);
    const stored = await svc.get<typeof bill>('bills', bill.id);
    expect(stored?.status).toBe('cancelled');
    expect(stored?.cancelled).toBe(true);
    expect(stored?.cancelReason).toBe('Duplicate order');
    await expect(recordBillPayment(svc, stored!, { method: 'Cash', amount: 10, date: '2026-08-28' }, user)).rejects.toThrow(/cancelled/i);
  });
});
