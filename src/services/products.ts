/** Product rate persistence: write complete documents, then verify the reload. */

import {
  buildProductList,
  normalizeProductConfig,
  productMigrationPatch,
  productRateFields,
  type RawProduct
} from '../lib/products';
import type { ProductConfig } from '../lib/types';
import type { DataService } from './data';

export interface ProductRateRow {
  product: ProductConfig;
  rate: number;
  active: boolean;
}

/** Reads the stored product documents as the five normalised products. */
export async function loadProductSettings(svc: DataService): Promise<ProductConfig[]> {
  const docs = await svc.query<ProductConfig>('productConfigs');
  return buildProductList(docs as unknown as RawProduct[]);
}

/**
 * Saves the ₹/sq.ft rates and availability. Each document is written with its
 * full configuration, so only the fields the owner changed actually differ and
 * nothing is dropped. Write errors propagate — the UI must never claim success
 * for a failed save.
 */
export async function saveProductRates(svc: DataService, rows: ProductRateRow[]): Promise<void> {
  for (const row of rows) {
    await svc.set('productConfigs', row.product.id, productRateFields(row.product, row.rate, row.active));
  }
}

/**
 * Re-reads the saved settings and returns a human-readable list of anything
 * that did not stick (normally empty). Used to confirm a save instead of
 * assuming the write landed.
 */
export async function verifyProductRates(svc: DataService, rows: ProductRateRow[]): Promise<string[]> {
  const expected = new Map(rows.map((row) => [row.product.key, row]));
  const saved = await loadProductSettings(svc);
  const problems: string[] = [];
  for (const product of saved) {
    const row = expected.get(product.key);
    if (!row) continue;
    if (Math.abs(product.rate - row.rate) > 0.005) {
      problems.push(`${product.name} shows ₹${product.rate} instead of ₹${row.rate}`);
    }
    if (product.active !== row.active) {
      problems.push(`${product.name} availability did not save`);
    }
  }
  return problems;
}

/**
 * Repairs legacy product documents: restores missing activation flags and
 * identity fields, folds the old per-16-sq.ft rate into per-sq.ft, and stamps
 * a version. Never overwrites a valid saved rate and never deletes anything.
 * Safe to run on every launch and on several devices at once.
 */
export async function migrateProductConfigs(svc: DataService): Promise<number> {
  const docs = (await svc.query<ProductConfig>('productConfigs')) as unknown as RawProduct[];
  const normalized = buildProductList(docs);
  const byId = new Map(docs.map((doc) => [String(doc.id || ''), doc]));
  let repaired = 0;

  for (const product of normalized) {
    const raw = byId.get(product.id) || null;
    if (!raw) continue;
    const patch = productMigrationPatch(raw, product);
    if (!patch) continue;
    await svc.set('productConfigs', product.id, patch);
    repaired += 1;
  }
  return repaired;
}

/** Exposed for tests and for callers that only hold a raw document. */
export function normalizeStoredProduct(raw: RawProduct, key: ProductConfig['key']): ProductConfig {
  return normalizeProductConfig(raw, key);
}
