import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { kwd, localized } from '../../lib/format';
import { useCart } from '../../store/cart';
import SheetShell from './SheetShell.jsx';

const buildWhatsappMessage = ({ lines, order, settings, lang, t }) => {
  const name = lang === 'ar' ? settings.restaurantNameAr : settings.restaurantNameEn;
  const body = lines
    .map(
      (line) =>
        `• ${line.quantity} × ${line.nameEn}${
          line.options?.length ? ` (${line.options.map((o) => o.nameEn).join(', ')})` : ''
        } — ${kwd(line.unitPrice * line.quantity)}`,
    )
    .join('\n');
  return [
    `*${name}* — new order ${order.orderNumber}`,
    `${t('checkout.fulfilment')}: ${order.orderType === 'PICKUP' ? t('checkout.pickup') : t('checkout.delivery')}`,
    '',
    body,
    '',
    `Subtotal: ${kwd(order.subtotal)}`,
    Number(order.discount) > 0 ? `Discount: -${kwd(order.discount)}` : null,
    order.orderType === 'PICKUP' ? null : `Delivery: ${kwd(order.deliveryFee)}`,
    Number(order.tip) > 0 ? `Tip: ${kwd(order.tip)}` : null,
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

const SegButton = ({ active, disabled, onClick, icon, label, hint }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex-1 rounded-xl border-2 p-3 text-start transition active:scale-[0.98] disabled:opacity-40 ${
      active ? 'border-brand bg-brand-light' : 'border-hairline bg-white'
    }`}
  >
    <span className="text-lg" aria-hidden>
      {icon}
    </span>
    <span className={`mt-1 block text-sm font-extrabold ${active ? 'text-brand' : ''}`}>{label}</span>
    <span className="mt-0.5 block text-[11px] text-ink-soft">{hint}</span>
  </button>
);

/**
 * Checkout. The client asked for delivery *or* pickup, so fulfilment is the
 * first decision on the screen and everything below reacts to it: pickup hides
 * the address, the delivery fee and the rider tip entirely.
 */
export default function CheckoutModal({ open, onClose, settings, tenant, lang }) {
  const { t, i18n } = useTranslation();
  const { lines, clear, promo, cutlery, note, subtotal } = useCart();
  const [orderType, setOrderType] = useState('DELIVERY');
  const [tip, setTip] = useState(0);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    building: '',
    floor: '',
    street: '',
    block: '',
    area: '',
    paymentMethod: 'CASH',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [placed, setPlaced] = useState(null);

  if (!open) return null;

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const deliveryAllowed = settings?.deliveryEnabled === 'true';
  const pickupAllowed = settings?.pickupEnabled === 'true';
  const isPickup = orderType === 'PICKUP';

  const sub = subtotal();
  const discount = Number(promo?.discount || 0);
  const deliveryFee = isPickup || promo?.freeDelivery ? 0 : Number(settings?.deliveryFee || 0);
  const discounted = Math.max(0, sub - discount);
  const serviceCharge = Number(((discounted * Number(settings?.serviceChargePercent || 0)) / 100).toFixed(3));
  const tax = Number((((discounted + serviceCharge) * Number(settings?.taxPercent || 0)) / 100).toFixed(3));
  const effectiveTip = isPickup ? 0 : tip;
  const total = Number((discounted + deliveryFee + serviceCharge + tax + effectiveTip).toFixed(3));

  const tipPresets = String(settings?.tipPresets || '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => value > 0);

  // Assembled into the single address line the API stores.
  const composedAddress = [form.building, form.floor, form.street, form.block, form.area]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');

  const addressMissing = !isPickup && !composedAddress;
  const canSubmit = form.customerName.trim() && form.customerPhone.trim().length >= 6 && !addressMissing;

  const submit = async (viaWhatsapp) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        address: isPickup ? undefined : composedAddress,
        notes: note || undefined,
        paymentMethod: viaWhatsapp ? 'WHATSAPP' : form.paymentMethod,
        orderType,
        promoCode: promo?.code,
        tip: effectiveTip,
        cutlery,
        deliveryNote: deliveryNote || undefined,
        items: lines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          optionIds: line.options?.map((o) => o.id) || [],
        })),
      };
      const { data } = await api.post('/orders', payload);
      if (viaWhatsapp) {
        const text = buildWhatsappMessage({ lines, order: data, settings, lang: i18n.language, t });
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
      <SheetShell label={t('checkout.title')}>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="animate-pop flex h-20 w-20 items-center justify-center rounded-full bg-discount/10 text-4xl">
          ✓
        </div>
        <p className="mt-6 text-xl font-extrabold">{t('checkout.success', { orderNumber: placed.orderNumber })}</p>
        <p className="mt-2 text-sm text-ink-soft">
          {placed.orderType === 'PICKUP'
            ? t('checkout.successPickup', { minutes: settings?.pickupWaitMinutes || 15 })
            : t('checkout.successBody', { phone: placed.customerPhone })}
        </p>
        <p className="mt-6 text-3xl font-extrabold">{kwd(placed.total)}</p>
        <button
          type="button"
          className="btn-primary mt-8 w-full max-w-xs py-3.5"
          onClick={() => {
            setPlaced(null);
            onClose();
          }}
        >
          {t('checkout.newOrder')}
        </button>
        </div>
      </SheetShell>
    );
  }

  return (
    <SheetShell tone="surface" onBackdropClick={onClose} label={t('checkout.title')}>
      <header className="flex items-center gap-3 border-b border-hairline bg-white px-3 py-3">
        <button type="button" onClick={onClose} aria-label={t('common.back')} className="icon-orb shadow-none">
          <span className="rtl:rotate-180">←</span>
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold leading-tight">{t('checkout.title')}</h2>
          <p className="truncate text-xs text-ink-soft">{localized(settings, 'restaurantName', lang)}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-40">
        <section className="bg-white px-3 py-4">
          <h3 className="text-[15px] font-extrabold">{t('checkout.fulfilment')}</h3>
          <div className="mt-3 flex gap-3">
            <SegButton
              active={!isPickup}
              disabled={!deliveryAllowed}
              onClick={() => setOrderType('DELIVERY')}
              icon="🛵"
              label={t('checkout.delivery')}
              hint={t('store.prepWindow', {
                min: tenant?.prepMinutesMin ?? 15,
                max: tenant?.prepMinutesMax ?? 25,
              })}
            />
            <SegButton
              active={isPickup}
              disabled={!pickupAllowed}
              onClick={() => setOrderType('PICKUP')}
              icon="🏪"
              label={t('checkout.pickup')}
              hint={t('checkout.pickupReady', { minutes: settings?.pickupWaitMinutes || 15 })}
            />
          </div>
          {isPickup ? (
            <p className="mt-3 rounded-xl bg-surface px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
              <span className="font-bold text-ink">{t('checkout.collectFrom')}</span>{' '}
              {localized(settings, 'pickupAddress', lang) || localized(settings, 'address', lang)}
            </p>
          ) : null}
        </section>

        <section className="mt-3 bg-white px-3 py-4">
          <h3 className="text-[15px] font-extrabold">{t('checkout.yourDetails')}</h3>
          <div className="mt-3 space-y-3">
            <div>
              <label className="label">{t('checkout.name')}</label>
              <input className="input" value={form.customerName} onChange={set('customerName')} required />
            </div>
            <div>
              <label className="label">{t('checkout.phone')}</label>
              <input className="input" inputMode="tel" value={form.customerPhone} onChange={set('customerPhone')} required />
            </div>
          </div>
        </section>

        {!isPickup ? (
          <>
            <section className="mt-3 bg-white px-3 py-4">
              <h3 className="text-[15px] font-extrabold">{t('checkout.address')}</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">{t('checkout.area')}</label>
                  <input className="input" value={form.area} onChange={set('area')} />
                </div>
                <div className="col-span-2">
                  <label className="label">{t('checkout.building')}</label>
                  <input className="input" value={form.building} onChange={set('building')} />
                </div>
                <div>
                  <label className="label">{t('checkout.floor')}</label>
                  <input className="input" value={form.floor} onChange={set('floor')} />
                </div>
                <div>
                  <label className="label">{t('checkout.block')}</label>
                  <input className="input" value={form.block} onChange={set('block')} />
                </div>
                <div className="col-span-2">
                  <label className="label">{t('checkout.street')}</label>
                  <input className="input" value={form.street} onChange={set('street')} />
                </div>
              </div>
              {addressMissing ? (
                <p className="mt-2 text-xs font-semibold text-brand">{t('checkout.addressRequired')}</p>
              ) : null}
            </section>

            <section className="mt-3 bg-white px-3 py-4">
              <h3 className="text-[15px] font-extrabold">{t('checkout.instructions')}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {['callOnArrival', 'dontRingBell', 'leaveAtReception', 'ringDoorbell'].map((key) => {
                  const label = t(`checkout.${key}`);
                  const active = deliveryNote === label;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDeliveryNote(active ? '' : label)}
                      className={`rounded-xl border p-2.5 text-xs font-semibold transition active:scale-[0.98] ${
                        active ? 'border-brand bg-brand-light text-brand' : 'border-hairline bg-white text-ink-soft'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            {settings?.tipsEnabled === 'true' && tipPresets.length ? (
              <section className="mt-3 bg-white px-3 py-4">
                <h3 className="text-[15px] font-extrabold">{t('checkout.tipTitle')}</h3>
                <p className="mt-0.5 text-xs text-ink-soft">{t('checkout.tipHint')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tipPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTip(tip === preset ? 0 : preset)}
                      className={`rounded-xl border px-3.5 py-2.5 text-sm font-bold transition active:scale-95 ${
                        tip === preset ? 'border-brand bg-brand-light text-brand' : 'border-hairline bg-white'
                      }`}
                    >
                      {kwd(preset)}
                    </button>
                  ))}
                  {tip > 0 ? (
                    <button type="button" onClick={() => setTip(0)} className="px-2 text-sm font-bold text-ink-soft underline">
                      {t('cart.remove')}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        <section className="mt-3 bg-white px-3 py-4">
          <h3 className="text-[15px] font-extrabold">{t('checkout.payWith')}</h3>
          <div className="mt-3 divide-y divide-hairline">
            {[
              ['CASH', t('checkout.cash'), '💵'],
              ['KNET', t('checkout.knet'), '💳'],
              ['CARD', t('checkout.card'), '💳'],
            ].map(([value, label, icon]) => (
              <label key={value} className="flex cursor-pointer items-center justify-between py-3.5">
                <span className="flex items-center gap-3 text-[15px] font-medium">
                  <span aria-hidden>{icon}</span>
                  {label}
                </span>
                <input
                  type="radio"
                  name="paymentMethod"
                  value={value}
                  checked={form.paymentMethod === value}
                  onChange={set('paymentMethod')}
                  className="h-5 w-5 accent-brand"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mt-3 bg-white px-3 py-4">
          <h3 className="text-[15px] font-extrabold">{t('cart.paymentSummary')}</h3>
          <div className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-soft">{t('cart.subtotal')}</span>
              <span className="font-medium">{kwd(sub)}</span>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between">
                <span className="text-ink-soft">{t('cart.couponDiscount')}</span>
                <span className="font-semibold text-discount">− {kwd(discount)}</span>
              </div>
            ) : null}
            {!isPickup ? (
              <div className="flex justify-between">
                <span className="text-ink-soft">{t('cart.deliveryFee')}</span>
                <span className="font-medium">{deliveryFee > 0 ? kwd(deliveryFee) : t('store.freeDelivery')}</span>
              </div>
            ) : null}
            {serviceCharge > 0 ? (
              <div className="flex justify-between">
                <span className="text-ink-soft">{t('cart.serviceCharge')}</span>
                <span className="font-medium">{kwd(serviceCharge)}</span>
              </div>
            ) : null}
            {tax > 0 ? (
              <div className="flex justify-between">
                <span className="text-ink-soft">{t('cart.tax')}</span>
                <span className="font-medium">{kwd(tax)}</span>
              </div>
            ) : null}
            {effectiveTip > 0 ? (
              <div className="flex justify-between">
                <span className="text-ink-soft">{t('checkout.tipTitle')}</span>
                <span className="font-medium">{kwd(effectiveTip)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-hairline pt-2.5">
              <span className="font-extrabold">{t('cart.total')}</span>
              <span className="font-extrabold">{kwd(total)}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="border-t border-hairline bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {error ? <p className="mb-2 text-center text-xs font-semibold text-brand">{error}</p> : null}
        <button
          type="button"
          className="btn-primary w-full justify-between py-4"
          disabled={submitting || !canSubmit}
          onClick={() => submit(false)}
        >
          <span>{submitting ? t('common.saving') : t('checkout.placeOrder')}</span>
          <span>{kwd(total)}</span>
        </button>
        <button
          type="button"
          className="btn-ghost mt-2 w-full py-3"
          disabled={submitting || !canSubmit}
          onClick={() => submit(true)}
        >
          {t('cart.whatsapp')}
        </button>
      </div>
    </SheetShell>
  );
}
