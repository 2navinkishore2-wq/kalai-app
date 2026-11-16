import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataService } from './localService';
import { BACKUP_APP, exportBackup, importBackup, readBackupFile, validateBackup } from './backup';

beforeEach(() => localStorage.clear());

describe('backup and restore', () => {
  it('exports real collections and restores them by document id', async () => {
    const svc = new LocalDataService();
    await svc.set('customers', 'c1', { name: 'Ramesh', phone: '' });
    await svc.set('bills', 'b1', { number: 'KD-2026-0001', total: 750 });
    await svc.set('settings', 'business', { nameEn: 'KALAI DIGITAL' });

    const backup = await exportBackup(svc);
    expect(backup.app).toBe(BACKUP_APP);
    expect(backup.data.customers).toHaveLength(1);
    expect(backup.data.bills).toHaveLength(1);
    expect(backup.data.settings).toHaveLength(1);

    await svc.clearLocalData();
    expect(await svc.query('customers')).toHaveLength(0);

    const result = await importBackup(svc, JSON.parse(JSON.stringify(backup)));
    expect(result.documents).toBe(3);
    expect(result.collections).toBe(3);
    expect((await svc.get<{ id: string; name: string }>('customers', 'c1'))?.name).toBe('Ramesh');
    expect((await svc.get<{ id: string; total: number }>('bills', 'b1'))?.total).toBe(750);
  });

  it('rejects files from another app or invalid JSON', async () => {
    expect(() => validateBackup({ app: 'Some Other Billing App', data: {} })).toThrow(/not a KALAI DIGITAL backup/);
    expect(() => validateBackup(null)).toThrow(/not a KALAI DIGITAL backup/);

    const file = new File(['{not json'], 'broken.json', { type: 'application/json' });
    await expect(readBackupFile(file)).rejects.toThrow(/not valid JSON/);
  });

  it('reads a valid backup file', async () => {
    const file = new File([JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: '', data: { customers: [] } })], 'backup.json', { type: 'application/json' });
    const parsed = await readBackupFile(file);
    expect(parsed.app).toBe(BACKUP_APP);
    expect(parsed.data.customers).toEqual([]);
  });
});
