import type { AuthUser, SyncStatus } from '../lib/types';
import { formatBillNumber, parseBillSequence } from '../lib/invoiceNumber';
import type { DataService, NumberOptions, QuerySpec } from './data';

interface StoreShape {
  collections: Record<string, Record<string, Record<string, unknown>>>;
}

const STORE_KEY = 'kalai:local:v1';
const AUTH_KEY = 'kalai:auth:demo';

function loadStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as StoreShape;
  } catch {
    /* corrupted storage — start fresh */
  }
  return { collections: {} };
}

function saveStore(store: StoreShape) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable (private mode / quota) — keep in memory.
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function matches(doc: Record<string, unknown>, where?: QuerySpec['where']): boolean {
  if (!where) return true;
  for (const w of where) {
    const a = doc[w.field] as number | string;
    const b = w.value as number | string;
    switch (w.op) {
      case '==':
        if (a !== b) return false;
        break;
      case '>':
        if (!(a > b)) return false;
        break;
      case '>=':
        if (!(a >= b)) return false;
        break;
      case '<':
        if (!(a < b)) return false;
        break;
      case '<=':
        if (!(a <= b)) return false;
        break;
    }
  }
  return true;
}

function sortBy(field: string, dir: 'asc' | 'desc') {
  return (x: { id: string }, y: { id: string }) => {
    const a = (x as unknown as Record<string, unknown>)[field];
    const b = (y as unknown as Record<string, unknown>)[field];
    if (a === b) return x.id < y.id ? -1 : 1;
    const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1;
    return dir === 'asc' ? cmp : -cmp;
  };
}

function genId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/** Device-local backend used for Demo mode and as a no-cloud fallback. */
export class LocalDataService implements DataService {
  readonly kind = 'local' as const;
  readonly isCloud = false;
  basePath = 'local';
  private store: StoreShape;
  private authListeners = new Set<(u: AuthUser | null) => void>();
  private connectivityListeners = new Set<(online: boolean) => void>();
  private syncListeners = new Set<(s: SyncStatus) => void>();
  private watchers = new Map<string, Set<() => void>>();
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor() {
    this.store = loadStore();
    if (typeof window !== 'undefined') {
      const update = () => {
        this.online = navigator.onLine;
        this.connectivityListeners.forEach((cb) => cb(this.online));
      };
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
    }
  }

  private col(name: string): Record<string, Record<string, unknown>> {
    if (!this.store.collections[name]) this.store.collections[name] = {};
    return this.store.collections[name];
  }

  private persist() {
    saveStore(this.store);
    this.watchers.forEach((cbs) => cbs.forEach((cb) => cb()));
  }

  async signInWithGoogle(): Promise<AuthUser> {
    throw new Error('Google sign-in requires the cloud configuration. Use Demo mode instead.');
  }

  async signInDemo(name: string): Promise<AuthUser> {
    const user: AuthUser = {
      uid: 'demo-user',
      name: name.trim() || 'Demo User',
      email: null,
      photoURL: null,
      isDemo: true
    };
    this.store = loadStore();
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    } catch {
      /* storage unavailable */
    }
    this.authListeners.forEach((cb) => cb(user));
    return user;
  }

  async signOut(): Promise<void> {
    this.store = { collections: {} };
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    this.authListeners.forEach((cb) => cb(null));
  }

  async clearLocalData(): Promise<void> {
    this.store = { collections: {} };
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
  }

  getAuthUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) return JSON.parse(raw) as AuthUser;
    } catch {
      /* ignore */
    }
    return null;
  }

  onAuthChange(cb: (u: AuthUser | null) => void): () => void {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  async get<T extends { id: string }>(name: string, id: string): Promise<T | null> {
    const doc = this.col(name)[id];
    return doc ? ({ id, ...doc } as T) : null;
  }

  async set(name: string, id: string, data: Record<string, unknown>): Promise<void> {
    const existing = this.col(name)[id] || {};
    this.col(name)[id] = { ...existing, ...data, createdAt: (existing.createdAt as string) || nowIso(), updatedAt: nowIso() };
    this.persist();
  }

  async add(name: string, data: Record<string, unknown>): Promise<string> {
    const id = genId();
    this.col(name)[id] = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
    this.persist();
    return id;
  }

  async delete(name: string, id: string): Promise<void> {
    delete this.col(name)[id];
    this.persist();
  }

  async query<T extends { id: string }>(name: string, spec?: QuerySpec): Promise<T[]> {
    const items = Object.entries(this.col(name)).map(([id, data]) => ({ id, ...data }));
    const filtered = items.filter((d) => matches(d, spec?.where));
    if (spec?.orderBy) filtered.sort(sortBy(spec.orderBy.field, spec.orderBy.dir));
    if (spec?.limit) return filtered.slice(0, spec.limit) as T[];
    return filtered as T[];
  }

  watch<T extends { id: string }>(name: string, spec: QuerySpec | undefined, cb: (items: T[]) => void): () => void {
    const fire = () => void this.query<T>(name, spec).then(cb);
    fire();
    if (!this.watchers.has(name)) this.watchers.set(name, new Set());
    this.watchers.get(name)!.add(fire);
    return () => this.watchers.get(name)?.delete(fire);
  }

  async nextInvoiceNumber(opts: NumberOptions): Promise<string> {
    const all = await this.query<{ id: string; number: string }>('bills');
    let max = 0;
    for (const bill of all) max = Math.max(max, parseBillSequence(bill.number));
    return formatBillNumber(opts.pattern, opts.prefix, Math.max(max + 1, opts.start), opts.date);
  }

  isOnline(): boolean {
    return this.online;
  }

  onConnectivityChange(cb: (online: boolean) => void): () => void {
    this.connectivityListeners.add(cb);
    return () => this.connectivityListeners.delete(cb);
  }

  getSyncStatus(): SyncStatus {
    return this.online ? 'synced' : 'offline';
  }

  onSyncStatusChange(cb: (s: SyncStatus) => void): () => void {
    this.syncListeners.add(cb);
    cb(this.getSyncStatus());
    return () => this.syncListeners.delete(cb);
  }

  getLastSyncError(): string | null {
    return null;
  }

  onSyncErrorChange(_cb: (message: string | null) => void): () => void {
    return () => undefined;
  }
}
