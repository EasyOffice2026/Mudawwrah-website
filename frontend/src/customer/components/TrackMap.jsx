import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

// Drawn with text and CSS rather than Leaflet's own marker pictures, which need image files a bundler moves.
const pin = (emoji, tone, label) =>
  L.divIcon({
    className: '',
    html: `<div role="img" aria-label="${label}" style="width:40px;height:40px;border-radius:9999px;background:${tone};display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,.35);border:3px solid #fff">${emoji}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

/**
 * The live map on the customer's tracking page: the driver and where the order is going, on OpenStreetMap (free, no
 * key). The driver's marker moves as new positions arrive; the view is fitted once to show both points, and again
 * only if the driver leaves it, so the map does not jump around under a customer who has zoomed or moved it.
 */
export default function TrackMap({ driver, destination, labels }) {
  const node = useRef(null);
  const map = useRef(null);
  const marks = useRef({});
  const fitted = useRef(false);

  useEffect(() => {
    map.current = L.map(node.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    return () => {
      map.current.remove();
      map.current = null;
      marks.current = {};
      fitted.current = false;
    };
  }, []);

  const driverLat = driver?.lat;
  const driverLng = driver?.lng;
  const destLat = destination?.lat;
  const destLng = destination?.lng;

  useEffect(() => {
    if (!map.current) return;
    const place = (name, lat, lng, icon) => {
      if (lat == null || lng == null) {
        marks.current[name]?.remove();
        delete marks.current[name];
        return;
      }
      if (marks.current[name]) marks.current[name].setLatLng([lat, lng]);
      else marks.current[name] = L.marker([lat, lng], { icon, keyboard: false, title: name === 'driver' ? labels.driver : labels.you }).addTo(map.current);
    };
    place('destination', destLat, destLng, pin('🏠', '#16a34a', labels.you));
    place('driver', driverLat, driverLng, pin('🛵', '#2563eb', labels.driver));

    const points = [
      driverLat != null ? [driverLat, driverLng] : null,
      destLat != null ? [destLat, destLng] : null,
    ].filter(Boolean);
    if (!points.length) return;
    // Only asked once the map has a view at all: before the first fit it has no bounds to compare with.
    const outOfView = fitted.current && driverLat != null && !map.current.getBounds().pad(-0.1).contains([driverLat, driverLng]);
    if (!fitted.current || outOfView) {
      if (points.length === 1) map.current.setView(points[0], 15);
      else map.current.fitBounds(points, { padding: [48, 48], maxZoom: 16 });
      fitted.current = true;
    }
  }, [driverLat, driverLng, destLat, destLng, labels.driver, labels.you]);

  return <div ref={node} className="h-72 w-full overflow-hidden rounded-2xl sm:h-96" data-testid="track-map" />;
}
