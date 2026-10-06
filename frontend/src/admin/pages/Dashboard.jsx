import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, apiError } from '../../lib/api';
import { dateTime, kwd, localized } from '../../lib/format';
import BranchAnalytics from '../components/BranchAnalytics.jsx';

const ranges = ['daily', 'weekly', 'monthly'];

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [range, setRange] = useState('daily');
  // '' = every branch; a branch id narrows the whole overview to that branch.
  const [branchId, setBranchId] = useState('');
  const [view, setView] = useState('overview');
  const [branches, setBranches] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/pickup-locations/all')
      .then(({ data }) => setBranches(data))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    setError(null);
    api
      .get('/dashboard/stats', { params: { range, branchId: branchId || undefined } })
      .then(({ data }) => setStats(data))
      .catch((err) => setError(apiError(err)));
  }, [range, branchId]);

  const pickBranch = (id) => {
    setBranchId(id);
    setView('overview');
  };

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-extrabold">{t('admin.dashboard')}</h1>
      {branches.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {view === 'overview' ? (
            <select
              className="input w-auto py-1.5 text-sm"
              aria-label={t('admin.branch')}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">{t('admin.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {localized(b, 'name', lang)}
                </option>
              ))}
              <option value="none">{t('admin.analytics.beforeBranches')}</option>
            </select>
          ) : null}
          <button
            type="button"
            aria-pressed={view === 'branches'}
            onClick={() => setView(view === 'branches' ? 'overview' : 'branches')}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold ${
              view === 'branches' ? 'bg-brand text-white' : 'bg-white text-brand ring-1 ring-brand'
            }`}
          >
            {view === 'branches' ? t('admin.analytics.backToOverview') : t('admin.analytics.branchesButton')}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (view === 'branches') {
    return (
      <div className="space-y-4">
        {toolbar}
        <BranchAnalytics onPick={pickBranch} />
      </div>
    );
  }

  if (error)
    return (
      <div className="space-y-4">
        {toolbar}
        <p className="text-sm font-semibold text-brand">{error}</p>
      </div>
    );
  if (!stats) return <p className="text-sm text-gray-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      {toolbar}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label={t('admin.kpi.todayOrders')} value={stats.kpis.todayOrders} />
        <Kpi label={t('admin.kpi.todayRevenue')} value={kwd(stats.kpis.todayRevenue)} />
        <Kpi label={t('admin.kpi.pendingOrders')} value={stats.kpis.pendingOrders} />
        <Kpi label={t('admin.kpi.cancelledOrders')} value={stats.kpis.cancelledOrders} />
        <Kpi label={t('admin.kpi.totalCustomers')} value={stats.kpis.totalCustomers} />
      </div>

      {/* Revenue and order counts, both always visible: two charts on the
          same days rather than one chart with two y-scales, whose bars would
          line up by accident of scale, not meaning. */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{t('admin.revenue')}</h2>
          <div className="flex gap-1">
            {ranges.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                  range === value ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t(`admin.${value}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.revenueSeries} syncId="dashboard-series">
              <CartesianGrid vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} />
              <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }} content={<SeriesTip t={t} />} />
              <Bar dataKey="revenue" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <h2 className="mb-2 mt-5 font-bold">{t('admin.orders')}</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.revenueSeries} syncId="dashboard-series" margin={{ top: 16 }}>
              <CartesianGrid vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(235,104,52,0.08)' }} content={<SeriesTip t={t} />} />
              <Bar dataKey="orders" fill="#eb6834" radius={[4, 4, 0, 0]} maxBarSize={24}>
                {/* The count written on each bar, as asked: no hovering needed to read it. */}
                <LabelList dataKey="orders" position="top" fontSize={10} fill="#374151" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-bold">{t('admin.recentOrders')}</h2>
          {!stats.recentOrders.length ? (
            <p className="text-sm text-gray-500">{t('common.noResults')}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {stats.recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 font-semibold">{order.orderNumber}</td>
                    <td className="py-2 text-gray-500">{order.customerName}</td>
                    <td className="py-2 text-gray-500">{dateTime(order.createdAt, i18n.language)}</td>
                    <td className="py-2 text-end font-semibold">{kwd(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-bold">{t('admin.bestSellers')}</h2>
          {!stats.bestSellers.length ? (
            <p className="text-sm text-gray-500">{t('common.noResults')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.bestSellers.map((item) => (
                <li key={item.name} className="flex items-center justify-between">
                  <span>{item.name}</span>
                  <span className="text-gray-500">
                    ×{item.quantity} · {kwd(item.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const Kpi = ({ label, value }) => (
  <div className="card">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-2 text-2xl font-extrabold text-brand">{value}</p>
  </div>
);

/** One tooltip for both charts: the day's revenue and its number of orders. */
const SeriesTip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-bold text-gray-900">{kwd(p.revenue)}</p>
      <p className="text-gray-600">
        {p.orders} {t('admin.orders')}
      </p>
      <p className="text-gray-400">{label}</p>
    </div>
  );
};
