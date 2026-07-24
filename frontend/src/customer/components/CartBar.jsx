import { useTranslation } from 'react-i18next';
import { kwd } from '../../lib/format';

export default function CartBar({ count, subtotal, onOpen }) {
  const { t } = useTranslation();
  if (!count) return null;
  return (
    <div className="fixed bottom-0 start-0 end-0 z-30 border-t border-gray-100 bg-white p-3 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <button type="button" onClick={onOpen} className="btn-primary w-full justify-between text-base">
        <span>
          {t('cart.viewCart')} · {t('cart.items', { count })}
        </span>
        <span>{kwd(subtotal)}</span>
      </button>
    </div>
  );
}
