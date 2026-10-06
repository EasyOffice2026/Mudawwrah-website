import { dayKey, isSingleDay, zonedParts } from './reportRange.js';

/**
 * Every Reports figure, computed from plain data — no database in here, so
 * each rule can be tested with a handful of hand-made orders.
 *
 * Conventions used throughout:
 * - Revenue is order totals (what the customer pays: items, delivery, fees,
 *   less discounts) over orders that were not cancelled.
 * - "Orders" means placed and not cancelled, unless a figure says otherwise.
 * - Times are read in the restaurant's timezone.
 */

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const round3 = (n) => Math.round(n * 1000) / 1000;
const round1 = (n) => Math.round(n * 10) / 10;
const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);
const money = (order) => Number(order.total) || 0;
const live = (order) => order.status !== 'CANCELLED';
const OPEN = new Set(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'REACHED']);

/** Percentage change from `before` to `now`, or null when there is nothing to compare with. */
export const change = (now, before) => (before ? round1(((now - before) / before) * 100) : null);
const pct = (part, whole) => (whole ? round1((part / whole) * 100) : 0);

/**
 * A customer's phone in one form, so "+965 9988 7766", "96599887766" and
 * "99887766" are the same person. Anything that isn't a plausible 8-digit
 * Kuwaiti number (test entries, typos) returns null and is left out of the
 * customer figures rather than counted as a stranger.
 */
export const normalisePhone = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('00965')) digits = digits.slice(5);
  if (digits.length === 11 && digits.startsWith('965')) digits = digits.slice(3);
  return /^[124569]\d{7}$/.test(digits) ? digits : null;
};

const SOURCES = [
  [/instagram|^ig$/, 'Instagram'],
  [/facebook|^fb$|fb\.com/, 'Facebook'],
  [/tiktok/, 'TikTok'],
  [/snapchat|^snap$/, 'Snapchat'],
  [/google/, 'Google'],
  [/whatsapp|wa\.me|^wa$/, 'WhatsApp'],
  [/twitter|t\.co|^x$|x\.com/, 'X (Twitter)'],
];

/**
 * Where an order came from: the utm_source on the link if there was one, else
 * the site that referred the visitor, else Direct. l.instagram.com and "ig"
 * are both Instagram.
 */
export const trafficSource = (order) => {
  const tag = String(order.utmSource || '').trim().toLowerCase();
  let host = '';
  try {
    host = order.referrer ? new URL(order.referrer).hostname.toLowerCase() : '';
  } catch {
    host = String(order.referrer || '').toLowerCase();
  }
  const probe = tag || host;
  if (!probe) return 'Direct';
  for (const [pattern, name] of SOURCES) if (pattern.test(probe)) return name;
  if (tag) return tag.charAt(0).toUpperCase() + tag.slice(1);
  return host.replace(/^www\./, '') || 'Direct';
};

const minutesBetween = (a, b) => (a && b ? (new Date(b) - new Date(a)) / MIN : null);
const average = (values) => (values.length ? round1(sum(values, (v) => v) / values.length) : null);
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
};

/** Kitchen time: placed → out for delivery (delivery) or → ready (pickup). */
const prepMinutes = (o) => minutesBetween(o.createdAt, o.orderType === 'PICKUP' ? o.readyAt : o.outForDeliveryAt);
/** Rider time: out for delivery → delivered. */
const deliveryMinutes = (o) => (o.orderType === 'PICKUP' ? null : minutesBetween(o.outForDeliveryAt, o.deliveredAt));
/** Placed → delivered (or collected). */
const totalMinutes = (o) => minutesBetween(o.createdAt, o.deliveredAt);

const timing = (orders) => {
  const prep = orders.map(prepMinutes).filter((m) => m !== null && m >= 0);
  const ride = orders.map(deliveryMinutes).filter((m) => m !== null && m >= 0);
  const total = orders.map(totalMinutes).filter((m) => m !== null && m >= 0);
  return {
    prep: { average: average(prep), median: median(prep), orders: prep.length },
    delivery: { average: average(ride), median: median(ride), orders: ride.length },
    total: { average: average(total), median: median(total), orders: total.length },
  };
};

const totals = (orders) => {
  const kept = orders.filter(live);
  const revenue = round3(sum(kept, money));
  return { revenue, orders: kept.length, averageOrder: kept.length ? round3(revenue / kept.length) : 0 };
};

/* --------------------------------------------------------------------- sales */

