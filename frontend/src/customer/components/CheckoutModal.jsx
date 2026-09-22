import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { kwd, localized } from '../../lib/format';
import { reverseGeocode } from '../../lib/geocode';
import { getAttribution } from '../../lib/tracking';
import { useCart } from '../../store/cart';
import LocationPicker from './LocationPicker.jsx';
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

// Order of progress, used to decide which steps on the tracker are done.
const TRACK_STAGES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'];

// Used by the location step when the map is unavailable.
const KUWAIT_AREAS = ['Salmiya', 'Jabriya', 'Hawally', 'Kuwait City', 'Farwaniya', 'Mangaf', 'Fahaheel', 'Jahra'];

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
  const { lines, clear, promo, note, subtotal } = useCart();
  const [orderType, setOrderType] = useState('DELIVERY');
  const [tip, setTip] = useState(0);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    propertyType: 'apartment',
    building: '',
    aptNumber: '',
    floor: '',
    street: '',
    block: '',
    avenue: '',
    area: '',
    paymentMethod: 'CASH',
  });
  // Building/street/block only turn red after a first attempt to submit —
  // never on first load, which would greet the customer with a form full of
  // errors before they have typed anything.
  const [addressTouched, setAddressTouched] = useState(false);
  // Delivery orders confirm a map location before filling in the address.
  const [locationOpen, setLocationOpen] = useState(false);
  // Branches the restaurant has set up under Settings → Pickup locations. A
  // restaurant with none keeps working exactly as before, off the single
  // pickup address in Settings.
  const [pickupLocations, setPickupLocations] = useState([]);
  const [pickupLocationId, setPickupLocationId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [placed, setPlaced] = useState(null);
  // Live status for the order just placed, refreshed while the screen is open.
  const [tracked, setTracked] = useState(null);

  // Keep the selection on a method the restaurant actually offers — the form
  // starts on CASH, which a shop that has switched cash off never shows.
  useEffect(() => {
    const allowed = String(settings?.paymentMethods || 'KNET,CARD')
      .split(',')
      .map((method) => method.trim().toUpperCase());
    if (allowed.length && !allowed.includes(form.paymentMethod)) {
      setForm((current) => ({ ...current, paymentMethod: allowed[0] }));
    }
  }, [settings?.paymentMethods, form.paymentMethod]);

  useEffect(() => {
    api
      .get('/pickup-locations')
      .then(({ data }) => {
        setPickupLocations(data);
        if (data.length === 1) setPickupLocationId(data[0].id);
      })
      .catch(() => setPickupLocations([]));
  }, []);

  useEffect(() => {
    if (!placed?.id) return undefined;
    let alive = true;
    const check = async () => {
      try {
        const { data } = await api.get(`/orders/track/${placed.id}`);
        if (alive) setTracked(data);
      } catch {
        // Tracking is a nicety; never let it break the confirmation screen.
      }
    };
    check();
    const timer = setInterval(check, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [placed?.id]);

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

  // Driven by the restaurant's own settings, so a shop that does not take cash
  // simply never offers it. Falls back to card-only rather than showing
  // everything if the setting is missing.
  const paymentLabels = {
    CASH: [t('checkout.cash'), '💵'],
    KNET: [t('checkout.knet'), '💳'],
    CARD: [t('checkout.card'), '💳'],
  };
  const enabledPayments = String(settings?.paymentMethods || 'KNET,CARD')
    .split(',')
    .map((method) => method.trim().toUpperCase())
    .filter((method) => paymentLabels[method])
    .map((method) => [method, ...paymentLabels[method]]);

  const tipPresets = String(settings?.tipPresets || '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => value > 0);

  // Assembled into the single address line the API stores.
  const propertyLabels = { apartment: t('checkout.propertyApartment'), house: t('checkout.propertyHouse'), office: t('checkout.propertyOffice') };
  const composedAddress = [
    propertyLabels[form.propertyType],
    form.building,
    form.aptNumber && `${t('checkout.aptNumber')} ${form.aptNumber}`,
    form.floor,
    form.street,
    form.block,
    form.avenue,
    form.area,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');

  // A real Kuwait delivery address needs at least these three — the same
  // fields the reference app the client sent over requires before it lets a
  // customer continue.
  const requiredAddressFields = ['building', 'street', 'block'];
  const missingAddressFields = requiredAddressFields.filter((key) => !form[key].trim());
  const addressMissing = !isPickup && missingAddressFields.length > 0;
  const fieldError = (key) => addressTouched && missingAddressFields.includes(key);
  // Once the restaurant has set up named branches, "pickup" without saying
  // which one is not a complete order — there is nowhere for the kitchen to
  // hand it to.
  const branchMissing = isPickup && pickupLocations.length > 0 && !pickupLocationId;
  const canSubmit = form.customerName.trim() && form.customerPhone.trim().length >= 6 && !branchMissing;

  const submit = async (viaWhatsapp) => {
    // A first tap with a required address field empty reveals exactly which
    // ones, the same way the reference address form does, rather than a
    // single generic error or a permanently disabled button.
    if (addressMissing) return setAddressTouched(true);
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
        pickupLocationId: isPickup ? pickupLocationId : undefined,
        deliveryLat: isPickup ? undefined : form.deliveryLat,
        deliveryLng: isPickup ? undefined : form.deliveryLng,
        promoCode: promo?.code,
        tip: effectiveTip,
        deliveryNote: deliveryNote || undefined,
        // Which campaign brought this customer here, read from what the URL
        // captured when the storefront first loaded. Empty on a direct visit.
        ...getAttribution(),
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

        {/* Progress the customer can watch without leaving the page. Before
            this, a web order simply went quiet after checkout. */}
        <div className="mt-8 w-full max-w-xs">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t('checkout.trackTitle')}</p>
          <ol className="mt-3 space-y-2.5">
            {['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].map((stage, index) => {
              const reached = TRACK_STAGES.indexOf(tracked?.status || placed.status) >= index;
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
                  <span className={`text-sm ${reached ? 'font-semibold' : 'text-ink-soft'}`}>
                    {t(`checkout.status_${stage}`)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
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
          {isPickup && pickupLocations.length ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold text-ink">{t('checkout.collectFrom')}</p>
              {pickupLocations.map((branch) => (
                <label
                  key={branch.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed transition ${
                    pickupLocationId === branch.id ? 'border-brand bg-surface' : 'border-hairline'
                  }`}
                >
                  <input
                    type="radio"
                    name="pickupLocation"
                    className="mt-0.5 h-4 w-4 accent-brand"
                    checked={pickupLocationId === branch.id}
                    onChange={() => setPickupLocationId(branch.id)}
                  />
                  <span>
                    <span className="block font-bold text-ink">{localized(branch, 'name', lang)}</span>
                    {localized(branch, 'address', lang) ? (
                      <span className="block text-ink-soft">{localized(branch, 'address', lang)}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          ) : isPickup ? (
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
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-extrabold">{t('checkout.address')}</h3>
                <button
                  type="button"
                  onClick={() => setLocationOpen(true)}
                  className="shrink-0 text-xs font-bold text-accent underline"
                >
                  {t('checkout.confirmLocation')}
                </button>
              </div>
              <div className="mt-3 rounded-xl bg-surface px-3 py-2.5">
                <label className="label">{t('checkout.area')}</label>
                <input className="input" value={form.area} onChange={set('area')} />
              </div>

              <div className="mt-3 flex gap-2">
                {['apartment', 'house', 'office'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, propertyType: key }))}
                    className={`flex-1 rounded-xl border-2 py-2.5 text-xs font-bold transition active:scale-[0.98] ${
                      form.propertyType === key ? 'border-brand bg-brand-light text-brand' : 'border-hairline bg-white'
                    }`}
                  >
                    {t(`checkout.property${key[0].toUpperCase()}${key.slice(1)}`)}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">{t('checkout.building')}</label>
                  <input
                    className={`input ${fieldError('building') ? 'border-brand' : ''}`}
                    value={form.building}
                    onChange={set('building')}
                  />
                  {fieldError('building') ? <p className="mt-1 text-xs font-semibold text-brand">{t('checkout.addressFieldRequired')}</p> : null}
                </div>
                <div>
                  <label className="label">{t('checkout.aptNumber')}</label>
                  <input className="input" value={form.aptNumber} onChange={set('aptNumber')} />
                </div>
                <div>
                  <label className="label">{t('checkout.floor')}</label>
                  <input className="input" value={form.floor} onChange={set('floor')} />
                </div>
                <div className="col-span-2">
                  <label className="label">{t('checkout.street')}</label>
                  <input
                    className={`input ${fieldError('street') ? 'border-brand' : ''}`}
                    value={form.street}
                    onChange={set('street')}
                  />
                  {fieldError('street') ? <p className="mt-1 text-xs font-semibold text-brand">{t('checkout.addressFieldRequired')}</p> : null}
                </div>
                <div>
                  <label className="label">{t('checkout.block')}</label>
                  <input
                    className={`input ${fieldError('block') ? 'border-brand' : ''}`}
                    value={form.block}
                    onChange={set('block')}
                  />
                  {fieldError('block') ? <p className="mt-1 text-xs font-semibold text-brand">{t('checkout.addressFieldRequired')}</p> : null}
                </div>
                <div>
                  <label className="label">{t('checkout.avenue')}</label>
                  <input className="input" value={form.avenue} onChange={set('avenue')} />
                </div>
              </div>
              {addressTouched && addressMissing ? (
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
            {enabledPayments.map(([value, label, icon]) => (
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

      <LocationPicker
        open={locationOpen}
        areas={KUWAIT_AREAS}
        onClose={() => setLocationOpen(false)}
        onConfirm={async ({ area, lat, lng }) => {
          if (area) setForm((current) => ({ ...current, area }));
          setForm((current) => ({ ...current, deliveryLat: lat, deliveryLng: lng }));
          setLocationOpen(false);
          // Only a real map pin is worth looking up — the no-map fallback
          // already asked for the area directly, and its centre point was
          // never actually placed anywhere meaningful.
          if (lat == null || lng == null) return;
          const found = await reverseGeocode(lat, lng);
          setForm((current) => ({
            ...current,
            // Never overwrites something the customer already typed —
            // arriving after they've started filling the form in by hand
            // should refine it, not fight with it.
            area: current.area || found.area || current.area,
            street: current.street || found.street || current.street,
          }));
        }}
      />
    </SheetShell>
  );
}
