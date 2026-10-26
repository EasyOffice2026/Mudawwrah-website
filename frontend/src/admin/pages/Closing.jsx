import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { kwd, localized } from '../../lib/format';
import { useAuth } from '../../store/auth';
import { buildClosingWorkbook, paidTime } from '../reports/closingExport.js';
import { downloadWorkbook } from '../reports/reportExport.js';

// The viewer's own calendar date (en-CA reads YYYY-MM-DD): just after midnight in Kuwait, UTC is still on yesterday.
const todayKey = () => new Date().toLocaleDateString('en-CA');

// Ticks are only a help while comparing with Tap's dashboard, kept in this browser per day and branch.
const tickKey = (slug, date, branch) => `closing-ticks:${slug}:${date}:${branch || 'all'}`;
const readTicks = (key) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
};
const saveTicks = (key, ticks) => {
  try {
    localStorage.setItem(key, JSON.stringify([...ticks]));
  } catch {
    // A private window or blocked storage: the ticks simply are not kept.
  }
};

/**
 * Daily closing: every payment taken online on a day, with Tap's reference, to tick off one by one against the
 * Tap dashboard, and the day's totals per payment method and per branch. Branch managers close their own branch
 * with it; the owner can close one branch or all of them.
 */
export default function Closing() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { slug } = useParams();
  const { user } = useAuth();
  const canPickBranch = user?.role !== 'BRANCH';
  const [date, setDate] = useState(todayKey);
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [closing, setClosing] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ticks, setTicks] = useState(() => new Set());

  useEffect(() => {
    if (canPickBranch) api.get('/pickup-locations/all').then(({ data }) => setBranches(data)).catch(() => setBranches([]));
    api.get('/tenants/current').then(({ data }) => setRestaurant(data)).catch(() => {});
  }, [canPickBranch]);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setError(null);
    api
      .get('/reports/closing', { params: { date, ...(branchId ? { branchId } : {}) } })
      .then(({ data }) => {
        setClosing(data);
        setTicks(readTicks(tickKey(slug, data.date, data.branchId)));
      })
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, [date, branchId, slug]);

  // Leaves print mode however the print dialog was closed.
  useEffect(() => {
    const after = () => document.body.classList.remove('print-report');
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);

  const methodName = (method) => t(`admin.reports.methods.${method}`, method);
  const nameOf = (branch) => (branch ? localized(branch, 'name', lang) : t('admin.analytics.beforeBranches'));
  const branchName = closing?.payments[0] && !canPickBranch
    ? nameOf(closing.payments[0].branch)
    : branchId
      ? nameOf(branches.find((b) => b.id === branchId))
      : canPickBranch
        ? t('admin.allBranches')
        : user?.name || '';
  const restaurantName = restaurant ? localized(restaurant, 'name', lang) : '';
  const showBranch = canPickBranch && !branchId;

  const toggle = (id) => {
    const next = new Set(ticks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicks(next);
    saveTicks(tickKey(slug, closing.date, closing.branchId), next);
  };

  const exportExcel = async () => {
    try {
      await downloadWorkbook(
        buildClosingWorkbook(closing, { t, branchName, restaurantName, methodName, nameOf }),
        `${slug}-closing-${closing.date}.xlsx`,
      );
    } catch (err) {
      setError(apiError(err));
    }
  };
  const print = () => {
    document.body.classList.add('print-report');
    window.print();
  };

  const totals = closing?.totals;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{t('admin.closing.title')}</h1>
          <p className="text-sm text-gray-500">{t('admin.closing.intro')}</p>
        </div>
        <div className="no-print flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="label">{t('admin.closing.date')}</span>
            <input type="date" className="input" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} />
          </label>
          {canPickBranch ? (
            <label className="text-sm">
              <span className="label">{t('admin.branch')}</span>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">{t('admin.allBranches')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {localized(b, 'name', lang)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className="btn-ghost" disabled={!closing} onClick={print}>
            {t('admin.closing.print')}
          </button>
          <button type="button" className="btn-ghost" disabled={!closing} onClick={exportExcel}>
            {t('admin.reports.export.excel')}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
      {loading && !closing ? <p className="text-sm text-gray-500">{t('common.loading')}</p> : null}

      {closing ? (
        <>
          <p className="text-sm font-semibold">
            {restaurantName} · {branchName} · {closing.date}
          </p>

          <section className="card grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{t('admin.closing.paidOnline')}</p>
              <p className="text-2xl font-extrabold tabular-nums">{kwd(totals.total)}</p>
              <p className="text-sm text-gray-500">{t('admin.closing.paymentsCount', { count: totals.count })}</p>
            </div>
            <div className="space-y-1 text-sm">
              {Object.entries(totals.byMethod).map(([method, row]) => (
                <p key={method} className="flex justify-between gap-3 tabular-nums">
                  <span>
                    {methodName(method)} ({row.count})
                  </span>
                  <span className="font-semibold">{kwd(row.total)}</span>
                </p>
              ))}
              {totals.refundNeeded.count ? (
                <>
                  <p className="flex justify-between gap-3 text-red-700 tabular-nums">
                    <span>
                      {t('admin.refundNeeded')} ({totals.refundNeeded.count})
                    </span>
                    <span className="font-semibold">− {kwd(totals.refundNeeded.total)}</span>
                  </p>
                  <p className="flex justify-between gap-3 border-t pt-1 font-bold tabular-nums">
                    <span>{t('admin.closing.net')}</span>
                    <span>{kwd(totals.net)}</span>
                  </p>
                </>
              ) : null}
            </div>
            {showBranch && totals.byBranch.length > 1 ? (
              <div className="space-y-1 text-sm">
                {totals.byBranch.map((b) => (
                  <p key={b.branch?.id || 'none'} className="flex justify-between gap-3 tabular-nums">
                    <span>
                      {nameOf(b.branch)} ({b.count})
                    </span>
                    <span className="font-semibold">{kwd(b.total)}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          {closing.notPaidOnline.count ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {t('admin.closing.notPaidOnlineNote', { count: closing.notPaidOnline.count, total: kwd(closing.notPaidOnline.total) })}
            </p>
          ) : null}

          <section className="card overflow-x-auto p-0">
            {closing.payments.length ? (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 text-start text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('admin.closing.checked')}</th>
                    <th className="px-3 py-2 text-start">{t('admin.closing.time')}</th>
                    <th className="px-3 py-2 text-start">{t('admin.closing.order')}</th>
                    {showBranch ? <th className="px-3 py-2 text-start">{t('admin.branch')}</th> : null}
                    <th className="px-3 py-2 text-start">{t('admin.closing.method')}</th>
                    <th className="px-3 py-2 text-start">{t('admin.closing.reference')}</th>
                    <th className="px-3 py-2 text-end">{t('admin.closing.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {closing.payments.map((p) => (
                    <tr key={p.id} className={`border-t ${p.refundNeeded ? 'bg-red-50' : ticks.has(p.id) ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand"
                          checked={ticks.has(p.id)}
                          onChange={() => toggle(p.id)}
                          aria-label={t('admin.closing.tick', { order: p.orderNumber })}
                        />
                      </td>
                      <td className="px-3 py-2 tabular-nums">{paidTime(p.paidAt, closing.timeZone)}</td>
                      <td className="px-3 py-2 font-semibold">
                        {p.orderNumber}
                        {p.refundNeeded ? (
                          <span className="ms-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">{t('admin.refundNeeded')}</span>
                        ) : null}
                      </td>
                      {showBranch ? <td className="px-3 py-2">{nameOf(p.branch)}</td> : null}
                      <td className="px-3 py-2">{methodName(p.method)}</td>
                      <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                        {p.reference || '—'}
                      </td>
                      <td className="px-3 py-2 text-end font-semibold tabular-nums">{kwd(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-bold">
                    <td className="px-3 py-2" colSpan={showBranch ? 6 : 5}>
                      {t('admin.closing.tickedOf', { ticked: closing.payments.filter((p) => ticks.has(p.id)).length, count: totals.count })}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">{kwd(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="p-4 text-sm text-gray-500">{t('admin.closing.empty')}</p>
            )}
          </section>
          <p className="text-xs text-gray-500">{t('admin.closing.howTo')}</p>
        </>
      ) : null}
    </div>
  );
}
