import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import { kwd, localized } from '../../lib/format';

const empty = {
  nameEn: '',
  nameAr: '',
  branchId: '',
  deliveryFee: '',
  minimumOrder: '',
  etaMinutes: '',
  isActive: true,
  displayOrder: 0,
};

// An empty box means "use the restaurant-wide value in Settings", which the
// API stores as null — never as 0, which would be a real free-delivery zone.
const orNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));
const toInput = (value) => (value === null || value === undefined ? '' : String(value));

/**
 * Delivery zones: the areas the restaurant delivers to and the branch serving
 * each. Owner only — fees, minimums and which branch takes an area's orders
 * are business decisions, not something a shift changes.
 */
export default function Zones() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [zones, setZones] = useState(null);
  const [branches, setBranches] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api
      .get('/zones/all')
      .then(({ data }) => setZones(data))
      .catch((err) => setError(apiError(err)));

  useEffect(() => {
    load();
    api
      .get('/pickup-locations/all')
      .then(({ data }) => setBranches(data))
      .catch((err) => setError(apiError(err)));
    api
      .get('/settings')
      .then(({ data }) => setSettings(data))
      .catch(() => {});
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { id, branch, tenantId, createdAt, updatedAt, ...rest } = form;
      const payload = {
        ...rest,
        nameAr: rest.nameAr || null,
        deliveryFee: orNull(rest.deliveryFee),
        minimumOrder: orNull(rest.minimumOrder),
        etaMinutes: orNull(rest.etaMinutes),
        displayOrder: Number(rest.displayOrder || 0),
      };
      if (id) await api.put(`/zones/${id}`, payload);
      else await api.post('/zones', payload);
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
      await api.delete(`/zones/${id}`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  // Either the zone's own amount, or the Settings one it falls back to.
  const money = (value, fallback) =>
    value === null || value === undefined ? (
      <span className="text-gray-500">
        {t('admin.zone.default')}
        {settings ? <span className="block text-xs text-gray-400">{kwd(settings[fallback])}</span> : null}
      </span>
    ) : (
      kwd(value)
    );

  const branchName = (zone) => {
    const branch = zone.branch || branches.find((b) => b.id === zone.branchId);
    return branch ? localized(branch, 'name', lang) : '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{t('admin.zones')}</h1>
        <button
          type="button"
          className="btn-primary"
          disabled={!branches.length}
          onClick={() => setForm({ ...empty, branchId: branches.length === 1 ? branches[0].id : '' })}
        >
          {t('admin.zone.new')}
        </button>
      </div>
      <p className="-mt-2 text-xs text-gray-500">{t('admin.zone.hint')}</p>
      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      {zones !== null && !branches.length ? (
        <div className="card text-center text-sm text-gray-500">{t('admin.zone.needBranch')}</div>
      ) : null}

      {zones === null ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : !zones.length ? (
        <div className="card text-center text-sm text-gray-500">{t('admin.zone.none')}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 text-start">{t('admin.zone.nameEn')}</th>
                <th className="py-2 text-start">{t('admin.zone.nameAr')}</th>
                <th className="py-2 text-start">{t('admin.zone.branch')}</th>
                <th className="py-2 text-start">{t('admin.zone.fee')}</th>
                <th className="py-2 text-start">{t('admin.zone.minimum')}</th>
                <th className="py-2 text-start">{t('admin.zone.eta')}</th>
                <th className="py-2 text-start">{t('admin.active')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.id} className="border-t border-gray-100">
                  <td className="py-2 font-semibold">{zone.nameEn}</td>
                  <td className="py-2" dir="rtl">
                    {zone.nameAr || '—'}
                  </td>
                  <td className="py-2">{branchName(zone)}</td>
                  <td className="py-2">{money(zone.deliveryFee, 'deliveryFee')}</td>
                  <td className="py-2">{money(zone.minimumOrder, 'minimumOrder')}</td>
                  <td className="py-2">{zone.etaMinutes != null ? t('admin.zone.minutes', { minutes: zone.etaMinutes }) : '—'}</td>
                  <td className="py-2">{zone.isActive ? t('common.yes') : t('common.no')}</td>
                  <td className="py-2 text-end">
                    <div className="flex justify-end gap-3 text-xs">
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          setForm({
                            ...zone,
                            nameAr: zone.nameAr || '',
                            deliveryFee: toInput(zone.deliveryFee),
                            minimumOrder: toInput(zone.minimumOrder),
                            etaMinutes: toInput(zone.etaMinutes),
                          })
                        }
                      >
                        {t('common.edit')}
                      </button>
                      <button type="button" className="text-brand underline" onClick={() => remove(zone.id)}>
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? t('common.edit') : t('admin.zone.new')}
        footer={
          <button type="submit" form="zone-form" className="btn-primary w-full" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        }
      >
        {form ? (
          <form id="zone-form" onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">{t('admin.zone.nameEn')}</label>
                <input className="input" required value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('admin.zone.nameAr')}</label>
                <input className="input" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="label">{t('admin.zone.branch')}</label>
              <select className="input" required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">{t('admin.chooseBranch')}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {localized(branch, 'name', lang)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{t('admin.zone.fee')}</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  className="input"
                  placeholder={t('admin.zone.default')}
                  value={form.deliveryFee}
                  onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t('admin.zone.minimum')}</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  className="input"
                  placeholder={t('admin.zone.default')}
                  value={form.minimumOrder}
                  onChange={(e) => setForm({ ...form, minimumOrder: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t('admin.zone.etaMinutes')}</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="input"
                  value={form.etaMinutes}
                  onChange={(e) => setForm({ ...form, etaMinutes: e.target.value })}
                />
              </div>
            </div>
            <p className="-mt-1 text-xs text-gray-500">{t('admin.zone.blankHint')}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">{t('admin.zone.displayOrder')}</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="input"
                  value={form.displayOrder}
                  onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={Boolean(form.isActive)}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                {t('admin.active')}
              </label>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
