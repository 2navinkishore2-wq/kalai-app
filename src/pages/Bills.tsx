import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Search, X, ChevronRight, ReceiptText } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { PaymentMethod, ProductKey } from '../lib/types';
import { PAYMENT_METHODS, PRODUCT_KEYS, PRODUCT_NAMES } from '../lib/constants';
import { csvEscape, downloadText, formatDate, formatDateTime, formatINR, todayISO } from '../lib/format';
import { Button, Card, EmptyState, Field, Input, PageHeader, SearchInput, Select, StatusBadge, Tabs, useToast } from '../components/ui';

type TabKey = 'all' | 'credit' | 'partial' | 'paid' | 'cancelled';

export function BillsPage() {
  const { bills } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [product, setProduct] = useState<'' | ProductKey>('');
  const [method, setMethod] = useState<'' | PaymentMethod>('');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return [...bills]
      .filter((b) => {
        if (tab === 'cancelled' && b.status !== 'cancelled') return false;
        if (tab !== 'all' && tab !== 'cancelled' && b.status !== tab) return false;
        if (from && b.date < from) return false;
        if (to && b.date > to) return false;
        if (product && !b.items.some((i) => i.product === product)) return false;
        if (method && !(b.payments || []).some((p) => p.method === method)) return false;
        if (q) {
          const match =
            b.number.toLowerCase().includes(q) ||
            b.customer.name.toLowerCase().includes(q) ||
            (digits.length > 0 && (b.customer.phone || '').replace(/\D/g, '').includes(digits));
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  }, [bills, tab, query, from, to, product, method]);

  const summary = useMemo(() => {
    const live = filtered.filter((b) => b.status !== 'cancelled');
    return {
      count: filtered.length,
      sales: live.reduce((a, b) => a + b.total, 0),
      paid: live.reduce((a, b) => a + b.paid, 0),
      balance: live.reduce((a, b) => a + b.balance, 0)
    };
  }, [filtered]);

  const clear = () => {
    setQuery('');
    setFrom('');
    setTo('');
    setProduct('');
    setMethod('');
    setTab('all');
  };

  const exportCsv = async () => {
    const rows = [
      ['Bill No', 'Date', 'Customer', 'Mobile', 'Items', 'Subtotal', 'Discount', 'Additional', 'GST', 'Total', 'Paid', 'Balance', 'Status', 'Payments'],
      ...filtered.map((b) => [
        b.number,
        b.date,
        b.customer.name,
        b.customer.phone || '',
        b.items.map((i) => `${i.label} ${i.frameSizeLabel || (i.widthIn ? `${i.widthIn}x${i.heightIn}in` : '')} x${i.qty}`).join('; '),
        b.subtotal,
        b.discount,
        b.additionalCharges || 0,
        b.gstAmount || 0,
        b.total,
        b.paid,
        b.balance,
        b.status,
        (b.payments || []).map((p) => `${p.method} ${p.amount} on ${p.date}`).join('; ')
      ])
    ];
    try {
      const target = await downloadText(`kalai-bills-${todayISO()}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv');
      toast(target === 'native' ? 'Bills CSV saved to Downloads/KALAI DIGITAL' : 'Bills CSV downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const counts = {
    all: bills.filter((b) => b.status !== 'cancelled').length,
    credit: bills.filter((b) => b.status === 'credit').length,
    partial: bills.filter((b) => b.status === 'partial').length,
    paid: bills.filter((b) => b.status === 'paid').length,
    cancelled: bills.filter((b) => b.status === 'cancelled').length
  };

  return (
    <div className="page">
      <PageHeader
        title="Bill History"
        subtitle="Search, filter, reprint and export every saved invoice."
        actions={
          <>
            <Button variant="ghost" onClick={exportCsv} disabled={filtered.length === 0}><Download size={16} /> Export CSV</Button>
            <Button onClick={() => navigate('/billing')}><ReceiptText size={16} /> New Bill</Button>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <SummaryCard label="Bills shown" value={String(summary.count)} />
        <SummaryCard label="Sales value" value={formatINR(summary.sales)} />
        <SummaryCard label="Collected" value={formatINR(summary.paid)} />
        <SummaryCard label="Balance" value={formatINR(summary.balance)} danger={summary.balance > 0} />
      </div>

      <Card>
        <div className="row" style={{ gap: 9, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 230 }}><SearchInput value={query} onChange={setQuery} placeholder="Bill number, customer name or mobile…" /></div>
          <Button variant="ghost" onClick={() => setShowFilters((s) => !s)}><Search size={15} /> Filters {(from || to || product || method) ? '•' : ''}</Button>
          {(query || from || to || product || method || tab !== 'all') ? <Button variant="ghost" onClick={clear}><X size={15} /> Clear</Button> : null}
        </div>
        {showFilters ? (
          <div className="input-row" style={{ marginBottom: 12 }}>
            <Field label="From date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To date"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Product">
              <Select value={product} onChange={(e) => setProduct(e.target.value as ProductKey | '')}>
                <option value="">All products</option>
                {PRODUCT_KEYS.map((p) => <option key={p} value={p}>{PRODUCT_NAMES[p].en}</option>)}
              </Select>
            </Field>
            <Field label="Payment method">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
                <option value="">All methods</option>
                {PAYMENT_METHODS.filter((m) => m !== 'Credit').map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
          </div>
        ) : null}

        <Tabs<TabKey>
          tabs={[
            { key: 'all', label: 'All', count: counts.all },
            { key: 'credit', label: 'Unpaid', count: counts.credit },
            { key: 'partial', label: 'Partial', count: counts.partial },
            { key: 'paid', label: 'Paid', count: counts.paid },
            { key: 'cancelled', label: 'Cancelled', count: counts.cancelled }
          ]}
          value={tab}
          onChange={setTab}
        />

        {filtered.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="No bills match" text="Try clearing filters, or create a new bill." action={<Button size="sm" onClick={clear}>Clear filters</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="tbl stack-cards">
              <thead>
                <tr><th>Bill</th><th>Customer</th><th>Date</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th className="actions"></th></tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => navigate(`/bills/${b.id}`)}>
                    <td data-label="Bill"><div className="cell-main">{b.number}</div><div className="cell-sub">{b.items.length} item{b.items.length === 1 ? '' : 's'} · v{b.version}</div></td>
                    <td data-label="Customer"><div>{b.customer.name}</div><div className="cell-sub">{b.customer.phone || (b.customerId ? 'No mobile' : 'Walk-in')}</div></td>
                    <td data-label="Date"><div>{formatDate(b.date)}</div><div className="cell-sub">{formatDateTime(b.createdAt).split(', ')[1] || ''}</div></td>
                    <td className="num" data-label="Total"><b>{formatINR(b.total)}</b></td>
                    <td className="num" data-label="Paid">{formatINR(b.paid)}</td>
                    <td className="num" data-label="Balance" style={{ color: b.balance > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{formatINR(b.balance)}</td>
                    <td data-label="Status"><StatusBadge status={b.status} /></td>
                    <td className="actions" data-label=""><ChevronRight size={16} color="var(--text-3)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="stat-card" style={{ padding: '12px 14px' }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 19, color: danger ? 'var(--red)' : undefined }}>{value}</div>
    </div>
  );
}
