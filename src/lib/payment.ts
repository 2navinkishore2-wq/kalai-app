import type { Bill, BusinessSettings, PaymentDetails, PaymentSnapshot } from './types';
import { isValidPhone } from './format';

/** Firestore documents have a 1 MiB limit; keep the QR well below it. */
export const MAX_PAYMENT_QR_CHARS = 700_000;

/**
 * Payment methods that a UPI QR can serve. These are plain text labels — no
 * third-party logo artwork is bundled — so the invoice never implies that a
 * payment has been received.
 */
export const PAYMENT_APPS: { id: string; label: string }[] = [
  { id: 'gpay', label: 'Google Pay' },
  { id: 'phonepe', label: 'PhonePe' },
  { id: 'paytm', label: 'Paytm' },
  { id: 'bhim', label: 'BHIM' },
  { id: 'upi', label: 'UPI' }
];

/** A safe copy of the current settings, frozen onto a new bill. */
export function snapshotPayment(settings: BusinessSettings): PaymentSnapshot {
  const p = settings.payment;
  return {
    showQr: p?.showQr !== false,
    businessMobile: p?.businessMobile || '',
    upiId: p?.upiId || '',
    payeeName: p?.payeeName || settings.nameEn || 'KALAI DIGITAL',
    qrImage: p?.qrImage || '',
    showLogos: p?.showLogos !== false,
    footerMessage: p?.footerMessage || 'Scan & pay with any UPI app',
    capturedAt: new Date().toISOString()
  };
}

/**
 * Bills issued from 1.4.0 carry their own payment snapshot. Older bills fall
 * back to the current settings because their original QR was never recorded.
 */
export function paymentSnapshotFor(bill: Bill, settings: BusinessSettings): PaymentSnapshot {
  if (bill.payment) {
    return {
      ...snapshotPayment(settings),
      ...bill.payment,
      capturedAt: bill.payment.capturedAt || bill.createdAt || ''
    };
  }
  return snapshotPayment(settings);
}

/** Resolves a bundled asset or data URL for use in <img> and print documents. */
export function paymentQrSrc(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (/^(data:|https?:|blob:)/i.test(raw)) return raw;
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';
  return `${base}${raw.replace(/^\.?\//, '')}`;
}

/** Absolute URL for iframe-printed HTML, where relative URLs would not resolve. */
export function absoluteAssetUrl(value: string): string {
  const raw = paymentQrSrc(value);
  if (!raw) return '';
  if (/^(data:|https?:|blob:)/i.test(raw)) return raw;
  if (typeof document !== 'undefined') {
    try {
      return new URL(raw, document.baseURI).href;
    } catch {
      /* fall through */
    }
  }
  return raw;
}

/** UPI IDs look like `name@bank`; empty is allowed when QR is disabled. */
export function isValidUpiId(value: string): boolean {
  const v = (value || '').trim();
  if (!v) return true;
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{1,64}$/.test(v);
}

export function paymentMobile(value: string, fallback = ''): string {
  const raw = (value || '').trim() || (fallback || '').trim();
  return raw;
}

export function isValidBusinessMobile(value: string): boolean {
  const v = (value || '').trim();
  if (!v) return true;
  if (!isValidPhone(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
}

export function paymentDestinationChanged(current: PaymentDetails, next: PaymentDetails): boolean {
  return (current.upiId || '').trim() !== (next.upiId || '').trim() || (current.qrImage || '') !== (next.qrImage || '');
}

export interface PaymentChangeSummary {
  upiChanged: boolean;
  qrChanged: boolean;
  destinationChanges: boolean;
}

export function describePaymentChange(current: PaymentDetails, next: PaymentDetails): PaymentChangeSummary {
  const upiChanged = (current.upiId || '').trim() !== (next.upiId || '').trim();
  const qrChanged = (current.qrImage || '') !== (next.qrImage || '');
  return { upiChanged, qrChanged, destinationChanges: upiChanged || qrChanged };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image.'));
    img.src = src;
  });
}

/**
 * Reads an uploaded QR image into a durable data URL. The image is only
 * resized (never cropped, redrawn or re-encoded with new payment data), and a
 * white matte is applied so transparent PNGs print with a proper quiet zone.
 */
export async function readPaymentQrFile(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error('Choose a PNG, JPG or WebP image of your payment QR.');
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error('The image is larger than 6 MB. Choose a smaller QR image.');
  }
  const source = await fileToDataUrl(file);
  const img = await loadImage(source);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('That file is not a readable image.');

  const maxEdge = 900;
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device cannot process images.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  let result = canvas.toDataURL('image/png');
  if (result.length > MAX_PAYMENT_QR_CHARS) {
    result = canvas.toDataURL('image/jpeg', 0.9);
  }
  if (result.length > MAX_PAYMENT_QR_CHARS) {
    throw new Error('The processed QR image is too large to store. Upload a tighter crop of the QR code.');
  }
  return result;
}
