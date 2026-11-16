import type { Bill, Customer, DashboardStats, Expense, Payment, ProductKey, StockTxn, InventoryItem } from '../lib/types';
import { addDaysISO, monthKey, parseISO, startOfMonth, todayISO } from '../lib/format';
import { round2, sum } from '../lib/money';

export function activeBills(bills: Bill[]): Bill[] {
  return bills.filter((b) => b.status !== 'cancelled' && !b.cancelled);
}

export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export function dashboardStats(
  bills: Bill[],
  customers: Customer[],
  payments: Payment[],
  today = todayISO()
): DashboardStats {
  const live = activeBills(bills);
  const todayBills = live.filter((b) => b.date === today);
  const todaySales = round2(sum(todayBills.map((b) => b.total)));
  const todayPayments = payments.filter((p) => p.date === today);
  const cashToday = round2(sum(todayPayments.filter((p) => p.method === 'Cash').map((p) => p.amount)));
  const upiToday = round2(sum(todayPayments.filter((p) => p.method === 'UPI').map((p) => p.amount)));
  const pending = round2(sum(todayBills.map((b) => b.balance)));
  const month = monthKey(today);
  const monthSales = round2(sum(live.filter((b) => monthKey(b.date) === month).map((b) => b.total)));
  const outstanding = round2(sum(live.map((b) => b.balance)));
  return {
    todaySales,
    todayBills: todayBills.length,
    cashToday,
    upiToday,
    pending,
    customers: customers.length,
    monthSales,
    outstanding,
    recentBills: [...live].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6),
    recentCustomers: [...customers].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5),
    recentPayments: [...payments].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6)
  };
}

export interface DayPoint {
  date: string;
  label: string;
  value: number;
  bills: number;
}

export function dailySales(bills: Bill[], endDate: string, days: number): DayPoint[] {
  const live = activeBills(bills);
  const points: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDaysISO(endDate, -i);
    const dayBills = live.filter((b) => b.date === date);
    points.push({
      date,
      label: parseISO(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      value: round2(sum(dayBills.map((b) => b.total))),
      bills: dayBills.length
    });
  }
  return points;
}