const salesSection = ({ range, orders, prevOrders, branches }) => {
  const now = totals(orders);
  const before = totals(prevOrders);
  const hourly = isSingleDay(range);
  const tz = range.timeZone;

  // Every bucket in the window, empty ones included, so the chart has no gaps.
  const series = new Map();
  if (hourly) for (let h = 0; h < 24; h += 1) series.set(String(h).padStart(2, '0'), { key: String(h).padStart(2, '0'), revenue: 0, orders: 0 });
  else
    for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY) {
      const key = dayKey(new Date(t + 12 * 3600 * 1000), tz);
      if (!series.has(key)) series.set(key, { key, revenue: 0, orders: 0 });
    }
  for (const order of orders.filter(live)) {
    const key = hourly ? String(zonedParts(new Date(order.createdAt), tz).hour).padStart(2, '0') : dayKey(new Date(order.createdAt), tz);
    const bucket = series.get(key) || { key, revenue: 0, orders: 0 };
    bucket.revenue = round3(bucket.revenue + money(order));
    bucket.orders += 1;
    series.set(key, bucket);
  }

  // Branches side by side, each against its own previous period.
  const byBranch = new Map();
  const row = (id) => {
    if (!byBranch.has(id)) {
      const branch = branches.find((b) => b.id === id);
      byBranch.set(id, { id: id || 'none', nameEn: branch?.nameEn || null, nameAr: branch?.nameAr || null, current: [], previous: [] });
    }
    return byBranch.get(id);
  };
  for (const branch of branches) row(branch.id);
  for (const order of orders) row(order.branchId || null).current.push(order);
  for (const order of prevOrders) row(order.branchId || null).previous.push(order);

  const branchRows = [...byBranch.values()]
    .filter((b) => b.id !== 'none' || b.current.length || b.previous.length)
    .map(({ current, previous, ...b }) => {
      const t = totals(current);
      const p = totals(previous);
      const cancelled = current.length - t.orders;
      return {
        ...b,
        ...t,
        cancelled,
        cancellationRate: pct(cancelled, current.length),
        previousRevenue: p.revenue,
        revenueChange: change(t.revenue, p.revenue),
        ordersChange: change(t.orders, p.orders),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    ...now,
    previous: before,
    revenueChange: change(now.revenue, before.revenue),
    ordersChange: change(now.orders, before.orders),
    averageOrderChange: change(now.averageOrder, before.averageOrder),
    series: { unit: hourly ? 'hour' : 'day', points: [...series.values()] },
    branches: branchRows,
  };
};

/* -------------------------------------------------------------------- orders */

const ordersSection = ({ range, orders, prevOrders }) => {
  const count = (list, test) => list.filter(test).length;
  const placed = orders.length;
  const cancelled = count(orders, (o) => o.status === 'CANCELLED');
  const completed = count(orders, (o) => o.status === 'DELIVERED');
  const open = count(orders, (o) => OPEN.has(o.status));
  const byStatus = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;

  const reasons = {};
  for (const o of orders.filter((x) => x.status === 'CANCELLED')) {
    const key = o.cancelReason || 'UNSPECIFIED';
    reasons[key] = (reasons[key] || 0) + 1;
  }

  // Busiest times: weekday (0 = Sunday) by hour, from orders not cancelled.
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const o of orders.filter(live)) {
    const p = zonedParts(new Date(o.createdAt), range.timeZone);
    heatmap[p.weekday][p.hour] += 1;
  }
  let peak = null;
  heatmap.forEach((hours, day) =>
    hours.forEach((n, hour) => {
      if (n && (!peak || n > peak.orders)) peak = { day, hour, orders: n };
    }),
  );

  // Where customers are: the delivery zone when one matched, else the area typed.
  const areas = new Map();
  const blocks = new Map();
  let unknownArea = 0;
  for (const o of orders.filter((x) => live(x) && x.orderType !== 'PICKUP')) {
    const area = o.zone?.nameEn || (o.area ? String(o.area).trim() : '');
    if (!area) {
      unknownArea += 1;
      continue;
    }
    const a = areas.get(area) || { area, areaAr: o.zone?.nameAr || null, orders: 0, revenue: 0 };
    a.orders += 1;
    a.revenue = round3(a.revenue + money(o));
    areas.set(area, a);
    if (o.block) {
      const key = `${area}|${String(o.block).trim()}`;
      const b = blocks.get(key) || { area, areaAr: o.zone?.nameAr || null, block: String(o.block).trim(), orders: 0, revenue: 0 };
      b.orders += 1;
      b.revenue = round3(b.revenue + money(o));
      blocks.set(key, b);
    }
  }
  const byOrders = (a, b) => b.orders - a.orders || b.revenue - a.revenue;

  const previousPlaced = prevOrders.length;
  const previousCancelled = count(prevOrders, (o) => o.status === 'CANCELLED');
  return {
    placed,
    completed,
    cancelled,
    open,
    byStatus,
    cancellationRate: pct(cancelled, placed),
    previousCancellationRate: pct(previousCancelled, previousPlaced),
    placedChange: change(placed, previousPlaced),
    cancelReasons: Object.entries(reasons)
      .map(([reason, n]) => ({ reason, orders: n, share: pct(n, cancelled) }))
      .sort((a, b) => b.orders - a.orders),
    heatmap,
    peak,
    areas: [...areas.values()].sort(byOrders).slice(0, 15),
    blocks: [...blocks.values()].sort(byOrders).slice(0, 15),
    areasWithoutLocation: unknownArea,
  };
};

