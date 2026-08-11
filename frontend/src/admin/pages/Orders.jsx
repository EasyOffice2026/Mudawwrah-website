import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import { dateTime, kwd } from '../../lib/format';

const STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'];
const POLL_MS = 15000;

/** Two-tone chime, synthesised so the build needs no audio asset. */
const playChime = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + index * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* audio is a nicety, never a failure */
  }
};

export default function Orders() {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState({ status: '', from: '', to: '', search: '' });
  const [result, setResult] = useState({ data: [], total: 0, page: 1, pageSize: 20 });
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(true);
  const [newIds, setNewIds] = useState(() => new Set());
  const seenIds = useRef(null);

  const load = async () => {
    try {
      const params = { page, pageSize: 20 };
      for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
      const { data } = await api.get('/orders', { params });

      // First load only establishes a baseline — no alert for existing orders.
      const ids = new Set(data.data.map((order) => order.id));
      if (seenIds.current) {
        const fresh = data.data.filter((order) => !seenIds.current.has(order.id)).map((order) => order.id);
        if (fresh.length) {
          setNewIds((current) => new Set([...current, ...fresh]));
          playChime();
        }
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

  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [live, filters, page]);

  const setStatus = async (id, status) => {
    try {
      const { data } = await api.patch(`/orders/${id}/status`, { status });
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
              onClick={() => setNewIds(new Set())}
              className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-white"
            >
              {newIds.size} new · {t('admin.markSeen')}
            </button>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600">
            <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-green-500' : 'bg-gray-300'}`} />
            <input type="checkbox" className="sr-only" checked={live} onChange={() => setLive((v) => !v)} />
            {live ? t('admin.liveOn') : t('admin.liveOff')}
          </label>
        </div>
      </div>

      <div className="card grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label">{t('admin.status')}</label>
          <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div>
          <label className="label">To</label>
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
              <th className="py-2 text-start">{t('admin.placedAt')}</th>
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
                    <span className="ms-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">NEW</span>
                  ) : null}
                </td>
                <td className="py-2">
                  {order.customerName}
                  <span className="block text-xs text-gray-500">{order.customerPhone}</span>
                </td>
                <td className="py-2 text-gray-500">{dateTime(order.createdAt, i18n.language)}</td>
                <td className="py-2">
                  <select className="input py-1 text-xs" value={order.status} onChange={(e) => setStatus(order.id, e.target.value)}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
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
                <td colSpan={6} className="py-6 text-center text-gray-500">
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
                <span className="text-gray-500">{t('checkout.paymentMethod')}:</span> {detail.paymentMethod}
              </p>
              {detail.address ? (
                <p>
                  <span className="text-gray-500">{t('checkout.address')}:</span> {detail.address}
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
              <Row label={t('cart.deliveryFee')} value={kwd(detail.deliveryFee)} />
              {Number(detail.serviceCharge) > 0 ? <Row label={t('cart.serviceCharge')} value={kwd(detail.serviceCharge)} /> : null}
              <Row label={t('cart.total')} value={kwd(detail.total)} bold />
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatus(detail.id, status)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    detail.status === status ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

const Row = ({ label, value, bold }) => (
  <div className={`flex justify-between ${bold ? 'font-bold' : 'text-gray-600'}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);