export function weeklySales(bills: Bill[], endDate: string, weeks = 8): DayPoint[] {
  const live = activeBills(bills);
  const out: DayPoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const end = addDaysISO(endDate, -i * 7);
    const start = addDaysISO(end, -6);
    const rows = live.filter((b) => b.date >= start && b.date <= end);
    out.push({
      date: start,
      label: `${parseISO(start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
      value: round2(sum(rows.map((b) => b.total))),
      bills: rows.length
    });
  }
  return out;
}

export function monthlySales(bills: Bill[], endMonth: string, months = 6): DayPoint[] {
  const live = activeBills(bills);
  const [y, m] = endMonth.split('-').map(Number);
  const out: DayPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rows = live.filter((b) => monthKey(b.date) === key);
    out.push({
      date: `${key}-01`,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      value: round2(sum(rows.map((b) => b.total))),
      bills: rows.length
    });
  }
  return out;
}

export interface ProductReportRow {
  product: ProductKey;
  label: string;
  qty: number;
  sqft: number;
  sales: number;
  cost: number;
}

export function productSales(bills: Bill[]): ProductReportRow[] {
  const live = activeBills(bills);
  const map = new Map<ProductKey, ProductReportRow>();
  for (const b of live) {
    for (const item of b.items) {
      const row = map.get(item.product) || { product: item.product, label: item.label, qty: 0, sqft: 0, sales: 0, cost: 0 };
      row.qty += item.qty;
      row.sqft += item.chargeableSqft || item.areaSqft || 0;
      row.sales += item.amount;
      map.set(item.product, row);
    }
  }
  return [...map.values()].map((r) => ({ ...r, sales: round2(r.sales), sqft: round2(r.sqft) })).sort((a, b) => b.sales - a.sales);
}

export interface PaymentReport {
  method: string;
  amount: number;
  count: number;
}

export function paymentBreakdown(payments: Payment[], from?: string, to?: string): PaymentReport[] {
  const filtered = payments.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
  const map = new Map<string, PaymentReport>();
  for (const p of filtered) {
    const row = map.get(p.method) || { method: p.method, amount: 0, count: 0 };
    row.amount += p.amount;
    row.count += 1;
    map.set(p.method, row);
  }
  return [...map.values()].map((r) => ({ ...r, amount: round2(r.amount) })).sort((a, b) => b.amount - a.amount);
}

export interface CustomerReportRow {
  customerId: string;
  name: string;
  phone: string;
  bills: number;
  sales: number;
  pending: number;
}

export function customerSales(bills: Bill[], customers: Customer[]): CustomerReportRow[] {
  const map = new Map<string, CustomerReportRow>();
  for (const c of customers) {
    map.set(c.id, { customerId: c.id, name: c.name, phone: c.phone, bills: 0, sales: 0, pending: 0 });
  }
  for (const b of activeBills(bills)) {
    const key = b.customerId || 'walkin';
    const row = map.get(key) || {
      customerId: key,
      name: b.customer.name || 'Walk-in Customer',
      phone: b.customer.phone || '',
      bills: 0,
      sales: 0,
      pending: 0
    };
    row.bills += 1;
    row.sales += b.total;
    row.pending += b.balance;
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, sales: round2(r.sales), pending: round2(r.pending) })).sort((a, b) => b.sales - a.sales);
}

export function expenseTotal(expenses: Expense[], from?: string, to?: string): number {
  return round2(sum(expenses.filter((e) => (!from || e.date >= from) && (!to || e.date <= to)).map((e) => e.amount)));
}

export function expensesByCategory(expenses: Expense[], from?: string, to?: string) {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    map.set(e.category, (map.get(e.category) || 0) + e.amount);
  }
  return [...map.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
}

export function profitEstimate(
  bills: Bill[],
  products: { key: ProductKey; purchaseCostPerSqft: number }[],
  expenses: Expense[],
  from: string,
  to: string
) {
  const live = activeBills(bills).filter((b) => b.date >= from && b.date <= to);
  const costMap = new Map(products.map((p) => [p.key, p.purchaseCostPerSqft]));
  const sales = round2(sum(live.map((b) => b.total)));
  const materialCost = round2(
    sum(
      live.flatMap((b) =>
        b.items.map((i) => {
          if (i.product === 'FRAME') return 0;
          return (i.chargeableSqft || i.areaSqft || 0) * (costMap.get(i.product) || 0);
        })
      )
    )
  );
  const expense = expenseTotal(expenses, from, to);
  return { sales, materialCost, expenses: expense, grossProfit: round2(sales - materialCost), netProfit: round2(sales - materialCost - expense) };
}

export function outstandingByCustomer(bills: Bill[]) {
  const map = new Map<string, { customerId: string; name: string; phone: string; pending: number; oldest: string; bills: number }>();
  for (const b of activeBills(bills)) {
    if (b.balance <= 0) continue;
    const key = b.customerId || 'walkin';
    const row = map.get(key) || {
      customerId: key,
      name: b.customer.name,
      phone: b.customer.phone,
      pending: 0,
      oldest: b.date,
      bills: 0
    };
    row.pending += b.balance;
    row.bills += 1;
    if (b.date < row.oldest) row.oldest = b.date;
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, pending: round2(r.pending) })).sort((a, b) => b.pending - a.pending);
}

export function stockValue(items: InventoryItem[]): number {
  return round2(sum(items.map((i) => i.stockQty * i.costPerUnit)));
}

export function stockUsage(txns: StockTxn[], inventoryId: string): number {
  return round2(sum(txns.filter((t) => t.inventoryId === inventoryId && t.type === 'usage').map((t) => t.qty)));
}

export function todayRange(): { from: string; to: string } {
  const t = todayISO();
  return { from: t, to: t };
}

export function monthRange(today = todayISO()): { from: string; to: string } {
  return { from: startOfMonth(parseISO(today)), to: today };
}
