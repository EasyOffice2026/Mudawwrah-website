/**
 * Turning a report into things that leave the dashboard: an Excel workbook
 * (one sheet per section) and a short WhatsApp-ready summary. Both work from
 * the same report object the page shows, so the numbers always agree.
 */

const bold = (value) => ({ value, fontWeight: 'bold' });
const money = (value) => ({ value: Number(value) || 0, format: '#,##0.000' });
const percent = (value) => (value === null || value === undefined ? null : { value: value / 100, format: '0.0%' });
const day = (value) => (value ? { value: new Date(value), type: Date, format: 'dd/mm/yyyy hh:mm' } : null);

const sheet = (name, header, rows, widths) => ({
  sheet: name.slice(0, 31), // Excel's limit on sheet names
  data: [header.map(bold), ...rows],
  columns: widths.map((width) => ({ width })),
  stickyRowsCount: 1,
});

/** Every section of the report as workbook sheets; labels come from the page's own translations. */
export const buildWorkbook = (report, { t, branchName, periodLabel, restaurantName, nameOf }) => {
  const r = report;
  const reason = (key) => t(`admin.reports.reasons.${key}`, key);
  const method = (key) => t(`admin.reports.methods.${key}`, key);
  const sheets = [];

  sheets.push(
    sheet(
      t('admin.reports.excel.summary'),
      [t('admin.reports.excel.measure'), t('admin.reports.excel.thisPeriod'), t('admin.reports.excel.previousPeriod'), t('admin.reports.excel.change')],
      [
        [t('admin.reports.excel.restaurant'), restaurantName, null, null],
        [t('admin.reports.period'), periodLabel, null, null],
        [t('admin.branch'), branchName, null, null],
        [t('admin.reports.excel.from'), day(r.range.from), day(r.range.prevFrom), null],
        [t('admin.reports.excel.to'), day(r.range.to), day(r.range.prevTo), null],
        [t('admin.reports.sales.revenue'), money(r.sales.revenue), money(r.sales.previous.revenue), percent(r.sales.revenueChange)],
        [t('admin.reports.sales.orders'), r.sales.orders, r.sales.previous.orders, percent(r.sales.ordersChange)],
        [t('admin.reports.sales.averageOrder'), money(r.sales.averageOrder), money(r.sales.previous.averageOrder), percent(r.sales.averageOrderChange)],
        [t('admin.reports.orders.placed'), r.orders.placed, null, percent(r.orders.placedChange)],
        [t('admin.reports.orders.completed'), r.orders.completed, null, null],
        [t('admin.reports.orders.cancelled'), r.orders.cancelled, null, null],
        [t('admin.reports.orders.open'), r.orders.open, null, null],
        [t('admin.reports.orders.cancellationRate'), percent(r.orders.cancellationRate), percent(r.orders.previousCancellationRate), null],
        [t('admin.reports.customers.newCustomers'), r.customers.newCustomers, null, null],
        [t('admin.reports.customers.returning'), r.customers.returningCustomers, null, null],
        [t('admin.reports.customers.repeatRate'), percent(r.customers.repeatRate), null, null],
        [t('admin.reports.marketing.visits'), r.marketing.conversion.visits, null, null],
        [t('admin.reports.marketing.conversionRate'), percent(r.marketing.conversion.rate), null, null],
        [t('admin.reports.operations.prep'), r.operations.prep.average, null, null],
        [t('admin.reports.operations.delivery'), r.operations.delivery.average, null, null],
        [t('admin.reports.operations.late'), r.operations.late, null, null],
      ],
      [30, 22, 22, 12],
    ),
  );

  sheets.push(
    sheet(
      t('admin.reports.sales.overTime'),
      [r.sales.series.unit === 'hour' ? t('admin.reports.excel.hour') : t('admin.reports.excel.day'), t('admin.reports.sales.revenue'), t('admin.reports.sales.orders')],
      r.sales.series.points.map((p) => [r.sales.series.unit === 'hour' ? `${p.key}:00` : p.key, money(p.revenue), p.orders]),
      [14, 14, 10],
    ),
  );

  sheets.push(
    sheet(
      t('admin.reports.sales.byBranch'),
      [t('admin.branch'), t('admin.reports.sales.orders'), t('admin.reports.sales.revenue'), t('admin.reports.sales.averageOrder'), t('admin.reports.orders.cancelled'), t('admin.reports.orders.cancellationRate'), t('admin.reports.excel.previousRevenue'), t('admin.reports.excel.change')],
      r.sales.branches.map((b) => [nameOf(b), b.orders, money(b.revenue), money(b.averageOrder), b.cancelled, percent(b.cancellationRate), money(b.previousRevenue), percent(b.revenueChange)]),
      [26, 10, 14, 14, 11, 14, 16, 10],
    ),
  );

  sheets.push(
    sheet(
      t('admin.reports.orders.reasons'),
      [t('admin.reports.excel.reason'), t('admin.reports.sales.orders'), t('admin.reports.excel.share')],
      r.orders.cancelReasons.map((x) => [reason(x.reason), x.orders, percent(x.share)]),
      [28, 10, 10],
    ),
  );

  const weekdays = Array.from({ length: 7 }, (_, d) => new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 4 + d))));
  sheets.push(
    sheet(
      t('admin.reports.orders.heatmap'),
      ['', ...Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)],
      r.orders.heatmap.map((hours, d) => [weekdays[d], ...hours]),
      [12, ...Array(24).fill(6)],
    ),
  );

  sheets.push(
    sheet(
      t('admin.reports.orders.areas'),
      [t('admin.area'), t('admin.reports.excel.block'), t('admin.reports.sales.orders'), t('admin.reports.sales.revenue')],
      [...r.orders.areas.map((a) => [a.area, null, a.orders, money(a.revenue)]), ...r.orders.blocks.map((b) => [b.area, b.block, b.orders, money(b.revenue)])],
      [24, 10, 10, 14],
    ),
  );

  const itemRows = (list) => list.map((i) => [i.nameEn, i.nameAr || null, i.quantity, money(i.revenue)]);
  const itemHeader = [t('admin.reports.excel.item'), t('admin.reports.excel.itemAr'), t('admin.reports.excel.quantity'), t('admin.reports.sales.revenue')];
  sheets.push(sheet(t('admin.reports.menu.topByQuantity'), itemHeader, itemRows(r.menu.topByQuantity), [32, 24, 10, 14]));
  sheets.push(sheet(t('admin.reports.menu.topByRevenue'), itemHeader, itemRows(r.menu.topByRevenue), [32, 24, 10, 14]));
  sheets.push(sheet(t('admin.reports.menu.slowMovers'), itemHeader, itemRows(r.menu.slowMovers), [32, 24, 10, 14]));
  sheets.push(sheet(t('admin.reports.menu.addons'), itemHeader, itemRows(r.menu.addons), [24, 20, 10, 14]));
  sheets.push(
    sheet(
      t('admin.reports.menu.categories'),
      [t('admin.reports.excel.category'), t('admin.reports.excel.quantity'), t('admin.reports.sales.revenue'), t('admin.reports.excel.share')],
      r.menu.categories.map((c) => [c.nameEn, c.quantity, money(c.revenue), percent(c.share)]),
      [26, 10, 14, 10],
    ),
  );

  const people = (list) => list.map((c) => [c.name || null, c.phone, c.orders, money(c.spend), day(c.lastOrder || c.last)]);
  const peopleHeader = [t('admin.reports.customers.name'), t('admin.reports.customers.phone'), t('admin.reports.sales.orders'), t('admin.reports.customers.spend'), t('admin.reports.customers.lastOrder')];
  sheets.push(sheet(t('admin.reports.customers.topBySpend'), peopleHeader, people(r.customers.topBySpend), [22, 14, 10, 14, 18]));
  sheets.push(sheet(t('admin.reports.customers.topByOrders'), peopleHeader, people(r.customers.topByOrders), [22, 14, 10, 14, 18]));
  // The short label: the full one runs past Excel's 31-character sheet-name limit.
  sheets.push(sheet(t('admin.reports.customers.lapsedShort'), peopleHeader, people(r.customers.lapsed), [22, 14, 10, 14, 18]));

  sheets.push(
    sheet(
      t('admin.reports.payments.methods'),
      [t('admin.reports.excel.method'), t('admin.reports.sales.orders'), t('admin.reports.sales.revenue'), t('admin.reports.excel.share')],
      r.payments.methods.map((m) => [method(m.method), m.orders, money(m.revenue), percent(m.share)]),
      [20, 10, 14, 10],
    ),
  );

  sheets.push(
    sheet(
      t('admin.reports.marketing.promos'),
      [t('admin.reports.marketing.code'), t('admin.reports.sales.orders'), t('admin.reports.marketing.discount'), t('admin.reports.sales.revenue'), t('admin.reports.sales.averageOrder')],
      r.marketing.promos.map((p) => [p.code, p.orders, money(p.discount), money(p.revenue), money(p.averageOrder)]),
      [16, 10, 16, 14, 16],
    ),
  );

  sheets.push(
    sheet(
      t('admin.reports.marketing.sources'),
      [t('admin.reports.excel.source'), t('admin.reports.sales.orders'), t('admin.reports.sales.revenue'), t('admin.reports.excel.share')],
      r.marketing.sources.map((s) => [s.source, s.orders, money(s.revenue), percent(s.share)]),
      [20, 10, 14, 10],
    ),
  );

  sheets.push(
    sheet(
      t('admin.reports.operations.byBranch'),
      [t('admin.branch'), t('admin.reports.operations.prep'), t('admin.reports.operations.delivery'), t('admin.reports.operations.total'), t('admin.reports.operations.late')],
      r.operations.branches.map((b) => [nameOf(b), b.prep.average, b.delivery.average, b.total.average, b.late]),
      [24, 22, 22, 22, 12],
    ),
  );

  return sheets;
};

