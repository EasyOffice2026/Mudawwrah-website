import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { playChime, unlockAudio } from '../lib/chime';
import { dateTime, kwd, localized } from '../lib/format';

// Small and cheap (a few KB), so polling often costs nothing: this is what
// makes a new order show up within seconds on every admin page.
const POLL_MS = 10000;

const FeedContext = createContext(null);

/** The live order feed: latest orders, unseen count, and a version that moves on any change. */
export const useOrderFeed = () => useContext(FeedContext);

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: unseen state just resets on reload */
    }
  },
};

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

/**
 * Watches for new orders from anywhere in the admin: a chime, a red count on
 * the bell, on the Orders link and in the browser tab's title, and a desktop
 * pop-up when allowed — so staff notice even with the dashboard in another tab.
 *
 * "Seen" is per person and per device: the newest order they've marked read.
 */
export function OrderFeedProvider({ slug, user, children }) {
  const { t } = useTranslation();
  const key = `mdawra_orders_seen:${slug}:${user.id ?? user.email}`;
  // A first visit on this device starts from now, not with every past order unread.
  const [lastSeen, setLastSeen] = useState(() => {
    const stored = storage.get(key);
    if (stored) return stored;
    const now = new Date().toISOString();
    storage.set(key, now);
    return now;
  });
  const [feed, setFeed] = useState({ orders: [], unseen: 0, version: null });
  const [permission, setPermission] = useState(() => (canNotify() ? Notification.permission : 'unsupported'));
  const lastSeenRef = useRef(lastSeen);
  lastSeenRef.current = lastSeen;
  // Orders this tab already knows about; null until the first load, which only
  // sets the baseline — opening the dashboard shouldn't chime for old orders.
  const known = useRef(null);

  const announce = useCallback(
    (fresh) => {
      playChime();
      if (!canNotify() || Notification.permission !== 'granted') return;
      for (const order of fresh.slice(0, 3)) {
        const branch = order.branch ? ` · ${order.branch.nameEn}` : '';
        const note = new Notification(t('admin.notifications.newOrder', { number: order.orderNumber }), {
          body: `${order.customerName} · ${kwd(order.total)}${branch}`,
          tag: order.id,
        });
        note.onclick = () => window.focus();
      }
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/orders/feed', { params: { since: lastSeenRef.current } });
      if (known.current) {
        const seenAt = new Date(lastSeenRef.current);
        const fresh = data.orders.filter((o) => !known.current.has(o.id) && new Date(o.createdAt) > seenAt);
        if (fresh.length) announce(fresh);
      }
      known.current = new Set([...(known.current || []), ...data.orders.map((o) => o.id)]);
      setFeed(data);
    } catch {
      /* keep what we have; the next tick tries again */
    }
  }, [announce]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Sound only works after the page has been touched once; take the first click anywhere.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // "(3) Orders…" in the tab, so a new order is visible from another tab too.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = feed.unseen ? `(${feed.unseen > 99 ? '99+' : feed.unseen}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [feed.unseen]);

  /** Marks everything shown as read: the cursor is the newest order's own time, never the device clock. */
  const markAllSeen = useCallback(() => {
    const newest = feed.orders[0]?.createdAt;
    if (!newest || (lastSeenRef.current && new Date(newest) <= new Date(lastSeenRef.current))) return;
    storage.set(key, newest);
    setLastSeen(newest);
    setFeed((current) => ({ ...current, unseen: 0 }));
  }, [feed.orders, key]);

  const enableAlerts = useCallback(async () => {
    unlockAudio();
    playChime(); // so they hear what an alert sounds like
    if (canNotify() && Notification.permission === 'default') setPermission(await Notification.requestPermission());
  }, []);

  const isUnseen = useCallback((order) => new Date(order.createdAt) > new Date(lastSeen), [lastSeen]);

  return (
    <FeedContext.Provider value={{ ...feed, isUnseen, markAllSeen, enableAlerts, permission, reload: load }}>
      {children}
    </FeedContext.Provider>
  );
}

const BellIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/** The bell in the admin header and its notifications panel. */
export function NotificationBell({ base }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const feed = useOrderFeed();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => ref.current && !ref.current.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!feed) return null;
  const count = feed.unseen > 99 ? '99+' : feed.unseen;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`btn-ghost relative ${feed.unseen ? 'text-red-600' : ''}`}
        aria-label={feed.unseen ? t('admin.notifications.unseen', { count: feed.unseen }) : t('admin.notifications.title')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {feed.unseen ? (
          <span className="absolute -end-1 -top-1 min-w-[1.25rem] animate-pulse rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <h2 className="font-bold">{t('admin.notifications.title')}</h2>
            <button type="button" className="text-xs font-semibold text-brand disabled:text-gray-400" disabled={!feed.unseen} onClick={feed.markAllSeen}>
              {t('admin.notifications.markAllRead')}
            </button>
          </div>

          {feed.permission !== 'granted' ? (
            <div className="border-b border-gray-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              {feed.permission === 'denied' ? (
                <p>{t('admin.notifications.blocked')}</p>
              ) : (
                <button type="button" className="font-bold underline" onClick={feed.enableAlerts}>
                  {t('admin.notifications.enableAlerts')}
                </button>
              )}
            </div>
          ) : null}

          <ul className="max-h-[24rem] divide-y divide-gray-100 overflow-y-auto">
            {feed.orders.length ? (
              feed.orders.map((order) => {
                const unseen = feed.isUnseen(order);
                return (
                  <li key={order.id}>
                    <Link
                      to={`${base}/orders`}
                      onClick={() => setOpen(false)}
                      className={`flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 ${unseen ? 'bg-red-50/60' : ''}`}
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unseen ? 'bg-red-600' : 'bg-transparent'}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`font-mono text-xs ${unseen ? 'font-bold' : 'font-semibold'}`}>{order.orderNumber}</span>
                          <span className="shrink-0 tabular-nums font-semibold">{kwd(order.total)}</span>
                        </span>
                        <span className="block truncate text-gray-600">
                          {order.customerName}
                          {order.branch ? ` · ${localized(order.branch, 'name', lang)}` : ''}
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-gray-500">
                          <span>{dateTime(order.createdAt, lang)}</span>
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                            {t(`admin.statuses.${order.status}`, order.status)}
                          </span>
                        </span>
                        {unseen ? <span className="sr-only">{t('admin.newBadge')}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })
            ) : (
              <li className="px-4 py-6 text-center text-sm text-gray-500">{t('admin.notifications.empty')}</li>
            )}
          </ul>

          <Link to={`${base}/orders`} onClick={() => setOpen(false)} className="block border-t border-gray-100 px-4 py-2.5 text-center text-sm font-semibold text-brand hover:bg-gray-50">
            {t('admin.notifications.viewAll')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
