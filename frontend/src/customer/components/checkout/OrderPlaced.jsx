import { useTranslation } from 'react-i18next';
import { kwd } from '../../../lib/format';

const TRACK_STAGES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
// A collection order is never "on the way".
const PICKUP_TRACK_STAGES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'];

/**
 * After the order is placed: its number, what happens next, the total, and progress the customer can watch without
 * leaving the page (`tracked` is the latest status read back from the server).
 */
export default function OrderPlaced({ placed, tracked, pickupWaitMinutes, onNewOrder }) {
  const { t } = useTranslation();
  const stages = placed.orderType === 'PICKUP' ? PICKUP_TRACK_STAGES : TRACK_STAGES;
  const current = stages.indexOf(tracked?.status || placed.status);
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="animate-pop flex h-20 w-20 items-center justify-center rounded-full bg-discount/10 text-4xl">✓</div>
      <p className="mt-6 text-xl font-extrabold">{t('checkout.success', { orderNumber: placed.orderNumber })}</p>
      <p className="mt-2 text-sm text-ink-soft">
        {placed.orderType === 'PICKUP'
          ? t('checkout.successPickup', { minutes: pickupWaitMinutes || 15 })
          : t('checkout.successBody', { phone: placed.customerPhone })}
      </p>
      <p className="mt-6 text-3xl font-extrabold">{kwd(placed.total)}</p>

      <div className="mt-8 w-full max-w-xs">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t('checkout.trackTitle')}</p>
        <ol className="mt-3 space-y-2.5">
          {stages.map((stage, index) => {
            const reached = current >= index;
            return (
              <li key={stage} className="flex items-center gap-3 text-start">
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    reached ? 'bg-discount text-white' : 'bg-hairline text-ink-soft'
                  }`}
                >
                  {reached ? '✓' : ''}
                </span>
                <span className={`text-sm ${reached ? 'font-semibold' : 'text-ink-soft'}`}>{t(`checkout.status_${stage}`)}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <button type="button" className="btn-primary mt-8 w-full max-w-xs py-3.5" onClick={onNewOrder}>
        {t('checkout.newOrder')}
      </button>
    </div>
  );
}
