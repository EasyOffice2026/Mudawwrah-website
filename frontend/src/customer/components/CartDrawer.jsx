import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { kwd } from '../../lib/format';
import { useCart } from '../../store/cart';

export default function CartDrawer({ open, onClose, settings, onCheckout }) {
  const { t, i18n } = useTranslation();
  const { lines, setQuantity, removeLine, subtotal } = useCart();
  const lang = i18n.language;
  const sub = subtotal();
  const deliveryFee = Number(settings?.deliveryFee || 0);
  const serviceCharge = Number(((sub * Number(settings?.serviceChargePercent || 0)) / 100).toFixed(3));
  const total = Number((sub + deliveryFee + serviceCharge).toFixed(3));
  const minimum = Number(settings?.minimumOrder || 0);
  const belowMinimum = sub < minimum;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cart.title')}
      footer={
        lines.length ? (
          <div className="space-y-2">
            <Row label={t('cart.subtotal')} value={kwd(sub)} />
            <Row label={t('cart.deliveryFee')} value={kwd(deliveryFee)} />
            {serviceCharge > 0 ? <Row label={t('cart.serviceCharge')} value={kwd(serviceCharge)} /> : null}
            <Row label={t('cart.total')} value={kwd(total)} bold />
            {belowMinimum ? (
              <p className="text-xs font-semibold text-brand">{t('cart.minimumOrder', { amount: kwd(minimum) })}</p>
            ) : null}
            <button type="button" className="btn-primary w-full" disabled={belowMinimum} onClick={onCheckout}>
              {t('cart.checkout')}
            </button>
          </div>
        ) : null
      }
    >
      {!lines.length ? (
        <p className="py-8 text-center text-sm text-gray-500">{t('cart.empty')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {lines.map((line) => (
            <li key={line.key} className="flex items-start gap-3 py-3">
              {line.imageUrl ? (
                <img src={line.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{lang === 'ar' && line.nameAr ? line.nameAr : line.nameEn}</p>
                {line.options?.length ? (
                  <p className="text-xs text-gray-500">
                    {line.options.map((o) => (lang === 'ar' && o.nameAr ? o.nameAr : o.nameEn)).join(' · ')}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-gray-700">{kwd(line.unitPrice * line.quantity)}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-2 py-1">
                  <button type="button" onClick={() => setQuantity(line.key, line.quantity - 1)}>
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">{line.quantity}</span>
                  <button type="button" onClick={() => setQuantity(line.key, line.quantity + 1)}>
                    +
                  </button>
                </div>
                <button type="button" onClick={() => removeLine(line.key)} className="text-lg text-gray-400">
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

const Row = ({ label, value, bold }) => (
  <div className={`flex items-center justify-between text-sm ${bold ? 'font-bold' : 'text-gray-600'}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);
