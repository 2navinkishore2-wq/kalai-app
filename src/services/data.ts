import type { AuthUser, SyncStatus } from '../lib/types';

export type WhereOp = '==' | '>' | '>=' | '<' | '<=';

export interface WhereClause {
  field: string;
  op: WhereOp;
  value: unknown;
}

export interface OrderBy {
  field: string;
  dir: 'asc' | 'desc';
}

export interface QuerySpec {
  where?: WhereClause[];
  orderBy?: OrderBy;
  limit?: number;
}

export interface NumberOptions {
  prefix: string;
  pattern: string;
  start: number;
  date: Date;
}

/**
 * One data contract implemented by the cloud (Firestore, with its offline
 * cache + automatic replay) and by the device-local backend (IndexedDB /
 * localStorage fallback). The UI never talks to Firebase directly.
 */
export interface DataService {
  kind: 'firestore' | 'local';
  /**
   * Document path holding this account's KALAI collections, e.g.
   * `users/{uid}/apps/kalai` in Firestore. It is empty until Firebase Auth has
   * resolved the signed-in UID.
   */
  basePath: string;

  signInWithGoogle(): Promise<AuthUser>;
  signInDemo(name: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  getAuthUser(): AuthUser | null;
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;

  get<T extends { id: string }>(collection: string, id: string): Promise<T | null>;
  set(collection: string, id: string, data: Record<string, unknown>): Promise<void>;
  add(collection: string, data: Record<string, unknown>): Promise<string>;
  delete(collection: string, id: string): Promise<void>;
  query<T extends { id: string }>(collection: string, spec?: QuerySpec): Promise<T[]>;
  watch<T extends { id: string }>(collection: string, spec: QuerySpec | undefined, cb: (items: T[]) => void): () => void;

  nextInvoiceNumber(opts: NumberOptions): Promise<string>;
  reconcileInvoiceNumbers?(opts: { prefix: string; pattern: string }, bills: { id: string; number: string; createdAt: string }[]): Promise<number>;

  clearLocalData(): Promise<void>;

  /** Optional: used before the Windows app closes itself to install an update. */
  waitForPendingWrites?(timeoutMs?: number): Promise<{ pending: number; timedOut: boolean }>;

  isOnline(): boolean;
  onConnectivityChange(cb: (online: boolean) => void): () => void;
  getSyncStatus(): SyncStatus;
  onSyncStatusChange(cb: (status: SyncStatus) => void): () => void;
  isCloud: boolean;
  getLastSyncError(): string | null;
  onSyncErrorChange(cb: (message: string | null) => void): () => void;
}
