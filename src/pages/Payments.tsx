import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, Download, Plus, ReceiptText, Search, Smartphone, WalletCards } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { Bill, PaymentMethod } from '../lib/types';
import { PAYMENT_METHODS } from '../lib/constants';
import { recordBillPayment } from '../services/bills';
import { csvEscape, downloadText, formatDate, formatINR, todayISO } from '../lib/format';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, SectionNote, Select, StatCard, useToast } from '../components/ui';

export function PaymentsPage() {
  const app = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<'' | PaymentMethod>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(false);
  const [billId, setBillId] = useState('');
  const [form, setForm] = useState({ amount: '', method: 'Cash' as PaymentMethod, date: todayISO(), reference: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const billMap = useMemo(() => new Map(app.bills.map((b) => [b.id, b])), [app.bills]);
  const cancelledCount = useMemo(
    () => app.payments.filter((p) => p.billId && billMap.get(p.billId)?.status === 'cancelled').length,
    [app.payments, billMap]
  );

  const livePayments = useMemo(
    () => app.payments.filter((p) => !p.billId || billMap.get(p.billId)?.status !== 'cancelled'),
    [app.payments, billMap]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return [...livePayments]
      .filter((p) => {
        if (method && p.method !== method) return false;
        if (from && p.date < from) return false;
        if (to && p.date > to) return false;
        if (q) {
          const match =
            p.customerName.toLowerCase().includes(q) ||
            p.billNumber.toLowerCase().includes(q) ||
            (p.reference || '').toLowerCase().includes(q) ||
            (digits.length > 0 && (p.reference || '').replace(/\D/g, '').includes(digits));
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  }, [livePayments, query, method, from, to]);

  const totals = useMemo(() => {
    let total = 0;
    let cash = 0;
    let upi = 0;
    let bank = 0;
    for (const p of filtered) {
      total += p.amount;
      if (p.method === 'Cash') cash += p.amount;
      else if (p.method === 'UPI') upi += p.amount;
      else if (p.method === 'Bank Transfer') bank += p.amount;
    }
    return { total, cash, upi, bank };
  }, [filtered]);

  const outstanding = useMemo(
    () =>
      app.bills
        .filter((b) => b.status !== 'cancelled' && b.balance > 0)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [app.bills]
  );

  const selectedBill: Bill | undefined = outstanding.find((b) => b.id === billId);

  const openAdd = () => {
    setError('');
    const first = outstanding[0];
    setBillId(first?.id || '');
    setForm({ amount: first ? String(first.balance) : '', method: 'Cash', date: todayISO(), reference: '' });
    setOpen(true);
  };

  const chooseBill = (id: string) => {
    setBillId(id);
    const bill = outstanding.find((b) => b.id === id);
    setForm((f) => ({ ...f, amount: bill ? String(bill.balance) : f.amount }));
  };

  const save = async () => {
    setError('');
    if (!selectedBill) return setError('Choose an unpaid bill.');
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a payment amount greater than zero.');
    if (amount > selectedBill.balance + 0.009) return setError(`Amount cannot exceed the balance of ${formatINR(selectedBill.balance)}.`);
    setSaving(true);
    try {
      await recordBillPayment(app.service, selectedBill, { amount, method: form.method, date: form.date, reference: form.reference.trim() }, app.user);
      toast(`Payment recorded against ${selectedBill.number}`, 'success');
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = async () => {
    const rows = [
      ['Date', 'Customer', 'Bill', 'Method', 'Reference', 'Amount', 'Note'],
      ...filtered.map((p) => [p.date, p.customerName, p.billNumber || '', p.method, p.reference || '', p.amount, p.note || ''])
    ];
    try {
      const target = await downloadText(`kalai-payments-${todayISO()}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv');
      toast(target === 'native' ? 'Payments CSV saved to Downloads/KALAI DIGITAL' : 'Payments CSV downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const clear = () => {
    setQuery('');
    setMethod('');
    setFrom('');
    setTo('');
  };

  return (
    <div className="page">
      <PageHeader
        title="Payments"
        subtitle="Every receipt, split payment and collection, backed by the original bill."
        eyebrow="CASH FLOW"
        actions={
          <>
            <Button variant="ghost" onClick={exportCsv} disabled={filtered.length === 0}><Download size={16} /> Export CSV</Button>
            <Button onClick={openAdd} disabled={outstanding.length === 0}><Plus size={16} /> Record Payment</Button>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Payments shown" value={String(filtered.length)} icon={<WalletCards size={16} />} tone="brand" hint="Matching the current filters" />
        <StatCard label="Collected" value={formatINR(totals.total)} icon={<ReceiptText size={16} />} tone="green" hint="Excludes cancelled bills" />
        <StatCard label="Cash" value={formatINR(totals.cash)} icon={<Banknote size={16} />} tone="gold" hint="Counter collections" />
        <StatCard label="UPI + Bank" value={formatINR(totals.upi + totals.bank)} icon={<Smartphone size={16} />} tone="blue" hint="Digital collections" />
      </div>

      {cancelledCount > 0 ? (
        <SectionNote tone="warn">{cancelledCount} payment record{cancelledCount === 1 ? '' : 's'} belong to cancelled bills and are excluded from these totals. They remain in the audit history.</SectionNote>
      ) : null}

      <Card>
        <div className="row" style={{ gap: 9, marginBottom: 11, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 230 }}><SearchInput value={query} onChange={setQuery} placeholder="Customer, bill number or reference…" /></div>
          <Select style={{ width: 165 }} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
            <option value="">All methods</option>
            {PAYMENT_METHODS.filter((m) => m !== 'Credit').map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Input type="date" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {(query || method || from || to) ? <Button variant="ghost" onClick={clear}><Search size={15} /> Clear</Button> : null}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<WalletCards size={22} />}
            title={app.payments.length === 0 ? 'No payments recorded' : 'No payments match'}
            text={app.payments.length === 0 ? 'Record a payment from an unpaid bill, or use the button above.' : 'Try changing or clearing the filters.'}
            action={outstanding.length > 0 ? <Button size="sm" onClick={openAdd}><Plus size={15} /> Record Payment</Button> : <Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl stack-cards">
              <thead><tr><th>Date</th><th>Customer</th><th>Bill</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={p.billId ? 'clickable' : ''} onClick={() => p.billId && navigate(`/bills/${p.billId}`)}>
                    <td data-label="Date">{formatDate(p.date)}</td>
                    <td data-label="Customer">{p.customerName}</td>
                    <td data-label="Bill">{p.billNumber || '—'}</td>
                    <td data-label="Method"><span className={`pill ${p.method === 'Cash' ? 'pill-green' : p.method === 'UPI' ? 'pill-gold' : 'pill-blue'}`}>{p.method}</span></td>
                    <td data-label="Reference">{p.reference || '—'}</td>
                    <td className="num" data-label="Amount"><b>{formatINR(p.amount)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        title="Record a payment"
        subtitle="The bill balance and status update automatically."
        onClose={() => setOpen(false)}
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} loading={saving}><Plus size={15} /> Record payment</Button>
          </>
        }
      >
        <Field label="Unpaid bill" required>
          <Select value={billId} onChange={(e) => chooseBill(e.target.value)}>
            <option value="">Choose a bill…</option>
            {outstanding.map((b) => (
              <option key={b.id} value={b.id}>{b.number} · {b.customer.name} · {formatINR(b.balance)} due</option>
            ))}
          </Select>
        </Field>
        {selectedBill ? (
          <div className="stat-strip" style={{ marginTop: 8 }}>
            <span><b>{formatINR(selectedBill.total)}</b> total</span>
            <span><b>{formatINR(selectedBill.paid)}</b> paid</span>
            <span><b>{formatINR(selectedBill.balance)}</b> balance</span>
          </div>
        ) : null}
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Amount (₹)" required><Input type="number" min={0} step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Method">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.filter((m) => m !== 'Credit').map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
        </div>
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Payment date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Reference" hint="UPI / cheque / transaction no."><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} maxLength={80} /></Field>
        </div>
        {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
        <SectionNote tone="info">A separate payment receipt is saved, and the bill is marked Paid, Partial or Unpaid automatically.</SectionNote>
      </Modal>
    </div>
  );
}
