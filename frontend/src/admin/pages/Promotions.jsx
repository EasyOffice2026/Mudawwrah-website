import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import { kwd } from '../../lib/format';

const empty = {
  code: '',
  titleEn: '',
  titleAr: '',
  subtitleEn: '',
  subtitleAr: '',
  type: 'PERCENT',
  value: 10,
  minOrder: 0,
  maxDiscount: '',
  isActive: true,
  startsAt: '',
  endsAt: '',
};

const toInput = (value) => (value ? new Date(value).toISOString().slice(0, 16) : '');

/** What a code is worth, phrased the way the storefront will show it. */
const worth = (promotion, t) => {
  if (promotion.type === 'FREE_DELIVERY') return t('offers.freeDelivery');
  if (promotion.type === 'PERCENT') return t('offers.percentOff', { value: Number(promotion.value) });
  return t('offers.amountOff', { amount: kwd(promotion.value) });
};

const windowLabel = (promotion, t) => {
  const now = new Date();
  if (!promotion.isActive) return { text: t('admin.promo.paused'), tone: 'bg-gray-100 text-gray-600' };
  if (promotion.startsAt && new Date(promotion.startsAt) > now)
    return { text: t('admin.promo.scheduled'), tone: 'bg-amber-50 text-amber-700' };
  if (promotion.endsAt && new Date(promotion.endsAt) < now)
    return { text: t('admin.promo.expired'), tone: 'bg-gray-100 text-gray-600' };
  return { text: t('admin.promo.running'), tone: 'bg-green-50 text-green-700' };
};

export default function Promotions() {
  const { t } = useTranslation();
  const [promotions, setPromotions] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api
      .get('/promotions/all')
      .then(({ data }) => setPromotions(data))
      .catch((err) => setError(apiError(err)));

  useEffect(() => {
    load();
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { id, createdAt, updatedAt, tenantId, ...rest } = form;
      const payload = {
        ...rest,
        code: String(rest.code || '').trim().toUpperCase(),
        // FREE_DELIVERY carries no amount of its own.
        value: rest.type === 'FREE_DELIVERY' ? 0 : Number(rest.value || 0),
        minOrder: Number(rest.minOrder || 0),
        // Only a percentage discount can be capped.
        maxDiscount: rest.type === 'PERCENT' && rest.maxDiscount !== '' ? Number(rest.maxDiscount) : null,
        startsAt: rest.startsAt ? new Date(rest.startsAt).toISOString() : null,
        endsAt: rest.endsAt ? new Date(rest.endsAt).toISOString() : null,
      };
      if (id) await api.put(`/promotions/${id}`, payload);
      else await api.post('/promotions', payload);
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
      await api.delete(`/promotions/${id}`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const isPercent = form?.type === 'PERCENT';
  const isFreeDelivery = form?.type === 'FREE_DELIVERY';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{t('admin.promotions')}</h1>
        <button type="button" className="btn-primary" onClick={() => setForm({ ...empty })}>
          {t('admin.promo.new')}
        </button>
      </div>
      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      {!promotions.length ? (
        <div className="card text-center text-sm text-gray-500">{t('admin.promo.none')}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promotions.map((promotion) => {
            const state = windowLabel(promotion, t);
            return (
              <div key={promotion.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-sm font-extrabold tracking-wide">{promotion.code}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${state.tone}`}>{state.text}</span>
                </div>
                <p className="text-sm font-semibold">{promotion.titleEn}</p>
                <p className="text-xs text-gray-500">{worth(promotion, t)}</p>
                <p className="text-xs text-gray-500">
                  {t('admin.promo.minOrder')}: {kwd(promotion.minOrder)}
                  {promotion.maxDiscount != null ? ` · ${t('admin.promo.cap')}: ${kwd(promotion.maxDiscount)}` : ''}
                </p>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setForm({
                        ...promotion,
                        titleAr: promotion.titleAr || '',
                        subtitleEn: promotion.subtitleEn || '',
                        subtitleAr: promotion.subtitleAr || '',
                        maxDiscount: promotion.maxDiscount ?? '',
                        startsAt: toInput(promotion.startsAt),
                        endsAt: toInput(promotion.endsAt),
                      })
                    }
                  >
                    {t('common.edit')}
                  </button>
                  <button type="button" className="text-brand underline" onClick={() => remove(promotion.id)}>
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? t('common.edit') : t('admin.promo.new')}
        footer={
          <button type="submit" form="promotion-form" className="btn-primary w-full" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        }
      >
        {form ? (
          <form id="promotion-form" onSubmit={save} className="space-y-3">
            <div>
              <label className="label">{t('admin.promo.code')}</label>
              <input
                className="input font-mono uppercase"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="SUMMER20"
              />
              <p className="mt-1 text-xs text-gray-500">{t('admin.promo.codeHint')}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">{t('admin.promo.titleEn')}</label>
                <input
                  className="input"
                  required
                  value={form.titleEn}
                  onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t('admin.promo.titleAr')}</label>
                <input className="input" value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('admin.promo.subtitleEn')}</label>
                <input
                  className="input"
                  value={form.subtitleEn}
                  onChange={(e) => setForm({ ...form, subtitleEn: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t('admin.promo.subtitleAr')}</label>
                <input
                  className="input"
                  value={form.subtitleAr}
                  onChange={(e) => setForm({ ...form, subtitleAr: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label">{t('admin.promo.type')}</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="PERCENT">{t('admin.promo.percent')}</option>
                <option value="FIXED">{t('admin.promo.fixed')}</option>
                <option value="FREE_DELIVERY">{t('offers.freeDelivery')}</option>
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {!isFreeDelivery ? (
                <div>
                  <label className="label">{isPercent ? t('admin.promo.percentValue') : t('admin.promo.amount')}</label>
                  <input
                    type="number"
                    step={isPercent ? '1' : '0.001'}
                    min="0"
                    max={isPercent ? '100' : undefined}
                    className="input"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                  />
                </div>
              ) : null}
              <div>
                <label className="label">{t('admin.promo.minOrder')}</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  className="input"
                  value={form.minOrder}
                  onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
                />
              </div>
              {isPercent ? (
                <div>
                  <label className="label">{t('admin.promo.cap')}</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="input"
                    value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                    placeholder={t('admin.promo.noCap')}
                  />
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">{t('admin.promo.startsAt')}</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t('admin.promo.endsAt')}</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
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
