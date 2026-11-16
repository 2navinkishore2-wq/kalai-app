import type { Customer } from '../lib/types';
import type { DataService } from './data';

export interface CustomerInput {
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  notes?: string;
  photo?: string;
}

export function validateCustomer(input: CustomerInput): string | null {
  if (!input.name?.trim()) return 'Customer name is required.';
  if (input.name.trim().length > 80) return 'Customer name is too long.';
  if (input.phone?.trim() && !/^[+]?[\d\s-]{6,18}$/.test(input.phone.trim())) return 'Enter a valid mobile number (optional).';
  if (input.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Enter a valid email address.';
  return null;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Duplicate guard: same normalised mobile is a hard warning; similar name is soft. */
export function findSimilarCustomers(customers: Customer[], input: CustomerInput): Customer[] {
  const name = input.name.trim().toLowerCase();
  const phone = normalizePhone(input.phone || '');
  return customers.filter((c) => {
    if (phone && normalizePhone(c.phone) === phone) return true;
    if (!name) return false;
    const cn = c.name.trim().toLowerCase();
    return cn === name || (name.length > 3 && (cn.includes(name) || name.includes(cn)));
  });
}

export async function createCustomer(svc: DataService, input: CustomerInput): Promise<Customer> {
  const err = validateCustomer(input);
  if (err) throw new Error(err);
  const now = new Date().toISOString();
  const doc = {
    name: input.name.trim(),
    phone: (input.phone || '').trim(),
    address: (input.address || '').trim(),
    email: (input.email || '').trim(),
    notes: (input.notes || '').trim(),
    photo: input.photo || '',
    createdAt: now,
    updatedAt: now
  };
  const id = await svc.add('customers', doc);
  return { id, ...doc };
}

export async function updateCustomer(svc: DataService, id: string, input: CustomerInput): Promise<void> {
  const err = validateCustomer(input);
  if (err) throw new Error(err);
  await svc.set('customers', id, {
    name: input.name.trim(),
    phone: (input.phone || '').trim(),
    address: (input.address || '').trim(),
    email: (input.email || '').trim(),
    notes: (input.notes || '').trim(),
    ...(input.photo !== undefined ? { photo: input.photo } : {})
  });
}

export function searchCustomers(customers: Customer[], query: string): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  const digits = q.replace(/\D/g, '');
  return customers.filter(
    (c) => c.name.toLowerCase().includes(q) || (digits.length > 0 && normalizePhone(c.phone).includes(digits))
  );
}

export function customerStats(customers: Customer[], bills: { customerId: string | null; total: number; balance: number; status: string }[]) {
  const map = new Map<string, { purchases: number; pending: number; bills: number }>();
  for (const c of customers) map.set(c.id, { purchases: 0, pending: 0, bills: 0 });
  for (const b of bills) {
    if (!b.customerId || b.status === 'cancelled') continue;
    const s = map.get(b.customerId) || { purchases: 0, pending: 0, bills: 0 };
    s.purchases += b.total;
    s.pending += b.balance;
    s.bills += 1;
    map.set(b.customerId, s);
  }
  return map;
}
