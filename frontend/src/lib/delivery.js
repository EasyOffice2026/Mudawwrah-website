/**
 * The small rules of the driver page and the customer's tracking page, kept out of the pages so each can be tested.
 */

// How often the driver page asks for its orders, and how often a phone reports where it is while one is out.
export const DRIVER_POLL_MS = 10_000;
export const LOCATION_EVERY_MS = 5_000;
// The customer's tracking page: unhurried until the order leaves, then close to live.
export const TRACK_POLL_MS = 20_000;
export const TRACK_LIVE_POLL_MS = 5_000;

const OUT = ['OUT_FOR_DELIVERY', 'REACHED'];
export const isOut = (order) => OUT.includes(order?.status);

/** Where an order is, as a driver needs to know it: still in the kitchen, ready to collect, or on the way. */
export const driverStage = (order) => (isOut(order) ? 'out' : order?.status === 'READY' ? 'ready' : 'waiting');

/** What the driver must take at the door: nothing when it was paid online, otherwise the order's total. */
export const amountToCollect = (order) => (order?.paymentStatus === 'PAID' ? 0 : Number(order?.total || 0));

/** Opens the phone's own maps app with directions to the customer's pin, or to the written address without one. */
export const directionsUrl = (order) => {
  const pinned = order.deliveryLat != null && order.deliveryLng != null;
  const destination = pinned
    ? `${order.deliveryLat},${order.deliveryLng}`
    : [order.address, order.area, 'Kuwait'].filter(Boolean).join(', ');
  return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving` : null;
};

/** A Kuwaiti number as a tel: link, whether it was saved with the country code or without. */
export const telUrl = (phone) => {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `tel:+${digits.length === 8 ? `965${digits}` : digits}`;
};

/** Orders that appeared on the driver's list since the last check (their ids), for the "new delivery" sound. */
export const newlyAssigned = (before, after) => {
  if (!before) return [];
  const known = new Set(before.map((order) => order.id));
  return after.filter((order) => !known.has(order.id)).map((order) => order.id);
};

/** How often the tracking page should ask again, given what it last heard. */
export const trackPollMs = (order) => {
  if (!order) return TRACK_POLL_MS;
  if (['DELIVERED', 'CANCELLED'].includes(order.status)) return null;
  return isOut(order) ? TRACK_LIVE_POLL_MS : TRACK_POLL_MS;
};

/** The map's two points, when the tracking page has anything to draw. */
export const mapPoints = (delivery) => {
  const point = (p) => (p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) ? { lat: Number(p.lat), lng: Number(p.lng) } : null);
  const driver = point(delivery?.location);
  const destination = point(delivery?.destination);
  return driver || destination ? { driver, destination } : null;
};
