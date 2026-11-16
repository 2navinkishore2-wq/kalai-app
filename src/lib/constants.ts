import type { BusinessSettings, ExpenseCategory, PaymentMethod, ProductConfig, ProductKey } from './types';

export const APP_NAME = 'KALAI DIGITAL';
export const APP_NAME_TA = 'கலை டிஜிட்டல்';
export const APP_TAGLINE = 'Printing · Flex · Photo Frame · Digital Printing';
export const APP_TAGLINE_TA = 'அச்சு · ஃபிளக்ஸ் · போட்டோ பிரேம் · டிஜிட்டல் பிரிண்டிங்';
export const STORAGE_NAMESPACE = 'kalai';

export const PRODUCT_KEYS: ProductKey[] = ['FRAME', 'FLEX', 'SUNPACK', 'VINYL', 'STAR'];

export const PRODUCT_NAMES: Record<ProductKey, { en: string; ta: string }> = {
  FRAME: { en: 'Frame', ta: 'பிரேம்' },
  FLEX: { en: 'Flex', ta: 'ஃபிளக்ஸ்' },
  SUNPACK: { en: 'Sunpack', ta: 'சன்பேக்' },
  VINYL: { en: 'Vinyl', ta: 'வினைல்' },
  STAR: { en: 'Star', ta: 'ஸ்டார்' }
};

export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Bank Transfer', 'Other', 'Credit'];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Material Purchase',
  'Electricity',
  'Rent',
  'Transport',
  'Labour',
  'Maintenance',
  'Other'
];

/**
 * Flex, Vinyl and Star are billed per square foot, in feet on the entry form.
 * These are the shop's opening rates for this release. The one-time migration
 * in seedWorkspace applies them once; later edits in Products & Rates win.
 */
export const SQFT_RATE_PRODUCTS: ProductKey[] = ['FLEX', 'VINYL', 'STAR'];

export const OPENING_SQFT_RATES: Record<'FLEX' | 'VINYL' | 'STAR', number> = {
  FLEX: 16,
  VINYL: 25,
  STAR: 25
};

export type ClothProductKey = keyof typeof OPENING_SQFT_RATES;

export function isClothProduct(key: ProductKey): key is ClothProductKey {
  return key === 'FLEX' || key === 'VINYL' || key === 'STAR';
}

/** Bumping this stamp re-applies the opening rates exactly once per workspace. */
export const OPENING_RATES_VERSION = 1;

/**
 * Frame beading choices. The shop's price chart lists one fixed price per
 * size, so beading is recorded on the bill and never changes the price.
 */
export const FRAME_BEADINGS = [
  { value: '1 inch', label: '1 inch', labelTa: '1 அங்குலம்' },
  { value: '1½ inches', label: '1½ inches', labelTa: '1½ அங்குலம்' },
  { value: '2 inches', label: '2 inches', labelTa: '2 அங்குலம்' }
] as const;

export type FrameBeading = (typeof FRAME_BEADINGS)[number]['value'];

/** Bills saved by 1.2.0 used the singular label; read them without changing history. */
const LEGACY_BEADING_VALUES: Record<string, string> = {
  '1½ inch': '1½ inches'
};

/** Maps a stored beading value onto the current option list (safely, for old bills). */
export function normalizeBeading(value?: string | null): string {
  const raw = (value || '').trim();
  if (!raw) return FRAME_BEADINGS[0].value;
  const mapped = LEGACY_BEADING_VALUES[raw] || raw;
  return FRAME_BEADINGS.some((b) => b.value === mapped) ? mapped : raw;
}

/** Frame prices supplied by the shop's Photo Frame rate chart. Never invented. */
export const FRAME_PRICE_SEED: { width: number; height: number; price: number }[] = [
  { width: 8, height: 6, price: 250 },
  { width: 10, height: 8, price: 350 },
  { width: 12, height: 8, price: 650 },
  { width: 12, height: 10, price: 800 },
  { width: 15, height: 10, price: 900 },
  { width: 15, height: 12, price: 900 },
  { width: 18, height: 12, price: 1200 },
  { width: 24, height: 12, price: 1500 },
  { width: 30, height: 12, price: 1700 },
  { width: 36, height: 12, price: 2000 },
  { width: 16, height: 20, price: 2200 },
  { width: 16, height: 24, price: 2350 },
  { width: 18, height: 24, price: 2500 },
  { width: 20, height: 24, price: 2750 },
  { width: 20, height: 30, price: 2900 },
  { width: 36, height: 24, price: 3500 },
  { width: 30, height: 40, price: 4750 },
  { width: 36, height: 40, price: 5200 },
  { width: 36, height: 48, price: 5750 }
];

export function frameSeedId(width: number, height: number): string {
  return `frame-${width}x${height}`;
}

/** Product seeds. Square-feet rates start at the shop's opening rates; Sunpack stays owner-set. */
export function productSeed(key: ProductKey, now: string): ProductConfig {
  const frame = key === 'FRAME';
  const cloth = isClothProduct(key);
  return {
    id: `product-${key.toLowerCase()}`,
    key,
    name: PRODUCT_NAMES[key].en,
    nameTa: PRODUCT_NAMES[key].ta,
    pricingMode: frame ? 'fixed' : 'sqft',
    rate: cloth ? OPENING_SQFT_RATES[key] : 0,
    basisSqft: cloth ? 1 : 16,
    minSqft: 0,
    minChargeEnabled: false,
    rounding: 'nearest',
    active: true,
    purchaseCostPerSqft: 0,
    trackStock: false,
    openingRatesVersion: cloth ? OPENING_RATES_VERSION : undefined,
    createdAt: now,
    updatedAt: now
  };
}

export const DEFAULT_ACCESS = {
  ownerEmail: '',
  allowedEmails: [] as string[],
  requireAllowlist: false
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  id: 'business',
  nameEn: 'KALAI DIGITAL',
  nameTa: 'கலை டிஜிட்டல்',
  tagline: 'Printing · Flex · Photo Frame · Digital Printing',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  logoUrl: './logo.png',
  showLogoOnInvoice: true,
  invoiceFooter: 'Thank you for your business!',
  thankYou: 'நன்றி! வணக்கம்.',
  terms: 'Goods once sold are not returnable. Please check sizes and spellings before printing.',
  invoicePrefix: 'KD',
  invoiceStart: 1,
  invoiceFormat: '{PREFIX}-{YYYY}-{SEQ}',
  receiptWidth: 80,
  gstEnabled: false,
  gstRate: 18,
  gstInclusive: false,
  discountEnabled: true,
  defaultDiscountType: 'amount',
  showRateOnInvoice: true,
  showSqftOnInvoice: true,
  language: 'en',
  theme: 'light',
  inventoryEnabled: false,
  allowNegativeStock: false,
  lowStockAlerts: true,
  access: DEFAULT_ACCESS
};

export const DATE_FORMAT = 'dd MMM yyyy';
