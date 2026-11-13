import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as locations from '../src/services/driverLocations.js';

const now = Date.UTC(2026, 10, 13, 12, 0, 0);

test('a position is only taken when it is a real point on the map', () => {
  assert.deepEqual(locations.readPosition({ lat: '29.3759123', lng: 47.9774, accuracy: 12.4, heading: 90, speed: 8.33, at: now - 2000 }, now), {
    lat: 29.375912,
    lng: 47.9774,
    accuracy: 12,
    heading: 90,
    speed: 8.3,
    at: now - 2000,
  });
  for (const bad of [null, {}, { lat: 'x', lng: 1 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: 0, lng: 0 }]) {
    assert.equal(locations.readPosition(bad, now), null, JSON.stringify(bad));
  }
});

test("a phone whose clock is far off gets the server's time, so an old fix is never shown as live", () => {
  assert.equal(locations.readPosition({ lat: 29, lng: 48, at: now - 3 * 3600_000 }, now).at, now);
  assert.equal(locations.readPosition({ lat: 29, lng: 48 }, now).at, now);
  assert.equal(locations.readPosition({ lat: 29, lng: 48, at: new Date(now - 1000).toISOString() }, now).at, now - 1000);
});

test('only the latest position of a driver is kept, live for two minutes and gone when the delivery ends', () => {
  locations.forgetAll();
  locations.remember('t1', 'd1', locations.readPosition({ lat: 29.1, lng: 48.1 }, now), now);
  locations.remember('t1', 'd1', locations.readPosition({ lat: 29.2, lng: 48.2 }, now + 5000), now + 5000);
  const seen = locations.lastKnown('t1', 'd1', now + 6000);
  assert.equal(seen.lat, 29.2);
  assert.equal(seen.fresh, true);
  assert.equal(seen.tenantId, undefined);
  assert.equal(locations.lastKnown('t1', 'd1', now + 5000 + locations.FRESH_MS + 1).fresh, false, 'older than two minutes is not live');
  assert.equal(locations.lastKnown('t1', 'd1', now + 31 * 60_000), null, 'forgotten after half an hour');
  assert.equal(locations.lastKnown('other-restaurant', 'd1', now + 6000), null, "never shown to another restaurant's order");
  locations.forget('d1');
  assert.equal(locations.lastKnown('t1', 'd1', now + 6000), null);
});

test('the time left is an estimate from the distance, rounded up, never under a minute', () => {
  const kuwaitCity = { lat: 29.3759, lng: 47.9774 };
  const salmiya = { lat: 29.3339, lng: 48.0761 };
  const km = locations.distanceKm(kuwaitCity, salmiya);
  assert.ok(km > 10 && km < 11.5, String(km));
  assert.equal(locations.etaMinutes(kuwaitCity, salmiya), Math.ceil(((km * 1.4) / 30) * 60));
  assert.equal(locations.etaMinutes(kuwaitCity, kuwaitCity), 1);
  assert.equal(locations.etaMinutes(null, salmiya), null);
});

test('a driver signs in with the same number however it is written', () => {
  for (const typed of ['50001111', '+965 5000 1111', '0096550001111', '965-5000-1111', '٥٠٠٠١١١١']) {
    assert.equal(locations.phoneKey(typed), '50001111', typed);
  }
  assert.equal(locations.phoneKey(''), '');
  assert.equal(locations.phoneKey('+44 7700 900123'), '447700900123');
});
