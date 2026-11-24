import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  onAuthStateChanged,
  signOut as fbSignOut,
  connectAuthEmulator,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query as fq,
  where,
  orderBy,
  limit as fLimit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  onSnapshotsInSync,
  terminate,
  writeBatch,
  type Firestore,
  type Query,
  type QueryConstraint,
  type DocumentReference
} from 'firebase/firestore';
import type { AuthUser, SyncStatus } from '../lib/types';
import { formatBillNumber, parseBillSequence } from '../lib/invoiceNumber';
import type { DataService, QuerySpec } from './data';
import { isNative } from '../lib/platform';
import { signInWithNativeGoogle, signOutNativeGoogle, isNativeGoogleConfigured } from '../lib/nativeGoogle';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface EmulatorConfig {
  authHost: string;
  authPort: number;
  firestoreHost: string;
  firestorePort: number;
}

export interface FirestoreServiceOptions {
  appName?: string;
  emulator?: EmulatorConfig;
}

/**
 * App-specific namespace below the signed-in user's document.
 *
 * Firestore paths alternate collection/document, so a data root must be a
 * DOCUMENT path (an even number of segments) before collections can be hung
 * off it. The account document is `users/{uid}`; this namespace adds the two
 * segments `apps/kalai`, giving:
 *
 *   users/{uid}/apps/kalai/{collection}/{doc}
 *
 * The previous `users/{uid}/kalai/{collection}` form had four segments and
 * therefore could not be passed to `collection()` — it is a document path,
 * not a collection path, which is what caused the startup crash.
 */
export const KALAI_APP_NAMESPACE = 'apps/kalai';

/** Document path holding every KALAI collection for one account. */
export function userDataPath(uid: string): string {
  if (!uid || uid.includes('/')) throw new Error('not-authenticated');
  return `users/${uid}/${KALAI_APP_NAMESPACE}`;
}

/** Collection path for a feature (`customers`, `bills`, …) for one account. */
export function accountCollectionPath(uid: string, name: string): string {
  if (!name || name.includes('/')) throw new Error('invalid-collection');
  return `${userDataPath(uid)}/${name}`;
}

/** Document path for a feature record for one account. */
export function accountDocumentPath(uid: string, name: string, id: string): string {
  if (!id || id.includes('/')) throw new Error('invalid-document-id');
  return `${accountCollectionPath(uid, name)}/${id}`;
}

export function readFirebaseConfig(env: Record<string, string | undefined>): FirebaseConfig | null {
  const cfg: FirebaseConfig = {
    apiKey: (env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: (env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: (env.VITE_FIREBASE_APP_ID || '').trim()
  };
  return Object.values(cfg).some((v) => !v) ? null : cfg;
}

function tsToIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function normalizeDoc<T extends { id: string }>(id: string, data: Record<string, unknown>): T {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) out[k] = v instanceof Timestamp ? tsToIso(v) : v;
  return out as T;
}

function sanitizeSyncError(raw: string): string {
  const cleaned = raw
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, '[redacted-key]')
    .replace(/[?&](?:key|apiKey|token|id_token|access_token|refresh_token)=[^&\s]+/gi, ' [redacted]')
    .replace(/https?:\/\/[^\s)]+/g, '[url]')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
}

export class FirestoreDataService implements DataService {
  readonly kind = 'firestore' as const;
  readonly isCloud = true;
  basePath = '';
  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;
  private uid: string | null = null;
  private authUser: AuthUser | null = null;
  private authListeners = new Set<(u: AuthUser | null) => void>();
  private connectivityListeners = new Set<(online: boolean) => void>();
  private syncListeners = new Set<(s: SyncStatus) => void>();
  private syncErrorListeners = new Set<(m: string | null) => void>();
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private pendingWrites = 0;
  private syncStatus: SyncStatus = 'synced';
  private lastSyncError: string | null = null;
  private syncUnsub: (() => void) | null = null;
  private ensuredUsers = new Set<string>();

