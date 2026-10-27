import { useTranslation } from 'react-i18next';
import { kwd } from '../../../lib/format';

const Row = ({ label, value, strong }) => (
  <div className={`flex justify-between ${strong ? 'border-t border-hairline pt-2.5' : ''}`}>
    <span className={strong ? 'font-extrabold' : 'text-ink-soft'}>{label}</span>
    <span className={strong ? 'font-extrabold' : 'font-medium'}>{value}</span>
  </div>
);

/** The money, as the server will charge it: items, voucher, delivery, service charge, tax, tip and the total. */
export default function PaymentSummary({ subtotal, discount, isPickup, deliveryFee, etaMinutes, serviceCharge, tax, tip, total }) {
  const { t } = useTranslation();
  return (
    <section className="mt-3 bg-white px-3 py-4">
      <h3 className="text-[15px] font-extrabold">{t('cart.paymentSummary')}</h3>
      <div className="mt-3 space-y-2.5 text-sm">
        <Row label={t('cart.subtotal')} value={kwd(subtotal)} />
        {discount > 0 ? (
          <div className="flex justify-between">
            <span className="text-ink-soft">{t('cart.couponDiscount')}</span>
            <span className="font-semibold text-discount">− {kwd(discount)}</span>
          </div>
        ) : null}
        {!isPickup ? <Row label={t('cart.deliveryFee')} value={deliveryFee > 0 ? kwd(deliveryFee) : t('store.freeDelivery')} /> : null}
        {!isPickup && etaMinutes ? <Row label={t('checkout.deliveryTime')} value={t('checkout.etaMinutes', { minutes: etaMinutes })} /> : null}
        {serviceCharge > 0 ? <Row label={t('cart.serviceCharge')} value={kwd(serviceCharge)} /> : null}
        {tax > 0 ? <Row label={t('cart.tax')} value={kwd(tax)} /> : null}
        {tip > 0 ? <Row label={t('checkout.tipTitle')} value={kwd(tip)} /> : null}
        <Row label={t('cart.total')} value={kwd(total)} strong />
      </div>
    </section>
  );
}
