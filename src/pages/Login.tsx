import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Button, Field, Input } from '../components/ui';
import { logoSrc } from '../lib/logo';
import { APP_NAME, APP_NAME_TA, APP_TAGLINE } from '../lib/constants';

export function Splash({ label = 'Opening KALAI DIGITAL…' }: { label?: string }) {
  return (
    <div className="splash">
      <img src={logoSrc()} alt="KALAI DIGITAL KB logo" />
      <div style={{ textAlign: 'center' }}>
        <h1>{APP_NAME}</h1>
        <p>{APP_NAME_TA}</p>
        <div className="gold-line" style={{ margin: '10px auto 0' }} />
      </div>
      <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#e0b94e' }} />
      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>{label}</div>
    </div>
  );
}

export function LoginPage() {
  const { signInGoogle, signInDemo, configured, mode } = useApp();
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoName, setDemoName] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  const google = async () => {
    setError('');
    setBusy(true);
    try {
      await signInGoogle();
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (/cancel/i.test(msg)) setError('Sign-in was cancelled.');
      else if (/unauthorized-domain/i.test(msg)) setError('This domain is not authorised in Firebase Authentication → Settings → Authorized domains.');
      else if (/configuration-not-found|operation-not-allowed/i.test(msg)) setError('Google sign-in is not enabled in this Firebase project.');
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setError('');
    setDemoBusy(true);
    try {
      await signInDemo(demoName || 'Demo User');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src={logoSrc()} alt="KALAI DIGITAL KB logo" />
        <div className="auth-name">{APP_NAME}</div>
        <div className="auth-ta">{APP_NAME_TA}</div>
        <div className="auth-tag">{APP_TAGLINE}</div>

        <div style={{ marginTop: 24 }}>
          <Button block size="lg" onClick={() => void google()} loading={busy}>
            <GoogleMark /> Continue with Google
          </Button>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
            Business data is private to the authorised Google account.
          </div>
        </div>

        {error ? (
          <div className="section-note note-danger" style={{ marginTop: 14, textAlign: 'left' }}>
            {error}
          </div>
        ) : null}

        <div className="auth-divider">or</div>

        {!showDemo ? (
          <Button block variant="ghost" onClick={() => setShowDemo(true)} disabled={busy}>
            Use this device without an account
          </Button>
        ) : (
          <div style={{ textAlign: 'left' }}>
            <Field label="Device display name" hint="Demo data stays on this device only. Cloud sync and Google login are not used.">
              <Input value={demoName} onChange={(e) => setDemoName(e.target.value)} placeholder="e.g. Kalai Digital Shop" maxLength={50} />
            </Field>
            <Button block variant="gold" style={{ marginTop: 10 }} onClick={() => void demo()} loading={demoBusy}>
              Open Demo Workspace
            </Button>
          </div>
        )}

        {!configured || mode === 'none' ? (
          <div className="setup-list">
            <b>Cloud setup is not configured in this build.</b>
            <div style={{ marginTop: 5 }}>
              Add the Firebase keys to <code>.env</code> and rebuild. Demo mode still supports billing, customers, reports, PDF invoices and local saving.
            </div>
          </div>
        ) : null}

        <div className="auth-foot">
          KALAI DIGITAL · {APP_NAME_TA}
          <br />
          Printing · Flex · Sunpack · Vinyl · Star · Photo Frame
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2 1.9-4.7 3-7.6 3-5.3 0-9.7-3.4-11.3-8L6.2 33C9.5 39.5 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5C41.5 35.6 44 30.2 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
