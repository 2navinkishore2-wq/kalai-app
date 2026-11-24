import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AuditLog,
  AuthUser,
  Bill,
  BusinessSettings,
  Customer,
  Expense,
  FrameSize,
  InventoryItem,
  Payment,
  ProductConfig,
  StockTxn,
  SyncStatus
} from '../lib/types';
import type { DataService } from '../services/data';
import { createService, type DataMode, type ServiceBundle } from '../services/index';
import { LocalDataService } from '../services/localService';
import { normalizeSettings, seedWorkspace } from '../services/seed';
import { DEFAULT_SETTINGS, FRAME_PRICE_SEED, frameSeedId } from '../lib/constants';
import { buildProductList } from '../lib/products';
import { clearShutdownFlush, registerShutdownFlush } from '../lib/appShutdown';

/** Why the New Bill product list looks the way it does. */
export type ProductConfigState = 'loading' | 'ready' | 'defaults' | 'error';

interface AppStore {
  service: DataService;
  mode: DataMode;
  configured: boolean;
  user: AuthUser | null;
  authLoading: boolean;
  ready: boolean;
  seeding: boolean;
  accessDenied: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  online: boolean;
  customers: Customer[];
  bills: Bill[];
  payments: Payment[];
  expenses: Expense[];
  inventory: InventoryItem[];
  stockTxns: StockTxn[];
  auditLogs: AuditLog[];
  products: ProductConfig[];
  productConfigState: ProductConfigState;
  frames: FrameSize[];
  settings: BusinessSettings;
  signInGoogle: () => Promise<void>;
  signInDemo: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  isOwner: boolean;
  reload: () => void;
}

const Ctx = createContext<AppStore | null>(null);

export function useApp(): AppStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

const cloudBundle: ServiceBundle = createService();

function useLive<T extends { id: string }>(svc: DataService, name: string): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    if (!svc.basePath) {
      setItems([]);
      return;
    }
    return svc.watch<T>(name, undefined, setItems);
  }, [svc, name, svc.basePath]);
  return items;
}

