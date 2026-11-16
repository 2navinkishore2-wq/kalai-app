import type { DataService } from './data';

export const BACKUP_APP = 'KALAI DIGITAL';
export const BACKUP_COLLECTIONS = [
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
] as const;

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export async function exportBackup(svc: DataService): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const name of BACKUP_COLLECTIONS) {
    data[name] = await svc.query<{ id: string }>(name);
  }
  return { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), data };
}

export function validateBackup(value: unknown): BackupFile {
  const file = value as BackupFile;
  if (!file || typeof file !== 'object' || file.app !== BACKUP_APP || !file.data || typeof file.data !== 'object') {
    throw new Error('This file is not a KALAI DIGITAL backup.');
  }
  return file;
}

export async function importBackup(svc: DataService, value: unknown): Promise<{ collections: number; documents: number }> {
  const file = validateBackup(value);
  let documents = 0;
  let collections = 0;
  for (const name of BACKUP_COLLECTIONS) {
    const docs = file.data[name];
    if (!Array.isArray(docs)) continue;
    for (const doc of docs) {
      if (!doc || typeof doc !== 'object') continue;
      const record = doc as Record<string, unknown>;
      if (typeof record.id !== 'string' || !record.id) continue;
      const { id, ...rest } = record;
      await svc.set(name, id, rest);
      documents += 1;
    }
    if (docs.length > 0) collections += 1;
  }
  return { collections, documents };
}

export function backupText(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

export function backupFileName(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `kalai-digital-backup-${stamp}.json`;
}

export async function downloadBackup(file: BackupFile): Promise<'native' | 'browser'> {
  const blob = new Blob([backupText(file)], { type: 'application/json;charset=utf-8' });
  const { saveFile } = await import('./download');
  return saveFile(backupFileName(), blob, 'application/json');
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text();
  try {
    return validateBackup(JSON.parse(text));
  } catch (e) {
    if ((e as Error).message.includes('KALAI DIGITAL backup')) throw e;
    throw new Error('The selected file is not valid JSON.');
  }
}
