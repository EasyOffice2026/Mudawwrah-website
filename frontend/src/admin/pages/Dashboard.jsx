import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, apiError } from '../../lib/api';
import { dateTime, kwd } from '../../lib/format';

const ranges = ['daily', 'weekly', 'monthly'];

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState('daily');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/dashboard/stats', { params: { range } })
      .then(({ data }) => setStats(data))
      .catch((err) => setError(apiError(err)));
  }, [range]);

  if (error) return <p className="text-sm font-semibold text-brand">{error}</p>;
  if (!stats) return <p className="text-sm text-gray-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t('admin.kpi.todayOrders')} value={stats.kpis.todayOrders} />
        <Kpi label={t('admin.kpi.todayRevenue')} value={kwd(stats.kpis.todayRevenue)} />
        <Kpi label={t('admin.kpi.pendingOrders')} value={stats.kpis.pendingOrders} />
        <Kpi label={t('admin.kpi.totalCustomers')} value={stats.kpis.totalCustomers} />
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
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
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(value, key) => (key === 'revenue' ? kwd(value) : value)} />
              <Bar dataKey="revenue" fill="#B00020" radius={[4, 4, 0, 0]} />
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
