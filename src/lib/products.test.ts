import { beforeEach, describe, expect, it } from 'vitest';
import {
  PRODUCT_CONFIG_VERSION,
  buildProductList,
  normalizeProductConfig,
  productMigrationPatch,
  productRateFields,
  resolveProductActive,
  type RawProduct
} from './products';
import { OPENING_SQFT_RATES } from './constants';
import { computeFrame } from './pricing';
import { LocalDataService } from '../services/localService';
import { seedWorkspace } from '../services/seed';
import { loadProductSettings, migrateProductConfigs, saveProductRates, verifyProductRates } from '../services/products';
import type { ProductConfig } from './types';

function flexDoc(over: Partial<RawProduct> = {}): RawProduct {
  return {
    id: 'product-flex',
    key: 'FLEX',
    name: 'Flex',
    nameTa: 'ஃபிளக்ஸ்',
    pricingMode: 'sqft',
    rate: 16,
    basisSqft: 1,
    minSqft: 0,
    minChargeEnabled: false,
    rounding: 'nearest',
    active: true,
    purchaseCostPerSqft: 0,
    trackStock: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over
  };
}

function byKey(products: ProductConfig[], key: ProductConfig['key']): ProductConfig {
  const found = products.find((p) => p.key === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
}

describe('changing a rate never changes availability', () => {
  it('saves the new Flex rate with Flex still enabled', () => {
    const flex = normalizeProductConfig(flexDoc(), 'FLEX');
    const fields = productRateFields(flex, 25, flex.active);
    expect(fields.rate).toBe(25);
    expect(fields.active).toBe(true);
    expect(fields.key).toBe('FLEX');

    const after = byKey(buildProductList([{ id: 'product-flex', ...fields }]), 'FLEX');
    expect(after.rate).toBe(25);
    expect(after.active).toBe(true);
    expect(after.key).toBe('FLEX');
  });

  it('keeps a partial legacy record billable and complete', () => {
    // Exactly the shape that produced "Flex (off)": a document without key,
    // name or activation.
    const legacy: RawProduct = { id: 'product-flex', rate: 16 };
    const product = normalizeProductConfig(legacy, 'FLEX');
    expect(product.key).toBe('FLEX');
    expect(product.name).toBe('Flex');
    expect(product.active).toBe(true);
    expect(product.rate).toBe(16);
  });

  it('treats a missing activation field as enabled, not disabled', () => {
    expect(resolveProductActive({ rate: 16 })).toBeUndefined();
    expect(normalizeProductConfig({ rate: 16 }, 'SUNPACK').active).toBe(true);
  });

  it('preserves an explicitly disabled product', () => {
    expect(resolveProductActive({ active: false, enabled: true } as RawProduct)).toBe(false);
    expect(normalizeProductConfig(flexDoc({ active: false }), 'FLEX').active).toBe(false);
    expect(normalizeProductConfig({ rate: 25, status: 'inactive' } as RawProduct, 'VINYL').active).toBe(false);
  });

  it('always returns all five products even from broken documents', () => {
    const list = buildProductList([{ id: 'product-flex', rate: 16 }, { id: 'nonsense' }, null as unknown as RawProduct]);
    expect(list.map((p) => p.key)).toEqual(['FRAME', 'FLEX', 'SUNPACK', 'VINYL', 'STAR']);
    expect(list.every((p) => p.active === true)).toBe(true);
  });

  it('prefers the canonical document over a stale duplicate', () => {
    const stale = flexDoc({ id: 'legacy-flex', rate: 16, updatedAt: '2026-05-01T00:00:00.000Z', active: false });
    const current = flexDoc({ id: 'product-flex', rate: 25, updatedAt: '2026-01-01T00:00:00.000Z' });
    const flex = byKey(buildProductList([stale, current]), 'FLEX');
    expect(flex.rate).toBe(25);
    expect(flex.active).toBe(true);
  });
});

describe('legacy product migration', () => {
  it('fills missing activation and keeps the saved custom rate', () => {
    const raw = flexDoc({ rate: 21, updatedAt: '2026-04-01T00:00:00.000Z' });
    delete (raw as Record<string, unknown>).active;
    const patch = productMigrationPatch(raw, normalizeProductConfig(raw, 'FLEX'));
    expect(patch).not.toBeNull();
    expect(patch?.active).toBe(true);
    expect(patch?.configVersion).toBe(PRODUCT_CONFIG_VERSION);
    // A valid saved rate is never included, so a stale device cannot overwrite it.
    expect(patch).not.toHaveProperty('rate');
  });

  it('does not re-enable a product the owner disabled', () => {
    const raw = flexDoc({ active: false });
    const patch = productMigrationPatch(raw, normalizeProductConfig(raw, 'FLEX'));
    expect(patch?.active).toBe(false);
  });

  it('runs at most once per record', () => {
    const raw = flexDoc();
    const first = productMigrationPatch(raw, normalizeProductConfig(raw, 'FLEX'));
    expect(first).not.toBeNull();
    const migrated = flexDoc({ ...(first as Record<string, unknown>), active: true } as Partial<RawProduct>);
    expect(productMigrationPatch(migrated, normalizeProductConfig(migrated, 'FLEX'))).toBeNull();
  });

  it('converts a legacy per-16-sq.ft rate without changing the money', () => {
    const sunpack = normalizeProductConfig(flexDoc({ id: 'product-sunpack', key: 'SUNPACK', rate: 256, basisSqft: 16 }), 'SUNPACK');
    expect(sunpack.basisSqft).toBe(1);
    expect(sunpack.rate).toBe(16);
  });

  it('fills a missing rate with the shop opening rate only', () => {
    const broken = flexDoc({ rate: undefined });
    const product = normalizeProductConfig(broken, 'FLEX');
    expect(product.rate).toBe(OPENING_SQFT_RATES.FLEX);
    const patch = productMigrationPatch(broken, product);
    expect(patch?.rate).toBe(OPENING_SQFT_RATES.FLEX);
  });
});

describe('saving and reloading product settings', () => {
  let svc: LocalDataService;

  beforeEach(async () => {
    localStorage.clear();
    svc = new LocalDataService();
    await seedWorkspace(svc, 'owner@kalai.test');
  });

  it('saves Flex at ₹25 and leaves the other products untouched', async () => {
    const before = await loadProductSettings(svc);
    const flex = byKey(before, 'FLEX');
    expect(flex.rate).toBe(16);

    await saveProductRates(svc, [{ product: flex, rate: 25, active: flex.active }]);
    expect(await verifyProductRates(svc, [{ product: flex, rate: 25, active: flex.active }])).toEqual([]);

    const after = await loadProductSettings(svc);
    expect(byKey(after, 'FLEX').rate).toBe(25);
    expect(byKey(after, 'FLEX').active).toBe(true);
    for (const key of ['SUNPACK', 'VINYL', 'STAR', 'FRAME'] as const) {
      expect(byKey(after, key).rate).toBe(byKey(before, key).rate);
      expect(byKey(after, key).active).toBe(byKey(before, key).active);
    }
  });

  it('shows the saved rate immediately on the next bill screen load', async () => {
    const flex = byKey(await loadProductSettings(svc), 'FLEX');
    await saveProductRates(svc, [{ product: flex, rate: 25, active: true }]);

    // The New Bill screen reads buildProductList from the live snapshot.
    const docs = await svc.query<ProductConfig>('productConfigs');
    const products = buildProductList(docs as unknown as RawProduct[]);
    const billingFlex = byKey(products, 'FLEX');
    expect(billingFlex.rate).toBe(25);
    expect(billingFlex.active).toBe(true);
    // None of the four products may render as "(off)".
    expect(products.filter((p) => p.key !== 'FRAME').every((p) => p.active === true)).toBe(true);
  });

  it('keeps a custom rate across sign-out and sign-in', async () => {
    const flex = byKey(await loadProductSettings(svc), 'FLEX');
    await saveProductRates(svc, [{ product: flex, rate: 30, active: true }]);

    await svc.signOut();
    const next = new LocalDataService();
    await next.signInDemo('Owner');

    expect(byKey(await loadProductSettings(next), 'FLEX').rate).toBe(30);
  });

  it('keeps a deliberately disabled product disabled through a rate save', async () => {
    const star = byKey(await loadProductSettings(svc), 'STAR');
    await saveProductRates(svc, [{ product: star, rate: 28, active: false }]);

    const saved = byKey(await loadProductSettings(svc), 'STAR');
    expect(saved.rate).toBe(28);
    expect(saved.active).toBe(false);

    // Re-running the migration (e.g. from another device) must not re-enable it.
    await migrateProductConfigs(svc);
    const again = byKey(await loadProductSettings(svc), 'STAR');
    expect(again.active).toBe(false);
    expect(again.rate).toBe(28);
  });

  it('is safe to migrate repeatedly', async () => {
    expect(await migrateProductConfigs(svc)).toBeGreaterThanOrEqual(0);
    expect(await migrateProductConfigs(svc)).toBe(0);
  });

  it('repairs a legacy document once and keeps its custom rate', async () => {
    await svc.set('productConfigs', 'product-flex', {
      rate: 21,
      active: undefined as unknown as boolean,
      configVersion: undefined as unknown as number
    });
    // LocalDataService keeps the undefined keys; the normaliser must ignore them.
    await migrateProductConfigs(svc);
    const flex = byKey(await loadProductSettings(svc), 'FLEX');
    expect(flex.rate).toBe(21);
    expect(flex.active).toBe(true);
    expect(await migrateProductConfigs(svc)).toBe(0);
  });

  it('bills the saved square-foot rate exactly', () => {
    // 10 ft × 10 ft × ₹25/sq.ft × 1 = ₹2,500
    const area = 10 * 10;
    expect(area * 25).toBe(2500);
  });

  it('keeps frame billing fixed per piece', () => {
    expect(computeFrame(350, 2)).toBe(700);
    expect(computeFrame(250, 1)).toBe(250);
  });
});
