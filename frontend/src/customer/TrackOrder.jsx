import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { isOut, mapPoints, trackPollMs } from '../lib/delivery';
import { kwd, localized } from '../lib/format';
import { cachedPath, refresh } from '../lib/storefrontApi';
import { tenantPath } from '../lib/tenant';
import { applyTheme } from '../lib/theme';
import { PICKUP_TRACK_STAGES, TRACK_STAGES } from './components/checkout/OrderPlaced.jsx';

// The map and its library are only downloaded once there is a delivery to show.
const TrackMap = lazy(() => import('./components/TrackMap.jsx'));

/**
 * A customer's own tracking page, opened from the confirmation screen or from a link: the order's progress, and
 * once the driver has left, where the driver is on a live map and about how long is left.
 *
 * The link's order id is the key to it (nobody can guess one), and the page shows nothing a forwarded link should
 * not: no phone number, no written address. The map appears only while the order is on its way.
 */
export default function TrackOrder() {
  const { t, i18n } = useTranslation();
  const { slug, id } = useParams();
  const lang = i18n.language;
  const [restaurant, setRestaurant] = useState(() => cachedPath('/tenants/current'));
  const [order, setOrder] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    refresh('/tenants/current')
      .then((tenant) => {
        setRestaurant(tenant);
        applyTheme(tenant);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${t('track.title')}${order ? ` · ${order.orderNumber}` : ''}`;
  }, [t, order]);

  // Asks again by itself: every 20 seconds while the kitchen has it, every 5 while it is on its way, never once
  // it is delivered or cancelled.
  const wait = missing ? null : trackPollMs(order);
  useEffect(() => {
    let alive = true;
    let timer;
    const check = async () => {
      try {
        const { data } = await api.get(`/orders/track/${id}`);
        if (alive) setOrder(data);
      } catch (error) {
        if (alive && error.response?.status === 404) setMissing(true);
        // Anything else (no signal for a moment) keeps what is on screen and tries again.
      }
    };
    if (!order) check();
    if (wait) timer = setInterval(check, wait);
    const onVisible = () => document.visibilityState === 'visible' && wait && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // `order` itself is left out on purpose: only how often to ask depends on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, wait]);

  const stages = order?.orderType === 'PICKUP' ? PICKUP_TRACK_STAGES : TRACK_STAGES;
  // REACHED is the old second rider step: on this page it is still "on the way".
  const current = order ? stages.indexOf(order.status === 'REACHED' ? 'OUT_FOR_DELIVERY' : order.status) : -1;
  const delivery = order?.delivery || null;
  const points = isOut(order) ? mapPoints(delivery) : null;
  const time = (iso) => new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-KW' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-surface pb-10 text-ink" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="mx-auto max-w-lg space-y-4 p-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{restaurant ? localized(restaurant, 'name', lang) : ''}</p>
            <h1 className="text-2xl font-extrabold">{t('track.title')}</h1>
            {order ? (
              <p className="text-sm text-ink-soft" dir="ltr">
                {order.orderNumber}
              </p>
            ) : null}
          </div>
          <button type="button" className="text-xs underline" onClick={() => i18n.changeLanguage(lang === 'ar' ? 'en' : 'ar')}>
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </header>

        {missing ? (
          <div className="card py-10 text-center text-sm font-semibold" role="alert">
            {t('track.notFound')}
          </div>
        ) : null}

        {order?.status === 'CANCELLED' ? <div className="card text-center text-sm font-semibold text-brand">{t('track.cancelled')}</div> : null}
        {order?.status === 'DELIVERED' && order.orderType !== 'PICKUP' ? (
          <div className="card text-center text-base font-bold text-green-700">{t('track.delivered')}</div>
        ) : null}

        {isOut(order) ? (
          <section className="card space-y-3" data-testid="track-delivery">
            <div aria-live="polite">
              <p className="text-lg font-extrabold">
                🛵 {delivery?.driverName ? t('track.onTheWay', { name: delivery.driverName }) : t('track.onTheWayNoName')}
              </p>
              {delivery?.etaMinutes ? (
                <p className="text-sm">
                  <span className="font-bold text-brand" data-testid="track-eta">
                    {t('track.eta', { count: delivery.etaMinutes })}
                  </span>{' '}
                  <span className="text-ink-soft">{t('track.etaHint')}</span>
                </p>
              ) : delivery && !delivery.location ? (
                <p className="text-sm text-ink-soft">
                  {delivery.lastSeenAt ? t('track.lastSeen', { time: time(delivery.lastSeenAt) }) : t('track.waitingLocation')}
                </p>
              ) : null}
            </div>
            {points ? (
              <Suspense fallback={<div className="h-72 w-full animate-pulse rounded-2xl bg-hairline sm:h-96" />}>
                <TrackMap driver={points.driver} destination={points.destination} labels={{ driver: t('track.driver'), you: t('track.you') }} />
              </Suspense>
            ) : null}
          </section>
        ) : null}

        {order && order.status !== 'CANCELLED' ? (
          <section className="card">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t('checkout.trackTitle')}</p>
            <ol className="mt-3 space-y-2.5">
              {stages.map((stage, index) => {
                const reached = current >= index;
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
                    <span className={`text-sm ${reached ? 'font-semibold' : 'text-ink-soft'}`}>{t(`checkout.status_${stage}`)}</span>
                  </li>
                );
              })}
            </ol>
            {order.driverAssigned && !isOut(order) ? (
              <p className="mt-3 text-xs text-ink-soft">{t('track.mapStarts')}</p>
            ) : null}
          </section>
        ) : null}

        {order ? (
          <section className="card text-sm">
            <ul className="space-y-1">
              {order.items.map((item, index) => (
                <li key={index}>
                  {item.quantity} × {localized(item, 'name', lang)}
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t border-hairline pt-3 font-bold">
              <span>{t('cart.total')}</span>
              <span>{kwd(order.total)}</span>
            </p>
          </section>
        ) : null}

        <Link className="btn-ghost w-full" to={tenantPath(slug)}>
          {t('track.backToMenu')}
        </Link>
      </main>
    </div>
  );
}
