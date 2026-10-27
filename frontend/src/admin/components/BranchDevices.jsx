import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError, deviceKey, readDevice } from '../../lib/api';
import { dateTime, localized } from '../../lib/format';
import { currentTenantSlug } from '../../lib/tenant';

/** A readable default name for the device approving itself: "Chrome on Windows". */
const guessName = () => {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const system = /iPad|iPhone/.test(ua) ? 'iPad/iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'device';
  return `${browser} on ${system}`;
};

/**
 * Branch devices (owner): the branch lock that holds on a 5G line. The owner opens the dashboard on the branch's
 * own computer or tablet, signs in, and approves "this device" for its branch. From the first approved device on,
 * that branch's accounts work on approved devices only, whatever the internet address. Revoking stops a device at
 * once; approve the replacement first, or the branch is unlocked until one is approved again.
 */
export default function BranchDevices({ branches }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const slug = currentTenantSlug();
  const [devices, setDevices] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState(guessName);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(() => readDevice(slug));

  const load = () =>
    api
      .get('/branch-devices')
      .then(({ data }) => setDevices(data))
      .catch((err) => setError(apiError(err)));
  useEffect(() => {
    load();
  }, []);

  const approve = async () => {
    if (!branchId) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/branch-devices/${branchId}`, { name });
      const record = { key: data.key, id: data.device.id, branchId, name: data.device.name };
      try {
        localStorage.setItem(deviceKey(slug), JSON.stringify(record));
      } catch {
        setError(t('admin.devices.storageBlocked'));
      }
      setMine(record);
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (device) => {
    if (!window.confirm(t('admin.devices.confirmRevoke', { name: device.name }))) return;
    setBusy(true);
    try {
      await api.delete(`/branch-devices/${device.id}`);
      if (mine?.id === device.id) {
        try {
          localStorage.removeItem(deviceKey(slug));
        } catch {
          /* nothing kept to remove */
        }
        setMine(null);
      }
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const active = devices.filter((d) => !d.revokedAt);
  const branchName = (id) => localized(branches.find((b) => b.id === id) || {}, 'name', lang) || '—';
  const mineActive = mine && active.some((d) => d.id === mine.id);

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-bold">{t('admin.devices.title')}</h2>
        <p className="text-sm text-gray-500">{t('admin.devices.intro')}</p>
      </div>

      <div className="space-y-2">
        {branches.map((b) => {
          const count = active.filter((d) => d.branchId === b.id).length;
          return (
            <p key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{localized(b, 'name', lang)}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${count ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {count ? t('admin.devices.locked', { count }) : t('admin.devices.open')}
              </span>
            </p>
          );
        })}
      </div>

      <div className="rounded-xl bg-surface p-3">
        <p className="text-sm font-semibold">
          {mineActive ? t('admin.devices.thisApproved', { branch: branchName(mine.branchId) }) : t('admin.devices.thisNot')}
        </p>
        {!mineActive ? (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="label">{t('admin.branch')}</span>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">{t('admin.devices.chooseBranch')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {localized(b, 'name', lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="label">{t('admin.devices.name')}</span>
              <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="button" className="btn-primary" disabled={busy || !branchId} onClick={approve}>
              {t('admin.devices.approveThis')}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      {active.length ? (
        <ul className="divide-y text-sm">
          {active.map((device) => (
            <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold">{device.name}</span>
                {mine?.id === device.id ? <span className="ms-2 text-xs text-green-700">({t('admin.devices.thisOne')})</span> : null} ·{' '}
                {branchName(device.branchId)} ·{' '}
                <span className="text-gray-500">
                  {device.lastSeenAt ? t('admin.devices.lastSeen', { when: dateTime(device.lastSeenAt, lang) }) : t('admin.devices.neverSeen')}
                </span>
              </span>
              <button type="button" className="text-xs text-brand underline" disabled={busy} onClick={() => revoke(device)}>
                {t('admin.devices.revoke')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
