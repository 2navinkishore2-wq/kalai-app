import { useMemo, useState } from 'react';
import { CalendarDays, Download, Pencil, Plus, Tag, Trash2, TrendingDown } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { Expense, ExpenseCategory, PaymentMethod } from '../lib/types';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../lib/constants';
import { createExpense, deleteExpense, updateExpense } from '../services/expenses';
import { expenseTotal, expensesByCategory, monthRange } from '../services/analytics';
import { csvEscape, downloadText, formatDate, formatINR, todayISO } from '../lib/format';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, SearchInput, SectionNote, Select, StatCard, useToast } from '../components/ui';

const emptyForm = (): { title: string; category: ExpenseCategory; amount: string; date: string; method: PaymentMethod; notes: string } => ({
  title: '',
  category: 'Material Purchase',
  amount: '',
  date: todayISO(),
  method: 'Cash',
  notes: ''
});

export function ExpensesPage() {
  const app = useApp();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'' | ExpenseCategory>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [remove, setRemove] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...app.expenses]
      .filter((e) => {
        if (category && e.category !== category) return false;
        if (from && e.date < from) return false;
        if (to && e.date > to) return false;
        if (q) {
          const match = e.title.toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  }, [app.expenses, query, category, from, to]);

  const total = useMemo(() => expenseTotal(filtered), [filtered]);
  const month = useMemo(() => monthRange(), []);
  const monthTotal = useMemo(() => expenseTotal(app.expenses, month.from, month.to), [app.expenses, month]);
  const breakdown = useMemo(() => expensesByCategory(filtered), [filtered]);
  const topCategory = breakdown[0];

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setForm({
      title: expense.title,
      category: expense.category,
      amount: String(expense.amount),
      date: expense.date,
      method: expense.method,
      notes: expense.notes || ''
    });
    setError('');
    setOpen(true);
  };

  const save = async () => {
    setError('');
    const amount = parseFloat(form.amount);
    if (!form.title.trim()) return setError('Enter an expense title.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter an amount greater than zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError('Choose a valid expense date.');
    setSaving(true);
    try {
      if (editing) {
        await updateExpense(app.service, editing, { ...form, amount }, app.user);
        toast('Expense updated', 'success');
      } else {
        await createExpense(app.service, { ...form, amount }, app.user);
        toast('Expense saved', 'success');
      }
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!remove) return;
    setDeleting(true);
    try {
      await deleteExpense(app.service, remove, app.user);
      toast('Expense deleted', 'success');
      setRemove(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = async () => {
    const rows = [
      ['Date', 'Title', 'Category', 'Amount', 'Method', 'Notes'],
      ...filtered.map((e) => [e.date, e.title, e.category, e.amount, e.method, e.notes || ''])
    ];
    try {
      const target = await downloadText(`kalai-expenses-${todayISO()}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv');
      toast(target === 'native' ? 'Expenses CSV saved to Downloads/KALAI DIGITAL' : 'Expenses CSV downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const clear = () => {
    setQuery('');
    setCategory('');
    setFrom('');
    setTo('');
  };

  return (
    <div className="page">
      <PageHeader
        title="Expenses"
        subtitle="Track material purchases, rent, power, transport and every shop cost."
        eyebrow="COSTS"
        actions={
          <>
            <Button variant="ghost" onClick={exportCsv} disabled={filtered.length === 0}><Download size={16} /> Export CSV</Button>
            <Button onClick={openAdd}><Plus size={16} /> Add Expense</Button>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Expenses shown" value={formatINR(total)} icon={<TrendingDown size={16} />} tone="red" hint={`${filtered.length} record${filtered.length === 1 ? '' : 's'}`} />
        <StatCard label="This month" value={formatINR(monthTotal)} icon={<CalendarDays size={16} />} tone="brand" hint="Current month to date" />
        <StatCard label="Top category" value={topCategory ? topCategory.category : '—'} icon={<Tag size={16} />} tone="gold" hint={topCategory ? formatINR(topCategory.amount) : 'No expenses in filter'} />
        <StatCard label="All-time expenses" value={formatINR(expenseTotal(app.expenses))} icon={<TrendingDown size={16} />} tone="slate" hint="Every saved expense" />
      </div>

      <Card>
        <div className="row" style={{ gap: 9, marginBottom: 11, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}><SearchInput value={query} onChange={setQuery} placeholder="Search title, notes or category…" /></div>
          <Select style={{ width: 190 }} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}>
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input type="date" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {(query || category || from || to) ? <Button variant="ghost" onClick={clear}>Clear</Button> : null}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<TrendingDown size={22} />}
            title={app.expenses.length === 0 ? 'No expenses recorded' : 'No expenses match'}
            text={app.expenses.length === 0 ? 'Add material purchases, rent, power bills and other costs to see true profit.' : 'Try clearing or changing the filters.'}
            action={app.expenses.length === 0 ? <Button size="sm" onClick={openAdd}><Plus size={15} /> Add Expense</Button> : <Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl stack-cards">
              <thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Method</th><th className="num">Amount</th><th className="actions"></th></tr></thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Date">{formatDate(e.date)}</td>
                    <td data-label="Expense"><div className="cell-main">{e.title}</div>{e.notes ? <div className="cell-sub">{e.notes}</div> : null}</td>
                    <td data-label="Category"><span className="pill">{e.category}</span></td>
                    <td data-label="Method">{e.method}</td>
                    <td className="num" data-label="Amount"><b>{formatINR(e.amount)}</b></td>
                    <td className="actions" data-label="">
                      <button className="icon-btn" title="Edit expense" onClick={() => openEdit(e)}><Pencil size={14} /></button>
                      <button className="icon-btn danger" title="Delete expense" style={{ marginLeft: 6 }} onClick={() => setRemove(e)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {breakdown.length > 0 ? (
        <Card title="Category breakdown" subtitle="Based on the expenses currently shown">
          <div className="stack" style={{ gap: 9 }}>
            {breakdown.map((row) => {
              const pct = total > 0 ? (row.amount / total) * 100 : 0;
              return (
                <div key={row.category}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{row.category}</span>
                    <span style={{ fontSize: 12.5 }}><b>{formatINR(row.amount)}</b> <span className="muted">· {pct.toFixed(1)}%</span></span>
                  </div>
                  <div className="progress progress-gold"><span style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Modal
        open={open}
        title={editing ? 'Edit expense' : 'Add expense'}
        subtitle="Expenses are private to your business account."
        onClose={() => setOpen(false)}
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} loading={saving}>{editing ? 'Save changes' : 'Add expense'}</Button>
          </>
        }
      >
        <Field label="Title" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Flex roll purchase" maxLength={100} autoFocus /></Field>
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Amount (₹)" required><Input type="number" min={0} step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        </div>
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Paid by">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.filter((m) => m !== 'Credit').map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="Notes" hint="Optional"><textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={300} /></Field>
        </div>
        {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
        <SectionNote tone="info">Expenses are used in the Reports profit estimate. Deleting an expense is recorded in the audit trail.</SectionNote>
      </Modal>

      <ConfirmDialog
        open={!!remove}
        title="Delete this expense?"
        message={remove ? `${remove.title} — ${formatINR(remove.amount)}. This cannot be undone, but the deletion is recorded in the audit trail.` : ''}
        confirmLabel="Delete expense"
        busy={deleting}
        onConfirm={() => void doDelete()}
        onCancel={() => setRemove(null)}
      />
    </div>
  );
}
