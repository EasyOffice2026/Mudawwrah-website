import { useTranslation } from 'react-i18next';
import { kwd, localized } from '../../lib/format';

/**
 * Horizontally scrolling voucher cards under the store header. Tapping one
 * copies its code and hands it to the cart, so the customer never retypes it.
 */
export default function OfferStrip({ promotions, lang, onApply, appliedCode }) {
  const { t } = useTranslation();
  if (!promotions?.length) return null;

  const worth = (promotion) => {
    if (promotion.type === 'FREE_DELIVERY') return t('offers.freeDelivery');
    if (promotion.type === 'PERCENT') return t('offers.percentOff', { value: Number(promotion.value) });
    return t('offers.amountOff', { amount: kwd(promotion.value) });
  };

  return (
    <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto px-3 pb-1">
      {promotions.map((promotion, index) => {
        const applied = appliedCode && appliedCode.toLowerCase() === promotion.code.toLowerCase();
        return (
          <button
            key={promotion.id}
            type="button"
            onClick={() => onApply(promotion)}
            style={{ '--i': index }}
            className={`animate-rise flex w-[210px] shrink-0 flex-col justify-between rounded-2xl border p-3 text-start transition active:scale-[0.98] ${
              applied ? 'border-brand bg-brand-light' : 'border-hairline bg-white hover:shadow-card'
            }`}
          >
            <div>
              <p className="text-sm font-extrabold leading-snug">{localized(promotion, 'title', lang)}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {localized(promotion, 'subtitle', lang) || worth(promotion)}
              </p>
            </div>
            <span className={`mt-3 text-xs font-bold ${applied ? 'text-brand' : 'text-accent'}`}>
              {applied ? t('offers.applied') : t('offers.apply')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
