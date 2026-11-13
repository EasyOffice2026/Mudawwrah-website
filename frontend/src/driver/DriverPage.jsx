import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiError } from '../lib/api';
import { playChime, unlockAudio } from '../lib/chime';
import { amountToCollect, directionsUrl, driverStage, DRIVER_POLL_MS, newlyAssigned, telUrl } from '../lib/delivery';
import { driverApi, driverToken, savedDriver, signInDriver, signOutDriver } from '../lib/driverApi';
import { kwd, localized } from '../lib/format';
import { cachedPath, refresh } from '../lib/storefrontApi';
import { applyTheme } from '../lib/theme';
import { hasDriverApp, useDriverLocation } from '../lib/useDriverLocation';
import { useScreenAwake } from '../lib/useScreenAwake';

const STAGE_TONE = { waiting: 'bg-amber-100 text-amber-800', ready: 'bg-green-100 text-green-800', out: 'bg-blue-100 text-blue-800' };

function SignIn({ restaurant, onSignedIn }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState({ phone: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await signInDriver(form.phone, form.password));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <header className="text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{restaurant ? localized(restaurant, 'name', i18n.language) : ''}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{t('driver.signInTitle')}</h1>
      </header>
      <form onSubmit={submit} className="card space-y-3">
        <div>
          <label className="label" htmlFor="driver-phone">
            {t('driver.phone')}
          </label>
          <input
            id="driver-phone"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            dir="ltr"
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="driver-password">
            {t('driver.password')}
          </label>
          <input
            id="driver-password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        {error ? (
          <p className="text-sm font-semibold text-brand" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary w-full py-3.5" disabled={busy}>
          {t('driver.signIn')}
        </button>
      </form>
    </main>
  );
}

function OrderCard({ order, busy, onStart, onDelivered }) {
  const { t, i18n } = useTranslation();
  const stage = driverStage(order);
  const collect = amountToCollect(order);
  const where = [
    order.area,
    order.block ? `${t('checkout.block')} ${order.block}` : null,
    order.street ? `${t('checkout.street')} ${order.street}` : null,
    order.building ? `${t('checkout.building')} ${order.building}` : null,
  ].filter(Boolean);
  const directions = directionsUrl(order);
  const tel = telUrl(order.customerPhone);

  return (
    <article className="card space-y-3" data-testid="driver-order">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold" dir="ltr">
            {order.orderNumber}
          </p>
          {order.branch ? <p className="text-xs text-ink-soft">{localized(order.branch, 'name', i18n.language)}</p> : null}
        </div>
        <span className={`chip ${STAGE_TONE[stage]}`}>{t(`driver.stage_${stage}`)}</span>
      </header>

      <div className="space-y-1 text-sm">
        <p className="font-bold">{order.customerName}</p>
        {where.length ? <p>{where.join(' · ')}</p> : null}
        {order.address ? <p className="text-ink-soft">{order.address}</p> : null}
        {order.deliveryNote || order.notes ? (
          <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
            <span className="font-semibold">{t('driver.note')}:</span> {[order.deliveryNote, order.notes].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>

      <ul className="text-sm text-ink-soft">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.quantity} × {localized(item, 'name', i18n.language)}
          </li>
        ))}
      </ul>

      <p className={`rounded-xl p-3 text-center text-base font-extrabold ${collect ? 'bg-brand/10 text-brand' : 'bg-green-50 text-green-800'}`}>
        {collect ? t('driver.collect', { amount: kwd(collect) }) : t('driver.paid')}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {tel ? (
          <a className="btn-ghost" href={tel}>
            📞 {t('driver.call')}
          </a>
        ) : null}
        {directions ? (
          <a className="btn-ghost" href={directions} target="_blank" rel="noreferrer">
            🧭 {t('driver.navigate')}
          </a>
        ) : null}
      </div>

      {stage === 'out' ? (
        <button type="button" className="btn w-full bg-green-600 py-4 text-base text-white" disabled={busy} onClick={() => onDelivered(order)}>
          ✓ {t('driver.delivered')}
        </button>
      ) : (
        <button type="button" className="btn-primary w-full py-4 text-base" disabled={busy} onClick={() => onStart(order)}>
          {t('driver.start')}
        </button>
      )}
    </article>
  );
}

/**
 * The driver's page: one screen on the driver's phone, in a browser or inside our Android app.
 *
 * It lists the deliveries the order desk gave this driver. "Start delivery" puts the order on its way and from then
 * the phone's position is reported, which is what the customer follows on the map; "Delivered" ends both. The list
 * refreshes by itself every few seconds and rings when a new delivery arrives.
 */
