import type { AuthUser, Bill, BillItem, BillPayment, BusinessSettings, CustomerSnapshot, DiscountType, Payment } from '../lib/types';
import { computeBillTotals } from '../lib/pricing';
import { billStatus } from '../lib/pricing';
import { snapshotPayment } from '../lib/payment';
import { round2, sum } from '../lib/money';
import { uid } from '../lib/ids';
import type { DataService } from './data';
import { addAudit } from './audit';

export interface BillDraft {
  date: string;
  customerId: string | null;
  customer: CustomerSnapshot;
  items: BillItem[];
  discountType: DiscountType;
  discountValue: number;
  additionalCharges: number;
  gstEnabled: boolean;
  gstRate: number;
  gstInclusive: boolean;
  payments: BillPayment[];
  note?: string;
}

export function validateBill(draft: BillDraft): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return 'Choose a valid bill date.';
  if (!draft.customer.name?.trim()) return 'Customer name is required (use Walk-in Customer when not provided).';
  if (draft.items.length === 0) return 'Add at least one item to the bill.';
  for (const item of draft.items) {
    if (!Number.isFinite(item.qty) || item.qty <= 0) return 'Every item needs a quantity greater than zero.';
    if (!Number.isFinite(item.amount) || item.amount < 0) return 'Every item needs a valid amount.';
  }
  for (const p of draft.payments) {
    if (!Number.isFinite(p.amount) || p.amount <= 0) return 'Payment amounts must be greater than zero.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return 'Choose a valid payment date.';
  }
  return null;
}

function totalsFor(draft: BillDraft, settings: BusinessSettings) {
  const subtotal = round2(sum(draft.items.map((i) => i.amount)));
  return computeBillTotals({
    subtotal,
    discountType: draft.discountType,
    discountValue: draft.discountValue,
    additionalCharges: draft.additionalCharges,
    gstEnabled: draft.gstEnabled && settings.gstEnabled,
    gstRate: settings.gstRate,
    gstInclusive: settings.gstInclusive
  });
}

export async function createBill(
  svc: DataService,
  settings: BusinessSettings,
  draft: BillDraft,
  user: AuthUser | null
): Promise<Bill> {
  const err = validateBill(draft);
  if (err) throw new Error(err);
  const totals = totalsFor(draft, settings);
  const paid = round2(sum(draft.payments.map((p) => p.amount)));
  const balance = round2(Math.max(0, totals.total - paid));
  const id = uid('bill_');
  const number = await svc.nextInvoiceNumber({
    prefix: settings.invoicePrefix,
    pattern: settings.invoiceFormat,
    start: settings.invoiceStart,
    date: new Date(`${draft.date}T12:00:00`)
  });
  const now = new Date().toISOString();
  const bill: Bill = {
    id,
    number,
    date: draft.date,
    customerId: draft.customerId,
    customer: {
      name: draft.customer.name.trim(),
      phone: draft.customer.phone || '',
      address: draft.customer.address || '',
      email: draft.customer.email || ''
    },
    items: draft.items,
    subtotal: totals.subtotal,
    discountType: draft.discountType,
    discountValue: Math.max(0, draft.discountValue),
    discount: totals.discount,
    additionalCharges: totals.additionalCharges,
    gstEnabled: draft.gstEnabled && settings.gstEnabled,
    gstRate: settings.gstRate,
    gstAmount: totals.gstAmount,
    total: totals.total,
    paid: Math.min(paid, totals.total),
    balance,
    status: billStatus(totals.total, paid),
    payments: draft.payments,
    note: draft.note?.trim() || '',
    payment: snapshotPayment(settings),
    version: 1,
    createdAt: now,
    updatedAt: now
  };

  // Bill is written first: a printer failure, closed tab or offline sync issue
  // can never lose it. Payment receipts follow with deterministic IDs.
  await svc.set('bills', id, bill as unknown as Record<string, unknown>);
  for (let i = 0; i < draft.payments.length; i += 1) {
    const p = draft.payments[i];
    const payment: Omit<Payment, 'id'> = {
      customerId: draft.customerId,
      customerName: bill.customer.name,
      billId: id,
      billNumber: number,
      amount: p.amount,
      date: p.date,
      method: p.method,
      reference: p.reference || '',
      note: '',
      createdAt: now,
      updatedAt: now
    };
    await svc.set('payments', `pay_${id}_${i}`, payment as unknown as Record<string, unknown>);
  }
  await addAudit(svc, user, {
    entity: 'bill',
    entityId: id,
    action: 'create',
    summary: `Bill ${number} created for ${bill.customer.name} — ${bill.total}`
  });
  return bill;
}

