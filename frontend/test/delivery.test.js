import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  amountToCollect,
  directionsUrl,
  driverStage,
  isOut,
  mapPoints,
  newlyAssigned,
  telUrl,
  TRACK_LIVE_POLL_MS,
  TRACK_POLL_MS,
  trackPollMs,
} from '../src/lib/delivery.js';

test('a driver sees an order as being prepared, ready to collect, or on the way', () => {
  assert.equal(driverStage({ status: 'CONFIRMED' }), 'waiting');
  assert.equal(driverStage({ status: 'PREPARING' }), 'waiting');
  assert.equal(driverStage({ status: 'READY' }), 'ready');
  assert.equal(driverStage({ status: 'OUT_FOR_DELIVERY' }), 'out');
  assert.equal(driverStage({ status: 'REACHED' }), 'out');
  assert.equal(isOut({ status: 'READY' }), false);
});

test('the driver collects the total unless the order was paid online', () => {
  assert.equal(amountToCollect({ paymentStatus: 'UNPAID', total: 3.5 }), 3.5);
  assert.equal(amountToCollect({ paymentStatus: 'FAILED', total: '2.250' }), 2.25);
  assert.equal(amountToCollect({ paymentStatus: 'PAID', total: 3.5 }), 0);
});

test("directions go to the customer's pin, or to the written address when there is none", () => {
  assert.equal(
    directionsUrl({ deliveryLat: 29.3375, deliveryLng: 47.6581, address: 'x' }),
    'https://www.google.com/maps/dir/?api=1&destination=29.3375%2C47.6581&travelmode=driving',
  );
  assert.match(directionsUrl({ address: 'House 5', area: 'Jahra' }), /destination=House%205%2C%20Jahra%2C%20Kuwait/);
  assert.match(directionsUrl({ deliveryLat: null, deliveryLng: null, area: 'Jahra' }), /destination=Jahra%2C%20Kuwait/);
});

test('the customer is called on a full number, however it was saved', () => {
  assert.equal(telUrl('50001111'), 'tel:+96550001111');
  assert.equal(telUrl('+965 5000 1111'), 'tel:+96550001111');
  assert.equal(telUrl(''), null);
});

test('the phone rings for a delivery that was not on the list before, never on the first load', () => {
  const before = [{ id: 'a' }];
  assert.deepEqual(newlyAssigned(null, [{ id: 'a' }]), []);
  assert.deepEqual(newlyAssigned(before, [{ id: 'a' }, { id: 'b' }]), ['b']);
  assert.deepEqual(newlyAssigned(before, [{ id: 'a' }]), []);
  assert.deepEqual(newlyAssigned(before, []), []);
});

test('the tracking page asks every 20 seconds, every 5 while the order is on its way, and stops when it is over', () => {
  assert.equal(trackPollMs(null), TRACK_POLL_MS);
  assert.equal(trackPollMs({ status: 'PREPARING' }), TRACK_POLL_MS);
  assert.equal(trackPollMs({ status: 'OUT_FOR_DELIVERY' }), TRACK_LIVE_POLL_MS);
  assert.equal(trackPollMs({ status: 'DELIVERED' }), null);
  assert.equal(trackPollMs({ status: 'CANCELLED' }), null);
});

test('the map is drawn with whatever points there are, and not at all with none', () => {
  assert.equal(mapPoints(null), null);
  assert.equal(mapPoints({ location: null, destination: null }), null);
  assert.deepEqual(mapPoints({ location: null, destination: { lat: 29.3, lng: 47.6 } }), { driver: null, destination: { lat: 29.3, lng: 47.6 } });
  assert.deepEqual(mapPoints({ location: { lat: '29.4', lng: '47.9', heading: 90 }, destination: null }), { driver: { lat: 29.4, lng: 47.9 }, destination: null });
});
