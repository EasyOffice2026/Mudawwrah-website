import { useTranslation } from 'react-i18next';
import PaymentLogos from '../PaymentLogos.jsx';

/**
 * "Select payment method", laid out as on the payment page itself: KNET, Credit Card (Visa, Mastercard), American
 * Express, Apple Pay, each with its logos. `choices` are what the restaurant offers on this device.
 */
export default function PaymentChoices({ choices, current, onChoose }) {
  const { t } = useTranslation();
  const text = {
    KNET: [t('checkout.knet'), t('checkout.knetHint')],
    CARD: [t('checkout.card'), t('checkout.cardHint')],
    AMEX: [t('checkout.amex'), t('checkout.amexHint')],
    APPLE_PAY: [t('checkout.applePay'), t('checkout.applePayHint')],
    CASH: [t('checkout.cash'), ''],
  };
  return (
    <section className="mt-3 bg-white px-3 py-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{t('checkout.selectPayment')}</h3>
      <div className="mt-3 space-y-2.5">
        {choices.map((choice) => {
          const [label, hint] = text[choice];
          const selected = current === choice;
          return (
            <label
              key={choice}
              className={`flex min-h-[62px] cursor-pointer items-center gap-3.5 rounded-lg border bg-white px-4 py-2.5 transition-colors ${
                selected ? 'border-brand' : 'border-[#e3e3e3]'
              }`}
            >
              <input
                type="radio"
                name="paymentChoice"
                value={choice}
                checked={selected}
                onChange={() => onChoose(choice)}
                className="h-5 w-5 shrink-0 accent-brand"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{label}</span>
                {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
              </span>
              <PaymentLogos choice={choice} />
            </label>
          );
        })}
      </div>
    </section>
  );
}