/* ---------------------------------------------------------------------- menu */

/**
 * A product by name, not by menu row: the "Picks for you" section repeats some
 * products (Super MIX, Pepsi...) as separate rows, and every item carries its
 * own copy of add-ons like Extra cheese. To the owner each is one product.
 */
const productKey = (name) => String(name || '').trim().toLowerCase();

const menuSection = ({ range, orders, menuItems, categories }) => {
  const items = new Map();
  const addons = new Map();
  const categoryOf = new Map(menuItems.map((m) => [m.id, m.categoryId]));
  const byCategory = new Map(categories.map((c) => [c.id, { id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, quantity: 0, revenue: 0 }]));

  for (const order of orders.filter(live)) {
    for (const line of order.items || []) {
      const quantity = Number(line.quantity) || 0;
      const revenue = Number(line.lineTotal) || 0;
      const key = productKey(line.nameEn);
      const row = items.get(key) || { key, nameEn: line.nameEn, nameAr: line.nameAr || null, quantity: 0, revenue: 0, orders: 0 };
      row.quantity += quantity;
      row.revenue = round3(row.revenue + revenue);
      row.orders += 1;
      items.set(key, row);

      // Categories keep the menu section the sale came from, "Picks for you" included.
      const category = byCategory.get(categoryOf.get(line.menuItemId));
      if (category) {
        category.quantity += quantity;
        category.revenue = round3(category.revenue + revenue);
      }

      for (const option of Array.isArray(line.customizations) ? line.customizations : []) {
        const okey = productKey(option.nameEn);
        const a = addons.get(okey) || { key: okey, nameEn: option.nameEn, nameAr: option.nameAr || null, quantity: 0, revenue: 0 };
        // A choice on a line of three is three of that add-on.
        a.quantity += quantity;
        a.revenue = round3(a.revenue + (Number(option.extraPrice) || 0) * quantity);
        addons.set(okey, a);
      }
    }
  }

  const sold = [...items.values()];
  const categoryRows = [...byCategory.values()];
  const categoryRevenue = round3(sum(categoryRows, (c) => c.revenue));

  // Slow movers: products that sold least, unsold first, among those on sale
  // long enough to judge — a week, or the whole window if it's shorter — so an
  // item added yesterday isn't called slow. A product counts once however many
  // sections list it.
  const judgedFrom = new Date(range.to.getTime() - Math.min(range.to - range.from, 7 * DAY));
  const onSale = new Map();
  for (const m of menuItems) {
    if (!m.isAvailable || m.isOutOfStock || new Date(m.createdAt) > judgedFrom) continue;
    const key = productKey(m.nameEn);
    if (!onSale.has(key)) onSale.set(key, { key, nameEn: m.nameEn, nameAr: m.nameAr || null });
  }
  const slow = [...onSale.values()]
    .map((p) => ({ ...p, quantity: items.get(p.key)?.quantity || 0, revenue: items.get(p.key)?.revenue || 0 }))
    .sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue)
    .slice(0, 10);

  return {
    topByQuantity: [...sold].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10),
    topByRevenue: [...sold].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity).slice(0, 10),
    slowMovers: slow,
    addons: [...addons.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10),
    categories: categoryRows
      .filter((c) => c.quantity)
      .map((c) => ({ ...c, share: pct(c.revenue, categoryRevenue) }))
      .sort((a, b) => b.revenue - a.revenue),
  };
};

/* ----------------------------------------------------------------- customers */

/**
 * `history` is one row per phone (as stored) over all time and every branch:
 * { customerPhone, first, last, orders, spend }. Rows that normalise to the
 * same number are merged, so a customer who once typed +965 is still one person.
 */
