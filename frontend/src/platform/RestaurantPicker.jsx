import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { localized } from '../lib/format';
import { resetTheme } from '../lib/theme';

const Card = ({ tenant, lang }) => (
  <div
    className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg"
    style={{ '--tile': tenant.brandColor }}
  >
    <div className="relative h-36" style={{ backgroundColor: tenant.brandColor }}>
      {tenant.heroUrl ? (
        <img src={tenant.heroUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : null}
      {/* Brand-tinted scrim keeps each card recognisably that restaurant's. */}
      <div
        className="absolute inset-0 flex items-end p-4"
        style={{ background: `linear-gradient(to top, ${tenant.brandColor}f2, ${tenant.brandColor}33 55%, transparent)` }}
      >
        <span className="text-2xl font-extrabold leading-tight text-white drop-shadow">
          {localized(tenant, 'name', lang)}
        </span>
      </div>
    </div>
    <div className="space-y-3 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: tenant.accentColor }}>
          {localized(tenant, 'cuisine', lang)}
        </p>
        <p className="mt-1 text-sm text-gray-600">{localized(tenant, 'tagline', lang)}</p>
      </div>
      <p className="text-xs text-gray-400">
        {tenant._count?.items ?? 0} items · {tenant._count?.categories ?? 0} categories · {tenant.currency}
      </p>
      <div className="flex gap-2 pt-1">
        <Link
          to={`/r/${tenant.slug}`}
          className="btn flex-1 text-white"
          style={{ backgroundColor: tenant.brandColor }}
        >
          Open store
        </Link>
        <Link to={`/r/${tenant.slug}/admin/login`} className="btn-ghost">
          Admin
        </Link>
      </div>
    </div>
  </div>
);

export default function RestaurantPicker() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [tenants, setTenants] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tenants');
      setTenants(data);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // The platform page uses neutral branding, not the last restaurant's.
    resetTheme();
    document.documentElement.dir = 'ltr';
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">F&amp;B Ordering Platform</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">One platform, every restaurant</h1>
          <p className="mt-3 max-w-2xl text-sm text-gray-600">
            Each restaurant below runs on the same codebase with its own menu, branding, prices, WhatsApp number and
            admin panel. Adding a new client is configuration, not development.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {loading ? <p className="py-10 text-center text-sm text-gray-500">Loading restaurants…</p> : null}

        {error ? (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-red-600">{error}</p>
            <button type="button" className="btn-ghost mt-3" onClick={load}>
              Retry
            </button>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tenants.map((tenant) => (
            <Card key={tenant.id} tenant={tenant} lang={lang} />
          ))}
        </div>

        {!loading && !error ? (
          <div className="mt-10 rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-600">
            <p className="font-semibold text-gray-800">How a new restaurant goes live</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Create the restaurant and set its name, colours and currency</li>
              <li>Import or enter the menu, then upload photos</li>
              <li>Connect its WhatsApp number and delivery settings</li>
              <li>Point its own domain at the platform — no code changes</li>
            </ol>
          </div>
        ) : null}
      </main>
    </div>
  );
}
