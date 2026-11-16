import { useEffect, useMemo, useState } from 'react';
import { Frame, IndianRupee, Pencil, Plus, Power, Save, Trash2, TriangleAlert } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { FrameSize, ProductConfig, RoundingMode } from '../lib/types';
import { PRODUCT_KEYS, SQFT_RATE_PRODUCTS, frameSeedId } from '../lib/constants';
import { uid } from '../lib/ids';
import { formatINR } from '../lib/format';
import { addAudit } from '../services/audit';
import { Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Pill, SectionNote, Select, useToast } from '../components/ui';

type ProductDraft = {
  rate: string;
  basisSqft: string;
  minSqft: string;
  minChargeEnabled: boolean;
  rounding: RoundingMode;
  active: boolean;
  purchaseCostPerSqft: string;
};

function draftFrom(p: ProductConfig): ProductDraft {
  return {
    rate: String(p.rate ?? 0),
    basisSqft: String(p.basisSqft ?? 16),
    minSqft: String(p.minSqft ?? 0),
    minChargeEnabled: !!p.minChargeEnabled,
    rounding: p.rounding || 'nearest',
    active: p.active !== false,
    purchaseCostPerSqft: String(p.purchaseCostPerSqft ?? 0)
  };
}

export function ProductsPage() {
  const app = useApp();
  const toast = useToast();
  const canEdit = app.isOwner;
  const [frameOpen, setFrameOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState<FrameSize | null>(null);
  const [frameForm, setFrameForm] = useState({ width: '', height: '', price: '', active: true });
  const [frameError, setFrameError] = useState('');
  const [frameSaving, setFrameSaving] = useState(false);
  const [deleteFrame, setDeleteFrame] = useState<FrameSize | null>(null);
  const [deleting, setDeleting] = useState(false);

  const frames = useMemo(
    () => [...app.frames].sort((a, b) => a.width * a.height - b.width * b.height || a.width - b.width),
    [app.frames]
  );

  const openAddFrame = () => {
    setEditingFrame(null);
    setFrameForm({ width: '', height: '', price: '', active: true });
    setFrameError('');
    setFrameOpen(true);
  };

  const openEditFrame = (frame: FrameSize) => {
    setEditingFrame(frame);
    setFrameForm({ width: String(frame.width), height: String(frame.height), price: String(frame.price), active: !!frame.active });
    setFrameError('');
    setFrameOpen(true);
  };

  const saveFrame = async () => {
    if (!canEdit) return setFrameError('Only the owner can change rates.');
    const width = parseFloat(frameForm.width);
    const height = parseFloat(frameForm.height);
    const price = parseFloat(frameForm.price);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return setFrameError('Enter a width and height greater than zero.');
    if (!Number.isFinite(price) || price < 0) return setFrameError('Enter a valid frame price (0 or more).');
    const exists = frames.find((f) => f.id !== editingFrame?.id && f.width === width && f.height === height);
    if (exists) return setFrameError(`The size ${width}×${height} already exists. Edit that row instead.`);

    setFrameSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingFrame) {
        await app.service.set('frameSizes', editingFrame.id, {
          width,
          height,
          label: `${width}×${height}`,
          price,
          active: frameForm.active
        });
        await addAudit(app.service, app.user, {
          entity: 'frame',
          entityId: editingFrame.id,
          action: 'update',
          summary: `Frame ${width}×${height} updated — ₹${editingFrame.price} → ₹${price}${frameForm.active ? '' : ' (inactive)'}`
        });
        toast('Frame size updated', 'success');
      } else {
        const doc: FrameSize = {
          id: frames.some((f) => f.id === frameSeedId(width, height)) ? uid('frame_') : frameSeedId(width, height),
          width,
          height,
          label: `${width}×${height}`,
          price,
          active: frameForm.active,
          sortOrder: frames.length,
          createdAt: now,
          updatedAt: now
        };
        await app.service.set('frameSizes', doc.id, doc as unknown as Record<string, unknown>);
        await addAudit(app.service, app.user, {
          entity: 'frame',
          entityId: doc.id,
          action: 'create',
          summary: `Frame ${width}×${height} added at ₹${price}`
        });
        toast('Frame size added', 'success');
      }
      setFrameOpen(false);
    } catch (e) {
      setFrameError((e as Error).message);
    } finally {
      setFrameSaving(false);
    }
  };

  const toggleFrame = async (frame: FrameSize) => {
    if (!canEdit) return toast('Only the owner can change rates.', 'warn');
    try {
      await app.service.set('frameSizes', frame.id, { active: !frame.active });
      await addAudit(app.service, app.user, {
        entity: 'frame',
        entityId: frame.id,
        action: 'update',
        summary: `Frame ${frame.width}×${frame.height} ${frame.active ? 'deactivated' : 'activated'}`
      });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const removeFrame = async () => {
    if (!deleteFrame) return;
    const used = app.bills.some((b) => (b.items || []).some((i) => i.frameSizeId === deleteFrame.id));
    if (used) {
      toast('This size is used on saved bills. Deactivate it instead — history must keep its price and label.', 'warn');
      setDeleteFrame(null);
      return;
    }
    setDeleting(true);
    try {
      await app.service.delete('frameSizes', deleteFrame.id);
      await addAudit(app.service, app.user, {
        entity: 'frame',
        entityId: deleteFrame.id,
        action: 'delete',
        summary: `Frame ${deleteFrame.width}×${deleteFrame.height} deleted`
      });
      toast('Frame size deleted', 'success');
      setDeleteFrame(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Products & Rates"
        subtitle="Rates are stored in your database and used by every bill. The app never invents a price."
        eyebrow="PRICING CONTROL"
        actions={canEdit ? <Button onClick={openAddFrame}><Plus size={16} /> Add frame size</Button> : <Pill tone="gold">Owner access required to edit</Pill>}
      />

      {!canEdit ? (
        <SectionNote tone="warn">You can view rates and frame prices, but only the owner account can change them.</SectionNote>
      ) : null}

      <SectionNote tone="info">
        <b>Square-feet formula:</b> Area = width (ft) × height (ft); line total = area × rate per sq.ft × quantity. Flex, Vinyl and Star are entered in feet. <b>Frame:</b> line total = fixed price per piece × quantity.
      </SectionNote>

      <RateBook canEdit={canEdit} />

      <div className="grid grid-2" style={{ marginTop: 12 }}>
        {PRODUCT_KEYS.filter((key) => key === 'SUNPACK' || key === 'FRAME').map((key) => {
          const product = app.products.find((p) => p.key === key);
          if (!product) return null;
          return <ProductEditor key={key} product={product} canEdit={canEdit} />;
        })}
      </div>

      <Card
        title={<span>Frame Prices / <span lang="ta">ஃபிரேம் விலை</span></span>}
        subtitle={`${frames.length} size${frames.length === 1 ? '' : 's'} in inches · fixed price per piece · supplied prices are preserved`}
        right={canEdit ? <Button size="sm" variant="secondary" onClick={openAddFrame}><Plus size={14} /> Add size</Button> : undefined}
        padded={false}
        className="hover-lift"
      >
        {frames.length === 0 ? (
          <div style={{ padding: 20 }}>
            <SectionNote tone="warn">No frame sizes found. Add the sizes from your rate chart — they are never guessed.</SectionNote>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="tbl">
              <thead><tr><th>Size (inches)</th><th>Sq.ft</th><th className="num">Price per piece</th><th>Status</th><th className="actions">Actions</th></tr></thead>
              <tbody>
                {frames.map((f) => (
                  <tr key={f.id} style={{ opacity: f.active ? 1 : 0.55 }}>
                    <td><div className="cell-main"><Frame size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{f.width} × {f.height}</div><div className="cell-sub">{f.label || `${f.width}×${f.height}`} in</div></td>
                    <td>{((f.width * f.height) / 144).toFixed(2)}</td>
                    <td className="num"><b>{formatINR(f.price)}</b></td>
                    <td>{f.active ? <Pill tone="green">Active</Pill> : <Pill tone="neutral">Inactive</Pill>}</td>
                    <td className="actions">
                      {canEdit ? (
                        <>
                          <button className="icon-btn" title="Edit frame price" onClick={() => openEditFrame(f)}><Pencil size={14} /></button>
                          <button className="icon-btn" title={f.active ? 'Deactivate' : 'Activate'} style={{ marginLeft: 6 }} onClick={() => void toggleFrame(f)}><Power size={14} /></button>
                          <button className="icon-btn danger" title="Delete frame size" style={{ marginLeft: 6 }} onClick={() => setDeleteFrame(f)}><Trash2 size={14} /></button>
                        </>
                      ) : <span className="muted small">View only</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SectionNote tone="info">
        <b>Beading / <span lang="ta">பீடிங்</span>:</b> the supplied frame price list gives one fixed price per size, with no beading-specific prices. Choosing 1 inch, 1½ inches or 2 inches therefore records the beading on the bill and keeps the listed size price.
      </SectionNote>

      <SectionNote tone="warn">
        <TriangleAlert size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
        Changing a rate affects future bills only. Saved bills keep the rate and amount that were charged at the time.
      </SectionNote>

      <Modal
        open={frameOpen}
        title={editingFrame ? 'Edit frame size' : 'Add frame size'}
        subtitle="Frame billing is a fixed price per piece."
        onClose={() => setFrameOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFrameOpen(false)} disabled={frameSaving}>Cancel</Button>
            <Button onClick={() => void saveFrame()} loading={frameSaving}><Save size={15} /> Save size</Button>
          </>
        }
      >
        <div className="input-row">
          <Field label="Width (inches)" required><Input type="number" min={0} step="any" value={frameForm.width} onChange={(e) => setFrameForm({ ...frameForm, width: e.target.value })} /></Field>
          <Field label="Height (inches)" required><Input type="number" min={0} step="any" value={frameForm.height} onChange={(e) => setFrameForm({ ...frameForm, height: e.target.value })} /></Field>
          <Field label="Price per piece (₹)" required><Input type="number" min={0} step="any" value={frameForm.price} onChange={(e) => setFrameForm({ ...frameForm, price: e.target.value })} /></Field>
        </div>
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={frameForm.active} onChange={(e) => setFrameForm({ ...frameForm, active: e.target.checked })} />
          Active (available while billing)
        </label>
        {frameError ? <div className="form-error" style={{ marginTop: 8 }}>{frameError}</div> : null}
        <SectionNote tone="info">Deactivate a size instead of deleting it if it has been used on a bill. Historic bills keep their original price.</SectionNote>
      </Modal>

      <ConfirmDialog
        open={!!deleteFrame}
        title="Delete this frame size?"
        message={deleteFrame ? `Remove ${deleteFrame.width}×${deleteFrame.height} (${formatINR(deleteFrame.price)}) from the price table. Bills already saved are not changed.` : ''}
        confirmLabel="Delete size"
        busy={deleting}
        onConfirm={() => void removeFrame()}
        onCancel={() => setDeleteFrame(null)}
      />
    </div>
  );
}

function RateBook({ canEdit }: { canEdit: boolean }) {
  const app = useApp();
  const toast = useToast();
  const cloth = useMemo(
    () => SQFT_RATE_PRODUCTS
      .map((key) => app.products.find((p) => p.key === key))
      .filter((p): p is ProductConfig => !!p),
    [app.products]
  );
  type RateDraft = { rate: string; active: boolean };
  const [draft, setDraft] = useState<Record<string, RateDraft>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');

  useEffect(() => {
    setDraft(
      Object.fromEntries(cloth.map((p) => [p.key, { rate: String(p.rate ?? 0), active: p.active !== false }]))
    );
  }, [cloth]);

  const update = (key: string, patch: Partial<RateDraft>) => {
    setDraft((d) => ({
      ...d,
      [key]: { rate: d[key]?.rate ?? '0', active: d[key]?.active ?? true, ...patch }
    }));
    setSavedAt('');
  };

  const save = async () => {
    if (!canEdit) return setError('Only the owner can change rates.');
    setError('');
    const rows = cloth.map((p) => {
      const d = draft[p.key] || { rate: String(p.rate ?? 0), active: p.active !== false };
      return { product: p, rate: parseFloat(d.rate), active: d.active };
    });
    const invalid = rows.find((r) => !Number.isFinite(r.rate) || r.rate < 0);
    if (invalid) return setError(`Enter a valid ₹/sq.ft rate for ${invalid.product.name}.`);

    setSaving(true);
    try {
      for (const row of rows) {
        await app.service.set('productConfigs', row.product.id, {
          pricingMode: 'sqft',
          rate: row.rate,
          basisSqft: 1,
          active: row.active
        });
      }
      const summary = rows.map((r) => `${r.product.name} ₹${r.rate}/sq.ft`).join(' · ');
      await addAudit(app.service, app.user, {
        entity: 'product',
        entityId: 'rate-book',
        action: 'update',
        summary: `Flex/Vinyl/Star rates saved — ${summary}`
      });
      toast(`Rates saved — ${summary}`, 'success');
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={<span><IndianRupee size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Flex, Vinyl &amp; Star rates</span>}
      subtitle="Directly editable ₹/sq.ft rates. These are the rates every new bill uses."
    >
      <div className="grid grid-3">
        {cloth.map((p) => (
          <div key={p.key} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {p.name} <span className="muted small" style={{ fontWeight: 500 }}>{p.nameTa}</span>
            </div>
            <Field label="Rate (₹/sq.ft)" required>
              <Input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={draft[p.key]?.rate ?? String(p.rate ?? 0)}
                disabled={!canEdit}
                onChange={(e) => update(p.key, { rate: e.target.value })}
              />
            </Field>
            <label className="check" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={draft[p.key]?.active ?? p.active !== false}
                disabled={!canEdit}
                onChange={(e) => update(p.key, { active: e.target.checked })}
              />
              Available for billing
            </label>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12, gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={() => void save()} loading={saving} disabled={!canEdit}>
          <Save size={15} /> Save Rates / <span lang="ta">விலையைச் சேமி</span>
        </Button>
        <span className="muted small">Line total = width (ft) × height (ft) × rate × quantity.</span>
      </div>
      {savedAt ? (
        <SectionNote tone="success">Rates saved at {savedAt} and stored in this account. New bills on Android and Windows use these saved values.</SectionNote>
      ) : null}
      {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
    </Card>
  );
}

function ProductEditor({ product, canEdit }: { product: ProductConfig; canEdit: boolean }) {
  const app = useApp();
  const toast = useToast();
  const [draft, setDraft] = useState<ProductDraft>(() => draftFrom(product));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const frame = product.key === 'FRAME';

  useEffect(() => {
    setDraft(draftFrom(product));
  }, [product]);

  const save = async () => {
    if (!canEdit) return setError('Only the owner can change rates.');
    const rate = parseFloat(draft.rate);
    const basis = parseFloat(draft.basisSqft);
    const minSqft = parseFloat(draft.minSqft);
    const cost = parseFloat(draft.purchaseCostPerSqft);
    if (!frame && (!Number.isFinite(rate) || rate < 0)) return setError('Enter a valid rate (0 or more).');
    if (!Number.isFinite(basis) || basis <= 0) return setError('Pricing basis must be greater than zero.');
    if (!Number.isFinite(minSqft) || minSqft < 0) return setError('Minimum sq.ft must be zero or more.');
    if (!Number.isFinite(cost) || cost < 0) return setError('Purchase cost must be zero or more.');

    setSaving(true);
    try {
      await app.service.set('productConfigs', product.id, {
        key: product.key,
        name: product.name,
        nameTa: product.nameTa,
        pricingMode: frame ? 'fixed' : 'sqft',
        rate: frame ? 0 : rate,
        basisSqft: basis,
        minSqft,
        minChargeEnabled: frame ? false : draft.minChargeEnabled,
        rounding: draft.rounding,
        active: draft.active,
        purchaseCostPerSqft: cost
      });
      await addAudit(app.service, app.user, {
        entity: 'product',
        entityId: product.id,
        action: 'update',
        summary: `${product.name} updated — ${frame ? 'fixed frame pricing' : `₹${rate} per ${basis} sq.ft`}${draft.active ? '' : ' (inactive)'}`
      });
      toast(`${product.name} settings saved`, 'success');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(draftFrom(product));
    setError('');
  };

  return (
    <Card
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {product.name}
          <span className="muted small" style={{ fontWeight: 500 }}>{product.nameTa}</span>
          {product.active ? <Pill tone="green">Active</Pill> : <Pill tone="red">Inactive</Pill>}
        </span>
      }
      subtitle={frame ? 'Fixed size-wise price from the frame table below.' : 'Square-feet pricing with configurable basis, minimum and rounding.'}
    >
      {frame ? (
        <div>
          <div className="keyval" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 650 }}>Fixed frame pricing</div>
              <div className="cell-sub">Prices come from the {app.frames.length}-size frame table. Edit a size to change its price.</div>
            </div>
            <IndianRupee size={18} color="var(--gold-600)" />
          </div>
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={draft.active} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Available for billing
          </label>
        </div>
      ) : (
        <>
          {product.rate <= 0 ? <SectionNote tone="warn">No rate configured yet. Bills cannot price {product.name} until you enter the shop's rate.</SectionNote> : null}
          <div className="input-row" style={{ marginTop: product.rate <= 0 ? 10 : 0 }}>
            <Field label="Rate (₹)" hint={`Per ${draft.basisSqft || 16} sq.ft`} required>
              <Input type="number" min={0} step="any" value={draft.rate} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
            </Field>
            <Field label="Basis (sq.ft)" hint="Default 16" required>
              <Input type="number" min={0.01} step="any" value={draft.basisSqft} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, basisSqft: e.target.value })} />
            </Field>
            <Field label="Rounding">
              <Select value={draft.rounding} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, rounding: e.target.value as RoundingMode })}>
                <option value="none">No rounding (2 decimals)</option>
                <option value="nearest">Nearest rupee</option>
                <option value="up">Round up</option>
                <option value="down">Round down</option>
              </Select>
            </Field>
          </div>
          <div className="input-row" style={{ marginTop: 10 }}>
            <Field label="Minimum charge (sq.ft)" hint="Applied when enabled">
              <Input type="number" min={0} step="any" value={draft.minSqft} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, minSqft: e.target.value })} />
            </Field>
            <Field label="Cost per sq.ft" hint="Optional, for profit estimates">
              <Input type="number" min={0} step="any" value={draft.purchaseCostPerSqft} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, purchaseCostPerSqft: e.target.value })} />
            </Field>
            <Field label="Status">
              <label className="check" style={{ minHeight: 38 }}>
                <input type="checkbox" checked={draft.active} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Active
              </label>
            </Field>
          </div>
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={draft.minChargeEnabled} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, minChargeEnabled: e.target.checked })} />
            Apply minimum charge ({draft.minSqft || 0} sq.ft)
          </label>
          <div className="calc-preview" style={{ marginTop: 10 }}>
            Amount = (chargeable sq.ft ÷ {draft.basisSqft || 16}) × {formatINR(parseFloat(draft.rate) || 0)} × qty
            {draft.minChargeEnabled ? ` · minimum ${draft.minSqft || 0} sq.ft` : ''} · rounding: {draft.rounding}
          </div>
        </>
      )}

      {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
      {canEdit ? (
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <Button onClick={() => void save()} loading={saving}><Save size={15} /> Save</Button>
          <Button variant="ghost" onClick={reset} disabled={saving}>Reset</Button>
        </div>
      ) : null}
    </Card>
  );
}
