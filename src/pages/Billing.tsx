import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, Save, Search, UserPlus, RotateCcw, Printer, Share2, FilePlus2, AlertTriangle, Info } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { Bill, BillItem, BillPayment, Customer, PaymentMethod, ProductKey } from '../lib/types';
import { PAYMENT_METHODS, PRODUCT_KEYS, PRODUCT_NAMES, FRAME_BEADINGS, isSqftProduct, normalizeBeading } from '../lib/constants';
import { billStatus, computeBillTotals, computeFrame, computeSqft } from '../lib/pricing';
import { formatINR, formatDate, isValidPhone, todayISO } from '../lib/format';
import { round2, sum } from '../lib/money';
import { itemKey } from '../lib/ids';
import { ITEM_NAME_MAX, cleanItemName } from '../lib/itemName';
import { createBill, updateBill } from '../services/bills';
import { createCustomer, findSimilarCustomers, searchCustomers } from '../services/customers';
import { addAudit } from '../services/audit';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, SectionNote, StatusBadge, useToast } from '../components/ui';
import { downloadInvoicePdf, shareInvoicePdf } from '../services/pdf';
import { printThermalReceipt } from '../services/printer';

type Unit = 'in' | 'cm' | 'ft';

interface ItemForm {
  product: ProductKey;
  width: string;
  height: string;
  unit: Unit;
  qty: string;
  frameSizeId: string;
  beading: string;
  /** Optional name of the person this print is for (never a customer). */
  itemName: string;
}


const DEFAULT_BEADING = FRAME_BEADINGS[0].value;

/** Flex, Sunpack, Vinyl and Star are entered in feet; Frame uses inches. */
function defaultUnit(product: ProductKey): Unit {
  return isSqftProduct(product) ? 'ft' : 'in';
}

const emptyForm = (product: ProductKey, frameSizeId = ''): ItemForm => ({
  product,
  width: '',
  height: '',
  unit: defaultUnit(product),
  qty: '1',
  frameSizeId,
  beading: DEFAULT_BEADING,
  itemName: ''
});

const PAY_METHODS: PaymentMethod[] = PAYMENT_METHODS.filter((m) => m !== 'Credit');

function toInches(value: number, unit: Unit): number {
  if (unit === 'cm') return value / 2.54;
  if (unit === 'ft') return value * 12;
  return value;
}

function fromInches(inches: number, unit: Unit): number {
  if (unit === 'cm') return inches * 2.54;
  if (unit === 'ft') return inches / 12;
  return inches;
}

function unitLabel(unit: Unit): string {
  return unit === 'in' ? 'inches' : unit === 'cm' ? 'centimetres' : 'feet';
}

function unitShort(unit: Unit): string {
  return unit === 'in' ? 'in' : unit === 'cm' ? 'cm' : 'ft';
}

/** The size as typed on the entry form, with inches as the fallback for old bills. */
function itemDimensions(item: BillItem): string {
  if (item.product === 'FRAME') return item.frameSizeLabel || '';
  if (item.widthEntered != null && item.heightEntered != null && item.unit) {
    return `${item.widthEntered}×${item.heightEntered} ${unitShort(item.unit)}`;
  }
  return `${item.widthIn ?? ''}×${item.heightIn ?? ''} in`;
}