  constructor(config: FirebaseConfig, opts: FirestoreServiceOptions = {}) {
    const fbConfig = { ...config };
    this.app = opts.appName
      ? (getApps().find((a) => a.name === opts.appName) ?? initializeApp(fbConfig, opts.appName))
      : getApps().length
        ? getApp()
        : initializeApp(fbConfig);
    const isNode = typeof process !== 'undefined' && !!process.versions?.node;
    const hasIndexedDb = typeof indexedDB !== 'undefined';
    this.db = initializeFirestore(this.app, {
      localCache:
        isNode && !hasIndexedDb
          ? memoryLocalCache()
          : isNode
            ? persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) })
            : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
    if (opts.emulator) connectFirestoreEmulator(this.db, opts.emulator.firestoreHost, opts.emulator.firestorePort);
    this.setupConnectivity();
    this.setupAuth(opts.emulator);
  }

  private setupAuth(emulator?: EmulatorConfig) {
    const auth = getAuth(this.app!);
    if (emulator) connectAuthEmulator(auth, `http://${emulator.authHost}:${emulator.authPort}`, { disableWarnings: true });
    onAuthStateChanged(auth, (user) => {
      // User-scoped references are only created after Auth resolves a UID.
      this.uid = user?.uid ?? null;
      const authUser = user ? this.toAuthUser(user) : null;
      this.authUser = authUser;
      // KALAI data is isolated in its own app subtree, so it never mixes with
      // another app using the same Firebase project for this account.
      this.basePath = this.uid ? userDataPath(this.uid) : '';
      this.authListeners.forEach((cb) => cb(this.authUser));
      if (authUser) void this.ensureUserDoc(authUser);
    });
  }

  private toAuthUser(user: FirebaseUser): AuthUser {
    return {
      uid: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email,
      photoURL: user.photoURL,
      isDemo: false
    };
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const auth = getAuth(this.app!);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    if (isNative()) {
      // Android must use the on-device Google account chooser (Credential
      // Manager). The old redirect fallback opened Chrome and dead-ended, so
      // it is deliberately removed: without the native path we fail with an
      // actionable message instead of a browser round-trip.
      if (!isNativeGoogleConfigured()) {
        throw new Error(
          'Android Google sign-in is not configured in this build. Add VITE_GOOGLE_WEB_CLIENT_ID to .env and rebuild the APK.'
        );
      }
      const { idToken } = await signInWithNativeGoogle();
      const cred = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, cred);
      return this.toAuthUser(result.user);
    }
    const cred = await signInWithPopup(auth, provider);
    return this.toAuthUser(cred.user);
  }

  async signInDemo(_name: string): Promise<AuthUser> {
    throw new Error('Demo sign-in is not available with the cloud backend.');
  }

  async signOut(): Promise<void> {
    await Promise.all([fbSignOut(getAuth(this.app!)), signOutNativeGoogle()]);
  }

  getAuthUser(): AuthUser | null {
    return this.authUser;
  }

  onAuthChange(cb: (u: AuthUser | null) => void): () => void {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  private async ensureUserDoc(user: AuthUser) {
    if (!this.db || this.ensuredUsers.has(user.uid)) return;
    this.ensuredUsers.add(user.uid);
    try {
      const ref = doc(this.db, `users/${user.uid}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          name: user.name,
          email: user.email || '',
          photoURL: user.photoURL || '',
          app: 'kalai-digital',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch {
      this.ensuredUsers.delete(user.uid);
    }
  }

  private dataRoot(): string {
    if (!this.uid) throw new Error('not-authenticated');
    return userDataPath(this.uid);
  }

  private col(name: string) {
    if (!this.db) throw new Error('not-authenticated');
    if (!this.uid) throw new Error('not-authenticated');
    return collection(this.db, accountCollectionPath(this.uid, name));
  }

  private docRef(name: string, id: string) {
    if (!this.db) throw new Error('not-authenticated');
    if (!this.uid) throw new Error('not-authenticated');
    return doc(this.db, accountDocumentPath(this.uid, name, id));
  }

  private buildQuery(name: string, spec?: QuerySpec) {
    const c = this.col(name);
    const constraints: QueryConstraint[] = [];
    if (spec?.where) {
      for (const w of spec.where) {
        if (w.op === '==') constraints.push(where(w.field, '==', w.value));
        else if (w.op === '>') constraints.push(where(w.field, '>', w.value));
        else if (w.op === '>=') constraints.push(where(w.field, '>=', w.value));
        else if (w.op === '<') constraints.push(where(w.field, '<', w.value));
        else if (w.op === '<=') constraints.push(where(w.field, '<=', w.value));
      }
    }
    if (spec?.orderBy) constraints.push(orderBy(spec.orderBy.field, spec.orderBy.dir));
    if (spec?.limit) constraints.push(fLimit(spec.limit));
    return fq(c, ...constraints);
  }

  async get<T extends { id: string }>(name: string, id: string): Promise<T | null> {
    const snap = await getDoc(this.docRef(name, id));
    return snap.exists() ? normalizeDoc<T>(snap.id, snap.data() as Record<string, unknown>) : null;
  }

  private raceLocalWrite(ref: DocumentReference, expectExists: boolean, write: Promise<unknown>): Promise<unknown> {
    // A rejected write (offline-permission, rules, invalid field) must reach the
    // caller so the UI can say the save failed instead of claiming success.
    const tracked = write.catch((e) => {
      this.captureSyncError(e);
      this.setStatus('error');
      throw e;
    });
    tracked.catch(() => undefined);
    return Promise.race([tracked, this.localApplied(ref, expectExists)]);
  }

  private localApplied(ref: DocumentReference, expectExists: boolean): Promise<void> {
    return new Promise((resolve) => {
      let unsub: () => void = () => undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        if (timer) clearTimeout(timer);
        unsub();
        resolve();
      };
      timer = setTimeout(done, 20000);
      unsub = onSnapshot(
        ref,
        (snap) => {
          const pending = snap.metadata.hasPendingWrites || snap.metadata.fromCache;
          if (expectExists ? snap.exists() && pending : !snap.exists() && pending) done();
        },
        () => done()
      );
    });
  }

  async set(name: string, id: string, data: Record<string, unknown>): Promise<void> {
    this.pending();
    try {
      const ref = this.docRef(name, id);
      await this.raceLocalWrite(ref, true, setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true }));
    } finally {
      this.done();
    }
  }

  async add(name: string, data: Record<string, unknown>): Promise<string> {
    this.pending();
    try {
      const ref = doc(this.col(name));
      await this.raceLocalWrite(ref, true, setDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      return ref.id;
    } finally {
      this.done();
    }
  }

  async delete(name: string, id: string): Promise<void> {
    this.pending();
    try {
      const ref = this.docRef(name, id);
      await this.raceLocalWrite(ref, false, deleteDoc(ref));
    } finally {
      this.done();
    }
  }

  async query<T extends { id: string }>(name: string, spec?: QuerySpec): Promise<T[]> {
    const snap = await getDocs(this.buildQuery(name, spec));
    return snap.docs.map((d) => normalizeDoc<T>(d.id, d.data() as Record<string, unknown>));
  }

  watch<T extends { id: string }>(name: string, spec: QuerySpec | undefined, cb: (items: T[]) => void): () => void {
    // A listener can be requested while Auth is still resolving (or after
    // sign-out). Treat that as "no data yet" instead of throwing during render.
    if (!this.db || !this.uid) return () => undefined;
    let q: Query;
    try {
      q = this.buildQuery(name, spec);
    } catch {
      return () => undefined;
    }
    return onSnapshot(
      q,
      (snap) => {
        this.setStatus('synced');
        cb(snap.docs.map((d) => normalizeDoc<T>(d.id, d.data() as Record<string, unknown>)));
      },
      (err) => {
        this.captureSyncError(err);
        this.setStatus('error');
      }
    );
  }

  async clearLocalData(): Promise<void> {
    if (this.db && this.uid) {
      for (const name of [
        'customers',
        'bills',
        'payments',
        'expenses',
        'inventory',
        'stockTxns',
        'auditLogs',
        'productConfigs',
        'frameSizes',
        'settings'
      ]) {
        await this.deleteAllAccountDocs(name);
      }
      try {
        await deleteDoc(doc(this.db, this.dataRoot(), 'counters', 'bills'));
      } catch {
        /* re-created on next allocation */
      }
    }
    if (this.db) {
      try {
        await terminate(this.db);
      } catch {
        /* already terminated */
      }
      this.db = null;
    }
    if (typeof indexedDB === 'undefined') return;
    const names: string[] = [];
    if (typeof indexedDB.databases === 'function') {
      try {
        const dbs = await indexedDB.databases();
        for (const d of dbs) if (d.name && d.name.startsWith('firestore/')) names.push(d.name);
      } catch {
        /* enumeration unsupported */
      }
    }
    if (names.length === 0 && this.app) {
      const project = (this.app.options as { projectId?: string } | undefined)?.projectId;
      if (project) names.push(`firestore/${project}/(default)`, `firestore/${project}/(default).blob`);
    }
    await Promise.all(
      names.map(
        (name) =>
          new Promise<void>((resolve) => {
            try {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            } catch {
              resolve();
            }
          })
      )
    );
  }

  private async deleteAllAccountDocs(name: string): Promise<void> {
    if (!this.db || !this.uid) return;
    for (;;) {
      const snap = await getDocs(fq(this.col(name), fLimit(300)));
      if (snap.empty) break;
      const batch = writeBatch(this.db);
      for (const d of snap.docs) batch.delete(doc(this.db, accountDocumentPath(this.uid, name, d.id)));
      await batch.commit();
      if (snap.docs.length < 300) break;
    }
  }

  async nextInvoiceNumber(opts: { prefix: string; pattern: string; start: number; date: Date }): Promise<string> {
    if (!this.db || !this.uid) throw new Error('not-authenticated');
    const counterRef = doc(this.db, this.dataRoot(), 'counters', 'bills');
    try {
      const seq = await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(counterRef);
        const existing = snap.exists() ? Number(snap.data()?.next || 0) : 0;
        const n = existing > 0 ? existing + 1 : Math.max(1, opts.start);
        tx.set(counterRef, { next: n, updatedAt: serverTimestamp() }, { merge: true });
        return n;
      });
      return formatBillNumber(opts.pattern, opts.prefix, seq, opts.date);
    } catch {
      const all = await this.query<{ id: string; number: string }>('bills', { orderBy: { field: 'createdAt', dir: 'desc' } });
      let max = 0;
      for (const bill of all) max = Math.max(max, parseBillSequence(bill.number));
      return formatBillNumber(opts.pattern, opts.prefix, Math.max(max + 1, opts.start), opts.date);
    }
  }

  async reconcileInvoiceNumbers(
    opts: { prefix: string; pattern: string },
    bills: { id: string; number: string; createdAt: string }[]
  ): Promise<number> {
    const seen = new Set<string>();
    let fixed = 0;
    const sorted = [...bills].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    let maxN = 0;
    for (const b of sorted) maxN = Math.max(maxN, parseBillSequence(b.number));
    for (const b of sorted) {
      if (seen.has(b.number)) {
        maxN += 1;
        await this.set('bills', b.id, {
          number: formatBillNumber(opts.pattern, opts.prefix, maxN, new Date(b.createdAt)),
          renumbered: true
        });
        fixed += 1;
      } else {
        seen.add(b.number);
      }
    }
    if (maxN > 0 && this.db && this.uid) {
      const counterRef = doc(this.db, this.dataRoot(), 'counters', 'bills');
      try {
        await runTransaction(this.db, async (tx) => {
          const snap = await tx.get(counterRef);
          const next = snap.exists() ? Number(snap.data()?.next || 0) : 0;
          if (next <= maxN) tx.set(counterRef, { next: maxN + 1, updatedAt: serverTimestamp() }, { merge: true });
        });
      } catch {
        /* repaired next session */
      }
    }
    return fixed;
  }

  private setupConnectivity() {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
    const update = () => {
      this.online = navigator.onLine;
      this.connectivityListeners.forEach((cb) => cb(this.online));
      if (!this.online) this.setStatus('offline');
      else if (this.pendingWrites > 0) this.setStatus('syncing');
      else this.setStatus('synced');
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  }

  private pending() {
    this.pendingWrites += 1;
    this.setStatus('syncing');
    if (!this.syncUnsub && this.db) {
      this.syncUnsub = onSnapshotsInSync(this.db, () => this.done());
    }
  }

  private done() {
    this.pendingWrites = Math.max(0, this.pendingWrites - 1);
    if (this.pendingWrites === 0) {
      if (this.syncUnsub) {
        this.syncUnsub();
        this.syncUnsub = null;
      }
      if (this.online && this.lastSyncError === null) this.setStatus('synced');
    }
  }

  private setStatus(s: SyncStatus) {
    if (this.syncStatus === s) return;
    this.syncStatus = s;
    if (s === 'synced') this.clearSyncError();
    this.syncListeners.forEach((cb) => cb(s));
  }

  private captureSyncError(e: unknown) {
    let msg = '';
    if (e && typeof e === 'object') {
      const o = e as { code?: unknown; message?: unknown };
      if (typeof o.message === 'string') msg = o.message;
      if (typeof o.code === 'string' && o.code) msg = msg ? `${o.code}: ${msg}` : o.code;
    }
    if (!msg) msg = String(e);
    this.lastSyncError = sanitizeSyncError(msg);
    this.syncErrorListeners.forEach((cb) => cb(this.lastSyncError));
  }

  private clearSyncError() {
    if (this.lastSyncError === null) return;
    this.lastSyncError = null;
    this.syncErrorListeners.forEach((cb) => cb(null));
  }

  isOnline(): boolean {
    return this.online;
  }

  onConnectivityChange(cb: (online: boolean) => void): () => void {
    this.connectivityListeners.add(cb);
    return () => this.connectivityListeners.delete(cb);
  }

  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  onSyncStatusChange(cb: (s: SyncStatus) => void): () => void {
    this.syncListeners.add(cb);
    cb(this.syncStatus);
    return () => this.syncListeners.delete(cb);
  }

  getLastSyncError(): string | null {
    return this.lastSyncError;
  }

  onSyncErrorChange(cb: (message: string | null) => void): () => void {
    this.syncErrorListeners.add(cb);
    cb(this.lastSyncError);
    return () => this.syncErrorListeners.delete(cb);
  }
}
