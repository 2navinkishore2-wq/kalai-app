import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Bill, BusinessSettings, PaymentSnapshot } from '../lib/types';
import { formatDate } from '../lib/format';
import { absoluteAssetUrl, paymentMobile, paymentSnapshotFor } from '../lib/payment';
import { isNative } from '../lib/platform';
import { saveFile } from './download';
import { pdfSplitTextToSize, pdfText, tableCellForTamil } from './pdfText';

const BRAND: [number, number, number] = [122, 18, 32];
const GOLD: [number, number, number] = [168, 124, 29];
const INK: [number, number, number] = [44, 35, 32];
const MUTED: [number, number, number] = [107, 90, 80];

/** jsPDF's built-in fonts do not contain the ₹ glyph; use a clear ASCII form. */
export function pdfMoney(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function safeFileName(value: string, fallback = 'file'): string {
  const cleaned = (value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || fallback;
}

export function billFileName(bill: Bill, ext: 'pdf' | 'jpg'): string {
  return `${safeFileName(bill.number, 'invoice')}_${safeFileName(bill.customer.name, 'customer')}.${ext}`;
}

export interface QrImage {
  dataUrl: string;
  /** height ÷ width, so the printout never stretches the QR. */
  ratio: number;
}

/**
 * Loads the invoice QR into a PNG data URL for jsPDF. jsPDF cannot embed WebP,
 * and the bundled asset is WebP, so the supplied image is drawn once onto a
 * white canvas. The QR pattern itself is never re-generated or edited.
 */
export async function loadQrImage(value: string): Promise<QrImage | null> {
  const src = absoluteAssetUrl(value);
  if (!src || typeof document === 'undefined') return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('The payment QR image could not be loaded.'));
      el.src = src;
    });
    const width = img.naturalWidth || 640;
    const height = img.naturalHeight || 640;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/png'), ratio: height / width };
  } catch {
    return null;
  }
}

const PAY_BOX_H = 46;

/**
 * Draws the Scan & Pay panel on the A4 invoice. When the owner has not
 * configured a QR the slot stays empty and says so; no QR is ever invented.
 */
function drawPaymentBlock(
  doc: jsPDF,
  payment: PaymentSnapshot,
  qr: QrImage | null,
  fallbackMobile: string,
  left: number,
  right: number,
  top: number
): void {
  doc.setDrawColor(231, 220, 207);
  doc.setLineWidth(0.3);
  doc.roundedRect(left, top, right - left, PAY_BOX_H, 2.4, 2.4, 'S');

  const pad = 3;
  const slotW = 40;
  const slotH = PAY_BOX_H - pad * 2;

  if (qr) {
    let w = slotW;
    let h = w * qr.ratio;
    if (h > slotH) {
      h = slotH;
      w = h / qr.ratio;
    }
    const x = left + pad + (slotW - w) / 2;
    const y = top + pad + (slotH - h) / 2;
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, w, h, 'F');
    doc.addImage(qr.dataUrl, 'PNG', x, y, w, h, undefined, 'FAST');
  } else {
    doc.setDrawColor(205, 192, 178);
    doc.setLineDashPattern([1.1, 1.1], 0);
    doc.rect(left + pad, top + pad, slotW, slotH, 'S');
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text('Payment QR', left + pad + slotW / 2, top + pad + slotH / 2 - 1.5, { align: 'center' });
    doc.text('not configured', left + pad + slotW / 2, top + pad + slotH / 2 + 2.5, { align: 'center' });
  }

  const textX = left + pad + slotW + 5;
  let ty = top + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text('SCAN & PAY', textX, ty);

  ty += 5.5;
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  pdfText(doc, payment.payeeName || 'KALAI DIGITAL', textX, ty);
  doc.setFont('helvetica', 'normal');

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...INK);
  if (payment.upiId) {
    ty += 5;
    doc.text(`UPI: ${payment.upiId}`, textX, ty);
  }
  const mobile = paymentMobile(payment.businessMobile, fallbackMobile);
  if (mobile) {
    ty += 4.6;
    doc.text(`Mobile: ${mobile}`, textX, ty);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...MUTED);
  if (payment.showLogos) {
    ty += 4.4;
    doc.text('Google Pay  ·  PhonePe  ·  Paytm  ·  BHIM  ·  UPI', textX, ty);
  }
  if (payment.footerMessage) {
    ty += 4.2;
    const messageLines = pdfSplitTextToSize(doc, payment.footerMessage, right - textX - pad);
    messageLines.forEach((line, index) => pdfText(doc, line, textX, ty + index * 3.4));
  }

  doc.setFontSize(6.3);
  doc.setTextColor(154, 137, 125);
  doc.text(
    doc.splitTextToSize('Scanning does not confirm payment. Please show the payment success screen.', right - textX - pad) as string[],
    textX,
    top + PAY_BOX_H - 4
  );
}

