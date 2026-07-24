import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import { kwd } from '../../lib/format';
import { useCart } from '../../store/cart';

const buildWhatsappMessage = ({ lines, order, settings, lang }) => {
  const name = lang === 'ar' ? settings.restaurantNameAr : settings.restaurantNameEn;
  const body = lines
    .map((line) => `• ${line.quantity} × ${line.nameEn}${line.options?.length ? ` (${line.options.map((o) => o.nameEn).join(', ')})` : ''} — ${kwd(line.unitPrice * line.quantity)}`)
    .join('\n');
  return [
    `*${name}* — new order ${order.orderNumber}`,
    '',
    body,
    '',
    `Subtotal: ${kwd(order.subtotal)}`,
    `Delivery: ${kwd(order.deliveryFee)}`,
    `Total: ${kwd(order.total)}`,
    '',
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    order.address ? `Address: ${order.address}` : null,
    order.notes ? `Notes: ${order.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
};

export default function CheckoutModal({ open, onClose, settings }) {
  const { t, i18n } = useTranslation();
  const { lines, clear } = useCart();
  const [form, setForm] = useState({ customerName: '', customerPhone: '', address: '', notes: '', paymentMethod: 'CASH' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [placed, setPlaced] = useState(null);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (viaWhatsapp) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        paymentMethod: viaWhatsapp ? 'WHATSAPP' : form.paymentMethod,
        items: lines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          optionIds: line.options?.map((o) => o.id) || [],
        })),
      };
      const { data } = await api.post('/orders', payload);
      if (viaWhatsapp) {
        const text = buildWhatsappMessage({ lines, order: data, settings, lang: i18n.language });
        window.open(`https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(text)}`, '_blank');
      }
      clear();
      setPlaced(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (placed) {
    return (
      <Modal open={open} onClose={() => { setPlaced(null); onClose(); }} title={t('checkout.title')}>
        <div className="py-6 text-center">
          <p className="text-lg font-bold text-brand">{t('checkout.success', { orderNumber: placed.orderNumber })}</p>
          <p className="mt-2 text-sm text-gray-600">{t('checkout.successBody', { phone: placed.customerPhone })}</p>
          <p className="mt-4 text-2xl font-bold">{kwd(placed.total)}</p>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={() => {
              setPlaced(null);
              onClose();
            }}
          >
            {t('checkout.newOrder')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('checkout.title')}
      footer={
        <div className="space-y-2">
          {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
          <button type="button" className="btn-primary w-full" disabled={submitting} onClick={() => submit(false)}>
            {submitting ? t('common.saving') : t('checkout.placeOrder')}
          </button>
          <button type="button" className="btn-ghost w-full" disabled={submitting} onClick={() => submit(true)}>
            {t('cart.whatsapp')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">{t('checkout.name')}</label>
          <input className="input" value={form.customerName} onChange={set('customerName')} required />
        </div>
        <div>
          <label className="label">{t('checkout.phone')}</label>
          <input className="input" value={form.customerPhone} onChange={set('customerPhone')} required />
        </div>
        <div>
          <label className="label">{t('checkout.address')}</label>
          <textarea className="input" rows={2} value={form.address} onChange={set('address')} />
        </div>
        <div>
          <label className="label">{t('checkout.notes')}</label>
          <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} />
        </div>
        <div>
          <label className="label">{t('checkout.paymentMethod')}</label>
          <select className="input" value={form.paymentMethod} onChange={set('paymentMethod')}>
            <option value="CASH">{t('checkout.cash')}</option>
            <option value="KNET">{t('checkout.knet')}</option>
            <option value="CARD">{t('checkout.card')}</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
