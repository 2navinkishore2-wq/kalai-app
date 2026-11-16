import type { AuthUser, Expense, ExpenseCategory, PaymentMethod } from '../lib/types';
import type { DataService } from './data';
import { addAudit } from './audit';
import { round2 } from '../lib/money';

export interface ExpenseInput {
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  method: PaymentMethod;
  notes?: string;
}

export function validateExpense(input: ExpenseInput): string | null {
  if (!input.title?.trim()) return 'Enter an expense title.';
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'Enter an amount greater than zero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Choose a valid expense date.';
  if (!input.category) return 'Choose a category.';
  return null;
}

export async function createExpense(svc: DataService, input: ExpenseInput, user: AuthUser | null): Promise<Expense> {
  const error = validateExpense(input);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  const doc = {
    title: input.title.trim(),
    category: input.category,
    amount: round2(input.amount),
    date: input.date,
    method: input.method,
    notes: (input.notes || '').trim(),
    createdAt: now,
    updatedAt: now
  };
  const id = await svc.add('expenses', doc);
  await addAudit(svc, user, {
    entity: 'expense',
    entityId: id,
    action: 'create',
    summary: `Expense ${doc.title} — ${doc.amount} (${doc.category})`
  });
  return { id, ...doc };
}

export async function updateExpense(svc: DataService, expense: Expense, input: ExpenseInput, user: AuthUser | null): Promise<void> {
  const error = validateExpense(input);
  if (error) throw new Error(error);
  await svc.set('expenses', expense.id, {
    title: input.title.trim(),
    category: input.category,
    amount: round2(input.amount),
    date: input.date,
    method: input.method,
    notes: (input.notes || '').trim()
  });
  await addAudit(svc, user, {
    entity: 'expense',
    entityId: expense.id,
    action: 'update',
    summary: `Expense ${expense.title} updated — ${expense.amount} → ${round2(input.amount)}`
  });
}

export async function deleteExpense(svc: DataService, expense: Expense, user: AuthUser | null): Promise<void> {
  await svc.delete('expenses', expense.id);
  await addAudit(svc, user, {
    entity: 'expense',
    entityId: expense.id,
    action: 'delete',
    summary: `Expense ${expense.title} deleted (${expense.amount})`
  });
}
