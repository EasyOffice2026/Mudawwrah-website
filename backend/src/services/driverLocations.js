/**
 * Where each driver is right now, while they are out on a delivery.
 *
 * Kept in this server's memory only: one position per driver, the latest, replaced by the next. Nothing is written
 * to the database, so there is no history of where a driver has been, and a position is forgotten when the delivery
 * ends, when it is a few minutes old, or when the server restarts (the driver's phone sends the next one seconds
 * later). The customer's tracking page and the order desk read from here.
 */

// A position older than this is not shown as "live": the phone lost signal, was switched off, or the app was closed.
export const FRESH_MS = 2 * 60_000;
// Forgotten entirely after this long without a new one.
const FORGET_MS = 30 * 60_000;

const latest = new Map();

const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/** A position as a phone reports it, checked: null unless it is a real point on the map. */
export const readPosition = (body, now = Date.now()) => {
  const lat = finite(body?.lat);
  const lng = finite(body?.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const accuracy = finite(body?.accuracy);
  const heading = finite(body?.heading);
  const speed = finite(body?.speed);
  // The phone's own clock says when the fix was taken; one that is far off is replaced by the server's.
  const taken = finite(body?.at) ?? Date.parse(body?.at);
  const at = Number.isFinite(taken) && Math.abs(now - taken) < 5 * 60_000 ? taken : now;
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    accuracy: accuracy !== null && accuracy >= 0 ? Math.round(accuracy) : null,
    heading: heading !== null && heading >= 0 && heading <= 360 ? Math.round(heading) : null,
    speed: speed !== null && speed >= 0 ? Number(speed.toFixed(1)) : null,
    at,
  };
};

export const remember = (tenantId, driverId, position, now = Date.now()) => {
  if (latest.size > 50) for (const [id, row] of latest) if (now - row.at > FORGET_MS) latest.delete(id);
  latest.set(driverId, { ...position, tenantId });
};

/** The driver's last position, whatever its age (with `fresh` saying whether it still counts as live), or null. */
export const lastKnown = (tenantId, driverId, now = Date.now()) => {
  const row = latest.get(driverId);
  if (!row || row.tenantId !== tenantId || now - row.at > FORGET_MS) return null;
  const { tenantId: _tenant, ...position } = row;
  return { ...position, fresh: now - row.at <= FRESH_MS };
};

/** The delivery is over (or the driver was taken off it): where they are is nobody's business any more. */
export const forget = (driverId) => latest.delete(driverId);
export const forgetAll = () => latest.clear();

const toRad = (degrees) => (degrees * Math.PI) / 180;

/** Kilometres between two points, in a straight line. */
export const distanceKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

// Roads are longer than the straight line, and a city delivery averages about this speed door to door.
const ROAD_FACTOR = 1.4;
const CITY_KMH = 30;

/**
 * About how many minutes until the driver arrives: an estimate from the distance left, not a promise. There is no
 * traffic or route in it, so it is rounded up and never says less than a minute.
 */
export const etaMinutes = (from, to) => {
  if (!from || !to) return null;
  const minutes = ((distanceKm(from, to) * ROAD_FACTOR) / CITY_KMH) * 60;
  return Math.max(1, Math.ceil(minutes));
};

/**
 * A phone number reduced to what identifies it in Kuwait: its last eight digits. "+965 5000 1111", "0096550001111"
 * and "50001111" are the same driver. A number from elsewhere keeps all its digits.
 */
export const phoneKey = (phone) => {
  const digits = String(phone ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^0-9]/g, '')
    .replace(/^00/, '');
  return digits.length === 11 && digits.startsWith('965') ? digits.slice(3) : digits;
};
