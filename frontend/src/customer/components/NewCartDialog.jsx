import { useTranslation } from 'react-i18next';

/**
 * Guards the cart when a customer opens a different restaurant while holding
 * items from another one. Previously the cart was cleared silently, which on a
 * multi-restaurant platform loses an order the customer was mid-way through
 * without ever telling them.
 */
export default function NewCartDialog({ open, restaurantName, onCancel, onConfirm }) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center px-6" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" />
      <div className="animate-pop relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-lift">
        <h2 className="text-lg font-extrabold">{t('cart.newCartTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {t('cart.newCartBody', { restaurant: restaurantName })}
        </p>
        <div className="mt-5 flex gap-3">
          <button type="button" className="btn-ghost flex-1 rounded-full py-3" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary flex-1 rounded-full py-3" onClick={onConfirm}>
            {t('cart.newCartStart')}
          </button>
        </div>
      </div>
    </div>
  );
}
