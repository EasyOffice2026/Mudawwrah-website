import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { dateTime, localized } from '../../lib/format';
import { chromeShortcut, stationUrl } from '../../lib/printQueue';

/**
 * Automatic printing: one private link per branch. The branch computer keeps that page open (the print
 * station) and every new order prints on the printer next to it by itself. This page is where the owner
 * finds each link, sees whether tickets are waiting, and gets the one-time setup for the computer.
 */
export default function Printing() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const lang = i18n.language;
  const [stations, setStations] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/print/stations');
      setStations(data);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    }
  };

  useEffect(() => {
    load();
    // Tickets waiting and the last print time stay current while this page is open.
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      /* clipboard blocked: the link is still shown in the box to copy by hand */
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">{t('admin.printing.title')}</h1>
      <p className="-mt-2 max-w-2xl text-sm text-gray-600">{t('admin.printing.intro')}</p>

      <div className="card space-y-1 text-sm">
        <p className="font-bold">{t('admin.printing.setupTitle')}</p>
        <ol className="list-decimal space-y-1 ps-5 text-gray-700">
          <li>{t('admin.printing.step1')}</li>
          <li>{t('admin.printing.step2')}</li>
          <li>{t('admin.printing.step3')}</li>
        </ol>
        <p className="pt-1 text-xs font-semibold text-amber-700">{t('admin.printing.private')}</p>
      </div>

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      {!stations && !error ? <p className="text-sm text-gray-500">{t('common.loading')}</p> : null}

      <div className="space-y-3">
        {(stations || []).map((station) => {
          const url = stationUrl(window.location.origin, slug, station.id, station.key);
          return (
            <section key={station.id} className="card space-y-3" data-testid={`station-${station.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-extrabold">{localized(station, 'name', lang)}</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    station.waiting ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                  }`}
                >
                  {station.waiting ? t('admin.printing.waiting', { count: station.waiting }) : t('admin.printing.noneWaiting')}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {station.lastPrinted
                  ? `${t('admin.printing.lastPrinted')}: ${station.lastPrinted.orderNumber} · ${dateTime(station.lastPrinted.printedAt, lang)}`
                  : t('admin.printing.neverPrinted')}
              </p>
              <input className="input text-xs" readOnly value={url} onFocus={(event) => event.target.select()} aria-label={t('admin.printing.link')} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost" onClick={() => copy(url, `link-${station.id}`)}>
                  {copied === `link-${station.id}` ? t('admin.printing.copied') : t('admin.printing.copyLink')}
                </button>
                <button type="button" className="btn-ghost" onClick={() => copy(chromeShortcut(url), `shortcut-${station.id}`)}>
                  {copied === `shortcut-${station.id}` ? t('admin.printing.copied') : t('admin.printing.copyShortcut')}
                </button>
                <a className="btn-ghost" href={url} target="_blank" rel="noopener noreferrer">
                  {t('admin.printing.open')}
                </a>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
