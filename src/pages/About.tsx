import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Cloud, Database, Languages, Monitor, Printer, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { APP_NAME, APP_NAME_TA, APP_TAGLINE, APP_TAGLINE_TA } from '../lib/constants';
import { logoSrc } from '../lib/logo';
import { platformLabel } from '../lib/platform';
import { Button, Card, PageHeader, Pill, SectionNote } from '../components/ui';

const FEATURES = [
  'Five products: Frame, Flex, Sunpack, Vinyl and Star',
  'Frame prices entered from the shop rate chart, never invented',
  'Square-feet billing with a configurable 16 sq.ft basis',
  'Minimum charge, rupee rounding, discounts and optional GST',
  'Split payments: Cash, UPI, Bank Transfer and Other',
  'Unique bill numbers with an offline-safe counter',
  'Edit, cancel, reprint and audit every bill',
  'Customer profiles where the mobile number is optional',
  'Payments and expenses with full history',
  'Real reports with PDF and CSV export',
  'A4 invoice printing and 58/80 mm thermal receipts',
  'English and Tamil interface, light and dark themes',
  'Offline saving with automatic cloud sync when online'
];

export function AboutPage() {
  const app = useApp();
  const navigate = useNavigate();
  const mode = app.mode === 'cloud' ? 'Cloud + offline cache' : 'This device only';

  return (
    <div className="page">
      <PageHeader
        title="About KALAI DIGITAL"
        subtitle="Billing and business management built for the print shop."
        eyebrow="PRODUCT INFORMATION"
        actions={<Button onClick={() => navigate('/')}>Back to Dashboard</Button>}
      />

      <Card>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <img src={logoSrc()} alt="KALAI DIGITAL KB logo" style={{ width: 110, height: 110, objectFit: 'contain', flex: 'none' }} />
          <div style={{ minWidth: 240, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.3px' }}>{APP_NAME}</h2>
              <Pill tone="gold">Version {__APP_VERSION__}</Pill>
              <Pill tone="green">Release build</Pill>
            </div>
            <div style={{ fontSize: 16, color: 'var(--brand-600)', fontWeight: 600, marginTop: 2 }}>{APP_NAME_TA}</div>
            <div className="muted" style={{ marginTop: 4 }}>{APP_TAGLINE}</div>
            <div className="muted small" style={{ marginTop: 1 }}>{APP_TAGLINE_TA}</div>
            <div className="row" style={{ gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
              <Pill tone="blue">{platformLabel()}</Pill>
              <Pill>{mode}</Pill>
              <Pill tone={app.online ? 'green' : 'red'}>{app.online ? 'Online' : 'Offline'}</Pill>
            </div>
          </div>
        </div>
        <SectionNote tone="info">
          The supplied circular KB logo is used exactly as provided. It is never redrawn, recoloured or distorted anywhere in the app, the invoice, the APK icon or the Windows installer.
        </SectionNote>
      </Card>

      <div className="grid grid-2">
        <Card title="What it does" subtitle="Everything in this list is implemented in the app.">
          <div className="stack" style={{ gap: 8 }}>
            {FEATURES.map((feature) => (
              <div key={feature} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.8, lineHeight: 1.45 }}>
                <CheckCircle2 size={15} color="var(--green)" style={{ flex: 'none', marginTop: 1 }} />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <Card title="Built for two platforms" subtitle="One codebase, two installable builds.">
            <div className="stack" style={{ gap: 11 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <Smartphone size={18} color="var(--brand-600)" style={{ flex: 'none', marginTop: 1 }} />
                <div>
                  <div style={{ fontWeight: 650 }}>Android</div>
                  <div className="muted small">Capacitor package com.kalaidigital.billing. Bottom navigation, native Google Sign-In and direct PDF saving to Downloads.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Monitor size={18} color="var(--brand-600)" style={{ flex: 'none', marginTop: 1 }} />
                <div>
                  <div style={{ fontWeight: 650 }}>Windows</div>
                  <div className="muted small">Electron desktop app with a start-menu shortcut and the full desktop sidebar layout.</div>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Technology" subtitle="Chosen so the same app runs on both platforms.">
            <div className="kv"><span>Interface</span><b>React 18 + TypeScript + Vite</b></div>
            <div className="kv"><span>Android shell</span><b>Capacitor 6</b></div>
            <div className="kv"><span>Windows shell</span><b>Electron 32</b></div>
            <div className="kv"><span>Cloud</span><b>Firebase Auth + Firestore</b></div>
            <div className="kv"><span>Documents</span><b>jsPDF + jspdf-autotable</b></div>
            <div className="kv"><span>Offline</span><b>Firestore cache / local device store</b></div>
          </Card>
        </div>
      </div>

      <div className="grid grid-3">
        <Card title="Privacy" subtitle="Your business data is yours.">
          <div className="stack" style={{ gap: 9, fontSize: 12.5, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', gap: 8 }}><ShieldCheck size={16} color="var(--green)" style={{ flex: 'none', marginTop: 1 }} /><span>Cloud data is stored under your authenticated Google account. The app does not share it with other accounts.</span></div>
            <div style={{ display: 'flex', gap: 8 }}><Cloud size={16} color="var(--blue)" style={{ flex: 'none', marginTop: 1 }} /><span>Sync happens directly between this app and your Firebase project. No third-party analytics are used.</span></div>
            <div style={{ display: 'flex', gap: 8 }}><WifiOff size={16} color="var(--gold-600)" style={{ flex: 'none', marginTop: 1 }} /><span>Offline bills are saved locally first and uploaded automatically when the connection returns.</span></div>
          </div>
        </Card>

        <Card title="Your data" subtitle="A quick, real inventory.">
          <div className="kv"><span>Bills</span><b>{app.bills.length}</b></div>
          <div className="kv"><span>Customers</span><b>{app.customers.length}</b></div>
          <div className="kv"><span>Payments</span><b>{app.payments.length}</b></div>
          <div className="kv"><span>Expenses</span><b>{app.expenses.length}</b></div>
          <div className="kv"><span>Audit entries</span><b>{app.auditLogs.length}</b></div>
          <div className="muted small" style={{ marginTop: 8 }}>Storage: {app.mode === 'cloud' ? 'users/{account}/apps/kalai in Firestore' : 'Device-local storage'}</div>
        </Card>

        <Card title="Support & care" subtitle="Practical notes.">
          <div className="stack" style={{ gap: 9, fontSize: 12.5, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', gap: 8 }}><Languages size={16} color="var(--brand-600)" style={{ flex: 'none', marginTop: 1 }} /><span>Tamil and English are both available from Settings → Workspace.</span></div>
            <div style={{ display: 'flex', gap: 8 }}><Printer size={16} color="var(--brand-600)" style={{ flex: 'none', marginTop: 1 }} /><span>Printing uses the printer installed on the device. A printer with a Windows/Android print service is required.</span></div>
            <div style={{ display: 'flex', gap: 8 }}><Database size={16} color="var(--brand-600)" style={{ flex: 'none', marginTop: 1 }} /><span>Export a JSON backup from Settings → Backup &amp; Data before major changes.</span></div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div className="muted small">
            {APP_NAME} · {APP_NAME_TA} · version {__APP_VERSION__} · © {new Date().getFullYear()} KALAI DIGITAL
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ghost" onClick={() => navigate('/settings')}>Open settings</Button>
            <Button variant="ghost" onClick={() => navigate('/billing')}>New bill</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
