import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ReceiptText,
  FileText,
  Users,
  SlidersHorizontal,
  Settings,
  Menu as MenuIcon,
  X,
  LogOut,
  WifiOff,
  WalletCards,
  TrendingDown,
  Boxes,
  BarChart3,
  Info
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { Avatar, SyncPill } from './ui';
import { logoSrc } from '../lib/logo';
import { APP_NAME, APP_NAME_TA, APP_TAGLINE } from '../lib/constants';
import { t } from '../lib/i18n';

const NAV = [
  { to: '/', labelKey: 'dashboard', fallback: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/billing', labelKey: 'newBill', fallback: 'New Bill', icon: ReceiptText, end: true },
  { to: '/bills', labelKey: 'billHistory', fallback: 'Bill History', icon: FileText, end: true },
  { to: '/customers', labelKey: 'customers', fallback: 'Customers', icon: Users, end: true },
  { to: '/products', labelKey: 'products', fallback: 'Products & Rates', icon: SlidersHorizontal, end: true },
  { to: '/payments', labelKey: 'payments', fallback: 'Payments', icon: WalletCards, end: true },
  { to: '/expenses', labelKey: 'expenses', fallback: 'Expenses', icon: TrendingDown, end: true },
  { to: '/inventory', labelKey: 'inventory', fallback: 'Inventory', icon: Boxes, end: true },
  { to: '/reports', labelKey: 'reports', fallback: 'Reports', icon: BarChart3, end: true },
  { to: '/settings', labelKey: 'settings', fallback: 'Settings', icon: Settings, end: true }
];

const MOBILE = NAV.slice(0, 4);
const MORE = [...NAV.slice(4), { to: '/about', labelKey: 'about', fallback: 'About', icon: Info, end: true }];

export function Layout({ children }: { children: ReactNode }) {
  const { user, syncStatus, syncError, mode, online, signOut, settings } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const lang = settings.language;
  const label = (item: { labelKey: string; fallback: string }) => t(item.labelKey, lang) === item.labelKey ? item.fallback : t(item.labelKey, lang);

  const navItems = (items: typeof NAV) =>
    items.map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <item.icon size={18} />
        <span>{label(item)}</span>
      </NavLink>
    ));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logoSrc()} alt={`${APP_NAME} logo`} />
          <div>
            <div className="brand-name">{APP_NAME}</div>
            <div className="brand-sub">Billing &amp; Business</div>
            <div className="brand-ta">{APP_NAME_TA}</div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section">Workspace</div>
          {navItems(NAV.slice(0, 4))}
          <div className="nav-section">Management</div>
          {navItems(NAV.slice(4, 9))}
          <div className="nav-section">System</div>
          {navItems(NAV.slice(9))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <SyncPill status={syncStatus} demo={mode === 'local'} errorMsg={syncError} />
            <span style={{ fontSize: 10, color: 'rgba(247,238,230,0.45)' }}>{APP_TAGLINE.split(' · ')[0]}</span>
          </div>
          <div className="user-chip">
            <Avatar name={user?.name || 'User'} src={user?.photoURL} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">{user?.name}</div>
              <div className="user-mail">{mode === 'local' ? 'Demo mode' : user?.email || ''}</div>
            </div>
            <button className="icon-btn" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.16)', color: '#e7d9cc' }} onClick={() => void signOut()} title="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          <img src={logoSrc()} alt="" />
          <div>
            <div className="brand-name">{APP_NAME}</div>
            <div className="brand-sub">{APP_NAME_TA}</div>
          </div>
        </div>
        <div className="topbar-right">
          <SyncPill status={syncStatus} demo={mode === 'local'} errorMsg={syncError} />
          <Avatar name={user?.name || 'User'} src={user?.photoURL} size={30} />
        </div>
      </header>

      <main className="main-area">
        {!online && mode !== 'local' ? (
          <div className="offline-banner">
            <WifiOff size={15} />
            You are offline — bills are saved on this device and sync automatically when the connection returns.
          </div>
        ) : null}
        {children}
      </main>

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {MOBILE.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `bn-item${isActive ? ' active' : ''}`}>
              <item.icon size={21} />
              <span>{label(item)}</span>
            </NavLink>
          ))}
          <button className="bn-item" onClick={() => setMoreOpen(true)}>
            <MenuIcon size={21} />
            <span>{t('more', lang)}</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="modal-backdrop" style={{ alignItems: 'flex-end', padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div className="modal" style={{ maxWidth: 620, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
            <div className="modal-head">
              <div>
                <h3>{t('more', lang)}</h3>
                <div className="modal-sub">{APP_NAME} · {APP_NAME_TA}</div>
              </div>
              <button className="icon-btn" onClick={() => setMoreOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 9 }}>
                {MORE.map((item) => (
                  <button
                    key={item.to}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '12px 13px' }}
                    onClick={() => {
                      setMoreOpen(false);
                      navigate(item.to);
                    }}
                  >
                    <item.icon size={18} />
                    {label(item)}
                  </button>
                ))}
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px 13px', color: 'var(--red)' }} onClick={() => void signOut()}>
                  <LogOut size={18} />
                  {t('logout', lang)}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
