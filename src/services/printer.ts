import type { Bill, BusinessSettings } from '../lib/types';
import { formatDate, formatINR } from '../lib/format';
import { logoSrc } from '../lib/logo';
import { absoluteAssetUrl, paymentMobile, paymentSnapshotFor } from '../lib/payment';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function receiptHtml(bill: Bill, settings: BusinessSettings): string {
  const width = settings.receiptWidth === 58 ? 58 : 80;
  const items = bill.items
    .map(
      (item, index) => `
        <tr>
          <td class="idx">${index + 1}</td>
          <td class="item">
            <div class="nm">${esc(item.label)}</div>
            <div class="meta">${esc(
              item.product === 'FRAME'
                ? `${item.frameSizeLabel || ''}${item.beading ? ` · Beading: ${item.beading}` : ''}`
                : `${item.widthEntered ?? item.widthIn ?? ''} x ${item.heightEntered ?? item.heightIn ?? ''} ${item.unit || 'in'}${item.chargeableSqft ? ` · ${item.chargeableSqft} sq.ft` : ''}`
            )}</div>
            <div class="meta">${item.qty} x ${esc(formatINR(item.rate))}${item.product !== 'FRAME' ? (item.basisSqft === 1 ? ' / sq.ft' : ` / ${item.basisSqft} sq.ft`) : ''}</div>
          </td>
          <td class="amt">${esc(formatINR(item.amount))}</td>
        </tr>`
    )
    .join('');

  const rows: string[] = [];
  rows.push(`<div class="row"><span>Subtotal</span><span>${esc(formatINR(bill.subtotal))}</span></div>`);
  if (bill.discount > 0) rows.push(`<div class="row"><span>Discount</span><span>- ${esc(formatINR(bill.discount))}</span></div>`);
  if (bill.additionalCharges > 0) rows.push(`<div class="row"><span>Additional</span><span>${esc(formatINR(bill.additionalCharges))}</span></div>`);
  if (bill.gstAmount > 0) rows.push(`<div class="row"><span>GST ${bill.gstRate}%</span><span>${esc(formatINR(bill.gstAmount))}</span></div>`);
  rows.push(`<div class="row total"><span>TOTAL</span><span>${esc(formatINR(bill.total))}</span></div>`);
  rows.push(`<div class="row"><span>Paid</span><span>${esc(formatINR(bill.paid))}</span></div>`);
  rows.push(`<div class="row strong"><span>Balance</span><span>${esc(formatINR(bill.balance))}</span></div>`);

  // The bill's own payment snapshot: an old receipt never starts pointing at a
  // QR or UPI ID that was changed after the bill was issued.
  const payment = paymentSnapshotFor(bill, settings);
  const qrSrc = payment.showQr ? absoluteAssetUrl(payment.qrImage) : '';
  const payMobile = paymentMobile(payment.businessMobile, settings.phone);
  const payBlock = payment.showQr
    ? `<div class="sep"></div>
  <div class="qr-block">
    ${qrSrc
      ? `<img class="qr" src="${esc(qrSrc)}" alt="UPI payment QR">`
      : `<div class="qr-missing">Payment QR not configured</div>`}
    <div class="qr-cap">SCAN &amp; PAY</div>
    ${payment.upiId ? `<div class="qr-line">UPI: <b>${esc(payment.upiId)}</b></div>` : ''}
    ${payMobile ? `<div class="qr-line">Mobile: ${esc(payMobile)}</div>` : ''}
    ${payment.showLogos ? `<div class="qr-line">Google Pay · PhonePe · Paytm · BHIM</div>` : ''}
    ${payment.footerMessage ? `<div class="qr-line">${esc(payment.footerMessage)}</div>` : ''}
    <div class="qr-note">Scanning does not confirm payment.</div>
  </div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(bill.number)}</title>
<style>
  @page { size: ${width}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; color: #000; background: #fff; font-family: 'Courier New', monospace; font-size: ${width === 58 ? 8 : 9}px; line-height: 1.25; }
  .wrap { width: ${width - 4}mm; margin: 0 auto; }
  .logo { display: block; width: ${width === 58 ? 16 : 20}mm; margin: 0 auto 1mm; filter: grayscale(1); }
  h1 { font-size: ${width === 58 ? 11 : 13}px; text-align: center; margin: 0; letter-spacing: .4px; }
  .ta { text-align: center; font-size: ${width === 58 ? 7.4 : 8.2}px; margin-top: .5mm; }
  .meta { text-align: center; font-size: ${width === 58 ? 7 : 7.8}px; margin-top: .5mm; }
  .sep { border-top: 1px dashed #000; margin: 1.5mm 0; }
  .row { display: flex; justify-content: space-between; gap: 2mm; }
  .row.total { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: .8mm 0; font-weight: 700; font-size: ${width === 58 ? 9.5 : 10.5}px; margin: .8mm 0; }
  .row.strong { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: .5mm 0; }
  .idx { width: 4mm; }
  .item { padding-right: 1.5mm; }
  .nm { font-weight: 700; }
  .meta { text-align: left; font-size: ${width === 58 ? 6.6 : 7.2}px; }
  .amt { text-align: right; white-space: nowrap; font-weight: 600; }
  .center { text-align: center; }
  .thanks { text-align: center; margin-top: 1.5mm; font-size: ${width === 58 ? 7 : 7.8}px; }
  .terms { margin-top: 1mm; font-size: ${width === 58 ? 6.2 : 6.8}px; text-align: center; }
  .status { text-align: center; font-weight: 700; margin: .8mm 0; letter-spacing: .5px; }
  .pay { font-size: ${width === 58 ? 6.4 : 7}px; margin-top: .8mm; }
  .qr-block { text-align: center; margin-top: 1mm; }
  .qr { display: block; width: ${width === 58 ? 30 : 42}mm; height: auto; margin: 0 auto .8mm; }
  .qr-missing { border: 1px dashed #000; padding: 3mm 1mm; font-size: ${width === 58 ? 6.4 : 7}px; margin: 0 auto .8mm; width: ${width === 58 ? 30 : 42}mm; }
  .qr-cap { font-weight: 700; letter-spacing: .5px; font-size: ${width === 58 ? 7.4 : 8.2}px; }
  .qr-line { font-size: ${width === 58 ? 6.4 : 7}px; margin-top: .4mm; word-break: break-word; }
  .qr-note { font-size: ${width === 58 ? 5.8 : 6.2}px; margin-top: .5mm; }
</style></head>
<body><div class="wrap">
  ${settings.showLogoOnInvoice ? `<img class="logo" src="${esc(settings.logoUrl || logoSrc())}" alt="">` : ''}
  <h1>${esc(settings.nameEn || 'KALAI DIGITAL')}</h1>
  <div class="ta">${esc(settings.nameTa || '')}</div>
  ${settings.address ? `<div class="meta">${esc(settings.address)}</div>` : ''}
  ${settings.phone || settings.email ? `<div class="meta">${esc([settings.phone, settings.email].filter(Boolean).join(' · '))}</div>` : ''}
  ${settings.gstin ? `<div class="meta">GSTIN: ${esc(settings.gstin)}</div>` : ''}
  <div class="sep"></div>
  <div class="row"><span>Bill</span><span><b>${esc(bill.number)}</b></span></div>
  <div class="row"><span>Date</span><span>${esc(formatDate(bill.date))}</span></div>
  <div class="row"><span>Customer</span><span>${esc(bill.customer.name || 'Walk-in Customer')}</span></div>
  ${bill.customer.phone ? `<div class="row"><span>Mobile</span><span>${esc(bill.customer.phone)}</span></div>` : ''}
  <div class="status">${bill.status === 'cancelled' ? 'CANCELLED' : bill.status === 'paid' ? 'PAID' : bill.status === 'partial' ? 'PART PAID' : 'BALANCE DUE'}</div>
  <div class="sep"></div>
  <table><tbody>${items}</tbody></table>
  <div class="sep"></div>
  ${rows.join('')}
  ${bill.payments.length > 0 ? `<div class="pay">Payments: ${esc(bill.payments.map((p) => `${p.method} ${formatINR(p.amount)} ${formatDate(p.date)}`).join(', '))}</div>` : ''}
  ${bill.note ? `<div class="pay">Note: ${esc(bill.note)}</div>` : ''}
  ${payBlock}
  <div class="sep"></div>
  <div class="thanks">${esc(settings.invoiceFooter || settings.thankYou || 'Thank you!')}</div>
  <div class="terms">${esc(settings.terms || '')}</div>
</div></body></html>`;
}

