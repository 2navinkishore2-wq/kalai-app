import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer, Pencil, Download, Share2, Ban, WalletCards, History, FileText, CheckCircle2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { PaymentMethod } from '../lib/types';
import { PAYMENT_METHODS } from '../lib/constants';
import { formatDate, formatDateTime, formatINR, todayISO } from '../lib/format';
import { cancelBill, recordBillPayment } from '../services/bills';
import { shareInvoicePdf, downloadInvoicePdf } from '../services/pdf';
import { printThermalReceipt, printInvoiceDocument } from '../services/printer';
import { Button, Card, Field, Input, Modal, PageHeader, SectionNote, Select, StatusBadge, useToast } from '../components/ui';
import { InvoiceDocument } from '../components/InvoiceDocument';

export function BillDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const app = useApp();
  const bill = app.bills.find((b) => b.id === id);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'Cash' as PaymentMethod, date: todayISO(), reference: '' });
  const [payError, setPayError] = useState('');
  const [reason, setReason] = useState('');
  const autoRef = useMemo(() => params.get('print') === '1' || params.get('new') === '1', [params]);
  const printedRef = useMemo(() => ({ done: false }), []);

  useEffect(() => {
    if (!bill || !autoRef || printedRef.done) return;
    printedRef.done = true;
    if (params.get('print') === '1') {
      void printThermalReceipt(bill, app.settings).catch((e) => toast(`Printing failed: ${(e as Error).message}. The bill is saved.`, 'warn'));
    }
  }, [bill, autoRef, params, app.settings, toast, printedRef]);

  const audit = useMemo(() => {
    if (!bill) return [];
    return app.auditLogs
      .filter((a) => a.entityId === bill.id)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [app.auditLogs, bill]);

  if (!bill) {
    return (
      <div className="page">
        <PageHeader title="Bill not found" subtitle="It may have been removed, or the link is incorrect." actions={<Button onClick={() => navigate('/bills')}><ArrowLeft size={16} /> Bill History</Button>} />
      </div>
    );
  }

  const savePayment = async () => {
    setPayError('');
    const amount = parseFloat(pay.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setPayError('Enter a valid amount.');
    if (amount > bill.balance + 0.009) return setPayError(`Amount cannot exceed the balance of ${formatINR(bill.balance)}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pay.date)) return setPayError('Choose a valid payment date.');
    setBusy(true);
    try {
      await recordBillPayment(app.service, bill, { amount, method: pay.method, date: pay.date, reference: pay.reference.trim() }, app.user);
      toast('Payment recorded', 'success');
      setPayOpen(false);
      setPay({ amount: '', method: 'Cash', date: todayISO(), reference: '' });
    } catch (e) {
      setPayError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await cancelBill(app.service, bill, reason, app.user);
      toast('Bill cancelled. The record and audit trail are kept.', 'success');
      setCancelOpen(false);
      setReason('');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      await shareInvoicePdf(bill, app.settings);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const download = async () => {
    try {
      const target = await downloadInvoicePdf(bill, app.settings);
      toast(target === 'native' ? 'PDF saved to Downloads/KALAI DIGITAL' : 'PDF downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={bill.number}
        subtitle={`${formatDate(bill.date)} · ${bill.customer.name}${bill.cancelled ? ' · CANCELLED' : ''}`}
        eyebrow="INVOICE"
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/bills')}><ArrowLeft size={16} /> Back</Button>
            <Button variant="ghost" onClick={() => navigate(`/billing/${bill.id}`)} disabled={bill.status === 'cancelled'}><Pencil size={16} /> Edit</Button>
            <Button variant="ghost" onClick={() => void download()}><Download size={16} /> PDF</Button>
            <Button variant="ghost" onClick={() => void share()}><Share2 size={16} /> Share</Button>
            <Button onClick={() => void printThermalReceipt(bill, app.settings).catch((e) => toast(`Print failed: ${(e as Error).message}`, 'warn'))}><Printer size={16} /> Print</Button>
          </>
        }
      />

      {bill.status === 'cancelled' ? (
        <SectionNote tone="danger">
          This bill was cancelled{bill.cancelReason ? ` — ${bill.cancelReason}` : ''}. The original record is retained for audit and is excluded from sales reports.
        </SectionNote>
      ) : null}
      {params.get('new') === '1' ? (
        <SectionNote tone="success"><CheckCircle2 size={15} style={{ verticalAlign: -3, marginRight: 5 }} /> Bill saved successfully. Printing and sharing are optional and can be retried any time.</SectionNote>
      ) : null}

      <div className="detail-split">
        <div>
          <div className="print-area">
            <InvoiceDocument bill={bill} settings={app.settings} />
          </div>
          <div className="row no-print" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Button variant="ghost" size="sm" onClick={() => printInvoiceDocument(bill, app.settings)}><Printer size={15} /> A4 / System print</Button>
            <Button variant="ghost" size="sm" onClick={() => void printThermalReceipt(bill, app.settings).catch((e) => toast(`Print failed: ${(e as Error).message}`, 'warn'))}><Printer size={15} /> Receipt ({app.settings.receiptWidth}mm)</Button>
          </div>
        </div>

        <aside className="no-print detail-aside">
          <Card title="Payment & status">
            <div className="stack" style={{ gap: 4 }}>
              <div className="kv"><span>Total</span><b>{formatINR(bill.total)}</b></div>
              <div className="kv"><span>Paid</span><b style={{ color: 'var(--green)' }}>{formatINR(bill.paid)}</b></div>
              <div className="kv"><span>Balance</span><b style={{ color: bill.balance > 0 ? 'var(--red)' : 'var(--green)' }}>{formatINR(bill.balance)}</b></div>
              <div style={{ marginTop: 4 }}><StatusBadge status={bill.status} /></div>
            </div>
            {bill.balance > 0 && bill.status !== 'cancelled' ? (
              <Button block style={{ marginTop: 12 }} onClick={() => { setPay({ amount: String(bill.balance), method: 'Cash', date: todayISO(), reference: '' }); setPayOpen(true); }}>
                <WalletCards size={16} /> Record payment
              </Button>
            ) : null}
            {bill.payments.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>Payment records</div>
                {bill.payments.map((p, i) => (
                  <div key={i} className="kv" style={{ fontSize: 12 }}>
                    <span>{p.method} · {formatDate(p.date)}</span>
                    <b>{formatINR(p.amount)}</b>
                  </div>
                ))}
              </div>
            ) : null}
            {bill.status !== 'cancelled' ? (
              <Button block variant="ghost" style={{ marginTop: 10, color: 'var(--red)' }} onClick={() => setCancelOpen(true)}>
                <Ban size={15} /> Cancel bill
              </Button>
            ) : null}
            <div className="muted small" style={{ marginTop: 9 }}>Version {bill.version} · created {formatDateTime(bill.createdAt)}</div>
          </Card>

          <Card title="Audit trail" subtitle="Edits, payments and cancellations are never hidden.">
            {audit.length === 0 ? (
              <div className="muted small">No audit entries recorded for this bill yet.</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {audit.map((a) => (
                  <div key={a.id} style={{ borderLeft: '2px solid var(--brand-100)', paddingLeft: 9 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{a.summary}</div>
                    <div className="cell-sub">{a.action.toUpperCase()} · {a.userName} · {formatDateTime(a.at)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Quick actions">
            <div className="stack" style={{ gap: 7 }}>
              <Button variant="secondary" block onClick={() => navigate(`/customers/${bill.customerId || ''}`)} disabled={!bill.customerId}><FileText size={15} /> Customer profile</Button>
              <Button variant="ghost" block onClick={() => navigate('/billing')}><FileText size={15} /> New bill</Button>
              <Button variant="ghost" block onClick={() => navigate('/bills')}><History size={15} /> All bills</Button>
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        open={payOpen}
        title="Record payment"
        subtitle={`${bill.number} · balance ${formatINR(bill.balance)}`}
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void savePayment()} loading={busy}>Record payment</Button>
          </>
        }
      >
        <div className="input-row">
          <Field label="Amount" required><Input type="number" min={0} step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Method">
            <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.filter((m) => m !== 'Credit').map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Payment date"><Input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
          <Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="UPI / cheque no. (optional)" /></Field>
        </div>
        {payError ? <div className="form-error" style={{ marginTop: 8 }}>{payError}</div> : null}
        <SectionNote tone="info">A separate payment receipt is stored and the bill status updates automatically.</SectionNote>
      </Modal>

      <Modal
        open={cancelOpen}
        title="Cancel this bill?"
        subtitle="The bill is not deleted. It is marked cancelled and kept in the audit trail."
        onClose={() => setCancelOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={busy}>Keep bill</Button>
            <Button variant="danger" onClick={() => void cancel()} loading={busy}>Cancel bill</Button>
          </>
        }
      >
        <Field label="Reason for cancellation">
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate bill, customer cancelled the order…" maxLength={250} />
        </Field>
        <SectionNote tone="warn">Cancelled bills are excluded from sales and outstanding reports. The invoice remains viewable and shareable.</SectionNote>
      </Modal>
    </div>
  );
}
