import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Database,
  Download,
  FileText,
  Languages,
  Palette,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { UpdateStatusMessage, useUpdates } from '../store/UpdateContext';
import { PRODUCT_CONFIG_VERSION } from '../lib/products';
import type { BusinessSettings, DiscountType, Language, ThemeMode } from '../lib/types';
import { addAudit } from '../services/audit';
import { backupFileName, downloadBackup, exportBackup, importBackup, readBackupFile, type BackupFile } from '../services/backup';
import { printThermalReceipt, printerSupportNote } from '../services/printer';
import { previewInvoiceNumber, validateInvoicePattern } from '../lib/invoiceNumber';
import { formatDateTime, formatINR } from '../lib/format';
import { feedUrl } from '../lib/updates';
import { platformLabel } from '../lib/platform';
import { describePaymentChange, isValidBusinessMobile, isValidUpiId, paymentQrSrc, readPaymentQrFile } from '../lib/payment';
import { Button, Card, Field, Input, Modal, PageHeader, SectionNote, Select, Tabs, useToast } from '../components/ui';

type TabKey = 'business' | 'billing' | 'invoice' | 'payment' | 'workspace' | 'account' | 'data' | 'about';

export function SettingsPage() {
  const app = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>('business');
  const [draft, setDraft] = useState<BusinessSettings>(app.settings);
  const [allowedText, setAllowedText] = useState((app.settings.access.allowedEmails || []).join('\n'));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseText, setEraseText] = useState('');
  const [erasing, setErasing] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const [restoreName, setRestoreName] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [qrError, setQrError] = useState('');
  const [qrBusy, setQrBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qrFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(app.settings);
    setAllowedText((app.settings.access.allowedEmails || []).join('\n'));
    setQrError('');
  }, [app.settings]);

  const canEdit = app.isOwner;
  const invoicePreview = useMemo(() => previewInvoiceNumber(draft.invoiceFormat, draft.invoicePrefix, draft.invoiceStart), [draft.invoiceFormat, draft.invoicePrefix, draft.invoiceStart]);

  const update = (patch: Partial<BusinessSettings>) => setDraft((d) => ({ ...d, ...patch }));

  const updatePayment = (patch: Partial<BusinessSettings['payment']>) =>
    setDraft((d) => ({ ...d, payment: { ...d.payment, ...patch } }));

  const pickQr = async (file: File | null) => {
    if (!file) return;
    setQrBusy(true);
    setQrError('');
    try {
      // Keeps the supplied QR pixels (only scaled, never redrawn) and stores a
      // durable data URL with the account so Android and Windows agree.
      const dataUrl = await readPaymentQrFile(file);
      updatePayment({ qrImage: dataUrl });
    } catch (e) {
      setQrError((e as Error).message);
    } finally {
      setQrBusy(false);
      if (qrFileRef.current) qrFileRef.current.value = '';
    }
  };

  const save = async () => {
    setError('');
    if (!canEdit) return setError('Only the workspace owner can change settings.');
    if (!draft.nameEn.trim()) return setError('Business name is required.');
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return setError('Enter a valid business email address.');
    const patternError = validateInvoicePattern(draft.invoiceFormat);
    if (patternError) return setError(patternError);
    if (!Number.isFinite(draft.invoiceStart) || draft.invoiceStart < 1) return setError('Invoice start number must be 1 or more.');
    if (!Number.isFinite(draft.gstRate) || draft.gstRate < 0 || draft.gstRate > 100) return setError('GST rate must be between 0 and 100.');
    if (draft.access.ownerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.access.ownerEmail.trim())) return setError('Enter a valid owner email address.');
    if (!isValidUpiId(draft.payment.upiId)) return setError('Enter a valid UPI ID such as name@bank, or leave it blank.');
    if (!isValidBusinessMobile(draft.payment.businessMobile)) return setError('Enter a valid business mobile number, or leave it blank.');
    const allowed = allowedText.split(/[\n,]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    for (const email of allowed) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(`"${email}" is not a valid email address.`);
    }
    setSaving(true);
    try {
      const access = { ...draft.access, allowedEmails: [...new Set(allowed)] };
      const paymentChange = describePaymentChange(app.settings.payment, draft.payment);
      await app.service.set('settings', 'business', { ...draft, id: 'business', access });
      await addAudit(app.service, app.user, {
        entity: 'settings',
        entityId: 'business',
        action: 'update',
        summary: `Settings updated (${draft.language === 'ta' ? 'Tamil' : 'English'}, ${draft.theme} theme, GST ${draft.gstEnabled ? `${draft.gstRate}%` : 'off'})${paymentChange.upiChanged ? ' · UPI ID changed' : ''}${paymentChange.qrChanged ? ' · payment QR changed' : ''}`
      });
      toast('Settings saved', 'success');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(app.settings);
    setAllowedText((app.settings.access.allowedEmails || []).join('\n'));
    setError('');
  };

  const doExport = async () => {
    setBackupBusy(true);
    try {
      const file = await exportBackup(app.service);
      const target = await downloadBackup(file);
      const count = Object.values(file.data).reduce((a, rows) => a + rows.length, 0);
      toast(
        `${count} documents backed up${target === 'native' ? ' to Downloads/KALAI DIGITAL' : ''}`,
        'success'
      );
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const pickBackup = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = await readBackupFile(file);
      setPendingBackup(parsed);
      setRestoreName(file.name);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doRestore = async () => {
    if (!pendingBackup) return;
    setRestoring(true);
    try {
      const result = await importBackup(app.service, pendingBackup);
      await addAudit(app.service, app.user, {
        entity: 'settings',
        entityId: 'business',
        action: 'restore',
        summary: `Backup restored — ${result.documents} documents across ${result.collections} collections`
      });
      toast(`Restore complete: ${result.documents} documents`, 'success');
      setPendingBackup(null);
      setRestoreName('');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRestoring(false);
    }
  };

  const doErase = async () => {
    if (eraseText !== 'DELETE') return;
    setErasing(true);
    try {
      await app.service.clearLocalData();
      setEraseOpen(false);
      setEraseText('');
      toast('Business data erased', 'success');
      setTimeout(() => app.reload(), 900);
    } catch (e) {
      toast((e as Error).message, 'error');
      setErasing(false);
    }
  };

  const testPrint = async () => {
    const bill = app.bills[0];
    if (!bill) return toast('Create a bill first, then test the printer with it.', 'warn');
    try {
      await printThermalReceipt(bill, draft);
      toast('Print dialog opened', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const documentCounts = [
    ['Bills', app.bills.length],
    ['Customers', app.customers.length],
    ['Payments', app.payments.length],
    ['Expenses', app.expenses.length],
    ['Audit entries', app.auditLogs.length]
  ] as const;

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        subtitle="Business identity, rates, invoice numbering, access and backups."
        eyebrow="WORKSPACE"
        actions={
          canEdit ? (
            <>
              <Button variant="ghost" onClick={reset} disabled={saving}>Reset</Button>
              <Button onClick={() => void save()} loading={saving}><Save size={16} /> Save changes</Button>
            </>
          ) : <span className="pill pill-gold">Owner access required</span>
        }
      />

      {!canEdit ? <SectionNote tone="warn">You can review these settings, but only the workspace owner can change them.</SectionNote> : null}

      <Tabs<TabKey>
        tabs={[
          { key: 'business', label: 'Business' },
          { key: 'billing', label: 'Billing & Tax' },
          { key: 'invoice', label: 'Invoice' },
          { key: 'payment', label: 'Payment QR' },
          { key: 'workspace', label: 'Workspace' },
          { key: 'account', label: 'Account & Access' },
          { key: 'data', label: 'Backup & Data' },
          { key: 'about', label: 'About & Updates' }
        ]}
        value={tab}
        onChange={setTab}
      />

      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {tab === 'business' ? (
          <>
            <Card title={<span><Building2 size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Business identity</span>} subtitle="Shown on invoices, receipts and the workspace.">
              <div className="form-grid">
                <Field label="Business name (English)" required><Input value={draft.nameEn} onChange={(e) => update({ nameEn: e.target.value })} maxLength={80} /></Field>
                <Field label="Business name (Tamil)"><Input value={draft.nameTa} onChange={(e) => update({ nameTa: e.target.value })} maxLength={80} /></Field>
                <Field label="Tagline"><Input value={draft.tagline} onChange={(e) => update({ tagline: e.target.value })} maxLength={120} /></Field>
                <Field label="Phone"><Input value={draft.phone} onChange={(e) => update({ phone: e.target.value })} maxLength={30} inputMode="tel" /></Field>
                <Field label="Email"><Input type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} maxLength={120} /></Field>
                <Field label="GSTIN" hint="Optional"><Input value={draft.gstin} onChange={(e) => update({ gstin: e.target.value })} maxLength={30} /></Field>
              </div>
              <div style={{ marginTop: 10 }}>
                <Field label="Address"><textarea className="textarea" value={draft.address} onChange={(e) => update({ address: e.target.value })} maxLength={300} /></Field>
              </div>
              <div className="input-row" style={{ marginTop: 10 }}>
                <Field label="Logo URL" hint="The supplied KB logo is the default. Paste a URL only if you want to replace it.">
                  <Input value={draft.logoUrl} onChange={(e) => update({ logoUrl: e.target.value })} maxLength={300} />
                </Field>
                <Field label="Show logo on invoice">
                  <label className="check" style={{ minHeight: 38 }}>
                    <input type="checkbox" checked={draft.showLogoOnInvoice} onChange={(e) => update({ showLogoOnInvoice: e.target.checked })} />
                    Print the logo on invoices and receipts
                  </label>
                </Field>
              </div>
            </Card>

            <Card title="Invoice text" subtitle="These lines appear at the bottom of every invoice.">
              <div className="input-row">
                <Field label="Footer line"><Input value={draft.invoiceFooter} onChange={(e) => update({ invoiceFooter: e.target.value })} maxLength={140} /></Field>
                <Field label="Tamil thank-you line"><Input value={draft.thankYou} onChange={(e) => update({ thankYou: e.target.value })} maxLength={140} /></Field>
              </div>
              <div style={{ marginTop: 10 }}>
                <Field label="Terms & conditions"><textarea className="textarea" value={draft.terms} onChange={(e) => update({ terms: e.target.value })} maxLength={500} /></Field>
              </div>
            </Card>
          </>
        ) : null}

        {tab === 'billing' ? (
          <>
            <Card title={<span><ReceiptText size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Tax & discounts</span>} subtitle="Applied to new bills. Saved bills keep their original tax values.">
              <div className="input-row">
                <Field label="GST enabled">
                  <label className="check" style={{ minHeight: 38 }}>
                    <input type="checkbox" checked={draft.gstEnabled} onChange={(e) => update({ gstEnabled: e.target.checked })} />
                    Enable GST on bills
                  </label>
                </Field>
                <Field label="GST rate (%)"><Input type="number" min={0} max={100} step="any" value={draft.gstRate} onChange={(e) => update({ gstRate: parseFloat(e.target.value) || 0 })} /></Field>
                <Field label="GST mode">
                  <Select value={draft.gstInclusive ? 'inclusive' : 'exclusive'} onChange={(e) => update({ gstInclusive: e.target.value === 'inclusive' })}>
                    <option value="exclusive">Exclusive — add GST to the total</option>
                    <option value="inclusive">Inclusive — GST inside the total</option>
                  </Select>
                </Field>
              </div>
              <div className="input-row" style={{ marginTop: 10 }}>
                <Field label="Discounts">
                  <label className="check" style={{ minHeight: 38 }}>
                    <input type="checkbox" checked={draft.discountEnabled} onChange={(e) => update({ discountEnabled: e.target.checked })} />
                    Allow discounts while billing
                  </label>
                </Field>
                <Field label="Default discount type">
                  <Select value={draft.defaultDiscountType} onChange={(e) => update({ defaultDiscountType: e.target.value as DiscountType })}>
                    <option value="amount">Rupee amount</option>
                    <option value="percent">Percentage</option>
                  </Select>
                </Field>
              </div>
            </Card>

            <Card title="Invoice numbering" subtitle="Every bill gets a unique number. The counter lives in your account, not in this browser.">
              <div className="input-row">
                <Field label="Prefix" required><Input value={draft.invoicePrefix} onChange={(e) => update({ invoicePrefix: e.target.value })} maxLength={12} /></Field>
                <Field label="Start number" required><Input type="number" min={1} step={1} value={draft.invoiceStart} onChange={(e) => update({ invoiceStart: parseInt(e.target.value, 10) || 1 })} /></Field>
                <Field label="Format" required hint="Tokens: {PREFIX} {YYYY} {YY} {MM} {SEQ} or {SEQ:4}">
                  <Input value={draft.invoiceFormat} onChange={(e) => update({ invoiceFormat: e.target.value })} maxLength={50} />
                </Field>
              </div>
              <div className="calc-preview" style={{ marginTop: 10 }}>Next bill preview: <b>{invoicePreview}</b></div>
              <SectionNote tone="info">Changing the prefix or format only affects new bills. Existing bill numbers are never rewritten.</SectionNote>
            </Card>
          </>
        ) : null}

        {tab === 'invoice' ? (
          <>
            <Card title={<span><FileText size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Invoice display</span>} subtitle="Choose what the printed invoice shows.">
              <div className="input-row">
                <Field label="Receipt width">
                  <Select value={String(draft.receiptWidth)} onChange={(e) => update({ receiptWidth: Number(e.target.value) === 58 ? 58 : 80 })}>
                    <option value="58">58 mm thermal</option>
                    <option value="80">80 mm thermal</option>
                  </Select>
                </Field>
                <Field label="Show rate column">
                  <label className="check" style={{ minHeight: 38 }}>
                    <input type="checkbox" checked={draft.showRateOnInvoice} onChange={(e) => update({ showRateOnInvoice: e.target.checked })} />
                    Print the rate on invoices
                  </label>
                </Field>
                <Field label="Show sq.ft column">
                  <label className="check" style={{ minHeight: 38 }}>
                    <input type="checkbox" checked={draft.showSqftOnInvoice} onChange={(e) => update({ showSqftOnInvoice: e.target.checked })} />
                    Print square feet on invoices
                  </label>
                </Field>
              </div>
              <SectionNote tone="info">The invoice preview is available from any saved bill. “A4 / System print” uses the operating system print dialog; the thermal receipt uses the configured width.</SectionNote>
            </Card>

            <Card title={<span><Printer size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Printer support</span>} subtitle="Works with printers installed on the device.">
              <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>{printerSupportNote()}</p>
              <div className="row" style={{ gap: 8 }}>
                <Button variant="secondary" onClick={() => void testPrint()}><Printer size={15} /> Test receipt print</Button>
                <span className="muted small">Uses your most recent bill. No test bill is created.</span>
              </div>
            </Card>
          </>
        ) : null}

        {tab === 'payment' ? (
          <>
            <Card
              title={<span><QrCode size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Business &amp; payment details</span>}
              subtitle="Printed on new invoices next to the Scan & Pay QR. Saved with this account."
            >
              <div className="input-row">
                <Field label="Business mobile number" hint="Shown under the UPI ID. Optional.">
                  <Input
                    value={draft.payment.businessMobile}
                    onChange={(e) => updatePayment({ businessMobile: e.target.value })}
                    maxLength={20}
                    inputMode="tel"
                    placeholder="10-digit mobile number"
                  />
                </Field>
                <Field label="UPI ID" hint="Exactly as registered, e.g. name@bank">
                  <Input
                    value={draft.payment.upiId}
                    onChange={(e) => updatePayment({ upiId: e.target.value })}
                    maxLength={120}
                    autoComplete="off"
                    placeholder="name@bank"
                  />
                </Field>
              </div>
              <div className="input-row" style={{ marginTop: 12 }}>
                <Field label="Scan &amp; Pay QR">
                  <label className="check" style={{ minHeight: 38 }}>
                    <input type="checkbox" checked={draft.payment.showQr} onChange={(e) => updatePayment({ showQr: e.target.checked })} />
                    Show the payment QR on invoices
                  </label>
                </Field>
                <Field label="Payment method labels">
                  <label className="check" style={{ minHeight: 38 }}>
                    <input type="checkbox" checked={draft.payment.showLogos} onChange={(e) => updatePayment({ showLogos: e.target.checked })} />
                    Show Google Pay, PhonePe, Paytm and BHIM labels
                  </label>
                </Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <Field label="Invoice payment footer" hint="One short line under the QR.">
                  <Input value={draft.payment.footerMessage} onChange={(e) => updatePayment({ footerMessage: e.target.value })} maxLength={140} />
                </Field>
              </div>
              <SectionNote tone="info">
                These values are separate from the business identity fields, so changing an address, phone or theme never redirects payments. Existing bills keep the payment details they were issued with.
              </SectionNote>
            </Card>

            <Card title="Payment QR image" subtitle="The original QR supplied by you — the app never creates or redraws one.">
              <div className="qr-settings">
                <div className="qr-settings-preview">
                  {paymentQrSrc(draft.payment.qrImage) ? (
                    <img src={paymentQrSrc(draft.payment.qrImage)} alt="Current payment QR" />
                  ) : (
                    <div className="qr-settings-empty">
                      <QrCode size={26} />
                      <b>Payment QR not configured</b>
                      <span>The image slot is empty.</span>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="btn-wrap">
                    <Button variant="secondary" onClick={() => qrFileRef.current?.click()} loading={qrBusy}>
                      <Upload size={15} /> {draft.payment.qrImage ? 'Replace QR image' : 'Upload QR image'}
                    </Button>
                    {draft.payment.qrImage ? (
                      <Button variant="ghost" onClick={() => updatePayment({ qrImage: '' })} disabled={qrBusy}>
                        <Trash2 size={15} /> Remove
                      </Button>
                    ) : null}
                  </div>
                  <input
                    ref={qrFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => void pickQr(e.target.files?.[0] || null)}
                  />
                  <div className="muted small" style={{ marginTop: 8, lineHeight: 1.55 }}>
                    PNG, JPG or WebP up to 6 MB. The image is stored with this account, so the same QR appears on Android and Windows.
                    Nothing is uploaded until you press Save changes.
                  </div>
                  {qrError ? <div className="form-error" style={{ marginTop: 6 }}>{qrError}</div> : null}
                </div>
              </div>
              <SectionNote tone="warn">
                Upload the QR issued by your own payment provider. Scanning it does not confirm that money was received, and the invoice says so.
              </SectionNote>
            </Card>
          </>
        ) : null}

        {tab === 'workspace' ? (
          <>
            <Card title={<span><Palette size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Appearance</span>} subtitle="The interface supports light and dark modes and full Tamil labels.">
              <div className="input-row">
                <Field label="Theme">
                  <Select value={draft.theme} onChange={(e) => update({ theme: e.target.value as ThemeMode })}>
                    <option value="light">Light — cream &amp; burgundy</option>
                    <option value="dark">Dark — deep burgundy</option>
                    <option value="clean-white">Clean White — bright &amp; neutral</option>
                    <option value="modern-blue">Modern Blue — light with blue</option>
                    <option value="dark-gold">Dark Gold — black &amp; gold</option>
                    <option value="dark-red">Dark Red — charcoal &amp; crimson</option>
                    <option value="neon-blue">Neon Blue — midnight &amp; electric blue</option>
                    <option value="neon-purple">Neon Purple — midnight &amp; violet</option>
                    <option value="neon-green">Neon Green — forest &amp; mint</option>
                  </Select>
                </Field>
                <Field label="Language">
                  <Select value={draft.language} onChange={(e) => update({ language: e.target.value as Language })}>
                    <option value="en">English</option>
                    <option value="ta">தமிழ் (Tamil)</option>
                  </Select>
                </Field>
              </div>
              <div className="muted small"><Languages size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Tamil labels appear throughout the navigation and dashboard. Invoice content keeps the names you enter.</div>
            </Card>

          </>
        ) : null}

        {tab === 'account' ? (
          <>
            <Card title={<span><ShieldCheck size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Signed-in account</span>} subtitle="Google Sign-In identity for this workspace.">
              <div className="kv"><span>Name</span><b>{app.user?.name || '—'}</b></div>
              <div className="kv"><span>Email</span><b>{app.user?.email || 'Device mode (no account)'}</b></div>
              <div className="kv"><span>User ID</span><b className="mono" style={{ fontSize: 11 }}>{app.user?.uid || '—'}</b></div>
              <div className="kv"><span>Data mode</span><b>{app.mode === 'cloud' ? 'Cloud (Firestore + offline cache)' : 'Device only'}</b></div>
              <div className="kv"><span>Sync</span><b>{app.online ? app.syncStatus : 'offline'}</b></div>
              <div className="kv"><span>Role</span><b>{app.isOwner ? 'Owner / administrator' : 'Authorised user'}</b></div>
              <SectionNote tone="info">Business data is stored under your account. Other Google accounts cannot see it, even on the same device.</SectionNote>
            </Card>

            <Card title="Workspace owner" subtitle="The owner can change rates, settings, access and backups.">
              <Field label="Owner email" hint="The Google account that administers this workspace."><Input type="email" value={draft.access.ownerEmail} onChange={(e) => update({ access: { ...draft.access, ownerEmail: e.target.value } })} maxLength={120} /></Field>
              <SectionNote tone="warn">Changing the owner email does not move any data between accounts. It records who owns this workspace on this device.</SectionNote>
            </Card>

            <Card title="Authorised accounts" subtitle="Optional device-level allowlist. All authorised accounts have full access to this workspace.">
              <label className="check" style={{ marginBottom: 10 }}>
                <input type="checkbox" checked={draft.access.requireAllowlist} onChange={(e) => update({ access: { ...draft.access, requireAllowlist: e.target.checked } })} />
                Only allow the owner and listed accounts to open this workspace
              </label>
              <Field label="Allowed emails" hint="One Google email per line. The owner is always allowed.">
                <textarea className="textarea" value={allowedText} onChange={(e) => setAllowedText(e.target.value)} placeholder={'staff@example.com\nmanager@example.com'} style={{ minHeight: 100 }} />
              </Field>
              <SectionNote tone="warn">This is a device-level gate. Cloud data remains protected by the Google account that owns it. Remove a person here to block this device; remove their Google access separately if they must lose the account.</SectionNote>
            </Card>
          </>
        ) : null}

        {tab === 'data' ? (
          <>
            <Card title={<span><Database size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Your data</span>} subtitle="A real snapshot of this account.">
              <div className="grid grid-3">
                {documentCounts.map(([label, count]) => (
                  <div key={label} className="stat-card" style={{ padding: '11px 13px' }}>
                    <div className="stat-label">{label}</div>
                    <div className="stat-value" style={{ fontSize: 19 }}>{count}</div>
                  </div>
                ))}
              </div>
              <div className="muted small" style={{ marginTop: 10 }}>
                Mode: {app.mode === 'cloud' ? 'Cloud with offline cache' : 'This device only'} · {app.online ? 'Online' : 'Offline'} · Last sync status: {app.syncStatus}
              </div>
            </Card>

            <Card title="Backup & restore" subtitle="Export a JSON snapshot you control. Restore merges by document ID.">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={() => void doExport()} loading={backupBusy} disabled={!canEdit}><Download size={15} /> Export backup (JSON)</Button>
                <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={!canEdit}><Upload size={15} /> Restore from backup</Button>
                <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void pickBackup(e.target.files?.[0] || null)} />
              </div>
              <SectionNote tone="warn">Restoring a backup overwrites documents with the same IDs in this account. It does not delete documents that are absent from the backup. Export a fresh backup before restoring.</SectionNote>
              <div className="muted small">Backup filename: {backupFileName()}</div>
            </Card>

            <Card title="Danger zone" subtitle="Irreversible actions are protected by a typed confirmation.">
              <div className="section-note note-danger" style={{ marginBottom: 10 }}>
                Erasing removes every bill, customer, payment, expense, material, audit entry, rate and setting in this account — cloud and local cache. The Google account itself is not deleted.
              </div>
              <Button variant="danger" onClick={() => setEraseOpen(true)} disabled={!canEdit}><Trash2 size={15} /> Erase all business data</Button>
            </Card>

            <Card title="Session">
              <div className="row" style={{ gap: 8 }}>
                <Button variant="ghost" onClick={() => void app.signOut()}>Sign out</Button>
                <span className="muted small">Signed in as {app.user?.email || app.user?.name || 'device user'}</span>
              </div>
            </Card>
          </>
        ) : null}
      </fieldset>

      {tab === 'about' ? <AboutUpdatesCard /> : null}

      {error ? <div className="form-error" style={{ marginTop: 12 }}>{error}</div> : null}

      <Modal
        open={!!pendingBackup}
        title="Restore this backup?"
        subtitle={restoreName}
        onClose={() => { if (!restoring) { setPendingBackup(null); setRestoreName(''); } }}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setPendingBackup(null); setRestoreName(''); }} disabled={restoring}>Cancel</Button>
            <Button variant="danger" onClick={() => void doRestore()} loading={restoring}>Restore documents</Button>
          </>
        }
      >
        {pendingBackup ? (
          <div>
            <div className="kv"><span>Exported</span><b>{formatDateTime(pendingBackup.exportedAt)}</b></div>
            <div className="kv"><span>Documents</span><b>{Object.values(pendingBackup.data).reduce((a, rows) => a + rows.length, 0)}</b></div>
            <div className="kv"><span>Collections</span><b>{Object.keys(pendingBackup.data).length}</b></div>
            <SectionNote tone="warn">Documents with matching IDs will be overwritten. Export a backup of the current account first if you are unsure.</SectionNote>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={eraseOpen}
        title="Erase all business data?"
        subtitle="This cannot be undone and cannot be recovered from the app."
        onClose={() => { if (!erasing) { setEraseOpen(false); setEraseText(''); } }}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setEraseOpen(false); setEraseText(''); }} disabled={erasing}>Keep my data</Button>
            <Button variant="danger" onClick={() => void doErase()} loading={erasing} disabled={eraseText !== 'DELETE'}>Erase everything</Button>
          </>
        }
      >
        <div className="section-note note-danger">
          Every bill, customer, payment, expense, material, audit entry, product rate, frame price and setting will be deleted from this account.
        </div>
        <div className="muted small" style={{ marginBottom: 8 }}>Export a backup first if you may need the data later. Total documents affected: {documentCounts.reduce((a, [, c]) => a + c, 0)}.</div>
        <Field label="Type DELETE to confirm" required>
          <Input value={eraseText} onChange={(e) => setEraseText(e.target.value)} placeholder="DELETE" autoComplete="off" />
        </Field>
        <div className="muted small" style={{ marginTop: 8 }}>Current business value on record: {formatINR(app.bills.filter((b) => b.status !== 'cancelled').reduce((a, b) => a + b.total, 0))}.</div>
      </Modal>

    </div>
  );
}

