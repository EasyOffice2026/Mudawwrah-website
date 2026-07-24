import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import ImagePicker from '../components/ImagePicker.jsx';

const empty = { titleEn: '', titleAr: '', imageId: null, linkUrl: '', displayOrder: 0, isActive: true, startsAt: '', endsAt: '' };

const toInput = (value) => (value ? new Date(value).toISOString().slice(0, 16) : '');

export default function Banners() {
  const { t } = useTranslation();
  const [banners, setBanners] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api
      .get('/banners/all')
      .then(({ data }) => setBanners(data))
      .catch((err) => setError(apiError(err)));

  useEffect(() => {
    load();
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { id, image, createdAt, updatedAt, ...rest } = form;
      const payload = {
        ...rest,
        displayOrder: Number(rest.displayOrder || 0),
        startsAt: rest.startsAt ? new Date(rest.startsAt).toISOString() : null,
        endsAt: rest.endsAt ? new Date(rest.endsAt).toISOString() : null,
      };
      if (id) await api.put(`/banners/${id}`, payload);
      else await api.post('/banners', payload);
      setForm(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/banners/${id}`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{t('admin.banners')}</h1>
        <button type="button" className="btn-primary" onClick={() => setForm({ ...empty })}>
          {t('common.create')}
        </button>
      </div>
      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {banners.map((banner) => (
          <div key={banner.id} className="card space-y-2">
            {banner.image?.url ? (
              <img src={banner.image.url} alt="" className="h-32 w-full rounded-lg object-cover" />
            ) : (
              <div className="h-32 w-full rounded-lg bg-gray-100" />
            )}
            <p className="text-sm font-semibold">{banner.titleEn || '—'}</p>
            <p className="text-xs text-gray-500">
              #{banner.displayOrder} · {banner.isActive ? t('admin.active') : t('common.no')}
            </p>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                className="underline"
                onClick={() =>
                  setForm({ ...banner, startsAt: toInput(banner.startsAt), endsAt: toInput(banner.endsAt), linkUrl: banner.linkUrl || '' })
                }
              >
                {t('common.edit')}
              </button>
              <button type="button" className="text-brand underline" onClick={() => remove(banner.id)}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? t('common.edit') : t('common.create')}
        footer={
          <button type="submit" form="banner-form" className="btn-primary w-full" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        }
      >
        {form ? (
          <form id="banner-form" onSubmit={save} className="space-y-3">
            <div>
              <label className="label">Title (EN)</label>
              <input className="input" value={form.titleEn || ''} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
            </div>
            <div>
              <label className="label">Title (AR)</label>
              <input className="input" value={form.titleAr || ''} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('admin.media')}</label>
              <ImagePicker value={form.imageId} onChange={(imageId) => setForm({ ...form, imageId })} />
            </div>
            <div>
              <label className="label">Link URL</label>
              <input className="input" value={form.linkUrl || ''} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Order</label>
                <input
                  type="number"
                  className="input"
                  value={form.displayOrder}
                  onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Starts at</label>
                <input type="datetime-local" className="input" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </div>
              <div>
                <label className="label">Ends at</label>
                <input type="datetime-local" className="input" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={Boolean(form.isActive)}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              {t('admin.active')}
            </label>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
