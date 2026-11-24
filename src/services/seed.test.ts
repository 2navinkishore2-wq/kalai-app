import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataService } from './localService';
import { seedWorkspace } from './seed';
import { createBill } from './bills';
import { DEFAULT_SETTINGS, FRAME_BEADINGS, OPENING_RATES_VERSION, OPENING_SQFT_RATES } from '../lib/constants';
import type { AuthUser, Bill, BillItem, ProductConfig } from '../lib/types';

const user: AuthUser = { uid: 'owner-1', name: 'Owner', email: 'owner@kalai.test', photoURL: null, isDemo: true };

async function product(svc: LocalDataService, key: string): Promise<ProductConfig> {
  const all = await svc.query<ProductConfig>('productConfigs');
  const found = all.find((p) => p.key === key);
  if (!found) throw new Error(`missing product ${key}`);
  return found;
}

describe('opening Flex / Sunpack / Vinyl / Star rates', () => {
  let svc: LocalDataService;

  beforeEach(() => {
    localStorage.clear();
    svc = new LocalDataService();
  });

  it('seeds the shop opening rates per square foot', async () => {
    await seedWorkspace(svc, 'owner@kalai.test');

    for (const key of ['FLEX', 'SUNPACK', 'VINYL', 'STAR'] as const) {
      const p = await product(svc, key);
      expect(p.rate).toBe(OPENING_SQFT_RATES[key]);
      expect(p.basisSqft).toBe(1);
      expect(p.pricingMode).toBe('sqft');
      expect(p.openingRatesVersion).toBe(OPENING_RATES_VERSION);
    }

    // Sunpack uses the same simple area × ₹/sq.ft × qty model as Flex.
    const sunpack = await product(svc, 'SUNPACK');
    expect(sunpack.rate).toBe(16);
    expect(sunpack.basisSqft).toBe(1);
    expect(sunpack.minSqft).toBe(0);
    expect(sunpack.minChargeEnabled).toBe(false);

    const frame = await product(svc, 'FRAME');
    expect(frame.pricingMode).toBe('fixed');
  });

  it('migrates an existing pre-update product doc exactly once', async () => {
    const now = new Date().toISOString();
    await svc.set('productConfigs', 'product-flex', {
      key: 'FLEX',
      name: 'Flex',
      nameTa: 'ஃபிளக்ஸ்',
      pricingMode: 'sqft',
      rate: 12,
      basisSqft: 16,
      minSqft: 0,
      minChargeEnabled: false,
      rounding: 'nearest',
      active: true,
      purchaseCostPerSqft: 0,
      trackStock: false,
      createdAt: now,
      updatedAt: now
    });

    await seedWorkspace(svc);
    const migrated = await product(svc, 'FLEX');
    // ₹12 per 16 sq.ft is the same price as ₹0.75 per sq.ft, so the legacy
    // rate is converted instead of being thrown away.
    expect(migrated.rate).toBe(0.75);
    expect(migrated.basisSqft).toBe(1);
    expect(migrated.openingRatesVersion).toBe(OPENING_RATES_VERSION);

    // An owner edit after the migration survives later launches.
    await svc.set('productConfigs', migrated.id, { rate: 20 });
    await seedWorkspace(svc);
    const edited = await product(svc, 'FLEX');
    expect(edited.rate).toBe(20);
    expect(edited.basisSqft).toBe(1);
  });

  it('keeps saved bill rates and totals after a rate change', async () => {
    await seedWorkspace(svc);
    const flex = await product(svc, 'FLEX');
    const item: BillItem = {
      key: 'line-flex',
      product: 'FLEX',
      label: 'Flex',
      widthIn: 120,
      heightIn: 120,
      widthEntered: 10,
      heightEntered: 10,
      unit: 'ft',
      areaSqft: 100,
      chargeableSqft: 100,
      basisSqft: 1,
      rate: flex.rate,
      qty: 1,
      amount: 1600
    };
    const bill = await createBill(
      svc,
      DEFAULT_SETTINGS,
      {
        date: '2026-11-15',
        customerId: null,
        customer: { name: 'Walk-in Customer', phone: '', address: '', email: '' },
        items: [item],
        discountType: 'amount',
        discountValue: 0,
        additionalCharges: 0,
        gstEnabled: false,
        gstRate: 18,
        gstInclusive: false,
        payments: [],
        note: ''
      },
      user
    );

    await svc.set('productConfigs', flex.id, { rate: 25 });
    const stored = await svc.get<Bill>('bills', bill.id);
    expect(stored?.items[0].rate).toBe(16);
    expect(stored?.items[0].amount).toBe(1600);
    expect(stored?.total).toBe(1600);
  });

  it('offers exactly the three frame beading choices', () => {
    expect(FRAME_BEADINGS.map((b) => b.value)).toEqual(['1 inch', '1½ inches', '2 inches']);
  });
});
