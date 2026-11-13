import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { isOut } from '../../lib/delivery';
import { currentTenantSlug, tenantPath } from '../../lib/tenant';

/**
 * On a delivery order: which driver has it, and giving it to one (or taking it back).
 *
 * `drivers` is the list the order desk may choose from (a branch sees its own and the shared ones). The driver who
 * already has the order is always shown, even if they are no longer on that list. While the order is on its way a
 * link opens the customer's own tracking page, so the desk sees exactly what the customer sees.
 */
export default function DriverPicker({ order, drivers, onChanged }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const finished = ['DELIVERED', 'CANCELLED'].includes(order.status);
  const listed = drivers || [];
  const current = order.driver && !listed.some((d) => d.id === order.driver.id) ? [order.driver] : [];

  const assign = async (driverId) => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch(`/orders/${order.id}/driver`, { driverId: driverId || null });
      onChanged(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="driver-picker">
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-gray-500">{t('admin.driver.label')}:</span>
        {finished ? (
          <span>{order.driver ? order.driver.name : '—'}</span>
        ) : (
          <select
            className="input w-auto py-1.5 text-sm"
            aria-label={t('admin.driver.choose')}
            value={order.driver?.id || ''}
            disabled={saving}
            onChange={(e) => assign(e.target.value)}
          >
            <option value="">{t('admin.driver.none')}</option>
            {[...current, ...listed].map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
                {driver.activeOrders === undefined ? '' : ` · ${driver.activeOrders ? t('admin.driver.inHand', { count: driver.activeOrders }) : t('admin.driver.free')}`}
              </option>
            ))}
          </select>
        )}
        {order.driver?.phone ? (
          <a className="text-xs underline" dir="ltr" href={`tel:${order.driver.phone}`}>
            {order.driver.phone}
          </a>
        ) : null}
        {order.driver && isOut(order) ? (
          <a className="text-xs font-semibold text-brand underline" target="_blank" rel="noreferrer" href={tenantPath(currentTenantSlug(), `/track/${order.id}`)}>
            🛵 {t('admin.driver.follow')}
          </a>
        ) : null}
      </p>
      {!finished && drivers && !listed.length && !order.driver ? <p className="text-xs text-gray-500">{t('admin.driver.noDrivers')}</p> : null}
      {error ? <p className="text-xs font-semibold text-brand">{error}</p> : null}
    </div>
  );
}