export function BillingPage() {
  const app = useApp();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const lang = app.settings.language;
  const editing = useMemo(() => (id ? app.bills.find((b) => b.id === id) : undefined), [id, app.bills]);
  const loadedRef = useRef<string>('');

  const activeFrames = useMemo(
    () => app.frames.filter((f) => f.active).sort((a, b) => a.width * a.height - b.width * b.height || a.sortOrder - b.sortOrder),
    [app.frames]
  );

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customer, setCustomer] = useState({ name: 'Walk-in Customer', phone: '', address: '', email: '' });
  const [billDate, setBillDate] = useState(todayISO());
  const [items, setItems] = useState<BillItem[]>([]);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>(app.settings.defaultDiscountType);
  const [discountValue, setDiscountValue] = useState('0');
  const [additional, setAdditional] = useState('0');
  const [gstOn, setGstOn] = useState(app.settings.gstEnabled);
  const [note, setNote] = useState('');
  const [payments, setPayments] = useState<(BillPayment & { key: string })[]>([]);
  const [payForm, setPayForm] = useState({ amount: '', method: 'Cash' as PaymentMethod, date: todayISO(), reference: '' });
  const [payError, setPayError] = useState('');
  const [form, setForm] = useState<ItemForm>(emptyForm('FRAME', activeFrames[0]?.id || ''));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedBill, setSavedBill] = useState<Bill | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [custSearch, setCustSearch] = useState('');
  const [quick, setQuick] = useState({ name: '', phone: '', address: '', notes: '' });
  const [quickError, setQuickError] = useState('');
  const [similar, setSimilar] = useState<Customer[]>([]);
  const [newConfirm, setNewConfirm] = useState(false);

  useEffect(() => {
    if (!editing || loadedRef.current === editing.id) return;
    loadedRef.current = editing.id;
    setCustomerId(editing.customerId);
    setCustomer({
      name: editing.customer.name || 'Walk-in Customer',
      phone: editing.customer.phone || '',
      address: editing.customer.address || '',
      email: editing.customer.email || ''
    });
    setBillDate(editing.date || todayISO());
    setItems(editing.items || []);
    setDiscountType(editing.discountType || 'amount');
    setDiscountValue(String(editing.discountValue ?? 0));
    setAdditional(String(editing.additionalCharges ?? 0));
    setGstOn(!!editing.gstEnabled);
    setNote(editing.note || '');
    setPayments((editing.payments || []).map((p, i) => ({ ...p, key: `existing-${i}` })));
    const first = activeFrames[0]?.id || '';
    setForm(emptyForm('FRAME', first));
  }, [editing, activeFrames]);

  useEffect(() => {
    if (!editing && !form.frameSizeId && activeFrames[0]) setForm((f) => ({ ...f, frameSizeId: activeFrames[0].id }));
  }, [activeFrames, editing, form.frameSizeId]);

  useEffect(() => {
    if (params.get('new') === '1') {
      setShowCustomer(true);
    }
  }, [params]);

  // The update flow asks before closing the app for a Windows installer, so an
  // unsaved bill is never discarded. Cleared as soon as the bill is saved,
  // reset, or the page is left.
  useEffect(() => {
    const unsaved = items.length > 0 && !savedId;
    window.__kalaiUnsavedBill = unsaved;
    return () => {
      window.__kalaiUnsavedBill = false;
    };
  }, [items.length, savedId]);

  // Archived customers keep their history but must not be picked for a new bill.
  const customers = useMemo(
    () => searchCustomers(app.customers.filter((c) => c.archived !== true), custSearch),
    [app.customers, custSearch]
  );
  const productConfig = useMemo(() => app.products.find((p) => p.key === form.product), [app.products, form.product]);

  const pickCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setCustomer({ name: c.name, phone: c.phone, address: c.address, email: c.email });
    setShowCustomer(false);
    setCustSearch('');
  };

  // A customer profile can start a pre-filled bill via /billing?customer=<id>.
  const customerParamRef = useRef('');
  useEffect(() => {
    const requested = params.get('customer');
    if (!requested || id || customerParamRef.current === requested) return;
    const match = app.customers.find((c) => c.id === requested);
    if (!match) return;
    customerParamRef.current = requested;
    if (match.archived === true) {
      toast('This customer is archived. Restore it in Customers before billing.', 'warn');
      navigate('/billing', { replace: true });
      return;
    }
    pickCustomer(match);
    navigate('/billing', { replace: true });
  }, [params, id, app.customers, navigate]);

  const walkIn = () => {
    setCustomerId(null);
    setCustomer({ name: 'Walk-in Customer', phone: '', address: '', email: '' });
    setShowCustomer(false);
  };

  const quickAdd = async (force = false) => {
    setQuickError('');
    if (!quick.name.trim()) {
      setQuickError('Customer name is required. Mobile number is optional.');
      return;
    }
    if (quick.phone.trim() && !isValidPhone(quick.phone)) {
      setQuickError('Enter a valid mobile number, or leave it blank.');
      return;
    }
    const matches = findSimilarCustomers(app.customers, quick);
    if (matches.length > 0 && !force) {
      setSimilar(matches);
      return;
    }
    try {
      const created = await createCustomer(app.service, quick);
      await addAudit(app.service, app.user, { entity: 'customer', entityId: created.id, action: 'create', summary: `Customer ${created.name} added during billing` });
      pickCustomer(created);
      setQuick({ name: '', phone: '', address: '', notes: '' });
      setSimilar([]);
      toast('Customer added', 'success');
    } catch (e) {
      setQuickError((e as Error).message);
    }
  };

  const frameRow = useMemo(() => activeFrames.find((f) => f.id === form.frameSizeId) || null, [activeFrames, form.frameSizeId]);
  const qtyNum = parseFloat(form.qty) || 0;

  const widthIn = useMemo(() => {
    const v = parseFloat(form.width);
    return Number.isFinite(v) ? toInches(v, form.unit) : NaN;
  }, [form.width, form.unit]);
  const heightIn = useMemo(() => {
    const v = parseFloat(form.height);
    return Number.isFinite(v) ? toInches(v, form.unit) : NaN;
  }, [form.height, form.unit]);

  const preview = useMemo(() => {
    if (form.product === 'FRAME') {
      if (!frameRow) return null;
      return {
        kind: 'frame' as const,
        amount: computeFrame(frameRow.price, qtyNum, productConfig?.rounding ?? 'nearest'),
        price: frameRow.price
      };
    }
    if (!productConfig || productConfig.rate <= 0) return null;
    return {
      kind: 'sqft' as const,
      ...computeSqft({
        widthIn,
        heightIn,
        qty: qtyNum,
        rate: productConfig.rate,
        basisSqft: productConfig.basisSqft,
        minSqft: productConfig.minSqft,
        minChargeEnabled: productConfig.minChargeEnabled,
        rounding: productConfig.rounding
      })
    };
  }, [form.product, frameRow, qtyNum, productConfig, widthIn, heightIn]);

  const switchProduct = (key: ProductKey) => {
    setForm(emptyForm(key, activeFrames[0]?.id || ''));
    setEditingKey(null);
    setFormError('');
  };

  const editItem = (it: BillItem) => {
    setEditingKey(it.key);
    const unit: Unit = it.unit || 'in';
    const width = it.widthEntered != null
      ? it.widthEntered
      : it.widthIn != null
        ? round2(fromInches(it.widthIn, unit))
        : null;
    const height = it.heightEntered != null
      ? it.heightEntered
      : it.heightIn != null
        ? round2(fromInches(it.heightIn, unit))
        : null;
    setForm({
      product: it.product,
      width: width != null ? String(width) : '',
      height: height != null ? String(height) : '',
      unit,
      qty: String(it.qty),
      frameSizeId: it.frameSizeId || activeFrames[0]?.id || '',
      beading: normalizeBeading(it.beading),
      itemName: it.itemName || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addItem = () => {
    setFormError('');
    if (qtyNum <= 0) return setFormError('Enter a quantity greater than zero.');
    if (!productConfig?.active) return setFormError('This product is inactive. Enable it in Products & Rates.');
    if (form.product === 'FRAME') {
      if (!frameRow) return setFormError('Select a frame size. Add sizes in Products & Rates if the list is empty.');
      const beading = normalizeBeading(form.beading);
      const itemName = cleanItemName(form.itemName);
      const item: BillItem = {
        key: editingKey || itemKey(),
        product: 'FRAME',
        label: 'Frame',
        ...(itemName ? { itemName } : {}),
        frameSizeId: frameRow.id,
        frameSizeLabel: `${frameRow.width}×${frameRow.height} in`,
        beading,
        rate: frameRow.price,
        qty: qtyNum,
        amount: computeFrame(frameRow.price, qtyNum, productConfig.rounding),
        note: `Photo frame ${frameRow.width}×${frameRow.height} in · Beading ${beading}`
      };
      upsert(item);
      return;
    }
    if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
      return setFormError('Enter a valid width and height greater than zero.');
    }
    if (productConfig.rate <= 0) {
      return setFormError(`${productConfig.name} has no rate configured. Set it in Products & Rates first.`);
    }
    const calc = computeSqft({
      widthIn,
      heightIn,
      qty: qtyNum,
      rate: productConfig.rate,
      basisSqft: productConfig.basisSqft,
      minSqft: productConfig.minSqft,
      minChargeEnabled: productConfig.minChargeEnabled,
      rounding: productConfig.rounding
    });
    const itemName = cleanItemName(form.itemName);
    const item: BillItem = {
      key: editingKey || itemKey(),
      product: form.product,
      label: productConfig.name,
      ...(itemName ? { itemName } : {}),
      widthIn: round2(widthIn),
      heightIn: round2(heightIn),
      widthEntered: round2(parseFloat(form.width) || 0),
      heightEntered: round2(parseFloat(form.height) || 0),
      unit: form.unit,
      areaSqft: calc.areaSqft,
      chargeableSqft: calc.chargeableSqft,
      basisSqft: calc.basisSqft,
      rate: productConfig.rate,
      qty: qtyNum,
      amount: calc.amount,
      note: `${formatINR(productConfig.rate)} per ${productConfig.basisSqft === 1 ? 'sq.ft' : `${productConfig.basisSqft} sq.ft`}${calc.minimumApplied ? ` · minimum ${calc.chargeableSqft} sq.ft applied` : ''}`
    };
    upsert(item);
  };

  const upsert = (item: BillItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.key === item.key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [...prev, item];
    });
    setEditingKey(null);
    setForm(emptyForm(form.product, form.frameSizeId));
    setFormError('');
  };

  const totals = useMemo(
    () =>
      computeBillTotals({
        subtotal: round2(sum(items.map((i) => i.amount))),
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        additionalCharges: parseFloat(additional) || 0,
        gstEnabled: gstOn && app.settings.gstEnabled,
        gstRate: app.settings.gstRate,
        gstInclusive: app.settings.gstInclusive
      }),
    [items, discountType, discountValue, additional, gstOn, app.settings.gstEnabled, app.settings.gstRate, app.settings.gstInclusive]
  );

  const paid = round2(sum(payments.map((p) => p.amount)));
  const balance = round2(Math.max(0, totals.total - paid));
  const status = billStatus(totals.total, paid);

  const addPayment = () => {
    setPayError('');
    const amount = parseFloat(payForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setPayError('Enter a payment amount greater than zero.');
    if (amount > balance + 0.009 && !editing) return setPayError(`Payment cannot exceed the balance of ${formatINR(balance)}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payForm.date)) return setPayError('Choose a valid payment date.');
    setPayments((prev) => [...prev, { key: itemKey(), amount, method: payForm.method, date: payForm.date, reference: payForm.reference.trim() }]);
    setPayForm({ amount: '', method: 'Cash', date: todayISO(), reference: '' });
  };

  const payFull = () => setPayForm((f) => ({ ...f, amount: String(balance) }));

  const resetAll = () => {
    setCustomerId(null);
    setCustomer({ name: 'Walk-in Customer', phone: '', address: '', email: '' });
    setBillDate(todayISO());
    setItems([]);
    setDiscountType(app.settings.defaultDiscountType);
    setDiscountValue('0');
    setAdditional('0');
    setGstOn(app.settings.gstEnabled);
    setNote('');
    setPayments([]);
    setPayForm({ amount: '', method: 'Cash', date: todayISO(), reference: '' });
    setEditingKey(null);
    setSavedId(null);
    setSavedBill(null);
    setForm(emptyForm('FRAME', activeFrames[0]?.id || ''));
  };

  const save = async (action: 'save' | 'print' | 'share' | 'new' = 'save') => {
    if (items.length === 0) return toast('Add at least one item to the bill.', 'warn');
    if (paid > totals.total + 0.009 && !editing) return toast('Payments cannot exceed the bill total.', 'warn');
    setSaving(true);
    try {
      const draft = {
        date: billDate,
        customerId,
        customer,
        items,
        discountType,
        discountValue: Math.max(0, parseFloat(discountValue) || 0),
        additionalCharges: Math.max(0, parseFloat(additional) || 0),
        gstEnabled: gstOn,
        gstRate: app.settings.gstRate,
        gstInclusive: app.settings.gstInclusive,
        payments: editing ? editing.payments : payments.map(({ key: _key, ...p }) => p),
        note
      };
      let billId = editing?.id || savedId;
      let billForAction: Bill | null = editing || savedBill;
      if (editing) {
        billForAction = await updateBill(app.service, app.settings, editing, draft, app.user);
        setSavedBill(billForAction);
        toast(`Bill ${editing.number} updated`, 'success');
      } else if (!savedId) {
        const bill = await createBill(app.service, app.settings, draft, app.user);
        billId = bill.id;
        billForAction = bill;
        setSavedId(bill.id);
        setSavedBill(bill);
        toast(`Bill ${bill.number} saved`, 'success');
      }
      if (!billId) return;
      if (action === 'new') {
        resetAll();
        setNewConfirm(false);
        toast('Ready for the next bill', 'success');
        return;
      }
      if (action === 'print') {
        // Save first, then attempt printing. Printer failure never unsaves.
        try {
          if (billForAction) await printThermalReceipt(billForAction, app.settings);
          else navigate(`/bills/${billId}?print=1`);
        } catch (e) {
          toast(`Bill saved. Printing failed: ${(e as Error).message}. You can retry from the bill.`, 'warn');
        }
      }
      if (action === 'share') {
        if (billForAction) {
          try {
            await shareInvoicePdf(billForAction, app.settings);
          } catch (e) {
            toast(`Bill saved. Sharing failed: ${(e as Error).message}. Download the PDF from the bill instead.`, 'warn');
          }
        }
      }
      navigate(`/bills/${billId}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    const bill = savedBill || app.bills.find((b) => b.id === (savedId || editing?.id));
    if (!bill) return toast('Save the bill first.', 'warn');
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
        title={editing ? `Edit ${editing.number}` : 'New Bill'}
        subtitle={editing ? 'Changes are audited. Payment records are never overwritten.' : 'Customer → items → payment → save. Works offline.'}
        eyebrow={editing ? 'BILL EDIT' : 'FAST BILLING'}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowCustomer(true)}>
              <Search size={16} /> {customerId ? 'Change customer' : 'Select customer'}
            </Button>
            <Button variant="ghost" onClick={() => (editing ? navigate('/bills') : setNewConfirm(true))}>
              <RotateCcw size={16} /> {editing ? 'Back' : 'Reset'}
            </Button>
          </>
        }
      />

      <div className="grid grid-main-side">
        <div>
          <Card title="1 · Customer & bill date" subtitle="Mobile number is optional. Billing works without a saved customer.">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontWeight: 700 }}>{customer.name || 'Walk-in Customer'}</div>
                <div className="cell-sub">{customer.phone || (customerId ? 'No mobile number' : 'Walk-in · no customer record')}{customer.address ? ` · ${customer.address}` : ''}</div>
              </div>
              <Button variant="secondary" onClick={() => setShowCustomer(true)}>
                <UserPlus size={16} /> {customerId ? 'Change' : 'Select / Add'}
              </Button>
              {customerId ? <Button variant="ghost" onClick={walkIn}>Walk-in</Button> : null}
            </div>
            <div className="input-row" style={{ marginTop: 12, maxWidth: 420 }}>
              <Field label="Bill Date">
                <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
              </Field>
              <Field label="Bill number" hint="Generated automatically">
                <Input value={editing?.number || `Auto · ${app.settings.invoiceFormat}`} readOnly />
              </Field>
            </div>
          </Card>

          <Card title="2 · Product & calculation" subtitle="Rates come from Products & Rates. Nothing is hardcoded.">
            {app.productConfigState === 'error' ? (
              <SectionNote tone="warn">
                Unable to load product rates from the cloud. Using the rates already saved on this device. Open Products &amp; Rates to retry.
              </SectionNote>
            ) : null}
            <div className="chip-row" style={{ marginBottom: 14 }}>
              {PRODUCT_KEYS.map((key) => {
                const cfg = app.products.find((p) => p.key === key);
                // Only an explicit disabled flag hides a product. A missing or
                // unloaded configuration must never look like "off".
                const unavailable = cfg?.active === false;
                return (
                  <button
                    key={key}
                    className={`chip${form.product === key ? ' active' : ''}`}
                    onClick={() => switchProduct(key)}
                    disabled={unavailable}
                    title={unavailable ? `${PRODUCT_NAMES[key].en} is disabled in Products & Rates` : undefined}
                  >
                    {PRODUCT_NAMES[key][lang] || PRODUCT_NAMES[key].en}
                    {unavailable ? ' (off)' : ''}
                  </button>
                );
              })}
            </div>

            {productConfig && !productConfig.active ? (
              <SectionNote tone="warn">This product is inactive. Re-enable it in Products &amp; Rates before billing.</SectionNote>
            ) : null}

            {form.product === 'FRAME' ? (
              <div>
                <div className="input-row">
                  <Field label="Frame Size" hint="Inches · fixed price per piece">
                    <Select value={form.frameSizeId} onChange={(e) => setForm({ ...form, frameSizeId: e.target.value })}>
                      {activeFrames.length === 0 ? <option value="">No active sizes</option> : null}
                      {activeFrames.map((f) => (
                        <option key={f.id} value={f.id}>{f.width}×{f.height} in — {formatINR(f.price)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Quantity">
                    <Input type="number" inputMode="numeric" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
                  </Field>
                  <Field label={<span>Beading / <span lang="ta">பீடிங்</span></span>} hint="Recorded on the bill">
                    <Select value={form.beading} onChange={(e) => setForm({ ...form, beading: e.target.value })}>
                      {FRAME_BEADINGS.map((b) => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Price per Piece" hint="From the frame price list">
                    <Input value={frameRow ? formatINR(frameRow.price) : '—'} readOnly />
                  </Field>
                </div>
                <div className="calc-preview" style={{ marginTop: 12 }}>
                  {frameRow ? (
                    <span>
                      {frameRow.width}×{frameRow.height} in × {qtyNum || 0} = <b style={{ color: 'var(--brand-600)' }}>{formatINR(preview?.kind === 'frame' ? preview.amount : 0)}</b>
                      <span className="cell-sub" style={{ display: 'block', marginTop: 3 }}>
                        Beading: {form.beading} · fixed price per piece · the price list has no separate beading price, so the size price is kept.
                      </span>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--red)' }}>No active frame sizes. Add them in Products &amp; Rates → Frame Price Table.</span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {productConfig && productConfig.rate <= 0 ? (
                  <SectionNote tone="warn">
                    {productConfig.name} rate is not configured yet. Set the rate in Products &amp; Rates. No price is invented by the app.
                  </SectionNote>
                ) : null}
                <div className="input-row" style={{ marginTop: productConfig && productConfig.rate <= 0 ? 12 : 0 }}>
                  <Field label={`Width (${form.unit})`}>
                    <Input type="number" inputMode="decimal" min={0} step="any" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} placeholder="0" />
                  </Field>
                  <Field label={`Height (${form.unit})`}>
                    <Input type="number" inputMode="decimal" min={0} step="any" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} placeholder="0" />
                  </Field>
                  <Field label="Unit">
                    <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}>
                      <option value="ft">Feet</option>
                      <option value="in">Inches</option>
                      <option value="cm">Centimetres</option>
                    </Select>
                  </Field>
                  <Field label="Quantity">
                    <Input type="number" inputMode="numeric" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
                  </Field>
                </div>
                <div className="calc-preview" style={{ marginTop: 12 }}>
                  {preview?.kind === 'sqft' ? (
                    <div>
                      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div>
                          <div className="cell-sub">Area</div>
                          <b>{preview.areaSqft} sq.ft</b>
                        </div>
                        <div>
                          <div className="cell-sub">Rate</div>
                          <b>{formatINR(preview.rate)}/{preview.basisSqft === 1 ? 'sq.ft' : `${preview.basisSqft} sq.ft`}</b>
                        </div>
                        <div>
                          <div className="cell-sub">Line total</div>
                          <b style={{ color: 'var(--brand-600)', fontSize: 16 }}>{formatINR(preview.amount)}</b>
                        </div>
                      </div>
                      <div style={{ marginTop: 5 }}>
                        {Number.isFinite(widthIn) && Number.isFinite(heightIn)
                          ? `${round2(parseFloat(form.width) || 0)} ${unitShort(form.unit)} × ${round2(parseFloat(form.height) || 0)} ${unitShort(form.unit)} = ${preview.areaSqft} sq.ft`
                          : 'Enter width and height to see the area'}
                        {preview.minimumApplied ? ` · minimum ${preview.chargeableSqft} sq.ft` : ''}
                      </div>
                      <div className="cell-sub" style={{ marginTop: 3 }}>
                        {preview.basisSqft === 1
                          ? `${preview.areaSqft} sq.ft × ${formatINR(preview.rate)} × ${preview.qty}`
                          : `(${preview.chargeableSqft} ÷ ${preview.basisSqft}) × ${formatINR(preview.rate)} × ${preview.qty}`}
                        {' = '}<b>{formatINR(preview.amount)}</b>
                        {' · '}{unitLabel(form.unit)} converted to sq.ft · rounding: {productConfig?.rounding}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-3)' }}>Enter dimensions and a configured rate to see the amount.</span>
                  )}
                </div>
              </div>
            )}

            <div className="input-row" style={{ marginTop: 12, maxWidth: 460 }}>
              <Field
                label={<span>Item Name / <span lang="ta">யாருக்கானது?</span> <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optional)</span></span>}
                hint="Whose print is this? Printed on the invoice. It never creates a customer or changes the price."
              >
                <Input
                  value={form.itemName}
                  onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                  maxLength={ITEM_NAME_MAX}
                  placeholder="e.g. பஞ்சு"
                />
              </Field>
            </div>

            {formError ? <div className="form-error" style={{ marginTop: 9 }}>{formError}</div> : null}
            <div className="row" style={{ marginTop: 12, gap: 9 }}>
              <Button onClick={addItem} disabled={form.product === 'FRAME' && !frameRow}>
                {editingKey ? <RotateCcw size={16} /> : <Plus size={16} />} {editingKey ? 'Update item' : 'Add item'}
              </Button>
              {editingKey ? (
                <Button variant="ghost" onClick={() => { setEditingKey(null); setForm(emptyForm(form.product, form.frameSizeId)); setFormError(''); }}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </Card>

          <Card title={`3 · Bill items (${items.length})`} subtitle="Edit or remove any line before saving.">
            {items.length === 0 ? (
              <EmptyState icon={<Plus size={22} />} title="No items yet" text="Choose a product above, enter size or select a frame, then add it to the bill." />
            ) : (
              <div className="table-wrap">
                <table className="tbl stack-cards">
                  <thead>
                    <tr><th>Item</th><th>Size / area</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th><th className="actions">Actions</th></tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.key}>
                        <td data-label="Item">
                          <div className="cell-main">{it.label}</div>
                          {it.itemName ? <div className="cell-sub" style={{ fontWeight: 650, color: 'var(--text-2)' }}>For: {it.itemName}</div> : null}
                          <div className="cell-sub">{it.note}</div>
                        </td>
                        <td data-label="Size / area">
                          {it.product === 'FRAME' ? (
                            <>
                              {it.frameSizeLabel}
                              {it.beading ? <div className="cell-sub">Beading: {it.beading}</div> : null}
                            </>
                          ) : (
                            <>{itemDimensions(it)} · {it.areaSqft} sq.ft</>
                          )}
                        </td>
                        <td className="num" data-label="Qty">{it.qty}</td>
                        <td className="num" data-label="Rate">{formatINR(it.rate)}</td>
                        <td className="num" data-label="Amount"><b>{formatINR(it.amount)}</b></td>
                        <td className="actions">
                          <button className="icon-btn" onClick={() => editItem(it)} title="Edit item"><Pencil size={14} /></button>
                          <button className="icon-btn danger" style={{ marginLeft: 6 }} onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))} title="Remove item"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="4 · Discount, charges & payment" subtitle={editing ? 'Existing payments are preserved. Record further payments from the bill.' : 'Split payments are supported — Cash + UPI + Bank.'}>
            <div className="input-row">
              {app.settings.discountEnabled ? (
                <Field label="Discount">
                  <div style={{ display: 'flex', gap: 7 }}>
                    <Select style={{ width: 112, flex: 'none' }} value={discountType} onChange={(e) => setDiscountType(e.target.value as 'amount' | 'percent')}>
                      <option value="amount">₹ Amount</option>
                      <option value="percent">% Percent</option>
                    </Select>
                    <Input type="number" min={0} step="any" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
                  </div>
                </Field>
              ) : null}
              <Field label="Additional charges" hint="Delivery, lamination, installation…">
                <Input type="number" min={0} step="any" value={additional} onChange={(e) => setAdditional(e.target.value)} />
              </Field>
              <Field label="GST" hint={app.settings.gstEnabled ? `Rate ${app.settings.gstRate}%` : 'Disabled in Settings'}>
                <label className="check" style={{ minHeight: 38 }}>
                  <input type="checkbox" checked={gstOn && app.settings.gstEnabled} disabled={!app.settings.gstEnabled} onChange={(e) => setGstOn(e.target.checked)} />
                  Apply GST
                </label>
              </Field>
              <Field label="Bill note (optional)">
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={160} placeholder="e.g. Delivery Friday" />
              </Field>
            </div>

            <div className="divider" />
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Payments received</div>
            {editing ? (
              <SectionNote tone="info">
                This bill was saved with {editing.payments?.length || 0} payment record(s). Editing items never overwrites them. Use “Record payment” on the bill screen for additional collections.
              </SectionNote>
            ) : (
              <>
                {payments.length === 0 ? (
                  <div className="muted small" style={{ marginBottom: 8 }}>No payment yet — the bill will be saved as Credit / Unpaid.</div>
                ) : (
                  <div className="table-wrap" style={{ marginBottom: 10 }}>
                    <table className="tbl">
                      <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th className="actions"></th></tr></thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.key}>
                            <td>{formatDate(p.date)}</td>
                            <td>{p.method}</td>
                            <td>{p.reference || '—'}</td>
                            <td className="num"><b>{formatINR(p.amount)}</b></td>
                            <td className="actions"><button className="icon-btn danger" onClick={() => setPayments((prev) => prev.filter((x) => x.key !== p.key))}><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="input-row">
                  <Field label="Amount">
                    <Input type="number" min={0} step="any" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder="0" />
                  </Field>
                  <Field label="Method">
                    <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentMethod })}>
                      {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  </Field>
                  <Field label="Payment date">
                    <Input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
                  </Field>
                  <Field label="Reference (optional)">
                    <Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="UPI / cheque no." />
                  </Field>
                </div>
                {payError ? <div className="form-error" style={{ marginTop: 6 }}>{payError}</div> : null}
                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                  <Button size="sm" variant="secondary" onClick={addPayment}><Plus size={14} /> Add payment</Button>
                  <Button size="sm" variant="ghost" onClick={payFull} disabled={balance <= 0}>Pay full balance</Button>
                  <span className="muted small">Paid {formatINR(paid)} · Balance {formatINR(balance)}</span>
                </div>
              </>
            )}
          </Card>
        </div>

        <aside className="bill-summary">
          <Card title="Bill summary">
            <div className="stack" style={{ gap: 4 }}>
              <KV label="Subtotal" value={formatINR(totals.subtotal)} />
              <KV label="Discount" value={`− ${formatINR(totals.discount)}`} />
              <KV label="Additional charges" value={formatINR(totals.additionalCharges)} />
              {totals.gstAmount > 0 ? <KV label={`GST (${app.settings.gstRate}%)`} value={formatINR(totals.gstAmount)} /> : null}
              <KV label="Grand total" value={formatINR(totals.total)} strong />
              <KV label="Paid" value={formatINR(editing ? editing.paid : paid)} />
              <KV label="Balance due" value={formatINR(editing ? editing.balance : balance)} strong />
              <div style={{ marginTop: 6 }}><StatusBadge status={editing?.status || status} /></div>
            </div>
            <div className="divider" />
            <div className="stack" style={{ gap: 8 }}>
              <Button block size="lg" onClick={() => void save('save')} loading={saving} disabled={items.length === 0}>
                <Save size={17} /> {editing ? 'Update bill' : 'Save bill'}
              </Button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Button variant="secondary" onClick={() => void save('print')} loading={saving} disabled={items.length === 0}>
                  <Printer size={16} /> Save &amp; print
                </Button>
                <Button variant="secondary" onClick={() => void save('share')} loading={saving} disabled={items.length === 0}>
                  <Share2 size={16} /> Share
                </Button>
              </div>
              {editing ? (
                <Button variant="ghost" onClick={() => void save('new')} disabled={saving}><FilePlus2 size={16} /> Save &amp; new bill</Button>
              ) : (
                <Button variant="ghost" onClick={() => void save('new')} disabled={saving}><FilePlus2 size={16} /> Save &amp; new bill</Button>
              )}
              <Button variant="ghost" onClick={() => void downloadPdf()} disabled={!savedId && !editing}>Download PDF</Button>
            </div>
            <SectionNote tone="info">
              Saving works even when offline and without a printer. If printing fails, the bill remains saved.
            </SectionNote>
          </Card>
        </aside>
      </div>

      <Modal
        open={showCustomer}
        title="Select or add customer"
        subtitle="Walk-in billing is always available. Mobile number is optional."
        onClose={() => { setShowCustomer(false); setSimilar([]); }}
        width={600}
      >
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <Button variant="secondary" size="sm" onClick={walkIn} style={{ flex: 1 }}>Use Walk-in Customer</Button>
        </div>
        <SearchInput value={custSearch} onChange={setCustSearch} placeholder="Search by name or mobile number…" />
        <div style={{ maxHeight: 230, overflowY: 'auto', marginTop: 9 }}>
          {customers.length === 0 ? (
            <div className="muted small" style={{ padding: '14px 2px' }}>{custSearch ? 'No matching customer. Add one below.' : 'No customers yet. Add one below.'}</div>
          ) : (
            customers.map((c) => (
              <button key={c.id} className="list-row" style={{ width: '100%', background: 'transparent', border: '0', borderBottom: '1px solid var(--border)', textAlign: 'left' }} onClick={() => pickCustomer(c)}>
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{c.name}</div>
                  <div className="cell-sub">{c.phone || 'No mobile number'}{c.address ? ` · ${c.address}` : ''}</div>
                </div>
                {customerId === c.id ? <span className="pill pill-green">Selected</span> : null}
              </button>
            ))
          )}
        </div>

        <div className="divider" />
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 9 }}>Quick add customer</div>
        <div className="input-row">
          <Field label="Name" required><Input value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} placeholder="Customer name" maxLength={80} /></Field>
          <Field label="Mobile number" hint="Optional"><Input value={quick.phone} onChange={(e) => setQuick({ ...quick, phone: e.target.value })} placeholder="Optional" inputMode="tel" /></Field>
        </div>
        <div className="input-row" style={{ marginTop: 9 }}>
          <Field label="Address" hint="Optional"><Input value={quick.address} onChange={(e) => setQuick({ ...quick, address: e.target.value })} /></Field>
          <Field label="Notes" hint="Optional"><Input value={quick.notes} onChange={(e) => setQuick({ ...quick, notes: e.target.value })} /></Field>
        </div>
        {quickError ? <div className="form-error" style={{ marginTop: 7 }}>{quickError}</div> : null}
        {similar.length > 0 ? (
          <div className="section-note note-warn" style={{ marginTop: 9 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}><AlertTriangle size={16} /><span>Possible duplicate: {similar.map((s) => s.name + (s.phone ? ` (${s.phone})` : '')).join(', ')}. Select the existing customer, or confirm to add anyway.</span></div>
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => pickCustomer(similar[0])}>Use existing</Button>
              <Button size="sm" variant="gold" onClick={() => void quickAdd(true)}>Add anyway</Button>
              <Button size="sm" variant="ghost" onClick={() => setSimilar([])}>Review</Button>
            </div>
          </div>
        ) : (
          <Button block style={{ marginTop: 10 }} onClick={() => void quickAdd(false)}><UserPlus size={16} /> Add &amp; select customer</Button>
        )}
        <div className="muted small" style={{ marginTop: 8 }}><Info size={12} style={{ verticalAlign: -2 }} /> Similar names are flagged for confirmation; exact duplicate mobiles are always flagged.</div>
      </Modal>

      <ConfirmDialog
        open={newConfirm}
        title="Start a new bill?"
        message="The current unsaved items will be cleared. Saved bills are not affected."
        confirmLabel="Start new bill"
        onConfirm={resetAll}
        onCancel={() => setNewConfirm(false)}
      />
    </div>
  );
}

function KV({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`kv${strong ? ' kv-strong' : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
