import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CircleAlert, PackagePlus, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { InventoryItem, StockTxn, StockTxnType } from '../lib/types';
import { stockValue } from '../services/analytics';
import { createInventoryItem, deleteInventoryItem, recordStockTxn, stockDelta, updateInventoryItem } from '../services/inventory';
import { addAudit } from '../services/audit';
import { formatDate, formatINR, formatNumber, todayISO } from '../lib/format';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, SectionNote, Select, StatCard, useToast } from '../components/ui';

const emptyItem = { name: '', unit: 'sq.ft', stockQty: '0', lowStockAt: '0', costPerUnit: '0', notes: '' };

const TXN_LABEL: Record<StockTxnType, string> = {
  purchase: 'Stock in',
  usage: 'Stock used',
  adjustment: 'Adjustment'
};

export function InventoryPage() {
  const app = useApp();
  const toast = useToast();
  const enabled = app.settings.inventoryEnabled;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyItem);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null);
  const [stockForm, setStockForm] = useState({ type: 'purchase' as StockTxnType, qty: '', date: todayISO(), note: '' });
  const [stockError, setStockError] = useState('');
  const [stockSaving, setStockSaving] = useState(false);
  const [remove, setRemove] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const value = useMemo(() => stockValue(app.inventory), [app.inventory]);
  const lowStock = useMemo(() => app.inventory.filter((i) => i.lowStockAt > 0 && i.stockQty <= i.lowStockAt), [app.inventory]);
  const txns = useMemo(() => [...app.stockTxns].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, 30), [app.stockTxns]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyItem);
    setError('');
    setOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      unit: item.unit,
      stockQty: String(item.stockQty),
      lowStockAt: String(item.lowStockAt),
      costPerUnit: String(item.costPerUnit),
      notes: item.notes || ''
    });
    setError('');
    setOpen(true);
  };

  const save = async () => {
    setError('');
    const stockQty = parseFloat(form.stockQty) || 0;
    const low = parseFloat(form.lowStockAt) || 0;
    const cost = parseFloat(form.costPerUnit) || 0;
    setSaving(true);
    try {
      const input = { name: form.name, unit: form.unit, stockQty, lowStockAt: low, costPerUnit: cost, notes: form.notes };
      if (editing) {
        await updateInventoryItem(app.service, editing, input, app.user);
        toast('Material updated', 'success');
      } else {
        await createInventoryItem(app.service, input, app.user);
        toast('Material added', 'success');
      }
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openStock = (item: InventoryItem, type: StockTxnType) => {
    setStockItem(item);
    setStockForm({ type, qty: '', date: todayISO(), note: '' });
    setStockError('');
    setStockOpen(true);
  };

  const saveStock = async () => {
    if (!stockItem) return;
    setStockError('');
    const qty = parseFloat(stockForm.qty);
    if (!Number.isFinite(qty) || qty === 0) return setStockError('Enter a quantity other than zero.');
    if (stockForm.type !== 'adjustment' && qty < 0) return setStockError('Quantity must be greater than zero.');
    setStockSaving(true);
    try {
      await recordStockTxn(app.service, stockItem, { type: stockForm.type, qty, date: stockForm.date, note: stockForm.note }, app.settings.allowNegativeStock, app.user);
      toast(`${TXN_LABEL[stockForm.type]} recorded`, 'success');
      setStockOpen(false);
    } catch (e) {
      setStockError((e as Error).message);
    } finally {
      setStockSaving(false);
    }
  };

  const doDelete = async () => {
    if (!remove) return;
    setDeleting(true);
    try {
      await deleteInventoryItem(app.service, remove, app.user);
      toast('Material deleted', 'success');
      setRemove(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const enableInventory = async () => {
    try {
      await app.service.set('settings', 'business', { inventoryEnabled: true });
      await addAudit(app.service, app.user, { entity: 'settings', entityId: 'business', action: 'update', summary: 'Inventory tracking enabled' });
      toast('Inventory tracking enabled', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  let preview = 0;
  if (stockItem) preview = Math.max(0, stockItem.stockQty + stockDelta(stockForm.type, parseFloat(stockForm.qty) || 0));

  return (
    <div className="page">
      <PageHeader
        title="Inventory"
        subtitle="Optional material tracking. Billing never depends on stock levels."
        eyebrow="MATERIALS"
        actions={
          <>
            {!enabled && app.isOwner ? <Button variant="secondary" onClick={() => void enableInventory()}><SlidersHorizontal size={16} /> Enable tracking</Button> : null}
            <Button onClick={openAdd}><PackagePlus size={16} /> Add Material</Button>
          </>
        }
      />

      {!enabled ? (
        <SectionNote tone="info">
          Inventory tracking is currently switched off in Settings. You can still record materials here; billing works with or without stock levels. Turn it on to show stock warnings in the workspace.
        </SectionNote>
      ) : null}

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Stock value" value={formatINR(value)} icon={<Boxes size={16} />} tone="brand" hint="Quantity × cost per unit" />
        <StatCard label="Materials" value={String(app.inventory.length)} icon={<PackagePlus size={16} />} tone="blue" hint="Tracked items" />
        <StatCard label="Low stock" value={String(lowStock.length)} icon={<CircleAlert size={16} />} tone={lowStock.length > 0 ? 'red' : 'green'} hint={lowStock.length > 0 ? 'At or below the reorder level' : 'Everything above the reorder level'} />
        <StatCard label="Movements" value={String(app.stockTxns.length)} icon={<ArrowDownToLine size={16} />} tone="gold" hint="Stock in, usage and adjustments" />
      </div>

      <Card title="Materials" subtitle="Stock is a running quantity; every movement is recorded separately." padded={false}>
        {app.inventory.length === 0 ? (
          <EmptyState
            icon={<Boxes size={22} />}
            title="No materials yet"
            text="Add flex rolls, sunpack sheets, vinyl, frames or any material you want to track."
            action={<Button size="sm" onClick={openAdd}><PackagePlus size={15} /> Add Material</Button>}
          />
        ) : (
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="tbl stack-cards">
              <thead><tr><th>Material</th><th className="num">Stock</th><th className="num">Reorder at</th><th className="num">Cost / unit</th><th className="num">Value</th><th>Status</th><th className="actions">Actions</th></tr></thead>
              <tbody>
                {app.inventory.map((item) => {
                  const low = item.lowStockAt > 0 && item.stockQty <= item.lowStockAt;
                  return (
                    <tr key={item.id}>
                      <td data-label="Material"><div className="cell-main">{item.name}</div>{item.notes ? <div className="cell-sub">{item.notes}</div> : null}</td>
                      <td className="num" data-label="Stock"><b>{formatNumber(item.stockQty)}</b> <span className="muted small">{item.unit}</span></td>
                      <td className="num" data-label="Reorder at">{formatNumber(item.lowStockAt)}</td>
                      <td className="num" data-label="Cost / unit">{formatINR(item.costPerUnit)}</td>
                      <td className="num" data-label="Value">{formatINR(item.stockQty * item.costPerUnit)}</td>
                      <td data-label="Status">{low ? <span className="pill pill-red">Low stock</span> : <span className="pill pill-green">OK</span>}</td>
                      <td className="actions" data-label="">
                        <button className="icon-btn" title="Stock in" onClick={() => openStock(item, 'purchase')}><ArrowDownToLine size={14} /></button>
                        <button className="icon-btn" title="Stock used" style={{ marginLeft: 5 }} onClick={() => openStock(item, 'usage')}><ArrowUpFromLine size={14} /></button>
                        <button className="icon-btn" title="Edit material" style={{ marginLeft: 5 }} onClick={() => openEdit(item)}><Pencil size={14} /></button>
                        <button className="icon-btn danger" title="Delete material" style={{ marginLeft: 5 }} onClick={() => setRemove(item)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Recent stock movements" subtitle="The latest 30 purchase, usage and adjustment entries." padded={false}>
        {txns.length === 0 ? (
          <EmptyState icon={<ArrowDownToLine size={22} />} title="No movements yet" text="Record a stock purchase or usage from a material row." />
        ) : (
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="tbl stack-cards">
              <thead><tr><th>Date</th><th>Material</th><th>Type</th><th className="num">Qty</th><th>Note</th></tr></thead>
              <tbody>
                {txns.map((t: StockTxn) => (
                  <tr key={t.id}>
                    <td data-label="Date">{formatDate(t.date)}</td>
                    <td data-label="Material">{t.itemName}</td>
                    <td data-label="Type"><span className={`pill ${t.type === 'purchase' ? 'pill-green' : t.type === 'usage' ? 'pill-gold' : 'pill-blue'}`}>{TXN_LABEL[t.type]}</span></td>
                    <td className="num" data-label="Qty">{formatNumber(t.qty)}</td>
                    <td data-label="Note">{t.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        title={editing ? 'Edit material' : 'Add material'}
        onClose={() => setOpen(false)}
        width={600}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} loading={saving}>{editing ? 'Save changes' : 'Add material'}</Button>
          </>
        }
      >
        <Field label="Material name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Flex roll 440 GSM" maxLength={100} autoFocus /></Field>
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Unit" required><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="sq.ft" maxLength={20} /></Field>
          <Field label="Opening / current stock"><Input type="number" step="any" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} /></Field>
          <Field label="Reorder level"><Input type="number" step="any" value={form.lowStockAt} onChange={(e) => setForm({ ...form, lowStockAt: e.target.value })} /></Field>
        </div>
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Cost per unit (₹)"><Input type="number" min={0} step="any" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} /></Field>
          <Field label="Notes" hint="Optional"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={160} /></Field>
        </div>
        {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
        <SectionNote tone="info">Editing the stock quantity here corrects the opening balance. Use Stock in / Stock used for normal movements so the history stays accurate.</SectionNote>
      </Modal>

      <Modal
        open={stockOpen}
        title={stockItem ? `${TXN_LABEL[stockForm.type]} — ${stockItem.name}` : 'Stock movement'}
        subtitle={stockItem ? `Current stock: ${formatNumber(stockItem.stockQty)} ${stockItem.unit}` : undefined}
        onClose={() => setStockOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStockOpen(false)} disabled={stockSaving}>Cancel</Button>
            <Button onClick={() => void saveStock()} loading={stockSaving}>Save movement</Button>
          </>
        }
      >
        <div className="input-row">
          <Field label="Movement type">
            <Select value={stockForm.type} onChange={(e) => setStockForm({ ...stockForm, type: e.target.value as StockTxnType })}>
              <option value="purchase">Stock in (purchase)</option>
              <option value="usage">Stock used (consumption)</option>
              <option value="adjustment">Adjustment (+/-)</option>
            </Select>
          </Field>
          <Field label="Quantity" hint={stockForm.type === 'adjustment' ? 'Positive to add, negative to remove' : undefined}>
            <Input type="number" step="any" value={stockForm.qty} onChange={(e) => setStockForm({ ...stockForm, qty: e.target.value })} />
          </Field>
        </div>
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Date"><Input type="date" value={stockForm.date} onChange={(e) => setStockForm({ ...stockForm, date: e.target.value })} /></Field>
          <Field label="Note" hint="Optional"><Input value={stockForm.note} onChange={(e) => setStockForm({ ...stockForm, note: e.target.value })} maxLength={160} /></Field>
        </div>
        {stockItem ? (
          <div className="calc-preview" style={{ marginTop: 10 }}>
            New stock: <b>{formatNumber(preview)} {stockItem.unit}</b>
            {app.settings.allowNegativeStock ? ' · negative stock allowed' : ' · negative stock blocked'}
          </div>
        ) : null}
        {stockError ? <div className="form-error" style={{ marginTop: 8 }}>{stockError}</div> : null}
      </Modal>

      <ConfirmDialog
        open={!!remove}
        title="Delete this material?"
        message={remove ? `${remove.name} and its current stock level will be removed. Past stock movements remain in the audit history.` : ''}
        confirmLabel="Delete material"
        busy={deleting}
        onConfirm={() => void doDelete()}
        onCancel={() => setRemove(null)}
      />
    </div>
  );
}
