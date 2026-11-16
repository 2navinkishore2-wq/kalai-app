import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button, Modal, SectionNote } from '../components/ui';
import { isAndroid, isElectron, platformLabel } from '../lib/platform';
import {
  DEFAULT_RELEASE_PAGE,
  appVersion,
  checkForUpdates,
  installRelease,
  openExternalUrl,
  type UpdatePlatform,
  type UpdateResult,
  type UpdateStatus
} from '../lib/updates';

interface UpdateApi {
  platform: UpdatePlatform;
  version: string;
  result: UpdateResult;
  installing: boolean;
  installMessage: string;
  /** Runs the check. `manual` opens the result dialog even for "up to date". */
  check: (manual?: boolean) => Promise<UpdateResult>;
  install: () => Promise<void>;
  dismiss: () => void;
}

const UpdateContext = createContext<UpdateApi | null>(null);

export function useUpdates(): UpdateApi {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdates must be used inside UpdateProvider');
  return ctx;
}

function detectPlatform(): UpdatePlatform {
  if (isAndroid()) return 'android';
  if (isElectron()) return 'windows';
  return 'web';
}

const DISMISS_KEY = 'kalai:update-dismissed:v1';

function dismissedVersion(): string {
  try {
    return sessionStorage.getItem(DISMISS_KEY) || '';
  } catch {
    return '';
  }
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const platform = useMemo(detectPlatform, []);
  const version = useMemo(appVersion, []);
  const [result, setResult] = useState<UpdateResult>({ status: 'idle', currentVersion: version });
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const dismissedRef = useRef(dismissedVersion());

  const check = useCallback(async (manual = false) => {
    setResult((prev) => ({ ...prev, status: 'checking', message: undefined }));
    const next = await checkForUpdates({ currentVersion: version });
    setResult(next);
    if (manual) {
      setManualOpen(true);
    } else if (next.status === 'available' && next.release && dismissedRef.current !== next.release.version) {
      setOpen(true);
    }
    return next;
  }, [version]);

  // Automatic check when the workspace opens. It is deferred so sign-in,
  // billing and the dashboard render first, and any failure stays silent.
  // `check` is stable, so this schedules once per mount; the timer is only
  // cleared if the provider really unmounts.
  useEffect(() => {
    const timer = setTimeout(() => { void check(false); }, 2500);
    return () => clearTimeout(timer);
  }, [check]);

  const dismiss = useCallback(() => {
    const current = result.release?.version;
    if (current) {
      dismissedRef.current = current;
      try {
        sessionStorage.setItem(DISMISS_KEY, current);
      } catch {
        /* storage unavailable */
      }
    }
    setOpen(false);
    setManualOpen(false);
  }, [result.release]);

  const install = useCallback(async () => {
    if (!result.release) return;
    // The Windows installer closes the app, so an unsaved bill must be finished
    // first. Android keeps the app open behind the browser, so nothing is lost.
    if (platform === 'windows' && typeof window !== 'undefined' && window.__kalaiUnsavedBill) {
      setInstallMessage(
        'Finish the bill you are editing first: tap Save bill (or Reset) on the New Bill screen, then choose Install update again. Nothing has been changed yet.'
      );
      return;
    }
    setInstalling(true);
    setInstallMessage('');
    try {
      const outcome = await installRelease(result.release, platform);
      if (outcome.status === 'started') {
        setInstallMessage('The installer is downloading and will start next. The app closes so it can be replaced — your saved bills are already stored.');
      } else if (outcome.status === 'opened') {
        setInstallMessage(
          platform === 'android'
            ? 'The APK download opened in your browser. When it finishes, tap the download notification and confirm Install. Saved bills and your account stay intact.'
            : `The download opened in your browser. Run the installer when it finishes, then reopen ${'KALAI DIGITAL'}.`
        );
      } else {
        setInstallMessage(outcome.message || 'This update cannot be installed automatically. Use the release page.');
      }
    } catch (error) {
      setInstallMessage((error as Error).message || 'The update could not be started.');
    } finally {
      setInstalling(false);
    }
  }, [platform, result.release]);

  const status: UpdateStatus = result.status;

  const api = useMemo<UpdateApi>(() => ({
    platform,
    version,
    result,
    installing,
    installMessage,
    check,
    install,
    dismiss
  }), [platform, version, result, installing, installMessage, check, install, dismiss]);

  const release = result.release;
  const notes = release?.notes?.trim();

  return (
    <UpdateContext.Provider value={api}>
      {children}

      <Modal
        open={open && !!release}
        title={<span>Update available / <span lang="ta">புதிய அப்டேட் கிடைக்கிறது</span></span>}
        subtitle={release ? `KALAI DIGITAL ${release.version} · installed ${version} · ${platformLabel()}` : undefined}
        onClose={dismiss}
        width={560}
        footer={
          <>
            <Button variant="ghost" onClick={dismiss} disabled={installing}>Later / <span lang="ta">பிறகு</span></Button>
            <Button onClick={() => void install()} loading={installing}>
              <Download size={16} /> Install update / <span lang="ta">புதுப்பிப்பை நிறுவு</span>
            </Button>
          </>
        }
      >
        {notes ? (
          <div style={{ whiteSpace: 'pre-line', fontSize: 12.8, lineHeight: 1.55, marginBottom: 10 }}>{notes}</div>
        ) : (
          <div className="muted small" style={{ marginBottom: 10 }}>A newer version is ready with layout and billing fixes.</div>
        )}
        {release?.notesTa ? (
          <div style={{ whiteSpace: 'pre-line', fontSize: 12.5, lineHeight: 1.55, marginBottom: 10 }} lang="ta">{release.notesTa}</div>
        ) : null}
        {installMessage ? <SectionNote tone="info">{installMessage}</SectionNote> : null}
        <SectionNote tone="info">
          Saved bills, customers and settings are kept and stay readable after the update. If the New Bill screen
          is open with unsaved items, save or reset it first — the Windows installer closes the app.
          {' '}
          <a
            href={release?.pageUrl || DEFAULT_RELEASE_PAGE}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--brand-600)', fontWeight: 600 }}
            onClick={(e) => { e.preventDefault(); openExternalUrl(release?.pageUrl || DEFAULT_RELEASE_PAGE); }}
          >
            Release page
          </a>
        </SectionNote>
      </Modal>

      <Modal
        open={manualOpen}
        title={<span>Check for Updates / <span lang="ta">அப்டேட் பார்க்கவும்</span></span>}
        subtitle={`Installed ${version} · ${platformLabel()}`}
        onClose={dismiss}
        width={520}
        footer={<Button variant="ghost" onClick={dismiss}>Close</Button>}
      >
        <UpdateStatusMessage result={result} onRetry={() => void check(true)} />
        {status === 'available' && release ? (
          <div style={{ marginTop: 12 }}>
            <Button onClick={() => void install()} loading={installing} block>
              <Download size={16} /> Install update / <span lang="ta">புதுப்பிப்பை நிறுவு</span>
            </Button>
            {installMessage ? <SectionNote tone="info">{installMessage}</SectionNote> : null}
          </div>
        ) : null}
      </Modal>
    </UpdateContext.Provider>
  );
}

