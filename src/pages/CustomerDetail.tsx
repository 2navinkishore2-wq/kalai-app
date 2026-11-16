import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Mail, MapPin, Pencil, Phone, Plus, ReceiptText, StickyNote, WalletCards } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { updateCustomer } from '../services/customers';
import { addAudit } from '../services/audit';
import { activeBills } from '../services/analytics';
import { formatDate, formatDateTime, formatINR } from '../lib/format';
import { downloadReportPdf, pdfMoney, safeFileName, type ReportSection } from '../services/pdf';
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SectionNote, StatCard, StatusBadge, useToast } from '../components/ui';

export function CustomerDetailPage() {
  const { id } = useParams();
  const app = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const customer = app.customers.find((c) => c.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', address: '', email: '', notes: '' });

  const bills = useMemo(
    () => activeBills(app.bills.filter((b) => b.customerId === id)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [app.bills, id]
  );
  const allBills = useMemo(() => app.bills.filter((b) => b.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1)), [app.bills, id]);
  const payments = useMemo(
    () => app.payments.filter((p) => p.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [app.payments, id]
  );

  const totals = useMemo(() => {
    let purchases = 0;
    let paid = 0;
    let pending = 0;
    for (const b of bills) {
      purchases += b.total;
      paid += b.paid;
      pending += b.balance;
    }
    return { purchases, paid, pending };
  }, [bills]);

  if (!customer) {
    return (
      <div className="page">
        <PageHeader
          title="Customer not found"
          subtitle="The customer may have been removed, or the link is incorrect."
          actions={<Button onClick={() => navigate('/customers')}><ArrowLeft size={16} /> Customers</Button>}
        />
      </div>
    );
  }

  const openEdit = () => {
    setForm({
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
      email: customer.email || '',
      notes: customer.notes || ''
    });
    setError('');
    setEditOpen(true);
  };

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('Customer name is required.');
    setSaving(true);
    try {
      await updateCustomer(app.service, customer.id, form);
      await addAudit(app.service, app.user, {
        entity: 'customer',
        entityId: customer.id,
        action: 'update',
        summary: `Customer ${form.name.trim()} updated`
      });
      toast('Customer updated', 'success');
      setEditOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const downloadStatement = async () => {
    const invoiceRows = allBills.map((b) => [
      b.number,
      formatDate(b.date),
      b.items.length,
      pdfMoney(b.total),
      pdfMoney(b.paid),
      pdfMoney(b.balance),
      b.status === 'cancelled' ? 'Cancelled' : b.status === 'paid' ? 'Paid' : b.status === 'partial' ? 'Partial' : 'Unpaid'
    ]);
    const paymentRows = payments.map((p) => [formatDate(p.date), p.billNumber || '—', p.method, p.reference || '—', pdfMoney(p.amount)]);
    const sections: ReportSection[] = [
      {
        title: 'Invoices',
        columns: ['Bill No', 'Date', 'Items', 'Total', 'Paid', 'Balance', 'Status'],
        rows: invoiceRows,
        numericColumns: [2, 3, 4, 5],
        summary: [
          ['Invoices (excluding cancelled)', String(bills.length)],
          ['Lifetime purchases', pdfMoney(totals.purchases)],
          ['Collected', pdfMoney(totals.paid)],
          ['Outstanding balance', pdfMoney(totals.pending)]
        ]
      },
      {
        title: 'Payments received',
        columns: ['Date', 'Bill', 'Method', 'Reference', 'Amount'],
        rows: paymentRows,
        numericColumns: [4],
        summary: [['Total payments', pdfMoney(payments.reduce((a, p) => a + p.amount, 0))]]
      }
    ];
    try {
      const target = await downloadReportPdf(
        `Customer statement — ${customer.name}`,
        `${customer.phone || 'No mobile number'}${customer.address ? ` · ${customer.address}` : ''}`,
        sections,
        `${safeFileName(customer.name, 'customer')}_statement`,
        app.settings
      );
      toast(target === 'native' ? 'Statement PDF saved to Downloads/KALAI DIGITAL' : 'Statement PDF downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={customer.name}
        subtitle={`Customer since ${formatDate(customer.createdAt.slice(0, 10))}${customer.phone ? ` · ${customer.phone}` : ' · No mobile number'}`}
        eyebrow="CUSTOMER PROFILE"
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/customers')}><ArrowLeft size={16} /> Back</Button>
            <Button variant="ghost" onClick={openEdit}><Pencil size={16} /> Edit</Button>
            <Button variant="ghost" onClick={() => void downloadStatement()}><Download size={16} /> Statement PDF</Button>
            <Button onClick={() => navigate(`/billing?customer=${customer.id}`)}><Plus size={16} /> New Bill</Button>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Lifetime purchases" value={formatINR(totals.purchases)} icon={<ReceiptText size={16} />} tone="brand" hint={`${bills.length} active invoice${bills.length === 1 ? '' : 's'}`} />
        <StatCard label="Total paid" value={formatINR(totals.paid)} icon={<WalletCards size={16} />} tone="green" hint={`${payments.length} payment record${payments.length === 1 ? '' : 's'}`} />
        <StatCard label="Outstanding" value={formatINR(totals.pending)} icon={<FileText size={16} />} tone="red" hint={totals.pending > 0 ? 'Balance to collect' : 'Nothing due'} />
        <StatCard label="Average bill" value={formatINR(bills.length > 0 ? totals.purchases / bills.length : 0)} icon={<ReceiptText size={16} />} tone="gold" hint="Across active invoices" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 330px', alignItems: 'start' }}>
        <div>
          <Card title="Invoice history" subtitle="Cancelled bills stay visible for audit but are excluded from totals." padded={false}>
            {allBills.length === 0 ? (
              <EmptyState
                icon={<ReceiptText size={22} />}
                title="No invoices yet"
                text="Create the first bill for this customer."
                action={<Button size="sm" onClick={() => navigate(`/billing?customer=${customer.id}`)}><Plus size={15} /> New Bill</Button>}
              />
            ) : (
              <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
                <table className="tbl stack-cards">
                  <thead><tr><th>Bill</th><th>Date</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th></tr></thead>
                  <tbody>
                    {allBills.map((b) => (
                      <tr key={b.id} className="clickable" onClick={() => navigate(`/bills/${b.id}`)}>
                        <td data-label="Bill"><div className="cell-main">{b.number}</div><div className="cell-sub">{b.items.length} item{b.items.length === 1 ? '' : 's'}</div></td>
                        <td data-label="Date">{formatDate(b.date)}</td>
                        <td className="num" data-label="Total"><b>{formatINR(b.total)}</b></td>
                        <td className="num" data-label="Paid">{formatINR(b.paid)}</td>
                        <td className="num" data-label="Balance" style={{ color: b.balance > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{formatINR(b.balance)}</td>
                        <td data-label="Status"><StatusBadge status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Payments" subtitle="Every receipt recorded against this customer." padded={false}>
            {payments.length === 0 ? (
              <EmptyState icon={<WalletCards size={22} />} title="No payments yet" text="Payments appear here as soon as a bill is paid." />
            ) : (
              <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
                <table className="tbl stack-cards">
                  <thead><tr><th>Date</th><th>Bill</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className={p.billId ? 'clickable' : ''} onClick={() => p.billId && navigate(`/bills/${p.billId}`)}>
                        <td data-label="Date">{formatDate(p.date)}</td>
                        <td data-label="Bill">{p.billNumber || '—'}</td>
                        <td data-label="Method"><span className="pill">{p.method}</span></td>
                        <td data-label="Reference">{p.reference || '—'}</td>
                        <td className="num" data-label="Amount"><b>{formatINR(p.amount)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <aside>
          <Card title="Contact details">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
              <Avatar name={customer.name} src={customer.photo} size={52} />
              <div>
                <div style={{ fontWeight: 700 }}>{customer.name}</div>
                <div className="cell-sub">Added {formatDate(customer.createdAt.slice(0, 10))}</div>
              </div>
            </div>
            <div className="stack" style={{ gap: 9 }}>
              <div className="kv"><span><Phone size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Mobile</span><b>{customer.phone || 'Not added'}</b></div>
              <div className="kv"><span><Mail size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Email</span><b>{customer.email || 'Not added'}</b></div>
              <div className="kv"><span><MapPin size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Address</span><b style={{ textAlign: 'right', maxWidth: 190 }}>{customer.address || 'Not added'}</b></div>
            </div>
            <div className="divider" />
            <Button block variant="secondary" onClick={() => navigate(`/billing?customer=${customer.id}`)}><Plus size={15} /> Create invoice</Button>
            <Button block variant="ghost" style={{ marginTop: 7 }} onClick={openEdit}><Pencil size={15} /> Edit details</Button>
          </Card>

          <Card title="Notes">
            {customer.notes ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>{customer.notes}</p> : <div className="muted small"><StickyNote size={14} style={{ verticalAlign: -2, marginRight: 5 }} />No notes saved for this customer.</div>}
          </Card>

          <SectionNote tone="info">Mobile number is optional. You can bill this customer without a phone number.</SectionNote>
        </aside>
      </div>

      <Modal
        open={editOpen}
        title="Edit customer"
        onClose={() => setEditOpen(false)}
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} loading={saving}>Save changes</Button>
          </>
        }
      >
        <div className="input-row">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} /></Field>
          <Field label="Mobile number" hint="Optional"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" maxLength={18} /></Field>
        </div>
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Address" hint="Optional"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={180} /></Field>
          <Field label="Email" hint="Optional"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="Notes" hint="Optional"><textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={300} /></Field>
        </div>
        {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
        <div className="muted small" style={{ marginTop: 10 }}>Last updated {formatDateTime(customer.updatedAt || customer.createdAt)}</div>
      </Modal>
    </div>
  );
}
