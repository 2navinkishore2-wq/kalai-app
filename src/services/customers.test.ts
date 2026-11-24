import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeCustomers,
  archiveCustomer,
  archivedCustomers,
  createCustomer,
  customerLinks,
  customerStats,
  deleteCustomer,
  findSimilarCustomers,
  isArchived,
  restoreCustomer,
  searchCustomers,
  validateCustomer
} from './customers';
import { LocalDataService } from './localService';
import type { Bill, Customer } from '../lib/types';

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Ramesh Kumar',
  phone: '98765 43210',
  address: '',
  email: '',
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

describe('customer validation', () => {
  it('requires only a name', () => {
    expect(validateCustomer({ name: 'Walk-in Customer' })).toBeNull();
    expect(validateCustomer({ name: 'Ramesh', phone: '', email: '' })).toBeNull();
  });

  it('rejects missing or oversized names', () => {
    expect(validateCustomer({ name: '' })).not.toBeNull();
    expect(validateCustomer({ name: '   ' })).not.toBeNull();
    expect(validateCustomer({ name: 'a'.repeat(81) })).not.toBeNull();
  });

  it('treats the phone as optional but validates it when present', () => {
    expect(validateCustomer({ name: 'Ramesh', phone: '+91 98765-43210' })).toBeNull();
    expect(validateCustomer({ name: 'Ramesh', phone: 'abc' })).not.toBeNull();
    expect(validateCustomer({ name: 'Ramesh', phone: '123' })).not.toBeNull();
  });

  it('validates an optional email', () => {
    expect(validateCustomer({ name: 'Ramesh', email: 'r@example.com' })).toBeNull();
    expect(validateCustomer({ name: 'Ramesh', email: 'not-an-email' })).not.toBeNull();
  });
});

describe('duplicate detection', () => {
  const list = [customer(), customer({ id: 'c2', name: 'Suresh', phone: '90000 00000' })];

  it('flags an exact normalised mobile', () => {
    const matches = findSimilarCustomers(list, { name: 'Different Name', phone: '9876543210' });
    expect(matches.map((c) => c.id)).toContain('c1');
  });

  it('flags a similar name softly', () => {
    const matches = findSimilarCustomers(list, { name: 'Ramesh' });
    expect(matches.map((c) => c.id)).toContain('c1');
  });

  it('does not flag unrelated customers', () => {
    expect(findSimilarCustomers(list, { name: 'Anand', phone: '9111111111' })).toHaveLength(0);
  });
});

describe('customer search and stats', () => {
  const list = [customer(), customer({ id: 'c2', name: 'Suresh', phone: '90000 00000' })];

  it('searches by name or digits in the phone', () => {
    expect(searchCustomers(list, 'ram')).toHaveLength(1);
    expect(searchCustomers(list, '98765')).toHaveLength(1);
    expect(searchCustomers(list, '90000')).toHaveLength(1);
    expect(searchCustomers(list, '')).toHaveLength(2);
  });

  it('aggregates purchases and pending balances, ignoring cancelled bills', () => {
    const stats = customerStats(list, [
      { customerId: 'c1', total: 1000, balance: 400, status: 'partial' },
      { customerId: 'c1', total: 500, balance: 0, status: 'paid' },
      { customerId: 'c1', total: 900, balance: 900, status: 'cancelled' }
    ]);
    expect(stats.get('c1')).toEqual({ purchases: 1500, pending: 400, bills: 2 });
    expect(stats.get('c2')).toEqual({ purchases: 0, pending: 0, bills: 0 });
  });
});

