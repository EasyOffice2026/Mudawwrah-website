import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { kwd, localized } from '../../lib/format';
import { useCart } from '../../store/cart';
import SheetShell from './SheetShell.jsx';

const Row = ({ label, value, tone }) => (
  <div className="flex items-center justify-between text-sm">
    <span className={tone === 'strong' ? 'font-extrabold' : 'text-ink-soft'}>{label}</span>
    <span
      className={
        tone === 'strong' ? 'font-extrabold' : tone === 'discount' ? 'font-semibold text-discount' : 'font-medium'
      }
    >
      {value}
    </span>
  </div>
);

/**
 * Full-screen cart. Beyond the line items it carries the things that lift an
 * order: upsells, a cutlery opt-out, a special request, and the voucher field —
 * with a running "you're saving" total so the discount stays visible.
 */
export default function CartDrawer({ open, onClose, settings, suggestions, lang, onCheckout, onAddSuggestion }) {
  const { t } = useTranslation();
  const { lines, setQuantity, removeLine, subtotal, promo, setPromo, cutlery, setCutlery, note, setNote } = useCart();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [promoError, setPromoError] = useState(null);

  if (!open) return null;

  const sub = subtotal();
  const discount = Number(promo?.discount || 0);
  const deliveryFee = promo?.freeDelivery ? 0 : Number(settings?.deliveryFee || 0);
  const discounted = Math.max(0, sub - discount);
  const serviceCharge = Number(((discounted * Number(settings?.serviceChargePercent || 0)) / 100).toFixed(3));
  const tax = Number((((discounted + serviceCharge) * Number(settings?.taxPercent || 0)) / 100).toFixed(3));
  const total = Number((discounted + deliveryFee + serviceCharge + tax).toFixed(3));
  const minimum = Number(settings?.minimumOrder || 0);
  const belowMinimum = sub < minimum;

  // Menu discounts plus any voucher — what the header bar brags about.
  const menuSavings = lines.reduce(
    (sum, l) => sum + (l.compareAtPrice ? Math.max(0, (l.compareAtPrice - l.basePrice) * l.quantity) : 0),
    0,
  );
  const totalSavings = Number((menuSavings + discount).toFixed(3));

  const applyCode = async (raw) => {
    const value = (raw ?? code).trim();
    if (!value) return;
    setChecking(true);
    setPromoError(null);
    try {
      const { data } = await api.post('/promotions/preview', { code: value, subtotal: sub });
      setPromo(data);
      setCode('');
    } catch (err) {
      setPromoError(apiError(err));
      setPromo(null);
    } finally {
      setChecking(false);
    }
  };

  return (
    <SheetShell tone="surface" onBackdropClick={onClose} label={t('cart.title')}>
      <header className="flex items-center gap-3 border-b border-hairline bg-white px-3 py-3">
        <button type="button" onClick={onClose} aria-label={t('common.back')} className="icon-orb shadow-none">
          <span className="rtl:rotate-180">←</span>
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold leading-tight">{t('cart.title')}</h2>
          <p className="truncate text-xs text-ink-soft">{localized(settings, 'restaurantName', lang)}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-40">
        {!lines.length ? (
          <p className="py-16 text-center text-sm text-ink-soft">{t('cart.empty')}</p>
        ) : (
          <ul className="bg-white">
            {lines.map((line) => (
              <li key={line.key} className="flex items-start gap-3 border-b border-hairline px-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold leading-snug">
                    {lang === 'ar' && line.nameAr ? line.nameAr : line.nameEn}
                  </p>
                  {line.options?.length ? (
                    <p className="mt-1 text-xs leading-snug text-ink-soft">
                      {line.options.map((o) => (lang === 'ar' && o.nameAr ? o.nameAr : o.nameEn)).join(' · ')}
                    </p>
                  ) : null}
                  <p className="mt-2 flex items-baseline gap-2">
                    <span className="text-[15px] font-bold">{kwd(line.unitPrice * line.quantity)}</span>
                    {line.compareAtPrice ? (
                      <span className="was-price text-xs">
                        {kwd((line.compareAtPrice + (line.unitPrice - line.basePrice)) * line.quantity)}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {line.imageUrl ? (
                    <img src={line.imageUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
                  ) : null}
                  <div className="flex items-center gap-1 rounded-xl border border-hairline bg-white">
                    <button
                      type="button"
                      aria-label="decrease"
                      onClick={() => (line.quantity > 1 ? setQuantity(line.key, line.quantity - 1) : removeLine(line.key))}
                      className="px-2.5 py-1.5 text-base leading-none text-ink-soft transition active:scale-90"
                    >
                      {line.quantity > 1 ? '−' : '🗑'}
                    </button>
                    <span className="w-5 text-center text-sm font-extrabold">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="increase"
                      onClick={() => setQuantity(line.key, line.quantity + 1)}
                      className="px-2.5 py-1.5 text-base leading-none text-accent transition active:scale-90"
                    >
                      +
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {lines.length && suggestions?.length ? (
          <section className="mt-3 bg-white px-3 py-4">
            <h3 className="text-[15px] font-extrabold">{t('cart.suggestions')}</h3>
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto">
              {suggestions.map((suggestion) => (
                <div key={suggestion.id} className="w-[124px] shrink-0">
                  <div className="relative overflow-hidden rounded-xl bg-hairline">
                    <img
                      src={suggestion.image?.thumbnailUrl || suggestion.image?.url || '/placeholder.svg'}
                      alt=""
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute bottom-1.5 end-1.5">
                      <button
                        type="button"
                        aria-label="add"
                        onClick={() => onAddSuggestion(suggestion)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xl font-light text-accent shadow-lift transition active:scale-90"
                      >
                        +
                      </button>
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug">
                    {localized(suggestion, 'name', lang)}
                  </p>
                  <p className="text-xs text-ink-soft">{kwd(suggestion.price)}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {lines.length ? (
          <>
            <section className="mt-3 bg-white px-3 py-4">
              <h3 className="text-[15px] font-extrabold">{t('cart.specialRequest')}</h3>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t('cart.cutlery')}</span>
                  <span className="block text-xs text-ink-soft">{t('cart.cutleryHint')}</span>
                </span>
                {/* A real switch: a button with a sliding knob, rather than a
                    restyled checkbox that renders as a bare pill. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={cutlery}
                  aria-label={t('cart.cutlery')}
                  onClick={() => setCutlery(!cutlery)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    cutlery ? 'bg-brand' : 'bg-hairline'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      cutlery ? 'start-6' : 'start-1'
                    }`}
                  />
                </button>
              </div>
              <textarea
                className="input mt-3"
                rows={2}
                placeholder={t('cart.notePlaceholder')}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </section>

            <section className="mt-3 bg-white px-3 py-4">
              <h3 className="text-[15px] font-extrabold">{t('cart.saveOnOrder')}</h3>
              {promo ? (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-brand bg-brand-light px-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold text-brand">{promo.code}</span>
                    <span className="block truncate text-xs text-ink-soft">
                      {localized(promo, 'title', lang) || t('offers.applied')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPromo(null)}
                    className="shrink-0 text-xs font-bold text-brand underline"
                  >
                    {t('cart.remove')}
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input
                    className="input"
                    placeholder={t('cart.voucherPlaceholder')}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && applyCode()}
                  />
                  <button type="button" className="btn-ghost shrink-0" disabled={checking} onClick={() => applyCode()}>
                    {checking ? t('common.saving') : t('offers.apply')}
                  </button>
                </div>
              )}
              {promoError ? <p className="mt-2 text-xs font-semibold text-brand">{promoError}</p> : null}
            </section>

            <section className="mt-3 bg-white px-3 py-4">
              <h3 className="text-[15px] font-extrabold">{t('cart.paymentSummary')}</h3>
              <div className="mt-3 space-y-2.5">
                <Row label={t('cart.subtotal')} value={kwd(sub)} />
                {discount > 0 ? (
                  <Row label={t('cart.couponDiscount')} value={`− ${kwd(discount)}`} tone="discount" />
                ) : null}
                <Row
                  label={t('cart.deliveryFee')}
                  value={deliveryFee > 0 ? kwd(deliveryFee) : t('store.freeDelivery')}
                />
                {serviceCharge > 0 ? <Row label={t('cart.serviceCharge')} value={kwd(serviceCharge)} /> : null}
                {tax > 0 ? <Row label={t('cart.tax')} value={kwd(tax)} /> : null}
                <div className="border-t border-hairline pt-2.5">
                  <Row label={t('cart.total')} value={kwd(total)} tone="strong" />
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>

      {lines.length ? (
        <div className="border-t border-hairline bg-white">
          {totalSavings > 0 ? (
            <p className="bg-discount/10 px-3 py-2 text-center text-xs font-bold text-discount">
              {t('cart.savingBanner', { amount: kwd(totalSavings) })}
            </p>
          ) : null}
          <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {belowMinimum ? (
              <p className="mb-2 text-center text-xs font-semibold text-brand">
                {t('cart.minimumOrder', { amount: kwd(minimum) })}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1 py-3.5" onClick={onClose}>
                {t('cart.addItems')}
              </button>
              <button
                type="button"
                className="btn-primary flex-[1.4] justify-between py-3.5"
                disabled={belowMinimum}
                onClick={onCheckout}
              >
                <span>{t('cart.checkout')}</span>
                <span>{kwd(total)}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SheetShell>
  );
}
