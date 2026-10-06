import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import { dateTime, kwd, localized } from '../../lib/format';
import { useAuth } from '../../store/auth';
import OrderReceipt from '../components/OrderReceipt.jsx';
import { useOrderFeed } from '../OrderFeed.jsx';

const STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
// The rider's step means nothing for an order collected at the counter.
const RIDER_STATUSES = ['OUT_FOR_DELIVERY'];
const statusesFor = (order) =>
  order.orderType === 'PICKUP' ? STATUSES.filter((s) => !RIDER_STATUSES.includes(s) || s === order.status) : STATUSES;

export default function Orders() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  // A branch account is confined to its own branch by the server, so it gets
  // no branch filter; the owner and staff can narrow the list to one.
  const canPickBranch = user?.role !== 'BRANCH';
  const [branches, setBranches] = useState([]);
  const [filters, setFilters] = useState({ status: '', channel: '', branchId: '', from: '', to: '', search: '' });
  const [result, setResult] = useState({ data: [], total: 0, page: 1, pageSize: 20 });
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(true);
  const [newIds, setNewIds] = useState(() => new Set());
  const [restaurantName, setRestaurantName] = useState('');
  const seenIds = useRef(null);
  const feed = useOrderFeed();
  const lastVersion = useRef(null);

  useEffect(() => {
    api
      .get('/tenants/current')
      .then(({ data }) => setRestaurantName(data.nameEn))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canPickBranch) return;
    api
      .get('/pickup-locations/all')
      .then(({ data }) => setBranches(data))
      .catch(() => setBranches([]));
  }, [canPickBranch]);

  const lang = i18n.language;
  const statusLabel = (status) => t(`admin.statuses.${status}`, status);
  // Delivery orders name their zone; older ones, and restaurants without zones, the typed area.
  const areaOf = (order) => (order.zone ? localized(order.zone, 'name', lang) : order.area || '—');
  const branchOf = (order) => {
    const branch = order.branch || order.pickupLocation;
    return branch ? localized(branch, 'name', lang) : '—';
  };

  const load = async () => {
    try {
      const params = { page, pageSize: 20 };
      for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
      const { data } = await api.get('/orders', { params });

      // First load only establishes a baseline — no alert for existing orders.
      const ids = new Set(data.data.map((order) => order.id));
      if (seenIds.current) {
        const fresh = data.data.filter((order) => !seenIds.current.has(order.id)).map((order) => order.id);
        if (fresh.length) setNewIds((current) => new Set([...current, ...fresh]));
      }
      seenIds.current = ids;

      setResult(data);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    }
  };

  useEffect(() => {
    // Filter or page change invalidates the baseline.
    seenIds.current = null;
    setNewIds(new Set());
    load();
  }, [filters, page]);

  // The feed's version moves whenever an order arrives or changes status, so the
  // list reloads only then — no fixed-interval refreshing of an unchanged page.
  // While paused the last version is kept, so resuming catches up on whatever changed meanwhile.
  useEffect(() => {
    const version = feed?.version || null;
    if (!live) return;
    if (lastVersion.current && version && version !== lastVersion.current) load();
    lastVersion.current = version;
  }, [feed?.version, live]);

  const setStatus = async (id, status) => {
    try {
      const { data } = await api.patch(`/orders/${id}/status`, { status });
      setDetail((current) => (current?.id === id ? data : current));
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const pushToFoodics = async (id) => {
    try {
      const { data } = await api.post(`/orders/${id}/foodics`);
      setDetail((current) => (current?.id === id ? data : current));
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">{t('admin.orders')}</h1>
        <div className="flex items-center gap-3">
          {newIds.size ? (
            <button
              type="button"
              onClick={() => {
                setNewIds(new Set());
                feed?.markAllSeen();
              }}
              className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-white"
            >
              {t('admin.newCount', { count: newIds.size })} · {t('admin.markSeen')}
            </button>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600">
            <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-green-500' : 'bg-gray-300'}`} />
            <input type="checkbox" className="sr-only" checked={live} onChange={() => setLive((v) => !v)} />
            {live ? t('admin.liveOn') : t('admin.liveOff')}
          </label>
        </div>
      </div>

      <div className={`card grid gap-3 ${canPickBranch && branches.length ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-5'}`}>
        <div>
          <label className="label">{t('admin.status')}</label>
          <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('admin.channel')}</label>
          <select className="input" value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })}>
            <option value="">{t('common.all')}</option>
            <option value="WEB">WEB</option>
            <option value="WHATSAPP">WHATSAPP</option>
          </select>
        </div>
        {canPickBranch && branches.length ? (
          <div>
            <label className="label">{t('admin.branch')}</label>
            <select className="input" value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}>
              <option value="">{t('admin.allBranches')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {localized(branch, 'name', lang)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="label">{t('admin.from')}</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('admin.to')}</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('common.search')}</label>
          <input className="input" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 text-start">{t('admin.orderNumber')}</th>
              <th className="py-2 text-start">{t('admin.customer')}</th>
              <th className="py-2 text-start">{t('admin.area')}</th>
              <th className="py-2 text-start">{t('admin.branch')}</th>
              <th className="py-2 text-start">{t('admin.placedAt')}</th>
              <th className="py-2 text-start">{t('admin.channel')}</th>
              <th className="py-2 text-start">{t('admin.status')}</th>
              <th className="py-2 text-end">{t('admin.total')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {result.data.map((order) => (
              <tr key={order.id} className={`border-t border-gray-100 ${newIds.has(order.id) ? 'bg-brand-light' : ''}`}>
                <td className="py-2 font-semibold">
                  {order.orderNumber}
                  {newIds.has(order.id) ? (
                    <span className="ms-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{t('admin.newBadge')}</span>
                  ) : null}
                </td>
                <td className="py-2">
                  {order.customerName}
                  <span className="block text-xs text-gray-500">{order.customerPhone}</span>
                </td>
                <td className="py-2">
                  {order.orderType === 'PICKUP' ? <span className="text-gray-500">{t('checkout.pickup')}</span> : areaOf(order)}
                </td>
                <td className="py-2">{branchOf(order)}</td>
                <td className="py-2 text-gray-500">{dateTime(order.createdAt, lang)}</td>
                <td className="py-2">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">{order.channel}</span>
                  <span className="block text-xs text-gray-500">
                    {order.paymentMethod} · {order.paymentStatus}
                  </span>
                </td>
                <td className="py-2">
                  <select className="input py-1 text-xs" value={order.status} onChange={(e) => setStatus(order.id, e.target.value)}>
                    {statusesFor(order).map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-end font-semibold">{kwd(order.total)}</td>
                <td className="py-2 text-end">
                  <button type="button" className="text-xs underline" onClick={() => setDetail(order)}>
                    {t('admin.view')}
                  </button>
                </td>
              </tr>
            ))}
            {!result.data.length ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-gray-500">
                  {t('common.noResults')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {pages > 1 ? (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm">
            <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ‹
            </button>
            <span>
              {page} / {pages}
            </span>
            <button type="button" className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              ›
            </button>
          </div>
        ) : null}
      </div>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.orderNumber} size="lg">
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-gray-500">{t('admin.customer')}:</span> {detail.customerName} · {detail.customerPhone}
              </p>
              <p>
                <span className="text-gray-500">{t('checkout.paymentMethod')}:</span> {detail.paymentMethod} · {detail.paymentStatus}
              </p>
              <p>
                <span className="text-gray-500">{t('admin.channel')}:</span> {detail.channel}
              </p>
              {detail.foodicsOrderId || detail.foodicsError ? (
                <p>
                  <span className="text-gray-500">Foodics:</span>{' '}
                  {detail.foodicsOrderId ? (
                    <span className="text-green-700">sent ({detail.foodicsOrderId.slice(0, 8)}…)</span>
                  ) : (
                    <>
                      <span className="text-red-600">{detail.foodicsError}</span>{' '}
                      <button type="button" className="text-brand underline" onClick={() => pushToFoodics(detail.id)}>
                        Retry
                      </button>
                    </>
                  )}
                </p>
              ) : null}
              {detail.pickupLocation ? (
                <p>
                  <span className="text-gray-500">{t('admin.pickupBranch')}:</span> {localized(detail.pickupLocation, 'name', lang)}
                </p>
              ) : detail.branch ? (
                <p>
                  <span className="text-gray-500">{t('admin.branch')}:</span> {localized(detail.branch, 'name', lang)}
                </p>
              ) : null}
              {detail.utmSource || detail.utmMedium || detail.utmCampaign || detail.referrer ? (
                <p className="sm:col-span-2">
                  <span className="text-gray-500">{t('admin.cameFrom')}:</span>{' '}
                  {[detail.utmSource, detail.utmMedium, detail.utmCampaign, detail.utmTerm, detail.utmContent]
                    .filter(Boolean)
                    .join(' / ') || detail.referrer}
                </p>
              ) : null}
              {detail.feedback ? (
                <p>
                  <span className="text-gray-500">{t('admin.feedback')}:</span> {'⭐'.repeat(detail.feedback.rating)}{' '}
                  {detail.feedback.comment || ''}
                </p>
              ) : null}
              {detail.orderType !== 'PICKUP' && (detail.zone || detail.area) ? (
                <p>
                  <span className="text-gray-500">{t('admin.area')}:</span> {areaOf(detail)}
                </p>
              ) : null}
              {detail.address ? (
                <p>
                  <span className="text-gray-500">{t('checkout.address')}:</span> {detail.address}
                </p>
              ) : null}
              {/* The structured parts, so a rider can read them without parsing the line above. */}
              {detail.block || detail.street || detail.building ? (
                <p>
                  {[
                    [t('checkout.block'), detail.block],
                    [t('checkout.street'), detail.street],
                    [t('checkout.building'), detail.building],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => `${label}: ${value}`)
                    .join(' · ')}
                </p>
              ) : null}
              {detail.deliveryLat && detail.deliveryLng ? (
                <p>
                  <span className="text-gray-500">{t('admin.pinnedLocation')}:</span>{' '}
                  <a
                    className="text-brand underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${detail.deliveryLat},${detail.deliveryLng}`}
                  >
                    {t('admin.openInMaps')}
                  </a>
                </p>
              ) : null}
              {detail.notes ? (
                <p>
                  <span className="text-gray-500">{t('checkout.notes')}:</span> {detail.notes}
                </p>
              ) : null}
            </div>
            <ul className="divide-y divide-gray-100">
              {detail.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between py-2">
                  <div>
                    <p className="font-semibold">
                      {item.quantity} × {item.nameEn}
                    </p>
                    {item.customizations?.length ? (
                      <p className="text-xs text-gray-500">{item.customizations.map((c) => c.nameEn).join(', ')}</p>
                    ) : null}
                  </div>
                  <span>{kwd(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1">
              <Row label={t('cart.subtotal')} value={kwd(detail.subtotal)} />
              {Number(detail.discount) > 0 ? <Row label={t('cart.couponDiscount')} value={`− ${kwd(detail.discount)}`} /> : null}
              <Row label={t('cart.deliveryFee')} value={kwd(detail.deliveryFee)} />
              {Number(detail.serviceCharge) > 0 ? <Row label={t('cart.serviceCharge')} value={kwd(detail.serviceCharge)} /> : null}
              {Number(detail.tax) > 0 ? <Row label={t('cart.tax')} value={kwd(detail.tax)} /> : null}
              {/* The one line that was missing here — a tip folds silently into
                  the total otherwise, which is exactly what read as a wrong
                  calculation on a printed ticket that never showed it. */}
              {Number(detail.tip) > 0 ? <Row label={t('checkout.tipTitle')} value={kwd(detail.tip)} /> : null}
              <Row label={t('cart.total')} value={kwd(detail.total)} bold />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {statusesFor(detail).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatus(detail.id, status)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    detail.status === status ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {statusLabel(status)}
                </button>
              ))}
              <button type="button" className="btn-ghost ms-auto" onClick={() => window.print()}>
                🖨️ {t('admin.printTicket')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Off-screen until printed — index.css's print rule hides everything
          else on the page and reveals only this. */}
      <OrderReceipt order={detail} restaurantName={restaurantName} lang={lang} />
    </div>
  );
}

const Row = ({ label, value, bold }) => (
  <div className={`flex justify-between ${bold ? 'font-bold' : 'text-gray-600'}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);
