import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode
} from 'react';
import { CheckCircle2, Loader2, Search, X, AlertTriangle, Info, XCircle } from 'lucide-react';
import type { BillStatus, SyncStatus } from '../lib/types';
import { STATUS_LABEL } from '../lib/format';

/* -------------------------------------------------------------- Button */
export function Button({
  children,
  variant = 'primary',
  size,
  block,
  className = '',
  loading,
  ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger' | 'success' | 'dark';
  size?: 'sm' | 'lg';
  block?: boolean;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`btn btn-${variant}${size ? ` btn-${size}` : ''}${block ? ' btn-block' : ''} ${className}`}
      {...rest}
      disabled={rest.disabled || loading}
    >
      {loading ? <Loader2 size={16} className="spin" /> : null}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Card */
export function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
  padded = true
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <header className="card-title">
          <div>
            <span>{title}</span>
            {subtitle ? <div className="card-sub">{subtitle}</div> : null}
          </div>
          {right ? <div className="card-actions">{right}</div> : null}
        </header>
      )}
      <div className={padded ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------- Spinner */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="center-fill">
      <div className="spinner" />
      {label ? <div className="muted small">{label}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------- EmptyState */
export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="es-icon">{icon}</div>
      <h4>{title}</h4>
      {text ? <p>{text}</p> : null}
      {action ? <div className="es-action">{action}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Badge */
export function StatusBadge({ status }: { status: BillStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'green' | 'red' | 'blue' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/* --------------------------------------------------------------- Modal */
export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width
}: {
  open: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ ConfirmDialog */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  busy,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-message">
        {danger ? <AlertTriangle size={22} className="danger-text" /> : null}
        <div>{message}</div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- Field */
export function Field({ label, hint, error, required, children, className = '' }: { label: ReactNode; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">
        {label} {required ? <em>*</em> : null}
      </span>
      {children}
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="form-error">{error}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || 'Search…'} />
    </div>
  );
}

/* ------------------------------------------------------------ StatCard */
export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
  onClick
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: 'brand' | 'gold' | 'green' | 'red' | 'blue' | 'slate';
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <div className={`stat-card tone-${tone}${onClick ? ' clickable' : ''}`} onClick={onClick}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- SyncPill */
const SYNC_META: Record<SyncStatus, string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Sync error'
};

export function SyncPill({ status, demo, errorMsg }: { status: SyncStatus; demo?: boolean; errorMsg?: string | null }) {
  const cls = demo ? 'demo' : status;
  const title = demo ? 'Demo mode: data stays on this device' : status === 'error' && errorMsg ? errorMsg : undefined;
  return (
    <span className={`sync-pill ${cls}`} title={title}>
      <span className="dot" />
      {demo ? 'Demo' : SYNC_META[status]}
    </span>
  );
}

/* --------------------------------------------------------------- Toast */
interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info' | 'warn';
  message: string;
}
const ToastCtx = createContext<{ toast: (message: string, kind?: ToastItem['kind']) => void }>({ toast: () => undefined });
export function useToast() {
  return useContext(ToastCtx).toast;
}

const TOAST_ICON = {
  success: CheckCircle2,
  error: XCircle,
  warn: AlertTriangle,
  info: Info
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const toast = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.kind];
          return (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              <Icon size={18} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ----------------------------------------------------------- PageHeader */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- misc */
export function Row({ children, gap = 10, className = '', style }: { children: ReactNode; gap?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`row ${className}`} style={{ gap, ...style }}>
      {children}
    </div>
  );
}

export function Avatar({ name, src, size = 38 }: { name: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return (
      <div className="avatar" style={{ width: size, height: size }}>
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}>
      {(name || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('')}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.key} role="tab" aria-selected={value === tab.key} className={`tab${value === tab.key ? ' active' : ''}`} onClick={() => onChange(tab.key)}>
          {tab.label}
          {tab.count != null ? <span className="tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'gold' | 'green' }) {
  return (
    <div className={`progress progress-${tone}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function KeyValue({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`kv${strong ? ' kv-strong' : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function SectionNote({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' | 'success' }) {
  return <div className={`section-note note-${tone}`}>{children}</div>;
}