describe('delete and archive customers', () => {
  let svc: LocalDataService;

  beforeEach(() => {
    localStorage.clear();
    svc = new LocalDataService();
  });

  function billFor(customerId: string, over: Partial<Bill> = {}): Bill {
    const now = '2026-11-20T10:00:00.000Z';
    return {
      id: `bill-${customerId}`,
      number: 'KD-2026-0001',
      date: '2026-11-20',
      customerId,
      customer: { name: 'Test Customer', phone: '9876543210', address: '', email: '' },
      items: [
        {
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
          rate: 16,
          qty: 1,
          amount: 1600
        }
      ],
      subtotal: 1600,
      discountType: 'amount',
      discountValue: 0,
      discount: 0,
      additionalCharges: 0,
      gstEnabled: false,
      gstRate: 18,
      gstAmount: 0,
      total: 2500,
      paid: 1000,
      balance: 1500,
      status: 'partial',
      payments: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...over
    };
  }

  it('permanently deletes a customer with no linked records', async () => {
    const created = await createCustomer(svc, { name: 'Test Only' });
    const bills = await svc.query<Bill>('bills');
    const payments = await svc.query('payments');
    expect(customerLinks(created.id, bills, payments as []).linked).toBe(false);

    await deleteCustomer(svc, created.id, { bills, payments: payments as [] });
    expect(await svc.get('customers', created.id)).toBeNull();
  });

  it('refuses to delete a customer that has invoices', async () => {
    const created = await createCustomer(svc, { name: 'Has Bill' });
    await svc.set('bills', 'bill-1', billFor(created.id) as unknown as Record<string, unknown>);
    const bills = await svc.query<Bill>('bills');

    expect(customerLinks(created.id, bills, []).linked).toBe(true);
    await expect(deleteCustomer(svc, created.id, { bills, payments: [] })).rejects.toThrow(/Archive/);
    expect(await svc.get('customers', created.id)).not.toBeNull();
    expect(await svc.get<Bill>('bills', 'bill-1')).toMatchObject({ total: 2500, balance: 1500 });
  });

  it('archives a customer with bills, keeps history, then restores it', async () => {
    const created = await createCustomer(svc, { name: 'Archived Customer', phone: '9876543210' });
    await svc.set('bills', 'bill-1', billFor(created.id, {
      customer: { name: 'Archived Customer', phone: '9876543210', address: 'Old address', email: '' }
    }) as unknown as Record<string, unknown>);
    await svc.set('payments', 'pay-1', {
      customerId: created.id,
      customerName: 'Archived Customer',
      billId: 'bill-1',
      billNumber: 'KD-2026-0001',
      amount: 1000,
      date: '2026-11-20',
      method: 'Cash',
      reference: '',
      note: '',
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z'
    });

    await archiveCustomer(svc, created.id);
    const stored = await svc.get<Customer>('customers', created.id);
    expect(isArchived(stored)).toBe(true);
    expect(stored?.archivedAt).toBeTruthy();

    const all = await svc.query<Customer>('customers');
    expect(activeCustomers(all).map((c) => c.id)).not.toContain(created.id);
    expect(archivedCustomers(all).map((c) => c.id)).toContain(created.id);

    // The invoice and payment history is byte-for-byte untouched.
    const bill = await svc.get<Bill>('bills', 'bill-1');
    expect(bill?.customer.name).toBe('Archived Customer');
    expect(bill?.customer.phone).toBe('9876543210');
    expect(bill?.items[0].rate).toBe(16);
    expect(bill?.items[0].amount).toBe(1600);
    expect(bill?.total).toBe(2500);
    expect(bill?.balance).toBe(1500);
    expect((await svc.query('payments')).length).toBe(1);

    await restoreCustomer(svc, created.id);
    const restored = await svc.get<Customer>('customers', created.id);
    expect(restored?.archived).toBe(false);
    expect(activeCustomers([restored as Customer]).map((c) => c.id)).toContain(created.id);
  });

  it('only removes the selected customer', async () => {
    const keep = await createCustomer(svc, { name: 'Keep Me' });
    const remove = await createCustomer(svc, { name: 'Testing Entry' });
    await deleteCustomer(svc, remove.id, { bills: [], payments: [] });
    expect(await svc.get('customers', keep.id)).not.toBeNull();
    expect(await svc.get('customers', remove.id)).toBeNull();
  });
});