function statusText(bill: Bill): string {
  if (bill.status === 'paid') return 'PAID';
  if (bill.status === 'partial') return 'PART PAID';
  if (bill.status === 'cancelled') return 'CANCELLED';
  return 'BALANCE DUE';
}

/** Build a clean, text-based A4 invoice PDF (no DOM capture, works offline). */
export function buildInvoicePdf(bill: Bill, settings: BusinessSettings, qr: QrImage | null = null): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = 210;
  const left = 14;
  const right = pageW - 14;

  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 5, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 5, pageW, 1.1, 'F');

  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  pdfText(doc, settings.nameEn || 'KALAI DIGITAL', left, 16);

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  let brandY = 21;
  if (settings.nameTa) {
    pdfText(doc, settings.nameTa, left, brandY);
    brandY += 4.2;
  }
  if (settings.tagline) {
    pdfText(doc, settings.tagline, left, brandY);
    brandY += 4;
  }
  const contact = [settings.address, settings.phone ? `Phone: ${settings.phone}` : '', settings.email, settings.gstin ? `GSTIN: ${settings.gstin}` : '']
    .filter(Boolean)
    .join('  |  ');
  if (contact) {
    const lines = pdfSplitTextToSize(doc, contact, 108);
    lines.forEach((line, index) => pdfText(doc, line, left, brandY + index * 3.8));
  }

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('INVOICE', right, 16, { align: 'right' });
  doc.setFontSize(10);
  doc.setTextColor(...BRAND);
  doc.text(bill.number, right, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(`Date: ${formatDate(bill.date)}`, right, 27, { align: 'right' });
  doc.setTextColor(...(bill.status === 'paid' ? ([31, 122, 77] as [number, number, number]) : bill.status === 'cancelled' ? ([180, 35, 24] as [number, number, number]) : BRAND));
  doc.setFont('helvetica', 'bold');
  doc.text(statusText(bill), right, 32, { align: 'right' });

  const ruleY = Math.max(brandY + 7, 38);
  doc.setDrawColor(220, 203, 187);
  doc.setLineWidth(0.3);
  doc.line(left, ruleY, right, ruleY);

  const partyY = ruleY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GOLD);
  doc.text('BILLED TO', left, partyY);
  doc.text('PAYMENT', right, partyY, { align: 'right' });

  doc.setTextColor(...INK);
  doc.setFontSize(10);
  pdfText(doc, bill.customer.name || 'Walk-in Customer', left, partyY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  let partyLineY = partyY + 10;
  const partyLines = [bill.customer.phone, bill.customer.address, bill.customer.email].filter(Boolean) as string[];
  for (const line of partyLines) {
    const wrapped = pdfSplitTextToSize(doc, line, 100);
    wrapped.forEach((wrappedLine, index) => pdfText(doc, wrappedLine, left, partyLineY + index * 4));
    partyLineY += wrapped.length * 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.setFontSize(9);
  doc.text(`Total: ${pdfMoney(bill.total)}`, right, partyY + 5.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Paid: ${pdfMoney(bill.paid)}`, right, partyY + 10, { align: 'right' });
  doc.text(`Balance: ${pdfMoney(bill.balance)}`, right, partyY + 14.5, { align: 'right' });

  const head = ['#', 'Item', 'Size'];
  if (settings.showSqftOnInvoice) head.push('Sq.ft');
  if (settings.showRateOnInvoice) head.push('Rate');
  head.push('Qty', 'Amount');

  const body = bill.items.map((item, index) => {
    const row: string[] = [
      String(index + 1),
      `${item.label}${item.note ? `\n${item.note}` : ''}`,
      item.product === 'FRAME'
        ? `${item.frameSizeLabel || ''}${item.beading ? `\nBeading: ${item.beading}` : ''}`
        : `${item.widthEntered ?? item.widthIn ?? ''}x${item.heightEntered ?? item.heightIn ?? ''} ${item.unit || 'in'}`
    ];
    if (settings.showSqftOnInvoice) row.push(item.product === 'FRAME' ? '-' : String(item.chargeableSqft ?? item.areaSqft ?? ''));
    if (settings.showRateOnInvoice) {
      row.push(`${pdfMoney(item.rate)}${item.product !== 'FRAME' ? (item.basisSqft === 1 ? ' / sq.ft' : ` / ${item.basisSqft} sq.ft`) : ''}`);
    }
    row.push(String(item.qty), pdfMoney(item.amount));
    return row;
  });

  const columnStyles: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number | 'auto' | 'wrap' }> = {
    0: { cellWidth: 8, halign: 'center' },
    1: { cellWidth: 'auto' },
    2: { cellWidth: 26 },
    [head.length - 2]: { cellWidth: 12, halign: 'right' },
    [head.length - 1]: { cellWidth: 26, halign: 'right' }
  };
  if (settings.showSqftOnInvoice) columnStyles[3] = { cellWidth: 15, halign: 'right' };
  if (settings.showRateOnInvoice) columnStyles[settings.showSqftOnInvoice ? 4 : 3] = { cellWidth: 28, halign: 'right' };

  autoTable(doc, {
    head: [head],
    body,
    startY: Math.max(partyLineY + 4, partyY + 22),
    margin: { left, right: 14 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.2, textColor: INK, lineColor: [234, 223, 210], lineWidth: 0.2, cellPadding: 2.2, valign: 'top' },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [252, 247, 240] },
    columnStyles,
    didParseCell: (data) => {
      tableCellForTamil(doc, data.cell.raw, (font, lines) => {
        data.cell.styles.font = font;
        data.cell.text = lines;
      });
    }
  });

  type WithFinalY = jsPDF & { lastAutoTable?: { finalY: number } };
  let y = ((doc as WithFinalY).lastAutoTable?.finalY || 120) + 6;
  if (y > 238) {
    doc.addPage();
    y = 20;
  }

  const totalsX = 118;
  const totalsW = right - totalsX;
  const addTotal = (label: string, value: string, strong = false) => {
    if (strong) {
      doc.setFillColor(252, 243, 244);
      doc.rect(totalsX, y - 4.2, totalsW, 8, 'F');
    }
    doc.setFont('helvetica', strong ? 'bold' : 'normal');
    doc.setFontSize(strong ? 10 : 8.7);
    doc.setTextColor(...(strong ? BRAND : MUTED));
    doc.text(label, totalsX + 2, y + 0.6);
    doc.setTextColor(...(strong ? BRAND : INK));
    doc.text(value, right - 2, y + 0.6, { align: 'right' });
    y += strong ? 8 : 5.4;
  };

  addTotal('Subtotal', pdfMoney(bill.subtotal));
  if (bill.discount > 0) addTotal('Discount', `- ${pdfMoney(bill.discount)}`);
  if (bill.additionalCharges > 0) addTotal('Additional charges', pdfMoney(bill.additionalCharges));
  if (bill.gstAmount > 0) addTotal(`GST (${bill.gstRate}%)`, pdfMoney(bill.gstAmount));
  addTotal('Grand total', pdfMoney(bill.total), true);
  addTotal('Paid', pdfMoney(bill.paid));
  addTotal('Balance due', pdfMoney(bill.balance), true);

  const noteY = Math.max(y + 2, 208);
  let noteYActual = noteY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (bill.payments.length > 0) {
    doc.setTextColor(...MUTED);
    const payments = bill.payments.map((p) => `${p.method} ${pdfMoney(p.amount)} on ${formatDate(p.date)}`).join('  |  ');
    const lines = pdfSplitTextToSize(doc, `Payments: ${payments}`, 118);
    lines.forEach((line, index) => pdfText(doc, line, left, noteYActual + index * 4));
    noteYActual += lines.length * 4;
  }
  if (bill.note) {
    doc.setTextColor(...MUTED);
    const lines = pdfSplitTextToSize(doc, `Note: ${bill.note}`, 118);
    lines.forEach((line, index) => pdfText(doc, line, left, noteYActual + index * 4));
    noteYActual += lines.length * 4;
  }

  const footerY = 282;

  // Scan & Pay panel, above the footer. Bills issued before 1.4.0 fall back to
  // the current settings because their original QR was never recorded.
  const payment = paymentSnapshotFor(bill, settings);
  if (payment.showQr) {
    let payTop = noteYActual + 7;
    if (payTop + PAY_BOX_H > footerY - 12) {
      doc.addPage();
      payTop = 20;
    }
    drawPaymentBlock(doc, payment, qr, settings.phone, left, right, payTop);
  }

  doc.setDrawColor(234, 223, 210);
  doc.line(left, footerY - 7, right, footerY - 7);
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  pdfText(doc, settings.invoiceFooter || 'Thank you for your business!', left, footerY);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const terms = pdfSplitTextToSize(doc, settings.terms || '', 180);
  terms.slice(0, 2).forEach((line, index) => pdfText(doc, line, left, footerY + 4.2 + index * 3.4));

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setTextColor(...MUTED);
    doc.setFontSize(7);
    pdfText(doc, `${settings.nameEn || 'KALAI DIGITAL'}  ·  ${bill.number}`, left, 292);
    doc.text(`Page ${p} of ${pages}`, right, 292, { align: 'right' });
  }

  return doc;
}

export interface ReportSection {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  numericColumns?: number[];
  summary?: [string, string][];
}

/** Generic report PDF used by Reports and customer statements. */
export function buildReportPdf(title: string, subtitle: string, sections: ReportSection[], settings?: BusinessSettings): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = 210;
  const left = 14;
  const right = pageW - 14;

  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 5, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 5, pageW, 1.1, 'F');

  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  pdfText(doc, settings?.nameEn || 'KALAI DIGITAL', left, 16);
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  if (settings?.nameTa) pdfText(doc, settings.nameTa, left, 21);
  const reportContact = [settings?.address, settings?.phone].filter(Boolean).join('  |  ');
  if (reportContact) pdfText(doc, reportContact, left, settings?.nameTa ? 25 : 21);

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  pdfText(doc, title, right, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const subtitleLines = pdfSplitTextToSize(doc, subtitle, 80);
  subtitleLines.forEach((line, index) => pdfText(doc, line, right, 21 + index * 4, { align: 'right' }));

  let y = Math.max(34, 21 + subtitleLines.length * 4 + 6);
  for (const section of sections) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...BRAND);
    pdfText(doc, section.title, left, y);
    y += 2;

    autoTable(doc, {
      head: [section.columns],
      body: section.rows.length > 0 ? section.rows.map((r) => r.map((c) => String(c))) : [section.columns.map(() => '—')],
      startY: y,
      margin: { left, right: 14 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.8, textColor: INK, lineColor: [234, 223, 210], lineWidth: 0.2, cellPadding: 1.8 },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8 },
      alternateRowStyles: { fillColor: [252, 247, 240] },
      columnStyles: Object.fromEntries((section.numericColumns || []).map((i) => [i, { halign: 'right' as const }])),
      didParseCell: (data) => {
        tableCellForTamil(doc, data.cell.raw, (font, lines) => {
          data.cell.styles.font = font;
          data.cell.text = lines;
        });
      }
    });
    type WithFinalY = jsPDF & { lastAutoTable?: { finalY: number } };
    y = ((doc as WithFinalY).lastAutoTable?.finalY || y) + 6;

    if (section.summary && section.summary.length > 0) {
      for (const [label, value] of section.summary) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        pdfText(doc, label, right - 48, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        pdfText(doc, value, right, y, { align: 'right' });
        y += 4.5;
      }
      y += 2;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, left, 292);
    doc.text(`Page ${p} of ${pages}`, right, 292, { align: 'right' });
  }
  return doc;
}

/**
 * Save the invoice PDF. Uses the native Downloads writer on Android and a
 * normal browser download elsewhere; jsPDF's own save() relies on an anchor
 * download that the Android WebView silently ignores.
 */
export async function downloadInvoicePdf(bill: Bill, settings: BusinessSettings): Promise<'native' | 'browser'> {
  const blob = (await invoicePdfWithQr(bill, settings)).output('blob');
  return saveFile(billFileName(bill, 'pdf'), blob, 'application/pdf');
}

/** Builds the invoice PDF with the bill's own payment QR already embedded. */
export async function invoicePdfWithQr(bill: Bill, settings: BusinessSettings): Promise<jsPDF> {
  const payment = paymentSnapshotFor(bill, settings);
  const qr = payment.showQr ? await loadQrImage(payment.qrImage) : null;
  return buildInvoicePdf(bill, settings, qr);
}

export async function downloadReportPdf(title: string, subtitle: string, sections: ReportSection[], filename: string, settings?: BusinessSettings): Promise<'native' | 'browser'> {
  const blob = buildReportPdf(title, subtitle, sections, settings).output('blob');
  return saveFile(safeFileName(filename, 'report') + '.pdf', blob, 'application/pdf');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the PDF file.'));
    reader.readAsDataURL(blob);
  });
}

/** Share on Android/iOS through the native share sheet; download elsewhere. */
export async function shareInvoicePdf(bill: Bill, settings: BusinessSettings): Promise<void> {
  const doc = await invoicePdfWithQr(bill, settings);
  const blob = doc.output('blob');
  const filename = billFileName(bill, 'pdf');

  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = await blobToBase64(blob);
    const path = `kalai-invoices/${filename}`;
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache, recursive: true });
    const uri = await Filesystem.getUri({ path, directory: Directory.Cache });
    await Share.share({ title: filename, url: uri.uri, dialogTitle: `Share ${bill.number}` });
    return;
  }

  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean; share?: (data?: ShareData) => Promise<void> };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: `Invoice ${bill.number}`, text: `Invoice ${bill.number} — ${settings.nameEn}` });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
