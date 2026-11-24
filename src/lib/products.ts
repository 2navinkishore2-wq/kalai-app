/**
 * KALAI DIGITAL — product configuration (rates + availability).
 *
 * One place decides how a stored `productConfigs` document becomes the
 * ProductConfig the rest of the app bills with. The rules that matter:
 *
 *  - A product is only unavailable when a stored flag explicitly says so.
 *    A missing/null activation field means "enabled" (older releases never
 *    wrote one), never "disabled".
 *  - Identity fields (key/name/nameTa) are always restored from the product
 *    key, so a partial historical write can never make a product disappear
 *    from New Bill (which used to render "Flex (off)" for all four products).
 *  - A saved rate is never replaced by a default. Defaults only fill a rate
 *    that was never configured.
 */

import { OPENING_SQFT_RATES, PRODUCT_KEYS, PRODUCT_NAMES, isSqftProduct, productSeed } from './constants';
import { round2 } from './money';
import type { PricingMode, ProductConfig, ProductKey, RoundingMode } from './types';

/** Stamped on every migrated/saved product document. Bump to re-run a repair. */
export const PRODUCT_CONFIG_VERSION = 1;

/** Deterministic seed timestamp so normalisation is pure and repeatable. */
const EPOCH = '1970-01-01T00:00:00.000Z';

export type RawProduct = Partial<ProductConfig> & { id?: string };

/** Reads a field that may not exist in the current schema. */
function field(raw: RawProduct, name: string): unknown {
  return (raw as Record<string, unknown>)[name];
}

const ROUNDING_MODES: RoundingMode[] = ['none', 'nearest', 'up', 'down'];

const FALSE_WORDS = new Set(['inactive', 'disabled', 'off', 'false', '0', 'no', 'paused', 'hidden']);
const TRUE_WORDS = new Set(['active', 'enabled', 'on', 'true', '1', 'yes', 'available']);