export default function DriverPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [restaurant, setRestaurant] = useState(() => cachedPath('/tenants/current'));
  const [driver, setDriver] = useState(() => (driverToken() ? savedDriver() : null));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const known = useRef(null);

  useEffect(() => {
    refresh('/tenants/current')
      .then((tenant) => {
        setRestaurant(tenant);
        applyTheme(tenant);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${t('driver.title')}${restaurant ? ` · ${localized(restaurant, 'name', lang)}` : ''}`;
  }, [t, restaurant, lang]);

  const take = useCallback((next) => {
    if (newlyAssigned(known.current, next.orders).length) playChime();
    known.current = next.orders;
    setData(next);
    setCheckedAt(new Date());
    setOffline(false);
  }, []);

  const signedOut = useCallback(() => {
    signOutDriver();
    known.current = null;
    setDriver(null);
    setData(null);
  }, []);

  const load = useCallback(async () => {
    try {
      take((await driverApi.get('/driver/orders')).data);
    } catch (err) {
      // 401: the session ended (signed out by the owner, or the renewal ran out). 403: no longer a driver account.
      if ([401, 403].includes(err.response?.status)) signedOut();
      else setOffline(true);
    }
  }, [take, signedOut]);

  useEffect(() => {
    if (!driver) return undefined;
    load();
    const timer = setInterval(load, DRIVER_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [driver, load]);

  const tracking = Boolean(driver && data?.tracking);
  const location = useDriverLocation(tracking, load);
  // In a browser the page only reports while it is on screen, so the screen is kept on during a delivery.
  useScreenAwake(tracking && !hasDriverApp());

  const act = async (order, action) => {
    setBusy(true);
    setError(null);
    try {
      take((await driverApi.post(`/driver/orders/${order.id}/${action}`)).data);
    } catch (err) {
      setError(apiError(err));
      load();
    } finally {
      setBusy(false);
    }
  };
  const start = (order) => {
    // The first press also lets the "new delivery" sound play later (phones need one touch first).
    unlockAudio();
    act(order, 'start');
  };
  const delivered = (order) => {
    if (window.confirm(t('driver.confirmDelivered', { number: order.orderNumber }))) act(order, 'delivered');
  };

  const toggleLanguage = () => i18n.changeLanguage(lang === 'ar' ? 'en' : 'ar');

  if (!driver) {
    return (
      <div className="min-h-screen bg-surface text-ink" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <SignIn
          restaurant={restaurant}
          onSignedIn={(user) => {
            unlockAudio();
            setDriver({ id: user.id, name: user.name });
          }}
        />
        <p className="pb-6 text-center">
          <button type="button" className="text-xs text-ink-soft underline" onClick={toggleLanguage}>
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </p>
      </div>
    );
  }

  const orders = data?.orders || [];

  return (
    <div className="min-h-screen bg-surface pb-10 text-ink" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="mx-auto max-w-lg space-y-3 p-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{restaurant ? localized(restaurant, 'name', lang) : ''}</p>
            <h1 className="text-xl font-extrabold">{t('driver.hello', { name: driver.name })}</h1>
            {data ? <p className="text-xs text-ink-soft">{t('driver.deliveredToday', { count: data.deliveredToday })}</p> : null}
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <button type="button" className="underline" onClick={toggleLanguage}>
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <button type="button" className="text-ink-soft underline" onClick={signedOut}>
              {t('driver.signOut')}
            </button>
          </div>
        </header>

        {tracking && location === 'on' ? (
          <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900" data-testid="driver-sharing">
            <span className="font-semibold">📍 {t('driver.sharing')}</span>{' '}
            {hasDriverApp() ? t('driver.sharingApp') : t('driver.sharingBrowser')}
          </p>
        ) : null}
        {tracking && (location === 'denied' || location === 'unavailable') ? (
          <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert" data-testid="driver-location-off">
            <p>{hasDriverApp() ? t('driver.locationOffApp') : t('driver.locationOff')}</p>
            {hasDriverApp() ? (
              <button type="button" className="btn mt-2 bg-red-700 text-white" onClick={() => window.DriverApp.openSettings?.()}>
                {t('driver.allow')}
              </button>
            ) : null}
          </div>
        ) : null}
        {offline ? <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{t('driver.offline')}</p> : null}
        {error ? (
          <p className="text-sm font-semibold text-brand" role="alert">
            {error}
          </p>
        ) : null}

        {data && !orders.length ? (
          <div className="card py-10 text-center">
            <p className="text-base font-bold">{t('driver.none')}</p>
            <p className="mt-1 text-sm text-ink-soft">{t('driver.noneHint')}</p>
          </div>
        ) : null}
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} busy={busy} onStart={start} onDelivered={delivered} />
        ))}

        {checkedAt ? (
          <p className="text-center text-[11px] text-ink-soft">{t('driver.updated', { time: checkedAt.toLocaleTimeString() })}</p>
        ) : null}
      </main>
    </div>
  );
}