function fallbackFrames(): FrameSize[] {
  const now = new Date(0).toISOString();
  return FRAME_PRICE_SEED.map((f, i) => ({
    id: frameSeedId(f.width, f.height),
    width: f.width,
    height: f.height,
    label: `${f.width}×${f.height}`,
    price: f.price,
    active: true,
    sortOrder: i,
    createdAt: now,
    updatedAt: now
  }));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<DataService>(cloudBundle.service);
  const [mode, setMode] = useState<DataMode>(cloudBundle.mode);
  const [configured] = useState<boolean>(cloudBundle.configured);
  const [user, setUser] = useState<AuthUser | null>(cloudBundle.service.getAuthUser());
  const [authLoading, setAuthLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(service.getSyncStatus());
  const [syncError, setSyncError] = useState<string | null>(service.getLastSyncError());
  const [online, setOnline] = useState(service.isOnline());
  const seededRef = useRef<string>('');
  const reconciledRef = useRef(false);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  useEffect(() => {
    const off = service.onAuthChange((u) => {
      setUser(u);
      setAuthLoading(false);
    });
    if (service.kind === 'local') setAuthLoading(false);
    const offSync = service.onSyncStatusChange(setSyncStatus);
    const offSyncErr = service.onSyncErrorChange(setSyncError);
    const offConn = service.onConnectivityChange(setOnline);
    return () => {
      off();
      offSync();
      offSyncErr();
      offConn();
    };
  }, [service]);

  const customers = useLive<Customer>(service, 'customers');
  const bills = useLive<Bill>(service, 'bills');
  const payments = useLive<Payment>(service, 'payments');
  const expenses = useLive<Expense>(service, 'expenses');
  const inventory = useLive<InventoryItem>(service, 'inventory');
  const stockTxns = useLive<StockTxn>(service, 'stockTxns');
  const auditLogs = useLive<AuditLog>(service, 'auditLogs');
  const productDocs = useLive<ProductConfig>(service, 'productConfigs');
  const frameDocs = useLive<FrameSize>(service, 'frameSizes');
  const settingsDocs = useLive<{ id: string } & Record<string, unknown>>(service, 'settings');

  // Always five complete products. A partial/legacy Firestore document can no
  // longer blank out a product's key (which made New Bill show "Flex (off)").
  const products = useMemo(() => buildProductList(productDocs), [productDocs]);

  const productConfigState = useMemo<ProductConfigState>(() => {
    if (productDocs.length > 0) return 'ready';
    if (seeding || authLoading) return 'loading';
    if (syncStatus === 'error' || syncError) return 'error';
    return 'defaults';
  }, [productDocs.length, seeding, authLoading, syncStatus, syncError]);

  const frames = useMemo(() => {
    const list = frameDocs.length > 0 ? frameDocs : fallbackFrames();
    return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.width * a.height - b.width * b.height);
  }, [frameDocs]);

  const settings = useMemo(
    () => normalizeSettings(settingsDocs.find((d) => d.id === 'business') as unknown as Partial<BusinessSettings>),
    [settingsDocs]
  );

  // First-run seed after authentication (idempotent, per account).
  useEffect(() => {
    if (!user || !service.basePath) return;
    const key = `${service.kind}:${service.basePath}`;
    if (seededRef.current === key) return;
    seededRef.current = key;
    setSeeding(true);
    seedWorkspace(service, user.email)
      .catch(() => undefined)
      .finally(() => setSeeding(false));
  }, [user, service, service.basePath]);

  // Before the Windows app closes for an update it asks the data service to
  // settle its local write queue. Firestore keeps anything still queued in
  // IndexedDB and replays it on the next launch, so this only shortens the gap.
  useEffect(() => {
    const flush = () =>
      service.waitForPendingWrites
        ? service.waitForPendingWrites(3000)
        : Promise.resolve({ pending: 0, timedOut: false });
    registerShutdownFlush(flush);
    return () => clearShutdownFlush(flush);
  }, [service]);

  // Device-level access gate (the owner manages who may open this device app).
  useEffect(() => {
    if (!user) {
      setAccessDenied(null);
      return;
    }
    // Access settings are per account; evaluate once settings are loaded.
    if (!settingsDocs.some((d) => d.id === 'business')) return;
    const a = settings.access;
    if (!a?.requireAllowlist || user.isDemo) {
      setAccessDenied(null);
      return;
    }
    const email = (user.email || '').toLowerCase();
    const allowed = [a.ownerEmail, ...(a.allowedEmails || [])].filter(Boolean).map((e) => e.toLowerCase());
    setAccessDenied(allowed.length > 0 && !allowed.includes(email) ? `This Google account (${user.email}) is not authorised on this device. Ask the owner to add it in Settings → Account.` : null);
  }, [user, settings, settingsDocs]);

  // Repair duplicate bill numbers once per session (online safety net).
  useEffect(() => {
    if (!user || reconciledRef.current || service.kind !== 'firestore' || !service.isOnline() || bills.length === 0) return;
    reconciledRef.current = true;
    const timeout = setTimeout(() => {
      service
        .reconcileInvoiceNumbers?.({ prefix: settings.invoicePrefix, pattern: settings.invoiceFormat }, bills.map((b) => ({ id: b.id, number: b.number, createdAt: b.createdAt })))
        .catch(() => undefined);
    }, 4500);
    return () => clearTimeout(timeout);
  }, [user, bills.length, service, settings.invoicePrefix, settings.invoiceFormat]);

  const applyTheme = useCallback((s: BusinessSettings) => {
    const root = document.documentElement;
    root.dataset.theme = s.theme;
    root.lang = s.language;
  }, []);

  useEffect(() => applyTheme(settings), [settings, applyTheme]);

  const signInGoogle = useCallback(async () => {
    if (service.kind === 'firestore') {
      await service.signInWithGoogle();
      return;
    }
    const cloud = cloudBundle.service;
    setService(cloud);
    setMode(cloudBundle.mode);
    const u = cloud.getAuthUser() ?? (await cloud.signInWithGoogle());
    setUser(u);
    setAuthLoading(false);
  }, [service]);

  const signInDemo = useCallback(
    async (name: string) => {
      if (service.kind === 'local') {
        await service.signInDemo(name);
        return;
      }
      const local = new LocalDataService();
      const u = await local.signInDemo(name);
      setService(local);
      setMode('local');
      setUser(u);
      setAuthLoading(false);
    },
    [service]
  );

  const signOut = useCallback(async () => {
    await service.signOut();
  }, [service]);

  const reload = useCallback(() => window.location.reload(), []);

  const isOwner = useMemo(() => {
    if (!user) return false;
    if (user.isDemo) return true;
    const email = (user.email || '').toLowerCase();
    if (!settings.access.ownerEmail) return true;
    return email === settings.access.ownerEmail.toLowerCase();
  }, [user, settings.access.ownerEmail]);

  const store = useMemo<AppStore>(
    () => ({
      service,
      mode,
      configured,
      user,
      authLoading,
      ready: !!user && service.basePath !== '',
      seeding,
      accessDenied,
      syncStatus,
      syncError,
      online,
      customers,
      bills,
      payments,
      expenses,
      inventory,
      stockTxns,
      auditLogs,
      products,
      productConfigState,
      frames,
      settings: settings.id ? settings : { ...DEFAULT_SETTINGS },
      signInGoogle,
      signInDemo,
      signOut,
      isOwner,
      reload
    }),
    [
      service,
      mode,
      configured,
      user,
      authLoading,
      seeding,
      accessDenied,
      syncStatus,
      syncError,
      online,
      customers,
      bills,
      payments,
      expenses,
      inventory,
      stockTxns,
      auditLogs,
      products,
      productConfigState,
      frames,
      settings,
      signInGoogle,
      signInDemo,
      signOut,
      isOwner,
      reload
    ]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
