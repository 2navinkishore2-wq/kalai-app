import type { Bill, BusinessSettings, PaymentSnapshot } from '../lib/types';
import { PAYMENT_APPS, paymentMobile, paymentQrSrc, paymentSnapshotFor } from '../lib/payment';

/**
 * The invoice payment section. It is informational: scanning the QR does not
 * prove that money was received, so the copy never claims that it was.
 */
export function PaymentPanel({
  payment,
  businessName,
  fallbackMobile
}: {
  payment: PaymentSnapshot;
  businessName: string;
  fallbackMobile?: string;
}) {
  const qr = paymentQrSrc(payment.qrImage);
  const mobile = paymentMobile(payment.businessMobile, fallbackMobile);
  const name = payment.payeeName || businessName || 'KALAI DIGITAL';

  return (
    <section className="inv-pay" aria-label="UPI payment details">
      <div className="inv-pay-qr">
        {qr ? (
          <img src={qr} alt="UPI payment QR code" />
        ) : (
          <div className="inv-qr-missing">
            <span>Payment QR</span>
            <b>not configured</b>
          </div>
        )}
      </div>
      <div className="inv-pay-info">
        <div className="inv-pay-cap">Scan &amp; Pay</div>
        <div className="inv-pay-name">{name}</div>
        {payment.upiId ? (
          <div className="inv-pay-row">
            <span>UPI ID</span>
            <b className="mono">{payment.upiId}</b>
          </div>
        ) : null}
        {mobile ? (
          <div className="inv-pay-row">
            <span>Mobile</span>
            <b className="mono">{mobile}</b>
          </div>
        ) : null}
        {payment.showLogos ? (
          <div className="inv-pay-apps" aria-label="Supported UPI apps">
            {PAYMENT_APPS.map((app) => (
              <span key={app.id} className={`pay-app pay-app-${app.id}`}>{app.label}</span>
            ))}
          </div>
        ) : null}
        {payment.footerMessage ? <div className="inv-pay-note">{payment.footerMessage}</div> : null}
        <div className="inv-pay-brand">{businessName || 'KALAI DIGITAL'}</div>
        <div className="inv-pay-disclaimer">Scanning does not confirm payment. Please show the payment success screen.</div>
      </div>
    </section>
  );
}

export function PaymentBlock({ bill, settings }: { bill: Bill; settings: BusinessSettings }) {
  const payment = paymentSnapshotFor(bill, settings);
  if (!payment.showQr) return null;
  return <PaymentPanel payment={payment} businessName={settings.nameEn} fallbackMobile={settings.phone} />;
}
