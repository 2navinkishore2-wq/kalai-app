import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataService } from './localService';
import { createBill, updateBill, type BillDraft } from './bills';
import { DEFAULT_SETTINGS } from '../lib/constants';
import { ITEM_NAME_MAX, cleanItemName, itemNameLabel, itemNameReceipt } from '../lib/itemName';
import { invoiceItemCell } from './pdf';
import { receiptHtml } from './printer';
import type { AuthUser, Bill, BillItem } from '../lib/types';

const user: AuthUser = { uid: 'owner-1', name: 'Owner', email: 'owner@kalai.test', photoURL: null, isDemo: true };

const flex = (overrides: Partial<BillItem> = {}): BillItem => ({
  key: 'line-1',
  product: 'FLEX',
  label: 'Flex',
  widthIn: 120,
  heightIn: 120,
  widthEntered: 10,
  heightEntered: 10,
  unit: 'ft',
  areaSqft: 100,
  chargeableSqft: 100,
  basisSqft: 1,
  rate: 25,
  qty: 1,
  amount: 2500,
  ...overrides
});

function draft(items: BillItem[]): BillDraft {
  return {
    date: '2026-11-24',
    customerId: null,
    customer: { name: 'Naveen', phone: '', address: '', email: '' },
    items,
    discountType: 'amount',
    discountValue: 0,
    additionalCharges: 0,
    gstEnabled: false,
    gstRate: 18,
    gstInclusive: false,
    payments: [],
    note: ''
  };
}

describe('cleanItemName', () => {
  it('keeps a Tamil name exactly as typed', () => {
    expect(cleanItemName('பஞ்சு')).toBe('பஞ்சு');
    expect(cleanItemName('முருகன்')).toBe('முருகன்');
  });

  it('allows a blank name', () => {
    expect(cleanItemName('')).toBe('');
    expect(cleanItemName('   ')).toBe('');
    expect(cleanItemName(null)).toBe('');
  });

  it('collapses whitespace and caps the length', () => {
    expect(cleanItemName('  Panju   Kumar ')).toBe('Panju Kumar');
    expect(cleanItemName('x'.repeat(200))).toHaveLength(ITEM_NAME_MAX);
  });

  it('keeps unusual characters without breaking the label', () => {
    expect(cleanItemName('ராஜா & Co. <b>')).toBe('ராஜா & Co. <b>');
    expect(itemNameLabel('பஞ்சு')).toBe('Item Name: பஞ்சு');
    expect(itemNameLabel('')).toBe('');
    expect(itemNameReceipt('பஞ்சு')).toBe('For: பஞ்சு');
  });
});

describe('item name on a bill', () => {
  let svc: LocalDataService;

  beforeEach(() => {
    svc = new LocalDataService();
  });

  it('stores each line name without touching customer, rate or totals', async () => {
    const bill = await createBill(
      svc,
      DEFAULT_SETTINGS,
      draft([
        flex({ key: 'a', itemName: 'பஞ்சு' }),
        flex({ key: 'b', itemName: 'முருகன்' }),
        flex({ key: 'c' })
      ]),
      user
    );
    const stored = (await svc.get('bills', bill.id)) as unknown as Bill;

    expect(stored.customer.name).toBe('Naveen');
    expect(stored.items.map((i) => i.itemName)).toEqual(['பஞ்சு', 'முருகன்', undefined]);
    expect(stored.items.map((i) => i.amount)).toEqual([2500, 2500, 2500]);
    expect(stored.total).toBe(7500);
    // No customer record is invented from an item name.
    expect(stored.customerId).toBeNull();
  });

  it('keeps the name when the bill is edited', async () => {
    const bill = await createBill(svc, DEFAULT_SETTINGS, draft([flex({ itemName: 'ராஜா' })]), user);
    const updated = await updateBill(
      svc,
      DEFAULT_SETTINGS,
      bill,
      draft([flex({ itemName: 'ராஜா', qty: 2, amount: 5000 })]),
      user
    );
    expect(updated.items[0].itemName).toBe('ராஜா');
    expect(updated.total).toBe(5000);
  });

  it('reads older items that have no name', async () => {
    const bill = await createBill(svc, DEFAULT_SETTINGS, draft([flex()]), user);
    expect(bill.items[0].itemName).toBeUndefined();
    expect(invoiceItemCell(bill.items[0])).toBe('Flex');
  });
});

describe('item name in print output', () => {
  const bill: Bill = {
    id: 'b1',
    number: 'KD-2026-0001',
    date: '2026-11-24',
    customerId: null,
    customer: { name: 'Naveen', phone: '', address: '', email: '' },
    items: [
      flex({ itemName: 'பஞ்சு' }),
      { ...flex({ key: 'f', product: 'FRAME', label: 'Frame', frameSizeLabel: '12×18 in', beading: '1 inch', rate: 800, amount: 800, itemName: 'ராஜா' }) }
    ],
    subtotal: 3300,
    discountType: 'amount',
    discountValue: 0,
    discount: 0,
    additionalCharges: 0,
    gstEnabled: false,
    gstRate: 0,
    gstAmount: 0,
    total: 3300,
    paid: 0,
    balance: 3300,
    status: 'credit',
    payments: [],
    version: 1,
    createdAt: '2026-11-24T10:00:00.000Z',
    updatedAt: '2026-11-24T10:00:00.000Z'
  };

  it('adds the name to the A4 table item cell', () => {
    expect(invoiceItemCell(bill.items[0])).toContain('Item Name: பஞ்சு');
    expect(invoiceItemCell(bill.items[1])).toContain('Item Name: ராஜா');
  });

  it('prints the name on the thermal receipt under the product', () => {
    const html = receiptHtml(bill, { ...DEFAULT_SETTINGS, receiptWidth: 80 });
    expect(html).toContain('For: பஞ்சு');
    expect(html).toContain('For: ராஜா');
    // The customer on the bill is still Naveen only.
    expect(html).toContain('Naveen');
    expect(html).not.toContain('Customer</span><span>பஞ்சு');
  });

  it('escapes unusual characters in the name', () => {
    const html = receiptHtml({ ...bill, items: [flex({ itemName: '<b>x</b>' })] }, DEFAULT_SETTINGS);
    expect(html).toContain('For: &lt;b&gt;x&lt;/b&gt;');
  });
});
