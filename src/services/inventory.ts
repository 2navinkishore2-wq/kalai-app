import type { AuthUser, InventoryItem, StockTxn, StockTxnType } from '../lib/types';
import type { DataService } from './data';
import { addAudit } from './audit';
import { round2 } from '../lib/money';

export interface InventoryInput {
  name: string;
  unit: string;
  stockQty: number;
  lowStockAt: number;
  costPerUnit: number;
  notes?: string;
}

export interface StockInput {
  type: StockTxnType;
  qty: number;
  date: string;
  note?: string;
}

export function validateInventory(input: InventoryInput): string | null {
  if (!input.name?.trim()) return 'Enter a material name.';
  if (!input.unit?.trim()) return 'Enter a unit (for example sq.ft, piece, roll).';
  if (!Number.isFinite(input.stockQty)) return 'Enter a valid opening stock.';
  if (!Number.isFinite(input.costPerUnit) || input.costPerUnit < 0) return 'Enter a valid cost per unit.';
  return null;
}

export async function createInventoryItem(svc: DataService, input: InventoryInput, user: AuthUser | null): Promise<InventoryItem> {
  const error = validateInventory(input);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  const doc = {
    name: input.name.trim(),
    unit: input.unit.trim(),
    stockQty: round2(input.stockQty),
    lowStockAt: Math.max(0, round2(input.lowStockAt)),
    costPerUnit: Math.max(0, round2(input.costPerUnit)),
    notes: (input.notes || '').trim(),
    createdAt: now,
    updatedAt: now
  };
  const id = await svc.add('inventory', doc);
  await addAudit(svc, user, { entity: 'inventory', entityId: id, action: 'create', summary: `Inventory item ${doc.name} added (${doc.stockQty} ${doc.unit})` });
  return { id, ...doc };
}

export async function updateInventoryItem(svc: DataService, item: InventoryItem, input: InventoryInput, user: AuthUser | null): Promise<void> {
  const error = validateInventory(input);
  if (error) throw new Error(error);
  await svc.set('inventory', item.id, {
    name: input.name.trim(),
    unit: input.unit.trim(),
    stockQty: round2(input.stockQty),
    lowStockAt: Math.max(0, round2(input.lowStockAt)),
    costPerUnit: Math.max(0, round2(input.costPerUnit)),
    notes: (input.notes || '').trim()
  });
  await addAudit(svc, user, { entity: 'inventory', entityId: item.id, action: 'update', summary: `Inventory item ${item.name} updated` });
}

export async function deleteInventoryItem(svc: DataService, item: InventoryItem, user: AuthUser | null): Promise<void> {
  await svc.delete('inventory', item.id);
  await addAudit(svc, user, { entity: 'inventory', entityId: item.id, action: 'delete', summary: `Inventory item ${item.name} deleted` });
}

export function stockDelta(type: StockTxnType, qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  if (type === 'purchase') return Math.abs(qty);
  if (type === 'usage') return -Math.abs(qty);
  return qty;
}

export async function recordStockTxn(
  svc: DataService,
  item: InventoryItem,
  input: StockInput,
  allowNegative: boolean,
  user: AuthUser | null
): Promise<StockTxn> {
  if (!Number.isFinite(input.qty) || input.qty === 0) throw new Error('Enter a quantity other than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Choose a valid date.');
  const delta = stockDelta(input.type, input.qty);
  const next = round2(item.stockQty + delta);
  if (next < 0 && !allowNegative) throw new Error(`Not enough stock. Available: ${item.stockQty} ${item.unit}.`);
  const now = new Date().toISOString();
  const doc = {
    inventoryId: item.id,
    itemName: item.name,
    type: input.type,
    qty: round2(input.qty),
    date: input.date,
    note: (input.note || '').trim(),
    createdAt: now,
    updatedAt: now
  };
  await svc.set('inventory', item.id, { stockQty: next });
  const id = await svc.add('stockTxns', doc);
  await addAudit(svc, user, {
    entity: 'inventory',
    entityId: item.id,
    action: 'update',
    summary: `${input.type === 'purchase' ? 'Stock in' : input.type === 'usage' ? 'Stock used' : 'Stock adjusted'} — ${item.name}: ${item.stockQty} → ${next} ${item.unit}`
  });
  return { id, ...doc };
}