export async function updateBill(
  svc: DataService,
  settings: BusinessSettings,
  original: Bill,
  draft: BillDraft,
  user: AuthUser | null
): Promise<Bill> {
  const err = validateBill(draft);
  if (err) throw new Error(err);
  const totals = totalsFor(draft, settings);
  const paid = round2(sum(original.payments.map((p) => p.amount)));
  const balance = round2(Math.max(0, totals.total - paid));
  const updated: Bill = {
    ...original,
    date: draft.date,
    customerId: draft.customerId,
    customer: { ...draft.customer, name: draft.customer.name.trim() },
    items: draft.items,
    subtotal: totals.subtotal,
    discountType: draft.discountType,
    discountValue: Math.max(0, draft.discountValue),
    discount: totals.discount,
    additionalCharges: totals.additionalCharges,
    gstEnabled: draft.gstEnabled && settings.gstEnabled,
    gstRate: settings.gstRate,
    gstAmount: totals.gstAmount,
    total: totals.total,
    balance,
    status: original.status === 'cancelled' ? 'cancelled' : billStatus(totals.total, paid),
    note: draft.note?.trim() || '',
    version: (original.version || 1) + 1,
    updatedAt: new Date().toISOString()
  };
  await svc.set('bills', original.id, updated as unknown as Record<string, unknown>);
  await addAudit(svc, user, {
    entity: 'bill',
    entityId: original.id,
    action: 'update',
    summary: `Bill ${original.number} edited (v${updated.version}). Total ${original.total} → ${updated.total}.`
  });
  return updated;
}

export async function cancelBill(svc: DataService, bill: Bill, reason: string, user: AuthUser | null): Promise<void> {
  await svc.set('bills', bill.id, {
    status: 'cancelled',
    cancelled: true,
    cancelReason: reason.trim() || 'Cancelled by owner',
    version: (bill.version || 1) + 1
  });
  await addAudit(svc, user, {
    entity: 'bill',
    entityId: bill.id,
    action: 'cancel',
    summary: `Bill ${bill.number} cancelled — ${reason.trim() || 'no reason given'}`
  });
}

export async function recordBillPayment(
  svc: DataService,
  bill: Bill,
  payment: BillPayment,
  user: AuthUser | null
): Promise<Bill> {
  if (bill.status === 'cancelled') throw new Error('A cancelled bill cannot receive payments.');
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error('Enter a valid payment amount.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.date)) throw new Error('Choose a valid payment date.');
  if (payment.amount > bill.balance + 0.009) throw new Error(`Payment cannot exceed the balance of ${bill.balance}.`);
  const payments = [...(bill.payments || []), payment];
  const paid = round2(sum(payments.map((p) => p.amount)));
  const balance = round2(Math.max(0, bill.total - paid));
  await svc.set('bills', bill.id, {
    payments,
    paid,
    balance,
    status: billStatus(bill.total, paid),
    version: (bill.version || 1) + 1
  });
  const now = new Date().toISOString();
  await svc.add('payments', {
    customerId: bill.customerId,
    customerName: bill.customer.name,
    billId: bill.id,
    billNumber: bill.number,
    amount: payment.amount,
    date: payment.date,
    method: payment.method,
    reference: payment.reference || '',
    note: '',
    createdAt: now,
    updatedAt: now
  });
  await addAudit(svc, user, {
    entity: 'payment',
    entityId: bill.id,
    action: 'payment',
    summary: `Payment ${payment.amount} (${payment.method}) received against ${bill.number}`
  });
  return { ...bill, payments, paid, balance, status: billStatus(bill.total, paid) };
}

export function overdueDays(bill: Bill, today: string): number {
  if (bill.balance <= 0 || bill.status === 'cancelled') return 0;
  const d1 = new Date(`${bill.date}T00:00:00`).getTime();
  const d2 = new Date(`${today}T00:00:00`).getTime();
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}
