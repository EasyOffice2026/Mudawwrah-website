import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import OrderReceipt from '../admin/components/OrderReceipt.jsx';
import { api } from '../lib/api';
import { localized } from '../lib/format';
import { pickJobs, SILENT_PRINT_MS, STATION_PRINT_CSS, testTicket } from '../lib/printQueue';
import { thermalLogo } from '../lib/receiptLogo';
import { cachedPath, refresh } from '../lib/storefrontApi';

const POLL_MS = 3000;
// The page reloads itself now and then while idle: it runs for days, and this also picks up new versions.
const RELOAD_AFTER_MS = 6 * 60 * 60 * 1000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Two frames, so the ticket is in the page before the browser is asked to print it.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * The print station: one page kept open on the computer next to a branch's receipt printer.
 *
 * It asks the server every few seconds for tickets waiting at its branch, prints each one, and reports it
 * printed, so a new order comes out on paper by itself with nobody at the dashboard. It does not log in: its
 * private link (the key after the #) is all it needs, so there is nothing to expire overnight.
 *
 * For tickets to print without a pop-up, Chrome must be started with --kiosk-printing and the receipt printer
 * must be the Windows default (see Admin → Printing). If a print dialog does appear, the page says so.
 */
export default function PrintStation() {
  const { t, i18n } = useTranslation();
  const { branchId } = useParams();
  const lang = i18n.language;
  // The key is after the # on purpose: that part of an address is never sent to any server.
  const [key] = useState(() => window.location.hash.replace(/^#/, ''));
  const [openedAt] = useState(() => Date.now());

  const [restaurant, setRestaurant] = useState(() => cachedPath('/tenants/current'));
  const [status, setStatus] = useState(key ? 'starting' : 'badlink');
  const [printing, setPrinting] = useState(null);
  const [recent, setRecent] = useState([]);
  const [branchName, setBranchName] = useState('');
  const [lastCheck, setLastCheck] = useState(null);
  const [dialogSeen, setDialogSeen] = useState(false);
  const [logo, setLogo] = useState(null);
  const busy = useRef(false);
  const done = useRef(new Set());
  const failedAt = useRef(new Map());
  const unreported = useRef([]);

  useEffect(() => {
    refresh('/tenants/current').then(setRestaurant).catch(() => {});
  }, []);

  // The logo, turned black on white for the receipt printer, once; until it is ready (or if it cannot be made) the
  // ticket prints the name alone.
  const logoUrl = restaurant?.logoUrl;
  const logoReady = useRef(Promise.resolve(null));
  useEffect(() => {
    logoReady.current = thermalLogo(logoUrl).then((made) => {
      setLogo(made);
      return made;
    });
  }, [logoUrl]);

  useEffect(() => {
    document.title = `${t('admin.printing.station.title')}${branchName ? ` · ${branchName}` : ''}`;
  }, [t, branchName]);

  // A computer that goes to sleep stops printing, so ask the screen to stay on where the browser allows it.
  useEffect(() => {
    let lock = null;
    const hold = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) || null;
      } catch {
        lock = null;
      }
    };
    hold();
    const again = () => document.visibilityState === 'visible' && hold();
    document.addEventListener('visibilitychange', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      lock?.release?.().catch(() => {});
    };
  }, []);

  const headers = { 'X-Print-Key': key };
  const params = { branch: branchId };

  const printTicket = async (order) => {
    // A few seconds at most for the logo the first time; a ticket is never held up for it.
    await Promise.race([logoReady.current, pause(3000)]);
    setPrinting(order);
    await nextPaint();
    // The logo is a data: picture already made, so it is decoded at once; this only waits for that.
    await Promise.all(
      [...document.querySelectorAll('.print-receipt img')].map((img) => (img.decode ? img.decode().catch(() => {}) : null)),
    );
    const began = Date.now();
    window.print();
    if (Date.now() - began > SILENT_PRINT_MS) setDialogSeen(true);
    return order;
  };

  const report = async (job) => {
    try {
      await api.post(`/print/jobs/${job.id}/printed`, null, { params, headers });
    } catch (error) {
      // Printed but the server did not hear: remember it, so the ticket is not printed a second time.
      if (error.response?.status !== 404) unreported.current.push(job);
    }
  };

  useEffect(() => {
    if (!key) return undefined;
    let stopped = false;
    let timer;

    const poll = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        for (const job of unreported.current.splice(0)) await report(job);
        const { data } = await api.get('/print/jobs', { params, headers });
        setLastCheck(new Date());
        setStatus('ready');
        for (const job of pickJobs(data.jobs, { done: done.current, failedAt: failedAt.current })) {
          if (stopped) break;
          setBranchName(localized(job.branch || {}, 'name', lang) || '');
          try {
            await printTicket(job);
            done.current.add(job.id);
            setRecent((list) => [{ id: job.id, number: job.orderNumber, at: new Date() }, ...list].slice(0, 8));
            await report(job);
          } catch {
            failedAt.current.set(job.id, Date.now());
          } finally {
            setPrinting(null);
          }
          await pause(800);
        }
      } catch (error) {
        setStatus(error.response?.status === 401 ? 'badlink' : 'offline');
      } finally {
        busy.current = false;
      }
    };

    const loop = async () => {
      await poll();
      if (stopped) return;
      if (!busy.current && Date.now() - openedAt > RELOAD_AFTER_MS) {
        window.location.reload();
        return;
      }
      timer = setTimeout(loop, POLL_MS);
    };
    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, branchId]);

  const testPrint = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await printTicket(testTicket());
    } finally {
      setPrinting(null);
      busy.current = false;
    }
  };

  const tone = status === 'ready' ? 'bg-green-500' : status === 'offline' ? 'bg-amber-500' : 'bg-red-500';
  const message =
    status === 'badlink'
      ? t('admin.printing.station.badLink')
      : status === 'offline'
        ? t('admin.printing.station.offline')
        : printing
          ? t('admin.printing.station.printing', { number: printing.orderNumber })
          : status === 'ready'
            ? t('admin.printing.station.ready')
            : t('admin.printing.station.starting');

  return (
    <div className="min-h-screen bg-surface p-6 text-ink" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="mx-auto max-w-lg space-y-4">
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            {restaurant ? localized(restaurant, 'name', lang) : ''}
          </p>
          <h1 className="text-2xl font-extrabold">
            {t('admin.printing.station.title')}
            {branchName ? ` · ${branchName}` : ''}
          </h1>
        </header>

        <section className="card flex items-center gap-4" role="status" aria-live="polite">
          <span className={`h-5 w-5 shrink-0 rounded-full ${tone} ${status === 'ready' && !printing ? 'animate-pulse' : ''}`} />
          <div className="min-w-0">
            <p className="text-base font-bold" data-testid="station-message">
              {message}
            </p>
            {lastCheck ? (
              <p className="text-xs text-ink-soft">
                {t('admin.printing.station.lastCheck')} {lastCheck.toLocaleTimeString()}
              </p>
            ) : null}
          </div>
        </section>

        {dialogSeen ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800" data-testid="station-dialog-warning">
            {t('admin.printing.station.silentWarning')}
          </p>
        ) : null}

        <section className="card">
          <h2 className="text-sm font-bold">
            {t('admin.printing.station.printedHere')} ({recent.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {recent.length ? (
              recent.map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span className="font-semibold">{row.number}</span>
                  <span className="text-ink-soft">{row.at.toLocaleTimeString()}</span>
                </li>
              ))
            ) : (
              <li className="text-ink-soft">{t('admin.printing.station.nothingYet')}</li>
            )}
          </ul>
        </section>

        <button type="button" className="btn-ghost" onClick={testPrint} disabled={Boolean(printing)}>
          🖨️ {t('admin.printing.station.test')}
        </button>
      </main>

      <style>{STATION_PRINT_CSS}</style>
      <OrderReceipt
        order={printing}
        restaurantName={restaurant ? localized(restaurant, 'name', 'en') : ''}
        logo={logo}
        lang="en"
      />
    </div>
  );
}
