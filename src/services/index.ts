import type { DataService } from './data';
import { FirestoreDataService, readFirebaseConfig, type EmulatorConfig } from './firestoreService';
import { LocalDataService } from './localService';

export type DataMode = 'cloud' | 'local' | 'none';

function emulatorFromEnv(env: Record<string, string | undefined>): EmulatorConfig | undefined {
  const raw = env.VITE_FIREBASE_EMULATOR_HOST;
  if (!import.meta.env.DEV || !raw) return undefined;
  const [host, portRaw] = raw.split(':');
  const firestorePort = Number(portRaw || 8080);
  if (!host || !Number.isFinite(firestorePort)) return undefined;
  return { authHost: host, authPort: 9099, firestoreHost: host, firestorePort };
}

export interface ServiceBundle {
  service: DataService;
  mode: DataMode;
  configured: boolean;
}

export function createService(env: Record<string, string | undefined> = import.meta.env): ServiceBundle {
  const mode = (env.VITE_DATA_MODE || 'auto') as string;
  const cfg = readFirebaseConfig(env);
  if (mode === 'local') return { service: new LocalDataService(), mode: 'local', configured: !!cfg };
  if (mode === 'cloud') {
    if (!cfg) return { service: new LocalDataService(), mode: 'none', configured: false };
    return { service: new FirestoreDataService(cfg, { emulator: emulatorFromEnv(env) }), mode: 'cloud', configured: true };
  }
  if (cfg) return { service: new FirestoreDataService(cfg, { emulator: emulatorFromEnv(env) }), mode: 'cloud', configured: true };
  return { service: new LocalDataService(), mode: 'local', configured: false };
}

export type { DataService };
