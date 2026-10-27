import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, API_BASE, tokenKey } from '../lib/api';
import { playChime, unlockAudio, watchAudio } from '../lib/chime';
import { dateTime, kwd, localized } from '../lib/format';
import { createSseParser, isSilent, POLL_MS, reconnectDelay, shouldPoll } from '../lib/liveStream';
import { shouldChimeAgain, waitingAlarm } from '../lib/waiting';


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
  // The latest value for the polling callback, which must not be re-created on every change.
  const lastSeenRef = useRef(lastSeen);
  useEffect(() => {
    lastSeenRef.current = lastSeen;
  }, [lastSeen]);
  // Orders this tab already knows about; null until the first load, which only
  // sets the baseline — opening the dashboard shouldn't chime for old orders.
  const known = useRef(null);
  // When the chime last sounded, so a waiting order repeats it without doubling up.
  const lastChime = useRef(0);

  const announce = useCallback(
    (fresh) => {
      lastChime.current = Date.now();
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

  // Whether the live connection is open, when the feed was last fetched, and when the connection last spoke.
  const live = useRef(false);
  const lastLoadAt = useRef(0);
  const lastByteAt = useRef(0);

  const loadRef = useRef(load);
  const feedRef = useRef(feed);
  useEffect(() => {
    loadRef.current = load;
    feedRef.current = feed;
  }, [load, feed]);

  // The regular check is the safety net: every 10 s while the live connection is down, once a minute while it is
  // up (the connection already brings every change at once, and each check costs the server several queries).
  useEffect(() => {
    const check = () => {
      if (!shouldPoll({ live: live.current, lastLoadAt: lastLoadAt.current, now: Date.now() })) return;
      lastLoadAt.current = Date.now();
      load();
    };
    lastLoadAt.current = 0;
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // The live connection: the server says "orders" the moment an order is placed, paid or moved, and the screen
  // fetches at once instead of waiting for the next check. It reconnects by itself and, if it cannot, the regular
  // check above still covers it.
  useEffect(() => {
    let stopped = false;
    let controller;
    let timer;
    let attempt = 0;
    const connect = async () => {
      controller = new AbortController();
      try {
        const response = await fetch(`${API_BASE}/orders/stream`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem(tokenKey(slug)) || ''}`,
            'X-Tenant': slug,
            'X-Storefront-Host': window.location.hostname,
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);
        attempt = 0;
        live.current = true;
        lastByteAt.current = Date.now();
        const parse = createSseParser(() => loadRef.current());
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          lastByteAt.current = Date.now();
          parse(decoder.decode(value, { stream: true }));
        }
      } catch {
        /* dropped or refused: try again below */
      }
      // Until it is back, the regular check runs every 10 s again.
      live.current = false;
      if (!stopped) {
        timer = setTimeout(connect, reconnectDelay(attempt));
        attempt += 1;
      }
    };
    connect();
    // A connection can die without closing (a phone network switching, a laptop waking): no heartbeat for 45 s
    // means it is gone, so it is dropped and opened again rather than trusted while orders go unseen.
    const watchdog = setInterval(() => {
      if (isSilent({ live: live.current, lastByteAt: lastByteAt.current, now: Date.now() })) controller?.abort();
    }, 15000);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(timer);
      clearInterval(watchdog);
    };
  }, [slug]);

  // An order nobody has accepted keeps chiming (every 30 s, after its first minute) until it is accepted.
  useEffect(() => {
    const id = setInterval(() => {
      const alarm = waitingAlarm(feedRef.current.waiting);
      if (shouldChimeAgain(alarm, lastChime.current)) {
        lastChime.current = Date.now();
        playChime();
      }
    }, 10000);
    return () => clearInterval(id);
  }, []);

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

  // Whether the browser lets this page chime right now (see watchAudio).
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => watchAudio(setSoundOn), []);
  const enableSound = useCallback(() => {
    unlockAudio();
    playChime(); // so they hear what an alert sounds like
  }, []);

  const enableAlerts = useCallback(async () => {
    unlockAudio();
    playChime(); // so they hear what an alert sounds like
    if (canNotify() && Notification.permission === 'default') setPermission(await Notification.requestPermission());
  }, []);

  const isUnseen = useCallback((order) => new Date(order.createdAt) > new Date(lastSeen), [lastSeen]);

  return (
    <FeedContext.Provider value={{ ...feed, isUnseen, markAllSeen, enableAlerts, enableSound, soundOn, permission, reload: load }}>
      {children}
    </FeedContext.Provider>
  );
}

/**
 * Shown only while the browser is keeping this page silent. One click turns the
 * chime on; the first click anywhere does too, so it disappears on its own.
 */
export function SoundOffPill() {
  const { t } = useTranslation();
  const feed = useOrderFeed();
  if (!feed || feed.soundOn) return null;
  return (
    <button
      type="button"
      onClick={feed.enableSound}
      title={t('admin.notifications.soundOffHint')}
      className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-200"
    >
      <span aria-hidden="true">🔇</span> {t('admin.notifications.soundOff')}
    </button>
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

/** Re-renders now and then, so "waiting 7 min" keeps counting without a new fetch. */
const useNow = (ms) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
};

/**
 * Across the top of every admin page while orders wait to be accepted, stronger the longer they wait (amber, then
 * red, then pulsing). Branch screens see their own; the owner also sees which branch is sitting on them.
 */
export function WaitingBanner({ base }) {
  const { t, i18n } = useTranslation();
  const feed = useOrderFeed();
  const now = useNow(15000);
  const alarm = waitingAlarm(feed?.waiting, now);
  if (!feed || alarm.level === 'none') return null;
  const tone =
    alarm.level === 'urgent'
      ? 'animate-pulse bg-red-700 text-white'
      : alarm.level === 'late'
        ? 'bg-red-600 text-white'
        : 'bg-amber-100 text-amber-900';
  const branches = (feed.waitingByBranch || []).filter((row) => row.nameEn);
  return (
    <Link
      to={`${base}/orders`}
      role="alert"
      data-testid="waiting-banner"
      data-level={alarm.level}
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm font-bold ${tone}`}
    >
      <span>
        {alarm.level === 'urgent' ? `${t('admin.waiting.urgent')} · ` : ''}
        {t('admin.waiting.banner', { count: alarm.count })} · {t('admin.waiting.oldest', { minutes: alarm.minutes })}
      </span>
      {branches.length ? (
        <span className="text-xs font-semibold opacity-90">
          {branches.map((row) => `${localized(row, 'name', i18n.language)} (${row.count})`).join(' · ')}
        </span>
      ) : null}
    </Link>
  );
}
