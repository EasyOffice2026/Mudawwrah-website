/**
 * The daily closing sheet as an Excel workbook: every payment of the day to tick off against the Tap dashboard,
 * and the totals. Built from the same object the page shows, so the file and the screen always agree.
 */
const bold = (value) => ({ value, fontWeight: 'bold' });
const money = (value) => ({ value: Number(value) || 0, format: '#,##0.000' });

/** The time a payment was taken, in the restaurant's own time zone (HH:MM). */
export const paidTime = (value, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(value));

export const buildClosingWorkbook = (closing, { t, branchName, restaurantName, methodName, nameOf }) => {
  const payments = closing.payments.map((p, index) => [
    index + 1,
    paidTime(p.paidAt, closing.timeZone),
    p.orderNumber,
    nameOf(p.branch),
    methodName(p.method),
    p.reference || '',
    money(p.amount),
    p.refundNeeded ? t('admin.refundNeeded') : '',
  ]);
  const totals = [
    [bold(restaurantName), ''],
    [t('admin.closing.date'), closing.date],
    [t('admin.branch'), branchName],
    ['', ''],
    [bold(t('admin.closing.paidOnline')), money(closing.totals.total)],
    [t('admin.closing.payments'), closing.totals.count],
    ...Object.entries(closing.totals.byMethod).map(([method, row]) => [`${methodName(method)} (${row.count})`, money(row.total)]),
    ...(closing.totals.refundNeeded.count
      ? [
          [`${t('admin.refundNeeded')} (${closing.totals.refundNeeded.count})`, money(-closing.totals.refundNeeded.total)],
          [bold(t('admin.closing.net')), money(closing.totals.net)],
        ]
      : []),
    ...(closing.totals.byBranch.length > 1
      ? [['', ''], ...closing.totals.byBranch.map((b) => [`${nameOf(b.branch)} (${b.count})`, money(b.total)])]
      : []),
    ...(closing.notPaidOnline.count
      ? [['', ''], [`${t('admin.closing.notPaidOnline')} (${closing.notPaidOnline.count})`, money(closing.notPaidOnline.total)]]
      : []),
  ];
  return [
    {
      sheet: t('admin.closing.payments').slice(0, 31),
      data: [
        ['#', t('admin.closing.time'), t('admin.closing.order'), t('admin.branch'), t('admin.closing.method'), t('admin.closing.reference'), t('admin.closing.amount'), ''].map(bold),
        ...payments,
      ],
      columns: [6, 8, 20, 18, 12, 30, 12, 16].map((width) => ({ width })),
      stickyRowsCount: 1,
    },
    { sheet: t('admin.closing.totals').slice(0, 31), data: totals, columns: [{ width: 32 }, { width: 16 }] },
  ];
};
