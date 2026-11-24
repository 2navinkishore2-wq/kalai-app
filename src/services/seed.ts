import {
  DEFAULT_ACCESS,
  DEFAULT_PAYMENT_DETAILS,
  DEFAULT_SETTINGS,
  FRAME_PRICE_SEED,
  OPENING_RATES_VERSION,
  OPENING_SQFT_RATES,
  PRODUCT_KEYS,
  frameSeedId,
  isSqftProduct,
  productSeed
} from '../lib/constants';
import { round2 } from '../lib/money';
import type { BusinessSettings, FrameSize, ProductConfig } from '../lib/types';
import type { DataService } from './data';

function iso(): string {
  return new Date().toISOString();
}

/**
 * Creates missing product docs and applies the unified square-feet pricing
 * exactly once. The `openingRatesVersion` stamp lives on each product doc, so
 * later owner edits are never overwritten and the migration syncs with the
 * account like any other rate change.
 *
 * Version 2 folds Sunpack into the same per-sq.ft model as Flex/Vinyl/Star.
 * A legacy per-16-sq.ft rate is converted to the equivalent per-sq.ft value
 * (rate ÷ basis) instead of being discarded, and a zero/unset rate receives the
 * shop's opening rate.
 */
async function ensureProductConfigs(svc: DataService, products: ProductConfig[]): Promise<void> {
  const byKey = new Map(products.map((p) => [p.key, p]));
  for (const key of PRODUCT_KEYS) {
    const existing = byKey.get(key);
    if (!existing) {
      const seed = productSeed(key, iso());
      await svc.set('productConfigs', seed.id, seed as unknown as Record<string, unknown>);
      continue;
    }
    if (isSqftProduct(key) && existing.openingRatesVersion !== OPENING_RATES_VERSION) {
      const oldBasis = Number(existing.basisSqft) > 0 ? Number(existing.basisSqft) : 1;
      const oldRate = Number(existing.rate) > 0 ? Number(existing.rate) : 0;
      const perSqft = oldBasis > 1 && oldRate > 0 ? round2(oldRate / oldBasis) : oldRate;
      const patch: Record<string, unknown> = {
        pricingMode: 'sqft',
        rate: perSqft > 0 ? perSqft : OPENING_SQFT_RATES[key],
        basisSqft: 1,
        openingRatesVersion: OPENING_RATES_VERSION
      };
      // Sunpack used to expose unrelated basis/minimum controls. The requested
      // rule is the simple area × rate × qty model, with no minimum area.
      if (key === 'SUNPACK') {
        patch.minSqft = 0;
        patch.minChargeEnabled = false;
      }
      await svc.set('productConfigs', existing.id, patch);
    }
  }
}

function normalizeFrameSize(width: number, height: number, price: number, order: number): FrameSize {
  return {
    id: frameSeedId(width, height),
    width,
    height,
    label: `${width}×${height}`,
    price,
    active: true,
    sortOrder: order,
    createdAt: iso(),
    updatedAt: iso()
  };
}

/**
 * Idempotent first-run setup. Uses deterministic document IDs and only writes
 * missing documents, so repeated runs on multiple devices never duplicate or
 * overwrite the owner's edits.
 */
export async function seedWorkspace(svc: DataService, email?: string | null): Promise<void> {
  const existingSettings = await svc.get<BusinessSettings & { id: string }>('settings', 'business');
  if (!existingSettings) {
    const access = {
      ...DEFAULT_ACCESS,
      ownerEmail: email || '',
      allowedEmails: email ? [email] : []
    };
    await svc.set('settings', 'business', { ...DEFAULT_SETTINGS, access, id: 'business' });
  } else if (email && !existingSettings.access?.ownerEmail) {
    await svc.set('settings', 'business', {
      access: { ...DEFAULT_ACCESS, ...existingSettings.access, ownerEmail: email, allowedEmails: [email] }
    });
  }

  const products = await svc.query<ProductConfig>('productConfigs');
  await ensureProductConfigs(svc, products);

  const frames = await svc.query<FrameSize>('frameSizes');
  if (frames.length === 0) {
    let order = 0;
    for (const f of FRAME_PRICE_SEED) {
      const row = normalizeFrameSize(f.width, f.height, f.price, order++);
      await svc.set('frameSizes', row.id, row as unknown as Record<string, unknown>);
    }
  }

  const inventory = await svc.query('inventory');
  if (inventory.length === 0) {
    await svc.set('inventory', 'material-flex-roll', {
      name: 'Flex roll (example)',
      unit: 'sq.ft',
      stockQty: 0,
      lowStockAt: 50,
      costPerUnit: 0,
      notes: 'Rename or delete this starter material. Inventory never blocks billing.'
    });
  }
}

export function normalizeSettings(doc?: (Partial<BusinessSettings> & { id?: string }) | null): BusinessSettings {
  const rawPayment = doc?.payment || ({} as Partial<BusinessSettings['payment']>);
  return {
    ...DEFAULT_SETTINGS,
    ...(doc || {}),
    payment: {
      ...DEFAULT_PAYMENT_DETAILS,
      ...rawPayment,
      showQr: rawPayment.showQr !== false,
      showLogos: rawPayment.showLogos !== false,
      qrImage: typeof rawPayment.qrImage === 'string' ? rawPayment.qrImage : DEFAULT_PAYMENT_DETAILS.qrImage
    },
    access: {
      ...DEFAULT_ACCESS,
      ...(doc?.access || {}),
      allowedEmails: Array.isArray(doc?.access?.allowedEmails) ? doc!.access!.allowedEmails : []
    }
  };
}
