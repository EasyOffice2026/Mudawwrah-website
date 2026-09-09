import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';

const TEXT_FIELDS = [
  ['restaurantNameEn', 'Restaurant name (EN)'],
  ['restaurantNameAr', 'Restaurant name (AR)'],
  ['logoUrl', 'Logo URL'],
  ['contactPhone', 'Contact phone'],
  ['whatsappNumber', 'WhatsApp order number (digits only)'],
  ['address', 'Address'],
  ['workingHours', 'Working hours'],
];

const NUMBER_FIELDS = [
  ['deliveryFee', 'Delivery fee (KWD)'],
  ['minimumOrder', 'Minimum order (KWD)'],
  ['serviceChargePercent', 'Service charge (%)'],
  ['taxPercent', 'Tax (%)'],
];

export default function Settings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then(({ data }) => setSettings(data))
      .catch((err) => setError(apiError(err)));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const { data } = await api.put('/settings', settings);
      setSettings(data);
      setSaved(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="text-sm text-gray-500">{error || t('common.loading')}</p>;

  return (
    <form onSubmit={save} className="max-w-2xl space-y-4">
      <h1 className="text-xl font-extrabold">{t('admin.settings')}</h1>

      <section className="card space-y-3">
        <h2 className="font-bold">{t('admin.restaurantInfo')}</h2>
        {TEXT_FIELDS.map(([key, label]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input className="input" value={settings[key] || ''} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} />
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">{t('admin.ordering')}</h2>
        {NUMBER_FIELDS.map(([key, label]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input
              type="number"
              step="0.001"
              className="input"
              value={settings[key] || '0'}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={settings.isOpen === 'true'}
            onChange={(e) => setSettings({ ...settings, isOpen: String(e.target.checked) })}
          />
          Site open for orders
        </label>
      </section>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
      {saved ? <p className="text-sm font-semibold text-green-600">{t('admin.saved')}</p> : null}

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}