const customersSection = ({ range, orders, history, now, lapsedNames }) => {
  const people = new Map();
  for (const h of history) {
    const phone = normalisePhone(h.customerPhone);
    if (!phone) continue;
    const p = people.get(phone) || { phone, first: h.first, last: h.last, orders: 0, spend: 0 };
    if (new Date(h.first) < new Date(p.first)) p.first = h.first;
    if (new Date(h.last) > new Date(p.last)) p.last = h.last;
    p.orders += h.orders;
    p.spend = round3(p.spend + (Number(h.spend) || 0));
    people.set(phone, p);
  }

  const inPeriod = new Map();
  let invalidPhones = 0;
  for (const order of orders.filter(live)) {
    const phone = normalisePhone(order.customerPhone);
    if (!phone) {
      invalidPhones += 1;
      continue;
    }
    const c = inPeriod.get(phone) || { phone, name: order.customerName, orders: 0, spend: 0, lastOrder: order.createdAt };
    c.orders += 1;
    c.spend = round3(c.spend + money(order));
    if (new Date(order.createdAt) >= new Date(c.lastOrder)) {
      c.lastOrder = order.createdAt;
      c.name = order.customerName || c.name;
    }
    inPeriod.set(phone, c);
  }

  let newCustomers = 0;
  let returning = 0;
  for (const phone of inPeriod.keys()) {
    const first = people.get(phone)?.first;
    if (first && new Date(first) < range.from) returning += 1;
    else newCustomers += 1;
  }

  const everyone = [...people.values()];
  const repeaters = everyone.filter((p) => p.orders >= 2).length;
  const cutoff = new Date(now.getTime() - 30 * DAY);
  const lapsed = everyone
    .filter((p) => new Date(p.last) < cutoff)
    .sort((a, b) => b.spend - a.spend)
    .map((p) => ({ ...p, name: lapsedNames.get(p.phone) || null }));

  const list = [...inPeriod.values()];
  return {
    customers: list.length,
    newCustomers,
    returningCustomers: returning,
    returningShare: pct(returning, list.length),
    repeatRate: pct(repeaters, everyone.length),
    customersEver: everyone.length,
    topByOrders: [...list].sort((a, b) => b.orders - a.orders || b.spend - a.spend).slice(0, 10),
    topBySpend: [...list].sort((a, b) => b.spend - a.spend || b.orders - a.orders).slice(0, 10),
    lapsedCount: lapsed.length,
    lapsed: lapsed.slice(0, 500),
    // History begins with the first order; until then nobody can be 30 days quiet.
    historyStarts: everyone.reduce((min, p) => (!min || new Date(p.first) < new Date(min) ? p.first : min), null),
    invalidPhones,
  };
};

/* ------------------------------------------------------------------ payments */

const paymentsSection = ({ orders, now, onlinePayments }) => {
  const kept = orders.filter(live);
  const revenue = sum(kept, money);
  const methods = new Map();
  for (const o of kept) {
    const m = methods.get(o.paymentMethod) || { method: o.paymentMethod, orders: 0, revenue: 0 };
    m.orders += 1;
    m.revenue = round3(m.revenue + money(o));
    methods.set(o.paymentMethod, m);
  }
  const failed = orders.filter((o) => o.paymentStatus === 'FAILED');
  // A payment link opened but not paid within 30 minutes is treated as abandoned.
  const abandoned = orders.filter((o) => o.paymentStatus === 'PENDING' && now - new Date(o.createdAt) > 30 * MIN);
  return {
    methods: [...methods.values()].map((m) => ({ ...m, share: pct(m.revenue, revenue) })).sort((a, b) => b.revenue - a.revenue),
    failed: { orders: failed.length, value: round3(sum(failed, money)) },
    abandoned: { orders: abandoned.length, value: round3(sum(abandoned, money)) },
    onlinePayments,
  };
};

/* ----------------------------------------------------------------- marketing */

/** The calendar day after a YYYYMMDD day, as YYYYMMDD. */
const nextDayKey = (key) => {
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8) + 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};