/**
 * About & Updates lives outside the owner-only fieldset: every signed-in user
 * may check for updates, but nothing here can change billing data.
 */
function AboutUpdatesCard() {
  const { version, platform, result, check, install, installing, installMessage } = useUpdates();
  const ANDROID_SHA1 = typeof __ANDROID_SHA1__ === 'string' ? __ANDROID_SHA1__ : '';

  return (
    <>
      <Card title="KALAI DIGITAL" subtitle="Version details for this installation.">
        <div className="kv"><span>Installed version</span><b>{version}</b></div>
        <div className="kv"><span>Platform</span><b>{platformLabel()}</b></div>
        <div className="kv"><span>Package identity</span><b className="mono" style={{ fontSize: 11 }}>com.kalaidigital.billing</b></div>
        <div className="kv"><span>Build channel</span><b>Stable release</b></div>
        <div className="kv"><span>Product settings</span><b>Automatic repair v{PRODUCT_CONFIG_VERSION}</b></div>
        <div className="kv"><span>Update feed</span><b className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{feedUrl()}</b></div>
        <SectionNote tone="info">
          The version above is read from the installed package itself, never from your Google account or cloud data. If the app still
          shows a screen that a newer release removed (for example Inventory), the old build is still running: close KALAI DIGITAL completely,
          then open it again from the current shortcut. On Windows, check that the shortcut points to the program in the existing installation
          folder. Reinstalling never touches your bills, customers or rates.
        </SectionNote>
        <SectionNote tone="info">
          The release feed returns only the newest stable version and its installers. No account data, bill or customer detail is ever sent when checking.
        </SectionNote>
      </Card>

      {ANDROID_SHA1 ? (
        <Card title="Android signing" subtitle="Used for Google Sign-In and in-place APK updates.">
          <div className="kv"><span>Certificate SHA-1</span><b className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{ANDROID_SHA1}</b></div>
          <SectionNote tone="info">
            This fingerprint must be registered on the Android app in Firebase (Project settings → Your apps → Add fingerprint) before
            Google Sign-In can work on Android. Without it Google returns a configuration error instead of the account chooser.
          </SectionNote>
        </Card>
      ) : null}

      <Card title={<span><RefreshCw size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Updates</span>} subtitle="Checked automatically when the app opens. You can also check now.">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Button onClick={() => void check(true)} disabled={result.status === 'checking'}>
            <RefreshCw size={15} /> Check for Updates / <span lang="ta">அப்டேட் பார்க்கவும்</span>
          </Button>
          {result.checkedAt ? <span className="muted small">Last checked {formatDateTime(result.checkedAt)}</span> : null}
        </div>

        <UpdateStatusMessage result={result} onRetry={() => void check(true)} />

        {result.status === 'available' && result.release ? (
          <div style={{ marginTop: 12 }}>
            {result.release.notes ? (
              <div style={{ whiteSpace: 'pre-line', fontSize: 12.8, lineHeight: 1.55, marginBottom: 10 }}>{result.release.notes}</div>
            ) : null}
            <Button block onClick={() => void install()} loading={installing}>
              <Download size={16} /> Install update / <span lang="ta">புதுப்பிப்பை நிறுவு</span>
            </Button>
            {installMessage ? <SectionNote tone="info">{installMessage}</SectionNote> : null}
          </div>
        ) : null}

        <SectionNote tone="warn">
          {platform === 'android'
            ? 'On Android the APK downloads through your browser and then asks you to confirm Install. Keep the existing app installed — do not uninstall it; your bills stay in place.'
            : platform === 'windows'
              ? 'On Windows the installer is downloaded, checked against its published SHA-256, then started. The app closes so its files can be replaced, and your data stays in place.'
              : 'In a browser, the download opens in a new tab.'}
        </SectionNote>
      </Card>

      <Card title="Historical data" subtitle="Updates never rewrite existing bills.">
        <div className="muted small" style={{ lineHeight: 1.55 }}>
          Saved bills keep the rate, area and total charged at the time of billing. A rate edited in Products &amp; Rates only affects new bills.
          Firestore data stays under the same namespace, <b>users/{'{uid}'}/apps/kalai</b>, so Android and Windows continue to read the same account.
        </div>
      </Card>
    </>
  );
}
