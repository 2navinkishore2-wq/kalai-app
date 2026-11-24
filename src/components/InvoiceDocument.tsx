import type { Bill, BusinessSettings } from '../lib/types';
import { formatDate, formatINR } from '../lib/format';
import { logoSrc } from '../lib/logo';
import { PaymentBlock } from './PaymentBlock';

export function InvoiceDocument({ bill, settings }: { bill: Bill; settings: BusinessSettings }) {
  const showRate = settings.showRateOnInvoice;
  const showSqft = settings.showSqftOnInvoice;
  const logoSrcValue = settings.logoUrl || logoSrc();
  return (
    <article className="invoice-doc" id="invoice-document">
      <div className="inv-head">
        <div className="inv-brand">
          {settings.showLogoOnInvoice ? <img src={logoSrcValue} alt="KALAI DIGITAL logo" /> : null}
          <div>
            <h2>{settings.nameEn || 'KALAI DIGITAL'}</h2>
            <div className="ta">{settings.nameTa || 'கலை டிஜிட்டல்'}</div>
            <div className="meta">
              {settings.address ? <>{settings.address}<br /></> : null}
              {settings.phone ? <>Phone: {settings.phone}<br /></> : null}
              {settings.email ? <>{settings.email}<br /></> : null}
              {settings.gstin ? <>GSTIN: {settings.gstin}</> : null}
            </div>
          </div>
        </div>
        <div className="inv-title">
          <div className="label">INVOICE</div>
          <div className="no">{bill.number}</div>
          <div className="date">{formatDate(bill.date)}</div>
          {bill.status === 'cancelled' ? <div className="date" style={{ color: '#b42318', fontWeight: 700 }}>CANCELLED</div> : null}
        </div>
      </div>

      <div className="inv-parties">
        <div className="block">
          <div className="cap">Billed to</div>
          <b>{bill.customer.name || 'Walk-in Customer'}</b>
          {bill.customer.phone ? <div>{bill.customer.phone}</div> : null}
          {bill.customer.address ? <div>{bill.customer.address}</div> : null}
          {bill.customer.email ? <div>{bill.customer.email}</div> : null}
        </div>
        <div className="block" style={{ textAlign: 'right' }}>
          <div className="cap">Payment</div>
          <b>{bill.status === 'paid' ? 'PAID' : bill.status === 'partial' ? 'PART PAID' : 'BALANCE DUE'}</b>
          <div>Paid {formatINR(bill.paid)}</div>
          <div>Balance {formatINR(bill.balance)}</div>
        </div>
      </div>

      <table className="inv-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>Item</th>
            <th>Size</th>
            {showSqft ? <th className="num">Sq.ft</th> : null}
            {showRate ? <th className="num">Rate</th> : null}
            <th className="num">Qty</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((it, i) => (
            <tr key={it.key}>
              <td data-label="#">{i + 1}</td>
              <td data-label="Item">
                <b>{it.label}</b>
                {it.note ? <div style={{ color: '#6b5a50', fontSize: 9.5 }}>{it.note}</div> : null}
              </td>
              <td data-label="Size">
                {it.product === 'FRAME' ? (
                  <>
                    {it.frameSizeLabel}
                    {it.beading ? <div style={{ color: '#6b5a50', fontSize: 9.5 }}>Beading: {it.beading}</div> : null}
                  </>
                ) : (
                  `${it.widthEntered ?? it.widthIn}×${it.heightEntered ?? it.heightIn} ${it.unit || 'in'}`
                )}
              </td>
              {showSqft ? <td className="num" data-label="Sq.ft">{it.product === 'FRAME' ? '—' : it.areaSqft}</td> : null}
              {showRate ? <td className="num" data-label="Rate">{formatINR(it.rate)}{it.product !== 'FRAME' ? (it.basisSqft === 1 ? ' / sq.ft' : ` / ${it.basisSqft} sq.ft`) : ''}</td> : null}
              <td className="num" data-label="Qty">{it.qty}</td>
              <td className="num" data-label="Amount"><b>{formatINR(it.amount)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-totals">
        <div className="rowx"><span>Subtotal</span><span>{formatINR(bill.subtotal)}</span></div>
        {bill.discount > 0 ? <div className="rowx"><span>Discount</span><span>− {formatINR(bill.discount)}</span></div> : null}
        {bill.additionalCharges > 0 ? <div className="rowx"><span>Additional charges</span><span>{formatINR(bill.additionalCharges)}</span></div> : null}
        {bill.gstAmount > 0 ? <div className="rowx"><span>GST ({bill.gstRate}%)</span><span>{formatINR(bill.gstAmount)}</span></div> : null}
        <div className="rowx grand"><span>Total</span><span>{formatINR(bill.total)}</span></div>
        <div className="rowx"><span>Paid</span><span>{formatINR(bill.paid)}</span></div>
        <div className="rowx"><span>Balance</span><span>{formatINR(bill.balance)}</span></div>
      </div>

      <PaymentBlock bill={bill} settings={settings} />

      {bill.payments.length > 0 ? (
        <div style={{ marginTop: 12, fontSize: 10, color: '#4a3a32' }}>
          <b>Payments:</b> {bill.payments.map((p) => `${p.method} ${formatINR(p.amount)} on ${formatDate(p.date)}`).join(' · ')}
          {bill.payments.some((p) => p.reference) ? <div>Ref: {bill.payments.filter((p) => p.reference).map((p) => p.reference).join(', ')}</div> : null}
        </div>
      ) : null}

      {bill.note ? <div style={{ marginTop: 8, fontSize: 10, color: '#4a3a32' }}><b>Note:</b> {bill.note}</div> : null}

      <div className="inv-foot">
        <div>
          <div className="inv-thanks">{settings.invoiceFooter || 'Thank you for your business!'}</div>
          <div style={{ color: '#a87c1d', marginTop: 2 }}>{settings.thankYou}</div>
        </div>
        <div className="inv-terms">{settings.terms}</div>
      </div>
    </article>
  );
}
