import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';

/**
 * "Website open" and "Website closed": two clear buttons that act at once, no Save needed. While closed,
 * customers can browse the menu but the server refuses new orders. Closing asks first, because an owner who
 * taps it by mistake would stop sales.
 */
export default function SiteOpenSwitch({ onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/settings')
      .then(({ data }) => setOpen(data.isOpen === 'true'))
      .catch((err) => setError(apiError(err)));
  }, []);

  const choose = async (next) => {
    if (busy || next === open) return;
    if (!next && !window.confirm(t('admin.site.confirmClose'))) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put('/settings', { isOpen: String(next) });
      const now = data.isOpen === 'true';
      setOpen(now);
      onChange?.(now);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const button = (value, label) => {
    const active = open === value;
    const tone = value ? 'bg-green-600 text-white' : 'bg-red-600 text-white';
    return (
      <button
        type="button"
        aria-pressed={active}
        disabled={busy || open === null}
        onClick={() => choose(value)}
        className={`rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
          active ? tone : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <section className="card flex flex-wrap items-center justify-between gap-3" data-testid="site-open-switch">
      <div className="min-w-0">
        <h2 className="font-bold">{t('admin.site.title')}</h2>
        <p className={`text-sm font-semibold ${open === null ? 'text-gray-500' : open ? 'text-green-700' : 'text-red-700'}`}>
          {open === null ? t('common.loading') : open ? t('admin.site.openNow') : t('admin.site.closedNow')}
        </p>
        {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
      </div>
      <div className="flex gap-2">
        {button(true, t('admin.site.openButton'))}
        {button(false, t('admin.site.closedButton'))}
      </div>
    </section>
  );
}
