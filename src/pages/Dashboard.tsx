import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  IndianRupee,
  ReceiptText,
  Banknote,
  Smartphone,
  CreditCard,
  Users,
  TrendingUp,
  AlertCircle,
  Plus,
  UserPlus,
  FileText,
  SlidersHorizontal,
  WalletCards,
  BarChart3,
  ArrowRight,
  Clock3
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { formatINR, formatDate, formatLongDate, formatTime, todayISO } from '../lib/format';
import { dashboardStats, dailySales, weeklySales, monthlySales } from '../services/analytics';
import { Avatar, Card, EmptyState, PageHeader, StatCard, StatusBadge, Tabs, Button } from '../components/ui';
import { AreaChart, BarChart } from '../components/charts';
import { logoSrc } from '../lib/logo';
import { APP_NAME_TA } from '../lib/constants';
import { t } from '../lib/i18n';

type TrendTab = 'daily' | 'weekly' | 'monthly';

export function DashboardPage() {
  const app = useApp();
  const navigate = useNavigate();
  const lang = app.settings.language;
  const [trend, setTrend] = useState<TrendTab>('daily');
  const [now, setNow] = useState(new Date());
  const today = todayISO(now);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(
    () => dashboardStats(app.bills, app.customers, app.payments, today),
    [app.bills, app.customers, app.payments, today]
  );

  const daily = useMemo(() => dailySales(app.bills, today, 14), [app.bills, today]);
  const weekly = useMemo(() => weeklySales(app.bills, today, 8), [app.bills, today]);
  const monthly = useMemo(() => monthlySales(app.bills, today, 6), [app.bills, today]);

  const trendData = trend === 'daily' ? daily : trend === 'weekly' ? weekly : monthly;

  return (
    <div className="page">
      <PageHeader
        eyebrow={formatLongDate(now, lang)}
        title={t('dashboard', lang)}
        subtitle={`${app.settings.nameEn} · ${app.settings.nameTa}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/reports')}>
              <BarChart3 size={16} /> {t('reports', lang)}
            </Button>
            <Button onClick={() => navigate('/billing')}>
              <Plus size={17} /> {t('newBill', lang)}
            </Button>
          </>
        }
      />

      <section className="hero-welcome">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <img className="hero-logo" src={logoSrc()} alt="KALAI DIGITAL logo" />
          <div>
            <h2>{welcome(app.user?.name)}</h2>
            <p>{app.settings.nameEn} · {app.settings.nameTa}</p>
            <div className="hero-ta">{APP_NAME_TA} — அச்சு &amp; டிஜிட்டல் சேவைகள்</div>
          </div>
        </div>
        <div className="hero-date">
          <b>{formatTime(now)}</b>
          {formatLongDate(now, lang)}
          <div style={{ marginTop: 5 }}>{today}</div>
        </div>
      </section>

      <div className="grid grid-stats" style={{ marginBottom: 14 }}>
        <StatCard label={t('todaysSales', lang)} value={formatINR(stats.todaySales)} icon={<IndianRupee size={16} />} tone="brand" hint={`${stats.todayBills} bill${stats.todayBills === 1 ? '' : 's'} today`} onClick={() => navigate('/bills')} />
        <StatCard label={t('billsToday', lang)} value={String(stats.todayBills)} icon={<ReceiptText size={16} />} tone="blue" hint="Saved invoices" onClick={() => navigate('/bills')} />
        <StatCard label={t('cashToday', lang)} value={formatINR(stats.cashToday)} icon={<Banknote size={16} />} tone="green" hint="Cash collections" onClick={() => navigate('/payments')} />
        <StatCard label={t('upiToday', lang)} value={formatINR(stats.upiToday)} icon={<Smartphone size={16} />} tone="gold" hint="UPI collections" onClick={() => navigate('/payments')} />
        <StatCard label={t('creditPending', lang)} value={formatINR(stats.pending)} icon={<CreditCard size={16} />} tone="red" hint="Today's unpaid balance" onClick={() => navigate('/bills')} />
        <StatCard label={t('totalCustomers', lang)} value={String(stats.customers)} icon={<Users size={16} />} tone="slate" hint="All customers" onClick={() => navigate('/customers')} />
        <StatCard label={t('monthSales', lang)} value={formatINR(stats.monthSales)} icon={<TrendingUp size={16} />} tone="green" hint="Current month" onClick={() => navigate('/reports')} />
        <StatCard label={t('outstanding', lang)} value={formatINR(stats.outstanding)} icon={<AlertCircle size={16} />} tone="red" hint="All unpaid balances" onClick={() => navigate('/reports')} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.55fr) minmax(280px,0.85fr)', alignItems: 'start' }}>
        <Card
          title="Sales trend"
          subtitle={trend === 'daily' ? 'Last 14 days' : trend === 'weekly' ? 'Last 8 weeks' : 'Last 6 months'}
          right={<Tabs<TrendTab> tabs={[{ key: 'daily', label: 'Daily' }, { key: 'weekly', label: 'Weekly' }, { key: 'monthly', label: 'Monthly' }]} value={trend} onChange={setTrend} />}
        >
          <div style={{ marginTop: -8 }}>
            {trend === 'daily' ? <AreaChart data={trendData} /> : <BarChart data={trendData} tone={trend === 'weekly' ? 'brand' : 'gold'} />}
          </div>
          <div className="stat-strip" style={{ marginTop: 6 }}>
            <span><b>{formatINR(trendData.reduce((a, b) => a + b.value, 0))}</b> in period</span>
            <span><b>{trendData.reduce((a, b) => a + b.bills, 0)}</b> bills</span>
            <span><b>{formatINR(trendData[trendData.length - 1]?.value || 0)}</b> latest</span>
          </div>
        </Card>

        <Card title={t('quickActions', lang)} subtitle="Everything you need, one tap away">
          <div className="quick-grid">
            <QuickAction icon={<Plus size={17} />} label={t('newBill', lang)} onClick={() => navigate('/billing')} />
            <QuickAction icon={<UserPlus size={17} />} label={t('addCustomer', lang)} onClick={() => navigate('/customers?new=1')} />
            <QuickAction icon={<FileText size={17} />} label={t('billHistory', lang)} onClick={() => navigate('/bills')} />
            <QuickAction icon={<SlidersHorizontal size={17} />} label={t('products', lang)} onClick={() => navigate('/products')} />
            <QuickAction icon={<WalletCards size={17} />} label={t('payments', lang)} onClick={() => navigate('/payments')} />
            <QuickAction icon={<BarChart3 size={17} />} label={t('reports', lang)} onClick={() => navigate('/reports')} />
          </div>
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Card
          title={t('recentBills', lang)}
          right={<Link to="/bills" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>View all <ArrowRight size={13} /></Link>}
          padded={false}
        >
          {stats.recentBills.length === 0 ? (
            <EmptyState icon={<ReceiptText size={22} />} title="No bills yet" text="Create your first bill — it appears here instantly." action={<Button size="sm" onClick={() => navigate('/billing')}><Plus size={15} /> New Bill</Button>} />
          ) : (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="tbl stack-cards">
                <thead>
                  <tr><th>Bill</th><th>Customer</th><th className="num">Total</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {stats.recentBills.map((b) => (
                    <tr key={b.id} className="clickable" onClick={() => navigate(`/bills/${b.id}`)}>
                      <td data-label="Bill"><div className="cell-main">{b.number}</div><div className="cell-sub">{formatDate(b.date)}</div></td>
                      <td data-label="Customer">{b.customer.name}</td>
                      <td className="num" data-label="Total"><b>{formatINR(b.total)}</b></td>
                      <td data-label="Status"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={t('recentCustomers', lang)}
          right={<Link to="/customers" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>View all <ArrowRight size={13} /></Link>}
        >
          {stats.recentCustomers.length === 0 ? (
            <EmptyState icon={<Users size={22} />} title="No customers yet" text="Add a customer or bill as Walk-in Customer." action={<Button size="sm" onClick={() => navigate('/customers?new=1')}><UserPlus size={15} /> Add Customer</Button>} />
          ) : (
            <div>
              {stats.recentCustomers.map((c) => (
                <Link key={c.id} to={`/customers/${c.id}`} className="list-row">
                  <Avatar name={c.name} src={c.photo} />
                  <div className="grow">
                    <div className="truncate" style={{ fontWeight: 650 }}>{c.name}</div>
                    <div className="cell-sub">{c.phone || 'No mobile number'}</div>
                  </div>
                  <ArrowRight size={15} color="var(--text-3)" />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={t('recentPayments', lang)} right={<Link to="/payments" style={{ fontSize: 12.5 }}>All payments</Link>} padded={false} className="desktop-only">
        {stats.recentPayments.length === 0 ? (
          <EmptyState icon={<WalletCards size={22} />} title="No payments recorded" text="Record a payment from a bill or the Payments screen." />
        ) : (
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Customer</th><th>Bill</th><th>Method</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {stats.recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td><Clock3 size={13} style={{ verticalAlign: -2, marginRight: 5, color: 'var(--text-3)' }} />{formatDate(p.date)}</td>
                    <td>{p.customerName}</td>
                    <td>{p.billNumber || '—'}</td>
                    <td><span className="pill">{p.method}</span></td>
                    <td className="num"><b>{formatINR(p.amount)}</b></td>
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

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span className="qa-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function welcome(name?: string | null): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${part}${name ? `, ${name.split(' ')[0]}` : ''}`;
}
