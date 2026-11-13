import { useEffect, useRef, useState } from 'react';
import { LOCATION_EVERY_MS } from './delivery';
import { driverApi, trackingTarget } from './driverApi';

/** Whether the page runs inside our Android driver app (driver-app/ in this repository). */
export const hasDriverApp = () => typeof window !== 'undefined' && Boolean(window.DriverApp);

const appStatus = () => {
  try {
    return window.DriverApp.status();
  } catch {
    return 'error';
  }
};

/**
 * Reports where the driver's phone is, only while `active` (an order is out for delivery).
 *
 * In our Android app the app does it: it is handed the server's address and the driver's token and keeps reporting
 * with the screen locked, which a web page cannot. In a browser the page does it itself for as long as it stays
 * open and on screen. Either way the last known position is sent again every few seconds while standing still, so
 * the customer's map never shows a driver as lost just because they stopped at a light.
 *
 * Returns "off" (nothing out), "on", "denied" (location not allowed or switched off) or "unavailable".
 */
export function useDriverLocation(active, onStopped) {
  const [state, setState] = useState('off');
  const stopped = useRef(onStopped);
  useEffect(() => {
    stopped.current = onStopped;
  }, [onStopped]);

  useEffect(() => {
    if (!active) {
      setState('off');
      if (hasDriverApp()) {
        try {
          window.DriverApp.stopTracking();
        } catch {
          // An older app without it simply keeps its own state.
        }
      }
      return undefined;
    }

    if (hasDriverApp()) {
      // Handed over again on every check: it is harmless, restarts the app's reporting if Android stopped it, and
      // gives it the renewed token after the old one ran out.
      const hand = () => {
        try {
          window.DriverApp.startTracking(JSON.stringify({ ...trackingTarget(), everyMs: LOCATION_EVERY_MS }));
        } catch {
          setState('unavailable');
          return;
        }
        const status = appStatus();
        setState(status === 'tracking' || status === 'starting' ? 'on' : status === 'error' || status === 'idle' ? 'unavailable' : 'denied');
      };
      hand();
      const timer = setInterval(hand, 15_000);
      return () => clearInterval(timer);
    }

    if (!navigator.geolocation) {
      setState('unavailable');
      return undefined;
    }

    let last = null;
    let sentAt = 0;
    let busy = false;
    let over = false;
    const send = async () => {
      if (!last || busy || over) return;
      busy = true;
      sentAt = Date.now();
      try {
        const { data } = await driverApi.post('/driver/location', last);
        // The server says nothing is out any more (delivered from the order desk, or taken off this driver).
        if (data?.tracking === false) stopped.current?.();
      } catch {
        // No signal for a moment: the next position goes out with the next try.
      } finally {
        busy = false;
      }
    };
    const watch = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        last = {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          heading: Number.isFinite(coords.heading) ? coords.heading : null,
          speed: Number.isFinite(coords.speed) ? coords.speed : null,
          at: timestamp,
        };
        setState('on');
        if (Date.now() - sentAt >= LOCATION_EVERY_MS) send();
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    );
    // Standing still, the phone reports nothing new: say "still here" so the position stays live.
    const timer = setInterval(() => {
      if (!last || Date.now() - sentAt < LOCATION_EVERY_MS * 3) return;
      last = { ...last, at: Date.now() };
      send();
    }, LOCATION_EVERY_MS);
    return () => {
      over = true;
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
    };
  }, [active]);

  return state;
}
