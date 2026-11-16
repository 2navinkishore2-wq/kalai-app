import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Download, IndianRupee, Pencil, Phone, Search, UserPlus, Users, WalletCards } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { Customer } from '../lib/types';
import { customerStats, findSimilarCustomers, searchCustomers, createCustomer, updateCustomer } from '../services/customers';
import { addAudit } from '../services/audit';
import { csvEscape, downloadText, formatDate, formatINR, isValidPhone, todayISO } from '../lib/format';
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, SectionNote, StatCard, useToast } from '../components/ui';

interface CustomerForm {
  name: string;
  phone: string;
  address: string;
  email: string;
  notes: string;
}

const emptyForm: CustomerForm = { name: '', phone: '', address: '', email: '', notes: '' };

export function CustomersPage() {
  const app = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const openedNew = useRef(false);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'pending'>('recent');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [error, setError] = useState('');
  const [similar, setSimilar] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => customerStats(app.customers, app.bills), [app.customers, app.bills]);

  useEffect(() => {
    if (params.get('new') === '1' && !openedNew.current) {
      openedNew.current = true;
      setEditing(null);
      setForm(emptyForm);
      setError('');
      setSimilar([]);
      setOpen(true);
      navigate('/customers', { replace: true });
    }
  }, [params, navigate]);

  const filtered = useMemo(() => {
    const matched = searchCustomers(app.customers, query);
    return [...matched].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'pending') return (stats.get(b.id)?.pending || 0) - (stats.get(a.id)?.pending || 0);
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }, [app.customers, query, sort, stats]);

  const totals = useMemo(() => {
    let purchases = 0;
    let pending = 0;
    let withDue = 0;
    for (const c of app.customers) {
      const s = stats.get(c.id);
      purchases += s?.purchases || 0;
      pending += s?.pending || 0;
      if (s && s.pending > 0) withDue += 1;
    }
    return { purchases, pending, withDue };
  }, [app.customers, stats]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setSimilar([]);
    setOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setForm({
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
      email: customer.email || '',
      notes: customer.notes || ''
    });
    setError('');
    setSimilar([]);
    setOpen(true);
  };

  const save = async (force = false) => {
    setError('');
    if (!form.name.trim()) return setError('Customer name is required. Mobile number is optional.');
    if (form.phone.trim() && !isValidPhone(form.phone)) return setError('Enter a valid mobile number, or leave it blank.');
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Enter a valid email address, or leave it blank.');

    const matches = findSimilarCustomers(app.customers, form).filter((c) => c.id !== editing?.id);
    if (matches.length > 0 && !force) {
      setSimilar(matches);
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateCustomer(app.service, editing.id, form);
        await addAudit(app.service, app.user, {
          entity: 'customer',
          entityId: editing.id,
          action: 'update',
          summary: `Customer ${form.name.trim()} updated`
        });
        toast('Customer updated', 'success');
      } else {
        const created = await createCustomer(app.service, form);
        await addAudit(app.service, app.user, {
          entity: 'customer',
          entityId: created.id,
          action: 'create',
          summary: `Customer ${created.name} added`
        });
        toast('Customer added', 'success');
      }
      setOpen(false);
      setSimilar([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = async () => {
    const rows = [
      ['Name', 'Mobile', 'Address', 'Email', 'Notes', 'Bills', 'Purchases', 'Pending', 'Added'],
      ...filtered.map((c) => {
        const s = stats.get(c.id);
        return [c.name, c.phone || '', c.address || '', c.email || '', c.notes || '', s?.bills || 0, s?.purchases || 0, s?.pending || 0, c.createdAt.slice(0, 10)];
      })
    ];
    try {
      const target = await downloadText(`kalai-customers-${todayISO()}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv');
      toast(target === 'native' ? 'Customers CSV saved to Downloads/KALAI DIGITAL' : 'Customers CSV downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Customers"
        subtitle="Name is the only required field. Mobile numbers are optional and can be added later."
        eyebrow="RELATIONSHIPS"
        actions={
          <>
            <Button variant="ghost" onClick={exportCsv} disabled={filtered.length === 0}><Download size={16} /> Export CSV</Button>
            <Button onClick={openAdd}><UserPlus size={16} /> Add Customer</Button>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Total customers" value={String(app.customers.length)} icon={<Users size={16} />} tone="brand" hint="All saved customer records" />
        <StatCard label="Lifetime purchases" value={formatINR(totals.purchases)} icon={<IndianRupee size={16} />} tone="green" hint="Across all active bills" />
        <StatCard label="Outstanding" value={formatINR(totals.pending)} icon={<WalletCards size={16} />} tone="red" hint={`${totals.withDue} customer${totals.withDue === 1 ? '' : 's'} with a balance`} />
        <StatCard label="Search results" value={String(filtered.length)} icon={<Search size={16} />} tone="blue" hint="Matching the current search" />
      </div>

      <Card>
        <div className="row" style={{ gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 230 }}><SearchInput value={query} onChange={setQuery} placeholder="Search by name or mobile number…" /></div>
          <select className="select" style={{ width: 190 }} value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'name' | 'pending')}>
            <option value="recent">Newest first</option>
            <option value="name">Name A → Z</option>
            <option value="pending">Highest balance</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={query ? 'No matching customers' : 'No customers yet'}
            text={query ? 'Try a different name or mobile number.' : 'Add a customer, or keep billing as Walk-in Customer — no customer record is needed.'}
            action={<Button size="sm" onClick={openAdd}><UserPlus size={15} /> Add Customer</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl stack-cards">
              <thead>
                <tr><th>Customer</th><th>Mobile</th><th>Added</th><th className="num">Bills</th><th className="num">Purchases</th><th className="num">Pending</th><th className="actions"></th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const s = stats.get(c.id);
                  return (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`/customers/${c.id}`)}>
                      <td data-label="Customer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Avatar name={c.name} src={c.photo} size={30} />
                          <div>
                            <div className="cell-main">{c.name}</div>
                            <div className="cell-sub">{c.address || 'No address'}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Mobile">{c.phone ? <span><Phone size={12} style={{ verticalAlign: -2, marginRight: 4, color: 'var(--text-3)' }} />{c.phone}</span> : <span className="muted">Optional · not added</span>}</td>
                      <td data-label="Added">{formatDate(c.createdAt.slice(0, 10))}</td>
                      <td className="num" data-label="Bills">{s?.bills || 0}</td>
                      <td className="num" data-label="Purchases">{formatINR(s?.purchases || 0)}</td>
                      <td className="num" data-label="Pending" style={{ color: (s?.pending || 0) > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{formatINR(s?.pending || 0)}</td>
                      <td className="actions" data-label="">
                        <button className="icon-btn" title="Edit customer" onClick={(e) => { e.stopPropagation(); openEdit(c); }}><Pencil size={14} /></button>
                        <button className="icon-btn" title="Open customer" style={{ marginLeft: 6 }} onClick={(e) => { e.stopPropagation(); navigate(`/customers/${c.id}`); }}><ArrowRight size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        title={editing ? 'Edit customer' : 'Add customer'}
        subtitle="Only the name is required. Everything else is optional."
        onClose={() => { setOpen(false); setSimilar([]); }}
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save(false)} loading={saving}>{editing ? 'Save changes' : 'Add customer'}</Button>
          </>
        }
      >
        <div className="input-row">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name" maxLength={80} autoFocus /></Field>
          <Field label="Mobile number" hint="Optional"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" inputMode="tel" maxLength={18} /></Field>
        </div>
        <div className="input-row" style={{ marginTop: 10 }}>
          <Field label="Address" hint="Optional"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={180} /></Field>
          <Field label="Email" hint="Optional"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="Notes" hint="Optional — preferences, delivery instructions…">
            <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={300} />
          </Field>
        </div>

        {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}

        {similar.length > 0 ? (
          <div className="section-note note-warn" style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <AlertTriangle size={16} />
              <span>
                A similar customer already exists: <b>{similar.map((s) => `${s.name}${s.phone ? ` (${s.phone})` : ''}`).join(', ')}</b>. Use the existing record, or confirm to save a duplicate.
              </span>
            </div>
            <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={() => { setOpen(false); navigate(`/customers/${similar[0].id}`); }}>Use existing</Button>
              <Button size="sm" variant="gold" onClick={() => void save(true)} loading={saving}>Save anyway</Button>
              <Button size="sm" variant="ghost" onClick={() => setSimilar([])}>Review</Button>
            </div>
          </div>
        ) : null}

        <SectionNote tone="info">Duplicate mobiles are always flagged. Similar names are flagged as a soft warning. The app never blocks a legitimate second customer.</SectionNote>
      </Modal>
    </div>
  );
}