export const downloadWorkbook = async (sheets, fileName) => {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(sheets).toFile(fileName);
};

/** A short plain-text summary for WhatsApp — the owner forwards it wherever they like. */
export const summaryText = (report, { t, kwd, branchName, periodLabel, restaurantName, nameOf }) => {
  const r = report;
  const delta = (value) => (value === null || value === undefined ? '' : ` (${value > 0 ? '▲ +' : value < 0 ? '▼ ' : ''}${value}%)`);
  const lines = [
    `*${restaurantName} — ${periodLabel}*`,
    branchName ? `${t('admin.branch')}: ${branchName}` : null,
    '',
    `${t('admin.reports.sales.revenue')}: ${kwd(r.sales.revenue)}${delta(r.sales.revenueChange)}`,
    `${t('admin.reports.sales.orders')}: ${r.sales.orders}${delta(r.sales.ordersChange)}`,
    `${t('admin.reports.sales.averageOrder')}: ${kwd(r.sales.averageOrder)}`,
    `${t('admin.reports.orders.cancelled')}: ${r.orders.cancelled} (${r.orders.cancellationRate}%)`,
    `${t('admin.reports.customers.newCustomers')}: ${r.customers.newCustomers} · ${t('admin.reports.customers.returning')}: ${r.customers.returningCustomers}`,
    r.menu.topByQuantity[0] ? `${t('admin.reports.summary.topItem')}: ${r.menu.topByQuantity[0].nameEn} ×${r.menu.topByQuantity[0].quantity}` : null,
    r.sales.branches.length > 1 ? '' : null,
    ...(r.sales.branches.length > 1 ? r.sales.branches.map((b) => `• ${nameOf(b)}: ${kwd(b.revenue)} · ${b.orders}`) : []),
  ];
  return lines.filter((line) => line !== null).join('\n');
};
