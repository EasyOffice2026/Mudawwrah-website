/**
 * The small rules of the print station, kept out of the page so each can be tested.
 */

// A ticket that failed to print is tried again after this long, never in a tight loop.
export const RETRY_AFTER_MS = 30_000;

// `window.print()` returns at once when the browser prints silently (Chrome with --kiosk-printing). If it
// took longer than this, a print dialog was probably waiting for someone, which defeats automatic printing.
export const SILENT_PRINT_MS = 1500;

/** The waiting tickets this page still has to print: not already printed here, not failed a moment ago. */
export const pickJobs = (jobs, { done = new Set(), failedAt = new Map(), now = Date.now() } = {}) =>
  (jobs || []).filter((job) => !done.has(job.id) && !(failedAt.has(job.id) && now - failedAt.get(job.id) < RETRY_AFTER_MS));

/** The private page a branch computer keeps open. The key sits after the # so it is never sent to a server. */
export const stationUrl = (origin, slug, branchId, key) => `${origin}/r/${slug}/print/${branchId}#${key}`;

/** The Windows shortcut target that opens the station in its own window, printing without a dialog. */
export const chromeShortcut = (url) => `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="${url}"`;

/** A fake order for the "print a test ticket" button. */
export const testTicket = (now = new Date()) => ({
  id: 'test-ticket',
  orderNumber: 'TEST-0000',
  createdAt: now.toISOString(),
  orderType: 'DELIVERY',
  address: 'Block 1, Street 2, Building 3',
  area: 'Test area',
  customerName: 'Test customer',
  customerPhone: '00000000',
  items: [{ id: 'test-item', quantity: 1, nameEn: 'Test item', lineTotal: 1, customizations: [] }],
  subtotal: 1,
  deliveryFee: 0,
  serviceCharge: 0,
  discount: 0,
  tip: 0,
  total: 1,
  paymentMethod: 'TEST',
  paymentStatus: 'UNPAID',
  cutlery: false,
});
