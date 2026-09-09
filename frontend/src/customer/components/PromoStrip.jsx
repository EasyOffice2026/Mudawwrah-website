import { useTranslation } from 'react-i18next';
import { kwd } from '../../lib/format';

/**
 * Persistent headline-offer strip pinned to the bottom of the menu.
 *
 * The reference app keeps the running promotion visible the whole way down the
 * page ("Flat 30% off"), separate from the cart bar. When the cart has items
 * the cart bar stacks above this rather than replacing it, so the offer stays
 * on screen without removing the only route into the cart.
 */
export default function PromoStrip({ promotions, onOpen, raised }) {
  const { t } = useTranslation();
  if (!promotions?.length) return null;

  // The loudest running offer wins the strip: biggest percentage, else the
  // biggest fixed amount, else free delivery.
  const headline =
    [...promotions]
      .filter((p) => p.type === 'PERCENT')
      .sort((a, b) => Number(b.value) - Number(a.value))[0] ||
    [...promotions].filter((p) => p.type === 'FIXED').sort((a, b) => Number(b.value) - Number(a.value))[0] ||
    promotions[0];

  const label =
    headline.type === 'PERCENT'
      ? t('menu.flatOff', { value: Number(headline.value) })
      : headline.type === 'FIXED'
        ? t('menu.upTo', { amount: kwd(headline.value) })
        : t('offers.freeDelivery');

  return (
    // Pinned to the viewport, but the tinted bar itself is capped to the menu
    // column. Putting the background on the full-width element instead paints
    // it right across a desktop window while the menu sits in a narrow column.
    <div
      className={`pointer-events-none fixed inset-x-0 z-30 transition-[bottom] duration-300 ${
        raised ? 'bottom-[76px]' : 'bottom-0'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center justify-between gap-3 bg-brand-light/90 px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur"
      >
        <span className="truncate text-sm font-extrabold text-brand">{label}</span>
        <span className="shrink-0 text-xs font-bold text-accent">{t('offers.apply')}</span>
      </button>
    </div>
  );
}
