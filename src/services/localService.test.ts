import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataService } from './localService';
import { formatBillNumber } from '../lib/invoiceNumber';

beforeEach(() => localStorage.clear());

describe('device-local data service', () => {
  it('supports create, read, merge-update and delete', async () => {
    const svc = new LocalDataService();
    const id = await svc.add('customers', { name: 'Ramesh', phone: '' });
    const created = await svc.get<{ id: string; name: string; phone: string }>('customers', id);
    expect(created?.name).toBe('Ramesh');

    await svc.set('customers', id, { phone: '9876543210' });
    const updated = await svc.get<{ id: string; name: string; phone: string }>('customers', id);
    expect(updated?.name).toBe('Ramesh');
    expect(updated?.phone).toBe('9876543210');

    await svc.delete('customers', id);
    expect(await svc.get('customers', id)).toBeNull();
  });

  it('filters and orders queries', async () => {
    const svc = new LocalDataService();
    await svc.set('bills', 'b1', { date: '2026-08-01', total: 100, status: 'paid' });
    await svc.set('bills', 'b2', { date: '2026-08-03', total: 300, status: 'credit' });
    await svc.set('bills', 'b3', { date: '2026-08-02', total: 200, status: 'paid' });

    const paid = await svc.query<{ id: string }>('bills', { where: [{ field: 'status', op: '==', value: 'paid' }] });
    expect(paid.map((b) => b.id).sort()).toEqual(['b1', 'b3']);

    const ordered = await svc.query<{ id: string; date: string }>('bills', { orderBy: { field: 'date', dir: 'desc' } });
    expect(ordered.map((b) => b.id)).toEqual(['b2', 'b3', 'b1']);

    const limited = await svc.query('bills', { orderBy: { field: 'date', dir: 'asc' }, limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0].id).toBe('b1');
  });

  it('allocates sequential invoice numbers from stored bills', async () => {
    const svc = new LocalDataService();
    const date = new Date(2026, 7, 27);
    const first = await svc.nextInvoiceNumber({ prefix: 'KD', pattern: '{PREFIX}-{YYYY}-{SEQ}', start: 1, date });
    expect(first).toBe('KD-2026-0001');
    await svc.set('bills', 'b1', { number: first });
    const second = await svc.nextInvoiceNumber({ prefix: 'KD', pattern: '{PREFIX}-{YYYY}-{SEQ}', start: 1, date });
    expect(second).toBe(formatBillNumber('{PREFIX}-{YYYY}-{SEQ}', 'KD', 2, date));
  });

  it('notifies watchers when documents change', async () => {
    const svc = new LocalDataService();
    const seen: string[][] = [];
    const off = svc.watch<{ id: string }>('customers', undefined, (items) => seen.push(items.map((i) => i.id)));
    await svc.set('customers', 'c1', { name: 'A' });
    await new Promise((r) => setTimeout(r, 10));
    off();
    expect(seen.some((ids) => ids.includes('c1'))).toBe(true);
  });

  it('signs in demo mode without an email', async () => {
    const svc = new LocalDataService();
    const user = await svc.signInDemo('Test Shop');
    expect(user.isDemo).toBe(true);
    expect(user.name).toBe('Test Shop');
    expect(svc.getAuthUser()?.uid).toBe('demo-user');
    await svc.signOut();
    expect(svc.getAuthUser()).toBeNull();
  });
});
