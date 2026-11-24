import type { Bill, Customer, Payment } from '../lib/types';
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

export function isArchived(customer: Pick<Customer, 'archived'> | null | undefined): boolean {
  return customer?.archived === true;
}

export function activeCustomers(customers: Customer[]): Customer[] {
  return customers.filter((c) => !isArchived(c));
}

export function archivedCustomers(customers: Customer[]): Customer[] {
  return customers.filter((c) => isArchived(c));
}

export interface CustomerLinks {
  bills: number;
  payments: number;
  outstanding: number;
  /** True when deleting the customer would orphan business records. */
  linked: boolean;
}

/** Everything that would be orphaned by permanently deleting a customer. */
export function customerLinks(
  customerId: string,
  bills: Pick<Bill, 'customerId' | 'balance'>[],
  payments: Pick<Payment, 'customerId'>[]
): CustomerLinks {
  const own = bills.filter((b) => b.customerId === customerId);
  const ownPayments = payments.filter((p) => p.customerId === customerId);
  return {
    bills: own.length,
    payments: ownPayments.length,
    outstanding: own.reduce((sum, b) => sum + (Number(b.balance) || 0), 0),
    linked: own.length > 0 || ownPayments.length > 0
  };
}

/**
 * Archives a customer: hidden from the New Bill picker and the default list,
 * but every invoice, payment and balance stays exactly as it was.
 */
export async function archiveCustomer(svc: DataService, id: string): Promise<void> {
  const existing = await svc.get<Customer>('customers', id);
  if (!existing) throw new Error('This customer no longer exists.');
  if (existing.archived === true) return;
  await svc.set('customers', id, { archived: true, archivedAt: new Date().toISOString() });
}

export async function restoreCustomer(svc: DataService, id: string): Promise<void> {
  const existing = await svc.get<Customer>('customers', id);
  if (!existing) throw new Error('This customer no longer exists.');
  if (existing.archived !== true) return;
  await svc.set('customers', id, { archived: false, archivedAt: '' });
}

/**
 * Permanently deletes a customer only when nothing references it. Linked
 * invoices/payments are never deleted — the caller archives instead.
 */
export async function deleteCustomer(
  svc: DataService,
  id: string,
  related: { bills: Pick<Bill, 'customerId' | 'balance'>[]; payments: Pick<Payment, 'customerId'>[] }
): Promise<void> {
  const links = customerLinks(id, related.bills, related.payments);
  if (links.linked) {
    throw new Error('This customer has invoices or payments. Archive the customer instead — their history must be kept.');
  }
  const existing = await svc.get<Customer>('customers', id);
  if (!existing) return;
  await svc.delete('customers', id);
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