function printHtml(html: string, title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const frame = document.createElement('iframe');
      frame.setAttribute('title', title);
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      document.body.appendChild(frame);

      const cleanup = () => {
        setTimeout(() => frame.remove(), 1500);
      };

      const run = () => {
        const win = frame.contentWindow;
        if (!win) {
          cleanup();
          reject(new Error('Could not open the print preview.'));
          return;
        }
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        win.onafterprint = finish;
        try {
          win.focus();
          win.print();
        } catch (e) {
          finish();
          reject(new Error(`Printing is not available on this device: ${(e as Error).message}`));
          return;
        }
        // Some WebViews never fire afterprint; resolve so the bill flow continues.
        setTimeout(finish, 1800);
      };

      const doc = frame.contentDocument;
      if (!doc) {
        cleanup();
        reject(new Error('Could not prepare the print document.'));
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
      if (doc.readyState === 'complete') setTimeout(run, 120);
      else frame.onload = () => setTimeout(run, 120);
    } catch (e) {
      reject(new Error(`Could not prepare printing: ${(e as Error).message}`));
    }
  });
}

/** 58 mm / 80 mm thermal-style receipt through the platform print dialog. */
export async function printThermalReceipt(bill: Bill, settings: BusinessSettings): Promise<void> {
  if (typeof window === 'undefined' || typeof window.print !== 'function') {
    throw new Error('Printing is not supported in this environment.');
  }
  await printHtml(receiptHtml(bill, settings), `${bill.number} receipt`);
}

/** A4 / system print. Uses the invoice already rendered on the Bill screen. */
export function printInvoiceDocument(_bill: Bill, _settings: BusinessSettings): void {
  window.print();
}

export function printerSupportNote(): string {
  return 'Printing uses the operating system print dialog. Choose a Bluetooth, USB or network printer installed on this device. ESC/POS direct commands are not enabled in this build, so a printer that exposes a Windows/Android print service is required.';
}
