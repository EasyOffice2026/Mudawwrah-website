import { useEffect, useState } from 'react';
import { api, apiError } from '../../lib/api';
import ImagePicker from './ImagePicker.jsx';

/**
 * Name, banner and logo — the fields the storefront header and the platform
 * picker actually read (Tenant.nameEn/nameAr/heroUrl/logoUrl), not the
 * similarly-named Settings fields that used to sit on this page. Those wrote
 * to a different table the storefront never looked at, which is exactly why
 * changing them here had no visible effect until now.
 */
export default function BrandingSection() {
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get('/tenants/current')
      .then(({ data }) => setTenant(data))
      .catch((err) => setError(apiError(err)));
  }, []);

  const set = (key) => (event) => {
    setTenant((t) => ({ ...t, [key]: event.target.value }));
    setSaved(false);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.put('/tenant', {
        nameEn: tenant.nameEn,
        nameAr: tenant.nameAr,
        heroUrl: tenant.heroUrl,
        logoUrl: tenant.logoUrl,
      });
      setTenant(data);
      setSaved(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!tenant) return <p className="text-sm text-gray-500">{error || 'Loading…'}</p>;

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-bold">Restaurant identity</h2>
        <p className="mt-1 text-xs text-gray-500">
          What customers see at the top of your menu and on the platform's restaurant list.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Restaurant name (EN)</label>
          <input className="input" value={tenant.nameEn || ''} onChange={set('nameEn')} />
        </div>
        <div>
          <label className="label">Restaurant name (AR)</label>
          <input className="input" dir="rtl" value={tenant.nameAr || ''} onChange={set('nameAr')} />
        </div>
      </div>

      <div>
        <p className="label mb-2">Banner (the photo across the top of your menu)</p>
        <ImagePicker byUrl value={tenant.heroUrl} onChange={(url) => { setTenant((t) => ({ ...t, heroUrl: url })); setSaved(false); }} />
      </div>

      <div>
        <p className="label mb-2">Logo</p>
        <ImagePicker byUrl value={tenant.logoUrl} onChange={(url) => { setTenant((t) => ({ ...t, logoUrl: url })); setSaved(false); }} />
      </div>

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm font-semibold text-green-600">Saved.</p> : null}

      <button type="button" className="btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save identity'}
      </button>
    </section>
  );
}
