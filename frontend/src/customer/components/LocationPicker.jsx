import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SheetShell from './SheetShell.jsx';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
// Kuwait City, used until the customer's own position or pin says otherwise.
const DEFAULT_CENTRE = { lat: 29.3759, lng: 47.9774 };

/** Loads the Maps JS SDK once per page, shared by every mount. */
let mapsPromise = null;
const loadMaps = () => {
  if (!MAPS_KEY) return Promise.reject(new Error('no-key'));
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=marker`;
    script.async = true;
    script.onload = () => (window.google?.maps ? resolve(window.google.maps) : reject(new Error('maps-failed')));
    script.onerror = () => reject(new Error('maps-failed'));
    document.head.appendChild(script);
  });
  return mapsPromise;
};

/**
 * "Confirm location" step: the customer drops a pin where the order should go,
 * then continues into the address form.
 *
 * The map needs a billed Google Maps key. Without `VITE_GOOGLE_MAPS_API_KEY`
 * the screen degrades to an area picker rather than breaking checkout, so the
 * flow is usable before the key exists and lights up once it is set.
 */
export default function LocationPicker({ open, areas = [], onClose, onConfirm }) {
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const [centre, setCentre] = useState(DEFAULT_CENTRE);
  const [mapState, setMapState] = useState(MAPS_KEY ? 'loading' : 'unavailable');
  const [area, setArea] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  useEffect(() => {
    if (!open || !MAPS_KEY) return;
    let map;
    let cancelled = false;
    loadMaps()
      .then((maps) => {
        if (cancelled || !mapRef.current) return;
        map = new maps.Map(mapRef.current, {
          center: centre,
          zoom: 15,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
        });
        // The pin is fixed to the centre of the viewport; panning the map is
        // what moves it, which is far steadier on a phone than dragging a
        // marker under your own thumb.
        map.addListener('idle', () => {
          const c = map.getCenter();
          setCentre({ lat: c.lat(), lng: c.lng() });
        });
        setMapState('ready');
      })
      .catch(() => !cancelled && setMapState('unavailable'));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return setGeoError(t('checkout.locationDenied'));
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentre({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setGeoError(t('checkout.locationDenied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  if (!open) return null;

  const mapReady = mapState === 'ready';
  // Without a map the area choice is the only signal we have, so require it.
  const canContinue = mapReady || Boolean(area);

  return (
    <SheetShell onBackdropClick={onClose} label={t('checkout.confirmLocation')}>
      <header className="flex items-center gap-3 border-b border-hairline bg-white px-3 py-3">
        <button type="button" onClick={onClose} aria-label={t('common.back')} className="icon-orb shadow-none">
          <span className="rtl:rotate-180">←</span>
        </button>
        <h2 className="text-base font-extrabold">{t('checkout.confirmLocation')}</h2>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        {mapState === 'unavailable' ? (
          <div className="px-4 pt-5">
            <p className="rounded-xl bg-surface px-3 py-2.5 text-xs text-ink-soft">{t('checkout.mapUnavailable')}</p>
            <h3 className="mt-5 text-[15px] font-extrabold">{t('checkout.selectArea')}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {areas.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setArea(name)}
                  className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition active:scale-95 ${
                    area === name ? 'border-brand bg-brand-light text-brand' : 'border-hairline bg-white'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative h-full min-h-[320px]">
            <div ref={mapRef} className="absolute inset-0 bg-hairline" />
            {mapState === 'loading' ? <div className="skeleton absolute inset-0" /> : null}

            {/* Centre pin and its tooltip, floating above the map. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="mb-2 rounded-lg bg-ink/85 px-3 py-1.5 text-xs font-semibold text-white">
                {t('checkout.deliverHere')}
              </span>
              <span className="text-4xl leading-none drop-shadow" aria-hidden>
                📍
              </span>
            </div>

            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="absolute end-3 top-3 rounded-full bg-white px-3.5 py-2.5 text-xs font-bold shadow-lift transition active:scale-95"
            >
              {locating ? t('checkout.locating') : t('checkout.useMyLocation')}
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-hairline bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {geoError ? <p className="mb-2 text-center text-xs font-semibold text-brand">{geoError}</p> : null}
        <button
          type="button"
          className="btn-primary w-full py-4"
          disabled={!canContinue}
          onClick={() => onConfirm({ area, lat: centre.lat, lng: centre.lng })}
        >
          {t('checkout.enterAddress')}
        </button>
      </div>
    </SheetShell>
  );
}
