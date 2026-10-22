import { useTranslation } from 'react-i18next';
import SheetShell from './SheetShell.jsx';

const LOOKS = {
  paid: { icon: '✓', ring: 'bg-discount/10 text-discount' },
  failed: { icon: '✕', ring: 'bg-red-50 text-red-600' },
  pending: { icon: '…', ring: 'bg-hairline text-ink-soft' },
};

/**
 * What the customer sees when the payment page sends them back: paid, refused, or still being
 * confirmed by the bank. A refused payment keeps the basket, so one tap tries again.
 */
export default function PaymentResult({ state, orderNumber, onClose, onRetry }) {
  const { t } = useTranslation();
  const look = LOOKS[state] || LOOKS.pending;

  return (
    <SheetShell label={t(`payment.${state}Title`)}>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className={`animate-pop flex h-20 w-20 items-center justify-center rounded-full text-4xl ${look.ring}`}>
          {look.icon}
        </div>
        <h2 className="mt-6 text-xl font-extrabold">{t(`payment.${state}Title`)}</h2>
        <p className="mt-2 max-w-xs text-sm text-ink-soft">{t(`payment.${state}Body`, { orderNumber })}</p>
        {orderNumber ? (
          <p className="mt-4 text-sm font-bold" dir="ltr">
            {orderNumber}
          </p>
        ) : null}
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          {state === 'failed' ? (
            <button type="button" className="btn-primary w-full py-3.5" onClick={onRetry}>
              {t('payment.retry')}
            </button>
          ) : null}
          <button
            type="button"
            className={state === 'failed' ? 'btn-ghost w-full py-3.5' : 'btn-primary w-full py-3.5'}
            onClick={onClose}
          >
            {t('payment.close')}
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
