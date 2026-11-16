import { useMemo, useState } from 'react';
import { BarChart3, CalendarRange, Download, FileText, IndianRupee, ReceiptText, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { addDaysISO, csvEscape, downloadText, formatDate, formatINR, monthKey, startOfMonth, todayISO } from '../lib/format';
import { round2, sum } from '../lib/money';
import {
  activeBills,
  customerSales,
  dailySales,
  expensesByCategory,
  monthlySales,
  outstandingByCustomer,
  paymentBreakdown,
  productSales,
  profitEstimate
} from '../services/analytics';
import { downloadReportPdf, pdfMoney, type ReportSection } from '../services/pdf';
import { Button, Card, EmptyState, Field, Input, PageHeader, SectionNote, StatCard, useToast } from '../components/ui';
import { AreaChart, BarChart, Donut } from '../components/charts';

type Preset = 'today' | 'week' | 'month' | 'lastMonth' | 'all' | 'custom';

function lastMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: todayISO(first), to: todayISO(last) };
}

export function ReportsPage() {
  const app = useApp();
  const toast = useToast();
  const today = todayISO();
  const initial = useMemo(() => {
    const m = lastMonthRange();
    return { from: startOfMonth(new Date()), to: today, preset: 'month' as Preset, lastMonth: m };
  }, [today]);
  const [preset, setPreset] = useState<Preset>(initial.preset);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const applyPreset = (value: Preset) => {
    setPreset(value);
    if (value === 'today') {
      setFrom(today);
      setTo(today);
    } else if (value === 'week') {
      setFrom(addDaysISO(today, -6));
      setTo(today);
    } else if (value === 'month') {
      setFrom(startOfMonth(new Date()));
      setTo(today);
    } else if (value === 'lastMonth') {
      setFrom(initial.lastMonth.from);
      setTo(initial.lastMonth.to);
    } else if (value === 'all') {
      setFrom('');
      setTo('');
    }
  };

  const within = (date: string) => (!from || date >= from) && (!to || date <= to);
  const rangeBills = useMemo(() => activeBills(app.bills.filter((b) => within(b.date))), [app.bills, from, to]);
  const billMap = useMemo(() => new Map(app.bills.map((b) => [b.id, b])), [app.bills]);
  const rangePayments = useMemo(
    () => app.payments.filter((p) => within(p.date) && (!p.billId || billMap.get(p.billId)?.status !== 'cancelled')),
    [app.payments, billMap, from, to]
  );

  const sales = useMemo(() => round2(sum(rangeBills.map((b) => b.total))), [rangeBills]);
  const collected = useMemo(() => round2(sum(rangePayments.map((p) => p.amount))), [rangePayments]);
  const outstanding = useMemo(() => round2(sum(rangeBills.map((b) => b.balance))), [rangeBills]);
  const profit = useMemo(
    () => profitEstimate(app.bills, app.products, app.expenses, from || '0000-01-01', to || '9999-12-31'),
    [app.bills, app.products, app.expenses, from, to]
  );

  const products = useMemo(() => productSales(rangeBills), [rangeBills]);
  const methods = useMemo(() => paymentBreakdown(rangePayments), [rangePayments]);
  const customers = useMemo(() => customerSales(rangeBills, app.customers).slice(0, 10), [rangeBills, app.customers]);
  const dues = useMemo(() => outstandingByCustomer(rangeBills).filter((d) => d.pending > 0), [rangeBills]);
  const expenseRows = useMemo(() => expensesByCategory(app.expenses, from || undefined, to || undefined), [app.expenses, from, to]);
  const expenseSum = useMemo(() => round2(sum(expenseRows.map((e) => e.amount))), [expenseRows]);

  const trend = useMemo(() => {
    if (!to) return monthlySales(app.bills, today.slice(0, 7), 6);
    const start = from || addDaysISO(to, -29);
    const days = Math.max(1, Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1);
    if (days <= 31) return dailySales(app.bills, to, days);
    const months = Math.min(12, Math.max(2, Math.round(days / 30)));
    return monthlySales(app.bills, monthKey(to), months);
  }, [app.bills, from, to, today]);

  const periodLabel = from || to ? `${from ? formatDate(from) : 'Beginning'} → ${to ? formatDate(to) : 'Today'}` : 'All time';

  const reportSections = (): ReportSection[] => [
    {
      title: 'Summary',
      columns: ['Measure', 'Value'],
      rows: [
        ['Invoices in period', rangeBills.length],
        ['Sales (invoice value)', pdfMoney(sales)],
        ['Payments received', pdfMoney(collected)],
        ['Outstanding balance', pdfMoney(outstanding)],
        ['Expenses', pdfMoney(expenseSum)],
        ['Estimated material cost', pdfMoney(profit.materialCost)],
        ['Estimated net profit', pdfMoney(profit.netProfit)]
      ],
      numericColumns: [1]
    },
    {
      title: 'Sales by product',
      columns: ['Product', 'Qty', 'Sq.ft', 'Sales'],
      rows: products.map((p) => [p.label, p.qty, p.sqft, pdfMoney(p.sales)]),
      numericColumns: [1, 2, 3],
      summary: [['Total product sales', pdfMoney(sum(products.map((p) => p.sales)))]]
    },
    {
      title: 'Payments by method',
      columns: ['Method', 'Receipts', 'Amount'],
      rows: methods.map((m) => [m.method, m.count, pdfMoney(m.amount)]),
      numericColumns: [1, 2],
      summary: [['Total received', pdfMoney(collected)]]
    },
    {
      title: 'Top customers',
      columns: ['Customer', 'Mobile', 'Bills', 'Sales', 'Pending'],
      rows: customers.map((c) => [c.name, c.phone || '—', c.bills, pdfMoney(c.sales), pdfMoney(c.pending)]),
      numericColumns: [2, 3, 4]
    },
    {
      title: 'Outstanding by customer',
      columns: ['Customer', 'Bills', 'Pending', 'Oldest bill'],
      rows: dues.map((d) => [d.name, d.bills, pdfMoney(d.pending), formatDate(d.oldest)]),
      numericColumns: [1, 2],
      summary: [['Total outstanding', pdfMoney(outstanding)]]
    },
    {
      title: 'Expenses by category',
      columns: ['Category', 'Amount'],
      rows: expenseRows.map((e) => [e.category, pdfMoney(e.amount)]),
      numericColumns: [1],
      summary: [['Total expenses', pdfMoney(expenseSum)]]
    }
  ];

  const exportPdf = async () => {
    try {
      const target = await downloadReportPdf('Business report', `Period: ${periodLabel}`, reportSections(), `kalai-report-${today}`, app.settings);
      toast(target === 'native' ? 'Report PDF saved to Downloads/KALAI DIGITAL' : 'Report PDF downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const exportCsv = async () => {
    const line = (values: unknown[]) => values.map(csvEscape).join(',');
    const rows: string[] = [];
    rows.push(line(['KALAI DIGITAL — Business report']));
    rows.push(line(['Period', periodLabel]));
    rows.push(line(['Generated', new Date().toLocaleString('en-IN')]));
    rows.push('');
    for (const section of reportSections()) {
      rows.push(line([section.title]));
      rows.push(line(section.columns));
      for (const r of section.rows) rows.push(line(r));
      if (section.summary) for (const [label, value] of section.summary) rows.push(line([label, value]));
      rows.push('');
    }
    try {
      const target = await downloadText(`kalai-report-${today}.csv`, rows.join('\n'), 'text/csv');
      toast(target === 'native' ? 'Report CSV saved to Downloads/KALAI DIGITAL' : 'Report CSV downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Real figures from your saved bills, payments, expenses and stock. No sample data."
        eyebrow="BUSINESS INTELLIGENCE"
        actions={
          <>
            <Button variant="ghost" onClick={exportCsv}><Download size={16} /> Export CSV</Button>
            <Button onClick={exportPdf}><FileText size={16} /> Export PDF</Button>
          </>
        }
      />

      <Card title="Reporting period" subtitle={periodLabel}>
        <div className="chip-row" style={{ marginBottom: 11 }}>
          {([
            ['today', 'Today'],
            ['week', 'Last 7 days'],
            ['month', 'This month'],
            ['lastMonth', 'Last month'],
            ['all', 'All time'],
            ['custom', 'Custom']
          ] as [Preset, string][]).map(([key, label]) => (
            <button key={key} className={`chip${preset === key ? ' active' : ''}`} onClick={() => applyPreset(key)}>{label}</button>
          ))}
        </div>
        <div className="input-row">
          <Field label="From date"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} /></Field>
          <Field label="To date"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} /></Field>
          <Field label="Summary">
            <div className="calc-preview" style={{ minHeight: 38, display: 'flex', alignItems: 'center' }}>
              {rangeBills.length} bill{rangeBills.length === 1 ? '' : 's'} · {formatINR(sales)} sales · {rangePayments.length} payment{rangePayments.length === 1 ? '' : 's'}
            </div>
          </Field>
        </div>
      </Card>

      <div className="grid grid-3" style={{ marginTop: 14, marginBottom: 14 }}>
        <StatCard label="Sales" value={formatINR(sales)} icon={<IndianRupee size={16} />} tone="brand" hint={`${rangeBills.length} invoice${rangeBills.length === 1 ? '' : 's'} in period`} />
        <StatCard label="Payments received" value={formatINR(collected)} icon={<WalletCards size={16} />} tone="green" hint={`${rangePayments.length} receipt${rangePayments.length === 1 ? '' : 's'}`} />
        <StatCard label="Expenses" value={formatINR(expenseSum)} icon={<TrendingDown size={16} />} tone="red" hint={`${expenseRows.length} categor${expenseRows.length === 1 ? 'y' : 'ies'}`} />
        <StatCard label="Estimated net profit" value={formatINR(profit.netProfit)} icon={<TrendingUp size={16} />} tone={profit.netProfit >= 0 ? 'green' : 'red'} hint="Sales − material cost − expenses" />
        <StatCard label="Outstanding" value={formatINR(outstanding)} icon={<ReceiptText size={16} />} tone="gold" hint={`${dues.length} customer${dues.length === 1 ? '' : 's'} with a balance`} />
        <StatCard label="Average bill" value={formatINR(rangeBills.length > 0 ? sales / rangeBills.length : 0)} icon={<BarChart3 size={16} />} tone="blue" hint="Sales ÷ invoices" />
      </div>

      <Card title="Sales trend" subtitle={trend.length <= 31 ? 'Daily sales in the selected period' : 'Monthly sales trend'}>
        {trend.every((p) => p.value === 0) ? (
          <EmptyState icon={<CalendarRange size={22} />} title="No sales in this period" text="Change the reporting period, or create a bill to see the trend." />
        ) : trend.length <= 14 ? (
          <BarChart data={trend} tone="brand" />
        ) : (
          <AreaChart data={trend} />
        )}
      </Card>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Card title="Sales by product" subtitle="Quantities, area and invoice value" padded={false}>
          {products.length === 0 ? (
            <EmptyState icon={<BarChart3 size={22} />} title="No product sales" text="No bills in the selected period." />
          ) : (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="tbl">
                <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Sq.ft</th><th className="num">Sales</th></tr></thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.product}>
                      <td>{p.label}</td>
                      <td className="num">{p.qty}</td>
                      <td className="num">{p.sqft ? p.sqft.toFixed(2) : '—'}</td>
                      <td className="num"><b>{formatINR(p.sales)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Payments by method" subtitle="Collected in the selected period">
          <Donut data={methods.map((m) => ({ label: m.method, value: m.amount }))} />
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Card title="Top customers" subtitle="Ranked by invoice value in the period" padded={false}>
          {customers.length === 0 ? (
            <EmptyState icon={<ReceiptText size={22} />} title="No customer sales" text="Customer activity will appear here." />
          ) : (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="tbl">
                <thead><tr><th>Customer</th><th className="num">Bills</th><th className="num">Sales</th><th className="num">Pending</th></tr></thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.customerId}>
                      <td><div className="cell-main">{c.name}</div><div className="cell-sub">{c.phone || 'No mobile'}</div></td>
                      <td className="num">{c.bills}</td>
                      <td className="num"><b>{formatINR(c.sales)}</b></td>
                      <td className="num" style={{ color: c.pending > 0 ? 'var(--red)' : 'var(--green)' }}>{formatINR(c.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Outstanding balance" subtitle="Unpaid invoices in the selected period" padded={false}>
          {dues.length === 0 ? (
            <EmptyState icon={<ReceiptText size={22} />} title="Nothing outstanding" text="Every invoice in this period is fully paid." />
          ) : (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="tbl">
                <thead><tr><th>Customer</th><th className="num">Bills</th><th className="num">Pending</th><th>Oldest</th></tr></thead>
                <tbody>
                  {dues.map((d) => (
                    <tr key={d.customerId}>
                      <td><div className="cell-main">{d.name}</div><div className="cell-sub">{d.phone || 'No mobile'}</div></td>
                      <td className="num">{d.bills}</td>
                      <td className="num"><b style={{ color: 'var(--red)' }}>{formatINR(d.pending)}</b></td>
                      <td>{formatDate(d.oldest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Expenses by category" subtitle="Costs recorded in the selected period" padded={false}>
        {expenseRows.length === 0 ? (
          <EmptyState icon={<TrendingDown size={22} />} title="No expenses recorded" text="Add expenses to see their effect on profit." />
        ) : (
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="tbl">
              <thead><tr><th>Category</th><th className="num">Amount</th><th className="num">Share</th></tr></thead>
              <tbody>
                {expenseRows.map((e) => (
                  <tr key={e.category}>
                    <td>{e.category}</td>
                    <td className="num"><b>{formatINR(e.amount)}</b></td>
                    <td className="num">{expenseSum > 0 ? `${((e.amount / expenseSum) * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SectionNote tone="info">
        Profit is an estimate: sales minus the product cost per sq.ft configured in Products &amp; Rates, minus recorded expenses. Frame material cost is not estimated, and no cost is invented when a cost field is left at zero.
      </SectionNote>
    </div>
  );
}
