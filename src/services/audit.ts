import type { AuditLog, AuthUser } from '../lib/types';
import type { DataService } from './data';

export async function addAudit(
  svc: DataService,
  user: AuthUser | null,
  entry: Omit<AuditLog, 'id' | 'userId' | 'userName' | 'at' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (!user) return;
  try {
    await svc.add('auditLogs', {
      ...entry,
      userId: user.uid,
      userName: user.name || user.email || 'User',
      at: new Date().toISOString()
    });
  } catch {
    // Audit is best-effort and must never block saving a bill or payment.
  }
}
