import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import BrandingSection from '../components/BrandingSection.jsx';
import PickupLocationsSection from '../components/PickupLocationsSection.jsx';

const TEXT_FIELDS = [
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

// Each pairs the settings key with what a customer of that platform actually
// calls the field, and where to find it, so a non-technical owner does not
// have to know the word "pixel" to fill this in correctly.
const TRACKING_FIELDS = [
  { key: 'trackingGa4', label: 'Google Analytics — Measurement ID', placeholder: 'G-XXXXXXXXXX', help: 'Google Analytics → Admin → Data streams → your stream' },
  { key: 'trackingGtm', label: 'Google Tag Manager — Container ID', placeholder: 'GTM-XXXXXXX', help: 'Google Tag Manager → top of the workspace' },
  { key: 'trackingMetaPixel', label: 'Meta Pixel ID (Facebook & Instagram)', placeholder: '123456789012345', help: 'Meta Events Manager → your pixel → Settings' },
  { key: 'trackingTiktokPixel', label: 'TikTok Pixel ID', placeholder: 'C4A1B2C3D4E5F6G7H8I9', help: 'TikTok Ads Manager → Assets → Events → your pixel' },
  { key: 'trackingSnapPixel', label: 'Snapchat Pixel ID', placeholder: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', help: 'Snapchat Ads Manager → Events Manager → your pixel' },
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

      <BrandingSection />

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

      <PickupLocationsSection />

      <section className="card space-y-3">
        <h2 className="font-bold">Marketing &amp; tracking</h2>
        <p className="-mt-1 text-xs text-gray-500">
          Paste only the ID from each platform — never a full script tag. It is added to the storefront for you, on
          every page including checkout, so the platform can measure orders that came from your ads.
        </p>
        {TRACKING_FIELDS.map(({ key, label, placeholder, help }) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input
              className="input"
              placeholder={placeholder}
              value={settings[key] || ''}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-400">{help}</p>
          </div>
        ))}
      </section>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
      {saved ? <p className="text-sm font-semibold text-green-600">{t('admin.saved')}</p> : null}

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}