const marketingSection = ({ range, orders, visits, visitTrackingStart, branchFiltered }) => {
  const kept = orders.filter(live);
  const promos = new Map();
  for (const o of kept.filter((x) => x.promoCode)) {
    const code = String(o.promoCode).toUpperCase();
    const p = promos.get(code) || { code, orders: 0, discount: 0, revenue: 0 };
    p.orders += 1;
    p.discount = round3(p.discount + (Number(o.discount) || 0));
    p.revenue = round3(p.revenue + money(o));
    promos.set(code, p);
  }
  const sources = new Map();
  for (const o of kept) {
    const name = trafficSource(o);
    const s = sources.get(name) || { source: name, orders: 0, revenue: 0 };
    s.orders += 1;
    s.revenue = round3(s.revenue + money(o));
    sources.set(name, s);
  }
  const revenue = sum(kept, money);
  // Visit counting starts part-way through a day (whenever it went live), but
  // that day's earlier orders are already on the books — counting them would
  // push the rate past 100%. So both sides count from the first full day after
  // counting began: the restaurant's own start, not the start of this range.
  const start = visitTrackingStart || (visits.length ? visits.map((v) => v.day).sort()[0] : null);
  const trackedSince = start ? nextDayKey(start) : null;
  const counted = trackedSince ? visits.filter((v) => v.day >= trackedSince) : [];
  const webOrders = counted.length
    ? kept.filter((o) => o.channel === 'WEB' && dayKey(new Date(o.createdAt), range.timeZone).replace(/-/g, '') >= trackedSince).length
    : 0;
  const sessions = counted.reduce((n, v) => n + v.sessions, 0);
  return {
    promoOrderShare: pct(kept.filter((o) => o.promoCode).length, kept.length),
    promos: [...promos.values()].map((p) => ({ ...p, averageOrder: round3(p.revenue / p.orders) })).sort((a, b) => b.orders - a.orders),
    sources: [...sources.values()].map((s) => ({ ...s, share: pct(s.revenue, revenue) })).sort((a, b) => b.orders - a.orders),
    conversion: {
      // Visits aren't tied to a branch, so one branch's orders over everyone's
      // visits would be meaningless; the rate is only given for the restaurant.
      available: !branchFiltered,
      visits: sessions,
      orders: webOrders,
      rate: sessions && !branchFiltered ? round1((webOrders / sessions) * 100) : null,
      trackedSince,
    },
  };
};

/* ---------------------------------------------------------------- operations */

const operationsSection = ({ orders, branches, lateAfterMinutes }) => {
  const kept = orders.filter(live);
  // Late: a delivery that reached the customer more than the limit after it
  // was placed. Pickups are left out — their clock includes the customer's own
  // trip to the counter. Orders nobody moved past "Confirmed" can't be judged
  // either way, which is why trackedOrders is reported alongside.
  const isLate = (o) => {
    if (o.orderType === 'PICKUP') return false;
    const done = totalMinutes(o);
    return done !== null && done > lateAfterMinutes;
  };
  const deliveredDeliveries = kept.filter((o) => o.orderType !== 'PICKUP' && o.deliveredAt);
  const late = kept.filter(isLate);
  const stamped = kept.filter((o) => o.confirmedAt || o.preparingAt || o.readyAt || o.outForDeliveryAt || o.deliveredAt);

  const byBranch = branches
    .map((b) => {
      const mine = kept.filter((o) => o.branchId === b.id);
      return { id: b.id, nameEn: b.nameEn, nameAr: b.nameAr, ...timing(mine), late: mine.filter(isLate).length };
    })
    .filter((b) => b.prep.orders || b.delivery.orders || b.total.orders);

  return {
    lateAfterMinutes,
    ...timing(kept),
    late: late.length,
    lateShare: pct(late.length, deliveredDeliveries.length),
    trackedOrders: stamped.length,
    branches: byBranch,
  };
};

/**
 * The whole report. Inputs are already narrowed to the restaurant and, where a
 * branch was picked, to that branch — except `history`, which deliberately
 * covers every order ever so "new" and "returning" mean the same everywhere.
 */
export const computeReport = ({
  range,
  orders,
  prevOrders,
  history,
  lapsedNames = new Map(),
  menuItems,
  categories,
  branches,
  visits = [],
  visitTrackingStart = null,
  now = new Date(),
  lateAfterMinutes = 45,
  onlinePayments = false,
  branchFiltered = false,
}) => ({
  range: { preset: range.preset, from: range.from, to: range.to, prevFrom: range.prevFrom, prevTo: range.prevTo, timeZone: range.timeZone },
  sales: salesSection({ range, orders, prevOrders, branches }),
  orders: ordersSection({ range, orders, prevOrders }),
  menu: menuSection({ range, orders, menuItems, categories }),
  customers: customersSection({ range, orders, history, now, lapsedNames }),
  payments: paymentsSection({ orders, now, onlinePayments }),
  marketing: marketingSection({ range, orders, visits, visitTrackingStart, branchFiltered }),
  operations: operationsSection({ orders, branches, lateAfterMinutes }),
});
