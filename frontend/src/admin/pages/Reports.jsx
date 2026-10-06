import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, apiError } from '../../lib/api';
import { dateTime, kwd, localized } from '../../lib/format';
import { buildWorkbook, downloadWorkbook, summaryText } from '../reports/reportExport.js';

// One data hue for every single-series mark; the heatmap ramp steps it light
// to dark. Both checked with the dataviz validator against the white card.
const DATA = '#2a78d6';
// Order counts get their own validated hue so the two charts read apart at a glance.
const ORDERS = '#eb6834';
const HEAT = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'];
const NO_ORDERS = '#eef0f3';
const PRESETS = ['today', 'yesterday', 'week', '7d', 'month', '30d', 'custom'];
const STAGES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const number = (n) => (Number(n) || 0).toLocaleString('en-GB');
const minutes = (n, t) => (n === null || n === undefined ? '—' : t('admin.reports.operations.minutes', { count: n }));
const localeOf = (lang) => (lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB');
const weekday = (d, lang, style = 'short') =>
  new Intl.DateTimeFormat(localeOf(lang), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 4 + d)));
const shortDay = (key, lang) =>
  new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
// The viewer's own calendar date (en-CA reads YYYY-MM-DD), not UTC's — just after
// midnight in Kuwait, UTC is still on yesterday.
const todayKey = () => new Date().toLocaleDateString('en-CA');
const dateOnly = (value, lang) =>
  new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-KW' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Reports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { slug } = useParams();
  const [preset, setPreset] = useState('7d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get('/pickup-locations/all').then(({ data }) => setBranches(data)).catch(() => setBranches([]));
    api.get('/tenants/current').then(({ data }) => setRestaurant(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (preset === 'custom' && !(applied.from && applied.to)) return;
    setLoading(true);
    setError(null);
    const params = { preset, ...(branchId ? { branchId } : {}), ...(preset === 'custom' ? applied : {}) };
    api
      .get('/reports', { params })
      .then(({ data }) => setReport(data))
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, [preset, applied, branchId]);

  // Clears the print mode however the print dialog was closed.
  useEffect(() => {
    const after = () => document.body.classList.remove('print-report');
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);

  const nameOf = (row) => {
    if (row.id === 'none') return t('admin.analytics.beforeBranches');
    return row.nameEn ? localized(row, 'name', lang) : t('admin.analytics.removedBranch');
  };
  const branchName = branchId ? nameOf(branchId === 'none' ? { id: 'none' } : branches.find((b) => b.id === branchId) || {}) : t('admin.allBranches');
  const periodLabel = preset === 'custom' && applied.from ? `${applied.from} – ${applied.to}` : t(`admin.reports.presets.${preset}`);
  const restaurantName = restaurant ? localized(restaurant, 'name', lang) : '';
  const exportContext = { t, branchName, periodLabel, restaurantName, nameOf };

  const exportExcel = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await downloadWorkbook(buildWorkbook(report, exportContext), `${slug}-report-${todayKey()}.xlsx`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setExporting(false);
    }
  };
  const print = () => {
    document.body.classList.add('print-report');
    window.print();
  };
  const shareWhatsapp = () => {
    if (!report) return;
    const text = summaryText(report, { ...exportContext, kwd });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const r = report;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{t('admin.reports.title')}</h1>
          {r ? (
            <p className="text-xs text-gray-500">
              {restaurantName ? `${restaurantName} · ` : ''}
              {branchName} · {dateTime(r.range.from, lang)} – {dateTime(r.range.to, lang)}
            </p>
          ) : null}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" disabled={!r || exporting} onClick={exportExcel}>
            {exporting ? t('admin.reports.export.exporting') : t('admin.reports.export.excel')}
          </button>
          <button type="button" className="btn-ghost" disabled={!r} onClick={print}>
            {t('admin.reports.export.pdf')}
          </button>
          <button type="button" className="btn-ghost" disabled={!r} onClick={shareWhatsapp}>
            {t('admin.reports.export.whatsapp')}
          </button>
        </div>
      </div>

      {/* One filter row; it scopes every figure below it. */}
      <div className="no-print card flex flex-wrap items-end gap-3">
        <div>
          <span className="label">{t('admin.reports.period')}</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('admin.reports.period')}>
            {PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${preset === value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {t(`admin.reports.presets.${value}`)}
              </button>
            ))}
          </div>
        </div>
        {preset === 'custom' ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(custom);
            }}
          >
            <label>
              <span className="label">{t('admin.reports.from')}</span>
              <input type="date" className="input py-1.5" required max={custom.to || todayKey()} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            </label>
            <label>
              <span className="label">{t('admin.reports.to')}</span>
              <input type="date" className="input py-1.5" required min={custom.from || undefined} max={todayKey()} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </label>
            <button type="submit" className="btn-primary py-1.5">
              {t('admin.reports.apply')}
            </button>
          </form>
        ) : null}
        {branches.length ? (
          <label>
            <span className="label">{t('admin.branch')}</span>
            <select className="input w-auto py-1.5" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">{t('admin.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {localized(b, 'name', lang)}
                </option>
              ))}
              <option value="none">{t('admin.analytics.beforeBranches')}</option>
            </select>
          </label>
        ) : null}
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
      {!r && !error ? <p className="text-sm text-gray-500">{preset === 'custom' ? t('admin.reports.pickDates') : t('common.loading')}</p> : null}

      {r ? (
        // A refetch keeps the last report on screen, dimmed, instead of flashing.
        <div className={`space-y-8 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Stat label={t('admin.reports.sales.revenue')} value={kwd(r.sales.revenue)} delta={<Delta value={r.sales.revenueChange} t={t} />} />
            <Stat label={t('admin.reports.sales.orders')} value={number(r.sales.orders)} delta={<Delta value={r.sales.ordersChange} t={t} />} />
            <Stat label={t('admin.reports.sales.averageOrder')} value={kwd(r.sales.averageOrder)} delta={<Delta value={r.sales.averageOrderChange} t={t} />} />
            <Stat
              label={t('admin.reports.orders.cancellationRate')}
              value={`${r.orders.cancellationRate}%`}
              delta={<Delta value={r.orders.previousCancellationRate ? Math.round((r.orders.cancellationRate - r.orders.previousCancellationRate) * 10) / 10 : null} points goodWhenUp={false} t={t} />}
            />
            <Stat
              label={t('admin.reports.customers.title')}
              value={number(r.customers.customers)}
              hint={t('admin.reports.customers.split', { newCount: r.customers.newCustomers, returning: r.customers.returningCustomers })}
            />
          </div>
          <p className="-mt-5 text-xs text-gray-500">{t('admin.reports.sales.revenueHint')}</p>

          <SalesSection r={r} t={t} lang={lang} nameOf={nameOf} />
          <OrdersSection r={r} t={t} lang={lang} />
          <MenuSection r={r} t={t} lang={lang} />
          <CustomersSection r={r} t={t} lang={lang} />
          <PaymentsMarketingSection r={r} t={t} lang={lang} />
          <OperationsSection r={r} t={t} nameOf={nameOf} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/** Signed change vs the previous period. Arrow and words carry the direction; colour only says good or bad. */
const Delta = ({ value, goodWhenUp = true, points = false, compact = false, t }) => {
  if (value === null || value === undefined) {
    return compact ? (
      <span className="text-xs text-gray-400" title={t('admin.reports.noComparison')}>—</span>
    ) : (
      <span className="text-xs text-gray-400">{t('admin.reports.noComparison')}</span>
    );
  }
  const unit = points ? ` ${t('admin.reports.points')}` : '%';
  const suffix = compact ? null : <span className="font-normal text-gray-500"> {t('admin.reports.vsPrevious')}</span>;
  if (value === 0) return <span className="text-xs text-gray-500">→ 0{unit}{suffix}</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-semibold ${up === goodWhenUp ? 'text-green-700' : 'text-red-700'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>{' '}
      <span dir="ltr">
        {up ? '+' : ''}
        {value}
        {unit}
      </span>
      {suffix}
    </span>
  );
};

const Stat = ({ label, value, delta, hint }) => (
  <div className="card print-avoid-break min-w-0">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1.5 text-2xl font-extrabold text-gray-900">{value}</p>
    {delta ? <div className="mt-1">{delta}</div> : null}
    {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
  </div>
);

const Section = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="border-b border-gray-200 pb-1.5 text-lg font-extrabold">{title}</h2>
    {children}
  </section>
);

// min-w-0: a grid item otherwise grows to its widest table on a phone and
// pushes the whole page sideways; this lets the table scroll inside the card.
const Card = ({ title, hint, children, className = '' }) => (
  <div className={`card print-avoid-break min-w-0 ${className}`}>
    {title ? <h3 className="font-bold">{title}</h3> : null}
    {hint ? <p className="mb-3 text-xs text-gray-500">{hint}</p> : title ? <div className="mb-3" /> : null}
    {children}
  </div>
);

/** Horizontal bars with the value written beside each, so nothing hides behind a hover. */
const BarList = ({ rows, empty }) => {
  if (!rows.length) return <p className="text-sm text-gray-500">{empty}</p>;
  const max = Math.max(...rows.map((row) => row.value), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{row.label}</span>
            <span className="shrink-0 font-semibold tabular-nums" dir="ltr">
              {row.display}
            </span>
          </div>
          <div className="mt-1 h-2.5 bg-gray-100" aria-hidden="true">
            <div className="h-full rounded-e-[4px]" style={{ width: `${Math.max((row.value / max) * 100, row.value ? 1.5 : 0)}%`, background: DATA }} />
          </div>
          {row.sub ? <p className="mt-0.5 text-xs text-gray-500">{row.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
};

const Table = ({ head, rows, empty }) =>
  rows.length ? (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-xs uppercase text-gray-500">
          <tr className="border-b border-gray-200">
            {head.map((h, i) => (
              <th key={i} className={`whitespace-nowrap px-2 py-2 ${i ? 'text-end' : 'text-start'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-b border-gray-100 last:border-0">
              {cells.map((cell, i) => (
                <td key={i} className={`px-2 py-2 ${i ? 'whitespace-nowrap text-end' : 'text-start'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="text-sm text-gray-500">{empty}</p>
  );

const ChartTip = ({ active, payload, label, metric, t }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-bold text-gray-900">{metric === 'revenue' ? kwd(p.revenue) : t('admin.reports.sales.ordersCount', { count: p.orders })}</p>
      <p className="text-gray-500">{metric === 'revenue' ? t('admin.reports.sales.ordersCount', { count: p.orders }) : kwd(p.revenue)}</p>
      <p className="text-gray-400">{label}</p>
    </div>
  );
};

/* -------------------------------------------------------------- sections */

function SalesSection({ r, t, lang, nameOf }) {
  // Revenue and order counts both stay on screen: two charts on the same days,
  // never one chart with two y-scales (its bars would line up by accident of scale).
  const rtl = lang === 'ar';
  const data = useMemo(
    () => r.sales.series.points.map((p) => ({ ...p, label: r.sales.series.unit === 'hour' ? `${p.key}:00` : shortDay(p.key, lang) })),
    [r, lang],
  );
  // A count on every bar while they fit (a month of days, or a day of hours);
  // past that the tooltip and the Excel export carry the numbers.
  const labelBars = data.length <= 31;
  const best = Math.max(...r.sales.branches.map((b) => b.revenue), 0) || 1;
  const chart = (metric, colour, height, labelled) => (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} syncId="report-series" margin={{ top: labelled ? 16 : 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="label" reversed={rtl} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={14} />
          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={metric === 'revenue'}
            tickFormatter={(v) => (metric === 'revenue' ? Number(v).toLocaleString('en-GB', { maximumFractionDigits: 0 }) : v)}
          />
          <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }} content={<ChartTip metric={metric} t={t} />} />
          <Bar dataKey={metric} fill={colour} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {labelled ? <LabelList dataKey={metric} position="top" fontSize={10} fill="#374151" /> : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
  return (
    <Section title={t('admin.reports.sections.sales')}>
      <Card>
        <h3 className="mb-3 font-bold">
          {t('admin.reports.sales.overTime')} · {t('admin.reports.sales.revenue')}
        </h3>
        {chart('revenue', DATA, 'h-64', false)}
        <h3 className="mb-2 mt-5 font-bold">{t('admin.reports.sales.orders')}</h3>
        {chart('orders', ORDERS, 'h-48', labelBars)}
      </Card>

      <Card title={t('admin.reports.sales.byBranch')}>
        <Table
          head={[t('admin.branch'), t('admin.reports.sales.revenue'), '', t('admin.reports.sales.orders'), t('admin.reports.sales.averageOrder'), t('admin.reports.orders.cancellationRate'), t('admin.reports.sales.change')]}
          rows={r.sales.branches.map((b) => [
            <span className="font-semibold">{nameOf(b)}</span>,
            kwd(b.revenue),
            <div className="ms-auto h-2.5 w-24 bg-gray-100" aria-hidden="true">
              <div className="h-full rounded-e-[4px]" style={{ width: `${(b.revenue / best) * 100}%`, background: DATA }} />
            </div>,
            number(b.orders),
            b.orders ? kwd(b.averageOrder) : '—',
            `${b.cancellationRate}%`,
            <Delta value={b.revenueChange} compact t={t} />,
          ])}
          empty={t('admin.reports.empty')}
        />
      </Card>
    </Section>
  );
}

function OrdersSection({ r, t, lang }) {
  const o = r.orders;
  const reasonLabel = (key) => t(`admin.reports.reasons.${key}`, key);
  return (
    <Section title={t('admin.reports.sections.orders')}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('admin.reports.orders.placed')} value={number(o.placed)} delta={<Delta value={o.placedChange} t={t} />} />
        <Stat label={t('admin.reports.orders.completed')} value={number(o.completed)} hint={t('admin.reports.orders.completedHint')} />
        <Stat label={t('admin.reports.orders.cancelled')} value={number(o.cancelled)} hint={`${o.cancellationRate}%`} />
        <Stat label={t('admin.reports.orders.open')} value={number(o.open)} hint={STAGES.filter((s) => s !== 'DELIVERED' && o.byStatus[s]).map((s) => `${t(`admin.statuses.${s}`)} ${o.byStatus[s]}`).join(' · ')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('admin.reports.orders.reasons')} hint={t('admin.reports.orders.reasonsHint')}>
          <BarList
            rows={o.cancelReasons.map((x) => ({ key: x.reason, label: reasonLabel(x.reason), value: x.orders, display: `${number(x.orders)} · ${x.share}%` }))}
            empty={t('admin.reports.orders.noCancellations')}
          />
        </Card>
        <Card title={t('admin.reports.orders.areas')} hint={o.areasWithoutLocation ? t('admin.reports.orders.withoutLocation', { count: o.areasWithoutLocation }) : null}>
          <BarList
            rows={o.areas.map((a) => ({ key: a.area, label: lang === 'ar' && a.areaAr ? a.areaAr : a.area, value: a.orders, display: `${number(a.orders)} · ${kwd(a.revenue)}` }))}
            empty={t('admin.reports.empty')}
          />
          {o.blocks.length ? (
            <>
              <h4 className="mb-2 mt-5 text-sm font-bold">{t('admin.reports.orders.blocks')}</h4>
              <Table
                head={[t('admin.area'), t('admin.reports.excel.block'), t('admin.reports.sales.orders')]}
                rows={o.blocks.map((b) => [lang === 'ar' && b.areaAr ? b.areaAr : b.area, b.block, number(b.orders)])}
              />
            </>
          ) : null}
        </Card>
      </div>

      <Card title={t('admin.reports.orders.heatmap')}>
        <Heatmap matrix={o.heatmap} peak={o.peak} t={t} lang={lang} />
      </Card>
    </Section>
  );
}

function Heatmap({ matrix, peak, t, lang }) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...matrix.flat());
  const shade = (n) => (n ? HEAT[Math.min(HEAT.length - 1, Math.ceil((n / max) * HEAT.length) - 1)] : NO_ORDERS);
  const hour = (h) => `${String(h).padStart(2, '0')}:00`;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          {peak ? t('admin.reports.orders.peak', { day: weekday(peak.day, lang, 'long'), hour: hour(peak.hour), count: peak.orders }) : t('admin.reports.empty')}
        </p>
        <button type="button" className="no-print text-xs font-semibold text-gray-700 underline" onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('admin.reports.hideTable') : t('admin.reports.showTable')}
        </button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="text-xs tabular-nums">
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="px-1 py-1 font-semibold text-gray-500">
                    {String(h).padStart(2, '0')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((hours, d) => (
                <tr key={d} className="border-t border-gray-100">
                  <th className="pe-2 text-start font-semibold">{weekday(d, lang)}</th>
                  {hours.map((n, h) => (
                    <td key={h} className={`px-1 py-1 text-center ${n ? 'text-gray-900' : 'text-gray-300'}`}>
                      {n}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}>
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="text-center text-[10px] text-gray-500">
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                </span>
              ))}
              {matrix.map((hours, d) => (
                <div key={d} className="contents">
                  <span className="pe-2 text-xs font-semibold leading-6 text-gray-700">{weekday(d, lang)}</span>
                  {hours.map((n, h) => {
                    const text = t('admin.reports.orders.cell', { day: weekday(d, lang, 'long'), hour: hour(h), count: n });
                    return <span key={h} className="h-6 rounded-[3px]" style={{ background: shade(n) }} title={text} aria-label={text} role="img" />;
                  })}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500" aria-hidden="true">
              <span className="h-3 w-4 rounded-[2px]" style={{ background: NO_ORDERS }} />
              <span className="me-3">0</span>
              <span>{t('admin.reports.fewer')}</span>
              {HEAT.map((c) => (
                <span key={c} className="h-3 w-4 rounded-[2px]" style={{ background: c }} />
              ))}
              <span>{t('admin.reports.more')}</span>
              <span className="ms-2">{t('admin.reports.maxPerCell', { count: max })}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuSection({ r, t, lang }) {
  const m = r.menu;
  const name = (i) => (lang === 'ar' && i.nameAr ? i.nameAr : i.nameEn);
  const rows = (list, measure) =>
    list.map((i) => ({
      key: i.key,
      label: name(i),
      value: measure === 'revenue' ? i.revenue : i.quantity,
      display: measure === 'revenue' ? kwd(i.revenue) : `×${number(i.quantity)}`,
    }));
  return (
    <Section title={t('admin.reports.sections.menu')}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('admin.reports.menu.topByQuantity')}>
          <BarList rows={rows(m.topByQuantity, 'quantity')} empty={t('admin.reports.menu.none')} />
        </Card>
        <Card title={t('admin.reports.menu.topByRevenue')}>
          <BarList rows={rows(m.topByRevenue, 'revenue')} empty={t('admin.reports.menu.none')} />
        </Card>
        <Card title={t('admin.reports.menu.slowMovers')} hint={t('admin.reports.menu.slowHint')}>
          <Table
            head={[t('admin.reports.excel.item'), t('admin.reports.excel.quantity'), t('admin.reports.sales.revenue')]}
            rows={m.slowMovers.map((i) => [name(i), number(i.quantity), kwd(i.revenue)])}
            empty={t('admin.reports.empty')}
          />
        </Card>
        <Card title={t('admin.reports.menu.addons')}>
          <BarList rows={rows(m.addons, 'quantity')} empty={t('admin.reports.menu.noAddons')} />
        </Card>
      </div>
      <Card title={t('admin.reports.menu.categories')} hint={t('admin.reports.menu.categoriesHint')}>
        <BarList
          rows={m.categories.map((c) => ({ key: c.id, label: name(c), value: c.revenue, display: `${kwd(c.revenue)} · ${c.share}%`, sub: t('admin.reports.menu.sold', { count: c.quantity }) }))}
          empty={t('admin.reports.menu.none')}
        />
      </Card>
    </Section>
  );
}

function CustomersSection({ r, t, lang }) {
  const c = r.customers;
  const people = (list) => list.map((p) => [p.name || '—', <span dir="ltr">{p.phone}</span>, number(p.orders), kwd(p.spend), dateTime(p.lastOrder || p.last, lang)]);
  const head = [t('admin.reports.customers.name'), t('admin.reports.customers.phone'), t('admin.reports.sales.orders'), t('admin.reports.customers.spend'), t('admin.reports.customers.lastOrder')];
  const ready = c.historyStarts ? new Date(new Date(c.historyStarts).getTime() + 30 * 864e5) : null;
  return (
    <Section title={t('admin.reports.sections.customers')}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('admin.reports.customers.newCustomers')} value={number(c.newCustomers)} />
        <Stat label={t('admin.reports.customers.returning')} value={number(c.returningCustomers)} hint={t('admin.reports.customers.returningShare', { share: c.returningShare })} />
        <Stat label={t('admin.reports.customers.repeatRate')} value={`${c.repeatRate}%`} hint={t('admin.reports.customers.repeatHint', { count: c.customersEver })} />
        <Stat label={t('admin.reports.customers.lapsedShort')} value={number(c.lapsedCount)} hint={t('admin.reports.customers.lapsedTileHint')} />
      </div>
      {c.invalidPhones ? <p className="text-xs text-gray-500">{t('admin.reports.customers.invalidPhones', { count: c.invalidPhones })}</p> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('admin.reports.customers.topBySpend')}>
          <Table head={head} rows={people(c.topBySpend)} empty={t('admin.reports.empty')} />
        </Card>
        <Card title={t('admin.reports.customers.topByOrders')}>
          <Table head={head} rows={people(c.topByOrders)} empty={t('admin.reports.empty')} />
        </Card>
      </div>
      <Card title={t('admin.reports.customers.lapsed')} hint={t('admin.reports.customers.lapsedHint')}>
        <Table
          head={head}
          rows={people(c.lapsed.slice(0, 20))}
          empty={ready ? t('admin.reports.customers.lapsedEmpty', { date: dateOnly(c.historyStarts, lang), ready: dateOnly(ready, lang) }) : t('admin.reports.empty')}
        />
        {c.lapsedCount > 20 ? <p className="mt-2 text-xs text-gray-500">{t('admin.reports.customers.lapsedMore', { count: c.lapsedCount })}</p> : null}
      </Card>
    </Section>
  );
}

function PaymentsMarketingSection({ r, t, lang }) {
  const p = r.payments;
  const mk = r.marketing;
  const conv = mk.conversion;
  return (
    <>
      <Section title={t('admin.reports.sections.payments')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('admin.reports.payments.methods')}>
            <BarList
              rows={p.methods.map((m) => ({ key: m.method, label: t(`admin.reports.methods.${m.method}`, m.method), value: m.revenue, display: `${kwd(m.revenue)} · ${m.share}%`, sub: t('admin.reports.sales.ordersCount', { count: m.orders }) }))}
              empty={t('admin.reports.empty')}
            />
          </Card>
          <div className="grid content-start gap-3 sm:grid-cols-2">
            <Stat label={t('admin.reports.payments.failed')} value={number(p.failed.orders)} hint={kwd(p.failed.value)} />
            <Stat label={t('admin.reports.payments.abandoned')} value={number(p.abandoned.orders)} hint={kwd(p.abandoned.value)} />
            {!p.onlinePayments ? <p className="text-xs text-gray-500 sm:col-span-2">{t('admin.reports.payments.onlineOff')}</p> : null}
          </div>
        </div>
      </Section>

      <Section title={t('admin.reports.sections.marketing')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('admin.reports.marketing.promos')} hint={t('admin.reports.marketing.promoShare', { share: mk.promoOrderShare })}>
            <Table
              head={[t('admin.reports.marketing.code'), t('admin.reports.sales.orders'), t('admin.reports.marketing.discount'), t('admin.reports.sales.revenue'), t('admin.reports.sales.averageOrder')]}
              rows={mk.promos.map((x) => [<span className="font-mono font-semibold">{x.code}</span>, number(x.orders), kwd(x.discount), kwd(x.revenue), kwd(x.averageOrder)])}
              empty={t('admin.reports.marketing.noPromos')}
            />
          </Card>
          <Card title={t('admin.reports.marketing.sources')} hint={t('admin.reports.marketing.sourcesHint')}>
            <BarList
              rows={mk.sources.map((s) => ({ key: s.source, label: s.source === 'Direct' ? t('admin.reports.marketing.direct') : s.source, value: s.orders, display: `${number(s.orders)} · ${s.share}%` }))}
              empty={t('admin.reports.empty')}
            />
          </Card>
        </div>
        <Card title={t('admin.reports.marketing.conversion')} hint={t('admin.reports.marketing.conversionHint')}>
          {!conv.available ? (
            <p className="text-sm text-gray-500">{t('admin.reports.marketing.conversionBranch')}</p>
          ) : conv.rate === null ? (
            <p className="text-sm text-gray-500">{t('admin.reports.marketing.conversionNotYet')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label={t('admin.reports.marketing.visits')} value={number(conv.visits)} hint={conv.trackedSince ? t('admin.reports.marketing.trackedSince', { date: `${conv.trackedSince.slice(6, 8)}/${conv.trackedSince.slice(4, 6)}/${conv.trackedSince.slice(0, 4)}` }) : null} />
              <Stat label={t('admin.reports.marketing.webOrders')} value={number(conv.orders)} />
              <Stat label={t('admin.reports.marketing.conversionRate')} value={`${conv.rate}%`} />
            </div>
          )}
        </Card>
      </Section>
    </>
  );
}

function OperationsSection({ r, t, nameOf }) {
  const ops = r.operations;
  return (
    <Section title={t('admin.reports.sections.operations')}>
      {!ops.trackedOrders ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('admin.reports.operations.noData')}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('admin.reports.operations.prep')} value={minutes(ops.prep.average, t)} hint={`${t('admin.reports.operations.prepHint')} ${t('admin.reports.operations.basedOn', { count: ops.prep.orders })}`} />
        <Stat label={t('admin.reports.operations.delivery')} value={minutes(ops.delivery.average, t)} hint={`${t('admin.reports.operations.deliveryHint')} ${t('admin.reports.operations.basedOn', { count: ops.delivery.orders })}`} />
        <Stat label={t('admin.reports.operations.total')} value={minutes(ops.total.average, t)} hint={t('admin.reports.operations.basedOn', { count: ops.total.orders })} />
        <Stat label={t('admin.reports.operations.late')} value={number(ops.late)} hint={t('admin.reports.operations.lateHint', { minutes: ops.lateAfterMinutes, share: ops.lateShare })} />
      </div>
      <Card title={t('admin.reports.operations.byBranch')}>
        <Table
          head={[t('admin.branch'), t('admin.reports.operations.prep'), t('admin.reports.operations.delivery'), t('admin.reports.operations.total'), t('admin.reports.operations.late')]}
          rows={ops.branches.map((b) => [nameOf(b), minutes(b.prep.average, t), minutes(b.delivery.average, t), minutes(b.total.average, t), number(b.late)])}
          empty={t('admin.reports.operations.noBranchData')}
        />
      </Card>
    </Section>
  );
}
