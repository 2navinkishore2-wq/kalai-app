import { describe, expect, it } from 'vitest';
import { customerStats, findSimilarCustomers, searchCustomers, validateCustomer } from './customers';
import type { Customer } from '../lib/types';

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