export function UpdateStatusMessage({ result, onRetry }: { result: UpdateResult; onRetry: () => void }) {
  if (result.status === 'checking') {
    return (
      <div className="row" style={{ gap: 9, alignItems: 'center' }}>
        <RefreshCw size={16} className="spin" />
        <span>Checking the release feed…</span>
      </div>
    );
  }
  if (result.status === 'available' && result.release) {
    return (
      <SectionNote tone="success">
        <b>Update available / <span lang="ta">புதிய அப்டேட் கிடைக்கிறது</span></b>
        <div style={{ marginTop: 4 }}>Version {result.release.version} is newer than the installed {result.currentVersion}.</div>
      </SectionNote>
    );
  }
  if (result.status === 'current') {
    return (
      <SectionNote tone="success">
        <ShieldCheck size={15} style={{ verticalAlign: -3, marginRight: 5 }} />
        You are on the latest version ({result.currentVersion}).
      </SectionNote>
    );
  }
  if (result.status === 'offline') {
    return (
      <SectionNote tone="warn">
        Offline — the update check needs an internet connection. Billing keeps working, and you can retry later.
        <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button></div>
      </SectionNote>
    );
  }
  if (result.status === 'error') {
    return (
      <SectionNote tone="danger">
        {result.message || 'The update check failed.'}
        <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button></div>
      </SectionNote>
    );
  }
  return (
    <SectionNote tone="info">
      Updates are checked automatically when the app opens. You can also check now.
      <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw size={14} /> Check for Updates / <span lang="ta">அப்டேட் பார்க்கவும்</span></Button></div>
    </SectionNote>
  );
}
