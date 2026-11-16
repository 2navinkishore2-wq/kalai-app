/** KALAI DIGITAL — shared domain types. */

export type ProductKey = 'FRAME' | 'FLEX' | 'SUNPACK' | 'VINYL' | 'STAR';
export type PricingMode = 'fixed' | 'sqft';
export type RoundingMode = 'none' | 'nearest' | 'up' | 'down';
export type DiscountType = 'amount' | 'percent';
export type BillStatus = 'paid' | 'partial' | 'credit' | 'cancelled';
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';
export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Other' | 'Credit';
export type ThemeMode = 'light' | 'dark';
export type Language = 'en' | 'ta';

export interface AuthUser {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  isDemo: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  email: string;
  notes: string;
  photo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductConfig {
  id: string;
  key: ProductKey;
  name: string;
  nameTa: string;
  pricingMode: PricingMode;
  /** Rate per pricing basis (per sq.ft when basisSqft=1, per 16 sq.ft when basisSqft=16). */
  rate: number;
  /** Configurable pricing basis in square feet (default 16). */
  basisSqft: number;
  /** Minimum chargeable area in sq.ft (applied only when enabled). */
  minSqft: number;
  minChargeEnabled: boolean;
  rounding: RoundingMode;
  active: boolean;
  /** Optional purchase cost used only for profit estimates. */
  purchaseCostPerSqft: number;
  trackStock: boolean;
  /** Stamp of the opening-rate migration already applied to this product. */
  openingRatesVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FrameSize {
  id: string;
  width: number;
  height: number;
  label: string;
  price: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillItem {
  key: string;
  product: ProductKey;
  label: string;
  widthIn?: number;
  heightIn?: number;
  /** Dimensions exactly as typed, with the unit used on the entry form. */
  widthEntered?: number;
  heightEntered?: number;
  unit?: 'in' | 'cm' | 'ft';
  areaSqft?: number;
  chargeableSqft?: number;
  basisSqft?: number;
  rate: number;
  qty: number;
  amount: number;
  frameSizeId?: string;
  frameSizeLabel?: string;
  /** Frame beading choice recorded on the bill (price unchanged by beading). */
  beading?: string;
  note?: string;
}

export interface BillPayment {
  method: PaymentMethod;
  amount: number;
  date: string;
  reference?: string;
}

export interface CustomerSnapshot {
  name: string;
  phone: string;
  address: string;
  email?: string;
}

export interface Bill {
  id: string;
  number: string;
  /** Bill date, YYYY-MM-DD (local). */
  date: string;
  customerId: string | null;
  customer: CustomerSnapshot;
  items: BillItem[];
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discount: number;
  additionalCharges: number;
  gstEnabled: boolean;
  gstRate: number;
  gstAmount: number;
  total: number;
  paid: number;
  balance: number;
  status: BillStatus;
  payments: BillPayment[];
  note?: string;
  cancelled?: boolean;
  cancelReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  customerId: string | null;
  customerName: string;
  billId: string | null;
  billNumber: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | 'Material Purchase'
  | 'Electricity'
  | 'Rent'
  | 'Transport'
  | 'Labour'
  | 'Maintenance'
  | 'Other';

export interface Expense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  method: PaymentMethod;
  notes: string;
  attachment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  lowStockAt: number;
  costPerUnit: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type StockTxnType = 'purchase' | 'usage' | 'adjustment';

export interface StockTxn {
  id: string;
  inventoryId: string;
  itemName: string;
  type: StockTxnType;
  qty: number;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  entity: 'bill' | 'customer' | 'payment' | 'expense' | 'product' | 'frame' | 'inventory' | 'settings';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'cancel' | 'payment' | 'restore';
  summary: string;
  userId: string;
  userName: string;
  at: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessSettings {
  ownerEmail: string;
  allowedEmails: string[];
  requireAllowlist: boolean;
}

export interface BusinessSettings {
  id?: string;
  nameEn: string;
  nameTa: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  logoUrl: string;
  showLogoOnInvoice: boolean;
  invoiceFooter: string;
  thankYou: string;
  terms: string;
  invoicePrefix: string;
  invoiceStart: number;
  invoiceFormat: string;
  receiptWidth: 58 | 80;
  gstEnabled: boolean;
  gstRate: number;
  gstInclusive: boolean;
  discountEnabled: boolean;
  defaultDiscountType: DiscountType;
  showRateOnInvoice: boolean;
  showSqftOnInvoice: boolean;
  language: Language;
  theme: ThemeMode;
  inventoryEnabled: boolean;
  allowNegativeStock: boolean;
  lowStockAlerts: boolean;
  access: AccessSettings;
}

export interface DashboardStats {
  todaySales: number;
  todayBills: number;
  cashToday: number;
  upiToday: number;
  pending: number;
  customers: number;
  monthSales: number;
  outstanding: number;
  recentBills: Bill[];
  recentCustomers: Customer[];
  recentPayments: Payment[];
}

export interface WhereClause {
  field: string;
  op: '==' | '>' | '>=' | '<' | '<=';
  value: unknown;
}
