import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { kwd, localized } from '../../lib/format';

const PERIODS = ['today', '7d', '30d'];
// Where each order currently stands, in the order it moves through the kitchen.
// REACHED is retired (one "Out for Delivery" step now) but old orders may still
// carry it, so it's counted under Out for Delivery rather than dropped.
const STAGES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const stageCount = (row, stage) =>
  stage === 'OUT_FOR_DELIVERY' ? row.statuses.OUT_FOR_DELIVERY + row.statuses.REACHED : row.statuses[stage];

/**
 * Every branch side by side for one window: orders, revenue, average order,
 * cancellations, and how many orders sit at each step right now. Picking a
 * branch hands it back to the dashboard, which then shows only that branch.
 */
export default function BranchAnalytics({ onPick }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [period, setPeriod] = useState('today');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api
      .get('/dashboard/branches', { params: { period } })
      .then(({ data: result }) => setData(result))
      .catch((err) => setError(apiError(err)));
  }, [period]);

  const nameOf = (row) => {
    if (row.id === 'none') return t('admin.analytics.beforeBranches');
    return row.nameEn ? localized(row, 'name', lang) : t('admin.analytics.removedBranch');
  };

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">{t('admin.analytics.title')}</h2>
          <p className="text-xs text-gray-500">{t('admin.analytics.hint')}</p>
        </div>
        <div className="flex gap-1" role="group" aria-label={t('admin.analytics.period')}>
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                period === value ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t(`admin.analytics.periods.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
      {!data && !error ? <p className="text-sm text-gray-500">{t('common.loading')}</p> : null}

      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs uppercase text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="py-2 pe-3 text-start">{t('admin.branch')}</th>
                <th className="px-2 py-2 text-end">{t('admin.analytics.orders')}</th>
                <th className="px-2 py-2 text-end">{t('admin.revenue')}</th>
                <th className="px-2 py-2 text-end">{t('admin.analytics.averageOrder')}</th>
                <th className="px-2 py-2 text-end">{t('admin.analytics.cancelled')}</th>
                {STAGES.map((stage) => (
                  <th key={stage} className="whitespace-nowrap px-2 py-2 text-end">
                    {t(`admin.statuses.${stage}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label={t('admin.allBranches')} row={data.total} strong />
              {data.branches.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  label={
                    <button type="button" className="text-start font-semibold text-brand underline-offset-2 hover:underline" onClick={() => onPick(row.id)}>
                      {nameOf(row)}
                    </button>
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

const Row = ({ label, row, strong }) => (
  <tr className={`border-b border-gray-100 last:border-0 ${strong ? 'bg-gray-50 font-bold' : ''}`}>
    <td className="py-2 pe-3">{label}</td>
    <td className="px-2 py-2 text-end">{row.orders}</td>
    <td className="whitespace-nowrap px-2 py-2 text-end">{kwd(row.revenue)}</td>
    <td className="whitespace-nowrap px-2 py-2 text-end">{row.orders ? kwd(row.averageOrder) : '—'}</td>
    <td className={`px-2 py-2 text-end ${row.cancelled ? 'text-brand' : ''}`}>{row.cancelled}</td>
    {STAGES.map((stage) => (
      <td key={stage} className="px-2 py-2 text-end text-gray-600">
        {stageCount(row, stage)}
      </td>
    ))}
  </tr>
);