function boolish(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : undefined;
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase();
    if (FALSE_WORDS.has(word)) return false;
    if (TRUE_WORDS.has(word)) return true;
  }
  return undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function finite(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Reads activation from every field name the app has used over time.
 * `active` wins, then `isActive`, then `enabled`/`billingEnabled`, then
 * `status`. Missing data returns `undefined` — distinct from `false`.
 */
export function resolveProductActive(raw: RawProduct | null | undefined): boolean | undefined {
  if (!raw) return undefined;
  for (const name of ['active', 'isActive', 'billingEnabled', 'enabled', 'status']) {
    const value = boolish(field(raw, name));
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Maps a stored document onto one of the five product keys. */
export function productKeyFromDoc(raw: RawProduct | null | undefined): ProductKey | null {
  if (!raw) return null;
  const rawKey = text(raw.key).toUpperCase();
  if ((PRODUCT_KEYS as string[]).includes(rawKey)) return rawKey as ProductKey;
  const id = text(raw.id).toLowerCase();
  const byId = PRODUCT_KEYS.find((key) => id === `product-${key.toLowerCase()}` || id === key.toLowerCase());
  if (byId) return byId;
  const name = text(raw.name).toLowerCase();
  const byName = PRODUCT_KEYS.find((key) => PRODUCT_NAMES[key].en.toLowerCase() === name);
  return byName || null;
}

export function canonicalProductId(key: ProductKey): string {
  return `product-${key.toLowerCase()}`;
}

/**
 * Produces a complete ProductConfig. Never mutates and never throws, so an
 * unreadable record degrades to the shop's opening configuration instead of
 * a blank/broken product.
 */
export function normalizeProductConfig(raw: RawProduct | null | undefined, key: ProductKey): ProductConfig {
  const seed = productSeed(key, EPOCH);
  const frame = key === 'FRAME';
  const source = raw || {};

  let rate = finite(source.rate) ?? (isSqftProduct(key) ? OPENING_SQFT_RATES[key] : seed.rate);
  let basisSqft = finite(source.basisSqft);
  if (frame) {
    basisSqft = basisSqft && basisSqft > 0 ? basisSqft : 16;
  } else if (basisSqft && basisSqft > 1) {
    // A legacy "₹ per 16 sq.ft" rate is the same money as rate ÷ basis per
    // sq.ft. Converting keeps the price identical instead of multiplying it.
    rate = round2(rate / basisSqft);
    basisSqft = 1;
  } else {
    basisSqft = 1;
  }

  const roundingValue = text(source.rounding) as RoundingMode;
  const pricingMode: PricingMode = frame ? 'fixed' : 'sqft';
  const minSqft = finite(source.minSqft);
  const purchaseCost = finite(source.purchaseCostPerSqft);
  const openingVersion = finite(source.openingRatesVersion);
  const configVersion = finite(source.configVersion);

  return {
    id: text(source.id) || seed.id,
    key,
    name: text(source.name) || seed.name,
    nameTa: text(source.nameTa) || seed.nameTa,
    pricingMode,
    rate: Math.max(0, rate),
    basisSqft,
    minSqft: minSqft != null && minSqft >= 0 ? minSqft : 0,
    minChargeEnabled: !frame && source.minChargeEnabled === true,
    rounding: ROUNDING_MODES.includes(roundingValue) ? roundingValue : 'nearest',
    // Only an explicit false disables a product. Undefined/null/legacy data
    // must stay billable.
    active: resolveProductActive(source) ?? true,
    purchaseCostPerSqft: purchaseCost != null && purchaseCost >= 0 ? purchaseCost : 0,
    trackStock: source.trackStock === true,
    openingRatesVersion: openingVersion,
    configVersion,
    createdAt: text(source.createdAt) || EPOCH,
    updatedAt: text(source.updatedAt) || EPOCH
  };
}

function docScore(raw: RawProduct, key: ProductKey): number {
  let score = 0;
  if (text(raw.id) === canonicalProductId(key)) score += 4;
  if (text(raw.key).toUpperCase() === key) score += 2;
  if (text(raw.name)) score += 1;
  return score;
}

/**
 * Builds the five-product list the app bills with. Every key is always
 * present; duplicate/legacy documents are resolved deterministically
 * (canonical document first, then the most recently updated one).
 */
export function buildProductList(docs: RawProduct[] | null | undefined): ProductConfig[] {
  const list = Array.isArray(docs) ? docs : [];
  const chosen = new Map<ProductKey, RawProduct>();

  for (const doc of list) {
    if (!doc || typeof doc !== 'object') continue;
    const key = productKeyFromDoc(doc);
    if (!key) continue;
    const current = chosen.get(key);
    if (!current) {
      chosen.set(key, doc);
      continue;
    }
    const score = docScore(doc, key);
    const currentScore = docScore(current, key);
    const updatedAt = text(doc.updatedAt);
    const currentUpdatedAt = text(current.updatedAt);
    if (score > currentScore || (score === currentScore && updatedAt > currentUpdatedAt)) {
      chosen.set(key, doc);
    }
  }

  return PRODUCT_KEYS.map((key) => normalizeProductConfig(chosen.get(key), key));
}

/**
 * The exact document a rate save writes. It carries every identity and
 * configuration field, so saving a rate can never drop `key`, `active` or any
 * other property, and it is merge-safe against older documents.
 */
export function productRateFields(product: ProductConfig, rate: number, active: boolean): Record<string, unknown> {
  const frame = product.key === 'FRAME';
  return {
    key: product.key,
    name: product.name,
    nameTa: product.nameTa,
    pricingMode: frame ? 'fixed' : 'sqft',
    rate: frame ? product.rate : rate,
    basisSqft: frame ? product.basisSqft : 1,
    minSqft: frame ? product.minSqft : 0,
    minChargeEnabled: frame ? product.minChargeEnabled : false,
    rounding: product.rounding,
    active,
    purchaseCostPerSqft: product.purchaseCostPerSqft,
    trackStock: product.trackStock,
    configVersion: PRODUCT_CONFIG_VERSION
  };
}

/**
 * Patch that repairs a legacy/partial record. Returns null when the record is
 * already current, which makes the migration idempotent. A valid saved rate is
 * never included, so a stale device cannot overwrite a newer rate.
 */
export function productMigrationPatch(raw: RawProduct | null | undefined, product: ProductConfig): Record<string, unknown> | null {
  if (!raw) return null;
  const version = finite(raw.configVersion);
  if (version != null && version >= PRODUCT_CONFIG_VERSION) return null;

  const patch: Record<string, unknown> = {
    key: product.key,
    name: product.name,
    nameTa: product.nameTa,
    pricingMode: product.pricingMode,
    basisSqft: product.basisSqft,
    minSqft: product.minSqft,
    minChargeEnabled: product.minChargeEnabled,
    rounding: product.rounding,
    // Resolved activation: explicit false is preserved, missing becomes true.
    active: product.active,
    purchaseCostPerSqft: product.purchaseCostPerSqft,
    trackStock: product.trackStock,
    configVersion: PRODUCT_CONFIG_VERSION
  };

  const storedRate = finite(raw.rate);
  const storedBasis = finite(raw.basisSqft);
  const needsRate = product.key !== 'FRAME' && (storedRate == null || (storedBasis != null && storedBasis > 1));
  if (needsRate) patch.rate = product.rate;

  return patch;
}

/** True when a product must not be offered on a new bill. */
export function isProductUnavailable(product: ProductConfig | null | undefined): boolean {
  return product?.active === false;
}
